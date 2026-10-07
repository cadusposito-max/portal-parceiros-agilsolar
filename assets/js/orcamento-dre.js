/* =====================================================================
   Precificação interna por proposta — admin e gestor da unidade
   ---------------------------------------------------------------------
   - Cada custo é uma linha em % (sobre a venda ou sobre venda − kit) ou em
     R$ fixo. Os valores partem do CENTRO DE CUSTO da unidade dona da proposta
     (Financeiro → Config, RPC get_centro_custo); royalties e fundo de
     publicidade vêm do contrato (Rede) e só o admin mexe.
       lucro     = receita − (kit + linhas + despesas extras)
       lucro líq = lucro − deduções       margem = lucro líq / receita
   - O que muda aqui vale só para esta proposta (proposta_precificacao,
     overrides = { versao: 2, linhas, margem_alvo }). Linha diferente do
     padrão da unidade ganha a etiqueta "ajustado".
   - Precificações antigas (versão 1: custos em R$ + overrides em R$) abrem
     com os mesmos números, convertidos para linhas em R$.
   - Gestor só abre propostas da própria unidade (RPCs exigem). Aplicar o
     preço na proposta continua só admin.
   - Autocontido: usa apenas utilitários globais: escapeHTML, formatCurrency,
     state, supabaseClient, lucide.
   ===================================================================== */
(function () {
  'use strict';

  // Fallback quando o centro de custo não pode ser lido (espelha fin_config).
  const PCT_FALLBACK = { imposto: 13.8, comissao: 6, royalties: 3.5, publicidade: 1, deducoes: 0, margem_min: 15, margem_alvo: 22 };

  // Linhas de custo, na ordem da demonstração. `contrato` = vem da Rede (só admin edita).
  const LINHAS = [
    { key: 'imposto',     rotulo: 'Impostos' },
    { key: 'projeto',     rotulo: 'Projeto c/ ART' },
    { key: 'instalacao',  rotulo: 'Instalação' },
    { key: 'eletrica',    rotulo: 'Elétrica' },
    { key: 'placas',      rotulo: 'Placas de advertência' },
    { key: 'ajuda',       rotulo: 'Ajuda de custo instalação' },
    { key: 'vistoria',    rotulo: 'Vistoria' },
    { key: 'outros',      rotulo: 'Outros custos' },
    { key: 'comissao',    rotulo: 'Comissão de venda' },
    { key: 'royalties',   rotulo: 'Royalties', contrato: true },
    { key: 'publicidade', rotulo: 'Fundo de publicidade', contrato: true },
  ];
  const DEDUCOES = { key: 'deducoes', rotulo: 'Deduções' };
  const TODAS = LINHAS.concat([DEDUCOES]);
  const BASES = { v: 'Venda', vk: 'Venda − kit' };
  const LEGADO_RS = ['projeto', 'instalacao', 'eletrica', 'placas', 'ajuda', 'vistoria', 'outros'];

  let cur = null; // { propostaId, receita, kit, extras:[], linhas:{}, padrao:{}, margem_min, margem_alvo, ... }

  const num = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
  const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
  const money = (v) => formatCurrency(Number(v) || 0);
  const pctFmt = (v) => (Number(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  const lsKey = (id) => 'orc_dre_' + id;
  const podeContrato = () => !!(state && state.isAdmin);
  const linha = (t, v, b) => ({ t: t === 'brl' ? 'brl' : 'pct', v: num(v), b: b === 'vk' ? 'vk' : 'v' });
  const clone = (o) => JSON.parse(JSON.stringify(o));

  // ---- Centro de custo da unidade (com fallback) ------------------------
  function padraoFallback() {
    const p = PCT_FALLBACK, out = {};
    out.imposto = linha('pct', p.imposto, 'vk');
    out.comissao = linha('pct', p.comissao, 'v');
    out.royalties = linha('pct', p.royalties, 'v');
    out.publicidade = linha('pct', p.publicidade, 'v');
    out.deducoes = linha('pct', p.deducoes, 'v');
    LEGADO_RS.forEach((k) => { out[k] = linha('brl', 0, 'v'); });
    return { linhas: out, margem_min: p.margem_min, margem_alvo: p.margem_alvo, nome: null, fallback: true };
  }

  async function loadCentroCusto(franquiaId) {
    try {
      const { data, error } = await supabaseClient.rpc('get_centro_custo', { p_franquia_id: franquiaId || null });
      if (error || !data) throw error || new Error('vazio');
      const out = {};
      TODAS.forEach((l) => {
        const src = (l.contrato ? (data.contrato || {})[l.key] : (data.linhas || {})[l.key]) || null;
        out[l.key] = src ? linha(src.t, src.v, src.b) : (l.contrato ? linha('pct', 0, 'v') : linha('brl', 0, 'v'));
      });
      return { linhas: out, margem_min: num(data.margem_min), margem_alvo: num(data.margem_alvo), nome: data.franquia_nome || null, fallback: false };
    } catch (err) {
      console.warn('[precificacao] centro de custo indisponível; usando padrões', err);
      return padraoFallback();
    }
  }

  // Precificação salva → linhas efetivas desta proposta.
  // v2: overrides.linhas. v1 (antiga): custos/overrides em R$ — vira linha em R$
  // com o mesmo valor, para o resultado salvo não mudar.
  function linhasDoSalvo(saved, padrao) {
    const linhas = clone(padrao);
    if (!saved) return linhas;
    const ov = saved.overrides || {};
    if (ov.versao === 2 && ov.linhas && typeof ov.linhas === 'object') {
      TODAS.forEach((l) => { const s = ov.linhas[l.key]; if (s) linhas[l.key] = linha(s.t, s.v, s.b); });
      return linhas;
    }
    const custos = saved.custos || {};
    LEGADO_RS.forEach((k) => { linhas[k] = linha('brl', num(custos[k]), 'v'); });
    ['imposto', 'comissao', 'deducoes'].forEach((k) => { if (ov[k] != null) linhas[k] = linha('brl', ov[k], 'v'); });
    if (ov.royalties != null) { linhas.royalties = linha('brl', ov.royalties, 'v'); linhas.publicidade = linha('brl', 0, 'v'); }
    return linhas;
  }

  // ---- Persistência ---------------------------------------------------
  function loadLocalLegacy(id) {
    try {
      const raw = localStorage.getItem(lsKey(id));
      if (!raw) return null;
      const o = JSON.parse(raw);
      return (o && typeof o === 'object') ? o : null;
    } catch (_) { return null; }
  }

  async function loadSaved(id) {
    const { data, error } = await supabaseClient.rpc('get_proposta_precificacao', { p_proposta_id: id });
    if (error) throw error;
    return data || null;
  }

  function fmtSalvoEm(saved) {
    if (!saved || !saved.updated_at) return '';
    const d = new Date(saved.updated_at);
    const quando = d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return 'Salvo em ' + quando + (saved.updated_by_nome ? ' por ' + saved.updated_by_nome : '');
  }

  // Preço que está na proposta (link do cliente, PDF, card do vendedor).
  function precoProposta(p) {
    const isPersonalizada = p.proposal_mode === 'PERSONALIZADA' || p.proposal_mode === 'EQUIPAMENTOS';
    return num(isPersonalizada ? (p.custom_total_price || p.kit_price) : p.kit_price);
  }

  function seedFromProposta(p) {
    return { receita: num(precoProposta(p)), kit: 0, extras: [] };
  }

  // Proposta personalizada com lista de itens: custo do kit sugerido a partir do
  // custo cadastrado dos equipamentos do catálogo (componentes.custo × qtd).
  // Itens manuais, kits prontos e serviços não têm custo cadastrado → ficam de fora.
  async function sugerirCustoKit(p) {
    // Kit cotado na distribuidora (Admin → Distribuidoras): custo exato da cotação, com frete.
    if (p.cotacao_id) {
      const { data, error } = await supabaseClient.rpc('custo_cotacao_proposta', { p_proposta_id: p.id });
      if (!error && data && num(data.custo) > 0) {
        return { valor: r2(num(data.custo)), fonte: 'cotacao', provedor: data.provedor };
      }
    }
    const itens =(p.custom_config && Array.isArray(p.custom_config.itens)) ? p.custom_config.itens : [];
    const doCatalogo = itens.filter((i) => i.origem === 'componente' && i.ref_id && i.tipo !== 'servico');
    if (!doCatalogo.length) return null;
    const ids = [...new Set(doCatalogo.map((i) => i.ref_id))];
    const { data, error } = await supabaseClient.from('componentes').select('id, custo').in('id', ids);
    if (error || !data) return null;
    const custo = new Map(data.map((c) => [String(c.id), num(c.custo)]));
    let total = 0, comCusto = 0;
    doCatalogo.forEach((i) => {
      const c = custo.get(String(i.ref_id)) || 0;
      if (c > 0) { total += c * num(i.qtd); comCusto++; }
    });
    return comCusto ? { valor: r2(total), itens: comCusto, de: doCatalogo.length } : null;
  }

  // ---- Cálculo --------------------------------------------------------
  // Valor em R$ de uma linha. % incide sobre a venda (receita bruta, sem extras)
  // ou sobre venda − kit (como o imposto da planilha).
  function valorLinha(l, venda, kit) {
    if (!l) return 0;
    if (l.t === 'brl') return r2(l.v);
    const base = l.b === 'vk' ? venda - kit : venda;
    return r2(base * num(l.v) / 100);
  }

  function compute() {
    const venda = num(cur.receita);
    const kit = num(cur.kit);
    const extrasRec = cur.extras.filter((e) => e.tipo === 'receita').reduce((s, e) => s + num(e.valor), 0);
    const extrasDesp = cur.extras.filter((e) => e.tipo === 'despesa').reduce((s, e) => s + num(e.valor), 0);
    const receita = venda + extrasRec;

    const valores = {};
    TODAS.forEach((l) => { valores[l.key] = valorLinha(cur.linhas[l.key], venda, kit); });
    const somaLinhas = LINHAS.reduce((s, l) => s + valores[l.key], 0);
    const deducoes = valores.deducoes;

    const totalCustos = r2(kit + somaLinhas + extrasDesp);
    const lucro = r2(receita - totalCustos);
    const lucroLiq = r2(lucro - deducoes);
    const margem = receita > 0 ? r2(lucroLiq / receita * 100) : 0;

    // Venda que atinge a margem-alvo. Linha em % da venda entra como P, em % de
    // (venda − kit) como Q, em R$ como fixo F:
    // V·(1 − P − Q − m) = kit + F − Q·kit + extrasDesp − extrasRec·(1 − m)
    let P = 0, Q = 0, F = 0;
    TODAS.forEach((l) => {
      const x = cur.linhas[l.key]; if (!x) return;
      if (x.t === 'brl') F += num(x.v);
      else if (x.b === 'vk') Q += num(x.v) / 100;
      else P += num(x.v) / 100;
    });
    const m = num(cur.margem_alvo) / 100;
    const denom = 1 - P - Q - m;
    const vendaAlvo = denom > 0
      ? r2((kit + F - Q * kit + extrasDesp - extrasRec * (1 - m)) / denom)
      : null;

    return { receita, valores, deducoes, totalCustos, lucro, lucroLiq, margem, vendaAlvo };
  }

  function ajustado(key) {
    const a = cur.linhas[key], p = cur.padrao[key];
    if (!a || !p) return false;
    return a.t !== p.t || r2(a.v) !== r2(p.v) || (a.t === 'pct' && a.b !== p.b);
  }

  // ---- Render ---------------------------------------------------------
  function inputMoney(key, value) {
    return `<div class="relative w-36 orc-money">
        <span class="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-neutral-500 font-bold">R$</span>
        <input type="number" step="0.01" data-orc-cost="${key}" value="${num(value)}"
          class="w-full pl-7 pr-2 py-1.5 lg:py-1 bg-neutral-950 border border-neutral-800 focus:border-emerald-500/60 outline-none text-white num font-black text-right text-sm">
      </div>`;
  }

  function editRow(label, key, val) {
    return `<div class="orc-row px-5 py-2 lg:py-1.5 flex items-center gap-3">
        <span class="orc-lbl font-bold text-neutral-300 text-sm flex-1">${escapeHTML(label)}</span>
        <span class="text-[12px] font-black text-red-400 w-4 text-center">−</span>
        ${inputMoney(key, val)}
      </div>`;
  }

  // Linha de custo: [rótulo + ajustado] [% | R$] [valor] [sobre] [resultado].
  // Royalties/fundo (contrato) ficam travados para quem não é admin.
  function linhaRow(def) {
    const l = cur.linhas[def.key];
    const travada = def.contrato && !podeContrato();
    const tag = `<span class="orc-adj" data-orc-adj="${def.key}" style="${ajustado(def.key) ? '' : 'display:none'}">ajustado<button type="button" data-orc-act="reset-linha" data-k="${def.key}" class="orc-adj-x" title="Voltar ao padrão da unidade"><i data-lucide="undo-2" class="w-3 h-3"></i></button></span>`;
    const nome = `<span class="orc-lbl font-bold text-neutral-300 text-sm">${escapeHTML(def.rotulo)}${def.contrato ? ' <span class="text-[10px] text-neutral-600 font-bold">· contrato</span>' : ''}</span>`;
    let ctrl;
    if (travada) {
      ctrl = `<span class="orc-lock"><i data-lucide="lock" class="w-3 h-3"></i>${l.t === 'pct' ? pctFmt(l.v) + '% · ' + BASES[l.b].toLowerCase() : money(l.v) + ' fixo'}</span>`;
    } else {
      const seg = `<span class="orc-seg"><button type="button" data-orc-tipo="pct" data-k="${def.key}" class="${l.t === 'pct' ? 'on' : ''}">%</button><button type="button" data-orc-tipo="brl" data-k="${def.key}" class="${l.t === 'brl' ? 'on' : ''}">R$</button></span>`;
      const inp = `<div class="relative orc-money orc-money-sm">
          <span class="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-neutral-500 font-bold">${l.t === 'pct' ? '%' : 'R$'}</span>
          <input type="number" min="0" step="${l.t === 'pct' ? '0.1' : '0.01'}" data-orc-linha="${def.key}" value="${num(l.v)}"
            class="w-full pl-7 pr-2 py-1.5 lg:py-1 bg-neutral-950 border border-neutral-800 focus:border-emerald-500/60 outline-none text-white num font-black text-right text-sm">
        </div>`;
      const base = l.t === 'pct'
        ? `<select data-orc-base="${def.key}" class="orc-base">${Object.entries(BASES).map(([k, n]) => `<option value="${k}"${k === l.b ? ' selected' : ''}>${n}</option>`).join('')}</select>`
        : `<span class="orc-base orc-base-fixo">Fixo</span>`;
      ctrl = seg + inp + base;
    }
    return `<div class="orc-row orc-linha px-5 py-2 lg:py-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5" data-orc-row="${def.key}">
        <div class="flex-1 min-w-[150px] flex items-center flex-wrap gap-1.5">${nome}${tag}</div>
        <div class="orc-ctrl flex items-center gap-2">${ctrl}</div>
        <span class="orc-res text-red-400 font-black num text-sm w-28 text-right" data-orc-res="${def.key}">—</span>
      </div>`;
  }

  function renderLinhas() {
    const host = document.getElementById('orc-linhas'); if (!host) return;
    host.innerHTML = LINHAS.map(linhaRow).join('');
    const ded = document.getElementById('orc-linha-ded');
    if (ded) ded.innerHTML = linhaRow(DEDUCOES);
    if (window.lucide) lucide.createIcons();
    recalc();
  }

  function extraRowHtml(e, i) {
    return `<div class="orc-extra flex items-center gap-2" data-orc-extra="${i}">
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
      : `<div class="orc-vazio text-[10px] text-neutral-600 font-bold uppercase tracking-widest">Nenhuma linha extra (opcional)</div>`;
    if (window.lucide) lucide.createIcons();
  }

  function buildOverlay(p) {
    const old = document.getElementById('orc-dre-overlay');
    if (old) old.remove();

    const titulo = escapeHTML(p.kit_nome || 'Proposta personalizada');
    const cliente = escapeHTML(p.cliente_nome || '—');
    const isAdmin = !!(state && state.isAdmin);
    const unidade = cur.unidadeNome ? escapeHTML(cur.unidadeNome) : 'da unidade';

    const el = document.createElement('div');
    el.id = 'orc-dre-overlay';
    // Celular: coluna única rolando (layout original).
    // Desktop (lg+): quadro 16:9 sem rolar a página — demonstração à esquerda
    // (rola por dentro) e resumo/ações fixos à direita.
    el.className = 'fixed inset-0 z-[130] flex items-start md:items-center justify-center bg-black/90 backdrop-blur-md p-2 md:p-4 lg:p-6 overflow-y-auto lg:overflow-hidden';
    el.innerHTML = `
      <div class="orc-box w-full max-w-3xl bg-[#0a0a0a] border border-neutral-800 shadow-2xl my-4 lg:my-0 lg:max-w-none lg:w-[min(96vw,calc(92vh*16/9))] lg:h-[min(92vh,calc(96vw*9/16))] lg:flex lg:flex-col">
        <div class="orc-head sticky top-0 lg:static bg-[#0a0a0a] border-b border-neutral-800 px-5 py-4 lg:py-3 flex items-start justify-between gap-3 z-10 lg:shrink-0">
          <div class="min-w-0">
            <div class="orc-tag text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400 flex items-center gap-1.5"><i data-lucide="lock" class="w-3 h-3"></i>Precificação interna · ${isAdmin ? 'admin' : 'gestão da unidade'}</div>
            <h3 class="orc-title text-lg font-black text-white mt-1 truncate">${titulo}</h3>
            <div class="orc-cli text-[11px] text-neutral-500 font-bold truncate">${cliente}</div>
            <div id="orc-salvo-info" class="text-[10px] font-bold mt-1 ${cur.origem === 'banco' ? 'text-neutral-500' : 'text-yellow-500'}">${
              cur.origem === 'banco' ? escapeHTML(fmtSalvoEm(cur.saved))
              : cur.origem === 'local' ? 'Rascunho antigo deste navegador — clique em Salvar para gravar'
              : 'Ainda não salvo'}${cur.sugestaoKit && cur.origem === 'novo'
                ? ` · <span class="text-neutral-400">${cur.sugestaoKit.fonte === 'cotacao'
                  ? `custo do kit preenchido pela cotação da ${cur.sugestaoKit.provedor === 'belenus' ? 'Belenus' : 'distribuidora'} (com frete)`
                  : `custo do kit preenchido pelo catálogo (${cur.sugestaoKit.itens} de ${cur.sugestaoKit.de} equipamentos com custo)`}</span>`
                : ''}</div>
          </div>
          <button type="button" data-orc-act="close" class="orc-x shrink-0 w-9 h-9 grid place-items-center bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white transition-colors"><i data-lucide="x" class="w-4 h-4"></i></button>
        </div>

        <div class="p-5 flex flex-col gap-4 lg:p-0 lg:gap-0 lg:flex-1 lg:min-h-0 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)] lg:grid-rows-[minmax(0,1fr)]">
          <!-- Cascata (desktop: coluna esquerda com rolagem própria) -->
          <div class="orc-main order-2 lg:order-none lg:col-start-1 lg:row-start-1 lg:min-h-0 lg:overflow-y-auto custom-scrollbar lg:p-5">
          <div class="orc-dre border border-neutral-800">
            <div class="orc-dre-h px-5 py-3 lg:py-2.5 border-b border-neutral-800 flex items-center justify-between lg:sticky lg:top-0 lg:bg-[#0a0a0a] lg:z-10">
              <span class="orc-dre-t text-[10px] font-black uppercase tracking-[0.2em] text-neutral-300">Demonstração do resultado</span>
              <span class="flex items-center gap-2">
                <span class="orc-dre-s text-[9px] font-bold text-neutral-600 uppercase tracking-widest">Custos ${cur.unidadeNome ? 'de ' + unidade : 'da unidade'}</span>
                <button type="button" data-orc-act="reset-todas" class="orc-link text-[9px] font-black uppercase tracking-widest text-emerald-400 hover:text-white inline-flex items-center gap-1"><i data-lucide="undo-2" class="w-3 h-3"></i>Voltar ao padrão</button>
              </span>
            </div>
            <div class="divide-y divide-neutral-800/70">
              <!-- Receita (editável) -->
              <div class="orc-row rec px-5 py-2.5 lg:py-1.5 flex items-center gap-3">
                <span class="orc-lbl font-black text-white text-sm flex-1">Receita bruta (venda)</span>
                <span class="text-[12px] font-black text-emerald-400 w-4 text-center">+</span>
                ${inputMoney('__receita__', cur.receita)}
              </div>
              ${editRow('Kit fotovoltaico', 'kit', cur.kit)}
              <div id="orc-linhas" class="divide-y divide-neutral-800/70"></div>

              <!-- Linhas extras -->
              <div class="orc-extras px-5 py-3 lg:py-2 bg-neutral-950/40">
                <div class="flex items-center justify-between mb-2">
                  <span class="orc-sec text-[9px] font-black uppercase tracking-widest text-neutral-500">Linhas extras (avulsas)</span>
                  <button type="button" data-orc-act="add-extra" class="orc-link text-[9px] font-black uppercase tracking-widest text-emerald-400 hover:text-white inline-flex items-center gap-1"><i data-lucide="plus" class="w-3 h-3"></i>Adicionar linha</button>
                </div>
                <div id="orc-dre-extras" class="space-y-2"></div>
              </div>

              <div id="orc-linha-ded"></div>

              <div class="orc-row tot px-5 py-3 lg:py-2 flex items-center gap-3 border-t border-neutral-800">
                <span class="orc-lbl font-black text-white text-sm flex-1">Total de custos</span>
                <span id="orc-tot-custos" class="text-emerald-400 font-black num text-sm w-36 text-right pr-1">—</span>
              </div>
              <div class="orc-row tot px-5 py-3 lg:py-2 flex items-center gap-3">
                <span class="orc-lbl font-black text-white text-sm flex-1">Lucro operacional</span>
                <span id="orc-tot-lucroop" class="text-emerald-400 font-black num text-sm w-36 text-right pr-1">—</span>
              </div>
              <div class="orc-row fin px-5 py-3 lg:py-2 flex items-center gap-3 bg-neutral-950/40">
                <span class="orc-lbl font-black text-white text-sm flex-1">Lucro líquido</span>
                <span id="orc-tot-lucroliq" class="font-black num text-sm w-36 text-right pr-1 text-emerald-400">—</span>
              </div>
            </div>
          </div>
          </div>

          <!-- Resumo + ações (celular: os filhos entram no fluxo pela ordem; desktop: coluna direita) -->
          <div class="orc-side contents lg:flex lg:flex-col lg:gap-4 lg:col-start-2 lg:row-start-1 lg:min-h-0 lg:overflow-y-auto custom-scrollbar lg:p-5 lg:border-l lg:border-neutral-800 lg:bg-neutral-950/30">
            <!-- KPIs -->
            <div class="order-1 lg:order-none grid grid-cols-2 md:grid-cols-4 lg:grid-cols-2 gap-3">
              <div class="orc-kpi border border-neutral-800 p-4 bg-neutral-950/40">
                <div class="orc-kpi-l text-[9px] font-black uppercase tracking-widest text-neutral-500">Receita</div>
                <div id="orc-k-receita" class="text-base lg:text-lg font-black text-white mt-1 num">—</div>
              </div>
              <div class="orc-kpi border border-neutral-800 p-4 bg-neutral-950/40">
                <div class="orc-kpi-l text-[9px] font-black uppercase tracking-widest text-neutral-500">Total custos</div>
                <div id="orc-k-custos" class="text-base lg:text-lg font-black text-emerald-400 mt-1 num">—</div>
              </div>
              <div class="orc-kpi border border-neutral-800 p-4 bg-neutral-950/40">
                <div class="orc-kpi-l text-[9px] font-black uppercase tracking-widest text-neutral-500">Lucro líquido</div>
                <div id="orc-k-lucro" class="text-base lg:text-lg font-black text-white mt-1 num">—</div>
              </div>
              <div class="orc-kpi border border-neutral-800 p-4 bg-neutral-950/40">
                <div class="orc-kpi-l text-[9px] font-black uppercase tracking-widest text-neutral-500">Margem</div>
                <div id="orc-k-margem" class="text-base lg:text-lg font-black mt-1 num">—</div>
              </div>
            </div>

            <!-- Preço para a margem-alvo -->
            <div class="orc-alvo order-3 lg:order-none border border-neutral-800 px-5 py-3 flex flex-wrap items-center gap-3 bg-neutral-950/40">
              <span class="text-[11px] font-bold text-neutral-400 flex-1 min-w-[180px]">Venda para margem-alvo de
                <span class="relative inline-block w-20 orc-money orc-money-sm align-middle"><input type="number" min="0" max="99" step="0.5" data-orc-alvo value="${num(cur.margem_alvo)}"
                  class="w-full pl-2 pr-6 py-1 bg-neutral-950 border border-neutral-800 focus:border-emerald-500/60 outline-none text-white num font-black text-right text-sm"><span class="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-neutral-500 font-bold">%</span></span></span>
              <span id="orc-venda-alvo" class="font-black num text-sm text-white">—</span>
              <button type="button" data-orc-act="usar-alvo" class="orc-usar px-3 py-1.5 bg-neutral-900 border border-neutral-800 hover:border-emerald-500/60 text-emerald-400 text-[10px] font-black uppercase tracking-widest">Usar</button>
            </div>

            <!-- Preço que o cliente e o vendedor veem (só muda com "Aplicar") -->
            <div class="orc-alvo orc-preco order-3 lg:order-none border border-neutral-800 px-5 py-3 flex flex-wrap items-center gap-3 bg-neutral-950/40">
              <span class="text-[11px] font-bold text-neutral-400 flex-1 min-w-[180px]">Preço na proposta hoje <b class="text-white">(o que cliente e vendedor veem)</b></span>
              <span id="orc-preco-atual" class="font-black num text-sm text-white">${money(precoProposta(p))}</span>
            </div>

            <!-- Ações -->
            <div class="order-4 lg:order-none flex flex-wrap lg:flex-col lg:items-stretch items-center gap-2">
              <button type="button" data-orc-act="aplicar" id="orc-aplicar" style="${isAdmin ? '' : 'display:none'}" class="orc-btn px-4 py-2.5 bg-neutral-900 border border-neutral-800 hover:border-neutral-600 text-neutral-300 text-[11px] font-black uppercase tracking-widest inline-flex items-center justify-center gap-2"><i data-lucide="badge-dollar-sign" class="w-4 h-4"></i><span id="orc-aplicar-tx">Aplicar na proposta</span></button>
              <button type="button" data-orc-act="save" class="orc-btn pri px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-black uppercase tracking-widest inline-flex items-center justify-center gap-2"><i data-lucide="save" class="w-4 h-4"></i>Salvar</button>
              <button type="button" data-orc-act="reset" class="orc-btn px-4 py-2.5 bg-neutral-900 border border-neutral-800 hover:border-red-500/60 text-neutral-300 text-[11px] font-black uppercase tracking-widest inline-flex items-center justify-center gap-2"><i data-lucide="rotate-ccw" class="w-4 h-4"></i>Apagar e recomeçar</button>
              <button type="button" data-orc-act="close" class="orc-btn px-4 py-2.5 bg-neutral-900 border border-neutral-800 hover:border-neutral-600 text-neutral-300 text-[11px] font-black uppercase tracking-widest ml-auto lg:ml-0">Fechar</button>
            </div>
            <p class="orc-nota order-5 lg:order-none lg:mt-auto text-[10px] text-neutral-600 font-bold leading-relaxed">Visível só para admin e para o gestor da unidade. Os custos partem do centro de custo da unidade (Financeiro → Config); royalties e fundo vêm do contrato. Ajustes aqui valem só para esta proposta — linha com "ajustado" saiu do padrão.${isAdmin ? '' : ' Para mudar o preço da proposta, fale com o admin.'}${cur.centroFallback ? ' <span class="orc-aviso text-yellow-500">Centro de custo indisponível agora; usando os percentuais padrão do Financeiro.</span>' : ''}</p>
          </div>
        </div>
      </div>`;

    document.body.appendChild(el);
    wireEvents(el);
    renderExtras();
    renderLinhas();
    if (window.lucide) lucide.createIcons();
  }

  // Atualiza só resultados/totais/KPIs (não re-renderiza inputs → preserva foco).
  function recalc() {
    const d = compute();
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };

    TODAS.forEach((l) => {
      const res = document.querySelector(`[data-orc-res="${l.key}"]`);
      if (res) res.textContent = '− ' + money(d.valores[l.key]);
      const tag = document.querySelector(`[data-orc-adj="${l.key}"]`);
      if (tag) tag.style.display = ajustado(l.key) ? '' : 'none';
    });

    set('orc-tot-custos', '− ' + money(d.totalCustos));
    set('orc-tot-lucroop', money(d.lucro));
    set('orc-tot-lucroliq', money(d.lucroLiq));
    set('orc-k-receita', money(d.receita));
    set('orc-k-custos', money(d.totalCustos));
    set('orc-k-lucro', money(d.lucroLiq));

    const baixa = d.margem < (cur.margem_min || 0);
    const mEl = document.getElementById('orc-k-margem');
    if (mEl) {
      mEl.textContent = (Number(d.margem) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
      mEl.className = 'text-base font-black mt-1 num ' + (baixa ? 'text-red-400' : 'text-emerald-400');
    }
    const liqEl = document.getElementById('orc-tot-lucroliq');
    if (liqEl) liqEl.className = 'font-black num text-sm w-36 text-right pr-1 ' + (d.lucroLiq < 0 ? 'text-red-400' : 'text-emerald-400');
    set('orc-venda-alvo', d.vendaAlvo == null ? 'inviável com esses %' : money(d.vendaAlvo));

    // "Aplicar" só aparece quando a venda da calculadora difere do preço da proposta
    const aplicar = document.getElementById('orc-aplicar');
    if (aplicar && cur._proposta && state && state.isAdmin) {
      const igual = r2(cur.receita) === r2(precoProposta(cur._proposta)) || !(r2(cur.receita) > 0);
      aplicar.style.display = igual ? 'none' : '';
      set('orc-aplicar-tx', `Aplicar ${money(r2(cur.receita))} na proposta`);
    }
  }

  // Leva a "Receita bruta" da calculadora para o preço da proposta (mesmo link).
  let _aplicando = false;
  async function aplicarNaProposta() {
    if (!cur || !cur._proposta || _aplicando) return;
    const alvo = cur;
    const de = precoProposta(alvo._proposta);
    const para = r2(alvo.receita);
    if (!(para > 0) || para === r2(de)) return;
    if (!confirm(`Mudar o preço da proposta de ${money(de)} para ${money(para)}?\n\nO cliente (no mesmo link), o PDF e o vendedor passam a ver o novo valor. A mudança fica registrada na timeline do cliente.`)) return;
    _aplicando = true;
    try {
      const { data, error } = await supabaseClient.rpc('aplicar_preco_proposta', { p_proposta_id: alvo.propostaId, p_valor: para });
      if (error) throw error;
      // mantém a proposta em memória igual ao banco (card, ficha, calculadora)
      const isPers = alvo._proposta.proposal_mode === 'PERSONALIZADA' || alvo._proposta.proposal_mode === 'EQUIPAMENTOS';
      alvo._proposta.kit_price = para;
      if (isPers) { alvo._proposta.custom_total_price = para; alvo._proposta.kit_list_price = para; }
      else if (!(num(alvo._proposta.kit_list_price) >= para)) alvo._proposta.kit_list_price = para;
      if (cur === alvo) {
        const atual = document.getElementById('orc-preco-atual');
        if (atual) atual.textContent = money(para);
        recalc();
      }
      await saveScenario(); // o cenário salvo passa a bater com o preço aplicado
      toastSafe(data && data.alterado === false ? 'A proposta já estava com esse preço' : `Preço da proposta atualizado para ${money(para)}`);
      if (typeof fetchPropostas === 'function') await fetchPropostas();
      if (typeof renderCrm360 === 'function' && typeof _crm360ClientId !== 'undefined' && _crm360ClientId) renderCrm360();
      preencherSelosPrecificacao();
    } catch (err) {
      console.error('[precificacao] aplicar', err);
      toastSafe((err && err.message) || 'Não foi possível aplicar o preço na proposta');
    } finally {
      _aplicando = false;
    }
  }

  function usarVendaAlvo() {
    const d = compute();
    if (d.vendaAlvo == null) return;
    cur.receita = d.vendaAlvo;
    const inp = document.querySelector('[data-orc-cost="__receita__"]');
    if (inp) inp.value = d.vendaAlvo;
    recalc();
  }

  // Troca % ↔ R$ convertendo o valor (o resultado da linha não muda na troca).
  function trocarTipo(key, tipo) {
    const l = cur.linhas[key]; if (!l || l.t === tipo) return;
    const venda = num(cur.receita), kit = num(cur.kit);
    const atual = valorLinha(l, venda, kit);
    if (tipo === 'brl') { l.t = 'brl'; l.v = r2(atual); }
    else {
      l.t = 'pct';
      const base = l.b === 'vk' ? venda - kit : venda;
      l.v = base > 0 ? r2(atual / base * 100) : 0;
    }
    renderLinhas();
  }

  function wireEvents(root) {
    // Inputs de custo / receita (recalcula ao vivo)
    root.addEventListener('input', (ev) => {
      const t = ev.target;
      if (t.matches('[data-orc-cost]')) {
        const key = t.getAttribute('data-orc-cost');
        if (key === '__receita__') cur.receita = num(t.value);
        else if (key === 'kit') cur.kit = num(t.value);
        recalc();
      } else if (t.matches('[data-orc-linha]')) {
        const l = cur.linhas[t.getAttribute('data-orc-linha')];
        if (l) { l.v = Math.max(0, num(t.value)); recalc(); }
      } else if (t.matches('[data-orc-alvo]')) {
        cur.margem_alvo = Math.min(99, Math.max(0, num(t.value)));
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
      if (t.matches('[data-orc-base]')) {
        const l = cur.linhas[t.getAttribute('data-orc-base')];
        if (l) { l.b = t.value === 'vk' ? 'vk' : 'v'; recalc(); }
      } else if (t.matches('[data-orc-ex-field="tipo"]')) {
        const wrap = t.closest('[data-orc-extra]'); if (!wrap) return;
        const i = parseInt(wrap.getAttribute('data-orc-extra'), 10);
        if (cur.extras[i]) { cur.extras[i].tipo = t.value; recalc(); }
      }
    });
    // Botões
    root.addEventListener('click', (ev) => {
      const tipoBtn = ev.target.closest('[data-orc-tipo]');
      if (tipoBtn) { trocarTipo(tipoBtn.getAttribute('data-k'), tipoBtn.getAttribute('data-orc-tipo')); return; }
      const btn = ev.target.closest('[data-orc-act]'); if (!btn) return;
      const act = btn.getAttribute('data-orc-act');
      if (act === 'close') { closeOverlay(); }
      else if (act === 'reset-linha') {
        const k = btn.getAttribute('data-k');
        const def = TODAS.find((l) => l.key === k);
        if (def && (!def.contrato || podeContrato()) && cur.padrao[k]) { cur.linhas[k] = clone(cur.padrao[k]); renderLinhas(); }
      }
      else if (act === 'reset-todas') {
        TODAS.forEach((l) => { if ((!l.contrato || podeContrato()) && cur.padrao[l.key]) cur.linhas[l.key] = clone(cur.padrao[l.key]); });
        cur.margem_alvo = cur.margem_alvo_padrao;
        const a = document.querySelector('[data-orc-alvo]'); if (a) a.value = num(cur.margem_alvo);
        renderLinhas();
      }
      else if (act === 'save') { saveScenario(); }
      else if (act === 'aplicar') { aplicarNaProposta(); }
      else if (act === 'reset') { resetScenario(); }
      else if (act === 'usar-alvo') { usarVendaAlvo(); }
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

  let _salvando = false;
  async function saveScenario() {
    if (!cur || _salvando) return;
    _salvando = true;
    const alvo = cur;
    const d = compute();
    try {
      const { error } = await supabaseClient.rpc('save_proposta_precificacao', {
        p_proposta_id:   alvo.propostaId,
        p_receita:       r2(alvo.receita),
        p_custos:        { kit: r2(alvo.kit) },
        p_extras:        alvo.extras.map((e) => ({ tipo: e.tipo === 'receita' ? 'receita' : 'despesa', rotulo: String(e.rotulo || ''), valor: r2(e.valor) })),
        p_overrides:     { versao: 2, linhas: clone(alvo.linhas), margem_alvo: num(alvo.margem_alvo) },
        p_total_custos:  d.totalCustos,
        p_lucro_liquido: d.lucroLiq,
        p_margem_pct:    d.margem,
      });
      if (error) throw error;
      try { localStorage.removeItem(lsKey(alvo.propostaId)); } catch (_) {}
      alvo.origem = 'banco';
      try { alvo.saved = await loadSaved(alvo.propostaId); } catch (_) { alvo.saved = { updated_at: new Date().toISOString() }; }
      const info = document.getElementById('orc-salvo-info');
      if (info && cur === alvo) { info.textContent = fmtSalvoEm(alvo.saved); info.className = 'text-[10px] font-bold mt-1 text-neutral-500'; }
      _resumoCache[alvo.propostaId] = { margem_pct: d.margem, lucro_liquido: d.lucroLiq };
      preencherSelosPrecificacao(true);
      toastSafe('Precificação salva');
    } catch (err) {
      console.error('[precificacao] salvar', err);
      toastSafe('Não foi possível salvar a precificação');
    } finally {
      _salvando = false;
    }
  }

  async function resetScenario() {
    if (!cur || !cur._proposta) return;
    if (cur.origem === 'banco' && !confirm('Apagar a precificação salva desta proposta?')) return;
    const alvo = cur;
    try {
      if (alvo.origem === 'banco') {
        const { error } = await supabaseClient.rpc('delete_proposta_precificacao', { p_proposta_id: alvo.propostaId });
        if (error) throw error;
      }
    } catch (err) {
      console.error('[precificacao] apagar', err);
      toastSafe('Não foi possível apagar');
      return;
    }
    try { localStorage.removeItem(lsKey(alvo.propostaId)); } catch (_) {}
    delete _resumoCache[alvo.propostaId];
    preencherSelosPrecificacao(true);
    const seed = seedFromProposta(alvo._proposta);
    if (alvo.sugestaoKit) seed.kit = alvo.sugestaoKit.valor;
    alvo.receita = seed.receita; alvo.kit = seed.kit; alvo.extras = seed.extras;
    alvo.linhas = clone(alvo.padrao);
    alvo.margem_alvo = alvo.margem_alvo_padrao;
    alvo.origem = 'novo'; alvo.saved = null;
    if (cur !== alvo) return;
    buildOverlay(alvo._proposta);
    toastSafe('Precificação apagada — recomeçando do valor da venda');
  }

  // ---- Selo de margem nos cards de proposta (CRM) ----------------------
  const _resumoCache = {};
  async function preencherSelosPrecificacao(soCache) {
    if (!(state && state.isAdmin)) return;
    const els = Array.from(document.querySelectorAll('[data-prec-selo]'));
    if (!els.length) return;
    const faltando = els.map((e) => e.getAttribute('data-prec-selo')).filter((id) => !(id in _resumoCache));
    if (faltando.length && !soCache) {
      try {
        const { data, error } = await supabaseClient.rpc('list_proposta_precificacao_resumo', { p_ids: faltando });
        if (error) throw error;
        faltando.forEach((id) => { _resumoCache[id] = (data && data[id]) || null; });
      } catch (err) {
        console.warn('[precificacao] resumo', err);
        return;
      }
    }
    const min = PCT_FALLBACK.margem_min;
    els.forEach((el) => {
      const r = _resumoCache[el.getAttribute('data-prec-selo')];
      if (!r || r.margem_pct == null) { el.innerHTML = ''; return; }
      const m = Number(r.margem_pct);
      const baixa = m < min;
      el.innerHTML = `<span title="Margem da precificação interna (só admin)" class="text-[9px] px-1.5 py-0.5 uppercase font-black tracking-widest border ${baixa ? 'text-red-400 border-red-500/30 bg-red-500/10' : 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'}">Margem ${m.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%</span>`;
    });
  }

  function toastSafe(msg) {
    if (typeof window.showToast === 'function') { try { window.showToast(msg); return; } catch (_) {} }
    // sem toast global: silencioso (não quebrar)
  }

  // ---- API pública ----------------------------------------------------
  async function openOrcamentoDre(propostaId) {
    if (!(state && (state.isAdmin || state.isGestor))) return;
    const p = (state.propostas || []).find((x) => String(x.id) === String(propostaId));
    if (!p) { toastSafe('Proposta não encontrada'); return; }

    let dbSaved;
    try {
      dbSaved = await loadSaved(propostaId);
    } catch (err) {
      console.error('[precificacao] carregar', err);
      toastSafe('Não foi possível carregar a precificação');
      return;
    }
    const centro = await loadCentroCusto(p.franquia_id);
    const legacy = dbSaved ? null : loadLocalLegacy(propostaId);
    const saved = dbSaved || legacy;
    const seed = seedFromProposta(p);
    // Calculada sempre (também serve para "Apagar e recomeçar"); só preenche se não há nada salvo.
    let sugestaoKit = null;
    try { sugestaoKit = await sugerirCustoKit(p); } catch (_) { sugestaoKit = null; }
    if (sugestaoKit && !saved) seed.kit = sugestaoKit.valor;
    const ov = (saved && saved.overrides) || {};
    cur = {
      sugestaoKit: sugestaoKit,
      propostaId: propostaId,
      _proposta: p,
      padrao: centro.linhas,
      unidadeNome: centro.nome,
      centroFallback: centro.fallback,
      margem_min: centro.margem_min,
      margem_alvo_padrao: centro.margem_alvo,
      margem_alvo: ov.versao === 2 && ov.margem_alvo != null ? num(ov.margem_alvo) : centro.margem_alvo,
      origem: dbSaved ? 'banco' : (legacy ? 'local' : 'novo'),
      saved: dbSaved,
      receita: saved && saved.receita != null ? num(saved.receita) : seed.receita,
      kit: saved && saved.custos && saved.custos.kit != null ? num(saved.custos.kit) : seed.kit,
      extras: Array.isArray(saved && saved.extras) ? saved.extras : [],
      linhas: linhasDoSalvo(saved, centro.linhas),
    };
    buildOverlay(p);
  }

  window.openOrcamentoDre = openOrcamentoDre;
  window.preencherSelosPrecificacao = preencherSelosPrecificacao;
})();
