// ==========================================
// TOUR GUIADO · PRIMEIRO ORÇAMENTO
// ==========================================
// Motor próprio (sem biblioteca): escurece a tela, deixa iluminado um recorte
// em volta do elemento do passo (clicável) e mostra o balão. Passo com
// `esperar` só avança quando o vendedor faz a ação de verdade; passo sem
// `esperar` tem botão Próximo. Se o elemento sumir (ex.: fechou o popup),
// volta pro passo `senaoVolta`.
//
// Quem vê sozinho: só usuário criado a partir de TOUR_NOVOS_DESDE, uma única
// vez (marca no user_metadata ao abrir, mesmo que ele pule). Depois disso,
// só pelo "?" do topo no ambiente Comercial (tourOrcamentoIniciar).

const TOUR_NOVOS_DESDE = '2026-10-07T00:00:00-03:00';
const TOUR_META = 'tour_orcamento_visto_em';

const _tourVis = (sel) => [...document.querySelectorAll(sel)].find((el) => el.getClientRects().length) || null;
const _tourBloco = (sel) => document.querySelector(sel)?.closest('.space-y-1') || null;
const _tourDropCidade = () => _tourVis('#client-form .cidade-autocomplete-dropdown');
const _tourModalProposta = () => {
  const ov = document.getElementById('client-modal-overlay');
  return Boolean(ov && !ov.classList.contains('hidden') && ov.dataset.proposalFlow === 'true');
};
const _tourOrcamentoAberto = () => typeof orcamentoAberto === 'function' && orcamentoAberto();
const _tourPrimeiroNome = () => (typeof getFirstName === 'function' ? getFirstName() : '') || '';
const _tourCliente = () => {
  const id = typeof _orcamentoClientId !== 'undefined' ? _orcamentoClientId : null;
  const c = (state.clientes || []).find((x) => x.id === id);
  return String(c?.nome || 'cliente').trim().split(' ')[0];
};
const _tourNoOrcamento = { se: _tourOrcamentoAberto, para: 'orc' }; // escolheu "Já é cliente"

const TOUR_PASSOS = [
  {
    id: 'oi', centro: true, icone: 'sparkles',
    titulo: (rever) => rever ? 'Tour do orçamento' : `Bem-vindo${_tourPrimeiroNome() ? ', ' + escapeHTML(_tourPrimeiroNome()) : ''}!`,
    texto: (rever) => rever
      ? 'Vamos rever, passo a passo, como fazer um orçamento? Leva uns 2 minutos.'
      : 'Vamos fazer seu <b>primeiro orçamento</b> juntos? Leva uns 2 minutos e no fim você já tem uma proposta pronta pra mandar.<br><br>Tenha em mãos o nome, o WhatsApp e a conta de luz de um cliente.',
    botao: 'Começar', pular: 'Agora não',
  },
  {
    id: 'nova', alvo: () => _tourVis('#v2-side .v2-cta, #v2-mnav .plus'),
    titulo: () => 'Tudo começa aqui',
    texto: () => 'Toque em <b>Nova proposta</b>. Esse botão fica sempre aqui, em qualquer tela do Comercial.',
    esperar: _tourModalProposta,
  },
  {
    id: 'np-tabs', alvo: () => _tourVis('#client-modal-overlay .np-picker-tabs'), senaoVolta: 'nova', atalho: _tourNoOrcamento,
    titulo: () => 'Cliente novo ou já cadastrado?',
    texto: () => 'Se o cliente já estiver na plataforma, use <b>Já é cliente</b> e busque pelo nome. Se não, cadastre aqui mesmo, em <b>Cliente novo</b>.',
  },
  {
    id: 'np-contato', senaoVolta: 'nova', atalho: _tourNoOrcamento,
    alvo: () => [_tourBloco('#client-nome'), _tourBloco('#client-telefone')],
    titulo: () => 'Nome e WhatsApp',
    texto: () => 'O WhatsApp é importante: é por ele que a proposta chega no cliente, com a mensagem pronta.',
  },
  {
    id: 'np-cidade', senaoVolta: 'nova', atalho: _tourNoOrcamento,
    alvo: () => [_tourBloco('#client-cidade'), _tourDropCidade()],
    titulo: () => 'A cidade muda o resultado',
    texto: () => 'Digite e <b>escolha na lista</b>. A plataforma usa o sol da cidade pra calcular quanto o sistema vai gerar.',
  },
  {
    id: 'np-salvar', senaoVolta: 'nova', atalho: _tourNoOrcamento,
    alvo: () => [_tourVis('#client-form'), _tourDropCidade()], anel: () => _tourVis('#btn-save-client'),
    titulo: () => 'Salvar e seguir',
    texto: () => 'E-mail e origem são opcionais. Toque em <b>Salvar e fazer orçamento</b>: o cliente fica salvo e você vai direto pro orçamento dele.',
    esperar: _tourOrcamentoAberto,
  },
  {
    id: 'orc', alvo: () => _tourVis('.orcamento-header'), senaoVolta: 'nova',
    titulo: () => 'A tela do orçamento',
    texto: () => `Tudo aqui é do <b>${escapeHTML(_tourCliente())}</b>. Cidade, sol da região e WhatsApp ficam no topo pra você conferir.`,
  },
  {
    id: 'porta', alvo: () => _tourVis('#orcamento-builder-slot #pb-porta'), senaoVolta: 'nova',
    titulo: () => 'Dois jeitos de montar',
    texto: () => '<b>Escolher kit</b>: quando você já sabe qual kit quer.<br><b>Dimensionar sistema</b>: quando tem a conta de luz e quer que a plataforma sugira o kit.<br><br>Toque em <b>Dimensionar sistema</b>.',
    esperar: () => state.pbPorta === 'dim',
  },
  {
    id: 'consumo', senaoVolta: 'porta',
    alvo: () => [_tourVis('[data-pbd-grupo="modo"]'), _tourVis('#pbd-box-mes') || _tourVis('#pbd-box-media')],
    titulo: () => 'O consumo da conta de luz',
    texto: () => 'Copie os meses do histórico da conta. Só tem a média? Toque em <b>Só a média em kWh</b> e digite o número.',
    esperar: () => Boolean(_tourVis('#pbd-resultado .pbd-kit')),
  },
  {
    id: 'ligacao', alvo: () => _tourVis('[data-pbd-ligacao]')?.parentElement, senaoVolta: 'porta',
    titulo: () => 'Tipo de ligação',
    texto: () => 'Monofásico, bifásico ou trifásico (vem escrito na conta). Muda a taxa mínima que o cliente paga mesmo com solar: 30, 50 ou 100 kWh.',
  },
  {
    id: 'tipo', alvo: () => _tourVis('[data-pbd-tipo]')?.parentElement, senaoVolta: 'porta',
    titulo: () => 'Inversor ou microinversor',
    texto: () => 'Troque aqui pra ver os kits de cada tipo. A sugestão se ajusta na hora.',
  },
  {
    id: 'kit', alvo: () => _tourVis('#pbd-resultado .pbd-kit'), senaoVolta: 'porta',
    titulo: () => 'O kit recomendado',
    texto: () => 'É o kit <b>mais barato que cobre a média</b> de consumo do cliente. Logo abaixo aparecem outras opções parecidas.<br><br>Toque no kit para selecionar.',
    esperar: () => Boolean(document.querySelector('#orcamento-builder-slot .orcamento-kit-selecionado')),
  },
  {
    id: 'gerar', alvo: () => _tourVis('.orcamento-footer'), anel: () => _tourVis('#orcamento-gerar'), senaoVolta: 'porta',
    titulo: () => 'Confira e gere',
    texto: () => 'Aqui embaixo ficam o kit escolhido e o preço. Tudo certo? Toque em <b>Gerar proposta</b>.',
    esperar: () => Boolean(document.getElementById('pb-share-overlay')),
  },
  {
    id: 'enviar', senaoVolta: 'fim',
    alvo: () => _tourVis('#pb-share-overlay a.btn-success') || _tourVis('#pb-share-overlay > div'),
    titulo: () => 'Proposta pronta!',
    texto: () => document.querySelector('#pb-share-overlay a.btn-success')
      ? `O link já foi copiado. Toque em <b>Enviar no WhatsApp</b> e a mensagem vai pronta pro ${escapeHTML(_tourCliente())}, com o link da proposta.`
      : 'O link já foi copiado. Como o cliente está sem WhatsApp, mande o link por outro canal.',
  },
  {
    id: 'fim', centro: true, icone: 'party-popper',
    titulo: () => 'Orçamento feito!',
    texto: () => 'Quando o cliente abrir o link, a proposta aparece como <b>VISTA</b> e você recebe um aviso.<br><br>Quer rever este passo a passo? Toque no <b>?</b> lá em cima.',
    botao: 'Concluir',
  },
];

const TourOrcamento = (() => {
  let i = -1;
  let ativo = false;
  let rever = false;
  let saindo = false;
  let raf = 0;
  let sumiuDesde = 0;
  let ultimo = '';
  let espera = 0;
  let luz, muros, anel, balao;

  const TOTAL = TOUR_PASSOS.filter((p) => !p.centro).length;
  const passo = () => TOUR_PASSOS[i];
  const indice = (id) => TOUR_PASSOS.findIndex((p) => p.id === id);
  const evento = (nome, extra) => { if (typeof captureEvent === 'function') captureEvent(nome, { passo: passo()?.id, rever, ...extra }); };

  function sacudir() {
    balao.classList.remove('tour-sacode');
    void balao.offsetWidth;
    balao.classList.add('tour-sacode');
  }

  function montar() {
    if (luz) return;
    // luz = recorte iluminado (a sombra gigante escurece o resto da tela);
    // muros = 4 faixas invisíveis em volta do recorte que seguram os cliques.
    luz = document.createElement('div');
    luz.className = 'tour-luz';
    muros = [0, 1, 2, 3].map(() => {
      const m = document.createElement('div');
      m.className = 'tour-muro';
      m.addEventListener('click', sacudir);
      return m;
    });
    anel = document.createElement('div');
    anel.className = 'tour-anel';
    balao = document.createElement('div');
    balao.className = 'tour-balao';
    balao.setAttribute('role', 'dialog');
    balao.setAttribute('aria-live', 'polite');
    balao.addEventListener('click', clicarBalao);
    document.body.append(luz, ...muros, anel, balao);
    // captura: o Esc do tour não pode fechar o popup que está por baixo
    document.addEventListener('keydown', (e) => {
      if (!ativo || e.key !== 'Escape') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (saindo) render(); else confirmarSaida();
    }, true);
  }

  function alvos(p) {
    if (!p || p.centro || !p.alvo) return [];
    const a = p.alvo();
    return (Array.isArray(a) ? a : [a]).filter((el) => el && el.getClientRects().length);
  }

  function retangulo(els, pad = 6) {
    if (!els.length) return null;
    const rs = els.map((el) => el.getBoundingClientRect());
    const x = Math.min(...rs.map((r) => r.left)) - pad;
    const y = Math.min(...rs.map((r) => r.top)) - pad;
    const w = Math.max(...rs.map((r) => r.right)) + pad - x;
    const h = Math.max(...rs.map((r) => r.bottom)) + pad - y;
    return { x, y, w, h };
  }

  // Sem alvo (boas-vindas, fim, tela trocando): recorte zerado no meio = tudo escuro e bloqueado.
  function recortar(r) {
    const W = window.innerWidth, H = window.innerHeight;
    const q = r || { x: W / 2, y: H / 2, w: 0, h: 0 };
    Object.assign(luz.style, { left: q.x + 'px', top: q.y + 'px', width: q.w + 'px', height: q.h + 'px', borderRadius: r ? '16px' : '0' });
    const [cima, baixo, esq, dir] = muros;
    Object.assign(cima.style, { left: '0', top: '0', width: W + 'px', height: Math.max(0, q.y) + 'px' });
    Object.assign(baixo.style, { left: '0', top: q.y + q.h + 'px', width: W + 'px', height: Math.max(0, H - q.y - q.h) + 'px' });
    Object.assign(esq.style, { left: '0', top: q.y + 'px', width: Math.max(0, q.x) + 'px', height: q.h + 'px' });
    Object.assign(dir.style, { left: q.x + q.w + 'px', top: q.y + 'px', width: Math.max(0, W - q.x - q.w) + 'px', height: q.h + 'px' });
  }

  function posicionar() {
    if (!ativo) return;
    raf = requestAnimationFrame(posicionar);
    const p = passo();
    if (p.atalho && p.atalho.se()) { ir(indice(p.atalho.para)); return; }
    const els = alvos(p);

    if (!p.centro && !els.length) {
      // elemento sumiu: espera um pouco (tela trocando) e volta pro passo seguro;
      // sem passo seguro, encerra em vez de deixar a tela travada no escuro
      if (!sumiuDesde) sumiuDesde = performance.now();
      const parado = performance.now() - sumiuDesde;
      if (p.senaoVolta && parado > 900) { sumiuDesde = 0; ir(indice(p.senaoVolta)); return; }
      if (!p.senaoVolta && parado > 4000) { evento('tour_orcamento_travou'); fechar(); return; }
      recortar(null);
      ultimo = '';
      anel.style.opacity = '0';
      balao.style.opacity = '0';
      return;
    }
    sumiuDesde = 0;
    balao.style.opacity = '1';

    const r = retangulo(els);
    const anelEls = p.anel ? [p.anel()].filter((el) => el && el.getClientRects().length) : els;
    const ra = retangulo(anelEls, 4) || r;
    const chave = JSON.stringify([r, ra, window.innerWidth, window.innerHeight, balao.offsetWidth, balao.offsetHeight]);
    if (chave === ultimo) return;
    ultimo = chave;
    recortar(r);
    if (ra) {
      Object.assign(anel.style, { opacity: '1', left: ra.x + 'px', top: ra.y + 'px', width: ra.w + 'px', height: ra.h + 'px' });
      anel.classList.toggle('tour-pulsa', Boolean(p.esperar));
    } else {
      anel.style.opacity = '0';
    }
    colocarBalao(r);
  }

  function colocarBalao(r) {
    const W = window.innerWidth, H = window.innerHeight, m = 12, gap = 14;
    const bw = balao.offsetWidth, bh = balao.offsetHeight;
    balao.classList.remove('lado-cima', 'lado-baixo', 'lado-esq', 'lado-dir', 'doca');
    if (!r) {
      Object.assign(balao.style, { left: Math.max(m, (W - bw) / 2) + 'px', top: Math.max(m, (H - bh) / 2) + 'px' });
      return;
    }
    // celular: balão encaixado em cima ou embaixo, do lado oposto ao elemento
    if (W < 640) {
      balao.classList.add('doca');
      const top = r.y + r.h / 2 > H / 2 ? m : H - bh - m;
      Object.assign(balao.style, { left: m + 'px', top: Math.max(m, top) + 'px' });
      return;
    }
    const cabe = {
      baixo: H - (r.y + r.h) - gap - m >= bh,
      cima: r.y - gap - m >= bh,
      dir: W - (r.x + r.w) - gap - m >= bw,
      esq: r.x - gap - m >= bw,
    };
    const lado = cabe.baixo ? 'baixo' : cabe.cima ? 'cima' : cabe.dir ? 'dir' : cabe.esq ? 'esq' : 'sobre';
    let left, top;
    if (lado === 'baixo' || lado === 'cima' || lado === 'sobre') {
      left = Math.min(Math.max(m, r.x + r.w / 2 - bw / 2), W - bw - m);
      top = lado === 'baixo' ? r.y + r.h + gap : lado === 'cima' ? r.y - bh - gap : H - bh - m;
      balao.style.setProperty('--seta', Math.min(Math.max(20, r.x + r.w / 2 - left), bw - 20) + 'px');
    } else {
      top = Math.min(Math.max(m, r.y + r.h / 2 - bh / 2), H - bh - m);
      left = lado === 'dir' ? r.x + r.w + gap : r.x - bw - gap;
      balao.style.setProperty('--seta', Math.min(Math.max(20, r.y + r.h / 2 - top), bh - 20) + 'px');
    }
    if (lado !== 'sobre') balao.classList.add('lado-' + lado);
    Object.assign(balao.style, { left: left + 'px', top: top + 'px' });
  }

  function render() {
    saindo = false;
    const p = passo();
    const n = TOUR_PASSOS.slice(0, i + 1).filter((x) => !x.centro).length;
    balao.classList.toggle('tour-centro', Boolean(p.centro));
    balao.innerHTML = `
      ${p.centro ? `<div class="tour-ic"><i data-lucide="${p.icone || 'sparkles'}"></i></div>` : `
      <div class="tour-prog" aria-hidden="true"><span style="width:${Math.round(n / TOTAL * 100)}%"></span></div>
      <div class="tour-top"><small>Passo ${n} de ${TOTAL}</small><button type="button" class="tour-x" data-t="sair" aria-label="Sair do tour"><i data-lucide="x"></i></button></div>`}
      <h3>${p.titulo(rever)}</h3>
      <p>${p.texto(rever)}</p>
      ${p.esperar ? '<div class="tour-faca"><i data-lucide="pointer"></i> Faça isso na tela pra continuar</div>' : ''}
      <div class="tour-btns">
        ${p.pular ? `<button type="button" class="tour-b tour-b-ghost" data-t="pular">${p.pular}</button>` : ''}
        ${!p.esperar ? `<button type="button" class="tour-b tour-b-pri" data-t="prox">${p.botao || 'Próximo'}</button>` : ''}
      </div>`;
    if (window.lucide) lucide.createIcons();
    ultimo = '';
    balao.querySelector('[data-t="prox"]')?.focus({ preventScroll: true });
  }

  function confirmarSaida() {
    saindo = true;
    balao.classList.remove('tour-centro');
    balao.innerHTML = `
      <h3>Sair do tour?</h3>
      <p>Você pode rever quando quiser no <b>?</b> lá em cima.</p>
      <div class="tour-btns">
        <button type="button" class="tour-b tour-b-ghost" data-t="sim">Sair do tour</button>
        <button type="button" class="tour-b tour-b-pri" data-t="nao">Continuar</button>
      </div>`;
    ultimo = '';
    balao.querySelector('[data-t="nao"]').focus({ preventScroll: true });
  }

  function clicarBalao(e) {
    const b = e.target.closest('[data-t]');
    if (!b) return;
    const t = b.dataset.t;
    if (t === 'prox') { if (i === TOUR_PASSOS.length - 1) evento('tour_orcamento_concluido'); proximo(); }
    else if (t === 'pular' || t === 'sim') { evento('tour_orcamento_pulado'); fechar(); }
    else if (t === 'sair') confirmarSaida();
    else if (t === 'nao') render();
  }

  function ir(novo) {
    clearInterval(espera);
    i = novo;
    const p = passo();
    if (!p) { fechar(); return; }
    render();
    // traz o elemento pra tela (o rodapé do orçamento e a barra do celular são fixos)
    requestAnimationFrame(() => {
      const els = alvos(p);
      const r = retangulo(els, 0);
      if (r && (r.y < 70 || r.y + r.h > window.innerHeight - 90)) els[0].scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
    if (p.esperar) {
      espera = setInterval(() => {
        if (ativo && passo() === p && p.esperar()) { clearInterval(espera); setTimeout(() => { if (passo() === p) proximo(); }, 350); }
      }, 150);
    }
  }

  function proximo() { ir(i + 1); }

  function iniciar(modoRever) {
    if (ativo) return;
    montar();
    rever = Boolean(modoRever);
    ativo = true;
    document.body.classList.add('tour-on');
    [luz, ...muros, anel, balao].forEach((el) => el.classList.add('on'));
    ir(0);
    evento('tour_orcamento_inicio');
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(posicionar);
  }

  function fechar() {
    if (!ativo) return;
    ativo = false;
    clearInterval(espera);
    cancelAnimationFrame(raf);
    document.body.classList.remove('tour-on');
    [luz, ...muros, anel, balao].forEach((el) => el.classList.remove('on', 'tour-sacode'));
  }

  return { iniciar, fechar, get ativo() { return ativo; } };
})();

// ---------- quem vê e quando ----------

function _tourChaveLocal() {
  return 'tour_orcamento_visto:' + (state.currentUser?.id || '');
}

function _tourJaViu() {
  const meta = state.currentUser?.user_metadata || {};
  if (meta[TOUR_META]) return true;
  try { return localStorage.getItem(_tourChaveLocal()) === '1'; } catch (e) { return false; }
}

// Grava "já viu" assim que abre: aparece uma vez só, mesmo que ele pule ou feche a aba.
async function _tourMarcarVisto() {
  const quando = new Date().toISOString();
  try { localStorage.setItem(_tourChaveLocal(), '1'); } catch (e) { /* sem storage: fica só no servidor */ }
  if (state.currentUser) state.currentUser.user_metadata = { ...(state.currentUser.user_metadata || {}), [TOUR_META]: quando };
  try {
    const { error } = await supabaseClient.auth.updateUser({ data: { [TOUR_META]: quando } });
    if (error) throw error;
  } catch (err) {
    console.warn('[tour] Não gravou o "já viu" no servidor (fica no aparelho).', err);
  }
}

function _tourUsuarioNovo() {
  const u = state.currentUser;
  if (!u || state.isTecnico) return false;
  const criado = Date.parse(u.created_at || '');
  return Number.isFinite(criado) && criado >= Date.parse(TOUR_NOVOS_DESDE);
}

// Tela livre pra começar: Comercial, sem launcher, ficha, orçamento ou popup aberto.
function _tourTelaLivre() {
  if (!window.uiV2 || !window.uiV2.isActive()) return false;
  if (state.environment !== 'comercial') return false;
  if (!document.getElementById('launcher-screen')?.classList.contains('hidden')) return false;
  if (!document.getElementById('splash-screen')?.classList.contains('hidden')) return false;
  if (_tourOrcamentoAberto()) return false;
  if (typeof _crm360ClientId !== 'undefined' && _crm360ClientId) return false;
  if (document.querySelector('[id$="-overlay"]:not(.hidden), [id$="-modal"].fixed:not(.hidden), .v2-sheet.on, .v2-pop.on')) return false;
  return Boolean(_tourVis('#v2-side .v2-cta, #v2-mnav .plus'));
}

let _tourAguardando = 0;
function tourOrcamentoPosLogin() {
  clearInterval(_tourAguardando);
  if (!_tourUsuarioNovo() || _tourJaViu()) return;
  // espera ele chegar no Comercial (o launcher pode estar aberto)
  _tourAguardando = setInterval(() => {
    if (!state.currentUser || _tourJaViu()) { clearInterval(_tourAguardando); return; }
    if (TourOrcamento.ativo || !_tourTelaLivre()) return;
    clearInterval(_tourAguardando);
    _tourMarcarVisto();
    TourOrcamento.iniciar(false);
  }, 1000);
}

// Botão "?" do topo: rever quando quiser.
function tourOrcamentoIniciar() {
  if (TourOrcamento.ativo) return;
  if (_tourOrcamentoAberto() && typeof closeOrcamento === 'function') closeOrcamento();
  if (typeof _crm360ClientId !== 'undefined' && _crm360ClientId && typeof closeCrm360 === 'function') closeCrm360();
  setTimeout(() => TourOrcamento.iniciar(true), 150);
}
