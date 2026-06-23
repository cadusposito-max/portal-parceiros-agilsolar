// ==========================================
// APP: ORQUESTRADOR PRINCIPAL
// ==========================================

// --- Relógio ao vivo (Dashboard) ---
let _clockInterval = null;

function startDashboardClock() {
  // Evita acumular múltiplos intervals quando o dashboard é re-renderizado.
  if (_clockInterval) clearInterval(_clockInterval);

  const tick = () => {
    const el = document.getElementById('dashboard-clock');
    if (!el) return;
    el.textContent = new Date().toLocaleTimeString('pt-BR', {
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  };
  tick();
  _clockInterval = setInterval(tick, 1000);
}

function stopDashboardClock() {
  if (_clockInterval) { clearInterval(_clockInterval); _clockInterval = null; }
}

let _appLucideCreateIconsRaf = null;

function queueAppLucideCreateIcons() {
  if (!window.lucide || typeof window.lucide.createIcons !== 'function') return;
  if (_appLucideCreateIconsRaf) return;

  _appLucideCreateIconsRaf = window.requestAnimationFrame(() => {
    _appLucideCreateIconsRaf = null;
    window.lucide.createIcons();
  });
}

const ADMIN_PREFS_KEY = 'admin_qol_prefs_v1';

function userCanAccessAdminPanel() {
  return Boolean(state.isAdmin || state.isGestor);
}

function _buildAdminPrefsSnapshot() {
  return {
    adminViewAll: Boolean(state.adminViewAll),
    adminScopeFranquiaId: state.adminScopeFranquiaId || 'all',
    adminClientesViewMode: state.adminClientesViewMode || 'list',
    adminClientesFilters: { ...(state.adminClientesFilters || {}) },
    adminVendasFilters: { ...(state.adminVendasFilters || {}) },
  };
}

function persistAdminPreferences() {
  if (!state.isAdmin) return;
  try {
    localStorage.setItem(ADMIN_PREFS_KEY, JSON.stringify(_buildAdminPrefsSnapshot()));
  } catch (error) {
    console.warn('[persistAdminPreferences] Falha ao salvar preferencias.', error);
  }
}

function hydrateAdminPreferences() {
  if (!state.isAdmin || state.adminPrefsLoaded) return;

  try {
    const raw = localStorage.getItem(ADMIN_PREFS_KEY);
    if (!raw) {
      state.adminPrefsLoaded = true;
      return;
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      state.adminPrefsLoaded = true;
      return;
    }

    if (typeof parsed.adminViewAll === 'boolean') {
      state.adminViewAll = parsed.adminViewAll;
    }

    state.adminScopeFranquiaId = String(parsed.adminScopeFranquiaId || 'all');

    const viewMode = String(parsed.adminClientesViewMode || 'list');
    state.adminClientesViewMode = viewMode === 'kanban' ? 'kanban' : 'list';

    const persistedClientFilters = parsed.adminClientesFilters;
    if (persistedClientFilters && typeof persistedClientFilters === 'object') {
      state.adminClientesFilters = {
        ...state.adminClientesFilters,
        ...persistedClientFilters,
      };
    }

    const persistedSalesFilters = parsed.adminVendasFilters;
    if (persistedSalesFilters && typeof persistedSalesFilters === 'object') {
      state.adminVendasFilters = {
        ...state.adminVendasFilters,
        ...persistedSalesFilters,
      };
    }
  } catch (error) {
    console.warn('[hydrateAdminPreferences] Falha ao carregar preferencias.', error);
  } finally {
    state.adminPrefsLoaded = true;
  }
}

function toggleMobileMenu() {
  const menu = document.getElementById('mobile-menu');
  const btn  = document.getElementById('hamburger-btn');
  const icon = document.getElementById('hamburger-icon');
  const isOpen = !menu.classList.contains('hidden');
  menu.classList.toggle('hidden', isOpen);
  if (btn) btn.setAttribute('aria-expanded', String(!isOpen));
  if (icon) {
    icon.setAttribute('data-lucide', isOpen ? 'menu' : 'x');
    queueAppLucideCreateIcons();
  }
}

function closeMobileMenu() {
  const menu = document.getElementById('mobile-menu');
  const btn  = document.getElementById('hamburger-btn');
  const icon = document.getElementById('hamburger-icon');
  if (menu) menu.classList.add('hidden');
  if (btn)  btn.setAttribute('aria-expanded', 'false');
  if (icon) { icon.setAttribute('data-lucide', 'menu'); queueAppLucideCreateIcons(); }
}

// --- Header User Pill ---
function renderHeaderUser() {
  const profileNome = state.profile?.nome || '';
  const email       = state.currentUser ? state.currentUser.email : '';
  const displayName = profileNome || getFirstName();
  const initial     = displayName ? displayName.charAt(0).toUpperCase() : email.charAt(0).toUpperCase();
  const rawAvatarUrl = state.profile?.avatar_url || '';
  const avatarUrl    = rawAvatarUrl ? safeImageUrl(rawAvatarUrl, 'assets/img/logo-light.png') : '';

  const avatarEl = document.getElementById('header-user-avatar');
  const nameEl   = document.getElementById('header-user-name');
  const roleEl   = document.getElementById('header-user-role');
  const wrapEl   = document.getElementById('header-user');

  if (avatarEl) {
    if (avatarUrl) {
      avatarEl.innerHTML = `<img src="${avatarUrl}" alt="avatar" class="w-full h-full object-cover rounded-full" onerror="this.src='assets/img/logo-light.png';this.onerror=null;">`;
    } else {
      avatarEl.textContent = initial;
    }
    avatarEl.title   = 'Meu Perfil';
    avatarEl.style.cursor = 'pointer';
    avatarEl.onclick = openProfileModal;
  }
  if (nameEl)   nameEl.textContent = displayName;
  if (roleEl)   roleEl.textContent = state.isAdmin ? 'Administrador' : state.isGestor ? 'Gestor' : state.isTecnico ? 'Técnico' : 'Vendedor';
  if (wrapEl)   wrapEl.classList.replace('hidden', 'flex');

  if (state.isAdmin) hydrateAdminPreferences();

  // Botão de alternância de visão (somente admin)
  const existingToggle = document.getElementById('admin-view-toggle-btn');
  if (existingToggle) existingToggle.remove();
  const existingGestorToggle = document.getElementById('gestor-view-toggle-btn');
  if (existingGestorToggle) existingGestorToggle.remove();

  let shouldRefreshHeaderIcons = false;

  if (state.isAdmin) {
    const adminBtn = document.getElementById('admin-toggle-btn');
    const btn = document.createElement('button');
    btn.id = 'admin-view-toggle-btn';
    btn.onclick = toggleAdminViewMode;
    btn.title = state.adminViewAll
      ? 'Clique para ver apenas a sua unidade (franquia)'
      : 'Clique para voltar para a visão consolidada de franquias';
    btn.className = state.adminViewAll
      ? 'view-scope-toggle is-consolidated p-3 border transition-all duration-300 bg-purple-600 border-purple-500 text-white hover:bg-purple-700 hover:border-purple-400 flex items-center gap-2 text-[9px] font-black uppercase tracking-widest'
      : 'view-scope-toggle is-unit p-3 border transition-all duration-300 bg-blue-600 border-blue-500 text-white hover:bg-blue-700 hover:border-blue-400 flex items-center gap-2 text-[9px] font-black uppercase tracking-widest';
    btn.innerHTML = state.adminViewAll
      ? '<i data-lucide="layers" class="w-4 h-4"></i><span class="hidden lg:inline">CONSOLIDADO</span>'
      : '<i data-lucide="building-2" class="w-4 h-4"></i><span class="hidden lg:inline">MINHA UNIDADE</span>';
    if (adminBtn && adminBtn.parentNode) {
      adminBtn.parentNode.insertBefore(btn, adminBtn);
    }
    shouldRefreshHeaderIcons = true;
  }

  if (state.isGestor) {
    const adminBtn = document.getElementById('admin-toggle-btn');
    const btn = document.createElement('button');
    btn.id = 'gestor-view-toggle-btn';
    btn.onclick = toggleGestorViewMode;
    btn.title = state.gestorViewAll ? 'Clique para ver só os seus clientes' : 'Clique para ver toda a unidade';
    btn.className = state.gestorViewAll
      ? 'view-scope-toggle is-gestor-all p-3 border transition-all duration-300 bg-blue-600 border-blue-500 text-white hover:bg-blue-700 hover:border-blue-400 flex items-center gap-2 text-[9px] font-black uppercase tracking-widest'
      : 'view-scope-toggle is-gestor-own p-3 border transition-all duration-300 bg-blue-600 border-blue-500 text-white hover:bg-blue-700 hover:border-blue-400 flex items-center gap-2 text-[9px] font-black uppercase tracking-widest';
    btn.innerHTML = state.gestorViewAll
      ? '<i data-lucide="users" class="w-4 h-4"></i><span class="hidden lg:inline">MINHA UNIDADE</span>'
      : '<i data-lucide="user" class="w-4 h-4"></i><span class="hidden lg:inline">APENAS MEUS</span>';
    if (adminBtn && adminBtn.parentNode) {
      adminBtn.parentNode.insertBefore(btn, adminBtn);
    }
    shouldRefreshHeaderIcons = true;
  }

  if (shouldRefreshHeaderIcons) queueAppLucideCreateIcons();
}

async function toggleAdminViewMode() {
  state.adminViewAll = !state.adminViewAll;
  if (!state.adminViewAll) {
    state.adminScopeFranquiaId = 'all';
  }
  persistAdminPreferences();
  showToast(state.adminViewAll ? 'VISÃO: TODAS AS FRANQUIAS' : 'VISÃO: MINHA UNIDADE');
  await Promise.all([fetchClientes(), fetchPropostas(), fetchVendas()]);
  renderHeaderUser();
  renderContent();
}

function setAdminScopeFranquia(scopeId) {
  state.adminScopeFranquiaId = String(scopeId || 'all');
  persistAdminPreferences();
  renderContent();
}

async function toggleGestorViewMode() {
  state.gestorViewAll = !state.gestorViewAll;
  showToast(state.gestorViewAll ? 'VISÃO: MINHA UNIDADE' : 'VISÃO: APENAS MEUS CLIENTES');
  await Promise.all([fetchClientes(), fetchPropostas(), fetchVendas()]);
  renderHeaderUser();
  renderContent();
}

function initSplash() {
  return new Promise(resolve => {
    const MESSAGES = [
      'Sincronizando Banco de Dados...',
      'Carregando Catálogo de Kits...',
      'Validando Credenciais...',
      'Preparando Dashboard...',
    ];
    let progress = 0;
    let msgIdx   = 0;
    const percentageEl = document.getElementById('loading-percentage');
    const barEl        = document.getElementById('loading-bar');
    const msgEl        = document.querySelector('#splash-screen .animate-pulse');

    const interval = setInterval(() => {
      progress += Math.floor(Math.random() * 12) + 4;
      if (progress > 100) progress = 100;
      percentageEl.innerText = `${progress}%`;
      barEl.style.width      = `${progress}%`;

      if (progress > 25 && msgIdx === 0) { msgIdx = 1; if (msgEl) msgEl.textContent = MESSAGES[1]; }
      if (progress > 55 && msgIdx === 1) { msgIdx = 2; if (msgEl) msgEl.textContent = MESSAGES[2]; }
      if (progress > 80 && msgIdx === 2) { msgIdx = 3; if (msgEl) msgEl.textContent = MESSAGES[3]; }

      if (progress === 100) {
        clearInterval(interval);
        setTimeout(() => {
          document.getElementById('splash-screen').classList.add('opacity-0', 'pointer-events-none');
          document.getElementById('splash-content').classList.add('scale-110');
          document.getElementById('app-content').classList.remove('opacity-0', 'scale-95', 'hidden');
          document.getElementById('app-content').classList.add('opacity-100', 'scale-100');
          resolve(); // dados já estarão prontos quando isso for chamado
        }, 500);
        setTimeout(() => document.getElementById('splash-screen').classList.add('hidden'), 2000);
      }
    }, 95);
  });
}

async function refreshData() {
  const icon = document.getElementById('refresh-data-icon');
  if (icon) icon.classList.add('animate-spin');
  await Promise.all([
    fetchFranquiasCatalog(),
    fetchClientes(),
    fetchPropostas(),
    fetchVendas(),
    fetchProducts(),
    fetchComponentes(),
    fetchComunicados(),
    updateVendedorStats(state.currentUser?.email),
  ]);
  if (icon) icon.classList.remove('animate-spin');
  renderContent();
  showToast('Dados atualizados.');
}

// Abas do O&M visíveis para um vendedor com acesso (sem OS/Pendências/Relatórios/Técnicos).
const OM_TABS_VENDEDOR = ['propostas', 'central', 'clientes'];

function getActiveTabsForEnvironment() {
  // Técnico: vive no O&M e enxerga todas as abas (os dados são escopados a ele no backend).
  if (state.isTecnico) return OM_TABS;
  if (state.environment === 'financeiro' && state.canFin) return FIN_TABS;
  if (state.environment === 'om' && state.canOM) {
    // Admin/Gestor/Coordenador veem o O&M completo; vendedor O&M só Propostas, Central e Clientes.
    if (state.isAdmin || state.isGestor || state.isCoordenador) return OM_TABS;
    return OM_TABS.filter(t => OM_TABS_VENDEDOR.includes(t.id));
  }
  // O Admin não é mais uma aba do Comercial — virou destino global (overlay),
  // acessível pela engrenagem em qualquer vertente. Ver openAdmin().
  return TABS;
}

function getActiveTabId() {
  if (state.environment === 'om') return state.omActiveTab;
  if (state.environment === 'financeiro') return state.finActiveTab;
  return state.activeTab;
}

// Lê no backend se o usuário corrente pode ver o ambiente O&M.
// Admin sempre pode; técnico vive no O&M (aba OS); demais dependem de om_enabled.
async function omRefreshAccess() {
  if (state.isAdmin || state.isTecnico) { state.canOM = true; return; }
  try {
    const { data, error } = await supabaseClient.rpc('om_can_use_current_user');
    state.canOM = !error && data === true;
  } catch (_) {
    state.canOM = false;
  }
}

// Lê no backend se o usuário corrente pode ver o ambiente Financeiro.
// Admin sempre pode; demais dependem da flag fin_enabled. (Espelha omRefreshAccess.)
async function finRefreshAccess() {
  if (state.isAdmin) { state.canFin = true; return; }
  try {
    const { data, error } = await supabaseClient.rpc('fin_can_use_current_user');
    state.canFin = !error && data === true;
  } catch (_) {
    state.canFin = false;
  }
}

function renderEnvSwitcher() {
  const desktop = document.getElementById('env-switcher');
  const section = document.getElementById('menu-section');

  // Técnico não troca de ambiente — esconde o seletor por completo.
  if (state.isTecnico) {
    if (desktop) desktop.style.display = 'none';
    if (section) section.style.display = 'none';
    return;
  }
  // Sem acesso a NENHUM ambiente extra: esconde o seletor e mantém só o Comercial.
  if (!state.canOM && !state.canFin) {
    if (state.environment !== 'comercial') state.environment = 'comercial';
    if (desktop) desktop.style.display = 'none';
    if (section) section.style.display = 'none';
    return;
  }
  // Não-técnico com acesso: a visibilidade fica por conta das classes responsivas.
  if (desktop) desktop.style.display = '';
  if (section) section.style.display = '';

  const setDisplay = (id, visible) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('hidden', !visible);
  };
  setDisplay('env-btn-om', Boolean(state.canOM));
  setDisplay('env-btn-om-mobile', Boolean(state.canOM));
  setDisplay('env-btn-financeiro', Boolean(state.canFin));
  setDisplay('env-btn-financeiro-mobile', Boolean(state.canFin));

  const activate = (idSuffix, isOn, env) => {
    const btn = document.getElementById(idSuffix);
    if (!btn) return;
    // setDisplay() já decidiu a visibilidade (acesso) acima; preservar esse estado
    // ao reescrever o className, senão o botão volta a aparecer mesmo sem acesso.
    const wasHidden = btn.classList.contains('hidden');
    const base = 'env-btn flex items-center gap-1.5 px-3 py-2 text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap';
    const baseMobile = 'env-btn-mobile flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-[10px] font-black uppercase tracking-wider transition-all';
    const root = idSuffix.endsWith('-mobile') ? baseMobile : base;
    if (isOn) {
      const tone = env === 'om'
        ? 'om-nav-grad om-nav-shadow'
        : env === 'financeiro'
          ? 'fin-nav-grad fin-nav-shadow'
          : 'bg-gradient-to-r from-orange-600 to-yellow-500 text-black shadow-[0_0_12px_rgba(234,88,12,0.3)]';
      btn.className = `${root} ${tone}`;
    } else {
      btn.className = `${root} text-neutral-500 hover:text-neutral-200 bg-transparent`;
    }
    if (wasHidden) btn.classList.add('hidden');
  };

  const env = state.environment;
  activate('env-btn-comercial',          env === 'comercial',  'comercial');
  activate('env-btn-om',                  env === 'om',         'om');
  activate('env-btn-financeiro',          env === 'financeiro', 'financeiro');
  activate('env-btn-comercial-mobile',    env === 'comercial',  'comercial');
  activate('env-btn-om-mobile',           env === 'om',         'om');
  activate('env-btn-financeiro-mobile',   env === 'financeiro', 'financeiro');
}

function renderTabs() {
  const container = document.getElementById('tab-container');
  const mobileNav = document.getElementById('mobile-menu-tabs');

  renderEnvSwitcher();

  const tabs = getActiveTabsForEnvironment();
  const activeId = getActiveTabId();
  const isOm  = state.environment === 'om';
  const isFin = state.environment === 'financeiro';
  // Ambientes com sub-nav (segunda linha de abas no desktop): O&M e Financeiro.
  const isSubnavEnv = isOm || isFin;

  const navGrad = isFin ? 'fin-nav-grad fin-nav-shadow' : 'om-nav-grad om-nav-shadow';
  const activeBg = isSubnavEnv
    ? navGrad
    : 'text-black bg-gradient-to-r from-orange-600 to-yellow-500 shadow-[0_0_12px_rgba(234,88,12,0.3)]';
  const activeBgMobile = isSubnavEnv
    ? `${isFin ? 'fin-nav-grad' : 'om-nav-grad'} shadow-[inset_0_0_20px_rgba(0,0,0,0.15)]`
    : 'bg-gradient-to-r from-orange-600 to-yellow-500 text-black shadow-[inset_0_0_20px_rgba(0,0,0,0.15)]';
  const hoverBorder = isFin ? 'fin-hover-border' : isOm ? 'om-hover-border' : 'hover:border-orange-500/40';

  const primaryTabs   = tabs.filter(t => !t.secondary);
  const secondaryTabs = tabs.filter(t =>  t.secondary);
  const hasSecondaryActive = secondaryTabs.some(t => t.id === activeId);

  const buildBtn = (tab) => {
    const isActive = activeId === tab.id;
    return `
      <button onclick="setTab('${tab.id}')"
        class="app-tab-btn ${isActive ? 'is-active' : ''} relative flex items-center gap-2 px-5 py-2.5 text-[10px] font-black uppercase tracking-wider transition-all duration-200 whitespace-nowrap
          ${isActive ? activeBg : 'text-neutral-500 hover:text-neutral-300 bg-transparent'}">
        <i data-lucide="${tab.icon}" class="w-3.5 h-3.5 ${isActive ? 'stroke-[3px]' : ''}"></i>
        ${tab.label}
      </button>
    `;
  };

  const subnav = document.getElementById('om-subnav');

  if (isSubnavEnv) {
    // O&M e Financeiro: as rotas viram uma SEGUNDA LINHA (sub-nav) no desktop; o
    // topo fica só com o switcher de ambiente. Sem dropdown "MAIS".
    container.innerHTML = '';
    const moreMenu = document.getElementById('om-more-menu');
    if (moreMenu) moreMenu.remove();
    if (subnav) {
      subnav.className = 'border-t border-neutral-800/60 bg-black/95 hidden lg:block';
      subnav.innerHTML = `
        <div class="max-w-7xl mx-auto px-4">
          <nav class="flex items-center gap-1 overflow-x-auto no-scrollbar">
            ${tabs.map(tab => {
              const isActive = activeId === tab.id;
              return `
                <button onclick="setTab('${tab.id}')"
                  class="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest transition-all
                    ${isActive ? activeBg : 'text-neutral-400 hover:text-white hover:bg-neutral-900/70'}">
                  <i data-lucide="${tab.icon}" class="w-3.5 h-3.5 ${isActive ? 'stroke-[3px]' : ''}"></i>${tab.label}
                </button>`;
            }).join('')}
          </nav>
        </div>`;
    }
  } else {
    // Comercial: abas no topo (com "MAIS" para secundárias, se houver).
    let desktopHTML = primaryTabs.map(buildBtn).join('');
    if (secondaryTabs.length) {
      const moreActiveCls = hasSecondaryActive ? activeBg : 'text-neutral-500 hover:text-neutral-300 bg-transparent';
      desktopHTML += `
        <button id="om-more-btn" onclick="toggleOmMoreMenu(event)"
          class="app-tab-btn ${hasSecondaryActive ? 'is-active' : ''} relative flex items-center gap-2 px-5 py-2.5 text-[10px] font-black uppercase tracking-wider transition-all duration-200 whitespace-nowrap ${moreActiveCls}">
          <i data-lucide="more-horizontal" class="w-3.5 h-3.5 ${hasSecondaryActive ? 'stroke-[3px]' : ''}"></i>
          MAIS
          <i data-lucide="chevron-down" class="w-3 h-3 -ml-0.5"></i>
        </button>
      `;
    }
    container.innerHTML = desktopHTML;
    renderOmMoreMenu(secondaryTabs, activeId, isOm);
    if (subnav) { subnav.className = 'hidden'; subnav.innerHTML = ''; }
  }

  if (mobileNav) {
    mobileNav.innerHTML = tabs.map(tab => {
      const isActive = activeId === tab.id;
      return `
        <button onclick="setTab('${tab.id}')"
          class="app-tab-mobile-btn ${isActive ? 'is-active' : ''} flex items-center gap-3 w-full px-4 py-4 text-sm font-black uppercase tracking-widest transition-all duration-200
            ${isActive ? activeBgMobile : `text-neutral-400 hover:text-white hover:bg-neutral-900/80 border-l-2 border-transparent ${hoverBorder}`}">
          <i data-lucide="${tab.icon}" class="w-5 h-5 ${isActive ? 'stroke-[3px]' : ''}"></i>
          <span class="flex-1 text-left">${tab.label}</span>
          ${isActive ? '<i data-lucide="chevron-right" class="w-4 h-4"></i>' : ''}
        </button>
      `;
    }).join('');
  }

  queueAppLucideCreateIcons();
}

function renderOmMoreMenu(secondaryTabs, activeId, isOm) {
  let menu = document.getElementById('om-more-menu');
  if (!secondaryTabs.length) {
    if (menu) menu.remove();
    return;
  }
  if (!menu) {
    menu = document.createElement('div');
    menu.id = 'om-more-menu';
    menu.className = 'hidden fixed z-[60] min-w-[200px] bg-black/98 backdrop-blur-xl border border-neutral-800/80 shadow-[0_8px_32px_rgba(0,0,0,0.6)] p-1';
    document.body.appendChild(menu);
  }
  const activeBg = isOm
    ? 'text-black bg-gradient-to-r from-blue-600 to-blue-400'
    : 'text-black bg-gradient-to-r from-orange-600 to-yellow-500';
  menu.innerHTML = secondaryTabs.map(tab => {
    const isActive = activeId === tab.id;
    return `
      <button onclick="setTab('${tab.id}'); closeOmMoreMenu();"
        class="flex items-center gap-2.5 w-full px-3 py-2.5 text-[10px] font-black uppercase tracking-wider transition-all
          ${isActive ? activeBg : 'text-neutral-400 hover:text-white hover:bg-neutral-900/80'}">
        <i data-lucide="${tab.icon}" class="w-3.5 h-3.5 ${isActive ? 'stroke-[3px]' : ''}"></i>
        <span class="flex-1 text-left">${tab.label}</span>
      </button>
    `;
  }).join('');
}

function toggleOmMoreMenu(ev) {
  if (ev) ev.stopPropagation();
  const menu = document.getElementById('om-more-menu');
  const btn  = document.getElementById('om-more-btn');
  if (!menu || !btn) return;
  if (menu.classList.contains('hidden')) {
    const rect = btn.getBoundingClientRect();
    menu.style.top  = (rect.bottom + 6) + 'px';
    menu.style.left = Math.max(8, rect.right - 200) + 'px';
    menu.classList.remove('hidden');
    queueAppLucideCreateIcons();
    setTimeout(() => {
      document.addEventListener('click', closeOmMoreMenuOnOutside, { once: true });
    }, 0);
  } else {
    closeOmMoreMenu();
  }
}

function closeOmMoreMenu() {
  const menu = document.getElementById('om-more-menu');
  if (menu) menu.classList.add('hidden');
}

function closeOmMoreMenuOnOutside(ev) {
  const menu = document.getElementById('om-more-menu');
  const btn  = document.getElementById('om-more-btn');
  if (!menu) return;
  if (menu.contains(ev.target) || (btn && btn.contains(ev.target))) {
    document.addEventListener('click', closeOmMoreMenuOnOutside, { once: true });
    return;
  }
  closeOmMoreMenu();
}

function setEnvironment(env) {
  if (state.isTecnico) return; // técnico não troca de ambiente
  if (env !== 'comercial' && env !== 'om' && env !== 'financeiro') return;
  if (env === 'om' && !state.canOM) return; // sem acesso ao O&M
  if (env === 'financeiro' && !state.canFin) return; // sem acesso ao Financeiro
  if (state.environment === env) return;

  // Não fecha o menu: ao trocar de seção, o usuário vê as abas da nova seção.
  if (typeof chatHandleAppTabChange === 'function') chatHandleAppTabChange();
  stopDashboardClock();

  state.environment = env;
  renderTabs();
  renderContent();
}

// ==========================================
// LAUNCHER — tela inicial de escolha de ambiente
// ==========================================

// O launcher só aparece quando há escolha real (2+ ambientes). Hoje isso equivale
function launcherShouldShow() {
  if (state.isTecnico) return false;
  return !!state.canOM || !!state.canFin;
}

function showLauncher() {
  const screen = document.getElementById('launcher-screen');
  if (!screen) return;

  const displayName = (state.profile?.nome) || (typeof getFirstName === 'function' ? getFirstName() : '') || '';
  const email       = state.currentUser ? state.currentUser.email : '';
  const initial     = (displayName || email).charAt(0).toUpperCase();
  const roleLabel   = state.isAdmin ? 'Administrador' : state.isGestor ? 'Gestor' : state.isTecnico ? 'Técnico' : 'Vendedor';

  const nameEl = document.getElementById('launcher-user-name');
  const roleEl = document.getElementById('launcher-user-role');
  if (nameEl) nameEl.textContent = displayName;
  if (roleEl) roleEl.textContent = roleLabel;

  // Avatar: foto se houver, senão a inicial — mesma lógica de renderHeaderUser().
  const rawAvatarUrl = state.profile?.avatar_url || '';
  const avatarUrl    = rawAvatarUrl && typeof safeImageUrl === 'function'
    ? safeImageUrl(rawAvatarUrl, 'assets/img/logo-light.png') : '';
  const avatarEl = document.getElementById('launcher-user-avatar');
  if (avatarEl) {
    if (avatarUrl) {
      avatarEl.innerHTML = `<img src="${avatarUrl}" alt="avatar" class="w-full h-full object-cover rounded-full" onerror="this.src='assets/img/logo-light.png';this.onerror=null;">`;
    } else {
      avatarEl.textContent = initial;
    }
  }

  // O&M só é oferecido a quem tem acesso (robustez p/ futuro).
  const omCard = document.getElementById('launcher-card-om');
  if (omCard) omCard.classList.toggle('hidden', !state.canOM);

  // Financeiro idem — só aparece pra quem tem acesso (admin/flag).
  const finCard = document.getElementById('launcher-card-financeiro');
  if (finCard) finCard.classList.toggle('hidden', !state.canFin);

  screen.classList.remove('hidden');
  // força reflow antes de animar a opacidade
  void screen.offsetWidth;
  screen.classList.remove('opacity-0');
  if (typeof queueAppLucideCreateIcons === 'function') queueAppLucideCreateIcons();
  else if (window.lucide) lucide.createIcons();

  startLauncherTypewriter();
}

// Efeito "typewriter" na pergunta do hero: digita, segura pra leitura, apaga e troca.
// Respeita prefers-reduced-motion (mostra a 1ª frase parada).
let _launcherTwStarted = false;
function startLauncherTypewriter() {
  const el = document.getElementById('launcher-tw');
  if (!el || _launcherTwStarted) return;
  _launcherTwStarted = true;

  const FRASES = [
    'Para onde você quer ir?',
    'Por onde vamos começar?',
    'Onde você vai trabalhar hoje?',
    'Qual ambiente quer abrir?',
    'O que vamos resolver agora?',
  ];

  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) { el.textContent = FRASES[0]; return; }

  const typeSpeed = 55;    // ms por letra ao escrever
  const delSpeed  = 28;    // ms por letra ao apagar
  const holdFull  = 3200;  // pausa com a frase escrita (tempo de leitura)
  const holdEmpty = 450;   // pausa antes da próxima frase

  let i = 0, pos = 0, apagando = false;
  el.textContent = '';
  (function tick() {
    const txt = FRASES[i];
    if (!apagando) {
      pos++;
      el.textContent = txt.slice(0, pos);
      if (pos === txt.length) { apagando = true; return setTimeout(tick, holdFull); }
      return setTimeout(tick, typeSpeed);
    } else {
      pos--;
      el.textContent = txt.slice(0, pos);
      if (pos === 0) { apagando = false; i = (i + 1) % FRASES.length; return setTimeout(tick, holdEmpty); }
      return setTimeout(tick, delSpeed);
    }
  })();
}

// Disparado pelo clique nos cards. NÃO usa setEnvironment (que aborta quando o
// ambiente já é o atual — caso do Comercial, que é o default).
function enterEnvironment(env) {
  if (env !== 'comercial' && env !== 'om' && env !== 'financeiro') return;
  if (env === 'om' && !state.canOM) return;
  if (env === 'financeiro' && !state.canFin) return;

  const screen = document.getElementById('launcher-screen');
  if (screen) {
    screen.classList.add('opacity-0', 'pointer-events-none');
    setTimeout(() => screen.classList.add('hidden'), 500);
  }

  state.environment = env;
  if (env === 'om') state.omActiveTab = 'central';
  if (env === 'financeiro') state.finActiveTab = 'visao';
  renderTabs();
  renderContent();
}

function setTab(tabId) {
  if (state.isTecnico && tabId !== 'os') return; // técnico só acessa a aba OS

  // Admin é destino global (overlay), não uma aba de ambiente. Qualquer chamada
  // remanescente a setTab('admin') é redirecionada para o overlay.
  if (tabId === 'admin') { closeMobileMenu(); openAdmin(); return; }

  if (state.environment === 'om') {
    closeMobileMenu();
    if (typeof chatHandleAppTabChange === 'function') chatHandleAppTabChange();
    stopDashboardClock();
    state.omActiveTab = tabId;
    renderTabs();
    renderContent();
    return;
  }

  if (state.environment === 'financeiro') {
    closeMobileMenu();
    if (typeof chatHandleAppTabChange === 'function') chatHandleAppTabChange();
    stopDashboardClock();
    // Abas reagrupadas: um id de subárea (ex.: 'dre','orcamentos') é resolvido
    // para a aba-pai (ex.: 'margem','compras') e a sub-aba certa fica memorizada.
    state.finActiveTab = (typeof finResolveTab === 'function') ? finResolveTab(tabId) : tabId;
    renderTabs();
    renderContent();
    return;
  }

  closeMobileMenu();
  if (typeof chatHandleAppTabChange === 'function') chatHandleAppTabChange();
  stopDashboardClock();
  state.activeTab = tabId;
  renderTabs();
  renderContent();
}

// =======================================================================
// ADMIN GLOBAL (overlay transversal) — Etapa 1: fluxo de estado.
// O painel admin deixa de ser filho do Comercial e passa a ser um destino
// acessível pela engrenagem de qualquer vertente. Aqui só preparamos o
// estado abrir/fechar guardando a origem; o overlay/render vem na Etapa 2.
// (Ainda não ligado à engrenagem — funções dormentes, sem efeito visual.)
// =======================================================================
function openAdmin() {
  if (!userCanAccessAdminPanel()) { showToast('Acesso restrito.'); return; }
  if (state.adminOpen) return;
  // Overlay transversal: NÃO mexemos na vertente de baixo. Guardamos a origem
  // apenas para referência/estado visual; "voltar de onde veio" é automático,
  // porque o conteúdo da vertente permanece intacto atrás do overlay.
  state.returnEnvironment = state.environment;
  state.returnTab = state.environment === 'om' ? state.omActiveTab : state.activeTab;
  state.adminOpen = true;
  renderAdminOverlay();
}

function closeAdmin() {
  if (!state.adminOpen) return;
  state.adminOpen = false;
  state.returnEnvironment = null;
  state.returnTab = null;
  renderAdminOverlay();
}

// Classes da engrenagem (#admin-toggle-btn): aparência padrão x ativa (overlay aberto).
const ADMIN_GEAR_CLS_DEFAULT = 'p-2.5 border transition-all duration-300 bg-black border-neutral-800 text-neutral-500 hover:text-white hover:border-neutral-600 shrink-0';
const ADMIN_GEAR_CLS_ACTIVE  = 'p-2.5 border transition-all duration-300 bg-red-600 border-red-500 text-white shrink-0';

// Fecha o overlay com a tecla ESC.
function _adminEscHandler(ev) {
  if (ev.key === 'Escape' && state.adminOpen) closeAdmin();
}

// Mostra/esconde o overlay admin e renderiza o painel no container próprio.
// Não toca no #main-container — a vertente de baixo fica preservada.
function renderAdminOverlay() {
  const overlay = document.getElementById('admin-overlay');
  if (!overlay) return;
  const gear = document.getElementById('admin-toggle-btn');
  if (state.adminOpen) {
    overlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden'; // trava scroll do fundo
    if (gear) gear.className = ADMIN_GEAR_CLS_ACTIVE; // engrenagem em destaque
    // Label do botão de fechar indica para onde volta.
    const lbl = document.getElementById('admin-close-label');
    if (lbl) lbl.textContent = state.returnEnvironment === 'om'
      ? 'Voltar ao O&M'
      : 'Voltar ao Comercial';
    document.addEventListener('keydown', _adminEscHandler);
    const content = document.getElementById('admin-overlay-content');
    if (content && typeof renderAdminPanel === 'function') renderAdminPanel(content);
  } else {
    overlay.classList.add('hidden');
    overlay.scrollTop = 0;
    document.body.style.overflow = '';
    if (gear) gear.className = ADMIN_GEAR_CLS_DEFAULT; // restaura aparência
    document.removeEventListener('keydown', _adminEscHandler);
  }
  queueAppLucideCreateIcons();
}

function setViewMode(mode) {
  state.viewMode = mode;
  document.getElementById('btn-grid').className = mode === 'grid'
    ? 'p-3 transition-all bg-gradient-to-r from-orange-600 to-yellow-500 text-black'
    : 'p-3 transition-all text-neutral-600 hover:text-white';
  document.getElementById('btn-list').className = mode === 'list'
    ? 'p-3 transition-all bg-gradient-to-r from-orange-600 to-yellow-500 text-black'
    : 'p-3 transition-all text-neutral-600 hover:text-white';
  renderContent();
}

function syncSearchToolbarForActiveTab() {
  const searchInput = document.getElementById('search-input');
  if (!searchInput) return;

  if (state.activeTab === 'clientes' && state.isAdmin) {
    searchInput.value = String(state.adminClientesFilters?.search || '');
    searchInput.placeholder = 'BUSCAR CLIENTE, CIDADE, TELEFONE OU VENDEDOR...';
    return;
  }

  searchInput.value = String(state.searchTerm || '');
  searchInput.placeholder = 'BUSCAR CLIENTE...';
}

function renderContent() {
  const container       = document.getElementById('main-container');
  const toggleContainer = document.getElementById('view-toggle-container');
  const adminBar        = document.getElementById('admin-bar');
  const mainToolbar     = document.getElementById('main-toolbar');
  const emptyState      = document.getElementById('empty-state');

  emptyState.classList.add('hidden');

  // Ambiente O&M: delega para o módulo om.js
  if (state.environment === 'om') {
    stopDashboardClock();
    mainToolbar.classList.add('hidden');
    toggleContainer.classList.add('hidden');
    if (adminBar) adminBar.classList.add('hidden');
    if (typeof renderOMRoute === 'function') {
      renderOMRoute(container, state.omActiveTab);
    } else {
      container.innerHTML = '<div class="text-neutral-500 font-bold p-8">Módulo O&M não carregado.</div>';
    }
    queueAppLucideCreateIcons();
    return;
  }

  // Ambiente Financeiro: delega para o módulo financeiro.js
  if (state.environment === 'financeiro') {
    stopDashboardClock();
    if (typeof stopOmClock === 'function') stopOmClock();
    mainToolbar.classList.add('hidden');
    toggleContainer.classList.add('hidden');
    if (adminBar) adminBar.classList.add('hidden');
    if (typeof renderFinRoute === 'function') {
      renderFinRoute(container, state.finActiveTab);
    } else {
      container.innerHTML = '<div class="text-neutral-500 font-bold p-8">Módulo Financeiro não carregado.</div>';
    }
    queueAppLucideCreateIcons();
    return;
  }

  // Saindo do O&M: para clock interno do módulo
  if (typeof stopOmClock === 'function') stopOmClock();

  if (state.activeTab === 'dashboard') {
    mainToolbar.classList.add('hidden');
    toggleContainer.classList.add('hidden');
    if (adminBar) adminBar.classList.add('hidden');
    renderDashboard(container);
  } else if (state.activeTab === 'clientes') {
    stopDashboardClock();
    if (state.isAdmin) {
      mainToolbar.classList.add('hidden');
    } else {
      mainToolbar.classList.remove('hidden');
    }
    toggleContainer.classList.add('hidden');
    if (adminBar) adminBar.classList.add('hidden');
    renderClientesList(container);
  } else if (state.activeTab === 'vendas') {
    stopDashboardClock();
    mainToolbar.classList.add('hidden');
    toggleContainer.classList.add('hidden');
    if (adminBar) adminBar.classList.add('hidden');
    renderVendas(container);
  } else {
    stopDashboardClock();
    if (!state.isEditMode) {
      mainToolbar.classList.add('hidden');
    } else {
      mainToolbar.classList.remove('hidden');
      toggleContainer.classList.remove('hidden');
      if (adminBar) adminBar.classList.remove('hidden');
    }
    renderProductsList(container);
  }
  syncSearchToolbarForActiveTab();
  queueAppLucideCreateIcons();
}

// --- Event Listeners Globais ---
const _onSearchInput = debounce((value) => {
  if (state.isAdmin && state.activeTab === 'clientes') {
    state.adminClientesFilters.search = String(value || '');
    persistAdminPreferences();
    renderContent();
    return;
  }

  state.searchTerm = String(value || '');
  renderContent();
}, 180);

document.getElementById('search-input').addEventListener('input', (e) => {
  _onSearchInput(e.target.value);
});

document.getElementById('client-telefone').addEventListener('input', formatarTelefone);

// --- Inicialização ---
queueAppLucideCreateIcons();
if (typeof initAnalytics === 'function') {
  initAnalytics({ mode: 'internal' });
}
checkAuth();



