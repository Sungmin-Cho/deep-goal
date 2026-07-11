import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  linkSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { after, test } from 'node:test';

import { scoutPrerequisites } from '../scripts/lib/prep-scout.js';

const root = mkdtempSync(join(tmpdir(), 'deep goal scout '));

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

function makeRepository() {
  const cwd = join(root, '저장소 repository with spaces');
  const sentinel = join(cwd, 'make evaluation 감지 sentinel.txt');
  const workflowName = '검증 ci.yml';
  mkdirSync(join(cwd, '.github', 'workflows'), { recursive: true });
  writeFileSync(join(cwd, 'AGENTS.md'), '# Repository guide\n');
  writeFileSync(
    join(cwd, 'package.json'),
    JSON.stringify({ name: 'scout-fixture', scripts: { verify: 'node --test' } }),
  );
  writeFileSync(
    join(cwd, '.github', 'workflows', workflowName),
    'name: ci\non: [push]\njobs: {}\n',
  );
  writeFileSync(
    join(cwd, 'Makefile'),
    [
      'harmless:',
      '\t@echo harmless',
      `DANGER := $(shell "${process.execPath}" -e "require('node:fs').writeFileSync(process.argv[1], 'evaluated')" "${sentinel}")`,
      'verify:',
      '\t@echo verify',
      '',
    ].join('\n'),
  );

  runGit(cwd, ['init', '--quiet']);
  runGit(cwd, ['config', 'user.email', 'deep-goal@example.test']);
  runGit(cwd, ['config', 'user.name', 'Deep Goal Test']);
  runGit(cwd, ['add', '.']);
  runGit(cwd, ['commit', '--quiet', '-m', 'fixture baseline']);

  return {
    branch: runGit(cwd, ['branch', '--show-current']),
    cwd,
    head: runGit(cwd, ['rev-parse', 'HEAD']),
    sentinel,
    workflowName,
  };
}

function physicalIdentity(file) {
  const { dev, ino } = statSync(file, { bigint: true });
  assert.equal(typeof dev, 'bigint');
  assert.equal(typeof ino, 'bigint');
  return { dev, ino };
}

function supportsInodeIdentity(identity) {
  return identity.ino !== 0n;
}

const repository = makeRepository();

test('scouts known files, proof metadata, Git baseline, and Make targets without execution', () => {
  assert.equal(existsSync(repository.sentinel), false);
  const result = scoutPrerequisites({ cwd: repository.cwd });
  assert.equal(existsSync(repository.sentinel), false);

  assert.deepEqual(
    Object.keys(result).sort(),
    ['files', 'git', 'makeTargets', 'projectRoot', 'proof'],
  );
  assert.equal(result.projectRoot, resolve(repository.cwd));
  assert.deepEqual(result.git, {
    isRepository: true,
    baselineHead: repository.head,
    branch: repository.branch,
  });
  assert.deepEqual(result.proof, {
    status: 'confirmed',
    command: 'npm run verify',
    note: null,
  });
  assert.deepEqual(result.files, {
    guides: ['AGENTS.md'],
    dependencies: ['package.json'],
    ci: [`.github/workflows/${repository.workflowName}`, 'Makefile'],
  });
  assert.deepEqual(result.makeTargets, ['harmless', 'verify']);
});

test('reports a non-Git directory without manufacturing baseline state', () => {
  const cwd = join(root, 'plain directory with spaces');
  mkdirSync(cwd, { recursive: true });

  const result = scoutPrerequisites({ cwd });

  assert.deepEqual(result.git, {
    isRepository: false,
    baselineHead: null,
    branch: null,
  });
  assert.deepEqual(result.proof, {
    status: 'unconfirmed',
    command: null,
    note: null,
  });
});

test('keeps distinct case-sensitive guide files as separate physical files', (context) => {
  const cwd = join(root, 'case-sensitive guides with spaces');
  mkdirSync(join(cwd, 'docs'), { recursive: true });
  const lower = join(cwd, 'docs', 'design.md');
  const upper = join(cwd, 'docs', 'DESIGN.md');
  writeFileSync(lower, '# design\n');
  writeFileSync(upper, '# DESIGN\n');
  const lowerIdentity = physicalIdentity(lower);
  const upperIdentity = physicalIdentity(upper);
  if (!supportsInodeIdentity(lowerIdentity) || !supportsInodeIdentity(upperIdentity)) {
    context.skip('filesystem does not expose reliable inode identities');
    return;
  }
  if (lowerIdentity.dev === upperIdentity.dev && lowerIdentity.ino === upperIdentity.ino) {
    context.skip('filesystem is case-insensitive');
    return;
  }

  const { files } = scoutPrerequisites({ cwd });

  assert.deepEqual(files.guides, ['docs/DESIGN.md', 'docs/design.md']);
});

test('deduplicates hard-linked known files by physical file identity', (context) => {
  const cwd = join(root, 'hard-linked guides with spaces');
  mkdirSync(cwd, { recursive: true });
  const lower = join(cwd, 'package.json');
  const upper = join(cwd, 'requirements.txt');
  writeFileSync(lower, '{"name":"hard-link-fixture"}\n');
  try {
    linkSync(lower, upper);
  } catch (error) {
    if (['EACCES', 'EEXIST', 'EPERM', 'ENOSYS'].includes(error?.code)) {
      context.skip(`hard-link fixture unavailable: ${error.code}`);
      return;
    }
    throw error;
  }
  const lowerIdentity = physicalIdentity(lower);
  const upperIdentity = physicalIdentity(upper);
  if (!supportsInodeIdentity(lowerIdentity) || !supportsInodeIdentity(upperIdentity)) {
    context.skip('filesystem does not expose reliable inode identities');
    return;
  }
  assert.deepEqual(lowerIdentity, upperIdentity);

  const { files } = scoutPrerequisites({ cwd });

  assert.deepEqual(files.dependencies, ['package.json']);
});

test('deduplicates normal case-insensitive guide spellings by physical identity', (context) => {
  const cwd = join(root, 'case-insensitive guides with spaces');
  mkdirSync(join(cwd, 'docs'), { recursive: true });
  const lower = join(cwd, 'docs', 'design.md');
  const upper = join(cwd, 'docs', 'DESIGN.md');
  writeFileSync(lower, '# design\n');
  if (!existsSync(upper)) {
    context.skip('filesystem is case-sensitive');
    return;
  }
  const lowerIdentity = physicalIdentity(lower);
  const upperIdentity = physicalIdentity(upper);
  if (!supportsInodeIdentity(lowerIdentity) || !supportsInodeIdentity(upperIdentity)) {
    context.skip('filesystem does not expose reliable inode identities');
    return;
  }
  assert.deepEqual(lowerIdentity, upperIdentity);

  const { files } = scoutPrerequisites({ cwd });

  assert.deepEqual(files.guides, ['docs/design.md']);
});

test('rejects known-file paths that resolve outside the project root', (context) => {
  const cwd = join(root, 'symlink project with spaces');
  const outside = join(root, 'outside docs with spaces');
  mkdirSync(cwd, { recursive: true });
  mkdirSync(outside, { recursive: true });
  writeFileSync(join(outside, 'design.md'), '# outside\n');
  try {
    symlinkSync(outside, join(cwd, 'docs'), process.platform === 'win32' ? 'junction' : 'dir');
  } catch (error) {
    if (error?.code === 'EPERM' || error?.code === 'EACCES') {
      context.skip(`symlink unavailable: ${error.code}`);
      return;
    }
    throw error;
  }

  const { files } = scoutPrerequisites({ cwd });

  assert.deepEqual(files.guides, []);
});

test('rejects a workflow directory link that resolves outside the project root', (context) => {
  const cwd = join(root, 'workflow link project with spaces');
  const outside = join(root, 'outside workflows with spaces');
  const workflowRoot = join(cwd, '.github', 'workflows');
  mkdirSync(join(cwd, '.github'), { recursive: true });
  mkdirSync(outside, { recursive: true });
  writeFileSync(join(outside, 'external.yml'), 'name: external\n');
  try {
    symlinkSync(outside, workflowRoot, process.platform === 'win32' ? 'junction' : 'dir');
  } catch (error) {
    if (error?.code === 'EPERM' || error?.code === 'EACCES') {
      context.skip(`symlink unavailable: ${error.code}`);
      return;
    }
    throw error;
  }

  const { files } = scoutPrerequisites({ cwd });

  assert.deepEqual(files.ci, []);
});
