// ==========================================
// VISUAL NOVO (v2) — FICHA DO CLIENTE (CRM 360) em painel lateral
// ------------------------------------------
// Só no beta. Redesenha a MOLDURA da ficha (cabeçalho, etapas, resumo, abas,
// painel de dados) mantendo os mesmos IDs de crm.js — salvar, autocompletar
// cidade, máscaras, atalho para orçamento, financiamento e arquivos
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

  // ---------- tamanho: painel lateral x tela cheia; cabeçalho compacto ao rolar ----------
  // Tela cheia é escolha de cada pessoa (fica salva no navegador). O cabeçalho
  // encolhe ao rolar a ficha e, em telas baixas (notebook), já abre encolhido;
  // tocar na linha compacta mostra as etapas e o resumo de novo.
  const CHEIA_KEY = 'ui_v2_ficha_cheia';
  const cheia = () => { try { return localStorage.getItem(CHEIA_KEY) === '1'; } catch (_) { return false; } };
  // celular (mesma quebra do CSS) também abre encolhido: o cabeçalho cheio comia metade da tela
  const telaBaixa = () => window.innerHeight < 760 || window.innerWidth <= 760;
  let expandido = false;
  let fichaDe = null;
  function ajustarCabecalho() {
    const f = document.querySelector('#crm360-overlay .v2f');
    const sc = document.getElementById('crm360-scroll');
    if (!f || !sc) return;
    const y = sc.scrollTop;
    // só encolhe se houver o que rolar (senão encolher/expandir fica piscando)
    const rolavel = sc.scrollHeight - sc.clientHeight > 220;
    let comp = f.classList.contains('compacto');
    if (y > 60 && rolavel) { comp = true; expandido = false; } else if (y < 8) comp = telaBaixa() && !expandido;
    f.classList.toggle('compacto', comp);
  }
  window.addEventListener('resize', ajustarCabecalho);
  window.uiV2Ficha = {
    cheia() {
      const on = !cheia();
      try { localStorage.setItem(CHEIA_KEY, on ? '1' : '0'); } catch (_) {}
      if (has('renderCrm360')) renderCrm360();
    },
    // atalhos do resumo (Vistoria / Próxima ação): abrem a aba Dados antes
    irDados(alvo) {
      const acha = () => (alvo === 'vistoria' ? document.getElementById('v2f-vistoria') : (document.getElementById('crm360-proxima-em') || {}).closest?.('.v2f-card'));
      if (!acha() && typeof _crm360Tab !== 'undefined') { _crm360Tab = 'dados'; renderCrm360(); }
      requestAnimationFrame(() => {
        const el = acha();
        if (!el) return;
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
      });
    },
    expandir() {
      expandido = true;
      const sc = document.getElementById('crm360-scroll');
      if (sc && sc.scrollTop > 0) sc.scrollTo({ top: 0, behavior: 'smooth' });
      const f = document.querySelector('#crm360-overlay .v2f');
      if (f) f.classList.remove('compacto');
    },
  };

  // ---------- vistoria (controle mínimo; clientes.vistoria_*) ----------
  const VIS = () => window.uiV2VistoriaInfo || { info: () => null, ST: {} };
  function vistoriaTexto(v) {
    return !v ? 'Sem vistoria' : v.st === 'agendada' && v.data
      ? `${v.data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${v.data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
      : v.label;
  }
  function vistoriaResumoHTML(client) {
    const v = VIS().info(client);
    return `<div class="v2f-sumvis ${v ? v.cls : ''} ${v && v.atrasada ? 'late' : ''}" onclick="uiV2Vistoria.focar()" title="Ver vistoria"><small>Vistoria</small><b>${esc(vistoriaTexto(v))}</b></div>`;
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
  // Respostas do formulário do anúncio do Meta (clientes.lead_meta, gravado pela
  // edge function meta-leads). Só leitura: é o que o cliente respondeu.
  function leadMetaCardHTML(client) {
    const lm = client && client.origem === 'meta' ? client.lead_meta : null;
    if (!lm) return '';
    const fone = (d) => (d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : d);
    const linha = (p, r) => `<div class="v2f-lmq"><span>${esc(p)}</span><b>${r}</b></div>`;
    const chegou = lm.recebido_em ? new Date(lm.recebido_em) : null;
    const plataforma = { ig: 'Instagram', fb: 'Facebook', instagram: 'Instagram', facebook: 'Facebook' }[String(lm.plataforma || '').toLowerCase()] || '';
    const quando = chegou && !Number.isNaN(chegou.getTime())
      ? `${chegou.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} às ${chegou.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
      : '';
    const linhas = [
      ...(Array.isArray(lm.perguntas) ? lm.perguntas : []).map((q) => linha(q.p, esc(q.r))),
      ...(Array.isArray(lm.outros_telefones) ? lm.outros_telefones : []).map((d) => linha('Outro telefone informado',
        `${esc(fone(String(d)))} <a href="https://wa.me/55${esc(String(d))}" target="_blank" rel="noopener noreferrer">${ic('message-circle')}chamar</a>`)),
      lm.cidade ? linha('Cidade informada', esc(lm.cidade)) : '',
      lm.email ? linha('E-mail', esc(lm.email)) : '',
      lm.campanha || lm.anuncio ? linha('Campanha · anúncio', `<em>${esc([lm.campanha, lm.anuncio].filter(Boolean).join(' · '))}</em>`) : '',
    ].join('');
    return `<div class="v2f-card v2f-leadmeta">
              <h3>${ic('megaphone')}Respostas do formulário do anúncio${quando || plataforma ? `<span class="v2f-h3sub">${esc([quando, plataforma].filter(Boolean).join(' · '))}</span>` : ''}</h3>
              ${linhas || '<div class="v2f-lmq"><span>O formulário não tinha perguntas extras.</span></div>'}
            </div>`;
  }

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


  // ---------- responsável do cliente (só admin e gestor) ----------
  // Lista e troca pelas RPCs cliente_responsaveis_possiveis / cliente_trocar_responsavel:
  // admin escolhe qualquer usuário ativo (o cliente muda de unidade junto);
  // gestor só alguém da própria unidade. Fica registrado na timeline.
  const podeTrocarResp = () => Boolean(state.isAdmin || state.isGestor);
  const R = { clientId: null, lista: [], q: '', escolhido: null, salvando: false };

  function respFechar() { const s = document.getElementById('v2-resp-scrim'); if (s) s.remove(); R.clientId = null; }
  function respPintar() {
    const box = document.getElementById('v2-resp-body');
    if (!box) return;
    const client = (state.clientes || []).find((c) => c.id === R.clientId);
    if (!client) { respFechar(); return; }
    const atual = String(client.vendedor_email || '').toLowerCase();

    if (R.escolhido) {
      const u = R.escolhido;
      const mudaUnidade = u.franquia_id && client.franquia_id && u.franquia_id !== client.franquia_id;
      box.innerHTML = `
        <p class="v2-resp-conf">Passar <b>${esc(client.nome || 'o cliente')}</b> para <b>${esc(u.nome)}</b>?</p>
        ${mudaUnidade ? `<p class="v2-resp-aviso">${ic('alert-triangle')}<span>${esc(u.nome)} é de outra unidade (${esc(u.franquia_nome || '—')}). O cliente vai junto para essa unidade.</span></p>` : ''}
        <p class="v2-resp-nota">As propostas e vendas já feitas continuam no nome de quem fez. A troca fica registrada na timeline.</p>
        <div class="v2-resp-acts"><button class="v2-btn2" onclick="uiV2Responsavel.voltar()">Voltar</button><button class="v2-btnp" id="v2-resp-ok" onclick="uiV2Responsavel.confirmar()" ${R.salvando ? 'disabled' : ''}>${ic('check')}${R.salvando ? 'Salvando...' : 'Trocar responsável'}</button></div>`;
    } else {
      const q = R.q.trim().toLowerCase();
      const itens = R.lista.filter((u) => !q || `${u.nome} ${u.email} ${u.franquia_nome || ''}`.toLowerCase().includes(q));
      const papel = { admin: 'Admin', gestor: 'Gestor', vendedor: 'Vendedor' };
      let grupo = null;
      const linhas = itens.map((u) => {
        let h = '';
        if (state.isAdmin && u.franquia_nome !== grupo) { grupo = u.franquia_nome; h += `<div class="v2-resp-grp">${esc(grupo || 'Sem unidade')}</div>`; }
        const eh = String(u.email).toLowerCase() === atual;
        return h + `<button class="v2-resp-item ${eh ? 'on' : ''}" ${eh ? 'disabled' : `onclick="uiV2Responsavel.escolher('${esc(u.email)}')"`}>
          <span class="av">${esc(String(u.nome || u.email).trim().charAt(0).toUpperCase())}</span>
          <span class="tx"><b>${esc(u.nome)}</b><small>${papel[u.role] || esc(u.role)} · ${esc(u.email)}</small></span>
          ${eh ? '<em>atual</em>' : ''}</button>`;
      }).join('');
      box.innerHTML = linhas || `<p class="v2-resp-nota" style="text-align:center;padding:18px 0">Ninguém encontrado.</p>`;
    }
    if (window.lucide) window.lucide.createIcons();
  }

  window.uiV2Responsavel = {
    async abrir(clientId) {
      if (!podeTrocarResp()) return;
      const client = (state.clientes || []).find((c) => c.id === clientId);
      if (!client) return;
      respFechar();
      Object.assign(R, { clientId, lista: [], q: '', escolhido: null, salvando: false });
      const s = document.createElement('div');
      s.id = 'v2-resp-scrim';
      s.innerHTML = `<div class="v2-resp" role="dialog" aria-modal="true" aria-label="Trocar responsável">
        <div class="v2-resp-h"><div><h3>Trocar responsável</h3><small>${esc(client.nome || '')}</small></div><button class="v2-sq" onclick="uiV2Responsavel.fechar()" title="Fechar">${ic('x')}</button></div>
        <label class="v2-sbox v2-resp-busca">${ic('search')}<input id="v2-resp-q" placeholder="Buscar por nome, e-mail${state.isAdmin ? ' ou unidade' : ''}" autocomplete="off" oninput="uiV2Responsavel.buscar(this.value)"></label>
        <div class="v2-resp-body" id="v2-resp-body"><p class="v2-resp-nota" style="text-align:center;padding:18px 0">Carregando...</p></div>
      </div>`;
      s.addEventListener('mousedown', (e) => { if (e.target === s) respFechar(); });
      document.body.appendChild(s);
      if (window.lucide) window.lucide.createIcons();
      setTimeout(() => { const i = document.getElementById('v2-resp-q'); if (i) i.focus(); }, 30);
      const { data, error } = await supabaseClient.rpc('cliente_responsaveis_possiveis', { p_cliente_id: clientId });
      if (R.clientId !== clientId) return;
      if (error) { const b = document.getElementById('v2-resp-body'); if (b) b.innerHTML = `<p class="v2-resp-nota">Não foi possível carregar: ${esc(error.message)}</p>`; return; }
      R.lista = data || [];
      respPintar();
    },
    fechar: respFechar,
    buscar(q) { R.q = q; R.escolhido = null; respPintar(); },
    escolher(email) { R.escolhido = R.lista.find((u) => u.email === email) || null; const b = document.querySelector('.v2-resp-busca'); if (b) b.style.display = 'none'; respPintar(); },
    voltar() { R.escolhido = null; const b = document.querySelector('.v2-resp-busca'); if (b) b.style.display = ''; respPintar(); },
    async confirmar() {
      const u = R.escolhido, clientId = R.clientId;
      if (!u || R.salvando) return;
      R.salvando = true; respPintar();
      const { data, error } = await supabaseClient.rpc('cliente_trocar_responsavel', { p_cliente_id: clientId, p_email: u.email });
      R.salvando = false;
      if (error) { respPintar(); if (has('showToast')) showToast('Não foi possível trocar: ' + error.message); return; }
      const client = (state.clientes || []).find((c) => c.id === clientId);
      if (client && data) { client.vendedor_email = data.vendedor_email; client.franquia_id = data.franquia_id; }
      respFechar();
      if (has('showToast')) showToast(`Responsável agora é ${u.nome}${data && data.mudou_unidade ? ` (cliente foi para ${u.franquia_nome || 'outra unidade'})` : ''}.`);
      if (has('crmFetchAtividades')) crmFetchAtividades(clientId);
      if (has('renderContent')) renderContent();
      if (has('renderCrm360')) renderCrm360();
    },
  };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.getElementById('v2-resp-scrim')) { e.stopPropagation(); respFechar(); } }, true);

  window.uiV2Vistoria = {
    focar() {
      const card = document.getElementById('v2f-vistoria');
      if (!card) { window.uiV2Ficha.irDados('vistoria'); return; } // está na aba Dados
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
    pbParkEmbeddedPanel();
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
    const tabs = [['dados', 'id-card', 'Dados'], ['timeline', 'history', 'Timeline'], ['propostas', 'file-text', 'Propostas', propostas.length]];
    tabs.push(['vendas', 'trophy', 'Vendas', vendas.length], ['financiamento', 'landmark', 'Financ.']);
    if (has('renderCrmArquivosTab')) tabs.push(['arquivos', 'paperclip', 'Arquivos', `<span id="crm360-arq-count">${crmArquivosTabContador(client.id)}</span>`]);
    if (has('renderEngFichaTab')) tabs.push(['engenharia', 'ruler', 'Engenharia']);
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
    // no celular a barra de abas rola de lado: guarda a posição (o innerHTML abaixo zerava)
    const prevTabs = overlay.querySelector('.v2f-tabs');
    const keepX = prevTabs && overlay.dataset.clientId === String(client.id) ? prevTabs.scrollLeft : 0;
    if (fichaDe !== String(client.id)) { fichaDe = String(client.id); expandido = false; }
    const full = cheia();
    overlay.classList.toggle('v2f-cheia', full);

    // linha que substitui etapas + resumo quando o cabeçalho encolhe
    const visTx = vistoriaTexto(VIS().info(client));
    const mini = `<button type="button" class="v2f-mini" onclick="uiV2Ficha.expandir()" title="Mostrar etapas e resumo">
            <span>${lost ? '<b>Perdido</b>' : `Etapa <b>${cur + 1} de ${seq.length}</b>`}</span>
            <span>Resp. <b>${esc(String(vend).split(' ')[0])}</b></span>
            <span class="${proxAtrasada ? 'late' : ''}">Próx. ação <b>${prox ? esc(prox.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })) : 'nenhuma'}</b></span>
            <span>Vistoria <b>${esc(visTx)}</b></span>${ic('chevron-down')}</button>`;

    // campos do cliente (mesmos IDs de crm.js: salvar, máscaras e cidade seguem iguais)
    const camposDados = `
                  ${crm360Field('Nome', `<input id="crm360-nome" value="${esc(client.nome || '')}" class="crm360-input">`, 'span2')}
                  ${crm360Field('Telefone', `<input id="crm360-telefone" value="${esc(client.telefone || '')}" class="crm360-input">`)}
                  ${crm360Field('E-mail', `<input id="crm360-email" type="email" value="${esc(client.email || '')}" class="crm360-input">`)}
                  ${crm360Field('Cidade/UF', `<div class="relative"><input id="crm360-cidade" value="${esc(client.cidade || '')}" class="crm360-input" autocomplete="off"></div>`)}
                  ${crm360Field('CPF/CNPJ', `<input id="crm360-documento" value="${esc(client.documento || '')}" class="crm360-input">`)}
                  ${crm360Field('CEP', `<input id="crm360-cep" value="${esc(client.cep || '')}" class="crm360-input">`)}
                  ${crm360Field('Origem', `<select id="crm360-origem" class="crm360-input">${clientOrigemOptionsHTML(client.origem)}</select>`)}
                  ${crm360Field('Endereço', `<input id="crm360-endereco" value="${esc(client.endereco || '')}" class="crm360-input">`, 'span2')}
                  ${crm360Field('Número', `<input id="crm360-numero" value="${esc(client.numero || '')}" class="crm360-input">`)}
                  ${crm360Field('Bairro', `<input id="crm360-bairro" value="${esc(client.bairro || '')}" class="crm360-input">`)}
                  ${crm360CamposDocumentosHTML(client)}
                  ${crm360Field('Observações', `<textarea id="crm360-observacoes" rows="3" class="crm360-input">${esc(client.observacoes || '')}</textarea>`, 'full')}`;
    const cardProx = `
              <div class="v2f-card v2f-proxcard">
                <h3>${ic('alarm-clock')}Próxima ação</h3>
                <div class="v2f-fields">
                  ${crm360Field('Quando', `<input id="crm360-proxima-em" type="datetime-local" value="${toLocalDatetimeInputValue(client.proxima_acao_em)}" class="crm360-input">`)}
                  ${crm360Field('O que fazer', `<input id="crm360-proxima-nota" value="${esc(client.proxima_acao_nota || '')}" class="crm360-input" placeholder="Ex.: ligar para follow-up">`)}
                </div>
              </div>`;
    const btnSalvar = `<button onclick="crmSaveClient360()" id="crm360-save-btn" class="v2f-save">${ic('save')}Salvar alterações</button>`;
    // os dados do cliente ficam na aba "Dados"; as outras abas usam a largura toda
    const grade = _crm360Tab === 'dados'
      ? `<div class="v2f-dadosaba">
            ${leadMetaCardHTML(client)}
            <div class="v2f-card"><h3>${ic('user-cog')}Contato e endereço</h3><div class="v2f-fields v2f-fields4">${camposDados}
            </div></div>
            <div class="v2f-dadosrow">${cardProx}${vistoriaCardHTML(client)}</div>
            <div class="v2f-savebar">${btnSalvar}</div>
          </div>`
      : `<div class="v2f-grid larga"><div class="v2f-card v2f-tabbody"><div id="crm360-tab-content">${renderCrm360TabContent(client, propostas, vendas)}</div></div></div>`;

    overlay.innerHTML = `
      <div class="v2f">
        <div class="v2f-head">
          <div class="v2f-top">
            ${(() => { const pj = window.uiV2TipoCliente && window.uiV2TipoCliente(client) === 'PJ'; return `<i class="v2f-av ${pj ? 'pj' : ''}" title="${pj ? 'Empresa' : 'Pessoa física'}">${ic(pj ? 'building-2' : 'user')}</i>`; })()}
            <div class="tx">
              <h2><span class="v2f-nome">${esc(client.nome || 'Cliente')}</span>
                <button class="v2-chip dot ${ST_CLS[status] || 't-gray'} v2f-stchip" onclick="openClientStatusMenu(event, '${esc(client.id)}')" title="Alterar status">${ST[status] || status}${ic('chevron-down')}</button>
                ${omFlag ? '<span class="v2-chip t-blue">O&amp;M</span>' : ''}${has('engFichaChip') ? engFichaChip(client) : ''}${window.uiV2LeadMeta ? window.uiV2LeadMeta.chip(client, true) : ''}</h2>
              <div class="sub">
                <span>${ic('phone')}${esc(client.telefone || '—')}</span>
                <span>${ic('map-pin')}${esc(client.cidade || 'sem cidade')}${Number(client.hsp) > 0 ? ` · HSP ${esc(String(client.hsp).replace('.', ','))}` : ''}</span>
                <span class="v2f-dsk">${ic('calendar')}desde ${esc(formatDate(client.created_at))}</span>
              </div>
              ${has('etqFichaHTML') ? etqFichaHTML(client) : ''}
              ${lost && client.perdido_motivo ? `<div class="v2f-lost">${ic('info')}Motivo da perda: ${esc(client.perdido_motivo)}</div>` : ''}
            </div>
            <button class="v2-sq v2f-mob" onclick="closeCrm360()" title="Fechar">${ic('x')}</button>
            <div class="v2f-acts">
              ${podeProposta ? `<button class="btn btn-primary btn-sm" onclick="openProposalBuilder('${esc(client.id)}')">${ic('file-plus-2')}Nova proposta</button>` : ''}
              ${waLink ? `<a class="v2f-wa" href="${esc(waLink)}" target="_blank" rel="noopener noreferrer">${ic('message-circle')}WhatsApp</a>` : ''}
              ${tel ? `<a class="v2-sq" href="tel:+55${tel}" title="Ligar">${ic('phone')}</a>` : ''}
              ${docs ? `<button class="v2-sq v2f-dsk" onclick="abrirDocumentosCliente('${esc(client.id)}')" title="Contrato e procuração">${ic('file-signature')}</button>` : ''}
              <button class="v2-sq v2f-dsk" onclick="openFechaVenda('${esc(client.id)}')" title="Registrar venda">${ic('trophy')}</button>
              <div class="crm-menu v2f-mob">
                <button type="button" class="v2-sq" title="Mais ações" onclick="crmMenuToggle(event, this)">${ic('ellipsis')}</button>
                <div class="crm-menu-pop">
                  ${docs ? `<button type="button" onclick="crmMenuFechar(); abrirDocumentosCliente('${esc(client.id)}')">${ic('file-signature')}Contrato e procuração</button>` : ''}
                  <button type="button" onclick="crmMenuFechar(); openFechaVenda('${esc(client.id)}')">${ic('trophy')}Registrar venda</button>
                </div>
              </div>
              <button class="v2-sq v2f-exp" onclick="uiV2Ficha.cheia()" title="${full ? 'Voltar ao painel lateral' : 'Abrir em tela cheia'}">${ic(full ? 'minimize-2' : 'maximize-2')}</button>
              <button class="v2-sq v2f-dsk" onclick="closeCrm360()" title="Fechar (Esc)">${ic('x')}</button>
            </div>
          </div>
          <div class="v2f-steps">${steps}</div>
          <div class="v2f-sum">
            <div><small>Origem</small><b>${esc(origemLbl)}</b></div>
            ${podeTrocarResp() ? `<div class="v2f-sumresp" role="button" tabindex="0" onclick="uiV2Responsavel.abrir('${esc(client.id)}')" onkeydown="if(event.key==='Enter')uiV2Responsavel.abrir('${esc(client.id)}')" title="Trocar responsável"><small>Responsável</small><b>${esc(vend)}${ic('chevron-down')}</b></div>` : `<div><small>Responsável</small><b>${esc(vend)}</b></div>`}
            <div><small>Propostas</small><b>${propostas.length}${vendas.length ? ` · ${vendas.length} venda${vendas.length > 1 ? 's' : ''}` : ''}</b></div>
            <div class="v2f-sumlink ${proxAtrasada ? 'late' : ''}" role="button" tabindex="0" onclick="uiV2Ficha.irDados('proxima')" title="Ver próxima ação"><small>Próxima ação</small><b>${prox ? esc(prox.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' + prox.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })) : 'Nenhuma'}</b></div>
            ${vistoriaResumoHTML(client)}
            <div class="v2f-mob"><small>Desde</small><b>${esc(formatDate(client.created_at))}</b></div>
          </div>
          ${mini}
          <div class="v2f-tabs">${tabs.map((t) => `<button class="${t[4] || ''} ${_crm360Tab === t[0] ? 'on' : ''}" onclick="crmSet360Tab('${t[0]}')">${ic(t[1])}${t[2]}${t[3] != null ? `<em>${t[3]}</em>` : ''}</button>`).join('')}</div>
        </div>

        <div id="crm360-scroll" class="v2f-body">
          ${grade}
        </div>
      </div>`;

    // mesmo pós-render de crm.js
    // (os campos só existem na aba "Dados")
    const cidadeInput = document.getElementById('crm360-cidade');
    if (cidadeInput && has('attachCidadeAutocomplete')) attachCidadeAutocomplete(cidadeInput, (mun) => { _crm360Cidade = mun; });
    // observações crescem com o texto (sem ficar arrastando o canto da caixa)
    const obs = document.getElementById('crm360-observacoes');
    if (obs) {
      const ajustar = () => { obs.style.height = 'auto'; obs.style.height = `${obs.scrollHeight + 2}px`; };
      obs.addEventListener('input', ajustar);
      requestAnimationFrame(ajustar);
    }
    const telInput = document.getElementById('crm360-telefone');
    if (telInput && has('formatarTelefone')) telInput.addEventListener('input', formatarTelefone);
    if (has('ligarMascara')) {
      const docInput = document.getElementById('crm360-documento');
      const cepInput = document.getElementById('crm360-cep');
      if (docInput) ligarMascara(docInput, 'auto');
      if (cepInput) ligarMascara(cepInput, 'cep');
    }
    if (_crm360Tab === 'financiamento' && has('renderFinanciamento')) renderFinanciamento();
    if (_crm360Tab === 'propostas' && state.isAdmin && has('preencherSelosPrecificacao')) preencherSelosPrecificacao();

    if (window.lucide) window.lucide.createIcons();
    overlay.dataset.clientId = String(client.id);
    const sc = document.getElementById('crm360-scroll');
    if (sc && keepY) sc.scrollTop = keepY;
    const tabsEl = overlay.querySelector('.v2f-tabs');
    if (tabsEl) {
      tabsEl.scrollLeft = keepX;
      // aba ativa fora da área visível (ex.: aberta por atalho): traz pra dentro sem mexer no resto
      const on = tabsEl.querySelector('button.on');
      if (on) {
        const r = on.getBoundingClientRect(), t = tabsEl.getBoundingClientRect();
        if (r.left < t.left) tabsEl.scrollLeft -= t.left - r.left + 16;
        else if (r.right > t.right) tabsEl.scrollLeft += r.right - t.right + 16;
      }
    }
    if (sc) sc.addEventListener('scroll', ajustarCabecalho, { passive: true });
    ajustarCabecalho();
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
