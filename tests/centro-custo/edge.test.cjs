const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm');
const {stripTypeScriptTypes}=require('node:module');
const src=fs.readFileSync('supabase/functions/distribuidoras/index.ts','utf8');
// modoUnidade: o que está salvo no centro de custo da unidade (null = sem centro de custo salvo).
async function fixture(role,modoUnidade=null,fail=false,corpo={}){
 let handler;const writes=[],prices=[],modos=[];
 const ctx=vm.createContext({Deno:{env:{get:k=>k==='SUPABASE_URL'?'https://qa.invalid':'synthetic'},serve:h=>handler=h},crypto:require('node:crypto').webcrypto,Response,Request,Headers,AbortController,atob,setTimeout,clearTimeout,console,
 fetch:async(url,init)=>{
  const route=url.split('/rest/v1/')[1],body=init.body&&JSON.parse(init.body);
  if(route.startsWith('user_accounts'))return Response.json([{role,ativo:true,franquia_id:'f'}]);
  if(route==='rpc/integracao_credencial')return Response.json({usuario:'qa',senha:'synthetic',ativo:true});
  if(route.startsWith('fin_centro_custo?')){modos.push(route);return Response.json(modoUnidade?[{modo_preco:modoUnidade}]:[]);}
  if(route==='rpc/cc_preco_dimensionado'){prices.push(body);return fail?Response.json({message:'Centro de custo inválido'},{status:400}):Response.json({venda:12345.67,margem_alvo:22,modo:'custos',linhas:{instalacao:{t:'brl',v:70,b:'modulo'}}});}
  if(route==='cotacoes_distribuidora'){writes.push(body);return Response.json([{...body,id:'cot-qa'}]);}
  throw Error('Unexpected fetch '+route);
 }});
 vm.runInContext(stripTypeScriptTypes(src,{mode:'transform'}),ctx);
 vm.runInContext(`catalogo=async()=>({});Belenus.prototype.login=async()=>({});Belenus.prototype.zerarRecusas=async()=>{};cotarBelenus=async()=>[{custo:6800,micro:false,kwp:6.2,qtdInv:1,mod:{potencia:620,fabricante:'QA',item:'mod'},inv:{fabricante:'QA',potenciaNominalSaida:5},itens:[],detalhe:{frete:100}}];`,ctx);
 const jwt='x.'+Buffer.from(JSON.stringify({sub:'user'})).toString('base64url')+'.x';
 const res=await handler(new Request('https://qa.invalid',{method:'POST',headers:{Authorization:'Bearer '+jwt},body:JSON.stringify({acao:'cotar',provedor:'belenus',placas:10,...corpo})}));
 return {status:res.status,data:await res.json(),writes,prices,modos};
}
test('Unidade sem centro de custo salvo continua no markup e não calcula custos',async()=>{
 const r=await fixture('gestor');
 assert.equal(r.prices.length,0);assert.equal(r.writes[0].precificacao.modo,'markup');assert.equal(r.writes[0].preco,12071.85);
 assert.match(r.modos[0],/franquia_id=eq\.f/);
});
test('Unidade no markup ignora pedido de custos vindo do navegador',async()=>{
 const r=await fixture('admin','markup',false,{precificacao:'custos'});
 assert.equal(r.prices.length,0);assert.equal(r.writes[0].preco,12071.85);
});
test('Unidade no modo custos: usa a unidade, dimensões e custo com frete; grava snapshot; De pela regra',async()=>{
 const r=await fixture('gestor','custos');
 assert.equal(r.status,200);assert.equal(r.data.kits[0].preco,12345.67);
 assert.equal(r.data.kits[0].preco_de,13996.95); // 12345,67 × 1,13375
 assert.deepEqual(r.prices[0],{p_franquia_id:'f',p_kit:6800,p_modulos:10,p_kwp:6.2});
 assert.equal(r.writes[0].precificacao.linhas.instalacao.b,'modulo');
 assert.equal(r.data.kits[0].custo,undefined);assert.equal(r.data.kits[0].precificacao,undefined);
 assert.equal(r.data.kits[0].margem_alvo,22);
});
test('Vendedor da unidade no modo custos recebe o preço por custos, sem custo nem margem',async()=>{
 const r=await fixture('vendedor','custos');
 assert.equal(r.status,200);assert.equal(r.data.kits[0].preco,12345.67);
 assert.equal(r.data.kits[0].margem_alvo,undefined);assert.equal(r.data.kits[0].custo,undefined);
 assert.equal(r.data.kits[0].modo_precificacao,'custos');
});
test('Erro de custos não volta silenciosamente para markup',async()=>{const r=await fixture('admin','custos',true);assert.equal(r.data.ok,false);assert.equal(r.writes.length,0);});
test('Sem piso: o preço por custos não é comparado com promocional',async()=>{
 assert.doesNotMatch(src,/piso/i);
 const r=await fixture('admin','custos');assert.equal(r.writes[0].precificacao.ajuste_comercial,undefined);
});
