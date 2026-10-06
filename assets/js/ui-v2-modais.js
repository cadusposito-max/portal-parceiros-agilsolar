// ==========================================
// VISUAL NOVO (v2) — MODAL "NOVO CLIENTE"
// ------------------------------------------
// Só no beta. Ajusta textos/placeholder e troca o <select> de origem por
// pílulas (que só escrevem no mesmo select). Campos, validação, checagem de
// telefone duplicado e o submit de clientes.js continuam os mesmos.
// No visual antigo tudo volta como estava.
// ==========================================

(function () {
  if (!window.uiV2 || typeof openClientModal !== 'function') return;

  const $ = (s) => document.querySelector(s);
  const ic = (n) => `<i data-lucide="${n}"></i>`;
  const cap = (s) => { const t = String(s || '').toLocaleLowerCase('pt-BR'); return t.charAt(0).toLocaleUpperCase('pt-BR') + t.slice(1); };
  const ORIGEM_IC = { indicacao: 'handshake', whatsapp: 'message-circle', trafego: 'megaphone', porta: 'door-open', evento: 'tent', antigo: 'history', manual: 'ellipsis' };

  // textos originais, para restaurar no visual antigo
  const ORIG = {};
  const TXT = {
    '#client-nome': 'Maria Souza',
    '#client-telefone': '(67) 99999-9999',
    '#client-cidade': 'Digite e escolha na lista',
    '#client-email': 'cliente@email.com',
  };

  function decorate(on) {
    const box = $('#client-modal-overlay > div');
    if (!box) return;
    const h2 = box.querySelector('h2');
    const btn = $('#btn-save-client');
    const forProposal = $('#client-modal-overlay')?.dataset.proposalFlow === 'true';
    if (!('h2' in ORIG)) {
      ORIG.h2 = h2 ? h2.textContent : '';
      ORIG.btn = forProposal ? 'SALVAR CLIENTE' : (btn ? btn.textContent : '');
      Object.keys(TXT).forEach((sel) => { const el = $(sel); ORIG[sel] = el ? el.getAttribute('placeholder') : ''; });
    }
    box.querySelectorAll('.v2m-deco').forEach((el) => el.remove());
    if (!on) {
      if (h2) h2.textContent = forProposal ? 'Nova proposta' : ORIG.h2;
      if (btn) btn.textContent = forProposal ? 'Salvar e fazer orçamento →' : ORIG.btn;
      Object.keys(TXT).forEach((sel) => { const el = $(sel); if (el) el.setAttribute('placeholder', ORIG[sel]); });
      return;
    }
    if (h2) {
      h2.textContent = forProposal ? 'Nova proposta' : 'Novo cliente';
      h2.insertAdjacentHTML('beforebegin', `<span class="v2m-deco v2m-ic">${ic(forProposal ? 'file-plus-2' : 'user-plus')}</span>`);
      if (!forProposal) h2.insertAdjacentHTML('afterend', '<p class="v2m-deco v2m-sub">Só o essencial agora. O resto você completa na ficha.</p>');
    }
    if (btn) btn.innerHTML = forProposal
      ? `Salvar e fazer orçamento <span class="v2m-deco" style="display:inline-flex">${ic('arrow-right')}</span>`
      : `<span class="v2m-deco" style="display:inline-flex">${ic('check')}</span> Salvar cliente`;
    Object.keys(TXT).forEach((sel) => { const el = $(sel); if (el) el.setAttribute('placeholder', TXT[sel]); });

    // origem: pílulas que escrevem no select original
    const select = $('#client-origem');
    if (select && typeof CLIENT_ORIGENS !== 'undefined') {
      const wrap = document.createElement('div');
      wrap.className = 'v2m-deco v2m-origs';
      const paint = () => {
        wrap.innerHTML = CLIENT_ORIGENS.map((o) => `<button type="button" data-v="${o.v}" class="${select.value === o.v ? 'on' : ''}">${ic(ORIGEM_IC[o.v] || 'circle')}${o.v === 'whatsapp' ? 'WhatsApp' : cap(o.l)}</button>`).join('');
        if (window.lucide) window.lucide.createIcons();
      };
      wrap.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-v]'); if (!b) return;
        const vazio = typeof CLIENT_ORIGEM_VAZIA !== 'undefined' ? CLIENT_ORIGEM_VAZIA : 'nao_informado';
        select.value = select.value === b.dataset.v ? vazio : b.dataset.v;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        paint();
      });
      select.insertAdjacentElement('afterend', wrap);
      paint();
    }
    if (window.lucide) window.lucide.createIcons();
  }

  // ---------- Meu perfil (profile.js): textos em caixa normal ----------
  // O profile.js escreve rótulos em CAIXA ALTA ("SALVAR DADOS") e em Título
  // ("Nome de Exibição"). No v2 reescreve só o texto exibido, sem tocar em ids,
  // valores ou handlers. O cabeçalho (nome/e-mail do usuário) fica de fora.
  const KEEP = { KWP: 'kWp', WP: 'Wp', URL: 'URL', CSS: 'CSS', PDF: 'PDF', UC: 'UC', CPF: 'CPF', CNPJ: 'CNPJ', '2FA': '2FA', WHATSAPP: 'WhatsApp', PIN: 'PIN', ID: 'ID', QR: 'QR', JPG: 'JPG', PNG: 'PNG', MB: 'MB', '2MB': '2MB' };
  function frase(txt) {
    let first = /^[^\p{L}\p{N}]*\p{Lu}/u.test(txt); // "(não editável)" continua minúsculo
    return txt.replace(/[\p{L}\p{N}]+/gu, (w) => {
      const k = KEEP[w.toUpperCase()];
      const out = k || (first ? w.charAt(0).toLocaleUpperCase('pt-BR') + w.slice(1).toLocaleLowerCase('pt-BR') : w.toLocaleLowerCase('pt-BR'));
      first = false;
      return out;
    });
  }
  // rotulos: seletor dos elementos em Título que também viram frase.
  // <option>/<select> ficam de fora: o texto da opção pode ser o valor salvo.
  // capsEm (opcional): só converte CAIXA ALTA dentro desses elementos (ex.: botões
  // e etiquetas), para não mexer em dados gravados em maiúsculas.
  function normalizarTextos(root, rotulos, capsEm) {
    if (!window.uiV2.isActive() || !root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = n.nodeValue;
      if (!/\p{L}{2}/u.test(t)) continue;
      const el = n.parentElement;
      // opção sem value: o texto É o valor salvo, não mexe; com value, é só rótulo
      if (!el || el.closest('textarea') || (el.tagName === 'OPTION' && !el.hasAttribute('value'))) continue;
      const caps = t === t.toLocaleUpperCase('pt-BR') && (!capsEm || el.closest(capsEm));
      const rotulo = el.closest(rotulos);
      if (caps || rotulo) { const novo = frase(t); if (novo !== t) n.nodeValue = novo; }
    }
  }
  let perfilObs = null;
  new MutationObserver(() => {
    const modal = document.getElementById('profile-modal');
    if (!modal) { if (perfilObs) { perfilObs.disconnect(); perfilObs = null; } return; }
    if (perfilObs && perfilObs.target === modal) return;
    if (perfilObs) perfilObs.disconnect();
    const run = () => ['#profile-modal-tabs', '#profile-modal-body'].forEach((s) => normalizarTextos(modal.querySelector(s), 'label.block, p.font-black, #profile-modal-tabs'));
    perfilObs = new MutationObserver(run);
    perfilObs.target = modal;
    perfilObs.observe(modal, { childList: true, subtree: true });
    run();
  }).observe(document.body, { childList: true });

  // ---------- Meu perfil: movimento (entrada, pílula das abas, troca de conteúdo, saída) ----------
  // A entrada é CSS (o modal nasce a cada abertura). Aqui: a pílula que desliza, o conteúdo que
  // entra do lado da aba escolhida, a altura que acompanha e a saída antes de remover.
  const semMovimento = () => !window.uiV2.isActive() || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const ABAS_PERFIL = ['dados', 'senha', '2fa', 'passkey'];
  let pindAntes = null; // posição da pílula antes de redesenhar as abas

  function pilulaPerfil(animar) {
    const tabs = document.getElementById('profile-modal-tabs');
    if (!tabs || !window.uiV2.isActive()) return;
    const on = tabs.querySelector('button.bg-orange-600');
    if (!on) return;
    let ind = tabs.querySelector(':scope > .v2-pind');
    if (!ind) { ind = document.createElement('span'); ind.className = 'v2-pind'; tabs.prepend(ind); }
    const de = animar && !semMovimento() ? pindAntes : null;
    ind.style.transition = 'none';
    if (de) { ind.style.left = de.left + 'px'; ind.style.width = de.width + 'px'; void ind.offsetWidth; ind.style.transition = ''; }
    ind.style.left = on.offsetLeft + 'px';
    ind.style.width = on.offsetWidth + 'px';
    if (!de) { void ind.offsetWidth; ind.style.transition = ''; }
    tabs.classList.add('has-pind');
  }

  if (typeof _renderProfileTabs === 'function') {
    const _tabs = _renderProfileTabs;
    _renderProfileTabs = function () {
      const r = _tabs.apply(this, arguments);
      pilulaPerfil(false);
      return r;
    };
  }

  if (typeof _setProfileTab === 'function') {
    const _set = _setProfileTab;
    _setProfileTab = function (tab) {
      const card = document.querySelector('#profile-modal > div');
      const ind = document.querySelector('#profile-modal-tabs > .v2-pind');
      if (!card || semMovimento() || tab === _profileTab) return _set.apply(this, arguments);
      const de = ABAS_PERFIL.indexOf(_profileTab), para = ABAS_PERFIL.indexOf(tab);
      pindAntes = ind ? { left: ind.offsetLeft, width: ind.offsetWidth } : null;
      const h0 = card.offsetHeight;
      const r = _set.apply(this, arguments);
      pilulaPerfil(true);
      pindAntes = null;
      const body = document.getElementById('profile-modal-body');
      if (body) {
        body.classList.remove('v2-pin-r', 'v2-pin-l');
        void body.offsetWidth;
        body.classList.add(para < de ? 'v2-pin-l' : 'v2-pin-r');
      }
      // altura: do tamanho antigo para o novo, depois volta a ser automática
      card.style.height = '';
      const h1 = card.offsetHeight;
      if (Math.abs(h1 - h0) > 2) {
        clearTimeout(card._v2h);
        card.style.height = h0 + 'px';
        void card.offsetHeight;
        card.classList.add('v2-hanim');
        card.style.height = h1 + 'px';
        card._v2h = setTimeout(() => { card.classList.remove('v2-hanim'); card.style.height = ''; }, 300);
      }
      return r;
    };
  }

  // remover a foto redesenha o modal inteiro: não repete a entrada
  if (typeof _renderProfileModal === 'function') {
    const _modal = _renderProfileModal;
    _renderProfileModal = function () {
      const antes = document.getElementById('profile-modal');
      const reabrindo = antes && !antes.classList.contains('v2-saindo');
      const r = _modal.apply(this, arguments);
      if (reabrindo) { const m = document.getElementById('profile-modal'); if (m) m.classList.add('v2-sem-entrada'); }
      return r;
    };
  }

  if (typeof closeProfileModal === 'function') {
    const _fechar = closeProfileModal;
    closeProfileModal = function () {
      const m = document.getElementById('profile-modal');
      if (!m || semMovimento()) return _fechar.apply(this, arguments);
      if (m.classList.contains('v2-saindo')) return undefined;
      m.classList.add('v2-saindo');
      setTimeout(() => m.remove(), 190); // se reabrir durante a saída, o modal novo substitui este
      return undefined;
    };
  }

  // modais fixos do index.html: kit/oferta e equipamento (título e botão mudam ao abrir)
  ['#modal-overlay', '#equip-modal-overlay'].forEach((sel) => {
    const ov = document.querySelector(sel);
    if (!ov) return;
    const run = () => normalizarTextos(ov, 'label, h2');
    new MutationObserver(run).observe(ov, { attributes: true, attributeFilter: ['class'], childList: true, subtree: true, characterData: true });
    run();
  });
  document.addEventListener('uiv2:change', () => ['#modal-overlay', '#equip-modal-overlay'].forEach((s) => normalizarTextos(document.querySelector(s), 'label, h2')));
  window.uiV2Textos = { normalizarTextos };

  // ---------- lista de cidades (cidades.js): nomes em caixa normal só na exibição ----------
  // O valor que vai para o campo continua "CAARAPÓ/MS" (é o formato gravado).
  const MINUSC = ['de', 'da', 'do', 'das', 'dos', 'e'];
  const cidadeFrase = (t) => t.toLocaleLowerCase('pt-BR').replace(/[\p{L}]+/gu, (w, i) => (i > 0 && MINUSC.includes(w) ? w : w.charAt(0).toLocaleUpperCase('pt-BR') + w.slice(1)));
  if (typeof attachCidadeAutocomplete === 'function') {
    const _attach = attachCidadeAutocomplete;
    attachCidadeAutocomplete = function (inputEl) {
      const out = _attach.apply(this, arguments);
      const dd = inputEl && inputEl.parentElement && [...inputEl.parentElement.querySelectorAll(':scope > .cidade-autocomplete-dropdown')].pop();
      if (dd && !dd._v2obs) {
        dd._v2obs = new MutationObserver(() => {
          if (!window.uiV2.isActive()) return;
          dd.querySelectorAll('.cidade-ac-item').forEach((b) => {
            const n = b.firstChild;
            if (n && n.nodeType === 3 && /\p{Lu}{2}/u.test(n.nodeValue)) n.nodeValue = cidadeFrase(n.nodeValue);
            const uf = b.querySelector('span');
            if (uf && uf.textContent.startsWith('/')) uf.textContent = uf.textContent.slice(1);
          });
        });
        dd._v2obs.observe(dd, { childList: true });
      }
      return out;
    };
  }

  const _open = openClientModal;
  openClientModal = function () {
    const out = _open.apply(this, arguments);
    try { decorate(window.uiV2.isActive()); } catch (err) { console.warn('[ui-v2] modal cliente', err); }
    return out;
  };
  document.addEventListener('uiv2:change', () => {
    const ov = $('#client-modal-overlay');
    if (ov && !ov.classList.contains('hidden')) decorate(window.uiV2.isActive());
    else if (!window.uiV2.isActive()) decorate(false);
  });
})();
