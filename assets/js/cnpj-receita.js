// ==========================================
// CNPJ NA RECEITA — preencher a partir do cadastro da empresa
// ==========================================
// Quando um campo de documento recebe um CNPJ válido, consulta a Receita
// (BrasilAPI, a mesma da tela da Rede) e abre um painel com o que veio:
// cada campo com uma caixinha e, se a tela pedir, os sócios para escolher o
// representante legal. Nada é preenchido sem clicar em "Preencher marcados" —
// e nada é gravado: quem salva continua sendo o botão da própria tela.
//
// Uso: cnpjReceitaLigar(input, {
//   ancora: () => elemento depois do qual o painel aparece,
//   montar: async (r) => ({ campos: [{ rotulo, valor, atual, aplicar(v), el?, padrao?, igual? }],
//                           socios?: true, onSocio?(socio) }),
// })
// O CPF dos sócios vem mascarado pela Receita (***123456**): só nome e cargo.
(function () {
  const cache = {};
  const dig = (v) => String(v ?? '').replace(/\D/g, '');
  const esc = (s) => (typeof escapeHTML === 'function' ? escapeHTML(String(s ?? ''))
    : String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9@]+/g, ' ').trim();
  const toast = (m) => { if (typeof showToast === 'function') showToast(m); };
  const cnpjOk = (d) => d.length === 14 && (typeof documentoValido !== 'function' || documentoValido(d));

  async function consultar(cnpj) {
    const d = dig(cnpj);
    if (cache[d]) return cache[d];
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    try {
      const r = await fetch('https://brasilapi.com.br/api/cnpj/v1/' + d, { signal: ctrl.signal });
      if (r.status === 404 || r.status === 400) return { erro: 'CNPJ não encontrado na Receita.' };
      if (!r.ok) return { erro: 'A consulta à Receita falhou. Preencha à mão.' };
      cache[d] = normalizar(await r.json());
      return cache[d];
    } catch (err) {
      console.warn('[cnpj-receita] consulta', err);
      return { erro: 'Não deu para consultar a Receita agora. Preencha à mão.' };
    } finally {
      clearTimeout(timer);
    }
  }

  // "Sócio-Administrador" → "SÓCIO-ADMINISTRADOR"; "Titular Pessoa Física Residente..." → "EMPRESÁRIO"
  function cargoContrato(q) {
    const s = String(q || '').replace(/\s*\(.*\)\s*$/, '').replace(/\s+(pessoa|residente|domiciliad[oa]).*$/i, '').trim();
    if (/^(titular|empres[aá]rio)/i.test(s)) return 'EMPRESÁRIO';
    return s.toUpperCase();
  }

  function normalizar(j) {
    const cep = dig(j.cep), tel = dig(j.ddd_telefone_1);
    const tipo = String(j.descricao_tipo_de_logradouro || '').trim();
    const logr = String(j.logradouro || '').trim();
    let socios = (j.qsa || [])
      .filter((s) => s && s.nome_socio && dig(s.cnpj_cpf_do_socio).length !== 14) // sócio PJ não assina
      .map((s) => ({ nome: String(s.nome_socio).trim().toUpperCase(), cargo: String(s.qualificacao_socio || 'Sócio').trim() }));
    // Empresário individual / MEI não tem QSA: o nome está na razão social
    // ("12.345.678 JOAO DA SILVA" ou "JOAO DA SILVA 12345678901")
    if (!socios.length) {
      const m = String(j.razao_social || '').match(/^[\d.\s-]{8,}\s+(.+)$/) || String(j.razao_social || '').match(/^(.+?)\s+\d{11}$/);
      if (m) socios = [{ nome: m[1].trim().toUpperCase(), cargo: 'Titular' }];
    }
    return {
      cnpj: dig(j.cnpj),
      razao_social: String(j.razao_social || '').trim().toUpperCase(),
      fantasia: String(j.nome_fantasia || '').trim(),
      situacao: String(j.descricao_situacao_cadastral || '').trim(),
      logradouro: tipo && !norm(logr).startsWith(norm(tipo)) ? `${tipo} ${logr}` : logr,
      numero: String(j.numero || '').trim(),
      complemento: String(j.complemento || '').replace(/\s+/g, ' ').trim(),
      bairro: String(j.bairro || '').trim(),
      cep: cep.length === 8 ? cep.replace(/(\d{5})(\d{3})/, '$1-$2') : '',
      municipio: String(j.municipio || '').trim(),
      uf: String(j.uf || '').trim().toUpperCase(),
      ibge: j.codigo_municipio_ibge || null,
      email: String(j.email || '').trim().toLowerCase(),
      telefone: tel.length >= 10 ? `(${tel.slice(0, 2)}) ${tel.slice(2, -4)}-${tel.slice(-4)}` : '',
      socios,
    };
  }

  // Sócio que normalmente assina: administrador / presidente / titular...
  function socioPadrao(socios) {
    const i = socios.findIndex((s) => /administrador|presidente|titular|diretor|s[ií]ndico|empres[aá]rio/i.test(s.cargo));
    return i >= 0 ? i : 0;
  }

  function fecharPainel(input) {
    if (input && input._cnpjPainel) { input._cnpjPainel.remove(); input._cnpjPainel = null; }
  }

  function piscar(el) {
    if (!el) return;
    el.classList.remove('cnpj-rf-flash');
    void el.offsetWidth;
    el.classList.add('cnpj-rf-flash');
    setTimeout(() => el.classList.remove('cnpj-rf-flash'), 1400);
  }

  async function abrir(input, opts, auto) {
    const btn = input._cnpjBtn;
    if (btn) btn.classList.add('busy');
    const r = await consultar(input.value);
    if (btn) btn.classList.remove('busy');
    if (dig(input.value) !== dig(r.cnpj || input.value)) return; // digitou outro no meio
    if (r.erro) { toast(r.erro); return; }

    const conf = (await opts.montar(r)) || {};
    const campos = (conf.campos || []).filter((c) => c && c.valor);
    const socios = conf.socios ? r.socios : null;
    fecharPainel(input);

    const igual = (c) => (c.igual ? c.igual(c.atual) : norm(c.atual) === norm(c.valor));
    const linhas = campos.map((c, i) => {
      const mesmo = igual(c);
      const marcado = !mesmo && (c.padrao != null ? c.padrao : true);
      const atual = String(c.atual || '').trim();
      return `<label class="cnpj-rf-row"><input type="checkbox" data-i="${i}" ${marcado ? 'checked' : ''} ${mesmo ? 'disabled' : ''}>
        <span class="k">${esc(c.rotulo)}</span><span class="v">${esc(c.valor)}</span>
        ${mesmo ? '<span class="eq">igual</span>' : atual ? `<s title="Valor atual">${esc(atual)}</s>` : ''}</label>`;
    }).join('');

    const nome = 'cnpjrf' + Date.now();
    const sel = socios && socios.length ? socioPadrao(socios) : -1;
    const sociosHTML = !socios ? '' : `
      <div class="cnpj-rf-sec">Representante legal <span>(quem assina pela empresa)</span></div>
      ${socios.length
        ? `<p class="cnpj-rf-hint">Sócios na Receita. Ela esconde o CPF, então CPF e RG continuam à mão.</p>
           ${socios.map((s, i) => `<label class="cnpj-rf-soc"><input type="radio" name="${nome}" value="${i}" ${i === sel ? 'checked' : ''}><b>${esc(s.nome)}</b><span>${esc(s.cargo)}</span></label>`).join('')}`
        : '<p class="cnpj-rf-hint">A Receita não lista sócios para esse CNPJ.</p>'}
      <label class="cnpj-rf-soc"><input type="radio" name="${nome}" value="-1" ${sel < 0 ? 'checked' : ''}><span>Outra pessoa / preencho depois</span></label>`;

    const ativa = /^ativa$/i.test(r.situacao);
    const painel = document.createElement('div');
    painel.className = 'cnpj-rf';
    painel.innerHTML = `
      <div class="cnpj-rf-top"><i data-lucide="building-2"></i><b>${esc(r.razao_social)}</b>
        ${r.situacao ? `<em class="${ativa ? 'ok' : 'bad'}">${esc(r.situacao.charAt(0) + r.situacao.slice(1).toLowerCase())}</em>` : ''}
        <button type="button" class="cnpj-rf-x" title="Fechar"><i data-lucide="x"></i></button></div>
      ${!ativa && r.situacao ? '<p class="cnpj-rf-alerta">Atenção: esse CNPJ não está ativo na Receita.</p>' : ''}
      ${campos.length ? `<p class="cnpj-rf-hint">Achamos esse CNPJ na Receita. Marque o que quer trazer:</p><div class="cnpj-rf-rows">${linhas}</div>` : ''}
      ${sociosHTML}
      <div class="cnpj-rf-foot"><button type="button" class="cnpj-rf-no">Agora não</button>
        <button type="button" class="cnpj-rf-ok"><i data-lucide="check"></i>Preencher marcados</button></div>`;

    const ancora = (opts.ancora && opts.ancora()) || input;
    ancora.insertAdjacentElement('afterend', painel);
    input._cnpjPainel = painel;
    if (window.lucide) window.lucide.createIcons();
    if (!auto || painel.getBoundingClientRect().top > window.innerHeight - 120) painel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });

    painel.querySelector('.cnpj-rf-x').onclick = () => fecharPainel(input);
    painel.querySelector('.cnpj-rf-no').onclick = () => fecharPainel(input);
    painel.querySelector('.cnpj-rf-ok').onclick = () => {
      let n = 0;
      painel.querySelectorAll('.cnpj-rf-rows input:checked').forEach((cb) => {
        const c = campos[Number(cb.dataset.i)];
        c.aplicar(c.valor);
        piscar(c.el);
        n++;
      });
      const radio = painel.querySelector(`input[name="${nome}"]:checked`);
      const s = radio && socios ? socios[Number(radio.value)] : null;
      if (s && conf.onSocio) { conf.onSocio({ ...s, cargo_contrato: cargoContrato(s.cargo) }); n++; }
      fecharPainel(input);
      if (conf.depois) conf.depois();
      toast(n ? 'Dados da Receita preenchidos. Confira e salve.' : 'Nada marcado para preencher.');
    };
  }

  // Liga no campo: lupa dentro do input (aparece com CNPJ completo) e consulta
  // sozinha quando um CNPJ novo termina de ser digitado/colado.
  function cnpjReceitaLigar(input, opts) {
    if (!input || input.dataset.receita) return;
    input.dataset.receita = '1';
    const wrap = document.createElement('span');
    wrap.className = 'cnpj-rf-wrap';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    input.style.setProperty('padding-right', '40px', 'important');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cnpj-rf-btn';
    btn.title = 'Buscar dados na Receita';
    btn.innerHTML = '<i data-lucide="search"></i>';
    wrap.appendChild(btn);
    input._cnpjBtn = btn;
    if (window.lucide) window.lucide.createIcons();

    let ultimo = dig(input.value); // o CNPJ que já estava salvo não dispara sozinho
    const ajustar = () => { const d = dig(input.value); btn.hidden = !cnpjOk(d); return d; };
    ajustar();
    btn.onclick = () => { if (cnpjOk(dig(input.value))) abrir(input, opts, false); };
    input.addEventListener('input', () => {
      const d = ajustar();
      if (!btn.hidden && d !== ultimo) { ultimo = d; abrir(input, opts, true); }
      else if (btn.hidden) fecharPainel(input);
    });
  }

  window.cnpjReceitaLigar = cnpjReceitaLigar;
  window.cnpjReceitaCargo = cargoContrato;
})();
