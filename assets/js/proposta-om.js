// ==========================================
// PROPOSTA O&M — PÁGINA PÚBLICA (visual "Clássico" premium)
// Fluxo: Loader → Capa → Documento
// Modos suportados:
//   ?t=<public_token>  → produção (Supabase RPC get_public_om_proposta)
//   ?mock=<id>         → dev local (localStorage)
// ==========================================

if (typeof initAnalytics === 'function') {
  try { initAnalytics({ mode: 'public' }); } catch (_) {}
}

const params      = new URLSearchParams(window.location.search);
const mockId      = params.get('mock');
const publicToken = params.get('t');

const STORAGE_KEY = (id) => `om-proposta-public-${id}`;

const $ = (id) => document.getElementById(id);

// ----------------------------------------------------------------------
// Escopo padrão (fallback quando a proposta não traz `incluso`/`nao_incluso`)
// ----------------------------------------------------------------------
// Lista única de serviços inclusos — vale para todos os tipos de proposta O&M.
const INCLUSO_PADRAO = [
  'Limpeza técnica completa dos módulos',
  'Manutenção preventiva da parte elétrica',
  'Verificação de conectores',
  'Inspeção de cabos',
  'Análise de tensão e corrente do sistema',
  'Diagnóstico de desempenho e geração',
  'Inspeção e limpeza do inversor',
  'Configuração e validação do monitoramento',
];

const NAO_INCLUSO_PADRAO = [
  'Substituição de equipamentos (módulos, inversor, string box)',
  'Adequações elétricas fora do escopo descrito',
  'Deslocamento adicional fora da área de cobertura',
  'Materiais e componentes do sistema',
];

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function formatBRL(v) {
  if (v == null || isNaN(v)) return '—';
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function setText(id, v) {
  const el = $(id);
  if (el) el.textContent = (v == null || v === '') ? '—' : String(v);
}

function refreshIcons() { if (window.lucide) lucide.createIcons(); }

// ----------------------------------------------------------------------
// Parcelamento no cartão (manutenção: até 12x)
// ----------------------------------------------------------------------
const TAXAS_CARTAO = {
  1: 2.99,  2: 4.09,  3: 4.78,  4: 5.47,  5: 6.14,  6: 6.81,
  7: 7.67,  8: 8.33,  9: 8.98, 10: 9.63, 11: 10.26, 12: 10.90
};
const MAX_PARCELAS = 12;

function gerarOpcoesParcelamento(valorBase) {
  const cont = $('installments-list');
  if (!cont || !(valorBase > 0)) return;
  cont.innerHTML = '';
  for (let i = 1; i <= MAX_PARCELAS; i++) {
    const taxa     = TAXAS_CARTAO[i] || 0;
    const total    = valorBase / (1 - (taxa / 100));
    const parcela  = total / i;
    const row      = document.createElement('div');
    row.className  = 'par-row';
    row.textContent = `${i}x de ${formatBRL(parcela)}`;
    cont.appendChild(row);
  }
}

function openParcelas()  { const m = $('modal-parcelamento'); if (m) { m.classList.add('open');    m.setAttribute('aria-hidden', 'false'); } }
function closeParcelas() { const m = $('modal-parcelamento'); if (m) { m.classList.remove('open'); m.setAttribute('aria-hidden', 'true');  } }

// ----------------------------------------------------------------------
// Renderização do conteúdo
// ----------------------------------------------------------------------
function renderListaInclusos(tipo, incluso, naoIncluso) {
  const inclusoItems = Array.isArray(incluso) && incluso.length
    ? incluso
    : INCLUSO_PADRAO;
  const naoInclusoItems = Array.isArray(naoIncluso) && naoIncluso.length
    ? naoIncluso
    : NAO_INCLUSO_PADRAO;

  $('incluso-list').innerHTML = inclusoItems
    .map(t => `<li><i data-lucide="check"></i>${escapeHtml(t)}</li>`).join('');
  $('nao-incluso-list').innerHTML = naoInclusoItems
    .map(t => `<li><i data-lucide="minus"></i>${escapeHtml(t)}</li>`).join('');
}

function renderSistema(s) {
  const cards = $('sys-cards');
  const empty = $('sys-empty');
  if (!cards || !empty) return;

  const has = s && (s.potencia || s.modulos || s.inversor || s.telhado);
  if (!has) {
    cards.style.display = 'none';
    empty.style.display = 'flex';
    return;
  }
  cards.style.display = '';
  empty.style.display = 'none';
  setText('sys-potencia', s.potencia);
  setText('sys-modulos',  s.modulos);
  setText('sys-inversor', s.inversor);
  setText('sys-telhado',  s.telhado);
}

function anoDeValidade(validade) {
  const m = String(validade || '').match(/(\d{4})/);
  return m ? m[1] : String(new Date().getFullYear());
}

function bannerText(status) {
  if (status === 'Recusada')  return 'Proposta recusada. Caso queira conversar, fale com a gente no WhatsApp.';
  if (status === 'Vencida')   return 'Esta proposta venceu. Solicite uma nova com o seu consultor.';
  if (status === 'Cancelada') return 'Esta proposta foi cancelada. Fale com o seu consultor.';
  return `Esta proposta está no status ${status}.`;
}

const FINAL_STATES = ['Aprovada', 'Recusada', 'Cancelada', 'Vencida'];

function render(p) {
  const tipo   = p.tipo || '—';
  const cidade = p.cidade || (p.endereco || '').split(' — ').pop() || '—';

  // Cabeçalho / saudação (desktop + mobile)
  setText('status-label', p.status || 'Enviada');
  setText('m-greet-name', p.cliente || 'Cliente');
  const subEl = $('m-greet-sub');
  if (subEl) subEl.textContent = `Aqui está a proposta de ${(tipo || 'manutenção').toLowerCase()} do seu sistema fotovoltaico, preparada sob medida.`;
  setText('m-local', cidade);
  setText('m-validade-data', p.validade);
  setText('m-num', p.numero);

  // Opções de parcelamento (até 12x)
  gerarOpcoesParcelamento(p.valor);

  // Escopo + descrição livre
  renderListaInclusos(p.tipo, p.incluso, p.nao_incluso);
  const descEl = $('service-desc');
  if (descEl) {
    const desc = (p.descricao || '').trim();
    if (desc) { descEl.textContent = desc; descEl.style.display = 'block'; }
    else      { descEl.style.display = 'none'; }
  }

  // Sistema
  renderSistema(p.sistema);

  // Preço
  setText('valor', formatBRL(p.valor));
  setText('pagamento', p.pagamento);
  setText('validade-price', p.validade);

  // Responsável técnico (some se não houver)
  const respCard = $('resp-card');
  if (respCard) {
    if (p.responsavel) { setText('responsavel', p.responsavel); respCard.style.display = 'flex'; }
    else { respCard.style.display = 'none'; }
  }

  // Capa
  setText('cover-ano', anoDeValidade(p.validade));
  setText('cover-title', tipo);
  $('cover-sub').textContent = `Operação & Manutenção do sistema fotovoltaico, preparada para o ${p.cliente || 'cliente'}.`;
  setText('cover-cli', p.cliente);
  setText('cover-num', p.numero);
  setText('cover-validade', p.validade);

  // WhatsApp → fala com o VENDEDOR (responsável pela proposta), não com o cliente
  const wa = (p.vendedor_telefone || '').replace(/\D/g, '');
  const waMsg = encodeURIComponent(`Olá! Recebi a proposta ${p.numero || ''} da Ágil Solar e gostaria de conversar.`);
  const waHref = wa ? `https://wa.me/55${wa}?text=${waMsg}` : `https://wa.me/?text=${waMsg}`;
  const waEl = $('btn-whatsapp'); if (waEl) waEl.href = waHref;

  // Estados finais → esconde ações e mostra resultado
  const isFinal = FINAL_STATES.includes(p.status);
  const actions = $('price-actions');
  const finalBox = $('price-final');
  if (isFinal) {
    if (actions) actions.style.display = 'none';
    if (finalBox) {
      if (p.status === 'Aprovada') {
        finalBox.className = 'approved-state';
        // flex (não block) para o .approved-state centralizar o ✓ via align-items:center
        finalBox.style.display = 'flex';
        finalBox.innerHTML = '<div class="ok"><i data-lucide="check"></i></div>'
          + '<h4>Proposta aprovada!</h4>'
          + '<p>Recebemos seu aceite. A equipe da Ágil Solar entra em contato em breve para agendar.</p>';
      } else {
        finalBox.className = 'banner';
        finalBox.style.display = 'block';
        finalBox.textContent = bannerText(p.status);
      }
    }
  } else {
    if (actions) actions.style.display = '';
    if (finalBox) finalBox.style.display = 'none';
  }

  $('doc').style.display = 'block';
  refreshIcons();

  // CTA mobile: barra "Aprovar" deslizante — depois do #doc visível,
  // senão getBoundingClientRect() do botão (oculto) retorna 0.
  setupMobileCTA(isFinal);
}

// ----------------------------------------------------------------------
// CTA mobile: barra "Aprovar" fixa que desliza de baixo quando o botão
// do card de preço (no topo) sai por cima da tela, e recolhe ao voltar.
// ----------------------------------------------------------------------
let mobileCTAScroll = null; // referência pra remover o listener entre cargas

function setupMobileCTA(isFinal) {
  const bar  = $('m-cta-bar');
  const home = $('btn-aprovar'); // botão "Aprovar" dentro do card de preço
  if (!bar) return;

  // limpa estado/listener de uma carga anterior
  if (mobileCTAScroll) {
    window.removeEventListener('scroll', mobileCTAScroll);
    window.removeEventListener('resize', mobileCTAScroll);
    mobileCTAScroll = null;
  }
  bar.classList.remove('show');

  // Em estados finais não há ação a tomar → barra fica escondida
  if (isFinal || !home) return;

  // abre o mesmo modal de aceite do desktop
  const aprovar = $('m-cta-aprovar');
  if (aprovar) aprovar.onclick = () => { if (typeof openAceiteModal === 'function') openAceiteModal(); };

  // histerese pra não tremer no limite: mostra quando some por cima, recolhe ao reaparecer
  const SHOW_AT = 0, HIDE_AT = 24;
  let shown = false;
  mobileCTAScroll = () => {
    // elemento sem layout (oculto) → não decide nada
    if (!home.offsetParent && home.getBoundingClientRect().bottom === 0) return;
    const b = home.getBoundingClientRect().bottom;
    if (!shown && b <= SHOW_AT)      { shown = true;  bar.classList.add('show'); }
    else if (shown && b >= HIDE_AT)  { shown = false; bar.classList.remove('show'); }
  };
  window.addEventListener('scroll',  mobileCTAScroll, { passive: true });
  window.addEventListener('resize',  mobileCTAScroll);
  requestAnimationFrame(mobileCTAScroll); // espera o layout assentar
}

// ----------------------------------------------------------------------
// Fases visuais: Loader → Capa → Documento
// ----------------------------------------------------------------------
function showError() {
  $('loader').classList.add('gone');
  $('cover').style.display = 'none';
  $('doc').style.display = 'none';
  const err = $('error-state');
  err.style.display = 'flex';
  refreshIcons();
}

function runLoader(done) {
  const fill = $('loader-bar-fill');
  const sub  = $('loader-sub');
  const steps = [
    [18, 'Conectando ao servidor seguro'],
    [46, 'Carregando dados da proposta'],
    [72, 'Identificando seu dispositivo'],
    [100, 'Preparando sua proposta'],
  ];
  let i = 0;
  const t = setInterval(() => {
    if (i < steps.length) {
      if (fill) fill.style.width = steps[i][0] + '%';
      if (sub) sub.textContent = steps[i][1] + '…';
      i++;
    } else {
      clearInterval(t);
      setTimeout(done, 420);
    }
  }, 560);
}

function revealCover() {
  $('loader').classList.add('gone');
  $('cover').style.display = 'flex';
  refreshIcons();
}

// Vai direto para o documento, sem passar pela capa de abertura.
function revealDocument() {
  $('loader').classList.add('gone');
  $('cover').style.display = 'none';
  window.scrollTo(0, 0);
  refreshIcons();
  if (typeof captureEvent === 'function') {
    try { captureEvent('public_om_proposal_opened', { mode: mockId ? 'mock' : 'live' }); } catch (_) {}
  }
}

function openDocument() {
  $('cover').classList.add('gone');
  window.scrollTo(0, 0);
  refreshIcons();
  if (typeof captureEvent === 'function') {
    try { captureEvent('public_om_proposal_opened', { mode: mockId ? 'mock' : 'live' }); } catch (_) {}
  }
}

function scrollToPreco() {
  const el = $('bloco-preco');
  if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 80, behavior: 'smooth' });
}

// ----------------------------------------------------------------------
// Persistência mock — sincroniza com o portal via localStorage
// ----------------------------------------------------------------------
function loadFromMock(id) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY(id));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_) { return null; }
}
function saveMock(id, data) {
  try { localStorage.setItem(STORAGE_KEY(id), JSON.stringify(data)); } catch (_) {}
}
function markViewed(id, p) {
  if (!p) return;
  if (!p.viewedAt) p.viewedAt = new Date().toISOString();
  if (p.status === 'Enviada') p.status = 'Visualizada';
  saveMock(id, p);
}
function respond(id, decision) {
  const p = loadFromMock(id);
  if (!p) return;
  if (FINAL_STATES.includes(p.status)) return;
  p.status = decision === 'aprovar' ? 'Aprovada' : 'Recusada';
  p.respondedAt = new Date().toISOString();
  saveMock(id, p);
  if (typeof captureEvent === 'function') {
    try { captureEvent('public_om_proposal_response', { decision: p.status }); } catch (_) {}
  }
  render(p);
}

// ----------------------------------------------------------------------
// Persistência real — Supabase RPC
// ----------------------------------------------------------------------
function showResponseError(msg) {
  const el = $('price-final');
  if (!el) return;
  el.className = 'banner';
  el.style.display = 'block';
  el.style.borderColor = 'rgba(248,113,113,.3)';
  el.style.background = 'rgba(248,113,113,.1)';
  el.style.color = '#fca5a5';
  el.textContent = msg || 'Não foi possível processar sua resposta. Tente novamente.';
}

function setActionsBusy(busy) {
  const wrap = $('price-actions');
  if (wrap) wrap.classList.toggle('is-busy', !!busy);
}

async function respondReal(token, decision) {
  setActionsBusy(true);
  try {
    const { data, error } = await supabaseClient.rpc('respond_public_om_proposta', {
      p_token: token,
      p_decision: decision,
    });
    if (error || !data) {
      const msg = (error?.message || '').toLowerCase();
      if (msg.includes('não pode mais')) {
        showResponseError('Esta proposta já foi respondida ou não pode mais ser alterada.');
      } else {
        showResponseError();
      }
      return;
    }
    if (typeof captureEvent === 'function') {
      try { captureEvent('public_om_proposal_response', { decision: data.status, mode: 'live' }); } catch (_) {}
    }
    render(data);
  } catch (e) {
    showResponseError();
  } finally {
    setActionsBusy(false);
  }
}

async function loadFromSupabase(token) {
  const { data, error } = await supabaseClient.rpc('get_public_om_proposta', { p_token: token });
  if (error || !data) return null;
  return data;
}

// ----------------------------------------------------------------------
// Aceite com assinatura desenhada
// ----------------------------------------------------------------------
const TEXTO_CIENCIA = 'Declaro que li e compreendi integralmente esta proposta de serviço da Ágil Solar — escopo, valores, condições de pagamento e prazo de validade. Manifesto, de forma livre e consciente, meu aceite e aprovação desta proposta. Estou ciente de que esta aprovação digital, registrada com minha assinatura, data, hora e endereço de IP, confirma o pedido e autoriza a Ágil Solar a agendar a execução do serviço descrito. Confirmo que a assinatura aposta abaixo é de minha autoria.';

let _sigPad = null;

function initSignaturePad(canvas, onChange) {
  const ctx = canvas.getContext('2d');
  function paintBg() { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
  paintBg();
  ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#0a0a0a';
  let drawing = false, hasInk = false, last = null;
  function pos(e) {
    const r = canvas.getBoundingClientRect();
    const t = (e.touches && e.touches[0]) ? e.touches[0] : e;
    return {
      x: (t.clientX - r.left) * (canvas.width / r.width),
      y: (t.clientY - r.top) * (canvas.height / r.height),
    };
  }
  function start(e) { drawing = true; last = pos(e); e.preventDefault(); }
  function move(e) {
    if (!drawing) return;
    const p = pos(e);
    ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    last = p;
    hasInk = true;
    if (onChange) onChange();
    e.preventDefault();
  }
  function end() { drawing = false; }
  canvas.addEventListener('mousedown', start);
  canvas.addEventListener('mousemove', move);
  window.addEventListener('mouseup', end);
  canvas.addEventListener('touchstart', start, { passive: false });
  canvas.addEventListener('touchmove', move, { passive: false });
  canvas.addEventListener('touchend', end);
  return {
    isEmpty: () => !hasInk,
    clear: () => { paintBg(); hasInk = false; if (onChange) onChange(); },
    toDataURL: () => canvas.toDataURL('image/png'),
  };
}

function updateAceiteConfirm() {
  const ok = $('aceite-nome').value.trim() !== ''
    && $('aceite-check').checked
    && _sigPad && !_sigPad.isEmpty();
  $('aceite-confirmar').disabled = !ok;
}

function showAceiteErro(msg) {
  const el = $('aceite-erro');
  if (!msg) { el.style.display = 'none'; el.textContent = ''; return; }
  el.textContent = msg;
  el.style.display = 'block';
}

function setAceiteBusy(busy) {
  ['aceite-cancelar', 'aceite-fechar', 'aceite-limpar'].forEach(id => {
    const el = $(id); if (el) el.disabled = !!busy;
  });
  const btn = $('aceite-confirmar');
  if (busy) btn.disabled = true; else updateAceiteConfirm();
}

function openAceiteModal() {
  const modal = $('aceite-modal');
  $('aceite-texto').textContent = TEXTO_CIENCIA;
  $('aceite-nome').value = '';
  $('aceite-check').checked = false;
  showAceiteErro(null);
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
  if (!_sigPad) _sigPad = initSignaturePad($('aceite-canvas'), updateAceiteConfirm);
  else _sigPad.clear();
  updateAceiteConfirm();
  refreshIcons();
}

function closeAceiteModal() {
  $('aceite-modal').classList.remove('open');
  document.body.style.overflow = '';
}

async function aceiteConfirmar() {
  if ($('aceite-confirmar').disabled) return;
  showAceiteErro(null);
  setAceiteBusy(true);
  try {
    await submeterAceite({
      nome: $('aceite-nome').value.trim(),
      assinatura: _sigPad.toDataURL(),
      texto: TEXTO_CIENCIA,
    });
  } catch (e) {
    showAceiteErro((e && e.message) || 'Não foi possível registrar o aceite. Tente novamente.');
  } finally {
    setAceiteBusy(false);
  }
}

async function submeterAceite(aceite) {
  // Produção: ?t=<token>
  if (publicToken) {
    const { data, error } = await supabaseClient.rpc('respond_public_om_proposta', {
      p_token: publicToken,
      p_decision: 'aprovar',
      p_aceite_nome: aceite.nome,
      p_assinatura: aceite.assinatura,
      p_texto_ciencia: aceite.texto,
    });
    if (error || !data) {
      const msg = (error?.message || '').toLowerCase();
      throw new Error(msg.includes('não pode mais') || msg.includes('respondida')
        ? 'Esta proposta já foi respondida ou não pode mais ser alterada.'
        : 'Não foi possível registrar o aceite. Tente novamente.');
    }
    if (typeof captureEvent === 'function') {
      try { captureEvent('public_om_proposal_response', { decision: 'Aprovada', mode: 'live' }); } catch (_) {}
    }
    closeAceiteModal();
    render(data);
    return;
  }
  // Modo dev local: ?mock=<id>
  if (mockId) {
    closeAceiteModal();
    respond(mockId, 'aprovar');
  }
}

function wireAceiteModal() {
  $('aceite-nome').addEventListener('input', updateAceiteConfirm);
  $('aceite-check').addEventListener('change', updateAceiteConfirm);
  $('aceite-limpar').addEventListener('click', () => { if (_sigPad) _sigPad.clear(); });
  $('aceite-confirmar').addEventListener('click', aceiteConfirmar);
  $('aceite-cancelar').addEventListener('click', closeAceiteModal);
  $('aceite-fechar').addEventListener('click', closeAceiteModal);
}

// ----------------------------------------------------------------------
// Ações (aprovar / recusar) — depende do modo
// ----------------------------------------------------------------------
function wireActions() {
  $('cover-cta').addEventListener('click', openDocument);
  $('btn-aprovar').addEventListener('click', () => openAceiteModal());
  $('btn-recusar').addEventListener('click', () => {
    if (publicToken)   respondReal(publicToken, 'recusar');
    else if (mockId)   respond(mockId, 'recusar');
  });

  // Modal de parcelas (botão no card de preço — desktop + mobile)
  const verDsk = $('ver-parcelas-desk');  if (verDsk) verDsk.addEventListener('click', openParcelas);
  const closeP = $('btn-close-modal');     if (closeP) closeP.addEventListener('click', closeParcelas);
  const modalP = $('modal-parcelamento');  if (modalP) modalP.addEventListener('click', (e) => { if (e.target === modalP) closeParcelas(); });
}

// ----------------------------------------------------------------------
// Boot — carrega dados e roda o loader em paralelo
// ----------------------------------------------------------------------
function boot() {
  refreshIcons();
  wireAceiteModal();
  wireActions();

  const fetchData = (async () => {
    if (mockId) {
      const p = loadFromMock(mockId);
      if (p) markViewed(mockId, p);
      return p;
    }
    if (publicToken) {
      return await loadFromSupabase(publicToken);
    }
    return null;
  })();

  let loaderDone = false;
  let data = undefined; // undefined = ainda carregando; null = erro/sem dados

  const tryFinish = () => {
    if (!loaderDone || data === undefined) return;
    if (!data) { showError(); return; }
    render(data);
    if (typeof captureEvent === 'function') {
      try { captureEvent('public_om_proposal_viewed', { mode: mockId ? 'mock' : 'live' }); } catch (_) {}
    }
    revealDocument();
  };

  runLoader(() => { loaderDone = true; tryFinish(); });
  fetchData.then(p => { data = p; tryFinish(); }).catch(() => { data = null; tryFinish(); });
}

boot();
