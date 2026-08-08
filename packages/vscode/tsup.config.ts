import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/extension.ts'],
  format: ['cjs'],
  dts: false,
  clean: true,
  target: 'node22',
  external: ['vscode'],
});
