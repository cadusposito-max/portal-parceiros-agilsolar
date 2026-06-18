// ==========================================
// FINANCEIRO: modulo operacional MVP
// ==========================================
(function () {
  const STATUS = [
    { id: 'providenciar_contrato', label: 'Providenciar Contrato' },
    { id: 'validacao_tecnica', label: 'Validacao Tecnica' },
    { id: 'aprovada_vistoria', label: 'Aprovada a Vistoria' },
    { id: 'ordem_compra_kit', label: 'Ordem de Compra - Kit' },
    { id: 'aguardando_pagamento', label: 'Aguardando Pagamento' },
    { id: 'pagamento_iniciado', label: 'Pagamento Iniciado' },
    { id: 'kit_comprado', label: 'Kit Comprado' },
    { id: 'parcelamentos', label: 'Parcelamentos' },
    { id: 'financeiro_finalizado', label: 'Financeiro Finalizado' },
  ];

  const SCORE = {
    saudavel: { label: 'Saudavel', cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25' },
    atencao: { label: 'Atencao', cls: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/25' },
    critico: { label: 'Critico', cls: 'bg-red-500/10 text-red-400 border-red-500/25' },
    bloqueado: { label: 'Bloqueado', cls: 'bg-neutral-500/10 text-neutral-400 border-neutral-700' },
  };

  const PAYMENT = {
    aguardando_pagamento: 'Aguardando',
    comprovante_enviado: 'Comprovante',
    em_conferencia: 'Em conferencia',
    pagamento_aprovado: 'Aprovado',
    pagamento_recusado: 'Recusado',
    pagamento_parcial: 'Parcial',
    atrasado: 'Atrasado',
    quitado: 'Quitado',
  };

  const FIN_EMPTY = {
    projects: [],
    financials: [],
    receivables: [],
    payments: [],
    purchaseOrders: [],
    costs: [],
    pending: [],
  };

  let finCache = {
    ...FIN_EMPTY,
    loadedAt: 0,
    loading: null,
    filters: {
      receivables: 'todos',
      payments: 'acao',
      costs: '',
      pending: 'aberta',
    },
  };

  const esc = (value) => (typeof escapeHTML === 'function' ? escapeHTML(value) : String(value ?? ''));
  const money = (value) => (typeof formatCurrency === 'function' ? formatCurrency(Number(value) || 0) : `R$ ${Number(value || 0).toFixed(2)}`);
  const date = (value) => value ? (typeof formatDate === 'function' ? formatDate(value) : new Date(value).toLocaleDateString('pt-BR')) : '-';
  const todayISO = () => new Date().toISOString().slice(0, 10);

  function notify(message) {
    if (typeof showToast === 'function') showToast(message);
  }

  function financeCanUse() {
    if (typeof financeRefreshAccess === 'function') financeRefreshAccess();
    return Boolean(state?.canFinanceiro || state?.isAdmin || state?.isGestor);
  }

  function scopedSales() {
    let rows = Array.isArray(state?.vendas) ? state.vendas : [];
    if (state?.isAdmin && typeof applyAdminGlobalScope === 'function') rows = applyAdminGlobalScope(rows);
    return rows;
  }

  function normalizeStatus(value) {
    return STATUS.some((item) => item.id === value) ? value : 'providenciar_contrato';
  }

  function normalizePayment(value) {
    return PAYMENT[value] ? value : 'aguardando_pagamento';
  }

  function projectKey(row) {
    return String(row?.venda_id || row?.sale_id || row?.id || '');
  }

  function saleValue(sale) {
    return Number(sale?.kit_price || sale?.sold_value || 0) || 0;
  }

  function salePower(sale) {
    const power = Number(sale?.kit_power || sale?.system_kwp || 0);
    return Number.isFinite(power) && power > 0 ? `${power} kWp` : '-';
  }

  function computeScore(project) {
    if (project.is_blocked) return 'bloqueado';
    const overdue = finCache.receivables.some((r) => String(r.venda_id || r.project_id || '') === String(project.venda_id || project.id) && ['vencido', 'inadimplente'].includes(r.status));
    if (overdue) return 'critico';
    const margin = Number(project.expected_margin || 0);
    if (margin > 0 && margin < 15) return 'atencao';
    if (project.payment_status === 'pagamento_recusado' || project.payment_status === 'atrasado') return 'critico';
    return project.financial_score || 'saudavel';
  }

  function mergeProjects(financials = []) {
    const bySale = new Map();
    financials.forEach((row) => {
      const key = String(row.venda_id || row.sale_id || '');
      if (key) bySale.set(key, row);
    });

    const rows = scopedSales().map((sale) => {
      const financial = bySale.get(String(sale.id)) || {};
      const soldValue = Number(financial.sold_value ?? saleValue(sale)) || 0;
      const expectedCost = Number(financial.expected_cost ?? (soldValue * 0.78)) || 0;
      const expectedProfit = Number(financial.expected_profit ?? (soldValue - expectedCost)) || 0;
      const expectedMargin = Number(financial.expected_margin ?? (soldValue > 0 ? (expectedProfit / soldValue) * 100 : 0)) || 0;
      const row = {
        ...financial,
        id: financial.id || sale.id,
        financial_id: financial.id || null,
        venda_id: sale.id,
        cliente_id: financial.cliente_id || sale.cliente_id || null,
        cliente_nome: financial.cliente_nome || sale.cliente_nome || '-',
        project_label: financial.project_label || sale.kit_nome || 'Projeto solar',
        power_label: salePower(sale),
        franquia_id: financial.franquia_id || sale.franquia_id || null,
        vendedor_email: sale.vendedor_email || '',
        sold_value: soldValue,
        expected_cost: expectedCost,
        expected_profit: expectedProfit,
        expected_margin: expectedMargin,
        realized_cost: Number(financial.realized_cost || 0),
        realized_revenue: Number(financial.realized_revenue || 0),
        financial_status: normalizeStatus(financial.financial_status),
        payment_status: normalizePayment(financial.payment_status),
        kit_status: financial.kit_status || 'aguardando_orcamento',
        is_blocked: Boolean(financial.is_blocked),
        created_at: financial.created_at || sale.created_at,
      };
      row.financial_score = computeScore(row);
      return row;
    });

    financials.forEach((financial) => {
      if (financial.venda_id && rows.some((row) => String(row.venda_id) === String(financial.venda_id))) return;
      rows.push({
        ...financial,
        id: financial.id,
        financial_id: financial.id,
        venda_id: financial.venda_id || null,
        cliente_nome: financial.cliente_nome || '-',
        project_label: financial.project_label || 'Projeto financeiro',
        power_label: '-',
        sold_value: Number(financial.sold_value || 0),
        financial_status: normalizeStatus(financial.financial_status),
        payment_status: normalizePayment(financial.payment_status),
        kit_status: financial.kit_status || 'aguardando_orcamento',
        expected_margin: Number(financial.expected_margin || 0),
        realized_cost: Number(financial.realized_cost || 0),
        realized_revenue: Number(financial.realized_revenue || 0),
        financial_score: computeScore(financial),
      });
    });

    return rows.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  }

  function derivedReceivables(projects) {
    if (finCache.receivables.length) return finCache.receivables;
    return projects
      .filter((p) => p.sold_value > 0 && !['quitado', 'pagamento_aprovado'].includes(p.payment_status))
      .map((p) => ({
        id: `derived-${p.venda_id || p.id}`,
        venda_id: p.venda_id,
        cliente_id: p.cliente_id,
        cliente_nome: p.cliente_nome,
        project_label: p.project_label,
        amount: p.sold_value,
        due_date: p.created_at || todayISO(),
        status: p.payment_status === 'atrasado' ? 'vencido' : 'a_vencer',
        payment_method: '-',
        isDerived: true,
      }));
  }

  async function safeRpc(name, params) {
    try {
      const { data, error } = await supabaseClient.rpc(name, params || {});
      if (error) throw error;
      return data;
    } catch (error) {
      console.warn(`[financeiro] RPC ${name} indisponivel`, error);
      return null;
    }
  }

  async function safeSelect(table, columns = '*') {
    try {
      const { data, error } = await supabaseClient.from(table).select(columns).order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.warn(`[financeiro] tabela ${table} indisponivel`, error);
      return [];
    }
  }

  async function loadFinanceiro(force = false) {
    if (finCache.loading) return finCache.loading;
    if (!force && finCache.loadedAt && Date.now() - finCache.loadedAt < 45000) return finCache;

    finCache.loading = (async () => {
      const [rpcProjects, rpcReceivables, rpcPayments] = await Promise.all([
        safeRpc('list_financeiro_projects'),
        safeRpc('list_financeiro_receivables'),
        safeRpc('list_financeiro_payments'),
      ]);

      const [financials, receivables, payments, purchaseOrders, costs, pending] = await Promise.all([
        rpcProjects ? Promise.resolve([]) : safeSelect('project_financials'),
        rpcReceivables ? Promise.resolve([]) : safeSelect('financial_receivables'),
        rpcPayments ? Promise.resolve([]) : safeSelect('financial_payments'),
        safeSelect('financial_purchase_orders'),
        safeSelect('financial_project_costs'),
        safeSelect('financial_pending_items'),
      ]);

      finCache.financials = rpcProjects || financials || [];
      finCache.receivables = rpcReceivables || receivables || [];
      finCache.payments = rpcPayments || payments || [];
      finCache.purchaseOrders = purchaseOrders || [];
      finCache.costs = costs || [];
      finCache.pending = pending || [];
      finCache.projects = mergeProjects(finCache.financials);
      finCache.receivables = derivedReceivables(finCache.projects);
      finCache.loadedAt = Date.now();
      finCache.loading = null;
      return finCache;
    })();

    return finCache.loading;
  }

  function pageHeader(icon, title, subtitle, action = '') {
    return `
      <div class="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-5">
        <div>
          <div class="text-[10px] font-black uppercase tracking-[0.25em] fin-acc-strong mb-1">Financeiro</div>
          <h1 class="text-2xl md:text-3xl font-black text-white tracking-tight flex items-center gap-2">
            <i data-lucide="${icon}" class="w-6 h-6 fin-acc"></i>${esc(title)}
          </h1>
          <p class="text-neutral-500 text-sm font-medium mt-1">${esc(subtitle)}</p>
        </div>
        ${action}
      </div>`;
  }

  function chip(label, tone = 'neutral') {
    const map = {
      teal: 'fin-acc-chip border-[color:var(--fin-border-30)]',
      green: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25',
      yellow: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/25',
      red: 'bg-red-500/10 text-red-400 border-red-500/25',
      neutral: 'bg-neutral-900 text-neutral-400 border-neutral-800',
    };
    return `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 border text-[9px] font-black uppercase tracking-widest ${map[tone] || map.neutral}">${esc(label)}</span>`;
  }

  function statusLabel(id) {
    return STATUS.find((item) => item.id === id)?.label || id || '-';
  }

  function paymentTone(status) {
    if (['quitado', 'pagamento_aprovado'].includes(status)) return 'green';
    if (['atrasado', 'pagamento_recusado'].includes(status)) return 'red';
    if (['em_conferencia', 'comprovante_enviado', 'pagamento_parcial'].includes(status)) return 'yellow';
    return 'neutral';
  }

  function scoreChip(project) {
    const score = SCORE[project.financial_score] || SCORE.saudavel;
    return `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 border text-[9px] font-black uppercase tracking-widest ${score.cls}">${score.label}</span>`;
  }

  function dashboardMetrics() {
    const receivables = finCache.receivables;
    const payments = finCache.payments;
    const projects = finCache.projects;
    const now = new Date();
    const in30 = new Date(now);
    in30.setDate(now.getDate() + 30);

    const openReceivables = receivables.filter((r) => !['pago', 'quitado', 'cancelado'].includes(r.status));
    const overdue = openReceivables.filter((r) => r.due_date && new Date(r.due_date) < new Date(todayISO()));
    const due30 = openReceivables.filter((r) => r.due_date && new Date(r.due_date) >= new Date(todayISO()) && new Date(r.due_date) <= in30);
    const approvedPayments = payments.filter((p) => ['pagamento_aprovado', 'quitado'].includes(p.status));
    const revenueMonth = approvedPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const receivableTotal = openReceivables.reduce((sum, r) => sum + Number(r.amount || 0), 0);
    const expectedMargin = projects.length
      ? projects.reduce((sum, p) => sum + Number(p.expected_margin || 0), 0) / projects.length
      : 0;

    return {
      receivableTotal,
      revenueMonth,
      due30: due30.reduce((sum, r) => sum + Number(r.amount || 0), 0),
      overdue: overdue.reduce((sum, r) => sum + Number(r.amount || 0), 0),
      overdueCount: overdue.length,
      actionPayments: payments.filter((p) => ['em_conferencia', 'comprovante_enviado'].includes(p.status)).length,
      blockedProjects: projects.filter((p) => p.is_blocked || p.financial_score === 'bloqueado').length,
      releasedProjects: projects.filter((p) => p.financial_status === 'financeiro_finalizado').length,
      expectedMargin,
      riskProjects: projects.filter((p) => ['critico', 'atencao', 'bloqueado'].includes(p.financial_score)),
    };
  }

  function metricCard(label, value, icon, tone = 'text-white', hint = '') {
    return `
      <article class="metric-card border border-neutral-800 p-4">
        <div class="flex items-center justify-between mb-3">
          <span class="text-[9px] font-black uppercase tracking-[0.18em] text-neutral-500">${esc(label)}</span>
          <i data-lucide="${icon}" class="w-4 h-4 ${tone}"></i>
        </div>
        <div class="text-xl md:text-2xl font-black ${tone} num">${esc(value)}</div>
        ${hint ? `<div class="text-[10px] font-bold text-neutral-500 mt-1.5">${esc(hint)}</div>` : ''}
      </article>`;
  }

  function renderVisao() {
    const m = dashboardMetrics();
    const recent = finCache.receivables.slice(0, 6);
    const risk = m.riskProjects.slice(0, 5);

    return `
      <div class="fin-env animate-fade-in-up">
        ${pageHeader('layout-dashboard', 'Visao geral', 'Central de controle financeiro operacional.',
          `<button onclick="finReload()" class="fin-acc-solid px-4 py-2.5 text-[10px] font-black uppercase tracking-widest inline-flex items-center gap-2"><i data-lucide="refresh-cw" class="w-4 h-4"></i>Atualizar</button>`)}

        <section class="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-3">
          <article class="fin-deep relative overflow-hidden p-6">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 grid place-items-center bg-white/5 fin-deep-label"><i data-lucide="landmark" class="w-4 h-4"></i></div>
                <span class="fin-deep-label text-[10px] font-black uppercase tracking-[0.18em]">Saldo a receber</span>
              </div>
              <button onclick="setTab('recebiveis')" class="w-9 h-9 grid place-items-center bg-white/5 fin-deep-label hover:bg-white/10"><i data-lucide="arrow-up-right" class="w-4 h-4"></i></button>
            </div>
            <div class="text-white font-black text-4xl md:text-5xl tracking-tighter leading-none mt-6 num">${money(m.receivableTotal)}</div>
            <div class="flex flex-wrap gap-2 mt-6">
              <span class="fin-deep-pill inline-flex items-center gap-2 px-3 py-2 text-[9px] font-black uppercase tracking-widest"><i data-lucide="receipt" class="w-3 h-3"></i>${finCache.receivables.length} titulos</span>
              <span class="fin-deep-pill inline-flex items-center gap-2 px-3 py-2 text-[9px] font-black uppercase tracking-widest"><i data-lucide="percent" class="w-3 h-3"></i>Margem ${m.expectedMargin.toFixed(1)}%</span>
            </div>
          </article>
          <div class="lg:col-span-2 grid grid-cols-2 gap-3">
            ${metricCard('Recebido no mes', money(m.revenueMonth), 'circle-check-big', 'text-emerald-400', 'pagamentos aprovados')}
            ${metricCard('A vencer 30d', money(m.due30), 'hourglass', 'text-yellow-400', 'proximos vencimentos')}
            ${metricCard('Vencido', money(m.overdue), 'alert-triangle', 'text-red-400', `${m.overdueCount} titulo(s)`)}
            ${metricCard('Projetos liberados', String(m.releasedProjects), 'badge-check', 'fin-acc', `${m.blockedProjects} bloqueado(s)`)}
          </div>
        </section>

        <section class="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
          ${metricCard('Pagamentos a aprovar', String(m.actionPayments), 'check-square', 'text-yellow-400', 'comprovantes em conferencia')}
          ${metricCard('Projetos em risco', String(risk.length), 'bell-ring', risk.length ? 'text-red-400' : 'text-emerald-400', 'score financeiro')}
          ${metricCard('Custos lancados', money(finCache.costs.reduce((s, c) => s + Number(c.realized_value || c.expected_value || 0), 0)), 'calculator', 'fin-acc', 'previsto x realizado')}
        </section>

        <section class="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <article class="metric-card border border-neutral-800">
            <div class="flex items-center justify-between px-5 py-4 border-b border-neutral-800">
              <span class="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-300">Recebiveis recentes</span>
              <button onclick="setTab('recebiveis')" class="text-[10px] font-black uppercase tracking-widest fin-acc">Ver todos</button>
            </div>
            <div class="divide-y divide-neutral-800/70">${recent.length ? recent.map(receivableRow).join('') : emptyLine('Nenhum recebivel registrado.')}</div>
          </article>
          <article class="metric-card border border-neutral-800">
            <div class="flex items-center justify-between px-5 py-4 border-b border-neutral-800">
              <span class="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-300">Projetos criticos</span>
              <button onclick="setTab('funil')" class="text-[10px] font-black uppercase tracking-widest fin-acc">Abrir funil</button>
            </div>
            <div class="divide-y divide-neutral-800/70">${risk.length ? risk.map(projectRiskRow).join('') : emptyLine('Nenhum projeto em risco financeiro.')}</div>
          </article>
        </section>
      </div>`;
  }

  function emptyLine(text) {
    return `<div class="p-5 text-[11px] text-neutral-600 font-bold uppercase tracking-widest">${esc(text)}</div>`;
  }

  function receivableRow(r) {
    const overdue = r.due_date && new Date(r.due_date) < new Date(todayISO()) && !['pago', 'quitado'].includes(r.status);
    return `
      <div class="p-4 flex items-center justify-between gap-3 fin-table-row">
        <div class="min-w-0">
          <div class="text-sm font-black text-white truncate">${esc(r.cliente_nome || r.client_name || '-')}</div>
          <div class="text-[10px] text-neutral-500 font-bold truncate">${esc(r.project_label || r.document_number || 'Titulo financeiro')}</div>
        </div>
        <div class="text-right shrink-0">
          <div class="text-sm font-black text-white num">${money(r.amount)}</div>
          <div class="text-[10px] font-bold ${overdue ? 'text-red-400' : 'text-neutral-500'}">${date(r.due_date)}</div>
        </div>
      </div>`;
  }

  function projectRiskRow(p) {
    return `
      <div class="p-4 flex items-center justify-between gap-3 fin-table-row">
        <div class="min-w-0">
          <div class="text-sm font-black text-white truncate">${esc(p.cliente_nome)}</div>
          <div class="text-[10px] text-neutral-500 font-bold truncate">${esc(p.project_label)} - ${esc(statusLabel(p.financial_status))}</div>
        </div>
        <div class="shrink-0">${scoreChip(p)}</div>
      </div>`;
  }

  function renderFunil() {
    const groups = STATUS.map((stage) => {
      const rows = finCache.projects.filter((p) => p.financial_status === stage.id);
      const total = rows.reduce((s, p) => s + Number(p.sold_value || 0), 0);
      return `
        <section class="min-w-[280px] w-[280px] bg-neutral-950/60 border border-neutral-800">
          <div class="px-4 py-3 border-b border-neutral-800">
            <div class="flex items-center justify-between gap-2">
              <h2 class="text-[10px] font-black uppercase tracking-widest text-neutral-300">${esc(stage.label)}</h2>
              ${chip(String(rows.length), 'teal')}
            </div>
            <div class="text-[10px] text-neutral-600 font-bold mt-1 num">${money(total)}</div>
          </div>
          <div class="p-3 space-y-2">${rows.length ? rows.map(funilCard).join('') : `<div class="text-[10px] text-neutral-700 font-bold uppercase tracking-widest p-3">Sem projetos</div>`}</div>
        </section>`;
    }).join('');

    return `
      <div class="fin-env animate-fade-in-up">
        ${pageHeader('git-merge', 'Funil financeiro', 'Fluxo operacional do contrato ate a finalizacao financeira.')}
        <div class="flex gap-3 overflow-x-auto pb-4 custom-scrollbar">${groups}</div>
      </div>`;
  }

  function funilCard(p) {
    const idx = STATUS.findIndex((s) => s.id === p.financial_status);
    return `
      <article class="bg-[#080808] border border-neutral-800 hover:border-[color:var(--fin-border-40)] p-4 transition-colors">
        <div class="flex items-start justify-between gap-2 mb-3">
          <div class="min-w-0">
            <h3 class="text-sm font-black text-white uppercase truncate">${esc(p.cliente_nome)}</h3>
            <p class="text-[10px] text-neutral-500 font-bold truncate">${esc(p.project_label)} - ${esc(p.power_label)}</p>
          </div>
          ${scoreChip(p)}
        </div>
        <div class="space-y-1.5 mb-3">
          ${miniLine('Valor vendido', money(p.sold_value))}
          ${miniLine('Pagamento', PAYMENT[p.payment_status] || p.payment_status)}
          ${miniLine('Kit', p.kit_status || '-')}
          ${miniLine('Margem prevista', `${Number(p.expected_margin || 0).toFixed(1)}%`)}
        </div>
        <div class="flex gap-1">
          <button ${idx <= 0 ? 'disabled' : ''} onclick="finMoveProject('${esc(p.venda_id || p.id)}', -1)" class="flex-1 py-2 bg-neutral-900 border border-neutral-800 disabled:opacity-30 text-[9px] font-black uppercase tracking-widest">Voltar</button>
          <button ${idx >= STATUS.length - 1 ? 'disabled' : ''} onclick="finMoveProject('${esc(p.venda_id || p.id)}', 1)" class="flex-1 py-2 fin-acc-solid text-[9px] font-black uppercase tracking-widest disabled:opacity-30">Avancar</button>
        </div>
        <button onclick="finCreateReceivable('${esc(p.venda_id || p.id)}')" class="mt-2 w-full py-2 border border-[color:var(--fin-border-30)] fin-acc text-[9px] font-black uppercase tracking-widest">Gerar recebivel</button>
      </article>`;
  }

  function miniLine(label, value) {
    return `<div class="flex justify-between gap-3 text-[10px]"><span class="text-neutral-500 font-bold">${esc(label)}</span><span class="text-neutral-300 font-bold text-right">${esc(value)}</span></div>`;
  }

  function renderReceivables() {
    const filter = finCache.filters.receivables;
    const rows = finCache.receivables.filter((r) => {
      if (filter === 'todos') return true;
      if (filter === 'vencido') return r.due_date && new Date(r.due_date) < new Date(todayISO()) && !['pago', 'quitado'].includes(r.status);
      return r.status === filter;
    });

    return `
      <div class="fin-env animate-fade-in-up">
        ${pageHeader('receipt', 'Recebiveis', 'Titulos a receber, vencimentos e inadimplencia.')}
        ${filterBar('receivables', filter, [
          ['todos', 'Todos'], ['a_vencer', 'A vencer'], ['vencido', 'Vencido'], ['pago', 'Pago']
        ])}
        <div class="metric-card border border-neutral-800 overflow-x-auto">
          <table class="w-full text-left">
            <thead><tr class="text-[9px] font-black uppercase tracking-widest text-neutral-600 border-b border-neutral-800">
              <th class="px-5 py-3">Cliente / Projeto</th><th class="px-3 py-3">Vencimento</th><th class="px-3 py-3 text-right">Valor</th><th class="px-3 py-3 text-center">Status</th><th class="px-5 py-3 text-right">Acao</th>
            </tr></thead>
            <tbody>${rows.length ? rows.map(receivableTableRow).join('') : `<tr><td colspan="5">${emptyLine('Nenhum recebivel encontrado.')}</td></tr>`}</tbody>
          </table>
        </div>
      </div>`;
  }

  function filterBar(kind, active, items) {
    return `<div class="flex gap-1 overflow-x-auto no-scrollbar mb-4">${items.map(([id, label]) => `
      <button onclick="finSetFilter('${kind}','${id}')" class="shrink-0 px-3.5 py-2.5 text-[10px] font-black uppercase tracking-widest border ${active === id ? 'fin-nav-grad border-transparent' : 'border-neutral-800 text-neutral-400 hover:text-white'}">${esc(label)}</button>
    `).join('')}</div>`;
  }

  function receivableTableRow(r) {
    const overdue = r.due_date && new Date(r.due_date) < new Date(todayISO()) && !['pago', 'quitado'].includes(r.status);
    return `
      <tr class="border-b border-neutral-800/70 fin-table-row">
        <td class="px-5 py-3"><div class="text-sm font-black text-white">${esc(r.cliente_nome || '-')}</div><div class="text-[10px] text-neutral-500 font-bold">${esc(r.project_label || r.document_number || '-')}</div></td>
        <td class="px-3 py-3 text-[11px] font-bold ${overdue ? 'text-red-400' : 'text-neutral-300'}">${date(r.due_date)}</td>
        <td class="px-3 py-3 text-right text-sm font-black text-white num">${money(r.amount)}</td>
        <td class="px-3 py-3 text-center">${chip(overdue ? 'Vencido' : (r.status || 'A vencer'), overdue ? 'red' : r.status === 'pago' ? 'green' : 'yellow')}</td>
        <td class="px-5 py-3 text-right">
          ${r.isDerived ? '<span class="text-[9px] text-neutral-600 font-bold uppercase">derivado</span>' : `<button onclick="finRegisterPayment('${esc(r.id)}')" class="px-3 py-2 fin-acc-solid text-[9px] font-black uppercase tracking-widest">Registrar pagamento</button>`}
        </td>
      </tr>`;
  }

  function renderPayments() {
    const filter = finCache.filters.payments;
    const rows = finCache.payments.filter((p) => filter === 'todos' ? true : filter === 'acao' ? ['em_conferencia', 'comprovante_enviado'].includes(p.status) : p.status === filter);
    return `
      <div class="fin-env animate-fade-in-up">
        ${pageHeader('credit-card', 'Pagamentos', 'Conferencia de comprovantes, entradas e pagamentos parciais.')}
        ${filterBar('payments', filter, [
          ['acao', 'Precisam de acao'], ['todos', 'Todos'], ['em_conferencia', 'Em conferencia'], ['pagamento_aprovado', 'Aprovado'], ['pagamento_recusado', 'Recusado']
        ])}
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">${rows.length ? rows.map(paymentCard).join('') : emptyLine('Nenhum pagamento registrado.')}</div>
      </div>`;
  }

  function paymentCard(p) {
    return `
      <article class="metric-card border border-neutral-800 p-5">
        <div class="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3 class="text-sm font-black text-white uppercase">${esc(p.cliente_nome || p.client_name || '-')}</h3>
            <p class="text-[10px] text-neutral-500 font-bold">${date(p.expected_date || p.created_at)} - ${esc(p.payment_method || '-')}</p>
          </div>
          ${chip(PAYMENT[p.status] || p.status || 'Pendente', paymentTone(p.status))}
        </div>
        <div class="grid grid-cols-2 gap-3 mb-4">
          ${smallMetric('Valor', money(p.amount))}
          ${smallMetric('Recebido', p.received_date ? date(p.received_date) : '-')}
        </div>
        <div class="flex gap-2">
          <button onclick="finUpdatePayment('${esc(p.id)}','pagamento_aprovado')" class="flex-1 py-2.5 bg-emerald-500 text-emerald-950 font-black text-[10px] uppercase tracking-widest">Validar</button>
          <button onclick="finUpdatePayment('${esc(p.id)}','pagamento_recusado')" class="flex-1 py-2.5 bg-red-500 text-red-950 font-black text-[10px] uppercase tracking-widest">Recusar</button>
        </div>
      </article>`;
  }

  function smallMetric(label, value) {
    return `<div class="bg-neutral-950 border border-neutral-800 p-3"><div class="text-[8px] text-neutral-600 font-black uppercase tracking-widest">${esc(label)}</div><div class="text-sm text-white font-black mt-1 num">${esc(value)}</div></div>`;
  }

  function renderPurchaseOrders() {
    return `
      <div class="fin-env animate-fade-in-up">
        ${pageHeader('shopping-cart', 'Ordem de Compra', 'Controle minimo da compra do kit e liberacao operacional.')}
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
          ${finCache.projects.map((p) => {
            const order = finCache.purchaseOrders.find((o) => String(o.venda_id || o.project_id || '') === String(p.venda_id || p.id));
            const status = order?.status || p.kit_status || 'aguardando_orcamento';
            return `
              <article class="metric-card border border-neutral-800 p-5">
                <div class="flex items-start justify-between gap-3 mb-4">
                  <div><h3 class="text-sm font-black text-white uppercase">${esc(p.cliente_nome)}</h3><p class="text-[10px] text-neutral-500 font-bold">${esc(p.project_label)}</p></div>
                  ${chip(status, status === 'comprado' ? 'green' : 'yellow')}
                </div>
                <div class="grid grid-cols-2 gap-3 mb-4">${smallMetric('Valor vendido', money(p.sold_value))}${smallMetric('Kit', esc(status))}</div>
                <button onclick="finMarkKitPurchased('${esc(p.venda_id || p.id)}')" class="w-full py-2.5 fin-acc-solid font-black text-[10px] uppercase tracking-widest">Marcar kit comprado</button>
              </article>`;
          }).join('') || emptyLine('Nenhum projeto financeiro.')}
        </div>
      </div>`;
  }

  function renderCosts() {
    const totalExpected = finCache.costs.reduce((s, c) => s + Number(c.expected_value || 0), 0);
    const totalRealized = finCache.costs.reduce((s, c) => s + Number(c.realized_value || 0), 0);
    return `
      <div class="fin-env animate-fade-in-up">
        ${pageHeader('calculator', 'Custos por projeto', 'Previsto x realizado para margem e risco financeiro.')}
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          ${metricCard('Custo previsto', money(totalExpected), 'clipboard-list', 'text-white')}
          ${metricCard('Custo realizado', money(totalRealized), 'receipt-text', totalRealized > totalExpected ? 'text-red-400' : 'fin-acc')}
          ${metricCard('Desvio', money(totalRealized - totalExpected), 'activity', totalRealized > totalExpected ? 'text-red-400' : 'text-emerald-400')}
        </div>
        <div class="metric-card border border-neutral-800 overflow-x-auto">
          <table class="w-full text-left">
            <thead><tr class="text-[9px] font-black uppercase tracking-widest text-neutral-600 border-b border-neutral-800">
              <th class="px-5 py-3">Projeto</th><th class="px-3 py-3">Categoria</th><th class="px-3 py-3 text-right">Previsto</th><th class="px-3 py-3 text-right">Realizado</th><th class="px-5 py-3 text-right">Acao</th>
            </tr></thead>
            <tbody>${finCache.projects.map(costProjectRow).join('') || `<tr><td colspan="5">${emptyLine('Nenhum projeto financeiro.')}</td></tr>`}</tbody>
          </table>
        </div>
      </div>`;
  }

  function costProjectRow(p) {
    const related = finCache.costs.filter((c) => String(c.venda_id || c.project_id || '') === String(p.venda_id || p.id));
    const expected = related.reduce((s, c) => s + Number(c.expected_value || 0), 0);
    const realized = related.reduce((s, c) => s + Number(c.realized_value || 0), 0);
    return `
      <tr class="border-b border-neutral-800/70 fin-table-row">
        <td class="px-5 py-3"><div class="text-sm font-black text-white">${esc(p.cliente_nome)}</div><div class="text-[10px] text-neutral-500 font-bold">${esc(p.project_label)}</div></td>
        <td class="px-3 py-3 text-[11px] text-neutral-400 font-bold">${esc(related.map((c) => c.category).filter(Boolean).slice(0, 2).join(', ') || '-')}</td>
        <td class="px-3 py-3 text-right text-sm font-black text-white num">${money(expected)}</td>
        <td class="px-3 py-3 text-right text-sm font-black ${realized > expected && expected > 0 ? 'text-red-400' : 'fin-acc'} num">${money(realized)}</td>
        <td class="px-5 py-3 text-right"><button onclick="finLaunchCost('${esc(p.venda_id || p.id)}')" class="px-3 py-2 fin-acc-solid text-[9px] font-black uppercase tracking-widest">Lancar custo</button></td>
      </tr>`;
  }

  function renderPending() {
    const rows = finCache.pending.filter((p) => finCache.filters.pending === 'todos' ? true : ['aberta', 'em_andamento', 'bloqueante'].includes(p.status));
    return `
      <div class="fin-env animate-fade-in-up">
        ${pageHeader('alert-triangle', 'Pendencias financeiras', 'Problemas que bloqueiam ou colocam projetos em risco.')}
        ${filterBar('pending', finCache.filters.pending, [['aberta', 'Abertas'], ['todos', 'Todas']])}
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">${rows.length ? rows.map(pendingCard).join('') : emptyLine('Nenhuma pendencia financeira registrada.')}</div>
      </div>`;
  }

  function pendingCard(p) {
    return `
      <article class="metric-card border border-neutral-800 p-5">
        <div class="flex items-start justify-between gap-3 mb-4">
          <div><h3 class="text-sm font-black text-white uppercase">${esc(p.cliente_nome || '-')}</h3><p class="text-[10px] text-neutral-500 font-bold">${esc(p.type || p.comment || 'Pendencia financeira')}</p></div>
          ${chip(p.is_blocking ? 'Bloqueante' : (p.priority || 'Normal'), p.is_blocking ? 'red' : 'yellow')}
        </div>
        <p class="text-xs text-neutral-400 font-medium mb-4">${esc(p.comment || '-')}</p>
        <button onclick="finResolvePending('${esc(p.id)}')" class="w-full py-2.5 bg-emerald-500 text-emerald-950 font-black text-[10px] uppercase tracking-widest">Resolver</button>
      </article>`;
  }

  function renderDreFuture() {
    return `
      <div class="fin-env animate-fade-in-up">
        ${pageHeader('bar-chart-3', 'DRE futura', 'A DRE completa depende da planilha oficial e nao sera misturada com o simulador.')}
        <article class="fin-deep p-8 max-w-3xl">
          <div class="w-12 h-12 grid place-items-center bg-white/5 fin-deep-label mb-5"><i data-lucide="file-clock" class="w-6 h-6"></i></div>
          <h2 class="text-2xl font-black text-white tracking-tight mb-3">Aguardando modelo oficial da DRE</h2>
          <p class="text-sm text-teal-100/75 font-medium leading-relaxed">Nesta fase, o financeiro ja separa receita prevista, pagamentos, custos, recebiveis e margem. Quando a planilha oficial chegar, estes dados alimentarao a DRE por projeto, mes, unidade e consultor.</p>
        </article>
      </div>`;
  }

  async function ensureProjectFinancial(project) {
    if (project.financial_id) return project.financial_id;
    const payload = {
      venda_id: project.venda_id || null,
      cliente_id: project.cliente_id || null,
      franquia_id: project.franquia_id || state.franquiaId || null,
      cliente_nome: project.cliente_nome || null,
      project_label: project.project_label || null,
      sold_value: Number(project.sold_value || 0),
      expected_cost: Number(project.expected_cost || 0),
      expected_profit: Number(project.expected_profit || 0),
      expected_margin: Number(project.expected_margin || 0),
      financial_status: project.financial_status || 'providenciar_contrato',
      payment_status: project.payment_status || 'aguardando_pagamento',
      kit_status: project.kit_status || 'aguardando_orcamento',
      financial_score: project.financial_score || 'saudavel',
      is_blocked: Boolean(project.is_blocked),
    };
    const { data, error } = await supabaseClient
      .from('project_financials')
      .upsert(payload, { onConflict: 'venda_id' })
      .select('id')
      .single();
    if (error) throw error;
    return data.id;
  }

  async function writeLog(project, action, entityType, entityId, oldValue, newValue) {
    try {
      await supabaseClient.from('financial_activity_logs').insert([{
        project_financial_id: project.financial_id || null,
        venda_id: project.venda_id || null,
        user_id: state.currentUser?.id || null,
        action,
        entity_type: entityType || null,
        entity_id: entityId || null,
        old_value: oldValue == null ? null : JSON.stringify(oldValue),
        new_value: newValue == null ? null : JSON.stringify(newValue),
      }]);
    } catch (error) {
      console.warn('[financeiro] falha ao registrar log', error);
    }
  }

  function findProject(id) {
    return finCache.projects.find((p) => String(p.venda_id || p.id) === String(id));
  }

  async function runMutation(task, successMessage) {
    try {
      await task();
      notify(successMessage || 'Financeiro atualizado.');
      await loadFinanceiro(true);
      renderContent();
    } catch (error) {
      console.error('[financeiro] mutacao falhou', error);
      const missing = error?.code === '42P01' || String(error?.message || '').includes('does not exist');
      notify(missing ? 'Migration do Financeiro ainda nao aplicada no Supabase.' : (error?.message || 'Falha ao atualizar financeiro.'));
    }
  }

  async function finMoveProject(id, direction) {
    const project = findProject(id);
    if (!project) return;
    const idx = STATUS.findIndex((s) => s.id === project.financial_status);
    const next = STATUS[Math.max(0, Math.min(STATUS.length - 1, idx + Number(direction || 0)))];
    if (!next || next.id === project.financial_status) return;
    await runMutation(async () => {
      const financialId = await ensureProjectFinancial(project);
      await supabaseClient.from('project_financials').update({ financial_status: next.id }).eq('id', financialId);
      await writeLog({ ...project, financial_id: financialId }, 'financial_status_changed', 'project_financials', financialId, project.financial_status, next.id);
    }, `Projeto movido para ${next.label}.`);
  }

  async function finCreateReceivable(id) {
    const project = findProject(id);
    if (!project) return;
    const due = new Date();
    due.setDate(due.getDate() + 7);
    await runMutation(async () => {
      const financialId = await ensureProjectFinancial(project);
      const payload = {
        project_financial_id: financialId,
        venda_id: project.venda_id || null,
        cliente_id: project.cliente_id || null,
        franquia_id: project.franquia_id || state.franquiaId || null,
        cliente_nome: project.cliente_nome || null,
        project_label: project.project_label || null,
        amount: Number(project.sold_value || 0),
        due_date: due.toISOString().slice(0, 10),
        status: 'a_vencer',
        payment_method: 'a definir',
      };
      const { data, error } = await supabaseClient.from('financial_receivables').insert([payload]).select('id').single();
      if (error) throw error;
      await writeLog({ ...project, financial_id: financialId }, 'receivable_created', 'financial_receivables', data.id, null, payload);
    }, 'Recebivel criado.');
  }

  async function finRegisterPayment(receivableId) {
    const receivable = finCache.receivables.find((r) => String(r.id) === String(receivableId));
    if (!receivable || receivable.isDerived) return;
    await runMutation(async () => {
      const payload = {
        project_financial_id: receivable.project_financial_id || null,
        venda_id: receivable.venda_id || null,
        receivable_id: receivable.id,
        cliente_id: receivable.cliente_id || null,
        franquia_id: receivable.franquia_id || state.franquiaId || null,
        cliente_nome: receivable.cliente_nome || null,
        amount: Number(receivable.amount || 0),
        payment_method: receivable.payment_method || 'a definir',
        expected_date: receivable.due_date || todayISO(),
        status: 'em_conferencia',
      };
      const { error } = await supabaseClient.from('financial_payments').insert([payload]);
      if (error) throw error;
      await supabaseClient.from('financial_receivables').update({ status: 'em_conferencia' }).eq('id', receivable.id);
    }, 'Pagamento enviado para conferencia.');
  }

  async function finUpdatePayment(paymentId, status) {
    const payment = finCache.payments.find((p) => String(p.id) === String(paymentId));
    if (!payment) return;
    await runMutation(async () => {
      const patch = { status };
      if (status === 'pagamento_aprovado') patch.received_date = todayISO();
      const { error } = await supabaseClient.from('financial_payments').update(patch).eq('id', paymentId);
      if (error) throw error;
      if (payment.receivable_id) {
        await supabaseClient.from('financial_receivables').update({ status: status === 'pagamento_aprovado' ? 'pago' : 'a_vencer' }).eq('id', payment.receivable_id);
      }
      if (payment.project_financial_id) {
        const financialPatch = {
          payment_status: status === 'pagamento_aprovado' ? 'pagamento_aprovado' : 'pagamento_recusado',
        };
        if (status === 'pagamento_aprovado') financialPatch.realized_revenue = Number(payment.amount || 0);
        await supabaseClient.from('project_financials').update(financialPatch).eq('id', payment.project_financial_id);
      }
    }, status === 'pagamento_aprovado' ? 'Pagamento validado.' : 'Pagamento recusado.');
  }

  async function finMarkKitPurchased(id) {
    const project = findProject(id);
    if (!project) return;
    await runMutation(async () => {
      const financialId = await ensureProjectFinancial(project);
      await supabaseClient.from('financial_purchase_orders').upsert({
        project_financial_id: financialId,
        venda_id: project.venda_id || null,
        franquia_id: project.franquia_id || state.franquiaId || null,
        cliente_nome: project.cliente_nome || null,
        project_label: project.project_label || null,
        kit_value: Number(project.expected_cost || 0),
        status: 'comprado',
        purchased_at: todayISO(),
      }, { onConflict: 'project_financial_id' });
      await supabaseClient.from('project_financials').update({ financial_status: 'kit_comprado', kit_status: 'comprado' }).eq('id', financialId);
      await writeLog({ ...project, financial_id: financialId }, 'kit_purchased', 'financial_purchase_orders', financialId, project.kit_status, 'comprado');
    }, 'Kit marcado como comprado.');
  }

  async function finLaunchCost(id) {
    const project = findProject(id);
    if (!project) return;
    const raw = window.prompt('Valor realizado do custo (ex.: 1250.50)');
    if (!raw) return;
    const amount = Number(String(raw).replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) { notify('Valor invalido.'); return; }
    const category = window.prompt('Categoria do custo', 'Kit') || 'Outros';
    await runMutation(async () => {
      const financialId = await ensureProjectFinancial(project);
      const { error } = await supabaseClient.from('financial_project_costs').insert([{
        project_financial_id: financialId,
        venda_id: project.venda_id || null,
        franquia_id: project.franquia_id || state.franquiaId || null,
        cliente_nome: project.cliente_nome || null,
        project_label: project.project_label || null,
        category,
        description: category,
        realized_value: amount,
        realized_date: todayISO(),
        status: 'realizado',
      }]);
      if (error) throw error;
      await supabaseClient.rpc('recalculate_project_financials', { p_project_financial_id: financialId }).catch(() => null);
    }, 'Custo lancado.');
  }

  async function finResolvePending(id) {
    await runMutation(async () => {
      const { error } = await supabaseClient.from('financial_pending_items').update({ status: 'resolvida', resolved_at: new Date().toISOString(), is_blocking: false }).eq('id', id);
      if (error) throw error;
    }, 'Pendencia resolvida.');
  }

  function finSetFilter(kind, value) {
    finCache.filters[kind] = value;
    renderContent();
  }

  async function finReload() {
    await loadFinanceiro(true);
    renderContent();
    notify('Financeiro atualizado.');
  }

  async function renderFinanceiroRoute(container, tabId) {
    if (!financeCanUse()) {
      container.innerHTML = `<div class="py-20 text-center text-neutral-500 font-bold">Acesso ao Financeiro restrito a Admin/Gestor.</div>`;
      return;
    }
    container.innerHTML = `<div class="fin-env py-20 flex items-center justify-center text-neutral-500"><i data-lucide="loader-2" class="w-7 h-7 animate-spin fin-acc"></i></div>`;
    if (typeof queueAppLucideCreateIcons === 'function') queueAppLucideCreateIcons();
    await loadFinanceiro();

    const route = tabId || 'visao';
    if (route === 'funil') container.innerHTML = renderFunil();
    else if (route === 'recebiveis') container.innerHTML = renderReceivables();
    else if (route === 'pagamentos') container.innerHTML = renderPayments();
    else if (route === 'ordemcompra') container.innerHTML = renderPurchaseOrders();
    else if (route === 'custos') container.innerHTML = renderCosts();
    else if (route === 'pendencias') container.innerHTML = renderPending();
    else if (route === 'dre') container.innerHTML = renderDreFuture();
    else container.innerHTML = renderVisao();

    if (typeof queueAppLucideCreateIcons === 'function') queueAppLucideCreateIcons();
  }

  Object.assign(window, {
    renderFinanceiroRoute,
    finReload,
    finSetFilter,
    finMoveProject,
    finCreateReceivable,
    finRegisterPayment,
    finUpdatePayment,
    finMarkKitPurchased,
    finLaunchCost,
    finResolvePending,
  });
})();
