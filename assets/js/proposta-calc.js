// ==========================================
// CÁLCULO DA PROPOSTA (link do cliente + PDF)
// ==========================================
// Fonte única dos números que o cliente vê: preço, potência, geração,
// economia, payback, árvores, parcelas no cartão e validade.
// Usado por assets/js/proposta.js (proposta.html) e proposta-pdf.html.
// As propostas de O&M e corretiva têm cálculo próprio (outro produto, 12x).
// ES5 de propósito: o PDF roda com var/function.

var PROPOSTA_TARIFA_MEDIA   = 0.95; // R$/kWh
var PROPOSTA_FATOR_ECONOMIA = 0.85; // parte da conta que o sistema economiza
var PROPOSTA_VALIDADE_HORAS = 72;
var PROPOSTA_MAX_PARCELAS   = 18;
// Taxa da maquininha (%) por nº de parcelas. Repasse: total = valor / (1 − taxa%).
var PROPOSTA_TAXAS_CARTAO = {
  1: 2.99,  2: 4.09,  3: 4.78,  4: 5.47,  5: 6.14,  6: 6.81,
  7: 7.67,  8: 8.33,  9: 8.98, 10: 9.63, 11: 10.26, 12: 10.90,
  13: 12.32, 14: 12.94, 15: 13.56, 16: 14.17, 17: 14.77, 18: 15.37
};

function propostaEhPersonalizada(p) {
  return p.proposal_mode === 'PERSONALIZADA' || p.proposal_mode === 'EQUIPAMENTOS';
}

function propostaTextoPayback(meses) {
  var anos = Math.floor(meses / 12);
  var resto = meses % 12;
  var txt = '';
  if (anos > 0) txt += anos + (anos > 1 ? ' anos' : ' ano');
  if (anos > 0 && resto > 0) txt += ' e ';
  if (resto > 0) txt += resto + (resto > 1 ? ' meses' : ' mês');
  return txt || 'Menos de 1 mês';
}

// Todos os números da proposta a partir da linha de get_public_proposta.
function calcularNumerosProposta(p) {
  var custom   = propostaEhPersonalizada(p);
  var preco    = custom ? (p.custom_total_price || p.kit_price || 0) : (p.kit_price || 0);
  var potencia = custom ? (p.custom_system_power_kwp || p.kit_power || 0) : (p.kit_power || 0);
  // Geração salva na criação (HSP do cliente). Propostas antigas sem ela:
  // HSP padrão 5,4 e eficiência 0,76 (mesma conta de sempre).
  var geracao  = Number(p.geracao_estimada || 0) || (potencia * 5.4 * 30 * 0.76);

  var faturaIdeal    = geracao * PROPOSTA_TARIFA_MEDIA;
  // Arredonda a mensal em centavos antes de multiplicar: anual = 12 × mensal exibida.
  var economiaMensal = Math.round(faturaIdeal * PROPOSTA_FATOR_ECONOMIA * 100) / 100;
  var mesesPayback   = economiaMensal > 0 ? Math.ceil(preco / economiaMensal) : 0;

  return {
    personalizada:  custom,
    preco:          preco,
    potencia:       potencia,
    nome:           custom ? (p.kit_nome || 'Proposta Personalizada') : (p.kit_nome || ''),
    marca:          custom ? '' : (p.kit_brand || ''),
    geracao:        geracao,
    faturaIdeal:    faturaIdeal,
    economiaMensal: economiaMensal,
    economiaAnual:  economiaMensal * 12,
    economia25Anos: economiaMensal * 12 * 25,
    arvores:        Math.round(potencia * 3),
    mesesPayback:   mesesPayback,
    payback:        propostaTextoPayback(mesesPayback)
  };
}

// Taxas específicas da unidade substituem só as parcelas configuradas.
function propostaTaxasCartao(taxasFranquia) {
  var taxas = {};
  for (var n = 1; n <= PROPOSTA_MAX_PARCELAS; n++) {
    var configurada = taxasFranquia && taxasFranquia[n];
    taxas[n] = typeof configurada === 'number' && isFinite(configurada) && configurada >= 0 && configurada < 100
      ? configurada : PROPOSTA_TAXAS_CARTAO[n];
  }
  return taxas;
}

// [{ n, parcela }] de 1× até PROPOSTA_MAX_PARCELAS×, já com o repasse da taxa.
function propostaParcelasCartao(valor, taxasFranquia) {
  var lista = [];
  var taxas = propostaTaxasCartao(taxasFranquia);
  for (var i = 1; i <= PROPOSTA_MAX_PARCELAS; i++) {
    var taxa = taxas[i];
    lista.push({ n: i, parcela: (valor / (1 - (taxa / 100))) / i });
  }
  return lista;
}

function propostaValidade(createdAt) {
  return new Date(new Date(createdAt).getTime() + PROPOSTA_VALIDADE_HORAS * 3600000);
}
