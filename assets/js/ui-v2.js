// ==========================================
// VISUAL NOVO (v2 · "Clara") — PADRÃO PARA TODOS (o antigo fica de reserva)
// ------------------------------------------
// Não destrutivo: todo o CSS novo fica sob html[data-ui="v2"] e este arquivo
// só EMBRULHA funções globais existentes (renderHeaderUser, applyThemeMode);
// nenhum módulo antigo é editado. Sem o atributo, o portal é o de sempre.
//
// Padrão: window.UI_V2_PADRAO (definido no <head> do index.html). Com true,
// todo mundo entra no visual novo; com false, volta a ser beta só de admin.
// Reserva: "Voltar ao visual antigo" no menu do usuário grava ui_v2 = '0'
// neste navegador; o botão "Visual novo" do header antigo grava '1'.
// Escape: ?ui=v1 na URL força o visual antigo nesta carga.
// ==========================================

(function () {
  const KEY = 'ui_v2';
  const root = document.documentElement;
  const forceV1 = new URLSearchParams(window.location.search).get('ui') === 'v1';

  const PADRAO = window.UI_V2_PADRAO !== false;
  const pref = () => { try { return localStorage.getItem(KEY); } catch (_) { return null; } }; // '1' | '0' | null
  const setFlag = (on) => { try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (_) {} };
  // quem pode usar o visual novo e se ele liga sozinho
  const podeUsar = () => PADRAO || isAdmin();
  const querV2 = () => (PADRAO ? pref() !== '0' : pref() === '1');
  const isActive = () => root.getAttribute('data-ui') === 'v2';
  const isLoggedIn = () => typeof state !== 'undefined' && state && state.currentUser;
  const isAdmin = () => typeof state !== 'undefined' && state && state.isAdmin === true;

  function setStylesheets(on) {
    // media (e não .disabled): o Chrome descarta a folha ao desabilitar e não recarrega ao reabilitar
    document.querySelectorAll('link[data-ui-v2]').forEach((l) => { l.media = on ? 'all' : 'not all'; });
  }

  // Logo oficial em SVG (cores exatas da marca). O PNG antigo usa outro laranja.
  // O "Ágil" segue var(--v2-logo-a): azul no claro, branco no escuro.
  const LOGO_SVG = '<svg viewBox="0 0 620 425" aria-hidden="true"><path fill="#008FD4" d="M162 0H345Q375 0 388 24L620 425H435Q405 425 392 402L310 258L336 213H285Z"/><path fill="#FAA519" d="M150 213H285L310 258L228 402Q215 425 186 425H0L107 238Q121 213 150 213Z"/></svg>'
    + '<span class="wm"><b><span style="color:var(--v2-logo-a)">Ágil</span><span style="color:#FAA519">Solar</span></b></span>';

  function setLogo(on) {
    const existing = document.querySelector('#app-content > header .ui-v2-logo');
    if (!on) { if (existing) existing.remove(); return; }
    if (existing) return;
    const img = document.querySelector('#app-content > header img[data-theme-logo]');
    if (!img || !img.parentNode) return;
    const el = document.createElement('span');
    el.className = 'ui-v2-logo';
    el.setAttribute('aria-label', 'Ágil Solar');
    el.innerHTML = LOGO_SVG;
    img.parentNode.insertBefore(el, img);
  }

  // Fonte do visual novo só é baixada por quem usa o v2.
  function ensureFont() {
    if (document.getElementById('ui-v2-font')) return;
    const l = document.createElement('link');
    l.id = 'ui-v2-font';
    l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Inter:wght@900&display=swap';
    document.head.appendChild(l);
  }

  function apply(on) {
    if (on) ensureFont();
    if (on) root.setAttribute('data-ui', 'v2');
    else root.removeAttribute('data-ui');
    setStylesheets(on);
    setLogo(on);
    if (typeof applyThemeMode === 'function') applyThemeMode();
    document.dispatchEvent(new CustomEvent('uiv2:change', { detail: { on } }));
  }

  // Chamado depois que os papéis do usuário são conhecidos (via renderHeaderUser).
  function sync() {
    if (!isLoggedIn()) return;
    if (!podeUsar() && pref() === '1') { try { localStorage.removeItem(KEY); } catch (_) {} }
    const want = podeUsar() && querV2() && !forceV1;
    if (want !== isActive()) apply(want);
    renderToggle(podeUsar());
  }

  function renderToggle(mostrar) {
    let btn = document.getElementById('ui-v2-toggle-btn');
    if (!mostrar) { if (btn) btn.remove(); return; }
    const anchor = document.getElementById('admin-toggle-btn');
    if (!anchor || !anchor.parentNode) return;
    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'ui-v2-toggle-btn';
      btn.type = 'button';
      btn.onclick = toggle;
      anchor.parentNode.insertBefore(btn, anchor);
    }
    const on = isActive();
    btn.title = on ? 'Voltar para o visual antigo' : 'Usar o visual novo';
    btn.className = 'ui-v2-toggle p-3 border transition-all duration-300 flex items-center gap-2 text-[9px] font-black uppercase tracking-widest shrink-0 '
      + (on ? 'is-on' : 'bg-black border-neutral-800 text-neutral-300 hover:text-white hover:border-neutral-600');
    btn.innerHTML = on
      ? '<i data-lucide="undo-2" class="w-4 h-4"></i><span class="hidden lg:inline">Visual antigo</span>'
      : '<i data-lucide="sparkles" class="w-4 h-4"></i><span class="hidden lg:inline">Visual novo</span>';
    if (typeof queueAppLucideCreateIcons === 'function') queueAppLucideCreateIcons();
    else if (window.lucide) window.lucide.createIcons();
  }

  function toggle() {
    if (!podeUsar()) return;
    const next = !isActive();
    setFlag(next);
    if (forceV1 && next) {
      const url = new URL(window.location.href);
      url.searchParams.delete('ui');
      window.history.replaceState(window.history.state, '', url);
    }
    apply(next);
    renderToggle(true);
    if (typeof showToast === 'function') showToast(next ? 'VISUAL NOVO ATIVADO' : 'VISUAL ANTIGO ATIVADO');
    if (typeof captureEvent === 'function') { try { captureEvent('ui_v2_toggle', { on: next }); } catch (_) {} }
    if (typeof renderContent === 'function') { try { renderContent(); } catch (_) {} }
  }

  // --- ganchos (embrulham funções globais existentes) ---
  if (typeof renderHeaderUser === 'function') {
    const _renderHeaderUser = renderHeaderUser;
    renderHeaderUser = function () {
      const out = _renderHeaderUser.apply(this, arguments);
      try { sync(); } catch (err) { console.warn('[ui-v2] sync falhou', err); }
      return out;
    };
  }

  // No v2 o tema sai sempre da preferência salva. (O getActiveThemeMode antigo
  // devolve o data-theme já aplicado e trava a troca até recarregar.)
  if (typeof applyThemeMode === 'function') {
    const _applyThemeMode = applyThemeMode;
    applyThemeMode = function () {
      if (isActive() && typeof getThemePreference === 'function') {
        const pref = getThemePreference();
        const mode = pref === 'system'
          ? (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
          : pref;
        root.setAttribute('data-theme', mode);
      }
      const out = _applyThemeMode.apply(this, arguments);
      if (isActive()) {
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.setAttribute('content', root.getAttribute('data-theme') === 'light' ? '#F3F6F9' : '#0A1118');
      }
      return out;
    };
  }

  // Ícones: lucide.createIcons() recria TODOS os ícones da página a cada chamada,
  // até os já desenhados (centenas por troca de aba). No v2 desenha só os novos
  // (<i data-lucide>) e os <svg> cujo nome foi trocado depois (ex.: menu ↔ x).
  if (window.lucide && typeof window.lucide.createIcons === 'function' && window.lucide.icons) {
    const _createIcons = window.lucide.createIcons.bind(window.lucide);
    window.lucide.createIcons = function (opts) {
      if (!isActive() || (opts && (opts.nameAttr || opts.root))) return _createIcons(opts);
      const pend = [...document.querySelectorAll('[data-lucide]')].filter((el) => el.tagName.toLowerCase() !== 'svg' || !el.classList.contains('lucide-' + el.getAttribute('data-lucide')));
      if (!pend.length) return undefined;
      pend.forEach((el) => el.setAttribute('data-lucide-new', el.getAttribute('data-lucide')));
      const out = _createIcons({ icons: window.lucide.icons, ...(opts || {}), nameAttr: 'data-lucide-new' });
      document.querySelectorAll('[data-lucide-new]').forEach((el) => el.removeAttribute('data-lucide-new'));
      return out;
    };
  }

  // O <head> pode ter ligado o v2 cedo (sem piscar); habilita os CSS já.
  // O sync() pós-login confirma ou desfaz.
  if (isActive()) {
    if (forceV1) apply(false); else { ensureFont(); setStylesheets(true); setLogo(true); }
  }

  window.uiV2 = { sync, toggle, isActive };
})();
