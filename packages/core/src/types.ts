export type ChangeStatus =
  | 'added'
  | 'deleted'
  | 'modified'
  | 'renamed'
  | 'copied'
  | 'typechange'
  | 'unmerged'
  | 'unknown';

export interface FileDiff {
  /** New path (post-rename). */
  path: string;
  /** Pre-rename path, for renames/copies. */
  oldPath?: string;
  status: ChangeStatus;
  binary: boolean;
  additions: number;
  deletions: number;
  /** Raw unified diff body for this file (starts with `diff --git`). */
  body: string;
}

export interface ThreeDotDiff {
  base: string;
  head: string;
  mergeBase: string;
  files: FileDiff[];
}

export interface LoprConfig {
  /** Base branch to diff against. Falls back to the git default branch. */
  base?: string;
  /** Glob patterns of generated files to exclude from the diff. */
  ignore: string[];
}
