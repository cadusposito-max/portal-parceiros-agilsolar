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

  // ==================== troca de render ====================
  const V2_SCREENS = { renderDashboard: renderDashboardV2 };
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
    renderContent = function () { window.uiV2PageMeta = null; return _renderContent.apply(this, arguments); };
  }

  window.uiV2Screens = {
    setMeses(n) { renderDashboardV2.meses = n; if (has('renderContent')) renderContent(); },
  };
})();
