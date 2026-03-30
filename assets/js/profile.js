// ==========================================
// PERFIL DO USUÁRIO — Modal com 3 abas
// ==========================================

let _profileTab = 'dados';

function openProfileModal() {
  _profileTab = 'dados';
  _renderProfileModal();
}

function closeProfileModal() {
  const modal = document.getElementById('profile-modal');
  if (modal) modal.remove();
}

function _profileTabBtn(id, label, icon) {
  const active = _profileTab === id;
  return `<button onclick="_setProfileTab('${id}')"
    class="${active
      ? 'bg-orange-600 text-black border-orange-500 shadow-[0_0_8px_rgba(234,88,12,0.3)]'
      : 'bg-transparent border-neutral-800 text-neutral-500 hover:text-neutral-300 hover:border-neutral-700'
    } border px-4 py-2 font-black uppercase text-[9px] tracking-widest flex items-center gap-2 transition-all">
    <i data-lucide="${icon}" class="w-3.5 h-3.5"></i>${label}
  </button>`;
}

function _setProfileTab(tab) {
  _profileTab = tab;
  const body = document.getElementById('profile-modal-body');
  if (body) {
    _renderProfileTabs();
    _renderProfileBody();
  }
}

function _renderProfileTabs() {
  const el = document.getElementById('profile-modal-tabs');
  if (!el) return;
  el.innerHTML = [
    _profileTabBtn('dados',  'MEUS DADOS', 'user'),
    _profileTabBtn('senha',  'SENHA',      'lock'),
    _profileTabBtn('2fa',    '2FA',        'shield-check'),
  ].join('');
  lucide.createIcons();
}

function _renderProfileBody() {
  const el = document.getElementById('profile-modal-body');
  if (!el) return;
  if (_profileTab === 'dados')  el.innerHTML = _profileDadosHTML();
  if (_profileTab === 'senha')  el.innerHTML = _profileSenhaHTML();
  if (_profileTab === '2fa')    el.innerHTML = _profile2FAHTML();
  lucide.createIcons();
  if (_profileTab === '2fa') _load2FAStatus();
}

function _renderProfileModal() {
  const existing = document.getElementById('profile-modal');
  if (existing) existing.remove();

  const rawAvatarUrl = state.profile?.avatar_url || '';
  const safeAvatarUrl = rawAvatarUrl ? safeImageUrl(rawAvatarUrl, 'assets/img/logo-light.png') : '';

  const el = document.createElement('div');
  el.id = 'profile-modal';
  el.className = 'fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm';
  el.innerHTML = `
    <div class="relative w-full max-w-lg bg-[#0a0a0a] border border-neutral-800 shadow-[0_0_60px_rgba(0,0,0,0.9)] flex flex-col max-h-[90vh]">
      <!-- Header -->
      <div class="flex items-center justify-between p-5 border-b border-neutral-800 shrink-0">
        <div class="flex items-center gap-3">
          <div id="profile-modal-avatar" class="w-10 h-10 rounded-full bg-gradient-to-br from-orange-600 to-yellow-500 flex items-center justify-center text-black font-black text-sm overflow-hidden shrink-0">
            ${safeAvatarUrl
              ? `<img src="${safeAvatarUrl}" class="w-full h-full object-cover" onerror="this.src='assets/img/logo-light.png';this.onerror=null;">`
              : (state.profile?.nome || state.currentUser?.email || '?').charAt(0).toUpperCase()}
          </div>
          <div>
            <p class="text-white font-black text-sm uppercase tracking-wider leading-tight">${escapeHTML(state.profile?.nome || state.currentUser?.email?.split('@')[0] || '')}</p>
            <p class="text-neutral-600 text-[9px] font-bold uppercase tracking-widest">${escapeHTML(state.currentUser?.email || '')}</p>
          </div>
        </div>
        <button onclick="closeProfileModal()" class="p-2 text-neutral-600 hover:text-white transition-colors">
          <i data-lucide="x" class="w-5 h-5"></i>
        </button>
      </div>
      <!-- Tabs -->
      <div id="profile-modal-tabs" class="flex gap-1.5 p-4 pb-0 shrink-0"></div>
      <!-- Body -->
      <div id="profile-modal-body" class="p-5 overflow-y-auto flex-1"></div>
    </div>
  `;

  // Fechar ao clicar fora
  el.addEventListener('click', (e) => { if (e.target === el) closeProfileModal(); });
  document.body.appendChild(el);
  _renderProfileTabs();
  _renderProfileBody();
}

// ─── ABA: DADOS ───────────────────────────────────────────────
function _profileDadosHTML() {
  const rawAvatarUrl = state.profile?.avatar_url || '';
  const safeAvatarUrl = rawAvatarUrl ? safeImageUrl(rawAvatarUrl, 'assets/img/logo-light.png') : '';
  const initial   = (state.profile?.nome || state.currentUser?.email || '?').charAt(0).toUpperCase();
  const themePref = (typeof getThemePreference === 'function') ? getThemePreference() : 'system';
  const themeBtnClass = (id) => themePref === id
    ? 'bg-orange-600 text-black border-orange-500 shadow-[0_0_8px_rgba(234,88,12,0.3)]'
    : 'bg-transparent border-neutral-800 text-neutral-500 hover:text-neutral-300 hover:border-neutral-700';
  return `
    <div class="flex flex-col gap-5">
      <!-- Avatar -->
      <div class="flex items-center gap-4">
        <div class="w-16 h-16 rounded-full bg-gradient-to-br from-orange-600 to-yellow-500 flex items-center justify-center text-black font-black text-xl overflow-hidden shrink-0 ring-2 ring-neutral-700">
          ${safeAvatarUrl ? `<img src="${safeAvatarUrl}" id="avatar-preview" class="w-full h-full object-cover" onerror="this.src='assets/img/logo-light.png';this.onerror=null;">` : `<span id="avatar-preview-initial">${initial}</span>`}
        </div>
        <div class="flex-1">
          <label class="block text-[9px] text-orange-500 font-black uppercase tracking-widest mb-2">Foto de Perfil</label>
          <label for="avatar-upload"
            class="inline-flex items-center gap-2 bg-neutral-900 border border-neutral-700 hover:border-orange-500 hover:text-orange-400 text-neutral-400 px-3 py-2 font-black uppercase text-[9px] tracking-widest cursor-pointer transition-all">
            <i data-lucide="upload" class="w-3.5 h-3.5"></i> ENVIAR FOTO
          </label>
          <input type="file" id="avatar-upload" accept="image/*" class="hidden" onchange="_previewAvatar(event)">
          ${rawAvatarUrl ? `<button onclick="_removeAvatar()" class="ml-2 inline-flex items-center gap-1.5 text-red-500 hover:text-red-400 text-[9px] font-black uppercase tracking-widest transition-colors"><i data-lucide="trash-2" class="w-3 h-3"></i>REMOVER</button>` : ''}
          <p class="text-neutral-700 text-[9px] mt-1.5">JPG ou PNG, máx. 2MB</p>
        </div>
      </div>

      <!-- Nome -->
      <div>
        <label class="block text-[9px] text-orange-500 font-black uppercase tracking-widest mb-2">Nome de Exibição</label>
        <input type="text" id="profile-nome" maxlength="60"
          value="${escapeHTML(state.profile?.nome || '')}"
          placeholder="Seu nome"
          class="w-full bg-black border border-neutral-800 focus:border-orange-500 px-4 py-3 text-white font-bold text-sm outline-none transition-all placeholder-neutral-700">
      </div>

      <!-- Telefone -->
      <div>
        <label class="block text-[9px] text-orange-500 font-black uppercase tracking-widest mb-2">Telefone / WhatsApp</label>
        <input type="tel" id="profile-telefone" maxlength="20"
          value="${escapeHTML(state.profile?.telefone || '')}"
          placeholder="(11) 99999-9999"
          class="w-full bg-black border border-neutral-800 focus:border-orange-500 px-4 py-3 text-white font-bold text-sm outline-none transition-all placeholder-neutral-700">
      </div>

      <!-- E-mail (read-only) -->
      <div>
        <label class="block text-[9px] text-neutral-600 font-black uppercase tracking-widest mb-2">E-mail <span class="text-neutral-700">(não editável)</span></label>
        <input type="email" value="${escapeHTML(state.currentUser?.email || '')}" disabled
          class="w-full bg-neutral-950 border border-neutral-900 px-4 py-3 text-neutral-600 font-bold text-sm cursor-not-allowed">
      </div>

      <!-- Aparência -->
      <div>
        <label class="block text-[9px] text-orange-500 font-black uppercase tracking-widest mb-2">Aparência</label>
        <div class="flex flex-wrap gap-1.5">
          <button type="button" onclick="_setThemeFromProfile('dark')"
            class="${themeBtnClass('dark')} border px-4 py-2 font-black uppercase text-[9px] tracking-widest flex items-center gap-2 transition-all">
            <i data-lucide="moon" class="w-3.5 h-3.5"></i> Escuro
          </button>
          <button type="button" onclick="_setThemeFromProfile('light')"
            class="${themeBtnClass('light')} border px-4 py-2 font-black uppercase text-[9px] tracking-widest flex items-center gap-2 transition-all">
            <i data-lucide="sun" class="w-3.5 h-3.5"></i> Claro
          </button>
          <button type="button" onclick="_setThemeFromProfile('system')"
            class="${themeBtnClass('system')} border px-4 py-2 font-black uppercase text-[9px] tracking-widest flex items-center gap-2 transition-all">
            <i data-lucide="monitor" class="w-3.5 h-3.5"></i> Sistema
          </button>
        </div>
        <p class="text-neutral-700 text-[9px] mt-1.5">No celular, usar "Sistema" acompanha automaticamente o tema do aparelho.</p>
      </div>

      <button onclick="_saveDados()"
        class="flex items-center justify-center gap-2 w-full bg-gradient-to-r from-orange-600 to-yellow-500 hover:from-orange-500 hover:to-yellow-400 text-black py-3 font-black uppercase tracking-widest text-sm transition-all shadow-[0_0_20px_rgba(234,88,12,0.2)]">
        <i data-lucide="save" class="w-4 h-4 stroke-[3px]"></i> SALVAR DADOS
      </button>
    </div>
  `;
}

function _setThemeFromProfile(theme) {
  if (typeof setThemePreference === 'function') setThemePreference(theme);
  _renderProfileBody();
}

function _previewAvatar(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) {
    showToast('Imagem muito grande. Máximo 2MB.');
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    const previewUrl = safeImageUrl(e.target.result, 'assets/img/logo-light.png', { allowDataUrl: true });
    const avatarDiv = document.querySelector('#profile-modal-body .rounded-full');
    if (avatarDiv) avatarDiv.innerHTML = `<img src="${previewUrl}" class="w-full h-full object-cover" onerror="this.src='assets/img/logo-light.png';this.onerror=null;">`;
    const headerAvatar = document.querySelector('#profile-modal-avatar');
    if (headerAvatar) headerAvatar.innerHTML = `<img src="${previewUrl}" class="w-full h-full object-cover" onerror="this.src='assets/img/logo-light.png';this.onerror=null;">`;
  };
  reader.readAsDataURL(file);
}

async function _saveDados() {
  const nome      = document.getElementById('profile-nome')?.value.trim() || '';
  const telefone  = document.getElementById('profile-telefone')?.value.trim() || '';
  const fileInput = document.getElementById('avatar-upload');
  const file      = fileInput?.files[0] || null;
  const uid       = state.currentUser?.id;
  if (!uid) return;

  let avatar_url = state.profile?.avatar_url || '';

  // Upload de avatar se selecionado
  if (file) {
    const ext  = file.name.split('.').pop();
    const path = `${uid}/avatar.${ext}`;
    const { error: upErr } = await supabaseClient.storage
      .from('avatars')
      .upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) {
      showToast('Erro ao enviar foto: ' + upErr.message);
      return;
    }
    const { data: urlData } = supabaseClient.storage.from('avatars').getPublicUrl(path);
    // Adiciona cache-buster para forçar atualização da imagem
    avatar_url = safeImageUrl(urlData.publicUrl + '?t=' + Date.now(), null);
  }

  const { error } = await supabaseClient.from('profiles').upsert({
    id: uid,
    nome,
    telefone,
    avatar_url,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    showToast('Erro ao salvar: ' + error.message);
    return;
  }

  // Atualiza propostas antigas desse vendedor que estejam sem telefone
  if (telefone && state.currentUser?.email) {
    await supabaseClient
      .from('propostas')
      .update({ vendedor_telefone: telefone })
      .eq('vendedor_email', state.currentUser.email)
      .or('vendedor_telefone.is.null,vendedor_telefone.eq.');
  }

  state.profile.nome       = nome;
  state.profile.telefone   = telefone;
  state.profile.avatar_url = avatar_url;

  renderHeaderUser();
  showToast('PERFIL ATUALIZADO!');
  closeProfileModal();
}

async function _removeAvatar() {
  const uid = state.currentUser?.id;
  if (!uid) return;
  const { error } = await supabaseClient.from('profiles').update({ avatar_url: '' }).eq('id', uid);
  if (error) { showToast('Erro: ' + error.message); return; }
  state.profile.avatar_url = '';
  renderHeaderUser();
  showToast('FOTO REMOVIDA.');
  _renderProfileModal();
}

// ─── ABA: SENHA ───────────────────────────────────────────────
function _profileSenhaHTML() {
  return `
    <div class="flex flex-col gap-5">
      <p class="text-neutral-600 text-[10px] font-bold uppercase tracking-widest border border-neutral-800 bg-neutral-900/40 p-3">
        <i data-lucide="info" class="w-3.5 h-3.5 inline-block mr-1 text-neutral-500"></i>
        A nova senha deve ter no mínimo 6 caracteres.
      </p>

      <div>
        <label class="block text-[9px] text-orange-500 font-black uppercase tracking-widest mb-2">Nova Senha</label>
        <input type="password" id="profile-senha-nova" placeholder="••••••••"
          class="w-full bg-black border border-neutral-800 focus:border-orange-500 px-4 py-3 text-white font-bold text-sm outline-none transition-all placeholder-neutral-700">
      </div>
      <div>
        <label class="block text-[9px] text-orange-500 font-black uppercase tracking-widest mb-2">Confirmar Nova Senha</label>
        <input type="password" id="profile-senha-confirm" placeholder="••••••••"
          class="w-full bg-black border border-neutral-800 focus:border-orange-500 px-4 py-3 text-white font-bold text-sm outline-none transition-all placeholder-neutral-700">
      </div>

      <button onclick="_saveSenha()"
        class="flex items-center justify-center gap-2 w-full bg-gradient-to-r from-orange-600 to-yellow-500 hover:from-orange-500 hover:to-yellow-400 text-black py-3 font-black uppercase tracking-widest text-sm transition-all">
        <i data-lucide="lock" class="w-4 h-4 stroke-[3px]"></i> ALTERAR SENHA
      </button>
    </div>
  `;
}

async function _saveSenha() {
  const nova    = document.getElementById('profile-senha-nova')?.value || '';
  const confirm = document.getElementById('profile-senha-confirm')?.value || '';
  if (nova.length < 6)      { showToast('A senha deve ter no mínimo 6 caracteres.'); return; }
  if (nova !== confirm)     { showToast('As senhas não conferem.'); return; }

  const { error } = await supabaseClient.auth.updateUser({ password: nova });
  if (error) {
    // Não vazar detalhes internos do Supabase para o cliente
    const msg = String(error.message || '').toLowerCase();
    if (msg.includes('same password') || msg.includes('different')) {
      showToast('A nova senha não pode ser igual à atual.');
    } else {
      showToast('Não foi possível alterar a senha. Tente novamente.');
    }
    return;
  }
  showToast('SENHA ALTERADA COM SUCESSO!');
  closeProfileModal();
}

// ─── ABA: 2FA ─────────────────────────────────────────────────
function _profile2FAHTML() {
  return `
    <div id="mfa-area" class="flex flex-col gap-4">
      <div class="flex items-center gap-3 bg-neutral-900/60 border border-neutral-800 p-4">
        <i data-lucide="shield-check" class="w-8 h-8 text-orange-400 shrink-0"></i>
        <div>
          <p class="text-white font-black text-sm uppercase tracking-wider">Autenticação em 2 Fatores</p>
          <p class="text-neutral-500 text-[10px] mt-0.5">Use Google Authenticator, Authy ou similar para gerar o código.</p>
        </div>
      </div>
      <div id="mfa-status-area" class="text-neutral-500 text-[10px] font-bold uppercase tracking-widest text-center py-4">
        <i data-lucide="loader-2" class="w-5 h-5 animate-spin inline-block mr-2"></i> Verificando status...
      </div>
    </div>
  `;
}

async function _load2FAStatus() {
  const area = document.getElementById('mfa-status-area');
  if (!area) return;

  const { data, error } = await supabaseClient.auth.mfa.listFactors();
  if (error) { area.innerHTML = `<p class="text-red-500 text-xs">${escapeHTML(error.message)}</p>`; return; }

  const totpFactor = data?.totp?.find(f => f.status === 'verified');

  if (totpFactor) {
    area.innerHTML = `
      <div class="flex flex-col gap-4">
        <div class="flex items-center gap-3 bg-green-600 border border-green-500 p-4">
          <i data-lucide="shield-check" class="w-5 h-5 text-white shrink-0"></i>
          <div class="flex-1">
            <p class="text-white font-black text-sm uppercase">2FA ATIVO</p>
            <p class="text-green-100 text-[10px]">Seu login está protegido com autenticação em dois fatores.</p>
          </div>
        </div>
        <button onclick="_disable2FA('${totpFactor.id}')"
          class="flex items-center justify-center gap-2 w-full bg-red-600 border border-red-500 hover:bg-red-700 hover:border-red-400 text-white py-3 font-black uppercase tracking-widest text-sm transition-all">
          <i data-lucide="shield-off" class="w-4 h-4"></i> DESATIVAR 2FA
        </button>
      </div>
    `;
  } else {
    area.innerHTML = `
      <div class="flex flex-col gap-4">
        <div class="flex items-center gap-3 bg-neutral-900/60 border border-neutral-800 p-4">
          <i data-lucide="shield-off" class="w-5 h-5 text-neutral-500 shrink-0"></i>
          <div class="flex-1">
            <p class="text-neutral-400 font-black text-sm uppercase">2FA INATIVO</p>
            <p class="text-neutral-600 text-[10px]">Ative para adicionar uma camada extra de segurança.</p>
          </div>
        </div>
        <button onclick="_enroll2FA()"
          class="flex items-center justify-center gap-2 w-full bg-gradient-to-r from-orange-600 to-yellow-500 hover:from-orange-500 hover:to-yellow-400 text-black py-3 font-black uppercase tracking-widest text-sm transition-all">
          <i data-lucide="shield-check" class="w-4 h-4 stroke-[3px]"></i> ATIVAR 2FA
        </button>
      </div>
    `;
  }
  lucide.createIcons();
}

async function _enroll2FA() {
  const area = document.getElementById('mfa-status-area');
  area.innerHTML = `<div class="text-neutral-500 text-[10px] font-bold uppercase tracking-widest text-center py-4"><i data-lucide="loader-2" class="w-5 h-5 animate-spin inline-block mr-2"></i> Gerando QR Code...</div>`;
  lucide.createIcons();

  const { data, error } = await supabaseClient.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Portal Agilsolar' });
  if (error) { area.innerHTML = `<p class="text-red-500 text-xs p-4">${escapeHTML(error.message)}</p>`; return; }

  const factorId = data.id;
  const qrSvg    = data.totp.qr_code; // SVG string
  const secret   = data.totp.secret;

  area.innerHTML = `
    <div class="flex flex-col gap-4">
      <p class="text-neutral-400 text-[10px] font-bold uppercase tracking-widest text-center">Escaneie com seu app autenticador</p>
      <div class="flex justify-center bg-white p-4 rounded">${qrSvg}</div>
      <div class="bg-neutral-900/60 border border-neutral-800 p-3 text-center">
        <p class="text-neutral-600 text-[9px] font-bold uppercase tracking-widest mb-1">Ou insira manualmente</p>
        <p class="text-white font-mono text-xs tracking-widest break-all">${escapeHTML(secret)}</p>
      </div>
      <div>
        <label class="block text-[9px] text-orange-500 font-black uppercase tracking-widest mb-2">Código de Verificação (6 dígitos)</label>
        <input type="text" id="mfa-code-input" maxlength="6" inputmode="numeric" placeholder="000000"
          class="w-full bg-black border border-neutral-800 focus:border-orange-500 px-4 py-3 text-white font-mono text-center text-lg tracking-[0.5em] outline-none transition-all placeholder-neutral-700">
      </div>
      <button onclick="_verify2FA('${factorId}')"
        class="flex items-center justify-center gap-2 w-full bg-gradient-to-r from-orange-600 to-yellow-500 hover:from-orange-500 hover:to-yellow-400 text-black py-3 font-black uppercase tracking-widest text-sm transition-all">
        <i data-lucide="check" class="w-4 h-4 stroke-[3px]"></i> CONFIRMAR E ATIVAR
      </button>
      <button onclick="_load2FAStatus()" class="text-neutral-600 hover:text-neutral-400 text-[9px] font-black uppercase tracking-widest text-center transition-colors">CANCELAR</button>
    </div>
  `;
  lucide.createIcons();
}

async function _verify2FA(factorId) {
  const code = document.getElementById('mfa-code-input')?.value.trim();
  if (!code || code.length !== 6) { showToast('Insira o código de 6 dígitos.'); return; }

  const { data: challengeData, error: chErr } = await supabaseClient.auth.mfa.challenge({ factorId });
  if (chErr) { showToast('Erro: ' + chErr.message); return; }

  const { error: verErr } = await supabaseClient.auth.mfa.verify({
    factorId,
    challengeId: challengeData.id,
    code,
  });

  if (verErr) { showToast('Código inválido. Tente novamente.'); return; }

  showToast('2FA ATIVADO COM SUCESSO!');
  _load2FAStatus();
}

function _disable2FA(factorId) {
  showConfirmModal(
    'Tem certeza que deseja desativar o 2FA? Seu login ficará menos seguro.',
    async () => {
      const { error } = await supabaseClient.auth.mfa.unenroll({ factorId });
      if (error) { showToast('Erro: ' + error.message); return; }
      showToast('2FA DESATIVADO.');
      _load2FAStatus();
    },
    'DESATIVAR 2FA'
  );
}

