import type { AutoResolvedConflict, Review, ReviewComment } from './review.js';

/**
 * Stable contract for REVIEW.md (lopr-review v1), the file an agent ingests to
 * apply the review. Pure: Review -> markdown, no I/O.
 *
 * Layout:
 *   # Local Pull Request          (title + <!-- lopr-review: v1 --> marker)
 *   - metadata (id, base, head, status, author, updated)
 *   ## Auto-resolved conflicts    (only when review.conflicts is non-empty)
 *   ## Feedback                   (one ### per root comment, grouped by file)
 *   ## Non localized              (detached roots, never silently dropped)
 *
 * A thread is rendered as:
 *   ### `path:line` — id [resolved]
 *   ```text                        (context snapshot, anchored line prefixed '> ')
 *   .../> anchored/...
 *   ```
 *   body
 *   Apply in `path`: + ```diff     (only when the comment carries a suggestion)
 *   #### author — createdAt        (replies, no snippet of their own)
 *   reply body
 */

export const REVIEW_MD_FORMAT = 'lopr-review: v1';

function escapeCode(value: string): string {
  return value.replace(/`/g, '\\`');
}

function snippet(comment: ReviewComment): string {
  const lines = comment.context.map((line, index) => (index === comment.contextAnchor ? `> ${line}` : line));
  return ['```text', ...lines, '```'].join('\n');
}

function suggestion(comment: ReviewComment): string | null {
  if (comment.suggestion === null || comment.file === null) return null;
  const { oldText, newText } = comment.suggestion;
  const diff = [`-${oldText}`, `+${newText}`];
  if (oldText === '') diff[0] = '';
  if (newText === '') diff[1] = '';
  return [`Apply in \`${escapeCode(comment.file)}\`:`, '```diff', ...diff, '```'].join('\n');
}

function renderThread(comment: ReviewComment, replies: ReviewComment[]): string {
  const marker = comment.status === 'resolved' ? ' [resolved]' : '';
  const location =
    comment.file !== null && comment.line !== null ? `${escapeCode(comment.file)}:${comment.line}` : escapeCode(comment.id);
  const parts = [`### \`${location}\` — ${comment.id}${marker}`, '', snippet(comment), '', comment.body];
  const suggestionBlock = suggestion(comment);
  if (suggestionBlock !== null) parts.push('', suggestionBlock);
  for (const reply of replies) {
    parts.push('', `#### ${reply.author} — ${reply.createdAt}`, '', reply.body);
  }
  return parts.join('\n');
}

function renderConflicts(conflicts: AutoResolvedConflict[]): string | null {
  if (conflicts.length === 0) return null;
  const lines = conflicts.map((c) => `- \`${escapeCode(c.path)}\` — ${c.at} (main wins)`);
  return ['## Auto-resolved conflicts', '', ...lines].join('\n');
}

export function exportReviewMarkdown(review: Review): string {
  const metadata = [
    '# Local Pull Request',
    `<!-- ${REVIEW_MD_FORMAT} -->`,
    '',
    `- id: ${review.id}`,
    `- base: ${review.baseBranch}`,
    `- head: ${review.headBranch}`,
    `- status: ${review.status}`,
    `- author: ${review.author}`,
    `- updated: ${review.updatedAt}`,
    '',
  ];

  const sections: string[] = [];
  const conflicts = renderConflicts(review.conflicts);
  if (conflicts !== null) sections.push(conflicts);

  const roots = review.comments.filter((c) => c.parentId === null);
  const repliesByParent = new Map<string, ReviewComment[]>();
  for (const comment of review.comments) {
    if (comment.parentId === null) continue;
    const siblings = repliesByParent.get(comment.parentId) ?? [];
    siblings.push(comment);
    repliesByParent.set(comment.parentId, siblings);
  }

  const activeRoots = roots.filter((c) => c.status !== 'detached');
  const byFile = new Map<string, ReviewComment[]>();
  for (const root of activeRoots) {
    const file = root.file ?? '';
    const group = byFile.get(file) ?? [];
    group.push(root);
    byFile.set(file, group);
  }
  const feedback: string[] = [];
  for (const group of byFile.values()) {
    group.sort((a, b) => (a.line ?? 0) - (b.line ?? 0));
    for (const root of group) {
      feedback.push(renderThread(root, repliesByParent.get(root.id) ?? []));
    }
  }
  if (feedback.length > 0) sections.push(['## Feedback', '', ...feedback].join('\n'));

  const detached = roots.filter((c) => c.status === 'detached');
  if (detached.length > 0) {
    const lines = detached.map((root) => renderThread(root, repliesByParent.get(root.id) ?? []));
    sections.push(['## Non localized', '', ...lines].join('\n'));
  }

  return [...metadata, ...sections, ''].join('\n');
}
