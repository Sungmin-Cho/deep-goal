import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { after, test } from 'node:test';

import {
  classifyProofLine,
  detectProofCommand,
  evaluateProofLine,
  isWorktreeCleanFor,
  renderProofLine,
  sha256File,
  sha256HeadBlob,
} from '../scripts/lib/proof-gate.js';

const root = mkdtempSync(join(tmpdir(), 'deep goal proof '));

after(() => {
  rmSync(root, { recursive: true, force: true });
});

function makePackageProject(name, scripts) {
  const cwd = join(root, name);
  mkdirSync(cwd, { recursive: true });
  writeFileSync(join(cwd, 'package.json'), JSON.stringify({ name, scripts }));
  return cwd;
}

function runGit(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
  assert.equal(
    result.status,
    0,
    `git ${args.join(' ')} failed\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
  );
  return result.stdout.trim();
}

function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

const verifyProject = makePackageProject('verify project', {
  verify: 'node --test',
  test: 'node --test --test-name-pattern fallback',
});
const testProject = makePackageProject('test project', { test: 'node --test' });
const corruptProject = join(root, 'corrupt project');
mkdirSync(corruptProject, { recursive: true });
writeFileSync(join(corruptProject, 'package.json'), '{ invalid json');

const emptyVerifyProject = makePackageProject('empty verify project', {
  verify: '',
  test: 'node --test',
});
const whitespaceVerifyProject = makePackageProject('whitespace verify project', {
  verify: ' \t\r\n ',
  test: 'node --test',
});
const emptyTestProject = makePackageProject('empty test project', { test: '' });
const whitespaceTestProject = makePackageProject('whitespace test project', {
  test: ' \t\r\n ',
});

function makeGitFixture() {
  const cwd = join(root, 'git fixture with spaces');
  mkdirSync(cwd, { recursive: true });
  runGit(cwd, ['init', '--quiet']);
  runGit(cwd, ['config', 'user.email', 'deep-goal@example.test']);
  runGit(cwd, ['config', 'user.name', 'Deep Goal Test']);

  writeFileSync(join(cwd, 'preexisting.json'), '{"before":true}\n');
  runGit(cwd, ['add', 'preexisting.json']);
  runGit(cwd, ['commit', '--quiet', '-m', 'baseline']);
  const baseline = runGit(cwd, ['rev-parse', 'HEAD']);
  const mainBranch = runGit(cwd, ['branch', '--show-current']);

  const artifactRelPath = 'relative path with spaces.json';
  writeFileSync(join(cwd, artifactRelPath), '{"after":true}\n');
  runGit(cwd, ['add', artifactRelPath]);
  runGit(cwd, ['commit', '--quiet', '-m', 'add proof artifact']);
  const head = runGit(cwd, ['rev-parse', 'HEAD']);

  runGit(cwd, ['checkout', '--quiet', '-b', 'proof-side', baseline]);
  runGit(cwd, ['commit', '--quiet', '--allow-empty', '-m', 'side descendant']);
  const side = runGit(cwd, ['rev-parse', 'HEAD']);

  runGit(cwd, ['checkout', '--quiet', '--orphan', 'proof-unrelated']);
  runGit(cwd, ['rm', '--quiet', '-r', '-f', '--ignore-unmatch', '.']);
  runGit(cwd, ['commit', '--quiet', '--allow-empty', '-m', 'unrelated root']);
  const unrelated = runGit(cwd, ['rev-parse', 'HEAD']);

  runGit(cwd, ['checkout', '--quiet', mainBranch]);
  assert.equal(runGit(cwd, ['rev-parse', 'HEAD']), head);

  return { artifactRelPath, baseline, cwd, head, side, unrelated };
}

const gitFixture = makeGitFixture();

test('detects the highest-priority non-empty package proof script', () => {
  assert.deepEqual(
    detectProofCommand({ cwd: verifyProject }),
    { status: 'confirmed', command: 'npm run verify', note: null },
  );
  assert.deepEqual(
    detectProofCommand({ cwd: testProject }),
    { status: 'confirmed', command: 'npm test', note: null },
  );
  assert.deepEqual(
    detectProofCommand({ cwd: corruptProject }),
    { status: 'unconfirmed', command: null, note: 'parse-error:package.json' },
  );
});

test('ignores empty and whitespace-only package scripts', () => {
  assert.deepEqual(
    detectProofCommand({ cwd: emptyVerifyProject }),
    { status: 'confirmed', command: 'npm test', note: null },
  );
  assert.deepEqual(
    detectProofCommand({ cwd: whitespaceVerifyProject }),
    { status: 'confirmed', command: 'npm test', note: null },
  );
  assert.deepEqual(
    detectProofCommand({ cwd: emptyTestProject }),
    { status: 'unconfirmed', command: 'npm test', note: null },
  );
  assert.deepEqual(
    detectProofCommand({ cwd: whitespaceTestProject }),
    { status: 'unconfirmed', command: 'npm test', note: null },
  );
});

test('ignores out-of-root package and proof-marker symlinks', (context) => {
  const outside = join(root, 'outside proof markers');
  mkdirSync(outside, { recursive: true });

  const cases = [
    ['package.json', JSON.stringify({ scripts: { verify: 'attacker-controlled' } })],
    ['pyproject.toml', '[tool.pytest.ini_options]\n'],
    ['pytest.ini', '[pytest]\n'],
    ['setup.cfg', '[tool:pytest]\n'],
    ['go.mod', 'module attacker.example/test\n'],
    ['Cargo.toml', '[package]\nname = "attacker"\n'],
  ];

  for (const [name, content] of cases) {
    const cwd = join(root, `out-of-root ${name} project`);
    const external = join(outside, name);
    mkdirSync(cwd, { recursive: true });
    writeFileSync(external, content);
    try {
      symlinkSync(external, join(cwd, name), 'file');
    } catch (error) {
      if (error?.code === 'EPERM' || error?.code === 'EACCES') {
        context.skip(`file symlink unavailable: ${error.code}`);
        return;
      }
      throw error;
    }

    assert.deepEqual(
      detectProofCommand({ cwd }),
      { status: 'unconfirmed', command: null, note: null },
      name,
    );
  }
});

test('renders every non-ready class and unknown classes byte-for-byte', () => {
  assert.equal(
    renderProofLine('unconfirmed-command', 'npm publish'),
    '⚠️ 미검증 — `npm publish` 가 실제 존재하는지 실행 전 확인 필요',
  );
  assert.equal(
    renderProofLine('unconfirmed-artifact', 'https://ci.example/run/1'),
    '⚠️ 미검증 — https://ci.example/run/1 의 유효성·신선도(선재/baseline stale 여부)를 실행 전 확인 필요; 콘텐츠 검증 커맨드·해시 또는 baseline 이후 새 커밋으로 앵커 권장',
  );
  assert.equal(
    renderProofLine('subjective-placeholder', '수동 확인'),
    '⚠️ 미검증(주관) — 실행 가능한 검증 커맨드로 재구성 필요 (현재: 수동 확인)',
  );
  assert.equal(
    renderProofLine('not-a-proof-class', 'unknown proof'),
    '⚠️ 미검증 — 분류 불가, 실행 전 확인 필요 (unknown proof)',
  );
});

test('recognizes the complete legacy command-shape list', () => {
  const commands = [
    'npm test',
    'npx tsc',
    'yarn test',
    'pnpm test',
    'pytest',
    'python -m pytest',
    'go test ./...',
    'go build ./...',
    'cargo test',
    'make test',
    'tsc -p tsconfig.json',
    'node scripts/typecheck.js --noEmit',
  ];

  for (const command of commands) {
    assert.equal(
      classifyProofLine(command, {
        cwd: verifyProject,
        probeStatus: 'unconfirmed',
        detectedCommand: null,
        baselineHead: '',
      }),
      'unconfirmed-command',
      command,
    );
  }
});

test('only confirms the repository-detected command', () => {
  assert.equal(
    classifyProofLine('npm run verify', {
      cwd: verifyProject,
      probeStatus: 'confirmed',
      detectedCommand: 'npm run verify',
      baselineHead: '',
    }),
    'confirmed-command',
  );
  assert.equal(
    classifyProofLine('npm publish', {
      cwd: verifyProject,
      probeStatus: 'confirmed',
      detectedCommand: 'npm run verify',
      baselineHead: '',
    }),
    'unconfirmed-command',
  );
  assert.equal(
    classifyProofLine('npm run test', {
      cwd: testProject,
      probeStatus: 'confirmed',
      detectedCommand: 'npm test',
      baselineHead: '',
    }),
    'confirmed-command',
  );
});

test('classifies commit proofs only inside baseline..HEAD', () => {
  const options = {
    cwd: gitFixture.cwd,
    probeStatus: 'unconfirmed',
    detectedCommand: null,
    baselineHead: gitFixture.baseline,
  };

  assert.equal(classifyProofLine(gitFixture.head, options), 'objective-artifact');
  assert.equal(classifyProofLine(gitFixture.baseline, options), 'unconfirmed-artifact');
  assert.equal(classifyProofLine(gitFixture.side, options), 'unconfirmed-artifact');
  assert.equal(classifyProofLine(gitFixture.unrelated, options), 'unconfirmed-artifact');
  assert.equal(
    classifyProofLine(gitFixture.head, { ...options, baselineHead: '' }),
    'unconfirmed-artifact',
  );
});

test('binds file proofs to a clean committed HEAD blob added after baseline', () => {
  const { artifactRelPath, baseline, cwd } = gitFixture;
  const artifactPath = join(cwd, artifactRelPath);
  const headDigest = digest(readFileSync(artifactPath));
  const options = {
    cwd,
    probeStatus: 'unconfirmed',
    detectedCommand: null,
    baselineHead: baseline,
  };
  const proof = `\`${artifactRelPath}\` sha256:${headDigest}`;

  assert.equal(sha256File(artifactPath), headDigest);
  assert.equal(sha256HeadBlob({ cwd, relPath: artifactRelPath }), headDigest);
  assert.equal(isWorktreeCleanFor({ cwd, relPath: artifactRelPath }), true);
  assert.equal(classifyProofLine(proof, options), 'objective-artifact');
  assert.deepEqual(evaluateProofLine(proof, options), {
    proofClass: 'objective-artifact',
    rendered: proof,
  });

  const preexistingDigest = digest(readFileSync(join(cwd, 'preexisting.json')));
  assert.equal(
    classifyProofLine(`preexisting.json sha256:${preexistingDigest}`, options),
    'unconfirmed-artifact',
  );
  assert.equal(
    classifyProofLine(`\`${artifactRelPath}\``, options),
    'unconfirmed-artifact',
  );
  assert.equal(
    classifyProofLine(`\`${artifactRelPath}\` sha256:${'0'.repeat(64)}`, options),
    'unconfirmed-artifact',
  );

  const untrackedRelPath = 'untracked proof.json';
  const untrackedPath = join(cwd, untrackedRelPath);
  writeFileSync(untrackedPath, '{"untracked":true}\n');
  const untrackedDigest = digest(readFileSync(untrackedPath));
  assert.equal(sha256HeadBlob({ cwd, relPath: untrackedRelPath }), null);
  assert.equal(isWorktreeCleanFor({ cwd, relPath: untrackedRelPath }), false);
  assert.equal(
    classifyProofLine(`\`${untrackedRelPath}\` sha256:${untrackedDigest}`, options),
    'unconfirmed-artifact',
  );

  const dirtyOnlyRelPath = 'dirty only proof.json';
  const dirtyOnlyPath = join(cwd, dirtyOnlyRelPath);
  writeFileSync(dirtyOnlyPath, '{"index-only":true}\n');
  runGit(cwd, ['add', dirtyOnlyRelPath]);
  const dirtyOnlyDigest = digest(readFileSync(dirtyOnlyPath));
  assert.equal(sha256HeadBlob({ cwd, relPath: dirtyOnlyRelPath }), null);
  assert.equal(
    classifyProofLine(`\`${dirtyOnlyRelPath}\` sha256:${dirtyOnlyDigest}`, options),
    'unconfirmed-artifact',
  );

  writeFileSync(artifactPath, '{"after":"dirty mutation"}\n');
  assert.equal(sha256HeadBlob({ cwd, relPath: artifactRelPath }), headDigest);
  assert.notEqual(sha256File(artifactPath), headDigest);
  assert.equal(isWorktreeCleanFor({ cwd, relPath: artifactRelPath }), false);
  assert.equal(classifyProofLine(proof, options), 'unconfirmed-artifact');
});

test('uses Git clean filters for core.autocrlf while rejecting real edits', (context) => {
  const cwd = join(root, 'autocrlf clean-filter fixture');
  mkdirSync(cwd, { recursive: true });
  runGit(cwd, ['init', '--quiet']);
  runGit(cwd, ['config', 'user.email', 'deep-goal@example.test']);
  runGit(cwd, ['config', 'user.name', 'Deep Goal Test']);
  runGit(cwd, ['config', 'core.autocrlf', 'true']);

  writeFileSync(join(cwd, 'baseline.json'), '{"baseline":true}\n');
  runGit(cwd, ['add', 'baseline.json']);
  runGit(cwd, ['commit', '--quiet', '-m', 'baseline']);
  const baseline = runGit(cwd, ['rev-parse', 'HEAD']);

  const artifactRelPath = 'filtered artifact with spaces.json';
  const artifactPath = join(cwd, artifactRelPath);
  writeFileSync(artifactPath, '{"after":true}\n');
  runGit(cwd, ['add', artifactRelPath]);
  runGit(cwd, ['commit', '--quiet', '-m', 'add filtered artifact']);

  rmSync(artifactPath);
  runGit(cwd, ['checkout', '--', artifactRelPath]);

  const headDigest = sha256HeadBlob({ cwd, relPath: artifactRelPath });
  assert.match(headDigest, /^[0-9a-f]{64}$/);
  assert.notEqual(sha256File(artifactPath), headDigest, 'checkout must exercise CRLF smudging');
  assert.equal(runGit(cwd, ['status', '--porcelain', '--', artifactRelPath]), '');

  const options = {
    cwd,
    probeStatus: 'unconfirmed',
    detectedCommand: null,
    baselineHead: baseline,
  };
  const proof = `\`${artifactRelPath}\` sha256:${headDigest}`;
  assert.equal(isWorktreeCleanFor({ cwd, relPath: artifactRelPath }), true);
  assert.equal(classifyProofLine(proof, options), 'objective-artifact');

  writeFileSync(artifactPath, '{"after":"dirty mutation"}\r\n');
  assert.notEqual(runGit(cwd, ['status', '--porcelain', '--', artifactRelPath]), '');
  assert.equal(isWorktreeCleanFor({ cwd, relPath: artifactRelPath }), false);
  assert.equal(classifyProofLine(proof, options), 'unconfirmed-artifact');

  runGit(cwd, ['restore', '--source=HEAD', '--staged', '--worktree', '--', artifactRelPath]);
  const escapeRelPath = join('..', 'outside filtered artifact.json');
  const escapePath = resolve(cwd, escapeRelPath);
  writeFileSync(escapePath, '{"after":true}\n');
  const escapeProof = `\`${escapeRelPath}\` sha256:${headDigest}`;
  assert.equal(isWorktreeCleanFor({ cwd, relPath: escapeRelPath }), false);
  assert.equal(classifyProofLine(escapeProof, options), 'unconfirmed-artifact');

  rmSync(artifactPath);
  try {
    symlinkSync(escapePath, artifactPath, 'file');
  } catch (error) {
    if (error?.code === 'EPERM' || error?.code === 'EACCES' || error?.code === 'ENOTSUP') {
      context.diagnostic(`file symlink unavailable: ${error.code}`);
      return;
    }
    throw error;
  }
  assert.equal(sha256File(artifactPath), headDigest, 'symlink target mirrors committed bytes');
  assert.equal(isWorktreeCleanFor({ cwd, relPath: artifactRelPath }), false);
  assert.equal(classifyProofLine(proof, options), 'unconfirmed-artifact');
});

test('fails closed for URLs, unknown prose, and subjective command text', () => {
  const options = {
    cwd: verifyProject,
    probeStatus: 'confirmed',
    detectedCommand: 'npm run verify',
    baselineHead: '',
  };

  assert.equal(
    classifyProofLine('https://ci.example/run/1', options),
    'unconfirmed-artifact',
  );
  assert.equal(classifyProofLine('looks good to me', options), 'subjective-placeholder');
  assert.equal(
    classifyProofLine('npm test 완료되면', options),
    'subjective-placeholder',
  );
  assert.equal(sha256File(join(root, 'missing-artifact')), null);
});
