// ==========================================
// GERAÇÃO DE DOCUMENTOS (.docx) — Contrato e Procuração, PF e PJ
// ==========================================
// Modelos em assets/templates/documentos/*.docx com tags {campo} (docxtemplater).
// Uso:
//   const blob = await gerarDocumento('contrato_pf', dados);
//   baixarDocumento(blob, nomeArquivoDocumento('contrato_pf', dados));
// `dados` segue o formato de montarDadosDocumento() abaixo.
//
// Dados da empresa (contratada) e do procurador NÃO ficam aqui — o repositório
// é público. Vêm da tabela `documentos_config` (RLS: admin/gestor da própria franquia).

const DOC_LIBS = {
  pizzip: 'https://cdn.jsdelivr.net/npm/pizzip@3.3.0/dist/pizzip.min.js',
  docxtemplater: 'https://cdn.jsdelivr.net/npm/docxtemplater@3.71.0/build/docxtemplater.min.js',
};

const DOC_PASTA = 'assets/templates/documentos/';
const DOC_MODELOS = {
  contrato_pf:   { nome: 'Contrato (pessoa física)',   arquivo: DOC_PASTA + 'contrato-pf.docx',   prefixo: 'CONTRATO' },
  contrato_pj:   { nome: 'Contrato (pessoa jurídica)', arquivo: DOC_PASTA + 'contrato-pj.docx',   prefixo: 'CONTRATO' },
  procuracao_pf: { nome: 'Procuração (pessoa física)',   arquivo: DOC_PASTA + 'procuracao-pf.docx', prefixo: 'PROCURAÇÃO' },
  procuracao_pj: { nome: 'Procuração (pessoa jurídica)', arquivo: DOC_PASTA + 'procuracao-pj.docx', prefixo: 'PROCURAÇÃO' },
};

// Versão dos modelos .docx (troque ao editar um modelo, para furar o cache)
const DOC_MODELOS_VERSAO = '20260922-pfpj';

const DOC_DEFAULTS = {
  concessionaria: 'CPFL PAULISTA',
  prazo_entrega_dias: 90,
  nacionalidade: 'BRASILEIRO',
  forma_pagamento: 'PIX',
};

// Condições de pagamento prontas (preenchem as alíneas da Cláusula Segunda)
const DOC_CONDICOES = [
  ['avista', 'À vista'],
  ['70_30', '70% entrada + 30% na entrega do material'],
  ['financiamento', 'Financiamento (valor total)'],
  ['entrada_financiamento', 'Entrada + financiamento'],
  ['personalizada', 'Personalizada'],
];

const DOC_TELHADOS = ['Telha Colonial', 'Telha Cerâmica', 'Telha de Fibrocimento', 'Telha Metálica', 'Laje', 'Solo'];

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

// CPF (11 dígitos) ou CNPJ (14 dígitos)
function docFormatDocumento(v) {
  const d = _docDigits(v);
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return docFormatCPF(v);
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
const _docArred = (n) => Math.round(Number(n || 0) * 100) / 100;

// Linhas de pagamento de uma condição pronta
function docPagamentosDaCondicao(condicao, total) {
  const t = _docArred(total);
  switch (condicao) {
    case 'avista': return [{ tipo: 'entrada', valor: t }];
    case '70_30': {
      const entrada = _docArred(t * 0.7);
      return [{ tipo: 'entrada', valor: entrada }, { tipo: 'chegada_material', valor: _docArred(t - entrada) }];
    }
    case 'financiamento': return [{ tipo: 'financiamento', valor: t }];
    case 'entrada_financiamento': return [{ tipo: 'entrada', valor: 0 }, { tipo: 'financiamento', valor: t }];
    default: return null; // personalizada: mantém o que está
  }
}

// Textos dos modelos oficiais (à vista / 70-30 / financiamento)
// tipos: 'entrada' | 'chegada_material' | 'financiamento' | 'livre'
function docDescricaoPagamento(p, unico) {
  const valor = `${docFormatBRL(p.valor)} (${docValorPorExtenso(p.valor)})`;
  const forma = `depósito/ transferência/ ${p.forma || DOC_DEFAULTS.forma_pagamento}`;
  switch (p.tipo) {
    case 'entrada':
      return `Pagamento no valor certo e ajustado de ${valor}${unico ? '' : ', como entrada'}, cujo vencimento se dará na assinatura da presente minuta, devendo o pagamento em questão ser realizado através de ${forma}.`;
    case 'chegada_material':
      return `Pagamento no valor certo e ajustado de ${valor}, cujo vencimento se dará após a entrega do material, devendo o pagamento em questão ser realizado através de ${forma}.`;
    case 'financiamento':
      return `O saldo remanescente, no valor de ${valor}, será pago por intermédio de financiamento bancário junto à ${p.financeira || 'instituição financeira'}, em parcela única, mediante o crédito do respectivo valor na conta de titularidade da CONTRATADA, conforme os prazos e condições estabelecidos entre o CONTRATANTE e a respectiva instituição financeira.`;
    default: {
      const t = String(p.texto || '').replace(/\{valor\}/g, valor).trim();
      return t && !/[.;]$/.test(t) ? t + '.' : t;
    }
  }
}

// ---------- montagem dos dados ----------
/*
  dados = {
    tipo_pessoa: 'PF' | 'PJ', condicao,
    cliente: { nome (PJ: razão social), cpf (PF: CPF / PJ: CNPJ), rg, rg_orgao, nacionalidade?, estado_civil,
               profissao, genero: 'M'|'F',
               endereco: { logradouro, numero, complemento?, bairro, cidade, uf, cep } | 'texto pronto',
               representante?: { nome, cpf, rg, rg_orgao, genero, estado_civil, nacionalidade, profissao,
                                 mesmo_endereco, endereco } },          ← só PJ
    instalacao: { endereco?  (padrão = endereço do cliente), numero_instalacao, concessionaria?, telhado? },
    sistema: { potencia_kwp, itens: [{ quantidade, descricao }] },
    financeiro: { valor_total, valor_eletricista?, pagamentos: [{ tipo, valor, forma?, financeira?, texto? }] },
    prazo_entrega_dias?, data?,
    contratada: { nome, cnpj, endereco, foro, local_assinatura },     ← documentos_config
    procurador: { nome, cpf, rg, rg_orgao, crea, endereco, telefone }  ← documentos_config
  }
*/
function montarDadosDocumento(dados = {}) {
  const pj = dados.tipo_pessoa === 'PJ';
  const cli = dados.cliente || {};
  const rep = cli.representante || {};
  const inst = dados.instalacao || {};
  const sis = dados.sistema || {};
  const fin = dados.financeiro || {};
  const contratada = dados.contratada || {};
  const procurador = dados.procurador || {};
  const up = (s) => String(s ?? '').trim().toUpperCase();

  // Quem é qualificado no texto (PF: o cliente; PJ: o representante legal)
  const pessoa = pj ? rep : cli;
  const fem = String(pessoa.genero || '').toUpperCase().startsWith('F');
  const estadoCivil = (p, f) => (DOC_ESTADO_CIVIL[p.estado_civil] || [])[f ? 1 : 0] || up(p.estado_civil);
  const nacionalidade = (p, f) => {
    const n = up(p.nacionalidade || DOC_DEFAULTS.nacionalidade);
    return f && n === 'BRASILEIRO' ? 'BRASILEIRA' : n;
  };
  const qualificacao = (p, f) => [nacionalidade(p, f), estadoCivil(p, f), up(p.profissao)].filter(Boolean).join(', ');
  const repFem = String(rep.genero || '').toUpperCase().startsWith('F');
  const cliFem = String(cli.genero || '').toUpperCase().startsWith('F');

  const valorTotal = Number(fin.valor_total || 0);
  const valorEletricista = Number(fin.valor_eletricista || 0);
  const pagamentos = (fin.pagamentos || []).filter((p) => p && (Number(p.valor) || p.texto));
  const temFinanciamento = pagamentos.some((p) => p.tipo === 'financiamento');
  const soFinanciamento = pagamentos.length === 1 && pagamentos[0].tipo === 'financiamento';
  const ord = DOC_ORDINAIS.slice(temFinanciamento ? 1 : 0);

  // Financiamento do valor total: texto corrido do modelo, sem alíneas
  const clausula2Forma = soFinanciamento
    ? `por intermédio de financiamento bancário junto a ${pagamentos[0].financeira || 'instituição financeira'}, em parcela única a ser creditada na conta de titularidade da CONTRATADA, conforme prazo negociado diretamente entre o CONTRATANTE e a respectiva instituição financeira.`
    : 'da seguinte forma:';
  const alineas = soFinanciamento ? [] : pagamentos.map((p, i) => ({
    letra: String.fromCharCode(97 + i),
    descricao: docDescricaoPagamento(p, pagamentos.length === 1),
  }));

  const clienteEndereco = docFormatEndereco(cli.endereco);
  const telhado = String(inst.telhado || '').trim();

  return {
    // cliente (PF: pessoa / PJ: empresa)
    cliente_nome: up(cli.nome),
    cliente_documento: docFormatDocumento(cli.cpf),
    cliente_cpf: docFormatDocumento(cli.cpf),
    cliente_rg: String(cli.rg ?? '').trim(),
    cliente_rg_orgao: up(cli.rg_orgao),
    cliente_nacionalidade: nacionalidade(cli, cliFem),
    cliente_estado_civil: estadoCivil(cli, cliFem),
    cliente_profissao: up(cli.profissao),
    cliente_qualificacao: qualificacao(cli, cliFem),
    cliente_endereco: clienteEndereco,
    // representante legal (PJ)
    representante_nome: up(rep.nome),
    representante_cpf: docFormatCPF(rep.cpf),
    representante_rg: String(rep.rg ?? '').trim(),
    representante_rg_orgao: up(rep.rg_orgao),
    representante_profissao: up(rep.profissao),
    representante_qualificacao: qualificacao(rep, repFem),
    representante_endereco: rep.mesmo_endereco === false ? docFormatEndereco(rep.endereco) : clienteEndereco,
    // concordância de quem é qualificado
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
    // sistema (a estrutura ganha o tipo de telhado)
    potencia_kwp: docFormatKwp(sis.potencia_kwp),
    itens: (sis.itens || []).map((i) => {
      let descricao = String(i.descricao ?? '');
      if (telhado && /^Conj\. de Estr/i.test(descricao) && !descricao.includes('(')) descricao += ` (${telhado})`;
      return { quantidade: String(i.quantidade ?? ''), descricao };
    }),
    // valores
    valor_total: docFormatBRL(valorTotal),
    valor_total_extenso: docValorPorExtenso(valorTotal),
    tem_eletricista: valorEletricista > 0,
    valor_projeto: docFormatBRL(valorTotal - valorEletricista),
    valor_projeto_extenso: docValorPorExtenso(valorTotal - valorEletricista),
    valor_eletricista: docFormatBRL(valorEletricista),
    valor_eletricista_extenso: docValorPorExtenso(valorEletricista),
    clausula2_forma: clausula2Forma,
    pagamentos: alineas,
    tem_alineas: alineas.length > 0,
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
  contrato_pf: ['cliente_nome', 'cliente_documento', 'cliente_rg', 'cliente_estado_civil', 'cliente_endereco', 'potencia_kwp', 'valor_total', 'contratada_nome'],
  contrato_pj: ['cliente_nome', 'cliente_documento', 'cliente_endereco', 'representante_nome', 'representante_cpf', 'representante_rg', 'potencia_kwp', 'valor_total', 'contratada_nome'],
  procuracao_pf: ['cliente_nome', 'cliente_documento', 'cliente_rg', 'cliente_endereco', 'numero_instalacao', 'procurador_nome'],
  procuracao_pj: ['cliente_nome', 'cliente_documento', 'cliente_endereco', 'representante_nome', 'representante_cpf', 'numero_instalacao', 'procurador_nome'],
};

function validarDadosDocumento(modelo, dados = {}) {
  const flat = montarDadosDocumento(dados);
  const faltando = (DOC_OBRIGATORIOS[modelo] || []).filter((k) => !flat[k] || flat[k] === '0,00' || flat[k] === 'R$ 0,00');
  const digitos = _docDigits(dados.cliente?.cpf).length;
  if (flat.cliente_documento && modelo.endsWith('_pf') && digitos !== 11) faltando.push('CPF válido (11 dígitos)');
  if (flat.cliente_documento && modelo.endsWith('_pj') && digitos !== 14) faltando.push('CNPJ válido (14 dígitos)');
  if (modelo.startsWith('contrato')) {
    if (!flat.itens.length) faltando.push('itens');
    const pags = (dados.financeiro?.pagamentos || []).filter((p) => Number(p?.valor) || p?.texto);
    if (!pags.length) faltando.push('pagamentos');
    if (pags.some((p) => p.tipo === 'financiamento' && !String(p.financeira || '').trim())) faltando.push('banco do financiamento');
    const soma = pags.reduce((s, p) => s + Number(p?.valor || 0), 0);
    const total = Number(dados.financeiro?.valor_total || 0);
    if (pags.length && Math.abs(soma - total) > 0.009) faltando.push(`pagamentos (soma ${docFormatBRL(soma)} ≠ total ${docFormatBRL(total)})`);
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
// UI — modal "Documentos" (ficha do cliente). Só admin/gestor da Ágil Solar Matriz.
// ==========================================

// A mesma regra vale no banco: a RLS de documentos_config só libera admin/gestor
// da própria franquia, então vendedor não gera nem contornando a tela.
function canGerarDocumentos() {
  return typeof FRANQUIA_MATRIZ_ID !== 'undefined'
    && state.franquiaId === FRANQUIA_MATRIZ_ID
    && Boolean(state.isAdmin || state.isGestor);
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
function _docSistemaFinanceiro(fonte, condicao) {
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
      pagamentos: docPagamentosDaCondicao(condicao, total) || docPagamentosDaCondicao('avista', total),
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
  const tipoPessoa = salvo.tipo_pessoa || (_docDigits(client?.documento).length === 14 ? 'PJ' : 'PF');

  const endSalvo = (salvo.cliente && typeof salvo.cliente.endereco === 'object') ? salvo.cliente.endereco : {};
  const cliente = {
    ...(salvo.cliente || {}),
    ...semVazios({ nome: client?.nome, cpf: client?.documento }),
    // dados pessoais da ficha só valem para PF (na PJ ficam no representante)
    ...(tipoPessoa === 'PF' ? semVazios({
      rg: client?.rg,
      rg_orgao: client?.rg_orgao,
      estado_civil: client?.estado_civil,
      nacionalidade: client?.nacionalidade,
      genero: client?.genero,
      profissao: client?.profissao,
    }) : {}),
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
  cliente.representante = { rg_orgao: 'SP/SSP', mesmo_endereco: true, ...(cliente.representante || {}) };

  const origem = fonte ? fonte.id : 'manual';
  const mesmaBase = salvo.origem === origem && salvo.sistema;
  const condicao = (mesmaBase && salvo.condicao) || 'avista';
  const base = mesmaBase ? { sistema: salvo.sistema, financeiro: salvo.financeiro } : _docSistemaFinanceiro(fonte, condicao);
  return {
    origem,
    tipo_pessoa: tipoPessoa,
    condicao,
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
  if (!canGerarDocumentos()) { showToast('Contrato e procuração: disponível só para gestor/admin da Matriz.'); return; }
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
function _docSelect(id, valor, opcoes, onchange = '') {
  return `<select id="${id}" ${onchange ? `onchange="${onchange}"` : ''} class="${_docInp}">${opcoes.map(([v, l]) => `<option value="${v}" ${String(valor ?? '') === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
}
function _docSecao(icone, titulo, corpo) {
  return `<section class="space-y-3">
    <p class="text-orange-500 text-[10px] font-black uppercase tracking-[0.3em] flex items-center gap-2"><i data-lucide="${icone}" class="w-3.5 h-3.5"></i> ${titulo}</p>
    ${corpo}
  </section>`;
}

const DOC_TIPOS_PAGAMENTO = [
  ['entrada', 'Na assinatura (entrada / à vista)'],
  ['chegada_material', 'Após a entrega do material'],
  ['financiamento', 'Financiamento'],
  ['livre', 'Texto livre'],
];
const DOC_OPCOES_GENERO = [['', '—'], ['M', 'Masculino'], ['F', 'Feminino']];
const DOC_OPCOES_ESTADO_CIVIL = [['', '—'], ['solteiro', 'Solteiro(a)'], ['casado', 'Casado(a)'], ['divorciado', 'Divorciado(a)'], ['separado', 'Separado(a) judicialmente'], ['viuvo', 'Viúvo(a)'], ['uniao_estavel', 'União estável']];

// Campos de endereço (cliente / empresa / usina)
function _docEnderecoHTML(prefixo, e) {
  return `
    ${_docCampo('Rua / Av.', _docText(`${prefixo}-logradouro`, e.logradouro), 'col-span-2')}
    ${_docCampo('Número', _docText(`${prefixo}-numero`, e.numero))}
    ${_docCampo('Complemento', _docText(`${prefixo}-complemento`, e.complemento))}
    ${_docCampo('Bairro', _docText(`${prefixo}-bairro`, e.bairro), 'col-span-2')}
    ${_docCampo('Cidade', _docText(`${prefixo}-cidade`, e.cidade))}
    ${_docCampo('UF', _docText(`${prefixo}-uf`, e.uf, 'uppercase'))}
    ${_docCampo('CEP', _docText(`${prefixo}-cep`, e.cep, 'font-mono'))}`;
}

function _docRender() {
  const overlay = document.getElementById('doc-overlay');
  if (!overlay || !_docCtx) return;
  const d = _docCtx.dados;
  const pj = d.tipo_pessoa === 'PJ';
  const c = d.cliente, e = c.endereco || {}, rep = c.representante || {};
  const inst = d.instalacao, sis = d.sistema, fin = d.financeiro;
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
        ${_docSelect(`doc-pag-tipo-${i}`, p.tipo, DOC_TIPOS_PAGAMENTO, "_docLer(); _docCtx.dados.condicao = 'personalizada'; _docRender()").replace(`class="${_docInp}"`, `class="${_docInp} flex-1"`)}
        <input id="doc-pag-valor-${i}" value="${_docNumInput(p.valor)}" oninput="_docOnValor(${i})" placeholder="Valor" class="${_docInp} w-32 font-mono text-right">
        <button type="button" onclick="_docRemover('pagamentos', ${i})" title="Remover" class="btn btn-secondary btn-icon"><i data-lucide="trash-2"></i></button>
      </div>
      ${p.tipo === 'financiamento'
        ? _docText(`doc-pag-fin-${i}`, p.financeira, 'uppercase" placeholder="Banco / financeira (ex.: SOLAGORA)')
        : p.tipo === 'livre'
          ? `<textarea id="doc-pag-texto-${i}" rows="2" placeholder="Use {valor} onde entra o valor por extenso" class="${_docInp}">${escapeHTML(p.texto || '')}</textarea>`
          : _docText(`doc-pag-forma-${i}`, p.forma, `" placeholder="Forma: depósito/ transferência/ ${DOC_DEFAULTS.forma_pagamento}`)}
    </div>`).join('');

  const clienteHTML = pj ? `
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
      ${_docCampo('Razão social', _docText('doc-nome', c.nome, 'uppercase'), 'col-span-2 md:col-span-3')}
      ${_docCampo('CNPJ', _docText('doc-cpf', c.cpf, 'font-mono'))}
      ${_docEnderecoHTML('doc-end', e)}
    </div>
    <p class="text-neutral-400 text-[10px] font-black uppercase tracking-widest pt-2">Responsável legal (assina pela empresa)</p>
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
      ${_docCampo('Nome completo', _docText('doc-rep-nome', rep.nome, 'uppercase'), 'col-span-2 md:col-span-4')}
      ${_docCampo('CPF', _docText('doc-rep-cpf', rep.cpf, 'font-mono'))}
      ${_docCampo('RG', _docText('doc-rep-rg', rep.rg, 'font-mono'))}
      ${_docCampo('Órgão emissor', _docText('doc-rep-rg-orgao', rep.rg_orgao, 'uppercase'))}
      ${_docCampo('Gênero', _docSelect('doc-rep-genero', rep.genero, DOC_OPCOES_GENERO))}
      ${_docCampo('Estado civil', _docSelect('doc-rep-estado-civil', rep.estado_civil, DOC_OPCOES_ESTADO_CIVIL))}
      ${_docCampo('Nacionalidade', _docText('doc-rep-nacionalidade', rep.nacionalidade, 'uppercase" placeholder="BRASILEIRO(A)'))}
      ${_docCampo('Profissão / cargo', _docText('doc-rep-profissao', rep.profissao, 'uppercase" placeholder="EMPRESÁRIO(A)'), 'col-span-2')}
    </div>
    <label class="flex items-center gap-2 text-xs text-neutral-400 cursor-pointer">
      <input id="doc-rep-mesmo-endereco" type="checkbox" ${rep.mesmo_endereco !== false ? 'checked' : ''} onchange="_docLer(); _docRender()"> Responsável mora no endereço da empresa
    </label>
    ${rep.mesmo_endereco === false ? _docCampo('Endereço do responsável', _docText('doc-rep-endereco', typeof rep.endereco === 'string' ? rep.endereco : docFormatEndereco(rep.endereco), '" placeholder="Rua, nº, bairro, cidade/UF - CEP')) : ''}` : `
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
      ${_docCampo('Nome completo', _docText('doc-nome', c.nome, 'uppercase'), 'col-span-2 md:col-span-4')}
      ${_docCampo('CPF', _docText('doc-cpf', c.cpf, 'font-mono'))}
      ${_docCampo('RG', _docText('doc-rg', c.rg, 'font-mono'))}
      ${_docCampo('Órgão emissor', _docText('doc-rg-orgao', c.rg_orgao, 'uppercase'))}
      ${_docCampo('Gênero', _docSelect('doc-genero', c.genero, DOC_OPCOES_GENERO))}
      ${_docCampo('Estado civil', _docSelect('doc-estado-civil', c.estado_civil, DOC_OPCOES_ESTADO_CIVIL))}
      ${_docCampo('Nacionalidade', _docText('doc-nacionalidade', c.nacionalidade, 'uppercase" placeholder="BRASILEIRO(A)'))}
      ${_docCampo('Profissão', _docText('doc-profissao', c.profissao, 'uppercase'), 'col-span-2')}
      ${_docEnderecoHTML('doc-end', e)}
    </div>`;

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
        ${_docSecao('layout-template', 'Modelo', `
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            ${_docCampo('Tipo de cliente', _docSelect('doc-tipo-pessoa', d.tipo_pessoa, [['PF', 'Pessoa física (CPF)'], ['PJ', 'Pessoa jurídica (CNPJ)']], '_docLer(); _docCtx.dados.tipo_pessoa = this.value; _docRender()'))}
            ${_docCampo('Condição de pagamento', _docSelect('doc-condicao', d.condicao, DOC_CONDICOES, '_docTrocarCondicao(this.value)'))}
            ${_docCampo('Kit e valores com base em', `<select id="doc-origem" onchange="_docTrocarOrigem(this.value)" class="${_docInp}">
              ${_docCtx.fontes.map((f) => `<option value="${f.id}" ${d.origem === f.id ? 'selected' : ''}>${escapeHTML(f.label)}</option>`).join('')}
              <option value="manual" ${d.origem === 'manual' ? 'selected' : ''}>Preencher manualmente</option>
            </select>`, 'md:col-span-2')}
          </div>`)}

        ${_docSecao(pj ? 'building-2' : 'user', pj ? 'Empresa contratante' : 'Cliente', clienteHTML)}

        ${_docSecao('plug-zap', 'Instalação', `
          <div class="grid grid-cols-2 gap-3">
            ${_docCampo('Nº da instalação (UC)', _docText('doc-uc', inst.numero_instalacao, 'font-mono'))}
            ${_docCampo('Concessionária', _docText('doc-concessionaria', inst.concessionaria, 'uppercase'))}
          </div>
          <label class="flex items-center gap-2 text-xs text-neutral-400 cursor-pointer">
            <input id="doc-mesmo-endereco" type="checkbox" ${inst.mesmo_endereco !== false ? 'checked' : ''} onchange="_docLer(); _docRender()"> Usina no mesmo endereço ${pj ? 'da empresa' : 'do cliente'}
          </label>
          ${inst.mesmo_endereco === false ? `<div class="grid grid-cols-2 md:grid-cols-4 gap-3">${_docEnderecoHTML('doc-inst', ie)}</div>` : ''}`)}

        ${_docSecao('sun', 'Sistema', `
          <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
            ${_docCampo('Potência (kWp)', _docText('doc-kwp', sis.potencia_kwp ? String(sis.potencia_kwp).replace('.', ',') : '', 'font-mono'))}
            ${_docCampo('Tipo de telhado', `<input id="doc-telhado" list="doc-telhados" value="${escapeHTML(inst.telhado || '')}" placeholder="Ex.: Telha Colonial" class="${_docInp}">
              <datalist id="doc-telhados">${DOC_TELHADOS.map((t) => `<option value="${t}">`).join('')}</datalist>`, 'md:col-span-2')}
          </div>
          <div class="space-y-2">
            <div class="flex gap-2 text-[9px] text-neutral-500 font-black uppercase tracking-widest"><span class="w-16 text-center">Qtd.</span><span>Descrição (anexo I)</span></div>
            ${itensHTML}
            <button type="button" onclick="_docAdicionar('itens')" class="btn btn-secondary btn-sm"><i data-lucide="plus"></i> Item</button>
          </div>`)}

        ${_docSecao('wallet', 'Valores e pagamento', `
          <div class="grid grid-cols-2 gap-3">
            ${_docCampo('Valor total (R$)', `<input id="doc-total" value="${_docNumInput(fin.valor_total)}" oninput="_docOnValor('total')" class="${_docInp} font-mono text-right">`)}
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
        <button id="doc-btn-contrato" onclick="_docGerar('contrato')" class="btn btn-primary flex-1"><i data-lucide="file-text"></i> Gerar contrato ${pj ? 'PJ' : 'PF'}</button>
        <button id="doc-btn-procuracao" onclick="_docGerar('procuracao')" class="btn btn-secondary flex-1"><i data-lucide="file-pen"></i> Gerar procuração ${pj ? 'PJ' : 'PF'}</button>
      </div>
    </div>`;

  _docCtx.animado = true;
  document.getElementById('doc-corpo').scrollTop = scrollAnterior;
  _docAtualizarSoma();
  lucide.createIcons();
}

// Lê o formulário de volta para _docCtx.dados. Campo que não está na tela
// (ex.: dados de PF enquanto o modo é PJ) mantém o valor anterior.
function _docLer() {
  if (!_docCtx) return;
  const val = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : undefined; };
  const upv = (id) => { const v = val(id); return v === undefined ? undefined : v.toUpperCase(); };
  const manter = (novo, antigo) => (novo === undefined ? antigo : novo);
  const d = _docCtx.dados;
  const c0 = d.cliente || {}, e0 = c0.endereco || {}, r0 = c0.representante || {};

  d.tipo_pessoa = manter(val('doc-tipo-pessoa'), d.tipo_pessoa);
  d.cliente = {
    nome: manter(upv('doc-nome'), c0.nome),
    cpf: manter(val('doc-cpf'), c0.cpf),
    rg: manter(val('doc-rg'), c0.rg),
    rg_orgao: manter(upv('doc-rg-orgao'), c0.rg_orgao),
    genero: manter(val('doc-genero'), c0.genero),
    estado_civil: manter(val('doc-estado-civil'), c0.estado_civil),
    nacionalidade: manter(upv('doc-nacionalidade'), c0.nacionalidade),
    profissao: manter(upv('doc-profissao'), c0.profissao),
    endereco: {
      logradouro: manter(val('doc-end-logradouro'), e0.logradouro),
      numero: manter(val('doc-end-numero'), e0.numero),
      complemento: manter(val('doc-end-complemento'), e0.complemento),
      bairro: manter(val('doc-end-bairro'), e0.bairro),
      cidade: manter(val('doc-end-cidade'), e0.cidade),
      uf: manter(upv('doc-end-uf'), e0.uf),
      cep: manter(val('doc-end-cep'), e0.cep),
    },
    representante: {
      nome: manter(upv('doc-rep-nome'), r0.nome),
      cpf: manter(val('doc-rep-cpf'), r0.cpf),
      rg: manter(val('doc-rep-rg'), r0.rg),
      rg_orgao: manter(upv('doc-rep-rg-orgao'), r0.rg_orgao),
      genero: manter(val('doc-rep-genero'), r0.genero),
      estado_civil: manter(val('doc-rep-estado-civil'), r0.estado_civil),
      nacionalidade: manter(upv('doc-rep-nacionalidade'), r0.nacionalidade),
      profissao: manter(upv('doc-rep-profissao'), r0.profissao),
      mesmo_endereco: document.getElementById('doc-rep-mesmo-endereco') ? document.getElementById('doc-rep-mesmo-endereco').checked : r0.mesmo_endereco,
      endereco: manter(val('doc-rep-endereco'), r0.endereco),
    },
  };
  const instAnterior = d.instalacao || {};
  d.instalacao = {
    numero_instalacao: manter(val('doc-uc'), instAnterior.numero_instalacao),
    concessionaria: manter(upv('doc-concessionaria'), instAnterior.concessionaria),
    telhado: manter(val('doc-telhado'), instAnterior.telhado),
    mesmo_endereco: document.getElementById('doc-mesmo-endereco')?.checked !== false,
    endereco: document.getElementById('doc-inst-logradouro')
      ? {
          logradouro: val('doc-inst-logradouro'),
          numero: val('doc-inst-numero'),
          complemento: val('doc-inst-complemento'),
          bairro: val('doc-inst-bairro'),
          cidade: val('doc-inst-cidade'),
          uf: upv('doc-inst-uf'),
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
      forma: manter(val(`doc-pag-forma-${i}`), anterior.forma),
      financeira: manter(upv(`doc-pag-fin-${i}`), anterior.financeira),
      texto: manter(val(`doc-pag-texto-${i}`), anterior.texto),
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
  Object.assign(_docCtx.dados, { origem: fonte ? fonte.id : 'manual' }, _docSistemaFinanceiro(fonte, _docCtx.dados.condicao));
  _docRender();
}

// Condição pronta → refaz as linhas de pagamento (mantém banco/forma já digitados)
function _docTrocarCondicao(condicao) {
  _docLer();
  const d = _docCtx.dados;
  d.condicao = condicao;
  const novas = docPagamentosDaCondicao(condicao, d.financeiro.valor_total);
  if (novas) {
    const anteriores = d.financeiro.pagamentos || [];
    d.financeiro.pagamentos = novas.map((p) => {
      const mesmoTipo = anteriores.find((a) => a.tipo === p.tipo) || {};
      return { ...p, forma: mesmoTipo.forma, financeira: mesmoTipo.financeira };
    });
  }
  _docRender();
}

// Ao digitar valores: 70/30 recalcula pelo total; nas demais condições prontas,
// a última linha absorve o saldo (ex.: entrada digitada → financiamento ajusta).
function _docOnValor(origem) {
  const d = _docCtx?.dados;
  if (!d) return;
  const inputs = [];
  for (let i = 0; document.getElementById(`doc-pag-valor-${i}`); i++) inputs.push(document.getElementById(`doc-pag-valor-${i}`));
  const total = docParseNum(document.getElementById('doc-total')?.value);
  if (d.condicao !== 'personalizada' && inputs.length) {
    if (d.condicao === '70_30' && origem === 'total') {
      const [a, b] = docPagamentosDaCondicao('70_30', total);
      if (inputs[0]) inputs[0].value = _docNumInput(a.valor);
      if (inputs[1]) inputs[1].value = _docNumInput(b.valor);
    } else if (inputs.length === 1 && origem === 'total') {
      inputs[0].value = _docNumInput(total);
    } else if (inputs.length > 1 && origem !== inputs.length - 1) {
      const outros = inputs.slice(0, -1).reduce((s, el) => s + docParseNum(el.value), 0);
      inputs[inputs.length - 1].value = _docNumInput(Math.max(0, _docArred(total - outros)));
    }
  }
  _docAtualizarSoma();
}

function _docAdicionar(lista) {
  _docLer();
  const d = _docCtx.dados;
  if (lista === 'itens') d.sistema.itens.push({ quantidade: 1, descricao: '' });
  else {
    const soma = d.financeiro.pagamentos.reduce((s, p) => s + Number(p.valor || 0), 0);
    d.financeiro.pagamentos.push({ tipo: 'financiamento', valor: Math.max(0, _docArred(d.financeiro.valor_total - soma)) });
    d.condicao = 'personalizada';
  }
  _docRender();
}

function _docRemover(lista, i) {
  _docLer();
  const d = _docCtx.dados;
  (lista === 'itens' ? d.sistema.itens : d.financeiro.pagamentos).splice(i, 1);
  if (lista !== 'itens') d.condicao = 'personalizada';
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
  cliente_nome: 'nome / razão social', cliente_documento: 'CPF / CNPJ', cliente_rg: 'RG', cliente_estado_civil: 'estado civil',
  cliente_endereco: 'endereço', numero_instalacao: 'nº da instalação', potencia_kwp: 'potência',
  representante_nome: 'nome do responsável legal', representante_cpf: 'CPF do responsável legal', representante_rg: 'RG do responsável legal',
  valor_total: 'valor total', itens: 'itens', pagamentos: 'condições de pagamento',
  contratada_nome: 'dados da empresa (documentos_config)', procurador_nome: 'dados do procurador (documentos_config)',
};

// Salva na ficha (clientes) e guarda o formulário em clientes.documentos_dados.
// Na PJ os dados pessoais são do representante — ficam só no rascunho.
async function _docSalvar() {
  const d = _docCtx.dados;
  const c = d.cliente, e = c.endereco || {};
  const clientePayload = {
    documento: c.cpf || null,
    endereco: e.logradouro || null,
    numero: e.numero || null,
    complemento: e.complemento || null,
    bairro: e.bairro || null,
    cep: e.cep || null,
    documentos_dados: JSON.parse(JSON.stringify(d)),
  };
  if (d.tipo_pessoa !== 'PJ') {
    Object.assign(clientePayload, {
      rg: c.rg || null,
      rg_orgao: c.rg_orgao || null,
      genero: c.genero || null,
      estado_civil: c.estado_civil || null,
      nacionalidade: c.nacionalidade || null,
      profissao: c.profissao || null,
    });
  }
  const { error } = await supabaseClient.from('clientes').update(clientePayload).eq('id', _docCtx.clientId);
  if (error) {
    console.warn('[documentos] Falha ao salvar dados do contrato.', error);
    return false;
  }
  const client = (state.clientes || []).find((x) => x.id === _docCtx.clientId);
  if (client) Object.assign(client, clientePayload);
  return true;
}

// Registra o documento gerado na timeline do cliente (crm_atividades, tipo 'documento')
async function _docRegistrarNaTimeline(tipo, modelo, dados) {
  const client = (state.clientes || []).find((x) => x.id === _docCtx?.clientId);
  if (!client) return;
  const pj = modelo.endsWith('_pj') ? 'PJ' : 'PF';
  let descricao;
  if (tipo === 'contrato') {
    const condicao = (DOC_CONDICOES.find(([v]) => v === dados.condicao) || [])[1] || 'Personalizada';
    descricao = `Contrato ${pj} gerado · ${condicao} · ${docFormatBRL(dados.financeiro?.valor_total)} · ${docFormatKwp(dados.sistema?.potencia_kwp)} kWp`;
  } else {
    descricao = `Procuração ${pj} gerada · UC ${dados.instalacao?.numero_instalacao || '-'} · ${String(dados.instalacao?.concessionaria || DOC_DEFAULTS.concessionaria).toUpperCase()}`;
  }
  const { error } = await supabaseClient.from('crm_atividades').insert([{
    cliente_id: client.id,
    franquia_id: client.franquia_id || state.franquiaId,
    autor_email: state.currentUser?.email || 'sistema',
    tipo: 'documento',
    descricao,
    meta: { modelo, condicao: dados.condicao || null, valor_total: dados.financeiro?.valor_total || null, origem: dados.origem || null },
  }]);
  if (error) { console.warn('[documentos] Falha ao registrar na timeline.', error); return; }
  // Ficha aberta por baixo? Atualiza a timeline na hora.
  if (typeof crmFetchAtividades === 'function' && _crm360ClientIdAtual() === client.id) crmFetchAtividades(client.id);
}

// tipo = 'contrato' | 'procuracao' → modelo PF ou PJ conforme o formulário
async function _docGerar(tipo) {
  if (!_docCtx) return;
  _docLer();
  const dados = _docDadosParaGerar();
  const modelo = `${tipo}_${dados.tipo_pessoa === 'PJ' ? 'pj' : 'pf'}`;
  const faltando = validarDadosDocumento(modelo, dados);
  if (faltando.length) {
    showToast('Falta preencher: ' + faltando.map((k) => DOC_ROTULOS[k] || k).join(', '));
    return;
  }
  const btn = document.getElementById(tipo === 'contrato' ? 'doc-btn-contrato' : 'doc-btn-procuracao');
  const html = btn?.innerHTML;
  if (btn) { btn.disabled = true; btn.innerHTML = '<i data-lucide="loader-2" class="animate-spin"></i> Gerando...'; lucide.createIcons(); }
  try {
    const blob = await gerarDocumento(modelo, dados);
    baixarDocumento(blob, nomeArquivoDocumento(modelo, dados));
    const salvo = await _docSalvar();
    await _docRegistrarNaTimeline(tipo, modelo, dados);
    const nome = tipo === 'contrato' ? 'CONTRATO GERADO' : 'PROCURAÇÃO GERADA';
    showToast(salvo ? nome + '!' : nome + ', mas os dados não foram salvos.');
  } catch (err) {
    console.error('[documentos] Falha ao gerar.', err);
    showToast('Erro ao gerar o documento: ' + (err.message || err));
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = html; lucide.createIcons(); }
  }
}

if (typeof module !== 'undefined') {
  module.exports = { DOC_MODELOS, DOC_DEFAULTS, montarDadosDocumento, validarDadosDocumento, docValorPorExtenso, docFormatEndereco, docPagamentosDaCondicao };
}
