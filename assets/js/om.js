// ==========================================
// MÓDULO O&M (OPERAÇÃO & MANUTENÇÃO)
// Estrutura originalmente prototipada com dados mockados.
// O fluxo principal já usa Supabase; os arrays abaixo permanecem apenas como
// fallback legado para telas antigas, nunca como fonte visual da Central.
// ==========================================

// --- Mock data ----------------------------------------------------------
const OM_MOCK = {
  kpis: {
    atendimentosAbertos: { val: '—', sub: '—', pct: 0 },
    osEmCampo:           { val: '—', sub: '—', pct: 0 },
    tecnicosAtivos:      { val: '—', sub: '—', pct: 0 },
    slaMedio:            { val: '—', sub: '—', pct: 0 },
  },
  weeklyActivity: [
    { day: 'Segunda', dayShort: 'S', abertas: 2, agendadas: 3, concluidas: 4 },
    { day: 'Terça',   dayShort: 'T', abertas: 1, agendadas: 2, concluidas: 5 },
    { day: 'Quarta',  dayShort: 'Q', abertas: 3, agendadas: 1, concluidas: 6 },
    { day: 'Quinta',  dayShort: 'Q', abertas: 0, agendadas: 4, concluidas: 3 },
    { day: 'Sexta',   dayShort: 'S', abertas: 2, agendadas: 2, concluidas: 5 },
    { day: 'Sábado',  dayShort: 'S', abertas: 1, agendadas: 1, concluidas: 2 },
    { day: 'Domingo', dayShort: 'D', abertas: 0, agendadas: 0, concluidas: 1 },
  ],
};

// Bases de mock (mutáveis em memória)
let omClients = [
  { id: 'c-001', nome: 'Mercado Dourado Ltda.',  origem: 'CRM',           telefone: '(35) 98801-1100', cidade: 'Varginha/MG',  endereco: 'Av. Rio Branco, 1200',     franquia: 'Varginha',   responsavel: 'Carlos Eduardo',   status: 'Ativo',         ultimoAtend: '12/05/2026' },
  { id: 'c-002', nome: 'Residencial Vila Verde', origem: 'Manual',        telefone: '(18) 99800-2233', cidade: 'Araçatuba/SP', endereco: 'Rua das Palmeiras, 88',    franquia: 'Araçatuba',  responsavel: 'João Silva',       status: 'Em atendimento', ultimoAtend: '14/05/2026' },
  { id: 'c-003', nome: 'Indústria Alfa',         origem: 'Proposta',      telefone: '(15) 99710-4567', cidade: 'Sorocaba/SP',  endereco: 'Distrito Industrial, Q3',  franquia: 'Sorocaba',   responsavel: 'Maria Souza',      status: 'Ativo',         ultimoAtend: '02/05/2026' },
  { id: 'c-004', nome: 'Sítio Boa Vista',        origem: 'Cliente antigo',telefone: '(18) 99654-7710', cidade: 'Birigui/SP',   endereco: 'Estrada do Café, km 4',    franquia: 'Birigui',    responsavel: '—',                status: 'Ativo',         ultimoAtend: '—' },
  { id: 'c-005', nome: 'Fazenda São João',       origem: 'CRM',           telefone: '(35) 99877-3322', cidade: 'Três Corações/MG', endereco: 'Rod. MG-167, km 12',   franquia: 'Varginha',   responsavel: 'Carlos Eduardo',   status: 'Em atendimento', ultimoAtend: '15/05/2026' },
  { id: 'c-006', nome: 'Posto Trevo do Sul',     origem: 'Manual',        telefone: '(35) 98410-5500', cidade: 'Pouso Alegre/MG', endereco: 'BR-381, km 855',        franquia: 'Pouso Alegre',responsavel: 'João Silva',      status: 'Inativo',       ultimoAtend: '03/03/2026' },
];

let omServiceOrders = [
  { id: 'OS-2026-0421', clienteId: 'c-001', cliente: 'Mercado Dourado Ltda.',  servico: 'Limpeza + inspeção',     tecnico: 'João Silva',     data: '16/05/2026 08:00', cidade: 'Varginha/MG',  status: 'Agendada',       statusTone: 'yellow', endereco: 'Av. Rio Branco, 1200 — Varginha/MG',     sistema: { potencia: '32,4 kWp', modulos: '60 × 540W', telhado: 'Metálico', inversor: 'Growatt 30kW' }, acesso: 'Portão lateral; entrar pelo estacionamento.', proposalId: null,    proposalNumber: null },
  { id: 'OS-2026-0422', clienteId: 'c-002', cliente: 'Residencial Vila Verde', servico: 'Vistoria técnica',        tecnico: 'Marcos Lima',    data: '16/05/2026 09:30', cidade: 'Araçatuba/SP', status: 'Em execução',    statusTone: 'blue',   endereco: 'Rua das Palmeiras, 88 — Araçatuba/SP',   sistema: { potencia: '8,2 kWp',  modulos: '16 × 540W', telhado: 'Cerâmico',  inversor: 'Deye 8kW' },    acesso: 'Falar com o zelador no portão 2.',            proposalId: 'pr-002', proposalNumber: 'PROP-O&M-002' },
  { id: 'OS-2026-0423', clienteId: 'c-003', cliente: 'Indústria Alfa',         servico: 'Manutenção preventiva',   tecnico: 'Carlos Eduardo', data: '16/05/2026 14:00', cidade: 'Sorocaba/SP',  status: 'Aguardando aprovação extra', statusTone: 'orange', endereco: 'Distrito Industrial, Q3 — Sorocaba/SP',  sistema: { potencia: '120 kWp',  modulos: '220 × 545W',telhado: 'Metálico',  inversor: 'Sungrow 110kW' }, acesso: 'Liberação na portaria. EPI obrigatório.',     proposalId: null,    proposalNumber: null },
  { id: 'OS-2026-0420', clienteId: 'c-005', cliente: 'Fazenda São João',       servico: 'Troca de string box',     tecnico: 'João Silva',     data: '15/05/2026 11:00', cidade: 'Três Corações/MG', status: 'Concluída',  statusTone: 'emerald', endereco: 'Rod. MG-167, km 12',                     sistema: { potencia: '15 kWp',   modulos: '28 × 540W', telhado: 'Solo',      inversor: 'Growatt 15kW' }, acesso: 'Entrar pelo segundo portão.',                 proposalId: 'pr-005', proposalNumber: 'PROP-O&M-005' },
];

let omPendingIssues = [
  { id: 'p-501', clienteId: 'c-005', cliente: 'Fazenda São João',       descricao: 'Cabo CC exposto na calha',     criticidade: 'Crítica', origemOs: 'OS-2026-0420', status: 'Aberta',          responsavel: 'João Silva',     generatedProposalId: null     },
  { id: 'p-502', clienteId: 'c-001', cliente: 'Mercado Dourado Ltda.',  descricao: 'DPS ausente no quadro CA',     criticidade: 'Crítica', origemOs: 'OS-2026-0421', status: 'Em análise',      responsavel: 'João Silva',     generatedProposalId: null     },
  { id: 'p-503', clienteId: 'c-002', cliente: 'Residencial Vila Verde', descricao: 'Conector MC4 danificado',      criticidade: 'Alta',    origemOs: 'OS-2026-0422', status: 'Proposta gerada', responsavel: 'Marcos Lima',    generatedProposalId: 'pr-004' },
  { id: 'p-504', clienteId: 'c-003', cliente: 'Indústria Alfa',         descricao: 'Sombreamento parcial à tarde', criticidade: 'Média',   origemOs: 'OS-2026-0423', status: 'Aberta',          responsavel: 'Carlos Eduardo', generatedProposalId: null     },
  { id: 'p-505', clienteId: 'c-006', cliente: 'Posto Trevo do Sul',     descricao: 'Estrutura oxidada (suportes)', criticidade: 'Média',   origemOs: '—',            status: 'Aberta',          responsavel: '—',              generatedProposalId: null     },
];

let omReports = [
  { id: 'r-301', os: 'OS-2026-0420', clienteId: 'c-005', cliente: 'Fazenda São João',       tecnico: 'João Silva',     data: '15/05/2026', estado: 'Atenção', envio: 'Enviado', recomendacoes: 'Substituir string box danificado e revisar aterramento.', pendencias: ['Cabo CC exposto na calha'] },
  { id: 'r-302', os: 'OS-2026-0419', clienteId: 'c-003', cliente: 'Indústria Alfa',         tecnico: 'Carlos Eduardo', data: '10/05/2026', estado: 'Bom',     envio: 'Enviado', recomendacoes: 'Manutenção dentro do esperado. Próxima limpeza em 6 meses.', pendencias: [] },
  { id: 'r-303', os: 'OS-2026-0418', clienteId: 'c-002', cliente: 'Residencial Vila Verde', tecnico: 'Marcos Lima',    data: '08/05/2026', estado: 'Crítico', envio: 'Pronto',  recomendacoes: 'Trocar conectores MC4 e reisolar string 2 imediatamente.', pendencias: ['Conector MC4 danificado'] },
  { id: 'r-304', os: '—',            clienteId: 'c-001', cliente: 'Mercado Dourado Ltda.',  tecnico: 'João Silva',     data: '06/05/2026', estado: 'Bom',     envio: 'Rascunho', recomendacoes: 'Aguardando fotos depois para fechar relatório.', pendencias: [] },
];

// --- Helpers ------------------------------------------------------------
function _omSaudacao() {
  const h = new Date().getHours();
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}
function _omFormatHora(d = new Date()) {
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
function _omFormatDataExtensa(d = new Date()) {
  const wd = ['DOMINGO','SEGUNDA-FEIRA','TERÇA-FEIRA','QUARTA-FEIRA','QUINTA-FEIRA','SEXTA-FEIRA','SÁBADO'];
  const mn = ['JANEIRO','FEVEREIRO','MARÇO','ABRIL','MAIO','JUNHO','JULHO','AGOSTO','SETEMBRO','OUTUBRO','NOVEMBRO','DEZEMBRO'];
  return `${wd[d.getDay()]}, ${d.getDate()} DE ${mn[d.getMonth()]}`;
}

let _omClockInterval = null;
function startOmClock() {
  if (_omClockInterval) clearInterval(_omClockInterval);
  const tick = () => {
    const el = document.getElementById('om-central-clock');
    if (!el) { clearInterval(_omClockInterval); _omClockInterval = null; return; }
    el.textContent = _omFormatHora();
  };
  tick();
  _omClockInterval = setInterval(tick, 1000);
}
function stopOmClock() {
  if (_omClockInterval) { clearInterval(_omClockInterval); _omClockInterval = null; }
}

// --- Tones --------------------------------------------------------------
const OM_CHIP_TONES = {
  emerald: 'bg-blue-500/10 text-blue-300 border-blue-500/30',
  red:     'bg-red-500/10 text-red-400 border-red-500/30',
  orange:  'bg-orange-500/10 text-orange-300 border-orange-500/30',
  yellow:  'bg-yellow-500/10 text-yellow-300 border-yellow-500/30',
  blue:    'bg-blue-500/10 text-blue-300 border-blue-500/30',
  gray:    'bg-neutral-800 text-neutral-300 border-neutral-700',
};
function omChip(text, tone = 'gray', withDot = true) {
  const cls = OM_CHIP_TONES[tone] || OM_CHIP_TONES.gray;
  const dot = withDot ? `<span class="w-1.5 h-1.5 rounded-full bg-current opacity-80"></span>` : '';
  return `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 border text-[10px] font-black uppercase tracking-widest ${cls}">${dot}${text}</span>`;
}

// Mapas para chip tones por campo
const OM_ORIGEM_TONE   = { 'CRM': 'blue', 'Proposta': 'emerald', 'Manual': 'yellow', 'Cliente antigo': 'gray' };
const OM_STATUS_CLIENT = { 'Ativo': 'emerald', 'Em atendimento': 'blue', 'Inativo': 'gray' };
const OM_CRIT_TONE = { 'Baixa':'gray','Média':'yellow','Alta':'orange','Crítica':'red' };
const OM_ESTADO_TONE = { 'Bom':'emerald','Atenção':'orange','Crítico':'red' };
const OM_PROP_STATUS_TONE = {
  'Rascunho':'gray','Enviada':'blue','Visualizada':'yellow','Aprovada':'emerald',
  'Recusada':'red','Vencida':'orange','Cancelada':'gray'
};

function omFormatBRL(v) {
  if (v == null || isNaN(v)) return '—';
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// --- KPI card -----------------------------------------------------------
function omKpiCard({ label, value, sub, icon, iconTint, valueColor, barColor, barPct, barLabel, valueLabel }) {
  return `
    <div class="bg-neutral-900/60 border border-neutral-800 p-5 relative overflow-hidden">
      <div class="flex items-center justify-between mb-4">
        <span class="text-[10px] font-black uppercase tracking-widest text-neutral-500">${label}</span>
        <div class="w-9 h-9 flex items-center justify-center ${iconTint}">
          <i data-lucide="${icon}" class="w-4 h-4"></i>
        </div>
      </div>
      <div class="text-4xl font-black tracking-tight leading-none ${valueColor || 'text-white'}">${value}</div>
      <div class="text-[10px] font-bold uppercase tracking-widest text-neutral-600 mt-2.5">${sub}</div>
      <div class="flex items-center justify-between mt-3 text-[10px] font-bold uppercase tracking-widest text-neutral-500">
        <span>${barLabel}</span>
        <span class="${valueLabel?.color || ''}">${valueLabel?.text || ''}</span>
      </div>
      <div class="h-[2px] bg-neutral-800 mt-1.5 overflow-hidden">
        <div class="h-full ${barColor}" style="width: ${barPct}%;"></div>
      </div>
    </div>
  `;
}

// --- Hero / Banner ------------------------------------------------------
function omHeroBanner({ name, subtitle, badgeText, badgeIcon }) {
  return `
    <section class="relative overflow-hidden bg-gradient-to-b from-neutral-900 to-[#0d0d0d] border border-neutral-800 p-7 md:p-8 mb-5">
      <div class="absolute inset-0 pointer-events-none"
        style="background:
          radial-gradient(600px 220px at 92% 30%, rgba(59,130,246,.10), transparent 60%),
          radial-gradient(600px 240px at 8% 100%, rgba(6,182,212,.06), transparent 60%);"></div>
      <div class="relative flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
        <div class="flex-1 min-w-0">
          <div class="text-[10px] font-bold uppercase tracking-[0.18em] text-neutral-500">${_omFormatDataExtensa()}</div>
          <h1 class="text-3xl md:text-4xl font-black tracking-tight mt-2 mb-2">${_omSaudacao()}, <span class="text-blue-400">${name}.</span></h1>
          <div class="text-neutral-400 text-sm mb-4">${subtitle}</div>
          ${badgeText ? `
            <button class="inline-flex items-center gap-2 px-5 py-3 bg-gradient-to-b from-blue-400 to-blue-600 text-blue-950 font-black text-xs uppercase tracking-widest shadow-[0_8px_24px_-10px_rgba(59,130,246,0.6)]">
              <i data-lucide="${badgeIcon}" class="w-4 h-4 stroke-[3px]"></i>${badgeText}
            </button>
          ` : ''}
        </div>
        <div class="text-right">
          <div id="om-central-clock" class="font-black text-5xl md:text-6xl tracking-tighter leading-none" style="font-variant-numeric: tabular-nums;">${_omFormatHora()}</div>
          <div class="text-[10px] font-bold uppercase tracking-[0.18em] text-neutral-500 mt-2">Horário local</div>
        </div>
      </div>
    </section>
  `;
}

// Cabeçalho padrão para rotas internas
function omPageHeader({ icon, title, subtitle, actions = '' }) {
  return `
    <section class="relative overflow-hidden bg-gradient-to-b from-neutral-900 to-[#0d0d0d] border border-neutral-800 p-6 md:p-7 mb-5">
      <div class="absolute inset-0 pointer-events-none"
        style="background: radial-gradient(600px 220px at 92% 30%, rgba(59,130,246,.10), transparent 60%);"></div>
      <div class="relative flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div class="flex items-start gap-4 min-w-0">
          <div class="w-11 h-11 bg-blue-500/10 text-blue-400 grid place-items-center border border-blue-500/20 shrink-0">
            <i data-lucide="${icon}" class="w-5 h-5"></i>
          </div>
          <div class="min-w-0">
            <div class="text-[10px] font-bold uppercase tracking-[0.18em] text-blue-400/80">O&amp;M · Operação &amp; Manutenção</div>
            <h1 class="text-2xl md:text-3xl font-black tracking-tight mt-1">${title}</h1>
            <div class="text-neutral-400 text-sm mt-1.5 max-w-2xl">${subtitle}</div>
          </div>
        </div>
        ${actions ? `<div class="flex items-center gap-2 flex-wrap">${actions}</div>` : ''}
      </div>
    </section>
  `;
}

function omBtnPrimary(label, icon, onclick) {
  return `<button onclick="${onclick}" class="px-4 py-2.5 bg-blue-500 hover:bg-blue-400 text-blue-950 font-black text-[10px] uppercase tracking-widest inline-flex items-center gap-2"><i data-lucide="${icon}" class="w-3.5 h-3.5 stroke-[3]"></i>${label}</button>`;
}
function omBtnGhost(label, icon, onclick) {
  return `<button onclick="${onclick}" class="px-4 py-2.5 bg-neutral-900 border border-neutral-800 hover:border-neutral-700 text-white font-black text-[10px] uppercase tracking-widest inline-flex items-center gap-2"><i data-lucide="${icon}" class="w-3.5 h-3.5"></i>${label}</button>`;
}

// --- Modal helper -------------------------------------------------------
function omOpenModal({ title, subtitle, icon = 'circle', bodyHTML, footerHTML, size = 'md' }) {
  omCloseModal();
  const maxW = size === 'lg' ? 'max-w-3xl' : size === 'sm' ? 'max-w-md' : 'max-w-xl';
  const wrap = document.createElement('div');
  wrap.id = 'om-modal-root';
  wrap.className = 'fixed inset-0 z-[200] flex items-end md:items-center justify-center bg-black/70 backdrop-blur-sm';
  wrap.innerHTML = `
    <div class="bg-[#0d0d0d] border border-neutral-800 w-full ${maxW} max-h-[92vh] overflow-hidden flex flex-col animate-fade-in-up">
      <div class="flex items-center justify-between px-5 py-4 border-b border-neutral-800">
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-9 h-9 bg-blue-500/10 text-blue-400 grid place-items-center"><i data-lucide="${icon}" class="w-4 h-4"></i></div>
          <div class="min-w-0">
            <div class="text-sm font-black text-white truncate">${title}</div>
            ${subtitle ? `<div class="text-[11px] text-neutral-500 truncate">${subtitle}</div>` : ''}
          </div>
        </div>
        <button onclick="omCloseModal()" class="w-8 h-8 grid place-items-center text-neutral-500 hover:text-white"><i data-lucide="x" class="w-4 h-4"></i></button>
      </div>
      <div class="px-5 py-5 overflow-y-auto">${bodyHTML}</div>
      ${footerHTML ? `<div class="flex items-center justify-end gap-2 px-5 py-4 border-t border-neutral-800 bg-neutral-950/60">${footerHTML}</div>` : ''}
    </div>
  `;
  // Não fecha ao clicar fora (clique-arrastado fechava sem querer) — usar o X ou Cancelar.
  document.body.appendChild(wrap);
  queueAppLucideCreateIcons();
}
function omCloseModal() {
  const el = document.getElementById('om-modal-root');
  if (el) el.remove();
}

// Campos
function omField(label, inputHTML) {
  return `<label class="block mb-3"><span class="block text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-1.5">${label}</span>${inputHTML}</label>`;
}
const OM_INPUT_CLS = 'w-full bg-neutral-950 border border-neutral-800 focus:border-blue-500/60 outline-none px-3 py-2.5 text-sm text-white';

// --- Pipeline -----------------------------------------------------------
function omPipelineHTML(stages) {
  const COLORS = {
    red:     { fg: 'text-red-400',     bar: 'bg-red-500' },
    yellow:  { fg: 'text-yellow-400',  bar: 'bg-yellow-500' },
    blue:    { fg: 'text-blue-400',    bar: 'bg-gradient-to-r from-blue-500 to-blue-400' },
    emerald: { fg: 'text-blue-400', bar: 'bg-gradient-to-r from-blue-600 to-blue-400' },
  };
  return stages.map(s => {
    const c = COLORS[s.color] || COLORS.emerald;
    return `
      <div>
        <div class="flex items-baseline justify-between text-[10px] font-black uppercase tracking-widest">
          <span class="${c.fg}">${s.label}</span>
          <span class="text-neutral-500">${s.pct}%</span>
        </div>
        <div class="h-[3px] bg-neutral-800 my-2 overflow-hidden">
          <div class="h-full ${c.bar}" style="width: ${s.pct}%;"></div>
        </div>
        <div class="text-3xl md:text-4xl font-black tracking-tight ${s.color === 'emerald' ? 'text-blue-400' : 'text-white'}">${s.num}</div>
        <div class="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mt-2">${s.sub}</div>
      </div>
    `;
  }).join('');
}

// --- Timeline -----------------------------------------------------------
function omTimelineHTML(items) {
  const TONE = {
    red:     'border-red-500',
    orange:  'border-orange-500',
    blue:    'border-blue-500',
    neutral: 'border-blue-500',
    gray:    'border-neutral-600',
  };
  return `
    <div class="relative pl-7">
      <div class="absolute left-2.5 top-1.5 bottom-1.5 w-px bg-neutral-800"></div>
      ${items.map(e => `
        <div class="relative pb-4 last:pb-0">
          <div class="absolute -left-[18px] top-1 w-3 h-3 rounded-full bg-neutral-900 border-2 ${TONE[e.tone] || TONE.neutral}"></div>
          <div class="text-[10px] uppercase tracking-widest font-bold text-neutral-500">${e.when}</div>
          <div class="text-sm font-bold text-white mt-0.5">${e.what}</div>
          <div class="text-xs text-neutral-400 mt-1">${e.note}</div>
        </div>
      `).join('')}
    </div>
  `;
}

// --- Empty state --------------------------------------------------------
function omEmptyState({ icon = 'inbox', title = 'Nada por aqui', hint = '', actionHTML = '' }) {
  return `
    <div class="bg-neutral-900/40 border-2 border-dashed border-neutral-800 p-10 md:p-14 text-center">
      <div class="inline-flex items-center justify-center w-14 h-14 bg-neutral-900 border border-neutral-800 mb-4 text-neutral-600">
        <i data-lucide="${icon}" class="w-6 h-6"></i>
      </div>
      <h2 class="text-base font-black uppercase tracking-widest text-neutral-300 mb-1.5">${title}</h2>
      ${hint ? `<p class="text-neutral-500 text-sm max-w-md mx-auto mb-4">${hint}</p>` : ''}
      ${actionHTML || ''}
    </div>
  `;
}

// --- Filtros (chips) ----------------------------------------------------
function omFilterChips({ name, options, active, onclick }) {
  return options.map(opt => {
    const isActive = opt.v === active;
    const cls = isActive
      ? 'bg-blue-500 text-blue-950'
      : 'bg-neutral-900 text-neutral-400 hover:text-white border border-neutral-800 hover:border-neutral-700';
    return `<button onclick="${onclick}('${opt.v.replace(/'/g, "\\'")}')" data-filter="${name}" class="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest ${cls}">${opt.l}</button>`;
  }).join('');
}

// =======================================================================
// CENTRAL — helpers visuais do redesign (card de destaque, contornos, pills)
// O acento (laranja no dark / azul no light) vem das classes .om-* (main.css).
// =======================================================================
function _omFormatDataCurta(d = new Date()) {
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase().replace('.', '');
}

// Linhas de contorno topográficas + pontilhado no canto dos cards de destaque.
function omContourDecor() {
  let rings = '';
  for (let r = 36; r <= 300; r += 22) rings += `<circle cx="300" cy="300" r="${r}"/>`;
  return `
    <svg class="om-contour absolute bottom-0 right-0 w-64 h-64 pointer-events-none" viewBox="0 0 300 300" fill="none" stroke-width="1.5">${rings}</svg>
    <div class="om-contour-dots absolute bottom-0 right-0 w-44 h-28 pointer-events-none opacity-60" style="background-size: 9px 9px; -webkit-mask-image: radial-gradient(ellipse at 100% 100%, black, transparent 70%); mask-image: radial-gradient(ellipse at 100% 100%, black, transparent 70%);"></div>`;
}

// Pills de status da Central (esmeralda = sucesso/disponível — semântico, não é acento).
const OM_CENTRAL_PILL = {
  emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25',
  red:     'bg-red-500/10 text-red-400 border-red-500/25',
  orange:  'bg-orange-500/10 text-orange-400 border-orange-500/25',
  yellow:  'bg-yellow-500/10 text-yellow-400 border-yellow-500/25',
  gray:    'bg-neutral-800/80 text-neutral-400 border-neutral-700',
};
function omCPill(text, tone = 'gray') {
  const cls = OM_CENTRAL_PILL[tone] || OM_CENTRAL_PILL.gray;
  return `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 border text-[9px] font-black uppercase tracking-widest ${cls}"><span class="w-1 h-1 bg-current"></span>${text}</span>`;
}
const OM_TEC_STATUS_TONE_C = { 'Disponível':'emerald','Em atendimento':'yellow','Em execução':'emerald','Em deslocamento':'orange' };
const OM_OS_STATUS_LABEL = { agendada:'Agendada', deslocamento:'Em deslocamento', em_atendimento:'Em atendimento', finalizada:'Concluída', cancelada:'Cancelada' };
const OM_OS_STATUS_TONE  = { agendada:'yellow', deslocamento:'orange', em_atendimento:'blue', finalizada:'emerald', cancelada:'gray' };
const OM_PROP_TIPO_ICON = {
  'Limpeza de módulos':'sparkles','Vistoria técnica':'search-check','Manutenção preventiva':'shield-check',
  'Correção de pendência':'wrench','Manutenção corretiva':'zap',
};

// =======================================================================
// ROTA: CENTRAL
// =======================================================================
function renderOMCentral(container) {
  const userName = state.profile?.nome ? state.profile.nome.split(' ')[0] : 'Carlos';
  const k = OM_MOCK.kpis;
  const gaugePct = 0;
  const circ = 2 * Math.PI * 52;
  const dash = (gaugePct / 100) * circ;

  container.innerHTML = `
    <div class="om-env animate-fade-in-up">

      <!-- Cabeçalho -->
      <div class="flex flex-col lg:flex-row lg:items-end justify-between gap-5 mb-7">
        <div>
          <div class="text-[10px] font-black uppercase tracking-[0.25em] om-acc-strong mb-2">Central · O&amp;M</div>
          <h1 class="text-3xl md:text-[34px] font-black tracking-tight leading-none text-white">${_omSaudacao()}, ${userName}.</h1>
          <div class="text-neutral-500 text-sm mt-2.5 font-medium">${_omFormatDataExtensa()} — planeje, despache e acompanhe a operação.</div>
        </div>
        <div class="flex items-center gap-2.5 shrink-0">
          <button onclick="omOpenCreateClient()" class="px-5 py-3 bg-transparent border border-neutral-700 hover:border-neutral-500 text-white font-black text-[10px] uppercase tracking-widest inline-flex items-center gap-2 transition-colors"><i data-lucide="user-plus" class="w-3.5 h-3.5"></i>Criar cliente O&amp;M</button>
          <button onclick="omOpenCreateProposta()" class="om-acc-solid px-5 py-3 font-black text-[10px] uppercase tracking-widest inline-flex items-center gap-2 transition-colors"><i data-lucide="plus" class="w-3.5 h-3.5 stroke-[3]"></i>Nova proposta O&amp;M</button>
        </div>
      </div>

      <!-- Entrada rápida (busca real de clientes — Supabase) -->
      <div class="bg-[#101012] border border-neutral-800/80 p-4 mb-4">
        <div class="flex flex-col md:flex-row gap-2 items-stretch">
          <div class="relative flex-1">
            <i data-lucide="search" class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-600"></i>
            <input id="om-central-search" type="text" placeholder="Buscar cliente por nome, telefone, CPF/CNPJ ou endereço" class="om-acc-focus w-full bg-neutral-950 border border-neutral-800 outline-none pl-9 pr-3 py-2.5 text-sm text-white" oninput="omCentralSearch(this.value)" />
          </div>
          <button onclick="omCentralSearch(document.getElementById('om-central-search').value)" class="px-5 py-2.5 bg-neutral-900 border border-neutral-800 hover:border-neutral-600 text-white font-black text-[10px] uppercase tracking-widest inline-flex items-center justify-center gap-2 transition-colors"><i data-lucide="search" class="w-3.5 h-3.5"></i>Buscar</button>
        </div>
        <div id="om-central-search-results" class="mt-3"></div>
      </div>

      <!-- KPIs -->
      <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-4">
        <!-- Destaque: Atendimentos Abertos (card profundo temático) -->
        <div class="om-deep relative overflow-hidden p-6">
          ${omContourDecor()}
          <div class="relative">
            <div class="flex items-start justify-between mb-6">
              <div class="flex items-center gap-3 min-w-0">
                <div class="om-deep-icon w-10 h-10 shrink-0 grid place-items-center"><i data-lucide="activity" class="w-4 h-4"></i></div>
                <span class="om-deep-label text-[10px] font-black uppercase tracking-[0.18em]">Atendimentos Abertos</span>
              </div>
              <button onclick="setTab('os')" class="om-deep-label w-9 h-9 shrink-0 grid place-items-center bg-white/5 hover:bg-white/10 transition-colors"><i data-lucide="arrow-up-right" class="w-4 h-4 stroke-[2.5]"></i></button>
            </div>
            <div id="om-kpi-abertas-val" class="text-6xl font-black tracking-tighter leading-none text-white">${k.atendimentosAbertos.val}</div>
            <div id="om-kpi-abertas-sub" class="om-deep-pill inline-flex items-center gap-2 mt-6 px-3 py-2 text-[9px] font-black uppercase tracking-widest"><i data-lucide="alert-triangle" class="w-3 h-3"></i>${k.atendimentosAbertos.sub}</div>
          </div>
        </div>

        ${[
          { label: 'OS em Campo',     icon: 'route',    val: k.osEmCampo.val,      sub: k.osEmCampo.sub,      tab: 'os',         id: 'campo' },
          { label: 'Técnicos Ativos', icon: 'hard-hat', val: k.tecnicosAtivos.val, sub: k.tecnicosAtivos.sub, tab: 'tecnicos',   id: 'tec' },
          { label: 'SLA Médio',       icon: 'timer',    val: k.slaMedio.val,       sub: k.slaMedio.sub,       tab: 'relatorios', id: 'sla' },
        ].map(c => `
          <div class="bg-[#101012] border border-neutral-800/80 p-6">
            <div class="flex items-start justify-between mb-6">
              <div class="flex items-center gap-3 min-w-0">
                <div class="w-10 h-10 shrink-0 bg-neutral-800/70 text-neutral-300 grid place-items-center"><i data-lucide="${c.icon}" class="w-4 h-4"></i></div>
                <span class="text-[10px] font-black uppercase tracking-[0.18em] text-neutral-400">${c.label}</span>
              </div>
              <button onclick="setTab('${c.tab}')" class="w-9 h-9 shrink-0 grid place-items-center border border-neutral-800 hover:border-neutral-600 text-neutral-400 transition-colors"><i data-lucide="arrow-up-right" class="w-4 h-4"></i></button>
            </div>
            <div id="om-kpi-${c.id}-val" class="text-6xl font-black tracking-tighter leading-none text-white">${c.val}</div>
            <div id="om-kpi-${c.id}-sub" class="inline-flex items-center gap-2 mt-6 px-3 py-2 bg-neutral-800/70 text-[9px] font-black uppercase tracking-widest text-neutral-400">${c.sub}</div>
          </div>
        `).join('')}
      </div>

      <!-- Linha 2: atividade + próxima OS + propostas -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-4 mb-4">
        <!-- Atividade da semana -->
        <div class="lg:col-span-6 bg-[#101012] border border-neutral-800/80 p-6">
          <div class="flex items-center justify-between mb-5">
            <h3 class="text-[15px] font-extrabold tracking-tight text-white">Atividade da Semana</h3>
            <button onclick="setTab('relatorios')" class="px-3 py-1.5 border border-neutral-800 hover:border-neutral-600 text-[9px] font-black uppercase tracking-widest text-neutral-400 hover:text-white transition-colors inline-flex items-center gap-1.5">Relatórios<i data-lucide="arrow-up-right" class="w-3 h-3"></i></button>
          </div>
          <div id="om-central-activity-chart" class="grid grid-cols-7 gap-3 items-end h-44">
            ${ ['S','T','Q','Q','S','S','D'].map(s => `
              <div class="flex flex-col items-center h-full justify-end">
                <div class="w-full max-w-[44px] animate-pulse bg-neutral-800" style="height:35%;"></div>
                <span class="text-[9px] text-neutral-600 font-black uppercase mt-3">${s}</span>
              </div>
            `).join('') }
          </div>
          <div class="flex gap-5 mt-5 pt-4 border-t border-neutral-800/60 text-[9px] font-black uppercase tracking-widest text-neutral-500">
            <div class="flex items-center gap-2"><span class="om-acc-fill w-2.5 h-2.5"></span><span>Concluídas</span></div>
            <div class="flex items-center gap-2"><span class="om-bar-empty om-hatch w-2.5 h-2.5"></span><span>Abertas + Agendadas</span></div>
          </div>
        </div>

        <!-- Próxima OS -->
        <div class="lg:col-span-3 bg-[#101012] border border-neutral-800/80 p-6 flex flex-col">
          <h3 class="text-[15px] font-extrabold tracking-tight text-white mb-5">Próxima OS</h3>
          <div class="flex-1" id="om-central-proxima-os-body">
            <div class="text-[11px] text-neutral-600 px-1 py-2 font-bold uppercase">Carregando próxima OS...</div>
          </div>
          <button id="om-central-proxima-os-btn" onclick="setTab('os')" class="om-acc-solid w-full mt-6 py-3.5 font-black text-[10px] uppercase tracking-widest inline-flex items-center justify-center gap-2 transition-colors opacity-60"><i data-lucide="clipboard-check" class="w-4 h-4 stroke-[2.5]"></i>Abrir Ordem de Serviço</button>
        </div>

        <!-- Propostas -->
        <div class="lg:col-span-3 bg-[#101012] border border-neutral-800/80 p-6">
          <div class="flex items-center justify-between mb-5">
            <h3 class="text-[15px] font-extrabold tracking-tight text-white">Propostas</h3>
            <button onclick="omOpenCreateProposta()" class="om-acc-hbborder om-acc-hbtext px-3 py-1.5 border border-neutral-800 text-[9px] font-black uppercase tracking-widest text-neutral-400 transition-colors inline-flex items-center gap-1"><i data-lucide="plus" class="w-3 h-3 stroke-[3]"></i>Nova</button>
          </div>
          <div class="space-y-1" id="om-central-propostas-list">
            <div class="text-[11px] text-neutral-600 px-1 py-2 font-bold uppercase">Carregando propostas...</div>
          </div>
        </div>
      </div>

      <!-- Linha 3: equipe + progresso + relógio -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-4 mb-4">
        <!-- Equipe em campo -->
        <div class="lg:col-span-6 bg-[#101012] border border-neutral-800/80 p-6">
          <div class="flex items-center justify-between mb-5">
            <h3 class="text-[15px] font-extrabold tracking-tight text-white">Equipe em Campo</h3>
            <button onclick="setTab('tecnicos')" class="px-3 py-1.5 border border-neutral-800 hover:border-neutral-600 text-[9px] font-black uppercase tracking-widest text-neutral-400 hover:text-white transition-colors inline-flex items-center gap-1.5">Ver todos<i data-lucide="arrow-up-right" class="w-3 h-3"></i></button>
          </div>
          <div class="space-y-1" id="om-central-equipe-list">
            <div class="text-[11px] text-neutral-600 px-1 py-2 font-bold uppercase">Carregando…</div>
          </div>
        </div>

        <!-- Progresso do mês -->
        <div class="lg:col-span-3 bg-[#101012] border border-neutral-800/80 p-6 flex flex-col">
          <h3 class="text-[15px] font-extrabold tracking-tight text-white mb-5">Progresso do Mês</h3>
          <div class="flex-1 grid place-items-center py-2">
            <div class="relative">
              <svg width="170" height="170" viewBox="0 0 130 130">
                <circle cx="65" cy="65" r="52" fill="none" stroke="#1c1c1f" stroke-width="14"/>
                <circle id="om-kpi-gauge-arc" class="om-acc-stroke" cx="65" cy="65" r="52" fill="none" stroke-width="14" stroke-dasharray="${dash} ${circ - dash}" stroke-dashoffset="${circ / 4}"/>
              </svg>
              <div class="absolute inset-0 grid place-items-center text-center">
                <div>
                  <div id="om-kpi-gauge-pct" class="text-3xl font-black tracking-tighter leading-none text-white">${gaugePct}%</div>
                  <div class="text-[8px] font-black uppercase tracking-[0.2em] text-neutral-500 mt-1.5">OS Concluídas</div>
                </div>
              </div>
            </div>
          </div>
          <div class="flex justify-center gap-4 pt-4 border-t border-neutral-800/60 text-[9px] font-black uppercase tracking-widest text-neutral-500">
            <div class="flex items-center gap-1.5"><span class="om-acc-fill w-2 h-2"></span>Concluídas</div>
            <div class="flex items-center gap-1.5"><span class="w-2 h-2 bg-[#1c1c1f] border border-neutral-700"></span>Restantes</div>
          </div>
        </div>

        <!-- Horário local (card profundo temático) -->
        <div class="om-deep lg:col-span-3 relative overflow-hidden p-6 flex flex-col">
          ${omContourDecor()}
          <div class="relative flex-1 flex flex-col">
            <div class="flex items-center gap-3">
              <div class="om-deep-icon w-10 h-10 shrink-0 grid place-items-center"><i data-lucide="clock" class="w-4 h-4"></i></div>
              <span class="om-deep-label text-[10px] font-black uppercase tracking-[0.18em]">Horário Local</span>
            </div>
            <div class="flex-1 grid place-items-center py-6">
              <div id="om-central-clock" class="font-mono font-black text-[44px] tracking-tighter leading-none text-white" style="font-variant-numeric: tabular-nums;">${_omFormatHora()}</div>
            </div>
            <div class="flex items-center justify-between pt-4 border-t border-white/10">
              <span class="om-deep-label text-[9px] font-black uppercase tracking-[0.2em] opacity-80">${_omFormatDataCurta()}</span>
              <span class="om-deep-pill inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[9px] font-black uppercase tracking-widest">
                <span class="relative flex h-1.5 w-1.5"><span class="animate-ping absolute inline-flex h-full w-full bg-current opacity-60"></span><span class="relative inline-flex h-1.5 w-1.5 bg-current"></span></span>Ao vivo
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Pendências críticas -->
      <div class="bg-[#101012] border border-neutral-800/80 p-6">
        <div class="flex items-center justify-between mb-5">
          <h3 class="text-[15px] font-extrabold tracking-tight text-white">Pendências Críticas</h3>
          <button onclick="setTab('pendencias')" class="px-3 py-1.5 border border-neutral-800 hover:border-neutral-600 text-[9px] font-black uppercase tracking-widest text-neutral-400 hover:text-white transition-colors inline-flex items-center gap-1.5">Ver todas<i data-lucide="arrow-up-right" class="w-3 h-3"></i></button>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3" id="om-central-pend-grid">
          <div class="text-[11px] text-neutral-600 px-1 py-2 font-bold uppercase">Carregando pendências...</div>
        </div>
      </div>
    </div>
  `;
  startOmClock();
  queueAppLucideCreateIcons();
  omCentralFetchLive();
}

function omCentralPropostasHTML(rows) {
  const propostas = (rows || []).slice(0, 5);
  if (!propostas.length) {
    return `<div class="text-[11px] text-neutral-500 px-1 py-2 font-bold uppercase">Nenhuma proposta.</div>`;
  }
  return propostas.map(p => {
    const tipo = p.tipo_servico || p.titulo || 'Proposta O&M';
    const status = omPropStatusLabel(p.status);
    const validade = omFormatDate(p.validade);
    return `
      <button onclick="omOpenPropostaDetail('${omEsc(p.id)}')" class="w-full text-left flex items-center gap-3 px-2 py-2.5 hover:bg-neutral-900/70 transition-colors group">
        <div class="om-acc-chip om-acc-chip-h w-9 h-9 shrink-0 grid place-items-center transition-colors"><i data-lucide="${OM_PROP_TIPO_ICON[tipo] || 'file-signature'}" class="w-4 h-4"></i></div>
        <div class="min-w-0 flex-1">
          <div class="text-xs text-white font-bold truncate">${omEsc(tipo)}</div>
          <div class="text-[9px] text-neutral-500 truncate font-semibold mt-0.5">${omEsc(p.cliente || '—')} · ${omEsc(status)} · Val. ${validade}</div>
        </div>
      </button>`;
  }).join('');
}

async function omCentralFetchLive() {
  // — Propostas reais —
  try {
    const { data: propRows, error: propErr } = await supabaseClient.rpc('list_om_propostas');
    const propEl = document.getElementById('om-central-propostas-list');
    if (propEl) {
      if (propErr) {
        propEl.innerHTML = `<div class="text-[11px] text-red-400 px-1 py-2 font-bold uppercase">${omEsc(omFriendlyErr(propErr))}</div>`;
      } else {
        propEl.innerHTML = omCentralPropostasHTML(propRows || []);
      }
      queueAppLucideCreateIcons();
    }
  } catch (e) {
    const propEl = document.getElementById('om-central-propostas-list');
    if (propEl) propEl.innerHTML = `<div class="text-[11px] text-red-400 px-1 py-2 font-bold uppercase">${omEsc(omFriendlyErr(e))}</div>`;
  }

  // — Próxima OS real —
  try {
    const { data: osRows, error: osErr } = await supabaseClient.rpc('list_om_os');
    if (!osErr && osRows) {
      const open = ['agendada', 'deslocamento', 'em_atendimento'];
      const sorted = osRows
        .filter(o => open.includes(o.status))
        .sort((a, b) => (a.agendado_para || '') < (b.agendado_para || '') ? -1 : 1);
      const os = sorted[0] || osRows[0];
      if (os) {
        const bodyEl = document.getElementById('om-central-proxima-os-body');
        const btnEl  = document.getElementById('om-central-proxima-os-btn');
        if (bodyEl) {
          const dt = os.agendado_para ? new Date(os.agendado_para) : null;
          const dtData = dt ? dt.toLocaleDateString('pt-BR') : '—';
          const dtHora = dt ? dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—';
          bodyEl.innerHTML = `
            <div class="text-[10px] font-black uppercase tracking-widest text-neutral-500 mb-2">${omEsc(os.numero || '—')}</div>
            <div class="text-xl font-extrabold tracking-tight leading-snug text-white">${omEsc(os.tipo_servico || 'Ordem de Serviço')}<br><span class="text-neutral-400 font-bold">${omEsc(os.cliente || '—')}</span></div>
            <div class="flex flex-wrap items-center gap-x-2 gap-y-1 mt-4 text-[11px] text-neutral-500 font-semibold">
              <i data-lucide="calendar" class="w-3.5 h-3.5"></i>${dtData}
              <span class="text-neutral-700">·</span>
              <i data-lucide="clock" class="w-3.5 h-3.5"></i>${dtHora}
              <span class="text-neutral-700">·</span>
              <i data-lucide="hard-hat" class="w-3.5 h-3.5"></i>${omEsc(os.tecnico_nome || os.tecnico || '—')}
            </div>`;
          queueAppLucideCreateIcons();
        }
        if (btnEl) {
          btnEl.setAttribute('onclick', `omOsAbrir('${omEsc(os.id)}'); setTab('os')`);
          btnEl.classList.remove('opacity-60');
        }
      } else {
        const bodyEl = document.getElementById('om-central-proxima-os-body');
        if (bodyEl) bodyEl.innerHTML = `<div class="text-[11px] text-neutral-500 px-1 py-2 font-bold uppercase">Nenhuma OS agendada.</div>`;
      }
    }
  } catch (_) {}

  // — Pendências Críticas reais —
  try {
    const { data: pendRows, error: pendErr } = await supabaseClient.rpc('list_om_pendencias');
    if (!pendErr && pendRows) {
      const criticas = pendRows
        .filter(p => ['alta', 'critica'].includes(p.criticidade) && !['resolvida', 'ignorada'].includes(p.status))
        .slice(0, 3);
      const gridEl = document.getElementById('om-central-pend-grid');
      if (gridEl) {
        gridEl.innerHTML = criticas.length
          ? criticas.map(p => {
              const cLabel = OM_PEND_CRIT_LABEL[p.criticidade] || p.criticidade;
              const isCrit = p.criticidade === 'critica';
              return `
                <div class="flex items-center justify-between gap-3 px-4 py-3.5 bg-[#0c0c0e] border border-neutral-800/80 border-l-2 ${isCrit ? 'border-l-red-500' : 'border-l-orange-500'} hover:bg-neutral-900/60 transition-colors">
                  <div class="min-w-0">
                    <div class="text-xs text-white font-bold truncate">${omEsc(p.descricao || '—')}</div>
                    <div class="text-[9px] text-neutral-500 truncate mt-1 font-semibold uppercase tracking-wider">${omEsc(p.cliente || '—')} · ${omEsc(p.os_numero || '—')}</div>
                  </div>
                  <div class="shrink-0">${omCPill(cLabel, OM_CRIT_TONE[cLabel] || 'gray')}</div>
                </div>`;
            }).join('')
          : `<div class="text-[11px] text-neutral-500 px-1 py-2 font-bold uppercase">Nenhuma pendência crítica.</div>`;
        queueAppLucideCreateIcons();
      }
    }
  } catch (_) {}

  // — Equipe em Campo real —
  try {
    var _equipeResults = await Promise.all([
      supabaseClient.rpc('list_om_tecnicos'),
      supabaseClient.rpc('list_om_os'),
    ]);
    var _tecRes = _equipeResults[0], _osRes = _equipeResults[1];
    if (!_tecRes.error && _tecRes.data) {
      var _tecRows = _tecRes.data;
      var _ossEquipe = (!_osRes.error && _osRes.data) ? _osRes.data : [];
      var listEl = document.getElementById('om-central-equipe-list');
      if (listEl) {
        listEl.innerHTML = _tecRows.length
          ? _tecRows.map(function(t) {
              var der = omTecDerived(t, _ossEquipe);
              var initials = (t.nome || '?').split(' ').map(function(w){ return w[0]; }).slice(0, 2).join('').toUpperCase();
              var sub = (der.proxima !== '—' ? 'próx. ' + der.proxima : '—') + ' · ' + der.osHoje + ' OS hoje';
              return '<div class="flex items-center justify-between gap-3 px-2 py-2.5 hover:bg-neutral-900/70 transition-colors">' +
                '<div class="flex items-center gap-3 min-w-0">' +
                  '<div class="om-acc-avatar w-10 h-10 shrink-0 border grid place-items-center font-black text-[11px] select-none">' + initials + '</div>' +
                  '<div class="min-w-0">' +
                    '<div class="text-[13px] text-white font-bold truncate">' + omEsc(t.nome || '—') + '</div>' +
                    '<div class="text-[10px] text-neutral-500 truncate font-medium mt-0.5">' + omEsc(sub) + '</div>' +
                  '</div>' +
                '</div>' +
                '<div class="shrink-0">' + omCPill(der.status, OM_TEC_STATUS_TONE_C[der.status] || 'emerald') + '</div>' +
              '</div>';
            }).join('')
          : '<div class="text-[11px] text-neutral-500 px-1 py-2 font-bold uppercase">Nenhum técnico ativo.</div>';
      }
    }
  } catch (_) {}

  // — KPIs e Progresso reais —
  try {
    const { data: kpis, error: kpiErr } = await supabaseClient.rpc('get_om_kpis_central');
    if (!kpiErr && kpis) {
      const fmtSla = m => {
        if (m == null) return '—';
        if (m < 60) return Math.round(m) + 'min';
        return (m / 60).toFixed(1).replace('.', ',') + 'h';
      };

      const elAbVal = document.getElementById('om-kpi-abertas-val');
      const elAbSub = document.getElementById('om-kpi-abertas-sub');
      if (elAbVal) elAbVal.textContent = kpis.abertas ?? 0;
      if (elAbSub) elAbSub.innerHTML = `<i data-lucide="alert-triangle" class="w-3 h-3"></i>${(kpis.abertas || 0) > 0 ? (kpis.abertas) + ' em aberto' : 'Nenhuma em aberto'}`;

      const elCVal = document.getElementById('om-kpi-campo-val');
      const elCSub = document.getElementById('om-kpi-campo-sub');
      if (elCVal) elCVal.textContent = kpis.em_campo ?? 0;
      if (elCSub) {
        const n = kpis.tec_em_os || 0;
        elCSub.textContent = n > 0 ? `Distribuídas em ${n} técnico${n > 1 ? 's' : ''}` : 'Nenhum em atendimento';
      }

      const elTVal = document.getElementById('om-kpi-tec-val');
      const elTSub = document.getElementById('om-kpi-tec-sub');
      if (elTVal) elTVal.textContent = kpis.tec_total ?? 0;
      if (elTSub) {
        const emOs = kpis.tec_em_os || 0;
        elTSub.textContent = emOs > 0 ? `${emOs} em atendimento` : 'Todos disponíveis';
      }

      const elSVal = document.getElementById('om-kpi-sla-val');
      const elSSub = document.getElementById('om-kpi-sla-sub');
      if (elSVal) elSVal.textContent = fmtSla(kpis.sla_min);
      if (elSSub) elSSub.textContent = kpis.sla_min != null ? 'Tempo médio (30 dias)' : 'Sem dados no período';

      const totMes = kpis.tot_mes || 0;
      const finMes = kpis.fin_mes || 0;
      const pct = totMes > 0 ? Math.min(100, Math.round(finMes / totMes * 100)) : (finMes > 0 ? 100 : 0);
      const circ = 2 * Math.PI * 52;
      const dash = (pct / 100) * circ;
      const elArc = document.getElementById('om-kpi-gauge-arc');
      const elGPct = document.getElementById('om-kpi-gauge-pct');
      if (elArc) elArc.setAttribute('stroke-dasharray', `${dash} ${circ - dash}`);
      if (elGPct) elGPct.textContent = `${pct}%`;

      queueAppLucideCreateIcons();
    }
  } catch (_) {}

  // — Atividade da semana real —
  try {
    const { data: actRows, error: actErr } = await supabaseClient.rpc('get_om_weekly_activity');
    if (!actErr) {
      const gridEl = document.getElementById('om-central-activity-chart');
      if (gridEl) {
        if (actRows && actRows.length) {
          const PT_DAYS  = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
          const PT_SHORT = ['D','S','T','Q','Q','S','S'];
          const days = actRows.map(r => ({
            day:        PT_DAYS[r.dow]  || String(r.dow),
            dayShort:   PT_SHORT[r.dow] || '?',
            abertas:    r.abertas    || 0,
            agendadas:  r.agendadas  || 0,
            concluidas: r.concluidas || 0,
          }));
          const maxT  = Math.max(1, ...days.map(d => d.abertas + d.agendadas + d.concluidas));
          const peakT = Math.max(...days.map(d => d.abertas + d.agendadas + d.concluidas));
          gridEl.innerHTML = days.map(day => {
            const total   = day.abertas + day.agendadas + day.concluidas;
            const donePct = total ? Math.round((day.concluidas / total) * 100) : 0;
            const hPct    = Math.max(8, (total / maxT) * 100);
            const isPeak  = total > 0 && total === peakT;
            return `
              <div class="flex flex-col items-center h-full justify-end group relative">
                <div class="absolute bottom-full mb-2 hidden group-hover:block bg-black border border-neutral-700 p-3 text-[9px] font-bold z-20 whitespace-nowrap">
                  <div class="text-white font-black uppercase tracking-widest border-b border-neutral-800 pb-1.5 mb-1.5">${omEsc(day.day)}</div>
                  <div class="text-neutral-400">Abertas <span class="text-white font-black float-right ml-4">${day.abertas}</span></div>
                  <div class="text-neutral-400">Agendadas <span class="text-white font-black float-right ml-4">${day.agendadas}</span></div>
                  <div class="om-acc">Concluídas <span class="font-black float-right ml-4">${day.concluidas}</span></div>
                </div>
                ${isPeak ? `<div class="om-acc-fill absolute -top-1 px-1.5 py-0.5 text-black text-[8px] font-black">${donePct}%</div>` : ''}
                <div class="w-full max-w-[44px] flex flex-col justify-end overflow-hidden transition-all duration-300" style="height:${Math.min(100, hPct)}%;">
                  <div class="om-bar-empty om-hatch w-full transition-colors" style="height:${100 - donePct}%;"></div>
                  <div class="om-acc-fill w-full" style="height:${donePct}%;"></div>
                </div>
                <span class="text-[9px] text-neutral-600 font-black uppercase mt-3">${omEsc(day.dayShort)}</span>
              </div>`;
          }).join('');
        } else {
          gridEl.innerHTML = `<div class="col-span-7 text-[11px] text-neutral-500 font-bold uppercase text-center py-8">Sem atividade no período.</div>`;
        }
      }
    }
  } catch (_) {}
}

// --- Base real de clientes (RPC search_om_clientes) --------------------
// Mapas para os tokens minúsculos de origem que vêm do banco.
const OM_ORIGEM_LABEL_L = { crm: 'CRM', proposta: 'Proposta', manual: 'Manual', antigo: 'Cliente antigo', whatsapp: 'WhatsApp', indicacao: 'Indicação', om: 'O&M' };
const OM_ORIGEM_TONE_L  = { crm: 'blue', proposta: 'emerald', manual: 'yellow', antigo: 'gray', whatsapp: 'emerald', indicacao: 'blue', om: 'blue' };
function omOrigemLabel(o) { return OM_ORIGEM_LABEL_L[o] || (o || '—'); }

// Cache leve dos clientes buscados (id -> {id,nome,cidade,telefone}) para
// pré-selecionar na proposta sem novo fetch.
let _omClientCache = {};
function _omCacheClients(list) {
  (list || []).forEach(c => { if (c && c.id) _omClientCache[c.id] = { id: c.id, nome: c.nome, cidade: c.cidade, telefone: c.telefone }; });
}
// Busca ampla no CRM (proposta / entrada rápida) — qualquer cliente da franquia.
async function omSearchClientes(query) {
  const { data, error } = await supabaseClient.rpc('search_om_clientes', { p_query: (query || '').trim() });
  if (error) throw error;
  _omCacheClients(data);
  return data || [];
}
// Lista da aba Clientes O&M — só clientes O&M, escopo por vendedor.
async function omListOMClientes(query) {
  const { data, error } = await supabaseClient.rpc('list_om_clientes', { p_query: (query || '').trim() });
  if (error) throw error;
  _omCacheClients(data);
  return data || [];
}

// Busca rápida da Central — base real, com debounce
let _omCentralSearchTimer = null;
function omCentralSearch(term) {
  clearTimeout(_omCentralSearchTimer);
  _omCentralSearchTimer = setTimeout(() => omCentralSearchRun(term), 250);
}
async function omCentralSearchRun(term) {
  const q = (term || '').trim();
  const out = document.getElementById('om-central-search-results');
  if (!out) return;
  if (!q) { out.innerHTML = ''; return; }
  let results;
  try { results = await omSearchClientes(q); }
  catch (e) { out.innerHTML = `<div class="text-[12px] text-red-400 px-1 py-2">${omEsc(omFriendlyErr(e))}</div>`; return; }

  if (!results.length) {
    out.innerHTML = `
      <div class="bg-neutral-950 border border-neutral-800 p-4 flex items-center justify-between gap-3">
        <div>
          <div class="text-sm font-bold text-white">Nenhum cliente encontrado</div>
          <div class="text-[11px] text-neutral-500">Cadastre um novo cliente O&M para iniciar o atendimento.</div>
        </div>
        ${omBtnPrimary('Criar cliente O&M', 'user-plus', "omOpenCreateClient({ next: 'proposta' })")}
      </div>`;
  } else {
    out.innerHTML = `
      <div class="bg-neutral-950 border border-neutral-800 divide-y divide-neutral-900">
        ${results.map(c => `
          <div class="flex items-center justify-between gap-3 px-3 py-2.5">
            <div class="min-w-0">
              <div class="text-sm text-white font-bold truncate">${omEsc(c.nome)}</div>
              <div class="text-[11px] text-neutral-500 truncate">${omEsc(c.cidade || '—')} · ${omEsc(c.telefone || '—')}</div>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              ${omChip(omOrigemLabel(c.origem), OM_ORIGEM_TONE_L[c.origem] || 'gray')}
              ${c.no_om ? omChip('O&M', 'blue') : ''}
              <button onclick="omUseClient('${c.id}')" class="px-3 py-1.5 bg-blue-500 hover:bg-blue-400 text-blue-950 font-black text-[10px] uppercase tracking-widest">Nova proposta</button>
            </div>
          </div>
        `).join('')}
      </div>`;
  }
  queueAppLucideCreateIcons();
}
function omUseClient(id) {
  const c = _omClientCache[id] || { id };
  state.omSelectedClientId = id;
  omOpenCreateProposta({ clienteId: id, clienteNome: c.nome, clienteCidade: c.cidade });
}
function omClienteVer(clienteId, secao) {
  state.omSelectedClientId = clienteId;
  if (secao === 'propostas') {
    state.omPropFilters = state.omPropFilters || { status: 'Todos', tipo: 'Todos', responsavel: 'Todos' };
    setTab('propostas');
  } else if (secao === 'os') {
    setTab('os');
  }
}

// =======================================================================
// ROTA: CLIENTES O&M — base real (search_om_clientes / create_om_cliente)
// =======================================================================
async function renderOMClientes(container) {
  if (!state.omClientesFilters) state.omClientesFilters = { search: '' };
  const f = state.omClientesFilters;

  container.innerHTML = `
    <div class="om-env animate-fade-in-up">
      ${omPageHeader({
        icon: 'users',
        title: 'Clientes O&M',
        subtitle: 'Seus clientes de O&M — cadastrados manualmente ou convertidos de propostas/CRM.',
        actions: omBtnPrimary('Criar cliente O&M', 'user-plus', 'omOpenCreateClient()'),
      })}

      <div class="bg-neutral-900/40 border border-neutral-800 p-4 mb-4">
        <input id="om-cli-search" type="text" value="${omEsc(f.search || '')}" oninput="omClientesSearch(this.value)"
          placeholder="Buscar nos seus clientes O&M por nome, telefone, CPF/CNPJ ou cidade"
          class="${OM_INPUT_CLS}" autocomplete="off" />
        <div class="text-[10px] text-neutral-600 mt-2">Lista só clientes O&M. Para puxar um cliente do CRM, use “Nova proposta” e busque por ele lá.</div>
      </div>

      <div id="om-cli-results">${omPropLoadingHTML('Carregando clientes…')}</div>
    </div>
  `;
  queueAppLucideCreateIcons();
  omClientesLoadResults();
}

// Atualiza só a tabela (#om-cli-results) — preserva o foco do campo de busca.
let _omCliSearchTimer = null;
function omClientesSearch(term) {
  state.omClientesFilters = state.omClientesFilters || {};
  state.omClientesFilters.search = term;
  clearTimeout(_omCliSearchTimer);
  _omCliSearchTimer = setTimeout(omClientesLoadResults, 250);
}
async function omClientesLoadResults() {
  const out = document.getElementById('om-cli-results');
  if (!out) return;
  let rows;
  try { rows = await omListOMClientes((state.omClientesFilters || {}).search || ''); }
  catch (e) { out.innerHTML = omPropErroHTML(e); queueAppLucideCreateIcons(); return; }
  out.innerHTML = omClientesTableHTML(rows);
  queueAppLucideCreateIcons();
}
function omClientesTableHTML(rows) {
  if (!rows.length) {
    const q = ((state.omClientesFilters || {}).search || '').trim();
    return omEmptyState({
      icon: 'user-x',
      title: q ? 'Nenhum cliente O&M encontrado' : 'Você ainda não tem clientes O&M',
      hint: q ? 'Nenhum cliente O&M bate com essa busca. Cadastre um novo ou inicie uma proposta para um cliente do CRM.'
              : 'Cadastre o primeiro cliente O&M ou inicie uma proposta para um cliente existente do CRM.',
      actionHTML: omBtnPrimary('Criar cliente O&M', 'user-plus', 'omOpenCreateClient()'),
    });
  }
  return `
    <div class="bg-neutral-900/40 border border-neutral-800 overflow-x-auto">
      <table class="w-full">
        <thead>
          <tr class="bg-neutral-950 border-b border-neutral-800">
            ${['Cliente','Origem','Telefone','Cidade','Documento',''].map(h => `<th class="text-left text-[10px] font-black uppercase tracking-widest text-neutral-500 px-4 py-3">${h}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${rows.map(c => `
            <tr class="border-b border-neutral-900 hover:bg-white/[0.02] transition-colors">
              <td class="px-4 py-3.5 text-sm font-bold text-white">${omEsc(c.nome || '—')}</td>
              <td class="px-4 py-3.5">${omChip(omOrigemLabel(c.origem), OM_ORIGEM_TONE_L[c.origem] || 'gray')}</td>
              <td class="px-4 py-3.5 text-sm text-neutral-300">${omEsc(c.telefone || '—')}</td>
              <td class="px-4 py-3.5 text-sm text-neutral-300">${omEsc(c.cidade || '—')}</td>
              <td class="px-4 py-3.5 text-sm text-neutral-300">${omEsc(c.documento || '—')}</td>
              <td class="px-4 py-3.5 text-right">
                <button onclick="omUseClient('${c.id}')" class="px-3 py-1.5 bg-blue-500 hover:bg-blue-400 text-blue-950 font-black text-[10px] uppercase tracking-widest inline-flex items-center gap-1.5"><i data-lucide="file-signature" class="w-3 h-3 stroke-[3]"></i>Nova proposta</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>`;
}

// --- Criar cliente O&M (grava no banco via RPC) ------------------------
// opts.next === 'proposta' → abre a Nova proposta já com o cliente selecionado.
let _omCreateClientOpts = {};
function omOpenCreateClient(opts = {}) {
  _omCreateClientOpts = opts || {};
  omOpenModal({
    title: 'Criar cliente O&M',
    subtitle: 'Cadastro — vai direto para a base de clientes',
    icon: 'user-plus',
    bodyHTML: `
      <form id="om-form-client" onsubmit="event.preventDefault(); omSubmitCreateClient();">
        ${omField('Nome / razão social', `<input name="nome" required class="${OM_INPUT_CLS}" placeholder="Nome do cliente" />`)}
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          ${omField('Telefone', `<input name="telefone" class="${OM_INPUT_CLS}" placeholder="(00) 00000-0000" />`)}
          ${omField('Cidade', `<input name="cidade" class="${OM_INPUT_CLS}" placeholder="Cidade/UF" />`)}
        </div>
        ${omField('Endereço', `<input name="endereco" class="${OM_INPUT_CLS}" placeholder="Rua, número, bairro" />`)}
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          ${omField('CPF / CNPJ', `<input name="documento" class="${OM_INPUT_CLS}" placeholder="Opcional" />`)}
          ${omField('Origem', `<select name="origem" class="${OM_INPUT_CLS}">
            <option value="manual">Manual</option>
            <option value="indicacao">Indicação</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="antigo">Cliente antigo</option>
          </select>`)}
        </div>
        ${omField('Observações', `<textarea name="obs" rows="2" class="${OM_INPUT_CLS}" placeholder="Notas internas"></textarea>`)}
      </form>
    `,
    footerHTML: `
      <button onclick="omCloseModal()" class="px-4 py-2.5 bg-neutral-900 border border-neutral-800 hover:border-neutral-700 text-neutral-300 font-black text-[10px] uppercase tracking-widest">Cancelar</button>
      <button onclick="document.getElementById('om-form-client').requestSubmit()" class="px-4 py-2.5 bg-blue-500 hover:bg-blue-400 text-blue-950 font-black text-[10px] uppercase tracking-widest inline-flex items-center gap-2"><i data-lucide="check" class="w-3.5 h-3.5 stroke-[3]"></i>Salvar cliente</button>
    `
  });
}
async function omSubmitCreateClient() {
  const form = document.getElementById('om-form-client');
  if (!form) return;
  const fd = new FormData(form);
  const nome = (fd.get('nome') || '').trim();
  if (!nome) { if (typeof showToast === 'function') showToast('Informe o nome do cliente.'); return; }

  omSetModalBusy(true);
  try {
    const { data: newId, error } = await supabaseClient.rpc('create_om_cliente', {
      p_nome: nome,
      p_telefone: (fd.get('telefone') || '').trim() || null,
      p_cidade: (fd.get('cidade') || '').trim() || null,
      p_endereco: (fd.get('endereco') || '').trim() || null,
      p_documento: (fd.get('documento') || '').trim() || null,
      p_origem: (fd.get('origem') || 'manual'),
      p_observacoes: (fd.get('obs') || '').trim() || null,
      p_franquia_id: state.franquiaId || null,
    });
    if (error || !newId) throw error || new Error('Falha ao cadastrar o cliente.');

    const cidade = (fd.get('cidade') || '').trim();
    const novo = { id: newId, nome: nome.toUpperCase(), cidade, telefone: (fd.get('telefone') || '').trim() };
    _omClientCache[newId] = novo;

    const opts = _omCreateClientOpts || {};
    _omCreateClientOpts = {};
    omCloseModal();
    if (typeof showToast === 'function') showToast('Cliente O&M cadastrado.');

    if (opts.next === 'proposta') {
      omOpenCreateProposta({ clienteId: newId, clienteNome: novo.nome, clienteCidade: cidade });
    } else {
      renderContent();
    }
  } catch (e) {
    omSetModalBusy(false);
    if (typeof showToast === 'function') showToast(omFriendlyErr(e));
  }
}

// =======================================================================
// ROTA: PROPOSTAS O&M  — conectada ao Supabase
// =======================================================================
const OM_PROP_TIPOS = ['Limpeza de módulos','Manutenção preventiva','Vistoria técnica','Manutenção corretiva','Correção de pendência','Plano recorrente'];
const OM_PROP_STATUSES = ['Rascunho','Enviada','Visualizada','Aprovada','Recusada','Vencida','Cancelada'];

// Status do banco (minúsculo) ↔ rótulo capitalizado da UI
const OM_PROP_STATUS_LABEL = {
  rascunho: 'Rascunho', enviada: 'Enviada', visualizada: 'Visualizada',
  aprovada: 'Aprovada', recusada: 'Recusada', vencida: 'Vencida', cancelada: 'Cancelada',
};
function omPropStatusLabel(s) { return OM_PROP_STATUS_LABEL[s] || (s || '—'); }

// Cache leve do detalhe (evita refetch a cada renderContent)
let omPropDetailCache = { id: null, data: null };

// --- Helpers de propostas ----------------------------------------------
function omEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function omFriendlyErr(e) {
  const m = (e && e.message || '').replace(/^.*?:\s*/, '');
  return m || 'Algo deu errado. Tente novamente.';
}
function omFmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function omFormatDate(v) {
  if (!v) return '—';
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = new Date(v);
  return isNaN(d) ? '—' : d.toLocaleDateString('pt-BR');
}
function omPropLoadingHTML(msg) {
  return `<div class="flex flex-col items-center justify-center py-24 text-neutral-500">
    <i data-lucide="loader-2" class="w-7 h-7 animate-spin text-blue-400 mb-3"></i>
    <div class="text-[11px] font-black uppercase tracking-widest">${omEsc(msg || 'Carregando…')}</div></div>`;
}
function omPropErroHTML(e) {
  return `<div class="flex flex-col items-center justify-center py-24 text-center px-6">
    <i data-lucide="alert-octagon" class="w-10 h-10 text-red-500 mb-3"></i>
    <div class="text-sm font-black text-white mb-1">Não foi possível carregar</div>
    <div class="text-[12px] text-neutral-500 max-w-sm">${omEsc(omFriendlyErr(e))}</div></div>`;
}
function omSetModalBusy(busy) {
  const root = document.getElementById('om-modal-root');
  if (!root) return;
  root.querySelectorAll('button').forEach(b => {
    b.disabled = !!busy;
    b.classList.toggle('opacity-60', !!busy);
    b.classList.toggle('pointer-events-none', !!busy);
  });
}

let omPropListCache = null;

function omPropMatchesSearch(p, term) {
  const q = String(term || '').trim().toLowerCase();
  if (!q) return true;
  return [p.numero, p.cliente, p.tipo_servico, p.responsavel]
    .some(v => String(v || '').toLowerCase().includes(q));
}

// --- Filtro de data (vendas "fechadas" = aprovadas) ---------------------
function omPropToISODate(d) {
  // Local YYYY-MM-DD (evita deslocamento de fuso do toISOString)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
// Intervalo do mês corrente (offset 0) ou de meses anteriores (offset -1 etc.)
function omPropMonthRange(offset = 0) {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const to   = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
  return { from: omPropToISODate(from), to: omPropToISODate(to) };
}
// Data de "atividade" da linha: aprovação quando houver, senão criação.
function omPropRowDate(p) {
  const raw = p.aprovada_em || p.created_at;
  if (!raw) return '';
  const m = String(raw).match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const d = new Date(raw);
  return isNaN(d) ? '' : omPropToISODate(d);
}
function omPropApplyPreset(preset) {
  const f = state.omPropFilters;
  f.datePreset = preset;
  if (preset === 'mes' || preset === 'mes_passado') {
    const r = omPropMonthRange(preset === 'mes' ? 0 : -1);
    f.dateFrom = r.from;
    f.dateTo   = r.to;
  }
  // 'personalizado' preserva dateFrom/dateTo atuais
}

// Filtro-base compartilhado: data + tipo + responsável + busca (sem status).
function omPropBaseRows() {
  const f = state.omPropFilters || {};
  return (omPropListCache || []).filter(p => {
    if (f.tipo !== 'Todos' && p.tipo_servico !== f.tipo) return false;
    if (f.responsavel !== 'Todos' && p.responsavel !== f.responsavel) return false;
    if (!omPropMatchesSearch(p, f.search)) return false;
    const d = omPropRowDate(p);
    if (f.dateFrom && d && d < f.dateFrom) return false;
    if (f.dateTo   && d && d > f.dateTo)   return false;
    if ((f.dateFrom || f.dateTo) && !d) return false;
    return true;
  });
}
// Tabela / export: base + filtro de status do dropdown.
function omPropFilteredRows() {
  const f = state.omPropFilters || {};
  return omPropBaseRows().filter(p => f.status === 'Todos' || p.statusLabel === f.status);
}
// KPIs: base + apenas aprovadas (ignora o dropdown de status).
function omPropApprovedRows() {
  return omPropBaseRows().filter(p => p.status === 'aprovada');
}

function omPropResultsHTML() {
  const rows = omPropFilteredRows();
  if (rows.length === 0) {
    return omEmptyState({ icon: 'filter-x', title: 'Nada encontrado', hint: 'Ajuste a busca ou os filtros para ver outras propostas.' });
  }
  return `
    <div class="bg-neutral-900/40 border border-neutral-800 overflow-x-auto">
      <table class="w-full">
        <thead>
          <tr class="bg-neutral-950 border-b border-neutral-800">
            ${['Nº','Cliente','Serviço','Valor','Validade','Responsável','Status',''].map(h => `<th class="text-left text-[10px] font-black uppercase tracking-widest text-neutral-500 px-4 py-3">${h}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${rows.map(p => `
            <tr class="border-b border-neutral-900 hover:bg-white/[0.02]">
              <td class="px-4 py-3.5 text-sm font-bold text-white">${omEsc(p.numero || '—')}</td>
              <td class="px-4 py-3.5 text-sm text-white">${omEsc(p.cliente || '—')}</td>
              <td class="px-4 py-3.5 text-sm text-neutral-300">${omEsc(p.tipo_servico || '—')}</td>
              <td class="px-4 py-3.5 text-sm text-white font-bold">${omFormatBRL(p.valor_final)}</td>
              <td class="px-4 py-3.5 text-sm text-neutral-400">${omFormatDate(p.validade)}</td>
              <td class="px-4 py-3.5 text-sm text-neutral-300">${omEsc(p.responsavel || '—')}</td>
              <td class="px-4 py-3.5">${omChip(p.statusLabel, OM_PROP_STATUS_TONE[p.statusLabel] || 'gray')}</td>
              <td class="px-4 py-3.5 text-right">
                <button onclick="omOpenPropostaDetail('${p.id}')" class="px-3 py-1.5 bg-neutral-900 border border-neutral-800 hover:border-blue-500/40 hover:text-blue-300 text-neutral-200 font-black text-[10px] uppercase tracking-widest">Abrir</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>`;
}

// --- Painel de métricas (vendas fechadas = aprovadas no período) --------
function omPropMetrics(rows) {
  const count = rows.length;
  const totalBRL = rows.reduce((s, p) => s + (Number(p.valor_final) || 0), 0);
  const ticketMedio = count ? totalBRL / count : 0;
  return { count, totalBRL, ticketMedio };
}
function omPropPeriodoLabel() {
  const f = state.omPropFilters || {};
  if (f.datePreset === 'mes') return 'Mês atual';
  if (f.datePreset === 'mes_passado') return 'Mês passado';
  if (f.dateFrom || f.dateTo) return `${omFormatDate(f.dateFrom)} – ${omFormatDate(f.dateTo)}`;
  return 'Todo o período';
}
function omPropStatCard({ label, value, sub, icon, iconTint, valueColor }) {
  return `
    <div class="bg-neutral-900/60 border border-neutral-800 p-5 relative overflow-hidden">
      <div class="flex items-center justify-between mb-4">
        <span class="text-[10px] font-black uppercase tracking-widest text-neutral-500">${label}</span>
        <div class="w-9 h-9 flex items-center justify-center ${iconTint}">
          <i data-lucide="${icon}" class="w-4 h-4"></i>
        </div>
      </div>
      <div class="text-4xl font-black tracking-tight leading-none ${valueColor || 'text-white'}">${value}</div>
      <div class="text-[10px] font-bold uppercase tracking-widest text-neutral-600 mt-2.5">${sub}</div>
    </div>`;
}
function omPropMetricsHTML() {
  const m = omPropMetrics(omPropApprovedRows());
  const periodo = omPropPeriodoLabel();
  return `
    <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
      ${omPropStatCard({ label: 'Total em vendas', value: omFormatBRL(m.totalBRL), sub: `${periodo} · aprovadas`, icon: 'dollar-sign', iconTint: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20', valueColor: 'text-emerald-400' })}
      ${omPropStatCard({ label: 'Total de vendas', value: String(m.count), sub: `${periodo} · propostas aprovadas`, icon: 'check-circle-2', iconTint: 'bg-blue-500/10 text-blue-400 border border-blue-500/20' })}
      ${omPropStatCard({ label: 'Ticket médio', value: m.count ? omFormatBRL(m.ticketMedio) : '—', sub: `${periodo} · por venda`, icon: 'trending-up', iconTint: 'bg-amber-500/10 text-amber-400 border border-amber-500/20' })}
    </div>`;
}

// Re-renderiza só a tabela de resultados — preserva o foco do campo de busca
function omPropRefreshResults() {
  const el = document.getElementById('om-prop-results');
  if (!el) { renderContent(); return; }
  el.innerHTML = omPropResultsHTML();
  queueAppLucideCreateIcons();
}
// Atualiza painel de métricas + tabela (sem recriar o campo de busca)
function omPropRefreshAll() {
  const metEl = document.getElementById('om-prop-metrics');
  if (metEl) metEl.innerHTML = omPropMetricsHTML();
  const resEl = document.getElementById('om-prop-results');
  if (resEl) resEl.innerHTML = omPropResultsHTML();
  if (!metEl && !resEl) { renderContent(); return; }
  queueAppLucideCreateIcons();
}

async function renderOMPropostas(container) {
  if (state.omPropostaDetailId) return renderOMPropostaDetail(container, state.omPropostaDetailId);
  if (!state.omPropFilters) {
    const mes = omPropMonthRange(0);
    state.omPropFilters = { status: 'Todos', tipo: 'Todos', responsavel: 'Todos', search: '', datePreset: 'mes', dateFrom: mes.from, dateTo: mes.to };
  }
  if (state.omPropFilters.search === undefined) state.omPropFilters.search = '';
  if (state.omPropFilters.datePreset === undefined) { const mes = omPropMonthRange(0); Object.assign(state.omPropFilters, { datePreset: 'mes', dateFrom: mes.from, dateTo: mes.to }); }
  const f = state.omPropFilters;

  container.innerHTML = `<div class="om-env animate-fade-in-up">${omPropLoadingHTML('Carregando propostas…')}</div>`;
  queueAppLucideCreateIcons();

  const { data, error } = await supabaseClient.rpc('list_om_propostas');
  if (error) {
    container.innerHTML = `<div class="om-env animate-fade-in-up">${omPropErroHTML(error)}</div>`;
    queueAppLucideCreateIcons();
    return;
  }

  omPropListCache = (data || []).map(p => ({ ...p, statusLabel: omPropStatusLabel(p.status) }));
  const responsaveis = ['Todos', ...Array.from(new Set(omPropListCache.map(p => p.responsavel).filter(Boolean)))];

  const header = omPageHeader({
    icon: 'file-signature',
    title: 'Propostas O&M',
    subtitle: 'Propostas de limpeza, manutenção, vistoria e serviços corretivos — passo comercial antes da OS.',
    actions: omBtnPrimary('Nova proposta O&M', 'plus', 'omOpenCreateProposta()') +
             omBtnGhost('Exportar', 'download', 'omPropExportXLSX()')
  });

  let body;
  if (!omPropListCache.length) {
    body = omEmptyState({
      icon: 'file-signature',
      title: 'Nenhuma proposta',
      hint: 'Crie a primeira proposta O&M para um cliente da base.',
      actionHTML: omBtnPrimary('Nova proposta O&M', 'plus', 'omOpenCreateProposta()')
    });
  } else {
    const metrics = `<div id="om-prop-metrics">${omPropMetricsHTML()}</div>`;
    const presetOpts = [['mes', 'Este mês'], ['mes_passado', 'Mês passado'], ['personalizado', 'Personalizado']];
    const filtros = `
      <div class="bg-neutral-900/40 border border-neutral-800 p-4 mb-4">
        <input id="om-prop-search" type="text" value="${omEsc(f.search)}" oninput="omPropSearch(this.value)"
          placeholder="Buscar por nº, cliente, serviço ou responsável"
          class="${OM_INPUT_CLS} mb-3" />
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
          ${omField('Período', `<select id="om-prop-preset" onchange="omPropSetPreset(this.value)" class="${OM_INPUT_CLS}">${presetOpts.map(([v, l]) => `<option value="${v}" ${v === f.datePreset ? 'selected' : ''}>${l}</option>`).join('')}</select>`)}
          ${omField('De', `<input id="om-prop-date-from" type="date" value="${omEsc(f.dateFrom || '')}" onchange="omPropSetDate('from', this.value)" class="${OM_INPUT_CLS}" style="color-scheme: dark;" />`)}
          ${omField('Até', `<input id="om-prop-date-to" type="date" value="${omEsc(f.dateTo || '')}" onchange="omPropSetDate('to', this.value)" class="${OM_INPUT_CLS}" style="color-scheme: dark;" />`)}
        </div>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          ${omField('Status', `<select onchange="omPropSet('status', this.value)" class="${OM_INPUT_CLS}">${['Todos', ...OM_PROP_STATUSES].map(s => `<option ${s === f.status ? 'selected' : ''}>${s}</option>`).join('')}</select>`)}
          ${omField('Tipo de serviço', `<select onchange="omPropSet('tipo', this.value)" class="${OM_INPUT_CLS}">${['Todos', ...OM_PROP_TIPOS].map(s => `<option ${s === f.tipo ? 'selected' : ''}>${s}</option>`).join('')}</select>`)}
          ${omField('Responsável', `<select onchange="omPropSet('responsavel', this.value)" class="${OM_INPUT_CLS}">${responsaveis.map(s => `<option ${s === f.responsavel ? 'selected' : ''}>${omEsc(s)}</option>`).join('')}</select>`)}
        </div>
      </div>`;
    body = metrics + filtros + `<div id="om-prop-results">${omPropResultsHTML()}</div>`;
  }

  container.innerHTML = `<div class="om-env animate-fade-in-up">${header}${body}</div>`;
  queueAppLucideCreateIcons();
}
function omPropSet(field, val) { state.omPropFilters[field] = val; omPropRefreshAll(); }
function omPropSearch(term) { state.omPropFilters.search = term; omPropRefreshAll(); }
function omPropSetPreset(preset) {
  omPropApplyPreset(preset);
  const f = state.omPropFilters;
  const fromEl = document.getElementById('om-prop-date-from');
  const toEl   = document.getElementById('om-prop-date-to');
  if (fromEl) fromEl.value = f.dateFrom || '';
  if (toEl)   toEl.value   = f.dateTo   || '';
  omPropRefreshAll();
}
function omPropSetDate(which, val) {
  const f = state.omPropFilters;
  if (which === 'from') f.dateFrom = val; else f.dateTo = val;
  f.datePreset = 'personalizado';
  const presetEl = document.getElementById('om-prop-preset');
  if (presetEl) presetEl.value = 'personalizado';
  omPropRefreshAll();
}
function omPropExportXLSX() {
  const rows = omPropFilteredRows();
  if (!rows.length) { if (typeof showToast === 'function') showToast('Nenhuma proposta para exportar.'); return; }
  const columns = [
    { header: 'Nº',          value: p => p.numero || '' },
    { header: 'Cliente',     value: p => p.cliente || '' },
    { header: 'Cidade',      value: p => p.cidade || '' },
    { header: 'Serviço',     value: p => p.tipo_servico || '' },
    { header: 'Valor (R$)',  value: p => (p.valor_final == null ? '' : Number(p.valor_final)) },
    { header: 'Validade',    value: p => omFormatDate(p.validade) },
    { header: 'Responsável', value: p => p.responsavel || '' },
    { header: 'Status',      value: p => p.statusLabel || '' },
    { header: 'Data',        value: p => omFormatDate(omPropRowDate(p)) },
  ];
  exportToXLSX(rows, columns, `propostas-om_${omPropToISODate(new Date())}`);
  if (typeof showToast === 'function') showToast('Planilha exportada!');
}
function omOpenPropostaDetail(id) { state.omPropostaDetailId = id; if (state.environment === 'om' && state.omActiveTab !== 'propostas') { state.omActiveTab = 'propostas'; renderTabs(); } renderContent(); }
function omClosePropostaDetail() { state.omPropostaDetailId = null; omPropDetailCache = { id: null, data: null }; renderContent(); }

// Estado do passo "Cliente" da proposta:
//   mode 'search'   → buscando um cliente existente
//   mode 'create'   → cadastrando um cliente novo inline
//   mode 'selected' → cliente escolhido (id preenchido)
let omPropCli = { mode: 'search', id: null, nome: '', cidade: '' };
// Sistema/equipamento da proposta. mode: none | selected | form
//   selected → id de um om_sistema existente; label p/ exibir
//   form     → cadastro manual OU importado do CRM (origemId set = importado; prefill preenche)
let omPropSis = { mode: 'none', id: null, label: '', origemId: null, prefill: {} };
let _omSisCache = {};   // id -> sistema (de list_om_sistemas)
let _omVendaCache = []; // vendas do CRM do cliente atual (de list_om_vendas_cliente)

async function omOpenCreateProposta(opts = {}) {
  const { tipo } = opts;
  let servicos = [];
  try {
    const srvRes = await supabaseClient.from('om_servicos').select('id,nome,tipo').eq('ativo', true).order('nome');
    if (srvRes.error) throw srvRes.error;
    servicos = srvRes.data || [];
  } catch (e) {
    if (typeof showToast === 'function') showToast(omFriendlyErr(e));
    return;
  }
  if (!servicos.length) { if (typeof showToast === 'function') showToast('Nenhum serviço O&M disponível.'); return; }

  // Pré-seleção opcional vinda da busca / lista de clientes.
  if (opts.clienteId) {
    const cached = _omClientCache[opts.clienteId] || {};
    omPropCli = { mode: 'selected', id: opts.clienteId, nome: opts.clienteNome || cached.nome || 'Cliente selecionado', cidade: opts.clienteCidade || cached.cidade || '' };
  } else {
    omPropCli = { mode: 'search', id: null, nome: '', cidade: '' };
  }
  omPropSis = { mode: 'none', id: null, label: '', origemId: null, prefill: {} };
  _omSisCache = {}; _omVendaCache = [];

  omOpenModal({
    title: 'Nova proposta O&M',
    subtitle: 'Cliente · Serviço · Valores',
    icon: 'file-signature',
    size: 'lg',
    bodyHTML: `
      <form id="om-form-prop" onsubmit="event.preventDefault(); omSubmitProposta('rascunho');">
        <div class="text-[10px] font-black uppercase tracking-widest text-blue-400/80 mb-1">1 · Cliente</div>
        <div id="om-prop-cli-step">${omPropCliStepHTML()}</div>

        <div class="text-[10px] font-black uppercase tracking-widest text-blue-400/80 mb-1 mt-4">2 · Serviço</div>
        ${omField('Tipo de serviço', `
          <select name="servicoId" required class="${OM_INPUT_CLS}">
            ${servicos.map(s => `<option value="${s.id}" ${s.tipo === tipo ? 'selected' : ''}>${omEsc(s.nome)}</option>`).join('')}
          </select>
        `)}
        ${omField('Descrição / escopo', `<textarea name="descricao" rows="3" class="${OM_INPUT_CLS}" placeholder="Detalhe o que está incluso no serviço.">${omEsc(opts.descricao || '')}</textarea>`)}
        ${omField('Observações internas', `<textarea name="obs" rows="2" class="${OM_INPUT_CLS}" placeholder="Notas que não aparecem para o cliente"></textarea>`)}

        <div class="text-[10px] font-black uppercase tracking-widest text-blue-400/80 mb-1 mt-4">3 · Sistema / equipamento <span class="text-neutral-600 normal-case tracking-normal font-bold">(opcional)</span></div>
        <div id="om-prop-sis-step">${omPropSisStepHTML()}</div>

        <div class="text-[10px] font-black uppercase tracking-widest text-blue-400/80 mb-1 mt-4">4 · Valores</div>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          ${omField('Valor total (R$)', `<input name="valor" type="number" step="0.01" min="0" class="${OM_INPUT_CLS}" placeholder="0,00" />`)}
          ${omField('Condição de pagamento', `<input name="pagamento" class="${OM_INPUT_CLS}" placeholder="Ex.: Pix à vista" />`)}
          ${omField('Válida até', `<input name="validade" type="date" class="${OM_INPUT_CLS}" style="color-scheme: dark;" />`)}
        </div>
      </form>
    `,
    footerHTML: `
      <button onclick="omCloseModal()" class="px-4 py-2.5 bg-neutral-900 border border-neutral-800 hover:border-neutral-700 text-neutral-300 font-black text-[10px] uppercase tracking-widest">Cancelar</button>
      <button onclick="omSubmitProposta('rascunho')" class="px-4 py-2.5 bg-blue-500 hover:bg-blue-400 text-blue-950 font-black text-[10px] uppercase tracking-widest inline-flex items-center gap-2"><i data-lucide="file-plus-2" class="w-3.5 h-3.5 stroke-[3]"></i>Criar proposta</button>
    `
  });
}
// --- Passo "Cliente" da proposta: buscar OU criar novo -----------------
function omPropCliStepHTML() {
  const c = omPropCli;
  if (c.mode === 'selected' && c.id) {
    return `
      <div class="flex items-center justify-between gap-3 bg-neutral-950 border border-blue-500/40 px-3 py-3 mb-3">
        <div class="min-w-0 flex items-center gap-2">
          <i data-lucide="user-check" class="w-4 h-4 text-blue-400 shrink-0"></i>
          <div class="min-w-0">
            <div class="text-sm font-bold text-white truncate">${omEsc(c.nome)}</div>
            ${c.cidade ? `<div class="text-[11px] text-neutral-500 truncate">${omEsc(c.cidade)}</div>` : ''}
          </div>
        </div>
        <button type="button" onclick="omPropCliReset()" class="px-3 py-1.5 bg-neutral-900 border border-neutral-800 hover:border-neutral-700 text-neutral-300 font-black text-[10px] uppercase tracking-widest shrink-0">Trocar</button>
      </div>`;
  }
  if (c.mode === 'create') {
    return `
      <div class="bg-neutral-950 border border-neutral-800 p-3 mb-3">
        <div class="flex items-center justify-between mb-2">
          <div class="text-[11px] font-black uppercase tracking-widest text-neutral-400">Novo cliente</div>
          <button type="button" onclick="omPropCliReset()" class="text-[10px] font-black uppercase tracking-widest text-neutral-500 hover:text-white inline-flex items-center gap-1"><i data-lucide="arrow-left" class="w-3 h-3"></i>Buscar existente</button>
        </div>
        ${omField('Nome / razão social', `<input id="om-prop-newcli-nome" class="${OM_INPUT_CLS}" placeholder="Nome do cliente" />`)}
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          ${omField('Telefone', `<input id="om-prop-newcli-tel" class="${OM_INPUT_CLS}" placeholder="(00) 00000-0000" />`)}
          ${omField('Cidade', `<input id="om-prop-newcli-cidade" class="${OM_INPUT_CLS}" placeholder="Cidade/UF" />`)}
        </div>
        ${omField('Endereço', `<input id="om-prop-newcli-end" class="${OM_INPUT_CLS}" placeholder="Rua, número, bairro" />`)}
        <div class="text-[10px] text-neutral-600">O cliente é salvo na base ao criar a proposta.</div>
      </div>`;
  }
  // mode 'search'
  return `
    <div class="mb-3">
      <input id="om-prop-cli-q" type="text" autocomplete="off" oninput="omPropCliSearch(this.value)"
        placeholder="Buscar cliente por nome, telefone ou CPF/CNPJ"
        class="${OM_INPUT_CLS}" />
      <div id="om-prop-cli-results" class="mt-2"></div>
      <button type="button" onclick="omPropCliNew()" class="mt-2 w-full px-3 py-2.5 bg-neutral-950 border border-dashed border-neutral-700 hover:border-blue-500/50 text-neutral-300 hover:text-blue-300 font-black text-[10px] uppercase tracking-widest inline-flex items-center justify-center gap-2"><i data-lucide="user-plus" class="w-3.5 h-3.5"></i>O cliente não existe — cadastrar novo</button>
    </div>`;
}
function omPropCliRerender() {
  const el = document.getElementById('om-prop-cli-step');
  if (el) { el.innerHTML = omPropCliStepHTML(); queueAppLucideCreateIcons(); }
}
function omPropCliReset() { omPropCli = { mode: 'search', id: null, nome: '', cidade: '' }; omPropSisResetForClient(); omPropCliRerender(); }
function omPropCliNew()   { omPropCli = { mode: 'create', id: null, nome: '', cidade: '' }; omPropSisResetForClient(); omPropCliRerender(); }
function omPropCliSelect(id) {
  const c = _omClientCache[id] || { id, nome: 'Cliente', cidade: '' };
  omPropCli = { mode: 'selected', id, nome: c.nome, cidade: c.cidade };
  omPropSisResetForClient();
  omPropCliRerender();
}
// Sistema depende do cliente; ao trocar de cliente zera a seleção e os caches.
function omPropSisResetForClient() {
  omPropSis = { mode: 'none', id: null, label: '', origemId: null, prefill: {} };
  _omSisCache = {}; _omVendaCache = [];
  omPropSisRerender();
}
let _omPropCliTimer = null;
function omPropCliSearch(term) {
  clearTimeout(_omPropCliTimer);
  _omPropCliTimer = setTimeout(() => omPropCliSearchRun(term), 250);
}
async function omPropCliSearchRun(term) {
  const out = document.getElementById('om-prop-cli-results');
  if (!out) return;
  const q = (term || '').trim();
  if (!q) { out.innerHTML = ''; return; }
  let rows;
  try { rows = await omSearchClientes(q); }
  catch (e) { out.innerHTML = `<div class="text-[11px] text-red-400 px-1 py-1">${omEsc(omFriendlyErr(e))}</div>`; return; }
  if (!rows.length) {
    out.innerHTML = `<div class="text-[11px] text-neutral-500 px-1 py-1">Ninguém encontrado — use “cadastrar novo”.</div>`;
    return;
  }
  out.innerHTML = `
    <div class="bg-neutral-950 border border-neutral-800 divide-y divide-neutral-900 max-h-56 overflow-y-auto">
      ${rows.map(c => `
        <button type="button" onclick="omPropCliSelect('${c.id}')" class="w-full text-left flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-white/[0.03]">
          <div class="min-w-0">
            <div class="text-sm text-white font-bold truncate">${omEsc(c.nome)}</div>
            <div class="text-[11px] text-neutral-500 truncate">${omEsc(c.cidade || '—')} · ${omEsc(c.telefone || '—')}</div>
          </div>
          ${c.no_om ? omChip('O&M', 'blue') : omChip('CRM', 'gray')}
        </button>
      `).join('')}
    </div>`;
  queueAppLucideCreateIcons();
}

// --- Passo "Sistema / equipamento" da proposta -------------------------
function omPropSisRerender() {
  const el = document.getElementById('om-prop-sis-step');
  if (el) { el.innerHTML = omPropSisStepHTML(); queueAppLucideCreateIcons(); }
}
function omPropSisReset() {
  omPropSis = { mode: 'none', id: null, label: '', origemId: null, prefill: {} };
  omPropSisRerender();
}
function omPropSisStepHTML() {
  const s = omPropSis;
  if (s.mode === 'selected') {
    return `
      <div class="flex items-center justify-between gap-3 bg-neutral-950 border border-blue-500/40 px-3 py-3 mb-3">
        <div class="min-w-0 flex items-center gap-2">
          <i data-lucide="cpu" class="w-4 h-4 text-blue-400 shrink-0"></i>
          <div class="min-w-0">
            <div class="text-sm font-bold text-white truncate">${omEsc(s.label || 'Sistema selecionado')}</div>
            <div class="text-[11px] text-neutral-500">Vinculado à proposta</div>
          </div>
        </div>
        <button type="button" onclick="omPropSisReset()" class="px-3 py-1.5 bg-neutral-900 border border-neutral-800 hover:border-neutral-700 text-neutral-300 font-black text-[10px] uppercase tracking-widest shrink-0">Remover</button>
      </div>`;
  }
  if (s.mode === 'form') {
    const p = s.prefill || {};
    const v = (k) => p[k] != null ? omEsc(String(p[k])) : '';
    return `
      <div class="bg-neutral-950 border border-neutral-800 p-3 mb-3">
        <div class="flex items-center justify-between mb-2">
          <div class="text-[11px] font-black uppercase tracking-widest text-neutral-400">${s.origemId ? 'Importado da venda — confira/ajuste' : 'Cadastrar equipamento'}</div>
          <button type="button" onclick="omPropSisReset()" class="text-[10px] font-black uppercase tracking-widest text-neutral-500 hover:text-white inline-flex items-center gap-1"><i data-lucide="arrow-left" class="w-3 h-3"></i>Voltar</button>
        </div>
        ${omField('Apelido do sistema', `<input id="om-prop-sis-apelido" class="${OM_INPUT_CLS}" placeholder="Ex.: Galpão comercial" value="${v('apelido')}" />`)}
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          ${omField('Potência (kWp)', `<input id="om-prop-sis-pot" type="number" step="0.01" min="0" class="${OM_INPUT_CLS}" placeholder="Ex.: 8.40" value="${v('pot')}" />`)}
          ${omField('Qtd. de módulos', `<input id="om-prop-sis-qtdmod" type="number" step="1" min="0" class="${OM_INPUT_CLS}" placeholder="Ex.: 14" value="${v('qtdmod')}" />`)}
          ${omField('Marca dos módulos', `<input id="om-prop-sis-marcamod" class="${OM_INPUT_CLS}" placeholder="Ex.: Canadian Solar" value="${v('marcamod')}" />`)}
          ${omField('Modelo dos módulos', `<input id="om-prop-sis-modelomod" class="${OM_INPUT_CLS}" placeholder="Ex.: 550W" value="${v('modelomod')}" />`)}
          ${omField('Marca do inversor', `<input id="om-prop-sis-marcainv" class="${OM_INPUT_CLS}" placeholder="Ex.: Growatt" value="${v('marcainv')}" />`)}
          ${omField('Modelo do inversor', `<input id="om-prop-sis-modeloinv" class="${OM_INPUT_CLS}" placeholder="Ex.: MIN 5000TL-X" value="${v('modeloinv')}" />`)}
        </div>
        ${omField('Tipo de telhado', `<input id="om-prop-sis-telhado" class="${OM_INPUT_CLS}" placeholder="Ex.: Cerâmico / Metálico / Laje / Solo" value="${v('telhado')}" />`)}
        <div class="text-[10px] text-neutral-600">O sistema é salvo ao criar a proposta e aparece na página pública.</div>
      </div>`;
  }
  // mode 'none' — escolha como informar o sistema
  if (omPropCli.mode !== 'selected') {
    const msg = omPropCli.mode === 'create'
      ? 'Cliente novo não tem histórico — você pode cadastrar o equipamento manualmente.'
      : 'Escolha o cliente acima para puxar sistemas já cadastrados ou importar de uma venda.';
    return `
      <div class="bg-neutral-950 border border-neutral-800 p-3 mb-3">
        <div class="text-[11px] text-neutral-500 mb-2">${msg}</div>
        ${omPropCli.mode === 'create' ? `<button type="button" onclick="omPropSisManual()" class="w-full px-3 py-2.5 bg-neutral-900 border border-dashed border-neutral-700 hover:border-blue-500/50 text-neutral-300 hover:text-blue-300 font-black text-[10px] uppercase tracking-widest inline-flex items-center justify-center gap-2"><i data-lucide="plus" class="w-3.5 h-3.5"></i>Cadastrar equipamento manualmente</button>` : ''}
      </div>`;
  }
  return `
    <div class="bg-neutral-950 border border-neutral-800 p-3 mb-3">
      <div class="text-[11px] text-neutral-500 mb-2">Nenhum sistema vinculado. Opcional — deixe em branco para confirmar na visita.</div>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-2">
        <button type="button" onclick="omPropSisPickExistentes()" class="px-3 py-2.5 bg-neutral-900 border border-neutral-800 hover:border-blue-500/40 hover:text-blue-300 text-neutral-300 font-black text-[10px] uppercase tracking-widest inline-flex items-center justify-center gap-2"><i data-lucide="cpu" class="w-3.5 h-3.5"></i>Já cadastrado</button>
        <button type="button" onclick="omPropSisPickImport()" class="px-3 py-2.5 bg-neutral-900 border border-neutral-800 hover:border-blue-500/40 hover:text-blue-300 text-neutral-300 font-black text-[10px] uppercase tracking-widest inline-flex items-center justify-center gap-2"><i data-lucide="download" class="w-3.5 h-3.5"></i>Importar de venda</button>
        <button type="button" onclick="omPropSisManual()" class="px-3 py-2.5 bg-neutral-900 border border-neutral-800 hover:border-blue-500/40 hover:text-blue-300 text-neutral-300 font-black text-[10px] uppercase tracking-widest inline-flex items-center justify-center gap-2"><i data-lucide="plus" class="w-3.5 h-3.5"></i>Cadastrar manual</button>
      </div>
      <div id="om-prop-sis-results" class="mt-2"></div>
    </div>`;
}
function omPropSisManual() {
  omPropSis = { mode: 'form', id: null, label: '', origemId: null, prefill: {} };
  omPropSisRerender();
}
function omPropSisSelectExistente(id) {
  const s = _omSisCache[id];
  if (!s) return;
  const parts = [];
  if (s.potencia_kwp != null) parts.push(s.potencia_kwp + ' kWp');
  if (s.quantidade_modulos != null) parts.push(s.quantidade_modulos + ' módulos');
  if (s.marca_inversor) parts.push('Inv. ' + s.marca_inversor);
  const label = (s.apelido ? s.apelido + ' · ' : '') + (parts.join(' · ') || 'Sistema');
  omPropSis = { mode: 'selected', id, label, origemId: null, prefill: {} };
  omPropSisRerender();
}
async function omPropSisPickExistentes() {
  const out = document.getElementById('om-prop-sis-results');
  if (!out || !omPropCli.id) return;
  out.innerHTML = `<div class="text-[11px] text-neutral-500 px-1 py-1">Carregando…</div>`;
  let rows;
  try {
    const { data, error } = await supabaseClient.rpc('list_om_sistemas', { p_cliente_id: omPropCli.id });
    if (error) throw error;
    rows = data || [];
  } catch (e) { out.innerHTML = `<div class="text-[11px] text-red-400 px-1 py-1">${omEsc(omFriendlyErr(e))}</div>`; return; }
  _omSisCache = {}; rows.forEach(r => { _omSisCache[r.id] = r; });
  if (!rows.length) { out.innerHTML = `<div class="text-[11px] text-neutral-500 px-1 py-1">Nenhum sistema cadastrado para este cliente — use “importar” ou “cadastrar manual”.</div>`; return; }
  out.innerHTML = `
    <div class="bg-neutral-950 border border-neutral-800 divide-y divide-neutral-900 max-h-56 overflow-y-auto">
      ${rows.map(s => {
        const det = [s.potencia_kwp != null ? s.potencia_kwp + ' kWp' : null, s.quantidade_modulos != null ? s.quantidade_modulos + ' mód.' : null, s.marca_inversor ? 'Inv. ' + s.marca_inversor : null].filter(Boolean).join(' · ');
        return `<button type="button" onclick="omPropSisSelectExistente('${s.id}')" class="w-full text-left px-3 py-2.5 hover:bg-white/[0.03]">
          <div class="text-sm text-white font-bold truncate">${omEsc(s.apelido || 'Sistema')}</div>
          <div class="text-[11px] text-neutral-500 truncate">${omEsc(det || '—')}</div>
        </button>`;
      }).join('')}
    </div>`;
  queueAppLucideCreateIcons();
}
async function omPropSisPickImport() {
  const out = document.getElementById('om-prop-sis-results');
  if (!out || !omPropCli.id) return;
  out.innerHTML = `<div class="text-[11px] text-neutral-500 px-1 py-1">Carregando vendas…</div>`;
  let rows;
  try {
    const { data, error } = await supabaseClient.rpc('list_om_vendas_cliente', { p_cliente_id: omPropCli.id });
    if (error) throw error;
    rows = data || [];
  } catch (e) { out.innerHTML = `<div class="text-[11px] text-red-400 px-1 py-1">${omEsc(omFriendlyErr(e))}</div>`; return; }
  _omVendaCache = rows;
  if (!rows.length) { out.innerHTML = `<div class="text-[11px] text-neutral-500 px-1 py-1">Nenhuma venda/orçamento deste cliente no CRM — use “cadastrar manual”.</div>`; return; }
  out.innerHTML = `
    <div class="bg-neutral-950 border border-neutral-800 divide-y divide-neutral-900 max-h-56 overflow-y-auto">
      ${rows.map((vd, i) => {
        const det = [vd.potencia_kwp != null ? vd.potencia_kwp + ' kWp' : null, vd.modulo_qty != null ? vd.modulo_qty + '× ' + (vd.modulo_nome || 'mód.') : (vd.modulo_nome || null), vd.inversor_nome ? 'Inv. ' + vd.inversor_nome : null].filter(Boolean).join(' · ');
        return `<button type="button" onclick="omPropSisImportPick(${i})" class="w-full text-left px-3 py-2.5 hover:bg-white/[0.03]">
          <div class="text-sm text-white font-bold truncate">${omEsc(vd.kit_nome || vd.numero || 'Venda')}</div>
          <div class="text-[11px] text-neutral-500 truncate">${omEsc(det || '—')}</div>
        </button>`;
      }).join('')}
    </div>`;
  queueAppLucideCreateIcons();
}
function omPropSisImportPick(i) {
  const vd = _omVendaCache[i];
  if (!vd) return;
  omPropSis = {
    mode: 'form', id: null, origemId: vd.id, label: '',
    prefill: {
      apelido:   vd.kit_nome || '',
      pot:       vd.potencia_kwp != null ? vd.potencia_kwp : '',
      qtdmod:    vd.modulo_qty != null ? vd.modulo_qty : '',
      marcamod:  vd.kit_brand || '',
      modelomod: vd.modulo_nome || '',
      marcainv:  '',
      modeloinv: vd.inversor_nome || '',
      telhado:   '',
    },
  };
  omPropSisRerender();
}
// Resolve o sistema no submit; retorna o sistema_id (ou null). Pode criar um om_sistema.
async function omPropSisResolve(clienteId) {
  if (omPropSis.mode === 'selected') return omPropSis.id || null;
  if (omPropSis.mode !== 'form') return null;
  const val = (id) => (document.getElementById(id)?.value || '').trim();
  const apelido = val('om-prop-sis-apelido');
  const pot     = val('om-prop-sis-pot');
  const qtdmod  = val('om-prop-sis-qtdmod');
  const marcamod = val('om-prop-sis-marcamod');
  const modelomod = val('om-prop-sis-modelomod');
  const marcainv = val('om-prop-sis-marcainv');
  const modeloinv = val('om-prop-sis-modeloinv');
  const telhado  = val('om-prop-sis-telhado');
  const algumPreenchido = [apelido, pot, qtdmod, marcamod, modelomod, marcainv, modeloinv, telhado].some(Boolean) || omPropSis.origemId;
  if (!algumPreenchido) return null; // form aberto mas vazio → sem sistema
  const { data, error } = await supabaseClient.rpc('create_om_sistema', {
    p_cliente_id: clienteId,
    p_apelido: apelido || null,
    p_potencia_kwp: pot ? parseFloat(pot) : null,
    p_quantidade_modulos: qtdmod ? parseInt(qtdmod, 10) : null,
    p_marca_modulos: marcamod || null,
    p_modelo_modulos: modelomod || null,
    p_marca_inversor: marcainv || null,
    p_modelo_inversor: modeloinv || null,
    p_tipo_telhado: telhado || null,
    p_proposta_origem_id: omPropSis.origemId || null,
    p_franquia_id: state.franquiaId || null,
  });
  if (error || !data) throw error || new Error('Falha ao salvar o sistema.');
  return data;
}

async function omSubmitProposta(nextAction = 'rascunho') {
  const form = document.getElementById('om-form-prop');
  if (!form) return;
  const fd = new FormData(form);
  const servicoId = fd.get('servicoId');
  if (!servicoId) { if (typeof showToast === 'function') showToast('Selecione o serviço.'); return; }

  // Resolve o cliente: já selecionado OU cadastrar agora um novo.
  let clienteId = omPropCli.id;
  if (omPropCli.mode === 'create') {
    const nome = (document.getElementById('om-prop-newcli-nome')?.value || '').trim();
    if (!nome) { if (typeof showToast === 'function') showToast('Informe o nome do novo cliente.'); return; }
    omSetModalBusy(true);
    try {
      const cidade = (document.getElementById('om-prop-newcli-cidade')?.value || '').trim();
      const { data: newCliId, error: cliErr } = await supabaseClient.rpc('create_om_cliente', {
        p_nome: nome,
        p_telefone: (document.getElementById('om-prop-newcli-tel')?.value || '').trim() || null,
        p_cidade: cidade || null,
        p_endereco: (document.getElementById('om-prop-newcli-end')?.value || '').trim() || null,
        p_origem: 'manual',
        p_franquia_id: state.franquiaId || null,
      });
      if (cliErr || !newCliId) throw cliErr || new Error('Falha ao cadastrar o cliente.');
      clienteId = newCliId;
      _omClientCache[newCliId] = { id: newCliId, nome: nome.toUpperCase(), cidade };
    } catch (e) {
      omSetModalBusy(false);
      if (typeof showToast === 'function') showToast(omFriendlyErr(e));
      return;
    }
  }
  if (!clienteId) { if (typeof showToast === 'function') showToast('Selecione ou cadastre um cliente.'); return; }

  omSetModalBusy(true);
  try {
    // Resolve o sistema/equipamento (pode criar um om_sistema ou importar de venda).
    const sistemaId = await omPropSisResolve(clienteId);

    const { data: newId, error } = await supabaseClient.rpc('create_om_proposta', {
      p_cliente_id: clienteId,
      p_servico_id: servicoId,
      p_sistema_id: sistemaId,
      p_valor: parseFloat(fd.get('valor')) || 0,
      p_condicao_pagamento: (fd.get('pagamento') || '').trim() || null,
      p_validade: fd.get('validade') || null,
      p_descricao: (fd.get('descricao') || '').trim() || null,
      p_observacoes_internas: (fd.get('obs') || '').trim() || null,
    });
    if (error || !newId) throw error || new Error('Falha ao criar a proposta.');

    if (nextAction === 'enviar') {
      const { error: pubErr } = await supabaseClient.rpc('publish_om_proposta', { p_id: newId });
      if (pubErr) throw pubErr;
    }

    omCloseModal();
    omPropDetailCache = { id: null, data: null };
    if (typeof showToast === 'function') showToast(nextAction === 'enviar' ? 'Proposta criada e enviada.' : 'Rascunho de proposta criado.');
    omOpenPropostaDetail(newId);
  } catch (e) {
    omSetModalBusy(false);
    if (typeof showToast === 'function') showToast(omFriendlyErr(e));
  }
}

// Card de sistema/equipamento no detalhe da proposta (null = sem sistema vinculado).
function omPropSistemaCardHTML(s) {
  if (!s) return '';
  const modulos = s.quantidade_modulos != null
    ? `${s.quantidade_modulos}× ${omEsc(s.modelo_modulos || s.marca_modulos || '')}`.trim()
    : omEsc(s.modelo_modulos || s.marca_modulos || '');
  const inversor = [s.marca_inversor, s.modelo_inversor].filter(Boolean).join(' ');
  const cells = [
    ['zap', 'Potência', s.potencia_kwp != null ? `${s.potencia_kwp} kWp` : null],
    ['grid-3x3', 'Módulos', modulos || null],
    ['box', 'Inversor', inversor || null],
    ['home', 'Telhado', s.tipo_telhado || null],
  ].filter(c => c[2]);
  if (!cells.length) return '';
  return `
    <div class="bg-neutral-900/40 border border-neutral-800 p-5">
      <div class="flex items-center justify-between gap-2 mb-3">
        <div class="text-[10px] font-black uppercase tracking-widest text-neutral-500">Sistema / equipamento</div>
        ${s.apelido ? `<div class="text-[11px] text-neutral-400 font-bold truncate">${omEsc(s.apelido)}</div>` : ''}
      </div>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        ${cells.map(([icon, k, val]) => `
          <div>
            <div class="text-[10px] font-black uppercase tracking-widest text-neutral-500 inline-flex items-center gap-1"><i data-lucide="${icon}" class="w-3 h-3"></i>${k}</div>
            <div class="text-sm font-bold text-white mt-1">${omEsc(val)}</div>
          </div>`).join('')}
      </div>
    </div>`;
}

async function renderOMPropostaDetail(container, id) {
  if (omPropDetailCache.id !== id || !omPropDetailCache.data) {
    container.innerHTML = `<div class="om-env animate-fade-in-up">${omPropLoadingHTML('Abrindo proposta…')}</div>`;
    queueAppLucideCreateIcons();
    const { data, error } = await supabaseClient.rpc('get_om_proposta', { p_id: id });
    if (error || !data) {
      container.innerHTML = `<div class="om-env animate-fade-in-up">
        ${omPropErroHTML(error || new Error('Proposta não encontrada.'))}
        <div class="text-center mt-3"><button onclick="omClosePropostaDetail()" class="px-3 py-2 bg-neutral-900 border border-neutral-800 hover:border-neutral-700 text-neutral-300 font-black text-[10px] uppercase tracking-widest">Voltar</button></div>
      </div>`;
      queueAppLucideCreateIcons();
      return;
    }
    omPropDetailCache = { id, data };
  }
  omPaintPropostaDetail(container, omPropDetailCache.data);
}

function omPaintPropostaDetail(container, p) {
  const cli = p.cliente || {};
  const statusLabel = omPropStatusLabel(p.status);
  const isRascunho = p.status === 'rascunho';
  const podeResponder = p.status === 'enviada' || p.status === 'visualizada';
  const isAprovada = p.status === 'aprovada';
  const endereco = [cli.endereco, cli.numero].filter(Boolean).join(', ') || cli.bairro || '—';
  const token = p.public_token || '';

  const timeline = [{ ts: p.criado_em, when: omFmtDateTime(p.criado_em), what: 'Proposta criada', note: '', tone: 'gray' }];
  if (p.enviada_em) timeline.push({ ts: p.enviada_em, when: omFmtDateTime(p.enviada_em), what: 'Enviada ao cliente', note: 'Link público disponível.', tone: 'blue' });

  // Visualizações: a auditoria (om_proposta_eventos) distingue cliente de vendedor.
  // Propostas anteriores à auditoria caem no fallback do timestamp visualizada_em.
  const vistas = (p.eventos || []).filter(e => e.tipo === 'visualizada');
  if (vistas.length) {
    vistas.forEach(e => {
      if (e.ator === 'vendedor') {
        timeline.push({
          ts: e.created_at, when: omFmtDateTime(e.created_at),
          what: `Aberta pelo vendedor${e.ator_nome ? ' · ' + omEsc(e.ator_nome) : ''}`,
          note: 'Acesso interno — não conta como visualização do cliente.', tone: 'gray',
        });
      } else {
        timeline.push({ ts: e.created_at, when: omFmtDateTime(e.created_at), what: 'Visualizada pelo cliente', note: '', tone: 'orange' });
      }
    });
  } else if (p.visualizada_em) {
    timeline.push({ ts: p.visualizada_em, when: omFmtDateTime(p.visualizada_em), what: 'Visualizada pelo cliente', note: '', tone: 'orange' });
  }

  // Edições — quem editou e o quê (a partir do metadata do evento).
  (p.eventos || []).filter(e => e.tipo === 'editada').forEach(e => {
    timeline.push({
      ts: e.created_at, when: omFmtDateTime(e.created_at),
      what: `Editada${e.ator_nome ? ' por ' + omEsc(e.ator_nome) : ''}`,
      note: omEsc(omPropEditResumo(e.metadata)) || 'Alteração registrada.',
      tone: 'blue',
    });
  });

  if (p.aprovada_em)  timeline.push({ ts: p.aprovada_em,  when: omFmtDateTime(p.aprovada_em),  what: 'Aprovada — pronta para OS', note: '', tone: 'neutral' });
  if (p.recusada_em)  timeline.push({ ts: p.recusada_em,  when: omFmtDateTime(p.recusada_em),  what: 'Recusada pelo cliente',     note: '', tone: 'red' });
  if (p.cancelada_em) timeline.push({ ts: p.cancelada_em, when: omFmtDateTime(p.cancelada_em), what: 'Cancelada',                 note: '', tone: 'gray' });

  timeline.sort((a, b) => new Date(a.ts || 0) - new Date(b.ts || 0));

  const ac = p.aceite;
  const aceiteCard = ac ? `
    <div class="bg-neutral-900/40 border border-neutral-800 p-5">
      <div class="flex items-center justify-between gap-2 mb-3">
        <div class="text-[10px] font-black uppercase tracking-widest text-neutral-500">Aceite do cliente</div>
        ${ac.tem_selo
          ? (ac.selo_valido
              ? '<span class="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-blue-300"><i data-lucide="shield-check" class="w-3.5 h-3.5"></i>Selo verificado</span>'
              : '<span class="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-red-400"><i data-lucide="shield-alert" class="w-3.5 h-3.5"></i>Selo inválido</span>')
          : ''}
      </div>
      <div class="text-sm text-white">Aceito por <span class="font-black">${omEsc(ac.nome || '—')}</span></div>
      <div class="text-[12px] text-neutral-400 mt-0.5">${omFmtDateTime(ac.em)}${ac.ip ? ' · IP ' + omEsc(ac.ip) : ''}</div>
      ${ac.assinatura ? `<div class="mt-3 bg-white border border-neutral-700 p-2 inline-block">
        <img src="${omEsc(ac.assinatura)}" alt="Assinatura do cliente" class="block max-w-full" style="max-height:120px;" />
      </div>` : ''}
      ${ac.texto ? `<div class="text-[11px] text-neutral-500 mt-3 leading-relaxed whitespace-pre-line border-t border-neutral-800 pt-3">${omEsc(ac.texto)}</div>` : ''}
    </div>` : '';

  // Editável só antes do aceite (rascunho/enviada/visualizada e sem aceite assinado).
  const podeEditar = (isRascunho || podeResponder) && !p.aceite;
  const acoesBtns = [];
  if (podeEditar) {
    acoesBtns.push(`<button onclick="omPropEditar('${p.id}')" class="w-full px-3 py-2.5 bg-neutral-950 border border-neutral-800 hover:border-neutral-700 text-white font-black text-[10px] uppercase tracking-widest inline-flex items-center gap-2"><i data-lucide="pencil" class="w-3.5 h-3.5"></i>Editar</button>`);
  }
  if (isRascunho) {
    acoesBtns.push(`<button onclick="omPropSetStatus('${p.id}','Enviada')" class="w-full px-3 py-2.5 bg-neutral-950 border border-neutral-800 hover:border-blue-500/40 hover:text-blue-300 text-white font-black text-[10px] uppercase tracking-widest inline-flex items-center gap-2"><i data-lucide="send" class="w-3.5 h-3.5"></i>Marcar como enviada</button>`);
  }
  if (podeResponder) {
    acoesBtns.push(`<button onclick="omPropSetStatus('${p.id}','Aprovada')" class="w-full px-3 py-2.5 bg-neutral-950 border border-neutral-800 hover:border-blue-500/40 hover:text-blue-300 text-white font-black text-[10px] uppercase tracking-widest inline-flex items-center gap-2"><i data-lucide="check-circle-2" class="w-3.5 h-3.5"></i>Marcar como aprovada</button>`);
    acoesBtns.push(`<button onclick="omPropSetStatus('${p.id}','Recusada')" class="w-full px-3 py-2.5 bg-neutral-950 border border-neutral-800 hover:border-red-500/40 hover:text-red-300 text-white font-black text-[10px] uppercase tracking-widest inline-flex items-center gap-2"><i data-lucide="x-circle" class="w-3.5 h-3.5"></i>Marcar como recusada</button>`);
  }

  container.innerHTML = `
    <div class="om-env animate-fade-in-up">
      <div class="flex items-center gap-2 mb-3 flex-wrap">
        <button onclick="omClosePropostaDetail()" class="px-3 py-2 bg-neutral-900 border border-neutral-800 hover:border-neutral-700 text-neutral-300 font-black text-[10px] uppercase tracking-widest inline-flex items-center gap-2"><i data-lucide="arrow-left" class="w-3.5 h-3.5"></i>Voltar</button>
        <div class="text-[10px] font-black uppercase tracking-widest text-neutral-500">Proposta O&M</div>
        <div class="text-sm font-black text-white">${omEsc(p.numero || '—')}</div>
        <div class="ml-auto">${omChip(statusLabel, OM_PROP_STATUS_TONE[statusLabel] || 'gray')}</div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div class="lg:col-span-2 space-y-4">
          <div class="bg-neutral-900/40 border border-neutral-800 p-5">
            <div class="text-[10px] font-black uppercase tracking-widest text-neutral-500 mb-2">Cliente</div>
            <div class="text-lg font-black text-white">${omEsc(cli.nome || '—')}</div>
            <div class="text-sm text-neutral-400 mt-1">${omEsc(endereco)} · ${omEsc(cli.cidade || '—')}</div>
            <div class="text-sm text-neutral-400">${omEsc(cli.telefone || '—')}</div>
          </div>

          <div class="bg-neutral-900/40 border border-neutral-800 p-5">
            <div class="text-[10px] font-black uppercase tracking-widest text-neutral-500 mb-2">Serviço</div>
            <div class="text-base font-bold text-white">${omEsc(p.tipo_servico || '—')}</div>
            <div class="text-sm text-neutral-400 mt-2 whitespace-pre-line">${omEsc(p.descricao || 'Sem descrição.')}</div>
          </div>

          ${omPropSistemaCardHTML(p.sistema)}

          <div class="bg-neutral-900/40 border border-neutral-800 p-5 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div><div class="text-[10px] font-black uppercase tracking-widest text-neutral-500">Valor total</div><div class="text-2xl font-black text-blue-400 mt-1">${omFormatBRL(p.valor_final)}</div></div>
            <div><div class="text-[10px] font-black uppercase tracking-widest text-neutral-500">Condição</div><div class="text-sm font-bold text-white mt-1.5">${omEsc(p.condicao_pagamento || '—')}</div></div>
            <div><div class="text-[10px] font-black uppercase tracking-widest text-neutral-500">Validade</div><div class="text-sm font-bold text-white mt-1.5">${omFormatDate(p.validade)}</div></div>
          </div>

          <div class="bg-neutral-900/40 border border-neutral-800 p-5">
            <div class="text-[10px] font-black uppercase tracking-widest text-neutral-500 mb-3">Histórico</div>
            ${omTimelineHTML(timeline)}
          </div>

          ${aceiteCard}
        </div>

        <div class="space-y-4">
          <div class="bg-neutral-900/40 border border-neutral-800 p-5">
            <div class="text-[10px] font-black uppercase tracking-widest text-neutral-500 mb-3">Página pública</div>
            ${isRascunho ? `
              <div class="text-[11px] text-neutral-500 bg-neutral-950 border border-neutral-800 p-3">Publique a proposta (Marcar como enviada) para liberar o link público do cliente.</div>
            ` : `
              <div class="space-y-2">
                <button onclick="omAbrirPropostaPublica('${token}')" class="w-full px-3 py-2.5 bg-blue-500 hover:bg-blue-400 text-blue-950 font-black text-[10px] uppercase tracking-widest inline-flex items-center justify-center gap-2"><i data-lucide="external-link" class="w-3.5 h-3.5 stroke-[3]"></i>Ver proposta pública</button>
                <button onclick="omCopiarLinkProposta('${token}')" class="w-full px-3 py-2.5 bg-neutral-950 border border-neutral-800 hover:border-blue-500/40 hover:text-blue-300 text-white font-black text-[10px] uppercase tracking-widest inline-flex items-center justify-center gap-2"><i data-lucide="link-2" class="w-3.5 h-3.5"></i>Copiar link</button>
                <div class="text-[10px] text-neutral-500 text-center mt-1">Link público — o cliente abre direto, sem login.</div>
              </div>
            `}
          </div>

          <div class="bg-neutral-900/40 border border-neutral-800 p-5">
            <div class="text-[10px] font-black uppercase tracking-widest text-neutral-500 mb-3">Ações</div>
            <div class="space-y-2">${acoesBtns.length ? acoesBtns.join('') : '<div class="text-[10px] text-neutral-500">Nenhuma ação disponível neste status.</div>'}</div>
          </div>

          <div class="bg-neutral-900/40 border border-neutral-800 p-5">
            <div class="text-[10px] font-black uppercase tracking-widest text-neutral-500 mb-3">Próximo passo</div>
            ${p.os && p.os.id ? `
              <button onclick="omAbrirOSDaProposta('${omEsc(p.os.id)}')" class="w-full px-3 py-3 bg-emerald-500 hover:bg-emerald-400 text-emerald-950 font-black text-[10px] uppercase tracking-widest inline-flex items-center justify-center gap-2"><i data-lucide="clipboard-check" class="w-3.5 h-3.5 stroke-[3]"></i>OS já gerada${p.os.numero ? ' (' + omEsc(p.os.numero) + ')' : ''} → abrir</button>
            ` : (isAprovada && (state.isAdmin || state.isGestor || state.isCoordenador)) ? `
              <button onclick="omOpenCreateOSFromProposta('${p.id}')" class="w-full px-3 py-3 bg-blue-500 hover:bg-blue-400 text-blue-950 font-black text-[10px] uppercase tracking-widest inline-flex items-center justify-center gap-2"><i data-lucide="clipboard-list" class="w-3.5 h-3.5 stroke-[3]"></i>Gerar OS</button>
            ` : isAprovada ? `
              <div class="text-[10px] text-neutral-500">A OS desta proposta é gerada por um coordenador, gerente ou admin.</div>
            ` : `
              <div class="text-[10px] text-neutral-500">A geração de OS fica disponível quando a proposta estiver Aprovada.</div>
            `}
          </div>
        </div>
      </div>
    </div>
  `;
  queueAppLucideCreateIcons();
}

async function omPropSetStatus(id, statusLabel) {
  try {
    if (statusLabel === 'Enviada') {
      const { error } = await supabaseClient.rpc('publish_om_proposta', { p_id: id });
      if (error) throw error;
    } else {
      const map = {
        Aprovada:  ['aprovada', 'aprovada_em'],
        Recusada:  ['recusada', 'recusada_em'],
        Cancelada: ['cancelada', 'cancelada_em'],
      };
      const m = map[statusLabel];
      if (!m) { if (typeof showToast === 'function') showToast('Status inválido.'); return; }
      const patch = { status: m[0] };
      patch[m[1]] = new Date().toISOString();
      const { error } = await supabaseClient.from('om_propostas').update(patch).eq('id', id);
      if (error) throw error;
    }
    omPropDetailCache = { id: null, data: null };
    if (typeof showToast === 'function') showToast(`Proposta marcada como ${statusLabel}.`);
    renderContent();
  } catch (e) {
    if (typeof showToast === 'function') showToast(omFriendlyErr(e));
  }
}
// --- Edição de proposta (com auditoria) --------------------------------
const OM_PROP_FIELD_LABEL = {
  servico: 'Serviço', valor: 'Valor', desconto: 'Desconto', condicao_pagamento: 'Condição',
  validade: 'Validade', titulo: 'Título', descricao: 'Descrição',
  observacoes_cliente: 'Obs. do cliente', observacoes_internas: 'Obs. internas',
};
function omPropFmtVal(field, v) {
  if (v === null || v === undefined || v === '') return '—';
  if (field === 'valor' || field === 'desconto') return omFormatBRL(v);
  if (field === 'validade') return omFormatDate(v);
  const s = String(v);
  return s.length > 40 ? s.slice(0, 40) + '…' : s;
}
// Resumo legível do diff guardado em metadata.campos { campo: {de, para} }
function omPropEditResumo(metadata) {
  const campos = (metadata && metadata.campos) || {};
  return Object.keys(campos).map(k => {
    const d = campos[k] || {};
    return `${OM_PROP_FIELD_LABEL[k] || k}: ${omPropFmtVal(k, d.de)} → ${omPropFmtVal(k, d.para)}`;
  }).join(' · ');
}

async function omPropEditar(id) {
  const p = (omPropDetailCache.id === id) ? omPropDetailCache.data : null;
  if (!p) { if (typeof showToast === 'function') showToast('Abra a proposta para editá-la.'); return; }

  let servicos = [];
  try {
    const r = await supabaseClient.from('om_servicos').select('id,nome,tipo').eq('ativo', true).order('nome');
    if (r.error) throw r.error;
    servicos = r.data || [];
  } catch (e) { if (typeof showToast === 'function') showToast(omFriendlyErr(e)); return; }

  omOpenModal({
    title: 'Editar proposta',
    subtitle: `${omEsc(p.numero || '')} · alterações ficam no histórico`,
    icon: 'pencil',
    size: 'lg',
    bodyHTML: `
      <form id="om-form-prop-edit" onsubmit="event.preventDefault(); omSubmitPropEdit('${id}');">
        <input type="hidden" name="titulo" value="${omEsc(p.titulo || '')}" />
        <div class="text-[10px] font-black uppercase tracking-widest text-blue-400/80 mb-1">Serviço</div>
        ${omField('Tipo de serviço', `
          <select name="servicoId" required class="${OM_INPUT_CLS}">
            ${servicos.map(s => `<option value="${s.id}" ${s.id === p.servico_id ? 'selected' : ''}>${omEsc(s.nome)}</option>`).join('')}
          </select>
        `)}
        ${omField('Descrição / escopo', `<textarea name="descricao" rows="3" class="${OM_INPUT_CLS}">${omEsc(p.descricao || '')}</textarea>`)}
        ${omField('Observações internas', `<textarea name="obsInt" rows="2" class="${OM_INPUT_CLS}" placeholder="Não aparecem para o cliente">${omEsc(p.observacoes_internas || '')}</textarea>`)}
        ${omField('Observações para o cliente', `<textarea name="obsCli" rows="2" class="${OM_INPUT_CLS}">${omEsc(p.observacoes_cliente || '')}</textarea>`)}

        <div class="text-[10px] font-black uppercase tracking-widest text-blue-400/80 mb-1 mt-4">Valores</div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          ${omField('Valor (R$)', `<input name="valor" type="number" step="0.01" min="0" value="${p.valor != null ? p.valor : ''}" class="${OM_INPUT_CLS}" />`)}
          ${omField('Desconto (R$)', `<input name="desconto" type="number" step="0.01" min="0" value="${p.desconto != null ? p.desconto : ''}" class="${OM_INPUT_CLS}" />`)}
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          ${omField('Condição de pagamento', `<input name="pagamento" value="${omEsc(p.condicao_pagamento || '')}" class="${OM_INPUT_CLS}" placeholder="Ex.: Pix à vista" />`)}
          ${omField('Válida até', `<input name="validade" type="date" value="${omEsc((p.validade || '').slice(0, 10))}" class="${OM_INPUT_CLS}" />`)}
        </div>
        <div class="text-[10px] text-neutral-600 mt-1">O cliente é o mesmo — para trocar de cliente, crie uma nova proposta.</div>
      </form>
    `,
    footerHTML: `
      <button onclick="omCloseModal()" class="px-4 py-2.5 bg-neutral-900 border border-neutral-800 hover:border-neutral-700 text-neutral-300 font-black text-[10px] uppercase tracking-widest">Cancelar</button>
      <button onclick="omSubmitPropEdit('${id}')" class="px-4 py-2.5 bg-blue-500 hover:bg-blue-400 text-blue-950 font-black text-[10px] uppercase tracking-widest inline-flex items-center gap-2"><i data-lucide="check" class="w-3.5 h-3.5 stroke-[3]"></i>Salvar alterações</button>
    `
  });
}

async function omSubmitPropEdit(id) {
  const form = document.getElementById('om-form-prop-edit');
  if (!form) return;
  const fd = new FormData(form);
  const servicoId = fd.get('servicoId');
  if (!servicoId) { if (typeof showToast === 'function') showToast('Selecione o serviço.'); return; }

  omSetModalBusy(true);
  try {
    const { data, error } = await supabaseClient.rpc('update_om_proposta', {
      p_id: id,
      p_servico_id: servicoId,
      p_valor: parseFloat(fd.get('valor')) || 0,
      p_desconto: parseFloat(fd.get('desconto')) || 0,
      p_condicao_pagamento: (fd.get('pagamento') || '').trim() || null,
      p_validade: fd.get('validade') || null,
      p_titulo: (fd.get('titulo') || '').trim() || null,
      p_descricao: (fd.get('descricao') || '').trim() || null,
      p_observacoes_cliente: (fd.get('obsCli') || '').trim() || null,
      p_observacoes_internas: (fd.get('obsInt') || '').trim() || null,
    });
    if (error) throw error;

    omCloseModal();
    omPropDetailCache = { id: null, data: null };
    const changed = data && data.updated;
    if (typeof showToast === 'function') showToast(changed ? 'Proposta atualizada — registrado no histórico.' : 'Nenhuma alteração para salvar.');
    omOpenPropostaDetail(id);
  } catch (e) {
    omSetModalBusy(false);
    if (typeof showToast === 'function') showToast(omFriendlyErr(e));
  }
}

// Geração de OS a partir da proposta (gestor gera → atribui técnico).
// Backend: RPC create_os_from_om_proposta (anti-duplicação + evento os_gerada);
// técnicos via list_om_tecnicos; sistema via list_om_sistemas quando a proposta não tem.
async function omOpenCreateOSFromProposta(propId) {
  // Reusa a proposta já carregada no detalhe (traz .os, .sistema, .cliente, .numero).
  const p = (omPropDetailCache && omPropDetailCache.data && omPropDetailCache.data.id === propId)
    ? omPropDetailCache.data : null;

  // Se já existe OS vinculada, não gera de novo — abre a existente.
  if (p && p.os && p.os.id) { omAbrirOSDaProposta(p.os.id); return; }

  if (typeof showToast === 'function') showToast('Carregando dados da OS…');

  let tecnicos = [];
  try {
    const { data, error } = await supabaseClient.rpc('list_om_tecnicos');
    if (error) throw error;
    tecnicos = data || [];
  } catch (e) { if (typeof showToast === 'function') showToast(omFriendlyErr(e)); return; }
  if (!tecnicos.length) {
    if (typeof showToast === 'function') showToast('Nenhum técnico ativo na sua franquia. Cadastre um técnico antes de gerar a OS.');
    return;
  }

  // Sistema só é pedido quando a proposta não tem um vinculado (ex.: OM sem sistema).
  const precisaSistema = !(p && p.sistema && p.sistema.id);
  let sistemas = [];
  if (precisaSistema) {
    const cliId = p && p.cliente && p.cliente.id;
    if (!cliId) { if (typeof showToast === 'function') showToast('Não foi possível identificar o cliente da proposta.'); return; }
    try {
      const { data, error } = await supabaseClient.rpc('list_om_sistemas', { p_cliente_id: cliId });
      if (error) throw error;
      sistemas = data || [];
    } catch (e) { if (typeof showToast === 'function') showToast(omFriendlyErr(e)); return; }
    if (!sistemas.length) {
      if (typeof showToast === 'function') showToast('A proposta não tem sistema e o cliente não possui sistemas cadastrados. Cadastre um sistema antes de gerar a OS.');
      return;
    }
  }

  const sistemaField = precisaSistema ? omField('Sistema', `<select name="sistemaId" required class="${OM_INPUT_CLS}"><option value="">Selecionar...</option>${sistemas.map(s => {
    const det = [s.potencia_kwp != null ? s.potencia_kwp + ' kWp' : null, s.marca_inversor ? 'Inv. ' + s.marca_inversor : null].filter(Boolean).join(' · ');
    return `<option value="${omEsc(s.id)}">${omEsc((s.apelido || 'Sistema') + (det ? ' — ' + det : ''))}</option>`;
  }).join('')}</select>`) : '';

  omOpenModal({
    title: 'Gerar Ordem de Serviço',
    subtitle: p && p.numero ? ('A partir da proposta ' + p.numero) : '',
    icon: 'clipboard-list',
    bodyHTML: `
      <form id="om-form-gerar-os" onsubmit="event.preventDefault(); omSubmitCreateOSFromProposta('${omEsc(propId)}');">
        ${omField('Técnico responsável', `<select name="tecnicoId" required class="${OM_INPUT_CLS}"><option value="">Selecionar...</option>${tecnicos.map(t => `<option value="${omEsc(t.id)}">${omEsc(t.nome)}</option>`).join('')}</select>`)}
        ${sistemaField}
        ${omField('Agendar para (opcional)', `<input type="datetime-local" name="agendadoPara" class="${OM_INPUT_CLS}" />`)}
        ${omField('Prioridade', `<select name="prioridade" class="${OM_INPUT_CLS}"><option value="baixa">Baixa</option><option value="normal" selected>Normal</option><option value="alta">Alta</option><option value="urgente">Urgente</option></select>`)}
      </form>`,
    footerHTML: `
      <button onclick="omCloseModal()" class="px-4 py-2.5 bg-neutral-900 border border-neutral-800 text-neutral-300 font-black text-[10px] uppercase tracking-widest">Cancelar</button>
      <button onclick="document.getElementById('om-form-gerar-os').requestSubmit()" class="px-4 py-2.5 bg-blue-500 hover:bg-blue-400 text-blue-950 font-black text-[10px] uppercase tracking-widest">Gerar OS</button>`
  });
}

async function omSubmitCreateOSFromProposta(propId) {
  const form = document.getElementById('om-form-gerar-os');
  if (!form) return;
  const fd = new FormData(form);
  const tecnicoId = fd.get('tecnicoId');
  if (!tecnicoId) { if (typeof showToast === 'function') showToast('Selecione o técnico.'); return; }
  const temCampoSistema = !!form.querySelector('[name="sistemaId"]');
  const sistemaId = fd.get('sistemaId') || null;
  if (temCampoSistema && !sistemaId) { if (typeof showToast === 'function') showToast('Selecione o sistema.'); return; }
  const agRaw = fd.get('agendadoPara');
  const agendadoPara = agRaw ? new Date(agRaw).toISOString() : null;
  const prioridade = fd.get('prioridade') || 'normal';

  omSetModalBusy(true);
  const params = { p_proposta_id: propId, p_tecnico_id: tecnicoId, p_agendado_para: agendadoPara, p_prioridade: prioridade };
  if (sistemaId) params.p_sistema_id = sistemaId;
  const { data: osId, error } = await supabaseClient.rpc('create_os_from_om_proposta', params);
  omSetModalBusy(false);
  if (error) { if (typeof showToast === 'function') showToast(omFriendlyErr(error)); return; }
  omCloseModal();
  if (typeof showToast === 'function') showToast('Ordem de serviço gerada.');
  // Invalida o cache da proposta para refletir a OS recém-vinculada.
  if (omPropDetailCache && omPropDetailCache.id === propId) omPropDetailCache = { id: null, data: null };
  omAbrirOSDaProposta(osId);
}

function omAbrirOSDaProposta(osId) {
  if (typeof setTab === 'function') setTab('os');
  setTimeout(() => { if (typeof omOpenOSDetail === 'function') omOpenOSDetail(osId); }, 50);
}

// =======================================================================
// ROTA: OS
// =======================================================================
function renderOMOS(container) {
  if (state.omOsDetailId) return renderOMOSDetail(container, state.omOsDetailId);
  if (!state.omOsFilters) state.omOsFilters = { status: 'Todos', tecnico: 'Todos', cidade: 'Todos' };
  const f = state.omOsFilters;

  const statuses = ['Todos','Agendada','Em rota','Em execução','Aguardando aprovação extra','Concluída','Cancelada'];
  const tecnicos = ['Todos', ...Array.from(new Set(omServiceOrders.map(o => o.tecnico)))];
  const cidades  = ['Todos', ...Array.from(new Set(omServiceOrders.map(o => o.cidade)))];

  const rows = omServiceOrders.filter(o => {
    if (f.status !== 'Todos' && o.status !== f.status) return false;
    if (f.tecnico !== 'Todos' && o.tecnico !== f.tecnico) return false;
    if (f.cidade !== 'Todos' && o.cidade !== f.cidade) return false;
    return true;
  });

  const tone = s => ({
    'Agendada': 'yellow', 'Em rota': 'yellow', 'Em execução': 'blue',
    'Aguardando aprovação extra': 'orange', 'Concluída': 'emerald', 'Cancelada': 'red'
  })[s] || 'gray';

  container.innerHTML = `
    <div class="om-env animate-fade-in-up">
      ${omPageHeader({
        icon: 'clipboard-list',
        title: 'Ordens de Serviço',
        subtitle: 'Agendamento, execução e acompanhamento das visitas técnicas.',
        actions: omBtnPrimary('Nova OS', 'plus', 'omOpenCreateOS()')
      })}

      <div class="bg-neutral-900/40 border border-neutral-800 p-4 mb-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        ${omField('Status', `<select onchange="omOsSet('status', this.value)" class="${OM_INPUT_CLS}">${statuses.map(s => `<option ${s === f.status ? 'selected' : ''}>${s}</option>`).join('')}</select>`)}
        ${omField('Técnico', `<select onchange="omOsSet('tecnico', this.value)" class="${OM_INPUT_CLS}">${tecnicos.map(s => `<option ${s === f.tecnico ? 'selected' : ''}>${s}</option>`).join('')}</select>`)}
        ${omField('Cidade', `<select onchange="omOsSet('cidade', this.value)" class="${OM_INPUT_CLS}">${cidades.map(s => `<option ${s === f.cidade ? 'selected' : ''}>${s}</option>`).join('')}</select>`)}
      </div>

      ${rows.length === 0 ? omEmptyState({ icon: 'clipboard-list', title: 'Nenhuma OS', hint: 'Aprove uma proposta O&M para gerar uma OS.' }) : `
        <div class="bg-neutral-900/40 border border-neutral-800 overflow-x-auto">
          <table class="w-full">
            <thead>
              <tr class="bg-neutral-950 border-b border-neutral-800">
                ${['OS','Cliente','Serviço','Técnico','Data/Hora','Cidade','Origem','Status',''].map(h => `<th class="text-left text-[10px] font-black uppercase tracking-widest text-neutral-500 px-4 py-3">${h}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${rows.map(o => `
                <tr class="border-b border-neutral-900 hover:bg-white/[0.02]">
                  <td class="px-4 py-3.5 text-sm font-bold text-white">${o.id}</td>
                  <td class="px-4 py-3.5 text-sm text-white">${o.cliente}</td>
                  <td class="px-4 py-3.5 text-sm text-neutral-300">${o.servico}</td>
                  <td class="px-4 py-3.5 text-sm text-neutral-300">${o.tecnico}</td>
                  <td class="px-4 py-3.5 text-sm text-neutral-300">${o.data}</td>
                  <td class="px-4 py-3.5 text-sm text-neutral-300">${o.cidade}</td>
                  <td class="px-4 py-3.5 text-[11px] ${o.proposalNumber ? 'text-blue-300' : 'text-neutral-600'}">${o.proposalNumber ? o.proposalNumber : 'Manual'}</td>
                  <td class="px-4 py-3.5">${omChip(o.status, tone(o.status))}</td>
                  <td class="px-4 py-3.5 text-right">
                    <button onclick="omOpenOSDetail('${o.id}')" class="px-3 py-1.5 bg-neutral-900 border border-neutral-800 hover:border-blue-500/40 hover:text-blue-300 text-neutral-200 font-black text-[10px] uppercase tracking-widest">Abrir OS</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `}
    </div>
  `;
}
function omOsSet(field, val) { state.omOsFilters[field] = val; renderContent(); }
function omOpenOSDetail(id) { state.omOsDetailId = id; renderContent(); }
function omCloseOSDetail() { state.omOsDetailId = null; renderContent(); }

function omOpenCreateOS() {
  omOpenModal({
    title: 'Nova OS',
    icon: 'clipboard-list',
    bodyHTML: `
      <form id="om-form-os" onsubmit="event.preventDefault(); omSubmitCreateOS();">
        ${omField('Cliente', `<select name="clienteId" required class="${OM_INPUT_CLS}"><option value="">Selecionar...</option>${omClients.map(c => `<option value="${c.id}">${c.nome}</option>`).join('')}</select>`)}
        ${omField('Serviço', `<input name="servico" class="${OM_INPUT_CLS}" placeholder="Ex.: Limpeza + inspeção" />`)}
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          ${omField('Técnico', `<input name="tecnico" class="${OM_INPUT_CLS}" placeholder="Nome do técnico" />`)}
          ${omField('Data/Hora', `<input name="data" class="${OM_INPUT_CLS}" placeholder="DD/MM/AAAA HH:MM" />`)}
        </div>
      </form>
    `,
    footerHTML: `
      <button onclick="omCloseModal()" class="px-4 py-2.5 bg-neutral-900 border border-neutral-800 text-neutral-300 font-black text-[10px] uppercase tracking-widest">Cancelar</button>
      <button onclick="document.getElementById('om-form-os').requestSubmit()" class="px-4 py-2.5 bg-blue-500 hover:bg-blue-400 text-blue-950 font-black text-[10px] uppercase tracking-widest">Criar OS</button>
    `
  });
}
function omSubmitCreateOS() {
  const fd = new FormData(document.getElementById('om-form-os'));
  const cliId = fd.get('clienteId'); if (!cliId) return;
  const cli = omClients.find(c => c.id === cliId);
  const num = 424 + omServiceOrders.length;
  omServiceOrders.unshift({
    id: `OS-2026-0${num}`, clienteId: cliId, cliente: cli?.nome || '—',
    servico: fd.get('servico') || '—', tecnico: fd.get('tecnico') || '—',
    data: fd.get('data') || '—', cidade: cli?.cidade || '—',
    status: 'Agendada', statusTone: 'yellow',
    endereco: cli?.endereco || '—', sistema: { potencia: '—', modulos: '—', telhado: '—', inversor: '—' }, acesso: '—'
  });
  omCloseModal();
  if (typeof showToast === 'function') showToast('OS criada.');
  renderContent();
}

function renderOMOSDetail(container, id) {
  const o = omServiceOrders.find(x => x.id === id);
  if (!o) { state.omOsDetailId = null; return renderOMOS(container); }
  const cli = omClients.find(c => c.id === o.clienteId);

  container.innerHTML = `
    <div class="om-env animate-fade-in-up">
      <div class="flex items-center gap-2 mb-3">
        <button onclick="omCloseOSDetail()" class="px-3 py-2 bg-neutral-900 border border-neutral-800 hover:border-neutral-700 text-neutral-300 font-black text-[10px] uppercase tracking-widest inline-flex items-center gap-2"><i data-lucide="arrow-left" class="w-3.5 h-3.5"></i>Voltar</button>
        <div class="text-[10px] font-black uppercase tracking-widest text-neutral-500">OS</div>
        <div class="text-sm font-black text-white">${o.id}</div>
        <div class="ml-auto">${omChip(o.status, 'blue')}</div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div class="lg:col-span-2 space-y-4">
          <div class="bg-neutral-900/40 border border-neutral-800 p-5">
            <div class="text-[10px] font-black uppercase tracking-widest text-neutral-500 mb-2">Cliente</div>
            <div class="text-lg font-black text-white">${o.cliente}</div>
            <div class="text-sm text-neutral-400 mt-1">${o.endereco}</div>
            <div class="flex flex-wrap gap-2 mt-3">
              <a href="tel:${(cli?.telefone || '').replace(/\D/g,'')}" class="px-3 py-2 bg-neutral-950 border border-neutral-800 hover:border-blue-500/40 text-white text-[10px] font-black uppercase tracking-widest inline-flex items-center gap-2"><i data-lucide="phone" class="w-3.5 h-3.5"></i>Ligar</a>
              <a href="https://wa.me/55${(cli?.telefone || '').replace(/\D/g,'')}" target="_blank" class="px-3 py-2 bg-neutral-950 border border-neutral-800 hover:border-blue-500/40 text-white text-[10px] font-black uppercase tracking-widest inline-flex items-center gap-2"><i data-lucide="message-circle" class="w-3.5 h-3.5"></i>WhatsApp</a>
              <a href="https://maps.google.com/?q=${encodeURIComponent(o.endereco)}" target="_blank" class="px-3 py-2 bg-blue-500 hover:bg-blue-400 text-blue-950 text-[10px] font-black uppercase tracking-widest inline-flex items-center gap-2"><i data-lucide="navigation" class="w-3.5 h-3.5"></i>Abrir rota</a>
            </div>
          </div>

          <div class="bg-neutral-900/40 border border-neutral-800 p-5">
            <div class="text-[10px] font-black uppercase tracking-widest text-neutral-500 mb-2">Serviço contratado</div>
            <div class="text-base font-bold text-white">${o.servico}</div>
            <div class="text-sm text-neutral-400 mt-1">Agendado: <span class="text-white font-bold">${o.data}</span> · Técnico: <span class="text-white font-bold">${o.tecnico}</span></div>
            <div class="mt-3 text-[11px] text-neutral-400"><span class="text-neutral-500 font-bold uppercase tracking-widest">Acesso:</span> ${o.acesso}</div>
            ${o.proposalNumber ? `<div class="mt-3 inline-flex items-center gap-1.5 text-[11px] text-blue-300"><i data-lucide="link-2" class="w-3 h-3"></i>Origem: <button onclick="setTab('propostas'); omOpenPropostaDetail('${o.proposalId}')" class="font-bold underline hover:text-blue-200">${o.proposalNumber}</button></div>` : '<div class="mt-3 text-[11px] text-neutral-600">Origem: OS manual (sem proposta)</div>'}
          </div>

          <div class="bg-neutral-900/40 border border-neutral-800 p-5">
            <div class="text-[10px] font-black uppercase tracking-widest text-neutral-500 mb-3">Dados do sistema</div>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
              ${[['Potência', o.sistema.potencia], ['Módulos', o.sistema.modulos], ['Telhado', o.sistema.telhado], ['Inversor', o.sistema.inversor]]
                .map(([k,v]) => `<div class="bg-neutral-950 border border-neutral-800 p-3"><div class="text-[10px] font-black uppercase tracking-widest text-neutral-500">${k}</div><div class="text-sm font-bold text-white mt-1">${v}</div></div>`).join('')}
            </div>
          </div>

          <div class="bg-neutral-900/40 border border-neutral-800 p-5">
            <div class="flex items-center justify-between mb-3">
              <div class="text-[10px] font-black uppercase tracking-widest text-neutral-500">Checklist técnico</div>
              <button class="px-3 py-1.5 bg-blue-500 hover:bg-blue-400 text-blue-950 font-black text-[10px] uppercase tracking-widest inline-flex items-center gap-2"><i data-lucide="play" class="w-3.5 h-3.5 stroke-[3]"></i>Iniciar atendimento</button>
            </div>
            <div class="space-y-1.5">
              ${['Inspeção visual dos módulos','Limpeza geral','Aperto de conexões CC','Aperto de conexões CA','Verificação de DPS','Teste de geração'].map(item => `
                <label class="flex items-center gap-2.5 px-3 py-2 bg-neutral-950 border border-neutral-800 cursor-pointer hover:border-neutral-700">
                  <input type="checkbox" class="accent-blue-500" />
                  <span class="text-sm text-white">${item}</span>
                </label>
              `).join('')}
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
            ${['Fotos antes','Fotos depois','Evidências'].map(t => `
              <div class="bg-neutral-900/40 border-2 border-dashed border-neutral-800 p-5 text-center">
                <div class="inline-flex items-center justify-center w-10 h-10 bg-neutral-900 border border-neutral-800 mb-2 text-neutral-500"><i data-lucide="camera" class="w-5 h-5"></i></div>
                <div class="text-[11px] font-black uppercase tracking-widest text-neutral-300">${t}</div>
                <button class="mt-2 text-[10px] font-black uppercase tracking-widest text-blue-400 hover:text-blue-300">+ Adicionar</button>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="space-y-4">
          <div class="bg-neutral-900/40 border border-neutral-800 p-5">
            <div class="text-[10px] font-black uppercase tracking-widest text-neutral-500 mb-3">Estado geral</div>
            <div class="grid grid-cols-3 gap-2">
              ${['Bom','Atenção','Crítico'].map(s => `<button class="px-3 py-2.5 bg-neutral-950 border border-neutral-800 hover:border-blue-500/40 text-white text-[10px] font-black uppercase tracking-widest">${s}</button>`).join('')}
            </div>
          </div>
          <div class="bg-neutral-900/40 border border-neutral-800 p-5">
            <button class="w-full px-4 py-3 bg-blue-500 hover:bg-blue-400 text-blue-950 font-black text-[10px] uppercase tracking-widest inline-flex items-center justify-center gap-2"><i data-lucide="file-check-2" class="w-3.5 h-3.5 stroke-[3]"></i>Finalizar e gerar relatório</button>
            <div class="text-[10px] text-neutral-500 mt-2 text-center">Sem valores comerciais nessa visão.</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

// =======================================================================
// ROTA: PENDÊNCIAS
// =======================================================================
// Mapeamento label PT-BR ⇄ enum do banco (om_pendencias)
const OM_PEND_CRIT_LABEL  = { baixa: 'Baixa', media: 'Média', alta: 'Alta', critica: 'Crítica' };
const OM_PEND_CRIT_VALUE  = { 'Baixa': 'baixa', 'Média': 'media', 'Alta': 'alta', 'Crítica': 'critica' };
const OM_PEND_STATUS_LABEL = { aberta: 'Aberta', em_analise: 'Em análise', proposta_gerada: 'Proposta gerada', aprovada: 'Aprovada', resolvida: 'Resolvida', ignorada: 'Ignorada' };
const OM_PEND_STATUS_TONE  = { aberta: 'red', em_analise: 'yellow', proposta_gerada: 'blue', aprovada: 'emerald', resolvida: 'emerald', ignorada: 'gray' };

let omPendListCache = null;

async function renderOMPendencias(container) {
  if (!state.omPendFilters) state.omPendFilters = { criticidade: 'Todas', status: 'Todos', responsavel: 'Todos' };
  const f = state.omPendFilters;

  container.innerHTML = `<div class="om-env animate-fade-in-up">${omPropLoadingHTML('Carregando pendências…')}</div>`;
  queueAppLucideCreateIcons();

  const { data, error } = await supabaseClient.rpc('list_om_pendencias');
  if (error) {
    container.innerHTML = `<div class="om-env animate-fade-in-up">${omPropErroHTML(error)}</div>`;
    queueAppLucideCreateIcons();
    return;
  }

  omPendListCache = (data || []).map(p => ({
    ...p,
    critLabel:   OM_PEND_CRIT_LABEL[p.criticidade] || p.criticidade,
    statusLabel: OM_PEND_STATUS_LABEL[p.status] || p.status,
  }));
  const responsaveis = ['Todos', ...Array.from(new Set(omPendListCache.map(p => p.responsavel).filter(Boolean)))];

  const header = omPageHeader({
    icon: 'alert-triangle',
    title: 'Pendências',
    subtitle: 'Problemas técnicos identificados em visitas e relatórios — viram oportunidade de proposta corretiva.',
    actions: omBtnPrimary('Registrar pendência', 'plus', 'omOpenCreatePendencia()')
  });

  const filtros = `
    <div class="bg-neutral-900/40 border border-neutral-800 p-4 mb-4 grid grid-cols-1 md:grid-cols-3 gap-3">
      ${omField('Criticidade', `<select onchange="omPendSet('criticidade', this.value)" class="${OM_INPUT_CLS}">${['Todas','Baixa','Média','Alta','Crítica'].map(s => `<option ${s === f.criticidade ? 'selected' : ''}>${s}</option>`).join('')}</select>`)}
      ${omField('Status', `<select onchange="omPendSet('status', this.value)" class="${OM_INPUT_CLS}">${['Todos','Aberta','Em análise','Proposta gerada','Aprovada','Resolvida','Ignorada'].map(s => `<option ${s === f.status ? 'selected' : ''}>${s}</option>`).join('')}</select>`)}
      ${omField('Responsável', `<select onchange="omPendSet('responsavel', this.value)" class="${OM_INPUT_CLS}">${responsaveis.map(s => `<option ${s === f.responsavel ? 'selected' : ''}>${omEsc(s)}</option>`).join('')}</select>`)}
    </div>`;

  container.innerHTML = `<div class="om-env animate-fade-in-up">${header}${filtros}<div id="om-pend-results">${omPendResultsHTML()}</div></div>`;
  queueAppLucideCreateIcons();
}

function omPendFilteredRows() {
  const f = state.omPendFilters || { criticidade: 'Todas', status: 'Todos', responsavel: 'Todos' };
  return (omPendListCache || []).filter(p => {
    if (f.criticidade !== 'Todas' && p.critLabel !== f.criticidade) return false;
    if (f.status !== 'Todos' && p.statusLabel !== f.status) return false;
    if (f.responsavel !== 'Todos' && p.responsavel !== f.responsavel) return false;
    return true;
  });
}

function omPendCardHTML(p) {
  const encerrada = p.status === 'resolvida' || p.status === 'ignorada';
  const temProposta = !!p.om_proposta_id;
  const gerarLabel = temProposta ? 'Ver proposta' : 'Gerar proposta corretiva';
  const gerarIcon  = temProposta ? 'file-text' : 'file-plus';
  return `
    <div class="bg-neutral-900/40 border border-neutral-800 p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2 flex-wrap">
          ${omChip(p.critLabel, OM_CRIT_TONE[p.critLabel] || 'gray')}
          ${omChip(p.statusLabel, OM_PEND_STATUS_TONE[p.status] || 'gray')}
          ${p.os_numero ? `<span class="text-[11px] text-neutral-500">${omEsc(p.os_numero)}</span>` : ''}
        </div>
        <div class="text-base font-bold text-white mt-2">${omEsc(p.descricao)}</div>
        <div class="text-[12px] text-neutral-400 mt-0.5">${omEsc(p.cliente || '—')} · Responsável: ${omEsc(p.responsavel || '—')}</div>
      </div>
      <div class="flex items-center gap-2 flex-wrap">
        ${encerrada ? '' : `<button onclick="omPendGerarProposta('${p.id}')" class="px-3 py-2 bg-blue-500 hover:bg-blue-400 text-blue-950 font-black text-[10px] uppercase tracking-widest inline-flex items-center gap-2"><i data-lucide="${gerarIcon}" class="w-3.5 h-3.5 stroke-[3]"></i>${gerarLabel}</button>`}
        ${temProposta && encerrada ? `<button onclick="omPendGerarProposta('${p.id}')" class="px-3 py-2 bg-neutral-950 border border-neutral-800 hover:border-blue-500/40 text-neutral-300 font-black text-[10px] uppercase tracking-widest inline-flex items-center gap-2"><i data-lucide="file-text" class="w-3.5 h-3.5"></i>Ver proposta</button>` : ''}
        ${encerrada ? '' : `<button onclick="omPendResolver('${p.id}')" class="px-3 py-2 bg-neutral-950 border border-neutral-800 hover:border-blue-500/40 text-white font-black text-[10px] uppercase tracking-widest inline-flex items-center gap-2"><i data-lucide="check" class="w-3.5 h-3.5"></i>Resolver</button>`}
        ${p.os_id ? `<button onclick="omPendVerOS('${p.id}')" class="px-3 py-2 bg-neutral-950 border border-neutral-800 hover:border-neutral-700 text-neutral-300 font-black text-[10px] uppercase tracking-widest inline-flex items-center gap-2"><i data-lucide="clipboard-list" class="w-3.5 h-3.5"></i>Ver OS</button>` : ''}
      </div>
    </div>`;
}

function omPendResultsHTML() {
  const rows = omPendFilteredRows();
  if (!rows.length) {
    return omEmptyState({ icon: 'shield-check', title: 'Sem pendências', hint: 'Nenhuma ocorrência para os filtros atuais.' });
  }
  return `<div class="space-y-2">${rows.map(omPendCardHTML).join('')}</div>`;
}

function omPendSet(field, val) {
  state.omPendFilters[field] = val;
  const el = document.getElementById('om-pend-results');
  if (!el) { renderContent(); return; }
  el.innerHTML = omPendResultsHTML();
  queueAppLucideCreateIcons();
}

async function omPendGerarProposta(id) {
  const p = (omPendListCache || []).find(x => x.id === id); if (!p) return;
  if (p.om_proposta_id) { omOpenPropostaDetail(p.om_proposta_id); return; }
  if (typeof showToast === 'function') showToast('Gerando proposta corretiva…');
  const { data: propId, error } = await supabaseClient.rpc('create_om_proposta_from_pendencia', { p_id: id });
  if (error) { if (typeof showToast === 'function') showToast(omFriendlyErr(error)); return; }
  if (typeof showToast === 'function') showToast('Proposta corretiva criada (rascunho).');
  omOpenPropostaDetail(propId);
}

async function omPendResolver(id) {
  const { error } = await supabaseClient.rpc('update_om_pendencia_status', { p_id: id, p_status: 'resolvida' });
  if (error) { if (typeof showToast === 'function') showToast(omFriendlyErr(error)); return; }
  if (typeof showToast === 'function') showToast('Pendência resolvida.');
  renderContent();
}

function omPendVerOS(id) {
  const p = (omPendListCache || []).find(x => x.id === id); if (!p || !p.os_id) return;
  setTab('os'); setTimeout(() => omOpenOSDetail(p.os_id), 50);
}

async function omOpenCreatePendencia() {
  let clientes = [];
  try {
    const { data, error } = await supabaseClient.rpc('list_om_clientes', { p_query: '' });
    if (error) throw error;
    clientes = data || [];
  } catch (e) {
    if (typeof showToast === 'function') showToast(omFriendlyErr(e));
    return;
  }
  if (!clientes.length) { if (typeof showToast === 'function') showToast('Nenhum cliente O&M cadastrado.'); return; }

  omOpenModal({
    title: 'Registrar pendência',
    icon: 'alert-triangle',
    bodyHTML: `
      <form id="om-form-pend" onsubmit="event.preventDefault(); omSubmitPendencia();">
        ${omField('Cliente', `<select name="clienteId" required class="${OM_INPUT_CLS}"><option value="">Selecionar...</option>${clientes.map(c => `<option value="${omEsc(c.id)}">${omEsc(c.nome)}</option>`).join('')}</select>`)}
        ${omField('Descrição', `<input name="descricao" required class="${OM_INPUT_CLS}" placeholder="Ex.: Cabo CC exposto" />`)}
        ${omField('Criticidade', `<select name="criticidade" class="${OM_INPUT_CLS}"><option selected>Média</option><option>Baixa</option><option>Alta</option><option>Crítica</option></select>`)}
      </form>`,
    footerHTML: `
      <button onclick="omCloseModal()" class="px-4 py-2.5 bg-neutral-900 border border-neutral-800 text-neutral-300 font-black text-[10px] uppercase tracking-widest">Cancelar</button>
      <button onclick="document.getElementById('om-form-pend').requestSubmit()" class="px-4 py-2.5 bg-blue-500 hover:bg-blue-400 text-blue-950 font-black text-[10px] uppercase tracking-widest">Registrar</button>`
  });
}

async function omSubmitPendencia() {
  const fd = new FormData(document.getElementById('om-form-pend'));
  const clienteId = fd.get('clienteId');
  const descricao = String(fd.get('descricao') || '').trim();
  if (!clienteId || !descricao) { if (typeof showToast === 'function') showToast('Preencha cliente e descrição.'); return; }
  omSetModalBusy(true);
  const { error } = await supabaseClient.rpc('create_om_pendencia', {
    p_cliente_id: clienteId,
    p_descricao: descricao,
    p_criticidade: OM_PEND_CRIT_VALUE[fd.get('criticidade')] || 'media',
  });
  omSetModalBusy(false);
  if (error) { if (typeof showToast === 'function') showToast(omFriendlyErr(error)); return; }
  omCloseModal();
  if (typeof showToast === 'function') showToast('Pendência registrada.');
  renderContent();
}

// =======================================================================
// ROTA: RELATÓRIOS
// =======================================================================
// Relatórios = OS finalizadas (status='finalizada'). Sem tabela própria:
// a lista reusa list_om_os e o detalhe reusa get_om_os_detalhe.
const OM_ESTADO_LABEL = { bom: 'Bom', regular: 'Atenção', critico: 'Crítico' };
let _omRelCache = { id: null, detalhe: null, fotoUrls: {} };

async function renderOMRelatorios(container) {
  if (state.omReportDetailId) return renderOMRelatorioDetail(container, state.omReportDetailId);
  if (!state.omRelFilters) state.omRelFilters = { cliente: 'Todos', tecnico: 'Todos', estado: 'Todos' };
  const f = state.omRelFilters;

  container.innerHTML = `<div class="om-env">${omPageHeader({ icon: 'file-text', title: 'Relatórios Técnicos', subtitle: 'Entregas técnicas com fotos, checklist e recomendações.' })}
    <div class="flex items-center justify-center py-24 text-neutral-500"><i data-lucide="loader-2" class="w-7 h-7 animate-spin text-blue-400"></i></div></div>`;
  queueAppLucideCreateIcons();

  const { data, error } = await supabaseClient.rpc('list_om_relatorios');
  if (error) { container.innerHTML = `<div class="om-env">${omPropErroHTML(error)}</div>`; queueAppLucideCreateIcons(); return; }

  const all = data || [];
  const clientes = ['Todos', ...Array.from(new Set(all.map(o => o.cliente).filter(Boolean)))];
  const tecnicos = ['Todos', ...Array.from(new Set(all.map(o => o.tecnico).filter(Boolean)))];
  const rows = all.filter(o => {
    if (f.cliente !== 'Todos' && o.cliente !== f.cliente) return false;
    if (f.tecnico !== 'Todos' && (o.tecnico || '') !== f.tecnico) return false;
    if (f.estado !== 'Todos' && (OM_ESTADO_LABEL[o.estado_geral] || '—') !== f.estado) return false;
    return true;
  });

  container.innerHTML = `
    <div class="om-env animate-fade-in-up">
      ${omPageHeader({ icon: 'file-text', title: 'Relatórios Técnicos', subtitle: 'Entregas técnicas com fotos, checklist e recomendações.' })}

      <div class="bg-neutral-900/40 border border-neutral-800 p-4 mb-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        ${omField('Cliente', `<select onchange="omRelSet('cliente', this.value)" class="${OM_INPUT_CLS}">${clientes.map(s => `<option ${s === f.cliente ? 'selected' : ''}>${omEsc(s)}</option>`).join('')}</select>`)}
        ${omField('Técnico', `<select onchange="omRelSet('tecnico', this.value)" class="${OM_INPUT_CLS}">${tecnicos.map(s => `<option ${s === f.tecnico ? 'selected' : ''}>${omEsc(s)}</option>`).join('')}</select>`)}
        ${omField('Estado geral', `<select onchange="omRelSet('estado', this.value)" class="${OM_INPUT_CLS}">${['Todos','Bom','Atenção','Crítico'].map(s => `<option ${s === f.estado ? 'selected' : ''}>${s}</option>`).join('')}</select>`)}
      </div>

      ${rows.length === 0 ? omEmptyState({ icon: 'file-text', title: 'Nenhum relatório', hint: 'Conclua uma OS para gerar o relatório técnico.' }) : `
        <div class="bg-neutral-900/40 border border-neutral-800 overflow-x-auto">
          <table class="w-full">
            <thead><tr class="bg-neutral-950 border-b border-neutral-800">
              ${['Cliente','OS','Técnico','Data','Estado geral',''].map(h => `<th class="text-left text-[10px] font-black uppercase tracking-widest text-neutral-500 px-4 py-3">${h}</th>`).join('')}
            </tr></thead>
            <tbody>
              ${rows.map(o => {
                const estadoLabel = OM_ESTADO_LABEL[o.estado_geral] || '—';
                const dataFin = o.finalizado_em ? new Date(o.finalizado_em).toLocaleDateString('pt-BR') : '—';
                return `
                <tr class="border-b border-neutral-900 hover:bg-white/[0.02]">
                  <td class="px-4 py-3.5 text-sm font-bold text-white">${omEsc(o.cliente || '—')}</td>
                  <td class="px-4 py-3.5 text-sm text-neutral-300">${omEsc(o.numero || '—')}</td>
                  <td class="px-4 py-3.5 text-sm text-neutral-300">${omEsc(o.tecnico || '—')}</td>
                  <td class="px-4 py-3.5 text-sm text-neutral-400">${dataFin}</td>
                  <td class="px-4 py-3.5">${omChip(estadoLabel, OM_ESTADO_TONE[estadoLabel] || 'gray')}</td>
                  <td class="px-4 py-3.5 text-right">
                    <button onclick="omOpenRelatorio('${omEsc(o.id)}')" class="px-3 py-1.5 bg-neutral-900 border border-neutral-800 hover:border-blue-500/40 hover:text-blue-300 text-neutral-200 font-black text-[10px] uppercase tracking-widest">Ver relatório</button>
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      `}
    </div>
  `;
  queueAppLucideCreateIcons();
}
function omRelSet(field, val) { state.omRelFilters[field] = val; renderContent(); }
function omOpenRelatorio(id) { state.omReportDetailId = id; _omRelCache = { id: null, detalhe: null, fotoUrls: {} }; renderContent(); }
function omCloseRelatorio() { state.omReportDetailId = null; renderContent(); }
function omRelVerFoto(url) { if (url) window.open(url, '_blank', 'noopener'); }

const OM_REL_FOTO_CATS = [
  { id: 'antes', label: 'Antes' },
  { id: 'depois', label: 'Depois' },
  { id: 'inversor', label: 'Inversor / app' },
  { id: 'anomalia', label: 'Anomalias' },
];

async function renderOMRelatorioDetail(container, id) {
  if (_omRelCache.id !== id || !_omRelCache.detalhe) {
    container.innerHTML = `<div class="om-env"><div class="flex items-center justify-center py-24 text-neutral-500"><i data-lucide="loader-2" class="w-7 h-7 animate-spin text-blue-400"></i></div></div>`;
    queueAppLucideCreateIcons();
    const { data, error } = await supabaseClient.rpc('get_om_os_detalhe', { p_os_id: id });
    if (error || !data) { container.innerHTML = `<div class="om-env">${omPropErroHTML(error || new Error('Relatório não encontrado.'))}</div>`; queueAppLucideCreateIcons(); return; }
    _omRelCache = { id, detalhe: data, fotoUrls: {} };
    const paths = (data.fotos || []).map(ft => ft.storage_path).filter(Boolean);
    if (paths.length) {
      try {
        const { data: urls } = await supabaseClient.storage.from('om-fotos').createSignedUrls(paths, 3600);
        (urls || []).forEach(u => { if (u && u.signedUrl && !u.error) _omRelCache.fotoUrls[u.path] = u.signedUrl; });
      } catch (_) {}
    }
  }

  const d = _omRelCache.detalhe, os = d.os, c = d.cliente || {}, s = d.sistema || {};
  const estadoLabel = OM_ESTADO_LABEL[os.estado_geral] || '—';
  const dataFin = os.finalizado_em ? new Date(os.finalizado_em).toLocaleDateString('pt-BR') : '—';
  const modulos = s.quantidade_modulos
    ? `${s.quantidade_modulos}× ${[s.marca_modulos, s.modelo_modulos].filter(Boolean).join(' ') || 'módulos'}`
    : ([s.marca_modulos, s.modelo_modulos].filter(Boolean).join(' ') || '—');
  const inversor = [s.marca_inversor, s.modelo_inversor].filter(Boolean).join(' ') || '—';
  const checklist = d.checklist || [];
  const problemas = d.problemas || [];
  const fotos = (d.fotos || []).filter(ft => ft.categoria !== 'checklist');
  const GRAV = { baixa: 'Baixa', media: 'Média', alta: 'Alta' };
  const GRAV_TONE = { baixa: 'text-neutral-300', media: 'text-amber-400', alta: 'text-red-400' };

  const fotoThumb = ft => {
    const url = _omRelCache.fotoUrls[ft.storage_path] || '';
    return `<div ${url ? `onclick="omRelVerFoto('${omEsc(url)}')"` : ''} class="relative aspect-square overflow-hidden bg-neutral-950 border border-neutral-800 ${url ? 'cursor-pointer' : ''}">
      ${url ? `<img src="${omEsc(url)}" class="w-full h-full object-cover" loading="lazy" alt="">` : '<div class="w-full h-full flex items-center justify-center"><i data-lucide="image-off" class="w-4 h-4 text-neutral-700"></i></div>'}</div>`;
  };

  container.innerHTML = `
    <div class="om-env animate-fade-in-up">
      <div class="flex items-center gap-2 mb-3">
        <button onclick="omCloseRelatorio()" class="px-3 py-2 bg-neutral-900 border border-neutral-800 hover:border-neutral-700 text-neutral-300 font-black text-[10px] uppercase tracking-widest inline-flex items-center gap-2"><i data-lucide="arrow-left" class="w-3.5 h-3.5"></i>Voltar</button>
        <div class="text-[10px] font-black uppercase tracking-widest text-neutral-500">Relatório</div>
        <div class="text-sm font-black text-white">${omEsc(os.numero || '')}</div>
        <div class="ml-auto flex items-center gap-2">
          ${omChip(estadoLabel, OM_ESTADO_TONE[estadoLabel] || 'gray')}
          <button onclick="omRelBaixarPdf()" class="px-3 py-2 bg-blue-500 hover:bg-blue-400 text-blue-950 font-black text-[10px] uppercase tracking-widest inline-flex items-center gap-2"><i data-lucide="download" class="w-3.5 h-3.5"></i>Baixar PDF</button>
        </div>
      </div>

      <div class="bg-neutral-900/40 border border-neutral-800 p-6 mb-4">
        <div class="text-[10px] font-black uppercase tracking-widest text-blue-400/80">Relatório Técnico O&amp;M</div>
        <h2 class="text-2xl font-black text-white mt-1">${omEsc(c.nome || '—')}</h2>
        <div class="text-sm text-neutral-400 mt-1">${omEsc(os.numero || '')} · ${dataFin} · ${omEsc(os.tipo_servico || '')}</div>
      </div>

      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        ${[
          ['list-checks', 'Checklist', `${checklist.filter(i => i.feito).length}/${checklist.length}`],
          ['camera', 'Fotos', String(fotos.length)],
          ['alert-triangle', 'Problemas', String(problemas.length)],
          ['gauge', 'Estado geral', estadoLabel],
        ].map(([icon, label, val]) => `<div class="bg-neutral-900/40 border border-neutral-800 p-4">
          <div class="flex items-center gap-2 text-neutral-500"><i data-lucide="${icon}" class="w-3.5 h-3.5"></i><span class="text-[10px] font-black uppercase tracking-widest">${label}</span></div>
          <div class="text-xl font-black text-white mt-1">${omEsc(val)}</div></div>`).join('')}
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <div class="bg-neutral-900/40 border border-neutral-800 p-5">
          <div class="text-[10px] font-black uppercase tracking-widest text-neutral-500 mb-2">Dados do cliente</div>
          <div class="text-sm text-white font-bold">${omEsc(c.nome || '—')}</div>
          <div class="text-[12px] text-neutral-400">${omEsc(s.endereco_instalacao || '—')}</div>
          <div class="text-[12px] text-neutral-400">${omEsc(c.telefone || '—')}</div>
        </div>
        <div class="bg-neutral-900/40 border border-neutral-800 p-5">
          <div class="text-[10px] font-black uppercase tracking-widest text-neutral-500 mb-2">Dados do sistema</div>
          <div class="grid grid-cols-2 gap-2 text-[12px]">
            <div><div class="text-neutral-500 font-bold uppercase tracking-widest text-[10px]">Potência</div><div class="text-white">${s.potencia_kwp != null ? omEsc(s.potencia_kwp + ' kWp') : '—'}</div></div>
            <div><div class="text-neutral-500 font-bold uppercase tracking-widest text-[10px]">Inversor</div><div class="text-white">${omEsc(inversor)}</div></div>
            <div><div class="text-neutral-500 font-bold uppercase tracking-widest text-[10px]">Módulos</div><div class="text-white">${omEsc(modulos)}</div></div>
            <div><div class="text-neutral-500 font-bold uppercase tracking-widest text-[10px]">Telhado</div><div class="text-white">${omEsc(s.tipo_telhado || '—')}</div></div>
          </div>
        </div>
      </div>

      <div class="space-y-3 mb-4">
        ${OM_REL_FOTO_CATS.map(cat => {
          const list = fotos.filter(ft => ft.categoria === cat.id);
          if (!list.length) return '';
          return `<div class="bg-neutral-900/40 border border-neutral-800">
            <div class="flex items-center gap-2 px-4 py-2.5 border-b border-neutral-800">
              <i data-lucide="image" class="w-3.5 h-3.5 text-blue-400"></i>
              <span class="text-[11px] font-black uppercase tracking-[0.15em] text-neutral-300 flex-1">${cat.label}</span>
              <span class="text-[11px] font-bold text-neutral-500">${list.length} ${list.length === 1 ? 'foto' : 'fotos'}</span>
            </div>
            <div class="p-3 grid grid-cols-3 sm:grid-cols-4 gap-2">${list.map(fotoThumb).join('')}</div>
          </div>`;
        }).join('') || '<div class="bg-neutral-900/40 border border-neutral-800 p-5 text-[12px] text-neutral-500 text-center">Nenhuma foto registrada.</div>'}
      </div>

      <div class="bg-neutral-900/40 border border-neutral-800 p-5 mb-4">
        <div class="text-[10px] font-black uppercase tracking-widest text-neutral-500 mb-2">Checklist (${checklist.filter(i => i.feito).length}/${checklist.length})</div>
        ${checklist.length ? `<ul class="space-y-1.5 text-sm">
          ${checklist.map(i => `<li class="flex items-start gap-2 ${i.feito ? 'text-neutral-300' : 'text-neutral-500'}">
            <i data-lucide="${i.feito ? 'check' : 'minus'}" class="w-3.5 h-3.5 mt-0.5 ${i.feito ? 'text-blue-400 stroke-[3]' : 'text-neutral-600'}"></i>
            <span>${omEsc(i.label)}${i.observacao ? ` <span class="text-neutral-500">— ${omEsc(i.observacao)}</span>` : ''}</span></li>`).join('')}
        </ul>` : '<div class="text-[12px] text-neutral-500">Sem checklist.</div>'}
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div class="bg-neutral-900/40 border border-neutral-800 p-5">
          <div class="text-[10px] font-black uppercase tracking-widest text-neutral-500 mb-2">Problemas encontrados</div>
          ${problemas.length ? `<ul class="space-y-2 text-sm text-neutral-300">${problemas.map(p => `<li class="flex items-start gap-2">
            <i data-lucide="alert-triangle" class="w-3.5 h-3.5 mt-0.5 ${GRAV_TONE[p.gravidade] || 'text-neutral-400'}"></i>
            <span><span class="font-bold ${GRAV_TONE[p.gravidade] || ''}">${GRAV[p.gravidade] || ''}</span> — ${omEsc(p.descricao)}${p.precisa_retorno ? ' <span class="text-blue-300">(precisa retorno)</span>' : ''}</span></li>`).join('')}</ul>` : '<div class="text-[12px] text-neutral-500">Nenhum problema registrado.</div>'}
        </div>
        <div class="bg-neutral-900/40 border border-neutral-800 p-5">
          <div class="text-[10px] font-black uppercase tracking-widest text-neutral-500 mb-2">Observação final / recomendações</div>
          <div class="text-sm text-neutral-300 whitespace-pre-line">${os.observacao_final ? omEsc(os.observacao_final) : '<span class="text-neutral-500">Sem observações.</span>'}</div>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-x-6 gap-y-1 mt-4 pt-4 border-t border-neutral-800 text-[11px] text-neutral-500">
        <span>Relatório gerado pelo portal AgilSolar O&amp;M</span>
        <span class="ml-auto">Finalizado em ${dataFin}</span>
      </div>
    </div>
  `;
  queueAppLucideCreateIcons();
}

// Abre uma janela com o relatório em layout "papel" (claro) e dispara a
// impressão do navegador → o usuário salva como PDF. Reusa os dados/URLs já
// carregados em _omRelCache (nenhuma chamada extra ao backend).
function omRelBaixarPdf() {
  const d = _omRelCache.detalhe;
  if (!d) { if (typeof showToast === 'function') showToast('Abra um relatório primeiro.'); return; }
  const os = d.os, c = d.cliente || {}, s = d.sistema || {};
  const esc = omEsc;
  const estadoLabel = OM_ESTADO_LABEL[os.estado_geral] || '—';
  const dataFin = os.finalizado_em ? new Date(os.finalizado_em).toLocaleDateString('pt-BR') : '—';
  const modulos = s.quantidade_modulos
    ? `${s.quantidade_modulos}× ${[s.marca_modulos, s.modelo_modulos].filter(Boolean).join(' ') || 'módulos'}`
    : ([s.marca_modulos, s.modelo_modulos].filter(Boolean).join(' ') || '—');
  const inversor = [s.marca_inversor, s.modelo_inversor].filter(Boolean).join(' ') || '—';
  const checklist = d.checklist || [];
  const problemas = d.problemas || [];
  const fotos = (d.fotos || []).filter(ft => ft.categoria !== 'checklist');
  const GRAV = { baixa: 'Baixa', media: 'Média', alta: 'Alta' };
  const ESTADO_COLOR = { Bom: '#0a7d3c', 'Atenção': '#b45309', 'Crítico': '#b91c1c' };
  const FOTO_CATS = [['antes', 'Antes'], ['depois', 'Depois'], ['inversor', 'Inversor / app'], ['anomalia', 'Anomalias']];
  const logo = new URL('assets/img/logo-light.png', location.href).href;

  const fotoBlock = ([id, label], wide) => {
    const list = fotos.filter(ft => ft.categoria === id).map(ft => _omRelCache.fotoUrls[ft.storage_path]).filter(Boolean);
    if (!list.length) return '';
    return `<div class="ph-block${wide ? ' wide' : ''}"><h3>${label} <span class="ph-count">${list.length}</span></h3>
      <div class="ph-grid">${list.map(u => `<img src="${esc(u)}" alt="">`).join('')}</div></div>`;
  };
  const parBlocks = [fotoBlock(['antes', 'Antes']), fotoBlock(['depois', 'Depois'])].filter(Boolean);
  const outrosBlocks = [fotoBlock(['inversor', 'Inversor / app'], true), fotoBlock(['anomalia', 'Anomalias'], true)].filter(Boolean);
  const fotosHtml = (parBlocks.length || outrosBlocks.length)
    ? `${parBlocks.length ? `<div class="ph-pair">${parBlocks.join('')}</div>` : ''}${outrosBlocks.join('')}`
    : '<p class="muted">Nenhuma foto registrada.</p>';

  const checkDone = checklist.filter(i => i.feito).length;
  const checkState = checklist.length === 0 ? 'neutral' : (checkDone === checklist.length ? 'ok' : 'warn');
  const probState = problemas.length === 0 ? 'ok' : 'bad';
  const estadoState = estadoLabel === 'Bom' ? 'ok' : (estadoLabel === 'Atenção' ? 'warn' : (estadoLabel === 'Crítico' ? 'bad' : 'neutral'));

  const checklistHtml = checklist.length ? `<ul class="ph-check">${checklist.map(i =>
    `<li class="${i.feito ? 'done' : 'undone'}"><span class="mark">${i.feito ? '✓' : '—'}</span> ${esc(i.label)}${i.observacao ? ` <em>— ${esc(i.observacao)}</em>` : ''}</li>`).join('')}</ul>`
    : '<p class="muted">Sem checklist.</p>';

  const problemasHtml = problemas.length ? `<ul class="ph-probs">${problemas.map(p =>
    `<li><strong>${GRAV[p.gravidade] || ''}</strong> — ${esc(p.descricao)}${p.precisa_retorno ? ' <span class="tag">precisa retorno</span>' : ''}</li>`).join('')}</ul>`
    : '<p class="muted">Nenhum problema registrado.</p>';

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Relatório ${esc(os.numero || '')} — ${esc(c.nome || '')}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; color: #1a1a1a; margin: 0; padding: 32px 40px; background: #fff; }
  .ph-head { display: flex; align-items: center; gap: 16px; border-bottom: 3px solid #0a4ba0; padding-bottom: 16px; margin-bottom: 24px; }
  .ph-head img { height: 46px; }
  .ph-head .meta { margin-left: auto; text-align: right; font-size: 12px; color: #555; }
  .ph-badge { display: inline-block; padding: 4px 12px; border-radius: 4px; color: #fff; font-weight: 800; font-size: 11px; text-transform: uppercase; letter-spacing: .08em; }
  h1 { font-size: 22px; margin: 0 0 2px; }
  .ph-sub { color: #555; font-size: 13px; margin-bottom: 24px; }
  .ph-kpis { display: flex; gap: 12px; margin-bottom: 24px; }
  .ph-kpi { flex: 1; border: 1px solid #e2e2e2; border-left-width: 4px; border-radius: 6px; padding: 10px 12px; }
  .ph-kpi .lbl { font-size: 10px; text-transform: uppercase; letter-spacing: .08em; color: #888; font-weight: 700; }
  .ph-kpi .val { font-size: 18px; font-weight: 800; margin-top: 2px; }
  .ph-kpi.st-ok { border-left-color: #0a7d3c; background: #f3fbf6; }
  .ph-kpi.st-ok .val { color: #0a7d3c; }
  .ph-kpi.st-warn { border-left-color: #b45309; background: #fffaf2; }
  .ph-kpi.st-warn .val { color: #b45309; }
  .ph-kpi.st-bad { border-left-color: #b91c1c; background: #fdf4f4; }
  .ph-kpi.st-bad .val { color: #b91c1c; }
  .ph-kpi.st-neutral { border-left-color: #cbd5e1; }
  .ph-cols { display: flex; gap: 16px; margin-bottom: 24px; }
  .ph-card { flex: 1; border: 1px solid #e2e2e2; border-radius: 6px; padding: 14px 16px; }
  .ph-card h2, section h2 { font-size: 11px; text-transform: uppercase; letter-spacing: .1em; color: #0a4ba0; margin: 0 0 10px; }
  .ph-card .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; font-size: 12px; }
  .ph-card .grid2 .k { color: #888; font-size: 10px; text-transform: uppercase; letter-spacing: .06em; }
  section { margin-bottom: 22px; }
  .ph-pair { display: flex; gap: 16px; margin-bottom: 14px; }
  .ph-pair > .ph-block { flex: 1; margin-bottom: 0; min-width: 0; }
  .ph-block { margin-bottom: 14px; }
  .ph-block h3 { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: #444; margin: 0 0 8px; padding-bottom: 4px; border-bottom: 1px solid #eee; }
  .ph-count { color: #888; font-weight: 400; }
  .ph-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
  .ph-block.wide .ph-grid { grid-template-columns: repeat(4, 1fr); }
  .ph-grid img { width: 100%; aspect-ratio: 1; object-fit: cover; border: 1px solid #ddd; border-radius: 4px; }
  ul { margin: 0; padding-left: 0; list-style: none; }
  .ph-check li { padding: 4px 0; font-size: 13px; border-bottom: 1px solid #f0f0f0; }
  .ph-check .mark { display: inline-block; width: 18px; font-weight: 800; }
  .ph-check .done .mark { color: #0a7d3c; }
  .ph-check .undone { color: #999; }
  .ph-check em { color: #777; font-style: normal; }
  .ph-probs li { padding: 6px 0; font-size: 13px; border-bottom: 1px solid #f0f0f0; }
  .tag { background: #e6f0ff; color: #0a4ba0; font-size: 10px; padding: 1px 6px; border-radius: 3px; }
  .obs { font-size: 13px; white-space: pre-line; }
  .muted { color: #999; font-size: 12px; }
  .ph-foot { margin-top: 28px; padding-top: 12px; border-top: 1px solid #e2e2e2; font-size: 11px; color: #888; display: flex; }
  .ph-foot .right { margin-left: auto; }
  @page { margin: 14mm; }
  @media print { body { padding: 0; } .ph-block, .ph-card, section { break-inside: avoid; } }
</style></head><body>
  <div class="ph-head">
    <img src="${esc(logo)}" alt="AgilSolar" onerror="this.style.display='none'">
    <div class="meta">Relatório Técnico O&amp;M<br>${esc(os.numero || '')} · ${dataFin}</div>
  </div>
  <span class="ph-badge" style="background:${ESTADO_COLOR[estadoLabel] || '#555'}">${esc(estadoLabel)}</span>
  <h1>${esc(c.nome || '—')}</h1>
  <div class="ph-sub">${esc(os.tipo_servico || '')}</div>

  <div class="ph-kpis">
    <div class="ph-kpi st-${checkState}"><div class="lbl">Checklist</div><div class="val">${checkDone}/${checklist.length}</div></div>
    <div class="ph-kpi st-neutral"><div class="lbl">Fotos</div><div class="val">${fotos.length}</div></div>
    <div class="ph-kpi st-${probState}"><div class="lbl">Problemas</div><div class="val">${problemas.length}</div></div>
    <div class="ph-kpi st-${estadoState}"><div class="lbl">Estado geral</div><div class="val">${esc(estadoLabel)}</div></div>
  </div>

  <div class="ph-cols">
    <div class="ph-card"><h2>Dados do cliente</h2>
      <div style="font-weight:700;font-size:14px">${esc(c.nome || '—')}</div>
      <div style="font-size:12px;color:#555;margin-top:4px">${esc(s.endereco_instalacao || '—')}</div>
      <div style="font-size:12px;color:#555">${esc(c.telefone || '—')}</div>
    </div>
    <div class="ph-card"><h2>Dados do sistema</h2>
      <div class="grid2">
        <div><div class="k">Potência</div>${s.potencia_kwp != null ? esc(s.potencia_kwp + ' kWp') : '—'}</div>
        <div><div class="k">Inversor</div>${esc(inversor)}</div>
        <div><div class="k">Módulos</div>${esc(modulos)}</div>
        <div><div class="k">Telhado</div>${esc(s.tipo_telhado || '—')}</div>
      </div>
    </div>
  </div>

  <section><h2>Registro fotográfico</h2>${fotosHtml}</section>
  <section><h2>Checklist (${checklist.filter(i => i.feito).length}/${checklist.length})</h2>${checklistHtml}</section>
  <section><h2>Problemas encontrados</h2>${problemasHtml}</section>
  <section><h2>Observação final / recomendações</h2>
    <div class="obs">${os.observacao_final ? esc(os.observacao_final) : '<span class="muted">Sem observações.</span>'}</div></section>

  <div class="ph-foot"><span>Relatório gerado pelo portal AgilSolar O&amp;M</span><span class="right">Finalizado em ${dataFin}</span></div>

  <script>
    (function () {
      var imgs = Array.prototype.slice.call(document.images);
      var pending = imgs.filter(function (i) { return !i.complete; }).length;
      function go() { window.focus(); window.print(); }
      if (!pending) { setTimeout(go, 300); return; }
      imgs.forEach(function (i) {
        if (i.complete) return;
        i.addEventListener('load', done); i.addEventListener('error', done);
      });
      function done() { if (--pending <= 0) setTimeout(go, 300); }
      setTimeout(go, 4000); // fallback se alguma imagem travar
    })();
  <\/script>
</body></html>`;

  const w = window.open('', '_blank');
  if (!w) { if (typeof showToast === 'function') showToast('Permita pop-ups para baixar o PDF.'); return; }
  w.document.open();
  w.document.write(html);
  w.document.close();
}

// =======================================================================
// ROTA: TÉCNICOS
// =======================================================================

// Compara agendado_para (ISO timestamptz) com a data local — premissa: usuários no fuso Brasil.
function omMesmoDiaLocal(isoStr, refDate) {
  if (!isoStr) return false;
  var d = new Date(isoStr), r = refDate || new Date();
  return d.getFullYear() === r.getFullYear() && d.getMonth() === r.getMonth() && d.getDate() === r.getDate();
}
function omFmtDataHoraISO(iso) {
  if (!iso) return '—';
  var d = new Date(iso), p = function(n) { return String(n).padStart(2, '0'); };
  return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}
function omFmtHoraISO(iso) {
  if (!iso) return '—';
  var d = new Date(iso);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}
function omTecBase(t) {
  var cat = state.franquiasCatalog || [];
  var f = cat.find(function(x) { return x.id === t.franquia_id; });
  return f ? (f.cidade || f.nome || '—') : '—';
}
function omTecDerived(t, oss) {
  var minhas = oss.filter(function(o) { return o.tecnico_id === t.id; });
  var ativas = ['agendada', 'deslocamento', 'em_atendimento'];
  var status, statusTone;
  if (minhas.some(function(o) { return o.status === 'em_atendimento'; })) {
    status = 'Em atendimento'; statusTone = 'yellow';
  } else if (minhas.some(function(o) { return o.status === 'deslocamento'; })) {
    status = 'Em deslocamento'; statusTone = 'orange';
  } else {
    status = 'Disponível'; statusTone = 'emerald';
  }
  var hoje = new Date();
  var osHoje = minhas.filter(function(o) { return ativas.indexOf(o.status) >= 0 && omMesmoDiaLocal(o.agendado_para, hoje); }).length;
  var concluidas = minhas.filter(function(o) { return o.status === 'finalizada'; }).length;
  var agora = Date.now();
  var futuras = minhas
    .filter(function(o) { return ativas.indexOf(o.status) >= 0 && o.agendado_para && new Date(o.agendado_para).getTime() >= agora; })
    .sort(function(a, b) { return new Date(a.agendado_para) - new Date(b.agendado_para); });
  var prox = futuras[0];
  var proxima = prox ? omEsc(prox.numero) + ' · ' + omFmtHoraISO(prox.agendado_para) : '—';
  return Object.assign({}, t, { status: status, statusTone: statusTone, osHoje: osHoje, concluidas: concluidas, proxima: proxima });
}
async function omTecFetchData() {
  var results = await Promise.all([
    supabaseClient.rpc('list_om_tecnicos'),
    supabaseClient.rpc('list_om_os'),
  ]);
  var tecRes = results[0], osRes = results[1];
  if (tecRes.error) throw tecRes.error;
  if (osRes.error) throw osRes.error;
  return { tecnicos: tecRes.data || [], oss: osRes.data || [] };
}
function omTecLoadingSkeleton() {
  var card = '<div class="bg-neutral-900/40 border border-neutral-800 p-5 animate-pulse">' +
    '<div class="h-10 w-10 bg-neutral-800 rounded-full mb-3"></div>' +
    '<div class="h-4 bg-neutral-800 w-3/4 mb-2"></div>' +
    '<div class="h-3 bg-neutral-800 w-1/2"></div>' +
  '</div>';
  return '<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">' + card + card + card + card + '</div>';
}
async function omTecnicosFetchLive() {
  var bodyEl = document.getElementById('om-tec-body');
  try {
    var fetched = await omTecFetchData();
    state.omTecCache = { tecnicos: fetched.tecnicos, oss: fetched.oss, at: Date.now() };
    if (!bodyEl) return;
    var tecnicos = fetched.tecnicos, oss = fetched.oss;
    var ativas = ['agendada', 'deslocamento', 'em_atendimento'];
    var derivados = tecnicos.map(function(t) { return omTecDerived(t, oss); });
    var hoje = new Date();
    var agendaHoje = oss
      .filter(function(o) { return ativas.indexOf(o.status) >= 0 && omMesmoDiaLocal(o.agendado_para, hoje); })
      .sort(function(a, b) { return new Date(a.agendado_para || 0) - new Date(b.agendado_para || 0); });
    var counts = derivados.map(function(t) {
      return oss.filter(function(o) { return o.tecnico_id === t.id && ativas.indexOf(o.status) >= 0; }).length;
    });
    var maxCount = Math.max.apply(Math, [1].concat(counts));

    if (derivados.length === 0) {
      bodyEl.innerHTML = '<div class="text-center py-16 text-neutral-500">' +
        '<div class="text-lg font-black uppercase tracking-widest mb-2">Nenhum técnico cadastrado</div>' +
        (state.isAdmin ? '<button onclick="omOpenCreateTecnico()" class="mt-3 px-4 py-2.5 bg-blue-500 hover:bg-blue-400 text-blue-950 font-black text-[10px] uppercase tracking-widest">Novo técnico</button>' : '') +
      '</div>';
      queueAppLucideCreateIcons();
      return;
    }

    var cardsHTML = derivados.map(function(t) {
      return '<div class="bg-neutral-900/40 border border-neutral-800 p-5">' +
        '<div class="flex items-center justify-between mb-3">' +
          '<div class="w-10 h-10 rounded-full bg-blue-500/10 text-blue-400 grid place-items-center font-black">' +
            omEsc((t.nome || '?').split(' ').map(function(w) { return w[0]; }).slice(0, 2).join('')) +
          '</div>' +
          omChip(t.status, t.statusTone) +
        '</div>' +
        '<div class="text-sm font-black text-white">' + omEsc(t.nome || '—') + '</div>' +
        '<div class="text-[11px] text-neutral-500 mb-3">' + omEsc(omTecBase(t)) + '</div>' +
        '<div class="grid grid-cols-2 gap-2 text-[11px]">' +
          '<div class="bg-neutral-950 border border-neutral-800 p-2"><div class="text-neutral-500 font-bold uppercase tracking-widest text-[9px]">OS hoje</div><div class="text-white text-lg font-black">' + t.osHoje + '</div></div>' +
          '<div class="bg-neutral-950 border border-neutral-800 p-2"><div class="text-neutral-500 font-bold uppercase tracking-widest text-[9px]">Concluídas</div><div class="text-blue-400 text-lg font-black">' + t.concluidas + '</div></div>' +
        '</div>' +
        '<div class="text-[11px] text-neutral-400 mt-3">Próxima: <span class="text-white font-bold">' + t.proxima + '</span></div>' +
        '<button onclick="omOpenAgendaTecnico(\'' + omEsc(t.id) + '\')" class="mt-3 w-full px-3 py-2 bg-neutral-950 border border-neutral-800 hover:border-blue-500/40 hover:text-blue-300 text-white font-black text-[10px] uppercase tracking-widest">Ver agenda</button>' +
      '</div>';
    }).join('');

    var agendaHTML = agendaHoje.length
      ? agendaHoje.slice(0, 6).map(function(o) {
          return '<div class="flex items-center justify-between gap-3 px-3 py-2.5 bg-neutral-950 border border-neutral-800">' +
            '<div class="min-w-0">' +
              '<div class="text-sm text-white font-bold truncate">' + omEsc((o.numero || o.id) + ' · ' + (o.cliente || '—')) + '</div>' +
              '<div class="text-[11px] text-neutral-500 truncate">' + omEsc((o.tipo_servico || '—') + ' · ' + (o.tecnico_nome || '—')) + '</div>' +
            '</div>' +
            '<div class="text-[11px] text-neutral-400 shrink-0">' + omFmtHoraISO(o.agendado_para) + '</div>' +
          '</div>';
        }).join('')
      : '<div class="text-[11px] text-neutral-500 py-4 text-center font-bold uppercase tracking-wider">Nenhuma OS agendada para hoje.</div>';

    var osPortecHTML = derivados.map(function(t, i) {
      var count = counts[i];
      var pct = maxCount > 0 ? Math.min(100, count / maxCount * 100) : 0;
      return '<div>' +
        '<div class="flex items-center justify-between text-[11px] mb-1">' +
          '<span class="text-white font-bold">' + omEsc(t.nome || '—') + '</span>' +
          '<span class="text-neutral-400">' + count + ' OS</span>' +
        '</div>' +
        '<div class="h-[3px] bg-neutral-800 overflow-hidden"><div class="h-full bg-gradient-to-r from-blue-600 to-blue-400" style="width:' + pct + '%"></div></div>' +
      '</div>';
    }).join('');

    bodyEl.innerHTML =
      '<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">' + cardsHTML + '</div>' +
      '<div class="grid grid-cols-1 lg:grid-cols-2 gap-4">' +
        '<div class="bg-neutral-900/40 border border-neutral-800 p-5">' +
          '<div class="flex items-center gap-3 mb-3"><div class="w-8 h-8 bg-blue-500/10 text-blue-400 grid place-items-center"><i data-lucide="calendar" class="w-4 h-4"></i></div><h3 class="text-sm font-black text-white">Agenda do dia</h3></div>' +
          '<div class="space-y-2">' + agendaHTML + '</div>' +
        '</div>' +
        '<div class="bg-neutral-900/40 border border-neutral-800 p-5">' +
          '<div class="flex items-center gap-3 mb-3"><div class="w-8 h-8 bg-blue-500/10 text-blue-400 grid place-items-center"><i data-lucide="users" class="w-4 h-4"></i></div><h3 class="text-sm font-black text-white">OS por técnico</h3></div>' +
          '<div class="space-y-2">' + osPortecHTML + '</div>' +
        '</div>' +
      '</div>';
    queueAppLucideCreateIcons();
  } catch (err) {
    if (bodyEl) bodyEl.innerHTML = '<div class="text-center py-16 text-red-400 text-sm font-bold">Erro ao carregar técnicos: ' + omEsc((err && err.message) || String(err)) + '</div>';
  }
}
async function renderOMTecnicos(container) {
  container.innerHTML = '<div class="om-env animate-fade-in-up">' +
    omPageHeader({ icon: 'hard-hat', title: 'Técnicos',
      subtitle: 'Equipe técnica, agenda e distribuição de ordens de serviço.',
      actions: state.isAdmin ? omBtnPrimary('Novo técnico', 'user-plus', 'omOpenCreateTecnico()') : '' }) +
    '<div id="om-tec-body">' + omTecLoadingSkeleton() + '</div>' +
  '</div>';
  queueAppLucideCreateIcons();
  await omTecnicosFetchLive();
}

// Converte "dd/mm/aaaa hh:mm" → timestamp (para ordenar a agenda). Sem data válida vai pro fim.
function _omParseDataHora(s) {
  if (!s) return Number.MAX_SAFE_INTEGER;
  const m = String(s).match(/(\d{2})\/(\d{2})\/(\d{4})(?:[\s·]+(\d{2}):(\d{2}))?/);
  if (!m) return Number.MAX_SAFE_INTEGER;
  const [, dd, mm, yyyy, hh = '00', mi = '00'] = m;
  return new Date(+yyyy, +mm - 1, +dd, +hh, +mi).getTime();
}

function omOpenAgendaTecnico(tecnicoId) {
  var cache = state.omTecCache;
  if (!cache) { if (typeof showToast === 'function') showToast('Acesse a aba Técnicos antes de abrir a agenda.'); return; }
  var t = cache.tecnicos.find(function(x) { return x.id === tecnicoId; });
  if (!t) { if (typeof showToast === 'function') showToast('Técnico não encontrado.'); return; }
  var derived = omTecDerived(t, cache.oss);
  var ativas = ['agendada', 'deslocamento', 'em_atendimento'];
  var minhasOs = cache.oss
    .filter(function(o) { return o.tecnico_id === tecnicoId; })
    .sort(function(a, b) { return new Date(a.agendado_para || 0) - new Date(b.agendado_para || 0); });
  var pendentes = minhasOs.filter(function(o) { return ativas.indexOf(o.status) >= 0; });

  function stat(label, val, color) {
    return '<div class="bg-neutral-950 border border-neutral-800 p-3">' +
      '<div class="text-neutral-500 font-bold uppercase tracking-widest text-[9px]">' + label + '</div>' +
      '<div class="' + (color || 'text-white') + ' text-xl font-black mt-0.5">' + val + '</div>' +
    '</div>';
  }

  var listaHTML = minhasOs.length
    ? '<div class="space-y-2">' + minhasOs.map(function(o) {
        var lbl  = OM_OS_STATUS_LABEL[o.status] || o.status;
        var tone = OM_OS_STATUS_TONE[o.status]  || 'gray';
        return '<div class="flex items-center justify-between gap-3 px-3 py-3 bg-neutral-950 border border-neutral-800">' +
          '<div class="min-w-0">' +
            '<div class="flex items-center gap-2 mb-1">' +
              '<span class="text-sm text-white font-black truncate">' + omEsc(o.numero || o.id) + '</span>' +
              omChip(lbl, tone) +
            '</div>' +
            '<div class="text-[12px] text-neutral-300 truncate">' + omEsc(o.cliente || '—') + '</div>' +
            '<div class="text-[11px] text-neutral-500 truncate">' + omEsc((o.tipo_servico || '—') + ' · ' + (o.cidade || '—')) + '</div>' +
          '</div>' +
          '<div class="shrink-0 text-right">' +
            '<div class="text-[12px] text-white font-bold whitespace-nowrap">' + omFmtDataHoraISO(o.agendado_para) + '</div>' +
            '<button onclick="omCloseModal(); omAbrirOSDaProposta(\'' + omEsc(o.id) + '\')" class="mt-2 px-3 py-1.5 bg-neutral-900 border border-neutral-800 hover:border-blue-500/40 hover:text-blue-300 text-neutral-300 font-black text-[9px] uppercase tracking-widest">Abrir OS</button>' +
          '</div>' +
        '</div>';
      }).join('') + '</div>'
    : '<div class="px-3 py-10 text-center text-[12px] text-neutral-500 bg-neutral-950 border border-neutral-800">Nenhuma OS atribuída a este técnico.</div>';

  omOpenModal({
    title: 'Agenda · ' + omEsc(t.nome || '—'),
    subtitle: omEsc(omTecBase(t)) + ' · ' + derived.status,
    icon: 'calendar',
    size: 'lg',
    bodyHTML:
      '<div class="grid grid-cols-3 gap-2 mb-4">' +
        stat('Pendentes', pendentes.length, 'text-yellow-300') +
        stat('OS hoje', derived.osHoje) +
        stat('Concluídas', derived.concluidas, 'text-blue-400') +
      '</div>' +
      '<div class="text-[10px] font-black uppercase tracking-widest text-neutral-500 mb-2">Ordens de serviço</div>' +
      listaHTML,
    footerHTML: '<button onclick="omCloseModal()" class="px-4 py-2.5 bg-neutral-900 border border-neutral-800 hover:border-neutral-700 text-neutral-300 font-black text-[10px] uppercase tracking-widest">Fechar</button>',
  });
}

function omOpenCreateTecnico() {
  if (!state.isAdmin) { if (typeof showToast === 'function') showToast('Apenas administradores podem cadastrar técnicos.'); return; }
  var franquias = state.franquiasCatalog || [];
  var franquiaOpts = franquias.map(function(f) {
    return '<option value="' + omEsc(f.id) + '"' + (f.id === state.franquiaId ? ' selected' : '') + '>' + omEsc(f.nome) + (f.cidade ? ' · ' + omEsc(f.cidade) : '') + '</option>';
  }).join('');
  omOpenModal({
    title: 'Novo técnico',
    icon: 'user-plus',
    bodyHTML:
      '<form id="om-form-tecnico" onsubmit="event.preventDefault(); omSubmitCreateTecnico();">' +
        omField('Nome', '<input name="nome" required class="' + OM_INPUT_CLS + '" placeholder="Ex.: João Silva" />') +
        omField('E-mail', '<input name="email" type="email" required class="' + OM_INPUT_CLS + ' normal-case" placeholder="tecnico@exemplo.com" />') +
        omField('Senha temporária', '<input name="senha" type="text" required minlength="6" class="' + OM_INPUT_CLS + ' normal-case" placeholder="Mínimo 6 caracteres" />') +
        omField('Franquia', '<select name="franquia_id" class="' + OM_INPUT_CLS + '">' + (franquiaOpts || '<option value="">—</option>') + '</select>') +
      '</form>',
    footerHTML:
      '<button onclick="omCloseModal()" class="px-4 py-2.5 bg-neutral-900 border border-neutral-800 text-neutral-300 font-black text-[10px] uppercase tracking-widest">Cancelar</button>' +
      '<button onclick="document.getElementById(\'om-form-tecnico\').requestSubmit()" class="px-4 py-2.5 bg-blue-500 hover:bg-blue-400 text-blue-950 font-black text-[10px] uppercase tracking-widest">Cadastrar</button>',
  });
}
async function omSubmitCreateTecnico() {
  var fd = new FormData(document.getElementById('om-form-tecnico'));
  var nome  = (fd.get('nome')  || '').trim();
  var email = (fd.get('email') || '').trim();
  var senha = fd.get('senha')  || '';
  var franquia_id = fd.get('franquia_id') || state.franquiaId || null;
  if (!nome || !email || !senha) { if (typeof showToast === 'function') showToast('Preencha todos os campos obrigatórios.'); return; }
  try {
    var created = await createAdminUserWithConfirmedEmail({ email: email, password: senha, nome: nome, role: 'tecnico', franquia_id: franquia_id, ativo: true });
    // A Edge Function cria só o auth.users (via Admin API); ela NÃO sincroniza user_accounts.
    // Sem isto o técnico não apareceria em list_om_tecnicos. admin_update_user → sync_user_account
    // faz o upsert da linha em user_accounts (mesmo passo que o fluxo do painel admin executa).
    var syncRes = await supabaseClient.rpc('admin_update_user', {
      p_user_id: created.user_id,
      p_nome: nome,
      p_role: 'tecnico',
      p_franquia_id: franquia_id,
      p_ativo: true,
    });
    if (syncRes && syncRes.error) {
      omCloseModal();
      if (typeof showToast === 'function') showToast('Técnico criado, mas o perfil não sincronizou: ' + syncRes.error.message);
      await omTecnicosFetchLive();
      return;
    }
    omCloseModal();
    if (typeof showToast === 'function') showToast('Técnico cadastrado.');
    await omTecnicosFetchLive();
  } catch (err) {
    if (typeof showToast === 'function') showToast('ERRO: ' + ((err && err.message) || String(err)));
  }
}

// =======================================================================
// Router
// =======================================================================
function renderOMRoute(container, tabId) {
  // Compat: rota antiga `atend` agora vira `propostas`.
  if (tabId === 'atend') { state.omActiveTab = 'propostas'; tabId = 'propostas'; }

  // Sair de detalhes ao trocar de rota
  if (tabId !== 'os' && state.omOsDetailId) state.omOsDetailId = null;
  if (tabId !== 'relatorios' && state.omReportDetailId) state.omReportDetailId = null;
  if (tabId !== 'propostas' && state.omPropostaDetailId) state.omPropostaDetailId = null;
  if (tabId !== 'central') stopOmClock();

  switch (tabId) {
    case 'central':    return renderOMCentral(container);
    case 'clientes':   return renderOMClientes(container);
    case 'propostas':  return renderOMPropostas(container);
    case 'os':         return (typeof omRenderOSTab === 'function') ? omRenderOSTab(container) : renderOMOS(container);
    case 'pendencias': return renderOMPendencias(container);
    case 'relatorios': return renderOMRelatorios(container);
    case 'tecnicos':   return renderOMTecnicos(container);
    default:           return renderOMCentral(container);
  }
}

// =======================================================================
// Proposta pública O&M — link para a página proposta-om.html
// =======================================================================
const OM_PROPOSTA_PUBLIC_PATH = 'proposta-om.html';

function omPublicLink(token) {
  const base = window.location.href.split('/').slice(0, -1).join('/') + '/' + OM_PROPOSTA_PUBLIC_PATH;
  return `${base}?t=${encodeURIComponent(token)}`;
}

function omAbrirPropostaPublica(token) {
  if (!token) { if (typeof showToast === 'function') showToast('Link público indisponível.'); return; }
  window.open(omPublicLink(token), '_blank', 'noopener');
}

function omCopiarLinkProposta(token) {
  if (!token) { if (typeof showToast === 'function') showToast('Link público indisponível.'); return; }
  const url = omPublicLink(token);
  const done = () => { if (typeof showToast === 'function') showToast('Link da proposta copiado.'); };
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(url).then(done, () => {
      try { window.prompt('Copie o link:', url); } catch (_) {}
    });
  } else {
    try { window.prompt('Copie o link:', url); } catch (_) {}
    done();
  }
}

// --- Exposição global ---------------------------------------------------
Object.assign(window, {
  renderOMRoute, renderOMCentral, startOmClock, stopOmClock,
  // Central
  omCentralSearch, omUseClient,
  // Clientes
  omClientesSearch, omOpenCreateClient, omSubmitCreateClient, omClienteVer,
  // Propostas O&M
  omPropSet, omPropSearch, omOpenPropostaDetail, omClosePropostaDetail,
  omOpenCreateProposta, omSubmitProposta, omPropSetStatus, omPropEditar, omSubmitPropEdit,
  omPropCliReset, omPropCliNew, omPropCliSearch, omPropCliSelect,
  omPropSisReset, omPropSisManual, omPropSisPickExistentes, omPropSisPickImport,
  omPropSisSelectExistente, omPropSisImportPick,
  omOpenCreateOSFromProposta, omSubmitCreateOSFromProposta, omAbrirOSDaProposta,
  omAbrirPropostaPublica, omCopiarLinkProposta,
  // OS
  omOsSet, omOpenOSDetail, omCloseOSDetail, omOpenCreateOS, omSubmitCreateOS,
  // Pendências
  omPendSet, omPendGerarProposta, omPendResolver, omPendVerOS, omOpenCreatePendencia, omSubmitPendencia,
  // Relatórios
  omRelSet, omOpenRelatorio, omCloseRelatorio, omRelVerFoto, omRelBaixarPdf,
  // Técnicos
  omOpenAgendaTecnico, omOpenCreateTecnico, omSubmitCreateTecnico,
  // Modal
  omOpenModal, omCloseModal,
});
