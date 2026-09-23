const PRODUCTION_CALLBACK =
  'https://script.google.com/macros/s/AKfycbzrL9ixRCYC7-qd7Ypaq8i0QIFoDx2_yZzMtX-GjAXTzHkgWMntGcoyoYfPcrVefIY6fw/exec';
const SANDBOX_CALLBACK =
  'https://script.google.com/macros/s/AKfycbw625b0P6FLVK7JvSoWqe5VnPV6s0zlJBMyaT9Kug4omLk9N9P5ND0bOywLITl9aEeDOg/exec';

const ALLOWED_PARAMETERS = [
  'code',
  'state',
  'error',
  'error_description'
];

const PARAMETER_LIMITS = {
  code: 4096,
  state: 256,
  error: 256,
  error_description: 2048
};

function responseHeaders() {
  return {
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'Content-Type': 'text/plain; charset=utf-8'
  };
}

function isSafeParameter(name, value) {
  return typeof value === 'string' &&
    value.length > 0 &&
    value.length <= PARAMETER_LIMITS[name] &&
    !/[\u0000-\u001f\u007f]/.test(value);
}

function callbackTargetForState(state) {
  if (typeof state !== 'string' || state.length === 0) return '';

  if (state.startsWith('sbx_')) {
    return /^sbx_(?:review_)?[A-Za-z0-9_-]{16,256}$/.test(state)
      ? SANDBOX_CALLBACK
      : '';
  }

  return /^[A-Za-z0-9_-]{16,256}$/.test(state)
    ? PRODUCTION_CALLBACK
    : '';
}

function badRequest(message) {
  return new Response(message, {
    status: 400,
    headers: responseHeaders()
  });
}

export async function onRequest(context) {
  if (context.request.method !== 'GET') {
    return new Response('Method not allowed', {
      status: 405,
      headers: Object.assign(responseHeaders(), {Allow: 'GET'})
    });
  }

  const requestUrl = new URL(context.request.url);
  const stateValues = requestUrl.searchParams.getAll('state');
  const state = stateValues.length === 1 ? stateValues[0] : '';
  const callbackTarget = callbackTargetForState(state);

  if (!callbackTarget || !isSafeParameter('state', state)) {
    return badRequest('Invalid OAuth callback');
  }

  const codeValues = requestUrl.searchParams.getAll('code');
  const errorValues = requestUrl.searchParams.getAll('error');
  const hasCode = codeValues.length === 1;
  const hasError = errorValues.length === 1;
  if (hasCode === hasError || codeValues.length > 1 || errorValues.length > 1) {
    return badRequest('Invalid OAuth callback');
  }

  const forward = new URL(callbackTarget);
  for (const name of ALLOWED_PARAMETERS) {
    const values = requestUrl.searchParams.getAll(name);
    if (values.length > 1) return badRequest('Invalid OAuth callback');
    if (values.length === 0) continue;
    if (!isSafeParameter(name, values[0])) {
      return badRequest('Invalid OAuth callback');
    }
    forward.searchParams.set(name, values[0]);
  }

  return new Response(null, {
    status: 302,
    headers: Object.assign(responseHeaders(), {Location: forward.href})
  });
}
