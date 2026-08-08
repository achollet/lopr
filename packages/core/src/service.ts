import { buildContextSnapshot, reanchorComment } from './anchoring.js';
import { getDiffBetween, newFileProvider, resolveBranches } from './diff.js';
import type { GitGateway } from './gateway.js';
import {
  addComment,
  createReview,
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
  /** Omit to post a reply. */
  parentId?: string;
  file: string;
  line: number;
  body: string;
  suggestion?: CodeSuggestion;
}

export interface NewReviewCommand {
  id?: string;
  baseBranch?: string;
  headBranch?: string;
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

  async comment(input: CommentCommand): Promise<Review> {
    const review = await this.#load(input.reviewId);
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

    const comments = await Promise.all(
      review.comments.map(async (comment): Promise<ReviewComment> => {
        if (comment.parentId !== null || comment.origin === null || comment.origin.sha === head) return comment;
        const diff = await getDiffBetween(this.#gateway, { old: comment.origin.sha, new: head, cwd: this.#cwd });
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
}
