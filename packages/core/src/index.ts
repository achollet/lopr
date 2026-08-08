export const VERSION = '0.1.0';

export const PACKAGE_NAME = '@lopr/core';

export { getThreeDotDiff, getDiffBetween, newFileProvider, resolveBranches } from './diff.js';
export type { BranchResolution, DiffBetweenOptions, DiffOptions } from './diff.js';
export { mapOldLineToNew, reanchorComment, buildContextSnapshot } from './anchoring.js';
export type { AnchorComment, AnchorResult, AnchorStatus, ContextSnapshot } from './anchoring.js';
export { ReviewService } from './service.js';
export type { CommentCommand, NewReviewCommand, ReviewServiceOptions } from './service.js';
export { parseDiffBody, truncateHunks } from './diff-model.js';
export type { DiffLine, DiffLineKind, Hunk, ParsedDiff, Truncation } from './diff-model.js';
export { GitCli, GitError } from './gateway.js';
export type { GitGateway } from './gateway.js';
export { loadConfig } from './config.js';
export { matchesIgnore } from './ignore.js';
export type { ChangeStatus, FileDiff, LoprConfig, ThreeDotDiff } from './types.js';
export {
  addComment,
  createReview,
  getThread,
  isCommentStatus,
  isReviewStatus,
  parseReview,
  resolveComment,
  transition,
  REVIEW_SCHEMA_VERSION,
  REVIEW_TRANSITIONS,
  ReviewError,
} from './review.js';
export type {
  CodeSuggestion,
  CommentOrigin,
  CommentStatus,
  NewComment,
  NewReview,
  Review,
  ReviewComment,
  ReviewStatus,
  StatusTransition,
} from './review.js';
export { JsonFileReviewStore, summaryOf } from './store.js';
export type { ReviewStore, ReviewSummary } from './store.js';
