const {test} = require('node:test');
const assert = require('node:assert/strict');
const c = require('../../assets/js/centro-custo-calc.js');

// Custos históricos reconstruídos da planilha Helte, preços promocionais de 09/10/2026.
// Premissas e limites da comparação: supabase/CALIBRACAO-HELTE.md.
const linhas = {
  imposto: {t:'pct', v:13.8, b:'vk'}, comissao: {t:'pct', v:8, b:'v'},
  instalacao: {t:'brl', v:70, b:'modulo'}, projeto: {t:'brl', v:110, b:'v'},
  placas: {t:'brl', v:30, b:'v'}
};
const casos = [
  // Fonte, módulos, custo com frete, promocional, alvo 22%, saldo para 19,5%.
  ['Kits Inversor!M5', 5, 5203.31, 8997, 8852.77, 305.98],
  ['Kits Inversor!M10', 10, 8636.62, 14997, 14741.58, 518.47],
  ['Kits Inversor!M20', 20, 16348.02, 26997, 27814.94, 215.24],
  ['Kits Micro!K6', 5, 5791.29, 10171.29, 9754.62, 488.45],
  ['Kits Micro!K11', 10, 10021.09, 16297, 16865.09, 88.15],
  ['Kits Micro!K20', 19, 18329.09, 29397, 30728.97, -13.64],
  ['Kits Micro!K21', 20, 18812.84, 30397, 31595.50, 86.37]
];

test('Referência Helte com serviços da Matriz: preço alvo e saldo após centavos', () => {
  for (const [fonte, modulos, kit, venda, alvo, saldo] of casos) {
    const d = c.calcular({linhas, modulos, kit, venda, kwp:modulos*.62, margem:22});
    assert.deepEqual(d.erros, [], fonte);
    assert.equal(d.vendaAlvo, alvo, fonte);
    assert.equal(c.saldoParaMargem(d, 19.5), saldo, fonte);
  }
});

test('Saldo é limite de despesa fora do kit: gastar um centavo a mais reduz a margem abaixo da referência', () => {
  for (const [, modulos, kit, venda] of casos) {
    const args = {linhas, modulos, kit, venda, kwp:modulos*.62, margem:22};
    const saldo = c.saldoParaMargem(c.calcular(args), 19.5);
    if (saldo < 0) continue;
    const noLimite = c.calcular({...args, extrasDespesa:saldo});
    const acima = c.calcular({...args, extrasDespesa:saldo+.01});
    assert.ok(noLimite.lucroLiq / noLimite.receita >= .195 - 1e-10);
    assert.ok(acima.lucroLiq / acima.receita < .195);
  }
});

test('Saldo inclui despesas já preenchidas e deduções, sem descontá-las duas vezes', () => {
  const args = {linhas, modulos:10, kit:8636.62, venda:14997, kwp:6.2, margem:22};
  const d = c.calcular({...args, linhas:{...linhas,
    eletrica:{t:'brl', v:50, b:'kwp'}, deducoes:{t:'brl', v:100, b:'v'}
  }});
  assert.equal(c.saldoParaMargem(d, 19.5), 108.47);
});

test('Dados incompletos ou margem de referência inválida não produzem saldo', () => {
  const d = c.calcular({linhas, modulos:10, kit:8636.62, venda:14997, margem:22});
  for (const margem of [NaN, Infinity, -1, 100, undefined]) assert.equal(c.saldoParaMargem(d, margem), null);
  assert.equal(c.saldoParaMargem(c.calcular({linhas, kit:0, venda:14997}), 19.5), null);
  assert.equal(c.saldoParaMargem(c.calcular({linhas, kit:8636.62, modulos:10}), 19.5), null);
});
