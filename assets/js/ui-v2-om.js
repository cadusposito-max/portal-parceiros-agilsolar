// ==========================================
// VISUAL NOVO (v2) — O&M NO PADRÃO DO COMERCIAL
// ------------------------------------------
// Mesmo esquema de ui-v2-screens.js: a tela nova substitui o render antigo
// SÓ quando o v2 está ativo; sem ele, roda a função original do om.js.
// Os dados saem das mesmas RPCs e filtros do om.js (list_om_propostas,
// state.omPropFilters, get_om_kpis_central...); aqui muda só a apresentação.
// Telas: Central e as listas de Propostas O&M, Clientes, Pendências e
// Relatórios. Detalhes, OS, Agenda e Técnicos: om.js / om-os.js.
// ==========================================

(function () {
  if (!window.uiV2) return;

  const has = (fn) => typeof window[fn] === 'function';
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ic = (n, x = '') => `<i data-lucide="${n}" ${x}></i>`;
  const brl = (v) => (v == null || isNaN(v) ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
  const brlC = (v) => (has('formatCurrencyCompact') ? formatCurrencyCompact(Number(v) || 0) : brl(v));
  const dataBR = (v) => { if (!v) return '—'; const d = new Date(String(v).length === 10 ? v + 'T12:00:00' : v); return isNaN(d) ? '—' : d.toLocaleDateString('pt-BR'); };
  const hora = (v) => { const d = new Date(v); return isNaN(d) ? '' : d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); };
  const cap = (s) => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
  const icons = () => { if (window.lucide) window.lucide.createIcons(); };
  function setPageMeta(key, title, sub) {
    window.uiV2PageMeta = { key, title, sub };
    if (window.uiV2Shell) window.uiV2Shell.refresh();
  }
  const erroTx = (e) => (has('omFriendlyErr') ? omFriendlyErr(e) : 'Não foi possível carregar.');

  // [rótulo, plural, cor]
  const PST = {
    rascunho: ['Rascunho', 'Rascunhos', 't-gray'], enviada: ['Enviada', 'Enviadas', 't-blue'], visualizada: ['Visualizada', 'Visualizadas', 't-orange'],
    aprovada: ['Aprovada', 'Aprovadas', 't-green'], recusada: ['Recusada', 'Recusadas', 't-red'], vencida: ['Vencida', 'Vencidas', 't-red'], cancelada: ['Cancelada', 'Canceladas', 't-gray'],
  };
  const pst = (s) => PST[s] || [cap(s) || '—', cap(s) || '—', 't-gray'];
  const OS_ST = { agendada: ['Agendada', 't-orange'], deslocamento: ['Em deslocamento', 't-orange'], em_atendimento: ['Em atendimento', 't-blue'], finalizada: ['Concluída', 't-green'], cancelada: ['Cancelada', 't-gray'] };
  const TEC_ST = { 'Disponível': 't-green', 'Em atendimento': 't-blue', 'Em execução': 't-blue', 'Em deslocamento': 't-orange' };
  const CRIT = { critica: ['Crítica', 't-red'], alta: ['Alta', 't-orange'], media: ['Média', 't-gray'], baixa: ['Baixa', 't-gray'] };
  const tipoIc = (t) => (typeof OM_PROP_TIPO_ICON !== 'undefined' && OM_PROP_TIPO_ICON[t]) || 'wrench';
  const avServico = (t) => `<i class="v2-ini" title="${esc(t || '')}">${ic(tipoIc(t))}</i>`;
  const avCliente = (c) => {
    const pj = window.uiV2TipoCliente ? window.uiV2TipoCliente(c, c && c.nome) === 'PJ' : false;
    return `<i class="v2-ini" title="${pj ? 'Empresa' : 'Pessoa física'}">${ic(pj ? 'building-2' : 'user')}</i>`;
  };

  // ==================== PROPOSTAS O&M (lista) ====================
  let propRows = [];
  async function renderPropostasV2(container) {
    if (state.omPropostaDetailId) return renderOMPropostaDetail(container, state.omPropostaDetailId);
    if (!state.omPropFilters) state.omPropFilters = { status: 'Todos', tipo: 'Todos', responsavel: 'Todos', search: '' };
    if (state.omPropFilters.search === undefined) state.omPropFilters.search = '';
    container.className = 'v2s';
    document.body.dataset.v2screen = 'om-propostas';
    setPageMeta('om:propostas', 'Propostas', 'Carregando…');
    container.innerHTML = `<div class="v2-card v2-empty">Carregando propostas…</div>`;

    const { data, error } = await supabaseClient.rpc('list_om_propostas');
    if (state.environment !== 'om' || state.omActiveTab !== 'propostas' || state.omPropostaDetailId) return; // trocou de tela no meio
    if (error) {
      setPageMeta('om:propostas', 'Propostas', '');
      container.innerHTML = `<div class="v2-card v2-empty">${esc(erroTx(error))}<div style="margin-top:12px"><button class="v2-btn2" onclick="renderContent()">${ic('refresh-cw')}Tentar de novo</button></div></div>`;
      icons();
      return;
    }
    // mesma lista que os filtros e o detalhe do om.js usam
    propRows = (data || []).map((p) => ({ ...p, statusLabel: has('omPropStatusLabel') ? omPropStatusLabel(p.status) : pst(p.status)[0] }));
    omPropListCache = propRows;
    pintarPropostas(container);
  }

  function pintarPropostas(container) {
    const agora = new Date();
    const noMes = propRows.filter((p) => { const d = new Date(p.created_at); return d.getMonth() === agora.getMonth() && d.getFullYear() === agora.getFullYear(); }).length;
    setPageMeta('om:propostas', 'Propostas', `${plural(propRows.length, 'proposta', 'propostas')} · ${noMes} no mês`);
    const f = state.omPropFilters;
    const resp = [...new Set(propRows.map((p) => p.responsavel).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const tipos = typeof OM_PROP_TIPOS !== 'undefined' ? OM_PROP_TIPOS : [];
    const novo = `<button class="v2-btno hide-m" style="width:auto;height:44px" onclick="omOpenCreateProposta()">${ic('plus')}Nova proposta O&amp;M</button>`;
    if (!propRows.length) {
      container.innerHTML = `<div class="v2-card v2-empty">Nenhuma proposta O&amp;M ainda. Crie a primeira para um cliente da base.<div style="margin-top:12px">${novo}</div></div>`;
      icons();
      return;
    }
    container.innerHTML = `
      <div class="v2-toolbar">
        <label class="v2-sbox">${ic('search')}<input id="om-prop-search" type="text" value="${esc(f.search)}" oninput="uiV2Om.propSet('search', this.value)" placeholder="Buscar por nº, cliente ou serviço" autocomplete="off"></label>
        <select class="v2-select ${f.tipo !== 'Todos' ? 'on' : ''}" onchange="uiV2Om.propSet('tipo', this.value)" data-titulo="Serviço"><option value="Todos">Todos os serviços</option>${tipos.map((t) => `<option value="${esc(t)}" ${t === f.tipo ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>
        <select class="v2-select ${f.responsavel !== 'Todos' ? 'on' : ''}" onchange="uiV2Om.propSet('responsavel', this.value)" data-titulo="Responsável"><option value="Todos">Todos os responsáveis</option>${resp.map((r) => `<option value="${esc(r)}" ${r === f.responsavel ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select>
        <span class="v2om-limpar"></span>
        <div class="v2-grow"></div>
        ${novo}
      </div>
      <div class="v2om-prop-body"></div>`;
    pintarPropostasLista(container);
    if (window.uiV2Filtros) window.uiV2Filtros.aplicar(container);
  }

  // Etapas + lista. A busca redesenha só esta parte (o campo não perde o foco).
  function pintarPropostasLista(container) {
    const box = container.querySelector('.v2om-prop-body');
    if (!box) return;
    const f = state.omPropFilters;
    // contagem das etapas respeita busca/serviço/responsável (não o próprio status)
    const base = propRows.filter((p) => (f.tipo === 'Todos' || p.tipo_servico === f.tipo)
      && (f.responsavel === 'Todos' || p.responsavel === f.responsavel)
      && (!has('omPropMatchesSearch') || omPropMatchesSearch(p, f.search)));
    const lista = base.filter((p) => f.status === 'Todos' || p.statusLabel === f.status);
    const cnt = {};
    base.forEach((p) => { cnt[p.status] = (cnt[p.status] || 0) + 1; });
    // as 4 etapas do caminho normal sempre; as outras só quando existem
    const etapas = Object.keys(PST).filter((s) => ['rascunho', 'enviada', 'visualizada', 'aprovada'].includes(s) || cnt[s] || f.status === PST[s][0]);
    const pill = (lbl, val, n) => `<button class="${f.status === val ? 'on' : ''}" onclick="uiV2Om.propSet('status','${val}')">${lbl}<em>${n}</em></button>`;
    const ativos = [f.tipo !== 'Todos', f.responsavel !== 'Todos', f.status !== 'Todos', !!String(f.search || '').trim()].filter(Boolean).length;
    const lim = container.querySelector('.v2om-limpar');
    if (lim) lim.innerHTML = ativos ? `<button class="v2-pill v2-fclear" onclick="uiV2Om.propLimpar()">${ic('filter-x')}Limpar · ${lista.length} de ${propRows.length}</button>` : '';

    const linhas = lista.map((p) => {
      const st = pst(p.status);
      return `<tr onclick="omOpenPropostaDetail('${esc(p.id)}')">
        <td><div class="v2-who">${avServico(p.tipo_servico)}<div class="v2om-tx"><span class="v2-nmrow"><span class="v2-nm">${esc(p.cliente || 'Sem cliente')}</span><b class="v2-mval">${brlC(p.valor_final)}</b></span><small>#${esc(p.numero || '—')} · ${esc(p.tipo_servico || 'Serviço')}${p.cidade ? ' · ' + esc(p.cidade) : ''}</small><span class="show-m v2-mline"><span class="v2-chip dot ${st[2]}">${st[0]}</span>${p.validade ? `<span class="v2om-minfo">${ic('calendar')}válida até ${dataBR(p.validade)}</span>` : ''}</span></div></div></td>
        <td class="hide-m"><span class="v2-chip dot ${st[2]}">${st[0]}</span></td>
        <td class="hide-m">${esc(p.responsavel || '—')}</td>
        <td class="hide-m muted">${dataBR(p.validade)}</td>
        <td class="hide-m" style="font-weight:800">${brl(p.valor_final)}</td>
        <td><div class="v2-acts"><button class="v2-sq" title="Abrir proposta" onclick="event.stopPropagation(); omOpenPropostaDetail('${esc(p.id)}')">${ic('chevron-right')}</button></div></td></tr>`;
    }).join('');

    box.innerHTML = `
      <div class="v2-pills">${pill('Todas', 'Todos', base.length)}${etapas.map((s) => pill(PST[s][1], PST[s][0], cnt[s] || 0)).join('')}</div>
      ${lista.length ? `<div class="v2-card v2-lista" style="padding:14px 16px"><div class="v2-tscroll"><table class="v2-table">
        <thead><tr><th>Cliente e serviço</th><th class="hide-m">Status</th><th class="hide-m">Responsável</th><th class="hide-m">Validade</th><th class="hide-m">Valor</th><th></th></tr></thead>
        <tbody>${linhas}</tbody></table></div></div>
        <div class="v2-fim"><div class="m"><span>${ic('circle-check')}Fim da lista · <b>${plural(lista.length, 'proposta', 'propostas')}</b></span></div></div>`
        : `<div class="v2-card v2-empty">Nenhuma proposta com esses filtros.<div style="margin-top:12px"><button class="v2-btn2" onclick="uiV2Om.propLimpar()">${ic('filter-x')}Limpar filtros</button></div></div>`}`;
    icons();
  }

  // ==================== CENTRAL ====================
  async function renderCentralV2(container) {
    container.className = 'v2s';
    document.body.dataset.v2screen = 'om-central';
    const nome = state.profile && state.profile.nome ? state.profile.nome.split(' ')[0] : '';
    const h = new Date().getHours();
    const titulo = `${h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'}${nome ? ', ' + nome : ''}`;
    const dia = cap(new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }));
    const celular = window.matchMedia && window.matchMedia('(max-width: 760px)').matches;
    const sub = celular ? dia : `${dia} · Operação e manutenção`;
    setPageMeta('om:central', titulo, sub);
    container.innerHTML = `<div class="v2-card v2-empty">Carregando a central…</div>`;

    const nomes = ['get_om_kpis_central', 'get_om_weekly_activity', 'list_om_os', 'list_om_propostas', 'list_om_pendencias', 'list_om_tecnicos'];
    const res = await Promise.all(nomes.map((n) => supabaseClient.rpc(n).then((r) => r, (e) => ({ error: e }))));
    if (state.environment !== 'om' || state.omActiveTab !== 'central') return; // trocou de tela no meio
    const [kRaw, sem, os, props, pend, tecs] = res.map((r, i) => (r && !r.error && r.data) || (i === 0 ? {} : []));
    const k = kRaw || {};
    setPageMeta('om:central', titulo, sub); // o render do shell pode ter limpado durante a espera

    const sla = k.sla_min == null ? '—' : k.sla_min < 60 ? Math.round(k.sla_min) + ' min' : (k.sla_min / 60).toFixed(1).replace('.', ',') + 'h';
    const kpi = (o) => `<div class="v2-card v2-kpi ${o.hero ? 'hero' : ''}" onclick="setTab('${o.tab}')"><div class="h"><span>${o.label}</span><div class="ic" style="background:${o.cor}1F;color:${o.cor}">${ic(o.icon)}</div></div><div class="v">${o.v}</div><div class="foot"><span>${o.sub}</span></div></div>`;
    const kpis = `<div class="v2-kpis">
      ${kpi({ hero: 1, label: 'Atendimentos abertos', v: k.abertas || 0, icon: 'activity', cor: '#008FD4', sub: k.abertas ? `${k.abertas} em aberto` : 'nenhuma em aberto', tab: 'os' })}
      ${kpi({ label: 'OS em campo', v: k.em_campo || 0, icon: 'route', cor: '#FAA519', sub: `distribuídas em ${plural(k.tec_em_os || 0, 'técnico', 'técnicos')}`, tab: 'os' })}
      ${kpi({ label: 'Técnicos ativos', v: k.tec_total || 0, icon: 'hard-hat', cor: '#1FA971', sub: `${k.tec_em_os || 0} em atendimento`, tab: 'tecnicos' })}
      ${kpi({ label: 'SLA médio', v: sla, icon: 'timer', cor: '#808284', sub: k.sla_min != null ? 'tempo médio (30 dias)' : 'sem dados no período', tab: 'relatorios' })}
    </div>`;

    // atividade da semana: altura = total do dia; parte cheia = concluídas
    const DIA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const dias = Array.isArray(sem) ? sem.map((d) => ({ dow: d.dow, ab: d.abertas || 0, ag: d.agendadas || 0, co: d.concluidas || 0 })) : [];
    const mx = Math.max(1, ...dias.map((d) => d.ab + d.ag + d.co));
    const semana = `<div class="v2-card">
      <div class="v2-ch"><div><h3>Atividade da semana</h3><small>OS por dia nos últimos 7 dias</small></div><button class="v2-btn2" onclick="setTab('relatorios')">Relatórios${ic('arrow-right')}</button></div>
      ${dias.length ? `<div class="v2om-stk">${dias.map((d, i) => { const t = d.ab + d.ag + d.co; return `<div class="c ${i === dias.length - 1 ? 'hoje' : ''}" title="${DIA[d.dow] || ''} · ${d.co} concluída(s), ${d.ab} aberta(s), ${d.ag} agendada(s)">
        <div class="b" style="height:${t ? Math.max(6, (t / mx) * 100) : 3}%"><i style="height:${t ? (d.co / t) * 100 : 0}%"></i></div><em>${t}</em><span>${DIA[d.dow] || ''}</span></div>`; }).join('')}</div>
      <div class="v2om-leg"><span><i class="f"></i>Concluídas</span><span><i></i>Abertas e agendadas</span></div>` : '<div class="v2-empty">Sem atividade no período.</div>'}</div>`;

    const abertas = os.filter((o) => ['agendada', 'deslocamento', 'em_atendimento'].includes(o.status))
      .sort((a, b) => String(a.agendado_para || '').localeCompare(String(b.agendado_para || '')));
    const px = abertas[0];
    const pxSt = px ? (OS_ST[px.status] || OS_ST.agendada) : null;
    const proxima = `<div class="v2-card v2om-prox">
      <div class="v2-ch"><div><h3>Próxima OS</h3><small>${px ? esc(px.numero || '—') : 'Nada agendado'}</small></div>${px ? `<span class="v2-chip dot ${pxSt[1]}">${pxSt[0]}</span>` : ''}</div>
      ${px ? `<div class="v2-who" style="margin-bottom:14px">${avServico(px.tipo_servico)}<div><span class="v2-nm">${esc(px.tipo_servico || 'Ordem de serviço')}</span><small>${esc(px.cliente || '—')}</small></div></div>
        <div class="v2om-info"><span>${ic('calendar')}${px.agendado_para ? `${dataBR(px.agendado_para)} · ${hora(px.agendado_para)}` : 'Sem data'}</span><span>${ic('hard-hat')}${esc(px.tecnico_nome || 'Sem técnico')}</span><span>${ic('map-pin')}${esc(px.cidade || '—')}</span></div>
        <button class="v2-btnp" style="width:100%;margin-top:auto" onclick="setTab('os'); omOsAbrir('${esc(px.id)}')">${ic('clipboard-list')}Abrir ordem de serviço</button>` : '<div class="v2-empty">Nenhuma OS agendada.</div>'}</div>`;

    const ult = [...props].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))).slice(0, 5);
    const propsCard = `<div class="v2-card">
      <div class="v2-ch"><div><h3>Últimas propostas</h3><small>As mais recentes do O&amp;M</small></div><button class="v2-btn2" onclick="setTab('propostas')">Ver todas${ic('arrow-right')}</button></div>
      ${ult.length ? `<div class="v2-tscroll"><table class="v2-table"><thead><tr><th>Cliente e serviço</th><th style="text-align:right">Valor e status</th></tr></thead><tbody>
        ${ult.map((p) => { const st = pst(p.status); return `<tr onclick="omOpenPropostaDetail('${esc(p.id)}')"><td><div class="v2-who">${avServico(p.tipo_servico)}<div class="v2om-tx">${esc(p.cliente || 'Sem cliente')}<small>#${esc(p.numero || '—')} · ${esc(p.tipo_servico || 'Serviço')}</small></div></div></td><td style="text-align:right"><b class="v2om-val">${brl(p.valor_final)}</b><span class="v2-chip dot ${st[2]}">${st[0]}</span></td></tr>`; }).join('')}
      </tbody></table></div>` : '<div class="v2-empty">Nenhuma proposta ainda.</div>'}</div>`;

    const crit = pend.filter((p) => ['alta', 'critica'].includes(p.criticidade) && !['resolvida', 'ignorada'].includes(p.status)).slice(0, 4);
    const pendCard = `<div class="v2-card v2om-pend">
      <div class="v2-ch"><div><h3>Pendências críticas</h3><small>${crit.length ? plural(crit.length, 'esperando solução', 'esperando solução') : 'Tudo em dia'}</small></div><button class="v2-btn2" onclick="setTab('pendencias')">Ver todas${ic('arrow-right')}</button></div>
      ${crit.length ? crit.map((p) => { const c = CRIT[p.criticidade] || CRIT.media; return `<div class="v2-lst click" onclick="setTab('pendencias')"><i class="v2-ini ${p.criticidade === 'critica' ? 'v2om-r' : 'o'}">${ic('triangle-alert')}</i><div class="tx"><b>${esc(p.descricao || '—')}</b><small>${esc(p.cliente || '—')}${p.os_numero ? ' · ' + esc(p.os_numero) : ''}</small></div><span class="v2-chip dot ${c[1]}">${c[0]}</span></div>`; }).join('') : '<div class="v2-empty">Nenhuma pendência crítica.</div>'}</div>`;

    const equipe = `<div class="v2-card">
      <div class="v2-ch"><div><h3>Equipe em campo</h3><small>${plural(tecs.length, 'técnico', 'técnicos')}</small></div><button class="v2-btn2" onclick="setTab('tecnicos')">Ver todos${ic('arrow-right')}</button></div>
      ${tecs.length ? tecs.map((t) => {
        const d = has('omTecDerived') ? omTecDerived(t, os) : { proxima: '—', osHoje: 0, status: 'Disponível' };
        const ini = (t.nome || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
        return `<div class="v2-lst click" onclick="${has('omOpenAgendaTecnico') ? `omOpenAgendaTecnico('${esc(t.id)}')` : "setTab('tecnicos')"}"><i class="v2-ini round">${esc(ini)}</i><div class="tx"><b>${esc(t.nome || t.email || '—')}</b><small>${d.proxima !== '—' ? 'Próxima: ' + esc(d.proxima) : 'Sem próxima OS'} · ${d.osHoje} OS hoje</small></div><span class="v2-chip dot ${TEC_ST[d.status] || 't-green'}">${esc(d.status)}</span></div>`;
      }).join('') : '<div class="v2-empty">Nenhum técnico ativo.</div>'}</div>`;

    const tot = k.tot_mes || 0, fin = k.fin_mes || 0;
    const pct = tot ? Math.min(100, Math.round((fin / tot) * 100)) : (fin ? 100 : 0);
    const C = 2 * Math.PI * 52;
    const progresso = `<div class="v2-card">
      <div class="v2-ch"><div><h3>Progresso do mês</h3><small>${fin} de ${tot} OS concluídas</small></div></div>
      <div class="v2om-donut"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" class="t"/><circle cx="60" cy="60" r="52" class="p" stroke-dasharray="${(pct / 100) * C} ${C}"/></svg><div><b>${pct}%</b><small>concluídas</small></div></div>
      <div class="v2om-leg" style="justify-content:center"><span><i class="f"></i>Concluídas · ${fin}</span><span><i></i>Restantes · ${Math.max(0, tot - fin)}</span></div></div>`;

    container.innerHTML = `
      <div class="v2-toolbar v2om-busca">
        <label class="v2-sbox">${ic('search')}<input id="om-central-search" type="text" placeholder="Buscar cliente por nome, telefone, CPF/CNPJ ou endereço" autocomplete="off" oninput="uiV2Om.busca(this.value)"></label>
        <button class="v2-btn2" onclick="omOpenCreateClient()">${ic('user-plus')}Criar cliente O&amp;M</button>
        <button class="v2-btno hide-m" style="width:auto;height:44px" onclick="omOpenCreateProposta()">${ic('plus')}Nova proposta O&amp;M</button>
        <div class="v2om-res"></div>
      </div>
      ${kpis}
      <div class="v2-row">${semana}${proxima}</div>
      <div class="v2-row">${propsCard}${pendCard}</div>
      <div class="v2-row">${equipe}${progresso}</div>`;
    icons();
  }

  // Busca de cliente da Central (mesma RPC do om.js: omSearchClientes)
  let tBusca = null;
  function busca(q) {
    clearTimeout(tBusca);
    tBusca = setTimeout(async () => {
      const out = document.querySelector('#main-container .v2om-res');
      if (!out) return;
      q = String(q || '').trim();
      if (!q) { out.innerHTML = ''; return; }
      let r;
      try { r = (await omSearchClientes(q)) || []; } catch (e) { out.innerHTML = `<div class="v2-card"><div class="v2-empty">${esc(erroTx(e))}</div></div>`; return; }
      const ori = (c) => (!c.origem ? '' : ORI_NOME[c.origem] || (has('omOrigemLabel') ? omOrigemLabel(c.origem) : c.origem));
      out.innerHTML = `<div class="v2-card">${r.length ? r.map((c) => `<div class="v2-lst click" onclick="omUseClient('${esc(c.id)}')">${avCliente(c)}<div class="tx"><b>${esc(c.nome)}</b><small>${esc(c.cidade || '—')} · ${esc(c.telefone || '—')}${ori(c) ? ' · ' + esc(ori(c)) : ''}${c.no_om ? ' · já no O&amp;M' : ''}</small></div><button class="v2-sq" title="Nova proposta O&M" onclick="event.stopPropagation(); omUseClient('${esc(c.id)}')">${ic('file-plus-2')}</button></div>`).join('')
        : `<div class="v2-lst"><div class="tx"><b>Nenhum cliente encontrado</b><small>Cadastre o cliente O&amp;M para começar o atendimento.</small></div><button class="v2-btnp" onclick="omOpenCreateClient({ next: 'proposta' })">${ic('user-plus')}Criar cliente O&amp;M</button></div>`}</div>`;
      icons();
    }, 250);
  }

  // ==================== CLIENTES O&M ====================
  // origens que o om.js não traduz (vêm do Comercial/leads) — antes saía o código cru
  const ORI_NOME = { comercial: 'Comercial', meta: 'Meta', trafego: 'Tráfego', nao_informado: 'Não informado', porta: 'Porta' };
  // A busca é no banco (omListOMClientes), como no om.js; a linha inteira inicia a proposta.
  function renderClientesV2(container) {
    if (!state.omClientesFilters) state.omClientesFilters = { search: '' };
    container.className = 'v2s';
    document.body.dataset.v2screen = 'om-clientes';
    setPageMeta('om:clientes', 'Clientes', 'Carregando…');
    container.innerHTML = `
      <div class="v2-toolbar">
        <label class="v2-sbox">${ic('search')}<input id="om-cli-search" type="text" value="${esc(state.omClientesFilters.search || '')}" oninput="uiV2Om.cliBusca(this.value)" placeholder="Nome, telefone, CPF/CNPJ ou cidade" autocomplete="off"></label>
        <div class="v2-grow"></div>
        <button class="v2-btnp" onclick="omOpenCreateClient()">${ic('user-plus')}<span>Criar cliente O&amp;M</span></button>
      </div>
      <div class="v2-ctx">${ic('info', 'style="width:14px;height:14px"')}Aqui ficam só os clientes O&amp;M. Para um cliente do Comercial, use "Nova proposta O&amp;M" e busque por ele lá.</div>
      <div class="v2om-cli-body"><div class="v2-card v2-empty">Carregando clientes…</div></div>`;
    icons();
    clientesCarregar();
  }
  let tCli = null, cliSeq = 0;
  async function clientesCarregar() {
    const seq = ++cliSeq;
    const q = (state.omClientesFilters || {}).search || '';
    let rows, erro = null;
    try { rows = (await omListOMClientes(q)) || []; } catch (e) { erro = e; }
    const box = document.querySelector('#main-container .v2om-cli-body');
    if (!box || seq !== cliSeq) return; // saiu da tela ou chegou uma busca mais nova
    if (erro) { setPageMeta('om:clientes', 'Clientes', ''); box.innerHTML = `<div class="v2-card v2-empty">${esc(erroTx(erro))}</div>`; return; }
    setPageMeta('om:clientes', 'Clientes', q.trim() ? `${plural(rows.length, 'cliente encontrado', 'clientes encontrados')}` : plural(rows.length, 'cliente O&M', 'clientes O&M'));
    const ori = (c) => ORI_NOME[c.origem] || (has('omOrigemLabel') ? omOrigemLabel(c.origem) : c.origem || '—');
    const ORI_COR = { crm: 't-blue', comercial: 't-blue', proposta: 't-green', manual: 't-orange', om: 't-blue', meta: 't-blue', whatsapp: 't-green', indicacao: 't-green' };
    if (!rows.length) {
      box.innerHTML = `<div class="v2-card v2-empty">${q.trim() ? 'Nenhum cliente O&amp;M bate com essa busca.' : 'Você ainda não tem clientes O&amp;M.'}<div style="margin-top:12px"><button class="v2-btnp" onclick="omOpenCreateClient()">${ic('user-plus')}Criar cliente O&amp;M</button></div></div>`;
      icons();
      return;
    }
    box.innerHTML = `<div class="v2-card v2-lista" style="padding:14px 16px"><div class="v2-tscroll"><table class="v2-table">
        <thead><tr><th>Cliente</th><th class="hide-m">Origem</th><th class="hide-m">Cidade</th><th class="hide-m">Documento</th><th></th></tr></thead>
        <tbody>${rows.map((c) => `<tr onclick="omUseClient('${esc(c.id)}')" title="Nova proposta O&amp;M para este cliente">
          <td><div class="v2-who">${avCliente(c)}<div class="v2om-tx"><span class="v2-nm">${esc(c.nome || '—')}</span><small>${esc(c.telefone || '—')}<span class="show-m"> · ${esc(c.cidade || '—')}</span></small></div></div></td>
          <td class="hide-m"><span class="v2-chip ${ORI_COR[c.origem] || 't-gray'}">${esc(ori(c))}</span></td>
          <td class="hide-m">${esc(c.cidade || '—')}</td>
          <td class="hide-m muted">${esc(c.documento || '—')}</td>
          <td><div class="v2-acts"><button class="v2-sq" title="Nova proposta O&amp;M" onclick="event.stopPropagation(); omUseClient('${esc(c.id)}')">${ic('file-plus-2')}</button></div></td></tr>`).join('')}</tbody></table></div></div>
      <div class="v2-fim"><div class="m"><span>${ic('circle-check')}Fim da lista · <b>${plural(rows.length, 'cliente', 'clientes')}</b></span></div></div>`;
    icons();
  }
  function cliBusca(v) {
    state.omClientesFilters = state.omClientesFilters || {};
    state.omClientesFilters.search = v;
    clearTimeout(tCli);
    tCli = setTimeout(clientesCarregar, 250);
  }

  // ==================== PENDÊNCIAS ====================
  // Filtros do om.js (state.omPendFilters, rótulos OM_PEND_*); ações do om.js (omPend*).
  const PEND_ST = { aberta: ['Aberta', 'Abertas', 't-red'], em_analise: ['Em análise', 'Em análise', 't-orange'], proposta_gerada: ['Proposta gerada', 'Proposta gerada', 't-blue'],
    aprovada: ['Aprovada', 'Aprovadas', 't-green'], resolvida: ['Resolvida', 'Resolvidas', 't-green'], ignorada: ['Ignorada', 'Ignoradas', 't-gray'] };
  async function renderPendenciasV2(container) {
    if (!state.omPendFilters) state.omPendFilters = { criticidade: 'Todas', status: 'Todos', responsavel: 'Todos' };
    container.className = 'v2s';
    document.body.dataset.v2screen = 'om-pendencias';
    setPageMeta('om:pendencias', 'Pendências', 'Carregando…');
    container.innerHTML = `<div class="v2-card v2-empty">Carregando pendências…</div>`;
    const { data, error } = await supabaseClient.rpc('list_om_pendencias');
    if (state.environment !== 'om' || state.omActiveTab !== 'pendencias') return;
    if (error) { setPageMeta('om:pendencias', 'Pendências', ''); container.innerHTML = `<div class="v2-card v2-empty">${esc(erroTx(error))}</div>`; return; }
    omPendListCache = (data || []).map((p) => ({ ...p, critLabel: OM_PEND_CRIT_LABEL[p.criticidade] || p.criticidade, statusLabel: OM_PEND_STATUS_LABEL[p.status] || p.status }));
    pintarPendencias(container);
  }
  function pintarPendencias(container) {
    const all = omPendListCache || [];
    const f = state.omPendFilters;
    const abertas = all.filter((p) => !['resolvida', 'ignorada'].includes(p.status)).length;
    setPageMeta('om:pendencias', 'Pendências', `${plural(all.length, 'pendência', 'pendências')} · ${abertas} em aberto`);
    const resp = [...new Set(all.map((p) => p.responsavel).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const novo = `<button class="v2-btno" style="width:auto;height:44px" onclick="omOpenCreatePendencia()">${ic('plus')}Registrar pendência</button>`;
    if (!all.length) {
      container.innerHTML = `<div class="v2-card v2-empty">Nenhuma pendência registrada.<div style="margin-top:12px">${novo}</div></div>`;
      icons();
      return;
    }
    // contagem das etapas respeita criticidade/responsável (não o próprio status)
    const base = all.filter((p) => (f.criticidade === 'Todas' || p.critLabel === f.criticidade) && (f.responsavel === 'Todos' || p.responsavel === f.responsavel));
    const lista = base.filter((p) => f.status === 'Todos' || p.statusLabel === f.status);
    const cnt = {};
    base.forEach((p) => { cnt[p.status] = (cnt[p.status] || 0) + 1; });
    const etapas = Object.keys(PEND_ST).filter((s) => ['aberta', 'em_analise', 'proposta_gerada', 'resolvida'].includes(s) || cnt[s] || f.status === PEND_ST[s][0]);
    const pill = (lbl, val, n) => `<button class="${f.status === val ? 'on' : ''}" onclick="uiV2Om.pendSet('status','${esc(val)}')">${lbl}<em>${n}</em></button>`;
    const ativos = [f.criticidade !== 'Todas', f.responsavel !== 'Todos', f.status !== 'Todos'].filter(Boolean).length;

    const item = (p) => {
      const enc = p.status === 'resolvida' || p.status === 'ignorada';
      const c = CRIT[p.criticidade] || CRIT.media;
      const st = PEND_ST[p.status] || [p.statusLabel || '—', '', 't-gray'];
      const av = p.criticidade === 'critica' ? 'v2om-r' : p.criticidade === 'alta' ? 'o' : 'g';
      const acoes = [
        !enc ? `<button class="v2-btnp" onclick="omPendGerarProposta('${esc(p.id)}')">${ic(p.om_proposta_id ? 'file-text' : 'file-plus')}${p.om_proposta_id ? 'Ver proposta' : 'Gerar proposta corretiva'}</button>` : '',
        enc && p.om_proposta_id ? `<button class="v2-btn2" onclick="omPendGerarProposta('${esc(p.id)}')">${ic('file-text')}Ver proposta</button>` : '',
        !enc ? `<button class="v2-btn2" onclick="omPendResolver('${esc(p.id)}')">${ic('check')}Resolver</button>` : '',
        p.os_id ? `<button class="v2-btn2" onclick="omPendVerOS('${esc(p.id)}')">${ic('clipboard-list')}Ver OS</button>` : '',
      ].join('');
      return `<div class="v2-card v2om-pitem ${enc ? 'enc' : ''}">
        <i class="v2-ini ${av}">${ic('triangle-alert')}</i>
        <div class="tx"><div class="chips"><span class="v2-chip dot ${c[1]}">${c[0]}</span><span class="v2-chip ${st[2]}">${st[0]}</span>${p.os_numero ? `<small>${esc(p.os_numero)}</small>` : ''}</div>
          <b>${esc(p.descricao || '—')}</b><small>${esc(p.cliente || '—')} · Responsável: ${esc(p.responsavel || '—')}</small></div>
        ${acoes ? `<div class="acts">${acoes}</div>` : ''}</div>`;
    };

    container.innerHTML = `
      <div class="v2-toolbar">
        <select class="v2-select ${f.criticidade !== 'Todas' ? 'on' : ''}" onchange="uiV2Om.pendSet('criticidade', this.value)" data-titulo="Criticidade"><option value="Todas">Todas as criticidades</option>${['Crítica', 'Alta', 'Média', 'Baixa'].map((s) => `<option value="${s}" ${s === f.criticidade ? 'selected' : ''}>${s}</option>`).join('')}</select>
        <select class="v2-select ${f.responsavel !== 'Todos' ? 'on' : ''}" onchange="uiV2Om.pendSet('responsavel', this.value)" data-titulo="Responsável"><option value="Todos">Todos os responsáveis</option>${resp.map((r) => `<option value="${esc(r)}" ${r === f.responsavel ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select>
        ${ativos ? `<button class="v2-pill v2-fclear" onclick="uiV2Om.pendLimpar()">${ic('filter-x')}Limpar · ${lista.length} de ${all.length}</button>` : ''}
        <div class="v2-grow"></div>
        ${novo}
      </div>
      <div class="v2-pills">${pill('Todas', 'Todos', base.length)}${etapas.map((s) => pill(PEND_ST[s][1], PEND_ST[s][0], cnt[s] || 0)).join('')}</div>
      ${lista.length ? `<div class="v2om-plist">${lista.map(item).join('')}</div>
        <div class="v2-fim"><div class="m"><span>${ic('circle-check')}Fim da lista · <b>${plural(lista.length, 'pendência', 'pendências')}</b></span></div></div>`
        : `<div class="v2-card v2-empty">Nenhuma pendência com esses filtros.<div style="margin-top:12px"><button class="v2-btn2" onclick="uiV2Om.pendLimpar()">${ic('filter-x')}Limpar filtros</button></div></div>`}`;
    icons();
    if (window.uiV2Filtros) window.uiV2Filtros.aplicar(container);
  }

  // ==================== RELATÓRIOS ====================
  // OS finalizadas (list_om_relatorios); o detalhe continua no om.js.
  const EST_COR = { 'Bom': 't-green', 'Atenção': 't-orange', 'Crítico': 't-red' };
  let relRows = [];
  async function renderRelatoriosV2(container) {
    if (state.omReportDetailId) return renderOMRelatorioDetail(container, state.omReportDetailId);
    if (!state.omRelFilters) state.omRelFilters = { cliente: 'Todos', tecnico: 'Todos', estado: 'Todos' };
    container.className = 'v2s';
    document.body.dataset.v2screen = 'om-relatorios';
    setPageMeta('om:relatorios', 'Relatórios', 'Carregando…');
    container.innerHTML = `<div class="v2-card v2-empty">Carregando relatórios…</div>`;
    const { data, error } = await supabaseClient.rpc('list_om_relatorios');
    if (state.environment !== 'om' || state.omActiveTab !== 'relatorios' || state.omReportDetailId) return;
    if (error) { setPageMeta('om:relatorios', 'Relatórios', ''); container.innerHTML = `<div class="v2-card v2-empty">${esc(erroTx(error))}</div>`; return; }
    relRows = data || [];
    pintarRelatorios(container);
  }
  function pintarRelatorios(container) {
    const f = state.omRelFilters;
    const est = (o) => OM_ESTADO_LABEL[o.estado_geral] || '—';
    const agora = new Date();
    const noMes = relRows.filter((o) => { const d = new Date(o.finalizado_em); return d.getMonth() === agora.getMonth() && d.getFullYear() === agora.getFullYear(); }).length;
    setPageMeta('om:relatorios', 'Relatórios', `${plural(relRows.length, 'relatório', 'relatórios')} · ${noMes} no mês`);
    if (!relRows.length) {
      container.innerHTML = `<div class="v2-card v2-empty">Nenhum relatório ainda. Conclua uma OS para gerar o relatório técnico.</div>`;
      return;
    }
    const clientes = [...new Set(relRows.map((o) => o.cliente).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const tecnicos = [...new Set(relRows.map((o) => o.tecnico).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const base = relRows.filter((o) => (f.cliente === 'Todos' || o.cliente === f.cliente) && (f.tecnico === 'Todos' || (o.tecnico || '') === f.tecnico));
    const lista = base.filter((o) => f.estado === 'Todos' || est(o) === f.estado);
    const cnt = {};
    base.forEach((o) => { const e = est(o); cnt[e] = (cnt[e] || 0) + 1; });
    const pill = (lbl, val, n) => `<button class="${f.estado === val ? 'on' : ''}" onclick="uiV2Om.relSet('estado','${val}')">${lbl}<em>${n}</em></button>`;
    const ativos = [f.cliente !== 'Todos', f.tecnico !== 'Todos', f.estado !== 'Todos'].filter(Boolean).length;
    container.innerHTML = `
      <div class="v2-toolbar">
        <select class="v2-select ${f.cliente !== 'Todos' ? 'on' : ''}" onchange="uiV2Om.relSet('cliente', this.value)" data-titulo="Cliente"><option value="Todos">Todos os clientes</option>${clientes.map((c) => `<option value="${esc(c)}" ${c === f.cliente ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
        <select class="v2-select ${f.tecnico !== 'Todos' ? 'on' : ''}" onchange="uiV2Om.relSet('tecnico', this.value)" data-titulo="Técnico"><option value="Todos">Todos os técnicos</option>${tecnicos.map((t) => `<option value="${esc(t)}" ${t === f.tecnico ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>
        ${ativos ? `<button class="v2-pill v2-fclear" onclick="uiV2Om.relLimpar()">${ic('filter-x')}Limpar · ${lista.length} de ${relRows.length}</button>` : ''}
      </div>
      <div class="v2-pills">${pill('Todos', 'Todos', base.length)}${pill('Bom', 'Bom', cnt['Bom'] || 0)}${pill('Atenção', 'Atenção', cnt['Atenção'] || 0)}${pill('Crítico', 'Crítico', cnt['Crítico'] || 0)}</div>
      ${lista.length ? `<div class="v2-card v2-lista" style="padding:14px 16px"><div class="v2-tscroll"><table class="v2-table">
        <thead><tr><th>Cliente e OS</th><th class="hide-m">Técnico</th><th class="hide-m">Concluída em</th><th class="hide-m">Estado geral</th><th></th></tr></thead>
        <tbody>${lista.map((o) => { const e = est(o); return `<tr onclick="omOpenRelatorio('${esc(o.id)}')">
          <td><div class="v2-who">${avServico(o.tipo_servico)}<div class="v2om-tx"><span class="v2-nm">${esc(o.cliente || '—')}</span><small>${esc(o.numero || '—')}${o.tipo_servico ? ' · ' + esc(o.tipo_servico) : ''}</small><span class="show-m v2-mline"><span class="v2-chip dot ${EST_COR[e] || 't-gray'}">${esc(e)}</span><span class="v2om-minfo">${ic('calendar')}${dataBR(o.finalizado_em)}</span></span></div></div></td>
          <td class="hide-m">${esc(o.tecnico || '—')}</td>
          <td class="hide-m muted">${dataBR(o.finalizado_em)}</td>
          <td class="hide-m"><span class="v2-chip dot ${EST_COR[e] || 't-gray'}">${esc(e)}</span></td>
          <td><div class="v2-acts"><button class="v2-sq" title="Ver relatório" onclick="event.stopPropagation(); omOpenRelatorio('${esc(o.id)}')">${ic('chevron-right')}</button></div></td></tr>`; }).join('')}</tbody></table></div></div>
        <div class="v2-fim"><div class="m"><span>${ic('circle-check')}Fim da lista · <b>${plural(lista.length, 'relatório', 'relatórios')}</b></span></div></div>`
        : `<div class="v2-card v2-empty">Nenhum relatório com esses filtros.<div style="margin-top:12px"><button class="v2-btn2" onclick="uiV2Om.relLimpar()">${ic('filter-x')}Limpar filtros</button></div></div>`}`;
    icons();
    if (window.uiV2Filtros) window.uiV2Filtros.aplicar(container);
  }

  // ==================== troca de render ====================
  const V2 = { renderOMPropostas: renderPropostasV2, renderOMCentral: renderCentralV2, renderOMClientes: renderClientesV2, renderOMPendencias: renderPendenciasV2, renderOMRelatorios: renderRelatoriosV2 };
  Object.entries(V2).forEach(([name, v2]) => {
    if (!has(name)) return;
    const original = window[name];
    window[name] = function (container) {
      if (window.uiV2.isActive()) {
        try { return v2(container); } catch (err) { console.warn('[ui-v2-om] ' + name + ' falhou, usando o antigo', err); }
      }
      return original.apply(this, arguments);
    };
  });
  // As outras abas do O&M ainda são do om.js: não podem herdar o .v2s destas.
  if (has('renderOMRoute')) {
    const _route = renderOMRoute;
    window.renderOMRoute = function (container) {
      if (container) container.classList.remove('v2s');
      return _route.apply(this, arguments);
    };
  }

  window.uiV2Om = {
    // filtros redesenham com a lista já carregada (sem ir ao banco de novo)
    propSet(k, v) {
      state.omPropFilters[k] = v;
      const box = document.getElementById('main-container');
      if (!box || !box.querySelector('.v2om-prop-body')) { if (has('renderContent')) renderContent(); return; }
      if (k === 'search') pintarPropostasLista(box); // o campo de busca não perde o foco
      else pintarPropostas(box);
    },
    propLimpar() {
      state.omPropFilters = { status: 'Todos', tipo: 'Todos', responsavel: 'Todos', search: '' };
      const box = document.getElementById('main-container');
      if (box && box.querySelector('.v2om-prop-body')) pintarPropostas(box);
      else if (has('renderContent')) renderContent();
    },
    busca,
    cliBusca,
    pendSet(k, v) {
      state.omPendFilters[k] = v;
      const box = document.getElementById('main-container');
      if (box && omPendListCache && state.omActiveTab === 'pendencias') pintarPendencias(box); else if (has('renderContent')) renderContent();
    },
    pendLimpar() { state.omPendFilters = { criticidade: 'Todas', status: 'Todos', responsavel: 'Todos' }; this.pendSet('status', 'Todos'); },
    relSet(k, v) {
      state.omRelFilters[k] = v;
      const box = document.getElementById('main-container');
      if (box && state.omActiveTab === 'relatorios' && !state.omReportDetailId) pintarRelatorios(box); else if (has('renderContent')) renderContent();
    },
    relLimpar() { state.omRelFilters = { cliente: 'Todos', tecnico: 'Todos', estado: 'Todos' }; this.relSet('estado', 'Todos'); },
  };
})();
