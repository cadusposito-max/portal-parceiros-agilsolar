// ==========================================
// NOVA PROPOSTA: DIMENSIONAR SISTEMA
// ==========================================
// Porta de entrada do modo PROMOCIONAL: "Dimensionar sistema" (consumo do
// cliente → kit recomendado) ou "Escolher kit" (a lista de sempre).
// O botão GERAR daqui chama o mesmo copyProposalLinkById da lista: a proposta
// criada é idêntica à de hoje. Nada é gravado do consumo (por enquanto).
//
// Dimensionamento: consumo a compensar = média − taxa mínima da ligação
// (30/50/100 kWh, sempre cobrada) — só informativo nos números do resultado.
// Kits sugeridos (do tipo escolhido: inversor ou micro, e dentro dos filtros
// de equipamento/distribuidora), comparando a geração estimada com a MÉDIA de
// consumo (mesma conta da lista, com o HSP do cliente): entram todos os kits
// que geram de 95% a 130% da média; "Recomendado" = o mais barato deles que
// gera pelo menos a média. Os outros vêm listados do mais barato pro mais caro.

const PBD_MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const PBD_MESES_NOME = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const PBD_MESES_NASA = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const PBD_DIAS = [31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
// Mesmos fatores do geracao-chart.js (fallback quando a cidade não tem HSP mensal).
const PBD_FATORES_SAZONAIS = [1.15, 1.1, 1.05, 0.95, 0.85, 0.8, 0.8, 0.85, 0.95, 1.05, 1.1, 1.15];
const PBD_LIGACOES = [
  { v: 'mono', label: 'Monofásico', taxa: 30 },
  { v: 'bi',   label: 'Bifásico',   taxa: 50 },
  { v: 'tri',  label: 'Trifásico',  taxa: 100 },
];
// Mesmas categorias das abas da lista (state.pbCategory): trocar aqui troca lá.
const PBD_TIPOS = [
  { v: 'kitsInversor', label: 'Inversor' },
  { v: 'kitsMicro',    label: 'Microinversor' },
];
// Faixa de geração (em relação à média) dos kits listados no resultado.
const PBD_FAIXA_MIN = 0.95;
const PBD_FAIXA_MAX = 1.30;
const PBD_LISTA_VISIVEIS = 3;  // o resto fica atrás do "Ver mais"
const PBD_PORTA_KEY = 'pb_porta';

let _pbd = null;              // estado do dimensionamento do cliente em atendimento
const _pbdHspCache = {};      // ibge -> { anual, mensal } | null

function _pbdNovoEstado(client) {
  return {
    clienteId: client ? client.id : null,
    modo: 'mes',              // 'mes' | 'media'
    meses: Array(12).fill(''),
    media: '',
    ligacao: 'mono',
    hsp: null,                // { anual, mensal[12] } da cidade do cliente
    verMais: false,           // lista de kits aberta além dos primeiros
  };
}

function _pbdLerPorta() {
  try { return localStorage.getItem(PBD_PORTA_KEY) === 'dim' ? 'dim' : 'kit'; } catch (e) { return 'kit'; }
}

function _pbdGravarPorta(v) {
  try { localStorage.setItem(PBD_PORTA_KEY, v); } catch (e) { /* sem storage: só não lembra */ }
}

const _pbdNum = (v) => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const _pbdInt = (v) => Math.round(v).toLocaleString('pt-BR');
const _pbdKwp = (v) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ---------- montagem (uma vez; o painel é movido, não recriado) ----------

function pbDimMount() {
  const panel = document.getElementById('pb-dim-panel');
  if (!panel || panel.dataset.bound) return;
  panel.dataset.bound = '1';

  panel.innerHTML = `
    <div class="pbd-sec">Consumo do cliente</div>
    <div class="pbd-chips" data-pbd-grupo="modo">
      <button type="button" class="pbd-chip" data-pbd-modo="mes">Mês a mês (da conta)</button>
      <button type="button" class="pbd-chip" data-pbd-modo="media">Só a média em kWh</button>
    </div>
    <div id="pbd-box-mes" style="margin-top:10px">
      <p class="pbd-hint">Copie do gráfico de barras da conta de luz (histórico de 12 meses). Pode deixar mês vazio: a média usa só os preenchidos.</p>
      <div class="pbd-meses">
        ${PBD_MESES.map((m, i) => `<label class="pbd-mes"><span>${m}</span><input class="pbd-input" type="number" inputmode="numeric" min="0" step="1" placeholder="kWh" data-pbd-mes="${i}"></label>`).join('')}
      </div>
    </div>
    <div id="pbd-box-media" class="hidden" style="margin-top:10px">
      <label class="pbd-mes"><span>Média mensal (kWh)</span><input id="pbd-media" class="pbd-input pbd-input-um" type="number" inputmode="numeric" min="0" step="1" placeholder="Ex.: 350"></label>
    </div>

    <div class="pbd-sec">Ligação</div>
    <div class="pbd-chips">
      ${PBD_LIGACOES.map((l) => `<button type="button" class="pbd-chip" data-pbd-ligacao="${l.v}">${l.label}</button>`).join('')}
    </div>

    <div class="pbd-sec">Tipo de sistema</div>
    <div class="pbd-chips">
      ${PBD_TIPOS.map((t) => `<button type="button" class="pbd-chip" data-pbd-tipo="${t.v}">${t.label}</button>`).join('')}
    </div>

    <div id="pbd-fornecimento-slot"></div>
    <div class="pbd-sec">Resultado</div>
    <div id="pbd-resultado"></div>
  `;

  panel.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || !_pbd) return;
    if (b.dataset.pbdModo)    { _pbd.modo = b.dataset.pbdModo === 'media' ? 'media' : 'mes'; pbDimRender(); return; }
    if (b.dataset.pbdLigacao) { _pbd.ligacao = b.dataset.pbdLigacao; pbDimRender(); return; }
    if (b.dataset.pbdTipo)    { pbDimSetTipo(b.dataset.pbdTipo); return; }
    if (b.dataset.pbdVerMais) { _pbd.verMais = true; _pbdRenderResultado(); return; }
    if (b.dataset.pbdVerTodos) { pbDimVerTodos(Number(b.dataset.pbdVerTodos)); }
  });
  panel.addEventListener('input', (e) => {
    if (!_pbd) return;
    const t = e.target;
    if (t.dataset.pbdMes != null) _pbd.meses[Number(t.dataset.pbdMes)] = t.value;
    else if (t.id === 'pbd-media') _pbd.media = t.value;
    else return;
    _pbdRenderResultado();
  });

  const porta = document.getElementById('pb-porta');
  if (porta && !porta.dataset.bound) {
    porta.dataset.bound = '1';
    porta.addEventListener('click', (e) => {
      const b = e.target.closest('[data-pb-porta]');
      if (b) pbSetPorta(b.dataset.pbPorta);
    });
  }
}

// ---------- ciclo de vida (chamado pelo proposta-builder) ----------

// Cliente novo na ficha: zera o dimensionamento e busca o HSP mensal da cidade.
function pbDimSetup(client) {
  pbDimMount();
  if (!_pbd || !client || _pbd.clienteId !== client.id) {
    _pbd = _pbdNovoEstado(client);
    _pbdCarregarHsp(client);
  }
  if (!state.pbPorta) state.pbPorta = _pbdLerPorta();
  pbDimSync();
}

function pbSetPorta(v) {
  state.pbPorta = v === 'dim' ? 'dim' : 'kit';
  _pbdGravarPorta(state.pbPorta);
  pbDimSync();
  if (state.pbPorta === 'kit') renderModalProducts();
}

// Mostra/esconde porta, painel e a lista de kits conforme modo + porta.
function pbDimSync() {
  const porta = document.getElementById('pb-porta');
  const panel = document.getElementById('pb-dim-panel');
  if (!porta || !panel) return;

  const promo = state.pbProposalMode === PB_PROPOSAL_MODES.PROMOCIONAL;
  const dim = promo && state.pbPorta === 'dim';

  porta.classList.toggle('hidden', !promo);
  porta.querySelectorAll('[data-pb-porta]').forEach((b) => b.classList.toggle('is-on', b.dataset.pbPorta === (state.pbPorta || 'kit')));
  panel.classList.toggle('hidden', !dim);
  if (typeof pbFornecimentoMount === 'function') pbFornecimentoMount();

  if (promo) {
    const toolbar = document.getElementById('pb-promocional-toolbar');
    if (toolbar) toolbar.classList.toggle('hidden', dim);
    if (dim) {
      document.getElementById('pb-products-container')?.classList.add('hidden');
      const empty = document.getElementById('pb-empty');
      if (empty) { empty.classList.add('hidden'); empty.classList.remove('flex'); }
      pbDimRender();
    }
  }
}

async function _pbdCarregarHsp(client) {
  const ibge = Number(client?.cidade_ibge);
  if (!ibge) return;
  if (!(ibge in _pbdHspCache)) {
    _pbdHspCache[ibge] = null;
    try {
      const { data, error } = await supabaseClient
        .from('cidades_hsp')
        .select('hsp_anual, hsp_mensal')
        .eq('ibge_code', ibge)
        .maybeSingle();
      if (error) throw error;
      const serie = data?.hsp_mensal;
      const mensal = serie ? PBD_MESES_NASA.map((m) => Number(serie[m])) : null;
      const anual = Number(data?.hsp_anual) || Number(serie?.ANN) || 0;
      if (mensal && anual > 0 && mensal.every((v) => Number.isFinite(v) && v > 0)) {
        _pbdHspCache[ibge] = { anual, mensal };
      }
    } catch (err) {
      console.warn('[pb-dimensionar] HSP mensal indisponível; usando curva típica.', err);
    }
  }
  if (_pbd && _pbd.clienteId === client.id) {
    _pbd.hsp = _pbdHspCache[ibge];
    if (state.pbPorta === 'dim') _pbdRenderResultado();
  }
}

// ---------- cálculo ----------

function _pbdConsumo() {
  if (_pbd.modo === 'media') return { media: Math.max(0, _pbdNum(_pbd.media)), meses: null, preenchidos: 0 };
  const meses = _pbd.meses.map((v) => (String(v).trim() === '' ? null : Math.max(0, _pbdNum(v))));
  const validos = meses.filter((v) => v != null && v > 0);
  const media = validos.length ? validos.reduce((a, b) => a + b, 0) / validos.length : 0;
  return { media, meses, preenchidos: validos.length };
}

function _pbdHspCliente() {
  const h = Number(state.pbActiveClient?.hsp);
  return h > 0 ? h : undefined; // undefined → calcularGeracaoEstimada usa o HSP da franquia
}

function _pbdGeracao(kit) {
  return calcularGeracaoEstimada(Number(kit.power) || 0, kit.categoria, _pbdHspCliente()) || 0;
}

// Kits da categoria perto da média ({ k: kit, g: geração }). Recomendado = o
// mais barato da faixa que gera pelo menos a média; sem nenhum assim na faixa,
// o mais barato que cobre (acima dela); se nenhum kit cobre, o que gera mais.
// menorQueCobre mostra a economia quando o recomendado não é o menor kit que cobre.
function _pbdRecomendar(categoria, media) {
  const kits = (state.data || [])
    .filter((k) => k.categoria === categoria && k.ativo !== false && Number(k.price) > 0
      && (typeof pbKitCompativel !== 'function' || pbKitCompativel(k)))
    .map((k) => ({ k, g: _pbdGeracao(k) }));
  const porPreco = (a, b) => (Number(a.k.price) - Number(b.k.price)) || (b.g - a.g);
  const faixa = kits.filter((x) => x.g >= media * PBD_FAIXA_MIN && x.g <= media * PBD_FAIXA_MAX).sort(porPreco);
  const cobre = kits.filter((x) => x.g >= media);
  const menorQueCobre = cobre.slice().sort((a, b) => (a.g - b.g) || porPreco(a, b))[0] || null;
  const recomendado = faixa.find((x) => x.g >= media)
    || cobre.slice().sort(porPreco)[0]
    || kits.slice().sort((a, b) => (b.g - a.g) || porPreco(a, b))[0]
    || null;
  return { recomendado, outros: faixa.filter((x) => x !== recomendado), menorQueCobre };
}

function pbDimSetTipo(categoria) {
  if (!PBD_TIPOS.some((t) => t.v === categoria) || state.pbCategory === categoria) return;
  if (typeof _orcamentoGerando !== 'undefined' && _orcamentoGerando) return;
  state.pbCategory = categoria;
  if (_pbd) _pbd.verMais = false;
  if (typeof updatePBTabsUI === 'function') updatePBTabsUI();
  if (typeof pbFornecimentoRender === 'function') pbFornecimentoRender(); // opções do filtro dependem do tipo
  if (typeof orcamentoLimparKit === 'function') orcamentoLimparKit();
  pbDimRender();
}

// Distribui a geração média pelos 12 meses (mesma regra do geracao-chart.js).
function _pbdGeracaoMensal(media) {
  const hsp = _pbd.hsp;
  const fatores = hsp ? hsp.mensal.map((v) => v / hsp.anual) : PBD_FATORES_SAZONAIS.slice();
  const pesos = fatores.map((f, i) => f * PBD_DIAS[i] / 30);
  const soma = pesos.reduce((a, b) => a + b, 0) || 12;
  return pesos.map((p) => media * p * 12 / soma);
}

// ---------- render ----------

function pbDimRender() {
  if (!_pbd) return;
  const panel = document.getElementById('pb-dim-panel');
  if (!panel) return;

  panel.querySelectorAll('[data-pbd-modo]').forEach((b) => b.classList.toggle('is-on', b.dataset.pbdModo === _pbd.modo));
  panel.querySelectorAll('[data-pbd-ligacao]').forEach((b) => b.classList.toggle('is-on', b.dataset.pbdLigacao === _pbd.ligacao));
  panel.querySelectorAll('[data-pbd-tipo]').forEach((b) => b.classList.toggle('is-on', b.dataset.pbdTipo === state.pbCategory));
  document.getElementById('pbd-box-mes')?.classList.toggle('hidden', _pbd.modo !== 'mes');
  document.getElementById('pbd-box-media')?.classList.toggle('hidden', _pbd.modo !== 'media');

  // Inputs refletem o estado do cliente atual (o painel é o mesmo DOM para todos).
  panel.querySelectorAll('[data-pbd-mes]').forEach((inp) => {
    const v = _pbd.meses[Number(inp.dataset.pbdMes)];
    if (inp.value !== String(v)) inp.value = v;
  });
  const mediaEl = document.getElementById('pbd-media');
  if (mediaEl && mediaEl.value !== String(_pbd.media)) mediaEl.value = _pbd.media;

  _pbdRenderResultado();
}

function _pbdRenderResultado() {
  const host = document.getElementById('pbd-resultado');
  if (!host || !_pbd) return;

  const c = _pbdConsumo();
  if (c.media <= 0) {
    host.innerHTML = `<div class="pbd-vazio">${_pbd.modo === 'mes' ? 'Preencha pelo menos um mês' : 'Informe a média'} pra ver o kit recomendado.</div>`;
    return;
  }

  const lig = PBD_LIGACOES.find((l) => l.v === _pbd.ligacao) || PBD_LIGACOES[0];
  const alvo = Math.max(0, c.media - lig.taxa);
  const hsp = _pbdHspCliente() || (state.franquiaHsp || 5.4);
  const kwpNecessario = alvo / (hsp * 30 * 0.76);

  let maiorMes = null;
  if (c.meses) {
    c.meses.forEach((v, i) => { if (v != null && (maiorMes == null || v > c.meses[maiorMes])) maiorMes = i; });
  }

  const mets = `
    <div class="pbd-mets">
      <div class="pbd-met"><div class="pbd-met-l">Média${c.meses ? ` (${c.preenchidos} ${c.preenchidos === 1 ? 'mês' : 'meses'})` : ''}</div><div class="pbd-met-v">${_pbdInt(c.media)} kWh</div></div>
      ${maiorMes != null ? `<div class="pbd-met"><div class="pbd-met-l">Maior mês</div><div class="pbd-met-v">${_pbdInt(c.meses[maiorMes])} kWh</div><div class="pbd-met-s">${PBD_MESES[maiorMes]}</div></div>` : ''}
      <div class="pbd-met"><div class="pbd-met-l">A compensar</div><div class="pbd-met-v">${_pbdInt(alvo)} kWh</div><div class="pbd-met-s">média − ${lig.taxa} kWh da taxa mínima</div></div>
      <div class="pbd-met"><div class="pbd-met-l">Sistema necessário</div><div class="pbd-met-v">${alvo > 0 ? _pbdKwp(kwpNecessario) + ' kWp' : '—'}</div><div class="pbd-met-s">HSP ${String(hsp).replace('.', ',')}</div></div>
    </div>`;

  if (alvo <= 0) {
    host.innerHTML = mets + `<div class="pbd-aviso" style="margin-top:10px">O consumo fica abaixo da taxa mínima da ligação: solar não reduz a conta desse cliente.</div>`;
    return;
  }

  // Distribuidora com integração: cota no servidor com as placas que cobrem o consumo (módulo 620 W).
  if (typeof pbIntegracaoAtual === 'function' && pbIntegracaoAtual()) {
    host.innerHTML = mets + pbIntegracaoPainelHTML(Math.min(150, Math.max(4, Math.ceil(kwpNecessario * 1000 / 620))));
    if (window.uiV2Select) window.uiV2Select.scan(host);
    if (typeof orcamentoAtualizarResumo === 'function') orcamentoAtualizarResumo();
    if (typeof lucide !== 'undefined') lucide.createIcons();
    return;
  }

  const tipo = state.pbCategory === 'kitsMicro' ? 'kitsMicro' : 'kitsInversor';
  const tipoNome = tipo === 'kitsMicro' ? 'com microinversor' : 'com inversor';
  const { recomendado, outros, menorQueCobre } = _pbdRecomendar(tipo, c.media);
  // Marca/módulo escolhido sem kit pra esse consumo, mas outras marcas têm: avisa pra trocar.
  const naFaixa = (k) => { const g = _pbdGeracao(k); return g >= c.media * PBD_FAIXA_MIN && g <= c.media * PBD_FAIXA_MAX; };
  const motivo = (!recomendado || !naFaixa(recomendado.k)) && typeof pbMotivoSemKit === 'function' ? pbMotivoSemKit(tipo, naFaixa) : '';

  let kitsHtml;
  if (recomendado) {
    const cobre = recomendado.g >= c.media;
    const economia = cobre && menorQueCobre && menorQueCobre !== recomendado
      ? Number(menorQueCobre.k.price) - Number(recomendado.k.price) : 0;
    const nota = economia > 0
      ? `${formatCurrency(economia)} mais barato que o kit de ${_pbdKwp(Number(menorQueCobre.k.power))} kWp (o menor que cobre a média)` : '';
    const tag = cobre ? 'Recomendado · mais barato que cobre a média' : 'Mais próximo · abaixo da média';
    kitsHtml = (motivo ? `<div class="pbd-aviso" style="margin:12px 0 4px">${escapeHTML(motivo)}</div>` : '')
      + `<div class="pbd-sec">Kit recomendado</div><div class="pbd-kits">${_pbdKitCard(recomendado.k, c.media, tag, true, nota)}</div>`;
    if (!cobre) {
      kitsHtml += `<p class="pbd-hint" style="margin-top:8px">Nenhum kit ${tipoNome} da tabela gera a média de consumo.</p>`;
    }

    const de = _pbdInt(c.media * PBD_FAIXA_MIN);
    const ate = _pbdInt(c.media * PBD_FAIXA_MAX);
    if (outros.length) {
      const visiveis = _pbd.verMais ? outros : outros.slice(0, PBD_LISTA_VISIVEIS);
      const escondidos = outros.length - visiveis.length;
      kitsHtml += `
        <div class="pbd-sec">Outros kits perto desse consumo · ${outros.length}</div>
        <p class="pbd-hint">Geram de ${de} a ${ate} kWh/mês (95% a 130% da média) · do mais barato pro mais caro</p>
        <div class="pbd-lista">${visiveis.map((x) => _pbdKitLinha(x, c.media)).join('')}</div>
        ${escondidos > 0 ? `<button type="button" class="pbd-mais" data-pbd-ver-mais="1">Ver mais ${escondidos} ${escondidos === 1 ? 'kit' : 'kits'}</button>` : ''}`;
    } else {
      kitsHtml += `<p class="pbd-hint" style="margin-top:8px">Nenhum outro kit ${tipoNome} gera de ${de} a ${ate} kWh/mês.</p>`;
    }
    kitsHtml += `<button type="button" class="pbd-link" data-pbd-ver-todos="${Math.round(c.media)}">Ver todos os kits perto dessa geração →</button>`;
  } else {
    kitsHtml = `<div class="pbd-aviso" style="margin-top:12px">${escapeHTML(motivo || `Nenhum kit ${tipoNome} disponível com esta seleção. Confira os equipamentos e a distribuidora escolhidos.`)}</div>`;
  }

  host.innerHTML = mets + kitsHtml;
  if (typeof orcamentoAtualizarResumo === 'function') orcamentoAtualizarResumo();
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function _pbdDistribuidora(kit) {
  return typeof pbKitDistribuidoraNome === 'function' ? pbKitDistribuidoraNome(kit) : '';
}

function _pbdKitCard(kit, media, tag, top, nota = '') {
  const g = _pbdGeracao(kit);
  const cobre = Math.round(g / media * 100);
  const temDe = Number(kit.list_price) > Number(kit.price);
  const id = escapeHTML(String(kit.id));
  const dist = _pbdDistribuidora(kit);
  return `
    <div data-orcamento-kit="${id}" class="pbd-kit${top ? ' is-top' : ''}">
      <span class="pbd-kit-tag">${tag}</span>
      <div class="pbd-kit-n">${escapeHTML(kit.name)}</div>
      <div class="pbd-kit-d">${escapeHTML(String(kit.power))} kWp · ~${_pbdInt(g)} kWh/mês · ${cobre}% da média de consumo</div>
      ${dist ? `<div class="pbd-kit-d">Distribuidora: ${escapeHTML(dist)}</div>` : ''}
      ${nota ? `<div class="pbd-kit-nota">${escapeHTML(nota)}</div>` : ''}
      <div class="pbd-kit-f">
        <div>
          ${temDe ? `<div class="pbd-kit-de">De: ${formatCurrency(kit.list_price)}</div>` : ''}
          <div class="pbd-kit-p">${formatCurrency(kit.price)}</div>
        </div>
        <button type="button" data-kit-id="${id}" onclick="copyProposalLinkById(this.dataset.kitId, event)" class="btn btn-primary" aria-label="Gerar proposta para ${escapeHTML(kit.name)}">
          <i data-lucide="file-text"></i> GERAR PROPOSTA
        </button>
      </div>
    </div>`;
}

// Linha compacta da lista "Outros kits" (mesmo data-orcamento-kit/data-kit-id
// do cartão: a tela do orçamento seleciona e marca do mesmo jeito).
function _pbdKitLinha(x, media) {
  const kit = x.k;
  const id = escapeHTML(String(kit.id));
  const dist = _pbdDistribuidora(kit);
  return `
    <div data-orcamento-kit="${id}" class="pbd-row">
      <div class="pbd-row-tx">
        <div class="pbd-row-n">${escapeHTML(kit.name)}${x.g < media ? '<span class="pbd-row-tag">abaixo da média</span>' : ''}</div>
        <div class="pbd-row-d">${escapeHTML(String(kit.power))} kWp · ~${_pbdInt(x.g)} kWh/mês · ${Math.round(x.g / media * 100)}% da média${dist ? ` · ${escapeHTML(dist)}` : ''}</div>
      </div>
      <div class="pbd-row-p">${formatCurrency(kit.price)}</div>
      <button type="button" data-kit-id="${id}" onclick="copyProposalLinkById(this.dataset.kitId, event)" class="btn btn-secondary btn-sm" aria-label="Selecionar kit"><i data-lucide="check"></i> Selecionar kit</button>
    </div>`;
}

// Barras = consumo; linha = geração do kit recomendado. Cada mês tem uma
// faixa invisível por cima (.pbd-hit) que mostra a caixinha do mês no hover/toque.
function _pbdChartSVG(consumo, geracao) {
  // Em tela estreita o viewBox encolhe para o texto não ficar miúdo.
  const largura = document.getElementById('pbd-resultado')?.clientWidth || 640;
  const W = largura < 520 ? 380 : 640, H = largura < 520 ? 190 : 200, L = 36, B = 24, T = 10;
  const max = Math.max(1, ...consumo.map((v) => v || 0), ...geracao) * 1.12;
  const cw = (W - L) / 12;
  const y = (v) => H - B - (v / max) * (H - B - T);
  const cx = (i) => L + i * cw + cw / 2;
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Consumo mensal do cliente e geração estimada do kit" data-w="${W}" data-h="${H}" data-l="${L}" data-b="${B}" data-t="${T}" data-max="${max}">`;
  consumo.forEach((_, i) => { s += `<rect class="pbd-band" data-i="${i}" x="${L + i * cw}" y="${T}" width="${cw}" height="${H - B - T}" rx="6"/>`; });
  [0, 0.5, 1].forEach((t) => {
    const v = (max / 1.12) * t;
    s += `<line x1="${L}" x2="${W}" y1="${y(v)}" y2="${y(v)}" stroke="var(--v2-line)" stroke-width="1"/>`;
    s += `<text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="var(--v2-ink-2)">${_pbdInt(v)}</text>`;
  });
  consumo.forEach((v, i) => {
    if (v) s += `<rect class="pbd-bar" data-i="${i}" x="${L + i * cw + cw * 0.2}" y="${y(v)}" width="${cw * 0.6}" height="${Math.max(0, H - B - y(v))}" rx="4"/>`;
    s += `<text x="${cx(i)}" y="${H - 6}" text-anchor="middle" font-size="11" fill="var(--v2-ink-2)">${PBD_MESES[i]}</text>`;
  });
  s += `<polyline fill="none" stroke="var(--v2-blue)" stroke-width="2.5" stroke-linejoin="round" points="${geracao.map((g, i) => `${cx(i)},${y(g)}`).join(' ')}"/>`;
  geracao.forEach((g, i) => { s += `<circle class="pbd-dot" data-i="${i}" cx="${cx(i)}" cy="${y(g)}" r="3.5"/>`; });
  consumo.forEach((_, i) => { s += `<rect class="pbd-hit" data-i="${i}" x="${L + i * cw}" y="0" width="${cw}" height="${H}"/>`; });
  return s + '</svg>';
}

// Caixinha do mês: consumo e geração daquele mês (mouse no computador, toque no celular).
function _pbdBindChart(host, consumo, geracao, media) {
  const box = host.querySelector('.pbd-chart');
  const svg = box?.querySelector('svg');
  const tip = box?.querySelector('.pbd-tip');
  if (!svg || !tip) return;
  const W = Number(svg.dataset.w), H = Number(svg.dataset.h), L = Number(svg.dataset.l);
  const B = Number(svg.dataset.b), T = Number(svg.dataset.t), max = Number(svg.dataset.max);
  const cw = (W - L) / 12;
  const y = (v) => H - B - (v / max) * (H - B - T);
  let atual = -1;

  const mostrar = (i) => {
    if (i === atual) return;
    atual = i;
    svg.querySelectorAll('.pbd-band, .pbd-bar, .pbd-dot').forEach((el) => el.classList.toggle('is-on', Number(el.dataset.i) === i));
    const c = consumo[i], g = geracao[i];
    tip.innerHTML = `
      <b class="pbd-tip-m">${PBD_MESES_NOME[i]}</b>
      <span><i class="pbd-tip-c"></i>Consumo${media ? ' (média)' : ''} <b>${c ? _pbdInt(c) + ' kWh' : '—'}</b></span>
      <span><i class="pbd-tip-g"></i>Geração <b>~${_pbdInt(g)} kWh</b></span>`;
    tip.hidden = false;
    const r = svg.getBoundingClientRect(), br = box.getBoundingClientRect();
    const escala = r.width / W;
    const x = (L + i * cw + cw / 2) * escala + (r.left - br.left);
    const topo = Math.min(y(c || 0), y(g)) * escala + (r.top - br.top);
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    tip.style.left = Math.min(Math.max(x - tw / 2, 0), br.width - tw) + 'px';
    tip.style.top = Math.max(topo - th - 10, 0) + 'px';
  };
  const esconder = () => {
    atual = -1;
    tip.hidden = true;
    svg.querySelectorAll('.is-on').forEach((el) => el.classList.remove('is-on'));
  };
  const alvo = (e) => e.target.closest && e.target.closest('.pbd-hit');
  svg.addEventListener('pointermove', (e) => { const h = alvo(e); if (h) mostrar(Number(h.dataset.i)); });
  svg.addEventListener('pointerdown', (e) => { const h = alvo(e); if (h) mostrar(Number(h.dataset.i)); });
  svg.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') esconder(); });
}

// "Ver todos": volta para a lista (no tipo escolhido) buscando pela média de
// consumo — a busca mostra os kits que geram até 50 kWh a mais ou a menos.
function pbDimVerTodos(geracao) {
  state.pbSearch = String(geracao || '');
  const search = document.getElementById('pb-search');
  if (search) search.value = state.pbSearch;
  updatePBTabsUI();
  pbSetPorta('kit');
}
