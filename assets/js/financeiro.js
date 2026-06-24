// ==========================================================================
// MÓDULO FINANCEIRO — 3º ambiente do Portal Parceiros (acento teal/verde-água)
// Espelha o padrão do om.js (ambiente próprio com abas + roteador).
//
// FASE A: porta o protótipo (claude-design/financeiro) para o app real com
// DADOS DE EXEMPLO, deixando todas as 15 abas navegáveis. As fases seguintes
// trocam os dados de exemplo por RPCs (fin_*) e ligam as ações de verdade.
//
// Tudo encapsulado em IIFE; só os símbolos usados pela app (renderFinRoute) e
// pelos handlers inline (onclick) são expostos em window no final.
// ==========================================================================
(function () {
  'use strict';

  /* ---------------------------------------------------------------- DADOS */
  const recebiveis = [
    { cli:'Solar Vale Ltda',     proj:'Usina 84 kWp',   doc:'NF 1042', emi:'02/05', venc:'17/05', val:'R$ 18.400', st:'pago' },
    { cli:'EcoEnergia ME',       proj:'Telhado 22 kWp', doc:'NF 1041', emi:'28/04', venc:'28/05', val:'R$ 32.900', st:'avencer' },
    { cli:'Construtora Sol',     proj:'Galpão 60 kWp',  doc:'NF 1039', emi:'15/04', venc:'10/05', val:'R$ 9.750',  st:'vencido' },
    { cli:'Mercado Central',     proj:'32 kWp',         doc:'NF 1045', emi:'06/05', venc:'20/05', val:'R$ 14.200', st:'avencer' },
    { cli:'Usina Boa Vista',     proj:'84 kWp',         doc:'NF 1031', emi:'02/04', venc:'29/04', val:'R$ 27.600', st:'vencido' },
    { cli:'Residencial Aurora',  proj:'12 kWp',         doc:'NF 1047', emi:'09/05', venc:'08/06', val:'R$ 7.480',  st:'avencer' },
    { cli:'AgroLuz Cooperativa', proj:'140 kWp',        doc:'NF 1044', emi:'04/05', venc:'14/05', val:'R$ 41.300', st:'pago' },
  ];
  const stMap = {
    pago:    { l:'Pago',     c:'bg-emerald-500/10 text-emerald-400 border-emerald-500/25' },
    avencer: { l:'A vencer', c:'bg-yellow-500/10 text-yellow-400 border-yellow-500/25' },
    vencido: { l:'Vencido',  c:'bg-red-500/10 text-red-400 border-red-500/25' },
  };
  const pill = (st) => `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 border text-[9px] font-black uppercase tracking-widest ${stMap[st].c}"><span class="w-1 h-1 bg-current"></span>${stMap[st].l}</span>`;

  const comissoes = [
    { p:'João Mendes',    proj:4, base:'R$ 184.000', pc:'5,0%', com:'R$ 9.200', st:'liberar' },
    { p:'Marina Costa',   proj:3, base:'R$ 142.500', pc:'4,5%', com:'R$ 6.412', st:'liberar' },
    { p:'Pedro Almeida',  proj:2, base:'R$ 98.000',  pc:'5,0%', com:'R$ 4.900', st:'pago' },
    { p:'Ana Ribeiro',    proj:5, base:'R$ 210.300', pc:'4,0%', com:'R$ 8.412', st:'pago' },
    { p:'Carlos Tavares', proj:1, base:'R$ 47.600',  pc:'5,0%', com:'R$ 2.380', st:'liberar' },
  ];
  const comSt = { liberar:{l:'A liberar',c:'fin-acc-chip border border-[color:var(--fin-border-30)]'}, pago:{l:'Pago',c:'bg-emerald-500/10 text-emerald-400 border border-emerald-500/25'} };

  const orcamentos = [
    { cli:'Indústria Metalsol',  kwp:'180 kWp', val:'R$ 642.000', cst:'R$ 498.000', mg:22, st:'ok' },
    { cli:'Fazenda São Jorge',   kwp:'96 kWp',  val:'R$ 318.000', cst:'R$ 251.000', mg:21, st:'ok' },
    { cli:'Condomínio Sol Nasc.',kwp:'48 kWp',  val:'R$ 162.000', cst:'R$ 152.300', mg:6,  st:'baixa' },
    { cli:'Loja Center Norte',   kwp:'28 kWp',  val:'R$ 104.000', cst:'R$ 79.000',  mg:24, st:'ok' },
    { cli:'Clínica Vida',        kwp:'18 kWp',  val:'R$ 71.000',  cst:'R$ 57.800',  mg:19, st:'ok' },
    { cli:'Posto Avenida',       kwp:'40 kWp',  val:'R$ 138.000', cst:'R$ 131.000', mg:5,  st:'baixa' },
  ];
  const precificacao = [
    { k:'Kit 5,5 kWp · Inversor',  cst:'R$ 14.200', mk:'1,42×', pr:'R$ 20.160', mg:22 },
    { k:'Kit 8,2 kWp · Microinv.', cst:'R$ 22.800', mk:'1,40×', pr:'R$ 31.920', mg:21 },
    { k:'Kit 12 kWp · Trifásico',  cst:'R$ 31.500', mk:'1,38×', pr:'R$ 43.470', mg:20 },
    { k:'Estrutura solo · 30 kWp', cst:'R$ 9.800',  mk:'1,55×', pr:'R$ 15.190', mg:27 },
    { k:'Serviço instalação',      cst:'R$ 3.200',  mk:'1,60×', pr:'R$ 5.120',  mg:30 },
  ];
  const parcelamentos = [
    { cli:'Solar Vale Ltda',    tot:'R$ 184.000', n:12, pg:5, prox:'05/06', st:'em_dia' },
    { cli:'AgroLuz Coop.',      tot:'R$ 240.000', n:24, pg:9, prox:'10/06', st:'em_dia' },
    { cli:'Construtora Sol',    tot:'R$ 96.000',  n:10, pg:3, prox:'01/06', st:'atraso' },
    { cli:'Residencial Aurora', tot:'R$ 48.000',  n:6,  pg:2, prox:'08/06', st:'em_dia' },
  ];
  // DRE: dados reais via RPC get_fin_dre (ver renderDre / renderDreInline). Sem mock.
  let finDrePeriod = 'tudo';

  /* ------------------------------------------------------------- CHROME */
  // Garante que o modal e a área de toasts existam no body (uma vez só).
  function finEnsureChrome() {
    if (!document.getElementById('fin-toasts')) {
      const t = document.createElement('div');
      t.id = 'fin-toasts';
      t.className = 'fixed top-4 inset-x-0 z-[80] flex flex-col items-center gap-2 px-4 pointer-events-none';
      document.body.appendChild(t);
    }
    if (!document.getElementById('fin-modal')) {
      const m = document.createElement('div');
      m.id = 'fin-modal';
      m.className = 'fixed inset-0 z-[90] items-end sm:items-center justify-center';
      m.innerHTML = `
        <div class="absolute inset-0 bg-black/75 backdrop-blur-sm" onclick="closeFinModal()"></div>
        <div id="fin-modal-card" class="relative w-full sm:max-w-lg bg-[#0a0a0a] border border-neutral-800 max-h-[92vh] overflow-y-auto custom-scrollbar"></div>`;
      document.body.appendChild(m);
    }
  }

  function finToast(msg, type) {
    finEnsureChrome();
    const wrap = document.getElementById('fin-toasts');
    const tones = { ok:'border-emerald-500/40 text-emerald-300', info:'border-[color:var(--fin-border-40)] fin-acc', warn:'border-yellow-500/40 text-yellow-300', err:'border-red-500/40 text-red-300' };
    const icons = { ok:'check-circle', info:'info', warn:'alert-triangle', err:'x-circle' };
    const t = document.createElement('div');
    t.className = `fin-toast-in pointer-events-auto flex items-center gap-2.5 px-4 py-3 bg-[#0a0a0a] border ${tones[type]||tones.ok} text-[11px] font-black uppercase tracking-widest shadow-2xl max-w-[90vw]`;
    t.innerHTML = `<i data-lucide="${icons[type]||icons.ok}" class="w-4 h-4 shrink-0"></i><span class="truncate">${msg}</span>`;
    wrap.appendChild(t);
    if (window.lucide) lucide.createIcons();
    setTimeout(() => { t.style.transition='opacity .3s, transform .3s'; t.style.opacity='0'; t.style.transform='translateY(-8px)'; setTimeout(()=>t.remove(),300); }, 2800);
  }
  const finIcons = () => { if (window.lucide) lucide.createIcons(); };
  const brMoney = n => 'R$ ' + Math.round(Number(n) || 0).toLocaleString('pt-BR');

  // Chamador de RPC com tratamento de erro padrão.
  async function finRpc(name, args) {
    const { data, error } = await supabaseClient.rpc(name, args || {});
    if (error) { console.error('[financeiro] ' + name, error); finToast('Erro: ' + (error.message || name), 'err'); throw error; }
    return data;
  }

  /* -------------------------------------------- GRÁFICO DE FATURAMENTO */
  const FAT_MES = ['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'];
  // Faturamento mensal REAL (em milhares de R$). Carregado de get_fin_faturamento_series.
  // Os últimos FAT_PROJ meses são projeção (títulos a vencer). Começa vazio até o load.
  let FAT_VALS = [];
  let FAT_PROJ = 2;
  function fatLabels(count, endY, endM) {
    const out=[]; let y=endY, m=endM;
    for (let i=0;i<count;i++){ out.unshift(FAT_MES[m]+'/'+String(y).slice(2)); m--; if(m<0){m=11;y--;} }
    return out;
  }
  let FAT_ALL_LABELS = [];
  // Busca a série real e (re)desenha o gráfico.
  async function loadFaturamento(period='12m') {
    let d;
    try { d = await finRpc('get_fin_faturamento_series', { p_months: 24 }); } catch (_) { return; }
    FAT_VALS = (d.valores || []).map(v => (Number(v) || 0) / 1000); // RPC em R$ → escala em milhares
    FAT_PROJ = Number(d.proj) || 0;
    FAT_ALL_LABELS = fatLabels(FAT_VALS.length, Number(d.end_y) || new Date().getFullYear(), Number(d.end_m) || 0);
    renderFaturamento(period);
  }

  function brCompact(thousands) {
    const v = thousands*1000;
    if (v>=1e6) return 'R$ '+(v/1e6).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+' mi';
    return 'R$ '+Math.round(v).toLocaleString('pt-BR');
  }
  const brFull = t => 'R$ '+Math.round(t*1000).toLocaleString('pt-BR');

  function smoothPath(pts) {
    if (pts.length<2) return pts.length?`M ${pts[0].x} ${pts[0].y}`:'';
    let d=`M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
    for (let i=0;i<pts.length-1;i++){
      const p0=pts[i-1]||pts[i], p1=pts[i], p2=pts[i+1], p3=pts[i+2]||p2;
      const c1x=p1.x+(p2.x-p0.x)/6, c1y=p1.y+(p2.y-p0.y)/6;
      const c2x=p2.x-(p3.x-p1.x)/6, c2y=p2.y-(p3.y-p1.y)/6;
      d+=` C ${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
    }
    return d;
  }

  let FAT_STATE = null;
  const FAT_VB = { w:1000, h:300, padL:14, padR:14, padT:24, padB:14 };

  function renderFaturamento(period='12m') {
    const host = document.getElementById('fat-chart'); if (!host) return;
    if (!FAT_VALS.length) {
      host.innerHTML = `<div class="grid place-items-center text-[10px] text-neutral-600 font-bold uppercase tracking-widest" style="height:clamp(180px,26vw,300px)">Sem histórico de faturamento ainda</div>`;
      const t = document.getElementById('fat-total'); if (t) t.textContent = 'R$ 0';
      const dl = document.getElementById('fat-delta'); if (dl) dl.innerHTML = '';
      const xl = document.getElementById('fat-xlabels'); if (xl) xl.innerHTML = '';
      return;
    }
    const n = period==='6m'?6 : period==='24m'?24 : 12;
    const start = Math.max(0, FAT_VALS.length - n);
    const vals = FAT_VALS.slice(start);
    const labels = FAT_ALL_LABELS.slice(start);
    const projFrom = vals.length - FAT_PROJ;

    const max = Math.max(...vals), min = Math.min(...vals);
    const pad = (max-min)*0.18 || 1;
    const lo = min-pad, hi = max+pad;
    const { w,h,padL,padR,padT,padB } = FAT_VB;
    const xFor = i => padL + i*(w-padL-padR)/(vals.length-1);
    const yFor = v => padT + (1-(v-lo)/(hi-lo))*(h-padT-padB);
    const pts = vals.map((v,i)=>({ x:xFor(i), y:yFor(v), v, label:labels[i], proj:i>=projFrom }));

    const realized = pts.slice(0, projFrom+1);
    const projected = pts.slice(projFrom);
    const lineReal = smoothPath(realized);
    const lineProj = smoothPath(projected);
    const baseY = h-padB;
    const areaD = lineReal + ` L ${realized[realized.length-1].x.toFixed(1)} ${baseY} L ${realized[0].x.toFixed(1)} ${baseY} Z`;

    let grid='';
    for (let g=0; g<=3; g++){ const gy = padT + g*(h-padT-padB)/3; grid += `<line class="fat-grid" x1="0" y1="${gy.toFixed(1)}" x2="${w}" y2="${gy.toFixed(1)}"/>`; }

    host.innerHTML = `
      <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="height:clamp(180px,26vw,300px)">
        <defs>
          <linearGradient id="fatGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="var(--fin-soft)" stop-opacity="0.28"/>
            <stop offset="100%" stop-color="var(--fin-soft)" stop-opacity="0"/>
          </linearGradient>
        </defs>
        ${grid}
        <path d="${areaD}" fill="url(#fatGrad)"/>
        <path class="fat-line" d="${lineReal}"/>
        <path class="fat-line proj" d="${lineProj}"/>
        <line id="fat-cross" class="fat-crosshair" x1="0" y1="${padT}" x2="0" y2="${baseY}"/>
      </svg>
      <div id="fat-dot" class="fat-dot"></div>
      <div id="fat-tip" class="fat-tip"></div>`;

    document.getElementById('fat-xlabels').innerHTML = labels
      .map((l,i)=> (vals.length>14 && i%2!==0 && i!==vals.length-1) ? '' : `<span style="flex:1;text-align:center">${l}</span>`)
      .join('');

    const realVals = vals.slice(0, projFrom);
    const total = realVals.reduce((a,b)=>a+b,0);
    document.getElementById('fat-total').textContent = brCompact(total);
    const d0 = realVals[0] || 0, dLast = realVals[realVals.length-1] || 0;
    const deltaEl = document.getElementById('fat-delta');
    if (deltaEl) {
      if (d0 > 0) {
        const delta = (dLast - d0) / d0 * 100, up = delta >= 0;
        deltaEl.innerHTML = `<i data-lucide="${up?'trending-up':'trending-down'}" class="w-3 h-3"></i>${up?'+':''}${delta.toFixed(1)}% no período`;
      } else { deltaEl.innerHTML = ''; }
    }

    FAT_STATE = { pts, vals, labels, projFrom };
    finIcons();
  }

  function fatHover(e) {
    if (!FAT_STATE) return;
    const wrap = document.getElementById('fat-chart'); if (!wrap) return;
    const svg = wrap.querySelector('svg'); if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const ratio = (e.clientX-rect.left)/rect.width;
    let idx=0, best=1e9;
    FAT_STATE.pts.forEach((p,i)=>{ const d=Math.abs(p.x/FAT_VB.w - ratio); if(d<best){best=d;idx=i;} });
    const p = FAT_STATE.pts[idx];
    const px = p.x/FAT_VB.w*rect.width;
    const py = p.y/FAT_VB.h*rect.height;
    wrap.classList.add('show');
    const cross = document.getElementById('fat-cross');
    cross.setAttribute('x1', p.x); cross.setAttribute('x2', p.x);
    const dot = document.getElementById('fat-dot');
    dot.style.left = px+'px'; dot.style.top = py+'px';
    dot.style.background = p.proj ? 'var(--fin)' : 'var(--fin-soft)';
    const tip = document.getElementById('fat-tip');
    tip.style.left = Math.min(Math.max(px,60), rect.width-60)+'px';
    tip.style.top = py+'px';
    tip.innerHTML = `
      <div class="text-[8px] font-black uppercase tracking-widest text-neutral-500">${p.label}${p.proj?' · projeção':''}</div>
      <div class="text-sm font-black num mt-0.5" style="color:${p.proj?'var(--fin)':'#fff'}">${brFull(p.v)}</div>`;
  }
  function fatLeave() { const w=document.getElementById('fat-chart'); if (w) w.classList.remove('show'); }

  let _finFatResizeBound = false;
  function bindFaturamento() {
    const wrap = document.getElementById('fat-chart'); if (!wrap) return;
    wrap.addEventListener('pointermove', fatHover);
    wrap.addEventListener('pointerleave', fatLeave);
    const period = document.getElementById('fat-period');
    if (period) period.addEventListener('click', e => {
      const b = e.target.closest('.fat-pbtn'); if (!b) return;
      document.querySelectorAll('.fat-pbtn').forEach(x=>x.classList.remove('is-active'));
      b.classList.add('is-active');
      renderFaturamento(b.dataset.p);
    });
    if (!_finFatResizeBound) {
      let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt=setTimeout(fatLeave,150); });
      _finFatResizeBound = true;
    }
  }

  function drawSpark(id, values, color) {
    const el = document.getElementById(id); if (!el) return;
    const max=Math.max(...values), min=Math.min(...values), rng=(max-min)||1;
    const pts = values.map((v,i)=>({ x:i*100/(values.length-1), y:4+(1-(v-min)/rng)*22 }));
    const line = smoothPath(pts);
    const area = line + ` L 100 30 L 0 30 Z`;
    el.innerHTML = `<path d="${area}" fill="${color}" fill-opacity="0.10" stroke="none"/><path d="${line}" stroke="${color}"/>`;
  }
  function renderSparklines(sp) {
    sp = sp || {};
    const z = [0,0,0,0,0,0];
    const arr = a => (a && a.length ? a : z).map(Number);
    drawSpark('spark-recebido',  arr(sp.recebido),  '#34d399');
    drawSpark('spark-avencer',   arr(sp.avencer),   '#facc15');
    drawSpark('spark-vencido',   arr(sp.vencido),   '#f87171');
    drawSpark('spark-comissoes', arr(sp.comissoes), '#2dd4bf');
  }
  // Agregados extras do dashboard: ação, projeção de caixa, sparklines, margem, DRE inline, risco.
  async function finLoadDashboardExtras() {
    let d = null;
    try { d = await finRpc('get_fin_dashboard'); } catch (_) {}
    const set = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
    if (d) {
      const a = d.acao || {}, cx = d.caixa || {};
      set('fin-acao-pag', (a.pag_count || 0) + ' lançamentos · ' + brMoney(a.pag_valor));
      set('fin-acao-com', (a.com_count || 0) + ' parceiros · ' + brMoney(a.com_valor));
      const ent = Number(cx.entradas_30d) || 0, sai = Number(cx.saidas_30d) || 0;
      set('fin-cx-net', brMoney(ent - sai));
      set('fin-cx-entradas', '+ ' + brMoney(ent));
      set('fin-cx-saidas', '− ' + brMoney(sai));
      renderSparklines(d.sparks);
      const rec = ((d.sparks && d.sparks.recebido) || []).map(Number);
      const dEl = document.getElementById('fin-kpi-recebido-delta');
      if (dEl && rec.length >= 2 && rec[rec.length-2] > 0) {
        const dl = (rec[rec.length-1] - rec[rec.length-2]) / rec[rec.length-2] * 100, up = dl >= 0;
        dEl.className = 'text-[10px] font-bold mt-1.5 ' + (up ? 'text-emerald-400' : 'text-red-400');
        dEl.textContent = (up ? '▲ ' : '▼ ') + Math.abs(dl).toFixed(0) + '% vs mês anterior';
      } else if (dEl) { dEl.textContent = ''; }
    } else { renderSparklines(null); }
    // Margem + DRE inline numa única chamada compartilhada
    let dre = null;
    try { dre = await finRpc('get_fin_dre', { p_period: 'tudo' }); } catch (_) {}
    renderDreInline(dre);
    renderMargemGauge(dre);
    renderRiscoBox();
  }
  function renderMargemGauge(dre) {
    const val = document.getElementById('fin-margem-val');
    const arc = document.getElementById('fin-margem-arc');
    const m = dre ? Number(dre.margem_pct) || 0 : 0;
    if (val) val.textContent = m.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
    if (arc) {
      const C = 314, pct = Math.max(0, Math.min(m, 100));
      arc.setAttribute('stroke-dashoffset', (C * (1 - pct / 100)).toFixed(0));
      arc.setAttribute('stroke', m < 0 ? '#f87171' : 'var(--fin)');
    }
  }
  const finRiscoTone = { '1':'bg-red-500/10 text-red-400 border-red-500/25', '2':'bg-yellow-500/10 text-yellow-400 border-yellow-500/25' };
  const finRiscoIcon = { vencido:'alert-triangle', margem:'percent' };
  async function renderRiscoBox() {
    const host = document.getElementById('fin-risco'); if (!host) return;
    let rows = [];
    try { rows = await finRpc('list_fin_pendencias') || []; } catch (_) {}
    const cnt = document.getElementById('fin-risco-count');
    if (cnt) cnt.textContent = rows.length ? (rows.length + ' em atenção') : 'tudo certo';
    const top = rows.slice(0, 3);
    host.innerHTML = top.length ? top.map(p=>`
      <button onclick="setTab('${p.atalho}')" class="w-full flex items-center justify-between gap-3 p-3 bg-neutral-950/60 border border-neutral-800 hover:border-[color:var(--fin-border-30)] transition-colors text-left">
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-9 h-9 grid place-items-center border ${finRiscoTone[p.sev]||finRiscoTone['2']} shrink-0"><i data-lucide="${finRiscoIcon[p.tipo]||'alert-circle'}" class="w-4 h-4"></i></div>
          <div class="min-w-0"><div class="text-sm font-black text-white truncate">${escapeHTML(p.titulo)}</div><div class="text-[10px] text-neutral-500 font-bold truncate">${escapeHTML(p.sub)}</div></div>
        </div>
        <span class="text-white font-black num shrink-0">${brMoney(p.valor)}</span>
      </button>`).join('') : `<div class="p-6 text-center text-[10px] text-neutral-600 font-bold uppercase tracking-widest">Nenhum projeto em risco 🎉</div>`;
    finIcons();
  }
  async function renderDreInline(pre) {
    const host = document.getElementById('dre-inline'); if (!host) return;
    let d = pre;
    if (!d) { try { d = await finRpc('get_fin_dre', { p_period: 'tudo' }); } catch (_) { host.innerHTML = ''; return; } }
    if (!d) { host.innerHTML = ''; return; }
    const rec = Number(d.receita_bruta) || 0;
    const custosDir = (d.custos || []).filter(c => c.origem === 'lancado').reduce((s, c) => s + (Number(c.valor) || 0), 0);
    const impostos  = (d.custos || []).filter(c => c.origem === 'formula').reduce((s, c) => s + (Number(c.valor) || 0), 0);
    const base = Math.max(rec, 1);
    const rows = [
      { l:'Receita bruta',        v:rec,                         t:'pos' },
      { l:'(−) Custos diretos',   v:custosDir,                   t:'neg' },
      { l:'(−) Impostos & taxas', v:impostos,                    t:'neg' },
      { l:'(=) Lucro líquido',    v:Number(d.lucro_liquido)||0,  t:'res' },
    ];
    const col = t => t==='res'?'#34d399' : t==='neg'?'#52525b' : 'var(--fin)';
    host.innerHTML = rows.map(r=>`
      <div>
        <div class="flex justify-between text-[11px] font-bold mb-1.5">
          <span class="${r.t==='res'?'text-white':'text-neutral-300'}">${r.l}</span>
          <span class="${r.t==='res'?'text-emerald-400':'text-white'} num">${brMoney(r.v)}</span>
        </div>
        <div class="h-2.5 bg-neutral-900"><div class="h-full bar-anim" style="width:${Math.min(Math.abs(r.v)/base*100,100).toFixed(0)}%;background:${col(r.t)}"></div></div>
      </div>`).join('');
  }

  /* --------------------------------------------------- TABELAS / RENDER */
  let finTitulos = [];              // títulos carregados (recebíveis)
  const finTitById = id => finTitulos.find(t => t.id === id);

  async function renderRecentes() {
    const host = document.getElementById('recentes-body'); if (!host) return;
    let rows = [];
    try { rows = await finRpc('list_fin_titulos', { p_filter: 'todos' }) || []; } catch (_) { return; }
    rows = rows.slice(0, 4);
    host.innerHTML = rows.length ? rows.map(r=>`
      <tr class="border-b border-neutral-800/60 hover:bg-neutral-900/40 transition-colors">
        <td class="px-5 py-3.5"><div class="font-black text-white">${escapeHTML(r.cli)}</div><div class="text-[10px] text-neutral-500 font-bold">${escapeHTML(r.proj)}</div></td>
        <td class="px-3 py-3.5 text-neutral-400 font-mono text-[11px]">${r.doc}</td>
        <td class="px-3 py-3.5 text-neutral-400 num">${r.venc||'—'}</td>
        <td class="px-3 py-3.5 text-right text-white font-bold num">${brMoney(r.valor)}</td>
        <td class="px-5 py-3.5 text-right">${pill(r.st)}</td>
      </tr>`).join('') : `<tr><td colspan="5" class="px-5 py-8 text-center text-[10px] text-neutral-600 font-bold uppercase tracking-widest">Nenhum recebível ainda</td></tr>`;
    finIcons();
  }

  async function renderRec(filter) {
    if (filter) state.finFilters.recebiveis.f = filter;
    filter = state.finFilters.recebiveis.f || 'todos';
    try { finTitulos = await finRpc('list_fin_titulos', { p_filter: filter }) || []; } catch (_) { finTitulos = []; }
    const editBtn = (r) => `<button onclick="finTitEdit('${r.id}')" title="Editar título" class="w-8 h-8 grid place-items-center bg-neutral-900 text-neutral-400 border border-neutral-800 hover:fin-acc transition-colors"><i data-lucide="pencil" class="w-4 h-4"></i></button>`;
    const acts = (r) => r.st === 'pago'
      ? `<div class="inline-flex gap-1.5 justify-end items-center"><span class="text-[10px] font-bold uppercase tracking-widest text-emerald-400 inline-flex items-center gap-1"><i data-lucide="check-check" class="w-3.5 h-3.5"></i>Pago</span>${editBtn(r)}</div>`
      : `<div class="inline-flex gap-1.5 justify-end">
          <button onclick="finTitBaixar('${r.id}')" title="Baixar / receber" class="w-8 h-8 grid place-items-center bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 hover:bg-emerald-500/20 transition-colors"><i data-lucide="check" class="w-4 h-4 stroke-[2.5]"></i></button>
          <button onclick="finTitReneg('${r.id}')" title="Renegociar vencimento" class="w-8 h-8 grid place-items-center bg-neutral-900 text-neutral-400 border border-neutral-800 hover:text-white transition-colors"><i data-lucide="calendar-clock" class="w-4 h-4"></i></button>
          ${editBtn(r)}
          <button onclick="finTitCancelar('${r.id}')" title="Cancelar" class="w-8 h-8 grid place-items-center bg-red-500/10 text-red-400 border border-red-500/25 hover:bg-red-500/20 transition-colors"><i data-lucide="x" class="w-4 h-4 stroke-[2.5]"></i></button>
        </div>`;
    const tbl = document.getElementById('rec-table');
    if (tbl) tbl.innerHTML = finTitulos.length ? finTitulos.map(r=>`
      <tr class="border-b border-neutral-800/60 hover:bg-neutral-900/40 transition-colors">
        <td class="px-5 py-3.5"><div class="font-black text-white">${escapeHTML(r.cli)}</div><div class="text-[10px] text-neutral-500 font-bold">${escapeHTML(r.proj)}</div></td>
        <td class="px-3 py-3.5 text-neutral-400 font-mono text-[11px]">${r.doc}</td>
        <td class="px-3 py-3.5 text-neutral-400 num">${r.emi||'—'}</td>
        <td class="px-3 py-3.5 text-neutral-400 num">${r.venc||'—'}</td>
        <td class="px-3 py-3.5 text-right text-white font-bold num">${brMoney(r.valor)}</td>
        <td class="px-3 py-3.5 text-center">${pill(r.st)}</td>
        <td class="px-5 py-3.5 text-right">${acts(r)}</td>
      </tr>`).join('') : `<tr><td colspan="7" class="px-5 py-10 text-center text-[10px] text-neutral-600 font-bold uppercase tracking-widest">Nenhum título neste filtro</td></tr>`;
    const cards = document.getElementById('rec-cards');
    if (cards) cards.innerHTML = finTitulos.length ? finTitulos.map(r=>`
      <div class="metric-card p-4">
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0"><div class="font-black text-white truncate">${escapeHTML(r.cli)}</div><div class="text-[10px] text-neutral-500 font-bold">${escapeHTML(r.proj)} · ${escapeHTML(r.doc)}</div></div>
          ${pill(r.st)}
        </div>
        <div class="flex items-center justify-between mt-3 pt-3 border-t border-neutral-800">
          <span class="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Vence ${r.venc||'—'}</span>
          <span class="text-white font-black num">${brMoney(r.valor)}</span>
        </div>
        ${r.st!=='pago'?`<div class="flex gap-2 mt-3">
          <button onclick="finTitBaixar('${r.id}')" class="flex-1 py-2.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 text-[10px] font-black uppercase tracking-widest inline-flex items-center justify-center gap-1.5"><i data-lucide="check" class="w-3.5 h-3.5"></i>Baixar</button>
          <button onclick="finTitReneg('${r.id}')" class="py-2.5 px-3 bg-neutral-900 text-neutral-300 border border-neutral-800 text-[10px] font-black uppercase tracking-widest inline-flex items-center justify-center gap-1.5"><i data-lucide="calendar-clock" class="w-3.5 h-3.5"></i></button>
          <button onclick="finTitEdit('${r.id}')" class="py-2.5 px-3 bg-neutral-900 text-neutral-300 border border-neutral-800 text-[10px] font-black uppercase tracking-widest inline-flex items-center justify-center gap-1.5"><i data-lucide="pencil" class="w-3.5 h-3.5"></i></button>
          <button onclick="finTitCancelar('${r.id}')" class="py-2.5 px-3 bg-red-500/10 text-red-400 border border-red-500/25 text-[10px] font-black uppercase tracking-widest inline-flex items-center justify-center gap-1.5"><i data-lucide="x" class="w-3.5 h-3.5"></i></button>
        </div>`:`<div class="flex mt-3"><button onclick="finTitEdit('${r.id}')" class="flex-1 py-2.5 bg-neutral-900 text-neutral-300 border border-neutral-800 text-[10px] font-black uppercase tracking-widest inline-flex items-center justify-center gap-1.5"><i data-lucide="pencil" class="w-3.5 h-3.5"></i>Editar</button></div>`}
      </div>`).join('') : `<div class="text-center text-[10px] text-neutral-600 font-bold uppercase tracking-widest py-8">Nenhum título neste filtro</div>`;
    finIcons();
  }

  /* Ações de título: baixar (modal), renegociar (prompt), cancelar (confirm) + lançamento (modal) */
  function finTitBaixar(id) {
    const t = finTitById(id); if (!t) return;
    finEnsureChrome();
    document.getElementById('fin-modal-card').innerHTML = `
      <div class="sticky top-0 bg-[#0a0a0a] border-b border-neutral-800 px-5 py-4 flex items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="text-[10px] font-black uppercase tracking-[0.2em] fin-acc-strong">Baixar título</div>
          <h3 class="text-lg font-black text-white mt-1 truncate">${escapeHTML(t.cli)}</h3>
          <div class="text-[11px] text-neutral-500 font-bold">${t.proj} · saldo ${brMoney(t.saldo)}</div>
        </div>
        <button onclick="closeFinModal()" class="shrink-0 w-9 h-9 grid place-items-center bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white transition-colors"><i data-lucide="x" class="w-4 h-4"></i></button>
      </div>
      <div class="p-5 space-y-4">
        <div>
          <label class="text-[10px] font-black uppercase tracking-widest text-neutral-500">Valor recebido</label>
          <input id="fin-baixa-valor" type="number" step="0.01" value="${t.saldo}" class="fin-acc-focus w-full mt-1.5 px-3 py-2.5 bg-neutral-950 border border-neutral-800 text-white num text-lg font-black">
        </div>
        <div>
          <label class="text-[10px] font-black uppercase tracking-widest text-neutral-500">Meio</label>
          <select id="fin-baixa-meio" class="fin-acc-focus w-full mt-1.5 px-3 py-2.5 bg-neutral-950 border border-neutral-800 text-white text-sm font-bold">
            <option value="PIX">PIX</option><option value="Boleto">Boleto</option><option value="Transferência">Transferência</option><option value="Dinheiro">Dinheiro</option><option value="Cartão">Cartão</option>
          </select>
        </div>
        <button onclick="finBaixarSubmit('${id}')" class="w-full py-3 fin-acc-solid text-[11px] font-black uppercase tracking-widest inline-flex items-center justify-center gap-2"><i data-lucide="check" class="w-4 h-4 stroke-[3]"></i>Confirmar baixa</button>
      </div>`;
    document.getElementById('fin-modal').classList.add('is-open');
    finIcons();
  }
  async function finBaixarSubmit(id) {
    const valor = parseFloat(document.getElementById('fin-baixa-valor').value);
    const meio = document.getElementById('fin-baixa-meio').value;
    if (!(valor > 0)) { finToast('Informe um valor válido', 'warn'); return; }
    try { await finRpc('baixar_fin_titulo', { p_id: id, p_valor: valor, p_meio: meio, p_comprovante: '' }); }
    catch (_) { return; }
    closeFinModal(); finToast('Baixa registrada', 'ok'); renderRec();
  }
  function finTitReneg(id) {
    const t = finTitById(id); if (!t) return;
    finEnsureChrome();
    document.getElementById('fin-modal-card').innerHTML = `
      <div class="sticky top-0 bg-[#0a0a0a] border-b border-neutral-800 px-5 py-4 flex items-start justify-between gap-3">
        <div class="min-w-0"><div class="text-[10px] font-black uppercase tracking-[0.2em] fin-acc-strong">Renegociar</div>
          <h3 class="text-lg font-black text-white mt-1 truncate">${escapeHTML(t.cli)}</h3>
          <div class="text-[11px] text-neutral-500 font-bold">Vence hoje em ${t.venc||'—'}</div></div>
        <button onclick="closeFinModal()" class="shrink-0 w-9 h-9 grid place-items-center bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white transition-colors"><i data-lucide="x" class="w-4 h-4"></i></button>
      </div>
      <div class="p-5 space-y-4">
        <div><label class="text-[10px] font-black uppercase tracking-widest text-neutral-500">Novo vencimento</label>
          <input id="fin-reneg-venc" type="date" value="${t.venc_iso||''}" class="fin-acc-focus w-full mt-1.5 px-3 py-2.5 bg-neutral-950 border border-neutral-800 text-white text-sm font-bold"></div>
        <button onclick="finTitRenegSubmit('${id}')" class="w-full py-3 fin-acc-solid text-[11px] font-black uppercase tracking-widest inline-flex items-center justify-center gap-2"><i data-lucide="calendar-clock" class="w-4 h-4"></i>Atualizar vencimento</button>
      </div>`;
    document.getElementById('fin-modal').classList.add('is-open');
    finIcons();
  }
  async function finTitRenegSubmit(id) {
    const nova = document.getElementById('fin-reneg-venc').value;
    if (!nova) { finToast('Informe o novo vencimento', 'warn'); return; }
    try { await finRpc('renegociar_fin_titulo', { p_id: id, p_vencimento: nova }); } catch (_) { return; }
    closeFinModal(); finToast('Vencimento atualizado', 'ok'); renderRec();
  }
  // Edição manual completa do título (valor, descrição, documento, datas).
  function finTitEdit(id) {
    const t = finTitById(id); if (!t) return;
    finEnsureChrome();
    document.getElementById('fin-modal-card').innerHTML = `
      <div class="sticky top-0 bg-[#0a0a0a] border-b border-neutral-800 px-5 py-4 flex items-start justify-between gap-3">
        <div class="min-w-0"><div class="text-[10px] font-black uppercase tracking-[0.2em] fin-acc-strong">Editar título</div>
          <h3 class="text-lg font-black text-white mt-1 truncate">${escapeHTML(t.cli)}</h3>
          ${Number(t.pago)>0?`<div class="text-[11px] text-yellow-400 font-bold">Já recebido ${brMoney(t.pago)} — valor não pode ficar abaixo disso</div>`:''}</div>
        <button onclick="closeFinModal()" class="shrink-0 w-9 h-9 grid place-items-center bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white transition-colors"><i data-lucide="x" class="w-4 h-4"></i></button>
      </div>
      <div class="p-5 space-y-4">
        <div><label class="text-[10px] font-black uppercase tracking-widest text-neutral-500">Descrição</label>
          <input id="fin-ed-desc" type="text" value="${(t.desc_raw||'').replace(/"/g,'&quot;')}" class="fin-acc-focus w-full mt-1.5 px-3 py-2.5 bg-neutral-950 border border-neutral-800 text-white text-sm font-bold"></div>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="text-[10px] font-black uppercase tracking-widest text-neutral-500">Documento</label>
            <input id="fin-ed-doc" type="text" value="${(t.doc_raw||'').replace(/"/g,'&quot;')}" class="fin-acc-focus w-full mt-1.5 px-3 py-2.5 bg-neutral-950 border border-neutral-800 text-white text-sm font-bold"></div>
          <div><label class="text-[10px] font-black uppercase tracking-widest text-neutral-500">Valor</label>
            <input id="fin-ed-valor" type="number" step="0.01" value="${Number(t.valor)||0}" class="fin-acc-focus w-full mt-1.5 px-3 py-2.5 bg-neutral-950 border border-neutral-800 text-white num font-black"></div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="text-[10px] font-black uppercase tracking-widest text-neutral-500">Emissão</label>
            <input id="fin-ed-emi" type="date" value="${t.emi_iso||''}" class="fin-acc-focus w-full mt-1.5 px-3 py-2.5 bg-neutral-950 border border-neutral-800 text-white text-sm font-bold"></div>
          <div><label class="text-[10px] font-black uppercase tracking-widest text-neutral-500">Vencimento</label>
            <input id="fin-ed-venc" type="date" value="${t.venc_iso||''}" class="fin-acc-focus w-full mt-1.5 px-3 py-2.5 bg-neutral-950 border border-neutral-800 text-white text-sm font-bold"></div>
        </div>
        <button onclick="finTitEditSubmit('${id}')" class="w-full py-3 fin-acc-solid text-[11px] font-black uppercase tracking-widest inline-flex items-center justify-center gap-2"><i data-lucide="save" class="w-4 h-4 stroke-[3]"></i>Salvar alterações</button>
      </div>`;
    document.getElementById('fin-modal').classList.add('is-open');
    finIcons();
  }
  async function finTitEditSubmit(id) {
    const valor = parseFloat(document.getElementById('fin-ed-valor').value);
    if (!(valor > 0)) { finToast('Informe um valor válido', 'warn'); return; }
    try {
      await finRpc('update_fin_titulo', {
        p_id: id,
        p_descricao: document.getElementById('fin-ed-desc').value || '',
        p_documento: document.getElementById('fin-ed-doc').value || '',
        p_valor: valor,
        p_emissao: document.getElementById('fin-ed-emi').value || null,
        p_vencimento: document.getElementById('fin-ed-venc').value || null,
      });
    } catch (_) { return; }
    closeFinModal(); finToast('Título atualizado', 'ok'); renderRec();
  }
  async function finTitCancelar(id) {
    if (!window.confirm('Cancelar este título?')) return;
    try { await finRpc('cancelar_fin_titulo', { p_id: id }); } catch (_) { return; }
    finToast('Título cancelado', 'info'); renderRec();
  }

  /* Lançamento manual de título (com busca de cliente) */
  let finLancCliente = null;
  let finLancResults = [];
  function finLancamentoModal() {
    finEnsureChrome();
    finLancCliente = null;
    document.getElementById('fin-modal-card').innerHTML = `
      <div class="sticky top-0 bg-[#0a0a0a] border-b border-neutral-800 px-5 py-4 flex items-start justify-between gap-3">
        <div><div class="text-[10px] font-black uppercase tracking-[0.2em] fin-acc-strong">Novo lançamento</div>
          <h3 class="text-lg font-black text-white mt-1">Título a receber</h3></div>
        <button onclick="closeFinModal()" class="shrink-0 w-9 h-9 grid place-items-center bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white transition-colors"><i data-lucide="x" class="w-4 h-4"></i></button>
      </div>
      <div class="p-5 space-y-4">
        <div class="relative">
          <label class="text-[10px] font-black uppercase tracking-widest text-neutral-500">Cliente</label>
          <input id="fin-lanc-cli" type="text" autocomplete="off" oninput="finLancClienteSearch(this.value)" placeholder="BUSCAR CLIENTE..." class="fin-acc-focus w-full mt-1.5 px-3 py-2.5 bg-neutral-950 border border-neutral-800 text-white placeholder:text-neutral-600 text-[11px] font-bold uppercase tracking-wide">
          <div id="fin-lanc-results" class="hidden absolute z-30 left-0 right-0 mt-1 max-h-48 overflow-y-auto custom-scrollbar bg-neutral-950 border border-neutral-800 shadow-2xl"></div>
          <div id="fin-lanc-sel" class="text-[11px] font-black fin-acc mt-1.5"></div>
        </div>
        <div><label class="text-[10px] font-black uppercase tracking-widest text-neutral-500">Descrição</label>
          <input id="fin-lanc-desc" type="text" placeholder="Ex.: Entrada do kit" class="fin-acc-focus w-full mt-1.5 px-3 py-2.5 bg-neutral-950 border border-neutral-800 text-white text-sm font-bold"></div>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="text-[10px] font-black uppercase tracking-widest text-neutral-500">Documento</label>
            <input id="fin-lanc-doc" type="text" placeholder="NF / nº" class="fin-acc-focus w-full mt-1.5 px-3 py-2.5 bg-neutral-950 border border-neutral-800 text-white text-sm font-bold"></div>
          <div><label class="text-[10px] font-black uppercase tracking-widest text-neutral-500">Valor</label>
            <input id="fin-lanc-valor" type="number" step="0.01" placeholder="0,00" class="fin-acc-focus w-full mt-1.5 px-3 py-2.5 bg-neutral-950 border border-neutral-800 text-white num font-black"></div>
        </div>
        <div><label class="text-[10px] font-black uppercase tracking-widest text-neutral-500">Vencimento</label>
          <input id="fin-lanc-venc" type="date" class="fin-acc-focus w-full mt-1.5 px-3 py-2.5 bg-neutral-950 border border-neutral-800 text-white text-sm font-bold"></div>
        <button onclick="finLancamentoSubmit()" class="w-full py-3 fin-acc-solid text-[11px] font-black uppercase tracking-widest inline-flex items-center justify-center gap-2"><i data-lucide="plus" class="w-4 h-4 stroke-[3]"></i>Lançar título</button>
      </div>`;
    document.getElementById('fin-modal').classList.add('is-open');
    finIcons();
  }
  let _finLancT;
  function finLancClienteSearch(q) {
    clearTimeout(_finLancT);
    _finLancT = setTimeout(async () => {
      let rows = [];
      try { rows = await finRpc('search_fin_clientes', { p_q: q || '' }) || []; } catch (_) { return; }
      finLancResults = rows;
      const box = document.getElementById('fin-lanc-results'); if (!box) return;
      box.innerHTML = rows.length ? rows.map(c=>`<button type="button" onclick="finLancPick('${c.id}')" class="w-full text-left px-3 py-2.5 hover:bg-neutral-900 border-b border-neutral-800/60 last:border-0 text-[12px] font-bold text-white">${escapeHTML(c.nome)}<span class="text-neutral-500 font-normal"> · ${escapeHTML(c.cidade||'')}</span></button>`).join('') : `<div class="px-3 py-3 text-[10px] text-neutral-600 font-bold uppercase tracking-widest">Nenhum cliente</div>`;
      box.classList.remove('hidden');
    }, 250);
  }
  function finLancPick(id) {
    finLancCliente = id;
    const c = finLancResults.find(x => x.id === id);
    const box = document.getElementById('fin-lanc-results'); if (box) box.classList.add('hidden');
    const inp = document.getElementById('fin-lanc-cli'); if (inp) inp.value = '';
    const sel = document.getElementById('fin-lanc-sel'); if (sel) sel.textContent = '✓ ' + (c ? c.nome : 'Cliente selecionado');
  }
  async function finLancamentoSubmit() {
    if (!finLancCliente) { finToast('Selecione um cliente', 'warn'); return; }
    const valor = parseFloat(document.getElementById('fin-lanc-valor').value);
    const venc = document.getElementById('fin-lanc-venc').value || null;
    if (!(valor > 0)) { finToast('Informe um valor válido', 'warn'); return; }
    try {
      await finRpc('create_fin_titulo', {
        p_cliente_id: finLancCliente,
        p_descricao: document.getElementById('fin-lanc-desc').value || '',
        p_documento: document.getElementById('fin-lanc-doc').value || '',
        p_valor: valor, p_vencimento: venc,
      });
    } catch (_) { return; }
    closeFinModal(); finToast('Título lançado', 'ok');
    if (state.finActiveTab === 'recebiveis' && (!state.finSub || state.finSub.recebiveis === 'titulos')) renderRec(); else finLoadDashboard();
  }

  // Dashboard: KPIs (saldo/recebido/a vencer/vencido) + aging reais.
  const FIN_MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  async function finLoadDashboard() {
    let k = null, ag = null;
    try { k = await finRpc('get_fin_kpis_overview'); } catch (_) {}
    try { ag = await finRpc('get_fin_aging'); } catch (_) {}
    const set = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
    const now = new Date();
    set('fin-period-chip', FIN_MESES[now.getMonth()] + ' · ' + now.getFullYear());
    if (k) {
      set('fin-hero-saldo', brMoney(k.saldo_a_receber));
      set('fin-hero-abertos', (k.titulos_abertos || 0) + ' títulos em aberto');
      set('fin-kpi-recebido', brMoney(k.recebido_mes));
      set('fin-kpi-avencer', brMoney(k.a_vencer));
      set('fin-kpi-avencer-sub', (k.a_vencer_count || 0) + ' títulos');
      set('fin-kpi-vencido', brMoney(k.vencido));
      set('fin-kpi-vencido-sub', (k.vencido_count || 0) + ' inadimplentes');
      set('fin-kpi-comissoes', brMoney(k.comissoes_a_pagar));
      set('fin-kpi-comissoes-sub', (k.comissoes_count || 0) + ' comissões');
      // "Precisam de ação" (cobranças) + projeção de caixa (a receber) — derivados dos KPIs
      set('fin-acao-cob', (k.vencido_count || 0) + ' clientes · ' + brMoney(k.vencido));
      set('fin-cx-areceber', brMoney(k.saldo_a_receber));
    }
    const agHost = document.getElementById('fin-aging');
    if (agHost && ag) {
      const rows = [
        { l:'A vencer (&gt;7d)',      v:ag.a_vencer_7mais, c:'var(--fin)' },
        { l:'Vence em 7 dias',        v:ag.vence_7d,       c:'var(--fin-soft)' },
        { l:'Vencido ≤ 30d',          v:ag.vencido_30d,    c:'#facc15' },
        { l:'Inadimplente (&gt;30d)', v:ag.inadimplente,   c:'#f87171' },
      ];
      const max = Math.max(1, ...rows.map(r=>Number(r.v)||0));
      agHost.innerHTML = rows.map(r=>`
        <div>
          <div class="flex justify-between text-[11px] font-bold mb-1.5"><span class="text-neutral-300">${r.l}</span><span class="text-white num">${brMoney(r.v)}</span></div>
          <div class="h-2.5 bg-neutral-900"><div class="h-full bar-anim" style="width:${Math.round((Number(r.v)||0)/max*100)}%;background:${r.c}"></div></div>
        </div>`).join('');
      const totAg = rows.reduce((s,r)=>s+(Number(r.v)||0),0);
      const tEl = document.getElementById('fin-aging-total'); if (tEl) tEl.textContent = 'Total ' + brMoney(totAg);
    }
  }
  const comStMap = {
    liberar:  { l:'A liberar', c:'fin-acc-chip border border-[color:var(--fin-border-30)]' },
    liberado: { l:'Liberado',  c:'bg-yellow-500/10 text-yellow-400 border border-yellow-500/25' },
    pago:     { l:'Pago',      c:'bg-emerald-500/10 text-emerald-400 border border-emerald-500/25' },
  };
  const comIni = (p) => (p||'?').split(' ').map(x=>x[0]).slice(0,2).join('').toUpperCase();
  function comActs(c) {
    if (c.st === 'pago') return `<span class="text-[10px] font-bold uppercase tracking-widest text-emerald-400 inline-flex items-center gap-1"><i data-lucide="check-check" class="w-3.5 h-3.5"></i>Pago</span>`;
    const lib = c.st === 'liberar' ? `<button onclick="finComLiberar('${c.id}')" title="Liberar" class="w-8 h-8 grid place-items-center fin-acc-chip border border-[color:var(--fin-border-30)] hover:bg-neutral-800 transition-colors"><i data-lucide="unlock" class="w-4 h-4"></i></button>` : '';
    return `<div class="inline-flex gap-1.5 justify-center">
        ${lib}
        <button onclick="finComPagar('${c.id}')" title="Marcar pago" class="w-8 h-8 grid place-items-center bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 hover:bg-emerald-500/20 transition-colors"><i data-lucide="check" class="w-4 h-4 stroke-[2.5]"></i></button>
        <button onclick="finComAjustar('${c.id}',${c.pct})" title="Ajustar %" class="w-8 h-8 grid place-items-center bg-neutral-900 text-neutral-400 border border-neutral-800 hover:text-white transition-colors"><i data-lucide="percent" class="w-4 h-4"></i></button>
      </div>`;
  }
  let finComRows = [];
  const finComById = id => finComRows.find(c => c.id === id);
  async function renderCom() {
    let rows = [];
    try { rows = await finRpc('list_fin_comissoes', { p_filter: 'todos' }) || []; } catch (_) {}
    finComRows = rows;
    const tbl = document.getElementById('com-table');
    if (tbl) tbl.innerHTML = rows.length ? rows.map(c=>`
      <tr class="border-b border-neutral-800/60 hover:bg-neutral-900/40 transition-colors">
        <td class="px-5 py-3.5"><div class="flex items-center gap-3"><div class="w-8 h-8 rounded-full fin-acc-chip grid place-items-center font-black text-[10px]">${comIni(c.vendedor)}</div><span class="font-black text-white">${c.vendedor}</span></div></td>
        <td class="px-3 py-3.5 text-neutral-400">${escapeHTML(c.cliente)}</td>
        <td class="px-3 py-3.5 text-right text-neutral-400 num">${brMoney(c.base)}</td>
        <td class="px-3 py-3.5 text-center text-neutral-400 num">${c.pct}%</td>
        <td class="px-3 py-3.5 text-right text-white font-bold num">${brMoney(c.valor)}</td>
        <td class="px-3 py-3.5 text-center"><span class="inline-flex items-center gap-1.5 px-2.5 py-1 text-[9px] font-black uppercase tracking-widest ${comStMap[c.st].c}">${comStMap[c.st].l}</span></td>
        <td class="px-5 py-3.5 text-center">${comActs(c)}</td>
      </tr>`).join('') : `<tr><td colspan="7" class="px-5 py-10 text-center text-[10px] text-neutral-600 font-bold uppercase tracking-widest">Nenhuma comissão ainda</td></tr>`;
    const cards = document.getElementById('com-cards');
    if (cards) cards.innerHTML = rows.length ? rows.map(c=>`
      <div class="metric-card p-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2.5 min-w-0"><div class="w-8 h-8 rounded-full fin-acc-chip grid place-items-center font-black text-[10px] shrink-0">${comIni(c.vendedor)}</div><span class="font-black text-white truncate">${c.vendedor}</span></div>
          <span class="inline-flex px-2.5 py-1 text-[9px] font-black uppercase tracking-widest ${comStMap[c.st].c}">${comStMap[c.st].l}</span>
        </div>
        <div class="flex items-center justify-between mt-3 pt-3 border-t border-neutral-800 text-[11px]">
          <span class="text-neutral-500 font-bold truncate">${escapeHTML(c.cliente)} · ${c.pct}%</span><span class="text-white font-black num">${brMoney(c.valor)}</span>
        </div>
        ${c.st!=='pago'?`<div class="flex gap-2 mt-3">
          ${c.st==='liberar'?`<button onclick="finComLiberar('${c.id}')" class="flex-1 py-2.5 fin-acc-chip border border-[color:var(--fin-border-30)] text-[10px] font-black uppercase tracking-widest">Liberar</button>`:''}
          <button onclick="finComPagar('${c.id}')" class="flex-1 py-2.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 text-[10px] font-black uppercase tracking-widest">Pagar</button>
          <button onclick="finComAjustar('${c.id}',${c.pct})" class="py-2.5 px-3 bg-neutral-900 text-neutral-300 border border-neutral-800 text-[10px] font-black uppercase tracking-widest"><i data-lucide="percent" class="w-3.5 h-3.5"></i></button>
        </div>`:''}
      </div>`).join('') : `<div class="text-center text-[10px] text-neutral-600 font-bold uppercase tracking-widest py-8">Nenhuma comissão ainda</div>`;
    finIcons();
  }
  async function finComLiberar(id) { try { await finRpc('set_fin_comissao_status', { p_id:id, p_status:'liberado' }); } catch(_){return;} finToast('Comissão liberada','ok'); renderCom(); }
  async function finComPagar(id)   { try { await finRpc('set_fin_comissao_status', { p_id:id, p_status:'pago' }); } catch(_){return;} finToast('Comissão paga','ok'); renderCom(); }
  function finComAjustar(id) {
    const c = finComById(id); if (!c) return;
    finEnsureChrome();
    document.getElementById('fin-modal-card').innerHTML = `
      <div class="sticky top-0 bg-[#0a0a0a] border-b border-neutral-800 px-5 py-4 flex items-start justify-between gap-3">
        <div class="min-w-0"><div class="text-[10px] font-black uppercase tracking-[0.2em] fin-acc-strong">Ajustar comissão</div>
          <h3 class="text-lg font-black text-white mt-1 truncate">${c.vendedor}</h3>
          <div class="text-[11px] text-neutral-500 font-bold">Base ${brMoney(c.base)} · ${escapeHTML(c.cliente)}</div></div>
        <button onclick="closeFinModal()" class="shrink-0 w-9 h-9 grid place-items-center bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white transition-colors"><i data-lucide="x" class="w-4 h-4"></i></button>
      </div>
      <div class="p-5 space-y-4">
        <div class="grid grid-cols-2 gap-3">
          <div><label class="text-[10px] font-black uppercase tracking-widest text-neutral-500">Percentual (%)</label>
            <input id="fin-com-pct" type="number" step="0.01" value="${Number(c.pct)||0}" oninput="finComCalc('pct')" class="fin-acc-focus w-full mt-1.5 px-3 py-2.5 bg-neutral-950 border border-neutral-800 text-white num font-black"></div>
          <div><label class="text-[10px] font-black uppercase tracking-widest text-neutral-500">Valor (R$)</label>
            <input id="fin-com-val" type="number" step="0.01" value="${Number(c.valor)||0}" oninput="finComCalc('val')" class="fin-acc-focus w-full mt-1.5 px-3 py-2.5 bg-neutral-950 border border-neutral-800 text-white num font-black"></div>
        </div>
        <div class="text-[10px] text-neutral-500 font-bold leading-relaxed">Edite o <span class="text-white">%</span> ou o <span class="text-white">valor fixo</span> — o outro campo se ajusta sozinho a partir da base.</div>
        <input type="hidden" id="fin-com-base" value="${Number(c.base)||0}">
        <button onclick="finComAjustarSubmit('${id}')" class="w-full py-3 fin-acc-solid text-[11px] font-black uppercase tracking-widest inline-flex items-center justify-center gap-2"><i data-lucide="save" class="w-4 h-4 stroke-[3]"></i>Salvar comissão</button>
      </div>`;
    document.getElementById('fin-modal').classList.add('is-open');
    finIcons();
  }
  // Mantém % e valor sincronizados a partir da base no modal de comissão.
  let _finComMode = 'pct';
  function finComCalc(src) {
    _finComMode = src;
    const base = parseFloat(document.getElementById('fin-com-base').value) || 0;
    const pctEl = document.getElementById('fin-com-pct'), valEl = document.getElementById('fin-com-val');
    if (src === 'pct') { const p = parseFloat(pctEl.value)||0; valEl.value = (base * p / 100).toFixed(2); }
    else { const val = parseFloat(valEl.value)||0; pctEl.value = base > 0 ? (val / base * 100).toFixed(4) : 0; }
  }
  async function finComAjustarSubmit(id) {
    if (_finComMode === 'val') {
      const val = parseFloat(document.getElementById('fin-com-val').value);
      if (!(val >= 0)) { finToast('Valor inválido','warn'); return; }
      try { await finRpc('set_fin_comissao_valor', { p_id:id, p_valor:val }); } catch(_){return;}
    } else {
      const n = parseFloat(document.getElementById('fin-com-pct').value);
      if (!(n >= 0)) { finToast('Percentual inválido','warn'); return; }
      try { await finRpc('ajustar_fin_comissao_pct', { p_id:id, p_pct:n }); } catch(_){return;}
    }
    closeFinModal(); finToast('Comissão ajustada','ok'); renderCom();
  }
  // Preenche um <select> com os projetos do funil (picker compartilhado).
  async function finFillProjetoSelect(selId) {
    const el = document.getElementById(selId); if (!el) return;
    let rows = [];
    try { rows = await finRpc('list_fin_projetos_basicos') || []; } catch (_) {}
    el.innerHTML = rows.length
      ? rows.map(p=>`<option value="${p.id}">${escapeHTML(p.cli)} · ${brMoney(p.valor)}</option>`).join('')
      : '<option value="">Nenhum projeto — feche uma venda primeiro</option>';
  }

  // Orçamentos: foco em margem (custo do kit × valor do projeto). Mesma base da Ordem de Compra.
  async function renderOrc() {
    const host = document.getElementById('orc-grid'); if (!host) return;
    if (!finPrecCfg) { try { finPrecCfg = await finRpc('get_fin_precificacao'); } catch (_) {} }
    const min = Number(finPrecCfg && finPrecCfg.margem_min) || 15;
    let rows = [];
    try { rows = await finRpc('list_fin_ordens_compra', { p_filter: 'todos' }) || []; } catch (_) {}
    const novo = `<button onclick="finNovaOC()" class="metric-card p-5 border-dashed flex flex-col items-center justify-center gap-2 text-neutral-500 hover:text-white hover:border-[color:var(--fin-border-30)] transition-colors min-h-[160px]"><i data-lucide="plus" class="w-6 h-6"></i><span class="text-[10px] font-black uppercase tracking-widest">Novo orçamento</span></button>`;
    host.innerHTML = novo + rows.map(o=>{
      const mg = o.margem, baixa = (mg!=null && mg<min);
      return `<div class="metric-card p-5">
        <div class="flex items-start justify-between gap-2 mb-4">
          <div class="min-w-0"><div class="font-black text-white truncate">${escapeHTML(o.cli)}</div><div class="text-[10px] text-neutral-500 font-bold uppercase tracking-widest">${escapeHTML(o.fornecedor)}</div></div>
          <span class="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 text-[9px] font-black uppercase tracking-widest border ${mg==null?'bg-neutral-800 text-neutral-400 border-neutral-700':baixa?'bg-red-500/10 text-red-400 border-red-500/25':'fin-acc-chip border-[color:var(--fin-border-30)]'}">${mg==null?'Sem projeto':baixa?'Margem baixa':'Saudável'}</span>
        </div>
        <div class="grid grid-cols-2 gap-3 mb-4">
          <div><div class="text-[9px] font-black uppercase tracking-widest text-neutral-600">Preço projeto</div><div class="text-white font-black num">${brMoney(o.valor_projeto)}</div></div>
          <div><div class="text-[9px] font-black uppercase tracking-widest text-neutral-600">Custo kit</div><div class="text-neutral-400 font-black num">${brMoney(o.valor)}</div></div>
        </div>
        <div class="mb-4"><div class="flex justify-between text-[10px] font-bold mb-1.5"><span class="text-neutral-400">Margem</span><span class="${baixa?'text-red-400':'fin-acc'} num">${mg==null?'—':mg+'%'}</span></div>
          <div class="h-2 bg-neutral-900"><div class="h-full" style="width:${mg==null?0:Math.max(0,Math.min(mg*3.5,100))}%;background:${baixa?'#f87171':'var(--fin)'}"></div></div></div>
        ${(o.status==='orcamento'||o.status==='aprovar')?`<button onclick="finOcStatus('${o.id}','aprovado')" class="w-full py-2.5 fin-acc-chip border border-[color:var(--fin-border-30)] text-[10px] font-black uppercase tracking-widest">Aprovar orçamento</button>`:`<div class="text-center text-[9px] font-bold uppercase tracking-widest text-neutral-600">${(ocSt[o.status]||{l:o.status}).l}</div>`}
      </div>`;}).join('');
    finIcons();
  }

  function finNovaOC() {
    finEnsureChrome();
    document.getElementById('fin-modal-card').innerHTML = `
      <div class="sticky top-0 bg-[#0a0a0a] border-b border-neutral-800 px-5 py-4 flex items-start justify-between gap-3">
        <div><div class="text-[10px] font-black uppercase tracking-[0.2em] fin-acc-strong">Nova ordem de compra</div>
          <h3 class="text-lg font-black text-white mt-1">Orçamento do kit</h3></div>
        <button onclick="closeFinModal()" class="shrink-0 w-9 h-9 grid place-items-center bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white transition-colors"><i data-lucide="x" class="w-4 h-4"></i></button>
      </div>
      <div class="p-5 space-y-4">
        <div><label class="text-[10px] font-black uppercase tracking-widest text-neutral-500">Projeto</label>
          <select id="fin-oc-proj" class="fin-acc-focus w-full mt-1.5 px-3 py-2.5 bg-neutral-950 border border-neutral-800 text-white text-sm font-bold"></select></div>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="text-[10px] font-black uppercase tracking-widest text-neutral-500">Fornecedor</label>
            <input id="fin-oc-forn" type="text" class="fin-acc-focus w-full mt-1.5 px-3 py-2.5 bg-neutral-950 border border-neutral-800 text-white text-sm font-bold"></div>
          <div><label class="text-[10px] font-black uppercase tracking-widest text-neutral-500">Custo do kit</label>
            <input id="fin-oc-valor" type="number" step="0.01" class="fin-acc-focus w-full mt-1.5 px-3 py-2.5 bg-neutral-950 border border-neutral-800 text-white num font-black"></div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="text-[10px] font-black uppercase tracking-widest text-neutral-500">Módulos</label>
            <input id="fin-oc-mod" type="text" placeholder="Ex.: 30× 550W" class="fin-acc-focus w-full mt-1.5 px-3 py-2.5 bg-neutral-950 border border-neutral-800 text-white text-sm font-bold"></div>
          <div><label class="text-[10px] font-black uppercase tracking-widest text-neutral-500">Inversor</label>
            <input id="fin-oc-inv" type="text" class="fin-acc-focus w-full mt-1.5 px-3 py-2.5 bg-neutral-950 border border-neutral-800 text-white text-sm font-bold"></div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="text-[10px] font-black uppercase tracking-widest text-neutral-500">Potência</label>
            <input id="fin-oc-pot" type="text" placeholder="Ex.: 16,5 kWp" class="fin-acc-focus w-full mt-1.5 px-3 py-2.5 bg-neutral-950 border border-neutral-800 text-white text-sm font-bold"></div>
          <div><label class="text-[10px] font-black uppercase tracking-widest text-neutral-500">Validade orç.</label>
            <input id="fin-oc-valid" type="date" class="fin-acc-focus w-full mt-1.5 px-3 py-2.5 bg-neutral-950 border border-neutral-800 text-white text-sm font-bold"></div>
        </div>
        <button onclick="finNovaOCSubmit()" class="w-full py-3 fin-acc-solid text-[11px] font-black uppercase tracking-widest inline-flex items-center justify-center gap-2"><i data-lucide="plus" class="w-4 h-4 stroke-[3]"></i>Criar ordem</button>
      </div>`;
    document.getElementById('fin-modal').classList.add('is-open');
    finFillProjetoSelect('fin-oc-proj');
    finIcons();
  }
  async function finNovaOCSubmit() {
    const proj = document.getElementById('fin-oc-proj').value;
    const valor = parseFloat(document.getElementById('fin-oc-valor').value);
    if (!proj) { finToast('Selecione um projeto', 'warn'); return; }
    if (!(valor > 0)) { finToast('Informe o custo do kit', 'warn'); return; }
    try {
      await finRpc('create_fin_oc', {
        p_fin_projeto_id: proj, p_fornecedor: document.getElementById('fin-oc-forn').value||'',
        p_valor: valor, p_modulos: document.getElementById('fin-oc-mod').value||'',
        p_inversor: document.getElementById('fin-oc-inv').value||'', p_potencia: document.getElementById('fin-oc-pot').value||'',
        p_validade: document.getElementById('fin-oc-valid').value||null,
      });
    } catch (_) { return; }
    closeFinModal(); finToast('Ordem de compra criada', 'ok');
    if ((state.finSub && state.finSub.compras) === 'ordemcompra') renderOC(); else renderOrc();
  }
  /* Precificação = CALCULADORA da planilha do contábil (mesma conta do DRE).
     Os % vêm de fin_config via get_fin_precificacao; cálculo 100% client-side. */
  let finPrecData = null, finPrecCfg = null;
  async function renderPrec() {
    let d;
    try { d = await finRpc('get_fin_precificacao'); } catch (_) { return; }
    finPrecData = d; finPrecCfg = d;
    const alvo = document.getElementById('fin-pc-alvo'); if (alvo && !alvo.value) alvo.value = d.margem_alvo || '';
    finPrecRenderRows();
    finPrecCalc();
    finIcons();
  }
  function finPrecNum(id) { return parseFloat((document.getElementById(id)||{}).value) || 0; }
  function finPrecRenderRows() {
    const host = document.getElementById('prec-rows'); if (!host) return;
    const p = finPrecCfg || {};
    const money = (label, key) => `
      <div class="py-2.5 flex items-center gap-3">
        <span class="font-bold text-neutral-300 text-sm flex-1">${label}</span>
        <div class="relative w-40"><span class="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-neutral-500 font-bold">R$</span>
          <input id="fin-pc-${key}" type="number" step="0.01" oninput="finPrecCalc()" class="fin-acc-focus w-full pl-7 pr-2 py-1.5 bg-neutral-950 border border-neutral-800 text-white num font-black text-right text-sm"></div>
      </div>`;
    const auto = (label, id, hint) => `
      <div class="py-2.5 flex items-center gap-3">
        <span class="font-bold text-neutral-400 text-sm flex-1">${label} <span class="text-neutral-600 font-normal text-[10px]">${hint}</span></span>
        <span id="${id}" class="text-red-400 font-black num text-sm w-40 text-right pr-1">− R$ —</span>
      </div>`;
    let html = money('Valor da venda', 'venda');
    html += money('Kit fotovoltaico', 'kit');
    html += auto('Imposto', 'prec-a-imposto', `(venda − kit) × ${p.imposto_pct}%`);
    FIN_PREC_DIRETOS.filter(x=>x.k!=='kit').forEach(x=> { html += money(x.l, x.k); });
    html += auto('Comissão', 'prec-a-comissao', `venda × ${p.comissao_pct}%`);
    html += auto('Royalties e fundo', 'prec-a-royalties', `venda × ${p.royalties_pct}%`);
    host.innerHTML = html;
  }
  function finPrecCalc() {
    const p = finPrecCfg || { imposto_pct:18, comissao_pct:10, royalties_pct:4.5, deducoes_pct:0, margem_min:15 };
    const venda = finPrecNum('fin-pc-venda');
    const kit = finPrecNum('fin-pc-kit');
    let diretos = 0; FIN_PREC_DIRETOS.forEach(x=>{ if (x.k!=='kit') diretos += finPrecNum('fin-pc-'+x.k); });
    const imposto   = round2((venda-kit)*(Number(p.imposto_pct)||0)/100);
    const comissao  = round2(venda*(Number(p.comissao_pct)||0)/100);
    const royalties = round2(venda*(Number(p.royalties_pct)||0)/100);
    const deducoes  = round2(venda*(Number(p.deducoes_pct)||0)/100);
    const total = kit + diretos + imposto + comissao + royalties + deducoes;
    const lucro = venda - total;
    const margem = venda > 0 ? lucro/venda*100 : 0;
    const set = (id,v)=>{ const e=document.getElementById(id); if (e) e.textContent = v; };
    set('prec-a-imposto',   '− ' + brMoney(imposto));
    set('prec-a-comissao',  '− ' + brMoney(comissao));
    set('prec-a-royalties', '− ' + brMoney(royalties));
    set('prec-r-total', 'Total de custos: ' + brMoney(total));
    set('prec-r-lucro', brMoney(lucro));
    const min = Number(p.margem_min)||0, baixa = venda>0 && margem < min;
    const mEl = document.getElementById('prec-r-margem');
    if (mEl) { mEl.textContent = 'Margem ' + margem.toFixed(1) + '%' + (baixa?` · abaixo do mín ${min}%`:''); mEl.classList.toggle('text-red-400', baixa); }
    const lEl = document.getElementById('prec-r-lucro'); if (lEl) lEl.classList.toggle('text-red-400', lucro < 0);
  }
  function finPrecSugerir() {
    const p = finPrecCfg || { imposto_pct:18, comissao_pct:10, royalties_pct:4.5, deducoes_pct:0 };
    const kit = finPrecNum('fin-pc-kit');
    let diretos = 0; FIN_PREC_DIRETOS.forEach(x=>{ if (x.k!=='kit') diretos += finPrecNum('fin-pc-'+x.k); });
    const i=(Number(p.imposto_pct)||0)/100, c=(Number(p.comissao_pct)||0)/100, r=(Number(p.royalties_pct)||0)/100, ded=(Number(p.deducoes_pct)||0)/100;
    const m = finPrecNum('fin-pc-alvo')/100;
    const box = document.getElementById('prec-sug');
    const denom = 1 - i - c - r - ded - m;
    if (denom <= 0) { if (box) { box.classList.remove('hidden'); box.classList.add('text-red-400'); box.textContent = 'Margem-alvo inviável com esses percentuais.'; } return; }
    const venda = (kit*(1-i) + diretos) / denom;
    const vEl = document.getElementById('fin-pc-venda'); if (vEl) vEl.value = venda.toFixed(2);
    finPrecCalc();
    if (box) { box.classList.remove('hidden','text-red-400'); box.innerHTML = `Preço sugerido: <span class="fin-acc num">${brMoney(venda)}</span> aplicado acima.`; }
    finToast('Preço de venda calculado', 'ok');
  }
  function finNovoPrecItem() {
    finEnsureChrome();
    document.getElementById('fin-modal-card').innerHTML = `
      <div class="sticky top-0 bg-[#0a0a0a] border-b border-neutral-800 px-5 py-4 flex items-start justify-between gap-3">
        <div><div class="text-[10px] font-black uppercase tracking-[0.2em] fin-acc-strong">Composição</div><h3 class="text-lg font-black text-white mt-1">Novo item</h3></div>
        <button onclick="closeFinModal()" class="shrink-0 w-9 h-9 grid place-items-center bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white transition-colors"><i data-lucide="x" class="w-4 h-4"></i></button>
      </div>
      <div class="p-5 space-y-4">
        <div><label class="text-[10px] font-black uppercase tracking-widest text-neutral-500">Rótulo</label>
          <input id="fin-pi-rot" type="text" placeholder="Ex.: Frete, Projeto, Comissão..." class="fin-acc-focus w-full mt-1.5 px-3 py-2.5 bg-neutral-950 border border-neutral-800 text-white text-sm font-bold"></div>
        <div class="grid grid-cols-3 gap-3">
          <div><label class="text-[10px] font-black uppercase tracking-widest text-neutral-500">Categoria</label>
            <input id="fin-pi-cat" type="text" placeholder="livre" class="fin-acc-focus w-full mt-1.5 px-3 py-2.5 bg-neutral-950 border border-neutral-800 text-white text-sm font-bold"></div>
          <div><label class="text-[10px] font-black uppercase tracking-widest text-neutral-500">Valor</label>
            <input id="fin-pi-val" type="number" step="0.01" class="fin-acc-focus w-full mt-1.5 px-3 py-2.5 bg-neutral-950 border border-neutral-800 text-white num font-black"></div>
          <div><label class="text-[10px] font-black uppercase tracking-widest text-neutral-500">Tipo</label>
            <select id="fin-pi-tipo" class="fin-acc-focus w-full mt-1.5 px-3 py-2.5 bg-neutral-950 border border-neutral-800 text-white text-sm font-bold"><option value="percent">%</option><option value="valor">R$</option></select></div>
        </div>
        <button onclick="finNovoPrecItemSubmit()" class="w-full py-3 fin-acc-solid text-[11px] font-black uppercase tracking-widest inline-flex items-center justify-center gap-2"><i data-lucide="plus" class="w-4 h-4 stroke-[3]"></i>Adicionar item</button>
      </div>`;
    document.getElementById('fin-modal').classList.add('is-open');
    finIcons();
  }
  async function finNovoPrecItemSubmit() {
    const rot = document.getElementById('fin-pi-rot').value;
    if (!rot) { finToast('Informe o rótulo', 'warn'); return; }
    try { await finRpc('create_fin_precificacao_item', { p_categoria: document.getElementById('fin-pi-cat').value||'', p_rotulo: rot, p_valor: parseFloat(document.getElementById('fin-pi-val').value)||0, p_tipo: document.getElementById('fin-pi-tipo').value }); }
    catch (_) { return; }
    closeFinModal(); finToast('Item adicionado', 'ok'); renderPrec();
  }
  function finEditPrecItem(id, valor) {
    const it = ((finPrecData && finPrecData.itens) || []).find(x => x.id === id) || { rotulo:'', valor };
    finEnsureChrome();
    document.getElementById('fin-modal-card').innerHTML = `
      <div class="sticky top-0 bg-[#0a0a0a] border-b border-neutral-800 px-5 py-4 flex items-start justify-between gap-3">
        <div><div class="text-[10px] font-black uppercase tracking-[0.2em] fin-acc-strong">Composição</div>
          <h3 class="text-lg font-black text-white mt-1">Editar item</h3></div>
        <button onclick="closeFinModal()" class="shrink-0 w-9 h-9 grid place-items-center bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white transition-colors"><i data-lucide="x" class="w-4 h-4"></i></button>
      </div>
      <div class="p-5 space-y-4">
        <div><label class="text-[10px] font-black uppercase tracking-widest text-neutral-500">Rótulo</label>
          <input id="fin-pe-rot" type="text" value="${(it.rotulo||'').replace(/"/g,'&quot;')}" class="fin-acc-focus w-full mt-1.5 px-3 py-2.5 bg-neutral-950 border border-neutral-800 text-white text-sm font-bold"></div>
        <div><label class="text-[10px] font-black uppercase tracking-widest text-neutral-500">Valor</label>
          <input id="fin-pe-val" type="number" step="0.01" value="${Number(valor)||0}" class="fin-acc-focus w-full mt-1.5 px-3 py-2.5 bg-neutral-950 border border-neutral-800 text-white num font-black"></div>
        <button onclick="finEditPrecItemSubmit('${id}')" class="w-full py-3 fin-acc-solid text-[11px] font-black uppercase tracking-widest inline-flex items-center justify-center gap-2"><i data-lucide="save" class="w-4 h-4 stroke-[3]"></i>Salvar item</button>
      </div>`;
    document.getElementById('fin-modal').classList.add('is-open');
    finIcons();
  }
  async function finEditPrecItemSubmit(id) {
    const n = parseFloat(document.getElementById('fin-pe-val').value);
    if (isNaN(n)) { finToast('Valor inválido', 'warn'); return; }
    try { await finRpc('update_fin_precificacao_item', { p_id:id, p_rotulo: document.getElementById('fin-pe-rot').value||'', p_valor:n }); } catch (_) { return; }
    closeFinModal(); finToast('Item atualizado', 'ok'); renderPrec();
  }
  async function finDelPrecItem(id) {
    if (!window.confirm('Remover este item da composição?')) return;
    try { await finRpc('delete_fin_precificacao_item', { p_id:id }); } catch (_) { return; }
    finToast('Item removido', 'info'); renderPrec();
  }
  const parcStMap = { em_dia:{l:'Em dia',c:'bg-emerald-500/10 text-emerald-400 border-emerald-500/25'}, atraso:{l:'Em atraso',c:'bg-red-500/10 text-red-400 border-red-500/25'}, quitado:{l:'Quitado',c:'fin-acc-chip border border-[color:var(--fin-border-30)]'} };
  async function renderParc() {
    const host = document.getElementById('parc-grid'); if (!host) return;
    let rows = [];
    try { rows = await finRpc('list_fin_parcelamentos') || []; } catch (_) {}
    const novo = `<button onclick="finNovoParcelamento()" class="metric-card p-5 border-dashed flex flex-col items-center justify-center gap-2 text-neutral-500 hover:text-white hover:border-[color:var(--fin-border-30)] transition-colors min-h-[150px]"><i data-lucide="plus" class="w-6 h-6"></i><span class="text-[10px] font-black uppercase tracking-widest">Novo plano</span></button>`;
    host.innerHTML = novo + rows.map(p=>{
      const pct = p.n ? Math.round(p.pagas/p.n*100) : 0;
      const s = parcStMap[p.status] || parcStMap.em_dia;
      return `<div onclick="finOpenParcDetail('${p.id}')" class="metric-card p-5 cursor-pointer">
        <div class="flex items-start justify-between gap-2 mb-4">
          <div class="min-w-0"><div class="font-black text-white truncate">${escapeHTML(p.cli)}</div><div class="text-[10px] text-neutral-500 font-bold uppercase tracking-widest">${p.n}× · ${brMoney(p.total)}</div></div>
          <span class="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 text-[9px] font-black uppercase tracking-widest border ${s.c}">${s.l}</span>
        </div>
        <div class="flex justify-between text-[10px] font-bold mb-1.5"><span class="text-neutral-400">${p.pagas} de ${p.n} parcelas</span><span class="text-white num">${pct}%</span></div>
        <div class="h-2.5 bg-neutral-900 mb-4"><div class="h-full" style="width:${pct}%;background:${p.status==='atraso'?'#f87171':'var(--fin)'}"></div></div>
        <div class="flex items-center justify-between pt-3 border-t border-neutral-800">
          <span class="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Próxima parcela</span>
          <span class="text-white font-black num">${p.prox||'—'}</span>
        </div>
      </div>`;}).join('');
    finIcons();
  }
  function finNovoParcelamento() {
    finEnsureChrome();
    document.getElementById('fin-modal-card').innerHTML = `
      <div class="sticky top-0 bg-[#0a0a0a] border-b border-neutral-800 px-5 py-4 flex items-start justify-between gap-3">
        <div><div class="text-[10px] font-black uppercase tracking-[0.2em] fin-acc-strong">Novo parcelamento</div>
          <h3 class="text-lg font-black text-white mt-1">Plano de parcelas</h3></div>
        <button onclick="closeFinModal()" class="shrink-0 w-9 h-9 grid place-items-center bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white transition-colors"><i data-lucide="x" class="w-4 h-4"></i></button>
      </div>
      <div class="p-5 space-y-4">
        <div><label class="text-[10px] font-black uppercase tracking-widest text-neutral-500">Projeto</label>
          <select id="fin-pl-proj" class="fin-acc-focus w-full mt-1.5 px-3 py-2.5 bg-neutral-950 border border-neutral-800 text-white text-sm font-bold"></select></div>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="text-[10px] font-black uppercase tracking-widest text-neutral-500">Total a parcelar</label>
            <input id="fin-pl-total" type="number" step="0.01" class="fin-acc-focus w-full mt-1.5 px-3 py-2.5 bg-neutral-950 border border-neutral-800 text-white num font-black"></div>
          <div><label class="text-[10px] font-black uppercase tracking-widest text-neutral-500">Nº parcelas</label>
            <input id="fin-pl-n" type="number" min="1" value="12" class="fin-acc-focus w-full mt-1.5 px-3 py-2.5 bg-neutral-950 border border-neutral-800 text-white num font-black"></div>
        </div>
        <div><label class="text-[10px] font-black uppercase tracking-widest text-neutral-500">1º vencimento</label>
          <input id="fin-pl-venc" type="date" class="fin-acc-focus w-full mt-1.5 px-3 py-2.5 bg-neutral-950 border border-neutral-800 text-white text-sm font-bold"></div>
        <button onclick="finNovoParcelamentoSubmit()" class="w-full py-3 fin-acc-solid text-[11px] font-black uppercase tracking-widest inline-flex items-center justify-center gap-2"><i data-lucide="plus" class="w-4 h-4 stroke-[3]"></i>Gerar parcelas</button>
      </div>`;
    document.getElementById('fin-modal').classList.add('is-open');
    finFillProjetoSelect('fin-pl-proj');
    finIcons();
  }
  async function finNovoParcelamentoSubmit() {
    const proj = document.getElementById('fin-pl-proj').value;
    const total = parseFloat(document.getElementById('fin-pl-total').value);
    const n = parseInt(document.getElementById('fin-pl-n').value, 10);
    if (!proj) { finToast('Selecione um projeto', 'warn'); return; }
    if (!(total > 0) || !(n >= 1)) { finToast('Total/parcelas inválidos', 'warn'); return; }
    try { await finRpc('create_fin_parcelamento', { p_fin_projeto_id: proj, p_total: total, p_n: n, p_primeira_venc: document.getElementById('fin-pl-venc').value||null }); }
    catch (_) { return; }
    closeFinModal(); finToast('Parcelamento criado', 'ok'); renderParc();
  }
  async function finOpenParcDetail(id) {
    finEnsureChrome();
    let d;
    try { d = await finRpc('get_fin_parcelamento', { p_id: id }); } catch (_) { return; }
    const pSt = { aberta:'text-neutral-400', paga:'text-emerald-400', atrasada:'text-red-400' };
    document.getElementById('fin-modal-card').innerHTML = `
      <div class="sticky top-0 bg-[#0a0a0a] border-b border-neutral-800 px-5 py-4 flex items-start justify-between gap-3">
        <div><div class="text-[10px] font-black uppercase tracking-[0.2em] fin-acc-strong">Cronograma · ${d.n}× · ${brMoney(d.total)}</div>
          <h3 class="text-lg font-black text-white mt-1">Parcelas</h3></div>
        <button onclick="closeFinModal()" class="shrink-0 w-9 h-9 grid place-items-center bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white transition-colors"><i data-lucide="x" class="w-4 h-4"></i></button>
      </div>
      <div class="p-5 divide-y divide-neutral-800/60">
        ${(d.parcelas||[]).map(pa=>`
          <div class="flex items-center justify-between gap-3 py-3">
            <div><div class="text-sm font-black text-white">Parcela ${pa.numero}</div><div class="text-[10px] text-neutral-500 font-bold">vence ${pa.venc||'—'}</div></div>
            <div class="flex items-center gap-3">
              <span class="num font-bold ${pSt[pa.status]||'text-neutral-400'}">${brMoney(pa.valor)}</span>
              ${pa.status==='paga'?`<span class="text-[9px] font-black uppercase tracking-widest text-emerald-400">Paga</span>`:`<button onclick="finPagarParcela('${pa.id}','${id}')" class="px-3 py-1.5 fin-acc-chip border border-[color:var(--fin-border-30)] text-[9px] font-black uppercase tracking-widest">Dar baixa</button>`}
            </div>
          </div>`).join('')}
      </div>`;
    document.getElementById('fin-modal').classList.add('is-open');
    finIcons();
  }
  async function finPagarParcela(parcelaId, planoId) {
    try { await finRpc('pagar_fin_parcela', { p_parcela_id: parcelaId }); } catch (_) { return; }
    finToast('Parcela baixada', 'ok');
    finOpenParcDetail(planoId); renderParc();
  }
  /* DRE calculadora-simulador.
     - O DRE é por OBRA/VENDA (como a planilha do contábil). finDreProjeto = obra selecionada (null = consolidado de todas).
     - finDreBase: números REAIS vindos da RPC (nunca alterados).
     - finDreSim: null = modo real; objeto = modo simulação (cascata editável em JS), TUDO client-side. */
  const round2 = v => Math.round((Number(v)||0)*100)/100;
  let finDreBase = null;
  let finDreProjeto = null, finDreObraNome = '';
  let finDreSim = null;
  let _finDreObras = [];
  const finDreScenKey = () => `fin_dre_cenario_${finDreProjeto||'all'}_${finDrePeriod}`;

  async function renderDre() {
    if (!document.getElementById('dre-rows')) return;
    const args = { p_period: finDrePeriod };
    if (finDreProjeto) args.p_projeto_id = finDreProjeto;
    try { finDreBase = await finRpc('get_fin_dre', args); } catch (_) { return; }
    finDreLoadObras();
    finDreWireControls();
    finDreSyncControls();
    finDreRender();
  }

  // Inicializa a simulação a partir dos números reais: cada linha vira um valor editável.
  function finDreInitSim(saved) {
    const b = finDreBase, num = x => Number(x)||0;
    const vals = { receita: num(b.receita_bruta), deducoes: num(b.deducoes) };
    (b.custos||[]).forEach(c => { vals[c.chave] = num(c.valor); });
    finDreSim = { vals, extras: [] };
    if (saved && saved.vals) { finDreSim.vals = Object.assign(vals, saved.vals); finDreSim.extras = Array.isArray(saved.extras) ? saved.extras : []; }
  }

  // Objeto EFETIVO exibido: base puro (real) ou recomputado a partir dos valores editados na cascata.
  function finDreEffective() {
    const b = finDreBase; if (!b) return null;
    if (!finDreSim) return b;
    const num = x => Number(x)||0, V = finDreSim.vals;
    const custos = (b.custos||[]).map(c => Object.assign({}, c, { valor: num(V[c.chave]) }));
    const extrasRec  = finDreSim.extras.filter(e=>e.tipo==='receita');
    finDreSim.extras.filter(e=>e.tipo==='despesa').forEach((e,idx)=>custos.push({ chave:'extra'+idx, rotulo:e.rotulo||'Despesa avulsa', valor:num(e.valor), origem:'manual' }));
    const recVendas = num(V.receita);
    const receita = recVendas + extrasRec.reduce((s,e)=>s+num(e.valor),0);
    const totalCustos = custos.reduce((s,c)=>s+num(c.valor),0);
    const deducoes = num(V.deducoes);
    const lucro = receita - totalCustos;
    const lucroLiq = lucro - deducoes;
    return Object.assign({}, b, {
      _recVendas: recVendas, _extrasRec: extrasRec,
      receita_bruta: receita, custos, deducoes,
      total_custos: totalCustos, lucro, lucro_liquido: lucroLiq,
      margem_pct: receita>0 ? round2(lucroLiq/receita*100) : 0,
    });
  }

  function finDreSetKpis(d) {
    const setT = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
    setT('dre-k-receita', brMoney(d.receita_bruta));
    setT('dre-k-recebido', 'Recebido (caixa) ' + brMoney(d.recebido));
    setT('dre-k-custos',  brMoney(d.total_custos));
    setT('dre-k-lucro',   brMoney(d.lucro_liquido));
    setT('dre-k-margem',  'Margem ' + (Number(d.margem_pct)||0).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1}) + '%');
  }
  function finDreRenderProjetos(d) {
    const ph = document.getElementById('dre-projetos'); if (!ph) return;
    const ps = d.por_projeto || [];
    ph.innerHTML = ps.length ? ps.map(p=>`
      <div onclick="finDrePickObra('${p.projeto_id}')" title="Abrir DRE desta obra" class="px-5 py-3.5 flex items-center gap-4 cursor-pointer hover:bg-neutral-900/40 transition-colors">
        <span class="font-bold text-white text-sm flex-1 truncate">${escapeHTML(p.cli)}</span>
        <span class="hidden sm:block text-neutral-500 num text-[11px] w-28 text-right">${brMoney(p.receita)}</span>
        <span class="num text-sm w-28 text-right ${Number(p.lucro)>=0?'text-emerald-400':'text-red-400'}">${brMoney(p.lucro)}</span>
        <span class="num text-[11px] w-16 text-right text-neutral-400">${(Number(p.margem_pct)||0).toFixed(1)}%</span>
        <i data-lucide="chevron-right" class="w-4 h-4 text-neutral-600 shrink-0"></i>
      </div>`).join('') : `<div class="px-5 py-6 text-center text-[10px] text-neutral-600 font-bold uppercase tracking-widest">Sem obras no período</div>`;
  }

  function finDreRender() {
    const host = document.getElementById('dre-rows'); if (!host) return;
    const d = finDreEffective(); if (!d) return;
    finDreSetKpis(d);
    finDreRenderProjetos(d);
    if (finDreSim) finDreRenderEdit(host);
    else finDreRenderReadonly(host, d);
    finIcons();
  }

  // Cascata SOMENTE LEITURA (modo real).
  function finDreRenderReadonly(host, d) {
    const rec = Number(d.receita_bruta) || 0;
    const pctW = v => rec > 0 ? Math.max(0, Math.min(Math.abs(Number(v)||0)/rec*100, 100)) : 0;
    const lines = [{ l:'Receita bruta (venda)', v:rec, t:'pos', w:100 }];
    (d.custos || []).forEach(c => {
      const tag = c.origem === 'formula' ? ` · ${c.pct}%` : '';
      lines.push({ l:c.rotulo + tag, v:-(Number(c.valor)||0), t:'neg', w:pctW(c.valor) });
    });
    lines.push({ l:'Total de custos',   v:-(Number(d.total_custos)||0), t:'sub', w:pctW(d.total_custos) });
    lines.push({ l:'Lucro operacional',  v:Number(d.lucro)||0,           t:'sub', w:pctW(d.lucro) });
    if ((Number(d.deducoes)||0) !== 0) lines.push({ l:'(−) Deduções', v:-(Number(d.deducoes)||0), t:'neg', w:pctW(d.deducoes) });
    lines.push({ l:'Lucro líquido',      v:Number(d.lucro_liquido)||0,   t:'res', w:pctW(d.lucro_liquido) });
    const tone = { pos:'text-white', neg:'text-red-400', sub:'fin-acc', res:'text-emerald-400' };
    host.innerHTML = lines.map(x => {
      const strong = (x.t==='sub'||x.t==='res');
      const money = (x.v < 0 ? '− ' : '') + brMoney(Math.abs(x.v));
      return `<div class="px-5 py-3.5 flex items-center gap-4">
        <span class="${strong?'font-black text-white':'font-bold text-neutral-400'} text-sm flex-1">${x.l}</span>
        <div class="hidden sm:block w-40 h-2 bg-neutral-900"><div class="h-full" style="width:${x.w}%;background:${x.t==='neg'?'#52525b':'var(--fin)'}"></div></div>
        <span class="${tone[x.t]} font-black num text-sm w-32 text-right">${money}</span>
      </div>`;}).join('');
  }

  // Cascata EDITÁVEL (modo simulação) — estilo planilha: cada item já listado com seu campo.
  function finDreRenderEdit(host) {
    const V = finDreSim.vals;
    const moneyRow = (label, key, neg) => `
      <div class="px-5 py-2 flex items-center gap-3">
        <span class="font-bold text-neutral-300 text-sm flex-1">${label}</span>
        <span class="text-[12px] font-black ${neg?'text-red-400':'fin-acc'} w-4 text-center">${neg?'−':'+'}</span>
        <div class="relative w-36"><span class="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-neutral-500 font-bold">R$</span>
          <input type="number" step="0.01" value="${Number(V[key])||0}" oninput="finDreSimVal('${key}',this.value)" class="fin-acc-focus w-full pl-7 pr-2 py-1.5 bg-neutral-950 border border-neutral-800 text-white num font-black text-right text-sm"></div>
      </div>`;
    const totRow = (label, id, tone) => `
      <div class="px-5 py-3 flex items-center gap-3 border-t border-neutral-800">
        <span class="font-black text-white text-sm flex-1">${label}</span>
        <span id="${id}" class="${tone} font-black num text-sm w-36 text-right pr-1">—</span>
      </div>`;
    let html = moneyRow('Receita bruta (venda)', 'receita', false);
    (finDreBase.custos||[]).forEach(c => { html += moneyRow(c.rotulo, c.chave, true); });
    html += `<div class="px-5 py-3 bg-neutral-950/40 border-y border-neutral-800/60">
      <div class="flex items-center justify-between mb-2">
        <span class="text-[9px] font-black uppercase tracking-widest text-neutral-500">Linhas extras (avulsas)</span>
        <button onclick="finDreAddExtra()" class="text-[9px] font-black uppercase tracking-widest fin-acc hover:text-white inline-flex items-center gap-1"><i data-lucide="plus" class="w-3 h-3"></i>Adicionar linha</button>
      </div>
      <div class="space-y-2">${finDreSim.extras.map((e,i)=>dreExtraRow(e,i)).join('') || `<div class="text-[10px] text-neutral-600 font-bold uppercase tracking-widest">Nenhuma linha extra — opcional</div>`}</div>
    </div>`;
    html += moneyRow('(−) Deduções', 'deducoes', true);
    html += totRow('Total de custos',  'dre-tot-custos',  'fin-acc');
    html += totRow('Lucro operacional', 'dre-tot-lucroop', 'fin-acc');
    html += totRow('Lucro líquido',     'dre-tot-lucroliq','text-emerald-400');
    host.innerHTML = html;
    finDreUpdateTotals();
  }
  function dreExtraRow(e, i) {
    return `<div class="flex items-center gap-2">
      <select onchange="finDreExtra(${i},'tipo',this.value)" class="px-2 py-1.5 bg-neutral-950 border border-neutral-800 text-white text-[11px] font-bold">
        <option value="despesa"${e.tipo==='despesa'?' selected':''}>Despesa</option>
        <option value="receita"${e.tipo==='receita'?' selected':''}>Receita</option>
      </select>
      <input type="text" value="${(e.rotulo||'').replace(/"/g,'&quot;')}" oninput="finDreExtra(${i},'rotulo',this.value)" placeholder="Descrição" class="flex-1 min-w-0 px-2 py-1.5 bg-neutral-950 border border-neutral-800 text-white text-[11px] font-bold">
      <input type="number" step="0.01" value="${Number(e.valor)||0}" oninput="finDreExtra(${i},'valor',this.value)" class="w-28 px-2 py-1.5 bg-neutral-950 border border-neutral-800 text-white num font-black text-[11px] text-right">
      <button onclick="finDreDelExtra(${i})" class="w-7 h-7 grid place-items-center text-neutral-500 hover:text-red-400"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
    </div>`;
  }
  // Atualiza só os totais/KPIs ao vivo, sem re-renderizar os campos (preserva o foco enquanto digita).
  function finDreUpdateTotals() {
    const d = finDreEffective(); if (!d) return;
    finDreSetKpis(d);
    const set = (id,v)=>{ const e=document.getElementById(id); if (e) e.textContent = v; };
    set('dre-tot-custos',  '− ' + brMoney(d.total_custos));
    set('dre-tot-lucroop', brMoney(d.lucro));
    set('dre-tot-lucroliq', brMoney(d.lucro_liquido));
  }
  function finDreSimVal(key, val) { if (!finDreSim) return; finDreSim.vals[key] = parseFloat(val)||0; finDreUpdateTotals(); }
  function finDreExtra(i, field, val) { if (!finDreSim || !finDreSim.extras[i]) return; finDreSim.extras[i][field] = field==='valor'?(parseFloat(val)||0):val; finDreUpdateTotals(); }
  function finDreAddExtra() { if (!finDreSim) return; finDreSim.extras.push({ tipo:'despesa', rotulo:'', valor:0 }); finDreRender(); }
  function finDreDelExtra(i) { if (!finDreSim) return; finDreSim.extras.splice(i,1); finDreRender(); }

  // Liga os eventos do seletor de período (uma vez).
  function finDreWireControls() {
    const pbar = document.getElementById('dre-period');
    if (pbar && !pbar.dataset.wired) {
      pbar.dataset.wired = '1';
      pbar.addEventListener('click', e => {
        const b = e.target.closest('.dre-per'); if (!b) return;
        finDrePeriod = b.dataset.p;
        pbar.querySelectorAll('.dre-per').forEach(x => { x.classList.remove('fin-acc-solid'); x.classList.add('text-neutral-400'); });
        b.classList.add('fin-acc-solid'); b.classList.remove('text-neutral-400');
        if (finDreSim) finDreSim = null; // sair de simulação ao trocar período
        renderDre();
      });
    }
  }

  // Reflete na UI a obra selecionada e o estado do simulador.
  function finDreSyncControls() {
    const esc = finDreProjeto ? 'obra' : 'consolidado';
    const chip = document.getElementById('dre-obra-current');
    if (chip) chip.textContent = finDreProjeto ? finDreObraNome : 'Consolidado (todas as obras)';
    const sel = document.getElementById('dre-obra-select'); if (sel && sel.value !== (finDreProjeto||'')) sel.value = finDreProjeto || '';
    // "Resultado por obra" só faz sentido no consolidado; some quando uma obra está selecionada.
    const porObra = document.getElementById('dre-por-obra-card'); if (porObra) porObra.classList.toggle('hidden', esc==='obra');
    const panel = document.getElementById('dre-sim-panel'); if (panel) panel.classList.toggle('hidden', !finDreSim);
    const tg = document.getElementById('dre-sim-toggle');
    if (tg) { tg.classList.toggle('fin-acc-solid', !!finDreSim); tg.classList.toggle('text-neutral-400', !finDreSim); }
    const badge = document.getElementById('dre-sim-badge'); if (badge) badge.classList.toggle('hidden', !finDreSim);
  }

  // Popula o seletor de obras (uma vez) com list_fin_projetos_basicos.
  async function finDreLoadObras() {
    const sel = document.getElementById('dre-obra-select'); if (!sel || sel.dataset.loaded) return;
    let rows = [];
    try { rows = await finRpc('list_fin_projetos_basicos') || []; } catch (_) { return; }
    _finDreObras = rows;
    sel.dataset.loaded = '1';
    sel.innerHTML = `<option value="">Consolidado (todas as obras)</option>` +
      rows.map(o=>`<option value="${o.id}">${escapeHTML(o.cli||'—')} · ${brMoney(o.valor)}</option>`).join('');
    sel.value = finDreProjeto || '';
  }
  function finDrePickObra(id) {
    finDreProjeto = id || null;
    const o = _finDreObras.find(x => x.id === id);
    finDreObraNome = o ? `${o.cli} · ${brMoney(o.valor)}` : '';
    if (finDreSim) finDreSim = null; // sair de simulação ao trocar o escopo
    renderDre();
  }

  function finDreToggleSim() {
    if (finDreSim) { finDreSim = null; finDreSyncControls(); finDreRender(); return; }
    let saved = null; try { saved = JSON.parse(localStorage.getItem(finDreScenKey())); } catch (_) {}
    finDreInitSim(saved);
    if (saved) finToast('Cenário salvo carregado', 'info');
    finDreSyncControls(); finDreRender();
  }
  function finDreSaveScenario() {
    if (!finDreSim) return;
    try { localStorage.setItem(finDreScenKey(), JSON.stringify(finDreSim)); finToast('Cenário salvo neste navegador', 'ok'); }
    catch (_) { finToast('Não foi possível salvar', 'err'); }
  }
  function finDreClearSim() {
    if (!finDreSim) return;
    try { localStorage.removeItem(finDreScenKey()); } catch (_) {}
    finDreSim = null; finDreSyncControls(); finDreRender(); finToast('Simulação limpa', 'info');
  }

  /* --------------------------------------------------------- FUNIL */
  const funilStages = [
    'Providenciar Contrato','Validação Técnica','Aprovada a Vistoria','Ordem de Compra · Kit',
    'Aguardando Pagamento','Pagamento Iniciado','Kit Comprado','Parcelamentos','Financeiro Finalizado'
  ];
  const scoreMap = {
    saudavel: { l:'Saudável', c:'bg-emerald-500/10 text-emerald-400 border-emerald-500/25' },
    atencao:  { l:'Atenção',  c:'bg-yellow-500/10 text-yellow-400 border-yellow-500/25' },
    critico:  { l:'Crítico',  c:'bg-red-500/10 text-red-400 border-red-500/25' },
    bloqueado:{ l:'Bloqueado',c:'bg-neutral-800 text-neutral-400 border-neutral-700' },
  };
  let funilCards = [];   // projetos do funil (carregados via list_fin_funil)
  async function renderFunil() {
    const board = document.getElementById('funil-board'); if (!board) return;
    try { funilCards = await finRpc('list_fin_funil') || []; } catch (_) { funilCards = []; }
    board.innerHTML = funilStages.map((stage,i)=>{
      const cards = funilCards.filter(c=>c.st===i);
      const total = cards.reduce((s,c)=>s+(Number(c.val)||0),0);
      const totalFmt = total ? brMoney(total) : '—';
      return `<div class="shrink-0 w-[270px] flex flex-col">
        <div class="flex items-center justify-between px-3 py-2.5 bg-neutral-950 border border-neutral-800 border-b-0">
          <div class="flex items-center gap-2 min-w-0">
            <span class="w-5 h-5 grid place-items-center fin-acc-chip text-[9px] font-black shrink-0">${i+1}</span>
            <span class="text-[10px] font-black uppercase tracking-wider text-neutral-300 truncate">${stage}</span>
          </div>
          <span class="text-[9px] font-black text-neutral-600 shrink-0">${cards.length}</span>
        </div>
        <div class="px-3 py-1.5 bg-neutral-950/60 border-x border-neutral-800 text-[9px] font-bold uppercase tracking-widest text-neutral-500 num">${totalFmt}</div>
        <div class="flex-1 space-y-2 p-2 bg-neutral-900/20 border border-neutral-800 min-h-[120px]">
          ${funilCards.map((c,gi)=>({c,gi})).filter(o=>o.c.st===i).map(o=>funilCard(o.c,o.gi)).join('') || '<div class="text-center text-[10px] text-neutral-700 font-bold uppercase tracking-widest py-6">Vazio</div>'}
        </div>
      </div>`;
    }).join('');
    finIcons();
  }
  function funilCard(c, gi) {
    const sc = scoreMap[c.sc] || scoreMap.saudavel;
    return `<div onclick="finOpenFunilDetail(${gi})" class="bg-neutral-950 border border-neutral-800 hover:border-[color:var(--fin-border-30)] transition-colors p-3 cursor-pointer">
      <div class="flex items-start justify-between gap-2 mb-2">
        <div class="min-w-0"><div class="font-black text-white text-sm truncate">${escapeHTML(c.cli)}</div></div>
        <span class="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 text-[8px] font-black uppercase tracking-widest border ${sc.c}"><span class="w-1 h-1 bg-current"></span>${sc.l}</span>
      </div>
      <div class="text-white font-black num mb-2">${brMoney(c.val)}</div>
      ${c.mg!=null?`<div class="text-[10px] mb-2 flex justify-between"><span class="text-neutral-500 font-bold">Margem</span><span class="${c.mg<15?'text-red-400':'fin-acc'} font-bold">${c.mg}%</span></div>`:''}
      <div class="flex items-center justify-between text-[9px] font-bold uppercase tracking-widest text-neutral-600 pt-2 border-t border-neutral-800/70">
        <span class="flex items-center gap-1 min-w-0"><i data-lucide="user" class="w-3 h-3 shrink-0"></i><span class="truncate">${c.resp}</span></span>
        <span class="flex items-center gap-1 shrink-0 ${c.dias>=7?'text-yellow-500':''}"><i data-lucide="clock" class="w-3 h-3"></i>${c.dias}d parado</span>
      </div>
    </div>`;
  }

  /* Funil — detalhe + avançar/voltar etapa */
  let finModalIdx = null;
  function finOpenFunilDetail(gi) { finEnsureChrome(); finModalIdx = gi; renderFunilModal(); document.getElementById('fin-modal').classList.add('is-open'); }
  function closeFinModal() { const m = document.getElementById('fin-modal'); if (m) m.classList.remove('is-open'); }
  function renderFunilModal() {
    const c = funilCards[finModalIdx], sc = scoreMap[c.sc];
    const row = (l,v)=>`<div class="flex justify-between items-center py-2.5 border-b border-neutral-800/60"><span class="text-[10px] text-neutral-500 font-black uppercase tracking-widest">${l}</span><span class="text-sm text-white font-bold">${v}</span></div>`;
    document.getElementById('fin-modal-card').innerHTML = `
      <div class="sticky top-0 bg-[#0a0a0a] border-b border-neutral-800 px-5 py-4 flex items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="text-[10px] font-black uppercase tracking-[0.2em] fin-acc-strong">Etapa ${c.st+1}/9 · ${funilStages[c.st]}</div>
          <h3 class="text-xl font-black text-white mt-1 truncate">${escapeHTML(c.cli)}</h3>
        </div>
        <button onclick="closeFinModal()" class="shrink-0 w-9 h-9 grid place-items-center bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white transition-colors"><i data-lucide="x" class="w-4 h-4"></i></button>
      </div>
      <div class="p-5">
        <div class="flex items-center justify-between mb-4">
          <span class="text-2xl font-black text-white num">${brMoney(c.val)}</span>
          <span class="inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest border ${sc.c}"><span class="w-1 h-1 bg-current"></span>${sc.l}</span>
        </div>
        ${c.mg!=null?row('Margem prevista', `<span class="${c.mg<15?'text-red-400':'fin-acc'}">${c.mg}%</span>`):''}
        ${row('Responsável', c.resp)}
        ${row('Tempo parado', `${c.dias} dia${c.dias===1?'':'s'}`)}
        <div class="flex gap-2 mt-5">
          <button onclick="finFunilMove(-1)" ${c.st===0?'disabled':''} class="flex-1 py-3 bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed text-[10px] font-black uppercase tracking-widest inline-flex items-center justify-center gap-1.5 transition-colors"><i data-lucide="arrow-left" class="w-3.5 h-3.5"></i>Voltar etapa</button>
          <button onclick="finFunilMove(1)" ${c.st===8?'disabled':''} class="flex-1 py-3 fin-acc-solid disabled:opacity-30 disabled:cursor-not-allowed text-[10px] font-black uppercase tracking-widest inline-flex items-center justify-center gap-1.5">Avançar etapa<i data-lucide="arrow-right" class="w-3.5 h-3.5"></i></button>
        </div>
      </div>`;
    finIcons();
  }
  async function finFunilMove(d) {
    const c = funilCards[finModalIdx]; if (!c) return;
    const nv = c.st + d; if (nv<0 || nv>8) return;
    let res;
    try { res = await finRpc('mover_fin_projeto', { p_id: c.id, p_dir: d }); } catch (_) { return; }
    finToast((d>0?'Avançou para ':'Voltou para ')+funilStages[res.etapa], 'info');
    // GANCHO VISTORIA (stub) — quando o módulo Vistoria existir, disparar Emissão de Laudo aqui.
    if (res.etapa===6 && d>0) setTimeout(()=>finToast('Kit comprado · Emissão de Laudo (gancho Vistoria — próxima fase)','ok'), 350);
    closeFinModal();
    await renderFunil();
  }

  /* ---------------------- PAGAMENTOS · Conferência (entradas + saídas) ---------------------- */
  function finRenderConferencia() { finRenderRecebimentos(); finRenderAPagar(); }

  // Entradas: títulos a receber pendentes — conferir/baixar comprovante.
  async function finRenderRecebimentos() {
    const host = document.getElementById('fin-receb'); if (!host) return;
    let rows = [];
    try { rows = await finRpc('list_fin_titulos', { p_filter: 'todos' }) || []; } catch (_) {}
    rows = rows.filter(r => r.st !== 'pago');
    host.innerHTML = rows.length ? rows.map(r=>`
      <div class="flex items-center justify-between gap-3 px-5 py-3.5">
        <div class="min-w-0">
          <div class="font-black text-white truncate">${escapeHTML(r.cli)}</div>
          <div class="text-[10px] text-neutral-500 font-bold">${escapeHTML(r.proj)} · vence ${r.venc||'—'}</div>
        </div>
        <div class="flex items-center gap-3 shrink-0">
          <span class="text-white font-black num">${brMoney(r.saldo)}</span>
          <button onclick="finTitBaixar('${r.id}')" title="Conferir / baixar" class="w-8 h-8 grid place-items-center bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 hover:bg-emerald-500/20 transition-colors"><i data-lucide="check" class="w-4 h-4 stroke-[2.5]"></i></button>
        </div>
      </div>`).join('') : `<div class="px-5 py-8 text-center text-[10px] text-neutral-600 font-bold uppercase tracking-widest">Nada a conferir</div>`;
    finIcons();
  }

  // Saídas: contas a pagar (aprovar → pagar).
  const pagStMap = {
    a_aprovar:{ l:'A aprovar', c:'bg-yellow-500/10 text-yellow-400 border-yellow-500/25' },
    aprovado: { l:'Aprovado',  c:'fin-acc-chip border border-[color:var(--fin-border-30)]' },
    pago:     { l:'Pago',      c:'bg-emerald-500/10 text-emerald-400 border-emerald-500/25' },
    recusado: { l:'Recusado',  c:'bg-red-500/10 text-red-400 border-red-500/25' },
  };
  async function finRenderAPagar() {
    const host = document.getElementById('fin-apagar'); if (!host) return;
    let rows = [];
    try { rows = await finRpc('list_fin_pagamentos', { p_filter: 'todos' }) || []; } catch (_) {}
    const acts = (p) => {
      if (p.status==='a_aprovar') return `<button onclick="finPagAprovar('${p.id}')" title="Aprovar" class="w-7 h-7 grid place-items-center fin-acc-chip border border-[color:var(--fin-border-30)]"><i data-lucide="check" class="w-3.5 h-3.5"></i></button><button onclick="finPagRecusarPg('${p.id}')" title="Recusar" class="w-7 h-7 grid place-items-center bg-red-500/10 text-red-400 border border-red-500/25"><i data-lucide="x" class="w-3.5 h-3.5"></i></button>`;
      if (p.status==='aprovado') return `<button onclick="finPagPagar('${p.id}')" title="Marcar pago" class="w-7 h-7 grid place-items-center bg-emerald-500/10 text-emerald-400 border border-emerald-500/25"><i data-lucide="check-check" class="w-3.5 h-3.5"></i></button>`;
      return '';
    };
    host.innerHTML = rows.length ? rows.map(p=>`
      <div class="flex items-center justify-between gap-3 px-5 py-3.5">
        <div class="min-w-0">
          <div class="font-black text-white truncate">${escapeHTML(p.descricao)}</div>
          <div class="text-[10px] text-neutral-500 font-bold">${escapeHTML(p.fornecedor)} · ${escapeHTML(p.categoria)}${p.venc?' · '+p.venc:''}</div>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <span class="text-white font-black num">${brMoney(p.valor)}</span>
          <span class="inline-flex items-center gap-1 px-2 py-0.5 border text-[8px] font-black uppercase tracking-widest ${pagStMap[p.status].c}">${pagStMap[p.status].l}</span>
          ${acts(p)}
        </div>
      </div>`).join('') : `<div class="px-5 py-8 text-center text-[10px] text-neutral-600 font-bold uppercase tracking-widest">Nenhuma conta a pagar</div>`;
    finIcons();
  }
  async function finPagAprovar(id)   { try { await finRpc('set_fin_pagamento_status', { p_id:id, p_status:'aprovado' }); } catch(_){return;} finToast('Pagamento aprovado','ok'); finRenderAPagar(); }
  async function finPagRecusarPg(id) { try { await finRpc('set_fin_pagamento_status', { p_id:id, p_status:'recusado' }); } catch(_){return;} finToast('Pagamento recusado','err'); finRenderAPagar(); }
  async function finPagPagar(id)     { try { await finRpc('set_fin_pagamento_status', { p_id:id, p_status:'pago' }); } catch(_){return;} finToast('Pagamento baixado','ok'); finRenderAPagar(); }

  function finNovoPagamento() {
    finEnsureChrome();
    document.getElementById('fin-modal-card').innerHTML = `
      <div class="sticky top-0 bg-[#0a0a0a] border-b border-neutral-800 px-5 py-4 flex items-start justify-between gap-3">
        <div><div class="text-[10px] font-black uppercase tracking-[0.2em] fin-acc-strong">Nova conta a pagar</div>
          <h3 class="text-lg font-black text-white mt-1">Saída</h3></div>
        <button onclick="closeFinModal()" class="shrink-0 w-9 h-9 grid place-items-center bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white transition-colors"><i data-lucide="x" class="w-4 h-4"></i></button>
      </div>
      <div class="p-5 space-y-4">
        <div><label class="text-[10px] font-black uppercase tracking-widest text-neutral-500">Descrição</label>
          <input id="fin-pg-desc" type="text" placeholder="Ex.: Compra do kit" class="fin-acc-focus w-full mt-1.5 px-3 py-2.5 bg-neutral-950 border border-neutral-800 text-white text-sm font-bold"></div>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="text-[10px] font-black uppercase tracking-widest text-neutral-500">Categoria</label>
            <select id="fin-pg-cat" class="fin-acc-focus w-full mt-1.5 px-3 py-2.5 bg-neutral-950 border border-neutral-800 text-white text-sm font-bold">
              <option value="kit">Kit</option><option value="custo">Custo</option><option value="despesa">Despesa</option><option value="comissao">Comissão</option><option value="outro">Outro</option>
            </select></div>
          <div><label class="text-[10px] font-black uppercase tracking-widest text-neutral-500">Fornecedor</label>
            <input id="fin-pg-forn" type="text" placeholder="Nome" class="fin-acc-focus w-full mt-1.5 px-3 py-2.5 bg-neutral-950 border border-neutral-800 text-white text-sm font-bold"></div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="text-[10px] font-black uppercase tracking-widest text-neutral-500">Valor</label>
            <input id="fin-pg-valor" type="number" step="0.01" placeholder="0,00" class="fin-acc-focus w-full mt-1.5 px-3 py-2.5 bg-neutral-950 border border-neutral-800 text-white num font-black"></div>
          <div><label class="text-[10px] font-black uppercase tracking-widest text-neutral-500">Vencimento</label>
            <input id="fin-pg-venc" type="date" class="fin-acc-focus w-full mt-1.5 px-3 py-2.5 bg-neutral-950 border border-neutral-800 text-white text-sm font-bold"></div>
        </div>
        <button onclick="finNovoPagamentoSubmit()" class="w-full py-3 fin-acc-solid text-[11px] font-black uppercase tracking-widest inline-flex items-center justify-center gap-2"><i data-lucide="plus" class="w-4 h-4 stroke-[3]"></i>Criar conta a pagar</button>
      </div>`;
    document.getElementById('fin-modal').classList.add('is-open');
    finIcons();
  }
  async function finNovoPagamentoSubmit() {
    const valor = parseFloat(document.getElementById('fin-pg-valor').value);
    if (!(valor > 0)) { finToast('Informe um valor válido', 'warn'); return; }
    try {
      await finRpc('create_fin_pagamento', {
        p_descricao: document.getElementById('fin-pg-desc').value || '',
        p_categoria: document.getElementById('fin-pg-cat').value || 'outro',
        p_fornecedor: document.getElementById('fin-pg-forn').value || '',
        p_valor: valor,
        p_vencimento: document.getElementById('fin-pg-venc').value || null,
        p_cliente_id: null,
      });
    } catch (_) { return; }
    closeFinModal(); finToast('Conta a pagar criada', 'ok'); finRenderAPagar();
  }

  /* ---------------------- APROVAÇÕES (fila consolidada) ---------------------- */
  async function renderFinAprovacoes() {
    const host = document.getElementById('fin-aprovacoes'); if (!host) return;
    let rows = [];
    try { rows = await finRpc('list_fin_aprovacoes') || []; } catch (_) {}
    host.innerHTML = rows.length ? rows.map(a=>`
      <div class="metric-card p-4 flex items-center justify-between gap-3">
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-9 h-9 grid place-items-center ${a.tipo==='comissao'?'fin-acc-chip border border-[color:var(--fin-border-30)]':'bg-yellow-500/10 text-yellow-400 border border-yellow-500/25'} shrink-0"><i data-lucide="${a.tipo==='comissao'?'users':'credit-card'}" class="w-4 h-4"></i></div>
          <div class="min-w-0"><div class="font-black text-white truncate">${escapeHTML(a.titulo)}</div><div class="text-[10px] text-neutral-500 font-bold uppercase tracking-widest">${escapeHTML(a.sub)}</div></div>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <span class="text-white font-black num">${brMoney(a.valor)}</span>
          <button onclick="finAprovarItem('${a.tipo}','${a.id}')" title="Aprovar" class="w-8 h-8 grid place-items-center bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 hover:bg-emerald-500/20 transition-colors"><i data-lucide="check" class="w-4 h-4 stroke-[2.5]"></i></button>
        </div>
      </div>`).join('') : `<div class="metric-card p-8 text-center text-[10px] text-neutral-600 font-bold uppercase tracking-widest">Nada pendente de aprovação</div>`;
    finIcons();
  }
  async function finAprovarItem(tipo, id) {
    try {
      if (tipo === 'comissao') await finRpc('set_fin_comissao_status', { p_id:id, p_status:'liberado' });
      else await finRpc('set_fin_pagamento_status', { p_id:id, p_status:'aprovado' });
    } catch (_) { return; }
    finToast('Aprovado', 'ok'); renderFinAprovacoes();
  }

  // Alterna as sub-abas de Pagamentos (Conferência × Comissões).
  function renderPagSub(sub) {
    sub = sub || state.finPagSub || 'conferencia';
    state.finPagSub = sub;
    const bar = document.getElementById('pag-subtabs');
    if (bar) bar.querySelectorAll('.fin-subtab').forEach(b => b.classList.toggle('is-active', b.dataset.sub === sub));
    const body = document.getElementById('fin-pag-body'); if (!body) return;
    if (sub === 'comissoes') {
      body.innerHTML = comissoesBodyHTML();
      renderCom();
    } else {
      body.innerHTML = pagConferenciaHTML();
      finRenderConferencia();
    }
    finIcons();
  }

  /* --------------------------------------------------- ORDEM DE COMPRA */
  const ocSt = {
    orcamento:{ l:'Orçamento',            c:'bg-neutral-800 text-neutral-400 border-neutral-700' },
    aprovar:  { l:'Aguardando aprovação', c:'bg-yellow-500/10 text-yellow-400 border-yellow-500/25' },
    aprovado: { l:'Aprovado p/ compra',   c:'fin-acc-chip border border-[color:var(--fin-border-30)]' },
    comprado: { l:'Comprado',             c:'bg-emerald-500/10 text-emerald-400 border-emerald-500/25' },
    reprovado:{ l:'Reprovado',            c:'bg-red-500/10 text-red-400 border-red-500/25' },
  };
  async function renderOC(filter) {
    if (filter) state.finFilters.ordemcompra.f = filter;
    filter = state.finFilters.ordemcompra.f || 'todos';
    const host = document.getElementById('oc-grid'); if (!host) return;
    let rows = [];
    try { rows = await finRpc('list_fin_ordens_compra', { p_filter: filter }) || []; } catch (_) {}
    const field = (l,v)=>`<div><div class="text-[8px] font-black uppercase tracking-widest text-neutral-600">${l}</div><div class="text-[11px] font-bold text-neutral-300 num">${v}</div></div>`;
    const novo = `<button onclick="finNovaOC()" class="metric-card p-5 border-dashed flex flex-col items-center justify-center gap-2 text-neutral-500 hover:text-white hover:border-[color:var(--fin-border-30)] transition-colors min-h-[200px]"><i data-lucide="plus" class="w-6 h-6"></i><span class="text-[10px] font-black uppercase tracking-widest">Nova ordem</span></button>`;
    host.innerHTML = novo + rows.map(o=>{
      const s = ocSt[o.status] || { l:o.status, c:'bg-neutral-800 text-neutral-400 border-neutral-700' };
      let acoes = '';
      if (o.status==='orcamento') acoes = `<button onclick="finOcAnexar('${o.id}')" class="w-full py-2.5 bg-neutral-900 text-neutral-300 border border-neutral-800 hover:text-white text-[10px] font-black uppercase tracking-widest inline-flex items-center justify-center gap-1.5"><i data-lucide="paperclip" class="w-3.5 h-3.5"></i>Enviar p/ aprovação</button>`;
      else if (o.status==='aprovar') acoes = `<div class="flex gap-2">
          <button onclick="finOcStatus('${o.id}','aprovado')" class="flex-1 py-2.5 fin-acc-chip border border-[color:var(--fin-border-30)] text-[10px] font-black uppercase tracking-widest inline-flex items-center justify-center gap-1.5"><i data-lucide="check" class="w-3.5 h-3.5"></i>Aprovar</button>
          <button onclick="finOcStatus('${o.id}','reprovado')" class="flex-1 py-2.5 bg-red-500/10 text-red-400 border border-red-500/25 text-[10px] font-black uppercase tracking-widest inline-flex items-center justify-center gap-1.5"><i data-lucide="x" class="w-3.5 h-3.5"></i>Reprovar</button>
        </div>`;
      else if (o.status==='aprovado') acoes = `<button onclick="finOcStatus('${o.id}','comprado')" class="w-full py-2.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 hover:bg-emerald-500/20 text-[10px] font-black uppercase tracking-widest inline-flex items-center justify-center gap-1.5 transition-colors"><i data-lucide="shopping-cart" class="w-3.5 h-3.5"></i>Marcar como comprado</button>`;
      else if (o.status==='reprovado') acoes = `<div class="text-center text-[10px] font-bold uppercase tracking-widest text-red-400 inline-flex items-center justify-center gap-1.5 w-full py-1"><i data-lucide="x-circle" class="w-3.5 h-3.5"></i>Ordem reprovada</div>`;
      else acoes = `<div class="text-center text-[10px] font-bold uppercase tracking-widest text-emerald-400 inline-flex items-center justify-center gap-1.5 w-full py-1"><i data-lucide="check-check" class="w-3.5 h-3.5"></i>Kit comprado</div>`;
      return `<div class="metric-card p-5 flex flex-col">
        <div class="flex items-start justify-between gap-2 mb-3">
          <div class="min-w-0"><div class="font-black text-white truncate">${escapeHTML(o.cli)}</div><div class="text-[10px] text-neutral-500 font-bold uppercase tracking-widest">${escapeHTML(o.fornecedor)} · ${escapeHTML(o.codigo)}</div></div>
          <span class="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 border text-[9px] font-black uppercase tracking-widest ${s.c}">${s.l}</span>
        </div>
        <div class="text-white font-black text-lg num mb-3">${brMoney(o.valor)}</div>
        <div class="grid grid-cols-2 gap-y-2.5 gap-x-3 pb-4 mb-4 border-b border-neutral-800">
          ${field('Módulos', o.modulos)}
          ${field('Inversor', o.inversor)}
          ${field('Potência', o.potencia)}
          ${field('Validade orç.', o.validade||'—')}
          ${field('Margem', o.margem==null?'—':o.margem+'%')}
        </div>
        <div class="mt-auto">${acoes}</div>
      </div>`;
    }).join('');
    finIcons();
  }
  async function finOcAnexar(id) { try { await finRpc('anexar_fin_oc', { p_id:id, p_url:'' }); } catch(_){return;} finToast('Enviado para aprovação','info'); finReloadOC(); }
  async function finOcStatus(id, st) {
    try { await finRpc('set_fin_oc_status', { p_id:id, p_status:st }); } catch(_){return;}
    finToast(st==='aprovado'?'Ordem aprovada':st==='reprovado'?'Ordem reprovada':st==='comprado'?'Kit comprado':'Atualizado', st==='reprovado'?'err':'ok');
    if (st==='comprado') setTimeout(()=>finToast('Funil → Kit Comprado · Emissão de Laudo (gancho Vistoria — próxima fase)','info'), 350);
    finReloadOC();
  }
  function finReloadOC() { if ((state.finSub && state.finSub.compras) === 'orcamentos') renderOrc(); else renderOC(); }

  /* ------------------------------------ CUSTOS · PREVISTO × REALIZADO */
  const MARGEM_MIN = 15;
  // Custos carregados via list_fin_custos e normalizados para o formato dos renderizadores
  // (cats:[{id,c,p,r}], recPrev/recReal = receita do projeto).
  let custosProjetos = [];
  const fmtR = n => 'R$ ' + Math.round(Number(n)||0).toLocaleString('pt-BR');
  function custoCalc(pj) {
    const cp = pj.cats.reduce((s,c)=>s+c.p,0);
    const cr = pj.cats.reduce((s,c)=>s+c.r,0);
    const lp = pj.recPrev - cp, lr = pj.recReal - cr;
    return { cp, cr, lp, lr, mp:pj.recPrev?lp/pj.recPrev*100:0, mr:pj.recReal?lr/pj.recReal*100:0, desvio:cr-cp };
  }
  let cstSel = 0;
  function custoStatus(k) {
    if (k.mr < 0) return {l:'Prejuízo',c:'bg-red-500/10 text-red-400 border-red-500/25'};
    if (k.mr < MARGEM_MIN) return {l:'Margem baixa',c:'bg-red-500/10 text-red-400 border-red-500/25'};
    if (k.desvio > 0) return {l:'Atenção',c:'bg-yellow-500/10 text-yellow-400 border-yellow-500/25'};
    return {l:'Saudável',c:'bg-emerald-500/10 text-emerald-400 border-emerald-500/25'};
  }
  function custoResultsHTML(q) {
    const term = (q||'').toLowerCase().trim();
    const matches = custosProjetos.map((pj,i)=>({pj,i})).filter(o=>o.pj.cli.toLowerCase().includes(term));
    const box = document.getElementById('cst-results'); if (!box) return;
    box.innerHTML = matches.length ? matches.map(o=>{
      const k = custoCalc(o.pj), s = custoStatus(k);
      return `<button type="button" onclick="finPickCusto(${o.i})" class="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-neutral-900 transition-colors border-b border-neutral-800/60 last:border-0 ${o.i===cstSel?'bg-neutral-900':''}">
        <span class="text-[12px] font-bold text-white truncate">${escapeHTML(o.pj.cli)}</span>
        <span class="shrink-0 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 border ${s.c}">${k.mr.toFixed(1)}%</span>
      </button>`;
    }).join('') : `<div class="px-3 py-3 text-[10px] text-neutral-600 font-bold uppercase tracking-widest">Nenhum projeto encontrado</div>`;
    finIcons();
  }
  function custoSearch(q) { custoResultsHTML(q); const b=document.getElementById('cst-results'); if (b) b.classList.remove('hidden'); }
  function custoOpenResults() { const s=document.getElementById('cst-search'); custoResultsHTML(s?s.value:''); const b=document.getElementById('cst-results'); if (b) b.classList.remove('hidden'); }
  function custoToggleResults(e) { if (e) e.stopPropagation(); const b=document.getElementById('cst-results'); if (!b) return; if (b.classList.contains('hidden')) custoOpenResults(); else b.classList.add('hidden'); }
  function finPickCusto(i) { cstSel = i; const b=document.getElementById('cst-results'); if (b) b.classList.add('hidden'); const s=document.getElementById('cst-search'); if (s) s.value=''; renderCustosBreakdown(); renderCustosTable(); }
  function finPickCustoFromTable(i) { finPickCusto(i); const el=document.querySelector('[data-fin-panel="custos"]'); if (el) el.scrollIntoView({behavior:'smooth', block:'start'}); }
  function renderCustosBreakdown() {
    const host = document.getElementById('cst-breakdown'); if (!host) return;
    const pj = custosProjetos[cstSel], k = custoCalc(pj);
    const sn = document.getElementById('cst-selname'); if (sn) sn.textContent = pj.cli;
    const mini = (label,prev,real,tone)=>`<div class="flex-1 min-w-0">
        <div class="text-[8px] font-black uppercase tracking-widest text-neutral-600">${label}</div>
        <div class="text-[11px] font-bold text-neutral-500 num">prev ${fmtR(prev)}</div>
        <div class="text-sm font-black ${tone} num">${fmtR(real)}</div>
      </div>`;
    const desvioTone = k.desvio>0?'text-red-400':'text-emerald-400';
    const rows = pj.cats.map(c=>{
      const d = c.r-c.p, over=d>0;
      const max = Math.max(...pj.cats.map(x=>Math.max(x.p,x.r)));
      return `<div class="py-2.5 border-b border-neutral-800/60 last:border-0">
        <div class="flex items-center justify-between mb-1.5">
          <span class="text-[11px] font-bold text-neutral-300">${c.c}</span>
          <span class="flex items-center gap-2">
            <span class="text-[10px] font-black num ${over?'text-red-400':d<0?'text-emerald-400':'text-neutral-500'}">${d===0?'—':(over?'+':'')+fmtR(d)}</span>
            <button onclick="finCustoEdit('${c.id}')" title="Editar custo" class="text-neutral-600 hover:fin-acc transition-colors"><i data-lucide="pencil" class="w-3 h-3"></i></button>
          </span>
        </div>
        <div class="flex gap-1.5 items-center">
          <div class="flex-1 h-1.5 bg-neutral-900"><div class="h-full bg-neutral-600" style="width:${Math.round(c.p/max*100)}%"></div></div>
          <div class="flex-1 h-1.5 bg-neutral-900"><div class="h-full" style="width:${Math.round(c.r/max*100)}%;background:${over?'#f87171':'var(--fin)'}"></div></div>
        </div>
      </div>`;
    }).join('');
    host.innerHTML = `
      <div class="flex flex-wrap gap-4 pb-4 mb-3 border-b border-neutral-800">
        ${mini('Receita', pj.recPrev, pj.recReal, 'text-white')}
        ${mini('Custo', k.cp, k.cr, k.desvio>0?'text-red-400':'text-white')}
        ${mini('Lucro', k.lp, k.lr, 'fin-acc')}
        <div class="flex-1 min-w-0">
          <div class="text-[8px] font-black uppercase tracking-widest text-neutral-600">Margem real.</div>
          <div class="text-[11px] font-bold text-neutral-500 num">meta ${MARGEM_MIN}%</div>
          <div class="text-sm font-black num ${k.mr<MARGEM_MIN?'text-red-400':'fin-acc'}">${k.mr.toFixed(1)}%</div>
        </div>
      </div>
      <div class="flex items-center gap-3 text-[9px] font-bold uppercase tracking-widest text-neutral-500 mb-1">
        <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 bg-neutral-600"></span>Previsto</span>
        <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5" style="background:var(--fin)"></span>Realizado</span>
        <span class="ml-auto ${desvioTone}">Desvio total ${k.desvio>0?'+':''}${fmtR(k.desvio)}</span>
      </div>
      ${rows}`;
  }
  function renderCustosAlerts() {
    const host = document.getElementById('cst-alerts'); if (!host) return;
    const alerts = [];
    custosProjetos.forEach(pj=>{
      const k = custoCalc(pj);
      if (k.mr < MARGEM_MIN) alerts.push({t:'red', i:'percent', txt:`${escapeHTML(pj.cli)}: margem ${k.mr.toFixed(1)}% abaixo do mínimo (${MARGEM_MIN}%)`});
      if (k.desvio > 0) alerts.push({t:'yellow', i:'trending-up', txt:`${escapeHTML(pj.cli)}: custo realizado ${fmtR(k.desvio)} acima do previsto`});
      if (pj.recReal < pj.recPrev) alerts.push({t:'yellow', i:'arrow-down-right', txt:`${escapeHTML(pj.cli)}: receita recebida abaixo da prevista`});
    });
    const tone = { red:'bg-red-500/10 text-red-400 border-red-500/25', yellow:'bg-yellow-500/10 text-yellow-400 border-yellow-500/25' };
    host.innerHTML = alerts.length ? alerts.map(a=>`
      <div class="flex items-start gap-2.5 p-3 border ${tone[a.t]}">
        <i data-lucide="${a.i}" class="w-4 h-4 shrink-0 mt-0.5"></i>
        <span class="text-[11px] font-bold leading-snug">${a.txt}</span>
      </div>`).join('') : `<div class="text-[10px] text-neutral-600 font-bold uppercase tracking-widest py-4 text-center">Sem alertas</div>`;
    finIcons();
  }
  function renderCustosTable() {
    const tbl = document.getElementById('cst-table');
    if (tbl) tbl.innerHTML = custosProjetos.map((pj,i)=>{
      const k = custoCalc(pj), s = custoStatus(k);
      return `<tr onclick="finPickCustoFromTable(${i})" class="border-b border-neutral-800/60 hover:bg-neutral-900/40 transition-colors cursor-pointer">
        <td class="px-5 py-3.5 font-black text-white"><span class="inline-flex items-center gap-1.5">${escapeHTML(pj.cli)}${i===cstSel?'<i data-lucide="eye" class="w-3.5 h-3.5 fin-acc"></i>':''}</span></td>
        <td class="px-3 py-3.5 text-right text-neutral-300 num">${fmtR(pj.recReal)}</td>
        <td class="px-3 py-3.5 text-right text-neutral-400 num">${fmtR(k.cp)}</td>
        <td class="px-3 py-3.5 text-right num ${k.desvio>0?'text-red-400':'text-neutral-300'}">${fmtR(k.cr)}</td>
        <td class="px-3 py-3.5 text-right fin-acc font-bold num">${fmtR(k.lr)}</td>
        <td class="px-3 py-3.5 text-center num font-black ${k.mr<MARGEM_MIN?'text-red-400':'text-white'}">${k.mr.toFixed(1)}%</td>
        <td class="px-5 py-3.5 text-center"><span class="inline-flex px-2.5 py-1 text-[9px] font-black uppercase tracking-widest border ${s.c}">${s.l}</span></td>
      </tr>`;
    }).join('');
    const cards = document.getElementById('cst-cards');
    if (cards) cards.innerHTML = custosProjetos.map(pj=>{
      const k = custoCalc(pj), s = custoStatus(k);
      return `<div class="metric-card p-4">
        <div class="flex items-start justify-between gap-2"><div class="font-black text-white truncate">${escapeHTML(pj.cli)}</div><span class="inline-flex px-2.5 py-1 text-[9px] font-black uppercase tracking-widest border ${s.c}">${s.l}</span></div>
        <div class="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-neutral-800 text-center">
          <div><div class="text-[8px] font-black uppercase tracking-widest text-neutral-600">Custo real.</div><div class="text-[11px] font-black ${k.desvio>0?'text-red-400':'text-neutral-300'} num">${fmtR(k.cr)}</div></div>
          <div><div class="text-[8px] font-black uppercase tracking-widest text-neutral-600">Lucro real.</div><div class="text-[11px] font-black fin-acc num">${fmtR(k.lr)}</div></div>
          <div><div class="text-[8px] font-black uppercase tracking-widest text-neutral-600">Margem</div><div class="text-[11px] font-black ${k.mr<MARGEM_MIN?'text-red-400':'text-white'} num">${k.mr.toFixed(1)}%</div></div>
        </div>
      </div>`;
    }).join('');
    finIcons();
  }
  async function renderCustos() {
    let raw = [];
    try { raw = await finRpc('list_fin_custos') || []; } catch (_) {}
    // normaliza para o formato dos renderizadores
    custosProjetos = raw.map(p => ({
      projeto_id: p.projeto_id, cli: p.cli, recPrev: Number(p.receita)||0, recReal: Number(p.receita)||0,
      cats: (p.cats||[]).map(c => ({ id:c.id, c:c.categoria, p:Number(c.previsto)||0, r:Number(c.realizado)||0 })),
    }));
    if (cstSel >= custosProjetos.length) cstSel = 0;
    const set = (id,txt)=>{ const el=document.getElementById(id); if (el) el.textContent = txt; };
    const tot = custosProjetos.reduce((a,pj)=>{const k=custoCalc(pj);a.cp+=k.cp;a.cr+=k.cr;if(k.mr<MARGEM_MIN||k.desvio>0)a.risco++;return a;},{cp:0,cr:0,risco:0});
    set('cst-prev', fmtR(tot.cp));
    set('cst-real', fmtR(tot.cr));
    const dv = tot.cr-tot.cp, dvEl = document.getElementById('cst-desvio');
    if (dvEl) { dvEl.textContent = (dv>0?'+':'')+fmtR(dv); dvEl.className = 'text-xl font-black mt-2 num '+(dv>0?'text-red-400':'text-emerald-400'); }
    set('cst-risco', tot.risco);
    if (!custosProjetos.length) {
      const bd = document.getElementById('cst-breakdown'); if (bd) bd.innerHTML = '<div class="py-8 text-center text-[10px] text-neutral-600 font-bold uppercase tracking-widest">Nenhum custo lançado</div>';
      const al = document.getElementById('cst-alerts'); if (al) al.innerHTML = '<div class="py-4 text-center text-[10px] text-neutral-600 font-bold uppercase tracking-widest">Sem alertas</div>';
      const tb = document.getElementById('cst-table'); if (tb) tb.innerHTML = '<tr><td colspan="7" class="px-5 py-10 text-center text-[10px] text-neutral-600 font-bold uppercase tracking-widest">Nenhum custo lançado</td></tr>';
      const cc = document.getElementById('cst-cards'); if (cc) cc.innerHTML = '';
      finIcons(); return;
    }
    renderCustosBreakdown(); renderCustosAlerts(); renderCustosTable();
    finIcons();
  }

  function finNovoCusto() {
    finEnsureChrome();
    document.getElementById('fin-modal-card').innerHTML = `
      <div class="sticky top-0 bg-[#0a0a0a] border-b border-neutral-800 px-5 py-4 flex items-start justify-between gap-3">
        <div><div class="text-[10px] font-black uppercase tracking-[0.2em] fin-acc-strong">Lançar custo</div>
          <h3 class="text-lg font-black text-white mt-1">Custo por categoria</h3></div>
        <button onclick="closeFinModal()" class="shrink-0 w-9 h-9 grid place-items-center bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white transition-colors"><i data-lucide="x" class="w-4 h-4"></i></button>
      </div>
      <div class="p-5 space-y-4">
        <div><label class="text-[10px] font-black uppercase tracking-widest text-neutral-500">Projeto</label>
          <select id="fin-ct-proj" class="fin-acc-focus w-full mt-1.5 px-3 py-2.5 bg-neutral-950 border border-neutral-800 text-white text-sm font-bold"></select></div>
        <div><label class="text-[10px] font-black uppercase tracking-widest text-neutral-500">Categoria</label>
          <input id="fin-ct-cat" type="text" placeholder="Ex.: Kit, Instalação, Impostos..." class="fin-acc-focus w-full mt-1.5 px-3 py-2.5 bg-neutral-950 border border-neutral-800 text-white text-sm font-bold"></div>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="text-[10px] font-black uppercase tracking-widest text-neutral-500">Previsto</label>
            <input id="fin-ct-prev" type="number" step="0.01" class="fin-acc-focus w-full mt-1.5 px-3 py-2.5 bg-neutral-950 border border-neutral-800 text-white num font-black"></div>
          <div><label class="text-[10px] font-black uppercase tracking-widest text-neutral-500">Realizado</label>
            <input id="fin-ct-real" type="number" step="0.01" class="fin-acc-focus w-full mt-1.5 px-3 py-2.5 bg-neutral-950 border border-neutral-800 text-white num font-black"></div>
        </div>
        <button onclick="finNovoCustoSubmit()" class="w-full py-3 fin-acc-solid text-[11px] font-black uppercase tracking-widest inline-flex items-center justify-center gap-2"><i data-lucide="plus" class="w-4 h-4 stroke-[3]"></i>Lançar custo</button>
      </div>`;
    document.getElementById('fin-modal').classList.add('is-open');
    finFillProjetoSelect('fin-ct-proj');
    finIcons();
  }
  async function finNovoCustoSubmit() {
    const proj = document.getElementById('fin-ct-proj').value;
    const cat = document.getElementById('fin-ct-cat').value;
    if (!proj) { finToast('Selecione um projeto', 'warn'); return; }
    if (!cat) { finToast('Informe a categoria', 'warn'); return; }
    try { await finRpc('create_fin_custo', { p_fin_projeto_id: proj, p_categoria: cat, p_previsto: parseFloat(document.getElementById('fin-ct-prev').value)||0, p_realizado: parseFloat(document.getElementById('fin-ct-real').value)||0 }); }
    catch (_) { return; }
    closeFinModal(); finToast('Custo lançado', 'ok'); renderCustos();
  }
  // Edição manual inline de um custo já lançado (previsto/realizado) via update_fin_custo.
  function finCustoFindCat(catId) {
    for (const pj of custosProjetos) { const c = pj.cats.find(x => x.id === catId); if (c) return { pj, c }; }
    return null;
  }
  function finCustoEdit(catId) {
    const f = finCustoFindCat(catId); if (!f) return;
    finEnsureChrome();
    document.getElementById('fin-modal-card').innerHTML = `
      <div class="sticky top-0 bg-[#0a0a0a] border-b border-neutral-800 px-5 py-4 flex items-start justify-between gap-3">
        <div class="min-w-0"><div class="text-[10px] font-black uppercase tracking-[0.2em] fin-acc-strong">Editar custo</div>
          <h3 class="text-lg font-black text-white mt-1 truncate">${f.c.c}</h3>
          <div class="text-[11px] text-neutral-500 font-bold truncate">${escapeHTML(f.pj.cli)}</div></div>
        <button onclick="closeFinModal()" class="shrink-0 w-9 h-9 grid place-items-center bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white transition-colors"><i data-lucide="x" class="w-4 h-4"></i></button>
      </div>
      <div class="p-5 space-y-4">
        <div class="grid grid-cols-2 gap-3">
          <div><label class="text-[10px] font-black uppercase tracking-widest text-neutral-500">Previsto</label>
            <input id="fin-ce-prev" type="number" step="0.01" value="${Number(f.c.p)||0}" class="fin-acc-focus w-full mt-1.5 px-3 py-2.5 bg-neutral-950 border border-neutral-800 text-white num font-black"></div>
          <div><label class="text-[10px] font-black uppercase tracking-widest text-neutral-500">Realizado</label>
            <input id="fin-ce-real" type="number" step="0.01" value="${Number(f.c.r)||0}" class="fin-acc-focus w-full mt-1.5 px-3 py-2.5 bg-neutral-950 border border-neutral-800 text-white num font-black"></div>
        </div>
        <button onclick="finCustoEditSubmit('${catId}')" class="w-full py-3 fin-acc-solid text-[11px] font-black uppercase tracking-widest inline-flex items-center justify-center gap-2"><i data-lucide="save" class="w-4 h-4 stroke-[3]"></i>Salvar custo</button>
      </div>`;
    document.getElementById('fin-modal').classList.add('is-open');
    finIcons();
  }
  async function finCustoEditSubmit(catId) {
    const prev = parseFloat(document.getElementById('fin-ce-prev').value);
    const real = parseFloat(document.getElementById('fin-ce-real').value);
    if (isNaN(prev) || isNaN(real)) { finToast('Valores inválidos', 'warn'); return; }
    try { await finRpc('update_fin_custo', { p_id: catId, p_previsto: prev, p_realizado: real }); } catch (_) { return; }
    closeFinModal(); finToast('Custo atualizado', 'ok'); renderCustos();
  }

  /* ----------------------------------- PAINÉIS ESTRUTURAIS (fases) */
  const phasePanels = {}; // todas as abas viraram funcionais
  function phasePanelHTML(key) {
    const p = phasePanels[key];
    return `
      <div class="mb-5 flex items-start justify-between gap-3">
        <div>
          <div class="text-[10px] font-black uppercase tracking-[0.25em] fin-acc-strong mb-1">Financeiro · ${p.title}</div>
          <h1 class="text-2xl md:text-3xl font-black text-white tracking-tight">${p.title}</h1>
          <p class="text-neutral-500 text-sm font-medium mt-1 max-w-xl">${p.desc}</p>
        </div>
        <span class="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-[9px] font-black uppercase tracking-widest fin-acc-chip border border-[color:var(--fin-border-30)]"><i data-lucide="hammer" class="w-3 h-3"></i>${p.ph}</span>
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div class="metric-card p-5">
          <div class="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-300 mb-4">Subdivisões / status</div>
          <div class="flex flex-wrap gap-2">${p.sub.map(s=>`<span class="px-3 py-1.5 text-[10px] font-bold bg-neutral-950 border border-neutral-800 text-neutral-400">${s}</span>`).join('')}</div>
        </div>
        <div class="metric-card p-5">
          <div class="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-300 mb-4">Ações principais</div>
          <ul class="space-y-2">${p.acoes.map(a=>`<li class="flex items-start gap-2 text-sm text-neutral-300 font-medium"><i data-lucide="check" class="w-4 h-4 fin-acc shrink-0 mt-0.5"></i>${a}</li>`).join('')}</ul>
        </div>
      </div>
      <div class="mt-3 p-4 border border-dashed border-neutral-800 bg-neutral-900/20 text-center">
        <p class="text-[10px] font-bold uppercase tracking-widest text-neutral-600">Estrutura definida · interface detalhada prevista para a ${p.ph}</p>
      </div>`;
  }

  /* ====================================================== PANEL HTML */
  function visaoHTML() {
    return `
      <div class="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-5 stg stg-1">
        <div>
          <div class="text-[10px] font-black uppercase tracking-[0.25em] fin-acc-strong mb-1">Central · Financeiro</div>
          <h1 class="text-2xl md:text-3xl font-black text-white tracking-tight">Visão geral</h1>
        </div>
        <div class="flex items-center gap-2">
          <div class="hidden sm:flex items-center gap-2 px-3 py-2 bg-neutral-900/60 border border-neutral-800 text-[10px] font-black uppercase tracking-widest text-neutral-400">
            <i data-lucide="calendar" class="w-3.5 h-3.5 fin-acc"></i> <span id="fin-period-chip">—</span>
          </div>
          <button onclick="finLancamentoModal()" class="flex items-center gap-2 fin-acc-solid px-4 py-2.5 text-[10px] font-black uppercase tracking-widest transition-colors">
            <i data-lucide="plus" class="w-4 h-4 stroke-[3]"></i> Lançamento
          </button>
        </div>
      </div>

      <!-- Faturamento (gráfico estilo "ações") -->
      <div class="metric-card p-5 md:p-6 mb-3 stg stg-1">
        <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-5">
          <div>
            <div class="flex items-center gap-2 mb-2">
              <span class="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400">Faturamento</span>
              <span id="fat-delta" class="fin-acc-chip inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest"></span>
            </div>
            <div class="flex items-end gap-3">
              <span id="fat-total" class="text-3xl md:text-4xl font-black text-white tracking-tighter num leading-none">R$ —</span>
              <span class="text-[10px] font-bold uppercase tracking-widest text-neutral-600 pb-1">acumulado no período</span>
            </div>
            <div class="flex items-center gap-4 mt-3 text-[9px] font-bold uppercase tracking-widest text-neutral-500">
              <span class="flex items-center gap-1.5"><span class="w-3 h-[2px]" style="background:var(--fin-soft)"></span>Realizado</span>
              <span class="flex items-center gap-1.5"><span class="w-3 h-[2px]" style="background:var(--fin);border-top:2px dashed var(--fin)"></span>Projeção</span>
            </div>
          </div>
          <div id="fat-period" class="inline-flex gap-0.5 bg-neutral-900/70 p-0.5 border border-neutral-800 self-start shrink-0">
            <button class="fat-pbtn px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-neutral-500 transition-colors" data-p="6m">6M</button>
            <button class="fat-pbtn is-active px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-neutral-500 transition-colors" data-p="12m">12M</button>
            <button class="fat-pbtn px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-neutral-500 transition-colors" data-p="24m">24M</button>
          </div>
        </div>
        <div id="fat-chart" class="fat-wrap"></div>
        <div id="fat-xlabels" class="fat-xlabels"></div>
      </div>

      <!-- Hero + KPIs -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-3">
        <div class="fin-deep relative overflow-hidden p-6 lg:row-span-1 stg stg-1">
          <svg class="fin-contour absolute bottom-0 right-0 w-64 h-64 pointer-events-none" viewBox="0 0 300 300" fill="none" stroke-width="1.5">
            <circle cx="300" cy="300" r="36"/><circle cx="300" cy="300" r="58"/><circle cx="300" cy="300" r="80"/><circle cx="300" cy="300" r="102"/><circle cx="300" cy="300" r="124"/><circle cx="300" cy="300" r="146"/><circle cx="300" cy="300" r="168"/><circle cx="300" cy="300" r="190"/><circle cx="300" cy="300" r="212"/>
          </svg>
          <div class="relative">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3">
                <div class="fin-deep-icon w-10 h-10 grid place-items-center"><i data-lucide="landmark" class="w-4 h-4"></i></div>
                <span class="fin-deep-label text-[10px] font-black uppercase tracking-[0.18em]">Saldo a receber</span>
              </div>
              <span class="fin-deep-label w-9 h-9 grid place-items-center bg-white/5 cursor-pointer hover:bg-white/10 transition-colors" onclick="setTab('recebiveis')"><i data-lucide="arrow-up-right" class="w-4 h-4 stroke-[2.5]"></i></span>
            </div>
            <div id="fin-hero-saldo" class="text-white font-black text-4xl md:text-5xl tracking-tighter leading-none mt-6 num">R$ —</div>
            <div class="flex flex-wrap gap-2 mt-6">
              <span class="fin-deep-pill inline-flex items-center gap-2 px-3 py-2 text-[9px] font-black uppercase tracking-widest"><i data-lucide="file-text" class="w-3 h-3"></i><span id="fin-hero-abertos">— títulos em aberto</span></span>
            </div>
          </div>
        </div>

        <div class="lg:col-span-2 grid grid-cols-2 gap-3">
          <div class="metric-card p-5 stg stg-2">
            <div class="flex items-center justify-between mb-3">
              <span class="text-[9px] font-black uppercase tracking-[0.18em] text-neutral-500">Recebido no mês</span>
              <i data-lucide="circle-check-big" class="w-4 h-4 text-emerald-400"></i>
            </div>
            <div id="fin-kpi-recebido" class="text-2xl font-black text-white num">R$ —</div>
            <div id="fin-kpi-recebido-delta" class="text-[10px] font-bold text-emerald-400 mt-1.5"></div>
            <svg id="spark-recebido" class="spark" viewBox="0 0 100 30" preserveAspectRatio="none"></svg>
          </div>
          <div class="metric-card p-5 stg stg-2">
            <div class="flex items-center justify-between mb-3">
              <span class="text-[9px] font-black uppercase tracking-[0.18em] text-neutral-500">A vencer · 30d</span>
              <i data-lucide="hourglass" class="w-4 h-4 text-yellow-400"></i>
            </div>
            <div id="fin-kpi-avencer" class="text-2xl font-black text-white num">R$ —</div>
            <div id="fin-kpi-avencer-sub" class="text-[10px] font-bold text-yellow-400 mt-1.5">— títulos</div>
            <svg id="spark-avencer" class="spark" viewBox="0 0 100 30" preserveAspectRatio="none"></svg>
          </div>
          <div class="metric-card p-5 stg stg-3">
            <div class="flex items-center justify-between mb-3">
              <span class="text-[9px] font-black uppercase tracking-[0.18em] text-neutral-500">Vencido</span>
              <i data-lucide="alert-triangle" class="w-4 h-4 text-red-400"></i>
            </div>
            <div id="fin-kpi-vencido" class="text-2xl font-black text-white num">R$ —</div>
            <div id="fin-kpi-vencido-sub" class="text-[10px] font-bold text-red-400 mt-1.5">— inadimplentes</div>
            <svg id="spark-vencido" class="spark" viewBox="0 0 100 30" preserveAspectRatio="none"></svg>
          </div>
          <div class="metric-card p-5 stg stg-3">
            <div class="flex items-center justify-between mb-3">
              <span class="text-[9px] font-black uppercase tracking-[0.18em] text-neutral-500">Comissões a pagar</span>
              <i data-lucide="users" class="w-4 h-4 fin-acc"></i>
            </div>
            <div id="fin-kpi-comissoes" class="text-2xl font-black text-white num">R$ —</div>
            <div id="fin-kpi-comissoes-sub" class="text-[10px] font-bold fin-acc mt-1.5">— comissões</div>
            <svg id="spark-comissoes" class="spark" viewBox="0 0 100 30" preserveAspectRatio="none"></svg>
          </div>
        </div>
      </div>

      <!-- Precisam de ação -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
        <div class="metric-card p-4 flex items-center gap-3 stg stg-3">
          <div class="w-10 h-10 grid place-items-center bg-yellow-500/10 text-yellow-400 border border-yellow-500/25 shrink-0"><i data-lucide="check-square" class="w-5 h-5"></i></div>
          <div class="min-w-0">
            <div class="text-[9px] font-black uppercase tracking-widest text-neutral-500">Pagamentos a aprovar</div>
            <div id="fin-acao-pag" class="text-sm font-black text-white num">—</div>
          </div>
        </div>
        <div class="metric-card p-4 flex items-center gap-3 stg stg-4">
          <div class="w-10 h-10 grid place-items-center bg-red-500/10 text-red-400 border border-red-500/25 shrink-0"><i data-lucide="bell-ring" class="w-5 h-5"></i></div>
          <div class="min-w-0">
            <div class="text-[9px] font-black uppercase tracking-widest text-neutral-500">Cobranças vencidas</div>
            <div id="fin-acao-cob" class="text-sm font-black text-white num">—</div>
          </div>
        </div>
        <div class="metric-card p-4 flex items-center gap-3 stg stg-4">
          <div class="w-10 h-10 grid place-items-center fin-acc-chip border border-[color:var(--fin-border-30)] shrink-0"><i data-lucide="hand-coins" class="w-5 h-5"></i></div>
          <div class="min-w-0">
            <div class="text-[9px] font-black uppercase tracking-widest text-neutral-500">Comissões a liberar</div>
            <div id="fin-acao-com" class="text-sm font-black text-white num">—</div>
          </div>
        </div>
      </div>

      <!-- Posição de caixa -->
      <div class="fin-deep relative overflow-hidden p-5 md:p-6 mb-3 stg stg-4">
        <svg class="fin-contour absolute top-0 right-0 w-56 h-56 pointer-events-none" viewBox="0 0 300 300" fill="none" stroke-width="1.5">
          <circle cx="300" cy="0" r="40"/><circle cx="300" cy="0" r="64"/><circle cx="300" cy="0" r="88"/><circle cx="300" cy="0" r="112"/><circle cx="300" cy="0" r="136"/><circle cx="300" cy="0" r="160"/><circle cx="300" cy="0" r="184"/>
        </svg>
        <div class="relative grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
          <div class="md:col-span-4">
            <div class="flex items-center gap-2.5 mb-3">
              <div class="fin-deep-icon w-9 h-9 grid place-items-center"><i data-lucide="wallet" class="w-4 h-4"></i></div>
              <span class="fin-deep-label text-[10px] font-black uppercase tracking-[0.18em]">Projeção de caixa · 30 dias</span>
            </div>
            <div id="fin-cx-net" class="text-white font-black text-3xl md:text-4xl tracking-tighter leading-none num">R$ —</div>
            <div class="fin-deep-pill inline-flex items-center gap-2 px-3 py-1.5 text-[9px] font-black uppercase tracking-widest mt-3"><i data-lucide="trending-up" class="w-3 h-3"></i>Líquido previsto · entradas − saídas</div>
          </div>
          <div class="md:col-span-8 grid grid-cols-3 gap-3">
            <div class="bg-black/25 border border-[color:var(--fin-deep-border)] p-3.5">
              <div class="fin-deep-label text-[8px] font-black uppercase tracking-widest opacity-80">Entradas previstas · 30d</div>
              <div id="fin-cx-entradas" class="text-emerald-400 font-black text-lg mt-1.5 num">—</div>
            </div>
            <div class="bg-black/25 border border-[color:var(--fin-deep-border)] p-3.5">
              <div class="fin-deep-label text-[8px] font-black uppercase tracking-widest opacity-80">Saídas previstas · 30d</div>
              <div id="fin-cx-saidas" class="text-red-400 font-black text-lg mt-1.5 num">—</div>
            </div>
            <div class="bg-black/25 border border-[color:var(--fin-deep-border)] p-3.5">
              <div class="fin-deep-label text-[8px] font-black uppercase tracking-widest opacity-80">A receber · total</div>
              <div id="fin-cx-areceber" class="text-white font-black text-lg mt-1.5 num">—</div>
            </div>
          </div>
        </div>
      </div>

      <!-- DRE resumido + Aging -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-3">
        <div class="metric-card p-5 stg stg-4">
          <div class="flex items-center justify-between mb-5">
            <span class="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-300">DRE resumido</span>
            <button onclick="setTab('dre')" class="text-[9px] font-black uppercase tracking-widest fin-acc hover:text-white transition-colors flex items-center gap-1">Abrir DRE <i data-lucide="chevron-right" class="w-3 h-3"></i></button>
          </div>
          <div id="dre-inline" class="space-y-3"></div>
        </div>

        <div class="metric-card p-5 stg stg-4">
          <div class="flex items-center justify-between mb-5">
            <span class="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-300">Funil de recebíveis · aging</span>
            <span id="fin-aging-total" class="text-[9px] font-bold uppercase tracking-widest text-neutral-500">—</span>
          </div>
          <div id="fin-aging" class="space-y-4"></div>
        </div>
      </div>

      <!-- Risco financeiro + Margem -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-3">
        <div class="metric-card p-5 lg:col-span-2 stg stg-5">
          <div class="flex items-center justify-between mb-4">
            <span class="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-300">Projetos em risco financeiro</span>
            <span id="fin-risco-count" class="text-[9px] font-bold uppercase tracking-widest text-red-400">—</span>
          </div>
          <div id="fin-risco" class="space-y-2"></div>
        </div>

        <div class="metric-card p-5 flex flex-col stg stg-5">
          <span class="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-300 mb-4">Margem média</span>
          <div class="flex-1 flex flex-col items-center justify-center">
            <div class="relative w-32 h-32">
              <svg viewBox="0 0 120 120" class="w-full h-full -rotate-90">
                <circle cx="60" cy="60" r="50" fill="none" stroke="#1f1f1f" stroke-width="12"/>
                <circle id="fin-margem-arc" cx="60" cy="60" r="50" fill="none" stroke="var(--fin)" stroke-width="12" stroke-dasharray="314" stroke-dashoffset="314" stroke-linecap="butt"/>
              </svg>
              <div class="absolute inset-0 grid place-items-center">
                <div class="text-center"><div id="fin-margem-val" class="text-2xl font-black text-white num">—</div><div class="text-[9px] font-bold uppercase tracking-widest text-neutral-500">consolidado</div></div>
              </div>
            </div>
            <div id="fin-margem-meta" class="text-[10px] font-bold text-neutral-500 mt-3 text-center">todos os projetos</div>
          </div>
        </div>
      </div>

      <!-- Recebíveis recentes -->
      <div class="metric-card stg stg-6">
        <div class="flex items-center justify-between px-5 py-4 border-b border-neutral-800">
          <span class="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-300">Recebíveis recentes</span>
          <button onclick="setTab('recebiveis')" class="text-[10px] font-black uppercase tracking-widest fin-acc hover:text-white transition-colors flex items-center gap-1">Ver todos <i data-lucide="chevron-right" class="w-3.5 h-3.5"></i></button>
        </div>
        <div class="overflow-x-auto no-scrollbar">
          <table class="w-full text-left">
            <thead><tr class="text-[9px] font-black uppercase tracking-widest text-neutral-600 border-b border-neutral-800">
              <th class="px-5 py-2.5">Cliente</th><th class="px-3 py-2.5">Documento</th><th class="px-3 py-2.5">Vencimento</th><th class="px-3 py-2.5 text-right">Valor</th><th class="px-5 py-2.5 text-right">Status</th>
            </tr></thead>
            <tbody id="recentes-body" class="text-sm"></tbody>
          </table>
        </div>
      </div>`;
  }

  function funilHTML() {
    return `
      <div class="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-5">
        <div>
          <div class="text-[10px] font-black uppercase tracking-[0.25em] fin-acc-strong mb-1">Financeiro · Funil</div>
          <h1 class="text-2xl md:text-3xl font-black text-white tracking-tight">Funil financeiro</h1>
          <p class="text-neutral-500 text-sm font-medium mt-1">Fluxo operacional do projeto — do contrato à liberação financeira.</p>
        </div>
        <div class="hidden sm:flex items-center flex-wrap gap-x-3 gap-y-1.5 px-3 py-2 bg-neutral-900/60 border border-neutral-800 text-[10px] font-black uppercase tracking-widest text-neutral-400">
          <span class="flex items-center gap-1.5"><span class="w-2 h-2 bg-emerald-400"></span>Saudável</span>
          <span class="flex items-center gap-1.5"><span class="w-2 h-2 bg-yellow-400"></span>Atenção</span>
          <span class="flex items-center gap-1.5"><span class="w-2 h-2 bg-red-400"></span>Crítico</span>
          <span class="flex items-center gap-1.5"><span class="w-2 h-2 bg-neutral-500"></span>Bloqueado</span>
        </div>
      </div>
      <div id="funil-board" class="flex gap-3 overflow-x-auto pb-4 no-scrollbar"></div>`;
  }

  function recebiveisHTML() {
    return `
      <div class="mb-5">
        <div class="text-[10px] font-black uppercase tracking-[0.25em] fin-acc-strong mb-1">Financeiro · Recebíveis</div>
        <h1 class="text-2xl md:text-3xl font-black text-white tracking-tight">Gestão de títulos</h1>
      </div>
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <div class="metric-card p-4"><div class="text-[9px] font-black uppercase tracking-widest text-neutral-500">Em aberto</div><div class="text-xl font-black text-white mt-2 num">R$ 487.320</div></div>
        <div class="metric-card p-4"><div class="text-[9px] font-black uppercase tracking-widest text-neutral-500">A vencer</div><div class="text-xl font-black text-yellow-400 mt-2 num">R$ 211.450</div></div>
        <div class="metric-card p-4"><div class="text-[9px] font-black uppercase tracking-widest text-neutral-500">Vencido</div><div class="text-xl font-black text-red-400 mt-2 num">R$ 38.770</div></div>
        <div class="metric-card p-4"><div class="text-[9px] font-black uppercase tracking-widest text-neutral-500">Recebido / mês</div><div class="text-xl font-black text-emerald-400 mt-2 num">R$ 162.900</div></div>
      </div>
      <div class="flex flex-col sm:flex-row gap-3 mb-4">
        <div class="relative flex-1">
          <i data-lucide="search" class="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-600"></i>
          <input type="text" placeholder="BUSCAR CLIENTE OU DOCUMENTO..." class="fin-acc-focus w-full pl-10 pr-4 py-3 bg-neutral-900 border border-neutral-800 text-white placeholder:text-neutral-600 text-[11px] font-bold uppercase tracking-wide transition-colors">
        </div>
        <div class="flex gap-1 overflow-x-auto no-scrollbar" id="rec-filters">
          <button class="rec-filter is-active shrink-0 px-3.5 py-3 text-[10px] font-black uppercase tracking-widest border border-neutral-800" data-f="todos">Todos</button>
          <button class="rec-filter shrink-0 px-3.5 py-3 text-[10px] font-black uppercase tracking-widest border border-neutral-800 text-neutral-400 hover:text-white transition-colors" data-f="avencer">A vencer</button>
          <button class="rec-filter shrink-0 px-3.5 py-3 text-[10px] font-black uppercase tracking-widest border border-neutral-800 text-neutral-400 hover:text-white transition-colors" data-f="vencido">Vencido</button>
          <button class="rec-filter shrink-0 px-3.5 py-3 text-[10px] font-black uppercase tracking-widest border border-neutral-800 text-neutral-400 hover:text-white transition-colors" data-f="pago">Pago</button>
        </div>
      </div>
      <div class="metric-card hidden md:block">
        <div class="overflow-x-auto no-scrollbar">
          <table class="w-full text-left">
            <thead><tr class="text-[9px] font-black uppercase tracking-widest text-neutral-600 border-b border-neutral-800">
              <th class="px-5 py-3">Cliente / Projeto</th><th class="px-3 py-3">Documento</th><th class="px-3 py-3">Emissão</th><th class="px-3 py-3">Vencimento</th><th class="px-3 py-3 text-right">Valor</th><th class="px-3 py-3 text-center">Status</th><th class="px-5 py-3 text-right">Ação</th>
            </tr></thead>
            <tbody id="rec-table" class="text-sm"></tbody>
          </table>
        </div>
      </div>
      <div id="rec-cards" class="md:hidden space-y-2"></div>`;
  }

  function comissoesBodyHTML() {
    return `
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <div class="metric-card p-4"><div class="text-[9px] font-black uppercase tracking-widest text-neutral-500">A liberar</div><div class="text-xl font-black fin-acc mt-2 num">R$ 24.180</div></div>
        <div class="metric-card p-4"><div class="text-[9px] font-black uppercase tracking-widest text-neutral-500">Pago no mês</div><div class="text-xl font-black text-emerald-400 mt-2 num">R$ 31.640</div></div>
        <div class="metric-card p-4"><div class="text-[9px] font-black uppercase tracking-widest text-neutral-500">Parceiros ativos</div><div class="text-xl font-black text-white mt-2 num">12</div></div>
        <div class="metric-card p-4"><div class="text-[9px] font-black uppercase tracking-widest text-neutral-500">% médio</div><div class="text-xl font-black text-white mt-2 num">4,8%</div></div>
      </div>
      <div class="metric-card hidden md:block">
        <div class="overflow-x-auto no-scrollbar"><table class="w-full text-left">
          <thead><tr class="text-[9px] font-black uppercase tracking-widest text-neutral-600 border-b border-neutral-800">
            <th class="px-5 py-3">Parceiro</th><th class="px-3 py-3">Cliente</th><th class="px-3 py-3 text-right">Base</th><th class="px-3 py-3 text-center">%</th><th class="px-3 py-3 text-right">Comissão</th><th class="px-3 py-3 text-center">Status</th><th class="px-5 py-3 text-center">Ação</th>
          </tr></thead>
          <tbody id="com-table" class="text-sm"></tbody>
        </table></div>
      </div>
      <div id="com-cards" class="md:hidden space-y-2"></div>`;
  }

  function orcamentosHTML() {
    return `
      <div class="mb-5">
        <div class="text-[10px] font-black uppercase tracking-[0.25em] fin-acc-strong mb-1">Financeiro · Orçamentos</div>
        <h1 class="text-2xl md:text-3xl font-black text-white tracking-tight">Orçamentos &amp; margem</h1>
      </div>
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <div class="metric-card p-4"><div class="text-[9px] font-black uppercase tracking-widest text-neutral-500">Em aberto</div><div class="text-xl font-black text-white mt-2 num">18</div></div>
        <div class="metric-card p-4"><div class="text-[9px] font-black uppercase tracking-widest text-neutral-500">Valor total</div><div class="text-xl font-black text-white mt-2 num">R$ 1,94 mi</div></div>
        <div class="metric-card p-4"><div class="text-[9px] font-black uppercase tracking-widest text-neutral-500">Margem média</div><div class="text-xl font-black fin-acc mt-2 num">21,4%</div></div>
        <div class="metric-card p-4"><div class="text-[9px] font-black uppercase tracking-widest text-neutral-500">Abaixo do mínimo</div><div class="text-xl font-black text-red-400 mt-2 num">3</div></div>
      </div>
      <div id="orc-grid" class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3"></div>`;
  }

  function precificacaoHTML() {
    return `
      <div class="mb-5">
        <div class="text-[10px] font-black uppercase tracking-[0.25em] fin-acc-strong mb-1">Financeiro · Precificação</div>
        <h1 class="text-2xl md:text-3xl font-black text-white tracking-tight">Calculadora de precificação</h1>
        <p class="text-neutral-500 text-sm font-medium mt-1">Mesma conta da planilha do contábil — preencha os custos e o valor da venda; imposto, comissão e royalties saem automáticos.</p>
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div class="metric-card p-5 lg:col-span-2">
          <div class="flex items-center justify-between mb-3">
            <span class="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-300">Custos da obra</span>
            <input id="fin-pc-cli" type="text" placeholder="Cliente (opcional)" class="fin-acc-focus px-3 py-1.5 bg-neutral-950 border border-neutral-800 text-white text-[11px] font-bold w-48 max-w-[55%]">
          </div>
          <div id="prec-rows" class="divide-y divide-neutral-800/70"></div>
        </div>
        <div class="flex flex-col gap-3">
          <div class="fin-deep relative overflow-hidden p-5">
            <div class="fin-deep-label text-[10px] font-black uppercase tracking-[0.18em] mb-2">Lucro líquido</div>
            <div id="prec-r-lucro" class="text-white font-black text-3xl tracking-tighter num">R$ —</div>
            <div id="prec-r-margem" class="fin-deep-pill inline-flex items-center gap-2 px-3 py-2 text-[10px] font-black uppercase tracking-widest mt-3">Margem —</div>
            <div id="prec-r-total" class="text-[10px] font-bold text-neutral-400 num mt-3">Total de custos: —</div>
          </div>
          <div class="metric-card p-5">
            <div class="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-300 mb-3">Preço p/ margem-alvo</div>
            <label class="text-[9px] font-black uppercase tracking-widest text-neutral-500">Margem desejada (%)</label>
            <input id="fin-pc-alvo" type="number" step="0.1" class="fin-acc-focus w-full mt-1.5 px-3 py-2.5 bg-neutral-950 border border-neutral-800 text-white num font-black">
            <button onclick="finPrecSugerir()" class="w-full mt-3 py-2.5 fin-acc-solid text-[10px] font-black uppercase tracking-widest inline-flex items-center justify-center gap-2"><i data-lucide="wand-2" class="w-3.5 h-3.5"></i>Calcular preço de venda</button>
            <div id="prec-sug" class="hidden text-[11px] text-neutral-400 font-bold mt-3"></div>
          </div>
        </div>
      </div>`;
  }
  // Linhas da calculadora: editáveis (custo direto) + automáticas (fórmula). Espelha a planilha.
  const FIN_PREC_DIRETOS = [
    { k:'kit',        l:'Kit fotovoltaico' },
    { k:'projeto',    l:'Projeto c/ ART' },
    { k:'instalacao', l:'Instalação' },
    { k:'eletrica',   l:'Elétrica' },
    { k:'placas',     l:'Placas de advertência' },
    { k:'ajuda',      l:'Ajuda de custo instalação' },
    { k:'vistoria',   l:'Vistoria' },
    { k:'outros',     l:'Outros custos' },
  ];

  function parcelamentosHTML() {
    return `
      <div class="mb-5">
        <div class="text-[10px] font-black uppercase tracking-[0.25em] fin-acc-strong mb-1">Financeiro · Parcelamentos</div>
        <h1 class="text-2xl md:text-3xl font-black text-white tracking-tight">Planos de parcelamento</h1>
      </div>
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <div class="metric-card p-4"><div class="text-[9px] font-black uppercase tracking-widest text-neutral-500">Planos ativos</div><div class="text-xl font-black text-white mt-2 num">22</div></div>
        <div class="metric-card p-4"><div class="text-[9px] font-black uppercase tracking-widest text-neutral-500">Saldo financiado</div><div class="text-xl font-black text-white mt-2 num">R$ 612.400</div></div>
        <div class="metric-card p-4"><div class="text-[9px] font-black uppercase tracking-widest text-neutral-500">Próx. 30d</div><div class="text-xl font-black fin-acc mt-2 num">R$ 84.900</div></div>
        <div class="metric-card p-4"><div class="text-[9px] font-black uppercase tracking-widest text-neutral-500">Em atraso</div><div class="text-xl font-black text-red-400 mt-2 num">2</div></div>
      </div>
      <div id="parc-grid" class="grid grid-cols-1 md:grid-cols-2 gap-3"></div>`;
  }

  function dreHTML() {
    return `
      <div class="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-4">
        <div>
          <div class="text-[10px] font-black uppercase tracking-[0.25em] fin-acc-strong mb-1">Financeiro · DRE por obra</div>
          <h1 class="text-2xl md:text-3xl font-black text-white tracking-tight inline-flex items-center gap-2">Resultado da obra<span id="dre-sim-badge" class="hidden px-2 py-0.5 text-[9px] font-black uppercase tracking-widest fin-acc-chip border border-[color:var(--fin-border-30)] align-middle">Simulação</span></h1>
        </div>
        <div class="flex items-center gap-2">
          <button id="dre-sim-toggle" onclick="finDreToggleSim()" class="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest border border-neutral-800 bg-neutral-900/60 text-neutral-400 inline-flex items-center gap-1.5"><i data-lucide="sliders-horizontal" class="w-3.5 h-3.5"></i>Simular</button>
          <div id="dre-period" class="flex items-center gap-1 bg-neutral-900/60 border border-neutral-800 p-1">
            <button data-p="mes"  class="dre-per px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-neutral-400">Mês</button>
            <button data-p="ano"  class="dre-per px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-neutral-400">Ano</button>
            <button data-p="tudo" class="dre-per px-3 py-1.5 text-[10px] font-black uppercase tracking-widest fin-acc-solid">Tudo</button>
          </div>
        </div>
      </div>
      <div class="metric-card p-3 mb-3 flex flex-col sm:flex-row sm:items-center gap-3">
        <div class="flex items-center gap-2 flex-1 min-w-0">
          <span class="text-[9px] font-black uppercase tracking-widest text-neutral-600 shrink-0">Obra / venda:</span>
          <select id="dre-obra-select" onchange="finDrePickObra(this.value)" class="fin-acc-focus flex-1 min-w-0 px-3 py-2 bg-neutral-950 border border-neutral-800 text-white text-[12px] font-bold">
            <option value="">Consolidado (todas as obras)</option>
          </select>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <span class="text-[9px] font-black uppercase tracking-widest text-neutral-600">Escopo:</span>
          <span id="dre-obra-current" class="text-[11px] font-black fin-acc">Consolidado (todas as obras)</span>
        </div>
      </div>
      <div id="dre-sim-panel" class="hidden metric-card p-3 mb-3 border-[color:var(--fin-border-30)] flex items-center justify-between gap-3 flex-wrap">
        <span class="text-[11px] text-neutral-300 font-bold inline-flex items-center gap-2"><i data-lucide="calculator" class="w-4 h-4 fin-acc shrink-0"></i>Modo simulação — edite qualquer valor na cascata abaixo; os totais recalculam sozinhos. Nada é gravado no sistema.</span>
        <div class="flex items-center gap-2 shrink-0">
          <button onclick="finDreSaveScenario()" class="px-2.5 py-1.5 text-[9px] font-black uppercase tracking-widest border border-neutral-800 bg-neutral-900 text-neutral-300 hover:text-white inline-flex items-center gap-1"><i data-lucide="save" class="w-3 h-3"></i>Salvar cenário</button>
          <button onclick="finDreClearSim()" class="px-2.5 py-1.5 text-[9px] font-black uppercase tracking-widest border border-neutral-800 bg-neutral-900 text-neutral-300 hover:text-red-400 inline-flex items-center gap-1"><i data-lucide="eraser" class="w-3 h-3"></i>Limpar</button>
        </div>
      </div>
      <div class="metric-card p-4 mb-3 flex items-start gap-3 border-[color:var(--fin-border-30)]">
        <div class="w-9 h-9 grid place-items-center fin-acc-chip shrink-0"><i data-lucide="calculator" class="w-4 h-4"></i></div>
        <div class="text-[11px] text-neutral-400 font-medium leading-relaxed">DRE <span class="text-white font-bold">por obra/venda</span> (como a planilha do contábil) — escolha a obra acima, ou veja o consolidado. Modelo: imposto <span class="text-white font-bold">18%</span> sobre (venda − kit), comissão <span class="text-white font-bold">10%</span> e royalties + fundo <span class="text-white font-bold">4,5%</span> sobre a venda; custos diretos vêm dos lançamentos. <span class="fin-acc font-bold">Clique em "Simular"</span> para editar qualquer valor direto na cascata (estilo planilha) sem alterar nada de verdade. "Recebido" é o caixa real da obra.</div>
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-3">
        <div class="metric-card p-5"><div class="text-[9px] font-black uppercase tracking-widest text-neutral-500">Receita bruta</div><div id="dre-k-receita" class="text-2xl font-black text-white mt-2 num">—</div><div id="dre-k-recebido" class="text-[10px] font-bold text-neutral-500 num mt-1">Recebido (caixa) —</div></div>
        <div class="metric-card p-5"><div class="text-[9px] font-black uppercase tracking-widest text-neutral-500">Total de custos</div><div id="dre-k-custos" class="text-2xl font-black fin-acc mt-2 num">—</div></div>
        <div class="fin-deep p-5"><div class="fin-deep-label text-[9px] font-black uppercase tracking-widest">Lucro líquido</div><div id="dre-k-lucro" class="text-2xl font-black text-white mt-2 num">—</div><div id="dre-k-margem" class="fin-deep-pill inline-flex px-2.5 py-1 text-[9px] font-black uppercase tracking-widest mt-3">—</div></div>
      </div>
      <div class="metric-card mb-3">
        <div class="px-5 py-4 border-b border-neutral-800"><span class="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-300">Cascata do resultado</span></div>
        <div id="dre-rows" class="divide-y divide-neutral-800/70"></div>
      </div>
      <div id="dre-por-obra-card" class="metric-card">
        <div class="px-5 py-4 border-b border-neutral-800 flex items-center justify-between">
          <span class="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-300">Resultado por obra</span>
          <span class="text-[9px] font-bold uppercase tracking-widest text-neutral-500">Clique p/ abrir · Venda · Lucro · Margem</span>
        </div>
        <div id="dre-projetos" class="divide-y divide-neutral-800/70"></div>
      </div>`;
  }

  function pagamentosHTML() {
    return `
      <div class="mb-5">
        <div class="text-[10px] font-black uppercase tracking-[0.25em] fin-acc-strong mb-1">Financeiro · Pagamentos</div>
        <h1 class="text-2xl md:text-3xl font-black text-white tracking-tight">Pagamentos &amp; comissões</h1>
        <p class="text-neutral-500 text-sm font-medium mt-1">Saídas do financeiro — conferência de comprovantes e repasse a parceiros.</p>
      </div>
      <div id="pag-subtabs" class="flex gap-5 mb-6 border-b border-neutral-800">
        <button class="fin-subtab flex items-center gap-2 pb-2.5 text-[11px] font-black uppercase tracking-widest" data-sub="conferencia"><i data-lucide="credit-card" class="w-3.5 h-3.5"></i>Conferência</button>
        <button class="fin-subtab flex items-center gap-2 pb-2.5 text-[11px] font-black uppercase tracking-widest" data-sub="comissoes"><i data-lucide="users" class="w-3.5 h-3.5"></i>Comissões</button>
      </div>
      <div id="fin-pag-body"></div>`;
  }

  function pagConferenciaHTML() {
    return `
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div class="metric-card">
          <div class="flex items-center justify-between px-5 py-4 border-b border-neutral-800">
            <span class="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-300 inline-flex items-center gap-2"><i data-lucide="arrow-down-left" class="w-3.5 h-3.5 text-emerald-400"></i>Recebimentos a conferir</span>
          </div>
          <div id="fin-receb" class="divide-y divide-neutral-800/60"></div>
        </div>
        <div class="metric-card">
          <div class="flex items-center justify-between px-5 py-4 border-b border-neutral-800">
            <span class="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-300 inline-flex items-center gap-2"><i data-lucide="arrow-up-right" class="w-3.5 h-3.5 text-red-400"></i>Contas a pagar</span>
            <button onclick="finNovoPagamento()" class="text-[9px] font-black uppercase tracking-widest fin-acc hover:text-white transition-colors inline-flex items-center gap-1"><i data-lucide="plus" class="w-3 h-3"></i>Novo</button>
          </div>
          <div id="fin-apagar" class="divide-y divide-neutral-800/60"></div>
        </div>
      </div>`;
  }

  function ordemcompraHTML() {
    return `
      <div class="mb-5">
        <div class="text-[10px] font-black uppercase tracking-[0.25em] fin-acc-strong mb-1">Financeiro · Ordem de Compra</div>
        <h1 class="text-2xl md:text-3xl font-black text-white tracking-tight">Compra do kit</h1>
        <p class="text-neutral-500 text-sm font-medium mt-1">Orçamento, aprovação e compra do kit fotovoltaico junto ao fornecedor.</p>
      </div>
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <div class="metric-card p-4"><div class="text-[9px] font-black uppercase tracking-widest text-neutral-500">Aguardando aprovação</div><div class="text-xl font-black text-yellow-400 mt-2 num">3</div></div>
        <div class="metric-card p-4"><div class="text-[9px] font-black uppercase tracking-widest text-neutral-500">Aprovado p/ compra</div><div class="text-xl font-black fin-acc mt-2 num">2</div></div>
        <div class="metric-card p-4"><div class="text-[9px] font-black uppercase tracking-widest text-neutral-500">Comprado / mês</div><div class="text-xl font-black text-emerald-400 mt-2 num">9</div></div>
        <div class="metric-card p-4"><div class="text-[9px] font-black uppercase tracking-widest text-neutral-500">Valor em kits</div><div class="text-xl font-black text-white mt-2 num">R$ 384.500</div></div>
      </div>
      <div class="metric-card p-4 mb-4 flex items-start gap-3 border-[color:var(--fin-border-30)]">
        <div class="w-9 h-9 grid place-items-center fin-acc-chip shrink-0"><i data-lucide="workflow" class="w-4 h-4"></i></div>
        <div class="text-[11px] text-neutral-400 font-medium leading-relaxed">Ao marcar uma ordem como <span class="text-white font-bold">Comprado</span>, o sistema move o projeto para <span class="text-white font-bold">Kit Comprado</span> no funil e dispara <span class="fin-acc font-bold">Emissão de Laudo</span> no módulo Vistoria.</div>
      </div>
      <div class="flex gap-1 overflow-x-auto no-scrollbar mb-4" id="oc-filters">
        <button class="oc-filter is-active shrink-0 px-3.5 py-2.5 text-[10px] font-black uppercase tracking-widest border border-neutral-800" data-f="todos">Todos</button>
        <button class="oc-filter shrink-0 px-3.5 py-2.5 text-[10px] font-black uppercase tracking-widest border border-neutral-800 text-neutral-400 hover:text-white transition-colors" data-f="aprovar">Aguard. aprovação</button>
        <button class="oc-filter shrink-0 px-3.5 py-2.5 text-[10px] font-black uppercase tracking-widest border border-neutral-800 text-neutral-400 hover:text-white transition-colors" data-f="aprovado">Aprovado</button>
        <button class="oc-filter shrink-0 px-3.5 py-2.5 text-[10px] font-black uppercase tracking-widest border border-neutral-800 text-neutral-400 hover:text-white transition-colors" data-f="comprado">Comprado</button>
        <button class="oc-filter shrink-0 px-3.5 py-2.5 text-[10px] font-black uppercase tracking-widest border border-neutral-800 text-neutral-400 hover:text-white transition-colors" data-f="orcamento">Sem orçamento</button>
      </div>
      <div id="oc-grid" class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3"></div>`;
  }

  function custosHTML() {
    return `
      <div class="mb-5">
        <div class="text-[10px] font-black uppercase tracking-[0.25em] fin-acc-strong mb-1">Financeiro · Custos por Projeto</div>
        <h1 class="text-2xl md:text-3xl font-black text-white tracking-tight">Previsto × realizado</h1>
        <p class="text-neutral-500 text-sm font-medium mt-1">Custo planejado contra o efetivo, por categoria — alimenta a margem realizada e a DRE futura.</p>
      </div>
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <div class="metric-card p-4"><div class="text-[9px] font-black uppercase tracking-widest text-neutral-500">Custo previsto</div><div class="text-xl font-black text-white mt-2 num" id="cst-prev">—</div></div>
        <div class="metric-card p-4"><div class="text-[9px] font-black uppercase tracking-widest text-neutral-500">Custo realizado</div><div class="text-xl font-black text-white mt-2 num" id="cst-real">—</div></div>
        <div class="metric-card p-4"><div class="text-[9px] font-black uppercase tracking-widest text-neutral-500">Desvio</div><div class="text-xl font-black mt-2 num" id="cst-desvio">—</div></div>
        <div class="metric-card p-4"><div class="text-[9px] font-black uppercase tracking-widest text-neutral-500">Projetos em risco</div><div class="text-xl font-black text-red-400 mt-2 num" id="cst-risco">—</div></div>
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-3">
        <div class="metric-card p-5 lg:col-span-2">
          <div class="flex items-center justify-between gap-2 mb-4">
            <span class="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-300">Detalhe por categoria</span>
            <div class="flex items-center gap-3 min-w-0">
              <span id="cst-selname" class="text-[11px] font-black text-white truncate"></span>
              <button onclick="finNovoCusto()" class="shrink-0 text-[9px] font-black uppercase tracking-widest fin-acc hover:text-white transition-colors inline-flex items-center gap-1"><i data-lucide="plus" class="w-3 h-3"></i>Custo</button>
            </div>
          </div>
          <div class="relative mb-5" id="cst-combo">
            <i data-lucide="search" class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-600 pointer-events-none"></i>
            <input id="cst-search" type="text" autocomplete="off" placeholder="BUSCAR PROJETO OU CLIENTE..."
              oninput="finCustoSearch(this.value)" onfocus="finCustoOpenResults()"
              class="fin-acc-focus w-full pl-10 pr-9 py-2.5 bg-neutral-950 border border-neutral-800 text-white placeholder:text-neutral-600 text-[11px] font-bold uppercase tracking-wide transition-colors">
            <button type="button" onclick="finCustoToggleResults(event)" class="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 grid place-items-center text-neutral-500 hover:text-white"><i data-lucide="chevron-down" class="w-4 h-4"></i></button>
            <div id="cst-results" class="hidden absolute z-30 left-0 right-0 mt-1 max-h-56 overflow-y-auto custom-scrollbar bg-neutral-950 border border-neutral-800 shadow-2xl"></div>
          </div>
          <div id="cst-breakdown"></div>
        </div>
        <div class="metric-card p-5">
          <span class="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-300 mb-4 block">Alertas</span>
          <div id="cst-alerts" class="space-y-2"></div>
        </div>
      </div>
      <div class="metric-card hidden md:block">
        <div class="px-5 py-4 border-b border-neutral-800"><span class="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-300">Todos os projetos</span></div>
        <div class="overflow-x-auto no-scrollbar"><table class="w-full text-left">
          <thead><tr class="text-[9px] font-black uppercase tracking-widest text-neutral-600 border-b border-neutral-800">
            <th class="px-5 py-3">Projeto</th><th class="px-3 py-3 text-right">Receita real.</th><th class="px-3 py-3 text-right">Custo prev.</th><th class="px-3 py-3 text-right">Custo real.</th><th class="px-3 py-3 text-right">Lucro real.</th><th class="px-3 py-3 text-center">Margem</th><th class="px-5 py-3 text-center">Status</th>
          </tr></thead>
          <tbody id="cst-table" class="text-sm"></tbody>
        </table></div>
      </div>
      <div id="cst-cards" class="md:hidden space-y-2"></div>`;
  }

  function aprovacoesHTML() {
    return `
      <div class="mb-5">
        <div class="text-[10px] font-black uppercase tracking-[0.25em] fin-acc-strong mb-1">Financeiro · Aprovações</div>
        <h1 class="text-2xl md:text-3xl font-black text-white tracking-tight">Fila de aprovações</h1>
        <p class="text-neutral-500 text-sm font-medium mt-1">Pagamentos e comissões aguardando autorização.</p>
      </div>
      <div id="fin-aprovacoes" class="space-y-2"></div>`;
  }

  /* ---------------------- PENDÊNCIAS (triagem) ---------------------- */
  function pendenciasHTML() {
    return `
      <div class="mb-5">
        <div class="text-[10px] font-black uppercase tracking-[0.25em] fin-acc-strong mb-1">Financeiro · Pendências</div>
        <h1 class="text-2xl md:text-3xl font-black text-white tracking-tight">O que precisa de atenção</h1>
        <p class="text-neutral-500 text-sm font-medium mt-1">Vencidos e margens abaixo do mínimo — clique para resolver na aba de origem.</p>
      </div>
      <div id="fin-pendencias" class="space-y-2"></div>`;
  }
  const finPendIcon = { vencido:'alert-triangle', margem:'percent' };
  const finPendTone = { '1':'bg-red-500/10 text-red-400 border-red-500/25', '2':'bg-yellow-500/10 text-yellow-400 border-yellow-500/25' };
  async function renderFinPendencias() {
    const host = document.getElementById('fin-pendencias'); if (!host) return;
    let rows = [];
    try { rows = await finRpc('list_fin_pendencias') || []; } catch (_) {}
    host.innerHTML = rows.length ? rows.map(p=>`
      <button onclick="setTab('${p.atalho}')" class="metric-card p-4 w-full text-left flex items-center justify-between gap-3 hover:border-[color:var(--fin-border-30)] transition-colors">
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-9 h-9 grid place-items-center border ${finPendTone[p.sev]||finPendTone['2']} shrink-0"><i data-lucide="${finPendIcon[p.tipo]||'alert-circle'}" class="w-4 h-4"></i></div>
          <div class="min-w-0"><div class="font-black text-white truncate">${escapeHTML(p.titulo)}</div><div class="text-[10px] text-neutral-500 font-bold uppercase tracking-widest truncate">${escapeHTML(p.sub)}</div></div>
        </div>
        <div class="flex items-center gap-2 shrink-0"><span class="text-white font-black num">${brMoney(p.valor)}</span><i data-lucide="chevron-right" class="w-4 h-4 text-neutral-600"></i></div>
      </button>`).join('') : `<div class="metric-card p-8 text-center text-[10px] text-neutral-600 font-bold uppercase tracking-widest">Nenhuma pendência 🎉</div>`;
    finIcons();
  }

  /* ---------------------- RELATÓRIOS ---------------------- */
  function relatoriosHTML() {
    return `
      <div class="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-5">
        <div>
          <div class="text-[10px] font-black uppercase tracking-[0.25em] fin-acc-strong mb-1">Financeiro · Relatórios</div>
          <h1 class="text-2xl md:text-3xl font-black text-white tracking-tight">Consolidação financeira</h1>
        </div>
        <button onclick="finExportRelatorio()" class="flex items-center gap-2 bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white px-4 py-2.5 text-[10px] font-black uppercase tracking-widest transition-colors"><i data-lucide="download" class="w-3.5 h-3.5"></i>Exportar CSV</button>
      </div>
      <div id="fin-rel-kpis" class="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-3"></div>
      <div class="metric-card">
        <div class="px-5 py-4 border-b border-neutral-800"><span class="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-300">Margem por projeto</span></div>
        <div class="overflow-x-auto no-scrollbar"><table class="w-full text-left">
          <thead><tr class="text-[9px] font-black uppercase tracking-widest text-neutral-600 border-b border-neutral-800">
            <th class="px-5 py-3">Projeto</th><th class="px-3 py-3 text-right">Receita</th><th class="px-3 py-3 text-right">Custo total</th><th class="px-3 py-3 text-right">Lucro líq.</th><th class="px-5 py-3 text-center">Margem</th>
          </tr></thead>
          <tbody id="fin-rel-table" class="text-sm"></tbody>
        </table></div>
      </div>`;
  }
  let finRelData = null;
  async function renderFinRelatorios() {
    let d;
    try { d = await finRpc('get_fin_relatorios', { p_period:'tudo' }); } catch (_) { return; }
    finRelData = d;
    const kpi = (l,v,c)=>`<div class="metric-card p-4"><div class="text-[9px] font-black uppercase tracking-widest text-neutral-500">${l}</div><div class="text-xl font-black ${c||'text-white'} mt-2 num">${brMoney(v)}</div></div>`;
    const host = document.getElementById('fin-rel-kpis');
    if (host) host.innerHTML =
      kpi('Receita prevista', d.receita_prevista) +
      kpi('Receita recebida', d.receita_recebida, 'text-emerald-400') +
      kpi('Vencido', d.vencido, 'text-red-400') +
      kpi('Comissões a pagar', d.comissoes_a_pagar, 'fin-acc') +
      kpi('Custo previsto', d.custo_previsto) +
      kpi('Custo realizado', d.custo_realizado);
    const tb = document.getElementById('fin-rel-table');
    const proj = d.por_projeto || [];
    if (!finPrecCfg) { try { finPrecCfg = await finRpc('get_fin_precificacao'); } catch (_) {} }
    const min = Number(finPrecCfg && finPrecCfg.margem_min) || 15;
    if (tb) tb.innerHTML = proj.length ? proj.map(p=>{
      const receita = Number(p.receita)||0, mg = Number(p.margem_pct)||0;
      const lucro = receita * mg/100;            // lucro líquido real (planilha)
      const custoTotal = receita - lucro;        // total de custos da planilha
      return `<tr class="border-b border-neutral-800/60">
        <td class="px-5 py-3 font-black text-white">${escapeHTML(p.cli)}</td>
        <td class="px-3 py-3 text-right text-neutral-300 num">${brMoney(receita)}</td>
        <td class="px-3 py-3 text-right text-neutral-400 num">${brMoney(custoTotal)}</td>
        <td class="px-3 py-3 text-right fin-acc font-bold num">${brMoney(lucro)}</td>
        <td class="px-5 py-3 text-center num font-black ${mg<min?'text-red-400':'text-white'}">${mg.toFixed(1)}%</td>
      </tr>`;}).join('') : `<tr><td colspan="5" class="px-5 py-10 text-center text-[10px] text-neutral-600 font-bold uppercase tracking-widest">Sem dados ainda</td></tr>`;
    finIcons();
  }
  function finExportRelatorio() {
    if (!finRelData) { finToast('Nada para exportar', 'warn'); return; }
    const lin = [['Projeto','Receita','Custo total','Lucro líquido','Margem %']];
    (finRelData.por_projeto||[]).forEach(p=>{
      const receita=Number(p.receita)||0, mg=Number(p.margem_pct)||0; const lucro=receita*mg/100;
      lin.push([p.cli, receita, (receita-lucro).toFixed(2), lucro.toFixed(2), mg.toFixed(1)]);
    });
    const csv = lin.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(';')).join('\n');
    const blob = new Blob(["﻿"+csv], {type:'text/csv;charset=utf-8'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'financeiro-relatorio.csv';
    document.body.appendChild(a); a.click(); a.remove();
    finToast('CSV exportado', 'ok');
  }

  /* ---------------------- CONFIG ---------------------- */
  function configHTML() {
    return `
      <div class="mb-5">
        <div class="text-[10px] font-black uppercase tracking-[0.25em] fin-acc-strong mb-1">Financeiro · Config</div>
        <h1 class="text-2xl md:text-3xl font-black text-white tracking-tight">Configurações</h1>
        <p class="text-neutral-500 text-sm font-medium mt-1">Parâmetros do módulo e acesso por usuário (admin).</p>
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div class="metric-card p-5">
          <div class="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-300 mb-4">Parâmetros</div>
          <div id="fin-cfg-list" class="space-y-3"></div>
        </div>
        <div class="metric-card p-5">
          <div class="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-300 mb-4">Acesso ao Financeiro</div>
          <div id="fin-cfg-users" class="space-y-1.5 max-h-[420px] overflow-y-auto no-scrollbar"></div>
        </div>
      </div>`;
  }
  const FIN_CFG_LABELS = { markup_padrao:'Markup padrão (×)', margem_alvo:'Margem-alvo (%)', margem_min:'Margem mínima (%)', comissao_pct:'Comissão padrão (%)', dias_alerta:'Dias p/ alerta' };
  async function renderFinConfig() {
    const isAdmin = !!state.isAdmin;
    let cfg = {};
    try { cfg = await finRpc('get_fin_config') || {}; } catch (_) {}
    const host = document.getElementById('fin-cfg-list');
    if (host) host.innerHTML = Object.keys(FIN_CFG_LABELS).map(k=>`
      <div class="flex items-center justify-between gap-3">
        <span class="text-[11px] font-bold text-neutral-300">${FIN_CFG_LABELS[k]}</span>
        <div class="flex items-center gap-2">
          <input id="fin-cfg-${k}" type="number" step="0.01" value="${cfg[k]!=null?cfg[k]:''}" ${isAdmin?'':'disabled'} class="fin-acc-focus w-24 px-2.5 py-1.5 bg-neutral-950 border border-neutral-800 text-white num font-black text-right text-sm">
          ${isAdmin?`<button onclick="finSalvarConfig('${k}')" class="px-2.5 py-1.5 fin-acc-chip border border-[color:var(--fin-border-30)] text-[9px] font-black uppercase tracking-widest">OK</button>`:''}
        </div>
      </div>`).join('');
    const ub = document.getElementById('fin-cfg-users');
    if (!isAdmin) { if (ub) ub.innerHTML = '<div class="text-[10px] text-neutral-600 font-bold uppercase tracking-widest py-4 text-center">Apenas admin</div>'; finIcons(); return; }
    let users = [];
    try { users = await finRpc('list_fin_users') || []; } catch (_) {}
    if (ub) ub.innerHTML = users.map(u=>`
      <div class="flex items-center justify-between gap-3 px-3 py-2 bg-neutral-950/60 border border-neutral-800">
        <div class="min-w-0"><div class="text-[12px] font-bold text-white truncate">${escapeHTML(u.nome)}</div><div class="text-[9px] text-neutral-500 font-bold uppercase tracking-widest">${escapeHTML(u.role||'—')}</div></div>
        <button onclick="finToggleFinEnabled('${u.user_id}', ${u.fin_enabled?'false':'true'})" class="shrink-0 px-3 py-1.5 text-[9px] font-black uppercase tracking-widest border ${u.fin_enabled?'fin-acc-chip border-[color:var(--fin-border-30)]':'bg-neutral-900 text-neutral-500 border-neutral-800'}">${u.fin_enabled?'Liberado':'Bloqueado'}</button>
      </div>`).join('');
    finIcons();
  }
  async function finSalvarConfig(chave) {
    const v = parseFloat(document.getElementById('fin-cfg-'+chave).value);
    if (isNaN(v)) { finToast('Valor inválido', 'warn'); return; }
    try { await finRpc('set_fin_config', { p_chave:chave, p_valor:v }); } catch (_) { return; }
    finToast('Configuração salva', 'ok');
  }
  async function finToggleFinEnabled(userId, enable) {
    try { await finRpc('set_fin_enabled', { p_user_id:userId, p_enabled: enable==='true'||enable===true }); } catch (_) { return; }
    finToast('Acesso atualizado', 'ok'); renderFinConfig();
  }

  /* ===================================================== SUBGRUPOS DE ABAS */
  // Abas reagrupadas (15 áreas → 9 pais). Cada grupo mostra uma barra de
  // sub-abas (mesmo padrão de Pagamentos) e reaproveita os builders/renders
  // já existentes via finAfterRender(after).
  const FIN_SUBGROUPS = {
    recebiveis: { subs: [
      { id: 'titulos',       label: 'Títulos',         icon: 'receipt',         build: recebiveisHTML,   after: 'titulos' },
      { id: 'parcelamentos', label: 'Parcelamentos',   icon: 'calendar-clock',  build: parcelamentosHTML, after: 'parcelamentos' },
    ]},
    compras: { subs: [
      { id: 'orcamentos',    label: 'Orçamentos',      icon: 'file-text',       build: orcamentosHTML,   after: 'orcamentos' },
      { id: 'ordemcompra',   label: 'Ordem de Compra', icon: 'shopping-cart',   build: ordemcompraHTML,  after: 'ordemcompra' },
    ]},
    margem: { subs: [
      { id: 'precificacao',  label: 'Precificação',    icon: 'tags',            build: precificacaoHTML, after: 'precificacao' },
      { id: 'custos',        label: 'Custos',          icon: 'calculator',      build: custosHTML,       after: 'custos' },
      { id: 'dre',           label: 'DRE',             icon: 'bar-chart-3',     build: dreHTML,          after: 'dre' },
    ]},
    acoes: { subs: [
      { id: 'pendencias',    label: 'Pendências',      icon: 'alert-triangle',  build: pendenciasHTML,   after: 'pendencias' },
      { id: 'aprovacoes',    label: 'Aprovações',      icon: 'badge-check',     build: aprovacoesHTML,   after: 'aprovacoes' },
    ]},
  };
  // Mapa subárea → aba-pai (pra resolver setTab antigos e atalhos).
  const FIN_CHILD_TO_GROUP = {
    parcelamentos: 'recebiveis',
    orcamentos: 'compras', ordemcompra: 'compras',
    precificacao: 'margem', custos: 'margem', dre: 'margem',
    pendencias: 'acoes', aprovacoes: 'acoes',
    comissoes: 'pagamentos',
  };
  function finResolveTab(tabId) {
    const grp = FIN_CHILD_TO_GROUP[tabId];
    if (!grp) return tabId;
    if (grp === 'pagamentos') {
      state.finPagSub = (tabId === 'comissoes') ? 'comissoes' : (state.finPagSub || 'conferencia');
    } else {
      state.finSub = state.finSub || {};
      state.finSub[grp] = tabId;
    }
    return grp;
  }
  function finGroupHTML(groupId) {
    const g = FIN_SUBGROUPS[groupId]; if (!g) return '';
    const cur = (state.finSub && state.finSub[groupId]) || g.subs[0].id;
    return `
      <div id="${groupId}-subtabs" class="flex gap-5 mb-6 border-b border-neutral-800 overflow-x-auto no-scrollbar">
        ${g.subs.map(s => `<button class="fin-subtab flex items-center gap-2 pb-2.5 text-[11px] font-black uppercase tracking-widest whitespace-nowrap ${s.id===cur?'is-active':''}" data-sub="${s.id}"><i data-lucide="${s.icon}" class="w-3.5 h-3.5"></i>${s.label}</button>`).join('')}
      </div>
      <div id="fin-${groupId}-body"></div>`;
  }
  function renderFinSub(groupId, sub) {
    const g = FIN_SUBGROUPS[groupId]; if (!g) return;
    state.finSub = state.finSub || {};
    sub = sub || state.finSub[groupId] || g.subs[0].id;
    if (!g.subs.some(s => s.id === sub)) sub = g.subs[0].id;
    state.finSub[groupId] = sub;
    const bar = document.getElementById(groupId + '-subtabs');
    if (bar) bar.querySelectorAll('.fin-subtab').forEach(b => b.classList.toggle('is-active', b.dataset.sub === sub));
    const body = document.getElementById('fin-' + groupId + '-body'); if (!body) return;
    const def = g.subs.find(s => s.id === sub);
    body.innerHTML = def.build();
    finAfterRender(def.after);
    finIcons();
  }
  function wireSubBar(groupId) {
    const bar = document.getElementById(groupId + '-subtabs'); if (!bar || bar.dataset.wired) return;
    bar.dataset.wired = '1';
    bar.addEventListener('click', e => { const b = e.target.closest('.fin-subtab'); if (!b) return; renderFinSub(groupId, b.dataset.sub); });
  }

  /* ======================================================== ROTEADOR */
  const PANEL_BUILDERS = {
    visao: visaoHTML,
    funil: funilHTML,
    recebiveis: () => finGroupHTML('recebiveis'),
    pagamentos: pagamentosHTML,
    compras: () => finGroupHTML('compras'),
    margem: () => finGroupHTML('margem'),
    acoes: () => finGroupHTML('acoes'),
    relatorios: relatoriosHTML,
    config: configHTML,
  };

  let _finGlobalsBound = false;
  function bindGlobalListeners() {
    if (_finGlobalsBound) return;
    _finGlobalsBound = true;
    // fecha o combo de custos ao clicar fora
    document.addEventListener('click', e => {
      const box = document.getElementById('cst-results');
      if (!box || box.classList.contains('hidden')) return;
      if (!e.target.closest('#cst-combo')) box.classList.add('hidden');
    });
    // ESC fecha o modal do funil
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeFinModal(); });
  }

  function wireFilterBar(barId, cls, fn) {
    const bar = document.getElementById(barId); if (!bar) return;
    bar.addEventListener('click', e => {
      const b = e.target.closest('.' + cls); if (!b) return;
      bar.querySelectorAll('.' + cls).forEach(x => { x.classList.remove('is-active'); x.classList.add('text-neutral-400'); });
      b.classList.add('is-active'); b.classList.remove('text-neutral-400');
      fn(b.dataset.f);
    });
  }

  function finAfterRender(tabId) {
    switch (tabId) {
      case 'visao':
        loadFaturamento('12m'); bindFaturamento();
        finLoadDashboard();        // KPIs + aging + cobranças + a receber (reais)
        finLoadDashboardExtras();  // sparklines + ação + projeção de caixa + margem + DRE inline + risco
        renderRecentes();
        break;
      case 'funil':         renderFunil(); break;
      // grupos com sub-abas
      case 'recebiveis':
      case 'compras':
      case 'margem':
      case 'acoes':
        renderFinSub(tabId);
        wireSubBar(tabId);
        break;
      // sub-aba "Títulos" (conteúdo original de Recebíveis)
      case 'titulos':
        renderRec(state.finFilters.recebiveis.f || 'todos');
        wireFilterBar('rec-filters', 'rec-filter', renderRec);
        break;
      case 'pagamentos': {
        renderPagSub(state.finPagSub || 'conferencia');
        const subbar = document.getElementById('pag-subtabs');
        if (subbar) subbar.addEventListener('click', e => {
          const b = e.target.closest('.fin-subtab'); if (!b) return;
          renderPagSub(b.dataset.sub);
        });
        break;
      }
      case 'ordemcompra':
        renderOC(state.finFilters.ordemcompra.f || 'todos');
        wireFilterBar('oc-filters', 'oc-filter', renderOC);
        break;
      case 'orcamentos':    renderOrc(); break;
      case 'precificacao':  renderPrec(); break;
      case 'parcelamentos': renderParc(); break;
      case 'dre':           renderDre(); break;
      case 'custos':        renderCustos(); break;
      case 'aprovacoes':    renderFinAprovacoes(); break;
      case 'pendencias':    renderFinPendencias(); break;
      case 'relatorios':    renderFinRelatorios(); break;
      case 'config':        renderFinConfig(); break;
      default: break;
    }
  }

  function renderFinRoute(container, tabId) {
    finEnsureChrome();
    bindGlobalListeners();
    // fecha o modal do funil ao trocar de aba
    closeFinModal();

    // Abas reagrupadas: um id de subárea (comissoes, dre, orcamentos, custos…)
    // é resolvido pra aba-pai, memorizando a sub-aba correta.
    const _grp = finResolveTab(tabId);
    if (_grp !== tabId) {
      tabId = _grp;
      if (state.environment === 'financeiro') state.finActiveTab = _grp;
    }

    let inner;
    if (PANEL_BUILDERS[tabId]) inner = PANEL_BUILDERS[tabId]();
    else if (phasePanels[tabId]) inner = phasePanelHTML(tabId);
    else inner = visaoHTML(), tabId = 'visao';

    container.innerHTML = `<div class="fin-env"><div class="max-w-7xl mx-auto px-4 py-6 md:py-8" data-fin-panel="${tabId}">${inner}</div></div>`;
    finAfterRender(tabId);
    if (window.lucide) lucide.createIcons();
  }

  /* ----------------------------------------------- EXPOSE (window) */
  Object.assign(window, {
    renderFinRoute,
    finResolveTab,
    finToast,
    // recebíveis (ações + lançamento + edição)
    finTitBaixar, finBaixarSubmit, finTitReneg, finTitRenegSubmit, finTitCancelar,
    finTitEdit, finTitEditSubmit,
    finLancamentoModal, finLancClienteSearch, finLancPick, finLancamentoSubmit,
    // funil
    finOpenFunilDetail, closeFinModal, finFunilMove,
    // comissões
    finComLiberar, finComPagar, finComAjustar, finComCalc, finComAjustarSubmit,
    // pagamentos (conferência: recebimentos + contas a pagar)
    finPagAprovar, finPagRecusarPg, finPagPagar, finNovoPagamento, finNovoPagamentoSubmit,
    // aprovações
    finAprovarItem,
    // orçamentos / ordem de compra
    finNovaOC, finNovaOCSubmit, finOcAnexar, finOcStatus,
    // parcelamentos
    finNovoParcelamento, finNovoParcelamentoSubmit, finOpenParcDetail, finPagarParcela,
    // custos
    finCustoSearch: custoSearch, finCustoOpenResults: custoOpenResults,
    finCustoToggleResults: custoToggleResults, finPickCusto, finPickCustoFromTable,
    finNovoCusto, finNovoCustoSubmit, finCustoEdit, finCustoEditSubmit,
    // precificação
    finPrecCalc, finPrecSugerir, finNovoPrecItem, finNovoPrecItemSubmit, finEditPrecItem, finEditPrecItemSubmit, finDelPrecItem,
    // DRE calculadora-simulador
    finDreToggleSim, finDrePickObra,
    finDreSimVal, finDreExtra, finDreAddExtra, finDreDelExtra, finDreSaveScenario, finDreClearSim,
    // relatórios
    finExportRelatorio,
    // config
    finSalvarConfig, finToggleFinEnabled,
  });

})();
