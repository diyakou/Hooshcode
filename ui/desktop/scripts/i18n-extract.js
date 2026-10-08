#!/usr/bin/env node
/**
 * Cross-platform i18n extraction script.
 * Excludes TypeScript declaration files before invoking formatjs.
 */
const path = require('path');
const { execFileSync } = require('child_process');

const projectDir = path.join(__dirname, '..');
const formatjs = require.resolve('@formatjs/cli/bin/formatjs');
const enFile = path.join(projectDir, 'src', 'i18n', 'messages', 'en.json');

execFileSync(
  process.execPath,
  [formatjs, 'extract', 'src/**/!(*.d).{ts,tsx}', '--out-file', enFile, '--flatten'],
  { stdio: 'inherit', cwd: projectDir }
);

execFileSync(process.execPath, [path.join(__dirname, 'i18n-compile.js')], {
  stdio: 'inherit',
  cwd: projectDir,
});
