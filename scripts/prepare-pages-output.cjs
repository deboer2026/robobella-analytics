'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {stageSiteAssets} = require('./pages-deploy-contract.cjs');

const repoRoot = path.resolve(__dirname, '..');
let tempRoot = '';

try {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'robobella-pages-deploy-'));
  const outputDirectory = path.join(tempRoot, 'site');
  const staged = stageSiteAssets(repoRoot, outputDirectory);
  process.stdout.write(JSON.stringify({
    tempRoot,
    outputDirectory: staged.outputDirectory,
    assetCount: staged.assetCount
  }));
} catch {
  if (tempRoot && path.basename(tempRoot).startsWith('robobella-pages-deploy-')) {
    fs.rmSync(tempRoot, {recursive: true, force: true});
  }
  process.stderr.write('PAGES_ASSET_STAGE_FAILED\n');
  process.exitCode = 1;
}
