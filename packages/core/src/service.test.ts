import { describe, expect, it } from 'vitest';
import type { GitGateway } from './gateway.js';
import { ReviewError } from './review.js';
import type { Review } from './review.js';
import { ReviewService } from './service.js';
import type { ReviewStore, ReviewSummary } from './store.js';
import { summaryOf } from './store.js';

const NOW = '2026-08-08T08:00:00.000Z';

class FakeGateway implements GitGateway {
  current = 'feature';
  defaultBranchName = 'main';
  revParseMap = new Map<string, string>();
  files = new Map<string, Map<string, string>>();
  bodyBetween = '';
  nameStatusBetween = '';
  numstatBetween = '';
  diffCalls = 0;

  async repoRoot() {
    return '/fake';
  }
  async currentBranch() {
    return this.current;
  }
  async branchExists(ref: string) {
    return ref === this.defaultBranchName;
  }
  async defaultBranch() {
    return this.defaultBranchName;
  }
  async mergeBase() {
    return 'm'.repeat(40);
  }
  async diffNameStatus() {
    return '';
  }
  async diffNumstat() {
    return '';
  }
  async diffBody() {
    return '';
  }
  async diffNameStatusBetween() {
    return this.nameStatusBetween;
  }
  async diffNumstatBetween() {
    return this.numstatBetween;
  }
  async diffBodyBetween() {
    this.diffCalls += 1;
    return this.bodyBetween;
  }
  async showFile(sha: string, path: string) {
    const value = this.files.get(sha)?.get(path);
    return value === undefined ? null : value;
  }
  async revParse(ref: string) {
    const value = this.revParseMap.get(ref);
    if (value === undefined) throw new Error(`unknown ref: ${ref}`);
    return value;
  }
}

class MemoryStore implements ReviewStore {
  readonly map = new Map<string, Review>();
  async save(review: Review) {
    this.map.set(review.id, review);
  }
  async load(id: string) {
    return this.map.get(id) ?? null;
  }
  async list(): Promise<ReviewSummary[]> {
    return [...this.map.values()]
      .map(summaryOf)
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
  }
  async remove(id: string) {
    this.map.delete(id);
  }
}

function makeService(overrides: { gateway?: FakeGateway; store?: MemoryStore } = {}) {
  const gateway = overrides.gateway ?? new FakeGateway();
  const store = overrides.store ?? new MemoryStore();
  return { gateway, store, service: new ReviewService({ gateway, store, now: () => NOW }) };
}

describe('ReviewService.newReview', () => {
  it('resolves base/head from the gateway', async () => {
    const { store, service } = makeService();
    const review = await service.newReview();
    expect(review.baseBranch).toBe('main');
    expect(review.headBranch).toBe('feature');
    expect(await store.load(review.id)).toEqual(review);
  });

  it('honors explicit branches', async () => {
    const { service } = makeService();
    const review = await service.newReview({ baseBranch: 'develop', headBranch: 'topic' });
    expect(review.baseBranch).toBe('develop');
    expect(review.headBranch).toBe('topic');
  });
});

describe('ReviewService.comment', () => {
  it('captures the origin sha and the context snapshot around the line', async () => {
    const { gateway, service } = makeService();
    gateway.revParseMap.set('feature', 'sha-f1');
    gateway.files.set('sha-f1', new Map([['src/a.ts', 'line1\nline2\nline3\nline4\nline5\n']]));
    const review = await service.newReview();

    const updated = await service.comment({ reviewId: review.id, file: 'src/a.ts', line: 3, body: 'note' });
    expect(updated.comments[0]).toMatchObject({
      file: 'src/a.ts',
      line: 3,
      origin: { sha: 'sha-f1', line: 3 },
      body: 'note',
      status: 'active',
      parentId: null,
      contextAnchor: 2,
    });
    expect(updated.comments[0]!.context).toEqual(['line1', 'line2', 'line3', 'line4', 'line5']);
  });

  it('clamps the snapshot at the top of the file', async () => {
    const { gateway, service } = makeService();
    gateway.revParseMap.set('feature', 'sha-f1');
    gateway.files.set('sha-f1', new Map([['a.txt', 'a\nb\nc\n']]));
    const review = await service.newReview();

    const updated = await service.comment({ reviewId: review.id, file: 'a.txt', line: 1, body: 'top' });
    expect(updated.comments[0]!.context).toEqual(['a', 'b', 'c']);
    expect(updated.comments[0]!.contextAnchor).toBe(0);
  });

  it('stores an inline suggestion', async () => {
    const { gateway, service } = makeService();
    gateway.revParseMap.set('feature', 'sha-f1');
    gateway.files.set('sha-f1', new Map([['a.txt', 'a\n']]));
    const review = await service.newReview();

    const updated = await service.comment({
      reviewId: review.id,
      file: 'a.txt',
      line: 1,
      body: 'rename',
      suggestion: { oldText: 'a', newText: 'b' },
    });
    expect(updated.comments[0]!.suggestion).toEqual({ oldText: 'a', newText: 'b' });
  });

  it('posts a reply without anchors', async () => {
    const { gateway, service } = makeService();
    gateway.revParseMap.set('feature', 'sha-f1');
    gateway.files.set('sha-f1', new Map([['a.txt', 'a\n']]));
    const review = await service.newReview();
    const withRoot = await service.comment({ reviewId: review.id, file: 'a.txt', line: 1, body: 'root' });

    const updated = await service.comment({
      reviewId: review.id,
      parentId: withRoot.comments[0]!.id,
      file: 'a.txt',
      line: 1,
      body: 'reply',
    });
    expect(updated.comments[1]).toMatchObject({ parentId: withRoot.comments[0]!.id, file: null, line: null, origin: null });
  });

  it('rejects a line out of range', async () => {
    const { gateway, service } = makeService();
    gateway.revParseMap.set('feature', 'sha-f1');
    gateway.files.set('sha-f1', new Map([['a.txt', 'only\n']]));
    const review = await service.newReview();

    await expect(service.comment({ reviewId: review.id, file: 'a.txt', line: 5, body: 'x' })).rejects.toThrow(
      'out of range',
    );
  });

  it('rejects a missing file', async () => {
    const { gateway, service } = makeService();
    gateway.revParseMap.set('feature', 'sha-f1');
    gateway.files.set('sha-f1', new Map());
    const review = await service.newReview();

    await expect(service.comment({ reviewId: review.id, file: 'gone.txt', line: 1, body: 'x' })).rejects.toThrow(
      'file not found',
    );
  });
});

describe('ReviewService transitions', () => {
  it('walks request-changes -> approved -> merged -> done', async () => {
    const { service } = makeService();
    const review = await service.newReview();

    let r = await service.requestChanges(review.id);
    expect(r.status).toBe('request-changes');
    r = await service.approve(review.id);
    expect(r.status).toBe('approved');
    r = await service.transition(review.id, 'merged');
    expect(r.status).toBe('merged');
    r = await service.done(review.id);
    expect(r.status).toBe('done');
  });

  it('rejects invalid transitions through the store', async () => {
    const { service } = makeService();
    const review = await service.newReview();
    await expect(service.transition(review.id, 'merged')).rejects.toThrow(ReviewError);
  });

  it('persists the transition', async () => {
    const { store, service } = makeService();
    const review = await service.newReview();
    await service.approve(review.id);
    expect((await store.load(review.id))!.status).toBe('approved');
  });

  it('resolves a comment', async () => {
    const { gateway, service } = makeService();
    gateway.revParseMap.set('feature', 'sha-f1');
    gateway.files.set('sha-f1', new Map([['a.txt', 'a\n']]));
    const review = await service.newReview();
    const withComment = await service.comment({ reviewId: review.id, file: 'a.txt', line: 1, body: 'fix' });

    const updated = await service.resolve(review.id, withComment.comments[0]!.id);
    expect(updated.comments[0]).toMatchObject({ status: 'resolved', resolvedAt: NOW });
  });
});

describe('ReviewService.reanchor', () => {
  const INSERT_BEFORE = `diff --git a/a.txt b/a.txt
--- a/a.txt
+++ b/a.txt
@@ -1,4 +1,5 @@
 line1
 line2
 line3
+INSERTED
 line4
`;
  const REWRITTEN = `diff --git a/a.txt b/a.txt
--- a/a.txt
+++ b/a.txt
@@ -1,6 +1,6 @@
-aaa
-bbb
-ccc
-ddd
-eee
-fff
+zzz
+yyy
+xxx
+www
+vvv
+uuu
`;

  function setF1(gateway: FakeGateway) {
    gateway.revParseMap.set('feature', 'sha-f1');
    gateway.files.set('sha-f1', new Map([['a.txt', 'line1\nline2\nline3\nline4\nline5\nline6\n']]));
  }

  function setTwoDot(gateway: FakeGateway, body: string) {
    gateway.bodyBetween = body;
    gateway.nameStatusBetween = 'M\0a.txt\0';
    gateway.numstatBetween = '1\t1\ta.txt\0';
  }

  it('maps a surviving line through the head diff and keeps the origin', async () => {
    const { gateway, service } = makeService();
    setF1(gateway);
    const review = await service.newReview();
    await service.comment({ reviewId: review.id, file: 'a.txt', line: 4, body: 'note' });

    gateway.revParseMap.set('feature', 'sha-f2');
    gateway.files.set('sha-f2', new Map([['a.txt', 'line1\nline2\nline3\nINSERTED\nline4\nline5\nline6\n']]));
    setTwoDot(gateway, INSERT_BEFORE);

    const updated = await service.reanchor(review.id);
    expect(updated.comments[0]).toMatchObject({ file: 'a.txt', line: 5, status: 'active' });
    expect(updated.comments[0]!.origin).toEqual({ sha: 'sha-f1', line: 4 });
  });

  it('detaches a comment whose line and context are gone', async () => {
    const { gateway, service } = makeService();
    setF1(gateway);
    const review = await service.newReview();
    await service.comment({ reviewId: review.id, file: 'a.txt', line: 4, body: 'note' });

    gateway.revParseMap.set('feature', 'sha-f2');
    gateway.files.set('sha-f2', new Map([['a.txt', 'zzz\nyyy\nxxx\nwww\nvvv\nuuu\n']]));
    setTwoDot(gateway, REWRITTEN);

    const updated = await service.reanchor(review.id);
    expect(updated.comments[0]).toMatchObject({ status: 'detached', file: 'a.txt', line: 4 });
  });

  it('recovers a detached comment on a later iteration', async () => {
    const { gateway, service } = makeService();
    setF1(gateway);
    const review = await service.newReview();
    await service.comment({ reviewId: review.id, file: 'a.txt', line: 4, body: 'note' });

    gateway.revParseMap.set('feature', 'sha-f2');
    gateway.files.set('sha-f2', new Map([['a.txt', 'zzz\nyyy\nxxx\nwww\nvvv\nuuu\n']]));
    setTwoDot(gateway, REWRITTEN);
    await service.reanchor(review.id);

    gateway.revParseMap.set('feature', 'sha-f3');
    gateway.files.set('sha-f3', new Map([['a.txt', 'line1\nline2\nline3\nINSERTED\nline4\nline5\nline6\n']]));
    setTwoDot(gateway, INSERT_BEFORE);
    const updated = await service.reanchor(review.id);

    expect(updated.comments[0]).toMatchObject({ status: 'active', file: 'a.txt', line: 5 });
  });

  it('leaves comments untouched when already at the head', async () => {
    const { gateway, service } = makeService();
    setF1(gateway);
    const review = await service.newReview();
    const withComment = await service.comment({ reviewId: review.id, file: 'a.txt', line: 4, body: 'note' });

    const updated = await service.reanchor(review.id);
    expect(updated.comments).toEqual(withComment.comments);
    expect(gateway.diffCalls).toBe(0);
  });

  it('never re-anchors replies', async () => {
    const { gateway, service } = makeService();
    setF1(gateway);
    const review = await service.newReview();
    let withComments = await service.comment({ reviewId: review.id, file: 'a.txt', line: 4, body: 'root' });
    withComments = await service.comment({
      reviewId: review.id,
      parentId: withComments.comments[0]!.id,
      file: 'a.txt',
      line: 4,
      body: 'reply',
    });

    gateway.revParseMap.set('feature', 'sha-f2');
    gateway.files.set('sha-f2', new Map([['a.txt', 'line1\nline2\nline3\nINSERTED\nline4\nline5\nline6\n']]));
    setTwoDot(gateway, INSERT_BEFORE);

    const updated = await service.reanchor(review.id);
    expect(updated.comments[0]).toMatchObject({ line: 5, status: 'active' });
    expect(updated.comments[1]).toMatchObject({ body: 'reply', parentId: withComments.comments[0]!.id, line: null });
  });
});
