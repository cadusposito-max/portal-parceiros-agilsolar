// Coleta AVT (Solaryum) — roda na página do portal AVT. Resumível, com backup em IndexedDB.
(async () => {
  const A = window.__A = window.__A || {};
  A.auth = () => 'Bearer ' + JSON.parse(localStorage.token).accessToken;
  A.api = async (path, body) => {
    const r = await fetch(localStorage.urlApi + path, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Authorization': A.auth() }, body: body ? JSON.stringify(body) : undefined });
    const t = await r.text(); try { return { s: r.status, j: JSON.parse(t) }; } catch (_) { return { s: r.status, t: t.slice(0, 300) }; }
  };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  // IndexedDB
  const idb = () => new Promise((ok, err) => { const q = indexedDB.open('avtColeta', 1); q.onupgradeneeded = () => q.result.createObjectStore('kv'); q.onsuccess = () => ok(q.result); q.onerror = () => err(q.error); });
  A.put = async (k, v) => { const db = await idb(); await new Promise((ok, err) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(v, k); tx.oncomplete = ok; tx.onerror = () => err(tx.error); }); db.close(); };
  A.get = async (k) => { const db = await idb(); const v = await new Promise((ok, err) => { const q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => ok(q.result); q.onerror = () => err(q.error); }); db.close(); return v; };

  // Estado
  A.D = (await A.get('dados')) || null;
  if (!A.D) {
    A.D = { sweep: { res: {}, fil: {}, painel: {} }, precos: {}, est: {}, freteCid: {} };
    try { const b = JSON.parse(localStorage.getItem('__avtSweepBackup') || 'null'); if (b) { A.D.sweep.res = b.res; A.D.sweep.painel = b.painel || {}; for (const [k, vt] of Object.entries(b.filVT || {})) A.D.sweep.fil[k] = { vt }; } } catch (_) {}
  }
  A.status = A.status || {};
  const D = A.D;
  const base0 = { fase: 0, idPainel: 0, qtdPainel: 0, tensao: 1, fileiras: [], idMarca: null, idFornecedorPainel: 1, buscarMicroinversores: false, potenciaTotal: 0, idCliente: 5127, percentual: 2, valorDa: 91.05, ibge: '3502804', uf: 'SP', incluirStringBox: true, tipoInv: 0, idMarcaStringbox: null };
  const prod = async (id) => (await A.api('/api/Produto/Buscar?idProduto=' + id + '&buscarValoresFornecedor=true&idFornecedorPainel=1')).j;
  const parar = (nome, r) => { if (r.s === 401) { A.status[nome] = 'parou'; return true; } return false; };

  A.runners = {
    precos: async () => {
      for (const fam of [1, 2, 3, 4, 5, 6]) {
        const r = await A.api('/api/Produto/ListarPorFamilia?familia=' + fam + '&distribuidor=false'); if (parar('precos', r)) return;
        for (const p of (r.j || [])) {
          if (D.precos[p.idProduto]) continue;
          const d = await A.api('/api/Produto/Buscar?idProduto=' + p.idProduto + '&buscarValoresFornecedor=true&idFornecedorPainel=1'); if (parar('precos', d)) return;
          const j = d.j || {};
          D.precos[p.idProduto] = { fam, id: p.idProduto, cod: j.codBarra, erp: j.codErp, desc: (j.descricao || p.descricao || '').trim(), preco: j.precoVenda, avulso: j.precoAvulso, estoque: j.qtEstoque, reserva: j.qtReserva, situacao: j.situacao, marca: j.marca, peso: j.peso, potencia: j.potencia, larg: j.largura, comp: j.comprimento, alt: j.altura, dataPreco: j.dataPreco, obs: (j.obs || '').slice(0, 600) };
          await sleep(150);
        }
      }
      A.status.precos = 'ok';
    },
    sweep: async () => {
      const S = D.sweep; const paineis = [[45242, 610], [45220, 620], [45264, 600], [45227, 650], [45239, 720]];
      for (const [idPainel, wp] of paineis) {
        const d = await prod(idPainel); if (!d) { A.status.sweep = 'parou'; return; }
        S.painel[idPainel] = { wp, preco: d.precoVenda, codErp: d.codErp, desc: d.descricao, dims: [d.largura, d.comprimento, d.altura] };
        for (let n = 4; n <= 150; n++) {
          const modos = [];
          if (n >= 5 && n <= 35) modos.push(['mono', 0, 1, false]);
          if (n >= 12) { modos.push(['tri220', 2, 1, false]); modos.push(['tri380', 2, 2, false]); }
          modos.push(['micro', 0, 1, true]);
          for (const [nome, fase, tensao, micro] of modos) {
            const key = idPainel + '|' + n + '|' + nome; if (S.res[key]) continue;
            const pot = +(n * wp / 1000).toFixed(2); const filKey = idPainel + '|' + n + '|' + (micro ? 1 : 0);
            const fb = { larguraPainel: d.largura, comprimentoPainel: d.comprimento, alturaPainel: d.altura, idFornecedorPainel: 1, orientacao: 'retrato', numPaineis: n, fileiras: 1, uf: 'SP', telhado: 0, referenciaPainel: null, potenciaTotal: pot, idPainel, codErpPainel: d.codErp, qtdTotalModulosTodosLayouts: n, microInversor: micro, tipoInversor: micro ? 1 : 0, idFornecedorEstrutura: 19, idDistribuidor: null, fornecedor: 0 };
            const rf = await A.api('/api/Pedido/AtualizarFileira', fb); if (parar('sweep', rf)) return;
            if (rf.s !== 200) { S.res[key] = { erro: 'fil ' + rf.s }; continue; }
            S.fil[filKey] = { vt: rf.j.valorTotal, itens: (rf.j.itens || []).map(i => [i.produto, i.qt, i.pUnitario]) };
            const b = { ...base0, fase, tensao, idPainel, qtdPainel: n, potenciaTotal: pot, fileiras: [rf.j], buscarMicroinversores: micro, tipoInv: micro ? 1 : 0 };
            let rl; try { rl = await A.api('/api/Pedido/BuscarCombinacoes', b); } catch (e) { await sleep(3000); continue; }
            if (parar('sweep', rl)) return;
            S.res[key] = Array.isArray(rl.j) ? rl.j.map(c => [c.idInversor, c.inversor.trim(), c.valorTotal, c.valorFinal, c.idAgrupamentoStringbox]) : { erro: rl.s + ' ' + String(rl.j || rl.t).slice(0, 80) };
            await sleep(150);
          }
        }
      }
      A.status.sweep = 'ok';
    },
    est: async () => {
      const tcl = await prod(45242), lp = await prod(45239); if (!tcl || !lp) { A.status.est = 'parou'; return; }
      for (const [d, wp] of [[tcl, 610], [lp, 720]]) for (const tel of [0, 1, 8, 4, 7, 5, 6, 12]) for (let n = 1; n <= 150; n++) {
        if (d.idProduto === 45239 && !(n <= 20 || n % 10 === 0)) continue;
        if (d.idProduto === 45242 && n > 40 && n % 5 !== 0) continue;
        for (const micro of [false, true]) {
          if (micro && !(n <= 12 || n % 10 === 0)) continue;
          const key = d.idProduto + '|' + tel + '|' + n + '|' + (micro ? 1 : 0); if (D.est[key]) continue;
          const fb = { larguraPainel: d.largura, comprimentoPainel: d.comprimento, alturaPainel: d.altura, idFornecedorPainel: 1, orientacao: 'retrato', numPaineis: n, fileiras: 1, uf: 'SP', telhado: tel, referenciaPainel: null, potenciaTotal: +(n * wp / 1000).toFixed(2), idPainel: d.idProduto, codErpPainel: d.codErp, qtdTotalModulosTodosLayouts: n, microInversor: micro, tipoInversor: micro ? 1 : 0 };
          const r = await A.api('/api/Pedido/BuscarFornecedoresEstrutura', fb); if (parar('est', r)) return;
          D.est[key] = Array.isArray(r.j) ? r.j.map(f => [f.idFornecedorEstrutura, f.nome, f.valorTotal, (f.itens || []).map(i => [i.produto, i.qt, i.pUnitario])]) : { erro: r.s };
          await sleep(80);
        }
      }
      A.status.est = 'ok';
    },
    freteCid: async () => {
      const cidades = { Aracatuba: '3502804', Caraguatatuba: '3510500', Goiania: '5208707', Londrina: '4113700', RioClaro: '3543907', SJC: '3549904', Ubatuba: '3555406', Varginha: '3170701' };
      const vals = []; for (let v = 500; v <= 20000; v += 250) vals.push(v); for (let v = 21000; v <= 60000; v += 1000) vals.push(v); for (let v = 65000; v <= 300000; v += 5000) vals.push(v);
      for (const [nome, ibge] of Object.entries(cidades)) {
        const arr = D.freteCid[nome] = D.freteCid[nome] || []; const feitos = new Set(arr.map(p => p[0]));
        for (const v of vals) {
          if (feitos.has(v)) continue;
          const r = await A.api('/api/Pedido/CalcularValorFinal', { idCliente: 5127, origem: 0, idFornecedor: 1, potencia: 4.27, percentual: 2, ibge, valor: v, valorDa: +(v * 0.02).toFixed(2) }); if (parar('freteCid', r)) return;
          arr.push([v, r.j]); await sleep(60);
        }
      }
      A.status.freteCid = 'ok';
    },
  };

  A.iniciar = (nome) => { if (A.status[nome] === 'rodando' || A.status[nome] === 'ok') return; A.status[nome] = 'rodando'; A.runners[nome]().catch(e => { A.status[nome] = 'erro: ' + e; }); };
  A.baixar = () => {
    const blob = new Blob([JSON.stringify({ gerado: new Date().toISOString(), cidade: 'Araçatuba-SP 3502804', cd: 'TRÊS LAGOAS - MS', ...D })], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'avt_varredura.json'; document.body.appendChild(a); a.click(); a.remove();
    A.baixado = new Date().toISOString(); return blob.size;
  };
  clearInterval(A.tick);
  A.tick = setInterval(async () => {
    try { await A.put('dados', D); A.salvo = new Date().toISOString(); } catch (e) { A.erroSalvar = String(e); }
    let exp = null; try { exp = JSON.parse(localStorage.token).expirationDate; } catch (_) {}
    for (const nome of Object.keys(A.runners)) if (A.status[nome] === 'parou' && exp && new Date(exp) > new Date() && exp !== A['exp_' + nome]) { A['exp_' + nome] = exp; A.status[nome] = null; A.iniciar(nome); }
    if (Object.keys(A.runners).every(n => A.status[n] === 'ok') && !A.baixado) A.baixar();
  }, 30000);
  for (const nome of Object.keys(A.runners)) { if (!A.status[nome] || A.status[nome] === 'parou') { A.status[nome] = null; A.iniciar(nome); } }
  return 'ok';
})();
