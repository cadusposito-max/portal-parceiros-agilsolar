// ==========================================
// INTEGRAÇÃO COM DISTRIBUIDORAS (Admin → Distribuidoras + cotação no orçamento)
// ==========================================
// O servidor (edge function "distribuidoras") loga na distribuidora, cota o kit,
// aplica a precificação e grava a cotação. O navegador do vendedor recebe só
// preço e "De"; o admin também vê o custo. A proposta é criada com cotacao_id e
// o banco copia nome/preço da cotação (o navegador não define o preço).

// A função roda sempre em São Paulo: nos logs de 08/10 todas as recusas imediatas (403) da Belenus
// vieram da função rodando nos EUA, e as cotações que deram certo rodaram em São Paulo.
const DISTRIBUIDORAS_REGIAO = 'sa-east-1';
function invocarDistribuidoras(body) {
  return supabaseClient.functions.invoke('distribuidoras', { body, region: DISTRIBUIDORAS_REGIAO });
}

const INTEGRACOES_INFO = {
  belenus: { nome: 'Belenus', login: 'senha', descricao: 'Login com o e-mail e a senha do portal da Belenus. A senha fica criptografada no servidor e nunca volta pra tela.',
    // Telhados (tabela estruturas) que a edge function traduz pra estrutura da Belenus. Sem kalhetão.
    telhados: ['ceramico', 'fibro_madeira', 'fibro_metal', 'laje', 'mini_trilho', 'mini_trilho_alto', 'trapezoidal', 'shingle', 'solo'] },
  helte:   { nome: 'Helte', login: 'oauth', descricao: 'A Helte conecta por autorização oficial (OAuth), como na Groner. Falta a Helte enviar o client_id e o client_secret da Ágil Solar.' },
};

let _integracoesAtivas = null;      // Map distribuidora_id -> provedor
let _integracoesAtivasPromise = null;
let _pbCot = { chave: '', placas: '', carregando: false, erro: '', kits: [] };
const _pbCotOpcoes = {};                    // distribuidora_id -> { carregando, erro, modulos, padrao, marcas_inversor, marcas_micro }
const _pbCotSel = { modulo: '', marca: '' }; // módulo (sku) e marca escolhidos pra cotar
// Número da cotação que vale: mudou módulo/marca/placas no meio, a resposta antiga é descartada.
let _pbCotSeq = 0;
// Mesma cotação (cliente + parâmetros) nos últimos 10 min volta daqui, sem consultar a distribuidora
// de novo: poupa a Belenus de quem clica duas vezes ou troca de marca e volta.
const _pbCotMemo = new Map();
const PB_COT_MEMO_MS = 10 * 60_000;

async function carregarIntegracoesAtivas(force = false) {
  if (_integracoesAtivas && !force) return _integracoesAtivas;
  if (_integracoesAtivasPromise) return _integracoesAtivasPromise;
  _integracoesAtivasPromise = (async () => {
    try {
      const { data, error } = await supabaseClient.rpc('integracoes_ativas');
      if (error) throw error;
      _integracoesAtivas = new Map((data || []).map((i) => [String(i.distribuidora_id), i.provedor]));
    } catch (err) {
      console.warn('[integrações] não foi possível carregar', err);
      _integracoesAtivas = new Map();
    }
    return _integracoesAtivas;
  })();
  try { return await _integracoesAtivasPromise; } finally { _integracoesAtivasPromise = null; }
}

// Telhados que a distribuidora integrada monta, na ordem da lista de estruturas (um por telhado:
// a linha Standard/Flex/Smart é da Helte; a Belenus tem a estrutura dela pra cada telhado).
function pbIntegracaoTelhados(provedor) {
  const aceitos = INTEGRACOES_INFO[provedor]?.telhados || ['ceramico'];
  const ops = (typeof _pbEstrutura !== 'undefined' && _pbEstrutura.opcoes) || [];
  const vistos = new Set();
  const lista = [];
  ops.forEach((o) => {
    if (!aceitos.includes(o.telhado) || vistos.has(o.telhado)) return;
    vistos.add(o.telhado);
    const linha = (typeof pbEstruturaLinhas === 'function' && pbEstruturaLinhas(o.telhado)[0]) || o.linha;
    lista.push({ telhado: o.telhado, linha, valor: `${o.telhado}|${linha}`, nome: o.telhado === 'solo' ? 'Solo' : o.telhado_nome });
  });
  return lista.length ? lista : [{ telhado: 'ceramico', linha: 'standard', valor: 'ceramico|standard', nome: 'Cerâmico / colonial' }];
}

function pbIntegracaoTelhadoOk(provedor, telhado) {
  return (INTEGRACOES_INFO[provedor]?.telhados || ['ceramico']).includes(telhado || 'ceramico');
}

// <option>s do telhado pra distribuidora integrada. Telhado que ela não monta (kalhetão) aparece
// marcado e desativado, pra o vendedor ver por que não dá pra cotar.
function pbIntegracaoTelhadoOpcoesHTML(provedor) {
  const tel = (typeof _pbEstrutura !== 'undefined' && _pbEstrutura.telhado) || 'ceramico';
  const lista = pbIntegracaoTelhados(provedor);
  const fora = !pbIntegracaoTelhadoOk(provedor, tel);
  const nomeFora = ((typeof _pbEstrutura !== 'undefined' && _pbEstrutura.opcoes) || []).find((o) => o.telhado === tel)?.telhado_nome || tel;
  return (fora ? `<option value="" selected disabled>${escapeHTML(nomeFora)} (a ${escapeHTML(INTEGRACOES_INFO[provedor]?.nome || provedor)} não tem)</option>` : '')
    + lista.map((t) => `<option value="${escapeHTML(t.valor)}"${!fora && t.telhado === tel ? ' selected' : ''}>${escapeHTML(t.nome)}</option>`).join('');
}

// Provedor da distribuidora escolhida no orçamento (ou null).
function pbIntegracaoAtual() {
  const id = typeof _pbFornecimento !== 'undefined' ? _pbFornecimento.distribuidora : '';
  if (!id || !_integracoesAtivas) return null;
  return _integracoesAtivas.get(String(id)) || null;
}

// ------------------------------------------------------------------ orçamento
// Aviso em cartão (ícone + título + explicação), legível no celular. Traduz as mensagens do
// servidor: bloqueio temporário (com o horário de volta), kit em falta e erro. Laranja = dá pra
// resolver esperando ou trocando a escolha; vermelho = erro. O detalhe técnico só o admin vê.
function pbIntegracaoAlertaHTML(msg, contexto = 'cotar') {
  const nome = INTEGRACOES_INFO[pbIntegracaoAtual()]?.nome || 'distribuidora';
  const txt = String(msg || '').replace(/^Não foi possível buscar os equipamentos da distribuidora:\s*/i, '').trim();
  // Pausa: 403 ("recusando as consultas") ou 429 ("pediu pra aguardar"), sempre com o horário.
  const bloqueio = txt.match(/(?:recusando as consultas|pediu pra aguardar)[\s\S]*?(\d{1,2}:\d{2})/i);
  let tipo = 'aviso', icone = 'alert-triangle', titulo, corpo, hora = '';
  if (bloqueio) {
    icone = 'hourglass'; hora = bloqueio[1];
    titulo = `${nome} pausada por alguns minutos`;
    corpo = /pediu pra aguardar/i.test(txt)
      ? `A ${nome} pediu pra aguardar antes de novas consultas.`
      : `A ${nome} recusou uma consulta. Nosso sistema pausou novas tentativas por precaução; o horário abaixo não garante a liberação pela distribuidora.`;
  } else if (/^Esse kit não está disponível/i.test(txt)) {
    icone = 'package-x';
    titulo = `Kit indisponível na ${nome}`;
    const resto = txt.replace(/^Esse kit não está disponível no momento[:.]?\s*/i, '');
    corpo = resto ? resto.charAt(0).toUpperCase() + resto.slice(1) : 'Escolha outro módulo ou outro inversor e cote de novo.';
  } else if (/sendo atualizado/i.test(txt)) {
    icone = 'refresh-cw';
    titulo = 'Atualizando a lista de equipamentos';
    corpo = 'Tente de novo em um minuto.';
  } else {
    tipo = 'erro';
    titulo = contexto === 'equipamentos' ? 'Não foi possível buscar os equipamentos' : 'Não foi possível cotar agora';
    corpo = state.isAdmin && txt ? txt : `A ${nome} não respondeu. Tente de novo em instantes.`;
  }
  return pbAlertaHTML({ tipo, icone, titulo, corpo, hora });
}

function pbAlertaHTML({ tipo = 'aviso', icone = 'alert-triangle', titulo, corpo = '', hora = '' }) {
  return `<div class="pb-alerta pb-alerta-${tipo}" role="${tipo === 'erro' ? 'alert' : 'status'}">
      <i data-lucide="${icone}"></i>
      <div>
        <p class="pb-alerta-t">${escapeHTML(titulo)}</p>
        ${corpo ? `<p class="pb-alerta-b">${escapeHTML(corpo)}</p>` : ''}
        ${hora ? `<span class="pb-alerta-chip"><i data-lucide="clock"></i>Nova tentativa após ${escapeHTML(hora)}</span>` : ''}
      </div>
    </div>`;
}

// Módulos e marcas que a distribuidora tem (buscados uma vez por distribuidora).
async function pbIntegracaoCarregarOpcoes(force = false) {
  const id = _pbFornecimento.distribuidora;
  const provedor = pbIntegracaoAtual();
  if (!id || !provedor || (_pbCotOpcoes[id] && !force)) return;
  _pbCotOpcoes[id] = { carregando: true };
  try {
    const { data, error } = await invocarDistribuidoras({ acao: 'opcoes', provedor, placas: Number(_pbCot.placas) || 10 });
    if (error) throw error;
    if (!data?.ok) throw new Error(data?.error || 'Não foi possível buscar os equipamentos.');
    _pbCotOpcoes[id] = { modulos: data.modulos || [], padrao: data.padrao, marcas_inversor: data.marcas_inversor || [], marcas_micro: data.marcas_micro || [] };
    if (!_pbCotSel.modulo || !_pbCotOpcoes[id].modulos.some((m) => m.sku === _pbCotSel.modulo)) _pbCotSel.modulo = data.padrao || '';
  } catch (err) {
    console.error('[integrações] opções', err);
    _pbCotOpcoes[id] = { erro: err?.message || 'Não foi possível buscar os equipamentos.' };
  }
  if (typeof pbFornecimentoRender === 'function') pbFornecimentoRender();
}

// Preenche "Módulo" e "Marca do inversor" com o que a distribuidora tem. Devolve o aviso do
// painel: texto simples, ou { html } com o cartão de alerta quando deu problema.
function pbIntegracaoPreencherFiltros(selMod, selInv) {
  const o = _pbCotOpcoes[_pbFornecimento.distribuidora];
  if (!o) pbIntegracaoCarregarOpcoes();
  if (!o || o.carregando || o.erro) {
    const txt = o?.erro ? 'Indisponível' : 'Carregando…';
    [selMod, selInv].forEach((sel) => { sel.innerHTML = `<option value="">${txt}</option>`; sel.disabled = true; });
    return o?.erro ? { html: pbIntegracaoAlertaHTML(o.erro, 'equipamentos') } : 'Buscando os módulos e as marcas da distribuidora…';
  }
  const micro = state.pbCategory === 'kitsMicro';
  selMod.innerHTML = o.modulos.map((m) => `<option value="${escapeHTML(m.sku)}">${escapeHTML(`${m.fabricante} ${m.potencia} W${m.tipo ? ' · ' + m.tipo : ''}`)}</option>`).join('');
  selMod.value = _pbCotSel.modulo || o.padrao || '';
  selMod.disabled = !o.modulos.length;
  const marcas = micro ? o.marcas_micro : o.marcas_inversor;
  if (_pbCotSel.marca && !marcas.includes(_pbCotSel.marca)) _pbCotSel.marca = '';
  selInv.innerHTML = '<option value="">Sem preferência</option>'
    + marcas.map((m) => `<option value="${escapeHTML(m)}">${escapeHTML(m)}</option>`).join('');
  selInv.value = _pbCotSel.marca;
  selInv.disabled = false;
  return 'Escolha o módulo e a marca, informe as placas e clique em Cotar kits.';
}

function pbIntegracaoEscolher(campo, value) {
  if (campo === 'modulo') _pbCotSel.modulo = String(value || '');
  if (campo === 'inversor') _pbCotSel.marca = String(value || '');
  pbIntegracaoInvalidar();
}

// Mudou a quantidade de placas (ao sair do campo): os kits cotados eram pra outra quantidade.
function pbIntegracaoPlacas(value) {
  _pbCot.placas = String(value || '');
  if (_pbCot.kits.length || _pbCot.erro || _pbCot.carregando) pbIntegracaoInvalidar();
}

// Parâmetro mudou: some com os kits e o kit escolhido, e descarta a cotação em andamento.
function pbIntegracaoInvalidar() {
  _pbCotSeq++;
  _pbCot.kits = []; _pbCot.erro = ''; _pbCot.cotadoEm = 0;
  if (typeof orcamentoLimparKit === 'function') orcamentoLimparKit();
  pbFornecimentoSync();
}

function pbCotacaoKits() {
  return (_pbCot.kits || []).filter((k) => !k.erro).map((k) => ({
    id: 'cot:' + k.cotacao_id,
    _cotacaoId: k.cotacao_id,
    name: k.titulo,
    brand: k.marca,
    power: k.kwp,
    price: k.preco,
    list_price: k.preco_de,
    categoria: k.categoria,
    ativo: true,
    distribuidora_id: _pbFornecimento.distribuidora,
    _custo: k.custo,
    _frete: k.detalhe_custo || null,
    _margem: k.margem_alvo,
    _modo: k.modo_precificacao || 'markup',
    _inversor: k.inversor,
  }));
}

function pbAcharKit(id) {
  const sid = String(id || '');
  if (sid.startsWith('cot:')) return pbCotacaoKits().find((k) => k.id === sid) || null;
  return (typeof pbKitsOrcamento === 'function' ? pbKitsOrcamento() : (state.data || [])).find((k) => String(k.id) === sid) || null;
}

function pbIntegracaoPainelHTML(placasSugeridas) {
  const provedor = pbIntegracaoAtual();
  const info = INTEGRACOES_INFO[provedor] || { nome: provedor };
  const chave = `${_pbFornecimento.distribuidora}|${state.pbActiveClient?.id || ''}`;
  if (_pbCot.chave !== chave) _pbCot = { chave, placas: '', carregando: false, erro: '', kits: [] };
  // Os kits cotados valem pro telhado da cotação: trocou o telhado, cota de novo.
  const telhadoAtual = (typeof _pbEstrutura !== 'undefined' && _pbEstrutura.telhado) || 'ceramico';
  if (!_pbCot.carregando && _pbCot.telhado && _pbCot.telhado !== telhadoAtual) Object.assign(_pbCot, { kits: [], erro: '', cotadoEm: 0, telhado: '' });
  const telhadoFora = !pbIntegracaoTelhadoOk(provedor, telhadoAtual);
  const placas = _pbCot.placas || (placasSugeridas ? String(placasSugeridas) : '');
  const kits = pbCotacaoKits().filter((k) => k.categoria === state.pbCategory);
  const erros = (_pbCot.kits || []).filter((k) => k.erro);
  const outrosTipos = pbCotacaoKits().length - kits.length;
  const cotadoAs = _pbCot.cotadoEm ? new Date(_pbCot.cotadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';

  const cards = kits.map((k, i) => {
    const id = escapeHTML(k.id);
    const temDe = Number(k.list_price) > Number(k.price);
    // Admin confere pra onde o frete foi calculado (a unidade; ou a conta Belenus, se ela não atende a cidade).
    const fr = k._frete;
    const freteAte = fr?.cidade ? ` · frete até ${fr.cidade}/${fr.estado || ''}${fr.frete_destino === 'conta_belenus' ? ' (a Belenus não atendeu a cidade da unidade)' : ''}` : '';
    const custo = state.isAdmin && Number(k._custo) > 0
      ? `<div class="pbd-kit-nota">${escapeHTML(`Só admin: custo ${info.nome} ${formatCurrency(k._custo)}${freteAte}${k._margem != null ? ` · margem-alvo ${String(k._margem).replace('.', ',')}%` : ''}`)}</div>` : '';
    return `
      <div data-orcamento-kit="${id}" class="pbd-kit${i === 0 ? ' is-top' : ''}">
        ${i === 0 ? '<span class="pbd-kit-tag">Menor preço</span>' : ''}
        <div class="pbd-kit-n">${escapeHTML(k.name)}</div>
        <div class="pbd-kit-d">${escapeHTML(String(k.power).replace('.', ','))} kWp · Distribuidora: ${escapeHTML(info.nome)} · frete incluso${cotadoAs ? ` · cotado às ${escapeHTML(cotadoAs)}` : ''}</div>
        ${custo}
        ${state.isAdmin || state.isGestor ? `<div class="pbd-kit-nota">Preço: ${k._modo === 'custos' ? 'custos + margem alvo da unidade' : 'markup'}</div>` : ''}
        <div class="pbd-kit-f">
          <div>
            ${temDe ? `<div class="pbd-kit-de">De: ${formatCurrency(k.list_price)}</div>` : ''}
            <div class="pbd-kit-p">${formatCurrency(k.price)}</div>
          </div>
          <button type="button" data-kit-id="${id}" onclick="copyProposalLinkById(this.dataset.kitId, event)" class="btn btn-primary" aria-label="Gerar proposta para ${escapeHTML(k.name)}">
            <i data-lucide="file-text"></i> GERAR PROPOSTA
          </button>
        </div>
      </div>`;
  }).join('');

  const status = telhadoFora && !_pbCot.carregando
    ? pbAlertaHTML({ icone: 'home', titulo: `A ${info.nome} não tem estrutura pra esse telhado`, corpo: 'Escolha outro telhado pra cotar.' })
    : _pbCot.carregando
    ? `<p class="pbd-hint"><i data-lucide="loader-2" class="w-3 h-3 inline animate-spin"></i> Cotando na ${escapeHTML(info.nome)}… pode levar até 1 minuto.</p>`
    : _pbCot.erro ? pbIntegracaoAlertaHTML(_pbCot.erro)
    : (_pbCot.kits.length && !kits.length)
      ? pbAlertaHTML({
        icone: 'package-x', titulo: `Nenhum kit ${state.pbCategory === 'kitsMicro' ? 'com microinversor' : 'com inversor'} nesta cotação`,
        corpo: outrosTipos ? 'Troque o tipo de kit acima pra ver os outros.' : '',
      }) : '';
  // Opções que não saíram quando outras saíram (ou, pro admin, sempre: ele vê o motivo).
  // "Indisponível" só quando a distribuidora recusou o equipamento; sem resposta, pede pra tentar de novo.
  const semResposta = erros.filter((e) => pbCotErroTipo(e) !== 'recusado');
  const avisoOpcoes = erros.length && !_pbCot.carregando && (kits.length || state.isAdmin)
    ? pbAlertaHTML({
      icone: 'package-x', titulo: 'Algumas opções não saíram',
      corpo: `Não saíram agora: ${erros.map((e) => e.opcao + (state.isAdmin && e.erro ? ` (${e.erro})` : '')).join(', ')}. `
        + (semResposta.length === erros.length
          ? `A ${info.nome} não respondeu a tempo; cote de novo em alguns minutos.`
          : 'Pra esse equipamento, cote com outro módulo ou outro inversor.'),
    }) : '';

  return `
    <div class="pbd-sec">Cotar na ${escapeHTML(info.nome)}</div>
    <div class="pbd-fornecimento-fields pb-cot-campos">
      <label class="pbd-mes"><span>Quantidade de placas</span>
        <input id="pb-cot-placas" type="number" min="4" max="150" step="1" class="pbd-input" value="${escapeHTML(placas)}" oninput="_pbCot.placas=this.value" onchange="pbIntegracaoPlacas(this.value)" placeholder="Ex.: 13"></label>
      <label class="pbd-mes"><span>Telhado</span>
        <select id="pb-cot-telhado" class="pbd-input v2-select" data-titulo="Telhado" onchange="pbEstruturaEscolherValor(this.value)">${pbIntegracaoTelhadoOpcoesHTML(provedor)}</select></label>
      <button type="button" class="btn btn-primary" onclick="pbIntegracaoCotar()" ${_pbCot.carregando || telhadoFora ? 'disabled' : ''}>
        <i data-lucide="search"></i> Cotar kits</button>
    </div>
    ${status}
    ${cards ? `<div class="pbd-kits" style="margin-top:10px">${cards}</div>` : ''}
    ${avisoOpcoes}`;
}

async function pbIntegracaoCotar() {
  const provedor = pbIntegracaoAtual();
  if (!provedor || _pbCot.carregando) return;
  const placas = Math.round(Number(document.getElementById('pb-cot-placas')?.value || _pbCot.placas));
  if (!Number.isFinite(placas) || placas < 4 || placas > 150) { showToast('Informe de 4 a 150 placas.'); return; }
  _pbCot.placas = String(placas);
  const telhado = (typeof _pbEstrutura !== 'undefined' && _pbEstrutura.telhado) || 'ceramico';
  if (!pbIntegracaoTelhadoOk(provedor, telhado)) { showToast(`A ${INTEGRACOES_INFO[provedor]?.nome || provedor} não tem estrutura pra esse telhado.`); return; }
  const pedido = {
    acao: 'cotar', provedor, placas, telhado,
    tipo: state.pbCategory === 'kitsMicro' ? 'micro' : 'inversor', modulo: _pbCotSel.modulo || null, marca: _pbCotSel.marca || null,
  };
  const memoChave = JSON.stringify([_pbCot.chave, pedido]);
  const seq = ++_pbCotSeq;
  const cot = _pbCot;
  _pbCot.erro = ''; _pbCot.kits = []; _pbCot.cotadoEm = 0; _pbCot.telhado = telhado;
  if (typeof orcamentoLimparKit === 'function') orcamentoLimparKit();
  const memo = _pbCotMemo.get(memoChave);
  if (memo && Date.now() - memo.em < PB_COT_MEMO_MS) {
    Object.assign(_pbCot, { kits: memo.kits, erro: memo.erro, cotadoEm: memo.em });
    pbFornecimentoSync();
    return;
  }
  _pbCot.carregando = true;
  pbFornecimentoSync();
  try {
    const { data, error } = await invocarDistribuidoras(pedido);
    if (error) throw error;
    if (!data?.ok) throw new Error(data?.error || 'Não foi possível cotar agora.');
    if (seq !== _pbCotSeq || cot !== _pbCot || cot.telhado !== telhado) return; // a escolha mudou no meio: resposta velha não entra
    const kits = data.kits || [];
    let erro = '';
    // Nenhuma opção saiu: bloqueio mostra a pausa (com o horário); sem resposta pede pra tentar de novo;
    // só a recusa da distribuidora vira "kit indisponível".
    if (!kits.some((k) => !k.erro)) {
      const bloq = kits.find((k) => pbCotErroTipo(k) === 'bloqueio');
      const instavel = kits.find((k) => pbCotErroTipo(k) === 'instavel');
      erro = bloq?.erro || (instavel && !kits.some((k) => pbCotErroTipo(k) === 'recusado') ? instavel.erro : '')
        || 'Esse kit não está disponível no momento. Escolha outro módulo ou outro inversor e cote de novo.';
    }
    const em = Date.now();
    Object.assign(_pbCot, { kits, erro, cotadoEm: em });
    // Guarda só resultado firme: com pausa ou falta de resposta, a próxima tentativa consulta de novo.
    if (!kits.some((k) => k.erro && pbCotErroTipo(k) !== 'recusado')) _pbCotMemo.set(memoChave, { kits, erro, em });
  } catch (err) {
    console.error('[integrações] cotar', err);
    if (seq === _pbCotSeq && cot === _pbCot) _pbCot.erro = err?.message || 'Não foi possível cotar agora. Tente de novo.';
  } finally {
    cot.carregando = false;
    if (cot === _pbCot) pbFornecimentoSync();
  }
}

// Tipo do erro de uma opção (o servidor manda; resposta sem tipo, de versão antiga, deduz pelo texto).
function pbCotErroTipo(k) {
  if (k?.tipo) return k.tipo;
  const t = String(k?.erro || '');
  if (/recusando as consultas|pediu pra aguardar/i.test(t)) return 'bloqueio';
  if (/não concluiu a consulta|não foi possível falar|respondeu 5\d\d/i.test(t)) return 'instavel';
  return 'recusado';
}

// ------------------------------------------------------------------ admin
async function renderAdminDistribuidoras(container) {
  if (!_requireAdmin({ silent: true })) {
    container.innerHTML = '<div class="border border-red-600/40 bg-red-950/20 p-4 text-red-300 text-sm font-bold">Acesso restrito ao administrador.</div>';
    return;
  }
  container.innerHTML = `<div class="flex items-center justify-center py-12 text-neutral-600">
    <i data-lucide="loader-2" class="w-6 h-6 animate-spin mr-2"></i><span class="font-bold uppercase text-[10px] tracking-widest">Carregando...</span></div>`;
  lucide.createIcons();

  const { data, error } = await supabaseClient.rpc('integracoes_listar');
  if (error) {
    container.innerHTML = `<p class="text-red-500 text-sm font-bold p-4 border border-red-800 bg-red-900/10">Erro ao carregar: ${escapeHTML(error.message)}</p>`;
    return;
  }
  const porProvedor = new Map((data || []).map((i) => [i.provedor, i]));
  container.innerHTML = `
    <p class="text-neutral-500 text-xs mb-3">Conexões com as distribuidoras. No orçamento, ao escolher uma distribuidora conectada, a plataforma cota o kit nela e mostra ao vendedor só o preço já calculado.</p>
    <div class="flex flex-col gap-3">${['belenus', 'helte'].map((p) => _integracaoCard(p, porProvedor.get(p))).join('')}</div>`;
  lucide.createIcons();
}

const _INT_SELO = {
  neutro: 'text-neutral-300 border-neutral-700 bg-neutral-900/30',
  ok: 'text-green-400 border-green-800 bg-green-900/20',
  erro: 'text-red-400 border-red-800 bg-red-900/10',
  aviso: 'text-yellow-400 border-yellow-800 bg-yellow-900/20',
};
const _intSelo = (tom, txt) => `<span class="px-2 py-0.5 text-[8px] font-black uppercase border shrink-0 ${_INT_SELO[tom]}">${escapeHTML(txt)}</span>`;

function _integracaoStatus(i) {
  if (!i || !i.tem_senha) return _intSelo('neutro', 'Não conectada');
  if (i.status === 'conectada') return _intSelo('ok', 'Conectada');
  if (i.status === 'erro') return _intSelo('erro', 'Erro na conexão');
  return _intSelo('aviso', 'Não testada');
}

function _integracaoCard(provedor, i) {
  const info = INTEGRACOES_INFO[provedor];
  if (info.login === 'oauth') {
    return `
      <div class="bg-neutral-900/60 border border-neutral-800 p-4 flex flex-col gap-2">
        <div class="flex items-center justify-between gap-2">
          <span class="text-white font-black text-sm uppercase">${escapeHTML(info.nome)}</span>
          ${_intSelo('neutro', `Aguardando a ${info.nome}`)}
        </div>
        <p class="text-neutral-500 text-xs">${escapeHTML(info.descricao)}</p>
      </div>`;
  }
  const testado = i?.testado_em ? new Date(i.testado_em).toLocaleString('pt-BR') : '';
  return `
    <form class="bg-neutral-900/60 border border-neutral-800 p-4 flex flex-col gap-3" onsubmit="integracaoSalvar(event,'${provedor}')">
      <div class="flex items-center justify-between gap-2">
        <span class="text-white font-black text-sm uppercase">${escapeHTML(info.nome)}</span>
        ${_integracaoStatus(i)}
      </div>
      <p class="text-neutral-500 text-xs">${escapeHTML(info.descricao)}</p>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div><label class="${_labelCls}">Usuário (e-mail)</label>
          <input id="int-${provedor}-usuario" class="${_inputCls}" autocomplete="off" value="${escapeHTML(i?.usuario || '')}" placeholder="email@empresa.com.br"></div>
        <div><label class="${_labelCls}">Senha</label>
          <input id="int-${provedor}-senha" type="password" class="${_inputCls}" autocomplete="new-password" placeholder="${i?.tem_senha ? 'Guardada · digite só pra trocar' : 'Senha do portal'}"></div>
      </div>
      <label class="flex items-center gap-3 cursor-pointer">
        <input type="checkbox" id="int-${provedor}-ativo" ${i?.ativo === false ? '' : 'checked'} class="w-4 h-4 accent-red-500">
        <span class="text-white font-bold text-sm">Usar no orçamento</span>
      </label>
      ${i?.ultimo_erro ? `<p class="text-red-400 text-xs font-bold">Último erro: ${escapeHTML(i.ultimo_erro)}</p>` : ''}
      <div class="flex flex-wrap items-center gap-2">
        <button type="submit" class="btn btn-primary"><i data-lucide="save"></i>Salvar</button>
        <button type="button" class="btn btn-secondary" onclick="integracaoTestar('${provedor}', this)" ${i?.tem_senha ? '' : 'disabled'}><i data-lucide="plug-zap"></i>Testar conexão</button>
        ${testado ? `<span class="text-neutral-600 text-[11px]">Testada em ${escapeHTML(testado)}</span>` : ''}
      </div>
    </form>`;
}

async function integracaoSalvar(e, provedor) {
  e.preventDefault();
  if (!_requireAdmin()) return;
  const v = (k) => document.getElementById(`int-${provedor}-${k}`)?.value;
  const usuario = String(v('usuario') || '').trim();
  if (!usuario) { showToast('Informe o usuário.'); return; }
  const btn = e.submitter;
  if (btn) btn.disabled = true;
  const { error } = await supabaseClient.rpc('integracao_salvar', {
    p_provedor: provedor, p_usuario: usuario, p_senha: v('senha') || null,
    p_precificacao: null, p_ativo: document.getElementById(`int-${provedor}-ativo`)?.checked !== false,
  });
  if (btn) btn.disabled = false;
  if (error) { showToast('ERRO AO SALVAR: ' + error.message); return; }
  showToast('INTEGRAÇÃO SALVA');
  await carregarIntegracoesAtivas(true);
  if (typeof carregarCatalogoDistribuidoras === 'function') carregarCatalogoDistribuidoras(true);
  const c = document.getElementById('admin-section-content');
  if (c) renderAdminDistribuidoras(c);
}

async function integracaoTestar(provedor, btn) {
  if (!_requireAdmin()) return;
  const original = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i data-lucide="loader-2" class="animate-spin"></i>Testando...';
  lucide.createIcons();
  try {
    const { data, error } = await invocarDistribuidoras({ acao: 'testar', provedor });
    if (error) throw error;
    showToast(data?.ok ? `CONECTADA${data.conta ? ' · ' + data.conta : ''}` : `FALHOU: ${data?.error || 'sem resposta'}`);
  } catch (err) {
    showToast('FALHOU: ' + (err?.message || 'sem resposta'));
  }
  btn.disabled = false;
  btn.innerHTML = original;
  const c = document.getElementById('admin-section-content');
  if (c) renderAdminDistribuidoras(c);
}

Object.assign(window, {
  carregarIntegracoesAtivas, pbIntegracaoAtual, pbIntegracaoTelhados, pbIntegracaoTelhadoOk, pbIntegracaoTelhadoOpcoesHTML, pbIntegracaoPainelHTML, pbIntegracaoPreencherFiltros, pbIntegracaoAlertaHTML, pbAlertaHTML, pbIntegracaoEscolher, pbIntegracaoPlacas, pbIntegracaoCarregarOpcoes, pbIntegracaoCotar, pbCotacaoKits, pbAcharKit,
  renderAdminDistribuidoras, integracaoSalvar, integracaoTestar,
});
