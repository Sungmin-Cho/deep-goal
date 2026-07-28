**English** | [한국어](./README.ko.md)

# deep-goal

![version](https://img.shields.io/github/package-json/v/Sungmin-Cho/claude-deep-goal?label=version)
![license](https://img.shields.io/github/license/Sungmin-Cho/claude-deep-goal)
[![part of deep-suite](https://img.shields.io/badge/part%20of-deep--suite-5b8def)](https://github.com/Sungmin-Cho/claude-deep-suite)

Goal condition compiler — evaluates long-running task requests, reshapes them to fit, scouts prerequisites, and compiles ready-to-paste native `/goal` conditions for Claude Code and Codex.

Part of the [deep-suite](https://github.com/Sungmin-Cho/claude-deep-suite) ecosystem — the "orchestration on-ramp" that turns a request into a ready-to-run `/goal`. See the [CHANGELOG](CHANGELOG.md) for release history.

---

## Critical constraint

> **Native `/goal` cannot be auto-invoked by a plugin.**

deep-goal evaluates your request, reshapes it if needed, and **presents** the compiled condition. You copy it and trigger `/goal <condition>` yourself — one-line paste, no ceremony.

This is by design: the native `/goal` UI, evaluator, session-resume, and auto-clear are preserved exactly as the platform ships them.

---

## Installation

### Option 1 — Local clone (always works, no marketplace required)

```text
# Claude Code
git clone https://github.com/Sungmin-Cho/claude-deep-goal.git
claude plugin add https://github.com/Sungmin-Cho/claude-deep-goal.git

# Codex — add the local path as a plugin directory in your Codex config
```

This path works from the moment you clone. No marketplace registration dependency.

### Option 2 — Marketplace install (requires deep-suite registration)

> **Prerequisite**: deep-goal must be registered in the deep-suite marketplace (`.claude-plugin/marketplace.json` updated with the 40-character merge SHA). This step follows the merge of this repository to `main`.

Once registered:
```text
# Step 1 — add the deep-suite marketplace source (if not already added)
/plugin marketplace add Sungmin-Cho/claude-deep-suite

# Step 2 — install deep-goal from the marketplace
# Claude Code
/plugin install deep-goal@claude-deep-suite

# Codex — marketplace mirror available after deep-suite push
$deep-goal:deep-goal
```

---

## Usage

### Claude Code

```
/deep-goal <your long-running task>
```

Without arguments, deep-goal asks: *"What do you want to run to completion?"*

### Codex

```
$deep-goal:deep-goal <your long-running task>
```

### Claude Code SDK / programmatic

```js
Skill({ skill: "deep-goal:deep-goal", args: "<task>" })
```

This programmatic form is a Claude Code/Agent SDK capability. Codex loads the installed skill through
its native `$deep-goal:deep-goal` entry and is not instructed to call Claude's `Skill({...})` API.

---

## Runtime compatibility

- **Runtime floor**: Node.js 22 powers the portable prerequisite `scout`, proof `evaluate-proof`, and
  release-verification paths.
- **Operating systems**: Linux, macOS, and native Windows 11 are supported without Git Bash or POSIX
  utility requirements.
- **Shared behavior**: Claude Code `/deep-goal` and Codex `$deep-goal:deep-goal` resolve the same
  absolute Node helper and pass the project root as a separate argument.
- **Honest degradation**: a missing runtime, inaccessible project, or null/non-Git baseline stays
  fail-closed as **unverified**; deep-goal never promotes that result to ready-to-run.

---

## 6-step workflow

| Step | What happens |
|---|---|
| **① Detect** | Parse the request; detect platform (Claude / Codex), git presence, and installed deep-suite siblings |
| **② Fitness** | Apply `fitness-rubric` → Fit / Needs reshaping / Reject |
| **③ Reshape** | If needed: clarify end-state, decompose scope, identify proof commands; reject with alternatives if structurally unfit |
| **④ Recipe match** | Suggest a synergy recipe when sibling plugins are detected; fall back to single-shot goal |
| **⑤ Prep scout** | Scan the codebase inline: files to read first, proof commands, invariant constraints |
| **⑥ Compile + present** | Generate platform-tailored `/goal <condition>` in a copy-ready code block with rationale + activation instructions |

---

## Synergy recipes

| Recipe | Triggers when | Summary |
|---|---|---|
| **robust-implementation** | deep-work + deep-review detected | Phase-by-phase implementation (Research→Plan→Implement→Test, plus Spec when deep-work classes the task medium risk or higher) with document approval gates, deep-review-loop APPROVE verdict, and test pass as termination |
| **autonomous-evolution** | deep-evolve detected | Fitness-metric-driven experiment loop until target metric reached or turn limit hit |
| **ship-and-document** | deep-docs + deep-wiki detected | Implementation → (review gate if deep-review present) → docs garden → `/wiki-ingest`; persistent operations after review approval |

If no recipe matches, deep-goal compiles a single-shot goal directly.

---

## The 4 compiled elements

Every condition deep-goal produces contains:
1. **Measurable end-state** — test result, build exit code, file count, empty queue, etc.
2. **Proof method** — the command or artifact that demonstrates completion
3. **Invariant constraints** — what must not change along the way
4. **Upper bound** — `or stop after N turns`

For Claude: compiled conditions always include "report each step result explicitly in the conversation" — the Claude evaluator (Haiku) cannot call tools and judges only from surfaced output.

---

## deep-suite links

| Plugin | Role |
|---|---|
| [deep-goal](https://github.com/Sungmin-Cho/claude-deep-goal) | This plugin — goal condition compiler (meta-Guide) |
| [deep-work](https://github.com/Sungmin-Cho/claude-deep-work) | Phased implementation orchestrator |
| [deep-review](https://github.com/Sungmin-Cho/claude-deep-review) | Code review loop with APPROVE verdict |
| [deep-evolve](https://github.com/Sungmin-Cho/claude-deep-evolve) | Autonomous fitness-metric experiment loop |
| [deep-docs](https://github.com/Sungmin-Cho/claude-deep-docs) | Document gardening agent |
| [deep-wiki](https://github.com/Sungmin-Cho/claude-deep-wiki) | Knowledge base ingest and management |
| [deep-suite (marketplace)](https://github.com/Sungmin-Cho/claude-deep-suite) | Unified marketplace and harness matrix |

---

## License

MIT — see [LICENSE](LICENSE).
