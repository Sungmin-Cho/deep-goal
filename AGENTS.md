# deep-goal — Codex Project Guide

Goal condition compiler for long-running work in Claude Code and Codex. It evaluates native `/goal`
fitness, reshapes requests, scouts prerequisites, and compiles a ready-to-paste condition.

To check the current version:

```text
node -e "const p=JSON.parse(require('node:fs').readFileSync('.claude-plugin/plugin.json','utf8')); console.log(p.version)"
```

> 📄 **Docs maintenance**: documentation follows `docs/DOCS_RULE.md`, the local maintainer
> source of truth for README, CHANGELOG, and agent-guide synchronization.

## Runtime surfaces

- Claude Code manifest: `.claude-plugin/plugin.json`
- Codex manifest: `.codex-plugin/plugin.json`
- User entry: `skills/deep-goal/SKILL.md`
- Six-stage workflow: `skills/deep-goal-workflow/SKILL.md`
- Portable CLI: `scripts/deep-goal-runtime.js`
- Release entry: `scripts/verify-plugin.js`
- Node release validator: `scripts/lib/release-validator.js`
- Node tests: `tests/*.test.js`

Node.js 22 is the runtime floor. Linux, macOS, and native Windows 11 are supported without Git Bash.
Resolve installed paths from the loaded skill and pass project paths as separate Node arguments.

## Content-only boundary

This plugin ships no `hooks/`, no `agents/`, no `.mcp.json`, and no manifest MCP server. Keep it a
one-shot compiler with no persistent state directories or caches.

## Verification

Run both commands before a pull request or release:

```text
npm test
npm run verify
```

`npm test` runs `node --test`. `npm run verify` first invokes `node scripts/verify-plugin.js`, which
uses `scripts/lib/release-validator.js`, and then runs the full Node test surface. This chain is
portable to native Windows 11 and has no Git Bash requirement.

The installed Codex Python validator is a maintainer-local authoritative preflight; generic CI uses
the pinned Node contract test instead.

## Release: post-merge deep-suite sync

After merging and obtaining the full 40-character commit SHA:

1. Update the deep-goal `sha` and headline in
   `/Users/sungmin/Dev/claude-plugins/deep-suite/.claude-plugin/marketplace.json` and
   `.agents/plugins/marketplace.json`.
2. Update the deep-goal rows and version narrative in the suite `README.md` and `README.ko.md`.
3. Commit, push, and verify the suite registry separately.

Before that merge, keep `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`, and `package.json`
version fields synchronized and maintain matching bilingual CHANGELOG structures.
