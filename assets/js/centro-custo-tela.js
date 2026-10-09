/* ==========================================
   CENTRO DE CUSTO DA UNIDADE (Financeiro → Configurações)
   ==========================================
   Como a unidade calcula o preço dos kits (markup atual ou custos + margem alvo),
   os custos em grupos (impostos, custos da obra, contrato da Rede, margem) e uma
   simulação ao vivo. Grava por get/set_centro_custo; a conta é a do
   CentroCustoCalc (igual à do banco). Admin escolhe a unidade; gestor edita a dele. */
(function () {
  'use strict';

  const GRUPOS = [
    { id: 'taxas', titulo: 'Impostos e comissão', icone: 'percent', linhas: [['imposto', 'Imposto do CNPJ'], ['comissao', 'Comissão de venda'], ['deducoes', 'Deduções']] },
    { id: 'obra', titulo: 'Custos da obra', icone: 'hammer', extras: true, linhas: [
      ['instalacao', 'Instalação'], ['projeto', 'ART'], ['placas', 'Placas de advertência'],
      ['eletrica_fixa', 'Elétrica (fixa por obra)'], ['eletrica', 'Elétrica (cresce com o sistema)'],
      ['ajuda', 'Ajuda de custo instalação'], ['vistoria', 'Vistoria'], ['outros', 'Outros custos']] },
  ];
  const FIXAS = GRUPOS.flatMap((g) => g.linhas.map(([k]) => k));
  const MAX_EXTRAS = 15;

  let cc = null; // { fid, data, linhas, mmin, malvo, modo, sujo, sim, custos }
  const calc = () => window.CentroCustoCalc;
  const num = (v) => Number(v) || 0;
  const esc = (s) => (typeof escapeHTML === 'function' ? escapeHTML(String(s ?? '')) : String(s ?? ''));
  const money = (v) => (typeof formatCurrency === 'function' ? formatCurrency(v) : 'R$ ' + num(v).toFixed(2));
  const pct = (v) => num(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + '%';
  const toast = (msg, tipo) => { if (typeof showToast === 'function') showToast(msg); else console.log('[centro de custo]', tipo || '', msg); };
  const icons = () => { if (window.lucide) lucide.createIcons(); };
  const host = () => document.getElementById('fin-cc');
  const temModo = () => !!(cc && cc.data && 'modo_preco' in cc.data);
  const temNovasBases = () => !!(cc && cc.data && cc.data.linhas && 'eletrica_fixa' in cc.data.linhas);

  // Formas de cálculo, como uma lista só (tipo + base).
  function formas() {
    const c = calc();
    const out = [['brl:v', c.bases.v], ['brl:modulo', c.bases.modulo], ['brl:kwp', c.bases.kwp]];
    if (temNovasBases()) out.push(['brl:inversor', c.bases.inversor], ['brl:kw_inversor', c.bases.kw_inversor], ['brl:faixa', c.bases.faixa]);
    out.push(['pct:v', c.basesPct.v], ['pct:vk', c.basesPct.vk]);
    if (temNovasBases()) out.push(['pct:kit', c.basesPct.kit]);
    return out;
  }

  function extras() {
    return Object.keys(cc.linhas).filter((k) => calc().ehExtra(k));
  }

  // ---------------------------------------------------------------- carregar
  async function render(fid) {
    const el = host(); if (!el) return;
    if (!(state.isAdmin || state.isGestor)) { el.remove(); return; }
    const alvo = state.isAdmin ? (fid || (cc && cc.fid) || state.franquiaId) : state.franquiaId;
    if (!alvo) { el.innerHTML = '<p class="cc-hint">Seu usuário não está ligado a uma unidade.</p>'; return; }
    const { data, error } = await supabaseClient.rpc('get_centro_custo', { p_franquia_id: alvo });
    if (error || !data) { el.innerHTML = '<p class="cc-hint">Centro de custo indisponível.</p>'; return; }
    const linhas = {};
    Object.entries(data.linhas || {}).forEach(([k, l]) => {
      if (FIXAS.includes(k) || calc().ehExtra(k)) linhas[k] = calc().linha(l.t, l.v, l.b, l);
    });
    FIXAS.forEach((k) => { if (!linhas[k] && (k !== 'eletrica_fixa' || 'eletrica_fixa' in (data.linhas || {}))) linhas[k] = calc().linha('brl', 0, 'v'); });
    const simAnterior = cc && cc.fid === alvo ? cc.sim : null;
    cc = {
      fid: alvo, data, linhas, sujo: false,
      mmin: num(data.margem_min), malvo: num(data.margem_alvo),
      modo: data.modo_preco === 'custos' ? 'custos' : 'markup',
      sim: simAnterior || { kitId: '', modulos: 10, kwp: 6.2, inversores: 1, kwInversor: 5, kit: '' },
      custos: cc && cc.custos,
    };
    if (state.isAdmin && !cc.custos) carregarCustos();
    // Potência dos inversores vem do cadastro de equipamentos (catálogo das distribuidoras).
    if (typeof carregarCatalogoDistribuidoras === 'function' && !(typeof _catalogoDistrib !== 'undefined' && _catalogoDistrib && _catalogoDistrib.carregado)) {
      carregarCatalogoDistribuidoras().then(() => { if (!cc) return; if (cc.sim.kitId) aplicarKit(cc.sim.kitId); pintar(); }).catch(() => {});
    }
    if (!simAnterior) escolherKitPadrao();
    pintar();
  }

  // Custos dos kits: só o admin lê (produtos_custo).
  async function carregarCustos() {
    const { data, error } = await supabaseClient.from('produtos_custo').select('produto_id, custo');
    if (error) { cc.custos = new Map(); return; }
    cc.custos = new Map((data || []).map((r) => [String(r.produto_id), num(r.custo)]));
    if (cc.sim.kitId) aplicarKit(cc.sim.kitId);
    pintar();
  }

  function kitsCatalogo() {
    return (state.data || []).filter((k) => k.ativo !== false && (k.linha || 'catalogo') === 'catalogo')
      .sort((a, b) => num(a.power) - num(b.power));
  }
  function escolherKitPadrao() {
    const k = kitsCatalogo().find((x) => num(x.modulo_qtd) === 10) || kitsCatalogo()[0];
    if (k) aplicarKit(k.id);
  }
  function aplicarKit(id) {
    const k = (state.data || []).find((x) => String(x.id) === String(id));
    cc.sim.kitId = k ? String(k.id) : '';
    if (!k) return;
    cc.sim.modulos = num(k.modulo_qtd) || cc.sim.modulos;
    cc.sim.kwp = num(k.power) || cc.sim.kwp;
    cc.sim.inversores = num(k.inversor_qtd) || 1;
    cc.sim.kwInversor = kwInversorDoKit(k) || cc.sim.kwInversor;
    const custo = cc.custos && cc.custos.get(String(k.id));
    cc.sim.kit = custo || '';
  }

  // kW de inversor do kit = potência do inversor (cadastro de equipamentos) × quantidade.
  function kwInversorDoKit(k) {
    const eq = typeof _catalogoDistrib !== 'undefined' && _catalogoDistrib ? _catalogoDistrib.equipamentos || [] : [];
    const inv = eq.find((e) => String(e.id) === String(k.inversor_id));
    const w = num(inv && inv.potencia_wp);
    return w > 0 ? Math.round(w / 1000 * (num(k.inversor_qtd) || 1) * 1000) / 1000 : 0;
  }

  // ---------------------------------------------------------------- desenhar
  function linhaHTML(k, rotulo) {
    const l = cc.linhas[k]; if (!l) return '';
    const extra = calc().ehExtra(k);
    const forma = `${l.t}:${l.b}`;
    const valor = l.t === 'brl' && l.b === 'faixa' ? ''
      : `<label class="cc-val"><span>${l.t === 'pct' ? '%' : 'R$'}</span><input type="number" min="0" step="${l.t === 'pct' ? '0.1' : '0.01'}" value="${num(l.v)}" aria-label="Valor de ${esc(rotulo)}" oninput="CentroCustoTela.valor('${k}', this.value)"></label>`;
    const nome = extra
      ? `<input class="cc-nome" type="text" maxlength="40" value="${esc(l.nome || '')}" placeholder="Nome do custo (ex.: Frete local)" aria-label="Nome do custo" oninput="CentroCustoTela.nome('${k}', this.value)">`
      : `<span class="cc-rot">${esc(rotulo)}</span>`;
    const remover = extra ? `<button type="button" class="cc-x" title="Remover este custo" aria-label="Remover este custo" onclick="CentroCustoTela.remover('${k}')"><i data-lucide="trash-2"></i></button>` : '';
    const faixas = l.t === 'brl' && l.b === 'faixa' ? `<div class="cc-faixas">${(l.faixas && l.faixas.length ? l.faixas : [{ ate: '', valor: '' }]).map((f, i) => `
        <div class="cc-faixa"><span>até</span><input type="number" min="0" step="0.01" value="${f.ate}" aria-label="Até kWp" oninput="CentroCustoTela.faixa('${k}', ${i}, 'ate', this.value)"><span>kWp →</span>
          <label class="cc-val"><span>R$</span><input type="number" min="0" step="0.01" value="${f.valor}" aria-label="Valor da faixa" oninput="CentroCustoTela.faixa('${k}', ${i}, 'valor', this.value)"></label>
          <button type="button" class="cc-x" aria-label="Remover faixa" onclick="CentroCustoTela.faixaRemover('${k}', ${i})"><i data-lucide="x"></i></button></div>`).join('')}
        <button type="button" class="cc-link" onclick="CentroCustoTela.faixaAdd('${k}')"><i data-lucide="plus"></i>Faixa</button>
        <p class="cc-hint">Acima da última faixa, vale o valor da última.</p></div>` : '';
    return `<div class="cc-linha${extra ? ' is-extra' : ''}">
        <div class="cc-l1">${nome}${remover}</div>
        <div class="cc-l2">${valor}
          <select aria-label="Forma de cálculo de ${esc(rotulo)}" onchange="CentroCustoTela.forma('${k}', this.value)">${formas().map(([v, n]) => `<option value="${v}"${v === forma ? ' selected' : ''}>${n}</option>`).join('')}</select>
        </div>${faixas}
      </div>`;
  }

  function contratoHTML() {
    const d = cc.data, c = d.contrato || {}, rede = d.projeto_rede || {};
    const projeto = !rede.cobrar ? 'Não cobra'
      : (rede.faixas || []).length ? `Tabela por kWp (${(rede.faixas || []).length} faixas)` : 'Sem tabela: configure em Rede';
    const lin = (r, v) => `<div class="cc-trava"><span>${r}</span><b>${v}</b></div>`;
    return lin('Royalties', pct(c.royalties && c.royalties.v) + ' da venda') + lin('Fundo de publicidade', pct(c.publicidade && c.publicidade.v) + ' da venda') + lin('Projeto de engenharia', projeto);
  }

  function pintar() {
    const el = host(); if (!el || !cc) return;
    const d = cc.data;
    const unidades = (state.franquiasCatalog || []).filter((f) => f.ativo !== false);
    const seletor = state.isAdmin && unidades.length
      ? `<select class="cc-unidade" aria-label="Unidade" onchange="CentroCustoTela.unidade(this.value)">${unidades.map((f) => `<option value="${f.id}"${String(f.id) === String(cc.fid) ? ' selected' : ''}>${esc(f.nome)}</option>`).join('')}</select>`
      : `<span class="cc-chip">${esc(d.franquia_nome || 'Sua unidade')}</span>`;
    const salvo = d.salvo && d.updated_at
      ? `Salvo em ${new Date(d.updated_at).toLocaleDateString('pt-BR')}${d.updated_by_nome ? ' por ' + esc(d.updated_by_nome) : ''} · vale para todas as propostas da unidade`
      : 'Ainda não salvo · usando os padrões do Financeiro';
    const kitsCusto = num(d.kits_custos);
    const modoNota = cc.modo === 'custos'
      ? (d.modo_preco === 'custos' ? `${kitsCusto} kits do catálogo com preço por custos. Kit sem custo cadastrado segue no markup.` : 'Vale depois de salvar.') + ' Promocionais mantêm o preço próprio.'
      : 'Preço da tabela, como hoje. Dá para testar o preço por custos e voltar a qualquer momento.';
    const grupo = (g) => `
      <section class="cc-card">
        <div class="cc-tt"><span><i data-lucide="${g.icone}"></i>${g.titulo}</span>
          ${g.extras ? `<button type="button" class="cc-btn2" onclick="CentroCustoTela.estimativa()" title="Instalação R$ 70/módulo e elétrica R$ 345 + R$ 118,50/kWp">Usar estimativa da Matriz</button>` : ''}</div>
        ${g.linhas.map(([k, r]) => linhaHTML(k, r)).join('')}
        ${g.extras ? extras().map((k) => linhaHTML(k, cc.linhas[k].nome || 'Custo personalizado')).join('') : ''}
        ${g.extras && temNovasBases() && extras().length < MAX_EXTRAS ? `<button type="button" class="cc-link" onclick="CentroCustoTela.adicionar()"><i data-lucide="plus"></i>Adicionar custo</button>` : ''}
      </section>`;
    const kits = kitsCatalogo();
    el.innerHTML = `<div class="cc">
      <div class="cc-top">
        <div><h2>Centro de custo</h2><p class="cc-hint">${salvo}</p></div>
        ${seletor}
      </div>
      <div class="cc-grid">
        <div>
          ${temModo() ? `<section class="cc-card">
            <div class="cc-tt"><span><i data-lucide="calculator"></i>Como a unidade calcula o preço dos kits</span></div>
            <div class="cc-modos">
              <button type="button" class="cc-modo${cc.modo === 'markup' ? ' on' : ''}" onclick="CentroCustoTela.modo('markup')"><b>Markup atual</b><span>Preço da tabela da Matriz, como hoje</span></button>
              <button type="button" class="cc-modo${cc.modo === 'custos' ? ' on' : ''}" onclick="CentroCustoTela.modo('custos')"><b>Custos + margem alvo</b><span>Custo do kit + custos abaixo + impostos + margem</span></button>
            </div>
            <p class="cc-hint">${modoNota}</p>
          </section>` : ''}
          ${GRUPOS.map(grupo).join('')}
          <section class="cc-card">
            <div class="cc-tt"><span><i data-lucide="lock"></i>Contrato com a Rede</span><span class="cc-hint">${state.isAdmin ? 'editar em Rede → Unidades' : 'definido pela Rede'}</span></div>
            ${contratoHTML()}
          </section>
          <section class="cc-card">
            <div class="cc-tt"><span><i data-lucide="target"></i>Margem</span></div>
            <div class="cc-linha"><div class="cc-l1"><span class="cc-rot">Margem alvo</span></div><div class="cc-l2"><label class="cc-val"><span>%</span><input type="number" min="0" max="99" step="0.5" value="${cc.malvo}" aria-label="Margem alvo" oninput="CentroCustoTela.margem('malvo', this.value)"></label><span class="cc-hint">da venda · é a margem do preço por custos</span></div></div>
            <div class="cc-linha"><div class="cc-l1"><span class="cc-rot">Margem mínima</span></div><div class="cc-l2"><label class="cc-val"><span>%</span><input type="number" min="0" max="99" step="0.5" value="${cc.mmin}" aria-label="Margem mínima" oninput="CentroCustoTela.margem('mmin', this.value)"></label><span class="cc-hint">da venda · abaixo disso a proposta avisa</span></div></div>
          </section>
        </div>
        <aside class="cc-card cc-sim">
          <div class="cc-tt"><span><i data-lucide="receipt"></i>Simulação</span></div>
          <select class="cc-kitsel" aria-label="Kit da simulação" onchange="CentroCustoTela.kit(this.value)">
            <option value="">Simulação livre</option>
            ${kits.map((k) => `<option value="${esc(k.id)}"${String(k.id) === cc.sim.kitId ? ' selected' : ''}>${esc(k.name)}</option>`).join('')}
          </select>
          <div class="cc-dims">
            <label>Módulos<input type="number" min="1" step="1" value="${cc.sim.modulos}" oninput="CentroCustoTela.dim('modulos', this.value)"></label>
            <label>kWp<input type="number" min="0.01" step="0.01" value="${cc.sim.kwp}" oninput="CentroCustoTela.dim('kwp', this.value)"></label>
            <label>Inversores<input type="number" min="1" step="1" value="${cc.sim.inversores}" oninput="CentroCustoTela.dim('inversores', this.value)"></label>
            <label>kW do inversor (total)<input type="number" min="0" step="0.01" value="${cc.sim.kwInversor}" oninput="CentroCustoTela.dim('kwInversor', this.value)"></label>
            <label>Custo do kit c/ frete<input type="number" min="0" step="0.01" value="${cc.sim.kit}" placeholder="${state.isAdmin ? 'sem custo cadastrado' : 'informe o custo'}" oninput="CentroCustoTela.dim('kit', this.value)"></label>
          </div>
          <div id="cc-sim-out" aria-live="polite"></div>
        </aside>
      </div>
      <div class="cc-bar"><span id="cc-sujo" class="cc-hint"></span><button type="button" class="cc-btn" id="cc-salvar" onclick="CentroCustoTela.salvar()">Salvar centro de custo</button></div>
    </div>`;
    icons();
    marcarSujo(cc.sujo);
    simular();
  }

  // ---------------------------------------------------------------- simulação
  function linhasCompletas(kwp) {
    const d = cc.data, rede = d.projeto_rede;
    const proj = calc().projeto(rede, kwp);
    const linhas = { ...cc.linhas, ...(d.contrato || {}) };
    linhas.projeto_rede = calc().linha('brl', proj || 0, 'v');
    return { linhas, projetoFora: proj == null };
  }

  function simular() {
    const out = document.getElementById('cc-sim-out'); if (!out || !cc) return;
    const s = cc.sim, kit = num(s.kit);
    const { linhas, projetoFora } = linhasCompletas(num(s.kwp));
    if (projetoFora) { out.innerHTML = '<p class="cc-aviso">Projeto fora da tabela da Rede para essa potência. Configure a faixa em Rede → Unidades.</p>'; return; }
    if (!(kit > 0)) { out.innerHTML = `<p class="cc-hint">${state.isAdmin ? 'Esse kit não tem custo cadastrado. Informe o custo do kit com frete para simular (cadastre em Produtos para entrar no preço).' : 'Informe o custo do kit com frete para simular.'}</p>`; return; }
    const base = { linhas, kit, modulos: num(s.modulos), kwp: num(s.kwp), inversores: num(s.inversores), kwInversor: num(s.kwInversor), margem: cc.malvo };
    const alvo = calc().calcular(base);
    if (alvo.erros.length) { out.innerHTML = `<p class="cc-aviso">${esc(alvo.erros.join(' '))}</p>`; return; }
    const r = calc().calcular({ ...base, venda: alvo.vendaAlvo });
    const v = r.valores;
    const pctLinhas = ['imposto', 'comissao', 'deducoes', 'royalties', 'publicidade'];
    const obra = Object.entries(v).filter(([k]) => !pctLinhas.includes(k)).reduce((t, [, x]) => t + x, 0);
    const kitSel = (state.data || []).find((k) => String(k.id) === s.kitId);
    const hoje = kitSel ? num(kitSel.preco_markup || kitSel.price) : 0;
    const dif = hoje > 0 ? (alvo.vendaAlvo / hoje - 1) * 100 : null;
    const row = (a, b, cls = '') => `<div class="cc-res${cls}"><span>${a}</span><span>${b}</span></div>`;
    out.innerHTML = row('Custo do kit c/ frete', money(kit))
      + row('Custos da obra', money(obra))
      + row('Imposto', money(v.imposto || 0))
      + row('Comissão', money((v.comissao || 0) + (v.deducoes || 0)))
      + (num(v.royalties) + num(v.publicidade) > 0 ? row('Royalties + fundo', money(num(v.royalties) + num(v.publicidade))) : '')
      + row('Margem', `${money(r.lucroLiq)} (${pct(r.margem)})`)
      + row(cc.modo === 'custos' ? 'Preço por custos' : 'Preço por custos (se ligar)', money(alvo.vendaAlvo), ' is-total')
      + (hoje > 0 ? row('Preço de hoje (markup)', money(hoje), ' is-sub') + row('Diferença', `${dif >= 0 ? '+' : ''}${dif.toFixed(1).replace('.', ',')}%`, ' is-sub') : '')
      + promocionaisHTML();
  }

  // Régua dos promocionais (admin): cada promocional tem que empatar ou ficar abaixo do
  // preço por custos do kit do catálogo com os mesmos equipamentos.
  function promocionaisHTML() {
    if (!state.isAdmin || !cc.custos || !cc.custos.size) return '';
    const cat = kitsCatalogo();
    const promos = (state.data || []).filter((k) => k.ativo !== false && k.linha === 'promocional');
    let ok = 0, total = 0; const falham = [];
    promos.forEach((p) => {
      const par = cat.find((k) => k.name === p.name && String(k.modulo_id) === String(p.modulo_id) && String(k.inversor_id) === String(p.inversor_id));
      const custo = par && cc.custos.get(String(par.id));
      if (!custo) return;
      const { linhas, projetoFora } = linhasCompletas(num(p.power));
      if (projetoFora) return;
      const a = calc().calcular({ linhas, kit: custo, modulos: num(p.modulo_qtd), kwp: num(p.power), inversores: num(p.inversor_qtd) || 1, kwInversor: kwInversorDoKit(p), margem: cc.malvo });
      if (a.vendaAlvo == null) return;
      total++;
      if (a.vendaAlvo + 0.005 >= num(p.price)) ok++; else falham.push(p.name);
    });
    if (!total) return '';
    return ok === total
      ? `<p class="cc-ok"><i data-lucide="check-circle"></i>${total === 1 ? 'O promocional fica igual ou abaixo' : `Os ${total} promocionais ficam iguais ou abaixo`} do preço por custos.</p>`
      : `<p class="cc-aviso"><i data-lucide="alert-triangle"></i>${total - ok} de ${total} promocionais ficariam acima do preço por custos: ${esc(falham.slice(0, 3).join(', '))}${falham.length > 3 ? '…' : ''}</p>`;
  }

  function marcarSujo(sujo) {
    if (cc) cc.sujo = sujo;
    const s = document.getElementById('cc-sujo'), b = document.getElementById('cc-salvar');
    if (s) s.textContent = sujo ? 'Alterações não salvas' : 'Tudo salvo';
    if (b) b.classList.toggle('is-on', !!sujo);
  }
  const mudou = () => { marcarSujo(true); simular(); icons(); };

  // ---------------------------------------------------------------- ações
  const acoes = {
    unidade(fid) { if (state.isAdmin) render(fid); },
    modo(m) { cc.modo = m === 'custos' ? 'custos' : 'markup'; marcarSujo(true); pintar(); },
    valor(k, v) { if (cc.linhas[k]) { cc.linhas[k].v = Math.max(0, parseFloat(v) || 0); mudou(); } },
    nome(k, v) { if (cc.linhas[k]) { cc.linhas[k].nome = String(v).slice(0, 40); marcarSujo(true); } },
    forma(k, valor) {
      const l = cc.linhas[k]; if (!l) return;
      const [t, b] = String(valor).split(':');
      const novo = calc().linha(t, t === l.t ? l.v : 0, b, { faixas: l.faixas || [], nome: l.nome });
      if (novo.b === 'faixa' && !novo.faixas.length) novo.faixas = [];
      cc.linhas[k] = novo; marcarSujo(true); pintar();
    },
    faixa(k, i, campo, v) {
      const l = cc.linhas[k]; if (!l) return;
      l.faixas = l.faixas && l.faixas.length ? l.faixas : [{ ate: '', valor: '' }];
      l.faixas[i] = { ...l.faixas[i], [campo]: v === '' ? '' : Math.max(0, parseFloat(v) || 0) };
      mudou();
    },
    faixaAdd(k) { const l = cc.linhas[k]; if (!l) return; l.faixas = [...(l.faixas || []), { ate: '', valor: '' }]; marcarSujo(true); pintar(); },
    faixaRemover(k, i) { const l = cc.linhas[k]; if (!l) return; l.faixas = (l.faixas || []).filter((_, j) => j !== i); marcarSujo(true); pintar(); },
    adicionar() {
      if (extras().length >= MAX_EXTRAS) return;
      const k = 'extra_' + Date.now().toString(36).slice(-8);
      cc.linhas[k] = calc().linha('brl', 0, 'v', { nome: '' });
      marcarSujo(true); pintar();
      const nomes = document.querySelectorAll('.cc-linha.is-extra .cc-nome'); if (nomes.length) nomes[nomes.length - 1].focus();
    },
    remover(k) { if (!calc().ehExtra(k)) return; delete cc.linhas[k]; marcarSujo(true); pintar(); },
    estimativa() {
      const r = calc().referenciaHelte;
      cc.linhas.instalacao = calc().linha('brl', r.instalacaoModulo, 'modulo');
      if (cc.linhas.eletrica_fixa) cc.linhas.eletrica_fixa = calc().linha('brl', r.eletricaFixa, 'v');
      cc.linhas.eletrica = calc().linha('brl', r.eletricaKwp, 'kwp');
      marcarSujo(true); pintar();
      toast('Estimativa preenchida. Confira a simulação e salve.');
    },
    margem(campo, v) { cc[campo] = Math.max(0, parseFloat(v) || 0); mudou(); },
    kit(id) { if (id) aplicarKit(id); else cc.sim.kitId = ''; pintar(); },
    dim(campo, v) { cc.sim[campo] = v === '' ? '' : Math.max(0, parseFloat(v) || 0); simular(); icons(); },
    async salvar() {
      if (!cc) return;
      const linhas = {};
      for (const [k, l] of Object.entries(cc.linhas)) {
        if (l.t === 'pct' && l.v > 100) { toast(`${calc().ehExtra(k) ? (l.nome || 'Custo personalizado') : k}: percentual acima de 100.`); return; }
        if (calc().ehExtra(k) && !String(l.nome || '').trim()) { toast('Dê um nome a cada custo personalizado.'); return; }
        if (l.t === 'brl' && l.b === 'faixa') {
          const fx = (l.faixas || []).filter((f) => num(f.ate) > 0);
          if (!fx.length) { toast('Preencha a tabela por faixa de kWp.'); return; }
          linhas[k] = { ...l, faixas: fx.map((f) => ({ ate: num(f.ate), valor: num(f.valor) })) };
        } else linhas[k] = l;
      }
      if (cc.mmin < 0 || cc.malvo < cc.mmin || cc.malvo >= 100) { toast('Margem mínima ≥ 0 e alvo ≥ mínima, abaixo de 100%.'); return; }
      const btn = document.getElementById('cc-salvar'); if (btn) btn.disabled = true;
      const { data, error } = await supabaseClient.rpc('set_centro_custo', {
        p_franquia_id: cc.fid, p_linhas: linhas, p_margem_min: cc.mmin, p_margem_alvo: cc.malvo,
        ...(temModo() ? { p_modo_preco: cc.modo } : {}),
      });
      if (btn) btn.disabled = false;
      if (error) { console.error('[centro de custo] salvar', error); toast('Erro ao salvar: ' + (error.message || 'tente novamente')); return; }
      toast(data.modo_preco === 'custos' ? `Centro de custo salvo · ${num(data.kits_custos)} kits com preço por custos` : 'Centro de custo salvo');
      // A lista de kits do orçamento passa a usar o preço novo da unidade.
      if (typeof fetchProducts === 'function' && String(cc.fid) === String(state.franquiaId || state.adminKitsFranquia)) await fetchProducts();
      await render(cc.fid);
    },
  };

  window.CentroCustoTela = { render, ...acoes };
})();
