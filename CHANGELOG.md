# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.1.0] — 2026-07-07

### Added

- **Verifiability gate (proof-gate oracle)** — a canonical release-lint oracle `scripts/lib/proof-gate.sh` (never loaded at runtime) implements the proof-command probe and a 5-class classify→render decision; `prep-scout.md` / `condition-compiler.md` carry byte-identical mirror snippets, and `verify-plugin.sh`'s `sync_check` enforces doc↔script equivalence by text comparison (never by evaluating Markdown — trust boundary).
- **confirmed vs unconfirmed probe** — `prep-scout` 2d now labels manifest-discovered commands `confirmed` and file-extension guesses `unconfirmed`, propagated to compilation. `verify` is the top probe priority (verify-only repos resolve to `npm run verify`); a corrupt `package.json` fails loud (`parse-error`) instead of guessing `npm test`.
- **5-class verifiability classifier** — `classify_proof_line` derives the render class from text + probe + git/file measurement only (callers cannot inject a class): `confirmed-command` / `objective-artifact` (baseline-descendant commit SHA or file whose declared `sha256:` digest matches the real hash) / `unconfirmed-command` / `unconfirmed-artifact` (plain URL, bare pre-existing file, digest mismatch, baseline-self/unrelated SHA) / `subjective-placeholder` (never ready-to-run).
- **Honest-flagging on the normal path** — unconfirmed/subjective proof methods render a `⚠️ 미검증` caveat instead of being emitted as ready-to-run.
- **Self-report trust caveat** — the compiler and platform matrix now disclose that the Haiku evaluator judges surfaced self-report without independent verification; high-stakes goals are steered to verifiable anchors (commit SHA / CI run URL / deep-work `session-receipt.json`).
- **session-receipt anchor** — the `robust-implementation` recipe makes `/deep-finish` a required termination step and renders the `session-receipt.json` anchor contract (path, envelope identity, current-session binding, stale-receipt rejection).
- **`verify-probe.sh` release gate** — a behavioral fixture test that sources `proof-gate.sh` directly (no Markdown eval); wired into `npm run verify` as the third script, guarded by a meta-check so the wiring cannot be skipped and a Markdown-eval regression cannot be reintroduced.

### Changed

- **fitness-rubric reshape trigger** — "증명 방법 부재" widened to "부재 또는 부실" so present-but-unverifiable proof methods (subjective placeholders, non-executable prose, unconfirmed guesses) are routed to a reshape conversation.
- **compile procedure** — the presence-only "4 elements filled?" check is promoted to `classify_proof_line` → `render_proof_line`.
- **fallback SKILL.md** — the self-contained entry skill's inline snippets are synced with the verifiability gate + caveat so weak-runtime fallbacks no longer ship unverifiable conditions with the old rules.
- **Freshness-bound file artifacts (review hardening)** — a file + matching `sha256:` digest is `objective-artifact` only when the file was Added/Modified in a baseline-descendant commit (`git log --diff-filter=AM $BASELINE_HEAD..HEAD`); a pre-existing/untracked file with a correct current hash is `unconfirmed-artifact` (stale-artifact guard, symmetric with the commit-SHA baseline rule).
- **Full fail-loud probe (review hardening)** — every non-zero `node` exit is surfaced: `rc=3` → `parse-error`, any other (node absent / crash) → `parser-unavailable`; the probe never falls back to a guessed `npm test`.
- **Restore-safe self-test (review hardening)** — the no-eval-guard self-test injects a temporary fixture via `DEEP_GOAL_PROBE_SCRIPT` instead of overwriting the tracked `verify-probe.sh`, so an interrupted run can't corrupt the repo.
- **Detected-command binding (review hardening)** — `confirmed-command` requires the proof text to match the *detected* command (probe=confirmed is necessary but not sufficient); an arbitrary command-shape like `npm publish` / `make deploy` is `unconfirmed-command`, never rendered ready-to-run.
- **HEAD-reachable commit SHA (review hardening)** — a commit SHA is `objective-artifact` only when it lies in `BASELINE_HEAD..HEAD` (strict baseline descendant **and** reachable from the current HEAD); a side-branch commit that descends from baseline but isn't on the current line is `unconfirmed-artifact`.

---

## [1.0.1] — 2026-05-27

### Fixed

- **Plugin manifest** — `repository` in `.claude-plugin/plugin.json` was an object (`{ type, url }`); the Claude Code plugin schema expects a string URL, causing installation to fail with `repository: Invalid input: expected string, received object`. Changed to a plain string URL. (`.codex-plugin/plugin.json` was already a string.)

---

## [1.0.0] — 2026-05-27

Initial release — goal condition compiler for Claude Code and Codex.

### Added

- **Fitness evaluation** — three-verdict rubric (Fit / Needs reshaping / Reject) that judges whether a long-running request suits the native `/goal` feature, with reshape strategies (end-state clarification, scope decomposition, proof-command identification).
- **Condition compiler** — produces conditions with 4 elements (measurable end-state, proof method, invariant constraints, upper bound) plus the evaluator-surfacing rule (the Claude Haiku evaluator can't call tools, so every condition instructs Claude to report step results in the conversation). Enforces the 4,000-character limit, splitting into a `PLAN.md` when conditions grow large or chain 3+ sequential gates.
- **Platform matrix** — Claude vs Codex branch table with platform-specific compilation rules.
- **Prerequisite scout** — inline codebase scan to surface files to read first, proof commands (from `package.json` scripts / Makefile / CI config), and invariant constraints; includes a degraded mode when file tools are unavailable.
- **Synergy recipe — `robust-implementation`** (deep-work + deep-review): phased Research→Plan→Implement→Test with approval gates and a review-loop APPROVE verdict as termination; discloses that approval points still require user input.
- **Synergy recipe — `autonomous-evolution`** (deep-evolve): fitness-metric-driven experiment loop until the target metric is reached or the turn limit is hit.
- **Synergy recipe — `ship-and-document`** (deep-docs + deep-wiki): implementation → optional review gate → docs garden → wiki ingest, with persistent operations placed after review approval.
- **Recipe index** — maps detected sibling plugins to recipe suggestions, with a single-shot goal fallback when nothing matches.
- **Cross-platform entry** — user-invocable `/deep-goal` (Claude Code), `$deep-goal:deep-goal` (Codex), and `Skill({...})` (SDK). The entry skill is self-contained and operates without sibling-skill auto-load.
- **6-step workflow skill** — detect → fitness → reshape → recipe match → prep scout → compile + present.
- **Claude Code and Codex manifests** plus `npm run verify` (release lint + negative self-test).
- **Bilingual documentation** — README, CHANGELOG, and agent guides (CLAUDE.md / AGENTS.md).
