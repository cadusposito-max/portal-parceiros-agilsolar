// ==========================================
// PAINEL ADMINISTRATIVO
// ==========================================

// --- Modal dinâmico do admin ---
function ensureAdminModal() {
  if (document.getElementById('admin-modal-overlay')) return;
  const div = document.createElement('div');
  div.id = 'admin-modal-overlay';
  div.className = 'fixed inset-0 z-[120] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 hidden';
  div.innerHTML = `
    <div class="bg-neutral-900 border-2 border-red-600/50 w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-[0_0_50px_rgba(239,68,68,0.2)]">
      <div class="flex justify-between items-center p-5 border-b border-neutral-800 bg-black/50 sticky top-0 z-10">
        <h2 id="admin-modal-title" class="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-orange-400 uppercase tracking-tighter pb-0.5">NOVO ITEM</h2>
        <button onclick="closeAdminModal()" class="text-neutral-500 hover:text-red-500 transition-colors"><i data-lucide="x" class="w-7 h-7"></i></button>
      </div>
      <form id="admin-modal-form" class="p-5 space-y-4" onsubmit="submitAdminModal(event)">
        <div id="admin-modal-fields"></div>
        <div class="flex gap-4 pt-2">
          <button type="button" onclick="closeAdminModal()"
            class="flex-1 py-3 bg-neutral-800 hover:bg-neutral-700 text-white font-black uppercase tracking-widest transition-colors text-sm">
            Cancelar
          </button>
          <button type="submit" id="admin-modal-save"
            class="flex-1 py-3 bg-gradient-to-r from-red-600 to-orange-500 hover:from-red-500 hover:to-orange-400 text-white font-black uppercase tracking-widest transition-all text-sm">
            SALVAR
          </button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(div);
}

let _adminModalCallback = null;

function _adminAccessDenied(message = 'Acesso restrito ao administrador.') {
  showToast(message);
  return false;
}

function _requireAdmin(options = {}) {
  const { silent = false, message = 'Acesso restrito ao administrador.' } = options;
  if (state.isAdmin) return true;
  if (!silent) _adminAccessDenied(message);
  return false;
}

function _requireAdminOrGestor(options = {}) {
  const { silent = false, message = 'Acesso restrito.' } = options;
  if (state.isAdmin || state.isGestor) return true;
  if (!silent) _adminAccessDenied(message);
  return false;
}

function openAdminModal(title, fieldsHTML, onSubmit) {
  ensureAdminModal();
  document.getElementById('admin-modal-title').textContent = title;
  document.getElementById('admin-modal-fields').innerHTML = fieldsHTML;
  _adminModalCallback = onSubmit;
  document.getElementById('admin-modal-overlay').classList.remove('hidden');
  lucide.createIcons();
}

function closeAdminModal() {
  const el = document.getElementById('admin-modal-overlay');
  if (el) el.classList.add('hidden');
  _adminModalCallback = null;
}

async function submitAdminModal(e) {
  e.preventDefault();
  if (!_adminModalCallback) return;
  const btn = document.getElementById('admin-modal-save');
  btn.textContent = 'SALVANDO...';
  btn.disabled = true;
  await _adminModalCallback();
  btn.textContent = 'SALVAR';
  btn.disabled = false;
}

// â”€â”€â”€ Painel Principal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function renderAdminPanel(container) {
  if (!_requireAdminOrGestor({ silent: true })) {
    container.className = 'flex flex-col gap-4';
    container.innerHTML = '<div class="border border-red-600/40 bg-red-950/20 p-5 text-red-300 text-sm font-bold">Acesso restrito ao painel administrativo.</div>';
    return;
  }

  container.className = 'flex flex-col gap-5';

  if (!state.adminSection) state.adminSection = 'produtos';

  // Gestor só acessa KITS (da própria franquia) e VENDEDORES (para ver a equipe)
  const allSections = [
    { id: 'produtos',      label: 'KITS',            icon: 'zap' },
    { id: 'financiadoras', label: 'FINANCIADORAS',   icon: 'landmark',   adminOnly: true },
    { id: 'componentes',   label: 'COMPONENTES',     icon: 'cpu',        adminOnly: true },
    { id: 'custos',        label: 'CUSTOS EXTRAS',   icon: 'circle-plus', adminOnly: true },
    { id: 'usuarios',      label: 'USUARIOS',        icon: 'user-cog',   adminOnly: true },
    { id: 'vendedores',    label: 'VENDEDORES',       icon: 'users' },
    { id: 'comunicados',   label: 'COMUNICADOS',      icon: 'megaphone',  adminOnly: true },
  ];
  const sections = allSections.filter(s => !s.adminOnly || state.isAdmin);

  if (!sections.some(s => s.id === state.adminSection)) {
    state.adminSection = sections[0]?.id || 'produtos';
  }

  const tabsHTML = sections.map(s => {
    const active = state.adminSection === s.id;
    return `<button onclick="setAdminSection('${s.id}')"
      class="${active
        ? 'bg-red-600 text-white border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.3)]'
        : 'bg-transparent border-neutral-800 text-neutral-500 hover:text-neutral-300 hover:border-neutral-700'
      } border px-4 py-2.5 font-black uppercase text-[9px] tracking-widest flex items-center gap-2 transition-all">
      <i data-lucide="${s.icon}" class="w-3.5 h-3.5"></i>${s.label}
    </button>`;
  }).join('');

  container.innerHTML = `
    <div class="bg-red-950/10 border border-red-600/20 p-4 flex items-center gap-3">
      <div class="bg-red-600/20 border border-red-600/30 p-2 text-red-400 shrink-0">
        <i data-lucide="shield-check" class="w-4 h-4"></i>
      </div>
      <div>
        <span class="text-red-400 font-black uppercase tracking-widest text-[9px] block">MODO ADMINISTRADOR</span>
        <span class="text-white font-bold text-sm">Gerenciamento do Sistema Agilsolar</span>
      </div>
    </div>
    <div class="flex flex-wrap gap-1.5">${tabsHTML}</div>
    <div id="admin-section-content" class="min-h-[200px]"></div>
  `;

  lucide.createIcons();

  const content = document.getElementById('admin-section-content');
  const adminBar = document.getElementById('admin-bar');

  if (state.adminSection === 'produtos') {
    state.isEditMode = true;
    if (adminBar) adminBar.classList.remove('hidden');
    renderAdminKitsSection(content);
  } else {
    if (adminBar) adminBar.classList.add('hidden');
    if (state.adminSection === 'financiadoras') renderAdminFinanciadoras(content);
    else if (state.adminSection === 'componentes') renderAdminComponentes(content);
    else if (state.adminSection === 'custos')      renderAdminCustos(content);
    else if (state.adminSection === 'usuarios')    renderAdminUsuarios(content);
    else if (state.adminSection === 'vendedores')  renderAdminVendedores(content);
    else if (state.adminSection === 'comunicados') renderAdminComunicados(content);
    else if (state.adminSection === 'franquias')   renderAdminFranquias(content);
  }
}

function setAdminSection(section) {
  if (!_requireAdminOrGestor()) return;
  state.adminSection = section;
  const container = document.getElementById('main-container');
  if (container) renderAdminPanel(container);
}

async function renderAdminKitsSection(container) {
  if (!_requireAdminOrGestor()) return;
  container.innerHTML = `<div class="flex items-center justify-center py-8 text-neutral-600">
    <i data-lucide="loader-2" class="w-6 h-6 animate-spin mr-2"></i><span class="font-bold uppercase text-[10px] tracking-widest">Carregando...</span>
  </div>`;
  lucide.createIcons();

  const franquiasQuery = supabaseClient
    .from('franquias')
    .select('id, nome')
    .eq('ativo', true)
    .order('created_at', { ascending: true });

  // Gestor só enxerga a própria franquia no seletor de kits
  if (state.isGestor && state.franquiaId) {
    franquiasQuery.eq('id', state.franquiaId);
  }

  const { data: franquias = [] } = await franquiasQuery;

  // Para gestor, travar sempre na própria franquia
  if (state.isGestor) {
    state.adminKitsFranquia = state.franquiaId;
  } else if (!state.adminKitsFranquia || !franquias.find(f => f.id === state.adminKitsFranquia)) {
    state.adminKitsFranquia = franquias[0]?.id || null;
  }

  const tabsHTML = franquias.map(f => {
    const active = state.adminKitsFranquia === f.id;
    return `<button onclick="setAdminKitsFranquia('${f.id}')"
      class="${active
        ? 'bg-purple-600 text-white border-purple-500 shadow-[0_0_10px_rgba(147,51,234,0.3)]'
        : 'bg-transparent border-neutral-800 text-neutral-500 hover:text-neutral-300 hover:border-neutral-700'
      } border px-3 py-2 font-black uppercase text-[9px] tracking-widest flex items-center gap-1.5 transition-all whitespace-nowrap">
      <i data-lucide="building-2" class="w-3 h-3"></i>${escapeHTML(f.nome)}
    </button>`;
  }).join('');

  // Gestor: esconder o seletor de franquia (só existe a dele)
  const showFranquiaTabs = state.isAdmin && franquias.length > 0;

  container.innerHTML = `
    <div class="flex flex-col gap-4">
      ${showFranquiaTabs ? `
      <div class="bg-purple-950/20 border border-purple-600/20 p-3 flex flex-wrap items-center gap-2">
        <span class="text-purple-400 font-black uppercase tracking-widest text-[9px] shrink-0">PREÇOS DA UNIDADE:</span>
        ${tabsHTML}
      </div>` : ''}
      <div id="admin-kits-grid"></div>
    </div>`;
  lucide.createIcons();

  await fetchProducts();
  const grid = document.getElementById('admin-kits-grid');
  if (grid) renderProductsList(grid);
}

async function setAdminKitsFranquia(franquiaId) {
  if (!_requireAdminOrGestor()) return;
  if (state.isGestor && state.franquiaId && String(franquiaId) !== String(state.franquiaId)) {
    _adminAccessDenied('Gestor só pode editar a própria franquia.');
    return;
  }

  state.adminKitsFranquia = franquiaId;
  const content = document.getElementById('admin-section-content');
  if (content) renderAdminKitsSection(content);
}

// â”€â”€â”€ Helpers compartilhados â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const _inputCls  = 'w-full bg-black border border-neutral-700 focus:border-red-500 px-4 py-3 text-white font-bold transition-all';
const _labelCls  = 'text-[10px] text-red-400 font-black uppercase tracking-widest block mb-1';
const _selectCls = 'w-full bg-black border border-neutral-700 focus:border-red-500 px-4 py-3 text-white font-bold uppercase';

function _statusBadge(ativo) {
  return `<span class="px-2 py-0.5 text-[8px] font-black uppercase border shrink-0 ${ativo
    ? 'text-green-400 border-green-800 bg-green-900/20'
    : 'text-red-400 border-red-800 bg-red-900/10'}">${ativo ? 'ATIVO' : 'INATIVO'}</span>`;
}
function _chatAccessBadge(enabled) {
  return `<span class="px-2 py-0.5 text-[8px] font-black uppercase border shrink-0 ${enabled
    ? 'text-cyan-300 border-cyan-700 bg-cyan-900/20'
    : 'text-neutral-300 border-neutral-700 bg-neutral-900/30'}">${enabled ? 'CHAT ON' : 'CHAT OFF'}</span>`;
}

function _editBtn(onclick) {
  return `<button onclick="${onclick}" class="p-1.5 bg-blue-600/20 text-blue-400 hover:bg-blue-600 hover:text-white transition-colors shrink-0"><i data-lucide="edit-2" class="w-4 h-4"></i></button>`;
}

function _deleteBtn(onclick) {
  return `<button onclick="${onclick}" class="p-1.5 bg-red-600/20 text-red-400 hover:bg-red-600 hover:text-white transition-colors shrink-0"><i data-lucide="trash-2" class="w-4 h-4"></i></button>`;
}

function _addBtn(label, onclick) {
  return `<button onclick="${onclick}"
    class="flex items-center gap-2 bg-gradient-to-r from-red-600 to-orange-500 hover:from-red-500 hover:to-orange-400 text-white px-4 py-2 font-black uppercase tracking-wider text-[10px] transition-all">
    <i data-lucide="plus" class="w-3.5 h-3.5 stroke-[3px]"></i>${label}
  </button>`;
}

async function deleteAdminItem(table, id) {
  if (!_requireAdmin()) return;

  showConfirmModal('Tem certeza? Esta ação não pode ser desfeita.', async () => {
    const { error } = await supabaseClient.from(table).delete().eq('id', id);
    if (error) { showToast('ERRO: ' + error.message); return; }
    showToast('ITEM REMOVIDO');
    const c = document.getElementById('admin-section-content');
    if (!c) return;
    if (table === 'financiadoras') renderAdminFinanciadoras(c);
    else if (table === 'componentes') renderAdminComponentes(c);
    else if (table === 'custos_extras') renderAdminCustos(c);
  });
}

// â”€â”€â”€ Financiadoras â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function renderAdminFinanciadoras(container) {
  if (!_requireAdmin({ silent: true })) {
    container.innerHTML = `<div class="border border-red-600/40 bg-red-950/20 p-4 text-red-300 text-sm font-bold">Acesso restrito ao administrador.</div>`;
    return;
  }

  container.innerHTML = `<div class="flex items-center justify-center py-12 text-neutral-600">
    <i data-lucide="loader-2" class="w-6 h-6 animate-spin mr-2"></i><span class="font-bold uppercase text-[10px] tracking-widest">Carregando...</span>
  </div>`;
  lucide.createIcons();

  const { data: items = [], error } = await supabaseClient
    .from('financiadoras')
    .select('*')
    .order('ordem', { ascending: true });

  if (error) {
    container.innerHTML = `<p class="text-red-500 text-sm font-bold p-4 border border-red-800 bg-red-900/10">Erro ao carregar: ${escapeHTML(error.message)}</p>`;
    return;
  }

  const rows = items.length === 0
    ? `<p class="text-neutral-600 text-sm font-bold text-center py-10">Nenhuma financiadora cadastrada.</p>`
    : items.map(item => `
      <div class="flex items-center gap-3 bg-neutral-900/60 border border-neutral-800 p-4 hover:border-neutral-700 transition-all">
        <div class="shrink-0 w-9 h-9 flex items-center justify-center text-xl border border-neutral-700 bg-neutral-950">${escapeHTML(item.icone_texto || '\u{1F3E6}')}</div>
        <div class="flex-1 min-w-0">
          <p class="text-white font-black text-sm uppercase truncate">${escapeHTML(item.nome)}</p>
          <p class="text-neutral-500 text-[10px] font-bold">${escapeHTML(item.taxa_texto || '—')} · ${escapeHTML(item.prazo_texto || '—')} · Ordem: ${item.ordem}</p>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          ${_statusBadge(item.ativo)}
          ${_editBtn(`openAdminFinanciadoraForm('${item.id}')`)}
          ${_deleteBtn(`deleteAdminItem('financiadoras','${item.id}')`)}
        </div>
      </div>`).join('');

  container.innerHTML = `
    <div class="flex justify-between items-center mb-4">
      <span class="text-neutral-500 text-[10px] font-black uppercase tracking-widest">${items.length} financiadora(s)</span>
      ${_addBtn('NOVA FINANCIADORA', "openAdminFinanciadoraForm()")}
    </div>
    <div class="flex flex-col gap-2">${rows}</div>`;
  lucide.createIcons();
}

function openAdminFinanciadoraForm(id) {
  if (!_requireAdmin()) return;

  const fieldsHTML = `
    <input type="hidden" id="af-id" value="${id || ''}">
    <div class="grid grid-cols-2 gap-4">
      <div class="col-span-2"><label class="${_labelCls}">Nome *</label>
        <input required id="af-nome" class="${_inputCls} uppercase" placeholder="NOME DA FINANCIADORA"></div>
      <div class="col-span-2"><label class="${_labelCls}">URL *</label>
        <input required id="af-url" type="url" class="${_inputCls} font-mono text-sm" placeholder="https://..."></div>
      <div><label class="${_labelCls}">Taxa (texto)</label>
        <input id="af-taxa" class="${_inputCls}" placeholder="A partir de 1,5% a.m."></div>
      <div><label class="${_labelCls}">Prazo (texto)</label>
        <input id="af-prazo" class="${_inputCls}" placeholder="Até 60 meses"></div>      <div><label class="${_labelCls}">Ícone (emoji)</label>
        <input id="af-icone" class="${_inputCls} text-2xl" placeholder="\u{1F3E6}" maxlength="4"></div>
      <div><label class="${_labelCls}">Ordem</label>
        <input type="number" id="af-ordem" class="${_inputCls} font-mono" value="0"></div>
      <div class="col-span-2"><label class="${_labelCls}">Cor CSS (Tailwind gradient)</label>
        <input id="af-cor" class="${_inputCls} font-mono text-sm" placeholder="from-blue-600 to-blue-400"></div>
      <label class="col-span-2 flex items-center gap-3 cursor-pointer">
        <input type="checkbox" id="af-ativo" checked class="w-4 h-4 accent-red-500">
        <span class="text-white font-bold text-sm uppercase">Ativo</span>
      </label>
    </div>`;

  openAdminModal(id ? 'EDITAR FINANCIADORA' : 'NOVA FINANCIADORA', fieldsHTML, async () => {
    const existingId = document.getElementById('af-id').value;
    const payload = {
      nome:        document.getElementById('af-nome').value.trim().toUpperCase(),
      url:         document.getElementById('af-url').value.trim(),
      taxa_texto:  document.getElementById('af-taxa').value.trim() || null,
      prazo_texto: document.getElementById('af-prazo').value.trim() || null,
      icone_texto: document.getElementById('af-icone').value.trim() || null,
      cor_css:     document.getElementById('af-cor').value.trim() || null,
      ordem:       parseInt(document.getElementById('af-ordem').value) || 0,
      ativo:       document.getElementById('af-ativo').checked,
      updated_at:  new Date().toISOString(),
    };
    const { error } = existingId
      ? await supabaseClient.from('financiadoras').update(payload).eq('id', existingId)
      : await supabaseClient.from('financiadoras').insert([payload]);
    if (error) { showToast('ERRO: ' + error.message); return; }
    closeAdminModal();
    showToast('FINANCIADORA SALVA COM SUCESSO');
    const c = document.getElementById('admin-section-content');
    if (c) renderAdminFinanciadoras(c);
  });

  if (id) {
    supabaseClient.from('financiadoras').select('*').eq('id', id).single().then(({ data }) => {
      if (!data) return;
      document.getElementById('af-nome').value   = data.nome || '';
      document.getElementById('af-url').value    = data.url || '';
      document.getElementById('af-taxa').value   = data.taxa_texto || '';
      document.getElementById('af-prazo').value  = data.prazo_texto || '';
      document.getElementById('af-icone').value  = data.icone_texto || '';
      document.getElementById('af-cor').value    = data.cor_css || '';
      document.getElementById('af-ordem').value  = data.ordem ?? 0;
      document.getElementById('af-ativo').checked = data.ativo !== false;
    });
  }
}

// â”€â”€â”€ Componentes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function renderAdminComponentes(container) {
  if (!_requireAdmin({ silent: true })) {
    container.innerHTML = `<div class="border border-red-600/40 bg-red-950/20 p-4 text-red-300 text-sm font-bold">Acesso restrito ao administrador.</div>`;
    return;
  }

  container.innerHTML = `<div class="flex items-center justify-center py-12 text-neutral-600">
    <i data-lucide="loader-2" class="w-6 h-6 animate-spin mr-2"></i><span class="font-bold uppercase text-[10px] tracking-widest">Carregando...</span>
  </div>`;
  lucide.createIcons();

  const { data: items = [], error } = await supabaseClient
    .from('componentes')
    .select('*')
    .order('tipo')
    .order('nome');

  if (error) {
    container.innerHTML = `<p class="text-red-500 text-sm font-bold p-4 border border-red-800 bg-red-900/10">Erro ao carregar: ${escapeHTML(error.message)}</p>`;
    return;
  }

  const grupos = [
        { tipo: 'modulo',   label: 'MÓDULOS' },
    { tipo: 'inversor', label: 'INVERSORES' },
  ];

  const gruposHTML = grupos.map(g => {
    const gItems = items.filter(c => c.tipo === g.tipo);
    if (gItems.length === 0) return '';
    const rowsHTML = gItems.map(item => `
      <div class="flex items-center gap-3 border-b border-neutral-800/60 p-3 hover:bg-neutral-900 transition-all">
        <div class="flex-1 min-w-0">
          <p class="text-white font-bold text-sm truncate">${escapeHTML(item.nome)}</p>
          <p class="text-neutral-500 text-[10px] font-bold">
            ${item.potencia_wp ? item.potencia_wp + ' Wp' : '—'}
            · R$ ${Number(item.preco_unitario).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          ${_statusBadge(item.ativo)}
          ${_editBtn(`openAdminComponenteForm('${item.id}')`)}
          ${_deleteBtn(`deleteAdminItem('componentes','${item.id}')`)}
        </div>
      </div>`).join('');
    return `
      <div class="mb-4">
        <p class="text-neutral-600 text-[9px] font-black uppercase tracking-widest mb-2 border-b border-neutral-800 pb-2">${g.label} (${gItems.length})</p>
        <div class="bg-neutral-900/40 border border-neutral-800">${rowsHTML}</div>
      </div>`;
  }).join('');

  const emptyMsg = items.length === 0
    ? `<p class="text-neutral-600 text-sm font-bold text-center py-10">Nenhum componente cadastrado.</p>`
    : '';

  container.innerHTML = `
    <div class="flex justify-between items-center mb-4">
      <span class="text-neutral-500 text-[10px] font-black uppercase tracking-widest">${items.length} componente(s)</span>
      ${_addBtn('NOVO COMPONENTE', "openAdminComponenteForm()")}
    </div>
    ${emptyMsg}${gruposHTML}`;
  lucide.createIcons();
}

function openAdminComponenteForm(id) {
  if (!_requireAdmin()) return;

  const fieldsHTML = `
    <input type="hidden" id="ac-id" value="${id || ''}">
    <div class="grid grid-cols-2 gap-4">
      <div><label class="${_labelCls}">Tipo *</label>
        <select required id="ac-tipo" class="${_selectCls}">
          <option value="modulo">MÓDULO</option>
          <option value="inversor">INVERSOR</option>
        </select></div>
      <div><label class="${_labelCls}">Potência (Wp)</label>
        <input type="number" step="0.1" id="ac-potencia" class="${_inputCls} font-mono" placeholder="550"></div>
      <div class="col-span-2"><label class="${_labelCls}">Nome *</label>
        <input required id="ac-nome" class="${_inputCls}" placeholder="Modelo / Descrição completa"></div>
      <div class="col-span-2"><label class="${_labelCls}">Preço Unitário (R$) *</label>
        <input required type="number" step="0.01" id="ac-preco"
          class="w-full bg-black border border-green-900 focus:border-green-500 text-green-400 px-4 py-3 font-mono font-bold transition-all"
          placeholder="0.00"></div>
      <label class="col-span-2 flex items-center gap-3 cursor-pointer">
        <input type="checkbox" id="ac-ativo" checked class="w-4 h-4 accent-red-500">
        <span class="text-white font-bold text-sm uppercase">Ativo</span>
      </label>
    </div>`;

  openAdminModal(id ? 'EDITAR COMPONENTE' : 'NOVO COMPONENTE', fieldsHTML, async () => {
    const existingId = document.getElementById('ac-id').value;
    const payload = {
      tipo:          document.getElementById('ac-tipo').value,
      nome:          document.getElementById('ac-nome').value.trim(),
      potencia_wp:   parseFloat(document.getElementById('ac-potencia').value) || null,
      preco_unitario: parseFloat(document.getElementById('ac-preco').value) || 0,
      ativo:         document.getElementById('ac-ativo').checked,
    };
    const { error } = existingId
      ? await supabaseClient.from('componentes').update(payload).eq('id', existingId)
      : await supabaseClient.from('componentes').insert([payload]);
    if (error) { showToast('ERRO: ' + error.message); return; }
    closeAdminModal();
    showToast('COMPONENTE SALVO COM SUCESSO');
    const c = document.getElementById('admin-section-content');
    if (c) renderAdminComponentes(c);
  });

  if (id) {
    supabaseClient.from('componentes').select('*').eq('id', id).single().then(({ data }) => {
      if (!data) return;
      document.getElementById('ac-tipo').value     = data.tipo || 'modulo';
      document.getElementById('ac-nome').value     = data.nome || '';
      document.getElementById('ac-potencia').value = data.potencia_wp || '';
      document.getElementById('ac-preco').value    = data.preco_unitario || '';
      document.getElementById('ac-ativo').checked  = data.ativo !== false;
    });
  }
}

// â”€â”€â”€ Custos Extras â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function renderAdminCustos(container) {
  if (!_requireAdmin({ silent: true })) {
    container.innerHTML = `<div class="border border-red-600/40 bg-red-950/20 p-4 text-red-300 text-sm font-bold">Acesso restrito ao administrador.</div>`;
    return;
  }

  container.innerHTML = `<div class="flex items-center justify-center py-12 text-neutral-600">
    <i data-lucide="loader-2" class="w-6 h-6 animate-spin mr-2"></i><span class="font-bold uppercase text-[10px] tracking-widest">Carregando...</span>
  </div>`;
  lucide.createIcons();

  const { data: items = [], error } = await supabaseClient
    .from('custos_extras')
    .select('*')
    .order('ordem', { ascending: true });

  if (error) {
    container.innerHTML = `<p class="text-red-500 text-sm font-bold p-4 border border-red-800 bg-red-900/10">Erro ao carregar: ${escapeHTML(error.message)}</p>`;
    return;
  }

  const rows = items.length === 0
    ? `<p class="text-neutral-600 text-sm font-bold text-center py-10">Nenhum custo extra cadastrado.</p>`
    : items.map(item => `
      <div class="flex items-center gap-3 bg-neutral-900/60 border border-neutral-800 p-4 hover:border-neutral-700 transition-all">
        <div class="flex-1 min-w-0">
          <p class="text-white font-bold text-sm truncate">${escapeHTML(item.nome)}</p>
          <p class="text-neutral-500 text-[10px] font-bold">
            ${item.tipo_calculo === 'percentual'
              ? item.valor + '%'
              : 'R$ ' + Number(item.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            · Ordem: ${item.ordem}
            ${item.descricao ? ' · ' + escapeHTML(item.descricao) : ''}
          </p>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          ${_statusBadge(item.ativo)}
          ${_editBtn(`openAdminCustoForm('${item.id}')`)}
          ${_deleteBtn(`deleteAdminItem('custos_extras','${item.id}')`)}
        </div>
      </div>`).join('');

  container.innerHTML = `
    <div class="flex justify-between items-center mb-4">
      <span class="text-neutral-500 text-[10px] font-black uppercase tracking-widest">${items.length} custo(s)</span>
      ${_addBtn('NOVO CUSTO', "openAdminCustoForm()")}
    </div>
    <div class="flex flex-col gap-2">${rows}</div>`;
  lucide.createIcons();
}

// â”€â”€â”€ Vendedores â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function renderAdminVendedores(container) {
  if (!_requireAdminOrGestor({ silent: true })) {
    container.innerHTML = `<div class="border border-red-600/40 bg-red-950/20 p-4 text-red-300 text-sm font-bold">Acesso restrito.</div>`;
    return;
  }

  container.innerHTML = `<div class="flex items-center justify-center py-12 text-neutral-600">
    <i data-lucide="loader-2" class="w-6 h-6 animate-spin mr-2"></i><span class="font-bold uppercase text-[10px] tracking-widest">Carregando...</span>
  </div>`;
  lucide.createIcons();

  const { data: items = [], error } = await supabaseClient
    .from('vendedores_stats')
    .select('*')
    .order('email', { ascending: true });

  if (error) {
    container.innerHTML = `<p class="text-red-500 text-sm font-bold p-4 border border-red-800 bg-red-900/10">Erro ao carregar: ${escapeHTML(error.message)}</p>`;
    return;
  }

  const rows = items.length === 0
    ? `<p class="text-neutral-600 text-sm font-bold text-center py-10">Nenhum vendedor encontrado.</p>`
    : items.map(item => `
      <div class="flex items-center gap-3 bg-neutral-900/60 border border-neutral-800 p-4 hover:border-neutral-700 transition-all">
        <div class="shrink-0 w-9 h-9 rounded-full bg-neutral-800 flex items-center justify-center text-neutral-400 font-black text-sm">
          ${escapeHTML((item.email || '?').charAt(0).toUpperCase())}
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-white font-bold text-sm truncate">${escapeHTML(item.email || '—')}</p>
          <p class="text-neutral-500 text-[10px] font-bold">
            ${item.total_logins || 0} login(s)
            ${item.ultimo_acesso ? ' · Último acesso: ' + formatDate(item.ultimo_acesso) : ''}
          </p>
        </div>
        <div class="shrink-0 flex items-center gap-2">
          <span class="text-neutral-500 text-[10px] font-black uppercase tracking-widest">Comissão:</span>
          <input type="number" min="0" max="100" step="0.5"
            value="${item.comissao_pct ?? 5}"
            onchange="saveVendedorComissao('${escapeHTML(item.email)}', this.value)"
            class="w-20 bg-neutral-800 border border-neutral-700 hover:border-orange-500 focus:border-orange-500 text-white text-center font-black text-sm px-2 py-1.5 outline-none transition-all" />
          <span class="text-neutral-500 text-sm font-black">%</span>
        </div>
      </div>`).join('');

  container.innerHTML = `
    <div class="flex justify-between items-center mb-4">
      <span class="text-neutral-500 text-[10px] font-black uppercase tracking-widest">${items.length} vendedor(es)</span>
    </div>
    <div class="flex flex-col gap-2">${rows}</div>`;
  lucide.createIcons();
}

async function saveVendedorComissao(email, valor) {
  if (!_requireAdmin()) return;

  const pct = parseFloat(valor);
  if (isNaN(pct) || pct < 0 || pct > 100) {
    showToast('Valor inválido. Use entre 0 e 100.');
    return;
  }
  const { error } = await supabaseClient
    .from('vendedores_stats')
    .update({ comissao_pct: pct })
    .eq('email', email);
  if (error) {
    showToast('ERRO: ' + error.message);
  } else {
    showToast(`Comissão de ${escapeHTML(email.split('@')[0])} atualizada para ${pct}%`);
    // Atualiza state em tempo real se for a própria comissão
    if (state.currentUser && email === state.currentUser.email) {
      state.comissaoPct = pct;
    }
  }
}

// --- Usuarios (somente Admin) ---
function _roleBadge(role) {
  const normalized = (role || 'vendedor').toLowerCase();
  if (normalized === 'admin') {
    return '<span class="px-2 py-0.5 text-[8px] font-black uppercase border text-purple-300 border-purple-700 bg-purple-900/30">ADMIN</span>';
  }
  if (normalized === 'gestor') {
    return '<span class="px-2 py-0.5 text-[8px] font-black uppercase border text-blue-300 border-blue-700 bg-blue-900/30">GESTOR</span>';
  }
  return '<span class="px-2 py-0.5 text-[8px] font-black uppercase border text-neutral-300 border-neutral-700 bg-neutral-900/30">VENDEDOR</span>';
}

async function fetchAdminUsuarios() {
  if (!_requireAdmin()) return [];

  const { data, error } = await supabaseClient.rpc('admin_list_users_chat');
  if (error) throw error;
  return data || [];
}

function setAdminUsuariosSearch(value) {
  state.adminUsersSearch = value || '';
  const c = document.getElementById('admin-section-content');
  if (c) renderAdminUsuarios(c);
}

function setAdminUsuariosFilter(type, value) {
  if (type === 'status') state.adminUsersStatus = value || 'all';
  if (type === 'role') state.adminUsersRole = value || 'all';
  if (type === 'franquia') state.adminUsersFranquia = value || 'all';
  const c = document.getElementById('admin-section-content');
  if (c) renderAdminUsuarios(c);
}

async function renderAdminUsuarios(container) {
  if (!_requireAdmin({ silent: true })) {
    container.innerHTML = `<div class="border border-red-600/40 bg-red-950/20 p-4 text-red-300 text-sm font-bold">Acesso restrito ao administrador.</div>`;
    return;
  }

  container.innerHTML = `<div class="flex items-center justify-center py-12 text-neutral-600">
    <i data-lucide="loader-2" class="w-6 h-6 animate-spin mr-2"></i><span class="font-bold uppercase text-[10px] tracking-widest">Carregando...</span>
  </div>`;
  lucide.createIcons();

  let items = [];
  try {
    items = await fetchAdminUsuarios();
  } catch (error) {
    container.innerHTML = `<p class="text-red-500 text-sm font-bold p-4 border border-red-800 bg-red-900/10">Erro ao carregar: ${escapeHTML(error.message || 'Falha ao carregar usuarios')}</p>`;
    return;
  }

  if (typeof state.adminUsersSearch !== 'string') state.adminUsersSearch = '';
  if (!state.adminUsersStatus) state.adminUsersStatus = 'all';
  if (!state.adminUsersRole) state.adminUsersRole = 'all';
  if (!state.adminUsersFranquia) state.adminUsersFranquia = 'all';

  const totalUsuarios = items.length;
  const totalAtivos = items.filter(i => i.ativo !== false).length;
  const totalInativos = totalUsuarios - totalAtivos;
  const totalChatOn = items.filter(i => i.chat_enabled === true).length;

  const search = state.adminUsersSearch.trim().toLowerCase();
  const statusFilter = state.adminUsersStatus;
  const roleFilter = state.adminUsersRole;
  const franquiaFilter = state.adminUsersFranquia;

  const franquiaMap = new Map();
  items.forEach(i => {
    if (i.franquia_id) {
      franquiaMap.set(i.franquia_id, i.franquia_nome || 'Sem nome');
    }
  });
  const franquiaOptions = Array.from(franquiaMap.entries())
    .sort((a, b) => String(a[1]).localeCompare(String(b[1]), 'pt-BR'));

  const filteredItems = items.filter(item => {
    const isAtivo = item.ativo !== false;
    const role = (item.role || 'vendedor').toLowerCase();
    const franquiaId = item.franquia_id || '__none__';

    if (statusFilter === 'ativos' && !isAtivo) return false;
    if (statusFilter === 'inativos' && isAtivo) return false;

    if (roleFilter !== 'all' && role !== roleFilter) return false;

    if (franquiaFilter !== 'all' && franquiaId !== franquiaFilter) return false;

    if (search) {
      const nome = String(item.nome || '').toLowerCase();
      const email = String(item.email || '').toLowerCase();
      const franquiaNome = String(item.franquia_nome || '').toLowerCase();
      if (!nome.includes(search) && !email.includes(search) && !franquiaNome.includes(search)) {
        return false;
      }
    }

    return true;
  });

  const rows = filteredItems.length === 0
    ? `<p class="text-neutral-600 text-sm font-bold text-center py-10">Nenhum usuario encontrado.</p>`
    : filteredItems.map(item => `
      <div class="flex flex-col sm:flex-row sm:items-center gap-3 bg-neutral-900/60 border border-neutral-800 p-4 hover:border-neutral-700 transition-all">
        <div class="flex-1 min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <p class="text-white font-bold text-sm truncate">${escapeHTML(item.nome || item.email || '—')}</p>
            ${_roleBadge(item.role)}
            ${_statusBadge(item.ativo !== false)}
            ${_chatAccessBadge(item.chat_enabled === true)}
          </div>
          <p class="text-neutral-500 text-[10px] font-bold truncate">${escapeHTML(item.email || '?')}</p>
          <p class="text-neutral-600 text-[10px] font-bold">
            ${escapeHTML(item.franquia_nome || 'Sem franquia')}
            ${item.last_sign_in_at ? ' • Último acesso: ' + formatDate(item.last_sign_in_at) : ''}
          </p>
          ${(item.role || 'vendedor').toLowerCase() === 'vendedor'
            ? `<p class="text-neutral-600 text-[10px] font-bold">Gestor vinculado: ${escapeHTML(item.gestor_nome || 'Nao vinculado')}</p>`
            : ''}
        </div>
        <div class="shrink-0 flex items-center gap-2">
          <button onclick="openAdminUsuarioForm('${item.user_id}')"
            class="px-3 py-1.5 bg-blue-600/20 border border-blue-500/30 text-blue-300 hover:bg-blue-600 hover:text-white hover:border-blue-600 font-black uppercase text-[8px] tracking-widest transition-all flex items-center gap-1.5">
            <i data-lucide="edit-2" class="w-3 h-3"></i> EDITAR
          </button>
          <button onclick="toggleAdminUsuarioAtivo('${item.user_id}', ${item.ativo === false ? 'true' : 'false'})"
            class="px-3 py-1.5 ${item.ativo === false ? 'bg-green-600/20 border-green-500/30 text-green-300 hover:bg-green-600 hover:border-green-600' : 'bg-red-600/20 border-red-500/30 text-red-300 hover:bg-red-600 hover:border-red-600'} border hover:text-white font-black uppercase text-[8px] tracking-widest transition-all flex items-center gap-1.5">
            <i data-lucide="${item.ativo === false ? 'power' : 'ban'}" class="w-3 h-3"></i> ${item.ativo === false ? 'ATIVAR' : 'DESATIVAR'}
          </button>
        </div>
      </div>`).join('');

  container.innerHTML = `
    <div class="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4">
      <div class="bg-neutral-900/60 border border-neutral-800 p-3">
        <p class="text-neutral-500 text-[8px] font-black uppercase tracking-widest">TOTAL</p>
        <p class="text-white font-black text-lg">${totalUsuarios}</p>
      </div>
      <div class="bg-green-950/20 border border-green-700/30 p-3">
        <p class="text-green-400/80 text-[8px] font-black uppercase tracking-widest">ATIVOS</p>
        <p class="text-green-300 font-black text-lg">${totalAtivos}</p>
      </div>
      <div class="bg-red-950/20 border border-red-700/30 p-3">
        <p class="text-red-400/80 text-[8px] font-black uppercase tracking-widest">INATIVOS</p>
        <p class="text-red-300 font-black text-lg">${totalInativos}</p>
      </div>
      <div class="bg-cyan-950/20 border border-cyan-700/30 p-3">
        <p class="text-cyan-300/80 text-[8px] font-black uppercase tracking-widest">CHAT ON</p>
        <p class="text-cyan-200 font-black text-lg">${totalChatOn}</p>
      </div>
      <div class="bg-blue-950/20 border border-blue-700/30 p-3">
        <p class="text-blue-400/80 text-[8px] font-black uppercase tracking-widest">EXIBINDO</p>
        <p class="text-blue-300 font-black text-lg">${filteredItems.length}</p>
      </div>
    </div>

    <div class="flex flex-col lg:flex-row gap-2 mb-4">
      <input
        type="text"
        value="${escapeHTML(state.adminUsersSearch)}"
        oninput="setAdminUsuariosSearch(this.value)"
        placeholder="Buscar por nome, email ou franquia..."
        class="flex-1 bg-black border border-neutral-700 focus:border-orange-500 px-4 py-2.5 text-white font-bold transition-all"
      >
      <select onchange="setAdminUsuariosFilter('status', this.value)" class="bg-black border border-neutral-700 focus:border-orange-500 px-3 py-2.5 text-white font-bold uppercase text-[11px]">
        <option value="all" ${statusFilter === 'all' ? 'selected' : ''}>TODOS STATUS</option>
        <option value="ativos" ${statusFilter === 'ativos' ? 'selected' : ''}>ATIVOS</option>
        <option value="inativos" ${statusFilter === 'inativos' ? 'selected' : ''}>INATIVOS</option>
      </select>
      <select onchange="setAdminUsuariosFilter('role', this.value)" class="bg-black border border-neutral-700 focus:border-orange-500 px-3 py-2.5 text-white font-bold uppercase text-[11px]">
        <option value="all" ${roleFilter === 'all' ? 'selected' : ''}>TODOS PERFIS</option>
        <option value="admin" ${roleFilter === 'admin' ? 'selected' : ''}>ADMIN</option>
        <option value="gestor" ${roleFilter === 'gestor' ? 'selected' : ''}>GESTOR</option>
        <option value="vendedor" ${roleFilter === 'vendedor' ? 'selected' : ''}>VENDEDOR</option>
      </select>
      <select onchange="setAdminUsuariosFilter('franquia', this.value)" class="bg-black border border-neutral-700 focus:border-orange-500 px-3 py-2.5 text-white font-bold uppercase text-[11px]">
        <option value="all" ${franquiaFilter === 'all' ? 'selected' : ''}>TODAS FRANQUIAS</option>
        <option value="__none__" ${franquiaFilter === '__none__' ? 'selected' : ''}>SEM FRANQUIA</option>
        ${franquiaOptions.map(([id, nome]) => `<option value="${id}" ${franquiaFilter === id ? 'selected' : ''}>${escapeHTML(nome)}</option>`).join('')}
      </select>
    </div>

    <div class="flex justify-between items-center mb-4 gap-2 flex-wrap">
      <span class="text-neutral-500 text-[10px] font-black uppercase tracking-widest">${filteredItems.length} usuario(s) na lista</span>
      ${_addBtn('NOVO USUARIO', 'openAdminUsuarioForm()')}
    </div>
    <div class="bg-amber-950/20 border border-amber-700/30 p-3 flex items-start gap-2 mb-4">
      <i data-lucide="shield-alert" class="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5"></i>
      <p class="text-amber-300/80 text-[10px] font-bold">Desativar usuario bloqueia o login, mas preserva clientes, propostas e vendas ja cadastrados.</p>
    </div>
    <div class="flex flex-col gap-2">${rows}</div>`;
  lucide.createIcons();
}

async function _loadFranquiasForUserForm() {
  const { data, error } = await supabaseClient
    .from('franquias')
    .select('id, nome')
    .eq('ativo', true)
    .order('nome', { ascending: true });
  if (error) throw error;
  return data || [];
}

function _renderFranquiaOptions(franquias, selectedId) {
  return franquias.map(f => `<option value="${f.id}" ${selectedId === f.id ? 'selected' : ''}>${escapeHTML(f.nome)}</option>`).join('');
}

function _normalizeAdminRole(role) {
  return String(role || 'vendedor').toLowerCase();
}

function _renderGestorOptions(users, franquiaId, selectedGestorId) {
  const targetFranquia = franquiaId || null;
  const selectedId = selectedGestorId || '';

  const gestores = (users || [])
    .filter(u => _normalizeAdminRole(u.role) === 'gestor')
    .filter(u => !targetFranquia || u.franquia_id === targetFranquia)
    .sort((a, b) => String(a.nome || a.email || '').localeCompare(String(b.nome || b.email || ''), 'pt-BR'));

  let html = `<option value="">SEM VINCULO</option>`;
  html += gestores.map(g => {
    const label = g.nome || g.email || 'Gestor';
    const chatStatus = g.chat_enabled === true ? 'chat on' : 'chat off';
    return `<option value="${g.user_id}" ${selectedId === g.user_id ? 'selected' : ''}>${escapeHTML(label)} (${chatStatus})</option>`;
  }).join('');

  return html;
}

async function openAdminUsuarioForm(userId) {
  if (!_requireAdmin()) return;

  let franquias = [];
  let users = [];
  try {
    [franquias, users] = await Promise.all([
      _loadFranquiasForUserForm(),
      fetchAdminUsuarios(),
    ]);
  } catch (error) {
    showToast('ERRO: ' + (error.message || 'Falha ao carregar dados do formulario'));
    return;
  }

  let current = null;
  if (userId) {
    current = users.find(i => i.user_id === userId) || null;
    if (!current) {
      showToast('ERRO: Usuario nao encontrado.');
      return;
    }
  }

  const defaultRole = _normalizeAdminRole(current?.role || 'vendedor');
  const defaultFranquia = current?.franquia_id || state.franquiaId || franquias[0]?.id || '';
  const defaultChatEnabled = current?.chat_enabled === true;
  const defaultGestorId = current?.gestor_user_id || '';

  const fieldsHTML = `
    <input type="hidden" id="au-user-id" value="${userId || ''}">
    <div class="grid grid-cols-2 gap-4">
      <div class="col-span-2"><label class="${_labelCls}">Email *</label>
        <input ${userId ? 'disabled' : 'required'} id="au-email" type="email" class="${_inputCls} normal-case" value="${escapeHTML(current?.email || '')}" placeholder="usuario@dominio.com"></div>
      ${userId ? '' : `<div class="col-span-2"><label class="${_labelCls}">Senha temporaria *</label>
        <input required id="au-password" type="text" minlength="6" class="${_inputCls} normal-case" placeholder="Minimo 6 caracteres"></div>`}
      <div class="col-span-2"><label class="${_labelCls}">Nome</label>
        <input id="au-nome" class="${_inputCls}" value="${escapeHTML(current?.nome || '')}" placeholder="Nome para exibicao"></div>
      <div><label class="${_labelCls}">Perfil *</label>
        <select id="au-role" class="${_selectCls}">
          <option value="vendedor" ${defaultRole === 'vendedor' ? 'selected' : ''}>VENDEDOR</option>
          <option value="gestor" ${defaultRole === 'gestor' ? 'selected' : ''}>GESTOR</option>
          <option value="admin" ${defaultRole === 'admin' ? 'selected' : ''}>ADMIN</option>
        </select></div>
      <div><label class="${_labelCls}">Franquia *</label>
        <select id="au-franquia-id" class="${_selectCls}">${_renderFranquiaOptions(franquias, defaultFranquia)}</select></div>
      <label class="col-span-2 flex items-center gap-3 cursor-pointer">
        <input type="checkbox" id="au-ativo" ${current?.ativo === false ? '' : 'checked'} class="w-4 h-4 accent-red-500">
        <span class="text-white font-bold text-sm uppercase">Usuario ativo</span>
      </label>
      <label class="col-span-2 flex items-center gap-3 cursor-pointer">
        <input type="checkbox" id="au-chat-enabled" ${defaultChatEnabled ? 'checked' : ''} class="w-4 h-4 accent-cyan-500">
        <span class="text-white font-bold text-sm uppercase">Permitir uso do chat (chat_enabled)</span>
      </label>
      <div class="col-span-2 bg-cyan-950/20 border border-cyan-700/30 p-3">
        <p class="text-cyan-200/90 text-[10px] font-bold">Quando desativado: usuario nao aparece no chat, nao inicia/recebe conversa e nao envia mensagens.</p>
      </div>
      <div id="au-gestor-wrap" class="col-span-2 ${defaultRole === 'vendedor' ? '' : 'hidden'}">
        <label class="${_labelCls}">Gestor vinculado (apenas vendedor)</label>
        <select id="au-gestor-user-id" class="${_selectCls}">
          ${_renderGestorOptions(users, defaultFranquia, defaultGestorId)}
        </select>
        <p class="text-neutral-500 text-[10px] font-bold mt-1">Vendedor so pode conversar com o gestor vinculado (quando ambos estiverem com chat habilitado).</p>
      </div>
    </div>`;

  openAdminModal(userId ? 'EDITAR USUARIO' : 'NOVO USUARIO', fieldsHTML, async () => {
    const roleValue = document.getElementById('au-role').value;
    const chatEnabled = document.getElementById('au-chat-enabled').checked;
    const gestorUserId = roleValue === 'vendedor'
      ? (document.getElementById('au-gestor-user-id')?.value || null)
      : null;

    const payload = {
      p_nome: document.getElementById('au-nome').value.trim() || null,
      p_role: roleValue,
      p_franquia_id: document.getElementById('au-franquia-id').value,
      p_ativo: document.getElementById('au-ativo').checked,
    };

    if (userId) {
      const { error } = await supabaseClient.rpc('admin_update_user', {
        p_user_id: userId,
        ...payload,
      });
      if (error) { showToast('ERRO: ' + error.message); return; }

      const { error: chatError } = await supabaseClient.rpc('admin_set_user_chat_access', {
        p_user_id: userId,
        p_chat_enabled: chatEnabled,
        p_gestor_user_id: gestorUserId,
      });
      if (chatError) { showToast('ERRO CHAT: ' + chatError.message); return; }

      closeAdminModal();
      showToast('USUARIO ATUALIZADO');
    } else {
      const email = document.getElementById('au-email').value.trim().toLowerCase();
      const password = document.getElementById('au-password').value;

      let newUserId = null;
      try {
        const created = await createAdminUserWithConfirmedEmail({
          email,
          password,
          nome: payload.p_nome,
          role: payload.p_role,
          franquia_id: payload.p_franquia_id,
          ativo: payload.p_ativo,
        });
        newUserId = created.user_id;
      } catch (error) {
        showToast('ERRO: ' + (error.message || 'Nao foi possivel criar usuario.'));
        return;
      }

      const { error: syncError } = await supabaseClient.rpc('admin_update_user', {
        p_user_id: newUserId,
        ...payload,
      });
      if (syncError) {
        closeAdminModal();
        showToast('USUARIO CRIADO, MAS PERFIL NAO FOI SINCRONIZADO: ' + syncError.message);
        return;
      }

      const { error: chatError } = await supabaseClient.rpc('admin_set_user_chat_access', {
        p_user_id: newUserId,
        p_chat_enabled: chatEnabled,
        p_gestor_user_id: gestorUserId,
      });
      if (chatError) {
        closeAdminModal();
        showToast('USUARIO CRIADO, MAS CHAT NAO FOI CONFIGURADO: ' + chatError.message);
      } else {
        closeAdminModal();
        showToast('USUARIO CRIADO COM SUCESSO');
      }
    }

    const c = document.getElementById('admin-section-content');
    if (c) renderAdminUsuarios(c);
  });

  const roleSelect = document.getElementById('au-role');
  const franquiaSelect = document.getElementById('au-franquia-id');
  const gestorWrap = document.getElementById('au-gestor-wrap');
  const gestorSelect = document.getElementById('au-gestor-user-id');

  const syncGestorField = () => {
    if (!roleSelect || !franquiaSelect || !gestorWrap || !gestorSelect) return;

    const isVendedor = _normalizeAdminRole(roleSelect.value) === 'vendedor';
    const franquiaId = franquiaSelect.value || null;
    const selectedGestorId = isVendedor ? (gestorSelect.value || defaultGestorId || '') : '';

    gestorSelect.innerHTML = _renderGestorOptions(users, franquiaId, selectedGestorId);
    gestorWrap.classList.toggle('hidden', !isVendedor);

    if (!isVendedor) {
      gestorSelect.value = '';
    }
  };

  if (roleSelect) roleSelect.addEventListener('change', syncGestorField);
  if (franquiaSelect) franquiaSelect.addEventListener('change', syncGestorField);
  syncGestorField();
}

async function toggleAdminUsuarioAtivo(userId, nextActive) {
  if (!_requireAdmin()) return;

  let items = [];
  try {
    items = await fetchAdminUsuarios();
  } catch (error) {
    showToast('ERRO: ' + (error.message || 'Falha ao carregar usuario'));
    return;
  }
  const current = items.find(i => i.user_id === userId);
  if (!current) {
    showToast('Usuario nao encontrado.');
    return;
  }

  const actionText = nextActive ? 'ativar' : 'desativar';
  showConfirmModal(`Tem certeza que deseja ${actionText} este usuario?`, async () => {
    const { error } = await supabaseClient.rpc('admin_update_user', {
      p_user_id: userId,
      p_nome: current.nome || null,
      p_role: current.role || 'vendedor',
      p_franquia_id: current.franquia_id,
      p_ativo: nextActive,
    });

    if (error) {
      showToast('ERRO: ' + error.message);
      return;
    }

    showToast(nextActive ? 'USUARIO ATIVADO' : 'USUARIO DESATIVADO');
    const c = document.getElementById('admin-section-content');
    if (c) renderAdminUsuarios(c);
  });
}

// â”€â”€â”€ Franquias â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function renderAdminFranquias(container) {
  if (!_requireAdmin({ silent: true })) {
    container.innerHTML = `<div class="border border-red-600/40 bg-red-950/20 p-4 text-red-300 text-sm font-bold">Acesso restrito ao administrador.</div>`;
    return;
  }

  container.innerHTML = `<div class="flex items-center justify-center py-12 text-neutral-600">
    <i data-lucide="loader-2" class="w-6 h-6 animate-spin mr-2"></i><span class="font-bold uppercase text-[10px] tracking-widest">Carregando...</span>
  </div>`;
  lucide.createIcons();

  const { data: items = [], error } = await supabaseClient
    .from('franquias')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) {
    container.innerHTML = `<p class="text-red-500 text-sm font-bold p-4 border border-red-800 bg-red-900/10">Erro ao carregar: ${escapeHTML(error.message)}</p>`;
    return;
  }

  const rows = items.length === 0
    ? `<p class="text-neutral-600 text-sm font-bold text-center py-10">Nenhuma franquia cadastrada.</p>`
    : items.map(item => `
      <div class="flex items-center gap-3 bg-neutral-900/60 border border-neutral-800 p-4 hover:border-neutral-700 transition-all">
        <div class="flex-1 min-w-0">
          <p class="text-white font-black text-sm uppercase truncate">${escapeHTML(item.nome)}</p>
          <p class="text-neutral-500 text-[10px] font-bold">${escapeHTML(item.cidade || '—')}</p>
        </div>
        <div class="flex items-center gap-2 shrink-0 flex-wrap">
          ${_statusBadge(item.ativo)}
          <button onclick="renderAdminPrecosFranquia('${item.id}', '${escapeHTML(item.nome).replace(/'/g, "\\'")}')"
            class="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600/20 border border-purple-500/30 text-purple-400 hover:bg-purple-600 hover:text-white hover:border-purple-600 font-black uppercase text-[8px] tracking-widest transition-all">
            <i data-lucide="tag" class="w-3 h-3"></i> PREÇOS
          </button>
          ${_editBtn(`openAdminFranquiaForm('${item.id}')`)}          
        </div>
      </div>`).join('');

  container.innerHTML = `
    <div class="flex justify-between items-center mb-4">
      <span class="text-neutral-500 text-[10px] font-black uppercase tracking-widest">${items.length} franquia(s)</span>
      ${_addBtn('NOVA FRANQUIA', 'openAdminFranquiaForm()')}
    </div>
    <div class="flex flex-col gap-2">${rows}</div>`;
  lucide.createIcons();
}

function openAdminFranquiaForm(id) {
  if (!_requireAdmin()) return;

  const fieldsHTML = `
    <input type="hidden" id="afr-id" value="${id || ''}">
    <div class="grid grid-cols-2 gap-4">
      <div class="col-span-2"><label class="${_labelCls}">Nome *</label>
        <input required id="afr-nome" class="${_inputCls} uppercase" placeholder="EX: ÁGIL SOLAR SJC"></div>
      <div class="col-span-2"><label class="${_labelCls}">Cidade</label>
        <input id="afr-cidade" class="${_inputCls}" placeholder="São José dos Campos"></div>
      <label class="col-span-2 flex items-center gap-3 cursor-pointer">
        <input type="checkbox" id="afr-ativo" checked class="w-4 h-4 accent-red-500">
        <span class="text-white font-bold text-sm uppercase">Ativa</span>
      </label>
    </div>`;

  openAdminModal(id ? 'EDITAR FRANQUIA' : 'NOVA FRANQUIA', fieldsHTML, async () => {
    const existingId = document.getElementById('afr-id').value;
    const payload = {
      nome:   document.getElementById('afr-nome').value.trim().toUpperCase(),
      cidade: document.getElementById('afr-cidade').value.trim() || null,
      ativo:  document.getElementById('afr-ativo').checked,
    };
    const { data: savedFranquia, error } = existingId
      ? await supabaseClient.from('franquias').update(payload).eq('id', existingId).select().single()
      : await supabaseClient.from('franquias').insert([payload]).select().single();

    if (error) { showToast('ERRO: ' + error.message); return; }

    // Nova franquia: copia os preços da Matriz automaticamente como ponto de partida
    if (!existingId && savedFranquia) {
      const { data: matrizFranquia } = await supabaseClient
        .from('franquias').select('id').ilike('nome', '%Matriz%').single();
      if (matrizFranquia) {
        const { data: precosMatriz } = await supabaseClient
          .from('precos_franquia').select('produto_id, price, list_price').eq('franquia_id', matrizFranquia.id);
        if (precosMatriz && precosMatriz.length > 0) {
          const novosPrecos = precosMatriz.map(p => ({
            produto_id:  p.produto_id,
            franquia_id: savedFranquia.id,
            price:       p.price,
            list_price:  p.list_price,
          }));
          await supabaseClient.from('precos_franquia').upsert(novosPrecos, { onConflict: 'produto_id,franquia_id' });
        }
      }
    }

    closeAdminModal();
    showToast(existingId ? 'FRANQUIA ATUALIZADA' : 'FRANQUIA CRIADA — preços copiados da Matriz');
    const c = document.getElementById('admin-section-content');
    if (c) renderAdminFranquias(c);
  });

  if (id) {
    supabaseClient.from('franquias').select('*').eq('id', id).single().then(({ data }) => {
      if (!data) return;
      document.getElementById('afr-nome').value    = data.nome || '';
      document.getElementById('afr-cidade').value  = data.cidade || '';
      document.getElementById('afr-ativo').checked = data.ativo !== false;
    });
  }
}

async function renderAdminPrecosFranquia(franquiaId, franquiaNome) {
  if (!_requireAdmin()) return;

  const container = document.getElementById('admin-section-content');
  if (!container) return;

  container.innerHTML = `<div class="flex items-center justify-center py-12 text-neutral-600">
    <i data-lucide="loader-2" class="w-6 h-6 animate-spin mr-2"></i><span class="font-bold uppercase text-[10px] tracking-widest">Carregando preços...</span>
  </div>`;
  lucide.createIcons();

  const [{ data: produtos = [] }, { data: precos = [] }] = await Promise.all([
    supabaseClient.from('produtos').select('id, name, brand, power').order('power', { ascending: true }),
    supabaseClient.from('precos_franquia').select('produto_id, price, list_price').eq('franquia_id', franquiaId),
  ]);

  const precosMap = {};
  precos.forEach(p => { precosMap[p.produto_id] = p; });

  const rows = produtos.map((p, i) => {
    const preco   = precosMap[p.id] || { price: 0, list_price: 0 };
    const stagger = ['stagger-1','stagger-2','stagger-3','stagger-4','stagger-5','stagger-6'][Math.min(i, 5)];
    return `
      <div class="metric-card ${stagger} flex flex-col sm:flex-row items-start sm:items-center gap-3 border border-neutral-800 p-4 hover:border-purple-500/25 transition-all">
        <div class="flex-1 min-w-0">
          <p class="text-white font-black text-sm uppercase truncate">${escapeHTML(p.name)}</p>
          <p class="text-neutral-500 text-[10px] font-bold">${escapeHTML(p.brand || '—')} · ${p.power} kWp</p>
        </div>
        <div class="flex items-center gap-2 shrink-0 flex-wrap">
          <div class="flex flex-col items-start">
            <span class="text-[8px] text-neutral-600 font-black uppercase tracking-widest mb-1">PREÇO PROMO</span>
            <input type="number" step="0.01" id="price-${p.id}" value="${preco.price}"
              class="w-32 bg-black border border-neutral-700 focus:border-orange-500 px-3 py-2 text-orange-400 font-mono font-bold text-sm transition-all">
          </div>
          <div class="flex flex-col items-start">
            <span class="text-[8px] text-neutral-600 font-black uppercase tracking-widest mb-1">PREÇO LISTA</span>
            <input type="number" step="0.01" id="listprice-${p.id}" value="${preco.list_price}"
              class="w-32 bg-black border border-neutral-700 focus:border-neutral-500 px-3 py-2 text-neutral-400 font-mono font-bold text-sm transition-all">
          </div>
          <button onclick="savePrecoFranquia('${p.id}', '${franquiaId}', '${p.id}')"
            id="save-btn-${p.id}"
            class="mt-5 sm:mt-0 flex items-center gap-1.5 px-3 py-2 bg-green-600 border border-green-500 text-white hover:bg-green-700 hover:border-green-400 font-black uppercase text-[8px] tracking-widest transition-all">
            <i data-lucide="check" class="w-3.5 h-3.5"></i> SALVAR
          </button>
        </div>
      </div>`;
  }).join('');

  container.innerHTML = `
    <div class="flex items-center gap-3 mb-5">
      <button onclick="renderAdminFranquias(document.getElementById('admin-section-content'))"
        class="flex items-center gap-2 bg-neutral-900 border border-neutral-700 hover:border-neutral-500 text-neutral-400 hover:text-white px-3 py-2 font-black uppercase text-[9px] tracking-widest transition-all">
        <i data-lucide="arrow-left" class="w-3.5 h-3.5"></i> VOLTAR
      </button>
      <div>
        <p class="text-purple-400 text-[9px] font-black uppercase tracking-widest">EDITANDO PREÇOS</p>
        <p class="text-white font-black text-base uppercase leading-tight">${escapeHTML(franquiaNome)}</p>
      </div>
    </div>
    <div class="bg-amber-950/20 border border-amber-700/30 p-3 flex items-start gap-2 mb-4">
      <i data-lucide="info" class="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5"></i>
      <p class="text-amber-300/80 text-[10px] font-bold">Altere os valores e clique SALVAR em cada linha. O vendedor dessa franquia verá os novos preços imediatamente.</p>
    </div>
    <div class="flex flex-col gap-2">${rows}</div>`;
  lucide.createIcons();
}

async function savePrecoFranquia(produtoId, franquiaId, btnKey) {
  if (!_requireAdmin()) return;

  const price     = parseFloat(document.getElementById(`price-${produtoId}`).value) || 0;
  const listPrice = parseFloat(document.getElementById(`listprice-${produtoId}`).value) || 0;
  const btn       = document.getElementById(`save-btn-${btnKey}`);

  if (btn) {
    btn.innerHTML = '<i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin"></i>';
    btn.disabled  = true;
    lucide.createIcons();
  }

  const { error } = await supabaseClient
    .from('precos_franquia')
    .upsert(
      { produto_id: produtoId, franquia_id: franquiaId, price, list_price: listPrice },
      { onConflict: 'produto_id,franquia_id' }
    );

  if (btn) btn.disabled = false;

  if (error) {
    showToast('ERRO: ' + error.message);
    if (btn) { btn.innerHTML = '<i data-lucide="check" class="w-3.5 h-3.5"></i> SALVAR'; lucide.createIcons(); }
    return;
  }

  if (btn) {
    btn.innerHTML = '<i data-lucide="check-check" class="w-3.5 h-3.5"></i> SALVO';
    btn.className = 'mt-5 sm:mt-0 flex items-center gap-1.5 px-3 py-2 bg-green-600 border border-green-500 text-white font-black uppercase text-[8px] tracking-widest transition-all';
    lucide.createIcons();
    setTimeout(() => {
      if (btn) {
        btn.innerHTML = '<i data-lucide="check" class="w-3.5 h-3.5"></i> SALVAR';
        btn.className = 'mt-5 sm:mt-0 flex items-center gap-1.5 px-3 py-2 bg-green-600 border border-green-500 text-white hover:bg-green-700 hover:border-green-400 font-black uppercase text-[8px] tracking-widest transition-all';
        lucide.createIcons();
      }
    }, 2000);
  }
}

// â”€â”€â”€ Custos Extras â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function openAdminCustoForm(id) {
  if (!_requireAdmin()) return;

  const fieldsHTML = `
    <input type="hidden" id="ace-id" value="${id || ''}">
    <div class="grid grid-cols-2 gap-4">
      <div class="col-span-2"><label class="${_labelCls}">Nome *</label>
        <input required id="ace-nome" class="${_inputCls} uppercase" placeholder="EX: TAXA DE INSTALAÇÃO"></div>
      <div><label class="${_labelCls}">Tipo de Cálculo *</label>
        <select required id="ace-tipo" class="${_selectCls}">
          <option value="fixo">FIXO (R$)</option>
          <option value="percentual">PERCENTUAL (%)</option>
        </select></div>
      <div><label class="${_labelCls}">Valor *</label>
        <input required type="number" step="0.01" id="ace-valor" class="${_inputCls} font-mono" placeholder="0.00"></div>
      <div><label class="${_labelCls}">Ordem</label>
        <input type="number" id="ace-ordem" class="${_inputCls} font-mono" value="0"></div>
      <div><label class="${_labelCls}">Descrição</label>
        <input id="ace-descricao" class="${_inputCls}" placeholder="Opcional"></div>
      <label class="col-span-2 flex items-center gap-3 cursor-pointer">
        <input type="checkbox" id="ace-ativo" checked class="w-4 h-4 accent-red-500">
        <span class="text-white font-bold text-sm uppercase">Ativo</span>
      </label>
    </div>`;

  openAdminModal(id ? 'EDITAR CUSTO EXTRA' : 'NOVO CUSTO EXTRA', fieldsHTML, async () => {
    const existingId = document.getElementById('ace-id').value;
    const payload = {
      nome:         document.getElementById('ace-nome').value.trim().toUpperCase(),
      tipo_calculo: document.getElementById('ace-tipo').value,
      valor:        parseFloat(document.getElementById('ace-valor').value) || 0,
      ordem:        parseInt(document.getElementById('ace-ordem').value) || 0,
      descricao:    document.getElementById('ace-descricao').value.trim() || null,
      ativo:        document.getElementById('ace-ativo').checked,
    };
    const { error } = existingId
      ? await supabaseClient.from('custos_extras').update(payload).eq('id', existingId)
      : await supabaseClient.from('custos_extras').insert([payload]);
    if (error) { showToast('ERRO: ' + error.message); return; }
    closeAdminModal();
    showToast('CUSTO SALVO COM SUCESSO');
    const c = document.getElementById('admin-section-content');
    if (c) renderAdminCustos(c);
  });

  if (id) {
    supabaseClient.from('custos_extras').select('*').eq('id', id).single().then(({ data }) => {
      if (!data) return;
      document.getElementById('ace-nome').value     = data.nome || '';
      document.getElementById('ace-tipo').value     = data.tipo_calculo || 'fixo';
      document.getElementById('ace-valor').value    = data.valor || '';
      document.getElementById('ace-ordem').value    = data.ordem ?? 0;
      document.getElementById('ace-descricao').value = data.descricao || '';
      document.getElementById('ace-ativo').checked  = data.ativo !== false;
    });
  }
}









function adminComunicadoSlugify(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function adminComunicadoIsoToLocalInput(isoValue) {
  if (!isoValue) return '';
  const date = new Date(isoValue);
  if (Number.isNaN(date.getTime())) return '';

  const pad = n => String(n).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function adminComunicadoLocalInputToIso(localValue) {
  const value = String(localValue || '').trim();
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function adminComunicadoStatusBadge(item) {
  const isPublished = item && item.status === 'published';
  return `<span class="px-2 py-0.5 text-[8px] font-black uppercase border shrink-0 ${isPublished
    ? 'text-green-400 border-green-800 bg-green-900/20'
    : 'text-amber-300 border-amber-700 bg-amber-900/20'}">${isPublished ? 'PUBLICADO' : 'RASCUNHO'}</span>`;
}

function adminComunicadoTypeBadge(type) {
  const safe = String(type || 'comunicado').toUpperCase();
  return `<span class="px-2 py-0.5 text-[8px] font-black uppercase border border-blue-700 bg-blue-900/20 text-blue-300">${escapeHTML(safe)}</span>`;
}

function setAdminComunicadosSearch(value) {
  if (!_requireAdmin()) return;

  state.adminComunicadosSearch = String(value || '');
  const container = document.getElementById('admin-section-content');
  if (container) renderAdminComunicados(container, { skipRefresh: true });
}

function setAdminComunicadosStatus(value) {
  if (!_requireAdmin()) return;

  const normalized = value === 'published' || value === 'draft' ? value : 'all';
  state.adminComunicadosStatus = normalized;
  const container = document.getElementById('admin-section-content');
  if (container) renderAdminComunicados(container, { skipRefresh: true });
}

async function renderAdminComunicados(container, options = {}) {
  if (!state.isAdmin) {
    container.innerHTML = `<div class="border border-red-600/40 bg-red-950/20 p-4 text-red-300 text-sm font-bold">Acesso restrito ao administrador.</div>`;
    return;
  }

  container.innerHTML = `<div class="flex items-center justify-center py-10 text-neutral-600"><i data-lucide="loader-2" class="w-6 h-6 animate-spin mr-2"></i><span class="font-bold uppercase text-[10px] tracking-widest">Carregando comunicados...</span></div>`;
  lucide.createIcons();

  const service = window.comunicadosService;
  if (!service) {
    container.innerHTML = `<div class="border border-red-600/40 bg-red-950/20 p-4 text-red-300 text-sm font-bold">Servico de comunicados indisponivel.</div>`;
    return;
  }

  if (!options.skipRefresh) {
    try {
      await service.refresh({ allowFallback: true });
    } catch (error) {
      console.error('Erro ao atualizar comunicados:', error);
    }
  }

  const searchRaw = String(state.adminComunicadosSearch || '').trim().toLowerCase();
  const statusFilter = state.adminComunicadosStatus === 'published' || state.adminComunicadosStatus === 'draft'
    ? state.adminComunicadosStatus
    : 'all';

  const allItems = service.listAll();
  const filtered = allItems.filter(item => {
    if (statusFilter !== 'all' && item.status !== statusFilter) return false;
    if (!searchRaw) return true;

    const blob = [
      item.title,
      item.slug,
      item.summary,
      item.authorName,
      item.type,
    ].join(' ').toLowerCase();

    return blob.includes(searchRaw);
  });

  const usingFallback = typeof service.isFallbackData === 'function' && service.isFallbackData();
  const fallbackErr = typeof service.getLastError === 'function' ? service.getLastError() : null;
  const fallbackInfo = usingFallback
    ? `<div class="mb-4 border border-amber-700/40 bg-amber-950/20 p-3 text-amber-200 text-[11px] font-bold">
        MODO LOCAL: comunicados nao estao vindo do Supabase. Execute a migracao da tabela "comunicados" para persistencia real.
        ${fallbackErr ? `<div class="mt-1 text-amber-300/70 text-[10px] normal-case">${escapeHTML(fallbackErr.message || String(fallbackErr))}</div>` : ''}
      </div>`
    : '';

  const rows = filtered.length === 0
    ? `<p class="text-neutral-600 text-sm font-bold text-center py-10 border border-neutral-800 bg-neutral-900/30">Nenhum comunicado encontrado.</p>`
    : filtered.map(item => {
        const safeId = String(item.id || '').replace(/'/g, "\\'");
        const isPublished = item.status === 'published';
        const publishBtnClass = isPublished
          ? 'bg-amber-900/30 border-amber-700/40 text-amber-300 hover:bg-amber-700 hover:text-black'
          : 'bg-green-900/30 border-green-700/40 text-green-300 hover:bg-green-700 hover:text-black';
        const publishBtnLabel = isPublished ? 'DESPUBLICAR' : 'PUBLICAR';
        const summary = item.summary ? escapeHTML(item.summary) : 'Sem resumo';
        const author = item.authorName ? escapeHTML(item.authorName) : '-';
        const dateLabel = item.publishedAt ? formatDate(item.publishedAt) : 'Nao publicado';

        return `
          <div class="border border-neutral-800 bg-neutral-900/50 p-4 hover:border-neutral-700 transition-all">
            <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2 mb-2">
                  ${adminComunicadoStatusBadge(item)}
                  ${adminComunicadoTypeBadge(item.type)}
                </div>
                <p class="text-white font-black text-sm uppercase tracking-wide leading-tight">${escapeHTML(item.title || 'Sem titulo')}</p>
                <p class="text-neutral-400 text-[11px] mt-1 leading-relaxed">${summary}</p>
                <div class="mt-2 text-[10px] text-neutral-500 font-bold uppercase tracking-wider flex flex-wrap gap-x-4 gap-y-1">
                  <span>Slug: ${escapeHTML(item.slug || '-')}</span>
                  <span>Autor: ${author}</span>
                  <span>Publicacao: ${escapeHTML(dateLabel)}</span>
                </div>
              </div>
              <div class="flex items-center gap-2 shrink-0">
                <button onclick="toggleAdminComunicadoPublish('${safeId}', ${isPublished ? 'false' : 'true'})"
                  class="px-3 py-1.5 border font-black uppercase text-[8px] tracking-widest transition-all ${publishBtnClass}">${publishBtnLabel}</button>
                ${_editBtn(`openAdminComunicadoForm('${safeId}')`)}
                ${_deleteBtn(`deleteAdminComunicado('${safeId}')`)}
              </div>
            </div>
          </div>`;
      }).join('');

  const totalPublished = allItems.filter(item => item.status === 'published').length;

  container.innerHTML = `
    ${fallbackInfo}
    <div class="flex flex-col gap-4">
      <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div class="text-neutral-500 text-[10px] font-black uppercase tracking-widest">
          ${allItems.length} comunicado(s) cadastrados  |  ${totalPublished} publicado(s)
        </div>
        ${_addBtn('NOVO COMUNICADO', 'openAdminComunicadoForm()')}
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div class="lg:col-span-2">
          <label class="${_labelCls}">Busca</label>
          <input
            value="${escapeHTML(state.adminComunicadosSearch || '')}"
            oninput="setAdminComunicadosSearch(this.value)"
            placeholder="Titulo, slug, autor..."
            class="${_inputCls}" />
        </div>
        <div>
          <label class="${_labelCls}">Status</label>
          <select onchange="setAdminComunicadosStatus(this.value)" class="${_selectCls}">
            <option value="all" ${statusFilter === 'all' ? 'selected' : ''}>TODOS</option>
            <option value="draft" ${statusFilter === 'draft' ? 'selected' : ''}>RASCUNHO</option>
            <option value="published" ${statusFilter === 'published' ? 'selected' : ''}>PUBLICADO</option>
          </select>
        </div>
      </div>

      <div class="flex flex-col gap-2">${rows}</div>
    </div>`;

  lucide.createIcons();
}

function openAdminComunicadoForm(id) {
  if (!_requireAdmin()) return;

  const service = window.comunicadosService;
  if (!service) {
    showToast('Servico de comunicados indisponivel.');
    return;
  }

  const current = id ? service.getById(id) : service.createDraft();
  if (!current) {
    showToast('Comunicado nao encontrado.');
    return;
  }

  const defaultAuthor = current.authorName
    || (state.profile && state.profile.nome)
    || (state.currentUser && state.currentUser.email ? state.currentUser.email.split('@')[0] : '');

  const availableTypes = Array.isArray(service.COMUNICADO_TYPES) && service.COMUNICADO_TYPES.length > 0
    ? service.COMUNICADO_TYPES
    : ['comunicado', 'novidade', 'parceria', 'aviso'];

  const typeOptions = availableTypes.map(type => (
    `<option value="${type}" ${(current.type || 'comunicado') === type ? 'selected' : ''}>${escapeHTML(type.toUpperCase())}</option>`
  )).join('');

  const statusValue = current.status === 'published' ? 'published' : 'draft';
  const publishedLocal = adminComunicadoIsoToLocalInput(current.publishedAt);

  const fieldsHTML = `
    <input type="hidden" id="acm-id" value="${escapeHTML(current.id || '')}">
    <div class="grid grid-cols-2 gap-4">
      <div class="col-span-2">
        <label class="${_labelCls}">Titulo *</label>
        <input required id="acm-title" class="${_inputCls}" maxlength="160" value="${escapeHTML(current.title || '')}"
          oninput="if (!document.getElementById('acm-slug').dataset.manual) document.getElementById('acm-slug').value = adminComunicadoSlugify(this.value)"
          placeholder="Ex: Atualizacao comercial da semana">
      </div>
      <div class="col-span-2">
        <label class="${_labelCls}">Slug *</label>
        <input required id="acm-slug" class="${_inputCls} lowercase" maxlength="180" value="${escapeHTML(current.slug || '')}"
          oninput="this.dataset.manual='1'"
          placeholder="atualizacao-comercial-semana">
      </div>
      <div class="col-span-2">
        <label class="${_labelCls}">Resumo</label>
        <textarea id="acm-summary" rows="3" class="${_inputCls} resize-y" placeholder="Resumo curto para o bloco da home">${escapeHTML(current.summary || '')}</textarea>
      </div>
      <div class="col-span-2">
        <label class="${_labelCls}">Conteudo</label>
        <textarea id="acm-content" rows="6" class="${_inputCls} resize-y" placeholder="Texto completo do comunicado">${escapeHTML(current.content || '')}</textarea>
      </div>
      <div class="col-span-2">
        <label class="${_labelCls}">Imagem de Capa (URL)</label>
        <input id="acm-cover" class="${_inputCls}" value="${escapeHTML(current.coverImageUrl || '')}" placeholder="https://...">
      </div>
      <div>
        <label class="${_labelCls}">Tipo</label>
        <select id="acm-type" class="${_selectCls}">${typeOptions}</select>
      </div>
      <div>
        <label class="${_labelCls}">Autor</label>
        <input id="acm-author" class="${_inputCls}" maxlength="120" value="${escapeHTML(defaultAuthor || '')}" placeholder="Nome do autor">
      </div>
      <div>
        <label class="${_labelCls}">Status</label>
        <select id="acm-status" class="${_selectCls}">
          <option value="draft" ${statusValue === 'draft' ? 'selected' : ''}>RASCUNHO</option>
          <option value="published" ${statusValue === 'published' ? 'selected' : ''}>PUBLICADO</option>
        </select>
      </div>
      <div>
        <label class="${_labelCls}">Data de Publicacao</label>
        <input type="datetime-local" id="acm-published-at" class="${_inputCls}" value="${escapeHTML(publishedLocal)}">
      </div>
    </div>`;

  openAdminModal(id ? 'EDITAR COMUNICADO' : 'NOVO COMUNICADO', fieldsHTML, async () => {
    const existingId = document.getElementById('acm-id').value.trim();
    const title = document.getElementById('acm-title').value.trim();
    const rawSlug = document.getElementById('acm-slug').value.trim();

    if (!title) {
      showToast('TITULO OBRIGATORIO');
      return;
    }

    const slug = adminComunicadoSlugify(rawSlug || title);
    if (!slug) {
      showToast('SLUG INVALIDO');
      return;
    }

    const status = document.getElementById('acm-status').value === 'published' ? 'published' : 'draft';
    let publishedAt = adminComunicadoLocalInputToIso(document.getElementById('acm-published-at').value);
    if (status === 'published' && !publishedAt) publishedAt = new Date().toISOString();

    const payload = {
      id: existingId || undefined,
      title,
      slug,
      summary: document.getElementById('acm-summary').value.trim(),
      content: document.getElementById('acm-content').value.trim(),
      coverImageUrl: document.getElementById('acm-cover').value.trim(),
      type: document.getElementById('acm-type').value,
      authorName: document.getElementById('acm-author').value.trim(),
      status,
      isPublished: status === 'published',
      publishedAt: status === 'published' ? publishedAt : null,
    };

    try {
      await service.save(payload);
      closeAdminModal();
      showToast(existingId ? 'COMUNICADO ATUALIZADO' : 'COMUNICADO CRIADO');
      const section = document.getElementById('admin-section-content');
      if (section) await renderAdminComunicados(section, { skipRefresh: true });
    } catch (error) {
      console.error('Erro ao salvar comunicado:', error);
      showToast('ERRO: ' + (error.message || 'Nao foi possivel salvar comunicado.'));
    }
  });
}

async function toggleAdminComunicadoPublish(id, shouldPublish) {
  if (!_requireAdmin()) return;

  const service = window.comunicadosService;
  if (!service) {
    showToast('Servico de comunicados indisponivel.');
    return;
  }

  const item = service.getById(id);
  if (!item) {
    showToast('Comunicado nao encontrado.');
    return;
  }

  const actionLabel = shouldPublish ? 'PUBLICAR' : 'DESPUBLICAR';
  showConfirmModal(
    `${actionLabel} este comunicado?`,
    async () => {
      try {
        await service.setPublished(id, !!shouldPublish);
        showToast(shouldPublish ? 'COMUNICADO PUBLICADO' : 'COMUNICADO VOLTOU PARA RASCUNHO');
        const section = document.getElementById('admin-section-content');
        if (section) await renderAdminComunicados(section, { skipRefresh: true });
      } catch (error) {
        console.error('Erro ao atualizar status do comunicado:', error);
        showToast('ERRO: ' + (error.message || 'Nao foi possivel atualizar status.'));
      }
    },
    actionLabel,
    !shouldPublish
  );
}

async function deleteAdminComunicado(id) {
  if (!_requireAdmin()) return;

  const service = window.comunicadosService;
  if (!service) {
    showToast('Servico de comunicados indisponivel.');
    return;
  }

  showConfirmModal(
    'Tem certeza? Esta acao nao pode ser desfeita.',
    async () => {
      try {
        await service.remove(id);
        showToast('COMUNICADO REMOVIDO');
        const section = document.getElementById('admin-section-content');
        if (section) await renderAdminComunicados(section, { skipRefresh: true });
      } catch (error) {
        console.error('Erro ao remover comunicado:', error);
        showToast('ERRO: ' + (error.message || 'Nao foi possivel remover comunicado.'));
      }
    }
  );
}
