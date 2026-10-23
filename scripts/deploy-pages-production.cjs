'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {
  EXPECTED_GIT_ORIGIN,
  PAGES_PROJECT_NAME,
  PAGES_PRODUCTION_DOMAIN,
  WRANGLER_VERSION,
  isExpectedCallbackResponse,
  validateExistingDirectUploadProject
} = require('./pages-deploy-contract.cjs');
const {PRODUCTION_CALLBACK_URL} = require('./smoke-pages-callback.cjs');

const repoRoot = path.resolve(__dirname, '..');
const npxCli = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js');
const CONFIRMATION_FLAG = '--confirm-existing-production';
const REMOTE_MAIN_SHA_ENV = 'RB_PAGES_VERIFIED_ORIGIN_MAIN_SHA';
const REMOTE_MAIN_VERIFIED_AT_ENV = 'RB_PAGES_VERIFIED_ORIGIN_MAIN_AT_MS';
const REMOTE_MAIN_PROOF_MAX_AGE_MS = 120000;

function taskError(code) {
  const error = new Error(code);
  error.safeCode = code;
  return error;
}

function runGit(args) {
  const result = spawnSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    windowsHide: true
  });
  if (result.error || result.status !== 0) throw taskError('GIT_PREFLIGHT_FAILED');
  return result.stdout.trim();
}

function validatePowerShellRemoteMainProof(localHead, remoteHead, verifiedAtMs, now = Date.now()) {
  if (!/^[a-f0-9]{40}$/i.test(localHead || '') ||
      !/^[a-f0-9]{40}$/i.test(remoteHead || '') ||
      !/^\d{13}$/.test(String(verifiedAtMs || ''))) {
    throw taskError('REMOTE_MAIN_PREFLIGHT_INVALID');
  }

  const verifiedAt = Number(verifiedAtMs);
  if (!Number.isSafeInteger(verifiedAt) ||
      verifiedAt > now + 5000 ||
      now - verifiedAt > REMOTE_MAIN_PROOF_MAX_AGE_MS) {
    throw taskError('REMOTE_MAIN_PREFLIGHT_STALE');
  }
  if (localHead.toLowerCase() !== remoteHead.toLowerCase()) {
    throw taskError('LOCAL_MAIN_NOT_CURRENT');
  }
  return remoteHead.toLowerCase();
}

function runWrangler(args, timeout = 120000) {
  if (!fs.existsSync(npxCli)) throw taskError('NPM_CLI_NOT_FOUND');
  const result = spawnSync(process.execPath, [
    npxCli,
    '--yes',
    `--package=wrangler@${WRANGLER_VERSION}`,
    'wrangler',
    ...args
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout,
    windowsHide: true,
    env: {...process.env, WRANGLER_SEND_METRICS: 'false'}
  });
  if (result.error || result.status !== 0) throw taskError('WRANGLER_COMMAND_FAILED');
  return result.stdout.trim();
}

function runJsonWrangler(args) {
  let result;
  try {
    result = JSON.parse(runWrangler([...args, '--json']));
  } catch (error) {
    if (error.safeCode) throw error;
    throw taskError('WRANGLER_JSON_READ_MALFORMED');
  }
  if (!Array.isArray(result)) throw taskError('WRANGLER_JSON_READ_MALFORMED');
  return result;
}

function verifyReleaseCheckout() {
  if (runGit(['remote', 'get-url', 'origin']) !== EXPECTED_GIT_ORIGIN) {
    throw taskError('REPOSITORY_IDENTITY_MISMATCH');
  }
  if (runGit(['branch', '--show-current']) !== 'main') {
    throw taskError('RELEASE_BRANCH_REQUIRED');
  }
  if (runGit(['status', '--porcelain'])) throw taskError('CLEAN_WORKTREE_REQUIRED');

  const localHead = runGit(['rev-parse', 'HEAD']);
  validatePowerShellRemoteMainProof(
    localHead,
    process.env[REMOTE_MAIN_SHA_ENV],
    process.env[REMOTE_MAIN_VERIFIED_AT_ENV]
  );
}

function verifyCloudflareTarget() {
  const projectRows = runJsonWrangler(['pages', 'project', 'list']);
  try {
    validateExistingDirectUploadProject(projectRows);
  } catch {
    throw taskError('EXISTING_DIRECT_UPLOAD_IDENTITY_MISMATCH');
  }

  const deployments = runJsonWrangler([
    'pages', 'deployment', 'list',
    `--project-name=${PAGES_PROJECT_NAME}`,
    '--environment=production'
  ]);
  const existingMainProduction = deployments.filter((deployment) =>
    deployment && deployment.Environment === 'Production' && deployment.Branch === 'main'
  );
  if (existingMainProduction.length === 0) {
    throw taskError('EXISTING_PRODUCTION_DEPLOYMENT_NOT_FOUND');
  }
  return {projectName: PAGES_PROJECT_NAME, domain: PAGES_PRODUCTION_DOMAIN};
}

function prepareStage() {
  const result = spawnSync(process.execPath, [path.join(__dirname, 'prepare-pages-output.cjs')], {
    cwd: repoRoot,
    encoding: 'utf8',
    windowsHide: true
  });
  if (result.error || result.status !== 0) throw taskError('PAGES_ASSET_STAGE_FAILED');
  let stage;
  try {
    stage = JSON.parse(result.stdout);
  } catch {
    throw taskError('PAGES_ASSET_STAGE_MALFORMED');
  }

  const tempRoot = path.resolve(stage.tempRoot || '');
  const outputDirectory = path.resolve(stage.outputDirectory || '');
  const systemTemp = path.resolve(os.tmpdir()) + path.sep;
  if (!tempRoot.startsWith(systemTemp) ||
      !path.basename(tempRoot).startsWith('robobella-pages-deploy-') ||
      !outputDirectory.startsWith(tempRoot + path.sep) ||
      !fs.statSync(outputDirectory).isDirectory()) {
    throw taskError('PAGES_ASSET_STAGE_PATH_INVALID');
  }
  return {tempRoot, outputDirectory};
}

async function verifyProductionRoute() {
  let response;
  try {
    response = await fetch(PRODUCTION_CALLBACK_URL, {
      method: 'GET',
      redirect: 'manual',
      headers: {Accept: 'text/plain'},
      signal: AbortSignal.timeout(15000)
    });
  } catch {
    throw taskError('PRODUCTION_CALLBACK_ROUTE_SMOKE_UNAVAILABLE');
  }

  const body = await response.text();
  const expected = isExpectedCallbackResponse({
    status: response.status,
    body,
    headers: {
      'cache-control': response.headers.get('cache-control') || '',
      'referrer-policy': response.headers.get('referrer-policy') || '',
      location: response.headers.get('location') || ''
    }
  });
  if (!expected) throw taskError('PRODUCTION_CALLBACK_ROUTE_SMOKE_FAILED');
}

function cleanStage(tempRoot) {
  if (!tempRoot) return;
  const resolved = path.resolve(tempRoot);
  const systemTemp = path.resolve(os.tmpdir()) + path.sep;
  if (resolved.startsWith(systemTemp) &&
      path.basename(resolved).startsWith('robobella-pages-deploy-') &&
      fs.existsSync(resolved)) {
    fs.rmSync(resolved, {recursive: true, force: true});
  }
}

async function main(args) {
  if (args.length !== 1 || args[0] !== CONFIRMATION_FLAG) {
    throw taskError('PRODUCTION_DEPLOY_REQUIRES_EXPLICIT_CONFIRMATION');
  }

  verifyReleaseCheckout();
  verifyCloudflareTarget();

  let stage;
  try {
    stage = prepareStage();
    // Cloudflare reads and staging may take long enough to stale the parent-shell proof.
    // Recheck checkout cleanliness, HEAD, and proof freshness immediately before the write.
    verifyReleaseCheckout();
    runWrangler([
      'pages', 'deploy', stage.outputDirectory,
      `--project-name=${PAGES_PROJECT_NAME}`,
      '--branch=main'
    ], 180000);
    process.stdout.write('PAGES_DEPLOY_COMPLETE=true\n');
    await verifyProductionRoute();
    process.stdout.write('PRODUCTION_CALLBACK_ROUTE_SMOKE=PASS\n');
  } finally {
    if (stage) cleanStage(stage.tempRoot);
  }
}

if (require.main === module) {
  main(process.argv.slice(2)).catch((error) => {
    const code = /^[A-Z0-9_]+$/.test(error?.safeCode || '')
      ? error.safeCode
      : 'PRODUCTION_DEPLOYMENT_FAILED';
    process.stderr.write(`${code}\n`);
    process.exitCode = code === 'PRODUCTION_DEPLOY_REQUIRES_EXPLICIT_CONFIRMATION' ? 2 : 1;
  });
}

module.exports = {
  CONFIRMATION_FLAG,
  REMOTE_MAIN_SHA_ENV,
  REMOTE_MAIN_VERIFIED_AT_ENV,
  REMOTE_MAIN_PROOF_MAX_AGE_MS,
  validatePowerShellRemoteMainProof,
  verifyCloudflareTarget,
  verifyProductionRoute,
  verifyReleaseCheckout
};
