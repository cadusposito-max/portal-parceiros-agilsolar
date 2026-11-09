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
    { tipo: 'conta_energia', label: 'Conta de energia', dica: 'Marque qual conta é a geradora e quais são de compensação.' },
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

// Cliente pessoa jurídica: entram no grupo Cadastro (mesma regra em eng_docs_faltando).
const CRM_DOCS_PJ = [
  { tipo: 'contrato_social', label: 'Contrato social / estatuto', dica: 'Contrato social ou última alteração consolidada. Igreja, associação e condomínio: estatuto + ata de eleição da diretoria. MEI: CCMEI.' },
  { tipo: 'cartao_cnpj', label: 'Cartão CNPJ', dica: 'Comprovante de inscrição emitido no site da Receita Federal.' },
];

// Fora da conta dos obrigatórios.
const CRM_ARQ_PASTAS_EXTRAS = [
  { tipo: 'engenharia', label: 'Engenharia', icon: 'settings', dica: 'ART, parecer de acesso e outros documentos técnicos.' },
  { tipo: 'inspecao', label: 'Inspeção', icon: 'scan-search', dica: 'Fotos e registros depois da instalação.' },
  // preenchida sozinha quando o Financeiro registra a compra do kit com o pedido anexado (ui-v2-fin.js)
  { tipo: 'pedido_compra', label: 'Pedido do kit', icon: 'package', dica: 'Pedido ou nota da distribuidora. Entra sozinho quando o Financeiro registra a compra.' },
  { tipo: 'outros', label: 'Outros', icon: 'folder', dica: 'Qualquer outro arquivo do cliente.' },
];

let _crmArq = { clienteId: null, rows: [], urls: {}, loading: false, erro: null, enviando: null, abertos: new Set() };
let _crmArqUploadCtx = null;
let _crmArqRep = {}; // tipo -> { trocado, rotulos } da reprovação da engenharia em aberto
const CRM_CONTA_FUNCOES = { geradora: 'Geradora', compensacao: 'Compensação' };
let _crmArqClassificando = null;

// A mesma aba também aparece fora da ficha (card da obra, obras.js). O painel se
// registra aqui: { client, el: () => HTMLElement, onRender?, irEngenharia? }.
// Só vale enquanto o elemento dele está na tela; senão volta a ser a ficha.
let _crmArqHost = null;
function crmArqHostSet(host) { _crmArqHost = host || null; }
function _crmArqHostAtivo() {
  const h = _crmArqHost;
  if (!h || !h.client || h.client.id !== _crmArq.clienteId) return null;
  const el = h.el && h.el();
  return el && el.isConnected ? h : null;
}
function _crmArqCliente() {
  const h = _crmArqHostAtivo();
  if (h) return h.client;
  return typeof _crm360Client === 'function' ? _crm360Client() : null;
}
// "(7/12)" para o rótulo da aba de quem hospeda; vazio enquanto carrega.
function crmArqContagem(client) {
  if (!client || _crmArq.clienteId !== client.id || _crmArq.loading || _crmArq.erro) return '';
  const p = _crmArqProgresso(_crmArq.rows, client);
  return `(${p.feitos}/${p.total})`;
}

function _crmArqContasResumo(rows) {
  const contas = rows.filter((r) => r.tipo === 'conta_energia');
  const geradoras = contas.filter((r) => r.slot === 'geradora').length;
  const compensacoes = contas.filter((r) => r.slot === 'compensacao').length;
  const pendentes = contas.length - geradoras - compensacoes;
  return { geradoras, compensacoes, pendentes, completo: geradoras === 1 && pendentes === 0 };
}

// Mesma regra do ícone empresa/pessoa (ui-v2-screens.js): tipo salvo no contrato,
// senão CPF/CNPJ pelos dígitos, senão nome típico de empresa.
function _crmArqEhPJ(client) {
  if (!client) return false;
  if (typeof window.uiV2TipoCliente === 'function') return window.uiV2TipoCliente(client) === 'PJ';
  const salvo = client.documentos_dados && client.documentos_dados.tipo_pessoa;
  if (salvo === 'PJ' || salvo === 'PF') return salvo === 'PJ';
  return String(client.documento || '').replace(/\D/g, '').length === 14;
}

// Checklist do cliente: PJ ganha contrato social e cartão CNPJ no Cadastro, e o
// RG/CNH passa a ser do representante legal. Se já houver arquivo de PJ anexado,
// os itens aparecem mesmo que o cliente não seja reconhecido como empresa.
function _crmArqChecklist(client, rows) {
  const pj = _crmArqEhPJ(client) || (rows || []).some((r) => CRM_DOCS_PJ.some((i) => i.tipo === r.tipo));
  if (!pj) return CRM_DOCS_CHECKLIST;
  return CRM_DOCS_CHECKLIST.map((g) => g.grupo !== 'Cadastro' ? g : {
    ...g,
    itens: g.itens.map((i) => i.tipo === 'rg_cnh' ? { ...i, label: 'RG / CNH do representante legal', dica: 'De quem assina pela empresa (sócio administrador, presidente ou síndico).' } : i).concat(CRM_DOCS_PJ),
  });
}

function _crmArqItens(client, rows) {
  return _crmArqChecklist(client, rows).flatMap((g) => g.itens);
}

function _crmArqLabel(tipo) {
  const item = _crmArqItens().find((i) => i.tipo === tipo) || CRM_DOCS_PJ.find((i) => i.tipo === tipo) || CRM_ARQ_PASTAS_EXTRAS.find((p) => p.tipo === tipo);
  return item ? item.label : tipo;
}

// --- CARGA ---
async function crmArquivosCarregar(clienteId) {
  _crmArq = { clienteId, rows: [], urls: {}, loading: true, erro: null, enviando: null, abertos: new Set(), pasta: null, editando: null };
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
  if (item.tipo === 'conta_energia') return _crmArqContasResumo(doTipo).completo;
  if (item.slots) return item.slots.every(([slot]) => doTipo.some((r) => r.slot === slot));
  if (item.campo && String(client?.padrao_localizacao || '').trim()) return true;
  return doTipo.length > 0;
}

function _crmArqProgresso(rows, client) {
  const itens = _crmArqItens(client, rows);
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
  const host = _crmArqHostAtivo();
  if (host) {
    host.el().innerHTML = renderCrmArquivosTab(host.client);
    if (window.lucide) lucide.createIcons();
    if (typeof host.onRender === 'function') host.onRender();
    return;
  }
  if (typeof _crm360ClientId === 'undefined' || _crm360ClientId !== _crmArq.clienteId) return;
  const cont = document.getElementById('crm360-arq-count');
  if (cont) cont.textContent = crmArquivosTabContador(_crmArq.clienteId);
  if (_crm360Tab !== 'arquivos') return;
  const slot = document.getElementById('crm360-tab-content');
  const client = _crmArqCliente();
  if (!slot || !client) return;
  slot.innerHTML = renderCrmArquivosTab(client);
  if (window.lucide) lucide.createIcons();
}

function renderCrmArquivosTab(client) {
  if (_crmArq.clienteId !== client.id) {
    crmArquivosCarregar(client.id);
    return `<div class="arq-vazio"><i data-lucide="loader-2" class="arq-spin"></i>Carregando arquivos...</div>`;
  }
  if (_crmArq.loading) return `<div class="arq-vazio"><i data-lucide="loader-2" class="arq-spin"></i>Carregando arquivos...</div>`;
  if (_crmArq.erro) {
    return `<div class="arq-vazio erro"><i data-lucide="triangle-alert"></i>${escapeHTML(_crmArq.erro)}
      <button type="button" class="arq-btn" onclick="crmArquivosCarregar('${client.id}')"><i data-lucide="refresh-cw"></i>Tentar de novo</button></div>`;
  }

  const rows = _crmArq.rows;
  const prog = _crmArqProgresso(rows, client);
  // reprovação da engenharia em aberto: cada arquivo reprovado fica "trocado" quando chega um novo do mesmo tipo
  const rep = typeof engReprovaCliente === 'function' ? engReprovaCliente(client.id) : null;
  _crmArqRep = {};
  if (rep) rep.docs.forEach((d) => {
    if (!d.tipo) return;
    const novo = rows.find((r) => r.tipo === d.tipo && (!d.slot || r.slot === d.slot) && r.id !== d.id && new Date(r.created_at) > new Date(rep.em));
    d.trocado = !!novo;
    const atual = _crmArqRep[d.tipo];
    _crmArqRep[d.tipo] = { trocado: atual ? atual.trocado && d.trocado : d.trocado, rotulos: ((atual && atual.rotulos) || []).concat(d.rotulo) };
  });
  const pct = Math.round((prog.feitos / prog.total) * 100);
  const completo = prog.feitos === prog.total;

  const grupos = _crmArqChecklist(client, rows).map((g) => {
    const feitos = g.itens.filter((i) => _crmArqItemFeito(i, rows, client)).length;
    return `
      <div class="arq-gh"><i data-lucide="${g.icon}"></i>${escapeHTML(g.grupo)}<span class="arq-pill ${feitos === g.itens.length ? 'ok' : ''}">${feitos} de ${g.itens.length}</span></div>
      ${g.itens.map((item) => _crmArqItemHTML(item, rows, client, true)).join('')}`;
  }).join('');

  // pastas fora da conta: grade de pastas; a aberta aparece embaixo
  if (_crmArq.pasta && !CRM_ARQ_PASTAS_EXTRAS.some((p) => p.tipo === _crmArq.pasta)) _crmArq.pasta = null;
  const pastas = CRM_ARQ_PASTAS_EXTRAS.map((p) => {
    const n = rows.filter((r) => r.tipo === p.tipo).length;
    return `<button type="button" class="arq-pasta ${_crmArq.pasta === p.tipo ? 'on' : ''}" onclick="crmArqPasta('${p.tipo}')" title="${escapeHTML(p.dica)}"
        ondragover="event.preventDefault(); this.classList.add('dr')" ondragleave="this.classList.remove('dr')" ondrop="crmArqDrop(event, '${p.tipo}')">
      <i data-lucide="${p.icon}"></i><span><b>${escapeHTML(p.label)}</b><small>${n ? n + (n > 1 ? ' arquivos' : ' arquivo') : 'vazio'}</small></span></button>`;
  }).join('');
  const pastaAberta = CRM_ARQ_PASTAS_EXTRAS.find((p) => p.tipo === _crmArq.pasta);

  const faltaTrocar = rep ? rep.docs.filter((d) => !d.trocado) : [];
  const banner = !rep ? '' : `
      <div class="crm-arq-rep ${faltaTrocar.length ? '' : 'ok'}">
        <div class="h"><i data-lucide="${faltaTrocar.length ? 'undo-2' : 'circle-check'}"></i>
          <div><b>${faltaTrocar.length ? 'A engenharia devolveu arquivos deste cliente' : 'Arquivos trocados: falta reenviar à engenharia'}</b>
          <span>${escapeHTML(new Date(rep.em).toLocaleDateString('pt-BR'))}${rep.autor ? ' · ' + escapeHTML(rep.autor) : ''}${rep.docs.length ? '' : ' · ' + escapeHTML(rep.motivo || '')}</span></div></div>
        ${rep.docs.length ? `<div class="l">${rep.docs.map((d) => `<span class="${d.trocado ? 'ok' : ''}"><i data-lucide="${d.trocado ? 'check' : 'x'}"></i>${escapeHTML(d.rotulo)}<em>${d.trocado ? 'trocado' : 'trocar'}</em></span>`).join('')}</div>` : ''}
        <button class="crm-arq-rep-go" onclick="${(_crmArqHostAtivo() && _crmArqHost.irEngenharia) || "crmSet360Tab('engenharia')"}"><i data-lucide="send"></i>${faltaTrocar.length ? 'Ver na aba Engenharia' : 'Reenviar à engenharia'}</button>
      </div>`;
  return `
    <div class="arq">
      ${banner}
      <div class="arq-topo ${completo ? 'ok' : ''}">
        <div class="arq-th3"><i data-lucide="folder-check"></i><b>Documentos para a engenharia</b><span class="arq-pill ${completo ? 'ok' : ''}">${prog.feitos} de ${prog.total}</span></div>
        <div class="arq-bar"><div style="width:${pct}%"></div></div>
        <div class="arq-falta">${completo
          ? '<i data-lucide="circle-check"></i>Tudo anexado. A engenharia já tem o que precisa.'
          : `<span>Faltam:</span>${prog.faltando.map((f) => `<button type="button" class="arq-chip" onclick="crmArqIrPara('${f.tipo}')">${escapeHTML(f.label)}</button>`).join('')}`}</div>
        <div class="arq-dica0"><i data-lucide="info"></i>PDF ou foto, até 20 MB. Arraste o arquivo em cima do item para anexar.</div>
      </div>
      ${grupos}
      <div class="arq-gh"><i data-lucide="folder-open"></i>Outros arquivos</div>
      <div class="arq-pastas">${pastas}</div>
      ${pastaAberta ? _crmArqItemHTML(pastaAberta, rows, client, false) : ''}
    </div>`;
}

function _crmArqItemHTML(item, rows, client, obrigatorio) {
  const doTipo = rows.filter((r) => r.tipo === item.tipo);
  const feito = obrigatorio ? _crmArqItemFeito(item, rows, client) : doTipo.length > 0;
  const aberto = obrigatorio ? _crmArq.abertos.has(item.tipo) : true;
  const enviando = _crmArq.enviando === item.tipo;
  const nomes = doTipo.map((r) => r.identificacao).filter(Boolean);

  let resumo;
  if (item.tipo === 'conta_energia' && doTipo.length) {
    const c = _crmArqContasResumo(doTipo);
    resumo = c.pendentes ? `${c.pendentes} a identificar` : c.geradoras !== 1 ? 'Marque a geradora' : `1 geradora · ${c.compensacoes} ${c.compensacoes === 1 ? 'compensação' : 'compensações'}`;
    if (nomes.length) resumo += ' · ' + nomes.join(', ');
  } else if (item.slots) {
    const n = item.slots.filter(([s]) => doTipo.some((r) => r.slot === s)).length;
    resumo = `${n} de ${item.slots.length} fotos`;
  } else if (item.campo && String(client.padrao_localizacao || '').trim()) {
    resumo = String(client.padrao_localizacao).trim();
  } else if (doTipo.length === 1) {
    resumo = doTipo[0].identificacao || doTipo[0].nome_original || 'arquivo';
  } else if (doTipo.length > 1) {
    resumo = `${doTipo.length} arquivos` + (nomes.length ? ' · ' + nomes.join(', ') : '');
  } else {
    resumo = obrigatorio ? 'Pendente' : 'Vazio';
  }

  const parcial = !feito && doTipo.length > 0;
  const rep = (_crmArqRep || {})[item.tipo];
  if (rep) resumo = rep.trocado ? 'Trocado · aguardando reenvio' : 'Reprovado pela engenharia';
  const st = rep && !rep.trocado ? ['rep', 'x'] : feito ? ['ok', 'check'] : parcial ? ['pa', 'circle-dashed'] : obrigatorio ? ['', 'circle'] : ['', item.icon || 'folder'];

  // Slots têm o próprio quadro por foto; os demais anexam direto (múltiplos).
  const anexarBtn = item.slots ? '' : `<button type="button" class="arq-btn" onclick="event.stopPropagation(); crmArqEscolher('${item.tipo}')" ${enviando ? 'disabled' : ''}>
      <i data-lucide="${enviando ? 'loader-2' : 'upload'}" class="${enviando ? 'arq-spin' : ''}"></i><span>${enviando ? 'Enviando' : 'Anexar'}</span></button>`;
  const semDono = !item.slots && doTipo.length > 1 && doTipo.some((r) => !r.identificacao);
  const toggle = obrigatorio ? `crmArqToggle('${item.tipo}')` : `crmArqPasta('${item.tipo}')`;

  return `
    <div class="arq-item ${aberto ? 'ab' : ''} ${rep ? (rep.trocado ? 'crm-arq-trocado' : 'crm-arq-reprovado') : ''}" id="arq-it-${item.tipo}"
         ondragover="event.preventDefault(); this.classList.add('dr')" ondragleave="this.classList.remove('dr')" ondrop="crmArqDrop(event, '${item.tipo}')">
      <div class="arq-ih" onclick="${toggle}">
        <span class="arq-st ${st[0]}"><i data-lucide="${st[1]}"></i></span>
        <div class="arq-tx"><b>${escapeHTML(item.label)}</b><small class="${rep ? (rep.trocado ? 'crm-arq-t-ok' : 'crm-arq-t-rep') : ''}">${escapeHTML(resumo)}</small></div>
        ${anexarBtn}
        <i data-lucide="${obrigatorio ? 'chevron-down' : 'x'}" class="arq-cv"></i>
      </div>
      ${aberto ? `<div class="arq-bd">
        <p class="arq-dica">${escapeHTML(item.dica || '')}</p>
        ${semDono ? `<div class="arq-aviso"><i data-lucide="triangle-alert"></i>${doTipo.length} arquivos: diga de quem é cada um (lápis embaixo da miniatura)</div>` : ''}
        ${item.campo ? _crmArqCampoLocalizacaoHTML(client) : ''}
        ${item.slots ? _crmArqSlotsHTML(item, doTipo) : _crmArqGradeHTML(doTipo, item)}
      </div>` : ''}
    </div>`;
}

const _crmArqEhImg = (row) => String(row.mime || '').startsWith('image/') && !/hei[cf]/.test(String(row.mime));
const _crmArqExt = (row) => String(row.nome_original || row.storage_path || '').split('.').pop().toLowerCase().slice(0, 4) || 'arq';

// Miniatura: prévia, "De quem é?" (opcional), nome original · data · autor, e ações ao passar o mouse.
function _crmArqThumbHTML(row, legenda, extraHTML) {
  const url = _crmArq.urls[row.storage_path] || '';
  const img = _crmArqEhImg(row);
  const pdf = String(row.mime || '').includes('pdf');
  const prev = img && url
    ? `<img src="${escapeHTML(url)}" alt="${escapeHTML(row.nome_original || '')}" loading="lazy">`
    : `<i data-lucide="${pdf ? 'file-text' : 'file'}"></i><span>${escapeHTML(_crmArqExt(row).toUpperCase())}</span>`;
  const href = url ? `href="${escapeHTML(url)}" target="_blank" rel="noopener"` : '';
  const autor = row.uploaded_by_nome ? ` · ${escapeHTML(String(row.uploaded_by_nome).split(' ')[0])}` : '';
  const editando = _crmArq.editando === row.id;
  const quem = editando
    ? `<input id="arq-in-${row.id}" class="arq-in" maxlength="40" placeholder="Ex.: João (titular da conta)" value="${escapeHTML(row.identificacao || '')}"
        onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}else if(event.key==='Escape'){this.dataset.cancela='1';this.blur();}"
        onblur="crmArqIdentSalvar('${row.id}', this)">`
    : `<button type="button" class="arq-quem ${row.identificacao ? '' : 'vz'}" onclick="crmArqIdentEditar('${row.id}')" title="${row.identificacao ? 'Trocar a identificação' : 'Opcional: entra no nome do arquivo da engenharia'}">
        <i data-lucide="${row.identificacao ? 'user-round' : 'pencil'}"></i><span>${escapeHTML(row.identificacao || 'De quem é?')}</span></button>`;
  return `
    <div class="arq-th">
      <a class="arq-pv ${pdf ? 'pdf' : ''} ${img && url ? 'img' : ''}" ${href} title="${escapeHTML(row.nome_original || '')}">${prev}</a>
      ${legenda ? `<span class="arq-slot">${escapeHTML(legenda)}</span>` : ''}
      <div class="arq-ac">
        ${url ? `<a ${href} title="Abrir" aria-label="Abrir"><i data-lucide="external-link"></i></a>` : ''}
        <button type="button" onclick="crmArqBaixar('${row.id}')" title="Baixar" aria-label="Baixar"><i data-lucide="download"></i></button>
        <button type="button" class="x" onclick="crmArqExcluir('${row.id}')" title="Excluir" aria-label="Excluir"><i data-lucide="trash-2"></i></button>
      </div>
      <div class="arq-ft">
        ${quem}
        <div class="arq-mt" title="${escapeHTML(row.nome_original || '')}">${escapeHTML(row.nome_original || 'arquivo')} · ${formatDate(row.created_at)}${autor}</div>
        ${extraHTML || ''}
      </div>
    </div>`;
}

function _crmArqAddHTML(tipo, slot, icone, rotulo, sub) {
  const chave = slot ? `${tipo}:${slot}` : tipo;
  const enviando = _crmArq.enviando === chave;
  return `<button type="button" class="arq-add" onclick="crmArqEscolher('${tipo}'${slot ? `, '${slot}'` : ''})" ${enviando ? 'disabled' : ''}>
    <i data-lucide="${enviando ? 'loader-2' : icone}" class="${enviando ? 'arq-spin' : ''}"></i>${enviando ? 'Enviando...' : escapeHTML(rotulo)}<small>${escapeHTML(sub)}</small></button>`;
}

function _crmArqGradeHTML(doTipo, item) {
  if (item.tipo === 'conta_energia') return _crmArqContasHTML(doTipo);
  return `<div class="arq-grid">${doTipo.map((r) => _crmArqThumbHTML(r)).join('')}${_crmArqAddHTML(item.tipo, null, 'plus', 'Anexar', 'ou arraste aqui')}</div>`;
}

function _crmArqContasHTML(rows) {
  const busy = _crmArqClassificando?.clienteId === _crmArq.clienteId;
  const c = _crmArqContasResumo(rows);
  const seg = (r) => `<div class="arq-sg" role="group" aria-label="Esta conta é">${Object.entries(CRM_CONTA_FUNCOES).map(([key, label]) =>
    `<button type="button" onclick="crmArqClassificarConta('${r.id}', '${key}')" aria-pressed="${r.slot === key}" ${busy ? 'disabled' : ''}>${label}</button>`).join('')}</div>`;
  return `<div class="arq-grid">${rows.map((r) => _crmArqThumbHTML(r, r.slot ? null : 'Falta identificar', seg(r))).join('')}
      ${_crmArqAddHTML('conta_energia', null, 'plus', rows.length ? 'Anexar outra conta' : 'Anexar conta', 'ou arraste aqui')}</div>
    ${rows.length ? `<p class="arq-nota" aria-live="polite">${busy ? 'Salvando...' : `${c.geradoras} geradora${c.geradoras === 1 ? '' : 's'} · ${c.compensacoes} ${c.compensacoes === 1 ? 'compensação' : 'compensações'}${c.pendentes ? ` · ${c.pendentes} a identificar` : ''}`}</p>` : ''}`;
}

function _crmArqSlotsHTML(item, doTipo) {
  return `<div class="arq-grid">${item.slots.map(([slot, label]) => {
    const row = doTipo.filter((r) => r.slot === slot).pop();
    return row ? _crmArqThumbHTML(row, label) : _crmArqAddHTML(item.tipo, slot, 'camera', label, 'falta');
  }).join('')}</div>`;
}

function _crmArqCampoLocalizacaoHTML(client) {
  const temCoord = client.latitude != null && client.longitude != null;
  return `
    <div class="arq-loc">
      <input id="crm-arq-localizacao" class="arq-input" value="${escapeHTML(client.padrao_localizacao || '')}" placeholder="-21.2089, -50.4328 ou endereço completo"
        onkeydown="if(event.key==='Enter'){event.preventDefault();crmArqSalvarLocalizacao();}">
      ${temCoord ? `<button type="button" class="arq-btn" onclick="crmArqUsarCoordenadas()" title="Usar a coordenada já cadastrada no cliente"><i data-lucide="map-pin"></i><span>Usar do cadastro</span></button>` : ''}
      <button type="button" class="arq-btn pri" onclick="crmArqSalvarLocalizacao()"><i data-lucide="save"></i><span>Salvar</span></button>
    </div>
    <p class="arq-nota">Também pode anexar um print do mapa abaixo.</p>`;
}

// --- INTERAÇÕES ---
function crmArqToggle(tipo) {
  if (_crmArq.abertos.has(tipo)) _crmArq.abertos.delete(tipo);
  else _crmArq.abertos.add(tipo);
  crmArqRender();
}

function crmArqPasta(tipo) {
  _crmArq.pasta = _crmArq.pasta === tipo ? null : tipo;
  crmArqRender();
}

// onde a aba está desenhada agora (card da obra ou ficha); a ficha pode ficar escondida no DOM
function _crmArqRaiz() {
  const h = _crmArqHostAtivo();
  return (h && h.el()) || document.getElementById('crm360-tab-content') || document;
}

// etiqueta "Faltam:" → abre o item e rola até ele
function crmArqIrPara(tipo) {
  _crmArq.abertos.add(tipo);
  crmArqRender();
  const el = _crmArqRaiz().querySelector('#arq-it-' + tipo);
  if (el) el.scrollIntoView({ block: 'start' });
}

// "De quem é?": texto curto e opcional, vai no fim do nome do arquivo da engenharia
function crmArqIdentEditar(id) {
  _crmArq.editando = id;
  crmArqRender();
  const inp = _crmArqRaiz().querySelector('#arq-in-' + id);
  if (inp) { inp.focus(); inp.select(); }
}

async function crmArqIdentSalvar(id, input) {
  if (_crmArq.editando !== id) return;
  const row = _crmArq.rows.find((r) => r.id === id);
  const cancela = input && input.dataset.cancela === '1';
  const valor = String((input && input.value) || '').replace(/\s+/g, ' ').trim().slice(0, 40) || null;
  _crmArq.editando = null;
  if (!row || cancela || valor === (row.identificacao || null)) { crmArqRender(); return; }
  const anterior = row.identificacao || null;
  row.identificacao = valor; // aparece na hora; volta se o banco recusar
  crmArqRender();
  const client = _crmArqCliente();
  try {
    const { error } = await supabaseClient.rpc('crm_arquivo_identificar', { p_arquivo: id, p_texto: valor });
    if (error) throw error;
    if (window.EV?.contasAtualizadas && client) window.EV.contasAtualizadas(client.id);
    if (client) {
      _crmArqTimeline(client, `Arquivo identificado: ${_crmArqLabel(row.tipo)} (${row.nome_original || 'arquivo'}) · ${anterior || 'sem identificação'} → ${valor || 'sem identificação'}`,
        { acao: 'identificacao', tipo: row.tipo, arquivo_id: id, de: anterior, para: valor })
        .catch((e) => console.warn('[crm-arquivos] timeline identificação', e));
    }
  } catch (e) {
    console.error('[crm-arquivos] Falha ao salvar identificação.', e);
    row.identificacao = anterior;
    crmArqRender();
    showToast(/42883|PGRST202|crm_arquivo_identificar/.test(String(e?.code || e?.message)) ? 'Falta a atualização do banco (migration 20261109120000).' : 'Não foi possível salvar. Tente novamente.');
  }
}

async function crmArqBaixar(id) {
  const row = _crmArq.rows.find((r) => r.id === id);
  const url = row && _crmArq.urls[row.storage_path];
  if (!url) { showToast('O link do arquivo ainda está carregando.'); return; }
  try {
    const blob = await (await fetch(url)).blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = row.nome_original || ('arquivo.' + _crmArqExt(row));
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  } catch (e) {
    console.error('[crm-arquivos] Falha ao baixar.', e);
    window.open(url, '_blank', 'noopener');
  }
}

async function crmArqClassificarConta(id, funcao) {
  const client = _crmArqCliente();
  const row = _crmArq.rows.find((r) => r.id === id && r.tipo === 'conta_energia');
  if (!client || _crmArq.clienteId !== client.id || !row || !CRM_CONTA_FUNCOES[funcao] || row.slot === funcao || _crmArqClassificando) return;
  const context = _crmArq;
  const anterior = row.slot || null;
  _crmArqClassificando = { clienteId: client.id, id };
  crmArqRender();
  try {
    const { data, error } = await supabaseClient.rpc('crm_classificar_conta_energia', { p_arquivo: id, p_funcao: funcao });
    if (error) throw error;
    if (!Array.isArray(data) || !data.some((r) => r.arquivo_id === id && r.funcao === funcao)) throw new Error('A identificação não foi salva.');
    if (_crmArq === context) {
      const salvos = new Map(data.map((r) => [r.arquivo_id, r.funcao]));
      _crmArq.rows.forEach((r) => { if (salvos.has(r.id)) r.slot = salvos.get(r.id); });
    }
    if (window.EV?.contasAtualizadas) window.EV.contasAtualizadas(client.id);
    showToast(`Conta identificada como ${CRM_CONTA_FUNCOES[funcao].toLowerCase()}.`);
    _crmArqTimeline(client, `Conta de energia identificada como ${CRM_CONTA_FUNCOES[funcao].toLowerCase()}: ${row.nome_original || 'arquivo'}`,
      { acao: 'identificado', tipo: 'conta_energia', arquivo_id: id, funcao, anterior, contas: data })
      .catch((e) => console.warn('[crm-arquivos] Falha ao registrar identificação na timeline.', e));
  } catch (e) {
    console.error('[crm-arquivos] Falha ao identificar conta.', e);
    showToast('Não foi possível salvar a identificação. Tente novamente.');
  } finally {
    _crmArqClassificando = null;
    crmArqRender();
  }
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
  if (event.currentTarget) event.currentTarget.classList.remove('dr');
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
  const client = _crmArqCliente();
  if (!client || _crmArq.clienteId !== client.id) return;
  let lista = Array.from(files || []);
  if (!lista.length) return;
  if (slot) lista = lista.slice(0, 1);

  _crmArq.enviando = slot ? `${tipo}:${slot}` : tipo;
  _crmArq.abertos.add(tipo);
  if (CRM_ARQ_PASTAS_EXTRAS.some((p) => p.tipo === tipo)) _crmArq.pasta = tipo;
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
    const client = _crmArqCliente();
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
  const client = _crmArqCliente();
  const input = document.getElementById('crm-arq-localizacao');
  if (!client || !input || client.latitude == null || client.longitude == null) return;
  input.value = `${Number(client.latitude).toFixed(6)}, ${Number(client.longitude).toFixed(6)}`;
  input.focus();
}

async function crmArqSalvarLocalizacao() {
  const client = _crmArqCliente();
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
