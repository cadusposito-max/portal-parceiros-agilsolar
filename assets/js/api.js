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
  // Unidade no modo "custos + margem": o banco calcula price_custos (centro de custo) e ele
  // vale no lugar do preço do markup. Promocionais nunca têm price_custos.
  const price = resolveBestPositiveValue(franchiseRows.map(r => r?.price), produto.price);
  const custos = franchiseRows.map(r => Number(r?.price_custos)).find(v => Number.isFinite(v) && v > 0);
  if (custos) {
    const deCustos = franchiseRows.map(r => Number(r?.list_price_custos)).find(v => Number.isFinite(v) && v > 0) || 0;
    const deMarkup = resolveBestPositiveValue(franchiseRows.map(r => r?.list_price), produto.list_price);
    return { price: custos, list_price: Math.max(deCustos, custos), preco_por: 'custos', preco_markup: price, list_price_markup: Math.max(deMarkup, price) };
  }
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

// Produtos com o preço da unidade. price_custos só existe depois da migration
// 20261009180000_preco_por_custos: sem ela, repete sem essas colunas (preço do markup).
async function selectProdutosDaUnidade(franquiaId, opcoes = {}) {
  const cols = (extra) => `
    id, categoria, name, brand, power, type, description, tag, ativo, created_at, price, list_price, franquia_id, linha,
    modulo_id, modulo_qtd, inversor_id, inversor_qtd, distribuidora_id,
    precos_franquia!inner(price, list_price${extra})`;
  // A API entrega no máximo 1.000 linhas por consulta. A carga normal da plataforma
  // fica como sempre foi (uma consulta). `todas: true` busca em páginas de 1.000,
  // 4 de cada vez, até acabar. `linha` traz só uma linha de kits (orçamento).
  const PAGINA = 1000;
  const daLinha = (q) => {
    if (!opcoes.linha) return q;
    return opcoes.linha === 'catalogo' ? q.or('linha.is.null,linha.eq.catalogo') : q.eq('linha', opcoes.linha);
  };
  const pagina = (extra, de) => daLinha(supabaseClient.from('produtos').select(cols(extra))
    .eq('precos_franquia.franquia_id', franquiaId))
    .order('power', { ascending: true }).order('id', { ascending: true })
    .range(de, de + PAGINA - 1);
  const consulta = async (extra) => {
    if (!opcoes.todas) {
      return daLinha(supabaseClient.from('produtos').select(cols(extra))
        .eq('precos_franquia.franquia_id', franquiaId)).order('power', { ascending: true });
    }
    const tudo = [];
    for (let de = 0; ; de += PAGINA * 4) {
      const rs = await Promise.all([0, 1, 2, 3].map((i) => pagina(extra, de + i * PAGINA)));
      const erro = rs.find((r) => r.error);
      if (erro) return erro;
      rs.forEach((r) => tudo.push(...(r.data || [])));
      if (rs.some((r) => !r.data || r.data.length < PAGINA)) return { data: tudo, error: null };
    }
  };
  const r = await consulta(', price_custos, list_price_custos');
  if (r.error && /price_custos|list_price_custos/.test(String(r.error.message || ''))) return consulta('');
  return r;
}

// ---------- linha de kits inteira, sob demanda (orçamento) ----------
// A carga normal (fetchProducts) traz só os 1.000 primeiros kits por potência; a
// Matriz tem milhares (catálogo + campanha). O orçamento pede a linha da aba aberta
// inteira e ela entra em state.data no lugar do pedaço que veio na carga normal.
// Fica guardada 10 min: um fetchProducts nesse meio tempo não perde os kits grandes
// (o que veio na carga normal vale mais, por ser mais novo).
const _linhaCompleta = {};   // linha → { fid, rows, em }
const _linhaCarregando = {}; // linha → Promise
const LINHA_COMPLETA_TTL = 10 * 60 * 1000;

function produtosFranquiaAlvo() {
  return state.isAdmin ? (state.adminKitsFranquia || state.franquiaId || null) : (state.franquiaId || null);
}
const _linhaDoKit = (k) => k?.linha || 'catalogo';

function _mesclarLinha(linha, rows, preferirAtuais) {
  const atuais = new Map((state.data || []).filter((k) => _linhaDoKit(k) === linha).map((k) => [String(k.id), k]));
  const novos = rows.map((k) => (preferirAtuais && atuais.has(String(k.id)) ? atuais.get(String(k.id)) : k));
  const ids = new Set(novos.map((k) => String(k.id)));
  // kit que veio na carga normal e não está na linha guardada (criado depois): fica
  if (preferirAtuais) atuais.forEach((k, id) => { if (!ids.has(id)) { novos.push(k); ids.add(id); } });
  state.data = (state.data || []).filter((k) => _linhaDoKit(k) !== linha && !ids.has(String(k.id)))
    .concat(novos)
    .sort((a, b) => (Number(a.power) || 0) - (Number(b.power) || 0));
}

function _linhaCompletaValida(linha) {
  const c = _linhaCompleta[linha];
  return Boolean(c && c.fid === produtosFranquiaAlvo() && Date.now() - c.em < LINHA_COMPLETA_TTL);
}

function linhaCompletaCarregando(linha) {
  return Boolean(_linhaCarregando[linha]);
}

// 'ok' = a linha inteira já está em state.data; 'carregando'; 'falta' = precisa pedir.
function linhaCompletaEstado(linha) {
  if (_linhaCarregando[linha]) return 'carregando';
  if (!_linhaCompletaValida(linha)) return 'falta';
  const c = _linhaCompleta[linha];
  if (c.dataRef !== state.data) { _mesclarLinha(linha, c.rows, true); c.dataRef = state.data; }
  return 'ok';
}

async function carregarLinhaCompleta(linha) {
  const fid = produtosFranquiaAlvo();
  if (!state.currentUser || !fid || !linha) return false;
  if (_linhaCarregando[linha]) return _linhaCarregando[linha];
  const p = (async () => {
    try {
      const { data, error } = await selectProdutosDaUnidade(fid, { todas: true, linha });
      if (error) throw error;
      if (produtosFranquiaAlvo() !== fid) return false; // trocou de unidade no meio
      const rows = (data || []).map((k) => enrichProductForUI({ ...k, ...resolveProductPrices(k) }));
      _mesclarLinha(linha, rows, false);
      _linhaCompleta[linha] = { fid, rows, em: Date.now(), dataRef: state.data };
      return true;
    } catch (err) {
      console.warn(`[produtos] Não foi possível carregar todos os kits (${linha}).`, err);
      // não tenta de novo em seguida: marca como "feita" por 1 min com o que já tinha
      _linhaCompleta[linha] = { fid, rows: (state.data || []).filter((k) => _linhaDoKit(k) === linha), em: Date.now() - LINHA_COMPLETA_TTL + 60000, dataRef: state.data };
      return false;
    } finally {
      delete _linhaCarregando[linha];
    }
  })();
  _linhaCarregando[linha] = p;
  return p;
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
      const { data, error } = await selectProdutosDaUnidade(targetFranquiaId);
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
    const { data, error } = await selectProdutosDaUnidade(state.franquiaId);

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
    .is('merged_into', null)   // oculta perdedores de mesclagens
    .is('arquivado_em', null)  // oculta o que a higiene do funil arquivou
    .order('created_at', { ascending: false });

  applyOperationalScopeToQuery(query);

  const { data, error } = await query;
  if (!error) state.clientes = data || [];

  // Enriquecimentos do CRM (flags O&M + última atividade + nomes dos
  // vendedores) — falha silenciosa, a lista funciona sem eles.
  await Promise.all([fetchOmFlags(), fetchCrmLastAtividades(), fetchVendedorNomes()]).catch(() => {});
}

// Mapa email -> nome cadastrado do vendedor, para o filtro/ranking do dashboard
// exibirem o nome real em vez do começo do email. Só admin/gestor têm o filtro,
// então só eles buscam (a RPC também barra os demais). Falha silenciosa: sem o
// mapa, dashVendedorNome() cai no fallback derivado do email.
async function fetchVendedorNomes() {
  try {
    if (!(state.isAdmin || state.isGestor)) { state.vendedorNomes = {}; return; }

    const { data, error } = await supabaseClient.rpc('get_vendedores_nomes');
    if (error) return;

    const map = {};
    (data || []).forEach((row) => {
      const email = String(row?.email || '').trim().toLowerCase();
      const nome = String(row?.nome || '').trim();
      if (email && nome) map[email] = nome;
    });
    state.vendedorNomes = map;
  } catch (err) {
    console.warn('[fetchVendedorNomes] Falha silenciosa.', err);
  }
}

// Flags O&M por cliente (badge nos cards + aba O&M do painel 360°)
async function fetchOmFlags() {
  try {
    const ids = (state.clientes || []).map((c) => c.id);
    if (ids.length === 0) { state.omFlags = {}; return; }

    const { data, error } = await supabaseClient.rpc('get_om_flags', { p_cliente_ids: ids });
    if (error) return;

    const map = {};
    (data || []).forEach((row) => { map[row.cliente_id] = row; });
    state.omFlags = map;
  } catch (err) {
    console.warn('[fetchOmFlags] Falha silenciosa.', err);
  }
}

// Histórico de mudanças de status (aba ANÁLISE: tempo médio por etapa).
// As linhas são gravadas pelo trigger trg_clientes_log_status, com meta
// {de, para, motivo}. RLS escopa via a policy de crm_atividades.
// Lazy: só a aba Análise chama, para não pesar o boot de quem não usa.
async function fetchCrmStatusHistory() {
  if (!state.currentUser) return;
  try {
    const { data, error } = await supabaseClient
      .from('crm_atividades')
      .select('cliente_id, created_at, meta')
      .eq('tipo', 'status')
      .order('created_at', { ascending: true });
    if (error) { console.warn('[fetchCrmStatusHistory] Falha silenciosa.', error); return; }
    state.crmStatusHistory = data || [];
  } catch (err) {
    console.warn('[fetchCrmStatusHistory] Falha silenciosa.', err);
  }
}

// Metas mensais de venda (crm_metas). A RLS já escopa: vendedor recebe só a
// própria meta e a da franquia; gestor/admin recebem as do time.
async function fetchCrmMetas() {
  if (!state.currentUser) return;
  try {
    const hoje = new Date();
    // Mês atual + anterior: o dashboard compara o progresso com o mês passado.
    const desde = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
    const { data, error } = await supabaseClient
      .from('crm_metas')
      .select('*')
      .gte('mes', desde.toISOString().slice(0, 10));
    if (error) { console.warn('[fetchCrmMetas] Falha silenciosa.', error); return; }
    state.crmMetas = data || [];
  } catch (err) {
    console.warn('[fetchCrmMetas] Falha silenciosa.', err);
  }
}

// Última atividade CRM por cliente ("atividade há 12d" nos cards)
async function fetchCrmLastAtividades() {
  try {
    const { data, error } = await supabaseClient.rpc('get_crm_last_atividades');
    if (error) return;

    const map = {};
    (data || []).forEach((row) => { map[row.cliente_id] = row; });
    state.crmLastAtividade = map;
  } catch (err) {
    console.warn('[fetchCrmLastAtividades] Falha silenciosa.', err);
  }
}

async function fetchPropostas() {
  if (!state.currentUser) return;
  const query = supabaseClient
    .from('propostas')
    .select('*')
    .order('created_at', { ascending: false });

  applyOperationalScopeToQuery(query);

  const { data, error } = await query;
  if (error) {
    console.error('[fetchPropostas] Falha ao carregar propostas.', error);
    if (typeof showToast === 'function') showToast('Não foi possível carregar as propostas. Tente atualizar.');
    return;
  }
  state.propostas = data || [];
}

async function fetchVendas() {
  if (!state.currentUser) return;
  const query = supabaseClient
    .from('vendas')
    .select('*')
    .order('created_at', { ascending: false });

  applyOperationalScopeToQuery(query);

  const { data, error } = await query;
  if (error) {
    console.error('[fetchVendas] Falha ao carregar vendas.', error);
    if (typeof showToast === 'function') showToast('Não foi possível carregar as vendas. Tente atualizar.');
    return;
  }
  state.vendas = data || [];
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

// Catálogo completo de equipamentos individuais (com preço/custo/inativos) para
// a gestão na aba PRODUTOS. Lê a base direto: só admin vê tudo (RLS componentes_
// admin_write ALL); demais só ativos. Chamado lazy ao abrir a seção EQUIPAMENTOS.
async function fetchEquipamentos() {
  if (!state.currentUser) return;
  const { data, error } = await supabaseClient
    .from('componentes')
    .select('*')
    .order('tipo', { ascending: true })
    .order('nome', { ascending: true });
  if (error) {
    console.error('[fetchEquipamentos] Falha ao carregar equipamentos.', error);
    if (typeof showToast === 'function') showToast('Não foi possível carregar os equipamentos.');
    return;
  }
  state.equipamentos = data || [];
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
