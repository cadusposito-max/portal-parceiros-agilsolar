// ==========================================================================
// VISTORIA · ORDEM DE SERVIÇO DE CAMPO (mobile, tela cheia).
// Clona a arquitetura do om-os.js (checklist, fotos c/ EXIF+compressão, GPS,
// assinatura) mas LOCAL-FIRST: nada é persistido até a fase Supabase. Abre como
// overlay fixo (#vis-os-screen), independente da aba ativa, e volta de onde veio.
// ==========================================================================
(function () {
  'use strict';

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const toast = (m, t) => (typeof visToast === 'function' ? visToast(m, t) : null);

  /* ----------------------------------------------------- UTILS (clones) */
  function fmtDateTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso); if (isNaN(d)) return '—';
    const M = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
    const p = n => String(n).padStart(2,'0');
    return `${d.getDate()} ${M[d.getMonth()]} · ${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  function fmtDur(ms) {
    if (ms == null || ms < 0) return '—';
    const min = Math.round(ms/60000), h = Math.floor(min/60), m = min%60;
    return h ? `${h}h${String(m).padStart(2,'0')}` : `${m}min`;
  }
  function haversine(la1, lo1, la2, lo2) {
    const R=6371000, t=x=>x*Math.PI/180;
    const dLa=t(la2-la1), dLo=t(lo2-lo1);
    const a=Math.sin(dLa/2)**2+Math.cos(t(la1))*Math.cos(t(la2))*Math.sin(dLo/2)**2;
    return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
  }
  function getGPS() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error('Geolocalização indisponível.'));
      navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
    });
  }
  async function extractExif(file) {
    try {
      if (!window.exifr) return { lat: null, lng: null, ts: null };
      const x = await window.exifr.parse(file, { gps: true });
      if (!x) return { lat: null, lng: null, ts: null };
      let ts = null;
      const dt = x.DateTimeOriginal || x.CreateDate || x.ModifyDate;
      if (dt) { const d = (dt instanceof Date) ? dt : new Date(dt); if (!isNaN(d)) ts = d.toISOString(); }
      return { lat:(typeof x.latitude==='number')?x.latitude:null, lng:(typeof x.longitude==='number')?x.longitude:null, ts };
    } catch (_) { return { lat: null, lng: null, ts: null }; }
  }
  function compressImage(file) {
    return new Promise(resolve => {
      try {
        const img = new Image(), url = URL.createObjectURL(file);
        img.onload = () => {
          URL.revokeObjectURL(url);
          const MAX = 1600; let w = img.naturalWidth, h = img.naturalHeight;
          if (!w || !h) return resolve(file);
          if (w > MAX || h > MAX) { const r = Math.min(MAX/w, MAX/h); w = Math.round(w*r); h = Math.round(h*r); }
          const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
          cv.getContext('2d').drawImage(img, 0, 0, w, h);
          cv.toBlob(b => resolve(b || file), 'image/jpeg', 0.82);
        };
        img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
        img.src = url;
      } catch (_) { resolve(file); }
    });
  }
  function initSignaturePad(canvas, onChange) {
    const ctx = canvas.getContext('2d');
    const paintBg = () => { ctx.fillStyle = '#fff'; ctx.fillRect(0,0,canvas.width,canvas.height); };
    paintBg();
    ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#0a0a0a';
    let drawing = false, hasInk = false, last = null;
    const pos = e => { const r = canvas.getBoundingClientRect(), t = (e.touches&&e.touches[0])?e.touches[0]:e;
      return { x:(t.clientX-r.left)*(canvas.width/r.width), y:(t.clientY-r.top)*(canvas.height/r.height) }; };
    const start = e => { drawing=true; last=pos(e); e.preventDefault(); };
    const move = e => { if(!drawing) return; const p=pos(e); ctx.beginPath(); ctx.moveTo(last.x,last.y); ctx.lineTo(p.x,p.y); ctx.stroke(); last=p; hasInk=true; if(onChange) onChange(); e.preventDefault(); };
    const end = () => { drawing=false; };
    canvas.addEventListener('mousedown',start); canvas.addEventListener('mousemove',move); window.addEventListener('mouseup',end);
    canvas.addEventListener('touchstart',start,{passive:false}); canvas.addEventListener('touchmove',move,{passive:false}); canvas.addEventListener('touchend',end);
    return { isEmpty:()=>!hasInk, clear:()=>{paintBg(); hasInk=false; if(onChange) onChange();}, toDataURL:()=>canvas.toDataURL('image/png') };
  }

  /* --------------------------------------------------- DEFINIÇÕES */
  const CHECK_BLOCOS = [
    { id:'gerais',  titulo:'Dados Gerais', icon:'clipboard-check', itens:[
      { id:'end',  tipo:'check', label:'Confirmou endereço' },
      { id:'pres', tipo:'check', label:'Cliente presente' },
      { id:'tel',  tipo:'check', label:'Telefone confirmado' },
    ]},
    { id:'telhado', titulo:'Telhado', icon:'home', itens:[
      { id:'tipo', tipo:'radio', label:'Tipo de telhado', opts:['Cerâmico','Fibrocimento','Metálico','Laje','Outro'] },
    ]},
    { id:'estrutura', titulo:'Estrutura', icon:'frame', itens:[
      { id:'mat', tipo:'radio', label:'Material da estrutura', opts:['Madeira','Metálica','Concreto'] },
    ]},
    { id:'medicoes', titulo:'Medições', icon:'ruler', itens:[
      { id:'incl', tipo:'num', label:'Inclinação (°)' },
      { id:'azi',  tipo:'num', label:'Azimute (°)' },
      { id:'area', tipo:'num', label:'Área disponível (m²)' },
      { id:'dist', tipo:'num', label:'Distância até inversor (m)' },
    ]},
    { id:'eletrica', titulo:'Elétrica', icon:'zap', itens:[
      { id:'disj',   tipo:'text', label:'Disjuntor (A)' },
      { id:'padrao', tipo:'text', label:'Padrão de entrada' },
      { id:'aterr',  tipo:'check',label:'Aterramento presente' },
      { id:'quadro', tipo:'text', label:'Quadro de distribuição' },
      { id:'diste',  tipo:'num',  label:'Distância quadro → inversor (m)' },
    ]},
    { id:'internet', titulo:'Internet', icon:'wifi', itens:[
      { id:'net', tipo:'radio', label:'Conectividade', opts:['Wi-Fi disponível','4G','Sem internet'] },
    ]},
    { id:'seg', titulo:'Segurança', icon:'shield', itens:[
      { id:'lv',    tipo:'check', label:'Linha de vida disponível' },
      { id:'epi',   tipo:'check', label:'EPI completo' },
      { id:'risco', tipo:'check', label:'Risco alto identificado' },
    ]},
  ];

  const FOTO_CATS = ['Frente','Padrão','Quadro','Telhado','Medidor','Estrutura','Drone','Inversor','Área técnica','Outras'];

  const RESULTADOS = [
    { id:'aprovado',   label:'Aprovado',              icon:'check-circle', cls:'border-emerald-500/40 text-emerald-300', dot:'bg-emerald-400' },
    { id:'ressalvas',  label:'Aprovado c/ ressalvas', icon:'alert-circle', cls:'border-amber-500/40 text-amber-300',     dot:'bg-amber-400' },
    { id:'reprovado',  label:'Reprovado',             icon:'x-circle',     cls:'border-red-500/40 text-red-300',         dot:'bg-red-500' },
    { id:'revisita',   label:'Necessita nova visita', icon:'rotate-ccw',   cls:'border-sky-500/40 text-sky-300',         dot:'bg-sky-400' },
  ];

  const STATUS_FLOW = {
    agendada:     { label:'Agendada',        chip:'bg-neutral-700/40 text-neutral-200', cta:'Iniciar deslocamento', icon:'navigation' },
    deslocamento: { label:'Em deslocamento', chip:'bg-sky-500/10 text-sky-300',         cta:'Registrar chegada (GPS)', icon:'map-pin' },
    em_campo:     { label:'Em campo',        chip:'bg-amber-500/10 text-amber-300',     cta:'Finalizar vistoria', icon:'flag' },
    finalizada:   { label:'Finalizada',      chip:'bg-emerald-500/10 text-emerald-300', cta:null, icon:'check' },
  };

  /* ------------------------------------------------------- ESTADO */
  let os = null;          // OS aberta (working state, local)
  let pendingFoto = null; // contexto da foto sendo capturada
  let sigPad = null, sigTarget = null;

  function buildOS(rec) {
    return {
      rec,
      numero: rec.id || ('V-' + Math.floor(1000 + Math.random()*9000)),
      cliente: rec.cliente || 'Cliente',
      cpf: rec.cpf || '000.000.000-00',
      telefone: rec.telefone || '(62) 90000-0000',
      endereco: rec.endereco || (rec.cidade || 'Endereço não informado'),
      cidade: rec.cidade || '',
      pot: rec.pot || '—',
      inversor: rec.inversor || 'A confirmar',
      modulos: rec.modulos || 'A confirmar',
      telhado: rec.telhado || 'A confirmar',
      prio: rec.prio || 'normal',
      obsComercial: rec.obsComercial || 'Cliente prefere visita pela manhã.',
      obsFinanceira: rec.obsFinanceira || 'Projeto liberado em Validação Técnica.',
      status: 'agendada',
      iniciadoEm: null, gpsChegada: null, gpsSaida: null,
      checks: {},   // "blocoId.itemId" -> valor
      fotos: [],    // {id,cat,url,lat,lng,ts}
      assinaturas: { cliente:null, vistoriador:null },
      obs: '',
      resultado: null,
    };
  }

  /* --------------------------------------------------- OVERLAY */
  function ensureScreen() {
    let s = document.getElementById('vis-os-screen');
    if (!s) {
      s = document.createElement('div');
      s.id = 'vis-os-screen';
      s.className = 'fixed inset-0 z-[95] bg-[#070707] overflow-y-auto custom-scrollbar hidden';
      document.body.appendChild(s);
    }
    return s;
  }

  function visOpenOS(idOrRec) {
    let rec = idOrRec;
    if (typeof idOrRec === 'string') {
      rec = (typeof window.visFindRecord === 'function') ? window.visFindRecord(idOrRec) : { cliente:idOrRec };
    }
    if (!rec) { toast('Vistoria não encontrada', 'err'); return; }
    os = buildOS(rec);
    const s = ensureScreen();
    s.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    repaint();
  }

  function visCloseOS() {
    const s = document.getElementById('vis-os-screen');
    if (s) s.classList.add('hidden');
    document.body.style.overflow = '';
    os = null;
  }

  function repaint() {
    const s = ensureScreen();
    s.scrollTop && (s.scrollTop = s.scrollTop); // preserva posição em micro-updates
    s.innerHTML = screenHTML();
    if (window.lucide) lucide.createIcons();
  }

  /* ------------------------------------------------------ RENDER */
  function val(bloco, item) { return os.checks[bloco + '.' + item]; }

  function checklistProgress() {
    let total = 0, done = 0;
    CHECK_BLOCOS.forEach(b => b.itens.forEach(it => {
      total++;
      const v = val(b.id, it.id);
      if (it.tipo === 'check') { if (v) done++; }
      else if (v != null && String(v).trim() !== '') done++;
    }));
    return { total, done, pct: total ? Math.round(done/total*100) : 0 };
  }

  function itemHTML(b, it) {
    const key = b.id + '.' + it.id, v = os.checks[key];
    if (it.tipo === 'check') {
      const on = !!v;
      return `<button onclick="visOsCheck('${key}')" class="w-full flex items-center gap-3 px-3 py-2.5 border-b border-neutral-800/70 text-left">
        <span class="w-5 h-5 grid place-items-center border ${on?'bg-emerald-500 border-emerald-500':'border-neutral-600'} shrink-0">${on?'<i data-lucide=\"check\" class=\"w-3.5 h-3.5 text-black\"></i>':''}</span>
        <span class="text-[12px] font-bold ${on?'text-neutral-100':'text-neutral-300'}">${esc(it.label)}</span>
      </button>`;
    }
    if (it.tipo === 'radio') {
      const opts = it.opts.map(o => `<button onclick="visOsRadio('${key}','${esc(o)}')" class="px-3 py-1.5 text-[11px] font-bold border ${v===o?'vis-acc-solid border-transparent':'border-neutral-700 text-neutral-300 hover:border-neutral-500'}">${esc(o)}</button>`).join('');
      return `<div class="px-3 py-2.5 border-b border-neutral-800/70">
        <div class="text-[10px] font-black uppercase tracking-widest text-neutral-500 mb-2">${esc(it.label)}</div>
        <div class="flex flex-wrap gap-1.5">${opts}</div>
      </div>`;
    }
    // text / num
    const tipo = it.tipo === 'num' ? 'number' : 'text';
    return `<div class="px-3 py-2.5 border-b border-neutral-800/70">
      <label class="text-[10px] font-black uppercase tracking-widest text-neutral-500">${esc(it.label)}</label>
      <input type="${tipo}" value="${esc(v==null?'':v)}" onchange="visOsInput('${key}', this.value)" inputmode="${it.tipo==='num'?'decimal':'text'}"
        class="mt-1 w-full bg-[#0c0c0c] border border-neutral-800 px-3 py-2 text-[13px] text-neutral-100 vis-acc-focus" />
    </div>`;
  }

  function blocoHTML(b) {
    return `<div class="border border-neutral-800 bg-[#0a0a0a] mb-3">
      <div class="px-3 py-2.5 bg-neutral-950 border-b border-neutral-800 text-[10px] font-black uppercase tracking-widest text-neutral-300 flex items-center gap-2">
        <i data-lucide="${b.icon}" class="w-3.5 h-3.5 vis-acc"></i> ${esc(b.titulo)}
      </div>
      ${b.itens.map(it => itemHTML(b, it)).join('')}
    </div>`;
  }

  function fotoCatHTML(cat) {
    const fotos = os.fotos.filter(f => f.cat === cat);
    const thumbs = fotos.map(f => `
      <button onclick="visOsVerFoto('${f.id}')" class="relative w-16 h-16 border border-neutral-800 overflow-hidden shrink-0">
        <img src="${f.url}" class="w-full h-full object-cover" />
        ${f.lat!=null?'<span class="absolute bottom-0 right-0 bg-black/70 px-1 text-[7px] font-black text-emerald-300">GPS</span>':''}
      </button>`).join('');
    return `<div class="border-b border-neutral-800/70 px-3 py-2.5">
      <div class="flex items-center justify-between mb-2">
        <span class="text-[11px] font-bold text-neutral-200">${esc(cat)} <span class="text-neutral-600">· ${fotos.length}</span></span>
        <button onclick="visOsAddFoto('${esc(cat)}')" class="inline-flex items-center gap-1.5 px-2.5 py-1 text-[9px] font-black uppercase tracking-widest vis-acc-chip"><i data-lucide="camera" class="w-3 h-3"></i> Add</button>
      </div>
      <div class="flex gap-2 overflow-x-auto custom-scrollbar">${thumbs || '<span class="text-[10px] text-neutral-700 py-5">sem fotos</span>'}</div>
    </div>`;
  }

  function assinaturaHTML(which, label) {
    const sig = os.assinaturas[which];
    return `<div class="border border-neutral-800 bg-[#0a0a0a] p-3">
      <div class="text-[10px] font-black uppercase tracking-widest text-neutral-500 mb-2">${esc(label)}</div>
      ${sig
        ? `<div class="bg-white p-1"><img src="${sig}" class="w-full h-20 object-contain" /></div>
           <button onclick="visOsAssinar('${which}')" class="mt-2 text-[9px] font-black uppercase tracking-widest vis-acc hover:underline">Refazer assinatura</button>`
        : `<button onclick="visOsAssinar('${which}')" class="w-full h-20 grid place-items-center border border-dashed border-neutral-700 text-[10px] font-bold uppercase tracking-widest text-neutral-500 hover:border-[color:var(--vis-border-40)]"><span class="flex items-center gap-2"><i data-lucide="pen-tool" class="w-4 h-4"></i> Toque p/ assinar</span></button>`}
    </div>`;
  }

  function dadosHTML() {
    const r = os;
    const mapsQ = encodeURIComponent((r.endereco || '') + ' ' + (r.cidade || ''));
    const tel = (r.telefone || '').replace(/\D/g,'');
    const field = (l,v) => `<div><div class="text-[9px] font-black uppercase tracking-widest text-neutral-600">${l}</div><div class="text-[12px] font-bold text-neutral-100 mt-0.5">${esc(v)}</div></div>`;
    const act = (href, icon, label, extra) => `<a href="${href}" ${extra||''} class="flex-1 inline-flex items-center justify-center gap-1.5 px-2 py-2 text-[9px] font-black uppercase tracking-widest text-neutral-300 border border-neutral-700 hover:border-[color:var(--vis-border-40)]"><i data-lucide="${icon}" class="w-3.5 h-3.5"></i> ${label}</a>`;
    return `
      <div class="border border-neutral-800 bg-[#0a0a0a] mb-3">
        <div class="px-3 py-2.5 bg-neutral-950 border-b border-neutral-800 text-[10px] font-black uppercase tracking-widest text-neutral-300 flex items-center gap-2"><i data-lucide="user" class="w-3.5 h-3.5 vis-acc"></i> Cliente & local</div>
        <div class="p-3 grid grid-cols-2 gap-y-3 gap-x-4">
          ${field('Cliente', r.cliente)}
          ${field('CPF/CNPJ', r.cpf)}
          ${field('Telefone', r.telefone)}
          ${field('Cidade', r.cidade || '—')}
          <div class="col-span-2">${field('Endereço', r.endereco)}</div>
        </div>
        <div class="flex gap-2 p-3 pt-0">
          ${act('tel:'+tel, 'phone', 'Ligar')}
          ${act('https://wa.me/55'+tel, 'message-circle', 'WhatsApp', 'target="_blank" rel="noopener"')}
          ${act('https://www.google.com/maps/search/?api=1&query='+mapsQ, 'map', 'Maps', 'target="_blank" rel="noopener"')}
          ${act('https://waze.com/ul?q='+mapsQ, 'navigation', 'Waze', 'target="_blank" rel="noopener"')}
        </div>
      </div>
      <div class="border border-neutral-800 bg-[#0a0a0a] mb-3">
        <div class="px-3 py-2.5 bg-neutral-950 border-b border-neutral-800 text-[10px] font-black uppercase tracking-widest text-neutral-300 flex items-center gap-2"><i data-lucide="sun" class="w-3.5 h-3.5 vis-acc"></i> Sistema</div>
        <div class="p-3 grid grid-cols-2 gap-y-3 gap-x-4">
          ${field('Potência', r.pot)}
          ${field('Inversor', r.inversor)}
          ${field('Módulos', r.modulos)}
          ${field('Telhado', r.telhado)}
          <div class="col-span-2">${field('Obs. comercial', r.obsComercial)}</div>
          <div class="col-span-2">${field('Obs. financeira', r.obsFinanceira)}</div>
        </div>
      </div>`;
  }

  function rastreioHTML() {
    const prog = checklistProgress();
    const tempo = (os.gpsChegada && os.gpsSaida) ? fmtDur(new Date(os.gpsSaida.ts) - new Date(os.gpsChegada.ts))
                : (os.gpsChegada ? fmtDur(Date.now() - new Date(os.gpsChegada.ts)) : '—');
    const cell = (l,v) => `<div class="px-3 py-2"><div class="text-[9px] font-black uppercase tracking-widest text-neutral-600">${l}</div><div class="text-[12px] font-bold text-neutral-100 num">${v}</div></div>`;
    return `<div class="border border-neutral-800 bg-[#0a0a0a] mb-3 grid grid-cols-2 divide-x divide-y divide-neutral-800/70">
      ${cell('Chegada', os.gpsChegada ? fmtDateTime(os.gpsChegada.ts) : '—')}
      ${cell('Saída', os.gpsSaida ? fmtDateTime(os.gpsSaida.ts) : '—')}
      ${cell('Tempo no local', tempo)}
      ${cell('Checklist', prog.done + '/' + prog.total)}
      ${cell('Fotos', String(os.fotos.length))}
      ${cell('GPS chegada', os.gpsChegada ? (os.gpsChegada.lat!=null ? os.gpsChegada.lat.toFixed(4)+', '+os.gpsChegada.lng.toFixed(4) : 'sem sinal') : '—')}
    </div>`;
  }

  function resultadoHTML() {
    const opts = RESULTADOS.map(r => `<button onclick="visOsResultado('${r.id}')" class="flex items-center gap-2 px-3 py-2.5 border text-[11px] font-black uppercase tracking-widest ${os.resultado===r.id ? r.cls+' bg-white/[0.03]' : 'border-neutral-800 text-neutral-400 hover:border-neutral-600'}">
      <span class="w-2 h-2 rounded-full ${r.dot}"></span>${esc(r.label)}
    </button>`).join('');
    return `<div class="border border-neutral-800 bg-[#0a0a0a] mb-3">
      <div class="px-3 py-2.5 bg-neutral-950 border-b border-neutral-800 text-[10px] font-black uppercase tracking-widest text-neutral-300 flex items-center gap-2"><i data-lucide="gavel" class="w-3.5 h-3.5 vis-acc"></i> Resultado</div>
      <div class="p-3 grid grid-cols-1 sm:grid-cols-2 gap-2">${opts}</div>
    </div>`;
  }

  function screenHTML() {
    const st = STATUS_FLOW[os.status] || STATUS_FLOW.agendada;
    const prog = checklistProgress();
    const cta = st.cta ? `<button onclick="visOsFlow()" class="vis-acc-solid w-full inline-flex items-center justify-center gap-2 px-4 py-3 text-[11px] font-black uppercase tracking-widest"><i data-lucide="${st.icon}" class="w-4 h-4"></i> ${st.cta}</button>` : '';
    return `
      <!-- Header -->
      <div class="sticky top-0 z-10 bg-[#0a0a0a]/95 backdrop-blur border-b border-neutral-800">
        <div class="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onclick="visCloseOS()" class="p-2 border border-neutral-800 text-neutral-400 hover:text-white hover:border-neutral-600"><i data-lucide="arrow-left" class="w-4 h-4"></i></button>
          <div class="min-w-0 flex-1">
            <div class="num text-[10px] font-black text-neutral-500">${esc(os.numero)}</div>
            <div class="text-sm font-black text-white truncate">${esc(os.cliente)}</div>
          </div>
          ${os.prio==='alta'?'<span class="vis-acc-chip text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5">Alta</span>':''}
          <span class="${st.chip} text-[8px] font-black uppercase tracking-widest px-2 py-1">${st.label}</span>
        </div>
      </div>

      <div class="max-w-2xl mx-auto px-4 py-4 pb-28">
        ${cta ? `<div class="mb-4">${cta}</div>` : ''}
        ${rastreioHTML()}
        ${dadosHTML()}

        <!-- Checklist -->
        <div class="flex items-center justify-between mb-2 mt-5">
          <span class="text-[11px] font-black uppercase tracking-widest text-neutral-300">Checklist técnico</span>
          <span class="text-[10px] font-black num vis-acc">${prog.pct}%</span>
        </div>
        <div class="h-1 bg-neutral-900 mb-3"><div class="h-full bg-[color:var(--vis)] transition-all" style="width:${prog.pct}%"></div></div>
        ${CHECK_BLOCOS.map(blocoHTML).join('')}

        <!-- Observações -->
        <div class="border border-neutral-800 bg-[#0a0a0a] mb-5">
          <div class="px-3 py-2.5 bg-neutral-950 border-b border-neutral-800 text-[10px] font-black uppercase tracking-widest text-neutral-300 flex items-center gap-2"><i data-lucide="notebook-pen" class="w-3.5 h-3.5 vis-acc"></i> Observações</div>
          <textarea onchange="visOsObs(this.value)" rows="3" placeholder="Anotações da vistoria…" class="w-full bg-transparent px-3 py-2.5 text-[13px] text-neutral-100 outline-none resize-none">${esc(os.obs)}</textarea>
        </div>

        <!-- Fotos -->
        <div class="text-[11px] font-black uppercase tracking-widest text-neutral-300 mb-2 mt-5">Fotos <span class="text-neutral-600">· ${os.fotos.length}</span></div>
        <div class="border border-neutral-800 bg-[#0a0a0a] mb-5">${FOTO_CATS.map(fotoCatHTML).join('')}</div>

        <!-- Assinaturas -->
        <div class="text-[11px] font-black uppercase tracking-widest text-neutral-300 mb-2 mt-5">Assinaturas</div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
          ${assinaturaHTML('cliente','Assinatura do cliente')}
          ${assinaturaHTML('vistoriador','Assinatura do vistoriador')}
        </div>

        ${resultadoHTML()}

        <button onclick="visOsEnviar()" class="vis-acc-solid w-full inline-flex items-center justify-center gap-2 px-4 py-3 text-[11px] font-black uppercase tracking-widest mt-2"><i data-lucide="send" class="w-4 h-4"></i> Concluir e enviar</button>
        <p class="text-center text-[9px] font-bold uppercase tracking-widest text-neutral-700 mt-3">Local-first · persistência no Supabase chega na fase final</p>
      </div>`;
  }

  /* ----------------------------------------------------- HANDLERS */
  function visOsCheck(key) { os.checks[key] = !os.checks[key]; repaint(); }
  function visOsRadio(key, v) { os.checks[key] = (os.checks[key]===v ? null : v); repaint(); }
  function visOsInput(key, v) { os.checks[key] = v; }           // sem repaint (preserva foco)
  function visOsObs(v) { os.obs = v; }

  async function visOsFlow() {
    if (os.status === 'agendada') {
      os.status = 'deslocamento'; os.iniciadoEm = new Date().toISOString();
      toast('Deslocamento iniciado', 'ok'); repaint(); return;
    }
    if (os.status === 'deslocamento') {
      let lat=null,lng=null,ts=new Date().toISOString();
      try { const p = await getGPS(); lat=p.coords.latitude; lng=p.coords.longitude; }
      catch (_) { if (!confirm('Não foi possível obter o GPS.\n\nRegistrar a chegada mesmo assim, sem localização?')) return; }
      os.gpsChegada = { lat, lng, ts };
      os.status = 'em_campo';
      toast(lat==null ? 'Chegada registrada (sem GPS)' : 'Chegada registrada · GPS capturado', 'ok');
      repaint(); return;
    }
    if (os.status === 'em_campo') return visOsFinalizar();
  }

  function visOsFinalizar() {
    if (!os.resultado) { toast('Escolha o resultado antes de finalizar', 'warn'); return; }
    let ts = new Date().toISOString();
    getGPS().then(p => { os.gpsSaida = { lat:p.coords.latitude, lng:p.coords.longitude, ts }; finalize(); })
            .catch(() => { os.gpsSaida = { lat:null, lng:null, ts }; finalize(); });
  }
  function finalize() {
    os.status = 'finalizada';
    const r = RESULTADOS.find(x => x.id===os.resultado);
    toast('Vistoria finalizada · ' + (r?r.label:''), 'ok');
    repaint();
  }

  function visOsResultado(id) { os.resultado = (os.resultado===id ? null : id); repaint(); }

  /* fotos */
  function visOsAddFoto(cat) {
    pendingFoto = { cat };
    // input câmera (capture) com fallback p/ galeria via sheet simples
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*'; inp.setAttribute('capture','environment');
    inp.onchange = () => { const f = inp.files && inp.files[0]; if (f) doUpload(f); };
    inp.click();
  }
  async function doUpload(file) {
    const ctx = pendingFoto; pendingFoto = null;
    if (!ctx) return;
    toast('Processando foto…', 'info');
    try {
      const exif = await extractExif(file);
      const blob = await compressImage(file);
      const url = URL.createObjectURL(blob);
      os.fotos.push({ id:'f'+Date.now()+Math.random().toString(36).slice(2,6), cat:ctx.cat, url, lat:exif.lat, lng:exif.lng, ts:exif.ts });
      toast('Foto adicionada', 'ok');
      repaint();
    } catch (_) { toast('Falha ao processar a foto', 'err'); }
  }
  function visOsVerFoto(id) {
    const f = os.fotos.find(x => x.id===id); if (!f) return;
    const ov = document.createElement('div');
    ov.className = 'fixed inset-0 z-[120] bg-black/90 grid place-items-center p-4';
    ov.onclick = () => ov.remove();
    ov.innerHTML = `<div class="max-w-lg w-full"><img src="${f.url}" class="w-full object-contain max-h-[80vh]" />
      <div class="mt-3 text-center text-[10px] font-bold uppercase tracking-widest text-neutral-400">${esc(f.cat)}${f.lat!=null?' · GPS '+f.lat.toFixed(4)+', '+f.lng.toFixed(4):''}${f.ts?' · '+fmtDateTime(f.ts):''}</div>
      <button onclick="this.closest('div.fixed').remove()" class="mt-3 mx-auto block px-4 py-2 text-[10px] font-black uppercase tracking-widest text-neutral-200 border border-neutral-700">Fechar</button></div>`;
    document.body.appendChild(ov);
    if (window.lucide) lucide.createIcons();
  }

  /* assinatura */
  function visOsAssinar(which) {
    sigTarget = which;
    const wrap = document.createElement('div');
    wrap.id = 'vis-sig-modal';
    wrap.className = 'fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm';
    wrap.innerHTML = `
      <div class="w-full max-w-md bg-[#0a0a0a] border border-neutral-800 p-4">
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-sm font-black uppercase tracking-widest text-white">${which==='cliente'?'Assinatura do cliente':'Assinatura do vistoriador'}</h3>
          <button onclick="visOsSigClose()" class="text-neutral-500 hover:text-white"><i data-lucide="x" class="w-4 h-4"></i></button>
        </div>
        <canvas id="vis-sig-canvas" width="500" height="200" class="w-full bg-white border border-neutral-700" style="aspect-ratio:500/200; touch-action:none;"></canvas>
        <div class="flex items-center gap-2 mt-3">
          <button onclick="visOsSigClear()" class="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-neutral-300 border border-neutral-700">Limpar</button>
          <button onclick="visOsSigSave()" class="vis-acc-solid flex-1 px-3 py-2 text-[10px] font-black uppercase tracking-widest">Salvar assinatura</button>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    if (window.lucide) lucide.createIcons();
    sigPad = initSignaturePad(document.getElementById('vis-sig-canvas'));
  }
  function visOsSigClear() { if (sigPad) sigPad.clear(); }
  function visOsSigClose() { const m = document.getElementById('vis-sig-modal'); if (m) m.remove(); sigPad = null; sigTarget = null; }
  function visOsSigSave() {
    if (!sigPad || sigPad.isEmpty()) { toast('Assine antes de salvar', 'warn'); return; }
    os.assinaturas[sigTarget] = sigPad.toDataURL();
    visOsSigClose();
    toast('Assinatura registrada', 'ok');
    repaint();
  }

  function visOsEnviar() {
    const prog = checklistProgress();
    if (!os.resultado) { toast('Defina o resultado da vistoria', 'warn'); return; }
    if (os.status !== 'finalizada') { visOsFinalizar(); return; }
    toast('Vistoria concluída · ' + prog.done + '/' + prog.total + ' itens · ' + os.fotos.length + ' fotos', 'ok');
    setTimeout(visCloseOS, 900);
  }

  /* ------------------------------------------------ EXPOSE (window) */
  Object.assign(window, {
    visOpenOS, visCloseOS,
    visOsFlow, visOsCheck, visOsRadio, visOsInput, visOsObs, visOsResultado,
    visOsAddFoto, visOsVerFoto,
    visOsAssinar, visOsSigClear, visOsSigClose, visOsSigSave,
    visOsEnviar,
  });

})();
