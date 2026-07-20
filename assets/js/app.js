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
    fetchCrmMetas(),
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
  if (state.environment === 'engenharia' && state.canEng) return ENG_TABS;
  if (state.environment === 'vistoria' && state.canVis) return VISTORIA_TABS;
  if (state.environment === 'financeiro' && state.canFin) return FIN_TABS;
  if (state.environment === 'om' && state.canOM) {
    // Admin/Gestor/Coordenador veem o O&M completo; vendedor O&M só Propostas, Central e Clientes.
    if (state.isAdmin || state.isGestor || state.isCoordenador) return OM_TABS;
    return OM_TABS.filter(t => OM_TABS_VENDEDOR.includes(t.id));
  }
  // O Admin não é mais uma aba do Comercial — virou destino global (overlay),
  // acessível pela engrenagem em qualquer vertente. Ver openAdmin().
  // Produtos (kits/preços) é gestão de catálogo e Análise é leitura do time
  // inteiro — só admin/gestor; para o vendedor a aba só mostraria "acesso
  // bloqueado", então nem aparece.
  if (state.isAdmin || state.isGestor) return TABS;
  return TABS.filter((t) => !TABS_GESTAO.includes(t.id));
}

function getActiveTabId() {
  if (state.environment === 'om') return state.omActiveTab;
  if (state.environment === 'financeiro') return state.finActiveTab;
  if (state.environment === 'vistoria') return state.vistoriaActiveTab;
  if (state.environment === 'engenharia') return state.engActiveTab;
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

// Lê se o usuário corrente pode ver o ambiente Vistoria.
// Fase atual (sem Supabase): admin sempre pode; demais ficam sem acesso até a
// flag por perfil (vis_enabled) ser criada na fase de banco. (Espelha finRefreshAccess.)
async function visRefreshAccess() {
  if (state.isAdmin) { state.canVis = true; return; }
  try {
    const { data, error } = await supabaseClient.rpc('vis_can_use_current_user');
    state.canVis = !error && data === true;
  } catch (_) {
    state.canVis = false;
  }
}

// Lê no backend se o usuário corrente pode ver o ambiente Engenharia.
// Admin sempre pode; demais dependem da flag eng_enabled ou da role 'engenheiro'
// (resolvido por eng_can_use_current_user). Espelha finRefreshAccess.
async function engRefreshAccess() {
  if (state.isAdmin) { state.canEng = true; return; }
  try {
    const { data, error } = await supabaseClient.rpc('eng_can_use_current_user');
    state.canEng = !error && data === true;
  } catch (_) {
    state.canEng = false;
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
  if (!state.canOM && !state.canFin && !state.canVis && !state.canEng) {
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
  setDisplay('env-btn-vistoria', Boolean(state.canVis));
  setDisplay('env-btn-vistoria-mobile', Boolean(state.canVis));
  setDisplay('env-btn-engenharia', Boolean(state.canEng));
  setDisplay('env-btn-engenharia-mobile', Boolean(state.canEng));

  const activate = (idSuffix, isOn, env) => {
    const btn = document.getElementById(idSuffix);
    if (!btn) return;
    // setDisplay() já decidiu a visibilidade (acesso) acima; preservar esse estado
    // ao reescrever o className, senão o botão volta a aparecer mesmo sem acesso.
    const wasHidden = btn.classList.contains('hidden');
    const base = 'env-btn flex items-center gap-1.5 px-3 py-2 text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap';
    const baseMobile = 'env-btn-mobile flex items-center justify-center gap-1.5 px-3 py-2.5 text-[10px] font-black uppercase tracking-wider transition-all';
    const root = idSuffix.endsWith('-mobile') ? baseMobile : base;
    if (isOn) {
      const tone = env === 'om'
        ? 'om-nav-grad om-nav-shadow'
        : env === 'financeiro'
          ? 'fin-nav-grad fin-nav-shadow'
          : env === 'vistoria'
            ? 'vis-nav-grad vis-nav-shadow'
            : env === 'engenharia'
              ? 'text-black bg-gradient-to-r from-sky-600 to-indigo-500 shadow-[0_0_12px_rgba(2,132,199,0.3)]'
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
  activate('env-btn-vistoria',            env === 'vistoria',   'vistoria');
  activate('env-btn-engenharia',          env === 'engenharia', 'engenharia');
  activate('env-btn-comercial-mobile',    env === 'comercial',  'comercial');
  activate('env-btn-om-mobile',           env === 'om',         'om');
  activate('env-btn-financeiro-mobile',   env === 'financeiro', 'financeiro');
  activate('env-btn-vistoria-mobile',     env === 'vistoria',   'vistoria');
  activate('env-btn-engenharia-mobile',   env === 'engenharia', 'engenharia');
}

function renderTabs() {
  const container = document.getElementById('tab-container');
  const mobileNav = document.getElementById('mobile-menu-tabs');

  renderEnvSwitcher();

  const tabs = getActiveTabsForEnvironment();
  const activeId = getActiveTabId();
  const isOm  = state.environment === 'om';
  const isFin = state.environment === 'financeiro';
  const isVis = state.environment === 'vistoria';
  const isEng = state.environment === 'engenharia';
  const isComercial = state.environment === 'comercial';
  // Ambientes com sub-nav (segunda linha de abas no desktop): Comercial, O&M, Financeiro, Vistoria e Engenharia.
  const isSubnavEnv = isOm || isFin || isVis || isEng || isComercial;

  // Engenharia usa gradiente azul/índigo inline (sem classe CSS dedicada, p/ não tocar main.css).
  const ENG_NAV_GRAD = 'text-black bg-gradient-to-r from-sky-600 to-indigo-500';
  // Comercial usa o gradiente laranja/amarelo inline (mesmo tom do switcher de ambiente).
  const COM_NAV_GRAD = 'text-black bg-gradient-to-r from-orange-600 to-yellow-500';
  const navGrad = isFin ? 'fin-nav-grad fin-nav-shadow'
    : isVis ? 'vis-nav-grad vis-nav-shadow'
    : isEng ? ENG_NAV_GRAD
    : isComercial ? COM_NAV_GRAD
    : 'om-nav-grad om-nav-shadow';
  const activeBg = isSubnavEnv
    ? navGrad
    : 'text-black bg-gradient-to-r from-orange-600 to-yellow-500 shadow-[0_0_12px_rgba(234,88,12,0.3)]';
  const activeBgMobile = isSubnavEnv
    ? `${isFin ? 'fin-nav-grad' : isVis ? 'vis-nav-grad' : isEng ? ENG_NAV_GRAD : isComercial ? COM_NAV_GRAD : 'om-nav-grad'} shadow-[inset_0_0_20px_rgba(0,0,0,0.15)]`
    : 'bg-gradient-to-r from-orange-600 to-yellow-500 text-black shadow-[inset_0_0_20px_rgba(0,0,0,0.15)]';
  const hoverBorder = isFin ? 'fin-hover-border' : isVis ? 'vis-hover-border' : isEng ? 'hover:border-sky-500/40' : isOm ? 'om-hover-border' : 'hover:border-orange-500/40';

  const primaryTabs   = tabs.filter(t => !t.secondary);
  const secondaryTabs = tabs.filter(t =>  t.secondary);
  const hasSecondaryActive = secondaryTabs.some(t => t.id === activeId);

  // Badge da fila do dia na aba VISÃO GERAL do Comercial: o vendedor precisa ver
  // que tem gente esperando mesmo estando em outra aba.
  const filaCount = (isComercial && typeof buildFilaDoDia === 'function' && state.clientes?.length)
    ? buildFilaDoDia().length
    : 0;
  const tabBadge = (tab) => (
    (isComercial && tab.id === 'dashboard' && filaCount > 0)
      ? `<span class="ml-1 px-1.5 py-0.5 bg-orange-500 text-black text-[8px] font-black leading-none num">${filaCount}</span>`
      : ''
  );

  const buildBtn = (tab) => {
    const isActive = activeId === tab.id;
    return `
      <button onclick="setTab('${tab.id}')"
        class="app-tab-btn ${isActive ? 'is-active' : ''} relative flex items-center gap-2 px-5 py-2.5 text-[10px] font-black uppercase tracking-wider transition-all duration-200 whitespace-nowrap
          ${isActive ? activeBg : 'text-neutral-500 hover:text-neutral-300 bg-transparent'}">
        <i data-lucide="${tab.icon}" class="w-3.5 h-3.5 ${isActive ? 'stroke-[3px]' : ''}"></i>
        ${tab.label}${tabBadge(tab)}
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
                  <i data-lucide="${tab.icon}" class="w-3.5 h-3.5 ${isActive ? 'stroke-[3px]' : ''}"></i>${tab.label}${tabBadge(tab)}
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
          ${tabBadge(tab)}
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
  if (env !== 'comercial' && env !== 'om' && env !== 'financeiro' && env !== 'vistoria' && env !== 'engenharia') return;
  if (env === 'om' && !state.canOM) return; // sem acesso ao O&M
  if (env === 'financeiro' && !state.canFin) return; // sem acesso ao Financeiro
  if (env === 'vistoria' && !state.canVis) return; // sem acesso à Vistoria
  if (env === 'engenharia' && !state.canEng) return; // sem acesso à Engenharia
  if (state.environment === env) return;

  // Não fecha o menu: ao trocar de seção, o usuário vê as abas da nova seção.
  if (typeof chatHandleAppTabChange === 'function') chatHandleAppTabChange();
  stopDashboardClock();

  state.environment = env;
  renderTabs();
  renderContent();
  appRouteSync(true);
}

// ==========================================
// LAUNCHER — tela inicial de escolha de ambiente
// ==========================================

// O launcher só aparece quando há escolha real (2+ ambientes). Hoje isso equivale
function launcherShouldShow() {
  if (state.isTecnico) return false;
  return !!state.canOM || !!state.canFin || !!state.canVis || !!state.canEng;
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

  // Vistoria idem — só aparece pra quem tem acesso (admin/flag).
  const visCard = document.getElementById('launcher-card-vistoria');
  if (visCard) visCard.classList.toggle('hidden', !state.canVis);

  // Engenharia idem — só aparece pra quem tem acesso (admin; flag/role vêm na fase Supabase).
  const engCard = document.getElementById('launcher-card-engenharia');
  if (engCard) engCard.classList.toggle('hidden', !state.canEng);

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
  if (env !== 'comercial' && env !== 'om' && env !== 'financeiro' && env !== 'vistoria' && env !== 'engenharia') return;
  if (env === 'om' && !state.canOM) return;
  if (env === 'financeiro' && !state.canFin) return;
  if (env === 'vistoria' && !state.canVis) return;
  if (env === 'engenharia' && !state.canEng) return;

  const screen = document.getElementById('launcher-screen');
  if (screen) {
    screen.classList.add('opacity-0', 'pointer-events-none');
    setTimeout(() => screen.classList.add('hidden'), 500);
  }

  state.environment = env;
  if (env === 'om') state.omActiveTab = 'central';
  if (env === 'financeiro') state.finActiveTab = 'visao';
  if (env === 'vistoria') state.vistoriaActiveTab = 'visao';
  if (env === 'engenharia') state.engActiveTab = 'visao';
  renderTabs();
  renderContent();
  appRouteSync(false);
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
    appRouteSync(true);
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
    appRouteSync(true);
    return;
  }

  if (state.environment === 'vistoria') {
    closeMobileMenu();
    if (typeof chatHandleAppTabChange === 'function') chatHandleAppTabChange();
    stopDashboardClock();
    state.vistoriaActiveTab = tabId;
    renderTabs();
    renderContent();
    appRouteSync(true);
    return;
  }

  if (state.environment === 'engenharia') {
    closeMobileMenu();
    if (typeof chatHandleAppTabChange === 'function') chatHandleAppTabChange();
    stopDashboardClock();
    state.engActiveTab = tabId;
    renderTabs();
    renderContent();
    appRouteSync(true);
    return;
  }

  closeMobileMenu();
  if (typeof chatHandleAppTabChange === 'function') chatHandleAppTabChange();
  stopDashboardClock();
  state.activeTab = tabId;
  // Entrar em Clientes/Funil recomeça do 1º lote (renderização em lotes).
  if ((tabId === 'clientes' || tabId === 'funil') && typeof resetClientesRenderLimit === 'function') {
    resetClientesRenderLimit();
  }
  renderTabs();
  renderContent();
  appRouteSync(true);
}

// =======================================================================
// ROTEAMENTO POR HASH (mínimo) — auditoria Comercial 07/2026.
// Antes, F5 sempre voltava para Comercial›Visão Geral e o "voltar" do
// navegador saía do app. Agora cada troca de aba grava "#app/<env>/<tab>",
// o boot (auth.js) restaura a rota se for válida e popstate atende o botão
// voltar. Nunca toca no hash do fluxo de recuperação de senha do Supabase
// (type=recovery) — prefixo próprio e guarda por _isPasswordRecovery.
// =======================================================================
const APP_ROUTE_PREFIX = '#app/';
let _appRouteApplying = false;

function appRouteCurrentHash() {
  const tabByEnv = {
    comercial: state.activeTab,
    om: state.omActiveTab,
    financeiro: state.finActiveTab,
    vistoria: state.vistoriaActiveTab,
    engenharia: state.engActiveTab,
  };
  return `${APP_ROUTE_PREFIX}${state.environment}/${tabByEnv[state.environment] || ''}`;
}

function appRouteSync(push) {
  if (_appRouteApplying) return;
  if (typeof _isPasswordRecovery !== 'undefined' && _isPasswordRecovery) return;
  if (!state.currentUser) return;
  const hash = appRouteCurrentHash();
  if (window.location.hash === hash) return;
  try {
    if (push) history.pushState(null, '', hash);
    else history.replaceState(null, '', hash);
  } catch (_) { /* sem history API: segue funcionando, só sem rota */ }
}

// Valida um hash de rota. Devolve {env, tab} ou null (aí vale o boot padrão).
function appRouteParse(rawHash) {
  const raw = String(rawHash || '');
  if (!raw.startsWith(APP_ROUTE_PREFIX)) return null;
  if (state.isTecnico) return null; // técnico tem ambiente/aba fixos

  const [env, tab] = raw.slice(APP_ROUTE_PREFIX.length).split('/');

  const tabsByEnv = {
    comercial: (typeof TABS !== 'undefined' ? TABS : []).map((t) => t.id),
    om: (typeof OM_TABS !== 'undefined' ? OM_TABS : []).map((t) => t.id),
    financeiro: (typeof FIN_TABS !== 'undefined' ? FIN_TABS : []).map((t) => t.id),
    vistoria: (typeof VISTORIA_TABS !== 'undefined' ? VISTORIA_TABS : []).map((t) => t.id),
    engenharia: (typeof ENG_TABS !== 'undefined' ? ENG_TABS : []).map((t) => t.id),
  };

  if (!Object.prototype.hasOwnProperty.call(tabsByEnv, env)) return null;
  if (env === 'om' && !state.canOM) return null;
  if (env === 'financeiro' && !state.canFin) return null;
  if (env === 'vistoria' && !state.canVis) return null;
  if (env === 'engenharia' && !state.canEng) return null;
  if (!tabsByEnv[env].includes(tab)) return null;
  if (env === 'comercial' && TABS_GESTAO.includes(tab) && !(state.isAdmin || state.isGestor)) return null;

  return { env, tab };
}

// Aplica uma rota já validada sem regravar o hash (boot e popstate).
function appRouteApply(route) {
  if (!route) return false;
  _appRouteApplying = true;
  try {
    state.environment = route.env;
    setTab(route.tab);
    return true;
  } finally {
    _appRouteApplying = false;
  }
}

window.addEventListener('popstate', () => {
  if (!state.currentUser) return;
  const route = appRouteParse(window.location.hash);
  if (route) appRouteApply(route);
});

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

// =======================================================================
// ABA PROPOSTAS — Repaginação Comercial (Fase D + ciclo de vida 13/07/2026)
// Lista sobre state.propostas (já carregado e escopado por fetchPropostas).
// Ciclo real desde 13/07/2026: GERADA → ENVIADA (vendedor envia/copia o link)
// → VISTA (cliente abre o proposta.html; RPC registrar_proposta_view grava
// vista_em/vista_count) → ACEITA (venda fechada vinculada por proposta_id).
// Linhas antigas seguem GERADA — compatível.
// =======================================================================
const PROPOSTA_STATUS_STYLE = {
  GERADA:  { cls: 'bg-neutral-800/60 text-neutral-400 border-neutral-700' },
  ENVIADA: { cls: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
  VISTA:   { cls: 'bg-orange-500/10 text-orange-400 border-orange-500/30' },
  ACEITA:  { cls: 'bg-green-500/10 text-green-400 border-green-500/30' },
};

function propostaStatus(p) {
  const s = String(p?.status || 'GERADA').toUpperCase();
  return PROPOSTA_STATUS_STYLE[s] ? s : 'GERADA';
}

function propostaPreco(p) {
  const isPersonalizada = p.proposal_mode === 'PERSONALIZADA' || p.proposal_mode === 'EQUIPAMENTOS';
  const valor = isPersonalizada ? (p.custom_total_price || p.kit_price) : p.kit_price;
  return Number(valor || 0);
}

function propostaPotencia(p) {
  return p.kit_power || p.custom_system_power_kwp || 0;
}

const _propostasSearchDebounced = debounce((value) => {
  state.propostasSearch = String(value || '');
  renderContent();
}, 180);

function handlePropostasSearchInput(value) {
  _propostasSearchDebounced(value);
}

// "Nova Proposta" abre este seletor em vez de largar o usuário na aba
// Clientes sem instrução: escolhe o cliente → abre direto o construtor.
function openNovaPropostaPicker() {
  const existing = document.getElementById('np-picker-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'np-picker-overlay';
  overlay.className = 'fixed inset-0 z-[95] flex items-center justify-center bg-black/90 backdrop-blur-md p-4';
  overlay.innerHTML = `
    <div class="bg-neutral-900 border border-neutral-700 w-full max-w-md shadow-2xl animate-fade-in-up flex flex-col max-h-[80vh]">
      <div class="flex justify-between items-center p-5 border-b border-neutral-800 bg-black/50">
        <p class="text-orange-500 text-xs font-black uppercase tracking-[0.2em] flex items-center gap-2"><i data-lucide="file-plus-2" class="w-4 h-4"></i> Nova proposta — para quem?</p>
        <button onclick="document.getElementById('np-picker-overlay').remove()" class="text-neutral-500 hover:text-white"><i data-lucide="x" class="w-5 h-5"></i></button>
      </div>
      <div class="p-4 border-b border-neutral-800">
        <div class="relative">
          <i data-lucide="search" class="w-3.5 h-3.5 text-neutral-600 absolute left-3 top-1/2 -translate-y-1/2"></i>
          <input id="np-picker-search" type="text" placeholder="Buscar cliente por nome, telefone ou cidade" class="w-full bg-black border border-neutral-800 text-white pl-9 pr-3 py-2.5 text-[11px] font-bold tracking-wide" autocomplete="off">
        </div>
      </div>
      <div id="np-picker-list" class="flex-1 overflow-y-auto custom-scrollbar"></div>
      <div class="p-4 border-t border-neutral-800 bg-black/40">
        <button onclick="document.getElementById('np-picker-overlay').remove(); setTab('clientes'); openClientModal();" class="btn btn-ghost btn-sm btn-block"><i data-lucide="user-plus"></i> Cadastrar cliente novo</button>
      </div>
    </div>`;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);

  const input = document.getElementById('np-picker-search');
  if (input) {
    input.addEventListener('input', () => renderNovaPropostaPickerList(input.value));
    input.focus();
  }
  renderNovaPropostaPickerList('');
  lucide.createIcons();
}

function renderNovaPropostaPickerList(term) {
  const listEl = document.getElementById('np-picker-list');
  if (!listEl) return;

  // Mesmo recorte da aba Clientes (admin respeita o escopo global ativo).
  const source = state.isAdmin && typeof applyAdminGlobalScope === 'function'
    ? applyAdminGlobalScope(state.clientes || [])
    : (Array.isArray(state.clientes) ? state.clientes : []);

  const t = String(term || '').trim().toLowerCase();
  const rows = (t
    ? source.filter((c) => `${c?.nome || ''} ${c?.telefone || ''} ${c?.cidade || ''}`.toLowerCase().includes(t))
    : source).slice(0, 30);

  if (rows.length === 0) {
    listEl.innerHTML = '<div class="py-10 text-center text-neutral-600 text-[10px] font-black uppercase tracking-widest">Nenhum cliente encontrado</div>';
    return;
  }

  listEl.innerHTML = rows.map((c) => `
    <button onclick="document.getElementById('np-picker-overlay').remove(); openProposalBuilder('${c.id}')"
      class="w-full text-left px-5 py-3 border-b border-neutral-800/60 hover:bg-neutral-800/50 transition-colors flex items-center justify-between gap-3">
      <span class="min-w-0">
        <span class="block text-white text-xs font-black uppercase truncate">${escapeHTML(c?.nome || 'CLIENTE')}</span>
        <span class="block text-[9px] text-neutral-500 font-bold truncate">${escapeHTML(c?.cidade || '')}${c?.telefone ? ` · ${escapeHTML(c.telefone)}` : ''}</span>
      </span>
      <i data-lucide="chevron-right" class="w-4 h-4 text-neutral-600 shrink-0"></i>
    </button>`).join('');
  lucide.createIcons();
}

function renderPropostasList(container) {
  container.className = 'flex flex-col gap-4';

  const emptyState = document.getElementById('empty-state');
  if (emptyState) emptyState.classList.add('hidden');

  // Mesmo escopo de permissão que o Dashboard usa para propostas.
  const rows = getDashboardScopedRows(state.propostas || []);

  const term = String(state.propostasSearch || '').trim().toLowerCase();
  const filtered = term
    ? rows.filter((p) => `${p.cliente_nome || ''} ${p.kit_nome || ''}`.toLowerCase().includes(term))
    : rows;

  // Resumo agregado (sobre o escopo completo, não afetado pela busca).
  const now = new Date();
  const valorTotal = rows.reduce((acc, p) => acc + propostaPreco(p), 0);
  const ticket = rows.length ? valorTotal / rows.length : 0;
  const noMes = rows.filter((p) => {
    const d = new Date(p.created_at);
    return !Number.isNaN(d.getTime()) && d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }).length;
  const nVistas = rows.filter((p) => propostaStatus(p) === 'VISTA').length;
  const nAceitas = rows.filter((p) => propostaStatus(p) === 'ACEITA').length;

  const CAP = 300; // teto de render para não travar em bases grandes
  const visible = filtered.slice(0, CAP);

  let html = `
    <section class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl md:text-3xl font-black text-white uppercase tracking-tighter leading-none">Propostas <span class="text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-yellow-400">${rows.length}</span></h1>
        <p class="text-neutral-600 text-[10px] font-bold uppercase tracking-widest mt-1">Histórico de propostas geradas</p>
      </div>
      <div class="flex items-center gap-2">
        <button class="btn btn-primary" onclick="openNovaPropostaPicker()"><i data-lucide="plus"></i>Nova Proposta</button>
      </div>
    </section>

    <section class="grid grid-cols-2 lg:grid-cols-5 gap-3">
      <div class="p-4 border border-neutral-800 bg-[#0f0f10]"><div class="text-[9px] font-black uppercase tracking-widest text-neutral-500 mb-2">Total geradas</div><div class="text-2xl font-black text-white stat-num">${rows.length}</div></div>
      <div class="p-4 border border-neutral-800 bg-[#0f0f10]"><div class="text-[9px] font-black uppercase tracking-widest text-orange-400/80 mb-2">Vistas pelo cliente</div><div class="text-2xl font-black text-orange-400 stat-num">${nVistas}</div></div>
      <div class="p-4 border border-neutral-800 bg-[#0f0f10]"><div class="text-[9px] font-black uppercase tracking-widest text-green-500/80 mb-2">Aceitas</div><div class="text-2xl font-black text-green-400 stat-num">${nAceitas}</div></div>
      <div class="p-4 border border-neutral-800 bg-[#0f0f10]"><div class="text-[9px] font-black uppercase tracking-widest text-neutral-500 mb-2">Valor total</div><div class="text-2xl font-black text-green-400 stat-num">${formatCurrency(valorTotal)}</div></div>
      <div class="p-4 border border-neutral-800 bg-[#0f0f10]"><div class="text-[9px] font-black uppercase tracking-widest text-neutral-500 mb-2">Ticket médio</div><div class="text-2xl font-black text-white stat-num">${formatCurrency(ticket)}</div></div>
    </section>

    <section class="flex flex-wrap items-center gap-2 border border-neutral-800 bg-[#0f0f10] p-3">
      <div class="flex items-center gap-2 flex-1 min-w-[200px] bg-black border border-neutral-800 px-3">
        <i data-lucide="search" class="w-3.5 h-3.5 text-neutral-600"></i>
        <input type="text" value="${escapeHTML(state.propostasSearch || '')}" oninput="handlePropostasSearchInput(this.value)" placeholder="Buscar por cliente ou kit..." class="bg-transparent text-xs text-white py-2.5 outline-none flex-1 placeholder:text-neutral-600">
      </div>
      <span class="text-[9px] font-black uppercase tracking-widest text-neutral-600">${noMes} no mês</span>
    </section>
  `;

  if (visible.length === 0) {
    html += `
      <div class="py-16 text-center text-neutral-600 font-bold uppercase tracking-widest text-xs border border-dashed border-neutral-800/60 bg-neutral-950/40">
        <i data-lucide="file-clock" class="w-10 h-10 mx-auto mb-3 opacity-30"></i>
        ${term ? 'Nenhuma proposta para esta busca' : 'Nenhuma proposta gerada ainda'}
      </div>`;
    container.innerHTML = html;
    lucide.createIcons();
    return;
  }

  html += `<section class="flex flex-col gap-2">${visible.map((p) => {
    const kwp = propostaPotencia(p);
    const st = propostaStatus(p);
    const stStyle = PROPOSTA_STATUS_STYLE[st];
    // "Cliente VIU a proposta" é o gatilho de venda — merece destaque na linha.
    const vistaInfo = st === 'VISTA' && p.vista_em
      ? `<span class="text-[9px] text-orange-400/80 font-bold">vista ${typeof crmTimeAgo === 'function' ? crmTimeAgo(p.vista_em) : formatDate(p.vista_em)}${Number(p.vista_count) > 1 ? ` · ${p.vista_count}x` : ''}</span>`
      : '';
    return `
      <div class="border ${st === 'VISTA' ? 'border-orange-500/30' : 'border-neutral-800'} bg-[#0f0f10] p-4 flex items-center gap-4 flex-wrap hover:border-neutral-700 transition-colors">
        <div class="flex-1 min-w-[160px]">
          <div class="flex items-center gap-2 min-w-0">
            <span class="text-white text-sm font-black uppercase truncate">${escapeHTML(p.cliente_nome || 'Sem cliente')}</span>
            <span class="text-[8px] px-1.5 py-0.5 uppercase font-black tracking-widest border shrink-0 ${stStyle.cls}">${st}</span>
            ${vistaInfo}
          </div>
          <div class="text-[10px] text-neutral-500 font-bold truncate">${escapeHTML(p.kit_nome || 'Proposta')}${p.numero ? ` · Nº ${escapeHTML(String(p.numero))}` : ''}</div>
        </div>
        <div class="hidden sm:block text-center"><div class="text-white text-sm font-black stat-num">${escapeHTML(String(kwp || '-'))}</div><div class="text-[8px] text-neutral-600 font-bold uppercase tracking-widest">kWp</div></div>
        <div class="text-right"><div class="text-green-400 text-sm font-black stat-num">${formatCurrency(propostaPreco(p))}</div><div class="text-[8px] text-neutral-600 font-bold uppercase tracking-widest">${formatDate(p.created_at)}</div></div>
        <a href="proposta.html?id=${p.id}" target="_blank" rel="noopener" class="btn btn-secondary btn-sm"><i data-lucide="external-link"></i>Abrir</a>
      </div>`;
  }).join('')}</section>`;

  if (filtered.length > CAP) {
    html += `<div class="text-center text-[10px] text-neutral-600 font-bold uppercase tracking-widest py-2">Mostrando ${CAP} de ${filtered.length} — refine a busca para ver mais</div>`;
  }

  container.innerHTML = html;
  lucide.createIcons();
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

  // Ambiente Vistoria: delega para o módulo vistoria.js
  if (state.environment === 'vistoria') {
    stopDashboardClock();
    if (typeof stopOmClock === 'function') stopOmClock();
    mainToolbar.classList.add('hidden');
    toggleContainer.classList.add('hidden');
    if (adminBar) adminBar.classList.add('hidden');
    if (typeof renderVistoriaRoute === 'function') {
      renderVistoriaRoute(container, state.vistoriaActiveTab);
    } else {
      container.innerHTML = '<div class="text-neutral-500 font-bold p-8">Módulo Vistoria não carregado.</div>';
    }
    queueAppLucideCreateIcons();
    return;
  }

  // Ambiente Engenharia: delega para o módulo engenharia.js
  if (state.environment === 'engenharia') {
    stopDashboardClock();
    if (typeof stopOmClock === 'function') stopOmClock();
    mainToolbar.classList.add('hidden');
    toggleContainer.classList.add('hidden');
    if (adminBar) adminBar.classList.add('hidden');
    if (typeof renderEngRoute === 'function') {
      renderEngRoute(container, state.engActiveTab);
    } else {
      container.innerHTML = '<div class="text-neutral-500 font-bold p-8">Módulo Engenharia não carregado.</div>';
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
  } else if (state.activeTab === 'funil') {
    stopDashboardClock();
    mainToolbar.classList.add('hidden');
    toggleContainer.classList.add('hidden');
    if (adminBar) adminBar.classList.add('hidden');
    renderFunil(container);
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
  } else if (state.activeTab === 'propostas') {
    stopDashboardClock();
    mainToolbar.classList.add('hidden');
    toggleContainer.classList.add('hidden');
    if (adminBar) adminBar.classList.add('hidden');
    renderPropostasList(container);
  } else if (state.activeTab === 'vendas') {
    stopDashboardClock();
    mainToolbar.classList.add('hidden');
    toggleContainer.classList.add('hidden');
    if (adminBar) adminBar.classList.add('hidden');
    renderVendas(container);
  } else if (state.activeTab === 'analise') {
    stopDashboardClock();
    mainToolbar.classList.add('hidden');
    toggleContainer.classList.add('hidden');
    if (adminBar) adminBar.classList.add('hidden');
    // Guard de rota: espelha getActiveTabsForEnvironment (a aba nem aparece p/
    // vendedor, mas o hash #app/comercial/analise não pode furar).
    if (!(state.isAdmin || state.isGestor)) {
      container.innerHTML = '<div class="text-neutral-500 font-bold p-8 text-sm">Esta área é restrita a gestores.</div>';
    } else if (typeof renderAnalise === 'function') {
      renderAnalise(container);
    } else {
      container.innerHTML = '<div class="text-neutral-500 font-bold p-8">Módulo Análise não carregado.</div>';
    }
  } else {
    // produtos (rota explícita no TABS) e qualquer id não mapeado caem aqui.
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



