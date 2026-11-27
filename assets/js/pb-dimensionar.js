// ==========================================
// NOVA PROPOSTA: DIMENSIONAR SISTEMA
// ==========================================
// Consumo do cliente, um lugar só (17/11): fica no topo do orçamento, opcional,
// e vale pra lista, cotação na distribuidora, híbrido e kit montado. Aqui ficam
// os campos e a conta (pbDimResumo); o resultado aparece na coluna da direita
// (orcamento-tela.js) e nos % da lista. A média vai gravada na proposta.
//
// Regra única de dimensionamento (decisão de 17/11): o sistema gera a MÉDIA de
// consumo. A taxa mínima da ligação (30/50/100 kWh) só serve de aviso quando a
// média nem passa dela. Kits "perto do consumo" = geram de 95% a 130% da média;
// "Recomendado" = o mais barato deles que gera pelo menos a média.

const PBD_MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const PBD_LIGACOES = [
  { v: 'mono', label: 'Monofásico', taxa: 30 },
  { v: 'bi',   label: 'Bifásico',   taxa: 50 },
  { v: 'tri',  label: 'Trifásico',  taxa: 100 },
];
// Faixa de geração (em relação à média) dos kits listados no resultado.
const PBD_FAIXA_MIN = 0.95;
const PBD_FAIXA_MAX = 1.30;

let _pbd = null;              // estado do dimensionamento do cliente em atendimento

function _pbdNovoEstado(client) {
  return {
    clienteId: client ? client.id : null,
    modo: 'media',            // 'media' | 'mes' (só a média é o caso comum)
    meses: Array(12).fill(''),
    media: '',
    ligacao: 'mono',
  };
}

// Eficiência da conta de geração (a mesma do calcularGeracaoEstimada).
function _pbdEficiencia(categoria) {
  return categoria === 'kitsMicro' ? 0.81 : 0.76;
}

const _pbdNum = (v) => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const _pbdInt = (v) => Math.round(v).toLocaleString('pt-BR');
const _pbdKwp = (v) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ---------- montagem (uma vez; o painel é movido, não recriado) ----------

function pbDimMount() {
  const panel = document.getElementById('pb-dim-panel');
  if (!panel || panel.dataset.bound) return;
  panel.dataset.bound = '1';

  // Uma linha: média (ou mês a mês) · de onde vem · ligação. Os 12 meses abrem embaixo.
  panel.innerHTML = `
    <div class="pbd-sec">Consumo do cliente</div>
    <div class="pbd-cons">
      <div id="pbd-box-media" class="pbd-cons-g">
        <label class="pbd-cons-cap" for="pbd-media">Média mensal</label>
        <span class="pbd-cons-un"><input id="pbd-media" class="pbd-input" type="number" inputmode="numeric" min="0" step="1" placeholder="Ex.: 350"><small>kWh</small></span>
      </div>
      <div class="pbd-cons-g">
        <span class="pbd-cons-cap">Da conta de luz</span>
        <div class="pbd-chips" data-pbd-grupo="modo">
          <button type="button" class="pbd-chip" data-pbd-modo="media">Só a média</button>
          <button type="button" class="pbd-chip" data-pbd-modo="mes">Mês a mês</button>
        </div>
      </div>
      <div class="pbd-cons-g">
        <span class="pbd-cons-cap">Ligação</span>
        <div class="pbd-chips">
          ${PBD_LIGACOES.map((l) => `<button type="button" class="pbd-chip" data-pbd-ligacao="${l.v}">${l.label}</button>`).join('')}
        </div>
      </div>
    </div>
    <div id="pbd-box-mes" class="hidden" style="margin-top:10px">
      <p class="pbd-hint">Copie do gráfico de barras da conta de luz (histórico de 12 meses). Pode deixar mês vazio: a média usa só os preenchidos.</p>
      <div class="pbd-meses">
        ${PBD_MESES.map((m, i) => `<label class="pbd-mes"><span>${m}</span><input class="pbd-input" type="number" inputmode="numeric" min="0" step="1" placeholder="kWh" data-pbd-mes="${i}"></label>`).join('')}
      </div>
    </div>
    <p id="pbd-regra" class="pbd-hint"></p>
  `;

  panel.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || !_pbd) return;
    if (b.dataset.pbdModo)    { _pbd.modo = b.dataset.pbdModo === 'media' ? 'media' : 'mes'; _pbdConsumoMudou(); pbDimRender(); _pbdRenderResultado(); return; }
    if (b.dataset.pbdLigacao) { _pbd.ligacao = b.dataset.pbdLigacao; _pbdConsumoMudou(); pbDimRender(); _pbdRenderResultado(); return; }
  });
  panel.addEventListener('input', (e) => {
    if (!_pbd) return;
    const t = e.target;
    if (t.dataset.pbdMes != null) _pbd.meses[Number(t.dataset.pbdMes)] = t.value;
    else if (t.id === 'pbd-media') _pbd.media = t.value;
    else return;
    _pbdConsumoMudou();
    _pbdRenderResultadoLogo();
  });
}

function _pbdConsumoMudou() {
  state.pbPlacas = null; // placas voltam a seguir o consumo
  if (typeof _orcamentoKitId !== 'undefined' && _orcamentoKitId && !String(_orcamentoKitId).startsWith('cot:')) _orcamentoKitId = null;
  if (typeof _pbListaTodos !== 'undefined') _pbListaTodos = false;
}

// ---------- ciclo de vida (chamado pelo proposta-builder) ----------

// Cliente novo no orçamento: zera o consumo e as placas.
// (O HSP mensal da cidade só servia ao gráfico do antigo "Pelo consumo"; a geração usa client.hsp.)
function pbDimSetup(client) {
  pbDimMount();
  if (!_pbd || !client || _pbd.clienteId !== client.id) {
    _pbd = _pbdNovoEstado(client);
    state.pbPlacas = null;
  }
  state.pbPorta = 'kit'; // a lista está sempre aberta (a porta "Pelo consumo × Lista" saiu em 17/11)
  pbDimSync();
}

// Painel do consumo: aparece em todo orçamento de kit (promocionais, campanha, catálogo,
// híbrido e kit montado). Os itens livres (personalizada) têm a própria tela.
function pbDimSync() {
  const panel = document.getElementById('pb-dim-panel');
  if (!panel) return;
  const promo = state.pbProposalMode === PB_PROPOSAL_MODES.PROMOCIONAL;
  panel.classList.toggle('hidden', !promo);
  if (typeof pbFornecimentoMount === 'function') pbFornecimentoMount();
  if (promo) pbDimRender();
  if (typeof kitMontadoSyncTela === 'function') kitMontadoSyncTela();
}

// ---------- cálculo ----------

function _pbdConsumo() {
  if (_pbd.modo === 'media') return { media: Math.max(0, _pbdNum(_pbd.media)), meses: null, preenchidos: 0 };
  const meses = _pbd.meses.map((v) => (String(v).trim() === '' ? null : Math.max(0, _pbdNum(v))));
  const validos = meses.filter((v) => v != null && v > 0);
  const media = validos.length ? validos.reduce((a, b) => a + b, 0) / validos.length : 0;
  return { media, meses, preenchidos: validos.length };
}

// Consumo médio (kWh/mês) do cliente em atendimento, para gravar na proposta
// (o PDF mostra quanto do consumo o sistema cobre). null = não informado.
function pbConsumoMedioProposta() {
  if (!_pbd || !state.pbActiveClient || _pbd.clienteId !== state.pbActiveClient.id) return null;
  const media = _pbdConsumo().media;
  return media > 0 ? Math.round(media) : null;
}

function _pbdHspCliente() {
  const h = Number(state.pbActiveClient?.hsp);
  return h > 0 ? h : undefined; // undefined → calcularGeracaoEstimada usa o HSP da franquia
}

function _pbdGeracao(kit) {
  return calcularGeracaoEstimada(Number(kit.power) || 0, kit.categoria, _pbdHspCliente()) || 0;
}

// Kits da categoria perto da média ({ k: kit, g: geração }). Recomendado = o
// mais barato da faixa que gera pelo menos a média; senão o mais perto dela na
// faixa; sem kit na faixa, o mais barato que cobre; se nenhum cobre, o que gera
// mais. Kits com inversor trifásico só entram em ligação trifásica.
// menorQueCobre mostra a economia quando o recomendado não é o menor kit que cobre.
function _pbdServeLigacao(kit) {
  return typeof pbKitServeLigacao !== 'function' || pbKitServeLigacao(kit, _pbd.ligacao);
}

function _pbdRecomendar(categoria, media) {
  const kits = (typeof pbKitsOrcamento === 'function' ? pbKitsOrcamento() : (state.data || []))
    .filter((k) => k.categoria === categoria && k.ativo !== false && Number(k.price) > 0
      && (typeof pbKitCompativel !== 'function' || pbKitCompativel(k)) && _pbdServeLigacao(k))
    .map((k) => ({ k, g: _pbdGeracao(k) }));
  const porPreco = (a, b) => (Number(a.k.price) - Number(b.k.price)) || (b.g - a.g);
  const faixa = kits.filter((x) => x.g >= media * PBD_FAIXA_MIN && x.g <= media * PBD_FAIXA_MAX).sort(porPreco);
  const cobre = kits.filter((x) => x.g >= media);
  const menorQueCobre = cobre.slice().sort((a, b) => (a.g - b.g) || porPreco(a, b))[0] || null;
  const recomendado = faixa.find((x) => x.g >= media)
    || faixa.slice().sort((a, b) => (b.g - a.g) || porPreco(a, b))[0]
    || cobre.slice().sort(porPreco)[0]
    || kits.slice().sort((a, b) => (b.g - a.g) || porPreco(a, b))[0]
    || null;
  return { recomendado, outros: faixa.filter((x) => x !== recomendado), menorQueCobre };
}

// ---------- render ----------

function pbDimRender() {
  if (!_pbd) return;
  const panel = document.getElementById('pb-dim-panel');
  if (!panel) return;

  panel.querySelectorAll('[data-pbd-modo]').forEach((b) => b.classList.toggle('is-on', b.dataset.pbdModo === _pbd.modo));
  panel.querySelectorAll('[data-pbd-ligacao]').forEach((b) => b.classList.toggle('is-on', b.dataset.pbdLigacao === _pbd.ligacao));
  document.getElementById('pbd-box-mes')?.classList.toggle('hidden', _pbd.modo !== 'mes');
  document.getElementById('pbd-box-media')?.classList.toggle('hidden', _pbd.modo !== 'media');

  // Inputs refletem o estado do cliente atual (o painel é o mesmo DOM para todos).
  panel.querySelectorAll('[data-pbd-mes]').forEach((inp) => {
    const v = _pbd.meses[Number(inp.dataset.pbdMes)];
    if (inp.value !== String(v)) inp.value = v;
  });
  const mediaEl = document.getElementById('pbd-media');
  if (mediaEl && mediaEl.value !== String(_pbd.media)) mediaEl.value = _pbd.media;
  _pbdRegraTexto();
}

// Uma linha embaixo do consumo dizendo o que a plataforma faz com ele.
function _pbdRegraTexto() {
  const el = document.getElementById('pbd-regra');
  if (!el || !_pbd) return;
  const media = _pbdConsumo().media;
  el.textContent = media > 0
    ? `O sistema é dimensionado pra gerar a média de ${_pbdInt(media)} kWh/mês.`
    : 'Opcional. Sem consumo, a lista mostra todos os kits; com consumo, aparece o recomendado e os kits perto dele.';
}

// Conta do dimensionamento (sem DOM): a coluna da direita, a lista de kits e
// a cotação usam o mesmo resultado. null = consumo não informado.
function pbDimResumo() {
  if (!_pbd || state.pbProposalMode !== PB_PROPOSAL_MODES.PROMOCIONAL) return null;
  const c = _pbdConsumo();
  if (c.media <= 0) return null;

  const lig = PBD_LIGACOES.find((l) => l.v === _pbd.ligacao) || PBD_LIGACOES[0];
  const tipo = state.pbCategory === 'kitsMicro' ? 'kitsMicro' : 'kitsInversor';
  const tipoNome = tipo === 'kitsMicro' ? 'com microinversor' : 'com inversor';
  // Regra única: o sistema gera a média (alvo = média). A taxa mínima só vira aviso.
  const alvo = c.media;
  const hsp = _pbdHspCliente() || (state.franquiaHsp || 5.4);
  const r = {
    media: c.media, preenchidos: c.preenchidos, porMes: Boolean(c.meses),
    taxa: lig.taxa, alvo, hsp, kwpNecessario: alvo / (hsp * 30 * _pbdEficiencia(tipo)),
    recomendado: null, cobre: false, nota: '', motivo: '', integrada: false,
  };
  if (c.media <= lig.taxa) {
    r.motivo = 'O consumo fica abaixo da taxa mínima da ligação: solar não reduz a conta desse cliente.';
    return r;
  }
  // Distribuidora com integração: cota no servidor com as placas que geram a média.
  if (typeof pbIntegracaoAtual === 'function' && pbIntegracaoAtual()) {
    r.integrada = true;
    r.placas = pbPlacasPeloConsumo(typeof pbIntegracaoModuloW === 'function' ? pbIntegracaoModuloW() : 620, tipo);
    return r;
  }

  // Ainda buscando os kits da aba: não recomenda com a lista pela metade.
  if (typeof pbBuscandoKits === 'function' && pbBuscandoKits()) {
    r.buscando = true;
    r.motivo = 'Buscando os kits…';
    return r;
  }
  if (typeof pbSemPromocionais === 'function' && pbSemPromocionais()) {
    r.motivo = state.isParceiro ? PB_AVISO_PROMOCIONAIS : `${PB_AVISO_PROMOCIONAIS} Enquanto isso, use o Catálogo completo.`;
    return r;
  }

  let { recomendado, menorQueCobre } = _pbdRecomendar(tipo, c.media);
  // Marca/módulo escolhido sem kit pra esse consumo (e ligação), mas outras marcas têm:
  // não empurra um kit fora da faixa, só avisa pra trocar.
  const naFaixa = (k) => { const g = _pbdGeracao(k); return g >= c.media * PBD_FAIXA_MIN && g <= c.media * PBD_FAIXA_MAX && _pbdServeLigacao(k); };
  let motivo = (!recomendado || !naFaixa(recomendado.k)) && typeof pbMotivoSemKit === 'function' ? pbMotivoSemKit(tipo, naFaixa) : '';
  if (motivo) recomendado = null;
  // Só um inversor trifásico atende esse consumo: avisa pra conferir a ligação do cliente.
  if (!motivo && (!recomendado || !naFaixa(recomendado.k)) && _pbd.ligacao !== 'tri' && typeof pbKitServeLigacao === 'function'
    && (typeof pbKitsOrcamento === 'function' ? pbKitsOrcamento() : (state.data || [])).some((k) => k.categoria === tipo && k.ativo !== false && Number(k.price) > 0
      && (typeof pbKitCompativel !== 'function' || pbKitCompativel(k)) && !_pbdServeLigacao(k)
      && _pbdGeracao(k) >= c.media * PBD_FAIXA_MIN && _pbdGeracao(k) <= c.media * PBD_FAIXA_MAX)) {
    motivo = 'Para esse consumo só tem kit com inversor trifásico. Confira a ligação do cliente.';
  }
  // Promocionais vão até 21 módulos: consumo maior é no catálogo completo.
  if (!motivo && typeof pbLinhaAtual === 'function' && pbLinhaAtual() !== 'catalogo'
    && (!recomendado || recomendado.g < c.media * PBD_FAIXA_MIN)) {
    const camp = window.Campanhas ? Campanhas.daLinha(pbLinhaAtual()) : null;
    const faixa = typeof pbPromocionaisFaixa === 'function' ? pbPromocionaisFaixa(tipo) : null;
    motivo = camp
      ? `Os kits da campanha ${camp.nome} não cobrem esse consumo. Use os Promocionais ou o Catálogo completo.`
      : `Os kits promocionais ${tipoNome} vão até ${faixa ? faixa.max : 20} módulos e não cobrem esse consumo. Use o Catálogo completo.`;
  }
  if (!recomendado && !motivo) motivo = `Nenhum kit ${tipoNome} disponível com esta seleção. Confira os equipamentos e a distribuidora escolhidos.`;
  r.motivo = motivo;
  if (recomendado) {
    r.recomendado = recomendado.k;
    r.cobre = recomendado.g >= c.media;
    const economia = r.cobre && menorQueCobre && menorQueCobre !== recomendado
      ? Number(menorQueCobre.k.price) - Number(recomendado.k.price) : 0;
    if (economia > 0) r.nota = `${formatCurrency(economia)} mais barato que o kit de ${_pbdKwp(Number(menorQueCobre.k.power))} kWp (o menor que cobre a média)`;
    else if (!r.cobre) r.nota = `Nenhum kit ${tipoNome} da tabela gera a média de consumo.`;
  }
  return r;
}

// Geração do kit (kWh/mês, com o HSP do cliente) e quanto ela cobre da média (%; null sem consumo).
function pbDimGeracao(kit) {
  return _pbdGeracao(kit);
}
function pbDimCobertura(kit, r = pbDimResumo()) {
  return r && r.media > 0 ? Math.round(_pbdGeracao(kit) / r.media * 100) : null;
}
function pbDimNaFaixa(kit, r = pbDimResumo()) {
  if (!r || !(r.media > 0)) return false;
  const g = _pbdGeracao(kit);
  return g >= r.media * PBD_FAIXA_MIN && g <= r.media * PBD_FAIXA_MAX;
}

// Média de consumo informada pro cliente da vez (kWh/mês); 0 = não informada.
function pbConsumoMedia() {
  if (!_pbd || !state.pbActiveClient || _pbd.clienteId !== state.pbActiveClient.id) return 0;
  return _pbdConsumo().media;
}

// Teto de placas da cotação, do híbrido e do kit montado (a trava de 150 saiu em 26/11).
const PB_PLACAS_MAX = 1000;

// Placas que geram a média com o módulo de `w` watts (mesma conta da lista). null sem consumo.
// Uma conta só pra cotação na distribuidora, híbrido e kit montado.
function pbPlacasPeloConsumo(w, categoria = 'kitsInversor') {
  const media = pbConsumoMedia();
  if (!(media > 0) || !(Number(w) > 0)) return null;
  const porPlaca = calcularGeracaoEstimada(Number(w) / 1000, categoria, _pbdHspCliente());
  if (!(porPlaca > 0)) return null;
  return Math.max(4, Math.min(PB_PLACAS_MAX, Math.ceil(media / porPlaca)));
}

// ---------- quantidade de placas: um controle só (17/11) ----------
// Cotação na distribuidora, híbrido e kit montado usam o mesmo número: o sugerido pelo
// consumo, até o vendedor mudar à mão (state.pbPlacas). Mudou o consumo ou o cliente,
// volta a seguir a sugestão.
function pbPlacasValor(w, categoria, padrao = 10) {
  const manual = Number(state.pbPlacas);
  if (manual > 0) return manual;
  return pbPlacasPeloConsumo(w, categoria) ?? padrao;
}

function pbPlacasControleHTML(w, categoria, opts = {}) {
  const min = opts.min || 4;
  const padrao = opts.padrao ?? 10;
  const n = pbPlacasValor(w, categoria, padrao);
  const sug = pbPlacasPeloConsumo(w, categoria);
  const manual = Number(state.pbPlacas) > 0;
  const kwp = Number(w) > 0 ? (n * Number(w) / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + ' kWp' : '';
  const voltar = manual && sug && sug !== n;
  const qtd = `<div class="km-qtd"><button type="button" data-pb-placas="-1" aria-label="Uma placa a menos">−</button><input type="number" min="${min}" max="${PB_PLACAS_MAX}" value="${n}" data-pb-placas-in aria-label="Quantidade de placas"><button type="button" data-pb-placas="1" aria-label="Uma placa a mais">+</button><span>placas${kwp ? ' · ' + kwp : ''}</span>`;
  // Compacto (cartão do kit montado): sem a linha de baixo; volta à sugestão por um botão pequeno.
  if (opts.compacto) {
    return `<div class="pb-placas" data-pb-placas-min="${min}">${qtd}${voltar ? `<button type="button" class="orc-link" data-pb-placas-sug title="Voltar às ${sug} placas sugeridas pelo consumo">↺ ${sug}</button>` : ''}</div></div>`;
  }
  const dica = sug
    ? (voltar
      ? `Sugerido pelo consumo: ${sug} · <button type="button" class="orc-link" data-pb-placas-sug>voltar à sugestão</button>`
      : `Sugerido pelo consumo (${_pbdInt(pbConsumoMedia())} kWh/mês)`)
    : 'Informe o consumo no topo pra sugerir';
  return `<div class="pb-placas" data-pb-placas-min="${min}">
      ${qtd}</div>
      <p class="pbd-hint pb-placas-dica">${dica}</p>
    </div>`;
}

// Texto curto pra legenda do cartão: "sugerido 6" / "à mão".
function pbPlacasLegenda(w, categoria) {
  const sug = pbPlacasPeloConsumo(w, categoria);
  if (Number(state.pbPlacas) > 0) return sug && sug !== Number(state.pbPlacas) ? 'à mão' : (sug ? 'sugerido pelo consumo' : '');
  return sug ? 'sugerido pelo consumo' : '';
}

// Placas mudaram: o kit/cotação da vez valia pra outra quantidade.
function pbPlacasMudou() {
  if (typeof pbIntegracaoAtual === 'function' && pbIntegracaoAtual() && typeof pbIntegracaoInvalidar === 'function') { pbIntegracaoInvalidar(); return; }
  if (typeof orcamentoLimparKit === 'function') orcamentoLimparKit();
  if (typeof pbFornecimentoSync === 'function') pbFornecimentoSync();
}

{
  const minDe = (el) => Number(el.closest('[data-pb-placas-min]')?.dataset.pbPlacasMin) || 4;
  document.addEventListener('click', (e) => {
    const sug = e.target.closest('[data-pb-placas-sug]');
    if (sug) { state.pbPlacas = null; pbPlacasMudou(); return; }
    const b = e.target.closest('[data-pb-placas]');
    if (!b || (typeof _orcamentoGerando !== 'undefined' && _orcamentoGerando)) return;
    const inp = b.closest('.pb-placas')?.querySelector('[data-pb-placas-in]');
    const atual = Math.round(Number(inp?.value) || 0);
    state.pbPlacas = Math.max(minDe(b), Math.min(PB_PLACAS_MAX, atual + Number(b.dataset.pbPlacas)));
    pbPlacasMudou();
  });
  document.addEventListener('change', (e) => {
    const inp = e.target.closest('[data-pb-placas-in]');
    if (!inp) return;
    state.pbPlacas = Math.max(minDe(inp), Math.min(PB_PLACAS_MAX, Math.round(Number(inp.value) || minDe(inp))));
    pbPlacasMudou();
  });
}

// Consumo mudou: refaz a lista (% e kits perto do consumo) e a coluna da direita.
function _pbdRenderResultado() {
  if (!_pbd) return;
  _pbdRegraTexto();
  if (typeof renderModalProducts === 'function') renderModalProducts();
  else if (typeof orcamentoAtualizarResumo === 'function') orcamentoAtualizarResumo();
}
// Digitando o consumo: espera parar um instante pra não redesenhar a lista a cada tecla.
let _pbdTimer = null;
function _pbdRenderResultadoLogo() {
  _pbdRegraTexto();
  clearTimeout(_pbdTimer);
  _pbdTimer = setTimeout(_pbdRenderResultado, 180);
}
