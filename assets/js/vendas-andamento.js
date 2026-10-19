// ==========================================================================
// ANDAMENTO DAS VENDAS (aba Vendas do Comercial, visual novo)
//
// Cada venda mostra onde o cliente está depois de fechar, em 5 etapas:
//   Pagamento        → títulos do Financeiro (fin_titulos + baixas)
//   Projeto          → engenharia (eng_projetos)
//   Compra e entrega → ordem de compra do Financeiro (status 'entregue' = chegou)
//   Obra             → venda_posvenda (editado aqui mesmo, admin/gestor)
//   Monitoramento    → venda_posvenda (editado aqui mesmo, admin/gestor)
//
// Os dados vêm de uma RPC só (vendas_andamento, com o RLS de quem chama).
// Sem ela (migration 20261019120000 ainda não rodada), o projeto sai de
// state.engPorCliente e o resto fica "aguardando".
// Ajustes de pagamento e compra são feitos no Financeiro: o atalho abre a
// tela certa já filtrada no cliente (state.finFoco, lido em financeiro.js).
// ==========================================================================
(function () {
  'use strict';

  const FASES = [
    { id: 'pag', n: 'Pagamento', i: 'wallet' },
    { id: 'proj', n: 'Projeto', i: 'ruler' },
    { id: 'ent', n: 'Compra e entrega', i: 'truck' },
    { id: 'obra', n: 'Obra', i: 'hard-hat' },
    { id: 'mon', n: 'Monitoramento', i: 'activity' },
  ];
  const ST_TXT = { ok: 'Feito', at: 'Em andamento', late: 'Atenção', '': 'Aguardando' };
  const CHIP = { ok: 't-green', at: 't-blue', late: 't-red', '': 't-gray' };
  const OBRA_ST = [['a_agendar', 'A agendar'], ['agendada', 'Agendada'], ['em_andamento', 'Em andamento'], ['concluida', 'Concluída']];
  const MON_ST = [['pendente', 'Configurar app'], ['ativo', 'Monitorando'], ['alerta', 'Sem comunicar']];
  const FORMAS = { avista: 'À vista', cartao: 'Cartão de crédito', boleto: 'Boleto parcelado', financiamento: 'Financiamento', entrada_financiamento: 'Entrada + financiamento', outra: 'Outra forma' };
  const RECARGA_MS = 2 * 60 * 1000;

  const A = { mapa: null, em: 0, carregando: null, semRpc: false, aberta: null, editando: null, salvando: false };

  const esc = (s) => (typeof escapeHTML === 'function' ? escapeHTML(String(s ?? '')) : String(s ?? ''));
  const ic = (n, extra = '') => `<i data-lucide="${n}" ${extra}></i>`;
  const money = (v) => (typeof formatCurrency === 'function' ? formatCurrency(Number(v) || 0) : 'R$ ' + (Number(v) || 0).toFixed(2));
  const dataIso = (s) => (s ? new Date(String(s).length === 10 ? s + 'T12:00:00' : s) : null);
  const dm = (s) => { const d = dataIso(s); return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : ''; };
  const hojeIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const passou = (iso) => !!iso && String(iso).slice(0, 10) < hojeIso();
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
  const podeEditar = (v) => !!(state.isAdmin || (state.isGestor && (!v.franquia_id || v.franquia_id === state.franquiaId)));

  // ------------------------------------------------------------ dados
  async function carregar(forcar) {
    if (A.semRpc && !forcar) return A.mapa;
    if (!forcar && A.mapa && Date.now() - A.em < RECARGA_MS) return A.mapa;
    if (A.carregando) return A.carregando;
    A.carregando = (async () => {
      try {
        const { data, error } = await supabaseClient.rpc('vendas_andamento');
        if (error) throw error;
        const mapa = {};
        (Array.isArray(data) ? data : []).forEach((r) => { if (r && r.venda_id) mapa[r.venda_id] = r; });
        A.mapa = mapa;
        A.semRpc = false;
      } catch (e) {
        // função ainda não criada no banco: segue só com o que já está na tela
        if (/vendas_andamento|PGRST202|42883/i.test(String(e?.message || e?.code || ''))) A.semRpc = true;
        console.warn('[vendas] andamento', e);
        A.mapa = A.mapa || {};
      }
      A.em = Date.now();
      return A.mapa;
    })();
    try { return await A.carregando; } finally { A.carregando = null; }
  }

  // Pinta de novo a aba Vendas quando os dados chegam (só se ainda estiver nela).
  function garantir() {
    const velho = !A.mapa || Date.now() - A.em > RECARGA_MS;
    if (!velho || A.carregando || (A.semRpc && A.mapa)) return;
    carregar().then(() => {
      if (state.environment === 'comercial' && state.activeTab === 'vendas' && typeof renderContent === 'function') renderContent();
    });
  }

  // ------------------------------------------------------------ etapas
  // Devolve { s: [5 estados], t: { pag: [título, detalhe], ... }, pct, fase, atencao }.
  // Estados: 'ok' feito · 'at' em andamento · 'late' precisa de atenção · '' aguardando.
  function info(v) {
    const d = (A.mapa && A.mapa[v.id]) || {};
    const t = {};
    const s = [];

    // Pagamento
    const p = d.pag;
    let pct = 0;
    const forma = FORMAS[v.forma_pagamento] || '';
    if (!p || !Number(p.n)) {
      s.push(''); t.pag = ['Sem título no Financeiro', forma || 'Nenhum recebível ligado a esta venda'];
    } else {
      const total = Number(p.total) || 0, pago = Number(p.pago) || 0;
      pct = total > 0 ? Math.min(100, Math.round((pago / total) * 100)) : 0;
      const recebido = `${money(pago)} de ${money(total)} recebidos`;
      if (total > 0 && pago >= total - 0.01) { s.push('ok'); t.pag = ['Quitado', `${money(total)} recebidos`]; }
      else if (Number(p.vencidos) > 0) { s.push('late'); t.pag = [`${plural(Number(p.vencidos), 'título vencido', 'títulos vencidos')}`, recebido]; }
      else { s.push('at'); t.pag = [pago > 0 ? 'Recebendo' : 'Aguardando pagamento', `${recebido}${p.prox_venc ? ' · vence ' + dm(p.prox_venc) : ''}`]; }
    }

    // Projeto (engenharia)
    const e = d.eng || (state.engPorCliente && v.cliente_id ? state.engPorCliente[v.cliente_id] : null);
    const ei = e && typeof window.engStatusInfo === 'function' ? window.engStatusInfo(e.status, e.desde || e.status_desde) : null;
    if (!ei) {
      s.push(''); t.proj = ['Não enviado à engenharia', 'O envio é feito na ficha do cliente'];
    } else {
      const det = [ei.d, ei.dias ? `há ${plural(ei.dias, 'dia', 'dias')}` : 'hoje', e.protocolo ? `protocolo ${e.protocolo}` : ''].filter(Boolean).join(' · ');
      if (ei.nivel >= 4 && ei.tone !== 'bad') { s.push('ok'); t.proj = [ei.n, det]; }
      else if (ei.tone === 'bad' || ei.atrasado) { s.push('late'); t.proj = [ei.atrasado && ei.tone !== 'bad' ? `${ei.n} · atrasado` : ei.n, det]; }
      else { s.push('at'); t.proj = [ei.n, det]; }
    }

    // Compra e entrega (ordem de compra)
    const o = d.oc;
    if (!o) {
      if (Number(d.fin_etapa) >= 6) { s.push('ok'); t.ent = ['Kit comprado', 'Sem ordem de compra registrada']; }
      else { s.push(''); t.ent = ['Sem ordem de compra', 'A compra do kit é registrada no Financeiro']; }
    } else {
      const forn = o.fornecedor && o.fornecedor !== '—' ? o.fornecedor : '';
      if (o.status === 'entregue') { s.push('ok'); t.ent = [`Entregue${o.entregue_em ? ' ' + dm(o.entregue_em) : ''}`, forn || 'Kit no local da obra']; }
      else if (o.status === 'comprado') {
        const atrasada = passou(o.previsao);
        s.push(atrasada ? 'late' : 'at');
        t.ent = [atrasada ? 'Entrega atrasada' : 'Kit comprado', [forn, o.previsao ? `previsão de entrega ${dm(o.previsao)}` : 'sem previsão de entrega'].filter(Boolean).join(' · ')];
      } else {
        const nome = { orcamento: 'Orçamento de compra', aprovar: 'Compra aguardando aprovação', aprovado: 'Compra aprovada' }[o.status] || 'Ordem de compra';
        s.push('at'); t.ent = [nome, forn || 'Ainda não comprado'];
      }
    }

    // Obra
    const pos = d.pos || {};
    const projetoOk = s[1] === 'ok';
    if (!pos.obra_status) {
      if (projetoOk) { s.push('at'); t.obra = ['Liberada para agendar', 'Projeto aprovado na concessionária']; }
      else { s.push(''); t.obra = ['Aguardando', 'Libera quando o projeto for aprovado']; }
    } else {
      const equipe = pos.obra_equipe ? `equipe ${pos.obra_equipe}` : '';
      if (pos.obra_status === 'concluida') { s.push('ok'); t.obra = ['Concluída', [pos.obra_data ? dm(pos.obra_data) : '', equipe].filter(Boolean).join(' · ') || 'Obra finalizada']; }
      else if (pos.obra_status === 'agendada') {
        const atrasada = passou(pos.obra_data);
        s.push(atrasada ? 'late' : 'at');
        t.obra = [atrasada ? `Atrasada · era ${dm(pos.obra_data)}` : `Agendada${pos.obra_data ? ' · ' + dm(pos.obra_data) : ''}`, equipe || 'Sem equipe definida'];
      } else if (pos.obra_status === 'em_andamento') { s.push('at'); t.obra = ['Em andamento', equipe || (pos.obra_data ? 'desde ' + dm(pos.obra_data) : '')]; }
      else { s.push('at'); t.obra = ['A agendar', pos.obra_obs || 'Definir data e equipe']; }
    }

    // Monitoramento
    const app = [pos.mon_app, pos.mon_acesso_cliente === true ? 'cliente com acesso' : pos.mon_acesso_cliente === false ? 'cliente sem acesso' : ''].filter(Boolean).join(' · ');
    if (!pos.mon_status) {
      if (s[3] === 'ok') { s.push('at'); t.mon = ['Configurar monitoramento', 'Cadastrar o app e passar o acesso ao cliente']; }
      else { s.push(''); t.mon = ['Aguardando', 'Depois da obra']; }
    } else if (pos.mon_status === 'ativo') { s.push('ok'); t.mon = ['Monitorando', app || 'Sistema comunicando']; }
    else if (pos.mon_status === 'alerta') { s.push('late'); t.mon = ['Sem comunicar', pos.mon_obs || app || 'Verificar o inversor']; }
    else { s.push('at'); t.mon = ['Configurar app', app || 'Cadastrar e passar o acesso ao cliente']; }

    const late = s.indexOf('late');
    const primeira = s.findIndex((x) => x !== 'ok');
    return { s, t, pct, forma, fase: late >= 0 ? late : primeira < 0 ? 5 : primeira, atencao: late >= 0 };
  }

  // ------------------------------------------------------------ peças
  function trilho(v, inf = info(v)) {
    const dica = FASES.map((f) => `${f.n}: ${inf.t[f.id][0]}`).join('\n');
    return `<div class="pv-trk" title="${esc(dica)}">${inf.s.map((x, i) => (i ? `<span class="pv-l ${inf.s[i - 1] === 'ok' && x ? 'ok' : ''}"></span>` : '')
      + `<span class="pv-d ${x}">${x === 'ok' ? ic('check') : x === 'late' ? ic('exclamation-mark') : ''}</span>`).join('')}</div>`;
  }
  function agora(v, inf = info(v)) {
    if (inf.fase === 5) return '<span class="pv-now ok">Tudo pronto · monitorando</span>';
    const f = FASES[inf.fase];
    return `<span class="pv-now ${inf.s[inf.fase] === 'late' ? 'late' : ''}">${esc(f.n)} · ${esc(inf.t[f.id][0])}</span>`;
  }

  // Cartões de cima: quantas vendas em cada etapa (clique filtra a lista).
  function fasesHTML(vendas, filtro) {
    const infos = vendas.map((v) => info(v));
    const cont = FASES.map((_, i) => infos.filter((x) => x.fase === i).length);
    const att = infos.filter((x) => x.atencao).length;
    const prontos = infos.filter((x) => x.fase === 5).length;
    const btn = (id, label, icon, n, extra = '') => `<button type="button" class="pv-fase ${String(filtro) === String(id) ? 'on' : ''} ${extra}" onclick="vendasAndamento.filtrar('${id}')"><small>${ic(icon)}${label}</small><b>${n}</b></button>`;
    const aviso = A.semRpc ? `<p class="pv-aviso">${ic('info')}Pagamento, compra, obra e monitoramento aparecem depois que o banco for atualizado.</p>` : '';
    return `<div class="pv-bloco">
      <div class="v2-ch" style="margin:0 4px 8px"><div><h3>Andamento das vendas</h3><small>Onde cada cliente está depois de fechar. Clique para filtrar a lista.</small></div>
        ${String(filtro) !== 'todas' ? `<button class="v2-btn2" onclick="vendasAndamento.filtrar('todas')">${ic('filter-x')}Ver todas</button>` : ''}</div>
      <div class="pv-fases">
        ${btn('atencao', 'Precisa de atenção', 'triangle-alert', att, att ? 'warn' : '')}
        ${FASES.map((f, i) => btn(i, f.n, f.i, cont[i])).join('')}
        ${btn('pronto', 'Tudo pronto', 'circle-check', prontos)}
      </div>${aviso}</div>`;
  }
  function filtrarLista(vendas, filtro) {
    const f = String(filtro || 'todas');
    if (f === 'todas') return vendas;
    return vendas.filter((v) => {
      const inf = info(v);
      if (f === 'atencao') return inf.atencao;
      if (f === 'pronto') return inf.fase === 5;
      return inf.fase === Number(f);
    });
  }

  // Panorama: um bloco por etapa, com o atalho para onde se resolve aquilo.
  function painel(v, inf = info(v)) {
    const nome = esc(v.cliente_nome || 'cliente');
    const acao = (f) => {
      const cid = esc(v.cliente_id || '');
      if (f.id === 'pag') return state.canFin ? `<button class="pv-go" onclick="event.stopPropagation(); vendasAndamento.irFinanceiro('titulos', '${cid}', '${esc(v.id)}')">Ver títulos no Financeiro${ic('arrow-up-right')}</button>` : '';
      if (f.id === 'ent') return state.canFin ? `<button class="pv-go" onclick="event.stopPropagation(); vendasAndamento.irFinanceiro('ordemcompra', '${cid}', '${esc(v.id)}')">Ver ordem de compra${ic('arrow-up-right')}</button>` : '';
      if (f.id === 'proj') return v.cliente_id ? `<button class="pv-go" onclick="event.stopPropagation(); openCrm360('${cid}', 'engenharia')">${inf.s[1] ? 'Abrir projeto na ficha' : 'Enviar à engenharia'}${ic('arrow-up-right')}</button>` : '';
      if (!podeEditar(v) || A.semRpc) return '';
      return `<button class="pv-edit" onclick="event.stopPropagation(); vendasAndamento.editar('${esc(v.id)}', '${f.id}')">${ic('pencil')}${f.id === 'obra' ? 'Atualizar obra' : 'Atualizar monitoramento'}</button>`;
    };
    const blocos = FASES.map((f, i) => {
      if (A.editando && A.editando.venda === v.id && A.editando.fase === f.id) return formHTML(v, f);
      const st = inf.s[i];
      return `<div class="pv-blk"><h5>${ic(f.i)}${f.n}</h5><span class="v2-chip dot ${CHIP[st]}">${ST_TXT[st]}</span>
        <div class="v">${esc(inf.t[f.id][0])}</div><div class="s">${esc(inf.t[f.id][1])}</div>
        ${f.id === 'pag' && inf.pct ? `<div class="pv-bar"><i style="width:${inf.pct}%"></i></div>` : ''}
        ${acao(f)}</div>`;
    }).join('');
    return `<div class="pv-panwrap"><div class="pv-panhd">${ic('route')}<b>Panorama de ${nome}</b>${inf.forma ? `<span>· ${esc(inf.forma)}</span>` : ''}<span>· venda em ${esc(typeof formatDate === 'function' ? formatDate(v.created_at) : '')}</span>
      <span class="v2-grow"></span>${v.cliente_id ? `<button class="v2-btn2" onclick="event.stopPropagation(); openVendaClienteFicha('${esc(v.id)}')">${ic('user-round')}Abrir ficha completa</button>` : ''}</div>
      <div class="pv-pan">${blocos}</div></div>`;
  }

  // ------------------------------------------------------------ edição (obra / monitoramento)
  function formHTML(v, f) {
    const pos = (A.mapa && A.mapa[v.id] && A.mapa[v.id].pos) || {};
    const opt = (lista, atual) => `<option value="">—</option>${lista.map(([k, l]) => `<option value="${k}" ${atual === k ? 'selected' : ''}>${l}</option>`).join('')}`;
    const campos = f.id === 'obra'
      ? `<label>Situação<select name="obra_status">${opt(OBRA_ST, pos.obra_status)}</select></label>
         <label>Data<input type="date" name="obra_data" value="${esc(pos.obra_data || '')}"></label>
         <label>Equipe<input type="text" name="obra_equipe" maxlength="80" value="${esc(pos.obra_equipe || '')}" placeholder="Ex.: Paulo"></label>
         <label>Observação<input type="text" name="obra_obs" maxlength="200" value="${esc(pos.obra_obs || '')}"></label>`
      : `<label>Situação<select name="mon_status">${opt(MON_ST, pos.mon_status)}</select></label>
         <label>App<input type="text" name="mon_app" maxlength="60" value="${esc(pos.mon_app || '')}" placeholder="Ex.: SolarMan"></label>
         <label>Cliente com acesso<select name="mon_acesso_cliente">${opt([['true', 'Sim'], ['false', 'Não']], pos.mon_acesso_cliente == null ? '' : String(pos.mon_acesso_cliente))}</select></label>
         <label>Observação<input type="text" name="mon_obs" maxlength="200" value="${esc(pos.mon_obs || '')}"></label>`;
    return `<form class="pv-blk pv-form" onclick="event.stopPropagation()" onsubmit="event.preventDefault(); vendasAndamento.salvar('${esc(v.id)}', this)">
      <h5>${ic(f.i)}${f.n}</h5>${campos}
      <div class="pv-formbt"><button type="button" class="v2-btn2" onclick="vendasAndamento.editar(null)">Cancelar</button><button type="submit" class="v2-btnp" ${A.salvando ? 'disabled' : ''}>${A.salvando ? 'Salvando...' : 'Salvar'}</button></div></form>`;
  }

  function editar(vendaId, fase) {
    A.editando = vendaId ? { venda: vendaId, fase } : null;
    if (typeof renderContent === 'function') renderContent();
  }

  async function salvar(vendaId, form) {
    if (A.salvando) return;
    const dados = {};
    form.querySelectorAll('[name]').forEach((el) => { dados[el.name] = el.value; });
    if (dados.obra_status === 'agendada' && !dados.obra_data) { showToast('Informe a data da obra agendada.'); return; }
    A.salvando = true;
    try {
      const { data, error } = await supabaseClient.rpc('venda_posvenda_salvar', { p_venda_id: vendaId, p_dados: dados });
      if (error) throw error;
      A.mapa = A.mapa || {};
      A.mapa[vendaId] = { ...(A.mapa[vendaId] || { venda_id: vendaId }), pos: data };
      A.editando = null;
      showToast('Andamento atualizado.');
    } catch (e) {
      showToast('Não foi possível salvar: ' + (e?.message || e));
    } finally {
      A.salvando = false;
      if (typeof renderContent === 'function') renderContent();
    }
  }

  // ------------------------------------------------------------ atalhos
  // Abre o Financeiro já na sub-aba certa, mostrando só este cliente.
  function irFinanceiro(sub, clienteId, vendaId) {
    if (!state.canFin) { showToast('Você não tem acesso ao Financeiro.'); return; }
    const v = (state.vendas || []).find((x) => x.id === vendaId);
    const grupo = sub === 'ordemcompra' ? 'compras' : 'recebiveis';
    state.finFoco = { cliente_id: clienteId || null, nome: v?.cliente_nome || '', sub, grupo };
    state.finSub = state.finSub || {};
    state.finSub[grupo] = sub;
    if (sub === 'titulos') state.finFilters.recebiveis.f = 'todos';
    if (sub === 'ordemcompra') state.finFilters.ordemcompra.f = 'todos';
    // a aba já tem que estar certa na 1ª pintura do ambiente (senão o filtro se desliga)
    if (state.environment !== 'financeiro') { state.finActiveTab = grupo; setEnvironment('financeiro'); }
    else setTab(grupo);
  }

  function abrir(vendaId) {
    A.aberta = A.aberta === vendaId ? null : vendaId;
    if (A.editando && A.editando.venda !== A.aberta) A.editando = null;
    if (typeof renderContent === 'function') renderContent();
  }

  function filtrar(f) {
    const atual = window.uiV2Screens ? window.uiV2Screens.vendasFase : 'todas';
    if (window.uiV2Screens) window.uiV2Screens.vendasFase = String(atual) === String(f) ? 'todas' : String(f);
    A.aberta = null; A.editando = null;
    if (typeof renderContent === 'function') renderContent();
  }

  window.vendasAndamento = {
    FASES, carregar, garantir, info, trilho, agora, painel, fasesHTML, filtrarLista,
    editar, salvar, irFinanceiro, abrir, filtrar,
    get aberta() { return A.aberta; },
  };
})();
