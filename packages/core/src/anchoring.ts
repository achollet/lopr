import { parseDiffBody, type Hunk } from './diff-model.js';
import type { FileDiff } from './types.js';

export type AnchorStatus = 'exact' | 'context' | 'detached';

export interface AnchorResult {
  status: AnchorStatus;
  file: string;
  line: number | null;
}

export interface AnchorComment {
  file: string;
  line: number;
  context: string[];
  contextAnchor: number;
}

export interface ContextSnapshot {
  context: string[];
  contextAnchor: number;
}

export function buildContextSnapshot(lines: string[], line: number): ContextSnapshot {
  const start = Math.max(0, line - 3);
  const end = Math.min(lines.length, line + 2);
  return {
    context: lines.slice(start, end),
    contextAnchor: line - 1 - start,
  };
}

function collapseWhitespace(line: string): string {
  return line.replace(/\s+/g, ' ').trim();
}

export function mapOldLineToNew(hunks: Hunk[], oldLine: number): number | null {
  let delta = 0;
  for (const hunk of hunks) {
    if (oldLine < hunk.oldStart) return oldLine + delta;
    if (oldLine < hunk.oldStart + hunk.oldCount) {
      const line = hunk.lines.find((l) => l.oldLine === oldLine);
      if (line === undefined || line.kind === 'removed') return null;
      return line.newLine ?? null;
    }
    delta += hunk.newCount - hunk.oldCount;
  }
  return oldLine + delta;
}

function expectedNewLine(hunks: Hunk[], oldLine: number): number {
  let delta = 0;
  for (const hunk of hunks) {
    if (oldLine < hunk.oldStart) break;
    if (oldLine < hunk.oldStart + hunk.oldCount) break;
    delta += hunk.newCount - hunk.oldCount;
  }
  return oldLine + delta;
}

function findContextWindow(
  newLines: string[],
  context: string[],
  contextAnchor: number,
  expectedNewLine: number,
): number | null {
  const windowSize = context.length;
  if (newLines.length < windowSize) return null;
  const normContext = context.map(collapseWhitespace);
  const threshold = Math.min(windowSize, Math.max(2, windowSize - 2));
  const expectedStart = Math.max(0, expectedNewLine - contextAnchor);

  let best: { score: number; start: number } | null = null;
  for (let start = 0; start + windowSize <= newLines.length; start++) {
    let score = 0;
    for (let i = 0; i < windowSize; i++) {
      if (collapseWhitespace(newLines[start + i]!) === normContext[i]!) score++;
    }
    const distance = Math.abs(start - expectedStart);
    if (
      best === null ||
      score > best.score ||
      (score === best.score && distance < Math.abs(best.start - expectedStart))
    ) {
      best = { score, start };
    }
  }
  if (best === null || best.score < threshold) return null;
  return best.start + contextAnchor + 1;
}

export async function reanchorComment(
  diff: FileDiff[],
  getNewLines: (path: string) => Promise<string[] | null>,
  comment: AnchorComment,
): Promise<AnchorResult> {
  const fileDiff = diff.find((d) => d.oldPath === comment.file || d.path === comment.file);

  if (!fileDiff) return { status: 'exact', file: comment.file, line: comment.line };
  if (fileDiff.status === 'deleted' || fileDiff.binary) return { status: 'detached', file: comment.file, line: null };

  const newPath = fileDiff.path;
  const { hunks } = parseDiffBody(fileDiff.body);
  if (hunks.length === 0) return { status: 'exact', file: newPath, line: comment.line };

  const mapped = mapOldLineToNew(hunks, comment.line);
  if (mapped !== null) return { status: 'exact', file: newPath, line: mapped };

  const newLines = await getNewLines(newPath);
  if (newLines !== null) {
    const found = findContextWindow(newLines, comment.context, comment.contextAnchor, expectedNewLine(hunks, comment.line));
    if (found !== null) return { status: 'context', file: newPath, line: found };
  }
  return { status: 'detached', file: newPath, line: null };
}
