import assert from 'node:assert/strict';
import test from 'node:test';
import {
  appendFileSync,
  cpSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { validateRepository } from '../scripts/lib/release-validator.js';

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EXCLUDED_FIXTURE_ROOTS = new Set(['.git', 'node_modules', '.deep-review', 'docs']);

function fixtureCopy(t) {
  const root = mkdtempSync(join(tmpdir(), 'deep goal release fixture '));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  cpSync(REPOSITORY_ROOT, root, {
    recursive: true,
    filter(source) {
      const first = relative(REPOSITORY_ROOT, source).split(sep)[0];
      return !EXCLUDED_FIXTURE_ROOTS.has(first);
    },
  });
  return root;
}

function editJson(root, relativePath, edit) {
  const file = join(root, relativePath);
  const value = JSON.parse(readFileSync(file, 'utf8'));
  edit(value);
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function runtimeSources(root) {
  const scripts = join(root, 'scripts');
  const found = [];
  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = join(directory, entry.name);
      if (entry.isDirectory()) walk(file);
      if (entry.isFile() && entry.name.endsWith('.js')) {
        found.push(relative(root, file).split(sep).join('/'));
      }
    }
  }
  walk(scripts);
  return found.sort();
}

test('release validator accepts a clean repository fixture', (t) => {
  const result = validateRepository({ root: fixtureCopy(t) });
  assert.equal(result.passed, true, result.failures.join('\n'));
  assert.deepEqual(result.failures, []);
  assert.ok(result.checks.length > 0);
});

const mutations = [
  {
    name: 'version mismatch',
    expected: 'version triple-sync',
    apply(root) { editJson(root, 'package.json', (value) => { value.version = '9.9.9'; }); },
  },
  {
    name: 'missing workflow skill',
    expected: 'required file: skills/deep-goal-workflow/SKILL.md',
    apply(root) { rmSync(join(root, 'skills/deep-goal-workflow/SKILL.md')); },
  },
  {
    name: 'reversed activation claim',
    expected: 'native goal is not auto-invocable',
    apply(root) { appendFileSync(join(root, 'skills/deep-goal/SKILL.md'), '\n네이티브 /goal 자동 호출 가능\n'); },
  },
  {
    name: 'placeholder token',
    expected: 'no shipped placeholders',
    apply(root) { appendFileSync(join(root, 'README.md'), `\n${'T' + 'ODO'} fill in\n`); },
  },
  {
    name: 'wrong Codex prompt',
    expected: 'Codex defaultPrompt entry',
    apply(root) {
      editJson(root, '.codex-plugin/plugin.json', (value) => {
        value.interface.defaultPrompt = ['$wrong:entry'];
      });
    },
  },
  {
    name: 'Node 22 engine floor',
    expected: 'package engines.node: >=22',
    apply(root) { editJson(root, 'package.json', (value) => { value.engines.node = '>=20'; }); },
  },
  {
    name: 'hooks directory',
    expected: 'content-only: no hooks directory',
    apply(root) { mkdirSync(join(root, 'hooks')); },
  },
  {
    name: 'agents directory',
    expected: 'content-only: no agents directory',
    apply(root) { mkdirSync(join(root, 'agents')); },
  },
  {
    name: 'MCP file',
    expected: 'content-only: no .mcp.json',
    apply(root) { writeFileSync(join(root, '.mcp.json'), '{}\n'); },
  },
  {
    name: 'Claude hook manifest key',
    expected: 'content-only: no hooks manifest key: .claude-plugin/plugin.json',
    apply(root) { editJson(root, '.claude-plugin/plugin.json', (value) => { value.hooks = './hooks/hooks.json'; }); },
  },
  {
    name: 'Codex hook manifest key',
    expected: 'content-only: no hooks manifest key: .codex-plugin/plugin.json',
    apply(root) { editJson(root, '.codex-plugin/plugin.json', (value) => { value.hooks = './hooks/hooks.json'; }); },
  },
  {
    name: 'Claude MCP manifest key',
    expected: 'content-only: no MCP manifest key: .claude-plugin/plugin.json',
    apply(root) { editJson(root, '.claude-plugin/plugin.json', (value) => { value.mcpServers = './.mcp.json'; }); },
  },
  {
    name: 'Codex MCP manifest key',
    expected: 'content-only: no MCP manifest key: .codex-plugin/plugin.json',
    apply(root) { editJson(root, '.codex-plugin/plugin.json', (value) => { value.mcpServers = './.mcp.json'; }); },
  },
  {
    name: 'nested hooks directory',
    expected: 'content-only: no hooks directory (recursive)',
    apply(root) { mkdirSync(join(root, 'skills/deep-goal/hooks'), { recursive: true }); },
  },
  {
    name: 'nested agents directory',
    expected: 'content-only: no agents directory (recursive)',
    apply(root) { mkdirSync(join(root, 'skills/deep-goal/agents'), { recursive: true }); },
  },
  {
    name: 'nested MCP file',
    expected: 'content-only: no .mcp.json (recursive)',
    apply(root) { writeFileSync(join(root, 'skills/deep-goal/.mcp.json'), '{}\n'); },
  },
  {
    name: 'test script rewired',
    expected: 'package scripts.test: node --test',
    apply(root) { editJson(root, 'package.json', (value) => { value.scripts.test = 'echo skip'; }); },
  },
  {
    name: 'verify script unchained',
    expected: 'package scripts.verify: verify:repo && test',
    apply(root) { editJson(root, 'package.json', (value) => { value.scripts.verify = 'npm run verify:repo'; }); },
  },
  {
    name: 'verify:repo unwired',
    expected: 'package scripts.verify:repo: node scripts/verify-plugin.js',
    apply(root) { editJson(root, 'package.json', (value) => { value.scripts['verify:repo'] = 'true'; }); },
  },
];

for (const mutation of mutations) {
  test(`release validator rejects ${mutation.name}`, (t) => {
    const root = fixtureCopy(t);
    mutation.apply(root);
    const result = validateRepository({ root });
    assert.ok(result.failures.includes(mutation.expected), result.failures.join('\n'));
  });
}

const forbiddenConstructs = [
  {
    name: 'eval',
    source: "eval('1');",
    label: (file) => `runtime safety: ${file}: no eval`,
  },
  {
    name: 'Function constructor',
    source: "Function('return 1');",
    label: (file) => `runtime safety: ${file}: no Function constructor`,
  },
  {
    name: 'shell true',
    source: "spawnSync('git', [], { shell: true });",
    label: (file) => `runtime safety: ${file}: no shell: true`,
  },
  {
    name: 'Markdown execution path',
    source: "execSync('scripts/run.md');",
    label: (file) => `runtime safety: ${file}: no Markdown execution paths`,
  },
];

for (const source of runtimeSources(REPOSITORY_ROOT)) {
  for (const forbidden of forbiddenConstructs) {
    test(`release validator rejects ${forbidden.name} in ${source}`, (t) => {
      const root = fixtureCopy(t);
      appendFileSync(join(root, source), `\n${forbidden.source}\n`);
      const result = validateRepository({ root });
      assert.ok(result.failures.includes(forbidden.label(source)), result.failures.join('\n'));
    });
  }
}
