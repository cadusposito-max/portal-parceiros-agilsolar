// ==========================================
// VISUAL NOVO (v2) — CASCA: menu lateral, barra de cima, celular e busca (Ctrl K)
// ------------------------------------------
// Só existe com html[data-ui="v2"] (beta de admin, ver ui-v2.js). Não cria
// nenhuma regra de negócio: chama as funções que o portal já tem (setEnvironment,
// setTab, openAdmin, openProfileModal, handleLogout, openCrm360, ...) e só lê o
// estado já carregado. O header antigo continua no DOM, apenas escondido.
// ==========================================

(function () {
  if (!window.uiV2) return;

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => (typeof escapeHTML === 'function' ? escapeHTML(String(s ?? '')) : String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const ic = (name, extra = '') => `<i data-lucide="${name}" ${extra}></i>`;
  const has = (fn) => typeof window[fn] === 'function';
  const icons = () => { if (typeof queueAppLucideCreateIcons === 'function') queueAppLucideCreateIcons(); else if (window.lucide) window.lucide.createIcons(); };
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const isMobile = () => window.matchMedia('(max-width: 760px)').matches;

  // Rótulos das abas em caixa normal (config.js segue em CAIXA ALTA para o visual antigo).
  const KEEP_UPPER = ['O&M', 'OS', 'DRE', 'CRM', 'NF', 'PDF', 'UC', 'ART'];
  function sentence(label) {
    const s = String(label || '').trim();
    if (!s) return s;
    return s.split(/\s+/).map((w, i) => {
      if (KEEP_UPPER.includes(w.toUpperCase())) return w.toUpperCase();
      const lw = w.toLocaleLowerCase('pt-BR');
      return i === 0 ? lw.charAt(0).toLocaleUpperCase('pt-BR') + lw.slice(1) : lw;
    }).join(' ');
  }

  const ENVS = {
    comercial: { n: 'Comercial', i: 'trending-up', d: 'Propostas, clientes e vendas', cta: ['Nova proposta', 'openNovaPropostaPicker'] },
    om: { n: 'O&M', i: 'wrench', d: 'Manutenção e ordens de serviço', cta: ['Nova proposta O&M', 'omOpenCreateProposta'] },
    financeiro: { n: 'Financeiro', i: 'wallet', d: 'Recebíveis, pagamentos e margem', cta: null },
    vistoria: { n: 'Vistoria', i: 'clipboard-check', d: 'Agenda, checklists e laudos', cta: ['Nova vistoria', 'visNovaVistoria'] },
    engenharia: { n: 'Engenharia', i: 'ruler', d: 'Projetos e equipamentos', cta: null },
  };
  function envAllowed(k) {
    if (state.isTecnico) return k === 'om';
    if (k === 'comercial') return true;
    if (k === 'om') return !!state.canOM;
    if (k === 'financeiro') return !!state.canFin;
    if (k === 'vistoria') return !!state.canVis;
    if (k === 'engenharia') return !!state.canEng;
    return false;
  }
  const envKey = () => (ENVS[state.environment] ? state.environment : 'comercial');
  const env = () => ENVS[envKey()];
  const tabs = () => (has('getActiveTabsForEnvironment') ? getActiveTabsForEnvironment() : []) || [];
  const activeTab = () => (has('getActiveTabId') ? getActiveTabId() : state.activeTab);
  const ctaFor = (k) => { const c = ENVS[k] && ENVS[k].cta; return c && has(c[1]) ? c : null; };

  const LOGO = '<span class="ui-v2-logo" aria-label="Ágil Solar"><svg viewBox="0 0 620 425" aria-hidden="true"><path fill="#008FD4" d="M162 0H345Q375 0 388 24L620 425H435Q405 425 392 402L310 258L336 213H285Z"/><path fill="#FAA519" d="M150 213H285L310 258L228 402Q215 425 186 425H0L107 238Q121 213 150 213Z"/></svg><span class="wm"><b><span style="color:var(--v2-logo-a)">Ágil</span><span style="color:#FAA519">Solar</span></b></span></span>';

  function userInfo() {
    const nome = (state.profile && state.profile.nome) || (has('getFirstName') ? getFirstName() : '') || (state.currentUser && state.currentUser.email) || '';
    const email = (state.currentUser && state.currentUser.email) || '';
    const role = state.isAdmin ? 'Administrador' : state.isGestor ? 'Gestor' : state.isTecnico ? 'Técnico' : 'Vendedor';
    const raw = (state.profile && state.profile.avatar_url) || '';
    const url = raw && has('safeImageUrl') ? safeImageUrl(raw, '') : '';
    const inicial = (nome || email || '?').trim().charAt(0).toUpperCase();
    const avatar = url ? `<img src="${esc(url)}" alt="">` : esc(inicial);
    const unidade = state.franquiaNome || '';
    // versão curta para o botão do menu lateral (o menu que abre mostra completo)
    const roleCurto = state.isAdmin ? 'Admin' : role;
    const unidadeCurta = unidade.replace(/^\s*[áa]gil\s*solar\s*[-–·]?\s*/i, '') || unidade;
    return { nome, email, role, roleCurto, avatar, unidade, unidadeCurta };
  }

  // ---------- montagem ----------
  let mounted = false;
  let lastSig = ''; // assinatura da última pintura completa (ver paint)
  function mount() {
    const app = $('#app-content');
    const main = app && $('main', app);
    if (!app || !main) return false;
    if (!$('#v2-side')) app.insertAdjacentHTML('afterbegin', '<aside class="v2-side" id="v2-side" aria-label="Menu principal"></aside><div class="v2-mtop" id="v2-mtop"></div>');
    if (!$('#v2-top')) main.insertAdjacentHTML('afterbegin', '<div class="v2-top" id="v2-top"></div>');
    if (!$('#v2-mnav')) {
      document.body.insertAdjacentHTML('beforeend', `
        <nav class="v2-mnav" id="v2-mnav" aria-label="Navegação"></nav>
        <div class="v2-scrim" id="v2-scrim"></div>
        <div class="v2-sheet" id="v2-sheet-env"><div class="grab"></div><h6>Trocar de ambiente</h6><div data-v2-envlist></div></div>
        <div class="v2-sheet" id="v2-sheet-more"><div class="grab"></div><h6 id="v2-more-title">Menu</h6><div class="grid" id="v2-more-grid"></div></div>
        <div class="v2-sheet" id="v2-sheet-user"><div class="grab"></div><div data-v2-usermenu></div></div>
        <div class="v2-pal-scrim" id="v2-palscrim"></div>
        <div class="v2-pal" id="v2-pal" role="dialog" aria-label="Buscar">
          <div class="v2-pal-in">${ic('search')}<input id="v2-palq" placeholder="Buscar cliente, proposta ou tela..." autocomplete="off"><kbd class="v2-kbd">Esc</kbd><button class="v2-collapse x" data-v2="palclose" style="margin:0">${ic('x')}</button></div>
          <div class="v2-pal-scope" id="v2-palscope"></div>
          <div class="v2-pal-res" id="v2-palres"></div>
          <div class="v2-pal-foot"><span><kbd class="v2-kbd">↑</kbd><kbd class="v2-kbd">↓</kbd> navegar</span><span><kbd class="v2-kbd">Enter</kbd> abrir</span><span><kbd class="v2-kbd">Tab</kbd> filtrar</span><span><kbd class="v2-kbd">Esc</kbd> fechar</span></div>
        </div>`);
      $('#v2-palq').addEventListener('input', (e) => { P.q = e.target.value; P.idx = 0; paintPalette(); });
      $('#v2-palq').addEventListener('keydown', paletteKeys);
      $('#v2-palres').addEventListener('mousemove', (e) => { const r = e.target.closest('[data-ri]'); if (r && +r.dataset.ri !== P.idx) { $$('#v2-palres .v2-res').forEach((x) => x.classList.remove('on')); r.classList.add('on'); P.idx = +r.dataset.ri; } });
    }
    try { if (localStorage.getItem('ui_v2_rail') === '1') app.classList.add('v2-rail'); } catch (_) {}
    mounted = true;
    return true;
  }
  function unmount() {
    ['#v2-side', '#v2-mtop', '#v2-top', '#v2-mnav', '#v2-scrim', '#v2-sheet-env', '#v2-sheet-more', '#v2-sheet-user', '#v2-palscrim', '#v2-pal'].forEach((s) => { const el = $(s); if (el) el.remove(); });
    const app = $('#app-content'); if (app) app.classList.remove('v2-rail', 'v2-open');
    mounted = false;
    lastSig = '';
  }

  // ---------- pintura ----------
  function envListHTML() {
    return Object.entries(ENVS).filter(([k]) => envAllowed(k)).map(([k, v]) => `
      <button class="v2-envopt ${k === envKey() ? 'on' : ''}" data-v2="env" data-env="${k}">
        <span class="v2-envic">${ic(v.i)}</span><span class="tx"><b>${v.n}</b><small>${v.d}</small></span>${ic('check', 'class="ck"')}
      </button>`).join('');
  }
  function userMenuHTML() {
    const u = userInfo();
    const pref = has('getThemePreference') ? getThemePreference() : 'system';
    const canAdmin = has('userCanAccessAdminPanel') && userCanAccessAdminPanel();
    return `
      <div class="v2-phead"><span class="v2-av">${u.avatar}</span><div><b>${esc(u.nome)}</b><small>${esc(u.email)}</small><br><span class="v2-role">${u.role}${u.unidade ? ' · ' + esc(u.unidade) : ''}</span></div></div>
      <button class="v2-mi" data-v2="profile">${ic('user')}Meu perfil</button>
      <div class="v2-mi">${ic('palette')}Aparência<span class="v2-themesw r">
        <button class="${pref === 'light' ? 'on' : ''}" data-v2="theme" data-theme="light" title="Claro">${ic('sun')}</button>
        <button class="${pref === 'dark' ? 'on' : ''}" data-v2="theme" data-theme="dark" title="Escuro">${ic('moon')}</button>
        <button class="${pref === 'system' ? 'on' : ''}" data-v2="theme" data-theme="system" title="Igual ao sistema">${ic('monitor')}</button></span></div>
      ${canAdmin ? `<button class="v2-mi" data-v2="admin">${ic('settings')}Painel administrativo</button>` : ''}
      <div class="v2-sep"></div>
      <button class="v2-mi" data-v2="oldui">${ic('undo-2')}Voltar ao visual antigo</button>
      <div class="v2-sep"></div>
      <button class="v2-mi danger" data-v2="logout">${ic('log-out')}Sair da plataforma</button>`;
  }
  function scopeButton() {
    if (state.isAdmin && has('toggleAdminViewMode')) {
      return `<button class="v2-scope" data-v2="scope" title="${state.adminViewAll ? 'Ver só a sua unidade' : 'Voltar para a visão consolidada'}">${ic(state.adminViewAll ? 'layers' : 'building-2')}${state.adminViewAll ? 'Consolidado' : 'Minha unidade'}</button>`;
    }
    if (state.isGestor && has('toggleGestorViewMode')) {
      return `<button class="v2-scope" data-v2="scope" title="${state.gestorViewAll ? 'Ver só os seus clientes' : 'Ver toda a unidade'}">${ic(state.gestorViewAll ? 'users' : 'user')}${state.gestorViewAll ? 'Minha unidade' : 'Apenas meus'}</button>`;
    }
    return '';
  }

  function paint() {
    if (!mounted && !mount()) return;
    const E = env(), k = envKey(), u = userInfo(), cta = ctaFor(k), T = tabs(), cur = activeTab();
    const curTab = T.find((t) => t.id === cur) || T[0] || { label: E.n, icon: E.i };
    const chatOn = state.chat && state.chat.hasAccess === true;
    const unread = (state.chat && state.chat.unreadTotal) || 0;
    const canAdmin = has('userCanAccessAdminPanel') && userCanAccessAdminPanel();
    const multiEnv = Object.keys(ENVS).filter(envAllowed).length > 1;
    const meta = window.uiV2PageMeta;
    const metaOk = !!(meta && meta.key === k + ':' + cur);
    const title = metaOk ? meta.title : sentence(curTab.label);
    const sub = metaOk ? meta.sub || '' : '';

    // Troca de aba, título e contador do chat não mudam a estrutura: só
    // atualiza esses pontos, sem recriar menu e ícones (era ~40ms por vez).
    const sig = JSON.stringify([k, T.map((t) => [t.id, t.label, t.icon]), u.nome, u.email, u.role, u.avatar, u.unidade, cta && cta[0], chatOn, canAdmin, multiEnv,
      state.adminViewAll, state.gestorViewAll, has('getThemePreference') ? getThemePreference() : '']);
    if (sig === lastSig && $('#v2-side').firstChild) { paintLight(cur, title, sub, unread); return; }
    lastSig = sig;

    $('#v2-side').innerHTML = `
      <div class="v2-brand">${LOGO}<button class="v2-collapse" data-v2="rail" title="Recolher menu">${ic('chevrons-left')}</button></div>
      ${multiEnv ? `<div class="v2-rel"><button class="v2-envbtn" data-v2="open" data-target="v2-pop-env" title="Trocar de ambiente"><span class="v2-envic">${ic(E.i)}</span><span class="tx"><small>Ambiente</small><b>${E.n}</b></span>${ic('chevrons-up-down', 'class="chev"')}</button>
        <div class="v2-pop" id="v2-pop-env"><h6>Trocar de ambiente</h6>${envListHTML()}</div></div>` : ''}
      ${cta ? `<button class="v2-cta" data-v2="cta" title="${cta[0]}">${ic('plus')}<span>${cta[0]}</span></button>` : ''}
      <nav class="v2-nav has-ind"><span class="v2-navind" aria-hidden="true"></span><div class="lbl">Menu</div>${T.map((t) => `<button class="${t.id === cur ? 'on' : ''}" data-v2="tab" data-tab="${t.id}" title="${esc(sentence(t.label))}">${ic(t.icon || 'circle')}<span class="t">${esc(sentence(t.label))}</span></button>`).join('')}</nav>
      <div class="v2-foot v2-rel"><button class="v2-userbtn" data-v2="open" data-target="v2-pop-user" title="${esc(u.nome)}"><span class="v2-av">${u.avatar}</span><span class="tx"><b>${esc(u.nome)}</b><small title="${esc(u.role + (u.unidade ? ' · ' + u.unidade : ''))}">${u.roleCurto}${u.unidadeCurta ? ' · ' + esc(u.unidadeCurta) : ''}</small></span>${ic('chevrons-up-down', 'class="chev"')}</button>
        <div class="v2-pop" id="v2-pop-user">${userMenuHTML()}</div></div>`;

    $('#v2-mtop').innerHTML = `${LOGO}
      ${multiEnv ? `<button class="v2-envbtn" data-v2="sheet" data-target="v2-sheet-env"><span class="v2-envic">${ic(E.i)}</span><span class="tx"><small>Ambiente</small><b>${E.n}</b></span>${ic('chevron-down', 'class="chev"')}</button>` : '<span class="v2-grow"></span>'}
      <button class="v2-av" data-v2="sheet" data-target="v2-sheet-user">${u.avatar}</button>`;

    $('#v2-top').innerHTML = `
      <div><div class="v2-crumb">${ic(E.i)}${E.n}</div><h1>${esc(title)}</h1>${sub ? `<p class="v2-sub">${esc(sub)}</p>` : ''}</div>
      <div class="v2-grow"></div>
      <button class="v2-icb v2-msearch" data-v2="palette" title="Buscar">${ic('search')}</button>
      <button class="v2-search" data-v2="palette">${ic('search')}<span>Buscar cliente, proposta ou tela...</span><kbd class="v2-kbd">Ctrl K</kbd></button>
      ${scopeButton()}
      ${chatOn ? `<button class="v2-icb" data-v2="chat" title="Mensagens da equipe">${ic('message-circle')}${unread ? `<span class="cnt">${unread > 99 ? '99+' : unread}</span>` : ''}</button>` : ''}
      ${canAdmin ? `<button class="v2-icb v2-admin" data-v2="admin" title="Painel administrativo">${ic('settings')}</button>` : ''}`;

    // celular: início · 2 abas · + · mais
    const MOB = { comercial: ['clientes', 'propostas'], om: ['os', 'clientes'], financeiro: ['recebiveis', 'pagamentos'], vistoria: ['agenda', 'os'], engenharia: ['calculadora', 'projetos'] };
    const pref = (MOB[k] || []).map((id) => T.find((t) => t.id === id)).filter(Boolean);
    const home = T[0], picks = (pref.length === 2 ? pref : T.slice(1, 3)), inBar = [home, ...picks].filter(Boolean).map((t) => t.id);
    const mBtn = (t, label) => t ? `<button class="${t.id === cur ? 'on' : ''}" data-v2="tab" data-tab="${t.id}">${ic(t.icon || 'circle')}${esc(label || shortLabel(t.label))}</button>` : '';
    $('#v2-mnav').innerHTML = `${mBtn(home, 'Início')}${mBtn(picks[0])}
      ${cta ? `<button class="plus" data-v2="cta" title="${cta[0]}">${ic('plus')}</button>` : ''}
      ${mBtn(picks[1])}<button class="${inBar.includes(cur) ? '' : 'on'}" data-v2="sheet" data-target="v2-sheet-more">${ic('layout-grid')}Mais</button>`;
    $('#v2-more-title').textContent = 'Menu · ' + E.n;
    $('#v2-more-grid').innerHTML = T.map((t) => `<button class="${t.id === cur ? 'on' : ''}" data-v2="tab" data-tab="${t.id}">${ic(t.icon || 'circle')}${esc(sentence(t.label))}</button>`).join('')
      + (canAdmin ? `<button data-v2="admin">${ic('settings')}Admin</button>` : '');
    $$('[data-v2-envlist]').forEach((el) => { el.innerHTML = envListHTML(); });
    $$('[data-v2-usermenu]').forEach((el) => { el.innerHTML = userMenuHTML(); });
    icons();
    placeInd(false);
  }
  function paintLight(cur, title, sub, unread) {
    $$('[data-v2="tab"]').forEach((b) => b.classList.toggle('on', b.dataset.tab === cur));
    placeInd(true);
    const more = $('#v2-mnav [data-target="v2-sheet-more"]');
    if (more) more.classList.toggle('on', !$(`#v2-mnav [data-v2="tab"][data-tab="${CSS.escape(String(cur))}"]`));
    const h1 = $('#v2-top h1');
    if (h1 && h1.textContent !== title) h1.textContent = title;
    let p = $('#v2-top .v2-sub');
    if (sub && h1) { if (!p) { p = document.createElement('p'); p.className = 'v2-sub'; h1.after(p); } if (p.textContent !== sub) p.textContent = sub; } else if (p) p.remove();
    const chat = $('#v2-top [data-v2="chat"]');
    if (chat) {
      let c = chat.querySelector('.cnt');
      if (unread) { if (!c) { c = document.createElement('span'); c.className = 'cnt'; chat.appendChild(c); } c.textContent = unread > 99 ? '99+' : String(unread); } else if (c) c.remove();
    }
  }
  // destaque azul que desliza até a aba ativa (animação só na troca de aba)
  const reduzMovimento = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let navRO = null;
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => placeInd(false));
  function placeInd(anim) {
    const nav = $('#v2-side .v2-nav');
    const ind = nav && nav.querySelector('.v2-navind');
    if (!ind) return;
    const on = nav.querySelector('button.on');
    if (!on) { ind.style.opacity = '0'; return; }
    const semAnim = !anim || reduzMovimento();
    if (semAnim) ind.style.transition = 'none';
    ind.style.opacity = '1';
    ind.style.height = on.offsetHeight + 'px';
    ind.style.transform = 'translateY(' + on.offsetTop + 'px)';
    if (semAnim) { void ind.offsetWidth; ind.style.transition = ''; }
    // recalcula se o menu OU algum botão mudar de tamanho (fonte que termina de
    // carregar, menu recolhido, zoom) — senão o destaque fica com a medida antiga
    if (!navRO && window.ResizeObserver) { navRO = new ResizeObserver(() => requestAnimationFrame(() => placeInd(false))); }
    if (navRO && nav !== navRO._alvo) {
      navRO.disconnect();
      navRO.observe(nav);
      nav.querySelectorAll(':scope > button').forEach((b) => navRO.observe(b, { box: 'border-box' }));
      navRO._alvo = nav;
    }
  }
  function shortLabel(label) { const s = sentence(label); return s.length > 10 ? s.split(' ')[0] : s; }

  // ---------- popovers / gavetas ----------
  function closeAll() {
    $$('.v2-pop.on, .v2-sheet.on').forEach((p) => p.classList.remove('on'));
    const s = $('#v2-scrim'); if (s) s.classList.remove('on');
    $$('.v2-envbtn.open, .v2-userbtn.open').forEach((b) => b.classList.remove('open'));
  }
  function toggleOpen(btn, id) {
    const p = document.getElementById(id); if (!p) return;
    const was = p.classList.contains('on'); closeAll();
    if (!was) { p.classList.add('on'); btn.classList.add('open'); }
  }
  function openSheet(id) { closeAll(); const p = document.getElementById(id); if (!p) return; p.classList.add('on'); $('#v2-scrim').classList.add('on'); }

  // ---------- busca global ----------
  const P = { q: '', idx: 0, scope: 'all', flat: [] };
  const SCOPES = [['all', 'Tudo', 'search'], ['cli', 'Clientes', 'users'], ['prop', 'Propostas', 'file-signature'], ['nav', 'Telas e ações', 'layout-grid']];
  const GNAME = { cli: 'Clientes', prop: 'Propostas', nav: 'Telas e ações' };
  function buildIndex() {
    const items = [];
    (state.clientes || []).forEach((c) => {
      if (!c || !c.nome) return;
      items.push({ g: 'cli', t: c.nome, s: [c.cidade, sentence(c.status || ''), c.telefone].filter(Boolean).join(' · '), k: String(c.telefone || '').replace(/\D/g, '') + ' ' + (c.email || ''), cli: c, run: () => has('openCrm360') && openCrm360(c.id) });
    });
    (state.propostas || []).forEach((p) => {
      if (!p) return;
      const preco = has('propostaPreco') ? propostaPreco(p) : null;
      const valor = preco ? ' · ' + Number(preco).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }) : '';
      items.push({ g: 'prop', t: `${p.numero ? '#' + p.numero + ' · ' : ''}${p.cliente_nome || 'Proposta'}`, s: `${p.kit_nome || ''}${valor}${p.status ? ' · ' + sentence(p.status) : ''}`, k: 'proposta', i: 'file-signature', run: () => { if (p.cliente_id && has('openCrm360')) openCrm360(p.cliente_id, 'propostas'); else if (has('setTab')) { setEnvironmentIf('comercial'); setTab('propostas'); } } });
    });
    Object.entries(ENVS).filter(([k]) => envAllowed(k)).forEach(([k, v]) => {
      const list = withEnv(k, () => tabs());
      list.forEach((t) => items.push({ g: 'nav', t: sentence(t.label), s: `Ir para ${v.n} › ${sentence(t.label)}`, k: v.n + ' tela aba', i: t.icon || 'circle', run: () => { setEnvironmentIf(k); setTab(t.id); } }));
    });
    const acts = [];
    const cta = ctaFor('comercial');
    if (cta && envAllowed('comercial')) acts.push(['Nova proposta', 'Escolher cliente e montar proposta', 'file-plus-2', () => { setEnvironmentIf('comercial'); window[cta[1]](); }]);
    if (has('openClientModal') && envAllowed('comercial')) acts.push(['Novo cliente', 'Cadastrar cliente no funil', 'user-plus', () => openClientModal()]);
    if (has('openProfileModal')) acts.push(['Meu perfil', 'Nome, foto, senha e segurança', 'user', () => openProfileModal()]);
    if (has('setThemePreference')) acts.push([document.documentElement.getAttribute('data-theme') === 'dark' ? 'Tema claro' : 'Tema escuro', 'Trocar a aparência', 'sun-moon', () => setThemePreference(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark')]);
    if (has('userCanAccessAdminPanel') && userCanAccessAdminPanel()) acts.push(['Painel administrativo', 'Usuários, kits, financiadoras', 'settings', () => openAdmin()]);
    acts.push(['Voltar ao visual antigo', 'Usa o visual anterior neste navegador', 'undo-2', () => window.uiV2.toggle()]);
    acts.forEach((a) => items.push({ g: 'nav', t: a[0], s: a[1], k: 'acao atalho', i: a[2], run: a[3], action: 1 }));
    return items;
  }
  // lê as abas de outro ambiente sem trocar de tela
  function withEnv(k, fn) { const prev = state.environment; state.environment = k; try { return fn(); } finally { state.environment = prev; } }
  function setEnvironmentIf(k) { if (state.environment !== k && has('setEnvironment')) setEnvironment(k); }
  function hl(text, q) {
    const tok = norm(q).split(/\s+/).filter(Boolean)[0]; const safe = esc(text);
    if (!tok) return safe;
    const i = norm(text).indexOf(tok); if (i < 0) return safe;
    return esc(text.slice(0, i)) + '<mark>' + esc(text.slice(i, i + tok.length)) + '</mark>' + esc(text.slice(i + tok.length));
  }
  function paintPalette() {
    const all = buildIndex(), toks = norm(P.q.trim()).split(/\s+/).filter(Boolean);
    const counts = {}; let groups = {};
    if (!toks.length) {
      groups = { nav: all.filter((x) => x.action) };
    } else {
      all.forEach((x) => {
        const hay = norm(x.t + ' ' + x.s + ' ' + (x.k || ''));
        if (!toks.every((t) => hay.includes(t))) return;
        const tn = norm(x.t); x.score = tn.startsWith(toks[0]) ? 3 : tn.split(/\s+/).some((w) => w.startsWith(toks[0])) ? 2 : 1;
        counts[x.g] = (counts[x.g] || 0) + 1;
        if (P.scope === 'all' || P.scope === x.g) (groups[x.g] = groups[x.g] || []).push(x);
      });
      Object.keys(groups).forEach((g) => { groups[g].sort((a, b) => b.score - a.score); groups[g] = groups[g].slice(0, P.scope === 'all' ? 6 : 40); });
    }
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    $('#v2-palscope').innerHTML = SCOPES.map((s) => `<button class="${P.scope === s[0] ? 'on' : ''}" data-v2="scope-pal" data-scope="${s[0]}">${ic(s[2])}${s[1]}${toks.length ? `<em>${s[0] === 'all' ? total : counts[s[0]] || 0}</em>` : ''}</button>`).join('');
    P.flat = []; let html = '';
    ['cli', 'prop', 'nav'].forEach((g) => {
      const list = groups[g]; if (!list || !list.length) return;
      html += `<h6>${!toks.length ? 'Atalhos' : GNAME[g]}</h6>`;
      list.forEach((x) => {
        const i = P.flat.push(x) - 1;
        const pj = x.cli && window.uiV2TipoCliente && window.uiV2TipoCliente(x.cli) === 'PJ';
        const icon = x.cli ? `<span class="ri p ${pj ? 'pj' : ''}">${ic(pj ? 'building-2' : 'user')}</span>` : `<span class="ri">${ic(x.i)}</span>`;
        html += `<div class="v2-res ${i === P.idx ? 'on' : ''}" data-v2="res" data-ri="${i}">${icon}<div class="tx"><b>${hl(x.t, P.q)}</b><small>${hl(x.s, P.q)}</small></div><span class="go">${x.g === 'nav' ? 'Ir' : 'Abrir'}${ic('corner-down-left')}</span></div>`;
      });
    });
    $('#v2-palres').innerHTML = html || `<div class="v2-pal-empty"><b>Nada encontrado para “${esc(P.q)}”</b>Tente pelo telefone, cidade ou número da proposta.</div>`;
    icons();
    const on = $('#v2-palres .v2-res.on'); if (on) on.scrollIntoView({ block: 'nearest' });
  }
  function openPalette() {
    if (!mounted) return;
    closeAll(); P.q = ''; P.idx = 0; P.scope = 'all';
    $('#v2-palq').value = ''; $('#v2-pal').classList.add('on'); $('#v2-palscrim').classList.add('on');
    paintPalette(); setTimeout(() => $('#v2-palq').focus(), 30);
  }
  function closePalette() { const p = $('#v2-pal'); if (p) p.classList.remove('on'); const s = $('#v2-palscrim'); if (s) s.classList.remove('on'); }
  const palOpen = () => !!($('#v2-pal') && $('#v2-pal').classList.contains('on'));
  function runResult(i) { const x = P.flat[i]; if (!x) return; closePalette(); try { x.run(); } catch (err) { console.warn('[ui-v2] busca', err); } }
  function paletteKeys(e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const n = Math.max(P.flat.length, 1); P.idx = (P.idx + (e.key === 'ArrowDown' ? 1 : -1) + n) % n; paintPalette(); }
    else if (e.key === 'Enter') { e.preventDefault(); runResult(P.idx); }
    else if (e.key === 'Tab') { e.preventDefault(); const i = SCOPES.findIndex((s) => s[0] === P.scope); P.scope = SCOPES[(i + (e.shiftKey ? -1 : 1) + SCOPES.length) % SCOPES.length][0]; P.idx = 0; paintPalette(); }
  }

  // ---------- cliques ----------
  document.addEventListener('click', (e) => {
    if (!window.uiV2.isActive() || !mounted) return;
    const t = e.target.closest('[data-v2]');
    if (!t) {
      if (!e.target.closest('.v2-pop, .v2-sheet')) closeAll();
      if (e.target.id === 'v2-scrim') closeAll();
      if (e.target.id === 'v2-palscrim') closePalette();
      return;
    }
    const a = t.dataset.v2;
    if (a === 'theme') { e.stopPropagation(); setThemePreference(t.dataset.theme); paint(); return; }
    closeAll();
    switch (a) {
      case 'open': toggleOpen(t, t.dataset.target); break;
      case 'sheet': openSheet(t.dataset.target); break;
      case 'env': if (has('setEnvironment')) setEnvironment(t.dataset.env); break;
      case 'tab': if (has('setTab')) setTab(t.dataset.tab); window.scrollTo({ top: 0, behavior: 'smooth' }); break;
      case 'cta': { const c = ctaFor(envKey()); if (c) window[c[1]](); break; }
      case 'rail': { const app = $('#app-content'); app.classList.toggle('v2-rail'); try { localStorage.setItem('ui_v2_rail', app.classList.contains('v2-rail') ? '1' : '0'); } catch (_) {} break; }
      case 'profile': if (has('openProfileModal')) openProfileModal(); break;
      case 'admin': if (has('openAdmin')) openAdmin(); break;
      case 'scope': if (state.isAdmin && has('toggleAdminViewMode')) toggleAdminViewMode(); else if (has('toggleGestorViewMode')) toggleGestorViewMode(); break;
      case 'chat': if (has('_chatToggleShell')) _chatToggleShell(); break;
      case 'oldui': window.uiV2.toggle(); break;
      case 'logout': if (has('handleLogout')) handleLogout(); break;
      case 'palette': openPalette(); break;
      case 'palclose': closePalette(); break;
      case 'scope-pal': P.scope = t.dataset.scope; P.idx = 0; paintPalette(); $('#v2-palq').focus(); break;
      case 'res': runResult(+t.dataset.ri); break;
      default: break;
    }
  });
  document.addEventListener('keydown', (e) => {
    if (!window.uiV2.isActive() || !mounted) return;
    const typing = /INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '') || (document.activeElement && document.activeElement.isContentEditable);
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); palOpen() ? closePalette() : openPalette(); return; }
    if (e.key === '/' && !typing && !palOpen()) { e.preventDefault(); openPalette(); return; }
    if (e.key === 'Escape' && (palOpen() || $('.v2-pop.on, .v2-sheet.on'))) { closePalette(); closeAll(); }
  });

  // ---------- ganchos ----------
  function refresh() {
    const active = window.uiV2.isActive() && state && state.currentUser;
    if (active) paint(); else if (mounted || $('#v2-side')) unmount();
  }
  function wrap(name, after) {
    if (typeof window[name] !== 'function') return;
    const orig = window[name];
    window[name] = function () { const out = orig.apply(this, arguments); try { after(); } catch (err) { console.warn('[ui-v2] ' + name, err); } return out; };
  }
  // renderTabs roda em toda troca de ambiente/aba; renderHeaderUser após login e troca de perfil;
  // _chatUpdateFab quando muda o total de não lidas; toggles de escopo repintam o header.
  ['renderTabs', 'renderHeaderUser', '_chatUpdateFab', 'toggleAdminViewMode', 'toggleGestorViewMode'].forEach((n) => wrap(n, refresh));
  document.addEventListener('uiv2:change', refresh);
  window.addEventListener('resize', () => { if (!isMobile()) closeAll(); });

  window.uiV2Shell = { refresh, openPalette };
})();
