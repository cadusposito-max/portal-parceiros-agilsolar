// ==========================================
// POPUP: CONSTRUTOR DE PROPOSTAS
// ==========================================

// Bancos de financiamento solar
const BANCOS_FINANCIAMENTO = [
  { nome: 'Solfacil',  url: 'https://app.solfacil.com.br',                                cor: 'from-orange-600 to-orange-500',  taxa: 'A partir de 0,79% a.m.', prazo: 'Ate 84 meses', icon: 'SF' },
  { nome: 'BV',        url: 'https://www.bv.com.br/para-voce/credito/financiamento-solar', cor: 'from-blue-700 to-blue-600',    taxa: 'A partir de 0,89% a.m.', prazo: 'Ate 60 meses', icon: 'BV' },
  { nome: 'Santander', url: 'https://www.santander.com.br/negocios/credito-garantido',      cor: 'from-red-700 to-red-600',      taxa: 'Consulte condicoes',      prazo: 'Ate 60 meses', icon: 'SA' },
  { nome: 'Sicoob',    url: 'https://www.sicoob.com.br/simuladores',                         cor: 'from-green-700 to-green-600',  taxa: 'Taxas cooperadas',        prazo: 'Ate 84 meses', icon: 'SC' },
  { nome: 'Sicredi',   url: 'https://www.sicredi.com.br/site/para-voce/credito/',            cor: 'from-emerald-700 to-emerald-600', taxa: 'Taxas cooperadas',      prazo: 'Ate 84 meses', icon: 'SI' },
  { nome: 'Losango',   url: 'https://www.losango.com.br',                                     cor: 'from-purple-700 to-purple-600', taxa: 'Consulte condicoes',     prazo: 'Ate 72 meses', icon: 'LO' }
];

const PB_PROPOSAL_MODES = {
  PROMOCIONAL:  'PROMOCIONAL',
  PERSONALIZADA: 'PERSONALIZADA',
  EQUIPAMENTOS: 'EQUIPAMENTOS'
};
function canUsePersonalizada() {
  return Boolean(state.isAdmin || state.isGestor);
}

function updatePBPersonalizadaRoleBadge() {
  const panel = document.getElementById('pb-equip-panel');
  if (!panel) return;

  const badge = document.getElementById('pb-personalizada-role-badge')
    || panel.querySelector('.border-b span.shrink-0');
  if (!badge) return;

  const label = document.getElementById('pb-personalizada-role-badge-label');
  if (label) {
    label.textContent = 'ADMIN/GESTOR';
    return;
  }

  const textNodes = Array.from(badge.childNodes).filter((node) => node.nodeType === Node.TEXT_NODE);
  if (textNodes.length > 0) {
    textNodes[textNodes.length - 1].textContent = ' ADMIN/GESTOR';
    return;
  }

  badge.appendChild(document.createTextNode(' ADMIN/GESTOR'));
}
const _pbSellerNameCache = new Map();
const _pbSellerPhoneCache = new Map();
const _pbSellerNamePending = new Map();
const _pbSellerPhonePending = new Map();

function _pbNormalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function _pbEmailPrefix(email) {
  const normalized = _pbNormalizeEmail(email);
  if (!normalized) return 'Consultor';
  const prefix = normalized.split('@')[0] || '';
  return prefix || 'Consultor';
}

function _pbCurrentUserName() {
  const meta = state.currentUser?.user_metadata || {};
  const profileName = String(state.profile?.nome || '').trim();
  const metaName = String(meta.full_name || meta.name || '').trim();
  return profileName || metaName || _pbEmailPrefix(state.currentUser?.email);
}

function _pbCurrentUserPhone() {
  const meta = state.currentUser?.user_metadata || {};
  return String(state.profile?.telefone || meta.phone || state.currentUser?.phone || '').trim();
}

async function _pbResolveSellerNameByEmail(email) {
  const normalizedEmail = _pbNormalizeEmail(email);
  if (!normalizedEmail) return 'Consultor';

  if (_pbSellerNameCache.has(normalizedEmail)) {
    return _pbSellerNameCache.get(normalizedEmail) || _pbEmailPrefix(normalizedEmail);
  }
  if (_pbSellerNamePending.has(normalizedEmail)) {
    return _pbSellerNamePending.get(normalizedEmail);
  }

  const pending = (async () => {
    const currentEmail = _pbNormalizeEmail(state.currentUser?.email);
    if (normalizedEmail === currentEmail) {
      const currentName = _pbCurrentUserName();
      _pbSellerNameCache.set(normalizedEmail, currentName);
      return currentName;
    }

    let resolvedName = '';
    try {
      const { data, error } = await supabaseClient.rpc('chat_list_directory', {
        p_search: normalizedEmail,
        p_limit: 80,
      });
      if (error) throw error;

      const rows = Array.isArray(data) ? data : [];
      const match = rows.find((row) => _pbNormalizeEmail(row?.email) === normalizedEmail);
      resolvedName = String(match?.nome || '').trim();
    } catch (err) {
      console.warn('[proposta-builder] Falha ao buscar nome do vendedor via chat_list_directory:', normalizedEmail, err);
    }

    if (!resolvedName) {
      resolvedName = _pbEmailPrefix(normalizedEmail);
      console.warn('[proposta-builder] Fallback de nome para vendedor:', normalizedEmail);
    }

    _pbSellerNameCache.set(normalizedEmail, resolvedName);
    return resolvedName;
  })().finally(() => {
    _pbSellerNamePending.delete(normalizedEmail);
  });

  _pbSellerNamePending.set(normalizedEmail, pending);
  return pending;
}

async function _pbResolveSellerPhoneByEmail(email) {
  const normalizedEmail = _pbNormalizeEmail(email);
  if (!normalizedEmail) return '';

  if (_pbSellerPhoneCache.has(normalizedEmail)) {
    return _pbSellerPhoneCache.get(normalizedEmail) || '';
  }
  if (_pbSellerPhonePending.has(normalizedEmail)) {
    return _pbSellerPhonePending.get(normalizedEmail);
  }

  const pending = (async () => {
    const currentEmail = _pbNormalizeEmail(state.currentUser?.email);
    if (normalizedEmail === currentEmail) {
      const currentPhone = _pbCurrentUserPhone();
      _pbSellerPhoneCache.set(normalizedEmail, currentPhone);
      return currentPhone;
    }

    let resolvedPhone = '';
    try {
      const { data, error } = await supabaseClient
        .from('propostas')
        .select('vendedor_telefone')
        .eq('vendedor_email', normalizedEmail)
        .not('vendedor_telefone', 'is', null)
        .neq('vendedor_telefone', '')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      resolvedPhone = String(data?.vendedor_telefone || '').trim();
    } catch (err) {
      console.warn('[proposta-builder] Falha ao buscar telefone do vendedor em propostas:', normalizedEmail, err);
    }

    _pbSellerPhoneCache.set(normalizedEmail, resolvedPhone);
    return resolvedPhone;
  })().finally(() => {
    _pbSellerPhonePending.delete(normalizedEmail);
  });

  _pbSellerPhonePending.set(normalizedEmail, pending);
  return pending;
}

function canOperateClientProposalFlow(client) {
  if (!client || !state.currentUser) return false;
  if (state.isAdmin || state.isGestor) return true;

  const currentEmail = _pbNormalizeEmail(state.currentUser.email);
  const ownerEmail = _pbNormalizeEmail(client.vendedor_email);

  if (!currentEmail) return false;
  if (!ownerEmail) return true;
  return ownerEmail === currentEmail;
}

async function resolveEffectiveSellerForClient(client) {
  const currentEmail = _pbNormalizeEmail(state.currentUser?.email);
  const ownerEmail = _pbNormalizeEmail(client?.vendedor_email);
  const canManageOthers = Boolean(state.isAdmin || state.isGestor);

  const sellerEmail = canManageOthers
    ? (ownerEmail || currentEmail)
    : currentEmail;

  if (!sellerEmail) {
    throw new Error('Nao foi possivel identificar o vendedor responsavel pelo cliente.');
  }
  if (!canManageOthers && ownerEmail && ownerEmail !== currentEmail) {
    throw new Error('Nao autorizado para operar cliente de outro vendedor.');
  }

  const [sellerName, sellerPhone] = await Promise.all([
    _pbResolveSellerNameByEmail(sellerEmail),
    _pbResolveSellerPhoneByEmail(sellerEmail),
  ]);

  return {
    vendedor_email: sellerEmail,
    vendedor_nome: sellerName || _pbEmailPrefix(sellerEmail),
    vendedor_telefone: sellerPhone || '',
  };
}

function getPBDefaultEquipDraft() {
  return {
    descricao:      '',
    valorEquip:     '',
    potencia:       '',
    paymentNote:    '',
    commercialNote: ''
  };
}

function resetPBEquipDraft() {
  state.pbEquipDraft = getPBDefaultEquipDraft();
}
// O construtor vive DENTRO da ficha CRM 360 (aba NOVA PROPOSTA): este wrapper
// só valida e abre a ficha na aba certa. Todos os call sites antigos (card do
// cliente, seletor "Nova Proposta", dashboard) continuam funcionando.
function openProposalBuilder(clientId) {
  const client = state.clientes.find(c => c.id === clientId);

  if (!client) {
    showToast('Cliente nao encontrado.');
    return;
  }
  if (!canOperateClientProposalFlow(client)) {
    showToast('Acesso restrito ao cliente selecionado.');
    return;
  }

  openCrm360(clientId, 'nova');
}

// Prepara o painel embutido (#pb-embedded-panel) para o cliente da ficha.
// Chamado pelo renderCrm360 depois de mover o painel para o slot da aba.
// Quando é o MESMO cliente, não reseta nada: o painel foi movido (não
// recriado), então busca, modo e lista renderizada continuam de pé.
function pbEmbedSetup(client) {
  if (!client) return;
  const mesmoCliente = state.pbActiveClient && state.pbActiveClient.id === client.id;
  state.pbActiveClient = client;
  if (mesmoCliente) return;

  state.pbCategory     = 'kitsInversor';
  state.pbSearch       = '';
  state.pbProposalMode = PB_PROPOSAL_MODES.PROMOCIONAL;
  resetPBEquipDraft();

  const searchEl = document.getElementById('pb-search');
  if (searchEl) searchEl.value = '';
  syncEquipInputsFromState();
  updatePBTabsUI();
  updatePBPersonalizadaRoleBadge();
  setPBProposalMode(PB_PROPOSAL_MODES.PROMOCIONAL); // atualiza modo + renderiza kits
}

// ==========================================
// SECAO: FINANCIAMENTO
// ==========================================
function renderFinanciamento() {
  const container = document.getElementById('pb-section-financiamento');
  if (!container) return;

  const cardsHTML = BANCOS_FINANCIAMENTO.map((b) => `
    <a href="${b.url}" target="_blank" rel="noopener noreferrer"
      class="metric-card shine-effect group block border border-neutral-800 hover:border-orange-500/30 p-5 transition-all duration-300 cursor-pointer">
      <div class="flex items-center gap-4 mb-4">
        <div class="w-12 h-12 rounded-full bg-gradient-to-br ${b.cor} flex items-center justify-center text-base font-black shadow-[0_0_12px_rgba(249,115,22,0.2)] shrink-0">
          ${escapeHTML(b.icon)}
        </div>
        <div class="min-w-0">
          <h3 class="text-white font-black text-base uppercase group-hover:text-orange-400 transition-colors leading-tight">${escapeHTML(b.nome)}</h3>
          <p class="text-[9px] text-neutral-500 font-bold uppercase tracking-widest mt-0.5">Financiamento Solar</p>
        </div>
        <i data-lucide="external-link" class="w-4 h-4 text-neutral-600 group-hover:text-orange-400 transition-colors ml-auto shrink-0"></i>
      </div>
      <div class="grid grid-cols-2 gap-2 border-t border-neutral-800 pt-3">
        <div>
          <p class="text-[9px] text-neutral-600 font-bold uppercase tracking-widest">Taxa</p>
          <p class="text-orange-400 font-black text-xs mt-0.5">${escapeHTML(b.taxa)}</p>
        </div>
        <div>
          <p class="text-[9px] text-neutral-600 font-bold uppercase tracking-widest">Prazo max.</p>
          <p class="text-yellow-400 font-black text-xs mt-0.5">${escapeHTML(b.prazo)}</p>
        </div>
      </div>
    </a>
  `).join('');

  container.innerHTML = `
    <div class="mb-6">
      <p class="text-orange-500 text-[10px] font-black uppercase tracking-[0.3em] flex items-center gap-2 mb-1">
        <i data-lucide="landmark" class="w-3.5 h-3.5"></i> BANCOS &amp; FINANCIADORAS
      </p>
      <h3 class="text-xl font-black text-white uppercase tracking-tighter">Opcoes de Financiamento Solar</h3>
      <p class="text-neutral-500 text-xs mt-1">Clique em qualquer banco para abrir o simulador direto no site. Taxas sujeitas a alteracao.</p>
    </div>
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      ${cardsHTML}
    </div>
    <div class="mt-6 p-4 bg-yellow-950/20 border border-yellow-900/30 flex items-start gap-3">
      <i data-lucide="info" class="w-4 h-4 text-yellow-500 shrink-0 mt-0.5"></i>
      <p class="text-yellow-500/80 text-xs leading-relaxed font-medium">
        <strong class="text-yellow-400 font-black">Dica:</strong> Solicite ao cliente a fatura de energia antes de simular - a maioria das financiadoras usa o valor da conta como base para aprovacao de credito.
      </p>
    </div>
  `;
  lucide.createIcons();
}

function setPBTab(category) {
  state.pbCategory = category;
  updatePBTabsUI();
  renderModalProducts();
}

function setPBViewMode(mode) {
  state.pbViewMode = mode;
  const btnGrid = document.getElementById('pb-btn-grid');
  const btnList = document.getElementById('pb-btn-list');
  if (mode === 'grid') {
    btnGrid.className = 'p-2.5 transition-all bg-orange-500 text-black';
    btnList.className = 'p-2.5 transition-all text-neutral-500 hover:text-white border-l border-neutral-800';
  } else {
    btnList.className = 'p-2.5 transition-all bg-orange-500 text-black';
    btnGrid.className = 'p-2.5 transition-all text-neutral-500 hover:text-white border-l border-neutral-800';
  }
  renderModalProducts();
}

function updatePBTabsUI() {
  const btnInv = document.getElementById('pb-tab-inversor');
  const btnMic = document.getElementById('pb-tab-micro');
  if (!btnInv || !btnMic) return;

  const BASE   = 'flex-1 px-4 py-2.5 text-[10px] font-black uppercase transition-all whitespace-nowrap';
  if (state.pbCategory === 'kitsInversor') {
    btnInv.className = BASE + ' bg-orange-500 text-black';
    btnMic.className = BASE + ' text-neutral-500 hover:text-white border-l border-neutral-800';
  } else {
    btnMic.className = BASE + ' bg-orange-500 text-black';
    btnInv.className = BASE + ' text-neutral-500 hover:text-white';
  }
}

function setPBProposalMode(mode) {
  const wantsPersonalizada = mode === PB_PROPOSAL_MODES.PERSONALIZADA || mode === PB_PROPOSAL_MODES.EQUIPAMENTOS;

  if (wantsPersonalizada && !canUsePersonalizada()) return;

  state.pbProposalMode = wantsPersonalizada
    ? PB_PROPOSAL_MODES.PERSONALIZADA
    : PB_PROPOSAL_MODES.PROMOCIONAL;

  if (state.pbProposalMode === PB_PROPOSAL_MODES.PERSONALIZADA) {
    syncEquipInputsFromState();
    updateEquipamentosPreview();
  }

  updatePBModeUI();

  if (state.pbProposalMode === PB_PROPOSAL_MODES.PROMOCIONAL) {
    renderModalProducts();
  }
}

function updatePBModeUI() {
  const mode            = state.pbProposalMode;
  const isPersonalizada = mode === PB_PROPOSAL_MODES.PERSONALIZADA || mode === PB_PROPOSAL_MODES.EQUIPAMENTOS;

  const btnPromo   = document.getElementById('pb-mode-promocional-btn');
  const btnCustom  = document.getElementById('pb-mode-personalizada-btn');
  const helperText = document.getElementById('pb-mode-helper');

  const promoToolbar      = document.getElementById('pb-promocional-toolbar');
  const equipPanel        = document.getElementById('pb-equip-panel');
  const productsContainer = document.getElementById('pb-products-container');
  const emptyEl           = document.getElementById('pb-empty');

  const INACTIVE = 'flex-1 sm:flex-none px-4 py-2.5 text-[10px] font-black uppercase transition-all text-neutral-500 hover:text-white whitespace-nowrap border-l border-neutral-800';
  const ACTIVE   = 'flex-1 sm:flex-none px-4 py-2.5 text-[10px] font-black uppercase transition-all bg-orange-500 text-black whitespace-nowrap';
  const ACTIVE_BL = ACTIVE + ' border-l border-neutral-800';

  if (btnPromo)  btnPromo.className  = (mode === 'PROMOCIONAL') ? ACTIVE : INACTIVE;
  if (btnCustom) {
    btnCustom.className = isPersonalizada ? ACTIVE_BL : INACTIVE;
    btnCustom.classList.toggle('hidden', !canUsePersonalizada());
  }

  if (helperText) {
    helperText.innerText = isPersonalizada
      ? 'Modo personalizada ativo. Informe valor e potencia do sistema para gerar a proposta.'
      : 'Promocional selecionado. Fluxo atual de kits prontos.';
  }

  const hidePromo = isPersonalizada;
  if (promoToolbar)      promoToolbar.classList.toggle('hidden', hidePromo);
  if (equipPanel)        equipPanel.classList.toggle('hidden', !isPersonalizada);
  if (productsContainer) productsContainer.classList.toggle('hidden', hidePromo);
  if (emptyEl && hidePromo) emptyEl.classList.add('hidden');

  updatePBPersonalizadaRoleBadge();
  lucide.createIcons();
}

function bindPBSearchInputEvent() {
  const debouncedPBSearchRender = debounce((rawValue) => {
    state.pbSearch = String(rawValue || '').trim().toLowerCase();
    renderModalProducts();
  }, 170);

  const pbSearchInput = document.getElementById('pb-search');
  if (pbSearchInput && !pbSearchInput.dataset.bound) {
    pbSearchInput.addEventListener('input', (e) => {
      debouncedPBSearchRender(e.target.value);
    });
    pbSearchInput.dataset.bound = '1';
  }
}

bindPBSearchInputEvent();
// ==========================================
// MODO: PERSONALIZADA (Admin/Gestor only)
// ==========================================

function syncEquipInputsFromState() {
  const d = state.pbEquipDraft || {};
  const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
  setVal('pb-equip-descricao',       d.descricao      || '');
  setVal('pb-equip-valor',           d.valorEquip     || '');
  setVal('pb-equip-potencia',        d.potencia       || '');
  setVal('pb-equip-payment-note',    d.paymentNote    || '');
  setVal('pb-equip-commercial-note', d.commercialNote || '');
  updateEquipamentosPreview();
}

function updateEquipamentosPreview() {
  const draft    = state.pbEquipDraft || {};
  const equip    = parseFloat(draft.valorEquip) || 0;
  const potencia = parseFloat(draft.potencia) || 0;
  const total    = equip;

  const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setTxt('pb-equip-preview-equip', equip > 0 ? formatCurrency(equip) : 'R$ —');
  setTxt('pb-equip-preview-total', total > 0 ? formatCurrency(total) : 'R$ —');

  const canSubmit = total > 0 && potencia > 0;
  const submitBtn = document.getElementById('pb-equip-submit');
  if (submitBtn) {
    submitBtn.disabled = !canSubmit;
    submitBtn.classList.toggle('opacity-50', !canSubmit);
    submitBtn.classList.toggle('cursor-not-allowed', !canSubmit);
  }
}

function bindEquipUIEvents() {
  const bindings = [
    ['pb-equip-descricao',       v => { state.pbEquipDraft.descricao      = v; }],
    ['pb-equip-valor',           v => { state.pbEquipDraft.valorEquip     = v; updateEquipamentosPreview(); }],
    ['pb-equip-potencia',        v => { state.pbEquipDraft.potencia       = v; updateEquipamentosPreview(); }],
    ['pb-equip-payment-note',    v => { state.pbEquipDraft.paymentNote    = v; }],
    ['pb-equip-commercial-note', v => { state.pbEquipDraft.commercialNote = v; }],
  ];
  bindings.forEach(([id, handler]) => {
    const el = document.getElementById(id);
    if (el && !el.dataset.bound) { el.addEventListener('input', e => handler(e.target.value)); el.dataset.bound = '1'; }
  });
  const form = document.getElementById('pb-equip-form');
  if (form && !form.dataset.bound) { form.addEventListener('submit', handleEquipamentosProposalSubmit); form.dataset.bound = '1'; }
}

async function handleEquipamentosProposalSubmit(event) {
  event.preventDefault();
  const draft    = state.pbEquipDraft || {};
  const equip    = parseFloat(draft.valorEquip) || 0;
  const potencia = parseFloat(draft.potencia) || 0;
  const total    = equip;

  if (total <= 0) {
    showToast('Informe o valor da proposta para gerar a proposta personalizada.');
    return;
  }
  if (potencia <= 0) {
    showToast('Informe a potencia do sistema (kWp) para gerar a proposta personalizada.');
    return;
  }

  const client = state.pbActiveClient;
  if (!client) return showToast('Nenhum cliente em atendimento!');

  if (!canUsePersonalizada()) {
    console.warn('[proposta-builder] Tentativa bloqueada de gerar proposta personalizada sem permissao (admin/gestor).');
    showToast('Apenas administrador ou gestor pode gerar proposta personalizada.');
    return;
  }

  const submitBtn    = document.getElementById('pb-equip-submit');
  const originalText = submitBtn ? submitBtn.innerHTML : '';
  if (submitBtn) {
    submitBtn.disabled  = true;
    submitBtn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin inline mr-1"></i> GERANDO...';
    lucide.createIcons();
  }

  const shouldUsePopup = !isStandaloneDisplayMode();
  const popupRef = shouldUsePopup ? window.open('', '_blank') : null;
  try {
    const seller    = await resolveEffectiveSellerForClient(client);
    const descricao = (draft.descricao || '').trim() || 'Proposta Personalizada';

    const { data, error } = await supabaseClient.from('propostas').insert([{
      proposal_mode:           'PERSONALIZADA',
      vendedor_email:          seller.vendedor_email,
      vendedor_nome:           seller.vendedor_nome,
      vendedor_telefone:       seller.vendedor_telefone,
      cliente_id:              client.id,
      cliente_nome:            client.nome,
      cliente_telefone:        client.telefone,
      cliente_cidade:          client.cidade,
      kit_nome:                descricao,
      kit_brand:               '',
      kit_power:               potencia,
      kit_price:               total,
      kit_list_price:          total,
      geracao_estimada:        calcularGeracaoEstimada(potencia, undefined, client.hsp),
      custom_system_power_kwp: potencia,
      custom_equipment_price:  equip,
      custom_service_price:    null,
      custom_total_price:      total,
      custom_payment_note:     draft.paymentNote    || null,
      custom_commercial_note:  draft.commercialNote || null,
      franquia_id:             state.franquiaId,
    }]).select();

    if (error) throw error;

    const baseUrl   = window.location.origin;
    const linkFinal = baseUrl + '/proposta.html?id=' + data[0].id;
    handleProposalLinkOpen(linkFinal, popupRef);

    if (!client.status || client.status === 'NOVO') await cycleClientStatus(client.id, 'NOVO');
    await fetchPropostas();
    if (typeof captureEvent === 'function') {
      captureEvent('proposal_created', { source: 'portal', mode: 'personalizada' });
    }

    if (submitBtn) {
      submitBtn.innerHTML = '<i data-lucide="check" class="w-4 h-4 inline mr-1"></i> GERADO E COPIADO!';
      submitBtn.classList.remove('btn-primary');
      submitBtn.classList.add('btn-success');
      lucide.createIcons();
      setTimeout(() => {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled  = false;
        submitBtn.classList.remove('btn-success');
        submitBtn.classList.add('btn-primary');
        lucide.createIcons();
      }, 3000);
    }
    showToast('PROPOSTA PERSONALIZADA GERADA E LINK COPIADO!');
    showProposalSharePanel(data[0].id, linkFinal);
  } catch (err) {
    console.error('Erro ao gerar proposta personalizada:', err);
    showToast('Erro ao gerar a proposta personalizada. Tente novamente.');
    if (popupRef) popupRef.close();
    if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = originalText; lucide.createIcons(); }
  }
}

bindEquipUIEvents();

function renderModalProducts() {
  const container = document.getElementById('pb-products-container');
  const emptyEl   = document.getElementById('pb-empty');

  if (!container || !emptyEl) return;

  if (state.pbProposalMode !== PB_PROPOSAL_MODES.PROMOCIONAL) {
    container.classList.add('hidden');
    emptyEl.classList.add('hidden');
    return;
  }

  // Kits fora de linha (ativo=false) não aparecem para o vendedor.
  let list = state.data.filter(k => k.categoria === state.pbCategory && k.ativo !== false);

  // HSP da cidade do cliente em atendimento: quando existe, a geração exibida
  // e usada na busca é recalculada com ele (senão vale o _estGeneration da franquia).
  const clienteHsp = Number(state.pbActiveClient?.hsp) > 0 ? Number(state.pbActiveClient.hsp) : null;

  if (state.pbSearch) {
    const searchNum = parseInt(state.pbSearch, 10);
    list = list.filter(item => {
      const estGeneration = clienteHsp
        ? calcularGeracaoEstimada(item.power, item.categoria, clienteHsp)
        : Number(item._estGeneration ?? calcularGeracaoEstimada(item.power, item.categoria));
      const searchBlob = item._searchBlob || `${item.name || ''} ${item.brand || ''} ${item.power || ''}`.toLowerCase();
      const textMatch = searchBlob.includes(state.pbSearch);
      const generationMatch = !isNaN(searchNum) && Math.abs(estGeneration - searchNum) <= 50;
      return textMatch || generationMatch;
    });
  }

  if (list.length === 0) {
    container.classList.add('hidden');
    emptyEl.classList.remove('hidden');
    emptyEl.classList.add('flex');
    return;
  }

  emptyEl.classList.add('hidden');
  emptyEl.classList.remove('flex');
  container.classList.remove('hidden');

  // Sem scroll interno: o painel vive dentro da ficha CRM 360, que já rola.
  container.className = state.pbViewMode === 'list'
    ? 'p-3 md:p-4 flex flex-col gap-3 bg-[#050505]'
    : 'p-3 md:p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 bg-[#050505]';

  container.innerHTML = list.map(item => {
    const estGenerationNum  = clienteHsp
      ? (calcularGeracaoEstimada(item.power, item.categoria, clienteHsp) || 0)
      : (Number(item._estGeneration ?? calcularGeracaoEstimada(item.power, item.categoria)) || 0);
    const estGeneration     = estGenerationNum.toFixed(0);
    const formattedPrice    = formatCurrency(item.price);
    const formattedListPrice= formatCurrency(item.list_price);
    const safeId            = escapeHTML(String(item.id));
    const safeName          = escapeHTML(item.name);
    const safeBrand         = escapeHTML(item.brand);
    const safePower         = escapeHTML(String(item.power));

    // Cards container-aware: nada de breakpoints de viewport ditando linha/coluna
    // (o painel vive dentro da ficha e a largura do container é quem manda).
    // flex-wrap: quando falta espaço, preço e botão descem de linha em vez de
    // esmagar o nome do kit.
    if (state.pbViewMode === 'grid') {
      return `
        <div class="bg-[#0d0d0f] border border-neutral-800 hover:border-orange-500/40 p-4 flex flex-col gap-3 group transition-all">
          <div class="flex justify-between items-start gap-2">
            <span class="text-[9px] bg-orange-600/15 text-orange-500 px-2 py-0.5 font-black uppercase tracking-widest border border-orange-500/30">${safeBrand}</span>
            <span class="text-[10px] text-neutral-600 line-through decoration-red-500/70 font-bold shrink-0">De: ${formattedListPrice}</span>
          </div>
          <h3 class="text-white font-black text-sm uppercase leading-tight group-hover:text-orange-400 transition-colors">${safeName}</h3>
          <div class="grid grid-cols-2 gap-2">
            <div class="bg-black p-2 border border-neutral-800 flex flex-col items-center justify-center">
              <span class="text-[8px] text-neutral-500 font-black uppercase tracking-widest">Potência</span>
              <span class="text-orange-500 font-black flex items-center gap-1 mt-0.5 text-sm"><i data-lucide="zap" class="w-3 h-3"></i>${safePower} kWp</span>
            </div>
            <div class="bg-black p-2 border border-neutral-800 flex flex-col items-center justify-center">
              <span class="text-[8px] text-neutral-500 font-black uppercase tracking-widest">Geração est.</span>
              <span class="text-blue-400 font-black flex items-center gap-1 mt-0.5 text-sm"><i data-lucide="sun" class="w-3 h-3"></i>~${estGeneration} kWh</span>
            </div>
          </div>
          <div class="mt-auto pt-3 border-t border-neutral-800/60 flex flex-wrap items-center justify-between gap-2">
            <div class="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-yellow-400 tracking-tighter pb-0.5 pr-1">${formattedPrice}</div>
            <button data-kit-id="${safeId}" onclick="copyProposalLinkById(this.dataset.kitId, event)" aria-label="Gerar proposta para ${safeName}" class="btn btn-primary">
              <i data-lucide="file-text"></i> GERAR
            </button>
          </div>
        </div>`;
    }

    return `
      <div class="bg-[#0d0d0f] border border-neutral-800 hover:border-orange-500/40 p-4 flex flex-wrap items-center gap-x-6 gap-y-3 group transition-all">
        <div class="flex-1 min-w-[240px]">
          <span class="text-[9px] bg-orange-600/15 text-orange-500 px-2 py-0.5 font-black uppercase tracking-widest border border-orange-500/30 inline-block">${safeBrand}</span>
          <h3 class="text-white font-black text-sm uppercase leading-tight group-hover:text-orange-400 transition-colors mt-1.5">${safeName}</h3>
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[10px] font-bold">
            <span class="text-orange-500 flex items-center gap-1"><i data-lucide="zap" class="w-3 h-3"></i>${safePower} kWp</span>
            <span class="text-blue-400 flex items-center gap-1"><i data-lucide="sun" class="w-3 h-3"></i>~${estGeneration} kWh/mês</span>
          </div>
        </div>
        <div class="text-right shrink-0 ml-auto">
          <div class="text-[10px] text-neutral-600 line-through decoration-red-500/70 font-bold">De: ${formattedListPrice}</div>
          <div class="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-yellow-400 tracking-tighter pb-0.5 pr-1">${formattedPrice}</div>
        </div>
        <button data-kit-id="${safeId}" onclick="copyProposalLinkById(this.dataset.kitId, event)" aria-label="Gerar proposta para ${safeName}" class="btn btn-primary shrink-0">
          <i data-lucide="file-text"></i> GERAR PROPOSTA
        </button>
      </div>`;
  }).join('');

  lucide.createIcons();
}

// --- Lookup por ID para evitar JSON em onclick ---
function copyProposalLinkById(kitId, event) {
  const kit = state.data.find(k => String(k.id) === String(kitId));
  if (!kit) return;
  copyProposalLink(kit, event);
}

// --- Gerar e copiar link ---
function copiarLinkExistente(id, btnElement) {
  const originalHTML = btnElement.innerHTML;
  btnElement.innerHTML = '<i class="w-3 h-3 inline" data-lucide="check"></i> Copiado!';
  lucide.createIcons();

  const baseUrl   = window.location.origin;
  const linkFinal = `${baseUrl}/proposta.html?id=${id}`;
  copiarTextoBlindado(linkFinal);
  showToast('LINK DA PROPOSTA COPIADO!');

  setTimeout(() => {
    btnElement.innerHTML = originalHTML;
    lucide.createIcons();
  }, 3000);
}

async function copyProposalLink(kit, event) {
  const client = state.pbActiveClient;
  if (!client) return showToast('Nenhum cliente em atendimento!');

  const btnCopiar   = event.currentTarget;
  const originalText= btnCopiar.innerHTML;
  btnCopiar.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> GERANDO...';
  lucide.createIcons();

  const shouldUsePopup = !isStandaloneDisplayMode();
  const popupRef = shouldUsePopup ? window.open('', '_blank') : null;

  try {
    const seller = await resolveEffectiveSellerForClient(client);

    const { data, error } = await supabaseClient.from('propostas').insert([{
      vendedor_email:    seller.vendedor_email,
      vendedor_nome:     seller.vendedor_nome,
      vendedor_telefone: seller.vendedor_telefone,
      cliente_id:        client.id,
      cliente_nome:      client.nome,
      cliente_telefone:  client.telefone,
      cliente_cidade:    client.cidade,
      kit_nome:          kit.name,
      kit_brand:         kit.brand,
      kit_power:         kit.power,
      kit_price:         kit.price,
      kit_list_price:    kit.list_price,
      geracao_estimada:  calcularGeracaoEstimada(kit.power, kit.categoria, client.hsp),
      franquia_id:       state.franquiaId
    }]).select();

    if (error) throw error;

    const baseUrl   = window.location.origin;
    const linkFinal = `${baseUrl}/proposta.html?id=${data[0].id}`;

    handleProposalLinkOpen(linkFinal, popupRef);

    if (!client.status || client.status === 'NOVO') {
      await cycleClientStatus(client.id, 'NOVO');
    }

    await fetchPropostas();
    if (typeof captureEvent === 'function') {
      captureEvent('proposal_created', { source: 'portal', mode: 'promocional' });
    }

    btnCopiar.innerHTML = '<i data-lucide="check" class="w-4 h-4"></i> GERADO E COPIADO!';
    btnCopiar.classList.remove('btn-primary');
    btnCopiar.classList.add('btn-success');
    lucide.createIcons();
    showToast('LINK DA PROPOSTA COPIADO!');
    showProposalSharePanel(data[0].id, linkFinal);

    setTimeout(() => {
      btnCopiar.innerHTML = originalText;
      btnCopiar.classList.remove('btn-success');
      btnCopiar.classList.add('btn-primary');
      lucide.createIcons();
    }, 3000);

  } catch (err) {
    console.error('Erro na geração da proposta personalizada:', err);
    showToast('Erro ao gerar a proposta. Tente novamente.');
    if (popupRef) popupRef.close();
    btnCopiar.innerHTML = originalText;
    lucide.createIcons();
  }
}

function isStandaloneDisplayMode() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.navigator.standalone === true
  );
}

function handleProposalLinkOpen(link, popupRef) {
  // Em modo app (PWA), evita navegar para dentro da proposta e "prender" o vendedor.
  copiarTextoBlindado(link);

  if (isStandaloneDisplayMode()) {
    const externalAttempt = tryOpenExternalBrowser(link);

    if (navigator.share) {
      navigator.share({
        title: 'Proposta Ágil Solar',
        text: 'Segue o link da proposta:',
        url: link,
      }).catch(() => {});
    }

    showToast(externalAttempt
      ? 'LINK COPIADO! Se nao abrir fora do app, use compartilhar.'
      : 'LINK COPIADO! Use compartilhar para abrir no navegador.');
    return;
  }

  if (popupRef) {
    popupRef.location.href = link;
    return;
  }

  const newTab = window.open(link, '_blank', 'noopener,noreferrer');
  if (!newTab) {
    window.location.href = link;
  }
}

function tryOpenExternalBrowser(link) {
  try {
    const anchor = document.createElement('a');
    anchor.href = link;
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

// Marca a proposta como ENVIADA no 1º envio (ciclo GERADA→ENVIADA→VISTA→ACEITA).
// Falha silenciosa de propósito: não pode travar o envio do link.
async function marcarPropostaEnviada(propostaId) {
  if (!propostaId) return;
  try {
    const enviadaEm = new Date().toISOString();
    const { error } = await supabaseClient
      .from('propostas')
      .update({ status: 'ENVIADA', enviada_em: enviadaEm })
      .eq('id', propostaId)
      .eq('status', 'GERADA');
    if (error) { console.warn('[propostas] Falha ao marcar ENVIADA.', error); return; }
    const row = (state.propostas || []).find((p) => p.id === propostaId);
    if (row && (!row.status || row.status === 'GERADA')) {
      row.status = 'ENVIADA';
      row.enviada_em = enviadaEm;
    }
    await agendarFollowUpDaProposta(row || (state.propostas || []).find((p) => p.id === propostaId));
  } catch (err) {
    console.warn('[propostas] Falha ao marcar ENVIADA.', err);
  }
}

// Automação: proposta enviada agenda o próprio follow-up (+48h). O follow-up
// esquecido é a causa nº1 de negócio parado — e ninguém agenda na mão (a base
// tinha 681 propostas e ZERO follow-ups). Só age se o cliente não tem um passo
// futuro marcado: nunca sobrescreve decisão de vendedor. Falha silenciosa.
async function agendarFollowUpDaProposta(proposta) {
  try {
    if (!proposta || !proposta.cliente_id) return;
    const client = (state.clientes || []).find((c) => c.id === proposta.cliente_id);
    if (!client) return;

    const jaTemFuturo = client.proxima_acao_em && new Date(client.proxima_acao_em) > new Date();
    if (jaTemFuturo) return;

    const quandoIso = typeof filaDataEm === 'function'
      ? filaDataEm(2)
      : new Date(Date.now() + 48 * 3600000).toISOString();
    const nota = 'Follow-up da proposta enviada';

    const { error } = await supabaseClient.from('clientes')
      .update({ proxima_acao_em: quandoIso, proxima_acao_nota: nota })
      .eq('id', client.id);
    if (error) { console.warn('[propostas] Falha ao agendar follow-up.', error); return; }

    client.proxima_acao_em = quandoIso;
    client.proxima_acao_nota = nota;

    await supabaseClient.from('crm_atividades').insert([{
      cliente_id: client.id,
      franquia_id: client.franquia_id || state.franquiaId,
      autor_email: state.currentUser?.email || 'sistema',
      tipo: 'proxima_acao',
      descricao: `${nota} — ${new Date(quandoIso).toLocaleDateString('pt-BR')}`,
      meta: { origem: 'auto_proposta_enviada', proposta_id: proposta.id },
    }]);
  } catch (err) {
    console.warn('[propostas] Falha ao agendar follow-up.', err);
  }
}

// Painel pós-geração: o passo seguinte óbvio para o vendedor — mandar o link
// direto no WhatsApp DO CLIENTE, sem trocar de app e colar na mão.
function showProposalSharePanel(propostaId, link) {
  const client = state.pbActiveClient;
  const digits = digitsOnly(client?.telefone || '');
  const primeiroNome = String(client?.nome || 'cliente').trim().split(' ')[0];
  const nomeBonito = primeiroNome.charAt(0).toUpperCase() + primeiroNome.slice(1).toLowerCase();
  const waMsg = encodeURIComponent(`Olá, ${nomeBonito}! Segue a sua proposta de energia solar da Ágil Solar: ${link}\nQualquer dúvida, é só me chamar por aqui.`);
  const waLink = digits.length >= 10 ? `https://wa.me/55${digits}?text=${waMsg}` : null;

  const existing = document.getElementById('pb-share-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'pb-share-overlay';
  overlay.className = 'fixed inset-0 z-[97] flex items-center justify-center bg-black/90 backdrop-blur-md p-4';
  overlay.innerHTML = `
    <div class="bg-neutral-900 border-2 border-green-600/40 w-full max-w-sm shadow-[0_0_50px_rgba(22,163,74,0.15)] animate-fade-in-up">
      <div class="flex justify-between items-center p-5 border-b border-neutral-800 bg-black/50">
        <p class="text-green-500 text-xs font-black uppercase tracking-[0.2em] flex items-center gap-2"><i data-lucide="check-circle-2" class="w-4 h-4"></i> Proposta gerada!</p>
        <button onclick="closeProposalSharePanel()" class="text-neutral-500 hover:text-white"><i data-lucide="x" class="w-5 h-5"></i></button>
      </div>
      <div class="p-5 space-y-3">
        <p class="text-neutral-400 text-xs leading-relaxed">O link já foi copiado. Agora é só mandar para <b class="text-white">${escapeHTML(nomeBonito)}</b>:</p>
        ${waLink
          ? `<a href="${waLink}" target="_blank" rel="noopener noreferrer" onclick="marcarPropostaEnviada('${propostaId}')" class="btn btn-success btn-lg btn-block"><i data-lucide="message-circle"></i> Enviar no WhatsApp</a>`
          : '<p class="text-yellow-500/90 text-[10px] font-bold uppercase tracking-widest">Cliente sem WhatsApp cadastrado — envie o link copiado por outro canal.</p>'}
        <button onclick="copiarTextoBlindado('${link}'); marcarPropostaEnviada('${propostaId}'); showToast('LINK COPIADO!')" class="btn btn-secondary btn-block"><i data-lucide="copy"></i> Copiar link de novo</button>
      </div>
    </div>`;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeProposalSharePanel(); });
  document.body.appendChild(overlay);
  lucide.createIcons();
}

function closeProposalSharePanel() {
  const el = document.getElementById('pb-share-overlay');
  if (el) el.remove();
}

// ==========================================
// FECHAR VENDA
// ==========================================
let _fechaVendaClientId = null;

function openFechaVenda(clientId) {
  // Pode ser chamado dos cards (clientId presente) ou do botão dentro do modal de proposta
  const client = clientId
    ? state.clientes.find(c => String(c.id) === String(clientId))
    : state.pbActiveClient;

  if (!client) {
    showToast('Cliente não encontrado. Atualize a página.');
    return;
  }

  _fechaVendaClientId = client.id;
  document.getElementById('fv-client-name').innerText = client.nome;
  document.getElementById('fv-error').classList.add('hidden');
  document.getElementById('fv-kit-info').classList.add('hidden');

  // Popula o select com os kits do catálogo
  const select = document.getElementById('fv-kit-select');
  select.innerHTML = '<option value="">» SELECIONE O KIT «</option>';

  // Propostas do cliente: match por cliente_id (confiável); fallback por nome
  // só para o legado sem vínculo. Match por nome puro misturava homônimos.
  const clientPropostas = state.propostas.filter((p) => {
    if (p.cliente_id) return String(p.cliente_id) === String(client.id);
    return p.cliente_nome && p.cliente_nome.toUpperCase() === client.nome.toUpperCase();
  });

  // Se tem propostas, exibe só elas; caso contrário exibe todos os kits
  if (clientPropostas.length > 0) {
    const group = document.createElement('optgroup');
    group.label = 'Propostas deste Cliente';
    clientPropostas.forEach(p => {
      const opt = document.createElement('option');
      opt.value = JSON.stringify({ nome: p.kit_nome, preco: p.kit_price, power: p.kit_power, brand: p.kit_brand, proposta_id: p.id });
      opt.textContent = `${p.kit_nome} → ${formatCurrency(p.kit_price)}`;
      group.appendChild(opt);
    });
    select.appendChild(group);
  }

  const groupAll = document.createElement('optgroup');
  groupAll.label = clientPropostas.length > 0 ? 'Todos os Kits do Catálogo' : 'Kits do Catálogo';
  state.data.filter(k => k.ativo !== false).forEach(k => {
    const opt = document.createElement('option');
    opt.value = JSON.stringify({ nome: k.name, preco: k.price, power: k.power, brand: k.brand });
    opt.textContent = `${k.name} → ${formatCurrency(k.price)}`;
    groupAll.appendChild(opt);
  });
  select.appendChild(groupAll);

  // Pré-seleciona a proposta mais recente (state.propostas já vem em ordem
  // desc): na maioria dos casos o kit vendido é o da última proposta.
  if (clientPropostas.length > 0) {
    select.selectedIndex = 1; // índice 0 é o placeholder "» SELECIONE O KIT «"
    onFvKitChange();
  }

  document.getElementById('fecha-venda-modal').classList.remove('hidden');
  lucide.createIcons();
}

function closeFechaVenda() {
  document.getElementById('fecha-venda-modal').classList.add('hidden');
  _fechaVendaClientId = null;
}

// Escape do interceptor: marca FECHADO sem criar venda. Existe para o caso
// legado (venda registrada fora da plataforma) — por isso pede confirmação e
// avisa o custo: sem venda não há faturamento, comissão nem ranking.
function fecharSemRegistrarVenda() {
  const clientId = _fechaVendaClientId;
  const client = state.clientes.find((c) => c.id === clientId);
  if (!client) return;

  if (normalizeClientStatus(client.status) === 'FECHADO') {
    closeFechaVenda();
    return;
  }

  showConfirmModal(
    `Marcar ${client.nome} como FECHADO sem registrar a venda? A venda não vai aparecer no seu total do mês, no ranking nem no financeiro.`,
    async () => {
      closeFechaVenda();
      await crmSetClientStatus(clientId, 'FECHADO', null, { skipVenda: true });
    },
    'FECHAR SEM VENDA'
  );
}

function onFvKitChange() {
  const select  = document.getElementById('fv-kit-select');
  const infoDiv = document.getElementById('fv-kit-info');
  if (!select.value) { infoDiv.classList.add('hidden'); return; }
  try {
    const kit = JSON.parse(select.value);
    document.getElementById('fv-kit-price').innerText = formatCurrency(kit.preco);
    document.getElementById('fv-kit-power').innerText = kit.power ? `${kit.power} kWp` : 'N/A';
    infoDiv.classList.remove('hidden');
  } catch (_) { infoDiv.classList.add('hidden'); }
}

async function confirmarFechaVenda() {
  const select = document.getElementById('fv-kit-select');
  const errEl  = document.getElementById('fv-error');
  const btn    = document.getElementById('btn-confirmar-venda');

  errEl.classList.add('hidden');

  if (!select.value) {
    errEl.innerText = 'Selecione o kit que foi vendido.';
    errEl.classList.remove('hidden');
    return;
  }

  let kit;
  try { kit = JSON.parse(select.value); }
  catch (_) {
    errEl.innerText = 'Erro ao ler os dados do kit. Tente novamente.';
    errEl.classList.remove('hidden');
    return;
  }

  const client = state.clientes.find(c => c.id === _fechaVendaClientId);
  if (!client || !state.currentUser) {
    errEl.innerText = 'Sessão expirada. Recarregue a página.';
    errEl.classList.remove('hidden');
    return;
  }
  if (!canOperateClientProposalFlow(client)) {
    errEl.innerText = 'Acesso restrito ao cliente selecionado.';
    errEl.classList.remove('hidden');
    return;
  }

  const originalHTML = btn.innerHTML;
  btn.innerHTML = '<i data-lucide="loader-2" class="w-5 h-5 animate-spin inline mr-2"></i>REGISTRANDO...';
  btn.disabled  = true;
  lucide.createIcons();

  try {
    const seller = await resolveEffectiveSellerForClient(client);

    const { error: insertError } = await supabaseClient.from('vendas').insert([{
      vendedor_email:    seller.vendedor_email,
      vendedor_nome:     seller.vendedor_nome,
      cliente_id:        client.id,
      cliente_nome:      client.nome,
      cliente_telefone:  client.telefone || '',
      kit_nome:          kit.nome  || '',
      kit_brand:         kit.brand || '',
      kit_power:         Number(kit.power) || 0,
      kit_price:         Number(kit.preco) || 0,
      proposta_id:       kit.proposta_id || null,
      franquia_id:       state.franquiaId
    }]);

    if (insertError) {
      // Erro mais legível para tabela não existente
      const msg = insertError.code === '42P01'
        ? 'Tabela "vendas" não encontrada no Supabase. Execute o SQL de criação.'
        : (insertError.message || 'Erro ao inserir venda.');
      throw new Error(msg);
    }

    // Atualiza status do cliente para FECHADO localmente + remotamente.
    // Update direto de propósito: não passa por crmSetClientStatus para não
    // reentrar no interceptor que abriu este modal. Follow-up é encerrado junto —
    // cliente ganho não pode continuar na fila do dia.
    const idx = state.clientes.findIndex(c => c.id === client.id);
    if (idx > -1) {
      state.clientes[idx].status = 'FECHADO';
      state.clientes[idx].proxima_acao_em = null;
      state.clientes[idx].proxima_acao_nota = null;
    }
    await supabaseClient.from('clientes')
      .update({ status: 'FECHADO', proxima_acao_em: null, proxima_acao_nota: null })
      .eq('id', client.id);

    // Venda veio de uma proposta? Fecha o ciclo dela: ACEITA.
    if (kit.proposta_id) {
      const { error: aceitaError } = await supabaseClient
        .from('propostas')
        .update({ status: 'ACEITA' })
        .eq('id', kit.proposta_id);
      if (aceitaError) {
        console.warn('[confirmarFechaVenda] Venda registrada, mas falhou ao marcar proposta ACEITA.', aceitaError);
      } else {
        const prop = (state.propostas || []).find((p) => p.id === kit.proposta_id);
        if (prop) prop.status = 'ACEITA';
      }
    }

    // Atualiza lista de vendas (silencioso se der erro)
    await fetchVendas();
    if (typeof captureEvent === 'function') {
      captureEvent('sale_closed', { source: 'portal' });
    }

    closeFechaVenda();
    showSalesCelebration();
        showToast(`\u{1F389} VENDA FECHADA! ${kit.nome}`);
    renderContent();
    // Ficha aberta por baixo? Reflete FECHADO + contador de vendas na hora.
    const fichaAberta = document.getElementById('crm360-overlay')?.classList.contains('is-open');
    if (fichaAberta && typeof renderCrm360 === 'function') renderCrm360();

  } catch (err) {
    console.error('[confirmarFechaVenda]', err);
    errEl.innerText = err.message || 'Erro ao registrar. Tente novamente.';
    errEl.classList.remove('hidden');
  } finally {
    // Garante que o botão SEMPRE volta ao estado original
    btn.innerHTML = originalHTML;
    btn.disabled  = false;
    lucide.createIcons();
  }
}


















