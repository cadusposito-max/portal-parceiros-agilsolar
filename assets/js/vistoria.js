// ==========================================================================
// VISTORIA — 4º ambiente (operação de campo). Espelha o padrão de financeiro.js
// (IIFE + renderVistoriaRoute como entry-point). Acento VERMELHO (--vis-*).
//
// FASE 0: ambiente ligado + dashboard "Visão Geral" com KPIs mock. As demais
// abas mostram um placeholder "em construção" para a navegação não quebrar.
// O backend real (Supabase) entra só na fase final — até lá, dados são mock.
// ==========================================================================
(function () {
  'use strict';

  /* ------------------------------------------------------------- CHROME */
  function visEnsureChrome() {
    if (!document.getElementById('vis-toasts')) {
      const t = document.createElement('div');
      t.id = 'vis-toasts';
      t.className = 'fixed top-4 inset-x-0 z-[80] flex flex-col items-center gap-2 px-4 pointer-events-none';
      document.body.appendChild(t);
    }
    if (!document.getElementById('vis-modal')) {
      const m = document.createElement('div');
      m.id = 'vis-modal';
      m.className = 'fixed inset-0 z-[90] items-end sm:items-center justify-center';
      m.innerHTML = `
        <div class="absolute inset-0 bg-black/75 backdrop-blur-sm" onclick="closeVisModal()"></div>
        <div id="vis-modal-card" class="relative w-full sm:max-w-lg bg-[#0a0a0a] border border-neutral-800 max-h-[92vh] overflow-y-auto custom-scrollbar"></div>`;
      document.body.appendChild(m);
    }
  }

  function visToast(msg, type) {
    visEnsureChrome();
    const wrap = document.getElementById('vis-toasts');
    const tones = { ok:'border-emerald-500/40 text-emerald-300', info:'border-[color:var(--vis-border-40)] vis-acc', warn:'border-yellow-500/40 text-yellow-300', err:'border-red-500/40 text-red-300' };
    const icons = { ok:'check-circle', info:'info', warn:'alert-triangle', err:'x-circle' };
    const t = document.createElement('div');
    t.className = `vis-toast-in pointer-events-auto flex items-center gap-2.5 px-4 py-3 bg-[#0a0a0a] border ${tones[type]||tones.ok} text-[11px] font-black uppercase tracking-widest shadow-2xl max-w-[90vw]`;
    t.innerHTML = `<i data-lucide="${icons[type]||icons.ok}" class="w-4 h-4 shrink-0"></i><span class="truncate">${msg}</span>`;
    wrap.appendChild(t);
    if (window.lucide) lucide.createIcons();
    setTimeout(() => { t.style.transition='opacity .3s, transform .3s'; t.style.opacity='0'; t.style.transform='translateY(-8px)'; setTimeout(()=>t.remove(),300); }, 2800);
  }

  function closeVisModal() {
    const m = document.getElementById('vis-modal');
    if (m) m.classList.remove('is-open');
  }
  function openVisModal(html) {
    visEnsureChrome();
    const card = document.getElementById('vis-modal-card');
    const m = document.getElementById('vis-modal');
    if (!card || !m) return;
    card.innerHTML = html;
    m.classList.add('is-open');
    if (window.lucide) lucide.createIcons();
  }

  const visIcons = () => { if (window.lucide) lucide.createIcons(); };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

  /* ------------------------------------------------------------- MOCK */
  // Dados de demonstração até a fase Supabase. Valores plausíveis de operação.
  const MOCK_KPIS = [
    { id:'hoje',       label:'Vistorias hoje',       value:4,  icon:'calendar-check', tone:'vis',     hint:'2 concluídas · 2 pendentes' },
    { id:'agendar',    label:'Aguardando agendar',   value:7,  icon:'calendar-clock', tone:'amber',   hint:'novas solicitações' },
    { id:'campo',      label:'Em campo agora',       value:2,  icon:'map-pin',        tone:'sky',     hint:'equipes em deslocamento/local' },
    { id:'aprovacao',  label:'Aguardando aprovação', value:3,  icon:'clipboard-check',tone:'vis',     hint:'laudos em análise' },
    { id:'pendentes',  label:'Pendências abertas',   value:5,  icon:'alert-triangle', tone:'amber',   hint:'foto/checklist/assinatura' },
    { id:'reprovadas', label:'Reprovadas (mês)',     value:1,  icon:'x-circle',       tone:'red',     hint:'voltaram p/ validação técnica' },
    { id:'laudos',     label:'Laudos pendentes',     value:3,  icon:'file-clock',     tone:'sky',     hint:'aguardando emissão' },
    { id:'tempo',      label:'Tempo médio',          value:'1h48', icon:'timer',      tone:'neutral', hint:'chegada → finalização' },
  ];

  const MOCK_AGENDA = [
    { hora:'08:30', cliente:'Marcos Vinícius',    cidade:'Goiânia · St. Bueno',  equipe:'Equipe A', prio:'alta',    status:'agendada' },
    { hora:'10:00', cliente:'Padaria Pão Nosso',  cidade:'Aparecida de Goiânia', equipe:'Equipe A', prio:'normal',  status:'deslocamento' },
    { hora:'13:30', cliente:'Cláudia Fernandes',  cidade:'Goiânia · St. Oeste',  equipe:'Equipe B', prio:'normal',  status:'agendada' },
    { hora:'15:30', cliente:'Mercado União',      cidade:'Senador Canedo',       equipe:'Equipe B', prio:'alta',    status:'agendada' },
  ];

  const MOCK_ATIV = [
    { t:'há 12 min', who:'Equipe A',  what:'finalizou a vistoria de <b>Joaquim Pereira</b> — resultado <span class="text-emerald-400 font-black">Aprovada</span>' },
    { t:'há 40 min', who:'Financeiro',what:'moveu <b>Mercado União</b> p/ Validação Técnica — vistoria criada automaticamente' },
    { t:'há 1 h',    who:'Equipe B',  what:'enviou 8 fotos da vistoria de <b>Cláudia Fernandes</b>' },
    { t:'há 2 h',    who:'Ana (coord.)', what:'agendou vistoria de <b>Padaria Pão Nosso</b> p/ amanhã 10:00' },
    { t:'ontem',     who:'Equipe A',  what:'reprovou vistoria de <b>Edifício Aurora</b> — <span class="text-red-400 font-black">padrão insuficiente</span>' },
  ];

  // Etapas do funil de Vistoria (índice = posição). Espelha o modelo do Financeiro
  // (etapa como smallint). `kind` agrupa cor: solicitação, campo, decisão, fim.
  const FUNIL_STAGES = [
    { l:'Nova Solicitação',       k:'novo'  },
    { l:'Aguardando Agendamento', k:'novo'  },
    { l:'Agendada',               k:'campo' },
    { l:'Equipe Designada',       k:'campo' },
    { l:'Em Deslocamento',        k:'campo' },
    { l:'Em Campo',               k:'campo' },
    { l:'Checklist',              k:'campo' },
    { l:'Fotos',                  k:'campo' },
    { l:'Laudo',                  k:'campo' },
    { l:'Aguardando Aprovação',   k:'dec'   },
    { l:'Aprovada',               k:'ok'    },
    { l:'Reprovada',              k:'bad'   },
    { l:'Aguardando Correção',    k:'dec'   },
    { l:'Emissão de Laudo',       k:'ok'    },
    { l:'Finalizada',             k:'fim'   },
  ];

  // Carteira de vistorias (mock, mutável: mover etapa atualiza em memória).
  let VIS_FUNIL = [
    { id:'V-0418', cliente:'Mercado União',     cidade:'Senador Canedo',       equipe:'—',        prio:'alta',   etapa:0,  pot:'92 kWp',  origem:'Financeiro' },
    { id:'V-0417', cliente:'Cláudia Fernandes',  cidade:'Goiânia · St. Oeste',  equipe:'—',        prio:'normal', etapa:1,  pot:'8,2 kWp', origem:'Manual' },
    { id:'V-0416', cliente:'Padaria Pão Nosso',  cidade:'Aparecida de Goiânia', equipe:'Equipe A', prio:'normal', etapa:2,  pot:'15 kWp',  origem:'Financeiro' },
    { id:'V-0415', cliente:'Marcos Vinícius',    cidade:'Goiânia · St. Bueno',  equipe:'Equipe A', prio:'alta',   etapa:3,  pot:'10,4 kWp',origem:'Financeiro' },
    { id:'V-0414', cliente:'Auto Posto Trevo',   cidade:'Trindade',             equipe:'Equipe B', prio:'normal', etapa:5,  pot:'54 kWp',  origem:'Financeiro' },
    { id:'V-0413', cliente:'Lúcia Andrade',      cidade:'Goiânia · St. Sul',    equipe:'Equipe B', prio:'normal', etapa:7,  pot:'6,1 kWp', origem:'Manual' },
    { id:'V-0412', cliente:'Condomínio Vista',   cidade:'Goiânia · Jd. Goiás',  equipe:'Equipe A', prio:'alta',   etapa:9,  pot:'120 kWp', origem:'Financeiro' },
    { id:'V-0411', cliente:'Joaquim Pereira',    cidade:'Goianira',             equipe:'Equipe A', prio:'normal', etapa:10, pot:'7,4 kWp', origem:'Financeiro' },
    { id:'V-0410', cliente:'Edifício Aurora',    cidade:'Goiânia · St. Marista',equipe:'Equipe B', prio:'alta',   etapa:11, pot:'48 kWp',  origem:'Financeiro' },
    { id:'V-0409', cliente:'Sítio Boa Esperança',cidade:'Hidrolândia',          equipe:'Equipe B', prio:'normal', etapa:12, pot:'22 kWp',  origem:'Manual' },
    { id:'V-0408', cliente:'Ana Paula Souza',    cidade:'Goiânia · St. Pedro',  equipe:'Equipe A', prio:'normal', etapa:13, pot:'9,8 kWp', origem:'Financeiro' },
    { id:'V-0407', cliente:'Restaurante Sabor',  cidade:'Aparecida de Goiânia', equipe:'Equipe A', prio:'normal', etapa:14, pot:'18 kWp',  origem:'Financeiro' },
  ];

  // Agenda (mock): visitas com data ISO (yyyy-mm-dd) relativa a hoje.
  function isoDay(offset) { const d = new Date(); d.setDate(d.getDate()+offset); return d.toISOString().slice(0,10); }
  const VIS_AGENDA = [
    { dia:isoDay(0),  hora:'08:30', cliente:'Marcos Vinícius',   cidade:'Goiânia · St. Bueno',  equipe:'Equipe A', prio:'alta',   status:'agendada' },
    { dia:isoDay(0),  hora:'10:00', cliente:'Padaria Pão Nosso', cidade:'Aparecida de Goiânia', equipe:'Equipe A', prio:'normal', status:'deslocamento' },
    { dia:isoDay(0),  hora:'13:30', cliente:'Cláudia Fernandes', cidade:'Goiânia · St. Oeste',  equipe:'Equipe B', prio:'normal', status:'agendada' },
    { dia:isoDay(0),  hora:'15:30', cliente:'Mercado União',     cidade:'Senador Canedo',       equipe:'Equipe B', prio:'alta',   status:'agendada' },
    { dia:isoDay(1),  hora:'09:00', cliente:'Auto Posto Trevo',  cidade:'Trindade',             equipe:'Equipe B', prio:'normal', status:'agendada' },
    { dia:isoDay(1),  hora:'14:00', cliente:'Lúcia Andrade',     cidade:'Goiânia · St. Sul',    equipe:'Equipe A', prio:'normal', status:'agendada' },
    { dia:isoDay(2),  hora:'08:00', cliente:'Condomínio Vista',  cidade:'Goiânia · Jd. Goiás',  equipe:'Equipe A', prio:'alta',   status:'agendada' },
    { dia:isoDay(2),  hora:'11:00', cliente:'Sítio Boa Esperança',cidade:'Hidrolândia',         equipe:'Equipe B', prio:'normal', status:'agendada' },
    { dia:isoDay(3),  hora:'10:30', cliente:'Restaurante Sabor', cidade:'Aparecida de Goiânia', equipe:'Equipe A', prio:'normal', status:'agendada' },
  ];

  // Templates de checklist por tipo de vistoria (mock).
  const MOCK_CHECKLISTS = [
    { id:'res',  nome:'Residencial — telhado',  blocos:7, itens:18, uso:'padrão p/ até 15 kWp' },
    { id:'com',  nome:'Comercial — laje/metálico', blocos:7, itens:22, uso:'15–75 kWp' },
    { id:'usina',nome:'Usina / solo',           blocos:8, itens:31, uso:'acima de 75 kWp' },
    { id:'padr', nome:'Padrão de entrada',       blocos:3, itens:9,  uso:'troca/adequação de padrão' },
  ];

  // Pendências (central única).
  const MOCK_PEND = [
    { tipo:'Foto faltando',       os:'V-0416', cliente:'Padaria Pão Nosso', det:'categoria “Medidor” sem foto', sev:'media' },
    { tipo:'Checklist incompleto',os:'V-0413', cliente:'Lúcia Andrade',     det:'bloco Elétrica 2/5 itens',     sev:'media' },
    { tipo:'Assinatura pendente', os:'V-0412', cliente:'Condomínio Vista',  det:'falta assinatura do cliente',  sev:'alta' },
    { tipo:'GPS inválido',        os:'V-0414', cliente:'Auto Posto Trevo',  det:'chegada a 1,2 km do endereço', sev:'alta' },
    { tipo:'Laudo pendente',      os:'V-0408', cliente:'Ana Paula Souza',   det:'aguardando emissão',           sev:'baixa' },
  ];

  // Equipes de campo.
  const MOCK_EQUIPES = [
    { nome:'Equipe A', tel:'(62) 98111-0001', cidade:'Goiânia',  esp:'Telhado · Laje', status:'em campo', hoje:2 },
    { nome:'Equipe B', tel:'(62) 98111-0002', cidade:'Região metropolitana', esp:'Usina · Solo', status:'disponível', hoje:2 },
    { nome:'Equipe C', tel:'(62) 98111-0003', cidade:'Anápolis', esp:'Padrão · Elétrica', status:'folga', hoje:0 },
  ];

  // Histórico (timeline estendida).
  const MOCK_HIST = [
    { t:'Hoje · 14:02', who:'Equipe A',    what:'finalizou <b>Joaquim Pereira</b> — <span class="text-emerald-400 font-black">Aprovada</span>' },
    { t:'Hoje · 13:20', who:'Financeiro',  what:'<b>Mercado União</b> entrou em Validação Técnica — vistoria criada' },
    { t:'Hoje · 11:48', who:'Equipe B',    what:'enviou 8 fotos de <b>Cláudia Fernandes</b>' },
    { t:'Hoje · 09:30', who:'Ana (coord.)',what:'agendou <b>Padaria Pão Nosso</b>' },
    { t:'Ontem · 16:10',who:'Equipe A',    what:'reprovou <b>Edifício Aurora</b> — <span class="text-red-400 font-black">padrão insuficiente</span>' },
    { t:'Ontem · 10:05',who:'Sistema',     what:'laudo emitido para <b>Restaurante Sabor</b> → enviado à Engenharia' },
  ];

  /* ------------------------------------------------------- DASHBOARD */
  const toneCls = {
    vis:     { ic:'vis-acc', chip:'vis-acc-chip' },
    amber:   { ic:'text-amber-400',  chip:'bg-amber-400/10 text-amber-300' },
    sky:     { ic:'text-sky-400',    chip:'bg-sky-400/10 text-sky-300' },
    red:     { ic:'text-red-400',    chip:'bg-red-500/10 text-red-300' },
    neutral: { ic:'text-neutral-300',chip:'bg-neutral-500/10 text-neutral-300' },
  };

  function kpiCard(k) {
    const tc = toneCls[k.tone] || toneCls.neutral;
    return `
      <div class="metric-card relative p-4 bg-[#0c0c0c]">
        <div class="flex items-start justify-between">
          <span class="text-[9px] font-black uppercase tracking-widest text-neutral-500">${esc(k.label)}</span>
          <i data-lucide="${k.icon}" class="w-4 h-4 ${tc.ic}"></i>
        </div>
        <div class="mt-3 text-3xl font-black text-white num leading-none">${esc(k.value)}</div>
        <div class="mt-2 text-[10px] font-medium text-neutral-500 leading-snug">${esc(k.hint)}</div>
      </div>`;
  }

  const prioChip = p => p==='alta'
    ? '<span class="vis-acc-chip text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5">Alta</span>'
    : '<span class="bg-neutral-700/40 text-neutral-300 text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5">Normal</span>';

  const statusChip = s => {
    const map = {
      agendada:     ['Agendada','bg-neutral-700/40 text-neutral-200'],
      deslocamento: ['Em deslocamento','bg-sky-500/10 text-sky-300'],
      campo:        ['Em campo','bg-amber-500/10 text-amber-300'],
    };
    const [l,c] = map[s] || map.agendada;
    return `<span class="${c} text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5">${l}</span>`;
  };

  function visaoHTML() {
    const kpis = MOCK_KPIS.map(kpiCard).join('');
    const agenda = MOCK_AGENDA.map(a => `
      <button onclick="visOpenOSPlaceholder('${esc(a.cliente)}')" class="w-full text-left flex items-center gap-3 px-3 py-2.5 border-b border-neutral-800/70 hover:bg-neutral-900/60 transition-colors">
        <span class="num text-sm font-black text-white w-12 shrink-0">${esc(a.hora)}</span>
        <div class="min-w-0 flex-1">
          <div class="text-[12px] font-black text-neutral-100 truncate">${esc(a.cliente)}</div>
          <div class="text-[10px] text-neutral-500 truncate">${esc(a.cidade)} · ${esc(a.equipe)}</div>
        </div>
        <div class="flex flex-col items-end gap-1 shrink-0">${prioChip(a.prio)}${statusChip(a.status)}</div>
      </button>`).join('');

    const ativ = MOCK_ATIV.map(a => `
      <div class="flex gap-3 px-3 py-2.5 border-b border-neutral-800/70">
        <div class="w-1.5 h-1.5 mt-1.5 rounded-full bg-[color:var(--vis)] shrink-0"></div>
        <div class="min-w-0 flex-1">
          <div class="text-[11px] text-neutral-300 leading-snug">${a.what}</div>
          <div class="text-[9px] font-bold uppercase tracking-widest text-neutral-600 mt-0.5">${esc(a.who)} · ${esc(a.t)}</div>
        </div>
      </div>`).join('');

    return `
      <!-- Cabeçalho -->
      <div class="vis-deep p-5 md:p-6 mb-6 relative overflow-hidden">
        <div class="relative">
          <div class="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.25em] vis-deep-label">
            <i data-lucide="radar" class="w-3.5 h-3.5"></i> Central de Vistoria
          </div>
          <h1 class="mt-2 text-2xl md:text-3xl font-black text-white uppercase tracking-wide">Operação de campo</h1>
          <p class="mt-1 text-[12px] text-neutral-400 max-w-2xl">Solicitação, agendamento, ordem de serviço, checklist, fotos, assinatura e laudo — tudo no portal, do escritório ao telhado.</p>
        </div>
        <div class="mt-4 flex flex-wrap gap-2">
          <button onclick="visNovaVistoria()" class="vis-acc-solid inline-flex items-center gap-2 px-4 py-2 text-[10px] font-black uppercase tracking-widest">
            <i data-lucide="plus" class="w-3.5 h-3.5"></i> Nova vistoria
          </button>
          <button onclick="setTab('agenda')" class="inline-flex items-center gap-2 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-neutral-300 border border-neutral-700 hover:border-[color:var(--vis-border-40)] transition-colors">
            <i data-lucide="calendar-days" class="w-3.5 h-3.5"></i> Abrir agenda
          </button>
          <button onclick="setTab('funil')" class="inline-flex items-center gap-2 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-neutral-300 border border-neutral-700 hover:border-[color:var(--vis-border-40)] transition-colors">
            <i data-lucide="git-merge" class="w-3.5 h-3.5"></i> Ver funil
          </button>
        </div>
      </div>

      <!-- KPIs -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">${kpis}</div>

      <!-- Agenda de hoje + atividades -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div class="border border-neutral-800 bg-[#0a0a0a]">
          <div class="flex items-center justify-between px-3 py-2.5 border-b border-neutral-800">
            <span class="text-[10px] font-black uppercase tracking-widest text-neutral-300 flex items-center gap-2"><i data-lucide="calendar-days" class="w-3.5 h-3.5 vis-acc"></i> Agenda de hoje</span>
            <button onclick="setTab('agenda')" class="text-[9px] font-black uppercase tracking-widest vis-acc hover:underline">Ver tudo</button>
          </div>
          <div>${agenda}</div>
        </div>
        <div class="border border-neutral-800 bg-[#0a0a0a]">
          <div class="flex items-center justify-between px-3 py-2.5 border-b border-neutral-800">
            <span class="text-[10px] font-black uppercase tracking-widest text-neutral-300 flex items-center gap-2"><i data-lucide="history" class="w-3.5 h-3.5 vis-acc"></i> Últimas atividades</span>
            <button onclick="setTab('historico')" class="text-[9px] font-black uppercase tracking-widest vis-acc hover:underline">Histórico</button>
          </div>
          <div>${ativ}</div>
        </div>
      </div>`;
  }

  /* ------------------------------------------------- PLACEHOLDERS */
  // Cada aba ainda não construída mostra seu objetivo + a fase em que chega.
  const PHASE_PANELS = {};

  function phasePanelHTML(tabId) {
    const p = PHASE_PANELS[tabId];
    if (!p) return visaoHTML();
    return `
      <div class="border border-neutral-800 bg-[#0a0a0a] p-10 md:p-14 text-center">
        <div class="w-14 h-14 mx-auto grid place-items-center vis-acc-chip mb-5">
          <i data-lucide="${p.icon}" class="w-7 h-7"></i>
        </div>
        <div class="inline-flex items-center gap-1.5 vis-acc-chip text-[9px] font-black uppercase tracking-widest px-2 py-1 mb-3">
          <i data-lucide="hammer" class="w-3 h-3"></i> ${esc(p.phase)} · em construção
        </div>
        <h2 class="text-xl font-black text-white uppercase tracking-wide">${esc(p.title)}</h2>
        <p class="mt-2 text-[12px] text-neutral-500 max-w-md mx-auto leading-relaxed">${esc(p.desc)}</p>
        <button onclick="setTab('visao')" class="mt-6 inline-flex items-center gap-2 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-neutral-300 border border-neutral-700 hover:border-[color:var(--vis-border-40)] transition-colors">
          <i data-lucide="arrow-left" class="w-3.5 h-3.5"></i> Voltar à visão geral
        </button>
      </div>`;
  }

  /* --------------------------------------------------- AÇÕES (mock) */
  function visNovaVistoria() {
    openVisModal(`
      <div class="p-5">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-sm font-black uppercase tracking-widest text-white flex items-center gap-2"><i data-lucide="plus-circle" class="w-4 h-4 vis-acc"></i> Nova vistoria</h3>
          <button onclick="closeVisModal()" class="text-neutral-500 hover:text-white"><i data-lucide="x" class="w-4 h-4"></i></button>
        </div>
        <p class="text-[12px] text-neutral-400 leading-relaxed">
          A criação manual de vistoria (vinculando projeto/cliente) entra na <b class="vis-acc">Fase 1</b>, junto com o funil.
          A criação <b>automática</b> a partir do Financeiro (etapa “Validação Técnica”) é ligada na <b class="vis-acc">Fase 5</b>.
        </p>
        <div class="mt-5 flex justify-end">
          <button onclick="closeVisModal()" class="vis-acc-solid px-4 py-2 text-[10px] font-black uppercase tracking-widest">Entendi</button>
        </div>
      </div>`);
  }

  // Abre a OS de campo (vistoria-os.js). Aceita id do funil ou nome do cliente.
  function visOpenOSPlaceholder(idOrNome) {
    if (typeof window.visOpenOS === 'function') window.visOpenOS(idOrNome);
    else visToast('Motor da OS não carregado', 'err');
  }

  // Localiza um registro p/ a OS: por id no funil, senão por cliente em funil/agenda,
  // senão devolve um stub básico (operação ainda local-first / mock).
  function visFindRecord(idOrNome) {
    let r = VIS_FUNIL.find(x => x.id === idOrNome) || VIS_FUNIL.find(x => x.cliente === idOrNome);
    if (!r) { const a = VIS_AGENDA.find(x => x.cliente === idOrNome); if (a) r = { id:'V-AG', cliente:a.cliente, cidade:a.cidade, equipe:a.equipe, prio:a.prio }; }
    return r || { cliente: idOrNome };
  }

  /* --------------------------------------------------------- FUNIL */
  const STAGE_KIND = {
    novo:  { dot:'bg-neutral-500',  chip:'bg-neutral-700/40 text-neutral-200' },
    campo: { dot:'bg-[color:var(--vis)]', chip:'vis-acc-chip' },
    dec:   { dot:'bg-amber-400',    chip:'bg-amber-400/10 text-amber-300' },
    ok:    { dot:'bg-emerald-400',  chip:'bg-emerald-500/10 text-emerald-300' },
    bad:   { dot:'bg-red-500',      chip:'bg-red-500/10 text-red-300' },
    fim:   { dot:'bg-sky-400',      chip:'bg-sky-500/10 text-sky-300' },
  };

  function funilEquipes() {
    return ['todas', ...Array.from(new Set(VIS_FUNIL.map(c => c.equipe).filter(e => e && e !== '—')))];
  }

  function funilCardHTML(c) {
    const k = STAGE_KIND[FUNIL_STAGES[c.etapa].k] || STAGE_KIND.novo;
    return `
      <button onclick="visOpenFunilDetail('${c.id}')" class="w-full text-left bg-[#0c0c0c] border border-neutral-800 hover:border-[color:var(--vis-border-40)] p-2.5 transition-colors">
        <div class="flex items-center justify-between gap-2">
          <span class="num text-[10px] font-black text-neutral-500">${esc(c.id)}</span>
          ${c.prio==='alta' ? '<span class="vis-acc-chip text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5">Alta</span>' : ''}
        </div>
        <div class="mt-1 text-[12px] font-black text-neutral-100 truncate">${esc(c.cliente)}</div>
        <div class="text-[10px] text-neutral-500 truncate">${esc(c.cidade)}</div>
        <div class="mt-1.5 flex items-center justify-between text-[9px] font-bold uppercase tracking-widest text-neutral-600">
          <span class="num">${esc(c.pot)}</span>
          <span>${esc(c.equipe)}</span>
        </div>
      </button>`;
  }

  function funilHTML() {
    const f = (state.visFilters && state.visFilters.funil) || (state.visFilters.funil = { search:'', equipe:'todas' });
    const eqOpts = funilEquipes().map(e => `<option value="${esc(e)}" ${f.equipe===e?'selected':''}>${e==='todas'?'Todas as equipes':esc(e)}</option>`).join('');
    const rows = VIS_FUNIL.filter(c => f.equipe==='todas' || c.equipe===f.equipe);

    const columns = FUNIL_STAGES.map((stage, i) => {
      const cards = rows.filter(c => c.etapa===i);
      const k = STAGE_KIND[stage.k] || STAGE_KIND.novo;
      return `
        <div class="shrink-0 w-[230px] flex flex-col">
          <div class="flex items-center justify-between px-3 py-2.5 bg-neutral-950 border border-neutral-800 border-b-0">
            <div class="flex items-center gap-2 min-w-0">
              <span class="w-1.5 h-1.5 rounded-full ${k.dot} shrink-0"></span>
              <span class="text-[10px] font-black uppercase tracking-wider text-neutral-300 truncate">${esc(stage.l)}</span>
            </div>
            <span class="text-[9px] font-black text-neutral-600 shrink-0">${cards.length}</span>
          </div>
          <div class="flex-1 space-y-2 p-2 bg-neutral-900/20 border border-neutral-800 min-h-[120px]">
            ${cards.map(funilCardHTML).join('') || '<div class="text-[9px] font-bold uppercase tracking-widest text-neutral-700 text-center py-6">vazio</div>'}
          </div>
        </div>`;
    }).join('');

    return `
      <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 class="text-xl font-black text-white uppercase tracking-wide flex items-center gap-2"><i data-lucide="git-merge" class="w-5 h-5 vis-acc"></i> Funil de Vistoria</h1>
          <p class="text-[11px] text-neutral-500 mt-0.5">${rows.length} vistorias · da solicitação à finalização</p>
        </div>
        <div class="flex items-center gap-2">
          <select onchange="visFunilFilter('equipe', this.value)" class="bg-[#0c0c0c] border border-neutral-800 text-[10px] font-black uppercase tracking-widest text-neutral-300 px-3 py-2 vis-acc-focus">${eqOpts}</select>
          <button onclick="visNovaVistoria()" class="vis-acc-solid inline-flex items-center gap-2 px-4 py-2 text-[10px] font-black uppercase tracking-widest"><i data-lucide="plus" class="w-3.5 h-3.5"></i> Nova vistoria</button>
        </div>
      </div>
      <div class="overflow-x-auto custom-scrollbar pb-3">
        <div class="flex gap-3 min-w-min">${columns}</div>
      </div>`;
  }

  function visFunilFilter(key, val) {
    (state.visFilters.funil || (state.visFilters.funil = {}))[key] = val;
    visRefresh();
  }

  function visOpenFunilDetail(id) {
    const c = VIS_FUNIL.find(x => x.id===id); if (!c) return;
    const stage = FUNIL_STAGES[c.etapa];
    const k = STAGE_KIND[stage.k] || STAGE_KIND.novo;
    const canPrev = c.etapa > 0, canNext = c.etapa < FUNIL_STAGES.length-1;
    const field = (l,v) => `<div><div class="text-[9px] font-black uppercase tracking-widest text-neutral-600">${l}</div><div class="text-[12px] font-bold text-neutral-100 mt-0.5">${esc(v)}</div></div>`;
    openVisModal(`
      <div class="p-5">
        <div class="flex items-start justify-between mb-4">
          <div>
            <div class="num text-[10px] font-black text-neutral-500">${esc(c.id)}</div>
            <h3 class="text-base font-black text-white">${esc(c.cliente)}</h3>
            <span class="inline-flex items-center gap-1.5 mt-1.5 ${k.chip} text-[9px] font-black uppercase tracking-widest px-2 py-0.5"><span class="w-1.5 h-1.5 rounded-full ${k.dot}"></span>${esc(stage.l)}</span>
          </div>
          <button onclick="closeVisModal()" class="text-neutral-500 hover:text-white"><i data-lucide="x" class="w-4 h-4"></i></button>
        </div>
        <div class="grid grid-cols-2 gap-y-3 gap-x-4 py-4 border-y border-neutral-800">
          ${field('Cidade', c.cidade)}
          ${field('Potência', c.pot)}
          ${field('Equipe', c.equipe)}
          ${field('Prioridade', c.prio==='alta'?'Alta':'Normal')}
          ${field('Origem', c.origem)}
          ${field('Etapa', (c.etapa+1)+' de '+FUNIL_STAGES.length)}
        </div>
        <div class="mt-4 flex items-center gap-2">
          <button ${canPrev?'':'disabled'} onclick="visFunilMove('${c.id}',-1)" class="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-[10px] font-black uppercase tracking-widest border ${canPrev?'border-neutral-700 text-neutral-300 hover:border-neutral-500':'border-neutral-900 text-neutral-700 cursor-not-allowed'}"><i data-lucide="chevron-left" class="w-3.5 h-3.5"></i> Voltar etapa</button>
          <button ${canNext?'':'disabled'} onclick="visFunilMove('${c.id}',1)" class="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-[10px] font-black uppercase tracking-widest ${canNext?'vis-acc-solid':'border border-neutral-900 text-neutral-700 cursor-not-allowed'}">Avançar etapa <i data-lucide="chevron-right" class="w-3.5 h-3.5"></i></button>
        </div>
        <button onclick="visOpenOSPlaceholder('${esc(c.cliente)}')" class="mt-2 w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-neutral-400 border border-neutral-800 hover:border-[color:var(--vis-border-40)]"><i data-lucide="clipboard-list" class="w-3.5 h-3.5"></i> Abrir OS de campo</button>
      </div>`);
  }

  function visFunilMove(id, dir) {
    const c = VIS_FUNIL.find(x => x.id===id); if (!c) return;
    const next = c.etapa + dir;
    if (next < 0 || next >= FUNIL_STAGES.length) return;
    c.etapa = next;
    visToast(c.cliente + ' → ' + FUNIL_STAGES[next].l, 'ok');
    closeVisModal();
    visRefresh();
  }

  /* -------------------------------------------------------- AGENDA */
  const WEEKDAY = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
  const MONTH3 = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  function fmtDayLabel(iso) {
    const d = new Date(iso+'T12:00:00');
    const today = new Date(); today.setHours(12,0,0,0);
    const diff = Math.round((d - today)/86400000);
    const rel = diff===0 ? 'Hoje' : diff===1 ? 'Amanhã' : WEEKDAY[d.getDay()];
    return `${rel} · ${d.getDate()} ${MONTH3[d.getMonth()]}`;
  }

  function agendaCidades() { return ['todas', ...Array.from(new Set(VIS_AGENDA.map(a => a.cidade)))]; }
  function agendaEquipes() { return ['todas', ...Array.from(new Set(VIS_AGENDA.map(a => a.equipe)))]; }

  function agendaHTML() {
    const f = (state.visFilters && state.visFilters.agenda) || (state.visFilters.agenda = { equipe:'todas', cidade:'todas', prioridade:'todas' });
    const list = VIS_AGENDA.filter(a =>
      (f.equipe==='todas' || a.equipe===f.equipe) &&
      (f.cidade==='todas' || a.cidade===f.cidade) &&
      (f.prioridade==='todas' || a.prio===f.prioridade)
    ).sort((a,b) => (a.dia+a.hora).localeCompare(b.dia+b.hora));

    // agrupa por dia
    const byDay = {};
    list.forEach(a => { (byDay[a.dia] || (byDay[a.dia]=[])).push(a); });

    const sel = (key, opts, cur) => `<select onchange="visAgendaFilter('${key}', this.value)" class="bg-[#0c0c0c] border border-neutral-800 text-[10px] font-black uppercase tracking-widest text-neutral-300 px-3 py-2 vis-acc-focus">${
      opts.map(o => `<option value="${esc(o)}" ${cur===o?'selected':''}>${o==='todas'?('Todas '+(key==='equipe'?'equipes':key==='cidade'?'cidades':'prioridades')):esc(o==='alta'?'Alta':o==='normal'?'Normal':o)}</option>`).join('')
    }</select>`;

    const days = Object.keys(byDay).sort().map(dia => {
      const items = byDay[dia].map(a => `
        <button onclick="visOpenOSPlaceholder('${esc(a.cliente)}')" class="w-full text-left flex items-center gap-3 px-3 py-3 border-b border-neutral-800/70 hover:bg-neutral-900/60 transition-colors">
          <span class="num text-sm font-black text-white w-12 shrink-0">${esc(a.hora)}</span>
          <div class="min-w-0 flex-1">
            <div class="text-[12px] font-black text-neutral-100 truncate">${esc(a.cliente)}</div>
            <div class="text-[10px] text-neutral-500 truncate">${esc(a.cidade)} · ${esc(a.equipe)}</div>
          </div>
          <div class="flex flex-col items-end gap-1 shrink-0">${prioChip(a.prio)}${statusChip(a.status)}</div>
        </button>`).join('');
      return `
        <div class="border border-neutral-800 bg-[#0a0a0a] mb-3">
          <div class="px-3 py-2 bg-neutral-950 border-b border-neutral-800 text-[10px] font-black uppercase tracking-widest text-neutral-300 flex items-center justify-between">
            <span>${fmtDayLabel(dia)}</span><span class="text-neutral-600">${byDay[dia].length} visita(s)</span>
          </div>
          ${items}
        </div>`;
    }).join('') || '<div class="border border-neutral-800 bg-[#0a0a0a] p-10 text-center text-[11px] font-bold uppercase tracking-widest text-neutral-600">Nenhuma visita com esses filtros</div>';

    return `
      <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 class="text-xl font-black text-white uppercase tracking-wide flex items-center gap-2"><i data-lucide="calendar-days" class="w-5 h-5 vis-acc"></i> Agenda</h1>
          <p class="text-[11px] text-neutral-500 mt-0.5">${list.length} visita(s) nos próximos dias</p>
        </div>
        <button onclick="visNovaVistoria()" class="vis-acc-solid inline-flex items-center gap-2 px-4 py-2 text-[10px] font-black uppercase tracking-widest"><i data-lucide="plus" class="w-3.5 h-3.5"></i> Nova vistoria</button>
      </div>
      <div class="flex flex-wrap gap-2 mb-4">
        ${sel('equipe', agendaEquipes(), f.equipe)}
        ${sel('cidade', agendaCidades(), f.cidade)}
        ${sel('prioridade', ['todas','alta','normal'], f.prioridade)}
      </div>
      ${days}`;
  }

  function visAgendaFilter(key, val) {
    (state.visFilters.agenda || (state.visFilters.agenda = {}))[key] = val;
    visRefresh();
  }

  /* ------------------------------------------------- ORDENS (lista) */
  function osListHTML() {
    const rows = VIS_FUNIL.map(c => {
      const stage = FUNIL_STAGES[c.etapa];
      const k = STAGE_KIND[stage.k] || STAGE_KIND.novo;
      return `
        <button onclick="visOpenOSPlaceholder('${c.id}')" class="w-full text-left flex items-center gap-3 px-3 py-3 border-b border-neutral-800/70 hover:bg-neutral-900/60 transition-colors">
          <span class="w-1.5 h-8 ${k.dot} shrink-0"></span>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <span class="num text-[10px] font-black text-neutral-500">${esc(c.id)}</span>
              ${c.prio==='alta'?'<span class="vis-acc-chip text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5">Alta</span>':''}
            </div>
            <div class="text-[12px] font-black text-neutral-100 truncate">${esc(c.cliente)}</div>
            <div class="text-[10px] text-neutral-500 truncate">${esc(c.cidade)} · ${esc(c.equipe)}</div>
          </div>
          <div class="text-right shrink-0">
            <span class="${k.chip} text-[8px] font-black uppercase tracking-widest px-2 py-0.5">${esc(stage.l)}</span>
            <div class="text-[9px] font-bold uppercase tracking-widest text-neutral-600 num mt-1">${esc(c.pot)}</div>
          </div>
          <i data-lucide="chevron-right" class="w-4 h-4 text-neutral-600 shrink-0"></i>
        </button>`;
    }).join('');
    return `
      <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 class="text-xl font-black text-white uppercase tracking-wide flex items-center gap-2"><i data-lucide="clipboard-list" class="w-5 h-5 vis-acc"></i> Ordens de Serviço</h1>
          <p class="text-[11px] text-neutral-500 mt-0.5">${VIS_FUNIL.length} OS · toque para abrir em campo</p>
        </div>
        <button onclick="visNovaVistoria()" class="vis-acc-solid inline-flex items-center gap-2 px-4 py-2 text-[10px] font-black uppercase tracking-widest"><i data-lucide="plus" class="w-3.5 h-3.5"></i> Nova vistoria</button>
      </div>
      <div class="border border-neutral-800 bg-[#0a0a0a]">${rows}</div>`;
  }

  /* ----------------------------------------- TELAS DE GESTÃO (mock) */
  function gestaoHeader(icon, titulo, sub, btn) {
    return `<div class="flex flex-wrap items-center justify-between gap-3 mb-4">
      <div>
        <h1 class="text-xl font-black text-white uppercase tracking-wide flex items-center gap-2"><i data-lucide="${icon}" class="w-5 h-5 vis-acc"></i> ${esc(titulo)}</h1>
        <p class="text-[11px] text-neutral-500 mt-0.5">${esc(sub)}</p>
      </div>
      ${btn || ''}
    </div>`;
  }

  function checklistsHTML() {
    const rows = MOCK_CHECKLISTS.map(c => `
      <button onclick="visToast('Editor de checklist chega com o backend (Fase 5)','info')" class="w-full text-left flex items-center gap-3 px-3 py-3 border-b border-neutral-800/70 hover:bg-neutral-900/60 transition-colors">
        <span class="w-9 h-9 grid place-items-center vis-acc-chip shrink-0"><i data-lucide="list-checks" class="w-4 h-4"></i></span>
        <div class="min-w-0 flex-1">
          <div class="text-[12px] font-black text-neutral-100 truncate">${esc(c.nome)}</div>
          <div class="text-[10px] text-neutral-500 truncate">${esc(c.uso)}</div>
        </div>
        <div class="text-right shrink-0 num text-[10px] font-bold uppercase tracking-widest text-neutral-500">${c.blocos} blocos<br>${c.itens} itens</div>
        <i data-lucide="chevron-right" class="w-4 h-4 text-neutral-600 shrink-0"></i>
      </button>`).join('');
    return gestaoHeader('list-checks','Checklists','modelos por tipo de vistoria',
      '<button onclick="visToast(\'Criação de template chega na Fase 5\',\'info\')" class="vis-acc-solid inline-flex items-center gap-2 px-4 py-2 text-[10px] font-black uppercase tracking-widest"><i data-lucide="plus" class="w-3.5 h-3.5"></i> Novo modelo</button>')
      + `<div class="border border-neutral-800 bg-[#0a0a0a]">${rows}</div>`;
  }

  function fotosHTML() {
    // Galeria consolidada (mock: tiles por categoria, sem imagem real ainda).
    const cats = ['Frente','Padrão','Quadro','Telhado','Medidor','Estrutura','Drone','Inversor','Área técnica','Outras'];
    const tiles = cats.map((c,i) => {
      const n = [6,4,3,8,2,5,1,3,2,4][i] || 0;
      return `<div class="border border-neutral-800 bg-[#0c0c0c] p-3">
        <div class="aspect-square grid place-items-center vis-contour-dots" style="background-color:#0a0a0a"><i data-lucide="image" class="w-7 h-7 text-neutral-700"></i></div>
        <div class="mt-2 flex items-center justify-between">
          <span class="text-[11px] font-bold text-neutral-200">${esc(c)}</span>
          <span class="vis-acc-chip text-[9px] font-black px-1.5 py-0.5">${n}</span>
        </div>
      </div>`;
    }).join('');
    return gestaoHeader('camera','Fotos','galeria consolidada por categoria · GPS e metadados na Fase 5')
      + `<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">${tiles}</div>`;
  }

  function pendenciasHTML() {
    const sevCls = { alta:'bg-red-500/10 text-red-300', media:'bg-amber-400/10 text-amber-300', baixa:'bg-neutral-700/40 text-neutral-300' };
    const rows = MOCK_PEND.map(p => `
      <button onclick="visOpenOSPlaceholder('${esc(p.os)}')" class="w-full text-left flex items-center gap-3 px-3 py-3 border-b border-neutral-800/70 hover:bg-neutral-900/60 transition-colors">
        <span class="w-9 h-9 grid place-items-center ${sevCls[p.sev]||sevCls.baixa} shrink-0"><i data-lucide="alert-triangle" class="w-4 h-4"></i></span>
        <div class="min-w-0 flex-1">
          <div class="text-[12px] font-black text-neutral-100 truncate">${esc(p.tipo)}</div>
          <div class="text-[10px] text-neutral-500 truncate">${esc(p.det)}</div>
        </div>
        <div class="text-right shrink-0">
          <div class="num text-[10px] font-black text-neutral-500">${esc(p.os)}</div>
          <div class="text-[10px] text-neutral-400 truncate max-w-[120px]">${esc(p.cliente)}</div>
        </div>
      </button>`).join('');
    return gestaoHeader('alert-triangle','Pendências',MOCK_PEND.length+' itens abertos · toque para abrir a OS')
      + `<div class="border border-neutral-800 bg-[#0a0a0a]">${rows}</div>`;
  }

  function equipesHTML() {
    const stCls = { 'em campo':'bg-amber-500/10 text-amber-300', 'disponível':'bg-emerald-500/10 text-emerald-300', 'folga':'bg-neutral-700/40 text-neutral-300' };
    const cards = MOCK_EQUIPES.map(e => `
      <div class="border border-neutral-800 bg-[#0a0a0a] p-4">
        <div class="flex items-center justify-between">
          <span class="text-sm font-black text-white">${esc(e.nome)}</span>
          <span class="${stCls[e.status]||stCls.folga} text-[8px] font-black uppercase tracking-widest px-2 py-0.5">${esc(e.status)}</span>
        </div>
        <div class="mt-3 space-y-1.5 text-[11px] text-neutral-400">
          <div class="flex items-center gap-2"><i data-lucide="phone" class="w-3.5 h-3.5 text-neutral-600"></i> ${esc(e.tel)}</div>
          <div class="flex items-center gap-2"><i data-lucide="map-pin" class="w-3.5 h-3.5 text-neutral-600"></i> ${esc(e.cidade)}</div>
          <div class="flex items-center gap-2"><i data-lucide="wrench" class="w-3.5 h-3.5 text-neutral-600"></i> ${esc(e.esp)}</div>
        </div>
        <div class="mt-3 pt-3 border-t border-neutral-800 flex items-center justify-between">
          <span class="text-[9px] font-black uppercase tracking-widest text-neutral-600">Hoje</span>
          <span class="num text-sm font-black vis-acc">${e.hoje} vistoria(s)</span>
        </div>
      </div>`).join('');
    return gestaoHeader('users','Equipes',MOCK_EQUIPES.length+' equipes de campo',
      '<button onclick="visToast(\'Cadastro de equipe chega na Fase 5\',\'info\')" class="vis-acc-solid inline-flex items-center gap-2 px-4 py-2 text-[10px] font-black uppercase tracking-widest"><i data-lucide="plus" class="w-3.5 h-3.5"></i> Nova equipe</button>')
      + `<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">${cards}</div>`;
  }

  function historicoHTML() {
    const items = MOCK_HIST.map(h => `
      <div class="flex gap-3 px-3 py-3 border-b border-neutral-800/70">
        <div class="w-1.5 h-1.5 mt-1.5 rounded-full bg-[color:var(--vis)] shrink-0"></div>
        <div class="min-w-0 flex-1">
          <div class="text-[11px] text-neutral-300 leading-snug">${h.what}</div>
          <div class="text-[9px] font-bold uppercase tracking-widest text-neutral-600 mt-0.5">${esc(h.who)} · ${esc(h.t)}</div>
        </div>
      </div>`).join('');
    return gestaoHeader('history','Histórico','linha do tempo da operação · auditoria completa na Fase 5')
      + `<div class="border border-neutral-800 bg-[#0a0a0a]">${items}</div>`;
  }

  function configHTML() {
    const row = (icon,t,d,extra) => `<div class="flex items-center gap-3 px-3 py-3 border-b border-neutral-800/70">
      <span class="w-9 h-9 grid place-items-center vis-acc-chip shrink-0"><i data-lucide="${icon}" class="w-4 h-4"></i></span>
      <div class="min-w-0 flex-1"><div class="text-[12px] font-black text-neutral-100">${esc(t)}</div><div class="text-[10px] text-neutral-500">${esc(d)}</div></div>
      ${extra||''}
    </div>`;
    const soon = '<span class="vis-acc-chip text-[8px] font-black uppercase tracking-widest px-2 py-1 shrink-0">Fase 5</span>';
    return gestaoHeader('settings','Configurações','parâmetros do módulo de vistoria')
      + `<div class="border border-neutral-800 bg-[#0a0a0a]">
          ${row('shield-check','Acesso por perfil','liberar a Vistoria por usuário (flag vis_enabled)', soon)}
          ${row('list-checks','Checklist padrão','modelo aplicado a novas vistorias', soon)}
          ${row('camera','Categorias de foto obrigatórias','quais categorias travam a finalização', soon)}
          ${row('users','Equipes & especialidades','cadastro e regras de designação', soon)}
          ${row('file-check','Template de laudo','cabeçalho, logo e campos do laudo', soon)}
        </div>
        <p class="text-[10px] text-neutral-600 mt-3 leading-relaxed">As configurações são persistidas quando o backend entrar (Fase 5). Hoje o módulo roda local-first com dados de demonstração.</p>`;
  }

  /* ------------------------------------------------ LAUDOS + HANDOFF */
  // Resultado da vistoria → efeito no restante da plataforma (visual; a fiação
  // real com o Financeiro/Engenharia entra na Fase 5).
  const RESULTADO_HANDOFF = {
    aprovado:  { l:'Aprovada',              fin:'Funil → Aprovada a Vistoria', eng:'cria Projeto Engenharia ao emitir laudo', cls:'text-emerald-400' },
    ressalvas: { l:'Aprovada c/ ressalvas', fin:'Funil → Aprovada (com pendência)', eng:'segue p/ Engenharia após correção', cls:'text-amber-400' },
    reprovado: { l:'Reprovada',             fin:'Funil → volta p/ Validação Técnica', eng:'—', cls:'text-red-400' },
    revisita:  { l:'Nova visita',           fin:'mantém em Validação Técnica', eng:'—', cls:'text-sky-400' },
  };

  // Laudos disponíveis (mock): vistorias já com resultado.
  const MOCK_LAUDOS = [
    { id:'V-0411', cliente:'Joaquim Pereira',  cidade:'Goianira',           pot:'7,4 kWp', resultado:'aprovado',  data:'Hoje' },
    { id:'V-0407', cliente:'Restaurante Sabor',cidade:'Aparecida de Goiânia',pot:'18 kWp', resultado:'aprovado',  data:'Ontem', engenharia:true },
    { id:'V-0410', cliente:'Edifício Aurora',  cidade:'Goiânia · St. Marista',pot:'48 kWp',resultado:'reprovado', data:'Ontem' },
    { id:'V-0408', cliente:'Ana Paula Souza',  cidade:'Goiânia · St. Pedro', pot:'9,8 kWp',resultado:'ressalvas', data:'2 dias' },
  ];

  function laudosHTML() {
    const rows = MOCK_LAUDOS.map(l => {
      const h = RESULTADO_HANDOFF[l.resultado] || RESULTADO_HANDOFF.aprovado;
      return `<div class="flex items-center gap-3 px-3 py-3 border-b border-neutral-800/70">
        <span class="w-9 h-9 grid place-items-center vis-acc-chip shrink-0"><i data-lucide="file-check" class="w-4 h-4"></i></span>
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <span class="num text-[10px] font-black text-neutral-500">${esc(l.id)}</span>
            <span class="text-[9px] font-black uppercase tracking-widest ${h.cls}">${esc(h.l)}</span>
            ${l.engenharia?'<span class="bg-sky-500/10 text-sky-300 text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5">→ Engenharia</span>':''}
          </div>
          <div class="text-[12px] font-black text-neutral-100 truncate">${esc(l.cliente)}</div>
          <div class="text-[10px] text-neutral-500 truncate">${esc(l.cidade)} · ${esc(l.pot)} · ${esc(l.data)}</div>
        </div>
        <button onclick="visGerarLaudo('${l.id}')" class="vis-acc-solid inline-flex items-center gap-1.5 px-3 py-2 text-[9px] font-black uppercase tracking-widest shrink-0"><i data-lucide="printer" class="w-3.5 h-3.5"></i> Laudo PDF</button>
      </div>`;
    }).join('');

    const handoff = `
      <div class="vis-deep p-4 mb-4">
        <div class="text-[10px] font-black uppercase tracking-[0.2em] vis-deep-label flex items-center gap-2 mb-2"><i data-lucide="git-branch" class="w-3.5 h-3.5"></i> Fluxo automático (liga na Fase 5)</div>
        <div class="flex flex-wrap items-center gap-2 text-[10px] font-bold text-neutral-300">
          <span class="px-2 py-1 bg-black/30 border border-neutral-700">Aprovada</span><i data-lucide="arrow-right" class="w-3 h-3 text-neutral-600"></i>
          <span class="px-2 py-1 bg-black/30 border border-neutral-700">Financeiro: Aprovada a Vistoria</span><i data-lucide="arrow-right" class="w-3 h-3 text-neutral-600"></i>
          <span class="px-2 py-1 bg-black/30 border border-neutral-700">Kit Comprado</span><i data-lucide="arrow-right" class="w-3 h-3 text-neutral-600"></i>
          <span class="px-2 py-1 bg-black/30 border border-neutral-700">Emissão de Laudo</span><i data-lucide="arrow-right" class="w-3 h-3 text-neutral-600"></i>
          <span class="px-2 py-1 vis-acc-chip">Projeto Engenharia</span>
        </div>
      </div>`;

    return gestaoHeader('file-check','Laudos','gere o laudo em PDF (impressão do navegador)')
      + handoff
      + `<div class="border border-neutral-800 bg-[#0a0a0a]">${rows}</div>`;
  }

  // Gera o laudo em uma janela nova e dispara a impressão (usuário salva como PDF).
  function visGerarLaudo(id) {
    const l = MOCK_LAUDOS.find(x => x.id===id) || VIS_FUNIL.find(x => x.id===id) || { id, cliente:'Cliente', cidade:'', pot:'—', resultado:'aprovado' };
    const h = RESULTADO_HANDOFF[l.resultado] || RESULTADO_HANDOFF.aprovado;
    const hoje = new Date().toLocaleDateString('pt-BR');
    const blocoResumo = CHECK_REF.map(b => `<tr><td style="padding:6px 10px;border:1px solid #ddd;font-weight:700">${b}</td><td style="padding:6px 10px;border:1px solid #ddd">Conforme</td></tr>`).join('');
    const win = window.open('', '_blank');
    if (!win) { visToast('Permita pop-ups para gerar o laudo', 'warn'); return; }
    win.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Laudo ${esc(l.id)} — ${esc(l.cliente)}</title>
      <style>
        *{box-sizing:border-box} body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:0;padding:32px;max-width:760px;margin:0 auto}
        h1{font-size:20px;margin:0} .sub{color:#666;font-size:12px;margin-top:2px}
        .hdr{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #dc2626;padding-bottom:14px;margin-bottom:18px}
        .badge{display:inline-block;padding:4px 10px;border:1px solid #dc2626;color:#dc2626;font-weight:800;font-size:11px;text-transform:uppercase;letter-spacing:.08em}
        h2{font-size:12px;text-transform:uppercase;letter-spacing:.1em;color:#dc2626;border-bottom:1px solid #eee;padding-bottom:5px;margin:22px 0 10px}
        table{width:100%;border-collapse:collapse;font-size:12px} .grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 18px;font-size:13px}
        .grid div b{color:#666;font-weight:700;font-size:11px;text-transform:uppercase;display:block}
        .sign{display:flex;gap:30px;margin-top:40px} .sign div{flex:1;text-align:center;border-top:1px solid #333;padding-top:6px;font-size:11px;color:#555}
        .foot{margin-top:30px;font-size:10px;color:#999;text-align:center;border-top:1px solid #eee;padding-top:10px}
        @media print{body{padding:0}}
      </style></head><body>
      <div class="hdr">
        <div><h1>Laudo de Vistoria Técnica</h1><div class="sub">Ágil Solar · ${esc(l.id)} · ${hoje}</div></div>
        <span class="badge">${esc(h.l)}</span>
      </div>
      <h2>Dados do projeto</h2>
      <div class="grid">
        <div><b>Cliente</b>${esc(l.cliente)}</div>
        <div><b>Local</b>${esc(l.cidade||'—')}</div>
        <div><b>Potência</b>${esc(l.pot||'—')}</div>
        <div><b>Resultado</b>${esc(h.l)}</div>
      </div>
      <h2>Resumo do checklist</h2>
      <table><tbody>${blocoResumo}</tbody></table>
      <h2>Registro fotográfico</h2>
      <p style="font-size:12px;color:#666">As fotos categorizadas (frente, padrão, quadro, telhado, medidor, estrutura, drone, inversor) são anexadas ao laudo a partir do armazenamento do projeto na fase de backend.</p>
      <h2>Encaminhamento</h2>
      <p style="font-size:12px"><b>Financeiro:</b> ${esc(h.fin)}<br><b>Engenharia:</b> ${esc(h.eng)}</p>
      <div class="sign"><div>Assinatura do vistoriador</div><div>Assinatura do cliente</div></div>
      <div class="foot">Documento gerado pelo Portal Parceiro Ágil Solar — módulo Vistoria. Versão preliminar (dados de demonstração).</div>
      <script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script>
      </body></html>`);
    win.document.close();
    visToast('Laudo aberto — use “Salvar como PDF”', 'ok');
  }

  // Rótulos dos blocos de checklist p/ o resumo do laudo (espelha vistoria-os.js).
  const CHECK_REF = ['Dados Gerais','Telhado','Estrutura','Medições','Elétrica','Internet','Segurança'];

  /* ----------------------------------------------------- ROTEADOR */
  let _container = null, _active = 'visao';

  function panelFor(tabId) {
    if (tabId === 'funil')      return { inner: funilHTML(),      active: 'funil' };
    if (tabId === 'laudos')     return { inner: laudosHTML(),     active: 'laudos' };
    if (tabId === 'agenda')     return { inner: agendaHTML(),     active: 'agenda' };
    if (tabId === 'os')         return { inner: osListHTML(),     active: 'os' };
    if (tabId === 'checklists') return { inner: checklistsHTML(), active: 'checklists' };
    if (tabId === 'fotos')      return { inner: fotosHTML(),      active: 'fotos' };
    if (tabId === 'pendencias') return { inner: pendenciasHTML(), active: 'pendencias' };
    if (tabId === 'equipes')    return { inner: equipesHTML(),    active: 'equipes' };
    if (tabId === 'historico')  return { inner: historicoHTML(),  active: 'historico' };
    if (tabId === 'config')     return { inner: configHTML(),     active: 'config' };
    if (tabId === 'visao' || !tabId) return { inner: visaoHTML(), active: 'visao' };
    if (PHASE_PANELS[tabId]) return { inner: phasePanelHTML(tabId), active: tabId };
    return { inner: visaoHTML(), active: 'visao' };
  }

  function renderVistoriaRoute(container, tabId) {
    visEnsureChrome();
    closeVisModal();
    _container = container;
    const { inner, active } = panelFor(tabId);
    _active = active;
    container.innerHTML = `<div class="vis-env"><div class="max-w-7xl mx-auto px-4 py-6 md:py-8" data-vis-panel="${active}">${inner}</div></div>`;
    if (window.lucide) lucide.createIcons();
  }

  // Re-render do painel ativo (após mover etapa, mudar filtro, etc.) sem trocar de aba.
  function visRefresh() {
    if (!_container) return;
    renderVistoriaRoute(_container, _active);
  }

  /* ------------------------------------------------ EXPOSE (window) */
  Object.assign(window, {
    renderVistoriaRoute,
    visToast,
    closeVisModal,
    visNovaVistoria,
    visOpenOSPlaceholder,
    visFindRecord,
    // funil
    visFunilFilter, visOpenFunilDetail, visFunilMove,
    // agenda
    visAgendaFilter,
    // laudos
    visGerarLaudo,
  });

})();
