import { spawnSync } from 'node:child_process';
import {
  existsSync,
  readFileSync,
  readdirSync,
} from 'node:fs';
import { relative, resolve, sep } from 'node:path';

import { detectProofCommand } from './proof-gate.js';

const GUIDE_FILES = [
  'CLAUDE.md',
  'AGENTS.md',
  'README.md',
  'ARCHITECTURE.md',
  'docs/architecture.md',
  'docs/design.md',
  'docs/DESIGN.md',
];
const DEPENDENCY_FILES = [
  'package.json',
  'pyproject.toml',
  'requirements.txt',
  'go.mod',
  'Cargo.toml',
  '.env.example',
];
const CI_FILES = ['.gitlab-ci.yml', 'Makefile'];
const MAKE_TARGET = /^([A-Za-z][A-Za-z0-9_-]*)\s*:/gm;

const portableRelative = (root, file) => relative(root, file).split(sep).join('/');

function runGit(cwd, args) {
  return spawnSync('git', ['-C', cwd, ...args], {
    encoding: 'utf8',
    windowsHide: true,
    shell: false,
  });
}

function gitText(cwd, args) {
  const result = runGit(cwd, args);
  return result.status === 0 ? result.stdout.trim() : null;
}

function discoverKnownFiles(root, names) {
  return names
    .map((name) => resolve(root, name))
    .filter((file) => existsSync(file))
    .map((file) => portableRelative(root, file));
}

function discoverWorkflows(root) {
  const workflowRoot = resolve(root, '.github', 'workflows');
  if (!existsSync(workflowRoot)) return [];
  return readdirSync(workflowRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => portableRelative(root, resolve(workflowRoot, entry.name)));
}

function discoverMakeTargets(root) {
  const makefile = resolve(root, 'Makefile');
  if (!existsSync(makefile)) return [];
  const source = readFileSync(makefile, 'utf8');
  const targets = [];
  const seen = new Set();
  for (const match of source.matchAll(MAKE_TARGET)) {
    if (source[match.index + match[0].length] === '=') continue;
    if (!seen.has(match[1])) {
      seen.add(match[1]);
      targets.push(match[1]);
    }
  }
  return targets.slice(0, 20);
}

function discoverGit(root) {
  const inside = gitText(root, ['rev-parse', '--is-inside-work-tree']);
  if (inside !== 'true') {
    return { isRepository: false, baselineHead: null, branch: null };
  }
  return {
    isRepository: true,
    baselineHead: gitText(root, ['rev-parse', 'HEAD']),
    branch: gitText(root, ['branch', '--show-current']) || null,
  };
}

export function scoutPrerequisites({ cwd = process.cwd() } = {}) {
  const projectRoot = resolve(cwd);
  readdirSync(projectRoot);

  return {
    projectRoot,
    git: discoverGit(projectRoot),
    proof: detectProofCommand({ cwd: projectRoot }),
    files: {
      guides: discoverKnownFiles(projectRoot, GUIDE_FILES).sort(),
      dependencies: discoverKnownFiles(projectRoot, DEPENDENCY_FILES).sort(),
      ci: [
        ...discoverWorkflows(projectRoot),
        ...discoverKnownFiles(projectRoot, CI_FILES),
      ].sort(),
    },
    makeTargets: discoverMakeTargets(projectRoot),
  };
}
