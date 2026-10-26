// ==========================================
// NOVA PROPOSTA — TELA DO ORÇAMENTO
// ==========================================
// Reaproveita o construtor existente, movendo seu painel (e seus listeners).
// Cadastro/busca continuam no popup; a ficha fica como atalho de consulta.
//
// Layout: topo com o cliente e o seletor único (Promocionais · Catálogo
// completo · Personalizada); à esquerda o construtor (consumo ou lista de
// kits); à direita uma coluna de tamanho fixo com o kit da vez, o Gerar e o
// ajuste de um módulo a menos/a mais. No celular a coluna desce e o Gerar fica
// no rodapé. A Personalizada usa a tela inteira e o rodapé, como antes.
let _orcamentoClientId = null;
let _orcamentoKitId = null;
let _orcamentoOrigemFicha = null;
let _orcamentoOrigemPicker = null;
let _orcamentoGerando = false;

function orcamentoAberto() {
  return Boolean(_orcamentoClientId);
}

function orcamentoSnapshot() {
  return { id: _orcamentoClientId, ficha: _orcamentoOrigemFicha, picker: _orcamentoOrigemPicker };
}

function orcamentoRestaurar(saved) {
  if (!saved?.id) return;
  openOrcamento(saved.id, saved.picker);
  if (orcamentoAberto()) _orcamentoOrigemFicha = saved.ficha || null;
}

function _orcamentoEstacionar() {
  const panel = document.getElementById('pb-embedded-panel');
  const parking = document.getElementById('pb-parking');
  if (panel && parking && panel.parentElement !== parking) parking.appendChild(panel);
}

function openOrcamento(clientId, pickerTab = null) {
  const client = (state.clientes || []).find((c) => c.id === clientId);
  if (!client || !canOperateClientProposalFlow(client)) return;
  if (_orcamentoGerando) return;
  if (!orcamentoAberto()) {
    _orcamentoOrigemPicker = ['novo', 'existente'].includes(pickerTab) ? pickerTab : null;
    _orcamentoOrigemFicha = !_orcamentoOrigemPicker && typeof _crm360ClientId !== 'undefined' && _crm360ClientId
      ? { id: _crm360ClientId, tab: _crm360Tab }
      : null;
  }
  if (typeof closeCrm360 === 'function') closeCrm360();
  if (_orcamentoClientId !== clientId) _orcamentoKitId = null;
  _orcamentoClientId = clientId;
  renderContent();
  window.scrollTo({ top: 0 });
  orcamentoAtualizarCatalogo();
}

// Kits e catálogo (equipamentos/distribuidoras) mudam pelo admin a qualquer
// hora: recarrega ao abrir o orçamento e ao voltar para a aba, para os filtros
// nunca oferecerem equipamento desativado (sem precisar de F5).
let _orcamentoCatalogoEm = 0;
async function orcamentoAtualizarCatalogo() {
  _orcamentoCatalogoEm = Date.now();
  try {
    await Promise.all([
      typeof fetchProducts === 'function' ? fetchProducts() : null,
      typeof carregarCatalogoDistribuidoras === 'function' ? carregarCatalogoDistribuidoras(true) : null,
    ]);
  } catch (err) {
    console.warn('[orçamento] Falha ao atualizar kits/catálogo.', err);
  }
  if (orcamentoAberto() && typeof pbFornecimentoSync === 'function') pbFornecimentoSync();
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && orcamentoAberto() && Date.now() - _orcamentoCatalogoEm > 15000) {
    orcamentoAtualizarCatalogo();
  }
});

function closeOrcamento(render = true) {
  _orcamentoEstacionar();
  if (typeof closeProposalSharePanel === 'function') closeProposalSharePanel();
  _orcamentoClientId = null;
  _orcamentoKitId = null;
  _orcamentoOrigemFicha = null;
  _orcamentoOrigemPicker = null;
  document.body.classList.remove('orcamento-aberto');
  if (render) renderContent();
}

function orcamentoVoltar() {
  const ficha = _orcamentoOrigemFicha;
  const picker = _orcamentoOrigemPicker;
  closeOrcamento();
  if (ficha) openCrm360(ficha.id, ficha.tab);
  else if (picker) openNovaPropostaPicker(picker);
}

function orcamentoVerFicha() {
  const id = _orcamentoClientId;
  if (!id) return;
  closeOrcamento();
  openCrm360(id, 'propostas');
}

// Seletor do topo: as duas linhas de kits + a Personalizada (admin e gestor).
function _orcamentoLinhasHTML() {
  const opcoes = [
    ['promocional', 'tag', 'Promocionais'],
    ['catalogo', 'layout-grid', 'Catálogo completo'],
    ...(canUsePersonalizada() ? [['personalizada', 'lock', 'Personalizada']] : []),
  ];
  return `<div id="orcamento-linha" class="orcamento-linha" role="group" aria-label="Tipo de orçamento">${opcoes.map(([v, ic, t]) =>
    `<button type="button" data-orc-linha="${v}" onclick="orcamentoEscolherLinha('${v}')"><i data-lucide="${ic}"></i><span>${t}</span></button>`).join('')}</div>`;
}

function _orcamentoLinhaAtual() {
  if (state.pbProposalMode === PB_PROPOSAL_MODES.PERSONALIZADA) return 'personalizada';
  return typeof pbLinhaAtual === 'function' ? pbLinhaAtual() : 'promocional';
}

function orcamentoEscolherLinha(v) {
  if (_orcamentoGerando || v === _orcamentoLinhaAtual()) return;
  if (v === 'personalizada') {
    setPBProposalMode(PB_PROPOSAL_MODES.PERSONALIZADA);
    return;
  }
  if (state.pbProposalMode !== PB_PROPOSAL_MODES.PROMOCIONAL) setPBProposalMode(PB_PROPOSAL_MODES.PROMOCIONAL);
  if (typeof pbLinhaEscolher === 'function') pbLinhaEscolher(v);
  orcamentoAtualizarResumo();
}

function renderOrcamento() {
  const client = (state.clientes || []).find((c) => c.id === _orcamentoClientId);
  if (!client || !canOperateClientProposalFlow(client)) { closeOrcamento(); return; }
  const container = document.getElementById('main-container');
  if (!container) return;
  _orcamentoEstacionar(); // antes de innerHTML: preserva busca, consumo e formulário
  document.body.classList.add('orcamento-aberto');
  ['main-toolbar', 'view-toggle-container', 'admin-bar', 'empty-state'].forEach((id) => {
    document.getElementById(id)?.classList.add('hidden');
  });
  window.uiV2PageMeta = { key: `${state.environment}:${typeof getActiveTabId === 'function' ? getActiveTabId() : state.activeTab}`, title: 'Orçamento', sub: client.nome || '' };
  const hsp = Number(client.hsp) > 0 ? `HSP ${Number(client.hsp).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}` : '';
  const info = [client.cidade, hsp, client.telefone].filter(Boolean).map(escapeHTML).join(' · ');
  container.innerHTML = `
    <section class="orcamento-tela" aria-label="Orçamento do cliente">
      <header class="orcamento-header">
        <button type="button" class="btn btn-secondary" onclick="orcamentoVoltar()"><i data-lucide="arrow-left"></i> Voltar</button>
        <div class="orcamento-cliente"><h1>Orçamento · ${escapeHTML(client.nome || '')}</h1><p>${info}</p></div>
        ${_orcamentoLinhasHTML()}
      </header>
      <div class="orcamento-corpo">
        <div id="orcamento-builder-slot"></div>
        <aside id="orcamento-lado" class="orcamento-lado" aria-label="Kit do orçamento" aria-live="polite"></aside>
      </div>
      <footer class="orcamento-footer">
        <div class="orcamento-resumo" aria-live="polite"><small id="orcamento-selecao-label">Selecionado</small><strong id="orcamento-selecao">Escolha um kit para continuar</strong></div>
        <button type="button" id="orcamento-gerar" class="btn btn-primary" onclick="orcamentoGerar(event)" disabled><i data-lucide="file-text"></i> Gerar proposta</button>
      </footer>
    </section>`;
  const panel = document.getElementById('pb-embedded-panel');
  const slot = document.getElementById('orcamento-builder-slot');
  if (panel && slot) slot.appendChild(panel);

  if (panel && !panel.dataset.orcamentoBound) {
    panel.dataset.orcamentoBound = '1';
    panel.addEventListener('click', (e) => {
      if (!orcamentoAberto() || e.target.closest('button, input, select, a')) return;
      const card = e.target.closest('[data-orcamento-kit]');
      if (card) orcamentoSelecionarKit(card.dataset.orcamentoKit);
    });
    // Linhas da lista são role="button": Enter/espaço escolhem o kit.
    panel.addEventListener('keydown', (e) => {
      if (!orcamentoAberto() || (e.key !== 'Enter' && e.key !== ' ')) return;
      const card = e.target.closest('[data-orcamento-kit][role="button"]');
      if (!card || card !== e.target) return;
      e.preventDefault();
      orcamentoSelecionarKit(card.dataset.orcamentoKit);
    });
  }
  pbEmbedSetup(client);
  orcamentoAtualizarResumo();
  if (window.uiV2Shell) window.uiV2Shell.refresh();
  if (window.lucide) window.lucide.createIcons();
}

function orcamentoSelecionarKit(kitId) {
  if (_orcamentoGerando) return;
  const kit = _orcamentoAcharKit(kitId);
  if (!kit) return;
  _orcamentoKitId = String(kit.id);
  orcamentoAtualizarResumo();
}

// Kit da tabela (ativo e compatível com a seleção) ou kit cotado na distribuidora.
function _orcamentoAcharKit(id) {
  if (!id) return null;
  if (String(id).startsWith('cot:')) return typeof pbAcharKit === 'function' ? pbAcharKit(id) : null;
  const kit = (typeof pbKitsOrcamento === 'function' ? pbKitsOrcamento() : (state.data || [])).find((k) => String(k.id) === String(id) && k.ativo !== false);
  return kit && (typeof pbKitCompativel !== 'function' || pbKitCompativel(kit)) ? kit : null;
}

function _orcamentoResumoDim() {
  return typeof pbDimResumo === 'function' ? pbDimResumo() : null;
}

// Kit da vez: o que o vendedor escolheu ou, sem escolha, o recomendado pelo consumo.
function _orcamentoKitAtual(r = _orcamentoResumoDim()) {
  if (typeof hibridoAtivo === 'function' && hibridoAtivo()) return hibridoKit();
  if (typeof kitMontadoAtivo === 'function' && kitMontadoAtivo()) return kitMontadoKit();
  // Distribuidora integrada: sem escolha, vale a opção de menor preço da cotação (como no híbrido).
  if (_orcamentoIntegrada()) return _orcamentoAcharKit(_orcamentoKitId) || pbIntegracaoKitsDaVez()[0] || null;
  return _orcamentoAcharKit(_orcamentoKitId) || (r?.recomendado ? _orcamentoAcharKit(r.recomendado.id) : null);
}

function _orcamentoIntegrada() {
  return typeof pbIntegracaoAtual === 'function' && Boolean(pbIntegracaoAtual()) && state.pbProposalMode === PB_PROPOSAL_MODES.PROMOCIONAL;
}

function orcamentoLimparKit() {
  _orcamentoKitId = null;
  orcamentoAtualizarResumo();
}

function orcamentoVerLista() {
  if (typeof pbSetPorta === 'function') pbSetPorta('kit');
  document.getElementById('orcamento-builder-slot')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function orcamentoAtualizarResumo() {
  if (!orcamentoAberto()) return;
  const personalizada = state.pbProposalMode === PB_PROPOSAL_MODES.PERSONALIZADA;
  const linha = _orcamentoLinhaAtual();
  document.querySelectorAll('#orcamento-linha [data-orc-linha]').forEach((b) => {
    const on = b.dataset.orcLinha === linha;
    b.classList.toggle('is-on', on);
    b.setAttribute('aria-pressed', String(on));
    b.disabled = _orcamentoGerando && !on;
  });
  document.querySelector('.orcamento-tela')?.classList.toggle('is-personalizada', personalizada);

  const r = personalizada ? null : _orcamentoResumoDim();
  const kit = personalizada ? null : _orcamentoKitAtual(r);
  let texto = 'Escolha um kit para continuar';
  let valido = Boolean(kit);
  if (personalizada) {
    const draft = _pbDraft();
    const tot = calcularTotaisPersonalizada(draft);
    const pendencia = pbPersonalizadaPendencia(draft, tot);
    valido = canUsePersonalizada() && !pendencia;
    texto = pendencia || `${String(draft.descricao || '').trim() || _pbNomeSugerido(_pbPotenciaEfetiva(draft, tot))} · ${formatCurrency(tot.total)}`;
  } else if (kit) {
    const dist = typeof pbKitDistribuidoraNome === 'function' ? pbKitDistribuidoraNome(kit) : '';
    texto = `${kit.name}${dist ? ' · ' + dist : ''} · ${formatCurrency(kit.price)}`;
  }
  const label = document.getElementById('orcamento-selecao-label');
  const resumo = document.getElementById('orcamento-selecao');
  const btn = document.getElementById('orcamento-gerar');
  if (label) label.textContent = personalizada ? 'Personalizada' : (kit && r?.recomendado && String(r.recomendado.id) === String(kit.id) && !_orcamentoKitId ? 'Recomendado' : 'Selecionado');
  if (resumo) resumo.textContent = texto;
  if (btn) btn.disabled = !valido || _orcamentoGerando;

  const atualId = kit ? String(kit.id) : null;
  document.querySelectorAll('#orcamento-builder-slot [data-orcamento-kit]').forEach((card) => {
    const on = !personalizada && card.dataset.orcamentoKit === atualId;
    card.classList.toggle('orcamento-kit-selecionado', on);
    if (card.getAttribute('role') === 'button') card.setAttribute('aria-pressed', String(on));
    const b = card.querySelector('button[data-kit-id]');
    if (b) {
      b.setAttribute('aria-pressed', String(on));
      b.setAttribute('aria-label', on ? 'Kit selecionado' : 'Selecionar kit');
      b.lastChild.textContent = on ? ' Selecionado' : ' Selecionar kit';
    }
  });

  const lado = document.getElementById('orcamento-lado');
  if (lado) {
    lado.innerHTML = personalizada ? '' : _orcamentoLadoHTML(r, kit);
    if (window.lucide) window.lucide.createIcons();
  }
}

// ---------- coluna da direita ----------

const _orcInt = (v) => Math.round(Number(v) || 0).toLocaleString('pt-BR');
const _orcKwp = (v) => (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function _orcamentoGeracao(kit) {
  if (typeof pbDimGeracao === 'function') return pbDimGeracao(kit);
  return calcularGeracaoEstimada(Number(kit.power) || 0, kit.categoria, Number(state.pbActiveClient?.hsp) || undefined) || 0;
}

// Kits vizinhos do mesmo conjunto (mesma marca e mesmo módulo): um a menos e
// um a mais na potência. Na porta "Pelo consumo" respeita a ligação escolhida.
function _orcamentoVizinhos(kit) {
  if (!kit || kit._montado || String(kit.id).startsWith('cot:')) return { menor: null, maior: null };
  const porConsumo = state.pbPorta === 'dim' && typeof _pbdServeLigacao === 'function' && typeof _pbd !== 'undefined' && _pbd;
  const mesmos = (typeof pbKitsOrcamento === 'function' ? pbKitsOrcamento() : (state.data || [])).filter((k) => k.categoria === kit.categoria && k.ativo !== false && Number(k.price) > 0
    && String(k.brand || '') === String(kit.brand || '')
    && (!kit.modulo_id || String(k.modulo_id || '') === String(kit.modulo_id))
    && (typeof pbKitCompativel !== 'function' || pbKitCompativel(k))
    && (!porConsumo || _pbdServeLigacao(k)));
  const p = Number(kit.power) || 0;
  const porPreco = (a, b) => Number(a.price) - Number(b.price);
  const menor = mesmos.filter((k) => Number(k.power) < p).sort((a, b) => (Number(b.power) - Number(a.power)) || porPreco(a, b))[0] || null;
  const maior = mesmos.filter((k) => Number(k.power) > p).sort((a, b) => (Number(a.power) - Number(b.power)) || porPreco(a, b))[0] || null;
  return { menor, maior };
}

function _orcamentoAjusteHTML(kit, r) {
  const { menor, maior } = _orcamentoVizinhos(kit);
  if (!menor && !maior) return '';
  const qtd = (k) => Number(k?.modulo_qtd) || 0;
  const botao = (k, sinal) => {
    if (!k) return `<button type="button" class="orc-aj-btn" disabled><b>${sinal === '-' ? 'Menor' : 'Maior'}</b><span>não tem</span></button>`;
    const dif = Math.abs(qtd(k) - qtd(kit));
    const titulo = qtd(k) && qtd(kit) && dif
      ? `${sinal === '-' ? '−' : '+'} ${dif} ${dif === 1 ? 'módulo' : 'módulos'}`
      : `${sinal === '-' ? 'Menor' : 'Maior'} · ${_orcKwp(k.power)} kWp`;
    const pct = typeof pbDimCobertura === 'function' ? pbDimCobertura(k, r) : null;
    return `<button type="button" class="orc-aj-btn" data-kit="${escapeHTML(String(k.id))}" onclick="orcamentoSelecionarKit(this.dataset.kit)">
      <b>${titulo}</b><span>${_orcInt(_orcamentoGeracao(k))} kWh/mês${pct != null ? ` · cobre ${pct}%` : ''}</span></button>`;
  };
  return `<div class="orc-sec">Ajustar</div><div class="orc-aj">${botao(menor, '-')}${botao(maior, '+')}</div>`;
}

function _orcamentoKitCardHTML(kit, r, nota) {
  const cotado = String(kit.id).startsWith('cot:');
  const g = cotado ? 0 : _orcamentoGeracao(kit);
  const pct = !cotado && typeof pbDimCobertura === 'function' ? pbDimCobertura(kit, r) : null;
  const dist = typeof pbKitDistribuidoraNome === 'function' ? pbKitDistribuidoraNome(kit) : '';
  const temDe = Number(kit.list_price) > Number(kit.price);
  const detalhes = [`${_orcKwp(kit.power)} kWp`, g ? `~${_orcInt(g)} kWh/mês` : '', pct != null ? `cobre ${pct}% do consumo` : ''].filter(Boolean).join(' · ');
  return `<div class="orc-kit">
    <div class="orc-kit-n">${escapeHTML(kit.name || '')}</div>
    <div class="orc-kit-d">${detalhes}</div>
    ${dist ? `<div class="orc-kit-d">Distribuidora: ${escapeHTML(dist)}${cotado ? ' · frete incluso' : ''}</div>` : ''}
    ${kit._estrutura_id && typeof pbEstruturaNome === 'function' ? `<div class="orc-kit-d">Estrutura: ${escapeHTML(pbEstruturaNome(kit._estrutura_id))}</div>` : ''}
    ${kit._estruturaNome ? `<div class="orc-kit-d">Telhado: ${escapeHTML(kit._estruturaNome)}</div>` : ''}
    ${nota ? `<div class="orc-kit-nota">${escapeHTML(nota)}</div>` : ''}
    <div class="orc-kit-preco">${temDe ? `<s>${formatCurrency(kit.list_price)}</s>` : ''}<b>${formatCurrency(kit.price)}</b></div>
  </div>`;
}

function _orcamentoLadoHTML(r, kit) {
  if (typeof hibridoAtivo === 'function' && hibridoAtivo()) return hibridoLadoHTML(kit);
  const dim = state.pbPorta === 'dim';
  let html = '';
  if (r) {
    const mediaRot = r.porMes ? `Média (${r.preenchidos} ${r.preenchidos === 1 ? 'mês' : 'meses'})` : 'Média informada';
    html += `<div class="orc-mets">
      <div class="orc-met"><small>${mediaRot}</small><b>${_orcInt(r.media)} kWh</b></div>
      <div class="orc-met"><small>Sistema necessário</small><b>${r.alvo > 0 ? _orcKwp(r.kwpNecessario) + ' kWp' : '—'}</b></div>
    </div>
    <p class="orc-met-s">Compensa ${_orcInt(r.alvo)} kWh (média − ${r.taxa} kWh da taxa mínima) · HSP ${String(r.hsp).replace('.', ',')}</p>`;
    if (r.motivo) html += `<div class="orc-aviso">${escapeHTML(r.motivo)}</div>`;
  }

  const montado = typeof kitMontadoAtivo === 'function' && kitMontadoAtivo();
  if (montado && !kit) {
    html += kitMontadoLadoVazioHTML();
  } else if (montado) {
    html += `<div class="orc-sec"><i data-lucide="package"></i> Kit montado</div>${_orcamentoKitCardHTML(kit, r, '')}`;
  } else if (_orcamentoIntegrada()) {
    html += pbIntegracaoLadoHTML(kit);
  } else if (!kit) {
    const vazio = dim
      ? (r ? 'Nenhum kit para mostrar com essa seleção.' : 'Preencha o consumo e o kit recomendado aparece aqui.')
      : 'Clique num kit da lista para escolher.';
    html += `<div class="orc-sec"><i data-lucide="sparkles"></i> Kit</div><div class="orc-vazio">${vazio}</div>`;
  } else {
    const ehRec = Boolean(r?.recomendado && String(r.recomendado.id) === String(kit.id));
    const titulo = ehRec ? (r.cobre ? '<i data-lucide="sparkles"></i> Kit recomendado' : '<i data-lucide="sparkles"></i> Mais próximo do consumo') : 'Kit escolhido';
    const voltar = r?.recomendado && !ehRec
      ? '<button type="button" class="orc-link" onclick="orcamentoLimparKit()">voltar ao recomendado</button>' : '';
    html += `<div class="orc-sec">${titulo}${voltar}</div>${_orcamentoKitCardHTML(kit, r, ehRec ? r.nota : '')}`;
  }

  html += `<button type="button" id="orcamento-lado-gerar" class="btn btn-primary orc-gerar" onclick="orcamentoGerar(event)" ${kit && !_orcamentoGerando ? '' : 'disabled'}>
    ${_orcamentoGerando ? '<i data-lucide="loader-2" class="animate-spin"></i> Gerando...' : `<i data-lucide="file-text"></i> Gerar proposta${kit ? ' · ' + formatCurrency(kit.price) : ''}`}</button>`;
  if (kit) html += _orcamentoAjusteHTML(kit, r);
  if (dim && !r?.integrada && !_orcamentoIntegrada()) {
    const total = (typeof pbKitsOrcamento === 'function' ? pbKitsOrcamento() : (state.data || [])).filter((k) => k.categoria === state.pbCategory && k.ativo !== false
      && (typeof pbKitCompativel !== 'function' || pbKitCompativel(k))).length;
    if (total) html += `<button type="button" class="orc-link orc-ver-todos" onclick="orcamentoVerLista()">Ver todos os ${total} kits →</button>`;
  }
  return html;
}

async function orcamentoGerar(event) {
  if (_orcamentoGerando || event.currentTarget.disabled) return;
  const btn = event.currentTarget;
  const personalizada = state.pbProposalMode === PB_PROPOSAL_MODES.PERSONALIZADA;
  const kit = personalizada ? null : _orcamentoKitAtual();
  if (!personalizada && !kit) return;
  _orcamentoGerando = true;
  btn.disabled = true;
  const original = btn.innerHTML;
  if (personalizada) {
    btn.innerHTML = '<i data-lucide="loader-2" class="animate-spin"></i> Gerando...';
    if (window.lucide) window.lucide.createIcons();
  }
  try {
    if (personalizada) {
      await handleEquipamentosProposalSubmit({ preventDefault() {} });
    } else {
      await copyProposalLink(kit, { currentTarget: btn });
    }
  } finally {
    _orcamentoGerando = false;
    if (personalizada) btn.innerHTML = original;
    orcamentoAtualizarResumo();
  }
}

// Re-renderizações de dados continuam na tela de orçamento. Uma troca de
// ambiente/aba estaciona o painel antes de o portal redesenhar o conteúdo.
(function () {
  const originalRender = renderContent;
  renderContent = function () {
    if (orcamentoAberto()) {
      const restoreFocus = captureTextInputFocus();
      renderOrcamento();
      restoreFocus();
      return;
    }
    return originalRender.apply(this, arguments);
  };
  ['setTab', 'setEnvironment', 'handleLogout'].forEach((name) => {
    const original = window[name];
    if (typeof original !== 'function') return;
    window[name] = function () {
      if (orcamentoAberto()) closeOrcamento(false);
      return original.apply(this, arguments);
    };
  });
})();
