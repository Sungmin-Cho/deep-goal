# deep-goal — Agent Guide

Goal condition compiler. It judges whether a long-running request fits the native `/goal` feature,
reshapes it, scouts prerequisites, and compiles a ready-to-paste condition. Claude Code and Codex
share this file — it is the single source for both, so it carries no `@`-imports (Codex has none).

Release history lives in `CHANGELOG.md` / `CHANGELOG.ko.md`; README owns what the plugin is and how
to use it. Read the current version, never hardcode it: `npm pkg get version`.

> 📄 Documentation in this repo follows `docs/DOCS_RULE.md` (local maintainer guide).

## The user activates, the plugin only compiles

A plugin cannot invoke native `/goal` programmatically. deep-goal's job ends when it presents the
compiled condition; the user pastes it. Never report a goal as started, and never present a
condition as ready-to-run unless its proof method was actually confirmed.

**Content-only boundary**: this plugin ships no `hooks/`, no `agents/`, no `.mcp.json` and no
manifest MCP server, and it creates no persistent state directory or cache. It is a one-shot
compiler; keep it that way.

## Portable runtime contract

Node.js 22 is the floor. Linux, macOS and native Windows 11 are supported without Git Bash.

Both hosts derive the installed plugin root from the absolute path of the loaded `SKILL.md`, then
call the same Node CLI passing each value as a **separate argument** — never a composed shell
string, never a path assumed relative to the current working directory.

**Every plugin path an instruction tells you to open or run is anchored at
`<absolute-plugin-root>`, and must resolve *inside* that root.** An anchor alone is not enough: an
anchored path followed by a parent segment, or through a symlinked component, still walks out of the
plugin — resolve first, then check the result is under the root. If either condition fails, abort
and report; do not read it and do not run it. A bare relative path resolves against the *target
workspace* instead, so a repository under analysis could shadow a plugin document with a same-named
file and have its contents read as instructions.

`<absolute-plugin-root>` is this repo's single anchor spelling. A `CLAUDE_PLUGIN_ROOT`-style
environment anchor is not an alternative: Codex never sets that variable, so the reference would
stay literal and re-create the very workspace-relative path the anchor exists to prevent.

`scout.git.baselineHead` stays in current-request memory and is forwarded unchanged to
`evaluate-proof`. A null, missing or non-Git baseline is fail-closed — mark the result
**미검증(unverified)** and never promote it to ready-to-run. Missing runtime or file-tool access
follows the same rule.

## Verification

```text
npm test
npm run verify
```

`npm test` is `node --test`. `npm run verify` runs `<absolute-plugin-root>/scripts/verify-plugin.js`
(whose checks live in `<absolute-plugin-root>/scripts/lib/release-validator.js`) and then the full
Node test surface; `package.json` is the authority for the chain. Both must pass before every pull
request and release. The installed Codex Python validator stays a maintainer-local preflight —
generic CI uses the pinned Node contract test instead.

## Release

1. **Version triple-sync** — `<absolute-plugin-root>/.claude-plugin/plugin.json`,
   `<absolute-plugin-root>/.codex-plugin/plugin.json` and `package.json` always carry the same
   version. `npm run verify` fails on a mismatch, but it does not cover every site: the release
   metadata test pins the version literal too, so sweep for it before tagging.
2. **Bilingual CHANGELOG** — matching Keep a Changelog sections in `CHANGELOG.md` and
   `CHANGELOG.ko.md`. Release notes live there and nowhere else.
3. **Suite re-pin**, after the merge lands on `main`:

   ```text
   cd /Users/sungmin/Dev/claude-plugins/deep-suite
   npm run release:bump -- deep-goal <sha40>
   npm run preflight
   ```

   `release:bump` writes `.claude-plugin/marketplace.json` only — sync
   `.agents/plugins/marketplace.json` by hand in the same commit.
