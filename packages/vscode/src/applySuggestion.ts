import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { CodeSuggestion } from '@lopr/core';

export interface ApplySuggestionError {
  reason: 'not-found' | 'io' | 'invalid';
  message: string;
}

/**
 * Apply an inline suggestion to the working tree file at `repoRoot`/`file`.
 * The replacement is anchored on the suggestion's oldText, preferring the
 * occurrence nearest the comment line when `line` is given.
 */
export async function applySuggestion(
  repoRoot: string,
  file: string,
  line: number | null,
  suggestion: CodeSuggestion,
): Promise<void> {
  if (!suggestion.oldText) {
    throw Object.assign(new Error('suggestion has no oldText to match'), { reason: 'invalid' }) as unknown as ApplySuggestionError;
  }
  const target = path.join(repoRoot, file);
  let content: string;
  try {
    content = await readFile(target, 'utf8');
  } catch (error) {
    throw Object.assign(new Error(`cannot read ${file}: ${(error as Error).message}`), { reason: 'io' }) as unknown as ApplySuggestionError;
  }

  const candidates = indicesOf(content, suggestion.oldText);
  if (candidates.length === 0) {
    throw Object.assign(new Error(`suggestion text not found in ${file}`), { reason: 'not-found' }) as unknown as ApplySuggestionError;
  }

  let at = candidates[0] as number;
  if (candidates.length > 1 && line !== null) {
    at = nearestToLine(content, candidates, line);
  }

  const updated = content.slice(0, at) + suggestion.newText + content.slice(at + suggestion.oldText.length);
  try {
    await writeFile(target, updated, 'utf8');
  } catch (error) {
    throw Object.assign(new Error(`cannot write ${file}: ${(error as Error).message}`), { reason: 'io' }) as unknown as ApplySuggestionError;
  }
}

function indicesOf(content: string, needle: string): number[] {
  const out: number[] = [];
  let from = 0;
  for (;;) {
    const at = content.indexOf(needle, from);
    if (at === -1) break;
    out.push(at);
    from = at + needle.length;
  }
  return out;
}

function nearestToLine(content: string, indices: number[], line: number): number {
  let nearest = indices[0] as number;
  let best = Infinity;
  for (const at of indices) {
    const lineOf = content.slice(0, at).split('\n').length;
    const distance = Math.abs(lineOf - line);
    if (distance < best) {
      best = distance;
      nearest = at;
    }
  }
  return nearest;
}
