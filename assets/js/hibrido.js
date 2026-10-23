// ==========================================
// ORÇAMENTO · KIT HÍBRIDO (inversor híbrido, com ou sem bateria)
// ==========================================
// Só no Catálogo completo, com a Belenus integrada. O orçamento abre sempre em
// On-grid (igual a antes); a chave "On-grid / Híbrido" fica no topo da coluna,
// antes de "Pelo consumo / Lista de kits", e some com essas abas quando liga.
// No híbrido o vendedor escolhe telhado, módulo e se vai bateria. Com bateria,
// diz o que fica ligado na falta de energia e por quanto tempo: a plataforma
// calcula a bateria e o inversor mínimo. A Belenus cota até 3 opções (uma por
// marca) e o Gerar é o de sempre (a proposta sai da cotação, como no on-grid).

const HB_APARELHOS = { // nome, watts, horas por dia, pico de partida (× watts), ícone
  geladeira: ['Geladeira', 150, 10, 5, 'refrigerator'],
  freezer: ['Freezer', 120, 10, 5, 'snowflake'],
  led: ['Lâmpadas LED', 10, 6, 1, 'lightbulb'],
  tv: ['TV', 100, 5, 1, 'tv'],
  net: ['Internet / roteador', 15, 24, 1, 'wifi'],
  pc: ['Computador', 150, 6, 1, 'monitor'],
  vent: ['Ventilador', 70, 8, 2, 'fan'],
  bomba: ['Bomba d’água ½ cv', 370, 1, 4, 'droplets'],
  portao: ['Portão eletrônico', 250, 0.2, 3, 'door-open'],
  micro: ['Micro-ondas', 1200, 0.3, 1, 'microwave'],
  ar: ['Ar-condicionado 9.000 inverter', 850, 8, 1.5, 'air-vent'],
  chuveiro: ['Chuveiro elétrico', 5500, 0.5, 1, 'shower-head'],
};
const HB_SUGERIDOS = [['geladeira', 1], ['led', 8], ['tv', 1], ['net', 1], ['vent', 2]];
const HB_HORAS = [2, 4, 6, 8, 12];
const HB_DESCARGA = 0.9;      // lítio: usa 90% da capacidade
const HB_EFICIENCIA = 0.95;   // perdas do inversor
const HB_OVERLOAD = 1.6;      // placas até 160% do inversor (como nas cotações da Belenus)
const HB_MARCAS = { SAJ: 'SAJ', SUNGROW: 'Sungrow', 'LUXPOWER TEK': 'Luxpower', GROWATT: 'Growatt', 'FOX ESS': 'FoxESS', SECPOWER: 'Secpower', UNIPOWER: 'Unipower' };

const _hb = {
  ativo: false, cliente: null, portaAntes: null,
  bateria: 'com', horas: 4, consumo: '', placas: null, mod: '', cargas: null,
  opcoes: null,                    // { carregando, erro, modulos, padrao } da Belenus (espelho, sem consultar a Belenus)
  cot: null, cotChave: '', cotando: false, cotErro: '', cotSeq: 0, escolha: 0,
};

// ---------- quando aparece / quando está ligado ----------
function hibridoDistribuidora() {
  const integ = typeof _integracoesAtivas !== 'undefined' && _integracoesAtivas ? _integracoesAtivas : null;
  if (!integ) return null;
  for (const [id, provedor] of integ) if (provedor === 'belenus') return { id: String(id), provedor, nome: INTEGRACOES_INFO?.belenus?.nome || 'Belenus' };
  return null;
}

function hibridoPode() {
  return typeof orcamentoAberto === 'function' && orcamentoAberto() && state.pbProposalMode === 'PROMOCIONAL'
    && typeof pbLinhaAtual === 'function' && pbLinhaAtual() === 'catalogo' && Boolean(hibridoDistribuidora());
}

function hibridoAtivo() {
  return _hb.ativo && _hb.cliente === (typeof _orcamentoClientId !== 'undefined' ? _orcamentoClientId : null) && hibridoPode();
}

function _hbNovoCliente() {
  const r = typeof pbDimResumo === 'function' ? pbDimResumo() : null;
  Object.assign(_hb, {
    cliente: _orcamentoClientId, bateria: 'com', horas: 4, placas: null, cot: null, cotChave: '', cotErro: '', escolha: 0,
    consumo: r?.media > 0 ? String(Math.round(r.media)) : '',
    cargas: HB_SUGERIDOS.map(([k, q]) => _hbAparelho(k, q)),
  });
}

function _hbAparelho(k, q = 1) {
  const a = HB_APARELHOS[k];
  return { k, nome: a[0], q, w: a[1], h: a[2], pico: a[3], icone: a[4], editW: false, editH: false };
}

function hibridoModo(modo) {
  if (typeof _orcamentoGerando !== 'undefined' && _orcamentoGerando) return;
  const ligar = modo === 'hibrido' && hibridoPode();
  if (ligar === hibridoAtivo()) return;
  if (ligar) {
    if (_hb.cliente !== _orcamentoClientId || !_hb.cargas) _hbNovoCliente();
    _hb.ativo = true;
    _hb.portaAntes = state.pbPorta;
    state.pbPorta = 'kit';             // "Pelo consumo / Lista de kits" não valem no híbrido
    if (typeof _km !== 'undefined') _km.ativo = false;
    _hbCarregarOpcoes();
    if (typeof pbEstruturaCarregarOpcoes === 'function') pbEstruturaCarregarOpcoes();
  } else {
    _hbDesligar();
  }
  if (typeof orcamentoLimparKit === 'function') orcamentoLimparKit();
  if (typeof pbDimSync === 'function') pbDimSync();
  pbFornecimentoSync();
}

function _hbDesligar() {
  if (!_hb.ativo) return;
  _hb.ativo = false;
  if (_hb.portaAntes) state.pbPorta = _hb.portaAntes;
  _hb.portaAntes = null;
}

// O próximo orçamento abre sempre em On-grid.
(function () {
  const fechar = window.closeOrcamento;
  if (typeof fechar !== 'function') return;
  window.closeOrcamento = function () {
    _hbDesligar();
    return fechar.apply(this, arguments);
  };
})();

// ---------- módulos da Belenus ----------
async function _hbCarregarOpcoes(force = false) {
  if (_hb.opcoes && !_hb.opcoes.erro && !force) return;
  _hb.opcoes = { carregando: true };
  try {
    const { data, error } = await invocarDistribuidoras({ acao: 'opcoes', provedor: 'belenus' });
    if (error) throw error;
    if (!data?.ok) throw new Error(data?.error || 'Não foi possível buscar os módulos da Belenus.');
    _hb.opcoes = {
      padrao: data.padrao,
      modulos: (data.modulos || []).map((m) => ({ id: String(m.sku), nome: `${m.fabricante} · ${m.potencia} W${m.tipo ? ' ' + String(m.tipo).toLowerCase() : ''}`, w: Number(m.potencia) })),
    };
  } catch (err) {
    console.warn('[híbrido] módulos', err);
    _hb.opcoes = { erro: err?.message || 'Não foi possível buscar os módulos da Belenus.' };
  }
  if (hibridoAtivo()) pbFornecimentoSync();
}

function _hbModulo() {
  const lista = _hb.opcoes?.modulos || [];
  if (!lista.length) return null;
  if (!lista.some((m) => m.id === _hb.mod)) _hb.mod = (lista.some((m) => m.id === _hb.opcoes.padrao) ? _hb.opcoes.padrao : lista[0].id);
  return lista.find((m) => m.id === _hb.mod);
}

// ---------- contas ----------
const _hbNum = (v, d = 1) => (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const _hbKw = (v) => (Number(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 });

function _hbTaxaMinima() {
  const lig = typeof _pbd !== 'undefined' && _pbd ? _pbd.ligacao : 'mono';
  const l = typeof PBD_LIGACOES !== 'undefined' ? PBD_LIGACOES.find((x) => x.v === lig) : null;
  return l ? l.taxa : 30;
}

// Placas que cobrem o consumo (mesma geração estimada da lista de kits).
function _hbPlacasSugeridas(mod) {
  const consumo = Number(String(_hb.consumo).replace(',', '.')) || 0;
  if (!mod || consumo <= 0) return null;
  const alvo = Math.max(0, consumo - _hbTaxaMinima());
  const porPlaca = calcularGeracaoEstimada(mod.w / 1000, 'kitsInversor', Number(state.pbActiveClient?.hsp) || undefined);
  if (!(porPlaca > 0)) return null;
  return Math.max(4, Math.min(150, Math.ceil(alvo / porPlaca)));
}

function _hbPlacas(mod) {
  return _hb.placas ?? _hbPlacasSugeridas(mod) ?? 8;
}

function hibridoCalc() {
  const mod = _hbModulo();
  const placas = _hbPlacas(mod);
  const kwp = mod ? placas * mod.w / 1000 : 0;
  const invPlacas = kwp / HB_OVERLOAD;
  if (_hb.bateria === 'sem') return { sem: true, mod, placas, kwp, bateria: 0, invMin: invPlacas, ligado: 0, pico: 0, dia: 0, falta: 0 };
  let w = 0, dia = 0, falta = 0, partida = 0;
  (_hb.cargas || []).forEach((a) => {
    const tot = a.w * a.q;
    w += tot; dia += tot * a.h; falta += tot * Math.min(a.h, _hb.horas);
    if (a.q) partida = Math.max(partida, a.w * (a.pico - 1));
  });
  const ligado = w / 1000, pico = (w + partida) / 1000;
  return {
    sem: false, mod, placas, kwp, ligado, pico, dia: dia / 1000, falta: falta / 1000,
    bateria: falta / 1000 / (HB_DESCARGA * HB_EFICIENCIA),
    invMin: Math.max(ligado * 1.2, pico / 1.5, invPlacas),
  };
}

function _hbChave(c = hibridoCalc()) {
  const tel = (typeof _pbEstrutura !== 'undefined' && _pbEstrutura.telhado) || 'ceramico';
  return JSON.stringify([_hb.mod, c.placas, tel, Math.round(c.bateria * 100) / 100, Math.round(c.invMin * 10) / 10]);
}

// ---------- cotação ----------
async function hibridoCotar() {
  if (!hibridoAtivo() || _hb.cotando) return;
  const dist = hibridoDistribuidora();
  const c = hibridoCalc();
  const tel = (typeof _pbEstrutura !== 'undefined' && _pbEstrutura.telhado) || 'ceramico';
  if (!c.mod) return;
  if (typeof pbIntegracaoTelhadoOk === 'function' && !pbIntegracaoTelhadoOk('belenus', tel)) { showToast('A Belenus não tem estrutura pra esse telhado.'); return; }
  if (!c.sem && c.bateria <= 0) { showToast('Diga o que fica ligado na falta de energia.'); return; }
  const chave = _hbChave(c);
  const seq = ++_hb.cotSeq;
  Object.assign(_hb, { cotando: true, cotErro: '', cot: null, cotChave: chave, escolha: 0 });
  if (typeof orcamentoAtualizarResumo === 'function') orcamentoAtualizarResumo();
  try {
    const { data, error } = await invocarDistribuidoras({
      acao: 'cotar', provedor: dist.provedor, placas: c.placas, modulo: _hb.mod || null, telhado: tel,
      hibrido: { bateria_kwh: c.sem ? 0 : Math.round(c.bateria * 100) / 100, inv_min_kw: Math.round(c.invMin * 100) / 100 },
    });
    if (seq !== _hb.cotSeq) return;
    if (error) throw error;
    if (!data?.ok) throw new Error(data?.error || 'Não foi possível cotar agora.');
    const kits = data.kits || [];
    if (!kits.some((k) => !k.erro)) {
      const bloq = kits.find((k) => k.tipo === 'bloqueio');
      throw new Error(bloq?.erro || kits.find((k) => k.tipo === 'instavel')?.erro || kits[0]?.erro || 'Esse kit não está disponível no momento.');
    }
    _hb.cot = kits;
  } catch (err) {
    if (seq !== _hb.cotSeq) return;
    _hb.cotErro = err?.message || 'Não foi possível cotar agora.';
  }
  _hb.cotando = false;
  if (typeof orcamentoAtualizarResumo === 'function') orcamentoAtualizarResumo();
}

function _hbOpcoes() {
  if (!_hb.cot || _hb.cotChave !== _hbChave()) return [];
  return _hb.cot.filter((k) => !k.erro);
}

function hibridoEscolher(i) {
  if (typeof _orcamentoGerando !== 'undefined' && _orcamentoGerando) return;
  _hb.escolha = Number(i) || 0;
  if (typeof orcamentoAtualizarResumo === 'function') orcamentoAtualizarResumo();
}

// Kit da vez pro orçamento (rodapé e Gerar). A proposta sai da cotação (cotacao_id).
function hibridoKit() {
  const ops = _hbOpcoes();
  const k = ops[Math.min(_hb.escolha, ops.length - 1)];
  if (!k) return null;
  const dist = hibridoDistribuidora();
  return {
    id: 'hib:' + k.cotacao_id, _cotacaoId: k.cotacao_id, _hibrido: true, ativo: true, linha: 'catalogo',
    name: k.titulo, brand: k.marca, power: Number(k.kwp), price: Number(k.preco), list_price: Number(k.preco_de),
    categoria: k.categoria || 'kitsInversor', distribuidora_id: dist?.id || null,
  };
}

// ---------- textos ----------
function _hbMarca(m) {
  const s = String(m || '').toUpperCase().trim();
  return HB_MARCAS[s] || s.charAt(0) + s.slice(1).toLowerCase();
}

function _hbTelhadoNome() {
  const tel = (typeof _pbEstrutura !== 'undefined' && _pbEstrutura.telhado) || 'ceramico';
  const t = typeof pbIntegracaoTelhados === 'function' ? pbIntegracaoTelhados('belenus').find((x) => x.telhado === tel) : null;
  return t ? t.nome : 'Cerâmico / colonial';
}

function _hbAlertaHTML(msg) {
  const txt = String(msg || '').trim();
  const pausa = txt.match(/(?:recusando as consultas|pediu pra aguardar)[\s\S]*?(\d{1,2}:\d{2})/i);
  if (pausa) return pbAlertaHTML({ icone: 'hourglass', titulo: 'Belenus pausada por alguns minutos', corpo: 'A Belenus recusou uma consulta. Cote de novo depois do horário abaixo.', hora: pausa[1] });
  if (/^Esse kit não está disponível/i.test(txt) || /sem estoque/i.test(txt)) {
    const corpo = txt.replace(/^Esse kit não está disponível no momento[:.]?\s*/i, '');
    return pbAlertaHTML({ icone: 'package-x', titulo: 'Kit indisponível na Belenus', corpo: corpo ? corpo.charAt(0).toUpperCase() + corpo.slice(1) : '' });
  }
  return pbAlertaHTML({ tipo: 'erro', titulo: 'Não foi possível cotar agora', corpo: state.isAdmin && txt ? txt : 'A Belenus não respondeu. Tente de novo em instantes.' });
}

// ---------- chave On-grid / Híbrido (topo da coluna) ----------
function hibridoRenderChave() {
  const box = document.getElementById('pb-linha');
  if (!box) return;
  let seg = document.getElementById('pb-sistema');
  const pode = hibridoPode();
  if (!pode) {
    if (_hb.ativo && _hb.cliente === _orcamentoClientId && orcamentoAberto() && state.pbProposalMode === 'PROMOCIONAL' && pbLinhaAtual() !== 'catalogo') _hbDesligar();
    seg?.classList.add('hidden');
    box.classList.remove('tem-sistema');
    return;
  }
  if (!seg) {
    seg = document.createElement('div');
    seg.id = 'pb-sistema';
    seg.className = 'pbd-sistema';
    seg.setAttribute('role', 'group');
    seg.setAttribute('aria-label', 'Tipo de sistema');
    seg.innerHTML = `<button type="button" data-sis="ongrid" onclick="hibridoModo('ongrid')"><i data-lucide="sun"></i>On-grid</button>
      <button type="button" data-sis="hibrido" onclick="hibridoModo('hibrido')"><i data-lucide="battery-charging"></i>Híbrido</button>`;
    box.insertBefore(seg, document.getElementById('pb-linha-hint'));
    if (window.lucide) lucide.createIcons();
  }
  const ativo = hibridoAtivo();
  seg.classList.remove('hidden');
  box.classList.add('tem-sistema');
  seg.querySelectorAll('[data-sis]').forEach((b) => {
    const on = (b.dataset.sis === 'hibrido') === ativo;
    b.classList.toggle('is-on', on);
    b.setAttribute('aria-pressed', String(on));
    b.disabled = typeof _orcamentoGerando !== 'undefined' && _orcamentoGerando;
  });
  const hint = document.getElementById('pb-linha-hint');
  if (hint && ativo) hint.textContent = 'Inversor híbrido cotado na Belenus, com ou sem bateria.';
}

// ---------- painel de equipamentos ----------
function _hbCampo(ic, cap, inner, cls = '') {
  return `<label class="pbd-forn-campo${cls}"><i data-lucide="${ic}" class="pbd-forn-ic"></i><span class="pbd-forn-cap">${cap}</span>${inner}</label>`;
}

// Desenha os cartões do híbrido no painel. Devolve true quando o híbrido está ligado
// (o painel do on-grid e o do modo avançado ficam escondidos).
function hibridoRenderPainel(panel) {
  let box = document.getElementById('pb-forn-hibrido');
  const ativo = hibridoAtivo();
  if (!ativo) { if (box) { box.classList.add('hidden'); box.innerHTML = ''; } return false; }
  if (!box) {
    box = document.createElement('div');
    box.id = 'pb-forn-hibrido';
    box.className = 'pbd-fornecimento-fields quatro';
    const ref = document.getElementById('pb-forn-avancado') || document.getElementById('pb-forn-simples');
    ref?.parentElement?.insertBefore(box, ref.nextSibling);
  }
  ['pb-modo', 'pb-forn-simples', 'pb-forn-avancado', 'pb-km-info', 'pb-estrutura-hint', 'pb-fornecimento-aviso'].forEach((id) => document.getElementById(id)?.classList.add('hidden'));
  box.classList.remove('hidden');
  const hint = document.getElementById('pb-fornecimento-hint');
  if (hint) hint.textContent = 'A Belenus cota inversor híbrido, placas e, se tiver, a bateria (a plataforma calcula pelas cargas e pelo tempo de autonomia).';

  const dist = hibridoDistribuidora();
  const outras = (typeof _catalogoDistrib !== 'undefined' ? _catalogoDistrib.distribuidoras : []).filter((d) => d.ativo !== false && String(d.id) !== dist.id);
  const o = _hb.opcoes;
  const mod = _hbModulo();
  const mods = !o || o.carregando ? '<option value="">Carregando…</option>'
    : o.erro ? '<option value="">Indisponível agora</option>'
    : o.modulos.map((m) => `<option value="${escapeHTML(m.id)}" ${m.id === mod?.id ? 'selected' : ''}>${escapeHTML(m.nome)}</option>`).join('');
  box.innerHTML = _hbCampo('home', '1 · Telhado do cliente', `<select class="pbd-input v2-select" data-hb="telhado" data-titulo="Telhado do cliente">${typeof pbIntegracaoTelhadoOpcoesHTML === 'function' ? pbIntegracaoTelhadoOpcoesHTML('belenus') : ''}</select>`)
    + _hbCampo('warehouse', '2 · Distribuidora', `<select class="pbd-input v2-select" data-titulo="Distribuidora do kit"><option selected>${escapeHTML(dist.nome)}</option>${outras.map((d) => `<option disabled>${escapeHTML(d.nome)} (sem híbrido por enquanto)</option>`).join('')}</select>`)
    + _hbCampo('solar-panel', '3 · Módulo / painel', `<select class="pbd-input v2-select" data-hb="mod" data-titulo="Módulo / painel" ${!o || o.carregando || o.erro ? 'disabled' : ''}>${mods}</select>`, ' hb-largo');
  box.querySelector('[data-hb="telhado"]')?.addEventListener('change', (e) => { if (e.target.value) pbEstruturaEscolherValor(e.target.value); });
  box.querySelector('[data-hb="mod"]')?.addEventListener('change', (e) => { _hb.mod = e.target.value; _hb.placas = null; _hbMudou(); });

  const aviso = document.getElementById('pb-fornecimento-aviso');
  if (aviso && o?.erro) {
    aviso.classList.remove('hidden', 'pbd-hint');
    aviso.innerHTML = pbAlertaHTML({ tipo: 'erro', titulo: 'Não foi possível buscar os módulos da Belenus', corpo: 'Feche e abra o orçamento de novo em instantes.' });
  }
  if (window.uiV2Select) window.uiV2Select.scan(panel);
  if (window.lucide) lucide.createIcons();
  return true;
}

function _hbMudou() {
  if (typeof orcamentoLimparKit === 'function') orcamentoLimparKit();
  pbFornecimentoSync();
}

// ---------- corpo: bateria, cargas, autonomia e placas (no lugar da lista de kits) ----------
function hibridoCorpoHTML() {
  const c = hibridoCalc();
  const sug = _hbPlacasSugeridas(c.mod);
  const chips = (lista, atual, attr, rot) => `<div class="hb-chips" role="group">${lista.map((v) =>
    `<button type="button" data-${attr}="${v}" class="${String(v) === String(atual) ? 'is-on' : ''}" aria-pressed="${String(v) === String(atual)}">${rot(v)}</button>`).join('')}</div>`;
  const placasHTML = `<div class="hb-grid2">
      <div><div class="hb-lbl">Consumo médio da conta</div>
        <div class="hb-campo"><input type="number" min="0" step="10" inputmode="numeric" data-hb-in="consumo" value="${escapeHTML(String(_hb.consumo))}" placeholder="Ex.: 400" aria-label="Consumo médio da conta em kWh por mês"><span>kWh/mês</span></div></div>
      <div><div class="hb-lbl">Placas${sug ? ` <small>(sugerido pelo consumo: ${sug})</small>` : ''}</div>
        <div class="km-qtd hb-placas"><button type="button" data-hb-placas="-1" aria-label="Uma placa a menos">−</button><input type="number" min="4" max="150" value="${c.placas}" data-hb-in="placas" aria-label="Quantidade de placas"><button type="button" data-hb-placas="1" aria-label="Uma placa a mais">+</button><span>${c.mod ? `${_hbKw(c.kwp)} kWp` : 'placas'}</span></div></div>
    </div>`;
  const bateria = `<div class="km-box">
      <div class="km-head"><span class="km-t"><i data-lucide="battery-charging"></i> 4 · Bateria</span></div>
      ${chips(['com', 'sem'], _hb.bateria, 'hb-bat', (v) => (v === 'com' ? 'Com bateria' : 'Sem bateria agora'))}
      ${_hb.bateria === 'sem' ? '<p class="hb-ref">O kit sai só com o inversor híbrido e as placas, pronto pra receber bateria depois. Sem bateria, não segura a casa na falta de energia.</p>' : ''}
    </div>`;
  if (c.sem) {
    return `<div class="hb-corpo">${bateria}
      <div class="km-box"><div class="km-head"><span class="km-t"><i data-lucide="solar-panel"></i> 5 · Placas</span></div>${placasHTML}</div></div>`;
  }
  const linhas = (_hb.cargas || []).map((a, i) => `<div class="hb-row">
      ${a.k ? `<span class="hb-nm"><i data-lucide="${a.icone}"></i><span>${escapeHTML(a.nome)}</span></span>`
        : `<input class="hb-nm-in" data-hb-i="${i}" data-f="nome" value="${escapeHTML(a.nome)}" placeholder="Nome do aparelho" aria-label="Nome do aparelho">`}
      <input type="number" min="0" max="999" step="1" inputmode="numeric" data-hb-i="${i}" data-f="q" value="${a.q}" aria-label="Quantidade de ${escapeHTML(a.nome || 'aparelho')}">
      <input type="number" min="0" step="10" inputmode="numeric" data-hb-i="${i}" data-f="w" value="${a.w}" class="${a.k && !a.editW ? 'hb-sug' : ''}" aria-label="Watts de ${escapeHTML(a.nome || 'aparelho')}">
      <input type="number" min="0" max="24" step="0.5" inputmode="decimal" data-hb-i="${i}" data-f="h" value="${a.h}" class="${a.k && !a.editH ? 'hb-sug' : ''}" aria-label="Horas por dia de ${escapeHTML(a.nome || 'aparelho')}">
      <span class="hb-kd">${_hbNum(a.w * a.q * a.h / 1000, 2)}</span>
      <button type="button" class="km-rem hb-rem" data-hb-rem="${i}" title="Remover" aria-label="Remover ${escapeHTML(a.nome || 'aparelho')}"><i data-lucide="x"></i></button>
    </div>`).join('');
  const chuveiro = (_hb.cargas || []).some((a) => a.k === 'chuveiro' && a.q > 0);
  return `<div class="hb-corpo">${bateria}
    <div class="km-box">
      <div class="km-head"><span class="km-t"><i data-lucide="plug-zap"></i> 5 · O que fica ligado quando falta energia</span><span class="km-s">${_hbNum(c.dia)} kWh por dia</span></div>
      <p class="hb-ref"><i data-lucide="info"></i><span>A lista já vem sugerida. Os números em <i>cinza e itálico</i> são médias de referência: confira a etiqueta do aparelho e o uso do cliente.</span></p>
      <div class="hb-row hb-hd" aria-hidden="true"><span class="hb-hd-nm">Aparelho</span><span>Qtd</span><span>Watts</span><span>h/dia</span><span class="hb-kd">kWh/dia</span><span></span></div>
      ${linhas || '<p class="hb-vazio">Nenhum aparelho na lista. Adicione abaixo.</p>'}
      <div class="hb-add">
        <select class="pbd-input v2-select" data-hb="add" data-titulo="Adicionar aparelho"><option value="">Adicionar aparelho da lista…</option>${Object.entries(HB_APARELHOS).map(([k, a]) => `<option value="${k}">${escapeHTML(a[0])} (≈ ${a[1].toLocaleString('pt-BR')} W)</option>`).join('')}</select>
        <button type="button" class="hb-btn" data-hb-outro><i data-lucide="pencil"></i> Outro aparelho</button>
      </div>
      ${chuveiro ? '<div class="orc-aviso">Chuveiro sozinho puxa 5,5 kW e esvazia a bateria rápido. O normal é deixar fora do backup.</div>' : ''}
    </div>
    <div class="km-box">
      <div class="km-head"><span class="km-t"><i data-lucide="timer"></i> 6 · Quanto tempo precisa durar na bateria</span><span class="km-s">${_hbNum(c.falta)} kWh na falta</span></div>
      ${chips(HB_HORAS, _hb.horas, 'hb-h', (v) => `${v} h`)}
      ${placasHTML}
    </div>
  </div>`;
}

function hibridoBindCorpo(root) {
  root.querySelectorAll('[data-hb-bat]').forEach((b) => b.addEventListener('click', () => { if (_hb.bateria !== b.dataset.hbBat) { _hb.bateria = b.dataset.hbBat; _hbMudou(); } }));
  root.querySelectorAll('[data-hb-h]').forEach((b) => b.addEventListener('click', () => { _hb.horas = Number(b.dataset.hbH); _hbMudou(); }));
  root.querySelectorAll('[data-hb-rem]').forEach((b) => b.addEventListener('click', () => { _hb.cargas.splice(Number(b.dataset.hbRem), 1); _hbMudou(); }));
  root.querySelectorAll('input[data-hb-i]').forEach((inp) => inp.addEventListener('change', () => {
    const a = _hb.cargas[Number(inp.dataset.hbI)];
    if (!a) return;
    const f = inp.dataset.f;
    if (f === 'nome') { a.nome = inp.value.trim(); _hbMudou(); return; }
    const v = Math.max(0, Number(String(inp.value).replace(',', '.')) || 0);
    if (f === 'q') a.q = Math.min(999, Math.round(v));
    if (f === 'w') { a.w = Math.min(50000, v); a.editW = true; }
    if (f === 'h') { a.h = Math.min(24, v); a.editH = true; }
    _hbMudou();
  }));
  root.querySelector('select[data-hb="add"]')?.addEventListener('change', (e) => {
    const k = e.target.value;
    if (!k || !HB_APARELHOS[k]) return;
    _hb.cargas.push(_hbAparelho(k, 1));
    _hbMudou();
  });
  root.querySelector('[data-hb-outro]')?.addEventListener('click', () => {
    _hb.cargas.push({ k: '', nome: '', q: 1, w: 100, h: 1, pico: 1, icone: 'plug', editW: true, editH: true });
    _hbMudou();
    setTimeout(() => { const ins = document.querySelectorAll('#pb-products-container .hb-nm-in'); ins[ins.length - 1]?.focus(); }, 0);
  });
  root.querySelector('input[data-hb-in="consumo"]')?.addEventListener('change', (e) => {
    const v = Math.max(0, Math.round(Number(String(e.target.value).replace(',', '.')) || 0));
    _hb.consumo = v ? String(v) : ''; _hb.placas = null; _hbMudou();
  });
  root.querySelector('input[data-hb-in="placas"]')?.addEventListener('change', (e) => {
    _hb.placas = Math.max(4, Math.min(150, Math.round(Number(e.target.value) || 4))); _hbMudou();
  });
  root.querySelectorAll('[data-hb-placas]').forEach((b) => b.addEventListener('click', () => {
    _hb.placas = Math.max(4, Math.min(150, _hbPlacas(_hbModulo()) + Number(b.dataset.hbPlacas))); _hbMudou();
  }));
}

function hibridoRenderCorpo(container) {
  container.innerHTML = hibridoCorpoHTML();
  hibridoBindCorpo(container);
  if (window.uiV2Select) window.uiV2Select.scan(container);
  if (window.lucide) lucide.createIcons();
}

// ---------- coluna da direita ----------
function hibridoLadoHTML(kit) {
  const c = hibridoCalc();
  const dist = hibridoDistribuidora();
  const tel = (typeof _pbEstrutura !== 'undefined' && _pbEstrutura.telhado) || 'ceramico';
  const telOk = typeof pbIntegracaoTelhadoOk !== 'function' || pbIntegracaoTelhadoOk('belenus', tel);
  const semCargas = !c.sem && c.bateria <= 0;
  const valida = _hb.cotChave === _hbChave(c);
  const ops = _hbOpcoes();
  const erros = valida && _hb.cot ? _hb.cot.filter((k) => k.erro) : [];
  let html = `<div class="orc-mets">
      <div class="orc-met"><small>Bateria necessária</small><b>${c.sem ? 'Sem bateria' : `${_hbNum(c.bateria)} kWh`}</b></div>
      <div class="orc-met"><small>Inversor mínimo</small><b>${_hbKw(Math.ceil(c.invMin * 2) / 2)} kW</b></div>
    </div>
    <p class="orc-met-s">${c.sem ? `${c.placas} placas · ${_hbKw(c.kwp)} kWp · bateria fica pra depois`
      : `${_hbNum(c.ligado)} kW ligados juntos · pico ${_hbNum(c.pico)} kW · ${_hb.horas} h de autonomia · ${c.placas} placas`}</p>`;
  if (!c.sem && c.bateria > 20) html += '<div class="orc-aviso">Banco de bateria grande. Vale rever a lista de cargas com o cliente antes de cotar.</div>';
  if (!telOk) html += pbAlertaHTML({ icone: 'home', titulo: 'A Belenus não tem estrutura pra esse telhado', corpo: 'Escolha outro telhado no cartão "Telhado do cliente".' });
  if (semCargas) html += '<div class="orc-aviso">Diga o que fica ligado na falta de energia pra calcular a bateria.</div>';

  if (valida && ops.length) {
    html += `<div class="orc-sec">Opções da ${escapeHTML(dist.nome)}<button type="button" class="orc-link" onclick="hibridoCotar()" ${_hb.cotando ? 'disabled' : ''}>cotar de novo</button></div>`;
    html += ops.map((k, i) => {
      const h = k.hibrido || {};
      const b = h.bateria;
      const det = [b ? `${b.qtd} × bateria ${_hbMarca(b.marca)} ${_hbNum(b.kwh, 2)} kWh = ${_hbNum(b.kwh_total, 2)} kWh` : 'sem bateria · aceita bateria depois',
        `${k.placas} placas ${c.mod ? c.mod.w + ' W' : ''}`.trim(), _hbTelhadoNome().toLowerCase()].join(' · ');
      const on = i === Math.min(_hb.escolha, ops.length - 1);
      const temDe = Number(k.preco_de) > Number(k.preco);
      return `<button type="button" class="hb-op${on ? ' is-on' : ''}" onclick="hibridoEscolher(${i})" aria-pressed="${on}">
        <span class="hb-op-n">${escapeHTML(`${_hbMarca(h.marca)} ${_hbKw(h.kw)} kW híbrido · ${h.tensao || '220 V'}`)}${i === 0 ? '<i class="hb-tag">Menor preço</i>' : ''}</span>
        <span class="hb-op-d">${escapeHTML(det)}</span>
        ${state.isAdmin && Number(k.custo) > 0 ? `<span class="hb-op-d">Só admin: custo ${escapeHTML(dist.nome)} ${formatCurrency(k.custo)}</span>` : ''}
        <span class="hb-op-p">${temDe ? `<s>${formatCurrency(k.preco_de)}</s>` : ''}<b>${formatCurrency(k.preco)}</b></span>
      </button>`;
    }).join('');
    if (erros.length) html += `<p class="hb-op-fora">Não saíram agora: ${erros.map((e) => escapeHTML(e.marca ? `${_hbMarca(e.marca)} ${_hbKw(e.kw)} kW híbrido` : (e.opcao || ''))).join(', ')}.</p>`;
  } else {
    if (_hb.cotErro && valida) html += _hbAlertaHTML(_hb.cotErro);
    html += `<button type="button" class="btn btn-secondary km-cotar hb-cotar" onclick="hibridoCotar()" ${_hb.cotando || !telOk || semCargas || !c.mod ? 'disabled' : ''}>${_hb.cotando
      ? `<i data-lucide="loader-2" class="animate-spin"></i> Cotando na ${escapeHTML(dist.nome)}… pode levar até 1 minuto`
      : `<i data-lucide="refresh-cw"></i> Cotar kits híbridos na ${escapeHTML(dist.nome)}`}</button>`;
  }
  const gerando = typeof _orcamentoGerando !== 'undefined' && _orcamentoGerando;
  html += `<button type="button" id="orcamento-lado-gerar" class="btn btn-primary orc-gerar" onclick="orcamentoGerar(event)" ${kit && !gerando ? '' : 'disabled'}>
    ${gerando ? '<i data-lucide="loader-2" class="animate-spin"></i> Gerando...' : `<i data-lucide="file-text"></i> Gerar proposta${kit ? ' · ' + formatCurrency(kit.price) : ''}`}</button>`;
  return html;
}
