import { describe, expect, it } from 'vitest';
import { VERSION, PACKAGE_NAME } from './index.js';

describe('core smoke', () => {
  it('exports the shared version', () => {
    expect(VERSION).toBe('0.1.0');
  });

  it('exports its package name', () => {
    expect(PACKAGE_NAME).toBe('@lopr/core');
  });
});
