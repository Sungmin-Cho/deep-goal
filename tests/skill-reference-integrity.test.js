// Reference integrity for the always-loaded instruction surfaces.
//
// Ported from deep-work's guard of the same name and adapted to this repo:
// there is no agents/ directory, the sources are ESM, and the anchor is the
// documentation placeholder `<absolute-plugin-root>` rather than a shell
// variable — see the ANCHOR note below for why that difference is load-bearing
// here and not merely cosmetic.
//
// Fence balance is checked because a `references/` split once truncated a
// fenced template mid-block: the entry kept the opening ``` and the first dozen
// template lines, the remainder moved behind a conditional pointer, and nothing
// failed. An odd fence count is the machine-detectable signature of that class.

import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ALWAYS_LOADED = ['AGENTS.md', 'CLAUDE.md'];

function markdownFiles() {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.name.endsWith('.md')) out.push(p);
    }
  };
  walk(join(ROOT, 'skills'));
  // The always-loaded agent guides are instruction surfaces under the same
  // rule. `ALWAYS_LOADED` is asserted to be in the scan set by its own test, so
  // dropping it here fails loudly instead of silently shrinking coverage.
  for (const doc of ALWAYS_LOADED) {
    const p = join(ROOT, doc);
    if (existsSync(p)) out.push(p);
  }
  return out;
}

// Every `.md` under skills/ — the documents an attacker would want to shadow.
// A bare Read(`fitness-rubric.md`) names one of these with no basis at all, so
// it resolves against cwd, which is the target workspace.
const PLUGIN_DOCS = (() => {
  const names = new Set();
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.name.endsWith('.md')) names.add(entry.name);
    }
  };
  walk(join(ROOT, 'skills'));
  return names;
})();

// Workspace-shadow guard.
//
// A bare `Read references/fitness-rubric.md` or `node scripts/x.js` resolves
// against the *target workspace*, not the plugin. A repository under analysis
// can put a file at that path and have it read as instructions or run with the
// caller's Bash permissions.
//
// Parent-relative forms (`../deep-goal-workflow/SKILL.md`) are just as
// shadowable. A markdown link resolves against the source file, but a runtime
// read has no such basis — it resolves against cwd. So this guard must NOT
// reuse the reference-integrity resolution below: integrity asks "does this
// file exist?" and may resolve relative to the source; the shadow guard asks
// "does this instruction name a trustworthy basis?", and only an explicit
// plugin-root anchor does.
//
// Two clauses, both required for every instruction form:
//   A. anchoring   — the path names the plugin root explicitly.
//   B. containment — the resolved path stays inside the plugin root.
// Clause B is not implied by A: `<absolute-plugin-root>/../workspace/evil.md`
// carries the anchor and still escapes.
//
// Scope: paths the plugin tells an agent to *open or run*. For `.js`/`.sh` that
// is every mention — naming an executable is only useful for running it — so
// those are checked wherever they appear. A descriptive cross-reference to a
// `.md` in prose is not a load instruction, but deny-by-default below does not
// try to tell the two apart: any token resolving to a real plugin file must be
// anchored regardless of the sentence around it.
//
// ANCHOR. This plugin runs on both Claude Code and Codex, and Codex sets no
// `CLAUDE_PLUGIN_ROOT`. Its portable contract is instead: derive the installed
// plugin root once, from the absolute path of the loaded SKILL.md, then write
// every path against that root. `<absolute-plugin-root>` is the placeholder for
// that derived root and is the repo's single anchor spelling — pinned verbatim
// by scripts/lib/release-validator.js and tests/skill-runtime-contract.test.js.
// A shell-expanded spelling is not an alternative here, it is a defect: see the
// single-anchor-spelling test at the bottom.
// SEPARATORS. Windows is a supported host — v1.2.0 exists to run there without
// Git Bash — so `scripts\deep-goal-runtime.js` names the same file as
// `scripts/deep-goal-runtime.js`. A matcher that knows only `/` lets the whole
// deny-by-default invariant be bypassed with one character, which is exactly
// what review found: the slash form produced five failures and the backslash
// form produced none.
//
// Every matcher below therefore accepts either separator, and every extracted
// token is normalised before it is resolved or compared. Runs of separators
// collapse together, so an escaped `scripts\\x.js` in a string literal
// normalises to the same path. Over-normalising is the safe direction here:
// a token only matters once it resolves to a real file in the plugin, and prose
// containing a stray backslash resolves to nothing.
const SEP = String.raw`[\\/]`;
const normalizePath = (token) => token.replace(/[\\/]+/g, '/');

const PLUGIN_DIRS = 'skills|scripts|tests|docs|references|recipes|hooks|agents';
const ANCHOR = String.raw`<absolute-plugin-root>`;
const ANCHORED_TOKEN = new RegExp(`^(?:${ANCHOR})/`);
const PATH_BODY = String.raw`[A-Za-z0-9._/\\${'{}'}|$<>-]+`;
const REL = String.raw`\.{1,2}${SEP}`;
const ANY_ROOT = String.raw`(?:(?:${ANCHOR})${SEP}|${REL}|(?:${PLUGIN_DIRS})${SEP})`;

// Each pattern captures the path token in group 1, so anchoring and containment
// are judged per token rather than per line — a line mixing an anchored and a
// bare path must still fail on the bare one.
const FORMS = [
  // 1. interpreter exec: `node X`, `bash X`, `sh X`, `python X`
  ['interpreter-exec', new RegExp(String.raw`\b(?:bash|sh|zsh|node|python3?)\s+["'\`]?(${ANY_ROOT}${PATH_BODY})`, 'g')],
  // 2. read verb: `Read X`, `Follow X`, `읽는다`-style pointers are covered by
  //    deny-by-default below; this catches the explicit English verb forms.
  ['read-verb', new RegExp(String.raw`\b(?:Read|Follow|read|follow)\s*\(?\s*["'\`]?(${ANY_ROOT}${PATH_BODY}\.md)`, 'g')],
  // 3. direct exec / source
  ['direct-exec', new RegExp(String.raw`(?:\b(?:source|exec)\s+|^\s*\.\s+)["'\`]?(${ANY_ROOT}${PATH_BODY})`, 'gm')],
  // 4. executable path token anywhere
  //    The trailing boundary matters: without it `.js` matches the prefix of
  //    `hooks.json` and the guard reports a file that does not exist.
  ['executable-token', new RegExp(String.raw`(?<![A-Za-z0-9._/\\{}<>$-])((?:${ANCHOR})${SEP}|${REL}|(?:${PLUGIN_DIRS})${SEP})([A-Za-z0-9._/\\-]*\.(?:js|sh|mjs|cjs)(?![A-Za-z0-9]))`, 'g')],
];

// DENY BY DEFAULT.
//
// Enumerating instruction syntaxes is the losing half of the problem — each
// round of the original review found a form outside the current allowlist. So
// the question is not "is this a known instruction syntax?" but "does this
// token resolve to a real file in the plugin?". Anything that does must be
// anchored, whatever the verb, extension or sentence around it. Anything that
// does not resolve is prose about the target project and passes.
// `docs` is skipped deliberately and the reason is subtle: it is gitignored, so
// it exists in a maintainer checkout and not in CI. Letting it into this set
// would make the deny-by-default verdict depend on which machine ran the test.
// The consequence — that a `docs/…` path can never resolve in the plugin, and
// so is invisible to this rule — is handled by NON_SHIPPED below, not by luck.
const PLUGIN_FILES = (() => {
  const rel = new Set();
  const skip = new Set(['node_modules', '.git', '.github', '.deep-review', 'docs', 'tests']);
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (skip.has(e.name)) continue;
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else rel.add(relative(ROOT, p));
    }
  };
  walk(ROOT);
  return rel;
})();

// NON-SHIPPED PATHS.
//
// A path under a directory the plugin never ships is the *worst* case of the
// shadow class, not an exempt one: it cannot resolve inside an installed plugin
// at all, so the only place it can ever resolve is the analysed project. It is
// also the case deny-by-default structurally cannot see, because that rule asks
// "does this resolve in the plugin?" and the answer is permanently no.
//
// So each such path is listed here with the clauses that make it safe to read,
// and a test below asserts the document carries all of them.
//
// Pin the PROHIBITION, not the provenance. The first version of this matched
// "ships with nothing" alone, which is a fact about the file rather than an
// instruction about it: review trimmed the caveat down to "`docs/DOCS_RULE.md`,
// which ships with nothing.", deleting the whole protective clause, and all
// thirteen tests still passed. What keeps the path safe is the sentence telling
// a reader not to open it and why — so that is what is required here.
const NON_SHIPPED = new Map([
  ['docs/DOCS_RULE.md', [
    /ships with nothing/,
    /never try to open it at runtime/,
    /only place that path can resolve in an installed plugin is the project being analysed/,
  ]],
]);

// Blockquote markers and hard wraps must not decide whether a caveat counts, so
// the required clauses are matched against a flattened body.
function flatten(body) {
  return body.replace(/^[ \t]*>[ \t]?/gm, '').replace(/\s+/g, ' ');
}

// Single-segment root metadata named descriptively — prep-scout tells the agent
// to look for `CLAUDE.md` / `AGENTS.md` / `package.json` *in the target
// project*, which is the intended reading and not a plugin path at all.
// Multi-segment paths get no such pass.
const ROOT_METADATA = new Set(['package.json', 'plugin.json', 'AGENTS.md', 'CLAUDE.md',
  'README.md', 'README.ko.md', 'CHANGELOG.md', 'CHANGELOG.ko.md', 'CONTRIBUTING.md',
  'SECURITY.md', 'LICENSE', 'SKILL.md']);

// Path-shaped tokens: multi-segment paths, plus dotted single segments.
// The `+` on the separator class is load-bearing. Without it a run of
// separators breaks the segment repetition, the whole-path alternative fails,
// and the tokeniser falls back to the bare-basename alternative — which
// resolves to nothing, so deny-by-default never sees the path. `.js` names
// survived that gap because the executable-token FORM's body class spans a run
// on its own; `.md` with no read verb has no such umbrella, which is why the
// gap outlived the first separator fix and the comment above it.
const PATH_TOKEN = /[A-Za-z0-9_.@${}<>-]+(?:[\\/]+[A-Za-z0-9_.@{}|*-]+)+|[A-Za-z0-9_-]+\.[A-Za-z0-9]{1,6}\b/g;

function resolvesInPlugin(token, sourceFile) {
  const clean = normalizePath(token).replace(/^\.\//, '');
  if (PLUGIN_FILES.has(clean)) return true;
  try {
    const fromSource = relative(ROOT, resolve(dirname(sourceFile), normalizePath(token)));
    if (PLUGIN_FILES.has(fromSource)) return true;
  } catch { /* unresolvable token — prose */ }
  return false;
}

// Scope, defined once. Yields the path tokens on a line that the invariant
// governs, with the documented exemptions applied. Both the classifier and the
// malicious-workspace fixture consume this, so they cannot test different rules.
function* scopedTokens(line) {
  PATH_TOKEN.lastIndex = 0;
  let m;
  while ((m = PATH_TOKEN.exec(line))) {
    // `<` and `>` are in the character class only to admit the anchor. Without
    // trimming them, `<skills/…/x.md 첨부>` extracts with a leading `<`, fails
    // to resolve, and the token silently escapes the guard.
    let token = m[0];
    if (token.startsWith('<') && !token.startsWith(ANCHOR)) token = token.slice(1);
    if (token.endsWith('>') && !token.includes(ANCHOR)) token = token.slice(0, -1);
    // Normalise once, here, so every consumer of scopedTokens — the classifier
    // and the malicious-workspace fixture alike — judges the same string.
    token = normalizePath(token);
    if (!token.includes('/') && ROOT_METADATA.has(token)) continue;
    const before = line.slice(Math.max(0, m.index - 30), m.index);
    // Already inside an anchored path, written with either separator.
    if (/<absolute-plugin-root>["'\s]*[\\/]?$/.test(before)) continue;
    // Markdown link target `](x.md)` — rendered navigation between documents,
    // not an instruction handed to a file tool. Markdown does not interpolate,
    // so these must stay source-relative; the link-destination test below pins
    // that they are never anchored.
    if (/\]\($/.test(before)) continue;
    yield token;
  }
}

function denyByDefaultHits(line, sourceFile, root = ROOT) {
  const out = [];
  for (const token of scopedTokens(line)) {
    if (ANCHORED_TOKEN.test(token)) {
      // Clause B is enforced here, not deferred. The reference implementation
      // waves anchored tokens through with a "clause B checks these" comment,
      // which is not true of this path — so both the lexical check and its
      // symlink form run right here, because a contained-looking path whose
      // component links out of the root is exactly the file an attacker wants
      // accepted. `every referenced plugin path resolves inside the root` is a
      // second, independent backstop: it resolves each anchored path for real
      // and rejects one landing outside with `resolves outside the plugin root`.
      if (escapesRoot(token)) out.push({ form: 'resolves-in-plugin', token, why: 'escapes plugin root' });
      else if (escapesViaSymlink(token, root)) out.push({ form: 'resolves-in-plugin', token, why: 'escapes via symlink' });
      continue;
    }
    // Forward defence only: a non-shipped path never resolves in the plugin, so
    // this line is unreachable today. All of the actual protection is in the two
    // NON_SHIPPED tests below. It is kept so that adding such a path to the
    // shipped set later fails the caveat test rather than this rule silently.
    if (NON_SHIPPED.has(token)) continue;
    if (resolvesInPlugin(token, sourceFile)) {
      out.push({ form: 'resolves-in-plugin', token, why: 'unanchored' });
    }
  }
  return out;
}

// bare basename read: Read(`fitness-rubric.md`). It resolves to no repo-relative
// path, so the rule above cannot see it — yet it is the weakest form of all,
// resolving straight against cwd. Only basenames that name a real plugin
// document are flagged, so ordinary prose is untouched.
const BARE_BASENAME = /\b(?:Read|Follow|read|follow)\s*\(?\s*["'`]([A-Za-z0-9][A-Za-z0-9._-]*\.md)(?:#[^`"']*)?["'`]/g;

function bareBasenameHits(line) {
  const out = [];
  BARE_BASENAME.lastIndex = 0;
  let m;
  while ((m = BARE_BASENAME.exec(line))) {
    if (PLUGIN_DOCS.has(m[1])) out.push({ form: 'bare-basename', token: m[1], why: 'unanchored' });
  }
  return out;
}

// JS module load — refused outright, in every spelling.
//
// The rule this enforces is "an instruction document does not embed a JS module
// load of a plugin file", not "anchor it properly". Unlike deep-work there is no safe textual form here, because
// `<absolute-plugin-root>` is a placeholder an *agent* substitutes while
// reading prose — no JS runtime expands it. `require("<absolute-plugin-root>/x")`
// is a bare package specifier, so Node searches the *workspace* node_modules
// and loading a planted module there is arbitrary code execution; the `${…}`
// spelling is the same defect, and its backtick form additionally interpolates
// a local variable rather than the environment. This plugin's documented
// runtime interface is the CLI, so any JS module load naming a plugin path
// inside an instruction document is a violation in every spelling.
const JS_MODULE_LOAD = /(?:\brequire\s*\(|\bimport\s*\(|\bimport\b[^;\n]*?\bfrom\s+)\s*["'`]([^"'`\n]+)["'`]/g;

function jsModuleLoadHits(line) {
  const out = [];
  JS_MODULE_LOAD.lastIndex = 0;
  let m;
  while ((m = JS_MODULE_LOAD.exec(line))) {
    const spec = m[1];
    if (/^node:/.test(spec)) continue;                       // built-in, no path
    out.push({
      form: 'js-module-load',
      token: spec,
      why: 'JS specifier — no runtime substitutes the documentation anchor, so Node '
        + 'resolves it as a bare package under the workspace node_modules',
    });
  }
  return out;
}

const ROOT_SENTINEL = sep === '/' ? '/plugin-root' : 'C:\\plugin-root';

// Clause B. Substitute the anchor with a sentinel root, resolve, and require
// the result to stay inside it. Tokens carrying template placeholders cannot be
// resolved literally, so they are checked lexically for `..` instead.
function escapesRoot(token) {
  const body = normalizePath(token).replace(new RegExp(`^(?:${ANCHOR})/`), '');
  if (/[{}|$]/.test(body)) return body.split('/').includes('..');
  const resolved = resolve(ROOT_SENTINEL, body);
  return resolved !== ROOT_SENTINEL && !resolved.startsWith(ROOT_SENTINEL + sep);
}

// Symlink escape: an anchored, lexically-contained path can still point out of
// the root if a component is a symlink. Only checkable for targets that exist.
//
// `root` is a parameter rather than a closed-over constant so the fixture can
// use a throwaway root outside the repository. An earlier version planted its
// symlink *inside* the real root, which raced the repo-tree `cpSync` in
// release-validator.test.js — `node --test` runs files in parallel processes —
// and made the suite fail 5 runs in 20. A flaky security guard is worse than a
// missing one: it teaches people to re-run until green.
function escapesViaSymlink(token, root = ROOT) {
  const body = normalizePath(token).replace(new RegExp(`^(?:${ANCHOR})/`), '');
  if (/[{}|$]/.test(body)) return false;
  const target = join(root, body);
  if (!existsSync(target)) return false;
  const real = realpathSync(target);
  const realRoot = realpathSync(root);
  return real !== realRoot && !real.startsWith(realRoot + sep);
}

// Returns violations on a line: {form, token, why}. Empty when the line is clean.
function shadowableTokens(line, sourceFile = join(ROOT, 'AGENTS.md'), root = ROOT) {
  const out = [];
  for (const [form, re] of FORMS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(line))) {
      const token = normalizePath(m[2] === undefined ? m[1] : m[1] + m[2]);
      if (!ANCHORED_TOKEN.test(token)) out.push({ form, token, why: 'unanchored' });
      else if (escapesRoot(token)) out.push({ form, token, why: 'escapes plugin root' });
      else if (escapesViaSymlink(token, root)) out.push({ form, token, why: 'escapes via symlink' });
    }
  }
  out.push(...bareBasenameHits(line));
  out.push(...jsModuleLoadHits(line));
  out.push(...denyByDefaultHits(line, sourceFile, root));
  // A token can match several FORMS plus deny-by-default; report each once.
  const seen = new Set();
  return out.filter((v) => {
    const key = `${v.token}|${v.why}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Indented too: fences nested in a list item or a numbered step are still fences.
const FENCE = /^[ \t]*```/gm;

test('every skill and always-loaded markdown file has balanced code fences', () => {
  const unbalanced = [];
  for (const file of markdownFiles()) {
    const fences = (readFileSync(file, 'utf8').match(FENCE) || []).length;
    if (fences % 2 !== 0) unbalanced.push(`${relative(ROOT, file)} (${fences})`);
  }
  assert.deepEqual(unbalanced, [],
    `unclosed code fence — a split or edit truncated a fenced block:\n  ${unbalanced.join('\n  ')}`);
});

test('the always-loaded agent guides are in the scan set', () => {
  const scanned = markdownFiles().map((f) => relative(ROOT, f));
  for (const doc of ALWAYS_LOADED) {
    assert.ok(existsSync(join(ROOT, doc)), `${doc} must exist to be scanned`);
    assert.ok(scanned.includes(doc), `${doc} must be in the shadow-guard scan set`);
  }
});

test('no read or exec instruction can be shadowed from the target workspace', () => {
  const violations = [];
  for (const file of markdownFiles()) {
    readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      for (const v of shadowableTokens(line, file)) {
        violations.push(`${relative(ROOT, file)}:${i + 1}  [${v.form}] ${v.token} — ${v.why}`);
      }
    });
  }
  assert.deepEqual(violations, [],
    'plugin path read or executed outside the plugin root — anchor it at '
    + `<absolute-plugin-root> and keep it inside the root:\n  ${violations.join('\n  ')}`);
});

// One case per instruction form, so the coverage claim is itself tested. A form
// with no case here is a form the guard does not enforce. `safe` is null for
// js-module-load: that form has no safe textual spelling in this repo, and the
// second unsafe line pins that the anchored spelling is refused too.
const FORM_CASES = [
  ['interpreter-exec', 'node scripts/deep-goal-runtime.js scout --cwd .',
    'node "<absolute-plugin-root>/scripts/deep-goal-runtime.js" scout --cwd "<absolute-project-root>"'],
  ['read-verb', 'Read `references/fitness-rubric.md` and apply it',
    'Read `<absolute-plugin-root>/skills/deep-goal-workflow/references/fitness-rubric.md` and apply it'],
  ['direct-exec', 'source scripts/verify-plugin.js',
    'source <absolute-plugin-root>/scripts/verify-plugin.js'],
  ['executable-token', 'the CLI lives at `scripts/deep-goal-runtime.js`',
    'the CLI lives at `<absolute-plugin-root>/scripts/deep-goal-runtime.js`'],
  ['bare-basename', 'Read(`fitness-rubric.md`)',
    'Read(`<absolute-plugin-root>/skills/deep-goal-workflow/references/fitness-rubric.md`)'],
  ['dot-relative', 'Read `../deep-goal-workflow/references/platform-matrix.md`',
    'Read `<absolute-plugin-root>/skills/deep-goal-workflow/references/platform-matrix.md`'],
  ['js-module-load', 'const gate = require("scripts/lib/proof-gate.js");', null],
];

test('every enumerated instruction form is enforced', () => {
  for (const [form, unsafe, safe] of FORM_CASES) {
    assert.ok(shadowableTokens(unsafe).length > 0, `${form}: guard must flag — ${unsafe}`);
    if (safe === null) continue;
    assert.deepEqual(shadowableTokens(safe), [], `${form}: guard must accept — ${safe}`);
  }
});

test('a JS module load is refused in every spelling, anchored or not', () => {
  for (const line of [
    'const gate = require("scripts/lib/proof-gate.js");',
    'const gate = require("<absolute-plugin-root>/scripts/lib/proof-gate.js");',
    'const gate = require("${CLAUDE_PLUGIN_ROOT}/scripts/lib/proof-gate.js");',
    'import gate from `${CLAUDE_PLUGIN_ROOT}/scripts/lib/proof-gate.js`;',
  ]) {
    assert.ok(jsModuleLoadHits(line).length > 0, `must flag JS module load: ${line}`);
  }
  assert.deepEqual(jsModuleLoadHits('const { readFileSync } = require("node:fs");'), [],
    'a Node built-in specifier names no path and must pass');
});

test('anchored paths that escape the plugin root are rejected (containment)', () => {
  const traversals = [
    'Read `<absolute-plugin-root>/../workspace/evil.md`',
    'node "<absolute-plugin-root>/../workspace/evil.js"',
  ];
  for (const line of traversals) {
    const hits = shadowableTokens(line);
    assert.ok(hits.length > 0, `containment must reject: ${line}`);
    assert.equal(hits[0].why, 'escapes plugin root', `wrong reason for: ${line}`);
  }
  // A `..` that stays inside the root is fine, and the entry skill needs it:
  // release-validator.js requires the literal substring
  // `../deep-goal-workflow/SKILL.md` inside the entry's Codex marker section, so
  // the anchored form keeps that substring by routing through `skills/deep-goal/`.
  assert.deepEqual(
    shadowableTokens('Read `<absolute-plugin-root>/skills/deep-goal/../deep-goal-workflow/SKILL.md`'), [],
    'in-root traversal must be accepted');
});

test('mixed lines fail on the bare token', () => {
  const line = 'Read `<absolute-plugin-root>/skills/deep-goal/SKILL.md` then Read `../deep-goal-workflow/SKILL.md`';
  const hits = shadowableTokens(line);
  assert.equal(hits.length, 1, `exactly the bare token must be flagged, got ${JSON.stringify(hits)}`);
  assert.equal(hits[0].why, 'unanchored');
});

test('a malicious workspace cannot shadow any instruction the plugin issues', () => {
  // End-to-end statement of the invariant. Plant shadows in a fake target
  // workspace for every plugin document an instruction names, then confirm no
  // instruction in the repo would resolve to one of them. Because every
  // instruction is anchored, cwd is irrelevant — which is the property under
  // test, not an accident of this fixture.
  const evil = mkdtempSync(join(tmpdir(), 'dg-evil-workspace-'));
  try {
    for (const name of PLUGIN_DOCS) {
      writeFileSync(join(evil, name), '# SHADOW — must never be read\n');
    }
    mkdirSync(join(evil, 'references', 'recipes'), { recursive: true });
    for (const name of PLUGIN_DOCS) {
      writeFileSync(join(evil, 'references', name), '# SHADOW — must never be read\n');
      writeFileSync(join(evil, 'references', 'recipes', name), '# SHADOW — must never be read\n');
    }
    mkdirSync(join(evil, 'scripts', 'lib'), { recursive: true });
    writeFileSync(join(evil, 'scripts', 'deep-goal-runtime.js'), 'process.stdout.write("SHADOW");\n');
    writeFileSync(join(evil, 'scripts', 'lib', 'proof-gate.js'), 'module.exports = { SHADOW: true };\n');

    // Resolve for real, from the evil cwd, exactly as a runtime agent would.
    // Re-running the classifier here would only restate what it believes; this
    // performs the resolution and asks which file the instruction lands on.
    const resolveAsAgentWould = (token) => (
      ANCHORED_TOKEN.test(token)
        ? resolve(ROOT, token.replace(new RegExp(`^${ANCHOR}/`), ''))
        : resolve(evil, token.replace(/^\.\//, ''))
    );

    const landed = [];
    for (const file of markdownFiles()) {
      readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        for (const token of scopedTokens(line)) {
          const target = resolveAsAgentWould(token);
          if (target.startsWith(evil + sep) && existsSync(target)) {
            landed.push(`${relative(ROOT, file)}:${i + 1}  ${token} → ${target}`);
          }
        }
      });
    }
    assert.deepEqual(landed, [],
      `these instructions resolve onto a planted shadow file:\n  ${landed.join('\n  ')}`);

    // Non-vacuity: the same resolution, given an unanchored token, does land on
    // the shadow — so an empty result above is a property of the documents, not
    // of a resolver that never finds anything.
    const control = resolveAsAgentWould('references/fitness-rubric.md');
    assert.ok(control.startsWith(evil + sep) && existsSync(control),
      'fixture is vacuous — an unanchored token must land on the planted shadow');
  } finally {
    rmSync(evil, { recursive: true, force: true });
  }
});

test('markdown link destinations are never the plugin-root placeholder', () => {
  // The mirror image of the anchor rule. Markdown does not interpolate, so an
  // anchored link destination is a literal broken URL. Link targets are an
  // exception class in the guard above; this asserts the exception is actually
  // honoured in the documents.
  const broken = [];
  for (const file of markdownFiles()) {
    readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      const re = /\]\((<absolute-plugin-root>[^)]*|\$\{[^)]*)\)/g;
      let m;
      while ((m = re.exec(line))) broken.push(`${relative(ROOT, file)}:${i + 1}  ](${m[1]})`);
    });
  }
  assert.deepEqual(broken, [],
    'markdown link destination uses a placeholder that nothing expands — use a '
    + `source-relative path instead:\n  ${broken.join('\n  ')}`);
});

test('a path the plugin never ships carries the sentence that makes it safe', () => {
  // Self-consistency axis. This PR's own rule — "a bare plugin path resolves
  // against the analysed project" — was being violated by the line stating
  // where the doc rules live, because `docs/` is gitignored and so that path
  // can resolve *nowhere else*. Deny-by-default could not see it: it only
  // flags what resolves inside the plugin. Writing a rule is not enforcing it,
  // so the exemption is asserted rather than assumed.
  const violations = [];
  for (const [token, clauses] of NON_SHIPPED) {
    assert.ok(!PLUGIN_FILES.has(token),
      `${token} is listed as non-shipped but is in the shipped file set`);
    for (const file of markdownFiles()) {
      const body = readFileSync(file, 'utf8');
      if (!body.includes(token)) continue;
      const flat = flatten(body);
      for (const clause of clauses) {
        if (!clause.test(flat)) {
          violations.push(`${relative(ROOT, file)} names ${token} but is missing: ${clause.source}`);
        }
      }
    }
  }
  assert.deepEqual(violations, [],
    `a non-shipped path is named without every clause that makes it safe to read:\n  ${violations.join('\n  ')}`);
});

// Derived from `.gitignore`, not hand-listed. A hand-listed pair matched the
// ignore file exactly on the day it was written and would have leaked silently
// the first time a third entry was added.
const GITIGNORED_DIRS = (() => {
  const body = readFileSync(join(ROOT, '.gitignore'), 'utf8');
  return body.split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && !line.startsWith('!') && line.endsWith('/'))
    .map((line) => line.replace(/\/$/, ''));
})();

test('the non-shipped directory list is derived from .gitignore, not guessed', () => {
  // Non-vacuity: the sweep below is only meaningful if this actually found the
  // directories that motivated it.
  assert.ok(GITIGNORED_DIRS.length > 0, '.gitignore yielded no ignored directories');
  for (const dir of ['docs', '.deep-review']) {
    assert.ok(GITIGNORED_DIRS.includes(dir),
      `${dir} must be recognised as non-shipped — it is where the blind spot was found`);
  }
});

test('no undeclared path under a non-shipped directory is named', () => {
  // The generalisation of the caveat rule. Anything under a gitignored
  // directory is unresolvable in an installed plugin and therefore resolves
  // only against the workspace. Each one must be declared in NON_SHIPPED, which
  // forces the caveat test to cover it.
  const escaped = GITIGNORED_DIRS.map((d) => d.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  // Either separator. This check is lexical over raw lines on purpose — that is
  // what makes it immune to the skip-set blind spot — and for the same reason
  // normalizePath never reaches it, so `\` has to be spelled out here. With `/`
  // alone, `docs\backlog.md` named an undeclared non-shipped path and nothing
  // objected, while the slash spelling was rejected.
  const NON_SHIPPED_DIRS = new RegExp(String.raw`(?:^|[\s\`"'(])((?:${escaped})[\\/][A-Za-z0-9._\\/-]+)`, 'g');
  // Both spellings, on the axis rather than on the tree.
  for (const spelling of ['docs/backlog.md', 'docs\\backlog.md']) {
    NON_SHIPPED_DIRS.lastIndex = 0;
    assert.ok(NON_SHIPPED_DIRS.exec(`See \`${spelling}\` for the rest.`),
      `undeclared-path check must see both spellings: ${spelling}`);
  }

  const undeclared = [];
  for (const file of markdownFiles()) {
    readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      NON_SHIPPED_DIRS.lastIndex = 0;
      let m;
      while ((m = NON_SHIPPED_DIRS.exec(line))) {
        if (!NON_SHIPPED.has(m[1])) {
          undeclared.push(`${relative(ROOT, file)}:${i + 1}  ${m[1]}`);
        }
      }
    });
  }
  assert.deepEqual(undeclared, [],
    'a path under a gitignored, never-shipped directory can only resolve against '
    + `the analysed project — declare it in NON_SHIPPED or drop it:\n  ${undeclared.join('\n  ')}`);
});

test('a backslash separator does not hide a path from the guard', () => {
  // Review found the slash form producing five failures and the backslash form
  // producing none — the same unanchored reference to the same file, invisible
  // because the matchers knew only `/`. Windows is a supported host, so that is
  // a legitimate spelling and not a typo, and one character bypassed the whole
  // deny-by-default invariant.
  //
  // The bypass table from review, used verbatim as the fixture. Mixed
  // separators matter as much as pure backslash: a rule that learned to
  // recognise "a backslash path" as a second shape would still miss
  // `scripts\lib/proof-gate.js`. That is why the fix normalises at
  // tokenisation instead of teaching each matcher a new form — every rule
  // underneath, present and future, sees one canonical spelling.
  const TABLE = [
    ['unanchored slash', 'Run `node scripts/deep-goal-runtime.js` to start.'],
    ['unanchored backslash', 'Run `node scripts\\deep-goal-runtime.js` to start.'],
    ['read-verb slash', 'Read `scripts/lib/proof-gate.js`'],
    ['read-verb backslash', 'Read `scripts\\lib\\proof-gate.js`'],
    ['mixed separators', 'Run `node scripts\\lib/proof-gate.js` to start.'],
    ['read-verb mixed', 'Read `skills/deep-goal\\SKILL.md` first.'],
    // The rows below carry no read verb and no runnable extension, so the
    // executable-token FORM cannot cover for the tokeniser. They are the only
    // rows that actually exercise the `+` on PATH_TOKEN's separator class.
    ['run, .md, no verb', 'The workflow lives at skills//deep-goal-workflow//SKILL.md today.'],
    ['backslash run, .md, no verb', 'The workflow lives at skills\\\\deep-goal-workflow\\\\SKILL.md today.'],
    ['mixed run, .md, no verb', 'The workflow lives at skills\\/deep-goal-workflow/\\SKILL.md today.'],
  ];
  for (const [label, line] of TABLE) {
    assert.ok(shadowableTokens(line).length > 0, `${label} must be flagged: ${line}`);
  }

  // An anchored traversal written with backslashes is still a traversal, and
  // must be rejected for that reason rather than as "unanchored".
  const traversal = shadowableTokens('node "<absolute-plugin-root>\\..\\workspace\\evil.json"');
  assert.ok(traversal.length > 0, 'anchored backslash traversal must be flagged');
  assert.equal(traversal[0].why, 'escapes plugin root',
    `traversal must fail on containment, not anchoring: ${JSON.stringify(traversal)}`);

  // Escape parity: a doubled backslash is how the same path appears inside a
  // string literal, and separator runs collapse, so it resolves identically.
  assert.ok(shadowableTokens('const p = "scripts\\\\lib\\\\proof-gate.js";').length > 0,
    'an escaped backslash path must be flagged too');

  // The pairs above are all caught by a FORM as well, so they do not prove the
  // deny-by-default path is separator-aware. This one does, and only this one:
  // no read verb, so no FORM matches, and a basename that ROOT_METADATA exempts
  // on its own — so if the token is not extracted whole, nothing sees it at all.
  // With a slash-only token pattern this line scores zero failures.
  assert.ok(
    shadowableTokens('워크플로우 정본은 `skills\\deep-goal\\SKILL.md` 이다.').length > 0,
    'deny-by-default must extract a backslash path whole, not just its basename');

  // And the mirror of that: a case only a FORM can see. Deny-by-default asks
  // whether a token resolves inside the plugin, so a path to a file that does
  // not exist yet is invisible to it — that is the gap FORMS still cover. This
  // one needs the separator inside the path *body*, not just after the root.
  assert.ok(shadowableTokens('Read `skills\\zzz\\missing.md` before starting.').length > 0,
    'a FORM must match a backslash path body, even when nothing resolves');

  // Normalisation must not promote non-path text into a path. Collapsing
  // separator runs makes over-flagging the failure mode to watch, so prose
  // about escapes and regexes is asserted to stay silent — a token still only
  // counts once it resolves to a real file in the plugin.
  for (const prose of [
    'escape a quote with \\" and a backslash with \\\\',
    'Use `\\n` for a newline and `\\t` for a tab.',
    'A literal backslash is written `\\\\` in a JS string literal.',
    'The validator matches /^[A-Za-z]+\\/[a-z-]+$/ against each entry.',
    'Windows paths in user input (`C:\\Users\\me\\project`) are normalised before use.',
  ]) {
    assert.deepEqual(shadowableTokens(prose), [], `prose must not be flagged: ${prose}`);
  }
  assert.deepEqual(
    shadowableTokens('Read `<absolute-plugin-root>\\skills\\deep-goal\\SKILL.md`'), [],
    'an anchored backslash path must be accepted, not flagged as unanchored');
});

test('the anchor cannot be spelled as a shell variable anywhere', () => {
  // The other reported bypass, closed here by a different mechanism than the
  // reference implementation uses. Elsewhere it is a `non-expanding-anchor`
  // check hung off a list of commands, which misses `cp`, `mv`, `install` and
  // any wrapper — enumeration creeping back in on a second axis. This plugin
  // instead bans the shell spelling outright in every scanned file, because
  // Codex sets no such variable and the placeholder is substituted by the agent
  // rather than by a shell, so quoting cannot change the outcome either way.
  const line = "cp '${CLAUDE_PLUGIN_ROOT}/scripts/deep-goal-runtime.js' /tmp/x";
  const offenders = [];
  for (const spelling of [/\$\{CLAUDE_PLUGIN_ROOT\}/, /<PLUGIN_ROOT>/, /\$CLAUDE_PLUGIN_ROOT\b/]) {
    if (spelling.test(line)) offenders.push(spelling.source);
  }
  assert.ok(offenders.length > 0,
    'the single-anchor-spelling rule must reject the shell spelling regardless of the command');
  // And it is verb-agnostic: no command appears in this line at all.
  assert.ok(shadowableTokens('scripts/deep-goal-runtime.js 를 참조한다').length > 0,
    'deny-by-default must flag a bare plugin path with no command verb present');
});

test('an anchored path that leaves the root through a symlink is rejected', () => {
  // `escapes via symlink` is produced on two code paths and, until this test,
  // asserted on neither: containment only ever exercised the lexical `..` form.
  // path.resolve is lexical, so an anchored, `..`-free path whose component is
  // a symlink passes every other check and still lands outside the plugin.
  const outside = mkdtempSync(join(tmpdir(), 'dg-symlink-outside-'));
  const fakeRoot = mkdtempSync(join(tmpdir(), 'dg-symlink-root-'));
  try {
    writeFileSync(join(outside, 'evil.md'), '# SHADOW — outside the plugin root\n');
    mkdirSync(join(fakeRoot, 'skills'), { recursive: true });
    symlinkSync(join(outside, 'evil.md'), join(fakeRoot, 'skills', 'evil.md'));
    writeFileSync(join(fakeRoot, 'skills', 'ok.md'), '# in-root\n');
    const token = '<absolute-plugin-root>/skills/evil.md';

    // Non-vacuity: the token is anchored and lexically contained, so every
    // other clause accepts it. Only the symlink check can reject it.
    assert.ok(ANCHORED_TOKEN.test(token), 'fixture token must be anchored');
    assert.equal(escapesRoot(token), false, 'fixture token must be lexically contained');

    // Both production sites: the FORMS path and the deny-by-default path.
    const viaForm = shadowableTokens(`Read \`${token}\``, undefined, fakeRoot);
    assert.ok(viaForm.some((v) => v.why === 'escapes via symlink'),
      `read-verb path must reject the symlink: ${JSON.stringify(viaForm)}`);
    const viaDeny = denyByDefaultHits(`증명은 \`${token}\` 를 따른다`, join(ROOT, 'AGENTS.md'), fakeRoot);
    assert.ok(viaDeny.some((v) => v.why === 'escapes via symlink'),
      `deny-by-default path must reject the symlink: ${JSON.stringify(viaDeny)}`);

    // A real in-root target of the same shape is still accepted, so the rule is
    // about where the link points and not about the directory it sits in.
    assert.deepEqual(
      shadowableTokens('Read `<absolute-plugin-root>/skills/ok.md`', undefined, fakeRoot), [],
      'a real in-root file must still be accepted');
  } finally {
    rmSync(fakeRoot, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test('the plugin uses exactly one anchor spelling', () => {
  // A shell- or JS-expanded anchor is not a stylistic alternative here. Codex
  // sets no CLAUDE_PLUGIN_ROOT, so `${CLAUDE_PLUGIN_ROOT}/x` stays literal and
  // the consumer then reads a path *named* `${CLAUDE_PLUGIN_ROOT}/x` relative to
  // the workspace — converting a fixed reference into a shadowable one. Both
  // release-validator.js and the runtime contract test already reject the token
  // inside the Codex marker sections; this widens that to every scanned file.
  const offenders = [];
  for (const file of markdownFiles()) {
    readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      for (const spelling of [/\$\{CLAUDE_PLUGIN_ROOT\}/, /<PLUGIN_ROOT>/, /\$CLAUDE_PLUGIN_ROOT\b/]) {
        if (spelling.test(line)) offenders.push(`${relative(ROOT, file)}:${i + 1}  ${line.trim()}`);
      }
    });
  }
  assert.deepEqual(offenders, [],
    'second anchor spelling — this plugin anchors on the derived '
    + `<absolute-plugin-root> placeholder only:\n  ${offenders.join('\n  ')}`);
});

test('every referenced plugin path resolves inside the root', () => {
  const patterns = [
    // Trailing boundary, same reason as the guard: without it `.js` matches the
    // prefix of `.json` and the resolver reports files that never existed.
    [/<absolute-plugin-root>[\\/]([A-Za-z0-9._\\/-]+\.(?:md|js|sh|json|yaml)(?![A-Za-z0-9]))/g, false],
    [/`(\.\.[\\/][A-Za-z0-9._\\/-]+\.md)(?:#[a-z0-9-]+)?`/g, true],
    [/\]\((\.\.?[\\/][A-Za-z0-9._\\/-]+\.md)\)/g, true],
  ];

  // Either separator in every pattern. This resolver reads the raw body on
  // purpose, so normalizePath never reaches it and each pattern has to accept
  // `\` itself. Slash-only left the backslash spelling of an out-of-root
  // reference visible to the classifier but INVISIBLE here — the layer that
  // actually checks containment. A failure count hides exactly that, because the
  // classifier keeps the total non-zero; only naming the tests that fired shows
  // which layer went quiet. One sample per pattern, both spellings.
  const samples = [
    ['<absolute-plugin-root>/../workspace/evil.json',
      '<absolute-plugin-root>\\..\\workspace\\evil.json'],
    ['`../shared/x.md`', '`..\\shared\\x.md`'],
    ['[l](../shared/x.md)', '[l](..\\shared\\x.md)'],
  ];
  patterns.forEach(([re], i) => {
    for (const spelling of samples[i]) {
      re.lastIndex = 0;
      assert.ok(re.exec(spelling), `pattern ${i} must see both spellings: ${spelling}`);
    }
  });
  const broken = [];
  let resolved = 0;
  const realRoot = realpathSync(ROOT);
  for (const file of markdownFiles()) {
    const body = readFileSync(file, 'utf8');
    for (const [re, isRelative] of patterns) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(body))) {
        // Normalising the capture is load-bearing but NOT pinned: removing it
        // breaks no test, because no shipped document uses the backslash
        // spelling yet. The failure would first appear as a false `missing` on
        // a file that exists. Recorded, not claimed.
        const target = isRelative
          ? resolve(dirname(file), normalizePath(m[1]))
          : join(ROOT, normalizePath(m[1]));
        if (!existsSync(target)) {
          broken.push(`${relative(ROOT, file)} -> ${m[1]} (missing)`);
          continue;
        }
        // Existing is not enough: a target that resolves outside the plugin root
        // — lexically or through a symlinked component — is exactly the file an
        // attacker wants accepted. Containment is checked here too, so the two
        // tests cannot disagree about what counts as in-root.
        const real = realpathSync(target);
        if (real !== realRoot && !real.startsWith(realRoot + sep)) {
          broken.push(`${relative(ROOT, file)} -> ${m[1]} (resolves outside the plugin root: ${real})`);
          continue;
        }
        resolved += 1;
      }
    }
  }
  assert.deepEqual(broken, [], `unresolvable or out-of-root reference:\n  ${broken.join('\n  ')}`);
  assert.ok(resolved > 0, 'sweep matched no references at all — the patterns have rotted');
});
