// ==========================================
// VISUAL NOVO (v2) — PAINEL ADMINISTRATIVO
// ------------------------------------------
// Só no beta. Troca a moldura do overlay admin (abas em linha) por um menu
// lateral em grupos + cabeçalho da seção. O conteúdo de cada seção continua
// saindo das mesmas funções de admin.js (renderAdminUsuarios etc.), no mesmo
// #admin-section-content, então salvar/editar/filtros seguem iguais.
// Kits e Equipamentos ficam num grupo "Catálogo" marcado como atalho: eles
// moram em Comercial › Produtos e o clique leva para lá (setAdminSection).
// ==========================================

(function () {
  if (!window.uiV2 || typeof renderAdminPanel !== 'function') return;

  const ic = (n, extra = '') => `<i data-lucide="${n}" ${extra}></i>`;
  const has = (fn) => typeof window[fn] === 'function';

  // [id, ícone, título, descrição, só admin]
  const GRUPOS = [
    ['Sistema', [
      ['usuarios', 'user-cog', 'Usuários', 'Acessos e perfis', true],
      ['vendedores', 'users', 'Vendedores', 'Comissão da equipe', false],
      ['comunicados', 'megaphone', 'Comunicados', 'Avisos para a equipe', true],
    ]],
    ['Propostas', [
      ['financiadoras', 'landmark', 'Financiadoras', 'Bancos e taxas na proposta', true],
      ['custos', 'circle-plus', 'Custos extras', 'Somados na proposta', true],
    ]],
  ];
  const CATALOGO = [['produtos', 'zap', 'Kits'], ['componentes', 'boxes', 'Equipamentos']];
  const RENDER = { usuarios: 'renderAdminUsuarios', vendedores: 'renderAdminVendedores', comunicados: 'renderAdminComunicados', financiadoras: 'renderAdminFinanciadoras', custos: 'renderAdminCustos' };

  // celular: o menu vira gaveta de baixo, aberta pelo botão com a seção atual
  window.uiV2Admin = {
    menu(on) { const c = document.getElementById('admin-overlay-content'); if (c) c.classList.toggle('menu', !!on); },
  };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.querySelector('#admin-overlay-content.menu')) { e.stopPropagation(); window.uiV2Admin.menu(false); } }, true);

  const _renderAdminPanel = renderAdminPanel;
  renderAdminPanel = function (container) {
    const noOverlay = container && container.id === 'admin-overlay-content' && state.adminOpen;
    if (!window.uiV2.isActive() || !noOverlay || !(state.isAdmin || state.isGestor)) return _renderAdminPanel.apply(this, arguments);

    const grupos = GRUPOS.map(([g, itens]) => [g, itens.filter((s) => !s[4] || state.isAdmin)]).filter(([, itens]) => itens.length);
    const todas = grupos.flatMap(([, itens]) => itens);
    if (!todas.some((s) => s[0] === state.adminSection)) state.adminSection = todas[0][0];
    const atual = todas.find((s) => s[0] === state.adminSection);

    container.className = 'v2a';
    container.innerHTML = `
      <button type="button" class="v2a-msel" onclick="uiV2Admin.menu(true)" aria-haspopup="true"><span class="i">${ic(atual[1])}</span><span class="tx"><b>${atual[2]}</b><small>${atual[3]}</small></span><span class="t">Trocar${ic('chevron-down')}</span></button>
      <div class="v2a-scrim" onclick="uiV2Admin.menu(false)"></div>
      <nav class="v2a-nav" aria-label="Seções do painel">
        <div class="grab"></div>
        ${grupos.map(([g, itens]) => `<div class="lbl">${g}</div>${itens.map((s) => `<button class="${s[0] === atual[0] ? 'on' : ''}" onclick="setAdminSection('${s[0]}')">${ic(s[1])}<span class="tx"><b>${s[2]}</b><small>${s[3]}</small></span></button>`).join('')}`).join('')}
        <div class="lbl">Catálogo · abre em Produtos</div>
        ${CATALOGO.map(([id, i, l]) => `<button class="ext" onclick="setAdminSection('${id}')" title="Abre em Comercial › Produtos">${ic(i)}<span class="tx"><b>${l}</b></span>${ic('arrow-up-right', 'class="go"')}</button>`).join('')}
      </nav>
      <section class="v2a-body">
        <header class="v2a-h"><span class="v2a-ic">${ic(atual[1])}</span><div><h2>${atual[2]}</h2><p>${atual[3]}</p></div></header>
        <div id="admin-section-content"></div>
      </section>`;

    ['admin-overlay-kitsbar', 'admin-bar'].forEach((id) => { const el = document.getElementById(id); if (el) el.classList.add('hidden'); });
    const fn = RENDER[atual[0]];
    if (has(fn)) window[fn](document.getElementById('admin-section-content'));
    if (window.lucide) window.lucide.createIcons();
  };

  // Textos em caixa normal (só botões, rótulos e etiquetas; dados ficam como gravados)
  const CAPS_UI = 'button, label, th, option[value], [class*="text-[8px]"], [class*="text-[9px]"], [class*="text-[10px]"], #admin-modal-title';
  const normalizar = (root) => window.uiV2Textos && window.uiV2Textos.normalizarTextos(root, 'label', CAPS_UI);
  const ov = document.getElementById('admin-overlay');
  if (ov) new MutationObserver(() => normalizar(ov)).observe(ov, { childList: true, subtree: true, characterData: true });
  let modalObs = null;
  new MutationObserver(() => {
    const m = document.getElementById('admin-modal-overlay');
    if (!m || modalObs) return;
    modalObs = new MutationObserver(() => normalizar(m));
    modalObs.observe(m, { attributes: true, attributeFilter: ['class'], childList: true, subtree: true, characterData: true });
    normalizar(m);
  }).observe(document.body, { childList: true });

  // Ligar/desligar o beta com o painel aberto: redesenha no formato certo.
  document.addEventListener('uiv2:change', () => {
    const c = document.getElementById('admin-overlay-content');
    if (state.adminOpen && c) renderAdminPanel(c);
  });
})();
