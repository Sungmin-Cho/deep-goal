import assert from 'node:assert/strict';
import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { validateRepository } from '../scripts/lib/release-validator.js';

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PATHS = {
  entry: 'skills/deep-goal/SKILL.md',
  workflow: 'skills/deep-goal-workflow/SKILL.md',
  prepScout: 'skills/deep-goal-workflow/references/prep-scout.md',
  compiler: 'skills/deep-goal-workflow/references/condition-compiler.md',
  platformMatrix: 'skills/deep-goal-workflow/references/platform-matrix.md',
};
const EXCLUDED_FIXTURE_ROOTS = new Set(['.git', 'node_modules', '.deep-review', 'docs']);

function source(relativePath) {
  return readFileSync(resolve(REPOSITORY_ROOT, relativePath), 'utf8');
}

function markerCount(text, marker) {
  return text.split(marker).length - 1;
}

function section(text, host) {
  const start = `<!-- deep-goal:${host}:start -->`;
  const end = `<!-- deep-goal:${host}:end -->`;
  assert.equal(markerCount(text, start), 1, `${start} must appear exactly once`);
  assert.equal(markerCount(text, end), 1, `${end} must appear exactly once`);
  const startIndex = text.indexOf(start) + start.length;
  const endIndex = text.indexOf(end, startIndex);
  assert.ok(endIndex > startIndex, `${host} markers must be ordered`);
  return text.slice(startIndex, endIndex);
}

function assertPortableRuntimeContract(text, expectedCommands) {
  for (const expectedCommand of expectedCommands) {
    assert.match(
      text,
      new RegExp(
        `node "<absolute-plugin-root>/scripts/deep-goal-runtime\\.js" ${expectedCommand} `
          + '--cwd "<absolute-project-root>"',
      ),
    );
  }
  assert.match(text, /--baseline "<scout\.git\.baselineHead>"/);
}

function assertSixStages(text) {
  for (const stage of ['감지', '적합성', '재구성', '레시피', '사전 준비물', '컴파일']) {
    assert.match(text, new RegExp(stage), `missing workflow stage: ${stage}`);
  }
}

function assertFailClosedDegrade(text) {
  assert.match(text, /fail-closed/i);
  assert.match(text, /(?:unverified|미검증)/i);
  assert.match(text, /ready-to-run[^\n]*(?:금지|않|아님|not)/i);
}

function referencedMarkdownPaths(text) {
  return [...text.matchAll(
    /(?<![A-Za-z0-9_.-])((?:\.\.\/deep-goal-workflow\/)?references\/[A-Za-z0-9_./-]+\.md)/g,
  )].map((match) => match[1]);
}

function assertRelativeReferencesExist(relativeSkillPath, text) {
  const references = referencedMarkdownPaths(text);
  assert.ok(references.length > 0, `${relativeSkillPath} must name relative references`);
  for (const reference of new Set(references)) {
    const target = resolve(REPOSITORY_ROOT, dirname(relativeSkillPath), reference);
    assert.equal(existsSync(target), true, `${relativeSkillPath}: missing ${reference}`);
  }
}

function fixtureCopy(t) {
  const root = mkdtempSync(join(tmpdir(), 'deep goal runtime contract '));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  cpSync(REPOSITORY_ROOT, root, {
    recursive: true,
    filter(candidate) {
      const first = relative(REPOSITORY_ROOT, candidate).split(sep)[0];
      return !EXCLUDED_FIXTURE_ROOTS.has(first);
    },
  });
  return root;
}

function replaceOnce(root, relativePath, expected, replacement) {
  const file = resolve(root, relativePath);
  const text = readFileSync(file, 'utf8');
  assert.ok(text.includes(expected), `${relativePath}: missing mutation anchor`);
  writeFileSync(file, text.replace(expected, replacement));
}

test('entry isolates Claude and Codex dispatch while converging on the Node runtime', () => {
  const entry = source(PATHS.entry);
  const entryClaude = section(entry, 'claude');
  const entryCodex = section(entry, 'codex');

  assert.match(entry, /\| Claude Code user \| `\/deep-goal <request>` \|/);
  assert.match(entry, /\| Codex user \| `\$deep-goal:deep-goal <request>` \|/);
  assert.match(
    entry,
    /\| Claude Code programmatic dispatch \| `Skill\(\{ skill: "deep-goal:deep-goal", args \}\)` \|/,
  );
  assert.match(entryClaude, /Claude Code 사용자[\s\S]*\/deep-goal/);
  assert.match(entryCodex, /Codex 사용자[\s\S]*\$deep-goal:deep-goal/);
  assert.match(entryClaude, /Skill\(\{ skill: "deep-goal:deep-goal-workflow"/);
  assert.match(entryCodex, /\.\.\/deep-goal-workflow\/SKILL\.md/);

  assert.doesNotMatch(entryCodex, /Skill\(|CLAUDE_PLUGIN_ROOT/);
  assert.doesNotMatch(
    entryCodex,
    /(?:^|\n)\s*(?:`?)(?:bash|sh)\b|```(?:bash|sh)\b/,
  );

  for (const hostSection of [entryClaude, entryCodex]) {
    assertSixStages(hostSection);
    assertPortableRuntimeContract(hostSection, ['scout', 'evaluate-proof']);
    assertFailClosedDegrade(hostSection);
  }
  assertRelativeReferencesExist(PATHS.entry, entry);
});

test('workflow host branches load only their own references and share all six stages', () => {
  const workflow = source(PATHS.workflow);
  const workflowClaude = section(workflow, 'claude');
  const workflowCodex = section(workflow, 'codex');

  assert.doesNotMatch(
    workflowClaude,
    /Skill\(\{ skill: "deep-goal:deep-goal-workflow"/,
  );
  assert.doesNotMatch(workflowCodex, /\.\.\/deep-goal-workflow\/SKILL\.md/);
  assert.match(workflowClaude, /references\//);
  assert.match(workflowCodex, /references\//);
  assert.doesNotMatch(workflowCodex, /Skill\(|CLAUDE_PLUGIN_ROOT/);
  assert.doesNotMatch(
    workflowCodex,
    /(?:^|\n)\s*(?:`?)(?:bash|sh)\b|```(?:bash|sh)\b/,
  );

  for (const hostSection of [workflowClaude, workflowCodex]) {
    assertSixStages(hostSection);
    assertPortableRuntimeContract(hostSection, ['scout', 'evaluate-proof']);
    assertFailClosedDegrade(hostSection);
  }
  assertRelativeReferencesExist(PATHS.workflow, workflow);
});

test('shipped workflow documentation exposes only portable Node argv contracts', () => {
  const documents = Object.fromEntries(
    Object.entries(PATHS).map(([name, relativePath]) => [name, source(relativePath)]),
  );

  for (const [name, text] of Object.entries(documents)) {
    assert.doesNotMatch(text, /```(?:bash|sh)\b/, `${name} contains an active shell fence`);
  }

  assertPortableRuntimeContract(documents.entry, ['scout', 'evaluate-proof']);
  assertPortableRuntimeContract(documents.workflow, ['scout', 'evaluate-proof']);
  assertPortableRuntimeContract(documents.prepScout, ['scout']);
  assertPortableRuntimeContract(documents.compiler, ['evaluate-proof']);

  assert.match(documents.prepScout, /scout\.git\.baselineHead[\s\S]*forward|forward[\s\S]*scout\.git\.baselineHead/i);
  assert.match(documents.compiler, /objective-artifact[\s\S]*committed `HEAD` blob/);
  assert.match(documents.compiler, /baseline\.\.HEAD/);
  assert.match(documents.compiler, /post-commit dirty mutation/);
  assert.match(documents.platformMatrix, /presentation[\s\S]*shared Node[\s\S]*(?:scout|evaluate-proof)/i);
  assertFailClosedDegrade(documents.prepScout);
  assertFailClosedDegrade(documents.compiler);
});

test('release validator accepts the portable host-runtime documentation', (t) => {
  const result = validateRepository({ root: fixtureCopy(t) });
  assert.equal(result.passed, true, result.failures.join('\n'));
});

const validatorMutations = [
  {
    name: 'entry host marker removal',
    expected: 'skill runtime: entry host markers',
    apply(root) {
      replaceOnce(
        root,
        PATHS.entry,
        '<!-- deep-goal:claude:start -->',
        '<!-- deep-goal:claude:missing -->',
      );
    },
  },
  {
    name: 'relative entry scout route',
    expected: 'skill runtime: entry absolute Node route',
    apply(root) {
      replaceOnce(
        root,
        PATHS.entry,
        'node "<absolute-plugin-root>/scripts/deep-goal-runtime.js" scout',
        'node scripts/deep-goal-runtime.js scout',
      );
    },
  },
  {
    name: 'Claude API in the entry Codex branch',
    expected: 'host dispatch: entry Codex portable',
    apply(root) {
      replaceOnce(
        root,
        PATHS.entry,
        '<!-- deep-goal:codex:end -->',
        'Skill({ skill: "deep-goal:deep-goal-workflow" })\n<!-- deep-goal:codex:end -->',
      );
    },
  },
  {
    name: 'workflow Claude self-load',
    expected: 'host dispatch: workflow no Claude self-load',
    apply(root) {
      replaceOnce(
        root,
        PATHS.workflow,
        '<!-- deep-goal:claude:end -->',
        'Skill({ skill: "deep-goal:deep-goal-workflow" })\n<!-- deep-goal:claude:end -->',
      );
    },
  },
  {
    name: 'workflow Codex self-read',
    expected: 'host dispatch: workflow no Codex self-read',
    apply(root) {
      replaceOnce(
        root,
        PATHS.workflow,
        '<!-- deep-goal:codex:end -->',
        '../deep-goal-workflow/SKILL.md\n<!-- deep-goal:codex:end -->',
      );
    },
  },
  {
    name: 'compiler baseline omission',
    expected: 'skill runtime: compiler baseline forwarding',
    apply(root) {
      replaceOnce(
        root,
        PATHS.compiler,
        ' --baseline "<scout.git.baselineHead>"',
        '',
      );
    },
  },
  {
    name: 'active shell fence',
    expected: 'documentation: no bash or sh fences',
    apply(root) {
      appendFileSync(resolve(root, PATHS.platformMatrix), '\n```bash\necho unsafe\n```\n');
    },
  },
  {
    name: 'legacy shell mirror marker',
    expected: 'documentation: no shell mirror markers',
    apply(root) {
      appendFileSync(
        resolve(root, PATHS.prepScout),
        '\n<!-- deep-goal:probe:start -->\nlegacy mirror\n<!-- deep-goal:probe:end -->\n',
      );
    },
  },
  {
    name: 'entry six-stage token removal',
    expected: 'skill runtime: entry six stages per host',
    apply(root) {
      replaceOnce(
        root,
        PATHS.entry,
        '사전 준비물 탐색 → 컴파일 + 제시',
        '사전 준비물 탐색 → present',
      );
    },
  },
  {
    name: 'entry fail-closed degrade removal',
    expected: 'skill runtime: fail-closed degraded mode',
    apply(root) {
      replaceOnce(
        root,
        PATHS.entry,
        'fail-closed로 동작하며',
        'fail closed로 동작하며',
      );
    },
  },
  {
    name: 'deleted shell route reference',
    expected: 'documentation: no deleted shell routes',
    apply(root) {
      appendFileSync(
        resolve(root, PATHS.platformMatrix),
        '\n참고: scripts/legacy-proof-gate.sh 를 실행한다.\n',
      );
    },
  },
  {
    name: 'CLAUDE_PLUGIN_ROOT in the workflow Codex branch',
    expected: 'host dispatch: workflow Codex portable',
    apply(root) {
      replaceOnce(
        root,
        PATHS.workflow,
        '<!-- deep-goal:codex:end -->',
        'CLAUDE_PLUGIN_ROOT 를 요구한다.\n<!-- deep-goal:codex:end -->',
      );
    },
  },
];

for (const mutation of validatorMutations) {
  test(`release validator rejects ${mutation.name}`, (t) => {
    const root = fixtureCopy(t);
    mutation.apply(root);
    const result = validateRepository({ root });
    assert.ok(result.failures.includes(mutation.expected), result.failures.join('\n'));
  });
}
