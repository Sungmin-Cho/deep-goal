# deep-goal — Project Guide for Claude

Goal condition compiler that evaluates long-running requests, reshapes them, scouts prerequisites,
and compiles ready-to-paste native `/goal` conditions for Claude Code and Codex.

For release history see [`CHANGELOG.md`](CHANGELOG.md) and
[`CHANGELOG.ko.md`](CHANGELOG.ko.md). Check the current version with:

```text
node -e "const p=JSON.parse(require('node:fs').readFileSync('.claude-plugin/plugin.json','utf8')); console.log(p.version)"
```

> 📄 **Docs maintenance**: this repository follows `docs/DOCS_RULE.md`, the local maintainer
> source of truth for README, CHANGELOG, CLAUDE.md, and AGENTS.md synchronization.

## Project overview

deep-goal is the Deep Suite orchestration on-ramp. It consumes sibling plugin entry points and emits
`PLAN.md` plus a native `/goal` condition. The user activates the condition; a plugin cannot invoke
native `/goal` programmatically.

Node.js 22 powers the shared `scout`, `evaluate-proof`, and release-verification surfaces. Linux,
macOS, and native Windows 11 are supported without Git Bash. Claude Code uses `/deep-goal`; Codex
uses `$deep-goal:deep-goal`; Codex is never instructed to call Claude's `Skill({...})` API.

**Content-only boundary**: ship no `hooks/`, no `agents/`, no `.mcp.json`, and no manifest MCP
server. The plugin creates no persistent state directories or caches.

## 🚨 Critical plugin update workflow

Every release requires all of the following:

1. **Version triple-sync** — update `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`, and
   `package.json` together.
2. **Bilingual CHANGELOG** — add matching Keep a Changelog sections to `CHANGELOG.md` and
   `CHANGELOG.ko.md`. Keep release notes there; do not duplicate them in this guide.
3. **Post-merge suite sync** — after obtaining the full 40-character main commit SHA, update the
   deep-goal entries in both suite marketplaces:
   - `/Users/sungmin/Dev/claude-plugins/deep-suite/.claude-plugin/marketplace.json`
   - `/Users/sungmin/Dev/claude-plugins/deep-suite/.agents/plugins/marketplace.json`
4. Update the suite `README.md` and `README.ko.md` deep-goal rows and any version narrative.

## Directory structure

```text
deep-goal/
├── .claude-plugin/plugin.json
├── .codex-plugin/plugin.json
├── package.json
├── scripts/
│   ├── deep-goal-runtime.js
│   ├── verify-plugin.js
│   └── lib/
│       ├── prep-scout.js
│       ├── proof-gate.js
│       └── release-validator.js
├── skills/
│   ├── deep-goal/SKILL.md
│   └── deep-goal-workflow/
│       ├── SKILL.md
│       └── references/
├── tests/
│   └── *.test.js
├── CLAUDE.md / AGENTS.md
├── README.md / README.ko.md
└── CHANGELOG.md / CHANGELOG.ko.md
```

## Key concepts

### Activation model

deep-goal evaluates, reshapes, compiles, and **presents**. The user copies the condition and invokes
`/goal <condition>` manually, preserving the platform's native UI, evaluator, resume behavior, and
auto-clear semantics.

### Four compile elements

Every condition includes a measurable end-state, proof method, invariant constraints, and a concrete
upper bound. Claude conditions additionally tell the evaluator-facing agent to report each gate result
in the conversation; Codex conditions use checkpoints and the same proof classes.

### Shared portable workflow

Both hosts derive the installed plugin root from the loaded skill path and invoke the same absolute
Node runtime with separate arguments. `scout.git.baselineHead` stays in current-request memory and is
forwarded unchanged to `evaluate-proof`. Missing runtime access or a null/non-Git baseline remains
fail-closed and unverified, never ready-to-run.

## Verification

Node.js 22 is required. The same commands run on Linux, macOS, and native Windows 11 with no
requirement for Git Bash:

```text
npm test
npm run verify
```

`npm test` runs `node --test`. `npm run verify` invokes `node scripts/verify-plugin.js`, which uses
`scripts/lib/release-validator.js`, and then executes the full Node test surface. Both must pass before
every release.

The current installed Codex Python validator remains a maintainer-local authoritative preflight. CI
uses the pinned Node Codex contract because the user-specific validator path is not part of a generic
runner.

## Related repositories

- **deep-suite**: https://github.com/Sungmin-Cho/claude-deep-suite
- **deep-work**: https://github.com/Sungmin-Cho/claude-deep-work
- **deep-review**: https://github.com/Sungmin-Cho/claude-deep-review
- **deep-evolve**: https://github.com/Sungmin-Cho/claude-deep-evolve
- **deep-docs**: https://github.com/Sungmin-Cho/claude-deep-docs
- **deep-wiki**: https://github.com/Sungmin-Cho/claude-deep-wiki
