#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  GitCli,
  JsonFileReviewStore,
  ReviewService,
  VERSION,
  loadConfig,
} from '@lopr/core';

export interface CliIO {
  out(line: string): void;
  err(line: string): void;
  ask(question: string): Promise<string>;
}

export interface CliDeps {
  io?: Partial<CliIO>;
  /** Injected service (tests); otherwise booted from `cwd`. */
  service?: ReviewService;
  cwd?: string;
}

export interface ParsedArgs {
  positionals: string[];
  flags: Record<string, string | boolean>;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === '-h' || arg === '--help') {
      flags.help = true;
    } else if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      if (eq !== -1) {
        flags[arg.slice(2, eq)] = arg.slice(eq + 1);
      } else {
        const key = arg.slice(2);
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith('--')) {
          flags[key] = next;
          i += 1;
        } else {
          flags[key] = true;
        }
      }
    } else {
      positionals.push(arg);
    }
  }
  return { positionals, flags };
}

const HELP = `lopr ${VERSION} — review AI agent code like a GitHub PR, entirely locally

Usage: lopr <command> [options]

Commands:
  new                create a review of the current branch vs the base branch
                     (--base <branch> overrides the .lopr/config.json base)
  comment <id>       post a comment on a file line, or a reply (--reply-to)
                     --file <path> --line <n> --body <text>
                     --reply-to <commentId> --body <text>
                     --suggest-old <text> --suggest-new <text>  (inline suggestion)
  approve <id>       approve the review
  request-changes <id>  ask for changes
  resolve <id> <commentId>  mark a thread resolved
  status <id>        print the review status and threads
  list               list reviews
  merge <id>         merge the reviewed branch into its base (asks for consent)
                     --yes --cleanup
  export <id>        write REVIEW.md for the agent to ingest (--out <path>)
  skill              agent skills (install)

Run 'lopr <command> --help' for nothing in particular.
`;

function flag(args: ParsedArgs, name: string): string | undefined {
  const value = args.flags[name];
  return typeof value === 'string' ? value : undefined;
}

function defaultAsk(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: false });
    rl.question(`${question} `, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

function defaultIO(): Required<CliIO> {
  return {
    out: (line) => process.stdout.write(`${line}\n`),
    err: (line) => process.stderr.write(`${line}\n`),
    ask: defaultAsk,
  };
}

async function bootService(cwd: string): Promise<{ service: ReviewService; repoRoot: string }> {
  const gateway = new GitCli();
  const repoRoot = await gateway.repoRoot(cwd);
  const store = new JsonFileReviewStore(path.join(repoRoot, '.lopr', 'reviews'));
  return { service: new ReviewService({ gateway, store, cwd: repoRoot }), repoRoot };
}

function renderThreads(review: { comments: { id: string; file: string | null; line: number | null; status: string; body: string }[] }): string {
  const lines = review.comments.map((c) => {
    const where = c.file !== null && c.line !== null ? `${c.file}:${c.line}` : '(reply)';
    return `  ${c.status.padEnd(9)} ${where} [${c.id}] ${c.body.split('\n')[0]}`;
  });
  return lines.length > 0 ? lines.join('\n') : '  (no comments)';
}

async function cmdNew(service: ReviewService, args: ParsedArgs, io: CliIO, repoRoot: string): Promise<number> {
  const config = await loadConfig(repoRoot);
  const base = flag(args, 'base') ?? config.base;
  const review = await service.newReview(base !== undefined ? { baseBranch: base } : {});
  io.out(`created review ${review.id} (${review.headBranch} -> ${review.baseBranch})`);
  return 0;
}

async function cmdComment(service: ReviewService, args: ParsedArgs, io: CliIO): Promise<number> {
  const reviewId = args.positionals[1];
  if (reviewId === undefined) {
    io.err('lopr: comment requires a review id');
    return 1;
  }
  const body = flag(args, 'body');
  if (body === undefined || body === '') {
    io.err('lopr: comment requires --body <text>');
    return 1;
  }
  const replyTo = flag(args, 'reply-to');
  const oldText = flag(args, 'suggest-old');
  const newText = flag(args, 'suggest-new');
  const suggestion =
    oldText !== undefined || newText !== undefined
      ? { oldText: oldText ?? '', newText: newText ?? '' }
      : undefined;
  const updated = await service.comment({
    reviewId,
    parentId: replyTo,
    file: flag(args, 'file'),
    line: flag(args, 'line') !== undefined ? Number(flag(args, 'line')) : undefined,
    body,
    suggestion,
  });
  const created = updated.comments[updated.comments.length - 1]!;
  io.out(`posted comment ${created.id}`);
  return 0;
}

async function cmdStatus(service: ReviewService, args: ParsedArgs, io: CliIO): Promise<number> {
  const reviewId = args.positionals[1];
  if (reviewId === undefined) {
    io.err('lopr: status requires a review id');
    return 1;
  }
  const review = await service.status(reviewId);
  io.out(`${review.headBranch} -> ${review.baseBranch}  ${review.status}`);
  io.out(renderThreads(review));
  return 0;
}

async function cmdExport(service: ReviewService, args: ParsedArgs, io: CliIO, cwd: string): Promise<number> {
  const reviewId = args.positionals[1];
  if (reviewId === undefined) {
    io.err('lopr: export requires a review id');
    return 1;
  }
  const md = await service.exportReview(reviewId);
  const target = flag(args, 'out') ?? path.join(cwd, 'REVIEW.md');
  await writeFile(target, md, 'utf8');
  io.out(`wrote ${target}`);
  return 0;
}

async function cmdMerge(service: ReviewService, args: ParsedArgs, io: CliIO): Promise<number> {
  const reviewId = args.positionals[1];
  if (reviewId === undefined) {
    io.err('lopr: merge requires a review id');
    return 1;
  }
  const review = await service.status(reviewId);
  let consent = args.flags.yes === true;
  if (!consent) {
    const answer = await io.ask(`merge '${review.headBranch}' into '${review.baseBranch}'? [y/N]`);
    consent = answer.trim().toLowerCase() === 'y' || answer.trim().toLowerCase() === 'yes';
    if (!consent) {
      io.out('merge aborted');
      return 0;
    }
  }
  await service.mergeReview(reviewId, { consent: true, cleanup: args.flags.cleanup === true });
  io.out(`merged '${review.headBranch}' into '${review.baseBranch}'`);
  return 0;
}

export async function main(argv: string[], deps: CliDeps = {}): Promise<number> {
  const io = { ...defaultIO(), ...deps.io };
  const args = parseArgs(argv);
  const cmd = args.positionals[0];

  if (cmd === undefined || args.flags.help === true) {
    io.out(HELP);
    return 0;
  }

  const cwd = deps.cwd ?? process.cwd();
  let service = deps.service;
  let repoRoot = cwd;
  if (service === undefined) {
    try {
      ({ service, repoRoot } = await bootService(cwd));
    } catch (err) {
      io.err(`lopr: ${(err as Error).message}`);
      return 1;
    }
  }

  try {
    switch (cmd) {
      case 'new':
        return await cmdNew(service, args, io, repoRoot);
      case 'comment':
        return await cmdComment(service, args, io);
      case 'approve':
        return await runById(service, args, io, 'approve');
      case 'request-changes':
        return await runById(service, args, io, 'request-changes');
      case 'resolve': {
        const [reviewId, commentId] = args.positionals.slice(1);
        if (reviewId === undefined || commentId === undefined) {
          io.err('lopr: resolve requires a review id and a comment id');
          return 1;
        }
        await service.resolve(reviewId, commentId);
        io.out(`resolved ${commentId}`);
        return 0;
      }
      case 'status':
        return await cmdStatus(service, args, io);
      case 'list': {
        const summaries = await service.list();
        for (const s of summaries) {
          io.out(`${s.id}  ${s.headBranch} -> ${s.baseBranch}  ${s.status}  ${s.openThreadCount}/${s.threadCount} open`);
        }
        if (summaries.length === 0) io.out('(no reviews)');
        return 0;
      }
      case 'merge':
        return await cmdMerge(service, args, io);
      case 'export':
        return await cmdExport(service, args, io, repoRoot);
      case 'skill':
        io.err(`lopr: skill is not implemented yet — ships with the apply-review epic`);
        return 1;
      default:
        io.err(`lopr: unknown command '${cmd}'`);
        io.err(HELP);
        return 1;
    }
  } catch (err) {
    io.err(`lopr: ${(err as Error).message}`);
    return 1;
  }
}

async function runById(service: ReviewService, args: ParsedArgs, io: CliIO, method: 'approve' | 'request-changes'): Promise<number> {
  const reviewId = args.positionals[1];
  if (reviewId === undefined) {
    io.err(`lopr: ${method} requires a review id`);
    return 1;
  }
  if (method === 'approve') await service.approve(reviewId);
  else await service.requestChanges(reviewId);
  io.out(`${method} applied to ${reviewId}`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
