# AGENTS.md — Local Pull Request

## Repository

TypeScript monorepo, pnpm workspaces. Four packages, one shared version:

| package | path            | purpose                                  |
|---------|-----------------|------------------------------------------|
| core    | `packages/core` | domain logic: diff, comments, re-anchor, merge, statuses, storage |
| cli     | `packages/cli`  | `lopr` binary, thin wrapper over core    |
| tui     | `packages/tui`  | ink TUI, minimal surface (diff/merge/export) |
| vscode  | `packages/vscode`| VS Code extension, webview review surface |

## Commands

- Install: `pnpm install`
- Build: `pnpm -r build` (tsup)
- Test: `pnpm -r test` (vitest)
- Package the extension: `pnpm --filter vscode package` → `*.vsix`

Unit tests cover the domain logic in `core` (anchoring, diff, merge, status
transitions) and validators. Do not unit-test wiring.

## Conventions

- English project names, code, comments. Product name: `lopr` (binary/package),
  full name `Local Pull Request`.
- Conventional commits enforced in CI (commitlint). Trunk-based: short branches
  per agent loop, review via `lopr`, merge into `main` always releasable.
- Docs live in `docs/` (plan/context/tasks.html) — keep them in sync with code.
- The idea this project grew from is in `docs/plan.html` (mindpalace
  `idea-260807xq1w`). Open decisions go there, not in chat.

## Key design constraints (from the plan)

- The review loop is the unit of review: comments re-anchor across agent
  iterations. Re-anchoring is the core of the software.
- Storage: JSON per review; human never reads it directly — surfaces render it.
- `REVIEW.md` export is an agent-agnostic, stable contract; the `apply-review`
  skill ingests it.
- 100% local mode only in V1. Merge warns first; on refusal the branch is left
  to the user and the review can still be marked done.
- Line anchors: current `(file, line)` + origin `(oldSha, oldLine)`; re-anchor
  order: (a) exact hunk mapping, (b) whitespace-tolerant context search,
  (c) detached state. Detached is never silent, never blocking alone.
- Inline code suggestions (`replace X by Y`) are a mandatory V1 feature.
