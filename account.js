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
  const forms = {}; root.querySelectorAll('form[data-form]').forEach(f => forms[f.dataset.form] = f);
  const TITLES = { login: ['Bienvenue sur PokeWorth', 'Retrouvez votre collection Pokémon et suivez la valeur de vos cartes depuis un seul espace.'],
    signup: ['Créer votre compte', 'Gratuit, sans carte bancaire. Vous pourrez le supprimer à tout moment.'],
    forgot: ['Mot de passe oublié', 'Nous vous envoyons un lien sécurisé par e-mail.'],
    reset: ['Nouveau mot de passe', 'Choisissez un mot de passe d\'au moins ' + PW.MIN_PW + ' caractères.'] };
  let mode = 'login';
  const show = m => {
    mode = m; say('');
    Object.entries(forms).forEach(([k, f]) => f.hidden = k !== m);
    root.querySelectorAll('#pw-seg button').forEach(b => { const on = b.dataset.mode === m; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    $('#pw-seg').hidden = m === 'forgot' || m === 'reset';
    $('#pw-title').textContent = TITLES[m][0]; $('#pw-sub').textContent = TITLES[m][1];
    $('#pw-oauth').hidden = !(m === 'login' || m === 'signup') || !(PW.providers.google || PW.providers.apple);
  };
  root.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => { show(b.dataset.mode); const f = forms[mode]; const i = f && f.querySelector('input'); if (i) i.focus(); }));
  root.querySelectorAll('[data-eye]').forEach(b => b.addEventListener('click', () => {
    const i = document.getElementById(b.dataset.eye), on = i.type === 'password';
    i.type = on ? 'text' : 'password'; b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.setAttribute('aria-label', on ? 'Masquer le mot de passe' : 'Afficher le mot de passe');
  }));
  const btns = [...root.querySelectorAll('[data-prov]')];
  btns.forEach(b => b.hidden = !PW.providers[b.dataset.prov]);
  if (!PW.providers.email && !PW.configured && !(window.PW_TEST_CLIENT)) {
    Object.values(forms).forEach(f => { f.hidden = true; }); $('#pw-seg').hidden = true; $('#pw-off').hidden = false; return;
  }
  if (code) { say(PW.errText(code, desc), true); history.replaceState(null, '', location.pathname + (next ? '?next=' + encodeURIComponent(next) : '')); }
  const hadCode = qs.has('code');
  const recovery = qs.get('mode') === 'reset' || hs.get('type') === 'recovery';
  let u = null;
  try { const c = await PW.client(); await c.auth.getSession(); u = await PW.user(); } catch (e) { if (!code) say('Impossible de joindre le service de connexion. Vérifiez votre connexion et réessayez.', true); }
  if (recovery && u) { show('reset'); }
  else {
    if (u && (hadCode || next || PW.hint())) {
      if (hadCode || next) { location.replace(PW.takeNext() || 'tableau-de-bord.html'); return; }
    }
    if (u) {
      $('#pw-in').hidden = true; const k = $('#pw-already'); k.hidden = false;
      $('#pw-who').textContent = (u.user_metadata && (u.user_metadata.full_name || u.user_metadata.name)) || u.email || 'votre compte';
      $('#pw-out').onclick = async () => { await PW.signOut(); location.reload(); };
      return;
    }
    show(qs.get('mode') === 'signup' ? 'signup' : 'login');
    if (recovery && !u) say('Ce lien de réinitialisation n\'est plus valide. Demandez-en un nouveau.', true);
  }
  if (code) say(PW.errText(code, desc), true);
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const mark = (el, bad) => { if (el) el.setAttribute('aria-invalid', bad ? 'true' : 'false'); };
  const fail = (el, msg) => { mark(el, true); say(msg, true); if (el) el.focus(); return false; };
  const checkPw = (p1, p2) => {
    if (p1.value.length < PW.MIN_PW) return fail(p1, 'Le mot de passe doit contenir au moins ' + PW.MIN_PW + ' caractères.');
    if (p2 && p1.value !== p2.value) return fail(p2, 'Les deux mots de passe ne correspondent pas.');
    return true;
  };
  const run = async (form, job) => {
    const b = form.querySelector('.pw-submit'), l = b.querySelector('.pw-lbl'), t = l.textContent;
    say(''); form.querySelectorAll('input').forEach(i => mark(i, false));
    busy(b, true); l.textContent = 'Un instant…';
    try { await job(); } catch (e) { say(PW.errText(e && (e.code || e.error_code), e && e.message), true); }
    finally { busy(b, false); l.textContent = t; }
  };
  forms.login.addEventListener('submit', ev => { ev.preventDefault();
    const em = forms.login.elements.email, pw = $('#pw-l-pass');
    if (!EMAIL_RE.test(em.value.trim())) return fail(em, 'Saisissez une adresse e-mail valide.');
    if (!pw.value) return fail(pw, 'Saisissez votre mot de passe.');
    run(forms.login, async () => { await PW.signInEmail(em.value.trim(), pw.value); location.replace(PW.takeNext() || 'tableau-de-bord.html'); });
  });
  forms.signup.addEventListener('submit', ev => { ev.preventDefault();
    const em = forms.signup.elements.email, p1 = $('#pw-s-pass'), p2 = $('#pw-s-pass2'), tm = $('#pw-s-terms'), pr = $('#pw-s-promo');
    if (!EMAIL_RE.test(em.value.trim())) return fail(em, 'Saisissez une adresse e-mail valide.');
    if (!checkPw(p1, p2)) return;
    if (!tm.checked) return fail(tm, 'Pour créer un compte, vous devez accepter les conditions d\'utilisation et la politique de confidentialité.');
    run(forms.signup, async () => {
      const d = await PW.signUpEmail(em.value.trim(), p1.value, pr.checked);
      p1.value = p2.value = '';
      if (d && d.session) { location.replace(PW.takeNext() || 'tableau-de-bord.html'); return; }
      /* message identique que l'adresse existe déjà ou non : on ne révèle pas quels comptes existent */
      say('Si cette adresse peut être utilisée, un e-mail de confirmation vient de vous être envoyé. Ouvrez-le pour activer votre compte (pensez à vérifier vos courriers indésirables).');
      forms.signup.reset();
    });
  });
  forms.forgot.addEventListener('submit', ev => { ev.preventDefault();
    const em = forms.forgot.elements.email;
    if (!EMAIL_RE.test(em.value.trim())) return fail(em, 'Saisissez une adresse e-mail valide.');
    run(forms.forgot, async () => { await PW.resetRequest(em.value.trim()); say('Si un compte existe pour cette adresse, un e-mail contenant un lien de réinitialisation vient d\'être envoyé.'); });
  });
  forms.reset.addEventListener('submit', ev => { ev.preventDefault();
    const p1 = $('#pw-r-pass'), p2 = $('#pw-r-pass2');
    if (!checkPw(p1, p2)) return;
    run(forms.reset, async () => { await PW.updatePassword(p1.value); p1.value = p2.value = ''; say('Votre mot de passe a été modifié. Redirection…'); setTimeout(() => location.replace('tableau-de-bord.html'), 900); });
  });
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
