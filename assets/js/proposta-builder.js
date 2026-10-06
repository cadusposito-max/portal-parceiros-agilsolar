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

// O modo EQUIPAMENTOS foi desativado (o banco recusa criar); as propostas
// antigas desse modo continuam abrindo como personalizada.
const PB_PROPOSAL_MODES = {
  PROMOCIONAL:  'PROMOCIONAL',
  PERSONALIZADA: 'PERSONALIZADA'
};
function canUsePersonalizada() {
  return Boolean(state.isAdmin || state.isGestor);
}

function updatePBPersonalizadaRoleBadge() {
  const label = document.getElementById('pb-personalizada-role-badge-label');
  if (label) label.textContent = 'Admin e gestor';
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
    potencia:       '',
    potenciaManual: false,   // true quando o usuário digitou a potência (não recalcula)
    potenciaEditando: false, // campo de potência aberto (botão "Editar")
    itens:          [],      // [{ uid, origem, ref_id, tipo, descricao, qtd, preco, potencia_kwp_un }]
    descontoTipo:   'value', // 'value' (R$) | 'percent'
    descontoValor:  '',
    frete:          '',
    paymentNote:    '',
    commercialNote: ''
  };
}

function resetPBEquipDraft() {
  state.pbEquipDraft = getPBDefaultEquipDraft();
}
// O construtor vive na tela própria de orçamento (orcamento-tela.js): este
// wrapper só valida e abre a tela. Todos os call sites (card do cliente,
// popup "Nova proposta", ficha, dashboard) passam por aqui.
function openProposalBuilder(clientId, pickerTab = null) {
  const client = state.clientes.find(c => c.id === clientId);

  if (!client) {
    showToast('Cliente nao encontrado.');
    return;
  }
  if (!canOperateClientProposalFlow(client)) {
    showToast('Acesso restrito ao cliente selecionado.');
    return;
  }

  openOrcamento(clientId, pickerTab);
}

// Prepara o painel embutido (#pb-embedded-panel) para o cliente do orçamento.
// Chamado pelo renderOrcamento depois de mover o painel para o slot da tela.
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
  if (typeof pbFornecimentoReset === 'function') pbFornecimentoReset();

  const searchEl = document.getElementById('pb-search');
  if (searchEl) searchEl.value = '';
  syncEquipInputsFromState();
  updatePBTabsUI();
  updatePBPersonalizadaRoleBadge();
  if (typeof pbDimSetup === 'function') pbDimSetup(client); // porta Dimensionar × Escolher kit
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
  if (typeof pbFornecimentoRender === 'function') pbFornecimentoRender(); // opções do filtro dependem do tipo
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
  const wantsPersonalizada = mode === PB_PROPOSAL_MODES.PERSONALIZADA;

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
  const isPersonalizada = mode === PB_PROPOSAL_MODES.PERSONALIZADA;

  const btnPromo   = document.getElementById('pb-mode-promocional-btn');
  const btnCustom  = document.getElementById('pb-mode-personalizada-btn');
  const helperText = document.getElementById('pb-mode-helper');

  const promoToolbar      = document.getElementById('pb-promocional-toolbar');
  const equipPanel        = document.getElementById('pb-equip-panel');
  const persHead          = document.getElementById('pb-pers-head');
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
  if (persHead)          persHead.classList.toggle('hidden', !isPersonalizada);
  if (productsContainer) productsContainer.classList.toggle('hidden', hidePromo);
  if (emptyEl && hidePromo) emptyEl.classList.add('hidden');

  updatePBPersonalizadaRoleBadge();
  if (typeof pbDimSync === 'function') pbDimSync();
  if (typeof orcamentoAtualizarResumo === 'function') orcamentoAtualizarResumo();
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

// Tipos de item (mesmas categorias do cadastro de Equipamentos) + kit pronto.
const PB_ITEM_TIPOS = [
  { v: 'kit',       label: 'Kit',       icon: 'package' },
  { v: 'modulo',    label: 'Módulo',    icon: 'solar-panel' },
  { v: 'inversor',  label: 'Inversor',  icon: 'zap' },
  { v: 'estrutura', label: 'Estrutura', icon: 'house' },
  { v: 'cabo',      label: 'Cabos',     icon: 'cable' },
  { v: 'servico',   label: 'Serviço',   icon: 'wrench' },
  { v: 'outro',     label: 'Outros',    icon: 'box' },
];
const _pbTipo = (t) => PB_ITEM_TIPOS.find((x) => x.v === t) || { v: t, label: t || 'Outros', icon: 'box' };
const _pbIcone = (t) => `<span class="pbp-ic${t === 'servico' ? ' is-servico' : ''}"><i data-lucide="${_pbTipo(t).icon}"></i></span>`;
const _pbKwp = (v) => (Math.round((Number(v) || 0) * 100) / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 });

const _pbNum = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const _pbR2  = (v) => Math.round((Number(v) || 0) * 100) / 100;
let _pbItemSeq = 0;
const _pbNovoUid = () => 'it' + Date.now().toString(36) + (++_pbItemSeq);

function _pbDraft() {
  if (!state.pbEquipDraft || !Array.isArray(state.pbEquipDraft.itens)) {
    state.pbEquipDraft = Object.assign(getPBDefaultEquipDraft(), state.pbEquipDraft || {}, {
      itens: (state.pbEquipDraft && Array.isArray(state.pbEquipDraft.itens)) ? state.pbEquipDraft.itens : [],
    });
  }
  return state.pbEquipDraft;
}

// Totais da proposta personalizada. Total = itens − desconto + frete.
function calcularTotaisPersonalizada(draft) {
  const itens = (draft.itens || []).filter((i) => _pbNum(i.qtd) > 0);
  const subtotal = _pbR2(itens.reduce((s, i) => s + _pbNum(i.qtd) * _pbNum(i.preco), 0));
  const servicos = _pbR2(itens.filter((i) => i.tipo === 'servico').reduce((s, i) => s + _pbNum(i.qtd) * _pbNum(i.preco), 0));
  const equipamentos = _pbR2(subtotal - servicos);
  const dv = Math.max(0, _pbNum(draft.descontoValor));
  const descontoBruto = draft.descontoTipo === 'percent' ? subtotal * Math.min(dv, 100) / 100 : dv;
  const desconto = _pbR2(Math.min(descontoBruto, subtotal));
  const frete = _pbR2(Math.max(0, _pbNum(draft.frete)));
  const total = _pbR2(subtotal - desconto + frete);
  const potenciaAuto = Math.round(itens.reduce((s, i) => s + _pbNum(i.qtd) * _pbNum(i.potencia_kwp_un), 0) * 1000) / 1000;
  return { itens, subtotal, servicos, equipamentos, desconto, frete, total, potenciaAuto };
}

function _pbPotenciaEfetiva(draft, tot) {
  if (draft.potenciaManual) return _pbNum(draft.potencia);
  return tot.potenciaAuto;
}

// Nome usado quando o campo "Nome na proposta" fica em branco.
function _pbNomeSugerido(potencia) {
  return potencia > 0 ? `Proposta personalizada ${_pbKwp(potencia)} kWp` : 'Proposta personalizada';
}

// O que falta para gerar (texto do rodapé); '' quando está tudo certo.
function pbPersonalizadaPendencia(draft, tot) {
  if (!tot.itens.length) return 'Adicione os itens da proposta';
  if (tot.itens.some((i) => !String(i.descricao || '').trim())) return 'Dê um nome a cada item';
  if (tot.total <= 0) return 'Informe os preços dos itens';
  if (_pbPotenciaEfetiva(draft, tot) <= 0) return 'Informe a potência do sistema';
  return '';
}

function syncEquipInputsFromState() {
  const d = _pbDraft();
  const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
  setVal('pb-equip-descricao',       d.descricao      || '');
  setVal('pb-equip-potencia',        d.potencia       || '');
  setVal('pb-equip-desconto',        d.descontoValor  || '');
  setVal('pb-equip-frete',           d.frete          || '');
  setVal('pb-equip-payment-note',    d.paymentNote    || '');
  setVal('pb-equip-commercial-note', d.commercialNote || '');
  _pbSyncDescontoTipo();
  _pbToggleObs(Boolean(d.paymentNote || d.commercialNote));
  renderPBItens();
  updateEquipamentosPreview();
}

function _pbSyncDescontoTipo() {
  const tipo = _pbDraft().descontoTipo === 'percent' ? 'percent' : 'value';
  document.querySelectorAll('[data-pb-desc-tipo]').forEach((b) => {
    const on = b.getAttribute('data-pb-desc-tipo') === tipo;
    b.classList.toggle('is-on', on);
    b.setAttribute('aria-pressed', String(on));
  });
}

function _pbToggleObs(abrir) {
  const box = document.getElementById('pb-equip-obs');
  const btn = document.getElementById('pb-equip-obs-toggle');
  if (!box || !btn) return;
  const on = typeof abrir === 'boolean' ? abrir : box.classList.contains('hidden');
  box.classList.toggle('hidden', !on);
  btn.setAttribute('aria-expanded', String(on));
}

// ---- Lista de itens ---------------------------------------------------
function renderPBItens() {
  const host = document.getElementById('pb-itens-lista');
  if (!host) return;
  const d = _pbDraft();
  if (!d.itens.length) {
    host.innerHTML = `
      <div class="pbp-vazio">
        <i data-lucide="list-plus"></i>
        <p class="pbp-vazio-t">Comece pelos itens</p>
        <p class="pbp-vazio-s">Busque um kit ou equipamento acima, ou crie um item avulso.</p>
        <button type="button" class="pbp-btn" data-pb-acao="catalogo"><i data-lucide="book-open"></i> Abrir catálogo</button>
      </div>`;
    if (window.lucide) lucide.createIcons();
    return;
  }
  const opts = (sel) => PB_ITEM_TIPOS.map((t) => `<option value="${t.v}"${t.v === sel ? ' selected' : ''}>${t.label}</option>`).join('');
  host.innerHTML = d.itens.map((it) => {
    const sub = _pbNum(it.qtd) * _pbNum(it.preco);
    const doCatalogo = it.origem !== 'manual';
    const desc = escapeHTML(it.descricao || '');
    return `
      <div class="pbp-it" data-pb-item="${escapeHTML(it.uid)}">
        ${_pbIcone(it.tipo)}
        <div class="pbp-it-nome">
          ${doCatalogo ? '' : `<select data-pb-f="tipo" class="pbp-input" aria-label="Tipo do item">${opts(it.tipo)}</select>`}
          <input type="text" data-pb-f="descricao" value="${desc}" title="${desc}" placeholder="Descrição do item" aria-label="Descrição do item"
            class="pbp-input pbp-it-desc${doCatalogo ? ' is-cat' : ''}">
          ${doCatalogo ? `<span class="pbp-tag">${escapeHTML(_pbTipo(it.tipo).label)}</span>` : ''}
        </div>
        <button type="button" data-pb-acao="remover" class="pbp-icon-btn is-danger" title="Remover item" aria-label="Remover item"><i data-lucide="trash-2"></i></button>
        <div class="pbp-it-val">
          <span class="pbp-step">
            <button type="button" data-pb-acao="menos" aria-label="Diminuir quantidade">−</button>
            <input type="number" data-pb-f="qtd" min="0" step="1" value="${escapeHTML(String(it.qtd ?? ''))}" class="pbp-input" aria-label="Quantidade">
            <button type="button" data-pb-acao="mais" aria-label="Aumentar quantidade">+</button>
          </span>
          <span class="pbp-x">×</span>
          <span class="pbp-preco"><span>R$</span><input type="number" data-pb-f="preco" min="0" step="0.01" value="${escapeHTML(String(it.preco ?? ''))}" placeholder="0,00" class="pbp-input" aria-label="Preço unitário"></span>
          <b class="pbp-it-sub" data-pb-sub>${formatCurrency(sub)}</b>
        </div>
      </div>`;
  }).join('');
  if (window.lucide) lucide.createIcons();
}

function _pbAtualizarSubtotalLinha(uid) {
  const d = _pbDraft();
  const it = d.itens.find((x) => x.uid === uid);
  const row = document.querySelector(`[data-pb-item="${CSS.escape(uid)}"] [data-pb-sub]`);
  if (it && row) row.textContent = formatCurrency(_pbNum(it.qtd) * _pbNum(it.preco));
}

function addPBItem(item) {
  const d = _pbDraft();
  d.itens.push(Object.assign({ uid: _pbNovoUid(), origem: 'manual', ref_id: null, tipo: 'outro', descricao: '', qtd: 1, preco: '', potencia_kwp_un: 0 }, item));
  renderPBItens();
  updateEquipamentosPreview();
}

// ---- Catálogo (kits da franquia + equipamentos avulsos) -----------------
let _pbCatFonte = 'kits';
let _pbCatEquip = null;      // cache dos componentes ativos (com preço)
let _pbCatEquipErro = false;

async function _pbCarregarEquipamentos() {
  if (_pbCatEquip) return _pbCatEquip;
  const { data, error } = await supabaseClient
    .from('componentes')
    .select('id, tipo, nome, marca, unidade, potencia_wp, preco_unitario')
    .eq('ativo', true)
    .order('tipo').order('nome');
  if (error) { _pbCatEquipErro = true; console.error('[proposta-builder] catálogo de equipamentos', error); return []; }
  _pbCatEquipErro = false;
  _pbCatEquip = data || [];
  return _pbCatEquip;
}

function abrirPBCatalogo() {
  const box = document.getElementById('pb-catalogo');
  if (!box) return;
  const jaAberto = !box.classList.contains('hidden');
  box.classList.remove('hidden');
  if (!jaAberto) renderPBCatalogo();
  const busca = document.getElementById('pb-catalogo-busca');
  if (busca && document.activeElement !== busca) busca.focus();
}

function fecharPBCatalogo() {
  const box = document.getElementById('pb-catalogo');
  if (box) box.classList.add('hidden');
}

async function renderPBCatalogo() {
  const lista = document.getElementById('pb-catalogo-lista');
  if (!lista) return;
  document.querySelectorAll('[data-pb-cat-fonte]').forEach((b) => {
    const ativo = b.getAttribute('data-pb-cat-fonte') === _pbCatFonte;
    b.classList.toggle('is-on', ativo);
    b.setAttribute('aria-pressed', String(ativo));
  });
  const kits = _pbCatFonte === 'kits';
  const buscaEl = document.getElementById('pb-catalogo-busca');
  if (buscaEl) buscaEl.placeholder = kits ? 'Buscar kit por nome, marca ou potência' : 'Buscar equipamento por nome, marca ou tipo';
  const titulo = document.getElementById('pb-catalogo-titulo');
  const setTitulo = (n) => {
    if (titulo) titulo.textContent = (kits ? 'Kits' : 'Equipamentos') + (n == null ? '' : ` · ${n} ${n === 1 ? 'encontrado' : 'encontrados'}`);
  };
  setTitulo(null);
  const termo = String((document.getElementById('pb-catalogo-busca') || {}).value || '').trim().toLowerCase();
  const casa = (txt) => !termo || String(txt || '').toLowerCase().includes(termo);

  let linhas = [];
  if (_pbCatFonte === 'kits') {
    linhas = (state.data || [])
      .filter((k) => k.ativo !== false && casa(`${k.name} ${k.brand} ${k.power}`))
      .slice(0, 40)
      .map((k) => ({
        chave: 'kit:' + k.id,
        tipo: 'kit',
        titulo: k.name,
        sub: [k.brand, `${_pbKwp(k.power)} kWp`].filter(Boolean).join(' · '),
        preco: _pbNum(k.price),
      }));
  } else {
    lista.innerHTML = `<p class="pbp-cat-msg">Carregando…</p>`;
    const equip = await _pbCarregarEquipamentos();
    if (_pbCatFonte !== 'equipamentos') return; // trocou de aba enquanto carregava
    if (_pbCatEquipErro) {
      lista.innerHTML = `<p class="pbp-cat-msg is-erro">Não foi possível carregar os equipamentos.</p>`;
      return;
    }
    if (!equip.length) {
      lista.innerHTML = `<p class="pbp-cat-msg">Nenhum equipamento cadastrado ainda. Cadastre em Produtos → Equipamentos (com preço) ou use "Item avulso".</p>`;
      return;
    }
    linhas = equip
      .filter((e) => casa(`${e.nome} ${e.marca} ${e.tipo} ${e.potencia_wp}`))
      .slice(0, 60)
      .map((e) => ({
        chave: 'eq:' + e.id,
        tipo: e.tipo,
        titulo: e.nome,
        sub: [_pbTipo(e.tipo).label, e.marca, e.potencia_wp ? `${e.potencia_wp} Wp` : '', e.unidade ? `/${e.unidade}` : ''].filter(Boolean).join(' · '),
        preco: _pbNum(e.preco_unitario),
      }));
  }

  setTitulo(linhas.length);
  lista.innerHTML = linhas.length
    ? linhas.map((l) => `
        <button type="button" data-pb-cat-add="${escapeHTML(l.chave)}" class="pbp-res">
          ${_pbIcone(l.tipo)}
          <span class="pbp-res-txt">
            <span class="pbp-res-t block">${escapeHTML(l.titulo || '')}</span>
            <span class="pbp-res-s block">${escapeHTML(l.sub)}</span>
          </span>
          <span class="pbp-res-p${l.preco > 0 ? '' : ' is-vazio'}">${l.preco > 0 ? formatCurrency(l.preco) : 'sem preço'}</span>
          <i data-lucide="circle-plus"></i>
        </button>`).join('')
    : `<p class="pbp-cat-msg">Nada encontrado. Use "Item avulso" para criar um item.</p>`;
  if (window.lucide) lucide.createIcons();
}

function adicionarDoCatalogo(chave) {
  const [fonte, id] = String(chave).split(':');
  if (fonte === 'kit') {
    const k = (state.data || []).find((x) => String(x.id) === id);
    if (!k) return;
    addPBItem({
      origem: 'kit', ref_id: k.id, tipo: 'kit',
      descricao: [k.name, k.brand].filter(Boolean).join(' · '),
      qtd: 1, preco: _pbNum(k.price) || '', potencia_kwp_un: _pbNum(k.power),
    });
  } else if (fonte === 'eq') {
    const e = (_pbCatEquip || []).find((x) => String(x.id) === id);
    if (!e) return;
    addPBItem({
      origem: 'componente', ref_id: e.id, tipo: e.tipo || 'outro',
      descricao: [e.nome, e.marca].filter(Boolean).join(' · '),
      qtd: 1, preco: _pbNum(e.preco_unitario) || '',
      potencia_kwp_un: e.tipo === 'modulo' ? _pbNum(e.potencia_wp) / 1000 : 0,
    });
  }
  showToast('Item adicionado');
}

// ---- Resumo / validação -------------------------------------------------
function updateEquipamentosPreview() {
  const draft = _pbDraft();
  const tot = calcularTotaisPersonalizada(draft);

  // Potência: acompanha os módulos/kits enquanto o usuário não digitar outra.
  const potInput = document.getElementById('pb-equip-potencia');
  if (!draft.potenciaManual && potInput && document.activeElement !== potInput) {
    potInput.value = tot.potenciaAuto > 0 ? String(tot.potenciaAuto) : '';
    draft.potencia = potInput.value;
  }
  const potencia = _pbPotenciaEfetiva(draft, tot);
  const editando = Boolean(draft.potenciaManual || draft.potenciaEditando);
  if (potInput) potInput.classList.toggle('hidden', !editando);
  const potBtn = document.getElementById('pb-equip-potencia-editar');
  if (potBtn) {
    const novoModo = editando ? 'auto' : 'editar';
    if (potBtn.dataset.modo !== novoModo) {
      potBtn.dataset.modo = novoModo;
      potBtn.innerHTML = editando ? '<i data-lucide="rotate-ccw"></i> <span>Automática</span>' : '<i data-lucide="pencil"></i> <span>Editar</span>';
      potBtn.title = editando ? 'Voltar a calcular pelos módulos e kits' : 'Digitar a potência à mão';
      if (window.lucide) lucide.createIcons();
    }
  }
  const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setTxt('pb-equip-potencia-valor', potencia > 0 ? `${_pbKwp(potencia)} kWp` : '—');
  const hint = document.getElementById('pb-equip-potencia-hint');
  if (hint) {
    const geracao = potencia > 0 ? calcularGeracaoEstimada(potencia, undefined, state.pbActiveClient?.hsp) : 0;
    const gerTxt = geracao > 0 ? ` · ≈ ${Math.round(geracao).toLocaleString('pt-BR')} kWh/mês` : '';
    hint.textContent = draft.potenciaManual
      ? `Digitada à mão${tot.potenciaAuto > 0 ? ` (pelos itens: ${_pbKwp(tot.potenciaAuto)} kWp)` : ''}${gerTxt}`
      : (potencia > 0 ? `Pelos módulos e kits${gerTxt}` : 'Some um kit ou módulo, ou clique em Editar');
  }

  setTxt('pb-equip-preview-qtd', tot.itens.length ? `(${tot.itens.length})` : '');
  setTxt('pb-equip-preview-equip', tot.subtotal > 0 ? formatCurrency(tot.subtotal) : '—');
  setTxt('pb-equip-preview-desconto', '− ' + formatCurrency(tot.desconto));
  setTxt('pb-equip-preview-frete', formatCurrency(tot.frete));
  setTxt('pb-equip-preview-total', tot.total > 0 ? formatCurrency(tot.total) : '—');
  document.getElementById('pb-equip-linha-desconto')?.classList.toggle('hidden', !(tot.desconto > 0));
  document.getElementById('pb-equip-linha-frete')?.classList.toggle('hidden', !(tot.frete > 0));
  const nomeInput = document.getElementById('pb-equip-descricao');
  if (nomeInput) nomeInput.placeholder = _pbNomeSugerido(potencia);

  const canSubmit = !pbPersonalizadaPendencia(draft, tot);
  const submitBtn = document.getElementById('pb-equip-submit');
  if (submitBtn) {
    submitBtn.disabled = !canSubmit;
    submitBtn.classList.toggle('opacity-50', !canSubmit);
    submitBtn.classList.toggle('cursor-not-allowed', !canSubmit);
  }
  if (typeof orcamentoAtualizarResumo === 'function') orcamentoAtualizarResumo();
}

function bindEquipUIEvents() {
  const bindings = [
    ['pb-equip-descricao',       'input',  v => { _pbDraft().descricao = v; if (typeof orcamentoAtualizarResumo === 'function') orcamentoAtualizarResumo(); }],
    ['pb-equip-potencia',        'input',  v => { const d = _pbDraft(); d.potencia = v; d.potenciaManual = v !== ''; d.potenciaEditando = true; updateEquipamentosPreview(); }],
    ['pb-equip-desconto',        'input',  v => { _pbDraft().descontoValor = v; updateEquipamentosPreview(); }],
    ['pb-equip-frete',           'input',  v => { _pbDraft().frete = v; updateEquipamentosPreview(); }],
    ['pb-equip-payment-note',    'input',  v => { _pbDraft().paymentNote = v; }],
    ['pb-equip-commercial-note', 'input',  v => { _pbDraft().commercialNote = v; }],
    ['pb-catalogo-busca',        'input',  () => { abrirPBCatalogo(); renderPBCatalogo(); }],
  ];
  bindings.forEach(([id, evt, handler]) => {
    const el = document.getElementById(id);
    if (el && !el.dataset.bound) { el.addEventListener(evt, e => handler(e.target.value)); el.dataset.bound = '1'; }
  });

  const onClick = (id, fn) => {
    const el = document.getElementById(id);
    if (el && !el.dataset.boundClick) { el.addEventListener('click', fn); el.dataset.boundClick = '1'; }
  };
  onClick('pb-itens-add-manual', () => addPBItem({}));
  onClick('pb-catalogo-fechar', fecharPBCatalogo);
  onClick('pb-equip-obs-toggle', () => _pbToggleObs());
  onClick('pb-equip-potencia-editar', () => {
    const d = _pbDraft();
    if (d.potenciaManual || d.potenciaEditando) {
      d.potenciaManual = false;
      d.potenciaEditando = false;
      updateEquipamentosPreview();
      return;
    }
    d.potenciaEditando = true;
    updateEquipamentosPreview();
    const input = document.getElementById('pb-equip-potencia');
    if (input) { input.focus(); input.select(); }
  });

  const descTipo = document.getElementById('pb-equip-desconto-tipo');
  if (descTipo && !descTipo.dataset.bound) {
    descTipo.addEventListener('click', (e) => {
      const b = e.target.closest('[data-pb-desc-tipo]');
      if (!b) return;
      _pbDraft().descontoTipo = b.getAttribute('data-pb-desc-tipo') === 'percent' ? 'percent' : 'value';
      _pbSyncDescontoTipo();
      updateEquipamentosPreview();
    });
    descTipo.dataset.bound = '1';
  }

  // Catálogo: abre ao focar a busca; fecha no X, no Esc ou clicando fora.
  const busca = document.getElementById('pb-catalogo-busca');
  if (busca && !busca.dataset.boundFoco) {
    busca.addEventListener('focus', abrirPBCatalogo);
    busca.addEventListener('keydown', (e) => { if (e.key === 'Escape') { fecharPBCatalogo(); busca.blur(); } });
    busca.dataset.boundFoco = '1';
  }
  if (!document.body.dataset.pbCatFora) {
    document.addEventListener('click', (e) => {
      const box = document.getElementById('pb-catalogo');
      if (!box || box.classList.contains('hidden')) return;
      if (e.target.closest('#pb-catalogo, #pb-catalogo-busca, #pb-catalogo-fonte, [data-pb-acao="catalogo"]')) return;
      fecharPBCatalogo();
    });
    document.body.dataset.pbCatFora = '1';
  }

  // Kits × Equipamentos fica ao lado da busca: troca a fonte e já mostra a lista.
  const fonteBox = document.getElementById('pb-catalogo-fonte');
  if (fonteBox && !fonteBox.dataset.bound) {
    fonteBox.addEventListener('click', (e) => {
      const b = e.target.closest('[data-pb-cat-fonte]');
      if (!b) return;
      _pbCatFonte = b.getAttribute('data-pb-cat-fonte');
      abrirPBCatalogo();
      renderPBCatalogo();
    });
    fonteBox.dataset.bound = '1';
  }

  const catBox = document.getElementById('pb-catalogo');
  if (catBox && !catBox.dataset.bound) {
    catBox.addEventListener('click', (e) => {
      const add = e.target.closest('[data-pb-cat-add]');
      if (add) adicionarDoCatalogo(add.getAttribute('data-pb-cat-add'));
    });
    catBox.dataset.bound = '1';
  }

  const itensHost = document.getElementById('pb-itens-lista');
  if (itensHost && !itensHost.dataset.bound) {
    const editar = (e) => {
      const campo = e.target.getAttribute('data-pb-f');
      const row = e.target.closest('[data-pb-item]');
      if (!campo || !row) return;
      const uid = row.getAttribute('data-pb-item');
      const it = _pbDraft().itens.find((x) => x.uid === uid);
      if (!it) return;
      it[campo] = e.target.value;
      if (campo === 'descricao') e.target.title = e.target.value;
      if (campo === 'qtd' || campo === 'preco') _pbAtualizarSubtotalLinha(uid);
      if (campo === 'tipo' && e.type === 'change') { renderPBItens(); }
      updateEquipamentosPreview();
    };
    itensHost.addEventListener('input', editar);
    itensHost.addEventListener('change', editar);
    itensHost.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-pb-acao]');
      if (!btn) return;
      const acao = btn.getAttribute('data-pb-acao');
      if (acao === 'catalogo') { abrirPBCatalogo(); return; }
      const row = btn.closest('[data-pb-item]');
      if (!row) return;
      const uid = row.getAttribute('data-pb-item');
      const d = _pbDraft();
      if (acao === 'remover') {
        d.itens = d.itens.filter((x) => x.uid !== uid);
        renderPBItens();
      } else if (acao === 'mais' || acao === 'menos') {
        const it = d.itens.find((x) => x.uid === uid);
        if (!it) return;
        it.qtd = Math.max(1, Math.round(_pbNum(it.qtd)) + (acao === 'mais' ? 1 : -1));
        const input = row.querySelector('[data-pb-f="qtd"]');
        if (input) input.value = String(it.qtd);
        _pbAtualizarSubtotalLinha(uid);
      }
      updateEquipamentosPreview();
    });
    itensHost.dataset.bound = '1';
  }

  const form = document.getElementById('pb-equip-form');
  if (form && !form.dataset.bound) {
    form.addEventListener('submit', (event) => {
      if (typeof orcamentoAberto === 'function' && orcamentoAberto()) {
        event.preventDefault();
        const btn = document.getElementById('orcamento-gerar');
        if (btn) orcamentoGerar({ currentTarget: btn });
        return;
      }
      handleEquipamentosProposalSubmit(event);
    });
    form.dataset.bound = '1';
  }
}

async function handleEquipamentosProposalSubmit(event) {
  event.preventDefault();
  const draft = _pbDraft();
  const tot = calcularTotaisPersonalizada(draft);
  const potencia = _pbPotenciaEfetiva(draft, tot);

  if (!tot.itens.length) {
    showToast('Adicione pelo menos um item com quantidade.');
    return;
  }
  const semDescricao = tot.itens.find((i) => !String(i.descricao || '').trim());
  if (semDescricao) {
    showToast('Todos os itens precisam de descrição.');
    return;
  }
  if (tot.total <= 0) {
    showToast('O total da proposta precisa ser maior que zero.');
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

  // Itens gravados na proposta (sem custo: a proposta é visível ao vendedor dono).
  const itensSalvos = tot.itens.map((i) => ({
    origem:  i.origem === 'kit' || i.origem === 'componente' ? i.origem : 'manual',
    ref_id:  i.ref_id || null,
    tipo:    i.tipo || 'outro',
    descricao: String(i.descricao || '').trim(),
    qtd:     _pbNum(i.qtd),
    preco:   _pbR2(i.preco),
    subtotal: _pbR2(_pbNum(i.qtd) * _pbNum(i.preco)),
    potencia_kwp_un: _pbNum(i.potencia_kwp_un),
  }));
  const primeiro = (tipo) => itensSalvos.find((i) => i.tipo === tipo && i.origem === 'componente');
  const modulo = primeiro('modulo');
  const inversor = primeiro('inversor');

  const shouldUsePopup = !isStandaloneDisplayMode();
  const popupRef = shouldUsePopup ? window.open('', '_blank') : null;
  try {
    const seller    = await resolveEffectiveSellerForClient(client);
    const descricao = (draft.descricao || '').trim() || _pbNomeSugerido(potencia);
    const descontoValor = _pbR2(Math.max(0, _pbNum(draft.descontoValor)));

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
      kit_price:               tot.total,
      kit_list_price:          tot.total,
      geracao_estimada:        calcularGeracaoEstimada(potencia, undefined, client.hsp),
      custom_system_power_kwp: potencia,
      custom_equipment_price:  tot.equipamentos,
      custom_service_price:    tot.servicos,
      custom_subtotal_price:   tot.subtotal,
      custom_frete:            tot.frete,
      custom_price_before_discount: _pbR2(tot.subtotal + tot.frete),
      custom_discount_type:    descontoValor > 0 ? draft.descontoTipo : null,
      custom_discount_value:   descontoValor > 0 ? descontoValor : null,
      custom_total_price:      tot.total,
      custom_totals:           { subtotal: tot.subtotal, equipamentos: tot.equipamentos, servicos: tot.servicos, desconto: tot.desconto, frete: tot.frete, total: tot.total },
      custom_config:           { versao: 2, itens: itensSalvos },
      custom_modulo_id:        modulo ? modulo.ref_id : null,
      custom_modulo_nome:      modulo ? modulo.descricao : null,
      custom_modulo_qty:       modulo ? Math.round(modulo.qtd) : null,
      custom_inversor_id:      inversor ? inversor.ref_id : null,
      custom_inversor_nome:    inversor ? inversor.descricao : null,
      custom_inversor_qty:     inversor ? Math.round(inversor.qtd) : null,
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
      captureEvent('proposal_created', { source: 'portal', mode: 'personalizada', itens: itensSalvos.length });
    }

    if (submitBtn) {
      submitBtn.innerHTML = '<i data-lucide="check" class="w-4 h-4 inline mr-1"></i> GERADO E COPIADO!';
      submitBtn.classList.remove('btn-primary');
      submitBtn.classList.add('btn-success');
      lucide.createIcons();
      setTimeout(() => {
        submitBtn.innerHTML = originalText;
        submitBtn.classList.remove('btn-success');
        submitBtn.classList.add('btn-primary');
        updateEquipamentosPreview();
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

  // Personalizada ou porta "Dimensionar" aberta: a lista de kits fica escondida.
  if (state.pbProposalMode !== PB_PROPOSAL_MODES.PROMOCIONAL || state.pbPorta === 'dim') {
    container.classList.add('hidden');
    emptyEl.classList.add('hidden');
    return;
  }

  // Kits fora de linha (ativo=false) não aparecem para o vendedor.
  let list = state.data.filter(k => k.categoria === state.pbCategory && k.ativo !== false
    && (typeof pbKitCompativel !== 'function' || pbKitCompativel(k)));

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
    const distribuidora = typeof pbKitDistribuidoraNome === 'function' ? pbKitDistribuidoraNome(item) : '';
    const fornecedorHTML = distribuidora ? `<p class="text-neutral-500 text-xs mt-1">Distribuidora: ${escapeHTML(distribuidora)}</p>` : '';

    // Cards container-aware: nada de breakpoints de viewport ditando linha/coluna
    // (o painel vive dentro da ficha e a largura do container é quem manda).
    // flex-wrap: quando falta espaço, preço e botão descem de linha em vez de
    // esmagar o nome do kit.
    if (state.pbViewMode === 'grid') {
      return `
        <div data-orcamento-kit="${safeId}" class="bg-[#0d0d0f] border border-neutral-800 hover:border-orange-500/40 p-4 flex flex-col gap-3 group transition-all">
          <div class="flex justify-between items-start gap-2">
            <span class="text-[9px] bg-orange-600/15 text-orange-500 px-2 py-0.5 font-black uppercase tracking-widest border border-orange-500/30">${safeBrand}</span>
            <span class="text-[10px] text-neutral-600 line-through decoration-red-500/70 font-bold shrink-0">De: ${formattedListPrice}</span>
          </div>
          <h3 class="text-white font-black text-sm uppercase leading-tight group-hover:text-orange-400 transition-colors">${safeName}</h3>
          ${fornecedorHTML}
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
      <div data-orcamento-kit="${safeId}" class="bg-[#0d0d0f] border border-neutral-800 hover:border-orange-500/40 p-4 flex flex-wrap items-center gap-x-6 gap-y-3 group transition-all">
        <div class="flex-1 min-w-[240px]">
          <span class="text-[9px] bg-orange-600/15 text-orange-500 px-2 py-0.5 font-black uppercase tracking-widest border border-orange-500/30 inline-block">${safeBrand}</span>
          <h3 class="text-white font-black text-sm uppercase leading-tight group-hover:text-orange-400 transition-colors mt-1.5">${safeName}</h3>
          ${fornecedorHTML}
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

  if (typeof orcamentoAtualizarResumo === 'function') orcamentoAtualizarResumo();
  lucide.createIcons();
}

// --- Lookup por ID para evitar JSON em onclick ---
function copyProposalLinkById(kitId, event) {
  if (typeof orcamentoAberto === 'function' && orcamentoAberto()) {
    orcamentoSelecionarKit(kitId);
    return;
  }
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
  if (typeof pbKitCompativel === 'function' && !pbKitCompativel(kit)) return showToast('Este kit não está disponível na seleção atual. Escolha outro kit.');
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
      source_product_id: kit.id || null, // a engenharia acha os equipamentos do kit por aqui
      distribuidora_id: kit.distribuidora_id || null,
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

  closeProposalSharePanel();

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
        <a href="${link}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-block"><i data-lucide="external-link"></i> Abrir link</a>
        <a href="${link.replace('/proposta.html?', '/proposta-pdf.html?')}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-block"><i data-lucide="file-down"></i> Baixar PDF</a>
        ${typeof orcamentoAberto === 'function' && orcamentoAberto() ? `
        <div class="pb-share-next flex flex-wrap justify-center gap-x-5 gap-y-2 pt-2">
          <button onclick="closeProposalSharePanel()" class="btn btn-ghost btn-sm"><i data-lucide="plus"></i> Fazer outro orçamento</button>
          <button onclick="closeProposalSharePanel(); orcamentoVerFicha()" class="btn btn-ghost btn-sm"><i data-lucide="id-card"></i> Ir para a ficha</button>
        </div>` : ''}
      </div>
    </div>`;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeProposalSharePanel(); });
  document.body.appendChild(overlay);
  document.addEventListener('keydown', _pbShareOnKeydown);
  lucide.createIcons();
}

function _pbShareOnKeydown(event) {
  if (event.key === 'Escape' && document.getElementById('pb-share-overlay')) closeProposalSharePanel();
}

function closeProposalSharePanel() {
  const el = document.getElementById('pb-share-overlay');
  if (el) el.remove();
  document.removeEventListener('keydown', _pbShareOnKeydown);
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

    const { data: novaVenda, error: insertError } = await supabaseClient.from('vendas').insert([{
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
    }]).select('id');

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
    showSalesCelebration({
      valor:         kit.preco,
      potencia:      kit.power,
      kitNome:       kit.nome,
      cliente:       client.nome,
      vendedorEmail: seller.vendedor_email,
      vendedorNome:  seller.vendedor_nome,
    });
    renderContent();
    // Ficha aberta por baixo? Reflete FECHADO + contador de vendas na hora.
    const fichaAberta = document.getElementById('crm360-overlay')?.classList.contains('is-open');
    if (fichaAberta && typeof renderCrm360 === 'function') renderCrm360();

    // Matriz: oferece gerar contrato/procuração na sequência — só se ainda não
    // foram feitos antes da venda (o comum é fazer antes, pela ficha do cliente)
    const novaVendaId = novaVenda && novaVenda[0] && novaVenda[0].id;
    if (novaVendaId && !client.documentos_dados && typeof canGerarDocumentos === 'function' && canGerarDocumentos()) {
      setTimeout(() => showConfirmModal('Venda registrada! Gerar contrato e procuração agora?', () => abrirDocumentosVenda(novaVendaId), 'GERAR AGORA', false), 900);
    }

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


















