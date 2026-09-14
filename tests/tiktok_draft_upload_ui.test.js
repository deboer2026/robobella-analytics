const assert = require('assert/strict');
const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync('index.html', 'utf8');
const scriptMatch = source.match(/<script>\s*([\s\S]*?)\s*<\/script>/);
assert.ok(scriptMatch, 'dashboard script is present');

assert.match(source, /TikTok Draft Upload/);
assert.match(source, /Connect TikTok for draft upload/);
assert.match(source, /Upload to TikTok as draft/);
assert.match(source, /This does not publish your video/);
assert.match(source, /TikTok sends the draft to your\s+Inbox/);
assert.match(source, /tiktok_upload_capability/);
assert.match(source, /window\.location\.hash/);
assert.match(source, /history\.replaceState/);
assert.match(source, /tiktok_action=sandbox_connect/);
assert.match(source, /tiktok_upload=1/);
assert.match(source, /Supported formats: MP4, QuickTime and WebM/);
assert.match(source, /video\.upload/);
assert.match(source, /tiktokDraftFrame/);

assert.match(scriptMatch[1], /draftCapability/);
assert.match(scriptMatch[1], /analyticsBackendUrl/);
assert.match(scriptMatch[1], /draftReviewBackendUrl/);
assert.match(scriptMatch[1], /draftReviewBackendUrl\s*\+\s*['"]\?tiktok_upload=1&channel=/);
assert.match(scriptMatch[1], /postMessage/);
assert.equal(/event\.source\s*!==\s*draftFrame\.contentWindow/.test(scriptMatch[1]), false);
assert.match(scriptMatch[1], /draftRuntimeWindow/);
assert.match(scriptMatch[1], /draftRuntimeWindow\.postMessage/);
assert.match(scriptMatch[1], /draftCapabilitySent/);
assert.match(scriptMatch[1], /Secure draft-upload panel could not connect\. Please reconnect TikTok\./);
assert.match(scriptMatch[1], /draftConnectButton\.disabled\s*=\s*true/);
assert.match(scriptMatch[1], /user\.username/);
assert.equal(/draftFrame\.src\s*=\s*[^;]*draftCapability/.test(scriptMatch[1]), false);
assert.equal(/\?tiktok_upload_capability=/.test(source), false);
assert.notEqual(
  scriptMatch[1].match(/var analyticsBackendUrl = ['"]([^'"]+)/)[1],
  scriptMatch[1].match(/var draftReviewBackendUrl = ['"]([^'"]+)/)[1]
);

assert.equal(/robobellachan/i.test(source), false);
assert.equal(/video\.publish|Direct Post/i.test(source), false);
assert.equal(/open[_-]?id/i.test(source), false);
assert.equal(/publish[_-]?id/i.test(source), false);
assert.equal(/upload[_-]?url/i.test(source), false);
assert.equal(/access[_-]?token|refresh[_-]?token|client[_-]?secret/i.test(source), false);
assert.equal(/google\.script\.run/.test(source), false);
assert.equal(/setInterval/.test(scriptMatch[1]), false);

new Function(scriptMatch[1]);

function createDashboardPage(capability) {
  const elements = new Map();
  const listeners = {};
  const timers = [];
  const historyCalls = [];
  const windowObject = {
    location: {
      pathname: '/',
      search: '',
      hash: capability ? '#tiktok_upload_capability=' + capability : ''
    },
    crypto: {
      getRandomValues(bytes) {
        for (let index = 0; index < bytes.length; index += 1) bytes[index] = index;
        return bytes;
      }
    },
    btoa(value) {
      return Buffer.from(value, 'binary').toString('base64');
    },
    history: {
      replaceState(...args) { historyCalls.push(args); }
    },
    addEventListener(type, handler) {
      listeners[type] = listeners[type] || [];
      listeners[type].push(handler);
    },
    removeEventListener(type, handler) {
      listeners[type] = (listeners[type] || []).filter((item) => item !== handler);
    },
    setTimeout(handler) {
      timers.push(handler);
      return timers.length - 1;
    },
    clearTimeout(timerId) {
      timers[timerId] = null;
    }
  };
  function element(id) {
    if (!elements.has(id)) {
      const classes = new Set();
      elements.set(id, {
        id,
        classList: {
          add(value) { classes.add(value); },
          remove(value) { classes.delete(value); },
          contains(value) { return classes.has(value); }
        },
        addEventListener() {},
        removeAttribute() {},
        contentWindow: { postMessage() {} },
        textContent: '',
        src: '',
        hidden: false
      });
    }
    return elements.get(id);
  }
  const context = {
    window: windowObject,
    document: {
      title: 'RoboBella Analytics',
      getElementById: element
    },
    URL,
    URLSearchParams,
    console: { log() {}, error() {} }
  };
  vm.runInNewContext(scriptMatch[1], context, { filename: 'index.html' });
  return {context, element, listeners, timers, historyCalls};
}

const capability = 'a'.repeat(128);
const runtimeOrigin = 'https://n-review-script.googleusercontent.com';
const nestedPage = createDashboardPage(capability);
const nestedFrame = nestedPage.element('tiktokDraftFrame');
const nestedChannel = new URL(nestedFrame.src).searchParams.get('channel');
const runtimePosts = [];
const runtimeWindow = {
  postMessage(...args) { runtimePosts.push(args); }
};
const readyHandler = nestedPage.listeners.message[0];
assert.ok(readyHandler, 'draft READY listener is installed');
assert.notEqual(runtimeWindow, nestedFrame.contentWindow);
readyHandler({
  origin: runtimeOrigin,
  source: runtimeWindow,
  data: {
    type: 'robobella:tiktok-draft-ready',
    channel: nestedChannel
  }
});
assert.equal(runtimePosts.length, 1, 'nested runtime source receives capability');
assert.equal(runtimePosts[0][0].type, 'robobella:tiktok-draft-capability');
assert.equal(runtimePosts[0][0].channel, nestedChannel);
assert.equal(runtimePosts[0][0].capability, capability);
assert.equal(runtimePosts[0][1], runtimeOrigin);
readyHandler({
  origin: runtimeOrigin,
  source: runtimeWindow,
  data: {type: 'robobella:tiktok-draft-ready', channel: nestedChannel}
});
assert.equal(runtimePosts.length, 1, 'duplicate READY does not resend capability');
readyHandler({
  origin: runtimeOrigin,
  source: {postMessage() {}},
  data: {type: 'robobella:tiktok-draft-ready', channel: nestedChannel}
});
assert.equal(runtimePosts.length, 1, 'different source cannot use bound channel');
assert.equal(nestedPage.historyCalls[0][2].includes(capability), false);
assert.equal(nestedFrame.src.includes(capability), false);

function assertReadyRejected(eventFactory) {
  const page = createDashboardPage(capability);
  const frame = page.element('tiktokDraftFrame');
  const channel = new URL(frame.src).searchParams.get('channel');
  const posts = [];
  const source = {postMessage(...args) { posts.push(args); }};
  page.listeners.message[0](eventFactory(channel, source));
  assert.equal(posts.length, 0);
}

assertReadyRejected((channel, source) => ({
  origin: 'https://evil.example',
  source,
  data: {type: 'robobella:tiktok-draft-ready', channel}
}));
assertReadyRejected((channel, source) => ({
  origin: runtimeOrigin,
  source,
  data: {type: 'robobella:tiktok-draft-ready', channel: channel + 'x'}
}));
assertReadyRejected((channel) => ({
  origin: runtimeOrigin,
  source: null,
  data: {type: 'robobella:tiktok-draft-ready', channel}
}));
const noCapabilityPage = createDashboardPage('');
assert.equal((noCapabilityPage.listeners.message || []).length, 0);
assert.equal(noCapabilityPage.element('tiktokDraftFrame').src, '');

const timeoutPage = createDashboardPage(capability);
const timeoutFrame = timeoutPage.element('tiktokDraftFrame');
const timeoutChannel = new URL(timeoutFrame.src).searchParams.get('channel');
const timeoutPosts = [];
const timeoutSource = {postMessage(...args) { timeoutPosts.push(args); }};
const timeoutHandler = timeoutPage.listeners.message[0];
assert.equal(timeoutPage.timers.length, 1);
timeoutPage.timers[0]();
const timeoutError = timeoutPage.element('tiktokDraftHandshakeError');
assert.equal(timeoutError.textContent, 'Secure draft-upload panel could not connect. Please reconnect TikTok.');
assert.equal(timeoutError.classList.contains('hidden'), false);
timeoutHandler({
  origin: runtimeOrigin,
  source: timeoutSource,
  data: {type: 'robobella:tiktok-draft-ready', channel: timeoutChannel}
});
assert.equal(timeoutPosts.length, 0, 'timed-out handshake does not send late capability');

const privacy = fs.readFileSync('privacy.html', 'utf8');
const terms = fs.readFileSync('terms.html', 'utf8');
[privacy, terms].forEach((policy) => {
  assert.match(policy, /TikTok/i);
  assert.match(policy, /draft/i);
  assert.match(policy, /transient/i);
  assert.match(policy, /server-side/i);
  assert.match(policy, /manually/i);
});
assert.match(source, /href="privacy\.html"/);
assert.match(source, /href="terms\.html"/);

console.log('tiktok draft upload UI tests passed');
