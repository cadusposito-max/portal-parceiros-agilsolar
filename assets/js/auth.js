// ==========================================
// AUTENTICAÇÃO
// ==========================================

// --- Proteção contra brute-force (persiste no sessionStorage para resistir a F5) ---
const _BF_KEY_ATTEMPTS = 'bf_attempts';
const _BF_KEY_UNTIL    = 'bf_until';
const _RECOVERY_KEY_UNTIL = 'recovery_until';
const RECOVERY_COOLDOWN_SECONDS = 45;

function _bfGetAttempts() { return parseInt(sessionStorage.getItem(_BF_KEY_ATTEMPTS) || '0', 10); }
function _bfSetAttempts(n) { sessionStorage.setItem(_BF_KEY_ATTEMPTS, String(n)); }
function _bfGetUntil()    { return parseInt(sessionStorage.getItem(_BF_KEY_UNTIL) || '0', 10); }
function _bfSetUntil(ts)  { sessionStorage.setItem(_BF_KEY_UNTIL, String(ts)); }
function _bfClear()       { sessionStorage.removeItem(_BF_KEY_ATTEMPTS); sessionStorage.removeItem(_BF_KEY_UNTIL); }
function _recoveryGetUntil() { return parseInt(sessionStorage.getItem(_RECOVERY_KEY_UNTIL) || '0', 10); }
function _recoverySetUntil(ts) { sessionStorage.setItem(_RECOVERY_KEY_UNTIL, String(ts)); }

let _loginLockout = false;

// --- Flag para fluxo de recuperação de senha ---
let _isPasswordRecovery = false;

// --- Cloudflare Turnstile: token capturado pelo widget, validado pelo Supabase no backend ---
let _captchaToken = null;

function onTurnstileSuccess(token) {
  _captchaToken = token;
}

function onTurnstileExpiry() {
  _captchaToken = null;
}

function onTurnstileError() {
  _captchaToken = null;
  const errorEl  = document.getElementById('login-error');
  const btnSubmit = document.getElementById('btn-submit-login');
  if (errorEl) {
    errorEl.innerText = 'Falha na verificação de segurança. Recarregue a página e tente novamente.';
    errorEl.classList.remove('hidden');
  }
  // Desabilita o botão até o usuário recarregar — impede envio sem captchaToken
  if (btnSubmit) btnSubmit.disabled = true;
}

// Guard pra não disparar logout automático em loop
let _sessionLossHandled = false;

// Detecta evento PASSWORD_RECOVERY (fluxo PKCE / magic-link do Supabase)
// e perda de sessão pós-login (refresh_token expirou/revogado)
supabaseClient.auth.onAuthStateChange((event, session) => {
  if (event === 'PASSWORD_RECOVERY') {
    _isPasswordRecovery = true;
    showPasswordResetForm();
    return;
  }

  // Detecção de sessão perdida: só age se o usuário ESTAVA logado (state.currentUser set).
  // Cobre:
  //  - SIGNED_OUT disparado pelo Supabase quando refresh falha
  //  - TOKEN_REFRESHED vindo com session=null (refresh quebrou)
  // Não atua durante o boot/login (state.currentUser ainda é null) nem em recovery.
  const lostSession =
    (event === 'SIGNED_OUT') ||
    (event === 'TOKEN_REFRESHED' && !session);

  if (lostSession && state.currentUser && !_isPasswordRecovery && !_sessionLossHandled) {
    _sessionLossHandled = true;
    try { showToast('Sessão expirada. Faça login novamente.'); } catch (_) {}
    // Reload leva pra tela de login (mesmo fluxo do handleLogout, sem chamar signOut duas vezes)
    setTimeout(() => window.location.reload(), 800);
  }
});

// --- Timeout de inatividade ---
let _inactivityTimer = null;

let _authLucideCreateIconsRaf = null;

function queueAuthLucideCreateIcons() {
  if (!window.lucide || typeof window.lucide.createIcons !== 'function') return;
  if (_authLucideCreateIconsRaf) return;

  _authLucideCreateIconsRaf = window.requestAnimationFrame(() => {
    _authLucideCreateIconsRaf = null;
    window.lucide.createIcons();
  });
}

function _authSetButtonWithIcon(btn, iconName, label, iconClass = 'w-5 h-5 stroke-[3px]') {
  if (!btn) return;
  btn.innerHTML = `<i data-lucide="${iconName}" class="${iconClass}"></i> <span data-auth-btn-label>${label}</span>`;
  queueAuthLucideCreateIcons();
}

function _authUpdateButtonLabel(btn, label) {
  if (!btn) return false;
  const labelEl = btn.querySelector('[data-auth-btn-label]');
  if (!labelEl) return false;
  labelEl.textContent = label;
  return true;
}


let _activeCheckFailureReason = null;

function _isLegacyMissingActiveCheckRpcError(error) {
  const code = String(error?.code || '');
  if (code === 'PGRST202' || code === '42883') return true;

  const detail = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
  if (!detail.includes('is_current_user_active')) return false;

  return detail.includes('not found')
    || detail.includes('does not exist')
    || detail.includes('could not find')
    || detail.includes('schema cache')
    || detail.includes('no function matches');
}

function _isCurrentSessionBanned() {
  const bannedUntilRaw = state.currentUser?.banned_until;
  if (!bannedUntilRaw) return false;

  const bannedUntilTs = Date.parse(bannedUntilRaw);
  if (!Number.isFinite(bannedUntilTs)) return false;

  return bannedUntilTs > Date.now();
}

async function ensureUserIsActive() {
  _activeCheckFailureReason = null;

  try {
    const { data, error } = await supabaseClient.rpc('is_current_user_active');

    if (error) {
      if (_isLegacyMissingActiveCheckRpcError(error)) {
        const isInactiveLegacy = _isCurrentSessionBanned();
        if (isInactiveLegacy) {
          _activeCheckFailureReason = 'inactive';
          return false;
        }
        return true; // compatibilidade com base legada sem migration completa
      }

      _activeCheckFailureReason = 'rpc_error';
      return false;
    }

    const isActive = data !== false;
    if (!isActive) _activeCheckFailureReason = 'inactive';
    return isActive;
  } catch (_) {
    _activeCheckFailureReason = 'rpc_error';
    return false;
  }
}

function _getInactiveSessionMessage(reason) {
  if (reason === 'rpc_error') {
    return 'Nao foi possivel validar o status da conta. Tente novamente.';
  }
  return 'Usuario desativado. Contate o administrador.';
}

async function blockInactiveSession(reason = _activeCheckFailureReason || 'inactive') {
  _sessionLossHandled = true; // suprime listener (fluxo dedicado de conta inativa)
  await supabaseClient.auth.signOut();
  if (typeof resetUser === 'function') resetUser();
  state.currentUser = null;
  document.getElementById('splash-screen').classList.add('hidden');
  document.getElementById('app-content').classList.add('hidden');
  document.getElementById('login-screen').classList.remove('hidden');
  const errorEl = document.getElementById('login-error');
  errorEl.innerText = _getInactiveSessionMessage(reason);
  errorEl.classList.remove('hidden');
  if (typeof chatTeardown === 'function') chatTeardown(true);
}
function startInactivityWatcher() {
  const MS = SESSION_TIMEOUT_HOURS * 60 * 60 * 1000;
  const reset = () => {
    clearTimeout(_inactivityTimer);
    _inactivityTimer = setTimeout(async () => {
      showToast('Sessão encerrada por inatividade.');
      await handleLogout();
    }, MS);
  };
  ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'].forEach(ev => {
    document.addEventListener(ev, reset, { passive: true });
  });
  reset();
}

async function checkAuth() {
  try {
    // Detecta link de recuperação de senha (fluxo implícito via hash da URL)
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    if (hashParams.get('type') === 'recovery') {
      await supabaseClient.auth.getSession(); // troca o token de recuperação
      _isPasswordRecovery = true;
      showPasswordResetForm();
      return;
    }

    const { data: { session } } = await supabaseClient.auth.getSession();

    // Guard: onAuthStateChange pode ter detectado PASSWORD_RECOVERY (PKCE)
    if (_isPasswordRecovery) return;

    if (session && session.user) {
      state.currentUser = session.user;
      const isActive = await ensureUserIsActive();
      if (!isActive) {
        await blockInactiveSession();
        return;
      }
      // Lê role e franquia_id do app_metadata (JWT)
      const appMeta     = session.user.app_metadata || {};
      state.isAdmin     = appMeta.role === 'admin';
      state.isGestor    = appMeta.role === 'gestor';
      state.isTecnico   = appMeta.role === 'tecnico';
      state.isCoordenador = appMeta.role === 'coordenador_tecnico';
      state.role        = appMeta.role || 'vendedor';
      state.franquiaId  = appMeta.franquia_id || null;
      // Técnico fica preso ao ambiente O&M, aba OS.
      if (state.isTecnico) { state.environment = 'om'; state.omActiveTab = 'os'; }
      state.adminPrefsLoaded = false;
      if (state.isAdmin && state.franquiaId && !state.adminKitsFranquia) {
        state.adminKitsFranquia = state.franquiaId;
      }
      if (state.isAdmin || state.isGestor) {
        const adminBtn = document.getElementById('admin-toggle-btn');
        if (adminBtn) adminBtn.classList.remove('hidden');
      }
      document.getElementById('login-screen').classList.add('hidden');
      document.getElementById('splash-screen').classList.remove('hidden');

      startInactivityWatcher();
      await Promise.all([
        initSplash(),
        fetchFranquia(),
        fetchFranquiasCatalog(),
        fetchProfile(),
        fetchProducts(),
        fetchClientes(),
        fetchPropostas(),
        fetchVendas(),
        fetchComponentes(),
        fetchComunicados(),
        updateVendedorStats(session.user.email),
      ]);
      if (typeof omRefreshAccess === 'function') await omRefreshAccess();
      if (typeof finRefreshAccess === 'function') await finRefreshAccess();
      renderHeaderUser();
      renderTabs();                 // prepara o header atrás do overlay
      if (typeof launcherShouldShow === 'function' && launcherShouldShow()) {
        showLauncher();             // espera a escolha; renderContent() roda no enterEnvironment()
      } else {
        renderContent();            // caminho atual: 1 ambiente / técnico
      }
      if (typeof chatBoot === 'function') await chatBoot();
      if (typeof identifyUser === 'function') identifyUser(session.user);
    } else {
      document.getElementById('login-screen').classList.remove('hidden');
      document.getElementById('splash-screen').classList.add('hidden');
      document.getElementById('app-content').classList.add('hidden');
      if (typeof chatTeardown === 'function') chatTeardown(true);
      if (typeof resetUser === 'function') resetUser();
    }
  } catch (error) {
    console.error('Erro auth:', error);
    const errorEl = document.getElementById('login-error');
    errorEl.innerText = 'Não foi possível conectar ao servidor. Tente novamente.';
    errorEl.classList.remove('hidden');
  }
}

// Ao carregar a página, verifica se ainda há lockout ativo
(function _bfCheckOnLoad() {
  const until = _bfGetUntil();
  if (until && Date.now() < until) {
    _loginLockout = true;
    const btnSubmit = document.getElementById('btn-submit-login');
    const errorEl   = document.getElementById('login-error');
    let segundos = Math.ceil((until - Date.now()) / 1000);
    if (errorEl) { errorEl.innerText = `Muitas tentativas. Aguarde ${segundos}s.`; errorEl.classList.remove('hidden'); }
    if (btnSubmit) {
      btnSubmit.disabled = true;
      _authSetButtonWithIcon(btnSubmit, 'lock', `BLOQUEADO (${segundos}s)`);
    }
    const iv = setInterval(() => {
      segundos--;
      if (errorEl) errorEl.innerText = `Muitas tentativas. Aguarde ${segundos}s.`;
      if (btnSubmit && !_authUpdateButtonLabel(btnSubmit, `BLOQUEADO (${segundos}s)`)) {
        _authSetButtonWithIcon(btnSubmit, 'lock', `BLOQUEADO (${segundos}s)`);
      }
      if (segundos <= 0) {
        clearInterval(iv);
        _loginLockout = false;
        _bfClear();
        if (btnSubmit) {
          btnSubmit.disabled = false;
          _authSetButtonWithIcon(btnSubmit, 'log-in', 'ENTRAR NO SISTEMA');
        }
        if (errorEl) errorEl.classList.add('hidden');
      }
    }, 1000);
  }
})();

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  if (_loginLockout) return;

  const email     = document.getElementById('login-email').value.trim();
  const password  = document.getElementById('login-password').value;
  const errorEl   = document.getElementById('login-error');
  const btnSubmit = document.getElementById('btn-submit-login');

  // Limpa estilos inline que possam ter sido definidos pelo fluxo de reset de senha
  errorEl.style.color       = '';
  errorEl.style.borderColor = '';
  errorEl.style.background  = '';

  // Bloqueia envio sem token Turnstile — o Supabase valida no backend
  if (!_captchaToken) {
    errorEl.innerText = 'Por favor, conclua a verificação de segurança antes de entrar.';
    errorEl.classList.remove('hidden');
    return;
  }

  errorEl.classList.add('hidden');
  btnSubmit.innerHTML = `<i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i> AUTENTICANDO...`;
  btnSubmit.disabled  = true;
  queueAuthLucideCreateIcons();

  // Consume o token imediatamente — é single-use; Turnstile gerará novo após reset
  const captchaToken = _captchaToken;
  _captchaToken = null;

  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email,
    password,
    options: { captchaToken },
  });

  if (error) {
    if (typeof captureEvent === 'function') {
      captureEvent('login_failed', { source: 'portal' });
    }

    // Token consumido — força novo desafio Turnstile antes da próxima tentativa
    if (typeof window.turnstile !== 'undefined') window.turnstile.reset();

    const attempts = _bfGetAttempts() + 1;
    _bfSetAttempts(attempts);
    const restantes = MAX_LOGIN_ATTEMPTS - attempts;

    if (attempts >= MAX_LOGIN_ATTEMPTS) {
      _loginLockout = true;
      const until = Date.now() + LOGIN_LOCKOUT_SECONDS * 1000;
      _bfSetUntil(until);
      let segundos = LOGIN_LOCKOUT_SECONDS;
      errorEl.innerText = `Muitas tentativas. Aguarde ${segundos}s para tentar novamente.`;
      errorEl.classList.remove('hidden');

      _authSetButtonWithIcon(btnSubmit, 'lock', `BLOQUEADO (${segundos}s)`);

      const lockInterval = setInterval(() => {
        segundos--;
        errorEl.innerText = `Muitas tentativas. Aguarde ${segundos}s para tentar novamente.`;
        if (!_authUpdateButtonLabel(btnSubmit, `BLOQUEADO (${segundos}s)`)) {
          _authSetButtonWithIcon(btnSubmit, 'lock', `BLOQUEADO (${segundos}s)`);
        }
        if (segundos <= 0) {
          clearInterval(lockInterval);
          _loginLockout = false;
          _bfClear();
          btnSubmit.disabled = false;
          _authSetButtonWithIcon(btnSubmit, 'log-in', 'ENTRAR NO SISTEMA');
          errorEl.classList.add('hidden');
        }
      }, 1000);
    } else {
      const aviso = restantes > 0
        ? ` (${restantes} tentativa${restantes > 1 ? 's' : ''} restante${restantes > 1 ? 's' : ''})`
        : '';
      errorEl.innerText = `E-mail ou senha incorretos.${aviso}`;
      errorEl.classList.remove('hidden');
      btnSubmit.disabled = false;
      btnSubmit.innerHTML = `<i data-lucide="log-in" class="w-5 h-5 stroke-[3px]"></i> ENTRAR NO SISTEMA`;
      queueAuthLucideCreateIcons();
    }
  } else {
    _bfClear();
    errorEl.classList.add('hidden');
    state.currentUser = data.user;

    // Verifica se o usuário tem 2FA ativo e sessão ainda em aal1
    const { data: mfaData } = await supabaseClient.auth.mfa.listFactors();
    const hasVerifiedTotp = mfaData?.totp?.some(f => f.status === 'verified');
    const { data: aalData } = await supabaseClient.auth.mfa.getAuthenticatorAssuranceLevel();
    const needsMfa = hasVerifiedTotp && aalData?.currentLevel === 'aal1' && aalData?.nextLevel === 'aal2';

    if (needsMfa) {
      // Inicia desafio 2FA e mostra tela de código
      const { data: challengeData, error: chErr } = await supabaseClient.auth.mfa.challenge({
        factorId: mfaData.totp.find(f => f.status === 'verified').id
      });
      if (chErr) {
        errorEl.innerText = 'Erro ao iniciar 2FA: ' + chErr.message;
        errorEl.classList.remove('hidden');
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = `<i data-lucide="log-in" class="w-5 h-5 stroke-[3px]"></i> ENTRAR NO SISTEMA`;
        queueAuthLucideCreateIcons();
        return;
      }
      _mfaFactorId    = mfaData.totp.find(f => f.status === 'verified').id;
      _mfaChallengeId = challengeData.id;
      _pendingUser    = data.user;
      document.getElementById('login-form').classList.add('hidden');
      document.getElementById('mfa-step').classList.remove('hidden');
      document.getElementById('mfa-login-code').focus();
      btnSubmit.disabled = false;
      btnSubmit.innerHTML = `<i data-lucide="log-in" class="w-5 h-5 stroke-[3px]"></i> ENTRAR NO SISTEMA`;
      queueAuthLucideCreateIcons();
      return;
    }

    await _finishLogin(data.user, email);
  }
});

// Login por passkey (Face ID / biometria / chave de seguranca). ADITIVO: nao
// substitui o login por senha. Funciona no dominio de producao (RP ID); no de
// teste a origem nao bate e falha de forma graciosa -> usuario segue com senha.
let _passkeyInFlight = false;

// Detecta cancelamento do usuario (nao e falha de verdade): o WebAuthn rejeita
// com NotAllowedError tanto em cancelamento quanto em timeout.
function _isPasskeyCancel(err) {
  if (!err) return false;
  const name = String(err.name || err.code || '').toLowerCase();
  const msg  = String(err.message || '').toLowerCase();
  return name.includes('notallowed') || name.includes('abort') ||
         msg.includes('cancel') || msg.includes('not allowed') ||
         msg.includes('abort') || msg.includes('timed out') || msg.includes('timeout');
}

async function loginWithPasskey() {
  const errorEl = document.getElementById('login-error');
  const btn     = document.getElementById('btn-login-passkey');

  // Evita duas cerimonias WebAuthn ao mesmo tempo (causa "request already pending"
  // que faz a 2a tentativa falhar sem abrir o Face ID).
  if (_passkeyInFlight) return;

  if (!supabaseClient.auth || typeof supabaseClient.auth.signInWithPasskey !== 'function') {
    if (errorEl) { errorEl.innerText = 'Login por passkey indisponível neste navegador/versão.'; errorEl.classList.remove('hidden'); }
    return;
  }

  // O projeto exige CAPTCHA (Turnstile) nas chamadas de Auth. O widget resolve
  // sozinho ao abrir a tela; reaproveitamos esse token (single-use) tambem no passkey.
  if (!_captchaToken) {
    if (errorEl) { errorEl.innerText = 'Aguarde a verificação de segurança concluir e toque novamente.'; errorEl.classList.remove('hidden'); }
    return;
  }
  const captchaToken = _captchaToken;
  _captchaToken = null;

  _passkeyInFlight = true;
  if (errorEl) errorEl.classList.add('hidden');
  const originalHtml = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i> <span>VERIFICANDO...</span>`;
    queueAuthLucideCreateIcons();
  }

  try {
    const { data, error } = await supabaseClient.auth.signInWithPasskey({ options: { captchaToken } });
    if (error) {
      console.error('[passkey login] erro:', error.code || error.name, error.message, error);
      if (errorEl) {
        if (_isPasskeyCancel(error)) {
          errorEl.innerText = 'Login por Face ID cancelado. Toque no botão para tentar de novo.';
        } else {
          // Mostra o detalhe para diagnostico (ex.: webauthn_credential_not_found = passkey de outro dominio).
          const det = error.code || error.name || error.message || 'desconhecido';
          errorEl.innerText = 'Falha no passkey (' + det + '). Use e-mail e senha.';
        }
        errorEl.classList.remove('hidden');
      }
      return;
    }
    if (!data || !data.user) {
      if (errorEl) { errorEl.innerText = 'Não foi possível entrar com passkey. Use e-mail e senha.'; errorEl.classList.remove('hidden'); }
      return;
    }
    _bfClear();
    // Espelha o fluxo de senha: fetchProfile()/etc. dependem de state.currentUser.
    state.currentUser = data.user;
    await _finishLogin(data.user, data.user.email || '');
  } catch (e) {
    if (errorEl) {
      errorEl.innerText = _isPasskeyCancel(e)
        ? 'Login por Face ID cancelado. Toque no botão para tentar de novo.'
        : 'Não foi possível entrar com passkey. Use e-mail e senha.';
      errorEl.classList.remove('hidden');
    }
  } finally {
    // Libera sempre, mesmo em erro/cancelamento, para a proxima tentativa ser limpa.
    _passkeyInFlight = false;
    // Token Turnstile e single-use: reseta para gerar um novo para a proxima tentativa.
    if (typeof window.turnstile !== 'undefined') { try { window.turnstile.reset(); } catch (_) {} }
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
      queueAuthLucideCreateIcons();
    }
  }
}

let _mfaFactorId    = null;
let _mfaChallengeId = null;
let _pendingUser    = null;

async function submitMfaCode() {
  const code    = (document.getElementById('mfa-login-code')?.value || '').trim();
  const errEl   = document.getElementById('mfa-login-error');
  const btn     = document.getElementById('btn-mfa-submit');
  errEl.classList.add('hidden');
  if (code.length !== 6) { errEl.innerText = 'Insira o código de 6 dígitos.'; errEl.classList.remove('hidden'); return; }

  btn.disabled  = true;
  btn.innerHTML = `<i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i> VERIFICANDO...`;
  queueAuthLucideCreateIcons();

  const { error } = await supabaseClient.auth.mfa.verify({
    factorId:    _mfaFactorId,
    challengeId: _mfaChallengeId,
    code,
  });

  if (error) {
    errEl.innerText = 'Código inválido. Tente novamente.';
    errEl.classList.remove('hidden');
    btn.disabled  = false;
    btn.innerHTML = `<i data-lucide="check" class="w-5 h-5 stroke-[3px]"></i> CONFIRMAR`;
    queueAuthLucideCreateIcons();
    return;
  }

  await _finishLogin(_pendingUser, _pendingUser.email);
}

function cancelMfaStep() {
  document.getElementById('mfa-step').classList.add('hidden');
  document.getElementById('login-form').classList.remove('hidden');
  document.getElementById('mfa-login-code').value = '';
  document.getElementById('mfa-login-error').classList.add('hidden');
  _mfaFactorId = null; _mfaChallengeId = null; _pendingUser = null;
  supabaseClient.auth.signOut();
  if (typeof resetUser === 'function') resetUser();
}

async function _finishLogin(user, email) {
  const isActive = await ensureUserIsActive();
  if (!isActive) {
    await blockInactiveSession();
    return;
  }

  const appMeta     = user.app_metadata || {};
  state.isAdmin     = appMeta.role === 'admin';
  state.isGestor    = appMeta.role === 'gestor';
  state.isTecnico   = appMeta.role === 'tecnico';
  state.isCoordenador = appMeta.role === 'coordenador_tecnico';
  state.role        = appMeta.role || 'vendedor';
  state.franquiaId  = appMeta.franquia_id || null;
  // Técnico fica preso ao ambiente O&M, aba OS.
  if (state.isTecnico) { state.environment = 'om'; state.omActiveTab = 'os'; }
  state.adminPrefsLoaded = false;
  if (state.isAdmin && state.franquiaId && !state.adminKitsFranquia) {
    state.adminKitsFranquia = state.franquiaId;
  }
  if (state.isAdmin || state.isGestor) {
    const adminBtn = document.getElementById('admin-toggle-btn');
    if (adminBtn) adminBtn.classList.remove('hidden');
  }

  await updateVendedorStats(email);
  startInactivityWatcher();

  document.getElementById('login-screen').classList.add('opacity-0');
  await new Promise(r => setTimeout(r, 500));
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('splash-screen').classList.remove('hidden');
  await Promise.all([
    initSplash(),
    fetchFranquia(),
    fetchFranquiasCatalog(),
    fetchProfile(),
    fetchProducts(),
    fetchClientes(),
    fetchPropostas(),
    fetchVendas(),
    fetchComponentes(),
    fetchComunicados(),
  ]);
  if (typeof omRefreshAccess === 'function') await omRefreshAccess();
  // Espelha o caminho de boot/restore: resolve tambem o acesso ao Financeiro
  // (state.canFin via fin_can_use_current_user). Sem isto, o ambiente/funil
  // Financeiro so aparecia apos um refresh.
  if (typeof finRefreshAccess === 'function') await finRefreshAccess();
  renderHeaderUser();
  renderTabs();                 // prepara o header atrás do overlay
  if (typeof launcherShouldShow === 'function' && launcherShouldShow()) {
    showLauncher();             // espera a escolha; renderContent() roda no enterEnvironment()
  } else {
    renderContent();            // caminho atual: 1 ambiente / técnico
  }
  if (typeof chatBoot === 'function') await chatBoot();
  if (typeof identifyUser === 'function') identifyUser(user);
  if (typeof captureEvent === 'function') captureEvent('login_success', { source: 'portal' });
}

// --- Exibir tela de reset de senha ---
function showPasswordResetForm() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('splash-screen').classList.add('hidden');
  document.getElementById('app-content').classList.add('hidden');
  const el = document.getElementById('reset-password-screen');
  if (el) el.classList.remove('hidden');
  queueAuthLucideCreateIcons();
}

// --- Handler do formulário de nova senha ---
document.getElementById('reset-password-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const newPass     = document.getElementById('reset-new-password').value;
  const confirmPass = document.getElementById('reset-confirm-password').value;
  const errorEl     = document.getElementById('reset-password-error');
  const btn         = document.getElementById('btn-submit-reset');

  errorEl.classList.add('hidden');

  if (newPass.length < 6) {
    errorEl.textContent = 'A senha deve ter pelo menos 6 caracteres.';
    errorEl.classList.remove('hidden');
    return;
  }
  if (newPass !== confirmPass) {
    errorEl.textContent = 'As senhas não coincidem.';
    errorEl.classList.remove('hidden');
    return;
  }

  btn.innerHTML = `<i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i> SALVANDO...`;
  btn.disabled  = true;
  queueAuthLucideCreateIcons();

  const { error } = await supabaseClient.auth.updateUser({ password: newPass });

  btn.disabled  = false;
  btn.innerHTML = `<i data-lucide="check" class="w-5 h-5 stroke-[3px]"></i> <span>SALVAR NOVA SENHA</span>`;
  queueAuthLucideCreateIcons();

  if (error) {
    errorEl.textContent = 'Nao foi possivel salvar a nova senha. Tente novamente.';
    errorEl.classList.remove('hidden');
  } else {
    await supabaseClient.auth.signOut();
    if (typeof resetUser === 'function') resetUser();
    _isPasswordRecovery = false;
    // limpa o hash da URL sem recarregar a página
    history.replaceState(null, '', window.location.pathname);
    document.getElementById('reset-password-screen').classList.add('hidden');
    document.getElementById('login-screen').classList.remove('hidden');
    const loginErrorEl = document.getElementById('login-error');
    loginErrorEl.textContent     = '✓ Senha atualizada com sucesso! Faça login com sua nova senha.';
    loginErrorEl.style.color     = '#22c55e';
    loginErrorEl.style.borderColor = 'rgba(34,197,94,0.3)';
    loginErrorEl.style.background  = 'rgba(34,197,94,0.08)';
    loginErrorEl.classList.remove('hidden');
  }
});

// --- Recuperação de senha ---
async function handleForgotPassword() {
  const email = document.getElementById('login-email').value.trim();
  const errorEl = document.getElementById('login-error');
  const btnForgot = document.getElementById('btn-forgot-password');
  const recoveryUntil = _recoveryGetUntil();

  if (recoveryUntil && Date.now() < recoveryUntil) {
    const waitSeconds = Math.ceil((recoveryUntil - Date.now()) / 1000);
    errorEl.innerText = `Aguarde ${waitSeconds}s antes de solicitar outro reset.`;
    errorEl.classList.remove('hidden');
    return;
  }

  if (!email) {
    errorEl.innerText = 'Insira seu e-mail no campo acima para recuperar a senha.';
    errorEl.classList.remove('hidden');
    return;
  }

  btnForgot.innerText  = 'ENVIANDO...';
  btnForgot.disabled   = true;
  errorEl.classList.add('hidden');
  _recoverySetUntil(Date.now() + (RECOVERY_COOLDOWN_SECONDS * 1000));

  const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + window.location.pathname
  });

  btnForgot.disabled = false;
  if (error) {
    btnForgot.innerText = 'ESQUECI A SENHA';
    errorEl.innerText   = 'Erro ao enviar e-mail. Verifique o endereço e tente novamente.';
    errorEl.classList.remove('hidden');
  } else {
    btnForgot.innerText = '✓ E-MAIL ENVIADO!';
    setTimeout(() => { btnForgot.innerText = 'ESQUECI A SENHA'; }, 6000);
  }
}

async function fetchProfile() {
  const uid = state.currentUser?.id;
  if (!uid) return;
  const { data } = await supabaseClient
    .from('profiles')
    .select('nome, telefone, avatar_url')
    .eq('id', uid)
    .single();
  if (data) {
    state.profile.nome       = data.nome       || '';
    state.profile.telefone   = data.telefone   || '';
    state.profile.avatar_url = data.avatar_url || '';
  }
}

async function updateVendedorStats(email) {
  let { data: stats } = await supabaseClient
    .from('vendedores_stats')
    .select('*')
    .eq('email', email)
    .single();

  if (stats) {
    state.comissaoPct = stats.comissao_pct ?? 5;
    await supabaseClient.from('vendedores_stats').update({
      total_logins:  stats.total_logins + 1,
      ultimo_acesso: new Date().toISOString(),
      franquia_id:   state.franquiaId || null,
    }).eq('email', email);
  } else {
    state.comissaoPct = 5;
    await supabaseClient.from('vendedores_stats').insert([{
      email:       email,
      total_logins: 1,
      franquia_id: state.franquiaId || null,
    }]);
  }
}

async function handleLogout() {
  _sessionLossHandled = true; // suprime listener de "sessão expirada" (saída intencional)
  clearTimeout(_inactivityTimer);
  if (typeof chatTeardown === 'function') chatTeardown(true);
  try {
    await supabaseClient.auth.signOut();
  } finally {
    if (typeof resetUser === 'function') resetUser();
  }
  window.location.reload();
}



