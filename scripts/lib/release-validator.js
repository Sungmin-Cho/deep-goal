import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

const REQUIRED_FILES = [
  'skills/deep-goal/SKILL.md',
  'skills/deep-goal-workflow/SKILL.md',
  'skills/deep-goal-workflow/references/fitness-rubric.md',
  'skills/deep-goal-workflow/references/condition-compiler.md',
  'skills/deep-goal-workflow/references/platform-matrix.md',
  'skills/deep-goal-workflow/references/prep-scout.md',
  'skills/deep-goal-workflow/references/recipes/README.md',
  'skills/deep-goal-workflow/references/recipes/robust-implementation.md',
  'skills/deep-goal-workflow/references/recipes/autonomous-evolution.md',
  'skills/deep-goal-workflow/references/recipes/ship-and-document.md',
  'CLAUDE.md',
  'AGENTS.md',
  'README.md',
  'README.ko.md',
  'CHANGELOG.md',
  'CHANGELOG.ko.md',
  'scripts/lib/proof-gate.js',
  'scripts/lib/prep-scout.js',
  'scripts/deep-goal-runtime.js',
  'tests/proof-gate.test.js',
  'tests/runtime-cli.test.js',
];
const SHIPPED_CONTENT = ['skills', 'CLAUDE.md', 'AGENTS.md', 'README.md', 'README.ko.md'];
const SKIPPED_DIRECTORIES = new Set(['.git', 'node_modules']);
const RUNTIME_FORBIDDEN = [
  { label: 'no eval', pattern: /\beval\s*\(/ },
  { label: 'no Function constructor', pattern: /\bFunction\s*\(/ },
  { label: `no shell:${' true'}`, pattern: /shell\s*:\s*true/ },
  {
    label: 'no Markdown execution paths',
    pattern: /\b(?:exec|execSync|spawn|spawnSync|execFile|execFileSync)\s*\([^)]*['"`][^'"`]*\.md['"`]/,
  },
];

function readText(file) {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

function loadJson(file) {
  const source = readText(file);
  if (source === null) return null;
  try {
    const value = JSON.parse(source);
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

function allFiles(root, { includeDirectories = false } = {}) {
  const found = [];
  function walk(directory) {
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (SKIPPED_DIRECTORIES.has(entry.name)) continue;
      const file = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (includeDirectories) found.push(file);
        walk(file);
      } else if (entry.isFile()) {
        found.push(file);
      }
    }
  }
  walk(root);
  return found;
}

function portableRelative(root, file) {
  return relative(root, file).split(sep).join('/');
}

function hasPattern(file, pattern) {
  const source = readText(file);
  return source !== null && pattern.test(source);
}

function sectionAfterHeading(text, heading) {
  const start = text.search(new RegExp(`^${heading}`, 'm'));
  if (start === -1) return '';
  const remainder = text.slice(start);
  const boundary = remainder.slice(1).search(/\n(?:## |---\s*$)/m);
  return boundary === -1 ? remainder : remainder.slice(0, boundary + 1);
}

function countOccurrences(text, token) {
  return text.split(token).length - 1;
}

function markedHostSection(text, host) {
  const start = `<!-- deep-goal:${host}:start -->`;
  const end = `<!-- deep-goal:${host}:end -->`;
  if (countOccurrences(text, start) !== 1 || countOccurrences(text, end) !== 1) {
    return null;
  }
  const startIndex = text.indexOf(start) + start.length;
  const endIndex = text.indexOf(end, startIndex);
  return endIndex > startIndex ? text.slice(startIndex, endIndex) : null;
}

function hasPortableRuntimeCommands(text, commands) {
  return commands.every((command) => text.includes(
    `node "<absolute-plugin-root>/scripts/deep-goal-runtime.js" ${command} `
      + '--cwd "<absolute-project-root>"',
  ));
}

function hasBaselineForwarding(text) {
  return text.includes('--baseline "<scout.git.baselineHead>"');
}

function hasSixStages(text) {
  return ['감지', '적합성', '재구성', '레시피', '사전 준비물', '컴파일']
    .every((stage) => text.includes(stage));
}

function codexSectionIsPortable(text) {
  return !/(?:Skill\(|CLAUDE_PLUGIN_ROOT)/.test(text)
    && !/(?:^|\n)\s*`?(?:bash|sh)\b|```(?:bash|sh)\b/.test(text);
}

export function validateRepository({ root = process.cwd() } = {}) {
  const repositoryRoot = resolve(root);
  const checks = [];
  const failures = [];
  const check = (condition, label) => {
    (condition ? checks : failures).push(label);
  };
  const file = (path) => join(repositoryRoot, path);

  const claudeManifestPath = file('.claude-plugin/plugin.json');
  const codexManifestPath = file('.codex-plugin/plugin.json');
  const packagePath = file('package.json');
  const claudeManifest = loadJson(claudeManifestPath);
  const codexManifest = loadJson(codexManifestPath);
  const packageJson = loadJson(packagePath);

  check(claudeManifest !== null, 'valid JSON: .claude-plugin/plugin.json');
  check(codexManifest !== null, 'valid JSON: .codex-plugin/plugin.json');
  check(packageJson !== null, 'valid JSON: package.json');

  const versions = [claudeManifest?.version, codexManifest?.version, packageJson?.version];
  check(
    versions.every((version) => typeof version === 'string' && version.length > 0)
      && versions.every((version) => version === versions[0]),
    'version triple-sync',
  );
  check(codexManifest?.skills !== undefined, 'Codex manifest declares skills');
  check(
    Array.isArray(codexManifest?.interface?.defaultPrompt)
      && codexManifest.interface.defaultPrompt.some(
        (prompt) => typeof prompt === 'string' && prompt.includes('$deep-goal:deep-goal'),
      ),
    'Codex defaultPrompt entry',
  );

  for (const required of REQUIRED_FILES) {
    check(existsSync(file(required)), `required file: ${required}`);
  }

  const entry = readText(file('skills/deep-goal/SKILL.md')) ?? '';
  const workflow = readText(file('skills/deep-goal-workflow/SKILL.md')) ?? '';
  const rubric = readText(file('skills/deep-goal-workflow/references/fitness-rubric.md')) ?? '';
  const compiler = readText(file('skills/deep-goal-workflow/references/condition-compiler.md')) ?? '';
  const platformMatrix = readText(file('skills/deep-goal-workflow/references/platform-matrix.md')) ?? '';
  const prepScout = readText(file('skills/deep-goal-workflow/references/prep-scout.md')) ?? '';
  const recipesIndex = readText(file('skills/deep-goal-workflow/references/recipes/README.md')) ?? '';
  const robustRecipe = readText(file('skills/deep-goal-workflow/references/recipes/robust-implementation.md')) ?? '';

  const entryClaude = markedHostSection(entry, 'claude');
  const entryCodex = markedHostSection(entry, 'codex');
  const workflowClaude = markedHostSection(workflow, 'claude');
  const workflowCodex = markedHostSection(workflow, 'codex');
  const runtimeDocuments = [entry, workflow, prepScout, compiler, platformMatrix];

  check(entryClaude !== null && entryCodex !== null, 'skill runtime: entry host markers');
  check(
    workflowClaude !== null && workflowCodex !== null,
    'skill runtime: workflow host markers',
  );
  check(
    entryClaude !== null
      && entryCodex !== null
      && hasPortableRuntimeCommands(entryClaude, ['scout', 'evaluate-proof'])
      && hasPortableRuntimeCommands(entryCodex, ['scout', 'evaluate-proof']),
    'skill runtime: entry absolute Node route',
  );
  check(
    workflowClaude !== null
      && workflowCodex !== null
      && hasPortableRuntimeCommands(workflowClaude, ['scout', 'evaluate-proof'])
      && hasPortableRuntimeCommands(workflowCodex, ['scout', 'evaluate-proof']),
    'skill runtime: workflow absolute Node route',
  );
  check(
    hasPortableRuntimeCommands(prepScout, ['scout']),
    'skill runtime: prep-scout absolute Node route',
  );
  check(
    hasPortableRuntimeCommands(compiler, ['evaluate-proof']),
    'skill runtime: compiler absolute Node route',
  );
  check(
    entryClaude !== null
      && entryCodex !== null
      && hasBaselineForwarding(entryClaude)
      && hasBaselineForwarding(entryCodex),
    'skill runtime: entry baseline forwarding',
  );
  check(
    workflowClaude !== null
      && workflowCodex !== null
      && hasBaselineForwarding(workflowClaude)
      && hasBaselineForwarding(workflowCodex),
    'skill runtime: workflow baseline forwarding',
  );
  check(hasBaselineForwarding(prepScout), 'skill runtime: prep-scout baseline forwarding');
  check(hasBaselineForwarding(compiler), 'skill runtime: compiler baseline forwarding');
  check(
    entryClaude !== null
      && entryClaude.includes('Skill({ skill: "deep-goal:deep-goal-workflow" })'),
    'host dispatch: entry Claude workflow load',
  );
  check(
    entryCodex !== null && entryCodex.includes('../deep-goal-workflow/SKILL.md'),
    'host dispatch: entry Codex workflow read',
  );
  check(
    workflowClaude !== null
      && !workflowClaude.includes('Skill({ skill: "deep-goal:deep-goal-workflow"'),
    'host dispatch: workflow no Claude self-load',
  );
  check(
    workflowCodex !== null && !workflowCodex.includes('../deep-goal-workflow/SKILL.md'),
    'host dispatch: workflow no Codex self-read',
  );
  check(
    entryCodex !== null && codexSectionIsPortable(entryCodex),
    'host dispatch: entry Codex portable',
  );
  check(
    workflowCodex !== null && codexSectionIsPortable(workflowCodex),
    'host dispatch: workflow Codex portable',
  );
  check(
    entryClaude !== null
      && entryCodex !== null
      && hasSixStages(entryClaude)
      && hasSixStages(entryCodex),
    'skill runtime: entry six stages per host',
  );
  check(
    workflowClaude !== null
      && workflowCodex !== null
      && hasSixStages(workflowClaude)
      && hasSixStages(workflowCodex),
    'skill runtime: workflow six stages per host',
  );
  check(
    runtimeDocuments.every((document) => !/```(?:bash|sh)\b/.test(document)),
    'documentation: no bash or sh fences',
  );
  check(
    runtimeDocuments.every(
      (document) => !/deep-goal:(?:probe|render-decision):(start|end)/.test(document),
    ),
    'documentation: no shell mirror markers',
  );
  check(
    runtimeDocuments.every((document) => !/scripts\/[^\s`"']+\.sh\b/.test(document)),
    'documentation: no deleted shell routes',
  );
  check(
    [entryClaude, entryCodex, workflowClaude, workflowCodex, prepScout, compiler]
      .every((document) => document !== null
        && /fail-closed/i.test(document)
        && /(?:unverified|미검증)/i.test(document)),
    'skill runtime: fail-closed degraded mode',
  );

  check(/^---\r?\n[\s\S]*?^name: deep-goal\r?$/m.test(entry), 'entry skill frontmatter name');
  check(/^user-invocable: true$/m.test(entry), 'entry skill frontmatter user-invocable');
  check(/^description:/m.test(entry), 'entry skill frontmatter description');
  check(/^---\r?\n[\s\S]*?^name: deep-goal-workflow\r?$/m.test(workflow), 'workflow skill frontmatter name');
  check(/^user-invocable: false$/m.test(workflow), 'workflow skill frontmatter user-invocable');

  check(/종료[\s]?(상태|조건)/.test(entry), 'entry self-containment: end state');
  check(/증명/.test(entry), 'entry self-containment: proof method');
  check(/(불변|제약)/.test(entry), 'entry self-containment: constraints');
  check(/(상한|stop after|N ?turns|턴)/.test(entry), 'entry self-containment: bound');
  check(/(표면화|대화에[\s]?(명시|보고))/.test(entry), 'entry self-containment: evaluator surfacing');
  check(/(Codex|codex)/.test(entry), 'entry self-containment: Codex branch');
  check(/Skill\(/.test(entry), 'entry self-containment: Skill invocation');
  check(/\$deep-goal:deep-goal/.test(entry), 'entry self-containment: Codex user entry');
  check(/부재 또는 부실/.test(entry), 'entry self-containment: weak-proof trigger');
  check(/unconfirmed\(추정\)/.test(entry), 'entry self-containment: unconfirmed caveat');
  check(/독립 검증/.test(entry), 'entry self-containment: self-report caveat');
  check(
    /자동 호출 ?(불가|할 수 없|안 ?됨|못 ?함)/.test(entry)
      && !/자동 호출 ?(가능|할 수 있|됨|된다)/.test(entry),
    'native goal is not auto-invocable',
  );

  check(/(표면화|surface|대화에 (보고|명시))/.test(compiler), 'compiler evaluator-surfacing rule');
  check(/4,?000/.test(compiler), 'compiler 4000-character limit');
  check(/(반려|부적합)/.test(rubric), 'rubric reject verdict');
  check(/재구성/.test(rubric), 'rubric reshape verdict');
  check(/부재 또는 부실/.test(rubric), 'rubric weak-proof reshape trigger');

  check(/감지/.test(workflow), 'workflow stage: detect');
  check(/적합성/.test(workflow), 'workflow stage: fitness');
  check(/재구성/.test(workflow), 'workflow stage: reshape');
  check(/레시피/.test(workflow), 'workflow stage: recipe-match');
  check(/(사전 준비물|prep-scout|준비물)/.test(workflow), 'workflow stage: prerequisite scout');
  check(/(컴파일|제시)/.test(workflow), 'workflow stage: compile and present');
  check(/(붙여넣|복사|활성화 안내)/.test(workflow), 'workflow activation template');
  check(/(references|fitness-rubric|condition-compiler)/.test(workflow), 'workflow reference loading');

  for (const recipe of ['robust-implementation', 'autonomous-evolution', 'ship-and-document']) {
    const recipeText = readText(file(`skills/deep-goal-workflow/references/recipes/${recipe}.md`)) ?? '';
    check(recipesIndex.includes(recipe), `recipes index: ${recipe}`);
    check(/(트리거|Trigger|감지)/.test(recipeText), `recipe ${recipe}: trigger`);
    check(/(종료조건|종료 조건|Termination)/.test(recipeText), `recipe ${recipe}: termination`);
    check(/\/goal/.test(recipeText), `recipe ${recipe}: compiled goal example`);
  }
  check(/(Exit Gate|승인 게이트|승인)/.test(robustRecipe), 'robust recipe approval gate');
  check(/독립 검증/.test(compiler), 'compiler self-report caveat');
  check(/독립 검증/.test(platformMatrix), 'platform matrix self-report caveat');
  check(/session-receipt\.json/.test(robustRecipe), 'robust recipe receipt anchor');
  check(/\/deep-finish/.test(robustRecipe), 'robust recipe deep-finish');
  check(/(stale|이전 세션)/.test(robustRecipe), 'robust recipe stale receipt rejection');
  check(/session-receipt\.json/.test(sectionAfterHeading(robustRecipe, '### Codex')),
    'robust recipe Codex receipt anchor');
  check(/(confirmed|unconfirmed)/.test(prepScout), 'prep-scout proof-status labels');
  check(/evaluate-proof/.test(compiler), 'compiler Node proof evaluator');
  check(/subjective-placeholder/.test(compiler), 'compiler subjective proof class');
  check(/unconfirmed-artifact/.test(compiler), 'compiler unconfirmed artifact class');

  const canonicalVersion = versions[0];
  check(
    typeof canonicalVersion === 'string'
      && (readText(file('CHANGELOG.md')) ?? '').includes(`[${canonicalVersion}]`),
    'CHANGELOG.md version entry',
  );
  check(
    typeof canonicalVersion === 'string'
      && (readText(file('CHANGELOG.ko.md')) ?? '').includes(`[${canonicalVersion}]`),
    'CHANGELOG.ko.md version entry',
  );

  check(packageJson?.engines?.node === '>=22', 'package engines.node: >=22');
  check(packageJson?.scripts?.test === 'node --test', 'package scripts.test: node --test');
  check(
    packageJson?.scripts?.['verify:repo'] === 'node scripts/verify-plugin.js',
    'package scripts.verify:repo: node scripts/verify-plugin.js',
  );
  check(
    packageJson?.scripts?.verify === 'npm run verify:repo && npm test',
    'package scripts.verify: verify:repo && test',
  );

  const repositoryEntries = allFiles(repositoryRoot, { includeDirectories: true });
  for (const entryPath of repositoryEntries) {
    const labelPath = portableRelative(repositoryRoot, entryPath);
    let isDirectory = false;
    try {
      isDirectory = statSync(entryPath).isDirectory();
    } catch {
      continue;
    }
    if (isDirectory && (labelPath === 'hooks' || labelPath.endsWith('/hooks'))) {
      check(labelPath !== 'hooks', 'content-only: no hooks directory');
      if (labelPath !== 'hooks') check(false, 'content-only: no hooks directory (recursive)');
    }
    if (isDirectory && (labelPath === 'agents' || labelPath.endsWith('/agents'))) {
      check(labelPath !== 'agents', 'content-only: no agents directory');
      if (labelPath !== 'agents') check(false, 'content-only: no agents directory (recursive)');
    }
    if (!isDirectory && (labelPath === '.mcp.json' || labelPath.endsWith('/.mcp.json'))) {
      check(labelPath !== '.mcp.json', 'content-only: no .mcp.json');
      if (labelPath !== '.mcp.json') check(false, 'content-only: no .mcp.json (recursive)');
    }
    if (!isDirectory && labelPath.endsWith('plugin.json')) {
      const manifest = loadJson(entryPath);
      check(manifest !== null, `content-only: valid plugin manifest: ${labelPath}`);
      if (manifest !== null) {
        check(!Object.hasOwn(manifest, 'hooks'), `content-only: no hooks manifest key: ${labelPath}`);
        check(!Object.hasOwn(manifest, 'mcpServers'), `content-only: no MCP manifest key: ${labelPath}`);
      }
    }
  }
  check(!existsSync(file('hooks')), 'content-only: no hooks directory');
  check(!existsSync(file('agents')), 'content-only: no agents directory');
  check(!existsSync(file('.mcp.json')), 'content-only: no .mcp.json');

  for (const target of SHIPPED_CONTENT) {
    const targetPath = file(target);
    const files = existsSync(targetPath) && statSync(targetPath).isDirectory()
      ? allFiles(targetPath)
      : [targetPath];
    for (const candidate of files) {
      if (hasPattern(candidate, /(TBD|FIXME|TODO|작성 예정|fill in)/)) {
        check(false, 'no shipped placeholders');
      }
    }
  }
  if (!failures.includes('no shipped placeholders')) check(true, 'no shipped placeholders');

  const runtimeFiles = allFiles(file('scripts')).filter((candidate) => candidate.endsWith('.js'));
  for (const source of runtimeFiles) {
    const labelPath = portableRelative(repositoryRoot, source);
    for (const forbidden of RUNTIME_FORBIDDEN) {
      check(!hasPattern(source, forbidden.pattern), `runtime safety: ${labelPath}: ${forbidden.label}`);
    }
  }

  return { passed: failures.length === 0, checks, failures };
}
