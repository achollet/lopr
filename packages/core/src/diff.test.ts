import { afterEach, describe, expect, it } from 'vitest';
import { getDiffBetween, getThreeDotDiff, newSideFileProvider } from './diff.js';
import { GitCli } from './gateway.js';
import { makeRepo, type TestRepo } from './test-utils.js';

const repos: TestRepo[] = [];

function newRepo(): TestRepo {
  const repo = makeRepo();
  repos.push(repo);
  return repo;
}

afterEach(() => {
  for (const repo of repos) repo.cleanup();
  repos.length = 0;
});

describe('getThreeDotDiff', () => {
  it('detects added, modified, deleted and renamed files with bodies', async () => {
    const repo = newRepo();
    repo.write('a.txt', 'a1\n');
    repo.write('c.txt', 'c1\n');
    repo.write('d.txt', 'd1\n');
    repo.commit('base');
    repo.git('checkout', '-b', 'feature');
    repo.write('a.txt', 'a2\n');
    repo.git('rm', 'c.txt');
    repo.git('mv', 'd.txt', 'e.txt');
    repo.write('b.txt', 'b1\n');
    repo.commit('feature work');

    const diff = await getThreeDotDiff(new GitCli(), { cwd: repo.dir });
    const byPath = new Map(diff.files.map((f) => [f.path, f]));

    expect(diff.base).toBe('main');
    expect(byPath.get('a.txt')).toMatchObject({ status: 'modified', additions: 1, deletions: 1 });
    expect(byPath.get('b.txt')).toMatchObject({ status: 'added' });
    expect(byPath.get('e.txt')).toMatchObject({ status: 'renamed', oldPath: 'd.txt' });
    expect(byPath.get('c.txt')).toMatchObject({ status: 'deleted' });
    for (const file of diff.files) {
      expect(file.body).toContain('diff --git');
    }
  });

  it('stays stable when the base advances (three-dot semantics)', async () => {
    const repo = newRepo();
    repo.write('a.txt', 'a1\n');
    repo.commit('base');
    repo.git('checkout', '-b', 'feature');
    repo.write('b.txt', 'b1\n');
    repo.commit('feature work');
    repo.git('checkout', 'main');
    repo.write('main-only.txt', 'm\n');
    repo.commit('main advanced');
    repo.git('checkout', 'feature');

    const diff = await getThreeDotDiff(new GitCli(), { cwd: repo.dir });
    const paths = diff.files.map((f) => f.path);
    expect(paths).toContain('b.txt');
    expect(paths).not.toContain('main-only.txt');
  });

  it('marks binary files', async () => {
    const repo = newRepo();
    repo.write('a.txt', 'a1\n');
    repo.commit('base');
    repo.git('checkout', '-b', 'feature');
    repo.writeBinary('img.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0x02]));
    repo.commit('add png');

    const diff = await getThreeDotDiff(new GitCli(), { cwd: repo.dir });
    const png = diff.files.find((f) => f.path === 'img.png');
    expect(png?.binary).toBe(true);
    expect(png?.additions).toBe(0);
    expect(png?.deletions).toBe(0);
  });

  it('filters generated files via .lopr/config.json ignore patterns', async () => {
    const repo = newRepo();
    repo.write('a.txt', 'a1\n');
    repo.commit('base');
    repo.git('checkout', '-b', 'feature');
    repo.write('dist/out.js', 'console.log(1)\n');
    repo.write('src/index.js', 'export const x = 1;\n');
    repo.write('.lopr/config.json', JSON.stringify({ ignore: ['**/dist/**'] }));
    repo.commit('feature');

    const diff = await getThreeDotDiff(new GitCli(), { cwd: repo.dir });
    const paths = diff.files.map((f) => f.path);
    expect(paths).toContain('src/index.js');
    expect(paths).not.toContain('dist/out.js');
  });

  it('honors explicit base/head', async () => {
    const repo = newRepo();
    repo.write('a.txt', 'a1\n');
    repo.commit('base');
    repo.git('checkout', '-b', 'feature');
    repo.write('b.txt', 'b1\n');
    repo.commit('feature');

    const diff = await getThreeDotDiff(new GitCli(), { cwd: repo.dir, base: 'main', head: 'feature' });
    expect(diff.base).toBe('main');
    expect(diff.head).toBe('feature');
  });

  it('returns an empty file list when base and head are equal', async () => {
    const repo = newRepo();
    repo.write('a.txt', 'a1\n');
    repo.commit('base');

    const diff = await getThreeDotDiff(new GitCli(), { cwd: repo.dir });
    expect(diff.files).toEqual([]);
  });

  it('throws with a clear message when no base branch exists', async () => {
    const repo = newRepo();
    repo.git('checkout', '-b', 'feature');
    repo.write('a.txt', 'a1\n');
    repo.commit('feature');

    await expect(getThreeDotDiff(new GitCli(), { cwd: repo.dir })).rejects.toThrow(/No base branch/);
  });
});

describe('getDiffBetween', () => {
  it('compares two trees directly, across a rewritten history', async () => {
    const repo = newRepo();
    repo.write('a.txt', 'v1\n');
    repo.commit('v1');
    repo.write('a.txt', 'v2\n');
    repo.commit('v2');

    const sha1 = repo.git('rev-parse', 'HEAD~1');
    const sha2 = repo.git('rev-parse', 'HEAD');
    const files = await getDiffBetween(new GitCli(), { old: sha1, new: sha2, cwd: repo.dir });

    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({ path: 'a.txt', status: 'modified' });
    expect(files[0]!.body).toContain('@@ -1 +1 @@');
  });
});

describe('newSideFileProvider', () => {
  it('reads file content at a commit and returns null for missing paths', async () => {
    const repo = newRepo();
    repo.write('a.txt', 'line1\nline2\n');
    repo.commit('v1');
    const sha = repo.git('rev-parse', 'HEAD');
    const provider = newSideFileProvider(new GitCli(), sha, repo.dir);

    expect(await provider('a.txt')).toEqual(['line1', 'line2']);
    expect(await provider('missing.txt')).toBeNull();
  });
});
