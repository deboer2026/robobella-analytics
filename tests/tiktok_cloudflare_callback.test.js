const assert = require('assert/strict');
const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync('functions/tiktok/callback.js', 'utf8');
const executable = source.replace(
  'export async function onRequest',
  'async function onRequest'
) + '\nmodule.exports = {onRequest};';
const diagnosticLines = [];
const context = {
  URL,
  Response,
  Date,
  console: {log: (line) => diagnosticLines.push(line)},
  module: {exports: {}}
};
vm.runInNewContext(executable, context, {filename: 'callback.js'});
const {onRequest} = context.module.exports;

const PRODUCTION_CALLBACK =
  'https://script.google.com/macros/s/AKfycbzrL9ixRCYC7-qd7Ypaq8i0QIFoDx2_yZzMtX-GjAXTzHkgWMntGcoyoYfPcrVefIY6fw/exec';
const SANDBOX_CALLBACK =
  'https://script.google.com/macros/s/AKfycbw625b0P6FLVK7JvSoWqe5VnPV6s0zlJBMyaT9Kug4omLk9N9P5ND0bOywLITl9aEeDOg/exec';

function request(url, method = 'GET') {
  return {request: new Request(url, {method})};
}

async function follow(url, method = 'GET') {
  diagnosticLines.length = 0;
  const response = await onRequest(request(url, method));
  return {
    status: response.status,
    location: response.headers.get('Location'),
    cacheControl: response.headers.get('Cache-Control'),
    referrerPolicy: response.headers.get('Referrer-Policy'),
    body: await response.text(),
    diagnostics: diagnosticLines.map((line) => JSON.parse(line))
  };
}

const DIAGNOSTIC_KEYS = [
  'timestamp',
  'path',
  'method',
  'code_present',
  'state_present',
  'error_present',
  'error_description_present',
  'forward_attempted',
  'forward_target_class',
  'forward_http_status',
  'terminal_stage'
].sort();

function assertDiagnostic(result, expected) {
  assert.equal(result.diagnostics.length, 1);
  const diagnostic = result.diagnostics[0];
  assert.deepEqual(Object.keys(diagnostic).sort(), DIAGNOSTIC_KEYS);
  assert.match(diagnostic.timestamp, /^\d{4}-\d\d-\d\dT.*Z$/);
  assert.equal(diagnostic.path, '/tiktok/callback');
  for (const [key, value] of Object.entries(expected)) {
    assert.equal(diagnostic[key], value, key);
  }
  for (const key of [
    'code_present',
    'state_present',
    'error_present',
    'error_description_present',
    'forward_attempted'
  ]) {
    assert.equal(typeof diagnostic[key], 'boolean', key);
  }
  return JSON.stringify(diagnostic);
}

(async () => {
  const production = await follow(
    'https://robobellaanalytics.pages.dev/tiktok/callback?' +
      'code=SYNTHETIC_CODE_SECRET&state=' + 'a'.repeat(64) + '&unrelated=drop'
  );
  assert.equal(production.status, 302);
  const productionLocation = new URL(production.location);
  assert.equal(productionLocation.origin + productionLocation.pathname, PRODUCTION_CALLBACK);
  assert.equal(productionLocation.searchParams.get('code'), 'SYNTHETIC_CODE_SECRET');
  assert.equal(productionLocation.searchParams.get('state'), 'a'.repeat(64));
  assert.equal(productionLocation.searchParams.has('unrelated'), false);
  const productionLog = assertDiagnostic(production, {
    method: 'GET',
    code_present: true,
    state_present: true,
    error_present: false,
    error_description_present: false,
    forward_attempted: true,
    forward_target_class: 'PRODUCTION',
    forward_http_status: 302,
    terminal_stage: 'REDIRECT_ISSUED'
  });
  assert.equal(productionLog.includes('SYNTHETIC_CODE_SECRET'), false);
  assert.equal(productionLog.includes('a'.repeat(64)), false);

  for (const prefix of ['sbx_', 'sbx_review_']) {
    const result = await follow(
      'https://robobellaanalytics.pages.dev/tiktok/callback?' +
        'state=' + prefix + 'b'.repeat(64) + '&error=access_denied'
    );
    assert.equal(result.status, 302);
    assert.equal(new URL(result.location).origin + new URL(result.location).pathname, SANDBOX_CALLBACK);
    assert.equal(new URL(result.location).searchParams.get('error'), 'access_denied');
    assertDiagnostic(result, {
      method: 'GET',
      code_present: false,
      state_present: true,
      error_present: true,
      error_description_present: false,
      forward_attempted: true,
      forward_target_class: 'SANDBOX',
      forward_http_status: 302,
      terminal_stage: 'REDIRECT_ISSUED'
    });
  }

  // Sandbox Direct Post intentionally uses the review-state prefix so the
  // existing Cloudflare callback still forwards only to the Sandbox backend.
  const directPostState = 'sbx_review_' + 'd'.repeat(64);
  const directPostCallback = await follow(
    'https://robobellaanalytics.pages.dev/tiktok/callback?code=SYNTHETIC_DIRECT_CODE&state=' +
      directPostState
  );
  assert.equal(directPostCallback.status, 302);
  const directPostTarget = new URL(directPostCallback.location);
  assert.equal(
    directPostTarget.origin + directPostTarget.pathname,
    SANDBOX_CALLBACK
  );
  assert.equal(directPostTarget.searchParams.get('state'), directPostState);
  const directPostLog = assertDiagnostic(directPostCallback, {
    method: 'GET',
    code_present: true,
    state_present: true,
    error_present: false,
    error_description_present: false,
    forward_attempted: true,
    forward_target_class: 'SANDBOX',
    forward_http_status: 302,
    terminal_stage: 'REDIRECT_ISSUED'
  });
  assert.equal(directPostLog.includes('SYNTHETIC_DIRECT_CODE'), false);
  assert.equal(directPostLog.includes(directPostState), false);

  const syntheticErrorDescription = 'SYNTHETIC_DESCRIPTION_SECRET';
  const errorResult = await follow(
    'https://robobellaanalytics.pages.dev/tiktok/callback?' +
      'state=' + 'c'.repeat(64) + '&error=access_denied&error_description=' +
      encodeURIComponent(syntheticErrorDescription)
  );
  assert.equal(errorResult.status, 302);
  assert.equal(
    new URL(errorResult.location).searchParams.get('error_description'),
    syntheticErrorDescription
  );
  const errorLog = assertDiagnostic(errorResult, {
    method: 'GET',
    code_present: false,
    state_present: true,
    error_present: true,
    error_description_present: true,
    forward_attempted: true,
    forward_target_class: 'PRODUCTION',
    forward_http_status: 302,
    terminal_stage: 'REDIRECT_ISSUED'
  });
  assert.equal(errorLog.includes(syntheticErrorDescription), false);

  for (const url of [
    'https://robobellaanalytics.pages.dev/tiktok/callback',
    'https://robobellaanalytics.pages.dev/tiktok/callback?state=sbx_broken',
    'https://robobellaanalytics.pages.dev/tiktok/callback?state=sbx_review_broken',
    'https://robobellaanalytics.pages.dev/tiktok/callback?state=bad%20state',
    'https://robobellaanalytics.pages.dev/tiktok/callback?state=' + 'a'.repeat(64) + '&state=duplicate',
    'https://robobellaanalytics.pages.dev/tiktok/callback?state=' + 'e'.repeat(64),
    'https://robobellaanalytics.pages.dev/tiktok/callback?state=' + 'f'.repeat(64) + '&code=code&error=error'
  ]) {
    const rejected = await follow(url);
    assert.equal(rejected.status, 400);
    const targetClass = url.includes('state=' + 'e'.repeat(64)) ||
      url.includes('state=' + 'f'.repeat(64))
      ? 'PRODUCTION'
      : 'UNKNOWN';
    assertDiagnostic(rejected, {
      forward_attempted: false,
      forward_target_class: targetClass,
      forward_http_status: 400,
      terminal_stage: 'INPUT_REJECTED'
    });
  }

  const methodResult = await follow(
    'https://robobellaanalytics.pages.dev/tiktok/callback?state=' + 'd'.repeat(64),
    'POST'
  );
  assert.equal(methodResult.status, 405);
  assertDiagnostic(methodResult, {
    method: 'OTHER',
    code_present: false,
    state_present: true,
    error_present: false,
    error_description_present: false,
    forward_attempted: false,
    forward_target_class: 'UNKNOWN',
    forward_http_status: 405,
    terminal_stage: 'METHOD_REJECTED'
  });

  assert.match(source, /Cache-Control/);
  assert.match(source, /Referrer-Policy/);
  assert.match(source, /console\.log\(JSON\.stringify\(diagnostic\)\)/);
  assert.equal(/console\.(?:info|warn|error|debug)\(/.test(source), false);
  assert.equal(/console\.log\([^)]*(?:requestUrl|codeValues|stateValues|forward\.href)/s.test(source), false);
  assert.equal(/cookie|localStorage|CacheService|PropertiesService|access_token|upload_url|publish_id/i.test(source), false);

  console.log('tiktok Cloudflare callback tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
