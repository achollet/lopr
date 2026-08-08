import type { DiffLine, FileDiff, Hunk, ReviewComment } from '@lopr/core';
import { parseDiffBody } from '@lopr/core';

export type Pane = 'files' | 'diff' | 'threads';

export type TuiMode = 'browse' | 'comment' | 'merge-confirm';

/** A flattened, cursor-navigable view of one file's diff. */
export interface ViewLine {
  kind: DiffLine['kind'];
  oldLine?: number;
  newLine?: number;
  text: string;
}

export interface TuiState {
  files: FileDiff[];
  selectedFile: number;
  view: ViewLine[];
  cursor: number;
  pane: Pane;
  mode: TuiMode;
  commentBody: string;
  threads: ReviewComment[];
}

export function buildView(hunks: Hunk[]): ViewLine[] {
  return hunks.flatMap((hunk) =>
    hunk.lines.map((line) => ({
      kind: line.kind,
      oldLine: line.oldLine,
      newLine: line.newLine,
      text: line.text,
    })),
  );
}

export function fileView(file: FileDiff): ViewLine[] {
  if (file.binary) return [];
  return buildView(parseDiffBody(file.body).hunks);
}

export function initialTuiState(files: FileDiff[], threads: ReviewComment[]): TuiState {
  const first = files[0];
  return {
    files,
    selectedFile: 0,
    view: first ? fileView(first) : [],
    cursor: 0,
    pane: 'diff',
    mode: 'browse',
    commentBody: '',
    threads,
  };
}

/** The new-side anchor of the cursor, or null when it cannot anchor a comment. */
export function selectedAnchor(state: TuiState): { file: string; line: number } | null {
  const file = state.files[state.selectedFile];
  const line = state.view[state.cursor];
  if (!file || !line || line.newLine === undefined) return null;
  return { file: file.path, line: line.newLine };
}

export type TuiAction =
  | { type: 'cursor-down' }
  | { type: 'cursor-up' }
  | { type: 'file-next' }
  | { type: 'file-prev' }
  | { type: 'pane'; pane: Pane }
  | { type: 'comment-start' }
  | { type: 'comment-change'; value: string }
  | { type: 'comment-cancel' }
  | { type: 'comment-submit' }
  | { type: 'merge-start' }
  | { type: 'merge-cancel' }
  | { type: 'merge-confirm' }
  | { type: 'refresh'; files: FileDiff[]; threads: ReviewComment[] };

const clamp = (value: number, max: number): number => Math.min(Math.max(value, 0), Math.max(max, 0));

function selectFile(state: TuiState, index: number): TuiState {
  const file = state.files[index];
  return {
    ...state,
    selectedFile: index,
    view: file ? fileView(file) : [],
    cursor: 0,
    pane: 'diff',
  };
}

export function reduce(state: TuiState, action: TuiAction): TuiState {
  switch (action.type) {
    case 'cursor-down':
      if (state.mode !== 'browse') return state;
      return { ...state, cursor: clamp(state.cursor + 1, state.view.length - 1) };
    case 'cursor-up':
      if (state.mode !== 'browse') return state;
      return { ...state, cursor: clamp(state.cursor - 1, state.view.length - 1) };
    case 'file-next':
      if (state.mode !== 'browse') return state;
      return selectFile(state, clamp(state.selectedFile + 1, state.files.length - 1));
    case 'file-prev':
      if (state.mode !== 'browse') return state;
      return selectFile(state, clamp(state.selectedFile - 1, state.files.length - 1));
    case 'pane':
      if (state.mode !== 'browse') return state;
      return { ...state, pane: action.pane };
    case 'comment-start':
      if (state.mode !== 'browse' || state.pane !== 'diff') return state;
      if (selectedAnchor(state) === null) return state;
      return { ...state, mode: 'comment', commentBody: '' };
    case 'comment-change':
      if (state.mode !== 'comment') return state;
      return { ...state, commentBody: action.value };
    case 'comment-cancel':
      if (state.mode !== 'comment') return state;
      return { ...state, mode: 'browse', commentBody: '' };
    case 'comment-submit':
      if (state.mode !== 'comment') return state;
      return { ...state, mode: 'browse', commentBody: '' };
    case 'merge-start':
      if (state.mode !== 'browse') return state;
      return { ...state, mode: 'merge-confirm' };
    case 'merge-cancel':
      if (state.mode !== 'merge-confirm') return state;
      return { ...state, mode: 'browse' };
    case 'merge-confirm':
      if (state.mode !== 'merge-confirm') return state;
      return { ...state, mode: 'browse' };
    case 'refresh': {
      const base = selectFile(state, clamp(state.selectedFile, action.files.length - 1));
      return { ...base, files: action.files, threads: action.threads };
    }
  }
}
