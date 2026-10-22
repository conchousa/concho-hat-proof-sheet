const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const path = require('path');
const TOKEN = process.env.HUBSPOT_PROOF_BUILDER_TOKEN;
const PASS = process.env.PROOF_BUILDER_PASSCODE || '';
const HS = 'https://api.hubapi.com';
const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 40 * 1024 * 1024 } });

const PROPS = ['dealname','amount','hubspot_owner_id','hat_style','hat_fabric','product_quantity','product_quantity_form',
  'expected_delivery_date','event_date_form','date_of_event','closedate','design_round','design_approval_status','designer','companyorganizationevent'];

async function hs(method, url, body, isForm){
  const opts = { method, headers: { Authorization: 'Bearer ' + TOKEN } };
  if (body !== undefined){
    if (isForm) opts.body = body; else { opts.body = JSON.stringify(body); opts.headers['Content-Type'] = 'application/json'; }
  }
  const r = await fetch(HS + url, opts);
  const text = await r.text();
  let j; try { j = text ? JSON.parse(text) : {}; } catch { j = { raw: text }; }
  if (!r.ok){ const e = new Error(`HubSpot ${method} ${url.split('?')[0]} -> ${r.status}: ${j.message || text}`); e.status = r.status; e.body = j; throw e; }
  return j;
}
function auth(req, res, next){
  const p = String(req.get('X-Passcode') || '');
  const a = Buffer.from(p), b = Buffer.from(PASS);
  if (!PASS || a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(401).json({ error: 'Bad passcode' });
  next();
}
const labelCache = {};
async function labels(prop){
  if (!labelCache[prop]){
    const p = await hs('GET', `/crm/v3/properties/deals/${prop}`);
    labelCache[prop] = Object.fromEntries((p.options || []).map(o => [o.value, o.label]));
  }
  return labelCache[prop];
}
function fmtDate(v){
  if (!v) return '';
  const d = /^\d+$/.test(v) ? new Date(+v) : new Date(v);
  if (isNaN(d)) return String(v);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}
async function getDeal(id){
  return hs('GET', `/crm/v3/objects/deals/${id}?properties=${PROPS.join(',')}&associations=contacts,companies`);
}
function validId(req, res){ if (!/^\d+$/.test(req.params.id)){ res.status(400).json({ error: 'Bad deal id' }); return false; } return true; }

app.get('/healthz', (req, res) => res.send('ok'));
app.get('/api/deal/:id', auth, async (req, res) => {
  if (!validId(req, res)) return;
  try{
    const d = await getDeal(req.params.id); const p = d.properties;
    let customer = p.companyorganizationevent || '', contact = '', company = '', warnings = [];
    const cos = d.associations?.companies?.results || [];
    if (cos.length){
      try{ const c = await hs('GET', `/crm/v3/objects/companies/${cos[0].id}?properties=name`); company = c.properties.name || ''; }
      catch(e){ warnings.push(e.message); }
    }
    const cts = d.associations?.contacts?.results || [];
    if (cts.length){
      try{ const c = await hs('GET', `/crm/v3/objects/contacts/${cts[0].id}?properties=firstname,lastname,company`); contact = [c.properties.firstname, c.properties.lastname].filter(Boolean).join(' '); if (!company) company = c.properties.company || ''; }
      catch(e){ warnings.push(e.message); }
    }
    customer = company || customer || contact;
    const [sl, fl] = await Promise.all([labels('hat_style'), labels('hat_fabric')]);
    res.json({ id: d.id, name: p.dealname, customer, company, contact,
      hatStyle: p.hat_style, hatStyleLabel: sl[p.hat_style] || p.hat_style || '',
      hatFabric: p.hat_fabric, hatFabricLabel: fl[p.hat_fabric] || p.hat_fabric || '',
      quantity: p.product_quantity || p.product_quantity_form || '', amount: p.amount || '',
      inHands: fmtDate(p.expected_delivery_date || p.event_date_form || p.date_of_event),
      designRound: +p.design_round || 0, designApprovalStatus: p.design_approval_status || '', warnings });
  }catch(e){ console.error(e.message); res.status(e.status === 404 ? 404 : 502).json({ error: e.message }); }
});

app.post('/api/deal/:id/ready', auth, upload.single('pdf'), async (req, res) => {
  if (!validId(req, res)) return;
  if (!req.file || req.file.mimetype !== 'application/pdf' && !req.file.originalname.endsWith('.pdf')) return res.status(400).json({ error: 'PDF required' });
  const id = req.params.id, done = [];
  try{
    const d = await getDeal(id); const p = d.properties;
    const round = (+p.design_round || 0) + 1;
    const safe = (p.dealname || 'deal').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60);
    const fd = new FormData();
    fd.append('file', new Blob([req.file.buffer], { type: 'application/pdf' }), `${safe}-proof-v${round}.pdf`);
    fd.append('folderPath', '/Proof Builder');
    fd.append('options', JSON.stringify({ access: 'PRIVATE', overwrite: false, duplicateValidationStrategy: 'NONE' }));
    const file = await hs('POST', '/files/v3/files', fd, true); done.push('file ' + file.id);
    const now = new Date().toISOString();
    const note = await hs('POST', '/crm/v3/objects/notes', {
      properties: { hs_timestamp: now, hs_note_body: `<p><strong>Proof v${round} ready</strong></p><p>Mockup proof sheet attached (Concho Proof Builder).</p>`, hs_attachment_ids: String(file.id), ...(p.hubspot_owner_id ? { hubspot_owner_id: p.hubspot_owner_id } : {}) },
      associations: [{ to: { id }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 214 }] }]
    }); done.push('note ' + note.id);
    await hs('PATCH', `/crm/v3/objects/deals/${id}`, { properties: { design_approval_status: 'mockups_sent_to_customer', design_round: String(round) } }); done.push('deal updated');
    const due = new Date(); // due today, 5pm Central
    const ct = new Date(due.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
    const offset = due - ct; const d5 = new Date(ct); d5.setHours(17, 0, 0, 0);
    const task = await hs('POST', '/crm/v3/objects/tasks', {
      properties: { hs_task_subject: `Designs ready: ${p.dealname}`, hs_task_body: `Proof v${round} is attached to the deal. Send mockups to the customer.`, hs_timestamp: new Date(d5.getTime() + offset).toISOString(), hs_task_status: 'NOT_STARTED', hs_task_priority: 'MEDIUM', hs_task_type: 'TODO', ...(p.hubspot_owner_id ? { hubspot_owner_id: p.hubspot_owner_id } : {}) },
      associations: [{ to: { id }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 216 }] }]
    }); done.push('task ' + task.id);
    res.json({ ok: true, round, fileId: file.id, noteId: note.id, taskId: task.id, ownerId: p.hubspot_owner_id || null });
  }catch(e){ console.error(e.message, JSON.stringify(e.body || {})); res.status(502).json({ error: e.message, completed: done }); }
});

app.use(express.static(path.join(__dirname, 'public'), { index: 'index.html' }));
app.listen(process.env.PORT || 3000, () => console.log('proof builder up'));
