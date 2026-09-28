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

  // ==================== troca de render ====================
  const V2_SCREENS = { renderDashboard: renderDashboardV2, renderClientesList: renderClientesListV2, renderFunil: renderFunilV2 };
  Object.entries(V2_SCREENS).forEach(([name, v2]) => {
    if (!has(name)) return;
    const original = window[name];
    window[name] = function (container) {
      if (window.uiV2.isActive()) {
        try { return v2(container); } catch (err) { console.warn('[ui-v2] ' + name + ' falhou, usando o antigo', err); }
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
    setMeses(n) { renderDashboardV2.meses = n; if (has('renderContent')) renderContent(); },
  };
})();
