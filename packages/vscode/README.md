# lopr — Local Pull Request (VS Code extension)

Review the code an AI agent produced, the way you review a GitHub pull request — fully local.

- **Open the review** of the current branch: command palette → `lopr: Open Review` (webview with
  files / diff / threads).
- **Comment** on any added or context line; reply, resolve, apply inline suggestions
  (`Apply suggestion` rewrites the working tree and resolves the thread).
- **Decide**: Approve, Request changes, then Merge into the base branch.
- **Export** `REVIEW.md` — a stable, agent-agnostic contract your agent ingests via the
  `apply-review` skill (`lopr skill install`).
- Gutter decorations highlight the reviewed branch's changed lines in your open editors.

## Requirements

- VS Code 1.90+
- A git repository. The review lives under `.lopr/reviews/` in the repo root.

## Commands

| Command | What it does |
|---|---|
| `lopr: Open Review` | Open the current branch's review in a webview (creates it if needed) |
| `lopr: Show Status` | One-line summary: branch, status, open threads, changed lines |

## Development

```sh
pnpm install
pnpm --filter @lopr/vscode build   # bundles core; dist/extension.cjs is self-contained
pnpm --filter @lopr/vscode package # produces the .vsix
```

The extension loads `core` only at build time: `tsup` bundles it, so the published package has no
runtime dependencies beyond the `vscode` module provided by the host.
