import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

export interface TestRepo {
  dir: string;
  write(file: string, content: string): void;
  writeBinary(file: string, data: Buffer): void;
  git(...args: string[]): string;
  commit(message: string): void;
  cleanup(): void;
}

export function makeRepo(): TestRepo {
  const dir = mkdtempSync(path.join(tmpdir(), 'lopr-'));
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '-b', 'main');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'Lopr Test');
  git('config', 'commit.gpgsign', 'false');

  return {
    dir,
    write(file, content) {
      const p = path.join(dir, file);
      mkdirSync(path.dirname(p), { recursive: true });
      writeFileSync(p, content);
    },
    writeBinary(file, data) {
      const p = path.join(dir, file);
      mkdirSync(path.dirname(p), { recursive: true });
      writeFileSync(p, data);
    },
    git,
    commit(message) {
      git('add', '-A');
      git('commit', '-m', message);
    },
    cleanup() {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
