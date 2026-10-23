'use strict';

const {isIP} = require('node:net');
const {isExpectedCallbackResponse} = require('./pages-deploy-contract.cjs');

const PRODUCTION_CALLBACK_URL =
  'https://robobellaanalytics.pages.dev/tiktok/callback';

function resolveTarget(args) {
  if (args.length === 1 && args[0] === '--live-production') {
    return PRODUCTION_CALLBACK_URL;
  }
  if (args.length === 2 && args[0] === '--local-url') {
    const target = new URL(args[1]);
    const loopback = target.hostname === 'localhost' ||
      (isIP(target.hostname) === 4 && target.hostname.startsWith('127.')) ||
      target.hostname === '::1';
    if (target.protocol !== 'http:' || !loopback || target.search || target.hash) {
      throw new Error('LOCAL_TARGET_NOT_LOOPBACK');
    }
    target.pathname = '/tiktok/callback';
    return target.href;
  }
  throw new Error('EXPLICIT_SMOKE_TARGET_REQUIRED');
}

async function smoke(target) {
  const response = await fetch(target, {
    method: 'GET',
    redirect: 'manual',
    headers: {Accept: 'text/plain'}
  });
  const body = await response.text();
  const headers = {
    'cache-control': response.headers.get('cache-control') || '',
    'referrer-policy': response.headers.get('referrer-policy') || '',
    location: response.headers.get('location') || ''
  };
  const passed = isExpectedCallbackResponse({
    status: response.status,
    body,
    headers
  });
  process.stdout.write(`CALLBACK_ROUTE_SMOKE=${passed ? 'PASS' : 'FAIL'} STATUS=${response.status}\n`);
  return passed;
}

if (require.main === module) {
  (async () => {
    let target;
    try {
      target = resolveTarget(process.argv.slice(2));
    } catch {
      process.stderr.write('CALLBACK_ROUTE_SMOKE=INVALID_TARGET\n');
      process.exitCode = 2;
      return;
    }
    try {
      if (!(await smoke(target))) process.exitCode = 1;
    } catch {
      process.stderr.write('CALLBACK_ROUTE_SMOKE=REQUEST_FAILED\n');
      process.exitCode = 1;
    }
  })();
}

module.exports = {PRODUCTION_CALLBACK_URL, resolveTarget, smoke};
