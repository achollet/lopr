import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { GitCli, JsonFileReviewStore, ReviewService } from '@lopr/core';
import { main, parseArgs } from './cli.js';
import type { CliIO } from './cli.js';

function makeRepo() {
  const dir = mkdtempSync(path.join(tmpdir(), 'lopr-cli-'));
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '-b', 'main');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'Lopr Test');
  return { dir, git, write(file: string, content: string) { writeFileSync(path.join(dir, file), content); }, cleanup() { rmSync(dir, { recursive: true, force: true }); } };
}

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  const io: Partial<CliIO> = { out: (l) => out.push(l), err: (l) => err.push(l) };
  return { out, err, io };
}

function makeService(dir: string) {
  mkdirSync(path.join(dir, '.lopr', 'reviews'), { recursive: true });
  return new ReviewService({
    gateway: new GitCli(),
    store: new JsonFileReviewStore(path.join(dir, '.lopr', 'reviews')),
    cwd: dir,
  });
}

const repos: ReturnType<typeof makeRepo>[] = [];
function repo() {
  const r = makeRepo();
  repos.push(r);
  return r;
}
afterEach(() => {
  for (const r of repos.splice(0)) r.cleanup();
});

describe('parseArgs', () => {
  it('parses positionals and flags', () => {
    expect(parseArgs(['comment', 'r1', '--file', 'a.ts', '--line=3', '--yes'])).toEqual({
      positionals: ['comment', 'r1'],
      flags: { file: 'a.ts', line: '3', yes: true },
    });
  });

  it('treats -h as help', () => {
    expect(parseArgs(['-h']).flags).toEqual({ help: true });
  });
});

describe('main', () => {
  it('prints help on no command', async () => {
    const { out, io } = capture();
    const code = await main([], { io });
    expect(code).toBe(0);
    expect(out.join('\n')).toContain('Usage: lopr <command>');
  });

  it('creates a review', async () => {
    const r = repo();
    r.write('a.txt', 'x\n');
    r.git('add', '-A');
    r.git('commit', '-m', 'base');
    r.git('checkout', '-b', 'feature');
    const { out, io } = capture();

    const code = await main(['new'], { io, service: makeService(r.dir) });
    expect(code).toBe(0);
    expect(out[0]).toMatch(/^created review [a-f0-9-]+ \(feature -> main\)$/);
  });

  it('posts a root comment and a reply, then resolves', async () => {
    const r = repo();
    r.write('a.txt', 'line1\nline2\nline3\n');
    r.git('add', '-A');
    r.git('commit', '-m', 'base');
    r.git('checkout', '-b', 'feature');
    const service = makeService(r.dir);
    const { out, io } = capture();

    expect(await main(['new'], { io, service })).toBe(0);
    const id = out[0]!.split(' ')[2]!;
    expect(await main(['comment', id, '--file', 'a.txt', '--line', '2', '--body', 'fix this'], { io, service })).toBe(0);
    const rootId = out[out.length - 1]!.split(' ')[2]!;
    expect(await main(['comment', id, '--reply-to', rootId, '--body', 'will do'], { io, service })).toBe(0);
    expect(await main(['resolve', id, rootId], { io, service })).toBe(0);

    const review = await service.status(id);
    expect(review.comments[0]).toMatchObject({ status: 'resolved', file: 'a.txt', line: 2 });
    expect(review.comments[1]).toMatchObject({ parentId: rootId, body: 'will do' });
  });

  it('rejects a comment without a body', async () => {
    const r = repo();
    r.write('a.txt', 'x\n');
    r.git('add', '-A');
    r.git('commit', '-m', 'base');
    r.git('checkout', '-b', 'feature');
    const { err, io } = capture();

    expect(await main(['comment', 'r1', '--file', 'a.txt', '--line', '1'], { io, service: makeService(r.dir) })).toBe(1);
    expect(err.join('\n')).toContain('requires --body');
  });

  it('approves and lists', async () => {
    const r = repo();
    r.write('a.txt', 'x\n');
    r.git('add', '-A');
    r.git('commit', '-m', 'base');
    r.git('checkout', '-b', 'feature');
    const service = makeService(r.dir);
    const { out, io } = capture();

    expect(await main(['new'], { io, service })).toBe(0);
    const id = out[0]!.split(' ')[2]!;
    expect(await main(['approve', id], { io, service })).toBe(0);
    expect(await main(['list'], { io, service })).toBe(0);
    expect(out.join('\n')).toContain(id);
    expect(await service.status(id)).toMatchObject({ status: 'approved' });
  });

  it('merges only with consent and cleans up on request', async () => {
    const r = repo();
    r.write('a.txt', 'base\n');
    r.git('add', '-A');
    r.git('commit', '-m', 'base');
    r.git('checkout', '-b', 'feature');
    r.write('feature.txt', 'feat\n');
    r.git('add', '-A');
    r.git('commit', '-m', 'feat');
    const service = makeService(r.dir);
    const { out, io } = capture();

    expect(await main(['new'], { io, service })).toBe(0);
    const id = out[0]!.split(' ')[2]!;
    expect(await main(['approve', id], { io, service })).toBe(0);

    const denied = capture();
    await main(['merge', id], { io: { ...denied.io, ask: async () => 'n' }, service });
    expect(denied.out.join('\n')).toContain('merge aborted');

    const yes = capture();
    expect(await main(['merge', id, '--yes', '--cleanup'], { io: yes.io, service })).toBe(0);
    expect(yes.out.join('\n')).toContain('merged');
    expect(r.git('symbolic-ref', '--short', 'HEAD')).toBe('main');
    expect(r.git('branch', '--list', 'feature')).toBe('');
    expect(existsSync(path.join(r.dir, '.lopr', 'reviews', `${id}.json`))).toBe(false);
  });

  it('exports REVIEW.md', async () => {
    const r = repo();
    r.write('a.txt', 'line1\nline2\n');
    r.git('add', '-A');
    r.git('commit', '-m', 'base');
    r.git('checkout', '-b', 'feature');
    const service = makeService(r.dir);
    const { out, io } = capture();

    expect(await main(['new'], { io, service })).toBe(0);
    const id = out[0]!.split(' ')[2]!;
    const target = path.join(r.dir, 'REVIEW-out.md');
    expect(await main(['export', id, '--out', target], { io, service })).toBe(0);
    expect(existsSync(target)).toBe(true);
    expect(readFileSync(target, 'utf8')).toContain('# Local Pull Request');
  });

  it('fails on an unknown command', async () => {
    const { err, io } = capture();
    expect(await main(['nope'], { io })).toBe(1);
    expect(err.join('\n')).toContain('unknown command');
  });
});
