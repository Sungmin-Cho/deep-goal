import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const file = (relativePath) => resolve(ROOT, relativePath);
const text = (relativePath) => readFileSync(file(relativePath), 'utf8');
const json = (relativePath) => JSON.parse(text(relativePath));

const claudeManifest = json('.claude-plugin/plugin.json');
const codexManifest = json('.codex-plugin/plugin.json');
const packageJson = json('package.json');

function markdownHeadings(source) {
  const headings = [];
  let inFence = false;
  for (const line of source.split(/\r?\n/)) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const match = /^(#{1,4})\s+(.+?)\s*$/.exec(line);
    if (match) headings.push({ level: match[1].length, title: match[2] });
  }
  return headings;
}

const README_HEADINGS = [
  [/^deep-goal$/, 'deep-goal'],
  [/^(?:Critical constraint|핵심 제약)$/, 'critical-constraint'],
  [/^(?:Installation|설치)$/, 'installation'],
  [/^(?:Option 1|방법 1)\b/, 'installation-local'],
  [/^(?:Option 2|방법 2)\b/, 'installation-marketplace'],
  [/^(?:Usage|사용법)$/, 'usage'],
  [/^Claude Code$/, 'claude-code'],
  [/^Codex$/, 'codex'],
  [/^(?:(?:Claude Code )?SDK \/ programmatic|Claude Code SDK \/ 프로그래밍 호출|SDK \/ 프로그래밍 호출)/, 'claude-sdk'],
  [/^(?:Runtime compatibility|런타임 호환성)$/, 'runtime-compatibility'],
  [/^(?:6-step workflow|6단계 워크플로우)$/, 'workflow'],
  [/^(?:Synergy recipes|시너지 레시피)$/, 'recipes'],
  [/^(?:The 4 compiled elements|컴파일 4요소)$/, 'compiled-elements'],
  [/^deep-suite (?:links|링크)$/, 'deep-suite-links'],
  [/^(?:License|라이선스)$/, 'license'],
];

function normalizeReadmeHeadings(source) {
  return markdownHeadings(source).map(({ level, title }) => {
    const pair = README_HEADINGS.find(([pattern]) => pattern.test(title));
    assert.ok(pair, `unknown README heading: ${title}`);
    return `${level}:${pair[1]}`;
  });
}

function normalizeChangelogHeadings(source) {
  return markdownHeadings(source).map(({ level, title }) => {
    let normalized;
    if (/^(?:Changelog|변경 이력)$/.test(title)) normalized = 'changelog';
    else if (/^\[\d+\.\d+\.\d+\] — \d{4}-\d{2}-\d{2}$/.test(title)) normalized = title;
    else if (/^(?:Added|추가됨)$/.test(title)) normalized = 'added';
    else if (/^(?:Changed|변경됨)$/.test(title)) normalized = 'changed';
    else if (/^(?:Removed|제거됨)$/.test(title)) normalized = 'removed';
    else if (/^(?:Fixed|수정됨)$/.test(title)) normalized = 'fixed';
    else if (/^(?:Security|보안)$/.test(title)) normalized = 'security';
    assert.ok(normalized, `unknown CHANGELOG heading: ${title}`);
    return `${level}:${normalized}`;
  });
}

function firstVersionHeading(source) {
  return markdownHeadings(source).find(
    ({ level, title }) => level === 2 && /^\[\d+\.\d+\.\d+\]/.test(title),
  )?.title ?? '';
}

function versionSection(source, version) {
  const startPattern = new RegExp(`^## \\[${version.replaceAll('.', '\\.')}\\] — `, 'm');
  const start = source.search(startPattern);
  if (start === -1) return '';
  const remainder = source.slice(start);
  const next = remainder.slice(1).search(/\n## \[\d+\.\d+\.\d+\] — /);
  return next === -1 ? remainder : remainder.slice(0, next + 1);
}

function assertNode22WindowsContract(source, language) {
  assert.match(source, /Node\.js 22/);
  assert.match(source, language === 'ko' ? /네이티브 Windows 11/ : /native Windows 11/i);
  assert.match(
    source,
    language === 'ko'
      ? /Git Bash(?:가|은|는|을|를)?[^\n]*(?:필요하지 않|요구하지 않|불필요)/
      : /(?:without|no requirement for) Git Bash/i,
  );
}

test('release versions and manifest host claims are pinned to 1.2.1', () => {
  assert.deepEqual(
    [claudeManifest.version, codexManifest.version, packageJson.version],
    ['1.2.1', '1.2.1', '1.2.1'],
  );
  assert.equal(packageJson.engines?.node, '>=22');

  for (const manifest of [claudeManifest, codexManifest]) {
    assert.match(manifest.description, /Claude Code/);
    assert.match(manifest.description, /Codex/);
    assert.doesNotMatch(manifest.description, /Copilot|Gemini/);
  }
  assert.equal(Object.hasOwn(codexManifest, 'hooks'), false);
  assert.equal(Object.hasOwn(codexManifest, 'mcpServers'), false);
});

test('bilingual changelogs publish matching 1.2.1 release sections and dates', () => {
  const english = text('CHANGELOG.md');
  const korean = text('CHANGELOG.ko.md');
  const englishHeading = firstVersionHeading(english);
  const koreanHeading = firstVersionHeading(korean);

  assert.match(englishHeading, /^\[1\.2\.1\] — \d{4}-\d{2}-\d{2}$/);
  assert.match(koreanHeading, /^\[1\.2\.1\] — \d{4}-\d{2}-\d{2}$/);
  assert.equal(englishHeading.slice(-10), koreanHeading.slice(-10));
  assert.deepEqual(normalizeChangelogHeadings(english), normalizeChangelogHeadings(korean));

  const englishRelease = versionSection(english, '1.2.1');
  const koreanRelease = versionSection(korean, '1.2.1');
  for (const heading of ['### Changed', '### Removed', '### Security']) {
    assert.match(englishRelease, new RegExp(`^${heading}$`, 'm'));
  }
  for (const heading of ['### 변경됨', '### 제거됨', '### 보안']) {
    assert.match(koreanRelease, new RegExp(`^${heading}$`, 'm'));
  }
  assert.doesNotMatch(
    `${englishRelease}\n${koreanRelease}`,
    /\b\d+\/\d+\b|deep-review|classifyProofLine|commit [0-9a-f]{7,40}/i,
  );
});

test('bilingual READMEs expose matching native host and runtime contracts', () => {
  const english = text('README.md');
  const korean = text('README.ko.md');

  assert.deepEqual(normalizeReadmeHeadings(english), normalizeReadmeHeadings(korean));
  assertNode22WindowsContract(english, 'en');
  assertNode22WindowsContract(korean, 'ko');

  for (const readme of [english, korean]) {
    assert.match(readme, /\/deep-goal/);
    assert.match(readme, /\$deep-goal:deep-goal/);
    assert.match(readme, /scout[\s\S]*evaluate-proof/);
    assert.match(readme, /fail-closed/i);
    assert.match(readme, /(?:unverified|미검증)/i);
    assert.doesNotMatch(readme, /^### .*Codex.*(?:SDK|programmatic|프로그래밍)/mi);
  }
  assert.match(english, /^### Claude Code SDK \/ programmatic$/m);
  assert.match(korean, /^### Claude Code SDK \/ 프로그래밍 호출$/m);
});

test('three-OS CI verifies Node 22 from a checkout path containing spaces', () => {
  const workflowPath = '.github/workflows/ci.yml';
  assert.equal(existsSync(file(workflowPath)), true, `${workflowPath} must exist`);
  const workflow = text(workflowPath);

  for (const runner of ['ubuntu-latest', 'macos-latest', 'windows-latest']) {
    assert.match(workflow, new RegExp(runner));
  }
  assert.match(workflow, /node-version:\s*['"]?22['"]?/);
  assert.match(workflow, /npm run verify/);
  assert.match(workflow, /path:\s*deep-goal workspace/);
  assert.match(workflow, /working-directory:\s*deep-goal workspace/);
  assert.doesNotMatch(workflow, /```(?:bash|sh)\b|\bbash\b/);
  assert.doesNotMatch(workflow, /^\s*(?:if|shell):/m);
});

test('contributor guide documents the portable Node release chain', () => {
  const contributing = text('CONTRIBUTING.md');
  assertNode22WindowsContract(contributing, 'en');
  assert.match(contributing, /npm test/);
  assert.match(contributing, /npm run verify/);
  assert.match(contributing, /scripts\/verify-plugin\.js/);
  assert.match(contributing, /scripts\/lib\/release-validator\.js/);
  assert.match(contributing, /node --test/);
  assert.doesNotMatch(
    contributing,
    /verify-plugin\.sh|verify-selftest\.sh|verify-probe\.sh|bash scripts\//,
  );
  assert.match(contributing, /docs\/DOCS_RULE\.md/);
  assert.match(contributing, /no `hooks\/`/i);
  assert.match(contributing, /no `agents\/`/i);
  assert.match(contributing, /no (?:MCP|`\.mcp\.json`)/i);
});

test('the shared agent guide names only the Node verification surface', () => {
  const guide = text('AGENTS.md');

  assert.match(guide, /Node\.js 22/);
  assert.match(guide, /native Windows 11/i);
  assert.match(guide, /(?:without|no requirement for) Git Bash/i);
  assert.match(guide, /npm test/);
  assert.match(guide, /npm run verify/);
  assert.match(guide, /scripts\/verify-plugin\.js/);
  assert.match(guide, /scripts\/lib\/release-validator\.js/);
  assert.match(guide, /node --test/);
  // A path-free lookup. The previous `node -e` one-liner named
  // `.claude-plugin/plugin.json` relative to the current working directory,
  // which is the shadowable form the reference-integrity guard rejects; the
  // version triple-sync check keeps package.json equal to both manifests.
  assert.ok(guide.includes('npm pkg get version'), 'AGENTS.md: portable version lookup');
  assert.doesNotMatch(
    guide,
    /\bjq\b|verify-plugin\.sh|verify-selftest\.sh|verify-probe\.sh|bash scripts\//,
  );
  assert.match(guide, /docs\/DOCS_RULE\.md/);
  assert.match(guide, /no `?hooks\/?`?/i);
  assert.match(guide, /no `?agents\/?`?/i);
  assert.match(guide, /no (?:MCP|`\.mcp\.json`)/i);
});

test('CLAUDE.md imports the shared guide and AGENTS.md stays self-contained', () => {
  // One shared file, two hosts: AGENTS.md carries every shared rule and takes no
  // `@`-import of its own, because Codex does not support them. CLAUDE.md is the
  // import plus Claude-only content, and the direction is never reversed.
  assert.match(text('CLAUDE.md'), /^@AGENTS\.md$/m);
  assert.doesNotMatch(text('AGENTS.md'), /^@[A-Za-z]/m);
  assert.doesNotMatch(text('AGENTS.md'), /^@CLAUDE\.md$/m);
});
