#!/usr/bin/env node
/**
 * Creates the macOS .zip from the built .app bundle using ditto.
 * Replaces the inline shell commands in bundle:default / bundle:intel that
 * previously used variable-expansion with spaces, which is fragile in CI.
 *
 * Usage: node scripts/create-mac-zip.js <arch>
 *   arch: arm64 (default) | x64
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const arch = process.argv[2] || 'arm64';
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
const productName = pkg.productName || 'Goose';

const archSuffix = arch === 'x64' ? 'x64' : 'arm64';
const dirSuffix = arch === 'x64' ? 'darwin-x64' : 'darwin-arm64';
const zipSuffix = arch === 'x64' ? `${productName}_intel_mac.zip` : `${productName}.zip`;

const appDir = path.join(__dirname, '..', 'out', `${productName}-${dirSuffix}`);
const appBundle = path.join(appDir, `${productName}.app`);
const zipOut = path.join(appDir, zipSuffix);

if (!fs.existsSync(appBundle)) {
  console.error(`App bundle not found: ${appBundle}`);
  console.error('Make sure "pnpm run make" completed successfully before running this script.');
  process.exit(1);
}

console.log(`Creating zip from: ${appBundle}`);
console.log(`Output: ${zipOut}`);

execFileSync(
  'ditto',
  ['-c', '-k', '--sequesterRsrc', '--keepParent', `${productName}.app`, zipSuffix],
  { cwd: appDir, stdio: 'inherit' }
);

console.log(`Done: ${zipOut}`);
