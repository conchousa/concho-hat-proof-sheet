(function(){
  const params = new URLSearchParams(location.search);
  const dealId = params.get('deal');
  if (!dealId || !/^\d+$/.test(dealId)) return;
  const KEY = 'conchoProofPasscode';
  let deal = null;
  function pass(force){
    let p = !force && localStorage.getItem(KEY);
    if (!p){ p = prompt('Enter the Concho proof builder passcode'); if (!p) return null; localStorage.setItem(KEY, p); }
    return p;
  }
  async function api(path, opts, retry){
    const p = pass(retry); if (!p) throw new Error('Passcode required');
    opts = opts || {}; opts.headers = Object.assign({'X-Passcode': p}, opts.headers || {});
    const r = await fetch(path, opts);
    if (r.status === 401 && !retry){ localStorage.removeItem(KEY); return api(path, opts, true); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
    return j;
  }
  window.__dealBoot = async function(){
    deal = await api('/api/deal/' + dealId);
    const bits = [deal.hatStyleLabel, deal.hatFabricLabel, deal.quantity ? ('Qty ' + deal.quantity) : '', deal.inHands ? ('In hands ' + deal.inHands) : ''].filter(Boolean);
    await window.__proof.openDeal(dealId, {
      name: deal.name,
      title: 'Custom hats' + (deal.customer ? ' · ' + deal.customer : ''),
      footer: 'Concho USA · support@conchousa.com' + (bits.length ? ' · ' + bits.join(' · ') : '')
    });
    const b = document.getElementById('readyBtn'); b.hidden = false;
    b.title = 'Upload this proof to HubSpot deal "' + deal.name + '"';
    b.addEventListener('click', ready);
  };
  let busy = false;
  async function ready(){
    const P = window.__proof, st = P.getState();
    if (busy || !st) return;
    if (!st.hats.length){ P.toast('Add designs before sending.'); return; }
    if (!confirm('Send this proof to HubSpot deal "' + deal.name + '"? This attaches the PDF, marks mockups sent, bumps the design round, and creates a task for the deal owner.')) return;
    busy = true;
    try{
      const blob = await P.buildPdf();
      if (!blob) return;
      const fd = new FormData();
      fd.append('pdf', blob, 'concho-' + P.slug(st.name) + '-proof.pdf');
      const r = await api('/api/deal/' + dealId + '/ready', {method:'POST', body: fd});
      P.toast('Proof v' + r.round + ' sent to HubSpot');
    }catch(e){ console.error(e); alert('HubSpot update failed: ' + e.message); }
    finally{ busy = false; }
  }
})();
