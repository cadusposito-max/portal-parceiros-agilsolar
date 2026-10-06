// ==========================================
// LEADS DO META: avisos pro vendedor
// ==========================================
// Três jeitos de o vendedor saber que recebeu lead (o push do celular é a
// edge function meta-leads que manda; aqui é o que acontece na plataforma):
//   1. Pedido pra ativar as notificações — só pra quem está no rodízio
//      (meta_leads_rodizio) e ainda não ativou neste aparelho. No iPhone fora
//      do app instalado, explica como instalar (é o único jeito de ter push).
//   2. Contador na aba Clientes + faixa no topo: leads do Meta dele ainda sem
//      contato (mesma regra do selo laranja: uiV2LeadMeta.info).
//   3. Alerta com som quando o lead chega com a plataforma aberta (Realtime:
//      INSERT em clientes com vendedor_email = o próprio).
//
// Depende de: config.js (state, supabaseClient), push.js (pushIsSupported,
// pushInit, pushRequestPermissionAndSubscribe), ui-v2-screens.js
// (uiV2LeadMeta, uiV2Screens), clientes.js (buildClientWhatsappLink),
// crm.js (openCrm360), app.js (renderContent, setTab), utils.js (escapeHTML, showToast).

(function () {
  const LS_ADIADO = 'lm_push_adiado_ate';
  const ADIAR_AGORA_NAO_MS = 24 * 3600 * 1000;
  const ADIAR_BLOQUEADO_MS = 7 * 24 * 3600 * 1000;

  let iniciado = false;
  let noRodizio = false;
  let precisaPush = null;  // null | 'ativar' | 'reativar' | 'ios' | 'bloqueado'
  let faixaFechada = false; // por sessão
  let canal = null;

  const has = (fn) => typeof window[fn] === 'function';
  const esc = (s) => (has('escapeHTML') ? escapeHTML(String(s ?? '')) : String(s ?? ''));
  const ic = (n) => `<i data-lucide="${n}"></i>`;
  const meuEmail = () => String(state.currentUser?.email || '').toLowerCase();

  function lsGet(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (_) { /* sem storage: só não lembra */ } }
  const adiado = () => Number(lsGet(LS_ADIADO) || 0) > Date.now();
  const adiar = (ms) => lsSet(LS_ADIADO, String(Date.now() + ms));

  // ---- leads do Meta deste vendedor ainda sem contato ---------------------
  function pendentes() {
    const eu = meuEmail();
    if (!eu || !window.uiV2LeadMeta) return [];
    return (state.clientes || []).filter((c) => c.origem === 'meta'
      && String(c.vendedor_email || '').toLowerCase() === eu
      && (window.uiV2LeadMeta.info(c) || {}).semContato);
  }

  // ---- 1. notificações ---------------------------------------------------
  const ehIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const instalado = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

  async function avaliarPush() {
    precisaPush = null;
    if (!noRodizio || adiado()) return;
    if (ehIOS() && !instalado()) { precisaPush = 'ios'; return; }
    if (!has('pushIsSupported') || !pushIsSupported()) return;
    if (Notification.permission === 'denied') { precisaPush = 'bloqueado'; return; }
    if (Notification.permission === 'default') { precisaPush = 'ativar'; return; }
    // permitido, mas sem inscrição neste aparelho (ex.: limpou o navegador)
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (!sub) precisaPush = 'reativar';
    } catch (_) { /* sem SW: não insiste */ }
  }

  function avisoPushHTML() {
    if (!precisaPush) return '';
    const corpo = {
      ativar: 'Ative as notificações pra saber na hora que um lead chegar pra você.',
      reativar: 'As notificações deste aparelho estão desligadas. Ative de novo pra receber os leads na hora.',
      ios: 'No iPhone, as notificações só funcionam com a plataforma instalada: toque em Compartilhar e depois em "Adicionar à Tela de Início". Abra pelo ícone novo e ative por lá.',
      bloqueado: 'As notificações estão bloqueadas neste navegador. Libere nas configurações do site (o cadeado ao lado do endereço) pra receber os leads na hora.',
    }[precisaPush];
    const podeAtivar = precisaPush === 'ativar' || precisaPush === 'reativar';
    return `<div class="lm-aviso lm-push">
        <i class="lm-ic">${ic('bell-ring')}</i>
        <div class="tx"><b>Você recebe leads do Meta</b><span>${corpo}</span>
          <div class="acts">${podeAtivar ? `<button type="button" class="lm-pri" data-lm="ativar">Ativar notificações</button>` : ''}
            <button type="button" data-lm="adiar">${podeAtivar ? 'Agora não' : 'Entendi'}</button></div>
        </div>
      </div>`;
  }

  async function ativarPush(btn) {
    if (btn) { btn.disabled = true; btn.textContent = 'Ativando…'; }
    const r = has('pushRequestPermissionAndSubscribe') ? await pushRequestPermissionAndSubscribe() : { ok: false };
    if (r.ok) {
      precisaPush = null;
      if (has('showToast')) showToast('NOTIFICAÇÕES ATIVADAS! VOCÊ VAI SER AVISADO DOS LEADS');
    } else if (r.reason === 'denied') {
      precisaPush = 'bloqueado';
    } else {
      // o motivo aparece no aviso: o vendedor manda print e dá pra saber onde travou
      const motivo = { sw_not_registered: 'serviço de notificação não iniciou', unsupported: 'navegador sem suporte', save_failed: 'não salvou no servidor', subscribe_failed: 'o navegador recusou a inscrição' }[r.reason] || r.reason || 'erro desconhecido';
      console.error('[leads-meta-avisos] ativar push:', r);
      if (has('showToast')) showToast(`Não foi possível ativar as notificações (${motivo}).`);
    }
    pintarAvisos();
  }

  // ---- 2. faixa + contador -------------------------------------------------
  function faixaHTML(n) {
    if (!n || faixaFechada) return '';
    if (state.activeTab === 'clientes' && window.uiV2Screens && window.uiV2Screens.soLeadMeta) return '';
    return `<div class="lm-aviso lm-faixa">
        <i class="lm-ic">${ic('megaphone')}</i>
        <div class="tx"><b>Você tem ${n} lead${n > 1 ? 's' : ''} do Meta esperando contato</b></div>
        <button type="button" class="lm-pri" data-lm="ver">Ver leads</button>
        <button type="button" class="lm-x" data-lm="fechar" title="Fechar">${ic('x')}</button>
      </div>`;
  }

  function pintarAvisos() {
    const box = document.getElementById('main-container');
    let el = document.getElementById('lm-avisos');
    const html = state.environment === 'comercial' ? avisoPushHTML() + faixaHTML(pendentes().length) : '';
    if (!html || !box) { if (el) el.remove(); return; }
    if (!el || el.parentElement !== box) {
      if (el) el.remove();
      el = document.createElement('div');
      el.id = 'lm-avisos';
      el.addEventListener('click', onClickAviso);
    }
    if (box.firstElementChild !== el) box.prepend(el);
    if (el.innerHTML !== html) {
      el.innerHTML = html;
      if (window.lucide) window.lucide.createIcons();
    }
  }

  function pintarContador() {
    const n = state.environment === 'comercial' ? pendentes().length : 0;
    document.querySelectorAll('[data-v2="tab"][data-tab="clientes"]').forEach((b) => {
      let c = b.querySelector('.lm-cnt');
      if (!n) { if (c) c.remove(); return; }
      if (!c) { c = document.createElement('em'); c.className = 'lm-cnt'; b.appendChild(c); }
      c.textContent = n > 99 ? '99+' : String(n);
      c.title = `${n} lead${n > 1 ? 's' : ''} do Meta sem contato`;
    });
  }

  function verLeads() {
    if (window.uiV2Screens) window.uiV2Screens.soLeadMeta = true;
    if (state.isAdmin) { if (has('ensureAdminClientesFiltersState')) ensureAdminClientesFiltersState(); state.adminClientesFilters.status = 'TODOS'; }
    else state.clienteFilter = 'TODOS';
    if (state.activeTab !== 'clientes' && has('setTab')) setTab('clientes');
    else if (has('renderContent')) renderContent();
  }

  function onClickAviso(ev) {
    const b = ev.target.closest('[data-lm]');
    if (!b) return;
    const a = b.dataset.lm;
    if (a === 'ativar') ativarPush(b);
    else if (a === 'adiar') { adiar(precisaPush === 'bloqueado' || precisaPush === 'ios' ? ADIAR_BLOQUEADO_MS : ADIAR_AGORA_NAO_MS); precisaPush = null; pintarAvisos(); }
    else if (a === 'ver') verLeads();
    else if (a === 'fechar') { faixaFechada = true; pintarAvisos(); }
  }

  // ---- 3. alerta quando o lead chega ----------------------------------------
  function tocarSom() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      [[880, 0], [1320, 0.16]].forEach(([freq, t0]) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, ctx.currentTime + t0);
        g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + t0 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t0 + 0.35);
        o.connect(g).connect(ctx.destination);
        o.start(ctx.currentTime + t0); o.stop(ctx.currentTime + t0 + 0.4);
      });
      setTimeout(() => ctx.close(), 900);
    } catch (_) { /* sem áudio liberado: fica só o visual */ }
  }

  function resumoLead(c) {
    const q = c.lead_meta && Array.isArray(c.lead_meta.perguntas) ? c.lead_meta.perguntas[0] : null;
    const extra = q ? (/conta/i.test(q.p) ? `conta de ${q.r}` : q.r) : '';
    return [c.cidade ? c.cidade.charAt(0) + c.cidade.slice(1).toLowerCase() : '', extra].filter(Boolean).join(' · ');
  }

  function mostrarAlerta(c) {
    let el = document.getElementById('lm-alerta');
    if (!el) {
      el = document.createElement('div');
      el.id = 'lm-alerta';
      el.setAttribute('role', 'alert');
      el.addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-lm]');
        if (!b) return;
        const id = el.dataset.cliente;
        if (b.dataset.lm === 'ficha' && id && has('openCrm360')) openCrm360(id);
        if (b.dataset.lm !== 'wa') el.classList.remove('on');
      });
      document.body.appendChild(el);
    }
    const wa = has('buildClientWhatsappLink') ? buildClientWhatsappLink(c) : '';
    el.dataset.cliente = c.id;
    el.innerHTML = `
      <div class="hd"><span class="lm-chip">${ic('megaphone')}Novo lead do Meta</span><small>agora</small><button type="button" class="lm-x" data-lm="fechar" title="Fechar">${ic('x')}</button></div>
      <b class="nm">${esc(c.nome || 'Novo contato')}</b>
      ${resumoLead(c) ? `<span class="sub">${esc(resumoLead(c))}</span>` : ''}
      <div class="acts">
        ${wa ? `<a class="lm-wa" data-lm="wa" href="${esc(wa)}" target="_blank" rel="noopener noreferrer">${ic('message-circle')}Chamar no WhatsApp</a>` : ''}
        <button type="button" data-lm="ficha">Abrir ficha</button>
      </div>`;
    if (window.lucide) window.lucide.createIcons();
    requestAnimationFrame(() => el.classList.add('on'));
    tocarSom();
  }

  function onNovoCliente(payload) {
    const c = payload && payload.new;
    if (!c || c.origem !== 'meta' || String(c.vendedor_email || '').toLowerCase() !== meuEmail()) return;
    if (!Array.isArray(state.clientes)) state.clientes = [];
    if (!state.clientes.some((x) => String(x.id) === String(c.id))) state.clientes.unshift(c);
    mostrarAlerta(c);
    pintarContador();
    // redesenha a lista só se ninguém estiver digitando nem com a ficha aberta
    const ocupado = document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    const fichaAberta = document.getElementById('crm360-overlay')?.classList.contains('is-open');
    if (['clientes', 'funil', 'dashboard'].includes(state.activeTab) && state.environment === 'comercial' && !ocupado && !fichaAberta && has('renderContent')) renderContent();
    else pintarAvisos();
  }

  function escutar() {
    if (canal || !meuEmail() || typeof supabaseClient === 'undefined') return;
    canal = supabaseClient
      .channel(`leads-meta-${state.currentUser.id || meuEmail()}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'clientes', filter: `vendedor_email=eq.${meuEmail()}` }, onNovoCliente)
      .subscribe();
  }

  // ---- início (depois que os clientes carregam) -----------------------------
  async function iniciar() {
    if (iniciado || !state.currentUser) return;
    iniciado = true;
    try {
      const { data } = await supabaseClient.from('meta_leads_rodizio').select('id')
        .eq('ativo', true).eq('vendedor_email', meuEmail()).limit(1);
      noRodizio = Array.isArray(data) && data.length > 0;
    } catch (_) { noRodizio = false; }
    if (noRodizio && has('pushInit')) { try { await pushInit(); } catch (_) { /* segue sem push */ } }
    await avaliarPush();
    escutar();
    atualizar();
  }

  function atualizar() {
    if (!state.currentUser) return;
    pintarAvisos();
    pintarContador();
  }

  // ganchos: clientes carregados (login/refresh) e cada redesenho de tela
  if (has('fetchClientes')) {
    const _fetchClientes = fetchClientes;
    fetchClientes = async function () {
      const r = await _fetchClientes.apply(this, arguments);
      try { if (!iniciado) await iniciar(); else atualizar(); } catch (e) { console.warn('[leads-meta-avisos]', e); }
      return r;
    };
  }
  if (has('renderContent')) {
    const _renderContent = renderContent;
    renderContent = function () {
      const r = _renderContent.apply(this, arguments);
      try { atualizar(); } catch (e) { console.warn('[leads-meta-avisos]', e); }
      return r;
    };
  }
  // o menu é recriado pelo shell (ui-v2-shell.js): repõe o contador
  const obs = new MutationObserver(() => pintarContador());
  ['v2-side', 'v2-mnav', 'v2-more-grid'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) obs.observe(el, { childList: true });
  });

  window.leadsMetaAvisos = { atualizar, pendentes, mostrarAlerta };
})();
