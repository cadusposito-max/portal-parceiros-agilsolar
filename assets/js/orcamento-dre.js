/* =====================================================================
   DRE por orçamento (proposta) — simulador de margem para gestor/admin
   ---------------------------------------------------------------------
   - Acessível só a admin/gestor (gate por perfil, sem depender das RPCs
     gateadas do Financeiro).
   - O DRE de uma proposta é um SIMULADOR client-side: a receita é semeada
     com o valor de venda da proposta; imposto/comissão/royalties/deduções
     são automáticos (%); os custos diretos são editáveis pelo gestor.
   - Cálculo 100% no navegador; cenário salvo em localStorage por proposta.
   - Autocontido: não usa funções internas do financeiro.js (brMoney etc.).
     Usa apenas utilitários globais: escapeHTML, formatCurrency, state,
     supabaseClient, lucide.
   ===================================================================== */
(function () {
  'use strict';

  // % padrão (espelham fin_config). Fallback quando a RPC não está disponível.
  const PCT_FALLBACK = { imposto: 18, comissao: 10, royalties: 4.5, deducoes: 0, margem_min: 15, margem_alvo: 22 };

  // Linhas de custo direto editáveis (ordem de exibição).
  const CUSTO_LINES = [
    { key: 'kit',        rotulo: 'Kit fotovoltaico' },
    { key: 'projeto',    rotulo: 'Projeto c/ ART' },
    { key: 'instalacao', rotulo: 'Instalação' },
    { key: 'eletrica',   rotulo: 'Elétrica' },
    { key: 'placas',     rotulo: 'Placas de advertência' },
    { key: 'ajuda',      rotulo: 'Ajuda de custo instalação' },
    { key: 'vistoria',   rotulo: 'Vistoria' },
    { key: 'outros',     rotulo: 'Outros custos' },
  ];

  let cur = null;       // { propostaId, receita, custos:{}, extras:[], pct:{} }
  let _pctCache = null; // cache dos % (uma busca por sessão)

  const num = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
  const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
  const money = (v) => formatCurrency(Number(v) || 0);
  const lsKey = (id) => 'orc_dre_' + id;

  // ---- Percentuais (backend com fallback) -----------------------------
  async function loadPct() {
    if (_pctCache) return _pctCache;
    let p = Object.assign({}, PCT_FALLBACK);
    try {
      if (window.supabaseClient) {
        const { data, error } = await supabaseClient.rpc('get_dre_percentuais');
        if (!error && data) {
          p = {
            imposto:     num(data.imposto_pct)    || PCT_FALLBACK.imposto,
            comissao:    num(data.comissao_pct)   || PCT_FALLBACK.comissao,
            royalties:   num(data.royalties_pct)  || PCT_FALLBACK.royalties,
            deducoes:    num(data.deducoes_pct),
            margem_min:  num(data.margem_min)     || PCT_FALLBACK.margem_min,
            margem_alvo: num(data.margem_alvo)    || PCT_FALLBACK.margem_alvo,
          };
        }
      }
    } catch (_) { /* fallback silencioso — feature funciona offline */ }
    _pctCache = p;
    return p;
  }

  // ---- Persistência ---------------------------------------------------
  function loadSaved(id) {
    try {
      const raw = localStorage.getItem(lsKey(id));
      if (!raw) return null;
      const o = JSON.parse(raw);
      return (o && typeof o === 'object') ? o : null;
    } catch (_) { return null; }
  }

  function seedFromProposta(p) {
    const isPersonalizada = p.proposal_mode === 'PERSONALIZADA' || p.proposal_mode === 'EQUIPAMENTOS';
    const receita = isPersonalizada ? (p.custom_total_price || p.kit_price) : p.kit_price;
    const custos = {};
    CUSTO_LINES.forEach((l) => { custos[l.key] = 0; });
    return { receita: num(receita), custos, extras: [] };
  }

  // ---- Cálculo --------------------------------------------------------
  function compute() {
    const pct = cur.pct;
    const receitaBase = num(cur.receita);
    const extrasRec = cur.extras.filter((e) => e.tipo === 'receita').reduce((s, e) => s + num(e.valor), 0);
    const extrasDesp = cur.extras.filter((e) => e.tipo === 'despesa').reduce((s, e) => s + num(e.valor), 0);
    const receita = receitaBase + extrasRec;

    const kit = num(cur.custos.kit);
    const diretos = CUSTO_LINES.reduce((s, l) => s + num(cur.custos[l.key]), 0);

    // Valores sugeridos (% × base) e valores efetivos (override do gestor, se houver).
    const ov = cur.overrides || {};
    const impostoSug   = r2((receitaBase - kit) * pct.imposto / 100);
    const comissaoSug  = r2(receitaBase * pct.comissao / 100);
    const royaltiesSug = r2(receitaBase * pct.royalties / 100);
    const deducoesSug  = r2(receitaBase * pct.deducoes / 100);
    const imposto   = ov.imposto   != null ? r2(num(ov.imposto))   : impostoSug;
    const comissao  = ov.comissao  != null ? r2(num(ov.comissao))  : comissaoSug;
    const royalties = ov.royalties != null ? r2(num(ov.royalties)) : royaltiesSug;
    const deducoes  = ov.deducoes  != null ? r2(num(ov.deducoes))  : deducoesSug;

    const totalCustos = r2(diretos + imposto + comissao + royalties + extrasDesp);
    const lucro = r2(receita - totalCustos);
    const lucroLiq = r2(lucro - deducoes);
    const margem = receita > 0 ? r2(lucroLiq / receita * 100) : 0;

    return {
      receita, imposto, comissao, royalties, deducoes,
      impostoSug, comissaoSug, royaltiesSug, deducoesSug,
      totalCustos, lucro, lucroLiq, margem,
    };
  }

  // ---- Render ---------------------------------------------------------
  function inputMoney(key, value) {
    return `<div class="relative w-36">
        <span class="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-neutral-500 font-bold">R$</span>
        <input type="number" step="0.01" data-orc-cost="${key}" value="${num(value)}"
          class="w-full pl-7 pr-2 py-1.5 bg-neutral-950 border border-neutral-800 focus:border-emerald-500/60 outline-none text-white num font-black text-right text-sm">
      </div>`;
  }

  function editRow(label, key, val) {
    return `<div class="px-5 py-2 flex items-center gap-3">
        <span class="font-bold text-neutral-300 text-sm flex-1">${escapeHTML(label)}</span>
        <span class="text-[12px] font-black text-red-400 w-4 text-center">−</span>
        ${inputMoney(key, val)}
      </div>`;
  }

  // Linha de % sugerido, agora EDITÁVEL: input semeado com a sugestão; vazio = automático.
  function pctRow(label, key, val, hint) {
    return `<div class="px-5 py-2 flex items-center gap-3">
        <span class="font-bold text-neutral-300 text-sm flex-1">${escapeHTML(label)}${hint ? ` <span class="text-[10px] text-neutral-600 font-bold">${hint}</span>` : ''}</span>
        <span class="text-[12px] font-black text-red-400 w-4 text-center">−</span>
        <div class="relative w-36">
          <span class="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-neutral-500 font-bold">R$</span>
          <input type="number" step="0.01" data-orc-pct="${key}" value="${num(val)}"
            class="w-full pl-7 pr-2 py-1.5 bg-neutral-950 border border-neutral-800 focus:border-emerald-500/60 outline-none text-white num font-black text-right text-sm">
        </div>
      </div>`;
  }

  function extraRowHtml(e, i) {
    return `<div class="flex items-center gap-2" data-orc-extra="${i}">
        <select data-orc-ex-field="tipo" class="px-2 py-1.5 bg-neutral-950 border border-neutral-800 text-white text-[11px] font-bold">
          <option value="despesa"${e.tipo === 'despesa' ? ' selected' : ''}>Despesa</option>
          <option value="receita"${e.tipo === 'receita' ? ' selected' : ''}>Receita</option>
        </select>
        <input type="text" data-orc-ex-field="rotulo" value="${escapeHTML(e.rotulo || '')}" placeholder="Descrição"
          class="flex-1 min-w-0 px-2 py-1.5 bg-neutral-950 border border-neutral-800 text-white text-[11px] font-bold">
        <input type="number" step="0.01" data-orc-ex-field="valor" value="${num(e.valor)}"
          class="w-28 px-2 py-1.5 bg-neutral-950 border border-neutral-800 text-white num font-black text-[11px] text-right">
        <button type="button" data-orc-act="del-extra" class="w-7 h-7 grid place-items-center text-neutral-500 hover:text-red-400"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
      </div>`;
  }

  function renderExtras() {
    const host = document.getElementById('orc-dre-extras'); if (!host) return;
    host.innerHTML = cur.extras.length
      ? cur.extras.map((e, i) => extraRowHtml(e, i)).join('')
      : `<div class="text-[10px] text-neutral-600 font-bold uppercase tracking-widest">Nenhuma linha extra — opcional</div>`;
    if (window.lucide) lucide.createIcons();
  }

  function buildOverlay(p) {
    const old = document.getElementById('orc-dre-overlay');
    if (old) old.remove();

    const titulo = escapeHTML(p.kit_nome || 'Proposta personalizada');
    const cliente = escapeHTML(p.cliente_nome || '—');

    // Valores efetivos iniciais (override do gestor, se houver; senão a sugestão %).
    const d0 = compute();

    const el = document.createElement('div');
    el.id = 'orc-dre-overlay';
    el.className = 'fixed inset-0 z-[130] flex items-start md:items-center justify-center bg-black/90 backdrop-blur-md p-2 md:p-4 overflow-y-auto';
    el.innerHTML = `
      <div class="w-full max-w-3xl bg-[#0a0a0a] border border-neutral-800 shadow-2xl my-4">
        <div class="sticky top-0 bg-[#0a0a0a] border-b border-neutral-800 px-5 py-4 flex items-start justify-between gap-3 z-10">
          <div class="min-w-0">
            <div class="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400">DRE do orçamento · simulação</div>
            <h3 class="text-lg font-black text-white mt-1 truncate">${titulo}</h3>
            <div class="text-[11px] text-neutral-500 font-bold truncate">${cliente}</div>
          </div>
          <button type="button" data-orc-act="close" class="shrink-0 w-9 h-9 grid place-items-center bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white transition-colors"><i data-lucide="x" class="w-4 h-4"></i></button>
        </div>

        <div class="p-5 space-y-4">
          <!-- KPIs -->
          <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div class="border border-neutral-800 p-4 bg-neutral-950/40">
              <div class="text-[9px] font-black uppercase tracking-widest text-neutral-500">Receita</div>
              <div id="orc-k-receita" class="text-base font-black text-white mt-1 num">—</div>
            </div>
            <div class="border border-neutral-800 p-4 bg-neutral-950/40">
              <div class="text-[9px] font-black uppercase tracking-widest text-neutral-500">Total custos</div>
              <div id="orc-k-custos" class="text-base font-black text-emerald-400 mt-1 num">—</div>
            </div>
            <div class="border border-neutral-800 p-4 bg-neutral-950/40">
              <div class="text-[9px] font-black uppercase tracking-widest text-neutral-500">Lucro líquido</div>
              <div id="orc-k-lucro" class="text-base font-black text-white mt-1 num">—</div>
            </div>
            <div class="border border-neutral-800 p-4 bg-neutral-950/40">
              <div class="text-[9px] font-black uppercase tracking-widest text-neutral-500">Margem</div>
              <div id="orc-k-margem" class="text-base font-black mt-1 num">—</div>
            </div>
          </div>

          <!-- Cascata -->
          <div class="border border-neutral-800">
            <div class="px-5 py-3 border-b border-neutral-800 flex items-center justify-between">
              <span class="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-300">Demonstração do resultado</span>
              <span class="text-[9px] font-bold text-neutral-600 uppercase tracking-widest">valores editáveis</span>
            </div>
            <div class="divide-y divide-neutral-800/70">
              <!-- Receita (editável) -->
              <div class="px-5 py-2.5 flex items-center gap-3">
                <span class="font-black text-white text-sm flex-1">Receita bruta (venda)</span>
                <span class="text-[12px] font-black text-emerald-400 w-4 text-center">+</span>
                ${inputMoney('__receita__', cur.receita)}
              </div>
              ${editRow('Kit fotovoltaico', 'kit', cur.custos.kit)}
              ${pctRow('Imposto', 'imposto', d0.imposto, `· ${cur.pct.imposto}% (venda − kit)`)}
              ${CUSTO_LINES.slice(1).map((l) => editRow(l.rotulo, l.key, cur.custos[l.key])).join('')}
              ${pctRow('Comissão', 'comissao', d0.comissao, `· ${cur.pct.comissao}%`)}
              ${pctRow('Royalties e fundo', 'royalties', d0.royalties, `· ${cur.pct.royalties}%`)}

              <!-- Linhas extras -->
              <div class="px-5 py-3 bg-neutral-950/40">
                <div class="flex items-center justify-between mb-2">
                  <span class="text-[9px] font-black uppercase tracking-widest text-neutral-500">Linhas extras (avulsas)</span>
                  <button type="button" data-orc-act="add-extra" class="text-[9px] font-black uppercase tracking-widest text-emerald-400 hover:text-white inline-flex items-center gap-1"><i data-lucide="plus" class="w-3 h-3"></i>Adicionar linha</button>
                </div>
                <div id="orc-dre-extras" class="space-y-2"></div>
              </div>

              ${pctRow('Deduções', 'deducoes', d0.deducoes, cur.pct.deducoes ? `· ${cur.pct.deducoes}%` : '')}

              <div class="px-5 py-3 flex items-center gap-3 border-t border-neutral-800">
                <span class="font-black text-white text-sm flex-1">Total de custos</span>
                <span id="orc-tot-custos" class="text-emerald-400 font-black num text-sm w-36 text-right pr-1">—</span>
              </div>
              <div class="px-5 py-3 flex items-center gap-3">
                <span class="font-black text-white text-sm flex-1">Lucro operacional</span>
                <span id="orc-tot-lucroop" class="text-emerald-400 font-black num text-sm w-36 text-right pr-1">—</span>
              </div>
              <div class="px-5 py-3 flex items-center gap-3 bg-neutral-950/40">
                <span class="font-black text-white text-sm flex-1">Lucro líquido</span>
                <span id="orc-tot-lucroliq" class="font-black num text-sm w-36 text-right pr-1 text-emerald-400">—</span>
              </div>
            </div>
          </div>

          <!-- Ações -->
          <div class="flex flex-wrap items-center gap-2">
            <button type="button" data-orc-act="save" class="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-black uppercase tracking-widest inline-flex items-center gap-2"><i data-lucide="save" class="w-4 h-4"></i>Salvar cenário</button>
            <button type="button" data-orc-act="reset" class="px-4 py-2.5 bg-neutral-900 border border-neutral-800 hover:border-neutral-600 text-neutral-300 text-[11px] font-black uppercase tracking-widest inline-flex items-center gap-2"><i data-lucide="rotate-ccw" class="w-4 h-4"></i>Resetar</button>
            <button type="button" data-orc-act="close" class="px-4 py-2.5 bg-neutral-900 border border-neutral-800 hover:border-neutral-600 text-neutral-300 text-[11px] font-black uppercase tracking-widest ml-auto">Fechar</button>
          </div>
          <p class="text-[10px] text-neutral-600 font-bold leading-relaxed">Simulação salva apenas neste navegador. Os custos são estimados pelo gestor; impostos, comissão, royalties e deduções vêm sugeridos pelos percentuais da empresa e podem ser ajustados (deixe o campo em branco para voltar ao automático).</p>
        </div>
      </div>`;

    document.body.appendChild(el);
    wireEvents(el);
    renderExtras();
    recalc();
    if (window.lucide) lucide.createIcons();
  }

  // Atualiza só os totais/auto/KPIs (não re-renderiza inputs → preserva foco).
  function recalc() {
    const d = compute();
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };

    // Linhas %: em modo automático (override null), o input acompanha a sugestão.
    // Não sobrescreve enquanto o campo está em foco (gestor digitando).
    const sug = { imposto: d.impostoSug, comissao: d.comissaoSug, royalties: d.royaltiesSug, deducoes: d.deducoesSug };
    Object.keys(sug).forEach((key) => {
      if (cur.overrides[key] != null) return;
      const inp = document.querySelector(`[data-orc-pct="${key}"]`);
      if (inp && document.activeElement !== inp) inp.value = num(sug[key]);
    });

    set('orc-tot-custos', '− ' + money(d.totalCustos));
    set('orc-tot-lucroop', money(d.lucro));
    set('orc-tot-lucroliq', money(d.lucroLiq));
    set('orc-k-receita', money(d.receita));
    set('orc-k-custos', money(d.totalCustos));
    set('orc-k-lucro', money(d.lucroLiq));

    const baixa = d.margem < (cur.pct.margem_min || 0);
    const mEl = document.getElementById('orc-k-margem');
    if (mEl) {
      mEl.textContent = (Number(d.margem) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
      mEl.className = 'text-base font-black mt-1 num ' + (baixa ? 'text-red-400' : 'text-emerald-400');
    }
    const liqEl = document.getElementById('orc-tot-lucroliq');
    if (liqEl) liqEl.className = 'font-black num text-sm w-36 text-right pr-1 ' + (d.lucroLiq < 0 ? 'text-red-400' : 'text-emerald-400');
  }

  function wireEvents(root) {
    // Inputs de custo / receita (recalcula ao vivo)
    root.addEventListener('input', (ev) => {
      const t = ev.target;
      if (t.matches('[data-orc-cost]')) {
        const key = t.getAttribute('data-orc-cost');
        if (key === '__receita__') cur.receita = num(t.value);
        else cur.custos[key] = num(t.value);
        recalc();
      } else if (t.matches('[data-orc-pct]')) {
        const key = t.getAttribute('data-orc-pct');
        // Campo vazio volta ao automático (segue o % da empresa); valor digitado vira override.
        cur.overrides[key] = (t.value === '') ? null : num(t.value);
        recalc();
      } else if (t.matches('[data-orc-ex-field]')) {
        const wrap = t.closest('[data-orc-extra]'); if (!wrap) return;
        const i = parseInt(wrap.getAttribute('data-orc-extra'), 10);
        const field = t.getAttribute('data-orc-ex-field');
        if (cur.extras[i]) { cur.extras[i][field] = field === 'valor' ? num(t.value) : t.value; recalc(); }
      }
    });
    // Selects de tipo das linhas extras
    root.addEventListener('change', (ev) => {
      const t = ev.target;
      if (t.matches('[data-orc-ex-field="tipo"]')) {
        const wrap = t.closest('[data-orc-extra]'); if (!wrap) return;
        const i = parseInt(wrap.getAttribute('data-orc-extra'), 10);
        if (cur.extras[i]) { cur.extras[i].tipo = t.value; recalc(); }
      }
    });
    // Botões
    root.addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-orc-act]'); if (!btn) return;
      const act = btn.getAttribute('data-orc-act');
      if (act === 'close') { closeOverlay(); }
      else if (act === 'save') { saveScenario(); }
      else if (act === 'reset') { resetScenario(); }
      else if (act === 'add-extra') { cur.extras.push({ tipo: 'despesa', rotulo: '', valor: 0 }); renderExtras(); recalc(); }
      else if (act === 'del-extra') {
        const wrap = btn.closest('[data-orc-extra]'); if (!wrap) return;
        const i = parseInt(wrap.getAttribute('data-orc-extra'), 10);
        cur.extras.splice(i, 1); renderExtras(); recalc();
      }
    });
    // Fecha ao clicar no backdrop ou ESC
    root.addEventListener('mousedown', (ev) => { if (ev.target === root) closeOverlay(); });
    document.addEventListener('keydown', onKeydown);
  }

  function onKeydown(ev) { if (ev.key === 'Escape') closeOverlay(); }

  function closeOverlay() {
    const el = document.getElementById('orc-dre-overlay');
    if (el) el.remove();
    document.removeEventListener('keydown', onKeydown);
    cur = null;
  }

  function saveScenario() {
    if (!cur) return;
    try {
      localStorage.setItem(lsKey(cur.propostaId), JSON.stringify({ receita: cur.receita, custos: cur.custos, extras: cur.extras, overrides: cur.overrides }));
      toastSafe('Cenário salvo neste navegador', 'ok');
    } catch (_) { toastSafe('Não foi possível salvar', 'err'); }
  }

  function resetScenario() {
    if (!cur || !cur._proposta) return;
    try { localStorage.removeItem(lsKey(cur.propostaId)); } catch (_) {}
    const seed = seedFromProposta(cur._proposta);
    cur.receita = seed.receita; cur.custos = seed.custos; cur.extras = seed.extras;
    cur.overrides = { imposto: null, comissao: null, royalties: null, deducoes: null };
    // Re-renderiza os inputs com os valores semeados
    buildOverlay(cur._proposta);
    toastSafe('Simulação resetada para o valor da venda', 'info');
  }

  function toastSafe(msg) {
    if (typeof window.showToast === 'function') { try { window.showToast(msg); return; } catch (_) {} }
    // sem toast global: silencioso (não quebrar)
  }

  // ---- API pública ----------------------------------------------------
  async function openOrcamentoDre(propostaId) {
    if (!(state && (state.isAdmin || state.isGestor))) return;
    const p = (state.propostas || []).find((x) => String(x.id) === String(propostaId));
    if (!p) { toastSafe('Proposta não encontrada', 'err'); return; }

    const pct = await loadPct();
    const saved = loadSaved(propostaId);
    const seed = seedFromProposta(p);
    cur = {
      propostaId: propostaId,
      _proposta: p,
      pct: pct,
      receita: saved && saved.receita != null ? num(saved.receita) : seed.receita,
      custos: Object.assign({}, seed.custos, (saved && saved.custos) || {}),
      extras: Array.isArray(saved && saved.extras) ? saved.extras : [],
      overrides: Object.assign({ imposto: null, comissao: null, royalties: null, deducoes: null }, (saved && saved.overrides) || {}),
    };
    buildOverlay(p);
  }

  window.openOrcamentoDre = openOrcamentoDre;
})();
