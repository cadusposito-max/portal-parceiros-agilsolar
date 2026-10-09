// Conferência offline da hipótese comercial de margem média de 19,5%.
// Não acessa o banco, altera configurações ou identifica custo real de elétrica.
const fonte = require('../supabase/referencias/helte-20261009.json');
const calc = require('../assets/js/centro-custo-calc.js');
const r2 = n => Math.round((n + Number.EPSILON) * 100) / 100;
const linhas = {
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

function analisar() {
  const amostras = fonte.promos.map(p => {
    const kit = custoKit(p);
    const d = calc.calcular({linhas, kit, modulos:p.modulos, kwp:p.kwp, venda:p.preco, margem:22});
    return {...p, kit, lucroSemReserva:d.lucroLiq};
  });
  // média((lucro_i - tarifa * kWp_i) / venda_i) = 19,5%.
  // Cada SKU tem peso igual: não há volume de vendas na fonte.
  const residual = amostras.reduce((s,p) => s + p.lucroSemReserva/p.preco - .195, 0);
  const tarifa = r2(Math.max(0, residual / amostras.reduce((s,p) => s + p.kwp/p.preco, 0)));
  const avaliar = (grupo, t = tarifa) => {
    const rows = grupo.map(p => {
      const d = calc.calcular({linhas:{...linhas,eletrica:{t:'brl',v:t,b:'kwp'}}, kit:p.kit, modulos:p.modulos, kwp:p.kwp, venda:p.preco, margem:22});
      return {...p, reserva:d.valores.eletrica, lucro:d.lucroLiq, margem:d.margem, alvo:d.vendaAlvo};
    });
    return {quantidade:rows.length, margemMedia:r2(rows.reduce((s,r) => s+r.lucro/r.preco*100,0)/rows.length),
      margemPonderada:r2(rows.reduce((s,r) => s+r.lucro,0)/rows.reduce((s,r) => s+r.preco,0)*100),
      promocionaisMaisBaratos:rows.filter(r => r.preco <= r.alvo).length,
      abaixoMinima:rows.filter(r => r.margem < 18).length, rows};
  };
  const cenarios = [0, tarifa, 50, 150].map(t => {const {rows,...resumo}=avaliar(amostras,t);return {tarifa:t,...resumo};});
  const controles = amostras.filter(p => !p.micro || p.modulos > 7);
  const semMicrosPequenos = r2(controles.reduce((s,p) => s+p.lucroSemReserva/p.preco-.195,0)/controles.reduce((s,p) => s+p.kwp/p.preco,0));
  const ajustar = (grupo,base) => r2(grupo.reduce((s,p) => s+p.lucroSemReserva/p.preco-.195,0)/grupo.reduce((s,p) => s+base(p)/p.preco,0));
  const alternativas = {
    fixo:ajustar(amostras,() => 1), porModulo:ajustar(amostras,p => p.modulos),
    faixasKwp:[[0,5],[5,10],[10,12.4]].map(([de,ate]) => {
      const grupo=amostras.filter(p => p.kwp>de && p.kwp<=ate);
      return {de,ate,quantidade:grupo.length,tarifa:ajustar(grupo,p => p.kwp)};
    })
  };
  return {tarifa, base:'kwp', margemReferencia:19.5, cenarios, sensibilidadeSemMicros4a7:semMicrosPequenos,
    alternativas, resultado:avaliar(amostras)};
}

if (require.main === module) console.log(JSON.stringify(analisar(), null, 2));
module.exports = {analisar, custoKit};
