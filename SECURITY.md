# Security Policy

## Supported versions

Security fixes are delivered through the latest release of deep-goal. Check the current
version with `jq -r .version .claude-plugin/plugin.json`.

## Reporting a vulnerability

Please report security issues **privately** via
[GitHub Security Advisories](https://github.com/Sungmin-Cho/deep-goal/security/advisories/new)
rather than opening a public issue.

We aim to acknowledge reports within a few days and will coordinate a fix and a
disclosure timeline with you.

## Scope

deep-goal is a **content-only, one-shot compiler**: it ships skills and reference
documents but **no `hooks/` and no `agents/`**, so it executes no shell commands and
keeps no persistent state, caches, or background processes. Its only output is text —
a compiled `/goal` condition (optionally split into a `PLAN.md`) that it **presents**
for you to review.

Nothing runs automatically: you invoke `/deep-goal` (or `$deep-goal:deep-goal`)
explicitly, and you choose whether to copy the compiled condition and trigger the
native `/goal` yourself. The "Prep scout" step reads files in your project to gather
context; it does not write or modify them.

When reporting, please indicate which runtime (Claude Code / Codex / other) is affected.
