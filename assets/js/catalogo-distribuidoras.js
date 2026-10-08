// ==========================================
// CATÁLOGO — DISTRIBUIDORAS E OFERTAS DE EQUIPAMENTOS
// ==========================================
// A ficha técnica é única. Disponibilidade e preço pertencem à oferta da
// distribuidora; o valor do kit continua sendo o preço da unidade do vendedor.
let _catalogoDistrib = { carregado: false, erro: null, distribuidoras: [], ofertas: [], equipamentos: [] };
let _catalogoDistribPromise = null;
let _catalogoDistribUsuario = null;
// O módulo guarda marca e potência do painel; o inversor guarda só a marca.
let _pbFornecimento = { distribuidora: '', modulo: '', inversor: '' };

async function carregarCatalogoDistribuidoras(force = false) {
  const usuario = state.currentUser?.id || state.currentUser?.email;
  if (!usuario) return _catalogoDistrib;
  if (_catalogoDistribUsuario !== usuario) {
    _catalogoDistribUsuario = usuario;
    _catalogoDistrib = { carregado: false, erro: null, distribuidoras: [], ofertas: [], equipamentos: [] };
    _catalogoDistribPromise = null;
    _pbFornecimento = { distribuidora: '', modulo: '', inversor: '' };
  }
  if (_catalogoDistribPromise) return _catalogoDistribPromise;
  if (_catalogoDistrib.carregado && !force) return _catalogoDistrib;
  const promise = (async () => {
    try {
      const [dist, ofertas, equipamentos] = await Promise.all([
        supabaseClient.from('distribuidoras').select('id,nome,ativo').order('nome'),
        supabaseClient.from('distribuidora_componentes').select('distribuidora_id,componente_id,preco_unitario,ativo'),
        supabaseClient.from('componentes').select('id,tipo,nome,marca,potencia_wp,unidade,preco_unitario,ativo,ficha').order('nome'),
      ]);
      const error = dist.error || ofertas.error || equipamentos.error;
      if (error) throw error;
      if (_catalogoDistribUsuario !== usuario) return _catalogoDistrib;
      _catalogoDistrib = { carregado: true, erro: null, distribuidoras: dist.data || [], ofertas: ofertas.data || [], equipamentos: equipamentos.data || [] };
    } catch (error) {
      if (_catalogoDistribUsuario === usuario) _catalogoDistrib.erro = error;
      console.warn('[catálogo] Não foi possível carregar as distribuidoras.', error);
    }
    return _catalogoDistrib;
  })();
  _catalogoDistribPromise = promise;
  try { return await promise; }
  finally { if (_catalogoDistribPromise === promise) _catalogoDistribPromise = null; }
}

function catalogoDistribuidora(id) {
  return _catalogoDistrib.distribuidoras.find((d) => String(d.id) === String(id));
}

function catalogoEquipamentosDaDistribuidora(id = '') {
  const equipamentos = _catalogoDistrib.equipamentos.filter((e) => e.ativo !== false);
  if (!id) return equipamentos;
  const dist = catalogoDistribuidora(id);
  if (!dist || dist.ativo === false) return [];
  const ofertas = new Map(_catalogoDistrib.ofertas.filter((o) => String(o.distribuidora_id) === String(id) && o.ativo !== false)
    .map((o) => [String(o.componente_id), o]));
  return equipamentos.filter((e) => ofertas.has(String(e.id))).map((e) => ({
    ...e, distribuidora_id: id, preco_unitario: Number(ofertas.get(String(e.id)).preco_unitario),
  }));
}

function pbMarcaEquipamento(marca) {
  return String(marca || '').trim().replace(/\s+/g, ' ').toLocaleUpperCase('pt-BR');
}

function pbMarcasEquipamentos(equipamentos, tipo) {
  return [...new Set(equipamentos.filter((e) => e.tipo === tipo).map((e) => pbMarcaEquipamento(e.marca)).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

function pbDescricaoModulo(equipamento) {
  const marca = pbMarcaEquipamento(equipamento?.marca);
  const potencia = Number(equipamento?.potencia_wp);
  if (!marca) return '';
  return Number.isFinite(potencia) && potencia > 0
    ? `${marca} · ${potencia.toLocaleString('pt-BR', { maximumFractionDigits: 20 })} W` : marca;
}

function pbModulosEquipamentos(equipamentos) {
  return [...new Set(equipamentos.filter((e) => e.tipo === 'modulo').map(pbDescricaoModulo).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
}

function pbMarcaDoComponente(id, tipo) {
  const equipamento = _catalogoDistrib.equipamentos.find((e) => String(e.id) === String(id) && e.tipo === tipo && e.ativo !== false);
  return pbMarcaEquipamento(equipamento?.marca);
}

// Inversor trifásico (ficha.rede 'tri_*') só serve pra ligação trifásica.
// Sem a rede na ficha, não bloqueia.
function pbKitServeLigacao(kit, ligacao) {
  if (ligacao === 'tri') return true;
  const inversor = _catalogoDistrib.equipamentos.find((e) => String(e.id) === String(kit?.inversor_id));
  return !String(inversor?.ficha?.rede || '').startsWith('tri');
}

function pbKitCompativel(kit) {
  if (!kit || kit.ativo === false) return false;
  const f = _pbFornecimento;
  // Kit sem distribuidora marcada vale para a distribuidora escolhida quando
  // ela oferece o módulo e o inversor dele (conferido no fim).
  if (f.distribuidora && kit.distribuidora_id && String(kit.distribuidora_id) !== f.distribuidora) return false;
  const distribuidora = String(kit.distribuidora_id || f.distribuidora || '');
  if (f.modulo) {
    const modulo = _catalogoDistrib.equipamentos.find((e) => String(e.id) === String(kit.modulo_id) && e.tipo === 'modulo' && e.ativo !== false);
    if (pbDescricaoModulo(modulo) !== f.modulo) return false;
  }
  if (f.inversor && pbMarcaDoComponente(kit.inversor_id, 'inversor') !== f.inversor) return false;
  if (distribuidora) {
    if (!_catalogoDistrib.carregado) return false;
    const disponiveis = new Set(catalogoEquipamentosDaDistribuidora(distribuidora).map((e) => String(e.id)));
    if (!kit.modulo_id || !kit.inversor_id || !disponiveis.has(String(kit.modulo_id)) || !disponiveis.has(String(kit.inversor_id))) return false;
  }
  return true;
}

// Por que a seleção não tem kit: se sem o filtro de marca (ou de módulo) haveria
// kit, a culpa é do equipamento escolhido e o vendedor deve trocar a marca.
function pbMotivoSemKit(categoria, serve = () => true) {
  const f = _pbFornecimento;
  const base = (state.data || []).filter((k) => k.categoria === categoria && k.ativo !== false && Number(k.price) > 0);
  const haveriaSem = (campo) => {
    const salvo = f[campo];
    f[campo] = '';
    try { return base.some((k) => pbKitCompativel(k) && serve(k)); } finally { f[campo] = salvo; }
  };
  if (f.inversor && haveriaSem('inversor')) return `A marca ${f.inversor} não tem inversor compatível com a configuração atual. Troque a marca do inversor.`;
  if (f.modulo && haveriaSem('modulo')) return `O módulo ${f.modulo} não tem kit compatível com a configuração atual. Troque o módulo.`;
  return '';
}

function pbKitDistribuidoraNome(kit) {
  const id = kit?.distribuidora_id || _pbFornecimento.distribuidora;
  return id ? catalogoDistribuidora(id)?.nome || '' : '';
}

function pbFornecimentoReset() {
  _pbFornecimento = { distribuidora: '', modulo: '', inversor: '' };
}

function pbFornecimentoMount() {
  if (!document.getElementById('pb-fornecimento-panel')) {
    const panel = document.createElement('div');
    panel.id = 'pb-fornecimento-panel';
    panel.className = 'pbd-fornecimento';
    panel.innerHTML = `<div class="pbd-sec"><i data-lucide="boxes"></i> Equipamentos e distribuidora</div>
      <p id="pb-fornecimento-hint" class="pbd-hint"></p>
      <div class="pbd-fornecimento-fields">
        <label class="pbd-mes"><span>Módulo / painel</span><select id="pb-filtro-modulo" class="pbd-input v2-select" data-titulo="Módulo / painel" onchange="pbFornecimentoEscolher('modulo',this.value)"></select></label>
        <label class="pbd-mes"><span>Marca do inversor / microinversor</span><select id="pb-filtro-inversor" class="pbd-input v2-select" data-titulo="Marca do inversor / microinversor" onchange="pbFornecimentoEscolher('inversor',this.value)"></select></label>
        <label class="pbd-mes"><span>Distribuidora do kit</span><select id="pb-filtro-distribuidora" class="pbd-input v2-select" data-titulo="Distribuidora do kit" onchange="pbFornecimentoEscolher('distribuidora',this.value)"></select></label>
      </div><p id="pb-fornecimento-aviso" class="pbd-hint" aria-live="polite"></p>`;
    document.getElementById('pb-kit-fornecimento-slot')?.appendChild(panel);
  }
  pbFornecimentoRender();
  if (!_catalogoDistrib.carregado && !_catalogoDistrib.erro) carregarCatalogoDistribuidoras().then(() => {
    if (state.pbActiveClient) pbFornecimentoSync();
  });
  if (typeof carregarIntegracoesAtivas === 'function') carregarIntegracoesAtivas().then(() => {
    if (state.pbActiveClient && _pbFornecimento.distribuidora) pbFornecimentoSync();
  });
}

function pbFornecimentoRender() {
  const panel = document.getElementById('pb-fornecimento-panel');
  if (!panel) return;
  const slot = document.getElementById(state.pbPorta === 'dim' ? 'pbd-fornecimento-slot' : 'pb-kit-fornecimento-slot');
  if (slot && panel.parentElement !== slot) slot.appendChild(panel);
  panel.classList.toggle('hidden', state.pbProposalMode !== 'PROMOCIONAL');
  document.getElementById('pb-fornecimento-hint').textContent = state.pbPorta === 'dim'
    ? 'Escolha o módulo, a marca do inversor e a distribuidora. O consumo define a potência do sistema e o kit recomendado.'
    : 'Filtre os kits pelo módulo, pela marca do inversor e pela distribuidora.';
  const disponiveis = catalogoEquipamentosDaDistribuidora(_pbFornecimento.distribuidora);
  const integrada = typeof pbIntegracaoAtual === 'function' ? pbIntegracaoAtual() : null;
  // Só oferece módulo/marca que está em algum kit ativo do tipo escolhido
  // (inversor ou micro): escolher uma opção nunca deixa a lista vazia à toa.
  const kitsTipo = (state.data || []).filter((k) => k.categoria === state.pbCategory && k.ativo !== false && Number(k.price) > 0);
  const emKits = new Set(kitsTipo.flatMap((k) => [String(k.modulo_id), String(k.inversor_id)]));
  const usados = kitsTipo.length ? disponiveis.filter((e) => emKits.has(String(e.id))) : disponiveis;
  // Distribuidora integrada: os dois campos mostram o que ELA tem (buscado no servidor).
  const avisoIntegrada = integrada && typeof pbIntegracaoPreencherFiltros === 'function'
    ? pbIntegracaoPreencherFiltros(document.getElementById('pb-filtro-modulo'), document.getElementById('pb-filtro-inversor')) : '';
  if (!integrada) ['modulo', 'inversor'].forEach((tipo) => {
    const select = document.getElementById(`pb-filtro-${tipo}`);
    const opcoes = tipo === 'modulo' ? pbModulosEquipamentos(usados) : pbMarcasEquipamentos(usados, tipo);
    if (_pbFornecimento[tipo] && !opcoes.includes(_pbFornecimento[tipo])) _pbFornecimento[tipo] = '';
    select.innerHTML = '<option value="">Sem preferência</option>' + opcoes.map((opcao) =>
      `<option value="${escapeHTML(opcao)}">${escapeHTML(opcao)}</option>`).join('');
    select.value = _pbFornecimento[tipo];
    select.disabled = !_catalogoDistrib.carregado;
  });
  const dist = document.getElementById('pb-filtro-distribuidora');
  dist.innerHTML = '<option value="">Todas as distribuidoras</option>' + _catalogoDistrib.distribuidoras.filter((d) => d.ativo !== false)
    .map((d) => `<option value="${escapeHTML(d.id)}">${escapeHTML(d.nome)}</option>`).join('');
  dist.value = _pbFornecimento.distribuidora;
  dist.disabled = !_catalogoDistrib.carregado;
  const aviso = document.getElementById('pb-fornecimento-aviso');
  aviso.textContent = _catalogoDistrib.erro ? 'Não foi possível carregar as distribuidoras. Tente atualizar a página.'
    : !_catalogoDistrib.carregado ? 'Carregando catálogo...'
    : integrada ? avisoIntegrada
    : _pbFornecimento.distribuidora && !disponiveis.length ? 'Nenhum equipamento disponível nesta distribuidora.' : '';
  aviso.classList.toggle('hidden', !aviso.textContent);
  if (window.uiV2Select) window.uiV2Select.scan(panel);
}

function pbFornecimentoEscolher(campo, value) {
  if (!['distribuidora', 'modulo', 'inversor'].includes(campo)) return;
  if (typeof _orcamentoGerando !== 'undefined' && _orcamentoGerando) { pbFornecimentoRender(); return; }
  if (campo !== 'distribuidora' && typeof pbIntegracaoAtual === 'function' && pbIntegracaoAtual()) {
    pbIntegracaoEscolher(campo, value);
    return;
  }
  _pbFornecimento[campo] = campo === 'distribuidora' ? String(value || '') : pbMarcaEquipamento(value);
  if (campo === 'distribuidora') {
    // A mesma marca pode ter ofertas distintas nas duas fornecedoras; limpar
    // as preferências evita carregar o kit/preço da distribuidora anterior.
    _pbFornecimento.modulo = '';
    _pbFornecimento.inversor = '';
  }
  if (typeof orcamentoLimparKit === 'function') orcamentoLimparKit();
  pbFornecimentoSync();
}

function pbFornecimentoSync() {
  pbFornecimentoRender();
  if (state.pbProposalMode === 'PROMOCIONAL') {
    if (state.pbPorta === 'dim' && typeof _pbdRenderResultado === 'function') _pbdRenderResultado();
    else if (typeof renderModalProducts === 'function') renderModalProducts();
  }
  if (typeof orcamentoAtualizarResumo === 'function') orcamentoAtualizarResumo();
}

// ---------- catálogo administrativo: ofertas na edição do equipamento ----------
function catalogoOfertaRow(oferta = {}) {
  return `<div class="catalogo-oferta-row">
    <select class="pbd-input" data-oferta-dist aria-label="Distribuidora"><option value="">Escolha a distribuidora</option>${_catalogoDistrib.distribuidoras.map((d) => `<option value="${escapeHTML(d.id)}" ${String(d.id) === String(oferta.distribuidora_id) ? 'selected' : ''}>${escapeHTML(d.nome)}${d.ativo === false ? ' (inativa)' : ''}</option>`).join('')}</select>
    <input class="pbd-input" data-oferta-preco aria-label="Preço nesta distribuidora" type="number" min="0" step="0.01" placeholder="Preço (R$)" value="${oferta.preco_unitario ?? ''}">
    <label class="catalogo-oferta-ativo"><input type="checkbox" data-oferta-ativo ${oferta.ativo !== false ? 'checked' : ''}> Disponível</label>
    <button type="button" class="btn btn-ghost btn-icon" aria-label="Remover oferta" onclick="this.closest('.catalogo-oferta-row').remove()"><i data-lucide="x"></i></button>
  </div>`;
}

async function catalogoOfertasEquipamentoAbrir(id) {
  const host = document.getElementById('equip-ofertas-lista');
  if (!host) return;
  document.getElementById('equip-ofertas-section').dataset.pronto = '';
  host.innerHTML = '<p class="pbd-hint">Carregando ofertas...</p>';
  document.getElementById('equip-ofertas-add').disabled = true;
  await carregarCatalogoDistribuidoras(true);
  if (document.getElementById('equip-id')?.value !== String(id || '')) return;
  host.innerHTML = _catalogoDistrib.erro ? '<p class="pbd-hint">Não foi possível carregar as ofertas. Atualize a página antes de salvar.</p>'
    : _catalogoDistrib.ofertas.filter((o) => String(o.componente_id) === String(id)).map(catalogoOfertaRow).join('');
  document.getElementById('equip-ofertas-add').disabled = Boolean(_catalogoDistrib.erro);
  document.getElementById('equip-ofertas-section').dataset.pronto = _catalogoDistrib.erro ? '' : '1';
  if (window.lucide) lucide.createIcons();
}

function catalogoOfertaAdicionar() {
  const host = document.getElementById('equip-ofertas-lista');
  if (!host || !_catalogoDistrib.carregado) return;
  host.insertAdjacentHTML('beforeend', catalogoOfertaRow());
  if (window.lucide) lucide.createIcons();
}

function catalogoLerOfertasEquipamento() {
  if (document.getElementById('equip-ofertas-section')?.dataset.pronto !== '1') throw new Error('Aguarde carregar as ofertas antes de salvar.');
  const vistas = new Set();
  return Array.from(document.querySelectorAll('#equip-ofertas-lista .catalogo-oferta-row')).map((row) => {
    const distribuidora_id = row.querySelector('[data-oferta-dist]').value;
    const raw = row.querySelector('[data-oferta-preco]').value;
    const preco_unitario = Number(raw);
    if (!distribuidora_id || raw === '' || !Number.isFinite(preco_unitario) || preco_unitario < 0) throw new Error('Escolha a distribuidora e informe um preço válido em cada oferta.');
    if (vistas.has(distribuidora_id)) throw new Error('Cada distribuidora deve aparecer uma vez neste equipamento.');
    vistas.add(distribuidora_id);
    return { distribuidora_id, preco_unitario, ativo: row.querySelector('[data-oferta-ativo]').checked };
  });
}

async function catalogoCriarDistribuidora() {
  if (!state.isAdmin) return;
  const input = document.getElementById('equip-nova-distribuidora');
  const nome = input.value.trim();
  if (!nome) return showToast('Informe o nome da distribuidora.');
  const btn = document.getElementById('equip-distribuidora-add');
  if (btn.disabled) return;
  btn.disabled = true;
  try {
    const { data, error } = await supabaseClient.from('distribuidoras').insert([{ nome }]).select('id,nome,ativo').single();
    if (error) throw error;
    _catalogoDistrib.distribuidoras.push(data);
    // Atualiza as listas sem descartar os preços ainda não salvos.
    document.querySelectorAll('#equip-ofertas-lista [data-oferta-dist]').forEach((s) => {
      const option = document.createElement('option'); option.value = data.id; option.textContent = data.nome; s.appendChild(option);
    });
    input.value = '';
    showToast('DISTRIBUIDORA CADASTRADA');
  } catch (error) { showToast(error.code === '23505' ? 'Esta distribuidora já está cadastrada.' : `Erro ao cadastrar distribuidora: ${error.message}`); }
  finally { btn.disabled = false; }
}

// ---------- vínculo do kit (mesmo catálogo de módulos/inversores) ----------
async function catalogoKitAbrir(item) {
  const id = item?.id || '';
  const section = document.getElementById('kit-fornecimento-section');
  if (!section) return;
  section.dataset.pronto = '';
  section.dataset.modulo = item?.modulo_id || '';
  section.dataset.inversor = item?.inversor_id || '';
  document.getElementById('form-modulo-qtd').value = item?.modulo_qtd || '';
  document.getElementById('form-inversor-qtd').value = item?.inversor_qtd || '';
  await carregarCatalogoDistribuidoras();
  if (document.getElementById('form-id')?.value !== String(id)) return;
  const dist = document.getElementById('form-distribuidora');
  dist.innerHTML = '<option value="">Sem distribuidora vinculada</option>' + _catalogoDistrib.distribuidoras.map((d) => `<option value="${escapeHTML(d.id)}">${escapeHTML(d.nome)}${d.ativo === false ? ' (inativa)' : ''}</option>`).join('');
  dist.value = item?.distribuidora_id || '';
  catalogoKitEquipamentosSync(false);
  section.dataset.pronto = _catalogoDistrib.erro ? '' : '1';
}

function catalogoKitEquipamentosSync(limpar = true) {
  const section = document.getElementById('kit-fornecimento-section');
  const dist = document.getElementById('form-distribuidora').value;
  const lista = dist ? catalogoEquipamentosDaDistribuidora(dist) : _catalogoDistrib.equipamentos;
  ['modulo', 'inversor'].forEach((tipo) => {
    const select = document.getElementById(`form-${tipo}`);
    const atual = limpar ? '' : section.dataset[tipo];
    select.innerHTML = `<option value="">Escolha o ${tipo === 'modulo' ? 'módulo' : 'inversor'}</option>` + lista.filter((e) => e.tipo === tipo)
      .map((e) => `<option value="${escapeHTML(e.id)}">${escapeHTML(e.nome)}</option>`).join('');
    select.value = atual || '';
    select.disabled = !state.isAdmin;
  });
  if (limpar) { document.getElementById('form-modulo-qtd').value = ''; document.getElementById('form-inversor-qtd').value = ''; }
  ['form-distribuidora', 'form-modulo-qtd', 'form-inversor-qtd'].forEach((id) => { document.getElementById(id).disabled = !state.isAdmin; });
}

function catalogoKitLer() {
  if (document.getElementById('kit-fornecimento-section')?.dataset.pronto !== '1') throw new Error('Aguarde carregar o catálogo antes de salvar.');
  const distribuidora_id = document.getElementById('form-distribuidora').value || null;
  const modulo_id = document.getElementById('form-modulo').value || null;
  const inversor_id = document.getElementById('form-inversor').value || null;
  const modulo_qtd = Number(document.getElementById('form-modulo-qtd').value) || null;
  const inversor_qtd = Number(document.getElementById('form-inversor-qtd').value) || null;
  if ((modulo_id && (!Number.isInteger(modulo_qtd) || modulo_qtd <= 0)) || (inversor_id && (!Number.isInteger(inversor_qtd) || inversor_qtd <= 0))) throw new Error('Informe a quantidade de cada equipamento do kit.');
  if (distribuidora_id && (!modulo_id || !inversor_id || !catalogoDistribuidora(distribuidora_id)?.ativo)) throw new Error('Vincule uma distribuidora ativa, um módulo e um inversor disponíveis nela.');
  if (distribuidora_id) {
    const disponiveis = catalogoEquipamentosDaDistribuidora(distribuidora_id);
    if (!disponiveis.some((e) => e.tipo === 'modulo' && String(e.id) === modulo_id)
      || !disponiveis.some((e) => e.tipo === 'inversor' && String(e.id) === inversor_id)) throw new Error('Escolha equipamentos disponíveis nesta distribuidora.');
  }
  return { distribuidora_id, modulo_id, modulo_qtd, inversor_id, inversor_qtd };
}
