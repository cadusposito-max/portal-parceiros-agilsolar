// ==========================================
// LÓGICA DA PÁGINA DE PROPOSTA (proposta.html)
// ==========================================

const VIDEOS_YOUTUBE = [
  'https://www.youtube.com/embed/a-3d90O2u60?si=3F89_VFQmDptzcxp',
  'https://www.youtube.com/embed/YvyIMNlm0q8?si=hJw5gToEMUEYU2LQ',
  'https://www.youtube.com/embed/SOotdCvJAkc?si=KHc78sgr9qrvwHDp'
];

const TAXAS_CARTAO = {
  1: 2.99,  2: 4.09,  3: 4.78,  4: 5.47,  5: 6.14,  6: 6.81,
  7: 7.67,  8: 8.33,  9: 8.98, 10: 9.63, 11: 10.26, 12: 10.90,
  13: 12.32,14: 12.94,15: 13.56,16: 14.17,17: 14.77, 18: 15.37
};
const MAX_PARCELAS = 18;

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
    window.location.href = 'index.html';
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
  const EXPIRY_HOURS = 72;
  const expiryDate   = new Date(new Date(createdAt).getTime() + EXPIRY_HOURS * 3_600_000);
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
    dot.className  = `h-2.5 rounded-full transition-all duration-300 ${isActive ? 'bg-orange-500 w-8' : 'bg-neutral-600 hover:bg-neutral-400 w-2.5'}`;
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

function gerarOpcoesParcelamento(valorBase) {
  const formatter             = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const installmentsContainer = document.getElementById('installments-list');
  installmentsContainer.innerHTML = '';

  for (let i = 1; i <= MAX_PARCELAS; i++) {
    const taxa               = TAXAS_CARTAO[i] || 0;
    const valorTotalComRepasse= valorBase / (1 - (taxa / 100));
    const valorParcela       = valorTotalComRepasse / i;

    const row       = document.createElement('div');
    row.className   = 'flex justify-center items-center p-3 rounded-lg border border-neutral-800 bg-black/40 hover:bg-neutral-800/80 transition-colors';
    row.innerHTML   = `<span class="text-white font-bold text-sm md:text-base">${i}x de ${formatter.format(valorParcela)}</span>`;
    installmentsContainer.appendChild(row);
  }
}

// ==========================================
// CARREGAR E RENDERIZAR PROPOSTA
// ==========================================
const urlParams  = new URLSearchParams(window.location.search);
const propostaId = urlParams.get('id');

function isValidProposalId(value) {
  const raw = String(value || '').trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw);
}

async function carregarProposta() {
  if (!propostaId || !isValidProposalId(propostaId)) { showError(); return; }
  try {
    const { data, error } = await supabaseClient
      .rpc('get_public_proposta', { p_id: propostaId })
      .single();

    if (error || !data) { showError(); return; }

    renderData(data);
    if (typeof captureEvent === 'function') {
      captureEvent('public_proposal_viewed', { source: 'public_page' });
    }
    const priceForParcelas = (data.proposal_mode === 'PERSONALIZADA' || data.proposal_mode === 'EQUIPAMENTOS')
      ? (data.custom_total_price || data.kit_price || 0)
      : (data.kit_price || 0);
    gerarOpcoesParcelamento(priceForParcelas);
  } catch (err) {
    showError();
  }
}

function renderData(data) {
  const formatter    = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const TARIFA_MEDIA = 0.95;

  const isPersonalizada = data.proposal_mode === 'PERSONALIZADA';
  const isEquipamentos  = data.proposal_mode === 'EQUIPAMENTOS';
  const isCustomMode    = isPersonalizada || isEquipamentos;
  const displayPrice = isCustomMode ? (data.custom_total_price || data.kit_price || 0) : (data.kit_price || 0);
  const displayPower = isCustomMode ? (data.custom_system_power_kwp || data.kit_power || 0) : (data.kit_power || 0);
  const displayName  = isCustomMode ? (data.kit_nome || 'Proposta Personalizada') : (data.kit_nome || '');
  const displayBrand = isCustomMode ? '' : (data.kit_brand || '');

  // Geração: usa valor salvo no banco (imutável, calculado com HSP da franquia na criação)
  // Fallback para propostas antigas sem geracao_estimada salva
  const estGeneration = data.geracao_estimada
    ? Number(data.geracao_estimada)
    : calcularGeracaoEstimada(displayPower);

  const valorFaturaIdeal = estGeneration * TARIFA_MEDIA;
  const economiaMensal   = valorFaturaIdeal * 0.85;
  const economiaAnual    = economiaMensal * 12;
  const economia25Anos   = economiaAnual * 25;
  const contaPosSistema  = Math.max(0, valorFaturaIdeal - economiaMensal);
  const arvoresPlantadas = Math.round(displayPower * 3);

  const mesesTotaisPayback= economiaMensal > 0 ? Math.ceil(displayPrice / economiaMensal) : 0;
  const anosPayback       = Math.floor(mesesTotaisPayback / 12);
  const mesesRestantes    = mesesTotaisPayback % 12;

  let textoPayback = '';
  if (anosPayback > 0)                    textoPayback += `${anosPayback} ano${anosPayback > 1 ? 's' : ''}`;
  if (anosPayback > 0 && mesesRestantes > 0) textoPayback += ' e ';
  if (mesesRestantes > 0)                 textoPayback += `${mesesRestantes} ${mesesRestantes > 1 ? 'meses' : 'mês'}`;
  if (textoPayback === '')                textoPayback = 'Menos de 1 mês';

  const taxa18x = TAXAS_CARTAO[MAX_PARCELAS] || 0;
  const totalCartao18x = displayPrice > 0 ? displayPrice / (1 - (taxa18x / 100)) : 0;
  const parcela18x = totalCartao18x > 0 ? totalCartao18x / MAX_PARCELAS : 0;
  const melhorPagamento = parcela18x > 0
    ? `${MAX_PARCELAS}x de ${formatter.format(parcela18x)}`
    : `Ate ${MAX_PARCELAS}x no cartao`;

  const clientePrimeiroNome = (data.cliente_nome || 'Cliente').trim().split(' ')[0] || 'Cliente';
  const heroSystemMeta = (displayPower > 0 && estGeneration > 0)
    ? `${displayPower} kWp - ${estGeneration.toFixed(0)} kWh/mes estimados`
    : 'Projeto tecnico sob medida para seu perfil';

  document.getElementById('client-name').innerText    = clientePrimeiroNome;
  document.getElementById('kit-brand').innerText      = displayBrand;
  const brandWrapper = document.getElementById('kit-brand-wrapper');
  if (isCustomMode && brandWrapper) brandWrapper.classList.add('hidden');
  document.getElementById('kit-name').innerText       = displayName;

  const heroInvestmentEl = document.getElementById('hero-investment');
  const heroEconomyEl = document.getElementById('hero-economy-month');
  const heroPaymentEl = document.getElementById('hero-best-payment');
  const heroPaybackEl = document.getElementById('hero-payback');
  const heroSystemNameEl = document.getElementById('hero-system-name');
  const heroSystemMetaEl = document.getElementById('hero-system-meta');
  if (heroInvestmentEl) heroInvestmentEl.innerText = formatter.format(displayPrice);
  if (heroEconomyEl) heroEconomyEl.innerText = formatter.format(economiaMensal);
  if (heroPaymentEl) heroPaymentEl.innerText = melhorPagamento;
  if (heroPaybackEl) heroPaybackEl.innerText = textoPayback;
  if (heroSystemNameEl) heroSystemNameEl.innerText = displayName;
  if (heroSystemMetaEl) heroSystemMetaEl.innerText = heroSystemMeta;

  // Para EQUIPAMENTOS: oculta potência e geração apenas se não houver dados de sistema
  const powerGenGrid = document.querySelector('#kit-power')?.closest('.grid');
  const idealBillRow = document.querySelector('#kit-ideal-bill')?.closest('.mb-8');
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
    <span class="text-xl align-top text-neutral-500 mr-1">R$</span>${priceParts[0].replace('R$', '').trim()}<span class="text-xl align-top text-neutral-500">,${priceParts[1]}</span>
  `;

  // Oculta seção ambiental e de economia/ROI para EQUIPAMENTOS sem dados de potência
  const ecoSection = document.querySelector('#eco-month')?.closest('.bg-neutral-900.border');
  const envSection = document.querySelector('#env-trees')?.closest('.flex.flex-col.md\\:flex-row');
  const ecoCurrentBillEl = document.getElementById('eco-current-bill');
  const ecoPostBillEl = document.getElementById('eco-post-bill');
  const paymentCardBestEl = document.getElementById('payment-card-best');
  if (isCustomMode && estGeneration <= 0) {
    if (ecoSection) ecoSection.classList.add('hidden');
    if (envSection) envSection.classList.add('hidden');
  } else {
    document.getElementById('eco-month').innerText    = formatter.format(economiaMensal);
    document.getElementById('eco-year').innerText     = formatter.format(economiaAnual);
    document.getElementById('eco-25years').innerText  = formatter.format(economia25Anos);
    document.getElementById('env-trees').innerText    = '+' + arvoresPlantadas;
    document.getElementById('eco-payback').innerText  = textoPayback;
    if (ecoCurrentBillEl) ecoCurrentBillEl.innerText = formatter.format(valorFaturaIdeal);
    if (ecoPostBillEl) ecoPostBillEl.innerText = formatter.format(contaPosSistema);

  }
  if (paymentCardBestEl) paymentCardBestEl.innerText = melhorPagamento;

  // --- Urgency countdown ---
  if (data.created_at) startCountdown(data.created_at);

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
  const heroCta     = document.getElementById('hero-cta-btn');
  const ecoCta      = document.getElementById('eco-cta-btn');
  const floatWa     = document.getElementById('floating-whatsapp');
  const vendorWaBtn = document.getElementById('vendor-whatsapp-btn');
  if (waLink) {
    if (finalCta)    finalCta.href    = waLink;
    if (heroCta)     heroCta.href     = waLink;
    if (ecoCta)      ecoCta.href      = waLink;
    if (floatWa)     floatWa.href     = waLink;
    if (vendorWaBtn) vendorWaBtn.href = waLink;
  } else {
    // Sem telefone: oculta botões de contato para não deixar href vazio ou apontando para '#'
    if (finalCta)    finalCta.style.display    = 'none';
    if (heroCta)     heroCta.style.display     = 'none';
    if (ecoCta)      ecoCta.style.display      = 'none';
    if (floatWa)     floatWa.style.display     = 'none';
    if (vendorWaBtn) vendorWaBtn.style.display = 'none';
  }

  // --- Vendor card ---
  const vendorCard     = document.getElementById('vendor-card');
  const vendorAvatarEl = document.getElementById('vendor-avatar');
  const vendorNameEl   = document.getElementById('vendor-name');
  if (vendorAvatarEl) vendorAvatarEl.innerText = vendorNome.charAt(0).toUpperCase();
  if (vendorNameEl)   vendorNameEl.innerText   = vendorNome.toUpperCase();
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

  // --- Show floating CTA ---
  const floatingDiv = document.getElementById('floating-cta');
  if (floatingDiv) {
    floatingDiv.classList.remove('hidden');
    lucide.createIcons();
  }

  document.getElementById('loading').classList.add('hidden');
  document.getElementById('proposal-content').classList.remove('hidden');
}

function showError() {
  document.getElementById('loading').classList.add('hidden');
  document.getElementById('error-state').classList.remove('hidden');
  document.getElementById('error-state').classList.add('flex');
}

carregarProposta();
initProposalQuickActions();


