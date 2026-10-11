/* PokeWorth · pages de compte : connexion, tableau de bord, paramètres.
   Les droits sont appliqués par la base (RLS) : ce script ne fait que demander ses propres données avec la session de l'utilisateur. */
(() => {
'use strict';
const root = document.getElementById('pw-page'); if (!root) return;
const page = root.dataset.page;
const $ = (s, r = root) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const NUM = new Intl.NumberFormat('fr-FR');
const EUR = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const USD = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'USD' });
const fD = t => { try { return new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }); } catch (e) { return '—'; } };
const PROV = { google: 'Google', apple: 'Apple', email: 'E-mail' };
const say = (m, bad) => { const s = $('#pw-msg'); if (s) { s.textContent = m || ''; s.className = 'pw-msg' + (bad ? ' bad' : ''); s.hidden = !m; } };
const busy = (b, on) => { if (b) { b.disabled = on; b.setAttribute('aria-busy', on ? 'true' : 'false'); } };

async function all(c, table, cols, order) { // lit toutes les lignes de l'utilisateur (pages de 1000)
  const out = [];
  for (let from = 0; ; from += 1000) {
    let q = c.from(table).select(cols); if (order) q = q.order(order);
    const { data, error } = await q.range(from, from + 999);
    if (error) throw error;
    out.push(...data); if (data.length < 1000) break;
  }
  return out;
}

/* ------------------------------------------------------------------ connexion */
async function connexion() {
  const qs = new URLSearchParams(location.search), hs = new URLSearchParams(location.hash.replace(/^#/, ''));
  const next = PW.safeNext(qs.get('next') || '');
  if (next) PW.setNext(next);
  const code = qs.get('error_code') || hs.get('error_code') || qs.get('error') || hs.get('error');
  const desc = qs.get('error_description') || hs.get('error_description');
  const btns = [...root.querySelectorAll('[data-prov]')];
  if (!PW.configured && !(window.PW_TEST_CLIENT)) {
    btns.forEach(b => b.disabled = true);
    $('#pw-off').hidden = false; return;
  }
  if (code) { say(PW.errText(code, desc), true); history.replaceState(null, '', location.pathname + (next ? '?next=' + encodeURIComponent(next) : '')); }
  const hadCode = qs.has('code');
  let u = null;
  try { const c = await PW.client(); await c.auth.getSession(); u = await PW.user(); } catch (e) { if (!code) say('Impossible de joindre le service de connexion. Vérifiez votre connexion et réessayez.', true); }
  if (u && (hadCode || next || PW.hint())) {
    if (hadCode || next) { location.replace(PW.takeNext() || 'tableau-de-bord.html'); return; }
  }
  if (u) {
    $('#pw-in').hidden = true; const k = $('#pw-already'); k.hidden = false;
    $('#pw-who').textContent = (u.user_metadata && (u.user_metadata.full_name || u.user_metadata.name)) || u.email || 'votre compte';
    $('#pw-out').onclick = async () => { await PW.signOut(); location.reload(); };
    return;
  }
  btns.forEach(b => b.addEventListener('click', async () => {
    say(''); busy(b, true);
    try { await PW.signIn(b.dataset.prov, next); }
    catch (e) { busy(b, false); say(PW.errText(e && (e.code || e.error_code), e && e.message), true); }
  }));
}

/* ------------------------------------------------------------------ tableau de bord */
async function dashboard() {
  const u = await PW.require(); if (!u) return;
  const c = await PW.client();
  const m = u.user_metadata || {};
  $('#pw-hello').textContent = 'Bonjour' + ((m.full_name || m.name) ? ' ' + String(m.full_name || m.name).split(' ')[0] : '');
  try {
    const [items, wish, snaps] = await Promise.all([
      all(c, 'collection_items', 'card_id,qty,price_paid,created_at', 'created_at'),
      all(c, 'wishlist', 'card_id'),
      c.from('value_snapshots').select('d,eur,usd,cards').order('d', { ascending: false }).limit(2).then(r => { if (r.error) throw r.error; return r.data; })
    ]);
    const cards = items.reduce((s, x) => s + x.qty, 0), distinct = new Set(items.map(x => x.card_id)).size;
    const cost = items.reduce((s, x) => s + (x.price_paid != null ? x.price_paid * x.qty : 0), 0);
    const paid = items.filter(x => x.price_paid != null).length;
    const last = snaps[0];
    const k = (l, v, s) => `<div class="card wp-kpi"><span>${l}</span><b>${v}</b>${s ? `<small>${s}</small>` : ''}</div>`;
    $('#pw-kpis').innerHTML = [
      k('Cartes possédées', NUM.format(cards), distinct ? NUM.format(distinct) + ' différente' + (distinct > 1 ? 's' : '') : ''),
      k('Dernière valeur estimée', last && last.eur != null ? EUR.format(last.eur) : '—', last ? 'Cardmarket · relevé du ' + fD(last.d) : 'Ouvrez Ma collection puis « Actualiser les prix »'),
      k('Valeur TCGplayer', last && last.usd != null ? USD.format(last.usd) : '—', last ? 'En dollars, non converti' : ''),
      k('Prix d\'achat renseignés', paid ? EUR.format(cost) : '—', paid ? paid + ' ligne' + (paid > 1 ? 's' : '') : 'Aucun'),
      k('Cartes souhaitées', NUM.format(wish.length), '')
    ].join('');
    const rec = items.slice(-6).reverse();
    $('#pw-recent').innerHTML = rec.length ? rec.map(x => `<li><a href="catalogue.html#/carte/${encodeURIComponent(x.card_id)}"><b>${esc(x.card_id)}</b></a> <span>×${x.qty} · ajoutée le ${fD(x.created_at)}</span></li>`).join('') : '<li class="note">Aucune carte pour le moment. <a href="catalogue.html">Parcourez le catalogue</a> pour commencer votre collection.</li>';
    $('#pw-loading').hidden = true; $('#pw-dash').hidden = false;
  } catch (e) { $('#pw-loading').hidden = true; say('Impossible de charger vos statistiques : ' + (e.message || e), true); }
}

/* ------------------------------------------------------------------ paramètres */
function dropCache(id) { // efface le cache local lié à ce compte (les données locales d'avant la connexion ne sont jamais touchées)
  return new Promise(res => { try { const r = indexedDB.open('pokeworth-webapp', 1); r.onsuccess = () => { try { const t = r.result.transaction('kv', 'readwrite'); t.objectStore('kv').delete('state:' + id); t.oncomplete = t.onerror = () => res(); } catch (e) { res(); } }; r.onerror = () => res(); r.onupgradeneeded = () => { try { r.result.createObjectStore('kv'); } catch (e) { /* rien */ } }; } catch (e) { res(); } });
}
async function settings() {
  const u = await PW.require(); if (!u) return;
  const c = await PW.client();
  const qs = new URLSearchParams(location.search), hs = new URLSearchParams(location.hash.replace(/^#/, ''));
  const ec = qs.get('error_code') || hs.get('error_code'); if (ec) { say(PW.errText(ec, qs.get('error_description') || hs.get('error_description')), true); history.replaceState(null, '', location.pathname); }
  $('#pw-email').textContent = u.email || '(adresse masquée par le fournisseur)';
  const prof = await c.from('profiles').select('display_name').eq('id', u.id).maybeSingle();
  $('#pw-name').value = (prof.data && prof.data.display_name) || '';
  async function ids() {
    const r = await c.auth.getUserIdentities(); const list = (r.data && r.data.identities) || [];
    $('#pw-ids').innerHTML = list.map(i => `<li><b>${esc(PROV[i.provider] || i.provider)}</b> <span>${esc((i.identity_data && i.identity_data.email) || '')}</span></li>`).join('') || '<li class="note">—</li>';
    ['google', 'apple'].forEach(p => { const b = $('[data-link="' + p + '"]'); if (b) b.hidden = list.some(i => i.provider === p); });
  }
  await ids();
  $('#pw-saveName').onclick = async ev => {
    const b = ev.currentTarget; busy(b, true); say('');
    const v = $('#pw-name').value.trim().slice(0, 80);
    const { error } = await c.from('profiles').update({ display_name: v || null }).eq('id', u.id);
    busy(b, false); say(error ? 'Enregistrement impossible : ' + error.message : 'Nom enregistré.', !!error);
  };
  root.querySelectorAll('[data-link]').forEach(b => b.onclick = async () => { busy(b, true); say(''); try { await PW.link(b.dataset.link); } catch (e) { busy(b, false); say(PW.errText(e && (e.code || e.error_code), e && e.message), true); } });
  $('#pw-out').onclick = async () => { await PW.signOut(); location.href = 'index.html'; };
  $('#pw-outall').onclick = async () => { if (!confirm('Se déconnecter de tous vos appareils ?')) return; await PW.signOut('global'); location.href = 'index.html'; };
  $('#pw-export').onclick = async ev => {
    const b = ev.currentTarget; busy(b, true); say('');
    try {
      const [items, wish, snaps, prof2] = await Promise.all([all(c, 'collection_items', '*', 'created_at'), all(c, 'wishlist', '*'), all(c, 'value_snapshots', '*', 'd'), c.from('profiles').select('*').eq('id', u.id).maybeSingle()]);
      const blob = new Blob([JSON.stringify({ app: 'pokeworth-account-export', exportedAt: new Date().toISOString(), user: { id: u.id, email: u.email, providers: (u.app_metadata && u.app_metadata.providers) || [] }, profile: prof2.data, collection_items: items, wishlist: wish, value_snapshots: snaps }, null, 1)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'pokeworth-mes-donnees-' + new Date().toISOString().slice(0, 10) + '.json'; document.body.appendChild(a); a.click(); a.remove();
      say('Vos données ont été téléchargées.');
    } catch (e) { say('Export impossible : ' + (e.message || e), true); }
    busy(b, false);
  };
  $('#pw-del').onclick = () => { $('#pw-delbox').hidden = false; $('#pw-delconf').focus(); };
  $('#pw-delcancel').onclick = () => { $('#pw-delbox').hidden = true; $('#pw-delconf').value = ''; };
  $('#pw-delconf').oninput = e => { $('#pw-delgo').disabled = e.target.value.trim() !== 'SUPPRIMER'; };
  $('#pw-delgo').onclick = async ev => {
    const b = ev.currentTarget; busy(b, true); say('');
    const { error } = await c.rpc('delete_my_account');
    if (error) { busy(b, false); say('Suppression impossible : ' + error.message, true); return; }
    await dropCache(u.id);
    await PW.signOut();
    location.href = 'index.html?compte=supprime';
  };
  $('#pw-loading').hidden = true; $('#pw-set').hidden = false;
}

({ connexion, dashboard, parametres: settings })[page]().catch(e => { const l = $('#pw-loading'); if (l) l.hidden = true; say('Une erreur est survenue : ' + (e && e.message || e), true); });
})();
