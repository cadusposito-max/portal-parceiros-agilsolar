
// ==========================================
// RENDERIZADOR: CLIENTES
// ==========================================

const CLIENT_STATUS_SEQUENCE = ['NOVO', 'PROPOSTA ENVIADA', 'EM NEGOCIAÇÃO', 'FECHADO'];
const CLIENT_STATUS_OPTIONS = ['TODOS', ...CLIENT_STATUS_SEQUENCE];
const CLIENT_SORT_OPTIONS = [
  { v: 'recent', l: 'MAIS RECENTES' },
  { v: 'alpha', l: 'A-Z' },
];
const ADMIN_CLIENT_PRESETS = [
  { v: 'all', l: 'Tudo' },
  { v: 'today', l: 'Hoje' },
  { v: 'month', l: 'Mês atual' },
  { v: '30d', l: 'Últimos 30 dias' },
  { v: 'no_sale', l: 'Sem venda' },
  { v: 'top_performers', l: 'Top desempenhos' },
];
const CLIENT_STATUS_STYLE = {
  NOVO: { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/30' },
  'PROPOSTA ENVIADA': { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30' },
  'EM NEGOCIAÇÃO': { bg: 'bg-yellow-500/10', text: 'text-yellow-300', border: 'border-yellow-500/30' },
  FECHADO: { bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/30' },
};
const CLIENT_AVATAR_COLORS = [
  'from-orange-600 to-orange-400',
  'from-yellow-600 to-yellow-400',
  'from-green-600 to-emerald-400',
  'from-blue-600 to-blue-400',
  'from-purple-600 to-purple-400',
  'from-pink-600 to-pink-400',
];

function getDefaultAdminClientesFilters() {
  return {
    search: '',
    status: 'TODOS',
    vendedor_email: 'all',
    franquia_id: 'all',
    cidade: 'all',
    mes: 'all',
    preset: 'all',
  };
}

function ensureAdminClientesFiltersState() {
  if (!state.adminClientesFilters || typeof state.adminClientesFilters !== 'object') {
    state.adminClientesFilters = getDefaultAdminClientesFilters();
    return;
  }

  state.adminClientesFilters = {
    ...getDefaultAdminClientesFilters(),
    ...state.adminClientesFilters,
  };
}

function normalizeClientStatus(status) {
  if (!status) return 'NOVO';
  const value = String(status).trim().toUpperCase();
  return CLIENT_STATUS_SEQUENCE.includes(value) ? value : 'NOVO';
}

function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

function buildClientWhatsappLink(client) {
  const waNum = digitsOnly(client?.telefone);
  if (!waNum) return '';
  const firstName = String(client?.nome || '').split(' ')[0] || 'cliente';
  const msg = encodeURIComponent(`Olá ${firstName}, tudo bem? Gostaria de conversar sobre energia solar.`);
  return `https://wa.me/55${waNum}?text=${msg}`;
}

function getAdminScopeFranquiaOptions(rows) {
  const idsFromRows = new Set(
    (Array.isArray(rows) ? rows : [])
      .map((item) => String(item?.franquia_id || '').trim())
      .filter(Boolean)
  );

  const idsFromCatalog = new Set(
    (state.franquiasCatalog || [])
      .map((item) => String(item?.id || '').trim())
      .filter(Boolean)
  );

  const ids = [...new Set([...idsFromCatalog, ...idsFromRows])];
  return ids
    .map((id) => ({ id, nome: getFranquiaNameById(id) }))
    .sort((a, b) => a.nome.localeCompare(b.nome));
}

function getAdminClienteFilterOptions(rows) {
  const list = Array.isArray(rows) ? rows : [];

  const vendedores = [...new Set(
    list
      .map((item) => String(item?.vendedor_email || '').trim().toLowerCase())
      .filter(Boolean)
  )]
    .sort((a, b) => a.localeCompare(b))
    .map((email) => ({ email, nome: email.split('@')[0] || email }));

  const meses = [...new Set(
    list
      .map((item) => toMonthKey(item?.created_at))
      .filter(Boolean)
  )]
    .sort()
    .reverse();

  const cidades = [...new Set(
    list
      .map((item) => String(item?.cidade || '').trim())
      .filter(Boolean)
  )]
    .sort((a, b) => a.localeCompare(b));

  const franquias = getAdminScopeFranquiaOptions(list);

  return { vendedores, meses, cidades, franquias };
}

function getScopedSalesForAdminClientes() {
  return applyAdminGlobalScope(Array.isArray(state.vendas) ? state.vendas : []);
}

function hasSaleForClient(client, sales) {
  const clientPhone = digitsOnly(client?.telefone);
  const clientName = normalizeFilterText(client?.nome);

  return (Array.isArray(sales) ? sales : []).some((sale) => {
    const salePhone = digitsOnly(sale?.cliente_telefone);
    if (clientPhone && salePhone && clientPhone === salePhone) return true;

    const saleName = normalizeFilterText(sale?.cliente_nome);
    return clientName && saleName && clientName === saleName;
  });
}

function getTopSellerEmailsFromSales(sales, limit = 3) {
  const totals = new Map();
  (Array.isArray(sales) ? sales : []).forEach((sale) => {
    const email = String(sale?.vendedor_email || '').trim().toLowerCase();
    if (!email) return;
    totals.set(email, (totals.get(email) || 0) + 1);
  });

  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([email]) => email);
}
function applyAdminClientePreset(rows, preset, scopedSales) {
  const list = Array.isArray(rows) ? rows : [];
  const key = String(preset || 'all');

  if (key === 'today') {
    return list.filter((item) => isSameDayDate(item?.created_at));
  }

  if (key === 'month') {
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return list.filter((item) => toMonthKey(item?.created_at) === monthKey);
  }

  if (key === '30d') {
    return list.filter((item) => isDateInLastDays(item?.created_at, 30));
  }

  if (key === 'no_sale') {
    return list.filter((item) => !hasSaleForClient(item, scopedSales));
  }

  if (key === 'top_performers') {
    const topEmails = new Set(getTopSellerEmailsFromSales(scopedSales, 3));
    if (topEmails.size === 0) return [];
    return list.filter((item) => topEmails.has(String(item?.vendedor_email || '').trim().toLowerCase()));
  }

  return list;
}

function applyAdminClientesFilters(rows) {
  ensureAdminClientesFiltersState();

  const filters = state.adminClientesFilters;
  let filtered = Array.isArray(rows) ? [...rows] : [];

  const search = normalizeFilterText(filters.search);
  if (search) {
    filtered = filtered.filter((item) => {
      const blob = [item?.nome, item?.telefone, item?.cidade, item?.vendedor_email]
        .map((entry) => normalizeFilterText(entry))
        .join(' ');
      return blob.includes(search);
    });
  }

  if (filters.status && filters.status !== 'TODOS') {
    filtered = filtered.filter((item) => normalizeClientStatus(item?.status) === filters.status);
  }

  if (filters.vendedor_email && filters.vendedor_email !== 'all') {
    const seller = String(filters.vendedor_email).toLowerCase();
    filtered = filtered.filter((item) => String(item?.vendedor_email || '').toLowerCase() === seller);
  }

  if (state.adminViewAll && filters.franquia_id && filters.franquia_id !== 'all') {
    filtered = filtered.filter((item) => String(item?.franquia_id || '') === String(filters.franquia_id));
  }

  if (filters.cidade && filters.cidade !== 'all') {
    filtered = filtered.filter((item) => String(item?.cidade || '').trim() === String(filters.cidade));
  }

  if (filters.mes && filters.mes !== 'all') {
    filtered = filtered.filter((item) => toMonthKey(item?.created_at) === filters.mes);
  }

  filtered = applyAdminClientePreset(filtered, filters.preset, getScopedSalesForAdminClientes());
  return filtered;
}

function applyRegularClientesFilters(rows) {
  let filtered = Array.isArray(rows) ? [...rows] : [];

  if (state.searchTerm) {
    const search = normalizeFilterText(state.searchTerm);
    filtered = filtered.filter((item) => {
      const blob = [item?.nome, item?.telefone, item?.cidade]
        .map((entry) => normalizeFilterText(entry))
        .join(' ');
      return blob.includes(search);
    });
  }

  if (state.clienteFilter && state.clienteFilter !== 'TODOS') {
    filtered = filtered.filter((item) => normalizeClientStatus(item?.status) === state.clienteFilter);
  }

  if (state.clienteSort === 'alpha') {
    filtered.sort((a, b) => String(a?.nome || '').localeCompare(String(b?.nome || '')));
  }

  return filtered;
}

function renderClientMetaChips(client, options = {}) {
  const showSeller = Boolean(options.showSeller);
  const showFranquia = Boolean(options.showFranquia);

  const chips = [
    `<span class="flex items-center gap-1"><i data-lucide="phone" class="w-2.5 h-2.5"></i>${escapeHTML(client?.telefone || '-')}</span>`,
  ];

  if (client?.cidade) {
    chips.push(`<span class="flex items-center gap-1"><i data-lucide="map-pin" class="w-2.5 h-2.5"></i>${escapeHTML(client.cidade)}</span>`);
  }

  chips.push(`<span class="flex items-center gap-1"><i data-lucide="calendar" class="w-2.5 h-2.5"></i>${formatDate(client?.created_at)}</span>`);

  if (showSeller && client?.vendedor_email) {
    chips.push(`<span class="flex items-center gap-1 text-purple-400 font-bold"><i data-lucide="user" class="w-2.5 h-2.5"></i>${escapeHTML(String(client.vendedor_email).split('@')[0])}</span>`);
  }

  if (showFranquia && client?.franquia_id) {
    chips.push(`<span class="flex items-center gap-1 text-cyan-300 font-bold"><i data-lucide="building-2" class="w-2.5 h-2.5"></i>${escapeHTML(getFranquiaNameById(client.franquia_id))}</span>`);
  }

  return chips.join('');
}

function renderClientPipelineBar(status) {
  const current = normalizeClientStatus(status);
  const stageIdx = CLIENT_STATUS_SEQUENCE.indexOf(current);

  return CLIENT_STATUS_SEQUENCE.map((stage, idx) => {
    const done = idx <= stageIdx;
    const active = idx === stageIdx;
    const color = done ? (active ? 'bg-orange-500' : 'bg-orange-500/35') : 'bg-neutral-800';
    const radius = idx === 0 ? 'rounded-l' : (idx === CLIENT_STATUS_SEQUENCE.length - 1 ? 'rounded-r' : '');
    return `<div class="flex-1 h-1 ${color} ${radius} transition-all duration-500"></div>`;
  }).join('');
}
function renderClientActions(client, compact = false) {
  const waLink = buildClientWhatsappLink(client);
  const shared = compact ? 'text-[8px] px-2.5 py-1.5' : 'text-[9px] px-3 py-2';

  const waButton = waLink
    ? `<a href="${waLink}" target="_blank" rel="noopener noreferrer"
        class="w-full min-w-0 flex items-center justify-center gap-1.5 bg-green-600 border border-green-500 hover:bg-green-700 hover:border-green-400 text-white ${shared} font-black uppercase tracking-wider transition-all active:scale-95">
        <i data-lucide="message-circle" class="w-3.5 h-3.5"></i>
        <span>WhatsApp</span>
      </a>`
    : `<button disabled class="w-full min-w-0 flex items-center justify-center gap-1.5 bg-neutral-900 border border-neutral-800 text-neutral-600 ${shared} font-black uppercase tracking-wider cursor-not-allowed">
        <i data-lucide="message-circle-off" class="w-3.5 h-3.5"></i>
        <span>Sem WhatsApp</span>
      </button>`;

  if (compact) {
    return `
      <div class="relative z-10 mt-4 pt-3 border-t border-neutral-800/60 grid grid-cols-2 gap-2 min-w-0">
        ${waButton}
        <button onclick="openProposalBuilder('${client.id}')"
          class="w-full min-w-0 bg-neutral-800/50 border border-neutral-700/50 hover:border-orange-500/50 hover:bg-orange-500/8 hover:text-orange-400 text-neutral-400 ${shared} font-black uppercase tracking-wider transition-all active:scale-95 flex gap-1.5 items-center justify-center">
          <i data-lucide="file-text" class="w-3.5 h-3.5"></i>
          <span>Expandir</span>
        </button>
        <button onclick="openFechaVenda('${client.id}')"
          class="col-span-2 w-full min-w-0 bg-green-600 border border-green-500 hover:bg-green-700 hover:border-green-400 text-white ${shared} font-black uppercase tracking-wider transition-all active:scale-95 flex gap-1.5 items-center justify-center">
          <i data-lucide="trophy" class="w-3.5 h-3.5"></i>
          <span>Fechar venda</span>
        </button>
      </div>
    `;
  }

  return `
    <div class="relative z-10 flex gap-2 mt-4 pt-3 border-t border-neutral-800/60">
      <div class="shrink-0">${waButton}</div>
      <button onclick="openProposalBuilder('${client.id}')"
        class="flex-1 bg-neutral-800/50 border border-neutral-700/50 hover:border-orange-500/50 hover:bg-orange-500/8 hover:text-orange-400 text-neutral-400 ${shared} font-black uppercase tracking-wider transition-all active:scale-95 flex gap-2 items-center justify-center">
        <i data-lucide="file-text" class="w-3.5 h-3.5"></i>
        EXPANDIR
      </button>
      <button onclick="openFechaVenda('${client.id}')"
        class="bg-green-600 border border-green-500 hover:bg-green-700 hover:border-green-400 text-white ${shared} font-black uppercase tracking-wider transition-all active:scale-95 flex gap-1.5 items-center justify-center shrink-0">
        <i data-lucide="trophy" class="w-3.5 h-3.5"></i>
        <span class="hidden md:inline">FECHAR</span>
      </button>
    </div>
  `;
}
function renderClienteCard(client, index, options = {}) {
  const compact = Boolean(options.compact);
  const showSeller = Boolean(options.showSeller);
  const showFranquia = Boolean(options.showFranquia);

  const status = normalizeClientStatus(client?.status);
  const statusStyle = CLIENT_STATUS_STYLE[status] || CLIENT_STATUS_STYLE.NOVO;
  const initial = String(client?.nome || '?').charAt(0).toUpperCase();
  const color = CLIENT_AVATAR_COLORS[(String(client?.nome || 'A').charCodeAt(0) || 0) % CLIENT_AVATAR_COLORS.length];
  const stagger = ['stagger-1', 'stagger-2', 'stagger-3', 'stagger-4', 'stagger-5', 'stagger-6'][Math.min(index, 5)];
  const pipelineBar = renderClientPipelineBar(status);
  const meta = renderClientMetaChips(client, { showSeller, showFranquia });

  const cardPadding = compact ? 'p-4' : 'p-5';
  const titleSize = compact ? 'text-sm' : 'text-sm md:text-base';

  return `
    <article class="metric-card client-metric-card shine-effect ${stagger} relative border border-neutral-800 hover:border-orange-500/25 ${cardPadding} group transition-all duration-300 bg-[#080808]">
      <div class="absolute top-0 right-0 w-24 h-24 bg-orange-500/4 rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>

      <div class="relative z-10 flex items-start gap-4">
        <div class="shrink-0 w-11 h-11 rounded-full bg-gradient-to-br ${color} flex items-center justify-center text-black font-black text-base shadow-[0_0_12px_rgba(249,115,22,0.2)] ring-2 ring-black select-none">
          ${escapeHTML(initial)}
        </div>

        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap mb-0.5">
            <h3 class="text-white font-black ${titleSize} uppercase truncate group-hover:text-orange-400 transition-colors leading-tight">${escapeHTML(client?.nome || 'CLIENTE')}</h3>
            <button
              onclick="handleCycleClientStatus('${client.id}', '${status}')"
              class="text-[8px] px-2 py-0.5 uppercase font-black tracking-widest border transition-all ${statusStyle.bg} ${statusStyle.text} ${statusStyle.border} hover:brightness-125 shrink-0"
              title="Clique para avançar o status"
              aria-label="Status ${escapeHTML(status)}">
              ${escapeHTML(status)}
            </button>
          </div>

          <div class="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-neutral-600 font-mono mb-3 mt-1">${meta}</div>

          <div class="mb-0">
            <div class="flex gap-0.5 mb-1">${pipelineBar}</div>
            <div class="flex justify-between text-[8px] text-neutral-700 font-bold uppercase">
              <span>Novo</span><span>Proposta</span><span>Negoc.</span><span>Fechado</span>
            </div>
          </div>
        </div>
      </div>

      ${renderClientActions(client, compact)}
    </article>
  `;
}

function renderAdminClientesToolbar(baseRows, filteredRows) {
  ensureAdminClientesFiltersState();
  const filters = state.adminClientesFilters;
  const options = getAdminClienteFilterOptions(baseRows);

  const sellersOptions = options.vendedores
    .map((seller) => `<option value="${escapeHTML(seller.email)}" ${filters.vendedor_email === seller.email ? 'selected' : ''}>${escapeHTML(seller.nome)}</option>`)
    .join('');

  const monthOptions = options.meses
    .map((month) => `<option value="${month}" ${filters.mes === month ? 'selected' : ''}>${formatMonthLabel(month).toUpperCase()}</option>`)
    .join('');

  const cityOptions = options.cidades
    .map((city) => `<option value="${escapeHTML(city)}" ${filters.cidade === city ? 'selected' : ''}>${escapeHTML(city)}</option>`)
    .join('');

  const franchiseSelect = state.adminViewAll
    ? `<label class="flex-1 min-w-[170px]">
         <span class="text-[8px] text-neutral-600 font-black uppercase tracking-widest block mb-1">Franquia</span>
         <select onchange="setAdminClientesFilter('franquia_id', this.value)" class="w-full bg-black border border-neutral-800 text-neutral-300 px-3 py-2.5 text-[10px] font-black uppercase tracking-widest">
           <option value="all">TODAS</option>
           ${options.franquias.map((f) => `<option value="${f.id}" ${String(filters.franquia_id) === String(f.id) ? 'selected' : ''}>${escapeHTML(f.nome)}</option>`).join('')}
         </select>
       </label>`
    : '';

  const adminScopeLabel = state.adminViewAll
    ? (String(state.adminScopeFranquiaId || 'all') === 'all' ? 'Consolidado: todas as franquias' : `Consolidado: ${getFranquiaNameById(state.adminScopeFranquiaId)}`)
    : `Minha Unidade: ${state.franquiaNome || 'franquia do administrador'}`;

  const globalScopeSelect = state.adminViewAll
    ? `<label class="w-full sm:w-auto min-w-[220px]">
         <span class="text-[8px] text-neutral-600 font-black uppercase tracking-widest block mb-1">Recorte global</span>
         <select onchange="setAdminScopeFranquia(this.value)" class="w-full bg-black border border-neutral-800 text-neutral-300 px-3 py-2.5 text-[10px] font-black uppercase tracking-widest">
           <option value="all">TODAS AS FRANQUIAS</option>
           ${getAdminScopeFranquiaOptions(baseRows).map((f) => `<option value="${f.id}" ${String(state.adminScopeFranquiaId || 'all') === String(f.id) ? 'selected' : ''}>${escapeHTML(f.nome)}</option>`).join('')}
         </select>
       </label>`
    : '';

  return `
    <section class="relative bg-[#080808] bg-grid overflow-hidden p-6 md:p-8 border border-neutral-800 mb-2">
      <div class="absolute inset-0 pointer-events-none">
        <div class="absolute -top-10 -left-10 w-48 h-48 bg-purple-600/10 rounded-full blur-3xl"></div>
        <div class="absolute -bottom-8 -right-8 w-36 h-36 bg-orange-500/10 rounded-full blur-3xl"></div>
      </div>

      <div class="relative z-10 flex flex-col xl:flex-row xl:items-end justify-between gap-4">
        <div>
          <p class="text-purple-400 text-[10px] font-black uppercase tracking-[0.3em] mb-1 flex items-center gap-2">
            <i data-lucide="users" class="w-3.5 h-3.5"></i> CRM ADMINISTRATIVO
          </p>
          <h2 class="text-2xl md:text-3xl font-black text-white uppercase tracking-tighter leading-none">
            Clientes <span class="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-orange-400">${filteredRows.length}</span>
          </h2>
          <p class="text-neutral-500 text-[10px] font-bold uppercase tracking-widest mt-1">${adminScopeLabel} · Base ${baseRows.length}</p>
        </div>

        <div class="flex items-center gap-2 flex-wrap">
          ${globalScopeSelect}
          <div class="flex items-center gap-2">
            <button onclick="setAdminClientesViewMode('list')" class="px-3 py-2 text-[9px] font-black uppercase tracking-widest border ${state.adminClientesViewMode === 'list' ? 'bg-neutral-700 text-white border-neutral-600' : 'bg-black border-neutral-800 text-neutral-500 hover:text-white'}">Lista</button>
            <button onclick="setAdminClientesViewMode('kanban')" class="px-3 py-2 text-[9px] font-black uppercase tracking-widest border ${state.adminClientesViewMode === 'kanban' ? 'bg-orange-600 text-black border-orange-500' : 'bg-black border-neutral-800 text-neutral-500 hover:text-white'}">Kanban</button>
          </div>
          <button onclick="exportClientesXLSX()" class="flex items-center gap-2 bg-neutral-900 border border-neutral-700 hover:border-green-500 hover:text-green-400 text-neutral-500 px-4 py-2.5 font-black uppercase tracking-wider transition-all text-[10px]">
            <i data-lucide="download" class="w-3.5 h-3.5"></i> XLSX
          </button>
          <button onclick="openClientModal()" class="flex items-center gap-2 bg-gradient-to-r from-orange-600 to-yellow-500 hover:from-orange-500 hover:to-yellow-400 text-black px-4 py-2.5 font-black uppercase tracking-wider transition-all text-[10px]">
            <i data-lucide="user-plus" class="w-3.5 h-3.5"></i> NOVO CLIENTE
          </button>
        </div>
      </div>

      <div class="relative z-10 mt-4 pt-4 border-t border-neutral-800/60 space-y-3">
        <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-2.5">
          <label class="sm:col-span-2 xl:col-span-2">
            <span class="text-[8px] text-neutral-600 font-black uppercase tracking-widest block mb-1">Busca global</span>
            <input id="admin-clientes-search" type="text" value="${escapeHTML(filters.search || '')}" oninput="handleAdminClientesSearchInput(this.value)" placeholder="Nome, telefone, cidade ou vendedor" class="w-full bg-black border border-neutral-800 text-white px-3 py-2.5 text-[11px] font-bold tracking-wide">
          </label>

          <label>
            <span class="text-[8px] text-neutral-600 font-black uppercase tracking-widest block mb-1">Status</span>
            <select onchange="setAdminClientesFilter('status', this.value)" class="w-full bg-black border border-neutral-800 text-neutral-300 px-3 py-2.5 text-[10px] font-black uppercase tracking-widest">
              ${CLIENT_STATUS_OPTIONS.map((status) => `<option value="${status}" ${filters.status === status ? 'selected' : ''}>${status}</option>`).join('')}
            </select>
          </label>

          <label>
            <span class="text-[8px] text-neutral-600 font-black uppercase tracking-widest block mb-1">Vendedor</span>
            <select onchange="setAdminClientesFilter('vendedor_email', this.value)" class="w-full bg-black border border-neutral-800 text-neutral-300 px-3 py-2.5 text-[10px] font-black uppercase tracking-widest">
              <option value="all">TODOS</option>
              ${sellersOptions}
            </select>
          </label>

          ${franchiseSelect}
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5">
          <label>
            <span class="text-[8px] text-neutral-600 font-black uppercase tracking-widest block mb-1">Mês cadastro</span>
            <select onchange="setAdminClientesFilter('mes', this.value)" class="w-full bg-black border border-neutral-800 text-neutral-300 px-3 py-2.5 text-[10px] font-black uppercase tracking-widest">
              <option value="all">TODOS</option>
              ${monthOptions}
            </select>
          </label>

          <label>
            <span class="text-[8px] text-neutral-600 font-black uppercase tracking-widest block mb-1">Cidade</span>
            <select onchange="setAdminClientesFilter('cidade', this.value)" class="w-full bg-black border border-neutral-800 text-neutral-300 px-3 py-2.5 text-[10px] font-black uppercase tracking-widest">
              <option value="all">TODAS</option>
              ${cityOptions}
            </select>
          </label>

          <div class="sm:col-span-2 flex flex-wrap gap-1 items-end">
            ${ADMIN_CLIENT_PRESETS.map((preset) => {
              const active = String(filters.preset || 'all') === preset.v;
              return `<button onclick="setAdminClientesPreset('${preset.v}')" class="px-3 py-2 text-[9px] font-black uppercase tracking-widest border ${active ? 'bg-blue-600 text-white border-blue-500' : 'bg-black text-neutral-500 border-neutral-800 hover:text-white'}">${preset.l}</button>`;
            }).join('')}
            <button onclick="resetAdminClientesFilters()" class="px-3 py-2 text-[9px] font-black uppercase tracking-widest border bg-black text-neutral-500 border-neutral-700 hover:border-neutral-500 hover:text-white ml-auto">Limpar filtros</button>
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderRegularClientesToolbar(filteredRows) {
  const counts = { TODOS: state.clientes.length };
  (state.clientes || []).forEach((item) => {
    const status = normalizeClientStatus(item?.status);
    counts[status] = (counts[status] || 0) + 1;
  });

  const filterHTML = CLIENT_STATUS_OPTIONS.map((status) => {
    const active = state.clienteFilter === status;
    const count = counts[status] || 0;
    return `<button onclick="setClienteFilter('${status}')" aria-pressed="${active}" class="px-3 py-1.5 text-[9px] font-black uppercase tracking-widest border transition-all whitespace-nowrap ${active ? 'bg-orange-600 text-black border-orange-500' : 'bg-black text-neutral-500 border-neutral-800 hover:border-neutral-600 hover:text-white'}">${escapeHTML(status)} ${count > 0 ? `<span class="opacity-60">(${count})</span>` : ''}</button>`;
  }).join('');

  const sortHTML = CLIENT_SORT_OPTIONS.map((option) => {
    const active = state.clienteSort === option.v;
    return `<button onclick="setClienteSort('${option.v}')" aria-pressed="${active}" class="px-3 py-1.5 text-[9px] font-black uppercase tracking-widest border transition-all whitespace-nowrap ${active ? 'bg-neutral-700 text-white border-neutral-600' : 'bg-black text-neutral-600 border-neutral-800 hover:text-white'}">${option.l}</button>`;
  }).join('');

  return `
    <section class="relative bg-[#080808] bg-grid overflow-hidden p-6 md:p-8 border border-neutral-800 mb-2">
      <div class="absolute inset-0 pointer-events-none">
        <div class="absolute -top-10 -left-10 w-48 h-48 bg-orange-600/8 rounded-full blur-3xl"></div>
        <div class="absolute -bottom-8 -right-8 w-32 h-32 bg-yellow-500/6 rounded-full blur-3xl"></div>
      </div>

      <div class="relative z-10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <p class="text-orange-500 text-[10px] font-black uppercase tracking-[0.3em] mb-1 flex items-center gap-2"><i data-lucide="users" class="w-3.5 h-3.5"></i> CRM - CARTEIRA DE CLIENTES</p>
          <h2 class="text-2xl md:text-3xl font-black text-white uppercase tracking-tighter leading-none">Meus Clientes <span class="text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-yellow-400">${state.clientes.length}</span></h2>
          <p class="text-neutral-600 text-[10px] font-bold uppercase tracking-widest mt-1">${filteredRows.length} exibindo · ${state.clienteFilter !== 'TODOS' ? escapeHTML(state.clienteFilter) : 'Todos os status'}</p>
        </div>
        <div class="flex gap-2 flex-wrap">
          <button onclick="exportClientesXLSX()" class="flex items-center gap-2 bg-neutral-900 border border-neutral-700 hover:border-green-500 hover:text-green-400 text-neutral-500 px-4 py-2.5 font-black uppercase tracking-wider transition-all text-[10px]"><i data-lucide="download" class="w-3.5 h-3.5"></i> XLSX</button>
          <button onclick="openClientModal()" class="flex items-center gap-2 bg-gradient-to-r from-orange-600 to-yellow-500 hover:from-orange-500 hover:to-yellow-400 text-black px-4 py-2.5 font-black uppercase tracking-wider transition-all text-[10px]"><i data-lucide="user-plus" class="w-3.5 h-3.5"></i> NOVO CLIENTE</button>
        </div>
      </div>

      <div class="relative z-10 flex flex-col sm:flex-row gap-2 pt-4 mt-4 border-t border-neutral-800/60">
        <div class="flex flex-wrap gap-1">${filterHTML}</div>
        <div class="flex gap-1 ml-auto shrink-0">${sortHTML}</div>
      </div>
    </section>
  `;
}
function renderAdminClientesKanbanView(rows) {
  return `
    <section class="grid grid-cols-1 xl:grid-cols-4 gap-3">
      ${CLIENT_STATUS_SEQUENCE.map((status) => {
        const items = rows.filter((row) => normalizeClientStatus(row?.status) === status);
        return `
          <div class="border border-neutral-800 bg-[#080808] min-h-[220px] flex flex-col">
            <div class="px-3 py-2.5 border-b border-neutral-800 flex items-center justify-between gap-2">
              <span class="text-[10px] font-black uppercase tracking-widest text-white">${escapeHTML(status)}</span>
              <span class="text-[9px] font-black text-orange-400">${items.length}</span>
            </div>
            <div class="p-2.5 flex flex-col gap-2">
              ${items.length > 0
                ? items.map((item, index) => renderClienteCard(item, index, { compact: true, showSeller: Boolean(item?.vendedor_email), showFranquia: state.adminViewAll })).join('')
                : `<div class="py-8 text-center border border-dashed border-neutral-800/60 text-neutral-600 text-[10px] font-bold uppercase tracking-widest">Sem clientes</div>`}
            </div>
          </div>
        `;
      }).join('')}
    </section>
  `;
}

function renderClientesList(container) {
  container.className = 'flex flex-col gap-4';

  const emptyState = document.getElementById('empty-state');
  const emptyBtn = document.getElementById('empty-state-btn');

  const sourceRows = state.isAdmin
    ? applyAdminGlobalScope(state.clientes || [])
    : (Array.isArray(state.clientes) ? state.clientes : []);

  const filteredRows = state.isAdmin
    ? applyAdminClientesFilters(sourceRows)
    : applyRegularClientesFilters(sourceRows);

  state.lastFilteredClientes = filteredRows;

  if (sourceRows.length === 0) {
    container.innerHTML = '';
    emptyState.classList.remove('hidden');
    document.getElementById('empty-state-text').innerText = state.isAdmin
      ? 'Nenhum cliente encontrado no escopo atual'
      : 'Nenhum cliente na sua carteira';
    document.getElementById('empty-state-icon').innerHTML = '<i data-lucide="users" class="w-10 h-10"></i>';
    emptyBtn.classList.remove('hidden');
    emptyBtn.innerText = '+ CADASTRAR CLIENTE';
    emptyBtn.onclick = openClientModal;
    lucide.createIcons();
    return;
  }

  emptyState.classList.add('hidden');

  let html = state.isAdmin
    ? renderAdminClientesToolbar(sourceRows, filteredRows)
    : renderRegularClientesToolbar(filteredRows);

  if (filteredRows.length === 0) {
    html += `
      <div class="py-16 text-center text-neutral-600 font-bold uppercase tracking-widest text-xs border border-dashed border-neutral-800/60 bg-neutral-950/40">
        <i data-lucide="filter-x" class="w-10 h-10 mx-auto mb-3 opacity-30"></i>
        Nenhum cliente com os filtros atuais
      </div>
    `;
    container.innerHTML = html;
    lucide.createIcons();
    return;
  }

  if (state.isAdmin && state.adminClientesViewMode === 'kanban') {
    html += renderAdminClientesKanbanView(filteredRows);
  } else {
    const showSeller = (state.isAdmin && state.adminViewAll) || (state.isGestor && state.gestorViewAll);
    const showFranquia = state.isAdmin && state.adminViewAll;
    html += `<section class="grid grid-cols-1 gap-2">${filteredRows.map((item, index) => renderClienteCard(item, index, { compact: false, showSeller, showFranquia })).join('')}</section>`;
  }

  container.innerHTML = html;
  lucide.createIcons();
}

const _adminClientesSearchDebounced = debounce((value) => {
  setAdminClientesFilter('search', value);
}, 180);

function handleAdminClientesSearchInput(value) {
  _adminClientesSearchDebounced(String(value || ''));
}

function setAdminClientesFilter(key, value) {
  ensureAdminClientesFiltersState();

  const normalizedKey = String(key || '').trim();
  if (!normalizedKey) return;

  const nextValue = typeof value === 'string' ? value : String(value || '');
  state.adminClientesFilters[normalizedKey] = nextValue;

  if (normalizedKey === 'search') {
    state.searchTerm = nextValue;
  }

  persistAdminPreferences();
  renderContent();
}

function setAdminClientesPreset(preset) {
  ensureAdminClientesFiltersState();
  state.adminClientesFilters.preset = String(preset || 'all');
  persistAdminPreferences();
  renderContent();
}

function setAdminClientesViewMode(mode) {
  state.adminClientesViewMode = mode === 'kanban' ? 'kanban' : 'list';
  persistAdminPreferences();
  renderContent();
}

function resetAdminClientesFilters() {
  state.adminClientesFilters = getDefaultAdminClientesFilters();
  state.searchTerm = '';
  persistAdminPreferences();
  renderContent();
}

function setClienteFilter(filter) {
  state.clienteFilter = filter;
  renderContent();
}

function setClienteSort(sort) {
  state.clienteSort = sort;
  renderContent();
}

function handleCycleClientStatus(id, currentStatus) {
  const seq = CLIENT_STATUS_SEQUENCE;
  const nextIdx = (seq.indexOf(normalizeClientStatus(currentStatus)) + 1) % seq.length;

  if (nextIdx === 0) {
    showConfirmModal(
      'Rebaixar o status de volta para "NOVO"? O progresso atual sera perdido.',
      () => cycleClientStatus(id, currentStatus)
    );
    return;
  }

  cycleClientStatus(id, currentStatus);
}

async function cycleClientStatus(id, currentStatus) {
  const seq = CLIENT_STATUS_SEQUENCE;
  let nextIdx = seq.indexOf(normalizeClientStatus(currentStatus)) + 1;
  if (nextIdx >= seq.length) nextIdx = 0;

  const newStatus = seq[nextIdx];
  const index = (state.clientes || []).findIndex((item) => item.id === id);
  if (index > -1) state.clientes[index].status = newStatus;

  renderContent();

  try {
    await supabaseClient.from('clientes').update({ status: newStatus }).eq('id', id);
    showToast(`STATUS: ${newStatus}`);
  } catch (error) {
    console.warn('[cycleClientStatus] Falha ao persistir status do cliente.', { id, currentStatus, newStatus, error });
  }
}
function exportClientesXLSX() {
  const filtered = Array.isArray(state.lastFilteredClientes) ? state.lastFilteredClientes : [];
  if (filtered.length === 0) {
    showToast('Nenhum cliente para exportar.');
    return;
  }

  const columns = [
    { key: 'nome', header: 'Nome' },
    { key: 'telefone', header: 'Telefone' },
    { key: 'cidade', header: 'Cidade' },
    { key: 'status', header: 'Status' },
    { key: 'franquia', header: 'Franquia' },
    { key: 'vendedor_email', header: 'Vendedor' },
    { key: 'created_at', header: 'Cadastrado em' },
  ];

  const rows = filtered.map((item) => ({
    nome: item?.nome || '',
    telefone: item?.telefone || '',
    cidade: item?.cidade || '',
    status: normalizeClientStatus(item?.status),
    franquia: getFranquiaNameById(item?.franquia_id),
    vendedor_email: item?.vendedor_email || '',
    created_at: formatDate(item?.created_at),
  }));

  exportToXLSX(rows, columns, `clientes_${new Date().toISOString().split('T')[0]}`);
  showToast('EXPORTAÇÃO XLSX CONCLUÍDA!');
}

function openClientModal() {
  document.getElementById('client-modal-overlay').classList.remove('hidden');
  document.getElementById('client-form').reset();
}

function closeClientModal() {
  document.getElementById('client-modal-overlay').classList.add('hidden');
}

function formatarTelefone(event) {
  let campo = event.target;
  let numeros = campo.value.replace(/\D/g, '');
  let resultado = '';

  if (numeros.length > 0) resultado = `(${numeros.substring(0, 2)}`;
  if (numeros.length > 2) resultado += `) ${numeros.substring(2, 7)}`;
  if (numeros.length > 7) resultado += `-${numeros.substring(7, 11)}`;

  campo.value = resultado;
}

document.getElementById('client-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!state.currentUser) {
    showToast('Faça login primeiro.');
    return;
  }

  const btnSave = document.getElementById('btn-save-client');
  btnSave.innerText = 'SALVANDO...';

  const newClient = {
    vendedor_email: state.currentUser.email,
    nome: document.getElementById('client-nome').value.toUpperCase(),
    telefone: document.getElementById('client-telefone').value,
    cidade: document.getElementById('client-cidade').value,
    status: 'NOVO',
    franquia_id: state.franquiaId,
  };

  let { error } = await supabaseClient.from('clientes').insert([newClient]);

  if (error && error.code === '42703') {
    delete newClient.status;
    const fallback = await supabaseClient.from('clientes').insert([newClient]);
    error = fallback.error;
  }

  if (error) {
    console.error('Erro ao salvar cliente:', error);
    showToast(`Erro ao salvar cliente: ${error.message}`);
    btnSave.innerText = 'SALVAR CLIENTE';
    return;
  }

  await fetchClientes();
  closeClientModal();
  showToast('CLIENTE SALVO!');
  renderContent();
  btnSave.innerText = 'SALVAR CLIENTE';
});



