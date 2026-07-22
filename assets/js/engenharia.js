// ==========================================
// MÓDULO ENGENHARIA — Calculadora / Dimensionamento Fotovoltaico
// 5º ambiente do portal. Padrão espelhado de om.js / financeiro.js / vistoria.js:
//   constantes → estado local → helpers → motor de cálculo (puro) →
//   renderizadores → handlers → exposição global.
//
// FASE 2 (atual): motor de cálculo portado (matemática idêntica à calculadora
// original) + tela da Calculadora re-skinada no design system. Funciona stateless
// (equipamentos digitados na hora). Acesso admin-only até a fase Supabase.
//
// Acento visual do ambiente: azul/índigo "blueprint". Trocável em ENG_ACCENT.
// ==========================================

// --- ACENTO DO AMBIENTE (blueprint) ---
const ENG_ACCENT = {
  text:    'text-sky-400',
  border:  'border-sky-500',
  grad:    'from-sky-600 to-indigo-500',
};

// Classes de input/label reutilizadas no formulário (cantos retos, mono, foco azul).
const ENG_INP = 'w-full bg-black border border-neutral-700 focus:border-sky-500 px-3 py-2 text-white text-sm font-mono outline-none transition-colors';
const ENG_LBL = 'block text-[10px] font-black uppercase tracking-widest text-neutral-500 mb-1';

// --- DEFINIÇÃO DOS INPUTS (chaves lógicas; o id no DOM é "eng_<chave>") ---
const ENG_INPUT_KEYS = [
  'invBrand', 'invModel', 'modBrand', 'modModel',
  'gridType', 'inverterCount', 'moduleCount', 'irradiation', 'systemLosses',
  'inverterPower', 'overload', 'mpptCount', 'connectorsPerMppt', 'mpptMinV',
  'inverterMaxV', 'mpptMaxA', 'modulePower', 'moduleVmp', 'moduleImp',
  'moduleVoc', 'moduleIsc', 'tempCoef', 'minTemp', 'enableVdropCalc',
  'cableDistance', 'dcCableSize', 'groupingFactor'
];
// Campos que NÃO são parseFloat (texto/seleção). Igual à calculadora original.
const ENG_TEXT_KEYS = ['gridType', 'connectorsPerMppt', 'invBrand', 'invModel', 'modBrand', 'modModel'];

// Valores padrão (irradiação puxa o HSP da franquia quando disponível).
function engDefaults() {
  return {
    inverterCount: 1,
    irradiation: (state && state.franquiaHsp) ? state.franquiaHsp : 5.4,
    systemLosses: 20,
    overload: 50,
    mpptCount: 4,
    connectorsPerMppt: '2',
    tempCoef: -0.27,
    minTemp: 5,
    gridType: '220_trifasico',
    dcCableSize: '6',
    groupingFactor: '0.7',
  };
}

// Instância única do gráfico de geração (Chart.js).
let engChartInstance = null;

// --- HELPERS ---
function engFmtNum(n, dec = 0) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

// Valor atual de um campo (estado salvo → default → fallback), com guarda de NaN.
function engVal(key, fb = '') {
  const defs = engDefaults();
  const has = state.eng && state.eng.inputs && (key in state.eng.inputs);
  const v = has ? state.eng.inputs[key] : undefined;
  if (v === undefined || v === null || (typeof v === 'number' && !Number.isFinite(v))) {
    return (key in defs) ? defs[key] : fb;
  }
  return v;
}

function engHeader(titulo, subtitulo, icon) {
  return `
    <div class="flex items-start justify-between gap-4 mb-6">
      <div class="flex items-center gap-3">
        <div class="w-11 h-11 grid place-items-center border border-neutral-800 bg-black/40 shrink-0">
          <i data-lucide="${icon}" class="w-5 h-5 ${ENG_ACCENT.text}"></i>
        </div>
        <div>
          <h2 class="text-2xl font-black text-white uppercase tracking-wide leading-none">${titulo}</h2>
          ${subtitulo ? `<p class="text-neutral-500 text-xs font-medium mt-1.5">${subtitulo}</p>` : ''}
        </div>
      </div>
    </div>`;
}

function engEmBreve(texto) {
  return `
    <div class="border border-dashed border-neutral-800 bg-neutral-900/40 p-10 text-center">
      <i data-lucide="hard-hat" class="w-8 h-8 ${ENG_ACCENT.text} mx-auto mb-3"></i>
      <p class="text-neutral-400 text-sm font-bold uppercase tracking-widest">${texto}</p>
      <p class="text-neutral-600 text-xs font-medium mt-2">Esta área será habilitada nas próximas etapas.</p>
    </div>`;
}

// Card de seção do formulário (barra de acento à esquerda).
function engCard(accentBar, iconTone, icon, title, bodyHTML) {
  return `
    <div class="relative bg-neutral-900/60 border border-neutral-800 p-5 overflow-hidden">
      <div class="absolute top-0 left-0 w-0.5 h-full ${accentBar}"></div>
      <h3 class="text-sm font-black text-white uppercase tracking-wide flex items-center gap-2 mb-4">
        <i data-lucide="${icon}" class="w-4 h-4 ${iconTone}"></i> ${title}
      </h3>
      ${bodyHTML}
    </div>`;
}

// Campo numérico.
function engNum(key, label, ph, opts = {}) {
  const step = opts.step ? ` step="${opts.step}"` : '';
  const extra = opts.cls ? ` ${opts.cls}` : '';
  return `
    <div>
      <label class="${ENG_LBL} ${opts.lblTone || ''}">${label}</label>
      <input type="number" id="eng_${key}" value="${engVal(key, '')}" placeholder="${ph || ''}"${step}
        oninput="engStash()" class="${ENG_INP}${extra}">
    </div>`;
}

// Escape para uso seguro dentro de atributo HTML (value="...").
function engEscAttr(v) {
  return String(v ?? '').replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

// Campo texto.
function engText(key, ph) {
  return `<input type="text" id="eng_${key}" value="${engEscAttr(engVal(key, ''))}" placeholder="${ph || ''}" oninput="engStash()" class="${ENG_INP}">`;
}

// Campo select (options: array de {v,l}).
function engSelect(key, label, options) {
  const cur = String(engVal(key, ''));
  const opts = options.map(o => `<option value="${o.v}"${String(o.v) === cur ? ' selected' : ''}>${o.l}</option>`).join('');
  return `
    <div>
      <label class="${ENG_LBL}">${label}</label>
      <select id="eng_${key}" onchange="engStash()" class="${ENG_INP}">${opts}</select>
    </div>`;
}

// Bloco de erro inline (área de resultados).
function engErrorBox(msg) {
  return `
    <div class="border border-red-700/60 bg-red-950/40 p-5 flex items-start gap-3">
      <i data-lucide="alert-octagon" class="w-5 h-5 text-red-400 shrink-0 mt-0.5"></i>
      <div>
        <p class="text-red-300 font-black uppercase tracking-widest text-xs mb-1">Configuração inválida</p>
        <p class="text-red-200/90 text-sm">${msg}</p>
      </div>
    </div>`;
}

// Seletor de preset (módulo/inversor salvo) para a Calculadora. Vazio se não há itens.
function engPresetSelect(tipo) {
  const arr = tipo === 'inversor' ? state.eng.inversores : state.eng.modulos;
  if (!arr || arr.length === 0) return '';
  const fn = tipo === 'inversor' ? 'engApplyInversorPreset' : 'engApplyModuloPreset';
  const opts = arr.map(x => `<option value="${x.id}">${engEscAttr(x.marca)} ${engEscAttr(x.modelo)}</option>`).join('');
  return `<select onchange="${fn}(this.value)" class="${ENG_INP} text-neutral-300 mb-1"><option value="">— Carregar ${tipo} salvo —</option>${opts}</select>`;
}

// ==========================================
// MOTOR DE CÁLCULO (puro — sem DOM). Matemática idêntica à calculadora original.
// Retorna { error } ou o objeto de resultados. Reutilizável (ex.: versão
// simplificada no Comercial, fase 2 do roadmap).
// ==========================================

// Lê o formulário para um objeto de chaves lógicas.
function engReadInputs() {
  const out = {};
  for (const key of ENG_INPUT_KEYS) {
    const el = document.getElementById('eng_' + key);
    if (!el) continue;
    if (el.type === 'checkbox') out[key] = el.checked;
    else if (ENG_TEXT_KEYS.includes(key)) out[key] = el.value;
    else out[key] = parseFloat(el.value);
  }
  return out;
}

function engStash() {
  state.eng.inputs = engReadInputs();
}

function engCompute(inputs) {
  // Limites físicos por MPPT a partir de "Entradas/MPPT" (ex.: "2" ou "3,3,2,2").
  const connectorsStr = String(inputs.connectorsPerMppt ?? '');
  let physicalLimits = connectorsStr.includes(',')
    ? connectorsStr.split(',').map(s => parseInt(s.trim()))
    : Array(inputs.mpptCount).fill(parseInt(connectorsStr));
  if (physicalLimits.length === 1 && inputs.mpptCount > 1) physicalLimits = Array(inputs.mpptCount).fill(physicalLimits[0]);

  // Guardas de preenchimento (melhoria sobre o original, que produzia NaN silencioso).
  const required = ['inverterCount', 'moduleCount', 'irradiation', 'systemLosses', 'inverterPower',
    'overload', 'mpptCount', 'mpptMinV', 'inverterMaxV', 'mpptMaxA', 'modulePower',
    'moduleVmp', 'moduleImp', 'moduleVoc', 'moduleIsc', 'tempCoef', 'minTemp'];
  for (const k of required) {
    if (!Number.isFinite(inputs[k])) return { error: 'Preencha todos os campos técnicos do sistema, inversor e módulo.' };
  }
  if (inputs.inverterCount <= 0 || inputs.moduleVmp <= 0 || inputs.moduleIsc <= 0 || inputs.moduleVoc <= 0) {
    return { error: 'Quantidade de inversores e dados elétricos do módulo (Vmp, Voc, Isc) devem ser maiores que zero.' };
  }
  if (inputs.moduleCount % inputs.inverterCount !== 0) {
    return { error: `Os ${inputs.moduleCount} módulos não dividem igualmente entre ${inputs.inverterCount} inversor(es).` };
  }

  const modulesPerInverter = inputs.moduleCount / inputs.inverterCount;
  const vocCold = inputs.moduleVoc * (1 + (inputs.minTemp - 25) * (inputs.tempCoef / 100));
  const maxSeries = Math.floor(inputs.inverterMaxV / vocCold);
  const minSeries = Math.ceil(inputs.mpptMinV / inputs.moduleVmp);
  const maxStringsElectrical = Math.floor(inputs.mpptMaxA / inputs.moduleIsc);

  if (maxStringsElectrical < 1) {
    return { error: `Corrente do módulo (${inputs.moduleIsc}A) maior que a corrente máxima da MPPT (${inputs.mpptMaxA}A).` };
  }

  const realLimitsPerMppt = physicalLimits.map(phys => Math.min(phys, maxStringsElectrical));
  const maxTotalStringsInverter = realLimitsPerMppt.reduce((a, b) => a + b, 0);

  const autoConfig = findOptimalConfiguration(modulesPerInverter, inputs.mpptCount, realLimitsPerMppt, maxTotalStringsInverter, minSeries, maxSeries);
  if (!autoConfig.success) {
    return { error: `Arranjo impossível com os limites informados: ${autoConfig.message}` };
  }

  const distribution = autoConfig.distribution;
  let electricalError = null, maxV = 0;
  distribution.forEach((mppt, index) => {
    if (mppt.numStrings === 0) return;
    const vMax = mppt.modulesPerString * vocCold;
    if (vMax > maxV) maxV = vMax;
    if (vMax > inputs.inverterMaxV) electricalError = `Sobretensão na MPPT ${index + 1} (${vMax.toFixed(1)}V > ${inputs.inverterMaxV}V).`;
  });
  if (electricalError) return { error: electricalError };

  const totalInverterPower = inputs.inverterCount * inputs.inverterPower;
  if (!Number.isFinite(totalInverterPower) || totalInverterPower <= 0) {
    return { error: 'Potência dos inversores inválida. Informe a quantidade e a potência de cada inversor.' };
  }

  const currentOverloadPercent = ((inputs.moduleCount * inputs.modulePower) / totalInverterPower) * 100;
  const maxAllowedOverload = 100 + inputs.overload;
  if (currentOverloadPercent > maxAllowedOverload) {
    return { error: `Overload excessivo: ${currentOverloadPercent.toFixed(1)}% (limite do inversor: ${maxAllowedOverload}%, overload de ${inputs.overload}%).` };
  }

  const systemDcPowerKw = (inputs.moduleCount * inputs.modulePower) / 1000;
  const powerRatioPercent = ((modulesPerInverter * inputs.modulePower) / inputs.inverterPower) * 100;
  const daysInMonth = [31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const seasonalFactors = [1.15, 1.1, 1.05, 0.95, 0.85, 0.8, 0.8, 0.85, 0.95, 1.05, 1.1, 1.15];
  const performanceRatio = 1 - (inputs.systemLosses / 100);
  const monthlyGeneration = seasonalFactors.map((factor, index) => (systemDcPowerKw * inputs.irradiation * factor * performanceRatio) * daysInMonth[index]);
  const totalAnnualGeneration = monthlyGeneration.reduce((a, b) => a + b, 0);

  return {
    inputs,
    potenciaPico: systemDcPowerKw,
    geracaoMedia: totalAnnualGeneration / 12,
    monthlyGeneration,
    totalAnnualGeneration,
    modulesPerInverter,
    powerRatioPercent,
    distribution,
    vocCorrected: vocCold,
    maxVStringGlobal: maxV,
  };
}

// Algoritmo de Distribuição (portado verbatim da calculadora original).
function findOptimalConfiguration(t, m, l, mx, mn, mxs) { for (let s = mxs; s >= mn; s--) { let b = Math.floor(t / s), r = t % s; if (r === 0) { if (b <= mx && b > 0) { let d = distributeStringsToMppts(b, s, m, l); if (d.success) return { success: true, distribution: d.result } } } else if ((s + 1) <= mxs) { if (b <= mx && r <= b) { let d = distributeMixedStrings(r, s + 1, b - r, s, m, l); if (d.success) return { success: true, distribution: d.result } } } } return { success: false, message: "não foi possível achar arranjo válido." } }
function distributeStringsToMppts(t, s, m, l) { let d = [], rem = t; for (let i = 0; i < m; i++) { let act = Math.min(Math.ceil(rem / (m - i)), l[i]); d.push({ numStrings: act, modulesPerString: act > 0 ? s : 0 }); rem -= act } return { success: rem === 0, result: d } }
function distributeMixedStrings(ql, sl, qc, sc, m, l) { let d = Array(m).fill(null).map(() => ({ numStrings: 0, modulesPerString: 0 })), curr = 0; const add = (sz) => { let att = 0; while (att < m) { let mp = d[curr]; if (mp.numStrings < l[curr]) { if (mp.numStrings === 0 || mp.modulesPerString === sz) { mp.numStrings++; mp.modulesPerString = sz; curr = (curr + 1) % m; return true } } curr = (curr + 1) % m; att++ } return false }; for (let i = 0; i < ql; i++) if (!add(sl)) return { success: false }; for (let i = 0; i < qc; i++) if (!add(sc)) return { success: false }; return { success: true, result: d } }

// ==========================================
// RENDERIZADORES — Calculadora
// ==========================================
function renderEngCalculadora(container) {
  // Carrega o catálogo (para os seletores de preset) na primeira vez.
  if (ENG_DB_ENABLED && !state.eng.equipLoaded) {
    engFetchEquip().then(() => {
      if (state.environment === 'engenharia' && state.engActiveTab === 'calculadora') renderEngCalculadora(container);
    });
  }
  const gridOpts = [
    { v: '220_trifasico', l: '220V Trifásico (3F+N)' },
    { v: '380_trifasico', l: '380V Trifásico (3F+N)' },
    { v: '220_bifasico',  l: '220V Bifásico (F+F+N)' },
    { v: '127_monofasico', l: '127V Monofásico (F+N)' },
  ];
  const bitolaOpts = [{ v: '4', l: '4 mm²' }, { v: '6', l: '6 mm²' }, { v: '10', l: '10 mm²' }, { v: '16', l: '16 mm²' }];
  const fcaOpts = [{ v: '1.0', l: '1 Circuito' }, { v: '0.7', l: '3 Circuitos (Padrão)' }, { v: '0.65', l: '4+ Circuitos' }];

  const vdropAtivo = !!engVal('enableVdropCalc', false);

  // Coluna 1: Dados do Sistema + Queda de Tensão
  const colSistema = `
    <div class="space-y-5">
      ${engCard('bg-sky-500', 'text-sky-400', 'sun', 'Dados do Sistema', `
        <div class="grid grid-cols-2 gap-3">
          ${engNum('inverterCount', 'Inversores', '1')}
          ${engNum('moduleCount', 'Total Módulos', 'Ex: 68')}
          ${engNum('irradiation', 'Irradiação (kWh)', '5.4', { step: '0.1' })}
          ${engNum('systemLosses', 'Perdas (%)', '20')}
        </div>
      `)}
      ${engCard('bg-purple-500', 'text-purple-400', 'trending-down', 'Queda de Tensão', `
        <label class="flex items-center gap-2 mb-3 cursor-pointer select-none">
          <input id="eng_enableVdropCalc" type="checkbox" ${vdropAtivo ? 'checked' : ''} onchange="engToggleVdrop(this.checked)" class="accent-sky-500 w-4 h-4">
          <span class="text-[11px] font-bold text-neutral-300 uppercase tracking-widest">Calcular perdas nos cabos CC</span>
        </label>
        <div id="eng-vdrop-inputs" class="${vdropAtivo ? '' : 'hidden'} space-y-3 pt-3 border-t border-neutral-800">
          ${engNum('cableDistance', 'Distância (m)', 'Ex: 20')}
          ${engSelect('dcCableSize', 'Bitola Teste', bitolaOpts)}
        </div>
      `)}
    </div>`;

  // Coluna 2: Inversor e Rede
  const colInversor = `
    ${engCard('bg-amber-500', 'text-amber-400', 'server', 'Inversor e Rede', `
      <div class="space-y-3">
        ${engPresetSelect('inversor')}
        <div class="grid grid-cols-2 gap-2">
          ${engText('invBrand', 'Marca')}
          ${engText('invModel', 'Modelo')}
        </div>
        ${engSelect('gridType', 'Tipo de Rede', gridOpts)}
        <div class="grid grid-cols-2 gap-3">
          ${engNum('inverterPower', 'Potência (W)', '30000')}
          ${engNum('overload', 'Overload (%)', '50')}
        </div>
        <div class="bg-black/40 p-3 border border-neutral-800">
          <p class="text-[10px] text-neutral-500 uppercase font-black mb-3 tracking-widest">Configuração MPPT</p>
          <div class="grid grid-cols-2 gap-3 mb-3">
            ${engNum('mpptCount', 'Qtd MPPTs', '4')}
            ${engNum('connectorsPerMppt', 'Entradas/MPPT', '2 ou 3,3,2,2', { cls: 'text-center' })}
          </div>
          <div class="grid grid-cols-2 gap-3 mb-3">
            ${engNum('mpptMinV', 'V Mín (Start)', '180')}
            ${engNum('inverterMaxV', 'V Máx (Entrada)', '1000')}
          </div>
          ${engNum('mpptMaxA', 'Corrente Máx (A) por MPPT', '30')}
        </div>
        ${engSelect('groupingFactor', 'Fator Agrupamento (FCA)', fcaOpts)}
      </div>
    `)}`;

  // Coluna 3: Módulo FV
  const colModulo = `
    ${engCard('bg-emerald-500', 'text-emerald-400', 'grid-3x3', 'Módulo Fotovoltaico', `
      <div class="space-y-3">
        ${engPresetSelect('modulo')}
        <div class="grid grid-cols-2 gap-2">
          ${engText('modBrand', 'Marca')}
          ${engText('modModel', 'Modelo')}
        </div>
        ${engNum('modulePower', 'Potência (Wp)', '585', { cls: 'text-emerald-400 font-bold' })}
        <div class="bg-black/40 p-3 border border-neutral-800">
          <p class="text-[10px] text-neutral-500 uppercase font-black mb-3 tracking-widest">Dados Elétricos (STC)</p>
          <div class="grid grid-cols-2 gap-3 mb-3">
            ${engNum('moduleVmp', 'Vmp (V)', '42.7', { step: '0.01', lblTone: 'text-sky-400' })}
            ${engNum('moduleImp', 'Imp (A)', '13.6', { step: '0.01', lblTone: 'text-sky-400' })}
          </div>
          <div class="grid grid-cols-2 gap-3">
            ${engNum('moduleVoc', 'Voc (V)', '51.6', { step: '0.01' })}
            ${engNum('moduleIsc', 'Isc (A)', '14.4', { step: '0.01' })}
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          ${engNum('tempCoef', 'Coef. Temp (%/°C)', '-0.27', { step: '0.01' })}
          ${engNum('minTemp', 'Temp Mín (°C)', '5')}
        </div>
      </div>
    `)}`;

  container.innerHTML = `
    <div class="p-6 max-w-7xl mx-auto">
      ${engHeader('Calculadora', 'Dimensionamento de strings, MPPT, proteções CA/CC e geração estimada', 'calculator')}

      ${state.eng.currentProjectId ? `
      <div class="mb-5 flex items-center justify-between gap-3 border border-sky-500/30 bg-sky-500/5 px-4 py-3">
        <div class="flex items-center gap-2 min-w-0">
          <i data-lucide="folder-open" class="w-4 h-4 text-sky-400 shrink-0"></i>
          <span class="text-[11px] font-bold text-neutral-200 truncate">Dimensionando: <strong class="text-white">${engEscAttr(state.eng.currentProjectName || '')}</strong>${state.eng.targetKwp ? ` · alvo ${engFmtNum(state.eng.targetKwp, 2)} kWp` : ''}</span>
        </div>
        <button onclick="engSairProjeto()" class="text-[10px] font-black uppercase tracking-widest text-neutral-400 hover:text-white shrink-0">Sair do projeto</button>
      </div>` : ''}

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        ${colSistema}
        ${colInversor}
        ${colModulo}
      </div>

      <div class="mt-6 flex flex-col sm:flex-row gap-3">
        <button type="button" onclick="engCalcular()"
          class="flex-1 py-3 px-6 bg-gradient-to-r ${ENG_ACCENT.grad} text-black font-black uppercase tracking-widest text-sm flex items-center justify-center gap-2 hover:opacity-90 transition-opacity">
          <i data-lucide="shield-check" class="w-5 h-5"></i> Validar
        </button>
        <button type="button" onclick="engLimpar()"
          class="sm:w-auto py-3 px-6 bg-neutral-900 border border-neutral-700 text-neutral-400 hover:text-white font-black uppercase tracking-widest text-sm flex items-center justify-center gap-2 transition-colors">
          <i data-lucide="eraser" class="w-4 h-4"></i> Limpar
        </button>
      </div>

      <div id="eng-results" class="mt-8"></div>
    </div>`;

  // Reexibe o último resultado ao voltar para a aba.
  if (state.eng && state.eng.lastResult) {
    const box = document.getElementById('eng-results');
    if (box) {
      box.innerHTML = engRenderReport(state.eng.lastResult);
      engCreateChart(state.eng.lastResult.monthlyGeneration, state.eng.lastResult.totalAnnualGeneration);
    }
  }

  if (window.lucide) lucide.createIcons();
}

// Toggle do bloco de queda de tensão.
function engToggleVdrop(checked) {
  const box = document.getElementById('eng-vdrop-inputs');
  if (box) box.classList.toggle('hidden', !checked);
  engStash();
}

// Handler do botão Validar.
function engCalcular() {
  engStash();
  const inputs = engReadInputs();
  const res = engCompute(inputs);
  const box = document.getElementById('eng-results');
  if (!box) return;

  if (res.error) {
    state.eng.lastResult = null;
    if (engChartInstance) { engChartInstance.destroy(); engChartInstance = null; }
    box.innerHTML = engErrorBox(res.error);
    if (window.lucide) lucide.createIcons();
    return;
  }

  state.eng.lastResult = res;
  box.innerHTML = engRenderReport(res);
  engCreateChart(res.monthlyGeneration, res.totalAnnualGeneration);
  if (window.lucide) lucide.createIcons();
  box.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function engLimpar() {
  state.eng.inputs = {};
  state.eng.lastResult = null;
  engSairProjetoState();
  if (engChartInstance) { engChartInstance.destroy(); engChartInstance = null; }
  const container = document.getElementById('main-container');
  if (container) renderEngCalculadora(container);
}

// Limpa o "modo projeto" (sem re-renderizar).
function engSairProjetoState() {
  state.eng.currentProjectId = null;
  state.eng.currentProjectName = '';
  state.eng.targetKwp = null;
}

// Sai do modo projeto e re-renderiza a calculadora (mantém os inputs atuais).
function engSairProjeto() {
  engSairProjetoState();
  const c = document.getElementById('main-container');
  if (c) renderEngCalculadora(c);
}

// "Nova simulação" a partir do dashboard: começa avulsa (fora de projeto).
function engNovaSimulacao() {
  engSairProjetoState();
  setTab('calculadora');
}

// Snapshot compacto do resultado para gravar em eng_projetos.resultado (jsonb).
function engResultSnapshot(data) {
  return {
    potenciaPico: data.potenciaPico,
    geracaoMedia: data.geracaoMedia,
    totalAnnualGeneration: data.totalAnnualGeneration,
    powerRatioPercent: data.powerRatioPercent,
    vocCorrected: data.vocCorrected,
    maxVStringGlobal: data.maxVStringGlobal,
    monthlyGeneration: data.monthlyGeneration,
    distribution: data.distribution,
  };
}

// Salva o dimensionamento validado NO projeto atual (update) e marca como Concluído (etapa 2).
async function engSalvarNoProjeto() {
  const data = state.eng && state.eng.lastResult;
  if (!data) { showToast('Valide um dimensionamento antes de salvar.'); return; }
  const id = state.eng.currentProjectId;
  if (!id) { return engSalvarProjeto(); } // fallback: sem projeto → salva novo
  const patch = {
    potencia_pico_kwp: data.potenciaPico,
    potencia_inversor_w: data.inputs.inverterPower,
    total_modulos: data.inputs.moduleCount,
    geracao_media_kwh: data.geracaoMedia,
    dados_completos: { ...data.inputs },
    resultado: engResultSnapshot(data),
  };
  try {
    if (ENG_DB_ENABLED) {
      // etapa: avança para "Concluído" (2) se ainda estava antes disso.
      const p0 = state.eng.projetos.find(x => String(x.id) === String(id));
      const novaEtapa = Math.max(2, (p0 && p0.etapa) || 0);
      const { error } = await supabaseClient.from('eng_projetos')
        .update({ ...patch, etapa: novaEtapa, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      if (p0) Object.assign(p0, patch, { etapa: novaEtapa });
    } else {
      const p0 = state.eng.projetos.find(x => String(x.id) === String(id));
      if (p0) Object.assign(p0, patch, { etapa: Math.max(2, p0.etapa || 0) });
    }
    showToast('Dimensionamento salvo no projeto.');
  } catch (e) {
    console.error('[engenharia] salvar no projeto', e);
    showToast('Erro ao salvar: ' + (e.message || e));
  }
}

// ==========================================
// RELATÓRIO (re-skin do design system) — mantém a estrutura/valores do original.
// ==========================================
function engRenderReport(data) {
  const { inputs, monthlyGeneration, totalAnnualGeneration, powerRatioPercent, distribution, maxVStringGlobal } = data;

  const voltage = inputs.gridType.includes('380') ? 380 : (inputs.gridType.includes('220') ? 220 : 127);
  const isThreePhase = inputs.gridType.includes('trifasico');
  const nominalCurrent = inputs.inverterPower / (isThreePhase ? voltage * 1.732 : voltage);
  const projectCurrent = nominalCurrent * 1.25;

  const breakers = [16, 25, 32, 40, 50, 63, 70, 80, 100, 125, 150, 175, 200, 250];
  const breaker = breakers.find(b => b >= projectCurrent) || 250;

  let cable = 'Consulte';
  const cableTable = isThreePhase
    ? { '2.5': 21, '4': 28, '6': 36, '10': 50, '16': 68, '25': 89, '35': 111, '50': 134, '70': 171, '95': 207 }
    : { '2.5': 24, '4': 32, '6': 41, '10': 57, '16': 76, '25': 101, '35': 125 };
  for (const [bitola, amp] of Object.entries(cableTable)) {
    if (amp * inputs.groupingFactor >= breaker) { cable = bitola + ' mm²'; break; }
  }

  // Queda de tensão: usa o nº real de módulos/string da MPPT ativa (correção do
  // valor fixo "12" da tela original; o PDF do original já fazia assim).
  let vDropHTML = '';
  if (inputs.enableVdropCalc) {
    const activeMppt = distribution.find(d => d.numStrings > 0);
    const modsPerString = activeMppt ? activeMppt.modulesPerString : 12;
    vDropHTML = engRenderVoltageDrop(inputs, modsPerString);
  }

  const metric = (label, value, tone) => `
    <div class="bg-black/40 border border-neutral-800 p-4">
      <p class="text-[10px] text-neutral-500 uppercase font-black tracking-widest mb-1">${label}</p>
      <p class="text-2xl font-black ${tone || 'text-white'}">${value}</p>
    </div>`;

  return `
    <div class="space-y-8">
      <div class="flex items-center justify-between border-b border-neutral-800 pb-4">
        <h2 class="text-xl font-black text-white uppercase tracking-wide flex items-center gap-2">
          <i data-lucide="clipboard-check" class="w-5 h-5 ${ENG_ACCENT.text}"></i> Resultado da Validação
        </h2>
        <div class="flex gap-6 text-right">
          <div><p class="text-[10px] text-neutral-500 uppercase font-black tracking-widest">Total Módulos</p><p class="text-base font-black text-white">${inputs.moduleCount} <span class="text-neutral-500 text-xs">(${inputs.modulePower}Wp)</span></p></div>
          <div><p class="text-[10px] text-neutral-500 uppercase font-black tracking-widest">Overload</p><p class="text-base font-black ${ENG_ACCENT.text}">${powerRatioPercent.toFixed(1)}%</p></div>
        </div>
      </div>

      <div>
        <h3 class="text-sm font-black text-white uppercase tracking-widest mb-3">Dimensionamento CA</h3>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          ${metric('Corrente Nominal', `${nominalCurrent.toFixed(1)} A`)}
          ${metric('Projeto (+25%)', `${projectCurrent.toFixed(1)} A`)}
          ${metric('Disjuntor', `${breaker} A`, 'text-sky-400')}
          ${metric(`Cabo (FCA ${inputs.groupingFactor})`, cable, 'text-emerald-400')}
        </div>
      </div>

      <div>
        <h3 class="text-sm font-black text-white uppercase tracking-widest mb-3">Dimensionamento Lado CC</h3>
        <div class="bg-emerald-950/40 border border-emerald-700/50 p-3 flex items-center gap-2 mb-3">
          <i data-lucide="check-circle-2" class="w-5 h-5 text-emerald-400 shrink-0"></i>
          <div><strong class="text-emerald-400 block text-sm">Configuração Válida</strong><span class="text-neutral-400 text-xs">Dentro dos limites. Tensão máx. da string (Voc frio): ${maxVStringGlobal.toFixed(1)} V</span></div>
        </div>
        ${vDropHTML}
        <div class="bg-neutral-900/60 border border-neutral-800 p-5 mt-4 overflow-x-auto">
          <div class="flex justify-between items-center mb-6 border-b border-neutral-800 pb-3">
            <h4 class="text-white font-black uppercase tracking-widest text-xs">Arranjo Fotovoltaico (Diagrama Unifilar)</h4>
            <button onclick="engToggleStringEditor()" class="text-[10px] font-black uppercase tracking-widest bg-neutral-800 hover:bg-sky-600 text-white px-3 py-1.5 transition-colors flex items-center gap-1.5">
              <i data-lucide="settings-2" class="w-3.5 h-3.5"></i> Personalizar
            </button>
          </div>
          <div id="eng-string-editor" class="hidden mb-6 bg-black/50 p-4 border border-neutral-700"></div>
          <div id="eng-visual-strings" class="flex items-stretch min-w-[600px]">
            <div class="flex-grow space-y-6 flex flex-col justify-center py-4">
              ${engRenderVisualStrings(distribution)}
            </div>
            <div class="w-1.5 bg-sky-500 mx-6 relative shadow-[0_0_15px_rgba(14,165,233,0.5)] z-10">
              <div class="absolute top-1/2 right-0 w-6 h-1 bg-sky-500"></div>
            </div>
            <div class="w-40 flex items-center justify-start">
              <div class="bg-neutral-800 border-2 border-neutral-600 text-neutral-300 font-bold p-4 text-center relative">
                <i data-lucide="box" class="w-7 h-7 mb-1 text-sky-400 mx-auto"></i>
                <div class="text-[10px] uppercase tracking-widest text-neutral-500">Inversor</div>
                <div class="text-lg text-white font-black">${(inputs.inverterPower / 1000).toFixed(1)} kW</div>
                <div class="absolute top-1/2 -left-2 w-3 h-3 bg-sky-500 rounded-full -translate-y-1/2"></div>
              </div>
            </div>
          </div>
        </div>
        ${engRenderMpptTable(distribution, inputs)}
      </div>

      <div>
        <h3 class="text-sm font-black text-white uppercase tracking-widest mb-3 text-center">Estimativa de Geração: ${totalAnnualGeneration.toFixed(0)} kWh/ano</h3>
        <div class="h-64 relative bg-neutral-900/60 border border-neutral-800 p-3 mb-4"><canvas id="eng-generation-chart"></canvas></div>
        ${engRenderMonthlyTable(monthlyGeneration)}

        ${state.eng.currentProjectId ? `
        <div class="mt-6 bg-neutral-900/60 border border-neutral-800 p-3">
          <button onclick="engSalvarNoProjeto()" class="w-full px-5 py-3 bg-neutral-800 border border-neutral-700 hover:border-sky-500 text-white font-black uppercase tracking-widest text-xs flex items-center justify-center gap-1.5 transition-colors"><i data-lucide="save" class="w-4 h-4"></i> Salvar no projeto "${engEscAttr(state.eng.currentProjectName || '')}"</button>
          <p class="text-[10px] text-neutral-600 mt-2 text-center">Salva os dados e o resultado no projeto e marca como "Concluído".</p>
        </div>` : `
        <div class="mt-6 grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 bg-neutral-900/60 border border-neutral-800 p-3">
          <input id="eng-proj-nome" placeholder="Nome do projeto" value="${engEscAttr((state.eng && state.eng.currentProjectName) || '')}" class="${ENG_INP}">
          <input id="eng-proj-cliente" placeholder="Cliente (opcional)" class="${ENG_INP}">
          <button onclick="engSalvarProjeto()" class="px-5 py-2 bg-neutral-800 border border-neutral-700 hover:border-sky-500 text-white font-black uppercase tracking-widest text-xs flex items-center justify-center gap-1.5 transition-colors"><i data-lucide="save" class="w-4 h-4"></i> Salvar Projeto</button>
        </div>`}

        <button onclick="engGerarPdf()" id="eng-pdf-button" class="w-full mt-3 bg-gradient-to-r ${ENG_ACCENT.grad} text-black font-black uppercase tracking-widest py-3 flex items-center justify-center gap-2 hover:opacity-90 transition-opacity">
          <i data-lucide="file-text" class="w-4 h-4"></i> Gerar PDF Técnico
        </button>
      </div>
    </div>`;
}

function engRenderVisualStrings(distribution) {
  return distribution.map((d, index) => {
    if (d.numStrings === 0) return '';
    const stringsRows = Array(d.numStrings).fill(0).map(() => {
      const modulesHTML = Array(d.modulesPerString).fill(0).map(() =>
        `<div class="w-7 h-11 bg-sky-600 border border-sky-400 relative"><div class="absolute top-1/2 left-0 w-full h-px bg-sky-300/50"></div></div>`
      ).join('');
      return `
        <div class="flex items-center mb-3 last:mb-0 relative">
          <div class="relative w-6 h-11 mr-2 shrink-0 opacity-70"><div class="absolute top-[40%] w-full h-0.5 bg-red-500"></div><div class="absolute top-[60%] w-full h-0.5 bg-neutral-900"></div></div>
          <div class="flex gap-1 z-10 flex-nowrap mr-2">${modulesHTML}</div>
          <div class="flex-grow h-0.5 bg-red-500 relative opacity-80 min-w-[40px] mt-[-6px]"></div>
        </div>`;
    }).join('');
    return `<div class="flex border-b border-neutral-800 pb-6 mb-6 last:border-0 last:mb-0 last:pb-0 relative"><div class="w-24 flex flex-col justify-center items-end pr-5 shrink-0 border-r border-neutral-800 mr-4"><span class="text-sky-400 font-black text-base leading-tight">MPPT ${index + 1}</span><span class="text-[10px] text-neutral-400 mt-1 bg-neutral-800 px-2 py-1 border border-neutral-700">${d.numStrings} string${d.numStrings > 1 ? 's' : ''}</span></div><div class="flex-grow flex flex-col justify-center w-full">${stringsRows}</div></div>`;
  }).join('');
}

function engRenderMpptTable(distribution, inputs) {
  let rows = '';
  let hasData = false;
  distribution.forEach((d, i) => {
    if (d.numStrings === 0) return;
    hasData = true;
    const vocTotal = d.modulesPerString * inputs.moduleVoc;
    const iscTotal = d.numStrings * inputs.moduleIsc;
    const powerKw = (d.numStrings * d.modulesPerString * inputs.modulePower) / 1000;
    rows += `<tr class="border-b border-neutral-800/70"><td class="px-4 py-3 text-center font-black text-sky-400">MPPT ${i + 1}</td><td class="px-4 py-3 text-center text-neutral-300">${d.numStrings}x ${d.modulesPerString}</td><td class="px-4 py-3 text-center font-mono text-sky-300">${vocTotal.toFixed(1)} V</td><td class="px-4 py-3 text-center font-mono text-emerald-300">${iscTotal.toFixed(1)} A</td><td class="px-4 py-3 text-center font-black text-white">${powerKw.toFixed(2)} kWp</td></tr>`;
  });
  if (!hasData) return '';
  return `
    <div class="mt-6 border border-neutral-800 bg-neutral-900/60 overflow-hidden">
      <h4 class="px-4 py-3 bg-black/50 text-neutral-200 font-black uppercase tracking-widest text-xs border-b border-neutral-800 flex items-center gap-2"><i data-lucide="table" class="w-3.5 h-3.5"></i> Dados Elétricos por MPPT (STC)</h4>
      <div class="overflow-x-auto"><table class="w-full text-left text-sm">
        <thead class="bg-black/30 text-[10px] uppercase text-neutral-500 font-black tracking-widest"><tr><th class="px-4 py-3 text-center">MPPT</th><th class="px-4 py-3 text-center">Arranjo</th><th class="px-4 py-3 text-center text-sky-400">Tensão (Voc)</th><th class="px-4 py-3 text-center text-emerald-400">Corrente (Isc)</th><th class="px-4 py-3 text-center">Potência</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
    </div>`;
}

function engRenderMonthlyTable(data) {
  const months = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
  let header = '', body = '';
  data.forEach((val, i) => {
    header += `<th class="py-3 px-2 text-[10px] font-black text-neutral-500 uppercase tracking-widest">${months[i]}</th>`;
    body += `<td class="py-3 px-2 text-sm font-black text-white border-t border-neutral-800">${val.toFixed(0)}</td>`;
  });
  return `
    <div class="border border-neutral-800 bg-neutral-900/60 overflow-hidden">
      <h4 class="px-4 py-3 bg-black/50 text-white font-black uppercase tracking-widest text-xs border-b border-neutral-800">Geração Mensal Estimada (kWh)</h4>
      <div class="overflow-x-auto"><table class="w-full text-center min-w-[600px]"><thead class="bg-black/30"><tr>${header}</tr></thead><tbody><tr>${body}</tr></tbody></table></div>
    </div>`;
}

function engRenderVoltageDrop(inputs, stringLength) {
  if (!inputs.moduleImp || !inputs.moduleVmp || !stringLength) return '';
  const dist = inputs.cableDistance || 0;
  const bitola = inputs.dcCableSize || 6;
  const rho = 0.0172;
  const resistencia = (rho * 2 * dist) / bitola;
  const vDrop = resistencia * inputs.moduleImp;
  const vString = inputs.moduleVmp * stringLength;
  const percent = (vDrop / vString) * 100;

  let tone, bar, label;
  if (percent < 1) { tone = 'text-emerald-400'; bar = 'bg-emerald-500'; label = `<span class="text-[10px] bg-emerald-950/50 text-emerald-400 px-3 py-1 border border-emerald-800/50 font-black uppercase tracking-widest">Ideal</span>`; }
  else if (percent < 3) { tone = 'text-yellow-400'; bar = 'bg-yellow-500'; label = `<span class="text-[10px] bg-yellow-950/40 text-yellow-400 px-3 py-1 border border-yellow-800/50 font-black uppercase tracking-widest">Atenção</span>`; }
  else { tone = 'text-red-400'; bar = 'bg-red-500'; label = `<span class="text-[10px] bg-red-950/50 text-red-400 px-3 py-1 border border-red-800 font-black uppercase tracking-widest">Crítico</span>`; }
  const barWidth = Math.min((percent / 5) * 100, 100);

  return `
    <div class="mt-4 bg-neutral-900/60 border border-neutral-800 overflow-hidden">
      <div class="bg-black/50 px-5 py-3 border-b border-neutral-800 flex justify-between items-center">
        <h4 class="text-xs font-black text-neutral-300 uppercase tracking-widest flex items-center gap-2"><i data-lucide="trending-down" class="w-4 h-4"></i> Queda de Tensão (CC)</h4>${label}
      </div>
      <div class="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-neutral-800 p-5 items-center">
        <div class="flex flex-col justify-center space-y-3 px-2">
          <div class="flex justify-between items-center"><span class="text-xs text-neutral-500 font-bold">Distância (x2)</span><span class="text-sm font-black text-white">${dist} m</span></div>
          <div class="flex justify-between items-center"><span class="text-xs text-neutral-500 font-bold">Bitola Cabo</span><span class="text-sm font-black text-amber-400">${bitola} mm²</span></div>
        </div>
        <div class="flex flex-col items-center justify-center px-2 py-4 md:py-0">
          <span class="text-[10px] uppercase text-neutral-500 font-black mb-1 tracking-widest">Queda em Volts</span>
          <span class="text-3xl font-mono text-neutral-100 font-black">${vDrop.toFixed(2)} <span class="text-base text-neutral-500">V</span></span>
          <span class="text-[10px] text-neutral-600 mt-1">Resistência R = ${resistencia.toFixed(3)} Ω</span>
        </div>
        <div class="flex flex-col justify-center px-2 pt-2 md:pt-0">
          <div class="flex justify-between items-end mb-2"><span class="text-[10px] uppercase text-neutral-500 font-black tracking-widest">Impacto %</span><span class="text-3xl font-black ${tone}">${percent.toFixed(2)}%</span></div>
          <div class="w-full bg-black h-3 border border-neutral-700 relative overflow-hidden"><div class="${bar} h-full transition-all duration-500" style="width:${barWidth}%"></div></div>
          <div class="flex justify-between text-[9px] text-neutral-600 mt-1 font-mono"><span>0%</span><span>Limite: 3%</span><span>5%</span></div>
        </div>
      </div>
    </div>`;
}

function engCreateChart(monthly, total) {
  const cv = document.getElementById('eng-generation-chart');
  if (!cv || !window.Chart) return;
  if (engChartInstance) { engChartInstance.destroy(); engChartInstance = null; }
  const ctx = cv.getContext('2d');
  engChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'],
      datasets: [{ label: 'kWh', data: monthly, backgroundColor: '#0ea5e9', borderRadius: 2 }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { grid: { color: '#262626' }, ticks: { color: '#9ca3af' } },
        x: { grid: { display: false }, ticks: { color: '#9ca3af' } },
      },
    },
  });
}

// ==========================================
// EDIÇÃO MANUAL DE STRINGS (re-skin) — distribui módulos manualmente entre MPPTs.
// ==========================================
function engToggleStringEditor() {
  const editor = document.getElementById('eng-string-editor');
  const visual = document.getElementById('eng-visual-strings');
  if (!editor || !visual) return;

  if (!editor.classList.contains('hidden')) {
    editor.classList.add('hidden');
    visual.classList.remove('opacity-40', 'pointer-events-none');
    return;
  }

  const dist = state.eng.lastResult.distribution;
  const inputs = state.eng.lastResult.inputs;

  let html = `
    <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
      <div class="col-span-1 md:col-span-2 text-xs text-neutral-400">
        <i data-lucide="info" class="w-3.5 h-3.5 inline text-sky-400"></i>
        Distribua os <strong class="text-white">${inputs.moduleCount}</strong> módulos manualmente. O sistema valida tensão e corrente.
      </div>`;
  for (let i = 0; i < inputs.mpptCount; i++) {
    const d = dist[i] || { numStrings: 0, modulesPerString: 0 };
    html += `
      <div class="bg-neutral-900 p-3 border border-neutral-700">
        <strong class="text-sky-400 block mb-2 text-xs uppercase tracking-widest">MPPT ${i + 1}</strong>
        <div class="flex gap-2">
          <div class="flex-1">
            <label class="text-[10px] text-neutral-500 uppercase tracking-widest">Strings</label>
            <input type="number" id="eng_manual_str_${i}" value="${d.numStrings}" class="w-full bg-black border border-neutral-700 text-white px-2 py-1 text-sm focus:border-sky-500 outline-none">
          </div>
          <div class="flex-1">
            <label class="text-[10px] text-neutral-500 uppercase tracking-widest">Módulos/String</label>
            <input type="number" id="eng_manual_mod_${i}" value="${d.modulesPerString}" class="w-full bg-black border border-neutral-700 text-white px-2 py-1 text-sm focus:border-sky-500 outline-none">
          </div>
        </div>
      </div>`;
  }
  html += `</div>
    <div class="flex gap-2 justify-end">
      <button onclick="engToggleStringEditor()" class="text-xs font-black uppercase tracking-widest text-neutral-400 hover:text-white px-3 py-1.5">Cancelar</button>
      <button onclick="engApplyManualStringConfig()" class="bg-sky-600 hover:bg-sky-500 text-white text-xs font-black uppercase tracking-widest px-4 py-2 flex items-center gap-1.5 transition-colors">
        <i data-lucide="check" class="w-3.5 h-3.5"></i> Aplicar
      </button>
    </div>`;

  editor.innerHTML = html;
  editor.classList.remove('hidden');
  visual.classList.add('opacity-40', 'pointer-events-none');
  if (window.lucide) lucide.createIcons();
}

function engApplyManualStringConfig() {
  const inputs = state.eng.lastResult.inputs;
  const newDistribution = [];
  let totalModulesUsed = 0;
  let electricalError = null;
  let maxV = 0;

  for (let i = 0; i < inputs.mpptCount; i++) {
    const numS = parseInt(document.getElementById(`eng_manual_str_${i}`).value) || 0;
    const modS = parseInt(document.getElementById(`eng_manual_mod_${i}`).value) || 0;
    const vocString = modS * state.eng.lastResult.vocCorrected;
    const iscTotal = numS * inputs.moduleIsc;
    if (vocString > inputs.inverterMaxV) electricalError = `Tensão excessiva na MPPT ${i + 1} (${vocString.toFixed(1)}V > ${inputs.inverterMaxV}V)`;
    if (iscTotal > inputs.mpptMaxA) electricalError = `Corrente excessiva na MPPT ${i + 1} (${iscTotal.toFixed(1)}A > ${inputs.mpptMaxA}A)`;
    if (vocString > maxV) maxV = vocString;
    totalModulesUsed += (numS * modS);
    newDistribution.push({ numStrings: numS, modulesPerString: modS });
  }

  if (electricalError) { showToast(electricalError); return; }
  if (totalModulesUsed !== inputs.moduleCount) {
    showToast(`Módulos incorretos: você usou ${totalModulesUsed}, o projeto tem ${inputs.moduleCount}.`);
    return;
  }

  state.eng.lastResult.distribution = newDistribution;
  state.eng.lastResult.maxVStringGlobal = maxV;

  const box = document.getElementById('eng-results');
  box.innerHTML = engRenderReport(state.eng.lastResult);
  engCreateChart(state.eng.lastResult.monthlyGeneration, state.eng.lastResult.totalAnnualGeneration);
  if (window.lucide) lucide.createIcons();
  showToast('Arranjo personalizado aplicado.');
}

// ==========================================
// PDF TÉCNICO (jsPDF + AutoTable) — adaptado aos dados da plataforma
// (perfil + franquia, sem CREA/tarifa). Acento azul/índigo.
// ==========================================
async function engGerarPdf() {
  const data = state.eng && state.eng.lastResult;
  if (!data || !data.inputs) { showToast('Valide uma configuração antes de gerar o PDF.'); return; }
  if (!window.jspdf || !window.jspdf.jsPDF) { showToast('Biblioteca de PDF não carregada. Recarregue a página.'); return; }

  const btn = document.getElementById('eng-pdf-button');
  const originalHTML = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = 'Gerando PDF...'; }

  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const inputs = data.inputs;

    // Dados do responsável a partir do estado da plataforma.
    const resp = {
      nome:     (state.profile && state.profile.nome)     || (state.currentUser && state.currentUser.email) || 'Responsável Técnico',
      email:    (state.currentUser && state.currentUser.email) || '',
      empresa:  state.franquiaNome || '',
      telefone: (state.profile && state.profile.telefone) || '',
    };
    const projectName = (state.eng && state.eng.currentProjectName) || 'Simulação Técnica';

    // Cores (acento azul/índigo "blueprint").
    const primaryColor = [2, 132, 199];   // sky-600
    const darkColor    = [31, 41, 55];    // slate-800
    const grayColor    = [107, 114, 128]; // gray-500

    // --- Cabeçalho ---
    doc.setFillColor(...primaryColor);
    doc.rect(0, 0, 8, 297, 'F');
    if (resp.empresa) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(150);
      doc.text(resp.empresa.toUpperCase(), 20, 15);
    }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(22); doc.setTextColor(...darkColor);
    doc.text('Relatório Técnico Fotovoltaico', 20, 25);
    doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(...grayColor);
    const today = new Date();
    doc.text(`Emitido em: ${today.toLocaleDateString('pt-BR')} às ${today.toLocaleTimeString('pt-BR')}`, 20, 31);
    doc.setDrawColor(200, 200, 200); doc.line(20, 36, 190, 36);

    let currentY = 50;

    // --- 1. Resumo do Projeto e Responsável ---
    doc.setFontSize(12); doc.setTextColor(...darkColor); doc.setFont('helvetica', 'bold');
    doc.text('1. Resumo do Projeto e Responsabilidade Técnica', 20, currentY);
    currentY += 8;

    const infoData = [
      [{ content: 'DADOS DO PROJETO', colSpan: 2, styles: { fontStyle: 'bold', fillColor: [245, 245, 245] } },
       { content: 'RESPONSÁVEL', colSpan: 2, styles: { fontStyle: 'bold', fillColor: [245, 245, 245] } }],
      ['Projeto:', projectName, 'Nome:', resp.nome],
      ['Potência:', `${data.potenciaPico.toFixed(2)} kWp`, 'Empresa:', resp.empresa || '-'],
      ['Inversor:', `${(inputs.inverterPower / 1000)} kW (${inputs.invBrand || 'Genérico'})`, 'Contato:', resp.telefone || resp.email || '-'],
      ['Geração Est.:', `${data.geracaoMedia.toFixed(0)} kWh/mês`, 'Email:', resp.email || '-'],
    ];
    doc.autoTable({
      startY: currentY, body: infoData, theme: 'plain',
      styles: { fontSize: 10, cellPadding: 2, lineColor: [230, 230, 230], lineWidth: 0.1 },
      columnStyles: { 0: { fontStyle: 'bold', width: 25 }, 1: { width: 65 }, 2: { fontStyle: 'bold', width: 30 } },
      margin: { left: 20 },
    });
    currentY = doc.lastAutoTable.finalY + 15;

    // --- 2. Geração (gráfico + tabela) ---
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
    doc.text('2. Estimativa de Geração', 20, currentY);
    const canvas = document.getElementById('eng-generation-chart');
    if (canvas) {
      const tmp = document.createElement('canvas');
      tmp.width = canvas.width; tmp.height = canvas.height;
      const ctx = tmp.getContext('2d');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, tmp.width, tmp.height);
      ctx.drawImage(canvas, 0, 0);
      doc.addImage(tmp.toDataURL('image/jpeg', 1.0), 'JPEG', 20, currentY + 5, 170, 70);
      currentY += 80;
    }
    const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const gen = data.monthlyGeneration.map(v => v.toFixed(0));
    doc.autoTable({
      startY: currentY,
      body: [months.slice(0, 6), gen.slice(0, 6), months.slice(6, 12), gen.slice(6, 12)],
      theme: 'grid', styles: { fontSize: 9, halign: 'center' },
      didParseCell: (d) => { if (d.row.index % 2 === 0) { d.cell.styles.fillColor = [240, 240, 240]; d.cell.styles.fontStyle = 'bold'; } },
      margin: { left: 20 },
    });
    currentY = doc.lastAutoTable.finalY + 15;

    // --- 3. Dimensionamento CA (recomputado dos inputs) ---
    const voltage = inputs.gridType.includes('380') ? 380 : (inputs.gridType.includes('220') ? 220 : 127);
    const isThreePhase = inputs.gridType.includes('trifasico');
    const nominalCurrent = inputs.inverterPower / (isThreePhase ? voltage * 1.732 : voltage);
    const projectCurrent = nominalCurrent * 1.25;
    const breakers = [16, 25, 32, 40, 50, 63, 70, 80, 100, 125, 150, 175, 200, 250];
    const breaker = breakers.find(b => b >= projectCurrent) || 250;
    let cable = 'Consulte';
    const cableTable = isThreePhase
      ? { '2.5': 21, '4': 28, '6': 36, '10': 50, '16': 68, '25': 89, '35': 111, '50': 134, '70': 171, '95': 207 }
      : { '2.5': 24, '4': 32, '6': 41, '10': 57, '16': 76, '25': 101, '35': 125 };
    for (const [bitola, amp] of Object.entries(cableTable)) { if (amp * inputs.groupingFactor >= breaker) { cable = bitola + ' mm²'; break; } }

    if (currentY > 240) { doc.addPage(); doc.setFillColor(...primaryColor); doc.rect(0, 0, 8, 297, 'F'); currentY = 20; }
    doc.setFont('helvetica', 'bold'); doc.setTextColor(...darkColor);
    doc.text('3. Dimensionamento de Cabos e Proteções (CA)', 20, currentY);
    currentY += 5;
    doc.autoTable({
      startY: currentY,
      head: [['Parâmetro', 'Especificação']],
      body: [
        ['Tensão de Rede', `${voltage}V (${isThreePhase ? 'Trifásico' : 'Mono/Bifásico'})`],
        ['Corrente Nominal', `${nominalCurrent.toFixed(1)} A`],
        ['Corrente de Projeto (+25%)', `${projectCurrent.toFixed(1)} A`],
        ['Disjuntor Recomendado', `${breaker} A`],
        [`Cabo CA Sugerido (FCA ${inputs.groupingFactor})`, cable],
      ],
      theme: 'striped', headStyles: { fillColor: primaryColor, textColor: [255, 255, 255] }, margin: { left: 20 },
    });
    currentY = doc.lastAutoTable.finalY + 15;

    // --- 4. Queda de tensão (CC) ---
    let sectionN = 4;
    if (inputs.enableVdropCalc) {
      if (currentY > 250) { doc.addPage(); doc.setFillColor(...primaryColor); doc.rect(0, 0, 8, 297, 'F'); currentY = 20; }
      const activeMppt = data.distribution.find(d => d.numStrings > 0);
      const modsPerString = activeMppt ? activeMppt.modulesPerString : 1;
      const dist = inputs.cableDistance || 0;
      const bitola = inputs.dcCableSize || 6;
      const resistencia = (0.0172 * 2 * dist) / bitola;
      const vDrop = resistencia * inputs.moduleImp;
      const percent = (vDrop / (inputs.moduleVmp * modsPerString)) * 100;
      doc.setFont('helvetica', 'bold'); doc.setTextColor(...darkColor);
      doc.text('4. Análise de Queda de Tensão (CC)', 20, currentY);
      currentY += 5;
      doc.autoTable({
        startY: currentY,
        head: [['Parâmetro', 'Resultado']],
        body: [
          ['Distância (Arranjo-Inversor)', `${dist} metros`],
          ['Cabo CC Utilizado', `${bitola} mm²`],
          ['Perda Calculada', `${vDrop.toFixed(2)} V`],
          ['Impacto Percentual', `${percent.toFixed(2)}%`],
          ['Status', percent < 3 ? 'OK (Dentro da Norma <3%)' : 'ALERTA (Acima de 3%)'],
        ],
        theme: 'grid', headStyles: { fillColor: darkColor },
        didParseCell: (d) => { if (d.row.index === 4 && d.column.index === 1) { d.cell.styles.textColor = percent < 3 ? [22, 163, 74] : [220, 38, 38]; d.cell.styles.fontStyle = 'bold'; } },
        margin: { left: 20 },
      });
      currentY = doc.lastAutoTable.finalY + 15;
      sectionN = 5;
    }

    // --- 5. Configuração das strings ---
    if (currentY > 240) { doc.addPage(); doc.setFillColor(...primaryColor); doc.rect(0, 0, 8, 297, 'F'); currentY = 20; }
    doc.setFont('helvetica', 'bold'); doc.setTextColor(...darkColor);
    doc.text(`${sectionN}. Configuração das Strings`, 20, currentY);
    currentY += 5;
    const mpptRows = data.distribution.filter(d => d.numStrings > 0).map((d, i) => [
      `MPPT ${i + 1}`,
      `${d.numStrings} string(s) de ${d.modulesPerString} módulos`,
      `${(d.modulesPerString * data.vocCorrected).toFixed(1)} V`,
      `${(d.numStrings * inputs.moduleIsc).toFixed(1)} A`,
    ]);
    doc.autoTable({
      startY: currentY,
      head: [['Entrada', 'Configuração', 'Tensão Voc (Frio)', 'Corrente Isc']],
      body: mpptRows, theme: 'striped', headStyles: { fillColor: darkColor },
      styles: { halign: 'center' }, columnStyles: { 0: { fontStyle: 'bold' }, 1: { halign: 'left' } }, margin: { left: 20 },
    });

    // --- Rodapé ---
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i); doc.setFontSize(8); doc.setTextColor(150);
      const footer = resp.empresa ? `${resp.empresa} · Ágil Solar — Engenharia` : 'Ágil Solar — Engenharia';
      doc.text(`Página ${i} de ${pageCount} · ${footer}`, 105, 290, { align: 'center' });
    }

    doc.save(`Relatorio_Solar_${projectName.replace(/\s+/g, '_')}.pdf`);
    showToast('PDF gerado com sucesso.');
  } catch (err) {
    console.error('[engenharia] PDF', err);
    showToast('Erro ao gerar PDF: ' + err.message);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = originalHTML; }
  }
}

// ==========================================
// CAMADA DE DADOS — estado local na Fase 4; Supabase liga na Fase 5.
// Quando ENG_DB_ENABLED = true, trocar os ramos locais por chamadas
// supabaseClient.from('eng_modulos'/'eng_inversores'/'eng_projetos').
// Os objetos já usam os nomes de coluna planejados, então o insert é direto.
// ==========================================
const ENG_DB_ENABLED = true; // Fase 5: persistência no Supabase ligada.

// Carrega catálogo de equipamentos da franquia (RLS filtra automaticamente).
async function engFetchEquip() {
  if (!ENG_DB_ENABLED) { state.eng.equipLoaded = true; return; }
  try {
    const [m, i] = await Promise.all([
      supabaseClient.from('eng_modulos').select('*').order('created_at', { ascending: false }),
      supabaseClient.from('eng_inversores').select('*').order('created_at', { ascending: false }),
    ]);
    if (!m.error) state.eng.modulos = m.data || [];
    if (!i.error) state.eng.inversores = i.data || [];
  } catch (e) { console.error('[engenharia] fetch equipamentos', e); }
  state.eng.equipLoaded = true;
}

// Carrega projetos salvos (RLS aplica a regra de carteira).
async function engFetchProjetos() {
  if (!ENG_DB_ENABLED) { state.eng.projLoaded = true; return; }
  try {
    const { data, error } = await supabaseClient.from('eng_projetos').select('*').order('created_at', { ascending: false });
    if (!error) state.eng.projetos = data || [];
  } catch (e) { console.error('[engenharia] fetch projetos', e); }
  state.eng.projLoaded = true;
}

async function engEquipSave(tipo, payload) {
  if (!ENG_DB_ENABLED) {
    const arr = tipo === 'modulo' ? state.eng.modulos : state.eng.inversores;
    payload.id = 'local_' + Date.now();
    payload.created_at = new Date().toISOString();
    arr.unshift(payload);
    return payload;
  }
  const table = tipo === 'modulo' ? 'eng_modulos' : 'eng_inversores';
  const row = { ...payload, franquia_id: state.franquiaId };
  const { data, error } = await supabaseClient.from(table).insert(row).select().single();
  if (error) { showToast('Erro ao salvar: ' + error.message); throw error; }
  const arr = tipo === 'modulo' ? state.eng.modulos : state.eng.inversores;
  arr.unshift(data);
  return data;
}

async function engEquipDelete(tipo, id) {
  const key = tipo === 'modulo' ? 'modulos' : 'inversores';
  if (!ENG_DB_ENABLED) {
    state.eng[key] = state.eng[key].filter(x => String(x.id) !== String(id));
    return;
  }
  const table = tipo === 'modulo' ? 'eng_modulos' : 'eng_inversores';
  const { error } = await supabaseClient.from(table).delete().eq('id', id);
  if (error) { showToast('Erro ao excluir: ' + error.message); throw error; }
  state.eng[key] = state.eng[key].filter(x => String(x.id) !== String(id));
}

async function engProjSave(payload) {
  if (!ENG_DB_ENABLED) {
    payload.id = 'local_' + Date.now();
    payload.created_at = new Date().toISOString();
    state.eng.projetos.unshift(payload);
    return payload;
  }
  const row = {
    ...payload,
    franquia_id: state.franquiaId,
    owner_user_id: state.currentUser ? state.currentUser.id : null,
  };
  const { data, error } = await supabaseClient.from('eng_projetos').insert(row).select().single();
  if (error) { showToast('Erro ao salvar projeto: ' + error.message); throw error; }
  state.eng.projetos.unshift(data);
  return data;
}

async function engProjDelete(id) {
  if (!ENG_DB_ENABLED) {
    state.eng.projetos = state.eng.projetos.filter(x => String(x.id) !== String(id));
    return;
  }
  const { error } = await supabaseClient.from('eng_projetos').delete().eq('id', id);
  if (error) { showToast('Erro ao excluir projeto: ' + error.message); throw error; }
  state.eng.projetos = state.eng.projetos.filter(x => String(x.id) !== String(id));
}

// ==========================================
// APLICAR PRESET na calculadora (usado pelos selects da Calculadora e pela
// ação "Usar" na aba Equipamentos).
// ==========================================
function engApplyModuloPreset(id) {
  if (!id) return;
  const m = state.eng.modulos.find(x => String(x.id) === String(id));
  if (!m) return;
  state.eng.inputs = { ...state.eng.inputs,
    modBrand: m.marca, modModel: m.modelo, modulePower: m.potencia,
    moduleVmp: m.vmp, moduleImp: m.imp, moduleVoc: m.voc, moduleIsc: m.isc,
    tempCoef: m.coef_temp, minTemp: m.temp_min };
  // Auto-fill: no modo projeto, deriva o nº de módulos a partir do alvo de kWp.
  let msg = `Módulo "${m.marca} ${m.modelo}" carregado.`;
  if (state.eng.targetKwp && m.potencia > 0) {
    const n = Math.round((state.eng.targetKwp * 1000) / m.potencia);
    if (n > 0) { state.eng.inputs.moduleCount = n; msg += ` ${n} módulos p/ ${engFmtNum(state.eng.targetKwp, 2)} kWp.`; }
  }
  engGoToCalcWithPreset(msg);
}

function engApplyInversorPreset(id) {
  if (!id) return;
  const i = state.eng.inversores.find(x => String(x.id) === String(id));
  if (!i) return;
  state.eng.inputs = { ...state.eng.inputs,
    invBrand: i.marca, invModel: i.modelo, inverterPower: i.potencia,
    gridType: i.tipo_rede, overload: i.overload, mpptCount: i.num_mppts,
    connectorsPerMppt: i.conector_config, mpptMinV: i.v_min, inverterMaxV: i.v_max, mpptMaxA: i.i_max };
  engGoToCalcWithPreset(`Inversor "${i.marca} ${i.modelo}" carregado.`);
}

// Re-renderiza a calculadora (se já estiver nela) ou navega até ela.
function engGoToCalcWithPreset(msg) {
  if (state.environment === 'engenharia' && state.engActiveTab === 'calculadora') {
    const c = document.getElementById('main-container');
    if (c) renderEngCalculadora(c);
  } else {
    setTab('calculadora');
  }
  if (msg) showToast(msg);
}

// ==========================================
// RENDERIZADORES — Equipamentos
// ==========================================
function renderEngEquipamentos(container) {
  if (ENG_DB_ENABLED && !state.eng.equipLoaded) {
    engFetchEquip().then(() => {
      if (state.environment === 'engenharia' && state.engActiveTab === 'equipamentos') renderEngEquipamentos(container);
    });
  }
  const redeOpts = [
    { v: '220_trifasico', l: '220V Trifásico' },
    { v: '380_trifasico', l: '380V Trifásico' },
    { v: '220_bifasico',  l: '220V Bifásico' },
    { v: '127_monofasico', l: '127V Monofásico' },
  ];
  const inp = 'w-full bg-black border border-neutral-700 focus:border-sky-500 px-2 py-1.5 text-white text-sm font-mono outline-none transition-colors';
  const lbl = 'block text-[9px] font-black uppercase tracking-widest text-neutral-500 mb-1';

  // Lista de módulos
  const modulosList = state.eng.modulos.length === 0
    ? `<p class="text-neutral-600 text-xs py-4 text-center">Nenhum módulo cadastrado.</p>`
    : state.eng.modulos.map(m => `
        <div class="flex items-center justify-between gap-3 border-b border-neutral-800/70 py-2.5">
          <div class="min-w-0">
            <p class="text-white text-sm font-bold truncate">${engEscAttr(m.marca)} <span class="text-neutral-400 font-normal">${engEscAttr(m.modelo)}</span></p>
            <p class="text-[10px] text-neutral-500 font-mono">${m.potencia}Wp · Voc ${m.voc}V · Isc ${m.isc}A</p>
          </div>
          <div class="flex items-center gap-1 shrink-0">
            <button onclick="engApplyModuloPreset('${m.id}')" title="Usar na calculadora" class="p-2 text-sky-400 hover:bg-sky-500/10 transition-colors"><i data-lucide="arrow-right-circle" class="w-4 h-4"></i></button>
            <button onclick="engExcluirEquip('modulo','${m.id}')" title="Excluir" class="p-2 text-red-500/70 hover:text-red-400 hover:bg-red-500/10 transition-colors"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
          </div>
        </div>`).join('');

  // Lista de inversores
  const inversoresList = state.eng.inversores.length === 0
    ? `<p class="text-neutral-600 text-xs py-4 text-center">Nenhum inversor cadastrado.</p>`
    : state.eng.inversores.map(i => `
        <div class="flex items-center justify-between gap-3 border-b border-neutral-800/70 py-2.5">
          <div class="min-w-0">
            <p class="text-white text-sm font-bold truncate">${engEscAttr(i.marca)} <span class="text-neutral-400 font-normal">${engEscAttr(i.modelo)}</span></p>
            <p class="text-[10px] text-neutral-500 font-mono">${(i.potencia/1000).toFixed(1)}kW · ${i.num_mppts} MPPT · ${i.v_max}V máx</p>
          </div>
          <div class="flex items-center gap-1 shrink-0">
            <button onclick="engApplyInversorPreset('${i.id}')" title="Usar na calculadora" class="p-2 text-sky-400 hover:bg-sky-500/10 transition-colors"><i data-lucide="arrow-right-circle" class="w-4 h-4"></i></button>
            <button onclick="engExcluirEquip('inversor','${i.id}')" title="Excluir" class="p-2 text-red-500/70 hover:text-red-400 hover:bg-red-500/10 transition-colors"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
          </div>
        </div>`).join('');

  container.innerHTML = `
    <div class="p-6 max-w-7xl mx-auto">
      ${engHeader('Equipamentos', 'Catálogo de módulos e inversores (compartilhado pela franquia)', 'cpu')}
      ${ENG_DB_ENABLED ? '' : `<div class="mb-5 flex items-center gap-2 text-[11px] text-amber-400/90 bg-amber-500/5 border border-amber-500/20 px-3 py-2"><i data-lucide="info" class="w-3.5 h-3.5"></i> Modo local: os equipamentos somem ao recarregar a página. A persistência no banco entra na próxima etapa.</div>`}

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">

        <!-- MÓDULOS -->
        ${engCard('bg-emerald-500', 'text-emerald-400', 'grid-3x3', 'Módulos', `
          <div class="grid grid-cols-2 gap-2 mb-2">
            <div><label class="${lbl}">Marca</label><input id="eng_eq_mod_marca" class="${inp}" placeholder="JA Solar"></div>
            <div><label class="${lbl}">Modelo</label><input id="eng_eq_mod_modelo" class="${inp}" placeholder="JAM72D40"></div>
            <div><label class="${lbl}">Potência (Wp)</label><input id="eng_eq_mod_potencia" type="number" class="${inp}" placeholder="585"></div>
            <div><label class="${lbl}">Coef. Temp (%/°C)</label><input id="eng_eq_mod_coef_temp" type="number" step="0.01" class="${inp}" placeholder="-0.27"></div>
            <div><label class="${lbl} text-sky-400">Vmp (V)</label><input id="eng_eq_mod_vmp" type="number" step="0.01" class="${inp}" placeholder="44.9"></div>
            <div><label class="${lbl} text-sky-400">Imp (A)</label><input id="eng_eq_mod_imp" type="number" step="0.01" class="${inp}" placeholder="13.04"></div>
            <div><label class="${lbl}">Voc (V)</label><input id="eng_eq_mod_voc" type="number" step="0.01" class="${inp}" placeholder="53.6"></div>
            <div><label class="${lbl}">Isc (A)</label><input id="eng_eq_mod_isc" type="number" step="0.01" class="${inp}" placeholder="13.8"></div>
            <div><label class="${lbl}">Temp Mín (°C)</label><input id="eng_eq_mod_temp_min" type="number" class="${inp}" placeholder="5"></div>
          </div>
          <button onclick="engEquipAdd('modulo')" class="w-full mt-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-black font-black uppercase tracking-widest text-xs flex items-center justify-center gap-1.5 transition-colors"><i data-lucide="plus" class="w-3.5 h-3.5"></i> Adicionar Módulo</button>
          <div class="mt-4">${modulosList}</div>
        `)}

        <!-- INVERSORES -->
        ${engCard('bg-amber-500', 'text-amber-400', 'server', 'Inversores', `
          <div class="grid grid-cols-2 gap-2 mb-2">
            <div><label class="${lbl}">Marca</label><input id="eng_eq_inv_marca" class="${inp}" placeholder="Growatt"></div>
            <div><label class="${lbl}">Modelo</label><input id="eng_eq_inv_modelo" class="${inp}" placeholder="MID 75KTL3-X"></div>
            <div><label class="${lbl}">Potência (W)</label><input id="eng_eq_inv_potencia" type="number" class="${inp}" placeholder="75000"></div>
            <div><label class="${lbl}">Overload (%)</label><input id="eng_eq_inv_overload" type="number" class="${inp}" placeholder="35"></div>
            <div class="col-span-2"><label class="${lbl}">Tipo de Rede</label><select id="eng_eq_inv_tipo_rede" class="${inp}">${redeOpts.map(o => `<option value="${o.v}">${o.l}</option>`).join('')}</select></div>
            <div><label class="${lbl}">Qtd MPPTs</label><input id="eng_eq_inv_num_mppts" type="number" class="${inp}" placeholder="8"></div>
            <div><label class="${lbl}">Entradas/MPPT</label><input id="eng_eq_inv_conector_config" class="${inp}" placeholder="2 ou 2,2,1"></div>
            <div><label class="${lbl}">V Mín (V)</label><input id="eng_eq_inv_v_min" type="number" class="${inp}" placeholder="200"></div>
            <div><label class="${lbl}">V Máx (V)</label><input id="eng_eq_inv_v_max" type="number" class="${inp}" placeholder="1100"></div>
            <div><label class="${lbl}">Corrente Máx/MPPT (A)</label><input id="eng_eq_inv_i_max" type="number" class="${inp}" placeholder="30"></div>
          </div>
          <button onclick="engEquipAdd('inversor')" class="w-full mt-1 py-2 bg-amber-600 hover:bg-amber-500 text-black font-black uppercase tracking-widest text-xs flex items-center justify-center gap-1.5 transition-colors"><i data-lucide="plus" class="w-3.5 h-3.5"></i> Adicionar Inversor</button>
          <div class="mt-4">${inversoresList}</div>
        `)}

      </div>
    </div>`;
  if (window.lucide) lucide.createIcons();
}

async function engEquipAdd(tipo) {
  const g = (id) => document.getElementById(id);
  let payload;
  if (tipo === 'modulo') {
    const marca = g('eng_eq_mod_marca').value.trim();
    const modelo = g('eng_eq_mod_modelo').value.trim();
    if (!marca || !modelo) { showToast('Preencha marca e modelo do módulo.'); return; }
    payload = {
      marca, modelo,
      potencia: parseFloat(g('eng_eq_mod_potencia').value) || 0,
      vmp: parseFloat(g('eng_eq_mod_vmp').value) || 0,
      imp: parseFloat(g('eng_eq_mod_imp').value) || 0,
      voc: parseFloat(g('eng_eq_mod_voc').value) || 0,
      isc: parseFloat(g('eng_eq_mod_isc').value) || 0,
      coef_temp: parseFloat(g('eng_eq_mod_coef_temp').value) || 0,
      temp_min: parseFloat(g('eng_eq_mod_temp_min').value) || 0,
    };
  } else {
    const marca = g('eng_eq_inv_marca').value.trim();
    const modelo = g('eng_eq_inv_modelo').value.trim();
    if (!marca || !modelo) { showToast('Preencha marca e modelo do inversor.'); return; }
    payload = {
      marca, modelo,
      potencia: parseFloat(g('eng_eq_inv_potencia').value) || 0,
      tipo_rede: g('eng_eq_inv_tipo_rede').value,
      overload: parseFloat(g('eng_eq_inv_overload').value) || 0,
      num_mppts: parseFloat(g('eng_eq_inv_num_mppts').value) || 0,
      conector_config: g('eng_eq_inv_conector_config').value.trim() || '2',
      v_min: parseFloat(g('eng_eq_inv_v_min').value) || 0,
      v_max: parseFloat(g('eng_eq_inv_v_max').value) || 0,
      i_max: parseFloat(g('eng_eq_inv_i_max').value) || 0,
    };
  }
  try { await engEquipSave(tipo, payload); }
  catch (_) { return; } // erro já exibido por engEquipSave
  showToast(tipo === 'modulo' ? 'Módulo adicionado.' : 'Inversor adicionado.');
  const c = document.getElementById('main-container');
  if (c) renderEngEquipamentos(c);
}

async function engExcluirEquip(tipo, id) {
  try { await engEquipDelete(tipo, id); }
  catch (_) { return; }
  const c = document.getElementById('main-container');
  if (c) renderEngEquipamentos(c);
  showToast('Equipamento removido.');
}

// ==========================================
// RENDERIZADORES — Projetos
// ==========================================
function renderEngProjetos(container) {
  if (ENG_DB_ENABLED && !state.eng.projLoaded) {
    engFetchProjetos().then(() => {
      if (state.environment === 'engenharia' && state.engActiveTab === 'projetos') renderEngProjetos(container);
    });
  }
  const lista = state.eng.projetos.length === 0
    ? `<div class="border border-dashed border-neutral-800 bg-neutral-900/40 p-10 text-center">
         <i data-lucide="folder-open" class="w-8 h-8 ${ENG_ACCENT.text} mx-auto mb-3"></i>
         <p class="text-neutral-400 text-sm font-bold uppercase tracking-widest">Nenhum projeto salvo</p>
         <p class="text-neutral-600 text-xs font-medium mt-2">Valide um dimensionamento na Calculadora e clique em "Salvar Projeto".</p>
       </div>`
    : `<div class="border border-neutral-800 bg-neutral-900/60 overflow-hidden">
        <table class="w-full text-left text-sm">
          <thead class="bg-black/30 text-[10px] uppercase text-neutral-500 font-black tracking-widest">
            <tr><th class="px-4 py-3">Projeto</th><th class="px-4 py-3">Cliente</th><th class="px-4 py-3 text-center">Potência</th><th class="px-4 py-3 text-center">Geração/mês</th><th class="px-4 py-3 text-right">Ações</th></tr>
          </thead>
          <tbody>
            ${state.eng.projetos.map(p => `
              <tr class="border-b border-neutral-800/70">
                <td class="px-4 py-3 text-white font-bold">${engEscAttr(p.nome_projeto)}</td>
                <td class="px-4 py-3 text-neutral-400">${engEscAttr(p.nome_cliente) || '—'}</td>
                <td class="px-4 py-3 text-center font-mono text-sky-300">${Number(p.potencia_pico_kwp).toFixed(2)} kWp</td>
                <td class="px-4 py-3 text-center font-mono text-emerald-300">${Number(p.geracao_media_kwh).toFixed(0)} kWh</td>
                <td class="px-4 py-3 text-right whitespace-nowrap">
                  <button onclick="engAbrirProjeto('${p.id}')" title="Abrir na calculadora" class="p-2 text-sky-400 hover:bg-sky-500/10 transition-colors"><i data-lucide="external-link" class="w-4 h-4"></i></button>
                  <button onclick="engExcluirProjeto('${p.id}')" title="Excluir" class="p-2 text-red-500/70 hover:text-red-400 hover:bg-red-500/10 transition-colors"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;

  container.innerHTML = `
    <div class="p-6 max-w-7xl mx-auto">
      ${engHeader('Projetos', 'Dimensionamentos salvos', 'folder-open')}
      ${ENG_DB_ENABLED ? '' : `<div class="mb-5 flex items-center gap-2 text-[11px] text-amber-400/90 bg-amber-500/5 border border-amber-500/20 px-3 py-2"><i data-lucide="info" class="w-3.5 h-3.5"></i> Modo local: os projetos somem ao recarregar a página. A persistência no banco entra na próxima etapa.</div>`}
      ${lista}
    </div>`;
  if (window.lucide) lucide.createIcons();
}

async function engSalvarProjeto() {
  const data = state.eng && state.eng.lastResult;
  if (!data) { showToast('Valide um dimensionamento antes de salvar.'); return; }
  const nomeEl = document.getElementById('eng-proj-nome');
  const cliEl = document.getElementById('eng-proj-cliente');
  const nome = nomeEl ? nomeEl.value.trim() : '';
  const cliente = cliEl ? cliEl.value.trim() : '';
  if (!nome) { showToast('Informe um nome para o projeto.'); if (nomeEl) nomeEl.focus(); return; }
  try {
    await engProjSave({
      nome_projeto: nome,
      nome_cliente: cliente,
      potencia_pico_kwp: data.potenciaPico,
      potencia_inversor_w: data.inputs.inverterPower,
      total_modulos: data.inputs.moduleCount,
      geracao_media_kwh: data.geracaoMedia,
      status: 'novo',
      dados_completos: { ...data.inputs },
    });
  } catch (_) { return; }
  state.eng.currentProjectName = nome;
  showToast('Projeto salvo.');
  if (nomeEl) nomeEl.value = '';
  if (cliEl) cliEl.value = '';
}

// Abre um projeto para dimensionar: entra em "modo projeto", define o alvo de kWp
// e pré-preenche a calculadora (dados salvos se houver; senão defaults + irradiação HSP).
function engAbrirProjeto(id) {
  const p = state.eng.projetos.find(x => String(x.id) === String(id));
  if (!p) return;
  state.eng.currentProjectId = p.id;
  state.eng.currentProjectName = p.nome_projeto || '';
  state.eng.targetKwp = Number(p.potencia_pico_kwp) || null;

  const base = (p.dados_completos && Object.keys(p.dados_completos).length) ? { ...p.dados_completos } : {};
  if (base.irradiation == null && state.franquiaHsp) base.irradiation = state.franquiaHsp;
  state.eng.inputs = base;

  setTab('calculadora');
  // Se já tem dimensionamento salvo, valida direto; senão mostra o form pré-preenchido.
  if (base.moduleCount && base.inverterPower && base.modulePower && typeof engCalcular === 'function') engCalcular();
}

async function engExcluirProjeto(id) {
  try { await engProjDelete(id); }
  catch (_) { return; }
  const c = document.getElementById('main-container');
  if (c) renderEngProjetos(c);
  showToast('Projeto excluído.');
}

// ==========================================
// RENDERIZADORES — Visão Geral (dashboard) e Funil
// ==========================================

// Rótulos das 4 etapas do funil de Engenharia (eng_projetos.etapa).
const ENG_ETAPAS = ['Aguardando dimensionamento', 'Em dimensionamento', 'Concluído', 'Documento gerado'];

// Card de KPI (molde espelhado de vistoria.js kpiCard, com acento configurável).
function engKpiCard(k) {
  const toneIc = { sky: 'text-sky-400', emerald: 'text-emerald-400', amber: 'text-amber-400', neutral: 'text-neutral-300' }[k.tone || 'sky'];
  return `
    <div class="metric-card relative p-4 bg-[#0c0c0c] border border-neutral-800">
      <div class="flex items-start justify-between">
        <span class="text-[9px] font-black uppercase tracking-widest text-neutral-500">${engEscAttr(k.label)}</span>
        <i data-lucide="${k.icon}" class="w-4 h-4 ${toneIc}"></i>
      </div>
      <div class="mt-3 text-3xl font-black text-white leading-none">${engEscAttr(k.value)}</div>
      <div class="mt-2 text-[10px] font-medium text-neutral-500 leading-snug">${engEscAttr(k.hint || '')}</div>
    </div>`;
}

function renderEngVisao(container) {
  if (ENG_DB_ENABLED && !state.eng.projLoaded) {
    engFetchProjetos().then(() => {
      if (state.environment === 'engenharia' && state.engActiveTab === 'visao') renderEngVisao(container);
    });
  }
  const projs = state.eng.projetos || [];
  const porEtapa = [0, 1, 2, 3].map(e => projs.filter(p => (p.etapa || 0) === e).length);
  const potTotal = projs.reduce((a, p) => a + (Number(p.potencia_pico_kwp) || 0), 0);

  const kpis = [
    { label: 'Projetos', value: String(projs.length), icon: 'folder-kanban', tone: 'sky', hint: 'na carteira' },
    { label: 'Aguardando dim.', value: String(porEtapa[0]), icon: 'inbox', tone: 'amber', hint: 'entraram na fila' },
    { label: 'Em dimensionamento', value: String(porEtapa[1]), icon: 'ruler', tone: 'sky', hint: 'sendo calculados' },
    { label: 'Potência em carteira', value: engFmtNum(potTotal, 1) + ' kWp', icon: 'zap', tone: 'emerald', hint: 'soma dimensionada' },
  ].map(engKpiCard).join('');

  const recentes = projs.slice(0, 6).map(p => `
    <button onclick="engAbrirProjeto('${p.id}')" class="w-full text-left flex items-center gap-3 px-3 py-2.5 border-b border-neutral-800/70 hover:bg-neutral-900/60 transition-colors">
      <div class="min-w-0 flex-1">
        <div class="text-[12px] font-black text-neutral-100 truncate">${engEscAttr(p.nome_projeto)}</div>
        <div class="text-[10px] text-neutral-500 truncate">${engEscAttr(p.nome_cliente || '—')}${p.cidade ? ' · ' + engEscAttr(p.cidade) : ''}</div>
      </div>
      <div class="text-right shrink-0">
        <div class="text-sm font-black text-sky-300">${engFmtNum(p.potencia_pico_kwp, 2)} kWp</div>
        <div class="text-[9px] font-black uppercase tracking-widest text-neutral-600">${ENG_ETAPAS[p.etapa || 0]}</div>
      </div>
    </button>`).join('') || `<div class="px-3 py-8 text-center text-neutral-600 text-xs">Nenhum projeto ainda.</div>`;

  const breakdown = ENG_ETAPAS.map((label, i) => `
    <div class="flex items-center justify-between px-3 py-2.5 border-b border-neutral-800/70">
      <div class="flex items-center gap-2.5">
        <span class="w-5 h-5 grid place-items-center text-[9px] font-black bg-sky-500/10 text-sky-300 border border-sky-500/20">${i}</span>
        <span class="text-[11px] font-bold text-neutral-300">${label}</span>
      </div>
      <span class="text-sm font-black text-white">${porEtapa[i]}</span>
    </div>`).join('');

  container.innerHTML = `
    <div class="p-6 max-w-7xl mx-auto">
      <!-- Hero -->
      <div class="relative overflow-hidden border border-sky-500/20 bg-gradient-to-br from-sky-500/10 to-indigo-500/10 p-5 md:p-6 mb-6">
        <div class="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.25em] text-sky-300">
          <i data-lucide="layout-dashboard" class="w-3.5 h-3.5"></i> Engenharia · Visão Geral
        </div>
        <h1 class="mt-2 text-2xl md:text-3xl font-black text-white uppercase tracking-wide">Dimensionamento Fotovoltaico</h1>
        <p class="mt-1 text-[12px] text-neutral-400 max-w-2xl">Portfólio de projetos, validações e estatísticas de especificação técnica.</p>
        <div class="mt-4 flex flex-wrap gap-2">
          <button onclick="engNovaSimulacao()" class="inline-flex items-center gap-2 px-4 py-2 text-[10px] font-black uppercase tracking-widest bg-gradient-to-r ${ENG_ACCENT.grad} text-black">
            <i data-lucide="calculator" class="w-3.5 h-3.5"></i> Nova simulação
          </button>
          <button onclick="setTab('funil')" class="inline-flex items-center gap-2 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-neutral-300 border border-neutral-700 hover:border-sky-500/40 transition-colors">
            <i data-lucide="git-merge" class="w-3.5 h-3.5"></i> Ver funil
          </button>
        </div>
      </div>

      <!-- KPIs -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">${kpis}</div>

      <!-- Recentes + breakdown -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div class="border border-neutral-800 bg-[#0a0a0a]">
          <div class="flex items-center justify-between px-3 py-2.5 border-b border-neutral-800">
            <span class="text-[10px] font-black uppercase tracking-widest text-neutral-300 flex items-center gap-2"><i data-lucide="history" class="w-3.5 h-3.5 text-sky-400"></i> Projetos recentes</span>
            <button onclick="setTab('projetos')" class="text-[9px] font-black uppercase tracking-widest text-sky-400 hover:underline">Ver todos</button>
          </div>
          <div>${recentes}</div>
        </div>
        <div class="border border-neutral-800 bg-[#0a0a0a]">
          <div class="flex items-center justify-between px-3 py-2.5 border-b border-neutral-800">
            <span class="text-[10px] font-black uppercase tracking-widest text-neutral-300 flex items-center gap-2"><i data-lucide="git-merge" class="w-3.5 h-3.5 text-sky-400"></i> Projetos por etapa</span>
            <button onclick="setTab('funil')" class="text-[9px] font-black uppercase tracking-widest text-sky-400 hover:underline">Abrir funil</button>
          </div>
          <div>${breakdown}</div>
        </div>
      </div>
    </div>`;
  if (window.lucide) lucide.createIcons();
}

// Funil — kanban de 4 etapas lendo eng_projetos.etapa.
function renderEngFunil(container) {
  if (ENG_DB_ENABLED && !state.eng.projLoaded) {
    engFetchProjetos().then(() => {
      if (state.environment === 'engenharia' && state.engActiveTab === 'funil') renderEngFunil(container);
    });
  }
  const projs = state.eng.projetos || [];
  const cols = ENG_ETAPAS.map((label, i) => {
    const items = projs.filter(p => (p.etapa || 0) === i);
    const pot = items.reduce((a, p) => a + (Number(p.potencia_pico_kwp) || 0), 0);
    const cards = items.map(engFunilCard).join('') || `<div class="px-2 py-6 text-center text-neutral-700 text-[10px]">—</div>`;
    return `
      <div class="flex flex-col min-w-0">
        <div class="flex items-center justify-between px-3 py-2.5 bg-neutral-950 border border-neutral-800">
          <div class="flex items-center gap-2 min-w-0">
            <span class="w-5 h-5 grid place-items-center text-[9px] font-black bg-sky-500/10 text-sky-300 border border-sky-500/20 shrink-0">${i}</span>
            <span class="text-[10px] font-black uppercase tracking-widest text-neutral-300 truncate">${label}</span>
          </div>
          <span class="text-[9px] font-black text-neutral-600 shrink-0">${items.length}</span>
        </div>
        <div class="px-3 py-1.5 bg-neutral-950/60 border-x border-neutral-800 text-[9px] font-bold uppercase tracking-widest text-neutral-500">${engFmtNum(pot, 1)} kWp</div>
        <div class="flex-1 space-y-2 p-2 bg-neutral-900/20 border border-neutral-800 min-h-[120px]">${cards}</div>
      </div>`;
  }).join('');

  container.innerHTML = `
    <div class="p-6 max-w-7xl mx-auto">
      ${engHeader('Funil', 'Do aguardando dimensionamento ao documento gerado', 'git-merge')}
      <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 items-start">${cols}</div>
    </div>`;
  if (window.lucide) lucide.createIcons();
}

function engFunilCard(p) {
  return `
    <div onclick="engOpenProjectDetail('${p.id}')" class="bg-neutral-950 border border-neutral-800 p-3 cursor-pointer hover:border-sky-500/40 transition-colors">
      <div class="font-black text-white text-sm truncate mb-1">${engEscAttr(p.nome_projeto)}</div>
      <div class="text-sky-300 font-black text-base mb-1">${engFmtNum(p.potencia_pico_kwp, 2)} kWp</div>
      <div class="text-[10px] text-neutral-500 truncate">${engEscAttr(p.nome_cliente || '—')}${p.cidade ? ' · ' + engEscAttr(p.cidade) : ''}</div>
    </div>`;
}

// --- Modal de detalhe do projeto ---
function engEnsureModal() {
  let m = document.getElementById('eng-modal');
  if (!m) {
    m = document.createElement('div');
    m.id = 'eng-modal';
    m.className = 'fixed inset-0 z-[90] hidden items-center justify-center p-4';
    m.innerHTML = `
      <div class="absolute inset-0 bg-black/75 backdrop-blur-sm" onclick="engCloseModal()"></div>
      <div id="eng-modal-card" class="relative w-full sm:max-w-lg bg-[#0a0a0a] border border-neutral-800 max-h-[92vh] overflow-y-auto"></div>`;
    document.body.appendChild(m);
  }
  return m;
}

function engCloseModal() {
  const m = document.getElementById('eng-modal');
  if (m) { m.classList.add('hidden'); m.classList.remove('flex'); }
}

function engModalRow(label, value) {
  return `<div><span class="text-[9px] font-black uppercase tracking-widest text-neutral-600">${label}</span><div class="text-sm text-white font-bold">${value}</div></div>`;
}

function engOpenProjectDetail(id) {
  const p = (state.eng.projetos || []).find(x => String(x.id) === String(id));
  if (!p) return;
  state.eng.currentProjectId = p.id;
  state.eng.currentProjectName = p.nome_projeto || '';
  const etapa = p.etapa || 0;
  const m = engEnsureModal();
  const card = m.querySelector('#eng-modal-card');
  card.innerHTML = `
    <div class="sticky top-0 bg-[#0a0a0a] border-b border-neutral-800 px-5 py-4 flex items-start justify-between gap-3">
      <div class="min-w-0">
        <div class="text-[10px] font-black uppercase tracking-widest text-sky-400">Etapa ${etapa + 1}/4 · ${ENG_ETAPAS[etapa]}</div>
        <h3 class="text-lg font-black text-white mt-1 truncate">${engEscAttr(p.nome_projeto)}</h3>
      </div>
      <button onclick="engCloseModal()" class="p-1.5 text-neutral-500 hover:text-white shrink-0"><i data-lucide="x" class="w-5 h-5"></i></button>
    </div>
    <div class="p-5">
      <div class="text-3xl font-black text-sky-300 mb-4">${engFmtNum(p.potencia_pico_kwp, 2)} <span class="text-lg text-neutral-500">kWp</span></div>
      <div class="grid grid-cols-2 gap-y-3 gap-x-4 py-4 border-y border-neutral-800">
        ${engModalRow('Cliente', engEscAttr(p.nome_cliente || '—'))}
        ${engModalRow('Cidade', engEscAttr(p.cidade || '—'))}
        ${engModalRow('Inversor', p.potencia_inversor_w ? engFmtNum(p.potencia_inversor_w / 1000, 1) + ' kW' : '—')}
        ${engModalRow('Módulos', p.total_modulos || '—')}
        ${engModalRow('Geração média', p.geracao_media_kwh ? engFmtNum(p.geracao_media_kwh, 0) + ' kWh/mês' : '—')}
        ${engModalRow('Origem', engEscAttr(p.origem || 'manual'))}
      </div>
      <div class="flex gap-2 mt-5">
        <button onclick="engProjetoMover('${p.id}', -1)" ${etapa === 0 ? 'disabled' : ''} class="flex-1 py-3 border border-neutral-800 text-neutral-300 text-[10px] font-black uppercase tracking-widest hover:border-neutral-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
          <i data-lucide="arrow-left" class="w-3.5 h-3.5 inline"></i> Voltar
        </button>
        <button onclick="engProjetoMover('${p.id}', 1)" ${etapa === 3 ? 'disabled' : ''} class="flex-1 py-3 bg-gradient-to-r ${ENG_ACCENT.grad} text-black text-[10px] font-black uppercase tracking-widest hover:opacity-90 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed">
          Avançar <i data-lucide="arrow-right" class="w-3.5 h-3.5 inline"></i>
        </button>
      </div>
      <button onclick="engCloseModal(); engAbrirProjeto('${p.id}')" class="w-full mt-2 py-3 bg-neutral-900 border border-neutral-700 hover:border-sky-500 text-white text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-colors">
        <i data-lucide="calculator" class="w-4 h-4"></i> Dimensionar
      </button>
    </div>`;
  m.classList.remove('hidden');
  m.classList.add('flex');
  if (window.lucide) lucide.createIcons();
}

async function engProjetoMover(id, dir) {
  try {
    const { data, error } = await supabaseClient.rpc('mover_eng_projeto', { p_id: id, p_dir: dir });
    if (error) throw error;
    const p = state.eng.projetos.find(x => String(x.id) === String(id));
    if (p && data && typeof data.etapa === 'number') p.etapa = data.etapa;
    showToast('Etapa: ' + ENG_ETAPAS[p ? p.etapa : 0]);
    const c = document.getElementById('main-container');
    if (c && state.engActiveTab === 'funil') renderEngFunil(c);
    engOpenProjectDetail(id);
  } catch (e) {
    console.error('[engenharia] mover', e);
    showToast('Erro ao mover: ' + (e.message || e));
  }
}

// --- ROTEADOR PRINCIPAL ---
function renderEngRoute(container, tabId) {
  switch (tabId) {
    case 'visao':        return renderEngVisao(container);
    case 'funil':        return renderEngFunil(container);
    case 'calculadora':  return renderEngCalculadora(container);
    case 'equipamentos': return renderEngEquipamentos(container);
    case 'projetos':     return renderEngProjetos(container);
    default:             return renderEngVisao(container);
  }
}

// --- EXPOSIÇÃO GLOBAL ---
Object.assign(window, {
  renderEngRoute,
  renderEngVisao,
  renderEngFunil,
  engOpenProjectDetail,
  engCloseModal,
  engProjetoMover,
  renderEngCalculadora,
  renderEngEquipamentos,
  renderEngProjetos,
  engCompute,
  engStash,
  engToggleVdrop,
  engCalcular,
  engLimpar,
  engToggleStringEditor,
  engApplyManualStringConfig,
  engGerarPdf,
  engEquipAdd,
  engExcluirEquip,
  engApplyModuloPreset,
  engApplyInversorPreset,
  engSalvarProjeto,
  engSalvarNoProjeto,
  engSairProjeto,
  engNovaSimulacao,
  engAbrirProjeto,
  engExcluirProjeto,
});
