// ==========================================================================
// AMBIENTE DOCUMENTAÇÃO — manuais, processos e modelos da rede
// --------------------------------------------------------------------------
// Abas: Início (busca + pastas + atualizados), Leitura obrigatória e Quem já
// leu (admin). Três tipos de documento (doc_documentos.tipo):
//   pagina — texto escrito aqui (HTML do editor; imagens e anexos guardados
//            em conteudo_arquivos e referenciados por data-arq);
//   pdf    — arquivo PDF; video — link do YouTube.
// Leitura obrigatória: "Li e entendi" grava doc_leituras com a versão; quem
// leu uma versão antiga volta a ter pendência quando o documento muda.
// Aviso no sininho: RPC doc_avisar (1 aviso por pessoa; lembrete 1x por dia).
// ==========================================================================
(function () {
  'use strict';
  const CT = window.CT;
  const sb = () => supabaseClient;
  const { esc, ic } = CT;

  const PASTAS = [
    ['comercial', 'Comercial', 'users', 'Proposta, atendimento e objeções'],
    ['eng', 'Engenharia', 'ruler', 'Documentos do cliente e homologação'],
    ['jur', 'Contratos e jurídico', 'scale', 'Modelos, procuração e garantias'],
    ['fin', 'Financeiro', 'wallet', 'Recebimentos, baixas e repasses'],
    ['rede', 'Regras da rede', 'shield-check', 'Políticas, marca e conduta'],
    ['trein', 'Treinamentos', 'graduation-cap', 'Vídeos e passo a passo da plataforma'],
  ];
  const pasta = (k) => PASTAS.find((p) => p[0] === k) || [k, k, 'folder', ''];
  const TIPO = { pagina: ['file-text', 'Página'], pdf: ['file-type', 'PDF'], video: ['circle-play', 'Vídeo'] };

  const D = {
    tab: 'inicio', container: null, docs: null, lidos: {}, carregando: null,
    view: 'lista', pasta: null, docId: null, de: 'inicio', q: '', achados: null, buscaT: 0,
    full: {}, resumo: null, vistas: null, editId: null, novoTipo: 'pagina', abrirDepois: null,
  };
  const doc = (id) => (D.docs || []).find((d) => d.id === id);
  const lido = (d) => (D.lidos[d.id] || 0) >= d.versao;
  const pendentes = () => (CT.admin() ? [] : (D.docs || []).filter((d) => d.obrigatorio && d.publicado && !lido(d)));
  const visiveis = () => (D.docs || []).filter((d) => CT.admin() || d.publicado);

  // ------------------------------------------------------------ dados
  async function carregar(forcar) {
    if (D.docs && !forcar) return;
    if (D.carregando) return D.carregando;
    D.carregando = (async () => {
      const { data, error } = await sb().from('doc_documentos')
        .select('id, pasta, tipo, titulo, resumo, arquivo_id, video_url, obrigatorio, prazo, publico, versao, publicado, autor_nome, updated_at, created_at')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      D.docs = data || [];
      const uid = state.currentUser && state.currentUser.id;
      if (uid) {
        const { data: l } = await sb().from('doc_leituras').select('doc_id, versao').eq('user_id', uid);
        D.lidos = Object.fromEntries((l || []).map((x) => [x.doc_id, x.versao]));
      }
    })().finally(() => { D.carregando = null; });
    return D.carregando;
  }
  async function carregarDoc(id) {
    if (D.full[id]) return D.full[id];
    const [{ data, error }, { data: vs }] = await Promise.all([
      sb().from('doc_documentos').select('*').eq('id', id).maybeSingle(),
      sb().from('doc_versoes').select('versao, mudou, autor_nome, created_at').eq('doc_id', id).order('versao', { ascending: false }).limit(8),
    ]);
    if (error) throw error;
    if (!data) return null;
    D.full[id] = { ...data, versoes: vs || [] };
    return D.full[id];
  }
  async function carregarResumo() {
    if (!CT.admin()) return;
    const [{ data: r }, { data: v }] = await Promise.all([sb().rpc('doc_leituras_resumo'), sb().rpc('doc_vistas_resumo')]);
    const por = {};
    (r || []).forEach((x) => { (por[x.doc_id] = por[x.doc_id] || []).push(x); });
    D.resumo = por;
    D.vistas = Object.fromEntries((v || []).map((x) => [x.doc_id, Number(x.pessoas)]));
  }

  function erroHTML(e) {
    const semTabela = /doc_documentos|relation|does not exist|schema cache/i.test(String(e && (e.message || e.details || e)));
    return CT.vazio('triangle-alert', semTabela ? 'A Documentação ainda não foi ativada no banco' : 'Não deu pra carregar a Documentação',
      semTabela ? 'Falta rodar a migration do Marketing e da Documentação no Supabase.' : 'Verifique a internet e tente de novo.',
      `<button class="ct-btn gh" data-dc="recarregar">${ic('rotate-cw')}Tentar de novo</button>`);
  }

  // ------------------------------------------------------------ rota
  function meta() {
    let t = 'Documentação', s = 'Tudo o que a rede precisa saber, num lugar só';
    if (D.view === 'pasta') { const p = pasta(D.pasta); t = p[1]; s = p[3]; }
    else if (D.view === 'doc' && doc(D.docId)) { s = pasta(doc(D.docId).pasta)[1]; } // o título já está grande no documento
    else if (D.view === 'editar') { t = D.editId ? 'Editar documento' : 'Novo documento'; s = ''; }
    else if (D.tab === 'obrigatoria') { t = 'Leitura obrigatória'; s = 'O que a Matriz pediu pra todo mundo ler'; }
    else if (D.tab === 'leituras') { t = 'Quem já leu'; s = 'Acompanhamento das leituras obrigatórias'; }
    CT.meta('docs:' + D.tab, t, s);
  }

  // A documentação mora em abas do ambiente Marketing (MKT_TABS_DOCS)
  function naDoc() { return state.environment === 'marketing' && MKT_TABS_DOCS.includes(state.mktActiveTab); }

  async function renderDocsRoute(container, tab) {
    D.container = container;
    const novo = tab || 'inicio';
    if (novo !== D.tab) { D.tab = novo; D.view = 'lista'; }
    if (D.tab === 'leituras' && !CT.admin()) D.tab = 'inicio';
    if (!D.docs) {
      meta();
      container.innerHTML = CT.carregando();
      CT.icons();
      try { await carregar(); } catch (e) { if (naDoc()) { container.innerHTML = erroHTML(e); ligar(container.firstChild); CT.icons(); } return; }
      if (!naDoc()) return;
    }
    if (D.abrirDepois) { const id = D.abrirDepois; D.abrirDepois = null; return abrirDoc(id); }
    pintar();
  }

  function pintar() {
    const c = D.container;
    if (!c || !naDoc()) return;
    meta();
    let html;
    if (D.view === 'editar') html = vEditar();
    else if (D.view === 'doc' && doc(D.docId)) html = vDoc();
    else if (D.view === 'pasta') html = vPasta();
    else if (D.tab === 'obrigatoria') html = vObrig();
    else if (D.tab === 'leituras') html = vLeituras();
    else html = vInicio();
    c.innerHTML = `<div class="ct-root" id="dc-root">${html}</div>`;
    ligar(c.firstChild);
    CT.icons();
    if (D.view === 'doc') posDoc();
    if (D.view === 'editar') posEditar();
    if (D.tab === 'leituras' && D.view === 'lista' && !D.resumo) carregarResumo().then(pintar).catch(() => {});
  }

  // ------------------------------------------------------------ listas
  function linhaDoc(d, comPasta) {
    const [i, n] = TIPO[d.tipo] || TIPO.pagina;
    const novo = Date.now() - new Date(d.updated_at).getTime() < 7 * 864e5;
    const selo = d.obrigatorio ? (CT.admin() ? '<span class="ct-pill ob">OBRIGATÓRIA</span>' : lido(d) ? '<span class="ct-pill ok">LIDO</span>' : '<span class="ct-pill ob">OBRIGATÓRIA</span>') : '';
    return `<button class="dc-row${d.publicado ? '' : ' oculto'}" data-dc="abrir" data-id="${d.id}"><span class="dc-ti ${d.tipo}">${ic(i)}</span>
      <span class="tx"><b>${esc(d.titulo)}</b>${selo}${novo ? '<span class="ct-pill novo">NOVO</span>' : ''}${d.publicado ? '' : '<span class="ct-pill rasc">RASCUNHO</span>'}
      <small>${comPasta ? esc(pasta(d.pasta)[1]) + ' · ' : ''}${n}${d.resumo ? ' · ' + esc(d.resumo) : ''}</small></span>
      <span class="dt">${CT.dataCurta(d.updated_at)}</span></button>`;
  }
  function bannerObrig() {
    const p = pendentes();
    if (!p.length) return '';
    const d = p[0];
    return `<div class="dc-obrig"><span class="ico">${ic('triangle-alert')}</span><div class="tx"><b>${p.length > 1 ? `${p.length} leituras obrigatórias pendentes` : 'Leitura obrigatória pendente'}</b>
      <small>${esc(d.titulo)}${d.prazo ? ' · ler até ' + CT.dataCurta(d.prazo) : ''}</small></div><button class="ct-btn or" data-dc="abrir" data-id="${d.id}">Ler agora</button></div>`;
  }
  function busca() {
    return `<div class="ct-tools"><label class="ct-search grande">${ic('search')}<input id="dc-q" placeholder="Como faço…? Busque um assunto" value="${esc(D.q)}" autocomplete="off"></label>
      ${CT.admin() ? `<button class="ct-btn or" data-dc="novo">${ic('plus')}Novo documento</button>` : ''}</div>`;
  }
  function vInicio() {
    const todos = visiveis();
    const q = CT.norm(D.q.trim());
    if (q) {
      const ids = new Set(D.achados || []);
      const res = todos.filter((d) => ids.has(d.id) || CT.norm(d.titulo + ' ' + (d.resumo || '') + ' ' + pasta(d.pasta)[1]).includes(q));
      return busca() + `<div class="ct-sec">${res.length} RESULTADO${res.length === 1 ? '' : 'S'}</div>`
        + (res.length ? `<div class="dc-list">${res.map((d) => linhaDoc(d, true)).join('')}</div>` : CT.vazio('search-x', `Nada sobre “${esc(D.q)}”`, 'Tente outra palavra.'));
    }
    if (!todos.length) {
      return busca() + CT.vazio('book-open', 'Nenhum documento ainda', CT.admin() ? 'Escreva o primeiro: manual, passo a passo, política ou modelo.' : 'Quando a Matriz publicar manuais e processos, eles aparecem aqui.',
        CT.admin() ? `<button class="ct-btn or" data-dc="novo">${ic('plus')}Novo documento</button>` : '');
    }
    const recentes = todos.slice(0, 6);
    return busca() + bannerObrig()
      + `<div class="dc-pastas">${PASTAS.map(([k, n, i, s]) => { const c = todos.filter((d) => d.pasta === k).length; return `<button class="dc-pasta" data-dc="pasta" data-pasta="${k}"><span class="ci">${ic(i)}</span><b>${n}</b><small>${s}</small><span class="q">${c} documento${c === 1 ? '' : 's'}</span></button>`; }).join('')}</div>`
      + `<div class="ct-sec">${ic('clock')}ATUALIZADOS POR ÚLTIMO</div><div class="dc-list">${recentes.map((d) => linhaDoc(d, true)).join('')}</div>`;
  }
  function vPasta() {
    const lista = visiveis().filter((d) => d.pasta === D.pasta);
    return `<div class="ct-crumb"><button data-dc="inicio">Documentação</button>›<span>${esc(pasta(D.pasta)[1])}</span></div>
      ${CT.admin() ? `<div class="ct-tools"><span style="flex:1"></span><button class="ct-btn or" data-dc="novo">${ic('plus')}Novo aqui</button></div>` : ''}
      ${lista.length ? `<div class="dc-list">${lista.map((d) => linhaDoc(d, false)).join('')}</div>` : CT.vazio('folder-open', 'Pasta vazia', 'Nenhum documento nesta pasta ainda.')}`;
  }
  function vObrig() {
    const lista = visiveis().filter((d) => d.obrigatorio);
    return (lista.length ? `<div class="dc-list">${lista.map((d) => linhaDoc(d, true)).join('')}</div>` : CT.vazio('circle-check', 'Nenhuma leitura obrigatória', 'Quando a Matriz pedir pra todo mundo ler algo, aparece aqui.'))
      + `<p class="ct-note">${ic('bell')}<span>Quando sai uma leitura obrigatória nova, chega <b>um</b> aviso no sininho. Se a Matriz precisar, manda um lembrete. Nada além disso.</span></p>`;
  }
  function vLeituras() {
    if (!D.resumo) return CT.carregando();
    const obrig = visiveis().filter((d) => d.obrigatorio && d.publicado);
    if (!obrig.length) return CT.vazio('circle-check', 'Nenhuma leitura obrigatória', 'Marque “Leitura obrigatória” ao publicar um documento.');
    return `<div class="dc-lcards">${obrig.map((d) => {
      const p = D.resumo[d.id] || [], leram = p.filter((x) => x.leu), faltam = p.filter((x) => !x.leu);
      const pct = p.length ? Math.round(leram.length / p.length * 100) : 0;
      const pes = (x, ok) => `<div class="dc-pes"><span class="av ${ok ? '' : 'pend'}">${esc(String(x.nome || '?').slice(0, 2).toUpperCase())}</span><span class="n">${esc(x.nome || '')}${x.unidade ? ' · ' + esc(String(x.unidade).replace(/^\s*[áa]gil\s*solar\s*[-–·]?\s*/i, '')) : ''}</span><small>${ok ? CT.dataCurta(x.lido_em) : x.lido_em ? 'leu a versão antiga' : 'não leu'}</small></div>`;
      return `<div class="ct-abox"><h4><button class="dc-link" data-dc="abrir" data-id="${d.id}">${esc(d.titulo)}</button><span class="ok">${leram.length}/${p.length}</span></h4>
        <div class="dc-prog"><i style="width:${pct}%"></i></div>
        ${faltam.length ? `<div class="dc-lbl vm">FALTAM ${faltam.length}</div>${faltam.slice(0, 12).map((x) => pes(x, false)).join('')}${faltam.length > 12 ? `<small class="dc-mais">e mais ${faltam.length - 12}</small>` : ''}
          <button class="ct-btn or" data-dc="lembrar" data-id="${d.id}">${ic('bell')}Lembrar quem falta</button>` : '<div class="dc-lbl ok">TODO MUNDO JÁ LEU</div>'}
        ${leram.length ? `<div class="dc-lbl ok">JÁ LERAM ${leram.length}</div>${leram.slice(0, 4).map((x) => pes(x, true)).join('')}${leram.length > 4 ? `<small class="dc-mais">e mais ${leram.length - 4}</small>` : ''}` : ''}
      </div>`;
    }).join('')}</div>`;
  }

  // ------------------------------------------------------------ documento
  function vDoc() {
    const d = doc(D.docId), f = D.full[D.docId], [ti, tn] = TIPO[d.tipo] || TIPO.pagina;
    const crumb = `<div class="ct-crumb"><button data-dc="inicio">Documentação</button>›<button data-dc="pasta" data-pasta="${d.pasta}">${esc(pasta(d.pasta)[1])}</button></div>`;
    if (!f) return crumb + CT.carregando();
    let corpo = '';
    if (d.tipo === 'pdf') {
      const a = CT._arq.get(f.arquivo_id);
      corpo = `<div class="dc-pdf" id="dc-pdf">${CT.carregando()}</div>
        <div class="dc-anexo"><span class="dc-ti pdf">${ic('file-type')}</span><span class="tx"><b>${esc(a ? a.nome : d.titulo + '.pdf')}</b><small>${a ? CT.tamanho(a.tamanho) : 'PDF'}</small></span>
          <button class="ct-btn gh" data-dc="baixar" data-arq="${f.arquivo_id}">${ic('download')}Baixar</button></div>`;
    } else if (d.tipo === 'video') {
      const src = CT.youtubeEmbed(f.video_url).replace('autoplay=1&', '');
      corpo = src ? `<div class="ct-video"><iframe src="${esc(src)}" allow="encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>` : CT.vazio('video-off', 'Link de vídeo inválido', '');
      if (f.html) corpo += `<div class="ct-corpo">${CT.limparHTML(f.html)}</div>`;
    } else {
      corpo = `<div class="ct-corpo" id="dc-corpo">${CT.limparHTML(f.html || '<p>(documento vazio)</p>')}</div>`;
    }
    const leitura = d.obrigatorio && !CT.admin() ? (lido(d)
      ? `<div class="dc-leu ok">${ic('circle-check')}<div class="tx"><b>Você confirmou a leitura</b>A Matriz já sabe.</div></div>`
      : `<div class="dc-leu">${ic('triangle-alert')}<div class="tx"><b>Leitura obrigatória${d.prazo ? ' até ' + CT.dataCurta(d.prazo) : ''}</b>${D.lidos[d.id] ? 'O documento mudou desde a sua última leitura. ' : ''}Depois de ler, confirme. A Matriz acompanha quem já leu.</div><button class="ct-btn or" data-dc="li">${ic('check')}Li e entendi</button></div>`) : '';
    const r = CT.admin() && d.obrigatorio && D.resumo ? (D.resumo[d.id] || []) : null;
    return crumb + `<div class="dc-doc"><article class="dc-art">
      <div class="dc-h1"><span>${esc(d.titulo)}</span>${CT.admin() ? `<button class="ct-btn gh" data-dc="editar">${ic('pencil')}Editar</button>` : ''}</div>
      <div class="dc-dm"><span>${ic(ti)}${tn}</span><span>${ic('clock')}Atualizado em ${CT.data(d.updated_at)}</span>${d.autor_nome ? `<span>por ${esc(d.autor_nome)}</span>` : ''}<span>versão ${d.versao}</span>${d.publicado ? '' : '<span class="ct-pill rasc">RASCUNHO</span>'}</div>
      ${corpo}${leitura}
    </article>
    <aside class="dc-aside">
      <div class="ct-abox" id="dc-toc" hidden><h4>NESTA PÁGINA</h4><div class="dc-toc"></div></div>
      ${r ? `<div class="ct-abox"><h4>QUEM JÁ LEU<span class="ok">${r.filter((x) => x.leu).length}/${r.length}</span></h4><div class="dc-prog"><i style="width:${r.length ? Math.round(r.filter((x) => x.leu).length / r.length * 100) : 0}%"></i></div><button class="ct-btn gh" data-dc="aba" data-tab="leituras">${ic('eye')}Ver quem falta</button></div>` : ''}
      ${CT.admin() && !d.obrigatorio && D.vistas ? `<div class="ct-abox"><h4>VISTO POR</h4><b class="dc-big">${D.vistas[d.id] || 0} ${(D.vistas[d.id] || 0) === 1 ? 'pessoa' : 'pessoas'}</b><small class="ct-muted">nos últimos 30 dias</small></div>` : ''}
      ${f.versoes && f.versoes.length ? `<div class="ct-abox"><h4>O QUE MUDOU</h4>${f.versoes.map((v) => `<div class="dc-hist"><b>v${v.versao} · ${CT.dataCurta(v.created_at)}</b><br>${esc(v.mudou || 'Texto revisado')}</div>`).join('')}</div>` : ''}
    </aside></div>`;
  }
  async function abrirDoc(id) {
    D.de = D.tab;
    D.docId = id;
    D.view = 'doc';
    if (!doc(id)) {
      try { await carregar(true); } catch (_) { /* segue */ }
      if (!doc(id)) { CT.toast('Esse documento não está mais disponível pra você.'); D.view = 'lista'; pintar(); return; }
    }
    pintar();
    window.scrollTo(0, 0);
    try {
      await carregarDoc(id);
      if (CT.admin() && !D.resumo) await carregarResumo().catch(() => {});
      sb().rpc('doc_marcar_visto', { p_doc: id }).then(() => {});
      if (D.view === 'doc' && D.docId === id) pintar();
    } catch (e) {
      console.error('[docs] abrir', e);
      CT.toast('Não deu pra abrir o documento.');
    }
  }
  async function posDoc() {
    const f = D.full[D.docId];
    if (!f) return;
    const root = D.container;
    const corpo = root.querySelector('#dc-corpo');
    if (corpo) {
      const hs = [...corpo.querySelectorAll('h2')];
      const toc = root.querySelector('#dc-toc');
      if (hs.length > 1 && toc) {
        toc.hidden = false;
        toc.querySelector('.dc-toc').innerHTML = hs.map((h, i) => `<button data-dc="toc" data-i="${i}">${esc(h.textContent)}</button>`).join('');
      }
      prepararCorpo(corpo);
    }
    const pdf = root.querySelector('#dc-pdf');
    if (pdf && f.arquivo_id) {
      const url = await CT.url(f.arquivo_id).catch(() => null);
      if (!url) { pdf.innerHTML = CT.vazio('file-x', 'Não deu pra abrir o PDF', ''); CT.icons(); return; }
      pdf.innerHTML = window.matchMedia('(max-width: 760px)').matches
        ? `<a class="ct-btn pri big" href="${esc(url)}" target="_blank" rel="noopener">${ic('external-link')}Abrir o PDF</a>`
        : `<iframe src="${esc(url)}" title="PDF"></iframe>`;
      CT.icons();
    }
  }
  // imagens e anexos guardados por id (o link assinado expira; o id não)
  function prepararCorpo(el) {
    el.querySelectorAll('img[data-arq]').forEach((img) => { CT.url(img.dataset.arq).then((u) => { if (u) img.src = u; }); });
    el.querySelectorAll('.ct-anexo[data-arq]').forEach((a) => {
      if (!a.querySelector('button')) a.insertAdjacentHTML('beforeend', `<button class="ct-btn gh" data-dc="baixar" data-arq="${esc(a.dataset.arq)}" contenteditable="false">${ic('download')}Baixar</button>`);
    });
    CT.icons();
  }

  // ------------------------------------------------------------ editor (admin)
  function vEditar() {
    const d = D.editId ? D.full[D.editId] : null;
    if (D.editId && !d) return CT.carregando();
    const tipo = d ? d.tipo : D.novoTipo;
    const arq = d && d.arquivo_id ? CT._arq.get(d.arquivo_id) : null;
    const pastaSel = d ? d.pasta : (D.pasta || 'comercial');
    return `<div class="ct-crumb"><button data-dc="inicio">Documentação</button>›<span>${d ? 'Editar documento' : 'Novo documento'}</span></div>
    <div class="dc-doc"><div class="dc-art">
      <div class="ct-segw dc-tipo">${Object.entries(TIPO).map(([k, [i, n]]) => `<button data-dc="tipo" data-tipo="${k}" class="${tipo === k ? 'on' : ''}">${ic(i)}${n}</button>`).join('')}</div>
      <input class="dc-tit" id="dc-tit" placeholder="Título do documento" value="${esc(d ? d.titulo : '')}" maxlength="140">
      <input class="dc-res" id="dc-res" placeholder="Resumo em uma linha (aparece na lista)" value="${esc(d ? d.resumo || '' : '')}" maxlength="160">
      ${tipo === 'pagina' ? `<div class="dc-tb" id="dc-tb">
          <button data-fmt="h2" title="Título de seção">${ic('heading')}Título</button><button data-fmt="bold" title="Negrito">${ic('bold')}</button><span class="sep"></span>
          <button data-fmt="ol">${ic('list-ordered')}Passo a passo</button><button data-fmt="ul">${ic('list')}Lista</button><span class="sep"></span>
          <button data-fmt="aviso">${ic('triangle-alert')}Atenção</button><button data-fmt="dica">${ic('info')}Dica</button><span class="sep"></span>
          <button data-fmt="img">${ic('image')}Imagem</button><button data-fmt="anexo">${ic('paperclip')}Anexo</button>
        </div>
        <div class="ct-corpo dc-body" id="dc-body" contenteditable="true" data-ph="Comece a escrever… Use a barra acima pra títulos, passo a passo e avisos.">${d && d.html ? CT.limparHTML(d.html) : ''}</div>`
      : tipo === 'pdf' ? `<button class="ct-drop ${arq || D.pdfNovo ? 'has' : ''}" data-dc="pdf">${ic(arq || D.pdfNovo ? 'file-check' : 'upload')}<b>${D.pdfNovo ? esc(D.pdfNovo.name) : arq ? esc(arq.nome) : 'Escolher o PDF'}</b><small>${D.pdfNovo || arq ? 'Clique pra trocar' : 'Até 50 MB'}</small></button>`
      : `<div class="ct-fld"><label>Link do vídeo no YouTube</label><input class="ct-inp" id="dc-video" value="${esc(d ? d.video_url || '' : '')}" placeholder="https://youtu.be/…"></div>
         <p class="ct-note">${ic('info')}<span>Suba no YouTube como <b>não listado</b>: só quem tem o link assiste.</span></p>`}
    </div>
    <aside class="dc-aside"><div class="ct-panel">
      <div class="ct-fld"><label>Pasta</label><select class="ct-inp" id="dc-pasta">${PASTAS.map(([k, n]) => `<option value="${k}" ${pastaSel === k ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
      <p class="ct-note">${ic('eye')}<span>Aparece pra quem tem a <b>Documentação</b> liberada no cadastro do usuário.</span></p>
      <div class="ct-grp"><h4>AVISOS</h4>
        <label class="ct-tog"><input type="checkbox" id="dc-obrig" ${d && d.obrigatorio ? 'checked' : ''}><span class="sl"></span>Leitura obrigatória (pede “Li e entendi”)</label>
        <div class="ct-fld" id="dc-prazo-box" ${d && d.obrigatorio ? '' : 'hidden'}><label>Ler até (opcional)</label><input class="ct-inp" type="date" id="dc-prazo" value="${esc(d && d.prazo ? d.prazo : '')}"></div>
        <label class="ct-tog"><input type="checkbox" id="dc-sino" ${d ? '' : 'checked'}><span class="sl"></span>Avisar no sininho ao publicar (1 aviso)</label></div>
      ${d ? `<div class="ct-fld"><label>O que mudou nesta versão</label><input class="ct-inp" id="dc-mudou" placeholder="Ex.: novo prazo da concessionária" maxlength="140"></div>` : ''}
      <div class="mk-dl">
        <button class="ct-btn or big" data-dc="publicar" data-pub="1">${ic('check')}Publicar</button>
        <div class="row"><button class="ct-btn gh" data-dc="publicar" data-pub="0">Salvar rascunho</button><button class="ct-btn gh" data-dc="cancelar">Cancelar</button></div>
        ${d ? `<button class="ct-btn gh perigo-tx" data-dc="excluir">${ic('trash-2')}Excluir documento</button>` : ''}
      </div>
    </div></aside></div>`;
  }
  function posEditar() {
    const body = D.container.querySelector('#dc-body');
    if (body) prepararCorpo(body);
    const tb = D.container.querySelector('#dc-tb');
    if (tb) tb.addEventListener('mousedown', (e) => e.preventDefault());
  }
  async function abrirEditor(id) {
    D.editId = id || null;
    D.pdfNovo = null;
    if (!id) D.novoTipo = 'pagina';
    D.view = 'editar';
    pintar();
    window.scrollTo(0, 0);
    if (id && !D.full[id]) { try { await carregarDoc(id); } catch (_) { CT.toast('Não deu pra abrir o documento.'); } pintar(); }
  }
  function formatar(fmt) {
    const body = D.container.querySelector('#dc-body');
    if (!body) return;
    body.focus();
    const ins = (h) => document.execCommand('insertHTML', false, h);
    if (fmt === 'h2') {
      const n = getSelection().anchorNode, bloco = n && (n.nodeType === 1 ? n : n.parentElement).closest('h2');
      document.execCommand('formatBlock', false, bloco ? 'p' : 'h2');
    } else if (fmt === 'bold') document.execCommand('bold');
    else if (fmt === 'ol') document.execCommand('insertOrderedList');
    else if (fmt === 'ul') document.execCommand('insertUnorderedList');
    else if (fmt === 'aviso') ins('<div class="ct-aviso"><p>Escreva o aviso aqui</p></div><p><br></p>');
    else if (fmt === 'dica') ins('<div class="ct-aviso dica"><p>Escreva a dica aqui</p></div><p><br></p>');
    else if (fmt === 'img' || fmt === 'anexo') {
      const sel = getSelection(), range = sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
      const input = document.createElement('input');
      input.type = 'file';
      if (fmt === 'img') input.accept = 'image/*';
      input.addEventListener('change', async () => {
        let f = input.files && input.files[0];
        if (!f) return;
        CT.toast(fmt === 'img' ? 'Enviando a imagem…' : 'Enviando o anexo…');
        try {
          if (fmt === 'img') f = await CT.paraWebp(f, 1600, 0.85);
          const arq = await CT.enviar(f, 'docs');
          body.focus();
          if (range) { sel.removeAllRanges(); sel.addRange(range); }
          if (fmt === 'img') ins(`<img data-arq="${arq.id}" src="${URL.createObjectURL(f)}" alt=""><p><br></p>`);
          else ins(`<div class="ct-anexo" contenteditable="false" data-arq="${arq.id}"><b>${esc(arq.nome)}</b><small>${CT.tamanho(arq.tamanho)}</small></div><p><br></p>`);
        } catch (e) { CT.toast('Não deu pra enviar: ' + (e.message || 'erro')); }
      });
      input.click();
    }
  }
  function htmlParaSalvar(body) {
    const c = body.cloneNode(true);
    c.querySelectorAll('img[data-arq]').forEach((i) => i.removeAttribute('src'));
    c.querySelectorAll('.ct-anexo button').forEach((b) => b.remove());
    return CT.limparHTML(c.innerHTML).trim();
  }
  async function publicar(pub, btn) {
    const root = D.container;
    const d = D.editId ? D.full[D.editId] : null;
    const tipo = d ? (root.querySelector('.dc-tipo .on') || {}).dataset.tipo || d.tipo : D.novoTipo;
    const titulo = root.querySelector('#dc-tit').value.trim();
    if (!titulo) { CT.toast('Dê um título ao documento.'); return; }
    const reg = {
      tipo, titulo, resumo: root.querySelector('#dc-res').value.trim() || null,
      pasta: root.querySelector('#dc-pasta').value, publicado: !!pub,
      obrigatorio: root.querySelector('#dc-obrig').checked,
      prazo: root.querySelector('#dc-obrig').checked ? (root.querySelector('#dc-prazo').value || null) : null,
      autor_nome: (state.profile && state.profile.nome) || (typeof getFirstName === 'function' ? getFirstName() : null),
      updated_at: new Date().toISOString(),
    };
    if (tipo === 'pagina') {
      reg.html = htmlParaSalvar(root.querySelector('#dc-body'));
      if (!reg.html || reg.html === '<p><br></p>') { CT.toast('Escreva o conteúdo do documento.'); return; }
    }
    if (tipo === 'video') {
      reg.video_url = root.querySelector('#dc-video').value.trim();
      if (!CT.youtubeId(reg.video_url)) { CT.toast('Cole um link do YouTube válido.'); return; }
    }
    if (tipo === 'pdf' && !D.pdfNovo && !(d && d.arquivo_id)) { CT.toast('Escolha o PDF.'); return; }
    const sino = root.querySelector('#dc-sino').checked && pub;
    btn.disabled = true; btn.textContent = 'Salvando…';
    try {
      let velho = null;
      if (tipo === 'pdf' && D.pdfNovo) {
        const arq = await CT.enviar(D.pdfNovo, 'docs');
        if (d && d.arquivo_id) velho = d.arquivo_id;
        reg.arquivo_id = arq.id;
      }
      let salvo;
      if (d) {
        reg.versao = d.versao + 1;
        const { data, error } = await sb().from('doc_documentos').update(reg).eq('id', d.id).select('*').single();
        if (error) throw error;
        salvo = data;
        await sb().from('doc_versoes').insert({ doc_id: d.id, versao: reg.versao, mudou: (root.querySelector('#dc-mudou').value || '').trim() || 'Texto revisado', html: reg.html || null, autor_nome: reg.autor_nome });
      } else {
        const { data, error } = await sb().from('doc_documentos').insert(reg).select('*').single();
        if (error) throw error;
        salvo = data;
        await sb().from('doc_versoes').insert({ doc_id: salvo.id, versao: 1, mudou: 'Primeira versão', html: reg.html || null, autor_nome: reg.autor_nome });
      }
      if (velho) CT.apagarArquivo(velho);
      delete D.full[salvo.id];
      D.resumo = null;
      await carregar(true);
      let msg = pub ? 'Publicado.' : 'Salvo como rascunho.';
      if (sino) {
        const { data: n, error } = await sb().rpc('doc_avisar', { p_doc: salvo.id, p_lembrete: false });
        msg = error ? 'Publicado, mas o aviso no sininho falhou.' : `Publicado. ${n || 0} pessoa${n === 1 ? '' : 's'} avisada${n === 1 ? '' : 's'} no sininho.`;
      }
      CT.toast(msg);
      D.editId = null; D.pdfNovo = null;
      abrirDoc(salvo.id);
    } catch (e) {
      console.error('[docs] publicar', e);
      CT.toast('Não deu pra salvar: ' + (e.message || 'erro'));
      btn.disabled = false; btn.textContent = 'Tentar de novo';
    }
  }

  // ------------------------------------------------------------ eventos
  function ligar(root) {
    if (!root) return;
    root.addEventListener('click', async (e) => {
      const f = e.target.closest('[data-fmt]');
      if (f) { formatar(f.dataset.fmt); return; }
      const b = e.target.closest('[data-dc]');
      if (!b) return;
      const a = b.dataset.dc, id = b.dataset.id;
      switch (a) {
        case 'recarregar': D.docs = null; renderDocsRoute(D.container, D.tab); break;
        case 'inicio': D.view = 'lista'; D.pasta = null; if (D.tab !== 'inicio') setTab('docs'); else pintar(); break;
        case 'pasta': D.pasta = b.dataset.pasta; D.view = 'pasta'; pintar(); window.scrollTo(0, 0); break;
        case 'abrir': abrirDoc(id); break;
        case 'aba': setTab(b.dataset.tab); break;
        case 'novo': abrirEditor(null); break;
        case 'editar': abrirEditor(D.docId); break;
        case 'cancelar': { const ed = D.editId; D.editId = null; D.pdfNovo = null; if (ed) { delete D.full[ed]; abrirDoc(ed); } else { D.view = D.pasta ? 'pasta' : 'lista'; pintar(); } break; }
        case 'tipo': {
          const d = D.editId && D.full[D.editId];
          // guarda o que já foi digitado antes de trocar o tipo
          const t = root.querySelector('#dc-tit'), r = root.querySelector('#dc-res');
          if (d) { d.tipo = b.dataset.tipo; d.titulo = t.value; d.resumo = r.value; } else D.novoTipo = b.dataset.tipo;
          const tv = t.value, rv = r.value;
          pintar();
          D.container.querySelector('#dc-tit').value = tv; D.container.querySelector('#dc-res').value = rv;
          break;
        }
        case 'pdf': {
          const input = document.createElement('input');
          input.type = 'file'; input.accept = 'application/pdf';
          input.addEventListener('change', () => {
            const f2 = input.files && input.files[0];
            if (!f2) return;
            if (f2.size > 50 * 1024 * 1024) { CT.toast('O PDF passa de 50 MB.'); return; }
            D.pdfNovo = f2;
            const box = root.querySelector('[data-dc="pdf"]');
            box.classList.add('has');
            box.innerHTML = `${ic('file-check')}<b>${esc(f2.name)}</b><small>${CT.tamanho(f2.size)} · clique pra trocar</small>`;
            CT.icons();
          });
          input.click();
          break;
        }
        case 'publicar': publicar(b.dataset.pub === '1', b); break;
        case 'excluir': {
          const d = D.full[D.editId];
          if (!d || !(await CT.confirmar('Excluir este documento?', `“${d.titulo}” sai da Documentação, com o histórico e as leituras. Não dá pra desfazer.`, 'Excluir'))) return;
          const { error } = await sb().from('doc_documentos').delete().eq('id', d.id);
          if (error) { CT.toast('Não deu pra excluir: ' + error.message); return; }
          if (d.arquivo_id) CT.apagarArquivo(d.arquivo_id);
          D.docs = D.docs.filter((x) => x.id !== d.id);
          delete D.full[d.id];
          D.editId = null; D.view = 'lista';
          CT.toast('Documento excluído.');
          pintar();
          break;
        }
        case 'li': {
          b.disabled = true;
          const { error } = await sb().rpc('doc_confirmar_leitura', { p_doc: D.docId });
          if (error) { b.disabled = false; CT.toast('Não deu pra confirmar: ' + error.message); return; }
          D.lidos[D.docId] = doc(D.docId).versao;
          CT.toast('Leitura confirmada. A Matriz já sabe.');
          pintar();
          if (window.uiV2Shell) window.uiV2Shell.refresh();
          break;
        }
        case 'lembrar': {
          b.disabled = true;
          const { data: n, error } = await sb().rpc('doc_avisar', { p_doc: id, p_lembrete: true });
          b.disabled = false;
          CT.toast(error ? (/hoje/.test(error.message) ? 'Já foi enviado um lembrete hoje. Tente amanhã.' : 'Não deu pra lembrar: ' + error.message) : `Lembrete enviado no sininho pra ${n || 0} pessoa${n === 1 ? '' : 's'}.`);
          break;
        }
        case 'baixar': CT.baixarArquivo(b.dataset.arq); break;
        case 'toc': { const h = root.querySelectorAll('#dc-corpo h2')[Number(b.dataset.i)]; if (h) h.scrollIntoView({ behavior: 'smooth', block: 'start' }); break; }
      }
    });
    root.addEventListener('input', (e) => {
      if (e.target.id === 'dc-q') {
        const el = e.target;
        D.q = el.value;
        const pos = el.selectionStart;
        pintar();
        const n = document.getElementById('dc-q');
        if (n) { n.focus(); n.setSelectionRange(pos, pos); }
        buscarNoTexto();
      }
    });
    root.addEventListener('change', (e) => {
      if (e.target.id === 'dc-obrig') { const p = root.querySelector('#dc-prazo-box'); if (p) p.hidden = !e.target.checked; }
    });
  }
  // busca também dentro do texto das páginas (no banco)
  function buscarNoTexto() {
    clearTimeout(D.buscaT);
    const q = D.q.trim();
    if (q.length < 3) { D.achados = null; return; }
    D.buscaT = setTimeout(async () => {
      const termo = q.replace(/[%_,()]/g, ' ');
      const { data } = await sb().from('doc_documentos').select('id').ilike('html', `%${termo}%`).limit(50);
      if (D.q.trim() !== q) return;
      D.achados = (data || []).map((x) => x.id);
      if (naDoc() && D.view === 'lista' && D.tab === 'inicio') {
        const el = document.getElementById('dc-q'), pos = el ? el.selectionStart : null;
        pintar();
        const n = document.getElementById('dc-q');
        if (n && pos != null) { n.focus(); n.setSelectionRange(pos, pos); }
      }
    }, 350);
  }

  // Botão "+" do menu (só admin)
  function docsNovo() { if (naDoc() && CT.admin()) abrirEditor(null); }

  // Sininho: abre o documento (troca de ambiente se precisar)
  function abrir(id) {
    if (!naDoc()) {
      D.abrirDepois = id;
      if (state.environment !== 'marketing') { state.mktActiveTab = 'docs'; if (typeof setEnvironment === 'function') setEnvironment('marketing'); }
      else if (typeof setTab === 'function') setTab('docs');
      return;
    }
    if (!D.docs) { D.abrirDepois = id; return; }
    abrirDoc(id);
  }

  window.renderDocsRoute = renderDocsRoute;
  window.docsNovo = docsNovo;
  window.DOCS = {
    abrir, pendentes: () => pendentes().length,
    recarregar: () => { D.docs = null; D.full = {}; D.resumo = null; },
    inicioDaAba: () => { if (D.abrirDepois) return; D.view = 'lista'; D.pasta = null; D.editId = null; D.pdfNovo = null; },
  };
})();
