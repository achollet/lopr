import { describe, expect, it } from 'vitest';
import { VERSION } from './index.js';

describe('core smoke', () => {
  it('exports the shared version', () => {
    expect(VERSION).toBe('0.1.0');
  });
});
