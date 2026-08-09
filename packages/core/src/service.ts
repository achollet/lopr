import { buildContextSnapshot, reanchorComment } from './anchoring.js';
import { getDiffBetween, getThreeDotDiff, newFileProvider, resolveBranches } from './diff.js';
import type { FileDiff, ThreeDotDiff } from './types.js';
import { exportReviewMarkdown } from './export.js';
import type { GitGateway } from './gateway.js';
import {
  addComment,
  createReview,
  logConflict,
  resolveComment,
  transition as applyTransition,
  ReviewError,
} from './review.js';
import type { CodeSuggestion, Review, ReviewComment, ReviewStatus } from './review.js';
import { summaryOf, type ReviewStore, type ReviewSummary } from './store.js';

export interface ReviewServiceOptions {
  gateway: GitGateway;
  store: ReviewStore;
  author?: string;
  cwd?: string;
  now?: () => string;
}

export interface CommentCommand {
  reviewId: string;
  /** Set to post a reply; file/line are then ignored. */
  parentId?: string;
  file?: string;
  line?: number;
  body: string;
  suggestion?: CodeSuggestion;
}

export interface NewReviewCommand {
  id?: string;
  baseBranch?: string;
  headBranch?: string;
}

export interface MergeReviewOptions {
  /** Explicit user consent — required, the CLI/TUI ask the human first. */
  consent: boolean;
  /** Also delete the head branch and remove the review file after a successful merge. */
  cleanup?: boolean;
  now?: () => string;
}

/**
 * Command layer over the domain model. Pure of I/O except through the injected
 * gateway and store. Each command loads, validates, applies a model operation
 * and persists.
 */
export class ReviewService {
  readonly #gateway: GitGateway;
  readonly #store: ReviewStore;
  readonly #author: string;
  readonly #cwd: string;
  readonly #now: () => string;

  constructor(options: ReviewServiceOptions) {
    this.#gateway = options.gateway;
    this.#store = options.store;
    this.#author = options.author ?? 'human';
    this.#cwd = options.cwd ?? process.cwd();
    this.#now = options.now ?? (() => new Date().toISOString());
  }

  async #load(reviewId: string): Promise<Review> {
    const review = await this.#store.load(reviewId);
    if (review === null) throw new ReviewError(`no review: ${reviewId}`);
    return review;
  }

  async #headSha(headBranch: string): Promise<string> {
    return this.#gateway.revParse(headBranch, this.#cwd);
  }

  async newReview(input: NewReviewCommand = {}): Promise<Review> {
    const { base, head } = await resolveBranches(this.#gateway, {
      base: input.baseBranch,
      head: input.headBranch,
      cwd: this.#cwd,
    });
    const review = createReview({
      id: input.id,
      baseBranch: base,
      headBranch: head,
      author: this.#author,
      now: this.#now,
    });
    await this.#store.save(review);
    return review;
  }

  /**
   * The review for the current branch — the open one if it exists, otherwise
   * a new one. The surfaces (TUI, extension) call this to make "review this
   * branch" idempotent.
   */
  async resolveCurrent(input: NewReviewCommand = {}): Promise<Review> {
    const head = await this.#gateway.currentBranch(this.#cwd);
    const summaries = await this.#store.list();
    const open = summaries.find(
      (summary) =>
        summary.headBranch === head &&
        summary.status !== 'merged' &&
        summary.status !== 'done' &&
        summary.status !== 'closed',
    );
    if (open) return this.#load(open.id);
    return this.newReview(input);
  }

  async comment(input: CommentCommand): Promise<Review> {
    const review = await this.#load(input.reviewId);
    if (input.parentId !== undefined) {
      const updated = addComment(review, {
        parentId: input.parentId,
        body: input.body,
        author: this.#author,
        now: this.#now,
      });
      await this.#store.save(updated);
      return updated;
    }
    if (input.file === undefined || input.line === undefined) {
      throw new ReviewError('root comment requires a file and a line');
    }
    const head = await this.#headSha(review.headBranch);
    const lines = await newFileProvider(this.#gateway, head, this.#cwd)(input.file);
    if (lines === null) throw new ReviewError(`file not found at ${head}: ${input.file}`);
    const line = input.line;
    if (!Number.isInteger(line) || line < 1 || line > lines.length) {
      throw new ReviewError(`line ${line} is out of range for ${input.file} (${lines.length} lines)`);
    }
    const snapshot = buildContextSnapshot(lines, line);
    const updated = addComment(review, {
      parentId: input.parentId,
      file: input.file,
      line,
      origin: { sha: head, line },
      context: snapshot.context,
      contextAnchor: snapshot.contextAnchor,
      body: input.body,
      suggestion: input.suggestion,
      author: this.#author,
      now: this.#now,
    });
    await this.#store.save(updated);
    return updated;
  }

  async resolve(reviewId: string, commentId: string): Promise<Review> {
    const review = await this.#load(reviewId);
    const updated = resolveComment(review, commentId, { now: this.#now });
    await this.#store.save(updated);
    return updated;
  }

  async transition(reviewId: string, to: ReviewStatus): Promise<Review> {
    const review = await this.#load(reviewId);
    const updated = applyTransition(review, to, { now: this.#now });
    await this.#store.save(updated);
    return updated;
  }

  async approve(reviewId: string): Promise<Review> {
    return this.transition(reviewId, 'approved');
  }

  async requestChanges(reviewId: string): Promise<Review> {
    return this.transition(reviewId, 'request-changes');
  }

  async close(reviewId: string): Promise<Review> {
    return this.transition(reviewId, 'closed');
  }

  async done(reviewId: string): Promise<Review> {
    return this.transition(reviewId, 'done');
  }

  async status(reviewId: string): Promise<Review> {
    return this.#load(reviewId);
  }

  async list(): Promise<ReviewSummary[]> {
    return this.#store.list();
  }

  /**
   * Re-anchor every root comment from its creation point (origin sha/line) to
   * the current head of the reviewed branch. A comment is updated only when its
   * anchor actually moved; a successful re-anchor clears `detached`, a failed
   * one sets it. Replies follow their thread and are never re-anchored.
   */
  async reanchor(reviewId: string): Promise<Review> {
    const review = await this.#load(reviewId);
    const head = await this.#headSha(review.headBranch);
    const provider = newFileProvider(this.#gateway, head, this.#cwd);
    const diffCache = new Map<string, Promise<FileDiff[]>>();

    const cachedDiff = (originSha: string): Promise<FileDiff[]> => {
      let promise = diffCache.get(originSha);
      if (!promise) {
        promise = getDiffBetween(this.#gateway, { old: originSha, new: head, cwd: this.#cwd });
        diffCache.set(originSha, promise);
      }
      return promise;
    };

    const comments = await Promise.all(
      review.comments.map(async (comment): Promise<ReviewComment> => {
        if (comment.parentId !== null || comment.origin === null || comment.origin.sha === head) return comment;
        const diff = await cachedDiff(comment.origin.sha);
        const result = await reanchorComment(diff, provider, {
          file: comment.file ?? '',
          line: comment.origin.line,
          context: comment.context,
          contextAnchor: comment.contextAnchor,
        });
        if (result.status === 'detached') {
          return comment.status === 'detached' ? comment : { ...comment, status: 'detached' };
        }
        if (comment.status === 'active' && comment.file === result.file && comment.line === result.line) {
          return comment;
        }
        return { ...comment, file: result.file, line: result.line, status: 'active' };
      }),
    );

    const changed = comments.some((comment, index) => comment !== review.comments[index]);
    if (!changed) return review;
    const updated: Review = { ...review, comments, updatedAt: this.#now() };
    await this.#store.save(updated);
    return updated;
  }

  async summary(reviewId: string): Promise<ReviewSummary> {
    return summaryOf(await this.#load(reviewId));
  }

  /** Render the review as the stable REVIEW.md contract, for the CLI/TUI to write. */
  async exportReview(reviewId: string): Promise<string> {
    return exportReviewMarkdown(await this.#load(reviewId));
  }

  /** Three-dot diff of the reviewed branch, for the TUI to render. */
  async diffForReview(reviewId: string): Promise<ThreeDotDiff> {
    const review = await this.#load(reviewId);
    return getThreeDotDiff(this.#gateway, {
      base: review.baseBranch,
      head: review.headBranch,
      cwd: this.#cwd,
    });
  }

  /**
   * Merge the reviewed branch into its base with `--no-ff`. Requires consent and an
   * approved review. Conflicts are auto-resolved main-wins and each resolution is
   * journalised in the review before the merge commit is written.
   */
  async mergeReview(reviewId: string, options: MergeReviewOptions): Promise<Review> {
    const review = await this.#load(reviewId);
    if (review.status !== 'approved') throw new ReviewError(`cannot merge a ${review.status} review`);
    if (!options.consent) throw new ReviewError('merge consent required');
    const now = options.now ?? this.#now;

    if (await this.#gateway.isDirty(this.#cwd)) {
      throw new ReviewError('working tree has uncommitted changes; commit or stash before merging');
    }

    await this.#gateway.checkout(review.baseBranch, this.#cwd);
    const result = await this.#gateway.mergeNoCommit(review.headBranch, this.#cwd);

    let merged = review;
    if (!result.merged) {
      if (result.conflicts.length === 0) {
        await this.#gateway.abortMerge(this.#cwd).catch(() => undefined);
        throw new ReviewError(result.failure ?? 'merge failed without conflicts; aborted');
      }
      try {
        await this.#gateway.resolveOurs(result.conflicts, this.#cwd);
      } catch (err) {
        await this.#gateway.abortMerge(this.#cwd).catch(() => undefined);
        throw err;
      }
      for (const path of result.conflicts) {
        merged = logConflict(merged, path, { now });
      }
    }

    if (!result.upToDate) {
      await this.#gateway.commitAll(`merge branch '${review.headBranch}' into ${review.baseBranch}`, this.#cwd);
    }

    const final = applyTransition(merged, 'merged', { now });
    await this.#store.save(final);

    if (options.cleanup) {
      await this.#gateway.deleteBranch(review.headBranch, this.#cwd);
      await this.#store.remove(reviewId);
    }
    return final;
  }
}
