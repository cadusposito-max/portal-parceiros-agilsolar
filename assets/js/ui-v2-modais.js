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
    if (!('h2' in ORIG)) {
      ORIG.h2 = h2 ? h2.textContent : '';
      ORIG.btn = btn ? btn.textContent : '';
      Object.keys(TXT).forEach((sel) => { const el = $(sel); ORIG[sel] = el ? el.getAttribute('placeholder') : ''; });
    }
    box.querySelectorAll('.v2m-deco').forEach((el) => el.remove());
    if (!on) {
      if (h2) h2.textContent = ORIG.h2;
      if (btn) btn.textContent = ORIG.btn;
      Object.keys(TXT).forEach((sel) => { const el = $(sel); if (el) el.setAttribute('placeholder', ORIG[sel]); });
      return;
    }
    if (h2) {
      h2.textContent = 'Novo cliente';
      h2.insertAdjacentHTML('beforebegin', `<span class="v2m-deco v2m-ic">${ic('user-plus')}</span>`);
      h2.insertAdjacentHTML('afterend', '<p class="v2m-deco v2m-sub">Só o essencial agora. O resto você completa na ficha.</p>');
    }
    if (btn) btn.innerHTML = `<span class="v2m-deco" style="display:inline-flex">${ic('check')}</span> Salvar cliente`;
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
  const KEEP = { '2FA': '2FA', WHATSAPP: 'WhatsApp', PIN: 'PIN', ID: 'ID', QR: 'QR', JPG: 'JPG', PNG: 'PNG', MB: 'MB', '2MB': '2MB' };
  function frase(txt) {
    let first = /^[^\p{L}\p{N}]*\p{Lu}/u.test(txt); // "(não editável)" continua minúsculo
    return txt.replace(/[\p{L}\p{N}]+/gu, (w) => {
      const k = KEEP[w.toUpperCase()];
      const out = k || (first ? w.charAt(0).toLocaleUpperCase('pt-BR') + w.slice(1).toLocaleLowerCase('pt-BR') : w.toLocaleLowerCase('pt-BR'));
      first = false;
      return out;
    });
  }
  function normalizarPerfil(root) {
    if (!window.uiV2.isActive() || !root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = n.nodeValue;
      if (!/\p{L}{2}/u.test(t)) continue;
      const el = n.parentElement;
      const caps = t === t.toLocaleUpperCase('pt-BR');
      const rotulo = el && el.closest('label.block, p.font-black, #profile-modal-tabs');
      if (caps || rotulo) { const novo = frase(t); if (novo !== t) n.nodeValue = novo; }
    }
  }
  let perfilObs = null;
  new MutationObserver(() => {
    const modal = document.getElementById('profile-modal');
    if (!modal) { if (perfilObs) { perfilObs.disconnect(); perfilObs = null; } return; }
    if (perfilObs && perfilObs.target === modal) return;
    if (perfilObs) perfilObs.disconnect();
    const run = () => ['#profile-modal-tabs', '#profile-modal-body'].forEach((s) => normalizarPerfil(modal.querySelector(s)));
    perfilObs = new MutationObserver(run);
    perfilObs.target = modal;
    perfilObs.observe(modal, { childList: true, subtree: true });
    run();
  }).observe(document.body, { childList: true });

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
