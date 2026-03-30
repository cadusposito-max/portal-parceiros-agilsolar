// ==========================================
// CONFIGURACAO SUPABASE + ESTADO GLOBAL
// ==========================================

const SUPABASE_URL = 'https://tzwjxgprhorqrmpqudgg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR6d2p4Z3ByaG9ycXJtcHF1ZGdnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxMjczNTksImV4cCI6MjA4NzcwMzM1OX0.hwfzCb9FGVXX7Uf0pY7zFS6SZHrh0pzWk1gKFVq2DX4';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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
