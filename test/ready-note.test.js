const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { JAKE_OWNER_ID, JAKE_NAME, hubspotMention, readyNoteBody, readyNoteProperties } = require('../lib/ready-note');

const CHIP = '<span data-mention-id="95247148" data-mention-name="Jake Connell" style="color: #425b76;font-weight: 600;">@Jake Connell</span>';

test('mention markup matches CRM_UI notes for Jake Connell', () => {
  assert.equal(JAKE_OWNER_ID, '95247148');
  assert.equal(JAKE_NAME, 'Jake Connell');
  assert.equal(hubspotMention(JAKE_OWNER_ID, JAKE_NAME), CHIP);
});

test('the Ready note names the round and mentions only Jake', () => {
  const html = readyNoteBody(3);
  assert.match(html, /<strong>Proof v3 ready<\/strong>/);
  assert.equal(html.includes(CHIP), true);
  assert.match(html, /Mockup proof sheet attached/);
  assert.equal((html.match(/data-mention-id=/g) || []).length, 1);
  assert.equal(html.includes('@'), true);
  assert.equal(html.includes('jake@'), false);
});

test('note properties record the mention owner id and keep the deal owner', () => {
  const props = readyNoteProperties({ round: 2, fileId: '99', timestamp: '2026-11-03T00:00:00.000Z', dealOwnerId: '166143545' });
  assert.equal(props.hs_at_mentioned_owner_ids, '95247148');
  assert.equal(props.hubspot_owner_id, '166143545');
  assert.equal(props.hs_attachment_ids, '99');
  assert.match(props.hs_note_body, /data-mention-id="95247148"/);
  const unowned = readyNoteProperties({ round: 1, fileId: 5, timestamp: 't' });
  assert.equal(unowned.hubspot_owner_id, undefined);
});

test('Ready mentions Jake on the note and assigns the task to him', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const start = src.indexOf("app.post('/api/deal/:id/ready'");
  const end = src.indexOf('const BASE');
  const ready = src.slice(start, end);
  const taskStart = ready.indexOf("'/crm/v3/objects/tasks'");
  const task = ready.slice(taskStart, ready.indexOf("done.push('task '"));
  assert.match(ready, /readyNoteProperties\(\{ round, fileId: file\.id/);
  assert.match(ready, /hs_at_mentioned_owner_ids/);
  assert.match(task, /hubspot_owner_id: JAKE_OWNER_ID/);
  assert.equal(task.includes('p.hubspot_owner_id'), false);
});
