const {test} = require('node:test');
const assert = require('node:assert/strict');
const {analisar} = require('../../scripts/calibrar-centro-custo.cjs');
const c = require('../../assets/js/centro-custo-calc.js');

test('Reconstrução dos inversores segue equipamento e conectores do catálogo, não a faixa de módulos', () => {
  const rows = analisar().resultado.rows;
  for (const [modulos,custo] of [[8,7105.18],[13,10800.85],[17,13549.83]]) {
    assert.equal(rows.find(r => !r.micro && r.modulos === modulos).kit, custo);
  }
});

test('Calibração reversa reproduz a margem média de 33 kits e a estimativa oferecida na tela', () => {
  const a = analisar();
  assert.equal(a.tarifa, c.referenciaHelte.eletricaKwp);
  assert.equal(a.resultado.quantidade, 33);
  assert.equal(a.resultado.margemMedia, 19.5);
  assert.equal(a.resultado.margemPonderada, 19.02);
  assert.equal(a.resultado.abaixoMinima, 9);
  assert.deepEqual(a.resultado.rows.filter(r => r.alvo < r.preco).map(r => [r.micro,r.modulos]),
    [[true,4],[true,5],[true,6],[true,7]]);
});

test('Referência só pode preencher custos com as mesmas premissas comerciais', () => {
  const linhas = {imposto:{t:'pct',v:13.8,b:'vk'},comissao:{t:'pct',v:8,b:'v'},
    projeto:{t:'brl',v:110,b:'v'},placas:{t:'brl',v:30,b:'v'}};
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
