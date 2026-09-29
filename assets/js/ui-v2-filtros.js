// ==========================================
// VISUAL NOVO (v2) — FILTROS NO CELULAR
// ------------------------------------------
// No celular (até 760px) os filtros das telas novas saem da tela e vão para
// uma gaveta de baixo: fica a busca com um botão de filtros ao lado, e os
// filtros ligados aparecem como etiquetas com "×".
//
// Os controles são MOVIDOS (não copiados) para a gaveta, então os onchange /
// onclick de cada tela continuam os mesmos. Cada tela redesenha tudo a cada
// filtro, e esta camada roda de novo depois de cada desenho
// (ui-v2-screens.js chama aplicar()). No computador nada muda.
//
// O que vai para a gaveta: todo select.v2-select da barra de filtros e o que
// a tela marcou com .v2-fx (segmentos, valor mín./máx., período). O botão
// .v2-fclear da tela vira o "Limpar" do topo da gaveta.
// ==========================================

(function () {
  if (!window.uiV2) return;

  const MQ = window.matchMedia('(max-width: 760px)');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const svg = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const IC = {
    filtro: svg('<path d="M20 7h-9"/><path d="M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/>'),
    x: svg('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'),
  };

  let aberto = false;
  let sheet = null;
  let scrim = null;

  function montar() {
    if (sheet) return;
    scrim = document.createElement('div');
    scrim.className = 'v2-fscrim';
    scrim.addEventListener('click', () => fechar());
    sheet = document.createElement('div');
    sheet.className = 'v2s v2-fsheet';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-label', 'Filtros');
    document.body.append(scrim, sheet);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && aberto && !document.querySelector('.v2-ddpop.on')) fechar(); });
  }

  function abrir() {
    if (!sheet || !sheet.querySelector('.v2-ff')) return;
    aberto = true;
    sheet.classList.add('on');
    scrim.classList.add('on');
  }
  function fechar() {
    aberto = false;
    if (sheet) sheet.classList.remove('on');
    if (scrim) scrim.classList.remove('on');
  }
  function limpar() {
    fechar();
    if (sheet) sheet.innerHTML = '';
  }

  // ---------- o que conta como filtro ligado ----------
  const valorPadrao = (sel) => {
    const o = [...sel.options].find((x) => x.value === 'all' || x.value === '');
    return o ? o.value : null; // sem "todos": é escolha (ex.: unidade dos preços), não filtro
  };
  function ativos(itens) {
    const out = [];
    itens.forEach((el) => {
      if (el.tagName === 'SELECT') {
        const p = valorPadrao(el);
        if (p !== null && el.value !== p) {
          out.push({ txt: el.options[el.selectedIndex] ? el.options[el.selectedIndex].text : el.value, tirar: () => { el.value = p; el.dispatchEvent(new Event('change', { bubbles: true })); } });
        }
      } else if (el.classList.contains('v2-seg')) {
        const bs = [...el.querySelectorAll(':scope > button')];
        const on = bs.find((b) => b.classList.contains('on'));
        if (on && bs[0] && on !== bs[0]) out.push({ txt: on.textContent.trim(), tirar: () => bs[0].click() });
      } else if (el.tagName === 'LABEL') {
        const inp = el.querySelector('input');
        if (inp && inp.value) out.push({ txt: `${el.dataset.titulo || 'Valor'}: R$ ${Number(inp.value).toLocaleString('pt-BR')}`, tirar: () => { inp.value = ''; inp.dispatchEvent(new Event('change', { bubbles: true })); } });
      } else if (el.id === 'dash-period-picker-wrap') {
        const b = el.querySelector('.v2-pill.on');
        if (b) out.push({ txt: b.textContent.trim(), tirar: null });
      }
    });
    return out;
  }

  const titulo = (el) => el.dataset.titulo
    || (el.tagName === 'SELECT' && window.uiV2Select ? window.uiV2Select.tituloDe(el) : 'Filtro');

  // ---------- por tela ----------
  function aplicar(container) {
    if (!container || !window.uiV2.isActive()) return;
    if (!MQ.matches) { limpar(); return; }
    montar();

    const barras = [...container.querySelectorAll(':scope > .v2-toolbar, :scope > .v2-filters, :scope > .v2-admfilters')];
    const itens = [];
    barras.forEach((b) => b.querySelectorAll('select.v2-select, .v2-fx').forEach((el) => {
      if (!itens.some((x) => x.contains(el))) itens.push(el);
    }));
    const limparBtn = barras.map((b) => b.querySelector('.v2-fclear')).find(Boolean);
    if (!itens.length) { limpar(); return; }

    // onde fica o botão: ao lado da busca; sem busca, no começo da 1ª barra com filtro
    const busca = barras.map((b) => b.querySelector(':scope > .v2-sbox')).find(Boolean);
    const barraBtn = busca ? busca.parentElement : barras.find((b) => itens.some((i) => b.contains(i)));
    const lista = ativos(itens);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'v2-fbtn' + (busca ? '' : ' lbl') + (lista.length ? ' on' : '');
    btn.setAttribute('aria-label', 'Filtros');
    btn.innerHTML = `${IC.filtro}${busca ? '' : '<span>Filtros</span>'}${lista.length ? `<b>${lista.length}</b>` : ''}`;
    btn.addEventListener('click', abrir);
    if (busca) busca.insertAdjacentElement('afterend', btn); else barraBtn.prepend(btn);
    barraBtn.classList.add('v2-temfbtn');

    // etiquetas dos filtros ligados (o dashboard já tem a linha "Exibindo …")
    if (lista.length && !container.querySelector(':scope > .v2-ctx')) {
      const chips = document.createElement('div');
      chips.className = 'v2-fchips';
      lista.forEach((a) => {
        const c = document.createElement(a.tirar ? 'button' : 'span');
        c.className = 'v2-fchip';
        c.innerHTML = `<span>${esc(a.txt)}</span>${a.tirar ? IC.x : ''}`;
        if (a.tirar) { c.type = 'button'; c.title = 'Tirar este filtro'; c.addEventListener('click', a.tirar); }
        chips.append(c);
      });
      const depois = barraBtn.nextElementSibling && barraBtn.nextElementSibling.classList.contains('v2-pills') ? barraBtn.nextElementSibling : barraBtn;
      depois.insertAdjacentElement('afterend', chips);
    }

    // gaveta
    const total = container.dataset.v2total;
    const [um, varios] = String(container.dataset.v2nome || '').split('|');
    const txtVer = total != null && um ? `Ver ${Number(total).toLocaleString('pt-BR')} ${Number(total) === 1 ? um : varios}` : 'Ver resultados';
    sheet.innerHTML = `<div class="grab"></div><div class="hd"><h5>Filtros</h5>${limparBtn ? '<button type="button" class="lp">Limpar</button>' : ''}</div><div class="bd"></div><button type="button" class="go">${esc(txtVer)}</button>`;
    const bd = sheet.querySelector('.bd');
    itens.forEach((el) => {
      const f = document.createElement('div');
      f.className = 'v2-ff';
      f.innerHTML = `<label>${esc(titulo(el))}</label>`;
      const dd = el.tagName === 'SELECT' && el.nextElementSibling && el.nextElementSibling.classList.contains('v2-dd') ? el.nextElementSibling : null;
      f.append(el);
      if (dd) f.append(dd);
      bd.append(f);
    });
    // dois campos de valor lado a lado
    const valores = [...bd.querySelectorAll('.v2-ff')].filter((f) => f.querySelector('input.v2-money'));
    if (valores.length === 2) { const par = document.createElement('div'); par.className = 'v2-ffpar'; valores[0].before(par); par.append(...valores); }

    if (limparBtn) {
      limparBtn.classList.add('v2-fhide');
      sheet.querySelector('.lp').addEventListener('click', () => { fechar(); limparBtn.click(); });
    }
    sheet.querySelector('.go').addEventListener('click', fechar);
    if (window.uiV2Select) window.uiV2Select.scan(sheet);

    // a tela redesenhou por causa de um filtro: a gaveta continua aberta
    if (aberto) { sheet.classList.add('on', 'sem-anim'); scrim.classList.add('on'); requestAnimationFrame(() => sheet.classList.remove('sem-anim')); }
  }

  // telas que não passam por aplicar() (antigas) não podem herdar a gaveta
  function sync() {
    const main = document.getElementById('main-container');
    if (!main || !main.querySelector('.v2-fbtn')) limpar();
  }

  // girar o celular / redimensionar a janela: cada lado desenha a sua barra
  const mudou = () => { fechar(); if (window.uiV2.isActive() && typeof renderContent === 'function') renderContent(); };
  if (MQ.addEventListener) MQ.addEventListener('change', mudou); else if (MQ.addListener) MQ.addListener(mudou);
  document.addEventListener('uiv2:change', () => { if (!window.uiV2.isActive()) limpar(); });

  // linhas que rolam para o lado (status, períodos): some a borda do lado que ainda tem conteúdo
  function bordas(el) {
    const max = el.scrollWidth - el.clientWidth;
    el.classList.toggle('v2-fade-d', max > 2 && el.scrollLeft < max - 2);
    el.classList.toggle('v2-fade-e', max > 2 && el.scrollLeft > 2);
  }
  document.addEventListener('scroll', (e) => {
    const el = e.target;
    if (el && el.classList && (el.classList.contains('v2-pills') || el.classList.contains('v2-seg'))) bordas(el);
  }, true);
  const main = document.getElementById('main-container');
  if (main) {
    let pend = false;
    new MutationObserver(() => {
      if (pend) return;
      pend = true;
      requestAnimationFrame(() => { pend = false; if (MQ.matches) main.querySelectorAll('.v2-pills, .v2-toolbar > .v2-seg').forEach(bordas); });
    }).observe(main, { childList: true });
  }

  window.uiV2Filtros = { aplicar, sync, abrir, fechar };
})();
