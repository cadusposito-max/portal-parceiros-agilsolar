// ==========================================
// CRM: painel 360° do cliente, timeline, status e kanban
// ==========================================
// Depende de: clientes.js (CLIENT_STATUS_SEQUENCE, normalizeClientStatus,
// digitsOnly, CLIENT_STATUS_STYLE), cidades.js (autocomplete + HSP),
// utils.js (escapeHTML, formatDate, formatCurrency, showToast, debounce).

const CRM_STATUS_ALL = [...CLIENT_STATUS_SEQUENCE, 'PERDIDO'];
const CRM_MOTIVOS_PERDA = ['PREÇO', 'FECHOU COM CONCORRENTE', 'SEM RETORNO', 'DESISTIU DO PROJETO', 'CRÉDITO NEGADO', 'OUTRO'];

const CRM_ATIVIDADE_META = {
  nota:         { icon: 'sticky-note',    label: 'Nota',          color: 'text-neutral-300' },
  ligacao:      { icon: 'phone',          label: 'Ligação',       color: 'text-blue-400' },
  whatsapp:     { icon: 'message-circle', label: 'WhatsApp',      color: 'text-green-400' },
  email:        { icon: 'mail',           label: 'E-mail',        color: 'text-cyan-400' },
  visita:       { icon: 'map-pin',        label: 'Visita',        color: 'text-purple-400' },
  status:       { icon: 'git-commit-horizontal', label: 'Status', color: 'text-orange-400' },
  proposta:     { icon: 'file-text',      label: 'Proposta',      color: 'text-yellow-400' },
  venda:        { icon: 'trophy',         label: 'Venda',         color: 'text-green-400' },
  proxima_acao: { icon: 'alarm-clock',    label: 'Próxima ação',  color: 'text-yellow-300' },
  merge:        { icon: 'merge',          label: 'Mesclagem',     color: 'text-purple-400' },
};

// Agregados calculados a cada render da lista (propostas/vendas por cliente)
let _crmAgg = { propostasByCliente: {}, vendasByCliente: {} };

function buildCrmAggregates() {
  const propostasByCliente = {};
  const vendasByCliente = {};

  // Fallback para o legado sem cliente_id: casa por telefone normalizado
  const phoneToClienteId = {};
  (state.clientes || []).forEach((c) => {
    const d = digitsOnly(c.telefone);
    if (d && !phoneToClienteId[d]) phoneToClienteId[d] = c.id;
  });

  const bump = (map, row) => {
    let cid = row.cliente_id;
    if (!cid) {
      const d = digitsOnly(row.cliente_telefone);
      cid = d ? phoneToClienteId[d] : null;
    }
    if (cid) map[cid] = (map[cid] || 0) + 1;
  };

  (state.propostas || []).forEach((r) => bump(propostasByCliente, r));
  (state.vendas || []).forEach((r) => bump(vendasByCliente, r));

  _crmAgg = { propostasByCliente, vendasByCliente };
  return _crmAgg;
}

// Valor do negócio em aberto: derivado da proposta mais recente do cliente
// (state.propostas já vem em ordem desc). Sem coluna nova — é o número que o
// vendedor precisa ver para priorizar quem atender primeiro.
function getClienteValorEstimado(clientId) {
  const prop = (state.propostas || []).find((p) => String(p.cliente_id) === String(clientId));
  return prop ? (Number(propostaPreco(prop)) || 0) : 0;
}

function crmTimeAgo(dateValue) {
  const date = new Date(dateValue);
  if (isNaN(date)) return '';
  const diffMs = Date.now() - date.getTime();
  const dias = Math.floor(diffMs / 86400000);
  if (dias <= 0) return 'hoje';
  if (dias === 1) return 'ontem';
  if (dias < 30) return `há ${dias}d`;
  const meses = Math.floor(dias / 30);
  return meses < 12 ? `há ${meses}m` : `há ${Math.floor(meses / 12)}a`;
}

// ==========================================
// MENU DE STATUS (popover — substitui o clique-que-cicla)
// ==========================================
function _crmCloseStatusMenu() {
  const el = document.getElementById('crm-status-menu');
  if (el) el.remove();
  document.removeEventListener('click', _crmCloseStatusMenu);
}

function openClientStatusMenu(event, clientId) {
  event.stopPropagation();
  event.preventDefault();
  _crmCloseStatusMenu();

  const client = (state.clientes || []).find((c) => c.id === clientId);
  if (!client) return;
  const current = normalizeClientStatus(client.status);

  const rect = event.currentTarget.getBoundingClientRect();
  const menu = document.createElement('div');
  menu.id = 'crm-status-menu';
  menu.className = 'fixed z-[95] bg-black border border-neutral-700 shadow-[0_10px_40px_rgba(0,0,0,0.9)] min-w-[190px]';

  menu.innerHTML = CRM_STATUS_ALL.map((status) => {
    const style = CLIENT_STATUS_STYLE[status] || CLIENT_STATUS_STYLE.NOVO;
    const active = status === current;
    return `
      <button type="button" data-status="${status}"
        class="w-full text-left px-4 py-2.5 text-[10px] font-black uppercase tracking-widest border-b border-neutral-900 last:border-b-0 flex items-center justify-between gap-3 transition-colors ${active ? `${style.bg} ${style.text}` : 'text-neutral-400 hover:bg-neutral-900 hover:text-white'}">
        <span>${escapeHTML(status)}</span>
        ${active ? '<i data-lucide="check" class="w-3.5 h-3.5"></i>' : ''}
      </button>`;
  }).join('');

  document.body.appendChild(menu);

  // Posiciona abaixo do badge, sem sair da tela
  const menuRect = menu.getBoundingClientRect();
  let top = rect.bottom + 4;
  let left = rect.left;
  if (top + menuRect.height > window.innerHeight - 8) top = rect.top - menuRect.height - 4;
  if (left + menuRect.width > window.innerWidth - 8) left = window.innerWidth - menuRect.width - 8;
  menu.style.top = `${Math.max(8, top)}px`;
  menu.style.left = `${Math.max(8, left)}px`;

  menu.querySelectorAll('button[data-status]').forEach((btn) => {
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      _crmCloseStatusMenu();
      crmSetClientStatus(clientId, btn.dataset.status);
    });
  });

  setTimeout(() => document.addEventListener('click', _crmCloseStatusMenu), 0);
  lucide.createIcons();
}

// Existe venda registrada para este cliente? (mesmo casamento do buildCrmAggregates:
// cliente_id, com fallback por telefone para o legado sem vínculo)
function crmClienteTemVenda(clientId) {
  const client = (state.clientes || []).find((c) => c.id === clientId);
  const fone = client ? digitsOnly(client.telefone) : '';
  return (state.vendas || []).some((v) => (
    v.cliente_id === clientId || (!v.cliente_id && fone && digitsOnly(v.cliente_telefone) === fone)
  ));
}

// opts.skipVenda pula o interceptor de FECHADO (escape "fechar sem registrar venda").
async function crmSetClientStatus(clientId, newStatus, motivo = null, opts = {}) {
  const client = (state.clientes || []).find((c) => c.id === clientId);
  if (!client) return;

  const status = String(newStatus || '').toUpperCase();
  if (!CRM_STATUS_ALL.includes(status)) return;
  if (normalizeClientStatus(client.status) === status) return;

  if (status === 'PERDIDO' && !motivo) {
    openMotivoPerdaModal(clientId);
    return;
  }

  // Simétrico ao PERDIDO: marcar FECHADO sem venda registrada abre o fecha-venda
  // (que já pré-seleciona a última proposta). É o que faltava para a venda existir
  // na plataforma — o status sozinho não vira faturamento nem comissão.
  if (status === 'FECHADO' && !opts.skipVenda && !crmClienteTemVenda(clientId)) {
    openFechaVenda(clientId);
    return;
  }

  // Update otimista + persistência (o trigger do banco loga na timeline)
  const statusAnterior = client.status;
  const motivoAnterior = client.perdido_motivo;
  const proximaEmAnterior = client.proxima_acao_em;
  const proximaNotaAnterior = client.proxima_acao_nota;
  client.status = status;
  if (status === 'PERDIDO') client.perdido_motivo = motivo;
  renderContent();
  if (_crm360ClientId === clientId) renderCrm360();

  const payload = { status };
  if (status === 'PERDIDO') payload.perdido_motivo = motivo;
  // Status terminal encerra o ciclo: a fila do dia não pode cobrar follow-up de
  // cliente ganho ou perdido.
  if (status === 'FECHADO' || status === 'PERDIDO') {
    payload.proxima_acao_em = null;
    payload.proxima_acao_nota = null;
    client.proxima_acao_em = null;
    client.proxima_acao_nota = null;
  }

  const { error } = await supabaseClient.from('clientes').update(payload).eq('id', clientId);
  if (error) {
    console.error('[crm] Falha ao atualizar status.', error);
    // Reverte o otimista: a UI não pode ficar mostrando um status que não persistiu.
    client.status = statusAnterior;
    client.perdido_motivo = motivoAnterior;
    client.proxima_acao_em = proximaEmAnterior;
    client.proxima_acao_nota = proximaNotaAnterior;
    renderContent();
    if (_crm360ClientId === clientId) renderCrm360();
    showToast('Erro ao atualizar o status. Tente novamente.');
    return;
  }
  showToast(`STATUS: ${status}`);
}

// --- Mini-modal de motivo da perda -----------------------------------
function openMotivoPerdaModal(clientId) {
  const existing = document.getElementById('crm-motivo-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'crm-motivo-overlay';
  overlay.className = 'fixed inset-0 z-[96] flex items-center justify-center bg-black/90 backdrop-blur-md p-4';
  overlay.innerHTML = `
    <div class="bg-neutral-900 border-2 border-red-600/50 w-full max-w-sm shadow-[0_0_50px_rgba(220,38,38,0.2)] animate-fade-in-up">
      <div class="flex justify-between items-center p-5 border-b border-neutral-800 bg-black/50">
        <h2 class="text-lg font-black text-red-400 uppercase tracking-tighter">Marcar como perdido</h2>
        <button type="button" onclick="document.getElementById('crm-motivo-overlay').remove()" class="text-neutral-500 hover:text-red-500 transition-colors"><i data-lucide="x" class="w-6 h-6"></i></button>
      </div>
      <div class="p-5 space-y-4">
        <div class="space-y-1">
          <label class="text-[10px] text-red-400/80 font-black uppercase tracking-widest">Motivo da perda</label>
          <select id="crm-motivo-select" class="w-full bg-black border border-neutral-700 focus:border-red-500 px-4 py-3 text-white font-bold uppercase text-xs">
            ${CRM_MOTIVOS_PERDA.map((m) => `<option value="${m}">${m}</option>`).join('')}
          </select>
        </div>
        <div class="space-y-1">
          <label class="text-[10px] text-neutral-500 font-black uppercase tracking-widest">Detalhes (opcional)</label>
          <textarea id="crm-motivo-detalhe" rows="2" class="w-full bg-black border border-neutral-700 focus:border-red-500 px-4 py-3 text-white text-xs" placeholder="Ex.: fechou com concorrente por R$ 2 mil a menos"></textarea>
        </div>
        <button type="button" id="crm-motivo-confirm" class="w-full py-3.5 bg-red-600 hover:bg-red-500 text-white font-black uppercase tracking-widest text-xs transition-colors">Confirmar perda</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  lucide.createIcons();

  document.getElementById('crm-motivo-confirm').addEventListener('click', () => {
    const motivoBase = document.getElementById('crm-motivo-select').value;
    const detalhe = document.getElementById('crm-motivo-detalhe').value.trim();
    const motivo = detalhe ? `${motivoBase} — ${detalhe}` : motivoBase;
    overlay.remove();
    crmSetClientStatus(clientId, 'PERDIDO', motivo);
  });
}

// ==========================================
// KANBAN: drag-and-drop (HTML5)
// ==========================================
let _crmDraggingId = null;

function crmDragStart(event, clientId) {
  _crmDraggingId = clientId;
  event.dataTransfer.effectAllowed = 'move';
  try { event.dataTransfer.setData('text/plain', clientId); } catch (_) { /* IE/Edge legado */ }
}

function crmDragOver(event) {
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  const col = event.currentTarget;
  col.classList.add('ring-1', 'ring-orange-500/60');
}

function crmDragLeave(event) {
  event.currentTarget.classList.remove('ring-1', 'ring-orange-500/60');
}

function crmDropStatus(event, status) {
  event.preventDefault();
  event.currentTarget.classList.remove('ring-1', 'ring-orange-500/60');
  const clientId = _crmDraggingId || event.dataTransfer.getData('text/plain');
  _crmDraggingId = null;
  if (clientId) crmSetClientStatus(clientId, status);
}

// ==========================================
// PAINEL 360° DO CLIENTE
// ==========================================
let _crm360ClientId = null;
let _crm360Tab = 'timeline';
let _crm360Atividades = [];
let _crm360OmDetalhe = null;
let _crm360Cidade = null;        // município re-escolhido na edição
let _crm360ComposerTipo = 'nota';

function _crm360Client() {
  return (state.clientes || []).find((c) => c.id === _crm360ClientId) || null;
}

function ensureCrm360Container() {
  let overlay = document.getElementById('crm360-overlay');
  if (overlay) return overlay;
  overlay = document.createElement('div');
  overlay.id = 'crm360-overlay';
  // Aba full-page (Fase E). Estilos/animação em main.css (.crm360-aba).
  // Fechado = sem .is-open (não usamos mais .hidden).
  overlay.className = 'crm360-aba';
  document.body.appendChild(overlay);
  return overlay;
}

// ESC fecha a aba do CRM 360 (ligado só enquanto a aba está aberta).
// Overlays acima da ficha (fechar venda / compartilhar proposta) têm
// prioridade: ESC fecha ELES, não a ficha por baixo.
function _crm360OnKeydown(event) {
  if (event.key !== 'Escape') return;
  const fv = document.getElementById('fecha-venda-modal');
  if (fv && !fv.classList.contains('hidden')) {
    if (typeof closeFechaVenda === 'function') closeFechaVenda();
    return;
  }
  if (document.getElementById('pb-share-overlay')) {
    if (typeof closeProposalSharePanel === 'function') closeProposalSharePanel();
    return;
  }
  closeCrm360();
}

// Devolve o painel do construtor de proposta ao estacionamento (#pb-parking)
// ANTES de qualquer overlay.innerHTML — senão o innerHTML destruiria o painel
// e os listeners dele (busca, form personalizada).
function pbParkEmbeddedPanel() {
  const panel = document.getElementById('pb-embedded-panel');
  const parking = document.getElementById('pb-parking');
  if (panel && parking && panel.parentElement !== parking) parking.appendChild(panel);
}

async function openCrm360(clientId, initialTab) {
  const client = (state.clientes || []).find((c) => c.id === clientId);
  if (!client) return;

  _crm360ClientId = clientId;
  _crm360Tab = typeof initialTab === 'string' && initialTab ? initialTab : 'timeline';
  _crm360Atividades = [];
  _crm360OmDetalhe = null;
  _crm360Cidade = null;
  _crm360ComposerTipo = 'nota';

  ensureCrm360Container().classList.add('is-open');
  document.body.style.overflow = 'hidden';
  document.addEventListener('keydown', _crm360OnKeydown);
  renderCrm360();

  // Carregamentos async (timeline + O&M) — re-renderizam ao chegar
  crmFetchAtividades(clientId);
  if (state.omFlags && state.omFlags[clientId]) {
    supabaseClient.rpc('get_cliente_om_detalhe', { p_cliente_id: clientId })
      .then(({ data, error }) => {
        if (!error && _crm360ClientId === clientId) {
          _crm360OmDetalhe = data;
          renderCrm360();
        }
      });
  }
}

function closeCrm360() {
  _crm360ClientId = null;
  pbParkEmbeddedPanel();
  const overlay = document.getElementById('crm360-overlay');
  if (overlay) overlay.classList.remove('is-open');
  document.body.style.overflow = '';
  document.removeEventListener('keydown', _crm360OnKeydown);
}

async function crmFetchAtividades(clientId) {
  const { data, error } = await supabaseClient
    .from('crm_atividades')
    .select('*')
    .eq('cliente_id', clientId)
    .order('created_at', { ascending: false })
    .limit(120);

  if (!error && _crm360ClientId === clientId) {
    _crm360Atividades = data || [];
    renderCrm360();
  }
}

function _crm360ClientRows() {
  const client = _crm360Client();
  if (!client) return { propostas: [], vendas: [] };
  const phone = digitsOnly(client.telefone);
  const match = (row) => {
    if (row.cliente_id) return row.cliente_id === client.id;
    const d = digitsOnly(row.cliente_telefone);
    return phone && d && phone === d;
  };
  return {
    propostas: (state.propostas || []).filter(match),
    vendas: (state.vendas || []).filter(match),
  };
}

function renderCrm360() {
  const overlay = ensureCrm360Container();
  // O innerHTML abaixo destruiria o painel embutido do construtor — estaciona antes.
  pbParkEmbeddedPanel();
  const client = _crm360Client();
  if (!client) { closeCrm360(); return; }

  const status = normalizeClientStatus(client.status);
  const statusStyle = CLIENT_STATUS_STYLE[status] || CLIENT_STATUS_STYLE.NOVO;
  const waLink = buildClientWhatsappLink(client);
  const telDigits = digitsOnly(client.telefone);
  const { propostas, vendas } = _crm360ClientRows();
  const omFlag = state.omFlags ? state.omFlags[client.id] : null;
  const initial = String(client.nome || '?').charAt(0).toUpperCase();
  const avatarColor = CLIENT_AVATAR_COLORS[(String(client.nome || 'A').charCodeAt(0) || 0) % CLIENT_AVATAR_COLORS.length];

  const podeProposta = typeof canOperateClientProposalFlow !== 'function' || canOperateClientProposalFlow(client);
  const tabs = [
    { id: 'timeline', label: `TIMELINE`, icon: 'history' },
    { id: 'propostas', label: `PROPOSTAS (${propostas.length})`, icon: 'file-text' },
  ];
  // O construtor de proposta vive aqui dentro (painel embutido — ver pb-parking).
  if (podeProposta) tabs.push({ id: 'nova', label: 'NOVA PROPOSTA', icon: 'file-plus-2', accent: true });
  tabs.push({ id: 'vendas', label: `VENDAS (${vendas.length})`, icon: 'trophy' });
  tabs.push({ id: 'financiamento', label: 'FINANC.', icon: 'landmark' });
  if (omFlag) tabs.push({ id: 'om', label: 'O&M', icon: 'wrench' });

  overlay.innerHTML = `
    <!-- Barra Voltar (ocupa o lugar da topbar) -->
    <div class="shrink-0 bg-black/95 backdrop-blur-xl border-b border-neutral-800/60">
      <div class="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
        <button onclick="closeCrm360()" class="btn btn-ghost"><i data-lucide="arrow-left"></i>Voltar</button>
        <div class="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-neutral-600"><i data-lucide="users" class="w-3.5 h-3.5"></i>Comercial <span class="text-neutral-700">/</span> <span class="text-neutral-400">Cliente</span></div>
        <button onclick="closeCrm360()" title="Fechar" class="p-2.5 border border-neutral-800 bg-black text-neutral-500 hover:text-white hover:border-neutral-600 transition-all"><i data-lucide="x" class="w-4 h-4"></i></button>
      </div>
    </div>
    <!-- Conteúdo rolável -->
    <div class="flex-1 overflow-y-auto">
      <div class="max-w-6xl mx-auto px-4 py-6">

        <!-- HEADER do cliente -->
        <div class="flex flex-wrap items-center gap-4 pb-5 md:pb-6 border-b border-neutral-800">
          <div class="shrink-0 w-14 h-14 rounded-full bg-gradient-to-br ${avatarColor} flex items-center justify-center text-black font-black text-xl ring-2 ring-black select-none">
            ${escapeHTML(initial)}
          </div>
          <div class="flex-1 min-w-[200px]">
            <div class="flex items-center gap-2 flex-wrap">
              <h2 class="text-xl md:text-2xl font-black text-white uppercase tracking-tighter">${escapeHTML(client.nome || 'CLIENTE')}</h2>
              <button onclick="openClientStatusMenu(event, '${client.id}')"
                class="text-[9px] px-2.5 py-1 uppercase font-black tracking-widest border transition-all ${statusStyle.bg} ${statusStyle.text} ${statusStyle.border} hover:brightness-125"
                title="Alterar status">${escapeHTML(status)} ▾</button>
              ${omFlag ? '<span class="text-[8px] px-2 py-0.5 uppercase font-black tracking-widest border bg-blue-500/10 text-blue-400 border-blue-500/30">O&M</span>' : ''}
            </div>
            <p class="text-neutral-500 text-[10px] font-mono mt-1">
              ${escapeHTML(client.telefone || '-')} · ${escapeHTML(client.cidade || 'sem cidade')}
              ${Number(client.hsp) > 0 ? ` · ☀ ${client.hsp} HSP` : ''}
              · cadastrado ${formatDate(client.created_at)}
            </p>
            ${status === 'PERDIDO' && client.perdido_motivo ? `<p class="text-red-400/80 text-[10px] font-bold uppercase mt-1">Motivo: ${escapeHTML(client.perdido_motivo)}</p>` : ''}
          </div>
          <div class="flex items-center gap-2 flex-wrap">
            ${waLink ? `<a href="${waLink}" target="_blank" rel="noopener noreferrer" class="btn btn-primary btn-sm"><i data-lucide="message-circle"></i> WhatsApp</a>` : ''}
            ${telDigits ? `<a href="tel:+55${telDigits}" class="btn btn-secondary btn-sm"><i data-lucide="phone"></i> Ligar</a>` : ''}
            ${podeProposta ? `<button onclick="crmSet360Tab('nova')" class="btn btn-secondary btn-sm"><i data-lucide="file-plus-2"></i> Proposta</button>` : ''}
            <button onclick="openFechaVenda('${client.id}')" class="btn btn-success btn-sm"><i data-lucide="trophy"></i> Venda</button>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-5">
          <!-- COLUNA ESQUERDA: DADOS EDITÁVEIS (oculta nas abas largas — o
               construtor de kits e a vitrine FINANC. precisam da largura toda) -->
          <div class="${_crm360AbaLarga() ? 'hidden' : ''} lg:col-span-2 p-5 md:p-6 border-b lg:border-b-0 lg:border-r border-neutral-800 space-y-4">
            <p class="text-orange-500 text-[10px] font-black uppercase tracking-[0.3em] flex items-center gap-2"><i data-lucide="user-cog" class="w-3.5 h-3.5"></i> Dados do cliente</p>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              ${crm360Field('Nome', `<input id="crm360-nome" value="${escapeHTML(client.nome || '')}" class="crm360-input uppercase">`, 'sm:col-span-2')}
              ${crm360Field('Telefone', `<input id="crm360-telefone" value="${escapeHTML(client.telefone || '')}" class="crm360-input font-mono">`)}
              ${crm360Field('E-mail', `<input id="crm360-email" type="email" value="${escapeHTML(client.email || '')}" class="crm360-input">`)}
              ${crm360Field('Cidade/UF', `<div class="relative"><input id="crm360-cidade" value="${escapeHTML(client.cidade || '')}" class="crm360-input uppercase" autocomplete="off"></div>`)}
              ${crm360Field('CPF/CNPJ', `<input id="crm360-documento" value="${escapeHTML(client.documento || '')}" class="crm360-input">`)}
              ${crm360Field('CEP', `<input id="crm360-cep" value="${escapeHTML(client.cep || '')}" class="crm360-input font-mono">`)}
              ${crm360Field('Origem', `<select id="crm360-origem" class="crm360-input uppercase">
                ${clientOrigemOptionsHTML(client.origem)}
              </select>`)}
              ${crm360Field('Endereço', `<input id="crm360-endereco" value="${escapeHTML(client.endereco || '')}" class="crm360-input">`, 'sm:col-span-2')}
              ${crm360Field('Número', `<input id="crm360-numero" value="${escapeHTML(client.numero || '')}" class="crm360-input">`)}
              ${crm360Field('Bairro', `<input id="crm360-bairro" value="${escapeHTML(client.bairro || '')}" class="crm360-input">`)}
              ${crm360Field('Observações', `<textarea id="crm360-observacoes" rows="2" class="crm360-input">${escapeHTML(client.observacoes || '')}</textarea>`, 'sm:col-span-2')}
            </div>

            <div class="pt-3 border-t border-neutral-800/60 space-y-3">
              <p class="text-yellow-500 text-[10px] font-black uppercase tracking-[0.3em] flex items-center gap-2"><i data-lucide="alarm-clock" class="w-3.5 h-3.5"></i> Próxima ação (follow-up)</p>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                ${crm360Field('Quando', `<input id="crm360-proxima-em" type="datetime-local" value="${toLocalDatetimeInputValue(client.proxima_acao_em)}" class="crm360-input font-mono">`)}
                ${crm360Field('O que fazer', `<input id="crm360-proxima-nota" value="${escapeHTML(client.proxima_acao_nota || '')}" class="crm360-input" placeholder="Ex.: ligar para follow-up">`)}
              </div>
            </div>

            <button onclick="crmSaveClient360()" id="crm360-save-btn" class="btn btn-primary btn-lg w-full">
              <i data-lucide="save"></i> Salvar alterações
            </button>
          </div>

          <!-- COLUNA DIREITA: TIMELINE / ABAS -->
          <div class="${_crm360AbaLarga() ? 'lg:col-span-5' : 'lg:col-span-3'} p-5 md:p-6">
            <div class="flex gap-1 mb-4 flex-wrap">
              ${tabs.map((tab) => `
                <button onclick="crmSet360Tab('${tab.id}')" class="px-3 py-2 text-[9px] font-black uppercase tracking-widest border transition-all flex items-center gap-1.5 ${_crm360Tab === tab.id ? 'bg-orange-600 text-black border-orange-500' : (tab.accent ? 'bg-black text-orange-400 border-orange-500/40 hover:brightness-125' : 'bg-black text-neutral-500 border-neutral-800 hover:text-white')}">
                  <i data-lucide="${tab.icon}" class="w-3 h-3"></i> ${tab.label}
                </button>`).join('')}
            </div>
            <div id="crm360-tab-content">${renderCrm360TabContent(client, propostas, vendas)}</div>
          </div>
        </div>
      </div>
    </div>`;

  // Autocomplete na cidade editável
  if (typeof attachCidadeAutocomplete === 'function') {
    attachCidadeAutocomplete(document.getElementById('crm360-cidade'), (mun) => { _crm360Cidade = mun; });
  }
  const telInput = document.getElementById('crm360-telefone');
  if (telInput) telInput.addEventListener('input', formatarTelefone);

  // Aba NOVA PROPOSTA: move o painel do construtor para o slot (appendChild
  // preserva listeners) e prepara o estado para o cliente atual.
  if (_crm360Tab === 'nova') {
    const slot = document.getElementById('crm360-builder-slot');
    const panel = document.getElementById('pb-embedded-panel');
    if (slot && panel) slot.appendChild(panel);
    if (typeof pbEmbedSetup === 'function') pbEmbedSetup(client);
  }
  if (_crm360Tab === 'financiamento' && typeof renderFinanciamento === 'function') renderFinanciamento();

  lucide.createIcons();
}

function crm360Field(label, inputHTML, extraCls = '') {
  return `
    <div class="space-y-1 ${extraCls}">
      <label class="text-[9px] text-neutral-500 font-black uppercase tracking-widest">${label}</label>
      ${inputHTML}
    </div>`;
}

function crmSet360Tab(tab) {
  _crm360Tab = tab;
  renderCrm360();
}

// Abas que ocupam a largura toda da ficha (a coluna "Dados do cliente" some):
// o construtor de kits e a vitrine de financiamento precisam de espaço.
function _crm360AbaLarga() {
  return _crm360Tab === 'nova' || _crm360Tab === 'financiamento';
}

// Link de (re)envio da proposta no WhatsApp do cliente — mesma mensagem do
// painel pós-geração do construtor.
function crm360PropostaWhatsappLink(client, p) {
  const digits = digitsOnly(client?.telefone || '');
  if (digits.length < 10) return null;
  const primeiro = String(client?.nome || 'cliente').trim().split(' ')[0];
  const nome = primeiro.charAt(0).toUpperCase() + primeiro.slice(1).toLowerCase();
  const link = `${window.location.origin}/proposta.html?id=${p.id}`;
  const msg = encodeURIComponent(`Olá, ${nome}! Segue a sua proposta de energia solar da Ágil Solar: ${link}\nQualquer dúvida, é só me chamar por aqui.`);
  return `https://wa.me/55${digits}?text=${msg}`;
}

function renderCrm360TabContent(client, propostas, vendas) {
  // Construtor de proposta embutido: o slot recebe #pb-embedded-panel via
  // appendChild no pós-render do renderCrm360 (preserva listeners do painel).
  if (_crm360Tab === 'nova') {
    const primeiroNome = String(client?.nome || 'o cliente').trim().split(' ')[0];
    const nomeBonito = primeiroNome.charAt(0).toUpperCase() + primeiroNome.slice(1).toLowerCase();
    return `
      <div class="mb-5">
        <p class="text-orange-500 text-[10px] font-black uppercase tracking-[0.3em] flex items-center gap-2 mb-1">
          <i data-lucide="file-plus-2" class="w-3.5 h-3.5"></i> NOVA PROPOSTA
        </p>
        <h3 class="text-xl font-black text-white uppercase tracking-tighter">Escolha o kit para ${escapeHTML(nomeBonito)}</h3>
        <p class="text-neutral-500 text-xs mt-1">Toque em GERAR — o link já sai pronto para enviar no WhatsApp.</p>
      </div>
      <div id="crm360-builder-slot"></div>`;
  }

  // Vitrine de bancos/financiadoras (renderFinanciamento preenche no pós-render).
  if (_crm360Tab === 'financiamento') {
    return '<div id="pb-section-financiamento"></div>';
  }

  if (_crm360Tab === 'propostas') {
    const podeProposta = typeof canOperateClientProposalFlow !== 'function' || canOperateClientProposalFlow(client);
    const novaBtn = podeProposta
      ? `<button onclick="crmSet360Tab('nova')" class="btn btn-primary btn-sm"><i data-lucide="file-plus-2"></i> Nova proposta</button>`
      : '';

    if (propostas.length === 0) {
      return `
        <div class="py-14 text-center border border-dashed border-neutral-800/60 bg-neutral-950/40">
          <i data-lucide="file-clock" class="w-10 h-10 mx-auto mb-3 opacity-30"></i>
          <p class="text-neutral-600 font-bold uppercase tracking-widest text-xs ${novaBtn ? 'mb-4' : ''}">Nenhuma proposta para este cliente</p>
          ${novaBtn}
        </div>`;
    }

    return `
      ${novaBtn ? `<div class="flex justify-end mb-2">${novaBtn}</div>` : ''}
      <div class="space-y-2">${propostas.map((p) => {
      const isPersonalizada = p.proposal_mode === 'PERSONALIZADA' || p.proposal_mode === 'EQUIPAMENTOS';
      const preco = isPersonalizada ? (p.custom_total_price || p.kit_price) : p.kit_price;
      // Ciclo de vida (GERADA→ENVIADA→VISTA→ACEITA) — helpers do app.js.
      const st = (typeof propostaStatus === 'function') ? propostaStatus(p) : 'GERADA';
      const stCls = (typeof PROPOSTA_STATUS_STYLE !== 'undefined' && PROPOSTA_STATUS_STYLE[st])
        ? PROPOSTA_STATUS_STYLE[st].cls
        : 'bg-neutral-800/60 text-neutral-400 border-neutral-700';
      const vistaInfo = st === 'VISTA' && p.vista_em
        ? `<span class="text-[9px] text-orange-400/80 font-bold">vista ${typeof crmTimeAgo === 'function' ? crmTimeAgo(p.vista_em) : formatDate(p.vista_em)}${Number(p.vista_count) > 1 ? ` · ${p.vista_count}x` : ''}</span>`
        : '';
      const waResend = crm360PropostaWhatsappLink(client, p);
      return `
        <div class="border ${st === 'VISTA' ? 'border-orange-500/30' : 'border-neutral-800'} bg-black/40 p-3.5 flex items-center gap-3 flex-wrap">
          <div class="flex-1 min-w-[160px]">
            <div class="flex items-center gap-2 flex-wrap">
              <p class="text-white font-black text-xs uppercase">${escapeHTML(p.kit_nome || 'Proposta')}</p>
              <span class="text-[8px] px-1.5 py-0.5 uppercase font-black tracking-widest border shrink-0 ${stCls}">${st}</span>
              ${vistaInfo}
            </div>
            <p class="text-neutral-600 text-[10px] font-mono mt-0.5">${formatDate(p.created_at)} · ${escapeHTML(String(p.kit_power || p.custom_system_power_kwp || '-'))} kWp ${p.geracao_estimada ? `· ~${Math.round(p.geracao_estimada)} kWh/mês` : ''}</p>
          </div>
          <span class="text-green-400 font-black text-sm">${formatCurrency(preco || 0)}</span>
          <div class="flex items-center gap-1.5">
            ${(state.isAdmin || state.isGestor) ? `<button onclick="openOrcamentoDre('${p.id}')" title="DRE" class="btn btn-secondary btn-icon"><i data-lucide="bar-chart-3"></i></button>` : ''}
            ${waResend ? `<a href="${waResend}" target="_blank" rel="noopener noreferrer" onclick="marcarPropostaEnviada('${p.id}')" title="Enviar no WhatsApp do cliente" class="btn btn-primary btn-icon"><i data-lucide="message-circle"></i></a>` : ''}
            <button onclick="copiarLinkExistente('${p.id}', this)" title="Copiar link" class="btn btn-secondary btn-icon"><i data-lucide="copy"></i></button>
            <a href="proposta.html?id=${p.id}" target="_blank" rel="noopener" title="Abrir proposta" class="btn btn-secondary btn-icon"><i data-lucide="external-link"></i></a>
          </div>
        </div>`;
    }).join('')}</div>`;
  }

  if (_crm360Tab === 'vendas') {
    if (vendas.length === 0) return crm360Empty('trophy', 'Nenhuma venda fechada ainda');
    return `<div class="space-y-2">${vendas.map((v) => `
      <div class="border border-green-900/40 bg-green-950/10 p-3.5 flex items-center gap-3 flex-wrap">
        <div class="flex-1 min-w-[160px]">
          <p class="text-white font-black text-xs uppercase">${escapeHTML(v.kit_nome || 'Venda')}</p>
          <p class="text-neutral-600 text-[10px] font-mono mt-0.5">${formatDate(v.created_at)} · ${escapeHTML(String(v.kit_power || '-'))} kWp</p>
        </div>
        <span class="text-green-400 font-black text-sm">${formatCurrency(v.kit_price || 0)}</span>
      </div>`).join('')}</div>`;
  }

  if (_crm360Tab === 'om') {
    const om = _crm360OmDetalhe;
    if (!om) return crm360Empty('loader-2', 'Carregando dados de O&M...');
    const sistemas = Array.isArray(om.sistemas) ? om.sistemas : [];
    const propostasOm = Array.isArray(om.propostas_om) ? om.propostas_om : [];
    return `
      <div class="space-y-4">
        <div class="grid grid-cols-3 gap-2">
          <div class="border border-neutral-800 bg-black/40 p-3 text-center"><p class="text-2xl font-black text-blue-400">${sistemas.length}</p><p class="text-[8px] text-neutral-500 font-black uppercase tracking-widest">Sistemas</p></div>
          <div class="border border-neutral-800 bg-black/40 p-3 text-center"><p class="text-2xl font-black text-orange-400">${Number(om.ordens) || 0}</p><p class="text-[8px] text-neutral-500 font-black uppercase tracking-widest">Ordens</p></div>
          <div class="border border-neutral-800 bg-black/40 p-3 text-center"><p class="text-2xl font-black text-yellow-400">${propostasOm.length}</p><p class="text-[8px] text-neutral-500 font-black uppercase tracking-widest">Propostas O&M</p></div>
        </div>
        ${sistemas.length > 0 ? `<div class="space-y-2">${sistemas.map((s) => `
          <div class="border border-neutral-800 bg-black/40 p-3.5">
            <p class="text-white font-black text-xs uppercase">${escapeHTML(s.apelido || 'Sistema')} ${s.potencia_kwp ? `· ${s.potencia_kwp} kWp` : ''}</p>
            <p class="text-neutral-600 text-[10px] font-mono mt-0.5">${escapeHTML([s.marca_modulos, s.marca_inversor, s.tipo_telhado].filter(Boolean).join(' · ') || '-')}</p>
          </div>`).join('')}</div>` : ''}
        ${propostasOm.length > 0 ? `<div class="space-y-2">${propostasOm.map((p) => `
          <div class="border border-neutral-800 bg-black/40 p-3 flex items-center gap-3">
            <div class="flex-1"><p class="text-white font-bold text-[11px] uppercase">${escapeHTML(p.tipo_servico || '-')} ${p.numero ? `· ${escapeHTML(p.numero)}` : ''}</p>
            <p class="text-neutral-600 text-[9px] font-mono">${formatDate(p.created_at)} · ${escapeHTML(p.status || '')}</p></div>
            <span class="text-green-400 font-black text-xs">${formatCurrency(Number(p.valor_final) || 0)}</span>
          </div>`).join('')}</div>` : ''}
      </div>`;
  }

  // TIMELINE (padrão): atividades + propostas + vendas mescladas
  const eventos = [];
  _crm360Atividades.forEach((a) => eventos.push({ tipo: a.tipo, data: a.created_at, autor: a.autor_email, descricao: a.descricao, meta: a.meta }));
  propostas.forEach((p) => eventos.push({ tipo: 'proposta', data: p.created_at, autor: p.vendedor_email, descricao: `Proposta gerada: ${p.kit_nome || 'personalizada'}` }));
  vendas.forEach((v) => eventos.push({ tipo: 'venda', data: v.created_at, autor: v.vendedor_email, descricao: `Venda fechada: ${v.kit_nome || ''} (${formatCurrency(v.kit_price || 0)})` }));
  eventos.sort((a, b) => new Date(b.data) - new Date(a.data));

  const composer = `
    <div class="border border-neutral-800 bg-black/40 p-3.5 mb-4">
      <div class="flex gap-1 mb-2 flex-wrap">
        ${['nota', 'ligacao', 'whatsapp', 'visita'].map((tipo) => {
          const meta = CRM_ATIVIDADE_META[tipo];
          const active = _crm360ComposerTipo === tipo;
          return `<button onclick="crmSetComposerTipo('${tipo}')" class="px-2.5 py-1.5 text-[8px] font-black uppercase tracking-widest border flex items-center gap-1 transition-all ${active ? 'bg-orange-600 text-black border-orange-500' : 'bg-black text-neutral-500 border-neutral-800 hover:text-white'}"><i data-lucide="${meta.icon}" class="w-3 h-3"></i> ${meta.label}</button>`;
        }).join('')}
      </div>
      <div class="flex gap-2">
        <input id="crm360-composer-text" placeholder="Registrar ${CRM_ATIVIDADE_META[_crm360ComposerTipo].label.toLowerCase()}..." class="crm360-input flex-1" onkeydown="if(event.key==='Enter'){event.preventDefault();crmSubmitAtividade();}">
        <button onclick="crmSubmitAtividade()" class="px-4 bg-orange-600 hover:bg-orange-500 text-black font-black uppercase tracking-widest text-[10px] transition-colors">OK</button>
      </div>
    </div>`;

  if (eventos.length === 0) return composer + crm360Empty('history', 'Sem atividades ainda — registre a primeira acima');

  return composer + `
    <div class="space-y-0 max-h-[420px] overflow-y-auto pr-1">
      ${eventos.map((ev) => {
        const meta = CRM_ATIVIDADE_META[ev.tipo] || CRM_ATIVIDADE_META.nota;
        let texto = ev.descricao || '';
        if (ev.tipo === 'status' && ev.meta) {
          texto = `Status: ${ev.meta.de || '—'} → ${ev.meta.para || '—'}${ev.meta.motivo ? ` (${ev.meta.motivo})` : ''}`;
        }
        if (!texto) texto = meta.label;
        return `
          <div class="flex gap-3 py-2.5 border-b border-neutral-900 last:border-b-0">
            <div class="shrink-0 w-7 h-7 rounded-full bg-neutral-900 border border-neutral-800 flex items-center justify-center ${meta.color}">
              <i data-lucide="${meta.icon}" class="w-3.5 h-3.5"></i>
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-neutral-300 text-[11px] leading-snug">${escapeHTML(texto)}</p>
              <p class="text-neutral-600 text-[9px] font-mono mt-0.5">${formatDate(ev.data)} · ${crmTimeAgo(ev.data)}${ev.autor ? ` · ${escapeHTML(String(ev.autor).split('@')[0])}` : ''}</p>
            </div>
          </div>`;
      }).join('')}
    </div>`;
}

function crm360Empty(icon, message) {
  return `
    <div class="py-14 text-center border border-dashed border-neutral-800/60 bg-neutral-950/40">
      <i data-lucide="${icon}" class="w-10 h-10 mx-auto mb-3 text-neutral-700"></i>
      <p class="text-neutral-600 font-bold uppercase tracking-widest text-[10px]">${message}</p>
    </div>`;
}

function crmSetComposerTipo(tipo) {
  _crm360ComposerTipo = tipo;
  renderCrm360();
  const input = document.getElementById('crm360-composer-text');
  if (input) input.focus();
}

async function crmSubmitAtividade() {
  const client = _crm360Client();
  const input = document.getElementById('crm360-composer-text');
  if (!client || !input) return;

  const texto = input.value.trim();
  if (!texto) { showToast('Escreva algo para registrar.'); return; }

  const { error } = await supabaseClient.from('crm_atividades').insert([{
    cliente_id: client.id,
    franquia_id: client.franquia_id,
    autor_email: state.currentUser?.email || 'sistema',
    tipo: _crm360ComposerTipo,
    descricao: texto,
  }]);

  if (error) {
    console.error('[crm] Falha ao registrar atividade.', error);
    showToast('Erro ao registrar a atividade.');
    return;
  }

  input.value = '';
  showToast('Atividade registrada!');
  crmFetchAtividades(client.id);
  if (state.crmLastAtividade) state.crmLastAtividade[client.id] = { last_at: new Date().toISOString(), last_tipo: _crm360ComposerTipo };
}

async function crmSaveClient360() {
  const client = _crm360Client();
  if (!client) return;

  const btn = document.getElementById('crm360-save-btn');
  if (btn) btn.innerText = 'SALVANDO...';

  const cidadeTexto = document.getElementById('crm360-cidade').value.trim();
  const mun = _crm360Cidade || (typeof parseCidadeLivre === 'function' ? parseCidadeLivre(cidadeTexto) : null);
  const cidadeMudou = mun && mun.ibge !== client.cidade_ibge;

  const proximaEmRaw = document.getElementById('crm360-proxima-em').value;
  const proximaEm = proximaEmRaw ? new Date(proximaEmRaw).toISOString() : null;
  const proximaNota = document.getElementById('crm360-proxima-nota').value.trim() || null;
  // Compara no mesmo formato do input (hora local, precisão de minuto) —
  // senão todo salvamento "muda" o follow-up e re-loga na timeline.
  const proximaMudou = proximaEmRaw !== toLocalDatetimeInputValue(client.proxima_acao_em);

  const payload = {
    nome: document.getElementById('crm360-nome').value.toUpperCase().trim(),
    telefone: document.getElementById('crm360-telefone').value.trim(),
    email: document.getElementById('crm360-email').value.trim() || null,
    documento: document.getElementById('crm360-documento').value.trim() || null,
    cep: document.getElementById('crm360-cep').value.trim() || null,
    endereco: document.getElementById('crm360-endereco').value.trim() || null,
    numero: document.getElementById('crm360-numero').value.trim() || null,
    bairro: document.getElementById('crm360-bairro').value.trim() || null,
    origem: document.getElementById('crm360-origem').value || CLIENT_ORIGEM_VAZIA,
    observacoes: document.getElementById('crm360-observacoes').value.trim() || null,
    proxima_acao_em: proximaEm,
    proxima_acao_nota: proximaNota,
  };

  if (!payload.nome) { showToast('Nome é obrigatório.'); if (btn) btn.innerText = 'SALVAR ALTERAÇÕES'; return; }
  if (digitsOnly(payload.telefone).length < 10) { showToast('Telefone com DDD é obrigatório.'); if (btn) btn.innerText = 'SALVAR ALTERAÇÕES'; return; }
  if (!cidadeTexto) { showToast('Cidade é obrigatória.'); if (btn) btn.innerText = 'SALVAR ALTERAÇÕES'; return; }

  if (mun) {
    payload.cidade = `${mun.nome.toUpperCase()}/${mun.uf}`;
    payload.cidade_ibge = mun.ibge;
    payload.uf = mun.uf;
    payload.latitude = mun.lat;
    payload.longitude = mun.lon;
    if (cidadeMudou) payload.hsp = null; // re-resolvido abaixo
  } else {
    payload.cidade = cidadeTexto.toUpperCase();
  }

  const { error } = await supabaseClient.from('clientes').update(payload).eq('id', client.id);
  if (error) {
    console.error('[crm] Falha ao salvar cliente.', error);
    showToast(`Erro ao salvar: ${error.message}`);
    if (btn) btn.innerText = 'SALVAR ALTERAÇÕES';
    return;
  }

  Object.assign(client, payload);

  // Cidade nova → re-resolve HSP async
  if (cidadeMudou && typeof enrichClienteHsp === 'function') {
    enrichClienteHsp(client.id, mun).then(() => { if (_crm360ClientId === client.id) renderCrm360(); });
  }

  // Follow-up novo/alterado vira atividade na timeline
  if (proximaMudou && proximaEm) {
    supabaseClient.from('crm_atividades').insert([{
      cliente_id: client.id,
      franquia_id: client.franquia_id,
      autor_email: state.currentUser?.email || 'sistema',
      tipo: 'proxima_acao',
      descricao: `Follow-up agendado para ${formatDate(proximaEm)}${proximaNota ? `: ${proximaNota}` : ''}`,
    }]).then(() => crmFetchAtividades(client.id));
  }

  showToast('CLIENTE ATUALIZADO!');
  renderCrm360();
  renderContent();
}

// ==========================================
// FERRAMENTA DE MESCLAGEM DE DUPLICATAS (só admin)
// ==========================================
// =======================================================================
// HIGIENE DO FUNIL — tirar do caminho o que não é mais negócio
// =======================================================================
// Motivação: 72% da base estava parada em "PROPOSTA ENVIADA", muita coisa de
// meses atrás. Funil que nunca é limpo vira paisagem: o vendedor para de olhar
// porque não confia mais no que está lá.
//
// Duas saídas, nunca uma terceira: PERDIDO (com motivo, entra no relatório de
// perdas) ou ARQUIVAR (some da lista, dado preservado). NÃO existe "fechar em
// massa" — venda gera título no Financeiro (trg_fin_gerar_da_venda), então
// fechar aos montes lançaria faturamento falso.
const CRM_HIGIENE_DIAS = 60;
let _crmHigieneSel = new Set();

// Clientes em aberto sem nenhum sinal de vida há CRM_HIGIENE_DIAS.
function crmHigieneCandidatos() {
  const limite = Date.now() - CRM_HIGIENE_DIAS * 86400000;
  const rows = state.isAdmin ? applyAdminGlobalScope(state.clientes || []) : (state.clientes || []);

  return rows.filter((c) => {
    const status = normalizeClientStatus(c.status);
    if (status === 'FECHADO' || status === 'PERDIDO') return false;
    // Follow-up marcado = alguém está cuidando; fora da higiene.
    if (c.proxima_acao_em) return false;

    const ultima = state.crmLastAtividade?.[c.id]?.last_at || c.created_at;
    const quando = new Date(ultima || 0).getTime();
    return Number.isFinite(quando) && quando < limite;
  }).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
}

function renderHigieneBanner() {
  if (!(state.isAdmin || state.isGestor)) return '';
  const n = crmHigieneCandidatos().length;
  if (n === 0) return '';

  return `
    <div class="border border-neutral-800 bg-neutral-900/40 px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap">
      <div class="flex items-center gap-2.5">
        <i data-lucide="snowflake" class="w-4 h-4 text-neutral-500 shrink-0"></i>
        <p class="text-[11px] font-bold text-neutral-400">
          <span class="text-white font-black">${n}</span> cliente${n > 1 ? 's' : ''} sem atividade há mais de ${CRM_HIGIENE_DIAS} dias entulhando o funil.
        </p>
      </div>
      <button onclick="openHigieneModal()" class="btn btn-secondary btn-sm shrink-0"><i data-lucide="archive-restore"></i> Limpar funil</button>
    </div>`;
}

function openHigieneModal() {
  if (!(state.isAdmin || state.isGestor)) { showToast('Acesso restrito.'); return; }

  const candidatos = crmHigieneCandidatos();
  if (candidatos.length === 0) { showToast('Nada a limpar por aqui.'); return; }

  // Começa com tudo selecionado: o gestor desmarca as exceções, que é o caminho
  // curto quando a intenção é limpar mesmo.
  _crmHigieneSel = new Set(candidatos.map((c) => c.id));

  const existing = document.getElementById('crm-higiene-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'crm-higiene-overlay';
  overlay.className = 'fixed inset-0 z-[96] flex items-center justify-center bg-black/90 backdrop-blur-md p-4';
  overlay.innerHTML = `
    <div class="bg-neutral-900 border-2 border-neutral-700 w-full max-w-2xl max-h-[85vh] flex flex-col shadow-[0_0_50px_rgba(0,0,0,0.6)] animate-fade-in-up">
      <div class="flex justify-between items-center p-5 border-b border-neutral-800 bg-black/50 shrink-0">
        <div>
          <p class="text-[9px] text-neutral-500 font-black uppercase tracking-widest">Sem atividade há ${CRM_HIGIENE_DIAS}+ dias</p>
          <h2 class="text-sm font-black text-white uppercase tracking-tighter">Limpar funil</h2>
        </div>
        <button type="button" onclick="closeHigieneModal()" class="text-neutral-500 hover:text-red-500 transition-colors"><i data-lucide="x" class="w-6 h-6"></i></button>
      </div>
      <div class="px-5 py-3 border-b border-neutral-800 flex items-center justify-between gap-2 shrink-0">
        <span id="higiene-contador" class="text-[10px] font-black uppercase tracking-widest text-orange-400">${candidatos.length} selecionados</span>
        <div class="flex gap-1.5">
          <button onclick="higieneSelecionarTodos(true)" class="btn btn-ghost btn-sm">Todos</button>
          <button onclick="higieneSelecionarTodos(false)" class="btn btn-ghost btn-sm">Nenhum</button>
        </div>
      </div>
      <div class="p-3 overflow-y-auto flex-1 flex flex-col gap-1.5" id="higiene-lista">
        ${candidatos.map((c) => {
          const ultima = state.crmLastAtividade?.[c.id]?.last_at || c.created_at;
          const valor = getClienteValorEstimado(c.id);
          return `
            <label class="flex items-center gap-3 bg-[#0d0d0f] border border-neutral-800 p-2.5 cursor-pointer hover:border-neutral-700 transition-colors">
              <input type="checkbox" checked data-higiene-id="${c.id}" onchange="higieneToggle('${c.id}', this.checked)" class="w-4 h-4 accent-orange-500 shrink-0">
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2 min-w-0">
                  <span class="text-white font-black text-[11px] uppercase truncate">${escapeHTML(c.nome || 'CLIENTE')}</span>
                  ${valor > 0 ? `<span class="shrink-0 text-[10px] font-black text-green-400/80 num">${formatCurrency(valor)}</span>` : ''}
                </div>
                <div class="flex flex-wrap items-center gap-x-2 text-[9px] font-bold text-neutral-500 mt-0.5">
                  <span>${escapeHTML(normalizeClientStatus(c.status))}</span>
                  <span class="text-neutral-700">·</span>
                  <span>última atividade ${crmTimeAgo(ultima)}</span>
                  ${c.vendedor_email ? `<span class="text-purple-400/70">${escapeHTML(String(c.vendedor_email).split('@')[0])}</span>` : ''}
                </div>
              </div>
              <button type="button" onclick="event.preventDefault(); closeHigieneModal(); openCrm360('${c.id}')" title="Abrir ficha" class="btn btn-ghost btn-icon shrink-0"><i data-lucide="maximize-2"></i></button>
            </label>`;
        }).join('')}
      </div>
      <div class="p-4 border-t border-neutral-800 bg-black/50 shrink-0 space-y-2">
        <p id="higiene-erro" class="hidden text-red-500 text-xs font-bold bg-red-500/10 border border-red-500/20 p-2.5"></p>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button onclick="higieneAplicar('perdido')" class="btn btn-danger btn-block"><i data-lucide="thumbs-down"></i> Marcar como perdido</button>
          <button onclick="higieneAplicar('arquivar')" class="btn btn-secondary btn-block"><i data-lucide="archive"></i> Arquivar</button>
        </div>
        <p class="text-[9px] text-neutral-600 font-medium text-center">
          Perdido entra no relatório de perdas com o motivo "SEM RETORNO". Arquivar só tira da lista — o cadastro continua no banco.
        </p>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  lucide.createIcons();
}

function closeHigieneModal() {
  document.getElementById('crm-higiene-overlay')?.remove();
}

function higieneToggle(id, marcado) {
  if (marcado) _crmHigieneSel.add(id);
  else _crmHigieneSel.delete(id);
  _higieneAtualizaContador();
}

function higieneSelecionarTodos(marcar) {
  const overlay = document.getElementById('crm-higiene-overlay');
  if (!overlay) return;
  overlay.querySelectorAll('[data-higiene-id]').forEach((input) => {
    input.checked = marcar;
    if (marcar) _crmHigieneSel.add(input.dataset.higieneId);
    else _crmHigieneSel.delete(input.dataset.higieneId);
  });
  _higieneAtualizaContador();
}

function _higieneAtualizaContador() {
  const el = document.getElementById('higiene-contador');
  if (el) el.innerText = `${_crmHigieneSel.size} selecionados`;
}

async function higieneAplicar(acao) {
  const ids = [..._crmHigieneSel];
  const errEl = document.getElementById('higiene-erro');
  if (ids.length === 0) {
    errEl.innerText = 'Selecione ao menos um cliente.';
    errEl.classList.remove('hidden');
    return;
  }

  const ehPerdido = acao === 'perdido';
  const msg = ehPerdido
    ? `Marcar ${ids.length} cliente${ids.length > 1 ? 's' : ''} como PERDIDO (motivo: sem retorno)?`
    : `Arquivar ${ids.length} cliente${ids.length > 1 ? 's' : ''}? Eles somem das listas, mas o cadastro fica guardado.`;

  showConfirmModal(msg, async () => {
    const payload = ehPerdido
      ? { status: 'PERDIDO', perdido_motivo: 'SEM RETORNO', proxima_acao_em: null, proxima_acao_nota: null }
      : { arquivado_em: new Date().toISOString() };

    const { error } = await supabaseClient.from('clientes').update(payload).in('id', ids);
    if (error) {
      console.error('[higiene] Falha ao aplicar.', error);
      errEl.innerText = error.message || 'Erro ao aplicar. Tente novamente.';
      errEl.classList.remove('hidden');
      return;
    }

    if (ehPerdido) {
      // O trigger do banco loga a mudança de status na timeline de cada um.
      state.clientes.forEach((c) => {
        if (!ids.includes(c.id)) return;
        c.status = 'PERDIDO';
        c.perdido_motivo = 'SEM RETORNO';
        c.proxima_acao_em = null;
        c.proxima_acao_nota = null;
      });
    } else {
      state.clientes = state.clientes.filter((c) => !ids.includes(c.id));
    }

    closeHigieneModal();
    showToast(ehPerdido ? `${ids.length} MARCADOS COMO PERDIDO` : `${ids.length} ARQUIVADOS`);
    renderContent();
  }, ehPerdido ? 'MARCAR PERDIDO' : 'ARQUIVAR', ehPerdido);
}

// Fluxo: lista grupos por telefone → escolhe o cadastro primário → (grupos de 2)
// escolhe campo a campo o valor final → confirma → rpc merge_clientes.
// Nada roda automático e o registro perdedor fica arquivado (reversível).
let _crmDupGrupos = [];
let _crmDupAberto = null;      // índice do grupo expandido
let _crmDupPrimario = null;    // id escolhido como primário
let _crmDupOverrides = {};     // campo -> valor escolhido do perdedor

const CRM_DUP_CAMPOS = [
  ['nome', 'Nome'], ['cidade', 'Cidade'], ['email', 'E-mail'],
  ['documento', 'CPF/CNPJ'], ['endereco', 'Endereço'], ['observacoes', 'Observações'],
];

function ensureCrmDupContainer() {
  let overlay = document.getElementById('crm-dup-overlay');
  if (overlay) return overlay;
  overlay = document.createElement('div');
  overlay.id = 'crm-dup-overlay';
  overlay.className = 'fixed inset-0 z-[91] hidden bg-black/95 backdrop-blur-md overflow-y-auto';
  document.body.appendChild(overlay);
  return overlay;
}

async function openCrmDuplicatas() {
  if (!state.isAdmin) { showToast('Apenas administradores.'); return; }

  ensureCrmDupContainer().classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  _crmDupGrupos = [];
  _crmDupAberto = null;
  renderCrmDuplicatas(true);

  const { data, error } = await supabaseClient.rpc('find_clientes_duplicados');
  if (error) {
    console.error('[crm] find_clientes_duplicados falhou.', error);
    showToast('Erro ao buscar duplicatas.');
    closeCrmDuplicatas();
    return;
  }

  _crmDupGrupos = Array.isArray(data) ? data : [];
  renderCrmDuplicatas(false);
}

function closeCrmDuplicatas() {
  const overlay = document.getElementById('crm-dup-overlay');
  if (overlay) overlay.classList.add('hidden');
  document.body.style.overflow = '';
}

function crmDupToggleGrupo(idx) {
  if (_crmDupAberto === idx) {
    _crmDupAberto = null;
  } else {
    _crmDupAberto = idx;
    const grupo = _crmDupGrupos[idx];
    const clientes = (grupo && grupo.clientes) || [];
    // Default de primário: mais vínculos (propostas+vendas+O&M), depois o mais antigo
    const score = (c) => (c.n_propostas || 0) + (c.n_vendas || 0) * 2 + (c.tem_om ? 3 : 0);
    const sorted = [...clientes].sort((a, b) => score(b) - score(a) || new Date(a.created_at) - new Date(b.created_at));
    _crmDupPrimario = sorted[0] ? sorted[0].id : null;
    _crmDupOverrides = {};
  }
  renderCrmDuplicatas(false);
}

function crmDupSetPrimario(id) {
  _crmDupPrimario = id;
  _crmDupOverrides = {};
  renderCrmDuplicatas(false);
}

function crmDupSetOverride(campo, valor, usar) {
  if (usar) _crmDupOverrides[campo] = valor;
  else delete _crmDupOverrides[campo];
  // sem re-render: o radio já reflete o estado
}

function renderCrmDuplicatas(loading) {
  const overlay = ensureCrmDupContainer();

  const corpo = loading
    ? `<div class="py-20 text-center"><i data-lucide="loader-2" class="w-10 h-10 mx-auto mb-3 text-orange-500 animate-spin"></i><p class="text-neutral-500 font-bold uppercase tracking-widest text-xs">Procurando duplicatas...</p></div>`
    : (_crmDupGrupos.length === 0
      ? `<div class="py-20 text-center border border-dashed border-neutral-800/60"><i data-lucide="check-circle-2" class="w-10 h-10 mx-auto mb-3 text-green-500"></i><p class="text-neutral-400 font-bold uppercase tracking-widest text-xs">Nenhuma duplicata pendente!</p></div>`
      : _crmDupGrupos.map((grupo, idx) => renderCrmDupGrupo(grupo, idx)).join(''));

  overlay.innerHTML = `
    <div class="min-h-full flex items-start justify-center p-3 md:p-6">
      <div class="bg-[#0a0a0a] border-2 border-purple-600/40 w-full max-w-4xl shadow-[0_0_60px_rgba(147,51,234,0.15)] animate-fade-in-up mb-10">
        <div class="flex justify-between items-center p-5 md:p-6 border-b border-neutral-800 bg-black/60">
          <div>
            <p class="text-purple-400 text-[10px] font-black uppercase tracking-[0.3em] mb-1 flex items-center gap-2"><i data-lucide="merge" class="w-3.5 h-3.5"></i> LIMPEZA DE DUPLICATAS</p>
            <h2 class="text-xl md:text-2xl font-black text-white uppercase tracking-tighter">${loading ? '...' : _crmDupGrupos.length} grupo${_crmDupGrupos.length === 1 ? '' : 's'} com mesmo telefone</h2>
            <p class="text-neutral-600 text-[10px] font-bold uppercase tracking-widest mt-1">A mesclagem re-aponta propostas, vendas e O&M — o cadastro perdedor fica arquivado (nada é apagado)</p>
          </div>
          <button onclick="closeCrmDuplicatas()" class="text-neutral-500 hover:text-red-500 transition-colors"><i data-lucide="x" class="w-7 h-7"></i></button>
        </div>
        <div class="p-4 md:p-6 space-y-3">${corpo}</div>
      </div>
    </div>`;

  lucide.createIcons();
}

function renderCrmDupGrupo(grupo, idx) {
  const clientes = grupo.clientes || [];
  const aberto = _crmDupAberto === idx;

  const resumo = `
    <button onclick="crmDupToggleGrupo(${idx})" class="w-full flex items-center gap-3 p-4 text-left hover:bg-neutral-900/50 transition-colors">
      <i data-lucide="${aberto ? 'chevron-down' : 'chevron-right'}" class="w-4 h-4 text-neutral-600 shrink-0"></i>
      <span class="font-mono text-orange-400 font-black text-sm shrink-0">${escapeHTML(grupo.tel || '')}</span>
      <span class="flex-1 text-neutral-400 text-[11px] font-bold uppercase truncate">${clientes.map((c) => escapeHTML(c.nome || '?')).join(' · ')}</span>
      <span class="text-[9px] font-black text-purple-400 shrink-0">${grupo.qtd} CADASTROS</span>
    </button>`;

  if (!aberto) {
    return `<div class="border border-neutral-800 bg-black/40">${resumo}</div>`;
  }

  const perdedores = clientes.filter((c) => c.id !== _crmDupPrimario);
  const primario = clientes.find((c) => c.id === _crmDupPrimario) || clientes[0];
  const doisClientes = clientes.length === 2;
  const perdedor = doisClientes ? perdedores[0] : null;

  // Comparação campo a campo (só para grupos de 2, quando os valores divergem)
  let comparacao = '';
  if (doisClientes && perdedor) {
    const linhas = CRM_DUP_CAMPOS
      .filter(([campo]) => {
        const a = String(primario[campo] || '').trim();
        const b = String(perdedor[campo] || '').trim();
        return a && b && a.toUpperCase() !== b.toUpperCase();
      })
      .map(([campo, label]) => `
        <div class="grid grid-cols-[90px_1fr_1fr] gap-2 items-center text-[10px] border-b border-neutral-900 py-2">
          <span class="text-neutral-500 font-black uppercase tracking-widest text-[8px]">${label}</span>
          <label class="flex items-center gap-1.5 cursor-pointer text-neutral-300">
            <input type="radio" name="dup-campo-${campo}" checked onchange="crmDupSetOverride('${campo}', null, false)" class="accent-orange-500">
            <span class="truncate">${escapeHTML(String(primario[campo]))}</span>
          </label>
          <label class="flex items-center gap-1.5 cursor-pointer text-neutral-300">
            <input type="radio" name="dup-campo-${campo}" onchange="crmDupSetOverride('${campo}', this.dataset.valor, true)" data-valor="${escapeHTML(String(perdedor[campo]))}" class="accent-purple-500">
            <span class="truncate">${escapeHTML(String(perdedor[campo]))}</span>
          </label>
        </div>`).join('');

    if (linhas) {
      comparacao = `
        <div class="mt-3 border border-neutral-800 bg-black/60 p-3">
          <p class="text-[8px] text-neutral-500 font-black uppercase tracking-widest mb-1">Campos divergentes — escolha o valor que fica</p>
          <div class="grid grid-cols-[90px_1fr_1fr] gap-2 text-[8px] text-neutral-600 font-black uppercase tracking-widest border-b border-neutral-800 pb-1">
            <span></span><span>← Primário</span><span>Duplicado →</span>
          </div>
          ${linhas}
        </div>`;
    }
  }

  return `
    <div class="border border-purple-800/40 bg-black/40">
      ${resumo}
      <div class="px-4 pb-4 space-y-3">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
          ${clientes.map((c) => {
            const isPrim = c.id === _crmDupPrimario;
            return `
              <label class="border ${isPrim ? 'border-purple-500 bg-purple-500/5' : 'border-neutral-800 bg-black/40'} p-3.5 cursor-pointer transition-all block">
                <div class="flex items-center gap-2 mb-1.5">
                  <input type="radio" name="dup-primario-${idx}" ${isPrim ? 'checked' : ''} onchange="crmDupSetPrimario('${c.id}')" class="accent-purple-500">
                  <span class="text-white font-black text-xs uppercase truncate flex-1">${escapeHTML(c.nome || '?')}</span>
                  ${isPrim ? '<span class="text-[8px] px-1.5 py-0.5 font-black uppercase tracking-widest bg-purple-600 text-white shrink-0">PRIMÁRIO</span>' : ''}
                </div>
                <p class="text-neutral-500 text-[10px] font-mono">${escapeHTML(c.cidade || 'sem cidade')} · ${escapeHTML(String(c.status || '-'))}</p>
                <p class="text-neutral-600 text-[9px] font-mono mt-0.5">${escapeHTML(String(c.vendedor_email || '').split('@')[0])} · cadastrado ${formatDate(c.created_at)}</p>
                <p class="text-[9px] font-mono mt-1">
                  <span class="${c.n_propostas > 0 ? 'text-yellow-500' : 'text-neutral-700'}">${c.n_propostas || 0} propostas</span> ·
                  <span class="${c.n_vendas > 0 ? 'text-green-500' : 'text-neutral-700'}">${c.n_vendas || 0} vendas</span>
                  ${c.tem_om ? ' · <span class="text-blue-400">O&M</span>' : ''}
                </p>
              </label>`;
          }).join('')}
        </div>

        ${comparacao}
        ${!doisClientes ? '<p class="text-[9px] text-neutral-500 font-bold uppercase tracking-widest">Grupo com 3+ cadastros: os dados faltantes do primário são completados automaticamente com os dos duplicados.</p>' : ''}

        <div class="flex gap-2 flex-wrap pt-1">
          <button onclick="crmExecutarMerge(${idx})" class="flex items-center gap-2 bg-purple-600 hover:bg-purple-500 text-white px-4 py-2.5 font-black uppercase tracking-wider text-[10px] transition-all">
            <i data-lucide="merge" class="w-3.5 h-3.5"></i> Mesclar ${perdedores.length > 1 ? `${perdedores.length} duplicados` : 'duplicado'} no primário
          </button>
          <button onclick="crmMarcarNaoDuplicata('${escapeHTML(grupo.tel || '')}')" class="flex items-center gap-2 bg-neutral-900 border border-neutral-700 hover:border-green-500 hover:text-green-400 text-neutral-400 px-4 py-2.5 font-black uppercase tracking-wider text-[10px] transition-all">
            <i data-lucide="user-check" class="w-3.5 h-3.5"></i> Não é duplicata
          </button>
        </div>
      </div>
    </div>`;
}

async function crmExecutarMerge(idx) {
  const grupo = _crmDupGrupos[idx];
  if (!grupo || !_crmDupPrimario) return;

  const clientes = grupo.clientes || [];
  const primario = clientes.find((c) => c.id === _crmDupPrimario);
  const perdedores = clientes.filter((c) => c.id !== _crmDupPrimario);
  if (!primario || perdedores.length === 0) return;

  const overrides = { ..._crmDupOverrides };

  showConfirmModal(
    `Mesclar ${perdedores.length} cadastro(s) em "${primario.nome}"? Todas as propostas, vendas e dados de O&M passam para o cadastro primário. Os duplicados ficam arquivados.`,
    async () => {
      let ok = 0;
      for (const perdedor of perdedores) {
        const { error } = await supabaseClient.rpc('merge_clientes', {
          p_primario: _crmDupPrimario,
          p_perdedor: perdedor.id,
          p_overrides: overrides,
        });
        if (error) {
          console.error('[crm] merge_clientes falhou.', error);
          showToast(`Erro ao mesclar ${perdedor.nome}: ${error.message}`);
          break;
        }
        ok++;
      }

      if (ok > 0) {
        showToast(`${ok} cadastro(s) mesclado(s)!`);
        _crmDupGrupos.splice(idx, 1);
        _crmDupAberto = null;
        renderCrmDuplicatas(false);
        await fetchClientes();
        await fetchPropostas();
        await fetchVendas();
        renderContent();
      }
    },
    'MESCLAR',
    false
  );
}

async function crmMarcarNaoDuplicata(tel) {
  const digits = String(tel || '').replace(/\D/g, '');
  if (!digits) return;

  const { error } = await supabaseClient.from('clientes_nao_duplicados').insert([{
    tel_digits: digits,
    dismissed_por: (state.currentUser && state.currentUser.email) || 'admin',
  }]);

  if (error && error.code !== '23505') {
    console.error('[crm] Falha ao marcar não-duplicata.', error);
    showToast('Erro ao salvar.');
    return;
  }

  _crmDupGrupos = _crmDupGrupos.filter((g) => String(g.tel || '').replace(/\D/g, '') !== digits);
  _crmDupAberto = null;
  showToast('Grupo marcado como "não é duplicata".');
  renderCrmDuplicatas(false);
}
