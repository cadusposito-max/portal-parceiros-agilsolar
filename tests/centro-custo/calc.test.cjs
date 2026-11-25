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
test('R$ por kW do inversor: valor × potência total de inversor (potência × quantidade)',()=>{
 const l=c.linha('brl',120,'kw_inversor');assert.equal(l.b,'kw_inversor');
 assert.equal(c.valor(l,0,0,{kwInversor:11.25}),1350); // 5 micros de 2,25 kW
 const base={imposto:{t:'pct',v:13.8,b:'vk'},comissao:{t:'pct',v:8,b:'v'},el:l};
 assert.equal(c.calcular({linhas:base,kit:8000,modulos:10,kwp:6.2,inversores:1,kwInversor:0,margem:22}).vendaAlvo,null);
 const a={linhas:base,kit:8000,modulos:10,kwp:6.2,inversores:1,kwInversor:5,margem:22};
 const d=c.calcular(a),v=c.calcular({...a,venda:d.vendaAlvo});assert.equal(v.valores.el,600);assert.ok(v.lucroLiq/v.receita>=.22-1e-7);
});
test('Limite: até N cobra o fixo; acima, valor × a quantidade toda (sem somar o fixo)',()=>{
 const el=c.linha('brl',50,'modulo',{ate:6,ate_valor:400});assert.equal(el.ate,6);assert.equal(el.ate_valor,400);
 assert.equal(c.valor(el,0,0,{modulos:4}),400);assert.equal(c.valor(el,0,0,{modulos:6}),400);
 assert.equal(c.valor(el,0,0,{modulos:7}),350);assert.equal(c.valor(el,0,0,{modulos:10}),500);
 const kw=c.linha('brl',120,'kwp',{ate:5,ate_valor:700});assert.equal(c.valor(kw,0,0,{kwp:5}),700);assert.equal(c.valor(kw,0,0,{kwp:6.2}),744);
 assert.equal(c.linha('brl',50,'v',{ate:6,ate_valor:400}).ate,undefined); // fixo por obra não tem limite
 const sem=c.linha('brl',50,'modulo',{ate:0,ate_valor:400});assert.equal(sem.ate,undefined);assert.equal(c.valor(sem,0,0,{modulos:4}),200); // limite 0 = sem fixo
 const linhas={imposto:{t:'pct',v:13.8,b:'vk'},el};
 for(const [modulos,esperado] of [[6,400],[7,350]]){
  const a={linhas,kit:5000,modulos,kwp:modulos*.62,margem:22};
  const d=c.calcular(a);assert.equal(d.erros.length,0);
  const v=c.calcular({...a,venda:d.vendaAlvo});assert.equal(v.valores.el,esperado);assert.ok(v.lucroLiq/v.receita>=.22-1e-7);
 }
});
test('Tabela por kW do inversor: faixa pelo kW de cada inversor, valores somados (2 × 5 kW = 2 × faixa de 5), igual ao banco',()=>{
 const l=c.linha('brl',0,'faixa_kw_inversor',{faixas:[{ate:8,valor:700},{ate:3,valor:420},{ate:12,valor:900},{ate:5,valor:550}]});
 assert.equal(l.b,'faixa_kw_inversor');assert.ok(c.ehTabela(l));assert.deepEqual(l.faixas.map(f=>f.ate),[3,5,8,12]);
 // mesmos números conferidos no banco (private.cc_preco_dimensionado) em 16/11
 [[2,420],[3,420],[3.01,550],[5,550],[7,700],[10,900],[12,900],[20,900]].forEach(([kw,v])=>assert.equal(c.valor(l,0,0,{kwp:99,inversores:1,kwInversor:kw}),v,kw+' kW'));
 // mais de um inversor: faixa do kW de cada um, valor × quantidade
 assert.equal(c.valor(l,0,0,{inversores:2,kwInversor:10}),1100); // 2 × 5 kW = 2 × 550
 assert.equal(c.valor(l,0,0,{inversores:3,kwInversor:21}),2100); // 3 × 7 kW = 3 × 700
 assert.equal(c.valor(l,0,0,{inversores:4,kwInversor:9}),1680); // 4 micros de 2,25 kW = 4 × 420
 assert.equal(c.valor(l,0,0,{kwInversor:5}),550); // sem quantidade = 1 inversor
 const base={imposto:{t:'pct',v:13.8,b:'vk'}};
 const r=c.calcular({linhas:{...base,el:l},kit:5000,modulos:10,kwp:6.2,inversores:2,kwInversor:10,margem:22});
 assert.equal(r.erros.length,0);assert.equal(c.calcular({linhas:{...base,el:l},kit:5000,venda:r.vendaAlvo,modulos:10,kwp:6.2,inversores:2,kwInversor:10,margem:22}).valores.el,1100);
 assert.equal(c.calcular({linhas:{...base,el:l},kit:5000,modulos:10,kwp:6.2,inversores:1,kwInversor:0,margem:22}).vendaAlvo,null);
 assert.equal(c.calcular({linhas:{...base,el:c.linha('brl',0,'faixa_kw_inversor',{faixas:[]})},kit:5000,modulos:10,kwp:6.2,inversores:1,kwInversor:5,margem:22}).vendaAlvo,null);
 assert.ok(!c.aceitaLimite(l)); // tabela não tem "até N cobra fixo"
});
test('Elétrica com config de micro: kit micro usa a do micro (kW total, uma vez); kit inversor e linha sem micro ficam iguais',()=>{
 const fxInv=[{ate:4,valor:420},{ate:5,valor:500},{ate:10,valor:790}];
 const fxMic=[{ate:4,valor:450},{ate:8,valor:750},{ate:12,valor:1100},{ate:20,valor:1700}];
 const l=c.linha('brl',0,'faixa_kw_inversor',{faixas:fxInv,micro:{t:'brl',v:0,b:'faixa_kw_inversor',faixas:fxMic}});
 assert.ok(c.temMicro(l));assert.equal(l.micro.b,'faixa_kw_inversor');assert.equal(l.micro.faixas.length,4);
 // kit com inversor: config do inversor (por inversor)
 assert.equal(c.valor(l,0,0,{inversores:2,kwInversor:10}),1000);
 // kit com micro: kW total dos micros, faixa cobrada uma vez
 assert.equal(c.valor(l,0,0,{inversores:4,kwInversor:9,micro:true}),1100);
 assert.equal(c.valor(l,0,0,{inversores:6,kwInversor:13.5,micro:true}),1700);
 assert.equal(c.valor(l,0,0,{inversores:1,kwInversor:2.25,micro:true}),450);
 assert.equal(c.valor(l,0,0,{inversores:10,kwInversor:30,micro:true}),1700); // acima da última, vale a última
 // linha sem config de micro: micro segue a do inversor (como antes)
 const s=c.linha('brl',0,'faixa_kw_inversor',{faixas:fxInv});
 assert.equal(c.valor(s,0,0,{inversores:4,kwInversor:9,micro:true}),1680);
 // micro com outra forma (R$ por micro, com fixo até 2)
 const pm=c.linha('brl',0,'faixa_kw_inversor',{faixas:fxInv,micro:{t:'brl',v:120,b:'inversor',ate:2,ate_valor:300}});
 assert.equal(c.valor(pm,0,0,{inversores:2,kwInversor:4.5,micro:true}),300);
 assert.equal(c.valor(pm,0,0,{inversores:5,kwInversor:11.25,micro:true}),600);
 // calcular usa a config do tipo do kit e fecha a margem
 const base={imposto:{t:'pct',v:13.8,b:'vk'}};
 const a={linhas:{...base,eletrica:l},kit:9000,modulos:16,kwp:9.92,inversores:4,kwInversor:9,micro:true,margem:22};
 const d=c.calcular(a);assert.equal(d.erros.length,0);
 const v=c.calcular({...a,venda:d.vendaAlvo});assert.equal(v.valores.eletrica,1100);assert.ok(v.lucroLiq/v.receita>=.22-1e-7);
 assert.equal(c.calcular({...a,micro:false,inversores:2,kwInversor:10,venda:d.vendaAlvo}).valores.eletrica,1000);
 // micro com tabela vazia acusa erro
 const vazia=c.linha('brl',0,'v',{micro:{t:'brl',v:0,b:'faixa_kw_inversor',faixas:[]}});
 assert.equal(c.calcular({linhas:{...base,eletrica:vazia},kit:9000,modulos:16,kwp:9.92,inversores:4,kwInversor:9,micro:true,margem:22}).vendaAlvo,null);
 // linhas já resolvidas para o DRE: micro vira a própria linha (marcada), inversor perde a de micro
 const lm=c.linhasDoTipo({eletrica:l,imposto:base.imposto},true);
 assert.equal(lm.eletrica._micro,true);assert.ok(!lm.eletrica.micro);assert.equal(c.valor(lm.eletrica,0,0,{inversores:4,kwInversor:9,micro:true}),1100);
 const li=c.linhasDoTipo({eletrica:l},false);assert.ok(!li.eletrica.micro);assert.equal(c.valor(li.eletrica,0,0,{inversores:2,kwInversor:10}),1000);
 // copiar a linha (linha()) guarda a config de micro e a marca _micro
 assert.deepEqual(c.linha(l.t,l.v,l.b,l).micro,l.micro);
 assert.equal(c.linha(lm.eletrica.t,lm.eletrica.v,lm.eletrica.b,lm.eletrica)._micro,true);
});
