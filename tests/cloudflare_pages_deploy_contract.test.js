const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const test = require('node:test');
const {
  CONFIRMATION_FLAG,
  REMOTE_MAIN_PROOF_MAX_AGE_MS,
  REMOTE_MAIN_SHA_ENV,
  REMOTE_MAIN_VERIFIED_AT_ENV,
  validatePowerShellRemoteMainProof
} = require('../scripts/deploy-pages-production.cjs');
const {PRODUCTION_CALLBACK_URL, resolveTarget} = require('../scripts/smoke-pages-callback.cjs');
const {
  EXPECTED_GIT_ORIGIN,
  PAGES_PROJECT_NAME,
  PAGES_PRODUCTION_DOMAIN,
  isExpectedCallbackResponse,
  listSiteAssets,
  stageSiteAssets,
  validateExistingDirectUploadProject
} = require('../scripts/pages-deploy-contract.cjs');

const root = path.resolve(__dirname, '..');

test('existing Direct Upload project is pinned by exact name and domain', () => {
  assert.deepEqual(validateExistingDirectUploadProject([{
    'Project Name': PAGES_PROJECT_NAME,
    'Project Domains': PAGES_PRODUCTION_DOMAIN,
    'Git Provider': 'No'
  }]), {
    projectName: PAGES_PROJECT_NAME,
    productionDomain: PAGES_PRODUCTION_DOMAIN
  });
});

test('project locator fails closed for absent, duplicate, changed-domain, or Git-integrated project', () => {
  assert.throws(() => validateExistingDirectUploadProject([]), /EXISTING_PROJECT_NOT_UNIQUE/);
  assert.throws(() => validateExistingDirectUploadProject([
    {'Project Name': PAGES_PROJECT_NAME, 'Project Domains': PAGES_PRODUCTION_DOMAIN, 'Git Provider': 'No'},
    {'Project Name': PAGES_PROJECT_NAME, 'Project Domains': PAGES_PRODUCTION_DOMAIN, 'Git Provider': 'No'}
  ]), /EXISTING_PROJECT_NOT_UNIQUE/);
  assert.throws(() => validateExistingDirectUploadProject([{
    'Project Name': PAGES_PROJECT_NAME,
    'Project Domains': 'other.pages.dev',
    'Git Provider': 'No'
  }]), /EXISTING_PROJECT_DOMAIN_MISMATCH/);
  assert.throws(() => validateExistingDirectUploadProject([{
    'Project Name': PAGES_PROJECT_NAME,
    'Project Domains': PAGES_PRODUCTION_DOMAIN,
    'Git Provider': 'GitHub'
  }]), /PROJECT_TYPE_CHANGED/);
});

test('static staging copies the site allowlist and leaves Pages Functions at repository root', (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-pages-contract-test-'));
  t.after(() => fs.rmSync(tempRoot, {recursive: true, force: true}));
  const output = path.join(tempRoot, 'site');
  const staged = stageSiteAssets(root, output);
  const names = fs.readdirSync(output).sort();

  assert.deepEqual(names, listSiteAssets(root));
  assert.equal(names.includes('callback.js'), false);
  assert.equal(names.includes('tests'), false);
  assert.equal(names.includes('functions'), false);
  assert.equal(staged.assetCount, names.length);
  for (const name of names) {
    assert.deepEqual(fs.readFileSync(path.join(output, name)), fs.readFileSync(path.join(root, name)));
  }
  assert.throws(() => stageSiteAssets(root, output), /ASSET_OUTPUT_ALREADY_EXISTS/);
  assert.equal(fs.existsSync(path.join(root, 'functions', 'tiktok', 'callback.js')), true);
});

test('deploy contract pins the repo, existing project, production branch, and explicit operator confirmation', () => {
  const source = fs.readFileSync(path.join(root, 'scripts', 'deploy-pages-production.cjs'), 'utf8');
  const contract = fs.readFileSync(path.join(root, 'scripts', 'pages-deploy-contract.cjs'), 'utf8');
  assert.equal(EXPECTED_GIT_ORIGIN, 'https://github.com/deboer2026/robobella-analytics.git');
  assert.equal(CONFIRMATION_FLAG, '--confirm-existing-production');
  assert.equal(REMOTE_MAIN_SHA_ENV, 'RB_PAGES_VERIFIED_ORIGIN_MAIN_SHA');
  assert.equal(REMOTE_MAIN_VERIFIED_AT_ENV, 'RB_PAGES_VERIFIED_ORIGIN_MAIN_AT_MS');
  assert.equal(REMOTE_MAIN_PROOF_MAX_AGE_MS, 120000);
  assert.equal(source.includes("runGit(['ls-remote', 'origin', 'refs/heads/main'])"), false);
  assert.match(source, /validatePowerShellRemoteMainProof\(/);
  assert.match(source, /runJsonWrangler\(\['pages', 'project', 'list'\]\)/);
  assert.match(source, /'pages', 'deployment', 'list'/);
  assert.match(source, /'pages', 'deploy'/);
  assert.match(source, /`--project-name=\$\{PAGES_PROJECT_NAME\}`/);
  assert.match(source, /--branch=main/);
  assert.match(contract, /WRANGLER_VERSION = '4\.152\.0'/);
  assert.match(source, /`--package=wrangler@\$\{WRANGLER_VERSION\}`/);
  assert.equal(/pages project create|wrangler login/i.test(source + contract), false);
  assert.match(source, /--confirm-existing-production/);
});

test('PowerShell remote-main proof is fresh, well-formed, and bound to local HEAD', () => {
  const sha = 'd6fd309d376351c78cfbfe46891bce635cebdb36';
  const now = 1792800000000;
  assert.equal(validatePowerShellRemoteMainProof(sha, sha, String(now), now), sha);
  assert.throws(() => validatePowerShellRemoteMainProof(sha, '', String(now), now), /REMOTE_MAIN_PREFLIGHT_INVALID/);
  assert.throws(() => validatePowerShellRemoteMainProof(sha, 'not-a-sha', String(now), now), /REMOTE_MAIN_PREFLIGHT_INVALID/);
  assert.throws(() => validatePowerShellRemoteMainProof(sha, 'a'.repeat(40), String(now), now), /LOCAL_MAIN_NOT_CURRENT/);
  assert.throws(() => validatePowerShellRemoteMainProof(sha, sha, String(now - REMOTE_MAIN_PROOF_MAX_AGE_MS - 1), now), /REMOTE_MAIN_PREFLIGHT_STALE/);
  assert.throws(() => validatePowerShellRemoteMainProof(sha, sha, String(now + 5001), now), /REMOTE_MAIN_PREFLIGHT_STALE/);
});

test('PowerShell wrapper performs the remote read and passes a fresh non-secret SHA proof to Node', () => {
  const source = fs.readFileSync(path.join(root, 'scripts', 'deploy-pages-production.cjs'), 'utf8');
  const wrapper = fs.readFileSync(path.join(root, 'scripts', 'deploy-pages-production.ps1'), 'utf8');
  assert.match(wrapper, /git ls-remote origin refs\/heads\/main/);
  assert.match(wrapper, /RB_PAGES_VERIFIED_ORIGIN_MAIN_SHA/);
  assert.match(wrapper, /RB_PAGES_VERIFIED_ORIGIN_MAIN_AT_MS/);
  assert.match(wrapper, /deploy-pages-production\.cjs/);
  assert.match(wrapper, /--confirm-existing-production/);
  assert.equal(/wrangler login|pages project create/i.test(wrapper), false);
  const deployStart = source.indexOf("'pages', 'deploy'");
  const lastCheckoutPreflight = source.lastIndexOf('verifyReleaseCheckout();');
  assert.ok(deployStart >= 0);
  assert.ok(lastCheckoutPreflight >= 0 && lastCheckoutPreflight < deployStart);
});

test('production deployment command stops before external calls without explicit confirmation', () => {
  const result = spawnSync(process.execPath, [
    path.join(root, 'scripts', 'deploy-pages-production.cjs')
  ], {cwd: root, encoding: 'utf8'});
  assert.equal(result.status, 2);
  assert.match(result.stderr, /PRODUCTION_DEPLOY_REQUIRES_EXPLICIT_CONFIRMATION/);
});

test('route smoke accepts only the callback Function 400 contract, not static index or redirect fallback', () => {
  assert.equal(isExpectedCallbackResponse({
    status: 400,
    body: 'Invalid OAuth callback',
    headers: {'cache-control': 'no-store', 'referrer-policy': 'no-referrer'}
  }), true);
  assert.equal(isExpectedCallbackResponse({
    status: 200,
    body: '<!doctype html><title>RoboBella Analytics</title>',
    headers: {'content-type': 'text/html'}
  }), false);
  assert.equal(isExpectedCallbackResponse({
    status: 302,
    body: '',
    headers: {location: 'https://example.invalid'}
  }), false);
  assert.equal(isExpectedCallbackResponse({
    status: 400,
    body: 'Invalid OAuth callback',
    headers: {'cache-control': 'public, max-age=60', 'referrer-policy': 'no-referrer'}
  }), false);
});

test('route smoke has no implicit live target and only permits the pinned production route or loopback', () => {
  assert.throws(() => resolveTarget([]), /EXPLICIT_SMOKE_TARGET_REQUIRED/);
  assert.equal(resolveTarget(['--live-production']), PRODUCTION_CALLBACK_URL);
  assert.equal(new URL(PRODUCTION_CALLBACK_URL).search, '');
  assert.equal(resolveTarget(['--local-url', 'http://127.0.0.1:8789']).endsWith('/tiktok/callback'), true);
  assert.throws(() => resolveTarget(['--local-url', 'https://robobellaanalytics.pages.dev']), /LOCAL_TARGET_NOT_LOOPBACK/);
  assert.throws(() => resolveTarget(['--local-url', 'http://127.0.0.1:8789/?code=unsafe']), /LOCAL_TARGET_NOT_LOOPBACK/);
});
