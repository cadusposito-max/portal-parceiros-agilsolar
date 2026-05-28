// ============================================================================
// Service Worker — Ágil Solar Portal Parceiros
// Responsável por receber Web Push notifications e abrir o app na conversa
// certa quando o usuário clica na notificação.
//
// Escopo: raiz do PWA (`/`)
// ============================================================================

const SW_VERSION = 'agilsolar-sw-v1';

// Defaults caso o payload não venha completo (fallback)
const DEFAULT_NOTIFICATION = {
  title: 'Ágil Solar',
  body:  'Você tem uma nova mensagem',
  icon:  '/assets/img/app-icon-192.png',
  badge: '/assets/img/app-icon-192-mono.png'
};

// ----------------------------------------------------------------------------
// Lifecycle: ativa o SW imediatamente assim que registrado/atualizado
// ----------------------------------------------------------------------------
self.addEventListener('install', (event) => {
  // skipWaiting() faz a versão nova substituir a antiga sem esperar usuário
  // fechar todas as abas. Como o app é single-page, é mais previsível.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // clients.claim() faz o SW assumir controle das abas abertas imediatamente
  event.waitUntil(self.clients.claim());
});

// ----------------------------------------------------------------------------
// Push: recebe a notificação enviada pela Edge Function send-chat-notification
// ----------------------------------------------------------------------------
self.addEventListener('push', (event) => {
  let payload = DEFAULT_NOTIFICATION;

  // Tenta parsear o JSON enviado pela Edge Function. Se falhar, usa defaults.
  if (event.data) {
    try {
      payload = { ...DEFAULT_NOTIFICATION, ...event.data.json() };
    } catch (err) {
      // Pode acontecer se o push vier sem body (ex.: navegador testando)
      payload.body = event.data.text() || DEFAULT_NOTIFICATION.body;
    }
  }

  const title = payload.title || DEFAULT_NOTIFICATION.title;
  const options = {
    body:     payload.body || DEFAULT_NOTIFICATION.body,
    icon:     payload.icon || DEFAULT_NOTIFICATION.icon,
    badge:    payload.badge || DEFAULT_NOTIFICATION.badge,
    tag:      payload.tag || undefined,        // agrupa por conversa (não floodear)
    renotify: payload.renotify !== false,      // re-notifica mesmo se tag igual
    data:     payload.data || {},              // url, conversation_id, message_id
    requireInteraction: false,                  // some sozinho após X segundos
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ----------------------------------------------------------------------------
// Click na notificação: foca a aba aberta ou abre uma nova na conversa certa
// ----------------------------------------------------------------------------
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = (event.notification.data && event.notification.data.url) || '/index.html';

  event.waitUntil((async () => {
    const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });

    // Se já tem uma aba do app aberta, foca nela e manda mensagem pra
    // navegar pra conversa certa (sem reload)
    for (const client of clientList) {
      const sameOrigin = new URL(client.url).origin === self.location.origin;
      if (sameOrigin && 'focus' in client) {
        client.focus();
        client.postMessage({
          type: 'NOTIFICATION_CLICK',
          url:  targetUrl,
          data: event.notification.data
        });
        return;
      }
    }

    // Nenhuma aba aberta — abre nova
    if (self.clients.openWindow) {
      await self.clients.openWindow(targetUrl);
    }
  })());
});

// ----------------------------------------------------------------------------
// Subscription change: navegador renovou a subscription (raro mas acontece).
// Apenas loga — a re-inscrição é feita pelo frontend no próximo login/refresh.
// ----------------------------------------------------------------------------
self.addEventListener('pushsubscriptionchange', (event) => {
  // O app vai detectar isso no próximo registerPush() e re-subscrever.
  // Aqui só registramos no console pra debug.
  console.log('[sw] pushsubscriptionchange', event);
});
