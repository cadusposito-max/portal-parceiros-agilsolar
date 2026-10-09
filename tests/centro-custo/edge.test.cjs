const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm');
const {stripTypeScriptTypes}=require('node:module');
const src=fs.readFileSync('supabase/functions/distribuidoras/index.ts','utf8');
async function fixture(role,modo,fail=false){
 let handler;const writes=[],prices=[];
 const ctx=vm.createContext({Deno:{env:{get:k=>k==='SUPABASE_URL'?'https://qa.invalid':'synthetic'},serve:h=>handler=h},crypto:require('node:crypto').webcrypto,Response,Request,Headers,AbortController,atob,setTimeout,clearTimeout,console,
 fetch:async(url,init)=>{
  const route=url.split('/rest/v1/')[1],body=init.body&&JSON.parse(init.body);
  if(route.startsWith('user_accounts'))return Response.json([{role,ativo:true,franquia_id:'f'}]);
  if(route==='rpc/integracao_credencial')return Response.json({usuario:'qa',senha:'synthetic',ativo:true});
  if(route==='rpc/cc_preco_dimensionado'){prices.push(body);return fail?Response.json({message:'Centro de custo inválido'},{status:400}):Response.json({venda:12345.67,margem_alvo:22,modo:'custos',linhas:{instalacao:{t:'brl',v:70,b:'modulo'}}});}
  if(route==='cotacoes_distribuidora'){writes.push(body);return Response.json([{...body,id:'cot-qa'}]);}
  throw Error('Unexpected fetch '+route);
 }});
 vm.runInContext(stripTypeScriptTypes(src,{mode:'transform'}),ctx);
 vm.runInContext(`catalogo=async()=>({});Belenus.prototype.login=async()=>({});Belenus.prototype.zerarRecusas=async()=>{};cotarBelenus=async()=>[{custo:6800,micro:false,kwp:6.2,qtdInv:1,mod:{potencia:620,fabricante:'QA',item:'mod'},inv:{fabricante:'QA',potenciaNominalSaida:5},itens:[],detalhe:{frete:100}}];`,ctx);
 const jwt='x.'+Buffer.from(JSON.stringify({sub:'user'})).toString('base64url')+'.x';
 const res=await handler(new Request('https://qa.invalid',{method:'POST',headers:{Authorization:'Bearer '+jwt},body:JSON.stringify({acao:'cotar',provedor:'belenus',placas:10,...(modo?{precificacao:modo}:{})})}));
 return {status:res.status,data:await res.json(),writes,prices};
}
test('Markup continua como padrão e não consulta centro de custo',async()=>{const r=await fixture('gestor');assert.equal(r.prices.length,0);assert.equal(r.writes[0].precificacao.modo,'markup');assert.equal(r.writes[0].preco,12071.85);});
test('Custos usa a unidade autenticada, dimensões e custo com frete; grava snapshot',async()=>{const r=await fixture('gestor','custos');assert.equal(r.status,200);assert.equal(r.data.kits[0].preco,12345.67);assert.deepEqual(r.prices[0],{p_franquia_id:'f',p_kit:6800,p_modulos:10,p_kwp:6.2});assert.equal(r.writes[0].precificacao.linhas.instalacao.b,'modulo');assert.equal(r.data.kits[0].custo,undefined);assert.equal(r.data.kits[0].precificacao,undefined);});
test('Vendedor não pode trocar para custos e modo inválido é rejeitado',async()=>{assert.equal((await fixture('vendedor','custos')).status,403);assert.equal((await fixture('admin','errado')).status,400);});
test('Erro de custos não volta silenciosamente para markup',async()=>{const r=await fixture('admin','custos',true);assert.equal(r.data.ok,false);assert.equal(r.writes.length,0);});
