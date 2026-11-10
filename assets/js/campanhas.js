// ==========================================
// CAMPANHAS — promoção com data para acabar
// ------------------------------------------
// Tabela public.campanhas (migration 20261110150000_campanhas). Cada campanha
// tem kits próprios (produtos.linha = campanhas.linha, preço pela importação
// de sempre), um selo na proposta online e validade até o fim.
//
//  • Campanhas.ativa     → a campanha no ar para o usuário (RPC campanha_ativa).
//    O orçamento mostra o botão dela no seletor e abre nela; quando acaba,
//    some sozinha (o banco também recusa proposta fora do prazo).
//  • renderAdminCampanhas → Configurações › Campanhas (só admin): lista,
//    editor e prévia ao vivo. Nada vai ao ar sem o admin publicar.
//
// Sem a migration (tabela inexistente) tudo fica desligado e a tela avisa.
// ==========================================

(function () {
  const esc = (s) => (typeof escapeHTML === 'function' ? escapeHTML(String(s ?? '')) : String(s ?? ''));
  const toast = (m) => { if (typeof showToast === 'function') showToast(m); };
  const dois = (n) => String(n).padStart(2, '0');

  // fundo, fundo 2, texto, destaque, texto no destaque, quadradinho, quadradinho (cartão branco), borda, partícula
  const CORES = {
    preto:   { nome: 'Preto',     c: '#141210', c2: '#1D1A16', ink: '#fff',    ac: '#FAA519', acink: '#2A1A00', tile: 'rgba(255,255,255,.08)', tileb: '#FFF3DC', brd: '#FAA519', part: '#FAA519' },
    azul:    { nome: 'Azul Ágil', c: '#0072AA', c2: '#008FD4', ink: '#fff',    ac: '#FAA519', acink: '#2A1A00', tile: 'rgba(255,255,255,.14)', tileb: '#E5F3FB', brd: '#008FD4', part: '#FFD58A' },
    laranja: { nome: 'Laranja',   c: '#F59B0B', c2: '#FAA519', ink: '#2A1A00', ac: '#2A1A00', acink: '#FAA519', tile: 'rgba(0,0,0,.09)',       tileb: '#FFF3DC', brd: '#FAA519', part: '#FFFFFF' },
    verde:   { nome: 'Verde',     c: '#127A51', c2: '#1FA971', ink: '#fff',    ac: '#FFE08A', acink: '#0B3D28', tile: 'rgba(255,255,255,.14)', tileb: '#E3F6EE', brd: '#1FA971', part: '#FFE08A' },
  };
  const PERFIS = [['matriz', 'Matriz'], ['franqueado', 'Franqueados'], ['parceiro', 'Parceiros']];

  function vars(cor) {
    const c = CORES[cor] || CORES.preto;
    return `--cp-c:${c.c};--cp-c2:${c.c2};--cp-ink:${c.ink};--cp-ac:${c.ac};--cp-acink:${c.acink};--cp-tile:${c.tile};--cp-tileb:${c.tileb};--cp-brd:${c.brd};--cp-part:${c.part}`;
  }
  const ms = (iso) => new Date(iso).getTime();
  function dataCurta(iso) { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }); }
  function dataHora(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return `${dataCurta(iso)} às ${dois(d.getHours())}h${dois(d.getMinutes())}`;
  }
  function restam(fimIso) {
    const s = Math.max(0, Math.floor((ms(fimIso) - Date.now()) / 1000));
    return { d: Math.floor(s / 86400), h: Math.floor(s % 86400 / 3600), m: Math.floor(s % 3600 / 60), s: s % 60, total: s };
  }

  // ---------- campanha no ar ----------
  const Campanhas = {
    ativa: null,
    lista: [],          // todas (só admin carrega): rótulo dos kits e importação
    semTabela: false,

    async carregarAtiva() {
      if (typeof supabaseClient === 'undefined' || !state.currentUser) return null;
      try {
        const { data, error } = await supabaseClient.rpc('campanha_ativa');
        if (error) throw error;
        this.ativa = (Array.isArray(data) ? data[0] : data) || null;
      } catch (err) {
        // sem a migration: tudo desligado, em silêncio
        this.ativa = null;
        if (!/campanha_ativa|does not exist|schema cache/i.test(String(err?.message || ''))) console.warn('[campanhas] Falha ao ler a campanha no ar.', err);
      }
      return this.ativa;
    },

    async carregarLista() {
      if (typeof supabaseClient === 'undefined' || !state.isAdmin) return [];
      try {
        const { data, error } = await supabaseClient.from('campanhas').select('*').order('inicio', { ascending: false });
        if (error) throw error;
        this.lista = data || [];
        this.semTabela = false;
      } catch (err) {
        this.lista = [];
        this.semTabela = /campanhas|does not exist|schema cache/i.test(String(err?.message || ''));
        if (!this.semTabela) console.warn('[campanhas] Falha ao ler as campanhas.', err);
      }
      return this.lista;
    },

    // carrega as duas (a lista só para admin)
    carregar() { return Promise.all([this.carregarAtiva(), this.carregarLista()]); },

    // no ar AGORA (confere o relógio: a campanha pode ter acabado com a tela aberta)
    noAr() {
      const c = this.ativa;
      if (!c || !c.publicada) return null;
      const t = Date.now();
      return t >= ms(c.inicio) && t <= ms(c.fim) ? c : null;
    },
    daLinha(linha) { const c = this.noAr(); return c && linha && c.linha === linha ? c : null; },
    ehLinhaDeCampanha(linha) { return Boolean(linha) && linha !== 'catalogo' && linha !== 'promocional'; },
    // rótulo de um kit de campanha (na lista de produtos e no registrar venda)
    rotuloLinha(linha) {
      if (!this.ehLinhaDeCampanha(linha)) return '';
      const c = (this.ativa && this.ativa.linha === linha && this.ativa) || this.lista.find((x) => x.linha === linha);
      return c ? c.etiqueta : String(linha).toUpperCase();
    },

    vars,
    tagHTML(c, cls = '') {
      return `<span class="camp-tag ${cls}" style="${vars(c.cor)}">${esc(c.etiqueta)}</span>`;
    },
    validadeTexto(c) {
      return c.validade_fim ? `A proposta vale até ${dataHora(c.fim)}, o fim da campanha, no lugar das 72 h.` : 'A proposta vale 72 h, como sempre.';
    },
    // faixa no topo do construtor (orçamento)
    faixaHTML(c) {
      const r = restam(c.fim);
      const cd = c.contagem
        ? `<div class="camp-cd" data-camp-fim="${esc(c.fim)}">${(r.d > 0 ? [['d', r.d, 'dias']] : []).concat([['h', r.h, 'horas'], ['m', r.m, 'min'], ['s', r.s, 'seg']])
          .map(([k, v, l]) => `<span class="u"><b data-u="${k}">${dois(v)}</b><small>${l}</small></span>`).join('')}</div>` : '';
      return `<div class="camp-faixa${c.visual === 'b' ? ' is-b' : ''}" style="${vars(c.cor)}">
        <div class="camp-faixa-tx"><div class="camp-mc"><b>${esc(c.etiqueta)}</b><span>${esc(c.subtitulo || '')}</span></div>
        <p>Preço especial até <b>${esc(dataHora(c.fim))}</b>. A proposta sai com o selo da campanha${c.contagem ? ' e a contagem' : ''}.</p></div>${cd}</div>`;
    },
  };
  window.Campanhas = Campanhas;
  Campanhas.CORES = CORES;

  // Relógio único: atualiza as contagens e, quando a campanha acaba com o
  // orçamento aberto, volta para os Promocionais.
  let _estavaNoAr = false;
  setInterval(() => {
    document.querySelectorAll('[data-camp-fim]').forEach((el) => {
      const r = restam(el.dataset.campFim);
      const set = (k, v) => { const b = el.querySelector(`[data-u="${k}"]`); if (b && b.textContent !== dois(v)) b.textContent = dois(v); };
      set('d', r.d); set('h', r.h); set('m', r.m); set('s', r.s);
    });
    const noAr = Boolean(Campanhas.noAr());
    if (_estavaNoAr && !noAr && Campanhas.ativa && state.pbLinha === Campanhas.ativa.linha) {
      state.pbLinha = 'promocional';
      if (typeof orcamentoLimparKit === 'function') orcamentoLimparKit();
      if (typeof orcamentoAberto === 'function' && orcamentoAberto()) {
        if (typeof renderContent === 'function') renderContent();          // seletor do topo
        if (typeof pbFornecimentoSync === 'function') pbFornecimentoSync(); // lista de kits e faixa
      }
      toast(`A campanha ${Campanhas.ativa.nome} terminou.`);
    }
    _estavaNoAr = noAr;
  }, 1000);

  // ==========================================
  // CONFIGURAÇÕES › CAMPANHAS (admin)
  // ==========================================
  let cont = null;     // container da seção
  let tela = 'lista';  // lista | editar
  let ed = null;       // rascunho do editor
  let resumo = {};     // campanha_id → { kits, propostas, vendas }
  let prevAba = 'proposta';
  let salvando = false;

  const statusDe = (c) => {
    if (!c.publicada) return ['ra', 'Rascunho'];
    const t = Date.now();
    if (t < ms(c.inicio)) return ['ag', 'Agendada'];
    if (t > ms(c.fim)) return ['fim', 'Encerrada'];
    return ['ar', 'No ar'];
  };
  const slug = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
  // datetime-local <-> ISO no fuso do navegador
  const paraInput = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}T${dois(d.getHours())}:${dois(d.getMinutes())}`; };
  const deInput = (v) => { const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d.toISOString(); };

  async function carregarResumo() {
    try {
      const { data, error } = await supabaseClient.rpc('campanhas_resumo');
      if (error) throw error;
      resumo = Object.fromEntries((data || []).map((r) => [r.campanha_id, r]));
    } catch (_) { resumo = {}; }
  }

  function novaCampanha() {
    const ini = new Date(); ini.setDate(ini.getDate() + 1); ini.setHours(0, 0, 0, 0);
    const fim = new Date(ini); fim.setDate(fim.getDate() + 14); fim.setHours(23, 59, 0, 0);
    return { id: null, nome: '', etiqueta: '', subtitulo: 'Ágil Solar', cor: 'preto', visual: 'a',
      inicio: ini.toISOString(), fim: fim.toISOString(), linha: '', contagem: true, efeito: true, fita: true,
      validade_fim: true, perfis: ['matriz', 'franqueado', 'parceiro'], publicada: false, _linhaManual: false };
  }

  function htmlLista() {
    if (Campanhas.semTabela) {
      return `<div class="camp-aviso"><i data-lucide="database"></i><span>As campanhas ainda não estão no banco. Rode a migration <b>20261110150000_campanhas.sql</b> no SQL Editor do Supabase e abra esta aba de novo.</span></div>`;
    }
    const linhas = Campanhas.lista.map((c) => {
      const [st, stNome] = statusDe(c);
      const n = resumo[c.id] || {};
      const quando = st === 'ar' ? `Até ${dataHora(c.fim)}` : st === 'ag' ? `Começa ${dataHora(c.inicio)}` : st === 'fim' ? `Terminou ${dataCurta(c.fim)}` : `${dataCurta(c.inicio)} a ${dataCurta(c.fim)}`;
      return `<div class="camp-item" role="button" tabindex="0" data-camp-id="${esc(c.id)}">
        <span class="camp-mini${c.visual === 'b' ? ' is-b' : ''}" style="${vars(c.cor)}">${esc(c.etiqueta)}</span>
        <span class="camp-item-nm"><b>${esc(c.nome)}</b><small>${quando} · ${n.kits ? `${n.kits} kits` : 'sem kits ainda'}</small></span>
        <span class="camp-item-n"><span><small>Propostas</small><b>${n.propostas || 0}</b></span><span><small>Vendas</small><b>${n.vendas || 0}</b></span></span>
        <span class="camp-st ${st}">${stNome}</span></div>`;
    }).join('');
    return `<div class="camp-topo"><p>Promoções com data para acabar: selo na proposta, kits próprios e contagem.</p>
        <button type="button" class="btn btn-primary" data-camp-acao="nova"><i data-lucide="plus"></i>Nova campanha</button></div>
      ${linhas ? `<div class="camp-lista">${linhas}</div>` : `<div class="camp-vazio"><i data-lucide="badge-percent"></i><b>Nenhuma campanha ainda</b><span>Crie a primeira: ela fica como rascunho até você publicar.</span></div>`}
      <div class="camp-dica"><i data-lucide="info"></i><span>Só uma campanha fica no ar por vez. Quando a data de fim passa, os kits dela saem do orçamento e as propostas mostram "condição encerrada", sem precisar desligar nada.</span></div>`;
  }

  function htmlEditor() {
    const c = ed;
    const nova = !c.id;
    const [st, stNome] = nova ? ['ra', 'Rascunho'] : statusDe(c);
    const n = (c.id && resumo[c.id]) || {};
    const chk = [
      ['contagem', 'Contagem regressiva', 'Dias, horas, minutos e segundos até o fim'],
      ['efeito', 'Efeito no selo', 'Partícula na borda no tema escuro, brilho passando no tema claro'],
      ['fita', 'Fita no preço', `"Preço ${esc(c.etiqueta || 'da campanha')}" no canto do valor`],
      ['validade_fim', 'Proposta vale até o fim da campanha', 'No lugar das 72 h de sempre'],
    ];
    const cor = CORES[c.cor] || CORES.preto;
    return `<button type="button" class="camp-voltar" data-camp-acao="lista"><i data-lucide="arrow-left"></i>Campanhas</button>
      <div class="camp-ed-h"><h3>${nova ? 'Nova campanha' : esc(c.nome)}</h3><span class="camp-st ${st}">${stNome}</span></div>
      <div class="camp-ed">
        <div class="camp-form">
          <section class="camp-bloco"><div class="t"><span class="n">1</span>Nome e selo</div><p class="s">O que o cliente lê no selo da proposta.</p>
            <label class="camp-campo"><span>Nome da campanha</span><input data-campo="nome" maxlength="60" value="${esc(c.nome)}" placeholder="Ex.: Black Ágil Solar"></label>
            <div class="camp-g2">
              <label class="camp-campo"><span>Etiqueta do selo</span><div class="camp-cnt"><input data-campo="etiqueta" maxlength="10" value="${esc(c.etiqueta)}" placeholder="BLACK"><em data-cnt>${c.etiqueta.length}/10</em></div></label>
              <label class="camp-campo"><span>Texto ao lado</span><input data-campo="subtitulo" maxlength="30" value="${esc(c.subtitulo)}"></label>
            </div>
          </section>
          <section class="camp-bloco"><div class="t"><span class="n">2</span>Visual</div><p class="s">A cor vale para o selo, a etiqueta dos kits e o botão no orçamento.</p>
            <div class="camp-opc">${[['a', 'Faixa', 'Cor cheia, chama mais atenção'], ['b', 'Na identidade', 'Cartão branco com borda']].map(([v, t, s]) => {
              const am = v === 'a' ? `background:linear-gradient(120deg,${cor.c2},${cor.c} 60%)` : `background:#fff;box-shadow:inset 0 0 0 2px ${cor.brd}`;
              return `<button type="button" class="${c.visual === v ? 'on' : ''}" data-visual="${v}"><span class="am" style="${am}"></span><span><b>${t}</b><small>${s}</small></span></button>`;
            }).join('')}</div>
            <div class="camp-campo"><span>Cor</span><div class="camp-cores">${Object.entries(CORES).map(([k, x]) =>
              `<button type="button" class="camp-cor${c.cor === k ? ' on' : ''}" data-cor="${k}" title="${x.nome}" aria-label="${x.nome}" style="background:linear-gradient(135deg,${x.c2},${x.c})"><i style="background:${x.ac}"></i></button>`).join('')}</div></div>
          </section>
          <section class="camp-bloco"><div class="t"><span class="n">3</span>Período</div><p class="s">Entra e sai sozinha nessas datas (depois de publicada).</p>
            <div class="camp-g2">
              <label class="camp-campo"><span>Começa em</span><input type="datetime-local" data-campo="inicio" value="${paraInput(c.inicio)}"></label>
              <label class="camp-campo"><span>Termina em</span><input type="datetime-local" data-campo="fim" value="${paraInput(c.fim)}"></label>
            </div>
          </section>
          <section class="camp-bloco"><div class="t"><span class="n">4</span>Kits da campanha</div><p class="s">Preço próprio, pela importação de sempre (Comercial › Produtos).</p>
            <label class="camp-campo"><span>Código na planilha (coluna linha)</span><input data-campo="linha" maxlength="30" value="${esc(c.linha)}" placeholder="black"></label>
            <div class="camp-kits"><i data-lucide="file-spreadsheet"></i><div><b>${n.kits ? `${n.kits} kits importados` : 'Nenhum kit ainda'}</b><span>${nova ? 'Salve o rascunho e importe a planilha com a coluna' : 'Na planilha, use a coluna'} <code>linha = ${esc(c.linha || '...')}</code></span></div>
              ${nova ? '' : '<button type="button" class="btn btn-secondary" data-camp-acao="produtos">Ir para Produtos</button>'}</div>
          </section>
          <section class="camp-bloco"><div class="t"><span class="n">5</span>Na proposta</div><p class="s">Liga e desliga cada detalhe.</p>
            <div class="camp-chk">${chk.map(([k, t, s]) => `<div class="camp-chk-l" data-toggle="${k}" role="switch" tabindex="0" aria-checked="${c[k] ? 'true' : 'false'}"><span class="tx"><b>${t}</b><small>${s}</small></span><input type="checkbox" data-bool="${k}" tabindex="-1" aria-hidden="true" ${c[k] ? 'checked' : ''}><span class="sw"></span></div>`).join('')}</div>
          </section>
          <section class="camp-bloco"><div class="t"><span class="n">6</span>Quem pode usar</div><p class="s">Quem vê a campanha no orçamento. O admin vê sempre.</p>
            <div class="camp-pills">${PERFIS.map(([k, t]) => `<button type="button" class="${c.perfis.includes(k) ? 'on' : ''}" data-perfil="${k}">${c.perfis.includes(k) ? '<i data-lucide="check"></i>' : ''}${t}</button>`).join('')}</div>
          </section>
          <div class="camp-rodape">
            ${!nova && !(n.propostas > 0) ? '<button type="button" class="btn btn-ghost camp-perigo" data-camp-acao="excluir"><i data-lucide="trash-2"></i>Excluir</button>' : ''}
            <span class="esp"></span>
            ${c.publicada
              ? `<button type="button" class="btn btn-secondary" data-camp-acao="despublicar">Tirar do ar</button><button type="button" class="btn btn-primary" data-camp-acao="salvar"><i data-lucide="check"></i>Salvar</button>`
              : `<button type="button" class="btn btn-secondary" data-camp-acao="salvar">Salvar rascunho</button><button type="button" class="btn btn-primary camp-publicar" data-camp-acao="publicar"><i data-lucide="rocket"></i>Publicar</button>`}
          </div>
        </div>
        <aside class="camp-prev" id="camp-prev"></aside>
      </div>`;
  }

  // prévia ao vivo (o mesmo desenho do selo da proposta, em miniatura)
  function pintarPrevia() {
    const el = cont && cont.querySelector('#camp-prev');
    if (!el || !ed) return;
    const c = ed;
    const escuro = document.documentElement.getAttribute('data-theme') === 'dark';
    const r = restam(c.fim);
    const tag = esc(c.etiqueta || 'ETIQUETA');
    const cd = c.contagem ? `<div class="cd" data-camp-fim="${esc(c.fim)}">${[['d', r.d, 'dias'], ['h', r.h, 'h'], ['m', r.m, 'min'], ['s', r.s, 'seg']].map(([k, v, l]) => `<span><b data-u="${k}">${dois(v)}</b><small>${l}</small></span>`).join('')}</div>` : '';
    const txt = `${c.validade_fim ? 'Válida até ' : 'Até '}${esc(dataHora(c.fim))}`;
    const selo = c.visual === 'a'
      ? `<div class="pv-selo a"><div><div class="mc"><span class="tg">${tag}</span><span class="sb">${esc(c.subtitulo)}</span></div><p>${txt}</p></div>${cd}</div>`
      : `<div class="pv-selo b"><div><div class="mc"><span class="tg">${tag}</span><span class="nm">${esc(c.nome || 'Nome da campanha')}</span></div><p>${txt}</p></div>${cd}</div>`;
    const corpo = prevAba === 'proposta'
      ? `<div class="pv-fake"><i></i><i></i><i style="width:70%"></i></div><div class="pv-orb${c.efeito ? '' : ' sem'}"><div>${selo}</div></div><div class="pv-fake"><i></i><i></i><i style="width:55%"></i></div>`
      : `<div class="pv-seletor"><span class="on"><em>${tag}</em><small>até ${esc(dataCurta(c.fim))}</small></span><span>Promocionais</span><span>Catálogo</span></div>
         <div class="pv-kits">${[['Kit 7 · SOFAR', 'R$ 13.990', 'R$ 10.990'], ['Kit 9 · SOFAR', 'R$ 16.186', 'R$ 12.990']].map((k) =>
           `<div class="pv-kit"><span class="tg2">${tag}</span><b>${k[0]}</b><s>De ${k[1]}</s><strong>${k[2]}</strong></div>`).join('')}</div>`;
    el.setAttribute('style', vars(c.cor));
    el.innerHTML = `<div class="pv-t"><b>Prévia</b><div class="pv-seg"><button type="button" class="${prevAba === 'proposta' ? 'on' : ''}" data-prev="proposta">Proposta</button><button type="button" class="${prevAba === 'orcamento' ? 'on' : ''}" data-prev="orcamento">Orçamento</button></div></div>
      <div class="pv-tela${escuro ? ' esc' : ''}">${corpo}</div>
      <p class="pv-nota">${prevAba === 'proposta' ? `É assim que o cliente vê o topo da proposta${c.efeito ? (escuro ? ' (no tema escuro, com a partícula)' : ' (no tema claro, com o brilho passando)') : ''}.` : 'Botão no seletor do orçamento e etiqueta nos kits da campanha.'}</p>`;
  }

  function desenhar() {
    if (!cont) return;
    cont.innerHTML = `<div class="camp-adm">${tela === 'lista' ? htmlLista() : htmlEditor()}</div>`;
    if (tela !== 'lista') pintarPrevia();
    if (window.lucide) lucide.createIcons();
  }

  function validar(c, publicar) {
    if (String(c.nome).trim().length < 2) return 'Dê um nome para a campanha.';
    if (String(c.etiqueta).trim().length < 2) return 'Escreva a etiqueta do selo (2 a 10 letras).';
    if (!/^[a-z0-9][a-z0-9-]{1,29}$/.test(c.linha) || ['catalogo', 'promocional'].includes(c.linha)) return 'O código na planilha precisa ter de 2 a 30 letras minúsculas, números ou hífen (e não pode ser catalogo nem promocional).';
    if (!c.inicio || !c.fim) return 'Preencha o começo e o fim.';
    if (ms(c.fim) <= ms(c.inicio)) return 'O fim precisa ser depois do começo.';
    if (!c.perfis.length) return 'Escolha pelo menos um grupo em "Quem pode usar".';
    if (publicar) {
      if (ms(c.fim) <= Date.now()) return 'O fim já passou: ajuste o período antes de publicar.';
      if (!(c.id && resumo[c.id] && resumo[c.id].kits > 0)) return 'Importe os kits da campanha antes de publicar (Comercial › Produtos, coluna linha = ' + c.linha + ').';
    }
    return '';
  }

  async function salvar(publicada) {
    if (salvando) return;
    const c = ed;
    c.nome = String(c.nome).trim(); c.etiqueta = String(c.etiqueta).trim().toUpperCase(); c.subtitulo = String(c.subtitulo || '').trim();
    const erro = validar(c, publicada);
    if (erro) { toast(erro); return; }
    salvando = true;
    const payload = { nome: c.nome, etiqueta: c.etiqueta, subtitulo: c.subtitulo, cor: c.cor, visual: c.visual, inicio: c.inicio, fim: c.fim,
      linha: c.linha, contagem: c.contagem, efeito: c.efeito, fita: c.fita, validade_fim: c.validade_fim, perfis: c.perfis, publicada };
    try {
      const q = c.id
        ? supabaseClient.from('campanhas').update(payload).eq('id', c.id).select().single()
        : supabaseClient.from('campanhas').insert([payload]).select().single();
      const { data, error } = await q;
      if (error) throw error;
      ed = { ...data, _linhaManual: true };
      toast(publicada && !c.publicada ? 'Campanha publicada.' : !publicada && c.publicada ? 'Campanha fora do ar.' : 'Campanha salva.');
      await Promise.all([Campanhas.carregar(), carregarResumo()]);
      if (typeof orcamentoAberto === 'function' && orcamentoAberto() && typeof renderContent === 'function') renderContent();
      desenhar();
    } catch (err) {
      const m = String(err?.message || '');
      toast(/uma_por_vez|conflicting key|exclusion/i.test(m) ? 'Já tem outra campanha publicada nesse período. Só uma fica no ar por vez.'
        : /campanhas_linha_key|duplicate key/i.test(m) ? 'Esse código na planilha já é de outra campanha.'
        : `Não foi possível salvar: ${m}`);
    } finally { salvando = false; }
  }

  function excluir() {
    const c = ed;
    if (!c?.id) return;
    const n = resumo[c.id] || {};
    const msg = `Excluir a campanha ${c.nome}? ${n.kits ? `Os ${n.kits} kits dela saem de linha (não são apagados). ` : ''}Isso não pode ser desfeito.`;
    const run = async () => {
      const { error } = await supabaseClient.from('campanhas').delete().eq('id', c.id);
      if (error) { toast(/foreign key|violates/i.test(error.message) ? 'Essa campanha já tem propostas: tire do ar em vez de excluir.' : `Não foi possível excluir: ${error.message}`); return; }
      toast('Campanha excluída.');
      ed = null; tela = 'lista';
      await Promise.all([Campanhas.carregar(), carregarResumo()]);
      desenhar();
    };
    if (typeof showConfirmModal === 'function') showConfirmModal(msg, run, 'Excluir');
    else if (window.confirm(msg)) run();
  }

  // chave liga/desliga (div em vez de label: o painel do admin reescreve texto de label)
  function alternar(row) {
    const k = row.dataset.toggle;
    const inp = row.querySelector('input');
    if (!ed || !k || !inp) return;
    inp.checked = !inp.checked;
    row.setAttribute('aria-checked', String(inp.checked));
    ed[k] = inp.checked;
    pintarPrevia();
  }

  function ligar() {
    if (!cont || cont.dataset.campBound) return;
    cont.dataset.campBound = '1';
    cont.addEventListener('click', (e) => {
      const item = e.target.closest('[data-camp-id]');
      if (item) {
        const c = Campanhas.lista.find((x) => x.id === item.dataset.campId);
        if (c) { ed = { ...c, perfis: [...(c.perfis || [])], _linhaManual: true }; tela = 'editar'; desenhar(); window.scrollTo({ top: 0 }); }
        return;
      }
      const acao = e.target.closest('[data-camp-acao]')?.dataset.campAcao;
      if (acao === 'nova') { ed = novaCampanha(); tela = 'editar'; desenhar(); window.scrollTo({ top: 0 }); return; }
      if (acao === 'lista') { tela = 'lista'; ed = null; desenhar(); return; }
      if (acao === 'salvar') { salvar(Boolean(ed.publicada)); return; }
      if (acao === 'publicar') { salvar(true); return; }
      if (acao === 'despublicar') {
        const run = () => salvar(false);
        if (typeof showConfirmModal === 'function') showConfirmModal(`Tirar a campanha ${ed.nome} do ar? Os kits dela saem do orçamento na hora.`, run, 'Tirar do ar');
        else run();
        return;
      }
      if (acao === 'excluir') { excluir(); return; }
      if (acao === 'produtos') { if (typeof adminIrParaAbaProdutos === 'function') adminIrParaAbaProdutos(); return; }
      if (!ed) return;
      const vis = e.target.closest('[data-visual]');
      if (vis) { ed.visual = vis.dataset.visual; desenhar(); return; }
      const cor = e.target.closest('[data-cor]');
      if (cor) { ed.cor = cor.dataset.cor; desenhar(); return; }
      const perf = e.target.closest('[data-perfil]');
      if (perf) {
        const k = perf.dataset.perfil;
        ed.perfis = ed.perfis.includes(k) ? ed.perfis.filter((x) => x !== k) : [...ed.perfis, k];
        desenhar(); return;
      }
      const pv = e.target.closest('[data-prev]');
      if (pv) { prevAba = pv.dataset.prev; pintarPrevia(); return; }
      const tg = e.target.closest('[data-toggle]');
      if (tg) alternar(tg);
    });
    // chaves e itens da lista também pelo teclado
    cont.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const alvo = e.target.closest('[data-toggle], [data-camp-id]');
      if (!alvo || alvo !== e.target) return;
      e.preventDefault();
      alvo.click();
    });
    cont.addEventListener('input', (e) => {
      if (!ed) return;
      const campo = e.target.dataset.campo;
      if (!campo || e.target.type === 'datetime-local') return;
      let v = e.target.value;
      if (campo === 'etiqueta') {
        v = v.toUpperCase(); e.target.value = v;
        const cnt = e.target.parentNode.querySelector('[data-cnt]'); if (cnt) cnt.textContent = `${v.length}/10`;
        // código da planilha acompanha a etiqueta até alguém mexer nele
        if (!ed.id && !ed._linhaManual) {
          ed.linha = slug(v);
          const li = cont.querySelector('[data-campo="linha"]'); if (li) li.value = ed.linha;
        }
      }
      if (campo === 'linha') {
        // enquanto digita deixa o hífen do fim ("black-"); o acabamento é no change
        v = String(v).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+/, '').slice(0, 30);
        e.target.value = v;
        ed._linhaManual = true;
      }
      ed[campo] = v;
      if (campo === 'linha') { const code = cont.querySelector('.camp-kits code'); if (code) code.textContent = `linha = ${v || '...'}`; }
      pintarPrevia();
    });
    cont.addEventListener('change', (e) => {
      if (!ed) return;
      if (e.target.type === 'datetime-local') { const iso = deInput(e.target.value); if (iso) ed[e.target.dataset.campo] = iso; pintarPrevia(); return; }
      if (e.target.dataset.campo === 'linha') { ed.linha = slug(ed.linha); e.target.value = ed.linha; }
      const b = e.target.dataset.bool;
      if (b) { ed[b] = e.target.checked; if (b === 'fita') desenhar(); else pintarPrevia(); }
    });
  }

  async function renderAdminCampanhas(container) {
    cont = container;
    tela = 'lista'; ed = null;
    container.innerHTML = '<p class="camp-carregando">Carregando campanhas…</p>';
    ligar();
    await Promise.all([Campanhas.carregarLista(), carregarResumo()]);
    if (cont !== container) return;
    desenhar();
  }
  window.renderAdminCampanhas = renderAdminCampanhas;

  // tema claro/escuro trocado com o editor aberto: refaz a prévia
  new MutationObserver(() => { if (cont && document.body.contains(cont) && tela === 'editar') pintarPrevia(); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
})();
