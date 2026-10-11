/* PokeWorth · authentification (Supabase Auth : Google et Apple) — module partagé par toutes les pages.
   - Aucune clé secrète ici : seule la clé publique « anon » est utilisée, les droits sont appliqués par la base (RLS).
   - Flux PKCE : la session est échangée côté Supabase ; l'identité n'est jamais déduite d'une simple donnée du navigateur,
     chaque appel de données est vérifié côté serveur avec le jeton de session. */
(() => {
'use strict';
const cfg = window.PW_CONFIG || {};
const configured = !!(cfg.supabaseUrl && cfg.supabaseAnonKey);
const KEY = 'pw-auth';
const VERQ = ((document.currentScript && document.currentScript.src.split('?v=')[1]) || '1');
const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);

/* adresse de retour : uniquement un chemin interne du site (évite toute redirection ouverte) */
function safeNext(n) {
  if (typeof n !== 'string' || !n) return '';
  if (n.length > 300 || /^[a-z][a-z0-9+.-]*:/i.test(n) || n.startsWith('//') || n.includes('\\') || /[\u0000-\u001f]/.test(n)) return '';
  return /^\/?[A-Za-z0-9_\-./]*(\?[^#]*)?(#.*)?$/.test(n) ? n.replace(/^\//, '') : '';
}
function setNext(n) { try { const s = safeNext(n); if (s) sessionStorage.setItem('pw-next', s); } catch (e) { /* stockage indisponible */ } }
function takeNext() { try { const s = safeNext(sessionStorage.getItem('pw-next') || ''); sessionStorage.removeItem('pw-next'); return s; } catch (e) { return ''; } }

/* état de session lisible sans charger la bibliothèque (affichage de l'en-tête seulement, jamais une preuve d'identité) */
function hint() {
  if (!configured) return null;
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!s || !s.user) return null;
    const m = s.user.user_metadata || {};
    return { id: s.user.id, email: s.user.email || '', name: m.full_name || m.name || '' };
  } catch (e) { return null; }
}

let cp = null;
function loadLib() {
  return new Promise((res, rej) => {
    if (window.supabaseJs) return res();
    const s = document.createElement('script');
    s.src = 'vendor/supabase.min.js?v=' + VERQ;
    s.onload = () => res(); s.onerror = () => rej(new Error('Impossible de charger le module de connexion.'));
    document.head.appendChild(s);
  });
}
function client() {
  if (!configured && !(isLocal && window.PW_TEST_CLIENT)) return Promise.reject(new Error('Connexion non configurée'));
  if (isLocal && window.PW_TEST_CLIENT) return Promise.resolve(window.PW_TEST_CLIENT);
  if (!cp) cp = loadLib().then(() => window.supabaseJs.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: KEY }
  }));
  return cp;
}
/* utilisateur vérifié par le serveur d'authentification (et non simplement lu dans le navigateur) */
async function user() {
  const c = await client();
  const { data, error } = await c.auth.getUser();
  if (error || !data || !data.user) return null;
  return data.user;
}
const ERR = {
  access_denied: 'Connexion annulée ou refusée.',
  server_error: 'Le fournisseur de connexion a rencontré une erreur. Réessayez dans un instant.',
  temporarily_unavailable: 'Service momentanément indisponible. Réessayez dans un instant.',
  identity_already_exists: 'Cette identité est déjà liée à un autre compte PokeWorth.',
  provider_email_needs_verification: 'L\'adresse e-mail du fournisseur n\'est pas vérifiée.',
  bad_oauth_callback: 'Le retour de connexion est invalide. Recommencez depuis la page de connexion.',
  bad_oauth_state: 'La session de connexion a expiré. Recommencez depuis la page de connexion.',
  flow_state_expired: 'La session de connexion a expiré. Recommencez depuis la page de connexion.',
  flow_state_not_found: 'La session de connexion a expiré. Recommencez depuis la page de connexion.',
  manual_linking_disabled: 'La liaison de comptes n\'est pas activée sur ce service.',
};
function errText(code, desc) { return ERR[code] || (desc ? 'Connexion impossible : ' + String(desc).replace(/\+/g, ' ').slice(0, 160) : 'Connexion impossible. Réessayez.'); }
async function signIn(provider, next) {
  if (!['google', 'apple'].includes(provider)) throw new Error('Fournisseur inconnu');
  if (next) setNext(next);
  const c = await client();
  const { error } = await c.auth.signInWithOAuth({ provider, options: { redirectTo: location.origin + '/connexion.html' } });
  if (error) throw error;
}
async function link(provider) {
  const c = await client();
  const { error } = await c.auth.linkIdentity({ provider, options: { redirectTo: location.origin + '/parametres.html' } });
  if (error) throw error;
}
async function signOut(scope) {
  try { const c = await client(); await c.auth.signOut({ scope: scope || 'local' }); } catch (e) { /* on efface quand même localement */ }
  try { localStorage.removeItem(KEY); } catch (e) { /* rien */ }
}
/* garde des pages privées : redirige vers la connexion puis revient ici après authentification */
async function require(nextOverride) {
  const here = nextOverride || (location.pathname.replace(/^\//, '') || 'index.html') + location.search + location.hash;
  if (!configured && !(isLocal && window.PW_TEST_CLIENT)) { location.replace('connexion.html'); return null; }
  let u = null; try { u = await user(); } catch (e) { /* hors ligne */ }
  if (!u) { setNext(here); location.replace('connexion.html?next=' + encodeURIComponent(safeNext(here))); return null; }
  return u;
}
function paintHeader() {
  const a = document.getElementById('pw-acct'); if (!a) return;
  const h = hint();
  if (h) { a.textContent = 'Mon compte'; a.href = 'tableau-de-bord.html'; a.classList.add('on'); a.title = h.email || ''; }
  else { a.textContent = 'Connexion'; a.href = 'connexion.html'; a.classList.remove('on'); }
}
paintHeader();
addEventListener('storage', e => { if (e.key === KEY) paintHeader(); });
window.PW = { configured, client, user, signIn, link, signOut, require, hint, safeNext, setNext, takeNext, errText, paintHeader };
})();
