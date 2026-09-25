// ==========================================
// CRM — ARQUIVOS DO CLIENTE (aba "Arquivos" da ficha CRM 360)
// Checklist de documentos da Engenharia (Manual de Processos v1.1, §5.1)
// agrupado por etapa + pastas extras (Engenharia / Inspeção / Outros).
//
// Storage: bucket PRIVADO crm-arquivos, caminho
//   franquias/{franquia_id}/clientes/{cliente_id}/{tipo}/{arquivo}
// Metadados em cliente_arquivos. RLS (can_access_cliente): vendedor dono,
// gestor da franquia, admin e a engenharia central da Matriz.
// Leitura por URL assinada (1 h), igual às fotos de O&M (om-os.js).
// ==========================================

const CRM_ARQ_BUCKET = 'crm-arquivos';
const CRM_ARQ_MAX_BYTES = 20 * 1024 * 1024;
const CRM_ARQ_ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif';
const CRM_ARQ_MIME_POR_EXT = {
  pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  webp: 'image/webp', heic: 'image/heic', heif: 'image/heif',
};

// Obrigatórios para a engenharia. `slots` = fotos nomeadas (todas exigidas);
// `campo` = item que também pode ser cumprido com texto (clientes.padrao_localizacao).
const CRM_DOCS_CHECKLIST = [
  { grupo: 'Cadastro', icon: 'id-card', itens: [
    { tipo: 'rg_cnh', label: 'RG / CNH do titular', dica: 'Dentro da validade e com foto legível. Sem CNH, vale RG + CPF.' },
    { tipo: 'conta_energia', label: 'Conta de energia', dica: 'Fatura atual da UC e, se houver, a da unidade de compensação.' },
  ] },
  { grupo: 'Vistoria', icon: 'camera', itens: [
    { tipo: 'foto_padrao', label: 'Foto do padrão', dica: 'Alta qualidade, com os componentes da instalação visíveis.' },
    { tipo: 'foto_disjuntor', label: 'Foto do disjuntor', dica: 'Disjuntor do padrão de entrada.' },
    { tipo: 'foto_fachada', label: 'Foto da fachada', dica: 'Frente do imóvel onde será a instalação.' },
    { tipo: 'localizacao_padrao', label: 'Localização do padrão', dica: 'Endereço completo ou coordenada GPS do padrão.', campo: true },
    { tipo: 'foto_medidor', label: 'Foto do medidor', dica: 'Dados legíveis, incluindo o número de série.' },
    { tipo: 'caixa_medicao', label: 'Fotos da caixa de medição', dica: 'Quatro fotos: frontal, traseira, aberta e fechada.',
      slots: [['frontal', 'Frontal'], ['traseira', 'Traseira'], ['aberta', 'Aberta'], ['fechada', 'Fechada']] },
  ] },
  { grupo: 'Procuração e pagamento', icon: 'stamp', itens: [
    { tipo: 'procuracao', label: 'Procuração', dica: 'Assinada e com firma reconhecida.' },
    { tipo: 'comprovante_taxa', label: 'Comprovante da taxa de projeto', dica: 'Pagamento da taxa do projeto técnico.' },
  ] },
];

// Fora da conta dos obrigatórios.
const CRM_ARQ_PASTAS_EXTRAS = [
  { tipo: 'engenharia', label: 'Engenharia', icon: 'hard-hat', dica: 'ART, parecer de acesso e outros documentos técnicos.' },
  { tipo: 'inspecao', label: 'Inspeção do sistema', icon: 'scan-search', dica: 'Fotos e registros depois da instalação.' },
  { tipo: 'outros', label: 'Outros', icon: 'folder', dica: 'Qualquer outro arquivo do cliente.' },
];

let _crmArq = { clienteId: null, rows: [], urls: {}, loading: false, erro: null, enviando: null, abertos: new Set() };
let _crmArqUploadCtx = null;

function _crmArqItens() {
  return CRM_DOCS_CHECKLIST.flatMap((g) => g.itens);
}

function _crmArqLabel(tipo) {
  const item = _crmArqItens().find((i) => i.tipo === tipo) || CRM_ARQ_PASTAS_EXTRAS.find((p) => p.tipo === tipo);
  return item ? item.label : tipo;
}

// --- CARGA ---
async function crmArquivosCarregar(clienteId) {
  _crmArq = { clienteId, rows: [], urls: {}, loading: true, erro: null, enviando: null, abertos: new Set() };
  const { data, error } = await supabaseClient
    .from('cliente_arquivos')
    .select('*')
    .eq('cliente_id', clienteId)
    .order('created_at', { ascending: true });
  if (_crmArq.clienteId !== clienteId) return;
  if (error) {
    console.error('[crm-arquivos] Falha ao carregar.', error);
    _crmArq.erro = 'Não foi possível carregar os arquivos.';
  } else {
    _crmArq.rows = data || [];
    await _crmArqAssinar(_crmArq.rows);
  }
  _crmArq.loading = false;
  crmArqRender();
}

async function _crmArqAssinar(rows) {
  const paths = rows.map((r) => r.storage_path).filter((p) => p && !_crmArq.urls[p]);
  if (!paths.length) return;
  const { data, error } = await supabaseClient.storage.from(CRM_ARQ_BUCKET).createSignedUrls(paths, 3600);
  if (error) { console.warn('[crm-arquivos] Falha ao assinar URLs.', error); return; }
  (data || []).forEach((d) => { if (d.signedUrl && d.path) _crmArq.urls[d.path] = d.signedUrl; });
}

// --- PROGRESSO (usado pela aba e, depois, pelo bloqueio de envio à engenharia) ---
function _crmArqItemFeito(item, rows, client) {
  const doTipo = rows.filter((r) => r.tipo === item.tipo);
  if (item.slots) return item.slots.every(([slot]) => doTipo.some((r) => r.slot === slot));
  if (item.campo && String(client?.padrao_localizacao || '').trim()) return true;
  return doTipo.length > 0;
}

function _crmArqProgresso(rows, client) {
  const itens = _crmArqItens();
  const faltando = itens.filter((i) => !_crmArqItemFeito(i, rows, client)).map((i) => ({ tipo: i.tipo, label: i.label }));
  return { feitos: itens.length - faltando.length, total: itens.length, faltando };
}

async function crmDocsProgresso(clienteId) {
  const client = (state.clientes || []).find((c) => c.id === clienteId) || null;
  if (_crmArq.clienteId === clienteId && !_crmArq.loading && !_crmArq.erro) return _crmArqProgresso(_crmArq.rows, client);
  const { data, error } = await supabaseClient.from('cliente_arquivos').select('tipo, slot').eq('cliente_id', clienteId);
  if (error) throw error;
  return _crmArqProgresso(data || [], client);
}

// Rótulo curto da aba ("(7/10)"); vazio enquanto carrega.
function crmArquivosTabContador(clienteId) {
  if (_crmArq.clienteId !== clienteId || _crmArq.loading || _crmArq.erro) return '';
  const client = (state.clientes || []).find((c) => c.id === clienteId) || null;
  const p = _crmArqProgresso(_crmArq.rows, client);
  return `(${p.feitos}/${p.total})`;
}

// --- RENDER ---
// Atualiza só o miolo da aba (sem re-render da ficha inteira — preserva o
// formulário "Dados do cliente" que o usuário pode estar editando).
function crmArqRender() {
  if (typeof _crm360ClientId === 'undefined' || _crm360ClientId !== _crmArq.clienteId) return;
  const cont = document.getElementById('crm360-arq-count');
  if (cont) cont.textContent = crmArquivosTabContador(_crmArq.clienteId);
  if (_crm360Tab !== 'arquivos') return;
  const slot = document.getElementById('crm360-tab-content');
  const client = typeof _crm360Client === 'function' ? _crm360Client() : null;
  if (!slot || !client) return;
  slot.innerHTML = renderCrmArquivosTab(client);
  if (window.lucide) lucide.createIcons();
}

function renderCrmArquivosTab(client) {
  if (_crmArq.clienteId !== client.id) {
    crmArquivosCarregar(client.id);
    return crm360Empty('loader-2', 'Carregando arquivos...');
  }
  if (_crmArq.loading) return crm360Empty('loader-2', 'Carregando arquivos...');
  if (_crmArq.erro) {
    return `
      <div class="py-14 text-center border border-dashed border-red-900/50 bg-neutral-950/40">
        <i data-lucide="alert-triangle" class="w-10 h-10 mx-auto mb-3 text-red-500/60"></i>
        <p class="text-neutral-500 font-bold uppercase tracking-widest text-[10px] mb-4">${escapeHTML(_crmArq.erro)}</p>
        <button onclick="crmArquivosCarregar('${client.id}')" class="btn btn-secondary btn-sm"><i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i> Tentar de novo</button>
      </div>`;
  }

  const rows = _crmArq.rows;
  const prog = _crmArqProgresso(rows, client);
  const pct = Math.round((prog.feitos / prog.total) * 100);
  const completo = prog.feitos === prog.total;

  const grupos = CRM_DOCS_CHECKLIST.map((g) => {
    const feitos = g.itens.filter((i) => _crmArqItemFeito(i, rows, client)).length;
    return `
      <div class="space-y-1.5">
        <p class="text-neutral-500 text-[10px] font-black uppercase tracking-[0.3em] flex items-center gap-2">
          <i data-lucide="${g.icon}" class="w-3.5 h-3.5"></i> ${escapeHTML(g.grupo)}
          <span class="${feitos === g.itens.length ? 'text-green-500' : 'text-neutral-600'} tracking-widest">${feitos} de ${g.itens.length}</span>
        </p>
        ${g.itens.map((item) => _crmArqItemHTML(item, rows, client, true)).join('')}
      </div>`;
  }).join('');

  const extras = CRM_ARQ_PASTAS_EXTRAS.map((p) => _crmArqItemHTML(p, rows, client, false)).join('');

  return `
    <div class="space-y-5">
      <div class="border ${completo ? 'border-green-900/50 bg-green-950/10' : 'border-neutral-800 bg-black/40'} p-3.5">
        <div class="flex items-center gap-3 flex-wrap">
          <p class="text-orange-500 text-[10px] font-black uppercase tracking-[0.3em] flex items-center gap-2"><i data-lucide="paperclip" class="w-3.5 h-3.5"></i> Documentos para engenharia</p>
          <span class="ml-auto text-[10px] font-black uppercase tracking-widest ${completo ? 'text-green-400' : 'text-neutral-400'}">${prog.feitos} de ${prog.total}</span>
        </div>
        <div class="h-1.5 bg-neutral-800 mt-2.5 overflow-hidden"><div class="h-full ${completo ? 'bg-green-500' : 'bg-orange-500'}" style="width:${pct}%"></div></div>
        <p class="text-neutral-600 text-[10px] mt-2">${completo
          ? 'Tudo anexado. A engenharia já tem o que precisa.'
          : `Faltando: ${prog.faltando.map((f) => escapeHTML(f.label)).join(' · ')}`}</p>
        <p class="text-neutral-700 text-[9px] font-mono mt-1">PDF ou foto, até 20 MB. Arraste arquivos em cima de um item para anexar.</p>
      </div>
      ${grupos}
      <div class="space-y-1.5 pt-1">
        <p class="text-neutral-500 text-[10px] font-black uppercase tracking-[0.3em] flex items-center gap-2"><i data-lucide="folder-open" class="w-3.5 h-3.5"></i> Outros arquivos</p>
        ${extras}
      </div>
    </div>`;
}

function _crmArqItemHTML(item, rows, client, obrigatorio) {
  const doTipo = rows.filter((r) => r.tipo === item.tipo);
  const feito = obrigatorio ? _crmArqItemFeito(item, rows, client) : doTipo.length > 0;
  const aberto = _crmArq.abertos.has(item.tipo);
  const enviando = _crmArq.enviando === item.tipo;

  let resumo;
  if (item.slots) {
    const n = item.slots.filter(([s]) => doTipo.some((r) => r.slot === s)).length;
    resumo = `${n} de ${item.slots.length} fotos`;
  } else if (item.campo && String(client.padrao_localizacao || '').trim()) {
    resumo = escapeHTML(String(client.padrao_localizacao).trim());
  } else if (doTipo.length === 1) {
    resumo = escapeHTML(doTipo[0].nome_original || 'arquivo');
  } else if (doTipo.length > 1) {
    resumo = `${doTipo.length} arquivos`;
  } else {
    resumo = obrigatorio ? 'pendente' : 'vazio';
  }

  const parcial = !feito && (doTipo.length > 0);
  const statusIcon = feito
    ? '<i data-lucide="check-circle-2" class="w-4 h-4 text-green-500 shrink-0"></i>'
    : parcial
      ? '<i data-lucide="circle-dashed" class="w-4 h-4 text-yellow-500 shrink-0"></i>'
      : obrigatorio
        ? '<i data-lucide="circle" class="w-4 h-4 text-neutral-600 shrink-0"></i>'
        : `<i data-lucide="${item.icon || 'folder'}" class="w-4 h-4 text-neutral-500 shrink-0"></i>`;

  // Slots têm o próprio botão por foto; os demais anexam direto (múltiplos).
  const anexarBtn = item.slots
    ? ''
    : `<button onclick="event.stopPropagation(); crmArqEscolher('${item.tipo}')" ${enviando ? 'disabled' : ''} class="btn btn-secondary btn-sm shrink-0">
         <i data-lucide="${enviando ? 'loader-2' : 'upload'}" class="w-3.5 h-3.5 ${enviando ? 'animate-spin' : ''}"></i> ${enviando ? 'Enviando' : 'Anexar'}
       </button>`;

  return `
    <div class="border ${feito && obrigatorio ? 'border-neutral-800' : parcial ? 'border-yellow-900/50' : 'border-neutral-800'} bg-black/40"
         ondragover="event.preventDefault(); this.classList.add('border-orange-500')"
         ondragleave="this.classList.remove('border-orange-500')"
         ondrop="crmArqDrop(event, '${item.tipo}')">
      <div onclick="crmArqToggle('${item.tipo}')" class="flex items-center gap-3 px-3.5 py-2.5 cursor-pointer select-none">
        ${statusIcon}
        <p class="flex-1 min-w-0 text-[11px] font-bold uppercase tracking-wide ${feito ? 'text-neutral-300' : 'text-white'}">${escapeHTML(item.label)}</p>
        <span class="hidden sm:block text-[10px] font-mono truncate max-w-[180px] ${feito ? 'text-neutral-500' : parcial ? 'text-yellow-500/80' : 'text-neutral-600'}">${resumo}</span>
        ${anexarBtn}
        <i data-lucide="${aberto ? 'chevron-up' : 'chevron-down'}" class="w-4 h-4 text-neutral-600 shrink-0"></i>
      </div>
      ${aberto ? `<div class="px-3.5 pb-3.5 pt-0.5 space-y-3">
        <p class="text-neutral-500 text-[10px]">${escapeHTML(item.dica || '')}</p>
        ${item.campo ? _crmArqCampoLocalizacaoHTML(client) : ''}
        ${item.slots ? _crmArqSlotsHTML(item, doTipo) : _crmArqGradeHTML(doTipo, item)}
      </div>` : ''}
    </div>`;
}

function _crmArqThumbHTML(row, legenda) {
  const url = _crmArq.urls[row.storage_path] || '';
  const isImg = String(row.mime || '').startsWith('image/') && !/hei[cf]/.test(String(row.mime));
  const miolo = isImg && url
    ? `<img src="${escapeHTML(url)}" alt="${escapeHTML(row.nome_original || '')}" loading="lazy" class="w-full h-full object-cover">`
    : `<i data-lucide="${String(row.mime || '').includes('pdf') ? 'file-text' : 'file'}" class="w-7 h-7 text-neutral-500"></i>`;
  const autor = row.uploaded_by_nome ? ` · ${escapeHTML(String(row.uploaded_by_nome).split(' ')[0])}` : '';
  return `
    <div class="relative group border border-neutral-800 bg-neutral-950">
      <a ${url ? `href="${escapeHTML(url)}" target="_blank" rel="noopener"` : ''} title="${escapeHTML(row.nome_original || '')}" class="block">
        <div class="h-24 flex items-center justify-center overflow-hidden bg-black/60">${miolo}</div>
        <div class="px-2 py-1.5">
          <p class="text-[10px] text-neutral-300 font-bold truncate">${escapeHTML(legenda || row.nome_original || 'arquivo')}</p>
          <p class="text-[9px] text-neutral-600 font-mono truncate">${formatDate(row.created_at)}${autor}</p>
        </div>
      </a>
      <button onclick="crmArqExcluir('${row.id}')" title="Excluir arquivo"
        class="absolute top-1 right-1 p-1 bg-black/80 border border-neutral-700 text-neutral-400 hover:text-red-400 hover:border-red-500/60 transition-colors">
        <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
      </button>
    </div>`;
}

function _crmArqGradeHTML(doTipo, item) {
  const tiles = doTipo.map((r) => _crmArqThumbHTML(r)).join('');
  const add = `
    <button onclick="crmArqEscolher('${item.tipo}')" class="h-full min-h-[132px] border border-dashed border-neutral-700 hover:border-orange-500/60 text-neutral-500 hover:text-orange-400 flex flex-col items-center justify-center gap-1.5 transition-colors">
      <i data-lucide="plus" class="w-5 h-5"></i>
      <span class="text-[9px] font-black uppercase tracking-widest">Anexar</span>
    </button>`;
  return `<div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">${tiles}${add}</div>`;
}

function _crmArqSlotsHTML(item, doTipo) {
  return `<div class="grid grid-cols-2 sm:grid-cols-4 gap-2">${item.slots.map(([slot, label]) => {
    const row = doTipo.filter((r) => r.slot === slot).pop();
    if (row) return _crmArqThumbHTML(row, label);
    const enviando = _crmArq.enviando === `${item.tipo}:${slot}`;
    return `
      <button onclick="crmArqEscolher('${item.tipo}', '${slot}')" ${enviando ? 'disabled' : ''}
        class="min-h-[132px] border border-dashed border-neutral-700 hover:border-orange-500/60 text-neutral-500 hover:text-orange-400 flex flex-col items-center justify-center gap-1.5 transition-colors">
        <i data-lucide="${enviando ? 'loader-2' : 'camera'}" class="w-5 h-5 ${enviando ? 'animate-spin' : ''}"></i>
        <span class="text-[9px] font-black uppercase tracking-widest">${escapeHTML(label)}</span>
      </button>`;
  }).join('')}</div>`;
}

function _crmArqCampoLocalizacaoHTML(client) {
  const temCoord = client.latitude != null && client.longitude != null;
  return `
    <div class="flex gap-2 flex-wrap">
      <input id="crm-arq-localizacao" value="${escapeHTML(client.padrao_localizacao || '')}" placeholder="-21.2089, -50.4328 ou endereço completo"
        class="crm360-input flex-1 min-w-[200px] font-mono" onkeydown="if(event.key==='Enter'){event.preventDefault();crmArqSalvarLocalizacao();}">
      ${temCoord ? `<button onclick="crmArqUsarCoordenadas()" title="Usar a coordenada já cadastrada no cliente" class="btn btn-secondary btn-sm"><i data-lucide="map-pin" class="w-3.5 h-3.5"></i> Usar do cadastro</button>` : ''}
      <button onclick="crmArqSalvarLocalizacao()" class="btn btn-primary btn-sm"><i data-lucide="save" class="w-3.5 h-3.5"></i> Salvar</button>
    </div>
    <p class="text-neutral-700 text-[9px] font-mono">Também pode anexar um print do mapa abaixo.</p>`;
}

// --- INTERAÇÕES ---
function crmArqToggle(tipo) {
  if (_crmArq.abertos.has(tipo)) _crmArq.abertos.delete(tipo);
  else _crmArq.abertos.add(tipo);
  crmArqRender();
}

function crmArqEscolher(tipo, slot) {
  _crmArqUploadCtx = { tipo, slot: slot || null };
  let input = document.getElementById('crm-arq-input');
  if (!input) {
    input = document.createElement('input');
    input.type = 'file';
    input.id = 'crm-arq-input';
    input.accept = CRM_ARQ_ACCEPT;
    input.className = 'hidden';
    input.addEventListener('change', () => {
      const ctx = _crmArqUploadCtx;
      _crmArqUploadCtx = null;
      if (ctx && input.files && input.files.length) crmArqEnviar(input.files, ctx.tipo, ctx.slot);
    });
    document.body.appendChild(input);
  }
  input.multiple = !slot;
  input.value = '';
  input.click();
}

function crmArqDrop(event, tipo) {
  event.preventDefault();
  if (event.currentTarget) event.currentTarget.classList.remove('border-orange-500');
  const files = event.dataTransfer && event.dataTransfer.files;
  if (!files || !files.length) return;
  const item = _crmArqItens().find((i) => i.tipo === tipo);
  if (item && item.slots) {
    showToast('Na caixa de medição, anexe cada foto no quadro dela.');
    _crmArq.abertos.add(tipo);
    crmArqRender();
    return;
  }
  crmArqEnviar(files, tipo, null);
}

function _crmArqMime(file) {
  if (file.type) return file.type;
  const ext = String(file.name || '').split('.').pop().toLowerCase();
  return CRM_ARQ_MIME_POR_EXT[ext] || '';
}

// Reduz fotos grandes (mesma regra das fotos de O&M: lado máx. 1600px, JPEG 0.82).
function _crmArqComprimir(file) {
  return new Promise((resolve) => {
    try {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const MAX = 1600;
        let w = img.naturalWidth, h = img.naturalHeight;
        if (!w || !h) return resolve(null);
        if (w > MAX || h > MAX) { const r = Math.min(MAX / w, MAX / h); w = Math.round(w * r); h = Math.round(h * r); }
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        cv.getContext('2d').drawImage(img, 0, 0, w, h);
        cv.toBlob((b) => resolve(b), 'image/jpeg', 0.82);
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    } catch (_) { resolve(null); }
  });
}

function _crmArqNomeSeguro(nome) {
  const base = String(nome || 'arquivo').replace(/\.[^.]+$/, '');
  return base.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).toLowerCase() || 'arquivo';
}

async function _crmArqUploadUm(client, file, tipo, slot) {
  const mime = _crmArqMime(file);
  if (!CRM_ARQ_ACCEPT.split(',').includes(mime)) throw new Error(`"${file.name}": formato não aceito (use PDF ou foto).`);

  let blob = file;
  let contentType = mime;
  let ext = String(file.name || '').split('.').pop().toLowerCase() || 'bin';
  if (/^image\/(jpeg|png|webp)$/.test(mime)) {
    const comp = await _crmArqComprimir(file);
    if (comp && comp.size < file.size) { blob = comp; contentType = 'image/jpeg'; ext = 'jpg'; }
  }
  if (blob.size > CRM_ARQ_MAX_BYTES) throw new Error(`"${file.name}" passa de 20 MB.`);

  const franquiaId = client.franquia_id || state.franquiaId;
  const rand = Math.random().toString(36).slice(2, 8);
  const path = `franquias/${franquiaId}/clientes/${client.id}/${tipo}/${Date.now()}-${rand}-${_crmArqNomeSeguro(file.name)}.${ext}`;

  const up = await supabaseClient.storage.from(CRM_ARQ_BUCKET).upload(path, blob, { contentType });
  if (up.error) throw up.error;

  const { data: row, error } = await supabaseClient.from('cliente_arquivos').insert([{
    cliente_id: client.id,
    franquia_id: franquiaId,
    tipo,
    slot: slot || null,
    storage_path: path,
    nome_original: file.name || null,
    mime: contentType,
    tamanho_bytes: blob.size,
    uploaded_by_nome: state.profile?.nome || state.currentUser?.email || null,
  }]).select().single();
  if (error) {
    try { await supabaseClient.storage.from(CRM_ARQ_BUCKET).remove([path]); } catch (_) {}
    throw error;
  }
  return row;
}

async function crmArqEnviar(files, tipo, slot) {
  const client = typeof _crm360Client === 'function' ? _crm360Client() : null;
  if (!client || _crmArq.clienteId !== client.id) return;
  let lista = Array.from(files || []);
  if (!lista.length) return;
  if (slot) lista = lista.slice(0, 1);

  _crmArq.enviando = slot ? `${tipo}:${slot}` : tipo;
  _crmArq.abertos.add(tipo);
  crmArqRender();

  const novos = [];
  for (const file of lista) {
    try {
      novos.push(await _crmArqUploadUm(client, file, tipo, slot));
    } catch (e) {
      console.error('[crm-arquivos] Falha no upload.', e);
      showToast(e && e.message && e.message.startsWith('"') ? e.message : `Não foi possível enviar "${file.name}".`);
    }
  }

  // Slot substituído: a foto antiga sai (linha + objeto).
  if (slot && novos.length) {
    const antigas = _crmArq.rows.filter((r) => r.tipo === tipo && r.slot === slot);
    for (const old of antigas) await _crmArqRemover(old, true);
  }

  if (_crmArq.clienteId !== client.id) return;
  _crmArq.rows.push(...novos);
  await _crmArqAssinar(novos);
  _crmArq.enviando = null;
  crmArqRender();

  if (novos.length) {
    const label = _crmArqLabel(tipo) + (slot ? ` (${slot})` : '');
    showToast(novos.length === 1 ? 'Arquivo anexado.' : `${novos.length} arquivos anexados.`);
    _crmArqTimeline(client, `Arquivo anexado: ${label} · ${novos.map((r) => r.nome_original || 'arquivo').join(', ')}`,
      { acao: 'anexado', tipo, slot: slot || null, arquivos: novos.map((r) => r.id) });
  }
}

// Apaga linha + objeto. Retorna true se a linha saiu (RLS pode negar sem erro).
async function _crmArqRemover(row, silencioso) {
  const { data, error } = await supabaseClient.from('cliente_arquivos').delete().eq('id', row.id).select('id');
  if (error || !data || !data.length) {
    if (!silencioso) {
      console.error('[crm-arquivos] Falha ao excluir.', error);
      showToast('Você não tem permissão para excluir este arquivo.');
    }
    return false;
  }
  try { await supabaseClient.storage.from(CRM_ARQ_BUCKET).remove([row.storage_path]); } catch (_) {}
  _crmArq.rows = _crmArq.rows.filter((r) => r.id !== row.id);
  delete _crmArq.urls[row.storage_path];
  return true;
}

function crmArqExcluir(id) {
  const row = _crmArq.rows.find((r) => r.id === id);
  if (!row) return;
  showConfirmModal(`Excluir "${row.nome_original || 'arquivo'}" de ${_crmArqLabel(row.tipo)}?`, async () => {
    const client = typeof _crm360Client === 'function' ? _crm360Client() : null;
    if (!(await _crmArqRemover(row, false))) return;
    crmArqRender();
    showToast('Arquivo excluído.');
    if (client) {
      _crmArqTimeline(client, `Arquivo excluído: ${_crmArqLabel(row.tipo)}${row.slot ? ` (${row.slot})` : ''} · ${row.nome_original || 'arquivo'}`,
        { acao: 'excluido', tipo: row.tipo, slot: row.slot || null });
    }
  }, 'EXCLUIR');
}

function crmArqUsarCoordenadas() {
  const client = typeof _crm360Client === 'function' ? _crm360Client() : null;
  const input = document.getElementById('crm-arq-localizacao');
  if (!client || !input || client.latitude == null || client.longitude == null) return;
  input.value = `${Number(client.latitude).toFixed(6)}, ${Number(client.longitude).toFixed(6)}`;
  input.focus();
}

async function crmArqSalvarLocalizacao() {
  const client = typeof _crm360Client === 'function' ? _crm360Client() : null;
  const input = document.getElementById('crm-arq-localizacao');
  if (!client || !input) return;
  const valor = input.value.trim() || null;
  if ((client.padrao_localizacao || null) === valor) { showToast('Nada mudou.'); return; }
  const { error } = await supabaseClient.from('clientes').update({ padrao_localizacao: valor }).eq('id', client.id);
  if (error) {
    console.error('[crm-arquivos] Falha ao salvar localização.', error);
    showToast('Erro ao salvar a localização.');
    return;
  }
  client.padrao_localizacao = valor;
  crmArqRender();
  showToast('Localização salva.');
  _crmArqTimeline(client, valor ? `Localização do padrão: ${valor}` : 'Localização do padrão removida', { acao: 'localizacao' });
}

// Tudo que acontece na ficha aparece na timeline (crm_atividades, tipo 'documento').
async function _crmArqTimeline(client, descricao, meta) {
  const { error } = await supabaseClient.from('crm_atividades').insert([{
    cliente_id: client.id,
    franquia_id: client.franquia_id || state.franquiaId,
    autor_email: state.currentUser?.email || 'sistema',
    tipo: 'documento',
    descricao,
    meta: { origem: 'arquivos', ...meta },
  }]);
  if (error) { console.warn('[crm-arquivos] Falha ao registrar na timeline.', error); return; }
  // Só recarrega a timeline em memória; a aba Arquivos não precisa re-render.
  const { data } = await supabaseClient.from('crm_atividades').select('*').eq('cliente_id', client.id)
    .order('created_at', { ascending: false }).limit(120);
  if (data && _crm360ClientId === client.id) _crm360Atividades = data;
}
