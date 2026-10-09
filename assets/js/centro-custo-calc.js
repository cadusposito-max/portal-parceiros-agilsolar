/* Cálculo puro compartilhado pelo centro de custo, pela DRE e pelos testes. Valores em R$.
   Mesma conta do banco (private.cc_preco_dimensionado). Linha = { t, v, b, faixas?, nome? }:
   - t 'brl', b: v (fixo por obra) | modulo | kwp | inversor (qtd de inversores/micros) | faixa (tabela por kWp)
   - t 'pct', b: v (% da venda) | vk (% da venda − kit) | kit (% do custo do kit)
   Linhas personalizadas usam chave extra_* e levam nome. */
(function (root) {
  'use strict';
  const n = v => Number(v) || 0;
  const r2 = v => Math.round((v + Number.EPSILON) * 100) / 100;
  const bases = { v: 'R$ fixo por obra', modulo: 'R$ por módulo', kwp: 'R$ por kWp', inversor: 'R$ por inversor/micro', faixa: 'Tabela por faixa de kWp' };
  const basesPct = { v: '% da venda', vk: '% da venda − kit', kit: '% do custo do kit' };
  const ehExtra = k => /^extra_[a-z0-9]{1,20}$/.test(String(k));
  function faixasLimpa(faixas) {
    return (Array.isArray(faixas) ? faixas : [])
      .map(f => ({ ate: n(f && f.ate), valor: Math.max(0, n(f && f.valor)) }))
      .filter(f => f.ate > 0)
      .sort((a, b) => a.ate - b.ate);
  }
  function linha(t, v, b, extra = {}) {
    t = t === 'brl' ? 'brl' : 'pct';
    const ok = Object.keys(t === 'pct' ? basesPct : bases);
    const out = { t, v: n(v), b: ok.includes(b) ? b : 'v' };
    if (out.t === 'brl' && out.b === 'faixa') out.faixas = faixasLimpa(extra.faixas);
    if (extra.nome != null) out.nome = String(extra.nome).slice(0, 40);
    return out;
  }
  // Valor da tabela para a potência: primeira faixa que cobre; acima da última, vale a última.
  function faixaValor(faixas, kwp) {
    const fx = faixasLimpa(faixas);
    if (!fx.length || !(n(kwp) > 0)) return null;
    return (fx.find(f => n(kwp) <= f.ate) || fx[fx.length - 1]).valor;
  }
  function quantidade(l, contexto) {
    if (l.b === 'modulo') return n(contexto.modulos);
    if (l.b === 'kwp') return n(contexto.kwp);
    if (l.b === 'inversor') return n(contexto.inversores);
    return 1;
  }
  // Parte da linha que não depende da venda (R$ e % do kit).
  function fixoDaLinha(l, kit, contexto) {
    if (l.t === 'pct') return l.b === 'kit' ? r2(n(kit) * n(l.v) / 100) : 0;
    if (l.b === 'faixa') return r2(n(faixaValor(l.faixas, contexto.kwp)));
    return r2(n(l.v) * quantidade(l, contexto));
  }
  function valor(l, venda, kit, contexto = {}) {
    if (!l) return 0;
    if (l.t === 'brl' || l.b === 'kit') return fixoDaLinha(l, kit, contexto);
    return r2(Math.max(0, l.b === 'vk' ? venda - kit : venda) * n(l.v) / 100);
  }
  function projeto(rede, kwp) {
    if (!rede || !rede.cobrar) return 0;
    const faixa = (rede.faixas || []).find(f => kwp > 0 && kwp <= n(f.ate));
    return faixa ? n(faixa.valor) : null;
  }
  function calcular({ linhas, kit, venda = 0, modulos = 0, kwp = 0, inversores = 0, margem = 0, extrasReceita = 0, extrasDespesa = 0 }) {
    const contexto = { modulos, kwp, inversores }, valores = {};
    const erros = [];
    let P = 0, Q = 0, F = 0;
    Object.entries(linhas || {}).forEach(([k, l]) => {
      if (l.t === 'brl') {
        if (l.b === 'faixa') {
          if (!faixasLimpa(l.faixas).length) erros.push('Preencha a tabela por faixa de kWp.');
          else if (!(n(kwp) > 0)) erros.push('Informe a potência em kWp.');
        } else if (n(l.v) > 0 && quantidade(l, contexto) <= 0) {
          erros.push(l.b === 'modulo' ? 'Informe a quantidade de módulos.' : l.b === 'inversor' ? 'Informe a quantidade de inversores.' : 'Informe a potência em kWp.');
        }
        F += fixoDaLinha(l, kit, contexto);
      } else if (l.b === 'kit') F += fixoDaLinha(l, kit, contexto);
      else if (l.b === 'vk') Q += n(l.v) / 100;
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
  function saldoParaMargem(resultado, margem) {
    if (!resultado || resultado.erros.length || !(resultado.receita > 0) ||
        !Number.isFinite(margem) || margem < 0 || margem >= 100) return null;
    return Math.floor((resultado.lucroLiq - resultado.receita * margem / 100) * 100 + 1e-7) / 100;
  }
  // Estimativa da Matriz calculada por scripts/calibrar-centro-custo.cjs: menor elétrica
  // (fixa por obra + por kWp) com que os 33 promocionais empatam ou ficam abaixo do preço
  // por custos com margem de 22%. Não é cotação de material elétrico.
  const referenciaHelte = Object.freeze({instalacaoModulo:70, eletricaFixa:345, eletricaKwp:118.5});
  function aceitaReferenciaHelte(linhas, contrato, rede) {
    if (!rede || rede.cobrar !== false || !contrato?.royalties || !contrato?.publicidade) return false;
    const esperado = {imposto:['pct',13.8,'vk'], comissao:['pct',8,'v'], projeto:['brl',110,'v'], placas:['brl',30,'v']};
    return Object.entries(esperado).every(([k,[t,v,b]]) => linhas[k]?.t === t && n(linhas[k].v) === v && linhas[k].b === b)
      && Object.entries(linhas).every(([k,l]) => k in esperado || ['eletrica','eletrica_fixa','instalacao'].includes(k) || n(l.v) === 0)
      && Object.values(contrato || {}).every(l => n(l.v) === 0);
  }
  root.CentroCustoCalc = { linha, valor, calcular, projeto, bases, basesPct, ehExtra, faixaValor, saldoParaMargem, referenciaHelte, aceitaReferenciaHelte };
  if (typeof module !== 'undefined') module.exports = root.CentroCustoCalc;
})(typeof window === 'undefined' ? globalThis : window);
