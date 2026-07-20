// ==========================================================================
// ABA OS DO PORTAL — conectada ao Supabase (Fase 3 / O&M)
// Substitui a tela de OS mockada do om.js. Serve técnico (executa) e
// gestor/admin (acompanha). As RPCs do backend controlam quem pode o quê.
// ==========================================================================
(function () {
  'use strict';

  const sb = (typeof supabaseClient !== 'undefined') ? supabaseClient : window.supabaseClient;

  // Cache do detalhe carregado (evita refetch ao trocar de sub-aba).
  let cache = { id: null, detalhe: null, fotoUrls: {} };
  let subtab = 'resumo';
  const expanded = new Set();
  let pendingFoto = null;
  let flowBusy = false;
  let probForm = null;       // formulário de "registrar problema" (null = fechado)
  let finalizeOpen = false;  // painel de finalização aberto
  let finalizeEstado = null; // 'bom' | 'regular' | 'critico'

  function repaint() {
    const container = document.getElementById('main-container');
    if (container) paintDetalhe(container);
  }

  // ---------- helpers -------------------------------------------------------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g,
      c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function icons() { if (typeof queueAppLucideCreateIcons === 'function') queueAppLucideCreateIcons(); else if (window.lucide) lucide.createIcons(); }
  function toast(msg) { if (typeof showToast === 'function') showToast(msg); }
  function friendlyErr(e) {
    const m = (e && e.message || '').replace(/^.*?:\s*/, '');
    return m || 'Algo deu errado. Tente novamente.';
  }

  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  function fmtDateTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d)) return '—';
    return `${d.getDate()} ${MESES[d.getMonth()]} · ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  function fmtDist(m) {
    if (m == null) return '—';
    return m >= 1000 ? (m / 1000).toFixed(1).replace('.', ',') + ' km' : Math.round(m) + ' m';
  }
  function fmtDur(ms) {
    if (!(ms > 0)) return '0 min';
    const min = Math.floor(ms / 60000), h = Math.floor(min / 60);
    return h > 0 ? `${h}h${String(min % 60).padStart(2, '0')}` : `${min} min`;
  }
  function haversine(la1, lo1, la2, lo2) {
    const R = 6371000, rad = Math.PI / 180;
    const dLa = (la2 - la1) * rad, dLo = (lo2 - lo1) * rad;
    const a = Math.sin(dLa / 2) ** 2 + Math.cos(la1 * rad) * Math.cos(la2 * rad) * Math.sin(dLo / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  const STATUS = {
    agendada:       { label: 'Agendada',        tone: 'yellow', icon: 'calendar-clock' },
    deslocamento:   { label: 'Em deslocamento', tone: 'orange', icon: 'navigation' },
    em_atendimento: { label: 'Em atendimento',  tone: 'blue',   icon: 'wrench' },
    finalizada:     { label: 'Finalizada',      tone: 'emerald',icon: 'check-circle-2' },
    cancelada:      { label: 'Cancelada',       tone: 'gray',   icon: 'x-circle' },
  };
  const PRIO = {
    alta:    { label: 'Alta',    cls: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
    urgente: { label: 'Urgente', cls: 'bg-red-500/20 text-red-300 border-red-500/30' },
  };

  function loadingHTML(msg) {
    return `<div class="om-env"><div class="flex flex-col items-center justify-center py-24 text-neutral-500">
      <i data-lucide="loader-2" class="w-7 h-7 animate-spin text-blue-400 mb-3"></i>
      <div class="text-[11px] font-black uppercase tracking-widest">${esc(msg || 'Carregando…')}</div></div></div>`;
  }
  function erroHTML(e) {
    return `<div class="om-env"><div class="flex flex-col items-center justify-center py-24 text-center px-6">
      <i data-lucide="alert-octagon" class="w-10 h-10 text-red-500 mb-3"></i>
      <div class="text-sm font-black text-white mb-1">Não foi possível carregar</div>
      <div class="text-[12px] text-neutral-500 max-w-sm">${esc(friendlyErr(e))}</div></div></div>`;
  }

  // ==========================================================================
  // ROTEAMENTO DA ABA
  // ==========================================================================
  function omRenderOSTab(container) {
    if (state.omOsDetailId) return omRenderDetalhe(container, state.omOsDetailId);
    return omRenderLista(container);
  }

  function omOsResetDetalhe() {
    subtab = 'resumo';
    expanded.clear();
    probForm = null;
    finalizeOpen = false;
    finalizeEstado = null;
  }
  function omOsAbrir(id) {
    state.omOsDetailId = id;
    omOsResetDetalhe();
    if (typeof renderContent === 'function') renderContent();
  }
  function omOsVoltar() {
    state.omOsDetailId = null;
    cache = { id: null, detalhe: null, fotoUrls: {} };
    listRows = null; // revalida a lista (status pode ter mudado dentro da OS)
    omOsResetDetalhe();
    if (typeof renderContent === 'function') renderContent();
  }

  // ==========================================================================
  // LISTA DE OS — duas visões (lista compacta / quadro) + busca, filtro, ordem
  // ==========================================================================
  let listRows = null;        // cache das OS (evita refetch ao filtrar/buscar)
  let listView = 'lista';     // 'lista' | 'kanban'
  let listFilter = 'todas';   // 'todas' | 'agendada' | 'campo' | 'encerrada'
  let listKanbanTab = 'agendada'; // aba ativa na visão Quadro
  let listSort = 'recentes';  // 'recentes' | 'antigos' | 'prioridade'
  let listSearch = '';

  // status reais → grupo usado nos filtros e nas colunas do quadro
  const STATUS_GRUPO = {
    agendada: 'agendada',
    deslocamento: 'campo', em_atendimento: 'campo',
    finalizada: 'encerrada', cancelada: 'encerrada',
  };
  const GRUPO_COLS = [
    ['agendada', 'Agendada', '#eab308'],
    ['campo', 'Em campo', '#f97316'],
    ['encerrada', 'Encerradas', '#10b981'],
  ];
  const PRIO_RANK = { urgente: 2, alta: 1 };

  function normTxt(s) {
    return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  async function omRenderLista(container) {
    if (!listRows) {
      container.innerHTML = loadingHTML('Carregando ordens de serviço…');
      icons();
      const { data, error } = await sb.rpc('list_om_os');
      if (error) { container.innerHTML = erroHTML(error); icons(); return; }
      listRows = data || [];
    }

    const head = (typeof omPageHeader === 'function')
      ? omPageHeader({ icon: 'clipboard-list', title: 'Ordens de Serviço',
          subtitle: state.isTecnico ? 'Seus atendimentos em campo.' : 'Atendimentos técnicos da franquia.' })
      : `<h1 class="text-xl font-black text-white mb-4">Ordens de Serviço</h1>`;

    if (!listRows.length) {
      const body = (typeof omEmptyState === 'function')
        ? omEmptyState({ icon: 'clipboard-x', title: 'Nenhuma OS', hint: 'Não há ordens de serviço atribuídas.' })
        : `<div class="text-neutral-500 text-sm py-10 text-center">Nenhuma OS.</div>`;
      container.innerHTML = `<div class="om-env animate-fade-in-up">${head}${body}</div>`;
      icons();
      return;
    }

    container.innerHTML = `<div class="om-env animate-fade-in-up">${head}${listToolbarHTML()}
      <div id="om-os-list-body" class="mt-3"></div></div>`;
    paintListBody();
    icons();
  }

  function grupoCounts() {
    const c = { todas: listRows.length, agendada: 0, campo: 0, encerrada: 0 };
    listRows.forEach(o => { const g = STATUS_GRUPO[o.status]; if (g) c[g]++; });
    return c;
  }

  function listToolbarHTML() {
    const c = grupoCounts();
    const fchip = (id, label) => {
      const on = listFilter === id;
      return `<button onclick="omOsFiltro('${id}')"
        class="inline-flex items-center gap-1.5 px-3 py-1.5 border text-[10px] font-black uppercase tracking-wider transition-colors ${
          on ? 'bg-blue-500 border-blue-500 text-white' : 'bg-neutral-900/40 border-neutral-800 text-neutral-400 hover:border-neutral-700'}">
        ${label}<span class="text-[9px] px-1.5 py-0.5 ${on ? 'bg-white/20 text-white' : 'bg-neutral-800 text-neutral-300'}">${c[id] || 0}</span></button>`;
    };
    const vbtn = (id, icon, label) => {
      const on = listView === id;
      return `<button onclick="omOsView('${id}')" title="${label}"
        class="inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider transition-colors ${
          on ? 'bg-neutral-800 text-white' : 'text-neutral-500 hover:text-neutral-300'}">
        <i data-lucide="${icon}" class="w-3.5 h-3.5"></i><span class="hidden sm:inline">${label}</span></button>`;
    };
    const filtros = listView === 'lista'
      ? `<div class="flex flex-wrap items-center gap-2">
          ${fchip('todas', 'Todas')}${fchip('agendada', 'Agendada')}${fchip('campo', 'Em campo')}${fchip('encerrada', 'Encerradas')}
        </div>` : '';
    return `
      <div class="flex flex-col gap-3">
        <div class="flex flex-wrap items-center gap-2">
          <div class="relative flex-1 min-w-[180px]">
            <i data-lucide="search" class="w-3.5 h-3.5 text-neutral-600 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"></i>
            <input id="om-os-search" oninput="omOsBusca(this.value)" value="${esc(listSearch)}"
              placeholder="Buscar por número, serviço ou cliente…"
              class="w-full bg-neutral-900/40 border border-neutral-800 focus:border-blue-500/60 outline-none pl-9 pr-3 py-2 text-[12.5px] text-white placeholder-neutral-600">
          </div>
          <select onchange="omOsSort(this.value)"
            class="bg-neutral-900/40 border border-neutral-800 text-neutral-300 text-[12px] px-2.5 py-2 outline-none focus:border-blue-500/60">
            <option value="recentes" ${listSort === 'recentes' ? 'selected' : ''}>Mais recentes</option>
            <option value="antigos" ${listSort === 'antigos' ? 'selected' : ''}>Mais antigas</option>
            <option value="prioridade" ${listSort === 'prioridade' ? 'selected' : ''}>Prioridade</option>
          </select>
          <div class="flex border border-neutral-800 bg-neutral-900/40">
            ${vbtn('lista', 'list', 'Lista')}${vbtn('kanban', 'layout-grid', 'Quadro')}
          </div>
        </div>
        ${filtros}
      </div>`;
  }

  function listFiltradas() {
    let rows = listRows.slice();
    const q = normTxt(listSearch);
    if (q) rows = rows.filter(o => normTxt([o.numero, o.tipo_servico, o.cliente].join(' ')).indexOf(q) > -1);
    return rows;
  }

  function listOrdena(rows) {
    const dt = o => o.agendado_para ? new Date(o.agendado_para).getTime() : 0;
    if (listSort === 'antigos') return rows.sort((a, b) => dt(a) - dt(b));
    if (listSort === 'prioridade') return rows.sort((a, b) =>
      (PRIO_RANK[b.prioridade] || 0) - (PRIO_RANK[a.prioridade] || 0) || dt(b) - dt(a));
    return rows.sort((a, b) => dt(b) - dt(a)); // recentes
  }

  function paintListBody() {
    const body = document.getElementById('om-os-list-body');
    if (!body) return;
    const rows = listFiltradas();
    body.innerHTML = listView === 'kanban' ? kanbanHTML(rows) : listaHTML(rows);
    icons();
  }

  function vazioFiltrado() {
    return `<div class="border border-neutral-800 bg-neutral-900/20 py-12 text-center">
      <i data-lucide="search-x" class="w-7 h-7 text-neutral-700 mx-auto mb-2"></i>
      <div class="text-[12px] text-neutral-500">Nenhuma OS encontrada com esses filtros.</div></div>`;
  }

  // ---------- Visão LISTA (linhas compactas) --------------------------------
  function listaHTML(rows) {
    let r = rows;
    if (listFilter !== 'todas') r = r.filter(o => STATUS_GRUPO[o.status] === listFilter);
    r = listOrdena(r);
    if (!r.length) return vazioFiltrado();
    const head = `<div class="hidden sm:flex items-center gap-3 px-4 py-2 text-[9px] font-black uppercase tracking-[0.12em] text-neutral-600 border border-neutral-800 border-b-0 bg-neutral-900/20">
      <span class="w-[90px] shrink-0">OS</span>
      <span class="flex-1 min-w-0">Serviço / Cliente</span>
      <span class="w-[115px] shrink-0">Agenda</span>
      <span class="w-[170px] shrink-0 text-right">Status</span>
    </div>`;
    return head + `<div class="border border-neutral-800 divide-y divide-neutral-800 bg-neutral-900/20">${r.map(osRow).join('')}</div>`;
  }

  function osRow(o) {
    const st = STATUS[o.status] || STATUS.agendada;
    const pr = PRIO[o.prioridade];
    const chip = (typeof omChip === 'function') ? omChip(st.label, st.tone) : esc(st.label);
    return `<button onclick="omOsAbrir('${esc(o.id)}')"
      class="w-full text-left flex items-center gap-3 px-4 py-3 hover:bg-blue-500/[0.06] transition-colors">
      <span class="w-[90px] shrink-0 text-[12px] font-black text-white">${esc(o.numero || 'OS')}</span>
      <span class="flex-1 min-w-0">
        <span class="block text-[13px] font-semibold text-neutral-100 truncate">${esc(o.tipo_servico || '—')}</span>
        <span class="block text-[11.5px] text-neutral-500 truncate">${esc(o.cliente || '')}</span>
      </span>
      <span class="hidden sm:flex items-center gap-1.5 text-[11px] text-neutral-400 w-[115px] shrink-0">
        <i data-lucide="calendar-clock" class="w-3 h-3 shrink-0"></i>${esc(fmtDateTime(o.agendado_para))}</span>
      <span class="flex items-center gap-2 justify-end w-auto sm:w-[170px] shrink-0">
        ${pr ? `<span class="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 border ${pr.cls}">${pr.label}</span>` : ''}
        ${chip}
      </span>
    </button>`;
  }

  // ---------- Visão QUADRO (abas por status) --------------------------------
  // Abas Agendada / Em campo / Encerradas — toca numa aba e vê os cards do
  // status empilhados. Sem scroll horizontal (igual no mobile e no desktop).
  // Cada aba mostra só as 5 mais recentes — o resto, via busca.
  const KANBAN_LIMITE = 5;

  function kanbanHTML(rows) {
    const counts = {};
    GRUPO_COLS.forEach(([g]) => { counts[g] = 0; });
    rows.forEach(o => { const g = STATUS_GRUPO[o.status]; if (g in counts) counts[g]++; });

    const tabs = GRUPO_COLS.map(([g, label, accent]) => {
      const on = listKanbanTab === g;
      return `<button onclick="omOsKanbanTab('${g}')"
        class="flex-1 flex items-center justify-center gap-2 px-2 py-2.5 text-[10px] font-black uppercase tracking-wider border-b-2 transition-colors ${
          on ? 'text-white' : 'border-transparent text-neutral-500 hover:text-neutral-300'}"
        style="${on ? `border-color:${accent}` : ''}">
        <span>${label}</span>
        <span class="text-[9px] px-1.5 py-0.5 ${on ? 'text-neutral-900' : 'bg-neutral-800 text-neutral-300'}"${
          on ? ` style="background:${accent}"` : ''}>${counts[g] || 0}</span>
      </button>`;
    }).join('');

    const all = listOrdena(rows.filter(o => STATUS_GRUPO[o.status] === listKanbanTab));
    const list = all.slice(0, KANBAN_LIMITE);
    const extra = all.length - list.length;
    const body = list.length
      ? `<div class="flex flex-col gap-2">${list.map(kanbanCard).join('')}</div>` + (extra > 0
          ? `<div class="flex items-center justify-center gap-1.5 text-[11px] text-neutral-500 mt-2 py-2">
               <i data-lucide="search" class="w-3 h-3"></i>+${extra} nesta lista — use a busca</div>`
          : '')
      : `<div class="text-center text-[12px] text-neutral-600 py-10">Nenhuma OS neste status.</div>`;

    return `<div class="flex border-b border-neutral-800 mb-3">${tabs}</div>${body}`;
  }

  function kanbanCard(o) {
    const st = STATUS[o.status] || STATUS.agendada;
    const pr = PRIO[o.prioridade];
    const chip = (typeof omChip === 'function') ? omChip(st.label, st.tone) : '';
    return `<button onclick="omOsAbrir('${esc(o.id)}')"
      class="w-full text-left bg-neutral-900/40 border border-neutral-800 hover:border-blue-500/40 transition-colors p-3">
      <div class="flex items-center justify-between gap-2">
        <span class="text-[11px] font-black text-white">${esc(o.numero || 'OS')}</span>
        ${pr ? `<span class="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 border ${pr.cls}">${pr.label}</span>` : ''}
      </div>
      <div class="text-[12.5px] font-semibold text-neutral-100 mt-1.5">${esc(o.tipo_servico || '—')}</div>
      <div class="text-[11px] text-neutral-500 mt-0.5 truncate">${esc(o.cliente || '')}</div>
      <div class="flex items-center gap-1.5 text-[10.5px] text-neutral-500 mt-2">
        <i data-lucide="calendar-clock" class="w-3 h-3 shrink-0"></i>${esc(fmtDateTime(o.agendado_para))}
        <span class="ml-auto">${chip}</span>
      </div>
    </button>`;
  }

  // ---------- Handlers da lista ---------------------------------------------
  function omOsView(v) { if (v === listView) return; listView = v; reRenderLista(); }
  function omOsFiltro(f) { if (f === listFilter) return; listFilter = f; reRenderLista(); }
  function omOsKanbanTab(g) { if (g === listKanbanTab) return; listKanbanTab = g; paintListBody(); }
  function omOsSort(s) { listSort = s; paintListBody(); }
  function omOsBusca(v) { listSearch = v; paintListBody(); }
  function reRenderLista() {
    const c = document.getElementById('main-container');
    if (c) omRenderLista(c);
  }

  // ==========================================================================
  // DETALHE DA OS
  // ==========================================================================
  async function omRenderDetalhe(container, id) {
    if (cache.id !== id || !cache.detalhe) {
      container.innerHTML = loadingHTML('Abrindo OS…');
      icons();
      const { data, error } = await sb.rpc('get_om_os_detalhe', { p_os_id: id });
      if (error || !data) { container.innerHTML = erroHTML(error || new Error('OS não encontrada.')); icons(); return; }
      cache = { id, detalhe: data, fotoUrls: {} };
      await loadFotoUrls();
    }
    paintDetalhe(container);
  }

  async function reload() {
    const { data, error } = await sb.rpc('get_om_os_detalhe', { p_os_id: cache.id });
    if (error || !data) { toast(friendlyErr(error)); return; }
    cache.detalhe = data;
    cache.fotoUrls = {};
    await loadFotoUrls();
    const container = document.getElementById('main-container');
    if (container) paintDetalhe(container);
  }

  async function loadFotoUrls() {
    const paths = (cache.detalhe.fotos || []).map(f => f.storage_path).filter(Boolean);
    if (!paths.length) return;
    try {
      const { data } = await sb.storage.from('om-fotos').createSignedUrls(paths, 3600);
      (data || []).forEach(d => { if (d && d.signedUrl && !d.error) cache.fotoUrls[d.path] = d.signedUrl; });
    } catch (_) {}
  }

  function paintDetalhe(container) {
    const d = cache.detalhe, os = d.os;
    const st = STATUS[os.status] || STATUS.agendada;
    const pr = PRIO[os.prioridade];
    const stChip = (typeof omChip === 'function') ? omChip(st.label, st.tone) : esc(st.label);

    const sections = { resumo: secResumo, checklist: secChecklist, fotos: secFotos, problemas: secProblemas };
    const tabs = [
      ['resumo', 'Resumo', 'clipboard-list'],
      ['checklist', 'Checklist', 'list-checks'],
      ['fotos', 'Fotos', 'camera'],
      ['problemas', 'Problemas', 'alert-triangle'],
    ];
    const tabBtns = tabs.map(([id, label, icon]) => {
      const on = subtab === id;
      return `<button onclick="omOsSubtab('${id}')"
        class="flex-1 flex items-center justify-center gap-1.5 px-2 py-2.5 text-[11px] font-black uppercase tracking-wider border-b-2 transition-colors ${
          on ? 'border-blue-500 text-white' : 'border-transparent text-neutral-500 hover:text-neutral-300'}">
        <i data-lucide="${icon}" class="w-3.5 h-3.5"></i><span class="hidden sm:inline">${label}</span></button>`;
    }).join('');

    container.innerHTML = `
      <div class="om-env animate-fade-in-up max-w-2xl mx-auto">
        <div class="flex items-center gap-2 mb-3">
          <button onclick="omOsVoltar()" class="px-3 py-2 bg-neutral-900 border border-neutral-800 hover:border-neutral-700 text-neutral-300 font-black text-[10px] uppercase tracking-widest inline-flex items-center gap-2">
            <i data-lucide="arrow-left" class="w-3.5 h-3.5"></i>Voltar</button>
          <div class="text-sm font-black text-white">${esc(os.numero || 'OS')}</div>
          ${pr ? `<span class="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 border ${pr.cls}">${pr.label}</span>` : ''}
          <div class="ml-auto">${stChip}</div>
        </div>

        <div class="text-[13px] text-neutral-400 mb-3">${esc(os.tipo_servico || '')}</div>

        ${finalizeOpen
          ? finalizePanelHTML()
          : `${flowBarHTML()}
        <div class="flex border-b border-neutral-800 mb-4 mt-4">${tabBtns}</div>
        <div>${(sections[subtab] || secResumo)()}</div>`}
      </div>`;
    icons();
  }

  function omOsSubtab(name) {
    subtab = name;
    const container = document.getElementById('main-container');
    if (container) paintDetalhe(container);
  }

  // ---------- Resumo --------------------------------------------------------
  function card(title, icon, inner) {
    return `<div class="bg-neutral-900/40 border border-neutral-800 mb-3">
      <div class="flex items-center gap-2 px-4 py-2.5 border-b border-neutral-800">
        <i data-lucide="${icon}" class="w-3.5 h-3.5 text-blue-400"></i>
        <span class="text-[10px] font-black uppercase tracking-[0.15em] text-neutral-500">${esc(title)}</span>
      </div>${inner}</div>`;
  }

  function secResumo() {
    const d = cache.detalhe, os = d.os, c = d.cliente || {}, s = d.sistema || {};
    const tel = (c.telefone || '').replace(/\D/g, '');
    const telE164 = tel ? (tel.length <= 11 ? '55' + tel : tel) : '';
    // Endereço do atendimento: usa o do sistema; se vazio, cai no endereço do cliente.
    const endereco = (s.endereco_instalacao && s.endereco_instalacao.trim())
      || [c.endereco, c.cidade].filter(Boolean).join(' — ')
      || '';
    const rota = endereco ? 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(endereco) : '';

    const acao = (href, icon, label, on, ext) =>
      `<a ${on ? `href="${href}"` : ''} ${ext || ''}
        class="flex-1 flex flex-col items-center gap-1 py-2.5 border transition-colors ${
          on ? 'border-neutral-800 hover:border-blue-500/40' : 'border-neutral-800 opacity-30 pointer-events-none'}">
        <i data-lucide="${icon}" class="w-[18px] h-[18px] text-blue-400"></i>
        <span class="text-[10px] font-bold uppercase tracking-wide text-neutral-300">${label}</span></a>`;

    const clienteCard = card('Cliente', 'user', `<div class="p-4">
        <div class="text-[15px] font-bold text-white">${esc(c.nome || '—')}</div>
        ${c.telefone ? `<div class="text-[12.5px] text-neutral-400 mt-0.5">${esc(c.telefone)}</div>` : ''}
        <div class="flex gap-2 mt-3">
          ${acao('tel:' + tel, 'phone', 'Ligar', !!tel)}
          ${acao('https://wa.me/' + telE164, 'message-circle', 'WhatsApp', !!telE164, 'target="_blank" rel="noopener"')}
          ${acao(rota, 'map-pin', 'Rota', !!rota, 'target="_blank" rel="noopener"')}
        </div></div>`);

    const acessoCard = d.acesso_obs ? `<div class="bg-amber-500/[0.07] border border-amber-500/25 p-4 mb-3 flex gap-3">
        <i data-lucide="key-round" class="w-4 h-4 text-amber-400 shrink-0 mt-0.5"></i>
        <div><div class="text-[10px] font-black uppercase tracking-[0.15em] text-amber-400/90 mb-1">Observação de acesso</div>
        <div class="text-[12.5px] text-amber-100/90 leading-relaxed">${esc(d.acesso_obs)}</div></div></div>` : '';

    const localCard = card('Local do atendimento', 'map',
      `<div class="p-4 text-[13px] text-neutral-200 leading-relaxed">${esc(endereco || 'Endereço não informado')}</div>`);

    const modulos = s.quantidade_modulos
      ? `${s.quantidade_modulos}× ${[s.marca_modulos, s.modelo_modulos].filter(Boolean).join(' ') || 'módulos'}`
      : ([s.marca_modulos, s.modelo_modulos].filter(Boolean).join(' ') || null);
    const inversor = [s.marca_inversor, s.modelo_inversor].filter(Boolean).join(' ') || null;
    const sysItem = (k, v) => `<div class="p-3"><div class="text-[10px] font-black uppercase tracking-widest text-neutral-500">${esc(k)}</div>
      <div class="text-[13px] font-bold text-white mt-0.5">${esc(v || '—')}</div></div>`;
    const sistemaCard = card('Sistema fotovoltaico', 'sun',
      `<div class="grid grid-cols-2 divide-x divide-y divide-neutral-800">
        ${sysItem('Potência', s.potencia_kwp != null ? s.potencia_kwp + ' kWp' : null)}
        ${sysItem('Módulos', modulos)}
        ${sysItem('Inversor', inversor)}
        ${sysItem('Local do inversor', s.local_inversor)}
        ${sysItem('Telhado', s.tipo_telhado)}
        ${sysItem('Rede', s.tipo_rede)}
      </div>`);

    const feitos = (d.checklist || []).filter(i => i.feito).length;
    const trk = (icon, label, val) => `<div class="px-4 py-2.5 flex items-center gap-3">
      <i data-lucide="${icon}" class="w-4 h-4 text-neutral-500 shrink-0"></i>
      <span class="text-[12px] text-neutral-400 flex-1">${esc(label)}</span>
      <span class="text-[12.5px] font-bold text-white">${esc(val)}</span></div>`;
    const rastreioCard = card('Rastreio automático', 'radar',
      `<div class="divide-y divide-neutral-800">
        ${trk('calendar-clock', 'Agendado para', fmtDateTime(os.agendado_para))}
        ${trk('log-in', 'Chegada', os.iniciado_em ? fmtDateTime(os.iniciado_em) : 'não registrada')}
        ${os.status === 'em_atendimento' && os.iniciado_em
          ? trk('timer', 'Tempo no local', fmtDur(Date.now() - new Date(os.iniciado_em).getTime()))
          : (os.finalizado_em && os.iniciado_em ? trk('timer', 'Duração', fmtDur(new Date(os.finalizado_em) - new Date(os.iniciado_em))) : '')}
        ${os.distancia_local_m != null ? trk('crosshair', 'Distância do sistema', fmtDist(os.distancia_local_m))
          : (os.gps_chegada_em ? trk('crosshair', 'GPS', 'referência definida') : '')}
        ${trk('list-checks', 'Checklist', `${feitos}/${(d.checklist || []).length}`)}
        ${trk('camera', 'Fotos enviadas', String((d.fotos || []).length))}
        ${trk('alert-triangle', 'Problemas', String((d.problemas || []).length))}
        ${os.flag_revisao ? `<div class="px-4 py-2.5 flex items-center gap-2 text-amber-400">
          <i data-lucide="flag" class="w-4 h-4 shrink-0"></i>
          <span class="text-[12px]">${esc(os.motivo_revisao || 'Marcada para revisão')}</span></div>` : ''}
      </div>`);

    return clienteCard + acessoCard + localCard + sistemaCard + rastreioCard;
  }

  // ---------- Checklist -----------------------------------------------------
  function locked() { return ['finalizada', 'cancelada'].includes(cache.detalhe.os.status); }

  function secChecklist() {
    const d = cache.detalhe;
    const items = d.checklist || [];
    const fotos = d.fotos || [];
    const lk = locked();
    const done = items.filter(i => i.feito).length;
    const pct = items.length ? Math.round(done / items.length * 100) : 0;

    let html = `<div class="flex items-center justify-between mb-2">
        <span class="text-[11px] font-bold uppercase tracking-wider text-neutral-500">Progresso</span>
        <span class="text-[13px] font-black text-white">${done}/${items.length}</span></div>
      <div class="h-1.5 bg-neutral-900 overflow-hidden mb-4"><div class="h-full bg-blue-500" style="width:${pct}%"></div></div>`;

    if (!items.length) return html + `<div class="text-neutral-500 text-[13px] text-center py-8">Esta OS não tem checklist.</div>`;

    html += '<div class="flex flex-col gap-2">';
    items.forEach(it => {
      const open = expanded.has(it.id);
      const itemFotos = fotos.filter(f => f.checklist_item_id === it.id);
      html += `
      <div class="bg-neutral-900/40 border ${it.feito ? 'border-emerald-500/30' : 'border-neutral-800'}">
        <div class="flex items-center gap-3 p-3">
          <button onclick="omOsItemToggle('${esc(it.id)}')" ${lk ? 'disabled' : ''}
            class="shrink-0 w-7 h-7 border-2 flex items-center justify-center ${
              it.feito ? 'bg-emerald-500 border-emerald-500' : 'border-neutral-700'} ${lk ? 'opacity-60' : ''}">
            ${it.feito ? '<i data-lucide="check" class="w-4 h-4 text-black stroke-[3]"></i>' : ''}
          </button>
          <button onclick="omOsItemExpand('${esc(it.id)}')" class="flex-1 min-w-0 flex items-center gap-2 text-left">
            <span class="flex-1 min-w-0">
              <span class="block text-[13.5px] font-semibold ${it.feito ? 'text-neutral-500 line-through' : 'text-white'}">${esc(it.label)}</span>
              ${it.criticidade === 'critico' ? '<span class="block text-[10px] font-black uppercase tracking-wider text-amber-400 mt-0.5">Item crítico</span>' : ''}
            </span>
            <i data-lucide="chevron-down" class="w-4 h-4 text-neutral-500 shrink-0 ${open ? 'rotate-180' : ''}"></i>
          </button>
        </div>
        ${open ? `<div class="border-t border-neutral-800 p-3 flex flex-col gap-3">
          ${it.descricao ? `<div class="bg-neutral-950/60 border border-neutral-800 p-3">
            <div class="flex items-center gap-1.5 mb-1.5">
              <i data-lucide="list-checks" class="w-3.5 h-3.5 text-blue-400"></i>
              <span class="text-[10px] font-black uppercase tracking-wider text-neutral-400">Como fazer</span>
            </div>
            <p class="text-[12.5px] leading-relaxed text-neutral-300 whitespace-pre-line">${esc(it.descricao)}</p>
          </div>` : ''}
          <div>
            <label class="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Observação</label>
            <textarea ${lk ? 'disabled' : ''} onblur="omOsObsSave('${esc(it.id)}', this.value)" rows="2" placeholder="Opcional…"
              class="mt-1 w-full bg-neutral-950 border border-neutral-800 focus:border-blue-500/60 outline-none px-3 py-2 text-[13px] text-white resize-none">${esc(it.observacao || '')}</textarea>
          </div>
          ${itemFotos.length ? `<div class="grid grid-cols-4 gap-1.5">${itemFotos.map(thumb).join('')}</div>` : ''}
          ${lk ? '' : `<button onclick="omOsAddFoto('checklist','${esc(it.id)}')"
            class="self-start inline-flex items-center gap-1.5 text-[12px] font-bold text-blue-400">
            <i data-lucide="camera" class="w-3.5 h-3.5"></i>Anexar foto</button>`}
        </div>` : ''}
      </div>`;
    });
    return html + '</div>';
  }

  // ---------- Fotos ---------------------------------------------------------
  const FOTO_CATS = [
    { id: 'antes', label: 'Antes', min: 2, icon: 'image' },
    { id: 'depois', label: 'Depois', min: 2, icon: 'image' },
    { id: 'inversor', label: 'Inversor / app', min: 1, icon: 'cpu' },
    { id: 'anomalia', label: 'Anomalias', min: 0, icon: 'alert-triangle' },
  ];

  function thumb(f) {
    const url = cache.fotoUrls[f.storage_path] || '';
    return `<div ${url ? `onclick="omOsVerFoto('${esc(url)}')"` : ''}
      class="relative aspect-square overflow-hidden bg-neutral-950 border border-neutral-800 ${url ? 'cursor-pointer' : ''}">
      ${url ? `<img src="${esc(url)}" class="w-full h-full object-cover" loading="lazy" alt="">`
            : '<div class="w-full h-full flex items-center justify-center"><i data-lucide="image-off" class="w-4 h-4 text-neutral-700"></i></div>'}
    </div>`;
  }

  function secFotos() {
    const lk = locked();
    const fotos = (cache.detalhe.fotos || []).filter(f => f.categoria !== 'checklist');
    let html = '<div class="flex flex-col gap-3">';
    FOTO_CATS.forEach(cat => {
      const list = fotos.filter(f => f.categoria === cat.id);
      const ok = list.length >= cat.min;
      const badge = cat.min === 0
        ? `<span class="text-[11px] font-bold text-neutral-500">${list.length} ${list.length === 1 ? 'foto' : 'fotos'}</span>`
        : `<span class="text-[11px] font-black ${ok ? 'text-emerald-400' : 'text-neutral-500'}">${list.length}/${cat.min}${ok ? ' ✓' : ''}</span>`;
      html += `<div class="bg-neutral-900/40 border border-neutral-800">
        <div class="flex items-center gap-2 px-4 py-2.5 border-b border-neutral-800">
          <i data-lucide="${cat.icon}" class="w-3.5 h-3.5 ${ok ? 'text-emerald-400' : 'text-blue-400'}"></i>
          <span class="text-[11px] font-black uppercase tracking-[0.15em] text-neutral-300 flex-1">${cat.label}</span>
          ${cat.min === 0 ? '<span class="text-[9px] uppercase tracking-wider text-neutral-600 font-bold">opcional</span>' : ''}
          ${badge}
        </div>
        <div class="p-3 grid grid-cols-3 gap-2">
          ${list.map(thumb).join('')}
          ${lk ? '' : `<button onclick="omOsAddFoto('${cat.id}',null)"
            class="aspect-square border-2 border-dashed border-neutral-700 flex flex-col items-center justify-center gap-1 text-neutral-500 hover:border-blue-500/40">
            <i data-lucide="camera" class="w-5 h-5"></i><span class="text-[10px] font-bold uppercase">Foto</span></button>`}
        </div></div>`;
    });
    return html + '</div>';
  }

  // ---------- Problemas -----------------------------------------------------
  const GRAV = {
    baixa: { label: 'Baixa', cls: 'text-neutral-300' },
    media: { label: 'Média', cls: 'text-amber-400' },
    alta:  { label: 'Alta',  cls: 'text-red-400' },
  };

  function secProblemas() {
    const lk = locked();
    const probs = cache.detalhe.problemas || [];
    let html = '';

    if (probs.length) {
      html += '<div class="flex flex-col gap-2 mb-3">';
      probs.forEach(p => {
        const g = GRAV[p.gravidade] || GRAV.baixa;
        html += `<div class="bg-neutral-900/40 border border-neutral-800 p-3">
          <div class="flex items-center gap-2">
            <i data-lucide="alert-triangle" class="w-3.5 h-3.5 ${g.cls}"></i>
            <span class="text-[10px] font-black uppercase tracking-wider ${g.cls}">${g.label}</span>
            ${p.precisa_retorno ? '<span class="text-[10px] font-bold text-blue-300 ml-auto inline-flex items-center gap-1"><i data-lucide="rotate-ccw" class="w-3 h-3"></i>Precisa retorno</span>' : ''}
          </div>
          <div class="text-[13px] text-neutral-200 mt-1.5">${esc(p.descricao)}</div>
        </div>`;
      });
      html += '</div>';
    }

    if (lk) {
      if (!probs.length) html += '<div class="text-neutral-500 text-[13px] text-center py-8">Nenhum problema registrado.</div>';
      return html;
    }

    html += probForm
      ? problemaFormHTML()
      : `<button onclick="omOsProblemaAbrir()"
          class="w-full py-3 border-2 border-dashed border-neutral-700 hover:border-blue-500/40 text-blue-400 font-black text-[12px] uppercase tracking-widest inline-flex items-center justify-center gap-2">
          <i data-lucide="plus" class="w-4 h-4"></i>Registrar problema</button>`;
    return html;
  }

  function problemaFormHTML() {
    const f = probForm;
    const gravBtn = (id, selCls) => `<button onclick="omOsProblemaGravidade('${id}')"
      class="flex-1 py-2 text-[11px] font-black uppercase tracking-wider border ${
        f.gravidade === id ? selCls : 'border-neutral-800 text-neutral-500'}">${GRAV[id].label}</button>`;
    const foto = f.foto_id ? (cache.detalhe.fotos || []).find(x => x.id === f.foto_id) : null;
    const fotoUrl = foto ? cache.fotoUrls[foto.storage_path] : null;
    return `<div class="bg-neutral-900/40 border border-neutral-800 p-4">
      <div class="text-[12px] font-black uppercase tracking-widest text-white mb-3">Novo problema</div>
      <textarea id="om-prob-desc" rows="2" placeholder="Descreva o problema…"
        class="w-full bg-neutral-950 border border-neutral-800 focus:border-blue-500/60 outline-none px-3 py-2 text-[13px] text-white resize-none mb-3">${esc(f.descricao || '')}</textarea>
      <div class="text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-1.5">Gravidade</div>
      <div class="flex gap-2 mb-3">
        ${gravBtn('baixa', 'border-neutral-500 bg-neutral-800 text-white')}
        ${gravBtn('media', 'border-amber-500 bg-amber-500/20 text-amber-300')}
        ${gravBtn('alta',  'border-red-500 bg-red-500/20 text-red-300')}
      </div>
      <button onclick="omOsProblemaRetorno()" class="flex items-center gap-2 mb-3">
        <span class="w-9 h-5 rounded-full transition-colors ${f.precisa_retorno ? 'bg-blue-500' : 'bg-neutral-700'} relative inline-block">
          <span class="absolute top-0.5 ${f.precisa_retorno ? 'left-[18px]' : 'left-0.5'} w-4 h-4 rounded-full bg-white transition-all"></span>
        </span>
        <span class="text-[12.5px] text-neutral-300">Precisa de retorno</span>
      </button>
      <div class="mb-3">
        <div class="text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-1.5">Foto (obrigatória)</div>
        ${fotoUrl
          ? `<div class="w-20 h-20 border border-neutral-800 overflow-hidden"><img src="${esc(fotoUrl)}" class="w-full h-full object-cover" alt=""></div>`
          : `<button onclick="omOsProblemaFoto()" class="w-20 h-20 border-2 border-dashed border-neutral-700 hover:border-blue-500/40 flex flex-col items-center justify-center gap-1 text-neutral-500">
              <i data-lucide="camera" class="w-5 h-5"></i><span class="text-[9px] font-bold uppercase">Foto</span></button>`}
      </div>
      <div class="flex gap-2">
        <button onclick="omOsProblemaCancelar()" class="flex-1 py-2.5 bg-neutral-900 border border-neutral-800 text-neutral-300 font-black text-[11px] uppercase tracking-wider">Cancelar</button>
        <button onclick="omOsProblemaSalvar()" class="flex-1 py-2.5 bg-blue-500 hover:bg-blue-400 text-blue-950 font-black text-[11px] uppercase tracking-wider">Salvar</button>
      </div>
    </div>`;
  }

  function finalizePanelHTML() {
    const estBtn = (id, label, selCls) => `<button onclick="omOsFinalizarEstado('${id}')"
      class="flex-1 py-2.5 text-[11px] font-black uppercase tracking-wider border ${
        finalizeEstado === id ? selCls : 'border-neutral-800 text-neutral-500'}">${label}</button>`;
    return `<div class="bg-neutral-900/40 border border-neutral-800 p-4 mt-4">
      <div class="text-[13px] font-black text-white mb-1">Finalizar atendimento</div>
      <div class="text-[12px] text-neutral-500 mb-3">${esc(cache.detalhe.os.numero || '')}</div>
      <div class="text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-1.5">Estado geral do sistema</div>
      <div class="flex gap-2 mb-3">
        ${estBtn('bom', 'Bom', 'border-emerald-500 bg-emerald-500/20 text-emerald-300')}
        ${estBtn('regular', 'Regular', 'border-amber-500 bg-amber-500/20 text-amber-300')}
        ${estBtn('critico', 'Crítico', 'border-red-500 bg-red-500/20 text-red-300')}
      </div>
      <div class="text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-1.5">Observação final</div>
      <textarea id="om-final-obs" rows="3" placeholder="Resumo do atendimento, recomendações…"
        class="w-full bg-neutral-950 border border-neutral-800 focus:border-blue-500/60 outline-none px-3 py-2 text-[13px] text-white resize-none mb-3"></textarea>
      <div class="flex gap-2">
        <button onclick="omOsFinalizarCancelar()" class="flex-1 py-2.5 bg-neutral-900 border border-neutral-800 text-neutral-300 font-black text-[11px] uppercase tracking-wider">Cancelar</button>
        <button onclick="omOsFinalizarConfirmar()" class="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-emerald-950 font-black text-[11px] uppercase tracking-wider">Confirmar</button>
      </div>
    </div>`;
  }

  // ==========================================================================
  // BOTÃO DE FLUXO
  // ==========================================================================
  function flowBarHTML() {
    const status = cache.detalhe.os.status;
    const map = {
      agendada:       { txt: 'Iniciar deslocamento', icon: 'navigation',     cls: 'bg-blue-500 hover:bg-blue-400 text-blue-950' },
      deslocamento:   { txt: 'Cheguei ao local',     icon: 'map-pin',        cls: 'bg-blue-500 hover:bg-blue-400 text-blue-950' },
      em_atendimento: { txt: 'Finalizar atendimento', icon: 'flag-triangle-right', cls: 'bg-blue-500 hover:bg-blue-400 text-blue-950' },
      finalizada:     { txt: 'Atendimento finalizado',icon: 'check-circle-2',cls: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' },
      cancelada:      { txt: 'OS cancelada',          icon: 'x-circle',      cls: 'bg-neutral-900 text-neutral-500 border border-neutral-800' },
    };
    const cfg = map[status] || map.agendada;
    const dis = status === 'finalizada' || status === 'cancelada';
    return `<button onclick="omOsFlow()" ${dis ? 'disabled' : ''}
      class="w-full py-3 font-black text-[12px] uppercase tracking-widest inline-flex items-center justify-center gap-2 ${cfg.cls}">
      <i data-lucide="${cfg.icon}" class="w-4 h-4"></i>${cfg.txt}</button>`;
  }

  async function omOsFlow() {
    if (flowBusy) return;
    const status = cache.detalhe.os.status;
    if (status === 'agendada') return flowDeslocamento();
    if (status === 'deslocamento') return flowChegada();
    if (status === 'em_atendimento') return omOsFinalizarAbrir();
  }

  async function flowDeslocamento() {
    flowBusy = true;
    const { error } = await sb.rpc('os_iniciar_deslocamento', { p_os_id: cache.id });
    flowBusy = false;
    if (error) { toast(friendlyErr(error)); return; }
    toast('Deslocamento iniciado.');
    await reload();
  }

  function getGPS() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error('Geolocalização indisponível.'));
      navigator.geolocation.getCurrentPosition(resolve, reject,
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
    });
  }

  async function flowChegada() {
    flowBusy = true;
    let lat = null, lng = null;
    try {
      const pos = await getGPS();
      lat = pos.coords.latitude; lng = pos.coords.longitude;
    } catch (_) {
      if (!confirm('Não foi possível obter o GPS.\n\nRegistrar a chegada mesmo assim, sem localização?')) {
        flowBusy = false; return;
      }
    }
    if (lat != null && lng != null) {
      const s = cache.detalhe.sistema;
      if (s && s.latitude != null && s.longitude != null) {
        const dist = haversine(lat, lng, +s.latitude, +s.longitude);
        if (dist > 500 && !confirm(`Você está a ${fmtDist(dist)} do endereço cadastrado do sistema.\n\nConfirmar chegada mesmo assim?`)) {
          flowBusy = false; return;
        }
      }
    }
    const { data, error } = await sb.rpc('os_registrar_chegada', { p_os_id: cache.id, p_lat: lat, p_long: lng });
    flowBusy = false;
    if (error) { toast(friendlyErr(error)); return; }
    if (lat == null) toast('Chegada registrada (sem GPS).');
    else if (data && data.referencia_bootstrap) toast('Chegada registrada · local salvo como referência.');
    else if (data && data.distancia_m != null) toast('Chegada registrada · ' + fmtDist(data.distancia_m) + ' do sistema.');
    else toast('Chegada registrada.');
    await reload();
  }

  // ==========================================================================
  // AÇÕES DO CHECKLIST
  // ==========================================================================
  function omOsItemExpand(itemId) {
    if (expanded.has(itemId)) expanded.delete(itemId); else expanded.add(itemId);
    const container = document.getElementById('main-container');
    if (container) paintDetalhe(container);
  }

  async function omOsItemToggle(itemId) {
    const it = (cache.detalhe.checklist || []).find(i => i.id === itemId);
    if (!it) return;
    const novo = !it.feito;
    const { error } = await sb.rpc('os_marcar_item', {
      p_item_id: itemId, p_feito: novo, p_observacao: it.observacao || null,
    });
    if (error) { toast(friendlyErr(error)); return; }
    it.feito = novo;
    it.marcado_em = novo ? new Date().toISOString() : null;
    const container = document.getElementById('main-container');
    if (container) paintDetalhe(container);
  }

  async function omOsObsSave(itemId, valor) {
    const it = (cache.detalhe.checklist || []).find(i => i.id === itemId);
    if (!it) return;
    const novo = String(valor || '').trim();
    if ((it.observacao || '') === novo) return;
    const { error } = await sb.rpc('os_marcar_item', {
      p_item_id: itemId, p_feito: it.feito, p_observacao: novo || null,
    });
    if (error) { toast(friendlyErr(error)); return; }
    it.observacao = novo;
    toast('Observação salva.');
  }

  // ==========================================================================
  // FOTOS — EXIF, compressão, upload
  // ==========================================================================
  // mode: 'cam' força a câmera (capture); 'gal' abre galeria/arquivos (sem capture)
  function omOsFile(mode) {
    const id = 'om-os-file-' + (mode === 'gal' ? 'gal' : 'cam');
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement('input');
      el.type = 'file';
      el.accept = 'image/*';
      if (mode !== 'gal') el.setAttribute('capture', 'environment');
      el.id = id;
      el.style.display = 'none';
      el.addEventListener('change', (e) => {
        const f = e.target.files && e.target.files[0];
        e.target.value = '';
        if (f) doUpload(f);
      });
      document.body.appendChild(el);
    }
    return el;
  }

  // Folha de escolha Câmera / Galeria. pendingFoto já deve estar setado pelo chamador.
  function omOsFotoSheet() {
    if (document.getElementById('om-os-foto-sheet')) return;
    const ov = document.createElement('div');
    ov.id = 'om-os-foto-sheet';
    ov.className = 'fixed inset-0 z-[120] flex items-end justify-center bg-black/60';
    ov.onclick = (e) => { if (e.target === ov) omOsFotoCancel(); };
    ov.innerHTML = `<div class="w-full max-w-md bg-neutral-950 border-t border-neutral-800 p-4 pb-6 flex flex-col gap-3">
      <div class="text-[11px] font-black uppercase tracking-[0.15em] text-neutral-400 text-center mb-1">Adicionar foto</div>
      <button onclick="omOsFotoPick('cam')" class="w-full flex items-center gap-3 px-4 py-3.5 bg-neutral-900 border border-neutral-800 hover:border-blue-500/40 text-left">
        <i data-lucide="camera" class="w-5 h-5 text-blue-400"></i>
        <span class="text-[14px] font-bold text-white">Câmera</span></button>
      <button onclick="omOsFotoPick('gal')" class="w-full flex items-center gap-3 px-4 py-3.5 bg-neutral-900 border border-neutral-800 hover:border-blue-500/40 text-left">
        <i data-lucide="image" class="w-5 h-5 text-blue-400"></i>
        <span class="text-[14px] font-bold text-white">Galeria</span></button>
      <button onclick="omOsFotoCancel()" class="w-full px-4 py-3 text-[13px] font-bold text-neutral-400">Cancelar</button>
    </div>`;
    document.body.appendChild(ov);
    icons();
  }

  function omOsFotoPick(mode) {
    const ov = document.getElementById('om-os-foto-sheet');
    if (ov) ov.remove();
    if (!pendingFoto) return;
    omOsFile(mode).click();
  }

  function omOsFotoCancel() {
    const ov = document.getElementById('om-os-foto-sheet');
    if (ov) ov.remove();
    pendingFoto = null;
  }

  function omOsAddFoto(categoria, itemId) {
    if (locked()) { toast('OS encerrada — não é possível enviar fotos.'); return; }
    pendingFoto = { categoria, itemId: itemId || null };
    omOsFotoSheet();
  }

  function omOsVerFoto(url) {
    if (url) window.open(url, '_blank', 'noopener');
  }

  async function extractExif(file) {
    try {
      if (!window.exifr) return { lat: null, lng: null, ts: null };
      const x = await window.exifr.parse(file, { gps: true });
      if (!x) return { lat: null, lng: null, ts: null };
      let ts = null;
      const dt = x.DateTimeOriginal || x.CreateDate || x.ModifyDate;
      if (dt) { const d = (dt instanceof Date) ? dt : new Date(dt); if (!isNaN(d)) ts = d.toISOString(); }
      return {
        lat: (typeof x.latitude === 'number') ? x.latitude : null,
        lng: (typeof x.longitude === 'number') ? x.longitude : null,
        ts,
      };
    } catch (_) { return { lat: null, lng: null, ts: null }; }
  }

  function compressImage(file) {
    return new Promise(resolve => {
      try {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
          URL.revokeObjectURL(url);
          const MAX = 1600;
          let w = img.naturalWidth, h = img.naturalHeight;
          if (!w || !h) return resolve(file);
          if (w > MAX || h > MAX) { const r = Math.min(MAX / w, MAX / h); w = Math.round(w * r); h = Math.round(h * r); }
          const cv = document.createElement('canvas');
          cv.width = w; cv.height = h;
          cv.getContext('2d').drawImage(img, 0, 0, w, h);
          cv.toBlob(b => resolve(b || file), 'image/jpeg', 0.82);
        };
        img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
        img.src = url;
      } catch (_) { resolve(file); }
    });
  }

  async function doUpload(file) {
    const ctx = pendingFoto;
    pendingFoto = null;
    if (!ctx) return;
    toast('Enviando foto…');
    try {
      const exif = await extractExif(file);
      const blob = await compressImage(file);
      const name = Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.jpg';
      const path = `franquias/${cache.detalhe.os.franquia_id}/os/${cache.id}/${ctx.categoria}/${name}`;
      const up = await sb.storage.from('om-fotos').upload(path, blob, { contentType: 'image/jpeg' });
      if (up.error) throw up.error;
      const { data: fotoId, error: rpcErr } = await sb.rpc('os_registrar_foto', {
        p_os_id: cache.id, p_categoria: ctx.categoria, p_storage_path: path,
        p_checklist_item_id: ctx.itemId, p_legenda: null,
        p_exif_lat: exif.lat, p_exif_long: exif.lng, p_exif_timestamp: exif.ts,
      });
      if (rpcErr) {
        try { await sb.storage.from('om-fotos').remove([path]); } catch (_) {}
        throw rpcErr;
      }
      if (ctx.forProblem && probForm) probForm.foto_id = fotoId;
      toast('Foto enviada.');
      await reload();
    } catch (e) {
      toast(friendlyErr(e) || 'Falha ao enviar a foto.');
    }
  }

  // ==========================================================================
  // AÇÕES — Problemas
  // ==========================================================================
  function probSyncDesc() {
    const ta = document.getElementById('om-prob-desc');
    if (ta && probForm) probForm.descricao = ta.value;
  }
  function omOsProblemaAbrir() {
    probForm = { descricao: '', gravidade: null, precisa_retorno: false, foto_id: null };
    subtab = 'problemas';
    repaint();
  }
  function omOsProblemaCancelar() { probForm = null; repaint(); }
  function omOsProblemaGravidade(g) { probSyncDesc(); if (probForm) probForm.gravidade = g; repaint(); }
  function omOsProblemaRetorno() { probSyncDesc(); if (probForm) probForm.precisa_retorno = !probForm.precisa_retorno; repaint(); }
  function omOsProblemaFoto() {
    if (!probForm) return;
    probSyncDesc();
    pendingFoto = { categoria: 'anomalia', itemId: null, forProblem: true };
    omOsFotoSheet();
  }
  async function omOsProblemaSalvar() {
    if (!probForm) return;
    probSyncDesc();
    const f = probForm;
    if (!String(f.descricao || '').trim()) { toast('Descreva o problema.'); return; }
    if (!f.gravidade) { toast('Escolha a gravidade.'); return; }
    if (!f.foto_id) { toast('Anexe uma foto do problema.'); return; }
    const { error } = await sb.rpc('os_registrar_problema', {
      p_os_id: cache.id, p_descricao: f.descricao.trim(), p_gravidade: f.gravidade,
      p_precisa_retorno: f.precisa_retorno, p_foto_id: f.foto_id,
    });
    if (error) { toast(friendlyErr(error)); return; }
    probForm = null;
    toast('Problema registrado.');
    await reload();
  }

  // ==========================================================================
  // AÇÕES — Finalização
  // ==========================================================================
  function omOsFinalizarAbrir() { finalizeOpen = true; finalizeEstado = null; repaint(); }
  function omOsFinalizarCancelar() { finalizeOpen = false; repaint(); }
  function omOsFinalizarEstado(e) {
    const ta = document.getElementById('om-final-obs');
    const obs = ta ? ta.value : null;
    finalizeEstado = e;
    repaint();
    const ta2 = document.getElementById('om-final-obs');
    if (ta2 && obs != null) ta2.value = obs;
  }
  async function omOsFinalizarConfirmar() {
    if (flowBusy) return;
    if (!finalizeEstado) { toast('Selecione o estado geral.'); return; }
    const ta = document.getElementById('om-final-obs');
    const obs = ta ? ta.value.trim() : '';
    const d = cache.detalhe;
    const itensPend = (d.checklist || []).filter(i => !i.feito).length;
    // Trava: checklist incompleto impede finalizar (não é ignorável).
    if (itensPend) {
      toast(`Conclua o checklist antes de finalizar · ${itensPend} item(ns) pendente(s).`);
      return;
    }
    const fotos = (d.fotos || []).filter(f => f.categoria !== 'checklist');
    const faltaFoto = fotos.filter(f => f.categoria === 'antes').length < 2
      || fotos.filter(f => f.categoria === 'depois').length < 2
      || fotos.filter(f => f.categoria === 'inversor').length < 1;
    if (faltaFoto) {
      if (!confirm('Fotos mínimas não atingidas.\n\nFinalizar o atendimento mesmo assim?')) return;
    }
    flowBusy = true;
    const { data, error } = await sb.rpc('os_finalizar', {
      p_os_id: cache.id, p_estado_geral: finalizeEstado, p_observacao_final: obs || null,
    });
    flowBusy = false;
    if (error) { toast(friendlyErr(error)); return; }
    finalizeOpen = false;
    toast(data && data.flag_revisao ? 'OS finalizada · marcada para revisão.' : 'Atendimento finalizado.');
    await reload();
  }

  // ==========================================================================
  // AGENDA — calendário de OS (Mês / Semana / Dia) sobre os mesmos dados da aba
  // OS (listRows / list_om_os). Cor por status + filtro por técnico, painel de
  // "Não agendadas" e reagendamento (drag-and-drop / seletor de data).
  // ==========================================================================
  const AG_MESES_LONG = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const AG_DIAS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const AG_DIAS_LONG  = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  // Fundo + texto + barra à esquerda, por status (verde de verdade na concluída).
  const AG_TONE = {
    agendada:       'bg-yellow-500/15 text-yellow-200 border-l-2 border-yellow-400',
    deslocamento:   'bg-orange-500/15 text-orange-200 border-l-2 border-orange-400',
    em_atendimento: 'bg-blue-500/15 text-blue-200 border-l-2 border-blue-400',
    finalizada:     'bg-emerald-500/15 text-emerald-200 border-l-2 border-emerald-400',
    cancelada:      'bg-neutral-700/40 text-neutral-400 border-l-2 border-neutral-500',
  };
  const AG_DOT = {
    agendada: 'bg-yellow-400', deslocamento: 'bg-orange-400', em_atendimento: 'bg-blue-400',
    finalizada: 'bg-emerald-400', cancelada: 'bg-neutral-500',
  };

  let agDragId = null;

  // ---------- helpers de data ----------------------------------------------
  function ymd(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function parseYmd(s) { const p = String(s).split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
  function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function addMonths(d, n) { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; }
  function startOfWeek(d) { const x = new Date(d); x.setDate(x.getDate() - x.getDay()); x.setHours(0, 0, 0, 0); return x; }
  function sameYmd(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
  function agState() { if (!state.omAgenda) state.omAgenda = { view: 'mes', anchor: null, tecnico: 'todos' }; if (!state.omAgenda.anchor) state.omAgenda.anchor = ymd(new Date()); return state.omAgenda; }
  function agAnchorDate() { return parseYmd(agState().anchor); }
  function agToLocalInput(iso) {
    const d = iso ? new Date(iso) : new Date();
    if (isNaN(d)) return '';
    const p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function agDefaultInput() { const d = new Date(); d.setHours(8, 0, 0, 0); return agToLocalInput(d.toISOString()); }

  // ---------- dados ---------------------------------------------------------
  function agFiltered() {
    const tec = agState().tecnico;
    let rows = listRows || [];
    if (tec && tec !== 'todos') rows = rows.filter(o => String(o.tecnico_id) === String(tec));
    return rows;
  }
  function agScheduledByDay(rows) {
    const map = {};
    rows.forEach(o => { if (!o.agendado_para) return; const k = ymd(new Date(o.agendado_para)); (map[k] || (map[k] = [])).push(o); });
    Object.keys(map).forEach(k => map[k].sort((a, b) => new Date(a.agendado_para) - new Date(b.agendado_para)));
    return map;
  }
  function agUnscheduled(rows) {
    const open = ['agendada', 'deslocamento', 'em_atendimento'];
    return rows.filter(o => !o.agendado_para && open.indexOf(o.status) >= 0);
  }
  function agTecnicos() {
    const m = new Map();
    (listRows || []).forEach(o => { if (o.tecnico_id) m.set(String(o.tecnico_id), o.tecnico_nome || 'Técnico'); });
    return Array.from(m, ([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome));
  }

  // ---------- rótulo do período --------------------------------------------
  function agPeriodLabel() {
    const a = agAnchorDate(), v = agState().view;
    if (v === 'mes') return AG_MESES_LONG[a.getMonth()] + ' ' + a.getFullYear();
    if (v === 'dia') return AG_DIAS_LONG[a.getDay()] + ', ' + a.getDate() + ' ' + MESES[a.getMonth()] + ' ' + a.getFullYear();
    const s = startOfWeek(a), e = addDays(s, 6);
    if (s.getMonth() === e.getMonth()) return s.getDate() + '–' + e.getDate() + ' ' + MESES[s.getMonth()] + ' ' + s.getFullYear();
    return s.getDate() + ' ' + MESES[s.getMonth()] + ' – ' + e.getDate() + ' ' + MESES[e.getMonth()] + ' ' + e.getFullYear();
  }

  // ---------- chips / linhas de evento -------------------------------------
  function agChip(o, detailed) {
    const tone = AG_TONE[o.status] || AG_TONE.agendada;
    const hora = omFmtHoraISO(o.agendado_para);
    const cli = esc(o.cliente || o.tipo_servico || o.numero || 'OS');
    const sub = detailed && (o.cidade || o.tecnico_nome)
      ? `<div class="text-[9px] opacity-70 truncate pl-0.5">${esc([o.cidade, o.tecnico_nome].filter(Boolean).join(' · '))}</div>` : '';
    return `<div draggable="true" ondragstart="omAgDragStart(event,'${esc(o.id)}')" onclick="omAgAbrirOS('${esc(o.id)}')"
        title="${esc((o.numero ? o.numero + ' · ' : '') + (o.cliente || '') + ' · ' + omFmtDataHoraISO(o.agendado_para))}"
        class="block ${tone} px-1.5 ${detailed ? 'py-1' : 'py-0.5'} cursor-pointer hover:brightness-125 transition">
        <div class="flex items-center gap-1">
          <span class="num text-[10px] font-black shrink-0">${hora}</span>
          <span class="text-[10px] font-bold truncate flex-1 min-w-0">${cli}</span>
        </div>${sub}</div>`;
  }
  function agDayRow(o) {
    const st = STATUS[o.status] || STATUS.agendada;
    const chip = (typeof omChip === 'function') ? omChip(st.label, st.tone) : esc(st.label);
    return `<div class="flex items-center gap-3 px-4 py-3 hover:bg-blue-500/[0.06] transition-colors cursor-pointer" onclick="omAgAbrirOS('${esc(o.id)}')">
        <span class="num text-sm font-black text-white w-14 shrink-0">${omFmtHoraISO(o.agendado_para)}</span>
        <div class="min-w-0 flex-1">
          <div class="text-[13px] font-black text-white truncate">${esc(o.cliente || o.tipo_servico || o.numero)}</div>
          <div class="text-[11px] text-neutral-500 truncate">${esc(o.numero || '')}${o.cidade ? ' · ' + esc(o.cidade) : ''}${o.tecnico_nome ? ' · ' + esc(o.tecnico_nome) : ''}</div>
        </div>
        <div class="shrink-0">${chip}</div>
        <button onclick="event.stopPropagation();omAgReagendarPrompt('${esc(o.id)}')" title="Reagendar"
          class="shrink-0 w-8 h-8 grid place-items-center border border-neutral-800 hover:border-blue-500/40 text-neutral-400 hover:text-blue-300">
          <i data-lucide="calendar-clock" class="w-4 h-4"></i></button>
      </div>`;
  }

  // ---------- visões --------------------------------------------------------
  function agMonthHTML() {
    const a = agAnchorDate(), today = new Date();
    const byDay = agScheduledByDay(agFiltered());
    const start = startOfWeek(new Date(a.getFullYear(), a.getMonth(), 1));
    const headers = AG_DIAS_SHORT.map(d =>
      `<div class="bg-neutral-950 text-[9px] font-black uppercase tracking-widest text-neutral-500 text-center py-1.5">${d}</div>`).join('');
    let cells = '';
    for (let i = 0; i < 42; i++) {
      const d = addDays(start, i), key = ymd(d);
      const inMonth = d.getMonth() === a.getMonth(), isToday = sameYmd(d, today);
      const evs = byDay[key] || [], shown = evs.slice(0, 3), extra = evs.length - shown.length;
      const dayBadge = isToday
        ? `<span class="text-[11px] font-black bg-blue-500 text-blue-950 w-5 h-5 grid place-items-center rounded-full">${d.getDate()}</span>`
        : `<span class="text-[11px] font-black ${inMonth ? 'text-neutral-300' : 'text-neutral-600'}">${d.getDate()}</span>`;
      cells += `<div ondragover="omAgDragOver(event)" ondrop="omAgDrop(event,'${key}')"
          class="min-h-[104px] p-1.5 flex flex-col gap-1 ${inMonth ? 'bg-[#0b0b0b]' : 'bg-[#070707]'}">
          <div class="flex items-center justify-between">${dayBadge}${evs.length ? `<span class="text-[9px] font-bold text-neutral-500">${evs.length}</span>` : ''}</div>
          <div class="flex flex-col gap-0.5 overflow-hidden">
            ${shown.map(o => agChip(o, false)).join('')}
            ${extra > 0 ? `<button onclick="omAgOpenDay('${key}')" class="text-[9px] font-black uppercase tracking-wider text-neutral-500 hover:text-blue-300 text-left px-1">+${extra} mais</button>` : ''}
          </div>
        </div>`;
    }
    return `<div class="grid grid-cols-7 gap-px bg-neutral-800 border border-neutral-800">${headers}${cells}</div>`;
  }
  function agWeekHTML() {
    const a = agAnchorDate(), today = new Date(), start = startOfWeek(a);
    const byDay = agScheduledByDay(agFiltered());
    let cols = '';
    for (let i = 0; i < 7; i++) {
      const d = addDays(start, i), key = ymd(d), evs = byDay[key] || [], isToday = sameYmd(d, today);
      cols += `<div ondragover="omAgDragOver(event)" ondrop="omAgDrop(event,'${key}')" class="bg-[#0b0b0b] min-h-[380px] flex flex-col">
          <div class="px-2 py-2 border-b border-neutral-800 ${isToday ? 'bg-blue-500/10' : ''}">
            <div class="text-[9px] font-black uppercase tracking-widest text-neutral-500">${AG_DIAS_SHORT[d.getDay()]}</div>
            <div class="text-sm font-black ${isToday ? 'text-blue-300' : 'text-neutral-200'}">${d.getDate()}</div>
          </div>
          <div class="flex-1 p-1 flex flex-col gap-1">
            ${evs.length ? evs.map(o => agChip(o, true)).join('') : '<div class="text-[9px] text-neutral-700 text-center py-4">—</div>'}
          </div>
        </div>`;
    }
    return `<div class="grid grid-cols-7 gap-px bg-neutral-800 border border-neutral-800 overflow-x-auto">${cols}</div>`;
  }
  function agDayHTML() {
    const a = agAnchorDate(), key = ymd(a), isToday = sameYmd(a, new Date());
    const evs = agScheduledByDay(agFiltered())[key] || [];
    const list = evs.length
      ? `<div class="border border-neutral-800 divide-y divide-neutral-800 bg-neutral-900/20">${evs.map(agDayRow).join('')}</div>`
      : `<div class="border border-neutral-800 bg-neutral-900/20 py-12 text-center text-[12px] text-neutral-500">Nenhuma OS agendada para este dia.</div>`;
    return `<div ondragover="omAgDragOver(event)" ondrop="omAgDrop(event,'${key}')">
        <div class="text-[11px] font-black uppercase tracking-widest text-neutral-400 mb-2">${AG_DIAS_LONG[a.getDay()]}, ${a.getDate()} ${MESES[a.getMonth()]} ${a.getFullYear()}${isToday ? ' · Hoje' : ''}</div>
        ${list}</div>`;
  }
  function agBodyHTML() {
    const v = agState().view;
    if (v === 'semana') return agWeekHTML();
    if (v === 'dia') return agDayHTML();
    return agMonthHTML();
  }

  // ---------- toolbar / painel de não agendadas ----------------------------
  function agToolbarHTML() {
    const v = agState().view;
    const vbtn = (id, icon, label) => `<button onclick="omAgViewSet('${id}')"
      class="inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider transition-colors ${v === id ? 'bg-neutral-800 text-white' : 'text-neutral-500 hover:text-neutral-300'}">
      <i data-lucide="${icon}" class="w-3.5 h-3.5"></i><span class="hidden sm:inline">${label}</span></button>`;
    const tecs = agTecnicos();
    const tecSel = `<select onchange="omAgTecnico(this.value)" class="bg-neutral-900/40 border border-neutral-800 text-neutral-300 text-[12px] px-2.5 py-2 outline-none focus:border-blue-500/60">
        <option value="todos" ${agState().tecnico === 'todos' ? 'selected' : ''}>Todos os técnicos</option>
        ${tecs.map(t => `<option value="${esc(t.id)}" ${String(agState().tecnico) === String(t.id) ? 'selected' : ''}>${esc(t.nome)}</option>`).join('')}
      </select>`;
    const legend = ['agendada', 'deslocamento', 'em_atendimento', 'finalizada'].map(s =>
      `<span class="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-neutral-500"><span class="w-2 h-2 ${AG_DOT[s]}"></span>${STATUS[s].label}</span>`).join('');
    return `
      <div class="flex flex-col gap-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <div class="flex items-center gap-1">
              <button onclick="omAgNav(-1)" class="w-8 h-8 grid place-items-center border border-neutral-800 hover:border-neutral-600 text-neutral-300"><i data-lucide="chevron-left" class="w-4 h-4"></i></button>
              <button onclick="omAgHoje()" class="px-3 h-8 border border-neutral-800 hover:border-neutral-600 text-[10px] font-black uppercase tracking-wider text-neutral-300">Hoje</button>
              <button onclick="omAgNav(1)" class="w-8 h-8 grid place-items-center border border-neutral-800 hover:border-neutral-600 text-neutral-300"><i data-lucide="chevron-right" class="w-4 h-4"></i></button>
            </div>
            <div class="text-[14px] font-black text-white capitalize">${agPeriodLabel()}</div>
          </div>
          <div class="flex items-center gap-2">
            ${tecSel}
            <div class="flex border border-neutral-800 bg-neutral-900/40">${vbtn('mes', 'calendar-days', 'Mês')}${vbtn('semana', 'calendar-range', 'Semana')}${vbtn('dia', 'calendar', 'Dia')}</div>
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1">${legend}</div>
      </div>`;
  }
  function agUnscheduledHTML() {
    const list = agUnscheduled(agFiltered());
    if (!list.length) {
      return `<div class="mt-3 flex items-center gap-2 px-3 py-2 border border-neutral-800 bg-neutral-900/20 text-[11px] font-bold text-neutral-500">
        <i data-lucide="check-circle-2" class="w-3.5 h-3.5 text-emerald-400"></i>Tudo agendado — nenhuma OS sem data.</div>`;
    }
    const chips = list.map(o => `<div draggable="true" ondragstart="omAgDragStart(event,'${esc(o.id)}')"
        class="shrink-0 flex items-center gap-2 px-2.5 py-1.5 border border-neutral-800 bg-neutral-950 hover:border-blue-500/40 cursor-pointer"
        onclick="omAgAbrirOS('${esc(o.id)}')" title="Arraste para um dia ou clique no calendário para reagendar">
        <span class="w-1.5 h-1.5 rounded-full bg-yellow-400"></span>
        <span class="text-[11px] font-bold text-neutral-200 truncate max-w-[160px]">${esc(o.cliente || o.tipo_servico || o.numero)}</span>
        <button onclick="event.stopPropagation();omAgReagendarPrompt('${esc(o.id)}')" title="Reagendar" class="text-neutral-500 hover:text-blue-300"><i data-lucide="calendar-plus" class="w-3.5 h-3.5"></i></button>
      </div>`).join('');
    return `<div class="mt-3 border border-amber-500/20 bg-amber-500/[0.04] p-3">
        <div class="flex items-center gap-2 mb-2">
          <i data-lucide="calendar-x" class="w-4 h-4 text-amber-400"></i>
          <span class="text-[11px] font-black uppercase tracking-widest text-amber-300">Não agendadas</span>
          <span class="text-[10px] font-bold text-amber-400/70">${list.length}</span>
        </div>
        <div class="flex gap-2 overflow-x-auto pb-1">${chips}</div>
      </div>`;
  }

  // ---------- render / repaint ---------------------------------------------
  function agPaintShell() {
    const shell = document.getElementById('om-agenda-shell');
    if (!shell) return;
    shell.innerHTML = agToolbarHTML() + agUnscheduledHTML() + `<div class="mt-3">${agBodyHTML()}</div>`;
    icons();
  }
  async function omRenderAgendaTab(container) {
    if (!listRows) {
      container.innerHTML = loadingHTML('Carregando agenda…'); icons();
      const { data, error } = await sb.rpc('list_om_os');
      if (error) { container.innerHTML = erroHTML(error); icons(); return; }
      listRows = data || [];
    }
    agState();
    const head = (typeof omPageHeader === 'function')
      ? omPageHeader({ icon: 'calendar-days', title: 'Agenda', subtitle: 'Tudo que está agendado — e o que ainda falta agendar.' })
      : `<h1 class="text-xl font-black text-white mb-4">Agenda</h1>`;
    container.innerHTML = `<div class="om-env animate-fade-in-up">${head}<div id="om-agenda-shell"></div></div>`;
    agPaintShell();
  }

  // ---------- navegação / filtros ------------------------------------------
  function omAgViewSet(v) { agState().view = v; agPaintShell(); }
  function omAgNav(delta) {
    const a = agAnchorDate(), v = agState().view;
    const n = v === 'mes' ? addMonths(a, delta) : v === 'semana' ? addDays(a, 7 * delta) : addDays(a, delta);
    agState().anchor = ymd(n); agPaintShell();
  }
  function omAgHoje() { agState().anchor = ymd(new Date()); agPaintShell(); }
  function omAgTecnico(v) { agState().tecnico = v; agPaintShell(); }
  function omAgOpenDay(key) { agState().anchor = key; agState().view = 'dia'; agPaintShell(); }
  function omAgAbrirOS(id) {
    if (typeof setTab === 'function') setTab('os');
    else { state.omActiveTab = 'os'; if (typeof renderTabs === 'function') renderTabs(); }
    omOsAbrir(id);
  }

  // ---------- reagendar -----------------------------------------------------
  function omAgDragStart(ev, id) { agDragId = id; try { ev.dataTransfer.setData('text/plain', id); ev.dataTransfer.effectAllowed = 'move'; } catch (_) {} }
  function omAgDragOver(ev) { ev.preventDefault(); try { ev.dataTransfer.dropEffect = 'move'; } catch (_) {} }
  function omAgDrop(ev, key) {
    ev.preventDefault();
    const id = agDragId || (ev.dataTransfer && ev.dataTransfer.getData('text/plain'));
    agDragId = null;
    if (!id) return;
    const o = (listRows || []).find(x => x.id === id);
    if (!o) return;
    let hh = 8, mm = 0;
    if (o.agendado_para) { const d = new Date(o.agendado_para); hh = d.getHours(); mm = d.getMinutes(); }
    const dt = parseYmd(key); dt.setHours(hh, mm, 0, 0);
    omAgReagendar(id, dt.toISOString());
  }
  function omAgReagendarPrompt(id) {
    const o = (listRows || []).find(x => x.id === id);
    if (!o) return;
    const val = o.agendado_para ? agToLocalInput(o.agendado_para) : agDefaultInput();
    if (typeof omOpenModal !== 'function') {
      const r = window.prompt('Nova data e hora (AAAA-MM-DD HH:MM):', val.replace('T', ' '));
      if (!r) return;
      const dt = new Date(r.replace(' ', 'T'));
      if (isNaN(dt)) { toast('Data inválida.'); return; }
      omAgReagendar(id, dt.toISOString());
      return;
    }
    omOpenModal({
      title: 'Reagendar OS', icon: 'calendar-clock',
      subtitle: esc((o.numero ? o.numero + ' · ' : '') + (o.cliente || '')),
      bodyHTML: `<label class="block"><span class="text-[10px] font-black uppercase tracking-widest text-neutral-500">Data e hora</span>
        <input type="datetime-local" id="om-ag-reag-input" value="${val}" class="mt-1 w-full bg-neutral-900 border border-neutral-800 focus:border-blue-500/60 outline-none px-3 py-2.5 text-white text-[14px]"></label>`,
      footerHTML: `<button onclick="omCloseModal()" class="px-4 py-2.5 bg-neutral-900 border border-neutral-800 text-neutral-300 font-black text-[10px] uppercase tracking-widest">Cancelar</button>
        <button onclick="omAgReagendarConfirm('${esc(id)}')" class="px-4 py-2.5 bg-blue-500 hover:bg-blue-400 text-blue-950 font-black text-[10px] uppercase tracking-widest">Salvar</button>`,
    });
  }
  function omAgReagendarConfirm(id) {
    const el = document.getElementById('om-ag-reag-input');
    if (!el || !el.value) { toast('Escolha data e hora.'); return; }
    const iso = new Date(el.value).toISOString();
    if (typeof omCloseModal === 'function') omCloseModal();
    omAgReagendar(id, iso);
  }
  async function omAgReagendar(id, iso) {
    try {
      const { error } = await sb.rpc('om_os_reagendar', { p_os_id: id, p_agendado_para: iso });
      if (error) throw error;
      const o = (listRows || []).find(x => x.id === id);
      if (o) o.agendado_para = iso;
      toast('OS reagendada.');
    } catch (e) { toast(friendlyErr(e)); }
    agPaintShell();
  }

  // ==========================================================================
  // Exposição global (handlers usados via onclick e pelo roteador do om.js)
  // ==========================================================================
  Object.assign(window, {
    omRenderOSTab,
    omOsView, omOsFiltro, omOsSort, omOsBusca, omOsKanbanTab,
    omOsAbrir, omOsVoltar, omOsSubtab, omOsFlow,
    omOsItemToggle, omOsItemExpand, omOsObsSave,
    omOsAddFoto, omOsVerFoto, omOsFotoPick, omOsFotoCancel,
    omOsProblemaAbrir, omOsProblemaCancelar, omOsProblemaGravidade,
    omOsProblemaRetorno, omOsProblemaFoto, omOsProblemaSalvar,
    omOsFinalizarAbrir, omOsFinalizarCancelar, omOsFinalizarEstado, omOsFinalizarConfirmar,
    omRenderAgendaTab, omAgViewSet, omAgNav, omAgHoje, omAgTecnico, omAgOpenDay, omAgAbrirOS,
    omAgDragStart, omAgDragOver, omAgDrop, omAgReagendarPrompt, omAgReagendarConfirm,
  });
})();
