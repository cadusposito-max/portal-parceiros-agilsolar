const {test} = require('node:test');
const assert = require('node:assert/strict');
const {analisar} = require('../../scripts/calibrar-centro-custo.cjs');
const c = require('../../assets/js/centro-custo-calc.js');

test('Reconstrução dos inversores segue equipamento e conectores do catálogo, não a faixa de módulos', () => {
  const rows = analisar().resultado.rows;
  for (const [modulos,custo] of [[8,7027.42],[13,10674.13],[17,13378.23]]) {
    assert.equal(rows.find(r => !r.micro && r.modulos === modulos).kit, custo);
  }
});

test('Calibração: os 33 promocionais empatam ou ficam abaixo do preço por custos, com a estimativa da tela', () => {
  const a = analisar();
  assert.deepEqual(a.referencia, {instalacaoModulo:c.referenciaHelte.instalacaoModulo, eletricaFixa:c.referenciaHelte.eletricaFixa, eletricaKwp:c.referenciaHelte.eletricaKwp});
  assert.deepEqual(a.referencia, {instalacaoModulo:70, eletricaFixa:345, eletricaKwp:118.5});
  assert.equal(a.resultado.rows.length, 33);
  assert.equal(a.resultado.todosEmpatamOuAcima, true);
  assert.ok(a.resultado.rows.every(r => r.alvo >= r.preco));
  assert.equal(a.resultado.acimaMedioPct, 6.62);
  assert.deepEqual(a.resultado.empatam, ['inversor 17']);
  // Só por kWp também cumpre, mas deixa o preço bem mais alto na média.
  assert.ok(a.alternativas.soPorKwp.acimaMedioPct > a.resultado.acimaMedioPct);
});

test('Um real a menos na elétrica fixa já deixa algum promocional acima do preço por custos', () => {
  const {avaliar, custoKit} = require('../../scripts/calibrar-centro-custo.cjs');
  const fonte = require('../../supabase/referencias/helte-20261009.json');
  const amostras = fonte.promos.map(p => ({...p, kit:custoKit(p)}));
  assert.equal(avaliar(amostras, 344, 118.5).todosEmpatamOuAcima, false);
});

test('Referência só pode preencher custos com as mesmas premissas comerciais', () => {
  const linhas = {imposto:{t:'pct',v:13.8,b:'vk'},comissao:{t:'pct',v:8,b:'v'},
    projeto:{t:'brl',v:110,b:'v'},placas:{t:'brl',v:30,b:'v'},eletrica_fixa:{t:'brl',v:345,b:'v'}};
  const contrato = {royalties:{t:'pct',v:0,b:'v'},publicidade:{t:'pct',v:0,b:'v'}};
  const rede = {cobrar:false};
  assert.equal(c.aceitaReferenciaHelte(linhas,contrato,rede),true);
  for (const changes of [
    {comissao:{t:'pct',v:6,b:'v'}}, {imposto:{t:'pct',v:13.8,b:'v'}},
    {projeto:{t:'brl',v:110,b:'modulo'}}, {outros:{t:'brl',v:100,b:'v'}}
  ]) assert.equal(c.aceitaReferenciaHelte({...linhas,...changes},contrato,rede),false);
  assert.equal(c.aceitaReferenciaHelte(linhas,{...contrato,royalties:{v:3.5}},rede),false);
  assert.equal(c.aceitaReferenciaHelte(linhas,contrato,{cobrar:true}),false);
  assert.equal(c.aceitaReferenciaHelte(linhas,contrato,undefined),false);
  assert.equal(c.aceitaReferenciaHelte(linhas,undefined,rede),false);
});
