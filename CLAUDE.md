# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository

A **fork** (`origin` = `github.com/ldos-project/github-action-benchmark`) of
`asterinas/github-action-benchmark`, which is itself a fork of upstream
`benchmark-action/github-action-benchmark`. `master` here descends from asterinas' `04125af`. `README.md`, `CHANGELOG.md` and `CONTRIBUTING.md` are
largely upstream documents and do **not** describe the fork's behavior — read `src/` first when
these disagree (see "Fork divergences" below).

TypeScript GitHub Action (`node20`, entry point `dist/src/index.js`) that parses benchmark tool
output, appends it to a `data.js` file on a GitHub Pages branch, renders charts, and raises
alerts/comments on regressions.

## Commands

```bash
npm ci                                 # Node 20 (.nvmrc)
npm run build                          # tsc -p tsconfig.build.json -> dist/ (dist/ is gitignored on master)
npm test                               # jest (ts-jest, tsconfig.spec.json)
npm test -- test/write.spec.ts         # single file
npm test -- -t 'raises an error on unexpected tool'   # single test by name
npm test -- -u                         # update extract.spec snapshots
npm run coverage                       # what CI runs for unit tests
npm run lint / npm run fix             # eslint
npm run format:check / npm run format  # prettier (4-space indent, 120 cols, single quotes)
yamllint --strict .github/workflows    # CI also lints workflows
```

Note `tsc -p tsconfig.json` does **not** work — the root config references a `tsconfig.app.json`
that does not exist. Always build with `tsconfig.build.json` (excludes `test/`, adds the `dom` lib
because `default_index_html.ts` embeds browser code).

## Architecture

`src/index.ts` drives a three-stage pipeline, **once per matched file**:

1. **`config.ts` → `configFromJobInput(filePath)`** — builds a `Config` from a JSON *config* file
   plus action inputs, and validates everything (paths, thresholds, required token per feature).
2. **`extract.ts` → `extractResult(config)`** — reads `config.outputFilePath`, dispatches on
   `config.tool` to a per-tool parser, returns a `Benchmark` (commit info + `BenchmarkResult[]`).
   Commit info comes from the webhook payload, or from the REST API when `github-token`/`ref` is set.
3. **`write.ts` → `writeBenchmark(bench, config)`** — appends the suite to `DataJson`
   (`{ lastUpdate, repoUrl, entries: { [benchName]: Benchmark[] } }`), persists it, then compares
   against the previous suite for comments/alerts/job summary.

Two mutually exclusive persistence backends in `write.ts`:

- **GitHub Pages** (default): switch to `gh-pages-branch`, read/write `<data-dir>/data.js`
  (a JS file prefixed with `window.BENCHMARK_DATA = `), drop in `DEFAULT_INDEX_HTML` if absent,
  commit, and `auto-push` with up to **10 retries** — on a rejected push it resets `HEAD~1`,
  re-pulls and retries. With `gh-repository` set, it instead clones that repo into
  `./benchmark-data-repository` and runs all git commands with `--work-tree`/`--git-dir` pointing
  there (`git.ts` takes an `additionalGitOptions` array in every function for exactly this).
- **External JSON** (`external-data-json-path`, usually with `actions/cache`): plain JSON file, no
  git at all. Mutually exclusive with `auto-push` (validated in `config.ts`).

`git.ts` shells out via `@actions/exec`, always injecting a bot identity and clearing the
`http.<server>/.extraheader` config that `actions/checkout` leaves behind.

Regression logic lives in `write.ts`: `biggerIsBetter(tool)` + `getRatio()` decide direction,
`findAlerts()` applies `alertThreshold`, `failThreshold` triggers `core.setFailed`.
`buildComment()`/`buildAlertComment()` produce the markdown reused by commit comments, PR reviews
(`src/comment/`, which finds and *updates* an existing review by hidden HTML tag rather than
posting duplicates), and the job summary.

`default_index_html.ts` is one large HTML string (the Pages dashboard) compiled into the bundle.
Its only test parses it with `cheerio` + `acorn`, so syntax errors are caught but behavior is not.

## Fork divergences (important)

- **`output-file-path` is a glob of *config* JSON files, not benchmark output.** `index.ts` expands
  it with `glob.sync`; each matched file must contain `{"result": "<path to real benchmark output>",
  "metadata": {...}}`. `metadata` supplies `tool`, `name`, `title`, `description`, `suite`
  (→ benchmark-data-dir-path), `summary` (→ summary-json-path), `threshold`, `failThreshold`, and
  takes **precedence** over the corresponding action inputs.
- A failure on one matched file is logged with `core.warning` and the loop continues; only "no files
  matched" fails the step.
- `action.yml` no longer declares `name`, `tool`, `alert-threshold`; `config.ts` still reads them via
  `core.getInput` as fallbacks, which is why the example workflows in `.github/workflows/` (upstream
  leftovers passing `name:`/`tool:` directly) still work.
- `Benchmark` carries fork-only fields `title`, `description`, `display`. `summaryJsonPath` points at
  a `{"benchmarks": [...]}` file that **reorders `data.entries`** and sets `display` (overview
  inclusion) on the newly added entry.
- `default_index_html.ts` was rewritten for this fork's use case: it pairs each benchmark's
  `bench.extra === 'linux_result'` with `'aster_result'`, normalizes one against the other, and
  renders a geometric-mean overview. It **throws** if a suite lacks that pair.
- `test/config.spec.ts` is stale: it calls `configFromJobInput()` with no argument against the new
  required-parameter signature, so it fails to compile under ts-jest. Expect `npm test` to be red
  there until it is rewritten around the JSON-config-file flow.
- `npm test` is red on `master` independently of any local change: `config.spec.ts`, `extract.spec.ts`
  (20 stale snapshots) and `write.spec.ts` fail, 86 tests in total. `npm run lint` likewise reports 42
  pre-existing `prettier/prettier` errors in `config.ts` and `write.ts`. Compare against a worktree at
  the merge-base before blaming a change for either.

## Testing conventions

Tests mock at the module boundary with `jest.mock`: `@actions/core`, `@actions/github` (see
`test/fakedOctokit.ts`), and `../src/git` (replaced by a `GitSpy` recording call history) in
`write.spec.ts`. Fixtures for every supported tool live in `test/data/extract/`; `extract.spec.ts`
asserts against snapshots in `test/__snapshots__/`.

End-to-end coverage is the workflows in `.github/workflows/`: each one runs a real example project,
invokes the action via `uses: ./`, then runs `node ./dist/scripts/ci_validate_modification.js
before_data.js '<bench name>' [<base dir>]` (compiled from `scripts/`) to diff the resulting
`data.js` against the pre-run copy.

## Adding a benchmark tool

Touch all of: `VALID_TOOLS` in `config.ts`, an `extractXResult()` + `switch` case in `extract.ts`,
the `biggerIsBetter()` switch in `write.ts`, a chart color in `default_index_html.ts`, a fixture and
snapshot under `test/`, plus `examples/<tool>/` and a workflow in `.github/workflows/`.
ESLint enforces `@typescript-eslint/switch-exhaustiveness-check`, so a missed switch fails linting.

## Releasing

`dist/` and `node_modules/` are gitignored on `master` but **must be committed on the release
branch**, since the action runs `dist/src/index.js` directly. `bash scripts/prepare-release.sh <branch>`
builds, prunes to production deps, checks out the release branch, stages `action.yml`, `dist/src/`,
the lockfiles and `node_modules`, then stops so you can inspect — the commit and push are yours.
The script refuses to run unless the tree is clean and you are on `master`.

**Releases are branches, not tags.** This lineage has no tags at all: `asterinas` ships `v1`…`v5` as
branches, and consumers write `uses: <owner>/github-action-benchmark@v1`, which resolves the branch.
Pushing the branch *is* the deploy, and it updates every consumer immediately — there is no immutable
ref to pin to. `origin` currently has `master` and `v1` (`73a11bb` on master is an ordinary source
commit whose message happens to be `v4`; it is not a release).

The release branch holds only `action.yml`, `dist/`, `node_modules/`, `package.json` and
`package-lock.json` — no source. The script expects the target branch to already exist *and* track a
remote, since it runs `git checkout "$version"` then `git pull`; a brand-new release branch must be
created and pushed first.

Two things about the script that are easy to miss: `npm prune --production` rewrites
`package-lock.json` in the working tree (it drops dev dependencies, and on a `lockfileVersion` 1
lockfile like this one npm 7+ also upgrades the version), which is why the script restores the
tracked copy before switching branches — remove that restore and the switch aborts on a dirty tree.
And `npm run lint` / `npm test` are commented out, so a release validates nothing; both are red on
`master` (see "Fork divergences"), which is why they were disabled — in `147671c` and `70dc443`
respectively, each by the feature commit that broke them.

Verify a release by rebuilding `master` in a scratch worktree and diffing `dist/src/*.js` against the
release branch, then running `node dist/src/index.js` against the shipped `node_modules` — it should
fail with `Input required and not supplied: output-file-path`, which proves every `require()`
resolved.
