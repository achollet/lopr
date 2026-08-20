## [0.2.1](https://github.com/achollet/lopr/compare/v0.2.0...v0.2.1) (2026-08-20)

# [0.2.0](https://github.com/achollet/lopr/compare/v0.1.0...v0.2.0) (2026-08-20)


### Features

* **vscode:** collapsible file tree, side-by-side diff, configurable fonts ([27565ac](https://github.com/achollet/lopr/commit/27565aca7e0948525390df2e36ec2b7d24182b83)), closes [#15](https://github.com/achollet/lopr/issues/15) [#16](https://github.com/achollet/lopr/issues/16) [#14](https://github.com/achollet/lopr/issues/14)

# [0.1.0](https://github.com/achollet/lopr/compare/2cc1274e9e41be1aa163d0a33441ad65cf312426...v0.1.0) (2026-08-15)


### Bug Fixes

* **ci:** grant contents:write to release job for gh-release ([8680042](https://github.com/achollet/lopr/commit/8680042b3fbb15bd27ae7aab6d673188045e8481)), closes [#release](https://github.com/achollet/lopr/issues/release)
* **ci:** use pnpm/action-setup before setup-node cache ([2cc1274](https://github.com/achollet/lopr/commit/2cc1274e9e41be1aa163d0a33441ad65cf312426))
* **cli:** reject non-numeric --line instead of posting with NaN ([d509705](https://github.com/achollet/lopr/commit/d5097057e94fdd0bc198cfac7ce083964f012a6a))
* **core:** handle detached HEAD in currentBranch by catching symbolic-ref error ([6edd0a5](https://github.com/achollet/lopr/commit/6edd0a5c6af8c00053fa1cf094c88b53336e116f))
* **core:** omit blank diff line for empty suggestion side ([5e0cdef](https://github.com/achollet/lopr/commit/5e0cdef727f9275677f28c718e5fc06b5f36396e))
* **core:** reject merge when working tree has uncommitted tracked changes ([542093c](https://github.com/achollet/lopr/commit/542093c70c832954d2dc79875d728878909fb04d))
* **core:** return defaults when .lopr/config.json contains invalid JSON ([8cb1d0a](https://github.com/achollet/lopr/commit/8cb1d0a32fb24b18daa29317ca8f38f55a2ca73e))
* **core:** reuse one diff per origin sha when reanchoring comments ([1a394a3](https://github.com/achollet/lopr/commit/1a394a35b2388541a809f14251b21aea6c8298ef))
* **core:** validate statusLog, createdAt, updatedAt in parseReview ([f52b7de](https://github.com/achollet/lopr/commit/f52b7de7cf9fd97cee9d7c4c0a4075bb82c4ecc7))
* **tui:** correct thread filter comparing parentId to undefined instead of null ([c8377bf](https://github.com/achollet/lopr/commit/c8377bf4be4f33004345463ad2bc1e323fc8fe4f))
* **vscode:** cache ReviewService per workspace to avoid recreating on every editor switch ([44b3075](https://github.com/achollet/lopr/commit/44b3075af8f3b6516c1bcfc9289d0f0349e9d24c))
* **vscode:** replace ad-hoc error cast with typed ApplySuggestionError ([92c5782](https://github.com/achollet/lopr/commit/92c57827ee9f32cbf95ed15078380a8d3553bfbd))
* **vscode:** show gutter decorations for all non-terminal review statuses ([c8e5794](https://github.com/achollet/lopr/commit/c8e5794696677f37ca7175dda2c1c49ac5d98096))


### Features

* **core:** three-dot diff gateway (merge-base, renames, ignore, binaries) ([#1](https://github.com/achollet/lopr/issues/1)) ([f88d1c4](https://github.com/achollet/lopr/commit/f88d1c4cfd89027644a2b9f113af76eb02eedb62))
