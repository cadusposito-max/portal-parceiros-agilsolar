// ==========================================
// MENÇÃO COM @ nas anotações da timeline (ficha do cliente, visual novo)
// ==========================================
// Na caixa da timeline, "@" abre a lista de quem consegue abrir o cliente
// (RPC mencao_pessoas, mesma regra da RLS). Setas/Enter escolhem e o nome entra
// como "@Nome". Ao salvar, os escolhidos que ainda estão no texto vão em
// crm_atividades.meta.mencionados (+ mencionados_nomes, para destacar na
// timeline); o gatilho do banco avisa cada um no sininho e no celular
// (migration 20261019150000_mencao_timeline).
//
// A lista é position: fixed no <body>: o corpo da ficha rola e cortaria uma
// lista dentro dele. No celular ela abre para cima quando embaixo não cabe
// até o teclado (visualViewport), então o teclado nunca cobre os nomes.
//
// Sem a migration (RPC ausente) a dica não aparece e nada muda na caixa.
// Depende de: config.js (state, supabaseClient), utils.js (escapeHTML),
// crm.js (_crm360ClientId), ui-v2.js (uiV2.isActive).

(function () {
  const esc = (s) => (typeof escapeHTML === 'function' ? escapeHTML(String(s ?? '')) : String(s ?? ''));
  const v2 = () => Boolean(window.uiV2 && window.uiV2.isActive());
  const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const MINUSC = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);
  // "MARCOS LIMA" -> "Marcos Lima" (nomes já escritos à mão ficam como estão)
  const nomeBonito = (n) => {
    const t = String(n || '').trim().replace(/\s+/g, ' ');
    if (t !== t.toUpperCase()) return t;
    return t.toLowerCase().split(' ').map((p, i) => (i && MINUSC.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1))).join(' ');
  };
  // primeiro + último nome: "Marcos da Silva Lima" -> "ML"
  const iniciais = (n) => {
    const p = n.split(' ').filter((x) => x && !MINUSC.has(x.toLowerCase()));
    return ((p[0] || '?')[0] +(p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
  };

  const pessoas = new Map();     // cliente_id -> [{ id, nome, papel }] | 'carregando' | null (sem RPC)
  const escolhidos = new Map();  // cliente_id -> [{ id, nome }] escolhidos na caixa
  const M = { aberta: false, ini: -1, filtro: '', sel: 0, opcoes: [], inp: null, cliente: null };
  let alvoPendente = null;       // atividade a destacar (aberta pelo sininho)

  async function carregar(clienteId) {
    if (pessoas.has(clienteId)) return pessoas.get(clienteId);
    pessoas.set(clienteId, 'carregando');
    const { data, error } = await supabaseClient.rpc('mencao_pessoas', { p_cliente: clienteId });
    if (error) {
      console.warn('[mencao] lista indisponível:', error.message);
      pessoas.set(clienteId, null);
      return null;
    }
    const lista = (data || []).map((p) => ({ id: p.user_id, nome: nomeBonito(p.nome), papel: p.papel || '' }));
    pessoas.set(clienteId, lista);
    return lista;
  }

  // ---- caixa ------------------------------------------------------------------
  function composerDicaHTML() {
    if (!v2()) return '';
    return `<div class="v2-men-dica" id="v2-men-dica" hidden><i data-lucide="at-sign"></i><span>Digite <kbd>@</kbd> para avisar alguém da equipe.</span></div>`;
  }

  function ligar() {
    fechar();
    if (!v2()) return;
    const inp = document.getElementById('crm360-composer-text');
    const clienteId = typeof _crm360ClientId !== 'undefined' ? _crm360ClientId : null;
    if (!inp || !clienteId || inp.dataset.mencao) return;
    inp.dataset.mencao = '1';
    inp.setAttribute('autocomplete', 'off');

    carregar(clienteId).then((lista) => {
      const dica = document.getElementById('v2-men-dica');
      if (dica && Array.isArray(lista) && lista.length) dica.hidden = false;
    });

    inp.addEventListener('input', () => {
      const lista = escolhidos.get(clienteId);
      if (lista) escolhidos.set(clienteId, lista.filter((m) => inp.value.includes('@' + m.nome)));
      detectar(inp, clienteId);
    });
    inp.addEventListener('click', () => detectar(inp, clienteId));
    inp.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== inp) fechar(); }, 150));
    // captura no pai: roda antes do onkeydown da caixa (Enter = salvar) e do
    // ESC da ficha (document), que só valem com a lista fechada
    inp.parentElement.addEventListener('keydown', (e) => {
      if (e.target !== inp || !M.aberta) return;
      const n = M.opcoes.length;
      let feito = true;
      if (e.key === 'ArrowDown' && n) { M.sel = (M.sel + 1) % n; pintar(); }
      else if (e.key === 'ArrowUp' && n) { M.sel = (M.sel - 1 + n) % n; pintar(); }
      else if ((e.key === 'Enter' || e.key === 'Tab') && n) escolher(M.opcoes[M.sel]);
      else if (e.key === 'Escape') fechar();
      else feito = false;
      if (feito) { e.preventDefault(); e.stopPropagation(); }
    }, true);
  }

  // "@algo" logo antes do cursor (o nome pode ter um espaço: "@Marcos Li")
  function detectar(inp, clienteId) {
    const lista = pessoas.get(clienteId);
    if (!Array.isArray(lista) || !lista.length) { fechar(); return; }
    const pos = inp.selectionStart;
    const m = inp.value.slice(0, pos).match(/(^|\s)@([^\s@]{0,30}(?: [^\s@]{0,30})?)$/);
    if (!m) { fechar(); return; }
    const filtro = m[2];
    const f = semAcento(filtro.trim());
    const opcoes = lista.filter((p) => {
      const nm = semAcento(p.nome);
      return !f || nm.startsWith(f) || nm.split(' ').some((pt) => pt.startsWith(f));
    });
    // "@palavra outra" sem ninguém com esse nome: é texto normal, não menção
    if (!opcoes.length && /\s/.test(filtro)) { fechar(); return; }
    if (M.filtro !== filtro || M.inp !== inp) M.sel = 0;
    Object.assign(M, { aberta: true, ini: pos - filtro.length - 1, filtro, opcoes, inp, cliente: clienteId });
    pintar();
  }

  function pop() {
    let el = document.getElementById('v2-men-pop');
    if (!el) {
      el = document.createElement('div');
      el.id = 'v2-men-pop';
      el.className = 'v2-men-pop';
      el.setAttribute('role', 'listbox');
      el.setAttribute('aria-label', 'Pessoas da equipe');
      // mousedown: escolhe sem tirar o foco da caixa
      el.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const b = e.target.closest('[data-i]');
        if (b) escolher(M.opcoes[+b.dataset.i]);
      });
      document.body.appendChild(el);
    }
    return el;
  }

  function pintar() {
    if (!M.aberta || !M.inp || !M.inp.isConnected) { fechar(); return; }
    const el = pop();
    const f = semAcento(M.filtro.trim());
    const marca = (nome) => {
      const i = f ? semAcento(nome).indexOf(f) : -1;
      return i < 0 ? esc(nome) : esc(nome.slice(0, i)) + '<mark>' + esc(nome.slice(i, i + f.length)) + '</mark>' + esc(nome.slice(i + f.length));
    };
    el.innerHTML = `<h6>Avisar quem?</h6>` + (M.opcoes.length
      ? `<div class="v2-men-lista">${M.opcoes.map((p, i) => `<button type="button" role="option" aria-selected="${i === M.sel}" class="v2-men-op ${i === M.sel ? 'on' : ''}" data-i="${i}"><span class="v2-men-av">${esc(iniciais(p.nome))}</span><span class="v2-men-tx"><b>${marca(p.nome)}</b><small>${esc(p.papel)}</small></span></button>`).join('')}</div>`
      : `<div class="v2-men-vazio">Ninguém com esse nome entre quem pode ver este cliente.</div>`);
    posicionar();
    el.querySelector('.v2-men-op.on')?.scrollIntoView({ block: 'nearest' });
  }

  // embaixo da caixa; se não couber até o fim da tela visível (teclado), em cima
  function posicionar() {
    const el = document.getElementById('v2-men-pop');
    if (!el || !M.inp) return;
    const r = M.inp.getBoundingClientRect();
    const vv = window.visualViewport;
    const topoVis = vv ? vv.offsetTop : 0;
    const fimVis = vv ? vv.offsetTop + vv.height : window.innerHeight;
    const lista = el.querySelector('.v2-men-lista');
    if (lista) lista.style.maxHeight = '';
    const largura = Math.min(340, window.innerWidth - 16);
    el.style.width = largura + 'px';
    el.style.left = Math.max(8, Math.min(r.left, window.innerWidth - largura - 8)) + 'px';
    el.classList.add('on');
    const alto = el.offsetHeight;
    const baixo = fimVis - r.bottom - 12;
    const cima = r.top - topoVis - 12;
    const praBaixo = baixo >= alto || baixo >= cima;
    const espaco = praBaixo ? baixo : cima;
    if (lista && alto > espaco) lista.style.maxHeight = Math.max(96, espaco - (alto - lista.offsetHeight)) + 'px';
    if (praBaixo) { el.style.top = r.bottom + 6 + 'px'; el.style.bottom = ''; }
    else { el.style.top = ''; el.style.bottom = (window.innerHeight - r.top + 6) + 'px'; }
  }

  function fechar() {
    M.aberta = false;
    document.getElementById('v2-men-pop')?.remove();
  }

  function escolher(p) {
    const inp = M.inp;
    if (!p || !inp) return;
    const fim = inp.selectionStart;
    const antes = inp.value.slice(0, M.ini) + '@' + p.nome + ' ';
    inp.value = antes + inp.value.slice(fim).replace(/^ /, '');
    inp.setSelectionRange(antes.length, antes.length);
    const lista = escolhidos.get(M.cliente) || [];
    if (!lista.some((m) => m.id === p.id)) lista.push({ id: p.id, nome: p.nome });
    escolhidos.set(M.cliente, lista);
    fechar();
    inp.focus();
  }

  ['resize', 'scroll'].forEach((ev) => window.visualViewport?.addEventListener(ev, posicionar));
  window.addEventListener('resize', posicionar);
  document.addEventListener('scroll', (e) => { if (M.aberta && e.target && e.target.contains && e.target.contains(M.inp)) posicionar(); }, true);

  // ---- salvar -------------------------------------------------------------------
  // meta para o insert (ou null) com quem ainda está marcado no texto
  function colher(clienteId, texto) {
    const lista = (escolhidos.get(clienteId) || []).filter((m) => texto.includes('@' + m.nome));
    if (!lista.length) return null;
    return { mencionados: lista.map((m) => m.id), mencionados_nomes: lista.map((m) => m.nome) };
  }
  function limpar(clienteId) { escolhidos.delete(clienteId); fechar(); }

  // ---- timeline -----------------------------------------------------------------
  // texto da atividade com os @Nome destacados (o próprio nome em laranja)
  function textoHTML(texto, meta) {
    let h = esc(texto);
    const ids = (meta && meta.mencionados) || [];
    const nomes = (meta && meta.mencionados_nomes) || [];
    const eu = state.currentUser && state.currentUser.id;
    nomes.forEach((nome, i) => {
      if (!nome) return;
      const alvo = esc('@' + nome);
      h = h.split(alvo).join(`<span class="v2-men${ids[i] && ids[i] === eu ? ' eu' : ''}">${alvo}</span>`);
    });
    return h;
  }
  function avisouHTML(meta) {
    const nomes = (meta && meta.mencionados_nomes) || [];
    if (!nomes.length) return '';
    return ` · <span class="v2-men-avisou"><i data-lucide="bell"></i>avisou ${esc(nomes.map((n) => String(n).split(' ')[0]).join(', '))}</span>`;
  }

  // aberto pelo sininho: rola até a anotação e pisca uma vez
  function marcarAlvo(atividadeId) { alvoPendente = atividadeId ? String(atividadeId) : null; }
  function posRender() {
    ligar();
    if (!alvoPendente) return;
    const el = document.getElementById('crm-ev-' + alvoPendente);
    if (!el) return; // timeline ainda carregando: tenta no próximo render
    alvoPendente = null;
    el.classList.add('v2-men-alvo');
    setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 60);
  }

  window.crmMencaoDicaHTML = composerDicaHTML;
  window.crmMencaoColher = colher;
  window.crmMencaoLimpar = limpar;
  window.crmMencaoTextoHTML = textoHTML;
  window.crmMencaoAvisouHTML = avisouHTML;
  window.crmMencaoMarcarAlvo = marcarAlvo;
  window.crmMencaoPosRender = posRender;
  window.crmMencaoFechar = fechar;
})();
