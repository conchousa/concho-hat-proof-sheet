// Email Jake when Ready succeeds. Missing config and send errors are logged
// and returned; this module never throws, so the Ready response can still succeed.

const RESEND_URL = 'https://api.resend.com/emails';
const DEFAULT_TO = 'jake@conchousa.com';
const DEFAULT_PORTAL_ID = '246719359';
const SEND_TIMEOUT_MS = 8000;

function notifyConfig(env) {
  const to = String(env.READY_NOTIFY_EMAIL || DEFAULT_TO).trim() || DEFAULT_TO;
  const from = String(env.READY_NOTIFY_FROM || '').trim();
  const portalRaw = String(env.HUBSPOT_PORTAL_ID || '').trim();
  const portalId = /^\d+$/.test(portalRaw) ? portalRaw : DEFAULT_PORTAL_ID;
  return {
    to,
    from,
    apiKey: String(env.RESEND_API_KEY || '').trim(),
    portalId,
  };
}

function dealName(value) {
  const name = String(value || '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
  return name || 'Untitled deal';
}

function dealLink(portalId, dealId) {
  return `https://app.hubspot.com/contacts/${portalId}/record/0-3/${encodeURIComponent(String(dealId))}`;
}

function buildReadyEmail(info, env = process.env) {
  const cfg = notifyConfig(env);
  const name = dealName(info.dealName);
  const round = info.round;
  const link = dealLink(cfg.portalId, info.dealId);
  return {
    from: cfg.from,
    to: cfg.to,
    subject: `Noah has new designs ready: ${name}`,
    text: [
      `Deal: ${name}`,
      `Proof round: v${round}`,
      `HubSpot deal: ${link}`,
      '',
      'The proof PDF is attached to the Proof ready note on this deal.',
    ].join('\n'),
  };
}

async function sendReadyNotification(info, options = {}) {
  const env = options.env || process.env;
  const log = options.log || console;
  const doFetch = options.fetch || globalThis.fetch;
  const email = buildReadyEmail(info, env);
  const apiKey = notifyConfig(env).apiKey;
  if (!apiKey || !email.from) {
    log.warn(`Ready email skipped (set RESEND_API_KEY and READY_NOTIFY_FROM). Would have sent "${email.subject}" to ${email.to}`);
    return { ok: false, skipped: true };
  }
  try {
    const r = await doFetch(RESEND_URL, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: email.from,
        to: [email.to],
        subject: email.subject,
        text: email.text,
      }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    const body = await r.text();
    if (!r.ok) {
      log.error(`Ready email failed: Resend ${r.status}: ${body.slice(0, 500)}`);
      return { ok: false, skipped: false, status: r.status };
    }
    let id = '';
    try { id = JSON.parse(body).id || ''; } catch { /* id is only for the log */ }
    log.log(`Ready email sent to ${email.to}${id ? ' (' + id + ')' : ''}`);
    return { ok: true, skipped: false, id };
  } catch (e) {
    log.error('Ready email failed:', e && e.message ? e.message : e);
    return { ok: false, skipped: false, error: e && e.message ? e.message : String(e) };
  }
}

module.exports = { buildReadyEmail, sendReadyNotification, DEFAULT_TO, DEFAULT_PORTAL_ID };
