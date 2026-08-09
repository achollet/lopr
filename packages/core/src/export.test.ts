import { describe, expect, it } from 'vitest';
import { REVIEW_MD_FORMAT, exportReviewMarkdown } from './export.js';
import { addComment, createReview, logConflict, resolveComment } from './review.js';
import type { Review, ReviewComment } from './review.js';

const NOW = '2026-08-08T08:00:00.000Z';

function baseReview(): Review {
  return createReview({ id: 'review-1', baseBranch: 'main', headBranch: 'feature', now: () => NOW });
}

function root(review: Review, overrides: Partial<ReviewComment> = {}): Review {
  return addComment(review, {
    id: overrides.id ?? 'c1',
    file: 'src/a.ts',
    line: 3,
    origin: { sha: 'abc', line: 3 },
    context: ['line1', 'line2', 'line3', 'line4', 'line5'],
    contextAnchor: 2,
    body: 'rename this',
    now: () => NOW,
  });
}

describe('exportReviewMarkdown', () => {
  it('renders the stable header for an empty review', () => {
    const md = exportReviewMarkdown(baseReview());
    expect(md).toContain('# Local Pull Request');
    expect(md).toContain(`<!-- ${REVIEW_MD_FORMAT} -->`);
    expect(md).toContain('- id: review-1');
    expect(md).toContain('- base: main');
    expect(md).toContain('- head: feature');
    expect(md).toContain('- status: open');
    expect(md).toContain('- author: human');
    expect(md).toContain('- updated: ' + NOW);
    expect(md).not.toContain('## Feedback');
    expect(md).not.toContain('## Non localized');
    expect(md).not.toContain('## Auto-resolved conflicts');
  });

  it('renders a thread with its snippet and the anchored line marked', () => {
    const md = exportReviewMarkdown(root(baseReview()));
    expect(md).toContain('## Feedback');
    expect(md).toContain('### `src/a.ts:3` — c1');
    expect(md).toContain('```text');
    expect(md).toContain('> line3');
    expect(md).toContain('rename this');
  });

  it('renders the inline suggestion as a diff block', () => {
    const review = addComment(baseReview(), {
      id: 'c1',
      file: 'src/a.ts',
      line: 1,
      origin: { sha: 'abc', line: 1 },
      context: ['a'],
      contextAnchor: 0,
      body: 'use b',
      suggestion: { oldText: 'a', newText: 'b' },
      now: () => NOW,
    });
    const md = exportReviewMarkdown(review);
    expect(md).toContain('Apply in `src/a.ts`:');
    expect(md).toContain('```diff');
    expect(md).toContain('-a');
    expect(md).toContain('+b');
  });

  it('renders a deletion suggestion without a blank line in the diff block', () => {
    const review = addComment(baseReview(), {
      id: 'c1',
      file: 'src/a.ts',
      line: 1,
      origin: { sha: 'abc', line: 1 },
      context: ['a'],
      contextAnchor: 0,
      body: 'drop it',
      suggestion: { oldText: 'a', newText: '' },
      now: () => NOW,
    });
    const md = exportReviewMarkdown(review);
    const block = md.slice(md.indexOf('```diff'), md.indexOf('```', md.indexOf('```diff') + 3));
    expect(block).toContain('-a');
    expect(block).not.toContain('+');
    expect(block).not.toMatch(/\n\n/);
  });

  it('nests replies under their root without their own snippet', () => {
    const withRoot = root(baseReview());
    const withReply = addComment(withRoot, {
      id: 'c2',
      parentId: 'c1',
      body: 'agreed',
      author: 'agent',
      now: () => NOW,
    });
    const md = exportReviewMarkdown(withReply);
    expect(md).toContain('#### agent — ' + NOW);
    expect(md).toContain('agreed');
    const feedback = md.slice(md.indexOf('## Feedback'), md.indexOf('## Non localized') === -1 ? undefined : md.indexOf('## Non localized'));
    const rootIndex = feedback.indexOf('### `src/a.ts:3`');
    const replyIndex = feedback.indexOf('#### agent');
    expect(rootIndex).toBeGreaterThan(-1);
    expect(replyIndex).toBeGreaterThan(rootIndex);
  });

  it('marks a resolved root without moving it', () => {
    const review = resolveComment(root(baseReview()), 'c1', { now: () => NOW });
    const md = exportReviewMarkdown(review);
    expect(md).toContain('### `src/a.ts:3` — c1 [resolved]');
    expect(md).not.toContain('## Non localized');
  });

  it('moves detached roots to the Non localized section', () => {
    const withRoot = root(baseReview());
    const review = { ...withRoot, comments: [{ ...withRoot.comments[0]!, status: 'detached' as const }] };
    const md = exportReviewMarkdown(review);
    expect(md).not.toContain('## Feedback');
    expect(md).toContain('## Non localized');
    expect(md).toContain('### `src/a.ts:3` — c1');
  });

  it('renders the auto-resolved conflicts log', () => {
    const review = logConflict(baseReview(), 'src/a.ts', { now: () => NOW });
    const md = exportReviewMarkdown(review);
    expect(md).toContain('## Auto-resolved conflicts');
    expect(md).toContain('- `src/a.ts` — ' + NOW + ' (main wins)');
  });

  it('escapes backticks inside inline paths', () => {
    const review = logConflict(baseReview(), 'src/we`ird.ts', { now: () => NOW });
    const md = exportReviewMarkdown(review);
    expect(md).toContain('src/we\\`ird.ts');
  });
});
