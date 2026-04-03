const SUPABASE_URL = 'https://oumksaeuihjmlmkssnsv.supabase.co';
const SUPABASE_KEY = 'sb_publishable_diQX7nKIHfVv7pCbinGjdw_TlqC_Pnd';
const API_BASE_URL = '/api';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const state = {
  session: null,
  profile: null,
  lastDownload: null,
  urlAccessToken: null,
};

const $ = (id) => document.getElementById(id);

const authShell = $('auth-shell');
const appShell = $('app-shell');
const loginForm = $('login-form');
const emailInput = $('email-input');
const passwordInput = $('password-input');
const authError = $('auth-error');
const forgotBtn = $('forgot-btn');
const resetMsg = $('reset-msg');
const userDisplay = $('user-display');
const logoutBtn = $('logout-btn');
const convertForm = $('convert-form');
const submitBtn = $('submit-btn');
const formStatus = $('form-status');
const serviceBadge = $('service-badge');
const apiUrl = $('api-url');
const installBtn = $('install-btn');
const fileInput = $('mz-file');
const fileName = $('file-name');
const afleverCheckbox = convertForm.elements.aflever_zelfde;
const afleverField = $('aflever-field');
const downloadCard = $('download-card');
const downloadName = $('download-name');
const downloadBtn = $('download-btn');
let deferredInstallPrompt = null;

init();

async function init() {
  apiUrl.textContent = 'Render API live via beveiligde proxy.';
  bindEvents();
  setupPwaInstall();
  registerServiceWorker();
  await Promise.all([checkApiHealth(), restoreSession()]);
}

function bindEvents() {
  loginForm.addEventListener('submit', onLogin);
  forgotBtn.addEventListener('click', onForgotPassword);
  logoutBtn.addEventListener('click', onLogout);
  convertForm.addEventListener('submit', onConvert);
  fileInput.addEventListener('change', onFileChange);
  afleverCheckbox.addEventListener('change', toggleDeliveryField);
  downloadBtn.addEventListener('click', downloadLastFile);
  installBtn.addEventListener('click', onInstallClick);
  toggleDeliveryField();
}

async function refreshActiveSession() {
  if (state.urlAccessToken && state.session?.user) {
    return state.session;
  }

  const { data: { session } } = await sb.auth.getSession();
  if (!session) {
    state.session = null;
    return null;
  }

  try {
    const { data, error } = await sb.auth.refreshSession();
    if (error || !data.session) {
      state.session = session;
      return session;
    }
    state.session = data.session;
    return data.session;
  } catch (_error) {
    state.session = session;
    return session;
  }
}

async function tryHubTokenSession(token) {
  try {
    const { data, error } = await sb.auth.getUser(token);
    if (error || !data.user) {
      return null;
    }
    state.urlAccessToken = token;
    return {
      access_token: token,
      user: data.user,
    };
  } catch (_error) {
    return null;
  }
}

function setupPwaInstall() {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    installBtn.classList.remove('hidden');
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    installBtn.classList.add('hidden');
  });

  const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
  if (standalone) {
    installBtn.classList.add('hidden');
  }
}

async function onInstallClick() {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  installBtn.classList.add('hidden');
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('/sw.js');
  } catch (error) {
    console.warn('Service worker registration failed', error);
  }
}

async function restoreSession() {
  const params = new URLSearchParams(location.search);
  const urlToken = params.get('auth_token');
  if (urlToken) {
    state.session = await tryHubTokenSession(urlToken);
    params.delete('auth_token');
    const clean = params.toString();
    history.replaceState(null, '', location.pathname + (clean ? '?' + clean : '') + location.hash);
  }

  const session = state.session || await refreshActiveSession();
  if (session) {
    state.session = session;
    await loadProfile();
    showApp();
  } else {
    showLogin();
  }

  sb.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session) {
      state.urlAccessToken = null;
      state.session = session;
      await loadProfile();
      showApp();
    } else if (event === 'SIGNED_OUT') {
      state.urlAccessToken = null;
      state.session = null;
      state.profile = null;
      state.lastDownload = null;
      showLogin();
    }
  });
}

async function loadProfile() {
  const user = state.session?.user;
  if (!user) return;
  const { data } = await sb
    .from('user_profiles')
    .select('display_name')
    .eq('user_id', user.id)
    .maybeSingle();
  state.profile = data;
}

async function checkApiHealth() {
  try {
    const resp = await fetch(`${API_BASE_URL}/health`);
    if (!resp.ok) throw new Error(`API gaf ${resp.status}`);
    serviceBadge.textContent = 'API live';
    serviceBadge.className = 'service-badge ok';
  } catch (err) {
    serviceBadge.textContent = 'API niet bereikbaar';
    serviceBadge.className = 'service-badge error';
  }
}

async function onLogin(event) {
  event.preventDefault();
  authError.textContent = '';
  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !password) {
    authError.textContent = 'Vul email en wachtwoord in.';
    return;
  }

  setButtonState(loginForm.querySelector('button'), true, 'Bezig...');
  const { error } = await sb.auth.signInWithPassword({ email, password });
  setButtonState(loginForm.querySelector('button'), false, 'Inloggen');

  if (error) {
    authError.textContent = 'Onjuiste inloggegevens.';
  }
}

async function onForgotPassword() {
  const email = emailInput.value.trim();
  if (!email) {
    resetMsg.textContent = 'Vul eerst je e-mailadres in.';
    resetMsg.className = 'reset-msg';
    return;
  }

  resetMsg.textContent = 'Reset-link versturen...';
  resetMsg.className = 'reset-msg';
  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin,
  });
  resetMsg.textContent = error
    ? 'Reset-link kon niet worden verstuurd.'
    : 'Check je inbox voor de reset-link.';
}

async function onLogout() {
  state.urlAccessToken = null;
  await sb.auth.signOut();
}

function onFileChange() {
  const file = fileInput.files?.[0];
  fileName.textContent = file ? file.name : 'Selecteer `.xlsx` bestand';
}

function toggleDeliveryField() {
  afleverField.classList.toggle('hidden', afleverCheckbox.checked);
}

async function onConvert(event) {
  event.preventDefault();
  formStatus.textContent = '';
  formStatus.className = 'form-status';

  const refreshedSession = await refreshActiveSession();
  const accessToken = refreshedSession?.access_token || state.session?.access_token;
  if (!accessToken) {
    formStatus.textContent = 'Geen geldige sessie. Log opnieuw in.';
    formStatus.classList.add('error');
    return;
  }

  const file = fileInput.files?.[0];
  if (!file) {
    formStatus.textContent = 'Selecteer eerst een Excel-bestand.';
    formStatus.classList.add('error');
    return;
  }

  const formData = new FormData(convertForm);
  setButtonState(submitBtn, true, 'Converteren...');
  formStatus.textContent = 'Upload en conversie gestart...';

  try {
    const response = await fetch(`${API_BASE_URL}/convert`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errText = await readError(response);
      throw new Error(errText || `Conversie mislukt (${response.status})`);
    }

    const blob = await response.blob();
    const disposition = response.headers.get('Content-Disposition') || '';
    const filename = parseFilename(disposition) || 'offerte.xlsx';
    state.lastDownload = { blob, filename };
    triggerDownload(blob, filename);
    downloadName.textContent = filename;
    downloadCard.classList.remove('hidden');
    formStatus.textContent = 'Excel gereed. Bestand is gedownload.';
    formStatus.className = 'form-status success';
  } catch (err) {
    formStatus.textContent = err.message || 'Conversie mislukt.';
    formStatus.className = 'form-status error';
  } finally {
    setButtonState(submitBtn, false, 'Converteer naar Excel');
  }
}

async function readError(response) {
  const contentType = response.headers.get('Content-Type') || '';
  if (contentType.includes('application/json')) {
    const data = await response.json();
    return data.detail || data.error || 'Onbekende fout';
  }
  return response.text();
}

function parseFilename(disposition) {
  const utf8 = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8) return decodeURIComponent(utf8[1]);
  const basic = disposition.match(/filename="([^"]+)"/i);
  return basic ? basic[1] : null;
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function downloadLastFile() {
  if (!state.lastDownload) return;
  triggerDownload(state.lastDownload.blob, state.lastDownload.filename);
}

function showApp() {
  authShell.classList.add('hidden');
  appShell.classList.remove('hidden');
  const email = state.session?.user?.email || '';
  userDisplay.textContent = state.profile?.display_name || email;
}

function showLogin() {
  appShell.classList.add('hidden');
  authShell.classList.remove('hidden');
  userDisplay.textContent = '';
  downloadCard.classList.add('hidden');
  loginForm.reset();
  convertForm.reset();
  fileName.textContent = 'Selecteer `.xlsx` bestand';
  resetMsg.textContent = '';
  authError.textContent = '';
  toggleDeliveryField();
}

function setButtonState(button, disabled, label) {
  button.disabled = disabled;
  button.textContent = label;
}
