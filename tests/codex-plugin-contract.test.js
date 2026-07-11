import assert from 'node:assert/strict';
import test from 'node:test';
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

// Mirrors stable constraints in $CODEX_HOME/skills/.system/plugin-creator/scripts/validate_plugin.py.
const ALLOWED_TOP_LEVEL = new Set([
  'id', 'name', 'version', 'description', 'skills', 'apps', 'mcpServers',
  'interface', 'author', 'homepage', 'repository', 'license', 'keywords',
]);
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EXCLUDED_FIXTURE_ROOTS = new Set(['.git', 'node_modules', '.deep-review', 'docs']);
// Mirrors validate_plugin.py: nested field allow-lists, brandColor, and the [TODO:] placeholder scan.
const AUTHOR_ALLOWED = new Set(['name', 'email', 'url']);
const INTERFACE_ALLOWED = new Set([
  'displayName', 'shortDescription', 'longDescription', 'developerName', 'category',
  'capabilities', 'websiteURL', 'privacyPolicyURL', 'termsOfServiceURL', 'brandColor',
  'composerIcon', 'logo', 'logoDark', 'screenshots', 'defaultPrompt', 'default_prompt',
]);
const HEX_COLOR = /^#[0-9A-F]{6}$/i;
const TODO_MARKER = '[TODO:';

function copyFixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'deep goal Codex contract '));
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

function skillFiles(root) {
  const skillsRoot = join(root, 'skills');
  return readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => join(skillsRoot, entry.name, 'SKILL.md'));
}

function rewriteLineEndings(file, eol) {
  const source = readFileSync(file, 'utf8');
  writeFileSync(file, source.replace(/\r?\n/g, eol));
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function assertNoTodoMarkers(value, path) {
  if (typeof value === 'string') {
    assert.equal(value.includes(TODO_MARKER), false, `${path} still contains a [TODO: ...] placeholder`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoTodoMarkers(item, `${path}[${index}]`));
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) assertNoTodoMarkers(item, `${path}.${key}`);
  }
}

function assertAllowedFields(payload, allowed, prefix) {
  for (const key of Object.keys(payload)) {
    assert.equal(allowed.has(key), true, `${prefix}.${key} is not accepted by plugin validation`);
  }
}

function assertOptionalHttpsUrl(payload, key, prefix) {
  const value = payload[key];
  if (value === undefined) return;
  let parsed = null;
  if (typeof value === 'string') {
    try {
      parsed = new URL(value);
    } catch {
      parsed = null;
    }
  }
  assert.ok(parsed !== null && parsed.protocol === 'https:' && parsed.host !== '',
    `${prefix}.${key} must be an absolute https:// URL`);
}

function assertOptionalNonEmptyString(payload, key, prefix) {
  const value = payload[key];
  if (value === undefined) return;
  assert.equal(nonEmpty(value), true, `${prefix}.${key} must be a non-empty string`);
}

function assertAssetInsideRoot(root, rawPath, label) {
  assert.ok(nonEmpty(rawPath), `${label} must be a non-empty relative path`);
  const portable = rawPath.replaceAll('\\', '/');
  assert.equal(isAbsolute(portable), false, `${label} must not be absolute`);
  assert.equal(portable.split('/').some((part) => part === '' || part === '.' || part === '..'), false,
    `${label} must stay inside plugin root`);
  const candidate = resolve(root, portable);
  const fromRoot = relative(root, candidate);
  assert.equal(fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot), false,
    `${label} must stay inside plugin root`);
  assert.equal(statSync(candidate).isFile(), true, `${label} must point to a file`);
}

function assertSkillFrontmatter(file) {
  const source = readFileSync(file, 'utf8');
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(source);
  assert.ok(match !== null, `${file} must have closed frontmatter`);
  const frontmatter = match[1];
  assert.match(frontmatter, /^name:[ \t]*\S[^\r\n]*\r?$/m, `${file} frontmatter needs a name`);
  assert.match(
    frontmatter,
    /^description:[ \t]*\S[^\r\n]*\r?$/m,
    `${file} frontmatter needs a description`,
  );
  assert.doesNotMatch(
    frontmatter,
    /^disable(?:-|_)model(?:-|_)invocation:[ \t]*(?!false[ \t]*\r?$)[^\r\n]*\r?$/m,
    `${file} may only disable model invocation with false`);
}

function assertNoContentOnlyArtifacts(root) {
  assert.equal(statExists(join(root, 'hooks')), false, 'content-only plugin cannot have hooks/');
  assert.equal(statExists(join(root, '.mcp.json')), false, 'content-only plugin cannot have .mcp.json');
  const manifest = JSON.parse(readFileSync(join(root, '.codex-plugin/plugin.json'), 'utf8'));
  assert.equal(Object.hasOwn(manifest, 'hooks'), false, 'content-only plugin cannot declare hooks');
  assert.equal(Object.hasOwn(manifest, 'mcpServers'), false, 'content-only plugin cannot declare mcpServers');
}

function statExists(file) {
  try {
    statSync(file);
    return true;
  } catch {
    return false;
  }
}

export function assertCodexPluginContract(root) {
  const manifest = JSON.parse(readFileSync(join(root, '.codex-plugin/plugin.json'), 'utf8'));
  assertNoTodoMarkers(manifest, '$');
  for (const key of Object.keys(manifest)) {
    assert.equal(ALLOWED_TOP_LEVEL.has(key), true, `unsupported top-level field: ${key}`);
  }
  for (const key of ['name', 'version', 'description']) {
    assert.equal(nonEmpty(manifest[key]), true, `plugin.json ${key} must be non-empty`);
  }
  assert.match(manifest.version, SEMVER, 'plugin.json version must be strict semver');
  if (manifest.id !== undefined) assert.equal(nonEmpty(manifest.id), true, 'plugin.json id must be non-empty');
  assert.equal(typeof manifest.author, 'object', 'plugin.json author must be an object');
  assert.equal(nonEmpty(manifest.author.name), true, 'author.name must be non-empty');
  assertAllowedFields(manifest.author, AUTHOR_ALLOWED, 'author');
  assertOptionalNonEmptyString(manifest.author, 'email', 'author');
  assertOptionalHttpsUrl(manifest.author, 'url', 'author');
  // Official validator treats `skills` as optional (validate_optional_contract_path); only enforce
  // the resolved value when the key is present so a valid skills-less manifest does not crash.
  if (manifest.skills !== undefined) {
    assert.equal(manifest.skills.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, ''), 'skills',
      'plugin.json skills must resolve to skills');
  }

  const iface = manifest.interface;
  assert.equal(typeof iface, 'object', 'plugin.json interface must be an object');
  assertAllowedFields(iface, INTERFACE_ALLOWED, 'interface');
  for (const key of ['displayName', 'shortDescription', 'longDescription', 'developerName', 'category']) {
    assert.equal(nonEmpty(iface[key]), true, `interface.${key} must be non-empty`);
  }
  assert.ok(Array.isArray(iface.capabilities) && iface.capabilities.every(nonEmpty),
    'interface.capabilities must be an array of non-empty strings');
  assert.ok(
    Array.isArray(iface.defaultPrompt)
      && iface.defaultPrompt.some((prompt) => nonEmpty(prompt) && prompt.includes('$deep-goal:deep-goal')),
    'interface.defaultPrompt must include $deep-goal:deep-goal');

  if (iface.brandColor !== undefined) {
    assert.ok(typeof iface.brandColor === 'string' && HEX_COLOR.test(iface.brandColor),
      'interface.brandColor must use #RRGGBB');
  }
  for (const key of ['websiteURL', 'privacyPolicyURL', 'termsOfServiceURL']) {
    assertOptionalHttpsUrl(iface, key, 'interface');
  }

  for (const key of ['composerIcon', 'logo', 'logoDark']) {
    if (iface[key] !== undefined) assertAssetInsideRoot(root, iface[key], `interface.${key}`);
  }
  assert.ok(Array.isArray(iface.screenshots), 'interface.screenshots must be an array');
  iface.screenshots.forEach((asset, index) => assertAssetInsideRoot(root, asset, `interface.screenshots[${index}]`));

  const skillsRoot = join(root, 'skills');
  for (const entry of readdirSync(skillsRoot, { withFileTypes: true })) {
    if (entry.isDirectory() && !entry.name.startsWith('.')) {
      assertSkillFrontmatter(join(skillsRoot, entry.name, 'SKILL.md'));
    }
  }
  assertNoContentOnlyArtifacts(root);
}

test('current repository satisfies the pinned Codex plugin contract', () => {
  assertCodexPluginContract(REPOSITORY_ROOT);
});

test('contract pin accepts LF and CRLF skill frontmatter', (t) => {
  for (const [label, eol] of [['LF', '\n'], ['CRLF', '\r\n']]) {
    const root = copyFixture(t);
    for (const file of skillFiles(root)) rewriteLineEndings(file, eol);
    assert.doesNotThrow(() => assertCodexPluginContract(root), label);
  }
});

test('contract pin rejects malformed CRLF skill frontmatter', (t) => {
  const unclosedRoot = copyFixture(t);
  const unclosedFile = join(unclosedRoot, 'skills/deep-goal/SKILL.md');
  rewriteLineEndings(unclosedFile, '\r\n');
  writeFileSync(
    unclosedFile,
    readFileSync(unclosedFile, 'utf8').replace(
      /\r\n---(?=\r\n|$)/g,
      '\r\nnot-a-closing-fence',
    ),
  );
  assert.throws(() => assertCodexPluginContract(unclosedRoot), /must have closed frontmatter/);

  const missingDescriptionRoot = copyFixture(t);
  const missingDescriptionFile = join(missingDescriptionRoot, 'skills/deep-goal/SKILL.md');
  rewriteLineEndings(missingDescriptionFile, '\r\n');
  writeFileSync(
    missingDescriptionFile,
    readFileSync(missingDescriptionFile, 'utf8').replace(
      /^description:[^\r\n]*\r?$/m,
      'description:',
    ),
  );
  assert.throws(
    () => assertCodexPluginContract(missingDescriptionRoot),
    /frontmatter needs a description/,
  );

  const forbiddenInvocationRoot = copyFixture(t);
  const forbiddenInvocationFile = join(forbiddenInvocationRoot, 'skills/deep-goal/SKILL.md');
  rewriteLineEndings(forbiddenInvocationFile, '\r\n');
  writeFileSync(
    forbiddenInvocationFile,
    readFileSync(forbiddenInvocationFile, 'utf8').replace(
      '\r\n---\r\n',
      '\r\ndisable-model-invocation: true\r\n---\r\n',
    ),
  );
  assert.throws(
    () => assertCodexPluginContract(forbiddenInvocationRoot),
    /may only disable model invocation with false/,
  );
});

test('fixture-only non-semver mutation proves the contract pin is red', (t) => {
  const root = copyFixture(t);
  const file = join(root, '.codex-plugin/plugin.json');
  const manifest = JSON.parse(readFileSync(file, 'utf8'));
  manifest.version = 'not semver';
  writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
  assert.throws(() => assertCodexPluginContract(root), /strict semver/);
});

// Each mutation is a manifest the official validate_plugin.py rejects; the contract pin must too.
const contractMutations = [
  {
    name: 'TODO placeholder marker',
    match: /still contains a \[TODO: \.\.\.\] placeholder/,
    apply(manifest) { manifest.description = '[TODO: write me]'; },
  },
  {
    name: 'unknown interface field',
    match: /interface\.bogusField is not accepted by plugin validation/,
    apply(manifest) { manifest.interface.bogusField = 'x'; },
  },
  {
    name: 'unknown author field',
    match: /author\.bogus is not accepted by plugin validation/,
    apply(manifest) { manifest.author.bogus = 'x'; },
  },
  {
    name: 'non-hex brandColor',
    match: /interface\.brandColor must use #RRGGBB/,
    apply(manifest) { manifest.interface.brandColor = 'not-a-hex'; },
  },
  {
    name: 'non-https websiteURL',
    match: /interface\.websiteURL must be an absolute https:\/\//,
    apply(manifest) { manifest.interface.websiteURL = 'ftp://evil'; },
  },
  {
    name: 'non-https author url',
    match: /author\.url must be an absolute https:\/\//,
    apply(manifest) { manifest.author.url = 'http://evil'; },
  },
  {
    name: 'empty author email',
    match: /author\.email must be a non-empty string/,
    apply(manifest) { manifest.author.email = ''; },
  },
  {
    name: 'skills resolving elsewhere',
    match: /skills must resolve to skills/,
    apply(manifest) { manifest.skills = './elsewhere/'; },
  },
];

for (const mutation of contractMutations) {
  test(`contract pin rejects ${mutation.name}`, (t) => {
    const root = copyFixture(t);
    const file = join(root, '.codex-plugin/plugin.json');
    const manifest = JSON.parse(readFileSync(file, 'utf8'));
    mutation.apply(manifest);
    writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
    assert.throws(() => assertCodexPluginContract(root), mutation.match);
  });
}

test('contract pin tolerates an omitted optional skills field (mirrors official validator)', (t) => {
  const root = copyFixture(t);
  const file = join(root, '.codex-plugin/plugin.json');
  const manifest = JSON.parse(readFileSync(file, 'utf8'));
  delete manifest.skills;
  writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
  assert.doesNotThrow(() => assertCodexPluginContract(root));
});
