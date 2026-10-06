// ==========================================
// VISUAL NOVO (v2) — TELA DE LOGIN E CARREGAMENTO
// ------------------------------------------
// Só aparência. O formulário, o Turnstile, a passkey, o 2FA e o auth.js seguem
// iguais. Aqui só entram peças extras (logo, ícones nos campos, olho da senha)
// que nascem com a classe "hidden" do Tailwind: fora do v2 ficam invisíveis e
// o login antigo não muda. Os textos em CAIXA ALTA viram frase só no v2 e
// voltam ao original quando o v2 é desligado.
// Carrega LOGO DEPOIS do HTML do login/splash (index.html), e não no fim da
// fila de scripts: senão a tela aparece meio montada (sem ícones, texto
// encavalado) até os ~2 MB de JS terminarem. Por isso não depende do ui-v2.js
// para saber se o v2 está ligado — lê o data-ui direto (mesmo teste do uiV2.isActive).
// ==========================================

(function () {
  const scr = document.getElementById('login-screen');
  if (!scr) return;

  const svg = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const IC = {
    mail: svg('<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>'),
    lock: svg('<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>'),
    eye: svg('<path d="M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0"/><circle cx="12" cy="12" r="3"/>'),
    eyeOff: svg('<path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c4.8 0 8.5 3 9.94 6.65a1 1 0 0 1 0 .7 10.8 10.8 0 0 1-1.44 2.49"/><path d="M14.08 14.16a3 3 0 0 1-4.24-4.24"/><path d="M17.48 17.5A10.75 10.75 0 0 1 2.06 12.35a1 1 0 0 1 0-.7 10.8 10.8 0 0 1 4.46-5.15"/><path d="m2 2 20 20"/>'),
    file: svg('<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 13h4"/><path d="M10 17h4"/>'),
    users: svg('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'),
    sign: svg('<path d="m21 17-2.16-1.66a2 2 0 0 0-2.47.07L15 16.5a2 2 0 0 1-2.83-.3L12 16"/><path d="M3 21c3 0 7-1 7-8V5a2 2 0 0 0-4 0v8c0 7 4 8 7 8"/>'),
  };
  // mesma marca do menu lateral (ui-v2-shell.js); a cor do "Ágil" vem de --v2-logo-a
  const LOGO = '<span class="ui-v2-logo" aria-label="Ágil Solar"><svg viewBox="0 0 620 425" aria-hidden="true"><path fill="var(--v2-logo-a)" d="M162 0H345Q375 0 388 24L620 425H435Q405 425 392 402L310 258L336 213H285Z"/><path fill="#FAA519" d="M150 213H285L310 258L228 402Q215 425 186 425H0L107 238Q121 213 150 213Z"/></svg><span class="wm"><b><span style="color:var(--v2-logo-a)">Ágil</span><span style="color:#FAA519">Solar</span></b></span></span>';

  const add = (alvo, onde, html) => { if (alvo) alvo.insertAdjacentHTML(onde, html); };

  function montar() {
    if (scr.dataset.v2l) return;
    scr.dataset.v2l = '1';
    const aside = scr.querySelector('.login-brand');
    add(aside, 'afterbegin', `<div class="hidden v2l-logo">${LOGO}</div>`);
    if (aside) {
      const itens = aside.querySelectorAll('.grid > div');
      [IC.file, IC.users, IC.sign].forEach((ic, i) => add(itens[i], 'afterbegin', `<i class="hidden v2l-fi">${ic}</i>`));
    }
    add(scr.querySelector('.login-lado-form'), 'afterbegin', `<div class="hidden v2l-mlogo">${LOGO}</div>`);
    add(document.getElementById('login-email'), 'afterend', `<span class="hidden v2l-ic">${IC.mail}</span>`);
    const senha = document.getElementById('login-password');
    add(senha, 'afterend', `<span class="hidden v2l-ic">${IC.lock}</span><button type="button" class="hidden v2l-eye" aria-label="Mostrar senha" title="Mostrar senha">${IC.eye}</button>`);
    const eye = scr.querySelector('.v2l-eye');
    if (eye && senha) {
      eye.addEventListener('click', () => {
        const ver = senha.type === 'password';
        senha.type = ver ? 'text' : 'password';
        eye.innerHTML = ver ? IC.eyeOff : IC.eye;
        eye.setAttribute('aria-label', ver ? 'Esconder senha' : 'Mostrar senha');
        eye.title = eye.getAttribute('aria-label');
        senha.focus();
      });
    }
    add(document.getElementById('splash-content'), 'afterbegin', `<div class="hidden v2l-slogo">${LOGO}</div>`);
  }

  // ---------- textos: CAIXA ALTA → frase (só no v2, com volta) ----------
  const MAPA = {
    'ENTRAR NO SISTEMA': 'Entrar',
    'ENTRAR COM FACE ID / PASSKEY': 'Entrar com Face ID / passkey',
    'System Check': 'Carregando',
  };
  const MANTER = { ID: 'ID', '2FA': '2FA', PIN: 'PIN', FACE: 'Face' };
  const frase = (t) => t.toLocaleLowerCase('pt-BR')
    .replace(/[\p{L}\d]+/gu, (w) => MANTER[w.toLocaleUpperCase('pt-BR')] || w)
    .replace(/^(\s*)(\p{L})/u, (m, a, b) => a + b.toLocaleUpperCase('pt-BR'));
  const orig = new Map(); // nó de texto → texto original
  const alvos = () => [scr, document.getElementById('splash-content')].filter(Boolean);
  function ajustarTextos() {
    alvos().forEach((raiz) => {
      const w = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        const t = n.nodeValue.trim();
        if (!t || !/\p{L}{2}/u.test(t) || n.parentElement.closest('.ui-v2-logo, .cf-turnstile, script')) continue;
        const novo = MAPA[t] || (t === t.toLocaleUpperCase('pt-BR') ? frase(t) : null);
        if (!novo || novo === t) continue;
        if (!orig.has(n)) orig.set(n, n.nodeValue);
        n.nodeValue = n.nodeValue.replace(t, novo);
      }
    });
  }
  function restaurarTextos() {
    orig.forEach((v, n) => { if (n.isConnected) n.nodeValue = v; });
    orig.clear();
  }

  let obs = null;
  function aplicar() {
    const on = document.documentElement.getAttribute('data-ui') === 'v2';
    if (on) {
      montar();
      ajustarTextos();
      if (!obs) {
        let pend = false;
        obs = new MutationObserver(() => {
          if (pend) return;
          pend = true;
          queueMicrotask(() => { pend = false; ajustarTextos(); });
        });
        alvos().forEach((r) => obs.observe(r, { childList: true, subtree: true, characterData: true }));
      }
    } else {
      if (obs) { obs.disconnect(); obs = null; }
      restaurarTextos();
      const senha = document.getElementById('login-password');
      if (senha) senha.type = 'password';
    }
  }
  document.addEventListener('uiv2:change', aplicar);
  aplicar();
})();
