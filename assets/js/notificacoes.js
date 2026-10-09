// ==========================================
// NOTIFICAÇÕES: sininho do topo
// ==========================================
// Lista o que o banco gravou em `notificacoes` (só as do usuário, pela RLS) e
// acompanha por Realtime. Quem decide QUEM recebe e O QUE é o banco
// (public.notificar + gatilhos, migration 20261007_notificacoes); aqui é só a
// tela: contador no sino, lista com Não lidas/Todas, abrir o lugar certo.
//
// Regras para não virar ruído:
//   * aviso que chega com a plataforma aberta só aparece em destaque quando é
//     urgente (proposta aberta, OS). Lead novo já tem o alerta próprio
//     (leads-meta-avisos.js); o resto fica só no contador;
//   * o chat continua com o ícone dele, fora do sininho.
//
// Push do celular: clique em "/index.html#notif/<id>" (edge enviar-push) abre
// a notificação aqui. Se a migration não rodou, o sino nem aparece.
//
// Depende de: config.js (state, supabaseClient), utils.js (escapeHTML,
// showToast), crm.js (openCrm360), app.js (setEnvironment, setTab),
// eng-v2.js (EV), om-os.js (omOsAbrir), dashboard.js / api.js (comunicados),
// push.js (pushIsSupported, pushRequestPermissionAndSubscribe).

(function () {
  const has = (fn) => typeof window[fn] === 'function';
  const esc = (s) => (has('escapeHTML') ? escapeHTML(String(s ?? '')) : String(s ?? ''));
  const ic = (n) => `<i data-lucide="${n}"></i>`;
  const icones = () => { if (window.lucide) window.lucide.createIcons(); };

  // tipo -> [ícone, tom]
  const TIPOS = {
    lead_novo: ['megaphone', 'or'],
    proposta_vista: ['eye', 'bl'],
    eng: ['hard-hat', 'pu'],
    eng_enviado: ['inbox', 'pu'],
    os: ['wrench', 'gr'],
    comunicado: ['newspaper', 'gy'],
    // tarefas internas (tarefas.js)
    tarefa: ['list-checks', 'or'],
    tarefa_feita: ['circle-check', 'gr'],
    tarefa_cm: ['message-square', 'bl'],
    tarefa_prazo: ['clock', 'or'],
    tarefa_atrasada: ['alarm-clock', 'or'],
  };
  const EM_DESTAQUE = new Set(['proposta_vista', 'os']);

  const N = { lista: [], pronto: false, semTabela: false, aba: 'nl', canal: null, uid: null };

  const naoLidas = () => N.lista.filter((n) => !n.lida_em).length;

  function quando(iso) {
    const d = new Date(iso);
    const min = Math.round((Date.now() - d.getTime()) / 60000);
    if (min < 1) return 'agora';
    if (min < 60) return `${min} min`;
    const h = Math.round(min / 60);
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    if (d >= hoje) return `${h} h`;
    const ontem = new Date(hoje); ontem.setDate(ontem.getDate() - 1);
    if (d >= ontem) return 'ontem';
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  }

  // ---- dados --------------------------------------------------------------
  async function carregar() {
    const { data, error } = await supabaseClient.from('notificacoes')
      .select('id,tipo,titulo,corpo,alvo,qtd,lida_em,atualizada_em')
      .order('atualizada_em', { ascending: false }).limit(40);
    if (error) {
      // tabela ainda não existe (migration pendente): some com o sino
      N.semTabela = /PGRST20|42P01|does not exist|schema cache/i.test(`${error.code} ${error.message}`);
      console.warn('[notificacoes] indisponível:', error.message);
      pintarSino();
      return;
    }
    N.lista = data || [];
    N.pronto = true;
    pintarSino();
    repintarPop();
    abrirDoHash();
  }

  function escutar() {
    if (N.canal || !N.uid) return;
    N.canal = supabaseClient.channel(`notif-${N.uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notificacoes', filter: `user_id=eq.${N.uid}` }, onMudanca)
      .subscribe();
  }

  function onMudanca(payload) {
    const ev = payload.eventType;
    if (ev === 'DELETE') {
      const id = payload.old && payload.old.id;
      N.lista = N.lista.filter((n) => n.id !== id);
    } else {
      const n = payload.new;
      if (!n || !n.id) return;
      const antes = N.lista.find((x) => x.id === n.id);
      N.lista = [n, ...N.lista.filter((x) => x.id !== n.id)]
        .sort((a, b) => new Date(b.atualizada_em) - new Date(a.atualizada_em)).slice(0, 60);
      const novidade = !n.lida_em && (ev === 'INSERT' || (antes && n.atualizada_em !== antes.atualizada_em));
      if (novidade && EM_DESTAQUE.has(n.tipo)) mostrarDestaque(n);
    }
    pintarSino();
    repintarPop();
  }

  async function marcarLidas(ids) {
    const alvo = ids.filter((id) => N.lista.some((n) => n.id === id && !n.lida_em));
    if (!alvo.length) return;
    const agora = new Date().toISOString();
    N.lista.forEach((n) => { if (alvo.includes(n.id)) n.lida_em = agora; });
    pintarSino(); repintarPop();
    const { error } = await supabaseClient.rpc('notif_marcar_lidas', { p_ids: alvo });
    if (error) console.warn('[notificacoes] marcar lida:', error.message);
  }

  async function marcarTodas() {
    const agora = new Date().toISOString();
    N.lista.forEach((n) => { if (!n.lida_em) n.lida_em = agora; });
    pintarSino(); repintarPop();
    const { error } = await supabaseClient.rpc('notif_marcar_todas');
    if (error) console.warn('[notificacoes] marcar todas:', error.message);
  }

  // ---- abrir o lugar certo --------------------------------------------------
  async function abrirAlvo(a) {
    a = a || {};
    try {
      if (a.tela === 'cliente' && a.id) {
        if (state.environment !== 'comercial' && has('setEnvironment')) setEnvironment('comercial');
        if (!(state.clientes || []).some((c) => String(c.id) === String(a.id))) {
          const { data } = await supabaseClient.from('clientes').select('*').eq('id', a.id).maybeSingle();
          if (!data) { if (has('showToast')) showToast('Esse cliente não está mais disponível para você.'); return; }
          if (!Array.isArray(state.clientes)) state.clientes = [];
          state.clientes.unshift(data);
        }
        if (has('openCrm360')) openCrm360(a.id, a.aba);
      } else if (a.tela === 'eng' && a.id) {
        if (state.canEng && has('setEnvironment') && window.EV) {
          setEnvironment('engenharia');
          window.EV.abrir(a.id);
        } else if (a.cliente) {
          abrirAlvo({ tela: 'cliente', id: a.cliente, aba: 'engenharia' });
        }
      } else if (a.tela === 'os' && a.id) {
        if (state.environment !== 'om' && has('setEnvironment')) setEnvironment('om');
        if (has('omOsAbrir')) omOsAbrir(a.id);
        if (has('setTab')) setTab('os');
      } else if (a.tela === 'comunicado' && a.id) {
        if (has('fetchComunicados')) await fetchComunicados();
        if (has('openDashComunicadoModalById')) openDashComunicadoModalById(encodeURIComponent(a.id));
      } else if (a.tela === 'tarefa' && a.id) {
        if (has('tarefasAbrir')) tarefasAbrir(a.id);
      } else if (a.tela === 'propostas') {
        if (state.environment !== 'comercial' && has('setEnvironment')) setEnvironment('comercial');
        if (has('setTab')) setTab('propostas');
      }
    } catch (e) {
      console.error('[notificacoes] abrir', e);
    }
  }

  async function abrirNotificacao(id) {
    let n = N.lista.find((x) => x.id === id);
    if (!n) {
      // mais antiga que a lista carregada (veio do push)
      const { data } = await supabaseClient.from('notificacoes')
        .select('id,tipo,titulo,corpo,alvo,qtd,lida_em,atualizada_em').eq('id', id).maybeSingle();
      if (!data) return;
      n = data;
      N.lista.push(n);
    }
    fecharPop();
    esconderDestaque();
    marcarLidas([id]);
    abrirAlvo(n.alvo);
  }

  // clique no push do celular: "#notif/<id>"
  function abrirDoHash() {
    const m = String(window.location.hash || '').match(/^#notif\/([0-9a-f-]{36})$/i);
    if (!m || !N.pronto) return;
    try { history.replaceState(history.state, '', window.location.pathname + window.location.search); } catch (_) { /* segue */ }
    if (has('appRouteSync')) appRouteSync(false);
    abrirNotificacao(m[1]);
  }
  window.addEventListener('hashchange', abrirDoHash);

  // ---- sino no topo -----------------------------------------------------------
  // O botão é desenhado pelo ui-v2-shell.js (data-v2="notif"); aqui só o
  // contador e o "esconder se não há tabela".
  function pintarSino() {
    const n = naoLidas();
    document.querySelectorAll('[data-v2="notif"]').forEach((b) => {
      b.hidden = N.semTabela;
      let c = b.querySelector('.cnt');
      if (!n) { if (c) c.remove(); }
      else {
        if (!c) { c = document.createElement('span'); c.className = 'cnt'; b.appendChild(c); }
        c.textContent = n > 99 ? '99+' : String(n);
      }
      b.title = n ? `Notificações (${n} não lida${n > 1 ? 's' : ''})` : 'Notificações';
    });
  }

  // ---- painel -------------------------------------------------------------------
  function itemHTML(n) {
    const [icone, tom] = TIPOS[n.tipo] || ['bell', 'gy'];
    return `<button type="button" class="nt-item ${n.lida_em ? '' : 'nova'}" data-nt="abrir" data-id="${esc(n.id)}">
        <span class="nt-ic ${tom}">${ic(icone)}</span>
        <span class="nt-tx"><b>${esc(n.titulo)}</b>${n.corpo ? `<small>${esc(n.corpo)}</small>` : ''}</span>
        <span class="nt-lado"><time>${quando(n.atualizada_em)}</time>${n.lida_em ? '' : '<i class="nt-dot" aria-label="não lida"></i>'}</span>
      </button>`;
  }

  function rodapePushHTML() {
    if (!has('pushIsSupported')) return '';
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const instalado = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    if (ios && !instalado) return '<div class="nt-push">Para receber avisos no iPhone, adicione a plataforma à Tela de Início e abra pelo ícone.</div>';
    if (!pushIsSupported()) return '';
    if (Notification.permission === 'granted') return `<div class="nt-push ok">${ic('smartphone')}Avisos urgentes chegam neste aparelho</div>`;
    if (Notification.permission === 'denied') return '<div class="nt-push">Os avisos estão bloqueados neste navegador. Libere no cadeado ao lado do endereço.</div>';
    return `<div class="nt-push">${ic('smartphone')}<span>Receba lead e proposta aberta mesmo com a plataforma fechada.</span><button type="button" data-nt="push">Ativar</button></div>`;
  }

  function popHTML() {
    const n = naoLidas();
    const lista = N.aba === 'nl' ? N.lista.filter((x) => !x.lida_em) : N.lista;
    const corpo = lista.length ? lista.map(itemHTML).join('')
      : `<div class="nt-vazio">${ic('circle-check')}<b>Tudo em dia</b><span>${N.aba === 'nl' ? 'Nenhuma notificação nova.' : 'Nenhuma notificação por aqui.'}</span></div>`;
    return `<div class="nt-hd"><h6>Notificações</h6>
        <div class="nt-abas" role="tablist">
          <button type="button" role="tab" class="${N.aba === 'nl' ? 'on' : ''}" data-nt="aba" data-aba="nl">Não lidas${n ? ` <em>${n}</em>` : ''}</button>
          <button type="button" role="tab" class="${N.aba === 'td' ? 'on' : ''}" data-nt="aba" data-aba="td">Todas</button>
        </div></div>
      <div class="nt-lista">${corpo}</div>
      <div class="nt-ft">${n ? `<button type="button" data-nt="todas">${ic('check-check')}Marcar todas como lidas</button>` : ''}${rodapePushHTML()}</div>`;
  }

  function repintarPop() {
    const pop = document.getElementById('nt-pop');
    if (!pop) return;
    const y = (pop.querySelector('.nt-lista') || {}).scrollTop || 0;
    pop.innerHTML = popHTML();
    const l = pop.querySelector('.nt-lista'); if (l) l.scrollTop = y;
    icones();
  }

  function fecharPop() {
    document.getElementById('nt-pop')?.remove();
    document.querySelectorAll('[data-v2="notif"]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
  }

  function notifAbrir(botao) {
    if (document.getElementById('nt-pop')) { fecharPop(); return; }
    if (has('ajudaFechar')) ajudaFechar();
    N.aba = naoLidas() ? 'nl' : 'td';
    const pop = document.createElement('div');
    pop.id = 'nt-pop';
    pop.className = 'nt-pop';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', 'Notificações');
    pop.innerHTML = popHTML();
    document.body.appendChild(pop);
    icones();
    const alvo = botao || document.querySelector('#v2-top [data-v2="notif"]');
    if (alvo && window.innerWidth > 760) {
      const r = alvo.getBoundingClientRect();
      pop.style.top = r.bottom + 8 + 'px';
      pop.style.left = Math.max(12, Math.min(r.right - pop.offsetWidth, window.innerWidth - pop.offsetWidth - 12)) + 'px';
    } else {
      pop.classList.add('nt-folha');
    }
    alvo?.setAttribute('aria-expanded', 'true');
    pop.addEventListener('click', onClickPop);
    if (typeof captureEvent === 'function') captureEvent('notificacoes_aberto', { nao_lidas: naoLidas() });
  }

  async function onClickPop(e) {
    const b = e.target.closest('[data-nt]');
    if (!b) return;
    const a = b.dataset.nt;
    if (a === 'abrir') abrirNotificacao(b.dataset.id);
    else if (a === 'aba') { N.aba = b.dataset.aba; repintarPop(); }
    else if (a === 'todas') marcarTodas();
    else if (a === 'push') {
      b.disabled = true; b.textContent = 'Ativando…';
      const r = has('pushRequestPermissionAndSubscribe') ? await pushRequestPermissionAndSubscribe() : { ok: false };
      if (has('showToast')) showToast(r.ok ? 'Avisos ativados neste aparelho' : 'Não foi possível ativar os avisos neste aparelho.');
      repintarPop();
    }
  }

  document.addEventListener('click', (e) => {
    const pop = document.getElementById('nt-pop');
    // composedPath: o clique numa aba redesenha o painel e o alvo sai do DOM
    if (pop && !e.composedPath().includes(pop) && !e.target.closest('[data-v2="notif"]')) fecharPop();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fecharPop(); });
  window.addEventListener('resize', fecharPop);

  // ---- destaque (só urgentes, com a plataforma aberta) ----------------------------
  let timerDestaque = null;
  function esconderDestaque() {
    const el = document.getElementById('nt-destaque');
    if (el) el.classList.remove('on');
    clearTimeout(timerDestaque);
  }
  function mostrarDestaque(n) {
    let el = document.getElementById('nt-destaque');
    if (!el) {
      el = document.createElement('div');
      el.id = 'nt-destaque';
      el.setAttribute('role', 'status');
      el.addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-nt]');
        if (!b) return;
        if (b.dataset.nt === 'abrir') abrirNotificacao(el.dataset.id);
        else esconderDestaque();
      });
      document.body.appendChild(el);
    }
    const [icone, tom] = TIPOS[n.tipo] || ['bell', 'gy'];
    el.dataset.id = n.id;
    el.innerHTML = `<span class="nt-ic ${tom}">${ic(icone)}</span>
      <span class="nt-tx"><b>${esc(n.titulo)}</b>${n.corpo ? `<small>${esc(n.corpo)}</small>` : ''}</span>
      <button type="button" class="nt-ver" data-nt="abrir">Abrir</button>
      <button type="button" class="nt-x" data-nt="fechar" title="Fechar" aria-label="Fechar">${ic('x')}</button>`;
    icones();
    requestAnimationFrame(() => el.classList.add('on'));
    clearTimeout(timerDestaque);
    timerDestaque = setTimeout(esconderDestaque, 9000);
  }

  // ---- início ---------------------------------------------------------------------
  function iniciar() {
    const uid = state.currentUser && state.currentUser.id;
    if (!uid || N.uid === uid || typeof supabaseClient === 'undefined') return;
    if (N.canal) { supabaseClient.removeChannel(N.canal); N.canal = null; } // trocou de usuário
    N.uid = uid; N.lista = []; N.pronto = false; N.semTabela = false;
    carregar().then(() => { if (!N.semTabela) escutar(); }).catch((e) => console.warn('[notificacoes]', e));
  }

  // depois do login: clientes carregados (comercial) ou primeira tela desenhada
  // (o técnico não carrega clientes)
  ['fetchClientes', 'renderContent'].forEach((nome) => {
    if (!has(nome)) return;
    const orig = window[nome];
    window[nome] = function () {
      const r = orig.apply(this, arguments);
      try { iniciar(); } catch (e) { console.warn('[notificacoes]', e); }
      return r;
    };
  });

  // o botão do sino é desenhado pelo ui-v2-shell.js com estes três
  window.notifAbrir = notifAbrir;
  window.notifNaoLidas = naoLidas;
  window.notifDisponivel = () => !N.semTabela;
  window.notifAbrirPorId = (id) => { if (N.pronto) abrirNotificacao(id); };
})();
