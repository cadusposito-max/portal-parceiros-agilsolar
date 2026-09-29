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
  const cap = (s) => { const t = String(s || '').toLocaleLowerCase('pt-BR'); return t.charAt(0).toLocaleUpperCase('pt-BR') + t.slice(1); };
  const ST = { NOVO: 'Novo', 'PROPOSTA ENVIADA': 'Enviada', 'EM NEGOCIAÇÃO': 'Em negociação', FECHADO: 'Fechado', PERDIDO: 'Perdido' };
  const ST_CLS = { NOVO: 't-gray', 'PROPOSTA ENVIADA': 't-blue', 'EM NEGOCIAÇÃO': 't-orange', FECHADO: 't-green', PERDIDO: 't-red' };

  function ensureScrim() {
    if (document.getElementById('v2-crm-scrim')) return;
    const s = document.createElement('div');
    s.id = 'v2-crm-scrim';
    s.addEventListener('click', () => { if (has('closeCrm360')) closeCrm360(); });
    document.body.appendChild(s);
  }

  // ---------- vistoria (controle mínimo; clientes.vistoria_*) ----------
  const VIS = () => window.uiV2VistoriaInfo || { info: () => null, ST: {} };
  function vistoriaResumoHTML(client) {
    const v = VIS().info(client);
    const txt = !v ? 'Sem vistoria' : v.st === 'agendada' && v.data
      ? `${v.data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${v.data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
      : v.label;
    return `<div class="v2f-sumvis ${v ? v.cls : ''} ${v && v.atrasada ? 'late' : ''}" onclick="uiV2Vistoria.focar()" title="Ver vistoria"><small>Vistoria</small><b>${esc(txt)}</b></div>`;
  }
  function vistoriaCardHTML(client) {
    const cur = VIS().ST[client.vistoria_status] ? client.vistoria_status : '';
    const opts = [['', 'Sem vistoria', 'minus']].concat(Object.entries(VIS().ST).map(([k, s]) => [k, s[0], s[1]]));
    const quando = client.vistoria_atualizado_em ? `<small class="v2f-h3sub">atualizada ${esc(formatDate(client.vistoria_atualizado_em))}</small>` : '';
    return `<div class="v2f-card v2f-vis" id="v2f-vistoria" data-st="${cur}">
      <h3>${ic('clipboard-check')}Vistoria${quando}</h3>
      <div class="v2f-visst" role="radiogroup" aria-label="Situação da vistoria">${opts.map(([v, l, i]) => `<button type="button" role="radio" aria-checked="${cur === v}" class="${cur === v ? 'on' : ''}" data-v="${v}" onclick="uiV2Vistoria.escolher(this)">${ic(i)}${l}</button>`).join('')}</div>
      <div class="v2f-fields v2f-visfields ${cur ? '' : 'off'}">
        ${crm360Field('Data e hora', `<input id="v2f-vis-data" type="datetime-local" value="${toLocalDatetimeInputValue(client.vistoria_data)}" class="crm360-input">`)}
        ${crm360Field('Responsável', `<input id="v2f-vis-resp" value="${esc(client.vistoria_responsavel || '')}" class="crm360-input" placeholder="Quem vai fazer">`)}
        ${crm360Field('Observação', `<input id="v2f-vis-obs" value="${esc(client.vistoria_obs || '')}" class="crm360-input" placeholder="Ex.: telhado de fibrocimento, levar escada">`, 'full')}
      </div>
      <button type="button" class="v2f-save alt" onclick="uiV2Vistoria.salvar('${esc(client.id)}')">${ic('check')}Salvar vistoria</button>
    </div>`;
  }
  const fmtData = (iso) => { const d = new Date(iso); return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`; };
  function vistoriaDescricao(antes, depois) {
    const st = depois.vistoria_status;
    const resp = depois.vistoria_responsavel ? ` · responsável: ${depois.vistoria_responsavel}` : '';
    if (st !== antes.vistoria_status) {
      if (!st) return 'Vistoria removida';
      if (st === 'a_agendar') return 'Vistoria solicitada (a agendar)';
      if (st === 'agendada') return `Vistoria agendada para ${fmtData(depois.vistoria_data)}${resp}`;
      if (st === 'realizada') return `Vistoria realizada${resp}`;
      return `Vistoria com pendência${depois.vistoria_obs ? `: ${depois.vistoria_obs}` : ''}`;
    }
    if (st === 'agendada' && depois.vistoria_data !== antes.vistoria_data) return `Vistoria reagendada para ${fmtData(depois.vistoria_data)}${resp}`;
    if (st && (depois.vistoria_obs !== antes.vistoria_obs || depois.vistoria_responsavel !== antes.vistoria_responsavel)) {
      return `Vistoria atualizada${depois.vistoria_obs ? `: ${depois.vistoria_obs}` : ''}${resp}`;
    }
    return '';
  }
  if (typeof CRM_ATIVIDADE_META !== 'undefined') CRM_ATIVIDADE_META.vistoria = { icon: 'clipboard-check', label: 'Vistoria', color: 'text-sky-400' };

  window.uiV2Vistoria = {
    focar() {
      const card = document.getElementById('v2f-vistoria');
      if (!card) return;
      card.scrollIntoView({ behavior: 'smooth', block: 'start' });
      card.classList.remove('flash'); void card.offsetWidth; card.classList.add('flash');
    },
    escolher(btn) {
      const card = btn.closest('#v2f-vistoria');
      card.querySelectorAll('.v2f-visst button').forEach((b) => { const on = b === btn; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
      card.dataset.st = btn.dataset.v;
      card.querySelector('.v2f-visfields').classList.toggle('off', !btn.dataset.v);
      if (btn.dataset.v === 'agendada' && !document.getElementById('v2f-vis-data').value) document.getElementById('v2f-vis-data').focus();
    },
    async salvar(id) {
      const c = (state.clientes || []).find((x) => String(x.id) === String(id));
      const card = document.getElementById('v2f-vistoria');
      if (!c || !card) return;
      const st = card.dataset.st || null;
      const dataV = document.getElementById('v2f-vis-data').value;
      if (st === 'agendada' && !dataV) { showToast('Informe a data e a hora da vistoria.'); document.getElementById('v2f-vis-data').focus(); return; }
      const payload = st ? {
        vistoria_status: st,
        vistoria_data: dataV ? new Date(dataV).toISOString() : null,
        vistoria_responsavel: document.getElementById('v2f-vis-resp').value.trim() || null,
        vistoria_obs: document.getElementById('v2f-vis-obs').value.trim() || null,
      } : { vistoria_status: null, vistoria_data: null, vistoria_responsavel: null, vistoria_obs: null };
      const antes = { vistoria_status: c.vistoria_status || null, vistoria_data: c.vistoria_data ? new Date(c.vistoria_data).toISOString() : null, vistoria_responsavel: c.vistoria_responsavel || null, vistoria_obs: c.vistoria_obs || null };
      const descricao = vistoriaDescricao(antes, payload);
      if (!descricao) { showToast('Nada mudou na vistoria.'); return; }
      payload.vistoria_atualizado_em = new Date().toISOString();
      const btn = card.querySelector('.v2f-save');
      if (btn) btn.disabled = true;
      const { error } = await supabaseClient.from('clientes').update(payload).eq('id', c.id);
      if (btn) btn.disabled = false;
      if (error) { console.error('[ui-v2] vistoria', error); showToast(`Erro ao salvar a vistoria: ${error.message}`); return; }
      Object.assign(c, payload);
      supabaseClient.from('crm_atividades').insert([{
        cliente_id: c.id,
        franquia_id: c.franquia_id,
        autor_email: state.currentUser?.email || 'sistema',
        tipo: 'vistoria',
        descricao,
        meta: { status: payload.vistoria_status },
      }]).then(({ error: e }) => { if (e) console.warn('[ui-v2] timeline vistoria', e); if (has('crmFetchAtividades')) crmFetchAtividades(c.id); });
      showToast('VISTORIA ATUALIZADA');
      if (has('renderCrm360')) renderCrm360();
      if (has('renderContent')) renderContent();
    },
  };

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
            ${(() => { const pj = window.uiV2TipoCliente && window.uiV2TipoCliente(client) === 'PJ'; return `<i class="v2f-av ${pj ? 'pj' : ''}" title="${pj ? 'Empresa' : 'Pessoa física'}">${ic(pj ? 'building-2' : 'user')}</i>`; })()}
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
            ${vistoriaResumoHTML(client)}
          </div>
          <div class="v2f-tabs">${tabs.map((t) => `<button class="${t[4] || ''} ${_crm360Tab === t[0] ? 'on' : ''}" onclick="crmSet360Tab('${t[0]}')">${ic(t[1])}${t[2]}${t[3] != null ? `<em>${t[3]}</em>` : ''}</button>`).join('')}</div>
        </div>

        <div id="crm360-scroll" class="v2f-body">
          <div class="v2f-grid ${larga ? 'larga' : ''}">
            <div class="v2f-dados ${larga ? 'hidden' : ''}">
              ${vistoriaCardHTML(client)}
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
