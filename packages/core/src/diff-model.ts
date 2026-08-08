export type DiffLineKind = 'context' | 'added' | 'removed';

export interface DiffLine {
  kind: DiffLineKind;
  /** Old-side 1-based line number; undefined for added lines. */
  oldLine?: number;
  /** New-side 1-based line number; undefined for removed lines. */
  newLine?: number;
  /** Line content without the `+/ /-` prefix. */
  text: string;
}

export interface Hunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  /** Free-text section heading after the `@@`. */
  section: string;
  lines: DiffLine[];
}

export interface ParsedDiff {
  hunks: Hunk[];
}

const HUNK_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/;

/**
 * Parse the unified diff body of a single file into hunks. Header lines
 * (`diff --git`, `index`, `--- a/`, `+++ b/`, `similarity index`,
 * `rename from/to`, `\ No newline at end of file`) are skipped.
 * Always returns every hunk — truncation is a display concern
 * (`truncateHunks`), never part of the model the anchoring engine reads.
 */
export function parseDiffBody(body: string): ParsedDiff {
  const hunks: Hunk[] = [];
  let current: Hunk | null = null;
  let nextOld = 0;
  let nextNew = 0;

  for (const raw of body.split('\n')) {
    const hunkMatch = raw.match(HUNK_RE);
    if (hunkMatch) {
      current = {
        oldStart: Number(hunkMatch[1]!),
        oldCount: hunkMatch[2] === undefined ? 1 : Number(hunkMatch[2]),
        newStart: Number(hunkMatch[3]!),
        newCount: hunkMatch[4] === undefined ? 1 : Number(hunkMatch[4]),
        section: (hunkMatch[5] ?? '').trim(),
        lines: [],
      };
      nextOld = current.oldStart;
      nextNew = current.newStart;
      hunks.push(current);
      continue;
    }
    if (current === null) continue;

    const code = raw[0];
    if (code === ' ') {
      current.lines.push({ kind: 'context', oldLine: nextOld, newLine: nextNew, text: raw.slice(1) });
      nextOld += 1;
      nextNew += 1;
    } else if (code === '-') {
      current.lines.push({ kind: 'removed', oldLine: nextOld, text: raw.slice(1) });
      nextOld += 1;
    } else if (code === '+') {
      current.lines.push({ kind: 'added', newLine: nextNew, text: raw.slice(1) });
      nextNew += 1;
    }
  }

  return { hunks };
}

export interface Truncation {
  hunks: Hunk[];
  truncated: boolean;
  droppedHunks: number;
}

/** Keep the first `maxHunks` hunks of a file for display. */
export function truncateHunks(hunks: Hunk[], maxHunks: number): Truncation {
  if (maxHunks <= 0 || hunks.length <= maxHunks) {
    return { hunks, truncated: false, droppedHunks: 0 };
  }
  return {
    hunks: hunks.slice(0, maxHunks),
    truncated: true,
    droppedHunks: hunks.length - maxHunks,
  };
}
