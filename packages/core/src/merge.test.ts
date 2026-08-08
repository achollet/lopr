import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { GitCli } from './gateway.js';
import { ReviewError } from './review.js';
import { ReviewService } from './service.js';
import { summaryOf, type ReviewStore } from './store.js';
import type { Review } from './review.js';
import { makeRepo } from './test-utils.js';
import type { TestRepo } from './test-utils.js';

const NOW = '2026-08-08T08:00:00.000Z';

const repos: TestRepo[] = [];
function repo() {
  const r = makeRepo();
  repos.push(r);
  return r;
}
afterEach(() => {
  for (const r of repos.splice(0)) r.cleanup();
});

class MemoryStore implements ReviewStore {
  readonly map = new Map<string, Review>();
  async save(review: Review) {
    this.map.set(review.id, review);
  }
  async load(id: string) {
    return this.map.get(id) ?? null;
  }
  async list() {
    return [...this.map.values()].map(summaryOf);
  }
  async remove(id: string) {
    this.map.delete(id);
  }
}

function makeService(dir: string) {
  const store = new MemoryStore();
  return {
    store,
    service: new ReviewService({ gateway: new GitCli(), store, cwd: dir, now: () => NOW }),
  };
}

function file(dir: string, name: string): string {
  return readFileSync(path.join(dir, name), 'utf8');
}

describe('ReviewService.mergeReview', () => {
  it('merges an approved review with a --no-ff commit and marks it merged', async () => {
    const r = repo();
    r.write('base.txt', 'base\n');
    r.commit('base');
    r.git('checkout', '-b', 'feature');
    r.write('feature.txt', 'feat\n');
    r.commit('feat');
    const { store, service } = makeService(r.dir);

    const review = await service.newReview();
    await service.approve(review.id);
    const merged = await service.mergeReview(review.id, { consent: true });

    expect(merged.status).toBe('merged');
    expect(await store.load(review.id)).toMatchObject({ status: 'merged' });
    expect(r.git('rev-list', '--parents', '-n', '1', 'HEAD').split(' ')).toHaveLength(3);
    expect(file(r.dir, 'feature.txt')).toBe('feat\n');
    expect(r.git('symbolic-ref', '--short', 'HEAD')).toBe('main');
  });

  it('refuses to merge without consent', async () => {
    const r = repo();
    r.write('main.txt', 'base\n');
    r.commit('base');
    r.git('checkout', '-b', 'feature');
    r.write('f.txt', 'x\n');
    r.commit('feat');
    const { service } = makeService(r.dir);

    const review = await service.newReview();
    await service.approve(review.id);
    await expect(service.mergeReview(review.id, { consent: false })).rejects.toThrow('consent');
  });

  it('refuses to merge a non-approved review', async () => {
    const r = repo();
    r.write('main.txt', 'base\n');
    r.commit('base');
    r.git('checkout', '-b', 'feature');
    r.write('f.txt', 'x\n');
    r.commit('feat');
    const { service } = makeService(r.dir);

    const review = await service.newReview();
    await expect(service.mergeReview(review.id, { consent: true })).rejects.toThrow(ReviewError);
  });

  it('resolves conflicts main-wins and journalises them', async () => {
    const r = repo();
    r.write('a.txt', 'main\nbase\n');
    r.commit('base');
    r.git('checkout', '-b', 'feature');
    r.write('a.txt', 'feature\nbase\n');
    r.commit('feat');
    r.git('checkout', 'main');
    r.write('a.txt', 'main\nnew\n');
    r.commit('base change');
    r.git('checkout', 'feature');
    const { service } = makeService(r.dir);

    const review = await service.newReview();
    await service.approve(review.id);
    const merged = await service.mergeReview(review.id, { consent: true });

    expect(merged.status).toBe('merged');
    expect(merged.conflicts).toEqual([{ path: 'a.txt', at: NOW }]);
    expect(file(r.dir, 'a.txt')).toBe('main\nnew\n');
    const parents = r.git('rev-list', '--parents', '-n', '1', 'HEAD').split(' ');
    expect(parents).toHaveLength(3);
  });

  it('aborts cleanly when the merge fails without conflicts', async () => {
    const r = repo();
    r.write('main.txt', 'base\n');
    r.commit('base');
    r.git('checkout', '--orphan', 'feature');
    r.write('f.txt', 'x\n');
    r.commit('feat');
    const { service } = makeService(r.dir);

    const review = await service.newReview();
    await service.approve(review.id);
    await expect(service.mergeReview(review.id, { consent: true })).rejects.toThrow(ReviewError);
    expect(r.git('status', '--porcelain')).toBe('');
    expect(r.git('rev-list', '--parents', '-n', '1', 'HEAD').split(' ')).toHaveLength(1);
  });

  it('is a no-op commit when the head is already contained in the base', async () => {
    const r = repo();
    r.write('f.txt', 'x\n');
    r.commit('base');
    r.git('checkout', '-b', 'feature');
    r.git('checkout', 'main');
    const { service } = makeService(r.dir);
    r.git('checkout', 'feature');

    const review = await service.newReview();
    await service.approve(review.id);
    const merged = await service.mergeReview(review.id, { consent: true });
    expect(merged.status).toBe('merged');
  });

  it('cleanup deletes the head branch and the review file', async () => {
    const r = repo();
    r.write('main.txt', 'base\n');
    r.commit('base');
    r.git('checkout', '-b', 'feature');
    r.write('f.txt', 'x\n');
    r.commit('feat');
    const { store, service } = makeService(r.dir);

    const review = await service.newReview();
    await service.approve(review.id);
    await service.mergeReview(review.id, { consent: true, cleanup: true });

    expect(r.git('branch', '--list', 'feature')).toBe('');
    expect(await store.load(review.id)).toBeNull();
  });
});
