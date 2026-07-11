import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';

const SCRIPT_PRIORITY = ['verify', 'test', 'build', 'lint', 'typecheck', 'type-check', 'check'];
const SUBJECTIVE_MARKERS = [
  '수동',
  '확인한다',
  '구현 완료',
  '완료되면',
  '적절히',
  '알아서',
  '대충',
];
const COMMAND_SHAPES = [
  /^npm /,
  /^npx /,
  /^yarn /,
  /^pnpm /,
  /^pytest/,
  /^python -m /,
  /^go test/,
  /^go build/,
  /^cargo /,
  /^make /,
  /^tsc /,
  /--noEmit/,
];
const canonicalize = realpathSync.native ?? realpathSync;

function containedExistingPath(physicalRoot, file) {
  let physicalFile;
  try {
    physicalFile = canonicalize(file);
  } catch {
    return null;
  }
  const fromRoot = relative(physicalRoot, physicalFile);
  if (fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) return null;
  return physicalFile;
}

export function detectProofCommand({ cwd = process.cwd() } = {}) {
  let physicalRoot;
  try {
    physicalRoot = canonicalize(cwd);
  } catch {
    return { status: 'unconfirmed', command: null, note: null };
  }

  const packagePath = containedExistingPath(physicalRoot, resolve(cwd, 'package.json'));
  if (packagePath) {
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(packagePath, 'utf8'));
    } catch {
      return { status: 'unconfirmed', command: null, note: 'parse-error:package.json' };
    }
    const scripts = parsed?.scripts ?? {};
    const key = SCRIPT_PRIORITY.find(
      (candidate) => typeof scripts[candidate] === 'string' && scripts[candidate].trim() !== '',
    );
    if (key) {
      return {
        status: 'confirmed',
        command: key === 'test' ? 'npm test' : `npm run ${key}`,
        note: null,
      };
    }
    return { status: 'unconfirmed', command: 'npm test', note: null };
  }
  if (
    ['pyproject.toml', 'pytest.ini', 'setup.cfg'].some((name) =>
      containedExistingPath(physicalRoot, resolve(cwd, name)),
    )
  ) {
    return { status: 'unconfirmed', command: 'pytest', note: null };
  }
  if (containedExistingPath(physicalRoot, resolve(cwd, 'go.mod'))) {
    return { status: 'unconfirmed', command: 'go test ./...', note: null };
  }
  if (containedExistingPath(physicalRoot, resolve(cwd, 'Cargo.toml'))) {
    return { status: 'unconfirmed', command: 'cargo test', note: null };
  }
  return { status: 'unconfirmed', command: null, note: null };
}

export function sha256File(filePath) {
  try {
    return createHash('sha256').update(readFileSync(filePath)).digest('hex');
  } catch {
    return null;
  }
}

function portableGitPath(relPath) {
  return relPath.split(sep).join('/');
}

function runGit(cwd, args, encoding = 'utf8') {
  return spawnSync('git', ['-C', cwd, ...args], {
    shell: false,
    encoding,
    windowsHide: true,
  });
}

function gitText(cwd, args) {
  const result = runGit(cwd, args);
  if (result.status !== 0) return null;
  return result.stdout.trim();
}

function headBlob({ cwd, relPath }) {
  if (typeof relPath !== 'string' || relPath.length === 0) return null;
  const result = runGit(cwd, ['show', `HEAD:${portableGitPath(relPath)}`], null);
  if (result.status !== 0 || !Buffer.isBuffer(result.stdout)) return null;
  return result.stdout;
}

function headBlobOid({ cwd, relPath }) {
  if (typeof relPath !== 'string' || relPath.length === 0) return null;
  const oid = gitText(cwd, [
    'rev-parse',
    '--verify',
    '--quiet',
    `HEAD:${portableGitPath(relPath)}`,
  ]);
  return typeof oid === 'string' && /^[0-9a-f]{40,64}$/.test(oid) ? oid : null;
}

function filteredWorktreeOid({ cwd, relPath }) {
  let physicalRoot;
  let physicalFile;
  try {
    physicalRoot = canonicalize(cwd);
    const candidate = resolve(cwd, relPath);
    const stat = lstatSync(candidate);
    if (!stat.isFile() || stat.isSymbolicLink()) return null;
    physicalFile = containedExistingPath(physicalRoot, candidate);
  } catch {
    return null;
  }
  if (physicalFile === null) return null;

  const result = runGit(cwd, [
    'hash-object',
    `--path=${portableGitPath(relPath)}`,
    '--',
    physicalFile,
  ]);
  if (result.status !== 0) return null;
  const oid = result.stdout.trim();
  return /^[0-9a-f]{40,64}$/.test(oid) ? oid : null;
}

export function sha256HeadBlob({ cwd, relPath }) {
  const blob = headBlob({ cwd, relPath });
  if (blob === null) return null;
  return createHash('sha256').update(blob).digest('hex');
}

export function isWorktreeCleanFor({ cwd, relPath }) {
  const committedOid = headBlobOid({ cwd, relPath });
  if (committedOid === null) return false;

  const worktreeOid = filteredWorktreeOid({ cwd, relPath });
  if (worktreeOid === null || worktreeOid !== committedOid) return false;

  const portablePath = portableGitPath(relPath);
  const unstaged = runGit(cwd, [
    'diff',
    '--quiet',
    '--no-ext-diff',
    '--no-textconv',
    '--',
    portablePath,
  ]);
  if (unstaged.status !== 0) return false;

  const staged = runGit(cwd, [
    'diff',
    '--cached',
    '--quiet',
    '--no-ext-diff',
    '--no-textconv',
    'HEAD',
    '--',
    portablePath,
  ]);
  return staged.status === 0;
}

function resolveCommit(cwd, ref) {
  if (typeof ref !== 'string' || ref.length === 0) return null;
  return gitText(cwd, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
}

function isAncestor(cwd, ancestor, descendant) {
  return runGit(cwd, ['merge-base', '--is-ancestor', ancestor, descendant]).status === 0;
}

function isAddedOrModifiedSince({ baselineHead, cwd, relPath }) {
  const baseline = resolveCommit(cwd, baselineHead);
  const head = resolveCommit(cwd, 'HEAD');
  if (baseline === null || head === null || !isAncestor(cwd, baseline, head)) return false;
  const result = runGit(cwd, [
    'diff',
    '--name-status',
    '--diff-filter=AM',
    `${baseline}..${head}`,
    '--',
    portableGitPath(relPath),
  ]);
  return result.status === 0 && /^(?:A|M)\t/m.test(result.stdout);
}

function normalizeRun(command) {
  return command === 'npm test' ? 'npm run test' : command;
}

function artifactPath(text, cwd) {
  const quoted = /^`([^`\r\n]+)`(?:\s|$)/.exec(text);
  if (quoted) return quoted[1];

  const token = text.split(' ')[0];
  if (token.length === 0) return null;
  if (existsSync(resolve(cwd, token))) return token;
  return headBlob({ cwd, relPath: token }) === null ? null : token;
}

export function classifyProofLine(
  text,
  {
    cwd = process.cwd(),
    probeStatus = '',
    detectedCommand = null,
    baselineHead = '',
  } = {},
) {
  const proofText = typeof text === 'string' ? text : String(text ?? '');

  if (SUBJECTIVE_MARKERS.some((marker) => proofText.includes(marker))) {
    return 'subjective-placeholder';
  }

  const token = proofText.split(' ')[0];
  if (/^[0-9a-f]{7,40}$/.test(token)) {
    const commit = resolveCommit(cwd, token);
    if (commit !== null) {
      const baseline = resolveCommit(cwd, baselineHead);
      if (
        baseline !== null
        && commit !== baseline
        && isAncestor(cwd, baseline, commit)
        && isAncestor(cwd, commit, 'HEAD')
      ) {
        return 'objective-artifact';
      }
      return 'unconfirmed-artifact';
    }
  }

  const relPath = artifactPath(proofText, cwd);
  if (relPath !== null) {
    const declared = /sha256:([0-9a-fA-F]{64})/.exec(proofText);
    if (declared) {
      const expected = declared[1].toLowerCase();
      const committed = sha256HeadBlob({ cwd, relPath });
      if (
        committed !== null
        && committed === expected
        && isWorktreeCleanFor({ cwd, relPath })
        && isAddedOrModifiedSince({ baselineHead, cwd, relPath })
      ) {
        return 'objective-artifact';
      }
    }
    return 'unconfirmed-artifact';
  }

  if (/^https?:\/\//.test(proofText)) return 'unconfirmed-artifact';

  if (COMMAND_SHAPES.some((pattern) => pattern.test(proofText))) {
    if (
      probeStatus === 'confirmed'
      && typeof detectedCommand === 'string'
      && detectedCommand.length > 0
      && normalizeRun(proofText) === normalizeRun(detectedCommand)
    ) {
      return 'confirmed-command';
    }
    return 'unconfirmed-command';
  }

  return 'subjective-placeholder';
}

export function renderProofLine(proofClass, text) {
  switch (proofClass) {
    case 'confirmed-command':
    case 'objective-artifact':
      return text;
    case 'unconfirmed-command':
      return `⚠️ 미검증 — \`${text}\` 가 실제 존재하는지 실행 전 확인 필요`;
    case 'unconfirmed-artifact':
      return `⚠️ 미검증 — ${text} 의 유효성·신선도(선재/baseline stale 여부)를 실행 전 확인 필요; 콘텐츠 검증 커맨드·해시 또는 baseline 이후 새 커밋으로 앵커 권장`;
    case 'subjective-placeholder':
      return `⚠️ 미검증(주관) — 실행 가능한 검증 커맨드로 재구성 필요 (현재: ${text})`;
    default:
      return `⚠️ 미검증 — 분류 불가, 실행 전 확인 필요 (${text})`;
  }
}

export function evaluateProofLine(text, options = {}) {
  const proofClass = classifyProofLine(text, options);
  return { proofClass, rendered: renderProofLine(proofClass, text) };
}
