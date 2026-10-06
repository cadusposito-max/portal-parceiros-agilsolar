// ==========================================
// ETIQUETAS DE CLIENTE
// ------------------------------------------
// Uma lista só para a empresa toda (tabela etiquetas). Qualquer usuário põe,
// tira e cria etiqueta na hora; nomes iguais ignorando caixa e acento viram a
// mesma (RPC etiqueta_criar). Só o admin renomeia, troca a cor ou apaga.
// Marcar PERDIDO pede ao menos uma etiqueta: é o "por que perdeu".
// Sem as tabelas no banco (migration não rodada), tudo some e o "Perdido"
// volta ao motivo antigo.
// ==========================================

const ETQ_CORES = ['blue', 'purple', 'teal', 'orange', 'pink', 'green', 'yellow', 'red', 'gray'];
const _etq = {
  ok: false,
  lista: [],          // [{id, nome, cor}]
  porCliente: {},     // cliente_id -> [etiqueta_id]
  filtro: null,       // etiqueta_id escolhida no filtro de Clientes/Funil
};

const etqNorm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
const etqById = (id) => _etq.lista.find((e) => e.id === id) || null;
function etqDoCliente(clienteId) {
  return (_etq.porCliente[clienteId] || []).map(etqById).filter(Boolean).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}
const etqTem = (clienteId, etqId) => (_etq.porCliente[clienteId] || []).includes(etqId);
function etqUso(etqId) {
  let n = 0;
  Object.values(_etq.porCliente).forEach((ids) => { if (ids.includes(etqId)) n++; });
  return n;
}

async function fetchEtiquetas() {
  try {
    const { data: lista, error } = await supabaseClient.from('etiquetas').select('id, nome, cor').order('nome');
    if (error) { _etq.ok = false; return; }
    // cliente_etiquetas pode passar das 1000 linhas do PostgREST: busca em páginas
    const mapa = {};
    for (let de = 0; ; de += 1000) {
      const { data, error: e2 } = await supabaseClient.from('cliente_etiquetas').select('cliente_id, etiqueta_id').range(de, de + 999);
      if (e2) { _etq.ok = false; return; }
      (data || []).forEach((r) => { (mapa[r.cliente_id] = mapa[r.cliente_id] || []).push(r.etiqueta_id); });
      if (!data || data.length < 1000) break;
    }
    _etq.lista = lista || [];
    _etq.porCliente = mapa;
    _etq.ok = true;
    if (_etq.filtro && !etqById(_etq.filtro)) _etq.filtro = null;
  } catch (err) {
    console.warn('[etiquetas] falha ao carregar', err);
    _etq.ok = false;
  }
}

// carrega junto com os clientes (mesmo ponto em que a lista é atualizada)
if (typeof fetchClientes === 'function') {
  const _fetchClientesOrig = fetchClientes;
  fetchClientes = async function () {
    const r = await _fetchClientesOrig.apply(this, arguments);
    await fetchEtiquetas();
    return r;
  };
}

// ---------- HTML pronto para as telas ----------
const etqEsc = (s) => (typeof escapeHTML === 'function' ? escapeHTML(String(s ?? '')) : String(s ?? ''));
const etqChip = (e, extra = '') => `<span class="v2-etq" data-c="${etqEsc(e.cor)}"${extra}>${etqEsc(e.nome)}</span>`;

// linha de etiquetas do card/lista (max = quantas mostrar antes do "+N")
function etqLinhaHTML(clienteId, max = 3) {
  if (!_etq.ok) return '';
  const tags = etqDoCliente(clienteId);
  if (!tags.length) return '';
  const vis = tags.slice(0, max);
  const resto = tags.length - vis.length;
  return `<span class="v2-etqline">${vis.map((e) => etqChip(e)).join('')}${resto > 0 ? `<span class="v2-etq mais" title="${etqEsc(tags.slice(max).map((e) => e.nome).join(', '))}">+${resto}</span>` : ''}</span>`;
}

// linha da ficha: etiquetas + botão para pôr/tirar
function etqFichaHTML(client) {
  if (!_etq.ok || !client) return '';
  const tags = etqDoCliente(client.id);
  return `<div class="v2f-etqs">${tags.map((e) => etqChip(e)).join('')}<button type="button" class="v2-etqadd" onclick="etqAbrir('${etqEsc(client.id)}')" title="Pôr ou tirar etiquetas"><i data-lucide="tag"></i>${tags.length ? 'Editar' : 'Etiqueta'}</button></div>`;
}

// filtro por etiqueta (Clientes e Funil)
function etqFiltroSelectHTML(source) {
  if (!_etq.ok || !_etq.lista.length) return '';
  const ids = new Set((source || []).map((c) => c.id));
  const cont = {};
  Object.entries(_etq.porCliente).forEach(([cid, tags]) => { if (ids.has(cid)) tags.forEach((t) => { cont[t] = (cont[t] || 0) + 1; }); });
  const usadas = _etq.lista.filter((e) => cont[e.id] || e.id === _etq.filtro);
  if (!usadas.length) return '';
  return `<select class="v2-select ${_etq.filtro ? 'on' : ''}" onchange="etqSetFiltro(this.value)" title="Filtrar por etiqueta"><option value="">Todas as etiquetas</option>${usadas.map((e) => `<option value="${e.id}" ${_etq.filtro === e.id ? 'selected' : ''}>${etqEsc(e.nome)} (${cont[e.id] || 0})</option>`).join('')}</select>`;
}
function etqAplicarFiltro(rows) {
  if (!_etq.ok || !_etq.filtro) return rows;
  return rows.filter((c) => etqTem(c.id, _etq.filtro));
}
function etqSetFiltro(id) {
  _etq.filtro = id || null;
  if (typeof resetClientesRenderLimit === 'function') resetClientesRenderLimit();
  renderContent();
}

// ---------- gravar ----------
function etqTimeline(client, descricao) {
  supabaseClient.from('crm_atividades').insert([{
    cliente_id: client.id,
    franquia_id: client.franquia_id,
    autor_email: state.currentUser?.email || 'sistema',
    tipo: 'etiqueta',
    descricao,
  }]).then(({ error }) => {
    if (error) { console.warn('[etiquetas] timeline', error); return; }
    if (typeof _crm360ClientId !== 'undefined' && _crm360ClientId === client.id && typeof crmFetchAtividades === 'function') crmFetchAtividades(client.id);
  });
}

async function etqPor(clienteId, etqId, { log = true } = {}) {
  if (etqTem(clienteId, etqId)) return true;
  const { error } = await supabaseClient.from('cliente_etiquetas').insert([{ cliente_id: clienteId, etiqueta_id: etqId }]);
  if (error && error.code !== '23505') { showToast('Não foi possível pôr a etiqueta: ' + error.message); return false; }
  (_etq.porCliente[clienteId] = _etq.porCliente[clienteId] || []).push(etqId);
  const client = (state.clientes || []).find((c) => c.id === clienteId);
  const e = etqById(etqId);
  if (log && client && e) etqTimeline(client, `Etiqueta adicionada: ${e.nome}`);
  return true;
}

async function etqTirar(clienteId, etqId) {
  const { error } = await supabaseClient.from('cliente_etiquetas').delete().eq('cliente_id', clienteId).eq('etiqueta_id', etqId);
  if (error) { showToast('Não foi possível tirar a etiqueta: ' + error.message); return false; }
  _etq.porCliente[clienteId] = (_etq.porCliente[clienteId] || []).filter((x) => x !== etqId);
  const client = (state.clientes || []).find((c) => c.id === clienteId);
  const e = etqById(etqId);
  if (client && e) etqTimeline(client, `Etiqueta removida: ${e.nome}`);
  return true;
}

async function etqCriar(nome) {
  // "indicação" vira "Indicação"; quem digitou com maiúsculas fica como digitou
  const t = String(nome || '').replace(/\s+/g, ' ').trim();
  const p = t === t.toLocaleLowerCase('pt-BR') ? t.charAt(0).toLocaleUpperCase('pt-BR') + t.slice(1) : t;
  const { data, error } = await supabaseClient.rpc('etiqueta_criar', { p_nome: p });
  if (error) { showToast('Não foi possível criar: ' + error.message); return null; }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || !row.id) return null;
  if (!etqById(row.id)) {
    _etq.lista.push({ id: row.id, nome: row.nome, cor: row.cor });
    _etq.lista.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }
  return etqById(row.id);
}

// usado pela higiene do funil (marca vários como perdido "sem retorno")
async function etqAplicarEmMassa(clienteIds, nome) {
  if (!_etq.ok || !clienteIds.length) return;
  const e = await etqCriar(nome);
  if (!e) return;
  const novos = clienteIds.filter((id) => !etqTem(id, e.id));
  if (!novos.length) return;
  const { error } = await supabaseClient.from('cliente_etiquetas').upsert(novos.map((id) => ({ cliente_id: id, etiqueta_id: e.id })), { onConflict: 'cliente_id,etiqueta_id', ignoreDuplicates: true });
  if (error) { console.warn('[etiquetas] em massa', error); return; }
  novos.forEach((id) => { (_etq.porCliente[id] = _etq.porCliente[id] || []).push(e.id); });
}

function etqRepintarTelas() {
  if (typeof renderContent === 'function') renderContent();
  if (typeof _crm360ClientId !== 'undefined' && _crm360ClientId && typeof renderCrm360 === 'function') renderCrm360();
}

// ---------- janela: pôr/tirar (modo 'editar') ou motivo da perda (modo 'perdido') ----------
const _etqDlg = { clienteId: null, modo: 'editar', q: '', sel: [], editando: null, apagando: null, ocupado: false, erro: '' };

function etqFechar() {
  const s = document.getElementById('v2-etq-scrim');
  if (s) s.remove();
  const mudou = _etqDlg.modo === 'editar' && _etqDlg.clienteId;
  _etqDlg.clienteId = null;
  if (mudou) etqRepintarTelas();
}

function etqAbrir(clienteId, modo = 'editar') {
  const client = (state.clientes || []).find((c) => c.id === clienteId);
  if (!client || !_etq.ok) return;
  const s0 = document.getElementById('v2-etq-scrim');
  if (s0) s0.remove();
  Object.assign(_etqDlg, { clienteId, modo, q: '', sel: [], editando: null, apagando: null, ocupado: false, erro: '' });
  const perdido = modo === 'perdido';
  const s = document.createElement('div');
  s.id = 'v2-etq-scrim';
  s.innerHTML = `<div class="v2-etqdlg ${perdido ? 'perdido' : ''}" role="dialog" aria-modal="true" aria-label="${perdido ? 'Marcar como perdido' : 'Etiquetas'}">
    <div class="v2-etqdlg-h"><div><h3>${perdido ? 'Marcar como perdido' : 'Etiquetas'}</h3><small>${etqEsc(client.nome || '')}</small></div><button class="v2-sq" onclick="etqFechar()" title="Fechar">${'<i data-lucide="x"></i>'}</button></div>
    ${perdido ? '<p class="v2-etqdlg-p">Por que perdeu? Escolha uma ou mais etiquetas — dá pra criar uma nova digitando.</p>' : ''}
    <label class="v2-etqbusca"><i data-lucide="search"></i><input id="v2-etq-q" class="v2-etq-inp" placeholder="Buscar ou criar etiqueta" autocomplete="off" maxlength="40"></label>
    <div class="v2-etqdlg-body" id="v2-etq-body"></div>
    ${perdido ? `<p class="v2-etqerr" id="v2-etq-err" hidden>Escolha pelo menos uma etiqueta.</p>
    <label class="v2-etqlbl" for="v2-etq-det">Detalhe (opcional)</label>
    <textarea id="v2-etq-det" rows="2" placeholder="Ex.: fechou com concorrente por R$ 2 mil a menos"></textarea>
    <div class="v2-etqdlg-acts"><button class="v2-btn2" onclick="etqFechar()">Cancelar</button><button class="v2-btnp perigo" id="v2-etq-ok" onclick="etqConfirmarPerda()"><i data-lucide="thumbs-down"></i>Confirmar perda</button></div>`
    : '<p class="v2-etqdlg-nota">Toque para pôr ou tirar. As etiquetas valem para a empresa toda.</p>'}
  </div>`;
  s.addEventListener('mousedown', (e) => { if (e.target === s) etqFechar(); });
  document.body.appendChild(s);
  const inp = document.getElementById('v2-etq-q');
  inp.addEventListener('input', () => { _etqDlg.q = inp.value; _etqDlg.apagando = null; etqPintar(); });
  inp.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const nq = etqNorm(_etqDlg.q);
    if (!nq) return;
    const exata = _etq.lista.find((x) => etqNorm(x.nome) === nq);
    if (exata) etqToggle(exata.id); else etqCriarDoCampo();
  });
  etqPintar();
  setTimeout(() => inp.focus(), 30);
}

function etqPintar() {
  const box = document.getElementById('v2-etq-body');
  if (!box) return;
  const cid = _etqDlg.clienteId;
  const perdido = _etqDlg.modo === 'perdido';
  const marcado = (id) => (perdido ? _etqDlg.sel.includes(id) : etqTem(cid, id));
  const nq = etqNorm(_etqDlg.q);
  const itens = _etq.lista.filter((e) => !nq || etqNorm(e.nome).includes(nq));
  const exata = nq && _etq.lista.some((e) => etqNorm(e.nome) === nq);
  const criar = nq && !exata
    ? `<button class="v2-etqrow criar" onclick="etqCriarDoCampo()" ${_etqDlg.ocupado ? 'disabled' : ''}><i data-lucide="plus"></i><span>Criar etiqueta “<b>${etqEsc(_etqDlg.q.trim())}</b>”</span></button>` : '';

  if (perdido) {
    // no modo perdido as etiquetas ficam como chips para marcar vários
    box.innerHTML = `${itens.length ? `<div class="v2-etqchips">${itens.map((e) => `<button type="button" class="v2-etq sel ${marcado(e.id) ? 'on' : ''}" data-c="${etqEsc(e.cor)}" onclick="etqToggle('${e.id}')" aria-pressed="${marcado(e.id)}">${marcado(e.id) ? '<i data-lucide="check"></i>' : ''}${etqEsc(e.nome)}</button>`).join('')}</div>` : ''}${criar}`
      || '<p class="v2-etqdlg-nota" style="text-align:center;padding:12px 0">Nenhuma etiqueta ainda. Digite para criar.</p>';
  } else {
    const admin = Boolean(state.isAdmin);
    box.innerHTML = itens.map((e) => {
      if (admin && _etqDlg.editando === e.id) {
        return `<div class="v2-etqrow ed">
          <input id="v2-etq-ren" class="v2-etq-inp v2-etq-ren" value="${etqEsc(e.nome)}" maxlength="40" onkeydown="if(event.key==='Enter')etqSalvarEdicao('${e.id}');if(event.key==='Escape'){event.stopPropagation();etqEditar(null)}">
          <span class="v2-etqcores">${ETQ_CORES.map((c) => `<button type="button" class="v2-etqcor ${c === e.cor ? 'on' : ''}" data-c="${c}" onclick="etqEscolherCor(this)" title="${c}"></button>`).join('')}</span>
          <span class="v2-etqrow-acts"><button class="v2-btn2" onclick="etqEditar(null)">Cancelar</button><button class="v2-btnp" onclick="etqSalvarEdicao('${e.id}')">Salvar</button></span>
        </div>`;
      }
      if (admin && _etqDlg.apagando === e.id) {
        const n = etqUso(e.id);
        return `<div class="v2-etqrow ed apagar"><span>Apagar ${etqChip(e)}? ${n ? `Sai de ${n} cliente${n > 1 ? 's' : ''}.` : 'Nenhum cliente usa.'}</span>
          <span class="v2-etqrow-acts"><button class="v2-btn2" onclick="etqPedirApagar(null)">Cancelar</button><button class="v2-btnp perigo" onclick="etqApagar('${e.id}')">Apagar</button></span></div>`;
      }
      const on = marcado(e.id);
      return `<div class="v2-etqrow ${on ? 'on' : ''}">
        <button type="button" class="v2-etqrow-main" onclick="etqToggle('${e.id}')" aria-pressed="${on}" ${_etqDlg.ocupado ? 'disabled' : ''}>
          <i class="v2-etqbox">${on ? '<i data-lucide="check"></i>' : ''}</i>${etqChip(e)}<small>${etqUso(e.id) || ''}</small></button>
        ${admin ? `<button class="v2-sq mini" onclick="etqEditar('${e.id}')" title="Renomear / cor"><i data-lucide="pencil"></i></button><button class="v2-sq mini" onclick="etqPedirApagar('${e.id}')" title="Apagar etiqueta"><i data-lucide="trash-2"></i></button>` : ''}
      </div>`;
    }).join('') + criar || '<p class="v2-etqdlg-nota" style="text-align:center;padding:12px 0">Nenhuma etiqueta ainda. Digite para criar.</p>';
  }
  if (window.lucide) window.lucide.createIcons();
  const ren = document.getElementById('v2-etq-ren');
  if (ren && document.activeElement !== ren) { ren.focus(); ren.select(); }
}

async function etqToggle(etqId) {
  if (_etqDlg.ocupado) return;
  if (_etqDlg.modo === 'perdido') {
    _etqDlg.sel = _etqDlg.sel.includes(etqId) ? _etqDlg.sel.filter((x) => x !== etqId) : [..._etqDlg.sel, etqId];
    const err = document.getElementById('v2-etq-err');
    if (err) err.hidden = true;
    etqLimparBusca();
    return;
  }
  _etqDlg.ocupado = true; etqPintar();
  const cid = _etqDlg.clienteId;
  if (etqTem(cid, etqId)) await etqTirar(cid, etqId); else await etqPor(cid, etqId);
  _etqDlg.ocupado = false;
  etqLimparBusca();
}

function etqLimparBusca() {
  const inp = document.getElementById('v2-etq-q');
  if (inp && _etqDlg.q) { inp.value = ''; _etqDlg.q = ''; }
  etqPintar();
}

async function etqCriarDoCampo() {
  const nome = _etqDlg.q.trim();
  if (!nome || _etqDlg.ocupado) return;
  _etqDlg.ocupado = true; etqPintar();
  const e = await etqCriar(nome);
  _etqDlg.ocupado = false;
  if (!e) { etqPintar(); return; }
  if (_etqDlg.modo === 'perdido') { if (!_etqDlg.sel.includes(e.id)) _etqDlg.sel.push(e.id); }
  else await etqPor(_etqDlg.clienteId, e.id);
  etqLimparBusca();
}

// ---------- admin: renomear, cor, apagar ----------
function etqEditar(id) { _etqDlg.editando = id; _etqDlg.apagando = null; etqPintar(); }
function etqPedirApagar(id) { _etqDlg.apagando = id; _etqDlg.editando = null; etqPintar(); }
function etqEscolherCor(btn) {
  btn.parentElement.querySelectorAll('.v2-etqcor').forEach((b) => b.classList.toggle('on', b === btn));
}
async function etqSalvarEdicao(id) {
  if (!state.isAdmin) return;
  const e = etqById(id);
  const inp = document.getElementById('v2-etq-ren');
  const corBtn = document.querySelector('.v2-etqrow.ed .v2-etqcor.on');
  if (!e || !inp) return;
  const nome = inp.value.replace(/\s+/g, ' ').trim();
  const cor = corBtn ? corBtn.dataset.c : e.cor;
  if (!nome) { inp.focus(); return; }
  const outra = _etq.lista.find((x) => x.id !== id && etqNorm(x.nome) === etqNorm(nome));
  if (outra) { showToast(`Já existe a etiqueta "${outra.nome}".`); inp.focus(); return; }
  const { error } = await supabaseClient.from('etiquetas').update({ nome, cor }).eq('id', id);
  if (error) { showToast('Não foi possível salvar: ' + error.message); return; }
  Object.assign(e, { nome, cor });
  _etq.lista.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  _etqDlg.editando = null;
  etqPintar();
  etqRepintarTelas();
}
async function etqApagar(id) {
  if (!state.isAdmin) return;
  const { error } = await supabaseClient.from('etiquetas').delete().eq('id', id);
  if (error) { showToast('Não foi possível apagar: ' + error.message); return; }
  _etq.lista = _etq.lista.filter((x) => x.id !== id);
  Object.keys(_etq.porCliente).forEach((cid) => { _etq.porCliente[cid] = _etq.porCliente[cid].filter((x) => x !== id); });
  if (_etq.filtro === id) _etq.filtro = null;
  _etqDlg.apagando = null;
  etqPintar();
  etqRepintarTelas();
}

// ---------- marcar perdido ----------
async function etqConfirmarPerda() {
  const cid = _etqDlg.clienteId;
  if (!cid || _etqDlg.ocupado) return;
  if (!_etqDlg.sel.length) {
    const err = document.getElementById('v2-etq-err');
    if (err) err.hidden = false;
    return;
  }
  _etqDlg.ocupado = true;
  const btn = document.getElementById('v2-etq-ok');
  if (btn) btn.disabled = true;
  for (const id of _etqDlg.sel) {
    // a timeline já registra a perda com o motivo; não precisa de uma linha por etiqueta
    const ok = await etqPor(cid, id, { log: false });
    if (!ok) { _etqDlg.ocupado = false; if (btn) btn.disabled = false; return; }
  }
  const nomes = _etqDlg.sel.map(etqById).filter(Boolean).map((e) => e.nome);
  const det = (document.getElementById('v2-etq-det') || {}).value?.trim() || '';
  const motivo = nomes.join(', ') + (det ? ` — ${det}` : '');
  etqFechar(); // modo perdido: quem repinta é o crmSetClientStatus
  crmSetClientStatus(cid, 'PERDIDO', motivo);
}

// "Perdido" passa a pedir etiquetas (sem as tabelas, fica o motivo antigo)
if (typeof openMotivoPerdaModal === 'function') {
  const _motivoPerdaAntigo = openMotivoPerdaModal;
  openMotivoPerdaModal = function (clientId) {
    if (!_etq.ok) return _motivoPerdaAntigo.apply(this, arguments);
    etqAbrir(clientId, 'perdido');
  };
}

if (typeof CRM_ATIVIDADE_META !== 'undefined') CRM_ATIVIDADE_META.etiqueta = { icon: 'tag', label: 'Etiqueta', color: 'text-orange-400' };

document.addEventListener('keydown', (e) => {
  // a ficha também fecha no Esc: aqui só fecha a janela de etiquetas
  if (e.key === 'Escape' && document.getElementById('v2-etq-scrim')) { e.stopImmediatePropagation(); etqFechar(); }
}, true);
