import { describe, expect, it } from 'vitest';
import { skillDocument } from './skill.js';

describe('skillDocument', () => {
  it('is a full instruction document for an agent', () => {
    const doc = skillDocument();
    expect(doc).toContain('# apply-review');
    expect(doc).toContain('lopr-review: v1');
    expect(doc).toContain('## Feedback');
    expect(doc).toContain('## Non localized');
    expect(doc).toContain('## Auto-resolved conflicts');
    expect(doc).toContain('lopr comment --reply-to');
  });
});
