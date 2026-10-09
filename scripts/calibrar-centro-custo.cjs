// Calibração offline do centro de custo da Matriz contra os 33 promocionais.
// Regra do usuário (09/10): o preço calculado pelo centro de custo tem que EMPATAR ou
// ficar ACIMA do promocional equivalente (os promocionais são a melhor oferta).
// A elétrica é a única linha sem custo conhecido: aqui se acha a combinação
// "fixa por obra + por kWp" que cumpre a regra nos 33 com a menor sobra.
// Não acessa o banco nem altera configuração; é estimativa, não custo medido.
const fonte = require('../supabase/referencias/helte-20261009.json');
const calc = require('../assets/js/centro-custo-calc.js');
const r2 = n => Math.round((n + Number.EPSILON) * 100) / 100;
const MARGEM_ALVO = 22;
const linhasBase = {
  imposto:{t:'pct',v:13.8,b:'vk'}, comissao:{t:'pct',v:8,b:'v'},
  instalacao:{t:'brl',v:70,b:'modulo'}, projeto:{t:'brl',v:110,b:'v'},
  placas:{t:'brl',v:30,b:'v'}
};

function custoKit(kit) {
  const p = fonte.precos;
  const inversor = kit.micro ? {preco:p.MICRO, pares:4}
    : fonte.inversores.find(i => i.wp === kit.inversorWp);
  if (!inversor) throw new Error('Inversor sem referência de custo.');
  const n = kit.modulos, perfis = 2 * Math.ceil(n/2);
  const cabo = n <= 19 ? 3*n : n <= 50 ? Math.ceil(2.5*n) : 2*n;
  // A composição usa o inversor vinculado no catálogo, incluindo os conectores.
  const materiais = n*p.MODULO + kit.inversores*(inversor.preco + inversor.pares*p.CONECTOR + (kit.micro ? p.FIXMICRO : 0))
    + perfis*p.PERFIL + Math.floor(perfis/4)*p.FIXACAO_4 + (perfis%4)/2*p.FIXACAO_2 + 2*cabo*p.CABO;
  const frete = materiais < p.LIMITE ? Math.max(p.FRETE_MIN, materiais*p.FRETE_1) : materiais*p.FRETE_2;
  return r2(materiais + frete);
}

const linhasCom = (fixa, kwp) => ({...linhasBase,
  eletrica_fixa:{t:'brl',v:fixa,b:'v'}, eletrica:{t:'brl',v:kwp,b:'kwp'}});

function avaliar(amostras, fixa, kwp) {
  const rows = amostras.map(p => {
    const d = calc.calcular({linhas:linhasCom(fixa,kwp), kit:p.kit, modulos:p.modulos, kwp:p.kwp, venda:p.preco, margem:MARGEM_ALVO});
    return {...p, alvo:d.vendaAlvo, acima:r2(d.vendaAlvo - p.preco), margemPromo:d.margem};
  });
  const pct = rows.map(r => r.acima / r.preco * 100);
  return {fixa, kwp, rows, todosEmpatamOuAcima: rows.every(r => r.alvo >= r.preco),
    acimaMedioPct: r2(pct.reduce((s,v) => s+v, 0) / pct.length), acimaMaxPct: r2(Math.max(...pct)),
    empatam: rows.filter(r => r.acima < 1).map(r => (r.micro ? 'micro ' : 'inversor ') + r.modulos)};
}

// Quanto de elétrica cada kit precisa para o preço por custos empatar com o promocional.
// preço = (kit×(1−imp) + fixos) ÷ (1 − imp − com − margem)  ⇒  elétrica_i = preço_i×den − kit_i×(1−imp) − demais fixos.
function necessidade(p) {
  const imp = .138, com = .08, den = 1 - imp - com - MARGEM_ALVO/100;
  return p.preco*den - p.kit*(1-imp) - (70*p.modulos + 110 + 30);
}

function analisar() {
  const amostras = fonte.promos.map(p => ({...p, kit:custoKit(p)}));
  // Menor sobra total com fixa + b × kWp ≥ necessidade em todos (b em passos de R$ 0,50).
  let melhor = null;
  for (let b = 0; b <= 400; b += .5) {
    const fixa = Math.max(0, ...amostras.map(p => necessidade(p) - b*p.kwp));
    const sobra = amostras.reduce((s,p) => s + fixa + b*p.kwp - necessidade(p), 0);
    if (!melhor || sobra < melhor.sobra) melhor = {b, fixa, sobra};
  }
  // Arredonda a fixa para cima em reais e confere com o cálculo da plataforma (centavos).
  let fixa = Math.ceil(melhor.fixa - 1e-9), kwp = melhor.b, r = avaliar(amostras, fixa, kwp);
  while (!r.todosEmpatamOuAcima) { fixa += 1; r = avaliar(amostras, fixa, kwp); }
  const soKwp = Math.ceil(Math.max(...amostras.map(p => necessidade(p)/p.kwp)) * 100) / 100;
  return {
    margemAlvo:MARGEM_ALVO, referencia:{instalacaoModulo:70, eletricaFixa:fixa, eletricaKwp:kwp},
    resultado:r,
    alternativas:{soPorKwp:{...avaliar(amostras, 0, soKwp), rows:undefined}},
  };
}

if (require.main === module) {
  const a = analisar();
  console.log(JSON.stringify({...a, resultado:{...a.resultado, rows:a.resultado.rows.map(r =>
    ({tipo:r.micro?'micro':'inversor', modulos:r.modulos, kit:r.kit, promocional:r.preco, precoCustos:r.alvo, acima:r.acima}))}}, null, 2));
}
module.exports = {analisar, custoKit, avaliar};
