import { describe, expect, it } from 'vitest';
import { resolveLineHeight, webviewHtml } from './webview.js';

describe('resolveLineHeight', () => {
  it('computes from the font size when editor.lineHeight is 0 (its default)', () => {
    expect(resolveLineHeight(0, 14)).toBe(21);
  });

  it('computes from the font size when editor.lineHeight is absent', () => {
    expect(resolveLineHeight(undefined, 12)).toBe(18);
  });

  it('treats values under 8 as a multiplier of the font size', () => {
    expect(resolveLineHeight(2, 14)).toBe(28);
    expect(resolveLineHeight(1.5, 12)).toBe(18);
  });

  it('treats values of 8 and above as pixels', () => {
    expect(resolveLineHeight(24, 14)).toBe(24);
  });

  it('clamps to the editor bounds', () => {
    expect(resolveLineHeight(500, 14)).toBe(150);
    expect(resolveLineHeight(-3, 14)).toBe(21);
  });
});

describe('webviewHtml', () => {
  it('never emits a zero line height for the diff', () => {
    const html = webviewHtml({ fontFamily: 'monospace', fontSize: 14, lineHeight: 0 });
    expect(html).toContain('--lopr-line-height: 21px;');
    expect(html).not.toContain('--lopr-line-height: 0px;');
  });

  it('sizes the diff pane by flex rather than a hardcoded header height', () => {
    const html = webviewHtml({ fontFamily: 'monospace', fontSize: 14 });
    expect(html).not.toContain('calc(100vh - 46px)');
    expect(html).toContain('#diff { flex: 1; min-height: 0; overflow: auto; }');
  });
});
