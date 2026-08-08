import { describe, expect, it } from 'vitest';
import { mapOldLineToNew, reanchorComment } from './anchoring.js';
import { parseDiffBody } from './diff-model.js';
import type { ChangeStatus, FileDiff } from './types.js';

function diffFile(body: string, path = 'a.txt', oldPath?: string, status: ChangeStatus = 'modified'): FileDiff {
  return { path, status, binary: false, additions: 0, deletions: 0, body, ...(oldPath !== undefined ? { oldPath } : {}) };
}

const NO_NEWLINES = () => Promise.resolve(null);

describe('mapOldLineToNew', () => {
  const { hunks } = parseDiffBody(`--- a/a.txt
+++ b/a.txt
@@ -1,4 +1,4 @@
 a
-old
+new
 c
 d
@@ -10,3 +10,4 @@
 x
-y
+z
+extra
 w
`);

  it('maps lines in unchanged regions before the first hunk', () => {
    expect(mapOldLineToNew(hunks, 1)).toBe(1);
  });

  it('maps context lines inside a hunk', () => {
    expect(mapOldLineToNew(hunks, 4)).toBe(4);
    expect(mapOldLineToNew(hunks, 10)).toBe(10);
    expect(mapOldLineToNew(hunks, 12)).toBe(13);
  });

  it('returns null for removed lines (rewritten zone)', () => {
    expect(mapOldLineToNew(hunks, 2)).toBeNull();
    expect(mapOldLineToNew(hunks, 11)).toBeNull();
  });

  it('applies the accumulated delta in the gap between hunks', () => {
    expect(mapOldLineToNew(hunks, 7)).toBe(7);
  });

  it('applies the total delta after the last hunk', () => {
    expect(mapOldLineToNew(hunks, 13)).toBe(14);
  });
});

describe('reanchorComment', () => {
  const REWRITTEN = `--- a/a.txt
+++ b/a.txt
@@ -1,7 +1,7 @@
 line1
 line2
 line3
-BADLINE
+FIXEDLINE
 line5
 line6
 line7
`;

  const REWRITTEN_NEW = ['line1', 'line2', 'line3', 'FIXEDLINE', 'line5', 'line6', 'line7'];

  const MODIFIED = `--- a/a.txt
+++ b/a.txt
@@ -1,5 +1,5 @@
 line1
 line2
 line3
-old
+new
 line5
`;

  const RENAMED = `diff --git a/old.txt b/new.txt
similarity index 50%
rename from old.txt
rename to new.txt
--- a/old.txt
+++ b/new.txt
@@ -1,5 +1,5 @@
 alpha
-beta
+BETA
 gamma
 delta
 epsilon
`;

  it('keeps the line when the file is not in the diff', async () => {
    const result = await reanchorComment([], NO_NEWLINES, { file: 'a.txt', line: 42, context: ['x'], contextAnchor: 0 });
    expect(result).toEqual({ status: 'exact', file: 'a.txt', line: 42 });
  });

  it('maps through a rename-only diff (no hunks)', async () => {
    const file = diffFile('', 'new.txt', 'old.txt', 'renamed');
    const result = await reanchorComment([file], NO_NEWLINES, { file: 'old.txt', line: 5, context: ['x'], contextAnchor: 0 });
    expect(result).toEqual({ status: 'exact', file: 'new.txt', line: 5 });
  });

  it('detaches comments on deleted files', async () => {
    const file = diffFile('', 'gone.txt', undefined, 'deleted');
    const result = await reanchorComment([file], NO_NEWLINES, { file: 'gone.txt', line: 3, context: ['x'], contextAnchor: 0 });
    expect(result).toEqual({ status: 'detached', file: 'gone.txt', line: null });
  });

  it('detaches comments on binary files', async () => {
    const file = { ...diffFile('', 'img.png'), binary: true };
    const result = await reanchorComment([file], NO_NEWLINES, { file: 'img.png', line: 1, context: ['x'], contextAnchor: 0 });
    expect(result).toEqual({ status: 'detached', file: 'img.png', line: null });
  });

  it('maps a line that survived as context', async () => {
    const file = diffFile(MODIFIED);
    const result = await reanchorComment([file], NO_NEWLINES, { file: 'a.txt', line: 2, context: ['x'], contextAnchor: 0 });
    expect(result).toEqual({ status: 'exact', file: 'a.txt', line: 2 });
  });

  it('context-searches a rewritten line', async () => {
    const file = diffFile(REWRITTEN);
    const getNewLines = () => Promise.resolve(REWRITTEN_NEW);
    const result = await reanchorComment([file], getNewLines, {
      file: 'a.txt',
      line: 4,
      context: ['line2', 'line3', 'BADLINE', 'line5', 'line6'],
      contextAnchor: 2,
    });
    expect(result).toEqual({ status: 'context', file: 'a.txt', line: 4 });
  });

  it('context search is whitespace-tolerant', async () => {
    const file = diffFile(REWRITTEN);
    const indented = REWRITTEN_NEW.map((l, i) => (i === 3 ? l : `  ${l}`));
    const result = await reanchorComment([file], () => Promise.resolve(indented), {
      file: 'a.txt',
      line: 4,
      context: ['line2', 'line3', 'BADLINE', 'line5', 'line6'],
      contextAnchor: 2,
    });
    expect(result).toEqual({ status: 'context', file: 'a.txt', line: 4 });
  });

  it('detaches when the context no longer matches anywhere', async () => {
    const file = diffFile(REWRITTEN);
    const rewritten = ['aaa', 'bbb', 'ccc', 'ddd', 'eee', 'fff', 'ggg'];
    const result = await reanchorComment([file], () => Promise.resolve(rewritten), {
      file: 'a.txt',
      line: 4,
      context: ['line2', 'line3', 'BADLINE', 'line5', 'line6'],
      contextAnchor: 2,
    });
    expect(result.status).toBe('detached');
  });

  it('re-anchors through a rename with a rewritten line', async () => {
    const file = diffFile(RENAMED, 'new.txt', 'old.txt', 'renamed');
    const result = await reanchorComment([file], () => Promise.resolve(['alpha', 'BETA', 'gamma', 'delta', 'epsilon']), {
      file: 'old.txt',
      line: 2,
      context: ['alpha', 'beta', 'gamma', 'delta'],
      contextAnchor: 1,
    });
    expect(result).toEqual({ status: 'context', file: 'new.txt', line: 2 });
  });
});
