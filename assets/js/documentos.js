// ==========================================
// GERAÇÃO DE DOCUMENTOS (.docx) — Procuração e Contrato
// ==========================================
// Modelos em assets/templates/documentos/*.docx com tags {campo} (docxtemplater).
// Uso:
//   const blob = await gerarDocumento('contrato', dados);
//   baixarDocumento(blob, 'CONTRATO - FULANO.docx');
// `dados` segue o formato de montarDadosDocumento() abaixo.
//
// Dados da empresa (contratada) e do procurador NÃO ficam aqui — o repositório
// é público. Vêm da tabela `documentos_config` (RLS: só a própria franquia).

const DOC_LIBS = {
  pizzip: 'https://cdn.jsdelivr.net/npm/pizzip@3.3.0/dist/pizzip.min.js',
  docxtemplater: 'https://cdn.jsdelivr.net/npm/docxtemplater@3.71.0/build/docxtemplater.min.js',
};

const DOC_MODELOS = {
  procuracao: {
    nome: 'Procuração (concessionária)',
    arquivo: 'assets/templates/documentos/procuracao.docx',
    prefixo: 'PROCURAÇÃO',
  },
  contrato: {
    nome: 'Contrato de compra, venda e instalação',
    arquivo: 'assets/templates/documentos/contrato-venda-instalacao.docx',
    prefixo: 'CONTRATO',
  },
};

// Versão dos modelos .docx (troque ao editar um modelo, para furar o cache)
const DOC_MODELOS_VERSAO = '20260922';

const DOC_DEFAULTS = {
  concessionaria: 'CPFL PAULISTA',
  prazo_entrega_dias: 90,
  nacionalidade: 'BRASILEIRO',
};

// Estado civil salvo como chave neutra; o texto sai concordando com o gênero
const DOC_ESTADO_CIVIL = {
  solteiro: ['SOLTEIRO', 'SOLTEIRA'],
  casado: ['CASADO', 'CASADA'],
  divorciado: ['DIVORCIADO', 'DIVORCIADA'],
  separado: ['SEPARADO JUDICIALMENTE', 'SEPARADA JUDICIALMENTE'],
  viuvo: ['VIÚVO', 'VIÚVA'],
  uniao_estavel: ['CONVIVENTE EM UNIÃO ESTÁVEL', 'CONVIVENTE EM UNIÃO ESTÁVEL'],
};

// ---------- formatação ----------
const _docDigits = (v) => String(v ?? '').replace(/\D/g, '');

function docFormatCPF(v) {
  const d = _docDigits(v);
  return d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : String(v ?? '').trim();
}

function docFormatCEP(v) {
  const d = _docDigits(v);
  return d.length === 8 ? d.replace(/(\d{5})(\d{3})/, '$1-$2') : String(v ?? '').trim();
}

function docFormatBRL(n) {
  return 'R$ ' + Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function docFormatKwp(n) {
  return Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// "Rua X, 301, Apto 2, Bairro, Cidade/UF - 00000-000" (aceita string pronta também)
function docFormatEndereco(e) {
  if (!e) return '';
  if (typeof e === 'string') return e.trim();
  const rua = [e.logradouro, e.numero, e.complemento, e.bairro].map((s) => String(s ?? '').trim()).filter(Boolean).join(', ');
  const cidade = [e.cidade, e.uf].filter(Boolean).join('/');
  const cep = docFormatCEP(e.cep);
  return [rua, cidade].filter(Boolean).join(', ') + (cep ? ' - ' + cep : '');
}

// ---------- valor por extenso (reais) ----------
function _docExtensoAte999(n) {
  const U = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
  const D = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
  const C = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];
  if (n === 100) return 'cem';
  const c = Math.floor(n / 100), r = n % 100;
  const parts = [];
  if (c) parts.push(C[c]);
  if (r < 20) { if (r) parts.push(U[r]); }
  else { parts.push(D[Math.floor(r / 10)] + (r % 10 ? ' e ' + U[r % 10] : '')); }
  return parts.join(' e ');
}

function _docExtensoInteiro(n) {
  if (n === 0) return 'zero';
  const escalas = [['', ''], ['mil', 'mil'], ['milhão', 'milhões'], ['bilhão', 'bilhões']];
  const grupos = [];
  while (n > 0) { grupos.push(n % 1000); n = Math.floor(n / 1000); }
  const partes = [];
  for (let i = grupos.length - 1; i >= 0; i--) {
    const g = grupos[i];
    if (!g) continue;
    let txt = (i === 1 && g === 1) ? '' : _docExtensoAte999(g);
    if (i > 0) txt = (txt ? txt + ' ' : '') + (g === 1 ? escalas[i][0] : escalas[i][1]);
    partes.push({ txt, g, i });
  }
  // conector "e": entre grupos quando o último grupo é < 100 ou centena exata
  return partes.reduce((acc, p, idx) => {
    if (idx === 0) return p.txt;
    const ultimo = idx === partes.length - 1;
    const usaE = ultimo && p.i === 0 && (p.g < 100 || p.g % 100 === 0);
    return acc + (usaE ? ' e ' : ' ') + p.txt;
  }, '');
}

function docValorPorExtenso(valor) {
  const total = Math.round(Number(valor || 0) * 100);
  const reais = Math.floor(total / 100), cent = total % 100;
  const out = [];
  if (reais) {
    const txt = _docExtensoInteiro(reais);
    const deReais = reais >= 1e6 && reais % 1e6 === 0;
    out.push(txt + (deReais ? ' de reais' : reais === 1 ? ' real' : ' reais'));
  }
  if (cent) out.push(_docExtensoInteiro(cent) + (cent === 1 ? ' centavo' : ' centavos'));
  return out.join(' e ') || 'zero reais';
}

// ---------- datas / ordinais ----------
const DOC_MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const DOC_ORDINAIS = ['primeiro', 'segundo', 'terceiro', 'quarto', 'quinto', 'sexto'];

function docDataExtenso(d) {
  const dt = d ? new Date(d) : new Date();
  return `${dt.getDate()} de ${DOC_MESES[dt.getMonth()]} de ${dt.getFullYear()}`;
}

// ---------- condições de pagamento (alíneas da Cláusula Segunda) ----------
// tipos: 'entrada' | 'chegada_material' | 'financiamento' | 'livre'
function docDescricaoPagamento(p) {
  const valor = `${docFormatBRL(p.valor)} (${docValorPorExtenso(p.valor)})`;
  const forma = p.forma || 'depósito/transferência bancária';
  switch (p.tipo) {
    case 'entrada':
      return `Pagamento no valor de ${valor}, a título de entrada, cujo vencimento se dará na assinatura do presente instrumento, devendo o pagamento ser realizado através de ${forma}`;
    case 'chegada_material':
      return `Pagamento do valor de ${valor}, a ser realizado pelo CONTRATANTE assim que ocorrer a chegada do material necessário para a execução do projeto, através de ${forma}`;
    case 'financiamento':
      return `O saldo remanescente, no valor de ${valor}, será pago por intermédio de financiamento bancário junto à ${p.financeira || 'instituição financeira'}, em parcela única, mediante o crédito do respectivo valor na conta de titularidade da CONTRATADA, conforme os prazos e condições estabelecidos entre o CONTRATANTE e a respectiva instituição financeira`;
    default:
      return String(p.texto || '').replace(/\{valor\}/g, valor).replace(/[.;]\s*$/, '');
  }
}

// ---------- montagem dos dados ----------
/*
  dados = {
    cliente: { nome, cpf, rg, rg_orgao, nacionalidade?, estado_civil, genero: 'M'|'F',
               endereco: { logradouro, numero, complemento?, bairro, cidade, uf, cep } | 'texto pronto' },
    instalacao: { endereco?  (padrão = endereço do cliente), numero_instalacao, concessionaria? },
    sistema: { potencia_kwp, itens: [{ quantidade, descricao }] },
    financeiro: { valor_total, valor_eletricista?, pagamentos: [{ tipo, valor, forma?, financeira?, texto? }] },
    prazo_entrega_dias?, data?,
    contratada: { nome, cnpj, endereco, foro, local_assinatura },     ← documentos_config
    procurador: { nome, cpf, rg, rg_orgao, crea, endereco, telefone }  ← documentos_config
  }
*/
function montarDadosDocumento(dados = {}) {
  const cli = dados.cliente || {};
  const inst = dados.instalacao || {};
  const sis = dados.sistema || {};
  const fin = dados.financeiro || {};
  const contratada = dados.contratada || {};
  const procurador = dados.procurador || {};
  const fem = String(cli.genero || '').toUpperCase().startsWith('F');
  const up = (s) => String(s ?? '').trim().toUpperCase();

  const valorTotal = Number(fin.valor_total || 0);
  const valorEletricista = Number(fin.valor_eletricista || 0);
  const pagamentos = (fin.pagamentos || []).filter((p) => p && (p.valor || p.texto));
  const temFinanciamento = pagamentos.some((p) => p.tipo === 'financiamento');
  const ord = DOC_ORDINAIS.slice(temFinanciamento ? 1 : 0);

  const clienteEndereco = docFormatEndereco(cli.endereco);

  return {
    // cliente
    cliente_nome: up(cli.nome),
    cliente_cpf: docFormatCPF(cli.cpf),
    cliente_rg: String(cli.rg ?? '').trim(),
    cliente_rg_orgao: up(cli.rg_orgao),
    cliente_nacionalidade: (() => {
      const n = up(cli.nacionalidade || DOC_DEFAULTS.nacionalidade);
      return fem && n === 'BRASILEIRO' ? 'BRASILEIRA' : n;
    })(),
    cliente_estado_civil: (DOC_ESTADO_CIVIL[cli.estado_civil] || [])[fem ? 1 : 0] || up(cli.estado_civil),
    cliente_endereco: clienteEndereco,
    portador: fem ? 'portadora' : 'portador',
    inscrito: fem ? 'inscrita' : 'inscrito',
    domiciliado: fem ? 'domiciliada' : 'domiciliado',
    denominado: fem ? 'denominada' : 'denominado',
    // instalação / concessionária
    instalacao_endereco: docFormatEndereco(inst.endereco) || clienteEndereco,
    numero_instalacao: String(inst.numero_instalacao ?? '').trim(),
    concessionaria: up(inst.concessionaria || DOC_DEFAULTS.concessionaria),
    // contratada
    contratada_nome: contratada.nome || '',
    contratada_cnpj: contratada.cnpj || '',
    contratada_endereco: contratada.endereco || '',
    foro: contratada.foro || '',
    local_assinatura: contratada.local_assinatura || '',
    data_extenso: docDataExtenso(dados.data),
    // procurador (procuração)
    procurador_nome: procurador.nome || '',
    procurador_cpf: procurador.cpf || '',
    procurador_rg: procurador.rg || '',
    procurador_rg_orgao: procurador.rg_orgao || '',
    procurador_crea: procurador.crea || '',
    procurador_endereco: procurador.endereco || '',
    procurador_telefone: procurador.telefone || '',
    // sistema
    potencia_kwp: docFormatKwp(sis.potencia_kwp),
    itens: (sis.itens || []).map((i) => ({ quantidade: String(i.quantidade ?? ''), descricao: String(i.descricao ?? '') })),
    // valores
    valor_total: docFormatBRL(valorTotal),
    valor_total_extenso: docValorPorExtenso(valorTotal),
    tem_eletricista: valorEletricista > 0,
    valor_projeto: docFormatBRL(valorTotal - valorEletricista),
    valor_projeto_extenso: docValorPorExtenso(valorTotal - valorEletricista),
    valor_eletricista: docFormatBRL(valorEletricista),
    valor_eletricista_extenso: docValorPorExtenso(valorEletricista),
    pagamentos: pagamentos.map((p, i) => ({
      letra: String.fromCharCode(97 + i),
      descricao: docDescricaoPagamento(p) + (i === pagamentos.length - 1 ? '.' : ';'),
    })),
    tem_financiamento: temFinanciamento,
    // "Parágrafo primeiro" (financiamento) só existe com financiamento; os demais são renumerados
    paragrafo_custos: ord[0],
    paragrafo_despesas: ord[1],
    paragrafo_forma_pagamento: ord[2],
    prazo_entrega_dias: String(dados.prazo_entrega_dias || DOC_DEFAULTS.prazo_entrega_dias),
  };
}

// Campos obrigatórios por modelo — retorna lista do que falta (vazio = ok)
const DOC_OBRIGATORIOS = {
  procuracao: ['cliente_nome', 'cliente_cpf', 'cliente_rg', 'cliente_endereco', 'numero_instalacao', 'procurador_nome'],
  contrato: ['cliente_nome', 'cliente_cpf', 'cliente_rg', 'cliente_estado_civil', 'cliente_endereco', 'potencia_kwp', 'valor_total', 'contratada_nome'],
};

function validarDadosDocumento(modelo, dados = {}) {
  const flat = montarDadosDocumento(dados);
  const faltando = (DOC_OBRIGATORIOS[modelo] || []).filter((k) => !flat[k] || flat[k] === '0,00' || flat[k] === 'R$ 0,00');
  if (modelo === 'contrato') {
    if (!flat.itens.length) faltando.push('itens');
    if (!flat.pagamentos.length) faltando.push('pagamentos');
    const soma = (dados.financeiro?.pagamentos || []).reduce((s, p) => s + Number(p?.valor || 0), 0);
    const total = Number(dados.financeiro?.valor_total || 0);
    if (flat.pagamentos.length && Math.abs(soma - total) > 0.009) faltando.push(`pagamentos (soma ${docFormatBRL(soma)} ≠ total ${docFormatBRL(total)})`);
  }
  return faltando;
}

// ---------- renderização ----------
const _docScriptCache = {};
function _docLoadScript(src) {
  if (!_docScriptCache[src]) {
    _docScriptCache[src] = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('Falha ao carregar ' + src));
      document.head.appendChild(s);
    });
  }
  return _docScriptCache[src];
}

async function gerarDocumento(modelo, dados) {
  const def = DOC_MODELOS[modelo];
  if (!def) throw new Error('Modelo de documento desconhecido: ' + modelo);
  await _docLoadScript(DOC_LIBS.pizzip);
  await _docLoadScript(DOC_LIBS.docxtemplater);

  const resp = await fetch(`${def.arquivo}?v=${DOC_MODELOS_VERSAO}`);
  if (!resp.ok) throw new Error('Modelo não encontrado: ' + def.arquivo);
  const zip = new window.PizZip(await resp.arrayBuffer());
  const doc = new window.docxtemplater(zip, { paragraphLoop: true, linebreaks: true, nullGetter: () => '' });
  doc.render(montarDadosDocumento(dados));
  return doc.getZip().generate({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    compression: 'DEFLATE',
  });
}

function nomeArquivoDocumento(modelo, dados) {
  const nome = String(dados?.cliente?.nome || 'CLIENTE').trim().toUpperCase().replace(/[\\/:*?"<>|]/g, '');
  return `${DOC_MODELOS[modelo]?.prefixo || 'DOCUMENTO'} - ${nome}.docx`;
}

function baixarDocumento(blob, nomeArquivo) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nomeArquivo;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Dados da empresa e do procurador (tabela documentos_config, 1 linha por franquia).
let _docConfigCache = null;
async function docCarregarConfig() {
  if (_docConfigCache && _docConfigCache.franquia_id === state.franquiaId) return _docConfigCache;
  const { data, error } = await supabaseClient
    .from('documentos_config')
    .select('franquia_id, contratada, procurador')
    .eq('franquia_id', state.franquiaId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Dados da empresa para documentos não cadastrados.');
  _docConfigCache = data;
  return data;
}

// ==========================================
// UI — modal "Documentos" da venda (CRM 360 → VENDAS). Só Ágil Solar Matriz.
// ==========================================

function canGerarDocumentos() {
  return typeof FRANQUIA_MATRIZ_ID !== 'undefined' && state.franquiaId === FRANQUIA_MATRIZ_ID;
}

// "55.000,00" | "55000" | "55000.5" → número
function docParseNum(v) {
  let s = String(v ?? '').replace(/[^\d,.-]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

const _docNumInput = (n) => (Number(n) ? Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '');

// "KIT 16 MOD. 590W + INV. HIB. SOFAR 6KW + 1 BATERIA DYNESS 5KW" → itens com quantidade
function docItensDoKit(nomeKit) {
  const base = String(nomeKit || '').split('·')[0].replace(/^\s*KIT\s+/i, '').trim();
  if (!base) return [];
  const expandir = (s) => s.replace(/\bINV\.\s*/i, 'INVERSOR ').replace(/\bHIB\.\s*/i, 'HÍBRIDO ').replace(/\s+/g, ' ').trim();
  const itens = [];
  let modulos = 0;
  for (const parte of base.split('+').map((p) => p.trim()).filter(Boolean)) {
    const mod = parte.match(/^(\d+)\s*(?:MOD\.?|MÓDULOS?|MODULOS?|PN|PAIN[EÉ]IS|PLACAS?)\s+(.*)$/i);
    const qtd = parte.match(/^(\d+)\s+(.*)$/);
    if (mod) {
      modulos += Number(mod[1]);
      itens.push({ quantidade: Number(mod[1]), descricao: `MÓDULO FOTOVOLTAICO ${expandir(mod[2])}` });
    } else if (qtd) {
      itens.push({ quantidade: Number(qtd[1]), descricao: expandir(qtd[2]) });
    } else {
      itens.push({ quantidade: 1, descricao: expandir(parte) });
    }
  }
  itens.push({ quantidade: 1, descricao: 'Quadro de proteção String Box CA' });
  itens.push({ quantidade: 1, descricao: `Conj. de Estr. p/ fixação de ${modulos || ''} módulos`.replace('de  módulos', 'dos módulos') });
  return itens;
}

function _docItensIniciais(venda, proposta) {
  const cfg = proposta?.custom_config?.itens;
  if (Array.isArray(cfg) && cfg.length) {
    // Item único "kit" (texto composto) → quebra em itens; senão usa como está
    if (cfg.length === 1 && String(cfg[0].descricao || '').includes('+')) return docItensDoKit(cfg[0].descricao);
    return cfg.map((i) => ({ quantidade: Number(i.qtd) || 1, descricao: String(i.descricao || '') }));
  }
  return docItensDoKit(venda?.kit_nome || proposta?.kit_nome);
}

// Propostas e vendas do cliente (mesma regra da ficha: cliente_id ou telefone),
// mais recentes primeiro. Cada uma pode servir de base para kit e valores.
function docFontesDoCliente(client) {
  const tel = _docDigits(client?.telefone);
  const doCliente = (row) => (row.cliente_id ? row.cliente_id === client.id : (tel && _docDigits(row.cliente_telefone) === tel));
  const recente = (a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''));
  const data = (iso) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '');
  const valor = (n) => (Number(n) ? ' · ' + docFormatBRL(n) : '');
  const vendas = (state.vendas || []).filter(doCliente).sort(recente).map((v) => ({
    id: 'venda:' + v.id,
    label: `Venda ${data(v.created_at)} · ${v.kit_nome || 'kit'}${valor(v.kit_price)}`,
    venda: v,
    proposta: v.proposta_id ? (state.propostas || []).find((p) => p.id === v.proposta_id) : null,
  }));
  const propostas = (state.propostas || []).filter(doCliente).sort(recente).map((p) => ({
    id: 'proposta:' + p.id,
    label: `Proposta ${data(p.created_at)} · ${p.kit_nome || 'personalizada'}${valor(p.custom_total_price || p.kit_price)}`,
    venda: null,
    proposta: p,
  }));
  return [...vendas, ...propostas];
}

// Kit, potência e valores a partir de uma fonte (venda/proposta) — ou vazio (manual)
function _docSistemaFinanceiro(fonte) {
  const v = fonte?.venda, p = fonte?.proposta;
  const total = Number(v?.kit_price || p?.custom_total_price || p?.kit_price || 0);
  return {
    sistema: {
      potencia_kwp: Number(v?.kit_power || p?.custom_system_power_kwp || p?.kit_power || 0),
      itens: fonte ? _docItensIniciais(v, p) : [],
    },
    financeiro: {
      valor_total: total,
      valor_eletricista: 0,
      pagamentos: total ? [{ tipo: 'entrada', valor: total }] : [],
    },
  };
}

// Monta o objeto `dados` (formato de montarDadosDocumento) a partir do que já existe.
// `salvo` = rascunho anterior (clientes.documentos_dados); kit/valores salvos só
// valem se a base escolhida for a mesma do rascunho.
function docDadosIniciais(client, fonte) {
  const salvo = client?.documentos_dados || {};
  const [cidade, ufCidade] = String(client?.cidade || '').split('/');
  const semVazios = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== ''));

  const endSalvo = (salvo.cliente && typeof salvo.cliente.endereco === 'object') ? salvo.cliente.endereco : {};
  const cliente = {
    ...(salvo.cliente || {}),
    ...semVazios({
      nome: client?.nome,
      cpf: client?.documento,
      rg: client?.rg,
      rg_orgao: client?.rg_orgao,
      estado_civil: client?.estado_civil,
      nacionalidade: client?.nacionalidade,
      genero: client?.genero,
    }),
  };
  cliente.endereco = {
    ...endSalvo,
    ...semVazios({
      logradouro: client?.endereco,
      numero: client?.numero,
      complemento: client?.complemento,
      bairro: client?.bairro,
      cep: client?.cep,
    }),
  };
  if (!cliente.endereco.cidade) cliente.endereco.cidade = (cidade || '').trim();
  if (!cliente.endereco.uf) cliente.endereco.uf = (client?.uf || ufCidade || '').trim();
  if (!cliente.rg_orgao) cliente.rg_orgao = 'SP/SSP';

  const origem = fonte ? fonte.id : 'manual';
  const base = (salvo.origem === origem && salvo.sistema) ? { sistema: salvo.sistema, financeiro: salvo.financeiro } : _docSistemaFinanceiro(fonte);
  return {
    origem,
    cliente,
    instalacao: { concessionaria: DOC_DEFAULTS.concessionaria, mesmo_endereco: true, ...(salvo.instalacao || {}) },
    sistema: base.sistema,
    financeiro: base.financeiro,
    prazo_entrega_dias: salvo.prazo_entrega_dias || DOC_DEFAULTS.prazo_entrega_dias,
    data: salvo.data || new Date().toISOString().slice(0, 10),
  };
}

let _docCtx = null; // { clientId, fontes, dados, config }

// Atalho da aba VENDAS: abre o formulário já baseado nessa venda
function abrirDocumentosVenda(vendaId) {
  const venda = (state.vendas || []).find((v) => v.id === vendaId);
  if (!venda) { showToast('Venda não encontrada.'); return; }
  const client = (state.clientes || []).find((c) => c.id === venda.cliente_id)
    || (state.clientes || []).find((c) => c.id === _crm360ClientIdAtual());
  if (!client) { showToast('Cliente da venda não encontrado.'); return; }
  return abrirDocumentosCliente(client.id, 'venda:' + vendaId);
}

function _crm360ClientIdAtual() {
  return typeof _crm360ClientId !== 'undefined' ? _crm360ClientId : null;
}

// Abre o formulário a partir do cliente — não precisa de venda.
// `origem` = 'venda:<id>' | 'proposta:<id>' | 'manual' | undefined (escolhe sozinho)
async function abrirDocumentosCliente(clientId, origem) {
  if (!canGerarDocumentos()) { showToast('Recurso disponível só para a Ágil Solar Matriz.'); return; }
  const client = (state.clientes || []).find((c) => c.id === clientId);
  if (!client) { showToast('Cliente não encontrado.'); return; }

  const fontes = docFontesDoCliente(client);
  const salvoOrigem = client.documentos_dados?.origem;
  const escolhida = origem || (fontes.some((f) => f.id === salvoOrigem) || salvoOrigem === 'manual' ? salvoOrigem : fontes[0]?.id);
  const fonte = fontes.find((f) => f.id === escolhida) || null;

  let config;
  try {
    config = await docCarregarConfig();
  } catch (err) {
    console.error('[documentos] Falha ao carregar documentos_config.', err);
    showToast('Não foi possível carregar os dados da empresa para os documentos.');
    return;
  }

  _docCtx = { clientId: client.id, fontes, dados: docDadosIniciais(client, fonte), config };

  document.getElementById('doc-overlay')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'doc-overlay';
  overlay.className = 'fixed inset-0 z-[98] flex items-center justify-center bg-black/90 backdrop-blur-md p-3 md:p-6';
  overlay.addEventListener('click', (e) => { if (e.target === overlay) fecharDocumentosVenda(); });
  document.body.appendChild(overlay);
  _docRender();
}

function fecharDocumentosVenda() {
  document.getElementById('doc-overlay')?.remove();
  _docCtx = null;
}

const _docInp = 'crm360-input';
function _docCampo(label, html, cls = '') {
  return `<div class="space-y-1 ${cls}"><label class="text-[9px] text-neutral-500 font-black uppercase tracking-widest">${label}</label>${html}</div>`;
}
function _docText(id, valor, extra = '') {
  return `<input id="${id}" value="${escapeHTML(String(valor ?? ''))}" class="${_docInp} ${extra}">`;
}
function _docSelect(id, valor, opcoes) {
  return `<select id="${id}" class="${_docInp}">${opcoes.map(([v, l]) => `<option value="${v}" ${String(valor ?? '') === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
}
function _docSecao(icone, titulo, corpo) {
  return `<section class="space-y-3">
    <p class="text-orange-500 text-[10px] font-black uppercase tracking-[0.3em] flex items-center gap-2"><i data-lucide="${icone}" class="w-3.5 h-3.5"></i> ${titulo}</p>
    ${corpo}
  </section>`;
}

const DOC_TIPOS_PAGAMENTO = [
  ['entrada', 'Entrada (na assinatura)'],
  ['chegada_material', 'Na chegada do material'],
  ['financiamento', 'Financiamento'],
  ['livre', 'Texto livre'],
];

function _docRender() {
  const overlay = document.getElementById('doc-overlay');
  if (!overlay || !_docCtx) return;
  const d = _docCtx.dados;
  const c = d.cliente, e = c.endereco || {}, inst = d.instalacao, sis = d.sistema, fin = d.financeiro;
  const ie = (inst.endereco && typeof inst.endereco === 'object') ? inst.endereco : {};
  const scrollAnterior = document.getElementById('doc-corpo')?.scrollTop || 0;

  const itensHTML = (sis.itens || []).map((it, i) => `
    <div class="flex gap-2 items-center">
      <input id="doc-item-qtd-${i}" value="${escapeHTML(String(it.quantidade ?? ''))}" class="${_docInp} w-16 text-center font-mono">
      <input id="doc-item-desc-${i}" value="${escapeHTML(String(it.descricao ?? ''))}" class="${_docInp} flex-1">
      <button type="button" onclick="_docRemover('itens', ${i})" title="Remover" class="btn btn-secondary btn-icon"><i data-lucide="trash-2"></i></button>
    </div>`).join('');

  const pagsHTML = (fin.pagamentos || []).map((p, i) => `
    <div class="border border-neutral-800 p-3 space-y-2">
      <div class="flex gap-2 items-center">
        <span class="text-orange-500 font-black text-xs w-5">${String.fromCharCode(97 + i)})</span>
        ${_docSelect(`doc-pag-tipo-${i}`, p.tipo, DOC_TIPOS_PAGAMENTO).replace('class="', 'onchange="_docLer(); _docRender()" class="flex-1 ')}
        <input id="doc-pag-valor-${i}" value="${_docNumInput(p.valor)}" oninput="_docAtualizarSoma()" placeholder="Valor" class="${_docInp} w-32 font-mono text-right">
        <button type="button" onclick="_docRemover('pagamentos', ${i})" title="Remover" class="btn btn-secondary btn-icon"><i data-lucide="trash-2"></i></button>
      </div>
      ${p.tipo === 'financiamento'
        ? _docText(`doc-pag-fin-${i}`, p.financeira, '" placeholder="Financeira (ex.: SOLAGORA)')
        : p.tipo === 'livre'
          ? `<textarea id="doc-pag-texto-${i}" rows="2" placeholder="Use {valor} onde entra o valor por extenso" class="${_docInp}">${escapeHTML(p.texto || '')}</textarea>`
          : _docText(`doc-pag-forma-${i}`, p.forma, '" placeholder="Forma (padrão: depósito/transferência bancária)')}
    </div>`).join('');

  overlay.innerHTML = `
    <div class="bg-neutral-900 border-2 border-orange-600/40 w-full max-w-3xl max-h-full flex flex-col ${_docCtx.animado ? '' : 'animate-fade-in-up'}">
      <div class="flex justify-between items-center p-5 border-b border-neutral-800 bg-neutral-950 shrink-0">
        <div>
          <p class="text-orange-500 text-xs font-black uppercase tracking-[0.2em] flex items-center gap-2"><i data-lucide="file-signature" class="w-4 h-4"></i> Contrato e procuração</p>
          <p class="text-neutral-500 text-[10px] font-mono mt-1">${escapeHTML(c.nome || '')}</p>
        </div>
        <button onclick="fecharDocumentosVenda()" class="text-neutral-500 hover:text-white"><i data-lucide="x" class="w-5 h-5"></i></button>
      </div>

      <div id="doc-corpo" class="p-5 space-y-6 overflow-y-auto flex-1 min-h-0">
        ${_docCampo('Kit e valores com base em', `<select id="doc-origem" onchange="_docTrocarOrigem(this.value)" class="${_docInp}">
          ${_docCtx.fontes.map((f) => `<option value="${f.id}" ${d.origem === f.id ? 'selected' : ''}>${escapeHTML(f.label)}</option>`).join('')}
          <option value="manual" ${d.origem === 'manual' ? 'selected' : ''}>Preencher manualmente</option>
        </select>`)}

        ${_docSecao('user', 'Cliente', `
          <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
            ${_docCampo('Nome completo', _docText('doc-nome', c.nome, 'uppercase'), 'col-span-2 md:col-span-4')}
            ${_docCampo('CPF', _docText('doc-cpf', c.cpf, 'font-mono'))}
            ${_docCampo('RG', _docText('doc-rg', c.rg, 'font-mono'))}
            ${_docCampo('Órgão emissor', _docText('doc-rg-orgao', c.rg_orgao, 'uppercase'))}
            ${_docCampo('Gênero', _docSelect('doc-genero', c.genero, [['', '—'], ['M', 'Masculino'], ['F', 'Feminino']]))}
            ${_docCampo('Estado civil', _docSelect('doc-estado-civil', c.estado_civil, [['', '—'], ['solteiro', 'Solteiro(a)'], ['casado', 'Casado(a)'], ['divorciado', 'Divorciado(a)'], ['separado', 'Separado(a) judicialmente'], ['viuvo', 'Viúvo(a)'], ['uniao_estavel', 'União estável']]))}
            ${_docCampo('Nacionalidade', _docText('doc-nacionalidade', c.nacionalidade, 'uppercase" placeholder="BRASILEIRO(A)'))}
            ${_docCampo('Rua / Av.', _docText('doc-end-logradouro', e.logradouro), 'col-span-2')}
            ${_docCampo('Número', _docText('doc-end-numero', e.numero))}
            ${_docCampo('Complemento', _docText('doc-end-complemento', e.complemento))}
            ${_docCampo('Bairro', _docText('doc-end-bairro', e.bairro), 'col-span-2')}
            ${_docCampo('Cidade', _docText('doc-end-cidade', e.cidade))}
            ${_docCampo('UF', _docText('doc-end-uf', e.uf, 'uppercase'))}
            ${_docCampo('CEP', _docText('doc-end-cep', e.cep, 'font-mono'))}
          </div>`)}

        ${_docSecao('plug-zap', 'Instalação', `
          <div class="grid grid-cols-2 gap-3">
            ${_docCampo('Nº da instalação (UC)', _docText('doc-uc', inst.numero_instalacao, 'font-mono'))}
            ${_docCampo('Concessionária', _docText('doc-concessionaria', inst.concessionaria, 'uppercase'))}
          </div>
          <label class="flex items-center gap-2 text-xs text-neutral-400 cursor-pointer">
            <input id="doc-mesmo-endereco" type="checkbox" ${inst.mesmo_endereco !== false ? 'checked' : ''} onchange="_docLer(); _docRender()"> Usina no mesmo endereço do cliente
          </label>
          ${inst.mesmo_endereco === false ? `
          <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
            ${_docCampo('Rua / Av.', _docText('doc-inst-logradouro', ie.logradouro), 'col-span-2')}
            ${_docCampo('Número', _docText('doc-inst-numero', ie.numero))}
            ${_docCampo('Bairro', _docText('doc-inst-bairro', ie.bairro))}
            ${_docCampo('Cidade', _docText('doc-inst-cidade', ie.cidade), 'col-span-2')}
            ${_docCampo('UF', _docText('doc-inst-uf', ie.uf, 'uppercase'))}
            ${_docCampo('CEP', _docText('doc-inst-cep', ie.cep, 'font-mono'))}
          </div>` : ''}`)}

        ${_docSecao('sun', 'Sistema', `
          <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
            ${_docCampo('Potência (kWp)', _docText('doc-kwp', sis.potencia_kwp ? String(sis.potencia_kwp).replace('.', ',') : '', 'font-mono'))}
          </div>
          <div class="space-y-2">
            <div class="flex gap-2 text-[9px] text-neutral-500 font-black uppercase tracking-widest"><span class="w-16 text-center">Qtd.</span><span>Descrição (anexo I)</span></div>
            ${itensHTML}
            <button type="button" onclick="_docAdicionar('itens')" class="btn btn-secondary btn-sm"><i data-lucide="plus"></i> Item</button>
          </div>`)}

        ${_docSecao('wallet', 'Valores e pagamento', `
          <div class="grid grid-cols-2 gap-3">
            ${_docCampo('Valor total (R$)', `<input id="doc-total" value="${_docNumInput(fin.valor_total)}" oninput="_docAtualizarSoma()" class="${_docInp} font-mono text-right">`)}
            ${_docCampo('Eletricista (R$, opcional)', `<input id="doc-eletricista" value="${_docNumInput(fin.valor_eletricista)}" class="${_docInp} font-mono text-right">`)}
          </div>
          <div class="space-y-2">
            ${pagsHTML}
            <div class="flex items-center justify-between gap-2 flex-wrap">
              <button type="button" onclick="_docAdicionar('pagamentos')" class="btn btn-secondary btn-sm"><i data-lucide="plus"></i> Condição de pagamento</button>
              <span id="doc-soma" class="text-[10px] font-mono"></span>
            </div>
          </div>`)}

        ${_docSecao('calendar', 'Prazo e data', `
          <div class="grid grid-cols-2 gap-3">
            ${_docCampo('Prazo de entrega (dias)', `<input id="doc-prazo" type="number" min="1" value="${escapeHTML(String(d.prazo_entrega_dias || ''))}" class="${_docInp} font-mono">`)}
            ${_docCampo('Data do contrato', `<input id="doc-data" type="date" value="${escapeHTML(String(d.data || ''))}" class="${_docInp} font-mono">`)}
          </div>`)}
      </div>

      <div class="p-5 border-t border-neutral-800 bg-neutral-950 flex flex-col sm:flex-row gap-2 shrink-0">
        <button id="doc-btn-contrato" onclick="_docGerar('contrato')" class="btn btn-primary flex-1"><i data-lucide="file-text"></i> Gerar contrato</button>
        <button id="doc-btn-procuracao" onclick="_docGerar('procuracao')" class="btn btn-secondary flex-1"><i data-lucide="file-pen"></i> Gerar procuração</button>
      </div>
    </div>`;

  _docCtx.animado = true;
  document.getElementById('doc-corpo').scrollTop = scrollAnterior;
  _docAtualizarSoma();
  lucide.createIcons();
}

// Lê o formulário de volta para _docCtx.dados
function _docLer() {
  if (!_docCtx) return;
  const val = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : undefined; };
  const d = _docCtx.dados;
  d.cliente = {
    nome: (val('doc-nome') || '').toUpperCase(),
    cpf: val('doc-cpf'),
    rg: val('doc-rg'),
    rg_orgao: (val('doc-rg-orgao') || '').toUpperCase(),
    genero: val('doc-genero'),
    estado_civil: val('doc-estado-civil'),
    nacionalidade: (val('doc-nacionalidade') || '').toUpperCase(),
    endereco: {
      logradouro: val('doc-end-logradouro'),
      numero: val('doc-end-numero'),
      complemento: val('doc-end-complemento'),
      bairro: val('doc-end-bairro'),
      cidade: val('doc-end-cidade'),
      uf: (val('doc-end-uf') || '').toUpperCase(),
      cep: val('doc-end-cep'),
    },
  };
  const mesmo = document.getElementById('doc-mesmo-endereco')?.checked !== false;
  const instAnterior = d.instalacao || {};
  d.instalacao = {
    numero_instalacao: val('doc-uc'),
    concessionaria: (val('doc-concessionaria') || '').toUpperCase(),
    mesmo_endereco: mesmo,
    endereco: document.getElementById('doc-inst-logradouro')
      ? {
          logradouro: val('doc-inst-logradouro'),
          numero: val('doc-inst-numero'),
          bairro: val('doc-inst-bairro'),
          cidade: val('doc-inst-cidade'),
          uf: (val('doc-inst-uf') || '').toUpperCase(),
          cep: val('doc-inst-cep'),
        }
      : instAnterior.endereco,
  };
  const itens = [];
  for (let i = 0; document.getElementById(`doc-item-desc-${i}`); i++) {
    itens.push({ quantidade: val(`doc-item-qtd-${i}`), descricao: val(`doc-item-desc-${i}`) });
  }
  d.sistema = { potencia_kwp: docParseNum(val('doc-kwp')), itens };
  const pagamentos = [];
  for (let i = 0; document.getElementById(`doc-pag-tipo-${i}`); i++) {
    const anterior = (d.financeiro?.pagamentos || [])[i] || {};
    pagamentos.push({
      tipo: val(`doc-pag-tipo-${i}`),
      valor: docParseNum(val(`doc-pag-valor-${i}`)),
      forma: val(`doc-pag-forma-${i}`) ?? anterior.forma,
      financeira: (val(`doc-pag-fin-${i}`) ?? anterior.financeira ?? '').toUpperCase(),
      texto: val(`doc-pag-texto-${i}`) ?? anterior.texto,
    });
  }
  d.financeiro = {
    valor_total: docParseNum(val('doc-total')),
    valor_eletricista: docParseNum(val('doc-eletricista')),
    pagamentos,
  };
  d.prazo_entrega_dias = Number(val('doc-prazo')) || DOC_DEFAULTS.prazo_entrega_dias;
  d.data = val('doc-data') || new Date().toISOString().slice(0, 10);
}

// Troca a base: mantém cliente/instalação/prazo, refaz kit e valores
function _docTrocarOrigem(origem) {
  _docLer();
  const fonte = _docCtx.fontes.find((f) => f.id === origem) || null;
  Object.assign(_docCtx.dados, { origem: fonte ? fonte.id : 'manual' }, _docSistemaFinanceiro(fonte));
  _docRender();
}

function _docAdicionar(lista) {
  _docLer();
  const d = _docCtx.dados;
  if (lista === 'itens') d.sistema.itens.push({ quantidade: 1, descricao: '' });
  else {
    const soma = d.financeiro.pagamentos.reduce((s, p) => s + Number(p.valor || 0), 0);
    d.financeiro.pagamentos.push({ tipo: 'financiamento', valor: Math.max(0, d.financeiro.valor_total - soma) });
  }
  _docRender();
}

function _docRemover(lista, i) {
  _docLer();
  const d = _docCtx.dados;
  (lista === 'itens' ? d.sistema.itens : d.financeiro.pagamentos).splice(i, 1);
  _docRender();
}

function _docAtualizarSoma() {
  const el = document.getElementById('doc-soma');
  if (!el) return;
  const total = docParseNum(document.getElementById('doc-total')?.value);
  let soma = 0;
  for (let i = 0; document.getElementById(`doc-pag-valor-${i}`); i++) soma += docParseNum(document.getElementById(`doc-pag-valor-${i}`).value);
  const ok = Math.abs(soma - total) < 0.01;
  el.className = `text-[10px] font-mono ${ok ? 'text-green-400' : 'text-yellow-400'}`;
  el.textContent = ok ? `Soma ${docFormatBRL(soma)} ✓` : `Soma ${docFormatBRL(soma)} · falta ${docFormatBRL(total - soma)}`;
}

// Dados que o montador recebe: formulário + empresa/procurador do banco
// (instalação usa o endereço do cliente quando "mesmo endereço")
function _docDadosParaGerar() {
  const d = JSON.parse(JSON.stringify(_docCtx.dados));
  if (d.instalacao.mesmo_endereco !== false) delete d.instalacao.endereco;
  d.data = d.data ? `${d.data}T12:00:00` : undefined;
  d.contratada = _docCtx.config?.contratada || {};
  d.procurador = _docCtx.config?.procurador || {};
  return d;
}

const DOC_ROTULOS = {
  cliente_nome: 'nome', cliente_cpf: 'CPF', cliente_rg: 'RG', cliente_estado_civil: 'estado civil',
  cliente_endereco: 'endereço', numero_instalacao: 'nº da instalação', potencia_kwp: 'potência',
  valor_total: 'valor total', itens: 'itens', pagamentos: 'condições de pagamento',
  contratada_nome: 'dados da empresa (documentos_config)', procurador_nome: 'dados do procurador (documentos_config)',
};

// Salva dados pessoais em `clientes` e o formulário em `clientes.documentos_dados`
async function _docSalvar() {
  const d = _docCtx.dados;
  const c = d.cliente, e = c.endereco || {};
  const clientePayload = {
    documento: c.cpf || null,
    rg: c.rg || null,
    rg_orgao: c.rg_orgao || null,
    genero: c.genero || null,
    estado_civil: c.estado_civil || null,
    nacionalidade: c.nacionalidade || null,
    endereco: e.logradouro || null,
    numero: e.numero || null,
    complemento: e.complemento || null,
    bairro: e.bairro || null,
    cep: e.cep || null,
    documentos_dados: JSON.parse(JSON.stringify(d)),
  };
  const { error } = await supabaseClient.from('clientes').update(clientePayload).eq('id', _docCtx.clientId);
  if (error) {
    console.warn('[documentos] Falha ao salvar dados do contrato.', error);
    return false;
  }
  const client = (state.clientes || []).find((x) => x.id === _docCtx.clientId);
  if (client) Object.assign(client, clientePayload);
  return true;
}

async function _docGerar(modelo) {
  if (!_docCtx) return;
  _docLer();
  const dados = _docDadosParaGerar();
  const faltando = validarDadosDocumento(modelo, dados);
  if (faltando.length) {
    showToast('Falta preencher: ' + faltando.map((k) => DOC_ROTULOS[k] || k).join(', '));
    return;
  }
  const btn = document.getElementById(modelo === 'contrato' ? 'doc-btn-contrato' : 'doc-btn-procuracao');
  const html = btn?.innerHTML;
  if (btn) { btn.disabled = true; btn.innerHTML = '<i data-lucide="loader-2" class="animate-spin"></i> Gerando...'; lucide.createIcons(); }
  try {
    const blob = await gerarDocumento(modelo, dados);
    baixarDocumento(blob, nomeArquivoDocumento(modelo, dados));
    const salvo = await _docSalvar();
    const nome = modelo === 'contrato' ? 'CONTRATO GERADO' : 'PROCURAÇÃO GERADA';
    showToast(salvo ? nome + '!' : nome + ', mas os dados não foram salvos.');
  } catch (err) {
    console.error('[documentos] Falha ao gerar.', err);
    showToast('Erro ao gerar o documento: ' + (err.message || err));
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = html; lucide.createIcons(); }
  }
}

if (typeof module !== 'undefined') {
  module.exports = { DOC_MODELOS, DOC_DEFAULTS, montarDadosDocumento, validarDadosDocumento, docValorPorExtenso, docFormatEndereco };
}
