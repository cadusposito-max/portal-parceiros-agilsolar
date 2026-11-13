// ==========================================
// VISUAL NOVO (v2) — FINANCEIRO NO PADRÃO DO COMERCIAL
// ------------------------------------------
// Mesmo esquema do ui-v2-om.js: a tela nova só assume quando o v2 está ativo;
// sem ele (ou numa aba ainda não refeita) o financeiro.js desenha a antiga.
// Os dados saem das mesmas RPCs (window.finRpc, com o guardado de 20s) e as
// ações abrem as mesmas janelas do financeiro.js (finTitBaixar, finTitReneg...).
// Carregado sob demanda junto com o financeiro.js (ver carregarFinanceiro).
//
// O Financeiro é organizado pelo caminho do dinheiro (aprovado em 05/11/2026):
//   Visão geral · Vendas (funil automático) · A receber · A pagar · Config
// Vendas: cada venda anda sozinha por 5 etapas (Aguardando pagamento → Recebendo
// → Comprar kit → Kit comprado → Finalizada), calculadas aqui a partir do que a
// RPC list_fin_vendas devolve (título, compra do kit e comissão). Ninguém arrasta.
// Config continua sendo a tela do financeiro.js.
// ==========================================

(function () {
  const v2on = () => !!(window.uiV2 && window.uiV2.isActive());
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ic = (n, x = '') => `<i data-lucide="${n}" ${x}></i>`;
  const brl = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  const brlC = (v) => (typeof formatCurrencyCompact === 'function' ? formatCurrencyCompact(Number(v) || 0) : brl(v));
  const curto = (v) => (Math.abs(Number(v) || 0) >= 100000 ? brlC(v) : brl(v)); // sem centavos; "mil" só acima de 100 mil
  const icons = () => { if (window.lucide) window.lucide.createIcons(); };
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
  function setPageMeta(key, title, sub) {
    window.uiV2PageMeta = { key, title, sub };
    if (window.uiV2Shell) window.uiV2Shell.refresh();
  }
  const box = () => document.getElementById('main-container');

  // datas: 'YYYY-MM-DD' → dias a partir de hoje
  const hoje = () => { const d = new Date(); d.setHours(12, 0, 0, 0); return d; };
  const diasAte = (iso) => (iso ? Math.round((new Date(iso + 'T12:00:00') - hoje()) / 86400000) : null);
  const dataBR = (iso) => (iso ? new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR') : 'Sem vencimento');
  const pareceEmpresa = (nome) => /\b(LTDA|ME|EIRELI|S\/?A|EPP|MEI)\b|POSTO|FAZENDA|MERCADO|PADARIA|CL[IÍ]NICA|IGREJA|CONDOM[IÍ]NIO|ASSOCIA|COOPERATIVA|IND[UÚ]STRIA|COM[EÉ]RCIO|HOTEL|ESCOLA/i.test(String(nome || ''));
  const avatar = (nome) => `<i class="v2-ini" title="${pareceEmpresa(nome) ? 'Empresa' : 'Pessoa física'}">${ic(pareceEmpresa(nome) ? 'building-2' : 'user')}</i>`;

  // ==================== A RECEBER (títulos) ====================
  const REC = { rows: [], carregando: false };
  const recEstado = () => (state.finRecV2 = state.finRecV2 || { f: 'todos', q: '' });

  // grupo do título → filtro (pills) e situação mostrada
  function grupo(t) {
    if (t.st === 'pago') return 'pago';
    const d = diasAte(t.venc_iso);
    if (d != null && d < 0) return 'vencido';
    if (d != null && d <= 7) return 'semana';
    return 'avencer';
  }
  const SIT = { pago: ['Recebido', 't-green'], vencido: ['Vencido', 't-red'], semana: ['Vence esta semana', 't-orange'], avencer: ['A vencer', 't-blue'] };
  function quando(t) {
    if (t.st === 'pago') return '';
    const d = diasAte(t.venc_iso);
    if (d == null) return '';
    if (d < 0) return `<small class="vfin-q r">há ${plural(-d, 'dia', 'dias')}</small>`;
    if (d === 0) return '<small class="vfin-q o">vence hoje</small>';
    if (d <= 7) return `<small class="vfin-q o">em ${plural(d, 'dia', 'dias')}</small>`;
    return `<small class="vfin-q">em ${d} dias</small>`;
  }
  // "Venda · KIT ..." → "KIT ..."; o documento só aparece se não for o mesmo texto
  function descricao(t) {
    const d = String(t.desc_raw || '').replace(/^Venda · /, '').trim();
    const doc = String(t.doc_raw || '').trim();
    return [d || '—', doc && doc !== d ? doc : ''].filter(Boolean).join(' · ');
  }

  async function renderReceber(container) {
    const st = recEstado();
    // chegou agora da aba Vendas: começa sem filtro/busca, senão o cliente pode sumir da lista
    if (state.finFoco && state.finFoco !== REC.focoVisto) { st.f = 'todos'; st.q = ''; }
    REC.focoVisto = state.finFoco;
    container.className = 'v2s';
    document.body.dataset.v2screen = 'fin-receber';
    setPageMeta('fin:recebiveis', 'A receber', REC.rows.length ? resumo(REC.rows) : 'Carregando…');
    container.innerHTML = `
      <div class="vfin-seg-box">${segReceber('titulos')}</div>
      ${faixaFoco()}
      <div class="v2-toolbar">
        <label class="v2-sbox">${ic('search')}<input id="vfin-rec-q" type="text" value="${esc(st.q)}" oninput="uiV2Fin.recSet('q', this.value)" placeholder="Buscar por cliente ou kit" autocomplete="off"></label>
        <span id="vfin-rec-limpar"></span>
        <div class="v2-grow"></div>
        <button class="v2-btno" style="width:auto;height:44px" onclick="finLancamentoModal()">${ic('plus')}Lançar título</button>
      </div>
      <div class="vfin-rec-body">${REC.rows.length ? '' : '<div class="v2-card v2-empty">Carregando títulos…</div>'}</div>`;
    icons();
    if (REC.rows.length) pintarReceber();
    await recRecarregar();
  }
  function resumo(rows) {
    const ab = rows.filter((t) => t.st !== 'pago');
    return `${plural(ab.length, 'título em aberto', 'títulos em aberto')} · ${brl(ab.reduce((s, t) => s + (Number(t.saldo) || 0), 0))}`;
  }
  async function recRecarregar() {
    let rows = [];
    const [r] = await Promise.all([
      window.finRpc('list_fin_titulos', { p_filter: 'todos' }).catch(() => null),
      carregarParcelamentos(),
    ]);
    rows = r || REC.rows;
    REC.rows = rows;
    window.finUsarTitulos(rows); // as janelas de baixar/editar procuram o título nesta lista
    if (!recAberta()) return;
    setPageMeta('fin:recebiveis', 'A receber', resumo(rows));
    const sb = box().querySelector('.vfin-seg-box'); if (sb) sb.innerHTML = segReceber('titulos');
    pintarReceber();
  }
  function recAberta() {
    const b = box();
    return !!(b && b.querySelector('.vfin-rec-body') && state.environment === 'financeiro' && state.finActiveTab === 'recebiveis');
  }

  // vindo da aba Vendas (state.finFoco): só aquele cliente
  function faixaFoco() {
    const f = state.finFoco;
    if (!f || f.sub !== 'titulos') return '';
    return `<div class="v2-card vfin-foco">${ic('filter')}<span>Mostrando só <b>${esc(f.nome || 'o cliente')}</b>, vindo da aba Vendas</span>
      <div class="v2-grow"></div>
      <button class="v2-btn2" onclick="uiV2Fin.focoLimpar()">${ic('filter-x')}Ver todos</button>
      <button class="v2-btn2" onclick="finFocoVoltar()">${ic('arrow-left')}Voltar para Vendas</button></div>`;
  }
  function doFoco(rows) {
    const f = state.finFoco;
    if (!f || f.sub !== 'titulos') return rows;
    const nome = String(f.nome || '').trim().toLowerCase();
    return rows.filter((r) => (f.cliente_id && r.cliente_id ? r.cliente_id === f.cliente_id : String(r.cli || '').trim().toLowerCase() === nome));
  }

  function pintarReceber() {
    const b = box(); const body = b && b.querySelector('.vfin-rec-body'); if (!body) return;
    const st = recEstado();
    const q = String(st.q || '').trim().toLowerCase();
    const base = doFoco(REC.rows).filter((t) => !q || `${t.cli} ${t.desc_raw} ${t.doc_raw}`.toLowerCase().includes(q));
    const cnt = { todos: base.length };
    base.forEach((t) => { const g = grupo(t); cnt[g] = (cnt[g] || 0) + 1; });
    const lista = base.filter((t) => st.f === 'todos' || grupo(t) === st.f)
      .sort((a, b2) => (a.st === 'pago') - (b2.st === 'pago') || String(a.venc_iso || '9999').localeCompare(String(b2.venc_iso || '9999')));
    const lim = b.querySelector('#vfin-rec-limpar');
    if (lim) lim.innerHTML = q ? `<button class="v2-pill v2-fclear" onclick="uiV2Fin.recSet('q','')">${ic('filter-x')}Limpar · ${lista.length} de ${REC.rows.length}</button>` : '';
    const pill = (lbl, val) => `<button class="${st.f === val ? 'on' : ''}" onclick="uiV2Fin.recSet('f','${val}')">${lbl}<em>${cnt[val] || 0}</em></button>`;

    const linhas = lista.map((t) => {
      const g = grupo(t), s = SIT[g];
      const valor = Number(t.valor) || 0, pago = Number(t.pago) || 0;
      const pct = valor > 0 ? Math.min(100, Math.round((pago / valor) * 100)) : 0;
      const id = esc(t.id);
      // título parcelado: receber = receber a próxima parcela (a baixa no título sai junto)
      const plano = t.st !== 'pago' ? planoDoTitulo(t.id, t.cli) : null;
      const prox = plano && plano.prox;
      const receber = prox ? `uiV2Fin.parcReceber('${esc(prox.id)}')` : `finTitBaixar('${id}')`;
      const acts = t.st === 'pago'
        ? `<button class="v2-sq" title="Editar título" onclick="event.stopPropagation(); finTitEdit('${id}')">${ic('pencil')}</button>
           <button class="v2-sq vfin-apagar" title="Apagar título (duplicado)" onclick="event.stopPropagation(); finTitExcluir('${id}')">${ic('trash-2')}</button>`
        : `<button class="v2-btnp vfin-receber" title="${prox ? `Receber a ${ordinal(prox.numero)} parcela` : 'Receber'}" onclick="event.stopPropagation(); ${receber}">${ic('check')}<span class="hide-m">Receber</span></button>
           <button class="v2-sq" title="Mais ações" onclick="event.stopPropagation(); uiV2Fin.menu(this, '${id}')">${ic('ellipsis')}</button>`;
      const parcChip = plano ? `<small class="vfin-parc-chip" title="Parcelado em ${plano.n}×">${ic('calendar-range')}Parcelado · ${plano.pagas} de ${plano.n} pagas${prox ? ` · próxima ${dataBR(prox.venc)}` : ''}</small>` : '';
      return `<tr onclick="${t.st === 'pago' ? `finTitEdit('${id}')` : receber}">
        <td><div class="v2-who">${avatar(t.cli)}<div style="min-width:0"><span class="v2-nmrow"><span class="v2-nm">${esc(t.cli)}</span><b class="v2-mval">${curto(t.st === 'pago' ? valor : t.saldo)}</b></span><small class="vfin-kit">${esc(descricao(t))}</small>${parcChip}<span class="show-m v2-mline"><span class="v2-chip dot ${s[1]}">${s[0]}</span><span class="v2-minfo" style="color:var(--v2-gray)">${ic('calendar')}${dataBR(t.venc_iso)}</span></span></div></div></td>
        <td class="hide-m"><b class="vfin-d">${dataBR(t.venc_iso)}</b>${quando(t)}</td>
        <td class="hide-m" style="font-weight:800">${brl(valor)}</td>
        <td class="hide-m"><div class="vfin-prog"><div class="t"><i style="width:${pct}%"></i></div><small>${pago ? brl(pago) + ' recebido' : 'nada recebido'}</small></div></td>
        <td class="hide-m"><span class="v2-chip dot ${s[1]}">${s[0]}</span></td>
        <td><div class="v2-acts">${acts}</div></td></tr>`;
    }).join('');

    const vazio = REC.rows.length
      ? 'Nenhum título com esse filtro.'
      : 'Nenhum título ainda. Eles aparecem sozinhos quando uma venda é registrada.';
    body.innerHTML = `
      <div class="v2-pills">${pill('Todos', 'todos')}${pill('Vencidos', 'vencido')}${pill('Vencem esta semana', 'semana')}${pill('A vencer', 'avencer')}${pill('Recebidos', 'pago')}</div>
      ${lista.length ? `<div class="v2-card v2-lista" style="padding:14px 16px"><div class="v2-tscroll"><table class="v2-table">
        <thead><tr><th>Cliente e kit</th><th class="hide-m">Vencimento</th><th class="hide-m">Valor</th><th class="hide-m">Recebido</th><th class="hide-m">Situação</th><th></th></tr></thead>
        <tbody>${linhas}</tbody></table></div></div>
        <div class="v2-fim"><div class="m"><span>${ic('circle-check')}Fim da lista · <b>${plural(lista.length, 'título', 'títulos')}</b> · ${brl(lista.reduce((s, t) => s + (t.st === 'pago' ? 0 : Number(t.saldo) || 0), 0))} em aberto</span></div></div>`
        : `<div class="v2-card v2-empty">${vazio}</div>`}`;
    icons();
  }

  // menu "⋯" da linha: mudar vencimento, editar, cancelar
  function fecharMenu() { const m = document.getElementById('vfin-menu'); if (m) m.remove(); }
  function menu(btn, id) {
    const aberto = document.getElementById('vfin-menu');
    if (aberto && aberto.dataset.id === id) { fecharMenu(); return; }
    fecharMenu();
    const r = btn.getBoundingClientRect();
    const m = document.createElement('div');
    m.id = 'vfin-menu'; m.dataset.id = id;
    const baixo = window.innerHeight - r.bottom > 210;
    m.style.top = (baixo ? r.bottom + 6 : r.top - 6 - 235) + 'px';
    m.style.left = Math.max(8, r.right - 220) + 'px';
    const op = (icone, txt, fn, cls = '') => `<button class="${cls}" onclick="uiV2Fin.fecharMenu(); ${fn}('${esc(id)}')">${ic(icone)}${txt}</button>`;
    const parcelado = !!planoDoTitulo(id);
    m.innerHTML = (parcelado ? op('calendar-range', 'Ver parcelas', 'uiV2Fin.parcVerDoTitulo') : op('calendar-range', 'Parcelar o saldo', 'uiV2Fin.parcNovoDoTitulo'))
      + op('calendar-clock', 'Mudar vencimento', 'finTitReneg') + op('pencil', 'Editar título', 'finTitEdit') + op('x', 'Cancelar título', 'finTitCancelar', 'r') + op('trash-2', 'Apagar título', 'finTitExcluir', 'r');
    document.body.appendChild(m);
    icons();
  }
  document.addEventListener('click', (e) => { if (!e.target.closest('#vfin-menu')) fecharMenu(); });
  window.addEventListener('scroll', fecharMenu, true);
  window.addEventListener('resize', fecharMenu);

  // ==================== PARCELAMENTOS (sub-aba de A receber) ====================
  // Um plano parcela o saldo do título da venda. Receber uma parcela dá baixa no
  // título (pagar_fin_parcela) e o vencimento do título acompanha a próxima parcela.
  const PARC = { rows: [], ok: false };
  const parcEstado = () => (state.finParcV2 = state.finParcV2 || { f: 'todos', q: '', aberto: null });
  const ordinal = (n) => `${n}ª`;

  function prepPlano(p) {
    const parcelas = (p.parcelas || []).map((x) => ({ ...x, valor: Number(x.valor) || 0, paga: x.status === 'paga' }))
      .sort((a, b) => a.numero - b.numero);
    const abertas = parcelas.filter((x) => !x.paga);
    const prox = abertas[0] || null;
    const atrasadas = abertas.filter((x) => x.venc && diasAte(x.venc) < 0);
    const dProx = prox ? diasAte(prox.venc) : null;
    const situ = !abertas.length ? 'quitado' : atrasadas.length ? 'atrasado' : dProx != null && dProx <= 7 ? 'semana' : 'em_dia';
    return { ...p, total: Number(p.total) || 0, n: Number(p.n) || parcelas.length, parcelas, abertas, prox, atrasadas,
      pagas: parcelas.length - abertas.length, falta: abertas.reduce((s, x) => s + x.valor, 0), situ, dProx };
  }
  const PARC_SIT = { atrasado: ['Atrasado', 't-red'], semana: ['Vence esta semana', 't-orange'], em_dia: ['Em dia', 't-blue'], quitado: ['Quitado', 't-green'] };

  // Lê os planos com as parcelas. Sem a RPC nova (migration 20261105160000 ainda não
  // rodada), monta o mesmo formato com as duas RPCs antigas.
  async function carregarParcelamentos() {
    let rows = null;
    try {
      const { data, error } = await supabaseClient.rpc('list_fin_parcelamentos_det');
      if (!error) rows = data || [];
    } catch (_) { /* cai no caminho antigo */ }
    if (!rows) {
      const lista = (await window.finRpc('list_fin_parcelamentos').catch(() => null)) || [];
      const iso = (s) => { const m = String(s || '').match(/^(\d{2})\/(\d{2})\/(\d{2})$/); return m ? `20${m[3]}-${m[2]}-${m[1]}` : null; };
      rows = await Promise.all(lista.map(async (p) => {
        const d = await window.finRpc('get_fin_parcelamento', { p_id: p.id }).catch(() => null);
        return { id: p.id, cli: p.cli, total: p.total, n: p.n, status: p.status,
          parcelas: ((d && d.parcelas) || []).map((x) => ({ id: x.id, numero: x.numero, valor: x.valor, venc: iso(x.venc), status: x.status })) };
      }));
    }
    PARC.rows = rows.map(prepPlano);
    PARC.ok = true;
    return PARC.rows;
  }
  // plano ativo do título (só com a RPC nova, que traz fin_titulo_id)
  // com a RPC nova casa pelo id do título; no caminho antigo, pelo nome do cliente
  function planoDoTitulo(tituloId, cli) {
    if (cli == null) { const t = REC.rows.find((x) => x.id === tituloId); cli = t ? t.cli : null; }
    return PARC.rows.find((p) => p.situ !== 'quitado' && (p.fin_titulo_id ? p.fin_titulo_id === tituloId : !!cli && p.cli === cli)) || null;
  }
  function quandoParcela(x) {
    if (!x || x.paga || !x.venc) return '';
    const d = diasAte(x.venc);
    if (d < 0) return `<small class="vfin-q r">atrasada há ${plural(-d, 'dia', 'dias')}</small>`;
    if (d === 0) return '<small class="vfin-q o">vence hoje</small>';
    if (d <= 7) return `<small class="vfin-q o">em ${plural(d, 'dia', 'dias')}</small>`;
    return `<small class="vfin-q">em ${d} dias</small>`;
  }

  // Títulos | Parcelamentos no topo de A receber
  function segReceber(ativo) {
    const nParc = PARC.rows.filter((p) => p.situ !== 'quitado').length;
    const b = (id, lbl, icone, n) => `<button class="${ativo === id ? 'on' : ''}" onclick="uiV2Fin.recAba('${id}')">${ic(icone)}${lbl}${n != null ? `<em>${n}</em>` : ''}</button>`;
    return `<div class="v2-seg vfin-seg">${b('titulos', 'Títulos', 'receipt', null)}${b('parcelamentos', 'Parcelamentos', 'calendar-range', PARC.ok ? nParc : null)}</div>`;
  }

  async function renderParcelamentos(container) {
    container.className = 'v2s';
    document.body.dataset.v2screen = 'fin-parcelamentos';
    setPageMeta('fin:recebiveis', 'A receber', PARC.ok ? resumoParc() : 'Carregando…');
    const st = parcEstado();
    container.innerHTML = `
      <div class="vfin-seg-box">${segReceber('parcelamentos')}</div>
      <div class="v2-toolbar">
        <label class="v2-sbox">${ic('search')}<input id="vfin-parc-q" type="text" value="${esc(st.q)}" oninput="uiV2Fin.parcSet('q', this.value)" placeholder="Buscar por cliente" autocomplete="off"></label>
        <div class="v2-grow"></div>
        <button class="v2-btno" style="width:auto;height:44px" onclick="uiV2Fin.parcNovo()">${ic('plus')}Novo parcelamento</button>
      </div>
      <div class="vfin-parc-body">${PARC.ok ? '' : '<div class="v2-card v2-empty">Carregando parcelamentos…</div>'}</div>`;
    icons();
    if (PARC.ok) pintarParcelamentos();
    await carregarParcelamentos();
    if (!naTela('recebiveis', '.vfin-parc-body')) return;
    setPageMeta('fin:recebiveis', 'A receber', resumoParc());
    const sb = box().querySelector('.vfin-seg-box'); if (sb) sb.innerHTML = segReceber('parcelamentos');
    pintarParcelamentos();
  }
  function resumoParc() {
    const ativos = PARC.rows.filter((p) => p.situ !== 'quitado');
    return `${plural(ativos.length, 'parcelamento ativo', 'parcelamentos ativos')} · ${brl(ativos.reduce((s, p) => s + p.falta, 0))} a receber em parcelas`;
  }
  function pintarParcelamentos() {
    const b = box(); const host = b && b.querySelector('.vfin-parc-body'); if (!host) return;
    const st = parcEstado(), q = String(st.q || '').trim().toLowerCase();
    const base = PARC.rows.filter((p) => !q || `${p.cli} ${p.kit || ''}`.toLowerCase().includes(q));
    const cnt = { todos: base.length }; base.forEach((p) => { cnt[p.situ] = (cnt[p.situ] || 0) + 1; });
    const ordem = { atrasado: 0, semana: 1, em_dia: 2, quitado: 3 };
    const lista = base.filter((p) => st.f === 'todos' || p.situ === st.f)
      .sort((x, y) => ordem[x.situ] - ordem[y.situ] || String((x.prox || {}).venc || '9').localeCompare(String((y.prox || {}).venc || '9')));
    const pill = (lbl, val) => `<button class="${st.f === val ? 'on' : ''}" onclick="uiV2Fin.parcSet('f','${val}')">${lbl}<em>${cnt[val] || 0}</em></button>`;
    const linhas = lista.map((p) => {
      const s = PARC_SIT[p.situ], aberto = st.aberto === p.id, id = esc(p.id);
      const pctPago = p.n ? Math.round((p.pagas / p.n) * 100) : 0;
      const vp = p.parcelas.length ? p.parcelas[0].valor : p.total / (p.n || 1);
      const acao = p.prox ? `<button class="v2-btnp vfin-receber" onclick="event.stopPropagation(); uiV2Fin.parcReceber('${esc(p.prox.id)}')">${ic('check')}<span class="hide-m">Receber ${ordinal(p.prox.numero)}</span></button>` : '';
      const det = aberto ? `<tr class="vfin-parc-det"><td colspan="6"><div class="vfin-parcs">${p.parcelas.map((x) => {
        const atras = !x.paga && x.venc && diasAte(x.venc) < 0, ehProx = p.prox && p.prox.id === x.id;
        return `<div class="vfin-pc ${x.paga ? 'ok' : atras ? 'late' : ehProx ? 'prox' : ''}">
          <b>${ordinal(x.numero)} parcela</b><span>${x.venc ? dataBR(x.venc) : '—'} · ${brl(x.valor)}</span>
          <small>${x.paga ? `Paga${x.pago_em ? ' em ' + dataBR(x.pago_em) : ''}` : atras ? `Atrasada há ${plural(-diasAte(x.venc), 'dia', 'dias')}` : ehProx ? 'Próxima' : 'Em aberto'}</small>
          ${ehProx ? `<button class="v2-btn2" onclick="uiV2Fin.parcReceber('${esc(x.id)}')">${ic('check')}Receber</button>` : ''}
        </div>`;
      }).join('')}</div></td></tr>` : '';
      return `<tr class="${aberto ? 'vfin-aberto' : ''}" onclick="uiV2Fin.parcAbrir('${id}')">
        <td><div class="v2-who">${avatar(p.cli)}<div style="min-width:0"><span class="v2-nmrow"><span class="v2-nm">${esc(p.cli)}</span><b class="v2-mval">${curto(p.falta)}</b></span><small class="vfin-kit vfin-kit-curto">${p.n}× de ${brl(vp)}${p.kit ? ' · ' + esc(p.kit) : ''}</small>${p.atrasadas.length ? `<small class="vfin-aviso r">${ic('triangle-alert')}${plural(p.atrasadas.length, 'parcela atrasada', 'parcelas atrasadas')}</small>` : ''}<span class="show-m v2-mline"><span class="v2-chip dot ${s[1]}">${s[0]}</span><span class="v2-minfo" style="color:var(--v2-gray)">${p.pagas}/${p.n} pagas</span></span></div></div></td>
        <td class="hide-m"><div class="vfin-prog"><div class="t"><i style="width:${pctPago}%"></i></div><small>${p.pagas} de ${p.n} pagas</small></div></td>
        <td class="hide-m">${p.prox ? `<b class="vfin-d">${dataBR(p.prox.venc)}</b>${quandoParcela(p.prox)}` : '<span class="muted">—</span>'}</td>
        <td class="hide-m" style="font-weight:800">${brl(p.falta)}<small class="vfin-s">de ${brl(p.total)}</small></td>
        <td class="hide-m"><span class="v2-chip dot ${s[1]}">${s[0]}</span></td>
        <td><div class="v2-acts">${acao}<button class="v2-sq" title="${aberto ? 'Esconder' : 'Ver'} as parcelas" onclick="event.stopPropagation(); uiV2Fin.parcAbrir('${id}')">${ic(aberto ? 'chevron-up' : 'chevron-down')}</button></div></td></tr>${det}`;
    }).join('');
    host.innerHTML = `
      <div class="v2-pills">${pill('Todos', 'todos')}${pill('Atrasados', 'atrasado')}${pill('Vencem esta semana', 'semana')}${pill('Em dia', 'em_dia')}${pill('Quitados', 'quitado')}</div>
      ${lista.length ? `<div class="v2-card v2-lista" style="padding:14px 16px"><div class="v2-tscroll"><table class="v2-table">
        <thead><tr><th>Cliente e plano</th><th class="hide-m">Pagas</th><th class="hide-m">Próxima parcela</th><th class="hide-m">Falta receber</th><th class="hide-m">Situação</th><th></th></tr></thead>
        <tbody>${linhas}</tbody></table></div></div>`
        : `<div class="v2-card v2-empty">${PARC.rows.length ? 'Nenhum parcelamento com esse filtro.' : 'Nenhum parcelamento ainda. Use "Novo parcelamento" ou "Parcelar o saldo" no menu de um título.'}</div>`}`;
    icons();
  }

  // receber uma parcela (confirma antes)
  // hoje no fuso local (toISOString usaria UTC e viraria o dia à noite)
  function hojeIso() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function acharParcela(parcelaId) {
    for (const p of PARC.rows) { const x = p.parcelas.find((y) => y.id === parcelaId); if (x) return { p, x }; }
    return null;
  }
  function parcReceber(parcelaId) {
    const r = acharParcela(parcelaId); if (!r) return;
    const { p, x } = r;
    abrirDlg(`
      <header><div><small>Receber parcela</small><h3>${esc(p.cli)}</h3><span>${ordinal(x.numero)} de ${p.n} parcelas</span></div><button class="v2-sq" title="Fechar" onclick="uiV2Fin.fecharDlg()">${ic('x')}</button></header>
      <div class="vfin-res"><div><span>Valor da parcela</span><b>${brl(x.valor)}</b></div><div><span>Vencimento</span><b>${x.venc ? dataBR(x.venc) : '—'}</b></div><div><span>Depois desta, faltam</span><b>${plural(p.abertas.length - 1, 'parcela', 'parcelas')} · ${brl(p.falta - x.valor)}</b></div></div>
      <label class="vfin-campo"><span>Data do recebimento</span><input id="vfin-p-data" type="date" value="${hojeIso()}" max="${hojeIso()}"></label>
      <div class="vfin-nota" style="margin:0">${ic('info')}A baixa entra também no título da venda, e o vencimento dele passa para a próxima parcela.</div>
      <div class="vfin-dlg-acts"><button class="v2-btn2" onclick="uiV2Fin.fecharDlg()">Cancelar</button><button class="v2-btnp vfin-receber" id="vfin-p-ok" onclick="uiV2Fin.parcReceberOk('${esc(x.id)}')">${ic('check')}Confirmar recebimento</button></div>`);
  }
  async function parcReceberOk(parcelaId) {
    const data = (document.getElementById('vfin-p-data') || {}).value || '';
    if (!data) { if (window.finToast) finToast('Informe a data do recebimento', 'warn'); return; }
    if (data > hojeIso()) { if (window.finToast) finToast('A data do recebimento não pode ser no futuro', 'warn'); return; }
    const btn = document.getElementById('vfin-p-ok'); if (btn) btn.disabled = true;
    try { await window.finRpc('pagar_fin_parcela', { p_parcela_id: parcelaId, p_data: data }); } catch (_) { if (btn) btn.disabled = false; return; }
    fecharDlg();
    if (window.finToast) finToast('Parcela recebida', 'ok');
    await atualizarTelaAberta();
  }
  // relê e redesenha o que estiver aberto (A receber, Parcelamentos ou Visão geral)
  async function atualizarTelaAberta() {
    const t = state.finActiveTab;
    if (t === 'recebiveis' && naTela('recebiveis', '.vfin-parc-body')) { await carregarParcelamentos(); setPageMeta('fin:recebiveis', 'A receber', resumoParc()); const sb = box().querySelector('.vfin-seg-box'); if (sb) sb.innerHTML = segReceber('parcelamentos'); pintarParcelamentos(); }
    else if (t === 'recebiveis' && recAberta()) await recRecarregar();
    else if (t === 'visao' && naTela('visao', '.vfin-visao')) renderContent();
    else if (t === 'vendas' || t === 'apagar') await depoisDaAcao(null);
  }

  // novo parcelamento: escolhe a venda (saldo em aberto, sem plano ativo)
  async function parcNovo(vendaId) {
    await carregarVendas();
    const comPlano = new Set(PARC.rows.filter((p) => p.situ !== 'quitado').map((p) => p.fin_projeto_id).filter(Boolean));
    const opcoes = VEN.rows.filter((v) => v.saldo > 0.005 && !comPlano.has(v.id)).sort((a, b) => a.cli.localeCompare(b.cli));
    if (!opcoes.length) { if (window.finToast) finToast('Nenhuma venda com saldo em aberto para parcelar', 'warn'); return; }
    const sel = opcoes.find((v) => v.id === vendaId) || opcoes[0];
    const d1 = hoje(); d1.setDate(d1.getDate() + 30);
    abrirDlg(`
      <header><div><small>Novo parcelamento</small><h3>Parcelar o saldo de uma venda</h3><span>As parcelas dão baixa no título da venda</span></div><button class="v2-sq" title="Fechar" onclick="uiV2Fin.fecharDlg()">${ic('x')}</button></header>
      <label class="vfin-campo"><span>Venda</span><select id="vfin-n-venda" onchange="uiV2Fin.parcNovoVenda(this.value)">${opcoes.map((v) => `<option value="${esc(v.id)}" ${v.id === sel.id ? 'selected' : ''}>${esc(v.cli)} · falta ${brl(v.saldo)}</option>`).join('')}</select></label>
      <div class="vfin-grid2">
        <label class="vfin-campo"><span>Valor a parcelar (R$)</span><input id="vfin-n-total" type="number" step="0.01" min="0" inputmode="decimal" value="${Math.round(sel.saldo * 100) / 100}" oninput="uiV2Fin.parcPrevia()"></label>
        <label class="vfin-campo"><span>Nº de parcelas</span><input id="vfin-n-n" type="number" min="1" max="60" step="1" inputmode="numeric" value="6" oninput="uiV2Fin.parcPrevia()"></label>
      </div>
      <label class="vfin-campo"><span>1º vencimento</span><input id="vfin-n-venc" type="date" value="${d1.toISOString().slice(0, 10)}" oninput="uiV2Fin.parcPrevia()"></label>
      <div class="vfin-previa" id="vfin-n-previa"></div>
      <div class="vfin-dlg-acts"><button class="v2-btn2" onclick="uiV2Fin.fecharDlg()">Cancelar</button><button class="v2-btnp" id="vfin-n-ok" onclick="uiV2Fin.parcNovoOk()">${ic('check')}Criar parcelamento</button></div>`);
    parcPrevia();
  }
  function parcNovoVenda(id) {
    const v = VEN.rows.find((x) => x.id === id); const inp = document.getElementById('vfin-n-total');
    if (v && inp) inp.value = Math.round(v.saldo * 100) / 100;
    parcPrevia();
  }
  function parcPrevia() {
    const el = document.getElementById('vfin-n-previa'); if (!el) return;
    const total = parseFloat(String((document.getElementById('vfin-n-total') || {}).value || '').replace(',', '.')) || 0;
    const n = parseInt((document.getElementById('vfin-n-n') || {}).value, 10) || 0;
    const venc = (document.getElementById('vfin-n-venc') || {}).value;
    if (!(total > 0) || n < 1 || !venc) { el.innerHTML = ''; return; }
    const vp = Math.round((total / n) * 100) / 100, ult = Math.round((total - vp * (n - 1)) * 100) / 100;
    const fim = new Date(venc + 'T12:00:00'); fim.setMonth(fim.getMonth() + n - 1);
    el.innerHTML = `${ic('calendar-range')}<span><b>${n}× de ${brl(vp)}</b>${ult !== vp ? ` (a última de ${Number(ult).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})` : ''} · de ${dataBR(venc)} a ${fim.toLocaleDateString('pt-BR')}</span>`;
    icons();
  }
  async function parcNovoOk() {
    const projeto = (document.getElementById('vfin-n-venda') || {}).value;
    const total = parseFloat(String((document.getElementById('vfin-n-total') || {}).value || '').replace(',', '.'));
    const n = parseInt((document.getElementById('vfin-n-n') || {}).value, 10);
    const venc = (document.getElementById('vfin-n-venc') || {}).value || null;
    const v = VEN.rows.find((x) => x.id === projeto);
    if (!(total > 0)) { if (window.finToast) finToast('Informe o valor a parcelar', 'warn'); return; }
    if (v && total > v.saldo + 0.01) { if (window.finToast) finToast(`O valor passa do que falta receber (${brl(v.saldo)})`, 'warn'); return; }
    if (!(n >= 1 && n <= 60)) { if (window.finToast) finToast('Use de 1 a 60 parcelas', 'warn'); return; }
    const btn = document.getElementById('vfin-n-ok'); if (btn) btn.disabled = true;
    try { await window.finRpc('create_fin_parcelamento', { p_fin_projeto_id: projeto, p_total: total, p_n: n, p_primeira_venc: venc }); } catch (_) { if (btn) btn.disabled = false; return; }
    fecharDlg();
    if (window.finToast) finToast('Parcelamento criado', 'ok');
    state.finSub = state.finSub || {}; state.finSub.recebiveis = 'parcelamentos';
    if (state.finActiveTab === 'recebiveis') renderContent(); else setTab('recebiveis');
  }
  // atalhos do menu ⋯ de um título
  function vendaDoTitulo(tituloId) { return VEN.rows.find((v) => v.tit && v.tit.id === tituloId) || null; }
  async function parcNovoDoTitulo(tituloId) { await carregarVendas(); const v = vendaDoTitulo(tituloId); parcNovo(v ? v.id : null); }
  function parcVerDoTitulo(tituloId) {
    const p = planoDoTitulo(tituloId); if (!p) return;
    const st = parcEstado(); st.aberto = p.id; st.f = 'todos'; st.q = '';
    state.finSub = state.finSub || {}; state.finSub.recebiveis = 'parcelamentos'; renderContent();
  }

  // ==================== VENDAS (funil automático) ====================
  const ETAPAS = [
    { n: 'Aguardando pagamento', i: 'hourglass', d: 'Nada recebido ainda', tom: 't-gray' },
    { n: 'Recebendo', i: 'coins', d: 'Já entrou uma parte', tom: 't-blue' },
    { n: 'Comprar kit', i: 'shopping-cart', d: 'Cliente pagou, falta comprar', tom: 't-orange' },
    { n: 'Kit comprado', i: 'package-check', d: 'Falta pagar a comissão', tom: 't-blue' },
    { n: 'Finalizada', i: 'circle-check', d: 'Tudo certo', tom: 't-green' },
  ];
  const KIT_ST = { a_comprar: ['A comprar', 't-orange'], comprado: ['Comprado', 't-blue'], entregue: ['Entregue', 't-green'] };
  const COM_ST = { a_liberar: ['A liberar', 't-orange'], liberar: ['A liberar', 't-orange'], liberado: ['Liberada', 't-blue'], pago: ['Paga', 't-green'] };
  const FORMAS = { avista: 'À vista', cartao: 'Cartão de crédito', boleto: 'Boleto parcelado', financiamento: 'Financiamento', entrada_financiamento: 'Entrada + financiamento', outra: 'Outra forma' };
  const FONTE = { compra: 'valor da compra', lancado: 'lançado no Financeiro', catalogo: 'estimado pelo catálogo' };
  const VEN = { rows: [], ok: false, margemMin: 15 };
  const venEstado = () => (state.finVenV2 = state.finVenV2 || { f: null, q: '', vend: 'Todos', per: 'tudo' });
  const nomeVend = (s) => { s = String(s || '—'); return s.includes('@') ? s.split('@')[0] : s; };
  const pct = (v) => (v == null ? '—' : (Math.round(v * 10) / 10).toLocaleString('pt-BR') + '%');

  // completa cada venda com o que a tela precisa (etapa, situação, margem)
  function prepVenda(v) {
    const tit = v.tit || {}, oc = v.oc, com = v.com;
    const valor = Number(v.valor) || 0;
    const titValor = Number(tit.valor) || 0, pago = Number(tit.pago) || 0, saldo = Number(tit.saldo) || 0;
    const recebido = titValor > 0 && saldo <= 0.005;
    const kitSt = oc && oc.status === 'entregue' ? 'entregue' : oc && oc.status === 'comprado' ? 'comprado' : 'a_comprar';
    const comprado = kitSt !== 'a_comprar';
    const comPaga = !com || com.status === 'pago';
    const etapa = !recebido ? (pago > 0 ? 1 : 0) : !comprado ? 2 : !comPaga ? 3 : 4;
    const d = diasAte(tit.venc_iso);
    const lucro = v.lucro == null ? null : Number(v.lucro);
    return { ...v, valor, pago, saldo, titValor, recebido, kitSt, comprado, comPaga, etapa,
      vencido: !recebido && d != null && d < 0, diasVenc: d, lucro,
      margem: lucro != null && valor > 0 ? (lucro / valor) * 100 : null, vend: nomeVend(v.vendedor) };
  }
  // o que a venda está esperando (aviso na linha e no "Precisa de você")
  function avisoVenda(v) {
    if (v.vencido) return [`Título vencido há ${plural(-v.diasVenc, 'dia', 'dias')}`, 'r'];
    if (v.etapa === 2) return ['Cliente já pagou: comprar o kit', 'o'];
    if (v.etapa === 3 && v.com && v.com.status === 'liberado') return ['Comissão liberada: pagar', 'o'];
    if (v.margem != null && v.margem < VEN.margemMin) return [`Margem baixa (${pct(v.margem)})`, 'o'];
    return null;
  }
  function checks(v) {
    const c = (ok, icone, txt) => `<span class="vfin-ck ${ok ? 'ok' : ''}" title="${esc(txt)}">${ic(ok ? 'check' : icone)}</span>`;
    return `<span class="vfin-cks">${c(v.recebido, 'wallet', v.recebido ? 'Recebido' : 'Falta receber ' + brl(v.saldo))}${c(v.comprado, 'package', v.comprado ? 'Kit comprado' : 'Kit a comprar')}${c(v.comPaga, 'user', v.comPaga ? 'Comissão paga' : 'Comissão a pagar')}</span>`;
  }
  const tracos = (etapa) => `<span class="vfin-dots">${ETAPAS.map((_, j) => `<i class="${j <= etapa ? 'on' : ''}"></i>`).join('')}</span>`;
  function trilho(lista, ativo, clicar) {
    return `<div class="vfin-trilho">${ETAPAS.map((e, i) => {
      const vs = lista.filter((v) => v.etapa === i);
      const alerta = vs.filter((v) => avisoVenda(v)).length;
      return `<button class="vfin-et ${ativo === i ? 'on' : ''} ${i === 4 ? 'fim' : ''}" onclick="${clicar}(${i})">
        <span class="h"><i class="v2-ini">${ic(e.i)}</i><em>${vs.length}</em></span>
        <b>${e.n}</b><small>${vs.length ? curto(vs.reduce((s, v) => s + v.valor, 0)) : '—'}</small>
        ${alerta ? `<span class="vfin-al">${ic('triangle-alert')}${alerta} ${alerta === 1 ? 'pede' : 'pedem'} atenção</span>` : `<span class="vfin-al ok">${e.d}</span>`}
      </button>`;
    }).join(ic('chevron-right', 'class="vfin-seta"'))}</div>`;
  }
  async function carregarVendas() {
    const [rows, prec] = await Promise.all([
      window.finRpc('list_fin_vendas').catch(() => null),
      window.finRpc('get_fin_precificacao').catch(() => null),
    ]);
    if (prec && prec.margem_min != null) VEN.margemMin = Number(prec.margem_min) || 15;
    if (rows) { VEN.rows = rows.map(prepVenda); VEN.ok = true; }
    return VEN.rows;
  }
  const naTela = (tab, marca) => { const b = box(); return !!(b && b.querySelector(marca) && state.environment === 'financeiro' && state.finActiveTab === tab); };
  function porPeriodo(v, per) {
    if (per === 'tudo' || !v.data) return true;
    const d = new Date(v.data + 'T12:00:00'), h = hoje();
    if (per === 'mes') return d.getMonth() === h.getMonth() && d.getFullYear() === h.getFullYear();
    if (per === 'ano') return d.getFullYear() === h.getFullYear();
    if (per === '3m') { const x = new Date(h); x.setMonth(x.getMonth() - 3); return d >= x; }
    return true;
  }

  async function renderVendas(container) {
    container.className = 'v2s';
    document.body.dataset.v2screen = 'fin-vendas';
    setPageMeta('fin:vendas', 'Vendas', VEN.ok ? resumoVendas() : 'Carregando…');
    container.innerHTML = `<div class="vfin-ven"><div class="v2-card v2-empty">Carregando vendas…</div></div>`;
    if (VEN.ok) pintarVendas();
    await carregarVendas();
    if (!naTela('vendas', '.vfin-ven')) return;
    setPageMeta('fin:vendas', 'Vendas', resumoVendas());
    pintarVendas();
  }
  function resumoVendas() {
    const vs = VEN.rows, fin = vs.filter((v) => v.etapa === 4).length;
    return `${plural(vs.length, 'venda', 'vendas')} · ${curto(vs.reduce((s, v) => s + v.valor, 0))} vendido · ${plural(fin, 'finalizada', 'finalizadas')}`;
  }
  function pintarVendas() {
    const b = box(); const wrap = b && b.querySelector('.vfin-ven'); if (!wrap) return;
    const st = venEstado();
    const vends = [...new Set(VEN.rows.map((v) => v.vend))].sort();
    const opt = (val, txt, cur) => `<option value="${esc(val)}" ${val === cur ? 'selected' : ''}>${esc(txt)}</option>`;
    wrap.innerHTML = `
      <div class="v2-toolbar">
        <label class="v2-sbox">${ic('search')}<input id="vfin-ven-q" type="text" value="${esc(st.q)}" oninput="uiV2Fin.venSet('q', this.value)" placeholder="Buscar por cliente ou kit" autocomplete="off"></label>
        <select class="v2-select ${st.vend !== 'Todos' ? 'on' : ''}" onchange="uiV2Fin.venSet('vend', this.value)">${opt('Todos', 'Todos os vendedores', st.vend)}${vends.map((n) => opt(n, n, st.vend)).join('')}</select>
        <select class="v2-select ${st.per !== 'tudo' ? 'on' : ''}" onchange="uiV2Fin.venSet('per', this.value)">${opt('tudo', 'Todo o período', st.per)}${opt('mes', 'Este mês', st.per)}${opt('3m', 'Últimos 3 meses', st.per)}${opt('ano', 'Este ano', st.per)}</select>
        <div class="v2-grow"></div>
        <button class="v2-btn2" style="height:44px" onclick="uiV2Fin.venExportar()">${ic('download')}Exportar</button>
      </div>
      <div class="vfin-ven-trilho"></div>
      <div class="vfin-ven-lista"></div>`;
    pintarVendasCorpo();
  }
  function vendasFiltradas() {
    const st = venEstado(), q = String(st.q || '').trim().toLowerCase();
    return VEN.rows.filter((v) => (!q || `${v.cli} ${v.kit} ${v.vend}`.toLowerCase().includes(q)) && (st.vend === 'Todos' || v.vend === st.vend) && porPeriodo(v, st.per));
  }
  function pintarVendasCorpo() {
    const b = box(); if (!b) return;
    const st = venEstado();
    const base = vendasFiltradas();
    const tb = b.querySelector('.vfin-ven-trilho'); if (tb) tb.innerHTML = trilho(base, st.f, 'uiV2Fin.venEtapa');
    const host = b.querySelector('.vfin-ven-lista'); if (!host) return;
    const lista = base.filter((v) => st.f == null || v.etapa === st.f)
      .sort((x, y) => !!avisoVenda(y) - !!avisoVenda(x) || String(y.data || '').localeCompare(String(x.data || '')));
    const et = st.f == null ? null : ETAPAS[st.f];
    const linhas = lista.map((v) => {
      const e = ETAPAS[v.etapa], a = avisoVenda(v), id = esc(v.id);
      return `<tr onclick="uiV2Fin.ficha('${id}')">
        <td><div class="v2-who">${avatar(v.cli)}<div style="min-width:0"><span class="v2-nmrow"><span class="v2-nm">${esc(v.cli)}</span><b class="v2-mval">${curto(v.valor)}</b></span><small class="vfin-kit">${esc(v.kit)} · ${esc(v.vend)}</small>${a ? `<small class="vfin-aviso ${a[1]}">${ic('triangle-alert')}${esc(a[0])}</small>` : ''}<span class="show-m v2-mline"><span class="v2-chip dot ${e.tom}">${e.n}</span>${checks(v)}</span></div></div></td>
        <td class="hide-m"><span class="v2-chip dot ${e.tom}">${e.n}</span>${tracos(v.etapa)}</td>
        <td class="hide-m"><b class="vfin-v">${brl(v.valor)}</b><small class="vfin-s">${v.data ? 'vendido em ' + dataBR(v.data) : ''}</small></td>
        <td class="hide-m">${checks(v)}</td>
        <td class="hide-m">${v.margem == null ? '<span class="vfin-mg sem" title="Custo do kit ainda não lançado. Registre a compra em A pagar.">—</span>' : `<b class="vfin-mg ${v.margem < VEN.margemMin ? 'baixa' : ''}">${pct(v.margem)}</b>`}</td>
        <td><div class="v2-acts"><button class="v2-sq" title="Abrir a venda" onclick="event.stopPropagation(); uiV2Fin.ficha('${id}')">${ic('chevron-right')}</button></div></td></tr>`;
    }).join('');
    host.innerHTML = `<div class="v2-card v2-lista" style="padding:14px 16px">
      <div class="v2-ch" style="margin-bottom:6px"><div><h3>${et ? et.n : 'Todas as vendas'}</h3><small>${et ? et.d + ' · ' : ''}${plural(lista.length, 'venda', 'vendas')}</small></div>
        ${st.f != null ? `<button class="v2-btn2" onclick="uiV2Fin.venEtapa(null)">Ver todas${ic('arrow-right')}</button>` : ''}</div>
      ${lista.length ? `<div class="v2-tscroll"><table class="v2-table">
        <thead><tr><th>Cliente e kit</th><th class="hide-m">Etapa</th><th class="hide-m">Vendido</th><th class="hide-m">Andamento</th><th class="hide-m">Margem</th><th></th></tr></thead>
        <tbody>${linhas}</tbody></table></div>`
        : `<div class="v2-empty">${VEN.rows.length ? 'Nenhuma venda com esses filtros.' : 'Nenhuma venda ainda. Elas aparecem aqui quando o Comercial registra uma venda.'}</div>`}</div>`;
    icons();
  }
  async function venExportar() {
    if (typeof exportToXLSX !== 'function') return;
    const rows = vendasFiltradas();
    await exportToXLSX(rows, [
      { header: 'Cliente', value: (v) => v.cli }, { header: 'Kit', value: (v) => v.kit }, { header: 'Vendedor', value: (v) => v.vend },
      { header: 'Data da venda', value: (v) => (v.data ? dataBR(v.data) : '') }, { header: 'Etapa', value: (v) => ETAPAS[v.etapa].n },
      { header: 'Vendido (R$)', value: (v) => v.valor }, { header: 'Recebido (R$)', value: (v) => v.pago }, { header: 'Falta receber (R$)', value: (v) => v.saldo },
      { header: 'Kit', value: (v) => KIT_ST[v.kitSt][0] }, { header: 'Custo do kit (R$)', value: (v) => (v.custo_kit == null ? '' : Number(v.custo_kit)) },
      { header: 'Comissão (R$)', value: (v) => (v.com ? Number(v.com.valor) : '') }, { header: 'Comissão', value: (v) => (v.com ? (COM_ST[v.com.status] || [v.com.status])[0] : '') },
      { header: 'Margem (%)', value: (v) => (v.margem == null ? '' : Math.round(v.margem * 10) / 10) },
    ], 'financeiro-vendas');
  }

  // ficha financeira da venda (painel lateral)
  function fecharFicha() { const d = document.getElementById('vfin-ficha'); if (d) d.remove(); }
  function ficha(id) {
    const v = VEN.rows.find((x) => x.id === id); if (!v) return;
    const e = ETAPAS[v.etapa], vid = esc(v.id);
    const passo = (ok, meio, icone, titulo, linha, acao) => `<div class="vfin-p ${ok ? 'ok' : meio ? 'meio' : ''}"><i class="b">${ic(ok ? 'check' : icone)}</i><div class="tx"><b>${titulo}</b><small>${linha}</small>${acao || ''}</div></div>`;
    const kit = KIT_ST[v.kitSt], com = v.com, comSt = com ? (COM_ST[com.status] || [com.status, 't-gray']) : null;
    const forma = FORMAS[v.forma_pagamento] || '';
    const linhaReceb = v.recebido ? `${brl(v.titValor)} recebido${forma ? ' · ' + forma : ''}`
      : `${brl(v.pago)} de ${brl(v.titValor)}${v.tit && v.tit.venc_iso ? ' · vence ' + dataBR(v.tit.venc_iso) : ''}${v.vencido ? ' (vencido)' : ''}${forma ? ' · ' + forma : ''}`;
    const linhaKit = v.oc
      ? `${esc(v.oc.fornecedor || 'Fornecedor não informado')} · ${v.oc.valor ? brl(v.oc.valor) : 'sem valor'} · <span class="v2-chip ${kit[1]}">${v.kitSt === 'a_comprar' ? 'Orçamento, ainda não comprado' : kit[0]}</span>`
      : `Ainda não registrada${v.custo_kit != null ? ' · custo estimado ' + brl(v.custo_kit) : ''}`;
    const res = [['Vendido', v.valor]];
    if (v.custo_kit != null) res.push([`Custo do kit <em>${FONTE[v.custo_fonte] || ''}</em>`, -Number(v.custo_kit)]);
    if (Number(v.outros) > 0) res.push(['Outros custos lançados', -Number(v.outros)]);
    // o imposto incide sobre (venda − kit): sem o custo do kit ele sairia errado, então fica de fora
    if (v.custo_kit != null) res.push(['Impostos', -Number(v.imposto || 0)]);
    res.push(['Comissão', -Number(com ? com.valor : 0)], ['Royalties e fundo', -Number(v.royalties || 0)]);
    if (Number(v.deducoes) > 0) res.push(['Deduções', -Number(v.deducoes)]);
    const d = document.createElement('div');
    d.id = 'vfin-ficha';
    d.innerHTML = `<div class="sc" onclick="uiV2Fin.fecharFicha()"></div><aside class="v2s" role="dialog" aria-label="Venda de ${esc(v.cli)}">
      <header><div><small>Venda${v.data ? ' · ' + dataBR(v.data) : ''} · ${esc(v.vend)}</small><h3>${esc(v.cli)}</h3><span>${esc(v.kit)}</span></div><button class="v2-sq" title="Fechar" onclick="uiV2Fin.fecharFicha()">${ic('x')}</button></header>
      <div class="vfin-fe"><span class="v2-chip dot ${e.tom}">${e.n}</span>${tracos(v.etapa)}</div>
      <div class="vfin-passos">
        ${passo(v.recebido, v.pago > 0, 'wallet', 'Recebimento', linhaReceb,
          v.recebido ? '' : `<button class="v2-btn2" onclick="uiV2Fin.verTitulos('${vid}')">${ic('arrow-down-left')}Ver em A receber</button>`)}
        ${passo(v.comprado, !!v.oc, 'package', 'Compra do kit', linhaKit,
          (v.kitSt === 'a_comprar' ? `<button class="v2-btn2" onclick="uiV2Fin.compra('${vid}')">${ic('shopping-cart')}Registrar compra</button>`
            : v.kitSt === 'comprado' ? `<button class="v2-btn2" onclick="uiV2Fin.chegou('${vid}')">${ic('truck')}Kit chegou</button>` : '')
          + (v.comprado ? '<div class="vfin-pedidos"></div>' : ''))}
        ${com ? passo(v.comPaga, com.status === 'liberado', 'user', 'Comissão', `${esc(v.vend)} · ${pct(Number(com.pct))} · ${brl(com.valor)} · <span class="v2-chip ${comSt[1]}">${comSt[0]}</span>`,
          com.status === 'a_liberar' ? `<button class="v2-btn2" onclick="uiV2Fin.comAcao('${esc(com.id)}','liberado')">${ic('unlock')}Liberar comissão</button>`
            : com.status === 'liberado' ? `<button class="v2-btn2" onclick="uiV2Fin.comAcao('${esc(com.id)}','pago')">${ic('check')}Marcar como paga</button>` : '')
          : passo(true, false, 'user', 'Comissão', 'Esta venda não tem comissão', '')}
      </div>
      <div class="v2-card vfin-resv"><div class="v2-ch" style="margin-bottom:6px"><div><h3>Resultado da venda</h3><small>Quanto sobra depois de tudo pago</small></div>${v.margem == null ? '' : `<span class="v2-chip ${v.margem < VEN.margemMin ? 't-red' : 't-green'}">Margem ${pct(v.margem)}</span>`}</div>
        <div class="vfin-res">${res.map((l) => `<div><span>${l[0]}</span><b>${l[1] < 0 ? '− ' : ''}${brl(Math.abs(l[1]))}</b></div>`).join('')}
          ${v.lucro == null ? `<div class="res"><span>Sobrou</span><b class="sem">—</b></div>` : `<div class="res"><span>Sobrou</span><b>${brl(v.lucro)}</b></div>`}</div>
        ${v.custo_kit == null ? `<div class="vfin-nota">${ic('info')}Falta o custo do kit para calcular a margem. Ele entra quando a compra for registrada.</div>` : ''}
      </div>
      ${typeof openCrm360 === 'function' && v.cliente_id ? `<button class="v2-btn2" style="width:100%;justify-content:center;height:42px" onclick="uiV2Fin.fecharFicha(); openCrm360('${esc(v.cliente_id)}')">${ic('external-link')}Abrir a ficha do cliente</button>` : ''}
    </aside>`;
    fecharFicha();
    document.body.appendChild(d);
    requestAnimationFrame(() => d.classList.add('in'));
    icons();
    if (v.comprado) pedidosNaFicha(v);
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { fecharFicha(); fecharDlg(); } });
  function verTitulos(id) {
    const v = VEN.rows.find((x) => x.id === id); if (!v) return;
    fecharFicha();
    state.finFoco = { cliente_id: v.cliente_id, nome: v.cli, sub: 'titulos', grupo: 'recebiveis' };
    state.finSub = state.finSub || {}; state.finSub.recebiveis = 'titulos';
    setTab('recebiveis'); window.scrollTo(0, 0);
  }
  // depois de qualquer ação: relê e redesenha a tela aberta (e a ficha, se estava aberta)
  async function depoisDaAcao(fichaId) {
    await carregarVendas();
    const t = state.finActiveTab;
    if (t === 'vendas' && naTela('vendas', '.vfin-ven')) { setPageMeta('fin:vendas', 'Vendas', resumoVendas()); pintarVendas(); }
    else if (t === 'apagar' && naTela('apagar', '.vfin-pag')) await pintarAPagar();
    else if (t === 'visao' && naTela('visao', '.vfin-visao')) renderContent();
    if (fichaId && document.getElementById('vfin-ficha')) ficha(fichaId);
  }

  // ---- janela simples (registrar compra) ----
  function fecharDlg() { const d = document.getElementById('vfin-dlg'); if (d) d.remove(); }
  function abrirDlg(html) {
    fecharDlg();
    const d = document.createElement('div');
    d.id = 'vfin-dlg';
    d.innerHTML = `<div class="sc" onclick="uiV2Fin.fecharDlg()"></div><div class="card v2s" role="dialog">${html}</div>`;
    document.body.appendChild(d);
    requestAnimationFrame(() => d.classList.add('in'));
    icons();
    const f = d.querySelector('input, select'); if (f) f.focus();
  }
  function compra(id) {
    const v = VEN.rows.find((x) => x.id === id); if (!v) return;
    const forn = ['Helte', 'Belenus', 'AVT'];
    const ocForn = v.oc && v.oc.fornecedor;
    abrirDlg(`
      <header><div><small>Registrar compra do kit</small><h3>${esc(v.cli)}</h3><span>${esc(v.kit)}</span></div><button class="v2-sq" title="Fechar" onclick="uiV2Fin.fecharDlg()">${ic('x')}</button></header>
      ${v.oc ? `<div class="vfin-nota" style="margin:0">${ic('info')}Já existe um orçamento de compra (${esc(ocForn || 'sem fornecedor')}${v.oc.valor ? ', ' + brl(v.oc.valor) : ''}). Confirmar marca ele como comprado.</div>` : `
      <label class="vfin-campo"><span>Distribuidora</span><select id="vfin-c-forn" onchange="document.getElementById('vfin-c-outro').hidden = this.value !== 'Outra'">${forn.map((f) => `<option>${f}</option>`).join('')}<option>Outra</option></select></label>
      <label class="vfin-campo" id="vfin-c-outro" hidden><span>Nome da distribuidora</span><input id="vfin-c-outro-nome" type="text" autocomplete="off"></label>
      <label class="vfin-campo"><span>Valor pago pelo kit (R$)</span><input id="vfin-c-valor" type="number" step="0.01" min="0" inputmode="decimal" value="${v.custo_kit != null ? Math.round(Number(v.custo_kit) * 100) / 100 : ''}" placeholder="Ex.: 8500"></label>
      ${v.custo_kit != null && v.custo_fonte === 'catalogo' ? `<small class="vfin-dica">Preenchido com o custo do catálogo. Troque pelo valor real da nota.</small>` : ''}`}
      ${campoPedido('vfin-c-pedido')}
      <label class="vfin-check"><input id="vfin-c-chegou" type="checkbox"><span>O kit já chegou</span></label>
      <div class="vfin-dlg-acts"><button class="v2-btn2" onclick="uiV2Fin.fecharDlg()">Cancelar</button><button class="v2-btnp" id="vfin-c-ok" onclick="uiV2Fin.compraSalvar('${esc(v.id)}')">${ic('check')}Registrar compra</button></div>`);
  }
  async function compraSalvar(id) {
    const v = VEN.rows.find((x) => x.id === id); if (!v) return;
    const btn = document.getElementById('vfin-c-ok'); if (btn) btn.disabled = true;
    const chegou = !!(document.getElementById('vfin-c-chegou') || {}).checked;
    try {
      let ocId = v.oc && v.oc.id;
      if (!ocId) {
        const sel = (document.getElementById('vfin-c-forn') || {}).value || '';
        const forn = sel === 'Outra' ? String((document.getElementById('vfin-c-outro-nome') || {}).value || '').trim() : sel;
        const valor = parseFloat(String((document.getElementById('vfin-c-valor') || {}).value || '').replace(',', '.'));
        if (!(valor > 0)) { if (window.finToast) finToast('Informe o valor pago pelo kit', 'warn'); if (btn) btn.disabled = false; return; }
        const r = await window.finRpc('create_fin_oc', { p_fin_projeto_id: v.id, p_fornecedor: forn, p_valor: valor, p_modulos: '', p_inversor: '', p_potencia: '', p_validade: null });
        ocId = r && r.id;
      }
      await window.finRpc('set_fin_oc_status', { p_id: ocId, p_status: chegou ? 'entregue' : 'comprado' });
    } catch (_) { if (btn) btn.disabled = false; return; }
    const arq = ((document.getElementById('vfin-c-pedido') || {}).files || [])[0];
    const fornTxt = (v.oc && v.oc.fornecedor) || (document.getElementById('vfin-c-forn') || {}).value || '';
    fecharDlg();
    if (window.finToast) finToast(chegou ? 'Compra registrada: kit entregue' : 'Compra registrada', 'ok');
    if (arq) await anexarPedido(v, arq, fornTxt);
    await depoisDaAcao(document.getElementById('vfin-ficha') ? id : null);
  }
  // ---- pedido da distribuidora → aba Arquivos do cliente (pasta "Pedido de compra do kit") ----
  const ACEITA = typeof CRM_ARQ_ACCEPT !== 'undefined' ? CRM_ARQ_ACCEPT : 'application/pdf,image/jpeg,image/png,image/webp';
  function campoPedido(idInput) {
    return `<label class="vfin-campo"><span>Pedido da distribuidora <em>opcional</em></span>
      <span class="vfin-anexo"><input id="${idInput}" type="file" accept="${ACEITA}" onchange="uiV2Fin.anexoNome(this)">${ic('paperclip')}<span class="nm">Anexar PDF ou foto do pedido</span></span></label>
      <small class="vfin-dica">Fica salvo sozinho na aba Arquivos do cliente.</small>`;
  }
  function anexoNome(inp) {
    const nm = inp && inp.parentElement && inp.parentElement.querySelector('.nm');
    const f = inp && inp.files && inp.files[0];
    if (nm) nm.textContent = f ? f.name : 'Anexar PDF ou foto do pedido';
    if (inp && inp.parentElement) inp.parentElement.classList.toggle('on', !!f);
  }
  async function anexarPedido(v, file, fornecedor) {
    if (typeof _crmArqUploadUm !== 'function') return false;
    try {
      const { data: cli, error } = await supabaseClient.from('clientes').select('id, franquia_id').eq('id', v.cliente_id).maybeSingle();
      if (error || !cli) throw error || new Error('Cliente não encontrado');
      const row = await _crmArqUploadUm(cli, file, 'pedido_compra', null);
      if (typeof _crmArqTimeline === 'function') {
        _crmArqTimeline(cli, `Pedido de compra do kit anexado pelo Financeiro${fornecedor ? ' (' + fornecedor + ')' : ''} · ${file.name || 'arquivo'}`,
          { acao: 'anexado', tipo: 'pedido_compra', arquivos: [row.id] });
      }
      if (typeof _crmArq !== 'undefined' && _crmArq.clienteId === cli.id) { _crmArq.rows.push(row); if (typeof crmArqRender === 'function') crmArqRender(); }
      if (window.finToast) finToast('Pedido salvo nos arquivos do cliente', 'ok');
      if (document.getElementById('vfin-ficha')) pedidosNaFicha(v);
      return true;
    } catch (e) {
      console.warn('[ui-v2-fin] pedido não anexado', e);
      const msg = e && e.message && e.message.startsWith('"') ? e.message : 'Compra registrada, mas o pedido não foi anexado. Tente pela ficha da venda.';
      if (window.finToast) finToast(msg, 'warn');
      return false;
    }
  }
  // links dos pedidos já anexados, dentro do passo "Compra do kit" da ficha
  async function pedidosNaFicha(v) {
    const host = document.querySelector('#vfin-ficha .vfin-pedidos'); if (!host || !v.cliente_id) return;
    const { data } = await supabaseClient.from('cliente_arquivos').select('id, storage_path, nome_original, created_at')
      .eq('cliente_id', v.cliente_id).eq('tipo', 'pedido_compra').order('created_at', { ascending: false });
    const rows = data || [];
    let urls = {};
    if (rows.length && typeof CRM_ARQ_BUCKET !== 'undefined') {
      const r = await supabaseClient.storage.from(CRM_ARQ_BUCKET).createSignedUrls(rows.map((x) => x.storage_path), 3600);
      (r.data || []).forEach((u, i) => { if (u && u.signedUrl) urls[rows[i].storage_path] = u.signedUrl; });
    }
    const alvo = document.querySelector('#vfin-ficha .vfin-pedidos'); if (!alvo) return;
    alvo.innerHTML = rows.map((x) => `<a class="vfin-pedido" href="${esc(urls[x.storage_path] || '#')}" target="_blank" rel="noopener">${ic('file-text')}<span>${esc(x.nome_original || 'Pedido')}</span></a>`).join('')
      + `<label class="vfin-pedido add"><input type="file" accept="${ACEITA}" onchange="uiV2Fin.anexarDaFicha('${esc(v.id)}', this)">${ic('paperclip')}<span>${rows.length ? 'Anexar outro pedido' : 'Anexar o pedido'}</span></label>`;
    icons();
  }
  async function anexarDaFicha(id, inp) {
    const v = VEN.rows.find((x) => x.id === id); const file = inp && inp.files && inp.files[0];
    if (!v || !file) return;
    const lbl = inp.parentElement; if (lbl) lbl.classList.add('enviando');
    await anexarPedido(v, file, v.oc && v.oc.fornecedor);
  }

  async function chegou(id) {
    const v = VEN.rows.find((x) => x.id === id); if (!v || !v.oc) return;
    if (!confirm(`Confirmar que o kit de ${v.cli} chegou?`)) return;
    try { await window.finRpc('set_fin_oc_status', { p_id: v.oc.id, p_status: 'entregue' }); } catch (_) { return; }
    if (window.finToast) finToast('Kit entregue', 'ok');
    await depoisDaAcao(document.getElementById('vfin-ficha') ? id : null);
  }
  async function comAcao(comId, status) {
    try { await window.finRpc('set_fin_comissao_status', { p_id: comId, p_status: status }); } catch (_) { return; }
    if (window.finToast) finToast(status === 'pago' ? 'Comissão paga' : 'Comissão liberada', 'ok');
    const v = VEN.rows.find((x) => x.com && x.com.id === comId);
    await depoisDaAcao(v && document.getElementById('vfin-ficha') ? v.id : null);
  }

  // ==================== A PAGAR (compra dos kits + comissões) ====================
  const PAG = { com: [] };
  const pagEstado = () => (state.finPagV2 = state.finPagV2 || { cmp: 'todos', com: 'todos' });
  const pagSub = () => ((state.finSub && state.finSub.apagar) === 'comissoes' ? 'comissoes' : 'compras');
  async function renderAPagar(container) {
    container.className = 'v2s';
    document.body.dataset.v2screen = 'fin-apagar';
    setPageMeta('fin:apagar', 'A pagar', 'Carregando…');
    container.innerHTML = `<div class="vfin-pag"><div class="v2-card v2-empty">Carregando…</div></div>`;
    await pintarAPagar(true);
  }
  async function pintarAPagar(buscar = true) {
    if (buscar) {
      const [, com] = await Promise.all([carregarVendas(), window.finRpc('list_fin_comissoes', { p_filter: 'todos' }).catch(() => null)]);
      if (com) { PAG.com = com; window.finUsarComissoes(com); }
    }
    if (!naTela('apagar', '.vfin-pag')) return;
    const b = box(), wrap = b.querySelector('.vfin-pag');
    const aComprar = VEN.rows.filter((v) => v.kitSt === 'a_comprar');
    const comAP = PAG.com.filter((x) => x.st !== 'pago');
    const semCusto = aComprar.filter((v) => v.custo_kit == null).length;
    setPageMeta('fin:apagar', 'A pagar', `${plural(aComprar.length, 'kit a comprar', 'kits a comprar')} · ${curto(comAP.reduce((s, x) => s + (Number(x.valor) || 0), 0))} em comissões`);
    const sub = pagSub();
    const seg = (id, lbl, icone, n) => `<button class="${sub === id ? 'on' : ''}" onclick="uiV2Fin.pagSeg('${id}')">${ic(icone)}${lbl}<em>${n}</em></button>`;
    wrap.innerHTML = `<div class="v2-seg vfin-seg">${seg('compras', 'Compra dos kits', 'package', aComprar.length)}${seg('comissoes', 'Comissões', 'hand-coins', comAP.length)}</div>
      <div class="vfin-pag-body"></div>`;
    if (sub === 'compras') pintarCompras(semCusto); else pintarComissoes();
  }
  function pintarCompras() {
    const host = box().querySelector('.vfin-pag-body'); if (!host) return;
    const st = pagEstado();
    let base = VEN.rows;
    const foco = state.finFoco && state.finFoco.sub === 'ordemcompra' ? state.finFoco : null;
    if (foco) base = base.filter((v) => (foco.cliente_id ? v.cliente_id === foco.cliente_id : v.cli.toLowerCase() === String(foco.nome || '').toLowerCase()));
    const cnt = { todos: base.length }; base.forEach((v) => { cnt[v.kitSt] = (cnt[v.kitSt] || 0) + 1; });
    const lista = base.filter((v) => st.cmp === 'todos' || v.kitSt === st.cmp)
      .sort((x, y) => (x.kitSt !== 'a_comprar') - (y.kitSt !== 'a_comprar') || y.recebido - x.recebido || y.pago - x.pago);
    const pill = (lbl, val) => `<button class="${st.cmp === val ? 'on' : ''}" onclick="uiV2Fin.pagSet('cmp','${val}')">${lbl}<em>${cnt[val] || 0}</em></button>`;
    const pagou = (v) => (v.recebido ? '<span class="v2-chip dot t-green">Sim</span>' : v.pago > 0 ? '<span class="v2-chip dot t-blue">Em parte</span>' : '<span class="v2-chip dot t-gray">Ainda não</span>');
    host.innerHTML = `
      ${foco ? `<div class="v2-card vfin-foco">${ic('filter')}<span>Mostrando só <b>${esc(foco.nome || 'o cliente')}</b>, vindo da aba Vendas</span><div class="v2-grow"></div>
        <button class="v2-btn2" onclick="uiV2Fin.focoLimpar()">${ic('filter-x')}Ver todos</button><button class="v2-btn2" onclick="finFocoVoltar()">${ic('arrow-left')}Voltar para Vendas</button></div>` : ''}
      <div class="v2-pills">${pill('Todas', 'todos')}${pill('A comprar', 'a_comprar')}${pill('Compradas', 'comprado')}${pill('Entregues', 'entregue')}</div>
      ${lista.length ? `<div class="v2-card v2-lista" style="padding:14px 16px"><div class="v2-tscroll"><table class="v2-table">
        <thead><tr><th>Cliente e kit</th><th class="hide-m">Distribuidora</th><th class="hide-m">Custo do kit</th><th class="hide-m">Cliente pagou?</th><th class="hide-m">Situação</th><th></th></tr></thead>
        <tbody>${lista.map((v) => {
          const s = KIT_ST[v.kitSt], prio = v.kitSt === 'a_comprar' && v.recebido, id = esc(v.id);
          const custo = v.comprado ? brl(v.custo_kit) : v.custo_kit != null ? `${brl(v.custo_kit)}<small class="vfin-s">estimado</small>` : '<span class="vfin-mg sem">—</span>';
          const forn = v.oc && v.oc.fornecedor ? esc(v.oc.fornecedor) : '<span class="muted">—</span>';
          const acao = v.kitSt === 'a_comprar' ? `<button class="v2-btnp vfin-acao" onclick="event.stopPropagation(); uiV2Fin.compra('${id}')">${ic('shopping-cart')}<span class="hide-m">Registrar compra</span></button>`
            : v.kitSt === 'comprado' ? `<button class="v2-btn2" onclick="event.stopPropagation(); uiV2Fin.chegou('${id}')">${ic('truck')}<span class="hide-m">Chegou</span></button>` : '';
          return `<tr onclick="uiV2Fin.ficha('${id}')">
            <td><div class="v2-who">${avatar(v.cli)}<div style="min-width:0"><span class="v2-nmrow"><span class="v2-nm">${esc(v.cli)}</span>${v.custo_kit != null ? `<b class="v2-mval">${curto(v.custo_kit)}</b>` : ''}</span><small class="vfin-kit">${esc(v.kit)}</small>${prio ? `<small class="vfin-aviso o">${ic('triangle-alert')}Cliente já pagou: comprar</small>` : ''}<span class="show-m v2-mline"><span class="v2-chip dot ${s[1]}">${s[0]}</span></span></div></div></td>
            <td class="hide-m">${forn}</td>
            <td class="hide-m" style="font-weight:800">${custo}</td>
            <td class="hide-m">${pagou(v)}</td>
            <td class="hide-m"><span class="v2-chip dot ${s[1]}">${v.kitSt === 'a_comprar' && v.oc ? 'Orçamento' : s[0]}</span></td>
            <td><div class="v2-acts">${acao}</div></td></tr>`;
        }).join('')}</tbody></table></div></div>`
        : `<div class="v2-card v2-empty">${VEN.rows.length ? 'Nenhuma compra com esse filtro.' : 'Nenhuma venda ainda.'}</div>`}`;
    icons();
  }
  function pintarComissoes() {
    const host = box().querySelector('.vfin-pag-body'); if (!host) return;
    const st = pagEstado(), rows = PAG.com.map((x) => ({ ...x, vend: nomeVend(x.vendedor) }));
    // cartões só de quem tem algo a receber (a liberar ou liberado), maior valor primeiro
    const porVend = {};
    rows.forEach((x) => { const p = (porVend[x.vend] = porVend[x.vend] || { n: 0, liberar: 0, liberado: 0, pago: 0, ids: [] }); p.n++; p[x.st] = (p[x.st] || 0) + (Number(x.valor) || 0); if (x.st === 'liberado') p.ids.push(x.id); });
    const cards = Object.entries(porVend).filter(([, p]) => p.liberar + p.liberado > 0).sort((a, b) => (b[1].liberar + b[1].liberado) - (a[1].liberar + a[1].liberado));
    const card = ([nome, p]) => `<div class="v2-card vfin-vend">
        <div class="v2-who" style="margin-bottom:14px"><i class="v2-ini round">${esc(nome.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase())}</i><div><span class="v2-nm">${esc(nome)}</span><small>${plural(p.n, 'venda', 'vendas')}</small></div></div>
        <div class="vfin-vt"><div><small>A liberar</small><b>${brl(p.liberar)}</b></div><div><small>Liberada</small><b>${brl(p.liberado)}</b></div><div><small>Paga</small><b class="g">${brl(p.pago)}</b></div></div>
        <button class="v2-btn2" style="width:100%;justify-content:center;margin-top:14px" ${p.liberado ? '' : 'disabled'} onclick="uiV2Fin.pagarLiberadas('${esc(nome)}')">${ic('check-check')}Pagar o que está liberado</button>
      </div>`;
    const cnt = { todos: rows.length }; rows.forEach((x) => { cnt[x.st] = (cnt[x.st] || 0) + 1; });
    const lista = rows.filter((x) => st.com === 'todos' || x.st === st.com);
    const pill = (lbl, val) => `<button class="${st.com === val ? 'on' : ''}" onclick="uiV2Fin.pagSet('com','${val}')">${lbl}<em>${cnt[val] || 0}</em></button>`;
    const acts = (x) => x.st === 'pago' ? '' : `${x.st === 'liberar' ? `<button class="v2-btn2" onclick="event.stopPropagation(); finComLiberar('${esc(x.id)}')">${ic('unlock')}Liberar</button>` : `<button class="v2-btnp vfin-acao" onclick="event.stopPropagation(); finComPagar('${esc(x.id)}')">${ic('check')}<span class="hide-m">Marcar paga</span></button>`}<button class="v2-sq hide-m" title="Ajustar %" onclick="event.stopPropagation(); finComAjustar('${esc(x.id)}', ${Number(x.pct) || 0})">${ic('percent')}</button>`;
    host.innerHTML = `
      ${cards.length ? `<div class="vfin-vends">${cards.map(card).join('')}</div>` : ''}
      <div class="v2-pills">${pill('Todas', 'todos')}${pill('A liberar', 'liberar')}${pill('Liberadas', 'liberado')}${pill('Pagas', 'pago')}</div>
      ${lista.length ? `<div class="v2-card v2-lista" style="padding:14px 16px"><div class="v2-tscroll"><table class="v2-table">
        <thead><tr><th>Vendedor e cliente</th><th class="hide-m">Venda</th><th class="hide-m">%</th><th class="hide-m">Comissão</th><th class="hide-m">Situação</th><th></th></tr></thead>
        <tbody>${lista.map((x) => { const s = COM_ST[x.st] || [x.st, 't-gray']; return `<tr>
          <td><div class="v2-who"><i class="v2-ini round">${esc(x.vend.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase())}</i><div style="min-width:0"><span class="v2-nmrow"><span class="v2-nm">${esc(x.vend)}</span><b class="v2-mval">${brl(x.valor)}</b></span><small>${esc(x.cliente)}</small><span class="show-m v2-mline"><span class="v2-chip dot ${s[1]}">${s[0]}</span><span class="v2-minfo" style="color:var(--v2-gray)">${pct(Number(x.pct))} de ${curto(x.base)}</span></span></div></div></td>
          <td class="hide-m muted">${brl(x.base)}</td><td class="hide-m muted">${pct(Number(x.pct))}</td>
          <td class="hide-m" style="font-weight:800">${brl(x.valor)}</td>
          <td class="hide-m"><span class="v2-chip dot ${s[1]}">${s[0]}</span></td>
          <td><div class="v2-acts">${acts(x)}</div></td></tr>`; }).join('')}</tbody></table></div></div>`
        : `<div class="v2-card v2-empty">${rows.length ? 'Nenhuma comissão com esse filtro.' : 'Nenhuma comissão ainda.'}</div>`}`;
    icons();
  }
  async function pagarLiberadas(nome) {
    const ids = PAG.com.filter((x) => nomeVend(x.vendedor) === nome && x.st === 'liberado');
    if (!ids.length) return;
    const total = ids.reduce((s, x) => s + (Number(x.valor) || 0), 0);
    if (!confirm(`Marcar como pagas ${plural(ids.length, 'comissão', 'comissões')} de ${nome} (${brl(total)})?`)) return;
    try { for (const x of ids) await window.finRpc('set_fin_comissao_status', { p_id: x.id, p_status: 'pago' }); } catch (_) { /* o erro já apareceu */ }
    if (window.finToast) finToast('Comissões pagas', 'ok');
    await depoisDaAcao(null);
  }
  function pagAberta() { return naTela('apagar', '.vfin-pag'); }

  // ==================== VISÃO GERAL ====================
  const FAT_MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  async function renderVisao(container) {
    container.className = 'v2s';
    document.body.dataset.v2screen = 'fin-visao';
    const mes = hoje().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    setPageMeta('fin:visao', 'Financeiro', `${mes.charAt(0).toUpperCase() + mes.slice(1)} · o que entra, o que falta receber e o que pagar`);
    container.innerHTML = `<div class="vfin-visao"><div class="v2-card v2-empty">Carregando o resumo…</div></div>`;
    const rpc = (n, a) => window.finRpc(n, a).catch(() => null);
    const [k, ag, serie, tits, com] = await Promise.all([
      rpc('get_fin_kpis_overview'), rpc('get_fin_aging'), rpc('get_fin_faturamento_series', { p_months: 24 }),
      rpc('list_fin_titulos', { p_filter: 'todos' }), rpc('list_fin_comissoes', { p_filter: 'todos' }), carregarVendas(), carregarParcelamentos(),
    ]);
    if (tits) { REC.rows = tits; window.finUsarTitulos(tits); } // "Receber" do quadro abre a janela de baixa
    if (!naTela('visao', '.vfin-visao')) return;
    pintarVisao(container.querySelector('.vfin-visao'), { k: k || {}, ag: ag || {}, serie: serie || {}, tits: tits || [], com: com || [] });
  }
  function pintarVisao(wrap, { k, ag, serie, tits, com }) {
    const vs = VEN.rows;
    const soma = (a, f) => a.reduce((s, x) => s + (Number(f(x)) || 0), 0);
    // o que falta receber, título por título e parcela por parcela (título parcelado aparece pelas parcelas)
    const itens = [
      ...tits.filter((t) => t.st !== 'pago' && !planoDoTitulo(t.id, t.cli)).map((t) => ({ tipo: 'tit', id: t.id, cli: t.cli, desc: descricao(t), venc: t.venc_iso, valor: Number(t.saldo) || 0 })),
      ...PARC.rows.filter((p) => p.situ !== 'quitado').flatMap((p) => p.abertas.map((x) => ({ tipo: 'parc', id: x.id, cli: p.cli, desc: ordinal(x.numero) + ' de ' + p.n + ' parcelas', venc: x.venc, valor: x.valor }))),
    ].filter((i) => i.venc).sort((a, b2) => a.venc.localeCompare(b2.venc));
    const vencidos = itens.filter((i) => diasAte(i.venc) < 0);
    const semana = itens.filter((i) => diasAte(i.venc) >= 0 && diasAte(i.venc) <= 7);
    const comprar = vs.filter((v) => v.etapa === 2);
    const liberadas = com.filter((x) => x.st === 'liberado');
    const aLiberar = com.filter((x) => x.st === 'liberar');
    const nomes = (a, f) => { const n = [...new Set(a.map(f))]; return n.slice(0, 3).join(' · ') + (n.length > 3 ? ` e mais ${n.length - 3}` : ''); };
    const need = [
      vencidos.length && { tom: 'r', icon: 'triangle-alert', t: vencidos.length + (vencidos.length === 1 ? ' recebimento atrasado' : ' recebimentos atrasados') + (vencidos.some((i) => i.tipo === 'parc') ? ' (títulos e parcelas)' : ''), s: nomes(vencidos, (x) => x.cli), v: soma(vencidos, (x) => x.valor), btn: 'Cobrar', run: vencidos.every((i) => i.tipo === 'parc') ? "uiV2Fin.irParc('atrasado')" : "uiV2Fin.irRec('vencido')" },
      comprar.length && { tom: 'o', icon: 'shopping-cart', t: `${plural(comprar.length, 'kit', 'kits')} para comprar (cliente já pagou)`, s: nomes(comprar, (x) => x.cli), v: soma(comprar, (x) => x.custo_kit), btn: 'Comprar', run: "uiV2Fin.irPag('compras')" },
      semana.length && { tom: 'o', icon: 'calendar-clock', t: `${semana.length} ${semana.length === 1 ? 'vence' : 'vencem'} nos próximos 7 dias`, s: nomes(semana, (x) => x.cli), v: soma(semana, (x) => x.valor), btn: 'Ver', run: "uiV2Fin.verProximos()" },
      liberadas.length && { tom: 'b', icon: 'hand-coins', t: `${plural(liberadas.length, 'comissão liberada', 'comissões liberadas')} para pagar`, s: nomes(liberadas, (x) => nomeVend(x.vendedor)), v: soma(liberadas, (x) => x.valor), btn: 'Pagar', run: "uiV2Fin.irPag('comissoes','liberado')" },
      aLiberar.length && { tom: 'b', icon: 'unlock', t: `${plural(aLiberar.length, 'comissão esperando', 'comissões esperando')} liberação`, s: nomes(aLiberar, (x) => nomeVend(x.vendedor)), v: soma(aLiberar, (x) => x.valor), btn: 'Liberar', run: "uiV2Fin.irPag('comissoes','liberar')" },
    ].filter(Boolean);
    const needCard = `<div class="v2-card vfin-need">
      <div class="v2-ch"><div><h3>Precisa de você</h3><small>${need.length ? 'Em ordem de urgência' : 'Nada pendente'}</small></div></div>
      ${need.length ? need.map((n) => `<div class="v2-lst click" onclick="${n.run}"><i class="v2-ini vfin-${n.tom}">${ic(n.icon)}</i><div class="tx"><b>${n.t}</b><small>${esc(n.s)}</small></div>${n.v ? `<span class="val hide-m">${brl(n.v)}</span>` : ''}<button class="v2-btn2" onclick="event.stopPropagation(); ${n.run}">${n.btn}${ic('arrow-right')}</button></div>`).join('') : '<div class="v2-empty">Tudo em dia 🎉</div>'}
    </div>`;

    const kpi = (o) => `<div class="v2-card v2-kpi ${o.hero ? 'hero' : ''}" onclick="${o.run}"><div class="h"><span>${o.label}</span><div class="ic" style="background:${o.cor}1F;color:${o.cor}">${ic(o.icon)}</div></div><div class="v">${o.v}</div><div class="foot"><span>${o.sub}</span></div></div>`;
    const kitsAC = vs.filter((v) => v.kitSt === 'a_comprar');
    const kitsVal = soma(kitsAC, (v) => v.custo_kit), kitsSem = kitsAC.filter((v) => v.custo_kit == null).length;
    const aPagar = kitsVal + (Number(k.comissoes_a_pagar) || 0);
    const kpis = `<div class="v2-kpis">
      ${kpi({ hero: 1, label: 'A receber', v: curto(k.saldo_a_receber), icon: 'arrow-down-left', cor: '#008FD4', sub: plural(Number(k.titulos_abertos) || 0, 'título em aberto', 'títulos em aberto'), run: "uiV2Fin.irRec('todos')" })}
      ${kpi({ label: 'Recebido no mês', v: curto(k.recebido_mes), icon: 'circle-check', cor: '#1FA971', sub: 'baixas registradas neste mês', run: "uiV2Fin.irRec('pago')" })}
      ${kpi({ label: 'Vencido', v: curto(k.vencido), icon: 'triangle-alert', cor: '#D14343', sub: Number(k.vencido_count) ? plural(Number(k.vencido_count), 'título em atraso', 'títulos em atraso') : 'nada em atraso', run: "uiV2Fin.irRec('vencido')" })}
      ${kpi({ label: 'A pagar', v: curto(aPagar), icon: 'arrow-up-right', cor: '#FAA519', sub: `${plural(kitsAC.length, 'kit a comprar', 'kits a comprar')}${kitsSem ? ` (${kitsSem} sem custo)` : ''} + comissões`, run: "uiV2Fin.irPag('compras')" })}
    </div>`;

    const andamento = `<div class="v2-card"><div class="v2-ch"><div><h3>Andamento das vendas</h3><small>Cada venda anda sozinha conforme recebe, compra o kit e paga a comissão</small></div><button class="v2-btn2" onclick="uiV2Fin.irVendas()">Ver vendas${ic('arrow-right')}</button></div>${trilho(vs, null, 'uiV2Fin.irVendas')}</div>`;

    // faturamento: últimos 12 meses da série (os 'proj' últimos são previsão)
    const todos = (serie.valores || []).map((x) => Number(x) || 0);
    const proj = Number(serie.proj) || 0;
    const vals = todos.slice(-12), off = todos.length - vals.length;
    const endY = Number(serie.end_y) || hoje().getFullYear(), endM = Number(serie.end_m) || 0;
    const rotulo = (i) => { const back = todos.length - 1 - (off + i); const d = new Date(endY, endM - back, 1); return FAT_MES[d.getMonth()]; };
    const mx = Math.max(1, ...vals);
    const atual = vals.length - 1 - proj;
    const fat = `<div class="v2-card"><div class="v2-ch"><div><h3>Faturamento</h3><small>Últimos 12 meses${proj ? ' · os últimos são previsão (títulos a vencer)' : ''}</small></div><span class="v2-chip t-gray">${curto(vals.slice(0, vals.length - proj).reduce((a, b2) => a + b2, 0))} no período</span></div>
      ${vals.length ? `<div class="v2-bars">${vals.map((v, i) => `<div class="v2-bar ${i === atual ? 'last' : ''} ${i > atual ? 'vfin-proj' : ''}"><div class="b" data-v="${brlC(v)}${i > atual ? ' previsto' : ''}" style="height:${Math.max(3, (v / mx) * 100)}%"></div><span>${rotulo(i)}</span></div>`).join('')}</div>
      <div class="vfin-leg"><span><i class="f"></i>Mês atual</span><span><i></i>Meses anteriores</span>${proj ? '<span><i class="p"></i>Previsto</span>' : ''}</div>` : '<div class="v2-empty">Sem faturamento registrado ainda.</div>'}</div>`;

    // resultado: só das vendas com custo do kit conhecido
    const comCusto = vs.filter((v) => v.lucro != null), sem = vs.length - comCusto.length;
    const r = { rec: soma(comCusto, (v) => v.valor), kit: soma(comCusto, (v) => v.custo_kit), out: soma(comCusto, (v) => v.outros), imp: soma(comCusto, (v) => v.imposto), com: soma(comCusto, (v) => (v.com ? v.com.valor : 0)), roy: soma(comCusto, (v) => Number(v.royalties) + Number(v.deducoes || 0)), luc: soma(comCusto, (v) => v.lucro) };
    const lin = [['Vendido', r.rec], ['Custo dos kits', -r.kit], ...(r.out ? [['Outros custos', -r.out]] : []), ['Impostos', -r.imp], ['Comissões', -r.com], ['Royalties e fundo', -r.roy]];
    const agL = [['Vence em mais de 7 dias', ag.a_vencer_7mais, 'var(--v2-blue)'], ['Vence nos próximos 7 dias', ag.vence_7d, '#FAA519'], ['Vencido até 30 dias', ag.vencido_30d, '#E0723A'], ['Mais de 30 dias (inadimplente)', ag.inadimplente, '#D14343']].map((a) => [a[0], Number(a[1]) || 0, a[2]]);
    const agMx = Math.max(1, ...agL.map((a) => a[1]));
    const prox = itens.filter((i) => diasAte(i.venc) <= 15).slice(0, 7);
    const quandoItem = (i) => {
      const d = diasAte(i.venc);
      if (d < 0) return '<span class="v2-chip dot t-red">há ' + plural(-d, 'dia', 'dias') + '</span>';
      if (d === 0) return '<span class="v2-chip dot t-orange">hoje</span>';
      if (d <= 7) return '<span class="v2-chip dot t-orange">em ' + plural(d, 'dia', 'dias') + '</span>';
      return '<span class="v2-chip dot t-blue">em ' + d + ' dias</span>';
    };
    const receberItem = (i) => (i.tipo === 'parc' ? "uiV2Fin.parcReceber('" + esc(i.id) + "')" : "finTitBaixar('" + esc(i.id) + "')");
    const proxCard = '<div class="v2-card vfin-prox"><div class="v2-ch"><div><h3>Próximos vencimentos</h3><small>Títulos e parcelas dos próximos 15 dias, atrasados primeiro</small></div>'
      + '<button class="v2-btn2" onclick="uiV2Fin.irRec(\'todos\')">A receber' + ic('arrow-right') + '</button></div>'
      + (prox.length ? prox.map((i) => '<div class="v2-lst">' + avatar(i.cli) + '<div class="tx"><b>' + esc(i.cli) + '</b><small>'
          + (i.tipo === 'parc' ? ic('calendar-range', 'class="vfin-mini"') : '') + esc(i.desc) + ' · ' + dataBR(i.venc) + '</small></div>'
          + '<div class="vfin-prox-v"><span class="val">' + brl(i.valor) + '</span>' + quandoItem(i) + '</div>'
          + '<button class="v2-btnp vfin-receber vfin-receber-sm" title="Receber" onclick="' + receberItem(i) + '">' + ic('check') + '<span class="hide-m">Receber</span></button></div>').join('')
        : '<div class="v2-empty">Nada vence nos próximos 15 dias.</div>')
      + '</div>';
    const agingCard = '<div class="v2-card"><div class="v2-ch"><div><h3>Vencimentos</h3><small>O que falta receber, por prazo</small></div></div><div class="vfin-aging">'
      + agL.map((a) => '<div><div class="l"><span>' + a[0] + '</span><b>' + brl(a[1]) + '</b></div><div class="t"><i style="width:' + (a[1] / agMx) * 100 + '%;background:' + a[2] + '"></i></div></div>').join('')
      + '</div></div>';
    const resultado = `<div class="v2-card"><div class="v2-ch"><div><h3>Resultado</h3><small>${comCusto.length ? `${plural(comCusto.length, 'venda', 'vendas')} com custo do kit conhecido` : 'Vendas com custo do kit conhecido'}</small></div>${comCusto.length && r.rec ? `<span class="v2-chip ${r.luc / r.rec * 100 < VEN.margemMin ? 't-red' : 't-green'}">Margem ${pct(r.luc / r.rec * 100)}</span>` : ''}</div>
      ${comCusto.length ? `<div class="vfin-res">${lin.map((l) => `<div><span>${l[0]}</span><b>${l[1] < 0 ? '− ' : ''}${brl(Math.abs(l[1]))}</b></div>`).join('')}<div class="res"><span>Sobrou</span><b>${brl(r.luc)}</b></div></div>` : '<div class="v2-empty" style="padding:14px 0">Ainda não dá pra calcular: nenhuma venda tem o custo do kit.</div>'}
      ${sem ? `<div class="vfin-nota">${ic('info')}${plural(sem, 'venda ainda sem', 'vendas ainda sem')} custo do kit: ${sem === 1 ? 'entra' : 'entram'} quando a compra for registrada em A pagar.</div>` : ''}
      </div>`;

    wrap.innerHTML = `${needCard}${kpis}<div class="v2-row">${proxCard}${agingCard}</div>${andamento}<div class="v2-row">${fat}${resultado}</div>`;
    icons();
  }

  // ==================== ligação com o financeiro.js ====================
  // Aba → tela nova. Recebíveis tem sub-abas: só Títulos é nova (Parcelamentos segue a antiga).
  const TELAS = { visao: renderVisao, vendas: renderVendas, apagar: renderAPagar, recebiveis: { titulos: renderReceber, parcelamentos: renderParcelamentos } };
  function telaDe(tab) {
    const t = TELAS[tab]; if (!t) return null;
    if (typeof t === 'function') return t;
    const sub = (state.finSub && state.finSub[tab]) || Object.keys(t)[0];
    return t[sub] || null;
  }

  window.uiV2Fin = {
    // chamado no começo do renderFinRoute: true = esta tela já foi desenhada aqui
    render(container, tab) {
      if (!v2on()) return false;
      const fn = telaDe(tab);
      if (!fn) return false;
      fecharMenu(); fecharFicha(); fecharDlg();
      try { fn(container); return true; } catch (err) { console.warn('[ui-v2-fin] tela nova falhou, usando a antiga', err); return false; }
    },
    // tela antiga vai desenhar: tira o .v2s e o título desta
    sair(container) {
      fecharMenu(); fecharFicha(); fecharDlg();
      if (container) container.classList.remove('v2s');
      if (window.uiV2PageMeta && String(window.uiV2PageMeta.key || '').startsWith('fin:') && !(state.finActiveTab === 'recebiveis')) {
        window.uiV2PageMeta = null;
        if (window.uiV2Shell) window.uiV2Shell.refresh();
      }
    },
    temTela(tab, sub) { const t = TELAS[tab]; return v2on() && !!t && typeof t !== 'function' && !!t[sub]; },
    recAberta,
    recRecarregar,
    // vendas
    venSet(k, v) {
      venEstado()[k] = v;
      if (k === 'q') pintarVendasCorpo(); else pintarVendas();
    },
    venEtapa(i) { const st = venEstado(); st.f = st.f === i ? null : i; pintarVendasCorpo(); },
    venExportar,
    ficha, fecharFicha, verTitulos, compra, compraSalvar, chegou, comAcao, fecharDlg, anexoNome, anexarDaFicha,
    // a pagar
    pagAberta,
    pagRecarregar: () => pintarAPagar(true),
    pagSeg(id) { state.finSub = state.finSub || {}; state.finSub.apagar = id; pintarAPagar(false); },
    pagSet(k, v) { pagEstado()[k] = v; if (pagSub() === 'compras') pintarCompras(); else pintarComissoes(); },
    pagarLiberadas,
    // atalhos (Visão geral)
    irRec(f) { state.finRecV2 = { f: f || 'todos', q: '' }; state.finFoco = null; state.finSub = state.finSub || {}; state.finSub.recebiveis = 'titulos'; setTab('recebiveis'); window.scrollTo(0, 0); },
    irPag(sub, filtro) { fecharFicha(); state.finFoco = null; state.finSub = state.finSub || {}; state.finSub.apagar = sub; if (filtro && sub === 'comissoes') pagEstado().com = filtro; setTab('apagar'); window.scrollTo(0, 0); },
    irVendas(i) { const st = venEstado(); st.f = i == null ? null : i; setTab('vendas'); window.scrollTo(0, 0); },
    recSet(k, v) {
      recEstado()[k] = v;
      if (k === 'q') {
        pintarReceber();
        const inp = document.getElementById('vfin-rec-q');
        if (inp && inp.value !== v) inp.value = v;
      } else pintarReceber();
    },
    irParc(f) { const st = parcEstado(); st.f = f || 'todos'; st.q = ''; state.finSub = state.finSub || {}; state.finSub.recebiveis = 'parcelamentos'; setTab('recebiveis'); window.scrollTo(0, 0); },
    verProximos() { const c = document.querySelector('.vfin-prox'); if (c) c.scrollIntoView({ behavior: 'smooth', block: 'center' }); },
    // janela de título (financeiro.js) salvou: redesenha a tela nova que estiver aberta
    recDelegar() {
      if (!v2on()) return false;
      if (recAberta()) { recRecarregar(); return true; }
      if (naTela('visao', '.vfin-visao') || naTela('vendas', '.vfin-ven') || naTela('recebiveis', '.vfin-parc-body')) { atualizarTelaAberta(); return true; }
      return false;
    },
    recAba(id) { fecharMenu(); state.finSub = state.finSub || {}; state.finSub.recebiveis = id; renderContent(); },
    // parcelamentos
    parcSet(k, v) { parcEstado()[k] = v; pintarParcelamentos(); if (k === 'q') { const i = document.getElementById('vfin-parc-q'); if (i && i.value !== v) i.value = v; } },
    parcAbrir(id) { const st = parcEstado(); st.aberto = st.aberto === id ? null : id; pintarParcelamentos(); },
    parcReceber, parcReceberOk, parcNovo, parcNovoVenda, parcPrevia, parcNovoOk, parcNovoDoTitulo, parcVerDoTitulo,
    focoLimpar() { state.finFoco = null; renderContent(); },
    menu,
    fecharMenu,
  };
})();
