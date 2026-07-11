import { accessSync, constants, statSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  detectProofCommand,
  evaluateProofLine,
} from './lib/proof-gate.js';
import { scoutPrerequisites } from './lib/prep-scout.js';

class ArgumentError extends Error {}

const COMMAND_OPTIONS = {
  scout: new Set(['--cwd']),
  'evaluate-proof': new Set([
    '--cwd',
    '--text',
    '--baseline',
    '--probe-status',
    '--detected-command',
  ]),
};

function parseArguments(argv) {
  const [command, ...tokens] = argv;
  const allowed = COMMAND_OPTIONS[command];
  if (!allowed) throw new ArgumentError(`unknown command: ${command ?? '(missing)'}`);

  const options = {};
  for (let index = 0; index < tokens.length;) {
    const option = tokens[index];
    if (!allowed.has(option)) throw new ArgumentError(`unknown option: ${option}`);
    if (Object.hasOwn(options, option)) throw new ArgumentError(`duplicate option: ${option}`);
    if (index + 1 >= tokens.length) throw new ArgumentError(`missing value for ${option}`);
    const value = tokens[index + 1];
    if (value.startsWith('--')) {
      throw new ArgumentError(`invalid value for ${option}: option token ${value}`);
    }
    options[option] = value;
    index += 2;
  }

  for (const required of command === 'scout' ? ['--cwd'] : ['--cwd', '--text']) {
    if (!Object.hasOwn(options, required)) {
      throw new ArgumentError(`missing required option: ${required}`);
    }
  }
  if (options['--cwd'] === '') throw new ArgumentError('empty value for --cwd');
  if (
    Object.hasOwn(options, '--probe-status')
    && !['confirmed', 'unconfirmed'].includes(options['--probe-status'])
  ) {
    throw new ArgumentError('--probe-status must be confirmed or unconfirmed');
  }

  return { command, options };
}

function run(argv) {
  const { command, options } = parseArguments(argv);
  const cwd = resolve(options['--cwd']);
  if (!statSync(cwd).isDirectory()) throw new Error(`cwd is not a directory: ${cwd}`);
  accessSync(cwd, constants.R_OK | constants.X_OK);
  if (command === 'scout') return scoutPrerequisites({ cwd });

  let detected = null;
  if (
    !Object.hasOwn(options, '--probe-status')
    || !Object.hasOwn(options, '--detected-command')
  ) {
    detected = detectProofCommand({ cwd });
  }
  return evaluateProofLine(options['--text'], {
    cwd,
    baselineHead: options['--baseline'] ?? '',
    probeStatus: options['--probe-status'] ?? detected.status,
    detectedCommand: options['--detected-command'] ?? detected.command,
  });
}

try {
  const result = run(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) {
  if (error instanceof ArgumentError) {
    process.stderr.write(`deep-goal-runtime: argument error: ${error.message}\n`);
    process.exitCode = 2;
  } else {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`deep-goal-runtime: operational error: ${message}\n`);
    process.exitCode = 1;
  }
}
