import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { LoprConfig } from './types.js';

export const DEFAULT_CONFIG: LoprConfig = { ignore: [] };

export async function loadConfig(repoRoot: string): Promise<LoprConfig> {
  const configPath = path.join(repoRoot, '.lopr', 'config.json');
  let raw: string;
  try {
    raw = await readFile(configPath, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return DEFAULT_CONFIG;
    throw err;
  }
  let parsed: Partial<LoprConfig>;
  try {
    parsed = JSON.parse(raw) as Partial<LoprConfig>;
  } catch {
    return DEFAULT_CONFIG;
  }
  return {
    base: typeof parsed.base === 'string' && parsed.base.length > 0 ? parsed.base : undefined,
    ignore: Array.isArray(parsed.ignore) ? parsed.ignore.filter((x): x is string => typeof x === 'string') : [],
    skillPath:
      typeof parsed.skillPath === 'string' && parsed.skillPath.length > 0 ? parsed.skillPath : undefined,
  };
}

export async function saveConfig(repoRoot: string, config: LoprConfig): Promise<void> {
  const dir = path.join(repoRoot, '.lopr');
  await mkdir(dir, { recursive: true });
  const serialized = JSON.stringify(
    {
      base: config.base,
      ignore: config.ignore,
      skillPath: config.skillPath,
    },
    null,
    2,
  );
  await writeFile(path.join(dir, 'config.json'), `${serialized}\n`, 'utf8');
}
