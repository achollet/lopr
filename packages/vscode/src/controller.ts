import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { CodeSuggestion, Review, ReviewComment, ReviewService } from '@lopr/core';
import { applySuggestion } from './applySuggestion.js';
import { diffViewFiles, type DiffViewFile } from './diffView.js';

/** State snapshot the webview renders. */
export interface ReviewState {
  id: string;
  baseBranch: string;
  headBranch: string;
  author: string;
  status: Review['status'];
  conflicts: Review['conflicts'];
  comments: ReviewComment[];
}

export type WebviewMessage =
  | { type: 'init'; reviewId: string }
  | { type: 'comment'; reviewId: string; file: string; line: number; body: string; replyTo?: string; suggestion?: CodeSuggestion }
  | { type: 'resolve'; reviewId: string; commentId: string }
  | { type: 'transition'; reviewId: string; status: 'approved' | 'request-changes' | 'done' | 'closed' }
  | { type: 'merge'; reviewId: string; cleanup: boolean }
  | { type: 'export'; reviewId: string }
  | { type: 'applySuggestion'; reviewId: string; commentId: string };

export type HostMessage =
  | { type: 'init'; payload: { review: ReviewState; diff: DiffViewFile[] } }
  | { type: 'update'; payload: { review: ReviewState } }
  | { type: 'exported'; path: string }
  | { type: 'error'; message: string };

export interface ControllerOptions {
  service: ReviewService;
  repoRoot: string;
}

function stateOf(review: Review): ReviewState {
  return {
    id: review.id,
    baseBranch: review.baseBranch,
    headBranch: review.headBranch,
    author: review.author,
    status: review.status,
    conflicts: review.conflicts,
    comments: review.comments,
  };
}

/** Pure of the vscode namespace: routes webview messages to the service. */
export class ReviewController {
  readonly #service: ReviewService;
  readonly #repoRoot: string;

  constructor(options: ControllerOptions) {
    this.#service = options.service;
    this.#repoRoot = options.repoRoot;
  }

  async handle(message: WebviewMessage): Promise<HostMessage> {
    try {
      return await this.#route(message);
    } catch (error) {
      return { type: 'error', message: (error as Error).message };
    }
  }

  async #route(message: WebviewMessage): Promise<HostMessage> {
    switch (message.type) {
      case 'init': {
        const review =
          message.reviewId === '(current branch)'
            ? await this.#service.resolveCurrent()
            : await this.#service.status(message.reviewId);
        const diff = await this.#service.diffForReview(review.id);
        return { type: 'init', payload: { review: stateOf(review), diff: diffViewFiles(diff.files) } };
      }
      case 'comment': {
        const review = await this.#service.comment({
          reviewId: message.reviewId,
          parentId: message.replyTo,
          file: message.replyTo ? undefined : message.file,
          line: message.replyTo ? undefined : message.line,
          body: message.body,
          suggestion: message.suggestion,
        });
        return { type: 'update', payload: { review: stateOf(review) } };
      }
      case 'resolve': {
        const review = await this.#service.resolve(message.reviewId, message.commentId);
        return { type: 'update', payload: { review: stateOf(review) } };
      }
      case 'transition': {
        const review = await this.#service.transition(message.reviewId, message.status);
        return { type: 'update', payload: { review: stateOf(review) } };
      }
      case 'merge': {
        const review = await this.#service.mergeReview(message.reviewId, {
          consent: true,
          cleanup: message.cleanup,
        });
        return {
          type: 'update',
          payload: { review: stateOf(review) },
        };
      }
      case 'export': {
        const markdown = await this.#service.exportReview(message.reviewId);
        const target = path.join(this.#repoRoot, 'REVIEW.md');
        await writeFile(target, markdown, 'utf8');
        return { type: 'exported', path: target };
      }
      case 'applySuggestion': {
        const review = await this.#service.status(message.reviewId);
        const comment = review.comments.find((c) => c.id === message.commentId);
        if (!comment) throw new Error(`comment ${message.commentId} not found`);
        if (!comment.suggestion) throw new Error('comment has no suggestion');
        if (!comment.file) throw new Error('comment has no file anchor');
        await applySuggestion(this.#repoRoot, comment.file, comment.line, comment.suggestion);
        const after = await this.#service.resolve(message.reviewId, message.commentId);
        return { type: 'update', payload: { review: stateOf(after) } };
      }
    }
  }
}
