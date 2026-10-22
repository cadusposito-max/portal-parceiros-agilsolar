// ==========================================================================
// ANDAMENTO DAS VENDAS (aba Vendas do Comercial, visual novo)
//
// Cada venda mostra onde o cliente está depois de fechar, em 5 etapas:
//   Pagamento        → títulos do Financeiro (fin_titulos + baixas)
//   Projeto          → engenharia (eng_projetos)
//   Compra e entrega → ordem de compra do Financeiro (status 'entregue' = chegou)
//   Obra             → venda_posvenda (editado na aba Pós-venda da ficha; admin/gestor)
//   Monitoramento    → venda_posvenda (idem)
//
// Na aba Vendas o panorama é curto (só etapa + situação). Os detalhes, os
// atalhos e a edição ficam na aba Pós-venda da ficha (abaHTML), e o topo da
// ficha troca o funil pelas etapas do pós-venda (topoEtapasHTML/topoResumoHTML).
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

  const A = { mapa: null, em: 0, carregando: null, semRpc: false, aberta: null, editando: null, salvando: false, animar: null, foco: null };
  const FECHA_MS = 200; // igual à animação pv-fecha do screens.css

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
      + `<span class="pv-d ${x}">${x === 'ok' ? ic('check') : x === 'late' ? '<b class="pv-ex">!</b>' : ''}</span>`).join('')}</div>`;
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

  // Embrulho que anima o panorama: desdobra só na pintura logo depois do clique
  // (abrir() liga e desliga A.animar; salvar, editar e recarregar repintam sem animar).
  function abre(v, html) {
    const anim = A.animar === v.id;
    return `<div class="pv-abre ${anim ? 'pv-anim' : ''}" data-pv-venda="${esc(v.id)}"><div class="pv-abre-in">${html}</div></div>`;
  }

  // Para onde leva o clique numa etapa da faixa de Vendas: o lugar onde aquilo se
  // resolve (Financeiro, aba Obras, Engenharia) ou a aba Pós-venda já na etapa.
  function destino(v, faseId) {
    const fin = (sub, txt) => ({ txt, ir: () => irFinanceiro(sub, v.cliente_id, v.id) });
    const ficha = (aba, txt) => ({ txt, ir: () => irEtapa(faseId, () => openVendaClienteFicha(v.id, aba)) });
    if (faseId === 'pag' && state.canFin) return fin('titulos', 'Ver títulos no Financeiro');
    if (faseId === 'ent' && state.canFin) return fin('ordemcompra', 'Ver ordem de compra no Financeiro');
    if (faseId === 'proj') return { txt: 'Abrir na aba Engenharia da ficha', ir: () => openVendaClienteFicha(v.id, 'engenharia') };
    if (faseId === 'obra' && podeEditar(v) && !A.semRpc && window.obras) return { txt: 'Abrir na aba Obras', ir: () => window.vendasAndamento.irObras(v.id) };
    if (faseId === 'mon' && podeEditar(v) && !A.semRpc) {
      return { txt: 'Atualizar monitoramento', ir: () => { A.editando = { venda: v.id, fase: 'mon' }; ficha('posvenda').ir(); } };
    }
    return ficha('posvenda', 'Ver na aba Pós-venda da ficha');
  }
  function irDaLista(vendaId, faseId) {
    const v = (state.vendas || []).find((x) => x.id === vendaId);
    if (!v) return;
    A.editando = null; // edição esquecida aberta na ficha não volta junto
    destino(v, faseId).ir();
  }

  // Linhas curtas (etapa + situação): cada uma leva para onde a etapa se resolve.
  function etapasCurtas(v, inf) {
    return FASES.map((f, i) => {
      const st = inf.s[i];
      const d = destino(v, f.id);
      return `<button type="button" class="pv-mini" onclick="event.stopPropagation(); vendasAndamento.irDaLista('${esc(v.id)}', '${f.id}')" title="${esc(inf.t[f.id][1] + ' · ' + d.txt)}"><span class="pv-d ${st}">${st === 'ok' ? ic('check') : st === 'late' ? '<b class="pv-ex">!</b>' : ''}</span>
        <div class="tx"><small>${f.n}</small><b class="${st}">${esc(inf.t[f.id][0])}</b></div>${ic('arrow-up-right', 'class="pv-mini-ir"')}</button>`;
    }).join('');
  }

  // Vista em cards: lista curta dentro do próprio card.
  function painelCard(v, inf = info(v)) {
    return abre(v, `<div class="pv-lista" onclick="event.stopPropagation()">${etapasCurtas(v, inf)}
      <div class="pv-lfoot"><button class="v2-btn2" onclick="vendasAndamento.fechar('${esc(v.id)}')">${ic('chevron-up')}Fechar</button></div></div>`);
  }

  // Vista em lista: uma faixa com as 5 etapas embaixo da linha da venda.
  // Clicar de novo na linha abre a ficha (abrir).
  function painel(v, inf = info(v)) {
    return abre(v, `<div class="pv-panwrap"><div class="pv-faixa">${etapasCurtas(v, inf)}</div>
      <div class="pv-faixa-rod">${inf.forma ? `<span>${ic('landmark')}${esc(inf.forma)}</span>` : '<span></span>'}<em>Clique de novo na venda para abrir a ficha</em>
        <button class="v2-btn2" onclick="event.stopPropagation(); vendasAndamento.fechar('${esc(v.id)}')">${ic('chevron-up')}Recolher</button></div></div>`);
  }

  // Atalho de cada etapa na aba Pós-venda da ficha: para onde se resolve aquilo.
  function acaoHTML(v, f, inf) {
    const cid = esc(v.cliente_id || '');
    const bt = (onclick, icone, texto, cls = '') => `<button type="button" class="pv-bt2 ${cls}" onclick="event.stopPropagation(); ${onclick}">${ic(icone)}<span>${texto}</span></button>`;
    if (f.id === 'pag') return state.canFin ? bt(`vendasAndamento.irFinanceiro('titulos', '${cid}', '${esc(v.id)}')`, 'arrow-up-right', 'Ver títulos no Financeiro') : '';
    if (f.id === 'ent') return state.canFin ? bt(`vendasAndamento.irFinanceiro('ordemcompra', '${cid}', '${esc(v.id)}')`, 'arrow-up-right', 'Ver ordem de compra') : '';
    if (f.id === 'proj') return v.cliente_id ? bt(`crmSet360Tab('engenharia')`, 'arrow-up-right', inf.s[1] ? 'Abrir na aba Engenharia' : 'Enviar à engenharia') : '';
    if (!podeEditar(v) || A.semRpc) return '';
    // a obra (agenda, equipe, conclusão) é gerenciada na aba Obras do Comercial
    if (f.id === 'obra' && window.obras) return bt(`vendasAndamento.irObras('${esc(v.id)}')`, 'arrow-up-right', 'Abrir na aba Obras');
    return bt(`vendasAndamento.editar('${esc(v.id)}', '${f.id}')`, 'pencil', f.id === 'obra' ? 'Atualizar obra' : 'Atualizar monitoramento', 'edit');
  }

  // ------------------------------------------------------------ ficha do cliente
  // Depois da venda, o topo da ficha troca o funil (Novo → Fechado) pelas 5
  // etapas do pós-venda e o resumo mostra venda, recebido, atenção e obra.
  // O detalhe e a edição ficam na aba "Pós-venda" (logo depois de Vendas).
  // A venda mostrada no topo é a mais recente do cliente.
  function vendaDaFicha(vendas) {
    return [...(vendas || [])].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0] || null;
  }
  // primeira pintura da ficha sem os dados: carrega e repinta
  function garantirFicha() {
    if ((A.mapa && Date.now() - A.em < RECARGA_MS) || A.carregando || (A.semRpc && A.mapa)) return;
    carregar().then(() => { if (typeof _crm360ClientId !== 'undefined' && _crm360ClientId && typeof renderCrm360 === 'function') renderCrm360(); });
  }
  const moneyC = (x) => (typeof formatCurrencyCompact === 'function' ? formatCurrencyCompact(Number(x) || 0) : money(x));
  function recebidoTexto(v) {
    const p = A.mapa && A.mapa[v.id] && A.mapa[v.id].pag;
    if (!p || !Number(p.n)) return '—';
    const total = Number(p.total) || 0, pago = Number(p.pago) || 0;
    return total > 0 && pago >= total - 0.01 ? 'Quitado' : `${pago > 0 ? moneyC(pago) : 'R$ 0'} de ${moneyC(total)}`;
  }

  function topoEtapasHTML(v, clienteId) {
    garantirFicha();
    const inf = info(v);
    const passos = FASES.map((f, i) => {
      const st = inf.s[i];
      const cls = st === 'ok' ? 'done' : st === 'late' ? 'pvlate' : st === 'at' ? 'cur' : '';
      const dentro = st === 'ok' ? ic('check') : st === 'late' ? '<b class="pv-ex">!</b>' : i + 1;
      return `${i ? `<span class="v2f-line ${inf.s[i - 1] === 'ok' ? 'done' : ''}"></span>` : ''}<button type="button" class="v2f-step pv-step ${cls}" onclick="vendasAndamento.irEtapa('${f.id}')" title="${esc(f.n + ': ' + inf.t[f.id][0])}"><i>${dentro}</i><span class="lbl">${f.n}<small>${esc(inf.t[f.id][0])}</small></span></button>`;
    }).join('');
    return `${passos}<button type="button" class="pv-funil" onclick="openClientStatusMenu(event, '${esc(clienteId)}')" title="Etapa do funil de venda (voltar ou marcar perdido)">${ic('git-merge')}<span>Funil</span></button>`;
  }

  // caixas do resumo; a do Responsável vem pronta da ficha
  function topoResumoHTML(v, respHTML) {
    const inf = info(v);
    const pos = (A.mapa && A.mapa[v.id] && A.mapa[v.id].pos) || {};
    const late = inf.s.indexOf('late');
    const agora = inf.fase === 5 ? '<div><small>Andamento</small><b>Tudo pronto</b></div>'
      : late >= 0 ? `<div class="late"><small>Precisa de atenção</small><b>${esc(FASES[late].n)} · ${esc(inf.t[FASES[late].id][0])}</b></div>`
      : `<div><small>Agora</small><b>${esc(FASES[inf.fase].n)} · ${esc(inf.t[FASES[inf.fase].id][0])}</b></div>`;
    const obra = pos.obra_status === 'concluida' ? 'Concluída'
      : pos.obra_data ? dm(pos.obra_data) + (pos.obra_equipe ? ' · ' + pos.obra_equipe : '')
      : (OBRA_ST.find(([k]) => k === pos.obra_status) || [])[1] || 'Sem data';
    return `${respHTML}
      <div><small>Venda</small><b>${esc(money(Number(v.kit_price) || 0))} · ${esc(dm(v.created_at))}</b></div>
      <div><small>Recebido</small><b>${esc(recebidoTexto(v))}</b></div>
      ${agora}
      <div><small>Obra</small><b>${esc(obra)}</b></div>`;
  }

  // linha compacta (cabeçalho encolhido / celular)
  function topoMiniHTML(v, resp) {
    const inf = info(v);
    const f = inf.fase === 5 ? null : FASES[inf.fase];
    return `<span class="${inf.atencao ? 'late' : ''}">${f ? `${esc(f.n)} <b>${esc(inf.t[f.id][0])}</b>` : '<b>Tudo pronto</b>'}</span>
      <span>Resp. <b>${esc(resp)}</b></span><span>Recebido <b>${esc(recebidoTexto(v))}</b></span>`;
  }

  // Aba "Pós-venda" da ficha: uma linha por etapa com o detalhe, o atalho e a edição.
  function abaHTML(vendas) {
    garantirFicha();
    const lista = [...(vendas || [])].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    if (!lista.length) return '';
    const aviso = A.semRpc ? `<p class="pv-aviso">${ic('info')}Pagamento, compra, obra e monitoramento aparecem depois que o banco for atualizado.</p>` : '';
    return `<div class="pva">${lista.map((v, n) => {
      const inf = info(v);
      const k = typeof vendaKitResumo === 'function' ? vendaKitResumo(v) : { nome: v.kit_nome || 'Venda' };
      const linhas = FASES.map((f, i) => {
        if (A.editando && A.editando.venda === v.id && A.editando.fase === f.id) return formHTML(v, f);
        const st = inf.s[i];
        return `<div class="pva-row ${A.foco === f.id && n === 0 ? 'foco' : ''}" ${n === 0 ? `data-pv-etapa="${f.id}"` : ''}><span class="pv-d ${st}">${st === 'ok' ? ic('check') : st === 'late' ? '<b class="pv-ex">!</b>' : ''}</span>
          <div class="tx"><small>${f.n}</small><b class="${st}">${esc(inf.t[f.id][0])}</b><p>${esc(inf.t[f.id][1])}</p>
            ${f.id === 'pag' && inf.pct && inf.pct < 100 ? `<div class="pv-bar"><i style="width:${inf.pct}%"></i></div>` : ''}</div>
          ${acaoHTML(v, f, inf)}</div>`;
      }).join('');
      return `<section class="pva-venda"><div class="pva-h"><h3>${esc(k.nome)}</h3><span>${esc(money(Number(v.kit_price) || 0))} · vendida em ${esc(typeof formatDate === 'function' ? formatDate(v.created_at) : '')}${inf.forma ? ' · ' + esc(inf.forma) : ''}</span></div>${linhas}</section>`;
    }).join('')}${aviso}</div>`;
  }

  // clique numa etapa do topo: abre a aba Pós-venda com a linha em destaque
  // (de Vendas, abrirAba abre a ficha já nessa aba)
  function irEtapa(faseId, abrirAba) {
    A.foco = faseId;
    if (abrirAba) {
      abrirAba();
      // cliente não achado: a ficha não abriu, então nada fica em edição
      if (typeof _crm360ClientId === 'undefined' || !_crm360ClientId) { A.editando = null; A.foco = null; return; }
    } else if (typeof crmSet360Tab === 'function') crmSet360Tab('posvenda');
    requestAnimationFrame(() => {
      const el = document.querySelector(`.pva-row[data-pv-etapa="${faseId}"]`) || document.querySelector('.pva .pv-form');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => { A.foco = null; document.querySelectorAll('.pva-row.foco').forEach((x) => x.classList.remove('foco')); }, 1800);
    });
  }

  // ------------------------------------------------------------ edição (obra / monitoramento, na ficha)
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
    return `<form class="pv-form" onclick="event.stopPropagation()" onsubmit="event.preventDefault(); vendasAndamento.salvar('${esc(v.id)}', this)">
      <h5>${ic(f.i)}${f.n}</h5><div class="pv-campos">${campos}</div>
      <div class="pv-formbt"><button type="button" class="pv-bt" onclick="vendasAndamento.editar(null)">Cancelar</button><button type="submit" class="pv-bt p" ${A.salvando ? 'disabled' : ''}>${A.salvando ? 'Salvando...' : 'Salvar'}</button></div></form>`;
  }

  // Repinta o que estiver na tela: a ficha (se aberta) e a aba de trás.
  function repintar() {
    if (typeof _crm360ClientId !== 'undefined' && _crm360ClientId && typeof renderCrm360 === 'function') renderCrm360();
    if (typeof renderContent === 'function') renderContent();
  }

  function editar(vendaId, fase) {
    A.editando = vendaId ? { venda: vendaId, fase } : null;
    repintar();
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
      // a timeline ganhou o registro "de → para"
      if (typeof crmFetchAtividades === 'function' && typeof _crm360ClientId !== 'undefined' && _crm360ClientId) crmFetchAtividades(_crm360ClientId);
    } catch (e) {
      showToast('Não foi possível salvar: ' + (e?.message || e));
    } finally {
      A.salvando = false;
      repintar();
    }
  }

  // ------------------------------------------------------------ atalhos
  // Abre o Financeiro já na sub-aba certa, mostrando só este cliente.
  function irFinanceiro(sub, clienteId, vendaId) {
    if (!state.canFin) { showToast('Você não tem acesso ao Financeiro.'); return; }
    if (typeof _crm360ClientId !== 'undefined' && _crm360ClientId && typeof closeCrm360 === 'function') closeCrm360();
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

  const pintarLista = () => { if (typeof renderContent === 'function') renderContent(); };

  // 1º clique na venda abre o panorama; o 2º (com ele aberto) abre a ficha na aba Pós-venda
  function abrir(vendaId) {
    if (A.aberta === vendaId) { A.editando = null; openVendaClienteFicha(vendaId, 'posvenda'); return; }
    A.aberta = vendaId;
    A.animar = vendaId;
    if (A.editando && A.editando.venda !== vendaId) A.editando = null;
    pintarLista();
    A.animar = null;
  }

  // dobra o painel e só depois repinta
  function fechar(vendaId) {
    if (A.aberta !== vendaId) return;
    A.aberta = null; A.editando = null;
    const el = document.querySelector(`.pv-abre[data-pv-venda="${vendaId}"]`);
    const semMovimento = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!el || semMovimento) { pintarLista(); return; }
    el.classList.add('pv-fecha');
    setTimeout(() => { if (A.aberta === null) pintarLista(); }, FECHA_MS);
  }

  function filtrar(f) {
    const atual = window.uiV2Screens ? window.uiV2Screens.vendasFase : 'todas';
    if (window.uiV2Screens) window.uiV2Screens.vendasFase = String(atual) === String(f) ? 'todas' : String(f);
    A.aberta = null; A.editando = null;
    if (typeof renderContent === 'function') renderContent();
  }

  window.vendasAndamento = {
    FASES, carregar, garantir, info, trilho, agora, painel, painelCard, fasesHTML, filtrarLista,
    vendaDaFicha, topoEtapasHTML, topoResumoHTML, topoMiniHTML, abaHTML, irEtapa,
    editar, salvar, irFinanceiro, irDaLista, abrir, fechar, filtrar,
    // da ficha (aba Pós-venda) para o card da obra na aba Obras
    irObras: (vendaId) => {
      if (typeof _crm360ClientId !== 'undefined' && _crm360ClientId && typeof closeCrm360 === 'function') closeCrm360();
      if (state.environment !== 'comercial' && typeof setEnvironment === 'function') setEnvironment('comercial');
      setTab('obras');
      if (window.obras) obras.abrir(vendaId);
    },
    get aberta() { return A.aberta; },
  };
})();
