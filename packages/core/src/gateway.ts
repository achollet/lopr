import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export class GitError extends Error {
  constructor(
    message: string,
    public readonly args: string[],
    public readonly cwd?: string,
    public readonly stderr?: string,
  ) {
    super(message);
    this.name = 'GitError';
  }
}

/** Outcome of `git merge --no-commit --no-ff`. */
export interface MergeResult {
  /** True when the merge applied cleanly (staged, nothing left to resolve). */
  merged: boolean;
  /** True when head was already contained in base — no commit is needed. */
  upToDate: boolean;
  /** Paths with unmerged (conflicted) entries when `merged` is false. */
  conflicts: string[];
  /** git stderr when the merge failed for a non-conflict reason. */
  failure?: string;
}

/** Low-level git operations. Everything is async and runs against the system git. */
export interface GitGateway {
  /** Absolute path of the repository root (searched from `cwd`). */
  repoRoot(cwd?: string): Promise<string>;
  /** Current branch name, or `HEAD` when detached. */
  currentBranch(cwd?: string): Promise<string>;
  /** True when a local branch with that name exists. */
  branchExists(ref: string, cwd?: string): Promise<boolean>;
  /** First existing of `main`/`master`, or null. */
  defaultBranch(cwd?: string): Promise<string | null>;
  mergeBase(a: string, b: string, cwd?: string): Promise<string>;
  /** `git diff --merge-base <base> <head> -M --name-status -z`. */
  diffNameStatus(base: string, head: string, cwd?: string): Promise<string>;
  /** `git diff --merge-base <base> <head> -M --numstat -z`. */
  diffNumstat(base: string, head: string, cwd?: string): Promise<string>;
  /** `git diff --merge-base <base> <head> -M --no-color` (full unified diff). */
  diffBody(base: string, head: string, cwd?: string): Promise<string>;
  /** `git diff <a> <b> -M --name-status -z` (two-dot, tree-to-tree). */
  diffNameStatusBetween(a: string, b: string, cwd?: string): Promise<string>;
  /** `git diff <a> <b> -M --numstat -z`. */
  diffNumstatBetween(a: string, b: string, cwd?: string): Promise<string>;
  /** `git diff <a> <b> -M --no-color` (full unified diff). */
  diffBodyBetween(a: string, b: string, cwd?: string): Promise<string>;
  /** `git show <sha>:<path>` — file content at a commit, null when missing. */
  showFile(sha: string, path: string, cwd?: string): Promise<string | null>;
  /** `git rev-parse <ref>` — full commit sha of a branch/tag/sha. */
  revParse(ref: string, cwd?: string): Promise<string>;
  /** `git checkout <branch>`. */
  checkout(branch: string, cwd?: string): Promise<void>;
  /** `git merge --no-commit --no-ff <branch>`; conflicts leave the merge in progress. */
  mergeNoCommit(branch: string, cwd?: string): Promise<MergeResult>;
  /** Paths currently in an unmerged (conflicted) state. */
  unmergedPaths(cwd?: string): Promise<string[]>;
  /** Resolve conflicts main-wins: keep the checked-out base's version. */
  resolveOurs(paths: string[], cwd?: string): Promise<void>;
  /** `git merge --abort`. */
  abortMerge(cwd?: string): Promise<void>;
  /** `git commit --no-verify -m <message>`. */
  commitAll(message: string, cwd?: string): Promise<void>;
  /** `git branch -D <branch>`. */
  deleteBranch(branch: string, cwd?: string): Promise<void>;
}

export class GitCli implements GitGateway {
  constructor(private readonly binary: string = 'git') {}

  private async run(args: string[], cwd?: string): Promise<string> {
    try {
      const { stdout } = await execFileAsync(this.binary, args, {
        cwd,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
        env: { ...process.env, LC_ALL: 'C' },
      });
      return stdout;
    } catch (err) {
      const e = err as { stderr?: string; code?: string; message: string };
      throw new GitError(
        `git ${args.join(' ')} failed${e.stderr ? `: ${e.stderr.trim()}` : ''}`,
        args,
        cwd,
        e.stderr,
      );
    }
  }

  async repoRoot(cwd = process.cwd()): Promise<string> {
    return (await this.run(['rev-parse', '--show-toplevel'], cwd)).trim();
  }

  async currentBranch(cwd = process.cwd()): Promise<string> {
    const out = (await this.run(['symbolic-ref', '--short', '-q', 'HEAD'], cwd)).trim();
    return out || 'HEAD';
  }

  async branchExists(ref: string, cwd = process.cwd()): Promise<boolean> {
    try {
      await this.run(['rev-parse', '--verify', '--quiet', `refs/heads/${ref}`], cwd);
      return true;
    } catch {
      return false;
    }
  }

  async defaultBranch(cwd = process.cwd()): Promise<string | null> {
    for (const candidate of ['main', 'master']) {
      if (await this.branchExists(candidate, cwd)) return candidate;
    }
    return null;
  }

  async mergeBase(a: string, b: string, cwd = process.cwd()): Promise<string> {
    return (await this.run(['merge-base', a, b], cwd)).trim();
  }

  async diffNameStatus(base: string, head: string, cwd = process.cwd()): Promise<string> {
    return this.run(['diff', '--merge-base', base, head, '-M', '--name-status', '-z'], cwd);
  }

  async diffNumstat(base: string, head: string, cwd = process.cwd()): Promise<string> {
    return this.run(['diff', '--merge-base', base, head, '-M', '--numstat', '-z'], cwd);
  }

  async diffBody(base: string, head: string, cwd = process.cwd()): Promise<string> {
    return this.run(['diff', '--merge-base', base, head, '-M', '--no-color'], cwd);
  }

  async diffNameStatusBetween(a: string, b: string, cwd = process.cwd()): Promise<string> {
    return this.run(['diff', a, b, '-M', '--name-status', '-z'], cwd);
  }

  async diffNumstatBetween(a: string, b: string, cwd = process.cwd()): Promise<string> {
    return this.run(['diff', a, b, '-M', '--numstat', '-z'], cwd);
  }

  async diffBodyBetween(a: string, b: string, cwd = process.cwd()): Promise<string> {
    return this.run(['diff', a, b, '-M', '--no-color'], cwd);
  }

  async showFile(sha: string, path: string, cwd = process.cwd()): Promise<string | null> {
    try {
      return await this.run(['show', `${sha}:${path}`], cwd);
    } catch (err) {
      if ((err as GitError).stderr?.includes('does not exist')) return null;
      throw err;
    }
  }

  async revParse(ref: string, cwd = process.cwd()): Promise<string> {
    return (await this.run(['rev-parse', ref], cwd)).trim();
  }

  async checkout(branch: string, cwd = process.cwd()): Promise<void> {
    await this.run(['checkout', branch], cwd);
  }

  async mergeNoCommit(branch: string, cwd = process.cwd()): Promise<MergeResult> {
    let stdout = '';
    let failure: unknown = null;
    try {
      ({ stdout } = await execFileAsync(this.binary, ['merge', '--no-commit', '--no-ff', branch], {
        cwd,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
        env: { ...process.env, LC_ALL: 'C' },
      }));
    } catch (err) {
      failure = err;
    }
    if (failure === null) {
      return { merged: true, upToDate: stdout.includes('Already up to date'), conflicts: [] };
    }
    const conflicts = await this.unmergedPaths(cwd);
    if (conflicts.length === 0) {
      const e = failure as { stderr?: string };
      return { merged: false, upToDate: false, conflicts: [], failure: e.stderr?.trim() };
    }
    return { merged: false, upToDate: false, conflicts };
  }

  async unmergedPaths(cwd = process.cwd()): Promise<string[]> {
    const out = await this.run(['diff', '--name-only', '--diff-filter=U', '-z'], cwd);
    return out.split('\0').filter((p) => p.length > 0);
  }

  async resolveOurs(paths: string[], cwd = process.cwd()): Promise<void> {
    for (const p of paths) {
      try {
        await this.run(['checkout', '--ours', '--', p], cwd);
      } catch {
        // ours deleted the path (main-wins): finalise the deletion instead.
        await this.run(['rm', '-f', '--', p], cwd);
      }
      await this.run(['add', '--', p], cwd);
    }
  }

  async abortMerge(cwd = process.cwd()): Promise<void> {
    await this.run(['merge', '--abort'], cwd);
  }

  async commitAll(message: string, cwd = process.cwd()): Promise<void> {
    await this.run(['commit', '--no-verify', '-m', message], cwd);
  }

  async deleteBranch(branch: string, cwd = process.cwd()): Promise<void> {
    await this.run(['branch', '-D', branch], cwd);
  }
}
