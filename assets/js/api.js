// ==========================================
// BUSCA DE DADOS (Supabase)
// ==========================================

function enrichProductForUI(produto) {
  const power = Number(produto.power) || 0;
  const categoria = produto.categoria || 'kitsInversor';
  return {
    ...produto,
    power,
    price: Number(produto.price) || 0,
    list_price: Number(produto.list_price) || 0,
    _searchBlob: `${produto.name || ''} ${produto.brand || ''} ${power}`.toLowerCase(),
    _estGeneration: calcularGeracaoEstimada(power, categoria),
  };
}

function resolveBestPositiveValue(values, fallback) {
  const validValues = (Array.isArray(values) ? values : [])
    .map(v => Number(v))
    .filter(v => Number.isFinite(v) && v > 0);

  if (validValues.length > 0) {
    return Math.max(...validValues);
  }

  const fallbackNumber = Number(fallback);
  return Number.isFinite(fallbackNumber) && fallbackNumber > 0 ? fallbackNumber : 0;
}

function resolveProductPrices(produto) {
  const franchiseRows = Array.isArray(produto.precos_franquia) ? produto.precos_franquia : [];
  const price = resolveBestPositiveValue(franchiseRows.map(r => r?.price), produto.price);
  const listPriceRaw = resolveBestPositiveValue(franchiseRows.map(r => r?.list_price), produto.list_price);
  const listPrice = Math.max(listPriceRaw, price);

  return { price, list_price: listPrice };
}

function sanitizeAdminCreateUserErrorMessage(rawMessage) {
  const normalized = String(rawMessage || '').trim().toLowerCase();
  if (!normalized) return 'Falha ao criar usuario no backend.';

  if (normalized.includes('already') || normalized.includes('exists') || normalized.includes('ja existe')) {
    return 'Ja existe um usuario com este e-mail.';
  }
  if (normalized.includes('email') && normalized.includes('invalid')) {
    return 'E-mail invalido para criacao do usuario.';
  }
  if (normalized.includes('password') && (normalized.includes('weak') || normalized.includes('invalid'))) {
    return 'Senha temporaria invalida.';
  }

  // Evita vazar detalhes internos de SQL/RPC para o cliente.
  return 'Falha ao criar usuario no backend.';
}

function applyOperationalScopeToQuery(query) {
  if (!query || !state.currentUser) return query;

  if (state.isAdmin) {
    // Admin consolidado: sem filtro adicional.
    // Admin minha unidade: filtra por franquia, nao por email do admin.
    if (!state.adminViewAll) {
      if (state.franquiaId) {
        query.eq('franquia_id', state.franquiaId);
      } else {
        // Fallback defensivo para base legada sem franquia no JWT.
        query.eq('vendedor_email', state.currentUser.email);
      }
    }
    return query;
  }

  if (state.isGestor) {
    // Gestor com view-all enxerga a unidade inteira (RLS).
    if (!state.gestorViewAll) query.eq('vendedor_email', state.currentUser.email);
    return query;
  }

  // Vendedor sempre ve apenas propria carteira.
  query.eq('vendedor_email', state.currentUser.email);
  return query;
}

async function fetchFranquiasCatalog() {
  if (!state.currentUser) return;
  const { data, error } = await supabaseClient
    .from('franquias')
    .select('id, nome, cidade, ativo')
    .order('nome', { ascending: true });

  if (!error) {
    state.franquiasCatalog = data || [];
  }
}

async function createAdminUserWithConfirmedEmail(params = {}) {
  if (!state.isAdmin) {
    throw new Error('Apenas administradores podem criar usuarios.');
  }

  if (!supabaseClient?.functions || typeof supabaseClient.functions.invoke !== 'function') {
    throw new Error('Supabase Functions indisponivel no cliente.');
  }

  // Garante que o token JWT mais recente da sessão é enviado explicitamente,
  // evitando 401 causado pelo SDK não anexar o header automaticamente.
  const { data: sessionData } = await supabaseClient.auth.getSession();
  const accessToken = sessionData?.session?.access_token;
  if (!accessToken) {
    throw new Error('Sessao expirada. Faca login novamente.');
  }

  const payload = {
    email: String(params.email || '').trim().toLowerCase(),
    password: String(params.password || ''),
    nome: params.nome == null ? null : (String(params.nome).trim() || null),
    role: String(params.role || 'vendedor').toLowerCase(),
    franquia_id: params.franquia_id || null,
    ativo: params.ativo !== false,
  };

  const { data, error } = await supabaseClient.functions.invoke('admin-create-user', {
    body: payload,
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (error) {
    let message = error.message || '';
    const response = error.context;
    if (response) {
      try {
        const body = await response.clone().json();
        if (body && body.error) message = String(body.error);
      } catch (parseError) {
        console.warn('[createAdminUserWithConfirmedEmail] Resposta de erro nao-JSON, mantendo mensagem padrao.', parseError);
      }
    }
    throw new Error(sanitizeAdminCreateUserErrorMessage(message));
  }

  if (!data || !data.user_id) {
    throw new Error('Usuario criado sem retorno de identificador.');
  }

  return data;
}

async function fetchProducts() {
  if (!state.currentUser) return;

  // Admin: carrega produtos com preços da Matriz (referência)
  // Vendedor: carrega produtos com preço da própria franquia via JOIN
  if (state.isAdmin) {
    // Para admin, sempre prioriza preços por franquia:
    // 1) franquia selecionada no painel admin; 2) própria franquia do usuário.
    const targetFranquiaId = state.adminKitsFranquia || state.franquiaId || null;

    if (targetFranquiaId) {
      // Admin com franquia alvo: carrega preços daquela franquia
      const { data, error } = await supabaseClient
        .from('produtos')
        .select(`
          id, categoria, name, brand, power, type, description, tag, created_at, price, list_price,
          precos_franquia(price, list_price)
        `)
        .eq('precos_franquia.franquia_id', targetFranquiaId)
        .order('power', { ascending: true });
      if (!error) {
        state.data = (data || []).map(p => enrichProductForUI({
          ...p,
          ...resolveProductPrices(p),
        }));
      }
    } else {
      // Fallback de segurança quando não houver franquia vinculada no JWT.
      const { data, error } = await supabaseClient
        .from('produtos')
        .select('*')
        .order('power', { ascending: true });
      if (!error) state.data = (data || []).map(enrichProductForUI);
    }
  } else {
    // JOIN com precos_franquia para retornar o preço correto da franquia do vendedor
    const { data, error } = await supabaseClient
      .from('produtos')
      .select(`
        id, categoria, name, brand, power, type, description, tag, created_at, price, list_price,
        precos_franquia!inner(price, list_price)
      `)
      .eq('precos_franquia.franquia_id', state.franquiaId)
      .order('power', { ascending: true });

    if (!error) {
      // Achata o resultado: substitui price/list_price pelo valor da franquia
      state.data = (data || []).map(p => enrichProductForUI({
        ...p,
        ...resolveProductPrices(p),
      }));
    }
  }
}

async function fetchClientes() {
  if (!state.currentUser) return;
  const query = supabaseClient
    .from('clientes')
    .select('*')
    .order('created_at', { ascending: false });

  applyOperationalScopeToQuery(query);

  const { data, error } = await query;
  if (!error) state.clientes = data || [];
}

async function fetchPropostas() {
  if (!state.currentUser) return;
  const query = supabaseClient
    .from('propostas')
    .select('*')
    .order('created_at', { ascending: false });

  applyOperationalScopeToQuery(query);

  const { data, error } = await query;
  if (!error) state.propostas = data || [];
}

async function fetchVendas() {
  if (!state.currentUser) return;
  const query = supabaseClient
    .from('vendas')
    .select('*')
    .order('created_at', { ascending: false });

  applyOperationalScopeToQuery(query);

  const { data, error } = await query;
  if (!error) state.vendas = data || [];
}

async function fetchFranquia() {
  if (!state.franquiaId) return;
  const { data, error } = await supabaseClient
    .from('franquias')
    .select('nome, hsp_medio')
    .eq('id', state.franquiaId)
    .single();
  if (!error && data) {
    state.franquiaNome = data.nome;
    state.franquiaHsp  = data.hsp_medio ?? 5.4;
  }
}

let _fetchComponentesWarned = false;

async function fetchComponentes() {
  const { data, error } = await supabaseClient
    .from('v_componentes_public')
    .select('id, tipo, nome, potencia_wp')
    .order('tipo')
    .order('nome');
  if (!error) {
    _fetchComponentesWarned = false;
    state.componentes = data || [];
    return;
  }

  if (!_fetchComponentesWarned) {
    console.warn('[fetchComponentes] v_componentes_public indisponivel. Mantendo fluxo sem componentes.', error);
    _fetchComponentesWarned = true;
  }
}

async function fetchComunicados(options = {}) {
  const silent = options.silent !== false;
  const service = window.comunicadosService;
  if (!service || typeof service.refresh !== 'function') return;

  try {
    await service.refresh({ allowFallback: true });
  } catch (error) {
    console.error('Erro ao carregar comunicados:', error);
    if (!silent) showToast('Nao foi possivel carregar comunicados.');
  }
}
