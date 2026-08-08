import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    include: ['**/*.test.ts'],
    environment: 'node',
  },
  resolve: {
    alias: {
      '@lopr/core': path.join(root, 'packages/core/src/index.ts'),
      '@lopr/tui': path.join(root, 'packages/tui/src/index.ts'),
    },
  },
});
