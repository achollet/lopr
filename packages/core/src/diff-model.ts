export type DiffLineKind = 'context' | 'added' | 'removed';

export interface DiffLine {
  kind: DiffLineKind;
  oldLine?: number;
  newLine?: number;
  text: string;
}

export interface Hunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  section: string;
  lines: DiffLine[];
}

export interface ParsedDiff {
  hunks: Hunk[];
}

const HUNK_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/;

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

export function flattenHunks(hunks: Hunk[]): DiffLine[] {
  return hunks.flatMap((hunk) => hunk.lines);
}
