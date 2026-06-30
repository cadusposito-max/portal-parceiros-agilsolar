// ==========================================
// CONFIGURACAO SUPABASE + ESTADO GLOBAL
// ==========================================

const SUPABASE_URL = 'https://tzwjxgprhorqrmpqudgg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR6d2p4Z3ByaG9ycXJtcHF1ZGdnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxMjczNTksImV4cCI6MjA4NzcwMzM1OX0.hwfzCb9FGVXX7Uf0pY7zFS6SZHrh0pzWk1gKFVq2DX4';

// experimental.passkey = true habilita os metodos de passkey/WebAuthn (Face ID, biometria).
// E aditivo: nao altera o login por senha nem as opcoes padrao de sessao (persist/refresh).
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { experimental: { passkey: true } },
});

// --- CONSTANTES DE NEGOCIO ---
const COMISSAO_POR_VENDA    = 2500;   // R$ por venda fechada (alterar conforme acordo)
const SESSION_TIMEOUT_HOURS = 6;      // Logout automatico apos N horas sem atividade
const MAX_LOGIN_ATTEMPTS    = 3;      // Tentativas antes de bloquear login
const LOGIN_LOCKOUT_SECONDS = 30;     // Segundos de bloqueio apos exceder tentativas
const TURNSTILE_SITE_KEY    = '0x4AAAAAACyD0uPARxpOHPqH'; // Cloudflare Turnstile Site Key (publica, seguro expor)

// --- ESTADO GLOBAL DA APLICACAO ---
let state = {
  data: [],
  clientes: [],
  propostas: [],
  vendas: [],
  franquiasCatalog: [],

  activeTab: 'dashboard',
  searchTerm: '',
  viewMode: 'grid',
  isEditMode: false,
  currentUser: null,

  // Ambiente ativo: 'comercial' | 'om' | 'financeiro'
  environment: 'comercial',
  // Tab ativa dentro do ambiente O&M
  omActiveTab: 'central',
  // Estado da aba Agenda (calendário de OS). anchor = 'YYYY-MM-DD' (preenchido em runtime).
  omAgenda: { view: 'mes', anchor: null, tecnico: 'todos' },
  // Tab ativa dentro do ambiente Financeiro
  finActiveTab: 'visao',
  // Sub-aba ativa de Pagamentos: 'conferencia' | 'comissoes'
  finPagSub: 'conferencia',
  // Sub-aba ativa por grupo do Financeiro (abas reagrupadas)
  finSub: { recebiveis: 'titulos', compras: 'orcamentos', margem: 'precificacao', acoes: 'pendencias' },
  // Acesso ao Financeiro (resolvido em runtime por fin_can_use_current_user)
  canFin: false,
  // Filtros/estado por aba do Financeiro
  finFilters: {
    recebiveis:  { search: '', f: 'todos' },
    pagamentos:  { f: 'todos' },
    ordemcompra: { f: 'todos' },
  },

  // Ambiente Vistoria (4º ambiente — operação de campo). Local-first até a fase Supabase.
  vistoriaActiveTab: 'visao',
  // Acesso à Vistoria (na fase atual: admin sempre; flag por perfil vem na fase Supabase)
  canVis: false,

  // Ambiente Engenharia (5º ambiente — calculadora/dimensionamento). Stateless até a fase Supabase.
  engActiveTab: 'calculadora',
  // Acesso à Engenharia (fase atual: admin sempre; flag eng_enabled + role 'engenheiro' vêm na fase Supabase)
  canEng: false,
  // Sub-estado da Engenharia: inputs, último resultado calculado, presets e projetos (estado local até o banco).
  eng: {
    inputs: {},
    lastResult: null,
    modulos: [],
    inversores: [],
    projetos: [],
    currentProjectId: null,
    currentProjectName: '',
  },
  // Sub-aba ativa por grupo da Vistoria (reservado para reagrupamentos futuros)
  visSub: {},
  // Filtros/estado por aba da Vistoria
  visFilters: {
    funil:  { search: '', equipe: 'todas' },
    agenda: { equipe: 'todas', cidade: 'todas', prioridade: 'todas' },
  },

  // Admin global (overlay transversal, desvinculado do ambiente). Etapa 1.
  // Ao abrir, guardamos a vertente/aba de origem para restaurar ao fechar.
  adminOpen: false,
  returnEnvironment: null,
  returnTab: null,

  // Clientes
  clienteFilter: 'TODOS',   // Filtro de status na aba clientes (vendedor/gestor)
  clienteSort:   'recent',  // Ordenacao: 'recent' | 'alpha' (vendedor/gestor)
  adminClientesViewMode: 'list', // 'list' | 'kanban'
  adminClientesFilters: {
    search: '',
    status: 'TODOS',
    vendedor_email: 'all',
    franquia_id: 'all',
    cidade: 'all',
    mes: 'all',
    preset: 'all',
  },

  // Proposta builder
  pbActiveClient: null,
  pbProposalMode: 'PROMOCIONAL', // 'PROMOCIONAL' | 'PERSONALIZADA' (EQUIPAMENTOS legado)
  pbCategory: 'kitsInversor',
  pbSearch: '',
  pbViewMode: 'list',
  pbMainTab: 'kits',        // 'kits' | 'financiamento' | 'historico'
  componentes: [],          // modulos e inversores (sem preco)
  pbEquipDraft: {
    descricao:      '',
    valorEquip:     '',
    potencia:       '',
    paymentNote:    '',
    commercialNote: '',
  },

  // Vendas / dashboard
  vendasPeriod: '',         // Filtro de periodo legado para vendedor/gestor
  adminVendasFilters: {
    search: '',
    vendedor_email: 'all',
    franquia_id: 'all',
    period: 'all', // 'all' | 'today' | 'month' | '30d' | 'YYYY-MM'
    min_price: '',
    max_price: '',
    sort: 'recent', // 'recent' | 'oldest' | 'value_desc' | 'value_asc'
    preset: 'all',
  },
  dashPeriod: '',           // Periodo filtro dashboard (legado)
  dashComunicadosPage: 0,
  dashComunicadoModalOpen: false,
  dashComunicadoModalId: null,

  // Permissoes
  isAdmin: false,
  isGestor: false,
  isTecnico: false,

  // Admin
  adminSection: 'produtos',
  adminComunicadosSearch: '',
  adminComunicadosStatus: 'all',
  adminKitsFranquia: null,
  adminScopeFranquiaId: 'all', // Drill-down global quando adminViewAll = true
  adminViewAll: true,          // true = consolidado | false = minha unidade (franquia)
  adminPrefsLoaded: false,

  // Gestor
  gestorViewAll: true,      // true = unidade inteira | false = apenas carteira propria

  // Multi-franquia
  franquiaId: null,
  franquiaNome: '',
  franquiaHsp: 5.4,

  // Indicadores pessoais
  comissaoPct: 5,

  // Perfil
  profile: {
    nome: '',
    telefone: '',
    avatar_url: '',
  },

  // Resultados filtrados para exportacao respeitar UI
  lastFilteredClientes: [],
  lastFilteredVendas: [],

  // Chat interno
  chat: {
    initialized: false,
    hasAccess: false,
    isOpen: false,
    isMobile: false,
    mobileView: 'list', // 'list' | 'thread'
    loadingConversations: false,
    loadingMessages: false,
    conversations: [],
    activeConversationId: null,
    activeConversation: null,
    activeConversationTitle: '',
    messages: [],
    unreadTotal: 0,
    directory: [],
    searchTerm: '',
    directorySearch: '',
    profileCardOpen: false,
  },
};

const TABS = [
  { id: 'dashboard', label: 'DASHBOARD',      icon: 'layout-dashboard' },
  { id: 'clientes',  label: 'MEUS CLIENTES',  icon: 'users' },
  { id: 'vendas',    label: 'VENDAS',         icon: 'trophy' }
];

// Tabs do ambiente O&M (Operação & Manutenção)
const OM_TABS = [
  { id: 'propostas',  label: 'PROPOSTAS O&M', icon: 'file-signature' },
  { id: 'central',    label: 'CENTRAL',       icon: 'radar',          secondary: true },
  { id: 'clientes',   label: 'CLIENTES',      icon: 'users',          secondary: true },
  { id: 'os',         label: 'OS',            icon: 'clipboard-list', secondary: true },
  { id: 'agenda',     label: 'AGENDA',        icon: 'calendar-days',  secondary: true },
  { id: 'pendencias', label: 'PENDÊNCIAS',    icon: 'alert-triangle', secondary: true },
  { id: 'relatorios', label: 'RELATÓRIOS',    icon: 'file-text',      secondary: true },
  { id: 'tecnicos',   label: 'TÉCNICOS',      icon: 'hard-hat',       secondary: true }
];

// Tabs do ambiente Financeiro (15 áreas). Todas funcionais e únicas.
// Abas do Financeiro reagrupadas (15 áreas → 9 abas-pai). Subáreas viram
// sub-abas dentro do pai (ver FIN_SUBGROUPS em financeiro.js):
//   RECEBÍVEIS = Títulos · Parcelamentos
//   PAGAMENTOS = Conferência · Comissões
//   COMPRAS    = Orçamentos · Ordem de Compra
//   MARGEM     = Precificação · Custos · DRE
//   AÇÕES      = Pendências · Aprovações
const FIN_TABS = [
  { id: 'visao',      label: 'VISÃO GERAL', icon: 'layout-dashboard' },
  { id: 'funil',      label: 'FUNIL',       icon: 'git-merge' },
  { id: 'recebiveis', label: 'RECEBÍVEIS',  icon: 'receipt' },
  { id: 'pagamentos', label: 'PAGAMENTOS',  icon: 'credit-card' },
  { id: 'compras',    label: 'COMPRAS',     icon: 'shopping-cart' },
  { id: 'margem',     label: 'MARGEM',      icon: 'bar-chart-3' },
  { id: 'acoes',      label: 'AÇÕES',       icon: 'badge-check' },
  { id: 'relatorios', label: 'RELATÓRIOS',  icon: 'pie-chart' },
  { id: 'config',     label: 'CONFIG',      icon: 'settings' }
];

// Tabs do ambiente Vistoria (operação de campo). Visão Geral e Funil são primárias;
// as demais entram na sub-nav (segunda linha), espelhando o padrão O&M/Financeiro.
const VISTORIA_TABS = [
  { id: 'visao',      label: 'VISÃO GERAL', icon: 'layout-dashboard' },
  { id: 'funil',      label: 'FUNIL',       icon: 'git-merge' },
  { id: 'agenda',     label: 'AGENDA',      icon: 'calendar-days' },
  { id: 'os',         label: 'ORDENS',      icon: 'clipboard-list' },
  { id: 'checklists', label: 'CHECKLISTS',  icon: 'list-checks' },
  { id: 'fotos',      label: 'FOTOS',       icon: 'camera' },
  { id: 'laudos',     label: 'LAUDOS',      icon: 'file-check' },
  { id: 'pendencias', label: 'PENDÊNCIAS',  icon: 'alert-triangle' },
  { id: 'equipes',    label: 'EQUIPES',     icon: 'users' },
  { id: 'historico',  label: 'HISTÓRICO',   icon: 'history' },
  { id: 'config',     label: 'CONFIG',      icon: 'settings' }
];

// Tabs do ambiente Engenharia (calculadora / dimensionamento fotovoltaico).
const ENG_TABS = [
  { id: 'calculadora',  label: 'CALCULADORA',  icon: 'calculator' },
  { id: 'equipamentos', label: 'EQUIPAMENTOS', icon: 'cpu' },
  { id: 'projetos',     label: 'PROJETOS',     icon: 'folder-open' }
];
