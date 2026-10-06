// ==========================================
// VISUAL NOVO (v2) — LISTA SUSPENSA PERSONALIZADA
// ------------------------------------------
// A lista nativa do <select> é desenhada pelo sistema e não aceita estilo.
// Aqui cada <select class="v2-select"> das telas novas ganha um botão + lista
// no estilo da plataforma (cartão no computador, gaveta no celular). O select
// original continua no DOM, escondido: a escolha é gravada nele e dispara o
// mesmo 'change', então os filtros de cada tela seguem iguais.
// ==========================================

(function () {
  if (!window.uiV2) return;

  const SVG = {
    chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>',
  };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const isMobile = () => window.matchMedia('(max-width: 760px)').matches;
  const ANO = /\b(20\d{2})\s*$/;

  // título da gaveta no celular, pelo texto da 1ª opção ("Todos os vendedores" → Vendedor)
  function tituloDe(sel) {
    if (sel.dataset.titulo) return sel.dataset.titulo;
    const t = norm(sel.options[0] ? sel.options[0].text : '') + ' ' + norm(sel.title);
    if (/vendedor/.test(t)) return 'Vendedor';
    if (/franquia|unidade|preco/.test(t)) return 'Franquia';
    if (/mes|meses|periodo|geral/.test(t)) return 'Período';
    if (/categoria/.test(t)) return 'Categoria';
    if (/cidade/.test(t)) return 'Cidade';
    if (/ativo|inativo|status/.test(t)) return 'Situação';
    if (/ordenar|recente|maior|menor/.test(t)) return 'Ordenar por';
    return 'Escolha uma opção';
  }

  // ---------- botão no lugar do select ----------
  function rotulo(sel) { const o = sel.options[sel.selectedIndex]; return o ? o.text : ''; }
  function sincronizar(sel) {
    const b = sel.nextElementSibling;
    if (!b || b._sel !== sel) return;
    const texto = rotulo(sel);
    if (b.querySelector('span').textContent !== texto) b.querySelector('span').textContent = texto;
    if (b.disabled !== sel.disabled) b.disabled = sel.disabled;
    b.classList.toggle('on', sel.classList.contains('on'));
    const label = sel.getAttribute('aria-label') || sel.dataset.titulo;
    if (label) b.setAttribute('aria-label', label);
    if (P.btn === b) {
      if (sel.disabled) fechar();
      else desenharLista(P.el.querySelector('input')?.value || '');
    }
  }
  function enhance(sel) {
    if (sel.dataset.v2dd) return;
    sel.dataset.v2dd = '1';
    sel.classList.add('v2-dd-src');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'v2-dd' + (sel.classList.contains('on') ? ' on' : '');
    b.setAttribute('aria-haspopup', 'listbox');
    b.setAttribute('aria-expanded', 'false');
    if (sel.title) b.title = sel.title;
    b.innerHTML = `<span>${esc(rotulo(sel))}</span>${SVG.chev}`;
    b._sel = sel;
    b.addEventListener('click', (e) => { e.stopPropagation(); P.btn === b ? fechar() : abrir(b); });
    b.addEventListener('keydown', (e) => { if (P.btn !== b && ['ArrowDown', 'ArrowUp'].includes(e.key)) { e.preventDefault(); abrir(b); } });
    sel.insertAdjacentElement('afterend', b);
    sel.addEventListener('change', () => sincronizar(sel));
    sincronizar(sel);
  }
  function scan(root) {
    if (!window.uiV2.isActive() || !root) return;
    root.querySelectorAll('select.v2-select:not([data-v2dd])').forEach(enhance);
    root.querySelectorAll('select.v2-select[data-v2dd]').forEach(sincronizar);
  }

  // ---------- lista (cartão / gaveta) ----------
  const P = { btn: null, itens: [], idx: -1, el: null, scrim: null };
  function montarPop() {
    if (P.el) return;
    P.scrim = document.createElement('div');
    P.scrim.className = 'v2-ddscrim';
    P.scrim.addEventListener('click', fechar);
    P.el = document.createElement('div');
    P.el.className = 'v2-ddpop';
    P.el.setAttribute('role', 'listbox');
    P.el.addEventListener('click', (e) => {
      e.stopPropagation();
      const o = e.target.closest('.o[data-i]');
      if (o) escolher(+o.dataset.i);
    });
    P.el.addEventListener('mousemove', (e) => { const o = e.target.closest('.o[data-i]'); if (o) marcar(+o.dataset.i, false); });
    document.body.append(P.scrim, P.el);
  }
  function opcoes(sel) {
    return [...sel.options].map((o, i) => ({ i, v: o.value, t: o.text, dis: o.disabled, grupo: o.parentElement.tagName === 'OPTGROUP' ? o.parentElement.label : null }));
  }
  function desenharLista(q) {
    const sel = P.btn._sel;
    const todas = opcoes(sel);
    const f = q ? todas.filter((o) => norm(o.t).includes(norm(q))) : todas;
    // meses agrupados por ano quando a lista tem vários anos
    const anos = new Set(todas.map((o) => (o.t.match(ANO) || [])[1]).filter(Boolean));
    const porAno = !todas.some((o) => o.grupo) && anos.size > 1 && todas.length >= 6;
    let html = '', grupoAtual;
    f.forEach((o) => {
      const g = o.grupo || (porAno ? (o.t.match(ANO) || [])[1] || '' : null);
      if (g && g !== grupoAtual) html += `<div class="g">${esc(g)}</div>`;
      grupoAtual = g;
      const on = o.i === sel.selectedIndex;
      html += `<div class="o ${on ? 'sel' : ''} ${o.dis ? 'dis' : ''}" role="option" aria-selected="${on}" data-i="${o.i}"><span>${esc(o.t)}</span>${SVG.check}</div>`;
    });
    P.el.querySelector('.list').innerHTML = html || '<div class="vazio">Nada encontrado</div>';
    P.itens = f.filter((o) => !o.dis).map((o) => o.i);
    marcar(P.itens.includes(sel.selectedIndex) ? sel.selectedIndex : P.itens[0], true);
  }
  function marcar(i, rolar) {
    P.idx = i;
    P.el.querySelectorAll('.o').forEach((el) => el.classList.toggle('hl', +el.dataset.i === i));
    if (rolar) { const el = P.el.querySelector(`.o[data-i="${i}"]`); if (el) el.scrollIntoView({ block: 'nearest' }); }
  }
  function posicionar() {
    if (!P.btn || P.el.classList.contains('sheet')) return;
    const r = P.btn.getBoundingClientRect();
    const w = Math.max(r.width, 220);
    const alto = Math.min(P.el.scrollHeight, 340);
    const cabeBaixo = window.innerHeight - r.bottom - 12 >= alto || r.top < alto + 12;
    P.el.style.minWidth = w + 'px';
    P.el.style.left = Math.min(Math.max(8, r.left), window.innerWidth - Math.max(w, P.el.offsetWidth) - 8) + 'px';
    P.el.style.top = (cabeBaixo ? r.bottom + 6 : r.top - alto - 6) + 'px';
  }
  function abrir(btn) {
    if (btn.disabled || btn._sel.disabled) return;
    montarPop();
    if (P.btn) fechar();
    P.btn = btn;
    const sel = btn._sel;
    const busca = sel.options.length > 8;
    const sheet = isMobile();
    P.el.className = 'v2-ddpop on' + (sheet ? ' sheet' : '');
    P.el.innerHTML = `${sheet ? `<div class="grab"></div><h5>${esc(tituloDe(sel))}</h5>` : ''}${busca ? `<label class="s">${SVG.search}<input type="text" placeholder="Buscar" autocomplete="off"></label>` : ''}<div class="list"></div>`;
    desenharLista('');
    btn.classList.add('open');
    btn.setAttribute('aria-expanded', 'true');
    P.scrim.classList.toggle('on', sheet);
    posicionar();
    const inp = P.el.querySelector('input');
    if (inp) {
      inp.addEventListener('input', () => desenharLista(inp.value));
      inp.addEventListener('keydown', teclas);
      if (!sheet) setTimeout(() => inp.focus(), 0);
    }
  }
  function fechar() {
    if (!P.el) return;
    P.el.classList.remove('on');
    P.scrim.classList.remove('on');
    if (P.btn) { P.btn.classList.remove('open'); P.btn.setAttribute('aria-expanded', 'false'); }
    P.btn = null;
  }
  function escolher(i) {
    const btn = P.btn;
    if (!btn) return;
    const sel = btn._sel;
    if (sel.disabled) { fechar(); return; }
    const o = sel.options[i];
    if (!o || o.disabled) return;
    fechar();
    btn.focus({ preventScroll: true });
    if (sel.selectedIndex === i) return;
    sel.selectedIndex = i;
    btn.querySelector('span').textContent = o.text;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function teclas(e) {
    if (!P.btn) return;
    const pos = P.itens.indexOf(P.idx);
    if (e.key === 'ArrowDown') { e.preventDefault(); marcar(P.itens[Math.min(pos + 1, P.itens.length - 1)], true); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); marcar(P.itens[Math.max(pos - 1, 0)], true); }
    else if (e.key === 'Enter') { e.preventDefault(); if (P.idx != null && P.idx >= 0) escolher(P.idx); }
    else if (e.key === 'Escape' || e.key === 'Tab') { if (e.key === 'Escape') e.preventDefault(); const b = P.btn; fechar(); if (e.key === 'Escape') b.focus(); }
  }

  document.addEventListener('keydown', (e) => { if (P.btn && e.target.tagName !== 'INPUT') teclas(e); }, true);
  document.addEventListener('click', (e) => { if (P.btn && !e.target.closest('.v2-ddpop')) fechar(); });
  window.addEventListener('resize', () => { if (P.btn) fechar(); });
  window.addEventListener('scroll', () => { if (P.btn && !P.el.classList.contains('sheet')) posicionar(); }, true);
  document.addEventListener('uiv2:change', () => { fechar(); scan(document.getElementById('main-container')); });
  // a gaveta de filtros do celular (ui-v2-filtros.js) fica fora do #main-container
  window.uiV2Select = { scan, tituloDe };

  // as telas redesenham #main-container inteiro: aplica nos selects novos a cada desenho
  const main = document.getElementById('main-container');
  if (main) {
    let pend = false;
    new MutationObserver(() => {
      if (pend) return;
      pend = true;
      queueMicrotask(() => { pend = false; if (P.btn && !P.btn.isConnected) fechar(); scan(main); });
    }).observe(main, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] });
    scan(main);
  }
})();
