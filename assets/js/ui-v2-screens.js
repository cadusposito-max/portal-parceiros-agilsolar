// ==========================================
// VISUAL NOVO (v2) — TELAS RECONSTRUÍDAS
// ------------------------------------------
// Cada tela nova substitui o render antigo SÓ quando o v2 está ativo:
// a função original é guardada e chamada normalmente no visual de sempre.
// Os números saem dos mesmos cálculos/filtros do portal (dashboard.js etc.);
// aqui muda só a apresentação.
// ==========================================

(function () {
  if (!window.uiV2) return;

  const has = (fn) => typeof window[fn] === 'function';
  const esc = (s) => (has('escapeHTML') ? escapeHTML(String(s ?? '')) : String(s ?? ''));
  const ic = (name, extra = '') => `<i data-lucide="${name}" ${extra}></i>`;
  const money = (v) => (has('formatCurrency') ? formatCurrency(Number(v) || 0) : 'R$ ' + (Number(v) || 0).toFixed(2));
  const moneyC = (v) => (has('formatCurrencyCompact') ? formatCurrencyCompact(Number(v) || 0) : money(v));
  const initials = (n) => String(n || '?').split(/\s+/).filter((w) => w.length > 2).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || String(n || '?').charAt(0).toUpperCase();
  const cap = (s) => { const t = String(s || '').toLocaleLowerCase('pt-BR'); return t.charAt(0).toLocaleUpperCase('pt-BR') + t.slice(1); };

  // Título/subtítulo da barra de cima (lido pelo ui-v2-shell.js)
  function setPageMeta(key, title, sub) {
    window.uiV2PageMeta = { key, title, sub };
    if (window.uiV2Shell) window.uiV2Shell.refresh();
  }

  function delta(current, previous, periodo) {
    if (periodo.geral || !previous) return '';
    const d = ((current - previous) / previous) * 100;
    const up = d >= 0.5, down = d <= -0.5;
    const cls = up ? 'up' : down ? 'down' : 'flat';
    return `<span class="v2-delta ${cls}">${ic(up ? 'trending-up' : down ? 'trending-down' : 'minus')}${d >= 0 ? '+' : ''}${d.toFixed(0)}% ${esc(periodo.deltaLabel)}</span>`;
  }

  const PROP_ST = { GERADA: ['Gerada', 't-gray'], ENVIADA: ['Enviada', 't-blue'], VISTA: ['Vista', 't-orange'], ACEITA: ['Aceita', 't-green'] };

  // ==================== VISÃO GERAL (Comercial) ====================
  function renderDashboardV2(container) {
    container.className = 'v2s';

    // --- mesmos filtros do dashboard.js: escopo → franquia → vendedor → período
    const clientesScope = getDashboardScopedRows(state.clientes || []);
    const propostasScope = getDashboardScopedRows(state.propostas || []);
    const vendasScope = getDashboardScopedRows(state.vendas || []);
    const vendedorOptions = getDashboardVendedorOptions([clientesScope, propostasScope, vendasScope]);
    if (String(state.dashVendedor || 'all').toLowerCase() !== 'all' && !vendedorOptions.includes(String(state.dashVendedor).toLowerCase())) state.dashVendedor = 'all';
    const clientesDash = applyDashboardVendedorFilter(clientesScope);
    const propostasDash = applyDashboardVendedorFilter(propostasScope);
    const vendasDash = applyDashboardVendedorFilter(vendasScope);

    const now = new Date();
    const currMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    if (!state.dashPeriod) state.dashPeriod = currMonth;
    const months = [...new Set([...clientesDash, ...propostasDash, ...vendasDash].map((r) => toMonthKey(r.created_at)).filter(Boolean))].sort().reverse();
    if (!months.includes(currMonth)) months.unshift(currMonth);
    const raw = String(state.dashPeriod);
    const valido = raw === 'all' || raw === 'last3' || (DASH_MONTH_KEY_RE.test(raw) && months.includes(raw)) || resolveDashPeriod(raw).kind === 'custom';
    if (!valido) state.dashPeriod = currMonth;
    const periodo = resolveDashPeriod(state.dashPeriod);
    const geral = periodo.geral;
    const inRange = (rows, a, b) => rows.filter((r) => isDateWithinDashboardRange(r.created_at, a, b));
    const clientesPer = geral ? clientesDash : inRange(clientesDash, periodo.start, periodo.end);
    const propostasPer = geral ? propostasDash : inRange(propostasDash, periodo.start, periodo.end);
    const vendasPer = geral ? vendasDash : inRange(vendasDash, periodo.start, periodo.end);
    const clientesPrev = geral ? [] : inRange(clientesDash, periodo.prevStart, periodo.prevEnd);
    const propostasPrev = geral ? [] : inRange(propostasDash, periodo.prevStart, periodo.prevEnd);
    const vendasPrev = geral ? [] : inRange(vendasDash, periodo.prevStart, periodo.prevEnd);

    const total = vendasPer.reduce((s, v) => s + (Number(v.kit_price) || 0), 0);
    const totalPrev = vendasPrev.reduce((s, v) => s + (Number(v.kit_price) || 0), 0);
    const qtd = vendasPer.length;
    const ticket = qtd ? total / qtd : 0;
    const convPV = propostasPer.length ? Math.round((qtd / propostasPer.length) * 100) : null;

    const funil = { NOVO: 0, 'PROPOSTA ENVIADA': 0, 'EM NEGOCIAÇÃO': 0, FECHADO: 0 };
    clientesPer.forEach((c) => { const s = c.status || 'NOVO'; if (funil[s] !== undefined) funil[s]++; else funil.NOVO++; });
    const etapas = ['NOVO', 'PROPOSTA ENVIADA', 'EM NEGOCIAÇÃO', 'FECHADO'];
    const chegou = (k) => etapas.slice(etapas.indexOf(k)).reduce((s, e) => s + (funil[e] || 0), 0);
    const passou = (a, b) => (chegou(a) > 0 ? Math.round((chegou(b) / chegou(a)) * 100) : null);
    const maxF = clientesPer.length || 1;

    // --- contexto
    const ctxFranquia = state.isAdmin
      ? (!state.adminViewAll ? (state.franquiaNome || 'Minha unidade') : (String(state.adminScopeFranquiaId || 'all') === 'all' ? 'Todas as franquias' : getFranquiaNameById(state.adminScopeFranquiaId)))
      : (state.franquiaNome || '');
    const vendSel = String(state.dashVendedor || 'all').toLowerCase();
    const vendFiltrado = vendSel !== 'all' && canUseDashVendedorFilter();
    const ctxVendedor = canUseDashVendedorFilter() ? (vendSel === 'all' ? 'Todos os vendedores' : dashVendedorNome(vendSel)) : 'Minha carteira';

    // --- barra de cima
    const firstName = has('getFirstName') ? getFirstName() : '';
    const greeting = has('getGreeting') ? getGreeting() : 'Olá';
    const hoje = now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
    setPageMeta('comercial:dashboard', `${greeting}${firstName ? ', ' + firstName : ''}`, `${cap(hoje)} · ${ctxFranquia || 'Comercial'}`);

    // --- filtros
    const mesAtivo = periodo.kind === 'month' ? periodo.monthKey : '';
    const outroMes = mesAtivo && mesAtivo !== currMonth;
    const customAtivo = periodo.kind === 'custom';
    const pFrom = customAtivo ? periodo.from : `${currMonth}-01`;
    const pTo = customAtivo ? periodo.to : toDashISODate(now);
    const seg = (p, label, on) => `<button class="${on ? 'on' : ''}" onclick="setDashPeriod('${p}')">${label}</button>`;
    const scopeIds = state.isAdmin && state.adminViewAll
      ? [...new Set([...clientesScope, ...propostasScope, ...vendasScope].map((i) => String(i?.franquia_id || '').trim()).filter(Boolean)
          .concat((state.franquiasCatalog || []).map((i) => String(i?.id || '').trim()).filter(Boolean)))].sort((a, b) => getFranquiaNameById(a).localeCompare(getFranquiaNameById(b)))
      : null;
    const filtros = `
      <div class="v2-filters">
        <div class="v2-seg">${seg(currMonth, 'Este mês', mesAtivo === currMonth)}${seg('last3', 'Últimos 3 meses', periodo.kind === 'last3')}${seg('all', 'Geral', geral)}</div>
        <select class="v2-select ${outroMes ? 'on' : ''}" onchange="if (this.value) setDashPeriod(this.value)" title="Escolher mês">
          <option value="" ${outroMes ? '' : 'selected'}>Outro mês</option>
          ${months.map((m) => `<option value="${m}" ${outroMes && mesAtivo === m ? 'selected' : ''}>${cap(formatMonthLabel(m))}</option>`).join('')}
        </select>
        <div style="position:relative" id="dash-period-picker-wrap">
          <button type="button" class="v2-pill ${customAtivo ? 'on' : ''}" onclick="toggleDashPeriodPicker(event)">${ic('calendar-range')}${customAtivo ? esc(periodo.label) : 'Período'}</button>
          <div id="dash-period-picker" class="v2-picker hidden">
            <label>De<input id="dash-period-from" type="date" value="${pFrom}"></label>
            <label>Até<input id="dash-period-to" type="date" value="${pTo}"></label>
            <button type="button" class="v2-btnp" onclick="applyDashCustomPeriod()">Aplicar</button>
          </div>
        </div>
        <div class="v2-grow"></div>
        ${scopeIds ? `<select class="v2-select ${String(state.adminScopeFranquiaId || 'all') !== 'all' ? 'on' : ''}" onchange="setAdminScopeFranquia(this.value)"><option value="all">Todas as franquias</option>${scopeIds.map((id) => `<option value="${esc(id)}" ${String(state.adminScopeFranquiaId || 'all') === String(id) ? 'selected' : ''}>${esc(getFranquiaNameById(id))}</option>`).join('')}</select>` : ''}
        ${canUseDashVendedorFilter() ? `<select class="v2-select ${vendFiltrado ? 'on' : ''}" onchange="setDashVendedor(this.value)"><option value="all">Todos os vendedores</option>${vendedorOptions.map((e) => `<option value="${esc(e)}" ${vendSel === e ? 'selected' : ''}>${esc(dashVendedorNome(e))}</option>`).join('')}</select>` : ''}
        <button class="v2-pill" onclick="refreshData()" title="Atualizar dados">${ic('refresh-cw', 'id="refresh-data-icon"')}</button>
      </div>
      <div class="v2-ctx">${ic('eye', 'style="width:14px;height:14px"')}Exibindo <b>${esc(cap(periodo.label))}</b>${ctxFranquia ? ` · <b>${esc(ctxFranquia)}</b>` : ''} · <b>${esc(ctxVendedor)}</b>${vendFiltrado ? `<button class="x" onclick="setDashVendedor('all')">limpar vendedor</button>` : ''}</div>`;

    // --- KPIs
    const kpi = (opts) => `
      <div class="v2-card v2-kpi ${opts.hero ? 'hero' : ''}" onclick="${opts.go}">
        <div class="h"><span>${opts.label}</span><div class="ic" style="background:${opts.color}1F;color:${opts.color}">${ic(opts.icon)}</div></div>
        <div class="v">${opts.value}</div>
        <div class="foot">${opts.delta || ''}<span>${opts.sub}</span></div>
      </div>`;
    const kpis = `<div class="v2-kpis">
      ${kpi({ hero: 1, label: geral ? 'Vendido (toda a base)' : 'Vendido no período', value: moneyC(total), icon: 'badge-dollar-sign', color: '#008FD4', delta: delta(total, totalPrev, periodo), sub: qtd ? `${qtd} venda${qtd > 1 ? 's' : ''} · ticket ${moneyC(ticket)}` : 'nenhuma venda', go: "setTab('vendas')" })}
      ${kpi({ label: 'Propostas', value: propostasPer.length, icon: 'send', color: '#FAA519', delta: delta(propostasPer.length, propostasPrev.length, periodo), sub: geral ? 'orçamentos gerados' : 'criadas no período', go: "setTab('propostas')" })}
      ${kpi({ label: 'Proposta → venda', value: convPV === null ? 'n/d' : convPV + '%', icon: 'target', color: '#1FA971', sub: `${qtd} de ${propostasPer.length} proposta${propostasPer.length === 1 ? '' : 's'}`, go: "setTab('vendas')" })}
      ${kpi({ label: geral ? 'Clientes na carteira' : 'Clientes novos', value: clientesPer.length, icon: 'users', color: '#808284', delta: delta(clientesPer.length, clientesPrev.length, periodo), sub: geral ? 'toda a base' : `carteira total ${clientesDash.length}`, go: "setTab('clientes')" })}
    </div>`;

    // --- vendas por mês (gráfico)
    const S = renderDashboardV2;
    S.meses = S.meses || 6;
    const serie = [];
    for (let i = S.meses - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const v = vendasDash.filter((x) => toMonthKey(x.created_at) === key).reduce((s, x) => s + (Number(x.kit_price) || 0), 0);
      serie.push([d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''), v]);
    }
    const mx = Math.max(...serie.map((x) => x[1]), 1);
    const grafico = `
      <div class="v2-card">
        <div class="v2-ch"><div><h3>Vendas por mês</h3><small>Valor fechado nos últimos meses</small></div>
          <div class="v2-seg flat">${[3, 6, 12].map((n) => `<button class="${S.meses === n ? 'on' : ''}" onclick="uiV2Screens.setMeses(${n})">${n}M</button>`).join('')}</div></div>
        <div class="v2-bars">${serie.map((x, i) => `<div class="v2-bar ${i === serie.length - 1 ? 'last' : ''}"><div class="b" data-v="${moneyC(x[1])}" style="height:0" data-h="${Math.max((x[1] / mx) * 100, x[1] ? 3 : 0)}"></div><span>${esc(x[0])}</span></div>`).join('')}</div>
      </div>`;

    // --- funil
    const fs = (k, label, cls, conv) => `
      <div class="v2-fs"><div class="t"><span>${label}${conv !== null && conv !== undefined ? `<em>${conv}% passaram</em>` : ''}</span><b>${funil[k]}</b></div>
        <div class="v2-track ${cls}"><div style="width:0" data-w="${Math.max(Math.round((funil[k] / maxF) * 100), funil[k] ? 3 : 0)}"></div></div></div>`;
    const funilCard = `
      <div class="v2-card">
        <div class="v2-ch"><div><h3>Funil do período</h3><small>Clientes que entraram, pelo status atual</small></div><button class="v2-ghost" onclick="setTab('funil')" title="Abrir funil">${ic('arrow-up-right')}</button></div>
        <div class="v2-funnel">
          ${fs('NOVO', 'Novos', '', passou('NOVO', 'PROPOSTA ENVIADA'))}
          ${fs('PROPOSTA ENVIADA', 'Proposta enviada', '', passou('PROPOSTA ENVIADA', 'EM NEGOCIAÇÃO'))}
          ${fs('EM NEGOCIAÇÃO', 'Em negociação', '', passou('EM NEGOCIAÇÃO', 'FECHADO'))}
          ${fs('FECHADO', 'Fechado', 'o')}
        </div>
        <div class="v2-note">${ic('zap')}<span>Proposta → venda no período: <b>${convPV === null ? 'n/d' : convPV + '%'}</b>${qtd ? ` · ticket médio <b>${moneyC(ticket)}</b>` : ''}</span></div>
      </div>`;

    // --- últimas propostas
    const ultimas = [...propostasDash].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)).slice(0, 6);
    const propostasCard = `
      <div class="v2-card">
        <div class="v2-ch"><div><h3>Últimas propostas</h3><small>As mais recentes do seu recorte</small></div><button class="v2-btn2" onclick="setTab('propostas')">Ver todas${ic('arrow-right')}</button></div>
        ${ultimas.length ? `<div class="v2-tscroll"><table class="v2-table"><thead><tr><th>Cliente</th><th class="hide-m">Kit</th><th>Valor</th><th class="hide-m">Status</th></tr></thead><tbody>
          ${ultimas.map((p) => {
            const st = PROP_ST[String(p.status || 'GERADA').toUpperCase()] || PROP_ST.GERADA;
            const valor = has('propostaPreco') ? propostaPreco(p) : p.kit_price;
            const vistas = Number(p.vista_count) || 0;
            const open = p.cliente_id ? `openCrm360('${esc(p.cliente_id)}','propostas')` : "setTab('propostas')";
            return `<tr onclick="${open}"><td><div class="v2-who"><i class="v2-ini">${esc(initials(p.cliente_nome))}</i><div>${esc(p.cliente_nome || 'Cliente')}<small>${p.numero ? '#' + esc(p.numero) + ' · ' : ''}${esc(formatDate(p.created_at))}${vistas ? ` · aberta ${vistas}×` : ''}</small></div></div></td>
              <td class="hide-m muted" style="max-width:220px;overflow:hidden;text-overflow:ellipsis">${esc(p.kit_nome || '—')}</td>
              <td style="font-weight:800">${valor ? money(valor) : '—'}</td>
              <td class="hide-m"><span class="v2-chip dot ${st[1]}">${st[0]}</span></td></tr>`;
          }).join('')}
        </tbody></table></div>` : `<div class="v2-empty">Nenhuma proposta ainda.</div>`}
      </div>`;

    // --- ação rápida + comunicados
    const svc = window.comunicadosService;
    const comunicados = svc && typeof svc.listPublished === 'function' ? svc.listPublished() : [];
    const comunicadosCard = `
      <div class="v2-card">
        <div class="v2-ch"><div><h3>Comunicados</h3><small>${comunicados.length ? comunicados.length + ' publicado' + (comunicados.length > 1 ? 's' : '') : 'Nada publicado ainda'}</small></div></div>
        ${comunicados.slice(0, 3).map((c) => `<div class="v2-com" role="button" tabindex="0" onclick="openDashComunicadoModalById('${encodeURIComponent(String(c.id || ''))}')">
            <img src="${esc(has('safeImageUrl') ? safeImageUrl(c.coverImageUrl, 'assets/img/logo-light.png') : '')}" alt="" loading="lazy" onerror="this.src='assets/img/logo-light.png';this.onerror=null;">
            <div class="tx"><b>${esc(c.title || 'Comunicado')}</b><small>${esc(cap(c.type || 'comunicado'))} · ${esc(formatDate(c.publishedAt || c.createdAt))}</small></div></div>`).join('') || '<div class="v2-empty">Sem comunicados por enquanto.</div>'}
      </div>`;
    const quickCard = `
      <div class="v2-card v2-quick">
        <h3>Tem um cliente em mente?</h3><p>Monte o orçamento agora, com kit e financiamento.</p>
        <button class="v2-btno" onclick="openNovaPropostaPicker()">${ic('file-plus-2')}Nova proposta</button>
        <button class="v2-btn2" onclick="setTab('clientes')">${ic('users')}Ir para clientes</button>
      </div>`;

    // --- análise do recorte (admin / gestor com a unidade)
    const mostraAnalise = state.isAdmin || (state.isGestor && state.gestorViewAll);
    let analise = '';
    if (mostraAnalise) {
      const m = buildDashboardAdminMetrics(state.dashPeriod, clientesDash, propostasDash, vendasDash, vendasScope);
      const topFr = state.isAdmin && state.adminViewAll && String(state.adminScopeFranquiaId || 'all') === 'all';
      const vendedores = m.topSellers.length ? m.topSellers.map((s, i) => {
        const sel = vendSel === s.email;
        return `<div class="v2-lst click ${sel ? 'sel' : ''}" onclick="setDashVendedor(decodeURIComponent('${sel ? 'all' : encodeURIComponent(s.email)}'))"><span class="pos">${i + 1}</span><i class="v2-ini round ${i === 0 ? 'o' : 'g'}">${esc(initials(s.nome))}</i><div class="tx"><b>${esc(s.nome)}</b><small>${s.qtd} venda${s.qtd > 1 ? 's' : ''} · ticket ${moneyC(s.ticket)}${sel ? ' · filtrando' : ''}</small></div><div class="val">${moneyC(s.total)}</div></div>`;
      }).join('') : '<div class="v2-empty">Sem vendas no recorte.</div>';
      const franquias = m.topFranchises.length ? m.topFranchises.map((f, i) => `<div class="v2-lst"><span class="pos">${i + 1}</span><i class="v2-ini">${esc(initials(f.nome))}</i><div class="tx"><b>${esc(f.nome)}</b><small>${f.qtd} venda${f.qtd > 1 ? 's' : ''}</small></div><div class="val">${moneyC(f.total)}</div></div>`).join('') : '<div class="v2-empty">Sem vendas no recorte.</div>';
      const parados = m.aging.map((a) => `<div class="v2-lst"><i class="v2-ini ${a.qty ? 'o' : 'g'}">${ic(a.qty ? 'alarm-clock' : 'check', 'style="width:16px;height:16px"')}</i><div class="tx"><b>${esc(cap(a.status))}</b><small>parados há mais de ${a.limit} dias</small></div><span class="v2-chip ${a.qty ? 't-red' : 't-green'}">${a.qty}</span></div>`).join('');
      analise = `<div class="v2-row ${topFr ? 'r3' : 'r2'}">
        <div class="v2-card"><div class="v2-ch"><div><h3>Vendedores no recorte</h3><small>Clique para filtrar o painel</small></div></div>${vendedores}</div>
        ${topFr ? `<div class="v2-card"><div class="v2-ch"><div><h3>Franquias</h3><small>Valor fechado no recorte</small></div></div>${franquias}</div>` : ''}
        <div class="v2-card"><div class="v2-ch"><div><h3>Clientes parados</h3><small>${vendFiltrado ? 'de ' + esc(dashVendedorNome(vendSel)) : 'todo o recorte'}</small></div></div>${parados}</div>
      </div>`;
    }

    const meta = has('renderMetaBlock') ? renderMetaBlock() : '';
    const metasEquipe = has('renderMetasEquipeBlock') ? renderMetasEquipeBlock() : '';

    container.innerHTML = `
      ${filtros}
      ${kpis}
      ${meta ? `<div class="v2-legacy">${meta}</div>` : ''}
      <div class="v2-row">${grafico}${funilCard}</div>
      <div class="v2-row">${propostasCard}<div style="display:flex;flex-direction:column;gap:16px;min-width:0">${quickCard}${comunicadosCard}</div></div>
      ${analise}
      ${metasEquipe ? `<div class="v2-legacy">${metasEquipe}</div>` : ''}
    `;
    if (has('ensureDashComunicadoModal')) ensureDashComunicadoModal();
    if (window.lucide) window.lucide.createIcons();
    requestAnimationFrame(() => {
      container.querySelectorAll('.v2-bar .b[data-h]').forEach((b) => { b.style.height = b.dataset.h + '%'; });
      container.querySelectorAll('.v2-track div[data-w]').forEach((d) => { d.style.width = d.dataset.w + '%'; });
    });
  }

  // ==================== CLIENTES e FUNIL (Comercial) ====================
  const ST_CLI = { NOVO: ['Novo', 't-gray', '#808284'], 'PROPOSTA ENVIADA': ['Proposta enviada', 't-blue', '#008FD4'], 'EM NEGOCIAÇÃO': ['Em negociação', 't-orange', '#FAA519'], FECHADO: ['Fechado', 't-green', '#1FA971'], PERDIDO: ['Perdido', 't-red', '#D14343'] };
  const stCli = (s) => ST_CLI[normalizeClientStatus(s)] || ST_CLI.NOVO;
  const vendNome = (email) => (has('dashVendedorNome') ? dashVendedorNome(email) : String(email || '').split('@')[0]);

  // mesma fonte e mesmos filtros de clientes.js (admin x regular)
  function clientesRows() {
    if (has('buildCrmAggregates')) buildCrmAggregates();
    const source = state.isAdmin ? applyAdminGlobalScope(state.clientes || []) : (Array.isArray(state.clientes) ? state.clientes : []);
    const filtered = state.isAdmin ? applyAdminClientesFilters(source) : applyRegularClientesFilters(source);
    state.lastFilteredClientes = filtered;
    return { source, filtered, showSeller: (state.isAdmin && state.adminViewAll) || (state.isGestor && state.gestorViewAll), showFranquia: state.isAdmin && state.adminViewAll };
  }
  const searchValue = () => (state.isAdmin ? (state.adminClientesFilters?.search || '') : (state.searchTerm || ''));
  const statusFilter = () => (state.isAdmin ? (state.adminClientesFilters?.status || 'TODOS') : (state.clienteFilter || 'TODOS'));
  const setStatusJs = (s) => (state.isAdmin ? `setAdminClientesFilter('status','${s}')` : `setClienteFilter('${s}')`);
  function statusPills(source, current) {
    const counts = { TODOS: source.length };
    source.forEach((c) => { const s = normalizeClientStatus(c.status); counts[s] = (counts[s] || 0) + 1; });
    return `<div class="v2-pills">${CLIENT_STATUS_OPTIONS.map((s) => `<button class="${current === s ? 'on' : ''}" onclick="${setStatusJs(s)}">${s === 'TODOS' ? 'Todos' : ST_CLI[s][0]}<em>${counts[s] || 0}</em></button>`).join('')}</div>`;
  }
  function searchBox(placeholder) {
    return `<label class="v2-sbox">${ic('search')}<input id="v2-cli-search" type="text" value="${esc(searchValue())}" oninput="handleFunilSearchInput(this.value)" placeholder="${placeholder}" autocomplete="off"></label>`;
  }
  function adminFiltersRow(source) {
    if (!state.isAdmin) return '';
    ensureAdminClientesFiltersState();
    const f = state.adminClientesFilters;
    const o = getAdminClienteFilterOptions(source);
    const sel = (key, allLabel, opts, cur) => `<select class="v2-select ${cur && cur !== 'all' ? 'on' : ''}" onchange="setAdminClientesFilter('${key}', this.value)"><option value="all">${allLabel}</option>${opts}</select>`;
    const ativos = [f.vendedor_email, state.adminViewAll ? f.franquia_id : 'all', f.mes, f.cidade].filter((v) => v && v !== 'all').length + (f.preset && f.preset !== 'all' ? 1 : 0);
    return `<button class="v2-pill v2-filtbtn ${ativos ? 'on' : ''}" onclick="uiV2Screens.toggleFiltros()">${ic('sliders-horizontal')}Filtros${ativos ? ' · ' + ativos : ''}</button>
    <div class="v2-filters v2-admfilters ${uiV2Screens.filtrosAbertos ? 'open' : ''}">
      ${sel('vendedor_email', 'Todos os vendedores', o.vendedores.map((v) => `<option value="${esc(v.email)}" ${f.vendedor_email === v.email ? 'selected' : ''}>${esc(v.nome)}</option>`).join(''), f.vendedor_email)}
      ${state.adminViewAll ? sel('franquia_id', 'Todas as franquias', o.franquias.map((x) => `<option value="${esc(x.id)}" ${String(f.franquia_id) === String(x.id) ? 'selected' : ''}>${esc(x.nome)}</option>`).join(''), f.franquia_id) : ''}
      ${sel('mes', 'Qualquer mês', o.meses.map((m) => `<option value="${m}" ${f.mes === m ? 'selected' : ''}>${cap(formatMonthLabel(m))}</option>`).join(''), f.mes)}
      ${sel('cidade', 'Todas as cidades', o.cidades.map((c) => `<option value="${esc(c)}" ${f.cidade === c ? 'selected' : ''}>${esc(c)}</option>`).join(''), f.cidade)}
      <div class="v2-seg">${ADMIN_CLIENT_PRESETS.map((p) => `<button class="${String(f.preset || 'all') === p.v ? 'on' : ''}" onclick="setAdminClientesPreset('${p.v}')">${esc(p.l)}</button>`).join('')}</div>
      <button class="v2-pill" onclick="resetAdminClientesFilters()">${ic('filter-x')}Limpar</button>
    </div>`;
  }
  function scopeLabel(source) {
    if (!state.isAdmin) return state.franquiaNome || 'Minha carteira';
    if (!state.adminViewAll) return state.franquiaNome || 'Minha unidade';
    return String(state.adminScopeFranquiaId || 'all') === 'all' ? 'Todas as franquias' : getFranquiaNameById(state.adminScopeFranquiaId);
  }
  const waLink = (c) => (has('buildClientWhatsappLink') ? buildClientWhatsappLink(c) : '');
  const followLate = (c) => c && c.proxima_acao_em && new Date(c.proxima_acao_em) < new Date();

  function renderClientesListV2(container) {
    container.className = 'v2s';
    document.body.dataset.v2screen = 'clientes';
    const { source, filtered, showSeller } = clientesRows();
    const cur = statusFilter();
    setPageMeta('comercial:clientes', 'Clientes', `${filtered.length} de ${source.length} · ${scopeLabel(source)}`);

    const adminBtns = state.isAdmin ? `
      <button class="v2-btn2 hide-m" onclick="openCrmDuplicatas()" title="Revisar cadastros com o mesmo telefone">${ic('merge')}Duplicatas</button>
      <button class="v2-btn2 hide-m" onclick="adminEnriquecerCidades()" title="Preenche coordenadas e HSP dos clientes antigos">${ic('sun')}HSP</button>` : '';
    const sortSeg = !state.isAdmin ? `<div class="v2-seg flat">${CLIENT_SORT_OPTIONS.map((o) => `<button class="${state.clienteSort === o.v ? 'on' : ''}" onclick="setClienteSort('${o.v}')">${o.v === 'alpha' ? 'A–Z' : 'Mais recentes'}</button>`).join('')}</div>` : '';

    const visiveis = filtered.slice(0, _clientesRenderLimit);
    const rows = visiveis.map((c) => {
      const st = stCli(c.status);
      const nProp = (_crmAgg.propostasByCliente || {})[c.id] || 0;
      const nVend = (_crmAgg.vendasByCliente || {})[c.id] || 0;
      const valor = has('getClienteValorEstimado') ? getClienteValorEstimado(c.id) : 0;
      const wa = waLink(c);
      return `<tr onclick="openCrm360('${esc(c.id)}')">
        <td><div class="v2-who"><i class="v2-ini">${esc(initials(c.nome))}</i><div>${esc(c.nome || 'Cliente')} ${followLate(c) ? `<span class="v2-alarm" title="Follow-up atrasado: ${esc(c.proxima_acao_nota || 'agendado')}">${ic('alarm-clock')}</span>` : ''}<small>${esc(c.telefone || '—')}</small><span class="show-m" style="margin-top:6px"><span class="v2-chip dot ${st[1]}">${st[0]}</span></span></div></div></td>
        <td class="hide-m">${esc(c.cidade || '—')}${Number(c.hsp) > 0 ? `<small class="muted" style="display:block;font-size:12px">HSP ${esc(String(c.hsp).replace('.', ','))}</small>` : ''}</td>
        <td class="hide-m"><button class="v2-chip dot ${st[1]} v2-stbtn" onclick="openClientStatusMenu(event, '${esc(c.id)}')" title="Alterar status">${st[0]}</button></td>
        <td class="hide-m">${nProp ? `${nProp} proposta${nProp > 1 ? 's' : ''}` : '<span class="muted">—</span>'}${nVend ? `<small style="display:block;font-size:12px;color:#1FA971;font-weight:700">${nVend} venda${nVend > 1 ? 's' : ''}</small>` : ''}</td>
        <td class="hide-m" style="font-weight:800">${valor ? moneyC(valor) : '<span class="muted" style="font-weight:500">—</span>'}</td>
        ${showSeller ? `<td class="hide-m"><span class="v2-who" style="font-weight:600;font-size:13px"><i class="v2-ini round o" style="width:26px;height:26px;font-size:10px">${esc(initials(vendNome(c.vendedor_email)))}</i>${esc(vendNome(c.vendedor_email))}</span></td>` : ''}
        <td class="hide-m muted">${esc(formatDate(c.created_at))}</td>
        <td><div class="v2-acts">
          ${wa ? `<a class="v2-sq wa" href="${esc(wa)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()" title="WhatsApp">${ic('message-circle')}</a>` : ''}
          <button class="v2-sq hide-m" onclick="event.stopPropagation(); openProposalBuilder('${esc(c.id)}')" title="Nova proposta">${ic('file-plus-2')}</button>
          <button class="v2-sq" onclick="event.stopPropagation(); openCrm360('${esc(c.id)}')" title="Abrir ficha">${ic('chevron-right')}</button>
        </div></td></tr>`;
    }).join('');

    container.innerHTML = `
      <div class="v2-toolbar">
        ${searchBox(state.isAdmin ? 'Nome, telefone, cidade ou vendedor' : 'Buscar por nome, telefone ou cidade')}
        ${sortSeg}
        <div class="v2-grow"></div>
        ${adminBtns}
        <button class="v2-btn2 hide-m" onclick="exportClientesXLSX()">${ic('download')}XLSX</button>
        <button class="v2-btnp" onclick="openClientModal()">${ic('user-plus')}Novo cliente</button>
      </div>
      ${statusPills(source, cur)}
      ${adminFiltersRow(source)}
      <div class="v2-card" style="padding:14px 16px">
        ${filtered.length ? `<div class="v2-tscroll"><table class="v2-table">
          <thead><tr><th>Cliente</th><th class="hide-m">Cidade</th><th class="hide-m">Status</th><th class="hide-m">Propostas</th><th class="hide-m">Em aberto</th>${showSeller ? '<th class="hide-m">Vendedor</th>' : ''}<th class="hide-m">Cadastro</th><th></th></tr></thead>
          <tbody>${rows}</tbody></table></div>`
        : `<div class="v2-empty">${source.length ? 'Nenhum cliente com esses filtros.' : 'Nenhum cliente na carteira ainda.'}<div style="margin-top:12px"><button class="v2-btnp" onclick="openClientModal()">${ic('user-plus')}Cadastrar cliente</button></div></div>`}
      </div>
      ${filtered.length > visiveis.length ? `<div class="v2-more"><button class="v2-btn2" onclick="clientesMostrarMais()">${ic('chevrons-down')}Carregar mais · ${visiveis.length} de ${filtered.length}</button></div>` : ''}`;
    if (window.lucide) window.lucide.createIcons();
  }

  function renderFunilV2(container) {
    container.className = 'v2s';
    document.body.dataset.v2screen = 'funil';
    const { source, filtered, showSeller } = clientesRows();
    setPageMeta('comercial:funil', 'Funil', `${filtered.length} clientes · arraste os cards entre as etapas`);
    const filtrosAtivos = has('funilActiveFilterCount') ? funilActiveFilterCount() : 0;

    let vendSelect = '';
    if (state.isAdmin) {
      const vendSel = String(state.adminClientesFilters?.vendedor_email || 'all');
      const opts = getAdminClienteFilterOptions(source).vendedores;
      if (vendSel !== 'all' && !opts.some((v) => v.email === vendSel)) opts.unshift({ email: vendSel, nome: vendNome(vendSel) });
      vendSelect = `<select class="v2-select ${vendSel !== 'all' ? 'on' : ''}" onchange="setAdminClientesFilter('vendedor_email', this.value)"><option value="all">Todos os vendedores</option>${opts.map((v) => `<option value="${esc(v.email)}" ${vendSel === v.email ? 'selected' : ''}>${esc(v.nome)}</option>`).join('')}</select>`;
    }

    const card = (c) => {
      const nProp = (_crmAgg.propostasByCliente || {})[c.id] || 0;
      const nVend = (_crmAgg.vendasByCliente || {})[c.id] || 0;
      const valor = has('getClienteValorEstimado') ? getClienteValorEstimado(c.id) : 0;
      const st = stCli(c.status);
      const wa = waLink(c);
      const meta = [];
      meta.push(`<span>${ic('file-text')}${nProp} proposta${nProp === 1 ? '' : 's'}</span>`);
      if (nVend) meta.push(`<span style="color:#1FA971">${ic('trophy')}${nVend}</span>`);
      if (showSeller && c.vendedor_email) meta.push(`<span>${ic('user')}${esc(vendNome(c.vendedor_email).split(' ')[0])}</span>`);
      return `<article class="v2-kcard" draggable="true" ondragstart="crmDragStart(event, '${esc(c.id)}')" onclick="openCrm360('${esc(c.id)}')">
        <div class="t"><div><b>${esc(c.nome || 'Cliente')}${followLate(c) ? `<span class="v2-alarm" title="Follow-up atrasado">${ic('alarm-clock')}</span>` : ''}</b><small>${esc([c.cidade, c.telefone].filter(Boolean).join(' · ') || '—')}</small></div>
          ${wa ? `<a class="v2-sq wa" href="${esc(wa)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()" title="WhatsApp">${ic('message-circle')}</a>` : ''}</div>
        <div class="meta">${meta.join('')}</div>
        <div class="f">${valor ? `<b>${moneyC(valor)}</b>` : '<span class="none">Sem proposta</span>'}
          <button class="v2-chip dot ${st[1]} v2-stbtn" onclick="openClientStatusMenu(event, '${esc(c.id)}')" title="Mudar etapa">${st[0]}</button></div>
      </article>`;
    };

    const cols = CLIENT_STATUS_ALL.map((s) => {
      const items = filtered.filter((c) => normalizeClientStatus(c.status) === s);
      const limite = _funilColLimit[s] || CLIENTES_RENDER_LOTE;
      const vis = items.slice(0, limite);
      const soma = items.reduce((acc, c) => acc + (has('getClienteValorEstimado') ? getClienteValorEstimado(c.id) : 0), 0);
      return `<div class="v2-col" ondragover="crmDragOver(event)" ondragleave="crmDragLeave(event)" ondrop="crmDropStatus(event, '${s}')">
        <div class="v2-colh"><i class="dot" style="background:${ST_CLI[s][2]}"></i><b>${ST_CLI[s][0]}</b><em>${items.length}</em><small>${soma ? moneyC(soma) : ''}</small></div>
        ${vis.length ? vis.map(card).join('') : '<div class="v2-drop">Arraste um cliente para cá</div>'}
        ${items.length > vis.length ? `<button class="v2-colmore" onclick="funilMostrarMaisColuna('${s}')">${ic('chevrons-down')}Ver mais ${items.length - vis.length}</button>` : ''}
      </div>`;
    }).join('');

    const higiene = has('renderHigieneBanner') ? renderHigieneBanner() : '';
    container.innerHTML = `
      <div class="v2-toolbar">
        ${searchBox('Buscar no funil por nome, telefone ou cidade')}
        ${vendSelect}
        ${filtrosAtivos ? `<div class="v2-pills"><button class="warn" onclick="funilLimparFiltros()">${ic('filter-x')}${filtrosAtivos} filtro${filtrosAtivos > 1 ? 's' : ''} da aba Clientes · limpar</button></div>` : ''}
        <div class="v2-grow"></div>
        <button class="v2-btn2" onclick="setTab('clientes')">${ic('list')}Ver em lista</button>
        <button class="v2-btn2 hide-m" onclick="exportClientesXLSX()">${ic('download')}XLSX</button>
        <button class="v2-btnp" onclick="openClientModal()">${ic('user-plus')}Novo lead</button>
      </div>
      ${higiene ? `<div class="v2-legacy">${higiene}</div>` : ''}
      <div class="v2-kanban">${cols}</div>`;
    if (window.lucide) window.lucide.createIcons();
  }

  // ==================== PROPOSTAS (Comercial) ====================
  const PROP_INFO = {
    GERADA: ['file-clock', 'Gerada, ainda não enviada ao cliente', 'g'],
    ENVIADA: ['send', 'Enviada, aguardando o cliente abrir', 'b'],
    VISTA: ['eye', '', 'o'],
    ACEITA: ['badge-check', 'Aceita, venda vinculada', 'gr'],
  };
  const timeAgo = (d) => (has('crmTimeAgo') ? crmTimeAgo(d) : formatDate(d));

  function renderPropostasListV2(container) {
    container.className = 'v2s';
    document.body.dataset.v2screen = 'propostas';
    if (typeof _propostasObserver !== 'undefined' && _propostasObserver) { _propostasObserver.disconnect(); _propostasObserver = null; }
    const { escopo, rows, filtered, term, vendedor, mes, status } = getPropostasFiltradas();

    // mesmos números do topo de app.js (escopo + vendedor + mês)
    const now = new Date();
    const soma = rows.reduce((a, p) => a + propostaPreco(p), 0);
    const ticket = rows.length ? soma / rows.length : 0;
    const fechadoIds = new Set(getDashboardScopedRows(state.clientes || []).filter((c) => String(c.status || '').toUpperCase() === 'FECHADO').map((c) => c.id));
    const maior = new Map();
    rows.forEach((p) => { if (!fechadoIds.has(p.cliente_id)) return; const v = propostaPreco(p); if (v > (maior.get(p.cliente_id) || 0)) maior.set(p.cliente_id, v); });
    const valorFechado = [...maior.values()].reduce((a, b) => a + b, 0);
    const noMes = rows.filter((p) => { const d = new Date(p.created_at); return !Number.isNaN(d.getTime()) && d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth(); }).length;
    const count = { ALL: rows.length };
    rows.forEach((p) => { const s = propostaStatus(p); count[s] = (count[s] || 0) + 1; });

    setPageMeta('comercial:propostas', 'Propostas', `${rows.length} proposta${rows.length === 1 ? '' : 's'} · ${noMes} no mês`);

    const vendOpts = canUseDashVendedorFilter()
      ? getDashboardVendedorOptions([escopo]).map((e) => ({ v: e, l: dashVendedorNome(e) })).sort((a, b) => a.l.localeCompare(b.l, 'pt-BR'))
      : [];
    if (vendedor !== 'all' && !vendOpts.some((o) => o.v === vendedor)) vendOpts.unshift({ v: vendedor, l: dashVendedorNome(vendedor) });
    const mesOpts = [...new Set(escopo.map((p) => toMonthKey(p.created_at)).filter(Boolean))].sort().reverse();
    const filtrosAtivos = [vendedor !== 'all', mes !== 'all', status !== 'ALL', Boolean(term)].filter(Boolean).length;
    const showSeller = canUseDashVendedorFilter();

    const kpi = (label, value, icon, color, sub, hero) => `<div class="v2-card v2-kpi ${hero ? 'hero' : ''}" style="cursor:default"><div class="h"><span>${label}</span><div class="ic" style="background:${color}1F;color:${color}">${ic(icon)}</div></div><div class="v">${value}</div><div class="foot"><span>${sub}</span></div></div>`;
    const card = (p) => {
      const st = propostaStatus(p);
      const [stl, stc] = PROP_ST[st] || PROP_ST.GERADA;
      const inf = PROP_INFO[st] || PROP_INFO.GERADA;
      const kwp = propostaPotencia(p);
      const ger = Number(p.geracao_estimada) || 0;
      const vistas = Number(p.vista_count) || 0;
      const infoTxt = st === 'VISTA' ? `Aberta ${vistas > 1 ? vistas + '× · última ' : ''}${esc(timeAgo(p.vista_em || p.created_at))}` : inf[1];
      const open = p.cliente_id ? `openCrm360('${esc(p.cliente_id)}','propostas')` : '';
      return `<div class="v2-card v2-pcard" ${open ? `onclick="${open}"` : ''}>
        <div class="hd"><i class="v2-ini ${st === 'ACEITA' ? 'gr' : st === 'VISTA' ? 'o' : ''}">${esc(initials(p.cliente_nome))}</i><div class="tx"><b>${esc(p.cliente_nome || 'Sem cliente')}</b><small>${p.numero ? '#' + esc(p.numero) + ' · ' : ''}${esc(formatDate(p.created_at))}</small></div><span class="v2-chip dot ${stc}">${stl}</span></div>
        <div class="kit">${ic('solar-panel')}<span>${esc(p.kit_nome || 'Proposta personalizada')}</span></div>
        <div class="specs"><div><small>Potência</small><b>${kwp ? esc(String(kwp).replace('.', ',')) + ' kWp' : '—'}</b></div><div><small>Geração</small><b>${ger ? Math.round(ger).toLocaleString('pt-BR') + ' kWh' : '—'}</b></div><div><small>${showSeller ? 'Vendedor' : 'Criada'}</small><b>${showSeller ? esc(vendNome(p.vendedor_email).split(' ')[0] || '—') : esc(timeAgo(p.created_at))}</b></div></div>
        <div class="info ${inf[2]}">${ic(inf[0])}<span>${infoTxt}</span></div>
        <div class="ft"><div class="price">${money(propostaPreco(p))}<small>${ticket && propostaPreco(p) > ticket ? 'acima do ticket médio' : 'valor da proposta'}</small></div>
          <div class="v2-acts">
            <button class="v2-sq" title="Copiar link da proposta" onclick="event.stopPropagation(); uiV2Screens.copiarLink('${esc(p.id)}')">${ic('link')}</button>
            <a class="v2-sq" title="Baixar PDF" href="proposta-pdf.html?id=${encodeURIComponent(p.id)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">${ic('file-down')}</a>
            <a class="v2-sq" title="Abrir a proposta como o cliente vê" href="proposta.html?id=${encodeURIComponent(p.id)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">${ic('external-link')}</a>
          </div></div>
      </div>`;
    };
    const visible = filtered.slice(0, _propostasRenderLimit);
    const pill = (v, label) => `<button class="${status === v ? 'on' : ''}" onclick="setPropostasFiltro('status','${v}')">${label}<em>${count[v] || 0}</em></button>`;

    container.innerHTML = `
      <div class="v2-kpis">
        ${kpi('Valor fechado', moneyC(valorFechado), 'badge-dollar-sign', '#008FD4', 'maior proposta de cada cliente fechado', true)}
        ${kpi('Vistas pelo cliente', count.VISTA || 0, 'eye', '#FAA519', 'abriram o link da proposta')}
        ${kpi('Aceitas', count.ACEITA || 0, 'badge-check', '#1FA971', 'com venda vinculada')}
        ${kpi('Ticket médio', moneyC(ticket), 'receipt', '#808284', `sobre ${rows.length} proposta${rows.length === 1 ? '' : 's'}`)}
      </div>
      <div class="v2-toolbar">
        <label class="v2-sbox">${ic('search')}<input id="v2-prop-search" type="text" value="${esc(state.propostasSearch || '')}" oninput="handlePropostasSearchInput(this.value)" placeholder="Buscar por cliente ou kit" autocomplete="off"></label>
        ${vendOpts.length ? `<select class="v2-select ${vendedor !== 'all' ? 'on' : ''}" onchange="setPropostasFiltro('vendedor', this.value)"><option value="all">Todos os vendedores</option>${vendOpts.map((o) => `<option value="${esc(o.v)}" ${o.v === vendedor ? 'selected' : ''}>${esc(o.l)}</option>`).join('')}</select>` : ''}
        <select class="v2-select ${mes !== 'all' ? 'on' : ''}" onchange="setPropostasFiltro('mes', this.value)"><option value="all">Todos os meses</option>${mesOpts.map((m) => `<option value="${m}" ${m === mes ? 'selected' : ''}>${cap(formatMonthLabel(m))}</option>`).join('')}</select>
        ${filtrosAtivos ? `<button class="v2-pill" onclick="limparPropostasFiltros()">${ic('filter-x')}Limpar · ${filtered.length} de ${escopo.length}</button>` : ''}
        <div class="v2-grow"></div>
        <button class="v2-btno" style="width:auto;height:44px" onclick="openNovaPropostaPicker()">${ic('plus')}Nova proposta</button>
      </div>
      <div class="v2-pills">${pill('ALL', 'Todas')}${pill('GERADA', 'Geradas')}${pill('ENVIADA', 'Enviadas')}${pill('VISTA', 'Vistas')}${pill('ACEITA', 'Aceitas')}</div>
      ${visible.length ? `<div class="v2-pgrid">${visible.map(card).join('')}</div>` : `<div class="v2-card v2-empty">${filtrosAtivos ? 'Nenhuma proposta com esses filtros.' : 'Nenhuma proposta gerada ainda.'}<div style="margin-top:12px"><button class="v2-btnp" onclick="openNovaPropostaPicker()">${ic('plus')}Nova proposta</button></div></div>`}
      ${filtered.length > visible.length ? `<div class="v2-more"><button class="v2-btn2" onclick="uiV2Screens.maisPropostas()">${ic('chevrons-down')}Carregar mais · ${visible.length} de ${filtered.length}</button></div>` : ''}`;
    if (window.lucide) window.lucide.createIcons();
  }

  // ==================== VENDAS (Comercial) ====================
  function podium(list) {
    if (!list.length) return '<div class="v2-empty">Sem vendas no recorte.</div>';
    const ord = [1, 0, 2].filter((i) => list[i]);
    const H = [118, 88, 66], COL = ['#FAA519', '#008FD4', '#9FA2A5'];
    return `<div class="v2-podium">${ord.map((i) => { const s = list[i]; return `<div class="pod"><i class="v2-ini round ${i === 0 ? 'o' : i === 1 ? '' : 'g'}">${esc(initials(s.nome))}</i><b>${esc(String(s.nome).split(' ')[0])}</b><small>${moneyC(s.total)}</small><div class="step" style="height:${H[i]}px;background:${COL[i]}">${i + 1}º</div></div>`; }).join('')}</div>`
      + list.slice(3).map((s, k) => `<div class="v2-lst"><span class="pos">${k + 4}</span><i class="v2-ini round g">${esc(initials(s.nome))}</i><div class="tx"><b>${esc(s.nome)}</b><small>${s.qtd} venda${s.qtd > 1 ? 's' : ''} · ticket ${moneyC(s.ticket)}</small></div><div class="val">${moneyC(s.total)}</div></div>`).join('');
  }

  function renderVendasV2(container) {
    container.className = 'v2s';
    document.body.dataset.v2screen = 'vendas';
    const source = state.isAdmin ? applyAdminGlobalScope(state.vendas || []) : (Array.isArray(state.vendas) ? state.vendas : []);
    const vendas = state.isAdmin ? applyAdminVendasFilters(source) : applyRegularVendasFilters(source);
    state.lastFilteredVendas = vendas;
    const sum = computeSalesSummary(vendas);
    const showSeller = (state.isAdmin && state.adminViewAll) || (state.isGestor && state.gestorViewAll);
    const now = new Date();
    const currMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    let periodoLbl = '';
    let filtros = '';
    if (state.isAdmin) {
      ensureAdminVendasFiltersState();
      const f = state.adminVendasFilters;
      const o = getAdminSalesFilterOptions(source);
      periodoLbl = { all: 'Geral', today: 'Hoje', month: 'Mês atual', '30d': 'Últimos 30 dias' }[f.period] || cap(formatMonthLabel(f.period));
      const ativos = [f.vendedor_email, state.adminViewAll ? f.franquia_id : 'all'].filter((v) => v && v !== 'all').length + (f.min_price ? 1 : 0) + (f.max_price ? 1 : 0) + (f.preset && f.preset !== 'all' ? 1 : 0);
      filtros = `
        <div class="v2-toolbar">
          <label class="v2-sbox">${ic('search')}<input id="v2-vend-search" type="text" value="${esc(f.search || '')}" oninput="handleAdminVendasSearchInput(this.value)" placeholder="Cliente, kit ou vendedor" autocomplete="off"></label>
          <select class="v2-select ${f.period !== 'all' ? 'on' : ''}" onchange="setAdminVendasFilter('period', this.value)">
            ${[['all', 'Geral'], ['today', 'Hoje'], ['month', 'Mês atual'], ['30d', 'Últimos 30 dias']].map(([v, l]) => `<option value="${v}" ${f.period === v ? 'selected' : ''}>${l}</option>`).join('')}
            ${o.months.map((m) => `<option value="${m}" ${f.period === m ? 'selected' : ''}>${cap(formatMonthLabel(m))}</option>`).join('')}
          </select>
          <select class="v2-select" onchange="setAdminVendasFilter('sort', this.value)">${SALES_SORT_OPTIONS.map((x) => `<option value="${x.v}" ${f.sort === x.v ? 'selected' : ''}>${x.l}</option>`).join('')}</select>
          <div class="v2-grow"></div>
          <button class="v2-btn2 hide-m" onclick="exportVendasXLSX()">${ic('download')}XLSX</button>
        </div>
        <button class="v2-pill v2-filtbtn ${ativos ? 'on' : ''}" onclick="uiV2Screens.toggleFiltros()">${ic('sliders-horizontal')}Filtros${ativos ? ' · ' + ativos : ''}</button>
        <div class="v2-filters v2-admfilters ${uiV2Screens.filtrosAbertos ? 'open' : ''}">
          <select class="v2-select ${f.vendedor_email !== 'all' ? 'on' : ''}" onchange="setAdminVendasFilter('vendedor_email', this.value)"><option value="all">Todos os vendedores</option>${o.vendedores.map((v) => `<option value="${esc(v.email)}" ${f.vendedor_email === v.email ? 'selected' : ''}>${esc(vendNome(v.email))}</option>`).join('')}</select>
          ${state.adminViewAll ? `<select class="v2-select ${f.franquia_id !== 'all' ? 'on' : ''}" onchange="setAdminVendasFilter('franquia_id', this.value)"><option value="all">Todas as franquias</option>${o.franquias.map((x) => `<option value="${esc(x.id)}" ${String(f.franquia_id) === String(x.id) ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}</select>` : ''}
          <label class="v2-pill" style="cursor:text">R$ mín.<input class="v2-money" type="number" min="0" step="100" value="${esc(String(f.min_price || ''))}" onchange="setAdminVendasFilter('min_price', this.value)"></label>
          <label class="v2-pill" style="cursor:text">R$ máx.<input class="v2-money" type="number" min="0" step="100" value="${esc(String(f.max_price || ''))}" onchange="setAdminVendasFilter('max_price', this.value)"></label>
          <div class="v2-seg">${ADMIN_SALES_PRESETS.map((p) => `<button class="${String(f.preset || 'all') === p.v ? 'on' : ''}" onclick="setAdminVendasPreset('${p.v}')">${esc(p.l)}</button>`).join('')}</div>
          <button class="v2-pill" onclick="resetAdminVendasFilters()">${ic('filter-x')}Limpar</button>
        </div>`;
    } else {
      const meses = [...new Set(source.map((v) => toMonthKey(v.created_at)).filter(Boolean))].sort().reverse();
      if (!meses.includes(currMonth)) meses.unshift(currMonth);
      periodoLbl = state.vendasPeriod === 'all' ? 'Geral' : cap(formatMonthLabel(state.vendasPeriod));
      filtros = `<div class="v2-toolbar"><div class="v2-pills">
          <button class="${state.vendasPeriod === 'all' ? 'on' : ''}" onclick="setVendasPeriod('all')">Geral</button>
          ${meses.map((m) => `<button class="${state.vendasPeriod === m ? 'on' : ''}" onclick="setVendasPeriod('${m}')">${cap(formatMonthLabel(m))}${m === currMonth ? ' ·' : ''}</button>`).join('')}
        </div><div class="v2-grow"></div><button class="v2-btn2 hide-m" onclick="exportVendasXLSX()">${ic('download')}XLSX</button></div>`;
    }
    setPageMeta('comercial:vendas', state.isAdmin ? 'Vendas' : 'Minhas vendas', `${sum.qtd} venda${sum.qtd === 1 ? '' : 's'} · ${periodoLbl}`);

    const kpi = (label, value, icon, color, sub, hero) => `<div class="v2-card v2-kpi ${hero ? 'hero' : ''}" style="cursor:default"><div class="h"><span>${label}</span><div class="ic" style="background:${color}1F;color:${color}">${ic(icon)}</div></div><div class="v">${value}</div><div class="foot"><span>${sub}</span></div></div>`;
    const kwpTotal = vendas.reduce((a, v) => a + (Number(v.kit_power) || 0), 0);
    const kpis = `<div class="v2-kpis">
      ${kpi('Total vendido', moneyC(sum.totalVendido), 'badge-dollar-sign', '#008FD4', periodoLbl, true)}
      ${kpi('Negócios fechados', sum.qtd, 'handshake', '#FAA519', sum.ultima ? 'última em ' + formatDate(sum.ultima.created_at) : 'nenhuma ainda')}
      ${kpi('Ticket médio', moneyC(sum.ticketMedio), 'receipt', '#1FA971', `sobre ${sum.qtd} venda${sum.qtd === 1 ? '' : 's'}`)}
      ${kpi('Potência vendida', kwpTotal ? kwpTotal.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' kWp' : '—', 'sun', '#808284', 'soma dos kits')}
    </div>`;

    let ranking = '';
    if (state.isAdmin || (state.isGestor && state.gestorViewAll)) {
      const sellers = buildSalesRanking(vendas).map((s) => ({ ...s, nome: vendNome(s.email) }));
      const fr = state.isAdmin && state.adminViewAll ? buildFranquiaRanking(vendas) : [];
      ranking = `<div class="v2-row ${fr.length ? 'r2' : ''}" ${fr.length ? '' : 'style="grid-template-columns:1fr"'}>
        <div class="v2-card"><div class="v2-ch"><div><h3>Ranking da equipe</h3><small>Valor fechado no recorte</small></div></div>${podium(sellers)}</div>
        ${fr.length ? `<div class="v2-card"><div class="v2-ch"><div><h3>Franquias</h3><small>Valor fechado no recorte</small></div></div>${fr.map((x, i) => `<div class="v2-lst"><span class="pos">${i + 1}</span><i class="v2-ini">${esc(initials(x.nome))}</i><div class="tx"><b>${esc(x.nome)}</b><small>${x.qtd} venda${x.qtd > 1 ? 's' : ''}</small></div><div class="val">${moneyC(x.total)}</div></div>`).join('')}</div>` : ''}
      </div>`;
    }

    const limite = window.uiV2Screens.vendasLimite || 40;
    const rows = vendas.slice(0, limite).map((v) => {
      const tel = digitsOnly(v.cliente_telefone);
      const first = String(v.cliente_nome || '').split(' ')[0] || 'cliente';
      const wa = tel ? `https://wa.me/55${tel}?text=${encodeURIComponent(`Olá ${first}, parabéns pela aquisição do seu sistema solar!`)}` : '';
      return `<tr onclick="openVendaClienteFicha('${esc(v.id)}')">
        <td><div class="v2-who"><i class="v2-ini" style="background:rgba(31,169,113,.14);color:#1FA971">${ic('trophy', 'style="width:16px;height:16px"')}</i><div>${esc(v.cliente_nome || '—')}<small style="max-width:280px;overflow:hidden;text-overflow:ellipsis">${esc(v.kit_nome || '—')}</small></div></div></td>
        <td class="hide-m">${v.kit_power ? esc(String(v.kit_power).replace('.', ',')) + ' kWp' : '—'}</td>
        <td class="hide-m muted">${esc(formatDate(v.created_at))}</td>
        ${showSeller ? `<td class="hide-m">${esc(vendNome(v.vendedor_email))}${state.isAdmin && state.adminViewAll && v.franquia_id ? `<small class="muted" style="display:block;font-size:12px">${esc(getFranquiaNameById(v.franquia_id))}</small>` : ''}</td>` : ''}
        <td style="font-weight:800">${money(getSaleValue(v))}</td>
        <td><div class="v2-acts">
          ${wa ? `<a class="v2-sq wa" href="${esc(wa)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()" title="WhatsApp">${ic('message-circle')}</a>` : ''}
          ${(state.isAdmin || state.isGestor) ? `<button class="v2-sq hide-m" onclick="event.stopPropagation(); enviarVendaGroner('${esc(v.id)}', this)" title="Enviar para a Groner">${ic('send')}</button>` : ''}
          ${state.isAdmin ? `<button class="v2-sq hide-m" onclick="event.stopPropagation(); deleteVenda('${esc(v.id)}')" title="Excluir venda" style="color:#D14343">${ic('trash-2')}</button>` : ''}
        </div></td></tr>`;
    }).join('');

    container.innerHTML = `
      ${kpis}
      ${filtros}
      ${ranking}
      <div class="v2-card" style="padding:14px 16px">
        <div class="v2-ch" style="margin:4px 4px 8px"><div><h3>Vendas</h3><small>Clique para abrir a ficha do cliente</small></div></div>
        ${vendas.length ? `<div class="v2-tscroll"><table class="v2-table"><thead><tr><th>Cliente e kit</th><th class="hide-m">Potência</th><th class="hide-m">Data</th>${showSeller ? '<th class="hide-m">Vendedor</th>' : ''}<th>Valor</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>${vendas.length > limite ? `<div class="v2-more"><button class="v2-btn2" onclick="uiV2Screens.maisVendas()">${ic('chevrons-down')}Carregar mais · ${limite} de ${vendas.length}</button></div>` : ''}`
          : '<div class="v2-empty">Nenhuma venda com os filtros atuais.</div>'}
      </div>`;
    if (window.lucide) window.lucide.createIcons();
  }

  // ==================== ANÁLISE (Comercial) ====================
  // Os cálculos são os de analise.js. Durante o desenho, os blocos visuais dele
  // (_anCard, _anPainel, _anBarra, _anVazio e o gráfico) são trocados pela
  // versão nova e restaurados logo depois.
  const COR_TXT = (cls) => /green/.test(cls) ? '#1FA971' : /red/.test(cls) ? '#D14343' : /orange|yellow|amber/.test(cls) ? 'var(--v2-orange-text)' : /blue|sky|cyan/.test(cls) ? 'var(--v2-blue-text)' : 'var(--v2-ink)';
  const COR_BG = (cls) => /green/.test(cls) ? '#1FA971' : /red/.test(cls) ? '#D14343' : /orange|yellow|amber/.test(cls) ? '#FAA519' : '#008FD4';
  const SERIE_COR = { '#a3a3a3': '#008FD4', '#f97316': '#FAA519', '#22c55e': '#1FA971' };
  function renderAnaliseV2(container, original) {
    const g = window;
    const saved = { _anCard: g._anCard, _anPainel: g._anPainel, _anBarra: g._anBarra, _anVazio: g._anVazio, _analiseGraficoLinhas: g._analiseGraficoLinhas };
    g._anCard = (titulo, valor, sub, cor = '') => `<article class="v2-card v2-mini"><span>${esc(titulo)}</span><b style="color:${COR_TXT(cor)}">${valor}</b><small>${sub}</small></article>`;
    g._anPainel = (titulo, corpo, extra = '') => `<section class="v2-card"><div class="v2-ch"><div><h3>${esc(titulo)}</h3></div>${extra}</div>${corpo}</section>`;
    g._anBarra = (label, valor, max, cor, sufixo = '') => {
      const pct = max > 0 ? Math.round((valor / max) * 100) : 0;
      return `<div class="v2-fs"><div class="t"><span>${esc(cap(label))}</span><b>${valor}${sufixo}</b></div><div class="v2-track"><div style="width:${Math.max(pct, valor > 0 ? 3 : 0)}%;background:${COR_BG(cor)}"></div></div></div>`;
    };
    g._anVazio = (msg) => `<div class="v2-empty">${esc(msg)}</div>`;
    if (saved._analiseGraficoLinhas) g._analiseGraficoLinhas = (labels, series) => saved._analiseGraficoLinhas(labels, series.map((s) => ({ ...s, cor: SERIE_COR[s.cor] || s.cor })));
    try { original(container); } finally { Object.assign(g, saved); }

    container.className = 'v2s v2-analise';
    document.body.dataset.v2screen = 'analise';
    const nClientes = getDashboardScopedRows(state.clientes || []).length;
    setPageMeta('comercial:analise', 'Análise', `${nClientes} clientes no recorte atual`);
    // cabeçalho antigo → só o seletor de escopo; sub-abas → pílulas
    const head = container.firstElementChild;
    const subs = head && head.nextElementSibling;
    if (head) {
      const sel = head.querySelector('select');
      head.outerHTML = `<div class="v2-toolbar"><div class="v2-seg">${ANALISE_SUBS.map((s) => `<button class="${s.id === _analiseSub ? 'on' : ''}" onclick="setAnaliseSub('${s.id}')">${ic(s.icon)}${esc(s.label.replace('&', 'e'))}</button>`).join('')}</div><div class="v2-grow"></div>${sel ? `<select class="v2-select" onchange="setAdminScopeFranquia(this.value)">${sel.innerHTML}</select>` : ''}</div>`;
    }
    if (subs) subs.remove();
    if (window.lucide) window.lucide.createIcons();
  }

  // ==================== PRODUTOS (Comercial) ====================
  // Mesmos filtros/estado de produtos.js (_catalogo*, _equip*); as ações
  // (editar, ativar, excluir, importar, exportar) são as funções de lá.
  const KIT_FAIXAS = [['all', 'Todos'], ['a', 'Até 5 kWp'], ['b', '5 a 10 kWp'], ['c', '10 a 20 kWp'], ['d', 'Acima de 20']];
  const kitFaixa = (kwp) => { const v = Number(kwp) || 0; return v <= 5 ? 'a' : v <= 10 ? 'b' : v <= 20 ? 'c' : 'd'; };
  const kwpTxt = (v) => (Number(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 });

  function renderProductsListV2(container, original) {
    if (!canManageProductCatalog()) { window.uiV2PageMeta = null; return original(container); }
    const emptyState = document.getElementById('empty-state');
    if (emptyState) emptyState.classList.add('hidden');
    container.className = 'v2s';
    document.body.dataset.v2screen = 'produtos';
    const kits = Array.isArray(state.data) ? state.data : [];
    const equips = Array.isArray(state.equipamentos) ? state.equipamentos : [];
    const secao = _produtosSecao === 'equipamentos' ? 'equipamentos' : 'kits';
    const seg = `<div class="v2-seg">
      <button class="${secao === 'kits' ? 'on' : ''}" onclick="setProdutosSecao('kits')">${ic('package')}Kits</button>
      <button class="${secao === 'equipamentos' ? 'on' : ''}" onclick="setProdutosSecao('equipamentos')">${ic('boxes')}Equipamentos</button></div>`;
    if (secao === 'equipamentos') return produtosEquipV2(container, seg, equips);
    return produtosKitsV2(container, seg, kits);
  }

  function produtosKitsV2(container, seg, todos) {
    if (state.isGestor && !state.isAdmin && state.franquiaId) state.adminKitsFranquia = state.franquiaId;
    const faixa = window.uiV2Screens.kitFaixa || 'all';
    let base = [...todos];
    if (_catalogoCategoria !== 'all') base = base.filter((k) => k.categoria === _catalogoCategoria);
    if (_catalogoStatus === 'ativos') base = base.filter((k) => k.ativo !== false);
    if (_catalogoStatus === 'inativos') base = base.filter((k) => k.ativo === false);
    if (_catalogoBusca) base = base.filter((k) => `${k.name || ''} ${k.brand || ''}`.toLowerCase().includes(_catalogoBusca));
    const count = { all: base.length };
    base.forEach((k) => { const f = kitFaixa(k.power); count[f] = (count[f] || 0) + 1; });
    const lista = faixa === 'all' ? base : base.filter((k) => kitFaixa(k.power) === faixa);
    const nInativos = todos.filter((k) => k.ativo === false).length;

    const franquias = (state.franquiasCatalog || []).filter((f) => f.ativo !== false);
    const franqAtual = state.adminKitsFranquia || state.franquiaId || '';
    const franqNome = (franquias.find((f) => String(f.id) === String(franqAtual)) || {}).nome || '';
    setPageMeta('comercial:produtos', 'Produtos', `${todos.length} kit${todos.length === 1 ? '' : 's'}${nInativos ? ` · ${nInativos} fora de linha` : ''}${franqNome ? ` · preços de ${cap(franqNome)}` : ''}`);

    const card = (k) => {
      const inativo = k.ativo === false;
      const desconto = Number(k.list_price) > Number(k.price);
      const micro = k.categoria === 'kitsMicro';
      const ger = Number(k._estGeneration) || calcularGeracaoEstimada(Number(k.power) || 0, k.categoria);
      const id = esc(k.id);
      return `<div class="v2-card v2-pcard v2-kit ${inativo ? 'off' : ''}" onclick="openModalById('${id}')">
        <div class="tags">${k.brand ? `<span class="v2-chip t-blue">${esc(k.brand)}</span>` : ''}<span class="v2-chip t-gray">${micro ? 'Microinversor' : 'Inversor'}</span>${k.tag ? `<span class="v2-chip t-orange">${ic('flame')}${esc(cap(k.tag))}</span>` : ''}${inativo ? '<span class="v2-chip t-gray">Fora de linha</span>' : ''}</div>
        <div><small class="muted" style="font-size:12px;font-weight:700">Kit fotovoltaico</small><div class="kp">${kwpTxt(k.power)} <small>kWp</small></div></div>
        <div class="kit">${ic('solar-panel')}<span title="${esc(k.name)}">${esc(k.name || 'Sem nome')}</span></div>
        <ul><li>${ic('cpu')}Categoria<b>${micro ? 'Microinversor' : 'Inversor string'}</b></li>${k.type ? `<li>${ic('home')}Tipo<b>${esc(cap(k.type))}</b></li>` : ''}<li>${ic('sun')}Geração média<b>${Math.round(ger).toLocaleString('pt-BR')} kWh/mês</b></li></ul>
        <div class="ft"><div class="price">${desconto ? `<s>${money(k.list_price)}</s>` : ''}${money(k.price)}<small>Preço do kit${franqNome ? ' · ' + esc(cap(franqNome)) : ''}</small></div>
          <div class="v2-acts">
            <button class="v2-sq" title="${state.isAdmin ? 'Editar' : 'Editar preço da unidade'}" onclick="event.stopPropagation(); openModalById('${id}')">${ic('pencil')}</button>
            ${state.isAdmin ? `<button class="v2-sq" title="${inativo ? 'Reativar (volta ao criador de propostas)' : 'Tirar de linha (sai do criador de propostas)'}" onclick="event.stopPropagation(); toggleProdutoAtivo('${id}')">${ic(inativo ? 'eye' : 'eye-off')}</button>` : ''}
            <button class="v2-sq del" title="${state.isAdmin && !state.adminKitsFranquia ? 'Excluir do catálogo' : 'Remover/ocultar'}" onclick="event.stopPropagation(); deleteItem('${id}')">${ic('trash-2')}</button>
          </div></div>
      </div>`;
    };

    const filtros = [_catalogoCategoria !== 'all', _catalogoStatus !== 'all', Boolean(_catalogoBusca), faixa !== 'all'].filter(Boolean).length;
    const vazio = todos.length === 0
      ? `<div class="v2-card v2-empty">${ic('package-open', 'style="width:36px;height:36px;margin:0 auto 10px;display:block;opacity:.5"')}<b style="display:block;color:var(--v2-ink);font-size:15px">Nenhum kit cadastrado ainda</b>Cadastre um por um ou importe a planilha modelo.${state.isAdmin ? `<div class="v2-btnrow"><button class="v2-btnp" onclick="openModal()">${ic('package-plus')}Cadastrar o primeiro kit</button><button class="v2-btn2" onclick="triggerKitsImportPicker()">${ic('upload')}Importar planilha</button><button class="v2-btn2" onclick="downloadKitsImportTemplateXLSX()">${ic('file-down')}Baixar modelo</button></div>` : '<div style="margin-top:8px">Peça ao administrador para cadastrar os kits.</div>'}</div>`
      : `<div class="v2-card v2-empty">Nenhum kit com esses filtros.<div style="margin-top:12px"><button class="v2-btn2" onclick="uiV2Screens.limparKits()">${ic('filter-x')}Limpar filtros</button></div></div>`;

    container.innerHTML = `
      <div class="v2-toolbar">
        ${seg}
        <div class="v2-grow"></div>
        ${state.isAdmin ? `<button class="v2-sq" style="width:42px;height:42px;background:var(--v2-card);box-shadow:var(--v2-shadow)" title="Baixar planilha modelo" onclick="downloadKitsImportTemplateXLSX()">${ic('file-down')}</button>
        <button class="v2-btn2" style="height:42px" onclick="triggerKitsImportPicker()">${ic('upload')}Importar</button>` : ''}
        <button class="v2-btn2" style="height:42px" onclick="exportCurrentKitsXLSX()">${ic('download')}Exportar</button>
        ${state.isAdmin ? `<button class="v2-btno" style="width:auto;height:42px" onclick="openModal()">${ic('package-plus')}Novo kit</button>` : ''}
      </div>
      <div class="v2-toolbar">
        <label class="v2-sbox">${ic('search')}<input id="v2-kit-search" type="text" value="${esc(_catalogoBusca)}" oninput="handleCatalogoBuscaInput(this.value)" placeholder="Buscar kit por nome ou marca" autocomplete="off"></label>
        <select class="v2-select ${_catalogoCategoria !== 'all' ? 'on' : ''}" onchange="setCatalogoCategoria(this.value)"><option value="all">Todas as categorias</option><option value="kitsInversor" ${_catalogoCategoria === 'kitsInversor' ? 'selected' : ''}>Inversores</option><option value="kitsMicro" ${_catalogoCategoria === 'kitsMicro' ? 'selected' : ''}>Microinversores</option></select>
        <select class="v2-select ${_catalogoStatus !== 'all' ? 'on' : ''}" onchange="setCatalogoStatus(this.value)"><option value="all">Ativos e inativos</option><option value="ativos" ${_catalogoStatus === 'ativos' ? 'selected' : ''}>Só ativos</option><option value="inativos" ${_catalogoStatus === 'inativos' ? 'selected' : ''}>Fora de linha</option></select>
        ${state.isAdmin && franquias.length ? `<select class="v2-select" title="De qual unidade são os preços exibidos" onchange="setCatalogoFranquia(this.value)">${franquias.map((f) => `<option value="${esc(f.id)}" ${String(franqAtual) === String(f.id) ? 'selected' : ''}>Preços: ${esc(cap(f.nome || ''))}</option>`).join('')}</select>` : ''}
        ${filtros ? `<button class="v2-pill" onclick="uiV2Screens.limparKits()">${ic('filter-x')}Limpar · ${lista.length} de ${todos.length}</button>` : ''}
      </div>
      ${todos.length ? `<div class="v2-pills">${KIT_FAIXAS.map(([v, l]) => `<button class="${faixa === v ? 'on' : ''}" onclick="uiV2Screens.setKitFaixa('${v}')">${l}<em>${count[v] || 0}</em></button>`).join('')}</div>` : ''}
      ${lista.length ? `<div class="v2-pgrid">${lista.map(card).join('')}</div>` : vazio}`;
    if (window.lucide) window.lucide.createIcons();
  }

  function produtosEquipV2(container, seg, todos) {
    if (!state.isAdmin) {
      setPageMeta('comercial:produtos', 'Produtos', 'Equipamentos avulsos');
      container.innerHTML = `<div class="v2-toolbar">${seg}</div><div class="v2-card v2-empty">${ic('lock', 'style="width:32px;height:32px;margin:0 auto 10px;display:block;opacity:.5"')}<b style="display:block;color:var(--v2-ink);font-size:15px">Gestão de equipamentos é do administrador</b>Os kits (na outra aba) você já gerencia; o catálogo de itens avulsos é mantido pelo administrador.</div>`;
      if (window.lucide) window.lucide.createIcons();
      return;
    }
    let base = [...todos];
    if (_equipStatus === 'ativos') base = base.filter((e) => e.ativo !== false);
    if (_equipStatus === 'inativos') base = base.filter((e) => e.ativo === false);
    if (_equipBusca) base = base.filter((e) => `${e.nome || ''} ${e.marca || ''}`.toLowerCase().includes(_equipBusca));
    const count = { all: base.length };
    base.forEach((e) => { const t = e.tipo || 'outro'; count[t] = (count[t] || 0) + 1; });
    const lista = _equipCategoria === 'all' ? base : base.filter((e) => (e.tipo || 'outro') === _equipCategoria);
    const nInativos = todos.filter((e) => e.ativo === false).length;
    setPageMeta('comercial:produtos', 'Produtos', `${todos.length} equipamento${todos.length === 1 ? '' : 's'} avulso${todos.length === 1 ? '' : 's'}${nInativos ? ` · ${nInativos} inativo${nInativos === 1 ? '' : 's'}` : ''}`);
    const EQ_IC = { modulo: 'grid-3x3', inversor: 'cpu', estrutura: 'home', cabo: 'cable', servico: 'wrench', outro: 'box' };

    const row = (e) => {
      const inativo = e.ativo === false;
      const id = esc(e.id);
      const temCusto = e.custo !== null && e.custo !== undefined && e.custo !== '';
      return `<tr class="${inativo ? 'off' : ''}" onclick="openEquipModalById('${id}')">
        <td><div class="v2-eqn"><span class="v2-eqic">${ic(EQ_IC[e.tipo] || 'box')}</span><div><b>${esc(e.nome || 'Sem nome')}</b><small>${esc(equipCategoriaLabel(e.tipo))}${e.marca ? ' · ' + esc(e.marca) : ''}${inativo ? ' · inativo' : ''}</small></div></div></td>
        <td class="hide-sm">${Number(e.potencia_wp) > 0 ? esc(String(e.potencia_wp)) + ' Wp' : '<span class="muted">—</span>'}</td>
        <td class="hide-sm">${temCusto ? money(e.custo) : '<span class="muted">—</span>'}</td>
        <td><b>${money(e.preco_unitario)}</b> <small class="muted">/ ${esc(e.unidade || 'un')}</small></td>
        <td><div class="v2-acts">
          <button class="v2-sq" title="Editar" onclick="event.stopPropagation(); openEquipModalById('${id}')">${ic('pencil')}</button>
          <button class="v2-sq" title="${inativo ? 'Reativar' : 'Desativar'}" onclick="event.stopPropagation(); toggleEquipamentoAtivo('${id}')">${ic(inativo ? 'eye' : 'eye-off')}</button>
          <button class="v2-sq del" title="Excluir" onclick="event.stopPropagation(); deleteEquipamento('${id}')">${ic('trash-2')}</button>
        </div></td></tr>`;
    };
    const filtros = [_equipCategoria !== 'all', _equipStatus !== 'all', Boolean(_equipBusca)].filter(Boolean).length;
    const vazio = todos.length === 0
      ? `<div class="v2-card v2-empty">${ic('package-open', 'style="width:36px;height:36px;margin:0 auto 10px;display:block;opacity:.5"')}<b style="display:block;color:var(--v2-ink);font-size:15px">Nenhum equipamento cadastrado</b>Módulo, inversor, estrutura, cabos, serviço e outros, cada um com seu valor.<div class="v2-btnrow"><button class="v2-btnp" onclick="openEquipModal()">${ic('plus')}Cadastrar o primeiro</button><button class="v2-btn2" onclick="triggerEquipImportPicker()">${ic('upload')}Importar planilha</button><button class="v2-btn2" onclick="downloadEquipamentosTemplateXLSX()">${ic('file-down')}Baixar modelo</button></div></div>`
      : `<div class="v2-card v2-empty">Nenhum item com esses filtros.<div style="margin-top:12px"><button class="v2-btn2" onclick="uiV2Screens.limparEquip()">${ic('filter-x')}Limpar filtros</button></div></div>`;

    container.innerHTML = `
      <div class="v2-toolbar">
        ${seg}
        <div class="v2-grow"></div>
        <button class="v2-sq" style="width:42px;height:42px;background:var(--v2-card);box-shadow:var(--v2-shadow)" title="Baixar planilha modelo" onclick="downloadEquipamentosTemplateXLSX()">${ic('file-down')}</button>
        <button class="v2-btn2" style="height:42px" onclick="triggerEquipImportPicker()">${ic('upload')}Importar</button>
        <button class="v2-btn2" style="height:42px" onclick="exportEquipamentosXLSX()">${ic('download')}Exportar</button>
        <button class="v2-btno" style="width:auto;height:42px" onclick="openEquipModal()">${ic('plus')}Novo equipamento</button>
      </div>
      <div class="v2-toolbar">
        <label class="v2-sbox">${ic('search')}<input id="v2-equip-search" type="text" value="${esc(_equipBusca)}" oninput="handleEquipBuscaInput(this.value)" placeholder="Buscar por nome ou marca" autocomplete="off"></label>
        <select class="v2-select ${_equipStatus !== 'all' ? 'on' : ''}" onchange="setEquipStatus(this.value)"><option value="all">Ativos e inativos</option><option value="ativos" ${_equipStatus === 'ativos' ? 'selected' : ''}>Só ativos</option><option value="inativos" ${_equipStatus === 'inativos' ? 'selected' : ''}>Inativos</option></select>
        ${filtros ? `<button class="v2-pill" onclick="uiV2Screens.limparEquip()">${ic('filter-x')}Limpar · ${lista.length} de ${todos.length}</button>` : ''}
      </div>
      ${todos.length ? `<div class="v2-pills"><button class="${_equipCategoria === 'all' ? 'on' : ''}" onclick="setEquipCategoria('all')">Todos<em>${count.all}</em></button>${EQUIP_CATEGORIAS.map((c) => `<button class="${_equipCategoria === c.v ? 'on' : ''}" onclick="setEquipCategoria('${c.v}')">${c.label}<em>${count[c.v] || 0}</em></button>`).join('')}</div>` : ''}
      ${lista.length ? `<div class="v2-card" style="padding:12px 14px"><div style="overflow-x:auto"><table class="v2-table v2-eqtable"><thead><tr><th>Item</th><th class="hide-sm">Potência</th><th class="hide-sm">Custo</th><th>Preço</th><th></th></tr></thead><tbody>${lista.map(row).join('')}</tbody></table></div></div>` : vazio}`;
    if (window.lucide) window.lucide.createIcons();
  }

  // ==================== troca de render ====================
  const V2_SCREENS = { renderDashboard: renderDashboardV2, renderClientesList: renderClientesListV2, renderFunil: renderFunilV2, renderPropostasList: renderPropostasListV2, renderVendas: renderVendasV2, renderAnalise: renderAnaliseV2, renderProductsList: renderProductsListV2 };
  let lastScreen = '';
  Object.entries(V2_SCREENS).forEach(([name, v2]) => {
    if (!has(name)) return;
    const original = window[name];
    window[name] = function (container) {
      if (window.uiV2.isActive()) {
        // entrar numa tela recomeça as listas do 1º lote
        if (name !== lastScreen) { lastScreen = name; window.uiV2Screens.vendasLimite = 40; }
        try { return v2(container, original); } catch (err) { console.warn('[ui-v2] ' + name + ' falhou, usando o antigo', err); }
      }
      window.uiV2PageMeta = null;
      return original.apply(this, arguments);
    };
  });

  // Telas não reconstruídas não têm título próprio: limpa o do anterior.
  if (has('renderContent')) {
    const _renderContent = renderContent;
    renderContent = function () { window.uiV2PageMeta = null; delete document.body.dataset.v2screen; return _renderContent.apply(this, arguments); };
  }

  window.uiV2Screens = {
    filtrosAbertos: false,
    toggleFiltros() { this.filtrosAbertos = !this.filtrosAbertos; document.querySelectorAll('.v2-admfilters').forEach((el) => el.classList.toggle('open', this.filtrosAbertos)); },
    maisPropostas() { _propostasRenderLimit += 12; if (has('renderContent')) renderContent(); },
    vendasLimite: 40,
    maisVendas() { this.vendasLimite += 40; if (has('renderContent')) renderContent(); },
    copiarLink(id) {
      const url = new URL('proposta.html?id=' + encodeURIComponent(id), window.location.href).href;
      const ok = () => has('showToast') && showToast('LINK DA PROPOSTA COPIADO');
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(ok, () => window.prompt('Copie o link:', url));
      else window.prompt('Copie o link:', url);
    },
    setMeses(n) { renderDashboardV2.meses = n; if (has('renderContent')) renderContent(); },
    kitFaixa: 'all',
    setKitFaixa(v) { this.kitFaixa = v || 'all'; if (has('renderContent')) renderContent(); },
    limparKits() { _catalogoBusca = ''; _catalogoCategoria = 'all'; _catalogoStatus = 'all'; this.kitFaixa = 'all'; if (has('renderContent')) renderContent(); },
    limparEquip() { _equipBusca = ''; _equipCategoria = 'all'; _equipStatus = 'all'; if (has('renderContent')) renderContent(); },
  };
})();
