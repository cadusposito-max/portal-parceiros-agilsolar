// ==========================================
// RENDERIZADOR: PRODUTOS (Admin)
// ==========================================

function canManageProductCatalog() {
  return Boolean(state.isAdmin || state.isGestor);
}

function renderProductsList(container) {
  const emptyState = document.getElementById('empty-state');
  const emptyBtn   = document.getElementById('empty-state-btn');

  if (!state.isEditMode) {
    container.innerHTML  = '';
    container.className  = 'flex flex-col';
    emptyState.classList.remove('hidden');

    document.getElementById('empty-state-icon').innerHTML  = '<i data-lucide="lock" class="w-10 h-10 text-red-500"></i>';
    document.getElementById('empty-state-icon').className  = 'inline-flex items-center justify-center w-20 h-20 bg-red-900/10 mb-6 text-red-500 border border-red-800';
    document.getElementById('empty-state-text').innerHTML  = "<span class='text-red-500 text-2xl'>ACESSO BLOQUEADO</span><br><span class='text-sm font-medium text-neutral-400 lowercase normal-case mt-4 block max-w-md mx-auto'>Os kits e valores agora são exclusivos do <b>Criador de Propostas</b>.<br>Aceda aos seus clientes e clique em 'Nova Proposta' para gerar o orçamento.</span>";

    emptyBtn.classList.remove('hidden');
    emptyBtn.innerText = 'IR PARA MEUS CLIENTES';
    emptyBtn.onclick = () => setTab('clientes');
    lucide.createIcons();
    return;
  }

  document.getElementById('empty-state-icon').innerHTML = '<i data-lucide="search" class="w-10 h-10"></i>';
  document.getElementById('empty-state-icon').className = 'inline-flex items-center justify-center w-20 h-20 bg-neutral-900 mb-6 text-neutral-700 border border-neutral-800';

  let list = state.activeTab === 'admin'
    ? [...state.data]
    : state.data.filter(item => item.categoria === state.activeTab);
  if (state.searchTerm) {
    const lower = state.searchTerm.toLowerCase();
    list = list.filter(item =>
      item.name.toLowerCase().includes(lower) || item.brand.toLowerCase().includes(lower)
    );
  }

  if (list.length === 0) {
    container.innerHTML = '';
    emptyState.classList.remove('hidden');
    document.getElementById('empty-state-text').innerText = 'Nenhum kit encontrado';
    if (state.isEditMode) {
      emptyBtn.classList.remove('hidden');
      emptyBtn.innerText = '+ CRIAR NOVO ITEM';
      emptyBtn.onclick = () => openModal();
    } else {
      emptyBtn.classList.add('hidden');
    }
    return;
  } else {
    emptyState.classList.add('hidden');
  }

  container.className = state.viewMode === 'grid'
    ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8'
    : 'flex flex-col gap-4 bg-neutral-900/50 border border-neutral-800 rounded-none';

  container.innerHTML = list.map(item => {
    const discount          = Math.round(((item.list_price - item.price) / item.list_price) * 100);
    const badgeClass        = getBadgeStyles(item.tag);
    const formattedPrice    = formatCurrency(item.price);
    const formattedListPrice= formatCurrency(item.list_price);
    const safeTag  = escapeHTML(item.tag || '');
    const safeName = escapeHTML(item.name || '');
    const safeBrand= escapeHTML(item.brand || '');
    const safeType = escapeHTML(item.type || '');
    const safeDesc = escapeHTML(item.description || '');

    const adminButtons = `
      <div class="flex gap-1">
        <button data-item-id="${item.id}" onclick="openModalById(this.dataset.itemId)" aria-label="Editar ${escapeHTML(item.name)}" class="flex items-center gap-1.5 px-3 py-2 bg-blue-600/20 text-blue-400 hover:bg-blue-600 hover:text-white transition-colors text-[10px] font-black uppercase tracking-widest"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>EDITAR</button>
        <button onclick="deleteItem('${item.id}')" aria-label="Excluir ${escapeHTML(item.name)}" class="flex items-center gap-1.5 px-3 py-2 bg-red-600/20 text-red-400 hover:bg-red-600 hover:text-white transition-colors text-[10px] font-black uppercase tracking-widest"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>EXCLUIR</button>
      </div>`;

    if (state.viewMode === 'grid') {
      return `
        <div class="relative group flex flex-col overflow-hidden transition-all duration-300 bg-neutral-900 border-2 border-dashed border-orange-500/50 hover:-translate-y-1 opacity-80 hover:opacity-100">
          <div class="absolute top-0 right-0 p-2 z-20 flex gap-1 bg-black/80 backdrop-blur border-b border-l border-neutral-700">${adminButtons}</div>
          <div class="absolute -left-1 top-4 z-10"><div class="bg-red-600 text-white text-xs font-black px-3 py-1 shadow-lg flex items-center gap-1 skew-x-[-10deg] border-2 border-red-800"><span class="skew-x-[10deg]">-${discount}% OFF</span></div></div>
          <div class="p-6 relative z-10 flex flex-col h-full">
            <div class="flex justify-end mb-4"><span class="px-2 py-0.5 rounded-none skew-x-[-10deg] text-[10px] font-black uppercase tracking-tighter border-l-4 shadow-[0_0_10px_rgba(0,0,0,0.5)] ${badgeClass}"><span class="skew-x-[10deg] inline-block">${safeTag}</span></span></div>
            <div class="mb-1"><span class="text-[10px] text-neutral-500 font-bold uppercase tracking-[0.2em]">${safeBrand}</span></div>
            <h3 class="text-white font-black text-xl leading-none uppercase tracking-tight mb-4">${safeName}</h3>
            <div class="bg-black/50 border border-neutral-800 p-3 mb-6 grid grid-cols-2 gap-2">
              <div class="flex flex-col"><span class="text-[10px] text-neutral-500 font-bold uppercase">Potência</span><span class="text-orange-500 font-black text-lg flex items-center gap-1"><i data-lucide="zap" class="w-4 h-4 fill-orange-500"></i> ${item.power} <span class="text-xs">kWp</span></span></div>
              <div class="flex flex-col border-l border-neutral-800 pl-3"><span class="text-[10px] text-neutral-500 font-bold uppercase">Tipo</span><span class="text-neutral-300 font-bold text-sm uppercase mt-1 truncate">${safeType}</span></div>
            </div>
            <div class="mt-auto pt-4 border-t-2 border-dashed border-neutral-800">
              <div class="flex flex-col mb-1"><span class="text-xs text-neutral-500 line-through font-bold decoration-red-500 decoration-2">DE: ${formattedListPrice}</span></div>
              <div>
                <span class="text-[10px] text-orange-500 font-black uppercase tracking-wider block mb-[-4px]">À VISTA</span>
                <div class="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-yellow-400 tracking-tighter pb-1 pr-1 inline-block"><span class="text-base align-top text-neutral-500 mr-0.5">R$</span>${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(item.price)}<span class="text-lg align-top text-neutral-500">,00</span></div>
              </div>
            </div>
          </div>
        </div>`;
    } else {
      return `
        <div class="relative flex flex-col sm:flex-row sm:items-center p-5 gap-4 group bg-neutral-900 border-b border-dashed border-orange-500/30 transition-all opacity-80 hover:opacity-100">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-3 mb-2 flex-wrap">
              <span class="px-2 py-0.5 rounded-none skew-x-[-10deg] text-[10px] font-black uppercase tracking-tighter border-l-4 shadow-[0_0_10px_rgba(0,0,0,0.5)] ${badgeClass}"><span class="skew-x-[10deg] inline-block">${safeTag}</span></span>
              <span class="text-[10px] font-black text-neutral-500 uppercase tracking-widest bg-black px-2 py-0.5">${safeBrand}</span>
            </div>
            <h3 class="text-white font-black text-lg uppercase tracking-tight truncate group-hover:text-orange-400 transition-colors">${safeName}</h3>
            <div class="flex items-center gap-4 text-xs mt-2 text-neutral-400 uppercase font-bold">
              <span class="flex items-center text-orange-500"><i data-lucide="zap" class="w-3 h-3 mr-1"></i> ${item.power} kWp</span>
              <span class="w-1 h-1 bg-neutral-600 rounded-full"></span>
              <span class="truncate max-w-[300px]">${safeDesc}</span>
            </div>
          </div>
          <div class="flex items-center justify-between sm:justify-end gap-6 sm:min-w-[300px] border-t sm:border-t-0 border-neutral-800 pt-3 sm:pt-0 mt-2 sm:mt-0">
            <div class="text-right">
              <div class="text-[10px] font-bold text-neutral-500 line-through decoration-red-600">${formattedListPrice}</div>
              <div class="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-yellow-400 tracking-tighter pb-1 pr-1 inline-block">${formattedPrice}</div>
            </div>
            ${adminButtons}
          </div>
        </div>`;
    }
  }).join('');
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

  modal.classList.remove('hidden');
  if (item) {
    document.getElementById('modal-title').innerText     = 'EDITAR OFERTA';
    document.getElementById('form-id').value             = item.id;
    document.getElementById('form-name').value           = item.name;
    document.getElementById('form-brand').value          = item.brand;
    document.getElementById('form-power').value          = item.power;
    document.getElementById('form-price').value          = item.price;
    document.getElementById('form-listPrice').value      = item.list_price;
    document.getElementById('form-type').value           = item.type;
    document.getElementById('form-tag').value            = item.tag;
  } else {
    document.getElementById('modal-title').innerText = 'NOVA OFERTA';
    document.getElementById('product-form').reset();
    document.getElementById('form-id').value = '';
  }
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

  const productData = {
    categoria:  (state.activeTab === 'clientes' || state.activeTab === 'admin') ? 'kitsInversor' : state.activeTab,
    name:       document.getElementById('form-name').value.toUpperCase(),
    brand:      document.getElementById('form-brand').value.toUpperCase(),
    power:      Number(document.getElementById('form-power').value),
    price:      Number(document.getElementById('form-price').value),
    list_price: Number(document.getElementById('form-listPrice').value),
    type:       document.getElementById('form-type').value,
    tag:        document.getElementById('form-tag').value,
    description:document.getElementById('form-power').value + 'kWp - ' + document.getElementById('form-brand').value.toUpperCase()
  };

  if (id) {
    await supabaseClient.from('produtos').update(productData).eq('id', id);
    // Atualiza preço na franquia selecionada no admin
    if (state.adminKitsFranquia) {
      await supabaseClient.from('precos_franquia').upsert(
        { produto_id: id, franquia_id: state.adminKitsFranquia, price: productData.price, list_price: productData.list_price },
        { onConflict: 'produto_id,franquia_id' }
      );
    }
  } else {
    const { data: newKit } = await supabaseClient.from('produtos').insert([productData]).select().single();
    if (newKit) {
      // Cria precos_franquia para TODAS as franquias ativas (mesmo preço inicial)
      const { data: todasFranquias = [] } = await supabaseClient.from('franquias').select('id').eq('ativo', true);
      if (todasFranquias.length > 0) {
        await supabaseClient.from('precos_franquia').upsert(
          todasFranquias.map(f => ({ produto_id: newKit.id, franquia_id: f.id, price: productData.price, list_price: productData.list_price })),
          { onConflict: 'produto_id,franquia_id' }
        );
      }
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

  if (confirm('TEM CERTEZA? ESSA AÇÃO NÃO PODE SER DESFEITA.')) {
    await supabaseClient.from('produtos').delete().eq('id', id);
    await fetchProducts();
    showToast('ITEM REMOVIDO');
    renderContent();
  }
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
  const { data: existing = [], error: existingErr } = await supabaseClient
    .from('produtos')
    .select('id, categoria, name, brand, power, type, tag, description');
  if (existingErr) throw existingErr;

  const byId = new Map(existing.map(item => [String(item.id), item]));
  const byKey = new Map(existing.map(item => [buildKitMatchKey(item.name, item.brand, item.power), item]));

  const toInsert = [];
  const toUpdate = [];
  const skippedIdRows = [];

  for (const row of mappedRows) {
    let target = null;
    if (row._explicitId) {
      target = byId.get(String(row._explicitId)) || null;
      if (!target) {
        skippedIdRows.push(row._rowNum);
        continue;
      }
    } else if (row._hasLookupKey) {
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
      };
      toUpdate.push({ id: target.id, payload });
    } else {
      // Sem ID e sem correspondencia: cria novo kit apenas quando dados essenciais existem.
      if (!row.name || !row.brand || !Number.isFinite(row.power) || row.power <= 0) {
        continue;
      }

      const payload = {
        categoria: row.categoria || getImportDefaultCategory(),
        name: row.name,
        brand: row.brand,
        power: row.power,
        price: row.price,
        list_price: row.list_price,
        type: row.type || 'Bifasico',
        tag: row.tag || 'MAIS VENDIDO',
        description: row.description || `${row.power}kWp - ${row.brand}`,
      };
      toInsert.push(payload);
    }
  }

  let insertedRows = [];
  if (toInsert.length > 0) {
    const { data, error } = await supabaseClient
      .from('produtos')
      .insert(toInsert)
      .select('id, price, list_price');
    if (error) throw error;
    insertedRows = data || [];
  }

  const updateGlobalPrices = !state.adminKitsFranquia;
  for (const item of toUpdate) {
    const produtoPayload = updateGlobalPrices
      ? item.payload
      : {
          categoria: item.payload.categoria,
          name: item.payload.name,
          brand: item.payload.brand,
          power: item.payload.power,
          type: item.payload.type,
          tag: item.payload.tag,
          description: item.payload.description,
        };

    const { error } = await supabaseClient
      .from('produtos')
      .update(produtoPayload)
      .eq('id', item.id);
    if (error) throw error;
  }

  if (insertedRows.length > 0) {
    const { data: franquias = [], error: franquiasErr } = await supabaseClient
      .from('franquias')
      .select('id')
      .eq('ativo', true);
    if (franquiasErr) throw franquiasErr;

    if (franquias.length > 0) {
      const pricingRows = [];
      for (const kit of insertedRows) {
        for (const franquia of franquias) {
          pricingRows.push({
            produto_id: kit.id,
            franquia_id: franquia.id,
            price: Number(kit.price) || 0,
            list_price: Number(kit.list_price) || 0,
          });
        }
      }

      if (pricingRows.length > 0) {
        const { error: pricingErr } = await supabaseClient
          .from('precos_franquia')
          .upsert(pricingRows, { onConflict: 'produto_id,franquia_id' });
        if (pricingErr) throw pricingErr;
      }
    }
  }

  if (state.adminKitsFranquia && toUpdate.length > 0) {
    const updatePricingRows = toUpdate.map(item => ({
      produto_id: item.id,
      franquia_id: state.adminKitsFranquia,
      price: Number(item.payload.price) || 0,
      list_price: Number(item.payload.list_price) || 0,
    }));

    const { error: updatePricingErr } = await supabaseClient
      .from('precos_franquia')
      .upsert(updatePricingRows, { onConflict: 'produto_id,franquia_id' });
    if (updatePricingErr) throw updatePricingErr;
  }

  return {
    insertedCount: insertedRows.length,
    updatedCount: toUpdate.length,
    skippedIdCount: skippedIdRows.length,
    skippedIdRows,
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
    if (result.skippedIdCount > 0) {
      resultParts.push(`${result.skippedIdCount} ignorado(s) por ID nao encontrado`);
      console.warn('Importacao de kits - linhas com ID nao encontrado:', result.skippedIdRows);
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
  if (state.activeTab !== 'admin' || state.adminSection !== 'produtos') {
    showToast('ACESSO DISPONIVEL APENAS NA ABA ADMIN > KITS.');
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
  if (state.activeTab !== 'admin' || state.adminSection !== 'produtos') {
    showToast('ACESSO DISPONIVEL APENAS NA ABA ADMIN > KITS.');
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
