// ==========================================
// LÓGICA DA PÁGINA DE PROPOSTA (proposta.html)
// ==========================================

const VIDEOS_YOUTUBE = [
  'https://www.youtube.com/embed/a-3d90O2u60?si=3F89_VFQmDptzcxp',
  'https://www.youtube.com/embed/YvyIMNlm0q8?si=hJw5gToEMUEYU2LQ',
  'https://www.youtube.com/embed/SOotdCvJAkc?si=KHc78sgr9qrvwHDp'
];

// Taxas do cartão, economia, payback e validade: assets/js/proposta-calc.js
// (mesmo cálculo do proposta-pdf.html).

if (typeof initAnalytics === 'function') {
  initAnalytics({ mode: 'public' });
}

lucide.createIcons();

function isStandaloneDisplayMode() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.navigator.standalone === true
  );
}

function tryOpenExternalBrowser(url) {
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer external';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    return true;
  } catch (_) {
    return false;
  }
}

function initProposalQuickActions() {
  const quickWrap = document.getElementById('proposal-quick-actions');
  const btnBack = document.getElementById('qa-back-btn');
  const btnCopy = document.getElementById('qa-copy-btn');
  const btnOpen = document.getElementById('qa-open-browser-btn');
  if (!quickWrap || !btnBack || !btnCopy || !btnOpen) return;

  // Exibe sempre em telas menores e no modo app.
  if (window.innerWidth < 1024 || isStandaloneDisplayMode()) {
    quickWrap.classList.remove('hidden');
  }

  btnBack.addEventListener('click', () => {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    window.location.href = '/index.html';
  });

  btnCopy.addEventListener('click', () => {
    copiarTextoBlindado(window.location.href);
    if (typeof showToast === 'function') showToast('LINK DA PROPOSTA COPIADO!');
  });

  btnOpen.addEventListener('click', () => {
    const ok = tryOpenExternalBrowser(window.location.href);
    if (typeof showToast === 'function') {
      showToast(ok
        ? 'ABRINDO NO NAVEGADOR...'
        : 'Nao foi possivel abrir. Link ja foi copiado.');
    }
    if (!ok) copiarTextoBlindado(window.location.href);
  });

  lucide.createIcons();
}

// ==========================================
// VALIDADE DA PROPOSTA — 72h from created_at
// ==========================================
function startCountdown(createdAt) {
  const expiryDate   = propostaValidade(createdAt);
  const banner       = document.getElementById('urgency-banner');
  const expEl        = document.getElementById('expiry-date');

  if (expEl) {
    expEl.innerText = expiryDate.toLocaleDateString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  if (banner) banner.classList.remove('hidden');
}

// ==========================================
// CAMPANHA — selo da promoção (Configurações › Campanhas na plataforma)
// Faixa (A) ou cartão na identidade (B), na cor escolhida; contagem até o
// fim; "últimas horas" nas últimas 24 h; depois do fim, "condição encerrada"
// e o preço apagado. Efeito: partícula na borda (escuro) ou brilho (claro).
// ==========================================
const CAMPANHA_CORES = {
  preto:   { c: '#141210', c2: '#1D1A16', ink: '#fff',    ac: '#FAA519', acink: '#2A1A00', tile: 'rgba(255,255,255,.08)', tileb: '#FFF3DC', brd: '#FAA519', part: '#FAA519' },
  azul:    { c: '#0072AA', c2: '#008FD4', ink: '#fff',    ac: '#FAA519', acink: '#2A1A00', tile: 'rgba(255,255,255,.14)', tileb: '#E5F3FB', brd: '#008FD4', part: '#FFD58A' },
  laranja: { c: '#F59B0B', c2: '#FAA519', ink: '#2A1A00', ac: '#2A1A00', acink: '#FAA519', tile: 'rgba(0,0,0,.09)',       tileb: '#FFF3DC', brd: '#FAA519', part: '#FFFFFF' },
  verde:   { c: '#127A51', c2: '#1FA971', ink: '#fff',    ac: '#FFE08A', acink: '#0B3D28', tile: 'rgba(255,255,255,.14)', tileb: '#E3F6EE', brd: '#1FA971', part: '#FFE08A' },
};

function renderCampanha(c, waLink) {
  const box = document.getElementById('camp-selo');
  if (!box || !c || !c.fim) return;
  const fimMs = new Date(c.fim).getTime();
  if (!Number.isFinite(fimMs)) return;
  const cor = CAMPANHA_CORES[c.cor] ? c.cor : 'preto';
  const k = CAMPANHA_CORES[cor];
  // variáveis no body: o selo, a etiqueta do kit e a fita do preço usam as mesmas
  const body = document.body;
  body.dataset.campCor = cor;
  [['c', k.c], ['c2', k.c2], ['ink', k.ink], ['ac', k.ac], ['acink', k.acink], ['tile', k.tile], ['tileb', k.tileb], ['brd', k.brd], ['part', k.part]]
    .forEach(([n, v]) => body.style.setProperty('--cp-' + n, v));

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const dois = (n) => String(n).padStart(2, '0');
  const d = new Date(fimMs);
  const fimTxt = `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} às ${dois(d.getHours())}h${dois(d.getMinutes())}`;
  const visualB = c.visual === 'b';
  const etiqueta = esc(c.etiqueta || 'OFERTA');

  // chave "Proposta inteira no tema" (só na cor Preto): página preta, laranja nos detalhes, capa com a etiqueta
  const tema = cor === 'preto' && c.tema_proposta === true;
  if (tema) {
    const html = document.documentElement;
    html.classList.add('cp-tema', 'dark');
    const topo = document.querySelector('.topo');
    if (topo && !topo.querySelector('.cp-capa-txt')) {
      const capa = document.createElement('div');
      capa.className = 'cp-capa-txt';
      capa.setAttribute('aria-hidden', 'true');
      capa.textContent = String(c.etiqueta || 'OFERTA').toUpperCase();
      // a etiqueta ocupa a largura da capa: 27% p/ 5 letras, menor se for mais comprida
      topo.style.setProperty('--cp-capa-fs', String(Math.min(27, 135 / Math.max(1, capa.textContent.length))));
      topo.appendChild(capa); // embaixo do botão do PDF, dentro do fluxo da capa
    }
    const olho = document.getElementById('topo-olho');
    if (olho) olho.innerHTML = `<span class="cp-olho"><i></i>Proposta ${esc(c.nome || `${c.etiqueta || ''} Ágil Solar`)}</span>`;
    if (typeof renderGeracaoWeb === 'function') renderGeracaoWeb();
  }

  // etiqueta ao lado da marca do kit
  const brand = document.getElementById('kit-brand-wrapper');
  if (brand && !document.getElementById('camp-chip')) brand.insertAdjacentHTML('afterend', `<span id="camp-chip" class="cp-chip">${etiqueta}</span>`);

  // fita no preço + aviso quando acaba
  const badge = document.getElementById('badge-discount');
  const priceEl = document.getElementById('kit-price');
  const priceBox = priceEl ? priceEl.closest('.rounded-2xl') : null;
  if (priceEl && !document.getElementById('camp-aviso-preco')) {
    priceEl.insertAdjacentHTML('afterend', `<p id="camp-aviso-preco" class="cp-aviso-preco" style="display:none"><i data-lucide="info" class="w-4 h-4"></i>Este valor era da condição ${etiqueta} e não vale mais.</p>`);
  }

  let estado = '';
  let ultTxt = [];
  function pintar() {
    const resta = fimMs - Date.now();
    const fim = resta <= 0;
    const ult = !fim && resta < 24 * 3600 * 1000;
    const novo = fim ? 'fim' : ult ? 'ult' : 'prazo';
    if (novo !== estado) {
      estado = novo;
      ultTxt = [];
      const txt = fim ? `Condição encerrada em <b>${fimTxt}</b>`
        : ult ? `Termina <b>${d.toDateString() === new Date().toDateString() ? 'hoje' : 'amanhã'} às ${dois(d.getHours())}h${dois(d.getMinutes())}</b>`
        : `${visualB ? 'Válida até' : 'Condição especial válida até'} <b>${fimTxt}</b>`;
      const marca = visualB
        ? `<div class="cp-marca"><span class="cp-tag">${etiqueta}</span><span class="cp-sub">${esc(c.nome || '')}</span></div>`
        : `<div class="cp-marca"><span class="cp-tag">${etiqueta}</span><span class="cp-sub">${esc(c.subtitulo || '')}</span></div>`;
      let dir = '';
      if (fim) {
        dir = `<div class="cp-fim"><p>Esta condição terminou. Fale com o seu consultor para receber os valores atualizados.</p>${waLink ? `<a href="${esc(waLink)}" target="_blank" rel="noopener noreferrer"><i data-lucide="message-circle" class="w-4 h-4"></i>Falar com o consultor</a>` : ''}</div>`;
      } else if (c.contagem !== false) {
        const dias = Math.floor(resta / 86400000);
        const rot = (dias > 0 ? ['dias'] : []).concat(['horas', 'min', 'seg']);
        dir = `${ult ? '<div class="cp-ultimas">Últimas horas</div>' : ''}<div class="cp-cd">${rot.map((l) => `<div class="u"><span class="n"></span><span class="l">${l}</span></div>`).join('')}</div>`;
      }
      box.innerHTML = `<div class="cp-selo ${visualB ? 'b' : 'a'}${fim ? ' fim' : ''}${ult ? ' ult' : ''}"><div>${marca}<p class="cp-txt">${txt}</p></div>${dir ? `<div>${dir}</div>` : ''}</div>`;
      box.classList.remove('hidden');
      box.classList.toggle('sem', c.efeito === false);
      box.classList.toggle('fim', fim);
      const capaTxt = document.querySelector('.cp-capa-txt');
      if (capaTxt) capaTxt.classList.toggle('parado', fim);

      if (badge) {
        if (c.fita !== false) {
          badge.textContent = fim ? 'ENCERRADA' : `PREÇO ${String(c.etiqueta || '').toUpperCase()}`;
          badge.classList.add('cp-fita');
          badge.classList.toggle('fim', fim);
          badge.classList.remove('hidden');
        } else if (fim) {
          badge.classList.add('hidden');
        }
      }
      if (priceBox) priceBox.classList.toggle('cp-preco-fim', fim);
      const aviso = document.getElementById('camp-aviso-preco');
      if (aviso) aviso.style.display = fim ? '' : 'none';
      if (window.lucide) lucide.createIcons();
    }
    if (!fim && c.contagem !== false) {
      const s = Math.floor(resta / 1000);
      const v = [Math.floor(s / 86400), Math.floor(s % 86400 / 3600), Math.floor(s % 3600 / 60), s % 60];
      if (v[0] === 0 && box.querySelectorAll('.cp-cd .n').length === 3) v.shift();
      box.querySelectorAll('.cp-cd .n').forEach((n, i) => {
        const t = dois(v[i]);
        if (ultTxt[i] !== t) { n.textContent = t; n.classList.remove('vira'); void n.offsetWidth; n.classList.add('vira'); ultTxt[i] = t; }
      });
    }
    return fim;
  }
  if (!pintar()) {
    const timer = setInterval(() => { if (pintar()) clearInterval(timer); }, 1000);
  }
}

// ==========================================
// CARROSSEL DE VÍDEOS
// ==========================================
let videoAtual = 0;
const playerContainer = document.getElementById('video-wrapper');
const dotsContainer   = document.getElementById('video-dots');

VIDEOS_YOUTUBE.forEach((link, index) => {
  const finalUrl = link + (link.includes('?') ? '&' : '?') + 'enablejsapi=1';
  const iframe   = document.createElement('iframe');
  iframe.className = `absolute top-0 left-0 w-full h-full transition-opacity duration-500 ease-in-out ${index === 0 ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`;
  iframe.src       = finalUrl;
  iframe.title     = `YouTube video player ${index + 1}`;
  iframe.setAttribute('frameborder', '0');
  iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture');
  iframe.setAttribute('allowfullscreen', '');
  iframe.id = `yt-iframe-${index}`;
  playerContainer.appendChild(iframe);
});

function atualizarCarrossel() {
  VIDEOS_YOUTUBE.forEach((_, index) => {
    const iframe = document.getElementById(`yt-iframe-${index}`);
    if (index === videoAtual) {
      iframe.classList.remove('opacity-0', 'z-0', 'pointer-events-none');
      iframe.classList.add('opacity-100', 'z-10');
    } else {
      iframe.classList.remove('opacity-100', 'z-10');
      iframe.classList.add('opacity-0', 'z-0', 'pointer-events-none');
      if (iframe.contentWindow) {
        iframe.contentWindow.postMessage('{"event":"command","func":"pauseVideo","args":""}', 'https://www.youtube.com');
      }
    }
  });

  dotsContainer.innerHTML = '';
  VIDEOS_YOUTUBE.forEach((_, index) => {
    const dot      = document.createElement('button');
    const isActive = index === videoAtual;
    dot.className  = `h-2.5 rounded-full transition-all duration-300 ${isActive ? 'bg-azul w-8' : 'bg-linha hover:bg-azul-medio w-2.5'}`;
    dot.onclick = () => { videoAtual = index; atualizarCarrossel(); };
    dotsContainer.appendChild(dot);
  });
}

document.getElementById('btn-prev-vid').addEventListener('click', () => {
  videoAtual = (videoAtual - 1 + VIDEOS_YOUTUBE.length) % VIDEOS_YOUTUBE.length;
  atualizarCarrossel();
});

document.getElementById('btn-next-vid').addEventListener('click', () => {
  videoAtual = (videoAtual + 1) % VIDEOS_YOUTUBE.length;
  atualizarCarrossel();
});

atualizarCarrossel();

// ==========================================
// MODAL DE PARCELAMENTO
// ==========================================
const modalParcelamento   = document.getElementById('modal-parcelamento');
const btnShowInstallments = document.getElementById('btn-show-installments');
const btnCloseModal       = document.getElementById('btn-close-modal');

function openModal() {
  modalParcelamento.classList.remove('hidden');
  modalParcelamento.classList.add('flex');
  document.body.classList.add('overflow-hidden');
}

function closeModal() {
  modalParcelamento.classList.add('hidden');
  modalParcelamento.classList.remove('flex');
  document.body.classList.remove('overflow-hidden');
}

btnShowInstallments.addEventListener('click', openModal);
btnCloseModal.addEventListener('click', closeModal);
modalParcelamento.addEventListener('click', (e) => {
  if (e.target === modalParcelamento) closeModal();
});

function gerarOpcoesParcelamento(valorBase, taxasCartao) {
  const formatter             = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const installmentsContainer = document.getElementById('installments-list');
  installmentsContainer.innerHTML = '';

  propostaParcelasCartao(valorBase, taxasCartao).forEach(({ n, parcela }) => {
    const row       = document.createElement('div');
    row.className   = 'flex justify-center items-center p-3 rounded-xl border border-linha bg-fundo';
    row.innerHTML   = `<span class="text-tinta font-bold text-sm md:text-base"><span class="text-azul-txt font-extrabold">${n}x</span> de ${formatter.format(parcela)}</span>`;
    installmentsContainer.appendChild(row);
  });
}

// ==========================================
// CARREGAR E RENDERIZAR PROPOSTA
// ==========================================
const urlParams  = new URLSearchParams(window.location.search);
// Link curto /p/<codigo> (rewrite do vercel.json pra esta página): o código é
// trocado pelo id no carregamento. Links antigos ?id=<uuid> seguem valendo.
const codigoCurto = (window.location.pathname.match(/^\/p\/([A-Za-z0-9]{6,32})\/?$/) || [])[1] || null;
let propostaId = urlParams.get('id');

function isValidProposalId(value) {
  const raw = String(value || '').trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw);
}

async function carregarProposta() {
  if (!propostaId && codigoCurto) {
    try {
      const { data: idDoCodigo } = await supabaseClient.rpc('proposta_por_codigo', { p_codigo: codigoCurto });
      propostaId = idDoCodigo || null;
    } catch (_) { propostaId = null; }
  }
  if (!propostaId || !isValidProposalId(propostaId)) { showError(); return; }
  try {
    const { data, error } = await supabaseClient
      .rpc('get_public_proposta', { p_id: propostaId })
      .single();

    if (error || !data) { showError(); return; }

    renderData(data);
    // Registra a visualização na própria proposta (status VISTA + contador) —
    // é isso que avisa o vendedor na aba Propostas. Fire-and-forget: falha
    // aqui não pode atrapalhar o cliente vendo a proposta.
    supabaseClient.rpc('registrar_proposta_view', { p_id: propostaId }).then(({ error: viewErr }) => {
      if (viewErr) console.warn('[proposta] Falha ao registrar visualização.', viewErr);
    });
    if (typeof captureEvent === 'function') {
      captureEvent('public_proposal_viewed', { source: 'public_page' });
    }
    gerarOpcoesParcelamento(calcularNumerosProposta(data).preco, data.cartao_taxas);
  } catch (err) {
    showError();
  }
}

// Valores do gráfico de geração — guardados para redesenhar ao trocar tema/largura.
let _geracaoMensalValores = null;

function renderGeracaoWeb() {
  const el = document.getElementById('gen-chart');
  if (!el || !_geracaoMensalValores) return;
  const isLight  = !document.documentElement.classList.contains('dark');
  const black    = document.documentElement.classList.contains('cp-tema');
  const compacto = el.clientWidth > 0 && el.clientWidth < 520;
  const chave    = (black ? 'b' : isLight ? 'l' : 'd') + (compacto ? 'c' : 'w');
  if (el.dataset.render === chave) return;
  el.dataset.render = chave;
  el.innerHTML = renderGeracaoChartSVG(_geracaoMensalValores, { tema: black ? 'black' : isLight ? 'marca' : 'marca-escuro', compacto });
}

function renderData(data) {
  const formatter    = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

  // Todos os números vêm do proposta-calc.js (o PDF usa o mesmo cálculo).
  const num              = calcularNumerosProposta(data);
  const isCustomMode     = num.personalizada;
  const displayPrice     = num.preco;
  const displayPower     = num.potencia;
  const displayName      = num.nome;
  const displayBrand     = num.marca;
  const estGeneration    = num.geracao;
  const valorFaturaIdeal = num.faturaIdeal;
  const economiaMensal   = num.economiaMensal;
  const economiaAnual    = num.economiaAnual;
  const economia25Anos   = num.economia25Anos;
  const arvoresPlantadas = num.arvores;
  const textoPayback     = num.payback;

  const primeiroNomeBruto   = (data.cliente_nome || 'Cliente').trim().split(' ')[0] || 'Cliente';
  const clientePrimeiroNome = primeiroNomeBruto.charAt(0).toUpperCase() + primeiroNomeBruto.slice(1).toLowerCase();

  document.getElementById('client-name').innerText    = clientePrimeiroNome;
  document.getElementById('kit-brand').innerText      = displayBrand;
  const brandWrapper = document.getElementById('kit-brand-wrapper');
  if (isCustomMode && brandWrapper) brandWrapper.classList.add('hidden');
  document.getElementById('kit-name').innerText       = displayName;
  // Kit do catálogo com outro telhado: a estrutura escolhida aparece embaixo do nome.
  if (data.estrutura_nome) {
    const linhaEst = { standard: 'Standard', flex: 'Flex', smart: 'Smart' }[data.estrutura_linha] || '';
    const est = document.createElement('p');
    est.id = 'kit-estrutura';
    est.className = 'text-suave text-xs font-semibold -mt-4 mb-6';
    est.textContent = 'Estrutura: ' + data.estrutura_nome + (linhaEst ? ' · ' + linhaEst : '');
    document.getElementById('kit-estrutura')?.remove();
    document.getElementById('kit-name').insertAdjacentElement('afterend', est);
  }

  // Para EQUIPAMENTOS: oculta potência e geração apenas se não houver dados de sistema
  const powerGenGrid = document.querySelector('#kit-power')?.closest('.grid');
  const idealBillRow = document.querySelector('#kit-ideal-bill')?.closest('.linha-fatura');
  if (isCustomMode && displayPower <= 0) {
    if (powerGenGrid) powerGenGrid.classList.add('hidden');
    if (idealBillRow) idealBillRow.classList.add('hidden');
  } else {
    document.getElementById('kit-power').innerText      = displayPower + ' kWp';
    document.getElementById('kit-generation').innerText = estGeneration.toFixed(0) + ' kWh/mês';
    if (idealBillRow) document.getElementById('kit-ideal-bill').innerText = formatter.format(valorFaturaIdeal);
  }

  const listPriceEl = document.getElementById('kit-list-price');
  if (isCustomMode) {
    if (listPriceEl) listPriceEl.classList.add('hidden');
  } else {
    if (listPriceEl) listPriceEl.innerText = 'De: ' + formatter.format(data.kit_list_price || displayPrice);
  }

  const badgeDiscountEl = document.getElementById('badge-discount');
  if (badgeDiscountEl) {
    const hasDiscount = !isCustomMode && data.kit_list_price && data.kit_list_price > displayPrice;
    if (hasDiscount) badgeDiscountEl.classList.remove('hidden');
  }

  const priceParts = formatter.format(displayPrice).split(',');
  document.getElementById('kit-price').innerHTML = `
    <span class="text-xl align-top opacity-80 mr-1">R$</span>${priceParts[0].replace('R$', '').trim()}<span class="text-xl align-top opacity-80">,${priceParts[1]}</span>
  `;

  // Oculta seção ambiental e de economia/ROI para EQUIPAMENTOS sem dados de potência
  const ecoSection = document.querySelector('#eco-month')?.closest('.card');
  const envSection = document.querySelector('#env-trees')?.closest('.flex.flex-col.md\\:flex-row');
  if (isCustomMode && estGeneration <= 0) {
    if (ecoSection) ecoSection.classList.add('hidden');
    if (envSection) envSection.classList.add('hidden');
  } else {
    document.getElementById('eco-month').innerText    = formatter.format(economiaMensal);
    document.getElementById('eco-year').innerText     = formatter.format(economiaAnual);
    document.getElementById('eco-25years').innerText  = formatter.format(economia25Anos);
    document.getElementById('env-trees').innerText    = '+' + arvoresPlantadas;
    document.getElementById('eco-payback').innerText  = textoPayback;
  }

  // --- Geração mês a mês (HSP mensal da cidade do cliente; fallback sazonal) ---
  if (estGeneration > 0 && typeof calcularGeracaoMensal === 'function') {
    const mensal = calcularGeracaoMensal(estGeneration, data.cidade_hsp_mensal, data.cidade_hsp_anual);
    const resumo = resumoGeracaoMensal(mensal.valores);
    const fmtInt = (n) => Math.round(n).toLocaleString('pt-BR');
    document.getElementById('gen-avg').innerText        = fmtInt(resumo.media);
    document.getElementById('gen-total').innerText      = fmtInt(resumo.total);
    document.getElementById('gen-peak').innerText       = fmtInt(resumo.picoValor);
    document.getElementById('gen-peak-month').innerText = resumo.picoMes.slice(0, 3);
    document.getElementById('gen-source').innerText = mensal.fonte === 'cidade'
      ? `Estimativa com a irradiação solar histórica de ${formatarCidadeUF(data.cliente_cidade)} (NASA). No verão o sistema gera mais; no inverno, um pouco menos — a economia se equilibra ao longo do ano.`
      : 'Estimativa com a variação solar típica da região. No verão o sistema gera mais; no inverno, um pouco menos — a economia se equilibra ao longo do ano.';
    _geracaoMensalValores = mensal.valores;
    renderGeracaoWeb();
    window.addEventListener('resize', renderGeracaoWeb);
    document.getElementById('generation-section').classList.remove('hidden');
  }

  const pdfBtn = document.getElementById('btn-download-pdf');
  if (pdfBtn) {
    pdfBtn.href = '/proposta-pdf.html?id=' + encodeURIComponent(propostaId);
    pdfBtn.classList.remove('hidden');
    pdfBtn.addEventListener('click', () => {
      if (typeof captureEvent === 'function') captureEvent('public_proposal_pdf_clicked', {});
    });
  }

  // --- Urgency countdown ---
  // Proposta de campanha com validade até o fim dela: o selo da campanha substitui as 72 h.
  const campanhaValeAteFim = Boolean(data.campanha && data.campanha.validade_fim);
  if (data.created_at && !campanhaValeAteFim) startCountdown(data.created_at);

  // --- WhatsApp CTA links ---
  // Usa apenas vendedor_nome — vendedor_email não deve ser retornado pela RPC pública
  const vendorNome = data.vendedor_nome || 'Consultor';
  const vendorTel  = data.vendedor_telefone || '';
  const waMsg      = encodeURIComponent(
    `Olá ${vendorNome.split(' ')[0]}! Vi a proposta "${displayName}" (${formatter.format(displayPrice)}) e quero saber mais. Pode me ajudar? Meu nome é ${clientePrimeiroNome}.`
  );
  // Se não houver telefone, não gera link inválido: oculta os CTAs
  const waLink = vendorTel
    ? `https://wa.me/55${vendorTel.replace(/\D/g, '')}?text=${waMsg}`
    : null;

  const finalCta    = document.getElementById('final-cta-btn');
  const finalCtaRow = document.getElementById('final-cta-row');
  const floatWa     = document.getElementById('floating-whatsapp');
  const vendorWaBtn = document.getElementById('vendor-whatsapp-btn');
  if (waLink) {
    if (finalCta)    finalCta.href    = waLink;
    if (floatWa)     floatWa.href     = waLink;
    if (vendorWaBtn) vendorWaBtn.href = waLink;
  } else {
    // Sem telefone: oculta botões de contato para não deixar href vazio ou apontando para '#'
    if (finalCtaRow) finalCtaRow.style.display = 'none';
    if (vendorWaBtn) vendorWaBtn.style.display = 'none';
  }

  // --- Vendor card ---
  const vendorCard     = document.getElementById('vendor-card');
  const vendorAvatarEl = document.getElementById('vendor-avatar');
  const vendorNameEl   = document.getElementById('vendor-name');
  if (vendorAvatarEl) vendorAvatarEl.innerText = vendorNome.charAt(0).toUpperCase();
  if (vendorNameEl)   vendorNameEl.innerText   = vendorNome;
  if (vendorCard)     vendorCard.classList.remove('hidden');

  // --- Custom notes for PERSONALIZADA and EQUIPAMENTOS ---
  const payNoteRow  = document.getElementById('custom-payment-note-row');
  const payNoteText = document.getElementById('custom-payment-note-text');
  if (isCustomMode && data.custom_payment_note && payNoteRow && payNoteText) {
    payNoteText.innerText = data.custom_payment_note;
    payNoteRow.classList.remove('hidden');
  }
  const comNoteRow  = document.getElementById('custom-commercial-note-row');
  const comNoteText = document.getElementById('custom-commercial-note-text');
  if (isCustomMode && data.custom_commercial_note && comNoteRow && comNoteText) {
    comNoteText.innerText = data.custom_commercial_note;
    comNoteRow.classList.remove('hidden');
  }

  // --- Campanha (selo, contagem, fita no preço) ---
  // vale também na Personalizada: o admin pode pôr a campanha nela pela ficha (crm.js)
  if (data.campanha) renderCampanha(data.campanha, waLink);

  // --- Show floating CTA (só se houver telefone do consultor) ---
  const floatingDiv = document.getElementById('floating-cta');
  if (floatingDiv && waLink) {
    floatingDiv.classList.remove('hidden');
    lucide.createIcons();
  }

  document.getElementById('loading').classList.add('hidden');
  document.getElementById('proposal-content').classList.remove('hidden');
  // Só agora o gráfico tem largura real para escolher a versão compacta.
  renderGeracaoWeb();
}

function showError() {
  document.getElementById('loading').classList.add('hidden');
  document.getElementById('error-state').classList.remove('hidden');
  document.getElementById('error-state').classList.add('flex');
}

carregarProposta();
initProposalQuickActions();


