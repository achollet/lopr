import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseReview, ReviewError } from './review.js';
import type { Review } from './review.js';

export interface ReviewSummary {
  id: string;
  baseBranch: string;
  headBranch: string;
  author: string;
  status: Review['status'];
  threadCount: number;
  openThreadCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewStore {
  save(review: Review): Promise<void>;
  load(id: string): Promise<Review | null>;
  list(): Promise<ReviewSummary[]>;
  remove(id: string): Promise<void>;
}

const SAFE_ID = /^[A-Za-z0-9_-]+$/;

/** One JSON file per review in a directory (`.lopr/reviews`). Humans never read it. */
export class JsonFileReviewStore implements ReviewStore {
  readonly #dir: string;

  constructor(dir: string) {
    this.#dir = dir;
  }

  #path(id: string): string {
    if (!SAFE_ID.test(id)) throw new ReviewError(`invalid review id: ${id}`);
    return path.join(this.#dir, `${id}.json`);
  }

  async save(review: Review): Promise<void> {
    await mkdir(this.#dir, { recursive: true });
    const target = this.#path(review.id);
    const tmp = `${target}.tmp`;
    await writeFile(tmp, `${JSON.stringify(review, null, 2)}\n`, 'utf8');
    await rename(tmp, target);
  }

  async load(id: string): Promise<Review | null> {
    let raw: string;
    try {
      raw = await readFile(this.#path(id), 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
    return parseReview(raw);
  }

  async list(): Promise<ReviewSummary[]> {
    let names: string[];
    try {
      names = await readdir(this.#dir);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw err;
    }
    const summaries: ReviewSummary[] = [];
    for (const name of names) {
      if (!name.endsWith('.json') || name.endsWith('.json.tmp')) continue;
      const id = name.slice(0, -'.json'.length);
      if (!SAFE_ID.test(id)) continue;
      const review = await this.load(id);
      if (review === null) continue;
      summaries.push(summaryOf(review));
    }
    return summaries.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
  }

  async remove(id: string): Promise<void> {
    try {
      await rm(this.#path(id));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') throw new ReviewError(`no review: ${id}`);
      throw err;
    }
  }
}

export function summaryOf(review: Review): ReviewSummary {
  const roots = review.comments.filter((c) => c.parentId === null);
  return {
    id: review.id,
    baseBranch: review.baseBranch,
    headBranch: review.headBranch,
    author: review.author,
    status: review.status,
    threadCount: roots.length,
    openThreadCount: roots.filter((c) => c.status === 'active').length,
    createdAt: review.createdAt,
    updatedAt: review.updatedAt,
  };
}
