// ==========================================
// PERFIL PARCEIRO — "o cliente fechou"
// ==========================================
// O parceiro não registra venda (o banco nem deixa: vendas_sem_parceiro).
// Quando o cliente dele fecha, ele avisa a unidade: a RPC
// parceiro_avisar_fechamento grava na timeline do cliente e manda notificação
// (sininho + push) para o gestor, que registra a venda pelo caminho de sempre.
// Todos os botões de "Registrar venda" chegam aqui (openFechaVenda desvia).

function _parceiroPropostasDoCliente(client) {
  return (state.propostas || []).filter((p) => {
    if (p.cliente_id) return String(p.cliente_id) === String(client.id);
    return p.cliente_nome && client.nome && p.cliente_nome.toUpperCase() === client.nome.toUpperCase();
  });
}

function _parceiroPropostaRotulo(p) {
  const kwp = Number(p.kit_power) || 0;
  const partes = [
    p.numero ? `#${p.numero}` : 'Proposta',
    kwp ? `${kwp.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} kWp` : '',
    formatCurrency(Number(p.kit_price) || 0),
  ].filter(Boolean);
  return { titulo: partes.join(' · '), sub: `${p.kit_nome || ''}${p.created_at ? ' · ' + formatDate(p.created_at) : ''}` };
}

function parceiroAvisarFechamento(clientId, propostaId = null) {
  if (!state.isParceiro) return;
  const client = (state.clientes || []).find((c) => String(c.id) === String(clientId));
  if (!client) { showToast('Cliente não encontrado. Atualize a página.'); return; }
  const propostas = _parceiroPropostasDoCliente(client);
  if (!propostas.length) { showToast('Gere uma proposta para o cliente antes de avisar que ele fechou.'); return; }
  const escolhida = (propostaId && propostas.find((p) => String(p.id) === String(propostaId))) || propostas[0];

  const existing = document.getElementById('parceiro-fechou-overlay');
  if (existing) existing.remove();

  const opcoes = propostas.map((p) => {
    const r = _parceiroPropostaRotulo(p);
    return `
      <label class="flex items-start gap-3 p-3 border border-neutral-700 cursor-pointer">
        <input type="radio" name="parceiro-fechou-prop" value="${escapeHTML(String(p.id))}" ${p === escolhida ? 'checked' : ''} class="w-4 h-4 accent-orange-500 mt-1">
        <span class="min-w-0 flex-1"><b class="block text-white font-bold text-sm">${escapeHTML(r.titulo)}</b>
          <small class="block text-neutral-500 text-[11px] truncate">${escapeHTML(r.sub)}</small></span>
      </label>`;
  }).join('');

  const overlay = document.createElement('div');
  overlay.id = 'parceiro-fechou-overlay';
  overlay.className = 'fixed inset-0 z-[96] flex items-center justify-center bg-black/90 backdrop-blur-md p-4';
  overlay.innerHTML = `
    <div class="bg-neutral-900 border-2 border-orange-500 w-full max-w-md animate-fade-in-up" role="dialog" aria-modal="true" aria-labelledby="parceiro-fechou-titulo">
      <div class="flex justify-between items-center p-5 border-b border-neutral-800 bg-black/50">
        <h2 id="parceiro-fechou-titulo" class="text-lg font-black text-orange-400 uppercase tracking-tighter">Cliente fechou</h2>
        <button type="button" onclick="document.getElementById('parceiro-fechou-overlay').remove()" class="text-neutral-500 hover:text-red-500 transition-colors" aria-label="Fechar"><i data-lucide="x" class="w-6 h-6"></i></button>
      </div>
      <div class="p-5 space-y-4">
        <p class="text-neutral-400 text-sm">${escapeHTML(client.nome || 'O cliente')} fechou? Escolha a proposta. A unidade recebe o aviso e o gestor registra a venda.</p>
        <div class="space-y-2 max-h-[50vh] overflow-y-auto">${opcoes}</div>
        <button type="button" id="parceiro-fechou-confirm" class="w-full py-3.5 bg-orange-600 hover:bg-orange-500 text-black font-black uppercase tracking-widest text-xs transition-colors">Avisar a unidade</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  if (window.lucide) lucide.createIcons();

  const btn = document.getElementById('parceiro-fechou-confirm');
  btn.addEventListener('click', async () => {
    const marcada = overlay.querySelector('input[name="parceiro-fechou-prop"]:checked');
    if (!marcada) return;
    btn.disabled = true;
    btn.textContent = 'Avisando...';
    const { data, error } = await supabaseClient.rpc('parceiro_avisar_fechamento', { p_proposta_id: marcada.value });
    if (error) {
      btn.disabled = false;
      btn.textContent = 'Avisar a unidade';
      showToast('Não deu para avisar a unidade: ' + (error.message || 'erro'));
      return;
    }
    overlay.remove();
    showToast(data?.ja_avisado
      ? 'A unidade já tinha sido avisada sobre esta proposta.'
      : 'Unidade avisada. O gestor vai registrar a venda.');
    // o funil do parceiro anda junto (sem abrir o registro de venda)
    if (normalizeClientStatus(client.status) !== 'FECHADO' && typeof crmSetClientStatus === 'function') {
      crmSetClientStatus(client.id, 'FECHADO', null, { skipVenda: true });
    }
    if (typeof crmFetchAtividades === 'function' && typeof _crm360ClientId !== 'undefined' && _crm360ClientId === client.id) {
      crmFetchAtividades(client.id);
    }
  });
}
