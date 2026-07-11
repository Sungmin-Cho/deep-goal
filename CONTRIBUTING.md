# Contributing to deep-goal

Thanks for improving **deep-goal**, the goal condition compiler for the
[Deep Suite](https://github.com/Sungmin-Cho/claude-deep-suite) plugin family across Claude Code and
Codex.

deep-goal is content-only: it ships no `hooks/`, no `agents/`, no `.mcp.json`, and no MCP server.
Keep it a one-shot compiler with no persistent runtime state.

## Requirements

- Node.js 22
- Git
- Linux, macOS, or native Windows 11; contributors work without Git Bash or POSIX utility
  requirements

## Getting started

```text
git clone https://github.com/Sungmin-Cho/claude-deep-goal.git
cd claude-deep-goal
```

There are no package dependencies to install. The verification surface uses Node built-ins.

## Local checks

Run both commands from the repository root:

```text
npm test
npm run verify
```

- `npm test` runs the full `node --test` suite.
- `npm run verify` invokes `node scripts/verify-plugin.js`; that entry uses
  `scripts/lib/release-validator.js` before running the same Node test surface.

Both commands are shell-neutral and support native Windows 11 with no requirement for Git Bash.
Everything must be green before a pull request.

The installed Codex Python validator is a maintainer-local authoritative preflight. The repository's
portable contract is the Node release validator plus the Codex contract tests, which run on all three
CI operating systems.

## Conventions

- **Documentation** follows [`docs/DOCS_RULE.md`](docs/DOCS_RULE.md), the local maintainer source of
  truth for README, CHANGELOG, and agent-guide synchronization.
- **Version triple-sync**: `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`, and
  `package.json` must carry the same version.
- **CHANGELOG**: maintain matching English and Korean Keep a Changelog structures. Do not add test
  counts, review narration, commit hashes, or internal function names to release notes.
- **Runtime boundary**: preserve Node.js 22 portability, separate argv, fail-closed proof handling,
  and the content-only no-hooks/no-agents/no-MCP contract.

## Pull requests

1. Branch from `main`.
2. Keep changes focused and update both bilingual documentation surfaces when behavior changes.
3. Run `npm test` and `npm run verify`.
4. Explain what changed, why, and which portable checks prove it.

## Reporting issues

Open a GitHub issue. For security reports, see [`SECURITY.md`](SECURITY.md).
