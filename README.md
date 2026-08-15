# Local Pull Request (`lopr`)

Review the code produced by an AI agent the way you would review a GitHub pull
request — entirely locally, with no remote repository.

Comment on lines, open threads, request changes or approve, then merge. The
whole agent loop (implement → review → feedback → re-implement) is the unit of
review: comments persist and re-anchor across iterations.

## What it does

- Local three-dot diff (`git diff merge-base...head`), same semantics as GitHub
- Line-anchored comments `(sha, file, line)` with contextual re-anchoring when
  the line moves across iterations
- Threads with resolution
- Review statuses: comment / approve / request-changes
- `--no-ff` merge into the base branch
- `REVIEW.md` export that the agent can ingest via the `apply-review` skill

## Surfaces

- **VS Code extension** (webview) — main review surface
- **TUI** (ink) — minimal: diff / merge / export

## Install

Requires Node ≥ 22 and pnpm. Build the monorepo first, then install each surface:

```sh
pnpm build
```

**VS Code extension** — the main review surface. Package it, then install the `.vsix`:

```sh
pnpm -C packages/vscode exec vsce package --out ../../dist/lopr-0.1.0.vsix
code --install-extension dist/lopr-0.1.0.vsix
```

**CLI** — add pnpm's global bin to your `PATH` (`pnpm setup`), then link the built binary:

```sh
pnpm setup
ln -sf "$(realpath packages/cli/dist/cli.js)" "$PNPM_HOME/bin/lopr"
```

Restart your terminal, then `lopr --version` should print the version.

## How to use

### Extension (VS Code)

1. Open the command palette (`Ctrl+Shift+P`) → **lopr: Open Review** to review the current branch.
2. The webview lists the changed files; click a file to expand its hunks. The header shows the base/head branches and the review status.
3. Comments are threads anchored to lines. Each thread supports **Reply**, **Resolve**, and — when the comment carries an inline suggestion — **Apply suggestion** (rewrites the working tree, no commit).
4. Header actions: **Approve**, **Request changes**, **Merge** (two clicks to confirm, `--no-ff` into base), **Export** (writes `REVIEW.md`).
5. **lopr: Show Status** prints the review state at any time.

### CLI

Start a review, then work through the loop:

```sh
lopr new                          # review the current branch vs base (--base <branch> to override)
lopr list                         # list reviews, note the <id>
lopr status <id>                  # review state + open threads
lopr comment <id> --file src/foo.ts --line 42 --body "nit: …"
lopr comment <id> --file src/foo.ts --line 42 --body "suggest this instead" \
  --suggest-old "old text" --suggest-new "new text"     # inline suggestion
lopr comment <id> --reply-to <commentId> --body "reply"
lopr resolve <id> <commentId>     # mark a thread resolved
lopr approve <id>                 # or: lopr request-changes <id>
lopr export <id>                  # write REVIEW.md for the agent (--out <path>)
lopr merge <id>                   # --no-ff merge into base (--yes --cleanup to skip consent)
lopr skill install                # install the apply-review skill for the agent
```

## Workflow (trunk-based)

lopr is designed for a trunk-based agent loop:

1. **Agent implements** on a short-lived branch (`feat/…`, `fix/…`).
2. **You review** with lopr — open the review, comment on lines, request
   changes or approve.
3. **Agent ingests feedback** via `REVIEW.md` (export) and the `apply-review`
   skill, then re-implements.
4. **Merge** into the base branch once approved. `main` stays releasable.

Conventional commits are enforced in CI (commitlint). Release notes are
auto-generated from PR titles at each `v*` tag.

## Stack

TypeScript monorepo, pnpm workspace: `core` + `cli` + `tui` + `vscode` package.

## Status

Pre-alpha. See `docs/` for the plan and task breakdown.

## License

MIT. See [LICENSE](LICENSE).
