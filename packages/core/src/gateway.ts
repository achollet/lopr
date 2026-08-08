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
}
