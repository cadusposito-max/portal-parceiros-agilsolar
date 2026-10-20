const {test} = require('node:test');
const assert = require('node:assert/strict');
const {analisar, avaliar, custoKit} = require('../../scripts/calibrar-centro-custo.cjs');
const c = require('../../assets/js/centro-custo-calc.js');
const fonte = require('../../supabase/referencias/helte-20261009.json');
const amostras = () => fonte.promos.map(p => ({...p, kit:custoKit(p)}));
const eletrica = (ate, ateValor, modulo) => ({eletrica:c.linha('brl', modulo, 'modulo', {ate, ate_valor:ateValor})});

test('Reconstrução dos inversores segue equipamento e conectores do catálogo, não a faixa de módulos', () => {
  const rows = analisar().resultado.rows;
  for (const [modulos,custo] of [[8,7027.42],[13,10674.13],[17,13378.23]]) {
    assert.equal(rows.find(r => !r.micro && r.modulos === modulos).kit, custo);
  }
});

test('Calibração: os 33 promocionais empatam ou ficam abaixo do preço por custos, com a estimativa da tela', () => {
  const a = analisar();
  assert.deepEqual(a.referencia, {...c.referenciaHelte});
  assert.deepEqual(a.referencia, {instalacaoModulo:70, eletricaAte:6, eletricaAteValor:638, eletricaModulo:94});
  assert.equal(a.resultado.rows.length, 33);
  assert.equal(a.resultado.todosEmpatamOuAcima, true);
  assert.ok(a.resultado.rows.every(r => r.alvo >= r.preco));
  assert.equal(a.resultado.acimaMedioPct, 5.68);
  assert.deepEqual(a.resultado.empatam, ['micro 4']);
  // A regra nova fica mais perto dos promocionais que a antiga (345 fixa + 118,50/kWp).
  assert.equal(a.alternativas.antiga.todosEmpatamOuAcima, true);
  assert.ok(a.alternativas.antiga.acimaMedioPct > a.resultado.acimaMedioPct);
});

test('Um real a menos no fixo, ou R$ 0,50 a menos por módulo, já deixa algum promocional acima do preço por custos', () => {
  assert.equal(avaliar(amostras(), eletrica(6, 637, 94)).todosEmpatamOuAcima, false);
  assert.equal(avaliar(amostras(), eletrica(6, 638, 93.5)).todosEmpatamOuAcima, false);
});

test('Referência só pode preencher custos com as mesmas premissas comerciais', () => {
  const linhas = {imposto:{t:'pct',v:13.8,b:'vk'},comissao:{t:'pct',v:8,b:'v'},
    projeto:{t:'brl',v:110,b:'v'},placas:{t:'brl',v:30,b:'v'},eletrica:c.linha('brl',94,'modulo',{ate:6,ate_valor:638})};
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
