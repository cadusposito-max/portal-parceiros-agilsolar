// ==========================================================================
// AMBIENTE MARKETING — biblioteca de artes e materiais da marca
// --------------------------------------------------------------------------
// Abas: Biblioteca, Campanhas, Montar arte (admin) e Quem baixou (admin).
// Três tipos de item (mkt_itens.tipo):
//   editavel — a arte sem os textos (imagem de fundo) + caixas de texto
//              (campos) que quem baixa preenche; nome/WhatsApp/cidade vêm da
//              unidade. A arte final é montada num <canvas> no aparelho de
//              quem baixa: nada sobe pro servidor.
//   arquivo  — PDF, ZIP, PNG... só pra baixar.
//   video    — link do YouTube (não ocupa espaço).
// Campos (jsonb): { id, label, tipo: texto|unidade|whats|cidade|fixo,
//   x, y, w (frações da arte), size (px na arte), cor (nome da paleta ou #hex),
//   fonte (nome em FONTES; vazio = Plus Jakarta Sans), align, peso, ex, max }
// foto (jsonb): área da foto trocável { x, y, w, h } (frações).
// ==========================================================================
(function () {
  'use strict';
  const CT = window.CT;
  const sb = () => supabaseClient;
  const { esc, ic } = CT;

  const PASTAS = [['campanhas', 'Campanhas'], ['redes', 'Redes sociais'], ['impressos', 'Impressos'], ['marca', 'Marca e logos'], ['videos', 'Vídeos']];
  const nomePasta = (k) => (PASTAS.find((p) => p[0] === k) || [k, k])[1];
  const COR = { branco: '#FFFFFF', laranja: '#FAA519', azul: '#008FD4', tinta: '#0F1B26', marrom: '#3D2600', cinza: '#8D97A1', preto: '#000000' };
  const TIPO_CAMPO = {
    texto: 'Texto livre (quem baixa preenche)',
    unidade: 'Nome da unidade (automático)',
    whats: 'WhatsApp da unidade (automático)',
    cidade: 'Cidade da unidade (automático)',
    fixo: 'Texto fixo (ninguém muda)',
  };
  const AUTO = { unidade: 'Nome da unidade', whats: 'WhatsApp', cidade: 'Cidade' };
  const FONTE = '"Plus Jakarta Sans", Inter, system-ui, sans-serif';
  // Fontes do editor (Google Fonts, baixadas só quando usadas). [nome, pesos que existem, estilo]
  const FONTES = [
    ['Plus Jakarta Sans', [400, 600, 800], 'Padrão da marca'],
    ['Montserrat', [400, 600, 800, 900], 'Moderna'],
    ['Poppins', [400, 600, 800, 900], 'Moderna'],
    ['Inter', [400, 600, 800, 900], 'Moderna'],
    ['Nunito', [400, 600, 800, 900], 'Arredondada'],
    ['Raleway', [400, 600, 800, 900], 'Elegante'],
    ['Oswald', [400, 600, 700], 'Estreita'],
    ['Barlow Condensed', [400, 600, 800, 900], 'Estreita'],
    ['Bebas Neue', [400], 'Título'],
    ['Anton', [400], 'Título'],
    ['Archivo Black', [400], 'Título'],
    ['Righteous', [400], 'Título'],
    ['Playfair Display', [400, 600, 800, 900], 'Serifada'],
    ['Lora', [400, 600, 700], 'Serifada'],
    ['Dancing Script', [400, 600, 700], 'Manuscrita'],
    ['Pacifico', [400], 'Manuscrita'],
    ['Permanent Marker', [400], 'Pincel'],
  ];
  const fonteDe = (nome) => FONTES.find((x) => x[0] === nome) || FONTES[0];
  // peso pedido → o mais perto que a fonte tem (fonte de um peso só nunca fica "negrito falso")
  const pesoDe = (f) => { const ps = fonteDe(f.fonte)[1], p = Number(f.peso) || 800; return ps.reduce((a, b) => (Math.abs(b - p) < Math.abs(a - p) ? b : a), ps[0]); };
  const NOME_PESO = { 400: 'Normal', 600: 'Médio', 700: 'Negrito', 800: 'Negrito', 900: 'Extra' };
  const _cssFonte = {};
  function cssFonte(nome) {
    const [fam, ps] = fonteDe(nome);
    if (!_cssFonte[fam]) {
      _cssFonte[fam] = new Promise((res) => {
        const l = document.createElement('link');
        l.rel = 'stylesheet';
        l.href = 'https://fonts.googleapis.com/css2?family=' + fam.replace(/ /g, '+') + (ps.length > 1 ? ':wght@' + ps.join(';') : '') + '&display=swap';
        l.onload = res; l.onerror = res;
        document.head.appendChild(l);
      });
    }
    return _cssFonte[fam];
  }
  // Espera as fontes que a arte usa (no máx. 5 s: sem internet sai com a padrão)
  function fontesProntas(it) {
    const usos = new Set(((it && it.campos) || []).map((f) => fonteDe(f.fonte)[0] + '|' + pesoDe(f)));
    usos.add('Plus Jakarta Sans|800');
    const todas = Promise.all([...usos].map(async (u) => {
      const [fam, p] = u.split('|');
      await cssFonte(fam);
      try { await document.fonts.load(`${p} 40px "${fam}"`); } catch (_) {}
    }));
    return Promise.race([todas, new Promise((r) => setTimeout(r, 5000))]);
  }
  const corHex = (c) => { const v = COR[c] || c; return /^#[0-9a-f]{6}$/i.test(v || '') ? v.toUpperCase() : '#FFFFFF'; };

  const M = {
    tab: 'biblioteca', container: null, itens: null, stats: {}, carregando: null, erro: null,
    pasta: 'todas', q: '', view: 'lista', aberto: null, de: 'biblioteca',
    vals: {}, fotos: {}, uni: null, uniEdit: null,
    montarId: null, rasc: null, sujo: false, sel: null, uso: null,
    painel: null, painelDias: 30, painelCarregando: false,
    visao: (() => { try { return localStorage.getItem('mkt_visao') === 'unidade' ? 'unidade' : 'rede'; } catch (_) { return 'rede'; } })(),
  };
  // Admin escolhe no Início: painel da rede ou o que as unidades veem
  const verRede = () => CT.admin() && M.visao !== 'unidade';

  const hoje = () => new Date().toISOString().slice(0, 10);
  const campanhaAtiva = (i) => !!i.campanha && (!i.campanha_ate || i.campanha_ate >= hoje());
  const visiveis = () => (M.itens || []).filter((i) => CT.admin() || i.publicado);
  const item = (id) => (M.itens || []).find((i) => i.id === id);

  // ------------------------------------------------------------ dados
  async function carregar(forcar) {
    if (M.itens && !forcar) return;
    if (M.carregando) return M.carregando;
    M.carregando = (async () => {
      const { data, error } = await sb().from('mkt_itens').select('*').order('ordem').order('created_at', { ascending: false });
      if (error) throw error;
      M.itens = data || [];
      await CT.arquivos(M.itens.flatMap((i) => [i.arquivo_id, i.capa_id]));
      if (CT.admin()) {
        const { data: st } = await sb().rpc('mkt_itens_stats');
        M.stats = Object.fromEntries((st || []).map((s) => [s.item_id, s]));
      }
      M.erro = null;
    })().catch((e) => { M.erro = e; throw e; }).finally(() => { M.carregando = null; });
    return M.carregando;
  }

  function erroHTML(e) {
    const semTabela = /mkt_itens|relation|does not exist|schema cache/i.test(String(e && (e.message || e.details || e)));
    return CT.vazio('triangle-alert', semTabela ? 'O Marketing ainda não foi ativado no banco' : 'Não deu pra carregar o Marketing',
      semTabela ? 'Falta rodar a migration do Marketing e da Documentação no Supabase.' : 'Verifique a internet e tente de novo.',
      `<button class="ct-btn gh" data-mk="recarregar">${ic('rotate-cw')}Tentar de novo</button>`);
  }

  // ------------------------------------------------------------ rota
  const TITULOS = {
    biblioteca: ['Artes', 'Artes prontas pra divulgar a sua unidade'],
    campanhas: ['Campanhas', 'Materiais das campanhas no ar'],
    montar: ['Montar arte', 'Marque na arte o que quem baixa pode trocar'],
    uso: ['Quem baixou', 'Unidades que estão usando o material nos últimos 30 dias'],
  };
  function meta() {
    let [t, s] = TITULOS[M.tab] || TITULOS.biblioteca;
    if (M.tab === 'inicio') {
      if (verRede()) { t = 'Painel do Marketing'; s = 'Como a rede está usando o material'; }
      else {
        const h = new Date().getHours(), nome = String((state.profile && state.profile.nome) || '').trim().split(/\s+/)[0];
        t = (h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite') + (nome ? ', ' + nome : '');
        s = ((M.uni && M.uni.unidade) ? M.uni.unidade + ' · ' : '') + 'o que tem de novo pra divulgar';
      }
    }
    if (M.view === 'editor' && item(M.aberto)) { t = item(M.aberto).nome; s = 'Troque os textos e baixe a arte pronta'; }
    CT.meta('marketing:' + M.tab, t, s);
  }

  // As abas de documentação do mesmo ambiente são do docs.js
  function naArte() { return state.environment === 'marketing' && !MKT_TABS_DOCS.includes(state.mktActiveTab); }

  async function renderMktRoute(container, tab) {
    M.container = container;
    const novo = tab || 'biblioteca';
    if (novo !== M.tab) { M.tab = novo; M.view = 'lista'; }
    if ((M.tab === 'montar' || M.tab === 'uso') && !CT.admin()) M.tab = 'biblioteca';
    meta();
    if (!M.itens) {
      container.innerHTML = CT.carregando();
      CT.icons();
      try { await carregar(); } catch (e) { if (naArte()) { container.innerHTML = erroHTML(e); ligar(container.firstChild); CT.icons(); } return; }
      if (!naArte()) return;
    }
    if (!M.uni) { try { M.uni = await CT.unidade(); } catch (_) { M.uni = { unidade: 'Ágil Solar', whats: '', cidade: '' }; } }
    pintar();
  }

  function pintar() {
    const c = M.container;
    if (!c || !naArte()) return;
    meta();
    let html;
    if (M.view === 'editor' && item(M.aberto)) html = vEditor();
    else if (M.tab === 'montar') html = vMontar();
    else if (M.tab === 'uso') html = vUso();
    else if (M.tab === 'inicio') html = vInicio();
    else html = vLista();
    c.innerHTML = `<div class="ct-root" id="mk-root">${html}</div>`;
    ligar(c.firstChild);
    CT.icons();
    preencherImagens(c);
    if (M.view === 'editor') prepararEditor();
    if (M.tab === 'montar' && M.view !== 'editor') prepararMontar();
    if (M.tab === 'uso' && !M.uso) carregarUso();
    if (M.tab === 'inicio' && M.view !== 'editor' && !M.painel) carregarPainel();
  }

  function preencherImagens(root) {
    root.querySelectorAll('img[data-arq]').forEach((img) => {
      CT.url(img.dataset.arq).then((u) => { if (u) img.src = u; }).catch(() => {});
    });
  }

  // ------------------------------------------------------------ biblioteca
  function filtrar(lista) {
    const q = CT.norm(M.q.trim());
    return lista.filter((i) => (!q || CT.norm(i.nome + ' ' + (i.campanha || '')).includes(q)));
  }
  function capaHTML(i) {
    if (i.tipo === 'video') {
      const capa = CT.youtubeCapa(i.video_url);
      return `<div class="mk-file video">${capa ? `<img src="${esc(capa)}" alt="" loading="lazy">` : ''}<span class="mk-play">${ic('play')}</span></div>`;
    }
    if (i.capa_id) return `<img data-arq="${i.capa_id}" alt="" loading="lazy">`;
    if (i.tipo === 'editavel') return i.arquivo_id ? `<img data-arq="${i.arquivo_id}" alt="" loading="lazy">` : `<div class="mk-file">${ic('image')}</div>`;
    const a = CT._arq.get(i.arquivo_id);
    const ext = a ? CT.ext(a.nome).toUpperCase() : 'ARQ';
    return `<div class="mk-file ${/PDF/.test(ext) ? 'pdf' : ''}">${ic(/ZIP|RAR/.test(ext) ? 'file-archive' : 'file-text')}<small>${esc(ext)}</small></div>`;
  }
  function metaItem(i) {
    if (i.tipo === 'editavel') return `${i.largura || '?'}×${i.altura || '?'} px`;
    if (i.tipo === 'video') return 'Vídeo do YouTube';
    const a = CT._arq.get(i.arquivo_id);
    return a ? `${CT.ext(a.nome).toUpperCase() || 'Arquivo'} · ${CT.tamanho(a.tamanho)}` : 'Arquivo';
  }
  function cardItem(i) {
    const st = M.stats[i.id];
    const selo = i.tipo === 'editavel' ? `<span class="mk-badge ed">${ic('pencil')}EDITÁVEL</span>` : `<span class="mk-badge fx">${i.tipo === 'video' ? 'VÍDEO' : 'SÓ BAIXAR'}</span>`;
    const acao = i.tipo === 'editavel' ? ['abrir', 'pencil', CT.admin() ? 'Editar' : 'Editar e baixar'] : i.tipo === 'video' ? ['assistir', 'play', 'Assistir'] : ['baixar', 'download', 'Baixar'];
    return `<div class="mk-card${i.publicado ? '' : ' oculto'}">
      <button class="mk-thumb" data-mk="${acao[0]}" data-id="${i.id}">${capaHTML(i)}${selo}${i.publicado ? '' : '<span class="mk-badge rasc">RASCUNHO</span>'}</button>
      <div class="mk-cbody"><b>${esc(i.nome)}</b><span class="mk-meta">${esc(metaItem(i))}${i.campanha ? ' · ' + esc(i.campanha) : ''}</span>
        ${CT.admin() ? `<span class="mk-adm">${ic('download')}${st ? `${st.downloads} ${i.tipo === 'video' ? 'vezes' : 'downloads'} · ${st.unidades} unidade${st.unidades == 1 ? '' : 's'}` : 'ninguém baixou ainda'}</span>` : ''}
        <div class="mk-cact"><button class="ct-btn pri" data-mk="${acao[0]}" data-id="${i.id}" title="${acao[2]}">${ic(acao[1])}<span>${acao[2]}</span></button>
          ${CT.admin() && i.tipo === 'editavel' ? `<button class="ct-btn gh ic" data-mk="montar" data-id="${i.id}" title="Montar campos">${ic('pencil-ruler')}</button>` : ''}
          ${CT.admin() ? `<button class="ct-btn gh ic" data-mk="editar" data-id="${i.id}" title="Nome, pasta e quem vê">${ic('settings-2')}</button>` : ''}</div>
      </div></div>`;
  }
  function grade(lista) {
    const ed = lista.filter((i) => i.tipo === 'editavel'), fx = lista.filter((i) => i.tipo !== 'editavel');
    return (ed.length ? `<div class="ct-sec">${ic('pencil')}EDITÁVEIS · SAEM COM OS DADOS DA SUA UNIDADE</div><div class="mk-grid">${ed.map(cardItem).join('')}</div>` : '')
      + (fx.length ? `<div class="ct-sec">${ic('download')}PRONTOS PRA BAIXAR</div><div class="mk-grid">${fx.map(cardItem).join('')}</div>` : '');
  }
  function barraBusca() {
    return `<div class="ct-tools"><label class="ct-search">${ic('search')}<input id="mk-q" placeholder="Buscar arte, folder, logo…" value="${esc(M.q)}" autocomplete="off"></label>
      ${CT.admin() ? `<button class="ct-btn or" data-mk="subir">${ic('plus')}Subir material</button>` : ''}</div>`;
  }
  function vLista() {
    const todos = visiveis();
    if (M.tab === 'campanhas') {
      const camp = filtrar(todos.filter((i) => i.campanha && (campanhaAtiva(i) || CT.admin())));
      if (!camp.length) return barraBusca() + CT.vazio('flag', 'Nenhuma campanha no ar', CT.admin() ? 'Ao subir um material, preencha o campo Campanha.' : 'Quando a Matriz lançar uma campanha, os materiais aparecem aqui.');
      const grupos = {};
      camp.forEach((i) => { (grupos[i.campanha] = grupos[i.campanha] || []).push(i); });
      return barraBusca() + Object.entries(grupos).map(([nome, lista]) => {
        const ate = lista.map((i) => i.campanha_ate).filter(Boolean).sort().pop();
        const encerrada = ate && ate < hoje();
        return `<div class="mk-camp-h"><b>${esc(nome)}</b><span>${encerrada ? 'encerrada' : ate ? 'até ' + CT.dataCurta(ate) : 'no ar'} · ${lista.length} ${lista.length === 1 ? 'material' : 'materiais'}</span></div>${grade(lista)}`;
      }).join('');
    }
    const cont = (p) => p === 'todas' ? todos.length : todos.filter((i) => i.pasta === p).length;
    const naPasta = filtrar(todos.filter((i) => M.pasta === 'todas' || i.pasta === M.pasta));
    const chips = `<div class="ct-chips">${[['todas', 'Todas'], ...PASTAS].map(([k, n]) => `<button class="ct-chip ${M.pasta === k ? 'on' : ''}" data-mk="pasta" data-pasta="${k}">${n}<span>${cont(k)}</span></button>`).join('')}</div>`;
    if (!todos.length) {
      return barraBusca() + CT.vazio('megaphone', 'Ainda não tem material aqui', CT.admin() ? 'Suba a primeira arte: o franqueado troca os textos e baixa pronta.' : 'Quando a Matriz publicar artes e materiais, eles aparecem aqui.',
        CT.admin() ? `<button class="ct-btn or" data-mk="subir">${ic('plus')}Subir material</button>` : '');
    }
    return barraBusca() + chips + (naPasta.length ? grade(naPasta) : CT.vazio('search-x', M.q ? `Nada encontrado com “${esc(M.q)}”` : 'Nada nesta pasta ainda', ''));
  }

// ------------------------------------------------------------ início (painel)
  // Unidade: campanha no ar, os números dela, novidades, mais usadas na rede e atalhos.
  // Admin: painel da rede (downloads, unidades paradas, sem uso). Números: RPC mkt_painel.
  const PASTA_ICONE = { redes: 'share-2', impressos: 'printer', marca: 'badge-check', videos: 'play' };
  const acaoDe = (i) => (i.tipo === 'editavel' ? 'abrir' : i.tipo === 'video' ? 'assistir' : 'baixar');
  const plural = (n, um, varios) => (Number(n) === 1 ? um : varios);
  function quando(ts) {
    if (!ts) return '';
    const dias = Math.floor((Date.now() - new Date(ts)) / 864e5);
    return dias <= 0 ? 'hoje' : dias === 1 ? 'ontem' : 'há ' + dias + ' dias';
  }
  async function carregarPainel() {
    if (M.painelCarregando) return;
    const dias = verRede() ? M.painelDias : 30;
    M.painelCarregando = true;
    try {
      const { data, error } = await sb().rpc('mkt_painel', { p_dias: dias });
      if (error) throw error;
      M.painel = data || { dias, ranking: [] };
    } catch (e) {
      console.error('[mkt] painel', e);
      M.painel = { erro: true, dias, ranking: [] };
    } finally { M.painelCarregando = false; }
    if (M.tab === 'inicio' && M.view === 'lista' && naArte()) pintar();
  }
  function campanhaAtual() {
    const grupos = {};
    visiveis().filter((i) => i.publicado && campanhaAtiva(i)).forEach((i) => { (grupos[i.campanha] = grupos[i.campanha] || []).push(i); });
    const lista = Object.entries(grupos).map(([nome, itens]) => ({ nome, itens, ate: itens.map((i) => i.campanha_ate).filter(Boolean).sort().pop() || null }));
    lista.sort((a, b) => ((a.ate || '9999') < (b.ate || '9999') ? -1 : 1)); // a que acaba primeiro
    return lista[0] || null;
  }
  function faltam(ate) {
    if (!ate) return null;
    const ms = new Date(ate + 'T23:59:59') - Date.now();
    return ms <= 0 ? { d: 0, h: 0 } : { d: Math.floor(ms / 864e5), h: Math.floor((ms % 864e5) / 36e5) };
  }
  function blocoCampanha() {
    const c = campanhaAtual();
    if (!c) {
      return `<section class="mk-hero vazio"><div class="tx"><span class="tag">CAMPANHAS</span><h2>Nenhuma campanha no ar agora</h2>
        <p>${CT.admin() ? 'Ao subir um material, preencha Campanha e a data final: ela aparece aqui em destaque pra rede toda.' : 'Quando a Matriz lançar uma campanha, ela aparece aqui com as artes prontas.'}</p>
        <div class="acts">${CT.admin() ? `<button class="ct-btn or" data-mk="subir">${ic('plus')}Subir material</button>` : `<button class="ct-btn or" data-mk="aba" data-tab="biblioteca">${ic('layout-grid')}Ver todas as artes</button>`}</div></div></section>`;
    }
    const ed = c.itens.find((i) => i.tipo === 'editavel'), f = faltam(c.ate);
    const pecas = c.itens.filter((i) => i.tipo !== 'video').slice(0, 3);
    const n = c.itens.length;
    return `<section class="mk-hero"><div class="tx">
        <span class="tag"><i class="pulse"></i>CAMPANHA NO AR${c.ate ? ' · ATÉ ' + CT.dataCurta(c.ate) : ''}</span>
        <h2>${esc(c.nome)}</h2>
        <p>${n} ${plural(n, 'material', 'materiais')}${ed ? '. As artes saem com o nome e o WhatsApp da sua unidade.' : '.'}</p>
        <div class="cont">${f ? `<div><b>${f.d}</b><small>${plural(f.d, 'DIA', 'DIAS')}</small></div><div><b>${String(f.h).padStart(2, '0')}</b><small>HORAS</small></div>` : ''}<div><b>${n}</b><small>${plural(n, 'MATERIAL', 'MATERIAIS')}</small></div></div>
        <div class="acts">${ed ? `<button class="ct-btn or" data-mk="abrir" data-id="${ed.id}">${ic('pencil')}Montar minha arte</button>` : ''}<button class="ct-btn gl" data-mk="aba" data-tab="campanhas">Ver campanha</button></div>
      </div>${pecas.length ? `<div class="pecas">${pecas.map((i) => `<button class="mk-pt" data-mk="${acaoDe(i)}" data-id="${i.id}" title="${esc(i.nome)}">${capaHTML(i)}</button>`).join('')}</div>` : ''}</section>`;
  }
  function blocoMinha() {
    const p = M.painel;
    const cab = `<h3>${ic('store')}Sua unidade · 30 dias</h3>`;
    if (!p) return `<section class="mk-dcard mk-minha">${cab}${CT.carregando()}</section>`;
    if (p.erro || !p.minha) return `<section class="mk-dcard mk-minha">${cab}<div class="ct-dica">Não deu pra carregar os números agora.</div></section>`;
    const m = p.minha, n = Number(m.downloads) || 0, media = Number(m.media) || 0;
    const max = Math.max(n, media * 1.6, 1), ult = m.ultimo && item(m.ultimo.item_id);
    const mediaTx = String(media).replace('.', ',');
    const leg = !n ? 'Nenhuma arte baixada ainda. Comece pela campanha!'
      : n > media ? `<b class="ok">Acima da média</b> da rede (${mediaTx} por unidade)`
      : n === media ? 'Na média da rede' : `A média da rede é ${mediaTx} por unidade`;
    return `<section class="mk-dcard mk-minha">${cab}
      <div class="big"><b>${n}</b><span>${plural(n, 'arte baixada', 'artes baixadas')}</span></div>
      <div class="barra"><i style="width:${Math.round(n / max * 100)}%"></i>${media ? `<span class="media" style="left:${Math.round(media / max * 100)}%" title="Média da rede"></span>` : ''}</div>
      <p class="leg">${leg}</p>
      ${ult ? `<div class="ult"><span class="mk-pt mini">${capaHTML(ult)}</span><div class="tx"><b>${esc(ult.nome)}</b><small>Você baixou ${quando(m.ultimo.em)}</small></div>
        <button class="ct-btn gh sm" data-mk="${acaoDe(ult)}" data-id="${ult.id}">${ic('rotate-ccw')}De novo</button></div>` : ''}
    </section>`;
  }
  function blocoNovidades(titulo) {
    const pub = visiveis().filter((i) => i.publicado).sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    const lim = Date.now() - 15 * 864e5, eNovo = (i) => new Date(i.created_at) > lim;
    const novos = pub.filter(eNovo);
    const lista = (novos.length >= 3 ? novos : pub).slice(0, 10);
    if (!lista.length) return '';
    return `<section class="mk-dcard"><h3>${ic('sparkles')}${titulo}<button class="mais" data-mk="aba" data-tab="biblioteca">Ver todas${ic('chevron-right')}</button></h3>
      <p class="sub">${novos.length ? 'Materiais que entraram nos últimos 15 dias' : 'Os materiais mais recentes da biblioteca'}</p>
      <div class="mk-nov">${lista.map((i) => `<button class="it" data-mk="${acaoDe(i)}" data-id="${i.id}"><span class="mk-pt">${eNovo(i) ? '<em class="novo">NOVO</em>' : ''}${capaHTML(i)}</span>
        <b>${esc(i.nome)}</b><small>${esc(nomePasta(i.pasta))} · ${i.tipo === 'editavel' ? 'editável' : i.tipo === 'video' ? 'vídeo' : 'pra baixar'}</small></button>`).join('')}</div></section>`;
  }
  function blocoRanking(admin) {
    const p = M.painel;
    const linhas = p && !p.erro ? (p.ranking || []).map((r) => [item(r.item_id), r]).filter(([i]) => i) : null;
    return `<section class="mk-dcard"><h3>${ic('trophy')}${admin ? 'Mais baixados' : 'Mais usadas na rede'}</h3>
      <p class="sub">${admin ? `Últimos ${p ? p.dias : M.painelDias} dias · por quantas unidades baixaram` : 'Últimos 30 dias · o que as outras unidades estão usando'}</p>
      ${!p ? CT.carregando() : !linhas ? '<div class="ct-dica">Não deu pra carregar agora.</div>' : !linhas.length ? '<div class="ct-dica">Ninguém baixou nada nesse período ainda.</div>'
        : `<div class="mk-rank">${linhas.map(([i, r], k) => `<div class="r"><span class="pos">${k + 1}</span><span class="mk-pt mini">${capaHTML(i)}</span>
          <div class="tx"><b>${esc(i.nome)}</b><small>${esc(nomePasta(i.pasta))}${admin ? ' · ' + r.downloads + ' ' + plural(r.downloads, 'download', 'downloads') : ''}</small></div>
          <div class="num">${r.unidades}<small>${plural(r.unidades, 'unidade', 'unidades')}</small></div>
          ${admin ? '' : `<button class="ct-btn gh sm" data-mk="${acaoDe(i)}" data-id="${i.id}">Usar</button>`}</div>`).join('')}</div>`}
    </section>`;
  }
  function blocoPastas() {
    const todos = visiveis().filter((i) => i.publicado);
    return `<section class="mk-dcard"><h3>${ic('folder-open')}Atalhos</h3><p class="sub">Tudo da biblioteca, por pasta</p>
      <div class="mk-pastas">${PASTAS.filter(([k]) => k !== 'campanhas').map(([k, n], x) => {
        const c = todos.filter((i) => i.pasta === k).length;
        return `<button class="pasta c${x}" data-mk="ir-pasta" data-pasta="${k}"><span class="ic">${ic(PASTA_ICONE[k] || 'folder')}</span><span><b>${n}</b><small>${c} ${plural(c, 'item', 'itens')}</small></span></button>`;
      }).join('')}</div></section>`;
  }
  function trocaVisao(direita) {
    if (!CT.admin()) return '';
    const b = (v, icone, nome) => `<button data-mk="visao" data-v="${v}" class="${(M.visao === 'unidade') === (v === 'unidade') ? 'on' : ''}">${ic(icone)}${nome}</button>`;
    return `<div class="ct-tools mk-ptools"><div class="ct-segw mk-visao">${b('rede', 'chart-column', 'Painel da rede')}${b('unidade', 'store', 'Visão das unidades')}</div>${direita}</div>`;
  }
  function vInicio() {
    if (!visiveis().length) {
      return CT.vazio('megaphone', 'Ainda não tem material aqui', CT.admin() ? 'Suba a primeira arte: o franqueado troca os textos e baixa pronta.' : 'Quando a Matriz publicar artes e materiais, eles aparecem aqui.',
        CT.admin() ? `<button class="ct-btn or" data-mk="subir">${ic('plus')}Subir material</button>` : '');
    }
    if (verRede()) return vPainelAdmin();
    return trocaVisao('') + `<div class="mk-g hero">${blocoCampanha()}${blocoMinha()}</div>${blocoNovidades('Novidades')}<div class="mk-g dois">${blocoRanking(false)}${blocoPastas()}</div>`;
  }
  function vPainelAdmin() {
    const p = M.painel, a = p && p.admin;
    const per = trocaVisao(`<div class="ct-segw mk-per">${[7, 30, 90].map((d) => `<button data-mk="periodo" data-dias="${d}" class="${M.painelDias === d ? 'on' : ''}">${d} dias</button>`).join('')}</div>`);
    if (!p) return per + CT.carregando();
    if (p.erro || !a) return per + CT.vazio('triangle-alert', 'Não deu pra carregar o painel', 'Verifique a internet e tente de novo.', `<button class="ct-btn gh" data-mk="painel-recarregar">${ic('rotate-cw')}Tentar de novo</button>`);
    const todos = M.itens || [], pub = todos.filter((i) => i.publicado), rasc = todos.length - pub.length;
    const novos = pub.filter((i) => new Date(i.created_at) > Date.now() - p.dias * 864e5).length;
    const dl = Number(a.downloads) || 0, ant = Number(a.anterior) || 0;
    const delta = ant ? Math.round((dl - ant) / ant * 100) : null;
    const paradas = a.paradas || [];
    const c = campanhaAtual(), fc = c && faltam(c.ate);
    const serie = a.serie || [], maxS = Math.max(1, ...serie.map((s) => Number(s.n) || 0));
    const dm = (s) => { const [, mm, dd] = String(s.dia).split('-'); return dd + '/' + mm; };
    const semUso = (a.sem_uso || []).map(item).filter(Boolean);
    const kpi = (icone, rot, valor, sub, cls = '') => `<section class="mk-dcard mk-kpi ${cls}"><span class="lb">${ic(icone)}${rot}</span><b>${valor}</b><span class="dl">${sub}</span></section>`;
    return per + `<div class="mk-g kpis">
        ${kpi('download', 'Downloads', dl, delta == null ? `<span>${dl ? 'Sem dados do período anterior' : 'Nenhum ainda'}</span>`
          : `<span class="${delta >= 0 ? 'up' : 'down'}">${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta)}% vs. ${p.dias} dias antes</span>`)}
        ${kpi('store', 'Unidades usando', `${a.unidades_usando} <small>de ${a.unidades_total}</small>`,
          paradas.length ? `<span class="or">${paradas.length} ${plural(paradas.length, 'não baixou', 'não baixaram')} nada</span>` : '<span class="up">Todas usando</span>')}
        ${kpi('layout-grid', 'Materiais publicados', pub.length, `+${novos} no período · ${rasc} ${plural(rasc, 'rascunho', 'rascunhos')}`)}
        ${kpi('flag', 'Campanha no ar', c ? esc(c.nome) : 'Nenhuma',
          c ? `<span class="or">${fc ? `Faltam ${fc.d} ${plural(fc.d, 'dia', 'dias')} · ` : ''}${a.campanha} ${plural(a.campanha, 'download', 'downloads')}</span>` : 'Suba um material com o campo Campanha', 'camp')}
      </div>
      <div class="mk-g graf">
        <section class="mk-dcard"><h3>${ic('chart-column')}Downloads por dia</h3><p class="sub">Passe o mouse na barra pra ver o dia</p>
          <div class="mk-chart">${serie.map((s) => `<i style="height:${Math.max(2, (Number(s.n) || 0) / maxS * 100)}%" class="${Number(s.n) ? '' : 'zero'}" data-v="${dm(s)} · ${s.n} ${plural(s.n, 'download', 'downloads')}"></i>`).join('')}</div>
          ${serie.length ? `<div class="mk-ax"><span>${dm(serie[0])}</span><span>${dm(serie[Math.floor(serie.length / 2)])}</span><span>${dm(serie[serie.length - 1])}</span></div>` : ''}
        </section>
        <section class="mk-dcard"><h3>${ic('alarm-clock')}Unidades paradas</h3><p class="sub">Não baixaram nada nos últimos ${p.dias} dias</p>
          ${paradas.length ? `<div class="mk-par">${paradas.map((u) => `<div class="u"><span class="dot">${esc(String(u.unidade || '?').replace(/^Ágil Solar\s*/i, '').slice(0, 2).toUpperCase())}</span>
              <div class="tx"><b>${esc(u.unidade)}</b><small>${u.ultimo_em ? 'Último download ' + quando(u.ultimo_em) : 'Nunca baixou'}</small></div>
              <button class="ct-btn gh sm" data-mk="lembrar" data-fq="${u.franquia_id}" title="Avisa no sininho quem tem o Marketing liberado na unidade">${ic('bell')}Lembrar</button></div>`).join('')}</div>`
            : `<div class="mk-okn">${ic('circle-check')}Todas as unidades baixaram algo nesse período.</div>`}
        </section>
      </div>
      <div class="mk-g dois">${blocoRanking(true)}
        <section class="mk-dcard"><h3>${ic('archive')}Sem uso</h3><p class="sub">Publicados antes do período e ninguém baixou · bons pra trocar ou tirar</p>
          ${semUso.length ? `<div class="mk-sem">${semUso.map((i) => `<div class="s"><span class="mk-pt mini">${capaHTML(i)}</span><div class="tx"><b>${esc(i.nome)}</b><small>Publicado em ${CT.dataCurta(String(i.created_at).slice(0, 10))}</small></div>
              <button class="ct-btn gh sm" data-mk="despublicar" data-id="${i.id}">Tirar da biblioteca</button></div>`).join('')}</div>`
            : '<div class="mk-okn">' + ic('circle-check') + 'Tudo que está publicado foi baixado nesse período.</div>'}
        </section>
      </div>
      ${blocoNovidades('Últimos materiais publicados')}`;
  }

  // ------------------------------------------------------------ desenho da arte
  function valorCampo(f, vals, uni) {
    if (f.tipo === 'unidade' || f.tipo === 'whats' || f.tipo === 'cidade') return (uni && uni[f.tipo]) || f.ex || '';
    if (f.tipo === 'fixo') return f.ex || '';
    const v = vals && vals[f.id];
    return v == null ? (f.ex || '') : v;
  }
  function desenhar(canvas, it, bg, vals, foto, uni) {
    const W = it.largura || bg.naturalWidth, H = it.altura || bg.naturalHeight;
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(bg, 0, 0, W, H);
    if (it.foto && foto) {
      const fx = it.foto.x * W, fy = it.foto.y * H, fw = it.foto.w * W, fh = it.foto.h * H;
      const r = Math.max(fw / foto.naturalWidth, fh / foto.naturalHeight), iw = foto.naturalWidth * r, ih = foto.naturalHeight * r;
      ctx.save(); ctx.beginPath(); ctx.rect(fx, fy, fw, fh); ctx.clip();
      ctx.drawImage(foto, fx + (fw - iw) / 2, fy + (fh - ih) / 2, iw, ih);
      ctx.restore();
    }
    (it.campos || []).forEach((f) => {
      const txt = String(valorCampo(f, vals, uni) || '');
      if (!txt) return;
      let size = f.size || 48;
      const maxW = Math.max(10, (f.w || 0.5) * W);
      const setFont = () => { ctx.font = `${pesoDe(f)} ${size}px "${fonteDe(f.fonte)[0]}", ${FONTE}`; };
      setFont();
      while (ctx.measureText(txt).width > maxW && size > 10) { size -= 2; setFont(); }
      ctx.fillStyle = corHex(f.cor);
      ctx.textBaseline = 'middle';
      ctx.textAlign = f.align || 'left';
      const x = f.align === 'center' ? (f.x + f.w / 2) * W : f.align === 'right' ? (f.x + f.w) * W : f.x * W;
      ctx.fillText(txt, x, f.y * H + (f.size || 48) * 1.25 / 2);
    });
    return canvas;
  }

  function encaixar() {
    const box = M.container && M.container.querySelector('.mk-stage');
    const cvw = box && box.querySelector('.mk-cvw');
    const it = M.view === 'editor' ? item(M.aberto) : M.rasc;
    if (!box || !cvw || !it || !it.largura) return;
    const r = box.getBoundingClientRect();
    const k = Math.min((r.width - 32) / it.largura, (r.height - 32) / it.altura);
    cvw.style.width = Math.max(40, it.largura * k) + 'px';
    cvw.style.height = Math.max(40, it.altura * k) + 'px';
  }
  window.addEventListener('resize', () => { if (naArte() && (M.view === 'editor' || M.tab === 'montar')) encaixar(); });

  // ------------------------------------------------------------ editor (quem baixa)
  function vEditor() {
    const it = item(M.aberto);
    const vals = M.vals[it.id] || {};
    const livres = (it.campos || []).filter((f) => f.tipo === 'texto');
    const autos = [...new Set((it.campos || []).filter((f) => AUTO[f.tipo]).map((f) => f.tipo))];
    const uni = M.uniEdit || M.uni || {};
    const foto = M.fotos[it.id];
    return `<button class="ct-voltar" data-mk="voltar">${ic('chevron-left')}Voltar</button>
    <div class="mk-ed">
      <div class="mk-stagebox"><div class="mk-stage"><div class="mk-cvw"><canvas id="mk-cv"></canvas></div><span class="mk-info">${it.largura}×${it.altura} px</span></div></div>
      <div class="ct-panel">
        <div><h2>${esc(it.nome)}</h2><p class="ct-lead">Troque os textos. A arte se atualiza na hora.</p></div>
        ${livres.length ? `<div class="ct-grp"><h4>${ic('type')}TEXTOS DA ARTE</h4>
          ${livres.map((f) => { const v = vals[f.id] == null ? (f.ex || '') : vals[f.id]; const max = f.max || 40; return `<div class="ct-fld"><label>${esc(f.label || 'Texto')}<span class="cnt ${v.length >= max ? 'lim' : ''}" data-cnt="${f.id}">${v.length}/${max}</span></label><input class="ct-inp" data-val="${f.id}" maxlength="${max}" value="${esc(v)}"></div>`; }).join('')}</div>` : ''}
        ${it.foto ? `<div class="ct-grp"><h4>${ic('image')}FOTO</h4>
          <div class="mk-foto-row">${foto ? `<img src="${esc(foto.src)}" alt="">` : `<span class="mk-foto-vazia">${ic('image-plus')}</span>`}
            <div><button class="ct-btn gh" data-mk="foto">${ic('upload')}${foto ? 'Trocar foto' : 'Usar foto do aparelho'}</button>${foto ? `<button class="ct-btn gh" data-mk="foto-tirar">${ic('x')}Tirar</button>` : ''}</div></div>
          <p class="ct-note">${ic('info')}<span>A foto fica só no seu aparelho. Não sobe pro servidor.</span></p></div>` : ''}
        ${autos.length ? `<div class="ct-grp"><h4>${ic('store')}DADOS DA SUA UNIDADE</h4>
          ${autos.map((k) => `<div class="ct-fld"><label>${AUTO[k]}<span class="ct-auto">AUTOMÁTICO</span></label><input class="ct-inp" data-uni="${k}" value="${esc(uni[k] || '')}"></div>`).join('')}
          <p class="ct-note">${ic('info')}<span>Vem do cadastro da unidade. Dá pra mudar só nesta arte.</span></p></div>` : ''}
        <div class="mk-dl">
          <button class="ct-btn or big" data-mk="baixar-png">${ic('download')}Baixar imagem (PNG)</button>
          <div class="row"><button class="ct-btn gh" data-mk="baixar-jpg">JPG (mais leve)</button><button class="ct-btn gh" data-mk="desfazer">Desfazer mudanças</button></div>
        </div>
      </div>
    </div>`;
  }
  let _edBg = null;
  async function prepararEditor() {
    const it = item(M.aberto);
    const cv = document.getElementById('mk-cv');
    if (!it || !cv) return;
    encaixar();
    try {
      await fontesProntas(it);
      _edBg = await CT.imagem(it.arquivo_id);
      if (M.view !== 'editor' || M.aberto !== it.id) return;
      if (!it.largura) { it.largura = _edBg.naturalWidth; it.altura = _edBg.naturalHeight; encaixar(); }
      redesenharEditor();
    } catch (e) {
      console.error('[mkt] arte', e);
      const st = M.container.querySelector('.mk-stage');
      if (st) st.innerHTML = CT.vazio('image-off', 'Não deu pra abrir a arte', 'Verifique a internet e tente de novo.');
      CT.icons();
    }
  }
  function redesenharEditor() {
    const it = item(M.aberto), cv = document.getElementById('mk-cv');
    if (!it || !cv || !_edBg) return;
    const f = M.fotos[it.id];
    desenhar(cv, it, _edBg, M.vals[it.id] || {}, f && f.img, M.uniEdit || M.uni);
  }
  async function baixarArte(tipo) {
    const it = item(M.aberto);
    if (!it || !_edBg) return;
    const f = M.fotos[it.id];
    const c = desenhar(document.createElement('canvas'), it, _edBg, M.vals[it.id] || {}, f && f.img, M.uniEdit || M.uni);
    const blob = await new Promise((r) => c.toBlob(r, tipo === 'png' ? 'image/png' : 'image/jpeg', 0.92));
    if (!blob) { CT.toast('Não deu pra gerar a imagem.'); return; }
    const uni = (M.uniEdit || M.uni || {}).unidade || '';
    CT.baixarBlob(blob, `${CT.slug(it.nome)}${uni ? '-' + CT.slug(uni) : ''}.${tipo === 'png' ? 'png' : 'jpg'}`);
    registrar(it.id);
    CT.toast('Arte baixada. Montada no seu aparelho, sem ocupar espaço no servidor.');
  }
  function registrar(id) {
    sb().rpc('mkt_registrar_download', { p_item: id }).then(({ error }) => {
      if (!error) M.painel = null;
      if (!error && CT.admin()) { const s = M.stats[id] || (M.stats[id] = { item_id: id, downloads: 0, unidades: 1 }); s.downloads = Number(s.downloads) + 1; }
    });
  }

  // ------------------------------------------------------------ montar arte (admin)
  function editaveis() { return (M.itens || []).filter((i) => i.tipo === 'editavel'); }
  function garantirRascunho() {
    const lista = editaveis();
    if (!lista.length) { M.rasc = null; return; }
    if (!M.montarId || !item(M.montarId) || item(M.montarId).tipo !== 'editavel') M.montarId = lista[0].id;
    if (!M.rasc || M.rasc.id !== M.montarId) { M.rasc = JSON.parse(JSON.stringify(item(M.montarId))); M.rasc.campos = M.rasc.campos || []; M.sujo = false; M.sel = null; }
  }
  const ICONE_CAMPO = { texto: 'type', unidade: 'store', whats: 'message-circle', cidade: 'map-pin', fixo: 'lock' };
  function previaCamada(x) {
    if (AUTO[x.tipo]) return (M.uni && M.uni[x.tipo]) || 'Vem da unidade';
    return x.ex || (x.tipo === 'fixo' ? 'Texto fixo' : 'Quem baixa escreve');
  }
  // Lista de fontes suspensa: cada nome escrito na própria fonte, agrupado por estilo
  function seletorFonte(f) {
    const atual = fonteDe(f.fonte);
    let grupo = '', itens = '';
    FONTES.forEach(([n, , e]) => {
      if (e !== grupo) { grupo = e; itens += `<div class="gp">${esc(e.toUpperCase())}</div>`; }
      itens += `<button data-mk="fonte" data-fonte="${esc(n)}" class="${atual[0] === n ? 'on' : ''}" style="font-family:'${n}',sans-serif"><span>${esc(n)}</span>${atual[0] === n ? ic('check') : ''}</button>`;
    });
    return `<div class="mk-fsel"><button class="mk-fbtn" data-mk="fonte-abrir" aria-haspopup="listbox" aria-expanded="false">
        <span class="nm" style="font-family:'${atual[0]}',sans-serif">${esc(atual[0])}</span><small>${esc(atual[2])}</small>${ic('chevron-down')}</button>
      <div class="mk-fmenu" role="listbox" hidden>${itens}</div></div>`;
  }
  function fecharFontes(root) {
    const m = root && root.querySelector('.mk-fmenu');
    if (!m || m.hidden) return;
    m.hidden = true;
    const b = root.querySelector('.mk-fbtn'); if (b) b.setAttribute('aria-expanded', 'false');
  }
  // Paleta da marca + cores em hex já usadas nesta arte
  function coresSw(r, f) {
    const atual = corHex(f.cor), marca = Object.values(COR);
    const usadas = [...new Set((r.campos || []).map((x) => corHex(x.cor)))].filter((h) => !marca.includes(h));
    return Object.entries(COR).map(([k, c]) => [c, k]).concat(usadas.map((h) => [h, h]))
      .map(([c, t]) => `<button data-mk="cor" data-cor="${c}" class="${atual === c ? 'on' : ''}" style="background:${c}" title="${t}"></button>`).join('');
  }
  function tipoCls(f) { return f.tipo === 'texto' ? '' : f.tipo === 'fixo' ? 'fixo' : 'auto'; }
  function vMontar() {
    garantirRascunho();
    const r = M.rasc;
    if (!r) return CT.vazio('pencil-ruler', 'Nenhuma arte editável ainda', 'Suba a arte sem os textos que vão mudar (nome, telefone, preço). Aqui você marca onde eles entram.',
      `<button class="ct-btn or" data-mk="subir" data-tipo="editavel">${ic('plus')}Subir arte editável</button>`);
    const f = (r.campos || []).find((x) => x.id === M.sel);
    const H = r.altura || 1;
    return `<div class="ct-tools"><select class="ct-inp mk-sel" id="mk-montar-sel">${editaveis().map((i) => `<option value="${i.id}" ${i.id === r.id ? 'selected' : ''}>${esc(i.nome)}${i.publicado ? '' : ' (rascunho)'}</option>`).join('')}</select>
      ${M.sujo ? `<span class="mk-sujo">${ic('circle-dot')}Alterações não salvas</span>` : ''}
      <button class="ct-btn or" data-mk="subir" data-tipo="editavel">${ic('plus')}Nova arte</button></div>
    <div class="mk-ed mt3">
      <div class="ct-panel mk-camadas">
        <div class="ct-grp"><h4>${ic('layers')}CAMADAS</h4>
          ${(r.campos || []).length || r.foto ? `<div class="mk-layers">${(r.campos || []).map((x) => `<button class="mk-layer ${tipoCls(x)} ${x.id === M.sel ? 'on' : ''}" data-mk="sel" data-id="${x.id}">
              <span class="ico">${ic(ICONE_CAMPO[x.tipo] || 'type')}</span><span class="tx"><b>${esc(x.label)}</b><small>${esc(previaCamada(x))}</small></span></button>`).join('')}
            ${r.foto ? `<button class="mk-layer foto ${M.sel === '__foto' ? 'on' : ''}" data-mk="sel" data-id="__foto"><span class="ico">${ic('image')}</span><span class="tx"><b>Foto trocável</b><small>Quem baixa põe a foto dele</small></span></button>` : ''}</div>`
            : '<div class="ct-dica">Nenhuma camada ainda. Adicione um texto e arraste até o lugar certo da arte.</div>'}
        </div>
        <div class="mk-addcol"><button class="ct-btn gh" data-mk="add" data-tipo="texto">${ic('type')}Texto livre</button><button class="ct-btn gh" data-mk="add" data-tipo="whats">${ic('store')}Dado da unidade</button>
          <button class="ct-btn gh" data-mk="foto-area">${ic(r.foto ? 'image-minus' : 'image-plus')}${r.foto ? 'Tirar foto trocável' : 'Foto trocável'}</button></div>
        <div class="mk-leg"><span><i class="or"></i>Quem baixa escreve</span><span><i class="az"></i>Vem da unidade</span><span><i class="cz"></i>Fixo</span></div>
      </div>
      <div class="mk-stagebox"><div class="mk-stage" id="mk-stage"><div class="mk-cvw" id="mk-cvw"><canvas id="mk-cv"></canvas>
        ${r.foto ? `<div class="mk-box foto ${M.sel === '__foto' ? 'on' : ''}" data-box="__foto" style="left:${r.foto.x * 100}%;top:${r.foto.y * 100}%;width:${r.foto.w * 100}%;height:${r.foto.h * 100}%"><span class="tg">Foto trocável</span><span class="rz canto" data-rz="__foto"></span></div>` : ''}
        ${(r.campos || []).map((x) => `<div class="mk-box ${tipoCls(x)} ${x.id === M.sel ? 'on' : ''}" data-box="${x.id}" style="left:${x.x * 100}%;top:${x.y * 100}%;width:${x.w * 100}%;height:${(x.size * 1.25) / H * 100}%"><span class="tg">${esc(x.label)}</span><span class="rz" data-rz="${x.id}"></span></div>`).join('')}
      </div></div></div>
      <div class="ct-panel mk-props">
        ${f ? `<div class="ct-grp"><h4>${ic('pencil')}CAMADA SELECIONADA</h4>
          <div class="ct-fld"><label>Nome que quem baixa vê</label><input class="ct-inp" data-cfg="label" value="${esc(f.label)}"></div>
          <div class="ct-fld"><label>O que vai nele</label><select class="ct-inp" data-cfg="tipo">${Object.entries(TIPO_CAMPO).map(([k, n]) => `<option value="${k}" ${f.tipo === k ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
          ${f.tipo === 'texto' || f.tipo === 'fixo' ? `<div class="ct-two"><div class="ct-fld" ${f.tipo === 'fixo' ? 'style="grid-column:span 2"' : ''}><label>${f.tipo === 'fixo' ? 'Texto' : 'Texto de exemplo'}</label><input class="ct-inp" data-cfg="ex" value="${esc(f.ex || '')}"></div>
            ${f.tipo === 'texto' ? `<div class="ct-fld"><label>Máx. de letras</label><input class="ct-inp" type="number" min="1" max="120" data-cfg="max" value="${f.max || 30}"></div>` : ''}</div>` : ''}
          <div class="ct-fld"><label>Tamanho da letra<span class="cnt" id="mk-size-lbl">${f.size}px</span></label><input type="range" min="16" max="${Math.round(Math.max(200, H / 5))}" step="2" data-cfg="size" value="${f.size}"></div>
          <div class="ct-fld"><label>Fonte</label>${seletorFonte(f)}</div>
          <div class="ct-fld"><label>Cor</label><div class="mk-sw">${coresSw(r, f)}</div>
            <div class="mk-hex"><input type="color" data-cor-pick value="${corHex(f.cor)}" title="Escolher qualquer cor"><input class="ct-inp" data-cor-hex value="${corHex(f.cor)}" maxlength="7" spellcheck="false" autocomplete="off" placeholder="#FFFFFF" aria-label="Cor em hex"><span class="mk-hexdica">Cole o código da cor (ex.: #FAA519)</span></div></div>
          <div class="ct-two"><div class="ct-fld"><label>Alinhar</label><div class="ct-segw">${[['left', 'Esq.'], ['center', 'Centro'], ['right', 'Dir.']].map(([k, n]) => `<button data-mk="al" data-al="${k}" class="${f.align === k ? 'on' : ''}">${n}</button>`).join('')}</div></div>
            <div class="ct-fld"><label>Peso</label>${fonteDe(f.fonte)[1].length > 1 ? `<div class="ct-segw">${fonteDe(f.fonte)[1].map((k) => `<button data-mk="peso" data-peso="${k}" class="${pesoDe(f) === k ? 'on' : ''}">${NOME_PESO[k]}</button>`).join('')}</div>` : '<p class="mk-um">Esta fonte só tem um peso.</p>'}</div></div>
          <button class="ct-btn gh perigo-tx" data-mk="del-campo">${ic('trash-2')}Tirar este campo</button>
        </div>` : M.sel === '__foto' ? `<div class="ct-grp"><h4>${ic('image')}FOTO TROCÁVEL</h4><p class="ct-note">${ic('info')}<span>Arraste a área na arte e puxe o canto pra mudar o tamanho. A foto de quem baixa preenche a área toda.</span></p></div>`
          : `<div class="mk-propvazio">${ic('mouse-pointer-click')}<b>Escolha uma camada</b><span>Clique numa camada à esquerda ou numa caixa na arte pra mudar texto, fonte, cor e tamanho.</span></div>`}
        <p class="ct-note">${ic('eye')}<span>Aparece pra quem tem o <b>Marketing</b> liberado no cadastro do usuário.</span></p>
        <div class="mk-dl">
          <button class="ct-btn or big" data-mk="salvar" data-pub="1">${ic('check')}${r.publicado ? 'Salvar' : 'Publicar na Biblioteca'}</button>
          <div class="row">${r.publicado ? `<button class="ct-btn gh" data-mk="salvar" data-pub="0">Tirar da Biblioteca</button>` : `<button class="ct-btn gh" data-mk="salvar" data-pub="0">Salvar rascunho</button>`}
            <button class="ct-btn gh" data-mk="previa">${ic('eye')}Ver como quem baixa</button></div>
        </div>
      </div>
    </div>`;
  }
  let _mtBg = null, _mtRaf = 0;
  async function prepararMontar() {
    const r = M.rasc;
    if (!r) return;
    encaixar();
    try {
      FONTES.forEach(([n]) => cssFonte(n)); // pra lista de fontes aparecer no próprio desenho
      await fontesProntas(r);
      _mtBg = await CT.imagem(r.arquivo_id);
      if (M.tab !== 'montar' || !M.rasc || M.rasc.id !== r.id) return;
      if (!r.largura) { r.largura = _mtBg.naturalWidth; r.altura = _mtBg.naturalHeight; encaixar(); }
      redesenharMontar();
    } catch (e) {
      console.error('[mkt] montar', e);
      CT.toast('Não deu pra abrir a imagem da arte.');
    }
  }
  function redesenharMontar() {
    const cv = document.getElementById('mk-cv');
    if (!cv || !_mtBg || !M.rasc) return;
    desenhar(cv, M.rasc, _mtBg, {}, null, M.uni);
  }
  function agendarMontar() { if (_mtRaf) return; _mtRaf = requestAnimationFrame(() => { _mtRaf = 0; redesenharMontar(); }); }
  function marcarSujo() {
    if (M.sujo) return;
    M.sujo = true;
    const tools = M.container.querySelector('.ct-tools');
    if (tools && !tools.querySelector('.mk-sujo')) tools.querySelector('select').insertAdjacentHTML('afterend', `<span class="mk-sujo">${ic('circle-dot')}Alterações não salvas</span>`), CT.icons();
  }
  function novoCampo(tipo) {
    const r = M.rasc, H = r.altura || 1080;
    const size = Math.round(H / 20 / 2) * 2;
    const f = { id: 'c' + Date.now().toString(36), label: tipo === 'texto' ? 'Texto novo' : AUTO[tipo], tipo, x: 0.1, y: 0.45, w: 0.8, size, cor: 'branco', align: 'center', peso: 800, ex: tipo === 'texto' ? 'Escreva aqui' : '', max: 30 };
    r.campos.push(f);
    M.sel = f.id;
    M.sujo = true;
    pintar();
  }
  async function gerarCapa(it, bg) {
    const c = desenhar(document.createElement('canvas'), it, bg, {}, null, M.uni);
    const k = Math.min(1, 640 / Math.max(c.width, c.height));
    const s = document.createElement('canvas');
    s.width = Math.round(c.width * k); s.height = Math.round(c.height * k);
    s.getContext('2d').drawImage(c, 0, 0, s.width, s.height);
    const blob = await new Promise((res) => s.toBlob(res, 'image/webp', 0.82));
    return blob ? new File([blob], CT.slug(it.nome) + '-capa.webp', { type: 'image/webp' }) : null;
  }
  async function salvarMontar(publicar, btn) {
    const r = M.rasc;
    if (!r) return;
    if (btn) { btn.disabled = true; btn.dataset.txt = btn.innerHTML; btn.innerHTML = 'Salvando…'; }
    try {
      const antigaCapa = r.capa_id;
      let capaId = r.capa_id;
      if (_mtBg) {
        const capa = await gerarCapa(r, _mtBg);
        if (capa) capaId = (await CT.enviar(capa, 'mkt-capas')).id;
      }
      const upd = { campos: r.campos, foto: r.foto || null, publicado: !!publicar, capa_id: capaId, largura: r.largura, altura: r.altura, updated_at: new Date().toISOString() };
      const { data, error } = await sb().from('mkt_itens').update(upd).eq('id', r.id).select('*').single();
      if (error) throw error;
      if (antigaCapa && antigaCapa !== capaId) CT.apagarArquivo(antigaCapa);
      const i = M.itens.findIndex((x) => x.id === r.id);
      if (i >= 0) M.itens[i] = data;
      M.rasc = JSON.parse(JSON.stringify(data));
      M.sujo = false;
      CT.toast(publicar ? 'Publicada. Já aparece na Biblioteca de quem pode ver.' : 'Salva como rascunho (fora da Biblioteca).');
      pintar();
    } catch (e) {
      console.error('[mkt] salvar', e);
      CT.toast('Não deu pra salvar: ' + (e.message || 'erro'));
      if (btn) { btn.disabled = false; btn.innerHTML = btn.dataset.txt; }
    }
  }

  // arrastar caixas
  let drag = null;
  function onDown(e) {
    const bx = e.target.closest('[data-box]');
    if (!bx || !M.rasc || M.tab !== 'montar') return;
    const id = bx.dataset.box, rz = !!e.target.closest('[data-rz]');
    const alvo = id === '__foto' ? M.rasc.foto : M.rasc.campos.find((x) => x.id === id);
    if (!alvo) return;
    if (M.sel !== id) {
      M.sel = id;
      M.container.querySelectorAll('[data-box]').forEach((b) => b.classList.toggle('on', b === bx));
    }
    const rect = M.container.querySelector('#mk-cvw').getBoundingClientRect();
    drag = { id, alvo, bx, rz, sx: e.clientX, sy: e.clientY, x: alvo.x, y: alvo.y, w: alvo.w, h: alvo.h, rect, moveu: false };
    bx.setPointerCapture(e.pointerId);
    e.preventDefault();
  }
  function onMove(e) {
    if (!drag) return;
    const { alvo, bx, rect } = drag;
    const dx = (e.clientX - drag.sx) / rect.width, dy = (e.clientY - drag.sy) / rect.height;
    if (Math.abs(dx) + Math.abs(dy) > 0.003) drag.moveu = true;
    if (!drag.moveu) return;
    if (drag.rz) {
      alvo.w = Math.max(0.05, Math.min(1 - alvo.x, drag.w + dx));
      bx.style.width = alvo.w * 100 + '%';
      if (drag.id === '__foto') { alvo.h = Math.max(0.05, Math.min(1 - alvo.y, drag.h + dy)); bx.style.height = alvo.h * 100 + '%'; }
    } else {
      const hFrac = drag.id === '__foto' ? alvo.h : 0;
      alvo.x = Math.max(-0.02, Math.min(1 - alvo.w + 0.02, drag.x + dx));
      alvo.y = Math.max(0, Math.min(1 - hFrac, drag.y + dy));
      bx.style.left = alvo.x * 100 + '%';
      bx.style.top = alvo.y * 100 + '%';
    }
    marcarSujo();
    agendarMontar();
  }
  function onUp() {
    if (!drag) return;
    const moveu = drag.moveu;
    drag = null;
    if (!moveu) pintar(); // só clicou: abre a configuração do campo
  }

  // ------------------------------------------------------------ quem baixou (admin)
  function vUso() {
    if (!M.uso) return CT.carregando();
    if (M.uso.erro) return CT.vazio('triangle-alert', 'Não deu pra carregar', esc(M.uso.erro));
    const total = M.uso.lista.reduce((s, u) => s + Number(u.downloads || 0), 0);
    return `<div class="mk-uso-resumo"><b>${total}</b><span>downloads nos últimos 30 dias · ${M.uso.lista.filter((u) => Number(u.downloads) > 0).length} de ${M.uso.lista.length} unidades usando</span></div>
      <div class="mk-uso">${M.uso.lista.map((u) => {
        const n = Number(u.downloads || 0);
        return `<div class="mk-uso-card"><div class="l1"><b>${esc(u.unidade)}</b><b class="${n ? 'az' : 'vm'}">${n} ${n === 1 ? 'arte' : 'artes'}</b></div>
          <span>${u.ultimo_item ? 'Última: ' + esc(u.ultimo_item) : 'Nunca baixou'}</span>${u.ultimo_em ? `<span>${CT.data(u.ultimo_em)}</span>` : ''}</div>`;
      }).join('')}</div>`;
  }
  async function carregarUso() {
    const { data, error } = await sb().rpc('mkt_uso', { p_dias: 30 });
    M.uso = error ? { erro: error.message, lista: [] } : { lista: data || [] };
    if (M.tab === 'uso' && naArte()) pintar();
  }

  // ------------------------------------------------------------ subir / editar material (admin)
  function abrirSubir(it, tipoInicial) {
    if (!CT.admin()) return;
    const novo = !it;
    const S = { tipo: it ? it.tipo : (tipoInicial || 'editavel'), file: null, prev: null };
    const m = CT.modal('');
    const desenhaModal = () => {
      const tipos = [['editavel', 'Arte editável', 'Você marca o que quem baixa pode trocar'], ['arquivo', 'Só pra baixar', 'PDF, folder, logo, arte pronta'], ['video', 'Vídeo', 'Link do YouTube (não ocupa espaço)']];
      const arq = it && CT._arq.get(it.arquivo_id);
      const val = (n, d) => { const el = m.querySelector(`[name="${n}"]`); return el ? el.value : d; };
      const nome = val('nome', it ? it.nome : ''), pasta = val('pasta', it ? it.pasta : (S.tipo === 'video' ? 'videos' : 'redes'));
      const camp = val('campanha', it ? it.campanha || '' : ''), ate = val('ate', it ? it.campanha_ate || '' : ''), url = val('video', it ? it.video_url || '' : '');
      m.innerHTML = `<div class="ct-mh"><div><h3>${novo ? 'Subir material' : 'Editar material'}</h3><p>${novo ? 'Vai pra Biblioteca do Marketing' : esc(it.nome)}</p></div><button class="ct-x" data-m="fechar">${ic('x')}</button></div>
        ${novo ? `<div class="ct-tipos">${tipos.map(([k, n, s]) => `<button data-m="tipo" data-tipo="${k}" class="${S.tipo === k ? 'on' : ''}"><b>${n}</b><small>${s}</small></button>`).join('')}</div>` : ''}
        ${S.tipo === 'video' ? `<div class="ct-fld"><label>Link do vídeo no YouTube</label><input class="ct-inp" name="video" value="${esc(url)}" placeholder="https://youtu.be/…"></div>
          <p class="ct-note">${ic('info')}<span>Suba no YouTube como <b>não listado</b>: só quem tem o link assiste.</span></p>` :
        `<button class="ct-drop ${S.file || arq ? 'has' : ''}" data-m="arquivo">${S.prev ? `<img src="${S.prev}" alt="">` : ic(S.file ? 'file-check' : 'upload')}
          <b>${S.file ? esc(S.file.name) : arq ? esc(arq.nome) : 'Escolher arquivo'}</b><small>${S.file || arq ? 'Clique pra trocar' : S.tipo === 'editavel' ? 'PNG ou JPG da arte, sem os textos que vão mudar' : 'PDF, PNG, JPG, ZIP…'}</small></button>
          ${S.tipo === 'editavel' && novo ? `<p class="ct-note">${ic('info')}<span>No Canva, exporte a arte <b>sem</b> o nome, o telefone e o preço. Depois você marca onde eles entram. A imagem vira WebP e fica bem mais leve.</span></p>` : ''}`}
        <div class="ct-two"><div class="ct-fld"><label>Nome</label><input class="ct-inp" name="nome" value="${esc(nome)}" placeholder="Ex.: Dia dos Pais · Story"></div>
          <div class="ct-fld"><label>Pasta</label><select class="ct-inp" name="pasta">${PASTAS.map(([k, n]) => `<option value="${k}" ${pasta === k ? 'selected' : ''}>${n}</option>`).join('')}</select></div></div>
        <div class="ct-two"><div class="ct-fld"><label>Campanha (opcional)</label><input class="ct-inp" name="campanha" value="${esc(camp)}" placeholder="Ex.: Black Friday 2026"></div>
          <div class="ct-fld"><label>No ar até</label><input class="ct-inp" type="date" name="ate" value="${esc(ate)}"></div></div>
        ${!novo && it.tipo !== 'editavel' ? `<label class="ct-tog"><input type="checkbox" name="publicado" ${it.publicado ? 'checked' : ''}><span class="sl"></span>Aparece na Biblioteca</label>` : ''}
        <div class="ct-mf">${novo ? '' : `<button class="ct-btn gh perigo-tx" data-m="excluir" style="margin-right:auto">${ic('trash-2')}Excluir</button>`}
          <button class="ct-btn gh" data-m="fechar">Cancelar</button>
          <button class="ct-btn or" data-m="ok">${novo && S.tipo === 'editavel' ? 'Continuar · marcar campos' : novo ? 'Publicar' : 'Salvar'}</button></div>`;
      CT.icons();
    };
    desenhaModal();
    const input = document.createElement('input');
    input.type = 'file';
    input.addEventListener('change', async () => {
      const f = input.files && input.files[0];
      input.value = '';
      if (!f) return;
      if (S.tipo === 'editavel' && !/^image\//.test(f.type)) { CT.toast('A arte editável precisa ser uma imagem (PNG ou JPG).'); return; }
      S.file = f;
      if (S.prev) URL.revokeObjectURL(S.prev);
      S.prev = /^image\//.test(f.type) ? URL.createObjectURL(f) : null;
      const n = m.querySelector('[name="nome"]');
      if (n && !n.value) n.value = f.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ');
      desenhaModal();
    });
    m.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-m]');
      if (!b) return;
      const a = b.dataset.m;
      if (a === 'fechar') { CT.fecharModal(); return; }
      if (a === 'tipo') { S.tipo = b.dataset.tipo; if (S.tipo === 'video') { S.file = null; S.prev = null; } desenhaModal(); return; }
      if (a === 'arquivo') { input.accept = S.tipo === 'editavel' ? 'image/png,image/jpeg,image/webp' : ''; input.click(); return; }
      if (a === 'excluir') {
        if (!(await CT.confirmar('Excluir este material?', `“${it.nome}” sai da Biblioteca e o arquivo é apagado. Não dá pra desfazer.`, 'Excluir'))) return;
        const { error } = await sb().from('mkt_itens').delete().eq('id', it.id);
        if (error) { CT.toast('Não deu pra excluir: ' + error.message); return; }
        CT.apagarArquivo(it.arquivo_id); CT.apagarArquivo(it.capa_id);
        M.itens = M.itens.filter((x) => x.id !== it.id);
        if (M.rasc && M.rasc.id === it.id) M.rasc = null;
        CT.toast('Material excluído.');
        pintar();
        return;
      }
      if (a === 'ok') salvarModal(m, b, S, it);
    });
  }
  async function salvarModal(m, btn, S, it) {
    const novo = !it;
    const v = (n) => (m.querySelector(`[name="${n}"]`) || {}).value || '';
    const nome = v('nome').trim();
    if (!nome) { CT.toast('Dê um nome ao material.'); return; }
    if (S.tipo === 'video' && !CT.youtubeId(v('video'))) { CT.toast('Cole um link do YouTube válido.'); return; }
    if (novo && S.tipo !== 'video' && !S.file) { CT.toast('Escolha o arquivo.'); return; }
    btn.disabled = true; btn.textContent = S.file ? 'Enviando…' : 'Salvando…';
    try {
      const reg = { nome, pasta: v('pasta') || 'redes', campanha: v('campanha').trim() || null, campanha_ate: v('ate') || null, updated_at: new Date().toISOString() };
      if (S.tipo === 'video') reg.video_url = v('video').trim();
      const velhos = [];
      if (S.file) {
        let f = S.file, capa = null;
        if (S.tipo === 'editavel') {
          f = await CT.paraWebp(S.file, 2400, 0.92);
          const img = await CT.carregarImg(URL.createObjectURL(f));
          reg.largura = img.naturalWidth; reg.altura = img.naturalHeight;
        } else if (/^image\//.test(S.file.type)) {
          capa = await CT.paraWebp(S.file, 640, 0.82);
        }
        const arq = await CT.enviar(f, 'mkt');
        if (it && it.arquivo_id) velhos.push(it.arquivo_id);
        reg.arquivo_id = arq.id;
        if (capa) { reg.capa_id = (await CT.enviar(capa, 'mkt-capas')).id; if (it && it.capa_id) velhos.push(it.capa_id); }
        else if (S.tipo !== 'editavel' && it && it.capa_id) { reg.capa_id = null; velhos.push(it.capa_id); }
      }
      let data, error;
      if (novo) {
        reg.tipo = S.tipo;
        reg.publicado = S.tipo !== 'editavel';
        ({ data, error } = await sb().from('mkt_itens').insert(reg).select('*').single());
      } else {
        const p = m.querySelector('[name="publicado"]');
        if (p) reg.publicado = p.checked;
        ({ data, error } = await sb().from('mkt_itens').update(reg).eq('id', it.id).select('*').single());
      }
      if (error) throw error;
      velhos.forEach((id) => CT.apagarArquivo(id));
      if (novo) M.itens.unshift(data); else M.itens[M.itens.findIndex((x) => x.id === it.id)] = data;
      if (M.rasc && M.rasc.id === data.id) M.rasc = null;
      CT.fecharModal();
      if (data.tipo === 'editavel' && (novo || S.file)) {
        M.montarId = data.id; M.rasc = null; M.view = 'lista';
        CT.toast(novo ? 'Arte enviada. Agora marque os campos.' : 'Arte trocada. Confira os campos.');
        if (M.tab === 'montar') pintar(); else setTab('montar');
      } else {
        CT.toast(novo ? 'Publicado na Biblioteca.' : 'Salvo.');
        pintar();
      }
    } catch (e) {
      console.error('[mkt] subir', e);
      CT.toast('Não deu pra salvar: ' + (e.message || 'erro'));
      btn.disabled = false; btn.textContent = 'Tentar de novo';
    }
  }

  function assistir(it) {
    const src = CT.youtubeEmbed(it.video_url);
    if (!src) { CT.toast('Link de vídeo inválido.'); return; }
    CT.modal(`<div class="ct-mh"><div><h3>${esc(it.nome)}</h3></div><button class="ct-x" data-m="fechar">${ic('x')}</button></div>
      <div class="ct-video"><iframe src="${esc(src)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`, { largo: true })
      .addEventListener('click', (e) => { if (e.target.closest('[data-m="fechar"]')) CT.fecharModal(); });
    registrar(it.id);
  }

  // ------------------------------------------------------------ eventos
  function ligar(root) {
    if (!root) return;
    root.addEventListener('keydown', (e) => { if (e.key === 'Escape') fecharFontes(root); });
    root.addEventListener('click', async (e) => {
      if (!e.target.closest('.mk-fsel')) fecharFontes(root);
      const b = e.target.closest('[data-mk]');
      if (!b) return;
      const a = b.dataset.mk, id = b.dataset.id, it = id && item(id);
      switch (a) {
        case 'recarregar': M.itens = null; renderMktRoute(M.container, M.tab); break;
        case 'pasta': M.pasta = b.dataset.pasta; pintar(); break;
        case 'ir-pasta': M.pasta = b.dataset.pasta; M.q = ''; setTab('biblioteca'); break;
        case 'visao': {
          M.visao = b.dataset.v === 'unidade' ? 'unidade' : 'rede';
          try { localStorage.setItem('mkt_visao', M.visao); } catch (_) {}
          if (M.painel && M.painel.dias !== (verRede() ? M.painelDias : 30)) M.painel = null;
          pintar();
          break;
        }
        case 'periodo': M.painelDias = Number(b.dataset.dias) || 30; M.painel = null; pintar(); break;
        case 'painel-recarregar': M.painel = null; pintar(); break;
        case 'lembrar': {
          b.disabled = true;
          const { data, error } = await sb().rpc('mkt_lembrar_unidade', { p_franquia: b.dataset.fq });
          if (error) { b.disabled = false; CT.toast('Não deu pra avisar agora.'); return; }
          const n = Number(data) || 0;
          CT.toast(n ? `Aviso enviado no sininho pra ${n} ${n === 1 ? 'pessoa' : 'pessoas'}.` : 'Ninguém dessa unidade tem o Marketing liberado no cadastro.');
          if (n) { b.innerHTML = ic('check') + 'Avisado'; CT.icons(); } else b.disabled = false;
          break;
        }
        case 'despublicar': {
          if (!it || !(await CT.confirmar('Tirar da biblioteca?', `"${it.nome}" deixa de aparecer pras unidades. Dá pra publicar de novo depois.`, 'Tirar'))) return;
          const { error } = await sb().from('mkt_itens').update({ publicado: false, updated_at: new Date().toISOString() }).eq('id', it.id);
          if (error) { CT.toast('Não deu pra tirar agora.'); return; }
          it.publicado = false; M.painel = null; pintar();
          CT.toast('Tirado da biblioteca.');
          break;
        }
        case 'aba': setTab(b.dataset.tab); break;
        case 'subir': abrirSubir(null, b.dataset.tipo); break;
        case 'editar': if (it) abrirSubir(it); break;
        case 'abrir': if (it) { M.de = M.tab; M.aberto = id; M.view = 'editor'; M.uniEdit = null; pintar(); window.scrollTo(0, 0); } break;
        case 'voltar': M.view = 'lista'; M.uniEdit = null; pintar(); break;
        case 'baixar': if (it && (await CT.baixarArquivo(it.arquivo_id))) registrar(it.id); break;
        case 'assistir': if (it) assistir(it); break;
        case 'baixar-png': baixarArte('png'); break;
        case 'baixar-jpg': baixarArte('jpg'); break;
        case 'desfazer': delete M.vals[M.aberto]; delete M.fotos[M.aberto]; M.uniEdit = null; pintar(); break;
        case 'foto': escolherFoto(); break;
        case 'foto-tirar': delete M.fotos[M.aberto]; pintar(); break;
        case 'montar':
          if (M.sujo && M.rasc && M.rasc.id !== id && !(await CT.confirmar('Descartar alterações?', 'A arte que você estava montando tem mudanças não salvas.', 'Descartar'))) return;
          M.montarId = id; M.rasc = null; M.view = 'lista';
          if (M.tab === 'montar') pintar(); else setTab('montar');
          break;
        case 'sel': M.sel = id; pintar(); break;
        case 'add': novoCampo(b.dataset.tipo); break;
        case 'foto-area': M.rasc.foto = M.rasc.foto ? null : { x: 0, y: 0, w: 1, h: 0.6 }; M.sel = M.rasc.foto ? '__foto' : null; M.sujo = true; pintar(); break;
        case 'cor': case 'al': case 'peso': case 'fonte': {
          const f = M.rasc && M.rasc.campos.find((x) => x.id === M.sel);
          if (!f) return;
          if (a === 'cor') f.cor = b.dataset.cor;
          else if (a === 'al') f.align = b.dataset.al;
          else if (a === 'peso') f.peso = Number(b.dataset.peso);
          else { f.fonte = b.dataset.fonte === FONTES[0][0] ? '' : b.dataset.fonte; f.peso = pesoDe(f); }
          M.sujo = true;
          pintar();
          break;
        }
        case 'fonte-abrir': {
          const m = b.parentElement.querySelector('.mk-fmenu');
          m.hidden = !m.hidden;
          b.setAttribute('aria-expanded', String(!m.hidden));
          if (!m.hidden) { const on = m.querySelector('.on'); if (on) m.scrollTop = on.offsetTop - m.clientHeight / 2 + on.offsetHeight / 2; }
          break;
        }
        case 'del-campo': M.rasc.campos = M.rasc.campos.filter((x) => x.id !== M.sel); M.sel = null; M.sujo = true; pintar(); break;
        case 'salvar': salvarMontar(b.dataset.pub === '1', b); break;
        case 'previa':
          if (M.sujo) { CT.toast('Salve antes de ver como fica pra quem baixa.'); return; }
          M.de = 'montar'; M.aberto = M.rasc.id; M.view = 'editor'; pintar(); break;
      }
    });
    root.addEventListener('input', (e) => {
      const el = e.target, d = el.dataset;
      if (el.id === 'mk-q') {
        M.q = el.value;
        const pos = el.selectionStart;
        pintar();
        const n = document.getElementById('mk-q');
        if (n) { n.focus(); n.setSelectionRange(pos, pos); }
        return;
      }
      if (d.val) {
        const it = item(M.aberto), f = it && it.campos.find((x) => x.id === d.val);
        (M.vals[M.aberto] = M.vals[M.aberto] || {})[d.val] = el.value;
        const c = root.querySelector(`[data-cnt="${d.val}"]`);
        if (c && f) { c.textContent = `${el.value.length}/${f.max || 40}`; c.classList.toggle('lim', el.value.length >= (f.max || 40)); }
        redesenharEditor();
        return;
      }
      if (d.uni) { M.uniEdit = Object.assign({}, M.uniEdit || M.uni, { [d.uni]: el.value }); redesenharEditor(); return; }
      if ((el.hasAttribute('data-cor-hex') || el.hasAttribute('data-cor-pick')) && M.rasc) {
        const f = M.rasc.campos.find((x) => x.id === M.sel);
        if (!f) return;
        let v = el.value.trim();
        if (v && v[0] !== '#') v = '#' + v;
        if (/^#[0-9a-f]{3}$/i.test(v) && el.hasAttribute('data-cor-pick')) v = '#' + v.slice(1).split('').map((c) => c + c).join('');
        if (!/^#[0-9a-f]{6}$/i.test(v)) return;
        f.cor = v.toUpperCase();
        const outro = root.querySelector(el.hasAttribute('data-cor-hex') ? '[data-cor-pick]' : '[data-cor-hex]');
        if (outro) outro.value = f.cor;
        root.querySelectorAll('.mk-sw button').forEach((s) => s.classList.toggle('on', corHex(s.dataset.cor) === f.cor));
        marcarSujo(); agendarMontar();
        return;
      }
      if (d.cfg && M.rasc) {
        const f = M.rasc.campos.find((x) => x.id === M.sel);
        if (!f) return;
        const k = d.cfg;
        f[k] = (k === 'size' || k === 'max') ? Number(el.value) : el.value;
        marcarSujo();
        if (k === 'size') {
          const lbl = document.getElementById('mk-size-lbl'); if (lbl) lbl.textContent = f.size + 'px';
          const bx = root.querySelector(`[data-box="${f.id}"]`); if (bx) bx.style.height = (f.size * 1.25) / (M.rasc.altura || 1) * 100 + '%';
          agendarMontar();
        } else if (k === 'label') {
          const tg = root.querySelector(`[data-box="${f.id}"] .tg`); if (tg) tg.textContent = el.value;
          const cb = root.querySelector(`.mk-layer[data-id="${f.id}"] b`); if (cb) cb.textContent = el.value;
        } else if (k === 'ex') {
          const cs = root.querySelector(`.mk-layer[data-id="${f.id}"] small`); if (cs) cs.textContent = previaCamada(f);
          agendarMontar();
        }
      }
    });
    root.addEventListener('change', async (e) => {
      const el = e.target;
      if (el.id === 'mk-montar-sel') {
        if (M.sujo && !(await CT.confirmar('Descartar alterações?', 'A arte que você estava montando tem mudanças não salvas.', 'Descartar'))) { el.value = M.rasc.id; return; }
        M.montarId = el.value; M.rasc = null; pintar();
      } else if (el.dataset.cfg === 'tipo' && M.rasc) {
        const f = M.rasc.campos.find((x) => x.id === M.sel);
        if (f) { f.tipo = el.value; if (AUTO[f.tipo] && /^(Texto novo|Nome da unidade|WhatsApp|Cidade)$/.test(f.label)) f.label = AUTO[f.tipo]; M.sujo = true; pintar(); }
      }
    });
    root.addEventListener('pointerdown', onDown);
    root.addEventListener('pointermove', onMove);
    root.addEventListener('pointerup', onUp);
    root.addEventListener('pointercancel', onUp);
  }

  function escolherFoto() {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*';
    input.addEventListener('change', async () => {
      const f = input.files && input.files[0];
      if (!f) return;
      const src = URL.createObjectURL(f);
      try { M.fotos[M.aberto] = { img: await CT.carregarImg(src), src }; pintar(); } catch (_) { CT.toast('Não deu pra abrir essa foto.'); }
    });
    input.click();
  }

  // Botão "+" do menu (só admin)
  function mktSubir() {
    if (!naArte()) return;
    abrirSubir(null, M.tab === 'montar' ? 'editavel' : undefined);
  }

  window.renderMktRoute = renderMktRoute;
  window.mktSubir = mktSubir;
  window.MKT = { recarregar: () => { M.itens = null; M.uso = null; }, inicioDaAba: () => { M.view = 'lista'; M.uniEdit = null; } };
})();
