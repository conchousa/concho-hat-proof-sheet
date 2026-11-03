const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { buildReadyEmail, sendReadyNotification, DEFAULT_TO, DEFAULT_PORTAL_ID } = require('../lib/ready-notify');

const silent = { log() {}, warn() {}, error() {} };
const baseEnv = {
  RESEND_API_KEY: 're_test_placeholder',
  READY_NOTIFY_FROM: 'Concho Proof Builder <proofs@conchousa.com>',
};

test('default recipient, portal, subject, and body', () => {
  const email = buildReadyEmail({ dealName: 'Austin Rodeo', round: 2, dealId: '12345' }, {});
  assert.equal(email.to, DEFAULT_TO);
  assert.equal(email.subject, 'Noah has new designs ready: Austin Rodeo');
  assert.match(email.text, /Deal: Austin Rodeo/);
  assert.match(email.text, /Proof round: v2/);
  assert.match(email.text, new RegExp(`https://app\\.hubspot\\.com/contacts/${DEFAULT_PORTAL_ID}/record/0-3/12345`));
  assert.match(email.text, /Proof ready note/);
  assert.equal(email.text.includes('@'), false);
});

test('READY_NOTIFY_EMAIL and HUBSPOT_PORTAL_ID override the defaults', () => {
  const email = buildReadyEmail(
    { dealName: 'Austin Rodeo', round: 4, dealId: '99' },
    { READY_NOTIFY_EMAIL: 'jake.backup@conchousa.com', HUBSPOT_PORTAL_ID: '246719359' }
  );
  assert.equal(email.to, 'jake.backup@conchousa.com');
  assert.match(email.text, /contacts\/246719359\/record\/0-3\/99/);
});

test('a non-numeric portal id falls back to the Concho portal', () => {
  const email = buildReadyEmail({ dealName: 'X', round: 1, dealId: '7' }, { HUBSPOT_PORTAL_ID: 'not-a-portal' });
  assert.match(email.text, new RegExp(`contacts/${DEFAULT_PORTAL_ID}/record/0-3/7`));
});

test('blank deal name and newlines do not break the subject', () => {
  const email = buildReadyEmail({ dealName: '  Hats\nfor\tFriday  ', round: 1, dealId: '1' }, {});
  assert.equal(email.subject, 'Noah has new designs ready: Hats for Friday');
  const untitled = buildReadyEmail({ dealName: '   ', round: 3, dealId: '1' }, {});
  assert.equal(untitled.subject, 'Noah has new designs ready: Untitled deal');
});

test('missing Resend config skips the send and does not throw', async () => {
  let called = false;
  const skippedKey = await sendReadyNotification(
    { dealName: 'Austin Rodeo', round: 1, dealId: '5' },
    { env: { READY_NOTIFY_FROM: baseEnv.READY_NOTIFY_FROM }, fetch: () => { called = true; }, log: silent }
  );
  assert.deepEqual(skippedKey, { ok: false, skipped: true });
  const skippedFrom = await sendReadyNotification(
    { dealName: 'Austin Rodeo', round: 1, dealId: '5' },
    { env: { RESEND_API_KEY: baseEnv.RESEND_API_KEY }, fetch: () => { called = true; }, log: silent }
  );
  assert.deepEqual(skippedFrom, { ok: false, skipped: true });
  assert.equal(called, false);
});

test('a successful send posts only Jake, with no cc or client address', async () => {
  let payload;
  const result = await sendReadyNotification(
    { dealName: 'Austin Rodeo', round: 2, dealId: '12345' },
    {
      env: baseEnv,
      log: silent,
      fetch: async (url, opts) => {
        payload = { url, opts, body: JSON.parse(opts.body) };
        return { ok: true, status: 200, text: async () => JSON.stringify({ id: 'email_1' }) };
      },
    }
  );
  assert.equal(result.ok, true);
  assert.equal(result.id, 'email_1');
  assert.equal(payload.url, 'https://api.resend.com/emails');
  assert.equal(payload.opts.headers.Authorization, 'Bearer re_test_placeholder');
  assert.deepEqual(payload.body.to, ['jake@conchousa.com']);
  assert.equal(payload.body.cc, undefined);
  assert.equal(payload.body.bcc, undefined);
  assert.equal(payload.body.subject, 'Noah has new designs ready: Austin Rodeo');
  assert.match(payload.body.text, /Proof round: v2/);
  assert.match(payload.body.text, /246719359\/record\/0-3\/12345/);
});

test('Resend errors and network failures stay soft', async () => {
  const httpFail = await sendReadyNotification(
    { dealName: 'Austin Rodeo', round: 1, dealId: '5' },
    {
      env: baseEnv,
      log: silent,
      fetch: async () => ({ ok: false, status: 403, text: async () => 'forbidden' }),
    }
  );
  assert.equal(httpFail.ok, false);
  assert.equal(httpFail.skipped, false);
  assert.equal(httpFail.status, 403);

  const thrown = await sendReadyNotification(
    { dealName: 'Austin Rodeo', round: 1, dealId: '5' },
    { env: baseEnv, log: silent, fetch: async () => { throw new Error('socket hang up'); } }
  );
  assert.equal(thrown.ok, false);
  assert.equal(thrown.skipped, false);
  assert.match(thrown.error, /socket hang up/);
});

test('the Ready route emails only after HubSpot work, and a mail throw cannot 502', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const start = src.indexOf("app.post('/api/deal/:id/ready'");
  const end = src.indexOf('const BASE');
  assert.ok(start > 0 && end > start);
  const ready = src.slice(start, end);
  const taskAt = ready.indexOf("done.push('task '");
  const emailAt = ready.indexOf('sendReadyNotification(');
  const jsonAt = ready.indexOf('res.json({ ok: true, round');
  const failAt = ready.lastIndexOf('res.status(502)');
  assert.ok(taskAt > 0 && taskAt < emailAt && emailAt < jsonAt && jsonAt < failAt);
  assert.match(ready.slice(emailAt, jsonAt), /catch\s*\(mailErr\)/);
  assert.match(ready, /sendReadyNotification\(\{ dealName: p\.dealname, round, dealId: id \}\)/);
  assert.equal(ready.includes('associations'), true);
});
