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
  if (roleEl)   roleEl.textContent = state.isAdmin ? 'Administrador' : state.isGestor ? 'Gestor' : 'Vendedor';
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
      ? '<i data-lucide="layers" class="w-4 h-4"></i><span class="hidden sm:inline">CONSOLIDADO</span>'
      : '<i data-lucide="building-2" class="w-4 h-4"></i><span class="hidden sm:inline">MINHA UNIDADE</span>';
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
      ? '<i data-lucide="users" class="w-4 h-4"></i><span class="hidden sm:inline">MINHA UNIDADE</span>'
      : '<i data-lucide="user" class="w-4 h-4"></i><span class="hidden sm:inline">APENAS MEUS</span>';
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

function renderTabs() {
  const container = document.getElementById('tab-container');
  const mobileNav = document.getElementById('mobile-menu-tabs');

  const tabs = state.isAdmin
    ? [...TABS, { id: 'admin', label: 'ADMIN', icon: 'settings' }]
    : TABS;

  const desktopHTML = tabs.map(tab => {
    const isActive = state.activeTab === tab.id;
    return `
      <button onclick="setTab('${tab.id}')"
        class="app-tab-btn ${isActive ? 'is-active' : ''} relative flex items-center gap-2 px-5 py-2.5 text-[10px] font-black uppercase tracking-wider transition-all duration-200 whitespace-nowrap
          ${isActive
            ? 'text-black bg-gradient-to-r from-orange-600 to-yellow-500 shadow-[0_0_12px_rgba(234,88,12,0.3)]'
            : 'text-neutral-500 hover:text-neutral-300 bg-transparent'
          }">
        <i data-lucide="${tab.icon}" class="w-3.5 h-3.5 ${isActive ? 'stroke-[3px]' : ''}"></i>
        ${tab.label}
      </button>
    `;
  }).join('');

  container.innerHTML = desktopHTML;

  if (mobileNav) {
    mobileNav.innerHTML = tabs.map(tab => {
      const isActive = state.activeTab === tab.id;
      return `
        <button onclick="setTab('${tab.id}')"
          class="app-tab-mobile-btn ${isActive ? 'is-active' : ''} flex items-center gap-3 w-full px-4 py-4 text-sm font-black uppercase tracking-widest transition-all duration-200
            ${isActive
              ? 'bg-gradient-to-r from-orange-600 to-yellow-500 text-black shadow-[inset_0_0_20px_rgba(0,0,0,0.15)]'
              : 'text-neutral-400 hover:text-white hover:bg-neutral-900/80 border-l-2 border-transparent hover:border-orange-500/40'
            }">
          <i data-lucide="${tab.icon}" class="w-5 h-5 ${isActive ? 'stroke-[3px]' : ''}"></i>
          <span class="flex-1 text-left">${tab.label}</span>
          ${isActive ? '<i data-lucide="chevron-right" class="w-4 h-4"></i>' : ''}
        </button>
      `;
    }).join('');
  }

  queueAppLucideCreateIcons();
}

function setTab(tabId) {
  if (tabId === 'admin' && !userCanAccessAdminPanel()) {
    showToast('Acesso restrito.');
    return;
  }

  closeMobileMenu();
  if (typeof chatHandleAppTabChange === 'function') chatHandleAppTabChange();
  stopDashboardClock();
  state.activeTab = tabId;
  renderTabs();
  renderContent();
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
  } else if (state.activeTab === 'admin') {
    stopDashboardClock();
    mainToolbar.classList.add('hidden');
    toggleContainer.classList.add('hidden');
    if (adminBar) adminBar.classList.add('hidden');

    if (!userCanAccessAdminPanel()) {
      state.activeTab = 'dashboard';
      renderTabs();
      renderDashboard(container);
      syncSearchToolbarForActiveTab();
      queueAppLucideCreateIcons();
      showToast('Acesso restrito.');
      return;
    }

    state.isEditMode = true;
    renderAdminPanel(container);
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
checkAuth();







