// ==========================================
// RENDERIZADOR: DASHBOARD
// ==========================================

function getDashboardScopedRows(rows) {
  const list = Array.isArray(rows) ? rows : [];
  return state.isAdmin ? applyAdminGlobalScope(list) : list;
}

// --- Filtro por vendedor (client-side sobre os dados já escopados) ---
// Admin/gestor já recebem em memória as linhas de todos os vendedores do
// escopo deles, então filtrar por vendedor_email não precisa de refetch.
function canUseDashVendedorFilter() {
  return state.isAdmin || (state.isGestor && state.gestorViewAll);
}

function getDashboardVendedorOptions(rowsList) {
  const emails = new Set();
  (Array.isArray(rowsList) ? rowsList : []).forEach((rows) => {
    (Array.isArray(rows) ? rows : []).forEach((item) => {
      const email = String(item?.vendedor_email || '').trim().toLowerCase();
      if (email) emails.add(email);
    });
  });
  return [...emails].sort();
}

function applyDashboardVendedorFilter(rows) {
  const selected = String(state.dashVendedor || 'all').toLowerCase();
  if (selected === 'all' || !canUseDashVendedorFilter()) return rows;
  return rows.filter((item) => String(item?.vendedor_email || '').trim().toLowerCase() === selected);
}

function setDashVendedor(email) {
  state.dashVendedor = String(email || 'all').toLowerCase();
  renderContent();
}

function dashVendedorNome(email) {
  const base = String(email || '').split('@')[0];
  if (!base) return email;
  return base.split(/[._-]/).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}

function getDashboardVendedorSelectorHTML(options) {
  if (!canUseDashVendedorFilter()) return '';
  const selected = String(state.dashVendedor || 'all').toLowerCase();
  const filtrado = selected !== 'all';
  return `
    <label>
      <select onchange="setDashVendedor(this.value)" class="bg-black border ${filtrado ? 'border-orange-500/60 text-orange-400' : 'border-neutral-800 text-neutral-300'} px-2.5 py-1 text-[8px] font-black uppercase tracking-widest">
        <option value="all">TODOS VENDEDORES</option>
        ${options.map((email) => `<option value="${escapeHTML(email)}" ${selected === email ? 'selected' : ''}>${escapeHTML(dashVendedorNome(email).toUpperCase())}</option>`).join('')}
      </select>
    </label>
  `;
}

function toPrevMonthKey(monthKey) {
  const [y, m] = String(monthKey || '').split('-').map(Number);
  if (!y || !m) return '';
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Chip "+X% vs mês ant.". Sem base de comparação (mês anterior zerado) ou em
// GERAL não mostra nada — delta enganoso é pior que delta ausente.
function dashDeltaChip(current, previous) {
  if (state.dashPeriod === 'all' || !previous) return '';
  const delta = ((current - previous) / previous) * 100;
  const up = delta >= 0.5;
  const down = delta <= -0.5;
  const cls = up
    ? 'text-green-400 bg-green-500/10 border-green-500/25'
    : down
      ? 'text-red-400 bg-red-500/10 border-red-500/25'
      : 'text-neutral-500 bg-neutral-500/10 border-neutral-600/25';
  const icon = up ? 'trending-up' : down ? 'trending-down' : 'minus';
  return `<span class="inline-flex items-center gap-1 text-[8px] font-black tracking-wider px-1.5 py-0.5 border ${cls}"><i data-lucide="${icon}" class="w-2.5 h-2.5 shrink-0"></i>${delta >= 0 ? '+' : ''}${delta.toFixed(0)}% vs mês ant.</span>`;
}

function getDashboardMonthRange(monthKey) {
  const now = new Date();
  const [yearRaw, monthRaw] = String(monthKey || '').split('-');
  const year = Number(yearRaw) || now.getFullYear();
  const month = Number(monthRaw) || (now.getMonth() + 1);

  const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const end = new Date(year, month, 0, 23, 59, 59, 999);
  const prevStart = new Date(year, month - 2, 1, 0, 0, 0, 0);
  const prevEnd = new Date(year, month - 1, 0, 23, 59, 59, 999);

  return { start, end, prevStart, prevEnd };
}

function isDateWithinDashboardRange(dateString, start, end) {
  const date = new Date(dateString || 0);
  if (Number.isNaN(date.getTime())) return false;
  return date >= start && date <= end;
}

function getDashboardScopeSelectorHTML(baseRows) {
  if (!state.isAdmin || !state.adminViewAll) return '';

  const ids = [...new Set(
    (Array.isArray(baseRows) ? baseRows : [])
      .map((item) => String(item?.franquia_id || '').trim())
      .filter(Boolean)
      .concat((state.franquiasCatalog || []).map((item) => String(item?.id || '').trim()).filter(Boolean))
  )].sort((a, b) => getFranquiaNameById(a).localeCompare(getFranquiaNameById(b)));

  return `
    <label class="ml-2">
      <select onchange="setAdminScopeFranquia(this.value)" class="bg-black border border-neutral-800 text-neutral-300 px-2.5 py-1 text-[8px] font-black uppercase tracking-widest">
        <option value="all">TODAS FRANQUIAS</option>
        ${ids.map((id) => `<option value="${id}" ${String(state.adminScopeFranquiaId || 'all') === String(id) ? 'selected' : ''}>${escapeHTML(getFranquiaNameById(id))}</option>`).join('')}
      </select>
    </label>
  `;
}

// Métricas da faixa de análise (admin sempre; gestor com "minha unidade").
// periodKey aceita 'all' (GERAL = toda a base, sem deltas) — antes caía
// silenciosamente no mês corrente e descasava dos cards de cima.
// clientesRows/propostasRows/vendasRows JÁ vêm com o filtro de vendedor;
// vendasEscopoRows vem SEM ele (ranking de vendedores com 1 nome é inútil).
function buildDashboardAdminMetrics(periodKey, clientesRows, propostasRows, vendasRows, vendasEscopoRows) {
  const geral = periodKey === 'all';
  const range = geral ? null : getDashboardMonthRange(periodKey);
  const noPeriodo = (rows) => geral
    ? rows
    : rows.filter((item) => isDateWithinDashboardRange(item?.created_at, range.start, range.end));
  const noAnterior = (rows) => geral
    ? []
    : rows.filter((item) => isDateWithinDashboardRange(item?.created_at, range.prevStart, range.prevEnd));

  const clientesPeriodo = noPeriodo(clientesRows);
  const propostasPeriodo = noPeriodo(propostasRows);
  const vendasPeriodo = noPeriodo(vendasRows);

  const clientesPrev = noAnterior(clientesRows);
  const propostasPrev = noAnterior(propostasRows);
  const vendasPrev = noAnterior(vendasRows);

  const receita = vendasPeriodo.reduce((sum, item) => sum + (Number(item?.kit_price) || 0), 0);
  const receitaPrev = vendasPrev.reduce((sum, item) => sum + (Number(item?.kit_price) || 0), 0);
  const ticket = vendasPeriodo.length > 0 ? receita / vendasPeriodo.length : 0;
  const ticketPrev = vendasPrev.length > 0 ? receitaPrev / vendasPrev.length : 0;

  // Taxa proposta→venda do MESMO recorte; null = n/d (sem propostas na base)
  const propostaToVenda = propostasPeriodo.length > 0
    ? Math.round((vendasPeriodo.length / propostasPeriodo.length) * 100)
    : null;

  const topSellerMap = new Map();
  const topFranchiseMap = new Map();

  const vendasRanking = noPeriodo(Array.isArray(vendasEscopoRows) ? vendasEscopoRows : vendasRows);
  vendasRanking.forEach((sale) => {
    const email = String(sale?.vendedor_email || '').trim().toLowerCase();
    const franquiaId = String(sale?.franquia_id || '').trim() || 'sem_franquia';
    const value = Number(sale?.kit_price) || 0;

    if (email) {
      const prev = topSellerMap.get(email) || { email, total: 0, qtd: 0 };
      prev.total += value;
      prev.qtd += 1;
      topSellerMap.set(email, prev);
    }

    const prevFr = topFranchiseMap.get(franquiaId) || { franquiaId, total: 0, qtd: 0 };
    prevFr.total += value;
    prevFr.qtd += 1;
    topFranchiseMap.set(franquiaId, prevFr);
  });

  const topSellers = [...topSellerMap.values()]
    .sort((a, b) => b.total - a.total)
    .slice(0, 5)
    .map((item) => ({
      ...item,
      nome: dashVendedorNome(item.email),
      ticket: item.qtd > 0 ? item.total / item.qtd : 0,
    }));

  const topFranchises = [...topFranchiseMap.values()]
    .sort((a, b) => b.total - a.total)
    .slice(0, 3)
    .map((item) => ({
      ...item,
      nome: item.franquiaId === 'sem_franquia' ? 'Sem franquia' : getFranquiaNameById(item.franquiaId),
    }));

  const now = new Date();
  // Fonte única com a fila do dia (crm-fila.js): as duas telas cobram "parado"
  // pela mesma régua.
  const aging = CRM_AGING_LIMITS.map((entry) => {
    const qty = clientesRows.filter((client) => {
      if ((client?.status || 'NOVO') !== entry.status) return false;
      const created = new Date(client?.created_at || 0);
      if (Number.isNaN(created.getTime())) return false;
      const diffDays = Math.floor((now.getTime() - created.getTime()) / 86400000);
      return diffDays > entry.limit;
    }).length;

    return { ...entry, qty };
  });

  return {
    geral,
    receita,
    receitaPrev,
    propostas: propostasPeriodo.length,
    propostasPrev: propostasPrev.length,
    vendas: vendasPeriodo.length,
    vendasPrev: vendasPrev.length,
    clientes: clientesPeriodo.length,
    clientesPrev: clientesPrev.length,
    propostaToVenda,
    ticket,
    ticketPrev,
    topSellers,
    topFranchises,
    aging,
  };
}

function renderDashboardAdminSection(metrics) {
  // sublinha do KPI: em GERAL = "toda a base"; num mês = chip de delta (ou nada sem base)
  const kpiSub = (current, previous, fallback) => {
    if (metrics.geral) return '<p class="text-[9px] text-neutral-600 font-bold">toda a base</p>';
    const chip = dashDeltaChip(current, previous);
    return chip ? `<p class="mt-0.5">${chip}</p>` : `<p class="text-[9px] text-neutral-600 font-bold">${fallback}</p>`;
  };

  const selectedVendedor = String(state.dashVendedor || 'all').toLowerCase();
  const topSellersHTML = metrics.topSellers.length > 0
    ? metrics.topSellers.map((item, idx) => {
      const isSelected = selectedVendedor === item.email;
      const encoded = encodeURIComponent(item.email);
      return `<div onclick="setDashVendedor(decodeURIComponent('${isSelected ? 'all' : encoded}'))"
          class="flex items-center justify-between border px-3 py-2 cursor-pointer transition-all ${isSelected ? 'border-orange-500/60 bg-orange-500/5' : 'border-neutral-800 hover:border-neutral-600'}">
          <div>
            <p class="text-[10px] font-black text-white uppercase tracking-wider">#${idx + 1} ${escapeHTML(item.nome)}${isSelected ? ' <span class="text-orange-400">· filtrando</span>' : ''}</p>
            <p class="text-[9px] text-neutral-600 font-bold">${item.qtd} venda${item.qtd > 1 ? 's' : ''} · ticket ${formatCurrency(item.ticket)}</p>
          </div>
          <p class="text-[10px] font-black text-green-400 tabular-nums">${formatCurrency(item.total)}</p>
        </div>`;
    }).join('')
    : '<p class="text-[10px] text-neutral-600 font-bold uppercase">Sem vendas no recorte.</p>';

  const mostraTopFranquias = state.isAdmin && state.adminViewAll && String(state.adminScopeFranquiaId || 'all') === 'all';
  const topFranchisesHTML = metrics.topFranchises.length > 0
    ? metrics.topFranchises.map((item, idx) => `<div class="flex items-center justify-between border border-neutral-800 px-3 py-2"><div><p class="text-[10px] font-black text-white uppercase tracking-wider">#${idx + 1} ${escapeHTML(item.nome)}</p><p class="text-[9px] text-neutral-600 font-bold">${item.qtd} venda${item.qtd > 1 ? 's' : ''}</p></div><p class="text-[10px] font-black text-cyan-300 tabular-nums">${formatCurrency(item.total)}</p></div>`).join('')
    : '<p class="text-[10px] text-neutral-600 font-bold uppercase">Sem vendas no recorte.</p>';

  const agingScopeLabel = selectedVendedor !== 'all' && canUseDashVendedorFilter()
    ? 'de ' + escapeHTML(dashVendedorNome(selectedVendedor))
    : 'todo o recorte';
  const agingHTML = metrics.aging
    .map((item) => `<div class="flex items-center justify-between border border-neutral-800 px-3 py-2"><span class="text-[10px] font-black uppercase tracking-widest text-neutral-300">${escapeHTML(item.status)} <span class="text-neutral-700">+${item.limit}d</span></span><span class="text-[10px] font-black tabular-nums ${item.qty > 0 ? 'text-red-400' : 'text-green-400'}">${item.qty}</span></div>`)
    .join('');

  return `
    <div class="grid grid-cols-1 ${mostraTopFranquias ? 'xl:grid-cols-3' : 'xl:grid-cols-2'} gap-3 stagger-4">
      <section class="${mostraTopFranquias ? 'xl:col-span-3' : 'xl:col-span-2'} grid grid-cols-2 lg:grid-cols-5 gap-2 border border-neutral-800/60 p-4" style="background: linear-gradient(135deg, #0d0d0d 0%, #080808 100%);">
        <article class="border border-neutral-800 p-3"><p class="text-[8px] text-neutral-600 font-black uppercase tracking-widest">Receita no recorte</p><p class="text-lg font-black text-green-400 tabular-nums">${formatCurrency(metrics.receita)}</p>${kpiSub(metrics.receita, metrics.receitaPrev, 'sem base de comparação')}</article>
        <article class="border border-neutral-800 p-3"><p class="text-[8px] text-neutral-600 font-black uppercase tracking-widest">Propostas</p><p class="text-lg font-black text-orange-400 tabular-nums">${metrics.propostas}</p>${kpiSub(metrics.propostas, metrics.propostasPrev, 'sem base de comparação')}</article>
        <article class="border border-neutral-800 p-3"><p class="text-[8px] text-neutral-600 font-black uppercase tracking-widest">Propostas → Vendas</p><p class="text-lg font-black text-purple-400 tabular-nums">${metrics.propostaToVenda === null ? 'n/d' : metrics.propostaToVenda + '%'}</p><p class="text-[9px] text-neutral-600 font-bold">${metrics.vendas} venda${metrics.vendas === 1 ? '' : 's'} / ${metrics.propostas} proposta${metrics.propostas === 1 ? '' : 's'}</p></article>
        <article class="border border-neutral-800 p-3"><p class="text-[8px] text-neutral-600 font-black uppercase tracking-widest">Ticket médio</p><p class="text-lg font-black text-blue-400 tabular-nums">${formatCurrency(metrics.ticket)}</p>${kpiSub(metrics.ticket, metrics.ticketPrev, 'sem base de comparação')}</article>
        <article class="border border-neutral-800 p-3"><p class="text-[8px] text-neutral-600 font-black uppercase tracking-widest">Clientes novos</p><p class="text-lg font-black text-white tabular-nums">${metrics.clientes}</p>${kpiSub(metrics.clientes, metrics.clientesPrev, 'sem base de comparação')}</article>
      </section>

      <section class="border border-neutral-800/60 p-4" style="background:#0b0b0b;">
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-[10px] font-black text-white uppercase tracking-widest">Vendedores no recorte</h3>
          <span class="text-[8px] text-neutral-700 font-bold uppercase tracking-widest hidden md:inline">clique para filtrar</span>
        </div>
        <div class="flex flex-col gap-2">${topSellersHTML}</div>
      </section>
      ${mostraTopFranquias ? `<section class="border border-neutral-800/60 p-4" style="background:#0b0b0b;"><h3 class="text-[10px] font-black text-white uppercase tracking-widest mb-3">Franquias no recorte</h3><div class="flex flex-col gap-2">${topFranchisesHTML}</div></section>` : ''}
      <section class="border border-neutral-800/60 p-4" style="background:#0b0b0b;">
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-[10px] font-black text-white uppercase tracking-widest">Clientes parados</h3>
          <span class="text-[8px] text-neutral-700 font-bold uppercase tracking-widest">${agingScopeLabel}</span>
        </div>
        <div class="flex flex-col gap-2">${agingHTML}</div>
      </section>
    </div>
  `;
}
function renderDashboard(container) {
  container.className = 'flex flex-col gap-5 w-full';

  // --- Dados ---
  // Pipeline de filtragem: escopo do papel → franquia (admin) → vendedor → período
  const clientesScope = getDashboardScopedRows(state.clientes || []);
  const propostasScope = getDashboardScopedRows(state.propostas || []);
  const vendasScope = getDashboardScopedRows(state.vendas || []);

  // Opções do filtro de vendedor derivam do ESCOPO (antes do filtro de vendedor)
  const vendedorOptions = getDashboardVendedorOptions([clientesScope, propostasScope, vendasScope]);
  if (String(state.dashVendedor || 'all').toLowerCase() !== 'all'
      && !vendedorOptions.includes(String(state.dashVendedor).toLowerCase())) {
    state.dashVendedor = 'all'; // vendedor fora do escopo atual (ex.: trocou de franquia)
  }

  const clientesDash = applyDashboardVendedorFilter(clientesScope);
  const propostasDash = applyDashboardVendedorFilter(propostasScope);
  const allVendasDash = applyDashboardVendedorFilter(vendasScope);

  const totalClientes = clientesDash.length;

  // Funil = snapshot da carteira inteira do recorte (imune ao período)
  const funil = { 'NOVO': 0, 'PROPOSTA ENVIADA': 0, 'EM NEGOCIAÇÃO': 0, 'FECHADO': 0 };
  clientesDash.forEach((c) => {
    const s = c.status || 'NOVO';
    if (funil[s] !== undefined) funil[s]++;
    else funil.NOVO++;
  });

  const nowDash = new Date();
  const dashCurrMonth = `${nowDash.getFullYear()}-${String(nowDash.getMonth() + 1).padStart(2, '0')}`;
  if (!state.dashPeriod) state.dashPeriod = dashCurrMonth;

  // Meses disponíveis: união clientes ∪ propostas ∪ vendas (só vendas deixava
  // mês com propostas e sem vendas inselecionável)
  const availMonthsDash = [...new Set(
    [...clientesDash, ...propostasDash, ...allVendasDash].map((r) => toMonthKey(r.created_at)).filter(Boolean)
  )].sort().reverse();
  if (!availMonthsDash.includes(dashCurrMonth)) availMonthsDash.unshift(dashCurrMonth);
  if (state.dashPeriod !== 'all' && !availMonthsDash.includes(state.dashPeriod)) state.dashPeriod = dashCurrMonth;

  // Partição por período — TODOS os cards obedecem (antes Propostas ignorava)
  const _dashGeralAtivo = state.dashPeriod === 'all';
  const dashPrevKey = _dashGeralAtivo ? '' : toPrevMonthKey(state.dashPeriod);
  const byMonth = (rows, mk) => rows.filter((r) => toMonthKey(r.created_at) === mk);

  const clientesPer  = _dashGeralAtivo ? clientesDash  : byMonth(clientesDash, state.dashPeriod);
  const propostasPer = _dashGeralAtivo ? propostasDash : byMonth(propostasDash, state.dashPeriod);
  const vendasDashFilt = _dashGeralAtivo ? allVendasDash : byMonth(allVendasDash, state.dashPeriod);
  const clientesPrev  = _dashGeralAtivo ? [] : byMonth(clientesDash, dashPrevKey);
  const propostasPrev = _dashGeralAtivo ? [] : byMonth(propostasDash, dashPrevKey);
  const vendasPrevArr = _dashGeralAtivo ? [] : byMonth(allVendasDash, dashPrevKey);

  // Botões de período pré-calculados
  const _dashBtns = availMonthsDash.map(m => {
    const ativo   = state.dashPeriod === m;
    const ehAtual = m === dashCurrMonth;
    const cls = ativo
      ? (ehAtual ? 'bg-orange-600 text-black border-orange-500 shadow-[0_0_8px_rgba(234,88,12,0.4)]' : 'bg-neutral-700 text-white border-neutral-600')
      : 'bg-transparent border-neutral-800 text-neutral-600 hover:text-neutral-300 hover:border-neutral-700';
    const label = formatMonthLabel(m) + (ehAtual ? ' ●' : '');
    return `<button onclick="setDashPeriod('${m}')" class="${cls} border px-2.5 py-1 font-black uppercase text-[8px] tracking-widest transition-all whitespace-nowrap">${label}</button>`;
  }).join('');
  const dashScopeSelectorHTML = getDashboardScopeSelectorHTML([...clientesScope, ...propostasScope, ...vendasScope]);
  const dashVendedorSelectorHTML = getDashboardVendedorSelectorHTML(vendedorOptions);

  const totalVendido = vendasDashFilt.reduce((s, v) => s + (Number(v.kit_price) || 0), 0);
  const totalVendidoPrev = vendasPrevArr.reduce((s, v) => s + (Number(v.kit_price) || 0), 0);
  const qtdVendas = vendasDashFilt.length;
  const ticketMedio = qtdVendas > 0 ? totalVendido / qtdVendas : 0;
  const ticketMedioPrev = vendasPrevArr.length > 0 ? totalVendidoPrev / vendasPrevArr.length : 0;

  // Conversão honesta: propostas → vendas do MESMO recorte; sem propostas = n/d
  // (a antiga vendas÷clientes-criados podia passar de 100%)
  const convPV = propostasPer.length > 0 ? Math.round((qtdVendas / propostasPer.length) * 100) : null;
  const convPVLabel = convPV === null ? 'n/d' : convPV + '%';

  // Percentuais do funil (relativo ao total de clientes)
  const maxF   = totalClientes || 1;
  const fPct   = k => Math.round((funil[k] / maxF) * 100);
  const fWidth = k => Math.max(fPct(k), 2); // mínimo visual de 2%

  // Taxa de avanço entre etapas
  const toNum = (a, b) => funil[a] > 0 ? Math.round((funil[b] / funil[a]) * 100) : 0;
  const convProp = toNum('NOVO', 'PROPOSTA ENVIADA');
  const convNeg = toNum('PROPOSTA ENVIADA', 'EM NEGOCIAÇÃO');
  const convFech = toNum('EM NEGOCIAÇÃO', 'FECHADO');

  // Contexto exibido na barra de filtros
  const ctxPeriodo = _dashGeralAtivo ? 'GERAL (toda a base)' : formatMonthLabel(state.dashPeriod);
  const ctxFranquia = state.isAdmin
    ? (!state.adminViewAll
        ? (state.franquiaNome || 'Minha unidade')
        : (String(state.adminScopeFranquiaId || 'all') === 'all' ? 'Todas as franquias' : getFranquiaNameById(state.adminScopeFranquiaId)))
    : (state.franquiaNome || '');
  const dashVendSel = String(state.dashVendedor || 'all').toLowerCase();
  const vendedorFiltrado = dashVendSel !== 'all' && canUseDashVendedorFilter();
  const ctxVendedor = canUseDashVendedorFilter()
    ? (dashVendSel === 'all' ? 'Todos os vendedores' : dashVendedorNome(dashVendSel))
    : 'Minha carteira';

  // Faixa de análise: admin sempre; gestor quando vê a unidade inteira
  const mostraAnalise = state.isAdmin || (state.isGestor && state.gestorViewAll);
  const adminDashMetrics = mostraAnalise
    ? buildDashboardAdminMetrics(state.dashPeriod, clientesDash, propostasDash, allVendasDash, vendasScope)
    : null;

  // Saudação
  const greeting  = getGreeting();
  const firstName = getFirstName();
  const hoje      = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  const dateStr   = hoje.charAt(0).toUpperCase() + hoje.slice(1);

  // Mural de comunicados (desacoplado da UI da home)
  const HOME_COMUNICADOS_PAGE_SIZE = 2;
  if (!Number.isFinite(Number(state.dashComunicadosPage)) || Number(state.dashComunicadosPage) < 0) {
    state.dashComunicadosPage = 0;
  }

  const comunicadosService = window.comunicadosService;
  const comunicadosOrdenados =
    comunicadosService && typeof comunicadosService.listPublished === 'function'
      ? comunicadosService.listPublished()
      : [];

  const totalComunicados = comunicadosOrdenados.length;
  const comunicadosTotalPages = Math.max(Math.ceil(totalComunicados / HOME_COMUNICADOS_PAGE_SIZE), 1);
  const currentComunicadosPage = Math.min(Number(state.dashComunicadosPage) || 0, comunicadosTotalPages - 1);
  state.dashComunicadosPage = currentComunicadosPage;

  const pageStart = currentComunicadosPage * HOME_COMUNICADOS_PAGE_SIZE;
  const comunicadosRecentes = comunicadosOrdenados.slice(pageStart, pageStart + HOME_COMUNICADOS_PAGE_SIZE);
  const canGoPrev = currentComunicadosPage > 0;
  const canGoNext = currentComunicadosPage < comunicadosTotalPages - 1;

  const rangeStart = totalComunicados === 0 ? 0 : pageStart + 1;
  const rangeEnd = totalComunicados === 0 ? 0 : pageStart + comunicadosRecentes.length;
  const comunicadosMetaLabel = totalComunicados > 0
    ? `<span class="text-[9px] text-neutral-600 font-bold">PÁG ${currentComunicadosPage + 1}/${comunicadosTotalPages}</span>`
    : '';
  const comunicadosFooterLabel = totalComunicados === 0
    ? 'Sem comunicados publicados'
    : `Mostrando ${rangeStart}-${rangeEnd} de ${totalComunicados}`;

  const prevBtnClass = canGoPrev
    ? 'border border-neutral-700 text-neutral-300 hover:text-white hover:border-neutral-500 bg-neutral-900/80'
    : 'border border-neutral-900 text-neutral-700 bg-neutral-950/80 cursor-not-allowed';
  const nextBtnClass = canGoNext
    ? 'border border-neutral-700 text-neutral-300 hover:text-white hover:border-neutral-500 bg-neutral-900/80'
    : 'border border-neutral-900 text-neutral-700 bg-neutral-950/80 cursor-not-allowed';

  const comunicadosNavHTML = totalComunicados > HOME_COMUNICADOS_PAGE_SIZE
    ? `<div class="flex items-center gap-1.5">
        <button onclick="setDashComunicadosPage(${currentComunicadosPage - 1})" ${canGoPrev ? '' : 'disabled'}
          class="${prevBtnClass} p-1.5 transition-all" aria-label="Ver comunicados mais recentes">
          <i data-lucide="chevron-left" class="w-3.5 h-3.5"></i>
        </button>
        <button onclick="setDashComunicadosPage(${currentComunicadosPage + 1})" ${canGoNext ? '' : 'disabled'}
          class="${nextBtnClass} p-1.5 transition-all" aria-label="Ver comunicados anteriores">
          <i data-lucide="chevron-right" class="w-3.5 h-3.5"></i>
        </button>
      </div>`
    : '';

  let comunicadosHTML = '';
  if (comunicadosRecentes.length === 0) {
    comunicadosHTML = `
      <div class="py-10 px-4 text-center min-h-[198px] flex items-center justify-center">
        <div class="flex flex-col items-center gap-2.5">
          <i data-lucide="megaphone-off" class="w-8 h-8 text-neutral-800"></i>
          <span class="text-neutral-600 font-bold uppercase tracking-widest text-[10px]">Nenhum comunicado publicado</span>
          <span class="text-[10px] text-neutral-700">Cadastre novidades para preencher este mural.</span>
        </div>
      </div>`;
  } else {
    comunicadosHTML = comunicadosRecentes.map(item => {
      const titulo = escapeHTML(item.title || 'Comunicado sem título');
      const resumo = escapeHTML(item.summary || '');
      const tipo = escapeHTML(String(item.type || 'comunicado').toUpperCase());
      const dataRaw = item.publishedAt || item.createdAt || '';
      const dataFmt = dataRaw ? formatDate(dataRaw) : '-';
      const dataAttr = escapeHTML(String(dataRaw));
      const imagem = safeImageUrl(item.coverImageUrl, 'assets/img/logo.png');
      const autor = item.authorName
        ? `<span class="text-[8px] text-neutral-600 font-bold">Por ${escapeHTML(item.authorName)}</span>`
        : '';
      const encodedId = encodeURIComponent(String(item.id || ''));

      return `
        <article role="button" tabindex="0" onclick="openDashComunicadoModalById('${encodedId}')" onkeydown="handleDashComunicadoCardKey(event, '${encodedId}')" aria-label="Abrir comunicado: ${titulo}" class="group flex items-start gap-3 p-3 hover:bg-neutral-900/30 transition-all border-b border-neutral-900/80 last:border-b-0 min-h-[98px] cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-orange-400/80">
          <div class="w-24 h-16 bg-neutral-900 border border-neutral-800 overflow-hidden shrink-0">
            <img src="${imagem}" alt="${titulo}" loading="lazy" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" onerror="this.src='assets/img/logo-light.png';this.onerror=null;">
          </div>
          <div class="min-w-0 flex-1 flex flex-col gap-1.5">
            <div class="flex items-center justify-between gap-2">
              <span class="text-[8px] px-2 py-0.5 bg-blue-500/10 border border-blue-500/20 text-blue-400 font-black uppercase tracking-widest">${tipo}</span>
              <time datetime="${dataAttr}" class="text-[9px] text-neutral-600 font-bold shrink-0">${dataFmt}</time>
            </div>
            <h4 class="text-xs font-black text-white uppercase tracking-wide leading-tight overflow-hidden" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;">${titulo}</h4>
            <p class="text-[10px] text-neutral-400 leading-snug overflow-hidden" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;">${resumo}</p>
            ${autor}
          </div>
        </article>`;
    }).join('');
  }

  container.innerHTML = `
    <!-- ════════════════════════════════════════
         HERO HEADER compacto - saudação + escopo + relógio
         ════════════════════════════════════════ -->
    <div class="dash-hero stagger-1 relative overflow-hidden border border-neutral-800/60 px-5 py-4 md:px-6 md:py-5 group" style="background: linear-gradient(135deg, #0f0f0f 0%, #080808 100%);">
      <div class="absolute inset-0 bg-grid opacity-50 pointer-events-none"></div>
      <div class="absolute -right-16 -top-16 w-56 h-56 bg-orange-600/5 rounded-full blur-[70px] group-hover:bg-orange-600/8 transition-all duration-1000 pointer-events-none"></div>

      <div class="relative z-10 flex flex-wrap items-center justify-between gap-3">
        <div class="flex flex-col gap-1.5">
          <p class="text-[8px] font-black uppercase tracking-[0.35em] text-neutral-600">${dateStr}</p>
          <h2 class="text-xl md:text-2xl font-black text-white leading-none tracking-tight">
            ${greeting}${firstName
              ? `, <span class="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-yellow-300">${escapeHTML(firstName)}</span>.`
              : '.'}
          </h2>
          ${state.isAdmin
            ? `<div class="flex items-center gap-2 mt-1">
                <span class="text-[8px] px-2 py-1 border ${state.adminViewAll ? 'border-purple-500/40 bg-purple-500/10 text-purple-400' : 'border-orange-500/40 bg-orange-500/10 text-orange-400'} font-black uppercase tracking-widest flex items-center gap-1.5">
                  <i data-lucide="${state.adminViewAll ? 'layers' : 'building-2'}" class="w-3 h-3"></i>
                  ${state.adminViewAll ? 'VISÃO CONSOLIDADA - TODAS AS FRANQUIAS' : 'VISÃO: MINHA UNIDADE - ' + escapeHTML(state.franquiaNome)}
                </span>
              </div>`
            : state.franquiaNome
              ? `<div class="flex items-center gap-2 mt-1">
                  <span class="text-[8px] px-2 py-1 border border-neutral-700 bg-neutral-900/60 text-neutral-400 font-black uppercase tracking-widest flex items-center gap-1.5">
                    <i data-lucide="map-pin" class="w-3 h-3"></i> ${escapeHTML(state.franquiaNome)}
                  </span>
                </div>`
              : ''
          }
        </div>
        <div class="flex flex-col items-end gap-0.5 shrink-0">
          <div id="dashboard-clock" class="text-2xl md:text-3xl font-black text-white live-clock tabular-nums leading-none">00:00:00</div>
          <span class="text-[8px] text-neutral-700 font-bold uppercase tracking-[0.3em]">Horário local</span>
        </div>
      </div>
    </div>

    <!-- ════════════════════════════════════════
         PARA HOJE (crm-fila.js) — REMOVIDO TEMPORARIAMENTE do dashboard a
         pedido do usuário (20/07/2026). Para reativar, recolocar aqui a
         chamada: typeof renderFilaDoDiaBlock === 'function' ? renderFilaDoDiaBlock() : ''
         (interpolada em template string). O bloco continua vivo em crm-fila.js.
         ════════════════════════════════════════ -->

    <!-- ════════════════════════════════════════
         META DO MÊS + COMISSÃO ESTIMADA (crm-metas.js)
         Só para vendedor; admin/gestor têm a visão de time mais abaixo.
         ════════════════════════════════════════ -->
    ${typeof renderMetaBlock === 'function' ? renderMetaBlock() : ''}

    <!-- ════════════════════════════════════════
         BARRA DE FILTROS UNIFICADA
         Todo número abaixo dela obedece: período × franquia × vendedor.
         ════════════════════════════════════════ -->
    <div class="stagger-2 border border-neutral-800/60 p-3 md:px-4 flex flex-col gap-2.5" style="background: rgba(8,8,8,0.85); border-left: 2px solid #f97316;">
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-[8px] text-neutral-500 font-black uppercase tracking-widest flex items-center gap-1.5 mr-1">
          <i data-lucide="sliders-horizontal" class="w-3 h-3 text-orange-400"></i> Filtros
        </span>
        <div class="flex flex-wrap gap-1 items-center">
          <button onclick="setDashPeriod('all')"
            class="${_dashGeralAtivo ? 'bg-neutral-700 text-white border-neutral-600' : 'bg-transparent border-neutral-800 text-neutral-600 hover:text-neutral-300 hover:border-neutral-700'} border px-2.5 py-1 font-black uppercase text-[8px] tracking-widest transition-all">GERAL</button>
          ${_dashBtns}
        </div>
        <div class="flex flex-wrap gap-1.5 items-center ml-auto">
          ${dashScopeSelectorHTML}
          ${dashVendedorSelectorHTML}
          <button onclick="refreshData()" title="Atualizar dados" class="btn btn-ghost btn-sm">
            <i id="refresh-data-icon" data-lucide="refresh-cw" class="transition-transform"></i>
          </button>
        </div>
      </div>
      <div class="flex flex-wrap items-center gap-1.5 border-t border-neutral-900 pt-2">
        <i data-lucide="eye" class="w-3 h-3 text-neutral-600"></i>
        <span class="text-[8px] font-bold uppercase tracking-widest text-neutral-600">Exibindo:</span>
        <span class="text-[9px] font-black uppercase tracking-widest text-white border border-neutral-700 px-1.5 py-0.5">${escapeHTML(ctxPeriodo)}</span>
        ${ctxFranquia ? `<span class="text-neutral-800">·</span>
        <span class="text-[9px] font-black uppercase tracking-widest text-white border border-neutral-700 px-1.5 py-0.5">${escapeHTML(ctxFranquia)}</span>` : ''}
        <span class="text-neutral-800">·</span>
        <span class="text-[9px] font-black uppercase tracking-widest ${vendedorFiltrado ? 'text-orange-400 border-orange-500/50' : 'text-white border-neutral-700'} border px-1.5 py-0.5">${escapeHTML(ctxVendedor)}</span>
        ${vendedorFiltrado
          ? `<button onclick="setDashVendedor('all')" class="text-[8px] font-black uppercase tracking-widest text-neutral-500 hover:text-white transition-colors ml-1">✕ limpar vendedor</button>`
          : ''}
      </div>
    </div>

    <!-- ════════════════════════════════════════
         CARDS DE MÉTRICAS
         ════════════════════════════════════════ -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-4">

      <!-- Clientes (clicável → aba Clientes) -->
      <div onclick="setTab('clientes')" class="metric-card dash-metric-card stagger-2 shine-effect border border-neutral-800/60 p-3 md:p-6 flex flex-col gap-3 md:gap-4 relative overflow-hidden group cursor-pointer hover:border-blue-500/30 transition-colors">
        <div class="absolute -top-6 -right-6 w-28 h-28 bg-blue-500 opacity-[0.05] rounded-full blur-2xl group-hover:opacity-[0.1] transition-opacity duration-700 pointer-events-none"></div>
        <div class="flex justify-between items-start relative z-10">
          <span class="text-[8px] md:text-[9px] text-neutral-600 font-black uppercase tracking-widest leading-tight">Clientes</span>
          <div class="p-1.5 md:p-2 bg-blue-500/10 border border-blue-500/20 group-hover:border-blue-500/40 transition-colors shrink-0">
            <i data-lucide="users" class="w-3 h-3 md:w-3.5 md:h-3.5 text-blue-400"></i>
          </div>
        </div>
        <div class="relative z-10">
          <div class="text-3xl md:text-5xl font-black text-white tabular-nums leading-none" data-count="${clientesPer.length}">0</div>
          <div class="flex items-center gap-2 flex-wrap mt-1">
            <span class="text-[8px] md:text-[9px] text-neutral-600 font-bold uppercase tracking-widest">${_dashGeralAtivo ? 'na carteira' : 'novos no período'}</span>
            ${dashDeltaChip(clientesPer.length, clientesPrev.length)}
          </div>
        </div>
        <div class="relative z-10 flex items-center justify-between gap-1 text-[8px] font-black uppercase tracking-widest text-neutral-700 mt-auto">
          ${_dashGeralAtivo
            ? `<span class="flex items-center gap-1 group-hover:text-blue-400 transition-colors">Ver clientes <i data-lucide="arrow-right" class="w-3 h-3"></i></span>`
            : `<span>Carteira total</span><span class="text-blue-400">${totalClientes}</span>`}
        </div>
      </div>

      <!-- Propostas (clicável → aba Propostas) -->
      <div onclick="setTab('propostas')" class="metric-card dash-metric-card stagger-2 shine-effect border border-neutral-800/60 p-3 md:p-6 flex flex-col gap-3 md:gap-4 relative overflow-hidden group cursor-pointer hover:border-orange-500/30 transition-colors" style="animation-delay: 80ms">
        <div class="absolute -top-6 -right-6 w-28 h-28 bg-orange-500 opacity-[0.05] rounded-full blur-2xl group-hover:opacity-[0.1] transition-opacity duration-700 pointer-events-none"></div>
        <div class="flex justify-between items-start relative z-10">
          <span class="text-[8px] md:text-[9px] text-neutral-600 font-black uppercase tracking-widest leading-tight">Propostas</span>
          <div class="p-1.5 md:p-2 bg-orange-500/10 border border-orange-500/20 group-hover:border-orange-500/40 transition-colors shrink-0">
            <i data-lucide="file-text" class="w-3 h-3 md:w-3.5 md:h-3.5 text-orange-400"></i>
          </div>
        </div>
        <div class="relative z-10">
          <div class="text-3xl md:text-5xl font-black text-white tabular-nums leading-none" data-count="${propostasPer.length}">0</div>
          <div class="flex items-center gap-2 flex-wrap mt-1">
            <span class="text-[8px] md:text-[9px] text-neutral-600 font-bold uppercase tracking-widest">${_dashGeralAtivo ? 'orçamentos gerados' : 'criadas no período'}</span>
            ${dashDeltaChip(propostasPer.length, propostasPrev.length)}
          </div>
        </div>
        <div class="relative z-10 flex items-center justify-between gap-1 text-[8px] font-black uppercase tracking-widest text-neutral-700 mt-auto">
          ${_dashGeralAtivo
            ? `<span class="flex items-center gap-1 group-hover:text-orange-400 transition-colors">Ver propostas <i data-lucide="arrow-right" class="w-3 h-3"></i></span>`
            : `<span>Base total</span><span class="text-orange-400">${propostasDash.length}</span>`}
        </div>
      </div>

      <!-- Fechados (clicável → aba Vendas; barra = taxa proposta→venda do recorte) -->
      <div onclick="setTab('vendas')" class="metric-card dash-metric-card stagger-2 shine-effect border border-neutral-800/60 p-3 md:p-6 flex flex-col gap-3 md:gap-4 relative overflow-hidden group cursor-pointer hover:border-green-500/30 transition-colors" style="animation-delay: 160ms">
        <div class="absolute -top-6 -right-6 w-28 h-28 bg-green-500 opacity-[0.05] rounded-full blur-2xl group-hover:opacity-[0.1] transition-opacity duration-700 pointer-events-none"></div>
        <div class="flex justify-between items-start relative z-10">
          <span class="text-[8px] md:text-[9px] text-neutral-600 font-black uppercase tracking-widest leading-tight">Negócios Fechados</span>
          <div class="p-1.5 md:p-2 bg-green-500/10 border border-green-500/20 group-hover:border-green-500/40 transition-colors shrink-0">
            <i data-lucide="trophy" class="w-3 h-3 md:w-3.5 md:h-3.5 text-green-400"></i>
          </div>
        </div>
        <div class="relative z-10">
          <div class="text-3xl md:text-5xl font-black text-white tabular-nums leading-none neon-green" data-count="${qtdVendas}">0</div>
          <div class="flex items-center gap-2 flex-wrap mt-1">
            <span class="text-[8px] md:text-[9px] text-neutral-600 font-bold uppercase tracking-widest">${qtdVendas > 0 ? `${qtdVendas} venda${qtdVendas > 1 ? 's' : ''} no recorte` : 'nenhuma venda no recorte'}</span>
            ${dashDeltaChip(qtdVendas, vendasPrevArr.length)}
          </div>
        </div>
        <div class="relative z-10 space-y-1.5">
          <div class="flex justify-between text-[8px] text-neutral-700 font-bold uppercase tracking-widest">
            <span>Propostas → Vendas</span><span class="text-green-400">${convPVLabel}</span>
          </div>
          <div class="w-full h-px bg-neutral-900 rounded-full">
            <div class="h-full bg-gradient-to-r from-green-600 to-green-400 bar-animated rounded-full" style="width: ${convPV === null ? 0 : Math.min(convPV, 100)}%"></div>
          </div>
        </div>
      </div>

      <!-- Ticket Médio (clicável → aba Vendas) -->
      <div onclick="setTab('vendas')" class="metric-card dash-metric-card stagger-2 shine-effect border border-neutral-800/60 p-3 md:p-6 flex flex-col gap-3 md:gap-4 relative overflow-hidden group cursor-pointer hover:border-blue-400/30 transition-colors" style="animation-delay: 240ms">
        <div class="absolute -top-6 -right-6 w-28 h-28 bg-blue-400 opacity-[0.04] rounded-full blur-2xl group-hover:opacity-[0.08] transition-opacity duration-700 pointer-events-none"></div>
        <div class="flex justify-between items-start relative z-10">
          <span class="text-[8px] md:text-[9px] text-neutral-600 font-black uppercase tracking-widest leading-tight">Ticket Médio</span>
          <div class="p-1.5 md:p-2 bg-blue-400/10 border border-blue-400/20 group-hover:border-blue-400/40 transition-colors shrink-0">
            <i data-lucide="trending-up" class="w-3 h-3 md:w-3.5 md:h-3.5 text-blue-400"></i>
          </div>
        </div>
        <div class="relative z-10 min-w-0">
          <div class="text-xl md:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400 tabular-nums leading-none pb-0.5 break-all" data-count="${ticketMedio}" data-count-currency="true">R$ 0</div>
          <div class="flex items-center gap-2 flex-wrap mt-1">
            <span class="text-[8px] md:text-[9px] text-neutral-600 font-bold uppercase tracking-widest">${qtdVendas > 0 ? `sobre ${qtdVendas} venda${qtdVendas > 1 ? 's' : ''}` : 'sem vendas no recorte'}</span>
            ${dashDeltaChip(ticketMedio, ticketMedioPrev)}
          </div>
        </div>
        <div class="relative z-10 flex justify-between text-[8px] text-neutral-700 font-bold uppercase tracking-widest gap-1 min-w-0 mt-auto">
          <span class="shrink-0">Total vendido</span><span class="text-blue-500 truncate text-right">${formatCurrency(totalVendido)}</span>
        </div>
      </div>
    </div>

    <!-- ════════════════════════════════════════
         PIPELINE DE VENDAS
         ════════════════════════════════════════ -->
    <div class="dash-pipeline stagger-3 relative overflow-hidden border border-neutral-800/60 p-6 md:p-7" style="background: linear-gradient(135deg, #0e0e0e 0%, #080808 100%);">
      <div class="absolute right-0 top-0 w-48 h-48 bg-purple-600/4 rounded-full blur-3xl pointer-events-none"></div>

      <div class="flex flex-wrap items-center justify-between gap-2 mb-6 relative z-10">
        <div class="flex items-center gap-2.5">
          <div class="p-1.5 bg-purple-500/10 border border-purple-500/25">
            <i data-lucide="git-merge" class="w-3.5 h-3.5 text-purple-400"></i>
          </div>
          <h3 class="text-[10px] font-black text-white uppercase tracking-widest">Funil da Carteira</h3>
        </div>
        <span class="text-[9px] font-bold px-2 py-0.5 border border-neutral-800 text-neutral-500 uppercase tracking-widest">snapshot atual · não muda com o período</span>
      </div>

      <div class="grid grid-cols-4 gap-2 md:gap-5 relative z-10">
        <!-- NOVO -->
        <div class="flex flex-col gap-2.5">
          <div class="flex items-center justify-between">
            <span class="text-[9px] font-black uppercase tracking-widest text-blue-400">Novos</span>
            <span class="text-[9px] text-neutral-700 font-bold tabular-nums">${fPct('NOVO')}%</span>
          </div>
          <div class="h-1 bg-neutral-900 rounded-none overflow-hidden">
            <div class="h-full bg-gradient-to-r from-blue-700 to-blue-400 funnel-bar rounded-none" style="width: ${fWidth('NOVO')}%"></div>
          </div>
          <div class="text-2xl md:text-3xl font-black text-white tabular-nums leading-none">${funil['NOVO']}</div>
          <div class="text-[8px] text-neutral-700 font-bold uppercase tracking-widest leading-tight">leads</div>
          ${convProp > 0 ? `
            <div class="hidden md:flex items-center gap-1 text-[8px] text-blue-500/60 font-bold">
              <i data-lucide="arrow-right" class="w-2.5 h-2.5 shrink-0"></i>${convProp}% passaram
            </div>` : ''}
        </div>

        <!-- PROPOSTA ENVIADA -->
        <div class="flex flex-col gap-2.5">
          <div class="flex items-center justify-between">
            <span class="text-[9px] font-black uppercase tracking-widest text-yellow-400 hidden md:block">Proposta</span>
            <span class="text-[9px] font-black uppercase tracking-widest text-yellow-400 md:hidden">Prop.</span>
            <span class="text-[9px] text-neutral-700 font-bold tabular-nums">${fPct('PROPOSTA ENVIADA')}%</span>
          </div>
          <div class="h-1 bg-neutral-900 rounded-none overflow-hidden">
            <div class="h-full bg-gradient-to-r from-yellow-700 to-yellow-400 funnel-bar rounded-none" style="width: ${fWidth('PROPOSTA ENVIADA')}%; animation-delay: 180ms;"></div>
          </div>
          <div class="text-2xl md:text-3xl font-black text-white tabular-nums leading-none">${funil['PROPOSTA ENVIADA']}</div>
          <div class="text-[8px] text-neutral-700 font-bold uppercase tracking-widest leading-tight">enviadas</div>
          ${convNeg > 0 ? `
            <div class="hidden md:flex items-center gap-1 text-[8px] text-yellow-500/60 font-bold">
              <i data-lucide="arrow-right" class="w-2.5 h-2.5 shrink-0"></i>${convNeg}% passaram
            </div>` : ''}
        </div>

        <!-- EM NEGOCIAÇÃO -->
        <div class="flex flex-col gap-2.5">
          <div class="flex items-center justify-between">
            <span class="text-[9px] font-black uppercase tracking-widest text-orange-400 hidden md:block">Negociação</span>
            <span class="text-[9px] font-black uppercase tracking-widest text-orange-400 md:hidden">Neg.</span>
            <span class="text-[9px] text-neutral-700 font-bold tabular-nums">${fPct('EM NEGOCIAÇÃO')}%</span>
          </div>
          <div class="h-1 bg-neutral-900 rounded-none overflow-hidden">
            <div class="h-full bg-gradient-to-r from-orange-700 to-orange-400 funnel-bar rounded-none" style="width: ${fWidth('EM NEGOCIAÇÃO')}%; animation-delay: 360ms;"></div>
          </div>
          <div class="text-2xl md:text-3xl font-black text-white tabular-nums leading-none">${funil['EM NEGOCIAÇÃO']}</div>
          <div class="text-[8px] text-neutral-700 font-bold uppercase tracking-widest leading-tight">em andamento</div>
          ${convFech > 0 ? `
            <div class="hidden md:flex items-center gap-1 text-[8px] text-orange-500/60 font-bold">
              <i data-lucide="arrow-right" class="w-2.5 h-2.5 shrink-0"></i>${convFech}% fecharam
            </div>` : ''}
        </div>

        <!-- FECHADO -->
        <div class="flex flex-col gap-2.5">
          <div class="flex items-center justify-between">
            <span class="text-[9px] font-black uppercase tracking-widest text-green-400">Fechado</span>
            <span class="text-[9px] text-neutral-700 font-bold tabular-nums">${fPct('FECHADO')}%</span>
          </div>
          <div class="h-1 bg-neutral-900 rounded-none overflow-hidden">
            <div class="h-full bg-gradient-to-r from-green-700 to-green-400 funnel-bar rounded-none" style="width: ${fWidth('FECHADO')}%; animation-delay: 540ms;"></div>
          </div>
          <div class="text-2xl md:text-3xl font-black text-green-400 tabular-nums leading-none neon-green">${funil['FECHADO']}</div>
          <div class="text-[8px] text-neutral-700 font-bold uppercase tracking-widest leading-tight">concluídos</div>
          <div class="hidden md:flex items-center gap-1 text-[8px] text-blue-500/60 font-bold">
            <i data-lucide="trending-up" class="w-2.5 h-2.5 shrink-0"></i>${qtdVendas > 0 ? 'ticket ' + formatCurrency(ticketMedio) : 'sem vendas'}
          </div>
        </div>
      </div>
    </div>

    <!-- ════════════════════════════════════════
         ANÁLISE DO RECORTE (admin sempre; gestor com "minha unidade")
         ════════════════════════════════════════ -->
    ${adminDashMetrics ? renderDashboardAdminSection(adminDashMetrics) : ''}

    <!-- Metas vs realizado do time (crm-metas.js) — admin E gestor -->
    ${typeof renderMetasEquipeBlock === 'function' ? renderMetasEquipeBlock() : ''}

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 stagger-4">

      <!-- Comunicados -->
      <div class="dash-comunicados-panel col-span-1 lg:col-span-2 border border-neutral-800/60 flex flex-col" style="background: linear-gradient(180deg, #0d0d0d 0%, #080808 100%);">
        <div class="flex items-center justify-between px-4 py-3 border-b border-neutral-800/50">
          <h3 class="text-[10px] font-black text-white uppercase tracking-widest flex items-center gap-2">
            <div class="p-1.5 bg-orange-500/10 border border-orange-500/20">
              <i data-lucide="megaphone" class="w-3 h-3 text-orange-400"></i>
            </div>
            Comunicados
          </h3>
          ${comunicadosMetaLabel}
        </div>
        <div class="flex flex-col min-h-[198px]">${comunicadosHTML}</div>
        <div class="px-4 py-2.5 border-t border-neutral-900/70 flex items-center justify-between gap-3">
          <span class="text-[9px] text-neutral-600 font-bold uppercase tracking-widest">${comunicadosFooterLabel}</span>
          ${comunicadosNavHTML}
        </div>
      </div>

      <!-- Coluna lateral -->
      <div class="flex flex-col gap-3">

        <!-- CTA Ação Rápida -->
        <!-- (o painel "Materiais Úteis" foi removido: eram links href="#" sem
             arquivo real. Recolocar só quando existirem materiais de verdade.) -->
        <div class="dash-quick-panel relative overflow-hidden border border-orange-500/15 p-5 flex flex-col gap-4"
          style="background: linear-gradient(135deg, rgba(234,88,12,0.06) 0%, #080808 60%);">
          <div class="absolute inset-0 bg-grid-sm opacity-30 pointer-events-none"></div>
          <div class="relative z-10">
            <div class="text-[8px] font-black text-orange-400/50 uppercase tracking-[0.3em] mb-2">Ação Rápida</div>
            <p class="text-sm font-bold text-neutral-300 leading-snug">Tem um cliente em mente?<br>Crie o orçamento agora.</p>
          </div>
          <button onclick="openNovaPropostaPicker()" class="btn btn-primary relative z-10">
            <i data-lucide="file-plus-2"></i> Nova Proposta
          </button>
          <button onclick="setTab('clientes')" class="btn btn-ghost btn-sm relative z-10">
            <i data-lucide="users"></i> Ir para Clientes
          </button>
        </div>

      </div>
    </div>
  `;
  ensureDashComunicadoModal();
  lucide.createIcons();
  animateCounters();
  startDashboardClock();
}


function setDashComunicadosPage(page) {
  const nextPage = Number(page);
  if (!Number.isFinite(nextPage)) return;
  state.dashComunicadosPage = Math.max(0, Math.floor(nextPage));
  renderContent();
}
// --- Filtro de período do dashboard ---
function setDashPeriod(period) {
  state.dashPeriod = period;
  renderContent();
}



let _dashComunicadoLastFocusedEl = null;
let _dashComunicadoEscHandlerBound = false;

function ensureDashComunicadoModal() {
  if (document.getElementById('dash-comunicado-modal-overlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'dash-comunicado-modal-overlay';
  overlay.className = 'fixed inset-0 z-[160] bg-black/85 backdrop-blur-sm p-4 hidden';
  overlay.setAttribute('aria-hidden', 'true');

  overlay.innerHTML = `
    <div class="w-full h-full flex items-center justify-center">
      <div id="dash-comunicado-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="dash-comunicado-modal-title"
        class="w-full max-w-4xl max-h-[92vh] overflow-hidden border border-neutral-700 bg-[#090909] shadow-[0_20px_80px_rgba(0,0,0,0.6)]">
        <div class="flex items-center justify-between px-5 py-4 border-b border-neutral-800 bg-black/60">
          <p class="text-[10px] text-neutral-500 font-black uppercase tracking-[0.2em]">Comunicado</p>
          <button id="dash-comunicado-close-btn" type="button" onclick="closeDashComunicadoModal()"
            class="p-2 border border-neutral-700 bg-neutral-900 text-neutral-400 hover:text-white hover:border-neutral-500 transition-all"
            aria-label="Fechar comunicado">
            <i data-lucide="x" class="w-4 h-4"></i>
          </button>
        </div>
        <div id="dash-comunicado-modal-content" class="overflow-y-auto max-h-[calc(92vh-65px)]"></div>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) closeDashComunicadoModal();
  });

  if (!_dashComunicadoEscHandlerBound) {
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeDashComunicadoModal();
    });
    _dashComunicadoEscHandlerBound = true;
  }

  lucide.createIcons();
}

function handleDashComunicadoCardKey(event, encodedId) {
  if (!event) return;
  const key = event.key;
  if (key !== 'Enter' && key !== ' ') return;
  event.preventDefault();
  openDashComunicadoModalById(encodedId);
}

function openDashComunicadoModalById(encodedId) {
  ensureDashComunicadoModal();

  const service = window.comunicadosService;
  if (!service) {
    showToast('Serviço de comunicados indisponível.');
    return;
  }

  const id = decodeURIComponent(String(encodedId || ''));
  let comunicado = typeof service.getById === 'function' ? service.getById(id) : null;

  if (!comunicado && typeof service.listPublished === 'function') {
    comunicado = service.listPublished().find(item => String(item.id || '') === id) || null;
  }

  if (!comunicado) {
    showToast('Comunicado nao encontrado.');
    return;
  }

  const overlay = document.getElementById('dash-comunicado-modal-overlay');
  const content = document.getElementById('dash-comunicado-modal-content');
  const closeBtn = document.getElementById('dash-comunicado-close-btn');
  if (!overlay || !content) return;

  const titulo = escapeHTML(comunicado.title || 'Comunicado');
  const tipo = escapeHTML(String(comunicado.type || 'comunicado').toUpperCase());
  const dataRaw = comunicado.publishedAt || comunicado.createdAt || '';
  const dataFmt = dataRaw ? formatDate(dataRaw) : '-';
  const autor = comunicado.authorName
    ? `<span class="text-neutral-500 text-[11px] font-bold">Por ${escapeHTML(comunicado.authorName)}</span>`
    : '';
  const resumo = comunicado.summary
    ? `<p class="text-neutral-400 text-sm leading-relaxed">${escapeHTML(comunicado.summary)}</p>`
    : '';
  const conteudo = escapeHTML(comunicado.content || comunicado.summary || '');
  const imagem = safeImageUrl(comunicado.coverImageUrl, 'assets/img/logo.png');

  content.innerHTML = `
    <div class="border-b border-neutral-800 bg-black/40">
      <img src="${imagem}" alt="${titulo}" class="w-full h-56 md:h-72 object-cover" onerror="this.src='assets/img/logo-light.png';this.onerror=null;">
    </div>
    <div class="p-5 md:p-7 space-y-5">
      <div class="flex flex-wrap items-center gap-2">
        <span class="px-2.5 py-1 bg-blue-500/10 border border-blue-500/25 text-blue-300 text-[10px] font-black uppercase tracking-widest">${tipo}</span>
        <span class="text-neutral-500 text-[11px] font-bold">${escapeHTML(dataFmt)}</span>
        ${autor}
      </div>
      <h3 id="dash-comunicado-modal-title" class="text-white font-black uppercase tracking-tight text-xl md:text-2xl leading-tight">${titulo}</h3>
      ${resumo}
      <div class="border border-neutral-800 bg-neutral-950/50 p-4 md:p-5">
        <div class="text-neutral-300 text-sm md:text-[15px] leading-relaxed whitespace-pre-line">${conteudo}</div>
      </div>
    </div>`;

  if (typeof state !== 'undefined') {
    state.dashComunicadoModalOpen = true;
    state.dashComunicadoModalId = comunicado.id || null;
  }

  _dashComunicadoLastFocusedEl = document.activeElement;
  overlay.classList.remove('hidden');
  overlay.setAttribute('aria-hidden', 'false');
  document.body.classList.add('overflow-hidden');

  if (closeBtn && typeof closeBtn.focus === 'function') {
    closeBtn.focus();
  }

  const scroller = document.getElementById('dash-comunicado-modal-content');
  if (scroller) scroller.scrollTop = 0;

  lucide.createIcons();
}

function closeDashComunicadoModal() {
  const overlay = document.getElementById('dash-comunicado-modal-overlay');
  if (!overlay || overlay.classList.contains('hidden')) return;

  overlay.classList.add('hidden');
  overlay.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('overflow-hidden');

  if (typeof state !== 'undefined') {
    state.dashComunicadoModalOpen = false;
    state.dashComunicadoModalId = null;
  }

  if (_dashComunicadoLastFocusedEl && typeof _dashComunicadoLastFocusedEl.focus === 'function') {
    _dashComunicadoLastFocusedEl.focus();
  }
  _dashComunicadoLastFocusedEl = null;
}












