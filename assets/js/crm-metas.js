// ==========================================
// CRM: METAS MENSAIS E COMISSÃO ESTIMADA
// ==========================================
// Por que existe: a plataforma sabia o percentual de comissão de cada vendedor
// (vendedores_stats.comissao_pct) e nunca mostrava. Sem meta e sem ganho à vista,
// registrar a venda no sistema era trabalho sem retorno — e ninguém registrava.
//
// IMPORTANTE: a comissão aqui é ESTIMATIVA comercial (comissao_pct × vendas do
// mês). O valor oficial é apurado no Financeiro (fin_comissoes), que tem regras
// de dedução que este módulo não conhece. A UI diz isso em voz alta.
//
// Depende de: api.js (fetchCrmMetas → state.crmMetas), dashboard.js
// (getDashboardScopedRows), utils.js (formatCurrency, showToast, escapeHTML).

function metaMesAtualKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

// Meta do vendedor no mês; sem meta pessoal, cai na meta da franquia (a linha
// com vendedor_email null).
function getMetaVendedor(email, mesKey = metaMesAtualKey()) {
  const metas = state.crmMetas || [];
  const alvo = String(email || '').trim().toLowerCase();
  const pessoal = metas.find((m) => (
    String(m.mes).slice(0, 10) === mesKey
    && String(m.vendedor_email || '').trim().toLowerCase() === alvo
  ));
  return pessoal ? Number(pessoal.meta_valor) || 0 : 0;
}

function getMetaFranquia(franquiaId, mesKey = metaMesAtualKey()) {
  const meta = (state.crmMetas || []).find((m) => (
    String(m.mes).slice(0, 10) === mesKey
    && !m.vendedor_email
    && String(m.franquia_id) === String(franquiaId)
  ));
  return meta ? Number(meta.meta_valor) || 0 : 0;
}

// Vendas do mês corrente já no escopo de quem está olhando.
function getVendasDoMes(mesKey = metaMesAtualKey()) {
  const alvoMes = mesKey.slice(0, 7);
  return getDashboardScopedRows(state.vendas || [])
    .filter((v) => String(toMonthKey(v.created_at) || '') === alvoMes);
}

// =======================================================================
// BLOCO DO VENDEDOR — meta do mês + comissão estimada
// =======================================================================
function renderMetaBlock() {
  // Admin/gestor têm a visão de time na seção admin; aqui é a régua pessoal.
  if (state.isAdmin || state.isGestor) return '';

  const email = state.currentUser?.email || '';
  const mesKey = metaMesAtualKey();
  const vendas = getVendasDoMes(mesKey);
  const realizado = vendas.reduce((s, v) => s + (Number(v.kit_price) || 0), 0);

  const metaPessoal = getMetaVendedor(email, mesKey);
  const metaFranquia = getMetaFranquia(state.franquiaId, mesKey);
  const meta = metaPessoal || metaFranquia;
  const ehMetaDaUnidade = !metaPessoal && metaFranquia > 0;

  const pct = meta > 0 ? Math.min(Math.round((realizado / meta) * 100), 100) : 0;
  const pctReal = meta > 0 ? Math.round((realizado / meta) * 100) : 0;
  const falta = Math.max(meta - realizado, 0);
  const bateu = meta > 0 && realizado >= meta;

  const comissaoPct = Number(state.comissaoPct) || 0;
  const comissaoEstimada = realizado * (comissaoPct / 100);

  // Sem meta cadastrada não inventamos número: mostra só a comissão.
  const barra = meta > 0
    ? `
      <div class="mt-3">
        <div class="flex items-center justify-between text-[9px] font-black uppercase tracking-widest mb-1.5">
          <span class="text-neutral-500">${formatCurrency(realizado)} de ${formatCurrency(meta)}${ehMetaDaUnidade ? ' <span class="text-neutral-700">(meta da unidade)</span>' : ''}</span>
          <span class="${bateu ? 'text-green-400' : 'text-orange-400'} num">${pctReal}%</span>
        </div>
        <div class="h-2 bg-neutral-900 border border-neutral-800 overflow-hidden">
          <div class="h-full ${bateu ? 'bg-gradient-to-r from-green-600 to-emerald-400' : 'bg-gradient-to-r from-orange-600 to-yellow-500'} transition-all duration-700" style="width: ${Math.max(pct, 1)}%"></div>
        </div>
        <p class="text-[10px] font-bold mt-1.5 ${bateu ? 'text-green-400' : 'text-neutral-500'}">
          ${bateu ? '\u{1F3AF} Meta batida. Daqui pra frente é bônus.' : `Faltam ${formatCurrency(falta)} para bater a meta do mês.`}
        </p>
      </div>`
    : `<p class="text-[10px] font-bold text-neutral-600 mt-2">Nenhuma meta definida para este mês.</p>`;

  return `
    <div class="stagger-2 grid grid-cols-1 md:grid-cols-3 gap-3">
      <div class="md:col-span-2 border border-neutral-800/60 bg-[#080808] p-4">
        <div class="flex items-center gap-2.5">
          <div class="bg-orange-500/10 border border-orange-500/30 p-1.5"><i data-lucide="target" class="w-3.5 h-3.5 text-orange-400"></i></div>
          <span class="text-white font-black text-[11px] uppercase tracking-widest">Meta do mês</span>
        </div>
        ${barra}
      </div>
      <div class="border border-neutral-800/60 bg-[#080808] p-4 flex flex-col justify-between">
        <div class="flex items-center gap-2.5">
          <div class="bg-green-500/10 border border-green-500/30 p-1.5"><i data-lucide="wallet" class="w-3.5 h-3.5 text-green-400"></i></div>
          <span class="text-white font-black text-[11px] uppercase tracking-widest">Comissão estimada</span>
        </div>
        <div class="mt-3">
          <p class="text-2xl font-black text-green-400 num leading-none">${formatCurrency(comissaoEstimada)}</p>
          <p class="text-[9px] font-bold text-neutral-600 mt-1.5 uppercase tracking-widest">${comissaoPct}% sobre ${vendas.length} venda${vendas.length === 1 ? '' : 's'}</p>
          <p class="text-[9px] text-neutral-700 font-medium mt-1">Estimativa — o valor oficial é apurado no Financeiro.</p>
        </div>
      </div>
    </div>`;
}

// =======================================================================
// EDITOR DE METAS (admin/gestor)
// =======================================================================
function canManageMetas() {
  return Boolean(state.isAdmin || state.isGestor);
}

// Vendedores da franquia com atividade recente (propostas/vendas/clientes).
// Não existe lista de "vendedores da unidade" no state; derivamos dos dados.
function _metasVendedoresDaFranquia(franquiaId) {
  const emails = new Set();
  const coleta = (rows) => (rows || []).forEach((r) => {
    if (!r?.vendedor_email) return;
    if (franquiaId && String(r.franquia_id) !== String(franquiaId)) return;
    emails.add(String(r.vendedor_email).trim().toLowerCase());
  });
  coleta(state.clientes);
  coleta(state.propostas);
  coleta(state.vendas);
  return [...emails].sort();
}

function openMetasEditor() {
  if (!canManageMetas()) { showToast('Acesso restrito.'); return; }

  const existing = document.getElementById('metas-overlay');
  if (existing) existing.remove();

  // Admin consolidado não tem uma franquia única para editar: usa o recorte ativo.
  const franquiaId = (state.isAdmin && state.adminViewAll && state.adminScopeFranquiaId && state.adminScopeFranquiaId !== 'all')
    ? state.adminScopeFranquiaId
    : state.franquiaId;

  if (!franquiaId) {
    showToast('Escolha uma franquia no seletor antes de definir metas.');
    return;
  }

  const mesKey = metaMesAtualKey();
  const vendedores = _metasVendedoresDaFranquia(franquiaId);
  const metaUnidade = getMetaFranquia(franquiaId, mesKey);
  const nomeFranquia = typeof getFranquiaNameById === 'function' ? getFranquiaNameById(franquiaId) : '';

  const overlay = document.createElement('div');
  overlay.id = 'metas-overlay';
  overlay.className = 'fixed inset-0 z-[96] flex items-center justify-center bg-black/90 backdrop-blur-md p-4';
  overlay.dataset.franquia = franquiaId;
  overlay.innerHTML = `
    <div class="bg-neutral-900 border-2 border-orange-600/50 w-full max-w-lg max-h-[85vh] flex flex-col shadow-[0_0_50px_rgba(234,88,12,0.2)] animate-fade-in-up">
      <div class="flex justify-between items-center p-5 border-b border-neutral-800 bg-black/50 shrink-0">
        <div>
          <p class="text-[9px] text-orange-500 font-black uppercase tracking-widest">${escapeHTML(nomeFranquia)} · ${formatMonthLabel(mesKey.slice(0, 7))}</p>
          <h2 class="text-sm font-black text-white uppercase tracking-tighter">Metas do mês</h2>
        </div>
        <button type="button" onclick="document.getElementById('metas-overlay').remove()" class="text-neutral-500 hover:text-red-500 transition-colors"><i data-lucide="x" class="w-6 h-6"></i></button>
      </div>
      <div class="p-5 space-y-4 overflow-y-auto flex-1">
        <div>
          <p class="text-[10px] text-orange-500/80 font-black uppercase tracking-widest mb-1.5">Meta da unidade (R$)</p>
          <input id="meta-unidade" type="number" min="0" step="1000" value="${metaUnidade || ''}" placeholder="0"
            class="w-full bg-black border border-neutral-700 focus:border-orange-500 px-3 py-2.5 text-white font-bold text-sm num transition-all">
          <p class="text-[9px] text-neutral-600 font-medium mt-1">Vale para quem não tem meta individual.</p>
        </div>
        <div class="border-t border-neutral-800 pt-4">
          <p class="text-[10px] text-orange-500/80 font-black uppercase tracking-widest mb-2">Metas individuais (R$)</p>
          ${vendedores.length === 0
            ? '<p class="text-[11px] text-neutral-600 font-medium">Nenhum vendedor com movimento nesta unidade ainda.</p>'
            : `<div class="space-y-2">${vendedores.map((email) => `
                <div class="flex items-center gap-2">
                  <span class="flex-1 min-w-0 text-[11px] font-bold text-neutral-300 truncate" title="${escapeHTML(email)}">${escapeHTML(email.split('@')[0])}</span>
                  <input data-vendedor="${escapeHTML(email)}" type="number" min="0" step="1000" value="${getMetaVendedor(email, mesKey) || ''}" placeholder="—"
                    class="meta-vendedor-input w-32 bg-black border border-neutral-700 focus:border-orange-500 px-2.5 py-1.5 text-white font-bold text-xs num transition-all">
                </div>`).join('')}</div>`}
        </div>
        <p id="metas-erro" class="hidden text-red-500 text-xs font-bold bg-red-500/10 border border-red-500/20 p-2.5"></p>
      </div>
      <div class="p-5 border-t border-neutral-800 bg-black/50 shrink-0">
        <button type="button" id="metas-salvar" onclick="salvarMetas()" class="btn btn-primary btn-lg btn-block">
          <i data-lucide="save"></i> Salvar metas
        </button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  lucide.createIcons();
}

async function salvarMetas() {
  const overlay = document.getElementById('metas-overlay');
  if (!overlay || !canManageMetas()) return;

  const btn = document.getElementById('metas-salvar');
  const errEl = document.getElementById('metas-erro');
  const franquiaId = overlay.dataset.franquia;
  const mesKey = metaMesAtualKey();

  errEl.classList.add('hidden');
  btn.disabled = true;
  const originalHTML = btn.innerHTML;
  btn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> SALVANDO...';
  lucide.createIcons();

  try {
    const linhas = [];
    const unidadeVal = Number(document.getElementById('meta-unidade').value) || 0;
    if (unidadeVal > 0) {
      linhas.push({ franquia_id: franquiaId, vendedor_email: null, mes: mesKey, meta_valor: unidadeVal });
    }
    overlay.querySelectorAll('.meta-vendedor-input').forEach((input) => {
      const valor = Number(input.value) || 0;
      if (valor > 0) {
        linhas.push({ franquia_id: franquiaId, vendedor_email: input.dataset.vendedor, mes: mesKey, meta_valor: valor });
      }
    });

    if (linhas.length === 0) {
      throw new Error('Defina ao menos uma meta.');
    }

    // O índice único é (franquia_id, mes, coalesce(vendedor_email,'')) — uma
    // expressão, que o onConflict do PostgREST não aceita por nome de coluna.
    // Por isso: apaga as linhas do mês e regrava (o volume é de uma unidade).
    const { error: delError } = await supabaseClient.from('crm_metas')
      .delete().eq('franquia_id', franquiaId).eq('mes', mesKey);
    if (delError) throw new Error(delError.message || 'Falha ao limpar as metas anteriores.');

    const { error: insError } = await supabaseClient.from('crm_metas').insert(linhas);
    if (insError) throw new Error(insError.message || 'Falha ao gravar as metas.');

    await fetchCrmMetas();
    overlay.remove();
    showToast('METAS ATUALIZADAS');
    renderContent();
  } catch (err) {
    console.error('[metas] Falha ao salvar.', err);
    errEl.innerText = err.message || 'Erro ao salvar. Tente novamente.';
    errEl.classList.remove('hidden');
    btn.disabled = false;
    btn.innerHTML = originalHTML;
    lucide.createIcons();
  }
}

// =======================================================================
// VISÃO DE TIME (admin/gestor) — metas vs realizado
// =======================================================================
function renderMetasEquipeBlock() {
  if (!canManageMetas()) return '';

  const mesKey = metaMesAtualKey();
  const vendas = getVendasDoMes(mesKey);

  const porVendedor = {};
  vendas.forEach((v) => {
    const email = String(v.vendedor_email || '').trim().toLowerCase();
    if (!email) return;
    porVendedor[email] = (porVendedor[email] || 0) + (Number(v.kit_price) || 0);
  });

  // Todo mundo com meta no mês entra, mesmo sem ter vendido nada (é justamente
  // quem o gestor precisa ver).
  (state.crmMetas || [])
    .filter((m) => String(m.mes).slice(0, 10) === mesKey && m.vendedor_email)
    .forEach((m) => {
      const email = String(m.vendedor_email).trim().toLowerCase();
      if (porVendedor[email] === undefined) porVendedor[email] = 0;
    });

  const linhas = Object.entries(porVendedor)
    .map(([email, realizado]) => ({ email, realizado, meta: getMetaVendedor(email, mesKey) }))
    .sort((a, b) => b.realizado - a.realizado);

  const btnEditar = `<button onclick="openMetasEditor()" class="btn btn-secondary btn-sm"><i data-lucide="target"></i> Definir metas</button>`;

  if (linhas.length === 0) {
    return `
      <div class="border border-neutral-800/60 bg-[#080808] p-4 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p class="text-white font-black text-[11px] uppercase tracking-widest">Metas do time</p>
          <p class="text-[10px] font-bold text-neutral-600 mt-0.5">Nenhuma meta definida e nenhuma venda no mês.</p>
        </div>
        ${btnEditar}
      </div>`;
  }

  return `
    <div class="border border-neutral-800/60 bg-[#080808]">
      <div class="px-4 py-3 border-b border-neutral-800/60 flex items-center justify-between gap-3 flex-wrap">
        <div class="flex items-center gap-2.5">
          <div class="bg-orange-500/10 border border-orange-500/30 p-1.5"><i data-lucide="target" class="w-3.5 h-3.5 text-orange-400"></i></div>
          <span class="text-white font-black text-[11px] uppercase tracking-widest">Metas do time · ${formatMonthLabel(mesKey.slice(0, 7))}</span>
        </div>
        ${btnEditar}
      </div>
      <div class="p-3 space-y-2.5">
        ${linhas.map((l) => {
          const pct = l.meta > 0 ? Math.round((l.realizado / l.meta) * 100) : 0;
          const bateu = l.meta > 0 && l.realizado >= l.meta;
          return `
            <div>
              <div class="flex items-center justify-between gap-2 text-[10px] font-bold mb-1">
                <span class="text-neutral-300 truncate">${escapeHTML(l.email.split('@')[0])}</span>
                <span class="shrink-0 num ${bateu ? 'text-green-400' : 'text-neutral-400'}">
                  ${formatCurrency(l.realizado)}${l.meta > 0 ? ` <span class="text-neutral-700">/ ${formatCurrency(l.meta)}</span>` : ' <span class="text-neutral-700">(sem meta)</span>'}
                </span>
              </div>
              <div class="h-1.5 bg-neutral-900 border border-neutral-800/60 overflow-hidden">
                <div class="h-full ${bateu ? 'bg-green-500' : 'bg-orange-500'} transition-all duration-700" style="width: ${Math.min(Math.max(pct, l.meta > 0 ? 1 : 0), 100)}%"></div>
              </div>
            </div>`;
        }).join('')}
      </div>
    </div>`;
}
