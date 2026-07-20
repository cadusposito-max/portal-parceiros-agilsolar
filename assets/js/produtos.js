// ==========================================
// RENDERIZADOR: PRODUTOS (Admin)
// ==========================================

function canManageProductCatalog() {
  return Boolean(state.isAdmin || state.isGestor);
}

// =======================================================================
// ABA PRODUTOS = GESTÃO DO CATÁLOGO DE KITS (14/07/2026)
// Permissões espelham a RLS real: ADMIN gerencia o catálogo global
// (produtos_admin_write); GESTOR só edita preços da própria unidade
// (precos_gestor_write). Vendedor nem vê a aba.
// =======================================================================
let _produtosSecao = 'kits';    // kits | equipamentos
let _catalogoBusca = '';
let _catalogoCategoria = 'all'; // all | kitsInversor | kitsMicro
let _catalogoStatus = 'all';    // all | ativos | inativos

// Equipamentos individuais (tabela componentes) — estado próprio da seção.
let _equipBusca = '';
let _equipCategoria = 'all';    // all | modulo | inversor | estrutura | cabo | servico | outro
let _equipStatus = 'all';       // all | ativos | inativos

const EQUIP_CATEGORIAS = [
  { v: 'modulo',    label: 'Módulo' },
  { v: 'inversor',  label: 'Inversor' },
  { v: 'estrutura', label: 'Estrutura' },
  { v: 'cabo',      label: 'Cabos' },
  { v: 'servico',   label: 'Serviço' },
  { v: 'outro',     label: 'Outros' },
];
const EQUIP_UNIDADES = ['un', 'kWp', 'm', 'vb', '%'];

function equipCategoriaLabel(tipo) {
  const found = EQUIP_CATEGORIAS.find(c => c.v === tipo);
  return found ? found.label : (tipo || 'Outros');
}

async function setProdutosSecao(sec) {
  _produtosSecao = sec === 'equipamentos' ? 'equipamentos' : 'kits';
  if (_produtosSecao === 'equipamentos' && (state.equipamentos || []).length === 0) {
    await fetchEquipamentos();
  }
  renderContent();
}

const _catalogoBuscaDebounced = debounce((value) => {
  _catalogoBusca = String(value || '').trim().toLowerCase();
  renderContent();
}, 180);

function handleCatalogoBuscaInput(value) {
  _catalogoBuscaDebounced(value);
}

function setCatalogoCategoria(value) {
  _catalogoCategoria = value || 'all';
  renderContent();
}

function setCatalogoStatus(value) {
  _catalogoStatus = value || 'all';
  renderContent();
}

// Admin: troca a unidade cujos preços aparecem/são editados na tela.
async function setCatalogoFranquia(franquiaId) {
  if (!state.isAdmin) return;
  state.adminKitsFranquia = franquiaId || null;
  showToast('CARREGANDO PREÇOS DA UNIDADE...');
  await fetchProducts();
  renderContent();
}

// Tira o kit de linha (some do criador de propostas) sem apagar.
async function toggleProdutoAtivo(id) {
  if (!state.isAdmin) { showToast('Apenas administrador pode ativar/desativar kits.'); return; }
  const item = (state.data || []).find(k => String(k.id) === String(id));
  if (!item) return;

  const novo = item.ativo === false;
  const { error } = await supabaseClient.from('produtos').update({ ativo: novo }).eq('id', id);
  if (error) {
    console.error('[produtos] Falha ao alternar ativo.', error);
    showToast(`ERRO: ${error.message || 'tente novamente'}`);
    return;
  }
  item.ativo = novo;
  showToast(novo ? 'KIT REATIVADO' : 'KIT DESATIVADO — fora do criador de propostas');
  renderContent();
}

function renderProductsList(container) {
  const emptyState = document.getElementById('empty-state');
  const emptyBtn   = document.getElementById('empty-state-btn');
  if (emptyState) emptyState.classList.add('hidden');
  if (emptyBtn) emptyBtn.classList.add('hidden');

  // Fallback neutro: a aba nem aparece para vendedor (filtrada em
  // getActiveTabsForEnvironment); se alguém cair aqui, orienta sem alarme.
  if (!canManageProductCatalog()) {
    container.innerHTML  = '';
    container.className  = 'flex flex-col';
    if (emptyState) emptyState.classList.remove('hidden');
    document.getElementById('empty-state-icon').innerHTML  = '<i data-lucide="package" class="w-10 h-10 text-neutral-500"></i>';
    document.getElementById('empty-state-icon').className  = 'inline-flex items-center justify-center w-20 h-20 bg-neutral-900 mb-6 text-neutral-500 border border-neutral-800';
    document.getElementById('empty-state-text').innerHTML  = "<span class='text-white text-2xl'>Kits ficam no Criador de Propostas</span><br><span class='text-sm font-medium text-neutral-400 lowercase normal-case mt-4 block max-w-md mx-auto'>Abra um cliente e clique em <b>Proposta</b> para ver os kits e valores disponíveis.</span>";
    if (emptyBtn) {
      emptyBtn.classList.remove('hidden');
      emptyBtn.innerText = 'IR PARA MEUS CLIENTES';
      emptyBtn.onclick = () => setTab('clientes');
    }
    lucide.createIcons();
    return;
  }

  // Toggle KITS | EQUIPAMENTOS — a aba gerencia os dois catálogos.
  container.className = 'flex flex-col gap-4';
  container.innerHTML = `
    <div class="flex bg-neutral-900 border border-neutral-800 w-fit">
      <button onclick="setProdutosSecao('kits')" class="px-5 py-2.5 text-[10px] font-black uppercase tracking-widest transition-all ${_produtosSecao === 'kits' ? 'bg-orange-500 text-black' : 'text-neutral-500 hover:text-white'}">Kits</button>
      <button onclick="setProdutosSecao('equipamentos')" class="px-5 py-2.5 text-[10px] font-black uppercase tracking-widest transition-all border-l border-neutral-800 ${_produtosSecao === 'equipamentos' ? 'bg-orange-500 text-black' : 'text-neutral-500 hover:text-white'}">Equipamentos</button>
    </div>
    <div id="produtos-secao-slot"></div>`;
  const slot = document.getElementById('produtos-secao-slot');
  if (_produtosSecao === 'equipamentos') renderCatalogoEquipamentos(slot);
  else renderCatalogoKits(slot);
  lucide.createIcons();
}

// ── Catálogo de KITS (kits fechados: módulos+inversor, preço por franquia) ──
function renderCatalogoKits(container) {
  // Gestor opera sempre sobre a própria unidade (preços).
  if (state.isGestor && !state.isAdmin && state.franquiaId) {
    state.adminKitsFranquia = state.franquiaId;
  }

  container.className = 'flex flex-col gap-4';
  const todos = Array.isArray(state.data) ? state.data : [];

  let lista = [...todos];
  if (_catalogoCategoria !== 'all') lista = lista.filter(k => k.categoria === _catalogoCategoria);
  if (_catalogoStatus === 'ativos') lista = lista.filter(k => k.ativo !== false);
  if (_catalogoStatus === 'inativos') lista = lista.filter(k => k.ativo === false);
  if (_catalogoBusca) {
    lista = lista.filter(k => `${k.name || ''} ${k.brand || ''}`.toLowerCase().includes(_catalogoBusca));
  }

  const nInativos = todos.filter(k => k.ativo === false).length;

  // Seletor de unidade (admin): de qual franquia vêm os preços exibidos/editados.
  const franquiasAtivas = (state.franquiasCatalog || []).filter(f => f.ativo !== false);
  const franquiaAtual = state.adminKitsFranquia || state.franquiaId || '';
  const seletorFranquia = state.isAdmin && franquiasAtivas.length > 0 ? `
    <div class="flex items-center gap-2 shrink-0">
      <span class="text-[9px] font-black uppercase tracking-widest text-purple-400">Preços da unidade:</span>
      <select onchange="setCatalogoFranquia(this.value)" class="bg-black border border-neutral-800 text-neutral-300 px-3 py-2.5 text-[10px] font-black uppercase tracking-widest">
        ${franquiasAtivas.map(f => `<option value="${f.id}" ${String(franquiaAtual) === String(f.id) ? 'selected' : ''}>${escapeHTML(f.nome || '')}</option>`).join('')}
      </select>
    </div>` : '';

  const acoesHeader = `
    <div class="flex items-center gap-2 flex-wrap">
      ${state.isAdmin ? `
        <button class="btn btn-ghost btn-sm" onclick="downloadKitsImportTemplateXLSX()"><i data-lucide="file-down"></i>Modelo</button>
        <button class="btn btn-secondary btn-sm" onclick="triggerKitsImportPicker()"><i data-lucide="upload"></i>Importar planilha</button>` : ''}
      <button class="btn btn-ghost btn-sm" onclick="exportCurrentKitsXLSX()"><i data-lucide="download"></i>Exportar</button>
      ${state.isAdmin ? `<button class="btn btn-primary" onclick="openModal()"><i data-lucide="package-plus"></i>Novo Kit</button>` : ''}
    </div>`;

  let html = `
    <section class="relative bg-[#080808] bg-grid overflow-hidden p-6 md:p-8 border border-neutral-800">
      <div class="absolute inset-0 pointer-events-none">
        <div class="absolute -top-10 -left-10 w-48 h-48 bg-orange-600/8 rounded-full blur-3xl"></div>
      </div>
      <div class="relative z-10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <p class="text-orange-500 text-[10px] font-black uppercase tracking-[0.3em] mb-1 flex items-center gap-2"><i data-lucide="package" class="w-3.5 h-3.5"></i> PRODUTOS</p>
          <h2 class="text-2xl md:text-3xl font-black text-white uppercase tracking-tighter leading-none">Catálogo de Kits <span class="text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-yellow-400">${todos.length}</span></h2>
          <p class="text-neutral-600 text-[10px] font-bold uppercase tracking-widest mt-1">${state.isAdmin ? 'Kits do criador de propostas' : 'Você edita os preços da sua unidade'}${nInativos > 0 ? ` · ${nInativos} fora de linha` : ''}</p>
        </div>
        ${acoesHeader}
      </div>
      <div class="relative z-10 flex flex-wrap items-center gap-2 mt-4">
        <div class="relative flex-1 min-w-[200px]">
          <i data-lucide="search" class="w-3.5 h-3.5 text-neutral-600 absolute left-3 top-1/2 -translate-y-1/2"></i>
          <input type="text" value="${escapeHTML(_catalogoBusca)}" oninput="handleCatalogoBuscaInput(this.value)" placeholder="Buscar por nome ou marca" class="w-full bg-black border border-neutral-800 text-white pl-9 pr-3 py-2.5 text-[11px] font-bold tracking-wide">
        </div>
        <select onchange="setCatalogoCategoria(this.value)" class="bg-black border border-neutral-800 text-neutral-300 px-3 py-2.5 text-[10px] font-black uppercase tracking-widest">
          <option value="all" ${_catalogoCategoria === 'all' ? 'selected' : ''}>Todas as categorias</option>
          <option value="kitsInversor" ${_catalogoCategoria === 'kitsInversor' ? 'selected' : ''}>Inversores</option>
          <option value="kitsMicro" ${_catalogoCategoria === 'kitsMicro' ? 'selected' : ''}>Microinversores</option>
        </select>
        <select onchange="setCatalogoStatus(this.value)" class="bg-black border border-neutral-800 text-neutral-300 px-3 py-2.5 text-[10px] font-black uppercase tracking-widest">
          <option value="all" ${_catalogoStatus === 'all' ? 'selected' : ''}>Todos</option>
          <option value="ativos" ${_catalogoStatus === 'ativos' ? 'selected' : ''}>Ativos</option>
          <option value="inativos" ${_catalogoStatus === 'inativos' ? 'selected' : ''}>Inativos</option>
        </select>
        ${seletorFranquia}
      </div>
    </section>`;

  // Catálogo totalmente vazio: empty state que guia o primeiro cadastro.
  if (todos.length === 0) {
    html += `
      <div class="py-16 text-center border border-dashed border-neutral-800/60 bg-neutral-950/40 flex flex-col items-center gap-4">
        <i data-lucide="package-open" class="w-12 h-12 text-neutral-700"></i>
        <p class="text-neutral-500 font-black uppercase tracking-widest text-sm">Nenhum kit cadastrado ainda</p>
        <p class="text-neutral-600 text-xs max-w-md">Cadastre um por um no botão abaixo, ou baixe o modelo de planilha, preencha e importe tudo de uma vez.</p>
        ${state.isAdmin ? `
        <div class="flex items-center gap-2 flex-wrap justify-center">
          <button class="btn btn-primary" onclick="openModal()"><i data-lucide="package-plus"></i>Cadastrar o primeiro kit</button>
          <button class="btn btn-secondary" onclick="triggerKitsImportPicker()"><i data-lucide="upload"></i>Importar planilha</button>
          <button class="btn btn-ghost" onclick="downloadKitsImportTemplateXLSX()"><i data-lucide="file-down"></i>Baixar modelo</button>
        </div>` : '<p class="text-neutral-600 text-[10px] font-bold uppercase tracking-widest">Peça ao administrador para cadastrar os kits.</p>'}
      </div>`;
    container.innerHTML = html;
    lucide.createIcons();
    return;
  }

  if (lista.length === 0) {
    html += `
      <div class="py-16 text-center text-neutral-600 font-bold uppercase tracking-widest text-xs border border-dashed border-neutral-800/60 bg-neutral-950/40">
        <i data-lucide="filter-x" class="w-10 h-10 mx-auto mb-3 opacity-30"></i>
        Nenhum kit com os filtros atuais
      </div>`;
    container.innerHTML = html;
    lucide.createIcons();
    return;
  }

  html += `<section class="flex flex-col gap-2">${lista.map(item => {
    const inativo = item.ativo === false;
    const temDesconto = Number(item.list_price) > 0 && Number(item.list_price) > Number(item.price);
    const safeName  = escapeHTML(item.name || '');
    const safeBrand = escapeHTML(item.brand || '');
    const safeTag   = escapeHTML(item.tag || '');
    const safeType  = escapeHTML(item.type || '');

    return `
      <div class="border ${inativo ? 'border-neutral-800/60 opacity-60' : 'border-neutral-800'} bg-[#0d0d0f] hover:border-orange-500/40 p-4 flex flex-wrap items-center gap-x-6 gap-y-3 transition-all">
        <div class="flex-1 min-w-[240px]">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-[9px] bg-orange-600/15 text-orange-500 px-2 py-0.5 font-black uppercase tracking-widest border border-orange-500/30">${safeBrand}</span>
            <span class="text-[8px] px-1.5 py-0.5 font-black uppercase tracking-widest border border-neutral-700 text-neutral-500">${item.categoria === 'kitsMicro' ? 'MICRO' : 'INVERSOR'}</span>
            ${safeTag ? `<span class="text-[8px] px-1.5 py-0.5 font-black uppercase tracking-widest border border-yellow-500/30 bg-yellow-500/10 text-yellow-400">${safeTag}</span>` : ''}
            ${inativo ? '<span class="text-[8px] px-1.5 py-0.5 font-black uppercase tracking-widest border border-neutral-700 bg-neutral-800/60 text-neutral-400">INATIVO</span>' : ''}
          </div>
          <h3 class="text-white font-black text-sm uppercase leading-tight mt-1.5">${safeName}</h3>
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[10px] font-bold">
            <span class="text-orange-500 flex items-center gap-1"><i data-lucide="zap" class="w-3 h-3"></i>${escapeHTML(String(item.power || '-'))} kWp</span>
            ${safeType ? `<span class="text-neutral-500 uppercase">${safeType}</span>` : ''}
          </div>
        </div>
        <div class="text-right shrink-0 ml-auto">
          ${temDesconto ? `<div class="text-[10px] text-neutral-600 line-through decoration-red-500/70 font-bold">De: ${formatCurrency(item.list_price)}</div>` : ''}
          <div class="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-yellow-400 tracking-tighter pb-0.5 pr-1">${formatCurrency(item.price)}</div>
        </div>
        <div class="flex items-center gap-1.5 shrink-0">
          <button data-item-id="${item.id}" onclick="openModalById(this.dataset.itemId)" title="${state.isAdmin ? 'Editar' : 'Editar preço da unidade'}" class="btn btn-secondary btn-icon"><i data-lucide="pencil"></i></button>
          ${state.isAdmin ? `<button onclick="toggleProdutoAtivo('${item.id}')" title="${inativo ? 'Reativar (volta ao criador de propostas)' : 'Desativar (tira do criador de propostas)'}" class="btn ${inativo ? 'btn-success' : 'btn-ghost'} btn-icon"><i data-lucide="${inativo ? 'eye' : 'eye-off'}"></i></button>` : ''}
          <button onclick="deleteItem('${item.id}')" title="${state.isAdmin && !state.adminKitsFranquia ? 'Excluir do catálogo' : 'Remover/ocultar'}" class="btn btn-danger btn-icon"><i data-lucide="trash-2"></i></button>
        </div>
      </div>`;
  }).join('')}</section>`;

  container.innerHTML = html;
  lucide.createIcons();
}

// ── Catálogo de EQUIPAMENTOS (itens avulsos: tabela componentes, admin-only) ──
// Gestão para o cadastro dos valores separados; o montador que soma itens e
// calcula o preço automático (substituindo o DRE manual) é fase futura.
const _equipBuscaDebounced = debounce((value) => {
  _equipBusca = String(value || '').trim().toLowerCase();
  renderContent();
}, 180);
function handleEquipBuscaInput(value) { _equipBuscaDebounced(value); }
function setEquipCategoria(v) { _equipCategoria = v || 'all'; renderContent(); }
function setEquipStatus(v) { _equipStatus = v || 'all'; renderContent(); }

function renderCatalogoEquipamentos(container) {
  container.className = 'flex flex-col gap-4';

  // Espelha a RLS: só admin gerencia componentes (componentes_admin_write).
  if (!state.isAdmin) {
    container.innerHTML = `
      <div class="py-16 text-center border border-dashed border-neutral-800/60 bg-neutral-950/40 flex flex-col items-center gap-3">
        <i data-lucide="lock" class="w-10 h-10 text-neutral-700"></i>
        <p class="text-neutral-500 font-black uppercase tracking-widest text-sm">Gestão de equipamentos é do administrador</p>
        <p class="text-neutral-600 text-xs max-w-md">Os kits (na outra aba) você já gerencia; o catálogo de itens avulsos é mantido pelo administrador.</p>
      </div>`;
    lucide.createIcons();
    return;
  }

  const todos = Array.isArray(state.equipamentos) ? state.equipamentos : [];
  let lista = [...todos];
  if (_equipCategoria !== 'all') lista = lista.filter(e => (e.tipo || 'outro') === _equipCategoria);
  if (_equipStatus === 'ativos') lista = lista.filter(e => e.ativo !== false);
  if (_equipStatus === 'inativos') lista = lista.filter(e => e.ativo === false);
  if (_equipBusca) lista = lista.filter(e => `${e.nome || ''} ${e.marca || ''}`.toLowerCase().includes(_equipBusca));

  const nInativos = todos.filter(e => e.ativo === false).length;

  let html = `
    <section class="relative bg-[#080808] bg-grid overflow-hidden p-6 md:p-8 border border-neutral-800">
      <div class="absolute inset-0 pointer-events-none">
        <div class="absolute -top-10 -left-10 w-48 h-48 bg-orange-600/8 rounded-full blur-3xl"></div>
      </div>
      <div class="relative z-10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <p class="text-orange-500 text-[10px] font-black uppercase tracking-[0.3em] mb-1 flex items-center gap-2"><i data-lucide="boxes" class="w-3.5 h-3.5"></i> EQUIPAMENTOS</p>
          <h2 class="text-2xl md:text-3xl font-black text-white uppercase tracking-tighter leading-none">Itens avulsos <span class="text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-yellow-400">${todos.length}</span></h2>
          <p class="text-neutral-600 text-[10px] font-bold uppercase tracking-widest mt-1">Valores separados por item${nInativos > 0 ? ` · ${nInativos} inativo(s)` : ''}</p>
        </div>
        <div class="flex items-center gap-2 flex-wrap">
          <button class="btn btn-ghost btn-sm" onclick="downloadEquipamentosTemplateXLSX()"><i data-lucide="file-down"></i>Modelo</button>
          <button class="btn btn-secondary btn-sm" onclick="triggerEquipImportPicker()"><i data-lucide="upload"></i>Importar planilha</button>
          <button class="btn btn-ghost btn-sm" onclick="exportEquipamentosXLSX()"><i data-lucide="download"></i>Exportar</button>
          <button class="btn btn-primary" onclick="openEquipModal()"><i data-lucide="plus"></i>Novo equipamento</button>
        </div>
      </div>
      <div class="relative z-10 flex flex-wrap items-center gap-2 mt-4">
        <div class="relative flex-1 min-w-[200px]">
          <i data-lucide="search" class="w-3.5 h-3.5 text-neutral-600 absolute left-3 top-1/2 -translate-y-1/2"></i>
          <input type="text" value="${escapeHTML(_equipBusca)}" oninput="handleEquipBuscaInput(this.value)" placeholder="Buscar por nome ou marca" class="w-full bg-black border border-neutral-800 text-white pl-9 pr-3 py-2.5 text-[11px] font-bold tracking-wide">
        </div>
        <select onchange="setEquipCategoria(this.value)" class="bg-black border border-neutral-800 text-neutral-300 px-3 py-2.5 text-[10px] font-black uppercase tracking-widest">
          <option value="all" ${_equipCategoria === 'all' ? 'selected' : ''}>Todas as categorias</option>
          ${EQUIP_CATEGORIAS.map(c => `<option value="${c.v}" ${_equipCategoria === c.v ? 'selected' : ''}>${c.label}</option>`).join('')}
        </select>
        <select onchange="setEquipStatus(this.value)" class="bg-black border border-neutral-800 text-neutral-300 px-3 py-2.5 text-[10px] font-black uppercase tracking-widest">
          <option value="all" ${_equipStatus === 'all' ? 'selected' : ''}>Todos</option>
          <option value="ativos" ${_equipStatus === 'ativos' ? 'selected' : ''}>Ativos</option>
          <option value="inativos" ${_equipStatus === 'inativos' ? 'selected' : ''}>Inativos</option>
        </select>
      </div>
    </section>`;

  if (todos.length === 0) {
    html += `
      <div class="py-16 text-center border border-dashed border-neutral-800/60 bg-neutral-950/40 flex flex-col items-center gap-4">
        <i data-lucide="package-open" class="w-12 h-12 text-neutral-700"></i>
        <p class="text-neutral-500 font-black uppercase tracking-widest text-sm">Nenhum equipamento cadastrado</p>
        <p class="text-neutral-600 text-xs max-w-md">Cadastre módulo, inversor, estrutura, cabos, serviço/mão de obra e outros — cada um com seu valor. Depois a plataforma usa isso para montar propostas.</p>
        <div class="flex items-center gap-2 flex-wrap justify-center">
          <button class="btn btn-primary" onclick="openEquipModal()"><i data-lucide="plus"></i>Cadastrar o primeiro</button>
          <button class="btn btn-secondary" onclick="triggerEquipImportPicker()"><i data-lucide="upload"></i>Importar planilha</button>
          <button class="btn btn-ghost" onclick="downloadEquipamentosTemplateXLSX()"><i data-lucide="file-down"></i>Baixar modelo</button>
        </div>
      </div>`;
    container.innerHTML = html;
    lucide.createIcons();
    return;
  }

  if (lista.length === 0) {
    html += `
      <div class="py-16 text-center text-neutral-600 font-bold uppercase tracking-widest text-xs border border-dashed border-neutral-800/60 bg-neutral-950/40">
        <i data-lucide="filter-x" class="w-10 h-10 mx-auto mb-3 opacity-30"></i>
        Nenhum item com os filtros atuais
      </div>`;
    container.innerHTML = html;
    lucide.createIcons();
    return;
  }

  html += `<section class="flex flex-col gap-2">${lista.map(item => {
    const inativo = item.ativo === false;
    const safeNome  = escapeHTML(item.nome || '');
    const safeMarca = escapeHTML(item.marca || '');
    const unidade   = escapeHTML(item.unidade || 'un');
    const temCusto  = item.custo !== null && item.custo !== undefined && item.custo !== '';
    return `
      <div class="border ${inativo ? 'border-neutral-800/60 opacity-60' : 'border-neutral-800'} bg-[#0d0d0f] hover:border-orange-500/40 p-4 flex flex-wrap items-center gap-x-6 gap-y-3 transition-all">
        <div class="flex-1 min-w-[240px]">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-[9px] bg-orange-600/15 text-orange-500 px-2 py-0.5 font-black uppercase tracking-widest border border-orange-500/30">${escapeHTML(equipCategoriaLabel(item.tipo))}</span>
            ${safeMarca ? `<span class="text-[8px] px-1.5 py-0.5 font-black uppercase tracking-widest border border-neutral-700 text-neutral-500">${safeMarca}</span>` : ''}
            ${inativo ? '<span class="text-[8px] px-1.5 py-0.5 font-black uppercase tracking-widest border border-neutral-700 bg-neutral-800/60 text-neutral-400">INATIVO</span>' : ''}
          </div>
          <h3 class="text-white font-black text-sm uppercase leading-tight mt-1.5">${safeNome}</h3>
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[10px] font-bold">
            ${Number(item.potencia_wp) > 0 ? `<span class="text-orange-500 flex items-center gap-1"><i data-lucide="zap" class="w-3 h-3"></i>${escapeHTML(String(item.potencia_wp))} Wp</span>` : ''}
            ${temCusto ? `<span class="text-neutral-500">custo ${formatCurrency(item.custo)}</span>` : ''}
          </div>
        </div>
        <div class="text-right shrink-0 ml-auto">
          <div class="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-yellow-400 tracking-tighter pb-0.5 pr-1">${formatCurrency(item.preco_unitario)}</div>
          <div class="text-[9px] text-neutral-600 font-bold uppercase tracking-widest">/ ${unidade}</div>
        </div>
        <div class="flex items-center gap-1.5 shrink-0">
          <button data-eq-id="${item.id}" onclick="openEquipModalById(this.dataset.eqId)" title="Editar" class="btn btn-secondary btn-icon"><i data-lucide="pencil"></i></button>
          <button onclick="toggleEquipamentoAtivo('${item.id}')" title="${inativo ? 'Reativar' : 'Desativar'}" class="btn ${inativo ? 'btn-success' : 'btn-ghost'} btn-icon"><i data-lucide="${inativo ? 'eye' : 'eye-off'}"></i></button>
          <button onclick="deleteEquipamento('${item.id}')" title="Excluir" class="btn btn-danger btn-icon"><i data-lucide="trash-2"></i></button>
        </div>
      </div>`;
  }).join('')}</section>`;

  container.innerHTML = html;
  lucide.createIcons();
}

// --- Modal de equipamento (admin) ---
function openEquipModalById(id) {
  const item = (state.equipamentos || []).find(e => String(e.id) === String(id));
  if (item) openEquipModal(item);
}

function openEquipModal(item = null) {
  if (!state.isAdmin) { showToast('Apenas administrador pode gerenciar equipamentos.'); return; }
  const overlay = document.getElementById('equip-modal-overlay');
  if (!overlay) return;
  overlay.classList.remove('hidden');

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
  document.getElementById('equip-modal-title').innerText = item ? 'EDITAR EQUIPAMENTO' : 'NOVO EQUIPAMENTO';
  set('equip-id', item?.id || '');
  set('equip-tipo', item?.tipo || (_equipCategoria !== 'all' ? _equipCategoria : 'modulo'));
  set('equip-nome', item?.nome || '');
  set('equip-marca', item?.marca || '');
  set('equip-potencia', item?.potencia_wp ?? '');
  set('equip-unidade', item?.unidade || 'un');
  set('equip-preco', item?.preco_unitario ?? '');
  set('equip-custo', item?.custo ?? '');
  const ativoEl = document.getElementById('equip-ativo');
  if (ativoEl) ativoEl.checked = item ? item.ativo !== false : true;
}

function closeEquipModal() {
  document.getElementById('equip-modal-overlay')?.classList.add('hidden');
}

async function submitEquipModal(e) {
  if (e) e.preventDefault();
  if (!state.isAdmin) { showToast('Acesso restrito.'); return; }

  const id = document.getElementById('equip-id').value;
  const btn = document.getElementById('equip-save-btn');
  const nome = document.getElementById('equip-nome').value.trim();
  const preco = Number(document.getElementById('equip-preco').value);
  if (!nome) { showToast('Informe o nome do equipamento.'); return; }
  if (!Number.isFinite(preco) || preco < 0) { showToast('Informe um preço válido.'); return; }

  if (btn) btn.innerHTML = 'SALVANDO...';
  const potenciaRaw = document.getElementById('equip-potencia').value;
  const custoRaw = document.getElementById('equip-custo').value;
  const payload = {
    tipo:           document.getElementById('equip-tipo').value || 'outro',
    nome:           nome,
    marca:          document.getElementById('equip-marca').value.trim() || null,
    potencia_wp:    potenciaRaw !== '' ? Number(potenciaRaw) : null,
    unidade:        document.getElementById('equip-unidade').value || 'un',
    preco_unitario: preco,
    custo:          custoRaw !== '' ? Number(custoRaw) : null,
    ativo:          document.getElementById('equip-ativo').checked,
  };

  const { error } = id
    ? await supabaseClient.from('componentes').update(payload).eq('id', id)
    : await supabaseClient.from('componentes').insert([payload]);
  if (error) {
    console.error('[equipamentos] Falha ao salvar.', error);
    showToast(`ERRO AO SALVAR: ${error.message || 'tente novamente'}`);
    if (btn) btn.innerHTML = 'SALVAR EQUIPAMENTO';
    return;
  }

  await fetchEquipamentos();
  closeEquipModal();
  showToast('EQUIPAMENTO SALVO COM SUCESSO');
  if (btn) btn.innerHTML = 'SALVAR EQUIPAMENTO';
  renderContent();
}

async function toggleEquipamentoAtivo(id) {
  if (!state.isAdmin) { showToast('Acesso restrito.'); return; }
  const item = (state.equipamentos || []).find(e => String(e.id) === String(id));
  if (!item) return;
  const novo = item.ativo === false;
  const { error } = await supabaseClient.from('componentes').update({ ativo: novo }).eq('id', id);
  if (error) {
    console.error('[equipamentos] Falha ao alternar ativo.', error);
    showToast(`ERRO: ${error.message || 'tente novamente'}`);
    return;
  }
  item.ativo = novo;
  showToast(novo ? 'EQUIPAMENTO REATIVADO' : 'EQUIPAMENTO DESATIVADO');
  renderContent();
}

function deleteEquipamento(id) {
  if (!state.isAdmin) { showToast('Acesso restrito.'); return; }
  showConfirmModal(
    'Excluir este equipamento? Essa ação não pode ser desfeita. (Para tirar de uso sem apagar, use Desativar.)',
    async () => {
      const { error } = await supabaseClient.from('componentes').delete().eq('id', id);
      if (error) {
        console.error('[equipamentos] Falha ao remover.', error);
        showToast(`ERRO AO REMOVER: ${error.message || 'tente novamente'}`);
        return;
      }
      await fetchEquipamentos();
      showToast('EQUIPAMENTO REMOVIDO');
      renderContent();
    },
    'EXCLUIR EQUIPAMENTO'
  );
}

// --- Modal de Kit (Admin) ---
const modal = document.getElementById('modal-overlay');

function openModalById(itemId) {
  if (!canManageProductCatalog()) {
    showToast('Acesso restrito.');
    return;
  }

  const item = state.data.find(k => String(k.id) === String(itemId));
  if (item) openModal(item);
}

function openModal(item = null) {
  if (!canManageProductCatalog()) {
    showToast('Acesso restrito.');
    return;
  }
  // Criar kit novo é do catálogo global — só admin (RLS produtos_admin_write).
  if (!item && !state.isAdmin) {
    showToast('Apenas administrador pode criar kits. Você pode editar os preços da sua unidade.');
    return;
  }

  modal.classList.remove('hidden');

  const categoriaEl = document.getElementById('form-categoria');
  if (item) {
    document.getElementById('modal-title').innerText     = state.isAdmin ? 'EDITAR OFERTA' : 'EDITAR PREÇO DA UNIDADE';
    document.getElementById('form-id').value             = item.id;
    document.getElementById('form-name').value           = item.name;
    document.getElementById('form-brand').value          = item.brand;
    document.getElementById('form-power').value          = item.power;
    document.getElementById('form-price').value          = item.price;
    document.getElementById('form-listPrice').value      = item.list_price;
    document.getElementById('form-type').value           = item.type;
    document.getElementById('form-tag').value            = item.tag;
    if (categoriaEl) categoriaEl.value = item.categoria === 'kitsMicro' ? 'kitsMicro' : 'kitsInversor';
  } else {
    document.getElementById('modal-title').innerText = 'NOVA OFERTA';
    document.getElementById('product-form').reset();
    document.getElementById('form-id').value = '';
    if (categoriaEl) categoriaEl.value = _catalogoCategoria === 'kitsMicro' ? 'kitsMicro' : 'kitsInversor';
  }

  // Gestor: só preços (a RLS bloqueia escrita em produtos); campos do kit travados.
  const somentePrecos = !state.isAdmin;
  ['form-name', 'form-brand', 'form-power', 'form-type', 'form-tag', 'form-categoria'].forEach((fid) => {
    const el = document.getElementById(fid);
    if (el) {
      el.disabled = somentePrecos;
      el.classList.toggle('opacity-50', somentePrecos);
    }
  });
}

function closeModal() {
  modal.classList.add('hidden');
}

document.getElementById('product-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!canManageProductCatalog()) {
    showToast('Acesso restrito.');
    return;
  }

  const id      = document.getElementById('form-id').value;
  const btnSave = document.getElementById('btn-save-modal');
  btnSave.innerHTML = 'SALVANDO...';

  // Categoria: do select do modal (editar mantém a do kit; criar usa o filtro atual).
  const itemAtual = id ? (state.data || []).find(k => String(k.id) === String(id)) : null;
  const categoriaSelecionada = document.getElementById('form-categoria')?.value
    || itemAtual?.categoria
    || 'kitsInversor';

  const productData = {
    categoria:  categoriaSelecionada === 'kitsMicro' ? 'kitsMicro' : 'kitsInversor',
    name:       document.getElementById('form-name').value.toUpperCase(),
    brand:      document.getElementById('form-brand').value.toUpperCase(),
    power:      Number(document.getElementById('form-power').value),
    price:      Number(document.getElementById('form-price').value),
    list_price: Number(document.getElementById('form-listPrice').value),
    type:       document.getElementById('form-type').value,
    tag:        document.getElementById('form-tag').value,
    description:document.getElementById('form-power').value + 'kWp - ' + document.getElementById('form-brand').value.toUpperCase()
  };

  // Qualquer erro do Supabase interrompe e avisa — nunca mostrar "sucesso" em falha.
  const falhou = (error, contexto) => {
    console.error(`[produtos] Falha ao ${contexto}.`, error);
    showToast(`ERRO AO SALVAR: ${error.message || 'tente novamente'}`);
    btnSave.innerHTML = 'SALVAR OFERTA';
  };

  // Gestor: a RLS só permite escrever em precos_franquia da própria unidade —
  // grava SÓ o preço e não toca no catálogo global.
  if (!state.isAdmin) {
    if (!id || !state.franquiaId) { falhou(new Error('sem kit ou franquia'), 'salvar preço (gestor)'); return; }
    const { error: precoError } = await supabaseClient.from('precos_franquia').upsert(
      { produto_id: id, franquia_id: state.franquiaId, price: productData.price, list_price: productData.list_price },
      { onConflict: 'produto_id,franquia_id' }
    );
    if (precoError) { falhou(precoError, 'atualizar preço da unidade'); return; }

    await fetchProducts();
    closeModal();
    showToast('PREÇO DA UNIDADE ATUALIZADO');
    btnSave.innerHTML = 'SALVAR OFERTA';
    renderContent();
    return;
  }

  if (id) {
    const { error } = await supabaseClient.from('produtos').update(productData).eq('id', id);
    if (error) { falhou(error, 'atualizar produto'); return; }
    // Atualiza preço na franquia selecionada no admin
    if (state.adminKitsFranquia) {
      const { error: precoError } = await supabaseClient.from('precos_franquia').upsert(
        { produto_id: id, franquia_id: state.adminKitsFranquia, price: productData.price, list_price: productData.list_price },
        { onConflict: 'produto_id,franquia_id' }
      );
      if (precoError) { falhou(precoError, 'atualizar preço da unidade'); return; }
    }
  } else {
    // Com franquia selecionada: kit exclusivo daquela unidade (não vaza para as outras).
    // Sem franquia (admin global): kit padrão, criado para todas as franquias ativas.
    const novoProduto = state.adminKitsFranquia
      ? { ...productData, franquia_id: state.adminKitsFranquia }
      : productData;
    const { data: newKit, error: insertError } = await supabaseClient.from('produtos').insert([novoProduto]).select().single();
    if (insertError || !newKit) { falhou(insertError || new Error('produto não retornado'), 'criar produto'); return; }

    let alvos;
    if (state.adminKitsFranquia) {
      alvos = [{ id: state.adminKitsFranquia }];
    } else {
      const { data: todasFranquias = [], error: franquiasError } = await supabaseClient.from('franquias').select('id').eq('ativo', true);
      if (franquiasError) { falhou(franquiasError, 'listar franquias'); return; }
      alvos = todasFranquias;
    }
    if (alvos.length > 0) {
      const { error: precoError } = await supabaseClient.from('precos_franquia').upsert(
        alvos.map(f => ({ produto_id: newKit.id, franquia_id: f.id, price: productData.price, list_price: productData.list_price })),
        { onConflict: 'produto_id,franquia_id' }
      );
      if (precoError) { falhou(precoError, 'gravar preços por franquia'); return; }
    }
  }

  await fetchProducts();
  closeModal();
  showToast('OFERTA SALVA COM SUCESSO');
  btnSave.innerHTML = 'SALVAR OFERTA';
  renderContent();
});

async function deleteItem(id) {
  if (!canManageProductCatalog()) {
    showToast('Acesso restrito.');
    return;
  }

  const kit = (Array.isArray(state.data) ? state.data : []).find(k => String(k.id) === String(id));
  const franquiaId = state.adminKitsFranquia || null;
  const kitFranquiaId = kit && kit.franquia_id ? String(kit.franquia_id) : '';
  const isExclusivaDestaUnidade = kitFranquiaId !== '' && kitFranquiaId === String(franquiaId || '');

  // Kit do catálogo padrão visto numa unidade: "remover" apenas oculta nesta unidade (não apaga globalmente).
  if (franquiaId && kit && !isExclusivaDestaUnidade) {
    showConfirmModal(
      'Ocultar este kit nesta unidade? As outras unidades não são afetadas.',
      async () => {
        const { error } = await supabaseClient.from('precos_franquia').delete().eq('produto_id', id).eq('franquia_id', franquiaId);
        if (error) {
          console.error('[produtos] Falha ao ocultar kit na unidade.', error);
          showToast(`ERRO AO OCULTAR: ${error.message || 'tente novamente'}`);
          return;
        }
        await fetchProducts();
        showToast('KIT OCULTADO NESTA UNIDADE');
        renderContent();
      },
      'OCULTAR KIT'
    );
    return;
  }

  // Kit exclusivo desta unidade (ou modo admin global): remoção definitiva do produto.
  if (!state.isAdmin) { showToast('Apenas administrador pode excluir kits do catálogo.'); return; }
  showConfirmModal(
    'Excluir este kit do catálogo? Essa ação não pode ser desfeita. (Para tirar de linha sem apagar, use Desativar.)',
    async () => {
      const { error } = await supabaseClient.from('produtos').delete().eq('id', id);
      if (error) {
        console.error('[produtos] Falha ao remover produto.', error);
        showToast(`ERRO AO REMOVER: ${error.message || 'tente novamente'}`);
        return;
      }
      await fetchProducts();
      showToast('ITEM REMOVIDO');
      renderContent();
    },
    'EXCLUIR KIT'
  );
}

function toggleAdminMode() {
  state.isEditMode = !state.isEditMode;
  document.getElementById('admin-toggle-btn').className = state.isEditMode
    ? 'p-3 border transition-all duration-300 bg-red-600 border-red-500 text-white animate-pulse'
    : 'p-3 border transition-all duration-300 bg-black border-neutral-800 text-neutral-500 hover:text-white hover:border-white';
  renderContent();
}

const KIT_IMPORT_HEADER_ALIASES = {
  id:         ['id', 'produtoid'],
  categoria:  ['categoria', 'category', 'aba', 'secao'],
  name:       ['name', 'nome', 'kit', 'kitnome', 'produto', 'nomedokit'],
  brand:      ['brand', 'marca', 'fabricante'],
  power:      ['power', 'potencia', 'potenciakwp', 'kwp', 'potenciasistema'],
  type:       ['type', 'tipo', 'fase', 'tiporede'],
  price:      ['price', 'preco', 'precovenda', 'valor', 'valorvenda', 'avista', 'valoravista'],
  list_price: ['listprice', 'precolista', 'precode', 'de', 'valorlista', 'valorde', 'precotabela'],
  tag:        ['tag', 'selo', 'etiqueta'],
  description:['description', 'descricao', 'detalhes'],
  ativo:      ['ativo', 'status', 'ativoinativo', 'emlinha'],
};

const KIT_IMPORT_TAG_MAP = {
  'MAIS VENDIDO': 'MAIS VENDIDO',
  'PREMIUM': 'PREMIUM',
  'CUSTO BENEFICIO': 'CUSTO-BENEFÍCIO',
  'LANCAMENTO': 'LANÇAMENTO',
  'ALTA POTENCIA': 'ALTA POTÊNCIA',
  'PROJETO ESPECIAL': 'PROJETO ESPECIAL',
};

function normalizeImportText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function normalizeImportHeader(value) {
  return normalizeImportText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function detectCsvDelimiter(text) {
  const firstLine = (text || '').split(/\r?\n/).find(line => line.trim().length > 0) || '';
  const semicolonCount = (firstLine.match(/;/g) || []).length;
  const commaCount     = (firstLine.match(/,/g) || []).length;
  return semicolonCount > commaCount ? ';' : ',';
}

function parseSpreadsheetNumber(value) {
  if (typeof value === 'number') return value;
  let str = String(value ?? '').trim();
  if (!str) return NaN;

  str = str
    .replace(/R\$/gi, '')
    .replace(/\s+/g, '')
    .replace(/[^\d,.-]/g, '');

  const lastComma = str.lastIndexOf(',');
  const lastDot   = str.lastIndexOf('.');

  if (lastComma > -1 && lastDot > -1) {
    if (lastComma > lastDot) {
      str = str.replace(/\./g, '').replace(',', '.');
    } else {
      str = str.replace(/,/g, '');
    }
  } else if (lastComma > -1) {
    str = str.replace(/\./g, '').replace(',', '.');
  }

  const num = Number(str);
  return Number.isFinite(num) ? num : NaN;
}

function normalizeImportedCategory(value, fallback) {
  const v = normalizeImportHeader(value);
  if (!v) return fallback;
  if (v.includes('micro')) return 'kitsMicro';
  if (v.includes('string')) return 'kitsString';
  if (v.includes('inversor')) return 'kitsInversor';
  if (v === 'kitsmicro') return 'kitsMicro';
  if (v === 'kitsstring') return 'kitsString';
  if (v === 'kitsinversor') return 'kitsInversor';
  return fallback;
}

function normalizeImportedType(value) {
  const original = String(value || '').trim();
  const v = normalizeImportText(original).toUpperCase();
  if (!v) return 'Bifásico';
  if (v.includes('MONO')) return 'Monofásico';
  if (v.includes('TRI')) return 'Trifásico';
  if (v.includes('BI')) return 'Bifásico';
  return original;
}

function normalizeImportedTag(value) {
  const normalized = normalizeImportText(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
  if (!normalized) return 'MAIS VENDIDO';
  return KIT_IMPORT_TAG_MAP[normalized] || 'PROJETO ESPECIAL';
}

function getImportDefaultCategory() {
  const validCategories = new Set(['kitsInversor', 'kitsMicro', 'kitsString']);
  return validCategories.has(state.activeTab) ? state.activeTab : 'kitsInversor';
}

function getMappedImportValue(rowMap, field) {
  const aliases = KIT_IMPORT_HEADER_ALIASES[field] || [];
  for (const key of aliases) {
    const value = rowMap[key];
    if (value !== undefined && String(value).trim() !== '') return value;
  }
  return '';
}

function buildKitMatchKey(name, brand, power) {
  const powerNum = Number(power);
  const powerKey = Number.isFinite(powerNum) ? powerNum.toFixed(4) : '';
  return `${normalizeImportHeader(name)}|${normalizeImportHeader(brand)}|${powerKey}`;
}

async function readImportedKitRows(file) {
  if (typeof XLSX === 'undefined') {
    throw new Error('Biblioteca XLSX nao carregada. Recarregue a pagina e tente novamente.');
  }

  const fileName = String(file?.name || '').toLowerCase();
  let workbook;

  if (fileName.endsWith('.csv')) {
    const csvText = await file.text();
    workbook = XLSX.read(csvText, {
      type: 'string',
      FS: detectCsvDelimiter(csvText),
      raw: false,
    });
  } else {
    const data = await file.arrayBuffer();
    workbook = XLSX.read(data, { type: 'array', raw: false });
  }

  const firstSheet = workbook.SheetNames?.[0];
  if (!firstSheet) return [];

  const sheet = workbook.Sheets[firstSheet];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
  return rows.map((row, idx) => ({ ...row, __rowNum: idx + 2 }));
}

function mapImportedRowsToProducts(rows) {
  const fallbackCategory = getImportDefaultCategory();
  const mappedRows = [];
  const errors = [];

  rows.forEach((row, index) => {
    const rowNum = Number(row.__rowNum) || index + 2;
    const rowMap = {};

    Object.entries(row).forEach(([header, value]) => {
      if (header === '__rowNum') return;
      const normalizedHeader = normalizeImportHeader(header);
      if (!normalizedHeader) return;
      rowMap[normalizedHeader] = value;
    });

    if (Object.keys(rowMap).length === 0) return;

    const explicitId = String(getMappedImportValue(rowMap, 'id')).trim() || null;
    const rawName = String(getMappedImportValue(rowMap, 'name')).trim();
    const rawBrand = String(getMappedImportValue(rowMap, 'brand')).trim();
    const rawCategory = String(getMappedImportValue(rowMap, 'categoria')).trim();
    const rawType = String(getMappedImportValue(rowMap, 'type')).trim();
    const rawTag = String(getMappedImportValue(rowMap, 'tag')).trim();
    const rawDescription = String(getMappedImportValue(rowMap, 'description')).trim();

    const name  = rawName.toUpperCase();
    const brand = rawBrand.toUpperCase();
    const power = parseSpreadsheetNumber(getMappedImportValue(rowMap, 'power'));
    const price = parseSpreadsheetNumber(getMappedImportValue(rowMap, 'price'));
    let listPrice = parseSpreadsheetNumber(getMappedImportValue(rowMap, 'list_price'));
    const hasLookupKey = Boolean(name) && Boolean(brand) && Number.isFinite(power) && power > 0;

    const rowIssues = [];
    if (!Number.isFinite(price) || price <= 0) rowIssues.push('preco');
    if (!explicitId) {
      if (!name) rowIssues.push('nome');
      if (!brand) rowIssues.push('marca');
      if (!Number.isFinite(power) || power <= 0) rowIssues.push('potencia');
    }

    if (rowIssues.length > 0) {
      errors.push(`Linha ${rowNum}: campos invalidos (${rowIssues.join(', ')}).`);
      return;
    }

    if (!Number.isFinite(listPrice) || listPrice <= 0 || listPrice < price) {
      listPrice = price;
    }

    const categoria = rawCategory
      ? normalizeImportedCategory(rawCategory, fallbackCategory)
      : null;
    const type = rawType ? normalizeImportedType(rawType) : null;
    const tag = rawTag ? normalizeImportedTag(rawTag) : null;

    // Coluna opcional "ativo": SIM/NÃO, true/false, 1/0 (ausente = não mexe).
    const rawAtivo = String(getMappedImportValue(rowMap, 'ativo')).trim().toLowerCase();
    const ativo = !rawAtivo
      ? null
      : !['nao', 'não', 'no', 'false', '0', 'inativo'].includes(rawAtivo);

    let description = rawDescription || null;
    if (!description && !explicitId && Number.isFinite(power) && brand) {
      description = `${power}kWp - ${brand}`;
    }

    mappedRows.push({
      _rowNum: rowNum,
      _explicitId: explicitId,
      _hasLookupKey: hasLookupKey,
      categoria,
      name: name || null,
      brand: brand || null,
      power: Number.isFinite(power) && power > 0 ? power : null,
      price,
      list_price: listPrice,
      type,
      tag,
      description,
      ativo,
    });
  });

  const dedupMap = new Map();
  let duplicateRows = 0;
  for (const row of mappedRows) {
    const key = row._explicitId
      ? `id:${row._explicitId}`
      : row._hasLookupKey
        ? `key:${buildKitMatchKey(row.name, row.brand, row.power)}`
        : `row:${row._rowNum}`;
    if (dedupMap.has(key)) duplicateRows++;
    dedupMap.set(key, row);
  }

  return {
    validRows: [...dedupMap.values()],
    errors,
    duplicateRows,
  };
}

async function importMappedKits(mappedRows) {
  const franquiaId = state.adminKitsFranquia || null;

  const { data: existing = [], error: existingErr } = await supabaseClient
    .from('produtos')
    .select('id, categoria, name, brand, power, type, tag, description, franquia_id');
  if (existingErr) throw existingErr;

  const byId = new Map(existing.map(item => [String(item.id), item]));
  const byKey = new Map(existing.map(item => [buildKitMatchKey(item.name, item.brand, item.power), item]));

  const toInsert = [];
  const toUpdate = [];
  let skippedNoData = 0;

  for (const row of mappedRows) {
    let target = null;
    if (row._explicitId) {
      target = byId.get(String(row._explicitId)) || null;
    }
    // Id inexistente NAO e mais descartado: cai para casamento por nome/potencia ou criacao.
    if (!target && row._hasLookupKey) {
      target = byKey.get(buildKitMatchKey(row.name, row.brand, row.power)) || null;
    }

    if (target) {
      const payload = {
        categoria: row.categoria || target.categoria,
        name: row.name || target.name,
        brand: row.brand || target.brand,
        power: row.power ?? target.power,
        price: row.price,
        list_price: row.list_price,
        type: row.type || target.type,
        tag: row.tag || target.tag,
        description: row.description || target.description,
        ...(row.ativo === null || row.ativo === undefined ? {} : { ativo: row.ativo }),
      };
      const exclusivaDestaUnidade = Boolean(franquiaId)
        && String(target.franquia_id || '') === String(franquiaId);
      toUpdate.push({ id: target.id, payload, exclusivaDestaUnidade });
    } else {
      // Sem correspondencia (id novo OU sem id): cria kit quando ha dados essenciais.
      if (!row.name || !row.brand || !Number.isFinite(row.power) || row.power <= 0) {
        skippedNoData++;
        continue;
      }

      toInsert.push({
        // Preserva o id da planilha quando informado (round-trip do export).
        ...(row._explicitId ? { id: row._explicitId } : {}),
        categoria: row.categoria || getImportDefaultCategory(),
        name: row.name,
        brand: row.brand,
        power: row.power,
        price: row.price,
        list_price: row.list_price,
        type: row.type || 'Bifásico',
        tag: row.tag || 'MAIS VENDIDO',
        description: row.description || `${row.power}kWp - ${row.brand}`,
        ativo: row.ativo === false ? false : true,
        // Com franquia selecionada, kit exclusivo dela; sem franquia (admin global), kit padrao.
        ...(franquiaId ? { franquia_id: franquiaId } : {}),
      });
    }
  }

  // 1) INSERT dos novos produtos
  let insertedRows = [];
  if (toInsert.length > 0) {
    const { data, error } = await supabaseClient
      .from('produtos')
      .insert(toInsert)
      .select('id, price, list_price');
    if (error) throw error;
    insertedRows = data || [];
  }

  // 2) precos_franquia dos novos: so a franquia selecionada; se admin global, todas as ativas.
  if (insertedRows.length > 0) {
    let alvos;
    if (franquiaId) {
      alvos = [{ id: franquiaId }];
    } else {
      const { data: fr = [], error } = await supabaseClient
        .from('franquias').select('id').eq('ativo', true);
      if (error) throw error;
      alvos = fr;
    }

    if (alvos.length > 0) {
      const pricingRows = [];
      for (const kit of insertedRows) {
        for (const f of alvos) {
          pricingRows.push({
            produto_id: kit.id,
            franquia_id: f.id,
            price: Number(kit.price) || 0,
            list_price: Number(kit.list_price) || 0,
          });
        }
      }
      const { error: pricingErr } = await supabaseClient
        .from('precos_franquia')
        .upsert(pricingRows, { onConflict: 'produto_id,franquia_id' });
      if (pricingErr) throw pricingErr;
    }
  }

  // 3) UPDATE dos existentes
  const precoUpserts = [];
  for (const item of toUpdate) {
    if (franquiaId) {
      // Preco sempre grava na franquia selecionada (fonte de verdade da lista da unidade).
      precoUpserts.push({
        produto_id: item.id,
        franquia_id: franquiaId,
        price: Number(item.payload.price) || 0,
        list_price: Number(item.payload.list_price) || 0,
      });
      // Campos de catalogo so mudam se o kit for exclusivo desta unidade (nao mexe no padrao global).
      if (item.exclusivaDestaUnidade) {
        const { error } = await supabaseClient.from('produtos').update({
          categoria: item.payload.categoria,
          name: item.payload.name,
          brand: item.payload.brand,
          power: item.payload.power,
          type: item.payload.type,
          tag: item.payload.tag,
          description: item.payload.description,
        }).eq('id', item.id);
        if (error) throw error;
      }
    } else {
      // Admin global: atualiza o produto padrao por completo (preco + catalogo).
      const { error } = await supabaseClient
        .from('produtos').update(item.payload).eq('id', item.id);
      if (error) throw error;
    }
  }

  if (precoUpserts.length > 0) {
    const { error } = await supabaseClient
      .from('precos_franquia')
      .upsert(precoUpserts, { onConflict: 'produto_id,franquia_id' });
    if (error) throw error;
  }

  return {
    insertedCount: insertedRows.length,
    updatedCount: toUpdate.length,
    skippedNoDataCount: skippedNoData,
  };
}

async function handleKitsSpreadsheetSelection(event) {
  const fileInput = event?.target;
  const file = fileInput?.files?.[0];
  if (!file) return;

  try {
    showToast('LENDO PLANILHA...');
    const rows = await readImportedKitRows(file);

    if (rows.length === 0) {
      showToast('PLANILHA VAZIA OU SEM DADOS.');
      return;
    }

    const mapped = mapImportedRowsToProducts(rows);
    if (mapped.validRows.length === 0) {
      showToast('NENHUMA LINHA VALIDA ENCONTRADA.');
      if (mapped.errors.length > 0) {
        console.warn('Importacao de kits - erros de validacao:', mapped.errors);
      }
      return;
    }

    const summaryLines = [
      `Arquivo: ${file.name}`,
      `Linhas lidas: ${rows.length}`,
      `Linhas validas: ${mapped.validRows.length}`,
      `Linhas ignoradas: ${mapped.errors.length}`,
    ];
    if (mapped.duplicateRows > 0) {
      summaryLines.push(`Duplicadas no arquivo: ${mapped.duplicateRows} (mantida a ultima).`);
    }
    summaryLines.push('', 'Deseja importar agora?');

    if (!confirm(summaryLines.join('\n'))) return;

    showToast('IMPORTANDO KITS...');
    const result = await importMappedKits(mapped.validRows);

    await fetchProducts();
    renderContent();

    const resultParts = [
      `${result.insertedCount} novo(s)`,
      `${result.updatedCount} atualizado(s)`,
    ];
    if (result.skippedNoDataCount > 0) {
      resultParts.push(`${result.skippedNoDataCount} ignorado(s) por falta de dados`);
    }
    if (mapped.errors.length > 0) {
      resultParts.push(`${mapped.errors.length} ignorado(s)`);
      console.warn('Importacao de kits - linhas ignoradas:', mapped.errors);
    }

    showToast(`IMPORTACAO CONCLUIDA: ${resultParts.join(' | ')}`);
  } catch (err) {
    const msg = err?.message || 'Erro inesperado';
    showToast(`ERRO AO IMPORTAR: ${msg}`);
  } finally {
    if (fileInput) fileInput.value = '';
  }
}

function triggerKitsImportPicker() {
  // Importar mexe no catálogo global (produtos) — só admin (RLS).
  if (!state.isAdmin) {
    showToast('APENAS ADMINISTRADOR PODE IMPORTAR KITS.');
    return;
  }

  const fileInput = document.getElementById('kits-import-file-input');
  if (!fileInput) {
    showToast('CAMPO DE IMPORTACAO NAO ENCONTRADO.');
    return;
  }

  fileInput.value = '';
  fileInput.click();
}

function exportCurrentKitsXLSX() {
  if (!canManageProductCatalog()) {
    showToast('ACESSO RESTRITO.');
    return;
  }

  const kits = Array.isArray(state.data) ? state.data : [];
  if (kits.length === 0) {
    showToast('NENHUM KIT PARA EXPORTAR.');
    return;
  }

  const columns = [
    { header: 'id', key: 'id' },
    { header: 'categoria', key: 'categoria' },
    { header: 'name', key: 'name' },
    { header: 'brand', key: 'brand' },
    { header: 'power', key: 'power' },
    { header: 'price', key: 'price' },
    { header: 'list_price', key: 'list_price' },
    { header: 'type', key: 'type' },
    { header: 'tag', key: 'tag' },
    { header: 'description', key: 'description' },
    { header: 'ativo', key: 'ativo' },
  ];

  const rows = kits.map(item => {
    const power = Number(item.power);
    const price = Number(item.price);
    const listPrice = Number(item.list_price);

    return {
      id: item.id ?? '',
      categoria: item.categoria || '',
      name: item.name || '',
      brand: item.brand || '',
      power: Number.isFinite(power) ? power : '',
      price: Number.isFinite(price) ? price : '',
      list_price: Number.isFinite(listPrice) ? listPrice : '',
      type: item.type || '',
      tag: item.tag || '',
      description: item.description || '',
      ativo: item.ativo === false ? 'NAO' : 'SIM',
    };
  });

  const datePart = new Date().toISOString().split('T')[0];
  const scopePart = state.adminKitsFranquia
    ? `franquia_${String(state.adminKitsFranquia).slice(0, 8)}`
    : 'matriz';

  exportToXLSX(rows, columns, `kits_exportados_${scopePart}_${datePart}`);
  showToast(`EXPORTACAO XLSX CONCLUIDA (${rows.length} KIT(S)).`);
}

function downloadKitsImportTemplateXLSX() {
  const columns = [
    { header: 'id', key: 'id' },
    { header: 'categoria', key: 'categoria' },
    { header: 'name', key: 'name' },
    { header: 'brand', key: 'brand' },
    { header: 'power', key: 'power' },
    { header: 'price', key: 'price' },
    { header: 'list_price', key: 'list_price' },
    { header: 'type', key: 'type' },
    { header: 'tag', key: 'tag' },
    { header: 'description', key: 'description' },
    { header: 'ativo', key: 'ativo' },
  ];

  const rows = [
    {
      id: '',
      categoria: 'kitsInversor',
      name: 'KIT 4 MOD 585W + MICRO INV GROWATT NEO 2.25KW',
      brand: 'GROWATT',
      power: 2.34,
      price: 7797,
      list_price: 8197,
      type: 'Bifasico',
      tag: 'ALTA POTENCIA',
      description: '2.34kWp - GROWATT',
      ativo: 'SIM',
    },
    {
      id: '',
      categoria: 'kitsInversor',
      name: 'KIT 5 MOD 585W + INV SOFAR 3.3K',
      brand: 'SOFAR',
      power: 2.925,
      price: 9597,
      list_price: 10197,
      type: 'Bifasico',
      tag: 'CUSTO BENEFICIO',
      description: '2.925kWp - SOFAR',
      ativo: 'SIM',
    },
    {
      id: '',
      categoria: 'kitsMicro',
      name: 'KIT 6 MOD 585W + MICRO INV SOFAR 3.3K',
      brand: 'SOFAR',
      power: 3.51,
      price: 10697,
      list_price: 11397,
      type: 'Trifasico',
      tag: 'MAIS VENDIDO',
      description: '3.51kWp - SOFAR',
      ativo: 'SIM',
    },
  ];

  exportToXLSX(rows, columns, 'modelo_importacao_kits');
  showToast('MODELO XLSX GERADO.');
}

(function bindKitsImportInputListener() {
  const fileInput = document.getElementById('kits-import-file-input');
  if (!fileInput || fileInput.dataset.bound === '1') return;
  fileInput.addEventListener('change', handleKitsSpreadsheetSelection);
  fileInput.dataset.bound = '1';
})();

// =======================================================================
// IMPORT / EXPORT / MODELO — EQUIPAMENTOS (componentes, admin-only)
// Reusa os helpers de XLSX dos kits (readImportedKitRows, parseSpreadsheetNumber,
// exportToXLSX). Casamento por nome+categoria; ativo SIM/NÃO opcional.
// =======================================================================
const EQUIP_IMPORT_ALIASES = {
  id:          ['id'],
  tipo:        ['tipo', 'categoria', 'category', 'grupo'],
  nome:        ['nome', 'name', 'produto', 'descricao', 'item'],
  marca:       ['marca', 'brand', 'fabricante'],
  potencia_wp: ['potenciawp', 'potencia', 'power', 'wp', 'watts'],
  unidade:     ['unidade', 'unit', 'un', 'medida'],
  preco:       ['preco', 'price', 'precovenda', 'valor', 'precounitario', 'valorunitario'],
  custo:       ['custo', 'cost', 'precocusto', 'custounitario'],
  ativo:       ['ativo', 'status', 'emlinha'],
};

function _equipMappedValue(rowMap, field) {
  for (const key of (EQUIP_IMPORT_ALIASES[field] || [])) {
    const v = rowMap[key];
    if (v !== undefined && String(v).trim() !== '') return v;
  }
  return '';
}

function _normalizeEquipCategoria(raw) {
  const s = normalizeImportHeader(raw);
  if (!s) return 'outro';
  if (s.includes('modulo') || s.includes('painel') || s.includes('placa')) return 'modulo';
  if (s.includes('inversor') || s.includes('micro')) return 'inversor';
  if (s.includes('estrutura') || s.includes('fixacao') || s.includes('suporte')) return 'estrutura';
  if (s.includes('cabo') || s.includes('conector') || s.includes('stringbox')) return 'cabo';
  if (s.includes('servico') || s.includes('maodeobra') || s.includes('instalacao') || s.includes('projeto') || s.includes('frete') || s.includes('homologacao')) return 'servico';
  if (EQUIP_CATEGORIAS.some(c => c.v === s)) return s;
  return 'outro';
}

function mapImportedEquipamentos(rows) {
  const mapped = [];
  const errors = [];
  rows.forEach((row, index) => {
    const rowNum = Number(row.__rowNum) || index + 2;
    const rowMap = {};
    Object.entries(row).forEach(([header, value]) => {
      if (header === '__rowNum') return;
      const h = normalizeImportHeader(header);
      if (h) rowMap[h] = value;
    });
    if (Object.keys(rowMap).length === 0) return;

    const nome = String(_equipMappedValue(rowMap, 'nome')).trim();
    const preco = parseSpreadsheetNumber(_equipMappedValue(rowMap, 'preco'));
    if (!nome || !Number.isFinite(preco) || preco < 0) {
      errors.push(`Linha ${rowNum}: nome e preço são obrigatórios.`);
      return;
    }
    const potencia = parseSpreadsheetNumber(_equipMappedValue(rowMap, 'potencia_wp'));
    const custo = parseSpreadsheetNumber(_equipMappedValue(rowMap, 'custo'));
    const rawAtivo = String(_equipMappedValue(rowMap, 'ativo')).trim().toLowerCase();
    const ativo = !rawAtivo ? true : !['nao', 'não', 'no', 'false', '0', 'inativo'].includes(rawAtivo);
    const unidadeRaw = String(_equipMappedValue(rowMap, 'unidade')).trim();

    mapped.push({
      _id: String(_equipMappedValue(rowMap, 'id')).trim() || null,
      tipo: _normalizeEquipCategoria(_equipMappedValue(rowMap, 'tipo')),
      nome: nome.toUpperCase(),
      marca: String(_equipMappedValue(rowMap, 'marca')).trim().toUpperCase() || null,
      potencia_wp: Number.isFinite(potencia) && potencia > 0 ? potencia : null,
      unidade: EQUIP_UNIDADES.includes(unidadeRaw) ? unidadeRaw : (unidadeRaw || 'un'),
      preco_unitario: preco,
      custo: Number.isFinite(custo) && custo >= 0 ? custo : null,
      ativo,
    });
  });
  return { validRows: mapped, errors };
}

async function importEquipamentos(mappedRows) {
  const { data: existing = [], error: exErr } = await supabaseClient
    .from('componentes').select('id, tipo, nome');
  if (exErr) throw exErr;
  const byId = new Map(existing.map(e => [String(e.id), e]));
  const byKey = new Map(existing.map(e => [`${e.tipo}|${normalizeImportHeader(e.nome)}`, e]));

  const toInsert = [];
  const toUpdate = [];
  for (const row of mappedRows) {
    const payload = {
      tipo: row.tipo, nome: row.nome, marca: row.marca,
      potencia_wp: row.potencia_wp, unidade: row.unidade,
      preco_unitario: row.preco_unitario, custo: row.custo, ativo: row.ativo,
    };
    let target = row._id ? byId.get(String(row._id)) : null;
    if (!target) target = byKey.get(`${row.tipo}|${normalizeImportHeader(row.nome)}`) || null;
    if (target) toUpdate.push({ id: target.id, payload });
    else toInsert.push(payload);
  }

  let inserted = 0;
  if (toInsert.length > 0) {
    const { data, error } = await supabaseClient.from('componentes').insert(toInsert).select('id');
    if (error) throw error;
    inserted = (data || []).length;
  }
  for (const u of toUpdate) {
    const { error } = await supabaseClient.from('componentes').update(u.payload).eq('id', u.id);
    if (error) throw error;
  }
  return { insertedCount: inserted, updatedCount: toUpdate.length };
}

async function handleEquipSpreadsheetSelection(event) {
  const fileInput = event?.target;
  const file = fileInput?.files?.[0];
  if (!file) return;
  try {
    showToast('LENDO PLANILHA...');
    const rows = await readImportedKitRows(file);
    if (rows.length === 0) { showToast('PLANILHA VAZIA OU SEM DADOS.'); return; }

    const mapped = mapImportedEquipamentos(rows);
    if (mapped.validRows.length === 0) {
      showToast('NENHUMA LINHA VALIDA ENCONTRADA.');
      if (mapped.errors.length > 0) console.warn('Importacao de equipamentos - erros:', mapped.errors);
      return;
    }

    const summary = [
      `Arquivo: ${file.name}`,
      `Linhas lidas: ${rows.length}`,
      `Linhas validas: ${mapped.validRows.length}`,
      `Linhas ignoradas: ${mapped.errors.length}`,
      '', 'Deseja importar agora?',
    ].join('\n');
    if (!confirm(summary)) return;

    showToast('IMPORTANDO EQUIPAMENTOS...');
    const result = await importEquipamentos(mapped.validRows);
    await fetchEquipamentos();
    renderContent();

    const parts = [`${result.insertedCount} novo(s)`, `${result.updatedCount} atualizado(s)`];
    if (mapped.errors.length > 0) {
      parts.push(`${mapped.errors.length} ignorado(s)`);
      console.warn('Importacao de equipamentos - linhas ignoradas:', mapped.errors);
    }
    showToast(`IMPORTACAO CONCLUIDA: ${parts.join(' | ')}`);
  } catch (err) {
    showToast(`ERRO AO IMPORTAR: ${err?.message || 'Erro inesperado'}`);
  } finally {
    if (fileInput) fileInput.value = '';
  }
}

function triggerEquipImportPicker() {
  if (!state.isAdmin) { showToast('APENAS ADMINISTRADOR PODE IMPORTAR.'); return; }
  const fileInput = document.getElementById('equip-import-file-input');
  if (!fileInput) { showToast('CAMPO DE IMPORTACAO NAO ENCONTRADO.'); return; }
  fileInput.value = '';
  fileInput.click();
}

const EQUIP_XLSX_COLUMNS = [
  { header: 'id', key: 'id' },
  { header: 'categoria', key: 'categoria' },
  { header: 'nome', key: 'nome' },
  { header: 'marca', key: 'marca' },
  { header: 'potencia_wp', key: 'potencia_wp' },
  { header: 'unidade', key: 'unidade' },
  { header: 'preco', key: 'preco' },
  { header: 'custo', key: 'custo' },
  { header: 'ativo', key: 'ativo' },
];

function exportEquipamentosXLSX() {
  if (!state.isAdmin) { showToast('ACESSO RESTRITO.'); return; }
  const itens = Array.isArray(state.equipamentos) ? state.equipamentos : [];
  if (itens.length === 0) { showToast('NENHUM EQUIPAMENTO PARA EXPORTAR.'); return; }
  const rows = itens.map(e => ({
    id: e.id ?? '',
    categoria: e.tipo || 'outro',
    nome: e.nome || '',
    marca: e.marca || '',
    potencia_wp: Number.isFinite(Number(e.potencia_wp)) && e.potencia_wp != null ? Number(e.potencia_wp) : '',
    unidade: e.unidade || 'un',
    preco: Number.isFinite(Number(e.preco_unitario)) ? Number(e.preco_unitario) : '',
    custo: e.custo != null && Number.isFinite(Number(e.custo)) ? Number(e.custo) : '',
    ativo: e.ativo === false ? 'NAO' : 'SIM',
  }));
  exportToXLSX(rows, EQUIP_XLSX_COLUMNS, `equipamentos_${new Date().toISOString().split('T')[0]}`);
  showToast(`EXPORTACAO CONCLUIDA (${rows.length} ITEM(NS)).`);
}

function downloadEquipamentosTemplateXLSX() {
  const rows = [
    { id: '', categoria: 'modulo',    nome: 'MODULO 620W N-TYPE',            marca: 'DAH',     potencia_wp: 620, unidade: 'un',  preco: 480,   custo: 380,  ativo: 'SIM' },
    { id: '', categoria: 'inversor',  nome: 'INVERSOR SOFAR 3.3KW',          marca: 'SOFAR',   potencia_wp: '',  unidade: 'un',  preco: 2200,  custo: 1750, ativo: 'SIM' },
    { id: '', categoria: 'estrutura', nome: 'ESTRUTURA TELHADO CERAMICO',    marca: 'ROMAGNOLE', potencia_wp: '', unidade: 'kWp', preco: 350,   custo: 260,  ativo: 'SIM' },
    { id: '', categoria: 'cabo',      nome: 'CABO SOLAR 6MM PRETO',          marca: '',        potencia_wp: '',  unidade: 'm',   preco: 6.5,   custo: 4.2,  ativo: 'SIM' },
    { id: '', categoria: 'servico',   nome: 'MAO DE OBRA INSTALACAO',        marca: '',        potencia_wp: '',  unidade: 'kWp', preco: 700,   custo: 450,  ativo: 'SIM' },
    { id: '', categoria: 'outro',     nome: 'MONITORAMENTO ANUAL',           marca: '',        potencia_wp: '',  unidade: 'vb',  preco: 300,   custo: 120,  ativo: 'SIM' },
  ];
  exportToXLSX(rows, EQUIP_XLSX_COLUMNS, 'modelo_importacao_equipamentos');
  showToast('MODELO XLSX GERADO.');
}

(function bindEquipImportInputListener() {
  const fileInput = document.getElementById('equip-import-file-input');
  if (!fileInput || fileInput.dataset.bound === '1') return;
  fileInput.addEventListener('change', handleEquipSpreadsheetSelection);
  fileInput.dataset.bound = '1';
})();
