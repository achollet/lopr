import { describe, expect, it } from 'vitest';
import type { FileDiff, ReviewComment } from '@lopr/core';
import {
  fileView,
  initialTuiState,
  reduce,
  selectedAnchor,
  type TuiState,
} from './state.js';

const file = (path: string, body: string): FileDiff => ({
  path,
  status: 'modified',
  binary: false,
  additions: 2,
  deletions: 1,
  body,
});

const SAMPLE_BODY = [
  'diff --git a/src/a.ts b/src/a.ts',
  'index 1111111..2222222 100644',
  '--- a/src/a.ts',
  '+++ b/src/a.ts',
  '@@ -1,3 +1,3 @@',
  ' context',
  '-removed',
  '+added',
  ' context2',
].join('\n');

const twoFiles = (): TuiState =>
  initialTuiState(
    [file('src/a.ts', SAMPLE_BODY), file('src/b.ts', SAMPLE_BODY)],
    [],
  );

const thread = (id: string): ReviewComment =>
  ({
    id,
    parentId: undefined,
    author: 'agent',
    body: 'body',
    createdAt: 't',
    status: 'active',
    file: 'src/a.ts',
    line: 2,
    origin: { sha: 's', line: 2, context: ['a', 'b'], contextAnchor: 'b' },
  }) as unknown as ReviewComment;

describe('buildView', () => {
  it('flattens hunks into navigable lines with new-side numbers', () => {
    const view = fileView(file('src/a.ts', SAMPLE_BODY));
    expect(view).toHaveLength(4);
    expect(view[0]).toEqual({ kind: 'context', oldLine: 1, newLine: 1, text: 'context' });
    expect(view[1]).toEqual({ kind: 'removed', oldLine: 2, text: 'removed' });
    expect(view[2]).toEqual({ kind: 'added', newLine: 2, text: 'added' });
  });
});

describe('initialTuiState', () => {
  it('shows the first file in the diff pane', () => {
    const state = twoFiles();
    expect(state.files.map((f) => f.path)).toEqual(['src/a.ts', 'src/b.ts']);
    expect(state.selectedFile).toBe(0);
    expect(state.pane).toBe('diff');
    expect(state.view.length).toBeGreaterThan(0);
  });

  it('starts empty for an empty file list', () => {
    const state = initialTuiState([], []);
    expect(state.view).toEqual([]);
    expect(state.cursor).toBe(0);
  });
});

describe('cursor navigation', () => {
  it('clamps at both ends of the view', () => {
    let state = twoFiles();
    for (let i = 0; i < 10; i++) state = reduce(state, { type: 'cursor-up' });
    expect(state.cursor).toBe(0);
    for (let i = 0; i < 100; i++) state = reduce(state, { type: 'cursor-down' });
    expect(state.cursor).toBe(state.view.length - 1);
  });

  it('rejects navigation while typing a comment', () => {
    let state = reduce(twoFiles(), { type: 'comment-start' });
    expect(state.mode).toBe('comment');
    const before = state.cursor;
    state = reduce(state, { type: 'cursor-down' });
    expect(state.cursor).toBe(before);
  });
});

describe('file navigation', () => {
  it('switches files and resets cursor to the diff pane', () => {
    let state = twoFiles();
    state = reduce(state, { type: 'cursor-down' });
    state = reduce(state, { type: 'file-next' });
    expect(state.selectedFile).toBe(1);
    expect(state.pane).toBe('diff');
    expect(state.cursor).toBe(0);
    expect(state.view.length).toBeGreaterThan(0);
  });

  it('clamps at the last file', () => {
    let state = twoFiles();
    state = reduce(state, { type: 'file-next' });
    state = reduce(state, { type: 'file-next' });
    expect(state.selectedFile).toBe(1);
  });
});

describe('comment mode', () => {
  it('refuses to start a comment on a removed line (no new-side anchor)', () => {
    const state = twoFiles();
    const onRemoved = reduce(state, { type: 'cursor-down' });
    expect(selectedAnchor(onRemoved)).toBeNull();
    const after = reduce(onRemoved, { type: 'comment-start' });
    expect(after.mode).toBe('browse');
  });

  it('accumulates a body and submits back to browse', () => {
    let state = reduce(twoFiles(), { type: 'comment-start' });
    expect(state.mode).toBe('comment');
    state = reduce(state, { type: 'comment-change', value: 'nit: spacing' });
    expect(state.commentBody).toBe('nit: spacing');
    state = reduce(state, { type: 'comment-submit' });
    expect(state.mode).toBe('browse');
    expect(state.commentBody).toBe('');
  });

  it('cancels without side effects', () => {
    let state = reduce(twoFiles(), { type: 'comment-start' });
    state = reduce(state, { type: 'comment-change', value: 'draft' });
    state = reduce(state, { type: 'comment-cancel' });
    expect(state.mode).toBe('browse');
    expect(state.commentBody).toBe('');
  });
});

describe('selectedAnchor', () => {
  it('resolves the cursor line to a file + new-side line', () => {
    let state = twoFiles();
    state = reduce(state, { type: 'cursor-down' }); // removed line
    state = reduce(state, { type: 'cursor-down' }); // added line
    expect(selectedAnchor(state)).toEqual({ file: 'src/a.ts', line: 2 });
  });
});

describe('merge confirm', () => {
  it('opens and confirms the confirm mode', () => {
    let state = reduce(twoFiles(), { type: 'merge-start' });
    expect(state.mode).toBe('merge-confirm');
    state = reduce(state, { type: 'merge-cancel' });
    expect(state.mode).toBe('browse');
    state = reduce(state, { type: 'merge-start' });
    state = reduce(state, { type: 'merge-confirm' });
    expect(state.mode).toBe('browse');
  });
});

describe('refresh', () => {
  it('replaces files and threads, keeping the selection in range', () => {
    let state = twoFiles();
    state = reduce(state, { type: 'file-next' });
    const next = reduce(state, {
      type: 'refresh',
      files: [file('src/c.ts', SAMPLE_BODY)],
      threads: [thread('t1')],
    });
    expect(next.files.map((f) => f.path)).toEqual(['src/c.ts']);
    expect(next.selectedFile).toBe(0);
    expect(next.threads.map((t) => t.id)).toEqual(['t1']);
  });
});
