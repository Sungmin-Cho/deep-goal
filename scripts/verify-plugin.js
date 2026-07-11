import { validateRepository } from './lib/release-validator.js';

const result = validateRepository({ root: process.cwd() });
for (const check of result.checks) console.log(`  ✓ ${check}`);
for (const failure of result.failures) console.error(`  ✗ ${failure}`);
console.log(`Passed: ${result.checks.length}, Failed: ${result.failures.length}`);
process.exitCode = result.passed ? 0 : 1;
