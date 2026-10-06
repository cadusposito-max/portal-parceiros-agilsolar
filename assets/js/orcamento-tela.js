// ==========================================
// NOVA PROPOSTA — TELA DO ORÇAMENTO
// ==========================================
// Reaproveita o construtor existente, movendo seu painel (e seus listeners).
// Cadastro/busca continuam no popup; a ficha fica como atalho de consulta.
let _orcamentoClientId = null;
let _orcamentoKitId = null;
let _orcamentoOrigemFicha = null;
let _orcamentoGerando = false;

function orcamentoAberto() {
  return Boolean(_orcamentoClientId);
}

function orcamentoSnapshot() {
  return { id: _orcamentoClientId, ficha: _orcamentoOrigemFicha };
}

function orcamentoRestaurar(saved) {
  if (!saved?.id) return;
  openOrcamento(saved.id);
  if (orcamentoAberto()) _orcamentoOrigemFicha = saved.ficha || null;
}

function _orcamentoEstacionar() {
  const panel = document.getElementById('pb-embedded-panel');
  const parking = document.getElementById('pb-parking');
  if (panel && parking && panel.parentElement !== parking) parking.appendChild(panel);
}

function openOrcamento(clientId) {
  const client = (state.clientes || []).find((c) => c.id === clientId);
  if (!client || !canOperateClientProposalFlow(client)) return;
  if (_orcamentoGerando) return;
  if (!orcamentoAberto()) {
    _orcamentoOrigemFicha = typeof _crm360ClientId !== 'undefined' && _crm360ClientId
      ? { id: _crm360ClientId, tab: _crm360Tab }
      : null;
  }
  if (typeof closeCrm360 === 'function') closeCrm360();
  if (_orcamentoClientId !== clientId) _orcamentoKitId = null;
  _orcamentoClientId = clientId;
  renderContent();
  window.scrollTo({ top: 0 });
}

function closeOrcamento(render = true) {
  _orcamentoEstacionar();
  if (typeof closeProposalSharePanel === 'function') closeProposalSharePanel();
  _orcamentoClientId = null;
  _orcamentoKitId = null;
  document.body.classList.remove('orcamento-aberto');
  if (render) renderContent();
}

function orcamentoVoltar() {
  const ficha = _orcamentoOrigemFicha;
  closeOrcamento();
  if (ficha) openCrm360(ficha.id, ficha.tab);
  else openNovaPropostaPicker();
}

function orcamentoVerFicha() {
  const id = _orcamentoClientId;
  if (!id) return;
  closeOrcamento();
  openCrm360(id, 'propostas');
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
      </header>
      <div id="orcamento-builder-slot"></div>
      <footer class="orcamento-footer">
        <div class="orcamento-resumo" aria-live="polite"><small id="orcamento-selecao-label">Selecionado</small><strong id="orcamento-selecao">Escolha um kit para continuar</strong></div>
        <button type="button" id="orcamento-gerar" class="btn btn-primary" onclick="orcamentoGerar(event)" disabled><i data-lucide="file-text"></i> Gerar proposta</button>
      </footer>
    </section>`;
  const panel = document.getElementById('pb-embedded-panel');
  const slot = document.getElementById('orcamento-builder-slot');
  if (panel && slot) slot.appendChild(panel);

  const bar = document.getElementById('pb-mode-bar');
  if (bar && !document.getElementById('orcamento-modo')) {
    const label = document.createElement('label');
    label.className = 'orcamento-modo';
    label.innerHTML = `<select id="orcamento-modo" class="v2-select" aria-label="Tipo de proposta" data-titulo="Tipo de proposta" onchange="setPBProposalMode(this.value)"><option value="PROMOCIONAL">Promocional</option>${canUsePersonalizada() ? '<option value="PERSONALIZADA">Personalizada</option>' : ''}</select>`;
    bar.appendChild(label);
  }
  if (panel && !panel.dataset.orcamentoBound) {
    panel.dataset.orcamentoBound = '1';
    panel.addEventListener('click', (e) => {
      if (!orcamentoAberto() || e.target.closest('button, input, select, a')) return;
      const card = e.target.closest('[data-orcamento-kit]');
      if (card) orcamentoSelecionarKit(card.dataset.orcamentoKit);
    });
  }
  pbEmbedSetup(client);
  orcamentoAtualizarResumo();
  if (window.uiV2Shell) window.uiV2Shell.refresh();
  if (window.lucide) window.lucide.createIcons();
}

function orcamentoSelecionarKit(kitId) {
  if (_orcamentoGerando) return;
  const kit = (state.data || []).find((k) => String(k.id) === String(kitId) && k.ativo !== false);
  if (!kit || (typeof pbKitCompativel === 'function' && !pbKitCompativel(kit))) return;
  _orcamentoKitId = String(kit.id);
  orcamentoAtualizarResumo();
}

function orcamentoLimparKit() {
  _orcamentoKitId = null;
  orcamentoAtualizarResumo();
}

function orcamentoAtualizarResumo() {
  if (!orcamentoAberto()) return;
  const personalizada = state.pbProposalMode === PB_PROPOSAL_MODES.PERSONALIZADA;
  const mode = document.getElementById('orcamento-modo');
  if (mode) {
    mode.value = state.pbProposalMode;
    const custom = mode.querySelector('option[value="PERSONALIZADA"]');
    if (custom) custom.disabled = !canUsePersonalizada();
    if (window.uiV2Select) window.uiV2Select.scan(mode.parentElement);
  }
  const kit = (state.data || []).find((k) => String(k.id) === _orcamentoKitId && k.ativo !== false
    && (typeof pbKitCompativel !== 'function' || pbKitCompativel(k)));
  let texto = 'Escolha um kit para continuar';
  let valido = Boolean(kit);
  if (personalizada) {
    const draft = _pbDraft();
    const tot = calcularTotaisPersonalizada(draft);
    valido = canUsePersonalizada() && tot.total > 0 && _pbPotenciaEfetiva(draft, tot) > 0 && tot.itens.length > 0;
    texto = tot.total > 0 ? `${draft.descricao || 'Proposta personalizada'} · ${formatCurrency(tot.total)}` : 'Adicione os itens da proposta';
  } else if (kit) {
    const dist = typeof pbKitDistribuidoraNome === 'function' ? pbKitDistribuidoraNome(kit) : '';
    texto = `${kit.name}${dist ? ' · ' + dist : ''} · ${formatCurrency(kit.price)}`;
  }
  const label = document.getElementById('orcamento-selecao-label');
  const resumo = document.getElementById('orcamento-selecao');
  const btn = document.getElementById('orcamento-gerar');
  if (label) label.textContent = personalizada ? 'Personalizada' : 'Selecionado';
  if (resumo) resumo.textContent = texto;
  if (btn) btn.disabled = !valido || _orcamentoGerando;
  document.querySelectorAll('#orcamento-builder-slot [data-orcamento-kit]').forEach((card) => {
    const on = !personalizada && card.dataset.orcamentoKit === _orcamentoKitId;
    card.classList.toggle('orcamento-kit-selecionado', on);
    const b = card.querySelector('button[data-kit-id]');
    if (b) {
      b.setAttribute('aria-pressed', String(on));
      b.setAttribute('aria-label', on ? 'Kit selecionado' : 'Selecionar kit');
      b.lastChild.textContent = on ? ' Selecionado' : ' Selecionar kit';
    }
  });
}

async function orcamentoGerar(event) {
  if (_orcamentoGerando || event.currentTarget.disabled) return;
  const btn = event.currentTarget;
  _orcamentoGerando = true;
  btn.disabled = true;
  const original = btn.innerHTML;
  if (state.pbProposalMode === PB_PROPOSAL_MODES.PERSONALIZADA) {
    btn.innerHTML = '<i data-lucide="loader-2" class="animate-spin"></i> Gerando...';
    if (window.lucide) window.lucide.createIcons();
  }
  try {
    if (state.pbProposalMode === PB_PROPOSAL_MODES.PERSONALIZADA) {
      await handleEquipamentosProposalSubmit({ preventDefault() {} });
    } else {
      const kit = (state.data || []).find((k) => String(k.id) === _orcamentoKitId && k.ativo !== false);
      if (kit && (typeof pbKitCompativel !== 'function' || pbKitCompativel(kit))) await copyProposalLink(kit, { currentTarget: btn });
    }
  } finally {
    _orcamentoGerando = false;
    if (state.pbProposalMode === PB_PROPOSAL_MODES.PERSONALIZADA) btn.innerHTML = original;
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
