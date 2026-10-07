// ==========================================
// ROLAGEM DE LADO QUE NÃO VOLTA PRO COMEÇO
// ------------------------------------------
// A plataforma redesenha as telas com innerHTML a cada clique (abas, filtros,
// status...). Toda barra que rola de lado — abas da ficha, menus de abas,
// chips de filtro, funil, tabelas largas — nascia de novo com scrollLeft = 0 e
// o usuário tinha que arrastar de novo (no celular, quase tudo rola de lado).
//
// Regra geral, sem mexer em cada tela:
//  1. ao rolar de lado, guarda a posição do elemento por uma "assinatura"
//     (tag + classes fixas + id do ancestral mais próximo + posição entre os iguais);
//  2. quando o elemento é recriado (MutationObserver), devolve a posição;
//  3. se havia um item ativo visível e ele saiu da área, rola só o necessário.
// Só posição horizontal; a vertical de cada tela continua como está.
// ==========================================
(function () {
  // classes de estado (mudam com o clique) não entram na assinatura
  const ESTADO = /^(on|active|ativo|is-[\w-]+|hidden|open|aberto|sel|selected|cur|done|compacto|v2f-cheia)$/;
  const MAX = 40;
  const salvos = new Map(); // assinatura -> { sel, anc, idx, x }
  function classesFixas(el) {
    return [...el.classList].filter((c) => !ESTADO.test(c) && !c.includes(':') && !c.includes('[') && !c.includes('/'));
  }
  function ancestralComId(el) {
    let p = el.parentElement;
    while (p && !p.id) p = p.parentElement;
    return p;
  }
  function seletor(el) {
    const cls = classesFixas(el);
    if (el.id) return '#' + CSS.escape(el.id);
    return el.tagName.toLowerCase() + cls.map((c) => '.' + CSS.escape(c)).join('');
  }
  function assinatura(el) {
    const sel = seletor(el);
    const anc = ancestralComId(el);
    const base = anc || document;
    let idx = 0;
    if (!el.id) idx = [...base.querySelectorAll(sel)].indexOf(el);
    return { key: (anc ? anc.id : '') + '|' + sel + '|' + idx, sel, anc: anc ? anc.id : '', idx };
  }
  const rolaDeLado = (el) => el.scrollWidth > el.clientWidth + 1;

  // 1. guarda (scroll não borbulha: escuta na captura)
  document.addEventListener('scroll', (ev) => {
    const el = ev.target;
    if (!(el instanceof Element) || !rolaDeLado(el)) return;
    // só elementos "anônimos" demais não dá pra reconhecer de volta
    if (!el.id && !classesFixas(el).length) return;
    const a = assinatura(el);
    if (a.idx < 0) return;
    el.dataset.sxOk = '1'; // elemento vivo: não precisa devolver nada a ele
    salvos.delete(a.key); // reinsere no fim = mais recente
    if (el.scrollLeft > 0) salvos.set(a.key, { sel: a.sel, anc: a.anc, idx: a.idx, x: el.scrollLeft });
    while (salvos.size > MAX) salvos.delete(salvos.keys().next().value);
  }, { capture: true, passive: true });

  // 3. item ativo dentro da faixa visível (ex.: aba aberta por atalho)
  function mostrarAtivo(el) {
    const on = el.querySelector(':scope > .on, :scope > .active, :scope > .is-active, :scope > [aria-selected="true"], :scope > [aria-current="page"]');
    if (!on) return;
    const r = on.getBoundingClientRect(), t = el.getBoundingClientRect();
    if (!r.width || !t.width) return;
    if (r.left < t.left) el.scrollLeft -= t.left - r.left + 16;
    else if (r.right > t.right) el.scrollLeft += r.right - t.right + 16;
  }

  // 2. devolve quando o elemento é recriado
  function restaurar() {
    salvos.forEach((s) => {
      const base = s.anc ? document.getElementById(s.anc) : document;
      if (!base) return;
      const el = s.sel.startsWith('#') ? document.querySelector(s.sel) : base.querySelectorAll(s.sel)[s.idx];
      // sxOk = já devolvido ou já rolado pelo usuário; só um elemento recriado vem sem a marca
      if (!el || el.dataset.sxOk === '1' || !rolaDeLado(el)) return;
      el.dataset.sxOk = '1';
      if (el.scrollLeft !== 0) return; // a própria tela já posicionou
      el.scrollLeft = s.x;
      mostrarAtivo(el);
    });
  }
  // o observer já roda depois que o render terminou (microtarefa) e antes de pintar,
  // com todas as mudanças do render juntas: não precisa de rAF (que nem roda em aba oculta)
  const obs = new MutationObserver(() => { if (salvos.size) restaurar(); });
  function ligar() { obs.observe(document.body, { childList: true, subtree: true }); }
  if (document.body) ligar(); else document.addEventListener('DOMContentLoaded', ligar);
})();
