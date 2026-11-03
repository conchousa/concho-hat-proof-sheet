// Mention chip copied from CRM_UI notes in portal 246719359 (owner Jake Connell).
// HubSpot stores @mentions as this span, and records the owner id on
// hs_at_mentioned_owner_ids ("At-Mentioned Owner Ids").

const JAKE_OWNER_ID = '95247148';
const JAKE_NAME = 'Jake Connell';

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function hubspotMention(ownerId, name) {
  const id = String(ownerId).replace(/\D/g, '');
  const safe = escapeHtml(name);
  return `<span data-mention-id="${id}" data-mention-name="${safe}" style="color: #425b76;font-weight: 600;">@${safe}</span>`;
}

function readyNoteBody(round, mention = { id: JAKE_OWNER_ID, name: JAKE_NAME }) {
  const n = String(round).replace(/\D/g, '') || '?';
  const chip = hubspotMention(mention.id, mention.name);
  return `<div style="" dir="auto" data-top-level="true"><p style="margin:0;"><strong>Proof v${n} ready</strong></p><p style="margin:0;">${chip} Mockup proof sheet attached (Concho Proof Builder).</p></div>`;
}

function readyNoteProperties({ round, fileId, timestamp, dealOwnerId }) {
  const properties = {
    hs_timestamp: timestamp,
    hs_note_body: readyNoteBody(round),
    hs_attachment_ids: String(fileId),
    hs_at_mentioned_owner_ids: JAKE_OWNER_ID,
  };
  if (dealOwnerId) properties.hubspot_owner_id = String(dealOwnerId);
  return properties;
}

module.exports = { JAKE_OWNER_ID, JAKE_NAME, hubspotMention, readyNoteBody, readyNoteProperties };
