import { loadConfig } from './config.js';
import { GitError, type GitGateway } from './gateway.js';
import { matchesIgnore } from './ignore.js';
import type { ChangeStatus, FileDiff, ThreeDotDiff } from './types.js';

export interface DiffOptions {
  /** Base branch/ref. Default: `.lopr/config.json` `base`, else git default branch. */
  base?: string;
  /** Head ref. Default: current branch (or `HEAD` when detached). */
  head?: string;
  cwd?: string;
  /** Ignore globs overriding the ones from `.lopr/config.json`. */
  ignore?: string[];
}

const STATUS_MAP: Record<string, ChangeStatus> = {
  A: 'added',
  D: 'deleted',
  M: 'modified',
  R: 'renamed',
  C: 'copied',
  T: 'typechange',
  U: 'unmerged',
};

function mapStatus(code: string): ChangeStatus {
  return STATUS_MAP[code] ?? 'unknown';
}

interface NameStatusEntry {
  code: string;
  oldPath?: string;
  newPath?: string;
  path?: string;
}

function parseNameStatus(stdout: string): NameStatusEntry[] {
  const entries: NameStatusEntry[] = [];
  const fields = stdout.split('\0');
  let i = 0;
  while (i < fields.length) {
    const status = fields[i++];
    if (status === undefined || status === '') continue;
    const code = status[0]!;
    if (code === 'R' || code === 'C') {
      const oldPath = fields[i++];
      const newPath = fields[i++];
      if (oldPath === undefined || newPath === undefined) break;
      entries.push({ code, oldPath, newPath });
    } else {
      const path = fields[i++];
      if (path === undefined) break;
      entries.push({ code, path });
    }
  }
  return entries;
}

interface NumstatStat {
  additions: number;
  deletions: number;
  binary: boolean;
}

function parseNumstat(stdout: string): Map<string, NumstatStat> {
  const map = new Map<string, NumstatStat>();
  for (const record of stdout.split('\0')) {
    if (!record) continue;
    const parts = record.split('\t');
    const additions = parts[0] === '-' ? 0 : Number(parts[0]);
    const deletions = parts[1] === '-' ? 0 : Number(parts[1]);
    map.set(parts.slice(2).join('\t'), { additions, deletions, binary: parts[0] === '-' && parts[1] === '-' });
  }
  return map;
}

/** Split a full `git diff` output into per-file bodies. */
function splitBodies(stdout: string): string[] {
  if (!stdout) return [];
  return stdout
    .split(/(?=^diff --git )/m)
    .filter((part) => part.startsWith('diff --git'))
    .map((part) => part.replace(/\n$/, ''));
}

function assembleFiles(nameStatus: string, numstat: string, body: string, ignore: string[]): FileDiff[] {
  const entries = parseNameStatus(nameStatus);
  const stats = parseNumstat(numstat);
  const bodies = splitBodies(body);
  if (bodies.length !== entries.length) {
    throw new Error(`diff body/name-status mismatch: ${bodies.length} bodies vs ${entries.length} files`);
  }

  const files: FileDiff[] = [];
  entries.forEach((entry, index) => {
    const path = entry.path ?? entry.newPath!;
    if (matchesIgnore(path, ignore)) return;
    const stat = stats.get(path);
    const fileDiff: FileDiff = {
      path,
      status: mapStatus(entry.code),
      binary: stat?.binary ?? false,
      additions: stat?.additions ?? 0,
      deletions: stat?.deletions ?? 0,
      body: bodies[index] ?? '',
    };
    if (entry.oldPath !== undefined) fileDiff.oldPath = entry.oldPath;
    files.push(fileDiff);
  });

  return files;
}

/**
 * The GitHub-style three-dot diff: `merge-base(base, head)..head`. Same
 * semantic as a GitHub PR — stable when the base branch moves.
 */
export async function getThreeDotDiff(gateway: GitGateway, options: DiffOptions = {}): Promise<ThreeDotDiff> {
  const cwd = options.cwd ?? process.cwd();
  const repoRoot = await gateway.repoRoot(cwd);
  const config = await loadConfig(repoRoot);
  const ignore = options.ignore ?? config.ignore;
  const base = options.base ?? config.base ?? (await gateway.defaultBranch(cwd));
  if (!base) {
    throw new GitError(
      'No base branch: pass --base, set "base" in .lopr/config.json, or create main/master.',
      ['diff'],
      cwd,
    );
  }
  const head = options.head ?? (await gateway.currentBranch(cwd));
  const mergeBase = await gateway.mergeBase(base, head, cwd);

  const [nameStatus, numstat, body] = await Promise.all([
    gateway.diffNameStatus(base, head, cwd),
    gateway.diffNumstat(base, head, cwd),
    gateway.diffBody(base, head, cwd),
  ]);

  return { base, head, mergeBase, files: assembleFiles(nameStatus, numstat, body, ignore) };
}

export interface DiffBetweenOptions {
  /** Old side of the tree-to-tree diff (a commit sha). */
  old: string;
  /** New side of the tree-to-tree diff (a commit sha). */
  new: string;
  ignore?: string[];
  cwd?: string;
}

/**
 * Two-dot, tree-to-tree diff between two commits — the shape the anchoring
 * engine re-anchors against. Unlike the three-dot form this compares the two
 * trees directly, so it stays correct when the agent rebases/amends history.
 */
export async function getDiffBetween(gateway: GitGateway, options: DiffBetweenOptions): Promise<FileDiff[]> {
  const cwd = options.cwd ?? process.cwd();
  const ignore = options.ignore ?? [];
  const [nameStatus, numstat, body] = await Promise.all([
    gateway.diffNameStatusBetween(options.old, options.new, cwd),
    gateway.diffNumstatBetween(options.old, options.new, cwd),
    gateway.diffBodyBetween(options.old, options.new, cwd),
  ]);
  return assembleFiles(nameStatus, numstat, body, ignore);
}

/** Adapter feeding the anchoring engine new-side file contents from git. */
export function newFileProvider(gateway: GitGateway, sha: string, cwd?: string) {
  return async (path: string): Promise<string[] | null> => {
    const content = await gateway.showFile(sha, path, cwd);
    if (content === null) return null;
    return content.replace(/\n$/, '').split('\n');
  };
}
