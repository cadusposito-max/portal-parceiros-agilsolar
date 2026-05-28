// ============================================================================
// Web Push — registra SW, pede permissão, cria subscription e salva no
// Supabase (tabela push_subscriptions). Funcionalidade Chrome/Edge/Firefox
// (Android + Desktop) + Safari 16.4+ via PWA instalado.
// ============================================================================

const VAPID_PUBLIC_KEY = 'BFhZqVXlshk7AL2JHG8NyS80ZQSZ1roYB8I4NHl_QmjqH5scBSAMGZKPtoqAoYl9UYj9ZlMxzgdc0wQzNcKDRT8';
const LS_DISMISSED_AT  = 'push_dismissedAt';
const DISMISS_COOLDOWN_DAYS = 30;

let _swRegistration = null;

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

// Converte base64url -> Uint8Array (formato exigido pela Web Push API)
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw     = atob(base64);
  const out     = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function pushIsSupported() {
  return 'serviceWorker' in navigator
      && 'PushManager'   in window
      && 'Notification'  in window;
}

function pushGetPermission() {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission; // 'default' | 'granted' | 'denied'
}

function pushDismissedRecently() {
  const lastTs = parseInt(localStorage.getItem(LS_DISMISSED_AT) || '0', 10);
  if (!lastTs) return false;
  const daysAgo = (Date.now() - lastTs) / (1000 * 60 * 60 * 24);
  return daysAgo < DISMISS_COOLDOWN_DAYS;
}

function pushMarkDismissed() {
  localStorage.setItem(LS_DISMISSED_AT, String(Date.now()));
}

function pushClearDismissed() {
  localStorage.removeItem(LS_DISMISSED_AT);
}

// Detecta se devemos sugerir notificações (suportado, sem decisão prévia,
// não bloqueado, não dispensado recentemente).
function pushShouldPromptUser() {
  if (!pushIsSupported())           return false;
  if (Notification.permission === 'granted') return false;
  if (Notification.permission === 'denied')  return false;
  if (pushDismissedRecently())      return false;
  return true;
}

// ----------------------------------------------------------------------------
// Init: registra o SW. Chamar logo após login bem-sucedido.
// ----------------------------------------------------------------------------
async function pushInit() {
  if (!pushIsSupported()) {
    console.log('[push] navegador nao suporta Web Push');
    return null;
  }
  try {
    _swRegistration = await navigator.serviceWorker.register('/sw.js');
    console.log('[push] Service Worker registrado:', _swRegistration.scope);

    // Mensagens do SW (cliques em notificação)
    navigator.serviceWorker.addEventListener('message', (event) => {
      const data = event.data || {};
      if (data.type !== 'NOTIFICATION_CLICK') return;
      const url = data.url || '';
      const m   = url.match(/#chat\/([0-9a-f-]+)/i);
      if (m && typeof openConversation === 'function') {
        // Função do chat.js — abre a conversa diretamente
        openConversation(m[1]);
      } else if (url.includes('#')) {
        window.location.hash = url.substring(url.indexOf('#') + 1);
      }
    });

    // Se já tem subscription ativa, atualiza last_seen_at no servidor
    if (Notification.permission === 'granted') {
      const existing = await _swRegistration.pushManager.getSubscription();
      if (existing) {
        await pushSaveSubscriptionToServer(existing);
      }
    }
    return _swRegistration;
  } catch (err) {
    console.error('[push] falha ao registrar SW:', err);
    return null;
  }
}

// ----------------------------------------------------------------------------
// Pedir permissão + criar subscription + salvar no servidor.
// Chame depois do user clicar em "Ativar notificações" no banner.
// ----------------------------------------------------------------------------
async function pushRequestPermissionAndSubscribe() {
  if (!_swRegistration) {
    // Tenta inicializar se ainda não rodou
    await pushInit();
    if (!_swRegistration) return { ok: false, reason: 'sw_not_registered' };
  }
  if (!pushIsSupported()) {
    return { ok: false, reason: 'unsupported' };
  }

  let permission = Notification.permission;
  if (permission === 'default') {
    permission = await Notification.requestPermission();
  }
  if (permission !== 'granted') {
    pushMarkDismissed();
    return { ok: false, reason: 'denied' };
  }

  try {
    let subscription = await _swRegistration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await _swRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });
    }

    const saveResult = await pushSaveSubscriptionToServer(subscription);
    if (!saveResult.ok) {
      console.error('[push] subscription criada mas falha ao salvar:', saveResult.error);
      return { ok: false, reason: 'save_failed', error: saveResult.error };
    }

    pushClearDismissed();
    return { ok: true, subscription };
  } catch (err) {
    console.error('[push] erro ao criar subscription:', err);
    return { ok: false, reason: 'subscribe_failed', error: String(err) };
  }
}

// ----------------------------------------------------------------------------
// UPSERT da subscription em push_subscriptions (endpoint UNIQUE => não duplica)
// ----------------------------------------------------------------------------
async function pushSaveSubscriptionToServer(subscription) {
  if (!state?.currentUser?.id) return { ok: false, error: 'no user' };
  if (!state?.franquiaId)      return { ok: false, error: 'no franquia' };

  const sub = subscription.toJSON();
  if (!sub.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    return { ok: false, error: 'subscription malformada' };
  }

  const row = {
    user_id:      state.currentUser.id,
    franquia_id:  state.franquiaId,
    endpoint:     sub.endpoint,
    p256dh:       sub.keys.p256dh,
    auth:         sub.keys.auth,
    user_agent:   (navigator.userAgent || '').slice(0, 200),
    active:       true,
    last_seen_at: new Date().toISOString(),
  };

  const { error } = await supabaseClient
    .from('push_subscriptions')
    .upsert(row, { onConflict: 'endpoint' });

  if (error) {
    console.error('[push] upsert push_subscriptions:', error);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

// ----------------------------------------------------------------------------
// Desligar notificações neste device
// ----------------------------------------------------------------------------
async function pushUnsubscribe() {
  if (!_swRegistration) return { ok: true, reason: 'no_sw' };
  const sub = await _swRegistration.pushManager.getSubscription();
  if (!sub) return { ok: true, reason: 'no_subscription' };

  try {
    // Marca inativa no servidor ANTES de cancelar local (não perde o registro)
    await supabaseClient
      .from('push_subscriptions')
      .update({ active: false })
      .eq('endpoint', sub.endpoint);
    await sub.unsubscribe();
    pushMarkDismissed();
    return { ok: true };
  } catch (err) {
    console.error('[push] erro ao desinscrever:', err);
    return { ok: false, error: String(err) };
  }
}

// ----------------------------------------------------------------------------
// Banner de pedido de permissão (UI)
// Mostra um banner discreto no topo do chat na 1ª vez. Não é modal.
// Se o user clicar "Agora não", esconde por 30 dias.
// ----------------------------------------------------------------------------
const PUSH_BANNER_ID = 'push-permission-banner';

function pushHideBanner() {
  const el = document.getElementById(PUSH_BANNER_ID);
  if (el) el.remove();
}

function pushShowPermissionBanner() {
  if (!pushShouldPromptUser())           return; // não atende as condições
  if (document.getElementById(PUSH_BANNER_ID)) return; // já está na tela

  const banner = document.createElement('div');
  banner.id = PUSH_BANNER_ID;
  banner.className = [
    'fixed', 'top-3', 'left-1/2', '-translate-x-1/2', 'z-50',
    'w-[95%]', 'max-w-md',
    'bg-neutral-900', 'border', 'border-orange-500/40',
    'rounded-xl', 'shadow-[0_0_30px_rgba(234,88,12,0.15)]',
    'p-4', 'flex', 'items-start', 'gap-3',
    'animate-[slideUp_0.3s_ease-out]'
  ].join(' ');
  banner.innerHTML = `
    <div class="bg-orange-500/15 p-2 rounded-lg shrink-0">
      <i data-lucide="bell" class="w-5 h-5 text-orange-400"></i>
    </div>
    <div class="flex-1 min-w-0">
      <p class="text-white font-bold text-sm leading-tight">Ativar notificações?</p>
      <p class="text-neutral-400 text-xs mt-1 leading-snug">
        Receba aviso de novas mensagens mesmo com o app fechado.
      </p>
      <div class="flex gap-2 mt-3">
        <button id="push-banner-enable"
          class="bg-gradient-to-r from-orange-600 to-yellow-500 hover:from-orange-500 hover:to-yellow-400 text-black font-black uppercase tracking-wider text-[11px] px-4 py-2 rounded-lg transition-all active:scale-95">
          Ativar
        </button>
        <button id="push-banner-dismiss"
          class="bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-bold uppercase tracking-wider text-[11px] px-4 py-2 rounded-lg transition-all active:scale-95">
          Agora não
        </button>
      </div>
    </div>
    <button id="push-banner-close"
      class="text-neutral-500 hover:text-white transition-colors shrink-0 -mt-1 -mr-1 p-1">
      <i data-lucide="x" class="w-4 h-4"></i>
    </button>
  `;
  document.body.appendChild(banner);

  // Renderiza ícones lucide
  if (window.lucide && typeof lucide.createIcons === 'function') {
    lucide.createIcons();
  }

  // Handlers
  document.getElementById('push-banner-enable').addEventListener('click', async () => {
    const btn = document.getElementById('push-banner-enable');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i data-lucide="loader-2" class="w-3 h-3 animate-spin inline"></i> Ativando…';
      if (window.lucide) lucide.createIcons();
    }
    const result = await pushRequestPermissionAndSubscribe();
    pushHideBanner();
    if (result.ok) {
      if (typeof showToast === 'function') showToast('NOTIFICAÇÕES ATIVADAS!');
    } else if (result.reason === 'denied') {
      if (typeof showToast === 'function') {
        showToast('Permissão negada. Ative em Configurações do navegador.');
      }
    } else {
      if (typeof showToast === 'function') showToast('Erro ao ativar notificações.');
    }
  });

  document.getElementById('push-banner-dismiss').addEventListener('click', () => {
    pushMarkDismissed();
    pushHideBanner();
  });
  document.getElementById('push-banner-close').addEventListener('click', () => {
    pushMarkDismissed();
    pushHideBanner();
  });
}

// Função pública que o chat (ou outras telas) chama no momento certo
function pushMaybePromptInChat() {
  // Só mostra se faz sentido (suportado, sem decisão prévia, sem cooldown)
  if (!pushShouldPromptUser()) return;
  // Pequeno delay pra não disparar imediatamente ao abrir o chat
  setTimeout(() => pushShowPermissionBanner(), 1200);
}

// Expor handler pra uso externo (debug / settings)
window.pushDebug = {
  isSupported:  pushIsSupported,
  permission:   pushGetPermission,
  shouldPrompt: pushShouldPromptUser,
  subscribe:    pushRequestPermissionAndSubscribe,
  unsubscribe:  pushUnsubscribe,
  init:         pushInit,
  showBanner:   pushShowPermissionBanner,
  hideBanner:   pushHideBanner,
};
