// ==========================================
// MODO TREINO
// ==========================================
// A plataforma roda com as telas e regras reais, mas sem gravar nada: no
// treino o supabaseClient (config.js) é trocado por TREINO.criarCliente(), que
//  - lê do banco real só o que é catálogo/configuração (LEITURA_REAL: kits,
//    preços, cidades, franquia, perfil...), nunca dados de clientes;
//  - guarda clientes, propostas, vendas etc. só na memória desta aba;
//  - nunca envia escrita: insert/update/upsert/delete vão sempre pra memória,
//    RPC só passa se for leitura conhecida (RPC_REAL), storage e edge
//    functions são de mentira.
// Saídas para fora (WhatsApp, link da proposta, popups) ficam bloqueadas.
// O treino vale só para a aba atual (sessionStorage) e acaba com TREINO.sair().
// Carregado ANTES do config.js.

(function () {
  const CHAVE = 'treino_v1';
  const UI_KEYS = ['app_ui_v1', 'app_scroll_v1']; // estado salvo pelo F5 (app.js)

  let cfg = null;
  try { cfg = JSON.parse(sessionStorage.getItem(CHAVE) || 'null'); } catch (e) { cfg = null; }

  // Catálogo e configuração: leitura real (nunca dados de cliente).
  const LEITURA_REAL = new Set([
    'produtos', 'componentes', 'v_componentes_public', 'precos_franquia', 'franquias', 'financiadoras',
    'custos_extras', 'distribuidoras', 'distribuidora_componentes', 'cidades_hsp', 'profiles',
    'documentos_config', 'etiquetas', 'eng_modulos', 'eng_inversores', 'crm_metas', 'vendedores_stats',
    'user_accounts',
  ]);
  // RPCs só de leitura (acessos e nomes). Qualquer outra é respondida pelo treino.
  const RPC_REAL = new Set([
    'is_current_user_active', 'om_can_use_current_user', 'fin_can_use_current_user',
    'vis_can_use_current_user', 'is_eng_central', 'get_vendedores_nomes', 'get_om_flags', 'get_centro_custo',
  ]);
  const RPC_FALSA = {
    check_cliente_telefone: () => ({ existe: false }),
    chat_can_use_current_user: () => false,
  };

  function limparEstadoTela() {
    UI_KEYS.forEach((k) => { try { sessionStorage.removeItem(k); } catch (e) { /* sem storage */ } });
    if (window.location.hash) history.replaceState(history.state, '', window.location.pathname + window.location.search);
  }

  // ---------- banco na memória ----------
  const banco = {};
  const agora = () => new Date().toISOString();
  const copia = (o) => JSON.parse(JSON.stringify(o));
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'treino-' + Date.now() + '-' + Math.random().toString(16).slice(2));

  function tabela(nome) {
    if (!banco[nome]) {
      banco[nome] = [];
      if (nome === 'clientes') semearClientes(banco[nome]);
    }
    return banco[nome];
  }

  // Dois clientes de exemplo para o "Já é cliente".
  function semearClientes(lista) {
    const st = typeof state !== 'undefined' ? state : {};
    const base = { vendedor_email: st.currentUser?.email || null, franquia_id: st.franquiaId || null, status: 'NOVO', origem: 'indicacao' };
    lista.push(
      { ...base, id: uid(), created_at: agora(), nome: 'MARIA EXEMPLO DA SILVA', telefone: '(18) 99999-0001', cidade: 'ARAÇATUBA/SP', uf: 'SP', cidade_ibge: 3502804, hsp: 5.29 },
      { ...base, id: uid(), created_at: agora(), nome: 'CARLOS EXEMPLO SOUZA', telefone: '(12) 99999-0002', cidade: 'SÃO JOSÉ DOS CAMPOS/SP', uf: 'SP', cidade_ibge: 3549904, hsp: 4.63 },
    );
  }

  const igual = (a, b) => String(a) === String(b);
  const padrao = (p, flags) => new RegExp('^' + String(p).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.') + '$', flags);

  function consultaMemoria(nomeTabela) {
    const q = { op: 'select', filtros: [], ordem: [], ini: 0, fim: null, unico: null, valores: null, retornar: false, contar: null, cabeca: false };
    const filtro = (f) => { q.filtros.push(f); return proxy; };
    const api = {
      select(_cols, opts) {
        if (q.op !== 'select') q.retornar = true;
        if (opts && opts.count) q.contar = opts.count;
        if (opts && opts.head) q.cabeca = true;
        return proxy;
      },
      insert(v) { q.op = 'insert'; q.valores = Array.isArray(v) ? v : [v]; return proxy; },
      upsert(v, o) { q.op = 'upsert'; q.valores = Array.isArray(v) ? v : [v]; q.chave = (o && o.onConflict) || 'id'; return proxy; },
      update(v) { q.op = 'update'; q.valores = v; return proxy; },
      delete() { q.op = 'delete'; return proxy; },
      eq: (c, v) => filtro((r) => igual(r[c], v)),
      neq: (c, v) => filtro((r) => !igual(r[c], v)),
      gt: (c, v) => filtro((r) => r[c] > v),
      gte: (c, v) => filtro((r) => r[c] >= v),
      lt: (c, v) => filtro((r) => r[c] < v),
      lte: (c, v) => filtro((r) => r[c] <= v),
      in: (c, arr) => filtro((r) => (arr || []).some((v) => igual(r[c], v))),
      is: (c, v) => filtro((r) => (v === null ? r[c] == null : r[c] === v)),
      like: (c, p) => filtro((r) => padrao(p).test(String(r[c] ?? ''))),
      ilike: (c, p) => filtro((r) => padrao(p, 'i').test(String(r[c] ?? ''))),
      match: (obj) => filtro((r) => Object.entries(obj || {}).every(([c, v]) => igual(r[c], v))),
      not: (c, op, v) => filtro((r) => !(op === 'is' ? (v === null ? r[c] == null : r[c] === v) : op === 'in' ? String(v).replace(/[()]/g, '').split(',').some((x) => igual(r[c], x)) : igual(r[c], v))),
      order(c, o) { q.ordem.push([c, !(o && o.ascending === false)]); return proxy; },
      limit(n) { q.fim = q.ini + n - 1; return proxy; },
      range(a, b) { q.ini = a; q.fim = b; return proxy; },
      single() { q.unico = 'single'; return proxy; },
      maybeSingle() { q.unico = 'maybe'; return proxy; },
      then(ok, falha) { return Promise.resolve().then(executar).then(ok, falha); },
      catch(falha) { return Promise.resolve().then(executar).catch(falha); },
    };
    // filtros que o treino não entende (or, contains, textSearch...) não filtram nada
    const proxy = new Proxy(api, { get: (t, p) => (p in t ? t[p] : typeof p === 'symbol' ? undefined : () => proxy) });

    function executar() {
      const lista = tabela(nomeTabela);
      const passa = (r) => q.filtros.every((f) => f(r));
      let linhas = [];
      if (q.op === 'insert' || q.op === 'upsert') {
        q.valores.forEach((v) => {
          const existente = q.op === 'upsert' && v[q.chave] != null ? lista.find((r) => igual(r[q.chave], v[q.chave])) : null;
          if (existente) { Object.assign(existente, copia(v), { updated_at: agora() }); linhas.push(existente); return; }
          const nova = { id: uid(), created_at: agora(), updated_at: agora(), ...copia(v) };
          lista.push(nova);
          linhas.push(nova);
        });
        if (!q.retornar) return { data: null, error: null };
      } else if (q.op === 'update') {
        linhas = lista.filter(passa);
        linhas.forEach((r) => Object.assign(r, copia(q.valores), { updated_at: agora() }));
        if (!q.retornar) return { data: null, error: null };
      } else if (q.op === 'delete') {
        linhas = lista.filter(passa);
        banco[nomeTabela] = lista.filter((r) => !linhas.includes(r));
        if (!q.retornar) return { data: null, error: null };
      } else {
        linhas = lista.filter(passa);
        q.ordem.slice().reverse().forEach(([c, asc]) => {
          linhas.sort((a, b) => (a[c] === b[c] ? 0 : (a[c] > b[c] ? 1 : -1)) * (asc ? 1 : -1));
        });
      }
      const total = linhas.length;
      if (q.op === 'select') linhas = linhas.slice(q.ini, q.fim == null ? undefined : q.fim + 1);
      const data = q.cabeca ? null : copia(linhas);
      if (q.unico === 'single') {
        return data && data.length === 1 ? { data: data[0], error: null }
          : { data: null, error: { code: 'PGRST116', message: 'Nenhum registro no modo treino.' } };
      }
      if (q.unico === 'maybe') return { data: data && data.length ? data[0] : null, error: null };
      return { data, error: null, count: q.contar ? total : null };
    }
    return proxy;
  }

  // ---------- cliente do treino ----------
  function criarCliente(real) {
    const ESCRITA = new Set(['insert', 'update', 'upsert', 'delete']);
    const from = (t) => {
      if (!LEITURA_REAL.has(t)) return consultaMemoria(t);
      const leitura = real.from(t);
      return new Proxy(leitura, {
        get(alvo, p) {
          if (ESCRITA.has(p)) return (...args) => consultaMemoria(t)[p](...args);
          const v = alvo[p];
          return typeof v === 'function' ? v.bind(alvo) : v;
        },
      });
    };
    const rpc = (nome, args) => {
      if (RPC_REAL.has(nome)) return real.rpc(nome, args);
      const resposta = RPC_FALSA[nome] ? RPC_FALSA[nome](args) : (/^(list_|find_|get_crm_)/.test(nome) ? [] : null);
      return Promise.resolve({ data: resposta, error: null });
    };
    const arquivo = {
      upload: async (path) => ({ data: { path }, error: null }),
      remove: async () => ({ data: [], error: null }),
      list: async () => ({ data: [], error: null }),
      createSignedUrl: async () => ({ data: { signedUrl: '' }, error: null }),
      createSignedUrls: async () => ({ data: [], error: null }),
      getPublicUrl: () => ({ data: { publicUrl: '' } }),
      download: async () => ({ data: null, error: { message: 'Arquivo indisponível no modo treino.' } }),
    };
    const storage = { from: () => arquivo };
    const functions = { invoke: async () => ({ data: null, error: { message: 'Indisponível no modo treino.' } }) };
    const auth = new Proxy(real.auth, {
      get(alvo, p) {
        if (p === 'updateUser') return async () => ({ data: { user: (await alvo.getUser()).data.user }, error: null });
        if (p === 'signOut') return (...a) => { sair(false); return alvo.signOut(...a); };
        const v = alvo[p];
        return typeof v === 'function' ? v.bind(alvo) : v;
      },
    });
    return new Proxy(real, {
      get(alvo, p) {
        if (p === 'from') return from;
        if (p === 'rpc') return rpc;
        if (p === 'storage') return storage;
        if (p === 'functions') return functions;
        if (p === 'auth') return auth;
        const v = alvo[p];
        return typeof v === 'function' ? v.bind(alvo) : v;
      },
    });
  }

  // ---------- entrar / sair ----------
  function entrar(tour) {
    try { sessionStorage.setItem(CHAVE, JSON.stringify({ tour: tour || null, desde: Date.now() })); } catch (e) { return false; }
    limparEstadoTela();
    window.location.reload();
    return true;
  }

  function sair(recarregar = true) {
    try {
      sessionStorage.removeItem(CHAVE);
      sessionStorage.setItem('treino_saiu', '1');
    } catch (e) { /* sem storage */ }
    limparEstadoTela();
    if (recarregar) window.location.reload();
  }

  // ---------- tela (só no treino) ----------
  function avisoBloqueado() {
    if (typeof showToast === 'function') showToast('No modo treino nada é enviado.');
  }

  function montarTela() {
    document.documentElement.classList.add('modo-treino');
    const faixa = document.createElement('div');
    faixa.id = 'treino-faixa';
    faixa.setAttribute('role', 'status');
    faixa.innerHTML = '<span><b>Modo treino</b> · nada do que for feito aqui é salvo</span><button type="button" id="treino-sair">Sair do treino</button>';
    document.body.appendChild(faixa);
    document.getElementById('treino-sair').addEventListener('click', () => sair());

    // links que saem da plataforma: WhatsApp, proposta, PDF, sites
    document.addEventListener('click', (e) => {
      const a = e.target.closest && e.target.closest('a[href]');
      if (!a) return;
      const href = a.getAttribute('href') || '';
      if (/^(https?:|mailto:|tel:)|proposta(-pdf)?\.html/i.test(href) && !href.startsWith(window.location.origin + '/#')) {
        e.preventDefault();
        e.stopImmediatePropagation();
        avisoBloqueado();
      }
    }, true);

    window.open = () => null;
    window.handleProposalLinkOpen = (link) => { if (typeof copiarTextoBlindado === 'function') copiarTextoBlindado(link); };
    // métricas: no treino só os eventos do tour, marcados como treino
    const capturar = window.captureEvent;
    if (typeof capturar === 'function') {
      window.captureEvent = (nome, props) => { if (/^tour_/.test(nome)) capturar(nome, { ...(props || {}), treino: true }); };
    }
  }

  window.TREINO = {
    ativo: Boolean(cfg),
    tour: cfg ? cfg.tour : null,
    criarCliente,
    entrar,
    sair,
  };

  if (cfg) document.addEventListener('DOMContentLoaded', montarTela);
})();
