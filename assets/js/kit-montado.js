// ==========================================
// ORÇAMENTO · MODO AVANÇADO (kit montado pelo vendedor)
// ==========================================
// Só no Catálogo completo, pra admin, gestor e franqueado. O vendedor escolhe a
// distribuidora, o módulo, a quantidade EXATA de placas, a fase do inversor, o
// telhado e quantos inversores quiser (vários modelos, qualquer quantidade).
// A plataforma não decide nada: reparte as placas entre os inversores, mostra
// overload e faixa de cada um e calcula o preço.
//  - Distribuidora de cálculo (Helte): preço no servidor (RPC kit_montado_cotar).
//  - Distribuidora integrada (Belenus): o preço vem da cotação ("Cotar este kit").
// Na proposta o kit vira cotação (cotacao_id): preço travado, custo no DRE.

const _km = {
  ativo: false, dist: '', mod: '', placas: 10, fase: 'mono', estrutura: '', linhas: null,
  opcoes: {},                       // distribuidora_id -> { carregando, erro, provedor, modulos, inversores }
  calc: null, calcChave: '', calcSeq: 0, calcCarregando: false,
  cot: null, cotChave: '', cotando: false, cotErro: '', cotSeq: 0,
};
let _kmCalcTimer = null;

function kitMontadoPermitido() {
  return Boolean(state.isAdmin || state.isGestor || state.isFranqueado);
}

// Só na tela de orçamento, no Catálogo completo.
function kitMontadoAtivo() {
  return kitMontadoPermitido() && _km.ativo && state.pbProposalMode === 'PROMOCIONAL'
    && typeof pbLinhaAtual === 'function' && pbLinhaAtual() === 'catalogo'
    && typeof orcamentoAberto === 'function' && orcamentoAberto();
}

function kitMontadoModo(modo) {
  if (typeof _orcamentoGerando !== 'undefined' && _orcamentoGerando) return;
  const ativo = modo === 'avancado' && kitMontadoPermitido();
  if (ativo === _km.ativo) return;
  _km.ativo = ativo;
  if (ativo) {
    // Avançado é sempre "lista": sem "Pelo consumo". Começa na distribuidora do modo simples, se ela monta kit.
    state.pbPorta = 'kit';
    if (kitMontadoDistribuidoras().some((d) => d.id === _pbFornecimento.distribuidora)) _km.dist = _pbFornecimento.distribuidora;
    if (typeof carregarIntegracoesAtivas === 'function') carregarIntegracoesAtivas().then(() => { if (kitMontadoAtivo()) pbFornecimentoSync(); });
  }
  if (typeof orcamentoLimparKit === 'function') orcamentoLimparKit();
  if (typeof pbDimSync === 'function') pbDimSync();
  pbFornecimentoSync();
}

// Porta (Pelo consumo × Lista) e busca/tipo da lista não valem no avançado.
function kitMontadoSyncTela() {
  if (state.pbProposalMode !== 'PROMOCIONAL') return;
  const av = kitMontadoAtivo();
  document.getElementById('pb-porta')?.classList.toggle('hidden', av);
  document.getElementById('pb-promocional-toolbar')?.classList.toggle('hidden', av || state.pbPorta === 'dim');
}

// ---------- distribuidoras, módulos e inversores ----------
// As de cálculo (Helte) primeiro; as integradas (Belenus) cotam na hora.
function kitMontadoDistribuidoras() {
  const integ = typeof _integracoesAtivas !== 'undefined' && _integracoesAtivas ? _integracoesAtivas : new Map();
  return (_catalogoDistrib.distribuidoras || [])
    .filter((d) => d.ativo !== false && (d.regras_kit?.modo === 'calculo' || integ.get(String(d.id))))
    .map((d) => ({ id: String(d.id), nome: d.nome, provedor: integ.get(String(d.id)) || 'calculo' }))
    .sort((a, b) => (a.provedor === 'calculo' ? 0 : 1) - (b.provedor === 'calculo' ? 0 : 1));
}

function _kmDist() {
  const lista = kitMontadoDistribuidoras();
  if (!lista.some((d) => d.id === _km.dist)) _km.dist = lista[0]?.id || '';
  return lista.find((d) => d.id === _km.dist) || null;
}

async function _kmCarregar(dist) {
  if (!dist || _km.opcoes[dist.id]) return;
  _km.opcoes[dist.id] = { carregando: true, provedor: dist.provedor };
  try {
    if (dist.provedor === 'calculo') {
      const { data, error } = await supabaseClient.rpc('kit_montado_opcoes', { p_distribuidora_id: dist.id });
      if (error) throw error;
      _km.opcoes[dist.id] = {
        provedor: 'calculo',
        modulos: (data?.modulos || []).map((m) => ({ id: String(m.id), nome: m.nome, marca: m.marca, w: Number(m.potencia_wp), tam: Number(m.tamanho) || 1 })),
        inversores: (data?.inversores || []).map((i) => ({
          id: String(i.id), nome: i.nome, marca: String(i.marca || '').toUpperCase(), kw: Number(i.kw),
          fase: i.rede === 'micro' ? 'micro' : String(i.rede || '').startsWith('tri') ? 'tri' : 'mono',
          faixa: Array.isArray(i.faixa_kwp) ? i.faixa_kwp.map(Number) : null, porMicro: 4,
        })),
      };
    } else {
      const { data, error } = await invocarDistribuidoras({ acao: 'opcoes', provedor: dist.provedor });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'Não foi possível buscar os equipamentos.');
      if (!Array.isArray(data.inversores)) throw new Error('A lista de inversores da distribuidora ainda não está disponível. Tente de novo em instantes.');
      _km.opcoes[dist.id] = {
        provedor: dist.provedor, padrao: data.padrao,
        modulos: (data.modulos || []).map((m) => ({ id: String(m.sku), nome: `${m.fabricante} ${m.potencia} W${m.tipo ? ' · ' + m.tipo : ''}`, marca: m.fabricante, w: Number(m.potencia), tam: 1 })),
        inversores: data.inversores.map((i) => ({
          id: String(i.item), nome: i.nome, marca: String(i.fabricante || '').toUpperCase(), kw: Number(i.kw),
          fase: i.grupo === 'micro' ? 'micro' : i.grupo === 'tri' ? 'tri' : 'mono',
          // "entradas" da Belenus é o nº de MPPTs, não de placas: micro de 2 kW ou mais liga 4 placas; os pequenos (Enphase), 1.
          faixa: Number(i.max_entrada_kw) > 0 ? [0, Number(i.max_entrada_kw)] : null, porMicro: Number(i.kw) >= 1.5 ? 4 : 1,
        })),
      };
    }
  } catch (err) {
    console.warn('[kit montado] opções', err);
    _km.opcoes[dist.id] = { erro: err?.message || 'Não foi possível buscar os equipamentos.', provedor: dist.provedor };
  }
  if (typeof pbFornecimentoSync === 'function') pbFornecimentoSync();
}

function _kmOpcoes() {
  const dist = _kmDist();
  if (!dist) return null;
  const o = _km.opcoes[dist.id];
  if (!o) { _kmCarregar(dist); return { carregando: true, provedor: dist.provedor }; }
  return o;
}

function _kmModulo(o) {
  if (!o?.modulos?.length) return null;
  if (!o.modulos.some((m) => m.id === _km.mod)) {
    _km.mod = (o.padrao && o.modulos.some((m) => m.id === o.padrao) ? o.padrao : null)
      || (o.modulos.find((m) => /RONMA/i.test(m.nome) && m.w >= 590) || o.modulos[0]).id;
  }
  return o.modulos.find((m) => m.id === _km.mod);
}

function _kmFmtKw(kw) {
  return Number(kw).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

function _kmNomeInv(i) {
  return i.fase === 'micro' ? `MICROINVERSOR ${i.marca} ${_kmFmtKw(i.kw)}KW` : `${i.marca} ${_kmFmtKw(i.kw)}KW`;
}

// Inversores da fase escolhida (micro entra junto do monofásico).
function _kmDaFase(o) {
  return (o?.inversores || []).filter((i) => (_km.fase === 'tri' ? i.fase === 'tri' : i.fase !== 'tri'));
}

// Placas que o inversor aguenta com o módulo escolhido (faixa de potência DC da distribuidora).
function _kmFaixa(inv, mod) {
  if (!inv?.faixa || !mod?.w) return null;
  return [Math.ceil(inv.faixa[0] * 1000 / mod.w), Math.floor(inv.faixa[1] * 1000 / mod.w)];
}

// ---------- telhado ----------
function _kmTelhados(o, mod) {
  if (!o || !mod) return [];
  if (o.provedor !== 'calculo') return [{ id: 'ceramico', nome: 'Cerâmico / colonial' }]; // a integração cota só cerâmico
  const ops = (typeof _pbEstrutura !== 'undefined' && _pbEstrutura.opcoes) || [];
  if (typeof _pbEstrutura !== 'undefined' && !_pbEstrutura.opcoes && typeof pbEstruturaCarregarOpcoes === 'function') pbEstruturaCarregarOpcoes();
  const dist = _kmDist();
  return ops.filter((e) => String(e.distribuidora_id) === dist?.id && Number(e.tamanho) === mod.tam)
    .map((e) => ({ id: e.id, nome: e.telhado === 'solo' ? 'Solo' : `${e.telhado_nome}${e.linha === 'flex' ? ' · Flex' : ''}`, telhado: e.telhado, linha: e.linha, padrao: e.padrao }));
}

function _kmEstrutura(o, mod) {
  const lista = _kmTelhados(o, mod);
  if (!lista.length) return null;
  if (!lista.some((t) => t.id === _km.estrutura)) {
    // Começa no telhado escolhido no modo simples (mesmo telhado/linha), senão no padrão.
    const tel = typeof _pbEstrutura !== 'undefined' ? _pbEstrutura.telhado : 'ceramico';
    const lin = typeof _pbEstrutura !== 'undefined' ? _pbEstrutura.linha : 'standard';
    const t = lista.find((x) => x.telhado === tel && (x.linha === lin || mod.tam === 2)) || lista.find((x) => x.padrao) || lista[0];
    _km.estrutura = t.id;
  }
  return lista.find((t) => t.id === _km.estrutura);
}

// ---------- montagem: sugestões, divisão das placas e conferência ----------
function _kmSugestoes(o, mod) {
  const lista = _kmDaFase(o);
  const n = _km.placas;
  const cabe = (i, p) => { const f = _kmFaixa(i, mod); return !f || (p >= f[0] && p <= f[1]); };
  const porKw = (a, b) => a.kw - b.kw;
  const out = [];
  const um = lista.filter((i) => i.fase !== 'micro' && cabe(i, n)).sort(porKw)[0];
  if (um) out.push([{ id: um.id, qtd: 1 }]);
  for (const q of [2, 3, 4]) {
    const x = lista.filter((i) => i.fase !== 'micro' && cabe(i, Math.ceil(n / q)) && cabe(i, Math.floor(n / q))).sort(porKw)[0];
    if (x) { out.push([{ id: x.id, qtd: q }]); break; }
  }
  const mi = lista.find((i) => i.fase === 'micro');
  if (mi) out.push([{ id: mi.id, qtd: Math.ceil(n / (mi.porMicro || 4)) }]);
  return out;
}

function _kmAnalisar(o, mod) {
  const n = _km.placas;
  const invs = _km.linhas.map((l) => ({ ...l, inv: o.inversores.find((i) => i.id === l.id) })).filter((l) => l.inv);
  const res = { linhas: invs.map(() => ({ txt: '', cls: 'km-ok' })), erros: [], avisos: [], resumo: '' };
  if (!invs.length) { res.erros.push('Escolha pelo menos um inversor.'); return res; }
  const micros = invs.filter((l) => l.inv.fase === 'micro'), strs = invs.filter((l) => l.inv.fase !== 'micro');
  if (micros.length && strs.length) { res.erros.push('Não dá pra misturar microinversor com inversor de string no mesmo kit.'); return res; }
  const tel = _kmEstrutura(o, mod);
  if (micros.length) {
    const cap = micros.reduce((s, l) => s + l.qtd * (l.inv.porMicro || 4), 0);
    const qtd = micros.reduce((s, l) => s + l.qtd, 0);
    const bloq = tel && /mini_trilho_(standard|smart)/.test(tel.id) && !/alto/.test(tel.id);
    res.linhas = invs.map((l) => ({ txt: bloq ? 'não vai em mini trilho baixo' : `liga até ${l.qtd * (l.inv.porMicro || 4)} placas (${l.inv.porMicro || 4} por micro)`, cls: bloq || cap < n ? 'km-off' : 'km-ok' }));
    if (bloq) res.erros.push('Microinversor não cabe embaixo do módulo no mini trilho baixo. Troque o telhado.');
    if (cap < n) res.erros.push(`Faltam microinversores: ${qtd} micros ligam ${cap} placas e o kit tem ${n}. Use ${Math.ceil(n / (micros[0].inv.porMicro || 4))}.`);
    res.resumo = `${qtd} microinversor${qtd > 1 ? 'es' : ''} · ligam até ${cap} placas`;
    return res;
  }
  // Placas repartidas pelos inversores, proporcional à potência de cada um.
  const un = [];
  invs.forEach((l, k) => { for (let j = 0; j < l.qtd; j++) un.push({ k, kw: l.inv.kw }); });
  const kwTot = un.reduce((s, u) => s + u.kw, 0);
  let resto = n;
  un.forEach((u) => { u.p = Math.floor(n * u.kw / kwTot); resto -= u.p; });
  un.map((u, x) => ({ x, f: n * u.kw / kwTot - u.p })).sort((a, b) => b.f - a.f).slice(0, resto).forEach((r) => { un[r.x].p++; });
  const ol = Math.round(n * mod.w / 1000 / kwTot * 100);
  invs.forEach((l, k) => {
    const ps = un.filter((u) => u.k === k).map((u) => u.p);
    const pmin = Math.min(...ps), pmax = Math.max(...ps);
    const cada = pmin === pmax ? `${pmin} placas` : `${pmin} a ${pmax} placas`;
    const f = _kmFaixa(l.inv, mod);
    const fora = f && (pmin < f[0] || pmax > f[1]);
    const faixa = f ? (f[0] > 0 ? ` · aguenta de ${f[0]} a ${f[1]}` : ` · aguenta até ${f[1]}`) : '';
    res.linhas[k] = { txt: `${l.qtd > 1 ? 'cada um com ' : 'com '}${cada}${faixa}`, cls: fora ? 'km-off' : ol > 135 ? 'km-alto' : 'km-ok' };
    if (fora) res.erros.push(`${_kmNomeInv(l.inv)} fica com ${cada} e aguenta ${f[0] > 0 ? `de ${f[0]} a ${f[1]}` : `até ${f[1]}`}. Mude a quantidade ou o modelo.`);
  });
  res.resumo = `${un.length} inversor${un.length > 1 ? 'es' : ''} · ${_kmFmtKw(kwTot)} kW · overload ${ol}% · placas por inversor: ${un.map((u) => u.p).join(' + ')}`;
  if (!res.erros.length && ol > 135) res.avisos.push(`Overload de ${ol}%: dentro do limite da distribuidora, confira com a engenharia.`);
  return res;
}

function _kmChave() {
  return JSON.stringify([_km.dist, _km.mod, _km.placas, _km.estrutura, (_km.linhas || []).map((l) => [l.id, l.qtd])]);
}

// ---------- preço ----------
function _kmAgendarCalculo(o) {
  if (o?.provedor !== 'calculo') return;
  const chave = _kmChave();
  if (_km.calcChave === chave && (_km.calc || _km.calcCarregando)) return;
  _km.calcChave = chave; _km.calc = null; _km.calcCarregando = true;
  clearTimeout(_kmCalcTimer);
  const seq = ++_km.calcSeq;
  _kmCalcTimer = setTimeout(async () => {
    const args = { p_distribuidora_id: _km.dist, p_modulo_id: _km.mod, p_placas: _km.placas,
      p_inversores: (_km.linhas || []).map((l) => ({ id: l.id, qtd: l.qtd })), p_estrutura_id: _km.estrutura || null, p_salvar: false };
    if (state.isAdmin && (state.adminKitsFranquia || state.franquiaId)) args.p_franquia_id = state.adminKitsFranquia || state.franquiaId;
    const { data, error } = await supabaseClient.rpc('kit_montado_cotar', args);
    if (seq !== _km.calcSeq) return;
    _km.calcCarregando = false;
    _km.calc = error ? { ok: false, erros: [error.message || 'Não foi possível calcular o preço.'] } : data;
    if (typeof pbFornecimentoSync === 'function') pbFornecimentoSync();
  }, 250);
}

async function kitMontadoCotar() {
  const dist = _kmDist();
  const o = _kmOpcoes();
  if (!dist || o?.provedor === 'calculo' || _km.cotando) return;
  const chave = _kmChave();
  const seq = ++_km.cotSeq;
  Object.assign(_km, { cotando: true, cotErro: '', cot: null, cotChave: chave });
  pbFornecimentoSync();
  try {
    const { data, error } = await invocarDistribuidoras({
      acao: 'cotar', provedor: dist.provedor, placas: _km.placas, modulo: _km.mod, telhado: 'ceramico',
      inversores: (_km.linhas || []).map((l) => ({ item: l.id, qtd: l.qtd })),
    });
    if (seq !== _km.cotSeq) return;
    if (error) throw error;
    if (!data?.ok || !data.kits?.[0]) throw new Error(data?.error || 'Não foi possível cotar agora.');
    _km.cot = data.kits[0];
  } catch (err) {
    if (seq !== _km.cotSeq) return;
    _km.cotErro = err?.message || 'Não foi possível cotar agora.';
  }
  _km.cotando = false;
  pbFornecimentoSync();
}

// Kit da vez pro orçamento (coluna da direita, rodapé, Gerar). null = ainda sem preço.
function kitMontadoKit() {
  if (!kitMontadoAtivo()) return null;
  const o = _kmOpcoes();
  const mod = _kmModulo(o);
  if (!o || o.carregando || o.erro || !mod || !_km.linhas?.length) return null;
  const chave = _kmChave();
  const base = { _montado: true, ativo: true, brand: String(mod.marca || '').toUpperCase(), distribuidora_id: _km.dist, linha: 'catalogo',
    _estruturaNome: kitMontadoEstruturaNome() };
  if (o.provedor === 'calculo') {
    const c = _km.calc;
    if (!c?.ok || _km.calcChave !== chave || _kmAnalisar(o, mod).erros.length) return null;
    return { ...base, id: 'adv:' + chave, name: c.titulo, power: Number(c.kwp), price: Number(c.preco), list_price: Number(c.preco_de), categoria: c.categoria };
  }
  const k = _km.cot;
  if (!k || _km.cotChave !== chave) return null;
  return { ...base, id: 'adv:' + chave, _cotacaoId: k.cotacao_id, name: k.titulo, power: Number(k.kwp), price: Number(k.preco), list_price: Number(k.preco_de), categoria: k.categoria };
}

// Na hora de gerar: grava a cotação do kit calculado (o banco trava preço e custo).
async function kitMontadoPrepararProposta(kit) {
  if (!kit?._montado) return kit;
  if (kit._cotacaoId) return kit;
  const args = { p_distribuidora_id: _km.dist, p_modulo_id: _km.mod, p_placas: _km.placas,
    p_inversores: (_km.linhas || []).map((l) => ({ id: l.id, qtd: l.qtd })), p_estrutura_id: _km.estrutura || null, p_salvar: true };
  if (state.isAdmin && (state.adminKitsFranquia || state.franquiaId)) args.p_franquia_id = state.adminKitsFranquia || state.franquiaId;
  const { data, error } = await supabaseClient.rpc('kit_montado_cotar', args);
  if (error || !data?.ok || !data.cotacao_id) {
    showToast((error?.message || data?.erros?.[0] || 'Não foi possível gravar o kit montado.').toUpperCase());
    return null;
  }
  return { ...kit, _cotacaoId: data.cotacao_id, name: data.titulo, price: Number(data.preco), list_price: Number(data.preco_de) };
}

// ---------- tela: cartões do painel ----------
function _kmCampo(ic, cap, inner) {
  return `<label class="pbd-forn-campo"><i data-lucide="${ic}" class="pbd-forn-ic"></i><span class="pbd-forn-cap">${cap}</span>${inner}</label>`;
}
function _kmCaixa(ic, cap, inner) {
  return `<div class="pbd-forn-campo km-caixa"><i data-lucide="${ic}" class="pbd-forn-ic"></i><span class="pbd-forn-cap">${cap}</span>${inner}</div>`;
}

function kitMontadoCamposHTML() {
  const dists = kitMontadoDistribuidoras();
  const o = _kmOpcoes();
  const mod = _kmModulo(o);
  const tels = _kmTelhados(o, mod);
  _kmEstrutura(o, mod);
  const opt = (v, t, sel, dis) => `<option value="${escapeHTML(v)}" ${sel ? 'selected' : ''} ${dis ? 'disabled' : ''}>${escapeHTML(t)}</option>`;
  const carregando = !o || o.carregando || o.erro;
  return _kmCampo('warehouse', '1 · Distribuidora', `<select class="pbd-input v2-select" data-km="dist" data-titulo="Distribuidora">${dists.map((d) => opt(d.id, d.nome, d.id === _km.dist)).join('') || opt('', 'Nenhuma distribuidora monta kit')}</select>`)
    + _kmCampo('solar-panel', '2 · Módulo', `<select class="pbd-input v2-select" data-km="mod" data-titulo="Módulo" ${carregando ? 'disabled' : ''}>${carregando ? opt('', o?.erro ? 'Indisponível' : 'Carregando…') : o.modulos.map((m) => opt(m.id, m.nome, m.id === _km.mod)).join('')}</select>`)
    + _kmCaixa('hash', 'Quantidade de placas', `<div class="km-qtd"><button type="button" data-km-placas="-1" aria-label="Uma placa a menos">−</button><input type="number" min="1" max="150" value="${_km.placas}" data-km="placas" aria-label="Quantidade de placas"><button type="button" data-km-placas="1" aria-label="Uma placa a mais">+</button><span>placas${mod ? ` · ${_kmFmtKw(_km.placas * mod.w / 1000)} kWp` : ''}</span></div>`)
    + _kmCaixa('zap', '3 · Fase do inversor', `<div class="km-fase" role="group" aria-label="Fase do inversor"><button type="button" data-km-fase="mono" class="${_km.fase !== 'tri' ? 'is-on' : ''}">Monofásico</button><button type="button" data-km-fase="tri" class="${_km.fase === 'tri' ? 'is-on' : ''}">Trifásico</button></div><span class="km-tensao">220 V</span>`)
    + _kmCampo('home', '4 · Telhado do cliente', `<select class="pbd-input v2-select" data-km="estrutura" data-titulo="Telhado do cliente" ${tels.length ? '' : 'disabled'}>${tels.length ? tels.map((t) => opt(t.id, t.nome, t.id === _km.estrutura)).join('') : opt('', 'Carregando…')}</select>`);
}

function kitMontadoBindCampos(root) {
  root.querySelectorAll('select[data-km]').forEach((s) => s.addEventListener('change', () => {
    const campo = s.dataset.km;
    if (campo === 'dist') { _km.dist = s.value; _km.mod = ''; _km.linhas = null; _km.estrutura = ''; }
    if (campo === 'mod') { _km.mod = s.value; _km.estrutura = ''; }
    if (campo === 'estrutura') _km.estrutura = s.value;
    _kmMudou();
  }));
  const inp = root.querySelector('input[data-km="placas"]');
  if (inp) inp.addEventListener('change', () => { _km.placas = Math.max(1, Math.min(150, Math.round(Number(inp.value) || 1))); _kmMudou(); });
  root.querySelectorAll('[data-km-placas]').forEach((b) => b.addEventListener('click', () => {
    _km.placas = Math.max(1, Math.min(150, _km.placas + Number(b.dataset.kmPlacas))); _kmMudou();
  }));
  root.querySelectorAll('[data-km-fase]').forEach((b) => b.addEventListener('click', () => {
    if (_km.fase === b.dataset.kmFase) return;
    _km.fase = b.dataset.kmFase; _km.linhas = null; _kmMudou();
  }));
}

function _kmMudou() {
  if (typeof orcamentoLimparKit === 'function') orcamentoLimparKit();
  pbFornecimentoSync();
}

// ---------- tela: "Inversores do kit" (no lugar da lista de kits) ----------
function kitMontadoListaHTML() {
  const dist = _kmDist();
  if (!dist) return '<div class="orc-vazio">Nenhuma distribuidora está liberada pra montar kit.</div>';
  const o = _kmOpcoes();
  if (!o || o.carregando) return '<div class="orc-vazio">Buscando os equipamentos da distribuidora…</div>';
  if (o.erro) return typeof pbIntegracaoAlertaHTML === 'function' && o.provedor !== 'calculo'
    ? pbIntegracaoAlertaHTML(o.erro, 'equipamentos') : `<div class="orc-vazio">${escapeHTML(o.erro)}</div>`;
  const mod = _kmModulo(o);
  const daFase = _kmDaFase(o);
  if (!mod || !daFase.length) return '<div class="orc-vazio">A distribuidora não tem inversor dessa fase agora.</div>';
  if (!_km.linhas || _km.linhas.some((l) => !daFase.some((i) => i.id === l.id))) {
    _km.linhas = (_kmSugestoes(o, mod)[0] || [{ id: daFase[0].id, qtd: 1 }]).map((l) => ({ ...l }));
  }
  const a = _kmAnalisar(o, mod);
  const sug = _kmSugestoes(o, mod);
  const nomeSug = (s) => s.map((l) => `${l.qtd}× ${_kmNomeInv(o.inversores.find((i) => i.id === l.id))}`).join(' + ');
  const calculo = o.provedor === 'calculo';
  if (calculo && !a.erros.length) _kmAgendarCalculo(o);
  const servidor = calculo && _km.calc && _km.calcChave === _kmChave() && !_km.calc.ok ? (_km.calc.erros || []) : [];
  const opcaoInv = (i, l) => {
    const f = _kmFaixa(i, mod);
    const info = i.fase === 'micro' ? `${i.porMicro || 4} placas por micro` : f ? (f[0] > 0 ? `aguenta ${f[0]} a ${f[1]} placas` : `aguenta até ${f[1]} placas`) : '';
    return `<option value="${escapeHTML(i.id)}" ${i.id === l.id ? 'selected' : ''}>${escapeHTML(_kmNomeInv(i))}${info ? ' · ' + info : ''}</option>`;
  };
  return `<div class="km-box">
    <div class="km-head"><span class="km-t"><i data-lucide="cpu"></i> Inversores do kit</span>
      <span class="km-s">${calculo ? 'preço calculado na hora' : `equipamentos da ${escapeHTML(dist.nome)} · preço na cotação`}</span></div>
    ${sug.length ? `<div class="km-sug"><span>Sugestões pra ${_km.placas} placas:</span>${sug.map((s, k) => `<button type="button" data-km-sug="${k}">${escapeHTML(nomeSug(s))}</button>`).join('')}</div>` : ''}
    ${_km.linhas.map((l, k) => `<div class="km-lin">
      <div class="km-lin-eq"><select class="pbd-input v2-select" data-km-inv="${k}" data-titulo="Inversor">${daFase.map((i) => opcaoInv(i, l)).join('')}</select>
        ${a.linhas[k]?.txt ? `<span class="km-badge ${a.linhas[k].cls}">${escapeHTML(a.linhas[k].txt)}</span>` : ''}</div>
      <div class="km-qtd km-qtd-p"><button type="button" data-km-q="${k}" data-d="-1" aria-label="Um a menos">−</button><input type="number" min="1" max="200" value="${l.qtd}" data-km-qn="${k}" aria-label="Quantidade"><button type="button" data-km-q="${k}" data-d="1" aria-label="Um a mais">+</button></div>
      <button type="button" class="km-rem" data-km-rem="${k}" title="Remover este inversor" aria-label="Remover este inversor" ${_km.linhas.length < 2 ? 'disabled' : ''}><i data-lucide="trash-2"></i></button>
    </div>`).join('')}
    <button type="button" class="orc-link km-add" data-km-add><i data-lucide="plus"></i> Adicionar outro inversor</button>
    ${a.resumo ? `<div class="km-resumo">${escapeHTML(a.resumo)}</div>` : ''}
    ${[...a.erros, ...servidor].map((e) => `<div class="km-erro">${escapeHTML(e)}</div>`).join('')}
    ${a.avisos.map((e) => `<div class="orc-aviso">${escapeHTML(e)}</div>`).join('')}
  </div>`;
}

// Nome do kit enquanto ainda não tem preço (mesmo formato do título que o banco grava).
function _kmTituloPrevia(o, mod) {
  const invs = (_km.linhas || []).map((l) => ({ l, i: o.inversores.find((x) => x.id === l.id) })).filter((x) => x.i)
    .map(({ l, i }) => (i.fase === 'micro' ? `${l.qtd}× MICROINVERSOR ${i.marca}` : `${l.qtd}× INV. ${i.marca} ${_kmFmtKw(i.kw)}KW`));
  return `KIT ${_km.placas} MOD. ${mod.w}W${invs.length ? ' + ' + invs.join(' + ') : ''}`;
}

// Coluna da direita sem preço ainda: nome do kit, "—", e o Cotar da distribuidora integrada.
function kitMontadoLadoVazioHTML() {
  const dist = _kmDist();
  const o = _kmOpcoes();
  const mod = _kmModulo(o);
  const sec = '<div class="orc-sec"><i data-lucide="package"></i> Kit montado</div>';
  if (!dist || !o || o.carregando || o.erro || !mod || !_km.linhas?.length) return `${sec}<div class="orc-vazio">Monte o kit ao lado: módulo, placas e inversores.</div>`;
  const a = _kmAnalisar(o, mod);
  const calculo = o.provedor === 'calculo';
  const servidor = calculo && _km.calc && _km.calcChave === _kmChave() && !_km.calc.ok;
  const estado = a.erros.length || servidor ? 'Ajuste o kit ao lado pra ver o preço.'
    : calculo ? 'Calculando o preço…'
    : _km.cotando ? `Cotando na ${dist.nome}…` : `Preço só depois de cotar na ${dist.nome}.`;
  let html = `${sec}<div class="orc-kit"><div class="orc-kit-n">${escapeHTML(_kmTituloPrevia(o, mod))}</div>
    <div class="orc-kit-d">${_kmFmtKw(_km.placas * mod.w / 1000)} kWp · ${escapeHTML(dist.nome)}</div>
    <div class="orc-kit-nota">${escapeHTML(estado)}</div>
    <div class="orc-kit-preco"><b>—</b></div></div>`;
  if (!calculo && !a.erros.length) {
    if (_km.cotErro && _km.cotChave === _kmChave() && typeof pbIntegracaoAlertaHTML === 'function') html += pbIntegracaoAlertaHTML(_km.cotErro, 'cotar');
    html += `<button type="button" class="btn btn-secondary km-cotar" onclick="kitMontadoCotar()" ${_km.cotando ? 'disabled' : ''}>${_km.cotando
      ? `<i data-lucide="loader-2" class="animate-spin"></i> Cotando na ${escapeHTML(dist.nome)}…`
      : `<i data-lucide="refresh-cw"></i> Cotar este kit na ${escapeHTML(dist.nome)}`}</button>`;
  }
  return html;
}

function kitMontadoEstruturaNome() {
  const o = _kmOpcoes();
  const t = _kmEstrutura(o, _kmModulo(o));
  return t ? t.nome : '';
}

// Painel de equipamentos: chave Simples/Avançado e, no avançado, os cinco cartões.
// Devolve true quando desenhou o avançado (o painel simples fica escondido).
function kitMontadoRenderPainel(panel) {
  const seg = document.getElementById('pb-modo');
  const simples = document.getElementById('pb-forn-simples');
  const box = document.getElementById('pb-forn-avancado');
  const info = document.getElementById('pb-km-info');
  const pode = kitMontadoPermitido() && state.pbProposalMode === 'PROMOCIONAL' && pbLinhaAtual() === 'catalogo'
    && typeof orcamentoAberto === 'function' && orcamentoAberto();
  const ativo = kitMontadoAtivo();
  seg?.classList.toggle('hidden', !pode);
  seg?.querySelectorAll('[data-pb-modo]').forEach((b) => {
    const on = (b.dataset.pbModo === 'avancado') === ativo;
    b.classList.toggle('is-on', on);
    b.setAttribute('aria-pressed', String(on));
    b.disabled = typeof _orcamentoGerando !== 'undefined' && _orcamentoGerando;
  });
  simples?.classList.toggle('hidden', ativo);
  box?.classList.toggle('hidden', !ativo);
  info?.classList.toggle('hidden', !ativo);
  kitMontadoSyncTela();
  if (!ativo || !box) { if (box) box.innerHTML = ''; return false; }
  const dist = _kmDist();
  document.getElementById('pb-fornecimento-hint').textContent = !_catalogoDistrib.carregado ? 'Carregando as distribuidoras…'
    : dist ? `Monte do seu jeito: módulo, placas e quantos inversores quiser, de qualquer modelo que a ${dist.nome} tem agora.`
    : 'Nenhuma distribuidora está liberada pra montar kit.';
  box.innerHTML = kitMontadoCamposHTML();
  kitMontadoBindCampos(box);
  const o = _kmOpcoes();
  const mod = _kmModulo(o);
  if (info) {
    const kwp = mod ? _km.placas * mod.w / 1000 : 0;
    const hsp = Number(state.pbActiveClient?.hsp) || undefined;
    const ger = mod && typeof calcularGeracaoEstimada === 'function' ? Number(calcularGeracaoEstimada(kwp, 'kitsInversor', hsp)) || 0 : 0;
    info.innerHTML = mod ? `Sistema de <b>${_kmFmtKw(kwp)} kWp</b>${ger ? ` · ~<b>${Math.round(ger).toLocaleString('pt-BR')} kWh/mês</b>` : ''} · o kit sai com exatamente <b>${_km.placas}</b> ${_km.placas === 1 ? 'placa' : 'placas'}` : '';
    info.classList.toggle('hidden', !mod);
  }
  if (o?.provedor && o.provedor !== 'calculo') info?.insertAdjacentText('beforeend', mod ? ' · a cotação sai com estrutura de telhado cerâmico' : '');
  document.getElementById('pb-estrutura-hint')?.classList.add('hidden');
  const aviso = document.getElementById('pb-fornecimento-aviso');
  if (aviso) { aviso.textContent = ''; aviso.classList.add('hidden'); }
  if (window.uiV2Select) window.uiV2Select.scan(panel);
  if (window.lucide) lucide.createIcons();
  return true;
}

function kitMontadoBindLista(root) {
  root.querySelectorAll('[data-km-sug]').forEach((b) => b.addEventListener('click', () => {
    const o = _kmOpcoes(); const mod = _kmModulo(o);
    const s = _kmSugestoes(o, mod)[Number(b.dataset.kmSug)];
    if (s) { _km.linhas = s.map((l) => ({ ...l })); _kmMudou(); }
  }));
  root.querySelectorAll('select[data-km-inv]').forEach((s) => s.addEventListener('change', () => {
    _km.linhas[Number(s.dataset.kmInv)].id = s.value; _kmMudou();
  }));
  root.querySelectorAll('[data-km-q]').forEach((b) => b.addEventListener('click', () => {
    const l = _km.linhas[Number(b.dataset.kmQ)];
    l.qtd = Math.max(1, Math.min(200, l.qtd + Number(b.dataset.d))); _kmMudou();
  }));
  root.querySelectorAll('input[data-km-qn]').forEach((i) => i.addEventListener('change', () => {
    _km.linhas[Number(i.dataset.kmQn)].qtd = Math.max(1, Math.min(200, Math.round(Number(i.value) || 1))); _kmMudou();
  }));
  root.querySelectorAll('[data-km-rem]').forEach((b) => b.addEventListener('click', () => {
    _km.linhas.splice(Number(b.dataset.kmRem), 1); _kmMudou();
  }));
  root.querySelector('[data-km-add]')?.addEventListener('click', () => {
    _km.linhas.push({ id: _km.linhas[_km.linhas.length - 1].id, qtd: 1 }); _kmMudou();
  });
}

// No lugar da lista de kits. O Gerar é o da coluna da direita (o mesmo de sempre).
function kitMontadoRenderLista(container) {
  container.innerHTML = kitMontadoListaHTML();
  kitMontadoBindLista(container);
  if (window.uiV2Select) window.uiV2Select.scan(container);
  if (window.lucide) lucide.createIcons();
}
