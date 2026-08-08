import { describe, expect, it } from 'vitest';
import {
  addComment,
  createReview,
  getThread,
  parseReview,
  resolveComment,
  ReviewError,
  transition,
} from './review.js';

const NOW = '2026-08-08T08:00:00.000Z';

function baseReview() {
  return createReview({ id: 'review-1', baseBranch: 'main', headBranch: 'feature', now: () => NOW });
}

describe('createReview', () => {
  it('creates an open review with an initial status log entry', () => {
    const review = baseReview();
    expect(review).toMatchObject({
      version: 1,
      id: 'review-1',
      status: 'open',
      statusLog: [{ from: null, to: 'open', at: NOW }],
      comments: [],
      createdAt: NOW,
      updatedAt: NOW,
    });
  });

  it('defaults the author to human', () => {
    expect(baseReview().author).toBe('human');
  });

  it('rejects an empty base branch', () => {
    expect(() => createReview({ baseBranch: '  ', headBranch: 'f' })).toThrow(ReviewError);
  });

  it('rejects an empty head branch', () => {
    expect(() => createReview({ baseBranch: 'main', headBranch: '' })).toThrow(ReviewError);
  });
});

describe('addComment', () => {
  const root = {
    body: 'rename this',
    file: 'src/a.ts',
    line: 12,
    origin: { sha: 'abc123', line: 10 },
    context: ['const a = 1;', 'const b = 2;'],
  };

  it('adds a root comment with anchors and context', () => {
    const review = addComment(baseReview(), { ...root, now: () => NOW });
    expect(review.comments).toHaveLength(1);
    expect(review.comments[0]).toMatchObject({
      parentId: null,
      file: 'src/a.ts',
      line: 12,
      endLine: null,
      origin: { sha: 'abc123', line: 10 },
      context: ['const a = 1;', 'const b = 2;'],
      status: 'active',
      suggestion: null,
      author: 'human',
      resolvedAt: null,
      createdAt: NOW,
    });
    expect(review.comments[0]!.id).not.toBe('');
  });

  it('returns a new review, leaving the original untouched', () => {
    const original = baseReview();
    const updated = addComment(original, root);
    expect(updated).not.toBe(original);
    expect(original.comments).toEqual([]);
  });

  it('trims the body', () => {
    const review = addComment(baseReview(), { ...root, body: '  spaced  ' });
    expect(review.comments[0]!.body).toBe('spaced');
  });

  it('rejects an empty body', () => {
    expect(() => addComment(baseReview(), { ...root, body: ' \n ' })).toThrow('comment body is required');
  });

  it('rejects a root comment without a file', () => {
    const { body, line, origin, context } = root;
    expect(() => addComment(baseReview(), { body, line, origin, context })).toThrow('requires a file');
  });

  it('rejects a root comment with an invalid line', () => {
    expect(() => addComment(baseReview(), { ...root, line: 0 })).toThrow('positive line');
    expect(() => addComment(baseReview(), { ...root, line: 1.5 })).toThrow('positive line');
    expect(() => addComment(baseReview(), { ...root, line: null })).toThrow('positive line');
  });

  it('rejects a root comment without an origin', () => {
    expect(() => addComment(baseReview(), { ...root, origin: undefined })).toThrow('origin');
    expect(() => addComment(baseReview(), { ...root, origin: { sha: ' ', line: 1 } })).toThrow('origin');
  });

  it('rejects a root comment without a context snapshot', () => {
    expect(() => addComment(baseReview(), { ...root, context: [] })).toThrow('context snapshot');
  });

  it('rejects a suggestion with empty oldText', () => {
    expect(() => addComment(baseReview(), { ...root, suggestion: { oldText: ' ', newText: 'x' } })).toThrow('oldText');
  });

  it('allows a suggestion with an empty newText (deletion)', () => {
    const review = addComment(baseReview(), { ...root, suggestion: { oldText: 'a', newText: '' } });
    expect(review.comments[0]!.suggestion).toEqual({ oldText: 'a', newText: '' });
  });

  it('adds a reply without anchors', () => {
    const withRoot = addComment(baseReview(), root);
    const review = addComment(withRoot, { parentId: withRoot.comments[0]!.id, body: 'agreed', now: () => NOW });
    expect(review.comments).toHaveLength(2);
    expect(review.comments[1]).toMatchObject({ parentId: withRoot.comments[0]!.id, file: null, line: null, origin: null });
  });

  it('rejects a reply to an unknown parent', () => {
    expect(() => addComment(baseReview(), { parentId: 'nope', body: 'x' })).toThrow('unknown parent comment');
  });

  it('bumps updatedAt', () => {
    const review = addComment(baseReview(), { ...root, now: () => '2026-08-08T09:00:00.000Z' });
    expect(review.updatedAt).toBe('2026-08-08T09:00:00.000Z');
  });
});

describe('transition', () => {
  it('allows open -> approved', () => {
    expect(transition(baseReview(), 'approved', { now: () => NOW }).status).toBe('approved');
  });

  it('rejects open -> merged', () => {
    expect(() => transition(baseReview(), 'merged')).toThrow('cannot transition open -> merged');
  });

  it('rejects a self transition', () => {
    expect(() => transition(baseReview(), 'open')).toThrow('already open');
  });

  it('rejects a transition from a terminal state', () => {
    const done = transition(baseReview(), 'done', { now: () => NOW });
    expect(() => transition(done, 'open')).toThrow('cannot transition done -> open');
  });

  it('records the transition in the status log', () => {
    const review = transition(baseReview(), 'approved', { now: () => NOW });
    expect(review.statusLog).toEqual([
      { from: null, to: 'open', at: NOW },
      { from: 'open', to: 'approved', at: NOW },
    ]);
  });

  it('walks request-changes -> approved -> merged -> done', () => {
    let r = transition(baseReview(), 'request-changes', { now: () => NOW });
    r = transition(r, 'approved', { now: () => NOW });
    r = transition(r, 'merged', { now: () => NOW });
    r = transition(r, 'done', { now: () => NOW });
    expect(r.status).toBe('done');
  });

  it('allows reopen from closed', () => {
    const closed = transition(baseReview(), 'closed', { now: () => NOW });
    expect(transition(closed, 'open', { now: () => NOW }).status).toBe('open');
  });
});

describe('resolveComment', () => {
  const withComment = addComment(baseReview(), {
    body: 'rename this',
    file: 'src/a.ts',
    line: 12,
    origin: { sha: 'abc123', line: 10 },
    context: ['const a = 1;'],
  });

  it('resolves an active comment with a timestamp', () => {
    const review = resolveComment(withComment, withComment.comments[0]!.id, { now: () => NOW });
    expect(review.comments[0]).toMatchObject({ status: 'resolved', resolvedAt: NOW });
  });

  it('resolves a detached comment (discard decision)', () => {
    const detached = {
      ...withComment,
      comments: [{ ...withComment.comments[0]!, status: 'detached' as const }],
    };
    expect(resolveComment(detached, detached.comments[0]!.id, { now: () => NOW }).comments[0]!.status).toBe('resolved');
  });

  it('rejects resolving twice', () => {
    const resolved = resolveComment(withComment, withComment.comments[0]!.id, { now: () => NOW });
    expect(() => resolveComment(resolved, resolved.comments[0]!.id)).toThrow('already resolved');
  });

  it('rejects an unknown comment id', () => {
    expect(() => resolveComment(withComment, 'nope')).toThrow('unknown comment');
  });
});

describe('getThread', () => {
  it('returns the thread from root to reply', () => {
    const withRoot = addComment(baseReview(), {
      body: 'root',
      file: 'src/a.ts',
      line: 1,
      origin: { sha: 'abc', line: 1 },
      context: ['x'],
    });
    const withReply = addComment(withRoot, { parentId: withRoot.comments[0]!.id, body: 'reply' });
    const thread = getThread(withReply, withReply.comments[1]!.id);
    expect(thread.map((c) => c.body)).toEqual(['root', 'reply']);
  });

  it('rejects an unknown comment id', () => {
    expect(() => getThread(baseReview(), 'nope')).toThrow('unknown comment');
  });
});

describe('parseReview', () => {
  it('parses a serialized review', () => {
    const review = addComment(baseReview(), {
      body: 'rename this',
      file: 'src/a.ts',
      line: 12,
      origin: { sha: 'abc123', line: 10 },
      context: ['const a = 1;'],
    });
    expect(parseReview(JSON.stringify(review))).toEqual(review);
  });

  it('rejects invalid JSON', () => {
    expect(() => parseReview('{oops')).toThrow('not valid JSON');
  });

  it('rejects an unsupported schema version', () => {
    expect(() => parseReview(JSON.stringify({ version: 2 }))).toThrow('unsupported review schema version');
  });

  it('rejects a malformed review (missing status)', () => {
    const review = baseReview();
    expect(() => parseReview(JSON.stringify({ ...review, status: undefined }))).toThrow('malformed review file');
  });

  it('rejects a review with malformed comments', () => {
    const review = { ...baseReview(), comments: [{ id: 42 }] };
    expect(() => parseReview(JSON.stringify(review))).toThrow('malformed review file');
  });
});
