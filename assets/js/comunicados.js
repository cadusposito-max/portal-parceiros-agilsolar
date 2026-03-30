// ==========================================
// COMUNICADOS: SERVICE + PERSISTENCIA
// ==========================================

/**
 * @typedef {'comunicado'|'novidade'|'parceria'|'aviso'} ComunicadoType
 */

/**
 * @typedef {'draft'|'published'} ComunicadoStatus
 */

/**
 * @typedef {Object} Comunicado
 * @property {string} id
 * @property {string} title
 * @property {string} slug
 * @property {string} summary
 * @property {string} content
 * @property {string} coverImageUrl
 * @property {string} createdAt
 * @property {string|null} publishedAt
 * @property {boolean} isPublished
 * @property {string} [authorName]
 * @property {ComunicadoType} type
 * @property {ComunicadoStatus} status
 */

(() => {
  const COMUNICADO_TYPES = Object.freeze(['comunicado', 'novidade', 'parceria', 'aviso']);
  const COMUNICADO_STATUS = Object.freeze({
    DRAFT: 'draft',
    PUBLISHED: 'published',
  });

  const TABLE_NAME = 'comunicados';
  const LOCAL_STORAGE_KEY = 'agilsolar.comunicados.v1';
  const FALLBACK_COVER_IMAGE = 'assets/img/logo.png';

  /**
   * Seed apenas para fallback de desenvolvimento.
   * Nao e a fonte principal de dados da home.
   * @type {Comunicado[]}
   */
  const devSeedComunicados = [
    {
      id: 'seed-comunicado-boas-praticas',
      title: 'Boas praticas comerciais atualizadas',
      slug: 'boas-praticas-comerciais-atualizadas',
      summary: 'Publicamos uma revisao do playbook comercial para padronizar atendimento e fechamento.',
      content: 'A versao atual do playbook ja esta disponivel para toda a equipe no portal interno.',
      coverImageUrl: 'assets/img/logo-light.png',
      createdAt: '2026-03-15T09:00:00-03:00',
      publishedAt: '2026-03-15T09:15:00-03:00',
      isPublished: true,
      authorName: 'Equipe Comercial',
      type: 'novidade',
      status: 'published',
    },
  ];

  /** @type {Comunicado[]} */
  let comunicadoStore = [];
  let sourceMode = 'local'; // 'supabase' | 'local'
  let lastError = null;

  const parseTimestamp = (value) => {
    const ts = Date.parse(value || '');
    return Number.isFinite(ts) ? ts : 0;
  };

  const nowIso = () => new Date().toISOString();

  const canUseLocalStorage = () => {
    try {
      return typeof window !== 'undefined' && !!window.localStorage;
    } catch (_) {
      return false;
    }
  };

  const getSupabaseClient = () => {
    if (typeof supabaseClient !== 'undefined') return supabaseClient;
    return null;
  };

  const getCurrentUser = () => {
    if (typeof state === 'undefined') return null;
    return state.currentUser || null;
  };

  const isAdminUser = () => {
    if (typeof state === 'undefined') return false;
    return Boolean(state.currentUser && state.isAdmin);
  };

  const assertAdminWriteAccess = () => {
    if (isAdminUser()) return;
    throw new Error('Apenas administradores podem alterar comunicados.');
  };

  function stripAccents(str = '') {
    return String(str)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  function slugify(text = '') {
    const cleaned = stripAccents(String(text || ''))
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    return cleaned;
  }

  function normalizeType(type) {
    const raw = String(type || '').toLowerCase();
    return COMUNICADO_TYPES.includes(raw) ? raw : 'comunicado';
  }

  function normalizeStatus(status, isPublished) {
    if (typeof isPublished === 'boolean') {
      return isPublished ? COMUNICADO_STATUS.PUBLISHED : COMUNICADO_STATUS.DRAFT;
    }

    const raw = String(status || '').toLowerCase();
    return raw === COMUNICADO_STATUS.PUBLISHED
      ? COMUNICADO_STATUS.PUBLISHED
      : COMUNICADO_STATUS.DRAFT;
  }

  function normalizeIso(value, fallback) {
    const str = String(value || '').trim();
    if (!str) return fallback;
    const parsed = new Date(str);
    if (Number.isNaN(parsed.getTime())) return fallback;
    return parsed.toISOString();
  }

  function ensureUniqueSlug(baseSlug, idToIgnore) {
    const base = slugify(baseSlug) || `comunicado-${Date.now()}`;

    const slugExists = (slug) => comunicadoStore.some(item => (
      item.slug === slug && item.id !== idToIgnore
    ));

    if (!slugExists(base)) return base;

    let suffix = 2;
    let candidate = `${base}-${suffix}`;
    while (slugExists(candidate)) {
      suffix++;
      candidate = `${base}-${suffix}`;
    }
    return candidate;
  }

  /**
   * @param {Partial<Comunicado>|Record<string, any>} input
   * @returns {Comunicado}
   */
  function normalizeComunicado(input = {}) {
    const createdAt = normalizeIso(input.createdAt || input.created_at, nowIso());
    const status = normalizeStatus(input.status, input.isPublished);
    const isPublished = status === COMUNICADO_STATUS.PUBLISHED;

    let publishedAt = null;
    if (isPublished) {
      publishedAt = normalizeIso(input.publishedAt || input.published_at, createdAt);
    }

    const title = String(input.title || '').trim();
    const slug = String(input.slug || '').trim().toLowerCase() || slugify(title);

    return {
      id: input.id ? String(input.id) : '',
      title,
      slug,
      summary: String(input.summary || ''),
      content: String(input.content || ''),
      coverImageUrl: String(input.coverImageUrl || input.cover_image_url || FALLBACK_COVER_IMAGE),
      createdAt,
      publishedAt,
      isPublished,
      authorName: String(input.authorName || input.author_name || ''),
      type: normalizeType(input.type),
      status,
    };
  }

  function rowToModel(row) {
    return normalizeComunicado(row || {});
  }

  function modelToRow(modelInput = {}) {
    const model = normalizeComunicado(modelInput);

    return {
      title: model.title,
      slug: model.slug,
      summary: model.summary,
      content: model.content,
      cover_image_url: model.coverImageUrl || FALLBACK_COVER_IMAGE,
      type: normalizeType(model.type),
      author_name: model.authorName || null,
      status: model.status,
      published_at: model.status === COMUNICADO_STATUS.PUBLISHED
        ? normalizeIso(model.publishedAt, nowIso())
        : null,
    };
  }

  function sortByMostRecent(items) {
    return (Array.isArray(items) ? items : [])
      .slice()
      .sort((a, b) => {
        const aDate = parseTimestamp(a.publishedAt || a.createdAt);
        const bDate = parseTimestamp(b.publishedAt || b.createdAt);
        return bDate - aDate;
      });
  }

  function applyLimit(items, limit) {
    const safeLimit = Number(limit);
    if (!Number.isFinite(safeLimit) || safeLimit <= 0) return items;
    return items.slice(0, Math.floor(safeLimit));
  }

  function cloneItems(items) {
    return items.map(item => ({ ...item }));
  }

  function persistLocalStore(items) {
    if (!canUseLocalStorage()) return;
    try {
      window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(items));
    } catch (_) {
      // no-op
    }
  }

  function loadLocalStore() {
    if (!canUseLocalStorage()) return [];
    try {
      const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return sortByMostRecent(parsed.map(normalizeComunicado));
    } catch (_) {
      return [];
    }
  }

  function setStore(items, mode) {
    comunicadoStore = sortByMostRecent((Array.isArray(items) ? items : []).map(normalizeComunicado));
    sourceMode = mode;
  }

  function bootstrapFallbackStore() {
    const localItems = loadLocalStore();
    if (localItems.length > 0) {
      setStore(localItems, 'local');
      return;
    }

    const seeded = devSeedComunicados.map(normalizeComunicado);
    setStore(seeded, 'local');
    if (seeded.length > 0) persistLocalStore(seeded);
  }

  async function fetchSupabaseRows() {
    const client = getSupabaseClient();
    if (!client) throw new Error('Supabase indisponivel.');

    let query = client
      .from(TABLE_NAME)
      .select('id, title, slug, summary, content, cover_image_url, type, author_name, status, published_at, created_at, updated_at')
      .order('published_at', { ascending: false })
      .order('created_at', { ascending: false });

    // Defesa em profundidade: usuario comum nunca deve receber rascunhos no client,
    // mesmo se policy de leitura estiver permissiva demais no backend.
    if (!isAdminUser()) {
      query = query.eq('status', COMUNICADO_STATUS.PUBLISHED);
    }

    const { data, error } = await query;

    if (error) throw error;
    return (data || []).map(rowToModel);
  }

  async function refresh(options = {}) {
    const allowFallback = options.allowFallback !== false;
    const hasUser = !!getCurrentUser();
    const hasSupabase = !!getSupabaseClient();

    if (hasUser && hasSupabase) {
      try {
        const rows = await fetchSupabaseRows();
        setStore(rows, 'supabase');
        persistLocalStore(comunicadoStore);
        lastError = null;
        return cloneItems(comunicadoStore);
      } catch (error) {
        lastError = error;
        if (!allowFallback) throw error;
      }
    }

    const fallbackItems = loadLocalStore();
    if (fallbackItems.length > 0) {
      setStore(fallbackItems, 'local');
      return cloneItems(comunicadoStore);
    }

    bootstrapFallbackStore();
    return cloneItems(comunicadoStore);
  }

  function listAll(options = {}) {
    const sorted = sortByMostRecent(comunicadoStore);
    return cloneItems(applyLimit(sorted, options.limit));
  }

  function listPublished(options = {}) {
    const filtered = comunicadoStore.filter(item => item.status === COMUNICADO_STATUS.PUBLISHED);
    const sorted = sortByMostRecent(filtered);
    return cloneItems(applyLimit(sorted, options.limit));
  }

  function countPublished() {
    return comunicadoStore.reduce((acc, item) => acc + (item.status === COMUNICADO_STATUS.PUBLISHED ? 1 : 0), 0);
  }

  function getById(id) {
    if (!id) return null;
    const item = comunicadoStore.find(row => row.id === String(id));
    return item ? { ...item } : null;
  }

  function getBySlug(slug) {
    if (!slug) return null;
    const item = comunicadoStore.find(row => row.slug === String(slug));
    return item ? { ...item } : null;
  }

  async function save(payload = {}) {
    assertAdminWriteAccess();

    const model = normalizeComunicado(payload);
    const titleBasedSlug = model.slug || slugify(model.title);

    const finalized = {
      ...model,
      slug: ensureUniqueSlug(titleBasedSlug, model.id),
      coverImageUrl: model.coverImageUrl || FALLBACK_COVER_IMAGE,
      status: normalizeStatus(model.status, model.isPublished),
    };

    finalized.isPublished = finalized.status === COMUNICADO_STATUS.PUBLISHED;
    finalized.publishedAt = finalized.isPublished
      ? normalizeIso(finalized.publishedAt, nowIso())
      : null;

    const hasUser = !!getCurrentUser();
    const client = getSupabaseClient();
    const canFallbackWrite = sourceMode === 'local';

    if (hasUser && client) {
      try {
        const rowPayload = modelToRow(finalized);
        let savedRow = null;

        const hasExisting = Boolean(finalized.id) && comunicadoStore.some(item => item.id === finalized.id);
        if (hasExisting) {
          const { data, error } = await client
            .from(TABLE_NAME)
            .update(rowPayload)
            .eq('id', finalized.id)
            .select('id, title, slug, summary, content, cover_image_url, type, author_name, status, published_at, created_at')
            .single();
          if (error) throw error;
          savedRow = data;
        } else {
          const { data, error } = await client
            .from(TABLE_NAME)
            .insert([rowPayload])
            .select('id, title, slug, summary, content, cover_image_url, type, author_name, status, published_at, created_at')
            .single();
          if (error) throw error;
          savedRow = data;
        }

        const savedModel = rowToModel(savedRow || finalized);
        const existingIndex = comunicadoStore.findIndex(item => item.id === savedModel.id);
        if (existingIndex >= 0) comunicadoStore[existingIndex] = savedModel;
        else comunicadoStore.push(savedModel);

        comunicadoStore = sortByMostRecent(comunicadoStore);
        sourceMode = 'supabase';
        lastError = null;
        persistLocalStore(comunicadoStore);
        return { ...savedModel };
      } catch (error) {
        lastError = error;
        if (!canFallbackWrite) throw error;
      }
    }

    const localFinalized = {
      ...finalized,
      id: finalized.id || `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    };

    const fallbackIndex = comunicadoStore.findIndex(item => item.id === localFinalized.id);
    if (fallbackIndex >= 0) comunicadoStore[fallbackIndex] = localFinalized;
    else comunicadoStore.push(localFinalized);

    comunicadoStore = sortByMostRecent(comunicadoStore);
    sourceMode = 'local';
    persistLocalStore(comunicadoStore);
    return { ...localFinalized };
  }

  async function remove(id) {
    assertAdminWriteAccess();

    const targetId = String(id || '');
    if (!targetId) return false;

    const hasUser = !!getCurrentUser();
    const client = getSupabaseClient();
    const canFallbackWrite = sourceMode === 'local';

    if (hasUser && client) {
      try {
        const { error } = await client
          .from(TABLE_NAME)
          .delete()
          .eq('id', targetId);

        if (error) throw error;
        lastError = null;
        sourceMode = 'supabase';
      } catch (error) {
        lastError = error;
        if (!canFallbackWrite) throw error;
      }
    }

    const before = comunicadoStore.length;
    comunicadoStore = comunicadoStore.filter(item => item.id !== targetId);
    const changed = comunicadoStore.length !== before;
    persistLocalStore(comunicadoStore);
    return changed;
  }

  async function setPublished(id, shouldPublish) {
    assertAdminWriteAccess();

    const item = getById(id);
    if (!item) throw new Error('Comunicado nao encontrado.');

    return save({
      ...item,
      status: shouldPublish ? COMUNICADO_STATUS.PUBLISHED : COMUNICADO_STATUS.DRAFT,
      isPublished: !!shouldPublish,
      publishedAt: shouldPublish ? (item.publishedAt || nowIso()) : null,
    });
  }

  function createDraft(payload = {}) {
    return normalizeComunicado({
      ...payload,
      id: payload.id || '',
      status: COMUNICADO_STATUS.DRAFT,
      isPublished: false,
      publishedAt: null,
    });
  }

  function getSourceMode() {
    return sourceMode;
  }

  function getLastError() {
    return lastError;
  }

  function isFallbackData() {
    return sourceMode !== 'supabase';
  }

  bootstrapFallbackStore();

  window.comunicadosService = {
    COMUNICADO_TYPES,
    COMUNICADO_STATUS,
    listAll,
    listPublished,
    countPublished,
    getById,
    getBySlug,
    refresh,
    save,
    remove,
    setPublished,
    createDraft,
    slugify,
    getSourceMode,
    isFallbackData,
    getLastError,
  };
})();
