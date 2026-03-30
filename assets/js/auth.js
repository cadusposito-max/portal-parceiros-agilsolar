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

// Detecta evento PASSWORD_RECOVERY (fluxo PKCE / magic-link do Supabase)
supabaseClient.auth.onAuthStateChange((event) => {
  if (event === 'PASSWORD_RECOVERY') {
    _isPasswordRecovery = true;
    showPasswordResetForm();
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
  await supabaseClient.auth.signOut();
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
      state.franquiaId  = appMeta.franquia_id || null;
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
      renderHeaderUser();
      renderTabs();
      renderContent();
      if (typeof chatBoot === 'function') await chatBoot();
    } else {
      document.getElementById('login-screen').classList.remove('hidden');
      document.getElementById('splash-screen').classList.add('hidden');
      document.getElementById('app-content').classList.add('hidden');
      if (typeof chatTeardown === 'function') chatTeardown(true);
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
  state.franquiaId  = appMeta.franquia_id || null;
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
  renderHeaderUser();
  renderTabs();
  renderContent();
  if (typeof chatBoot === 'function') await chatBoot();
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
  clearTimeout(_inactivityTimer);
  if (typeof chatTeardown === 'function') chatTeardown(true);
  await supabaseClient.auth.signOut();
  window.location.reload();
}





