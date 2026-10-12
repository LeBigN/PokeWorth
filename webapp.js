/* PokeWorth · Web App — catalogue de cartes, collection, prix Cardmarket / TCGplayer (v1)
   Tout fonctionne dans le navigateur : aucune donnée n'est envoyée à PokeWorth.
   Cartes et prix : API publique TCGdex (https://api.tcgdex.net/v2). La collection est enregistrée sur l'appareil
   (IndexedDB, avec repli sur localStorage) et peut être exportée / importée. */
(() => {
'use strict';

/* ------------------------------------------------------------------ utilitaires */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const EUR = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const USD = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'USD' });
const NUM = new Intl.NumberFormat('fr-FR');
const PCT = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1, signDisplay: 'exceptZero' });
const fE = v => (v == null || isNaN(v)) ? '—' : EUR.format(v);
const fU = v => (v == null || isNaN(v)) ? '—' : USD.format(v);
const fD = t => { try { return new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }); } catch (e) { return '—'; } };
const fDT = t => { try { return new Date(t).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch (e) { return '—'; } };
const day = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
const uid = () => (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const num = v => { const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : null; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const LANGS = { fr: 'Français', en: 'Anglais', ja: 'Japonais', de: 'Allemand', es: 'Espagnol', it: 'Italien', pt: 'Portugais', ko: 'Coréen', 'zh-tw': 'Chinois' };
const CONDS = [['M', 'Mint'], ['NM', 'Near Mint'], ['EX', 'Excellent'], ['GD', 'Good'], ['LP', 'Light Played'], ['PL', 'Played'], ['PO', 'Poor']];
const FINISH = { normal: 'Normale', reverse: 'Reverse', holo: 'Holo', firstEdition: '1re édition' };

/* ------------------------------------------------------------------ API TCGdex */
const API = (() => {
  const def = 'https://api.tcgdex.net/v2';
  // l'adresse peut être remplacée uniquement en local (tests) : ?api=http://localhost:9000
  if (['localhost', '127.0.0.1'].includes(location.hostname)) {
    const q = new URLSearchParams(location.search).get('api');
    if (q) return q.replace(/\/$/, '');
  }
  return def;
})();
const mem = new Map();
async function api(path, { ttl = 0, lang = true } = {}) {
  const url = API + (lang ? '/' + S.lang : '') + path;
  if (mem.has(url)) return mem.get(url);
  if (ttl) {
    try {
      const c = JSON.parse(localStorage.getItem('pw_c:' + url) || 'null');
      if (c && Date.now() - c.t < ttl) { mem.set(url, c.d); return c.d; }
    } catch (e) { /* cache indisponible */ }
  }
  let err;
  for (let i = 0; i < 2; i++) {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 20000);
    try {
      const r = await fetch(url, { signal: ctl.signal, headers: { Accept: 'application/json' } });
      clearTimeout(to);
      if (r.status === 404) { const e = new Error('Introuvable'); e.status = 404; throw e; }
      if (!r.ok) throw new Error('Le service TCGdex a répondu ' + r.status);
      const d = await r.json();
      mem.set(url, d);
      if (ttl) { try { localStorage.setItem('pw_c:' + url, JSON.stringify({ t: Date.now(), d })); } catch (e) { /* quota */ } }
      return d;
    } catch (e) {
      clearTimeout(to);
      err = e;
      if (e.status === 404) break;
      await sleep(600);
    }
  }
  throw err && err.name === 'AbortError' ? new Error('Le service TCGdex met trop de temps à répondre.') : (err || new Error('Erreur réseau'));
}
async function pool(items, n, fn) {
  let i = 0, done = 0;
  const run = async () => { while (i < items.length) { const k = i++; try { await fn(items[k], k); } catch (e) { /* ignoré, compté par l'appelant */ } done++; } };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, run));
  return done;
}
const imgUrl = (base, q = 'low') => base ? (/\.(webp|png|jpg)$/.test(base) ? base : `${base}/${q}.webp`) : '';
const logoUrl = base => base ? (/\.(webp|png|jpg)$/.test(base) ? base : base + '.webp') : '';

/* ------------------------------------------------------------------ stockage local */
const DEF = () => ({ v: 1, lang: 'fr', view: 'grid', lots: [], cards: {}, wish: [], snaps: {}, totals: [], lastRefresh: null, sh: null, legacyDone: false });
let S = DEF();
let persist = 'idb';
const IDB = {
  db: null,
  open() {
    return new Promise((res, rej) => {
      try {
        const r = indexedDB.open('pokeworth-webapp', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('kv');
        r.onsuccess = () => { IDB.db = r.result; res(); };
        r.onerror = () => rej(r.error);
      } catch (e) { rej(e); }
    });
  },
  get(k) { return new Promise((res, rej) => { const q = IDB.db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); },
  set(k, v) { return new Promise((res, rej) => { const t = IDB.db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = () => res(); t.onerror = () => rej(t.error); }); }
};
/* Sans compte (ou connexion non configurée) : clé « state » = mode local historique, jamais modifiée par la connexion.
   Avec compte : « state:<id> » = cache de cet utilisateur (la source de vérité de la collection est le serveur). */
let cloud = null, guest = false;
const skey = () => cloud ? 'state:' + cloud.u.id : 'state';
const lskey = () => cloud ? 'pw_state:' + cloud.u.id : 'pw_state';
async function readKey(k) {
  if (persist === 'idb') { try { return await IDB.get(k); } catch (e) { return null; } }
  try { return JSON.parse(localStorage.getItem('pw_' + k) || 'null'); } catch (e) { return null; }
}
async function load() {
  let d = null;
  try { await IDB.open(); d = await IDB.get(skey()); }
  catch (e) {
    persist = 'ls';
    try { d = JSON.parse(localStorage.getItem(lskey()) || 'null'); } catch (e2) { persist = 'none'; }
  }
  if (d && typeof d === 'object') S = Object.assign(DEF(), d);
}
function writeNow() {
  try {
    if (persist === 'idb' && IDB.db) return IDB.set(skey(), S);
    if (persist === 'ls') localStorage.setItem(lskey(), JSON.stringify(S));
  } catch (e) { /* rien */ }
}
let saveT = null, ver = 0;
function save() {
  ver++; aggCache = null;
  clearTimeout(saveT);
  saveT = setTimeout(async () => {
    try { await writeNow(); } catch (e) { persist = 'none'; banner(); }
  }, 250);
  if (cloud) schedSync();
}
addEventListener('pagehide', () => { writeNow(); });

/* ------------------------------------------------------------------ calculs de prix et de collection */
function cmPrice(card, finish) {
  const p = card && card.pricing && card.pricing.cardmarket;
  if (!p) return null;
  const v = finish === 'normal' ? (p.trend ?? p.avg ?? null) : (p['trend-holo'] ?? p['avg-holo'] ?? null);
  return typeof v === 'number' ? v : null;
}
function tcgPrice(card, finish) {
  const t = card && card.pricing && card.pricing.tcgplayer;
  if (!t) return null;
  const f = t[finish === 'firstEdition' ? '1stEdition' : finish];
  const v = f && (f.marketPrice ?? f.midPrice ?? null);
  return typeof v === 'number' ? v : null;
}
function cmVariation(card, finish) { // tendance comparée à la moyenne 30 j et 7 j (Cardmarket)
  const p = card && card.pricing && card.pricing.cardmarket;
  if (!p) return null;
  const sfx = finish === 'normal' ? '' : '-holo';
  const t = p['trend' + sfx], a7 = p['avg7' + sfx], a30 = p['avg30' + sfx];
  const pct = (a, b) => (typeof a === 'number' && typeof b === 'number' && b > 0) ? (a - b) / b * 100 : null;
  return { d7: pct(t, a7), d30: pct(t, a30) };
}
let aggCache = null;
function agg() {
  if (aggCache && aggCache.ver === ver) return aggCache.m;
  const m = new Map();
  for (const l of S.lots) {
    let e = m.get(l.cardId);
    if (!e) { e = { cardId: l.cardId, card: S.cards[l.cardId] || { id: l.cardId, name: l.cardId }, qty: 0, lots: [], eur: 0, usd: 0, noPrice: 0, cost: 0, gain: 0, gainQty: 0, added: 0 }; m.set(l.cardId, e); }
    e.lots.push(l); e.qty += l.qty; e.added = Math.max(e.added, l.added || 0);
    const pe = cmPrice(e.card, l.finish), pu = tcgPrice(e.card, l.finish);
    if (pe != null) e.eur += pe * l.qty; else e.noPrice += l.qty;
    if (pu != null) e.usd += pu * l.qty;
    if (l.price != null) { e.cost += l.price * l.qty; if (pe != null) { e.gain += (pe - l.price) * l.qty; e.gainQty += l.qty; } }
  }
  aggCache = { ver, m };
  return m;
}
function totals() {
  const m = agg();
  const t = { cards: 0, distinct: m.size, dups: 0, dupCards: 0, eur: 0, usd: 0, noPrice: 0, cost: 0, gain: 0, gainQty: 0, sets: new Set() };
  m.forEach(e => {
    t.cards += e.qty; if (e.qty > 1) { t.dups += e.qty - 1; t.dupCards++; }
    t.eur += e.eur; t.usd += e.usd; t.noPrice += e.noPrice; t.cost += e.cost; t.gain += e.gain; t.gainQty += e.gainQty;
    if (e.card.setId) t.sets.add(e.card.setId);
  });
  return t;
}
function metaFrom(c) {
  const set = c.set || {};
  return {
    id: c.id, name: c.name, image: c.image, localId: c.localId, rarity: c.rarity, variants: c.variants || null,
    setId: set.id, setName: set.name, setTotal: set.cardCount && (set.cardCount.official ?? set.cardCount.total), setLogo: set.logo,
    category: c.category, types: c.types, hp: c.hp, illustrator: c.illustrator, lang: S.lang,
    pricing: c.pricing || null, pricedAt: Date.now()
  };
}
function pushSnap(id, meta) {
  const p = meta.pricing; if (!p) return;
  const cm = p.cardmarket || {}, tp = p.tcgplayer || {};
  const row = { d: day(), cm: cm.trend ?? cm.avg ?? null, cmh: cm['trend-holo'] ?? cm['avg-holo'] ?? null, tn: tp.normal && tp.normal.marketPrice != null ? tp.normal.marketPrice : null, tr: tp.reverse && tp.reverse.marketPrice != null ? tp.reverse.marketPrice : null, th: tp.holo && tp.holo.marketPrice != null ? tp.holo.marketPrice : null };
  if (row.cm == null && row.cmh == null && row.tn == null && row.tr == null && row.th == null) return;
  const a = S.snaps[id] || (S.snaps[id] = []);
  if (a.length && a[a.length - 1].d === row.d) a[a.length - 1] = row; else a.push(row);
  if (a.length > 800) a.splice(0, a.length - 800);
}
async function hydrate(id) { // récupère le détail d'une carte (infos + prix) et le mémorise
  const c = await api('/cards/' + encodeURIComponent(id));
  const m = metaFrom(c);
  S.cards[id] = m; pushSnap(id, m); save();
  return m;
}

/* ------------------------------------------------------------------ actions sur la collection */
function addLot(meta, f = {}) {
  if (!S.cards[meta.id] || !S.cards[meta.id].pricedAt) S.cards[meta.id] = Object.assign({}, S.cards[meta.id] || {}, meta);
  const lot = {
    id: uid(), cardId: meta.id, qty: Math.max(1, Math.min(9999, parseInt(f.qty) || 1)), lang: f.lang || S.lang,
    finish: f.finish || firstFinish(S.cards[meta.id]), cond: f.cond || 'NM', price: num(f.price), date: f.date || null, added: Date.now()
  };
  // une même ligne (même carte, langue, finition, état, prix, date) est regroupée pour éviter les doublons involontaires
  const twin = S.lots.find(l => l.cardId === lot.cardId && l.lang === lot.lang && l.finish === lot.finish && l.cond === lot.cond && l.price === lot.price && l.date === lot.date);
  if (twin) { twin.qty = Math.min(9999, twin.qty + lot.qty); twin.added = Date.now(); } else S.lots.push(lot);
  const w = S.wish.indexOf(meta.id); if (w >= 0) S.wish.splice(w, 1);
  save();
  if (!S.cards[meta.id].pricing) hydrate(meta.id).then(() => { if (/^(collection|valeur|carte)$/.test(route().parts[0] || '')) render(); }).catch(() => { });
}
function firstFinish(c) {
  const v = c && c.variants;
  if (!v) return 'normal';
  return v.normal ? 'normal' : v.reverse ? 'reverse' : v.holo ? 'holo' : v.firstEdition ? 'firstEdition' : 'normal';
}
function finishesOf(c) {
  const v = c && c.variants, o = [];
  if (!v) return ['normal', 'reverse', 'holo'];
  ['normal', 'reverse', 'holo', 'firstEdition'].forEach(k => { if (v[k]) o.push(k); });
  return o.length ? o : ['normal'];
}

/* ------------------------------------------------------------------ compte et synchronisation (Supabase)
   Les droits sont appliqués par la base : chaque requête part avec la session de l'utilisateur, et les règles RLS
   n'autorisent que ses propres lignes. Ici : copie locale (cache hors ligne) + envoi des différences. */
const lotSig = l => [l.cardId, l.qty, l.lang, l.finish, l.cond, l.price == null ? '' : l.price, l.date || ''].join('|');
const rowSig = r => [r.card_id, r.qty, r.lang, r.finish, r.condition, r.price_paid == null ? '' : Number(r.price_paid), r.acquired_on || ''].join('|');
const lotRow = l => ({ id: l.id, user_id: cloud.u.id, card_id: l.cardId, qty: Math.max(1, Math.min(9999, l.qty | 0 || 1)), lang: String(l.lang || 'fr').slice(0, 8), finish: ['normal', 'reverse', 'holo', 'firstEdition'].includes(l.finish) ? l.finish : 'normal', condition: CONDS.some(c => c[0] === l.cond) ? l.cond : 'NM', price_paid: l.price == null ? null : Math.round(l.price * 100) / 100, acquired_on: l.date || null });
const rowLot = r => ({ id: r.id, cardId: r.card_id, qty: r.qty, lang: r.lang, finish: r.finish, cond: r.condition, price: r.price_paid == null ? null : Number(r.price_paid), date: r.acquired_on || null, added: Date.parse(r.created_at) || Date.now() });
const totSig = t => [t.eur ?? '', t.usd ?? '', t.n ?? 0].join('|');
let syncing = false, syncT = null, syncState = 'ok', syncMsg = '', lastSync = null, retryT = null;
function setSync(st, msg) {
  syncState = st; syncMsg = msg || '';
  const el = $('#wp-sync'); if (!el) return;
  el.hidden = !cloud; el.className = st === 'error' ? 'bad' : '';
  el.innerHTML = st === 'pending' ? 'Synchronisation avec votre compte…'
    : st === 'error' ? `Synchronisation impossible (${esc(msg || 'réseau')}). Vos modifications sont conservées sur cet appareil et seront renvoyées automatiquement. <button class="wp-link" data-act="syncnow">Réessayer</button>`
    : 'Collection synchronisée avec votre compte' + (lastSync ? ' · ' + fDT(lastSync) : '') + '.';
}
function shadow() { if (!S.sh) S.sh = { lots: {}, wish: [], tot: {} }; return S.sh; }
function diff() {
  const sh = shadow(), up = [], del = [], now = new Set();
  S.lots.forEach(l => { if (!UUID.test(l.id)) l.id = uid(); now.add(l.id); if (sh.lots[l.id] !== lotSig(l)) up.push(l); });
  Object.keys(sh.lots).forEach(id => { if (!now.has(id)) del.push(id); });
  const wAdd = S.wish.filter(w => !sh.wish.includes(w)), wDel = sh.wish.filter(w => !S.wish.includes(w));
  const tUp = S.totals.filter(t => t.eur != null && sh.tot[t.d] !== totSig(t));
  return { up, del, wAdd, wDel, tUp, any: !!(up.length || del.length || wAdd.length || wDel.length || tUp.length) };
}
function schedSync(ms = 900) { clearTimeout(syncT); syncT = setTimeout(pushNow, ms); }
async function pushNow() {
  if (!cloud) return true;
  if (syncing) { schedSync(1500); return false; }
  const d = diff();
  if (!d.any) { if (syncState !== 'ok') setSync('ok'); return true; }
  syncing = true; setSync('pending');
  const c = cloud.c, uidv = cloud.u.id, sh = shadow();
  try {
    const chk = r => { if (r && r.error) throw r.error; };
    for (let i = 0; i < d.up.length; i += 200) chk(await c.from('collection_items').upsert(d.up.slice(i, i + 200).map(lotRow), { onConflict: 'id' }));
    for (let i = 0; i < d.del.length; i += 100) chk(await c.from('collection_items').delete().in('id', d.del.slice(i, i + 100)));
    if (d.wAdd.length) chk(await c.from('wishlist').upsert(d.wAdd.map(w => ({ user_id: uidv, card_id: w })), { onConflict: 'user_id,card_id' }));
    if (d.wDel.length) chk(await c.from('wishlist').delete().in('card_id', d.wDel));
    if (d.tUp.length) chk(await c.from('value_snapshots').upsert(d.tUp.map(t => ({ user_id: uidv, d: t.d, eur: t.eur, usd: t.usd, cards: t.n || 0 })), { onConflict: 'user_id,d' }));
    d.up.forEach(l => { sh.lots[l.id] = lotSig(l); }); d.del.forEach(id => { delete sh.lots[id]; });
    sh.wish = S.wish.slice(); d.tUp.forEach(t => { sh.tot[t.d] = totSig(t); });
    lastSync = Date.now(); writeNow(); setSync('ok');
    clearTimeout(retryT);
  } catch (e) {
    setSync('error', e && e.message ? String(e.message).slice(0, 90) : '');
    clearTimeout(retryT); retryT = setTimeout(() => pushNow(), 30000);
    syncing = false; return false;
  }
  syncing = false;
  if (diff().any) schedSync(300);
  return true;
}
async function pullAll() { // la collection du compte devient l'état local (après envoi des modifications en attente)
  if (!cloud) return false;
  if (diff().any && !(await pushNow())) return false;
  const c = cloud.c;
  const all = async (t, cols, ord) => { const out = []; for (let f = 0; ; f += 1000) { let q = c.from(t).select(cols); if (ord) q = q.order(ord); const r = await q.range(f, f + 999); if (r.error) throw r.error; out.push(...r.data); if (r.data.length < 1000) break; } return out; };
  try {
    const [lots, wish, snaps] = await Promise.all([all('collection_items', '*', 'created_at'), all('wishlist', 'card_id', 'created_at'), all('value_snapshots', '*', 'd')]);
    S.lots = lots.map(rowLot); S.wish = wish.map(w => w.card_id);
    const sh = { lots: {}, wish: S.wish.slice(), tot: {} };
    S.lots.forEach(l => { sh.lots[l.id] = lotSig(l); });
    const tot = new Map(S.totals.map(t => [t.d, t]));
    snaps.forEach(r => { const t = { d: r.d, eur: r.eur == null ? null : Number(r.eur), usd: r.usd == null ? null : Number(r.usd), n: r.cards }; tot.set(r.d, t); sh.tot[r.d] = totSig(t); });
    S.totals = [...tot.values()].sort((a, b) => a.d < b.d ? -1 : 1);
    S.sh = sh; ver++; aggCache = null; lastSync = Date.now(); writeNow(); setSync('ok');
    // cartes sans détail (jamais consultées sur cet appareil) : le détail et les prix sont récupérés en arrière-plan
    const miss = [...new Set(S.lots.map(l => l.cardId).concat(S.wish))].filter(id => !S.cards[id] || !S.cards[id].name || S.cards[id].name === id);
    if (miss.length) pool(miss.slice(0, 300), 4, async id => { await hydrate(id); }).then(() => { if (/^(collection|valeur|souhaits)$/.test(route().parts[0] || '')) render(true); });
    return true;
  } catch (e) { setSync('error', e && e.message ? String(e.message).slice(0, 90) : ''); return false; }
}
/* collection enregistrée sur cet appareil avant la connexion : proposée à l'import, jamais effacée ni remplacée */
let legacy = null;
async function checkLegacy() {
  legacy = null;
  if (!cloud || S.legacyDone) return;
  const L = await readKey('state');
  if (L && ((L.lots && L.lots.length) || (L.wish && L.wish.length))) legacy = L;
  paintLegacy();
}
function paintLegacy() {
  const el = $('#wp-legacy'); if (!el) return;
  if (!legacy) { el.hidden = true; return; }
  const n = legacy.lots.reduce((s, l) => s + (l.qty || 1), 0);
  el.hidden = false;
  el.innerHTML = `<div><b>Une collection est enregistrée sur cet appareil.</b><br><span class="note">${NUM.format(n)} carte${n > 1 ? 's' : ''} (${NUM.format(legacy.lots.length)} ligne${legacy.lots.length > 1 ? 's' : ''}) ${(legacy.wish || []).length ? 'et ' + legacy.wish.length + ' souhait' + (legacy.wish.length > 1 ? 's' : '') + ' ' : ''}n'${n > 1 ? 'ont' : 'a'} pas encore été ajouté${n > 1 ? 'es' : 'e'} à votre compte. Elle sera <b>ajoutée</b> à celle de votre compte, sans rien remplacer ni effacer.</span></div><div class="wp-hbtn"><button class="cta" data-act="legacyimport">Ajouter à mon compte</button><button class="cta ghost" data-act="legacylater">Plus tard</button></div>`;
}
async function importLegacy() {
  if (!legacy) return;
  const L = legacy;
  (L.lots || []).forEach(l => {
    if (!l || !l.cardId) return;
    const lot = { id: uid(), cardId: String(l.cardId), qty: Math.max(1, Math.min(9999, parseInt(l.qty) || 1)), lang: l.lang || 'fr', finish: l.finish || 'normal', cond: l.cond || 'NM', price: num(l.price), date: l.date || null, added: l.added || Date.now() };
    const twin = S.lots.find(x => lotSig(x) === lotSig(lot));
    if (twin) twin.qty = Math.min(9999, twin.qty + lot.qty); else S.lots.push(lot);
  });
  (L.wish || []).forEach(w => { if (!S.wish.includes(w) && !S.lots.some(l => l.cardId === w)) S.wish.push(w); });
  Object.entries(L.cards || {}).forEach(([k, v]) => { if (!S.cards[k] || (v.pricedAt || 0) > (S.cards[k].pricedAt || 0)) S.cards[k] = v; });
  Object.entries(L.snaps || {}).forEach(([k, a]) => { const cur = S.snaps[k] || []; const ds = new Set(cur.map(x => x.d)); a.forEach(x => { if (!ds.has(x.d)) cur.push(x); }); cur.sort((a1, b1) => a1.d < b1.d ? -1 : 1); S.snaps[k] = cur; });
  (L.totals || []).forEach(x => { if (!S.totals.some(y => y.d === x.d)) S.totals.push(x); });
  S.totals.sort((a, b) => a.d < b.d ? -1 : 1);
  S.legacyDone = true; legacy = null; save(); paintLegacy();
  const ok = await pushNow(); render(true);
  const p = $('#wp-prog'); say(ok ? 'Collection de cet appareil ajoutée à votre compte.' : 'Import enregistré sur cet appareil ; l\'envoi vers votre compte réessaiera automatiquement.');
}
/* accès réservé : renvoie vers la connexion, puis revient sur la même page */
function needLogin() {
  if (!guest) return false;
  const here = (location.pathname.replace(/^\//, '') || 'catalogue.html') + location.search + location.hash;
  PW.setNext(here);
  location.replace('connexion.html?next=' + encodeURIComponent(PW.safeNext(here)));
  return true;
}
const PRIVATE = /^(collection|valeur|souhaits)$/;
addEventListener('online', () => { if (cloud) pushNow(); });
document.addEventListener('visibilitychange', () => { if (cloud && document.visibilityState === 'visible' && !syncing && !diff().any && Date.now() - (lastSync || 0) > 60000) pullAll().then(ok => { if (ok && /^(collection|valeur|souhaits)$/.test(route().parts[0] || '')) render(true); }); });

/* ------------------------------------------------------------------ routage */
function route() {
  const h = location.hash.replace(/^#\/?/, '');
  const [p, q] = h.split('?');
  return { parts: p.split('/').filter(Boolean).map(decodeURIComponent), q: new URLSearchParams(q || '') };
}
const go = (path) => { location.hash = '#/' + path; };
let app, status;
function say(msg) { if (status) status.textContent = msg; }
function banner() {
  const b = $('#wp-banner'); if (!b) return;
  b.hidden = persist !== 'none';
  b.textContent = persist === 'none' ? 'Le stockage du navigateur est indisponible (navigation privée ou bloquée) : votre collection ne sera pas conservée. Exportez-la régulièrement.' : '';
}
const loading = (n = 12) => `<div class="wp-grid" aria-busy="true">${'<div class="wp-tile wp-skel"></div>'.repeat(n)}</div>`;
const errBox = (e, retry = true) => `<div class="card wp-msg" role="alert"><h3>Impossible de charger les données</h3><p>${esc(e.message || e)}</p><p class="note">Vérifiez votre connexion. Le service de cartes est fourni par TCGdex ; s'il est momentanément indisponible, réessayez dans quelques instants. Votre collection enregistrée reste consultable.</p>${retry ? '<p><button class="cta" data-act="retry">Réessayer</button></p>' : ''}</div>`;
const empty = (t, p, cta) => `<div class="card wp-msg"><h3>${t}</h3><p>${p}</p>${cta || ''}</div>`;

/* ------------------------------------------------------------------ éléments d'interface */
function tile(card, o = {}) {
  const img = imgUrl(card.image, 'low');
  const owned = o.qty ? `<span class="wp-q" title="Exemplaires possédés">×${o.qty}</span>` : '';
  const add = o.add ? `<button class="wp-add" data-act="quickadd" data-id="${esc(card.id)}" aria-label="Ajouter ${esc(card.name)} à ma collection" title="Ajouter à ma collection">+</button>` : '';
  const price = o.price != null ? `<span class="wp-pr">${o.priceTxt || fE(o.price)}</span>` : '';
  return `<div class="wp-tile${o.miss ? ' wp-miss' : ''}"><a class="wp-card" href="#/carte/${encodeURIComponent(card.id)}" aria-label="${esc(card.name)}, numéro ${esc(card.localId || '')}">${img ? `<img src="${esc(img)}" alt="" loading="lazy" decoding="async" width="245" height="337">` : `<span class="wp-noimg">${esc(card.name)}</span>`}</a>${owned}${add}<div class="wp-cap"><b>${esc(card.name)}</b><span>${o.sub != null ? o.sub : '#' + esc(card.localId || '')}${price ? ' · ' + price : ''}</span></div></div>`;
}
function bar(label, val, max, txt) {
  const w = max > 0 ? Math.max(2, val / max * 100) : 0;
  return `<div class="wp-bar"><span class="wp-bl">${esc(label)}</span><span class="wp-bt"><i style="width:${w}%"></i></span><span class="wp-bv">${txt}</span></div>`;
}
function lineChart(points, fmt) { // points : [[date 'YYYY-MM-DD', valeur]]
  if (points.length < 2) return '';
  const W = 640, H = 220, pl = 54, pr = 14, pt = 14, pb = 26;
  const xs = points.map(p => new Date(p[0]).getTime()), ys = points.map(p => p[1]);
  let mn = Math.min(...ys), mx = Math.max(...ys); if (mn === mx) { mn *= .95; mx *= 1.05 || 1; if (mn === mx) { mn = 0; mx = 1; } }
  const x0 = xs[0], x1 = xs[xs.length - 1] || x0 + 1;
  const X = t => pl + (t - x0) / ((x1 - x0) || 1) * (W - pl - pr);
  const Y = v => pt + (1 - (v - mn) / (mx - mn)) * (H - pt - pb);
  const d = points.map((p, i) => (i ? 'L' : 'M') + X(xs[i]).toFixed(1) + ' ' + Y(p[1]).toFixed(1)).join('');
  const ticks = [mn, (mn + mx) / 2, mx].map(v => `<g><line x1="${pl}" x2="${W - pr}" y1="${Y(v)}" y2="${Y(v)}" class="wp-gl"/><text x="${pl - 6}" y="${Y(v) + 4}" text-anchor="end">${esc(fmt(v))}</text></g>`).join('');
  const dots = points.length <= 40 ? points.map((p, i) => `<circle cx="${X(xs[i]).toFixed(1)}" cy="${Y(p[1]).toFixed(1)}" r="3.2"><title>${esc(fD(p[0]))} : ${esc(fmt(p[1]))}</title></circle>`).join('') : '';
  const lab = [0, points.length - 1].map((i, k) => `<text x="${X(xs[i])}" y="${H - 6}" text-anchor="${k ? 'end' : 'start'}">${esc(new Date(points[i][0]).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: '2-digit' }))}</text>`).join('');
  return `<svg class="wp-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Courbe d'évolution, de ${esc(fmt(ys[0]))} à ${esc(fmt(ys[ys.length - 1]))}">${ticks}<path d="${d}" class="wp-ln"/>${dots}${lab}</svg>`;
}
function period(points, days) {
  if (!days) return points;
  const lim = Date.now() - days * 864e5;
  return points.filter(p => new Date(p[0]).getTime() >= lim);
}
const pill = (href, label, on) => `<button type="button" data-act="nav" data-href="${esc(href)}" aria-pressed="${on ? 'true' : 'false'}">${esc(label)}</button>`;
function varChip(v, label) {
  if (v == null) return '';
  const cls = v > 0.05 ? 'up' : v < -0.05 ? 'down' : 'flat';
  return `<span class="wp-var ${cls}" title="${esc(label)}">${v > 0.05 ? '▲' : v < -0.05 ? '▼' : '='} ${PCT.format(v)} % <small>${esc(label)}</small></span>`;
}

/* ------------------------------------------------------------------ vue : catalogue */
/* La Web App suit le jeu de cartes physique : la série « TCG Pocket » (application mobile) n'en fait pas partie. */
const isPocketSeries = x => x && (x.id === 'tcgp' || /pocket/i.test(x.name || ''));
const isPocketCard = id => /^(A\d|B\d|P-[AB])/i.test(String(id || ''));
/* Regroupe une extension et ses sous-ensembles (ex. Zénith Suprême swsh12.5 et sa Galerie Galaroise swsh12.5gg) :
   un sous-ensemble porte l'identifiant de l'extension suivi de lettres. Les identifiants restent ceux de l'API. */
function groupSets(sets) {
  const ids = new Set(sets.map(x => x.id));
  const parentOf = x => { let best = null; ids.forEach(p => { if (p !== x.id && x.id.startsWith(p) && /^[a-z]+$/i.test(x.id.slice(p.length)) && (!best || p.length > best.length)) best = p; }); return best; };
  const kids = new Map(), top = [];
  sets.forEach(x => { const p = parentOf(x); if (p) { if (!kids.has(p)) kids.set(p, []); kids.get(p).push(x); } else top.push(x); });
  return top.map(x => ({ set: x, subs: kids.get(x.id) || [] }));
}
let seriesCache = null;
async function loadSeries() {
  const key = S.lang;
  if (seriesCache && seriesCache.lang === key) return seriesCache.d;
  const list = await api('/series', { ttl: 864e5 });
  const out = [];
  await pool(list, 6, async (s, i) => {
    let d = null;
    try { d = await api('/series/' + encodeURIComponent(s.id), { ttl: 864e5 }); } catch (e) { d = { id: s.id, name: s.name, sets: [] }; }
    out[i] = { id: s.id, name: d.name || s.name, logo: s.logo || d.logo, sets: d.sets || [] };
  });
  const d = out.filter(Boolean).filter(s => !isPocketSeries(s) && s.sets.length).reverse(); // les plus récentes d'abord
  seriesCache = { lang: key, d };
  return d;
}
async function vCatalogue(r) {
  const q = (r.q.get('q') || '').trim(), rar = r.q.get('r') || '', pg = parseInt(r.q.get('p')) || 1;
  const rarities = await api('/rarities', { ttl: 864e5 }).catch(() => []);
  const head = `<form class="wp-search card" data-form="search" role="search">
    <label class="wp-f wp-grow"><span>Rechercher une carte</span><input type="search" name="q" value="${esc(q)}" placeholder="Nom (Dracaufeu), numéro (136) ou référence (swsh3-136)" autocomplete="off" enterkeyhint="search"></label>
    <label class="wp-f"><span>Rareté</span><select name="r"><option value="">Toutes</option>${(Array.isArray(rarities) ? rarities : []).map(x => `<option${x === rar ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select></label>
    <label class="wp-f"><span>Langue des cartes</span><select name="lang">${['fr', 'ja'].map(l => `<option value="${l}"${S.lang === l ? ' selected' : ''}>${l === 'fr' ? 'Français' : 'Japonais'}</option>`).join('')}</select></label>
    <button class="cta" type="submit">Rechercher</button></form>`;
  if (q || rar) {
    app.innerHTML = head + `<h2 class="wp-h">Résultats</h2><div id="wp-res">${loading(12)}</div>`;
    const ref = /^[a-z0-9.]+-[a-z0-9]+$/i.test(q) && /\d/.test(q);
    try {
      if (ref) { try { const c = await api('/cards/' + encodeURIComponent(q)); if (c && c.id) { go('carte/' + encodeURIComponent(c.id)); return; } } catch (e) { /* on poursuit la recherche */ } }
      const per = 48, p = [];
      if (q) p.push((/^\d+$/.test(q) ? 'localId=eq:' : 'name=') + encodeURIComponent(q));
      if (rar) p.push('rarity=eq:' + encodeURIComponent(rar));
      p.push('sort:field=name', 'pagination:page=' + pg, 'pagination:itemsPerPage=' + per);
      const raw = await api('/cards?' + p.join('&')), list = Array.isArray(raw) ? raw.filter(c => !isPocketCard(c.id)) : raw, rawLen = Array.isArray(raw) ? raw.length : 0;
      const res = $('#wp-res'); if (!res) return;
      if (!Array.isArray(list) || !list.length) { res.innerHTML = empty('Aucune carte trouvée', 'Essayez un autre nom, retirez le filtre de rareté ou changez la langue des cartes.'); return; }
      const m = agg();
      const nx = new URLSearchParams(r.q); nx.set('p', pg + 1);
      const pv = new URLSearchParams(r.q); pv.set('p', pg - 1);
      res.innerHTML = `<div class="wp-grid">${list.map(c => tile(c, { qty: m.get(c.id)?.qty, add: true, sub: '#' + esc(c.localId || '') + ' · ' + esc((c.id || '').split('-')[0]).toUpperCase() })).join('')}</div>
        <p class="wp-pager">${pg > 1 ? `<a class="cta ghost" href="#/catalogue?${pv}">‹ Précédent</a>` : ''}<span>Page ${pg}</span>${rawLen === per ? `<a class="cta ghost" href="#/catalogue?${nx}">Suivant ›</a>` : ''}</p>`;
      say(list.length + ' cartes affichées');
    } catch (e) { const res = $('#wp-res'); if (res) res.innerHTML = errBox(e); }
    return;
  }
  app.innerHTML = head + `<h2 class="wp-h">Extensions</h2><label class="wp-f wp-sf"><span>Filtrer les extensions</span><input type="search" id="wp-setfilter" placeholder="Nom ou code (ex. Écarlate, sv3)"></label><div id="wp-sets">${loading(8)}</div>`;
  try {
    const series = await loadSeries();
    const box = $('#wp-sets'); if (!box) return;
    const m = agg(), owned = {};
    m.forEach(e => { const s = e.card.setId; if (s) owned[s] = (owned[s] || 0) + 1; });
    const setCard = (x, sub) => {
      const tot = x.cardCount && (x.cardCount.official ?? x.cardCount.total), o = owned[x.id] || 0;
      return `<a class="card wp-set${sub ? ' wp-subset' : ''}" href="#/extension/${encodeURIComponent(x.id)}" data-k="${esc((x.name + ' ' + x.id).toLowerCase())}">${x.logo ? `<img src="${esc(logoUrl(x.logo))}" alt="" loading="lazy" decoding="async">` : ''}<b>${esc(x.name)}</b><span>${esc(x.id)}${tot ? ' · ' + tot + ' cartes' : ''}</span>${o ? `<span class="wp-prog" title="${o} cartes différentes possédées"><i style="width:${tot ? Math.min(100, o / tot * 100) : 100}%"></i></span><small>${o}${tot ? ' / ' + tot : ''} possédées</small>` : ''}</a>`;
    };
    box.innerHTML = series.map(s => `<section class="wp-serie" data-s="${esc(s.name.toLowerCase())}"><h3>${esc(s.name)}</h3><div class="wp-sets">${groupSets(s.sets.slice().reverse()).map(g => g.subs.length
      ? `<div class="wp-group" data-k="${esc((g.set.name + ' ' + g.set.id + ' ' + g.subs.map(y => y.name + ' ' + y.id).join(' ')).toLowerCase())}"><p class="wp-group-t">${esc(g.set.name)} et ${g.subs.length > 1 ? 'ses sous-ensembles' : 'son sous-ensemble'}</p><div class="wp-group-in">${setCard(g.set, false)}${g.subs.map(y => setCard(y, true)).join('')}</div></div>`
      : setCard(g.set, false)).join('')}</div></section>`).join('') || empty('Aucune extension', 'Le catalogue est vide pour cette langue.');
  } catch (e) { const box = $('#wp-sets'); if (box) box.innerHTML = errBox(e); }
}

/* ------------------------------------------------------------------ vue : extension */
async function vSet(id, r) {
  app.innerHTML = `<p class="wp-crumb"><a href="#/catalogue">‹ Catalogue</a></p>` + loading(18);
  let s;
  try { s = await api('/sets/' + encodeURIComponent(id), { ttl: 36e5 }); } catch (e) { app.innerHTML = `<p class="wp-crumb"><a href="#/catalogue">‹ Catalogue</a></p>` + errBox(e); return; }
  const cards = (s.cards || []);
  const m = agg();
  const total = (s.cardCount && (s.cardCount.official ?? s.cardCount.total)) || cards.length;
  const ownedIds = cards.filter(c => m.has(c.id));
  const f = r.q.get('f') || 'all', qs = (r.q.get('s') || '').toLowerCase();
  const shown = cards.filter(c => (f === 'own' ? m.has(c.id) : f === 'miss' ? !m.has(c.id) : true) && (!qs || (c.name + ' ' + c.localId).toLowerCase().includes(qs)));
  const pct = total ? Math.round(ownedIds.length / total * 100) : 0;
  const lim = parseInt(r.q.get('n')) || 120;
  const nq = k => { const p = new URLSearchParams(r.q); Object.entries(k).forEach(([a, b]) => b == null ? p.delete(a) : p.set(a, b)); return '#/extension/' + encodeURIComponent(id) + '?' + p; };
  app.innerHTML = `<p class="wp-crumb"><a href="#/catalogue">‹ Catalogue</a></p>
  <header class="wp-sethead card">${s.logo ? `<img src="${esc(logoUrl(s.logo))}" alt="${esc(s.name)}" width="180">` : `<h2>${esc(s.name)}</h2>`}
    <div><h2>${esc(s.name)}</h2><p>${esc(s.id)}${s.releaseDate ? ' · sortie le ' + esc(fD(s.releaseDate)) : ''} · ${total} cartes</p>
    <div class="wp-prog big" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="Progression de la collection"><i style="width:${pct}%"></i></div>
    <p><b>${ownedIds.length}</b> possédées sur ${total} (${pct} %) · <b>${Math.max(0, total - ownedIds.length)}</b> manquantes</p></div></header>
  <div class="filters wp-filters" role="group" aria-label="Filtrer les cartes">${[['all', 'Toutes'], ['own', 'Possédées'], ['miss', 'Manquantes']].map(([k, t]) => pill(nq({ f: k === 'all' ? null : k, n: null }), t, f === k)).join('')}
    <label class="wp-f wp-grow"><span class="sr">Chercher dans l'extension</span><input type="search" id="wp-inset" value="${esc(qs)}" placeholder="Chercher dans l'extension"></label></div>
  ${shown.length ? `<div class="wp-grid">${shown.slice(0, lim).map(c => tile(c, { qty: m.get(c.id)?.qty, add: true, miss: !m.has(c.id) })).join('')}</div>${shown.length > lim ? `<p class="wp-pager"><a class="cta ghost" href="${nq({ n: lim + 120 })}">Afficher plus (${shown.length - lim} restantes)</a></p>` : ''}` : empty('Aucune carte', f === 'own' ? 'Vous ne possédez encore aucune carte de cette extension.' : 'Aucune carte ne correspond.')}`;
  say(shown.length + ' cartes');
}

/* ------------------------------------------------------------------ vue : fiche carte */
async function vCard(id, r) {
  app.innerHTML = `<p class="wp-crumb"><a href="#/catalogue" data-act="back">‹ Retour</a></p>` + loading(2);
  let c, meta;
  try { c = await api('/cards/' + encodeURIComponent(id)); meta = metaFrom(c); if (S.cards[id]) { S.cards[id] = meta; pushSnap(id, meta); save(); } }
  catch (e) {
    if (S.cards[id] && e.status !== 404) { meta = S.cards[id]; c = meta; } else { app.innerHTML = `<p class="wp-crumb"><a href="#/catalogue">‹ Catalogue</a></p>` + (e.status === 404 ? empty('Carte introuvable', 'Cette référence n\'existe pas dans le catalogue ' + (S.lang === 'ja' ? 'japonais' : 'français') + '.') : errBox(e)); return; }
  }
  const e = agg().get(id), wished = S.wish.includes(id);
  const fin = finishesOf(meta), selF = r.q.get('fin') && fin.includes(r.q.get('fin')) ? r.q.get('fin') : (e && e.lots[0] && fin.includes(e.lots[0].finish) ? e.lots[0].finish : fin[0]);
  const cm = meta.pricing && meta.pricing.cardmarket, tp = meta.pricing && meta.pricing.tcgplayer;
  const holoOnly = selF !== 'normal';
  const sf = holoOnly ? '-holo' : '';
  const row = (l, v, f2 = fE) => v == null ? '' : `<tr><th scope="row">${l}</th><td>${f2(v)}</td></tr>`;
  const vr = cmVariation(meta, selF);
  const cmHtml = cm ? `<table class="wp-t"><tbody>${row('Prix de tendance', cm['trend' + sf])}${row('Prix moyen', cm['avg' + sf])}${row('Prix le plus bas', cm['low' + sf])}${row('Moyenne sur 1 jour', cm['avg1' + sf])}${row('Moyenne sur 7 jours', cm['avg7' + sf])}${row('Moyenne sur 30 jours', cm['avg30' + sf])}</tbody></table>
      ${(cm['trend' + sf] == null && cm['avg' + sf] == null) ? `<p class="note">Aucun prix Cardmarket pour la finition « ${esc(FINISH[selF])} ».</p>` : `<p class="wp-vars">${varChip(vr && vr.d7, 'vs moy. 7 j')}${varChip(vr && vr.d30, 'vs moy. 30 j')}</p>`}
      <p class="note">En euros · ${cm.updated ? 'mis à jour le ' + esc(fD(cm.updated)) : 'date de mise à jour inconnue'}</p>` : `<p class="note">Aucun prix Cardmarket disponible pour cette carte.</p>`;
  const tf = selF === 'firstEdition' ? '1stEdition' : selF;
  const tv = tp && tp[tf];
  const tcgHtml = tp ? (tv ? `<table class="wp-t"><tbody>${row('Prix du marché', tv.marketPrice, fU)}${row('Prix moyen', tv.midPrice, fU)}${row('Prix bas', tv.lowPrice, fU)}${row('Prix haut', tv.highPrice, fU)}${row('Prix bas « Direct »', tv.directLowPrice, fU)}</tbody></table>` : `<p class="note">Aucun prix TCGplayer pour la finition « ${esc(FINISH[selF])} ».</p>`) + `<p class="note">En dollars US (non convertis) · ${tp.updated ? 'mis à jour le ' + esc(fD(tp.updated)) : 'date de mise à jour inconnue'}</p>` : `<p class="note">Aucun prix TCGplayer disponible pour cette carte.</p>`;
  const sn = (S.snaps[id] || []);
  const key = { cm: selF === 'normal' ? 'cm' : 'cmh', tcg: selF === 'normal' ? 'tn' : selF === 'reverse' ? 'tr' : 'th' };
  const ptsE = sn.filter(x => x[key.cm] != null).map(x => [x.d, x[key.cm]]);
  const ptsU = sn.filter(x => x[key.tcg] != null).map(x => [x.d, x[key.tcg]]);
  const per = parseInt(r.q.get('per')) || 0;
  const pe = period(ptsE, per), pu = period(ptsU, per);
  const span = ptsE.length > 1 ? (new Date(ptsE[ptsE.length - 1][0]) - new Date(ptsE[0][0])) / 864e5 : 0;
  const perBtns = [[7, '7 jours'], [30, '30 jours'], [90, '90 jours'], [365, '1 an'], [0, 'Tout']].filter(([d]) => !d || span >= d * .6 || span > d).map(([d, t]) => pill('#/carte/' + encodeURIComponent(id) + '?fin=' + selF + (d ? '&per=' + d : ''), t, per === d)).join('');
  const hist = (pe.length > 1 || pu.length > 1) ? `${perBtns ? `<div class="filters wp-filters">${perBtns}</div>` : ''}${pe.length > 1 ? `<h4>Cardmarket (€)</h4>${lineChart(pe, fE)}` : ''}${pu.length > 1 ? `<h4>TCGplayer ($)</h4>${lineChart(pu, fU)}` : ''}<p class="note">Courbe construite à partir des relevés enregistrés sur cet appareil à chaque consultation ou actualisation (un point par jour).</p>`
    : `<p class="note">${sn.length ? `Un seul relevé enregistré (${esc(fD(sn[0].d))}).` : 'Aucun relevé enregistré pour le moment.'} PokeWorth ne reconstitue jamais de prix passés : la courbe se construit à chaque consultation, actualisation ou ajout de la carte. Cardmarket fournit déjà les moyennes sur 1, 7 et 30 jours ci-dessus.</p>`;
  const lots = e ? e.lots.map(l => `<li class="wp-lot"><span><b>×${l.qty}</b> · ${esc(LANGS[l.lang] || l.lang)} · ${esc(FINISH[l.finish] || l.finish)} · ${esc(l.cond)}${l.price != null ? ' · acheté ' + fE(l.price) + ' pièce' : ''}${l.date ? ' · le ' + esc(fD(l.date)) : ''}</span><span class="wp-lbtn"><button class="wp-link" data-act="editlot" data-lot="${l.id}">Modifier</button><button class="wp-link" data-act="dellot" data-lot="${l.id}">Supprimer</button></span></li>`).join('') : '';
  const info = [['Extension', meta.setName ? `<a href="#/extension/${encodeURIComponent(meta.setId)}">${esc(meta.setName)}</a>` : '—'], ['Numéro', esc(meta.localId || '—') + (meta.setTotal ? ' / ' + meta.setTotal : '')], ['Rareté', esc(meta.rarity || '—')], ['Catégorie', esc(meta.category || '—')], ['Types', esc((meta.types || []).join(', ') || '—')], ['PV', meta.hp ? esc(meta.hp) : '—'], ['Illustrateur', esc(meta.illustrator || '—')], ['Finitions', esc(fin.map(k => FINISH[k]).join(', '))]];
  app.innerHTML = `<p class="wp-crumb"><a href="${meta.setId ? '#/extension/' + encodeURIComponent(meta.setId) : '#/catalogue'}">‹ ${esc(meta.setName || 'Catalogue')}</a></p>
  <div class="wp-detail">
    <div class="wp-art">${meta.image ? `<img src="${esc(imgUrl(meta.image, 'high'))}" alt="Carte ${esc(meta.name)}" width="600" height="825" decoding="async">` : `<div class="wp-noimg big">${esc(meta.name)}</div>`}</div>
    <div class="wp-info">
      <h2>${esc(meta.name)}</h2>
      <p class="wp-sub2">${esc(meta.setName || '')} · #${esc(meta.localId || '')}${meta.rarity ? ' · ' + esc(meta.rarity) : ''}</p>
      <div class="wp-actions"><button class="cta" data-act="openadd">${e ? 'Ajouter un exemplaire' : 'Ajouter à ma collection'}</button><button class="cta ghost" data-act="wish" data-id="${esc(id)}" aria-pressed="${wished}">${wished ? '♥ Dans ma liste de souhaits' : '♡ Liste de souhaits'}</button></div>
      ${e ? `<div class="card wp-own"><h3>Dans ma collection : ${e.qty} exemplaire${e.qty > 1 ? 's' : ''}</h3><ul class="wp-lots">${lots}</ul><p class="note">Valeur estimée : <b>${fE(e.eur)}</b> (Cardmarket)${e.usd ? ' · ' + fU(e.usd) + ' (TCGplayer)' : ''}${e.noPrice ? ' · ' + e.noPrice + ' exemplaire' + (e.noPrice > 1 ? 's' : '') + ' sans prix' : ''}</p></div>` : ''}
      <form id="wp-addf" class="card wp-addf" data-form="lot" hidden></form>
      <div class="card"><h3>Informations</h3><dl class="wp-dl">${info.map(([a, b]) => `<div><dt>${a}</dt><dd>${b}</dd></div>`).join('')}</dl></div>
    </div>
  </div>
  <section class="wp-prices"><h3 class="wp-h">Prix</h3>
    ${fin.length > 1 ? `<div class="filters wp-filters" role="group" aria-label="Finition">${fin.map(k => pill('#/carte/' + encodeURIComponent(id) + '?fin=' + k, FINISH[k], k === selF)).join('')}</div>` : ''}
    <div class="wp-two"><div class="card"><h4>Cardmarket <small>€</small></h4>${cmHtml}</div><div class="card"><h4>TCGplayer <small>$</small></h4>${tcgHtml}</div></div>
    <div class="card"><h4>Évolution du prix</h4>${hist}</div>
    <p class="note">Les prix Cardmarket (euros) et TCGplayer (dollars) sont affichés séparément et jamais convertis ni additionnés. Ce sont des repères de marché, pas une valeur de revente garantie. Source : TCGdex.</p>
  </section>
  <section><h3 class="wp-h">Autres versions de cette carte</h3><div id="wp-vers">${loading(6)}</div></section>`;
  say(meta.name);
  // autres versions
  api('/cards?name=eq:' + encodeURIComponent(meta.name) + '&pagination:page=1&pagination:itemsPerPage=24').then(list => {
    const box = $('#wp-vers'); if (!box) return;
    const o = (Array.isArray(list) ? list : []).filter(x => x.id !== id);
    box.innerHTML = o.length ? `<div class="wp-grid">${o.map(x => tile(x, { qty: agg().get(x.id)?.qty, add: true, sub: esc((x.id || '').split('-')[0]).toUpperCase() + ' · #' + esc(x.localId || '') })).join('')}</div>` : '<p class="note">Aucune autre version trouvée dans le catalogue.</p>';
  }).catch(() => { const box = $('#wp-vers'); if (box) box.innerHTML = '<p class="note">Impossible de charger les autres versions pour le moment.</p>'; });
  app._card = meta;
}
function lotForm(meta, lot) {
  const fin = finishesOf(meta);
  return `<h3>${lot ? 'Modifier l\'exemplaire' : 'Ajouter à ma collection'}</h3>
  <input type="hidden" name="lot" value="${lot ? lot.id : ''}">
  <div class="wp-fg">
   <label class="wp-f"><span>Quantité</span><input name="qty" type="number" inputmode="numeric" min="1" max="9999" value="${lot ? lot.qty : 1}" required></label>
   <label class="wp-f"><span>Langue de la carte</span><select name="lang">${Object.entries(LANGS).map(([k, v]) => `<option value="${k}"${(lot ? lot.lang : S.lang) === k ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
   <label class="wp-f"><span>Finition</span><select name="finish">${fin.map(k => `<option value="${k}"${(lot ? lot.finish : fin[0]) === k ? ' selected' : ''}>${FINISH[k]}</option>`).join('')}</select></label>
   <label class="wp-f"><span>État</span><select name="cond">${CONDS.map(([k, v]) => `<option value="${k}"${(lot ? lot.cond : 'NM') === k ? ' selected' : ''}>${k} · ${v}</option>`).join('')}</select></label>
   <label class="wp-f"><span>Prix d'achat unitaire (€)</span><input name="price" type="text" inputmode="decimal" placeholder="optionnel" value="${lot && lot.price != null ? String(lot.price).replace('.', ',') : ''}"></label>
   <label class="wp-f"><span>Date d'acquisition</span><input name="date" type="date" max="${day()}" value="${lot && lot.date ? esc(lot.date) : ''}"></label>
  </div>
  <p><button class="cta" type="submit">${lot ? 'Enregistrer' : 'Ajouter'}</button> <button class="cta ghost" type="button" data-act="closeadd">Annuler</button></p>`;
}

/* ------------------------------------------------------------------ vue : ma collection */
const SORTS = { name: 'Nom', value: 'Valeur (décroissante)', valueAsc: 'Valeur (croissante)', set: 'Extension', qty: 'Quantité', recent: 'Ajout récent', gain: 'Plus-value' };
function vCollection(r) {
  const m = agg();
  if (!m.size) { app.innerHTML = collectionHead(0) + empty('Votre collection est vide', 'Parcourez le catalogue et ajoutez vos cartes avec le bouton <b>+</b>, ou importez une sauvegarde.', '<p><a class="cta" href="#/catalogue">Ouvrir le catalogue</a> <button class="cta ghost" data-act="import">Importer une sauvegarde</button></p>'); return; }
  const q = (r.q.get('q') || '').toLowerCase(), fs = r.q.get('set') || '', fr = r.q.get('rar') || '', fl = r.q.get('lang') || '', ff = r.q.get('fin') || '', dup = r.q.get('dup') === '1';
  const sort = SORTS[r.q.get('sort')] ? r.q.get('sort') : 'recent', view = r.q.get('v') || S.view || 'grid';
  const all = [...m.values()];
  const sets = [...new Map(all.filter(e => e.card.setId).map(e => [e.card.setId, e.card.setName || e.card.setId])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'fr'));
  const rars = [...new Set(all.map(e => e.card.rarity).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
  const lgs = [...new Set(S.lots.map(l => l.lang))];
  let list = all.filter(e => (!q || (e.card.name + ' ' + (e.card.localId || '') + ' ' + (e.card.setName || '') + ' ' + e.cardId).toLowerCase().includes(q)) && (!fs || e.card.setId === fs) && (!fr || e.card.rarity === fr) && (!fl || e.lots.some(l => l.lang === fl)) && (!ff || e.lots.some(l => l.finish === ff)) && (!dup || e.qty > 1));
  const num2 = s => parseInt(s) || 0;
  const cmp = { name: (a, b) => a.card.name.localeCompare(b.card.name, 'fr'), value: (a, b) => b.eur - a.eur, valueAsc: (a, b) => a.eur - b.eur, set: (a, b) => (a.card.setName || '').localeCompare(b.card.setName || '', 'fr') || num2(a.card.localId) - num2(b.card.localId), qty: (a, b) => b.qty - a.qty, recent: (a, b) => b.added - a.added, gain: (a, b) => b.gain - a.gain }[sort];
  list.sort(cmp);
  const t = totals();
  const top = all.slice().sort((a, b) => b.eur - a.eur).filter(e => e.eur > 0).slice(0, 5);
  const lim = parseInt(r.q.get('n')) || 60;
  const sel = (n, opts, cur, first) => `<label class="wp-f"><span>${first[0]}</span><select data-f="${n}">${first[1] != null ? `<option value="">${first[1]}</option>` : ''}${opts.map(([k, v]) => `<option value="${esc(k)}"${k === cur ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select></label>`;
  const rowHtml = e => {
    const c = e.card, unit = e.qty ? e.eur / e.qty : 0, fins = [...new Set(e.lots.map(l => FINISH[l.finish] || l.finish))].join(', ');
    return view === 'list'
      ? `<tr><td><a class="wp-th" href="#/carte/${encodeURIComponent(e.cardId)}">${c.image ? `<img src="${esc(imgUrl(c.image))}" alt="" loading="lazy" width="40" height="55">` : ''}<b>${esc(c.name)}</b></a></td><td>${esc(c.setName || '—')} · #${esc(c.localId || '')}</td><td>${esc(c.rarity || '—')}</td><td>${esc(fins)}</td><td class="r">${e.qty}${e.qty > 1 ? ' <span class="wp-dup">doublon</span>' : ''}</td><td class="r">${e.noPrice === e.qty ? '—' : fE(unit)}</td><td class="r"><b>${e.noPrice === e.qty ? '—' : fE(e.eur)}</b></td><td class="r">${e.gainQty ? `<span class="${e.gain >= 0 ? 'wp-pos' : 'wp-neg'}">${e.gain >= 0 ? '+' : ''}${fE(e.gain)}</span>` : '—'}</td></tr>`
      : tile(c, { qty: e.qty, price: e.noPrice === e.qty ? null : e.eur, sub: esc(c.setName || '') + ' · #' + esc(c.localId || '') });
  };
  const shown = list.slice(0, lim);
  app.innerHTML = collectionHead(t) +
  (top.length ? `<section class="wp-top"><h3 class="wp-h">Les plus précieuses</h3><div class="wp-toprow">${top.map(e => tile(e.card, { qty: e.qty, price: e.eur, sub: esc(e.card.setName || '') })).join('')}</div></section>` : '') +
  `<div class="card wp-tools"><label class="wp-f wp-grow"><span>Rechercher dans ma collection</span><input type="search" data-f="q" value="${esc(r.q.get('q') || '')}" placeholder="Nom, numéro, extension…"></label>
    ${sel('set', sets, fs, ['Extension', 'Toutes'])}${sel('rar', rars.map(x => [x, x]), fr, ['Rareté', 'Toutes'])}${sel('lang', lgs.map(x => [x, LANGS[x] || x]), fl, ['Langue des cartes', 'Toutes'])}${sel('fin', Object.entries(FINISH), ff, ['Finition', 'Toutes'])}${sel('sort', Object.entries(SORTS), sort, ['Trier par', null])}
    <label class="wp-chk"><input type="checkbox" data-f="dup" ${dup ? 'checked' : ''}> Doublons uniquement</label>
    <div class="filters wp-filters" role="group" aria-label="Affichage">${[['grid', 'Grille'], ['list', 'Liste']].map(([k, tx]) => `<button type="button" data-act="view" data-v="${k}" aria-pressed="${view === k}">${tx}</button>`).join('')}</div></div>
  <p class="note" id="wp-count">${NUM.format(list.length)} carte${list.length > 1 ? 's' : ''} affichée${list.length > 1 ? 's' : ''} sur ${NUM.format(all.length)}.</p>
  ${list.length ? (view === 'list' ? `<div class="tbl wp-ltbl"><table class="wp-t wp-list"><thead><tr><th>Carte</th><th>Extension</th><th>Rareté</th><th>Finition</th><th class="r">Qté</th><th class="r">Prix unit.</th><th class="r">Valeur</th><th class="r">+/− value</th></tr></thead><tbody>${shown.map(rowHtml).join('')}</tbody></table></div>` : `<div class="wp-grid">${shown.map(rowHtml).join('')}</div>`) +
    (list.length > lim ? `<p class="wp-pager"><button class="cta ghost" id="wp-more" data-act="more" data-n="${lim + 60}">Afficher plus (${list.length - lim} restantes)</button></p>` : '')
    : empty('Aucun résultat', 'Aucune carte de votre collection ne correspond à ces filtres.', '<p><a class="cta ghost" href="#/collection">Réinitialiser les filtres</a></p>')}`;
  say(list.length + ' cartes');
  const more = $('#wp-more');
  if (more && 'IntersectionObserver' in window) { const io = new IntersectionObserver(es => { if (es[0].isIntersecting) { io.disconnect(); more.click(); } }, { rootMargin: '600px' }); io.observe(more); }
}
function collectionHead(t) {
  const last = S.lastRefresh ? 'Prix actualisés le ' + fDT(S.lastRefresh) : 'Prix jamais actualisés depuis cet appareil';
  return `<header class="wp-pagehead"><div><h2>Ma collection</h2><p class="sub">${t ? `<b>${NUM.format(t.cards)}</b> cartes · <b>${NUM.format(t.distinct)}</b> différentes · valeur estimée <b>${fE(t.eur)}</b>` : 'Votre classeur numérique.'}</p></div>
  <div class="wp-hbtn"><button class="cta ghost" data-act="refresh" ${S.lots.length ? '' : 'disabled'}>Actualiser les prix</button><button class="cta ghost" data-act="export">Exporter</button><button class="cta ghost" data-act="import">Importer</button></div></header>
  <p class="note wp-last">${esc(last)}. ${t && t.noPrice ? `<b>${t.noPrice}</b> exemplaire${t.noPrice > 1 ? 's' : ''} sans prix disponible (non comptés dans la valeur).` : ''}</p><div id="wp-prog" class="wp-progmsg" aria-live="polite"></div>`;
}

/* ------------------------------------------------------------------ vue : valeur et statistiques */
function vValue() {
  const t = totals(), m = agg();
  if (!m.size) { app.innerHTML = `<header class="wp-pagehead"><div><h2>Valeur de la collection</h2></div></header>` + empty('Rien à valoriser pour le moment', 'Ajoutez des cartes à votre collection pour voir sa valeur, ses statistiques et son évolution.', '<p><a class="cta" href="#/catalogue">Ouvrir le catalogue</a></p>'); return; }
  const all = [...m.values()];
  const stale = !S.lastRefresh || Date.now() - S.lastRefresh > 864e5;
  const bySet = {}, byRar = {};
  all.forEach(e => {
    const sk = e.card.setName || 'Extension inconnue', rk = e.card.rarity || 'Non renseignée';
    (bySet[sk] = bySet[sk] || { eur: 0, n: 0, id: e.card.setId, total: e.card.setTotal, distinct: 0 });
    bySet[sk].eur += e.eur; bySet[sk].n += e.qty; bySet[sk].distinct++;
    (byRar[rk] = byRar[rk] || { eur: 0, n: 0 }); byRar[rk].eur += e.eur; byRar[rk].n += e.qty;
  });
  const setRows = Object.entries(bySet).sort((a, b) => b[1].eur - a[1].eur || b[1].n - a[1].n).slice(0, 12);
  const rarRows = Object.entries(byRar).sort((a, b) => b[1].eur - a[1].eur || b[1].n - a[1].n);
  const maxS = Math.max(0, ...setRows.map(x => x[1].eur)), maxR = Math.max(0, ...rarRows.map(x => x[1].eur));
  const top = all.slice().sort((a, b) => b.eur - a.eur).filter(e => e.eur > 0).slice(0, 10);
  const mv = [];
  S.lots.forEach(l => { const c = S.cards[l.cardId]; const v = cmVariation(c, l.finish), p = cmPrice(c, l.finish); if (v && v.d30 != null && p >= 1) mv.push({ c, l, v: v.d30, p }); });
  const seen = new Set(), movers = mv.filter(x => !seen.has(x.c.id) && seen.add(x.c.id)).sort((a, b) => Math.abs(b.v) - Math.abs(a.v)).slice(0, 6);
  const per = parseInt(new URLSearchParams(location.hash.split('?')[1] || '').get('per')) || 0;
  const evo = period(S.totals.filter(x => x.eur != null).map(x => [x.d, x.eur]), per);
  const perBtns = [[30, '30 jours'], [90, '90 jours'], [365, '1 an'], [0, 'Tout']].map(([d, tx]) => pill('#/valeur' + (d ? '?per=' + d : ''), tx, per === d)).join('');
  const gainTxt = t.gainQty ? `<span class="${t.gain >= 0 ? 'wp-pos' : 'wp-neg'}">${t.gain >= 0 ? '+' : ''}${fE(t.gain)}</span>` : '—';
  app.innerHTML = `<header class="wp-pagehead"><div><h2>Valeur de la collection</h2><p class="sub">Une estimation à partir de vos quantités et des prix de marché Cardmarket (€). Ce n'est pas une valeur de revente garantie.</p></div>
    <div class="wp-hbtn"><button class="cta ghost" data-act="refresh">Actualiser les prix</button></div></header>
  <div id="wp-prog" class="wp-progmsg" aria-live="polite"></div>
  ${stale ? `<div class="card wp-msg wp-warn"><p>${S.lastRefresh ? 'Les prix datent du ' + esc(fDT(S.lastRefresh)) + '.' : 'Les prix n\'ont pas encore été actualisés depuis cet appareil.'} Actualisez-les pour une estimation à jour.</p></div>` : ''}
  <div class="wp-kpis">
    <div class="card wp-kpi"><span>Valeur estimée (Cardmarket)</span><b>${fE(t.eur)}</b></div>
    <div class="card wp-kpi"><span>Cartes possédées</span><b>${NUM.format(t.cards)}</b></div>
    <div class="card wp-kpi"><span>Cartes différentes</span><b>${NUM.format(t.distinct)}</b></div>
    <div class="card wp-kpi"><span>Doublons</span><b>${NUM.format(t.dups)}</b><small>${t.dupCards} carte${t.dupCards > 1 ? 's' : ''} en plusieurs exemplaires</small></div>
    <div class="card wp-kpi"><span>Extensions représentées</span><b>${t.sets.size}</b></div>
    <div class="card wp-kpi"><span>Prix d'achat renseignés</span><b>${t.cost ? fE(t.cost) : '—'}</b><small>${t.gainQty ? 'Plus/moins-value : ' : 'Renseignez vos prix d\'achat pour calculer une plus-value.'}</small>${t.gainQty ? gainTxt : ''}</div>
  </div>
  ${t.usd ? `<p class="note">À titre indicatif, le même ensemble vaut ${fU(t.usd)} côté TCGplayer (dollars US, non convertis ni additionnés aux euros).</p>` : ''}
  ${t.noPrice ? `<p class="note"><b>Limite de l'estimation :</b> ${t.noPrice} exemplaire${t.noPrice > 1 ? 's' : ''} n'a${t.noPrice > 1 ? 'ont' : ''} pas de prix Cardmarket pour la finition choisie ; ${t.noPrice > 1 ? 'ils ne sont' : 'il n\'est'} pas compté${t.noPrice > 1 ? 's' : ''} dans la valeur.</p>` : ''}
  <section class="card"><h3>Évolution de la valeur</h3>${evo.length > 1 ? `<div class="filters wp-filters">${perBtns}</div>${lineChart(evo, fE)}<p class="note">Un relevé par jour, enregistré à chaque actualisation des prix sur cet appareil.</p>` : `<p class="note">${S.totals.length ? 'Un seul relevé enregistré.' : 'Aucun relevé enregistré.'} La courbe apparaît après au moins deux jours d'actualisation : PokeWorth ne reconstitue pas de valeurs passées.</p>`}</section>
  <div class="wp-two">
    <section class="card"><h3>Cartes les plus valorisées</h3>${top.length ? `<ol class="wp-rank">${top.map(e => `<li><a href="#/carte/${encodeURIComponent(e.cardId)}">${esc(e.card.name)}</a><span>${esc(e.card.setName || '')} · ×${e.qty}</span><b>${fE(e.eur)}</b></li>`).join('')}</ol>` : '<p class="note">Aucun prix disponible.</p>'}</section>
    <section class="card"><h3>Prix qui évoluent le plus</h3>${movers.length ? `<ol class="wp-rank">${movers.map(x => `<li><a href="#/carte/${encodeURIComponent(x.c.id)}">${esc(x.c.name)}</a><span>${fE(x.p)}</span><b>${varChip(x.v, 'vs moy. 30 j')}</b></li>`).join('')}</ol><p class="note">Tendance Cardmarket comparée à la moyenne des 30 derniers jours, pour les cartes d'au moins 1 €.</p>` : '<p class="note">Pas assez de données de prix pour calculer des variations.</p>'}</section>
  </div>
  <div class="wp-two">
    <section class="card"><h3>Valeur par extension</h3>${setRows.map(([k, v]) => bar(k, v.eur, maxS, fE(v.eur) + ' · ' + v.n)).join('')}</section>
    <section class="card"><h3>Valeur par rareté</h3>${rarRows.map(([k, v]) => bar(k, v.eur, maxR, fE(v.eur) + ' · ' + v.n)).join('')}<p class="note">Rareté disponible une fois les détails de la carte chargés.</p></section>
  </div>
  <section class="card"><h3>Progression par extension</h3>${Object.entries(bySet).filter(([, v]) => v.total).sort((a, b) => b[1].distinct / b[1].total - a[1].distinct / a[1].total).slice(0, 12).map(([k, v]) => `<a class="wp-pl" href="#/extension/${encodeURIComponent(v.id)}"><span>${esc(k)}</span><span class="wp-prog"><i style="width:${Math.min(100, v.distinct / v.total * 100)}%"></i></span><b>${v.distinct} / ${v.total}</b></a>`).join('') || '<p class="note">La taille des extensions sera connue après le chargement des cartes.</p>'}</section>`;
}

/* ------------------------------------------------------------------ vue : liste de souhaits */
function vWish() {
  const ids = S.wish, m = agg();
  app.innerHTML = `<header class="wp-pagehead"><div><h2>Liste de souhaits</h2><p class="sub">Les cartes que vous cherchez. Elles passent dans votre collection dès que vous les ajoutez.</p></div></header>` +
  (ids.length ? `<div class="wp-grid">${ids.map(id => { const c = S.cards[id] || { id, name: id }; const p = cmPrice(c, firstFinish(c)); return `<div class="wp-wrap">${tile(c, { add: true, price: p, sub: esc(c.setName || '') + ' · #' + esc(c.localId || '') })}<button class="wp-link wp-rm" data-act="wish" data-id="${esc(id)}">Retirer</button></div>`; }).join('')}</div>` : empty('Aucune carte souhaitée', 'Depuis la fiche d\'une carte, utilisez « Liste de souhaits ».', '<p><a class="cta" href="#/catalogue">Ouvrir le catalogue</a></p>'));
}

/* ------------------------------------------------------------------ actions : prix, sauvegarde */
let refreshing = false;
async function refreshAll() {
  if (refreshing) return;
  const ids = [...new Set(S.lots.map(l => l.cardId))];
  if (!ids.length) return;
  refreshing = true;
  const p = () => $('#wp-prog');
  let ok = 0, ko = 0;
  await pool(ids, 4, async id => {
    try { await hydrate(id); ok++; } catch (e) { ko++; }
    if (p()) p().textContent = `Actualisation des prix : ${ok + ko} / ${ids.length}…`;
  });
  if (ok) {
    S.lastRefresh = Date.now();
    const t = totals(); const d = day();
    const row = { d, eur: t.eur, usd: t.usd, n: t.cards };
    if (S.totals.length && S.totals[S.totals.length - 1].d === d) S.totals[S.totals.length - 1] = row; else S.totals.push(row);
  }
  save(); refreshing = false;
  render();
  const q = $('#wp-prog'); if (q) q.textContent = ko ? `${ok} cartes actualisées, ${ko} en échec (réessayez plus tard).` : `${ok} cartes actualisées.`;
  say('Actualisation terminée');
}
function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
function exportJSON() {
  download('pokeworth-collection-' + day() + '.json', JSON.stringify({ app: 'pokeworth-webapp', version: 1, exportedAt: new Date().toISOString(), lots: S.lots, cards: S.cards, wish: S.wish, snaps: S.snaps, totals: S.totals, lastRefresh: S.lastRefresh }), 'application/json');
}
function exportCSV() {
  const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const rows = [['carte_id', 'nom', 'extension', 'numero', 'rarete', 'langue', 'finition', 'etat', 'quantite', 'prix_achat_unitaire_eur', 'date_acquisition', 'prix_cardmarket_eur', 'prix_tcgplayer_usd'].join(';')];
  S.lots.forEach(l => { const c = S.cards[l.cardId] || {}; rows.push([l.cardId, c.name, c.setName, c.localId, c.rarity, l.lang, l.finish, l.cond, l.qty, l.price ?? '', l.date ?? '', cmPrice(c, l.finish) ?? '', tcgPrice(c, l.finish) ?? ''].map(q).join(';')); });
  download('pokeworth-collection-' + day() + '.csv', '﻿' + rows.join('\r\n'), 'text/csv;charset=utf-8');
}
function importFile(file) {
  const rd = new FileReader();
  rd.onload = () => {
    try {
      const d = JSON.parse(rd.result);
      if (!d || d.app !== 'pokeworth-webapp' || !Array.isArray(d.lots)) throw new Error('Ce fichier n\'est pas une sauvegarde PokeWorth.');
      const ids = new Set(S.lots.map(l => l.id));
      let added = 0;
      d.lots.forEach(l => { if (l && l.id && l.cardId && !ids.has(l.id)) { S.lots.push({ id: String(l.id), cardId: String(l.cardId), qty: Math.max(1, Math.min(9999, parseInt(l.qty) || 1)), lang: l.lang || 'fr', finish: l.finish || 'normal', cond: l.cond || 'NM', price: num(l.price), date: l.date || null, added: l.added || Date.now() }); ids.add(l.id); added++; } });
      Object.entries(d.cards || {}).forEach(([k, v]) => { if (!S.cards[k] || (v.pricedAt || 0) > (S.cards[k].pricedAt || 0)) S.cards[k] = v; });
      (d.wish || []).forEach(w => { if (!S.wish.includes(w) && !S.lots.some(l => l.cardId === w)) S.wish.push(w); });
      Object.entries(d.snaps || {}).forEach(([k, a]) => { const cur = S.snaps[k] || []; const ds = new Set(cur.map(x => x.d)); a.forEach(x => { if (!ds.has(x.d)) cur.push(x); }); cur.sort((a1, b1) => a1.d < b1.d ? -1 : 1); S.snaps[k] = cur; });
      (d.totals || []).forEach(x => { if (!S.totals.some(y => y.d === x.d)) S.totals.push(x); });
      S.totals.sort((a, b) => a.d < b.d ? -1 : 1);
      S.lastRefresh = Math.max(S.lastRefresh || 0, d.lastRefresh || 0) || null;
      save(); render();
      const p = $('#wp-prog'); if (p) p.textContent = `Import terminé : ${added} ligne${added > 1 ? 's' : ''} ajoutée${added > 1 ? 's' : ''} (les lignes déjà présentes ne sont pas dupliquées).`;
    } catch (e) { const p = $('#wp-prog'); if (p) p.textContent = 'Import impossible : ' + e.message; else alert('Import impossible : ' + e.message); }
  };
  rd.readAsText(file);
}

/* ------------------------------------------------------------------ événements */
function readLotForm(f) {
  const d = Object.fromEntries(new FormData(f).entries());
  const price = d.price === '' ? null : num(d.price);
  if (d.price !== '' && (price == null || price < 0)) { alert('Prix d\'achat invalide.'); return null; }
  return { lot: d.lot, qty: parseInt(d.qty) || 1, lang: d.lang, finish: d.finish, cond: d.cond, price, date: d.date || null };
}
document.addEventListener('submit', ev => {
  const f = ev.target.closest('form[data-form]'); if (!f || !app.contains(f)) return;
  ev.preventDefault();
  if (f.dataset.form === 'lot' && needLogin()) return;
  if (f.dataset.form === 'search') {
    const d = new FormData(f), lg = d.get('lang');
    if (lg && lg !== S.lang) { S.lang = lg; seriesCache = null; save(); }
    const p = new URLSearchParams(); if ((d.get('q') || '').trim()) p.set('q', d.get('q').trim()); if (d.get('r')) p.set('r', d.get('r'));
    const h = '#/catalogue' + (p.toString() ? '?' + p : '');
    if (location.hash === h) render(); else location.hash = h;
  } else if (f.dataset.form === 'lot') {
    const v = readLotForm(f); if (!v) return;
    const meta = app._card; if (!meta) return;
    if (v.lot) { const l = S.lots.find(x => x.id === v.lot); if (l) Object.assign(l, { qty: Math.max(1, Math.min(9999, v.qty)), lang: v.lang, finish: v.finish, cond: v.cond, price: v.price, date: v.date }); save(); }
    else addLot(meta, v);
    render();
  }
});
document.addEventListener('click', async ev => {
  const b = ev.target.closest('[data-act]'); if (!b || !(app.contains(b) || b.closest('#wp-legacy,#wp-sync'))) return;
  const a = b.dataset.act;
  if (['quickadd', 'openadd', 'editlot', 'dellot', 'wish', 'import'].includes(a) && needLogin()) { ev.preventDefault(); return; }
  if (a === 'nav') location.hash = b.dataset.href;
  else if (a === 'retry') render();
  else if (a === 'syncnow') { pushNow(); }
  else if (a === 'legacyimport') importLegacy();
  else if (a === 'legacylater') { legacy = null; paintLegacy(); }
  else if (a === 'back') { ev.preventDefault(); history.length > 1 ? history.back() : go('catalogue'); }
  else if (a === 'quickadd') {
    ev.preventDefault();
    const id = b.dataset.id, tileEl = b.closest('.wp-tile');
    const brief = { id, name: ($('.wp-cap b', tileEl) || {}).textContent || id, localId: id.split('-').pop(), image: ($('img', tileEl) || {}).src ? $('img', tileEl).src.replace(/\/(low|high)\.(webp|png|jpg)$/, '') : '' };
    const known = S.cards[id] || {};
    addLot(Object.assign({}, brief, known, { id }), {});
    b.textContent = '✓'; b.classList.add('ok'); say('Carte ajoutée à la collection');
    let q = tileEl.querySelector('.wp-q'); const e = agg().get(id);
    if (!q) { q = document.createElement('span'); q.className = 'wp-q'; tileEl.appendChild(q); } q.textContent = '×' + e.qty;
    setTimeout(() => { b.textContent = '+'; b.classList.remove('ok'); }, 900);
  }
  else if (a === 'openadd') { const f = $('#wp-addf'); f.innerHTML = lotForm(app._card, null); f.hidden = false; f.scrollIntoView({ block: 'center', behavior: 'smooth' }); $('input[name=qty]', f).focus(); }
  else if (a === 'closeadd') { const f = $('#wp-addf'); f.hidden = true; f.innerHTML = ''; }
  else if (a === 'editlot') { const l = S.lots.find(x => x.id === b.dataset.lot); if (!l) return; const f = $('#wp-addf'); f.innerHTML = lotForm(app._card, l); f.hidden = false; f.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  else if (a === 'dellot') { if (confirm('Supprimer cette ligne de votre collection ?')) { S.lots = S.lots.filter(x => x.id !== b.dataset.lot); save(); render(); } }
  else if (a === 'wish') { const id = b.dataset.id, i = S.wish.indexOf(id); if (i >= 0) S.wish.splice(i, 1); else { S.wish.push(id); if (app._card && app._card.id === id) S.cards[id] = S.cards[id] || app._card; } save(); render(); }
  else if (a === 'refresh') refreshAll();
  else if (a === 'export') { const m = $('#wp-prog'); exportJSON(); if (m) m.innerHTML = 'Sauvegarde téléchargée. <button class="wp-link" data-act="csv">Exporter aussi en CSV (tableur)</button>'; }
  else if (a === 'csv') exportCSV();
  else if (a === 'import') { const i = document.createElement('input'); i.type = 'file'; i.accept = 'application/json,.json'; i.onchange = () => i.files[0] && importFile(i.files[0]); i.click(); }
  else if (a === 'view') { S.view = b.dataset.v; save(); const p = new URLSearchParams(location.hash.split('?')[1] || ''); p.set('v', b.dataset.v); p.delete('n'); location.hash = '#/collection?' + p; }
  else if (a === 'more') { const p = new URLSearchParams(location.hash.split('?')[1] || ''); p.set('n', b.dataset.n); history.replaceState(null, '', '#/collection?' + p); render(true); }
});
function setParams(k, v) {
  const p = new URLSearchParams(location.hash.split('?')[1] || '');
  if (v) p.set(k, v); else p.delete(k);
  p.delete('n');
  history.replaceState(null, '', '#/collection' + (p.toString() ? '?' + p : ''));
  render(true);
}
let ft = null;
document.addEventListener('change', ev => {
  const f = ev.target.closest('[data-f]'); if (f && app.contains(f)) setParams(f.dataset.f, f.type === 'checkbox' ? (f.checked ? '1' : '') : f.value);
});
document.addEventListener('input', ev => {
  const f = ev.target;
  if (f.matches && f.matches('input[data-f="q"]')) { clearTimeout(ft); ft = setTimeout(() => { const pos = f.selectionStart; setParams('q', f.value); const n = $('input[data-f="q"]'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } }, 220); }
  else if (f.id === 'wp-setfilter') { const v = f.value.toLowerCase().trim(); $$('.wp-sets > .wp-set, .wp-sets > .wp-group').forEach(x => { x.hidden = !!v && !x.dataset.k.includes(v); }); $$('.wp-serie').forEach(s => { s.hidden = !$$('.wp-sets > *', s).some(x => !x.hidden); }); }
  else if (f.id === 'wp-inset') { clearTimeout(ft); ft = setTimeout(() => { const r = route(), p = new URLSearchParams(r.q); if (f.value) p.set('s', f.value); else p.delete('s'); p.delete('n'); history.replaceState(null, '', '#/extension/' + encodeURIComponent(r.parts[1]) + (p.toString() ? '?' + p : '')); render(true); const n = $('#wp-inset'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 250); }
});

/* ------------------------------------------------------------------ rendu principal */
let token = 0;
async function render(keepScroll) {
  const my = ++token, r = route(), v = r.parts[0] || 'catalogue';
  if (PRIVATE.test(v) && needLogin()) return;
  badge();
  $$('.wp-tabs a').forEach(a => a.setAttribute('aria-current', (a.dataset.v === (v === 'extension' || v === 'carte' ? 'catalogue' : v)) ? 'page' : 'false'));
  const y = scrollY;
  try {
    if (v === 'collection') vCollection(r);
    else if (v === 'valeur') vValue();
    else if (v === 'souhaits') vWish();
    else if (v === 'extension' && r.parts[1]) await vSet(r.parts[1], r);
    else if (v === 'carte' && r.parts[1]) await vCard(r.parts.slice(1).join('/'), r);
    else await vCatalogue(r);
  } catch (e) { if (my === token) app.innerHTML = errBox(e); }
  if (keepScroll === true) scrollTo(0, y); else if (my === token && !keepScroll) scrollTo(0, 0);
}
function badge() { $$('.wp-tabs a').forEach(a => { const n = $('.wp-n', a); if (n && a.dataset.v === 'collection') n.textContent = S.lots.length ? NUM.format(S.lots.reduce((s, l) => s + l.qty, 0)) : ''; if (n && a.dataset.v === 'souhaits') n.textContent = S.wish.length ? S.wish.length : ''; }); }
async function init() {
  app = $('#wp-app'); status = $('#wp-status');
  if (!app) return;
  const accounts = window.PW && (PW.configured || window.PW_TEST_CLIENT);
  if (accounts) {
    try { const u = await PW.user(); if (u) cloud = { c: await PW.client(), u }; else guest = true; } catch (e) { guest = true; }
  }
  const first = cloud ? !(await (async () => { try { await IDB.open(); return await IDB.get('state:' + cloud.u.id); } catch (e) { return null; } })()) : false;
  await load(); banner();
  if (cloud) {
    if (first) { const L = await readKey('state'); if (L) { S.cards = Object.assign({}, L.cards || {}); S.snaps = Object.assign({}, L.snaps || {}); S.lang = L.lang || S.lang; } } // simple cache de cartes/prix ; la collection locale n'est pas reprise sans accord
    const f = $('.wp-foot'); if (f) f.innerHTML = 'Votre collection est enregistrée sur votre compte PokeWorth (et copiée sur cet appareil pour fonctionner hors ligne). Cartes et prix : TCGdex, avec les prix Cardmarket (en euros) et TCGplayer (en dollars), jamais convertis ni additionnés. Voir la <a href="methode-des-prix.html">méthode des prix</a> et la <a href="confidentialite.html">politique de confidentialité</a>.';
    setSync('pending'); await pullAll(); await checkLegacy();
  } else if (guest) {
    const f = $('.wp-foot'); if (f) f.insertAdjacentHTML('afterbegin', '<b>Le catalogue est public.</b> Pour constituer votre collection, <a href="connexion.html?next=catalogue.html%23%2Fcollection">connectez-vous avec Google ou Apple</a>. ');
  }
  addEventListener('hashchange', () => render());
  render();
}
init();
})();
