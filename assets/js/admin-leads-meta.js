// ==========================================
// ADMIN › LEADS META — configuração dos leads dos anúncios
// ------------------------------------------
// Aba do painel admin (registrada em ui-v2-admin.js). Tudo que antes era
// pedido por SQL:
//   • Resumo do mês (leads, sem contato, com proposta, próximo da fila)
//   • Pra qual unidade vai o lead: unidade padrão de cada página +
//     regras por formulário/cidade (meta_leads_paginas, meta_leads_regras)
//   • Rodízio por unidade: liga/desliga, adiciona vendedor e o que fazer
//     quando ninguém está ativo (meta_leads_rodizio, meta_leads_unidades)
//   • Últimos leads, com "Reprocessar" pros que ficaram parados
// A distribuição em si é a RPC meta_leads_criar_cliente (edge function
// meta-leads); aqui só se lê e grava a configuração. Só admin (RLS).
// ==========================================

(function () {
  const ic = (n) => `<i data-lucide="${n}"></i>`;
  const esc = (s) => (typeof escapeHTML === 'function' ? escapeHTML(String(s ?? '')) : String(s ?? ''));
  const toast = (m) => { if (typeof showToast === 'function') showToast(m); };

  const ST = {
    criado: ['Distribuído', 't-green'], duplicado: ['Cliente repetido', 't-blue'], teste: ['Teste', 't-gray'],
    ignorado: ['Ignorado', 't-gray'], sem_vendedor: ['Parado: sem vendedor', 't-red'], sem_pagina: ['Parado: página sem unidade', 't-red'],
    erro: ['Erro', 't-red'], recebido: ['Na fila', 't-orange'], processando: ['Processando', 't-orange'],
  };
  const SEM_VENDEDOR = [['gestor', 'Enviar pro gestor da unidade'], ['matriz', 'Enviar pro rodízio da Matriz'], ['parado', 'Deixar parado e mostrar aqui']];

  let D = null;            // dados carregados
  let unidadeSel = null;   // franquia_id do rodízio aberto
  let container = null;

  // mesma regra de public.meta_leads_norm (sem acento, minúsculo, sem " - SP")
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/\s*[/-]\s*[a-z]{2}$/, '').replace(/\s+/g, ' ').trim();

  const nomeUnidade = (id) => (D.franquias.find((f) => f.id === id) || {}).nome || '—';
  const nomePessoa = (email) => {
    const u = D.usuarios.find((x) => x.email === String(email || '').toLowerCase());
    return u && u.nome ? u.nome : String(email || '—').split('@')[0];
  };
  const dataHora = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '—' : `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`; };

  async function carregar() {
    const q = (p) => p.then((r) => { if (r.error) throw r.error; return r.data || []; });
    const [franquias, paginas, rodizio, usuarios, eventos] = await Promise.all([
      q(supabaseClient.from('franquias').select('id, nome, tipo').eq('ativo', true).order('nome')),
      q(supabaseClient.from('meta_leads_paginas').select('*').order('created_at')),
      q(supabaseClient.from('meta_leads_rodizio').select('*').order('created_at')),
      q(supabaseClient.from('user_accounts').select('email, nome, role, franquia_id, ativo').eq('ativo', true).in('role', ['vendedor', 'gestor'])),
      q(supabaseClient.from('meta_leads_eventos').select('id, recebido_em, status, erro, page_id, franquia_id, vendedor_email, cliente_id, form_id, dados').order('recebido_em', { ascending: false }).limit(200)),
    ]);
    // regras/unidades vêm da migration 20261008: sem ela, a tela avisa e segue
    let regras = [], unidades = [], semMigration = false;
    try {
      [regras, unidades] = await Promise.all([
        q(supabaseClient.from('meta_leads_regras').select('*').order('created_at')),
        q(supabaseClient.from('meta_leads_unidades').select('*')),
      ]);
    } catch (_) { semMigration = true; }
    usuarios.forEach((u) => { u.email = String(u.email || '').toLowerCase(); });
    D = { franquias, paginas, rodizio, usuarios, eventos, regras, unidades, semMigration };
    if (!unidadeSel || !franquias.some((f) => f.id === unidadeSel)) {
      unidadeSel = (paginas[0] && paginas[0].franquia_id) || (franquias.find((f) => f.tipo === 'propria') || franquias[0] || {}).id;
    }
  }

  // ---- resumo -------------------------------------------------------------
  function resumoHTML() {
    const ini = new Date(); ini.setDate(1); ini.setHours(0, 0, 0, 0);
    const doMes = D.eventos.filter((e) => ['criado', 'duplicado'].includes(e.status) && new Date(e.recebido_em) >= ini);
    const metaCli = (state.clientes || []).filter((c) => c.origem === 'meta');
    const semContato = window.uiV2LeadMeta ? metaCli.filter((c) => (window.uiV2LeadMeta.info(c) || {}).semContato).length : 0;
    const comProposta = new Set((state.propostas || []).map((p) => p.cliente_id));
    const parados = D.eventos.filter((e) => ['sem_vendedor', 'sem_pagina', 'erro'].includes(e.status)).length;
    const kpi = (l, v, cls = '') => `<div class="alm-kpi ${cls}"><small>${l}</small><b>${v}</b></div>`;
    return `<div class="alm-kpis">
        ${kpi('Leads este mês', doMes.length)}
        ${kpi('Sem contato agora', semContato, semContato ? 'warn' : '')}
        ${kpi('Com proposta', metaCli.filter((c) => comProposta.has(c.id)).length)}
        ${kpi('Parados', parados, parados ? 'bad' : '')}
      </div>`;
  }

  // ---- roteamento ---------------------------------------------------------
  const opcoesUnidade = (sel) => D.franquias.map((f) => `<option value="${f.id}" ${f.id === sel ? 'selected' : ''}>${esc(f.nome)}</option>`).join('');

  function roteamentoHTML() {
    const pags = D.paginas.map((p) => {
      const n = D.eventos.filter((e) => e.page_id === p.page_id && (e.status === 'criado' || e.status === 'duplicado')).length;
      return `<div class="alm-row">
          <i class="alm-fb">${ic('megaphone')}</i>
          <div class="alm-grow"><b>${esc(p.nome || 'Página ' + p.page_id)}</b><small>Página ${esc(p.page_id)} · ${n} lead${n === 1 ? '' : 's'} recebido${n === 1 ? '' : 's'}</small></div>
          <label class="alm-lbl">Unidade padrão<select onchange="admLeadsMeta.paginaUnidade('${esc(p.page_id)}', this.value)">${opcoesUnidade(p.franquia_id)}</select></label>
          <button type="button" class="alm-tg ${p.ativo ? 'on' : ''}" title="${p.ativo ? 'Recebendo leads' : 'Pausada'}" onclick="admLeadsMeta.paginaAtiva('${esc(p.page_id)}', ${!p.ativo})"></button>
        </div>`;
    }).join('') || '<div class="alm-vazio">Nenhuma página conectada.</div>';

    const forms = [...new Set(D.eventos.map((e) => e.form_id).filter((f) => f && f !== '444444444444'))];
    const regras = D.regras.map((r) => {
      const alvo = r.tipo === 'formulario'
        ? r.valores.map((v) => `<span class="alm-chip">${ic('file-text')}Formulário …${esc(String(v).slice(-6))}</span>`).join('')
        : String(r.rotulo || r.valores.join(', ')).split(',').map((c) => c.trim()).filter(Boolean).map((c) => `<span class="alm-chip">${ic('map-pin')}${esc(c)}</span>`).join('');
      return `<div class="alm-row ${r.ativo ? '' : 'off'}">
          <div class="alm-chips">${alvo}</div>${ic('arrow-right')}
          <b class="alm-grow">${esc(nomeUnidade(r.franquia_id))}</b>
          <button type="button" class="alm-tg ${r.ativo ? 'on' : ''}" title="${r.ativo ? 'Regra ativa' : 'Regra pausada'}" onclick="admLeadsMeta.regraAtiva('${r.id}', ${!r.ativo})"></button>
          <button type="button" class="alm-ico" title="Apagar regra" onclick="admLeadsMeta.regraApagar('${r.id}')">${ic('trash-2')}</button>
        </div>`;
    }).join('');

    const nova = D.semMigration ? '' : `<div class="alm-nova">
        <select id="alm-r-tipo" onchange="admLeadsMeta.tipoRegra(this.value)"><option value="cidade">Cidade do cliente</option><option value="formulario">Formulário</option></select>
        <input id="alm-r-cidades" placeholder="Ex.: Goiânia, Aparecida de Goiânia">
        <select id="alm-r-form" class="hidden">${forms.map((f) => `<option value="${esc(f)}">Formulário …${esc(f.slice(-6))} (${D.eventos.filter((e) => e.form_id === f).length} leads)</option>`).join('') || '<option value="">Nenhum formulário recebido ainda</option>'}</select>
        ${ic('arrow-right')}
        <select id="alm-r-unidade">${opcoesUnidade(null)}</select>
        <button type="button" class="alm-btn pri" onclick="admLeadsMeta.regraCriar()">${ic('plus')}Adicionar regra</button>
      </div>`;

    return `<section class="alm-card">
        <h3>${ic('route')}Pra qual unidade vai cada lead</h3>
        <p class="alm-sub">Primeiro vale a regra de formulário, depois a de cidade (a que o cliente escreveu no formulário). Se nenhuma bater, o lead vai pra unidade padrão da página.</p>
        ${pags}
        <div class="alm-sec">Regras</div>
        ${D.semMigration ? '<div class="alm-aviso">Falta rodar no Supabase o SQL <b>20261008_leads_meta_config.sql</b> pra liberar as regras e a opção de "ninguém no rodízio".</div>' : (regras || '<div class="alm-vazio">Nenhuma regra: todo lead vai pra unidade padrão da página.</div>')}
        ${nova}
      </section>`;
  }

  // ---- rodízio ------------------------------------------------------------
  function rodizioHTML() {
    const daUnidade = D.rodizio.filter((r) => r.franquia_id === unidadeSel);
    const ativosOrdenados = daUnidade
      .filter((r) => r.ativo && D.usuarios.some((u) => u.email === String(r.vendedor_email).toLowerCase()))
      .sort((a, b) => (a.ultimo_lead_em ? new Date(a.ultimo_lead_em) : 0) - (b.ultimo_lead_em ? new Date(b.ultimo_lead_em) : 0) || new Date(a.created_at) - new Date(b.created_at));
    const proximo = ativosOrdenados[0];
    const pills = D.franquias.map((f) => {
      const n = D.rodizio.filter((r) => r.franquia_id === f.id && r.ativo).length;
      return `<button type="button" class="${f.id === unidadeSel ? 'on' : ''}" onclick="admLeadsMeta.unidade('${f.id}')">${esc(String(f.nome).replace(/^Ágil Solar\s*/i, ''))}<em>${n}</em></button>`;
    }).join('');
    const linhas = daUnidade
      .sort((a, b) => (b.ativo - a.ativo) || ((a.ultimo_lead_em ? new Date(a.ultimo_lead_em) : 0) - (b.ultimo_lead_em ? new Date(b.ultimo_lead_em) : 0)))
      .map((r) => {
        const conta = D.usuarios.find((u) => u.email === String(r.vendedor_email).toLowerCase());
        const tags = [r === proximo ? '<span class="v2-chip t-green">Próximo</span>' : '',
          !r.ativo ? '<span class="v2-chip t-gray">Fora do rodízio</span>' : '',
          !conta ? '<span class="v2-chip t-red">Usuário inativo</span>' : ''].join('');
        return `<div class="alm-row ${r.ativo ? '' : 'off'}">
            <span class="alm-av">${esc(nomePessoa(r.vendedor_email).split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase())}</span>
            <div class="alm-grow"><b>${esc(nomePessoa(r.vendedor_email))} ${tags}</b><small>${r.total_recebidos} lead${r.total_recebidos === 1 ? '' : 's'} · último ${r.ultimo_lead_em ? dataHora(r.ultimo_lead_em) : '—'}</small></div>
            <button type="button" class="alm-tg ${r.ativo ? 'on' : ''}" title="${r.ativo ? 'No rodízio' : 'Fora do rodízio'}" onclick="admLeadsMeta.rodizioAtivo('${r.id}', ${!r.ativo})"></button>
          </div>`;
      }).join('');
    const jaNoRodizio = new Set(daUnidade.map((r) => String(r.vendedor_email).toLowerCase()));
    const candidatos = D.usuarios.filter((u) => u.franquia_id === unidadeSel && !jaNoRodizio.has(u.email))
      .sort((a, b) => String(a.nome || a.email).localeCompare(String(b.nome || b.email)));
    const cfg = D.unidades.find((u) => u.franquia_id === unidadeSel);
    const modo = cfg ? cfg.sem_vendedor : 'gestor';

    return `<section class="alm-card">
        <h3>${ic('refresh-cw')}Rodízio por unidade</h3>
        <p class="alm-sub">Um lead por vez: sempre vai pra quem está há mais tempo sem receber.</p>
        <div class="alm-pills">${pills}</div>
        ${linhas || '<div class="alm-aviso">Ninguém no rodízio desta unidade. Leads que caírem aqui seguem a opção de baixo.</div>'}
        <div class="alm-nova">
          <select id="alm-add-vend">${candidatos.length ? `<option value="">Adicionar vendedor de ${esc(nomeUnidade(unidadeSel))}…</option>${candidatos.map((u) => `<option value="${esc(u.email)}">${esc(u.nome || u.email)}${u.role === 'gestor' ? ' (gestor)' : ''}</option>`).join('')}` : '<option value="">Todos os vendedores desta unidade já estão aqui</option>'}</select>
          <button type="button" class="alm-btn" onclick="admLeadsMeta.rodizioAdicionar()" ${candidatos.length ? '' : 'disabled'}>${ic('user-plus')}Adicionar</button>
        </div>
        ${D.semMigration ? '' : `<label class="alm-lbl alm-semv">Se ninguém estiver ativo no rodízio desta unidade
          <select onchange="admLeadsMeta.semVendedor(this.value)">${SEM_VENDEDOR.map(([v, l]) => `<option value="${v}" ${v === modo ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`}
      </section>`;
  }

  // ---- últimos leads ------------------------------------------------------
  function ultimosHTML() {
    const lista = D.eventos.filter((e) => e.status !== 'teste' && e.status !== 'ignorado').slice(0, 25);
    const reprocessaveis = D.eventos.some((e) => ['sem_vendedor', 'sem_pagina', 'erro', 'recebido'].includes(e.status));
    const linhas = lista.map((e) => {
      const [rot, cls] = ST[e.status] || [e.status, 't-gray'];
      const d = e.dados || {};
      return `<div class="alm-row alm-lead">
          <small class="alm-quando">${dataHora(e.recebido_em)}</small>
          <div class="alm-grow"><b>${esc(d.nome || 'Lead')}</b><small>${esc(d.cidade || 'sem cidade')}</small></div>
          <small class="alm-dest">${esc(e.franquia_id ? nomeUnidade(e.franquia_id) : '—')} · ${esc(e.vendedor_email ? nomePessoa(e.vendedor_email) : '—')}</small>
          <span class="v2-chip ${cls}" title="${esc(e.erro || '')}">${rot}</span>
        </div>`;
    }).join('') || '<div class="alm-vazio">Nenhum lead ainda.</div>';
    return `<section class="alm-card">
        <h3>${ic('list')}Últimos leads${reprocessaveis ? `<button type="button" class="alm-btn pri alm-h3btn" onclick="admLeadsMeta.reprocessar(this)">${ic('rotate-cw')}Reprocessar parados</button>` : ''}</h3>
        ${linhas}
      </section>`;
  }

  // ---- render ---------------------------------------------------------------
  function pintar() {
    if (!container || !D) return;
    container.innerHTML = `<div class="alm">${resumoHTML()}${roteamentoHTML()}${rodizioHTML()}${ultimosHTML()}</div>`;
    if (window.lucide) window.lucide.createIcons();
  }

  async function renderAdminLeadsMeta(el) {
    container = el;
    if (!state.isAdmin) { el.innerHTML = '<div class="alm-vazio">Só administradores.</div>'; return; }
    el.innerHTML = '<div class="alm-vazio">Carregando…</div>';
    try {
      await carregar();
      pintar();
    } catch (err) {
      console.error('[admin-leads-meta]', err);
      el.innerHTML = `<div class="alm-aviso">Não foi possível carregar: ${esc(err.message || err)}</div>`;
    }
  }

  // grava e recarrega; erro vira aviso sem perder a tela
  async function gravar(promessa, ok) {
    const { error } = await promessa;
    if (error) { console.error('[admin-leads-meta]', error); toast(`Não foi possível salvar: ${error.message}`); return; }
    if (ok) toast(ok);
    await carregar();
    pintar();
  }

  window.renderAdminLeadsMeta = renderAdminLeadsMeta;
  window.admLeadsMeta = {
    unidade(id) { unidadeSel = id; pintar(); },
    tipoRegra(t) {
      document.getElementById('alm-r-cidades').classList.toggle('hidden', t !== 'cidade');
      document.getElementById('alm-r-form').classList.toggle('hidden', t !== 'formulario');
    },
    paginaUnidade(pageId, franquiaId) {
      return gravar(supabaseClient.from('meta_leads_paginas').update({ franquia_id: franquiaId }).eq('page_id', pageId), `Página agora manda leads pra ${nomeUnidade(franquiaId)}`);
    },
    paginaAtiva(pageId, ativo) {
      if (!ativo && !confirm('Pausar esta página? Os leads dela vão ficar parados até você ligar de novo.')) return;
      return gravar(supabaseClient.from('meta_leads_paginas').update({ ativo }).eq('page_id', pageId), ativo ? 'Página ligada' : 'Página pausada');
    },
    regraCriar() {
      const tipo = document.getElementById('alm-r-tipo').value;
      const franquia_id = document.getElementById('alm-r-unidade').value;
      let valores, rotulo;
      if (tipo === 'cidade') {
        rotulo = document.getElementById('alm-r-cidades').value.split(',').map((c) => c.trim()).filter(Boolean).join(', ');
        valores = [...new Set(rotulo.split(',').map(norm).filter(Boolean))];
        if (!valores.length) { toast('Escreva pelo menos uma cidade.'); return; }
      } else {
        const f = document.getElementById('alm-r-form').value;
        if (!f) { toast('Ainda não chegou lead de nenhum formulário.'); return; }
        valores = [f]; rotulo = 'Formulário ' + f;
      }
      return gravar(supabaseClient.from('meta_leads_regras').insert({ tipo, valores, rotulo, franquia_id }), 'Regra adicionada');
    },
    regraAtiva(id, ativo) { return gravar(supabaseClient.from('meta_leads_regras').update({ ativo }).eq('id', id), ativo ? 'Regra ligada' : 'Regra pausada'); },
    regraApagar(id) {
      if (!confirm('Apagar esta regra?')) return;
      return gravar(supabaseClient.from('meta_leads_regras').delete().eq('id', id), 'Regra apagada');
    },
    rodizioAtivo(id, ativo) {
      return gravar(supabaseClient.from('meta_leads_rodizio').update({ ativo }).eq('id', id), ativo ? 'Voltou pro rodízio' : 'Saiu do rodízio');
    },
    rodizioAdicionar() {
      const email = document.getElementById('alm-add-vend').value;
      if (!email) return;
      return gravar(supabaseClient.from('meta_leads_rodizio').upsert({ franquia_id: unidadeSel, vendedor_email: email, ativo: true }, { onConflict: 'franquia_id,vendedor_email' }),
        `${nomePessoa(email)} entrou no rodízio`);
    },
    semVendedor(modo) {
      return gravar(supabaseClient.from('meta_leads_unidades').upsert({ franquia_id: unidadeSel, sem_vendedor: modo, updated_at: new Date().toISOString() }, { onConflict: 'franquia_id' }), 'Configuração salva');
    },
    async reprocessar(btn) {
      if (btn) { btn.disabled = true; btn.lastChild.textContent = 'Reprocessando…'; }
      try {
        const r = await fetch(`${SUPABASE_URL}/functions/v1/meta-leads?acao=processar`).then((x) => x.json());
        const ok = (r.criado || 0) + (r.duplicado || 0);
        toast(ok ? `${ok} lead${ok > 1 ? 's' : ''} distribuído${ok > 1 ? 's' : ''}` : 'Nada mudou: confira o rodízio e as regras');
      } catch (err) {
        toast('Não foi possível reprocessar agora');
      }
      await carregar();
      pintar();
    },
  };
})();
