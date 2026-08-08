import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { GitCli, JsonFileReviewStore, ReviewService } from '@lopr/core';
import { makeRepo } from '@lopr/core';
import { ReviewController, type HostMessage, type WebviewMessage } from './controller.js';
import { diffViewFiles } from './diffView.js';

async function boot(repo: { dir: string }) {
  const gateway = new GitCli();
  const store = new JsonFileReviewStore(path.join(repo.dir, '.lopr', 'reviews'));
  const service = new ReviewService({ gateway, store, cwd: repo.dir });
  return new ReviewController({ service, repoRoot: repo.dir });
}

function setupRepo() {
  const repo = makeRepo();
  repo.write('src/a.ts', 'line one\nline two\nline three\n');
  repo.commit('base');
  repo.git('checkout', '-b', 'feature');
  repo.write('src/a.ts', 'line one\nline two NEW\nline three\n');
  repo.write('src/b.ts', 'b content\n');
  repo.commit('feature work');
  return repo;
}

async function send(controller: ReviewController, message: WebviewMessage): Promise<HostMessage> {
  return controller.handle(message);
}

async function reviewIdOf(controller: ReviewController): Promise<string> {
  const init = await send(controller, { type: 'init', reviewId: '(current branch)' });
  if (init.type !== 'init') throw new Error(`expected init, got ${init.type}`);
  return init.payload.review.id;
}

describe('ReviewController.init', () => {
  it('returns the review state and a parsed diff', async () => {
    const repo = setupRepo();
    const controller = await boot(repo);
    const reply = await send(controller, { type: 'init', reviewId: '(current branch)' });

    expect(reply.type).toBe('init');
    if (reply.type !== 'init') return;
    expect(reply.payload.review.headBranch).toBe('feature');
    expect(reply.payload.review.baseBranch).toBe('main');
    expect(reply.payload.diff.map((f) => f.path)).toEqual(['src/a.ts', 'src/b.ts']);
    const a = reply.payload.diff.find((f) => f.path === 'src/a.ts');
    expect(a?.lines).toEqual(
      expect.arrayContaining([
        { kind: 'context', oldLine: 1, newLine: 1, text: 'line one' },
        { kind: 'removed', oldLine: 2, text: 'line two' },
        { kind: 'added', newLine: 2, text: 'line two NEW' },
      ]),
    );
    repo.cleanup();
  });

  it('surfaces unknown-review errors as an error message', async () => {
    const repo = setupRepo();
    const controller = await boot(repo);
    const reply = await send(controller, { type: 'init', reviewId: 'nope' });
    expect(reply.type).toBe('error');
    repo.cleanup();
  });
});

describe('ReviewController mutations', () => {
  it('comments, transitions, resolves and updates the webview', async () => {
    const repo = setupRepo();
    const controller = await boot(repo);
    const reviewId = await reviewIdOf(controller);

    const commentReply = await send(controller, {
      type: 'comment',
      reviewId,
      file: 'src/a.ts',
      line: 2,
      body: 'nit: wording',
    });
    expect(commentReply.type).toBe('update');
    if (commentReply.type !== 'update') return;
    const root = commentReply.payload.review.comments.find((c) => c.file === 'src/a.ts');
    expect(root?.body).toBe('nit: wording');

    const replyMsg = await send(controller, {
      type: 'comment',
      reviewId,
      file: 'src/a.ts',
      line: 2,
      body: 'agreed',
      replyTo: root?.id,
    });
    if (replyMsg.type !== 'update') return;
    expect(replyMsg.payload.review.comments.filter((c) => c.parentId === root?.id)).toHaveLength(1);

    const transition = await send(controller, { type: 'transition', reviewId, status: 'approved' });
    expect(transition.type).toBe('update');
    if (transition.type === 'update') expect(transition.payload.review.status).toBe('approved');

    const resolved = await send(controller, { type: 'resolve', reviewId, commentId: root?.id as string });
    expect(resolved.type).toBe('update');
    if (resolved.type === 'update') {
      const found = resolved.payload.review.comments.find((c) => c.id === root?.id);
      expect(found?.status).toBe('resolved');
    }
    repo.cleanup();
  });

  it('exports REVIEW.md to the repo root', async () => {
    const repo = setupRepo();
    const controller = await boot(repo);
    const reviewId = await reviewIdOf(controller);
    const reply = await send(controller, { type: 'export', reviewId });
    expect(reply.type).toBe('exported');
    if (reply.type === 'exported') {
      const content = await readFile(reply.path, 'utf8');
      expect(content).toContain('lopr-review: v1');
    }
    repo.cleanup();
  });

  it('applies an inline suggestion and resolves the comment', async () => {
    const repo = setupRepo();
    const controller = await boot(repo);
    const reviewId = await reviewIdOf(controller);

    const created = await send(controller, {
      type: 'comment',
      reviewId,
      file: 'src/a.ts',
      line: 2,
      body: 'use CHANGED',
      suggestion: { oldText: 'line two NEW', newText: 'line two CHANGED' },
    });
    if (created.type !== 'update') return;
    const suggestionComment = created.payload.review.comments.find((c) => c.suggestion !== null);
    expect(suggestionComment).toBeTruthy();

    const reply = await send(controller, {
      type: 'applySuggestion',
      reviewId,
      commentId: suggestionComment?.id as string,
    });
    expect(reply.type).toBe('update');
    const file = path.join(repo.dir, 'src', 'a.ts');
    const content = await readFile(file, 'utf8');
    expect(content).toContain('line two CHANGED');
    if (reply.type === 'update') {
      expect(reply.payload.review.comments.find((c) => c.id === suggestionComment?.id)?.status).toBe('resolved');
    }
    repo.cleanup();
  });

  it('reports a missing suggestion anchor as an error', async () => {
    const repo = setupRepo();
    const controller = await boot(repo);
    const reviewId = await reviewIdOf(controller);
    const reply = await send(controller, { type: 'applySuggestion', reviewId, commentId: 'missing' });
    expect(reply.type).toBe('error');
    repo.cleanup();
  });
});

describe('diffViewFiles', () => {
  it('marks binaries as empty', () => {
    const view = diffViewFiles([
      {
        path: 'img.png',
        status: 'added',
        binary: true,
        additions: 0,
        deletions: 0,
        body: 'Binary files differ',
      },
    ]);
    expect(view[0]?.lines).toEqual([]);
    expect(view[0]?.binary).toBe(true);
  });
});
