import { describe, expect, it } from 'vitest';
import { parseDiffBody, flattenHunks } from './diff-model.js';

describe('parseDiffBody', () => {
  it('parses a modified file with context, removed and added lines', () => {
    const body = `diff --git a/a.txt b/a.txt
index 123..456 100644
--- a/a.txt
+++ b/a.txt
@@ -1,3 +1,3 @@
 hello
-old
+new
 world
`;
    const { hunks } = parseDiffBody(body);
    expect(hunks).toHaveLength(1);
    const hunk = hunks[0]!;
    expect(hunk).toMatchObject({ oldStart: 1, oldCount: 3, newStart: 1, newCount: 3 });
    expect(hunk.lines).toEqual([
      { kind: 'context', oldLine: 1, newLine: 1, text: 'hello' },
      { kind: 'removed', oldLine: 2, text: 'old' },
      { kind: 'added', newLine: 2, text: 'new' },
      { kind: 'context', oldLine: 3, newLine: 3, text: 'world' },
    ]);
  });

  it('parses an added file (/dev/null -> path), oldCount 0', () => {
    const body = `diff --git a/b.txt b/b.txt
new file mode 100644
index 000..789
--- /dev/null
+++ b/b.txt
@@ -0,0 +1,2 @@
+alpha
+beta
`;
    const { hunks } = parseDiffBody(body);
    expect(hunks).toHaveLength(1);
    expect(hunks[0]).toMatchObject({ oldStart: 0, oldCount: 0, newStart: 1, newCount: 2 });
    expect(hunks[0]!.lines).toEqual([
      { kind: 'added', newLine: 1, text: 'alpha' },
      { kind: 'added', newLine: 2, text: 'beta' },
    ]);
  });

  it('parses a deleted file (path -> /dev/null), newCount 0', () => {
    const body = `diff --git a/c.txt b/c.txt
deleted file mode 100644
index 123..000
--- a/c.txt
+++ /dev/null
@@ -1,2 +0,0 @@
-alpha
-beta
`;
    const { hunks } = parseDiffBody(body);
    expect(hunks).toHaveLength(1);
    expect(hunks[0]).toMatchObject({ oldStart: 1, oldCount: 2, newStart: 0, newCount: 0 });
    expect(hunks[0]!.lines).toEqual([
      { kind: 'removed', oldLine: 1, text: 'alpha' },
      { kind: 'removed', oldLine: 2, text: 'beta' },
    ]);
  });

  it('parses multiple hunks with section headings and resets line numbers', () => {
    const body = `diff --git a/a.txt b/a.txt
--- a/a.txt
+++ b/a.txt
@@ -1,2 +1,2 @@
 ctx
-old
+new
@@ -10,3 +10,3 @@ section heading
 a
-b
+c
 d
`;
    const { hunks } = parseDiffBody(body);
    expect(hunks).toHaveLength(2);
    expect(hunks[0]).toMatchObject({ oldStart: 1, newStart: 1, section: '' });
    expect(hunks[1]).toMatchObject({ oldStart: 10, oldCount: 3, newStart: 10, newCount: 3, section: 'section heading' });
    expect(hunks[1]!.lines).toEqual([
      { kind: 'context', oldLine: 10, newLine: 10, text: 'a' },
      { kind: 'removed', oldLine: 11, text: 'b' },
      { kind: 'added', newLine: 11, text: 'c' },
      { kind: 'context', oldLine: 12, newLine: 12, text: 'd' },
    ]);
  });

  it('ignores the no-newline-at-eof marker without corrupting line numbers', () => {
    const body = `--- a/x.txt
+++ b/x.txt
@@ -1,2 +1,2 @@
-first
+first
\\ No newline at end of file
`;
    const { hunks } = parseDiffBody(body);
    expect(hunks[0]!.lines).toEqual([
      { kind: 'removed', oldLine: 1, text: 'first' },
      { kind: 'added', newLine: 1, text: 'first' },
    ]);
  });

  it('skips rename headers and parses the rename body', () => {
    const body = `diff --git a/old.txt b/new.txt
similarity index 100%
rename from old.txt
rename to new.txt
--- a/old.txt
+++ b/new.txt
@@ -1,1 +1,1 @@
-x
+y
`;
    const { hunks } = parseDiffBody(body);
    expect(hunks).toHaveLength(1);
    expect(hunks[0]!.lines).toEqual([
      { kind: 'removed', oldLine: 1, text: 'x' },
      { kind: 'added', newLine: 1, text: 'y' },
    ]);
  });

  it('handles hunk headers with omitted counts (count of 1)', () => {
    const body = `--- a/a.txt
+++ b/a.txt
@@ -5 +5 @@
 hello
-old
+new
`;
    const { hunks } = parseDiffBody(body);
    expect(hunks[0]).toMatchObject({ oldStart: 5, oldCount: 1, newStart: 5, newCount: 1 });
    expect(hunks[0]!.lines[1]).toMatchObject({ kind: 'removed', oldLine: 6 });
    expect(hunks[0]!.lines[2]).toMatchObject({ kind: 'added', newLine: 6 });
  });

  it('returns no hunks for an empty body', () => {
    expect(parseDiffBody('').hunks).toEqual([]);
  });

  it('returns no hunks for a header-only body (e.g. binary)', () => {
    const body = `diff --git a/img.png b/img.png
index 123..456 100644
Binary files a/img.png and b/img.png differ
`;
    expect(parseDiffBody(body).hunks).toEqual([]);
  });
});

describe('flattenHunks', () => {
  it('flattens all hunk lines into a single list in order', () => {
    const body = `diff --git a/a.txt b/a.txt
@@ -1,2 +1,2 @@
 old
+new
`;
    const { hunks } = parseDiffBody(body);
    expect(flattenHunks(hunks).map((l) => l.text)).toEqual(['old', 'new']);
  });
});
