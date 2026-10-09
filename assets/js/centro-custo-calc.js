/* Cálculo puro compartilhado pelo centro de custo e pela DRE. Valores em R$. */
(function (root) {
  'use strict';
  const n = v => Number(v) || 0;
  const r2 = v => Math.round((v + Number.EPSILON) * 100) / 100;
  const bases = { v: 'Fixo por venda', modulo: 'Por módulo', kwp: 'Por kWp' };
  function linha(t, v, b) {
    t = t === 'brl' ? 'brl' : 'pct';
    return { t, v: n(v), b: (t === 'pct' ? ['v', 'vk'] : ['v', 'modulo', 'kwp']).includes(b) ? b : 'v' };
  }
  function quantidade(l, contexto) {
    if (l.b === 'modulo') return n(contexto.modulos);
    if (l.b === 'kwp') return n(contexto.kwp);
    return 1;
  }
  function valor(l, venda, kit, contexto = {}) {
    if (!l) return 0;
    return r2(l.t === 'brl' ? n(l.v) * quantidade(l, contexto) : Math.max(0, l.b === 'vk' ? venda - kit : venda) * n(l.v) / 100);
  }
  function projeto(rede, kwp) {
    if (!rede || !rede.cobrar) return 0;
    const faixa = (rede.faixas || []).find(f => kwp > 0 && kwp <= n(f.ate));
    return faixa ? n(faixa.valor) : null;
  }
  function calcular({ linhas, kit, venda = 0, modulos = 0, kwp = 0, margem = 0, extrasReceita = 0, extrasDespesa = 0 }) {
    const contexto = { modulos, kwp }, valores = {};
    const erros = [];
    let P = 0, Q = 0, F = 0;
    Object.entries(linhas || {}).forEach(([k, l]) => {
      if (l.t === 'brl') {
        if (n(l.v) > 0 && quantidade(l, contexto) <= 0) erros.push(l.b === 'modulo' ? 'Informe a quantidade de módulos.' : 'Informe a potência em kWp.');
        F += valor(l, 0, 0, contexto);
      } else if (l.b === 'vk') Q += n(l.v) / 100;
      else P += n(l.v) / 100;
      valores[k] = valor(l, venda, kit, contexto);
    });
    const m = n(margem) / 100, denom = 1 - P - Q - m;
    if (denom <= 0) erros.push('Percentuais e margem devem somar menos de 100%.');
    if (!(kit > 0)) erros.push('Informe o custo completo do kit com frete.');
    const totalCustos = r2(kit + Object.entries(valores).filter(([k]) => k !== 'deducoes').reduce((s, [,v]) => s + v, 0) + extrasDespesa);
    const receita = r2(venda + extrasReceita), lucro = r2(receita - totalCustos), deducoes = n(valores.deducoes);
    const lucroLiq = r2(lucro - deducoes);
    let vendaAlvo = null;
    if (!erros.length) {
      const numerador = kit + F + extrasDespesa - extrasReceita * (1 - m);
      let alvo = (numerador - Q * kit) / denom;
      if (alvo < kit) alvo = numerador / (1 - P - m);
      // Arredonda para cima e confere a margem após o arredondamento de cada linha.
      vendaAlvo = Math.max(0, Math.ceil(alvo * 100 - 1e-7) / 100);
      for (let i = 0; i < 100; i++) {
        const custo = kit + extrasDespesa + Object.values(linhas).reduce((s,l) => s + valor(l, vendaAlvo, kit, contexto), 0);
        if ((vendaAlvo + extrasReceita) * (1 - m) + 1e-7 >= custo) break;
        vendaAlvo = r2(vendaAlvo + .01);
      }
    }
    return { receita, valores, totalCustos, lucro, lucroLiq, deducoes, margem: receita > 0 ? r2(lucroLiq / receita * 100) : 0, vendaAlvo, erros: [...new Set(erros)] };
  }
  // Despesa adicional fora do kit que cabe no preço informado, preservando a margem.
  // Usa o lucro após arredondamento de cada linha e limita a verba a centavos inteiros.
  function saldoParaMargem(resultado, margem) {
    if (!resultado || resultado.erros.length || !(resultado.receita > 0) ||
        !Number.isFinite(margem) || margem < 0 || margem >= 100) return null;
    return Math.floor((resultado.lucroLiq - resultado.receita * margem / 100) * 100 + 1e-7) / 100;
  }
  // Estimativa comercial histórica, calculada por scripts/calibrar-centro-custo.cjs.
  // Não representa cotação de material elétrico. Não carrega custos de kits no cliente.
  const referenciaHelte = Object.freeze({eletricaKwp:48.24, instalacaoModulo:70});
  function aceitaReferenciaHelte(linhas, contrato, rede) {
    if (!rede || rede.cobrar !== false || !contrato?.royalties || !contrato?.publicidade) return false;
    const esperado = {imposto:['pct',13.8,'vk'], comissao:['pct',8,'v'], projeto:['brl',110,'v'], placas:['brl',30,'v']};
    return Object.entries(esperado).every(([k,[t,v,b]]) => linhas[k]?.t === t && n(linhas[k].v) === v && linhas[k].b === b)
      && Object.entries(linhas).every(([k,l]) => k in esperado || ['eletrica','instalacao'].includes(k) || n(l.v) === 0)
      && Object.values(contrato || {}).every(l => n(l.v) === 0);
  }
  root.CentroCustoCalc = { linha, valor, calcular, projeto, bases, saldoParaMargem, referenciaHelte, aceitaReferenciaHelte };
  if (typeof module !== 'undefined') module.exports = root.CentroCustoCalc;
})(typeof window === 'undefined' ? globalThis : window);
