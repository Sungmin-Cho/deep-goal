import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
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
  const cwd = join(root, 'repository with spaces');
  mkdirSync(join(cwd, '.github', 'workflows'), { recursive: true });
  writeFileSync(join(cwd, 'AGENTS.md'), '# Repository guide\n');
  writeFileSync(
    join(cwd, 'package.json'),
    JSON.stringify({ name: 'scout-fixture', scripts: { verify: 'node --test' } }),
  );
  writeFileSync(
    join(cwd, '.github', 'workflows', 'ci.yml'),
    'name: ci\non: [push]\njobs: {}\n',
  );
  writeFileSync(
    join(cwd, 'Makefile'),
    [
      'harmless:',
      '\t@echo harmless',
      'DANGER := $(shell exit 91)',
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
  };
}

const repository = makeRepository();

test('scouts known files, proof metadata, Git baseline, and Make targets without execution', () => {
  const result = scoutPrerequisites({ cwd: repository.cwd });

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
    ci: ['.github/workflows/ci.yml', 'Makefile'],
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
