// ==========================================
// ADMIN › TAREFAS AUTOMÁTICAS — regras que a Plataforma cria sozinha
// ------------------------------------------
// Aba do painel admin (registrada em ui-v2-admin.js, grupo Sistema).
//   • Números: abertas, atrasadas, concluídas em 30 dias (tarefa da gestão
//     conta uma vez, não uma por pessoa)
//   • Cada regra: ligar/desligar, prazo em dias e urgente. Desligar só vale
//     para as novas; as abertas seguem e concluem sozinhas como antes.
//   • Quem recebe as tarefas da gestão em cada unidade (franquias.tarefas_gestao;
//     vazio = gestores e admins da unidade)
// Tudo pelas RPCs da migration 20261118150000_tarefas_auto_regras (só admin).
// Sem a migration a tela avisa e o resto da plataforma segue igual.
// ==========================================

(function () {
  const ic = (n) => `<i data-lucide="${n}"></i>`;
  const esc = (s) => (typeof escapeHTML === 'function' ? escapeHTML(String(s ?? '')) : String(s ?? ''));
  const toast = (m) => { if (typeof showToast === 'function') showToast(m); };

  // [regra, ícone, nome, quando, para quem, quando conclui sozinha]
  const REGRAS = [
    ['lead_meta', 'phone', 'Ligar para o lead', 'Lead do Meta chega com vendedor', 'Vendedor do lead', 'no primeiro contato registrado'],
    ['venda_cadastro', 'file-text', 'Documentos do cadastro', 'Venda registrada', 'Vendedor', 'quando o cadastro da aba Arquivos completa'],
    ['venda_vistoria', 'camera', 'Fotos da vistoria', 'Venda registrada', 'Vendedor', 'quando as fotos da vistoria completam'],
    ['venda_contrato', 'file-signature', 'Contrato e procuração', 'Venda registrada', 'Gestão da unidade', 'quando a procuração é anexada'],
    ['eng_pendencia', 'alert-triangle', 'Pendência da engenharia', 'Engenharia reprova ou pede documentos', 'Gestão da unidade', 'no reenvio ou quando os documentos chegam'],
  ];
  const CARGO = { admin: 'Admin', gestor: 'Gestor' };

  let D = null;          // retorno de tarefas_auto_painel
  let erro = '';         // mensagem quando não deu pra carregar
  let container = null;
  let unidadeAberta = null;
  let marcados = new Set();
  const timers = {};

  async function carregar() {
    const { data, error } = await supabaseClient.rpc('tarefas_auto_painel');
    if (error) {
      const semMigration = /tarefas_auto_painel|does not exist|schema cache|PGRST202/i.test(`${error.message} ${error.code}`);
      erro = semMigration
        ? 'Falta rodar no SQL Editor a migration 20261118150000_tarefas_auto_regras. Até lá as tarefas automáticas seguem funcionando com as regras de antes.'
        : `Não deu para carregar: ${error.message}`;
      D = null;
      return;
    }
    erro = '';
    D = data || { regras: [], unidades: [], pessoas: [] };
  }

  const cfg = (regra) => (D.regras || []).find((r) => r.regra === regra);

  function kpisHTML() {
    const soma = (k) => (D.regras || []).reduce((s, r) => s + (Number(r[k]) || 0), 0);
    const atras = soma('atrasadas');
    const kpi = (l, v, cls = '') => `<div class="alm-kpi ${cls}"><small>${l}</small><b>${v}</b></div>`;
    return `<div class="alm-kpis">${kpi('Abertas agora', soma('abertas'))}${kpi('Atrasadas', atras, atras ? 'bad' : '')}${kpi('Concluídas em 30 dias', soma('feitas30'))}</div>`;
  }

  function regraHTML([id, icone, nome, quando, para, fecha]) {
    const r = cfg(id);
    if (!r) return '';
    const dias = Number(r.prazo_dias);
    const prazo = id === 'lead_meta'
      ? '<span class="alm-chip">No mesmo dia (depois das 18h, no dia seguinte)</span>'
      : `<span class="ata-step" role="group" aria-label="Prazo em dias">
           <button type="button" onclick="adminTarefasAuto.prazo('${id}', -1)" aria-label="Menos um dia">${ic('minus')}</button>
           <span>${dias === 0 ? 'Mesmo dia' : `${dias} ${dias === 1 ? 'dia' : 'dias'}`}</span>
           <button type="button" onclick="adminTarefasAuto.prazo('${id}', 1)" aria-label="Mais um dia">${ic('plus')}</button>
         </span>`;
    return `
      <div class="alm-row ata-regra ${r.ativa ? '' : 'off'}">
        <i class="alm-fb">${ic(icone)}</i>
        <div class="alm-grow">
          <b>${esc(nome)}${r.ativa ? '' : ' <span class="v2-chip t-gray">Desligada</span>'}</b>
          <small>Quando: ${esc(quando)} · Para: ${esc(para)} · Conclui sozinha ${esc(fecha)}</small>
        </div>
        <button type="button" class="alm-tg ${r.ativa ? 'on' : ''}" onclick="adminTarefasAuto.ligar('${id}')" aria-pressed="${r.ativa}" aria-label="${r.ativa ? 'Desligar' : 'Ligar'} ${esc(nome)}"></button>
        <div class="ata-ctl">
          <span class="alm-lbl">Prazo</span>${prazo}
          <label class="ata-urg"><button type="button" class="alm-tg sm ${r.urgente ? 'on' : ''}" onclick="adminTarefasAuto.urgente('${id}')" aria-pressed="${r.urgente}" aria-label="Urgente"></button>Urgente</label>
          <span class="ata-num">
            <span class="v2-chip t-blue">${r.abertas} ${r.abertas === 1 ? 'aberta' : 'abertas'}</span>
            ${r.atrasadas ? `<span class="v2-chip t-red">${r.atrasadas} ${r.atrasadas === 1 ? 'atrasada' : 'atrasadas'}</span>` : ''}
          </span>
        </div>
      </div>`;
  }

  function pessoasDaUnidade(u) {
    // gestores/admins da unidade primeiro, depois os admins de outras unidades
    const lista = (D.pessoas || []).filter((p) => p.franquia_id === u.id || p.role === 'admin' || marcados.has(p.id));
    return lista.sort((a, b) => (b.franquia_id === u.id) - (a.franquia_id === u.id) || String(a.nome).localeCompare(String(b.nome)));
  }

  function unidadeHTML(u) {
    const proprios = (u.escolhidos || []).map((p) => p.nome);
    const quem = proprios.length
      ? `<span class="v2-chip t-orange">Lista própria</span> ${esc(proprios.join(', '))}`
      : `Padrão · ${esc((u.padrao || []).join(', ') || 'admins')}`;
    const aberta = unidadeAberta === u.id;
    let editor = '';
    if (aberta) {
      const pessoas = pessoasDaUnidade(u);
      editor = `
        <div class="ata-edit">
          <p class="alm-sub">Marque quem recebe. Sem ninguém marcado, vale o padrão: gestores e admins da unidade.</p>
          <div class="ata-pessoas">
            ${pessoas.map((p) => `<label class="ata-pessoa"><input type="checkbox" ${marcados.has(p.id) ? 'checked' : ''} onchange="adminTarefasAuto.marcar('${p.id}', this.checked)">
              <span>${esc(p.nome)}<small>${CARGO[p.role] || ''}${p.franquia_id !== u.id ? ' · outra unidade' : ''}</small></span></label>`).join('') || '<div class="alm-vazio">Nenhum gestor ou admin ativo.</div>'}
          </div>
          <div class="alm-nova">
            <button type="button" class="alm-btn pri" onclick="adminTarefasAuto.salvarGestao('${u.id}')">${ic('check')}Salvar</button>
            ${proprios.length ? `<button type="button" class="alm-btn" onclick="adminTarefasAuto.salvarGestao('${u.id}', true)">${ic('rotate-ccw')}Voltar ao padrão</button>` : ''}
            <button type="button" class="alm-btn" onclick="adminTarefasAuto.abrir(null)">Cancelar</button>
          </div>
        </div>`;
    }
    return `
      <div class="alm-row ata-un">
        <div class="alm-grow"><b>${esc(u.nome)}</b><small>${quem}</small></div>
        ${aberta ? '' : `<button type="button" class="alm-btn" onclick="adminTarefasAuto.abrir('${u.id}')">${ic('user-check')}Trocar</button>`}
        ${editor}
      </div>`;
  }

  function pintar() {
    if (!container) return;
    if (!D) {
      container.innerHTML = `<div class="alm ata"><div class="alm-aviso">${esc(erro || 'Carregando…')}</div></div>`;
      return;
    }
    container.innerHTML = `
      <div class="alm ata">
        ${kpisHTML()}
        <div class="alm-card">
          <h3>${ic('bot')}Regras</h3>
          <p class="alm-sub">A Plataforma cria a tarefa sozinha e conclui quando a coisa é feita. Desligar uma regra só para as novas: as abertas continuam e concluem sozinhas.</p>
          ${REGRAS.map(regraHTML).join('')}
        </div>
        <div class="alm-card">
          <h3>${ic('users')}Quem recebe as tarefas da gestão</h3>
          <p class="alm-sub">Vale para Contrato e procuração, Pendência da engenharia e os avisos de tarefa atrasada.</p>
          ${(D.unidades || []).map(unidadeHTML).join('')}
        </div>
      </div>`;
    if (window.lucide) window.lucide.createIcons();
  }

  async function salvarRegra(id, patch) {
    const r = cfg(id);
    const { error } = await supabaseClient.rpc('tarefas_auto_regra_salvar', {
      p_regra: id, p_ativa: patch.ativa ?? null, p_prazo_dias: patch.prazo_dias ?? null, p_urgente: patch.urgente ?? null,
    });
    if (error) {
      toast(`Não salvou: ${error.message}`);
      await carregar(); pintar();
      return;
    }
    Object.assign(r, patch);
    toast('Salvo');
  }

  window.adminTarefasAuto = {
    ligar(id) {
      const r = cfg(id); if (!r) return;
      const ativa = !r.ativa;
      r.ativa = ativa; pintar();
      salvarRegra(id, { ativa });
    },
    urgente(id) {
      const r = cfg(id); if (!r) return;
      const urgente = !r.urgente;
      r.urgente = urgente; pintar();
      salvarRegra(id, { urgente });
    },
    prazo(id, delta) {
      const r = cfg(id); if (!r || id === 'lead_meta') return;
      const dias = Math.min(60, Math.max(0, (Number(r.prazo_dias) || 0) + delta));
      if (dias === r.prazo_dias) return;
      r.prazo_dias = dias; pintar();
      // vários cliques seguidos = um salvamento só
      clearTimeout(timers[id]);
      timers[id] = setTimeout(() => salvarRegra(id, { prazo_dias: dias }), 600);
    },
    abrir(unidadeId) {
      unidadeAberta = unidadeId;
      const u = (D.unidades || []).find((x) => x.id === unidadeId);
      marcados = new Set(u ? (u.escolhidos || []).map((p) => p.id) : []);
      pintar();
    },
    marcar(userId, on) { if (on) marcados.add(userId); else marcados.delete(userId); },
    async salvarGestao(unidadeId, padrao) {
      const lista = padrao ? [] : [...marcados];
      const { error } = await supabaseClient.rpc('tarefas_auto_gestao_salvar', { p_franquia: unidadeId, p_users: lista });
      if (error) { toast(`Não salvou: ${error.message}`); return; }
      toast(lista.length ? 'Salvo' : 'Voltou ao padrão');
      unidadeAberta = null;
      await carregar(); pintar();
    },
  };

  window.renderAdminTarefasAuto = async function (el) {
    container = el;
    unidadeAberta = null;
    D = null; erro = '';
    pintar();
    await carregar();
    if (container === el) pintar();
  };
})();
