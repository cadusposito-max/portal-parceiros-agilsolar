// ==========================================================================
// OBRAS (aba Obras do Comercial, visual novo)
//
// Só admin, gestor e franqueado (franqueado = gestor + flag). Cada venda é uma
// obra e anda por 5 etapas:
//   Aguardando OS → Material → Pronta p/ agendar   (andam sozinhas: OS da
//   engenharia, ordem de compra do kit e compra da elétrica)
//   Agendada → Concluída                            (quem gerencia move)
//
// Vistas: Agenda (semana × equipe, abre por padrão), Quadro e Lista. O card da
// obra é o mesmo painel da engenharia (.eg-panel), com tela cheia de verdade e
// coluna lateral. A elétrica tem o "modo conferência" (itens grandes, toque =
// conferido, toque de novo = falta).
//
// Dados: RPC obras_listar (uma linha por venda) e obra_equipes. Tudo que grava
// passa por RPC (obra_salvar, obra_kit, obra_equipe_salvar,
// obra_pedir_prioridade), com o "de → para" na timeline do cliente.
// Migration: supabase/migrations/20261021150000_obras.sql.
// ==========================================================================
(function () {
  'use strict';

  const ETAPAS = [
    { k: 'os', t: 'Aguardando OS', s: 'Projeto na engenharia', auto: 1, i: 'clipboard-list' },
    { k: 'material', t: 'Material', s: 'Kit e elétrica', auto: 1, i: 'package' },
    { k: 'pronta', t: 'Pronta p/ agendar', s: 'OS e material ok', auto: 1, i: 'calendar-plus' },
    { k: 'agendada', t: 'Agendada', s: 'Data e equipe definidas', i: 'calendar-days' },
    { k: 'concluida', t: 'Concluída', s: 'Últimos 60 dias', i: 'circle-check' },
  ];
  const ETAPA = Object.fromEntries(ETAPAS.map((e) => [e.k, e]));
  const PASSOS = ['OS', 'Kit', 'Elétrica', 'Agenda', 'Concluída'];
  const OC_ST = { orcamento: 'Compra em orçamento', aprovar: 'Compra aguardando aprovação', aprovado: 'Compra aprovada, falta pedir', comprado: 'Comprado', entregue: 'Entregue' };
  const ELET = [['a_comprar', 'A comprar'], ['comprada', 'Comprada'], ['separada', 'Separada p/ equipe']];
  const MEDIDOR = [['aguardando', 'Aguardando troca'], ['trocado', 'Trocado']];
  const MON = [['pendente', 'Configurar app'], ['ativo', 'Monitorando'], ['alerta', 'Sem comunicar']];
  const ENG_ST = { validacao: 'Validação', validacao_reprovada: 'Validação reprovada', validacao_aprovada: 'Validação aprovada', elaborar_projeto: 'Elaborar projeto', projeto_enviado: 'Projeto enviado', projeto_aprovado: 'Projeto aprovado', projeto_reprovado: 'Projeto reprovado', projeto_reenviado: 'Projeto reenviado', solicitacao_vistoria: 'Solicitação de vistoria', vistoria_solicitada: 'Vistoria solicitada', projeto_concluido: 'Projeto concluído' };
  const LIG = { mono_127: 'Monofásico 127 V', mono_220: 'Monofásico 220 V', bi_220: 'Bifásico 220 V', tri_220: 'Trifásico 220 V', tri_380: 'Trifásico 380 V' };
  const MOTIVOS = ['Material já entregue', 'Prazo combinado em contrato', 'Cliente vai viajar / imóvel disponível só agora', 'Outro motivo'];
  const DIAS_SEM = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  const RECARGA_MS = 60 * 1000;

  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (_) { /* sem armazenamento */ } };

  const O = {
    lista: null, em: 0, carregando: null, erro: null, equipes: null,
    vista: ['agenda', 'quadro', 'lista'].includes(lsGet('obras_vista')) ? lsGet('obras_vista') : 'agenda',
    filtro: '', q: '', eq: '', semana: 0, mEtapa: '',
    aberta: null, aba: 'resumo', cheia: lsGet('obras_cheia') === '1', fsNosso: false,
    tl: {}, el: {}, conf: null, container: null, celular: null,
  };

  const sb = () => supabaseClient;
  const esc = (s) => (typeof escapeHTML === 'function' ? escapeHTML(String(s ?? '')) : String(s ?? ''));
  const ic = (n, extra = '') => `<i data-lucide="${n}" ${extra}></i>`;
  const icons = () => { if (window.lucide) window.lucide.createIcons(); };
  const money = (v) => (typeof formatCurrency === 'function' ? formatCurrency(Number(v) || 0) : 'R$ ' + (Number(v) || 0).toFixed(2));
  const nf = (v, d = 0) => (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const kwp = (v) => (Number(v) ? nf(v, 2) + ' kWp' : '—');
  const toast = (m) => (typeof showToast === 'function' ? showToast(m) : console.log(m));
  const pode = () => !!(state.isAdmin || state.isGestor);
  const celular = () => window.matchMedia('(max-width: 760px)').matches;
  const numBR = (s) => { const n = parseFloat(String(s ?? '').replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
  const numIn = (s) => { const t = String(s ?? '').trim(); if (!t) return 0; return t.includes(',') ? numBR(t) : (parseFloat(t) || 0); };

  // datas em 'YYYY-MM-DD' (sem fuso: meio-dia local)
  const pad = (n) => String(n).padStart(2, '0');
  const isoDe = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const dataDe = (iso) => new Date(String(iso).slice(0, 10) + 'T12:00:00');
  const hojeIso = () => isoDe(new Date());
  const addDias = (iso, n) => { const d = dataDe(iso); d.setDate(d.getDate() + n); return isoDe(d); };
  const dm = (iso) => (iso ? `${pad(dataDe(iso).getDate())}/${pad(dataDe(iso).getMonth() + 1)}` : '');
  const dmy = (iso) => (iso ? dataDe(iso).toLocaleDateString('pt-BR') : '');
  const diaCurto = (iso) => `${DIAS_SEM[dataDe(iso).getDay()]} ${dm(iso)}`;
  const quando = (ts) => { if (!ts) return ''; const d = new Date(ts); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const segundaDe = (iso) => { const d = dataDe(iso); const w = (d.getDay() + 6) % 7; d.setDate(d.getDate() - w); return isoDe(d); };
  const cidade = (o) => {
    const c = String(o.cidade || '').split('/')[0].trim().toLocaleLowerCase('pt-BR').replace(/(^|\s)(\S)/g, (m, a, b) => a + b.toLocaleUpperCase('pt-BR')).replace(/\b(Da|De|Do|Das|Dos|E)\b/g, (x) => x.toLowerCase());
    return c || '—';
  };
  const pnum = (e) => (e && e.numero ? 'P-' + String(e.numero).padStart(4, '0') : '');
  const nomePorEmail = (email) => (typeof dashVendedorNome === 'function' ? dashVendedorNome(email) : String(email || '').split('@')[0]);
  const franquiaNome = (id) => (typeof getFranquiaNameById === 'function' ? getFranquiaNameById(id) : '');
  const verTodas = () => !!(state.isAdmin && state.adminViewAll && String(state.adminScopeFranquiaId || 'all') === 'all');

  // ------------------------------------------------------------ dados
  async function carregar(forcar) {
    if (!forcar && O.lista && Date.now() - O.em < RECARGA_MS) return O.lista;
    if (O.carregando) return O.carregando;
    O.carregando = (async () => {
      try {
        const [r, q] = await Promise.all([
          sb().rpc('obras_listar'),
          sb().from('obra_equipes').select('id, franquia_id, nome, integrantes, terceirizada, ativa').order('nome'),
        ]);
        if (r.error) throw r.error;
        if (q.error) throw q.error;
        O.lista = Array.isArray(r.data) ? r.data : [];
        O.equipes = q.data || [];
        O.erro = null;
      } catch (e) {
        console.error('[obras] carregar', e);
        O.erro = /obras_listar|obra_equipes|PGRST202|42883|42P01/i.test(String(e?.message || e?.code || '')) ? 'banco' : (e?.message || 'erro');
        O.lista = O.lista || [];
        O.equipes = O.equipes || [];
      }
      O.em = Date.now();
      return O.lista;
    })();
    try { return await O.carregando; } finally { O.carregando = null; }
  }
  const naTela = () => state.environment === 'comercial' && state.activeTab === 'obras';
  function repintar() {
    if (naTela() && typeof renderContent === 'function') renderContent();
    if (O.aberta) pintarPainel();
  }
  const obras = () => (typeof applyAdminGlobalScope === 'function' ? applyAdminGlobalScope(O.lista || []) : (O.lista || []));
  const equipesAtivas = (franquia) => (typeof applyAdminGlobalScope === 'function' ? applyAdminGlobalScope(O.equipes || []) : (O.equipes || []))
    .filter((e) => e.ativa && (!franquia || e.franquia_id === franquia));
  const achar = (id) => (O.lista || []).find((x) => x.venda_id === id);

  // ------------------------------------------------------------ situação de cada obra
  function kitInfo(o) {
    const oc = o.oc, pos = o.pos || {}, hoje = hojeIso();
    if (oc) {
      if (oc.status === 'entregue') return { st: 'ok', t: 'Entregue', d: oc.entregue_em ? 'em ' + dm(oc.entregue_em) : '', passo: 3 };
      if (oc.status === 'comprado') {
        if (oc.previsao && oc.previsao < hoje) return { st: 'late', t: 'Atrasado', d: 'era ' + dm(oc.previsao), passo: 2, late: true };
        return { st: 'at', t: 'Comprado', d: oc.previsao ? 'chega ' + dm(oc.previsao) : 'sem previsão de entrega', passo: 2 };
      }
      return { st: '', t: 'A comprar', d: OC_ST[oc.status] || oc.status, passo: 1 };
    }
    if (pos.kit_entregue_em) return { st: 'ok', t: 'Entregue', d: 'em ' + dm(pos.kit_entregue_em), passo: 3 };
    if (pos.kit_previsao) {
      if (pos.kit_previsao < hoje) return { st: 'late', t: 'Atrasado', d: 'era ' + dm(pos.kit_previsao), passo: 2, late: true };
      return { st: 'at', t: 'Previsto', d: 'chega ' + dm(pos.kit_previsao), passo: 2 };
    }
    return { st: '', t: 'Sem compra', d: 'não lançada no Financeiro', passo: 0 };
  }
  function eletInfo(o) {
    const pos = o.pos || {}, s = pos.eletrica_status;
    const falta = (Array.isArray(pos.eletrica_itens) ? pos.eletrica_itens : []).filter((x) => x && x.falta).length;
    // item faltando na conferência: a obra não fica pronta até resolver
    if (falta) return { st: 'late', ok: false, t: falta === 1 ? '1 item faltando' : falta + ' itens faltando', falta };
    if (s === 'separada') return { st: 'ok', ok: true, t: 'Separada', falta };
    if (s === 'comprada') return { st: 'ok', ok: true, t: 'Comprada', falta };
    return { st: 'wa', ok: false, t: 'A comprar', falta };
  }
  function info(o) {
    const pos = o.pos || {};
    const k = kitInfo(o), e = eletInfo(o);
    const ini = pos.obra_data || null, dur = Math.max(1, Number(pos.obra_dias) || 1);
    const fim = ini ? addDias(ini, dur - 1) : null;
    const hoje = hojeIso();
    let etapa;
    if (pos.obra_status === 'concluida') etapa = 'concluida';
    else if (['agendada', 'em_andamento'].includes(pos.obra_status) && ini) etapa = 'agendada';
    else if (!o.os) etapa = 'os';
    else if (k.st !== 'ok' || !e.ok) etapa = 'material';
    else etapa = 'pronta';
    const prio = (o.eng && o.eng.prioridade) || null;
    return {
      pos, k, e, etapa, ini, fim, dur, prio,
      naObra: etapa === 'agendada' && ini <= hoje && hoje <= fim,
      atrasada: etapa === 'agendada' && fim < hoje,
      antecipada: !!(o.os && prio && prio.status === 'atendida'),
      posPend: etapa === 'concluida' ? [pos.medidor_status !== 'trocado' ? 'medidor' : '', pos.mon_status !== 'ativo' ? 'mon' : ''].filter(Boolean) : [],
    };
  }
  const faltaTexto = (o, I) => [I.k.st !== 'ok' ? 'kit ' + (I.k.late ? 'atrasado' : I.k.t.toLowerCase()) : '', !I.e.ok ? (I.e.falta ? 'elétrica com ' + I.e.t : 'elétrica a comprar') : '', !o.os ? 'OS da engenharia' : ''].filter(Boolean);
  const dataObra = (I) => (I.ini ? diaCurto(I.ini) + (I.dur > 1 ? ' a ' + dm(I.fim) : '') : '');
  const equipeNome = (o) => (o.equipe && o.equipe.nome) || (o.pos && o.pos.obra_equipe) || 'Sem equipe';

  // ------------------------------------------------------------ selos
  const chip = (cls, icone, txt) => `<span class="ob-chip ${cls}">${ic(icone)}${esc(txt)}</span>`;
  function chipOS(o, I) {
    if (o.os) return chip('ok', 'clipboard-check', o.os.numero + (I.antecipada ? ' · antecipada' : ''));
    if (I.prio && I.prio.status === 'pedida') return chip('wa', 'fast-forward', 'OS pedida');
    return chip('', 'clipboard-list', o.eng ? 'Sem OS' : 'Não enviado à eng.');
  }
  const chipKit = (I) => chip(I.k.st === 'ok' ? 'ok' : I.k.st === 'late' ? 'late' : I.k.st === 'at' ? 'at' : '', 'truck', 'Kit ' + I.k.t.toLowerCase());
  const chipElet = (I) => chip(I.e.st, 'plug-zap', 'Elétrica ' + I.e.t.toLowerCase().replace(/^(\d)/, '· $1'));
  function flagHTML(I) {
    if (I.antecipada) return `<span class="ob-flag" title="OS emitida antes da vez, a pedido da unidade">${ic('fast-forward')}Antecipada</span>`;
    if (I.prio && I.prio.status === 'pedida') return `<span class="ob-flag" title="Pedido para passar na frente aguardando a engenharia">${ic('fast-forward')}Prioridade</span>`;
    return '';
  }
  function alertaDe(o, I) {
    if (I.k.late) return 'Entrega do kit atrasada (' + I.k.d + ')';
    if (I.atrasada) return 'Passou da data da instalação (até ' + dm(I.fim) + ')';
    if (I.prio && I.prio.status === 'recusada' && !o.os) return 'Engenharia recusou passar na frente';
    if (I.etapa === 'concluida' && (o.pos || {}).mon_status === 'alerta') return 'Inversor sem comunicar';
    return '';
  }

  function cardHTML(o) {
    const I = info(o), al = alertaDe(o, I);
    let corpo;
    if (I.etapa === 'agendada') {
      corpo = `<div class="when">${ic(I.naObra ? 'hard-hat' : 'calendar-days')}${esc(dataObra(I))}<span>· ${esc(equipeNome(o))}</span></div>
        <div class="ob-chips">${I.naObra ? chip('wa', 'hard-hat', 'Na obra hoje') : ''}${chipOS(o, I)}${I.k.st === 'ok' && I.e.ok ? chip('ok', 'package-check', 'Material ok') : chipKit(I) + chipElet(I)}</div>`;
    } else if (I.etapa === 'concluida') {
      const pos = I.pos;
      corpo = `<div class="when">${ic('circle-check')}Concluída ${dm(pos.obra_concluida_em || pos.obra_data)}<span>· ${esc(equipeNome(o))}</span></div>
        <div class="ob-chips">${chip(pos.medidor_status === 'trocado' ? 'ok' : 'wa', 'gauge', pos.medidor_status === 'trocado' ? 'Medidor trocado' : 'Aguarda troca do medidor')}${chip(pos.mon_status === 'ativo' ? 'ok' : pos.mon_status === 'alerta' ? 'late' : 'wa', 'wifi', pos.mon_status === 'ativo' ? 'Monitorando' : pos.mon_status === 'alerta' ? 'Sem comunicar' : 'Configurar monitoramento')}</div>`;
    } else {
      corpo = `${I.etapa === 'os' && o.eng ? `<div class="meta">${esc(ENG_ST[o.eng.status] || o.eng.status)} · ${esc(pnum(o.eng))}</div>` : ''}<div class="ob-chips">${chipOS(o, I)}${chipKit(I)}${chipElet(I)}</div>`;
    }
    return `<button type="button" class="ob-card ${O.aberta === o.venda_id ? 'sel' : ''}" onclick="obras.abrir('${o.venda_id}')">
      <div class="hd"><span>Venda ${esc(dm(String(o.venda_em).slice(0, 10)))}${verTodas() ? ' · ' + esc(franquiaNome(o.franquia_id)) : ''}</span>${flagHTML(I)}</div>
      <div class="nm">${esc(o.cliente_nome || 'Cliente')}</div>
      <div class="meta">${esc(cidade(o))} · ${kwp(o.kwp)}</div>
      ${corpo}
      ${al ? `<div class="al">${ic('triangle-alert')}${esc(al)}</div>` : ''}
    </button>`;
  }

  // ------------------------------------------------------------ atenção (filtros rápidos)
  function semanaAtual() { const s = segundaDe(hojeIso()); return [s, addDias(s, 6)]; }
  const ATT = [
    { k: 'atraso', t: 'Material atrasado', i: 'truck', tone: 'red', f: (o, I) => I.k.late && I.etapa !== 'concluida' },
    { k: 'eletrica', t: 'Elétrica a comprar', i: 'plug-zap', tone: 'orange', f: (o, I) => I.etapa !== 'concluida' && (!I.e.ok || I.e.falta > 0) },
    { k: 'semdata', t: 'Prontas sem data', i: 'calendar-plus', tone: 'blue', f: (o, I) => I.etapa === 'pronta' },
    { k: 'semana', t: 'Instalações nesta semana', i: 'hard-hat', tone: 'green', f: (o, I) => { const [a, b] = semanaAtual(); return I.etapa === 'agendada' && I.ini <= b && I.fim >= a; } },
    { k: 'pos', t: 'Pós-obra com pendência', i: 'gauge', tone: 'orange', f: (o, I) => I.posPend.length > 0 },
  ];
  function filtradas(semFiltro) {
    const q = O.q.trim().toLocaleLowerCase('pt-BR');
    const at = !semFiltro && ATT.find((a) => a.k === O.filtro);
    return obras().filter((o) => {
      if (q && !`${o.cliente_nome} ${o.cidade} ${o.vendedor} ${o.kit_nome}`.toLocaleLowerCase('pt-BR').includes(q)) return false;
      if (O.eq && (o.pos || {}).obra_equipe_id !== O.eq) return false;
      return !at || at.f(o, info(o));
    });
  }
  function attHTML() {
    const base = obras();
    return `<div class="ob-att">${ATT.map((a) => {
      const n = base.filter((o) => a.f(o, info(o))).length;
      return `<button type="button" class="${O.filtro === a.k ? 'on' : ''} ${n ? '' : 'zero'}" onclick="obras.filtrar('${a.k}')" title="${O.filtro === a.k ? 'Tirar o filtro' : 'Mostrar só essas'}">
        <span class="ic ob-t-${a.tone}">${ic(a.i)}</span><span><b>${n}</b><small>${a.t}</small></span></button>`;
    }).join('')}</div>`;
  }

  function toolbarHTML() {
    const eqs = equipesAtivas();
    const seg = [['agenda', 'calendar-days', 'Agenda'], ['quadro', 'kanban', 'Quadro'], ['lista', 'list', 'Lista']];
    return `<div class="v2-toolbar ob-tb">
      <label class="v2-sbox">${ic('search')}<input id="ob-busca" type="text" value="${esc(O.q)}" oninput="obras.buscar(this.value)" placeholder="Cliente, cidade ou vendedor" autocomplete="off"></label>
      ${eqs.length ? `<select class="v2-select ${O.eq ? 'on' : ''}" onchange="obras.equipe(this.value)"><option value="">Todas as equipes</option>${eqs.map((e) => `<option value="${e.id}" ${O.eq === e.id ? 'selected' : ''}>${esc(e.nome)}</option>`).join('')}</select>` : ''}
      <button type="button" class="v2-btn2" onclick="obras.equipesModal()">${ic('users')}Equipes</button>
      ${O.filtro ? `<button type="button" class="v2-btn2" onclick="obras.filtrar('')">${ic('filter-x')}Tirar filtro</button>` : ''}
      <div class="v2-grow"></div>
      <div class="v2-seg">${seg.map(([k, i, l]) => `<button type="button" class="${O.vista === k ? 'on' : ''}" onclick="obras.vista('${k}')">${ic(i)}${l}</button>`).join('')}</div>
    </div>`;
  }

  // ------------------------------------------------------------ agenda (semana × equipe)
  function semanaVista() { const s = addDias(segundaDe(hojeIso()), O.semana * 7); return Array.from({ length: 6 }, (_, i) => addDias(s, i)); }
  function agendaHTML(lista) {
    const dias = semanaVista(), ini = dias[0], fim = dias[5], hoje = hojeIso();
    const ag = lista.map((o) => ({ o, I: info(o) })).filter(({ I }) => (I.etapa === 'agendada' || I.etapa === 'concluida') && I.ini && I.ini <= fim && I.fim >= ini);
    const M = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    const titulo = `Semana de ${dataDe(ini).getDate()}${dataDe(ini).getMonth() !== dataDe(fim).getMonth() ? ' de ' + M[dataDe(ini).getMonth()] : ''} a ${dataDe(fim).getDate()} de ${M[dataDe(fim).getMonth()]}`;
    let eqs = equipesAtivas();
    if (O.eq) eqs = eqs.filter((e) => e.id === O.eq);
    const semEq = ag.filter(({ o }) => !(o.pos || {}).obra_equipe_id || !eqs.some((e) => e.id === o.pos.obra_equipe_id));
    const linhas = eqs.map((e) => ({ id: e.id, nome: e.nome, sub: [e.terceirizada ? 'Terceirizada' : '', e.integrantes, verTodas() ? franquiaNome(e.franquia_id) : ''].filter(Boolean).join(' · ') || 'Equipe própria', itens: ag.filter(({ o }) => (o.pos || {}).obra_equipe_id === e.id) }));
    if (semEq.length && !O.eq) linhas.push({ id: '', nome: 'Sem equipe', sub: 'Defina a equipe', itens: semEq, sem: true });

    const lane = (l) => {
      const bg = dias.map((d) => {
        const livre = d >= hoje && l.id;
        return livre ? `<button type="button" class="livre ${d === hoje ? 'hoje' : ''}" onclick="obras.agendarSlot('${d}','${l.id}')" title="Agendar ${diaCurto(d)} · ${esc(l.nome)}" aria-label="Agendar ${diaCurto(d)}"></button>` : `<div class="${d === hoje ? 'hoje' : d < hoje ? 'passou' : ''}"></div>`;
      }).join('');
      const fg = l.itens.map(({ o, I }) => {
        const a = Math.max(0, dias.indexOf(I.ini < ini ? ini : I.ini)), b = dias.indexOf(I.fim > fim ? fim : I.fim);
        const span = (b < 0 ? 5 : b) - a + 1;
        const cls = I.etapa === 'concluida' ? 'feita' : I.atrasada ? 'atrasada' : I.naObra ? 'hoje' : '';
        return `<button type="button" class="ob-blk ${cls} ${O.aberta === o.venda_id ? 'sel' : ''}" style="grid-column:${a + 1} / span ${Math.max(1, span)}" onclick="obras.abrir('${o.venda_id}','agenda')" title="${esc(o.cliente_nome)} · ${esc(dataObra(I))}"><span>${esc(o.cliente_nome || 'Cliente')}</span><small>${esc(cidade(o))} · ${kwp(o.kwp)}${I.naObra ? ' · na obra' : I.etapa === 'concluida' ? ' · concluída' : ''}</small></button>`;
      }).join('');
      return `<div class="ob-lane"><div class="ob-lane-bg">${bg}</div><div class="ob-lane-fg">${fg}</div></div>`;
    };
    const grade = `<div class="ob-ag-scroll"><div class="ob-ag">
      <div class="ob-ag-row"><div class="ob-ag-eq" style="background:var(--v2-soft)"></div><div class="ob-ag-days">${dias.map((d) => `<div class="${d === hoje ? 'hoje' : ''}">${diaCurto(d)}${d === hoje ? ' · hoje' : ''}</div>`).join('')}</div></div>
      ${linhas.map((l) => `<div class="ob-ag-row"><div class="ob-ag-eq ${l.sem ? 'sem' : ''}"><b>${esc(l.nome)}</b><small>${esc(l.sub)}</small></div>${lane(l)}</div>`).join('')}
    </div></div>`;

    const domingo = addDias(ini, 6);
    const porDia = dias.concat([domingo]).map((d) => {
      const its = ag.filter(({ I }) => I.ini <= d && I.fim >= d);
      if (d === domingo && !its.length) return '';
      return `<div class="dia ${d === hoje ? 'hoje' : ''}"><b>${diaCurto(d)}${d === hoje ? ' · hoje' : ''}</b>${its.map(({ o, I }) => `<button type="button" class="it ${I.etapa === 'concluida' ? 'feita' : I.naObra ? 'hoje' : ''}" onclick="obras.abrir('${o.venda_id}','agenda')"><i></i><span><b>${esc(o.cliente_nome || 'Cliente')}</b><small>${esc(equipeNome(o))} · ${esc(cidade(o))} · ${kwp(o.kwp)}</small></span></button>`).join('') || '<div class="nada">Sem instalação</div>'}</div>`;
    }).join('');

    const prontas = lista.filter((o) => info(o).etapa === 'pronta');
    const semEquipes = !equipesAtivas().length;
    return `<div class="v2-card">
      <div class="ob-ag-top"><div><h3>${titulo}</h3><small>${O.semana === 0 ? 'Semana atual' : O.semana > 0 ? `Daqui a ${O.semana} semana${O.semana > 1 ? 's' : ''}` : `${-O.semana} semana${O.semana < -1 ? 's' : ''} atrás`}</small></div><div class="v2-grow"></div>
        <button type="button" class="v2-btn2" onclick="obras.semana(-1)" aria-label="Semana anterior">${ic('chevron-left')}</button>
        <button type="button" class="v2-btn2" onclick="obras.semana(0)" ${O.semana === 0 ? 'disabled' : ''}>Hoje</button>
        <button type="button" class="v2-btn2" onclick="obras.semana(1)" aria-label="Próxima semana">${ic('chevron-right')}</button></div>
      ${semEquipes ? `<div class="ob-semeq"><span class="ic">${ic('users')}</span><div><b>Cadastre as equipes de instalação</b><small>A agenda mostra uma linha por equipe. Dá para ter equipe própria e terceirizada.</small></div><button type="button" class="eg-btn pri" onclick="obras.equipesModal()">${ic('plus')}Cadastrar equipe</button></div>` : ''}
      ${celular() ? `<div class="ob-agm">${porDia}</div>` : (linhas.length ? grade : '')}
      <div class="ob-tray"><h4>${ic('calendar-plus')}Prontas para agendar · ${prontas.length}${prontas.length && !celular() ? '<small>Clique num espaço livre da agenda ou no cartão</small>' : ''}</h4>
        ${prontas.length ? `<div class="ob-tray-l">${prontas.map(cardHTML).join('')}</div>` : `<div class="ob-vazio">Nenhuma obra pronta sem data. As que ainda esperam OS ou material estão no Quadro.</div>`}</div>
    </div>`;
  }

  // ------------------------------------------------------------ quadro
  function quadroHTML(lista) {
    return `<div class="ob-board-wrap"><div class="ob-board">${ETAPAS.map((c) => {
      const its = lista.filter((o) => info(o).etapa === c.k);
      return `<section class="ob-col"><div class="ob-col-h"><div><b>${c.t}</b><small>${c.s}</small>${c.auto ? `<span class="auto">${ic('refresh-cw')}anda sozinha</span>` : ''}</div><span class="n">${its.length}</span></div>
        ${its.map(cardHTML).join('') || '<div class="ob-vazio">Nenhuma obra aqui</div>'}</section>`;
    }).join('')}</div></div>`;
  }

  // ------------------------------------------------------------ lista
  function etapaChip(I) {
    const e = ETAPA[I.etapa];
    const tom = I.etapa === 'concluida' ? 't-green' : I.atrasada ? 't-red' : I.naObra ? 't-orange' : I.etapa === 'os' ? 't-gray' : 't-blue';
    return `<span class="eg-chip dot ${tom}">${esc(I.naObra ? 'Na obra hoje' : e.t)}</span>`;
  }
  function listaHTML(lista) {
    if (!lista.length) return `<div class="v2-card"><div class="v2-empty">Nenhuma obra com esse filtro.</div></div>`;
    const rows = lista.map((o) => {
      const I = info(o);
      return `<tr onclick="obras.abrir('${o.venda_id}')" style="cursor:pointer">
        <td><b>${esc(o.cliente_nome || 'Cliente')}</b><small>${esc(cidade(o))} · ${esc(o.vendedor || '')}${verTodas() ? ' · ' + esc(franquiaNome(o.franquia_id)) : ''}</small></td>
        <td>${kwp(o.kwp)}</td><td>${chipOS(o, I)}</td><td>${chipKit(I)}</td><td>${chipElet(I)}</td>
        <td>${I.ini ? `<b>${esc(dataObra(I))}</b><small>${esc(equipeNome(o))}</small>` : '<small>—</small>'}</td>
        <td>${etapaChip(I)}</td></tr>`;
    }).join('');
    return `<div class="v2-card ob-tabwrap" style="padding:14px 16px"><div class="v2-tscroll"><table class="v2-table ob-tab"><thead><tr><th>Cliente</th><th>Sistema</th><th>OS</th><th>Kit</th><th>Elétrica</th><th>Instalação</th><th>Etapa</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
  }

  // ------------------------------------------------------------ celular: um cartão por obra
  function faixaM(o, I) {
    const late = !!alertaDe(o, I);
    let ico = ETAPA[I.etapa].i, b = ETAPA[I.etapa].t, s = '', cls = late ? 'late' : '';
    if (I.etapa === 'os') s = I.prio && I.prio.status === 'pedida' ? 'prioridade pedida' : o.eng ? (ENG_ST[o.eng.status] || '') : 'não enviado à engenharia';
    else if (I.etapa === 'material') s = faltaTexto(o, I).join(' · ');
    else if (I.etapa === 'pronta') s = 'falta agendar';
    else if (I.etapa === 'agendada') { ico = I.naObra ? 'hard-hat' : ico; b = I.naObra ? 'Na obra hoje' : dataObra(I); s = equipeNome(o); }
    else { cls = late ? 'late' : 'ok'; s = I.posPend.length ? 'falta ' + I.posPend.map((x) => (x === 'medidor' ? 'troca do medidor' : 'monitoramento')).join(' e ') : 'tudo certo'; }
    if (late) s = alertaDe(o, I);
    return `<div class="v2-vm-ft ${cls}">${ic(late ? 'triangle-alert' : ico)}<b>${esc(b)}</b><span>${esc(s)}</span>${ic('chevron-right')}</div>`;
  }
  function mobileHTML(lista) {
    const cnt = (k) => lista.filter((o) => info(o).etapa === k).length;
    const strip = `<div class="ob-mstrip"><button type="button" class="${!O.mEtapa ? 'on' : ''}" onclick="obras.mEtapa('')">Todas <b>${lista.length}</b></button>${ETAPAS.map((c) => `<button type="button" class="${O.mEtapa === c.k ? 'on' : ''}" onclick="obras.mEtapa('${c.k}')">${c.t} <b>${cnt(c.k)}</b></button>`).join('')}</div>`;
    const card = (o) => {
      const I = info(o);
      return `<article class="v2-vm ${alertaDe(o, I) ? 'late' : ''}" onclick="obras.abrir('${o.venda_id}')">
        <div class="v2-vm-in"><div class="v2-vm-top"><b class="v2-vm-nm">${esc(o.cliente_nome || 'Cliente')}</b><div class="v2-vm-val"><b>${kwp(o.kwp)}</b><small>venda ${esc(dm(String(o.venda_em).slice(0, 10)))}</small></div></div>
          <div class="v2-vm-vend">${ic('map-pin')}${esc(cidade(o))}${I.antecipada ? ' · OS antecipada' : I.prio && I.prio.status === 'pedida' ? ' · prioridade pedida' : ''}</div>
          ${I.etapa !== 'concluida' && I.etapa !== 'agendada' ? `<div class="ob-chips" style="margin-top:10px">${chipOS(o, I)}${chipKit(I)}${chipElet(I)}</div>` : ''}</div>
        ${faixaM(o, I)}</article>`;
    };
    const grupos = ETAPAS.filter((c) => !O.mEtapa || O.mEtapa === c.k).map((c) => {
      const its = lista.filter((o) => info(o).etapa === c.k);
      return its.length ? `${!O.mEtapa ? `<h6>${c.t} · ${its.length}</h6>` : ''}${its.map(card).join('')}` : '';
    }).join('');
    return strip + `<div class="ob-mlist">${grupos || '<div class="ob-vazio">Nenhuma obra com esse filtro.</div>'}</div>`;
  }

  // ------------------------------------------------------------ tela
  function render(container) {
    O.container = container;
    container.className = 'v2s';
    document.body.dataset.v2screen = 'obras';
    if (!pode()) {
      window.uiV2PageMeta = { key: 'comercial:obras', title: 'Obras', sub: '' };
      container.innerHTML = `<div class="v2-card"><div class="v2-empty">A aba Obras é só para admin, gestor e franqueado.</div></div>`;
      return;
    }
    O.celular = celular();
    const velho = !O.lista || Date.now() - O.em > RECARGA_MS;
    if (velho && !O.carregando) carregar().then(() => { if (naTela()) renderContent(); if (O.aberta) pintarPainel(); });
    if (!O.lista) {
      window.uiV2PageMeta = { key: 'comercial:obras', title: 'Obras', sub: 'Da compra do material ao sistema gerando' };
      container.innerHTML = `<div class="v2-card"><div class="v2-empty">${ic('loader-2', 'class="spin"')} Carregando as obras...</div></div>`;
      icons();
      return;
    }
    const todas = obras();
    const ativas = todas.filter((o) => info(o).etapa !== 'concluida').length;
    window.uiV2PageMeta = { key: 'comercial:obras', title: 'Obras', sub: `${ativas} obra${ativas === 1 ? '' : 's'} em andamento · da compra do material ao sistema gerando` };
    if (O.erro === 'banco') {
      container.innerHTML = `<div class="v2-card"><div class="v2-empty">${ic('database')} A aba Obras precisa da atualização do banco (migration 20261021150000_obras).</div></div>`;
      icons();
      return;
    }
    const lista = filtradas();
    const corpo = !todas.length ? `<div class="v2-card"><div class="v2-empty">Nenhuma venda ainda. Cada venda registrada vira uma obra aqui.</div></div>`
      : O.vista === 'agenda' ? agendaHTML(lista)
      : celular() ? mobileHTML(lista)
      : O.vista === 'lista' ? listaHTML(lista) : quadroHTML(lista);
    container.innerHTML = `${attHTML()}${toolbarHTML()}${O.erro ? `<div class="eg-aviso r">${ic('triangle-alert')}<span>Não deu para atualizar as obras: ${esc(O.erro)}</span></div>` : ''}${corpo}`;
    icons();
  }

  // ------------------------------------------------------------ card da obra (painel)
  async function abrir(id, aba) {
    const outra = O.aberta !== id;
    if (outra) O.el[id] = null;
    O.aba = aba || (outra ? 'resumo' : O.aba || 'resumo');
    O.aberta = id;
    pintarPainel(true);
    if (naTela() && O.container) render(O.container);
    const o = achar(id);
    if (o) carregarTimeline(o).then(() => { if (O.aberta === id) pintarPainel(); });
    if (O.cheia) telaCheia(true);
  }
  function fechar() {
    O.aberta = null; O.conf = null;
    const d = document.getElementById('ob-drawer'); if (d) d.remove();
    const c = document.getElementById('ob-conf'); if (c) c.remove();
    document.body.classList.remove('eg-lock');
    telaCheia(false);
    if (naTela() && O.container) render(O.container);
  }
  // tela cheia de verdade (some a barra do navegador); se o navegador não deixar, o painel ocupa a janela
  function telaCheia(on) {
    try {
      if (on && !document.fullscreenElement && document.documentElement.requestFullscreen && !celular()) {
        document.documentElement.requestFullscreen().then(() => { O.fsNosso = true; }).catch(() => {});
      } else if (!on && document.fullscreenElement && O.fsNosso && document.exitFullscreen) {
        O.fsNosso = false; document.exitFullscreen().catch(() => {});
      }
    } catch (_) { /* sem tela cheia */ }
  }

  function passosHTML(o, I) {
    const ord = ['os', 'material', 'pronta', 'agendada', 'concluida'], n = ord.indexOf(I.etapa);
    const st = [
      o.os ? 'done' : 'cur',
      I.k.st === 'ok' ? 'done' : I.k.late ? 'bad' : o.os ? 'cur' : '',
      I.e.falta ? 'bad' : I.e.ok ? 'done' : o.os && I.k.st === 'ok' ? 'cur' : '',
      n >= 4 ? 'done' : n === 3 ? (I.atrasada ? 'bad' : 'cur') : n === 2 ? 'cur' : '',
      n === 4 ? 'done' : '',
    ];
    return `<div class="eg-pst">${PASSOS.map((l, i) => `${i ? `<span class="ln ${st[i - 1] === 'done' ? 'done' : ''}"></span>` : ''}<div class="st ${st[i]}"><i>${st[i] === 'done' ? ic('check') : st[i] === 'bad' ? ic('x') : i + 1}</i><span>${l}</span></div>`).join('')}</div>`;
  }
  function sumHTML(o, I) {
    const box = (aba, cls, rot, icone, txt) => `<button type="button" class="lk ${cls}" onclick="obras.aba('${aba}')"><small>${rot}</small><b>${ic(icone)}${esc(txt)}</b></button>`;
    const os = o.os ? ['g', 'clipboard-check', o.os.numero + (o.os.revisao > 1 ? ' rev. ' + o.os.revisao : '')] : I.prio && I.prio.status === 'pedida' ? ['o', 'fast-forward', 'Prioridade pedida'] : ['', 'clipboard-list', o.eng ? 'Aguardando' : 'Não enviado'];
    const kit = [I.k.st === 'ok' ? 'g' : I.k.late ? 'r' : I.k.st === 'at' ? '' : 'o', 'truck', I.k.t + (I.k.d ? ' · ' + I.k.d : '')];
    const el = [I.e.falta ? 'r' : I.e.ok ? 'g' : 'o', 'plug-zap', I.e.t];
    const ag = I.ini ? [I.etapa === 'concluida' ? 'g' : I.atrasada ? 'r' : I.naObra ? 'o' : '', 'calendar-days', dataObra(I)] : ['', 'calendar-plus', 'Sem data'];
    return `<div class="eg-sum">${box('os', os[0], 'OS', os[1], os[2])}${box('material', kit[0], 'Kit', kit[1], kit[2])}${box('eletrica', el[0], 'Elétrica', el[1], el[2])}${box('agenda', ag[0], 'Instalação', ag[1], ag[2])}</div>`;
  }
  function avisoHTML(o, I) {
    if (I.k.late) return `<div class="eg-aviso r">${ic('truck')}<span>Entrega do kit atrasada: a previsão ${esc(I.k.d)}. Cobre o distribuidor e avise o cliente.</span></div>`;
    if (I.e.falta) return `<div class="eg-aviso r">${ic('plug-zap')}<span>Conferência da elétrica: ${esc(I.e.t)}.</span></div>`;
    if (I.atrasada) return `<div class="eg-aviso">${ic('calendar-x')}<span>A instalação era até ${dm(I.fim)}. Se terminou, conclua a obra; se não, reagende.</span></div>`;
    return '';
  }

  function pintarPainel(novo) {
    if (!O.aberta) return;
    const o = achar(O.aberta);
    let d = document.getElementById('ob-drawer');
    const criou = !d;
    if (!d) {
      d = document.createElement('div');
      d.id = 'ob-drawer';
      d.className = 'eg-scrim';
      d.addEventListener('mousedown', (e) => { if (e.target === d) fechar(); });
      document.body.appendChild(d);
      document.body.classList.add('eg-lock');
    }
    const corpoAntes = d.querySelector('.eg-pb');
    const y = corpoAntes ? corpoAntes.scrollTop : 0;
    const cls = `eg-panel rd eg ob-panel t-${O.aba}${O.cheia ? ' cheia' : ''}${criou || novo ? ' entra' : ''}`;
    if (!o) { d.innerHTML = `<div class="${cls}"><div class="rd-loading">${ic('loader-2')}Abrindo a obra...</div></div>`; icons(); return; }
    const I = info(o);
    const abas = [['resumo', 'layout-list', 'Resumo'], ['material', 'truck', 'Material', I.k.late], ['eletrica', 'plug-zap', 'Elétrica', I.e.falta || (!I.e.ok && I.etapa !== 'concluida')], ['os', 'clipboard-list', 'OS'], ['agenda', 'calendar-days', 'Agenda'], ['timeline', 'history', 'Timeline']];
    const corpo = ({ resumo: abaResumo, material: abaMaterial, eletrica: abaEletrica, os: abaOS, agenda: abaAgenda, timeline: abaTimeline })[O.aba] || abaResumo;
    const lado = O.aba === 'resumo' ? '' : proximoHTML(o, I);
    d.innerHTML = `<div class="${cls}" role="dialog" aria-modal="true" aria-label="Obra de ${esc(o.cliente_nome || 'cliente')}">
      <div class="eg-ph">
        <div class="eg-top">
          <i class="eg-av">${ic('hard-hat')}</i>
          <div class="eg-tx">
            <h2><span class="eg-nome">${esc(o.cliente_nome || 'Cliente')}</span>${etapaChip(I)}${flagHTML(I)}</h2>
            <div class="eg-sub">
              <span>${ic('map-pin')}${esc(cidade(o))}</span>
              <span>${ic('zap')}${kwp(o.kwp)}</span>
              <span>${ic('user-round')}${esc(o.vendedor || '—')}</span>
              <span>${ic('trophy')}venda ${esc(dmy(String(o.venda_em).slice(0, 10)))}</span>
              ${state.isAdmin && state.adminViewAll ? `<span>${ic('store')}${esc(franquiaNome(o.franquia_id))}</span>` : ''}
            </div>
          </div>
          <div class="eg-tsq">
            ${o.cliente_id && typeof openCrm360 === 'function' ? `<button class="eg-sq" onclick="obras.ficha()" title="Abrir ficha do cliente">${ic('user-round')}</button>` : ''}
            ${o.os ? `<button class="eg-sq" onclick="obras.imprimirOS()" title="Abrir a OS">${ic('printer')}</button>` : ''}
            <button class="eg-sq eg-sq-cheia" onclick="obras.cheia()" title="${O.cheia ? 'Voltar ao painel lateral' : 'Abrir em tela cheia'}">${ic(O.cheia ? 'minimize-2' : 'maximize-2')}</button>
            <button class="eg-sq" onclick="obras.fechar()" title="Fechar (Esc)">${ic('x')}</button>
          </div>
        </div>
        ${passosHTML(o, I)}
        ${sumHTML(o, I)}
        ${avisoHTML(o, I)}
        <div class="eg-tabs" role="tablist">${abas.map(([k, i, l, w]) => `<button role="tab" aria-selected="${O.aba === k}" class="${O.aba === k ? 'on' : ''}" onclick="obras.aba('${k}')">${ic(i)}${l}${w ? '<em class="w">!</em>' : ''}</button>`).join('')}</div>
      </div>
      <div class="eg-pb"><div class="ob-split"><div class="ob-main">${corpo(o, I)}</div>
        <aside class="ob-side">${lado}${O.aba !== 'timeline' ? `<div class="rd-card"><h3>${ic('history')}Últimas movimentações<button class="rd-btn sm ghost" style="margin-left:auto" onclick="obras.aba('timeline')">Ver tudo</button></h3>${timelineHTML(o, 4)}</div>` : ''}</aside></div></div>
    </div>`;
    icons();
    const np = d.querySelector('.eg-pb');
    if (np && y && !novo) np.scrollTop = y;
  }

  const btnPri = (onclick, icone, txt) => `<button type="button" class="eg-btn pri" onclick="${onclick}">${ic(icone)}${txt}</button>`;
  const btnOk = (onclick, icone, txt) => `<button type="button" class="eg-btn ok" onclick="${onclick}">${ic(icone)}${txt}</button>`;
  const btn = (onclick, icone, txt, extra = '') => `<button type="button" class="rd-btn" onclick="${onclick}" ${extra}>${ic(icone)}${txt}</button>`;

  function proximoHTML(o, I) {
    const id = o.venda_id;
    if (I.etapa === 'os') {
      if (!o.eng) return `<div class="ob-next warn"><div class="t">${ic('send')}Ainda não foi enviado à engenharia</div><p>O envio é feito pela ficha do cliente, na aba Engenharia. Sem o projeto não sai a OS.</p><div class="acts">${o.cliente_id ? btn(`obras.ficha('engenharia')`, 'user-round', 'Abrir ficha do cliente') : ''}</div></div>`;
      if (I.prio && I.prio.status === 'pedida') return `<div class="ob-next warn"><div class="t">${ic('fast-forward')}Pedido de prioridade enviado</div><p>Pedido em ${esc(quando(I.prio.em))} por ${esc(I.prio.por || '—')}: <b>${esc(I.prio.motivo || '')}</b>${I.prio.texto ? ' · ' + esc(I.prio.texto) : ''}. Quando a OS sair, a obra anda sozinha.</p></div>`;
      if (I.prio && I.prio.status === 'recusada') return `<div class="ob-next warn"><div class="t">${ic('circle-x')}A engenharia recusou passar na frente</div><p>${esc(I.prio.resp_por || 'Engenharia')}: ${esc(I.prio.resposta || '')}</p><div class="acts">${btnPri(`obras.prioridadeModal()`, 'fast-forward', 'Pedir de novo')}</div></div>`;
      return `<div class="ob-next"><div class="t">${ic('clipboard-list')}Aguardando a OS da engenharia</div><p>O projeto ${esc(pnum(o.eng))} está em <b>${esc((ENG_ST[o.eng.status] || o.eng.status).toLowerCase())}</b>. Enquanto isso, dá para acompanhar o kit e comprar a elétrica. Se o cliente precisar passar na frente, peça a OS antecipada.</p><div class="acts">${btnPri(`obras.prioridadeModal()`, 'fast-forward', 'Passar na frente')}${btn(`obras.aba('material')`, 'truck', 'Ver material')}</div></div>`;
    }
    if (I.etapa === 'material') {
      const falta = faltaTexto(o, I).join(' e ');
      return `<div class="ob-next ${I.k.late ? 'warn' : ''}"><div class="t">${ic('package')}Falta ${esc(falta)}</div><p>Com o kit entregue e a elétrica comprada, a obra vai sozinha para <b>Pronta p/ agendar</b>.</p><div class="acts">${I.k.st !== 'ok' ? btnPri(`obras.entregaModal()`, 'package-check', 'Registrar entrega do kit') : ''}${!I.e.ok ? btn(`obras.aba('eletrica')`, 'plug-zap', 'Comprar elétrica') : ''}</div></div>`;
    }
    if (I.etapa === 'pronta') return `<div class="ob-next"><div class="t">${ic('calendar-plus')}Pronta para agendar</div><p>OS, kit e elétrica ok. Escolha a data e a equipe.</p><div class="acts">${btnPri(`obras.agendarModal('${id}')`, 'calendar-plus', 'Agendar instalação')}</div></div>`;
    if (I.etapa === 'agendada') {
      const t = I.naObra ? 'Na obra hoje' : I.atrasada ? 'Passou da data' : 'Agendada';
      return `<div class="ob-next ${I.naObra || I.atrasada ? 'warn' : ''}"><div class="t">${ic(I.naObra ? 'hard-hat' : 'calendar-days')}${t} · ${esc(dataObra(I))} · ${esc(equipeNome(o))}</div><p>${I.atrasada ? 'Se a instalação terminou, conclua a obra. Se não, reagende.' : 'O vendedor confirma a data com o cliente. Terminou a instalação, é só concluir.'}</p><div class="acts">${btnOk(`obras.concluirModal()`, 'circle-check', 'Concluir obra')}${btn(`obras.agendarModal('${id}')`, 'calendar-clock', 'Reagendar')}</div></div>`;
    }
    const pend = I.posPend.map((x) => (x === 'medidor' ? 'a troca do medidor pela concessionária' : 'o monitoramento comunicando'));
    return `<div class="ob-next ok"><div class="t">${ic('circle-check')}Obra concluída em ${esc(dmy(I.pos.obra_concluida_em || I.pos.obra_data))}</div><p>${pend.length ? 'Falta fechar ' + esc(pend.join(' e ')) + '. Atualize no Resumo.' : 'Tudo certo: medidor trocado e sistema monitorando.'}</p></div>`;
  }

  const kv = (l, v) => `<div><div class="l">${l}</div><div class="v">${v}</div></div>`;
  const segmHTML = (opcoes, atual, onclick) => `<div class="ob-segm">${opcoes.map(([k, l]) => `<button type="button" class="${atual === k ? 'on' : ''}" ${atual === k ? 'disabled' : `onclick="${onclick.replace('$', k)}"`}>${esc(l)}</button>`).join('')}</div>`;

  function abaResumo(o, I) {
    const e = o.eng || {};
    const pos = I.pos;
    const custoKit = o.oc && Number(o.oc.valor) ? money(o.oc.valor) : '—';
    return `${proximoHTML(o, I)}
      ${I.etapa === 'concluida' ? `<div class="rd-card"><h3>${ic('gauge')}Pós-obra</h3>
        <div class="ob-linha"><span style="min-width:120px;font-weight:700">Medidor</span>${segmHTML(MEDIDOR, pos.medidor_status || 'aguardando', `obras.salvar({medidor_status:'$'})`)}</div>
        <div class="ob-linha"><span style="min-width:120px;font-weight:700">Monitoramento</span>${segmHTML(MON, pos.mon_status || 'pendente', `obras.salvar({mon_status:'$'})`)}</div>
        <div class="ob-linha"><button type="button" class="rd-btn sm ghost" onclick="obras.desfazerConclusao()">${ic('undo-2')}Desfazer conclusão</button></div></div>` : ''}
      <div class="rd-card"><h3>${ic('map-pin')}Cliente e local</h3><div class="rd-kv">
        ${kv('Cliente', esc(o.cliente_nome || '—'))}${kv('Telefone', esc(o.telefone || '—'))}${kv('Cidade', esc(cidade(o)) + (o.uf ? ' - ' + esc(o.uf) : ''))}
        ${kv('Endereço', esc(o.endereco || '—'))}${kv('Telhado', esc(e.telhado || '—'))}${kv('Ligação', esc(LIG[e.ligacao] || '—'))}
        ${kv('Vendedor', esc(o.vendedor || '—'))}${kv('Venda', esc(dmy(String(o.venda_em).slice(0, 10))))}${kv('Valor da venda', money(o.valor))}</div></div>
      <div class="rd-card"><h3>${ic('sun')}Sistema</h3><div class="rd-kv">
        ${kv('Potência', kwp(o.kwp))}${kv('Kit', esc(o.kit_nome || '—'))}${kv('Distribuidor', esc((o.oc && o.oc.fornecedor) || '—'))}
        ${kv('Projeto', o.eng ? esc(pnum(o.eng) + ' · ' + (ENG_ST[o.eng.status] || o.eng.status)) : 'Não enviado')}</div></div>
      <div class="rd-card"><h3>${ic('receipt')}Custo da obra<span class="r">entra no resultado da venda</span></h3><div class="rd-kv">
        ${kv('Kit (ordem de compra)', custoKit)}${kv('Elétrica', Number(pos.eletrica_total) ? money(pos.eletrica_total) : I.e.ok ? '—' : 'a comprar')}</div></div>`;
  }

  function abaMaterial(o, I) {
    const pos = I.pos, oc = o.oc;
    const passos = [
      { l: 'Compra', d: oc ? (OC_ST[oc.status] || oc.status) : 'não lançada', st: I.k.passo >= 2 ? 'ok' : 'at' },
      { l: 'A caminho', d: (oc ? oc.previsao : pos.kit_previsao) ? 'previsão ' + dm(oc ? oc.previsao : pos.kit_previsao) : 'sem previsão', st: I.k.passo >= 3 ? 'ok' : I.k.passo === 2 ? (I.k.late ? 'late' : 'at') : '' },
      { l: 'Entregue', d: I.k.passo >= 3 ? I.k.d : '', st: I.k.passo >= 3 ? 'ok' : '' },
    ];
    const prev = (oc ? oc.previsao : pos.kit_previsao) || '';
    return `<div class="rd-card"><h3>${ic('truck')}Kit${oc && oc.codigo ? `<span class="r">ordem ${esc(oc.codigo)}</span>` : ''}</h3>
        <div class="ob-track">${passos.map((p) => `<div class="${p.st}"><i>${p.st === 'ok' ? ic('check') : p.st === 'late' ? ic('triangle-alert') : ''}</i>${p.l}<small>${esc(p.d)}</small></div>`).join('')}</div>
        <div class="rd-kv" style="margin-top:16px">
          ${kv('Distribuidor', esc((oc && oc.fornecedor) || '—'))}${kv('Situação no Financeiro', esc(oc ? OC_ST[oc.status] || oc.status : 'Compra não lançada'))}${kv('Valor do kit', oc && Number(oc.valor) ? money(oc.valor) : '—')}
        </div>
        <div class="rd-fgrid">
          <div class="rd-fld"><label for="ob-prev">Previsão de entrega</label><input id="ob-prev" type="date" value="${esc(prev)}" ${I.k.passo >= 3 ? 'disabled' : ''} onchange="obras.kit({previsao:this.value})"></div>
          <div class="rd-fld"><label>Entregar em</label>${segmHTML([['unidade', 'Na unidade'], ['obra', 'Direto na obra']], pos.kit_entrega_local || '', `obras.kit({local:'$'})`)}</div>
        </div>
        ${pos.kit_obs ? `<p class="ob-nota">${ic('clipboard-check')}<span>Recebimento: ${esc(pos.kit_obs)}</span></p>` : ''}
        ${!oc ? `<p class="ob-nota">${ic('info')}<span>A compra do kit ainda não foi lançada no Financeiro. Dá para registrar a previsão e a entrega aqui mesmo.</span></p>` : ''}
        <div class="ob-linha">
          ${I.k.passo >= 3 ? `<button type="button" class="rd-btn sm ghost" onclick="obras.desfazerEntrega()">${ic('undo-2')}Desfazer entrega</button>` : btnPri(`obras.entregaModal()`, 'package-check', 'Registrar entrega do kit')}
          <span class="rd-grow"></span>
          ${state.canFin && oc && window.vendasAndamento && vendasAndamento.irFinanceiro ? btn(`obras.irFinanceiro()`, 'arrow-up-right', 'Ver no Financeiro') : ''}
        </div></div>`;
  }

  // ------------------------------------------------------------ elétrica
  const arred5 = (n) => Math.max(5, Math.ceil((Number(n) || 0) / 5) * 5);
  function gerarItens(o) {
    const os = o.os || {}, pr = os.protecoes || {};
    const micro = !!os.micro;
    const dist = Number(os.distancia_m || (o.eng && o.eng.distancia_m)) || 15;
    const strings = (Array.isArray(os.distribution) ? os.distribution : []).reduce((a, d) => a + (Number(d.numStrings) || 0), 0) || 1;
    const nInv = Number(os.inversores) || 1;
    const distCA = Number(pr.queda && pr.queda.dist) || 10;
    const caboCA = pr.cabo ? String(pr.cabo).replace('.', ',') : '6';
    const tri = String(pr.polos || '').startsWith('tri');
    const vias = Number(pr.carregados) || (tri ? 4 : 2);
    const disj = `Disjuntor ${pr.polos || 'bipolar'}${pr.disjuntor ? ' ' + pr.disjuntor + ' A' : ''} curva C`;
    const itens = [];
    if (!micro) {
      itens.push({ nome: 'Cabo solar 4 mm² vermelho', qtd: arred5(strings * (dist + 5)), un: 'm' });
      itens.push({ nome: 'Cabo solar 4 mm² preto', qtd: arred5(strings * (dist + 5)), un: 'm' });
    }
    itens.push({ nome: `Cabo flexível ${caboCA} mm² (CA)`, qtd: arred5(distCA * vias), un: 'm' });
    itens.push({ nome: `Cabo ${pr.pe ? String(pr.pe).replace('.', ',') : caboCA} mm² verde/amarelo (aterramento)`, qtd: arred5(distCA + 10), un: 'm' });
    itens.push({ nome: disj, qtd: nInv, un: 'un' });
    itens.push({ nome: 'DPS CA classe II 275 V', qtd: tri ? 4 : 2, un: 'un' });
    itens.push({ nome: 'Haste de aterramento 2,4 m + conector', qtd: 1, un: 'un' });
    itens.push({ nome: 'Eletroduto corrugado 3/4"', qtd: arred5(distCA), un: 'm' });
    itens.push({ nome: 'Quadro de sobrepor para disjuntor e DPS', qtd: 1, un: 'un' });
    itens.push({ nome: 'Abraçadeiras, buchas e fita isolante', qtd: 1, un: 'kit' });
    return itens.map((x) => ({ ...x, valor: 0, comprado: false, falta: false }));
  }
  function rascunho(o) {
    if (!O.el[o.venda_id]) {
      const pos = o.pos || {};
      const itens = Array.isArray(pos.eletrica_itens) && pos.eletrica_itens.length ? pos.eletrica_itens.map((x) => ({ ...x })) : [];
      O.el[o.venda_id] = { itens, forn: pos.eletrica_fornecedor || '', sujo: false, gerada: false };
      if (!itens.length) { O.el[o.venda_id].itens = gerarItens(o); O.el[o.venda_id].gerada = true; O.el[o.venda_id].sujo = true; }
    }
    return O.el[o.venda_id];
  }
  const totalItens = (itens) => itens.reduce((a, x) => a + (Number(x.valor) || 0), 0);
  function abaEletrica(o, I) {
    const R = rascunho(o);
    const s = I.pos.eletrica_status || 'a_comprar';
    const linhas = R.itens.map((x, i) => `<tr class="${x.falta ? 'falta' : ''}">
        <td class="c-k"><input type="checkbox" ${x.comprado ? 'checked' : ''} onchange="obras.elSet(${i},'comprado',this.checked)" aria-label="Comprado"></td>
        <td><input class="tx" value="${esc(x.nome)}" onchange="obras.elSet(${i},'nome',this.value)" aria-label="Item">${x.falta ? '<span class="falta-tag">faltando</span>' : ''}</td>
        <td class="c-q"><input class="nu" inputmode="decimal" value="${esc(String(x.qtd ?? '').replace('.', ','))}" onchange="obras.elSet(${i},'qtd',this.value)" aria-label="Quantidade"></td>
        <td class="c-u"><input class="tx" value="${esc(x.un || '')}" onchange="obras.elSet(${i},'un',this.value)" aria-label="Unidade"></td>
        <td class="c-v"><input class="nu" inputmode="decimal" value="${Number(x.valor) ? esc(nf(x.valor, 2)) : ''}" placeholder="R$" onchange="obras.elSet(${i},'valor',this.value)" aria-label="Valor"></td>
        <td class="c-x"><button type="button" class="x" onclick="obras.elDel(${i})" title="Tirar item">${ic('trash-2')}</button></td></tr>`).join('');
    return `<div class="rd-card"><h3>${ic('plug-zap')}Material elétrico<span class="r">${segmHTML(ELET, s, `obras.elStatus('$')`)}</span></h3>
        ${R.gerada ? `<p class="ob-nota">${ic('sparkles')}<span>${o.os ? `Lista sugerida pela ${esc(o.os.numero)} (cabos e proteções do dimensionamento).` : 'Lista sugerida pelo padrão do kit. Quando a OS sair, confira as quantidades.'} Ajuste e salve.</span></p>` : ''}
        <table class="ob-el"><thead><tr><th class="c-k" title="Comprado">${ic('check')}</th><th>Item</th><th class="c-q r">Qtd</th><th class="c-u">Un.</th><th class="c-v r">Valor (R$)</th><th class="c-x"></th></tr></thead>
          <tbody>${linhas}</tbody>
          <tfoot><tr class="ft"><td></td><td>Total</td><td colspan="2"></td><td class="r" id="ob-el-tot">${money(totalItens(R.itens))}</td><td></td></tr></tfoot></table>
        <div class="rd-fgrid"><div class="rd-fld full"><label for="ob-el-forn">Fornecedor</label><input id="ob-el-forn" value="${esc(R.forn)}" placeholder="Ex.: Casa do Eletricista" onchange="obras.elForn(this.value)"></div></div>
        <div class="ob-linha">
          <button type="button" class="rd-btn sm" onclick="obras.elAdd()">${ic('plus')}Incluir item</button>
          <button type="button" class="rd-btn sm ghost" onclick="obras.elGerar()">${ic('refresh-cw')}Refazer pela OS</button>
          <span class="rd-grow"></span>
          ${R.sujo ? btnPri(`obras.elSalvar()`, 'save', 'Salvar lista') : ''}
        </div></div>
      ${R.itens.length ? `<button type="button" class="eg-btn ${I.e.ok ? 'pri' : 'oks'}" style="width:100%;justify-content:center;height:46px" onclick="obras.confAbrir()">${ic('list-checks')}${I.pos.eletrica_conferida_em ? 'Conferir os itens de novo' : 'Conferir itens (modo conferência)'}</button>
        ${I.pos.eletrica_conferida_em ? `<p class="ob-nota">${ic('clipboard-check')}<span>Conferida em ${esc(quando(I.pos.eletrica_conferida_em))}.</span></p>` : ''}` : ''}`;
  }

  // ------------------------------------------------------------ OS
  function arranjoTexto(os) {
    if (os.micro) return `${nf(os.inversores || 1)} microinversor${Number(os.inversores) > 1 ? 'es' : ''}`;
    const d = (Array.isArray(os.distribution) ? os.distribution : []).filter((x) => Number(x.numStrings) > 0);
    if (!d.length) return '—';
    return d.map((x) => `${x.numStrings} string${x.numStrings > 1 ? 's' : ''} de ${x.modulesPerString} módulos`).join(' + ');
  }
  function abaOS(o, I) {
    const os = o.os;
    if (!os) {
      const e = o.eng;
      let acoes = '';
      if (!e) acoes = o.cliente_id ? btn(`obras.ficha('engenharia')`, 'user-round', 'Abrir ficha do cliente') : '';
      else if (I.prio && I.prio.status === 'pedida') acoes = '';
      else acoes = btnPri(`obras.prioridadeModal()`, 'fast-forward', I.prio && I.prio.status === 'recusada' ? 'Pedir de novo' : 'Passar na frente');
      return `<div class="rd-card"><div class="ob-vaz"><span class="ic">${ic('clipboard-list')}</span><b>${e ? 'A engenharia ainda não emitiu a OS' : 'Ainda não foi enviado à engenharia'}</b>
        <p>${e ? `Projeto ${esc(pnum(e))} · ${esc(ENG_ST[e.status] || e.status)}.` : 'O vendedor envia pela ficha do cliente, na aba Engenharia.'}</p>
        ${I.prio && I.prio.status === 'pedida' ? `<div class="eg-aviso" style="text-align:left">${ic('fast-forward')}<span>Prioridade pedida em ${esc(quando(I.prio.em))} por ${esc(I.prio.por || '—')}: ${esc(I.prio.motivo || '')}. Aguardando a engenharia.</span></div>` : ''}
        ${I.prio && I.prio.status === 'recusada' ? `<div class="eg-aviso r" style="text-align:left">${ic('circle-x')}<span>Recusado por ${esc(I.prio.resp_por || 'engenharia')}: ${esc(I.prio.resposta || '')}</span></div>` : ''}
        <div class="ob-linha">${acoes}</div></div></div>`;
    }
    const pr = os.protecoes || {};
    return `${I.antecipada ? `<div class="eg-aviso">${ic('fast-forward')}<span>OS antecipada: emitida a pedido da unidade (${esc(I.prio.motivo || '')}${I.prio.texto ? ' · ' + esc(I.prio.texto) : ''}).</span></div>` : ''}
      <div class="rd-card"><h3>${ic('file-text')}${esc(os.numero)}${os.revisao > 1 ? ' · revisão ' + os.revisao : ''}<span class="r">emitida em ${esc(quando(os.em))}${os.por ? ' por ' + esc(os.por) : ''}</span></h3>
        <div class="rd-kv">
          ${kv('Projeto', esc(pnum(o.eng) + ' · ' + (ENG_ST[o.eng.status] || o.eng.status)))}${kv('Arranjo', esc(arranjoTexto(os)))}${kv('Equipe na OS', esc(os.equipe || '—'))}
          ${kv('Proteção CA', pr.disjuntor ? esc(`Disjuntor ${pr.polos || ''} ${pr.disjuntor} A curva C · DPS classe II`) : '—')}${kv('Cabo CA', pr.cabo ? esc(String(pr.cabo).replace('.', ',') + ' mm² · ' + (pr.condutores || '')) : '—')}${kv('Cabo CC', os.micro ? 'Cabo tronco do micro' : '4 mm² solar')}
        </div>
        <div class="ob-linha">${btnPri(`obras.imprimirOS()`, 'printer', 'Abrir OS')}</div>
        <p class="ob-nota">${ic('info')}<span>A OS é a mesma da engenharia. Mudou o kit ou o arranjo? A engenharia gera uma revisão e ela aparece aqui.</span></p></div>`;
  }

  // ------------------------------------------------------------ agenda da obra
  function abaAgenda(o, I) {
    const pos = I.pos;
    const remarc = (O.tl[o.venda_id] || []).filter((x) => /Data da instalação:/.test(x.t) && !/Data da instalação: —/.test(x.t));
    const remHTML = remarc.length ? `<div class="ob-tl">${remarc.map((x) => `<div><span>${esc(x.t.split(' · ').filter((p) => /Data da instalação|Equipe|Duração/.test(p)).join(' · '))}<small>${esc(quando(x.em))} · ${esc(x.quem)}</small></span></div>`).join('')}</div>` : `<p class="ob-nota">${ic('info')}<span>Nenhuma remarcação.</span></p>`;
    if (I.etapa === 'concluida') {
      return `<div class="rd-card"><h3>${ic('circle-check')}Instalação feita</h3><div class="rd-kv">${kv('Concluída em', esc(dmy(pos.obra_concluida_em || pos.obra_data)))}${kv('Equipe', esc(equipeNome(o)))}${kv('Agendada para', esc(dataObra(I) || '—'))}</div></div>
        <div class="rd-card"><h3>${ic('history')}Remarcações</h3>${remHTML}</div>`;
    }
    if (I.etapa !== 'agendada') {
      const pronta = I.etapa === 'pronta';
      return `<div class="rd-card"><div class="ob-vaz"><span class="ic">${ic('calendar-days')}</span><b>Sem data marcada</b>
        <p>${pronta ? 'OS, kit e elétrica ok. Já pode agendar.' : 'Ainda falta ' + esc(faltaTexto(o, I).join(', ')) + '. Dá para agendar, mas confira antes do dia.'}</p>
        <div class="ob-linha">${pronta ? btnPri(`obras.agendarModal('${o.venda_id}')`, 'calendar-plus', 'Agendar instalação') : btn(`obras.agendarModal('${o.venda_id}')`, 'calendar-plus', 'Agendar mesmo assim')}</div></div></div>`;
    }
    const eq = (O.equipes || []).find((e) => e.id === pos.obra_equipe_id);
    return `<div class="rd-card"><h3>${ic('calendar-days')}Instalação</h3><div class="rd-kv">
        ${kv('Data', esc(dataObra(I)))}${kv('Duração', `${I.dur} dia${I.dur > 1 ? 's' : ''}`)}${kv('Equipe', esc(equipeNome(o)))}
        ${kv('Integrantes', esc((eq && eq.integrantes) || (eq && eq.terceirizada ? 'Terceirizada' : '—')))}${kv('Endereço', esc(o.endereco || '—'))}${kv('Telefone do cliente', esc(o.telefone || '—'))}</div>
        <div class="ob-linha"><span style="font-weight:700">Confirmado com o cliente</span>${segmHTML([['true', 'Sim'], ['false', 'Ainda não']], pos.obra_confirmada === true ? 'true' : 'false', `obras.salvar({obra_confirmada:$})`)}</div>
        <div class="ob-linha">${btnOk(`obras.concluirModal()`, 'circle-check', 'Concluir obra')}${btn(`obras.agendarModal('${o.venda_id}')`, 'calendar-clock', 'Reagendar')}<span class="rd-grow"></span><button type="button" class="rd-btn sm ghost" onclick="obras.desmarcar()">${ic('calendar-x')}Tirar da agenda</button></div></div>
      <div class="rd-card"><h3>${ic('message-square')}Recado para a equipe</h3>
        <textarea id="ob-recado" class="ob-recado" maxlength="500" placeholder="Ex.: portão lateral, cliente só em casa depois das 8h, levar andaime" oninput="obras.recadoSujo()">${esc(pos.obra_recado || '')}</textarea>
        <div class="ob-linha" id="ob-recado-bt" style="display:none"><span class="rd-grow"></span>${btnPri(`obras.salvarRecado()`, 'save', 'Salvar recado')}</div></div>
      <div class="rd-card"><h3>${ic('history')}Remarcações</h3>${remHTML}</div>`;
  }

  // ------------------------------------------------------------ timeline
  async function carregarTimeline(o) {
    if (!o.cliente_id) { O.tl[o.venda_id] = []; return; }
    try {
      const [c, e] = await Promise.all([
        sb().from('crm_atividades').select('tipo, descricao, meta, autor_email, created_at').eq('cliente_id', o.cliente_id).in('tipo', ['venda', 'engenharia']).order('created_at', { ascending: false }).limit(80),
        o.eng ? sb().from('eng_eventos').select('tipo, texto, autor_nome, created_at').eq('projeto_id', o.eng.id).in('tipo', ['os', 'alerta']).order('created_at', { ascending: false }).limit(30) : Promise.resolve({ data: [] }),
      ]);
      const itens = [];
      (c.data || []).forEach((x) => {
        const acao = x.meta && x.meta.acao;
        if (x.tipo === 'venda' && acao && !['obra', 'posvenda'].includes(acao)) return;
        if (x.tipo === 'venda' && acao && x.meta.venda_id && x.meta.venda_id !== o.venda_id) return;
        itens.push({ t: x.descricao || '', em: x.created_at, quem: nomePorEmail(x.autor_email), eng: x.tipo === 'engenharia' });
      });
      (e.data || []).forEach((x) => itens.push({ t: (x.tipo === 'os' ? 'Engenharia: ' : '') + (x.texto || ''), em: x.created_at, quem: x.autor_nome || 'Engenharia', eng: true }));
      itens.sort((a, b) => new Date(b.em) - new Date(a.em));
      O.tl[o.venda_id] = itens;
    } catch (err) { console.warn('[obras] timeline', err); O.tl[o.venda_id] = O.tl[o.venda_id] || []; }
  }
  function timelineHTML(o, max) {
    const l = O.tl[o.venda_id];
    if (!l) return `<p class="ob-nota">${ic('loader-2')}<span>Carregando...</span></p>`;
    if (!l.length) return `<p class="ob-nota">${ic('info')}<span>Nada registrado ainda.</span></p>`;
    return `<div class="ob-tl">${l.slice(0, max || l.length).map((x) => `<div class="${x.eng ? 'eng' : ''}"><span>${esc(x.t)}<small>${esc(quando(x.em))} · ${esc(x.quem)}</small></span></div>`).join('')}</div>`;
  }
  const abaTimeline = (o) => `<div class="rd-card"><h3>${ic('history')}Timeline da obra<span class="r">o que mudou, de → para</span></h3><div style="margin-top:12px">${timelineHTML(o)}</div></div>`;

  // ------------------------------------------------------------ gravar
  async function rpc(nome, args) {
    const { data, error } = await sb().rpc(nome, args);
    if (error) throw error;
    return data;
  }
  async function depoisDeGravar(msg) {
    const o = achar(O.aberta);
    await carregar(true);
    if (o) await carregarTimeline(o);
    if (msg) toast(msg);
    repintar();
  }
  async function salvar(dados, msg) {
    const id = O.aberta; if (!id) return;
    try { await rpc('obra_salvar', { p_venda_id: id, p_dados: dados }); await depoisDeGravar(msg || 'Obra atualizada'); }
    catch (e) { console.error('[obras] salvar', e); toast('Não foi possível salvar: ' + (e.message || e)); }
  }
  async function kit(dados, msg) {
    const id = O.aberta; if (!id) return;
    try { await rpc('obra_kit', { p_venda_id: id, p_dados: dados }); await depoisDeGravar(msg || 'Kit atualizado'); }
    catch (e) { console.error('[obras] kit', e); toast('Não foi possível salvar: ' + (e.message || e)); }
  }

  // ------------------------------------------------------------ modais
  function modal(html) {
    fecharModal();
    const s = document.createElement('div');
    s.className = 'rd-scrim';
    s.id = 'ob-scrim';
    s.style.zIndex = '170';
    s.innerHTML = `<div class="rd-modal rd eg ob-modal" role="dialog" aria-modal="true">${html}</div>`;
    s.addEventListener('mousedown', (e) => { if (e.target === s) fecharModal(); });
    document.body.appendChild(s);
    icons();
    const f = s.querySelector('input:not([type=hidden]):not([type=radio]), select, textarea');
    if (f && !celular()) f.focus();
  }
  function fecharModal() { const s = document.getElementById('ob-scrim'); if (s) s.remove(); }
  const val = (id) => { const el = document.getElementById(id); return el ? String(el.value).trim() : ''; };
  const erro = (m) => { const el = document.getElementById('ob-err'); if (el) el.textContent = m; };
  async function ocupado(btnEl, fn) {
    const h = btnEl && btnEl.innerHTML;
    if (btnEl) { btnEl.disabled = true; btnEl.innerHTML = ic('loader-2') + 'Aguarde...'; icons(); }
    try { return await fn(); } finally { if (btnEl && document.body.contains(btnEl)) { btnEl.disabled = false; btnEl.innerHTML = h; icons(); } }
  }

  // agendar: a partir da obra ou de um espaço livre da agenda (aí escolhe a obra)
  function agendarModal(id, preset) {
    const o = id ? achar(id) : null;
    const candidatas = id ? [] : obras().filter((x) => !['agendada', 'concluida'].includes(info(x).etapa))
      .sort((a, b) => (info(a).etapa === 'pronta' ? 0 : 1) - (info(b).etapa === 'pronta' ? 0 : 1));
    if (!id && !candidatas.length) { toast('Nenhuma obra esperando data.'); return; }
    const alvo = o || candidatas[0];
    const I = info(alvo);
    const data = (preset && preset.data) || I.ini || (() => { let d = addDias(hojeIso(), 1); while (dataDe(d).getDay() === 0) d = addDias(d, 1); return d; })();
    const eqSel = (preset && preset.eq) || (I.pos.obra_equipe_id || '');
    const dur = I.pos.obra_dias || (Number(alvo.kwp) > 9 ? 2 : 1);
    O.agAlvo = alvo.venda_id;
    modal(`<h3>${ic('calendar-plus')} ${I.etapa === 'agendada' ? 'Reagendar instalação' : 'Agendar instalação'}</h3>
      <p class="sub">${o ? `<b>${esc(o.cliente_nome)}</b> · ${esc(cidade(o))} · ${kwp(o.kwp)}` : 'Escolha a obra, o dia e a equipe.'}</p>
      <div class="rd-fgrid">
        ${!o ? `<div class="rd-fld full"><label for="ob-ag-obra">Obra</label><select id="ob-ag-obra" onchange="obras.agAlvo(this.value)">${candidatas.map((x) => { const J = info(x); return `<option value="${x.venda_id}">${esc(x.cliente_nome)} · ${esc(cidade(x))}${J.etapa === 'pronta' ? '' : ' (falta ' + esc(faltaTexto(x, J).join(', ')) + ')'}</option>`; }).join('')}</select></div>` : ''}
        <div class="rd-fld"><label for="ob-ag-data">Início</label><input id="ob-ag-data" type="date" value="${data}" min="${hojeIso()}" onchange="obras.agCheck()"></div>
        <div class="rd-fld"><label for="ob-ag-dur">Duração</label><select id="ob-ag-dur" onchange="obras.agCheck()">${[1, 2, 3, 4, 5].map((n) => `<option value="${n}" ${Number(dur) === n ? 'selected' : ''}>${n} dia${n > 1 ? 's' : ''}</option>`).join('')}</select></div>
        <div class="rd-fld full"><label for="ob-ag-eq">Equipe</label><select id="ob-ag-eq" onchange="obras.agCheck()"></select></div>
      </div>
      <div id="ob-ag-av"></div>
      <div class="eg-aviso g">${ic('message-circle')}<span>Depois de agendar, o vendedor confirma a data com o cliente.</span></div>
      <div class="rd-err" id="ob-err"></div>
      <div class="rd-mfoot"><button type="button" class="rd-btn" onclick="obras.fecharModal()">Cancelar</button><button type="button" class="rd-btn blue" id="ob-ag-ok" onclick="obras.agConfirmar(this)">${ic('check')}${I.etapa === 'agendada' ? 'Reagendar' : 'Agendar'}</button></div>`);
    O.agEqPreset = eqSel;
    agEquipes();
    agCheck();
  }
  function agEquipes() {
    const alvo = achar(O.agAlvo); const sel = document.getElementById('ob-ag-eq'); if (!alvo || !sel) return;
    const eqs = equipesAtivas(alvo.franquia_id);
    const atual = sel.value || O.agEqPreset || '';
    sel.innerHTML = `<option value="">${eqs.length ? 'Escolha a equipe' : 'Nenhuma equipe cadastrada'}</option>${eqs.map((e) => `<option value="${e.id}" ${atual === e.id ? 'selected' : ''}>${esc(e.nome)}${e.terceirizada ? ' · terceirizada' : ''}${e.integrantes ? ' · ' + esc(e.integrantes) : ''}</option>`).join('')}`;
  }
  function agCheck() {
    const av = document.getElementById('ob-ag-av'); const alvo = achar(O.agAlvo); if (!av || !alvo) return;
    const ini = val('ob-ag-data'), dur = Number(val('ob-ag-dur')) || 1, eq = val('ob-ag-eq');
    const fim = ini ? addDias(ini, dur - 1) : '';
    const avisos = [];
    if (!equipesAtivas(alvo.franquia_id).length) avisos.push(`<div class="eg-aviso">${ic('users')}<span>Cadastre uma equipe para agendar. <button type="button" class="rd-btn sm" style="margin-left:6px" onclick="obras.equipesModal()">Cadastrar equipe</button></span></div>`);
    if (ini && dataDe(ini).getDay() === 0) avisos.push(`<div class="eg-aviso">${ic('calendar')}<span>Esse dia é domingo.</span></div>`);
    if (ini && eq) {
      const choque = obras().filter((x) => x.venda_id !== alvo.venda_id && (x.pos || {}).obra_equipe_id === eq && info(x).etapa === 'agendada')
        .filter((x) => { const J = info(x); return J.ini <= fim && J.fim >= ini; });
      if (choque.length) avisos.push(`<div class="eg-aviso r">${ic('triangle-alert')}<span>Essa equipe já está em ${choque.map((x) => esc(x.cliente_nome) + ' (' + esc(dataObra(info(x))) + ')').join(', ')}.</span></div>`);
    }
    const I = info(alvo);
    if (I.etapa !== 'pronta' && I.etapa !== 'agendada') avisos.push(`<div class="eg-aviso">${ic('package')}<span>Ainda falta ${esc(faltaTexto(alvo, I).join(', '))}. Confira antes do dia.</span></div>`);
    av.innerHTML = avisos.join('');
    icons();
  }
  async function agConfirmar(b) {
    const alvo = achar(O.agAlvo); if (!alvo) return;
    const ini = val('ob-ag-data'), dur = Number(val('ob-ag-dur')) || 1, eq = val('ob-ag-eq');
    if (!ini) { erro('Escolha a data de início.'); return; }
    if (!eq) { erro('Escolha a equipe.'); return; }
    await ocupado(b, async () => {
      try {
        await rpc('obra_salvar', { p_venda_id: alvo.venda_id, p_dados: { obra_status: 'agendada', obra_data: ini, obra_dias: dur, obra_equipe_id: eq } });
        fecharModal();
        const eqN = ((O.equipes || []).find((e) => e.id === eq) || {}).nome || '';
        await depoisDeGravar(`Agendada: ${diaCurto(ini)}${dur > 1 ? ' a ' + dm(addDias(ini, dur - 1)) : ''} · ${eqN}`);
      } catch (e) { erro(e.message || String(e)); }
    });
  }

  function concluirModal() {
    const o = achar(O.aberta); if (!o) return;
    modal(`<h3>${ic('circle-check')} Concluir obra</h3>
      <p class="sub"><b>${esc(o.cliente_nome)}</b> · ${esc(cidade(o))} · ${kwp(o.kwp)}</p>
      <div class="rd-fgrid"><div class="rd-fld"><label for="ob-cc-data">Concluída em</label><input id="ob-cc-data" type="date" value="${hojeIso()}" max="${hojeIso()}"></div></div>
      <div class="eg-aviso g">${ic('landmark')}<span>A engenharia é avisada para pedir a vistoria da concessionária. A etapa Obra da venda fica como concluída.</span></div>
      <div class="rd-err" id="ob-err"></div>
      <div class="rd-mfoot"><button type="button" class="rd-btn" onclick="obras.fecharModal()">Cancelar</button><button type="button" class="eg-btn ok" onclick="obras.ccConfirmar(this)">${ic('check')}Concluir obra</button></div>`);
  }
  async function ccConfirmar(b) {
    const o = achar(O.aberta); if (!o) return;
    const data = val('ob-cc-data') || hojeIso();
    const pos = o.pos || {};
    await ocupado(b, async () => {
      try {
        const dados = { obra_status: 'concluida', obra_concluida_em: data };
        if (!pos.medidor_status) dados.medidor_status = 'aguardando';
        if (!pos.mon_status) dados.mon_status = 'pendente';
        if (!pos.obra_data) dados.obra_data = data;
        await rpc('obra_salvar', { p_venda_id: o.venda_id, p_dados: dados });
        fecharModal();
        await depoisDeGravar('Obra concluída · engenharia avisada');
      } catch (e) { erro(e.message || String(e)); }
    });
  }

  function prioridadeModal() {
    const o = achar(O.aberta); if (!o) return;
    modal(`<h3>${ic('fast-forward')} Passar na frente</h3>
      <p class="sub">Pede à engenharia a OS de <b>${esc(o.cliente_nome)}</b> antes da vez. O pedido entra no topo da fila dela e a OS sai marcada como <b>antecipada</b>.</p>
      <div class="rd-fgrid"><div class="rd-fld full"><label>Motivo</label><div class="ob-opts">${MOTIVOS.map((m, i) => `<label><input type="radio" name="ob-mot" value="${esc(m)}" ${i === 0 ? 'checked' : ''}>${esc(m)}</label>`).join('')}</div></div>
        <div class="rd-fld full"><label for="ob-mot-tx">Explique para a engenharia</label><textarea id="ob-mot-tx" maxlength="300" placeholder="Ex.: inauguração da loja dia 05/11, o kit já está na unidade"></textarea></div></div>
      <div class="eg-aviso g">${ic('bell')}<span>A engenharia recebe um aviso no sininho. Ela pode recusar com um motivo, que aparece aqui na obra.</span></div>
      <div class="rd-err" id="ob-err"></div>
      <div class="rd-mfoot"><button type="button" class="rd-btn" onclick="obras.fecharModal()">Cancelar</button><button type="button" class="eg-btn pri" onclick="obras.prioEnviar(this)">${ic('send')}Enviar pedido</button></div>`);
  }
  async function prioEnviar(b) {
    const o = achar(O.aberta); if (!o) return;
    const mot = (document.querySelector('input[name="ob-mot"]:checked') || {}).value || '';
    const tx = val('ob-mot-tx');
    if (mot === 'Outro motivo' && !tx) { erro('Explique o motivo para a engenharia.'); return; }
    await ocupado(b, async () => {
      try {
        await rpc('obra_pedir_prioridade', { p_venda_id: o.venda_id, p_motivo: mot, p_texto: tx || null });
        fecharModal();
        await depoisDeGravar('Pedido enviado à engenharia');
      } catch (e) { erro(e.message || String(e)); }
    });
  }

  function entregaModal() {
    const o = achar(O.aberta); if (!o) return;
    const pos = o.pos || {};
    modal(`<h3>${ic('package-check')} Registrar entrega do kit</h3>
      <p class="sub"><b>${esc(o.cliente_nome)}</b>${o.oc && o.oc.fornecedor ? ' · ' + esc(o.oc.fornecedor) : ''}</p>
      <div class="rd-fgrid">
        <div class="rd-fld"><label for="ob-en-data">Entregue em</label><input id="ob-en-data" type="date" value="${hojeIso()}" max="${hojeIso()}"></div>
        <div class="rd-fld"><label>Onde</label><div class="ob-opts"><label><input type="radio" name="ob-en-loc" value="unidade" ${pos.kit_entrega_local !== 'obra' ? 'checked' : ''}>Na unidade</label><label><input type="radio" name="ob-en-loc" value="obra" ${pos.kit_entrega_local === 'obra' ? 'checked' : ''}>Direto na obra</label></div></div>
        <div class="rd-fld full"><label>Recebimento</label><div class="ob-opts"><label><input type="radio" name="ob-en-rec" value="ok" checked>Conferido com a nota, tudo certo</label><label><input type="radio" name="ob-en-rec" value="prob">Com avaria ou faltando item</label></div></div>
        <div class="rd-fld full"><label for="ob-en-obs">Observação</label><textarea id="ob-en-obs" maxlength="300" placeholder="Ex.: 1 módulo com o vidro trincado, distribuidor avisado"></textarea></div>
      </div>
      <div class="rd-err" id="ob-err"></div>
      <div class="rd-mfoot"><button type="button" class="rd-btn" onclick="obras.fecharModal()">Cancelar</button><button type="button" class="eg-btn pri" onclick="obras.enConfirmar(this)">${ic('check')}Registrar entrega</button></div>`);
  }
  async function enConfirmar(b) {
    const data = val('ob-en-data');
    const loc = (document.querySelector('input[name="ob-en-loc"]:checked') || {}).value || 'unidade';
    const prob = ((document.querySelector('input[name="ob-en-rec"]:checked') || {}).value || 'ok') === 'prob';
    const obs = val('ob-en-obs');
    if (!data) { erro('Informe a data da entrega.'); return; }
    if (prob && !obs) { erro('Conte o que chegou com problema.'); return; }
    await ocupado(b, async () => {
      try {
        await rpc('obra_kit', { p_venda_id: O.aberta, p_dados: { entregue_em: data, local: loc, obs: prob ? 'Com problema: ' + obs : (obs || 'Conferido com a nota, tudo certo') } });
        fecharModal();
        await depoisDeGravar('Entrega do kit registrada');
      } catch (e) { erro(e.message || String(e)); }
    });
  }

  // equipes: lista + formulário (novo ou editando)
  function equipesModal(editId) {
    const lista = (typeof applyAdminGlobalScope === 'function' ? applyAdminGlobalScope(O.equipes || []) : (O.equipes || [])).slice().sort((a, b) => (b.ativa - a.ativa) || a.nome.localeCompare(b.nome));
    const ed = editId ? lista.find((e) => e.id === editId) : null;
    const precisaFranquia = !ed && state.isAdmin && verTodas();
    const franquias = (state.franquiasCatalog || []).slice().sort((a, b) => String(a.nome).localeCompare(String(b.nome)));
    modal(`<h3>${ic('users')} Equipes de instalação</h3>
      <p class="sub">Cada equipe vira uma linha na agenda.</p>
      <div class="ob-eqs">${lista.length ? lista.map((e) => `<div class="row ${e.ativa ? '' : 'off'}"><div><b>${esc(e.nome)}${e.terceirizada ? ' <span class="ob-chip">Terceirizada</span>' : ''}</b><small>${esc(e.integrantes || 'Sem integrantes informados')}${verTodas() ? ' · ' + esc(franquiaNome(e.franquia_id)) : ''}${e.ativa ? '' : ' · desativada'}</small></div>
          <button type="button" class="rd-btn sm ghost" onclick="obras.equipesModal('${e.id}')">${ic('pencil')}Editar</button>
          <button type="button" class="rd-btn sm ghost" onclick="obras.eqAtiva('${e.id}', ${!e.ativa})">${ic(e.ativa ? 'eye-off' : 'eye')}${e.ativa ? 'Desativar' : 'Reativar'}</button></div>`).join('') : '<div class="ob-vazio">Nenhuma equipe ainda.</div>'}</div>
      <div class="rd-fsec" style="margin-top:16px"><b>${ed ? 'Editar ' + esc(ed.nome) : 'Nova equipe'}</b></div>
      <div class="rd-fgrid">
        ${precisaFranquia ? `<div class="rd-fld full"><label for="ob-eq-fr">Unidade</label><select id="ob-eq-fr">${franquias.map((f) => `<option value="${f.id}" ${f.id === state.franquiaId ? 'selected' : ''}>${esc(f.nome)}</option>`).join('')}</select></div>` : ''}
        <div class="rd-fld"><label for="ob-eq-nome">Nome</label><input id="ob-eq-nome" maxlength="60" value="${esc(ed ? ed.nome : '')}" placeholder="Ex.: Equipe 1"></div>
        <div class="rd-fld"><label for="ob-eq-int">Integrantes</label><input id="ob-eq-int" maxlength="120" value="${esc(ed ? ed.integrantes || '' : '')}" placeholder="Ex.: Marcos (líder), Paulo, Diego"></div>
        <label class="rd-check full"><input type="checkbox" id="ob-eq-ter" ${ed && ed.terceirizada ? 'checked' : ''}>Equipe terceirizada</label>
      </div>
      <div class="rd-err" id="ob-err"></div>
      <div class="rd-mfoot">${ed ? `<button type="button" class="rd-btn" onclick="obras.equipesModal()">Cancelar edição</button>` : `<button type="button" class="rd-btn" onclick="obras.fecharModal()">Fechar</button>`}<button type="button" class="rd-btn blue" onclick="obras.eqSalvar(this, ${ed ? `'${ed.id}'` : 'null'})">${ic('check')}${ed ? 'Salvar' : 'Cadastrar equipe'}</button></div>`);
  }
  async function eqSalvar(b, id) {
    const nome = val('ob-eq-nome');
    if (!nome) { erro('Informe o nome da equipe.'); return; }
    const dados = { nome, integrantes: val('ob-eq-int'), terceirizada: !!(document.getElementById('ob-eq-ter') || {}).checked };
    if (!id && document.getElementById('ob-eq-fr')) dados.franquia_id = val('ob-eq-fr');
    await ocupado(b, async () => {
      try {
        await rpc('obra_equipe_salvar', { p_id: id, p_dados: dados });
        await carregar(true);
        toast(id ? 'Equipe atualizada' : 'Equipe cadastrada');
        if (document.getElementById('ob-ag-eq')) { fecharModal(); repintar(); return; }
        equipesModal();
        repintar();
      } catch (e) { erro(e.message || String(e)); }
    });
  }
  async function eqAtiva(id, ativa) {
    try { await rpc('obra_equipe_salvar', { p_id: id, p_dados: { ativa } }); await carregar(true); equipesModal(); repintar(); toast(ativa ? 'Equipe reativada' : 'Equipe desativada'); }
    catch (e) { toast('Não foi possível salvar: ' + (e.message || e)); }
  }

  // ------------------------------------------------------------ elétrica: edição e conferência
  function elRepintar() { pintarPainel(); }
  function elSet(i, campo, v) {
    const R = O.el[O.aberta]; if (!R || !R.itens[i]) return;
    R.itens[i][campo] = campo === 'qtd' || campo === 'valor' ? numIn(v) : campo === 'comprado' ? !!v : String(v || '').trim();
    R.sujo = true;
    if (campo === 'valor' || campo === 'comprado' || campo === 'nome') elRepintar();
    else { const t = document.getElementById('ob-el-tot'); if (t) t.textContent = money(totalItens(R.itens)); mostrarSalvar(); }
  }
  function mostrarSalvar() { if (!document.querySelector('.ob-panel [onclick="obras.elSalvar()"]')) elRepintar(); }
  function elAdd() { const R = O.el[O.aberta]; if (!R) return; R.itens.push({ nome: '', qtd: 1, un: 'un', valor: 0, comprado: false, falta: false }); R.sujo = true; elRepintar(); setTimeout(() => { const l = document.querySelectorAll('.ob-el tbody input.tx'); const ult = l[l.length - 2]; if (ult) ult.focus(); }, 30); }
  function elDel(i) { const R = O.el[O.aberta]; if (!R) return; R.itens.splice(i, 1); R.sujo = true; elRepintar(); }
  function elForn(v) { const R = O.el[O.aberta]; if (!R) return; R.forn = String(v || '').trim(); R.sujo = true; mostrarSalvar(); }
  function elGerar() {
    const o = achar(O.aberta); const R = O.el[O.aberta]; if (!o || !R) return;
    if (R.itens.length && !confirm('Refazer a lista pela OS? Os itens e valores que estão aqui serão trocados.')) return;
    R.itens = gerarItens(o); R.gerada = true; R.sujo = true; elRepintar();
  }
  const itensLimpos = (itens) => itens.filter((x) => x.nome).map((x) => ({ nome: x.nome, qtd: Number(x.qtd) || 0, un: x.un || '', valor: Math.round((Number(x.valor) || 0) * 100) / 100, comprado: !!x.comprado, falta: !!x.falta }));
  async function elSalvar(extra, msg) {
    const R = O.el[O.aberta]; if (!R) return;
    const itens = itensLimpos(R.itens);
    try {
      await rpc('obra_salvar', { p_venda_id: O.aberta, p_dados: { eletrica_itens: itens, eletrica_fornecedor: R.forn, eletrica_total: totalItens(itens), ...(extra || {}) } });
      O.el[O.aberta] = null;
      await depoisDeGravar(msg || 'Lista da elétrica salva');
    } catch (e) { toast('Não foi possível salvar: ' + (e.message || e)); }
  }
  function elStatus(s) {
    const R = O.el[O.aberta]; if (!R) return;
    if (s !== 'a_comprar') R.itens.forEach((x) => { x.comprado = true; });
    if (s === 'comprada' && !totalItens(R.itens) && !confirm('A lista está sem valores. Marcar como comprada mesmo assim? (o custo da elétrica fica zerado no resultado da venda)')) return;
    elSalvar({ eletrica_status: s }, 'Elétrica: ' + (ELET.find((x) => x[0] === s) || [, s])[1].toLowerCase());
  }
  function confAbrir() {
    const R = O.el[O.aberta]; if (!R || !R.itens.length) return;
    O.conf = { marcas: R.itens.map(() => '') };
    pintarConf();
  }
  function pintarConf() {
    const o = achar(O.aberta); const R = O.el[O.aberta];
    let c = document.getElementById('ob-conf');
    if (!O.conf || !o || !R) { if (c) c.remove(); return; }
    if (!c) { c = document.createElement('div'); c.id = 'ob-conf'; c.className = 'ob-conf rd'; document.body.appendChild(c); }
    const m = O.conf.marcas, n = m.length, ok = m.filter((x) => x === 'ok').length, falta = m.filter((x) => x === 'falta').length;
    const fim = ok + falta === n;
    c.setAttribute('role', 'dialog'); c.setAttribute('aria-label', 'Conferência da elétrica');
    c.innerHTML = `<div class="ob-conf-h"><button type="button" class="eg-sq" onclick="obras.confFechar()" aria-label="Voltar">${ic('arrow-left')}</button><div><b>Conferência da elétrica</b><small>${esc(o.cliente_nome)}</small></div><span class="n">${ok}/${n}</span></div>
      <div class="ob-conf-p"><i style="width:${(ok / n) * 100}%"></i></div>
      <div class="ob-conf-l">${R.itens.map((x, i) => `<button type="button" class="ob-conf-it ${m[i]}" onclick="obras.confToque(${i})"><span class="c">${ic(m[i] === 'falta' ? 'x' : 'check')}</span><span class="t">${esc(x.nome)}${m[i] === 'falta' ? '<small>faltando</small>' : ''}</span><span class="q">${esc(nf(x.qtd, Number(x.qtd) % 1 ? 1 : 0))} ${esc(x.un || '')}</span></button>`).join('')}</div>
      <div class="ob-conf-dica">Toque para marcar conferido. Toque de novo para marcar que falta.</div>
      <div class="ob-conf-f">${fim ? `<button type="button" class="eg-btn ${falta ? 'pri' : 'ok'}" onclick="obras.confFim(this)">${ic(falta ? 'triangle-alert' : 'circle-check')}${falta ? `Salvar com ${falta} ${falta > 1 ? 'itens faltando' : 'item faltando'}` : 'Tudo conferido'}</button>` : `<button type="button" class="eg-btn ok" disabled>${ic('list-checks')}Faltam ${n - ok - falta} ${n - ok - falta > 1 ? 'itens' : 'item'}</button>`}</div>`;
    icons();
  }
  function confToque(i) { const m = O.conf && O.conf.marcas; if (!m) return; m[i] = m[i] === '' ? 'ok' : m[i] === 'ok' ? 'falta' : ''; pintarConf(); }
  function confFechar() { O.conf = null; pintarConf(); }
  async function confFim(b) {
    const R = O.el[O.aberta]; if (!R || !O.conf) return;
    const m = O.conf.marcas;
    R.itens.forEach((x, i) => { x.falta = m[i] === 'falta'; x.comprado = true; });
    const faltando = R.itens.filter((x) => x.falta).map((x) => x.nome);
    if (b) { b.disabled = true; b.innerHTML = ic('loader-2') + 'Salvando...'; icons(); }
    const texto = faltando.length ? `Elétrica conferida com ${faltando.length} faltando: ${faltando.join(', ')}` : `Elétrica conferida: ${R.itens.length} de ${R.itens.length} itens`;
    O.conf = null; pintarConf();
    await elSalvar({ eletrica_status: faltando.length ? 'comprada' : 'separada', eletrica_conferida: true, conferencia_texto: texto },
      faltando.length ? `Conferência salva: ${faltando.length} ${faltando.length > 1 ? 'itens faltando' : 'item faltando'}` : 'Elétrica conferida e separada para a equipe');
  }

  // ------------------------------------------------------------ teclado / tamanho
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (document.getElementById('ob-scrim')) { e.stopPropagation(); fecharModal(); return; }
    if (O.conf) { e.stopPropagation(); confFechar(); return; }
    if (O.aberta && document.getElementById('ob-drawer')) { e.stopPropagation(); fechar(); }
  }, true);
  let tRes = null;
  window.addEventListener('resize', () => {
    clearTimeout(tRes);
    tRes = setTimeout(() => { if (naTela() && O.container && O.celular !== null && O.celular !== celular()) render(O.container); }, 150);
  });

  // ------------------------------------------------------------ API
  window.renderObras = render;
  window.obras = {
    render, carregar, abrir, fechar, fecharModal,
    aba: (k) => { O.aba = k; pintarPainel(); },
    cheia: () => { O.cheia = !O.cheia; lsSet('obras_cheia', O.cheia ? '1' : '0'); telaCheia(O.cheia); pintarPainel(); },
    vista: (v) => { O.vista = v; lsSet('obras_vista', v); render(O.container); },
    filtrar: (k) => { O.filtro = O.filtro === k ? '' : k; if (O.filtro && O.vista === 'agenda') { O.vista = 'lista'; lsSet('obras_vista', 'lista'); } render(O.container); },
    buscar: (q) => { O.q = q; clearTimeout(window.obras._t); window.obras._t = setTimeout(() => { render(O.container); const i = document.getElementById('ob-busca'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 200); },
    equipe: (id) => { O.eq = id; render(O.container); },
    semana: (n) => { O.semana = n === 0 ? 0 : O.semana + n; render(O.container); },
    mEtapa: (k) => { O.mEtapa = k; render(O.container); },
    ficha: (aba) => { const o = achar(O.aberta); if (!o || !o.cliente_id) return; fechar(); openCrm360(o.cliente_id, aba); },
    imprimirOS: () => { const o = achar(O.aberta); if (o && o.os && window.EV && EV.imprimirOS) EV.imprimirOS(o.os.id); else toast('A OS abre pelo módulo da engenharia.'); },
    irFinanceiro: () => { const o = achar(O.aberta); if (!o) return; fechar(); vendasAndamento.irFinanceiro('ordemcompra', o.cliente_id, o.venda_id); },
    salvar: (d) => salvar(d),
    kit: (d) => kit(d),
    desfazerEntrega: () => { if (confirm('Desfazer o registro de entrega do kit?')) kit({ entregue_em: '' }, 'Entrega desfeita'); },
    desmarcar: () => { if (confirm('Tirar esta obra da agenda? A data sai e ela volta para a fila.')) salvar({ obra_status: 'a_agendar', obra_data: '' }, 'Obra tirada da agenda'); },
    desfazerConclusao: () => { if (confirm('Desfazer a conclusão? A obra volta para Agendada.')) salvar({ obra_status: 'agendada' }, 'Conclusão desfeita'); },
    recadoSujo: () => { const b = document.getElementById('ob-recado-bt'); if (b) b.style.display = ''; },
    salvarRecado: () => salvar({ obra_recado: val('ob-recado') }, 'Recado salvo'),
    agendarModal, agendarSlot: (data, eq) => agendarModal(null, { data, eq }),
    agAlvo: (id) => { O.agAlvo = id; agEquipes(); agCheck(); },
    agCheck, agConfirmar, concluirModal, ccConfirmar, prioridadeModal, prioEnviar, entregaModal, enConfirmar,
    equipesModal, eqSalvar, eqAtiva,
    elSet, elAdd, elDel, elForn, elGerar, elSalvar: () => elSalvar(), elStatus, confAbrir, confToque, confFechar, confFim,
  };
})();
