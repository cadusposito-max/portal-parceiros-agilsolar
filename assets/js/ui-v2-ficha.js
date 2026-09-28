// ==========================================
// VISUAL NOVO (v2) — FICHA DO CLIENTE (CRM 360) em painel lateral
// ------------------------------------------
// Só no beta. Redesenha a MOLDURA da ficha (cabeçalho, etapas, resumo, abas,
// painel de dados) mantendo os mesmos IDs de crm.js — salvar, autocompletar
// cidade, máscaras, construtor de proposta embutido, financiamento e arquivos
// continuam os mesmos. O conteúdo de cada aba vem de renderCrm360TabContent.
// ==========================================

(function () {
  if (!window.uiV2 || typeof renderCrm360 !== 'function') return;

  const has = (fn) => typeof window[fn] === 'function';
  const esc = (s) => (has('escapeHTML') ? escapeHTML(String(s ?? '')) : String(s ?? ''));
  const ic = (n, extra = '') => `<i data-lucide="${n}" ${extra}></i>`;
  const initials = (n) => String(n || '?').split(/\s+/).filter((w) => w.length > 2).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || String(n || '?').charAt(0).toUpperCase();
  const cap = (s) => { const t = String(s || '').toLocaleLowerCase('pt-BR'); return t.charAt(0).toLocaleUpperCase('pt-BR') + t.slice(1); };
  const ST = { NOVO: 'Novo', 'PROPOSTA ENVIADA': 'Proposta enviada', 'EM NEGOCIAÇÃO': 'Em negociação', FECHADO: 'Fechado', PERDIDO: 'Perdido' };
  const ST_CLS = { NOVO: 't-gray', 'PROPOSTA ENVIADA': 't-blue', 'EM NEGOCIAÇÃO': 't-orange', FECHADO: 't-green', PERDIDO: 't-red' };

  function ensureScrim() {
    if (document.getElementById('v2-crm-scrim')) return;
    const s = document.createElement('div');
    s.id = 'v2-crm-scrim';
    s.addEventListener('click', () => { if (has('closeCrm360')) closeCrm360(); });
    document.body.appendChild(s);
  }

  function renderCrm360V2() {
    const overlay = ensureCrm360Container();
    pbParkEmbeddedPanel(); // o innerHTML destruiria o construtor embutido
    const client = _crm360Client();
    if (!client) { closeCrm360(); return; }
    ensureScrim();

    const status = normalizeClientStatus(client.status);
    const waLink = buildClientWhatsappLink(client);
    const tel = digitsOnly(client.telefone);
    const { propostas, vendas } = _crm360ClientRows();
    const omFlag = state.omFlags ? state.omFlags[client.id] : null;
    const podeProposta = typeof canOperateClientProposalFlow !== 'function' || canOperateClientProposalFlow(client);
    const docs = has('_crm360DocsAtivo') && _crm360DocsAtivo();
    const larga = has('_crm360AbaLarga') && _crm360AbaLarga();

    const tabs = [['timeline', 'history', 'Timeline'], ['propostas', 'file-text', 'Propostas', propostas.length]];
    if (podeProposta) tabs.push(['nova', 'file-plus-2', 'Nova proposta', null, 'acc']);
    tabs.push(['vendas', 'trophy', 'Vendas', vendas.length], ['financiamento', 'landmark', 'Financ.']);
    if (has('renderCrmArquivosTab')) tabs.push(['arquivos', 'paperclip', 'Arquivos', `<span id="crm360-arq-count">${crmArquivosTabContador(client.id)}</span>`]);
    if (omFlag) tabs.push(['om', 'wrench', 'O&M']);

    // barra de etapas: clicar usa crmSetClientStatus (Perdido pede motivo; Fechado abre a venda)
    const seq = CLIENT_STATUS_SEQUENCE;
    const cur = seq.indexOf(status);
    const lost = status === 'PERDIDO';
    const steps = seq.map((s, i) => {
      const done = !lost && i < cur, on = !lost && i === cur;
      return `${i ? `<span class="v2f-line ${!lost && i <= cur ? 'done' : ''}"></span>` : ''}<button class="v2f-step ${done ? 'done' : ''} ${on ? 'cur' : ''}" onclick="crmSetClientStatus('${esc(client.id)}','${s}')" title="Mover para ${ST[s]}"><i>${done ? ic('check') : i + 1}</i><span>${ST[s]}</span></button>`;
    }).join('') + (lost
      ? `<span class="v2f-line"></span><span class="v2f-step lost"><i>${ic('x')}</i><span>Perdido</span></span>`
      : `<button class="v2f-lostbtn" onclick="crmSetClientStatus('${esc(client.id)}','PERDIDO')" title="Marcar como perdido">${ic('thumbs-down')}<span>Perdido</span></button>`);

    const vend = client.vendedor_email ? (has('dashVendedorNome') ? dashVendedorNome(client.vendedor_email) : client.vendedor_email) : '—';
    const prox = client.proxima_acao_em ? new Date(client.proxima_acao_em) : null;
    const proxAtrasada = prox && prox < new Date();
    const origemLbl = (() => {
      const o = (typeof CLIENT_ORIGENS !== 'undefined' ? CLIENT_ORIGENS : []).find((x) => x.v === client.origem);
      return o ? cap(o.l) : (client.origem && client.origem !== 'nao_informado' ? cap(client.origem) : 'Não informada');
    })();

    const prevScroll = document.getElementById('crm360-scroll');
    const keepY = prevScroll && overlay.dataset.clientId === String(client.id) ? prevScroll.scrollTop : 0;

    overlay.innerHTML = `
      <div class="v2f">
        <div class="v2f-head">
          <div class="v2f-top">
            <i class="v2f-av">${esc(initials(client.nome))}</i>
            <div class="tx">
              <h2>${esc(client.nome || 'Cliente')}
                <button class="v2-chip dot ${ST_CLS[status] || 't-gray'} v2f-stchip" onclick="openClientStatusMenu(event, '${esc(client.id)}')" title="Alterar status">${ST[status] || status}${ic('chevron-down')}</button>
                ${omFlag ? '<span class="v2-chip t-blue">O&amp;M</span>' : ''}</h2>
              <div class="sub">
                <span>${ic('phone')}${esc(client.telefone || '—')}</span>
                <span>${ic('map-pin')}${esc(client.cidade || 'sem cidade')}${Number(client.hsp) > 0 ? ` · HSP ${esc(String(client.hsp).replace('.', ','))}` : ''}</span>
                <span>${ic('calendar')}desde ${esc(formatDate(client.created_at))}</span>
              </div>
              ${lost && client.perdido_motivo ? `<div class="v2f-lost">${ic('info')}Motivo da perda: ${esc(client.perdido_motivo)}</div>` : ''}
            </div>
            <div class="v2f-acts">
              ${waLink ? `<a class="v2f-wa" href="${esc(waLink)}" target="_blank" rel="noopener noreferrer">${ic('message-circle')}WhatsApp</a>` : ''}
              ${tel ? `<a class="v2-sq" href="tel:+55${tel}" title="Ligar">${ic('phone')}</a>` : ''}
              ${docs ? `<button class="v2-sq" onclick="abrirDocumentosCliente('${esc(client.id)}')" title="Contrato e procuração">${ic('file-signature')}</button>` : ''}
              <button class="v2-sq" onclick="openFechaVenda('${esc(client.id)}')" title="Registrar venda">${ic('trophy')}</button>
              <button class="v2-sq" onclick="closeCrm360()" title="Fechar (Esc)">${ic('x')}</button>
            </div>
          </div>
          <div class="v2f-steps">${steps}</div>
          <div class="v2f-sum">
            <div><small>Origem</small><b>${esc(origemLbl)}</b></div>
            <div><small>Responsável</small><b>${esc(vend)}</b></div>
            <div><small>Propostas</small><b>${propostas.length}${vendas.length ? ` · ${vendas.length} venda${vendas.length > 1 ? 's' : ''}` : ''}</b></div>
            <div class="${proxAtrasada ? 'late' : ''}"><small>Próxima ação</small><b>${prox ? esc(prox.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' + prox.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })) : 'Nenhuma'}</b></div>
          </div>
          <div class="v2f-tabs">${tabs.map((t) => `<button class="${t[4] || ''} ${_crm360Tab === t[0] ? 'on' : ''}" onclick="crmSet360Tab('${t[0]}')">${ic(t[1])}${t[2]}${t[3] != null ? `<em>${t[3]}</em>` : ''}</button>`).join('')}</div>
        </div>

        <div id="crm360-scroll" class="v2f-body">
          <div class="v2f-grid ${larga ? 'larga' : ''}">
            <div class="v2f-dados ${larga ? 'hidden' : ''}">
              <div class="v2f-card">
                <h3>${ic('user-cog')}Dados do cliente</h3>
                <div class="v2f-fields">
                  ${crm360Field('Nome', `<input id="crm360-nome" value="${esc(client.nome || '')}" class="crm360-input">`, 'full')}
                  ${crm360Field('Telefone', `<input id="crm360-telefone" value="${esc(client.telefone || '')}" class="crm360-input">`)}
                  ${crm360Field('E-mail', `<input id="crm360-email" type="email" value="${esc(client.email || '')}" class="crm360-input">`)}
                  ${crm360Field('Cidade/UF', `<div class="relative"><input id="crm360-cidade" value="${esc(client.cidade || '')}" class="crm360-input" autocomplete="off"></div>`)}
                  ${crm360Field('CPF/CNPJ', `<input id="crm360-documento" value="${esc(client.documento || '')}" class="crm360-input">`)}
                  ${crm360Field('CEP', `<input id="crm360-cep" value="${esc(client.cep || '')}" class="crm360-input">`)}
                  ${crm360Field('Origem', `<select id="crm360-origem" class="crm360-input">${clientOrigemOptionsHTML(client.origem)}</select>`)}
                  ${crm360Field('Endereço', `<input id="crm360-endereco" value="${esc(client.endereco || '')}" class="crm360-input">`, 'full')}
                  ${crm360Field('Número', `<input id="crm360-numero" value="${esc(client.numero || '')}" class="crm360-input">`)}
                  ${crm360Field('Bairro', `<input id="crm360-bairro" value="${esc(client.bairro || '')}" class="crm360-input">`)}
                  ${crm360CamposDocumentosHTML(client)}
                  ${crm360Field('Observações', `<textarea id="crm360-observacoes" rows="3" class="crm360-input">${esc(client.observacoes || '')}</textarea>`, 'full')}
                </div>
              </div>
              <div class="v2f-card">
                <h3>${ic('alarm-clock')}Próxima ação</h3>
                <div class="v2f-fields">
                  ${crm360Field('Quando', `<input id="crm360-proxima-em" type="datetime-local" value="${toLocalDatetimeInputValue(client.proxima_acao_em)}" class="crm360-input">`)}
                  ${crm360Field('O que fazer', `<input id="crm360-proxima-nota" value="${esc(client.proxima_acao_nota || '')}" class="crm360-input" placeholder="Ex.: ligar para follow-up">`)}
                </div>
              </div>
              <button onclick="crmSaveClient360()" id="crm360-save-btn" class="v2f-save">${ic('save')}Salvar alterações</button>
            </div>
            <div class="v2f-card v2f-tabbody"><div id="crm360-tab-content">${renderCrm360TabContent(client, propostas, vendas)}</div></div>
          </div>
        </div>
      </div>`;

    // mesmo pós-render de crm.js
    if (has('attachCidadeAutocomplete')) attachCidadeAutocomplete(document.getElementById('crm360-cidade'), (mun) => { _crm360Cidade = mun; });
    const telInput = document.getElementById('crm360-telefone');
    if (telInput && has('formatarTelefone')) telInput.addEventListener('input', formatarTelefone);
    if (has('ligarMascara')) { ligarMascara(document.getElementById('crm360-documento'), 'auto'); ligarMascara(document.getElementById('crm360-cep'), 'cep'); }
    if (_crm360Tab === 'nova') {
      const slot = document.getElementById('crm360-builder-slot');
      const panel = document.getElementById('pb-embedded-panel');
      if (slot && panel) slot.appendChild(panel);
      if (has('pbEmbedSetup')) pbEmbedSetup(client);
    }
    if (_crm360Tab === 'financiamento' && has('renderFinanciamento')) renderFinanciamento();
    if (_crm360Tab === 'propostas' && state.isAdmin && has('preencherSelosPrecificacao')) preencherSelosPrecificacao();

    if (window.lucide) window.lucide.createIcons();
    overlay.dataset.clientId = String(client.id);
    const sc = document.getElementById('crm360-scroll');
    if (sc && keepY) sc.scrollTop = keepY;
  }

  const _renderCrm360 = renderCrm360;
  renderCrm360 = function () {
    if (window.uiV2.isActive()) {
      try { return renderCrm360V2(); } catch (err) { console.warn('[ui-v2] ficha falhou, usando a antiga', err); }
    }
    return _renderCrm360.apply(this, arguments);
  };
  // trocar o visual com a ficha aberta: redesenha na versão certa
  document.addEventListener('uiv2:change', () => {
    const o = document.getElementById('crm360-overlay');
    if (o && o.classList.contains('is-open') && typeof _crm360ClientId !== 'undefined' && _crm360ClientId) renderCrm360();
  });
})();
