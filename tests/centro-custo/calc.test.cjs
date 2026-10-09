const {test}=require('node:test');
const assert=require('node:assert/strict');
const c=require('../../assets/js/centro-custo-calc.js');
const linhas={imposto:{t:'pct',v:13.8,b:'vk'},comissao:{t:'pct',v:8,b:'v'},instalacao:{t:'brl',v:70,b:'modulo'},eletrica:{t:'brl',v:150,b:'kwp'},projeto:{t:'brl',v:110,b:'v'},placas:{t:'brl',v:30,b:'v'}};
test('Instalação por módulo e elétrica por kWp; margem real após centavos',()=>{
 for(const modulos of [4,5,8,10,20,150]){
  const a={linhas,modulos,kwp:modulos*.62,kit:modulos*500+1800,margem:22};
  const d=c.calcular(a);assert.equal(d.erros.length,0);
  const v=c.calcular({...a,venda:d.vendaAlvo});assert.equal(v.valores.instalacao,modulos*70);assert.equal(v.valores.eletrica,Math.round(modulos*.62*150*100)/100);assert.ok(v.lucroLiq/v.receita>=.22-1e-7);
 }
});
test('Bases e cenários legados mantêm fixos',()=>{assert.equal(c.valor(c.linha('brl',70,'vk'),10000,5000,{modulos:10}),70);assert.equal(c.valor(c.linha('brl',70,'modulo'),10000,5000,{modulos:10}),700);});
test('Dados incompletos e combinação inviável bloqueiam preço alvo',()=>{assert.equal(c.calcular({linhas,kit:0,modulos:10,kwp:6.2,margem:22}).vendaAlvo,null);assert.equal(c.calcular({linhas,kit:5000,modulos:0,kwp:6.2,margem:22}).vendaAlvo,null);assert.equal(c.calcular({linhas,kit:5000,modulos:10,kwp:6.2,margem:90}).vendaAlvo,null);});
test('Imposto venda menos kit não gera crédito com prejuízo',()=>assert.equal(c.valor(linhas.imposto,1000,5000),0));
test('Margem zero e extras entram na conta',()=>{const a={linhas,kit:6800,modulos:10,kwp:6.2,margem:0,extrasReceita:100,extrasDespesa:200};const d=c.calcular(a),v=c.calcular({...a,venda:d.vendaAlvo});assert.ok(Math.abs(v.lucroLiq)<.03);});
test('Projeto usa faixas da rede e falha fora da tabela',()=>{const rede={cobrar:true,faixas:[{ate:4.9,valor:420},{ate:10,valor:580}]};assert.equal(c.projeto(rede,4.9),420);assert.equal(c.projeto(rede,4.96),580);assert.equal(c.projeto(rede,11),null);assert.equal(c.projeto({cobrar:false},11),0);});
test('Formas novas: por inversor, % do custo do kit, tabela por faixa e custo personalizado',()=>{
 const base={imposto:{t:'pct',v:13.8,b:'vk'},comissao:{t:'pct',v:8,b:'v'}};
 const ctx={modulos:20,kwp:12.4,inversores:5};
 assert.equal(c.valor(c.linha('brl',40,'inversor'),0,0,ctx),200);
 assert.equal(c.valor(c.linha('pct',2,'kit'),50000,18000,ctx),360); // % do kit não depende da venda
 const fx=c.linha('brl',0,'faixa',{faixas:[{ate:10,valor:900},{ate:5,valor:600}]});
 assert.deepEqual(fx.faixas.map(f=>f.ate),[5,10]);
 assert.equal(c.valor(fx,0,0,{kwp:4}),600);assert.equal(c.valor(fx,0,0,{kwp:7}),900);
 assert.equal(c.valor(fx,0,0,{kwp:12.4}),900); // acima da última faixa vale a última
 const ex=c.linha('brl',150,'v',{nome:'Frete local'});assert.equal(ex.nome,'Frete local');assert.ok(c.ehExtra('extra_ab12'));assert.ok(!c.ehExtra('instalacao'));
 const linhas={...base,inst:c.linha('brl',70,'modulo'),inv:c.linha('brl',40,'inversor'),seg:c.linha('pct',2,'kit'),el:fx,extra_x1:ex};
 const a={linhas,kit:18000,...ctx,margem:22};
 const d=c.calcular(a);assert.equal(d.erros.length,0);
 const v=c.calcular({...a,venda:d.vendaAlvo});
 assert.ok(v.lucroLiq/v.receita>=.22-1e-7);
 assert.equal(v.valores.inv,200);assert.equal(v.valores.seg,360);assert.equal(v.valores.el,900);assert.equal(v.valores.extra_x1,150);
});
test('Formas novas sem dado: tabela vazia ou sem inversores bloqueiam o preço',()=>{
 const base={imposto:{t:'pct',v:13.8,b:'vk'}};
 assert.equal(c.calcular({linhas:{...base,el:c.linha('brl',0,'faixa',{faixas:[]})},kit:5000,modulos:10,kwp:6.2,inversores:1,margem:22}).vendaAlvo,null);
 assert.equal(c.calcular({linhas:{...base,inv:c.linha('brl',40,'inversor')},kit:5000,modulos:10,kwp:6.2,inversores:0,margem:22}).vendaAlvo,null);
});
