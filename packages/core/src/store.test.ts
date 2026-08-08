import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addComment, createReview } from './review.js';
import { JsonFileReviewStore, summaryOf } from './store.js';

const NOW = '2026-08-08T08:00:00.000Z';

describe('JsonFileReviewStore', () => {
  let dir: string;
  let store: JsonFileReviewStore;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'lopr-store-'));
    store = new JsonFileReviewStore(dir);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  function sampleReview(id: string, headBranch: string, at: string) {
    return createReview({ id, baseBranch: 'main', headBranch, now: () => at });
  }

  it('round-trips a review through save and load', async () => {
    let review = sampleReview('r1', 'feature', NOW);
    review = addComment(review, {
      body: 'rename this',
      file: 'src/a.ts',
      line: 12,
      origin: { sha: 'abc123', line: 10 },
      context: ['const a = 1;', 'const b = 2;'],
      suggestion: { oldText: 'x', newText: 'y' },
      now: () => NOW,
    });
    await store.save(review);
    expect(await store.load('r1')).toEqual(review);
  });

  it('returns null for a missing review', async () => {
    expect(await store.load('nope')).toBeNull();
  });

  it('lists reviews newest-first', async () => {
    await store.save(sampleReview('r1', 'f1', '2026-08-08T00:00:00.000Z'));
    await store.save(sampleReview('r2', 'f2', '2026-08-08T00:00:02.000Z'));
    const list = await store.list();
    expect(list.map((s) => s.id)).toEqual(['r2', 'r1']);
  });

  it('lists an empty directory as no reviews', async () => {
    expect(await store.list()).toEqual([]);
  });

  it('removes a review file', async () => {
    await store.save(sampleReview('r1', 'feature', NOW));
    await store.remove('r1');
    expect(await store.load('r1')).toBeNull();
  });

  it('throws when removing a missing review', async () => {
    await expect(store.remove('nope')).rejects.toThrow('no review');
  });

  it('leaves no temp file after a save', async () => {
    await store.save(sampleReview('r1', 'feature', NOW));
    expect(await readdir(dir)).toEqual(['r1.json']);
  });

  it('throws on malformed JSON instead of returning null', async () => {
    await writeFile(path.join(dir, 'bad.json'), '{not json', 'utf8');
    await expect(store.load('bad')).rejects.toThrow('not valid JSON');
  });

  it('throws on an unsupported schema version', async () => {
    await writeFile(path.join(dir, 'v2.json'), JSON.stringify({ version: 2 }), 'utf8');
    await expect(store.load('v2')).rejects.toThrow('unsupported review schema version');
  });

  it('rejects ids that could escape the store directory', async () => {
    const review = sampleReview('../escape', 'feature', NOW);
    await expect(store.save(review)).rejects.toThrow('invalid review id');
    await expect(store.load('../escape')).rejects.toThrow('invalid review id');
  });
});

describe('summaryOf', () => {
  it('counts threads and open threads', () => {
    let review = createReview({ id: 'r1', baseBranch: 'main', headBranch: 'f', now: () => NOW });
    const root = {
      body: 'root',
      file: 'src/a.ts',
      line: 1,
      origin: { sha: 'abc', line: 1 },
      context: ['x'],
      now: () => NOW,
    };
    review = addComment(review, root);
    review = addComment(review, { ...root, body: 'root2', line: 2 });
    review = addComment(review, { parentId: review.comments[0]!.id, body: 'reply' });
    expect(summaryOf(review)).toMatchObject({ threadCount: 2, openThreadCount: 2 });
  });
});
