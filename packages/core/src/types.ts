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
  path: string;
  oldPath?: string;
  status: ChangeStatus;
  binary: boolean;
  additions: number;
  deletions: number;
  body: string;
}

export interface ThreeDotDiff {
  base: string;
  head: string;
  mergeBase: string;
  files: FileDiff[];
}

export interface LoprConfig {
  base?: string;
  ignore: string[];
  skillPath?: string;
}
