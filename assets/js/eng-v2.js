// ==========================================================================
// ENGENHARIA v2 — projetos da engenharia central (out/2026)
//
// - Ambiente Engenharia (só engenharia central: admin ou engenheiro/coord.
//   técnico da Matriz): visão geral, funil (kanban/lista com os status da
//   Groner), ordens de serviço, catálogo técnico e a calculadora antiga.
// - Comercial: aba "Projetos" (gestor/admin, só leitura) e aba "Engenharia"
//   na ficha do cliente, com o envio à engenharia.
//
// Dimensionamento automático: o kit da venda é ligado a um módulo e a um
// inversor do catálogo (componentes.ficha). O motor é o engCompute da
// calculadora (engenharia.js), sem mudanças.
//
// Segurança: tudo que grava passa por RPC security definer (eng_*). A
// franquia só lê; status muda só pela engenharia central.
// ==========================================================================
(function () {
  'use strict';

  // ------------------------------------------------------------ status
  // [id, rótulo, dica, prazo em dias, tom, com quem está a bola]
  const STATUS = [
    ['validacao', 'Validação', 'Docs e dimensionamento', 2, 'info', 'eng'],
    ['validacao_reprovada', 'Validação reprovada', 'Devolvido à franquia', 3, 'bad', 'franquia'],
    ['validacao_aprovada', 'Validação aprovada', 'OS gerada', 1, 'ok', 'eng'],
    ['elaborar_projeto', 'Elaborar projeto', 'Unifilar, memorial, ART', 3, 'at', 'eng'],
    ['projeto_enviado', 'Projeto enviado', 'Na concessionária', 15, 'info', 'conc'],
    ['projeto_aprovado', 'Projeto aprovado', 'Liberado para obra', 20, 'ok', 'obra'],
    ['projeto_reprovado', 'Projeto reprovado', 'Corrigir e reenviar', 3, 'bad', 'eng'],
    ['projeto_reenviado', 'Projeto reenviado', 'Aguardando novo parecer', 15, 'info', 'conc'],
    ['solicitacao_vistoria', 'Solicitação de vistoria', 'Obra concluída', 2, 'at', 'eng'],
    ['vistoria_solicitada', 'Vistoria solicitada', 'Aguardando concessionária', 10, 'info', 'conc'],
    ['projeto_concluido', 'Projeto concluído', 'Finalizado', 0, 'ok', null],
  ].map(([id, n, d, sla, tone, lado]) => ({ id, n, d, sla, tone, lado }));
  const ST = Object.fromEntries(STATUS.map((s) => [s.id, s]));
  ST.cancelado = { id: 'cancelado', n: 'Cancelado', d: '', sla: 0, tone: 'gray', lado: null };
  // caminho principal (barra de progresso); reprovado/reenviado são desvios
  const LINHA = ['validacao', 'validacao_aprovada', 'elaborar_projeto', 'projeto_enviado', 'projeto_aprovado', 'solicitacao_vistoria', 'vistoria_solicitada', 'projeto_concluido'];
  const NIVEL = { validacao: 0, validacao_reprovada: 0, validacao_aprovada: 1, elaborar_projeto: 2, projeto_enviado: 3, projeto_reprovado: 3, projeto_reenviado: 3, projeto_aprovado: 4, solicitacao_vistoria: 5, vistoria_solicitada: 6, projeto_concluido: 7, cancelado: -1 };
  const LADOS = { eng: 'Engenharia', franquia: 'Franquia', conc: 'Concessionária', obra: 'Obra' };
  const COR = { info: 'var(--v2-blue)', bad: 'var(--v2-red)', ok: 'var(--v2-green)', at: 'var(--v2-orange)', gray: 'var(--v2-gray)' };
  const LIGACOES = [['mono_127', 'Monofásico 127 V'], ['mono_220', 'Monofásico 220 V'], ['bi_220', 'Bifásico 220 V'], ['tri_220', 'Trifásico 220 V'], ['tri_380', 'Trifásico 380 V']];
  const LIG = Object.fromEntries(LIGACOES);
  const REDES_INV = [['mono_220', 'Monofásico 220 V'], ['tri_220', 'Trifásico 220 V'], ['tri_380', 'Trifásico 380 V']];
  const TEMP_MIN = 5;          // °C para o Voc no frio
  const PERDAS = 20;           // % de perdas do sistema (padrão da calculadora)
  const CABO_CC = 4;           // mm² (os kits saem com cabo de 4 mm)
  const LIMITE_QUEDA = 3;      // % (CC)
  const LIMITE_QUEDA_CA = 4;   // % NBR 5410 6.2.7.2: circuito terminal
  const TEMP_AMB = 30;         // °C de referência da NBR 5410 (FCT = 1)

  // Campos da ficha técnica.
  const FICHA = {
    modulo: [['potencia', 'Potência', 'Wp'], ['voc', 'Voc', 'V'], ['vmp', 'Vmp', 'V'], ['isc', 'Isc', 'A'], ['imp', 'Imp', 'A'], ['coef_voc', 'Coef. de temperatura do Voc', '%/°C'], ['coef_pmax', 'Coef. de temperatura da Pmáx', '%/°C']],
    inversor: [['potencia', 'Potência CA', 'W'], ['overload', 'Overload máximo', '%'], ['mppts', 'Nº de MPPTs', ''], ['entradas', 'Entradas por MPPT', 'ex.: 2 ou 2,1'], ['v_max', 'Tensão CC máxima', 'V'], ['v_min_mppt', 'Tensão mínima de MPPT', 'V'], ['v_mppt_max', 'Tensão máxima de MPPT (operação)', 'V'], ['i_max_mppt', 'Corrente máx. de curto-circuito por MPPT', 'A'], ['i_saida_ca', 'Corrente máx. de saída CA', 'A'], ['disj_max', 'Disjuntor máx. indicado pelo fabricante', 'A']],
    micro: [['potencia', 'Potência CA', 'W'], ['modulos_por_micro', 'Módulos por micro', ''], ['v_max_entrada', 'Tensão máxima por entrada', 'V'], ['i_max_entrada', 'Corrente máxima por entrada', 'A'], ['p_max_entrada', 'Potência máxima por entrada', 'W'], ['i_saida_ca', 'Corrente máx. de saída CA', 'A'], ['disj_max', 'Disjuntor máx. indicado pelo fabricante', 'A']],
  };
  const OPCIONAIS = ['p_max_entrada', 'i_max_entrada', 'overload', 'coef_pmax', 'v_mppt_max', 'i_saida_ca', 'disj_max']; // overload vazio = 50 %
  // rótulos curtos para a ficha compacta da calculadora
  const CURTO = { potencia: 'Potência', voc: 'Voc', vmp: 'Vmp', isc: 'Isc', imp: 'Imp', coef_voc: 'Coef. Voc', coef_pmax: 'Coef. Pmáx', overload: 'Overload', mppts: 'MPPTs', entradas: 'Entr./MPPT', v_max: 'V CC máx.', v_min_mppt: 'V mín. MPPT', v_mppt_max: 'V máx. MPPT', i_max_mppt: 'Isc/MPPT', modulos_por_micro: 'Mód./micro', v_max_entrada: 'V máx. entr.', i_max_entrada: 'I máx. entr.', p_max_entrada: 'P máx. entr.', i_saida_ca: 'I saída CA', disj_max: 'Disj. máx.' };
  const TEMP_CELULA = 70;    // °C de célula para o Vmp quente

  const E = {
    projetos: null, loading: null, catalogo: null, kits: null, osLista: null,
    ev: {}, os: {}, tab: 'visao', ctx: 'eng', container: null,
    view: lsGet('eng_view') || 'kanban', busca: '', fr: '', fst: '', soComp: false, soAtraso: false, soAlerta: false, trilhoAberto: {}, concTodos: false,
    aberto: null, ptab: 'dim', dimRodando: false,
    kitBusca: '', kitFiltro: '', kitLimite: 8,
  };

  // ------------------------------------------------------------ utilidades
  const esc = (s) => (typeof escapeHTML === 'function' ? escapeHTML(String(s ?? '')) : String(s ?? ''));
  const ic = (n) => `<i data-lucide="${n}"></i>`;
  const toast = (m) => { if (typeof showToast === 'function') showToast(m); };
  const icons = () => { if (typeof queueAppLucideCreateIcons === 'function') queueAppLucideCreateIcons(); else if (window.lucide) window.lucide.createIcons(); };
  const num = (v) => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : NaN; };
  const vazio = (v) => v === undefined || v === null || String(v).trim() === '';
  const numOu = (v, padrao) => (vazio(v) || !Number.isFinite(num(v)) ? padrao : num(v)); // campo vazio = padrão (num('') daria 0)
  const nf = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
  const dataBR = (s) => (s ? new Date(s.length === 10 ? s + 'T12:00:00' : s).toLocaleDateString('pt-BR') : '—');
  const dataHora = (s) => (s ? new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
  const dias = (de, ate) => Math.max(0, Math.floor(((ate ? new Date(ate) : new Date()) - new Date(de)) / 86400000));
  const pnum = (p) => 'P-' + String(p.numero || 0).padStart(4, '0');
  const ini = (n) => String(n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]).join('').toUpperCase() || '?';
  function lsGet(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (_) { /* sem storage */ } }
  const central = () => !!(state.isAdmin || state.isEngCentral);
  const podeEnviar = () => !!(state.isAdmin || state.isGestor || state.isEngCentral);
  const atrasado = (p) => { const s = ST[p.status]; return !!(s && s.sla && dias(p.status_desde) > s.sla); };
  const sb = () => supabaseClient;

  async function rpc(nome, args) {
    const { data, error } = await sb().rpc(nome, args);
    if (error) throw new Error(error.message || String(error));
    return data;
  }

  // ------------------------------------------------------------ dados
  async function carregarProjetos(forcar) {
    if (E.projetos && !forcar) return E.projetos;
    if (E.loading) return E.loading;
    E.loading = (async () => {
      const { data, error } = await sb().from('eng_projetos').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      E.projetos = (data || []).filter((p) => p.status !== 'cancelado' || central());
      atualizarIndice();
      return E.projetos;
    })();
    try { return await E.loading; } finally { E.loading = null; }
  }

  // projeto mais recente de cada cliente (para selos no Comercial)
  function atualizarIndice() {
    const idx = {};
    (E.projetos || []).forEach((p) => {
      if (!p.cliente_id || p.status === 'cancelado') return;
      if (!idx[p.cliente_id] || new Date(p.created_at) > new Date(idx[p.cliente_id].created_at)) idx[p.cliente_id] = p;
    });
    state.engPorCliente = idx;
  }

  async function carregarCatalogo(forcar) {
    if (E.catalogo && !forcar) return E.catalogo;
    const [c, k] = await Promise.all([
      sb().from('componentes').select('id, tipo, nome, marca, potencia_wp, ativo, ficha, ficha_conferida, ficha_atualizada_em, ficha_atualizada_por').in('tipo', ['modulo', 'inversor']).order('tipo').order('potencia_wp'),
      sb().from('produtos').select('id, name, power, ativo, modulo_id, modulo_qtd, inversor_id, inversor_qtd').order('power'),
    ]);
    if (c.error) throw c.error;
    if (k.error) throw k.error;
    E.catalogo = c.data || [];
    E.kits = k.data || [];
    return E.catalogo;
  }

  async function carregarEventos(id) {
    const { data, error } = await sb().from('eng_eventos').select('*').eq('projeto_id', id).order('created_at');
    if (error) throw error;
    E.ev[id] = data || [];
    return E.ev[id];
  }

  async function carregarOS(id) {
    const { data, error } = await sb().from('eng_os').select('*').eq('projeto_id', id).order('revisao', { ascending: false });
    if (error) throw error;
    E.os[id] = data || [];
    return E.os[id];
  }

  async function recarregarProjeto(id) {
    const { data, error } = await sb().from('eng_projetos').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    if (!E.projetos) E.projetos = [];
    const i = E.projetos.findIndex((p) => p.id === id);
    if (data) { if (i >= 0) E.projetos[i] = data; else E.projetos.unshift(data); }
    atualizarIndice();
    await Promise.all([carregarEventos(id), carregarOS(id)]);
    return data;
  }

  // ------------------------------------------------------------ dimensionamento automático
  const ehMicro = (inv) => !!(inv && inv.ficha && inv.ficha.micro);
  function camposFaltando(eq, tipo) {
    const f = (eq && eq.ficha) || {};
    return FICHA[tipo].filter(([k]) => !OPCIONAIS.includes(k) && (f[k] === undefined || f[k] === null || String(f[k]).trim() === '' || (k !== 'entradas' && !Number.isFinite(num(f[k]))))).map(([, l]) => l);
  }
  function ligacaoOk(rede, lig) {
    if (!rede || !lig) return true;
    if (rede === 'mono_220') return lig !== 'mono_127';
    return rede === lig;
  }
  function geracaoMensal(kwp, hsp, perdas = PERDAS) {
    const dm = [31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    const fs = [1.15, 1.1, 1.05, 0.95, 0.85, 0.8, 0.8, 0.85, 0.95, 1.05, 1.1, 1.15];
    const pr = 1 - perdas / 100;
    return fs.map((f, i) => kwp * hsp * f * pr * dm[i]);
  }
  function hspDe(p) {
    const h = num(p.snapshot && p.snapshot.cliente && p.snapshot.cliente.hsp);
    if (h > 0) return h;
    const f = (state.franquias || []).find((x) => x.id === p.franquia_id);
    return (f && num(f.hsp_medio) > 0) ? num(f.hsp_medio) : 5.4;
  }

  // Proteções CA pela NBR 5410 (cobre, isolação PVC 70 °C), por inversor:
  //   Ib = corrente de saída da ficha (ou P / V); In = 1º disjuntor padrão >= Ib (fator 1,0);
  //   Iz = capacidade da Tabela 36 × FCT (Tabela 40) × FCA (Tabela 42); seção mínima 2,5 mm²;
  //   cabo sobe até Iz >= In e queda CA <= 4 %. Disjuntor DIN (I2 = 1,45 In) cumpre I2 <= 1,45 Iz.
  const DISJUNTORES = [6, 10, 13, 16, 20, 25, 32, 40, 50, 63, 70, 80, 100, 125];
  const SECOES = [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50];
  const IZ_TAB = { // [2 condutores carregados, 3 carregados] por seção
    B1: { 1.5: [17.5, 15.5], 2.5: [24, 21], 4: [32, 28], 6: [41, 36], 10: [57, 50], 16: [76, 68], 25: [101, 89], 35: [125, 110], 50: [151, 134] },
    B2: { 1.5: [16.5, 15], 2.5: [23, 20], 4: [30, 27], 6: [38, 34], 10: [52, 46], 16: [69, 62], 25: [90, 80], 35: [111, 99], 50: [133, 118] },
    C: { 1.5: [19.5, 17.5], 2.5: [27, 24], 4: [36, 32], 6: [46, 41], 10: [63, 57], 16: [85, 76], 25: [112, 96], 35: [138, 119], 50: [168, 144] },
  };
  const METODOS = [['B1', 'B1 · eletroduto embutido'], ['B2', 'B2 · multipolar em eletroduto'], ['C', 'C · cabo aparente na parede']];
  const FCT_PVC = [[10, 1.22], [15, 1.17], [20, 1.12], [25, 1.06], [30, 1], [35, 0.94], [40, 0.87], [45, 0.79], [50, 0.71], [55, 0.61], [60, 0.5]];
  const fctDe = (t) => (FCT_PVC.find(([tt]) => tt >= t) || [, 0.5])[1]; // arredonda a temperatura para cima
  const fcaDe = (n) => (n <= 1 ? 1 : n === 2 ? 0.8 : n === 3 ? 0.7 : n === 4 ? 0.65 : n === 5 ? 0.6 : n === 6 ? 0.57 : n === 7 ? 0.54 : n === 8 ? 0.52 : n <= 11 ? 0.5 : n <= 15 ? 0.45 : n <= 19 ? 0.41 : 0.38);
  const peDe = (sec) => (sec <= 16 ? sec : sec <= 35 ? 16 : sec / 2);
  // o = { iSaida, disjMax, dist (m, inversor -> quadro), tamb, circ, metodo }
  function protecoes(potW, rede, o = {}) {
    const v = rede === 'tri_380' ? 380 : 220;
    const tri = rede === 'tri_220' || rede === 'tri_380';
    const iCalc = tri ? potW / (Math.sqrt(3) * v) : potW / v;
    const iFicha = num(o.iSaida);
    const ib = iFicha > 0 ? iFicha : iCalc;
    const disj = DISJUNTORES.find((d) => d >= ib) || DISJUNTORES[DISJUNTORES.length - 1];
    const disjMax = num(o.disjMax) > 0 ? num(o.disjMax) : null;
    const tamb = numOu(o.tamb, TEMP_AMB);
    const circ = Math.max(1, Math.round(numOu(o.circ, 1)));
    const metodo = IZ_TAB[o.metodo] ? o.metodo : 'B1';
    const fct = fctDe(tamb), fca = fcaDe(circ);
    const dist = num(o.dist) > 0 ? num(o.dist) : 0;
    const quedaDe = (sec) => { const dv = (tri ? Math.sqrt(3) : 2) * 0.0172 * dist * ib / sec; return { dv, pct: (dv / v) * 100 }; };
    const izDe = (sec) => IZ_TAB[metodo][sec][tri ? 1 : 0] * fct * fca;
    let cabo = SECOES.find((sec) => sec >= 2.5 && izDe(sec) >= disj && (!dist || quedaDe(sec).pct <= LIMITE_QUEDA_CA));
    let porCapacidade = SECOES.find((sec) => sec >= 2.5 && izDe(sec) >= disj);
    const estourou = !cabo;
    if (!cabo) cabo = SECOES[SECOES.length - 1];
    const queda = dist ? { dist, ...quedaDe(cabo) } : null;
    return {
      corrente: ib, ib, iCalc, iFicha: iFicha > 0 ? iFicha : null, tensao: v,
      disjuntor: disj, disjMax, polos: tri ? 'tripolar' : 'bipolar',
      cabo, pe: peDe(cabo), iz: izDe(cabo), izTab: IZ_TAB[metodo][cabo][tri ? 1 : 0], fct, fca, tamb, circ, metodo,
      carregados: tri ? 3 : 2, subiuPorQueda: !!(porCapacidade && cabo > porCapacidade), estourou, queda,
      condutores: tri ? '3F + N + PE' : 'F + N + PE',
    };
  }

  // Dimensionamento do projeto: confere o kit e chama o cálculo comum.
  function dimensionar(p) {
    const sn = p.snapshot || {};
    const mod = sn.modulo, inv = sn.inversor;
    const hsp = hspDe(p);
    const rev = (motivo) => ({ status: 'revisao', motivo, checks: [], hsp, auto: true });
    if (!sn.kit) return rev('Kit da venda não encontrado no catálogo (proposta personalizada ou kit fora da lista)');
    if (!mod || !inv) return rev('O kit "' + sn.kit.nome + '" ainda não tem módulo e inversor ligados');
    if (!(mod.qtd > 0) || !(inv.qtd > 0)) return rev('O vínculo do kit está sem quantidade de módulos ou de inversores');
    const inst = sn.instalacao || {};
    return { ...calcularSistema({ mod, inv, hsp, perdas: PERDAS, tmin: TEMP_MIN, lig: inst.tipo_ligacao, dist: num(inst.distancia_m), bitola: CABO_CC }), auto: true };
  }

  // Cálculo comum (dimensionamento automático e calculadora). O motor é o
  // engCompute da calculadora antiga; com arranjo personalizado, as
  // verificações são refeitas sobre o arranjo informado.
  // o = { mod, inv (com qtd e ficha), hsp, perdas, tmin, tmax, lig, dist, bitola, arranjo?, ca? { dist, tamb, circ, metodo } }
  function calcularSistema(o) {
    const { mod, inv } = o;
    const hsp = num(o.hsp) > 0 ? num(o.hsp) : 5.4;
    const perdas = numOu(o.perdas, PERDAS);
    const tmin = numOu(o.tmin, TEMP_MIN);
    const tmax = numOu(o.tmax, TEMP_CELULA);
    const bitola = num(o.bitola) > 0 ? num(o.bitola) : CABO_CC;
    const dist = num(o.dist);
    const lig = o.lig;
    const rev = (motivo, extra) => ({ status: 'revisao', motivo, checks: [], hsp, ...(extra || {}) });
    if (!(mod && mod.qtd > 0) || !(inv && inv.qtd > 0)) return rev('Informe a quantidade de módulos e de inversores');
    const fm = camposFaltando(mod, 'modulo');
    if (fm.length) return rev('Ficha técnica incompleta: ' + mod.nome + ' (' + fm.join(', ') + ')');
    const fi = camposFaltando(inv, ehMicro(inv) ? 'micro' : 'inversor');
    if (fi.length) return rev('Ficha técnica incompleta: ' + inv.nome + ' (' + fi.join(', ') + ')');

    const m = mod.ficha, f = inv.ficha;
    const voc = num(m.voc), vmp = num(m.vmp), isc = num(m.isc), imp = num(m.imp), pmod = num(m.potencia), coef = num(m.coef_voc);
    const vocFrio = voc * (1 + (tmin - 25) * (coef / 100));
    const vmpQuente = vmp * (1 + (tmax - 25) * (coef / 100)); // aproximação pelo coef. do Voc
    const kwp = (mod.qtd * pmod) / 1000;
    const checks = [];
    // n/lim/sentido: números para a barra de "uso do limite"
    const add = (nome, calc, limite, valor, ok, n, lim, sentido) => checks.push({ nome, calc, limite, valor, ok, n, lim, sentido: sentido || 'max' });
    const potCA = num(f.potencia) * inv.qtd;
    const overloadMax = numOu(f.overload, 50);
    let res = null, tipo, minSerie = 0, maxSerie = 0, maxPar = 0;

    if (ehMicro(inv)) {
      tipo = 'micro';
      const porMicro = num(f.modulos_por_micro);
      const cap = porMicro * inv.qtd;
      add('Módulos por micro', `${mod.qtd} módulos em ${inv.qtd} micros de ${porMicro} entradas`, `≤ ${cap}`, `${mod.qtd}`, mod.qtd <= cap, mod.qtd, cap);
      add('Tensão máxima no frio (' + tmin + ' °C)', 'Voc corrigido de um módulo', `≤ ${nf(f.v_max_entrada, 0)} V`, `${nf(vocFrio, 1)} V`, vocFrio <= num(f.v_max_entrada), vocFrio, num(f.v_max_entrada));
      if (!vazio(f.i_max_entrada)) add('Corrente por entrada', 'Isc do módulo', `≤ ${nf(f.i_max_entrada, 1)} A`, `${nf(isc, 1)} A`, isc <= num(f.i_max_entrada), isc, num(f.i_max_entrada));
      if (!vazio(f.p_max_entrada)) add('Potência por entrada', 'Potência do módulo', `≤ ${nf(f.p_max_entrada, 0)} W`, `${nf(pmod, 0)} W`, pmod <= num(f.p_max_entrada), pmod, num(f.p_max_entrada));
      const mensal = geracaoMensal(kwp, hsp, perdas);
      res = { monthlyGeneration: mensal, geracaoMedia: mensal.reduce((a, b) => a + b, 0) / 12, micro: { qtd: inv.qtd, porMicro } };
    } else {
      tipo = 'string';
      if (typeof engCompute !== 'function') return rev('Motor de cálculo não carregado');
      const inputs = {
        invBrand: inv.marca || '', invModel: inv.nome, modBrand: mod.marca || '', modModel: mod.nome, gridType: lig || '',
        inverterCount: inv.qtd, moduleCount: mod.qtd, irradiation: hsp, systemLosses: perdas,
        inverterPower: num(f.potencia), overload: overloadMax, mpptCount: num(f.mppts),
        connectorsPerMppt: String(f.entradas).replace(/\s/g, ''), mpptMinV: num(f.v_min_mppt), inverterMaxV: num(f.v_max), mpptMaxA: num(f.i_max_mppt),
        modulePower: pmod, moduleVmp: vmp, moduleImp: imp, moduleVoc: voc, moduleIsc: isc, tempCoef: coef, minTemp: tmin,
        enableVdropCalc: Number.isFinite(dist) && dist > 0, cableDistance: Number.isFinite(dist) ? dist : 0, dcCableSize: String(bitola), groupingFactor: '0.7',
      };
      let distribution;
      if (o.arranjo) {
        // arranjo personalizado: confere o total e o limite físico de entradas por MPPT
        distribution = o.arranjo.map((d) => ({ numStrings: Math.max(0, Math.round(num(d.numStrings)) || 0), modulesPerString: Math.max(0, Math.round(num(d.modulesPerString)) || 0) }));
        const porInv = mod.qtd / inv.qtd;
        const total = distribution.reduce((a, d) => a + d.numStrings * d.modulesPerString, 0);
        if (total !== porInv) return rev(`O arranjo soma ${total} módulos por inversor; o sistema tem ${nf(porInv, 1)}`, { inputs, tipo });
        const lim = String(f.entradas).includes(',') ? String(f.entradas).split(',').map((x) => parseInt(x, 10)) : Array(num(f.mppts)).fill(parseInt(f.entradas, 10));
        const estoura = distribution.findIndex((d, i) => d.numStrings > (lim[i] || lim[0] || 1));
        if (estoura >= 0) return rev(`A MPPT ${estoura + 1} tem só ${lim[estoura] || lim[0]} entrada(s)`, { inputs, tipo });
        const mensal = geracaoMensal(kwp, hsp, perdas);
        res = { distribution, monthlyGeneration: mensal, geracaoMedia: mensal.reduce((a, b) => a + b, 0) / 12, maxVStringGlobal: Math.max(...distribution.filter((d) => d.numStrings).map((d) => d.modulesPerString)) * vocFrio };
      } else {
        const r = engCompute(inputs);
        if (r.error) return rev(r.error, { inputs, tipo });
        res = r;
        distribution = r.distribution;
      }
      const usados = distribution.filter((d) => d.numStrings > 0);
      minSerie = Math.min(...usados.map((d) => d.modulesPerString));
      maxPar = Math.max(...usados.map((d) => d.numStrings));
      maxSerie = Math.max(...usados.map((d) => d.modulesPerString));
      add('Tensão máxima no frio (' + tmin + ' °C)', 'Voc corrigido da maior string', `≤ ${nf(f.v_max, 0)} V`, `${nf(res.maxVStringGlobal, 1)} V`, res.maxVStringGlobal <= num(f.v_max), res.maxVStringGlobal, num(f.v_max));
      add('Tensão mínima de MPPT (quente, ' + tmax + ' °C)', 'Vmp corrigido da menor string', `≥ ${nf(f.v_min_mppt, 0)} V`, `${nf(vmpQuente * minSerie, 1)} V`, vmpQuente * minSerie >= num(f.v_min_mppt), vmpQuente * minSerie, num(f.v_min_mppt), 'min');
      if (!vazio(f.v_mppt_max)) add('Tensão de MPPT em operação', 'Vmp da maior string (STC)', `≤ ${nf(f.v_mppt_max, 0)} V`, `${nf(vmp * maxSerie, 1)} V`, vmp * maxSerie <= num(f.v_mppt_max), vmp * maxSerie, num(f.v_mppt_max));
      add('Corrente por MPPT', 'Isc × strings em paralelo', `≤ ${nf(f.i_max_mppt, 1)} A`, `${nf(isc * maxPar, 1)} A`, isc * maxPar <= num(f.i_max_mppt), isc * maxPar, num(f.i_max_mppt));
      const ov = (kwp * 1000 / potCA - 1) * 100;
      add('Overload', `${nf(kwp, 2)} kWp ÷ ${nf(potCA / 1000, 2)} kW`, `≤ ${nf(overloadMax, 0)} %`, `${nf(ov, 1)} %`, ov <= overloadMax, ov, overloadMax);
      res.inputs = inputs;
    }
    add('Tipo de ligação', `${inv.nome} (${(REDES_INV.find((x) => x[0] === f.rede) || [, 'rede não informada'])[1]}) com ${LIG[lig] || 'ligação não informada'}`, 'compatível', ligacaoOk(f.rede, lig) ? 'ok' : 'não', !!lig && ligacaoOk(f.rede, lig));
    const ca = o.ca || {};
    const pr = protecoes(potCA / inv.qtd, f.rede, { iSaida: f.i_saida_ca, disjMax: f.disj_max, dist: ca.dist, tamb: ca.tamb, circ: ca.circ, metodo: ca.metodo });
    add('Disjuntor CA (NBR 5410)', `Ib ${nf(pr.ib, 1)} A ≤ In ${pr.disjuntor} A ≤ Iz ${nf(pr.iz, 1)} A · cabo ${String(pr.cabo).replace('.', ',')} mm²`, `≤ ${nf(pr.iz, 1)} A`, `${pr.disjuntor} A`, pr.ib <= pr.disjuntor && pr.disjuntor <= pr.iz && !pr.estourou, pr.disjuntor, pr.iz);
    if (pr.disjMax) add('Disjuntor x fabricante', 'Disjuntor máximo indicado na ficha', `≤ ${nf(pr.disjMax, 0)} A`, `${pr.disjuntor} A`, pr.disjuntor <= pr.disjMax, pr.disjuntor, pr.disjMax);
    if (pr.queda) add('Queda de tensão CA', `${nf(pr.queda.dist, 0)} m · cabo ${String(pr.cabo).replace('.', ',')} mm² · ${nf(pr.ib, 1)} A`, `≤ ${LIMITE_QUEDA_CA} %`, `${nf(pr.queda.pct, 2)} %`, pr.queda.pct <= LIMITE_QUEDA_CA, pr.queda.pct, LIMITE_QUEDA_CA);
    let queda = null, quedaInfo = null;
    if (tipo === 'string' && Number.isFinite(dist) && dist > 0) {
      const dv = (0.0172 * 2 * dist / bitola) * imp;
      queda = (dv / (vmp * minSerie)) * 100;
      quedaInfo = { R: 0.0172 * 2 * dist / bitola, dv, pct: queda, dist, bitola, imp };
      add('Queda de tensão CC', `${nf(dist, 0)} m · cabo ${String(bitola).replace('.', ',')} mm² · ${nf(imp, 1)} A`, `≤ ${LIMITE_QUEDA} %`, `${nf(queda, 2)} %`, queda <= LIMITE_QUEDA, queda, LIMITE_QUEDA);
    }
    const falhas = checks.filter((c) => !c.ok);
    const fichasConferidas = mod.ficha_conferida && inv.ficha_conferida;
    return {
      tipo, status: falhas.length ? 'revisao' : 'ok',
      motivo: falhas.length ? falhas.map((c) => c.nome).join(', ') : (fichasConferidas ? null : 'Ficha técnica ainda não conferida pela engenharia'),
      checks, hsp, perdas, tmin, kwp, potCA, queda, bitola,
      distribution: res.distribution || null, micro: res.micro || null, arranjo_personalizado: !!o.arranjo,
      geracaoMedia: res.geracaoMedia, monthlyGeneration: res.monthlyGeneration,
      vocCorrected: vocFrio, inputs: res.inputs || null,
      tmax, vmpQuente, maxSerie, maxPar, quedaInfo, modEl: { voc, vmp, isc, imp, pmod },
      protecoes: pr, inversores: inv.qtd,
      equipamentos: { modulo: mod, inversor: inv },
      fichas_conferidas: !!fichasConferidas, em: new Date().toISOString(),
    };
  }

  // A engenharia roda o automático nos projetos em validação que ainda não têm resultado.
  async function rodarAutomaticos() {
    if (!central() || E.dimRodando || !E.projetos) return;
    const pend = E.projetos.filter((p) => p.status === 'validacao' && !p.dim);
    if (!pend.length) return;
    E.dimRodando = true;
    try {
      for (const p of pend) {
        const d = dimensionar(p);
        try {
          await rpc('eng_salvar_dim', { p_id: p.id, p_dim: d, p_status: d.status === 'ok' ? 'ok' : 'revisao', p_motivo: d.status === 'ok' ? null : d.motivo });
          Object.assign(p, { dim: d, dim_status: d.status === 'ok' ? 'ok' : 'revisao', dim_motivo: d.status === 'ok' ? null : d.motivo, dim_em: d.em });
        } catch (e) { console.warn('[eng] dimensionamento automático', p.id, e); }
      }
    } finally { E.dimRodando = false; }
    pintar();
  }

  // ------------------------------------------------------------ tempo dividido (relógio do servidor)
  function tempoPorLado(p, eventos) {
    const marcos = (eventos || []).filter((e) => (e.tipo === 'status' || e.tipo === 'envio') && e.para_status).map((e) => ({ st: e.para_status, em: e.created_at }));
    if (!marcos.length) marcos.push({ st: 'validacao', em: p.created_at });
    const tot = { eng: 0, franquia: 0, conc: 0, obra: 0 };
    marcos.forEach((m, i) => {
      const fim = i + 1 < marcos.length ? new Date(marcos[i + 1].em) : (p.status === 'projeto_concluido' || p.status === 'cancelado' ? new Date(m.em) : new Date());
      const lado = ST[m.st] && ST[m.st].lado;
      if (lado) tot[lado] += Math.max(0, fim - new Date(m.em)) / 86400000;
    });
    return tot;
  }

  // ------------------------------------------------------------ peças visuais
  const pill = (txt, tone, dot = true) => `<span class="rd-pill ${dot ? '' : 'nodot'} ${({ info: 'rd-info', bad: 'rd-bad', ok: 'rd-ok', at: 'rd-at', gray: 'rd-gray' })[tone] || 'rd-gray'}">${txt}</span>`;
  const stPill = (p) => { const s = ST[p.status] || ST.cancelado; return pill(esc(s.n), s.tone); };
  function dimPill(p) {
    if (p.status !== 'validacao') return '';
    if (!p.dim_status) return pill('Calculando', 'gray');
    return p.dim_status === 'ok' ? pill('Auto aprovado', 'ok') : pill('Precisa revisão', 'bad');
  }
  const docsFaltando = (p) => ((p.snapshot && p.snapshot.docs_faltando) || []);
  const docsPill = (p) => (docsFaltando(p).length && NIVEL[p.status] <= 1 ? `<span class="rd-pill rd-at" title="Faltou: ${esc(docsFaltando(p).join(', '))}">Docs incompletos</span>` : '');
  const compPill = (p) => (p.compensacao ? (p.compensacao.status === 'feita' ? pill('Compensação feita', 'ok') : pill('Compensação pendente', 'at')) : '');
  const alertaPill = (p) => (p.alerta && central() ? `<span class="eg-alerta" title="Algo mudou depois do envio">${ic('triangle-alert')}</span>` : '');
  const kitCurto = (p) => String((p.snapshot && p.snapshot.venda && p.snapshot.venda.kit_nome) || '').replace(/^KIT\s+/i, '');

  // semChips: ignora os filtros rápidos do funil (para contar cada um)
  function filtrados(semChips) {
    const q = E.busca.trim().toLowerCase();
    const chips = !semChips && E.tab === 'funil' || (!semChips && E.ctx === 'com');
    return (E.projetos || []).filter((p) => p.status !== 'cancelado'
      && (!E.fr || p.franquia_id === E.fr)
      && (!chips || !E.soComp || (p.compensacao && p.compensacao.status !== 'feita'))
      && (!chips || !E.soAtraso || atrasado(p))
      && (!chips || !E.soAlerta || p.alerta)
      && (!q || `${p.cliente_nome || ''} ${pnum(p)} ${p.cidade || ''} ${p.uc || ''} ${p.protocolo || ''}`.toLowerCase().includes(q)));
  }

  function franquiasDosProjetos() {
    const m = new Map();
    (E.projetos || []).forEach((p) => m.set(p.franquia_id, (p.snapshot && p.snapshot.franquia_nome) || 'Franquia'));
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }
  const nomeFranquia = (p) => String((p.snapshot && p.snapshot.franquia_nome) || '').replace(/^\s*[áa]gil\s*solar\s*/i, '') || '—';

  // ------------------------------------------------------------ rotas
  async function renderEngRoute(container, tab) {
    E.ctx = 'eng';
    E.container = container;
    E.tab = tab || 'visao';
    if (!central()) {
      container.innerHTML = `<div class="rd"><div class="rd-card rd-empty"><div class="ic">${ic('lock')}</div><b>Acesso restrito</b>O ambiente Engenharia é da engenharia central.</div></div>`;
      icons();
      return;
    }
    await carregarTela(container, E.tab === 'catalogo' || E.tab === 'calculadora');
  }

  async function renderEngProjetosComercial(container) {
    E.ctx = 'com';
    E.container = container;
    E.tab = 'funil';
    await carregarTela(container, false);
  }

  async function carregarTela(container, comCatalogo) {
    const precisa = !E.projetos || (comCatalogo && !E.catalogo) || (E.tab === 'os' && !E.osLista);
    if (precisa) {
      container.innerHTML = `<div class="rd"><div class="rd-loading">${ic('loader-2')}Carregando a engenharia...</div></div>`;
      icons();
      try {
        await Promise.all([
          carregarProjetos(),
          comCatalogo ? carregarCatalogo() : null,
          E.tab === 'os' ? carregarListaOS() : null,
        ]);
      } catch (err) {
        console.error('[eng] falha ao carregar', err);
        container.innerHTML = `<div class="rd"><div class="rd-card rd-empty"><div class="ic">${ic('alert-triangle')}</div><b>Não foi possível carregar</b>${esc(err.message || err)}<br><br><button class="rd-btn" onclick="EV.recarregar()">${ic('refresh-cw')}Tentar de novo</button></div></div>`;
        icons();
        return;
      }
    }
    if (E.container !== container) return;
    pintar();
    rodarAutomaticos();
  }

  async function carregarListaOS() {
    const { data, error } = await sb().from('eng_os').select('id, projeto_id, numero, revisao, equipe, created_at, created_by_nome').eq('ativa', true).order('created_at', { ascending: false });
    if (error) throw error;
    E.osLista = data || [];
  }

  function pintar() {
    const c = E.container;
    if (!c || !document.body.contains(c)) { pintarDrawer(); return; }
    const naTela = (E.ctx === 'eng' && state.environment === 'engenharia') || (E.ctx === 'com' && state.environment !== 'engenharia' && state.activeTab === 'engprojetos');
    if (!naTela) { pintarDrawer(); return; }
    const corpo = E.ctx === 'com' ? telaFunil() : ({ visao: telaVisao, funil: telaFunil, os: telaOS, catalogo: telaCatalogo, calculadora: telaCalc }[E.tab] || telaVisao)();
    const y = window.scrollY;
    c.innerHTML = `<div class="rd eg">${corpo}</div>`;
    pintarDrawer();
    icons();
    window.scrollTo(0, y);
    ajustarKanban();
  }

  // ------------------------------------------------------------ visão geral
  function telaVisao() {
    const ps = filtrados();
    const fila = ps.filter((p) => p.status === 'validacao');
    const okc = fila.filter((p) => p.dim_status === 'ok').length;
    const atr = ps.filter(atrasado).sort((a, b) => dias(b.status_desde) - dias(a.status_desde));
    const alertas = ps.filter((p) => p.alerta);
    const por = STATUS.map((s) => ps.filter((p) => p.status === s.id).length);
    const mx = Math.max(1, ...por);
    const mesIni = new Date(); mesIni.setDate(1); mesIni.setHours(0, 0, 0, 0);
    const conc = ps.filter((p) => p.status === 'projeto_concluido');
    const durs = conc.map((p) => dias(p.created_at, p.status_desde));
    const media = durs.length ? Math.round(durs.reduce((a, b) => a + b, 0) / durs.length) : null;
    const comp = ps.filter((p) => p.compensacao && p.compensacao.status !== 'feita').length;
    return `${barra(true)}
      <div class="rd-grid rd-k5 rd-mb">
        <div class="rd-kpi hero"><div class="l">${ic('inbox')}Em validação</div><div class="v">${fila.length}</div><div class="h">Chegaram das franquias</div></div>
        <div class="rd-kpi"><div class="l" style="color:#12704A">${ic('circle-check')}Auto aprovados</div><div class="v">${okc}</div><div class="h">Só falta conferir e aprovar</div></div>
        <div class="rd-kpi"><div class="l" style="color:var(--v2-red)">${ic('circle-alert')}Precisam de revisão</div><div class="v">${fila.length - okc}</div><div class="h">Equipamento, ficha ou cálculo</div></div>
        <div class="rd-kpi"><div class="l">${ic('alarm-clock')}Fora do prazo</div><div class="v">${atr.length}</div><div class="h">Prazo de cada status</div></div>
        <div class="rd-kpi"><div class="l">${ic('timer')}Envio → concluído</div><div class="v">${media == null ? '—' : media + ' dias'}</div><div class="h">${conc.length} concluído(s)</div></div>
      </div>
      <div class="rd-grid rd-two">
        <div class="rd-card"><h3>${ic('git-merge')}Projetos por status</h3><p class="rd-sub">Clique para ver a lista</p>
          ${STATUS.map((s, i) => `<button class="eg-barra" onclick="EV.verStatus('${s.id}')"><span>${esc(s.n)}</span><div class="rd-meter"><i style="width:${(por[i] / mx) * 100}%;background:${COR[s.tone]}"></i></div><b>${por[i]}</b></button>`).join('')}
        </div>
        <div>
          <div class="rd-card rd-mb"><h3>${ic('alarm-clock')}Passaram do prazo</h3><p class="rd-sub">Do mais antigo para o mais novo</p>
            ${atr.length ? atr.slice(0, 8).map((p) => alertaLinha(p, 'bad', 'clock', `${esc(ST[p.status].n)} · ${dias(p.status_desde)} dias (prazo ${ST[p.status].sla})`)).join('') : '<div class="rd-muted">Nada atrasado.</div>'}
          </div>
          <div class="rd-card"><h3>${ic('triangle-alert')}Mudou depois do envio</h3><p class="rd-sub">Documento novo ou dado do cliente alterado</p>
            ${alertas.length ? alertas.slice(0, 8).map((p) => alertaLinha(p, 'at', 'file-warning', esc(nomeFranquia(p)))).join('') : '<div class="rd-muted">Nenhum alerta.</div>'}
            ${comp ? `<button class="rd-alert" onclick="EV.soCompensacao()"><span class="ic at">${ic('zap')}</span><span><b>${comp} compensação(ões) pendente(s)</b><span>Ver no funil</span></span></button>` : ''}
          </div>
        </div>
      </div>`;
  }
  const alertaLinha = (p, tone, icone, sub) => `<button class="rd-alert" onclick="EV.abrir('${p.id}')"><span class="ic ${tone}">${ic(icone)}</span><span><b>${esc(p.cliente_nome || 'Cliente')} · ${pnum(p)}</b><span>${sub}</span></span></button>`;

  function barra(semVisao, chips) {
    const frs = franquiasDosProjetos();
    const leitura = E.ctx === 'com';
    return `<div class="rd-bar">
      <label class="rd-sel">${ic('search')}<input placeholder="Buscar cliente, projeto, UC" value="${esc(E.busca)}" oninput="EV.buscar(this.value)"></label>
      ${frs.length > 1 ? `<label class="rd-sel">${ic('store')}<select onchange="EV.franquia(this.value)"><option value="">Todas as franquias</option>${frs.map(([id, n]) => `<option value="${id}" ${E.fr === id ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>` : ''}
      ${chips || ''}
      <span class="rd-grow"></span>
      ${semVisao ? '' : `<div class="rd-tabs eg-seg">${[['kanban', 'kanban', 'Kanban'], ['lista', 'list', 'Lista']].map(([v, i, l]) => `<button class="rd-tab ${E.view === v ? 'on' : ''}" onclick="EV.view('${v}')">${ic(i)}${l}</button>`).join('')}</div>`}
      <button class="rd-btn ghost" onclick="EV.recarregar()" title="Atualizar">${ic('refresh-cw')}<span class="rd-hide-m">Atualizar</span></button>
      ${leitura ? '' : ''}
    </div>`;
  }

  // ------------------------------------------------------------ funil
  // fases do kanban (agrupam os status; nomes curtos nas colunas)
  const FASES = [
    ['Validação', [['validacao', 'Validação'], ['validacao_reprovada', 'Reprovada'], ['validacao_aprovada', 'Aprovada · OS']]],
    ['Projeto', [['elaborar_projeto', 'Elaborar projeto']]],
    ['Concessionária', [['projeto_enviado', 'Projeto enviado'], ['projeto_reprovado', 'Reprovado'], ['projeto_reenviado', 'Reenviado'], ['projeto_aprovado', 'Aprovado · obra']]],
    ['Vistoria', [['solicitacao_vistoria', 'Solicitar vistoria'], ['vistoria_solicitada', 'Vistoria solicitada']]],
    ['Fim', [['projeto_concluido', 'Concluído']]],
  ];
  const CONCLUIDOS_MAX = 5;
  function chipsFunil() {
    const todos = filtrados(true);
    const chip = (k, icone, rotulo, n) => `<button class="eg-fchip ${E[k] ? 'on' : ''} ${k}" onclick="EV.filtro('${k}')">${ic(icone)}${rotulo}<span class="n">${n}</span></button>`;
    return chip('soAtraso', 'alarm-clock', 'Fora do prazo', todos.filter(atrasado).length)
      + chip('soComp', 'zap', 'Compensação pendente', todos.filter((p) => p.compensacao && p.compensacao.status !== 'feita').length)
      + (central() ? chip('soAlerta', 'triangle-alert', 'Mudou após envio', todos.filter((p) => p.alerta).length) : '');
  }
  function telaFunil() {
    const base = filtrados();
    const leitura = E.ctx === 'com';
    const topo = leitura ? `<div class="rd-note">${ic('eye')}<span>Acompanhamento dos projetos da sua franquia na engenharia. Quem muda o status é a engenharia; aqui você vê o andamento, responde pendências e comenta.</span></div>` : '';
    if (!(E.projetos || []).length) {
      return `${topo}${barra()}<div class="rd-card rd-empty"><div class="ic">${ic('ruler')}</div><b>Nenhum projeto ainda</b>${leitura ? 'Os projetos aparecem aqui quando o gestor envia uma venda à engenharia pela ficha do cliente (aba Engenharia).' : 'Os projetos chegam quando uma franquia envia uma venda à engenharia.'}</div>`;
    }
    if (E.view === 'lista') return topo + barra(false, chipsFunil()) + lista(base);
    return `${topo}${barra(false, chipsFunil())}<div class="eg-kb" id="eg-kb"><div class="eg-kfs">${FASES.map(([fase, cols]) => {
      const tot = base.filter((p) => cols.some(([id]) => id === p.status)).length;
      return `<div class="eg-kf"><div class="eg-kfh"><span>${esc(fase)}</span><i></i><b>${tot}</b></div><div class="eg-kcols">${cols.map(([id, nome]) => {
        const s = ST[id];
        const its = base.filter((p) => p.status === id).sort((a, b) => new Date(a.status_desde) - new Date(b.status_desde));
        const trilho = !its.length && !E.trilhoAberto[id];
        const vis = id === 'projeto_concluido' ? its.slice().reverse().slice(0, E.concTodos ? its.length : CONCLUIDOS_MAX) : its;
        return `<div class="eg-kc ${trilho ? 'rail' : ''}" style="--c:${COR[s.tone]}" ${trilho ? `onclick="EV.trilho('${id}')" title="${esc(s.n)} · nenhum projeto"` : ''}>
          <div class="eg-kch" title="${esc(s.n + ' · ' + s.d)}"><span class="dot"></span><b>${esc(nome)}</b>${s.sla ? `<small>${s.sla}d</small>` : ''}<span class="cnt">${its.length}</span></div>
          <div class="eg-kcb">${vis.map(card).join('')}${its.length > vis.length ? `<button class="eg-kmais" onclick="EV.concTodos()">Ver todos os ${its.length} concluídos</button>` : ''}</div></div>`;
      }).join('')}</div></div>`;
    }).join('')}</div></div>`;
  }

  // o quadro vai até o fim da tela e a rolagem fica nas colunas
  function ajustarKanban() {
    const kb = document.getElementById('eg-kb');
    if (!kb) return;
    if (window.innerWidth <= 760) { kb.style.height = ''; return; }
    const topo = kb.getBoundingClientRect().top + window.scrollY;
    let h = Math.max(340, window.innerHeight - topo - 18);
    kb.style.height = h + 'px';
    const sobra = document.documentElement.scrollHeight - window.innerHeight;
    if (sobra > 0 && h - sobra >= 340) kb.style.height = (h - sobra) + 'px';
  }
  window.addEventListener('resize', () => ajustarKanban());

  function card(p) {
    const s = ST[p.status];
    const ultimoMotivo = (s.tone === 'bad' && p._motivo) ? `<div class="eg-kmot">${esc(p._motivo)}</div>` : '';
    const d = dias(p.status_desde);
    const late = atrasado(p);
    const pct = s.sla ? Math.min(100, (d / s.sla) * 100) : 0;
    const cor = late ? 'var(--v2-red)' : pct >= 70 ? 'var(--v2-orange)' : 'var(--v2-green)';
    const tags = `${dimPill(p)}${docsPill(p)}${compPill(p)}`;
    const borda = late ? 'var(--v2-red)' : (p.alerta && central()) ? 'var(--v2-orange)' : 'transparent';
    return `<button class="eg-kcard" style="--edge:${borda}" onclick="EV.abrir('${p.id}')">
      <div class="top"><div class="nm">${esc(p.cliente_nome || 'Cliente')}${alertaPill(p)}</div><span class="eg-kav ${p.responsavel_nome ? '' : 'no'}" title="${esc(p.responsavel_nome || 'Sem responsável')}">${esc(p.responsavel_nome ? ini(p.responsavel_nome) : '—')}</span></div>
      <div class="sys"><b>${nf(p.kwp, 2)} kWp</b><i></i><span>${ic('store')}${esc(nomeFranquia(p))}</span><i></i>${pnum(p)}</div>
      ${kitCurto(p) ? `<div class="kit">${esc(kitCurto(p))}</div>` : ''}
      ${ultimoMotivo}
      ${tags ? `<div class="tags">${tags}</div>` : ''}
      ${s.sla && p.status !== 'projeto_concluido' ? `<div class="prazo ${late ? 'late' : ''}"><div class="tr"><i style="width:${pct}%;background:${cor}"></i></div><span>${ic(late ? 'alarm-clock' : 'clock')}${d}d de ${s.sla}d</span></div>` : ''}
    </button>`;
  }

  function lista(base) {
    const fst = E.fst;
    const rows = base.filter((p) => !fst || p.status === fst).sort((a, b) => (atrasado(b) - atrasado(a)) || (new Date(a.status_desde) - new Date(b.status_desde)));
    const chips = `<div class="rd-chips rd-mb"><button class="rd-chip ${!fst ? 'on' : ''}" onclick="EV.verStatus('')">Todos ${base.length}</button>${STATUS.map((s) => { const n = base.filter((p) => p.status === s.id).length; return `<button class="rd-chip ${fst === s.id ? 'on' : ''}" ${n ? '' : 'style="opacity:.55"'} onclick="EV.verStatus('${s.id}')">${esc(s.n)} ${n}</button>`; }).join('')}</div>`;
    return `${chips}<div class="rd-card" style="padding:6px 12px"><table class="rd-t cards"><thead><tr><th>Cliente</th><th>Franquia</th><th>Sistema</th><th>Status</th><th class="r">No status</th><th>Resp.</th></tr></thead><tbody>
      ${rows.map((p) => `<tr class="click" onclick="EV.abrir('${p.id}')">
        <td class="first"><div class="rd-name">${esc(p.cliente_nome || 'Cliente')} ${alertaPill(p)}</div><div class="rd-muted">${pnum(p)} · ${esc(p.cidade || '')}</div><div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:4px">${dimPill(p)}${docsPill(p)}${compPill(p)}</div></td>
        <td data-l="Franquia">${esc(nomeFranquia(p))}</td>
        <td data-l="Sistema"><b>${nf(p.kwp, 2)} kWp</b><div class="rd-muted">${esc(kitCurto(p).slice(0, 38))}</div></td>
        <td data-l="Status">${stPill(p)}</td>
        <td data-l="No status" class="r"><b style="color:${atrasado(p) ? 'var(--v2-red)' : 'inherit'}">${p.status === 'projeto_concluido' ? '—' : dias(p.status_desde) + ' dias'}</b>${atrasado(p) ? `<div class="rd-muted">prazo ${ST[p.status].sla}d</div>` : ''}</td>
        <td data-l="Resp.">${esc(p.responsavel_nome || '—')}</td></tr>`).join('') || '<tr><td colspan="6" class="rd-empty">Nenhum projeto neste status.</td></tr>'}
    </tbody></table></div>`;
  }

  // ------------------------------------------------------------ OS
  function telaOS() {
    const l = E.osLista || [];
    const byId = Object.fromEntries((E.projetos || []).map((p) => [p.id, p]));
    return `${barra(true)}<div class="rd-card" style="padding:6px 12px">${l.length ? `<table class="rd-t cards"><thead><tr><th>OS</th><th>Cliente</th><th>Franquia</th><th>Equipe</th><th>Status do projeto</th><th class="r">Emitida</th></tr></thead><tbody>
      ${l.filter((o) => byId[o.projeto_id]).map((o) => { const p = byId[o.projeto_id]; return `<tr class="click" onclick="EV.abrir('${p.id}','os')">
        <td class="first"><b>${esc(o.numero)}</b>${o.revisao > 1 ? ` <span class="rd-tag">rev. ${o.revisao}</span>` : ''}</td><td data-l="Cliente">${esc(p.cliente_nome || '')}</td><td data-l="Franquia">${esc(nomeFranquia(p))}</td>
        <td data-l="Equipe">${esc(o.equipe || '—')}</td><td data-l="Status">${stPill(p)}</td><td data-l="Emitida" class="r">${dataBR(o.created_at)}</td></tr>`; }).join('')}
      </tbody></table>` : `<div class="rd-empty"><div class="ic">${ic('clipboard-list')}</div><b>Nenhuma OS ainda</b>A OS sai automaticamente quando a validação é aprovada.</div>`}</div>`;
  }

  // ------------------------------------------------------------ catálogo técnico + vínculo dos kits
  function sugerirVinculo(kit, catalogo) {
    const cat = catalogo || E.catalogo || [];
    const nome = String(kit.name || '').toUpperCase();
    const m = nome.match(/(\d+)\s*MOD[^\d]*?(\d{3})\s*W/);
    const out = { modulo_id: null, modulo_qtd: null, inversor_id: null, inversor_qtd: null };
    if (!m) return out;
    out.modulo_qtd = Number(m[1]);
    const w = Number(m[2]);
    const mods = cat.filter((c) => c.tipo === 'modulo' && Math.round(num((c.ficha && c.ficha.potencia) || c.potencia_wp)) === w);
    if (mods.length === 1) out.modulo_id = mods[0].id;
    const parte = nome.split('+').slice(1).join('+');
    const micro = /MICRO/.test(parte);
    const kw = (parte.match(/(\d+(?:[.,]\d+)?)\s*K/) || [])[1];
    const kwN = kw ? Number(kw.replace(',', '.')) : NaN;
    const marcas = ['SOFAR', 'SOLIS', 'GROWATT', 'CHINT', 'HOYMILES', 'GOODWE', 'DEYE', 'FRONIUS', 'SAJ', 'WEG', 'APSYSTEMS'];
    const marca = marcas.find((x) => parte.includes(x));
    const invs = cat.filter((c) => c.tipo === 'inversor' && ehMicro(c) === micro
      && (!marca || `${c.marca || ''} ${c.nome}`.toUpperCase().includes(marca))
      && Number.isFinite(kwN) && Math.abs(num((c.ficha && c.ficha.potencia) || (c.potencia_wp)) / 1000 - kwN) < 0.06);
    if (invs.length === 1) {
      out.inversor_id = invs[0].id;
      const pm = num(invs[0].ficha && invs[0].ficha.modulos_por_micro);
      out.inversor_qtd = micro && pm > 0 ? Math.ceil(out.modulo_qtd / pm) : 1;
    }
    return out;
  }
  const kitLigado = (k) => !!(k.modulo_id && k.inversor_id && k.modulo_qtd && k.inversor_qtd);
  const fichaOk = (c) => !camposFaltando(c, c.tipo === 'modulo' ? 'modulo' : (ehMicro(c) ? 'micro' : 'inversor')).length;
  const nomeEq = (id) => { const c = (E.catalogo || []).find((x) => x.id === id); return c ? c.nome : '—'; };

  function telaCatalogo() {
    const cat = E.catalogo || [];
    const kits = (E.kits || []).filter((k) => k.ativo !== false);
    const pend = cat.filter((c) => c.ativo !== false && !fichaOk(c)).length;
    const naoConf = cat.filter((c) => c.ativo !== false && fichaOk(c) && !c.ficha_conferida).length;
    const semVinc = kits.filter((k) => !kitLigado(k)).length;
    const linhaEq = (c) => {
      const tipo = c.tipo === 'modulo' ? 'Módulo' : (ehMicro(c) ? 'Micro' : 'Inversor');
      const f = c.ficha || {};
      const resumo = c.tipo === 'modulo'
        ? `Voc ${nf(f.voc, 1)} V · Vmp ${nf(f.vmp, 1)} V · Isc ${nf(f.isc, 2)} A · ${nf(f.coef_voc, 2)} %/°C`
        : ehMicro(c) ? `${nf(f.modulos_por_micro)} módulos/micro · ${nf(f.potencia)} W · ${nf(f.v_max_entrada)} V máx`
          : `${nf(f.potencia)} W · ${nf(f.mppts)} MPPT (${esc(f.entradas || '—')}) · ${nf(f.v_max)} V · ${nf(f.i_max_mppt, 1)} A/MPPT`;
      const usados = kits.filter((k) => k.modulo_id === c.id || k.inversor_id === c.id).length;
      return `<tr class="click" onclick="EV.fichaModal('${c.id}')"><td class="first"><span class="rd-tag">${tipo}</span></td>
        <td data-l="Equipamento"><div class="rd-name">${esc(c.nome)}</div><div class="rd-muted">${esc(c.marca || '')}</div></td>
        <td data-l="Ficha técnica" class="rd-muted">${fichaOk(c) ? resumo : '<span style="color:var(--v2-red)">Ficha incompleta</span>'}</td>
        <td data-l="Kits" class="r">${usados}</td>
        <td data-l="Situação">${!fichaOk(c) ? pill('Pendente', 'bad') : c.ficha_conferida ? pill('Conferida', 'ok') : pill('A conferir', 'at')}</td></tr>`;
    };
    return `<div class="rd-bar"><span class="rd-grow"></span>
        <button class="rd-btn ghost" onclick="EV.recarregar()">${ic('refresh-cw')}<span class="rd-hide-m">Atualizar</span></button>
        <button class="rd-btn pri" onclick="EV.fichaModal()">${ic('plus')}Equipamento</button></div>
      ${pend || naoConf || semVinc ? `<div class="rd-note" style="background:var(--v2-orange-50);color:var(--v2-orange-text)">${ic('triangle-alert')}<span>${[pend ? `${pend} equipamento(s) com ficha incompleta` : '', naoConf ? `${naoConf} ficha(s) a conferir` : '', semVinc ? `${semVinc} kit(s) sem vínculo técnico` : ''].filter(Boolean).join(' · ')}. Projeto com esses equipamentos cai em "Precisa revisão".</span></div>` : ''}
      <div class="rd-card rd-mb"><h3>${ic('cpu')}Equipamentos</h3><p class="rd-sub">Um catálogo só: o Comercial usa o preço, a engenharia usa a ficha técnica</p>
        ${cat.length ? `<table class="rd-t cards"><thead><tr><th>Tipo</th><th>Equipamento</th><th>Ficha técnica</th><th class="r">Kits</th><th>Situação</th></tr></thead><tbody>${cat.filter((c) => c.ativo !== false).map(linhaEq).join('')}</tbody></table>`
          : `<div class="rd-empty"><div class="ic">${ic('cpu')}</div><b>Nenhum equipamento</b>Cadastre os módulos e inversores dos kits com a ficha técnica.</div>`}
      </div>
      <div class="rd-card"><div class="rd-ch"><div><h3>${ic('package')}Vínculo dos kits</h3><p class="rd-sub">Quais equipamentos cada kit tem. É daqui que sai o dimensionamento automático.</p></div>
        ${semVinc ? `<button class="rd-btn sm" onclick="EV.vincularTodos()">${ic('wand-sparkles')}Ligar pelo nome do kit</button>` : ''}</div>
        <div class="rd-bar" style="margin:4px 0 10px">
          <label class="rd-sel" style="flex:1;min-width:200px">${ic('search')}<input id="eg-kit-busca" placeholder="Buscar kit, módulo ou inversor" value="${esc(E.kitBusca)}" oninput="EV.kitBuscar(this.value)" style="width:100%"></label>
          <div class="rd-chips">${[['', 'Todos'], ['sem', 'Sem vínculo'], ['inv', 'Inversor'], ['micro', 'Micro']].map(([v, l]) => `<button class="rd-chip ${E.kitFiltro === v ? 'on' : ''}" onclick="EV.kitFiltrar('${v}')">${l}</button>`).join('')}</div>
        </div>
        <div id="eg-kits">${kitsLista()}</div></div>`;
  }

  // Lista do vínculo dos kits: filtrada pela busca e mostrada aos poucos.
  const KITS_PASSO = 8;
  function kitsLista() {
    const q = String(E.kitBusca || '').trim().toLowerCase();
    const todos = (E.kits || []).filter((k) => k.ativo !== false);
    const lista = todos.filter((k) => {
      if (E.kitFiltro === 'sem' && kitLigado(k)) return false;
      const inv = (E.catalogo || []).find((c) => c.id === k.inversor_id);
      if (E.kitFiltro === 'micro' && !(inv ? ehMicro(inv) : /MICRO/i.test(k.name))) return false;
      if (E.kitFiltro === 'inv' && (inv ? ehMicro(inv) : /MICRO/i.test(k.name))) return false;
      return !q || `${k.name} ${nomeEq(k.modulo_id)} ${nomeEq(k.inversor_id)}`.toLowerCase().includes(q);
    });
    const vis = lista.slice(0, E.kitLimite);
    if (!lista.length) return `<div class="rd-empty">Nenhum kit encontrado.</div>`;
    return `<table class="rd-t cards"><thead><tr><th>Kit</th><th>Módulos</th><th>Inversor</th><th>Vínculo</th></tr></thead><tbody>
        ${vis.map((k) => `<tr class="click" onclick="EV.kitModal('${k.id}')"><td class="first"><div class="rd-name" style="font-size:13px">${esc(k.name)}</div></td>
          <td data-l="Módulos">${k.modulo_id ? `${k.modulo_qtd || '?'}× ${esc(nomeEq(k.modulo_id))}` : '—'}</td>
          <td data-l="Inversor">${k.inversor_id ? `${k.inversor_qtd || '?'}× ${esc(nomeEq(k.inversor_id))}` : '—'}</td>
          <td data-l="Vínculo">${kitLigado(k) ? pill('Ligado', 'ok') : pill('Sem vínculo', 'bad')}</td></tr>`).join('')}
        </tbody></table>
        <div class="eg-mais"><span class="rd-muted">Mostrando ${vis.length} de ${lista.length}</span>
          ${lista.length > vis.length ? `<button class="rd-btn sm" onclick="EV.kitMais()">${ic('chevron-down')}Mostrar mais ${Math.min(KITS_PASSO, lista.length - vis.length)}</button>` : ''}
          ${E.kitLimite > KITS_PASSO ? `<button class="rd-btn sm ghost" onclick="EV.kitMenos()">${ic('chevron-up')}Recolher</button>` : ''}</div>`;
  }
  function pintarKits() { const box = document.getElementById('eg-kits'); if (box) { box.innerHTML = kitsLista(); icons(); } }

  // ------------------------------------------------------------ calculadora
  // Formato bancada: entradas à esquerda (ficha editável na própria tabela),
  // diagrama do arranjo em cima e resumo / verificações / geração embaixo.
  // Resultado só ao clicar em Validar. Mesmo calcularSistema do automático.
  function calcPadrao() {
    const hspF = num(state.franquiaHsp);
    return {
      modId: '', invId: '', nmod: 9, ninv: 1, hsp: hspF > 0 ? hspF : 5.4, perdas: PERDAS, tmin: TEMP_MIN, tmax: TEMP_CELULA,
      lig: 'mono_220', dist: 15, bitola: CABO_CC, distCA: 10, tamb: TEMP_AMB, circ: 1, metodo: 'B1', manual: { mod: {}, inv: {} },
      projId: null, res: null, sujo: false, arranjo: null, editArranjo: false,
    };
  }
  const C = () => (E.calc || (E.calc = calcPadrao()));
  const catTipo = (tipo, micro) => (E.catalogo || []).filter((c) => c.ativo !== false && c.tipo === tipo && (micro === undefined || ehMicro(c) === micro));
  const calcBase = (k) => (E.catalogo || []).find((x) => x.id === (k === 'mod' ? C().modId : C().invId)) || null;
  const editado = (k) => { const b = calcBase(k); const m = C().manual[k]; return !!b && Object.keys(m).some((f) => String(m[f]).replace(',', '.') !== String((b.ficha || {})[f] ?? '')); };
  function calcEquip(k) {
    const c = C();
    const base = calcBase(k);
    if (!base) return null;
    const ficha = { ...(base.ficha || {}) };
    Object.entries(c.manual[k]).forEach(([f, v]) => { ficha[f] = (f === 'entradas' || f === 'rede' || vazio(v)) ? v : num(v); });
    return { ...base, ficha, qtd: Math.round(num(k === 'mod' ? c.nmod : c.ninv)) || 0, ficha_conferida: editado(k) ? false : base.ficha_conferida };
  }
  function calcGarantirPadrao() {
    const c = C();
    if (!c.modId) { const m = catTipo('modulo').find((x) => fichaOk(x)) || catTipo('modulo')[0]; if (m) c.modId = m.id; }
    if (!c.invId) { const i = catTipo('inversor', false).find((x) => fichaOk(x)) || catTipo('inversor')[0]; if (i) c.invId = i.id; }
  }
  function calcStatusTag(k) {
    const eq = calcEquip(k);
    if (!eq) return '';
    if (editado(k)) return `${pill('editado', 'info')}<button class="eg-link" onclick="EV.cRestaurar('${k}')">restaurar ficha</button>`;
    if (camposFaltando(eq, k === 'mod' ? 'modulo' : (ehMicro(eq) ? 'micro' : 'inversor')).length) return pill('ficha incompleta', 'bad');
    return eq.ficha_conferida ? pill('conferida', 'ok') : pill('a conferir', 'at');
  }
  function fichaGrid(k) {
    const base = calcBase(k);
    if (!base) return '<div class="rd-muted">Cadastre equipamentos no catálogo técnico.</div>';
    const tipo = k === 'mod' ? 'modulo' : (ehMicro(base) ? 'micro' : 'inversor');
    const eq = calcEquip(k), f = eq.ficha || {}, orig = base.ficha || {};
    const cel = FICHA[tipo].map(([campo, longo, u]) => {
      const mudou = C().manual[k][campo] !== undefined && String(C().manual[k][campo]).replace(',', '.') !== String(orig[campo] ?? '');
      return `<label class="eg-fc ${mudou ? 'mod' : ''}" title="${esc(longo)}"><span>${esc(CURTO[campo] || longo)}</span><input class="eg-fv" value="${esc(String(f[campo] ?? '').replace('.', ','))}" placeholder="—" oninput="EV.cFicha('${k}','${campo}',this)"><em>${esc(u && !u.startsWith('ex') ? u : '')}</em></label>`;
    }).join('');
    const rede = tipo === 'modulo' ? '' : `<label class="eg-fc full"><span>Rede de saída</span><select class="eg-fv" onchange="EV.cFicha('${k}','rede',this)">${REDES_INV.map(([v, l]) => `<option value="${v}" ${f.rede === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`;
    return `<div class="eg-fgrid">${cel}${rede}</div>`;
  }

  function telaCalc() {
    calcGarantirPadrao();
    const c = C();
    const projs = (E.projetos || []).filter((p) => !['projeto_concluido', 'cancelado'].includes(p.status));
    const proj = c.projId && (E.projetos || []).find((p) => p.id === c.projId);
    const opt = (lista, sel) => lista.map((x) => `<option value="${x.id}" ${x.id === sel ? 'selected' : ''}>${esc(x.nome)}${x.marca && x.tipo === 'modulo' ? ' · ' + esc(x.marca) : ''}</option>`).join('');
    const inp = (id, v, w) => `<input inputmode="decimal" value="${esc(String(v ?? '').replace('.', ','))}" oninput="EV.cSet('${id}',this.value)" ${w ? `style="width:${w}"` : ''}>`;
    return `<div class="rd-bar">
        ${proj ? `<span class="rd-sel">${ic('folder-open')}<b style="font-weight:700">${pnum(proj)} · ${esc(proj.cliente_nome || '')}</b><button class="rd-btn sm ghost" onclick="EV.cProjeto('')" title="Sair do projeto">${ic('x')}</button></span>`
          : `<span class="rd-muted" style="font-weight:600">Simulação avulsa</span><button class="rd-btn" onclick="EV.cProjetoModal()" ${projs.length ? '' : 'disabled title="Nenhum projeto em andamento"'}>${ic('folder-open')}Abrir projeto</button>`}
        <span class="rd-grow"></span>
        <button class="rd-btn ghost" onclick="EV.cLimpar()">${ic('eraser')}Limpar</button>
      </div>
      <div class="eg-bench">
        <div class="eg-bin">
          <div class="eg-pn"><h4>${ic('grid-3x3')}Módulo<span id="eg-st-mod">${calcStatusTag('mod')}</span></h4>
            <div class="eg-eqsel"><select onchange="EV.cEquip('mod',this.value)">${opt(catTipo('modulo'), c.modId)}</select><input id="eg-c-nmod" class="eg-qtd" inputmode="numeric" title="Quantidade" value="${esc(c.nmod)}" oninput="EV.cSet('nmod',this.value)"></div>
            ${fichaGrid('mod')}</div>
          <div class="eg-pn"><h4>${ic('cpu')}Inversor / micro<span id="eg-st-inv">${calcStatusTag('inv')}</span></h4>
            <div class="eg-eqsel"><select onchange="EV.cEquip('inv',this.value)"><optgroup label="Inversores">${opt(catTipo('inversor', false), c.invId)}</optgroup><optgroup label="Microinversores">${opt(catTipo('inversor', true), c.invId)}</optgroup></select><input id="eg-c-ninv" class="eg-qtd" inputmode="numeric" title="Quantidade" value="${esc(c.ninv)}" oninput="EV.cSet('ninv',this.value)"></div>
            ${fichaGrid('inv')}</div>
          <div class="eg-pn"><h4>${ic('map-pin')}Local e cabos</h4>
            <div class="eg-lc4"><label>HSP${inp('hsp', c.hsp)}</label><label>Perdas %${inp('perdas', c.perdas)}</label><label>T. mín. °C${inp('tmin', c.tmin)}</label><label>T. célula °C${inp('tmax', c.tmax)}</label></div>
            <div class="eg-lc2"><label>Ligação<select onchange="EV.cSet('lig',this.value)">${LIGACOES.map(([v, l]) => `<option value="${v}" ${c.lig === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
              <label>Distância CC (m) · bitola<span class="eg-dist">${inp('dist', c.dist)}<select onchange="EV.cSet('bitola',this.value)">${[4, 6, 10].map((b) => `<option value="${b}" ${num(c.bitola) === b ? 'selected' : ''}>${b} mm²</option>`).join('')}</select></span></label></div>
            <div class="eg-lc4" style="margin-top:6px"><label title="Do inversor até o quadro">Dist. CA (m)${inp('distCA', c.distCA)}</label><label title="Temperatura ambiente do cabo CA (FCT, Tabela 40)">T. amb. °C${inp('tamb', c.tamb)}</label><label title="Circuitos no mesmo eletroduto (FCA, Tabela 42)">Circuitos${inp('circ', c.circ)}</label><label title="Método de instalação (Tabela 33)">Método<select onchange="EV.cSet('metodo',this.value)">${METODOS.map(([v, l]) => `<option value="${v}" title="${l}" ${c.metodo === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label></div>
          </div>
          <button class="rd-btn blue eg-validar" onclick="EV.cValidar()">${ic('shield-check')}Validar</button>
          <div class="eg-sujo" id="eg-c-sujo" ${c.sujo ? '' : 'hidden'}>${ic('refresh-cw')}Valores mudaram: valide de novo</div>
        </div>
        <div class="eg-bout" id="eg-calc-res">${calcResultadoHTML()}</div>
      </div>`;
  }

  const usoLimite = (k) => (Number.isFinite(k.n) && Number.isFinite(k.lim) && k.lim > 0 && k.n > 0 ? (k.sentido === 'min' ? (k.lim / k.n) * 100 : (k.n / k.lim) * 100) : null);
  function calcResultadoHTML() {
    const c = C();
    const r = c.res;
    if (!r) return `<div class="rd-card rd-empty"><div class="ic">${ic('calculator')}</div><b>Escolha os equipamentos e clique em Validar</b>O resultado aparece aqui: diagrama do arranjo, verificações, geração e proteções.</div>`;
    if (!r.checks || !r.checks.length) return `<div class="rd-note" style="background:rgba(209,67,67,.1);color:var(--v2-red)">${ic('circle-alert')}<span><b>Não deu para calcular</b><br><span style="color:var(--v2-ink)">${esc(r.motivo || '')}</span></span></div>
      <div class="rd-card"><p class="rd-sub" style="margin:0">Ajuste os equipamentos ou as quantidades e valide de novo.${r.tipo === 'string' ? ' Se quiser, monte o arranjo na mão.' : ''}</p>
      ${r.tipo === 'string' && r.inputs ? `<div class="eg-calc-acts">${c.arranjo ? `<button class="rd-btn sm ghost" onclick="EV.cArranjoAuto()">${ic('rotate-ccw')}Voltar ao automático</button>` : ''}<button class="rd-btn sm" onclick="EV.cArranjoNovo()">${ic('settings-2')}Montar arranjo na mão</button></div>${c.editArranjo ? arranjoEditor(r) : ''}` : ''}</div>`;
    const falhou = r.checks.filter((k) => !k.ok);
    const proj = c.projId && (E.projetos || []).find((p) => p.id === c.projId);
    const anual = r.geracaoMedia * 12;
    const ov = (r.kwp * 1000 / r.potCA - 1) * 100;
    const el = r.modEl || {};
    const kpi = (l, v, hl) => `<div class="${hl ? 'hl' : ''}"><small>${l}</small><b>${v}</b></div>`;
    const MES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const mx = Math.max(...r.monthlyGeneration);
    const pr = r.protecoes || {};
    const q = r.quedaInfo;
    const maxVoc = r.tipo === 'micro' ? r.vocCorrected : (r.maxSerie || 0) * r.vocCorrected;
    return `<div class="rd-note eg-stat" style="${falhou.length ? 'background:rgba(209,67,67,.1);color:var(--v2-red)' : 'background:rgba(31,169,113,.12);color:#12704A'}">${ic(falhou.length ? 'circle-alert' : 'circle-check')}<span><b>${falhou.length ? 'Não passou' : 'Dimensionamento válido'}</b> · <span style="color:var(--v2-ink)">${falhou.length ? esc(falhou.map((k) => k.nome).join(', ')) : 'Todas as verificações dentro do limite' + (r.arranjo_personalizado ? ' (arranjo personalizado)' : '')}</span></span>
        ${proj ? `<button class="rd-btn sm pri" id="eg-c-salvar" style="margin-left:auto" ${falhou.length || c.sujo ? 'disabled title="Valide um dimensionamento que passe em tudo"' : ''} onclick="EV.cSalvar()">${ic('save')}Salvar no projeto ${pnum(proj)}</button>` : ''}</div>
      <div class="eg-pn"><h4>${ic('git-branch')}Arranjo${r.arranjo_personalizado ? ' <span class="rd-tag man">personalizado</span>' : ''}${r.tipo === 'string' && !c.editArranjo ? `<button class="eg-link" onclick="EV.cArranjoEditar(true)">${ic('settings-2')}Personalizar</button>` : ''}</h4>
        ${c.editArranjo ? arranjoEditor(r) : (r.tipo === 'micro' ? diagramaMicro(r) : diagramaString(r))}
        <div class="eg-leg"><span><i style="background:var(--v2-orange)"></i>CC · cabo ${String(r.bitola || CABO_CC).replace('.', ',')} mm² solar</span><span><i style="background:var(--v2-blue)"></i>CA · cabo ${String(pr.cabo || '—').replace('.', ',')} mm²</span><span>Voc frio a ${nf(r.tmin)} °C · Vmp quente a ${nf(r.tmax)} °C de célula</span></div></div>
      <div class="eg-b3">
        <div>
          <div class="eg-pn"><h4>${ic('gauge')}Resumo</h4><div class="eg-kp">
            ${kpi('Potência CC', nf(r.kwp, 2) + ' kWp', true)}${kpi('Potência CA', nf(r.potCA / 1000, 2) + ' kW')}${kpi('CC/CA', nf(r.kwp * 1000 / r.potCA, 2))}
            ${kpi('Geração/mês', nf(r.geracaoMedia) + ' kWh')}${kpi('Geração/ano', nf(anual) + ' kWh')}${kpi('Produtividade', nf(anual / r.kwp) + ' kWh/kWp')}
            ${kpi('Overload', r.tipo === 'micro' ? '—' : nf(ov, 1) + ' %')}${kpi('Voc frio', nf(r.vocCorrected, 2) + ' V')}${kpi('Vmp quente', nf(r.vmpQuente, 2) + ' V')}</div></div>
          ${q ? `<div class="eg-pn"><h4>${ic('cable')}Cabos e queda de tensão CC</h4>
            <div class="eg-ln"><span>Comprimento (ida e volta)</span><b>${nf(q.dist * 2)} m</b></div><div class="eg-ln"><span>Bitola</span><b>${String(q.bitola).replace('.', ',')} mm² cobre</b></div>
            <div class="eg-ln"><span>Resistência</span><b>${nf(q.R, 3)} Ω</b></div><div class="eg-ln"><span>Corrente (Imp)</span><b>${nf(q.imp, 2)} A</b></div>
            <div class="eg-ln"><span>Queda</span><b>${nf(q.dv, 2)} V</b></div><div class="eg-ln"><span>Queda %</span><b style="color:${q.pct <= 1 ? '#12704A' : q.pct <= LIMITE_QUEDA ? 'var(--v2-orange-text)' : 'var(--v2-red)'}">${nf(q.pct, 2)} % · ${q.pct <= 1 ? 'ideal' : q.pct <= LIMITE_QUEDA ? 'atenção' : 'crítico'}</b></div></div>` : ''}
        </div>
        <div class="eg-pn"><h4>${ic('list-checks')}Verificações<span class="rd-muted" style="font-weight:600;font-size:11px">uso do limite</span></h4>
          ${r.checks.map((k) => { const u = usoLimite(k); const cor = !k.ok ? 'var(--v2-red)' : u > 90 ? 'var(--v2-orange)' : 'var(--v2-green)';
            return `<div class="eg-ck"><span class="ic ${k.ok ? 'ok' : 'bad'}">${ic(k.ok ? 'check' : 'x')}</span><div class="nm"><b>${esc(k.nome)}</b><small>${esc(k.calc)}</small></div>
              <div class="v" style="color:${k.ok ? '#12704A' : 'var(--v2-red)'}">${k.valor === 'ok' ? 'compatível' : k.valor === 'não' ? 'incompatível' : esc(k.valor)}${k.valor === 'ok' || k.valor === 'não' ? '' : `<small>${esc(k.limite)}</small>`}</div>
              <div class="fb">${u == null ? '' : `<div class="bar"><i style="width:${Math.min(u, 100)}%;background:${cor}"></i></div><small>${nf(u)}%</small>`}</div></div>`; }).join('')}</div>
        <div>
          <div class="eg-pn"><h4>${ic('sun')}Geração mensal (kWh)</h4>
            <div class="eg-gm">${r.monthlyGeneration.map((g, i) => `<i style="height:${(g / mx) * 100}%" title="${MES[i]}: ${nf(g)} kWh"></i>`).join('')}</div>
            <div class="eg-gmt">${r.monthlyGeneration.map((g, i) => `<span><small>${MES[i]}</small>${nf(g)}</span>`).join('')}</div></div>
          <div class="eg-pn"><h4>${ic('shield')}Proteções e cabos<span class="rd-muted" style="font-weight:600;font-size:11px">NBR 5410${r.inversores > 1 ? ' · por inversor' : ''}</span></h4>
            <div class="eg-ln"><span>Ib · corrente de projeto<small>${pr.iFicha ? 'corrente de saída da ficha' : nf(r.potCA / r.inversores) + ' W ÷ ' + (pr.carregados === 3 ? '√3 × ' : '') + pr.tensao + ' V'}</small></span><b>${nf(pr.ib, 1)} A</b></div>
            <div class="eg-ln"><span>In · disjuntor CA<small>1º padrão ≥ Ib${pr.disjMax ? ` · fabricante até ${nf(pr.disjMax)} A` : ''}</small></span><b>${pr.disjuntor} A ${pr.polos} C</b></div>
            <div class="eg-ln"><span>Iz · capacidade do cabo<small>${nf(pr.izTab, 1)} A × FCT ${nf(pr.fct, 2)} (${nf(pr.tamb)} °C) × FCA ${nf(pr.fca, 2)}</small></span><b>${nf(pr.iz, 1)} A</b></div>
            <div class="eg-ln"><span>Cabo CA<small>método ${pr.metodo} · ${pr.carregados} carregados · PE ${String(pr.pe).replace('.', ',')} mm²</small></span><b>${String(pr.cabo).replace('.', ',')} mm²</b></div>
            ${pr.queda ? `<div class="eg-ln"><span>Queda CA · ${nf(pr.queda.dist)} m<small>${pr.subiuPorQueda ? 'cabo aumentado pela queda' : 'limite ' + LIMITE_QUEDA_CA + ' % (NBR 5410)'}</small></span><b style="color:${pr.queda.pct <= LIMITE_QUEDA_CA ? '#12704A' : 'var(--v2-red)'}">${nf(pr.queda.pct, 2)} %</b></div>` : ''}
            <div class="eg-ln"><span>DPS classe II</span><b>CA${r.tipo === 'micro' ? '' : ` · CC ≥ ${nf(Math.ceil(maxVoc / 100) * 100)} V`}</b></div>
            ${r.tipo === 'micro' ? '' : `<div class="eg-ln"><span>Fusível de string</span><b>${(r.maxPar || 0) >= 3 ? 'necessário' : 'não precisa'}</b></div>`}</div>
        </div>
      </div>`;
  }

  // Diagrama: strings -> inversor (MPPTs) -> quadro CA -> rede
  function diagramaString(r) {
    const d = r.distribution || [];
    const el = r.modEl || {};
    const pr = r.protecoes || {};
    const inv = (r.equipamentos && r.equipamentos.inversor) || {};
    const fi = inv.ficha || {};
    const N = Math.max(1, d.length);
    const linhas = d.map((m, i) => {
      const strs = m.numStrings ? Array.from({ length: m.numStrings }, (_, j) => `<div class="s"><div class="mods">${'<i></i>'.repeat(m.modulesPerString)}</div>
        <div class="lb"><b>String ${i + 1}.${j + 1}</b> · ${m.modulesPerString} × ${nf(el.pmod)} W = ${nf(m.modulesPerString * el.pmod / 1000, 2)} kWp<br>
        Voc ${nf(m.modulesPerString * el.voc, 1)} V · <b>frio ${nf(m.modulesPerString * r.vocCorrected, 1)} V</b> · Vmp ${nf(m.modulesPerString * el.vmp, 1)} V · quente ${nf(m.modulesPerString * r.vmpQuente, 1)} V · Isc ${nf(el.isc, 2)} A · Imp ${nf(el.imp, 2)} A</div></div>`).join('') : '<div class="lb">sem string</div>';
      return `<div class="grp ${m.numStrings ? '' : 'vz'}" style="grid-row:${i + 1}">${strs}</div><div class="w cc ${m.numStrings ? '' : 'vz'}" style="grid-row:${i + 1}"></div>`;
    }).join('');
    const span = `grid-row:1 / span ${N}`;
    return `<div class="eg-dg">${linhas}
      <div class="box inv" style="${span}"><div><b>${esc(inv.nome || 'Inversor')}</b>${nf(num(fi.potencia) / 1000, 1)} kW · ${esc(fi.mppts || '?')} MPPT${r.inversores > 1 ? `<br><b class="x">× ${r.inversores} inversores (arranjo igual)</b>` : ''}</div>
        <div class="ports">${d.map((m, i) => `<span class="${m.numStrings ? '' : 'vz'}">MPPT ${i + 1}${m.numStrings > 1 ? ' · ' + m.numStrings + ' str' : ''}</span>`).join('')}</div>
        <div>Isc máx. ${nf(el.isc * (r.maxPar || 1), 1)} A · CA ${nf(pr.corrente, 1)} A</div></div>
      <div class="w ca" style="${span};grid-column:4"></div>
      <div class="box" style="${span};grid-column:5">${ic('shield')}<b>Quadro CA</b>Disjuntor ${pr.disjuntor} A ${pr.polos}<br>DPS CA classe II<br>Cabo ${String(pr.cabo).replace('.', ',')} mm²</div>
      <div class="w ca" style="${span};grid-column:6"></div>
      <div class="box" style="${span};grid-column:7">${ic('zap')}<b>Rede</b>${esc(LIG[C().lig] || '')}</div></div>`;
  }
  function diagramaMicro(r) {
    const el = r.modEl || {};
    const pr = r.protecoes || {};
    const inv = (r.equipamentos && r.equipamentos.inversor) || {};
    const fi = inv.ficha || {};
    const n = r.micro.qtd, por = r.micro.porMicro, nMod = (r.equipamentos && r.equipamentos.modulo && r.equipamentos.modulo.qtd) || 0;
    const linhas = Array.from({ length: n }, (_, i) => { const q = Math.max(0, Math.min(por, nMod - i * por));
      return `<div class="grp" style="grid-row:${i + 1}"><div class="s"><div class="mods">${'<i></i>'.repeat(q)}${'<i class="e"></i>'.repeat(por - q)}</div>
        <div class="lb"><b>${q} módulo(s)</b> · ${nf(q * el.pmod)} W CC · Voc frio ${nf(r.vocCorrected, 1)} V · Isc ${nf(el.isc, 2)} A</div></div></div>
        <div class="w cc" style="grid-row:${i + 1}"></div><div class="box mic" style="grid-row:${i + 1}"><b>Micro ${i + 1}</b>${nf(num(fi.potencia))} W · CC/CA ${nf(q * el.pmod / num(fi.potencia), 2)}</div>`; }).join('');
    const span = `grid-row:1 / span ${n}`;
    return `<div class="eg-dg">${linhas}<div class="w ca" style="${span};grid-column:4"></div>
      <div class="box" style="${span};grid-column:5">${ic('shield')}<b>Quadro CA</b>Disjuntor ${pr.disjuntor} A ${pr.polos}<br>DPS CA classe II<br>Cabo ${String(pr.cabo).replace('.', ',')} mm²</div>
      <div class="w ca" style="${span};grid-column:6"></div><div class="box" style="${span};grid-column:7">${ic('zap')}<b>Rede</b>${esc(LIG[C().lig] || '')}</div></div>`;
  }
  function arranjoEditor(r) {
    const c = C();
    const inv = calcEquip('inv');
    const n = Math.max(1, num(inv && inv.ficha && inv.ficha.mppts) || (r.distribution || []).length || 1);
    const atual = (c.arranjo || r.distribution || []);
    return `<div class="eg-arr-ed">${Array.from({ length: n }, (_, i) => { const m = atual[i] || { numStrings: 0, modulesPerString: 0 }; return `<div class="eg-arr-row"><b>MPPT ${i + 1}</b>
        <div class="rd-fld"><label>Strings</label><input id="eg-arr-s${i}" inputmode="numeric" value="${m.numStrings}"></div>
        <div class="rd-fld"><label>Módulos por string</label><input id="eg-arr-m${i}" inputmode="numeric" value="${m.modulesPerString}"></div></div>`; }).join('')}
      <div class="eg-calc-acts">${c.arranjo ? `<button class="rd-btn sm ghost" onclick="EV.cArranjoAuto()">${ic('rotate-ccw')}Automático</button>` : ''}<button class="rd-btn sm" onclick="EV.cArranjoEditar(false)">Cancelar</button><button class="rd-btn sm pri" onclick="EV.cArranjoAplicar(${n})">${ic('check')}Aplicar e validar</button></div></div>`;
  }

  function calcMarcarSujo() {
    const c = C();
    if (!c.res) return;
    c.sujo = true;
    const el = document.getElementById('eg-c-sujo');
    if (el) el.hidden = false;
    const b = document.getElementById('eg-c-salvar');
    if (b) b.disabled = true;
  }
  function calcValidar() {
    const c = C();
    const mod = calcEquip('mod'), inv = calcEquip('inv');
    if (!mod || !inv) { toast('Escolha o módulo e o inversor.'); return; }
    c.res = calcularSistema({ mod, inv, hsp: c.hsp, perdas: c.perdas, tmin: c.tmin, tmax: c.tmax, lig: c.lig, dist: c.dist, bitola: c.bitola, arranjo: c.arranjo, ca: { dist: c.distCA, tamb: c.tamb, circ: c.circ, metodo: c.metodo } });
    c.sujo = false;
    c.editArranjo = false;
    pintar();
  }
  // Abre um projeto na calculadora (equipamentos, HSP, ligação e distância do envio).
  function calcAbrirProjeto(id) {
    const p = (E.projetos || []).find((x) => x.id === id);
    E.calc = calcPadrao();
    const c = E.calc;
    if (p) {
      const sn = p.snapshot || {}, inst = sn.instalacao || {};
      const eqs = (p.dim && p.dim.equipamentos) || {};
      const mod = eqs.modulo || sn.modulo, inv = eqs.inversor || sn.inversor;
      c.projId = p.id;
      if (mod) { c.modId = mod.id; c.nmod = mod.qtd || c.nmod; }
      if (inv) { c.invId = inv.id; c.ninv = inv.qtd || c.ninv; }
      c.hsp = hspDe(p);
      if (inst.tipo_ligacao) c.lig = inst.tipo_ligacao;
      c.dist = num(inst.distancia_m) > 0 ? num(inst.distancia_m) : '';
      if (p.dim && p.dim.arranjo_personalizado && p.dim.distribution) c.arranjo = p.dim.distribution;
    }
    calcGarantirPadrao();
  }
  async function calcSalvar() {
    const c = C();
    const r = c.res;
    if (!r || !c.projId || c.sujo || r.checks.some((k) => !k.ok)) return;
    const d = { ...r, manual: true, status: 'ok', motivo: null };
    await ocupado('eg-c-salvar', async () => {
      try {
        await rpc('eng_salvar_dim', { p_id: c.projId, p_dim: d, p_status: 'ok', p_motivo: null });
        toast('Dimensionamento salvo no projeto');
        const id = c.projId;
        await recarregarProjeto(id);
        abrir(id, 'dim');
      } catch (e) { toast(e.message); }
    });
  }

  // Escolher projeto para abrir na calculadora: busca + poucos resultados.
  const PROJ_MAX = 8;
  function calcProjetoModal() {
    modal(`<h3>Abrir projeto na calculadora</h3><p class="rd-sub">Traz os equipamentos, o HSP, a ligação e a distância do projeto</p>
      <label class="rd-sel" style="width:100%;margin-top:6px">${ic('search')}<input id="eg-pj-busca" placeholder="Cliente, número do projeto ou cidade" oninput="EV.cProjetoBuscar(this.value)" style="width:100%"></label>
      <div id="eg-pj-lista" style="margin-top:10px">${calcProjetoLista('')}</div>
      <div class="rd-mfoot"><button class="rd-btn" onclick="EV.fecharModal()">Fechar</button></div>`);
    setTimeout(() => { const i = document.getElementById('eg-pj-busca'); if (i) i.focus(); }, 30);
  }
  function calcProjetoLista(q) {
    const t = String(q || '').trim().toLowerCase();
    const todos = (E.projetos || []).filter((p) => !['projeto_concluido', 'cancelado'].includes(p.status))
      .filter((p) => !t || `${p.cliente_nome || ''} ${pnum(p)} ${p.cidade || ''} ${nomeFranquia(p)}`.toLowerCase().includes(t))
      .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at));
    if (!todos.length) return '<div class="rd-empty">Nenhum projeto encontrado.</div>';
    return todos.slice(0, PROJ_MAX).map((p) => `<button class="eg-pj" onclick="EV.cProjeto('${p.id}');EV.fecharModal()">
        <div style="flex:1;min-width:0"><b>${esc(p.cliente_nome || 'Cliente')}</b><div class="rd-muted">${pnum(p)} · ${esc(nomeFranquia(p))} · ${nf(p.kwp, 2)} kWp</div></div>${stPill(p)}</button>`).join('')
      + (todos.length > PROJ_MAX ? `<p class="rd-tip">${ic('info')}Mostrando os ${PROJ_MAX} mais recentes de ${todos.length}. Busque pelo nome para achar os outros.</p>` : '');
  }

  // ------------------------------------------------------------ modal genérico
  function modal(html, largo) {
    fecharModal();
    const s = document.createElement('div');
    s.className = 'rd-scrim';
    s.id = 'eg-scrim';
    s.innerHTML = `<div class="rd-modal rd eg" role="dialog" aria-modal="true" ${largo ? 'style="max-width:760px"' : ''}>${html}</div>`;
    s.addEventListener('mousedown', (e) => { if (e.target === s) fecharModal(); });
    document.body.appendChild(s);
    icons();
  }
  function fecharModal() { const s = document.getElementById('eg-scrim'); if (s) s.remove(); }
  const val = (id) => { const el = document.getElementById(id); return el ? String(el.value).trim() : ''; };
  const erro = (m) => { const el = document.getElementById('eg-err'); if (el) el.textContent = m; };
  async function ocupado(btn, fn) {
    const b = typeof btn === 'string' ? document.getElementById(btn) : btn;
    const h = b && b.innerHTML;
    if (b) { b.disabled = true; b.innerHTML = ic('loader-2') + 'Aguarde...'; icons(); }
    try { return await fn(); } finally { if (b && document.body.contains(b)) { b.disabled = false; b.innerHTML = h; icons(); } }
  }

  function fichaModal(id) {
    const c = id ? (E.catalogo || []).find((x) => x.id === id) : null;
    const f = (c && c.ficha) || {};
    const tipo0 = c ? (c.tipo === 'modulo' ? 'modulo' : (ehMicro(c) ? 'micro' : 'inversor')) : 'modulo';
    const campos = (tipo) => FICHA[tipo].map(([k, l, u]) => `<div class="rd-fld"><label>${esc(l)}${u ? ` <span class="rd-muted">(${esc(u)})</span>` : ''}${OPCIONAIS.includes(k) ? ' <span class="rd-muted">opcional</span>' : ''}</label><input id="eg-f-${k}" value="${esc(f[k] ?? '')}" inputmode="${k === 'entradas' ? 'text' : 'decimal'}"></div>`).join('');
    const rede = `<div class="rd-fld"><label>Rede de saída</label><select id="eg-f-rede">${REDES_INV.map(([v, l]) => `<option value="${v}" ${f.rede === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>`;
    modal(`<h3>${c ? esc(c.nome) : 'Novo equipamento'}</h3><p class="rd-sub">Dados do datasheet. ${c && c.ficha_atualizada_por ? `Última edição: ${esc(c.ficha_atualizada_por)} em ${dataBR(c.ficha_atualizada_em)}.` : ''}</p>
      <div class="rd-fgrid">
        ${c ? '' : `<div class="rd-fld"><label>Tipo</label><select id="eg-f-tipo" onchange="EV.fichaTipo(this.value)"><option value="modulo">Módulo</option><option value="inversor">Inversor</option><option value="micro">Microinversor</option></select></div>
          <div class="rd-fld"><label>Marca</label><input id="eg-f-marca" placeholder="Ex.: Ronma"></div>
          <div class="rd-fld full"><label>Modelo</label><input id="eg-f-nome" placeholder="Ex.: RM-182R/132TB 620W"></div>`}
        <div class="full" id="eg-f-campos" style="display:contents" data-tipo="${tipo0}">${campos(tipo0)}${tipo0 === 'modulo' ? '' : rede}</div>
        <label class="rd-check full"><input type="checkbox" id="eg-f-conf" ${c && c.ficha_conferida ? 'checked' : ''}>Conferi com o datasheet</label>
      </div>
      <div class="rd-err" id="eg-err"></div>
      <div class="rd-mfoot"><button class="rd-btn" onclick="EV.fecharModal()">Cancelar</button><button class="rd-btn pri" id="eg-f-salvar" onclick="EV.salvarFicha(${c ? `'${c.id}'` : 'null'})">${ic('check')}Salvar</button></div>`);
    E._campos = campos; E._rede = rede;
  }
  function fichaTipo(t) {
    const box = document.getElementById('eg-f-campos');
    if (!box) return;
    box.dataset.tipo = t;
    box.innerHTML = E._campos(t) + (t === 'modulo' ? '' : E._rede);
  }
  async function salvarFicha(id) {
    const box = document.getElementById('eg-f-campos');
    const tipo = box ? box.dataset.tipo : 'modulo';
    const ficha = {};
    FICHA[tipo].forEach(([k]) => { const v = val('eg-f-' + k); if (v !== '') ficha[k] = k === 'entradas' ? v.replace(/\s/g, '') : num(v); });
    if (tipo !== 'modulo') ficha.rede = val('eg-f-rede');
    if (tipo === 'micro') ficha.micro = true;
    const ruins = FICHA[tipo].filter(([k]) => k !== 'entradas' && ficha[k] !== undefined && !Number.isFinite(ficha[k])).map(([, l]) => l);
    if (ruins.length) { erro('Número inválido em: ' + ruins.join(', ')); return; }
    if (ficha.coef_voc > 0) ficha.coef_voc = -ficha.coef_voc;
    const conf = !!(document.getElementById('eg-f-conf') || {}).checked;
    await ocupado('eg-f-salvar', async () => {
      try {
        if (id) await rpc('eng_salvar_ficha', { p_id: id, p_ficha: ficha, p_conferida: conf });
        else {
          if (val('eg-f-nome').length < 2) { erro('Informe o modelo.'); return; }
          const novo = await rpc('eng_criar_equipamento', { p_tipo: tipo === 'modulo' ? 'modulo' : 'inversor', p_nome: val('eg-f-nome'), p_marca: val('eg-f-marca'), p_ficha: ficha });
          if (conf) await rpc('eng_salvar_ficha', { p_id: novo, p_ficha: ficha, p_conferida: true });
        }
        fecharModal();
        toast('Ficha técnica salva');
        await carregarCatalogo(true);
        pintar();
      } catch (e) { erro(e.message); }
    });
  }

  function kitModal(id) {
    const k = (E.kits || []).find((x) => x.id === id);
    if (!k) return;
    const sug = kitLigado(k) ? {} : sugerirVinculo(k);
    const v = { modulo_id: k.modulo_id || sug.modulo_id, modulo_qtd: k.modulo_qtd || sug.modulo_qtd, inversor_id: k.inversor_id || sug.inversor_id, inversor_qtd: k.inversor_qtd || sug.inversor_qtd };
    const opts = (tipo, sel) => `<option value="">— escolha —</option>` + (E.catalogo || []).filter((c) => c.tipo === tipo && c.ativo !== false).map((c) => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${esc(c.nome)}${c.marca ? ' · ' + esc(c.marca) : ''}${ehMicro(c) ? ' (micro)' : ''}</option>`).join('');
    modal(`<h3>${esc(k.name)}</h3><p class="rd-sub">${kitLigado(k) ? 'Equipamentos ligados a este kit.' : 'Sugestão lida do nome do kit. Confira antes de salvar.'}</p>
      <div class="rd-fgrid">
        <div class="rd-fld"><label>Módulo</label><select id="eg-k-mod">${opts('modulo', v.modulo_id)}</select></div>
        <div class="rd-fld"><label>Quantidade de módulos</label><input id="eg-k-modq" inputmode="numeric" value="${esc(v.modulo_qtd ?? '')}"></div>
        <div class="rd-fld"><label>Inversor ou micro</label><select id="eg-k-inv">${opts('inversor', v.inversor_id)}</select></div>
        <div class="rd-fld"><label>Quantidade</label><input id="eg-k-invq" inputmode="numeric" value="${esc(v.inversor_qtd ?? '')}"></div>
      </div>
      <p class="rd-tip">${ic('info')}Não achou o equipamento? Cadastre em "Equipamento" e volte aqui.</p>
      <div class="rd-err" id="eg-err"></div>
      <div class="rd-mfoot">${kitLigado(k) ? `<button class="rd-btn ghost danger" onclick="EV.salvarKit('${k.id}', true)">Desligar</button>` : ''}<button class="rd-btn" onclick="EV.fecharModal()">Cancelar</button><button class="rd-btn pri" id="eg-k-salvar" onclick="EV.salvarKit('${k.id}')">${ic('check')}Salvar</button></div>`);
  }
  async function salvarKit(id, desligar) {
    const args = desligar ? { p_produto: id, p_modulo: null, p_modulo_qtd: null, p_inversor: null, p_inversor_qtd: null }
      : { p_produto: id, p_modulo: val('eg-k-mod') || null, p_modulo_qtd: parseInt(val('eg-k-modq'), 10) || null, p_inversor: val('eg-k-inv') || null, p_inversor_qtd: parseInt(val('eg-k-invq'), 10) || null };
    if (!desligar && (!args.p_modulo || !args.p_inversor || !args.p_modulo_qtd || !args.p_inversor_qtd)) { erro('Escolha os dois equipamentos e as quantidades.'); return; }
    await ocupado('eg-k-salvar', async () => {
      try {
        await rpc('eng_vincular_kit', args);
        const k = E.kits.find((x) => x.id === id);
        Object.assign(k, { modulo_id: args.p_modulo, modulo_qtd: args.p_modulo_qtd, inversor_id: args.p_inversor, inversor_qtd: args.p_inversor_qtd });
        fecharModal();
        toast(desligar ? 'Vínculo removido' : 'Kit ligado');
        pintar();
      } catch (e) { erro(e.message); }
    });
  }
  async function vincularTodos() {
    const alvo = (E.kits || []).filter((k) => k.ativo !== false && !kitLigado(k)).map((k) => ({ k, s: sugerirVinculo(k) })).filter(({ s }) => s.modulo_id && s.inversor_id && s.modulo_qtd && s.inversor_qtd);
    const semSug = (E.kits || []).filter((k) => k.ativo !== false && !kitLigado(k)).length - alvo.length;
    if (!alvo.length) { toast('Nenhum kit deu para ligar pelo nome. Cadastre os equipamentos que faltam no catálogo.'); return; }
    if (!confirm(`Ligar ${alvo.length} kit(s) pelo nome?${semSug ? `\n${semSug} kit(s) ficam de fora (equipamento não encontrado no catálogo).` : ''}`)) return;
    let ok = 0;
    for (const { k, s } of alvo) {
      try { await rpc('eng_vincular_kit', { p_produto: k.id, p_modulo: s.modulo_id, p_modulo_qtd: s.modulo_qtd, p_inversor: s.inversor_id, p_inversor_qtd: s.inversor_qtd }); Object.assign(k, s); ok++; } catch (e) { console.warn('[eng] vincular', k.name, e); }
    }
    toast(`${ok} kit(s) ligados`);
    pintar();
  }

  // ------------------------------------------------------------ ficha do projeto (painel lateral)
  async function abrir(id, aba) {
    if (E.aberto !== id) E.prob = {};
    E.aberto = id;
    E.ptab = aba || (E.ctx === 'eng' && central() ? 'dim' : 'tl');
    pintarDrawer();
    try {
      if (!E.projetos || !E.projetos.some((p) => p.id === id)) await recarregarProjeto(id);
      else await Promise.all([carregarEventos(id), carregarOS(id)]);
      const p = E.projetos.find((x) => x.id === id);
      if (p && central() && p.status === 'validacao' && !p.dim) await rodarAutomaticos();
    } catch (e) { console.error('[eng] abrir projeto', e); toast('Não foi possível abrir o projeto: ' + e.message); }
    pintarDrawer();
  }
  function fechar() { fecharVisor(); E.aberto = null; const d = document.getElementById('eg-drawer'); if (d) d.remove(); document.body.classList.remove('eg-lock'); }

  function pintarDrawer() {
    if (!E.aberto) return;
    const p = (E.projetos || []).find((x) => x.id === E.aberto);
    let d = document.getElementById('eg-drawer');
    if (!d) {
      d = document.createElement('div');
      d.id = 'eg-drawer';
      d.className = 'eg-scrim';
      d.addEventListener('mousedown', (e) => { if (e.target === d) fechar(); });
      document.body.appendChild(d);
      document.body.classList.add('eg-lock');
    }
    const painel = d.querySelector('.eg-panel');
    const y = painel ? painel.scrollTop : 0;
    if (!p) { d.innerHTML = `<div class="eg-panel rd eg"><div class="rd-loading">${ic('loader-2')}Abrindo o projeto...</div></div>`; icons(); return; }
    const eng = central();
    const abas = [['tl', 'history', 'Timeline'], ['dim', 'zap', 'Dimensionamento'], ['docs', 'folder-open', 'Documentos'], ['conc', 'landmark', 'Concessionária'], ['os', 'clipboard-list', 'Ordem de serviço'], ['resumo', 'layout-list', 'Resumo']];
    const nivel = NIVEL[p.status];
    const ruim = ST[p.status] && ST[p.status].tone === 'bad';
    const corpo = ({ resumo: abaResumo, dim: abaDim, docs: abaDocs, conc: abaConc, os: abaOS, tl: abaTL })[E.ptab] || abaResumo;
    d.innerHTML = `<div class="eg-panel rd eg" role="dialog" aria-modal="true">
      <div class="eg-ph">
        <div class="rd-ch"><div>
          <div class="eg-pnum">${pnum(p)} · ${esc(nomeFranquia(p))}</div>
          <h2>${esc(p.cliente_nome || 'Cliente')}</h2>
          <div class="rd-muted">${esc(p.cidade || '')} · ${nf(p.kwp, 2)} kWp · ${esc(LIG[p.snapshot && p.snapshot.instalacao && p.snapshot.instalacao.tipo_ligacao] || 'ligação não informada')} · enviado por ${esc(p.enviado_por_nome || '—')} em ${dataBR(p.created_at)}</div>
        </div>
        <div class="eg-pacts">${stPill(p)}${dimPill(p)}${docsPill(p)}${compPill(p)}<button class="rd-btn sm ghost" onclick="EV.fechar()" title="Fechar">${ic('x')}</button></div></div>
        ${p.status === 'cancelado' ? '' : `<div class="eg-steps">${LINHA.map((sid) => { const s = ST[sid]; const n = NIVEL[sid]; return `<div class="${n < nivel ? 'done' : n === nivel ? (ruim ? 'bad' : 'cur') : ''}"><i></i><span>${esc(s.n)}</span></div>`; }).join('')}</div>`}
        ${eng ? acoesEng(p) : acoesFranquia(p)}
        <div class="rd-tabs eg-ptabs">${abas.map(([k, i, l]) => `<button class="rd-tab ${E.ptab === k ? 'on' : ''}" onclick="EV.aba('${k}')">${ic(i)}${l}</button>`).join('')}</div>
      </div>
      <div class="eg-pb">${corpo(p)}</div>
    </div>`;
    icons();
    const np = d.querySelector('.eg-panel');
    if (np && y) np.scrollTop = y;
    if (E.ptab === 'docs' || E.ptab === 'conc') assinarDocs(p);
  }

  function acoesEng(p) {
    const s = p.status;
    const btn = (st, txt, cls = '', icone = 'arrow-right') => `<button class="rd-btn sm ${cls}" onclick="EV.mudar('${p.id}','${st}')">${ic(icone)}${txt}</button>`;
    const prox = {
      validacao: [p.dim_status === 'ok' ? btn('validacao_aprovada', 'Aprovar e gerar OS', 'pri', 'check') : btn('validacao_aprovada', 'Aprovar mesmo assim e gerar OS', '', 'check'), btn('validacao_reprovada', 'Reprovar validação', 'danger', 'undo-2')],
      validacao_reprovada: [],
      validacao_aprovada: [btn('elaborar_projeto', 'Elaborar projeto', 'pri')],
      elaborar_projeto: [btn('projeto_enviado', 'Projeto enviado', 'pri', 'send')],
      projeto_enviado: [btn('projeto_aprovado', 'Projeto aprovado', 'pri', 'check'), btn('projeto_reprovado', 'Projeto reprovado', 'danger', 'x')],
      projeto_reprovado: [btn('projeto_reenviado', 'Projeto reenviado', 'pri', 'send')],
      projeto_reenviado: [btn('projeto_aprovado', 'Projeto aprovado', 'pri', 'check'), btn('projeto_reprovado', 'Projeto reprovado', 'danger', 'x')],
      projeto_aprovado: [btn('solicitacao_vistoria', 'Obra concluída: solicitar vistoria', 'pri')],
      solicitacao_vistoria: [btn('vistoria_solicitada', 'Vistoria solicitada', 'pri', 'send')],
      vistoria_solicitada: [btn('projeto_concluido', 'Projeto concluído', 'pri', 'flag')],
      projeto_concluido: [],
      cancelado: [],
    }[s] || [];
    const meu = p.responsavel_nome ? `<span class="rd-muted">Responsável: <b>${esc(p.responsavel_nome)}</b></span>` : `<button class="rd-btn sm ghost" onclick="EV.assumir('${p.id}')">${ic('hand')}Assumir</button>`;
    return `<div class="eg-acts">${prox.join('')}
      <span class="rd-grow"></span>${meu}
      <select class="rd-inline-sel" onchange="if(this.value){EV.mudar('${p.id}',this.value);this.value=''}" title="Mover para qualquer status"><option value="">Mover para...</option>${STATUS.filter((x) => x.id !== s).map((x) => `<option value="${x.id}">${esc(x.n)}</option>`).join('')}${s !== 'cancelado' ? '<option value="cancelado">Cancelar projeto</option>' : ''}</select>
    </div>`;
  }

  function acoesFranquia(p) {
    if (p.status !== 'validacao_reprovada') return '';
    const ult = ultimoMotivo(p);
    const pode = state.isAdmin || state.isGestor;
    return `<div class="rd-note" style="background:rgba(209,67,67,.1);color:var(--v2-red);display:block">
      <b>${ic('undo-2')} Validação reprovada pela engenharia</b><div style="color:var(--v2-ink);margin:6px 0 10px">${esc(ult || 'Veja o motivo na timeline.')}</div>
      ${pode ? `<div class="rd-fld"><label>O que foi corrigido</label><input id="eg-reenv" placeholder="Ex.: anexei a conta de luz legível"></div>
      <div class="rd-err" id="eg-err"></div>
      <div style="margin-top:8px"><button class="rd-btn pri sm" id="eg-reenv-btn" onclick="EV.reenviar('${p.id}')">${ic('send')}Corrigi, reenviar à engenharia</button></div>` : '<div class="rd-muted">O gestor da franquia corrige e reenvia.</div>'}
    </div>`;
  }
  function ultimoMotivo(p) {
    const ev = (E.ev[p.id] || []).filter((e) => e.tipo === 'status' && e.para_status === p.status && e.texto);
    return ev.length ? ev[ev.length - 1].texto : null;
  }

  function abaResumo(p) {
    const sn = p.snapshot || {}, c = sn.cliente || {}, inst = sn.instalacao || {};
    const t = tempoPorLado(p, E.ev[p.id]);
    const tot = Object.values(t).reduce((a, b) => a + b, 0) || 1;
    const kv = (l, v) => `<div><div class="l">${l}</div><div class="v">${v || '—'}</div></div>`;
    return `<div class="rd-grid rd-half">
      <div class="rd-card"><h3>${ic('user')}Cliente</h3>
        <div class="rd-kv" style="grid-template-columns:1fr 1fr">${kv('Nome', esc(c.nome))}${kv('CPF/CNPJ', esc(c.documento))}${kv('Telefone', esc(c.telefone))}${kv('Vendedor', esc(c.vendedor_nome || c.vendedor_email))}
        ${kv('Endereço', esc([c.endereco, c.numero, c.complemento, c.bairro].filter(Boolean).join(', ')))}${kv('Cidade', esc([c.cidade, c.uf].filter(Boolean).join(' - ')))}</div></div>
      <div class="rd-card"><h3>${ic('home')}Instalação</h3>
        <div class="rd-kv" style="grid-template-columns:1fr 1fr">${kv('Ligação', esc(LIG[inst.tipo_ligacao]))}${kv('UC', esc(p.uc || inst.numero_instalacao))}${kv('Concessionária', esc(p.concessionaria || inst.concessionaria))}${kv('Telhado', esc(inst.telhado))}
        ${kv('Distância módulos → inversor', inst.distancia_m ? esc(inst.distancia_m) + ' m' : '')}${kv('Localização do padrão', esc(c.padrao_localizacao))}</div>
        ${inst.obs ? `<p class="rd-tip">${ic('message-square')}${esc(inst.obs)}</p>` : ''}</div>
    </div>
    <div class="rd-grid rd-half" style="margin-top:14px">
      <div class="rd-card"><h3>${ic('package')}Kit da venda</h3><p class="rd-sub">${esc((sn.venda && sn.venda.kit_nome) || '—')}</p>
        ${eqLinha(sn.modulo, 'Módulo')}${eqLinha(sn.inversor, ehMicro(sn.inversor) ? 'Microinversor' : 'Inversor')}
        ${!sn.kit ? `<div class="rd-muted">Kit não encontrado no catálogo: a engenharia escolhe os equipamentos.</div>` : ''}</div>
      <div class="rd-card"><h3>${ic('timer')}Tempo com cada lado</h3><p class="rd-sub">Contado pelo relógio do servidor, a cada mudança de status</p>
        ${Object.entries(LADOS).map(([k, l]) => `<div class="eg-barra" style="cursor:default"><span>${l}</span><div class="rd-meter"><i style="width:${(t[k] / tot) * 100}%;background:${{ eng: 'var(--v2-blue)', franquia: 'var(--v2-orange)', conc: 'var(--v2-gray)', obra: 'var(--v2-green)' }[k]}"></i></div><b>${nf(t[k], 1)}d</b></div>`).join('')}</div>
    </div>`;
  }
  function eqLinha(eq, tipo) {
    if (!eq) return `<div class="eg-eq"><span class="rd-tag">${tipo}</span><b>—</b>${pill('sem vínculo', 'bad')}</div>`;
    return `<div class="eg-eq"><span class="rd-tag">${tipo}</span><b>${eq.qtd}× ${esc(eq.nome)}</b>${fichaOk(eq) ? (eq.ficha_conferida ? pill('ficha ok', 'ok') : pill('ficha a conferir', 'at')) : pill('ficha pendente', 'bad')}</div>`;
  }

  function abaDim(p) {
    const d = p.dim;
    const eng = central();
    if (!d) return `<div class="rd-card rd-empty"><div class="ic">${ic('loader-2')}</div><b>Dimensionamento ainda não calculado</b>${eng ? 'Calculando...' : 'A engenharia calcula quando abre o projeto.'}</div>`;
    const ok = p.dim_status === 'ok';
    const banner = ok
      ? `<div class="rd-note" style="background:rgba(31,169,113,.12);color:#12704A">${ic('circle-check')}<span><b>${d.manual ? 'Dimensionamento ajustado pelo engenheiro' : 'Dimensionamento automático aprovado'}</b><br><span style="color:var(--v2-ink)">${d.manual ? 'Feito na calculadora e salvo no projeto.' : 'A plataforma leu o kit da venda, puxou as fichas técnicas e rodou o cálculo da calculadora. Todas as verificações passaram.'}${d.fichas_conferidas === false ? ' Atenção: alguma ficha técnica ainda não foi conferida.' : ''}</span></span></div>`
      : `<div class="rd-note" style="background:rgba(209,67,67,.1);color:var(--v2-red)">${ic('circle-alert')}<span><b>Não deu para dimensionar sozinho</b><br><span style="color:var(--v2-ink)">${esc(p.dim_motivo || d.motivo || '')}</span></span></div>`;
    const checks = (d.checks || []).map((c) => `<tr><td class="first"><b>${esc(c.nome)}</b><div class="rd-muted">${esc(c.calc)}</div></td><td data-l="Limite" class="r">${esc(c.limite)}</td><td data-l="Resultado" class="r" style="color:${c.ok ? '#12704A' : 'var(--v2-red)'};font-weight:800">${esc(c.valor === 'ok' ? '' : c.valor)} ${c.ok ? '✓' : '✗'}</td></tr>`).join('');
    const pr = d.protecoes;
    return `${banner}
      <div class="rd-grid rd-two">
        <div>
          ${d.checks && d.checks.length ? `<div class="rd-card rd-mb"><h3>${ic('list-checks')}Verificações</h3><table class="rd-t cards"><thead><tr><th>Verificação</th><th class="r">Limite</th><th class="r">Resultado</th></tr></thead><tbody>${checks}</tbody></table></div>` : ''}
          ${arranjoHTML(d, p)}
        </div>
        <div>
          <div class="rd-card rd-mb"><h3>${ic('sun')}Sistema</h3>
            <div class="rd-kv" style="grid-template-columns:1fr 1fr">
              <div><div class="l">Potência CC</div><div class="v" style="font-size:18px">${nf(d.kwp || p.kwp, 2)} kWp</div></div>
              <div><div class="l">Potência CA</div><div class="v" style="font-size:18px">${d.potCA ? nf(d.potCA / 1000, 2) + ' kW' : '—'}</div></div>
              <div><div class="l">Geração média</div><div class="v" style="font-size:18px">${d.geracaoMedia ? nf(d.geracaoMedia) + ' kWh/mês' : '—'}</div></div>
              <div><div class="l">HSP usado</div><div class="v" style="font-size:18px">${nf(d.hsp, 2)}</div></div>
            </div></div>
          ${pr ? `<div class="rd-card rd-mb"><h3>${ic('shield')}Proteções CA <span class="rd-tag man">sugerido</span></h3>
            <div class="rd-line"><div class="nm">Corrente por inversor</div><div class="val">${nf(pr.corrente, 1)} A</div></div>
            <div class="rd-line"><div class="nm">Disjuntor</div><div class="val">${pr.disjuntor} A ${pr.polos}</div></div>
            <div class="rd-line"><div class="nm">Cabo CA</div><div class="val">${String(pr.cabo).replace('.', ',')} mm² · ${pr.condutores}</div></div>
            <p class="rd-tip">${ic('info')}Regra simples (corrente × 1,25). O engenheiro confere.</p></div>` : ''}
          ${eng ? `<div class="rd-card"><button class="rd-btn" style="width:100%;justify-content:center" onclick="EV.calculadora('${p.id}')">${ic('calculator')}Ajustar na calculadora</button>
            <button class="rd-btn ghost" style="width:100%;justify-content:center;margin-top:6px" onclick="EV.recalcular('${p.id}')">${ic('refresh-cw')}Recalcular com o catálogo atual</button></div>` : ''}
        </div>
      </div>`;
  }

  function arranjoHTML(d, p) {
    if (d.micro) {
      const nMod = (p.snapshot && p.snapshot.modulo && p.snapshot.modulo.qtd) || 0;
      return `<div class="rd-card"><h3>${ic('grid-3x3')}Arranjo</h3><p class="rd-sub">${d.micro.qtd} microinversores de ${d.micro.porMicro} entradas</p>
        <div class="eg-mppt">${Array.from({ length: d.micro.qtd }, (_, i) => { const n = Math.max(0, Math.min(d.micro.porMicro, nMod - i * d.micro.porMicro)); return `<div class="eg-mp"><div class="t">Micro ${i + 1}</div><div class="eg-mods">${'<i></i>'.repeat(n)}${'<i class="e"></i>'.repeat(d.micro.porMicro - n)}</div><div class="rd-muted">${n} módulo(s)</div></div>`; }).join('')}</div></div>`;
    }
    if (!d.distribution) return '';
    return `<div class="rd-card"><h3>${ic('grid-3x3')}Arranjo calculado</h3><p class="rd-sub">Strings por MPPT${d.inversores > 1 ? `, em cada um dos ${d.inversores} inversores` : ''} · cabo CC ${CABO_CC} mm²</p>
      <div class="eg-mppt">${d.distribution.map((m, i) => `<div class="eg-mp"><div class="t">MPPT ${i + 1}</div>${m.numStrings ? Array.from({ length: m.numStrings }, () => `<div class="eg-mods">${'<i></i>'.repeat(m.modulesPerString)}</div>`).join('') : '<div class="rd-muted">vazia</div>'}<div class="rd-muted">${m.numStrings ? `${m.numStrings} string(s) × ${m.modulesPerString} módulos` : ''}</div></div>`).join('')}</div></div>`;
  }

  // documentos congelados no envio (com o que chegou depois)
  const DOC_LABEL = { rg_cnh: 'RG / CNH', conta_energia: 'Conta de energia', foto_padrao: 'Foto do padrão', foto_disjuntor: 'Foto do disjuntor', foto_fachada: 'Fachada', localizacao_padrao: 'Localização do padrão', foto_medidor: 'Medidor', caixa_medicao: 'Caixa de medição', procuracao: 'Procuração', comprovante_taxa: 'Comprovante da taxa', engenharia: 'Engenharia', inspecao: 'Inspeção', outros: 'Outros' };
  // ------------------------------------------------------------ documentos
  // ordem da pasta (zip numerado) e checklist dos obrigatórios
  const DOC_ORDEM = ['conta_energia', 'rg_cnh', 'procuracao', 'comprovante_taxa', 'foto_padrao', 'foto_disjuntor', 'foto_fachada', 'localizacao_padrao', 'foto_medidor', 'caixa_medicao', 'engenharia', 'inspecao', 'outros'];
  const DOC_OBRIG = [['conta_energia', 'Conta de energia'], ['rg_cnh', 'RG / CNH'], ['procuracao', 'Procuração'], ['comprovante_taxa', 'Taxa de projeto'], ['foto_padrao', 'Foto do padrão'], ['foto_disjuntor', 'Foto do disjuntor'], ['foto_fachada', 'Fachada'], ['localizacao_padrao', 'Localização do padrão'], ['foto_medidor', 'Medidor'], ['caixa_medicao', 'Caixa de medição']];
  const SLOT_LABEL = { frontal: 'frontal', traseira: 'traseira', aberta: 'aberta', fechada: 'fechada' };
  const extDe = (a) => { const m = String(a.nome || a.storage_path || '').match(/\.([a-z0-9]{2,5})$/i); if (m) return m[1].toLowerCase(); const t = String(a.mime || ''); return t.includes('pdf') ? 'pdf' : t.includes('png') ? 'png' : t.includes('jpeg') || t.includes('jpg') ? 'jpeg' : t.includes('webp') ? 'webp' : 'bin'; };
  const ehImg = (a) => ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(extDe(a));
  // anexos da própria engenharia (cliente_arquivos tipo 'engenharia' + slot); não entram nos documentos do envio
  const ANEXOS = [['parecer', 'Parecer de acesso', 'file-check-2', 'PDF ou print da concessionária'], ['art_boleto', 'Boleto da ART', 'receipt', 'Boleto e comprovante de pagamento'], ['conc_outros', 'Outros', 'folder', 'Protocolo, ART assinada, ofícios']];
  const SLOTS_TEC = ANEXOS.map(([k]) => k);
  const ehTec = (a) => a.tipo === 'engenharia' && SLOTS_TEC.includes(a.slot);
  const ehPdf = (a) => extDe(a) === 'pdf';
  const nomeArq = (s) => String(s || '').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim();
  const pastaNome = (p) => nomeArq(pnum(p) + ' - ' + (p.cliente_nome || 'Cliente') + ' - ' + nomeFranquia(p));

  // lista do projeto: documentos do envio + os que chegaram depois, já numerados e com nome de arquivo
  function docsProjeto(p) {
    const snap = ((p.snapshot && p.snapshot.docs) || []).map((a) => ({ ...a, novo: false }));
    const ids = new Set(snap.map((a) => a.id));
    const novos = ((E.docsNovos || {})[p.id] || []).filter((a) => !ids.has(a.id) && !ehTec(a)).map((a) => ({ ...a, novo: true }));
    const ord = (a) => { const i = DOC_ORDEM.indexOf(a.tipo); return i < 0 ? 99 : i; };
    const todos = snap.sort((a, b) => ord(a) - ord(b) || String(a.em).localeCompare(String(b.em))).concat(novos.sort((a, b) => ord(a) - ord(b)));
    const porTipo = {};
    todos.forEach((a) => { porTipo[a.tipo] = (porTipo[a.tipo] || 0) + 1; });
    const vistos = {};
    return todos.map((a, i) => {
      vistos[a.tipo] = (vistos[a.tipo] || 0) + 1;
      const base = DOC_LABEL[a.tipo] || a.tipo;
      const sufixo = a.slot ? ' ' + (SLOT_LABEL[a.slot] || a.slot) : (porTipo[a.tipo] > 1 ? ' ' + vistos[a.tipo] : '');
      const rotulo = base + sufixo;
      return { ...a, n: i + 1, rotulo, arquivo: nomeArq(String(i + 1).padStart(2, '0') + ' ' + rotulo + (a.novo ? ' (depois do envio)' : '')) + '.' + extDe(a) };
    });
  }

  function abaDocs(p) {
    const docs = docsProjeto(p);
    const pd = pendencias(p);
    const repIds = new Set(pd ? pd.docs.map((d) => d.id).filter(Boolean) : []);
    const subIds = new Set(pd ? pd.docs.map((d) => d.novoId).filter(Boolean) : []);
    const selo = (a) => repIds.has(a.id) ? '<span class="eg-dselo rep">' + ic('circle-x') + 'Reprovado ' + dataBR(pd.ev.created_at) + '</span>' : subIds.has(a.id) ? '<span class="eg-dselo sub">' + ic('refresh-cw') + 'Substitui o reprovado</span>' : '';
    const urls = E.urls || {};
    const eng = central();
    const prob = E.prob || {};
    const snapDocs = docs.filter((a) => !a.novo), novos = docs.filter((a) => a.novo);
    const fotos = snapDocs.filter(ehImg), outros = snapDocs.filter((a) => !ehImg(a));
    const loc = p.snapshot && p.snapshot.cliente && p.snapshot.cliente.padrao_localizacao;
    const chk = DOC_OBRIG.map(([tipo, rotulo]) => {
      const q = snapDocs.filter((a) => a.tipo === tipo);
      const depois = novos.some((a) => a.tipo === tipo);
      let ok = q.length > 0, extra = q.length > 1 ? '×' + q.length : '';
      if (tipo === 'caixa_medicao') { const sl = new Set(q.map((a) => a.slot).filter(Boolean)).size; ok = sl >= 4; extra = q.length ? sl + '/4' : ''; }
      if (tipo === 'localizacao_padrao' && !ok && loc) { ok = true; extra = 'texto'; }
      const cls = ok ? '' : depois ? 'dep' : 'no';
      return '<div class="' + cls + '" title="' + esc(ok ? rotulo + ' recebido' : depois ? rotulo + ': chegou depois do envio' : rotulo + ': não veio no envio') + '">' + ic(ok ? 'check' : depois ? 'clock' : 'x') + '<span>' + esc(rotulo) + '</span>' + (extra ? '<b>' + esc(extra) + '</b>' : '') + '</div>';
    }).join('');
    const flag = (a, cls) => eng ? '<button class="' + cls + ' ' + (prob[a.id] ? 'on' : '') + '" title="' + (prob[a.id] ? 'Desmarcar' : 'Marcar com problema') + '" onclick="event.stopPropagation();EV.docProb(\'' + a.id + '\')">' + ic('flag') + '</button>' : '';
    const baixar = (a, cls) => '<button class="' + cls + '" title="Baixar ' + esc(a.arquivo) + '" onclick="event.stopPropagation();EV.docBaixar(\'' + a.id + '\',this)">' + ic('download') + '</button>';
    const miniatura = (a) => '<div class="eg-dth ' + (prob[a.id] ? 'bad' : '') + (repIds.has(a.id) ? ' rep' : '') + '" onclick="EV.docVer(\'' + a.id + '\')">'
      + '<div class="img" ' + (urls[a.storage_path] ? 'style="background-image:url(\'' + esc(urls[a.storage_path]) + '\')"' : '') + '><span class="n">' + String(a.n).padStart(2, '0') + '</span>' + (a.novo ? '<span class="novo">NOVO · ' + dataBR(a.em) + '</span>' : '') + '</div>'
      + '<div class="hv">' + baixar(a, 'ico') + flag(a, 'ico') + '</div>'
      + '<div class="lb"><b>' + esc(a.rotulo) + '</b><small>' + dataBR(a.em) + ' · ' + extDe(a).toUpperCase() + '</small>' + selo(a) + (prob[a.id] ? '<em>marcado agora (ainda não enviado)</em>' : '') + '</div></div>';
    const arquivo = (a) => '<div class="eg-dpdf ' + (prob[a.id] ? 'bad' : '') + (repIds.has(a.id) ? ' rep' : '') + '" onclick="EV.docVer(\'' + a.id + '\')"><div class="pg ' + (ehPdf(a) ? '' : 'out') + '">' + ic(ehPdf(a) ? 'file-text' : 'file') + '<span>' + esc(extDe(a).toUpperCase()) + '</span></div>'
      + '<div class="nm"><b>' + String(a.n).padStart(2, '0') + ' · ' + esc(a.rotulo) + '</b><small>' + esc(a.nome || '') + ' · ' + dataBR(a.em) + '</small>' + (a.novo ? '<span class="novo">NOVO</span>' : '') + selo(a) + (prob[a.id] ? '<em>marcado agora (ainda não enviado)</em>' : '') + '</div>'
      + '<div class="a"><button title="Ver aqui" onclick="event.stopPropagation();EV.docVer(\'' + a.id + '\')">' + ic('eye') + '</button>' + baixar(a, '') + flag(a, '') + '</div></div>';
    const grupo = (titulo, lista, tom) => lista.length ? '<div class="rd-card rd-mb ' + (tom || '') + '"><div class="eg-dsec"><b>' + titulo + '</b><i></i><span>' + lista.length + '</span></div>'
      + (lista.some(ehImg) ? '<div class="eg-dgrid">' + lista.filter(ehImg).map(miniatura).join('') + '</div>' : '')
      + (lista.some((a) => !ehImg(a)) ? '<div class="eg-dpdfs" ' + (lista.some(ehImg) ? 'style="margin-top:10px"' : '') + '>' + lista.filter((a) => !ehImg(a)).map(arquivo).join('') + '</div>' : '') + '</div>' : '';
    const nProb = Object.keys(prob).length;
    const validacao = NIVEL[p.status] <= 1 && p.status !== 'validacao_reprovada';
    const pend = pendencias(p);
    const enviadoEm = (p.snapshot && p.snapshot.enviado_em) || p.created_at;
    const banner = !pend ? '' : '<div class="eg-dpend ' + (pend.aguardando ? '' : 'ok') + '"><div class="h">' + ic(pend.aguardando ? 'circle-alert' : 'circle-check')
      + '<div><b>' + (pend.reprovou ? 'Validação reprovada' : 'Documentos pedidos à franquia') + ' em ' + dataHora(pend.ev.created_at) + '</b><span>por ' + esc(pend.ev.autor_nome || 'engenharia') + ' · '
      + (pend.aguardando ? pend.aguardando + ' aguardando novo arquivo' + (pend.docs.length - pend.aguardando ? ' · ' + (pend.docs.length - pend.aguardando) + ' já chegou' : '') : 'todos os arquivos novos chegaram: confira e valide') + '</span></div></div>'
      + '<div class="l">' + pend.docs.map((d) => '<button class="' + (d.chegou ? 'ok' : '') + '" ' + (d.novoId || d.id ? 'onclick="EV.docVer(\'' + (d.novoId || d.id) + '\')"' : 'disabled') + '>' + ic(d.chegou ? 'check' : 'clock') + '<b>' + esc(d.rotulo) + '</b><span>' + (d.chegou ? 'novo em ' + dataBR(d.novoEm) : 'aguardando') + '</span></button>').join('') + '</div></div>';
    return banner + '<div class="rd-card rd-mb"><div class="eg-dtop"><div class="g"><h3>' + ic('folder-check') + 'Documentos do projeto</h3><p class="rd-sub">' + docs.length + ' arquivo(s) · congelados no envio em ' + dataBR(enviadoEm) + ' · a franquia não consegue apagar enquanto o projeto está em andamento</p></div>'
      + '<div class="eg-dacts"><button class="rd-btn" onclick="EV.docPasta()">' + ic('copy') + 'Copiar nome da pasta</button><button class="rd-btn pri" id="eg-dzip" ' + (docs.length ? '' : 'disabled') + ' onclick="EV.docZip()">' + ic('download') + 'Baixar tudo (.zip)</button></div></div>'
      + '<div class="eg-dpasta">' + ic('folder') + '<span class="rd-muted">Pasta no Drive:</span><b>' + esc(pastaNome(p)) + '</b><span class="rd-muted eg-dex">arquivos saem renomeados: <b>' + esc((docs[0] && docs[0].arquivo) || '01 Conta de energia.pdf') + '</b></span></div>'
      + '<div class="eg-dchk">' + chk + '</div></div>'
      + (docs.length ? grupo('Fotos', fotos) + grupo('Documentos', outros) + grupo('Chegou depois do envio', novos, 'eg-ddep') : '<div class="rd-card rd-empty">Nenhum documento no envio.</div>')
      + (eng && nProb ? '<div class="eg-drep">' + ic('flag') + '<div class="t"><b>' + nProb + ' marcado(s), ainda não enviado(s):</b> ' + esc(Object.values(prob).map((x) => x.rotulo).join(', ')) + '</div><button class="rd-btn sm" onclick="EV.docProbLimpar()">Limpar</button>'
        + (validacao ? '<button class="rd-btn sm pri danger" onclick="EV.docReprovar(\'' + p.id + '\')">' + ic('undo-2') + 'Reprovar pedindo esses</button>' : '<button class="rd-btn sm pri" onclick="EV.docPedir(\'' + p.id + '\')">' + ic('message-square') + 'Pedir à franquia</button>') + '</div>' : '');
  }

  // URLs assinadas (1 h; renova com 50 min) e arquivos que chegaram depois do envio
  async function assinarDocs(p) {
    E.urls = E.urls || {};
    E.docsNovos = E.docsNovos || {};
    E.urlsEm = E.urlsEm || {};
    let mudou = false;
    if (p.cliente_id && E.docsNovos[p.id] === undefined) {
      E.docsNovos[p.id] = [];
      const { data, error } = await sb().from('cliente_arquivos').select('id, tipo, slot, storage_path, nome_original, mime, created_at, uploaded_by_nome').eq('cliente_id', p.cliente_id).order('created_at');
      if (!error) { E.docsNovos[p.id] = (data || []).map((a) => ({ id: a.id, tipo: a.tipo, slot: a.slot, storage_path: a.storage_path, nome: a.nome_original, mime: a.mime, em: a.created_at, autor: a.uploaded_by_nome })); mudou = true; }
    }
    const velho = Date.now() - 50 * 60000;
    const falta = docsProjeto(p).concat(anexosProjeto(p)).map((a) => a.storage_path).filter((x) => x && (!E.urls[x] || E.urlsEm[x] < velho));
    if (falta.length) {
      const { data, error } = await sb().storage.from('crm-arquivos').createSignedUrls(falta, 3600);
      if (error) console.warn('[eng] assinar docs', error);
      (data || []).forEach((x) => { if (x.signedUrl && x.path) { E.urls[x.path] = x.signedUrl; E.urlsEm[x.path] = Date.now(); mudou = true; } });
    }
    if (mudou && E.aberto === p.id && ['docs', 'conc'].includes(E.ptab)) pintarDrawer();
  }
  const docDoAberto = (id) => {
    const p = (E.projetos || []).find((x) => x.id === E.aberto);
    if (!p) return {};
    const anx = anexosProjeto(p);
    const docs = id && anx.some((d) => d.id === id) ? anx : docsProjeto(p);
    return { p, docs, a: docs.find((d) => d.id === id) };
  };
  function salvarBlob(blob, nome) {
    const u = URL.createObjectURL(blob);
    const l = document.createElement('a');
    l.href = u; l.download = nome;
    document.body.appendChild(l); l.click(); l.remove();
    setTimeout(() => URL.revokeObjectURL(u), 4000);
  }
  async function baixarArq(a) {
    const u = (E.urls || {})[a.storage_path];
    if (!u) throw new Error('Link do arquivo ainda carregando');
    const r = await fetch(u);
    if (!r.ok) throw new Error('Falha ao baixar ' + a.rotulo);
    return r.blob();
  }
  async function docBaixar(id, btn) {
    const { a } = docDoAberto(id);
    if (!a) return;
    if (btn) btn.disabled = true;
    try { salvarBlob(await baixarArq(a), a.arquivo); } catch (e) { toast(e.message); } finally { if (btn) btn.disabled = false; }
  }
  async function docZip() {
    const { p, docs } = docDoAberto(null);
    if (!p || !docs.length) return;
    const b = document.getElementById('eg-dzip');
    const h = b && b.innerHTML;
    const status = (t) => { if (b) { b.disabled = true; b.innerHTML = ic('loader-2') + t; icons(); } };
    try {
      status('Preparando...');
      await assinarDocs(p);
      await carregarLib('jszip');
      const zip = new JSZip();
      let feitos = 0;
      const fila = docs.slice();
      const trabalhador = async () => {
        while (fila.length) {
          const a = fila.shift();
          zip.file(a.arquivo, await baixarArq(a));
          feitos += 1;
          status('Baixando ' + feitos + ' de ' + docs.length + '...');
        }
      };
      await Promise.all([trabalhador(), trabalhador(), trabalhador(), trabalhador()]);
      status('Compactando...');
      salvarBlob(await zip.generateAsync({ type: 'blob' }), pastaNome(p) + '.zip');
      toast(docs.length + ' arquivo(s) baixados em ' + pastaNome(p) + '.zip');
    } catch (e) {
      console.error('[eng] zip', e);
      toast('Não foi possível gerar o zip: ' + e.message);
    } finally {
      const bb = document.getElementById('eg-dzip');
      if (bb) { bb.disabled = false; bb.innerHTML = h; icons(); }
    }
  }
  async function docPasta() {
    const { p } = docDoAberto(null);
    if (!p) return;
    try { await navigator.clipboard.writeText(pastaNome(p)); toast('Copiado: ' + pastaNome(p)); } catch (_) { prompt('Copie o nome da pasta:', pastaNome(p)); }
  }
  function docProb(id) {
    const { a } = docDoAberto(id);
    if (!a) return;
    E.prob = E.prob || {};
    if (E.prob[id]) delete E.prob[id]; else E.prob[id] = { rotulo: a.rotulo, tipo: a.tipo, slot: a.slot || null };
    if (document.getElementById('eg-vw')) pintarVisor();
    pintarDrawer();
  }
  const PREFIXO_PEDIDO = 'Corrigir/reenviar: ';
  const textoProb = () => PREFIXO_PEDIDO + Object.values(E.prob || {}).map((x) => x.rotulo).join(', ');
  const docsProbLista = () => Object.entries(E.prob || {}).map(([id, x]) => ({ id, rotulo: x.rotulo, tipo: x.tipo, slot: x.slot }));
  // envia a lista de arquivos junto; se o banco ainda não tem o parâmetro p_docs, manda sem
  async function rpcDocs(nome, args, docs) {
    if (!docs || !docs.length) return rpc(nome, args);
    try { return await rpc(nome, { ...args, p_docs: docs }); } catch (e) {
      if (!/p_docs|could not find|schema cache|does not exist/i.test(e.message || '')) throw e;
      console.warn('[eng] ' + nome + ' sem p_docs (migration eng_docs_reprovados pendente)');
      return rpc(nome, args);
    }
  }
  function docReprovar(id) { mudar(id, 'validacao_reprovada', textoProb(), docsProbLista()); }
  async function docPedir(id) {
    try {
      await rpcDocs('eng_comentar', { p_id: id, p_texto: textoProb(), p_interno: false }, docsProbLista());
      E.prob = {};
      await carregarEventos(id);
      pintarDrawer();
      toast('Pedido enviado à franquia');
    } catch (e) { toast(e.message); }
  }

  // último pedido de documentos (reprovação ou comentário da engenharia) e a situação de cada arquivo
  function pendencias(p) {
    const evs = (E.ev[p.id] || []).filter((e) => (e.meta && Array.isArray(e.meta.docs) && e.meta.docs.length)
      || (String(e.texto || '').startsWith(PREFIXO_PEDIDO) && (e.tipo === 'comentario' || ['validacao_reprovada', 'projeto_reprovado'].includes(e.para_status))));
    const ev = evs[evs.length - 1];
    if (!ev) return null;
    const todos = docsProjeto(p);
    let lista = ev.meta && Array.isArray(ev.meta.docs) && ev.meta.docs.length ? ev.meta.docs : null;
    if (!lista) { // evento antigo: só tem o texto com os rótulos
      lista = String(ev.texto).slice(PREFIXO_PEDIDO.length).split(',').map((r) => r.trim()).filter(Boolean)
        .map((r) => { const a = todos.find((d) => d.rotulo === r && new Date(d.em) <= new Date(ev.created_at)); return a ? { id: a.id, rotulo: r, tipo: a.tipo, slot: a.slot } : { id: null, rotulo: r, tipo: null }; });
    }
    const quando = new Date(ev.created_at);
    const docs = lista.map((x) => {
      const novo = todos.find((d) => d.id !== x.id && x.tipo && d.tipo === x.tipo && (!x.slot || d.slot === x.slot) && new Date(d.em) > quando);
      return { ...x, chegou: !!novo, novoId: novo ? novo.id : null, novoEm: novo ? novo.em : null };
    });
    const aguardando = docs.filter((d) => !d.chegou).length;
    // some quando tudo chegou e a validação já passou
    if (!aguardando && NIVEL[p.status] >= 1 && p.status !== 'projeto_reprovado') return null;
    return { ev, docs, aguardando, reprovou: ev.tipo === 'status' };
  }

  // visualizador: fotos e PDFs na própria tela, com setas
  function docVer(id) {
    E.visor = id;
    let v = document.getElementById('eg-vw');
    if (!v) {
      v = document.createElement('div');
      v.id = 'eg-vw';
      v.className = 'eg-vw';
      v.addEventListener('mousedown', (e) => { if (e.target === v || e.target.classList.contains('st')) fecharVisor(); });
      document.body.appendChild(v);
      window.addEventListener('keydown', teclaVisor, true); // captura: o Esc fecha só o visualizador, não o painel
    }
    pintarVisor();
  }
  function fecharVisor() { E.visor = null; const v = document.getElementById('eg-vw'); if (v) v.remove(); window.removeEventListener('keydown', teclaVisor, true); }
  function teclaVisor(e) {
    if (!document.getElementById('eg-vw')) return;
    if (e.key === 'Escape') { e.stopImmediatePropagation(); e.preventDefault(); fecharVisor(); }
    if (e.key === 'ArrowRight') visorIr(1);
    if (e.key === 'ArrowLeft') visorIr(-1);
  }
  function visorIr(d) {
    const { docs } = docDoAberto(E.visor);
    if (!docs || !docs.length) return;
    const i = docs.findIndex((a) => a.id === E.visor);
    E.visor = docs[(i + d + docs.length) % docs.length].id;
    pintarVisor();
  }
  function pintarVisor() {
    const v = document.getElementById('eg-vw');
    const { docs, a } = docDoAberto(E.visor);
    if (!v || !a) { fecharVisor(); return; }
    const u = (E.urls || {})[a.storage_path];
    const i = docs.indexOf(a);
    const eng = central();
    const palco = !u ? '<div class="msg">' + ic('loader-2') + 'Carregando...</div>'
      : ehImg(a) ? '<img src="' + esc(u) + '" alt="' + esc(a.rotulo) + '">'
      : ehPdf(a) ? '<iframe src="' + esc(u) + '#view=FitH" title="' + esc(a.rotulo) + '"></iframe>'
      : '<div class="msg">' + ic('file') + 'Sem pré-visualização para .' + esc(extDe(a)) + '. Use Baixar.</div>';
    v.innerHTML = '<div class="hd"><div class="g"><b>' + (a.tec ? '' : String(a.n).padStart(2, '0') + ' · ') + esc(a.rotulo) + (a.novo ? ' <span class="novo">NOVO</span>' : '') + '</b><small>' + (i + 1) + ' de ' + docs.length + ' · ' + esc(a.nome || '') + ' · ' + dataBR(a.em) + '</small></div>'
      + '<button class="rd-btn" onclick="EV.docBaixar(\'' + a.id + '\',this)">' + ic('download') + 'Baixar</button>'
      + (eng && !a.tec ? '<button class="rd-btn ' + ((E.prob || {})[a.id] ? 'danger pri' : '') + '" onclick="EV.docProb(\'' + a.id + '\')">' + ic('flag') + ((E.prob || {})[a.id] ? 'Marcado' : 'Problema') + '</button>' : '')
      + (u ? '<a class="rd-btn" href="' + esc(u) + '" target="_blank" rel="noopener" title="Abrir em nova aba">' + ic('external-link') + '</a>' : '')
      + '<button class="rd-btn" onclick="EV.docFechar()" title="Fechar (Esc)">' + ic('x') + '</button></div>'
      + '<div class="st"><button class="nav" onclick="EV.docIr(-1)" title="Anterior (←)">' + ic('chevron-left') + '</button><div class="pl">' + palco + '</div><button class="nav" onclick="EV.docIr(1)" title="Próximo (→)">' + ic('chevron-right') + '</button></div>'
      + '<div class="fs">' + docs.map((d) => { const du = (E.urls || {})[d.storage_path]; return '<button class="' + (d.id === a.id ? 'on' : '') + ' ' + ((E.prob || {})[d.id] ? 'bad' : '') + '" title="' + esc(d.rotulo) + '" onclick="EV.docVer(\'' + d.id + '\')" ' + (ehImg(d) && du ? 'style="background-image:url(\'' + esc(du) + '\')"' : '') + '>' + (ehImg(d) && du ? '' : '<span>' + esc(extDe(d).toUpperCase()) + '</span>') + '</button>'; }).join('') + '</div>';
    icons();
    const on = v.querySelector('.fs .on');
    if (on) on.scrollIntoView({ block: 'nearest', inline: 'center' });
  }

  function anexosProjeto(p) {
    return ((E.docsNovos || {})[p.id] || []).filter(ehTec).map((a) => {
      const def = ANEXOS.find(([k]) => k === a.slot) || [];
      return { ...a, tec: true, n: 0, rotulo: def[1] || 'Anexo', arquivo: nomeArq(pastaNome(p) + ' - ' + (def[1] || 'Anexo') + ' - ' + String(a.nome || '').replace(/\.[^.]+$/, '')) + '.' + extDe(a) };
    });
  }
  function anexosHTML(p) {
    const eng = central();
    const todos = anexosProjeto(p);
    const carregando = (E.docsNovos || {})[p.id] === undefined;
    const urls = E.urls || {};
    const bloco = ([slot, nome, icone, dica]) => {
      const its = todos.filter((a) => a.slot === slot);
      const enviando = E.anxEnviando === p.id + ':' + slot;
      const item = (a) => '<div class="eg-anxi" onclick="EV.docVer(\'' + a.id + '\')">'
        + (ehImg(a) && urls[a.storage_path] ? '<span class="th" style="background-image:url(\'' + esc(urls[a.storage_path]) + '\')"></span>' : '<span class="th ic">' + ic(ehPdf(a) ? 'file-text' : 'file') + '</span>')
        + '<span class="nm"><b>' + esc(a.nome || 'arquivo') + '</b><small>' + dataBR(a.em) + (a.autor ? ' · ' + esc(String(a.autor).split(' ')[0]) : '') + '</small></span>'
        + '<button title="Baixar" onclick="event.stopPropagation();EV.docBaixar(\'' + a.id + '\',this)">' + ic('download') + '</button>'
        + (eng ? '<button class="del" title="Excluir" onclick="event.stopPropagation();EV.anxExcluir(\'' + p.id + '\',\'' + a.id + '\')">' + ic('trash-2') + '</button>' : '') + '</div>';
      return '<div class="eg-anx" ' + (eng ? 'tabindex="0" ondragover="event.preventDefault();this.classList.add(\'drag\')" ondragleave="this.classList.remove(\'drag\')" ondrop="EV.anxDrop(event,\'' + p.id + '\',\'' + slot + '\')" onpaste="EV.anxColar(event,\'' + p.id + '\',\'' + slot + '\')"' : '') + '>'
        + '<div class="hd">' + ic(icone) + '<div><b>' + nome + '</b><small>' + dica + '</small></div><span class="q">' + its.length + '</span></div>'
        + (its.length ? its.map(item).join('') : '<div class="vz">' + (carregando ? 'Carregando...' : 'Nenhum arquivo') + '</div>')
        + (eng ? '<label class="rd-btn sm eg-anxbtn ' + (enviando ? 'dis' : '') + '">' + ic(enviando ? 'loader-2' : 'paperclip') + (enviando ? 'Enviando...' : 'Anexar') + '<input type="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp" onchange="EV.anxArquivos(\'' + p.id + '\',\'' + slot + '\',this.files);this.value=\'\'"></label><div class="dica">ou arraste aqui · clique no quadro e Ctrl+V para colar um print</div>' : '')
        + '</div>';
    };
    return '<div class="rd-card rd-mb"><h3>' + ic('paperclip') + 'Anexos da engenharia</h3><p class="rd-sub">' + (eng ? 'Ficam no cliente (pasta Engenharia). A franquia vê, mas não apaga.' : 'Enviados pela engenharia.') + '</p>'
      + '<div class="eg-anxs">' + ANEXOS.map(bloco).join('') + '</div></div>';
  }
  const ANX_TIPOS = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
  async function anxArquivos(pid, slot, files) {
    const p = (E.projetos || []).find((x) => x.id === pid);
    const lista = Array.from(files || []);
    if (!p || !lista.length || !central()) return;
    if (!p.cliente_id) { toast('Projeto sem cliente vinculado.'); return; }
    E.anxEnviando = pid + ':' + slot;
    pintarDrawer();
    const nomes = [];
    for (const f of lista) {
      try {
        const mime = f.type || (/\.pdf$/i.test(f.name) ? 'application/pdf' : '');
        if (!ANX_TIPOS.includes(mime)) throw new Error('"' + f.name + '": use PDF ou imagem (JPG, PNG).');
        if (f.size > 20 * 1024 * 1024) throw new Error('"' + f.name + '" passa de 20 MB.');
        const ext = (String(f.name).match(/\.([a-z0-9]{2,5})$/i) || [, mime === 'application/pdf' ? 'pdf' : mime.split('/')[1]])[1].toLowerCase();
        const base = String(f.name || 'arquivo').replace(/\.[^.]+$/, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).toLowerCase() || 'arquivo';
        const path = 'franquias/' + p.franquia_id + '/clientes/' + p.cliente_id + '/engenharia/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '-' + base + '.' + ext;
        const up = await sb().storage.from('crm-arquivos').upload(path, f, { contentType: mime });
        if (up.error) throw up.error;
        const { error } = await sb().from('cliente_arquivos').insert([{ cliente_id: p.cliente_id, franquia_id: p.franquia_id, tipo: 'engenharia', slot, storage_path: path, nome_original: f.name || null, mime, tamanho_bytes: f.size, uploaded_by_nome: (state.profile && state.profile.nome) || (state.currentUser && state.currentUser.email) || null }]);
        if (error) { try { await sb().storage.from('crm-arquivos').remove([path]); } catch (_) { /* sem limpeza */ } throw error; }
        nomes.push(f.name);
      } catch (e) { console.error('[eng] anexo', e); toast(e.message || 'Falha ao anexar ' + f.name); }
    }
    E.anxEnviando = null;
    if (nomes.length) {
      const nome = (ANEXOS.find(([k]) => k === slot) || [, 'Anexo'])[1];
      try { await rpc('eng_comentar', { p_id: pid, p_texto: 'Anexado: ' + nome + ' · ' + nomes.join(', '), p_interno: false }); await carregarEventos(pid); } catch (_) { /* o anexo já foi */ }
      toast(nomes.length === 1 ? nome + ' anexado' : nomes.length + ' arquivos anexados');
    }
    (E.docsNovos = E.docsNovos || {})[pid] = undefined;
    await assinarDocs(p);
    pintarDrawer();
  }
  function anxDrop(ev, pid, slot) {
    ev.preventDefault();
    ev.currentTarget.classList.remove('drag');
    anxArquivos(pid, slot, ev.dataTransfer && ev.dataTransfer.files);
  }
  function anxColar(ev, pid, slot) {
    const its = Array.from((ev.clipboardData && ev.clipboardData.items) || []).filter((i) => i.kind === 'file');
    if (!its.length) return;
    ev.preventDefault();
    const hoje = new Date().toISOString().slice(0, 10);
    const files = its.map((i, n) => { const f = i.getAsFile(); const ext = (f.type.split('/')[1] || 'png').replace('jpeg', 'jpg'); return new File([f], 'print-' + slot.replace('_', '-') + '-' + hoje + (n ? '-' + (n + 1) : '') + '.' + ext, { type: f.type }); });
    anxArquivos(pid, slot, files);
  }
  async function anxExcluir(pid, id) {
    const p = (E.projetos || []).find((x) => x.id === pid);
    const a = p && anexosProjeto(p).find((x) => x.id === id);
    if (!a || !confirm('Excluir "' + (a.nome || 'arquivo') + '"?')) return;
    const { data, error } = await sb().from('cliente_arquivos').delete().eq('id', id).select('id');
    if (error || !data || !data.length) { toast('Não foi possível excluir.'); return; }
    try { await sb().storage.from('crm-arquivos').remove([a.storage_path]); } catch (_) { /* objeto fica órfão */ }
    try { await rpc('eng_comentar', { p_id: pid, p_texto: 'Anexo excluído: ' + a.rotulo + ' · ' + (a.nome || ''), p_interno: true }); await carregarEventos(pid); } catch (_) { /* segue */ }
    (E.docsNovos = E.docsNovos || {})[pid] = undefined;
    await assinarDocs(p);
    pintarDrawer();
  }

  function abaConc(p) {
    const eng = central();
    const dis = eng ? '' : 'disabled';
    const comp = p.compensacao;
    const ucsTxt = comp && Array.isArray(comp.ucs) ? comp.ucs.map((u) => `${u.uc}${u.pct ? ' (' + u.pct + '%)' : ''}`).join('; ') : '';
    return `<div class="rd-card rd-mb"><h3>${ic('landmark')}Concessionária</h3><p class="rd-sub">${eng ? 'Preencha conforme o andamento.' : 'Preenchido pela engenharia.'}</p>
      <div class="rd-fgrid" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr))">
        <div class="rd-fld"><label>Concessionária</label><input id="eg-c-conc" ${dis} value="${esc(p.concessionaria || '')}"></div>
        <div class="rd-fld"><label>UC (nº da instalação)</label><input id="eg-c-uc" ${dis} value="${esc(p.uc || '')}"></div>
        <div class="rd-fld"><label>Nº do protocolo</label><input id="eg-c-prot" ${dis} value="${esc(p.protocolo || '')}"></div>
        <div class="rd-fld"><label>Data do protocolo</label><input id="eg-c-protem" type="date" ${dis} value="${esc(p.protocolo_em || '')}"></div>
        <div class="rd-fld"><label>Data do parecer</label><input id="eg-c-par" type="date" ${dis} value="${esc(p.parecer_em || '')}"></div>
        <div class="rd-fld"><label>Vistoria / troca do medidor</label><input id="eg-c-vis" type="date" ${dis} value="${esc(p.vistoria_em || '')}"></div>
      </div>
      ${eng ? `<div class="rd-err" id="eg-err"></div><div class="rd-mfoot"><button class="rd-btn pri" id="eg-c-salvar" onclick="EV.salvarConc('${p.id}')">${ic('check')}Salvar</button></div>` : ''}</div>
    ${anexosHTML(p)}
    <div class="rd-card"><div class="rd-ch"><div><h3>${ic('zap')}Compensação</h3><p class="rd-sub">Quando o cliente quer compensar créditos em outras UCs depois do projeto enviado</p></div>${compPill(p)}</div>
      ${comp ? `<div class="rd-line"><div class="nm">UCs beneficiárias</div><div class="val" style="white-space:normal;text-align:right">${esc(ucsTxt || '—')}</div></div>${comp.obs ? `<div class="rd-line"><div class="nm">Observação</div><div class="val" style="white-space:normal">${esc(comp.obs)}</div></div>` : ''}` : '<div class="rd-muted">Sem compensação.</div>'}
      ${eng ? `<div class="rd-mfoot">${comp && comp.status !== 'feita' ? `<button class="rd-btn" onclick="EV.compFeita('${p.id}')">${ic('check')}Marcar como feita</button>` : ''}${comp ? `<button class="rd-btn ghost danger" onclick="EV.compRemover('${p.id}')">Remover</button>` : ''}<button class="rd-btn ${comp ? '' : 'pri'}" onclick="EV.compModal('${p.id}')">${ic(comp ? 'pencil' : 'plus')}${comp ? 'Editar' : 'Solicitar compensação'}</button></div>` : ''}
    </div>`;
  }

  function abaOS(p) {
    const lista = E.os[p.id] || [];
    const at = lista.find((o) => o.ativa) || lista[0];
    const eng = central();
    if (!at) return `<div class="rd-card rd-empty"><div class="ic">${ic('clipboard-list')}</div><b>A OS ainda não foi gerada</b>Ela sai automaticamente quando a validação é aprovada.${eng && NIVEL[p.status] >= 1 ? `<br><br><button class="rd-btn pri" onclick="EV.gerarOS('${p.id}')">${ic('file-plus')}Gerar OS agora</button>` : ''}</div>`;
    return `<div class="rd-card rd-mb"><div class="rd-ch"><div><h3>${ic('clipboard-list')}${esc(at.numero)}${at.revisao > 1 ? ` · revisão ${at.revisao}` : ''}</h3><p class="rd-sub">Emitida em ${dataHora(at.created_at)} por ${esc(at.created_by_nome || '—')}</p></div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
        ${eng ? `<label class="rd-sel" style="height:34px">${ic('users')}<input id="eg-os-eq" placeholder="Equipe" value="${esc(at.equipe || '')}" style="width:150px"></label><button class="rd-btn sm" onclick="EV.gerarOS('${p.id}', true)" title="Gera uma nova revisão com os dados atuais do projeto">${ic('refresh-cw')}Nova revisão</button>` : ''}
        <button class="rd-btn sm pri" onclick="EV.imprimirOS('${at.id}')">${ic('printer')}Abrir / imprimir</button></div></div>
      ${eng ? '<p class="rd-tip">' + ic('info') + 'Mudou o kit, o arranjo ou a equipe? Gere uma nova revisão: a anterior fica guardada.</p>' : ''}</div>
      ${lista.length > 1 ? `<div class="rd-card"><h3>${ic('history')}Revisões</h3>${lista.map((o) => `<div class="rd-line"><div class="nm"><b>${esc(o.numero)}</b> rev. ${o.revisao} ${o.ativa ? pill('vigente', 'ok') : pill('substituída', 'gray')}</div><div class="val"><button class="rd-btn sm ghost" onclick="EV.imprimirOS('${o.id}')">${ic('eye')}Ver</button></div></div>`).join('')}</div>` : ''}`;
  }

  const EV_ICON = { envio: 'send', status: 'git-commit-horizontal', comentario: 'message-square', dimensionamento: 'zap', os: 'clipboard-list', alerta: 'triangle-alert', edicao: 'pencil', compensacao: 'zap' };
  // cor do evento na timeline: status pela cor do destino; OS roxo; alerta e compensação laranja; comentário e edição neutros
  function tomEvento(e) {
    if (e.tipo === 'status' || e.tipo === 'envio') { const t = e.para_status === 'cancelado' ? 'gray' : ((ST[e.para_status] || {}).tone || 'info'); return { t, i: t === 'bad' ? 'circle-x' : t === 'ok' ? 'circle-check' : e.tipo === 'envio' ? 'send' : 'git-commit-horizontal' }; }
    if (e.tipo === 'dimensionamento') { const ruim = /revis|não|nao|falh|erro/i.test(e.texto || ''); return { t: ruim ? 'bad' : 'ok', i: 'zap' }; }
    if (e.tipo === 'os') return { t: 'os', i: 'clipboard-list' };
    if (e.tipo === 'alerta') return { t: 'at', i: 'triangle-alert' };
    if (e.tipo === 'compensacao') return { t: 'at', i: 'zap' };
    return { t: 'gray', i: EV_ICON[e.tipo] || 'dot' };
  }
  function abaTL(p) {
    const ev = [...(E.ev[p.id] || [])].reverse();
    const eng = central();
    const txt = (e) => {
      if (e.tipo === 'status' || e.tipo === 'envio') return `<b>${e.de_status ? esc((ST[e.de_status] || {}).n || e.de_status) + ' → ' : ''}${esc((ST[e.para_status] || {}).n || e.para_status || '')}</b>${e.texto && e.tipo !== 'envio' ? `<div>${esc(e.texto)}</div>` : e.tipo === 'envio' ? '<div>Enviado à engenharia</div>' : ''}`;
      return `<b>${esc(e.texto || '')}</b>`;
    };
    const arqs = (e) => (e.meta && Array.isArray(e.meta.docs) && e.meta.docs.length ? `<div class="eg-tlarq">${e.meta.docs.map((d) => `<span>${ic('file-x')}${esc(d.rotulo)}</span>`).join('')}</div>` : '');
    return `<div class="rd-card"><h3>${ic('history')}Timeline</h3><p class="rd-sub">Ninguém edita nem apaga. ${eng ? 'Comentário interno não aparece para a franquia.' : ''}</p>
      <div class="eg-com">
        <textarea id="eg-com" rows="2" placeholder="Escreva um comentário"></textarea>
        <div style="display:flex;gap:8px;align-items:center;justify-content:flex-end;margin-top:6px">${eng ? '<label class="rd-check"><input type="checkbox" id="eg-com-int">Interno</label>' : ''}<button class="rd-btn sm pri" id="eg-com-btn" onclick="EV.comentar('${p.id}')">${ic('send')}Comentar</button></div>
      </div>
      <div class="eg-tl">${ev.map((e) => `<div class="${e.tipo === 'alerta' ? 'al' : ''} ${tomEvento(e).t === 'bad' ? 'rb' : ''} ${e.interno ? 'int' : ''}"><span class="eg-tli t-${tomEvento(e).t}">${ic(tomEvento(e).i)}</span><div>${txt(e)}${arqs(e)}<div class="rd-muted">${esc(e.autor_nome || '')} · ${dataHora(e.created_at)}${e.interno ? ' · interno' : ''}</div></div></div>`).join('') || '<div class="rd-muted">Sem eventos.</div>'}</div></div>`;
  }

  // ------------------------------------------------------------ ações
  async function mudar(id, status, motivo, docs) {
    const p = (E.projetos || []).find((x) => x.id === id);
    if (!p) return;
    E.mudarDocs = docs && docs.length ? docs : null;
    const exige = ['validacao_reprovada', 'projeto_reprovado', 'cancelado'].includes(status);
    const s = ST[status];
    modal(`<h3>${status === 'cancelado' ? 'Cancelar projeto' : 'Mover para ' + esc(s.n)}</h3><p class="rd-sub">${esc(p.cliente_nome || '')} · ${pnum(p)}</p>
      ${status === 'validacao_aprovada' ? `<div class="rd-note">${ic('clipboard-list')}<span>A OS é gerada automaticamente.${p.dim_status !== 'ok' ? ' <b>O dimensionamento automático não passou</b>: aprove só se conferiu na calculadora.' : ''}</span></div>` : ''}
      ${status === 'validacao_reprovada' ? `<div class="rd-note">${ic('info')}<span>Volta para a franquia corrigir. O motivo aparece para o gestor.</span></div>` : ''}
      <div class="rd-fld"><label>${exige ? 'Motivo (obrigatório)' : 'Observação (opcional)'}</label><input id="eg-mot" placeholder="${exige ? 'Ex.: conta de luz ilegível' : ''}" value="${esc(motivo || '')}"></div>
      ${status === 'projeto_enviado' ? `<div class="rd-fgrid"><div class="rd-fld"><label>Nº do protocolo</label><input id="eg-mot-prot" value="${esc(p.protocolo || '')}"></div><div class="rd-fld"><label>Data do protocolo</label><input id="eg-mot-dt" type="date" value="${esc(p.protocolo_em || new Date().toISOString().slice(0, 10))}"></div></div>` : ''}
      <div class="rd-err" id="eg-err"></div>
      <div class="rd-mfoot"><button class="rd-btn" onclick="EV.fecharModal()">Voltar</button><button class="rd-btn ${exige ? 'danger' : 'pri'}" id="eg-mot-ok" onclick="EV.confirmarMudar('${id}','${status}')">${ic('check')}Confirmar</button></div>`);
    setTimeout(() => { const i = document.getElementById('eg-mot'); if (i) i.focus(); }, 30);
  }
  async function confirmarMudar(id, status) {
    const texto = val('eg-mot');
    if (['validacao_reprovada', 'projeto_reprovado', 'cancelado'].includes(status) && texto.length < 3) { erro('Escreva o motivo.'); return; }
    await ocupado('eg-mot-ok', async () => {
      try {
        if (status === 'projeto_enviado' && (val('eg-mot-prot') || val('eg-mot-dt'))) await rpc('eng_atualizar', { p_id: id, p_campos: { protocolo: val('eg-mot-prot'), protocolo_em: val('eg-mot-dt') } });
        await rpcDocs('eng_mudar_status', { p_id: id, p_status: status, p_texto: texto || null }, E.mudarDocs);
        if (E.mudarDocs) { E.prob = {}; E.mudarDocs = null; }
        fecharModal();
        toast(status === 'validacao_aprovada' ? 'Validação aprovada · OS gerada' : 'Status: ' + (ST[status] || {}).n);
        await recarregarProjeto(id);
        if (status === 'validacao_aprovada') { E.ptab = 'os'; E.osLista = null; }
        if (status === 'cancelado') fechar();
        pintar();
      } catch (e) { erro(e.message); }
    });
  }
  async function assumir(id) {
    try { await rpc('eng_atualizar', { p_id: id, p_campos: { responsavel: true } }); await recarregarProjeto(id); pintar(); toast('Projeto assumido'); } catch (e) { toast(e.message); }
  }
  async function reenviar(id) {
    const t = val('eg-reenv');
    if (t.length < 3) { erro('Escreva o que foi corrigido.'); return; }
    await ocupado('eg-reenv-btn', async () => {
      try { await rpc('eng_reenviar_validacao', { p_id: id, p_texto: t }); toast('Reenviado à engenharia'); await recarregarProjeto(id); pintar(); } catch (e) { erro(e.message); }
    });
  }
  async function comentar(id) {
    const t = val('eg-com');
    if (!t) return;
    const int = !!(document.getElementById('eg-com-int') || {}).checked;
    await ocupado('eg-com-btn', async () => {
      try { await rpc('eng_comentar', { p_id: id, p_texto: t, p_interno: int }); await carregarEventos(id); pintarDrawer(); } catch (e) { toast(e.message); }
    });
  }
  async function salvarConc(id) {
    const campos = { concessionaria: val('eg-c-conc'), uc: val('eg-c-uc'), protocolo: val('eg-c-prot'), protocolo_em: val('eg-c-protem'), parecer_em: val('eg-c-par'), vistoria_em: val('eg-c-vis') };
    await ocupado('eg-c-salvar', async () => {
      try { await rpc('eng_atualizar', { p_id: id, p_campos: campos }); toast('Salvo'); await recarregarProjeto(id); pintar(); } catch (e) { erro(e.message); }
    });
  }
  function compModal(id) {
    const p = (E.projetos || []).find((x) => x.id === id);
    const c = (p && p.compensacao) || {};
    const ucs = Array.isArray(c.ucs) ? c.ucs.map((u) => `${u.uc}${u.pct ? ' ' + u.pct : ''}`).join('\n') : '';
    modal(`<h3>Compensação</h3><p class="rd-sub">Uma UC por linha, com o % ao lado (ex.: 0012345678 40)</p>
      <div class="rd-fld"><label>UCs beneficiárias</label><textarea id="eg-cp-ucs" rows="4" style="border:1px solid var(--v2-line-strong);border-radius:12px;padding:10px;font:inherit">${esc(ucs)}</textarea></div>
      <div class="rd-fld" style="margin-top:10px"><label>Observação</label><input id="eg-cp-obs" value="${esc(c.obs || '')}"></div>
      <div class="rd-err" id="eg-err"></div>
      <div class="rd-mfoot"><button class="rd-btn" onclick="EV.fecharModal()">Cancelar</button><button class="rd-btn pri" id="eg-cp-ok" onclick="EV.salvarComp('${id}')">${ic('check')}Salvar</button></div>`);
  }
  async function salvarComp(id, extra) {
    const p = (E.projetos || []).find((x) => x.id === id);
    let comp;
    if (extra === 'remover') comp = null;
    else if (extra === 'feita') comp = { ...(p.compensacao || {}), status: 'feita', feita_em: new Date().toISOString() };
    else {
      const ucs = val('eg-cp-ucs').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const m = l.match(/^(.*?)\s+(\d+(?:[.,]\d+)?)\s*%?$/); return m ? { uc: m[1].trim(), pct: Number(m[2].replace(',', '.')) } : { uc: l, pct: null }; });
      if (!ucs.length) { erro('Informe pelo menos uma UC.'); return; }
      comp = { status: 'pendente', ucs, obs: val('eg-cp-obs') || null, pedida_em: (p.compensacao && p.compensacao.pedida_em) || new Date().toISOString() };
    }
    try { await rpc('eng_atualizar', { p_id: id, p_campos: { compensacao: comp } }); fecharModal(); await recarregarProjeto(id); pintar(); toast('Compensação atualizada'); } catch (e) { erro(e.message); toast(e.message); }
  }
  async function gerarOS(id, revisao) {
    if (revisao && !confirm('Gerar uma nova revisão da OS com os dados atuais do projeto? A anterior fica guardada.')) return;
    try {
      const num = await rpc('eng_gerar_os', { p_id: id, p_equipe: val('eg-os-eq') || null });
      toast((revisao ? 'Nova revisão: ' : 'OS gerada: ') + num);
      E.osLista = null;
      await recarregarProjeto(id);
      E.ptab = 'os';
      pintar();
    } catch (e) { toast(e.message); }
  }
  async function recalcular(id) {
    const p = (E.projetos || []).find((x) => x.id === id);
    if (!p) return;
    try {
      await carregarCatalogo(true);
      // o projeto guarda o equipamento do envio; atualiza a ficha com a do catálogo atual
      const sn = JSON.parse(JSON.stringify(p.snapshot || {}));
      ['modulo', 'inversor'].forEach((k) => {
        if (!sn[k]) return;
        const c = E.catalogo.find((x) => x.id === sn[k].id);
        if (c) Object.assign(sn[k], { ficha: c.ficha, ficha_conferida: c.ficha_conferida, nome: c.nome, marca: c.marca });
      });
      if (!sn.modulo && sn.kit) {
        const k = (E.kits || []).find((x) => x.id === sn.kit.id);
        if (k && kitLigado(k)) {
          const cm = E.catalogo.find((x) => x.id === k.modulo_id), ci = E.catalogo.find((x) => x.id === k.inversor_id);
          if (cm && ci) {
            sn.modulo = { id: cm.id, tipo: cm.tipo, nome: cm.nome, marca: cm.marca, potencia_wp: cm.potencia_wp, qtd: k.modulo_qtd, ficha: cm.ficha, ficha_conferida: cm.ficha_conferida };
            sn.inversor = { id: ci.id, tipo: ci.tipo, nome: ci.nome, marca: ci.marca, potencia_wp: ci.potencia_wp, qtd: k.inversor_qtd, ficha: ci.ficha, ficha_conferida: ci.ficha_conferida };
          }
        }
      }
      const d = dimensionar({ ...p, snapshot: sn });
      d.equipamentos = { modulo: sn.modulo || null, inversor: sn.inversor || null };
      await rpc('eng_salvar_dim', { p_id: id, p_dim: d, p_status: d.status, p_motivo: d.status === 'ok' ? null : d.motivo });
      await recarregarProjeto(id);
      // o snapshot do projeto não muda (é o retrato do envio); o resultado guarda os equipamentos usados
      pintar();
      toast(d.status === 'ok' ? 'Recalculado: tudo ok' : 'Recalculado: precisa revisão');
    } catch (e) { toast(e.message); }
  }

  // "Ajustar na calculadora": abre o projeto na calculadora nova.
  function calculadora(id) {
    calcAbrirProjeto(id);
    fechar();
    if (typeof setTab === 'function') setTab('calculadora');
  }

  // ------------------------------------------------------------ impressão da OS
  const LOGO_SVG = '<svg viewBox="0 0 620 425" aria-hidden="true"><path fill="#008FD4" d="M162 0H345Q375 0 388 24L620 425H435Q405 425 392 402L310 258L336 213H285Z"/><path fill="#FAA519" d="M150 213H285L310 258L228 402Q215 425 186 425H0L107 238Q121 213 150 213Z"/></svg>';
  async function imprimirOS(osId) {
    let os = null;
    Object.values(E.os).some((l) => (os = l.find((o) => o.id === osId)));
    if (!os) { const { data } = await sb().from('eng_os').select('*').eq('id', osId).maybeSingle(); os = data; }
    if (!os) { toast('OS não encontrada.'); return; }
    const w = window.open('', '_blank');
    if (!w) { toast('O navegador bloqueou a janela. Libere pop-ups para a plataforma.'); return; }
    w.document.write(htmlOS(os));
    w.document.close();
  }

  function htmlOS(os) {
    const D = os.dados || {}, sn = D.snapshot || {}, c = sn.cliente || {}, inst = sn.instalacao || {}, d = D.dim || {};
    const mod = (d.equipamentos && d.equipamentos.modulo) || sn.modulo, inv = (d.equipamentos && d.equipamentos.inversor) || sn.inversor;
    const e = (s) => esc(s == null || s === '' ? '—' : s);
    const fm = (mod && mod.ficha) || {}, fi = (inv && inv.ficha) || {};
    const micro = ehMicro(inv);
    const rev = os.revisao > 1 ? ` · Revisão ${os.revisao}` : '';
    const dist = d.distribution || [];
    const vocFrio = num(d.vocCorrected);
    const strings = dist.map((m, i) => m.numStrings ? `<div class="mp"><div class="t"><span>MPPT ${i + 1}</span><span>${m.numStrings} string(s)</span></div>${Array.from({ length: m.numStrings }, () => `<div class="mods">${'<i></i>'.repeat(m.modulesPerString)}</div>`).join('')}<div>${m.modulesPerString} módulos em série · Voc no frio <b>${nf(vocFrio * m.modulesPerString, 1)} V</b> · Vmp <b>${nf(num(fm.vmp) * m.modulesPerString, 1)} V</b></div></div>` : '').join('');
    const arranjo = micro && d.micro
      ? `<div>${d.micro.qtd} microinversores × ${d.micro.porMicro} módulos${mod && mod.qtd % d.micro.porMicro ? ` (o último com ${mod.qtd % d.micro.porMicro})` : ''}</div>`
      : (strings ? `<div class="mppt">${strings}</div>${d.inversores > 1 ? `<div class="src">Arranjo igual em cada um dos ${d.inversores} inversores.</div>` : ''}` : '<div class="note">Arranjo não calculado. Ver o projeto na plataforma.</div>');
    const checks = (d.checks || []).map((k) => `<tr><td>${esc(k.nome)}</td><td>${esc(k.calc)}</td><td class="n">${esc(k.limite)}</td><td class="n ${k.ok ? 'ok' : 'bad'}">${esc(k.valor === 'ok' ? '' : k.valor)} ${k.ok ? '✓' : '✗'}</td></tr>`).join('');
    const pr = d.protecoes;
    const fotos = (sn.docs || []).filter((a) => ['foto_padrao', 'foto_disjuntor', 'foto_fachada', 'foto_medidor'].includes(a.tipo));
    const strTxt = dist.filter((m) => m.numStrings).map((m, i) => ({ i, m }));
    const medicoes = micro ? '' : `<h2>Medições</h2><table><thead><tr><th>String</th><th style="width:22%">Voc medido (V)</th><th style="width:22%">Esperado (25 °C)</th><th style="width:16%">Polaridade</th></tr></thead><tbody>
      ${dist.map((m, i) => m.numStrings ? Array.from({ length: m.numStrings }, (_, j) => `<tr><td>MPPT ${i + 1}${m.numStrings > 1 ? ' · string ' + (j + 1) : ''} · ${m.modulesPerString} módulos</td><td><div class="line"></div></td><td>${nf(num(fm.voc) * m.modulesPerString, 1)} V</td><td><span class="sq"></span> ok</td></tr>`).join('') : '').join('')}</tbody></table>`;
    void strTxt;
    const logo = `<div class="logo">${LOGO_SVG}<span><b style="color:#008FD4">Ágil</b><b style="color:#FAA519">Solar</b></span></div>`;
    const endereco = [c.endereco, c.numero, c.complemento, c.bairro, [c.cidade, c.uf].filter(Boolean).join(' - '), c.cep].filter(Boolean).join(' · ');
    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(os.numero)}${rev} · ${esc(c.nome || '')}</title>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
:root{--blue:#008FD4;--orange:#FAA519;--ink:#0F1B26;--ink2:#4A5561;--gray:#808284;--line:#D9E0E6;--soft:#F4F7FA}
*{box-sizing:border-box}body{margin:0;background:#DDE3E9;font-family:'Plus Jakarta Sans',system-ui,sans-serif;color:var(--ink);font-size:10.5px;line-height:1.45}
.bar{position:sticky;top:0;z-index:5;background:#0F1B26;color:#fff;padding:10px 18px;display:flex;gap:12px;align-items:center;font-size:13px}.bar button{margin-left:auto;background:var(--orange);color:#3D2600;border:0;border-radius:10px;padding:8px 14px;font:inherit;font-weight:800;cursor:pointer}
.page{width:210mm;min-height:297mm;margin:18px auto;background:#fff;padding:13mm 14mm 12mm;box-shadow:0 8px 30px rgba(15,27,38,.15);display:flex;flex-direction:column}
.hd{display:flex;align-items:center;gap:14px;padding-bottom:10px;border-bottom:3px solid var(--blue)}
.logo{display:flex;align-items:center;gap:8px}.logo svg{height:34px;width:auto}.logo span{font-size:21px;letter-spacing:-.02em;display:flex;gap:4px}.logo b{font-weight:800}
.ttl{flex:1;text-align:center}.ttl h1{margin:0;font-size:14px;font-weight:800;letter-spacing:.02em;text-transform:uppercase}.ttl p{margin:2px 0 0;color:var(--ink2);font-size:10px}
.num{text-align:right}.num b{display:block;font-size:17px;font-weight:800;color:var(--blue)}.num span{display:block;color:var(--ink2);font-size:9.5px}
.meta{display:flex;gap:8px;margin:9px 0 2px;flex-wrap:wrap}.tag{display:inline-flex;font-weight:700;font-size:9.5px;padding:3px 9px;border-radius:999px;background:var(--soft);color:var(--ink2);border:1px solid var(--line)}
.tag.ok{background:rgba(31,169,113,.12);color:#12704A;border-color:rgba(31,169,113,.3)}.tag.bad{background:rgba(209,67,67,.1);color:#9B2C2C;border-color:rgba(209,67,67,.3)}
h2{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.09em;color:var(--blue);margin:13px 0 6px;display:flex;align-items:center;gap:8px}h2::after{content:"";flex:1;height:1px;background:var(--line)}
h2 em{font-style:normal;background:var(--blue);color:#fff;border-radius:4px;padding:1px 6px;font-size:9px;letter-spacing:.04em}
.gr{display:grid;gap:5px 14px}.g3{grid-template-columns:repeat(3,1fr)}.g4{grid-template-columns:repeat(4,1fr)}.g2{grid-template-columns:1fr 1fr}
.f span{display:block;font-size:8.5px;font-weight:700;color:var(--gray);text-transform:uppercase;letter-spacing:.06em}.f b{font-weight:700;font-size:10.5px}
.box{border:1px solid var(--line);border-radius:8px;padding:8px 10px}
table{width:100%;border-collapse:collapse}th{text-align:left;font-size:8.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--gray);font-weight:700;padding:5px 7px;border-bottom:1.5px solid var(--ink)}
td{padding:5px 7px;border-bottom:1px solid var(--line);vertical-align:top}td.n{text-align:right;white-space:nowrap;font-weight:700}.ok{color:#12704A;font-weight:800}.bad{color:#B42318;font-weight:800}
.src{font-size:8.5px;color:var(--gray);font-weight:600;margin-top:3px}
.mppt{display:grid;grid-template-columns:1fr 1fr;gap:8px}.mp{border:1px dashed #9FB0BF;border-radius:8px;padding:7px 9px}.mp .t{font-size:8.5px;font-weight:800;text-transform:uppercase;letter-spacing:.07em;color:var(--gray);display:flex;justify-content:space-between}
.mods{display:flex;gap:3px;margin:6px 0 5px;flex-wrap:wrap}.mods i{width:15px;height:22px;border-radius:2px;background:#0B7FC0}
.chk{display:grid;grid-template-columns:1fr 1fr;gap:0 18px}.chk div{display:flex;gap:7px;align-items:flex-start;padding:5px 0;border-bottom:1px dashed var(--line)}
.sq{display:inline-block;width:11px;height:11px;border:1.5px solid var(--ink);border-radius:2px;flex-shrink:0;vertical-align:middle;margin-top:1px}
.ph{display:grid;grid-template-columns:repeat(4,1fr);gap:7px}.ph div{border:1px dashed var(--line);border-radius:7px;height:62px;display:flex;align-items:center;justify-content:center;font-size:8.5px;font-weight:700;color:var(--gray);text-align:center;padding:4px}
.sig{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:26px}.sig div{border-top:1px solid var(--ink);padding-top:4px;text-align:center;font-size:9px;color:var(--ink2)}.sig b{display:block;color:var(--ink);font-size:9.5px}
.line{border-bottom:1px solid #9FB0BF;height:17px}.note{background:#FEF4E3;border:1px solid #F6D9A5;border-radius:8px;padding:7px 10px;color:#6B4300;font-size:9.5px;margin-top:6px}
.ft{margin-top:auto;padding-top:8px;border-top:1px solid var(--line);display:flex;justify-content:space-between;font-size:8.5px;color:var(--gray)}
@media print{body{background:#fff}.bar{display:none}.page{margin:0;box-shadow:none;page-break-after:always}@page{size:A4;margin:0}}
</style></head><body>
<div class="bar"><b>${esc(os.numero)}${rev}</b> · ${esc(c.nome || '')}<button onclick="print()">Imprimir / salvar PDF</button></div>
<section class="page">
 <div class="hd">${logo}<div class="ttl"><h1>Ordem de serviço · instalação fotovoltaica</h1><p>Documento gerado pela Plataforma Ágil Solar</p></div>
  <div class="num"><b>${esc(os.numero)}</b><span>Emitida em ${dataHora(os.created_at)}</span><span>Projeto P-${String(D.projeto_numero || 0).padStart(4, '0')}${rev}</span></div></div>
 <div class="meta"><span class="tag ok">Validação aprovada</span>${d.checks ? `<span class="tag ${D.dim_status === 'ok' ? 'ok' : 'bad'}">${d.manual ? 'Dimensionamento do engenheiro' : 'Dimensionamento automático'} · ${(d.checks || []).filter((k) => k.ok).length}/${(d.checks || []).length} verificações ok</span>` : ''}<span class="tag">Franquia: ${e(sn.franquia_nome)}</span><span class="tag">Vendedor: ${e(c.vendedor_nome || c.vendedor_email)}</span>${os.equipe ? `<span class="tag">Equipe: ${esc(os.equipe)}</span>` : ''}</div>
 <h2>Cliente e local da instalação</h2>
 <div class="gr g4">
  <div class="f"><span>Cliente</span><b>${e(c.nome)}</b></div><div class="f"><span>CPF/CNPJ</span><b>${e(c.documento)}</b></div><div class="f"><span>Telefone</span><b>${e(c.telefone)}</b></div><div class="f"><span>Cidade</span><b>${e([c.cidade, c.uf].filter(Boolean).join(' - '))}</b></div>
  <div class="f" style="grid-column:span 2"><span>Endereço</span><b>${e(endereco)}</b></div><div class="f"><span>Concessionária</span><b>${e(D.concessionaria || inst.concessionaria)}</b></div><div class="f"><span>UC</span><b>${e(D.uc || inst.numero_instalacao)}</b></div>
  <div class="f"><span>Ligação</span><b>${e(LIG[inst.tipo_ligacao])}</b></div><div class="f"><span>Telhado</span><b>${e(inst.telhado)}</b></div><div class="f"><span>Distância módulos → inversor</span><b>${inst.distancia_m ? esc(inst.distancia_m) + ' m' : '—'}</b></div><div class="f"><span>Localização do padrão</span><b>${e(c.padrao_localizacao)}</b></div>
 </div>
 <h2>Equipamentos <em>do kit da venda</em></h2>
 <table><thead><tr><th style="width:44%">Item</th><th>Especificação</th><th style="text-align:right">Qtd</th></tr></thead><tbody>
  <tr><td><b>${e(mod && mod.nome)}</b><div class="src">${e(mod && mod.marca)}</div></td><td>${mod ? `${nf(fm.potencia)} Wp · Voc ${nf(fm.voc, 1)} V · Vmp ${nf(fm.vmp, 1)} V · Isc ${nf(fm.isc, 2)} A · Imp ${nf(fm.imp, 2)} A` : 'Ver projeto'}</td><td class="n">${mod ? mod.qtd + ' un' : '—'}</td></tr>
  <tr><td><b>${e(inv && inv.nome)}</b><div class="src">${e(inv && inv.marca)}${micro ? ' · microinversor' : ''}</div></td><td>${inv ? (micro ? `${nf(fi.potencia)} W · ${nf(fi.modulos_por_micro)} módulos por micro` : `${nf(fi.potencia)} W · ${nf(fi.mppts)} MPPT · ${nf(fi.v_max)} V máx · ${nf(fi.i_max_mppt, 1)} A/MPPT`) + ' · ' + esc((REDES_INV.find((x) => x[0] === fi.rede) || [, ''])[1]) : 'Ver projeto'}</td><td class="n">${inv ? inv.qtd + ' un' : '—'}</td></tr>
  <tr><td><b>Estrutura, cabos e conectores</b><div class="src">Vêm no kit do distribuidor</div></td><td>${e(sn.venda && sn.venda.kit_nome)} · conferir com a nota fiscal</td><td class="n">kit</td></tr>
 </tbody></table>
 <div class="gr g4" style="margin-top:8px">
  <div class="box f"><span>Potência CC</span><b style="font-size:14px">${nf(d.kwp || D.kwp, 2)} kWp</b></div><div class="box f"><span>Potência CA</span><b style="font-size:14px">${d.potCA ? nf(d.potCA / 1000, 2) + ' kW' : '—'}</b></div>
  <div class="box f"><span>Overload</span><b style="font-size:14px">${d.potCA ? nf(((d.kwp * 1000) / d.potCA - 1) * 100, 1) + ' %' : '—'}</b></div><div class="box f"><span>Geração estimada</span><b style="font-size:14px">${d.geracaoMedia ? nf(d.geracaoMedia) + ' kWh/mês' : '—'}</b></div>
 </div>
 <h2>Arranjo dos módulos <em>calculado</em></h2>${arranjo}
 ${checks ? `<h2>Verificações do dimensionamento</h2><table><thead><tr><th>Verificação</th><th>Cálculo</th><th style="text-align:right">Limite</th><th style="text-align:right">Resultado</th></tr></thead><tbody>${checks}</tbody></table>` : ''}
 ${pr ? `<h2>Cabos e proteções <em>sugerido</em></h2><table><thead><tr><th>Trecho</th><th>Cabo</th><th>Proteção</th></tr></thead><tbody>
  ${micro ? '' : `<tr><td>Strings → inversor (CC)</td><td>${CABO_CC} mm² solar, vermelho e preto</td><td>Chave seccionadora CC do inversor</td></tr>`}
  <tr><td>${micro ? 'Micros' : 'Inversor'} → quadro (CA)</td><td>${String(pr.cabo).replace('.', ',')} mm² · ${pr.condutores}</td><td>Disjuntor ${pr.polos} ${pr.disjuntor} A curva C${d.inversores > 1 ? ' (por inversor)' : ''} · DPS CA classe II</td></tr>
  <tr><td>Aterramento</td><td>6 mm² verde/amarelo</td><td>Estrutura e ${micro ? 'micros' : 'inversor'} ligados ao aterramento do padrão</td></tr></tbody></table>
  <div class="note">Cabos e proteções saem de uma regra simples (corrente nominal ${nf(pr.corrente, 1)} A × 1,25). Conferido pelo engenheiro na aprovação.</div>` : ''}
 <div class="ft"><span>${esc(os.numero)}${rev} · ${esc(c.nome || '')}</span><span>Página 1 de 2</span></div>
</section>
<section class="page">
 <div class="hd">${logo}<div class="ttl" style="text-align:left;margin-left:10px"><h1 style="font-size:12px">${esc(os.numero)} · execução</h1><p>${e(c.nome)} · ${e([c.cidade, c.uf].filter(Boolean).join(' - '))}</p></div><div class="num"><span>Equipe</span><b style="font-size:13px;color:var(--ink)">${e(os.equipe)}</b></div></div>
 <h2>Informações da vistoria <em>do Comercial</em></h2>
 <div class="ph">${['Padrão de entrada', 'Disjuntor', 'Fachada', 'Medidor'].map((l, i) => { const t = ['foto_padrao', 'foto_disjuntor', 'foto_fachada', 'foto_medidor'][i]; return `<div>${l}<br>${fotos.some((a) => a.tipo === t) ? 'foto na plataforma' : 'sem foto'}</div>`; }).join('')}</div>
 <div class="gr g2" style="margin-top:7px"><div class="f"><span>Localização do padrão</span><b>${e(c.padrao_localizacao)}</b></div><div class="f"><span>Observações</span><b>${e(inst.obs)}</b></div></div>
 <h2>Checklist da execução</h2>
 <div class="chk">${['Conferir o material com a nota fiscal', 'Estrutura fixada e vedada (sem telha quebrada)', micro ? 'Micros fixados conforme o arranjo' : 'Módulos montados conforme o arranjo', 'Conectores MC4 crimpados e testados', micro ? 'Tensão de cada módulo medida' : 'Polaridade e Voc de cada string medidos', micro ? 'Cabo tronco CA e terminação instalados' : 'Inversor fixado em local ventilado e à sombra', 'Disjuntor CA e DPS instalados no quadro', 'Aterramento ligado', 'Sistema ligado e gerando', 'Monitoramento (Wi-Fi) configurado com o cliente', 'Local limpo e sobras recolhidas', 'Cliente orientado sobre o app e o religamento'].map((x) => `<div><span class="sq"></span>${x}</div>`).join('')}</div>
 ${medicoes}
 <h2>Fotos obrigatórias</h2><div class="ph"><div>Módulos instalados</div><div>Estrutura / fixação</div><div>${micro ? 'Micros e etiquetas' : 'Inversor e etiqueta'}</div><div>Quadro com disjuntor e DPS</div></div>
 <h2>Ocorrências</h2><div class="line"></div><div class="line"></div><div class="line"></div>
 <div class="gr g3" style="margin-top:12px"><div class="f"><span>Data da execução</span><div class="line"></div></div><div class="f"><span>Início</span><div class="line"></div></div><div class="f"><span>Término</span><div class="line"></div></div></div>
 <div class="sig"><div><b>${e(D.responsavel_nome)}</b>Engenheiro responsável · CREA</div><div><b>Responsável pela equipe</b>Nome legível</div><div><b>${e(c.nome)}</b>Cliente · recebi o sistema funcionando</div></div>
 <div class="ft"><span>Gerada pela Plataforma Ágil Solar · alteração no projeto gera uma nova revisão desta OS</span><span>Página 2 de 2</span></div>
</section></body></html>`;
  }

  // ------------------------------------------------------------ ficha do cliente (Comercial)
  function projetosDoCliente(clienteId) { return (E.projetos || []).filter((p) => p.cliente_id === clienteId && p.status !== 'cancelado'); }

  function engFichaChip(client) {
    const p = state.engPorCliente && state.engPorCliente[client.id];
    if (!p) return '';
    const s = ST[p.status];
    return `<button class="v2-chip dot ${({ info: 't-blue', bad: 't-red', ok: 't-green', at: 't-orange' })[s.tone] || 't-gray'}" onclick="crmSet360Tab('engenharia')" title="Projeto na engenharia">Eng: ${esc(s.n)}</button>`;
  }

  // selo pequeno no card do funil / lista de clientes do Comercial
  function engSeloCard(client) {
    const p = client && state.engPorCliente && state.engPorCliente[client.id];
    if (!p) return '';
    const s = ST[p.status];
    return `<span class="v2-chip v2-vischip ${({ info: 't-blue', bad: 't-red', ok: 't-green', at: 't-orange' })[s.tone] || 't-gray'}" title="Engenharia: ${esc(s.n)} há ${dias(p.status_desde)} dia(s)">${ic('ruler')}${esc(s.n)}</span>`;
  }

  function renderEngFichaTab(client) {
    if (!E.projetos) {
      carregarProjetos().then(() => { if (typeof _crm360Tab !== 'undefined' && _crm360Tab === 'engenharia' && typeof renderCrm360 === 'function') renderCrm360(); }).catch((e) => console.warn('[eng] ficha', e));
      return `<div class="rd eg"><div class="rd-loading">${ic('loader-2')}Carregando...</div></div>`;
    }
    const ps = projetosDoCliente(client.id);
    const vendas = (typeof _crm360ClientRows === 'function' ? _crm360ClientRows().vendas : []) || [];
    const enviadas = new Set(ps.map((p) => p.venda_id));
    const livres = vendas.filter((v) => !enviadas.has(v.id));
    const pode = podeEnviar();
    return `<div class="rd eg">
      ${ps.map((p) => `<div class="rd-card rd-mb eg-fproj" onclick="EV.abrir('${p.id}')"><div class="rd-ch"><div><b>${pnum(p)} · ${esc(kitCurto(p))}</b><div class="rd-muted">Enviado em ${dataBR(p.created_at)} por ${esc(p.enviado_por_nome || '—')} · ${dias(p.status_desde)} dia(s) neste status</div></div><div style="display:flex;gap:6px;flex-wrap:wrap">${stPill(p)}${compPill(p)}</div></div>
        ${p.status === 'validacao_reprovada' ? `<div class="rd-tip" style="color:var(--v2-red)">${ic('undo-2')}A engenharia devolveu este projeto. Abra para ver o motivo e reenviar.</div>` : ''}
        <div class="eg-steps mini">${LINHA.map((sid) => { const n = NIVEL[sid], nv = NIVEL[p.status]; return `<div class="${n < nv ? 'done' : n === nv ? (ST[p.status].tone === 'bad' ? 'bad' : 'cur') : ''}"><i></i></div>`; }).join('')}</div></div>`).join('')}
      ${livres.length ? `<div class="rd-card"><h3>${ic('send')}Enviar à engenharia</h3><p class="rd-sub">${livres.length} venda(s) ainda não enviada(s).</p>
          ${pode ? `<button class="rd-btn pri" onclick="EV.envioModal('${client.id}')">${ic('send')}Enviar à engenharia</button>` : '<div class="rd-muted">Quem envia é o gestor da franquia.</div>'}</div>`
        : ps.length ? '' : `<div class="rd-card rd-empty"><div class="ic">${ic('ruler')}</div><b>Nada na engenharia</b>Registre a venda e anexe os documentos (aba Arquivos) para enviar o projeto.</div>`}
    </div>`;
  }

  async function envioModal(clienteId) {
    const client = (state.clientes || []).find((c) => c.id === clienteId);
    const vendas = ((typeof _crm360ClientRows === 'function' ? _crm360ClientRows().vendas : []) || []).filter((v) => !projetosDoCliente(clienteId).some((p) => p.venda_id === v.id));
    if (!client || !vendas.length) return;
    modal(`<div class="rd-loading">${ic('loader-2')}Conferindo documentos e kit...</div>`);
    let falta = [];
    let nArquivos = 0;
    let kits = [];
    try {
      falta = (await rpc('eng_docs_faltando', { p_cliente: clienteId })) || [];
      const cnt = await sb().from('cliente_arquivos').select('id', { count: 'exact', head: true }).eq('cliente_id', clienteId);
      nArquivos = cnt.count || 0;
      const nomes = [...new Set(vendas.map((v) => v.kit_nome).filter(Boolean))];
      const props = vendas.map((v) => v.proposta_id).filter(Boolean);
      const [kp, pp] = await Promise.all([
        nomes.length ? sb().from('produtos').select('id, name, modulo_id, inversor_id, modulo_qtd, inversor_qtd').in('name', nomes) : { data: [] },
        props.length ? sb().from('propostas').select('id, source_product_id').in('id', props) : { data: [] },
      ]);
      kits = kp.data || [];
      const extras = (pp.data || []).map((x) => x.source_product_id).filter((id) => id && !kits.some((k) => k.id === id));
      if (extras.length) { const r = await sb().from('produtos').select('id, name, modulo_id, inversor_id, modulo_qtd, inversor_qtd').in('id', extras); kits = kits.concat(r.data || []); }
      E._propKit = Object.fromEntries((pp.data || []).map((x) => [x.id, x.source_product_id]));
    } catch (e) { console.warn('[eng] conferência do envio', e); }
    E._envio = { clienteId, kits, vendas };
    const inst = (client.documentos_dados && client.documentos_dados.instalacao) || {};
    const ok = !falta.length;
    const pode = nArquivos > 0; // só barra quando não há nenhum arquivo
    modal(`<h3>Enviar à engenharia</h3><p class="rd-sub">${esc(client.nome)}</p>
      <div class="eg-conf">
        <div class="${ok ? 'ok' : pode ? 'at' : 'bad'}">${ic(ok ? 'check' : pode ? 'triangle-alert' : 'x')}<div><b>Documentos</b><span>${ok ? 'Todos os obrigatórios anexados'
          : pode ? `Faltam: ${esc(falta.join(', '))}. Dá para enviar: a engenharia recebe o aviso e pode devolver pedindo o que falta.`
          : 'Nenhum documento anexado. Anexe na aba Arquivos antes de enviar.'}</span></div></div>
        <div id="eg-env-kit"></div>
      </div>
      <div class="rd-fgrid">
        <div class="rd-fld full"><label>Venda</label><select id="eg-env-venda" onchange="EV.envioKit()">${vendas.map((v) => `<option value="${v.id}">${esc(v.kit_nome || 'Venda')} · ${dataBR(v.created_at)}</option>`).join('')}</select></div>
        <div class="rd-fld"><label>Tipo de ligação *</label><select id="eg-env-lig"><option value="">— escolha —</option>${LIGACOES.map(([v, l]) => `<option value="${v}" ${client.tipo_ligacao === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="rd-fld"><label>UC (nº da instalação)</label><input id="eg-env-uc" value="${esc(inst.numero_instalacao || '')}"></div>
        <div class="rd-fld"><label>Concessionária</label><input id="eg-env-conc" value="${esc(inst.concessionaria || '')}"></div>
        <div class="rd-fld"><label>Telhado</label><input id="eg-env-tel" value="${esc(inst.telhado || '')}" placeholder="Ex.: cerâmico, face norte"></div>
        <div class="rd-fld"><label>Distância módulos → inversor (m)</label><input id="eg-env-dist" inputmode="decimal" placeholder="Ex.: 15"></div>
        <div class="rd-fld full"><label>Observações para a engenharia</label><input id="eg-env-obs" placeholder="Opcional"></div>
      </div>
      <p class="rd-tip">${ic('lock')}Depois do envio, os documentos e o kit ficam congelados. Mudanças aparecem para a engenharia como alerta.</p>
      <div class="rd-err" id="eg-err"></div>
      <div class="rd-mfoot"><button class="rd-btn" onclick="EV.fecharModal()">Cancelar</button><button class="rd-btn pri" id="eg-env-ok" ${pode ? '' : 'disabled'} onclick="EV.enviar()">${ic('send')}${ok ? 'Enviar' : pode ? 'Enviar mesmo assim' : 'Enviar'}</button></div>`, true);
    envioKit();
  }
  function envioKit() {
    const box = document.getElementById('eg-env-kit');
    if (!box || !E._envio) return;
    const v = E._envio.vendas.find((x) => x.id === val('eg-env-venda'));
    const pid = v && E._propKit && E._propKit[v.proposta_id];
    const k = E._envio.kits.find((x) => x.id === pid) || E._envio.kits.find((x) => v && String(x.name).trim().toUpperCase() === String(v.kit_nome || '').trim().toUpperCase());
    const ligado = k && k.modulo_id && k.inversor_id;
    box.className = ligado ? 'ok' : 'at';
    box.innerHTML = `${ic(ligado ? 'check' : 'triangle-alert')}<div><b>Kit</b><span>${!k ? 'Kit fora do catálogo: a engenharia escolhe os equipamentos (fica para revisão)' : ligado ? `${k.modulo_qtd}× módulo + ${k.inversor_qtd}× inversor ligados: dimensionamento automático` : 'Kit sem vínculo técnico: a engenharia dimensiona na mão'}</span></div>`;
    icons();
  }
  async function enviar() {
    const env = E._envio;
    if (!env) return;
    const lig = val('eg-env-lig');
    if (!lig) { erro('Escolha o tipo de ligação.'); return; }
    const dist = val('eg-env-dist');
    if (dist && !(num(dist) > 0)) { erro('Distância inválida.'); return; }
    const inst = { tipo_ligacao: lig, numero_instalacao: val('eg-env-uc') || null, concessionaria: val('eg-env-conc') || null, telhado: val('eg-env-tel') || null, distancia_m: dist ? num(dist) : null, obs: val('eg-env-obs') || null };
    await ocupado('eg-env-ok', async () => {
      try {
        const id = await rpc('eng_enviar_projeto', { p_cliente: env.clienteId, p_venda: val('eg-env-venda'), p_instalacao: inst });
        fecharModal();
        toast('Projeto enviado à engenharia');
        await recarregarProjeto(id);
        if (typeof crmFetchAtividades === 'function') crmFetchAtividades(env.clienteId);
        if (typeof renderCrm360 === 'function') renderCrm360();
      } catch (e) { erro(e.message); }
    });
  }

  // ------------------------------------------------------------ exposição
  const EV = {
    recarregar: async () => { E.projetos = null; E.catalogo = null; E.osLista = null; if (E.container) carregarTela(E.container, E.tab === 'catalogo' || E.tab === 'calculadora'); },
    buscar: (q) => { E.busca = q; clearTimeout(EV._t); EV._t = setTimeout(() => { pintar(); const i = E.container && E.container.querySelector('.rd-bar input'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 200); },
    franquia: (v) => { E.fr = v; pintar(); },
    view: (v) => { E.view = v; lsSet('eng_view', v); pintar(); },
    filtro: (k) => { E[k] = !E[k]; pintar(); },
    anxArquivos, anxDrop, anxColar, anxExcluir,
    docZip, docPasta, docBaixar, docProb, docReprovar, docPedir, docVer, docFechar: fecharVisor, docIr: visorIr,
    docProbLimpar: () => { E.prob = {}; pintarDrawer(); },
    trilho: (id) => { E.trilhoAberto[id] = true; pintar(); },
    concTodos: () => { E.concTodos = true; pintar(); },
    soCompensacao: () => { E.soComp = true; E.view = 'lista'; E.fst = ''; if (typeof setTab === 'function') setTab('funil'); },
    verStatus: (s) => { E.fst = s; E.view = 'lista'; if (E.tab !== 'funil' && E.ctx === 'eng' && typeof setTab === 'function') setTab('funil'); else pintar(); },
    abrir, fechar, aba: (k) => { E.ptab = k; pintarDrawer(); }, mudar, confirmarMudar, assumir, reenviar, comentar, salvarConc,
    compModal, salvarComp, compFeita: (id) => salvarComp(id, 'feita'), compRemover: (id) => { if (confirm('Remover a compensação deste projeto?')) salvarComp(id, 'remover'); },
    gerarOS, imprimirOS, recalcular, calculadora,
    // calculadora
    cSet: (k, v) => {
      const c = C();
      c[k] = ['nmod', 'ninv'].includes(k) ? (parseInt(v, 10) || 0) : v;
      if (['nmod', 'ninv'].includes(k)) c.arranjo = null;
      if (k === 'nmod') { const inv = calcEquip('inv'); if (inv && ehMicro(inv)) { c.ninv = Math.ceil(c.nmod / (num(inv.ficha.modulos_por_micro) || 4)); const i = document.getElementById('eg-c-ninv'); if (i) i.value = c.ninv; } }
      calcMarcarSujo();
    },
    cEquip: (k, id) => { const c = C(); c[k === 'mod' ? 'modId' : 'invId'] = id; c.manual[k] = {}; c.arranjo = null; const inv = calcEquip('inv'); if (inv && ehMicro(inv)) c.ninv = Math.ceil(c.nmod / (num(inv.ficha.modulos_por_micro) || 4)); else if (k === 'inv') c.ninv = 1; c.sujo = !!c.res; pintar(); },
    // edição direto na ficha: marca de laranja o que difere do catálogo, sem redesenhar (mantém o foco)
    cFicha: (k, campo, el) => {
      const c = C();
      const base = calcBase(k);
      c.manual[k][campo] = el.value;
      const orig = String(((base && base.ficha) || {})[campo] ?? '');
      (el.closest('.eg-fc') || el).classList.toggle('mod', String(el.value).replace(',', '.') !== orig);
      const st = document.getElementById('eg-st-' + k);
      if (st) { st.innerHTML = calcStatusTag(k); icons(); }
      if (['mppts', 'entradas'].includes(campo)) c.arranjo = null;
      calcMarcarSujo();
    },
    cRestaurar: (k) => { const c = C(); c.manual[k] = {}; c.sujo = !!c.res; pintar(); },
    cValidar: calcValidar,
    cLimpar: () => { E.calc = calcPadrao(); calcGarantirPadrao(); pintar(); },
    cProjeto: (id) => { calcAbrirProjeto(id); pintar(); },
    cProjetoModal: calcProjetoModal,
    cProjetoBuscar: (q) => { clearTimeout(EV._tp); EV._tp = setTimeout(() => { const box = document.getElementById('eg-pj-lista'); if (box) { box.innerHTML = calcProjetoLista(q); icons(); } }, 150); },
    cArranjoEditar: (v) => { C().editArranjo = v; pintar(); },
    cArranjoNovo: () => { const c = C(); c.editArranjo = true; const box = document.getElementById('eg-calc-res'); if (box) { box.innerHTML = calcResultadoHTML(); icons(); } },
    cArranjoAplicar: (n) => { const arr = Array.from({ length: n }, (_, i) => ({ numStrings: val('eg-arr-s' + i), modulesPerString: val('eg-arr-m' + i) })); const c = C(); c.arranjo = arr; c.editArranjo = false; calcValidar(); },
    cArranjoAuto: () => { const c = C(); c.arranjo = null; c.editArranjo = false; calcValidar(); },
    cSalvar: calcSalvar,
    fichaModal, fichaTipo, salvarFicha, kitModal, salvarKit, vincularTodos, fecharModal,
    kitBuscar: (q) => { E.kitBusca = q; E.kitLimite = KITS_PASSO; clearTimeout(EV._tk); EV._tk = setTimeout(pintarKits, 150); },
    kitFiltrar: (v) => { E.kitFiltro = v; E.kitLimite = KITS_PASSO; pintar(); },
    kitMais: () => { E.kitLimite += KITS_PASSO; pintarKits(); },
    kitMenos: () => { E.kitLimite = KITS_PASSO; pintarKits(); },
    envioModal, envioKit, enviar,
    dimensionar, sugerirVinculo,
  };
  window.EV = EV;
  window.renderEngRoute = renderEngRoute;
  window.renderEngProjetosComercial = renderEngProjetosComercial;
  window.engFichaChip = engFichaChip;
  window.engSeloCard = engSeloCard;
  window.renderEngFichaTab = renderEngFichaTab;
  window.engCarregarProjetos = carregarProjetos;

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (document.getElementById('eg-scrim')) { e.stopPropagation(); fecharModal(); return; }
    if (document.getElementById('eg-drawer')) { e.stopPropagation(); fechar(); }
  }, true);
})();
