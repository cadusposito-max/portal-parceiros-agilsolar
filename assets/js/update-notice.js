// =======================================================================
// AVISO DE ATUALIZAÇÃO
// Lê assets/build.json (gerado pelo GitHub Action a cada push) e avisa o
// usuário quando há uma versão publicada diferente da última que ele viu.
// Sem dependências; carregado por <script> no index.html.
// =======================================================================
(function () {
  'use strict';

  var BUILD_URL   = 'assets/build.json';
  var SEEN_KEY    = 'app:update_seen_version';
  var BANNER_ID   = 'update-notice-banner';

  function lsGet(key) {
    try { return window.localStorage.getItem(key); } catch (_) { return null; }
  }
  function lsSet(key, val) {
    try { window.localStorage.setItem(key, val); } catch (_) { /* modo privado / bloqueado */ }
  }

  function dismiss(version) {
    if (version) lsSet(SEEN_KEY, version);
    var el = document.getElementById(BANNER_ID);
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  function showBanner(build) {
    if (document.getElementById(BANNER_ID)) return; // já visível

    var wrap = document.createElement('div');
    wrap.id = BANNER_ID;
    wrap.style.cssText = [
      'position:fixed', 'z-index:99999', 'right:16px', 'bottom:16px',
      'max-width:340px', 'width:calc(100% - 32px)'
    ].join(';');
    wrap.className = 'animate-fade-in-up';

    wrap.innerHTML =
      '<div class="bg-neutral-900 border border-orange-500/40 shadow-[0_0_24px_rgba(234,88,12,0.25)] p-4">' +
        '<div class="flex items-start gap-3">' +
          '<div class="w-8 h-8 shrink-0 bg-orange-500/15 text-orange-400 grid place-items-center">' +
            '<i data-lucide="sparkles" class="w-4 h-4"></i>' +
          '</div>' +
          '<div class="min-w-0">' +
            '<div class="text-white font-black text-sm uppercase tracking-wide">Atualização disponível</div>' +
            '<div class="text-neutral-400 text-[11px] mt-1 leading-relaxed">Uma nova versão do portal foi publicada. Recarregue para usar a mais recente.</div>' +
            '<div class="text-neutral-600 text-[9px] font-bold uppercase tracking-widest mt-1.5">' + escapeText(build.version || '') + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="flex items-center justify-end gap-2 mt-3">' +
          '<button type="button" id="update-notice-later" class="px-3 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-black text-[10px] uppercase tracking-widest transition-colors">Depois</button>' +
          '<button type="button" id="update-notice-reload" class="px-3 py-2 bg-orange-500 hover:bg-orange-400 text-black font-black text-[10px] uppercase tracking-widest transition-colors">Atualizar agora</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(wrap);
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      try { window.lucide.createIcons(); } catch (_) {}
    }

    var laterBtn  = document.getElementById('update-notice-later');
    var reloadBtn = document.getElementById('update-notice-reload');
    if (laterBtn) laterBtn.addEventListener('click', function () { dismiss(build.version); });
    if (reloadBtn) reloadBtn.addEventListener('click', function () {
      // Marca como vista antes de recarregar para não reaparecer nesta versão.
      lsSet(SEEN_KEY, build.version);
      var url = new URL(window.location.href);
      url.searchParams.set('app_v', build.version || String(Date.now()));
      window.location.replace(url.toString());
    });
  }

  function escapeText(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function check() {
    fetch(BUILD_URL + '?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (build) {
        if (!build || !build.version) return;
        // Em desenvolvimento o build.json fica como "local" — nunca avisa.
        if (build.version === 'local') return;

        var seen = lsGet(SEEN_KEY);
        // Primeira visita (nada salvo): apenas memoriza a versão atual, sem avisar.
        if (!seen) { lsSet(SEEN_KEY, build.version); return; }
        // Versão publicada diferente da última vista → mostra o aviso.
        if (seen !== build.version) showBanner(build);
      })
      .catch(function () { /* build.json ausente/offline: ignora silenciosamente */ });
  }

  // Verifica periodicamente ENQUANTO a pessoa usa a plataforma, para o aviso
  // aparecer sem precisar dar refresh. Também checa ao voltar para a aba.
  var POLL_MS = 3 * 60 * 1000; // 3 minutos

  function start() {
    check();
    setInterval(function () {
      // Não gasta requisição com a aba em segundo plano; checa ao voltar (abaixo).
      if (document.visibilityState !== 'hidden') check();
    }, POLL_MS);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') check();
    });
    window.addEventListener('focus', check);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
