export const VERSION = '0.1.0';

export const PACKAGE_NAME = '@lopr/core';

export { getThreeDotDiff } from './diff.js';
export type { DiffOptions } from './diff.js';
export { parseDiffBody, truncateHunks } from './diff-model.js';
export type { DiffLine, DiffLineKind, Hunk, ParsedDiff, Truncation } from './diff-model.js';
export { GitCli, GitError } from './gateway.js';
export type { GitGateway } from './gateway.js';
export { loadConfig } from './config.js';
export { matchesIgnore } from './ignore.js';
export type { ChangeStatus, FileDiff, LoprConfig, ThreeDotDiff } from './types.js';
