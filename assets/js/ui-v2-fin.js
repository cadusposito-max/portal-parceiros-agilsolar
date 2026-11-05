// ==========================================
// VISUAL NOVO (v2) — FINANCEIRO NO PADRÃO DO COMERCIAL
// ------------------------------------------
// Mesmo esquema do ui-v2-om.js: a tela nova só assume quando o v2 está ativo;
// sem ele (ou numa aba ainda não refeita) o financeiro.js desenha a antiga.
// Os dados saem das mesmas RPCs (window.finRpc, com o guardado de 20s) e as
// ações abrem as mesmas janelas do financeiro.js (finTitBaixar, finTitReneg...).
// Carregado sob demanda junto com o financeiro.js (ver carregarFinanceiro).
// Telas prontas: A receber (sub-aba Títulos de Recebíveis).
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
      ${faixaFoco()}
      <div class="v2-toolbar">
        <label class="v2-sbox">${ic('search')}<input id="vfin-rec-q" type="text" value="${esc(st.q)}" oninput="uiV2Fin.recSet('q', this.value)" placeholder="Buscar por cliente ou kit" autocomplete="off"></label>
        <span id="vfin-rec-limpar"></span>
        <div class="v2-grow"></div>
        <button class="v2-btn2" style="height:44px" onclick="uiV2Fin.irParcelamentos()" title="Planos de parcelamento">${ic('calendar-range')}Parcelamentos</button>
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
    try { rows = (await window.finRpc('list_fin_titulos', { p_filter: 'todos' })) || []; } catch (_) { rows = REC.rows; }
    REC.rows = rows;
    window.finUsarTitulos(rows); // as janelas de baixar/editar procuram o título nesta lista
    if (!recAberta()) return;
    setPageMeta('fin:recebiveis', 'A receber', resumo(rows));
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
      const acts = t.st === 'pago'
        ? `<button class="v2-sq" title="Editar título" onclick="event.stopPropagation(); finTitEdit('${id}')">${ic('pencil')}</button>`
        : `<button class="v2-btnp vfin-receber" onclick="event.stopPropagation(); finTitBaixar('${id}')">${ic('check')}<span class="hide-m">Receber</span></button>
           <button class="v2-sq" title="Mais ações" onclick="event.stopPropagation(); uiV2Fin.menu(this, '${id}')">${ic('ellipsis')}</button>`;
      return `<tr onclick="${t.st === 'pago' ? `finTitEdit('${id}')` : `finTitBaixar('${id}')`}">
        <td><div class="v2-who">${avatar(t.cli)}<div style="min-width:0"><span class="v2-nmrow"><span class="v2-nm">${esc(t.cli)}</span><b class="v2-mval">${curto(t.st === 'pago' ? valor : t.saldo)}</b></span><small class="vfin-kit">${esc(descricao(t))}</small><span class="show-m v2-mline"><span class="v2-chip dot ${s[1]}">${s[0]}</span><span class="v2-minfo" style="color:var(--v2-gray)">${ic('calendar')}${dataBR(t.venc_iso)}</span></span></div></div></td>
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
    const baixo = window.innerHeight - r.bottom > 170;
    m.style.top = (baixo ? r.bottom + 6 : r.top - 6 - 150) + 'px';
    m.style.left = Math.max(8, r.right - 220) + 'px';
    const op = (icone, txt, fn, cls = '') => `<button class="${cls}" onclick="uiV2Fin.fecharMenu(); ${fn}('${esc(id)}')">${ic(icone)}${txt}</button>`;
    m.innerHTML = op('calendar-clock', 'Mudar vencimento', 'finTitReneg') + op('pencil', 'Editar título', 'finTitEdit') + op('x', 'Cancelar título', 'finTitCancelar', 'r');
    document.body.appendChild(m);
    icons();
  }
  document.addEventListener('click', (e) => { if (!e.target.closest('#vfin-menu')) fecharMenu(); });
  window.addEventListener('scroll', fecharMenu, true);
  window.addEventListener('resize', fecharMenu);

  // ==================== ligação com o financeiro.js ====================
  // [aba, sub-aba] com tela nova. Sub-aba null = a aba inteira.
  const TELAS = { recebiveis: { titulos: renderReceber } };
  function telaDe(tab) {
    const t = TELAS[tab]; if (!t) return null;
    const sub = (state.finSub && state.finSub[tab]) || Object.keys(t)[0];
    return t[sub] || null;
  }

  window.uiV2Fin = {
    // chamado no começo do renderFinRoute: true = esta tela já foi desenhada aqui
    render(container, tab) {
      if (!v2on()) return false;
      const fn = telaDe(tab);
      if (!fn) return false;
      fecharMenu();
      try { fn(container); return true; } catch (err) { console.warn('[ui-v2-fin] tela nova falhou, usando a antiga', err); return false; }
    },
    // tela antiga vai desenhar: tira o .v2s e o título desta
    sair(container) {
      fecharMenu();
      if (container) container.classList.remove('v2s');
      if (window.uiV2PageMeta && String(window.uiV2PageMeta.key || '').startsWith('fin:') && !(state.finActiveTab === 'recebiveis')) {
        window.uiV2PageMeta = null;
        if (window.uiV2Shell) window.uiV2Shell.refresh();
      }
    },
    temTela(tab, sub) { return v2on() && !!(TELAS[tab] && TELAS[tab][sub]); },
    recAberta,
    recRecarregar,
    recSet(k, v) {
      recEstado()[k] = v;
      if (k === 'q') {
        pintarReceber();
        const inp = document.getElementById('vfin-rec-q');
        if (inp && inp.value !== v) inp.value = v;
      } else pintarReceber();
    },
    irParcelamentos() { state.finSub = state.finSub || {}; state.finSub.recebiveis = 'parcelamentos'; renderContent(); },
    focoLimpar() { state.finFoco = null; renderContent(); },
    menu,
    fecharMenu,
  };
})();
