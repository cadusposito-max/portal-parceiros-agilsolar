// ==========================================
// CHAT INTERNO (Popup desktop + Fullscreen mobile)
// ==========================================

const CHAT_BREAKPOINT = 1024;
const CHAT_POLL_MS = 25000;

function _chatDefaultState() {
  return {
    initialized: false,
    hasAccess: false,
    isOpen: false,
    isMobile: false,
    mobileView: 'list',
    loadingConversations: false,
    loadingMessages: false,
    conversations: [],
    activeConversationId: null,
    activeConversation: null,
    activeConversationTitle: '',
    messages: [],
    unreadTotal: 0,
    directory: [],
    searchTerm: '',
    directorySearch: '',
    conversationChannel: null,
    threadChannel: null,
    pollTimer: null,
    profileCardOpen: false,
  };
}

function _chatState() {
  if (!state.chat || typeof state.chat !== 'object') {
    state.chat = _chatDefaultState();
    return state.chat;
  }

  const defaults = _chatDefaultState();
  Object.keys(defaults).forEach((key) => {
    if (!(key in state.chat)) {
      state.chat[key] = defaults[key];
    }
  });

  return state.chat;
}

function _chatEl(id) {
  return document.getElementById(id);
}

function _chatIsMobileViewport() {
  return window.innerWidth < CHAT_BREAKPOINT;
}

function _chatHasSession() {
  return Boolean(state.currentUser && state.currentUser.id);
}

async function _chatCheckAccess() {
  if (!_chatHasSession()) return false;

  const { data, error } = await supabaseClient.rpc('chat_can_use_current_user');
  if (error) {
    console.error('chat_can_use_current_user:', error);
    return false;
  }

  return data === true;
}

function _chatIsAccessDeniedError(error) {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('sem acesso ao chat');
}

// Sintomas de sessão perdida (refresh_token expirou → PostgREST cai pro role anon,
// que não tem EXECUTE nas funções chat_*). O listener em auth.js cuida do logout —
// aqui só silencia o erro e desmonta o chat pra não bombardear RPCs em loop.
function _chatIsSessionLostError(error) {
  const code = String(error?.code || '');
  if (code === '42501' || code === 'PGRST301') return true; // permission denied / JWT expired
  const status = Number(error?.status || 0);
  if (status === 401) return true;
  const message = String(error?.message || '').toLowerCase();
  return message.includes('permission denied for function')
      || message.includes('jwt expired')
      || message.includes('invalid jwt');
}

function _chatHandleAccessDenied(error) {
  if (_chatIsAccessDeniedError(error) || _chatIsSessionLostError(error)) {
    chatTeardown(true);
    return true;
  }
  return false;
}

function _chatCanMarkReadNow() {
  const chat = _chatState();
  if (!chat.isOpen || !chat.activeConversationId) return false;
  if (!chat.isMobile) return true;
  return chat.mobileView === 'thread';
}

function _chatEmailPrefix(email) {
  const value = (email || '').trim();
  if (!value.includes('@')) return '';
  return value.split('@')[0].trim();
}

function _chatGetDirectDisplayName(item) {
  const profileName = (item?.other_profile_nome || '').trim();
  if (profileName) return profileName;

  const rpcName = (item?.other_nome || '').trim();
  if (rpcName) return rpcName;

  const emailPrefix = _chatEmailPrefix(item?.other_email);
  if (emailPrefix) return emailPrefix;

  return 'Usuario';
}

function _chatGetSafeTitle(item) {
  if (item?.kind === 'direct') {
    return _chatGetDirectDisplayName(item);
  }
  const title = (item?.title || '').trim();
  return title || 'Grupo';
}

function _chatGetConversationSubtitle(item) {
  if (!item) return 'Mensagens em tempo real';
  if (item.kind === 'direct') {
    const email = (item.other_email || '').trim();
    return email || 'Conversa direta';
  }
  const count = Number(item.participant_count) || 0;
  if (count > 0) {
    return count + ' participante' + (count > 1 ? 's' : '');
  }
  return 'Conversa em grupo';
}

function _chatInitials(item) {
  const base = _chatGetSafeTitle(item);
  if (!base) return 'U';
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
}

function _chatAvatarHtml(item, avatarClass) {
  const cls = avatarClass || 'chat-conv-avatar';
  const name = _chatGetSafeTitle(item);
  const rawAvatarUrl = item?.kind === 'direct' ? (item?.other_avatar_url || '').trim() : '';
  const avatarUrl = rawAvatarUrl ? safeImageUrl(rawAvatarUrl, 'assets/img/logo-light.png') : '';

  if (avatarUrl) {
    return '<span class="' + cls + ' has-image"><img src="' + avatarUrl + '" alt="' + escapeHTML(name) + '" onerror="this.src=\'assets/img/logo-light.png\';this.onerror=null;"></span>';
  }

  return '<span class="' + cls + '">' + escapeHTML(_chatInitials(item)) + '</span>';
}

function _chatSyncActiveConversationMeta() {
  const chat = _chatState();
  if (!chat.activeConversationId) {
    chat.activeConversation = null;
    chat.activeConversationTitle = '';
    chat.profileCardOpen = false;
    return;
  }

  const found = (chat.conversations || []).find(c => c.conversation_id === chat.activeConversationId) || null;
  chat.activeConversation = found;
  chat.activeConversationTitle = _chatGetSafeTitle(found || {});
}

function _chatGetRoleLabel(role) {
  const value = (role || '').toLowerCase();
  if (value === 'admin') return 'Admin';
  if (value === 'gestor') return 'Gestor';
  if (value === 'vendedor') return 'Vendedor';
  return 'Nao informado';
}

function _chatCloseProfileCard() {
  const chat = _chatState();
  if (!chat.profileCardOpen) return;
  chat.profileCardOpen = false;
  _chatRenderThreadProfileCard(chat.activeConversation);
}

function _chatToggleProfileCard() {
  const chat = _chatState();
  const item = chat.activeConversation;
  if (!item || item.kind !== 'direct') return;
  chat.profileCardOpen = !chat.profileCardOpen;
  _chatRenderThreadProfileCard(item);
}

function _chatRenderThreadProfileCard(item) {
  const chat = _chatState();
  const card = _chatEl('chat-thread-profile-card');
  const metaBtn = _chatEl('chat-thread-meta-btn');
  const avatar = _chatEl('chat-profile-avatar');
  const name = _chatEl('chat-profile-name');
  const kind = _chatEl('chat-profile-kind');
  const email = _chatEl('chat-profile-email');
  const role = _chatEl('chat-profile-role');
  const franquia = _chatEl('chat-profile-franquia');

  const isDirect = Boolean(item && item.kind === 'direct');

  if (metaBtn) {
    metaBtn.classList.toggle('is-clickable', isDirect);
    metaBtn.disabled = !isDirect;
    metaBtn.setAttribute('aria-expanded', isDirect && chat.profileCardOpen ? 'true' : 'false');
  }

  if (!card) return;

  if (!isDirect) {
    chat.profileCardOpen = false;
    card.classList.add('hidden');
    return;
  }

  if (avatar) avatar.innerHTML = _chatAvatarHtml(item, 'chat-profile-avatar-core');
  if (name) name.textContent = _chatGetSafeTitle(item);
  if (kind) kind.textContent = 'Conversa direta';
  if (email) email.textContent = (item.other_email || '').trim() || '-';
  if (role) role.textContent = _chatGetRoleLabel(item.other_role);
  if (franquia) franquia.textContent = (item.other_franquia_nome || '').trim() || '-';

  card.classList.toggle('hidden', !chat.profileCardOpen);
}

function _chatFormatListTime(value) {
  if (!value) return '';
  const dt = new Date(value);
  const now = new Date();
  const sameDay = dt.toDateString() === now.toDateString();
  return sameDay
    ? dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function _chatFormatMessageTime(value) {
  if (!value) return '';
  const dt = new Date(value);
  if (isNaN(dt.getTime())) return '';
  return dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function _chatFormatDaySeparator(value) {
  if (!value) return '';
  const dt = new Date(value);
  if (isNaN(dt.getTime())) return '';
  const now = new Date();
  const ontem = new Date(now);
  ontem.setDate(now.getDate() - 1);

  if (dt.toDateString() === now.toDateString()) return 'Hoje';
  if (dt.toDateString() === ontem.toDateString()) return 'Ontem';

  const sameYear = dt.getFullYear() === now.getFullYear();
  if (sameYear) {
    return dt.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' });
  }
  return dt.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}

function _chatDayKey(value) {
  const dt = new Date(value);
  if (isNaN(dt.getTime())) return '';
  return dt.getFullYear() + '-' + (dt.getMonth() + 1) + '-' + dt.getDate();
}

function _chatApplyShellMode() {
  const chat = _chatState();
  const shell = _chatEl('chat-shell');
  const backdrop = _chatEl('chat-shell-backdrop');
  const backBtn = _chatEl('chat-thread-back-btn');
  if (!shell || !backdrop) return;

  chat.isMobile = _chatIsMobileViewport();

  shell.classList.toggle('hidden', !chat.isOpen);
  // Backdrop aparece tambem no desktop (estilo modal WhatsApp Web/GronerZap)
  backdrop.classList.toggle('hidden', !chat.isOpen);
  shell.classList.toggle('chat-shell--mobile', chat.isOpen && chat.isMobile);
  shell.classList.toggle('chat-shell--desktop', chat.isOpen && !chat.isMobile);
  shell.classList.toggle('chat-shell--thread', chat.isOpen && chat.isMobile && chat.mobileView === 'thread');

  if (backBtn) {
    backBtn.classList.toggle('hidden', !(chat.isMobile && chat.mobileView === 'thread'));
  }

  // iOS PWA + teclado: alinha shell ao viewport visivel
  _chatAttachViewportListeners();
  _chatSyncMobileViewport();
}

// ----------------------------------------------------------------------------
// iOS PWA fix: visualViewport resize/scroll quando o teclado abre
// O 100dvh do iOS NAO encolhe com o teclado, entao o composer fica atras dele.
//
// Solucao: cancelar o `bottom: 0` herdado do CSS `inset: 0` e usar
// `top: vv.offsetTop` + `height: vv.height` (padrao iOS WhatsApp-like).
// ----------------------------------------------------------------------------
function _chatSyncMobileViewport() {
  const chat = _chatState();
  const shell = _chatEl('chat-shell');
  if (!shell) return;

  // Modo desktop OU chat fechado: limpa overrides e usa CSS default
  if (!chat.isMobile || !chat.isOpen || !window.visualViewport) {
    shell.style.bottom = '';
    shell.style.top    = '';
    shell.style.height = '';
    return;
  }

  const vv = window.visualViewport;
  // Sanity: durante transicao do teclado o iOS as vezes reporta valores muito
  // pequenos. Se acontecer, ignora pra nao colapsar a UI.
  if (!vv.height || vv.height < 150) return;

  // O `inset: 0` do CSS aplica top:0 e bottom:0 juntos. Pra altura inline
  // ter efeito, precisamos cancelar `bottom:0` (senao top+bottom vencem).
  shell.style.bottom = 'auto';
  shell.style.top    = `${vv.offsetTop || 0}px`;
  shell.style.height = `${vv.height}px`;

  // Mantem a ultima mensagem visivel
  const messages = _chatEl('chat-thread-messages');
  if (messages) {
    requestAnimationFrame(() => { messages.scrollTop = messages.scrollHeight; });
  }
}

function _chatAttachViewportListeners() {
  if (window._chatViewportListenersAttached) return;
  if (!window.visualViewport) return;
  const handler = () => _chatSyncMobileViewport();
  window.visualViewport.addEventListener('resize', handler);
  window.visualViewport.addEventListener('scroll', handler);
  window._chatViewportListenersAttached = true;
}

function _chatSyncComposerButton() {
  const chat = _chatState();
  const input = _chatEl('chat-thread-input');
  const btn = _chatEl('chat-thread-send-btn');
  if (!input || !btn) return;
  const hasText = (input.value || '').trim().length > 0;
  btn.disabled = !hasText || !chat.activeConversationId;
}

function _chatScrollMessagesToEnd() {
  const box = _chatEl('chat-thread-messages');
  if (!box) return;
  box.scrollTop = box.scrollHeight;
}

function _chatUpdateFab() {
  const chat = _chatState();
  const wrap = _chatEl('chat-fab-container');
  const badge = _chatEl('chat-fab-badge');

  if (wrap) {
    const show = _chatHasSession() && chat.hasAccess === true;
    wrap.classList.toggle('hidden', !show);
  }

  if (!badge) return;
  if (chat.unreadTotal > 0) {
    badge.classList.remove('hidden');
    badge.textContent = chat.unreadTotal > 99 ? '99+' : String(chat.unreadTotal);
  } else {
    badge.classList.add('hidden');
    badge.textContent = '0';
  }
}

function _chatComputeUnread() {
  const chat = _chatState();
  chat.unreadTotal = (chat.conversations || []).reduce((acc, c) => acc + (Number(c.unread_count) || 0), 0);
  _chatUpdateFab();
}

function _chatRenderConversationList() {
  const chat = _chatState();
  const list = _chatEl('chat-list-items');
  const empty = _chatEl('chat-list-empty');
  if (!list || !empty) return;

  const items = Array.isArray(chat.conversations) ? chat.conversations : [];

  if (items.length === 0) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');

  list.innerHTML = items.map(item => {
    const active = chat.activeConversationId === item.conversation_id;
    const unread = Number(item.unread_count) || 0;
    const title = _chatGetSafeTitle(item);
    const preview = item.last_message_preview || 'Sem mensagens ainda';
    const time = _chatFormatListTime(item.last_message_at || item.created_at);
    return `
      <button type="button" class="chat-conv-item ${active ? 'is-active' : ''}" data-chat-conv="${item.conversation_id}">
        ${_chatAvatarHtml(item, 'chat-conv-avatar')}
        <span class="chat-conv-main">
          <span class="chat-conv-top">
            <span class="chat-conv-title">${escapeHTML(title)}</span>
            <span class="chat-conv-time">${escapeHTML(time)}</span>
          </span>
          <span class="chat-conv-bottom">
            <span class="chat-conv-preview">${escapeHTML(preview)}</span>
            ${unread > 0 ? `<span class="chat-conv-unread">${unread > 99 ? '99+' : unread}</span>` : ''}
          </span>
        </span>
      </button>
    `;
  }).join('');
}

function _chatRenderThreadHeader() {
  const chat = _chatState();
  const title = _chatEl('chat-thread-title');
  const subtitle = _chatEl('chat-thread-subtitle');
  const empty = _chatEl('chat-thread-empty');
  const body = _chatEl('chat-thread-body');
  const avatarSlot = _chatEl('chat-thread-avatar');

  if (!title || !subtitle || !empty || !body) return;

  if (!chat.activeConversationId) {
    title.textContent = 'Conversa';
    subtitle.textContent = 'Selecione uma conversa para comecar.';
    if (avatarSlot) avatarSlot.innerHTML = _chatAvatarHtml({}, 'chat-thread-avatar-core');
    empty.classList.remove('hidden');
    body.classList.add('hidden');
    _chatRenderThreadProfileCard(null);
    return;
  }

  const item = chat.activeConversation || (chat.conversations || []).find(c => c.conversation_id === chat.activeConversationId) || null;
  chat.activeConversation = item;

  const safeTitle = _chatGetSafeTitle(item || {});
  chat.activeConversationTitle = safeTitle;

  title.textContent = safeTitle;
  subtitle.textContent = _chatGetConversationSubtitle(item || {});
  if (avatarSlot) avatarSlot.innerHTML = _chatAvatarHtml(item || {}, 'chat-thread-avatar-core');

  empty.classList.add('hidden');
  body.classList.remove('hidden');

  _chatRenderThreadProfileCard(item);
}

function _chatRenderMessages(scrollToEnd = false) {
  const chat = _chatState();
  const box = _chatEl('chat-thread-messages');
  const loading = _chatEl('chat-thread-loading');
  if (!box || !loading) return;

  loading.classList.toggle('hidden', !chat.loadingMessages);

  const items = Array.isArray(chat.messages) ? chat.messages : [];
  if (items.length === 0) {
    box.innerHTML = '<div class="chat-thread-no-messages">Sem mensagens ainda. Envie a primeira.</div>';
    return;
  }

  let lastDayKey = '';
  box.innerHTML = items.map(msg => {
    const isMe = Boolean(msg.is_me);
    const safeBody = escapeHTML(msg.body || '').replace(/\n/g, '<br>');
    const sender = escapeHTML(msg.sender_nome || 'Usuário');
    const time = _chatFormatMessageTime(msg.created_at);

    let separator = '';
    const dayKey = _chatDayKey(msg.created_at);
    if (dayKey && dayKey !== lastDayKey) {
      const label = _chatFormatDaySeparator(msg.created_at);
      separator = `<div class="chat-msg-day-separator"><span>${escapeHTML(label)}</span></div>`;
      lastDayKey = dayKey;
    }

    return separator + `
      <div class="chat-msg-row ${isMe ? 'is-me' : 'is-other'}">
        <div class="chat-msg-bubble">
          ${isMe ? '' : `<div class="chat-msg-sender">${sender}</div>`}
          <div class="chat-msg-text">${safeBody}</div>
          <div class="chat-msg-meta">${escapeHTML(time)}</div>
        </div>
      </div>
    `;
  }).join('');

  if (scrollToEnd) _chatScrollMessagesToEnd();
}

async function _chatRefreshConversations(preserveSelection = true) {
  const chat = _chatState();
  if (!_chatHasSession() || chat.hasAccess !== true) return;
  chat.loadingConversations = true;

  const params = {
    p_search: chat.searchTerm ? chat.searchTerm : null,
    p_limit: 100,
    p_offset: 0,
    p_include_archived: false,
  };

  const { data, error } = await supabaseClient.rpc('chat_list_conversations', params);
  chat.loadingConversations = false;

  if (error) {
    if (_chatHandleAccessDenied(error)) return;
    console.error('chat_list_conversations:', error);
    showToast('ERRO AO CARREGAR CHAT: ' + (error.message || 'Falha de leitura'));
    return;
  }

  chat.conversations = Array.isArray(data) ? data : [];

  if (!preserveSelection || !chat.activeConversationId || !chat.conversations.some(c => c.conversation_id === chat.activeConversationId)) {
    if (!chat.isMobile && chat.conversations[0]) {
      chat.activeConversationId = chat.conversations[0].conversation_id;
    } else if (!chat.conversations.some(c => c.conversation_id === chat.activeConversationId)) {
      chat.activeConversationId = null;
      chat.activeConversationTitle = '';
      chat.messages = [];
    }
  }

  _chatSyncActiveConversationMeta();
  _chatComputeUnread();
  _chatRenderConversationList();
  _chatRenderThreadHeader();

  if (chat.activeConversationId && !chat.loadingMessages && chat.messages.length === 0 && !chat.isMobile) {
    await _chatLoadMessages(chat.activeConversationId, true);
  }
}

async function _chatLoadMessages(conversationId, scrollToEnd = false, silent = false) {
  const chat = _chatState();
  if (!conversationId || !_chatHasSession() || chat.hasAccess !== true) return;

  // silent = refresh em tempo real (sem spinner). Apenas a abertura inicial
  // da conversa mostra "Carregando mensagens..."
  if (!silent) {
    chat.loadingMessages = true;
    _chatRenderMessages(false);
  }

  const { data, error } = await supabaseClient.rpc('chat_list_messages', {
    p_conversation_id: conversationId,
    p_limit: 200,
    p_before: null,
  });

  chat.loadingMessages = false;

  if (error) {
    if (_chatHandleAccessDenied(error)) return;
    console.error('chat_list_messages:', error);
    showToast('ERRO AO CARREGAR MENSAGENS: ' + (error.message || 'Falha de leitura'));
    _chatRenderMessages(false);
    return;
  }

  const rows = Array.isArray(data) ? data.slice() : [];
  rows.sort((a, b) => {
    const ta = new Date(a.created_at).getTime();
    const tb = new Date(b.created_at).getTime();
    if (ta !== tb) return ta - tb;
    return (Number(a.id) || 0) - (Number(b.id) || 0);
  });

  chat.messages = rows;
  _chatRenderMessages(scrollToEnd);
}

async function _chatMarkRead(conversationId, refreshAfter = false) {
  const chat = _chatState();
  if (!conversationId || !_chatHasSession() || chat.hasAccess !== true) return;

  const { error } = await supabaseClient.rpc('chat_mark_read', {
    p_conversation_id: conversationId,
  });

  if (error) {
    if (_chatHandleAccessDenied(error)) return;
    console.error('chat_mark_read:', error);
    return;
  }

  chat.conversations = (chat.conversations || []).map(c => {
    if (c.conversation_id !== conversationId) return c;
    return { ...c, unread_count: 0 };
  });
  _chatSyncActiveConversationMeta();
  _chatComputeUnread();
  _chatRenderConversationList();
  _chatRenderThreadHeader();

  if (refreshAfter) {
    await _chatRefreshConversations(true);
  }
}

const _chatQueueMarkRead = debounce((conversationId) => {
  _chatMarkRead(conversationId, true);
}, 320);

async function _chatOpenConversation(conversationId, forceThreadOnMobile = true) {
  const chat = _chatState();
  if (!conversationId || chat.hasAccess !== true) return;

  chat.activeConversationId = conversationId;
  _chatSyncActiveConversationMeta();
  _chatCloseProfileCard();

  if (chat.isMobile && forceThreadOnMobile) {
    chat.mobileView = 'thread';
    _chatApplyShellMode();
  }

  _chatRenderConversationList();
  _chatRenderThreadHeader();
  _chatSyncComposerButton();

  _chatSubscribeThreadChannel(conversationId);
  await _chatLoadMessages(conversationId, true);

  if (_chatCanMarkReadNow()) {
    await _chatMarkRead(conversationId, true);
  }
}

async function _chatSendCurrentMessage() {
  const chat = _chatState();
  const input = _chatEl('chat-thread-input');
  if (!input || chat.hasAccess !== true) return;

  const body = (input.value || '').trim();
  if (!body || !chat.activeConversationId) return;

  const btn = _chatEl('chat-thread-send-btn');
  if (btn) btn.disabled = true;

  const { error } = await supabaseClient.rpc('chat_send_message', {
    p_conversation_id: chat.activeConversationId,
    p_body: body,
    p_reply_to_message_id: null,
    p_kind: 'text',
  });

  if (error) {
    if (_chatHandleAccessDenied(error)) return;
    console.error('chat_send_message:', error);
    showToast('ERRO AO ENVIAR: ' + (error.message || 'Falha ao enviar'));
    _chatSyncComposerButton();
    return;
  }

  input.value = '';
  _chatSyncComposerButton();

  await _chatLoadMessages(chat.activeConversationId, true);
  await _chatMarkRead(chat.activeConversationId, true);
}

async function _chatLoadDirectory() {
  const chat = _chatState();
  if (chat.hasAccess !== true) return;

  const search = (chat.directorySearch || '').trim();

  const { data, error } = await supabaseClient.rpc('chat_list_directory', {
    p_search: search || null,
    p_limit: 80,
  });

  if (error) {
    if (_chatHandleAccessDenied(error)) return;
    console.error('chat_list_directory:', error);
    showToast('ERRO AO LISTAR USUARIOS: ' + (error.message || 'Falha de leitura'));
    return;
  }

  chat.directory = Array.isArray(data) ? data : [];
  _chatRenderDirectory();
}

function _chatRenderDirectory() {
  const chat = _chatState();
  const list = _chatEl('chat-directory-list');
  const empty = _chatEl('chat-directory-empty');
  if (!list || !empty) return;

  const rows = Array.isArray(chat.directory) ? chat.directory : [];
  if (rows.length === 0) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');

  list.innerHTML = rows.map(row => {
    const nome = row.nome || row.email || 'Usuário';
    const inicial = nome.charAt(0).toUpperCase();
    const role = (row.role || 'vendedor').toUpperCase();
    return `
      <button type="button" class="chat-directory-item" data-chat-user="${row.user_id}">
        <span class="chat-directory-avatar">${escapeHTML(inicial)}</span>
        <span class="chat-directory-main">
          <span class="chat-directory-name">${escapeHTML(nome)}</span>
          <span class="chat-directory-meta">${escapeHTML(row.email || '')} • ${escapeHTML(role)}</span>
        </span>
      </button>
    `;
  }).join('');
}

async function _chatStartDirect(userId) {
  const chat = _chatState();
  if (!userId || chat.hasAccess !== true) return;

  const { data, error } = await supabaseClient.rpc('chat_start_direct', {
    p_other_user_id: userId,
  });

  if (error) {
    if (_chatHandleAccessDenied(error)) return;
    console.error('chat_start_direct:', error);
    showToast('ERRO AO INICIAR CONVERSA: ' + (error.message || 'Falha'));
    return;
  }

  _chatCloseDirectory();
  await _chatRefreshConversations(false);

  const convId = data || (_chatState().conversations[0]?.conversation_id || null);
  if (convId) {
    await _chatOpenConversation(convId, true);
  }
}

function _chatOpenDirectory() {
  const chat = _chatState();
  if (chat.hasAccess !== true) return;

  const overlay = _chatEl('chat-directory-overlay');
  if (!overlay) return;
  overlay.classList.remove('hidden');
  const input = _chatEl('chat-directory-search');
  if (input) {
    input.value = '';
    _chatState().directorySearch = '';
    setTimeout(() => input.focus(), 30);
  }
  _chatLoadDirectory();
}

function _chatCloseDirectory() {
  const overlay = _chatEl('chat-directory-overlay');
  if (!overlay) return;
  overlay.classList.add('hidden');
}

function _chatCloseShell() {
  const chat = _chatState();
  chat.isOpen = false;
  chat.mobileView = 'list';
  _chatCloseProfileCard();
  _chatApplyShellMode();
}

function _chatOpenShell() {
  const chat = _chatState();
  if (!_chatHasSession() || chat.hasAccess !== true) return;

  chat.isOpen = true;
  chat.isMobile = _chatIsMobileViewport();
  if (chat.isMobile && !chat.activeConversationId) {
    chat.mobileView = 'list';
  }

  _chatApplyShellMode();
  _chatRenderConversationList();
  _chatRenderThreadHeader();

  if (!chat.activeConversationId && !chat.isMobile && chat.conversations[0]) {
    _chatOpenConversation(chat.conversations[0].conversation_id, false);
  } else if (chat.activeConversationId) {
    _chatSubscribeThreadChannel(chat.activeConversationId);
  }
}

function _chatToggleShell() {
  const chat = _chatState();
  if (chat.isOpen) {
    _chatCloseShell();
  } else {
    _chatOpenShell();
  }
}

function _chatBackToList() {
  const chat = _chatState();
  if (!chat.isMobile) return;
  chat.mobileView = 'list';
  _chatCloseProfileCard();
  _chatApplyShellMode();
}

function _chatDetachConversationChannel() {
  const chat = _chatState();
  if (!chat.conversationChannel) return;
  supabaseClient.removeChannel(chat.conversationChannel);
  chat.conversationChannel = null;
}

function _chatDetachThreadChannel() {
  const chat = _chatState();
  if (chat.threadChannel) {
    supabaseClient.removeChannel(chat.threadChannel);
    chat.threadChannel = null;
  }
  if (chat.threadBroadcastChannel) {
    supabaseClient.removeChannel(chat.threadBroadcastChannel);
    chat.threadBroadcastChannel = null;
  }
}

// Garante que o socket Realtime tem o token de auth — obrigatorio para
// canais privados (broadcast com RLS). Idempotente, barato de chamar.
async function _chatEnsureRealtimeAuth() {
  try {
    const { data } = await supabaseClient.auth.getSession();
    const token = data && data.session ? data.session.access_token : null;
    if (token && supabaseClient.realtime && typeof supabaseClient.realtime.setAuth === 'function') {
      await supabaseClient.realtime.setAuth(token);
    }
  } catch (e) {
    console.warn('[chat] setAuth realtime falhou:', e);
  }
}

// Recebe uma mensagem via broadcast privado (caminho rapido) e injeta na
// thread aberta, com dedupe por id (evita duplicar com o fallback postgres).
function _chatHandleIncomingBroadcast(conversationId, payload) {
  const chat = _chatState();
  if (chat.activeConversationId !== conversationId) return;

  const id = Number(payload.id);
  if (!id) return;
  if (chat.messages.some(m => Number(m.id) === id)) return; // dedupe

  chat.messages.push({
    id: id,
    conversation_id: payload.conversation_id,
    sender_id: payload.sender_id,
    sender_nome: payload.sender_nome,
    sender_email: '',
    sender_avatar_url: payload.sender_avatar_url || null,
    body: payload.body,
    kind: payload.kind || 'text',
    reply_to_message_id: payload.reply_to_message_id || null,
    created_at: payload.created_at,
    edited_at: payload.edited_at || null,
    is_me: payload.sender_id === (state.currentUser && state.currentUser.id),
  });

  // Reordena por created_at,id (defende contra chegada fora de ordem)
  chat.messages.sort((a, b) => {
    const ta = new Date(a.created_at).getTime();
    const tb = new Date(b.created_at).getTime();
    if (ta !== tb) return ta - tb;
    return (Number(a.id) || 0) - (Number(b.id) || 0);
  });

  _chatRenderMessages(true);

  // Atualiza a lista lateral (preview/ordem/unread) sem bloquear
  _chatRefreshConversations(true).catch(() => {});

  if (_chatCanMarkReadNow()) {
    _chatQueueMarkRead(conversationId);
  }
}

function _chatSubscribeConversationChannel() {
  const chat = _chatState();
  if (!_chatHasSession() || chat.hasAccess !== true || chat.conversationChannel) return;

  const channelName = `chat-conv-${state.currentUser.id}-${Date.now()}`;
  chat.conversationChannel = supabaseClient
    .channel(channelName)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'chat_conversations'
    }, () => {
      _chatRefreshConversations(true);
    })
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'chat_participants'
    }, () => {
      _chatRefreshConversations(true);
    })
    .subscribe();
}

async function _chatSubscribeThreadChannel(conversationId) {
  const chat = _chatState();
  if (!_chatHasSession() || chat.hasAccess !== true || !conversationId) return;

  _chatDetachThreadChannel();

  // Garante token no socket antes de assinar canal privado
  await _chatEnsureRealtimeAuth();

  // Conversa pode ter mudado durante o await
  if (_chatState().activeConversationId !== conversationId) return;

  // --- CAMINHO RAPIDO: broadcast privado (topic = chat-conv-<uuid>) ---
  // Nome do canal == topic, pra casar com a policy chat_conv_broadcast_read.
  chat.threadBroadcastChannel = supabaseClient
    .channel(`chat-conv-${conversationId}`, { config: { private: true } })
    .on('broadcast', { event: 'new_message' }, (msg) => {
      const payload = msg && msg.payload ? msg.payload : null;
      if (payload && payload.id) {
        _chatHandleIncomingBroadcast(conversationId, payload);
      }
    })
    .subscribe((status) => {
      // SUBSCRIBED = canal privado autorizado (broadcast em tempo real ativo)
      // CHANNEL_ERROR = policy negou ou socket sem token
      console.log('[chat] broadcast', conversationId, '->', status);
    });

  // --- FALLBACK: postgres_changes (redundancia se broadcast falhar) ---
  const channelName = `chat-thread-${conversationId}-${Date.now()}`;
  chat.threadChannel = supabaseClient
    .channel(channelName)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'chat_messages',
      filter: `conversation_id=eq.${conversationId}`
    }, async () => {
      if (_chatState().activeConversationId !== conversationId) return;
      await _chatLoadMessages(conversationId, true, true); // silent: sem spinner
      await _chatRefreshConversations(true);
      if (_chatCanMarkReadNow()) {
        _chatQueueMarkRead(conversationId);
      }
    })
    .subscribe();
}

function _chatStartPolling() {
  const chat = _chatState();
  if (chat.pollTimer) clearInterval(chat.pollTimer);
  if (chat.hasAccess !== true) return;

  chat.pollTimer = setInterval(() => {
    if (!_chatHasSession() || _chatState().hasAccess !== true || document.hidden) return;
    _chatRefreshConversations(true);
    if (_chatCanMarkReadNow()) {
      _chatQueueMarkRead(_chatState().activeConversationId);
    }
  }, CHAT_POLL_MS);
}

function _chatStopPolling() {
  const chat = _chatState();
  if (chat.pollTimer) {
    clearInterval(chat.pollTimer);
    chat.pollTimer = null;
  }
}

function _chatBindEvents() {
  const fabBtn = _chatEl('chat-fab-btn');
  const closeBtn = _chatEl('chat-shell-close-btn');
  const backdrop = _chatEl('chat-shell-backdrop');
  const backBtn = _chatEl('chat-thread-back-btn');
  const metaBtn = _chatEl('chat-thread-meta-btn');
  const convSearch = _chatEl('chat-list-search');
  const convList = _chatEl('chat-list-items');
  const form = _chatEl('chat-thread-form');
  const input = _chatEl('chat-thread-input');
  const newBtn = _chatEl('chat-new-conversation-btn');
  const dirClose = _chatEl('chat-directory-close-btn');
  const dirSearch = _chatEl('chat-directory-search');
  const dirList = _chatEl('chat-directory-list');

  if (fabBtn) fabBtn.addEventListener('click', _chatToggleShell);
  if (closeBtn) closeBtn.addEventListener('click', _chatCloseShell);
  if (backdrop) backdrop.addEventListener('click', _chatCloseShell);
  if (backBtn) backBtn.addEventListener('click', _chatBackToList);
  if (metaBtn) {
    metaBtn.addEventListener('click', (e) => {
      e.preventDefault();
      _chatToggleProfileCard();
    });
  }

  if (convSearch) {
    convSearch.addEventListener('input', debounce((e) => {
      _chatState().searchTerm = (e.target.value || '').trim();
      _chatRefreshConversations(true);
    }, 220));
  }

  if (convList) {
    convList.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-chat-conv]');
      if (!btn) return;
      const id = btn.getAttribute('data-chat-conv');
      _chatOpenConversation(id, true);
    });
  }

  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      _chatSendCurrentMessage();
    });
  }

  if (input) {
    input.addEventListener('input', _chatSyncComposerButton);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        _chatSendCurrentMessage();
      }
    });
  }

  if (newBtn) newBtn.addEventListener('click', _chatOpenDirectory);
  if (dirClose) dirClose.addEventListener('click', _chatCloseDirectory);

  if (dirSearch) {
    dirSearch.addEventListener('input', debounce((e) => {
      _chatState().directorySearch = (e.target.value || '').trim();
      _chatLoadDirectory();
    }, 220));
  }

  if (dirList) {
    dirList.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-chat-user]');
      if (!btn) return;
      const uid = btn.getAttribute('data-chat-user');
      _chatStartDirect(uid);
    });
  }

  document.addEventListener('click', (e) => {
    const chat = _chatState();
    if (!chat.profileCardOpen) return;
    const card = _chatEl('chat-thread-profile-card');
    const trigger = _chatEl('chat-thread-meta-btn');
    if (!card || !trigger) return;
    if (trigger.contains(e.target) || card.contains(e.target)) return;
    _chatCloseProfileCard();
  });

  window.addEventListener('resize', () => {
    const chat = _chatState();
    if (!chat.isOpen) return;
    const wasMobile = chat.isMobile;
    chat.isMobile = _chatIsMobileViewport();
    if (wasMobile && !chat.isMobile) {
      chat.mobileView = 'list';
    }
    _chatApplyShellMode();
  });

  document.addEventListener('visibilitychange', () => {
    if (!_chatHasSession() || _chatState().hasAccess !== true) return;
    if (!document.hidden) {
      _chatRefreshConversations(true);
      if (_chatCanMarkReadNow()) {
        _chatQueueMarkRead(_chatState().activeConversationId);
      }
    }
  });
}

async function chatBoot() {
  const chat = _chatState();

  if (!_chatHasSession()) {
    chat.hasAccess = false;
    chatTeardown(true);
    return;
  }

  const canUseChat = await _chatCheckAccess();
  if (!canUseChat) {
    chat.hasAccess = false;
    chatTeardown(true);
    return;
  }
  chat.hasAccess = true;

  if (!chat.initialized) {
    _chatBindEvents();
    chat.initialized = true;
  }

  // Push notifications: registra Service Worker e sugere ativacao (1x)
  if (typeof pushInit === 'function') {
    pushInit().then(() => {
      if (typeof pushMaybePromptInChat === 'function') {
        pushMaybePromptInChat();
      }
    });
  }

  _chatUpdateFab();
  _chatApplyShellMode();
  _chatSubscribeConversationChannel();
  _chatStartPolling();
  await _chatRefreshConversations(true);

  if (!chat.isMobile && chat.conversations[0] && !chat.activeConversationId) {
    await _chatOpenConversation(chat.conversations[0].conversation_id, false);
  }
}

function chatHandleAppTabChange() {
  const chat = _chatState();
  if (chat.isOpen && chat.isMobile) {
    _chatCloseShell();
  }
}

function chatTeardown(hideUI = false) {
  const chat = _chatState();

  _chatDetachThreadChannel();
  _chatDetachConversationChannel();
  _chatStopPolling();

  chat.hasAccess = false;
  chat.isOpen = false;
  chat.mobileView = 'list';
  chat.loadingConversations = false;
  chat.loadingMessages = false;
  chat.conversations = [];
  chat.messages = [];
  chat.directory = [];
  chat.unreadTotal = 0;
  chat.activeConversationId = null;
  chat.activeConversation = null;
  chat.activeConversationTitle = '';
  chat.profileCardOpen = false;

  if (hideUI) {
    const shell = _chatEl('chat-shell');
    const backdrop = _chatEl('chat-shell-backdrop');
    const wrap = _chatEl('chat-fab-container');
    if (shell) shell.classList.add('hidden');
    if (backdrop) backdrop.classList.add('hidden');
    if (wrap) wrap.classList.add('hidden');
  }

  _chatUpdateFab();
  _chatRenderThreadHeader();
}

window.chatBoot = chatBoot;
window.chatTeardown = chatTeardown;
window.chatHandleAppTabChange = chatHandleAppTabChange;




















