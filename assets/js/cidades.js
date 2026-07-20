// ==========================================
// CIDADES: municípios IBGE + coordenadas + HSP (NASA POWER)
// ==========================================
// Dataset estático: assets/data/municipios.min.json — array de arrays
// [nome, uf, codigo_ibge, latitude, longitude] com os 5.571 municípios.
// Carregado sob demanda (primeiro focus no campo de cidade), nunca no boot.
//
// HSP: NASA POWER climatology (gratuita, sem chave). Resultado cacheado na
// tabela cidades_hsp do Supabase — cada cidade custa 1 chamada, para sempre.

let _municipios = null;          // [{nome, uf, ibge, lat, lon, busca}]
let _municipiosPromise = null;
const _hspMemCache = {};         // ibge -> {hsp_anual, hsp_mensal}

function normalizeCityText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

async function loadMunicipios() {
  if (_municipios) return _municipios;
  if (_municipiosPromise) return _municipiosPromise;

  _municipiosPromise = fetch('assets/data/municipios.min.json')
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then((rows) => {
      _municipios = rows.map(([nome, uf, ibge, lat, lon]) => ({
        nome, uf, ibge, lat, lon,
        busca: normalizeCityText(nome),
      }));
      return _municipios;
    })
    .catch((error) => {
      console.warn('[cidades] Falha ao carregar dataset de municípios.', error);
      _municipiosPromise = null;
      return [];
    });

  return _municipiosPromise;
}

function searchMunicipios(query, limit = 8) {
  if (!_municipios) return [];
  const q = normalizeCityText(query);
  if (q.length < 2) return [];

  const starts = [];
  const contains = [];
  for (const mun of _municipios) {
    if (mun.busca.startsWith(q)) starts.push(mun);
    else if (mun.busca.includes(q)) contains.push(mun);
    if (starts.length >= limit) break;
  }
  return [...starts, ...contains].slice(0, limit);
}

// Interpreta texto livre tipo "ARAÇATUBA/SP", "Araçatuba - SP" ou "ARACATUBA".
// Retorna o município se o match for inequívoco; senão null.
function parseCidadeLivre(texto) {
  if (!_municipios) return null;
  const raw = String(texto || '').trim();
  if (!raw) return null;

  const m = raw.match(/^(.+?)\s*[\/\-–,]\s*([A-Za-z]{2})\s*$/);
  const nome = normalizeCityText(m ? m[1] : raw);
  const uf = m ? m[2].toUpperCase() : null;
  if (!nome) return null;

  const candidatos = _municipios.filter((mun) =>
    mun.busca === nome && (!uf || mun.uf === uf)
  );
  return candidatos.length === 1 ? candidatos[0] : null;
}

// Busca HSP da cidade: memória -> cache Supabase -> NASA POWER (e grava cache).
// Retorna {hsp_anual, hsp_mensal} ou null (nunca lança — HSP é enriquecimento).
async function getHspForCidade(mun) {
  if (!mun || !mun.ibge) return null;
  if (_hspMemCache[mun.ibge]) return _hspMemCache[mun.ibge];

  try {
    const { data } = await supabaseClient
      .from('cidades_hsp')
      .select('hsp_anual, hsp_mensal')
      .eq('ibge_code', mun.ibge)
      .maybeSingle();

    if (data && data.hsp_anual) {
      _hspMemCache[mun.ibge] = data;
      return data;
    }
  } catch (error) {
    console.warn('[cidades] Falha ao ler cache cidades_hsp.', error);
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const url = 'https://power.larc.nasa.gov/api/temporal/climatology/point'
      + '?parameters=ALLSKY_SFC_SW_DWN&community=RE'
      + `&latitude=${mun.lat}&longitude=${mun.lon}&format=JSON`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`NASA POWER HTTP ${res.status}`);

    const json = await res.json();
    const serie = json?.properties?.parameter?.ALLSKY_SFC_SW_DWN;
    const anual = Number(serie?.ANN);
    if (!serie || !Number.isFinite(anual) || anual <= 0) throw new Error('Resposta NASA sem ANN');

    const result = {
      hsp_anual: Math.round(anual * 100) / 100,
      hsp_mensal: serie,
    };
    _hspMemCache[mun.ibge] = result;

    // Grava no cache compartilhado (validação de faixa acontece na RPC).
    supabaseClient.rpc('upsert_cidade_hsp', {
      p_ibge: mun.ibge,
      p_nome: mun.nome,
      p_uf: mun.uf,
      p_lat: mun.lat,
      p_lon: mun.lon,
      p_hsp_anual: result.hsp_anual,
      p_hsp_mensal: serie,
    }).then(({ error }) => {
      if (error) console.warn('[cidades] upsert_cidade_hsp falhou.', error);
    });

    return result;
  } catch (error) {
    console.warn('[cidades] NASA POWER indisponível — HSP fica pendente.', error);
    return null;
  }
}

// Enriquecimento async do HSP de um cliente já salvo (não bloqueia nenhum fluxo).
async function enrichClienteHsp(clienteId, mun) {
  const hspData = await getHspForCidade(mun);
  if (!hspData || !clienteId) return null;

  const { error } = await supabaseClient
    .from('clientes')
    .update({ hsp: hspData.hsp_anual })
    .eq('id', clienteId);
  if (error) {
    console.warn('[cidades] Falha ao gravar HSP no cliente.', error);
    return null;
  }

  const cached = (state.clientes || []).find((c) => c.id === clienteId);
  if (cached) cached.hsp = hspData.hsp_anual;
  return hspData.hsp_anual;
}

// ==========================================
// FERRAMENTA ADMIN: enriquecer clientes legados (cidade → geo + HSP)
// ==========================================
// Itera os clientes carregados sem cidade_ibge, casa o texto livre da cidade
// com o dataset IBGE e grava geo + HSP. Roda uma vez para o backfill; é
// idempotente e inofensiva depois (só processa quem ainda não tem geo).
let _enriquecendoCidades = false;

async function adminEnriquecerCidades() {
  if (!state.isAdmin) { showToast('Apenas administradores.'); return; }
  if (_enriquecendoCidades) { showToast('Enriquecimento já em andamento...'); return; }

  await loadMunicipios();

  const pendentes = (state.clientes || []).filter(
    (c) => !c.cidade_ibge && String(c.cidade || '').trim()
  );
  if (pendentes.length === 0) {
    showToast('Todos os clientes com cidade já estão enriquecidos.');
    return;
  }

  _enriquecendoCidades = true;
  showToast(`Enriquecendo ${pendentes.length} cliente(s)...`);

  let ok = 0;
  const naoResolvidos = new Map(); // texto da cidade -> qtd

  try {
    for (const cliente of pendentes) {
      const mun = parseCidadeLivre(cliente.cidade);
      if (!mun) {
        const key = String(cliente.cidade).trim().toUpperCase();
        naoResolvidos.set(key, (naoResolvidos.get(key) || 0) + 1);
        continue;
      }

      const hspData = await getHspForCidade(mun); // cacheado: 1 chamada NASA por cidade
      const { error } = await supabaseClient
        .from('clientes')
        .update({
          cidade_ibge: mun.ibge,
          uf: mun.uf,
          latitude: mun.lat,
          longitude: mun.lon,
          hsp: hspData ? hspData.hsp_anual : null,
        })
        .eq('id', cliente.id);

      if (!error) {
        ok++;
        cliente.cidade_ibge = mun.ibge;
        cliente.uf = mun.uf;
        cliente.hsp = hspData ? hspData.hsp_anual : null;
        if (ok % 25 === 0) showToast(`Enriquecidos ${ok}/${pendentes.length}...`);
      }
    }
  } finally {
    _enriquecendoCidades = false;
  }

  if (naoResolvidos.size > 0) {
    const lista = [...naoResolvidos.entries()]
      .map(([cidade, qtd]) => `${cidade} (${qtd})`)
      .join(', ');
    console.warn('[cidades] Cidades não resolvidas no enriquecimento:', lista);
    showToast(`${ok} enriquecidos. ${naoResolvidos.size} cidade(s) não reconhecida(s) — corrija no cadastro (ex.: CIDADE/UF).`);
  } else {
    showToast(`${ok} cliente(s) enriquecidos com coordenadas e HSP!`);
  }

  renderContent();
}

// ==========================================
// AUTOCOMPLETE DE CIDADE (reutilizável: comercial e O&M)
// ==========================================
// attachCidadeAutocomplete(inputEl, onPick):
//  - carrega o dataset no primeiro focus
//  - dropdown com navegação por teclado (setas + Enter) e clique
//  - onPick(mun|null): mun quando o usuário escolhe da lista; null quando
//    edita o texto depois (invalida a seleção anterior).
function attachCidadeAutocomplete(inputEl, onPick) {
  if (!inputEl || inputEl._cidadeAutocomplete) return;
  inputEl._cidadeAutocomplete = true;
  inputEl.setAttribute('autocomplete', 'off');

  const wrapper = inputEl.parentElement;
  if (wrapper && getComputedStyle(wrapper).position === 'static') {
    wrapper.style.position = 'relative';
  }

  const dropdown = document.createElement('div');
  dropdown.className = 'cidade-autocomplete-dropdown hidden absolute left-0 right-0 z-[60] bg-black border border-neutral-700 shadow-[0_8px_30px_rgba(0,0,0,0.8)] max-h-56 overflow-y-auto';
  dropdown.style.top = 'calc(100% + 2px)';
  (wrapper || document.body).appendChild(dropdown);

  let results = [];
  let highlighted = -1;

  const hide = () => {
    dropdown.classList.add('hidden');
    dropdown.innerHTML = '';
    results = [];
    highlighted = -1;
  };

  const pick = (mun) => {
    inputEl.value = `${mun.nome.toUpperCase()}/${mun.uf}`;
    hide();
    if (typeof onPick === 'function') onPick(mun);
  };

  const renderDropdown = () => {
    if (results.length === 0) { hide(); return; }
    dropdown.innerHTML = results.map((mun, idx) => `
      <button type="button" data-idx="${idx}"
        class="cidade-ac-item w-full text-left px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide border-b border-neutral-900 last:border-b-0 transition-colors ${idx === highlighted ? 'bg-orange-600/20 text-orange-400' : 'text-neutral-300 hover:bg-neutral-900'}">
        ${escapeHTML(mun.nome.toUpperCase())} <span class="${idx === highlighted ? 'text-orange-500/70' : 'text-neutral-600'}">/${mun.uf}</span>
      </button>
    `).join('');
    dropdown.classList.remove('hidden');

    dropdown.querySelectorAll('.cidade-ac-item').forEach((btn) => {
      // mousedown (não click) para vencer o blur do input
      btn.addEventListener('mousedown', (event) => {
        event.preventDefault();
        pick(results[Number(btn.dataset.idx)]);
      });
    });
  };

  const update = async () => {
    await loadMunicipios();
    results = searchMunicipios(inputEl.value, 8);
    highlighted = results.length > 0 ? 0 : -1;
    renderDropdown();
  };

  inputEl.addEventListener('focus', () => {
    loadMunicipios();
    if (inputEl.value.length >= 2) update();
  });

  inputEl.addEventListener('input', () => {
    if (typeof onPick === 'function') onPick(null); // edição invalida seleção anterior
    update();
  });

  inputEl.addEventListener('keydown', (event) => {
    if (dropdown.classList.contains('hidden') || results.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      highlighted = (highlighted + 1) % results.length;
      renderDropdown();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      highlighted = (highlighted - 1 + results.length) % results.length;
      renderDropdown();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (highlighted >= 0) pick(results[highlighted]);
    } else if (event.key === 'Escape') {
      hide();
    }
  });

  inputEl.addEventListener('blur', () => {
    // pequeno delay para o mousedown do item disparar antes
    setTimeout(hide, 150);
  });
}
