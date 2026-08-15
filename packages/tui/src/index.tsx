import React from 'react';
import { render } from 'ink';
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { GitCli, ReviewService } from '@lopr/core';
import type { Review } from '@lopr/core';
import { JsonFileReviewStore } from '@lopr/core';
import { App } from './App.js';

export interface RunTuiOptions {
  reviewId?: string;
  cwd?: string;
}

export async function runTui(options: RunTuiOptions = {}): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const gateway = new GitCli();
  const repoRoot = await gateway.repoRoot(cwd);
  const store = new JsonFileReviewStore(path.join(repoRoot, '.lopr', 'reviews'));
  const service = new ReviewService({ gateway, store, cwd });

  const review =
    options.reviewId === undefined
      ? await service.resolveOrCreateCurrent()
      : await service.status(options.reviewId);
  const diff = await service.diffForReview(review.id);

  const actions = {
    postComment: (file: string, line: number, body: string): Promise<Review> =>
      service.comment({ reviewId: review.id, file, line, body }),
    approve: (): Promise<Review> => service.transition(review.id, 'approved'),
    requestChanges: (): Promise<Review> => service.transition(review.id, 'request-changes'),
    merge: (cleanup: boolean): Promise<Review> =>
      service.mergeReview(review.id, { consent: true, cleanup }),
    exportToFile: async (): Promise<string> => {
      const markdown = await service.exportReview(review.id);
      const file = path.join(repoRoot, 'REVIEW.md');
      await writeFile(file, markdown, 'utf8');
      return file;
    },
  };

  const app = render(
    <App review={review} diff={diff.files} actions={actions} onQuit={() => process.exit(0)} />,
  );

  await app.waitUntilExit();
}

export { App } from './App.js';
export {
  buildView,
  cursorAnchor,
  fileView,
  initialTuiState,
  reduce,
} from './state.js';
export type {
  Pane,
  TuiAction,
  TuiMode,
  TuiState,
  ViewLine,
} from './state.js';
