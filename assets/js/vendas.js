
// ==========================================
// RENDERIZADOR: VENDAS
// ==========================================

const ADMIN_SALES_PRESETS = [
  { v: 'all', l: 'Tudo' },
  { v: 'today', l: 'Hoje' },
  { v: 'month', l: 'Mês atual' },
  { v: '30d', l: 'Últimos 30 dias' },
  { v: 'no_sale', l: 'Sem venda' },
  { v: 'top_performers', l: 'Top desempenhos' },
];

const SALES_SORT_OPTIONS = [
  { v: 'recent', l: 'Mais recentes' },
  { v: 'oldest', l: 'Mais antigas' },
  { v: 'value_desc', l: 'Maior valor' },
  { v: 'value_asc', l: 'Menor valor' },
];

function getDefaultAdminVendasFilters() {
  return {
    search: '',
    vendedor_email: 'all',
    franquia_id: 'all',
    period: 'all',
    min_price: '',
    max_price: '',
    sort: 'recent',
    preset: 'all',
  };
}

function ensureAdminVendasFiltersState() {
  if (!state.adminVendasFilters || typeof state.adminVendasFilters !== 'object') {
    state.adminVendasFilters = getDefaultAdminVendasFilters();
    return;
  }

  state.adminVendasFilters = {
    ...getDefaultAdminVendasFilters(),
    ...state.adminVendasFilters,
  };
}

function getSaleValue(sale) {
  const value = Number(sale?.kit_price);
  return Number.isFinite(value) ? value : 0;
}

function getSaleDate(sale) {
  const date = new Date(sale?.created_at || 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getAdminScopeFranquiaOptionsFromSales(rows) {
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

  return [...new Set([...idsFromCatalog, ...idsFromRows])]
    .map((id) => ({ id, nome: getFranquiaNameById(id) }))
    .sort((a, b) => a.nome.localeCompare(b.nome));
}

function getAdminSalesFilterOptions(rows) {
  const list = Array.isArray(rows) ? rows : [];

  const vendedores = [...new Set(
    list
      .map((item) => String(item?.vendedor_email || '').trim().toLowerCase())
      .filter(Boolean)
  )]
    .sort((a, b) => a.localeCompare(b))
    .map((email) => ({
      email,
      nome: String(email).split('@')[0] || email,
    }));

  const months = [...new Set(
    list
      .map((item) => toMonthKey(item?.created_at))
      .filter(Boolean)
  )]
    .sort()
    .reverse();

  const franquias = getAdminScopeFranquiaOptionsFromSales(list);

  return { vendedores, months, franquias };
}

function sortSalesRows(rows, sortMode) {
  const list = Array.isArray(rows) ? [...rows] : [];
  const mode = String(sortMode || 'recent');

  if (mode === 'oldest') {
    return list.sort((a, b) => {
      const ad = getSaleDate(a)?.getTime() || 0;
      const bd = getSaleDate(b)?.getTime() || 0;
      return ad - bd;
    });
  }

  if (mode === 'value_desc') {
    return list.sort((a, b) => getSaleValue(b) - getSaleValue(a));
  }

  if (mode === 'value_asc') {
    return list.sort((a, b) => getSaleValue(a) - getSaleValue(b));
  }

  return list.sort((a, b) => {
    const ad = getSaleDate(a)?.getTime() || 0;
    const bd = getSaleDate(b)?.getTime() || 0;
    return bd - ad;
  });
}
function applyAdminSalesPeriod(rows, period) {
  const list = Array.isArray(rows) ? rows : [];
  const key = String(period || 'all');

  if (key === 'all') return list;
  if (key === 'today') return list.filter((item) => isSameDayDate(item?.created_at));
  if (key === 'month') {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return list.filter((item) => toMonthKey(item?.created_at) === currentMonth);
  }
  if (key === '30d') return list.filter((item) => isDateInLastDays(item?.created_at, 30));

  if (/^\d{4}-\d{2}$/.test(key)) {
    return list.filter((item) => toMonthKey(item?.created_at) === key);
  }

  return list;
}

function applyAdminSalesPreset(rows, preset) {
  const list = Array.isArray(rows) ? rows : [];
  const key = String(preset || 'all');

  if (key === 'no_sale') {
    return list.filter((item) => getSaleValue(item) <= 0);
  }

  if (key === 'top_performers') {
    const sellerTotals = new Map();
    list.forEach((item) => {
      const email = String(item?.vendedor_email || '').trim().toLowerCase();
      if (!email) return;
      sellerTotals.set(email, (sellerTotals.get(email) || 0) + getSaleValue(item));
    });

    const top = new Set(
      [...sellerTotals.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([email]) => email)
    );

    if (top.size === 0) return [];
    return list.filter((item) => top.has(String(item?.vendedor_email || '').trim().toLowerCase()));
  }

  if (key === 'today' || key === 'month' || key === '30d') {
    return applyAdminSalesPeriod(list, key);
  }

  return list;
}

function applyAdminVendasFilters(rows) {
  ensureAdminVendasFiltersState();

  const filters = state.adminVendasFilters;
  let filtered = Array.isArray(rows) ? [...rows] : [];

  const search = normalizeFilterText(filters.search);
  if (search) {
    filtered = filtered.filter((item) => {
      const blob = [
        item?.cliente_nome,
        item?.cliente_telefone,
        item?.kit_nome,
        item?.kit_brand,
        item?.vendedor_nome,
        item?.vendedor_email,
      ].map((entry) => normalizeFilterText(entry)).join(' ');
      return blob.includes(search);
    });
  }

  if (filters.vendedor_email && filters.vendedor_email !== 'all') {
    const seller = String(filters.vendedor_email).toLowerCase();
    filtered = filtered.filter((item) => String(item?.vendedor_email || '').toLowerCase() === seller);
  }

  if (state.adminViewAll && filters.franquia_id && filters.franquia_id !== 'all') {
    filtered = filtered.filter((item) => String(item?.franquia_id || '') === String(filters.franquia_id));
  }

  filtered = applyAdminSalesPeriod(filtered, filters.period);

  const minPrice = Number(filters.min_price);
  if (Number.isFinite(minPrice) && minPrice > 0) {
    filtered = filtered.filter((item) => getSaleValue(item) >= minPrice);
  }

  const maxPrice = Number(filters.max_price);
  if (Number.isFinite(maxPrice) && maxPrice > 0) {
    filtered = filtered.filter((item) => getSaleValue(item) <= maxPrice);
  }

  filtered = applyAdminSalesPreset(filtered, filters.preset);
  filtered = sortSalesRows(filtered, filters.sort);

  return filtered;
}

function applyRegularVendasFilters(rows) {
  const allRows = Array.isArray(rows) ? rows : [];

  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  if (!state.vendasPeriod) state.vendasPeriod = currentMonth;

  const filtered = state.vendasPeriod === 'all'
    ? allRows
    : allRows.filter((item) => toMonthKey(item?.created_at) === state.vendasPeriod);

  return sortSalesRows(filtered, 'recent');
}

function computeSalesSummary(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const totalVendido = list.reduce((acc, item) => acc + getSaleValue(item), 0);
  const qtd = list.length;
  const ticketMedio = qtd > 0 ? totalVendido / qtd : 0;
  const ultima = list[0] || null;

  return { totalVendido, qtd, ticketMedio, ultima };
}

function buildSalesRanking(rows) {
  const totals = new Map();

  (Array.isArray(rows) ? rows : []).forEach((item) => {
    const email = String(item?.vendedor_email || '').trim().toLowerCase();
    if (!email) return;

    const prev = totals.get(email) || { email, total: 0, qtd: 0 };
    prev.total += getSaleValue(item);
    prev.qtd += 1;
    totals.set(email, prev);
  });

  return [...totals.values()]
    .map((entry) => ({
      ...entry,
      ticket: entry.qtd > 0 ? entry.total / entry.qtd : 0,
      nome: entry.email.split('@')[0] || entry.email,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);
}

function buildFranquiaRanking(rows) {
  const totals = new Map();

  (Array.isArray(rows) ? rows : []).forEach((item) => {
    const key = String(item?.franquia_id || '').trim() || 'sem_franquia';
    const prev = totals.get(key) || { key, total: 0, qtd: 0 };
    prev.total += getSaleValue(item);
    prev.qtd += 1;
    totals.set(key, prev);
  });

  return [...totals.values()]
    .map((entry) => ({
      ...entry,
      nome: entry.key === 'sem_franquia' ? 'Sem franquia' : getFranquiaNameById(entry.key),
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);
}
function renderVendaCard(sale, index, options = {}) {
  const showSeller = Boolean(options.showSeller);
  const showFranquia = Boolean(options.showFranquia);

  const stagger = ['stagger-1', 'stagger-2', 'stagger-3', 'stagger-4', 'stagger-5', 'stagger-6'][Math.min(index, 5)];
  const waNum = digitsOnly(sale?.cliente_telefone);
  const firstName = String(sale?.cliente_nome || '').split(' ')[0] || 'cliente';
  const waLink = waNum
    ? `https://wa.me/55${waNum}?text=${encodeURIComponent(`Olá ${firstName}, parabéns pela aquisição do seu sistema solar!`)}`
    : '';

  return `
    <article class="metric-card venda-metric-card ${stagger} relative border border-neutral-800 hover:border-green-500/25 p-5 group transition-all duration-300 bg-[#080808]">
      <div class="absolute top-0 right-0 w-24 h-24 bg-green-500/4 rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>

      <div class="relative z-10 flex items-start gap-4">
        <div class="shrink-0 w-11 h-11 rounded-full bg-gradient-to-br from-green-600 to-emerald-400 flex items-center justify-center text-black shadow-[0_0_12px_rgba(34,197,94,0.25)] ring-2 ring-black">
          <i data-lucide="trophy" class="w-5 h-5"></i>
        </div>

        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap mb-1">
            <h3 class="text-white font-black text-sm uppercase truncate group-hover:text-green-400 transition-colors leading-tight">${escapeHTML(sale?.cliente_nome || '-')}</h3>
            <span class="text-[8px] px-2 py-0.5 uppercase font-black tracking-widest border bg-green-500/10 text-green-400 border-green-500/30 shrink-0">FECHADO</span>
          </div>

          <div class="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-neutral-600 font-mono mb-2">
            <span class="flex items-center gap-1"><i data-lucide="zap" class="w-2.5 h-2.5"></i>${escapeHTML(sale?.kit_nome || '-')}</span>
            ${sale?.kit_power ? `<span class="flex items-center gap-1"><i data-lucide="sun" class="w-2.5 h-2.5"></i>${escapeHTML(String(sale.kit_power))} kWp</span>` : ''}
            <span class="flex items-center gap-1"><i data-lucide="calendar" class="w-2.5 h-2.5"></i>${formatDate(sale?.created_at)}</span>
            ${showSeller && sale?.vendedor_email ? `<span class="flex items-center gap-1 text-purple-400 font-bold"><i data-lucide="user" class="w-2.5 h-2.5"></i>${escapeHTML(String(sale.vendedor_email).split('@')[0])}</span>` : ''}
            ${showFranquia && sale?.franquia_id ? `<span class="flex items-center gap-1 text-cyan-300 font-bold"><i data-lucide="building-2" class="w-2.5 h-2.5"></i>${escapeHTML(getFranquiaNameById(sale.franquia_id))}</span>` : ''}
          </div>

          <p class="text-green-400 font-black text-lg leading-none">${formatCurrency(getSaleValue(sale))}</p>
        </div>

        <div class="shrink-0 flex flex-col items-end gap-1">
          ${waLink
            ? `<a href="${waLink}" target="_blank" rel="noopener noreferrer" class="btn btn-primary btn-sm"><i data-lucide="message-circle"></i> WhatsApp</a>`
            : ''}
          ${state.isAdmin ? `<button onclick="deleteVenda('${sale.id}')" class="btn btn-danger btn-sm"><i data-lucide="trash-2"></i> Excluir</button>` : ''}
          <p class="text-neutral-700 text-[9px] font-mono uppercase">${escapeHTML(sale?.kit_brand || '')}</p>
        </div>
      </div>
    </article>
  `;
}

function renderAdminVendasToolbar(sourceRows, filteredRows) {
  ensureAdminVendasFiltersState();
  const filters = state.adminVendasFilters;
  const options = getAdminSalesFilterOptions(sourceRows);

  const sellersOptions = options.vendedores
    .map((seller) => `<option value="${escapeHTML(seller.email)}" ${filters.vendedor_email === seller.email ? 'selected' : ''}>${escapeHTML(seller.nome)}</option>`)
    .join('');

  const monthPeriodOptions = options.months
    .map((month) => `<option value="${month}" ${filters.period === month ? 'selected' : ''}>${formatMonthLabel(month).toUpperCase()}</option>`)
    .join('');

  const adminScopeLabel = state.adminViewAll
    ? (String(state.adminScopeFranquiaId || 'all') === 'all' ? 'Consolidado: todas as franquias' : `Consolidado: ${getFranquiaNameById(state.adminScopeFranquiaId)}`)
    : `Minha Unidade: ${state.franquiaNome || 'franquia do administrador'}`;

  const scopeSelect = state.adminViewAll
    ? `<label class="w-full sm:w-auto min-w-[220px]">
         <span class="text-[8px] text-neutral-600 font-black uppercase tracking-widest block mb-1">Recorte global</span>
         <select onchange="setAdminScopeFranquia(this.value)" class="w-full bg-black border border-neutral-800 text-neutral-300 px-3 py-2.5 text-[10px] font-black uppercase tracking-widest">
           <option value="all">TODAS AS FRANQUIAS</option>
           ${getAdminScopeFranquiaOptionsFromSales(sourceRows).map((f) => `<option value="${f.id}" ${String(state.adminScopeFranquiaId || 'all') === String(f.id) ? 'selected' : ''}>${escapeHTML(f.nome)}</option>`).join('')}
         </select>
       </label>`
    : '';

  const franchiseSelect = state.adminViewAll
    ? `<label>
         <span class="text-[8px] text-neutral-600 font-black uppercase tracking-widest block mb-1">Franquia</span>
         <select onchange="setAdminVendasFilter('franquia_id', this.value)" class="w-full bg-black border border-neutral-800 text-neutral-300 px-3 py-2.5 text-[10px] font-black uppercase tracking-widest">
           <option value="all">TODAS</option>
           ${options.franquias.map((f) => `<option value="${f.id}" ${String(filters.franquia_id) === String(f.id) ? 'selected' : ''}>${escapeHTML(f.nome)}</option>`).join('')}
         </select>
       </label>`
    : '';

  return `
    <section class="relative bg-[#080808] bg-grid overflow-hidden p-6 md:p-8 border border-neutral-800 mb-2">
      <div class="absolute inset-0 pointer-events-none">
        <div class="absolute -top-10 -left-10 w-48 h-48 bg-green-600/10 rounded-full blur-3xl"></div>
        <div class="absolute -bottom-8 -right-8 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl"></div>
      </div>

      <div class="relative z-10 flex flex-col xl:flex-row xl:items-end justify-between gap-4">
        <div>
          <p class="text-green-400 text-[10px] font-black uppercase tracking-[0.3em] mb-1 flex items-center gap-2"><i data-lucide="trophy" class="w-3.5 h-3.5"></i> VENDAS ADMIN</p>
          <h2 class="text-2xl md:text-3xl font-black text-white uppercase tracking-tighter leading-none">Vendas <span class="text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-300">${filteredRows.length}</span></h2>
          <p class="text-neutral-500 text-[10px] font-bold uppercase tracking-widest mt-1">${adminScopeLabel} · Base ${sourceRows.length}</p>
        </div>

        <div class="flex items-center gap-2 flex-wrap">
          ${scopeSelect}
          <button onclick="exportVendasXLSX()" class="btn btn-ghost btn-sm"><i data-lucide="download"></i> XLSX</button>
        </div>
      </div>

      <div class="relative z-10 mt-4 pt-4 border-t border-neutral-800/60 space-y-3">
        <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-2.5">
          <label class="sm:col-span-2 xl:col-span-2">
            <span class="text-[8px] text-neutral-600 font-black uppercase tracking-widest block mb-1">Busca global</span>
            <input id="admin-vendas-search" type="text" value="${escapeHTML(filters.search || '')}" oninput="handleAdminVendasSearchInput(this.value)" placeholder="Cliente, kit, vendedor" class="w-full bg-black border border-neutral-800 text-white px-3 py-2.5 text-[11px] font-bold tracking-wide">
          </label>

          <label>
            <span class="text-[8px] text-neutral-600 font-black uppercase tracking-widest block mb-1">Vendedor</span>
            <select onchange="setAdminVendasFilter('vendedor_email', this.value)" class="w-full bg-black border border-neutral-800 text-neutral-300 px-3 py-2.5 text-[10px] font-black uppercase tracking-widest">
              <option value="all">TODOS</option>
              ${sellersOptions}
            </select>
          </label>

          ${franchiseSelect}

          <label>
            <span class="text-[8px] text-neutral-600 font-black uppercase tracking-widest block mb-1">Período</span>
            <select onchange="setAdminVendasFilter('period', this.value)" class="w-full bg-black border border-neutral-800 text-neutral-300 px-3 py-2.5 text-[10px] font-black uppercase tracking-widest">
              <option value="all" ${filters.period === 'all' ? 'selected' : ''}>GERAL</option>
              <option value="today" ${filters.period === 'today' ? 'selected' : ''}>HOJE</option>
              <option value="month" ${filters.period === 'month' ? 'selected' : ''}>MÊS ATUAL</option>
              <option value="30d" ${filters.period === '30d' ? 'selected' : ''}>ÚLTIMOS 30D</option>
              ${monthPeriodOptions}
            </select>
          </label>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-2.5 items-end">
          <label>
            <span class="text-[8px] text-neutral-600 font-black uppercase tracking-widest block mb-1">Valor mínimo (R$)</span>
            <input type="number" min="0" step="0.01" value="${escapeHTML(String(filters.min_price || ''))}" onchange="setAdminVendasFilter('min_price', this.value)" class="w-full bg-black border border-neutral-800 text-neutral-300 px-3 py-2.5 text-[11px] font-bold">
          </label>

          <label>
            <span class="text-[8px] text-neutral-600 font-black uppercase tracking-widest block mb-1">Valor máximo (R$)</span>
            <input type="number" min="0" step="0.01" value="${escapeHTML(String(filters.max_price || ''))}" onchange="setAdminVendasFilter('max_price', this.value)" class="w-full bg-black border border-neutral-800 text-neutral-300 px-3 py-2.5 text-[11px] font-bold">
          </label>

          <label>
            <span class="text-[8px] text-neutral-600 font-black uppercase tracking-widest block mb-1">Ordenação</span>
            <select onchange="setAdminVendasFilter('sort', this.value)" class="w-full bg-black border border-neutral-800 text-neutral-300 px-3 py-2.5 text-[10px] font-black uppercase tracking-widest">
              ${SALES_SORT_OPTIONS.map((opt) => `<option value="${opt.v}" ${filters.sort === opt.v ? 'selected' : ''}>${opt.l.toUpperCase()}</option>`).join('')}
            </select>
          </label>

          <div class="sm:col-span-2 flex flex-wrap gap-1">
            ${ADMIN_SALES_PRESETS.map((preset) => {
              const active = String(filters.preset || 'all') === preset.v;
              return `<button onclick="setAdminVendasPreset('${preset.v}')" class="px-3 py-2 text-[9px] font-black uppercase tracking-widest border ${active ? 'bg-blue-600 text-white border-blue-500' : 'bg-black text-neutral-500 border-neutral-800 hover:text-white'}">${preset.l}</button>`;
            }).join('')}
            <button onclick="resetAdminVendasFilters()" class="px-3 py-2 text-[9px] font-black uppercase tracking-widest border bg-black text-neutral-500 border-neutral-700 hover:border-neutral-500 hover:text-white ml-auto">Limpar</button>
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderSalesSummaryCards(summary) {
  return `
    <section class="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <article class="bg-neutral-900/60 border border-neutral-800 p-4"><p class="text-neutral-600 text-[9px] font-black uppercase tracking-widest mb-1">Total vendido</p><p class="text-2xl font-black text-green-400">${formatCurrency(summary.totalVendido)}</p></article>
      <article class="bg-neutral-900/60 border border-neutral-800 p-4"><p class="text-neutral-600 text-[9px] font-black uppercase tracking-widest mb-1">Ticket médio</p><p class="text-2xl font-black text-blue-400">${formatCurrency(summary.ticketMedio)}</p></article>
      <article class="bg-neutral-900/60 border border-neutral-800 p-4"><p class="text-neutral-600 text-[9px] font-black uppercase tracking-widest mb-1">Negócios fechados</p><p class="text-2xl font-black text-white">${summary.qtd}</p></article>
    </section>
  `;
}

function renderSalesRankingPanels(rows) {
  const topSellers = buildSalesRanking(rows);
  const topFranquias = buildFranquiaRanking(rows);

  return `
    <section class="grid grid-cols-1 xl:grid-cols-2 gap-3">
      <article class="border border-neutral-800 bg-[#080808] p-4">
        <h3 class="text-[10px] font-black text-white uppercase tracking-widest mb-3 flex items-center gap-2"><i data-lucide="medal" class="w-3.5 h-3.5 text-yellow-400"></i> Top vendedores do período</h3>
        <div class="flex flex-col gap-2">${topSellers.length > 0 ? topSellers.map((item, idx) => `<div class="flex items-center justify-between border border-neutral-800 px-3 py-2"><div><p class="text-[10px] font-black text-white uppercase tracking-wider">#${idx + 1} ${escapeHTML(item.nome)}</p><p class="text-[9px] text-neutral-600 font-bold">${item.qtd} venda(s) · ticket ${formatCurrency(item.ticket)}</p></div><p class="text-[11px] font-black text-green-400">${formatCurrency(item.total)}</p></div>`).join('') : '<p class="text-[10px] text-neutral-600 font-bold uppercase">Sem dados para ranking.</p>'}</div>
      </article>

      <article class="border border-neutral-800 bg-[#080808] p-4">
        <h3 class="text-[10px] font-black text-white uppercase tracking-widest mb-3 flex items-center gap-2"><i data-lucide="building-2" class="w-3.5 h-3.5 text-cyan-300"></i> Top franquias do período</h3>
        <div class="flex flex-col gap-2">${topFranquias.length > 0 ? topFranquias.map((item, idx) => `<div class="flex items-center justify-between border border-neutral-800 px-3 py-2"><div><p class="text-[10px] font-black text-white uppercase tracking-wider">#${idx + 1} ${escapeHTML(item.nome)}</p><p class="text-[9px] text-neutral-600 font-bold">${item.qtd} venda(s)</p></div><p class="text-[11px] font-black text-cyan-300">${formatCurrency(item.total)}</p></div>`).join('') : '<p class="text-[10px] text-neutral-600 font-bold uppercase">Sem dados para ranking.</p>'}</div>
      </article>
    </section>
  `;
}

function renderVendas(container) {
  container.className = 'flex flex-col gap-4';

  const sourceRows = state.isAdmin
    ? applyAdminGlobalScope(state.vendas || [])
    : (Array.isArray(state.vendas) ? state.vendas : []);

  const vendas = state.isAdmin
    ? applyAdminVendasFilters(sourceRows)
    : applyRegularVendasFilters(sourceRows);

  state.lastFilteredVendas = vendas;
  const summary = computeSalesSummary(vendas);

  let html = '';

  if (state.isAdmin) {
    html += renderAdminVendasToolbar(sourceRows, vendas);
    html += renderSalesSummaryCards(summary);
    html += renderSalesRankingPanels(vendas);
  } else {
    html += renderRegularVendasToolbar(sourceRows, vendas, summary);
  }

  if (vendas.length === 0) {
    html += `<div class="py-20 text-center border border-dashed border-neutral-800/60 bg-neutral-950/40"><i data-lucide="calendar-x" class="w-12 h-12 mx-auto mb-4 text-neutral-700"></i><p class="text-neutral-500 text-xs font-black uppercase tracking-widest mb-1">Nenhuma venda com os filtros atuais</p><p class="text-neutral-700 text-[10px] font-bold uppercase">Ajuste os filtros para visualizar resultados</p></div>`;
    container.innerHTML = html;
    lucide.createIcons();
    return;
  }

  const showSeller = state.isAdmin && state.adminViewAll;
  const showFranquia = state.isAdmin && state.adminViewAll;
  html += `<section class="flex flex-col gap-2">${vendas.map((sale, index) => renderVendaCard(sale, index, { showSeller, showFranquia })).join('')}</section>`;

  container.innerHTML = html;
  lucide.createIcons();
}
function renderRegularVendasToolbar(sourceRows, vendas, summary) {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const availableMonths = [...new Set((sourceRows || []).map((item) => toMonthKey(item?.created_at)).filter(Boolean))]
    .sort()
    .reverse();
  if (!availableMonths.includes(currentMonth)) availableMonths.unshift(currentMonth);

  const periodButtons = availableMonths.map((month) => {
    const active = state.vendasPeriod === month;
    const isCurrent = month === currentMonth;
    const cls = active
      ? (isCurrent ? 'bg-green-600 text-black border-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]' : 'bg-neutral-700 text-white border-neutral-600')
      : 'bg-transparent border-neutral-800 text-neutral-600 hover:text-neutral-300 hover:border-neutral-700';

    const label = `${formatMonthLabel(month)}${isCurrent ? ' ●' : ''}`;
    return `<button onclick="setVendasPeriod('${month}')" class="${cls} border px-2.5 py-1 font-black uppercase text-[8px] tracking-widest transition-all whitespace-nowrap">${label}</button>`;
  }).join('');

  return `
    <section class="relative bg-[#080808] bg-grid overflow-hidden p-6 md:p-8 border border-neutral-800">
      <div class="absolute inset-0 pointer-events-none">
        <div class="absolute -top-10 -left-10 w-48 h-48 bg-green-600/8 rounded-full blur-3xl"></div>
        <div class="absolute -bottom-8 -right-8 w-32 h-32 bg-yellow-500/6 rounded-full blur-3xl"></div>
      </div>

      <div class="relative z-10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <p class="text-green-400 text-[10px] font-black uppercase tracking-[0.3em] mb-1 flex items-center gap-2"><i data-lucide="trophy" class="w-3.5 h-3.5"></i> BOARD DE VENDAS FECHADAS</p>
          <h2 class="text-2xl md:text-3xl font-black text-white uppercase tracking-tighter leading-none">Minhas Vendas <span class="text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-300">${summary.qtd}</span></h2>
          <p class="text-neutral-600 text-[10px] font-bold uppercase tracking-widest mt-1">${summary.ultima ? `Última: ${formatDate(summary.ultima.created_at)}` : 'Nenhuma venda ainda'}</p>
        </div>
        <button onclick="exportVendasXLSX()" class="btn btn-ghost btn-sm"><i data-lucide="download"></i> XLSX</button>
      </div>

      <div class="relative z-10 flex flex-wrap items-center gap-1.5 mt-4 pt-4 border-t border-neutral-800/40">
        <span class="text-[8px] text-neutral-700 font-black uppercase tracking-widest mr-2">Período:</span>
        <button onclick="setVendasPeriod('all')" class="${state.vendasPeriod === 'all' ? 'bg-neutral-700 text-white border-neutral-600' : 'bg-transparent border-neutral-800 text-neutral-600 hover:text-neutral-300 hover:border-neutral-700'} border px-2.5 py-1 font-black uppercase text-[8px] tracking-widest transition-all">GERAL</button>
        ${periodButtons}
      </div>

      ${renderSalesSummaryCards(summary)}
    </section>
  `;
}

const _adminVendasSearchDebounced = debounce((value) => {
  setAdminVendasFilter('search', value);
}, 180);

function handleAdminVendasSearchInput(value) {
  _adminVendasSearchDebounced(String(value || ''));
}

function setAdminVendasFilter(key, value) {
  ensureAdminVendasFiltersState();
  const normalizedKey = String(key || '').trim();
  if (!normalizedKey) return;

  const nextValue = typeof value === 'string' ? value : String(value || '');
  state.adminVendasFilters[normalizedKey] = nextValue;

  persistAdminPreferences();
  renderContent();
}

function setAdminVendasPreset(preset) {
  ensureAdminVendasFiltersState();
  const normalized = String(preset || 'all');
  state.adminVendasFilters.preset = normalized;

  if (normalized === 'today' || normalized === 'month' || normalized === '30d') {
    state.adminVendasFilters.period = normalized;
  }

  persistAdminPreferences();
  renderContent();
}

function resetAdminVendasFilters() {
  state.adminVendasFilters = getDefaultAdminVendasFilters();
  persistAdminPreferences();
  renderContent();
}

function setVendasPeriod(period) {
  if (state.isAdmin) {
    setAdminVendasFilter('period', period);
    return;
  }

  state.vendasPeriod = period;
  renderContent();
}

function deleteVenda(id) {
  if (!state.isAdmin) return;

  showConfirmModal(
    'Tem certeza que deseja excluir esta venda? Esta ação não pode ser desfeita.',
    async () => {
      const vendaExcluida = (state.vendas || []).find((item) => item.id === id) || null;

      const { error } = await supabaseClient.from('vendas').delete().eq('id', id);
      if (error) {
        showToast('ERRO AO EXCLUIR VENDA: ' + error.message);
        return;
      }

      state.vendas = (state.vendas || []).filter((item) => item.id !== id);

      // Sem essa venda, o cliente não pode continuar "FECHADO" órfão:
      // se não sobrou nenhuma outra venda dele, volta para a etapa anterior.
      const clienteId = vendaExcluida?.cliente_id || null;
      if (clienteId && !(state.vendas || []).some((v) => v.cliente_id === clienteId)) {
        const cliente = (state.clientes || []).find((c) => c.id === clienteId);
        if (cliente && String(cliente.status).toUpperCase() === 'FECHADO') {
          const temProposta = (state.propostas || []).some((p) => p.cliente_id === clienteId);
          const novoStatus = temProposta ? 'PROPOSTA ENVIADA' : 'NOVO';
          const { error: statusError } = await supabaseClient.from('clientes').update({ status: novoStatus }).eq('id', clienteId);
          if (!statusError) {
            cliente.status = novoStatus;
            showToast(`VENDA EXCLUÍDA. Cliente voltou para ${novoStatus}.`);
            renderContent();
            return;
          }
          console.warn('[deleteVenda] Venda excluída, mas falhou ao reverter status do cliente.', statusError);
        }
      }

      showToast('VENDA EXCLUÍDA COM SUCESSO.');
      renderContent();
    },
    'EXCLUIR VENDA'
  );
}

function exportVendasXLSX() {
  const vendas = Array.isArray(state.lastFilteredVendas) ? state.lastFilteredVendas : [];
  if (vendas.length === 0) {
    showToast('Nenhuma venda para exportar.');
    return;
  }

  const columns = [
    { key: 'created_at', header: 'Data' },
    { key: 'cliente_nome', header: 'Cliente' },
    { key: 'cliente_telefone', header: 'Telefone' },
    { key: 'kit_nome', header: 'Kit' },
    { key: 'kit_brand', header: 'Marca' },
    { key: 'kit_power', header: 'Potência (kWp)' },
    { key: 'kit_price', header: 'Valor (R$)' },
    { key: 'franquia', header: 'Franquia' },
    { key: 'vendedor_nome', header: 'Vendedor' },
    { key: 'vendedor_email', header: 'E-mail Vendedor' },
  ];

  const rows = vendas.map((sale) => ({
    created_at: formatDate(sale?.created_at),
    cliente_nome: sale?.cliente_nome || '',
    cliente_telefone: sale?.cliente_telefone || '',
    kit_nome: sale?.kit_nome || '',
    kit_brand: sale?.kit_brand || '',
    kit_power: sale?.kit_power || '',
    kit_price: getSaleValue(sale),
    franquia: getFranquiaNameById(sale?.franquia_id),
    vendedor_nome: sale?.vendedor_nome || '',
    vendedor_email: sale?.vendedor_email || '',
  }));

  exportToXLSX(rows, columns, `vendas_${new Date().toISOString().split('T')[0]}`);
  showToast('EXPORTAÇÃO XLSX CONCLUÍDA!');
}


