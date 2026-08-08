import { randomUUID } from 'node:crypto';

export type ReviewStatus =
  | 'open'
  | 'request-changes'
  | 'approved'
  | 'merged'
  | 'done'
  | 'closed';

export const REVIEW_SCHEMA_VERSION = 1;

export const REVIEW_TRANSITIONS: Record<ReviewStatus, readonly ReviewStatus[]> = {
  open: ['request-changes', 'approved', 'closed', 'done'],
  'request-changes': ['approved', 'closed', 'done'],
  approved: ['request-changes', 'merged', 'closed', 'done'],
  merged: ['done'],
  done: [],
  closed: ['open'],
};

export function isReviewStatus(value: unknown): value is ReviewStatus {
  return typeof value === 'string' && value in REVIEW_TRANSITIONS;
}

export type CommentStatus = 'active' | 'resolved' | 'detached';

export function isCommentStatus(value: unknown): value is CommentStatus {
  return value === 'active' || value === 'resolved' || value === 'detached';
}

export interface CommentOrigin {
  /** Commit sha the comment was written against. */
  sha: string;
  /** Old-side line in that commit. */
  line: number;
}

/** Inline suggestion "replace X by Y" — mandatory V1 capability. */
export interface CodeSuggestion {
  oldText: string;
  newText: string;
}

export interface ReviewComment {
  id: string;
  /** null = thread root; replies carry no anchors of their own. */
  parentId: string | null;
  /** Current path; null for replies. */
  file: string | null;
  /** Current line; null for replies and detached roots keep their last anchor. */
  line: number | null;
  /** Reserved — single-line anchors only in V1. */
  endLine: number | null;
  origin: CommentOrigin | null;
  /** Snapshot of surrounding lines, mandatory for the re-anchor fallback. */
  context: string[];
  /** Index of the anchored line within `context`. */
  contextAnchor: number;
  body: string;
  status: CommentStatus;
  suggestion: CodeSuggestion | null;
  author: string;
  createdAt: string;
  resolvedAt: string | null;
}

export interface StatusTransition {
  from: ReviewStatus | null;
  to: ReviewStatus;
  at: string;
}

export interface Review {
  version: typeof REVIEW_SCHEMA_VERSION;
  id: string;
  baseBranch: string;
  headBranch: string;
  author: string;
  status: ReviewStatus;
  statusLog: StatusTransition[];
  comments: ReviewComment[];
  createdAt: string;
  updatedAt: string;
}

export class ReviewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReviewError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function defaultNow(): string {
  return new Date().toISOString();
}

export interface NewReview {
  id?: string;
  baseBranch: string;
  headBranch: string;
  author?: string;
  now?: () => string;
}

export function createReview(input: NewReview): Review {
  if (input.baseBranch.trim() === '') throw new ReviewError('base branch is required');
  if (input.headBranch.trim() === '') throw new ReviewError('head branch is required');
  const now = input.now ?? defaultNow;
  const at = now();
  const status: ReviewStatus = 'open';
  return {
    version: REVIEW_SCHEMA_VERSION,
    id: input.id ?? randomUUID(),
    baseBranch: input.baseBranch,
    headBranch: input.headBranch,
    author: input.author ?? 'human',
    status,
    statusLog: [{ from: null, to: status, at }],
    comments: [],
    createdAt: at,
    updatedAt: at,
  };
}

export interface NewComment {
  id?: string;
  /** Set to post a reply; replies inherit the thread's anchors. */
  parentId?: string;
  file?: string;
  line?: number | null;
  endLine?: number | null;
  origin?: CommentOrigin;
  context?: string[];
  /** Index of the anchored line within `context`. Defaults to the middle. */
  contextAnchor?: number;
  body: string;
  suggestion?: CodeSuggestion | null;
  author?: string;
  now?: () => string;
}

export function addComment(review: Review, input: NewComment): Review {
  const body = input.body.trim();
  if (body === '') throw new ReviewError('comment body is required');
  const now = input.now ?? defaultNow;
  const at = now();

  const comment: ReviewComment = {
    id: input.id ?? randomUUID(),
    parentId: null,
    file: null,
    line: null,
    endLine: null,
    origin: null,
    context: [],
    contextAnchor: 0,
    body,
    status: 'active',
    suggestion: null,
    author: input.author ?? review.author,
    createdAt: at,
    resolvedAt: null,
  };

  if (input.parentId !== undefined) {
    const parent = review.comments.find((c) => c.id === input.parentId);
    if (!parent) throw new ReviewError(`unknown parent comment: ${input.parentId}`);
    comment.parentId = parent.id;
  } else {
    if (input.file === undefined || input.file.trim() === '') throw new ReviewError('root comment requires a file');
    if (input.line === null || input.line === undefined || !Number.isInteger(input.line) || input.line < 1) {
      throw new ReviewError('root comment requires a positive line');
    }
    if (input.origin === undefined || input.origin.sha.trim() === '' || !Number.isInteger(input.origin.line) || input.origin.line < 1) {
      throw new ReviewError('root comment requires an origin (sha + line)');
    }
    if (input.context === undefined || input.context.length === 0) throw new ReviewError('root comment requires a context snapshot');
    if (input.suggestion !== undefined && input.suggestion !== null && input.suggestion.oldText.trim() === '') {
      throw new ReviewError('suggestion requires oldText');
    }
    const context = [...input.context];
    const contextAnchor = input.contextAnchor ?? Math.floor(context.length / 2);
    if (!Number.isInteger(contextAnchor) || contextAnchor < 0 || contextAnchor >= context.length) {
      throw new ReviewError('contextAnchor must be within the context snapshot');
    }
    comment.file = input.file.trim();
    comment.line = input.line;
    comment.endLine = input.endLine ?? null;
    comment.origin = input.origin;
    comment.context = context;
    comment.contextAnchor = contextAnchor;
    comment.suggestion = input.suggestion ?? null;
  }

  return { ...review, comments: [...review.comments, comment], updatedAt: at };
}

export function transition(review: Review, to: ReviewStatus, opts?: { now?: () => string }): Review {
  if (to === review.status) throw new ReviewError(`review is already ${review.status}`);
  if (!REVIEW_TRANSITIONS[review.status].includes(to)) {
    throw new ReviewError(`cannot transition ${review.status} -> ${to}`);
  }
  const at = (opts?.now ?? defaultNow)();
  return {
    ...review,
    status: to,
    statusLog: [...review.statusLog, { from: review.status, to, at }],
    updatedAt: at,
  };
}

export function resolveComment(review: Review, id: string, opts?: { now?: () => string }): Review {
  const comment = review.comments.find((c) => c.id === id);
  if (!comment) throw new ReviewError(`unknown comment: ${id}`);
  if (comment.status === 'resolved') throw new ReviewError('comment is already resolved');
  const at = (opts?.now ?? defaultNow)();
  return {
    ...review,
    comments: review.comments.map((c) => (c.id === id ? { ...c, status: 'resolved', resolvedAt: at } : c)),
    updatedAt: at,
  };
}

/** Thread from root (first) to the given comment, via the parentId chain. */
export function getThread(review: Review, id: string): ReviewComment[] {
  const index = new Map(review.comments.map((c) => [c.id, c]));
  const start = index.get(id);
  if (!start) throw new ReviewError(`unknown comment: ${id}`);
  const chain: ReviewComment[] = [];
  let current: ReviewComment | undefined = start;
  while (current) {
    chain.push(current);
    current = current.parentId ? index.get(current.parentId) : undefined;
  }
  return chain.reverse();
}

/** Parse and shape-check a stored review. Never returns null for bad data. */
export function parseReview(raw: string): Review {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new ReviewError('review file is not valid JSON');
  }
  if (!isRecord(value)) throw new ReviewError('malformed review file');
  if (value.version !== REVIEW_SCHEMA_VERSION) {
    throw new ReviewError(`unsupported review schema version: ${String(value.version)}`);
  }
  const missing: string[] = [];
  if (typeof value.id !== 'string' || value.id === '') missing.push('id');
  if (typeof value.baseBranch !== 'string' || value.baseBranch === '') missing.push('baseBranch');
  if (typeof value.headBranch !== 'string' || value.headBranch === '') missing.push('headBranch');
  if (typeof value.author !== 'string' || value.author === '') missing.push('author');
  if (!isReviewStatus(value.status)) missing.push('status');
  if (!Array.isArray(value.comments)) {
    missing.push('comments');
  } else {
    for (const c of value.comments) {
      if (!isRecord(c) || typeof c.id !== 'string' || typeof c.body !== 'string' || !isCommentStatus(c.status)) {
        missing.push('comments[]');
        break;
      }
    }
  }
  if (missing.length > 0) throw new ReviewError(`malformed review file: missing/invalid ${missing.join(', ')}`);
  return value as unknown as Review;
}
