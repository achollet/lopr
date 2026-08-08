import { minimatch } from 'minimatch';

/** True when `filePath` matches any ignore pattern. */
export function matchesIgnore(filePath: string, patterns: string[]): boolean {
  return patterns.some((pattern) => minimatch(filePath, pattern, { dot: true }));
}
