const STORAGE_KEY = 'peacloud-state-v3';
const LEGACY_KEY = 'peacloud-state-v2';
const PEAOS_MANIFEST = new URL('data/peacloud.json', document.baseURI).href;
const CERT_REGISTRY = new URL('registry.json', document.baseURI).href;
const SYNC_INTERVAL = 30000;
const SYNC_TIMEOUT = 15000;
const PBKDF2_ITERATIONS = 600000;

const app = document.querySelector('#app');
const authDialog = document.querySelector('#authDialog');
const authContent = document.querySelector('#authContent');
const accountButton = document.querySelector('#accountButton');
const certDialog = document.querySelector('#certDialog');
const certForm = document.querySelector('#certForm');
const certFormError = document.querySelector('#certFormError');

const EMPTY_STATE = { user: null, certificates: [], wdp: null };
let state = loadState();
let integration = { status: 'connecting', os: null, registry: null, error: null, lastSync: null };
let syncTimer = null;
let syncController = null;
let syncInFlight = false;

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_KEY);
    if (!raw) return structuredClone(EMPTY_STATE);
    const parsed = JSON.parse(raw);
    return { user: parsed.user || null, certificates: Array.isArray(parsed.certificates) ? parsed.certificates : [], wdp: parsed.wdp || null };
  } catch { return structuredClone(EMPTY_STATE); }
}
function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function esc(value) { return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); }
function makeId(prefix) { return `${prefix}-${crypto.randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase()}`; }
function initials(name) { return String(name || '?').trim().split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase(); }
function bytes(text) { return new TextEncoder().encode(text); }
function toBase64(bytesValue) { let binary = ''; for (const byte of bytesValue) binary += String.fromCharCode(byte); return btoa(binary); }
function fromBase64(value) { const binary = atob(value); return Uint8Array.from(binary, char => char.charCodeAt(0)); }
function randomBytes(length) { const result = new Uint8Array(length); crypto.getRandomValues(result); return result; }

async function passwordHash(password, salt) {
  const key = await crypto.subtle.importKey('raw', bytes(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-512' }, key, 512);
  return toBase64(new Uint8Array(bits));
}
function validPeaCloudEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value); }

async function fetchFresh(url, signal) {
  const separator = url.includes('?') ? '&' : '?';
  const response = await fetch(`${url}${separator}_=${Date.now()}`, { cache: 'no-store', signal });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText || 'respuesta HTTP no válida'} al leer ${new URL(url).pathname}`);
  return response;
}

function validateRemote(os, registry) {
  if (!os || os.product !== 'peaOS') throw new Error('El manifiesto remoto no pertenece a peaOS.');
  if (os.certificate_version !== 3 || os.certificate_type !== 'SigningCertificate' || os.certificate_protocol !== 'R35-SHA512') throw new Error('El manifiesto no usa el protocolo de certificados esperado.');
  if (!registry || registry.schema !== 1 || registry.issuer !== 'peaOS.Officialy-certificates') throw new Error('El registro remoto no pertenece al emisor oficial.');
  if (registry.peaOS_certificate_version !== 3 || registry.certificate_type !== 'SigningCertificate' || registry.authentication !== 'R35-SHA512') throw new Error('El registro remoto no usa R35-SHA512 v3.');
  if (os.certificate_version !== registry.peaOS_certificate_version) throw new Error('Las versiones de certificado no coinciden.');
  if (!Array.isArray(registry.certificates)) throw new Error('El registro remoto tiene un formato inválido.');
  for (const certificate of registry.certificates) {
    if (!certificate || typeof certificate !== 'object') throw new Error('El registro contiene una entrada inválida.');
    if (!/^[a-f0-9]{32}$/.test(certificate.id || '')) throw new Error('Hay un ID de certificado inválido.');
    if (certificate.type !== 'SigningCertificate' || !certificate.status) throw new Error('Hay un tipo o estado de certificado inválido.');
    if (!/^[a-f0-9]{128}$/.test(certificate.sha512 || '')) throw new Error('Hay un SHA-512 inválido.');
  }
}

async function syncPeaOS({ silent = false, force = false } = {}) {
  if (syncInFlight && !force) return;
  if (syncInFlight && force && syncController) syncController.abort();
  syncInFlight = true;
  syncController = new AbortController();
  const controller = syncController;
  const timeout = setTimeout(() => controller.abort(), SYNC_TIMEOUT);
  if (!silent) setIntegration({ status: 'connecting', error: null });
  try {
    const [manifestResponse, registryResponse] = await Promise.all([
      fetchFresh(PEAOS_MANIFEST, controller.signal),
      fetchFresh(CERT_REGISTRY, controller.signal)
    ]);
    const [os, registry] = await Promise.all([manifestResponse.json(), registryResponse.json()]);
    validateRemote(os, registry);
    integration = { status: 'connected', os, registry, error: null, lastSync: new Date() };
  } catch (error) {
    if (error.name !== 'AbortError') {
      const message = error.name === 'TypeError'
        ? 'No se pudo leer el registro local de GitHub Pages. Comprueba la conexión.'
        : (error.message || 'Error de sincronización.');
      integration = { ...integration, status: 'offline', error: message };
    }
  } finally {
    clearTimeout(timeout);
    if (syncController === controller) syncController = null;
    syncInFlight = false;
    render();
  }
}

function setIntegration(patch) { integration = { ...integration, ...patch }; render(); }
function startLiveSync() {
  if (syncTimer) clearInterval(syncTimer);
  syncTimer = setInterval(() => syncPeaOS({ silent: true }), SYNC_INTERVAL);
}
function connectionStatus() { if (integration.status === 'connected') return ['online', 'conectado']; if (integration.status === 'connecting') return ['pending', 'conectando']; return ['offline', 'sin conexión']; }

function render() {
  const [statusClass, statusText] = connectionStatus();
  const official = integration.registry?.certificates?.length ?? 0;
  const drafts = state.certificates.length;
  const active = state.certificates.filter(certificate => certificate.status === 'Active').length;
  const version = integration.os?.version || 'sin conexión';
  const lastSync = integration.lastSync ? integration.lastSync.toLocaleTimeString('es-ES') : 'nunca';
  const pill = document.querySelector('#connectionPill');
  if (pill) { pill.innerHTML = `<i class="${statusClass}"></i><span>${esc(statusText)}</span>`; pill.title = integration.error || 'Estado de sincronización'; }
  app.innerHTML = `<section id="home" class="hero"><div><div class="eyebrow">PEACLOUD / PEAOS</div><h1>identidad de firma, sin ruido.</h1><p>Consulta el registro oficial de peaOS, controla su sincronización y gestiona tus borradores locales desde un único panel.</p><div class="actions"><button class="primary" data-action="account">${state.user ? 'Abrir peaCloud' : 'Crear cuenta peaCloud'} <span>→</span></button><a class="secondary" href="#certificates">Explorar certificados</a></div></div><aside class="hero-card" aria-label="Estado del sistema"><div class="card-label">ESTADO DEL SISTEMA</div><div class="status-line"><span><i class="status-dot ${statusClass}"></i> peaOS</span><strong>${esc(statusText)}</strong></div><div class="row"><span>Versión</span><strong>${esc(version)}</strong></div><div class="row"><span>Firmas oficiales</span><strong>${official}</strong></div><div class="row"><span>Última sync</span><strong>${esc(lastSync)}</strong></div></aside></section><section class="section"><div class="section-head"><div><div class="eyebrow">PROTOCOLO</div><h2>R35-SHA512</h2><div class="muted">registro verificable y separado de WDP.</div></div></div><div class="stats"><div class="card stat"><strong>${esc(version)}</strong><span>peaOS</span></div><div class="card stat"><strong>${integration.os?.certificate_version ?? '—'}</strong><span>cert version</span></div><div class="card stat"><strong>Ed25519</strong><span>algoritmo</span></div><div class="card stat"><strong>${integration.status === 'connected' ? 'OK' : '—'}</strong><span>registro remoto</span></div></div><div class="card wdp"><div class="feature-grid"><div><div class="feature-icon">✓</div><h3>fuente oficial</h3><p class="muted">Los datos proceden del snapshot sincronizado del manifiesto de peaOS y del registry publicado en este mismo sitio.</p></div><div><div class="feature-icon">⌁</div><h3>integridad</h3><p class="muted">Las entradas publicadas incluyen SHA-512 y el registro se valida antes de mostrarse como conectado.</p></div><div><div class="feature-icon">◌</div><h3>separación</h3><p class="muted">WDP no se mezcla con la identidad criptográfica de firma.</p></div></div><div class="actions"><button class="secondary" data-action="sync">Sincronizar ahora</button><a class="secondary" href="${CERT_REGISTRY}" target="_blank" rel="noopener noreferrer">Abrir registry.json ↗</a></div>${integration.error ? `<div class="notice error-notice"><span>${esc(integration.error)}</span><button type="button" class="secondary" data-action="sync">Reintentar</button></div>` : ''}</div></section><section id="certificates" class="section"><div class="section-head"><div><div class="eyebrow">REGISTRY</div><h2>certificados de firma</h2><div class="muted">oficiales remotos + tus borradores locales.</div></div><button class="primary" data-action="new-cert">+ Nuevo certificado</button></div><div class="stats compact"><div class="card stat"><strong>${official}</strong><span>oficiales</span></div><div class="card stat"><strong>${drafts}</strong><span>borradores</span></div><div class="card stat"><strong>${active}</strong><span>activos locales</span></div></div><div class="cert-grid">${integration.registry?.certificates?.map(renderOfficialCertificate).join('') || ''}${state.certificates.map(renderLocalCertificate).join('')}${!official && !drafts ? `<div class="card empty"><div class="empty-icon">◇</div><h3>registro vacío</h3><p>No hay certificados publicados todavía.</p><button type="button" class="secondary" data-action="new-cert">Crear un borrador local</button></div>` : ''}</div></section><section id="wdp" class="section"><div class="card wdp"><div class="eyebrow">WEB DISTRIBUTION PROGRAM</div><h2>WDP va por separado.</h2><p class="muted">Las solicitudes de distribución web no se mezclan con el certificado criptográfico. Aquí solo se guardan borradores locales.</p><button type="button" class="primary" data-action="wdp">${state.wdp ? 'Ver borrador WDP' : 'Crear borrador WDP'} <span>→</span></button>${state.wdp ? `<div class="notice"><span>${esc(state.wdp.origin)}</span><b>${esc(state.wdp.id)}</b></div>` : ''}</div></section><footer class="footer"><b>peaCloud</b> · R35-SHA512 · GitHub registry · sincronización automática · ${new Date().getFullYear()}</footer>`;
  updateAccountButton();
}
function renderOfficialCertificate(certificate) { const status = certificate.status || 'Unknown'; return `<article class="card cert"><div class="cert-top"><span class="badge ${status.toLowerCase()}">${esc(status)}</span><span class="cert-type">SigningCertificate</span></div><h3>${esc(certificate.id)}</h3><div class="cert-meta"><div><span>issuer key</span><b>${esc(certificate.issuer_key_id || '—')}</b></div><div><span>serial</span><b>${esc(certificate.serial || '—')}</b></div><div><span>SHA-512</span><code>${esc(certificate.sha512 || '—')}</code></div><div><span>vigencia</span><b>${esc(certificate.issued_at || '—')} → ${esc(certificate.expires_at || '—')}</b></div></div><div class="source">● GitHub R35 · oficial</div></article>`; }
function renderLocalCertificate(certificate) { return `<article class="card cert local"><div class="cert-top"><span class="badge local-badge">Borrador local</span><span class="cert-type">${esc(certificate.status || 'Active')}</span></div><h3>${esc(certificate.name)}</h3><div class="cert-meta"><div><span>ID</span><b>${esc(certificate.id)}</b></div><div><span>protocolo</span><b>R35-SHA512 · Ed25519</b></div><div><span>creado</span><b>${esc(new Date(certificate.createdAt).toLocaleString('es-ES'))}</b></div></div><button type="button" class="secondary danger-button" data-action="delete-cert" data-id="${esc(certificate.id)}">Eliminar borrador</button></article>`; }
function updateAccountButton() { if (!accountButton) return; accountButton.innerHTML = state.user ? `<span class="signed"><span class="avatar">${esc(initials(state.user.name))}</span>${esc(state.user.name)}</span>` : 'Iniciar sesión'; }
function openAuth(mode) { renderAuth(mode); if (!authDialog.open) authDialog.showModal(); }
function renderAuth(mode) {
  authContent.dataset.mode = mode;
  const login = mode === 'login';
  const passwordHint = 'mínimo 8 caracteres';
  authContent.innerHTML = login ? `<div class="dialog-icon">↗</div><h2>Iniciar sesión</h2><p class="muted">Tu cuenta actual es local a este navegador.</p><label>Correo electrónico<input id="authEmail" type="text" inputmode="email" required autocomplete="email" placeholder="tu@correo.com"></label><label>Contraseña<input id="authPassword" type="password" required autocomplete="current-password"><small>${passwordHint}</small></label><button type="button" class="primary" data-auth="submit">Entrar <span>→</span></button><p id="authError" class="error"></p><p class="switch">¿No tienes cuenta? <button type="button" data-auth="switch">Crear cuenta</button></p>` : `<div class="dialog-icon">✦</div><h2>Crear cuenta peaCloud</h2><p class="muted">Cuenta local. Usa cualquier correo electrónico válido y una contraseña de al menos 8 caracteres.</p><label>Nombre<input id="authName" required maxlength="60" autocomplete="name" placeholder="Tu nombre"></label><label>Correo electrónico<input id="authEmail" type="text" inputmode="email" required autocomplete="email" placeholder="tu@correo.com"></label><label>Contraseña<input id="authPassword" type="password" required autocomplete="new-password"><small>${passwordHint}</small></label><button type="button" class="primary" data-auth="submit">Crear cuenta <span>→</span></button><p id="authError" class="error"></p><p class="switch">¿Ya tienes cuenta? <button type="button" data-auth="switch">Iniciar sesión</button></p>`;
}
function showAuthError(message) { const error = document.querySelector('#authError'); if (error) error.textContent = message; }
async function submitAuth() {
  const mode = authContent.dataset.mode;
  const email = document.querySelector('#authEmail')?.value.trim() || '';
  const password = document.querySelector('#authPassword')?.value || '';
  if (!email) return showAuthError('Escribe tu correo electrónico.');
  if (!validPeaCloudEmail(email)) return showAuthError('El correo electrónico no tiene un formato válido. Ejemplo: nombre@dominio.com');
  if (password.length < 8) return showAuthError('La contraseña debe tener al menos 8 caracteres.');
  if (mode === 'signup') {
    const name = document.querySelector('#authName')?.value.trim() || '';
    if (!name) return showAuthError('Escribe tu nombre.');
    const salt = randomBytes(32);
    const hash = await passwordHash(password, salt);
    state.user = { name, email, salt: toBase64(salt), hash, createdAt: new Date().toISOString() };
    saveState(); authDialog.close(); render(); return;
  }
  if (!state.user || state.user.email !== email) return showAuthError('No existe una cuenta local con ese correo.');
  const hash = await passwordHash(password, fromBase64(state.user.salt));
  if (hash !== state.user.hash) return showAuthError('La contraseña no coincide.');
  authDialog.close(); render();
}
function openCertificateDialog() { certForm.reset(); certFormError.textContent = ''; certDialog.showModal(); }
function createLocalCertificate() { const name = new FormData(certForm).get('name')?.toString().trim() || ''; if (!name) { certFormError.textContent = 'Escribe un nombre.'; return; } state.certificates.unshift({ id: makeId('CERT'), name, status: 'Active', createdAt: new Date().toISOString() }); saveState(); certDialog.close(); render(); }
function openWdp() { const origin = state.wdp?.origin || window.location.origin; const value = window.prompt('Origen HTTPS para el borrador WDP:', origin); if (value === null) return; try { const url = new URL(value); if (url.protocol !== 'https:') throw new Error(); state.wdp = { id: makeId('WDP'), origin: url.origin, createdAt: state.wdp?.createdAt || new Date().toISOString() }; saveState(); render(); } catch { window.alert('El origen debe ser una URL HTTPS válida.'); } }

document.addEventListener('click', event => {
  const actionElement = event.target.closest('[data-action],[data-auth]');
  if (!actionElement) return;
  const action = actionElement.dataset.action;
  const authAction = actionElement.dataset.auth;
  if (action === 'account') openAuth(state.user ? 'login' : 'signup');
  if (action === 'sync') syncPeaOS({ force: true });
  if (action === 'new-cert') openCertificateDialog();
  if (action === 'wdp') openWdp();
  if (action === 'delete-cert') { state.certificates = state.certificates.filter(certificate => certificate.id !== actionElement.dataset.id); saveState(); render(); }
  if (authAction === 'submit') submitAuth();
  if (authAction === 'switch') renderAuth(authContent.dataset.mode === 'login' ? 'signup' : 'login');
});
certForm.addEventListener('submit', event => { event.preventDefault(); createLocalCertificate(); });
authDialog.addEventListener('click', event => { if (event.target === authDialog) authDialog.close(); });
certDialog.addEventListener('click', event => { if (event.target === certDialog) certDialog.close(); });

render();
syncPeaOS();
startLiveSync();
