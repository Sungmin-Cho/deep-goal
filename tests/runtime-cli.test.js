import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { after, test } from 'node:test';

const CLI = fileURLToPath(new URL('../scripts/deep-goal-runtime.js', import.meta.url));
const root = mkdtempSync(join(tmpdir(), 'deep goal runtime '));

after(() => {
  rmSync(root, { recursive: true, force: true });
});

function runGit(cwd, args) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
    shell: false,
  });
  assert.equal(
    result.status,
    0,
    `git ${args.join(' ')} failed\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
  );
  return result.stdout.trim();
}

function runCli(args) {
  return spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    windowsHide: true,
    shell: false,
  });
}

function payload(result) {
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.equal(result.stdout.endsWith('\n'), true);
  assert.equal(result.stdout.trim().split('\n').length, 1);
  return JSON.parse(result.stdout);
}

function makeProject(name) {
  const cwd = join(root, name);
  mkdirSync(cwd, { recursive: true });
  writeFileSync(
    join(cwd, 'package.json'),
    JSON.stringify({ name, scripts: { verify: 'node scripts/verify project.js' } }),
  );
  runGit(cwd, ['init', '--quiet']);
  runGit(cwd, ['config', 'user.email', 'deep-goal@example.test']);
  runGit(cwd, ['config', 'user.name', 'Deep Goal Test']);
  runGit(cwd, ['add', 'package.json']);
  runGit(cwd, ['commit', '--quiet', '-m', 'runtime baseline']);
  return cwd;
}

const projectWithSpaces = makeProject('project with spaces');
const freshnessProject = makeProject('freshness project with spaces');
const nonGitProject = join(root, 'non git project with spaces');
mkdirSync(nonGitProject, { recursive: true });

test('scout emits one JSON object for an absolute project path containing spaces', () => {
  const result = runCli(['scout', '--cwd', projectWithSpaces]);
  const parsed = payload(result);

  assert.equal(parsed.projectRoot, resolve(projectWithSpaces));
  assert.equal(parsed.proof.command, 'npm run verify');
  assert.equal(parsed.git.baselineHead, runGit(projectWithSpaces, ['rev-parse', 'HEAD']));
});

test('evaluate-proof preserves space-bearing proof and detected-command arguments', () => {
  const proofText = 'npm run verify -- --workspace "with spaces"';
  const explicit = payload(runCli([
    'evaluate-proof',
    '--cwd',
    projectWithSpaces,
    '--text',
    proofText,
    '--probe-status',
    'confirmed',
    '--detected-command',
    proofText,
  ]));
  assert.deepEqual(explicit, {
    proofClass: 'confirmed-command',
    rendered: proofText,
  });

  const detected = payload(runCli([
    'evaluate-proof',
    '--cwd',
    projectWithSpaces,
    '--text',
    'npm run verify',
  ]));
  assert.deepEqual(detected, {
    proofClass: 'confirmed-command',
    rendered: 'npm run verify',
  });
});

test('strict argument errors exit 2 without JSON on stdout', () => {
  const result = runCli(['scout', '--cwd', projectWithSpaces, '--unknown']);

  assert.equal(result.status, 2, result.stderr);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /unknown option/i);
});

test('option-like tokens cannot be consumed as required option values', () => {
  const malformed = [
    ['scout', '--cwd', '--cwd'],
    ['scout', '--cwd', '--unknown'],
    ['evaluate-proof', '--cwd', '--text', '--text', 'npm test'],
    ['evaluate-proof', '--cwd', '--unknown', '--text', 'npm test'],
    ['evaluate-proof', '--cwd', projectWithSpaces, '--text', '--baseline', 'HEAD'],
    ['evaluate-proof', '--cwd', projectWithSpaces, '--text', '--unknown'],
  ];

  for (const args of malformed) {
    const result = runCli(args);
    assert.equal(result.status, 2, `${args.join(' ')}\n${result.stderr}`);
    assert.equal(result.stdout, '', args.join(' '));
    assert.match(
      result.stderr,
      /^deep-goal-runtime: argument error: (?:missing|invalid) value/i,
      args.join(' '),
    );
  }
});

test('operational errors exit 1 without JSON on stdout', () => {
  const result = runCli(['scout', '--cwd', join(root, 'missing project')]);

  assert.equal(result.status, 1, result.stderr);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /^deep-goal-runtime: operational error:/);
});

test('evaluate-proof rejects a missing cwd with or without explicit probe fields', () => {
  const missing = join(root, 'missing evaluate project');
  const invocations = [
    ['evaluate-proof', '--cwd', missing, '--text', 'npm test'],
    [
      'evaluate-proof',
      '--cwd',
      missing,
      '--text',
      'npm test',
      '--probe-status',
      'confirmed',
      '--detected-command',
      'npm test',
    ],
  ];

  for (const args of invocations) {
    const result = runCli(args);
    assert.equal(result.status, 1, result.stderr);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /^deep-goal-runtime: operational error:/);
  }
});

test('directory preflight reads the cwd before either CLI command runs', () => {
  const source = readFileSync(CLI, 'utf8');

  assert.match(
    source,
    /function preflightDirectory\(cwd\) \{[\s\S]*?statSync\(cwd\)\.isDirectory\(\)[\s\S]*?readdirSync\(cwd\);[\s\S]*?\}/,
  );
  assert.match(
    source,
    /const cwd = resolve\(options\['--cwd'\]\);\s+preflightDirectory\(cwd\);\s+if \(command === 'scout'\)/,
  );
});

test('evaluate-proof returns an operational error for a POSIX unreadable cwd with explicit probes', (context) => {
  if (process.platform === 'win32') {
    context.skip('POSIX permission fixture');
    return;
  }
  const cwd = join(root, 'unreadable project with spaces');
  mkdirSync(cwd, { recursive: true });
  chmodSync(cwd, 0o000);
  try {
    try {
      readdirSync(cwd);
    } catch {
      const result = runCli([
        'evaluate-proof',
        '--cwd',
        cwd,
        '--text',
        'npm test',
        '--probe-status',
        'confirmed',
        '--detected-command',
        'npm test',
      ]);
      assert.equal(result.status, 1, result.stderr);
      assert.equal(result.stdout, '');
      assert.match(result.stderr, /^deep-goal-runtime: operational error:/);
      return;
    }
    context.skip('fixture remains readable under the current privilege');
  } finally {
    chmodSync(cwd, 0o755);
  }
});

test('baseline-bound file proof is objective only for a fresh committed artifact', () => {
  const scout = payload(runCli(['scout', '--cwd', freshnessProject]));
  const baseline = scout.git.baselineHead;
  assert.match(baseline, /^[0-9a-f]{40}$/);

  const relPath = 'proof artifact with spaces.json';
  const content = '{"proof":"fresh"}\n';
  writeFileSync(join(freshnessProject, relPath), content);
  runGit(freshnessProject, ['add', relPath]);
  runGit(freshnessProject, ['commit', '--quiet', '-m', 'add proof artifact']);
  const fileDigest = createHash('sha256')
    .update(readFileSync(join(freshnessProject, relPath)))
    .digest('hex');
  const proofText = `\`${relPath}\` sha256:${fileDigest}`;

  const objective = payload(runCli([
    'evaluate-proof',
    '--cwd',
    freshnessProject,
    '--text',
    proofText,
    '--baseline',
    baseline,
  ]));
  assert.deepEqual(objective, {
    proofClass: 'objective-artifact',
    rendered: proofText,
  });

  writeFileSync(join(nonGitProject, relPath), content);
  const failClosedRuns = [
    runCli(['evaluate-proof', '--cwd', freshnessProject, '--text', proofText]),
    runCli([
      'evaluate-proof',
      '--cwd',
      freshnessProject,
      '--text',
      proofText,
      '--baseline',
      '0'.repeat(40),
    ]),
    runCli([
      'evaluate-proof',
      '--cwd',
      nonGitProject,
      '--text',
      proofText,
      '--baseline',
      baseline,
    ]),
  ];

  for (const result of failClosedRuns) {
    const parsed = payload(result);
    assert.equal(parsed.proofClass, 'unconfirmed-artifact');
    assert.notEqual(parsed.rendered, proofText);
    assert.match(parsed.rendered, /미검증/);
  }
});
