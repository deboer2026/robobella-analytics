const assert = require('assert/strict');
const fs = require('fs');

const source = fs.readFileSync('index.html', 'utf8');
const scriptMatch = source.match(/<script>\s*([\s\S]*?)\s*<\/script>/);
assert.ok(scriptMatch, 'dashboard script is present');

assert.match(source, /TikTok Draft Upload/);
assert.match(source, /Connect TikTok for draft upload/);
assert.match(source, /Upload to TikTok as draft/);
assert.match(source, /This does not publish your video/);
assert.match(source, /TikTok sends the draft to your\s+Inbox/);
assert.match(source, /tiktok_upload_capability/);
assert.match(source, /tiktok_action=sandbox_connect/);
assert.match(source, /tiktok_upload=1/);
assert.match(source, /Supported formats: MP4, QuickTime and WebM/);
assert.match(source, /video\.upload/);
assert.match(source, /tiktokDraftFrame/);

assert.match(scriptMatch[1], /draftCapability/);
assert.match(scriptMatch[1], /encodeURIComponent\(draftCapability\)/);
assert.match(scriptMatch[1], /draftConnectButton\.disabled\s*=\s*true/);
assert.match(scriptMatch[1], /user\.username/);

assert.equal(/robobellachan/i.test(source), false);
assert.equal(/video\.publish|Direct Post/i.test(source), false);
assert.equal(/open[_-]?id/i.test(source), false);
assert.equal(/publish[_-]?id/i.test(source), false);
assert.equal(/upload[_-]?url/i.test(source), false);
assert.equal(/access[_-]?token|refresh[_-]?token|client[_-]?secret/i.test(source), false);
assert.equal(/google\.script\.run/.test(source), false);
assert.equal(/setInterval/.test(scriptMatch[1]), false);

new Function(scriptMatch[1]);

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
