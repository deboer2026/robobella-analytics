const assert = require('assert/strict');
const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync('functions/tiktok/callback.js', 'utf8');
const executable = source.replace(
  'export async function onRequest',
  'async function onRequest'
) + '\nmodule.exports = {onRequest};';
const context = {URL, Response, module: {exports: {}}};
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
  const response = await onRequest(request(url, method));
  return {
    status: response.status,
    location: response.headers.get('Location'),
    cacheControl: response.headers.get('Cache-Control'),
    referrerPolicy: response.headers.get('Referrer-Policy'),
    body: await response.text()
  };
}

(async () => {
  const production = await follow(
    'https://robobellaanalytics.pages.dev/tiktok/callback?' +
      'code=review-code&state=' + 'a'.repeat(64) + '&unrelated=drop'
  );
  assert.equal(production.status, 302);
  const productionLocation = new URL(production.location);
  assert.equal(productionLocation.origin + productionLocation.pathname, PRODUCTION_CALLBACK);
  assert.equal(productionLocation.searchParams.get('code'), 'review-code');
  assert.equal(productionLocation.searchParams.get('state'), 'a'.repeat(64));
  assert.equal(productionLocation.searchParams.has('unrelated'), false);

  for (const prefix of ['sbx_', 'sbx_review_']) {
    const result = await follow(
      'https://robobellaanalytics.pages.dev/tiktok/callback?' +
        'state=' + prefix + 'b'.repeat(64) + '&error=access_denied'
    );
    assert.equal(result.status, 302);
    assert.equal(new URL(result.location).origin + new URL(result.location).pathname, SANDBOX_CALLBACK);
    assert.equal(new URL(result.location).searchParams.get('error'), 'access_denied');
  }

  const errorResult = await follow(
    'https://robobellaanalytics.pages.dev/tiktok/callback?' +
      'state=' + 'c'.repeat(64) + '&error=access_denied&error_description=Not%20approved'
  );
  assert.equal(errorResult.status, 302);
  assert.equal(new URL(errorResult.location).searchParams.get('error_description'), 'Not approved');

  for (const url of [
    'https://robobellaanalytics.pages.dev/tiktok/callback',
    'https://robobellaanalytics.pages.dev/tiktok/callback?state=sbx_broken',
    'https://robobellaanalytics.pages.dev/tiktok/callback?state=sbx_review_broken',
    'https://robobellaanalytics.pages.dev/tiktok/callback?state=bad%20state',
    'https://robobellaanalytics.pages.dev/tiktok/callback?state=' + 'a'.repeat(64) + '&state=duplicate',
    'https://robobellaanalytics.pages.dev/tiktok/callback?state=' + 'e'.repeat(64),
    'https://robobellaanalytics.pages.dev/tiktok/callback?state=' + 'f'.repeat(64) + '&code=code&error=error'
  ]) {
    assert.equal((await follow(url)).status, 400);
  }

  const methodResult = await follow(
    'https://robobellaanalytics.pages.dev/tiktok/callback?state=' + 'd'.repeat(64),
    'POST'
  );
  assert.equal(methodResult.status, 405);

  assert.match(source, /Cache-Control/);
  assert.match(source, /Referrer-Policy/);
  assert.equal(/console\./.test(source), false);
  assert.equal(/cookie|localStorage|CacheService|PropertiesService|access_token|upload_url|publish_id/i.test(source), false);

  console.log('tiktok Cloudflare callback tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
