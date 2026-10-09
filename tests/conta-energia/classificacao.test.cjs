const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../../assets/js/crm-arquivos.js'), 'utf8');
function setup(rpc = async () => ({ data: [], error: null })) {
  const messages = [], calls = [];
  const context = vm.createContext({ console: { error() {}, warn() {} }, window: {}, document: { getElementById() { return null; } },
    escapeHTML: s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    showToast: message => messages.push(message), supabaseClient: { rpc: (...args) => { calls.push(args); return rpc(...args); } } });
  vm.runInContext(source, context);
  vm.runInContext(`var client = { id: 'cliente-1' }; function _crm360Client() { return client; }
    _crmArq = { clienteId: client.id, rows: [], urls: {}, abertos: new Set() };
    crmArqRender = () => {}; _crmArqTimeline = async () => {};`, context);
  return { context, messages, calls, run: code => vm.runInContext(code, context) };
}
test('Uma geradora e todas as contas identificadas concluem somente um item', () => {
  const { run } = setup();
  for (const slots of [[], [null], ['compensacao'], ['geradora', null], ['geradora', 'geradora']]) {
    assert.equal(run(`_crmArqItemFeito({tipo:'conta_energia'}, ${JSON.stringify(slots)}.map(slot=>({tipo:'conta_energia',slot})), {})`), false);
  }
  for (const slots of [['geradora'], ['geradora', 'compensacao', 'compensacao']]) {
    assert.equal(run(`_crmArqItemFeito({tipo:'conta_energia'}, ${JSON.stringify(slots)}.map(slot=>({tipo:'conta_energia',slot})), {})`), true);
  }
  assert.equal(run(`_crmArqProgresso([{tipo:'conta_energia',slot:'geradora'},{tipo:'conta_energia',slot:'compensacao'}],{}).feitos`), 1);
  assert.equal(run(`_crmArqProgresso([{tipo:'conta_energia',slot:'geradora'}],{}).total`), 10);
});
test('Troca da geradora usa o resultado atômico e preserva os nomes', async () => {
  const { run, calls } = setup(async () => ({ data: [{ arquivo_id: 'a', funcao: null }, { arquivo_id: 'b', funcao: 'geradora' }], error: null }));
  run(`_crmArq.rows = [{id:'a',tipo:'conta_energia',slot:'geradora',nome_original:'Original.pdf'},{id:'b',tipo:'conta_energia',slot:'compensacao',nome_original:'Outra.pdf'}]`);
  await run(`crmArqClassificarConta('b','geradora')`);
  assert.equal(run(`_crmArq.rows[0].slot`), null);
  assert.equal(run(`_crmArq.rows[1].slot`), 'geradora');
  assert.equal(run(`_crmArq.rows[0].nome_original`), 'Original.pdf');
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'crm_classificar_conta_energia');
});
test('Falha ou resposta vazia preserva a identificação anterior', async () => {
  for (const result of [{ data: null, error: { message: 'sem permissão' } }, { data: [], error: null }]) {
    const { run, messages } = setup(async () => result);
    run(`_crmArq.rows = [{id:'a',tipo:'conta_energia',slot:'compensacao'}]`);
    await run(`crmArqClassificarConta('a','geradora')`);
    assert.equal(run(`_crmArq.rows[0].slot`), 'compensacao');
    assert.equal(run(`_crmArqClassificando`), null);
    assert.match(messages.at(-1), /Não foi possível salvar/);
  }
});
test('Duplo clique e navegação durante a gravação não corrompem outra ficha', async () => {
  let release;
  const { run, calls } = setup(() => new Promise(resolve => { release = resolve; }));
  run(`_crmArq.rows = [{id:'a',tipo:'conta_energia',slot:null}]`);
  const pending = run(`crmArqClassificarConta('a','geradora')`);
  await run(`crmArqClassificarConta('a','compensacao')`);
  assert.equal(calls.length, 1);
  run(`client = {id:'cliente-2'}; _crmArq = {clienteId:client.id,rows:[{id:'a',tipo:'conta_energia',slot:'compensacao'}]}`);
  release({ data: [{ arquivo_id: 'a', funcao: 'geradora' }], error: null });
  await pending;
  assert.equal(run(`_crmArq.rows[0].slot`), 'compensacao');
});
test('HTML mantém nome original escapado e controles de identificação acessíveis', () => {
  const { run } = setup();
  const html = run(`_crmArqContasHTML([{id:'a',tipo:'conta_energia',nome_original:'<img onerror="x">.pdf',slot:null}])`);
  assert.ok(html.includes('&lt;img onerror=&quot;x&quot;&gt;.pdf'));
  assert.ok(html.includes('aria-pressed="false"'));
  assert.ok(html.includes('role="group"'));
  assert.ok(!html.includes('<input'));
});
test('Engenharia mostra a identificação atual preservando o snapshot original', () => {
  let engineering = fs.readFileSync(path.join(__dirname, '../../assets/js/eng-v2.js'), 'utf8');
  engineering = engineering.replace(/\}\)\(\);\s*$/, 'window.__test = { E, docsProjeto }; })();');
  const context = vm.createContext({ window: { addEventListener() {} }, document: { addEventListener() {} }, localStorage: { getItem() { return null; } }, console });
  vm.runInContext(engineering, context);
  const { E, docsProjeto } = context.window.__test;
  const snapshot = [{ id: 'a', tipo: 'conta_energia', slot: null, nome: 'Original.pdf' }, { id: 'b', tipo: 'conta_energia', slot: null, nome: 'Outra.pdf' }];
  E.docsNovos = { p1: snapshot.map((a, i) => ({ ...a, slot: i ? 'compensacao' : 'geradora' })) };
  const docs = docsProjeto({ id: 'p1', snapshot: { docs: snapshot } });
  assert.match(docs[0].rotulo, /Conta geradora/);
  assert.match(docs[1].rotulo, /Conta de compensação/);
  assert.equal(docs[0].nome, 'Original.pdf');
  assert.equal(snapshot[0].slot, null);
});
