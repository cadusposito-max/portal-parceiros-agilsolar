// ==========================================
// TIMELINE UNIFICADA — a ficha do comercial e o card da engenharia contam a
// mesma história do cliente
// ==========================================
// Cada tela lê as duas tabelas: crm_atividades (comercial) e eng_eventos
// (engenharia). A RLS de cada uma continua valendo: comentário interno da
// engenharia só a engenharia lê. Nada é copiado de uma tabela para a outra.
//
// - origem de cada evento: Comercial · Engenharia · Obra (filtro no topo);
// - ajustes técnicos da engenharia (dimensionamento, edição, compensação)
//   ficam recolhidos na ficha e abertos no card;
// - a engenharia já grava uma cópia de cada status em crm_atividades
//   (tipo 'engenharia', meta.projeto_id). Com o evento original carregado, a
//   cópia sai da lista para não aparecer duas vezes.
//
// Depende de: config.js (supabaseClient), utils.js (escapeHTML).
// Usado por: crm.js (ficha) e eng-v2.js (card do projeto).

(function () {
  const esc = (s) => (typeof escapeHTML === 'function' ? escapeHTML(String(s ?? '')) : String(s ?? ''));
  const ORIGENS = [['tudo', 'Tudo'], ['com', 'Comercial'], ['eng', 'Engenharia'], ['obra', 'Obra']];
  const ROTULO = { com: 'Comercial', eng: 'Engenharia', obra: 'Obra' };
  const TECNICOS = ['dimensionamento', 'edicao', 'compensacao'];
  // filtro por tela; volta para "Tudo" quando abre outro cliente/projeto
  const F = { ficha: { chave: null, f: 'tudo', tec: false }, eng: { chave: null, f: 'tudo', tec: true } };
  const PADRAO_TEC = { ficha: false, eng: true };
  const repintar = {};

  // ---- origem ---------------------------------------------------------------
  function origemCrm(a) {
    if (a.tipo === 'venda' && a.meta && a.meta.acao === 'obra') return 'obra';
    if (a.tipo === 'engenharia') return 'eng';
    return 'com';
  }
  function origemEng(e) {
    return e.tipo === 'alerta' && /^obra\b/i.test(String(e.texto || '')) ? 'obra' : 'eng';
  }
  const tecnicoEng = (e) => TECNICOS.includes(e.tipo);

  function semEspelho(atividades, projetoIds) {
    const ids = new Set((projetoIds || []).map(String));
    return (atividades || []).filter((a) => !(a.tipo === 'engenharia' && a.meta && a.meta.projeto_id && ids.has(String(a.meta.projeto_id))));
  }

  // ---- leitura ----------------------------------------------------------------
  // ficha: eventos dos projetos do cliente na engenharia (null = não deu para ler)
  async function engDoCliente(clienteId) {
    const { data: ps, error } = await supabaseClient.from('eng_projetos').select('id, numero, status').eq('cliente_id', clienteId);
    if (error) { console.warn('[timeline] projetos da engenharia:', error.message); return null; }
    if (!ps || !ps.length) return { projetos: [], eventos: [] };
    const { data: ev, error: e2 } = await supabaseClient.from('eng_eventos').select('*')
      .in('projeto_id', ps.map((p) => p.id)).order('created_at', { ascending: false }).limit(150);
    if (e2) { console.warn('[timeline] eventos da engenharia:', e2.message); return null; }
    return { projetos: ps, eventos: ev || [] };
  }
  // card: o que o comercial registrou do cliente (null = não deu para ler)
  async function crmDoCliente(clienteId) {
    const { data, error } = await supabaseClient.from('crm_atividades').select('*')
      .eq('cliente_id', clienteId).order('created_at', { ascending: false }).limit(120);
    if (error) { console.warn('[timeline] atividades do comercial:', error.message); return null; }
    return data || [];
  }

  // ---- filtro -------------------------------------------------------------------
  // itens: [{ origem, tecnico, ... }] → { lista, barra } (barra = HTML do filtro)
  function filtrar(tela, chave, itens) {
    const st = F[tela];
    if (st.chave !== chave) Object.assign(st, { chave, f: 'tudo', tec: PADRAO_TEC[tela] });
    if (st.forcar) Object.assign(st, { forcar: false, f: 'tudo', tec: true });
    const cont = { tudo: itens.length, com: 0, eng: 0, obra: 0 };
    itens.forEach((i) => { cont[i.origem] = (cont[i.origem] || 0) + 1; });
    if (st.f !== 'tudo' && !cont[st.f]) st.f = 'tudo';
    let lista = st.f === 'tudo' ? itens : itens.filter((i) => i.origem === st.f);
    const nTec = lista.filter((i) => i.tecnico).length;
    const mostraTec = st.tec || st.f === 'eng';
    if (!mostraTec) lista = lista.filter((i) => !i.tecnico);
    const chips = ORIGENS.filter(([k]) => k === 'tudo' || cont[k]).map(([k, n]) =>
      `<button type="button" class="tlu-chip ${st.f === k ? 'on' : ''}" onclick="TLU.filtro('${tela}','${k}')">${n}<em>${cont[k]}</em></button>`).join('');
    const tec = nTec && st.f !== 'eng'
      ? `<button type="button" class="tlu-tec" onclick="TLU.tec('${tela}')">${mostraTec ? 'Esconder ajustes técnicos' : `Mostrar ajustes técnicos (${nTec})`}</button>` : '';
    // um filtro só faz sentido com mais de uma origem
    const origens = ['com', 'eng', 'obra'].filter((k) => cont[k]).length;
    return { lista, barra: origens > 1 || tec ? `<div class="tlu-filtro">${origens > 1 ? chips : ''}${tec}</div>` : '' };
  }

  function tagHTML(origem, interno) {
    if (interno) return '<span class="tlu-ori int">Interno</span>';
    return `<span class="tlu-ori ${origem}">${ROTULO[origem] || ''}</span>`;
  }

  window.TLU = {
    origemCrm, origemEng, tecnicoEng, semEspelho, engDoCliente, crmDoCliente, filtrar, tagHTML,
    aoMudar: (tela, fn) => { repintar[tela] = fn; },
    filtro: (tela, f) => { F[tela].f = f; if (repintar[tela]) repintar[tela](); },
    tec: (tela) => { F[tela].tec = !F[tela].tec; if (repintar[tela]) repintar[tela](); },
    // aberto pelo sininho: o evento tem que aparecer
    mostrarTudo: (tela) => { F[tela].forcar = true; },
  };
})();
