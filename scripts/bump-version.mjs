#!/usr/bin/env node
/**
 * Bump the single shared version across the monorepo:
 * - root + all four package.json `version` fields
 * - the `VERSION` constant in packages/core/src/index.ts
 *
 * Usage: node scripts/bump-version.mjs <semver>
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+(-[\w.-]+)?$/.test(version)) {
  console.error(`usage: node scripts/bump-version.mjs <semver>  (got "${version ?? ''}")`);
  process.exit(1);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const packages = ['packages/core', 'packages/cli', 'packages/tui', 'packages/vscode'];
const versionJson = async (pkg) => {
  const file = join(root, pkg, 'package.json');
  const data = JSON.parse(await readFile(file, 'utf8'));
  data.version = version;
  await writeFile(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  console.log(`  ${file} -> ${version}`);
};

await versionJson('.');
for (const pkg of packages) await versionJson(pkg);

const coreIndex = join(root, 'packages/core/src/index.ts');
let core = await readFile(coreIndex, 'utf8');
core = core.replace(/export const VERSION = '[^']+';/, `export const VERSION = '${version}';`);
await writeFile(coreIndex, core, 'utf8');
console.log(`  ${coreIndex} -> ${version}`);

console.log(`version ${version} written; run 'pnpm install' to refresh the lockfile.`);
