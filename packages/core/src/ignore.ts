import { minimatch } from 'minimatch';

export function matchesIgnore(filePath: string, patterns: string[]): boolean {
  return patterns.some((pattern) => minimatch(filePath, pattern, { dot: true }));
}
