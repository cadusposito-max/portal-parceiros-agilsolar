// ==========================================================================
// AMBIENTE REDE — 6º ambiente, só ADMIN.
// Controle de cada unidade: CNPJs (vários por unidade), impostos por CNPJ,
// taxas da franquia, DRE por unidade e receitas da franqueadora.
//
// De onde vêm os números:
// - faturamento, vendas, propostas e projetos: RPC rede_movimento (vendas
//   registradas na plataforma, propostas criadas e eng_projetos);
// - impostos: rede_empresas + rede_impostos (alíquota vigente no mês);
// - custos e despesas: rede_lancamentos; sem lançamento, custos viram
//   estimativa (% em rede_taxas) e despesas repetem o último mês lançado;
// - royalties, fundo, rebate e mensalidade: rede_taxas;
// - projetos de engenharia: RPC rede_projetos (kWp de cada projeto) × faixa de
//   kWp (rede_padroes.projeto_faixas ou tabela própria da unidade); ajuste ou
//   isenção por projeto em rede_projeto_taxas.
// Toda a leitura/escrita é protegida no banco por is_admin().
// ==========================================================================
(function () {
  'use strict';

  const R = { mes: null, data: null, unit: null, utab: 'resumo', busca: '', container: null, tab: 'visao', loading: null, projAberto: false };

  const MESES_ABR = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const MESES_N = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const CORES = ['#008FD4', '#FAA519', '#5CC3F2', '#006A9E', '#F7C873', '#B8C2CC'];
  const REGIMES = { simples: 'Simples Nacional', presumido: 'Lucro Presumido', real: 'Lucro Real', mei: 'MEI' };
  // representante legal do CNPJ (chaves iguais às de documentos.js)
  const REP_CARGOS = [['proprietario', 'Proprietário(a)'], ['socio_administrador', 'Sócio(a)-administrador(a)'], ['socio', 'Sócio(a)'], ['administrador', 'Administrador(a)'], ['diretor', 'Diretor(a)']];
  const REP_ESTADO_CIVIL = [['solteiro', 'Solteiro(a)'], ['casado', 'Casado(a)'], ['divorciado', 'Divorciado(a)'], ['separado', 'Separado(a) judicialmente'], ['viuvo', 'Viúvo(a)'], ['uniao_estavel', 'União estável']];
  const BASES = { faturamento: 'Faturamento', servicos: 'Serviços', equipamentos: 'Equipamentos' };
  const CUSTOS = [['custo_kits', 'Custo dos kits'], ['custo_instalacao', 'Instalação e materiais'], ['comissoes', 'Comissões de venda']];
  const DESPESAS = [['aluguel', 'Aluguel'], ['folha', 'Folha e pró-labore'], ['marketing', 'Marketing local'], ['veiculos', 'Veículo e combustível'], ['outras', 'Outras']];
  const TAXA_CAMPOS = ['royalties_pct', 'royalties_base', 'royalties_minimo', 'publicidade_pct', 'rebate_pct', 'mensalidade', 'equipamentos_pct', 'custo_equip_pct', 'custo_serv_pct', 'comissao_pct'];

  // ------------------------------------------------------------ utilidades
  const esc = (s) => (typeof escapeHTML === 'function' ? escapeHTML(String(s ?? '')) : String(s ?? ''));
  const ic = (n) => `<i data-lucide="${n}"></i>`;
  const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  // "1.500" = mil e quinhentos; "1,5" e "1.5" = um e meio
  const parseNum = (v) => {
    let s = String(v ?? '').trim().replace(/[^\d,.-]/g, '');
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : 0;
  };
  const brl = (v) => (v < 0 ? '-' : '') + 'R$ ' + Math.abs(Math.round(v)).toLocaleString('pt-BR');
  const brlC = (v) => (v < 0 ? '-' : '') + 'R$ ' + Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const curto = (v) => { const a = Math.abs(v); const s = a >= 1e6 ? (a / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + ' mi' : a >= 1e3 ? (a / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mil' : String(Math.round(a)); return (v < 0 ? '-' : '') + s; };
  const pct = (v, d = 1) => num(v).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) + '%';
  const pctIn = (v) => num(v).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
  const toast = (m) => { if (typeof showToast === 'function') showToast(m); };
  const icons = () => { if (typeof queueAppLucideCreateIcons === 'function') queueAppLucideCreateIcons(); else if (window.lucide) window.lucide.createIcons(); };
  const nomeCurto = (n) => String(n || '').replace(/^\s*[áa]gil\s*solar\s*[-–·]?\s*/i, '') || n;
  const digits = (s) => String(s || '').replace(/\D/g, '');

  function hojeSP() { return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }); }
  function mesAtual() { return hojeSP().slice(0, 7); }
  function addMes(ym, n) { let [y, m] = ym.split('-').map(Number); m += n; while (m < 1) { m += 12; y--; } while (m > 12) { m -= 12; y++; } return `${y}-${String(m).padStart(2, '0')}`; }
  const mesIdx = (ym) => Number(ym.slice(5, 7)) - 1;
  const mesNome = (ym) => `${MESES_N[mesIdx(ym)]} ${ym.slice(0, 4)}`;
  const mesAbr = (ym) => MESES_ABR[mesIdx(ym)];
  const ultimoDia = (ym) => { const [y, m] = ym.split('-').map(Number); return new Date(y, m, 0).getDate(); };

  function cidadeUf(f) {
    const [c, u] = String(f.cidade || '').split(' - ');
    return { cidade: (c || '').trim(), uf: (f.uf || u || '').trim().toUpperCase() };
  }
  function cnpjValido(c) {
    const d = digits(c);
    if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
    const calc = (len) => { let s = 0, p = len - 7; for (let i = 0; i < len; i++) { s += Number(d[i]) * p--; if (p < 2) p = 9; } const r = s % 11; return r < 2 ? 0 : 11 - r; };
    return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
  }
  const fmtCnpj = (c) => { const d = digits(c); return d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : c; };

  // ------------------------------------------------------------ dados
  async function carregar() {
    const mes = R.mes;
    const ehAtual = mes === mesAtual();
    const dia = ehAtual ? Number(hojeSP().slice(8, 10)) : null;
    const meses = [5, 4, 3, 2, 1, 0].map((i) => addMes(mes, -i));
    const sb = supabaseClient;
    const [fr, emp, imp, tx, pad, lan, mov, usr, prj] = await Promise.all([
      sb.from('franquias').select('id, nome, cidade, uf, tipo, ativo, inicio_operacao, hsp_medio, created_at').order('nome'),
      sb.from('rede_empresas').select('*').order('principal', { ascending: false }).order('razao_social'),
      sb.from('rede_impostos').select('*').order('created_at'),
      sb.from('rede_taxas').select('*'),
      sb.from('rede_padroes').select('*').eq('id', 1).maybeSingle(),
      sb.from('rede_lancamentos').select('*').gte('mes', meses[0] + '-01').lte('mes', mes + '-01'),
      sb.rpc('rede_movimento', { p_ate: mes + '-01', p_meses: 6, p_dia: dia }),
      sb.from('user_accounts').select('franquia_id, nome, email, role, ativo').eq('ativo', true).order('nome'),
      sb.rpc('rede_projetos', { p_ate: mes + '-01', p_meses: 6, p_dia: dia }),
    ]);
    const erro = [fr, emp, imp, tx, pad, lan, mov, prj].find((r) => r.error);
    if (erro) throw erro.error;
    const movMap = {};
    (mov.data || []).forEach((r) => { movMap[r.franquia_id + '|' + String(r.mes).slice(0, 7)] = r; });
    const taxas = {};
    (tx.data || []).forEach((t) => { taxas[t.franquia_id] = t; });
    const projetos = {};
    (prj.data || []).forEach((p) => { (projetos[p.franquia_id + '|' + String(p.mes).slice(0, 7)] ||= []).push(p); });
    return {
      key: mes, mes, meses, dia,
      franquias: fr.data || [],
      empresas: emp.data || [],
      impostos: imp.data || [],
      taxas,
      padroes: pad.data || {},
      lanc: lan.data || [],
      mov: movMap,
      projetos,
      users: usr.error ? [] : (usr.data || []),
    };
  }

  const D = () => R.data;
  const franquia = (id) => D().franquias.find((f) => f.id === id);
  const taxasDe = (fid) => D().taxas[fid] || D().padroes || {};
  const empresasDe = (fid, todas) => D().empresas.filter((e) => e.franquia_id === fid && (todas || e.ativo));
  const ativas = () => D().franquias.filter((f) => f.ativo !== false);

  function impostosVigentes(empresaId, ym) {
    const ini = ym + '-01', fim = ym + '-' + String(ultimoDia(ym)).padStart(2, '0');
    return D().impostos.filter((i) => i.empresa_id === empresaId && i.vigente_desde <= fim && (!i.vigente_ate || i.vigente_ate >= ini));
  }

  // imposto de um faturamento hipotético (usado também para a alíquota efetiva)
  function impostoDe(fid, ym, fat) {
    const t = taxasDe(fid);
    const equip = fat * num(t.equipamentos_pct) / 100, serv = fat - equip;
    const emps = empresasDe(fid);
    const soma = emps.reduce((s, e) => s + num(e.participacao_pct), 0);
    let imp = 0, faltando = !emps.length;
    emps.forEach((e) => {
      const share = soma ? num(e.participacao_pct) / soma : 1 / emps.length;
      const lst = impostosVigentes(e.id, ym);
      if (!lst.length) faltando = true;
      lst.forEach((i) => { const b = i.base === 'servicos' ? serv : i.base === 'equipamentos' ? equip : fat; imp += b * share * num(i.aliquota) / 100; });
    });
    return { imp, faltando };
  }
  const aliqEfetiva = (fid, ym) => impostoDe(fid, ym, 100).imp;

  // projetos de engenharia: valor pela faixa de kWp ("até X kWp"; o limite fica na
  // faixa de baixo). Acima da última faixa é "a combinar" até o admin informar.
  const kwpTxt = (v) => num(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  const faixasPadrao = () => (Array.isArray(D().padroes.projeto_faixas) ? D().padroes.projeto_faixas : []);
  const faixasProprias = (fid) => { const t = D().taxas[fid]; return t && Array.isArray(t.projeto_faixas) && t.projeto_faixas.length ? t.projeto_faixas : null; };
  const faixasDe = (fid) => faixasProprias(fid) || faixasPadrao();
  function cobraProjetos(f) { const t = D().taxas[f.id]; return t && t.projeto_cobrar != null ? !!t.projeto_cobrar : f.tipo === 'franquia'; }
  function faixaDoKwp(faixas, kwp) {
    let de = 0;
    for (const x of faixas) { if (kwp <= num(x.ate)) return { de, ate: num(x.ate), valor: num(x.valor) }; de = num(x.ate); }
    return null;
  }
  const faixaTxt = (fx) => (fx.de ? `${kwpTxt(fx.de)} a ${kwpTxt(fx.ate)} kWp` : `até ${kwpTxt(fx.ate)} kWp`);
  function taxaProjeto(p, faixas) {
    const kwp = num(p.kwp), fx = kwp > 0 ? faixaDoKwp(faixas, kwp) : null;
    if (p.isento) return { v: 0, tipo: 'isento', fx };
    if (p.valor != null) return { v: num(p.valor), tipo: 'ajustado', fx };
    if (!(kwp > 0)) return { v: 0, tipo: 'sem_kwp', fx };
    return fx ? { v: fx.valor, tipo: 'faixa', fx } : { v: 0, tipo: 'combinar', fx };
  }
  function projetosDe(f, ym) {
    const faixas = faixasDe(f.id);
    return (D().projetos[f.id + '|' + ym] || []).map((p) => ({ ...p, taxa: taxaProjeto(p, faixas) }));
  }

  // lançamentos do mês; sem nenhum, repete o último mês lançado (estimativa)
  function lancDe(fid, ym) {
    const doMes = D().lanc.filter((l) => l.franquia_id === fid && String(l.mes).slice(0, 7) === ym);
    if (doMes.length) return { map: Object.fromEntries(doMes.map((l) => [l.categoria, num(l.valor)])), ref: ym, estimado: false };
    const anteriores = D().lanc.filter((l) => l.franquia_id === fid && String(l.mes).slice(0, 7) < ym).map((l) => String(l.mes).slice(0, 7)).sort();
    const ult = anteriores[anteriores.length - 1];
    if (!ult) return { map: {}, ref: null, estimado: false };
    const lst = D().lanc.filter((l) => l.franquia_id === fid && String(l.mes).slice(0, 7) === ult);
    return { map: Object.fromEntries(lst.map((l) => [l.categoria, num(l.valor)])), ref: ult, estimado: true };
  }

  function calc(f, ym) {
    const t = taxasDe(f.id);
    const mv = D().mov[f.id + '|' + ym] || {};
    const fat = num(mv.faturamento);
    const equip = fat * num(t.equipamentos_pct) / 100, serv = fat - equip;
    const { imp, faltando } = impostoDe(f.id, ym, fat);
    const liq = fat - imp;
    const L = lancDe(f.id, ym);
    const has = (k) => Object.prototype.hasOwnProperty.call(L.map, k) && !L.estimado;
    const cKit = has('custo_kits') ? L.map.custo_kits : equip * num(t.custo_equip_pct) / 100;
    const cInst = has('custo_instalacao') ? L.map.custo_instalacao : serv * num(t.custo_serv_pct) / 100;
    const com = has('comissoes') ? L.map.comissoes : fat * num(t.comissao_pct) / 100;
    const custos = cKit + cInst + com;
    const bruto = liq - custos;
    const baseRoy = t.royalties_base === 'servicos' ? serv : t.royalties_base === 'bruto' ? Math.max(bruto, 0) : fat;
    let roy = baseRoy * num(t.royalties_pct) / 100, royMin = false;
    if (f.tipo === 'franquia' && f.ativo !== false && num(t.royalties_minimo) > 0 && roy < num(t.royalties_minimo)) { roy = num(t.royalties_minimo); royMin = true; }
    const pub = fat * num(t.publicidade_pct) / 100;
    const cobraProj = cobraProjetos(f);
    const projs = cobraProj ? projetosDe(f, ym) : [];
    const nproj = projs.filter((p) => p.taxa.tipo !== 'isento').length;
    const proj = projs.reduce((s, p) => s + p.taxa.v, 0);
    const projPendentes = projs.filter((p) => p.taxa.tipo === 'combinar' || p.taxa.tipo === 'sem_kwp').length;
    const mens = num(t.mensalidade);
    const taxas = roy + pub + proj + mens;
    const despMap = {}; let desp = 0;
    DESPESAS.forEach(([k]) => { if (L.map[k] != null) { despMap[k] = L.map[k]; desp += L.map[k]; } });
    const res = bruto - taxas - desp;
    const reb = cKit * num(t.rebate_pct) / 100;
    return {
      fat, equip, serv, imp, faltaImposto: faltando, liq, cKit, cInst, com, custos, bruto,
      estKit: !has('custo_kits'), estInst: !has('custo_instalacao'), estCom: !has('comissoes'),
      roy, royMin, baseRoy, pub, proj, nproj, projs, cobraProj, projPendentes, mens, taxas, desp, despMap, despRef: L.ref, despEstimado: L.estimado, semDesp: !L.ref,
      res, mg: fat ? res / fat * 100 : null, reb, franq: roy + pub + reb + proj + mens,
      vendas: num(mv.vendas), propostas: num(mv.propostas), valorPropostas: num(mv.valor_propostas),
    };
  }
  function rede(ym) {
    const t = { fat: 0, imp: 0, custos: 0, taxas: 0, desp: 0, res: 0, roy: 0, pub: 0, reb: 0, proj: 0, mens: 0, franq: 0, vendas: 0, propostas: 0, valorPropostas: 0, nproj: 0 };
    ativas().forEach((f) => { const c = calc(f, ym); Object.keys(t).forEach((k) => { t[k] += num(c[k]); }); });
    return t;
  }
  function status(f, c) {
    if (f.ativo === false) return ['rd-gray', 'Inativa'];
    if (!c.fat) return ['rd-bad', 'Sem venda no mês'];
    if (c.mg < 0) return ['rd-bad', 'Prejuízo'];
    if (c.mg < 8) return ['rd-at', 'Atenção'];
    return ['rd-ok', 'Saudável'];
  }
  function delta(cur, prev) {
    if (!prev && !cur) return '<span class="rd-delta rd-nt">sem movimento</span>';
    if (!prev) return `<span class="rd-delta rd-nt">${ic('sparkles')}sem base no mês anterior</span>`;
    const d = (cur - prev) / Math.abs(prev) * 100;
    return `<span class="rd-delta ${d >= 0 ? 'rd-up' : 'rd-dn'}">${ic(d >= 0 ? 'arrow-up-right' : 'arrow-down-right')}${pct(Math.abs(d))}</span>`;
  }
  const periodoTxt = () => (D().dia ? `dia 1 ao ${D().dia}` : 'mês inteiro');

  // ------------------------------------------------------------ rota
  const TITULOS = {
    visao: ['Visão geral da rede', 'Indicadores de todas as unidades'],
    unidades: ['Unidades', 'CNPJs, impostos e taxas de cada unidade'],
    dre: ['Resultado da rede (DRE)', 'Receita, impostos, custos, taxas e despesas por unidade'],
    franqueadora: ['Receitas da franqueadora', 'Royalties, fundo de publicidade, rebates e projetos'],
    padroes: ['Padrões da rede', 'Valores que toda unidade nova recebe'],
  };
  function meta() {
    let [title, sub] = TITULOS[R.tab] || TITULOS.visao;
    if (R.tab === 'unidades' && R.unit && R.data) { const f = franquia(R.unit); if (f) { title = f.nome; sub = 'Unidade da rede'; } }
    window.uiV2PageMeta = { key: 'rede:' + R.tab, title, sub };
    if (window.uiV2Shell) window.uiV2Shell.refresh();
  }

  async function renderRedeRoute(container, tab) {
    R.container = container;
    R.tab = tab || 'visao';
    if (!state.isAdmin) {
      container.innerHTML = '<div class="rd"><div class="rd-card rd-empty"><div class="ic">' + ic('lock') + '</div><b>Acesso restrito</b>O ambiente Rede é só para administradores.</div></div>';
      icons();
      return;
    }
    if (!R.mes) R.mes = mesAtual();
    if (R.tab !== 'unidades') R.unit = null;
    meta();
    if (!R.data || R.data.key !== R.mes) {
      container.innerHTML = `<div class="rd"><div class="rd-loading">${ic('loader-2')}Carregando a rede...</div></div>`;
      icons();
      const pedido = R.mes;
      try {
        const dados = await (R.loading && R.loading.mes === pedido ? R.loading.p : (R.loading = { mes: pedido, p: carregar() }).p);
        if (pedido === R.mes) R.data = dados;
      } catch (err) {
        console.error('[rede] falha ao carregar', err);
        container.innerHTML = `<div class="rd"><div class="rd-card rd-empty"><div class="ic">${ic('alert-triangle')}</div><b>Não foi possível carregar a rede</b>${esc(err.message || err)}<br><br><button class="rd-btn" onclick="redeRecarregar()">${ic('refresh-cw')}Tentar de novo</button></div></div>`;
        icons();
        return;
      } finally { R.loading = null; }
    }
    if (state.environment !== 'rede' || R.container !== container) return;
    pintar();
  }

  function pintar() {
    const c = R.container;
    if (!c || !document.body.contains(c) || !R.data) return;
    const corpo = { visao: telaVisao, unidades: R.unit ? telaUnidade : telaUnidades, dre: telaDre, franqueadora: telaFranqueadora, padroes: telaPadroes }[R.tab] || telaVisao;
    const scroll = window.scrollY;
    c.innerHTML = `<div class="rd">${barra()}${corpo()}</div>`;
    icons();
    meta();
    window.scrollTo(0, scroll);
  }

  function barra() {
    const opts = [];
    for (let i = 0; i < 13; i++) { const ym = addMes(mesAtual(), -i); opts.push(`<option value="${ym}" ${ym === R.mes ? 'selected' : ''}>${mesNome(ym)}</option>`); }
    const lista = R.tab === 'unidades' && !R.unit;
    return `<div class="rd-bar">
      <label class="rd-sel" title="Mês">${ic('calendar')}<select onchange="redeSetMes(this.value)">${opts.join('')}</select></label>
      ${lista ? `<label class="rd-sel">${ic('search')}<input placeholder="Buscar unidade ou CNPJ" value="${esc(R.busca)}" oninput="redeBuscar(this.value)"></label>` : ''}
      <span class="rd-grow"></span>
      <button class="rd-btn ghost" onclick="redeRecarregar()" title="Atualizar">${ic('refresh-cw')}<span class="rd-hide-m">Atualizar</span></button>
      ${lista ? `<button class="rd-btn pri" onclick="redeNovaUnidade()">${ic('plus')}Nova unidade</button>` : ''}
    </div>`;
  }

  // ------------------------------------------------------------ gráficos
  function barrasEmpilhadas(series, cores, meses, destaque, W = 620, H = 230) {
    const P = 46, n = meses.length, slot = (W - P - 10) / n, bw = Math.min(46, slot * 0.6);
    const tot = meses.map((_, i) => series.reduce((s, sr) => s + num(sr[i]), 0));
    const mx = Math.max(...tot, 1) * 1.15;
    const x = (i) => P + i * slot + (slot - bw) / 2, y = (v) => H - 26 - (v / mx) * (H - 46);
    let g = '';
    for (let j = 0; j <= 3; j++) { const v = mx / 3 * j; g += `<line class="gl" x1="${P}" x2="${W}" y1="${y(v)}" y2="${y(v)}"/><text class="ax" x="${P - 8}" y="${y(v) + 4}" text-anchor="end">${curto(v)}</text>`; }
    meses.forEach((ym, i) => {
      let acc = 0;
      series.forEach((sr, j) => { const v = num(sr[i]); if (!v) return; const y0 = y(acc), y1 = y(acc + v); g += `<rect x="${x(i)}" y="${y1}" width="${bw}" height="${Math.max(y0 - y1, 0.5)}" style="fill:${cores[j]}" opacity="${i === destaque ? 1 : 0.5}"/>`; acc += v; });
      g += `<text class="ax ${i === destaque ? 'on' : ''}" x="${x(i) + bw / 2}" y="${H - 8}" text-anchor="middle">${mesAbr(ym)}</text>`;
      if (tot[i]) g += `<text class="vl ${i === destaque ? 'on' : ''}" x="${x(i) + bw / 2}" y="${y(tot[i]) - 6}" text-anchor="middle">${curto(tot[i])}</text>`;
    });
    return `<div class="rd-chart"><svg viewBox="0 0 ${W} ${H}" role="img">${g}</svg></div>`;
  }

  // ------------------------------------------------------------ visão geral
  function telaVisao() {
    const d = D(), ym = d.mes, ant = addMes(ym, -1), r = rede(ym), p = d.meses.includes(ant) ? rede(ant) : null;
    const fs = ativas();
    const rows = fs.map((f) => ({ f, c: calc(f, ym), p: calc(f, ant) })).sort((a, b) => b.c.fat - a.c.fat);
    const maxF = Math.max(...rows.map((x) => x.c.fat), 1);

    // série do gráfico: 5 unidades com mais faturamento no período + outras
    const soma6 = fs.map((f) => ({ f, s: d.meses.reduce((s, m) => s + num((d.mov[f.id + '|' + m] || {}).faturamento), 0) })).sort((a, b) => b.s - a.s);
    const top = soma6.slice(0, 5).filter((x) => x.s > 0);
    const outras = soma6.filter((x) => !top.includes(x));
    const series = top.map((x) => d.meses.map((m) => num((d.mov[x.f.id + '|' + m] || {}).faturamento)));
    if (outras.some((x) => x.s > 0)) series.push(d.meses.map((m) => outras.reduce((s, x) => s + num((d.mov[x.f.id + '|' + m] || {}).faturamento), 0)));
    const nomesSerie = top.map((x) => nomeCurto(x.f.nome)).concat(outras.some((x) => x.s > 0) ? ['Outras'] : []);
    const temFat = series.some((sr) => sr.some((v) => v > 0));

    const alertas = [];
    fs.forEach((f) => {
      const emps = empresasDe(f.id);
      const c = calc(f, ym), pc = calc(f, ant);
      if (!emps.length) alertas.push(['bad', 'building-2', `${nomeCurto(f.nome)} sem CNPJ cadastrado`, 'Sem CNPJ não dá pra calcular impostos nem fazer contrato pela unidade.', `redeAbrirUnidade('${f.id}','empresas')`]);
      else if (c.faltaImposto) alertas.push(['at', 'percent', `${nomeCurto(f.nome)} com impostos não configurados`, 'Algum CNPJ está sem alíquota; o DRE considera 0% de imposto.', `redeAbrirUnidade('${f.id}','taxas')`]);
      if (f.tipo === 'franquia' && !c.fat) alertas.push(['bad', 'trending-down', `${nomeCurto(f.nome)} sem venda registrada`, `Nenhuma venda em ${mesNome(ym).toLowerCase()} (${periodoTxt()}).`, `redeAbrirUnidade('${f.id}','resultado')`]);
      else if (pc.fat && c.fat < pc.fat * 0.8) alertas.push(['at', 'arrow-down-right', `${nomeCurto(f.nome)} caiu ${pct((pc.fat - c.fat) / pc.fat * 100)}`, 'Comparado ao mesmo período do mês anterior.', `redeAbrirUnidade('${f.id}','resumo')`]);
      if (c.projPendentes) alertas.push(['at', 'ruler', `${nomeCurto(f.nome)}: ${c.projPendentes} projeto(s) sem valor`, 'Acima da tabela de kWp ou sem kWp. Informe o valor na linha de projetos do DRE.', `redeAbrirUnidade('${f.id}','resultado')`]);
    });
    // receita da franqueadora: um card por fonte, com o peso de cada uma no total
    const nMin = fs.filter((f) => calc(f, ym).royMin).length;
    // royalties e fundo só incidem nas franquias (unidade própria não paga): o % é sobre elas
    const fatFranq = fs.filter((f) => f.tipo === 'franquia').reduce((s, f) => s + calc(f, ym).fat, 0);
    const sobreFranq = (v) => (fatFranq ? pct(v / fatFranq * 100) + ' do faturamento das franquias' : 'sem faturamento das franquias');
    const parte = (v) => (r.franq > 0 ? Math.round(v / r.franq * 100) : 0);
    const recCard = (icone, titulo, v, vAnt, det, extra = '') => `<div class="rd-kpi"><div class="l">${ic(icone)}${titulo}</div><div class="v">${brl(v)}</div><div class="h">${p ? delta(v, num(vAnt)) + ' ' : ''}${det}${extra ? ' ' + extra : ''}</div><div class="rd-recbar" title="${parte(v)}% da receita da franqueadora"><i style="width:${parte(v)}%"></i></div></div>`;
    const semDesp = fs.filter((f) => calc(f, ym).semDesp);
    if (semDesp.length) alertas.push(['info', 'file-warning', `${semDesp.length} unidade(s) sem despesas lançadas`, semDesp.slice(0, 3).map((f) => nomeCurto(f.nome)).join(', ') + (semDesp.length > 3 ? '…' : '') + ' · o resultado fica sem despesas.', `redeAbrirUnidade('${semDesp[0].id}','resultado')`]);

    return `
    ${r.vendas === 0 ? `<div class="rd-note">${ic('info')}<div>Nenhuma venda registrada na plataforma em ${mesNome(ym).toLowerCase()}. O faturamento da rede vem das vendas registradas ao marcar o cliente como <b>Fechado</b> (botão registrar venda).</div></div>` : ''}
    <div class="rd-grid rd-k3 rd-mb">
      <div class="rd-kpi hero"><div class="l">${ic('trending-up')}Faturamento da rede</div><div class="v">${brl(r.fat)}</div><div class="h">${p ? delta(r.fat, p.fat) : ''} vs ${mesAbr(ant)} (${periodoTxt()})</div></div>
      <div class="rd-kpi"><div class="l">${ic('scale')}Resultado líquido</div><div class="v ${r.res < 0 ? 'rd-neg' : ''}">${brl(r.res)}</div><div class="h">Margem de ${pct(r.fat ? r.res / r.fat * 100 : 0)} · soma das unidades</div></div>
      <div class="rd-kpi"><div class="l">${ic('handshake')}Vendas no mês</div><div class="v">${r.vendas}</div><div class="h">${r.propostas} propostas · ${brl(r.valorPropostas)} em propostas</div></div>
    </div>
    <div class="rd-sec"><h3>${ic('landmark')}Receitas da franqueadora</h3><span>Total <b>${brl(r.franq)}</b>${p ? delta(r.franq, p.franq) : ''}</span></div>
    <div class="rd-grid rd-k4 rd-mb">
      ${recCard('crown', 'Royalties', r.roy, p && p.roy, sobreFranq(r.roy), nMin ? `<span class="rd-tag">${nMin} no mínimo</span>` : '')}
      ${recCard('megaphone', 'Fundo de publicidade', r.pub, p && p.pub, sobreFranq(r.pub))}
      ${recCard('receipt', 'Rebates', r.reb, p && p.reb, 'pago pelo distribuidor sobre os kits')}
      ${recCard('file-check-2', 'Projetos e mensalidades', r.proj + r.mens, p && p.proj + p.mens, `${r.nproj} projeto${r.nproj === 1 ? '' : 's'} de engenharia${r.mens ? ' + mensalidades' : ''}`)}
    </div>
    <div class="rd-grid rd-two rd-mb">
      <div class="rd-card">
        <div class="rd-ch"><div><h3>Faturamento da rede por mês</h3><p class="rd-sub">${d.dia ? `Cada mês comparado do dia 1 ao ${d.dia}` : 'Meses inteiros'}</p></div><span class="rd-pill rd-info">${fs.filter((f) => calc(f, ym).fat > 0).length} de ${fs.length} unidades faturaram</span></div>
        ${temFat ? barrasEmpilhadas(series, CORES, d.meses, 5) + `<div class="rd-legend">${nomesSerie.map((n, i) => `<span><i style="background:${CORES[i]}"></i>${esc(n)}</span>`).join('')}</div>` : `<div class="rd-empty"><div class="ic">${ic('bar-chart-3')}</div><b>Sem vendas registradas nos últimos 6 meses</b>O gráfico aparece assim que as unidades registrarem vendas.</div>`}
      </div>
      <div class="rd-card">
        <h3>${ic('bell-ring')}Precisa de atenção</h3><p class="rd-sub">Clique para abrir a unidade</p>
        ${alertas.length ? alertas.slice(0, 7).map((a) => `<button class="rd-alert" onclick="${a[4]}"><div class="ic ${a[0]}">${ic(a[1])}</div><div><b>${esc(a[2])}</b><span>${esc(a[3])}</span></div></button>`).join('') : `<div class="rd-empty"><div class="ic">${ic('check')}</div><b>Tudo em dia</b>Nenhum alerta neste mês.</div>`}
      </div>
    </div>
    <div class="rd-card">
      <div class="rd-ch"><div><h3>Ranking das unidades</h3><p class="rd-sub">${mesNome(ym)} · clique numa linha para ver a unidade</p></div><button class="rd-btn sm" onclick="setTab('dre')">${ic('sheet')}Ver DRE completo</button></div>
      <table class="rd-t cards">
        <thead><tr><th>Unidade</th><th class="r">Faturamento</th><th class="rd-hide-m">Participação</th><th class="r">vs mês ant.</th><th class="r">Margem líq.</th><th class="r">Vendas</th><th>Situação</th></tr></thead>
        <tbody>${rows.map(({ f, c, p: pc }) => { const s = status(f, c); return `<tr class="click" onclick="redeAbrirUnidade('${f.id}')">
          <td class="first"><div class="rd-name">${esc(f.nome)}</div><div class="rd-muted">${esc(cidadeUf(f).cidade)}/${esc(cidadeUf(f).uf)} · ${f.tipo === 'propria' ? 'Própria' : 'Franquia'}</div></td>
          <td class="r" data-l="Faturamento"><b>${brl(c.fat)}</b></td>
          <td class="rd-hide-m"><div class="rd-meter"><i style="width:${c.fat / maxF * 100}%"></i></div></td>
          <td class="r" data-l="vs mês ant.">${delta(c.fat, pc.fat)}</td>
          <td class="r ${c.mg < 0 ? 'rd-neg' : ''}" data-l="Margem líq.">${c.mg == null ? '—' : pct(c.mg)}</td>
          <td class="r" data-l="Vendas">${c.vendas} <span class="rd-muted">/ ${c.propostas} prop.</span></td>
          <td data-l="Situação"><span class="rd-pill ${s[0]}">${s[1]}</span></td></tr>`; }).join('')}</tbody>
      </table>
      <div class="rd-tip">${ic('info')}Faturamento = vendas registradas na plataforma no período. Custos sem lançamento usam as estimativas da aba Impostos e taxas de cada unidade.</div>
    </div>`;
  }

  // ------------------------------------------------------------ unidades
  function telaUnidades() {
    const ym = D().mes;
    const q = R.busca.trim().toLowerCase(), qd = digits(q);
    const lista = D().franquias.filter((f) => {
      if (!q) return true;
      if (f.nome.toLowerCase().includes(q) || String(f.cidade || '').toLowerCase().includes(q)) return true;
      return empresasDe(f.id, true).some((e) => e.razao_social.toLowerCase().includes(q) || (qd && digits(e.cnpj).includes(qd)));
    }).sort((a, b) => (a.ativo === false) - (b.ativo === false) || a.nome.localeCompare(b.nome));
    const nEmp = D().empresas.filter((e) => e.ativo).length;
    return `
    <p class="rd-sub">${D().franquias.length} unidades · ${nEmp} CNPJ(s) ativos</p>
    ${lista.length ? `<div class="rd-grid rd-units">${lista.map((f) => {
      const c = calc(f, ym), s = status(f, c), emps = empresasDe(f.id), t = taxasDe(f.id), cu = cidadeUf(f);
      return `<button class="rd-ucard ${f.ativo === false ? 'off' : ''}" onclick="redeAbrirUnidade('${f.id}')">
        <div class="hd"><div><div class="nm">${esc(nomeCurto(f.nome))}</div><div class="ct">${ic('map-pin')}${esc(cu.cidade)}${cu.uf ? '/' + esc(cu.uf) : ''} · ${f.tipo === 'propria' ? 'Própria' : 'Franquia'}</div></div><span class="rd-pill ${s[0]}">${s[1]}</span></div>
        <div class="row"><div><div class="l">Faturamento</div><div class="v">${brl(c.fat)}</div></div><div><div class="l">Margem líq.</div><div class="v ${c.mg < 0 ? 'rd-neg' : ''}">${c.mg == null ? '—' : pct(c.mg)}</div></div></div>
        <div class="foot">
          ${emps.length ? `<span class="rd-tag">${emps.length} CNPJ${emps.length > 1 ? 's' : ''}</span>` : '<span class="rd-tag bad">sem CNPJ</span>'}
          ${emps[0] ? `<span class="rd-tag">${esc(REGIMES[emps[0].regime] || 'regime não informado')}</span>` : ''}
          ${emps.length ? `<span class="rd-tag ${c.faltaImposto ? 'bad' : ''}">impostos ${c.faltaImposto && !aliqEfetiva(f.id, ym) ? 'não config.' : pct(aliqEfetiva(f.id, ym))}</span>` : ''}
          ${f.tipo === 'franquia' ? `<span class="rd-tag auto">royalties ${pct(t.royalties_pct)}</span>` : '<span class="rd-tag auto">não paga royalties</span>'}
        </div>
      </button>`; }).join('')}</div>` : `<div class="rd-card rd-empty"><div class="ic">${ic('search-x')}</div><b>Nada encontrado</b>Nenhuma unidade ou CNPJ com "${esc(R.busca)}".</div>`}`;
  }

  function telaUnidade() {
    const f = franquia(R.unit);
    if (!f) { R.unit = null; return telaUnidades(); }
    const ym = D().mes, c = calc(f, ym), p = calc(f, addMes(ym, -1)), s = status(f, c), cu = cidadeUf(f);
    const UT = [['resumo', 'layout-dashboard', 'Resumo'], ['empresas', 'building-2', 'Empresas (CNPJs)'], ['taxas', 'percent', 'Impostos e taxas'], ['resultado', 'sheet', 'Resultado'], ['equipe', 'users', 'Equipe']];
    const corpo = { resumo: uResumo, empresas: uEmpresas, taxas: uTaxas, resultado: uResultado, equipe: uEquipe }[R.utab] || uResumo;
    return `
    <button class="rd-back" onclick="redeVoltarUnidades()">${ic('chevron-left')}Todas as unidades</button>
    <div class="rd-uhead">
      <div style="display:flex;gap:14px;align-items:center;min-width:0"><div class="av">${ic(f.tipo === 'propria' ? 'building' : 'store')}</div>
        <div style="min-width:0"><h2>${esc(f.nome)}</h2><div class="rd-muted" style="margin-top:3px">${esc(cu.cidade)}${cu.uf ? '/' + esc(cu.uf) : ''} · ${f.tipo === 'propria' ? 'Unidade própria' : 'Franquia'}${f.inicio_operacao ? ' desde ' + esc(new Date(f.inicio_operacao + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })) : ''}</div></div></div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><span class="rd-pill ${s[0]}">${s[1]}</span><button class="rd-btn sm" onclick="redeEditarUnidade('${f.id}')">${ic('pencil')}Editar dados</button></div>
    </div>
    <div class="rd-tabs">${UT.map(([id, i, n]) => `<button class="rd-tab ${R.utab === id ? 'on' : ''}" onclick="redeUnidadeAba('${id}')">${ic(i)}${n}</button>`).join('')}</div>
    ${corpo(f, c, p)}`;
  }

  function uResumo(f, c, p) {
    const d = D(), fr = f.tipo === 'franquia';
    const serie = d.meses.map((m) => num((d.mov[f.id + '|' + m] || {}).faturamento));
    const emps = empresasDe(f.id);
    const usuarios = d.users.filter((u) => u.franquia_id === f.id).length;
    return `
    <div class="rd-grid rd-k4 rd-mb">
      <div class="rd-kpi hero"><div class="l">Faturamento</div><div class="v">${brl(c.fat)}</div><div class="h">${delta(c.fat, p.fat)} vs mês anterior</div></div>
      <div class="rd-kpi"><div class="l">Impostos</div><div class="v">${brl(c.imp)}</div><div class="h">${emps.length ? pct(aliqEfetiva(f.id, d.mes)) + ' efetivo · ' + emps.length + ' CNPJ(s)' : 'Sem CNPJ cadastrado'}</div></div>
      <div class="rd-kpi"><div class="l">Resultado líquido</div><div class="v ${c.res < 0 ? 'rd-neg' : ''}">${brl(c.res)}</div><div class="h">Margem ${c.mg == null ? '—' : pct(c.mg)}</div></div>
      <div class="rd-kpi"><div class="l">${fr ? 'Paga à franqueadora' : 'Rebate gerado'}</div><div class="v">${brl(fr ? c.taxas : c.reb)}</div><div class="h">${fr ? 'royalties + fundo + projetos' : pct(taxasDe(f.id).rebate_pct) + ' sobre kits'}</div></div>
    </div>
    <div class="rd-grid rd-two">
      <div class="rd-card"><h3>Últimos 6 meses</h3><p class="rd-sub">Faturamento da unidade · ${periodoTxt()}</p>
        ${serie.some((v) => v) ? barrasEmpilhadas([serie], ['#008FD4'], d.meses, 5, 600, 190) : `<div class="rd-empty"><div class="ic">${ic('bar-chart-3')}</div><b>Sem vendas registradas</b>Nenhuma venda nos últimos 6 meses.</div>`}
      </div>
      <div class="rd-card"><h3>Cadastro</h3><p class="rd-sub">Dados da unidade</p>
        ${[['Tipo', fr ? 'Franquia' : 'Unidade própria'], ['Cidade', `${esc(cidadeUf(f).cidade)}/${esc(cidadeUf(f).uf) || '—'}`], ['Início', f.inicio_operacao ? new Date(f.inicio_operacao + 'T12:00:00').toLocaleDateString('pt-BR') : '—'], ['Usuários ativos', usuarios],
          ['CNPJ principal', emps[0] ? esc(emps[0].cnpj) : '<span class="rd-neg">não cadastrado</span>'], ['Propostas no mês', `${c.propostas} · ${brl(c.valorPropostas)}`], ['Projetos de engenharia', c.nproj]]
          .map(([a, b]) => `<div class="rd-line"><span class="rd-muted">${a}</span><b style="text-align:right">${b}</b></div>`).join('')}
      </div>
    </div>`;
  }

  function uEmpresas(f) {
    const todas = empresasDe(f.id, true);
    const ativasE = todas.filter((e) => e.ativo);
    const soma = ativasE.reduce((s, e) => s + num(e.participacao_pct), 0);
    return `
    <div class="rd-card">
      <div class="rd-ch"><div><h3>Empresas (CNPJs) da unidade</h3><p class="rd-sub">Uma unidade pode faturar por mais de um CNPJ. Cada um tem seu regime e seus impostos. Com mais de um, o contrato deixa escolher o CNPJ.</p></div><button class="rd-btn pri" onclick="redeEmpresaModal('${f.id}')">${ic('plus')}Adicionar CNPJ</button></div>
      ${todas.length ? todas.map((e) => `
        <div class="rd-cnpj ${e.ativo ? '' : 'off'}">
          <div class="hd"><div style="min-width:0"><div class="rz">${esc(e.razao_social)} ${e.principal && e.ativo ? '<span class="rd-pill rd-info">Principal</span>' : ''}${e.ativo ? '' : '<span class="rd-pill rd-gray">Desativado</span>'}</div><div class="num">${esc(e.cnpj)}${e.nome_fantasia ? ' · ' + esc(e.nome_fantasia) : ''}</div></div>
          <div style="display:flex;gap:4px;flex-wrap:wrap">
            <button class="rd-btn sm ghost" onclick="redeEmpresaModal('${f.id}','${e.id}')">${ic('pencil')}Editar</button>
            ${e.ativo && !e.principal ? `<button class="rd-btn sm ghost" onclick="redeEmpresaPrincipal('${e.id}')">${ic('star')}Tornar principal</button>` : ''}
            <button class="rd-btn sm ghost ${e.ativo ? 'danger' : ''}" onclick="redeEmpresaAtivo('${e.id}', ${!e.ativo})">${ic(e.ativo ? 'archive' : 'archive-restore')}${e.ativo ? 'Desativar' : 'Reativar'}</button>
          </div></div>
          <div class="rd-kv">
            <div><div class="l">Regime</div><div class="v">${esc(REGIMES[e.regime] || 'Não informado')}</div></div>
            <div><div class="l">Município</div><div class="v">${esc([e.municipio, e.uf].filter(Boolean).join('/') || '—')}</div></div>
            <div><div class="l">Insc. estadual</div><div class="v">${esc(e.inscricao_estadual || '—')}</div></div>
            <div><div class="l">Insc. municipal</div><div class="v">${esc(e.inscricao_municipal || '—')}</div></div>
            <div style="grid-column:span 2"><div class="l">Nome no contrato</div><div class="v">${esc(e.nome_contrato || e.razao_social)}</div></div>
            <div style="grid-column:span 2"><div class="l">Endereço</div><div class="v">${esc(e.endereco || '—')}</div></div>
            <div style="grid-column:span 2"><div class="l">Representante legal</div><div class="v">${e.representante && e.representante.nome ? esc(e.representante.nome) + ' · ' + esc((REP_CARGOS.find(([k]) => k === e.representante.cargo) || REP_CARGOS[0])[1]) : '<span style="color:var(--v2-red)">Não informado (o contrato sai sem "neste ato representada por")</span>'}</div></div>
          </div>
          ${e.ativo ? `<div class="rd-share"><span style="white-space:nowrap">Fatura: <b>${esc([e.fatura_servicos && 'serviços', e.fatura_equipamentos && 'equipamentos', e.fatura_om && 'O&M'].filter(Boolean).join(', ') || '—')}</b></span><div class="rd-meter"><i style="width:${soma ? num(e.participacao_pct) / soma * 100 : 0}%"></i></div><b>${pct(soma ? num(e.participacao_pct) / soma * 100 : 0, 0)} do faturamento</b></div>` : ''}
        </div>`).join('') : `
        <div class="rd-empty"><div class="ic" style="color:var(--v2-red)">${ic('building-2')}</div><b>Cadastre o primeiro CNPJ da unidade</b>Sem CNPJ a plataforma não calcula impostos.<br><br><button class="rd-btn pri" onclick="redeEmpresaModal('${f.id}')">${ic('plus')}Adicionar CNPJ</button></div>`}
      ${ativasE.length > 1 && Math.round(soma) !== 100 ? `<div class="rd-tip">${ic('alert-triangle')}As participações somam ${pct(soma, 0)}; a plataforma divide proporcionalmente.</div>` : ''}
      <div class="rd-tip">${ic('info')}A participação diz quanto do faturamento da unidade sai por cada CNPJ. É usada para calcular os impostos de cada um.</div>
    </div>`;
  }

  function uTaxas(f) {
    const t = taxasDe(f.id), fr = f.tipo === 'franquia', ym = D().mes;
    const emps = empresasDe(f.id);
    const inp = (campo, v, dis, money) => `<div class="rd-in ${money ? 'money' : ''}">${money ? '<span>R$</span>' : ''}<input inputmode="decimal" value="${pctIn(v)}" ${dis ? 'disabled' : ''} onchange="redeSetTaxa('${f.id}','${campo}',this.value)">${money ? '' : '<span>%</span>'}</div>`;
    const bo = (v, l) => `<option value="${v}" ${t.royalties_base === v ? 'selected' : ''}>${l}</option>`;
    const cartao = propostaTaxasCartao(D().taxas[f.id]?.cartao_taxas);
    return `
    <div class="rd-grid rd-two rd-mb">
      <div class="rd-card">
        <h3>${ic('receipt')}Impostos por CNPJ</h3><p class="rd-sub">Alíquotas por regime e região. Mudar uma alíquota vale a partir de ${mesNome(ym).toLowerCase()} e guarda o histórico.</p>
        ${emps.length ? emps.map((e) => { const lst = impostosVigentes(e.id, ym); const tot = lst.reduce((s, i) => s + num(i.aliquota), 0); return `
          <div class="rd-imp">
            <div class="hd"><div><b>${esc(e.razao_social)}</b><div class="rd-muted">${esc(REGIMES[e.regime] || 'Regime não informado')} · ${esc([e.municipio, e.uf].filter(Boolean).join('/') || '—')}</div></div><span class="rd-tag ${lst.length ? '' : 'bad'}">${lst.length ? 'soma ' + pct(tot, 2) : 'sem impostos'}</span></div>
            ${lst.map((i) => `<div class="rd-line"><div class="nm"><span>${esc(i.nome)}</span><span class="rd-tag">${BASES[i.base] || i.base}</span><span class="rd-muted">${esc(desdeTxt(i.vigente_desde))}</span></div>
              <div style="display:flex;gap:4px;align-items:center"><div class="rd-in"><input inputmode="decimal" value="${pctIn(i.aliquota)}" onchange="redeSetAliquota('${i.id}',this.value)"><span>%</span></div><button class="rd-btn sm ghost danger" title="Remover" onclick="redeRemoverImposto('${i.id}')">${ic('trash-2')}</button></div></div>`).join('')}
            <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">
              <button class="rd-btn sm ghost" style="color:var(--v2-blue-text)" onclick="redeImpostoModal('${e.id}')">${ic('plus')}Adicionar imposto</button>
              ${!lst.length && e.regime ? `<button class="rd-btn sm ghost" style="color:var(--v2-blue-text)" onclick="redeSugerirImpostos('${e.id}')">${ic('wand-2')}Sugerir pelo regime</button>` : ''}
            </div>
          </div>`; }).join('') : `<div class="rd-empty"><div class="ic">${ic('building-2')}</div><b>Nenhum CNPJ</b>Cadastre um CNPJ na aba Empresas para configurar os impostos.</div>`}
      </div>
      <div class="rd-card">
        <h3>${ic('landmark')}Taxas da franquia</h3><p class="rd-sub">${fr ? 'O que a unidade paga à franqueadora. Começa com o padrão da rede e pode ser ajustado por contrato.' : 'Unidade própria: normalmente não paga royalties nem fundo. O rebate dos kits continua valendo.'}</p>
        <div class="rd-line"><div class="nm">Royalties</div>${inp('royalties_pct', t.royalties_pct)}</div>
        <div class="rd-line"><div class="nm rd-muted">Base dos royalties</div><select class="rd-inline-sel" onchange="redeSetTaxa('${f.id}','royalties_base',this.value)">${bo('total', 'Faturamento total')}${bo('servicos', 'Só serviços (sem kit)')}${bo('bruto', 'Resultado bruto')}</select></div>
        <div class="rd-line"><div class="nm">Mínimo mensal de royalties</div>${inp('royalties_minimo', t.royalties_minimo, false, true)}</div>
        <div class="rd-line"><div class="nm">Fundo de publicidade</div>${inp('publicidade_pct', t.publicidade_pct)}</div>
        <div class="rd-line"><div class="nm">Rebate sobre kits <span class="rd-tag auto">pago pelo distribuidor</span></div>${inp('rebate_pct', t.rebate_pct)}</div>
        <div class="rd-line"><div class="nm">Mensalidade da plataforma</div>${inp('mensalidade', t.mensalidade, false, true)}</div>
      </div>
    </div>
    ${uProjetos(f)}
    <div class="rd-card rd-mb" id="rd-cartao-taxas">
      <h3>${ic('credit-card')}Taxas do cartão de crédito</h3>
      <p class="rd-sub">Taxa da operadora por quantidade de parcelas, usada nas propostas solares desta unidade e no PDF. Cada campo salva ao sair.</p>
      <div class="rd-grid rd-cartao-grid">
        ${[0, 6, 12].map((inicio) => `<div>${Array.from({ length: 6 }, (_, i) => {
          const n = inicio + i + 1;
          return `<div class="rd-line"><label class="nm" for="rd-cartao-${n}">Crédito ${n}x</label><div class="rd-in"><input id="rd-cartao-${n}" inputmode="decimal" aria-label="Taxa do cartão em ${n} parcelas" value="${pctIn(cartao[n])}" onchange="redeSetTaxaCartao('${f.id}',${n},this)"><span>%</span></div></div>`;
        }).join('')}</div>`).join('')}
      </div>
    </div>
    <div class="rd-card">
      <h3>${ic('calculator')}Estimativas para o DRE</h3><p class="rd-sub">Usadas enquanto a unidade não lança os custos reais do mês.</p>
      <div class="rd-grid rd-half">
        <div>
          <div class="rd-line"><div class="nm">Parte do faturamento que é equipamento (kit)</div>${inp('equipamentos_pct', t.equipamentos_pct)}</div>
          <div class="rd-line"><div class="nm">Custo do kit sobre a venda de equipamento</div>${inp('custo_equip_pct', t.custo_equip_pct)}</div>
        </div>
        <div>
          <div class="rd-line"><div class="nm">Custo de instalação sobre a venda de serviço</div>${inp('custo_serv_pct', t.custo_serv_pct)}</div>
          <div class="rd-line"><div class="nm">Comissão de venda</div>${inp('comissao_pct', t.comissao_pct)}</div>
        </div>
      </div>
    </div>`;
  }

  // tabela de faixas; alvo = 'pad' (padrão da rede) ou id da unidade. Editável salva ao sair do campo.
  function faixasTabela(faixas, alvo, editavel) {
    const a = `'${alvo}'`;
    const linhas = faixas.map((x, i) => {
      const de = i ? num(faixas[i - 1].ate) : 0;
      const rotulo = de ? `Acima de ${kwpTxt(de)} até` : 'Até';
      if (!editavel) return `<div class="rd-line"><span>${rotulo} ${kwpTxt(x.ate)} kWp</span><b>${brlC(num(x.valor))}</b></div>`;
      return `<div class="rd-line rd-faixa"><div class="nm">${rotulo}<div class="rd-in"><input inputmode="decimal" aria-label="Limite da faixa em kWp" value="${pctIn(x.ate)}" onchange="redeSetFaixa(${a},${i},'ate',this.value)"><span>kWp</span></div></div>
        <div style="display:flex;gap:4px;align-items:center"><div class="rd-in money"><span>R$</span><input inputmode="decimal" aria-label="Valor do projeto nesta faixa" value="${pctIn(x.valor)}" onchange="redeSetFaixa(${a},${i},'valor',this.value)"></div>${faixas.length > 1 ? `<button class="rd-btn sm ghost danger" title="Remover faixa" onclick="redeDelFaixa(${a},${i})">${ic('trash-2')}</button>` : ''}</div></div>`;
    }).join('');
    const ult = faixas.length ? num(faixas[faixas.length - 1].ate) : 0;
    return `${linhas}<div class="rd-line"><span>Acima de ${kwpTxt(ult)} kWp</span><span class="rd-tag man">a combinar</span></div>
      ${editavel ? `<button class="rd-btn sm ghost" style="color:var(--v2-blue-text);margin-top:6px" onclick="redeAddFaixa(${a})">${ic('plus')}Adicionar faixa</button>` : ''}`;
  }

  function uProjetos(f) {
    const on = cobraProjetos(f), proprias = faixasProprias(f.id);
    return `<div class="rd-card rd-mb">
      <h3>${ic('ruler')}Projetos de engenharia</h3><p class="rd-sub">Cada projeto enviado à engenharia é cobrado pela faixa de kWp. Entra no DRE da unidade e na receita da franqueadora.</p>
      <div class="rd-line"><div class="nm">Cobrar projetos desta unidade</div><button class="rd-sw ${on ? 'on' : ''}" role="switch" aria-checked="${on}" aria-label="Cobrar projetos desta unidade" onclick="redeSetProjetoCobrar('${f.id}',${!on})"></button></div>
      ${on ? `<div class="rd-line"><div class="nm">Tabela usada</div><div class="rd-seg"><button class="${proprias ? '' : 'on'}" onclick="redeProjetoTabela('${f.id}',false)">Padrão da rede</button><button class="${proprias ? 'on' : ''}" onclick="redeProjetoTabela('${f.id}',true)">Personalizada</button></div></div>
        ${proprias ? faixasTabela(proprias, f.id, true) + `<div class="rd-tip">${ic('info')}Tabela só desta unidade. Mudanças no padrão da rede não alteram ela.</div>`
          : faixasTabela(faixasPadrao(), f.id, false) + `<div class="rd-tip">${ic('info')}Usando o padrão da rede (aba Padrões). Se o padrão mudar, muda aqui também.</div>`}`
        : `<div class="rd-tip">${ic('info')}Desligado: os projetos desta unidade não entram no DRE nem na receita da franqueadora.</div>`}
    </div>`;
  }

  function linha(n, v, cls = '', tag = '', extra = '') { return `<div class="rd-line ${cls}"><div class="nm">${n}${tag}</div><div class="val ${v < 0 ? 'rd-neg' : ''}">${brl(v)}${extra}</div></div>`; }
  const TA = ' <span class="rd-tag auto">plataforma</span>', TL = ' <span class="rd-tag man">lançado</span>', TC = ' <span class="rd-tag">calculado</span>', TE = ' <span class="rd-tag">estimado</span>';

  // linha "Projetos de engenharia" do DRE; clicando abre cada projeto com faixa, valor e isenção
  const ENG_STATUS = { validacao: 'Validação', validacao_reprovada: 'Validação reprovada', validacao_aprovada: 'Validação aprovada', elaborar_projeto: 'Elaborar projeto', projeto_enviado: 'Projeto enviado', projeto_aprovado: 'Projeto aprovado', projeto_reprovado: 'Projeto reprovado', projeto_reenviado: 'Projeto reenviado', solicitacao_vistoria: 'Solicitação de vistoria', vistoria_solicitada: 'Vistoria solicitada', projeto_concluido: 'Projeto concluído' };
  const statusTxt = (s) => { if (ENG_STATUS[s]) return ENG_STATUS[s]; const t = String(s || '').replace(/_/g, ' '); return t.charAt(0).toUpperCase() + t.slice(1); };
  function linhaProjetos(c) {
    const aberto = R.projAberto && c.projs.length;
    const pend = c.projPendentes ? ` <span class="rd-tag bad">${c.projPendentes} a definir</span>` : '';
    const cab = `<div class="rd-line ${c.projs.length ? 'rd-click' : ''}" ${c.projs.length ? 'role="button" tabindex="0" onclick="redeToggleProjetos()" onkeydown="if(event.key===\'Enter\')redeToggleProjetos()"' : ''}>
      <div class="nm">${c.projs.length ? ic(aberto ? 'chevron-down' : 'chevron-right') : ''}(−) Projetos de engenharia · ${c.nproj}× <span class="rd-tag auto">por kWp</span>${pend}</div><div class="val ${c.proj ? 'rd-neg' : ''}">${brl(-c.proj)}</div></div>`;
    if (!aberto) return cab;
    const tag = (p) => {
      const x = p.taxa;
      if (x.tipo === 'isento') return '<span class="rd-tag">isento</span>';
      if (x.tipo === 'ajustado') return '<span class="rd-tag man">ajustado</span>';
      if (x.tipo === 'combinar') return '<span class="rd-tag bad">a combinar</span>';
      if (x.tipo === 'sem_kwp') return '<span class="rd-tag bad">sem kWp</span>';
      return `<span class="rd-tag">${faixaTxt(x.fx)}</span>`;
    };
    return cab + `<div class="rd-projs">${c.projs.map((p) => `<div class="rd-proj">
        <div class="inf"><b>${p.numero ? '#' + p.numero + ' · ' : ''}${esc(p.cliente_nome || 'Cliente')}</b><div class="rd-muted">${num(p.kwp) > 0 ? kwpTxt(p.kwp) + ' kWp · ' : ''}${esc(statusTxt(p.status))} ${tag(p)}</div></div>
        <div class="act"><div class="rd-in money"><span>R$</span><input inputmode="decimal" aria-label="Valor do projeto" value="${p.taxa.tipo === 'combinar' || p.taxa.tipo === 'sem_kwp' ? '' : pctIn(p.taxa.v)}" placeholder="informar" ${p.isento ? 'disabled' : ''} onchange="redeProjetoValor('${p.id}',this.value)"></div>
        <button class="rd-btn sm ${p.isento ? '' : 'ghost'}" onclick="redeProjetoIsento('${p.id}',${!p.isento})">${p.isento ? 'Cobrar' : 'Isentar'}</button></div>
      </div>`).join('')}<div class="rd-tip">${ic('info')}O valor vem da faixa de kWp. Mudar o valor ou isentar vale só para aquele projeto; apagar o valor volta para a faixa.</div></div>`;
  }

  function uResultado(f, c) {
    const fr = f.tipo === 'franquia', ym = D().mes, t = taxasDe(f.id);
    const despTag = c.semDesp ? ' <span class="rd-tag bad">não lançado</span>' : c.despEstimado ? ` <span class="rd-tag">repete ${mesAbr(c.despRef)}</span>` : TL;
    const temTaxas = c.roy || c.pub || c.proj || c.mens;
    return `
    <div class="rd-grid rd-two">
      <div class="rd-card">
        <div class="rd-ch"><div><h3>DRE · ${mesNome(ym)}</h3><p class="rd-sub">${periodoTxt()} · receita das vendas registradas na plataforma</p></div><button class="rd-btn sm" onclick="redeLancarModal('${f.id}')">${ic('plus')}Lançar custos e despesas</button></div>
        ${linha('Receita bruta', c.fat, 'tot', TA)}
        ${linha('Venda de equipamentos (kits)', c.equip, 'sub', ` <span class="rd-muted">${pct(t.equipamentos_pct, 0)}</span>`)}
        ${linha('Serviços (instalação, projeto)', c.serv, 'sub')}
        ${linha('(−) Impostos · ' + pct(c.fat ? c.imp / c.fat * 100 : aliqEfetiva(f.id, ym)), -c.imp, '', c.faltaImposto ? ' <span class="rd-tag bad">configurar</span>' : TC)}
        ${linha('Receita líquida', c.liq, 'tot')}
        ${linha('(−) Custo dos kits', -c.cKit, '', c.estKit ? TE : TL)}
        ${linha('(−) Instalação e materiais', -c.cInst, '', c.estInst ? TE : TL)}
        ${linha('(−) Comissões de venda', -c.com, '', c.estCom ? TE : TL)}
        ${linha('Resultado bruto', c.bruto, 'tot')}
        ${fr || temTaxas ? linha('(−) Royalties · ' + pct(t.royalties_pct), -c.roy, '', c.royMin ? ' <span class="rd-tag">mínimo</span>' : TC)
          + linha('(−) Fundo de publicidade · ' + pct(t.publicidade_pct), -c.pub, '', TC)
          + (c.cobraProj ? linhaProjetos(c) : '')
          + (c.mens ? linha('(−) Mensalidade da plataforma', -c.mens, '', TC) : '') : ''}
        ${linha('(−) Despesas operacionais', -c.desp, '', despTag)}
        ${linha('Resultado líquido', c.res, 'tot fin', '', `<span style="font-size:12px;margin-left:8px">${c.mg == null ? '' : pct(c.mg)}</span>`)}
      </div>
      <div class="rd-card">
        <h3>${ic('wallet')}Despesas operacionais</h3><p class="rd-sub">${c.semDesp ? 'Nenhuma despesa lançada ainda.' : c.despEstimado ? `Sem lançamento em ${mesAbr(ym)}: repetindo ${mesNome(c.despRef).toLowerCase()} como estimativa.` : `Lançadas para ${mesNome(ym).toLowerCase()}.`}</p>
        ${DESPESAS.map(([k, n]) => `<div class="rd-line"><span>${n}</span><b>${c.despMap[k] != null ? brlC(c.despMap[k]) : '—'}</b></div>`).join('')}
        <div class="rd-line tot"><span>Total</span><span>${brlC(c.desp)}</span></div>
        <button class="rd-btn blue" style="width:100%;justify-content:center;margin-top:10px" onclick="redeLancarModal('${f.id}')">${ic('pencil')}Lançar ${mesNome(ym).toLowerCase()}</button>
        <div class="rd-tip">${ic('info')}Sem lançamento no mês, a plataforma repete o último mês lançado e marca como estimativa.</div>
      </div>
    </div>`;
  }

  function uEquipe(f) {
    const us = D().users.filter((u) => u.franquia_id === f.id);
    const papel = { admin: 'Administrador', gestor: 'Gestor', vendedor: 'Vendedor', tecnico: 'Técnico', engenheiro: 'Engenheiro', coordenador: 'Coordenador' };
    return `<div class="rd-card"><div class="rd-ch"><div><h3>Equipe da unidade</h3><p class="rd-sub">${us.length} usuário(s) ativo(s) na plataforma</p></div>${typeof openAdmin === 'function' ? `<button class="rd-btn" onclick="openAdmin()">${ic('user-cog')}Gerenciar usuários</button>` : ''}</div>
      ${us.length ? `<table class="rd-t cards"><thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th></tr></thead><tbody>
      ${us.map((u) => `<tr><td class="first"><b>${esc(u.nome || '—')}</b></td><td data-l="E-mail" class="rd-muted">${esc(u.email)}</td><td data-l="Perfil">${esc(papel[u.role] || u.role || '—')}</td></tr>`).join('')}
      </tbody></table>` : `<div class="rd-empty"><div class="ic">${ic('users')}</div><b>Sem usuários</b>Ninguém cadastrado nesta unidade.</div>`}</div>`;
  }

  // ------------------------------------------------------------ DRE da rede
  function telaDre() {
    const ym = D().mes, fs = ativas(), rows = fs.map((f) => ({ f, c: calc(f, ym) })), t = rede(ym);
    return `<div class="rd-card">
      <div class="rd-ch"><div><h3>Resultado da rede · ${mesNome(ym)}</h3><p class="rd-sub">${periodoTxt()} · receita − impostos − custos − taxas da franquia − despesas</p></div></div>
      <table class="rd-t cards">
        <thead><tr><th>Unidade</th><th class="r">Receita</th><th class="r">Impostos</th><th class="r">Custos</th><th class="r">Taxas franquia</th><th class="r">Despesas</th><th class="r">Resultado</th><th class="r">Margem</th></tr></thead>
        <tbody>${rows.map(({ f, c }) => `<tr class="click" onclick="redeAbrirUnidade('${f.id}','resultado')">
          <td class="first"><div class="rd-name">${esc(nomeCurto(f.nome))}</div><div class="rd-muted">${f.tipo === 'propria' ? 'Própria' : 'Franquia'} · ${empresasDe(f.id).length} CNPJ(s)</div></td>
          <td class="r" data-l="Receita"><b>${brl(c.fat)}</b></td><td class="r" data-l="Impostos">${brl(c.imp)}</td><td class="r" data-l="Custos">${brl(c.custos)}</td>
          <td class="r" data-l="Taxas franquia">${brl(c.taxas)}</td><td class="r" data-l="Despesas">${brl(c.desp)}</td>
          <td class="r ${c.res < 0 ? 'rd-neg' : 'rd-pos'}" data-l="Resultado"><b>${brl(c.res)}</b></td><td class="r" data-l="Margem">${c.mg == null ? '—' : pct(c.mg)}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td class="first">Total da rede</td><td class="r" data-l="Receita">${brl(t.fat)}</td><td class="r" data-l="Impostos">${brl(t.imp)}</td><td class="r" data-l="Custos">${brl(t.custos)}</td><td class="r" data-l="Taxas">${brl(t.taxas)}</td><td class="r" data-l="Despesas">${brl(t.desp)}</td><td class="r ${t.res < 0 ? 'rd-neg' : 'rd-pos'}" data-l="Resultado">${brl(t.res)}</td><td class="r" data-l="Margem">${pct(t.fat ? t.res / t.fat * 100 : 0)}</td></tr></tfoot>
      </table>
      <div class="rd-tip">${ic('info')}As taxas da franquia saem do resultado das unidades e entram como receita da franqueadora; no consolidado do grupo elas se anulam.</div>
    </div>`;
  }

  // ------------------------------------------------------------ franqueadora
  function telaFranqueadora() {
    const d = D(), ym = d.mes, ant = addMes(ym, -1), t = rede(ym), p = rede(ant);
    const rows = ativas().map((f) => ({ f, c: calc(f, ym) }));
    const porMes = d.meses.map((m) => rede(m));
    const series = [porMes.map((x) => x.roy), porMes.map((x) => x.pub), porMes.map((x) => x.reb), porMes.map((x) => x.proj + x.mens)];
    const cores = ['#008FD4', '#FAA519', '#5CC3F2', '#808284'];
    const tem = series.some((s) => s.some((v) => v > 0));
    return `
    <div class="rd-grid rd-k5 rd-mb">
      <div class="rd-kpi"><div class="l">${ic('crown')}Royalties</div><div class="v">${brl(t.roy)}</div><div class="h">${delta(t.roy, p.roy)}</div></div>
      <div class="rd-kpi"><div class="l">${ic('megaphone')}Fundo de publicidade</div><div class="v">${brl(t.pub)}</div><div class="h">${delta(t.pub, p.pub)}</div></div>
      <div class="rd-kpi"><div class="l">${ic('package')}Rebates dos kits</div><div class="v">${brl(t.reb)}</div><div class="h">${delta(t.reb, p.reb)}</div></div>
      <div class="rd-kpi"><div class="l">${ic('ruler')}Projetos e mensalidades</div><div class="v">${brl(t.proj + t.mens)}</div><div class="h">${t.nproj} projeto(s) da engenharia</div></div>
      <div class="rd-kpi hero"><div class="l">${ic('sigma')}Total</div><div class="v">${brl(t.franq)}</div><div class="h">${delta(t.franq, p.franq)} vs ${mesAbr(ant)}</div></div>
    </div>
    <div class="rd-grid rd-two">
      <div class="rd-card"><h3>Por unidade</h3><p class="rd-sub">O que cada unidade gerou para a franqueadora em ${mesNome(ym).toLowerCase()}</p>
        <table class="rd-t cards"><thead><tr><th>Unidade</th><th class="r">Royalties</th><th class="r">Fundo</th><th class="r">Rebate</th><th class="r">Projetos</th><th class="r">Total</th></tr></thead>
        <tbody>${rows.map(({ f, c }) => { const tx = taxasDe(f.id); return `<tr class="click" onclick="redeAbrirUnidade('${f.id}','taxas')"><td class="first"><div class="rd-name">${esc(nomeCurto(f.nome))}</div><div class="rd-muted">${f.tipo === 'franquia' ? 'royalties ' + pct(tx.royalties_pct) + ' · fundo ' + pct(tx.publicidade_pct) : 'unidade própria'}</div></td>
          <td class="r" data-l="Royalties">${brl(c.roy)}${c.royMin ? ' <span class="rd-tag">mín.</span>' : ''}</td><td class="r" data-l="Fundo">${brl(c.pub)}</td><td class="r" data-l="Rebate">${brl(c.reb)}</td><td class="r" data-l="Projetos">${brl(c.proj + c.mens)}</td><td class="r" data-l="Total"><b>${brl(c.franq)}</b></td></tr>`; }).join('')}</tbody>
        <tfoot><tr><td class="first">Total</td><td class="r" data-l="Royalties">${brl(t.roy)}</td><td class="r" data-l="Fundo">${brl(t.pub)}</td><td class="r" data-l="Rebate">${brl(t.reb)}</td><td class="r" data-l="Projetos">${brl(t.proj + t.mens)}</td><td class="r" data-l="Total">${brl(t.franq)}</td></tr></tfoot></table>
      </div>
      <div class="rd-card"><h3>Comparativo com os meses anteriores</h3><p class="rd-sub">${d.dia ? `Cada mês do dia 1 ao ${d.dia}` : 'Meses inteiros'}</p>
        ${tem ? barrasEmpilhadas(series, cores, d.meses, 5, 380, 230) + `<div class="rd-legend"><span><i style="background:${cores[0]}"></i>Royalties</span><span><i style="background:${cores[1]}"></i>Fundo</span><span><i style="background:${cores[2]}"></i>Rebates</span><span><i style="background:${cores[3]}"></i>Projetos</span></div>` : `<div class="rd-empty"><div class="ic">${ic('bar-chart-3')}</div><b>Sem receita no período</b>Aparece conforme as unidades registram vendas.</div>`}
      </div>
    </div>`;
  }

  // ------------------------------------------------------------ padrões
  function telaPadroes() {
    const p = D().padroes || {};
    const campo = (k, l, money) => `<div class="rd-line"><div class="nm">${l}</div><div class="rd-in ${money ? 'money' : ''}">${money ? '<span>R$</span>' : ''}<input id="rdp-${k}" inputmode="decimal" value="${pctIn(p[k])}">${money ? '' : '<span>%</span>'}</div></div>`;
    return `<div class="rd-grid rd-two">
      <div class="rd-card"><h3>${ic('sliders-horizontal')}Taxas padrão para novas unidades</h3><p class="rd-sub">Toda unidade nova começa com estes valores. Alterar aqui não muda as unidades que já existem.</p>
        ${campo('royalties_pct', 'Royalties')}
        <div class="rd-line"><div class="nm">Base dos royalties</div><select id="rdp-royalties_base" class="rd-inline-sel">${[['total', 'Faturamento total'], ['servicos', 'Só serviços (sem kit)'], ['bruto', 'Resultado bruto']].map(([v, l]) => `<option value="${v}" ${p.royalties_base === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        ${campo('royalties_minimo', 'Mínimo mensal de royalties', true)}
        ${campo('publicidade_pct', 'Fundo de publicidade')}
        ${campo('rebate_pct', 'Rebate sobre kits')}
        ${campo('mensalidade', 'Mensalidade da plataforma', true)}
        <p class="rd-sub" style="margin:14px 0 4px"><b>Estimativas do DRE</b></p>
        ${campo('equipamentos_pct', 'Parte do faturamento que é kit')}
        ${campo('custo_equip_pct', 'Custo do kit sobre a venda')}
        ${campo('custo_serv_pct', 'Custo de instalação sobre o serviço')}
        ${campo('comissao_pct', 'Comissão de venda')}
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">
          <button class="rd-btn blue" onclick="redeSalvarPadroes()">${ic('check')}Salvar padrões</button>
          <button class="rd-btn" onclick="redeAplicarPadroes()">${ic('copy')}Aplicar a todas as franquias</button>
        </div>
      </div>
      <div>
      <div class="rd-card rd-mb"><h3>${ic('ruler')}Projetos de engenharia por kWp</h3><p class="rd-sub">Tabela da engenharia (ART inclusa). Vale para todas as unidades que cobram projetos e não têm tabela própria. Cada campo salva ao sair.</p>
        ${faixasTabela(faixasPadrao(), 'pad', true)}
      </div>
      <div class="rd-card"><h3>${ic('calendar-clock')}Como a plataforma fecha o mês</h3><p class="rd-sub">Regras usadas nos números da Rede</p>
        ${[['Faturamento', 'Vendas registradas na plataforma'], ['Comparação com meses anteriores', 'Mesmo intervalo de dias (1 até hoje)'], ['Impostos', 'Alíquotas vigentes de cada CNPJ, pela participação no faturamento'], ['Custos sem lançamento', 'Estimados pelos percentuais da unidade'], ['Despesas sem lançamento', 'Repete o último mês lançado'], ['Projetos de engenharia', 'Faixa de kWp de cada projeto enviado no mês'], ['Unidade própria', 'Não paga royalties nem fundo'], ['Quem vê o ambiente Rede', 'Somente administradores']]
          .map(([a, b]) => `<div class="rd-line"><span>${a}</span><b style="text-align:right">${b}</b></div>`).join('')}
      </div>
      </div>
    </div>`;
  }

  // ------------------------------------------------------------ modal
  function modal(html) {
    fecharModal();
    const s = document.createElement('div');
    s.className = 'rd-scrim';
    s.id = 'rd-scrim';
    s.innerHTML = `<div class="rd-modal rd" role="dialog" aria-modal="true">${html}</div>`;
    s.addEventListener('mousedown', (e) => { if (e.target === s) fecharModal(); });
    document.body.appendChild(s);
    icons();
    const first = s.querySelector('input:not([type=hidden]):not([type=checkbox]), select');
    if (first) setTimeout(() => first.focus(), 30);
  }
  function fecharModal() { const s = document.getElementById('rd-scrim'); if (s) s.remove(); }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.getElementById('rd-scrim')) { e.stopPropagation(); fecharModal(); } }, true);
  const val = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
  const chk = (id) => { const el = document.getElementById(id); return !!(el && el.checked); };
  function erroModal(msg) { const el = document.getElementById('rd-err'); if (el) el.textContent = msg; }
  async function ocupado(btnId, fn) {
    const b = document.getElementById(btnId); const h = b && b.innerHTML;
    if (b) { b.disabled = true; b.innerHTML = ic('loader-2') + 'Salvando...'; icons(); }
    try { return await fn(); } finally { if (b && document.body.contains(b)) { b.disabled = false; b.innerHTML = h; icons(); } }
  }

  // ------------------------------------------------------------ ações: navegação
  function redeSetMes(ym) { R.mes = ym; R.data = null; renderRedeRoute(R.container, R.tab); }
  function redeRecarregar() { R.data = null; renderRedeRoute(R.container, R.tab); }
  let buscaT;
  function redeBuscar(q) { R.busca = q; clearTimeout(buscaT); buscaT = setTimeout(() => { pintar(); const i = R.container && R.container.querySelector('.rd-bar input'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 200); }
  function redeAbrirUnidade(id, aba) {
    R.unit = id; R.utab = aba || 'resumo';
    if (state.redeActiveTab !== 'unidades') { setTab('unidades'); return; }
    pintar(); window.scrollTo(0, 0);
  }
  function redeVoltarUnidades() { R.unit = null; pintar(); window.scrollTo(0, 0); }
  function redeUnidadeAba(aba) { R.utab = aba; pintar(); }

  // ------------------------------------------------------------ ações: unidade
  function unidadeForm(f) {
    const cu = f ? cidadeUf(f) : { cidade: '', uf: '' };
    return `<div class="rd-fgrid">
      <div class="rd-fld full"><label>Nome da unidade *</label><input id="rdu-nome" value="${esc(f ? f.nome : 'Ágil Solar ')}"></div>
      <div class="rd-fld"><label>Cidade *</label><input id="rdu-cidade" value="${esc(cu.cidade)}"></div>
      <div class="rd-fld"><label>UF *</label><input id="rdu-uf" maxlength="2" style="text-transform:uppercase" value="${esc(cu.uf)}"></div>
      <div class="rd-fld"><label>Tipo</label><select id="rdu-tipo"><option value="franquia" ${!f || f.tipo === 'franquia' ? 'selected' : ''}>Franquia</option><option value="propria" ${f && f.tipo === 'propria' ? 'selected' : ''}>Unidade própria</option></select></div>
      <div class="rd-fld"><label>Início da operação</label><input id="rdu-inicio" type="date" value="${esc(f && f.inicio_operacao ? f.inicio_operacao : hojeSP())}"></div>
      ${f ? `<label class="rd-check full"><input type="checkbox" id="rdu-ativo" ${f.ativo !== false ? 'checked' : ''}> Unidade ativa</label>` : ''}
    </div>`;
  }
  function lerUnidade() {
    const nome = val('rdu-nome'), cidade = val('rdu-cidade'), uf = val('rdu-uf').toUpperCase();
    if (!nome || !cidade || uf.length !== 2) { erroModal('Preencha nome, cidade e UF (2 letras).'); return null; }
    return { nome, cidade: `${cidade} - ${uf}`, uf, tipo: val('rdu-tipo') || 'franquia', inicio_operacao: val('rdu-inicio') || null };
  }
  function redeNovaUnidade() {
    modal(`<h3>Nova unidade</h3><p class="rd-muted" style="margin:0">Os preços dos kits são copiados da Matriz e as taxas vêm dos padrões da rede.</p>
      ${unidadeForm(null)}<div id="rd-err" class="rd-err"></div>
      <div class="rd-mfoot"><button class="rd-btn" onclick="redeFecharModal()">Cancelar</button><button class="rd-btn pri" id="rd-save" onclick="redeSalvarUnidade()">${ic('check')}Criar unidade</button></div>`);
  }
  function redeEditarUnidade(id) {
    const f = franquia(id);
    modal(`<h3>Editar unidade</h3>${unidadeForm(f)}<div id="rd-err" class="rd-err"></div>
      <div class="rd-mfoot"><button class="rd-btn" onclick="redeFecharModal()">Cancelar</button><button class="rd-btn pri" id="rd-save" onclick="redeSalvarUnidade('${id}')">${ic('check')}Salvar</button></div>`);
  }
  async function redeSalvarUnidade(id) {
    const payload = lerUnidade(); if (!payload) return;
    if (id) payload.ativo = chk('rdu-ativo');
    await ocupado('rd-save', async () => {
      const q = id ? supabaseClient.from('franquias').update(payload).eq('id', id).select().single()
        : supabaseClient.from('franquias').insert([{ ...payload, ativo: true }]).select().single();
      const { data, error } = await q;
      if (error) { erroModal('Não foi possível salvar: ' + error.message); return; }
      if (!id && data && typeof FRANQUIA_MATRIZ_ID !== 'undefined') {
        const { data: precos } = await supabaseClient.from('precos_franquia').select('produto_id, price, list_price').eq('franquia_id', FRANQUIA_MATRIZ_ID);
        if (precos && precos.length) {
          const { error: ep } = await supabaseClient.from('precos_franquia').upsert(precos.map((p) => ({ ...p, franquia_id: data.id })), { onConflict: 'produto_id,franquia_id' });
          if (ep) console.warn('[rede] preços não copiados', ep);
        }
      }
      fecharModal();
      toast(id ? 'Unidade atualizada.' : 'Unidade criada.');
      if (typeof fetchFranquiasCatalog === 'function') fetchFranquiasCatalog();
      if (!id && data) { R.unit = data.id; R.utab = 'empresas'; }
      redeRecarregar();
    });
  }

  // ------------------------------------------------------------ ações: CNPJ
  function redeEmpresaModal(fid, eid) {
    const f = franquia(fid), e = eid ? D().empresas.find((x) => x.id === eid) : null;
    const cu = cidadeUf(f);
    const primeira = !empresasDe(fid).length;
    const v = (k, d = '') => esc(e ? (e[k] ?? d) : d);
    const rep = (e && e.representante) || {};
    const rv = (k, d = '') => esc(rep[k] ?? d);
    modal(`<h3>${e ? 'Editar CNPJ' : 'Adicionar CNPJ'}</h3><p class="rd-muted" style="margin:0">${esc(f.nome)}</p>
      <div class="rd-fgrid">
        <div class="rd-fld full"><label>CNPJ *</label><div style="display:flex;gap:8px"><input id="rde-cnpj" inputmode="numeric" placeholder="00.000.000/0001-00" value="${v('cnpj')}"><button class="rd-btn blue" id="rde-busca" onclick="redeBuscarCnpj()">${ic('search')}Buscar</button></div><span class="hint">Busca razão social, endereço e regime na Receita Federal (BrasilAPI)</span></div>
        <div class="rd-fld full"><label>Razão social *</label><input id="rde-razao" value="${v('razao_social')}"></div>
        <div class="rd-fld"><label>Nome fantasia</label><input id="rde-fantasia" value="${v('nome_fantasia')}"></div>
        <div class="rd-fld"><label>Regime tributário</label><select id="rde-regime"><option value="">Não informado</option>${Object.entries(REGIMES).map(([k, l]) => `<option value="${k}" ${e && e.regime === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="rd-fld full"><label>Nome no contrato</label><input id="rde-contrato" value="${v('nome_contrato')}" placeholder="Em branco = razão social"><span class="hint">Como a contratada aparece no contrato e na procuração</span></div>
        <div class="rd-fld full"><label>Endereço</label><input id="rde-endereco" value="${v('endereco')}" placeholder="Rua, número, bairro - Cidade/UF"></div>
        <div class="rd-fld"><label>Município</label><input id="rde-municipio" value="${v('municipio', cu.cidade)}"></div>
        <div class="rd-fld"><label>UF</label><input id="rde-uf" maxlength="2" style="text-transform:uppercase" value="${v('uf', cu.uf)}"></div>
        <div class="rd-fld"><label>Inscrição estadual</label><input id="rde-ie" value="${v('inscricao_estadual')}" placeholder="ou Isento"></div>
        <div class="rd-fld"><label>Inscrição municipal</label><input id="rde-im" value="${v('inscricao_municipal')}"></div>
        <div class="rd-fld"><label>Foro do contrato</label><input id="rde-foro" value="${v('foro')}" placeholder="Cidade/UF"></div>
        <div class="rd-fld"><label>Participação no faturamento</label><div class="rd-in" style="width:120px"><input id="rde-part" inputmode="decimal" value="${e ? pctIn(e.participacao_pct) : (primeira ? '100' : '50')}"><span>%</span></div></div>
        <div class="rd-fld full"><label>O que esse CNPJ fatura</label><div class="rd-chips">
          <label class="rd-chip ${!e || e.fatura_servicos ? 'on' : ''}"><input type="checkbox" id="rde-fs" hidden ${!e || e.fatura_servicos ? 'checked' : ''} onchange="this.parentNode.classList.toggle('on',this.checked)">Serviços</label>
          <label class="rd-chip ${!e || e.fatura_equipamentos ? 'on' : ''}"><input type="checkbox" id="rde-fe" hidden ${!e || e.fatura_equipamentos ? 'checked' : ''} onchange="this.parentNode.classList.toggle('on',this.checked)">Equipamentos (kits)</label>
          <label class="rd-chip ${e && e.fatura_om ? 'on' : ''}"><input type="checkbox" id="rde-fo" hidden ${e && e.fatura_om ? 'checked' : ''} onchange="this.parentNode.classList.toggle('on',this.checked)">O&amp;M</label>
        </div></div>
        <label class="rd-check full"><input type="checkbox" id="rde-principal" ${(e ? e.principal : primeira) ? 'checked' : ''}> CNPJ principal da unidade (vem selecionado no contrato)</label>
        <div class="rd-fsec full"><b>Representante legal</b><span>Quem assina o contrato por esta empresa ("neste ato representada por seu proprietário...")</span></div>
        <div class="rd-fld full"><label>Nome completo</label><input id="rder-nome" value="${rv('nome')}" style="text-transform:uppercase"></div>
        <div class="rd-fld"><label>Cargo</label><select id="rder-cargo">${REP_CARGOS.map(([k, l]) => `<option value="${k}" ${(rep.cargo || 'proprietario') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="rd-fld"><label>Gênero</label><select id="rder-genero"><option value="M" ${rep.genero !== 'F' ? 'selected' : ''}>Masculino</option><option value="F" ${rep.genero === 'F' ? 'selected' : ''}>Feminino</option></select></div>
        <div class="rd-fld"><label>CPF</label><input id="rder-cpf" inputmode="numeric" placeholder="000.000.000-00" value="${rv('cpf')}"></div>
        <div class="rd-fld"><label>RG</label><div style="display:flex;gap:8px"><input id="rder-rg" value="${rv('rg')}" placeholder="Número"><input id="rder-rg-orgao" value="${rv('rg_orgao')}" placeholder="SSP/SP" style="width:96px;text-transform:uppercase"></div></div>
        <div class="rd-fld"><label>Nacionalidade</label><input id="rder-nac" value="${rv('nacionalidade', 'brasileiro')}"></div>
        <div class="rd-fld"><label>Profissão</label><input id="rder-prof" value="${rv('profissao', 'empresário')}"></div>
        <div class="rd-fld"><label>Estado civil</label><select id="rder-ec"><option value="">Não informar</option>${REP_ESTADO_CIVIL.map(([k, l]) => `<option value="${k}" ${rep.estado_civil === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <label class="rd-check full"><input type="checkbox" id="rder-mesmo" ${rep.mesmo_endereco !== false ? 'checked' : ''} onchange="document.getElementById('rder-end-box').style.display=this.checked?'none':''"> Mora no mesmo endereço da empresa</label>
        <div class="rd-fld full" id="rder-end-box" style="${rep.mesmo_endereco !== false ? 'display:none' : ''}"><label>Endereço do representante</label><input id="rder-end" value="${rv('endereco')}" placeholder="Rua, número, bairro, cidade/UF"></div>
      </div>
      <div id="rd-err" class="rd-err"></div>
      <div class="rd-mfoot"><button class="rd-btn" onclick="redeFecharModal()">Cancelar</button><button class="rd-btn pri" id="rd-save" onclick="redeSalvarEmpresa('${fid}'${eid ? `,'${eid}'` : ''})">${ic('check')}Salvar CNPJ</button></div>`);
    if (typeof ligarMascara === 'function') {
      ligarMascara(document.getElementById('rde-cnpj'), 'cnpj');
      ligarMascara(document.getElementById('rder-cpf'), 'cpf');
    }
  }

  async function redeBuscarCnpj() {
    const d = digits(val('rde-cnpj'));
    if (!cnpjValido(d)) { erroModal('CNPJ inválido. Confira os números.'); return; }
    erroModal('');
    await ocupado('rde-busca', async () => {
      try {
        const r = await fetch('https://brasilapi.com.br/api/cnpj/v1/' + d);
        if (!r.ok) { erroModal(r.status === 404 ? 'CNPJ não encontrado na Receita.' : 'A consulta falhou. Preencha à mão.'); return; }
        const j = await r.json();
        const set = (id, v) => { const el = document.getElementById(id); if (el && v) el.value = v; };
        set('rde-razao', j.razao_social);
        set('rde-fantasia', j.nome_fantasia);
        const end = [[j.descricao_tipo_de_logradouro, j.logradouro].filter(Boolean).join(' '), j.numero, j.complemento, j.bairro].filter(Boolean).join(', ');
        set('rde-endereco', end ? `${end} - ${j.municipio}/${j.uf}` : '');
        set('rde-municipio', j.municipio ? j.municipio.charAt(0) + j.municipio.slice(1).toLowerCase().replace(/(^|\s)(\S)/g, (m) => m.toUpperCase()) : '');
        set('rde-uf', j.uf);
        const reg = j.opcao_pelo_mei ? 'mei' : j.opcao_pelo_simples ? 'simples' : '';
        if (reg) document.getElementById('rde-regime').value = reg;
        toast('Dados encontrados na Receita.' + (reg ? '' : ' Confira o regime tributário.'));
      } catch (err) {
        console.warn('[rede] consulta CNPJ', err);
        erroModal('Não foi possível consultar agora. Preencha à mão.');
      }
    });
  }

  async function redeSalvarEmpresa(fid, eid) {
    const cnpj = val('rde-cnpj');
    if (!cnpjValido(cnpj)) { erroModal('CNPJ inválido. Confira os números.'); return; }
    const razao = val('rde-razao');
    if (!razao) { erroModal('Preencha a razão social.'); return; }
    const part = parseNum(val('rde-part'));
    if (part < 0 || part > 100) { erroModal('Participação deve ficar entre 0 e 100%.'); return; }
    const principal = chk('rde-principal');
    const repCpf = digits(val('rder-cpf'));
    if (repCpf && typeof documentoValido === 'function' && !documentoValido(repCpf)) { erroModal('CPF do representante inválido. Confira os números.'); return; }
    const mesmo = chk('rder-mesmo');
    const representante = val('rder-nome') ? {
      nome: val('rder-nome').toUpperCase(), cargo: val('rder-cargo'), genero: val('rder-genero'),
      cpf: repCpf ? repCpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : '',
      rg: val('rder-rg'), rg_orgao: val('rder-rg-orgao').toUpperCase(),
      nacionalidade: val('rder-nac'), profissao: val('rder-prof'), estado_civil: val('rder-ec'),
      mesmo_endereco: mesmo, endereco: mesmo ? '' : val('rder-end'),
    } : null;
    const payload = {
      franquia_id: fid, cnpj: fmtCnpj(cnpj), razao_social: razao.toUpperCase(),
      nome_fantasia: val('rde-fantasia') || null, nome_contrato: val('rde-contrato') || null,
      regime: val('rde-regime') || null, endereco: val('rde-endereco') || null,
      municipio: val('rde-municipio') || null, uf: val('rde-uf').toUpperCase() || null, foro: val('rde-foro') || null,
      inscricao_estadual: val('rde-ie') || null, inscricao_municipal: val('rde-im') || null,
      fatura_servicos: chk('rde-fs'), fatura_equipamentos: chk('rde-fe'), fatura_om: chk('rde-fo'),
      participacao_pct: part, principal, representante, updated_at: new Date().toISOString(),
    };
    await ocupado('rd-save', async () => {
      if (principal) {
        const { error: e0 } = await supabaseClient.from('rede_empresas').update({ principal: false }).eq('franquia_id', fid).eq('principal', true).neq('id', eid || '00000000-0000-0000-0000-000000000000');
        if (e0) { erroModal('Não foi possível salvar: ' + e0.message); return; }
      }
      const { error } = eid ? await supabaseClient.from('rede_empresas').update(payload).eq('id', eid)
        : await supabaseClient.from('rede_empresas').insert([payload]);
      if (error) { erroModal(error.code === '23505' ? 'Esse CNPJ já está cadastrado em uma unidade.' : 'Não foi possível salvar: ' + error.message); return; }
      // sem nenhum principal (ex.: desmarcou o único)? o mais antigo ativo vira principal
      await garantirPrincipal(fid);
      fecharModal();
      toast(eid ? 'CNPJ atualizado.' : 'CNPJ adicionado.');
      if (typeof docLimparCache === 'function') docLimparCache();
      redeRecarregar();
    });
  }
  async function garantirPrincipal(fid) {
    const { data } = await supabaseClient.from('rede_empresas').select('id, principal').eq('franquia_id', fid).eq('ativo', true).order('created_at');
    if (data && data.length && !data.some((x) => x.principal)) await supabaseClient.from('rede_empresas').update({ principal: true }).eq('id', data[0].id);
  }
  async function redeEmpresaPrincipal(eid) {
    const e = D().empresas.find((x) => x.id === eid); if (!e) return;
    const { error: e0 } = await supabaseClient.from('rede_empresas').update({ principal: false }).eq('franquia_id', e.franquia_id).eq('principal', true);
    const { error } = e0 ? { error: e0 } : await supabaseClient.from('rede_empresas').update({ principal: true }).eq('id', eid);
    if (error) { toast('Erro: ' + error.message); return; }
    toast('CNPJ principal alterado.');
    if (typeof docLimparCache === 'function') docLimparCache();
    redeRecarregar();
  }
  function redeEmpresaAtivo(eid, ativo) {
    const e = D().empresas.find((x) => x.id === eid); if (!e) return;
    const go = async () => {
      const { error } = await supabaseClient.from('rede_empresas').update({ ativo, principal: ativo ? e.principal : false, updated_at: new Date().toISOString() }).eq('id', eid);
      if (error) { toast(error.code === '23505' ? 'Já existe outro cadastro ativo com esse CNPJ ou outro principal.' : 'Erro: ' + error.message); return; }
      await garantirPrincipal(e.franquia_id);
      toast(ativo ? 'CNPJ reativado.' : 'CNPJ desativado.');
      if (typeof docLimparCache === 'function') docLimparCache();
      redeRecarregar();
    };
    if (!ativo && typeof showConfirmModal === 'function') showConfirmModal(`Desativar o CNPJ ${e.cnpj}? Ele deixa de entrar nos impostos e no contrato. O histórico fica guardado.`, go, 'DESATIVAR');
    else go();
  }

  // ------------------------------------------------------------ ações: impostos
  // 1ª configuração de um CNPJ vale desde sempre (o histórico não fica sem imposto);
  // depois disso, o que se adiciona vale a partir do mês que está aberto.
  const INICIO = '2000-01-01';
  const vigenciaNova = (eid) => (D().impostos.some((i) => i.empresa_id === eid) ? D().mes + '-01' : INICIO);
  const desdeTxt = (d) => (d <= INICIO ? 'desde o início' : 'desde ' + d.slice(5, 7) + '/' + d.slice(0, 4));
  const PRESETS = ['Simples Nacional (alíquota efetiva)', 'ISS', 'ICMS', 'PIS', 'COFINS', 'IRPJ', 'CSLL', 'IRPJ (presunção 8%)', 'CSLL (presunção 12%)', 'DAS MEI (valor fixo em %)'];
  function redeImpostoModal(eid) {
    const e = D().empresas.find((x) => x.id === eid);
    modal(`<h3>Adicionar imposto</h3><p class="rd-muted" style="margin:0">${esc(e.razao_social)} · ${vigenciaNova(eid) === INICIO ? 'primeira configuração: vale para todos os meses' : 'vale a partir de ' + mesNome(D().mes).toLowerCase()}</p>
      <div class="rd-fgrid">
        <div class="rd-fld full"><label>Imposto *</label><input id="rdi-nome" list="rdi-lista" placeholder="Ex.: ISS"><datalist id="rdi-lista">${PRESETS.map((p) => `<option value="${esc(p)}">`).join('')}</datalist></div>
        <div class="rd-fld"><label>Incide sobre</label><select id="rdi-base">${Object.entries(BASES).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></div>
        <div class="rd-fld"><label>Alíquota *</label><div class="rd-in" style="width:120px"><input id="rdi-aliq" inputmode="decimal" placeholder="0"><span>%</span></div></div>
      </div>
      <div id="rd-err" class="rd-err"></div>
      <div class="rd-mfoot"><button class="rd-btn" onclick="redeFecharModal()">Cancelar</button><button class="rd-btn pri" id="rd-save" onclick="redeSalvarImposto('${eid}')">${ic('check')}Adicionar</button></div>`);
  }
  async function redeSalvarImposto(eid) {
    const nome = val('rdi-nome'), aliq = parseNum(val('rdi-aliq'));
    if (!nome) { erroModal('Informe o imposto.'); return; }
    if (aliq < 0 || aliq > 100) { erroModal('Alíquota entre 0 e 100%.'); return; }
    await ocupado('rd-save', async () => {
      const { error } = await supabaseClient.from('rede_impostos').insert([{ empresa_id: eid, nome, base: val('rdi-base') || 'faturamento', aliquota: aliq, vigente_desde: vigenciaNova(eid) }]);
      if (error) { erroModal('Não foi possível salvar: ' + error.message); return; }
      fecharModal(); toast('Imposto adicionado.'); redeRecarregar();
    });
  }
  const SUGESTOES = {
    simples: [['Simples Nacional (alíquota efetiva)', 'faturamento', 0]],
    mei: [['DAS MEI (valor fixo em %)', 'faturamento', 0]],
    presumido: [['PIS', 'faturamento', 0.65], ['COFINS', 'faturamento', 3], ['IRPJ (presunção 8%)', 'faturamento', 1.2], ['CSLL (presunção 12%)', 'faturamento', 1.08], ['ISS', 'servicos', 0], ['ICMS', 'equipamentos', 0]],
    real: [['PIS', 'faturamento', 1.65], ['COFINS', 'faturamento', 7.6], ['ISS', 'servicos', 0], ['ICMS', 'equipamentos', 0]],
  };
  async function redeSugerirImpostos(eid) {
    const e = D().empresas.find((x) => x.id === eid); if (!e || !SUGESTOES[e.regime]) return;
    const desde = vigenciaNova(eid);
    const rows = SUGESTOES[e.regime].map(([nome, base, aliquota]) => ({ empresa_id: eid, nome, base, aliquota, vigente_desde: desde }));
    const { error } = await supabaseClient.from('rede_impostos').insert(rows);
    if (error) { toast('Erro: ' + error.message); return; }
    toast('Impostos sugeridos. Confira as alíquotas (as que ficaram 0% dependem do município/anexo).');
    redeRecarregar();
  }
  // Mudar alíquota: no mesmo mês de início, corrige; em mês posterior, fecha a
  // vigência antiga no mês anterior e abre uma nova (histórico preservado).
  async function redeSetAliquota(id, v) {
    const i = D().impostos.find((x) => x.id === id); if (!i) return;
    const aliq = parseNum(v);
    if (aliq < 0 || aliq > 100) { toast('Alíquota entre 0 e 100%.'); pintar(); return; }
    if (aliq === num(i.aliquota)) return;
    const ini = D().mes + '-01';
    const { empresa_id, nome, base, vigente_ate: fimAntigo } = i;
    let error;
    // 0% = ainda não configurado: preencher corrige no lugar, sem abrir vigência nova
    if (i.vigente_desde >= ini || num(i.aliquota) === 0) ({ error } = await supabaseClient.from('rede_impostos').update({ aliquota: aliq }).eq('id', id));
    else {
      const ate = new Date(ini + 'T12:00:00'); ate.setDate(0);
      ({ error } = await supabaseClient.from('rede_impostos').update({ vigente_ate: ate.toLocaleDateString('en-CA') }).eq('id', id));
      if (!error) ({ error } = await supabaseClient.from('rede_impostos').insert([{ empresa_id, nome, base, aliquota: aliq, vigente_desde: ini, vigente_ate: fimAntigo || null }]));
    }
    if (error) { toast('Erro: ' + error.message); return; }
    toast('Alíquota atualizada a partir de ' + mesNome(D().mes).toLowerCase() + '.');
    redeRecarregar();
  }
  function redeRemoverImposto(id) {
    const i = D().impostos.find((x) => x.id === id); if (!i) return;
    const ini = D().mes + '-01';
    const go = async () => {
      let error;
      if (i.vigente_desde >= ini) ({ error } = await supabaseClient.from('rede_impostos').delete().eq('id', id));
      else { const ate = new Date(ini + 'T12:00:00'); ate.setDate(0); ({ error } = await supabaseClient.from('rede_impostos').update({ vigente_ate: ate.toLocaleDateString('en-CA') }).eq('id', id)); }
      if (error) { toast('Erro: ' + error.message); return; }
      toast('Imposto removido a partir de ' + mesNome(D().mes).toLowerCase() + '.');
      redeRecarregar();
    };
    if (typeof showConfirmModal === 'function') showConfirmModal(`Remover ${i.nome} a partir de ${mesNome(D().mes).toLowerCase()}? Os meses anteriores continuam com ele.`, go, 'REMOVER');
    else go();
  }

  // ------------------------------------------------------------ ações: taxas / padrões
  async function redeSetTaxaCartao(fid, parcelas, input) {
    if (!state.isAdmin || input.disabled || !D() || !franquia(fid)) return;
    const dados = D();
    const anterior = propostaTaxasCartao(dados.taxas[fid]?.cartao_taxas)[parcelas];
    const raw = input.value.trim();
    const valor = Number(raw.replace(',', '.'));
    if (!/^\d+(?:[.,]\d+)?$/.test(raw) || !Number.isFinite(valor) || valor < 0 || valor >= 100) {
      input.value = pctIn(anterior);
      toast('Informe uma taxa de 0 até menos de 100%.');
      return;
    }
    input.disabled = true;
    try {
      const { data, error } = await supabaseClient.rpc('rede_set_taxa_cartao', {
        p_franquia_id: fid, p_parcelas: parcelas, p_taxa: valor,
      });
      if (error) throw error;
      const atual = dados.taxas[fid] || dados.padroes || {};
      dados.taxas[fid] = { ...atual, cartao_taxas: { ...atual.cartao_taxas, [parcelas]: data[parcelas] } };
      input.value = pctIn(valor);
      toast('Taxa do cartão salva.');
    } catch (error) {
      input.value = pctIn(anterior);
      toast('Erro ao salvar a taxa: ' + error.message);
    } finally { input.disabled = false; }
  }

  async function redeSetTaxa(fid, campo, v) {
    if (!TAXA_CAMPOS.includes(campo)) return;
    const valor = campo === 'royalties_base' ? v : parseNum(v);
    if (campo !== 'royalties_base' && (valor < 0 || (/_pct$/.test(campo) && valor > 100))) { toast('Valor inválido.'); pintar(); return; }
    if (await salvarTaxas(fid, { [campo]: valor })) toast('Salvo · resultado recalculado.');
    pintar();
  }
  // upsert da linha de rede_taxas; sem linha ainda, parte do padrão da rede
  async function salvarTaxas(fid, patch) {
    const atual = { ...taxasDe(fid) };
    const row = { franquia_id: fid };
    TAXA_CAMPOS.forEach((k) => { row[k] = atual[k]; });
    if (!D().taxas[fid]) row.projeto_cobrar = cobraProjetos(franquia(fid));
    Object.assign(row, patch, { updated_at: new Date().toISOString() });
    const { error } = await supabaseClient.from('rede_taxas').upsert(row, { onConflict: 'franquia_id' });
    if (error) { toast('Erro: ' + error.message); return false; }
    D().taxas[fid] = { ...atual, ...row };
    return true;
  }

  // ------------------------------------------------------------ ações: projetos de engenharia
  function redeToggleProjetos() { R.projAberto = !R.projAberto; pintar(); }
  async function redeSetProjetoCobrar(fid, on) {
    if (await salvarTaxas(fid, { projeto_cobrar: !!on })) toast(on ? 'Projetos passam a entrar no DRE.' : 'Projetos fora do DRE desta unidade.');
    pintar();
  }
  async function redeProjetoTabela(fid, propria) {
    if (!!faixasProprias(fid) === !!propria) return;
    const faixas = propria ? faixasPadrao().map((x) => ({ ate: num(x.ate), valor: num(x.valor) })) : null;
    if (await salvarTaxas(fid, { projeto_faixas: faixas })) toast(propria ? 'Tabela própria criada a partir do padrão.' : 'Unidade voltou a usar o padrão da rede.');
    pintar();
  }
  async function salvarFaixas(alvo, faixas) {
    for (let i = 0; i < faixas.length; i++) {
      if (!(faixas[i].ate > 0) || faixas[i].valor < 0) { toast('Informe kWp maior que zero e valor positivo.'); return false; }
      if (i && faixas[i].ate <= faixas[i - 1].ate) { toast('Os limites de kWp precisam ser crescentes.'); return false; }
    }
    if (alvo !== 'pad') return salvarTaxas(alvo, { projeto_faixas: faixas });
    const { error } = await supabaseClient.from('rede_padroes').update({ projeto_faixas: faixas, updated_at: new Date().toISOString() }).eq('id', 1);
    if (error) { toast('Erro: ' + error.message); return false; }
    D().padroes = { ...D().padroes, projeto_faixas: faixas };
    return true;
  }
  const faixasAlvo = (alvo) => (alvo === 'pad' ? faixasPadrao() : faixasProprias(alvo) || []).map((x) => ({ ate: num(x.ate), valor: num(x.valor) }));
  async function redeSetFaixa(alvo, i, campo, v) {
    const fx = faixasAlvo(alvo);
    if (!fx[i] || (campo !== 'ate' && campo !== 'valor')) return;
    fx[i][campo] = parseNum(v);
    if (await salvarFaixas(alvo, fx)) toast('Faixa salva · resultado recalculado.');
    pintar();
  }
  async function redeAddFaixa(alvo) {
    const fx = faixasAlvo(alvo), ult = fx[fx.length - 1] || { ate: 0, valor: 0 };
    fx.push({ ate: ult.ate + 25, valor: ult.valor });
    if (await salvarFaixas(alvo, fx)) toast('Faixa adicionada. Ajuste o limite e o valor.');
    pintar();
  }
  async function redeDelFaixa(alvo, i) {
    const fx = faixasAlvo(alvo);
    if (fx.length < 2) return;
    fx.splice(i, 1);
    if (await salvarFaixas(alvo, fx)) toast('Faixa removida.');
    pintar();
  }
  // ajuste de um projeto: valor nulo = volta para a faixa; sem valor e sem isenção, a linha é apagada
  async function salvarAjusteProjeto(pid, ajuste) {
    const lst = Object.values(D().projetos).flat(), p = lst.find((x) => x.id === pid);
    if (!p) return;
    const novo = { valor: p.valor ?? null, isento: !!p.isento, ...ajuste };
    if (novo.valor === (p.valor ?? null) && novo.isento === !!p.isento) { pintar(); return; }
    const q = supabaseClient.from('rede_projeto_taxas');
    const { error } = novo.valor == null && !novo.isento
      ? await q.delete().eq('projeto_id', pid)
      : await q.upsert({ projeto_id: pid, valor: novo.valor, isento: novo.isento, updated_by: state.currentUser?.email || null, updated_at: new Date().toISOString() }, { onConflict: 'projeto_id' });
    if (error) { toast('Erro: ' + error.message); pintar(); return; }
    Object.assign(p, novo);
    toast(novo.isento ? 'Projeto isento.' : novo.valor == null ? 'Projeto volta a seguir a faixa.' : 'Valor do projeto salvo.');
    pintar();
  }
  function redeProjetoValor(pid, v) {
    const raw = String(v ?? '').trim();
    const p = Object.values(D().projetos).flat().find((x) => x.id === pid);
    if (!p) return;
    let valor = raw === '' ? null : parseNum(raw);
    if (valor != null && valor < 0) { toast('Valor inválido.'); pintar(); return; }
    // digitar o mesmo valor da faixa = sem ajuste
    const f = franquia(p.franquia_id), fx = num(p.kwp) > 0 ? faixaDoKwp(faixasDe(f.id), num(p.kwp)) : null;
    if (valor != null && fx && valor === fx.valor) valor = null;
    salvarAjusteProjeto(pid, { valor });
  }
  function redeProjetoIsento(pid, isento) { salvarAjusteProjeto(pid, { isento: !!isento }); }
  function lerPadroes() {
    const p = {};
    for (const k of TAXA_CAMPOS) {
      if (k === 'royalties_base') { p[k] = val('rdp-royalties_base') || 'total'; continue; }
      const v = parseNum(val('rdp-' + k));
      if (v < 0 || (/_pct$/.test(k) && v > 100)) { toast('Confira os valores: percentuais entre 0 e 100.'); return null; }
      p[k] = v;
    }
    return p;
  }
  async function redeSalvarPadroes() {
    const p = lerPadroes(); if (!p) return;
    const { error } = await supabaseClient.from('rede_padroes').upsert({ id: 1, ...p, updated_at: new Date().toISOString() });
    if (error) { toast('Erro: ' + error.message); return; }
    D().padroes = { ...D().padroes, ...p };
    toast('Padrões salvos. Valem para as próximas unidades.');
  }
  function redeAplicarPadroes() {
    const p = lerPadroes(); if (!p) return;
    const alvo = D().franquias.filter((f) => f.tipo === 'franquia');
    const go = async () => {
      const { error: e1 } = await supabaseClient.from('rede_padroes').upsert({ id: 1, ...p, updated_at: new Date().toISOString() });
      const { error } = e1 ? { error: e1 } : await supabaseClient.from('rede_taxas').upsert(alvo.map((f) => ({ franquia_id: f.id, ...p, updated_at: new Date().toISOString() })), { onConflict: 'franquia_id' });
      if (error) { toast('Erro: ' + error.message); return; }
      toast(`Padrões aplicados a ${alvo.length} franquia(s).`);
      redeRecarregar();
    };
    if (typeof showConfirmModal === 'function') showConfirmModal(`Sobrescrever as taxas de ${alvo.length} franquia(s) com estes padrões? Ajustes feitos por contrato em cada unidade serão perdidos. Unidades próprias não mudam.`, go, 'APLICAR');
    else go();
  }

  // ------------------------------------------------------------ ações: lançamentos
  function redeLancarModal(fid) {
    const f = franquia(fid), ym = D().mes;
    const doMes = Object.fromEntries(D().lanc.filter((l) => l.franquia_id === fid && String(l.mes).slice(0, 7) === ym).map((l) => [l.categoria, num(l.valor)]));
    const c = calc(f, ym);
    const campo = (k, n, ph) => `<div class="rd-fld"><label>${n}</label><div class="rd-in money" style="width:100%"><span>R$</span><input id="rdl-${k}" style="width:100%" inputmode="decimal" value="${doMes[k] != null ? pctIn(doMes[k]) : ''}" placeholder="${ph}"></div></div>`;
    modal(`<h3>Custos e despesas · ${mesNome(ym)}</h3><p class="rd-muted" style="margin:0">${esc(f.nome)} · campo vazio = usa a estimativa (custos) ou fica sem valor (despesas)</p>
      <p class="rd-sub" style="margin:16px 0 0"><b>Custos diretos</b></p>
      <div class="rd-fgrid" style="margin-top:8px">${CUSTOS.map(([k, n]) => campo(k, n, 'estimado ' + curto(k === 'custo_kits' ? c.cKit : k === 'custo_instalacao' ? c.cInst : c.com))).join('')}</div>
      <p class="rd-sub" style="margin:16px 0 0"><b>Despesas operacionais</b></p>
      <div class="rd-fgrid" style="margin-top:8px">${DESPESAS.map(([k, n]) => campo(k, n, c.despMap[k] != null && c.despEstimado ? 'anterior ' + curto(c.despMap[k]) : '0')).join('')}</div>
      <div id="rd-err" class="rd-err"></div>
      <div class="rd-mfoot"><button class="rd-btn" onclick="redeFecharModal()">Cancelar</button><button class="rd-btn pri" id="rd-save" onclick="redeSalvarLancamentos('${fid}')">${ic('check')}Salvar</button></div>`);
  }
  async function redeSalvarLancamentos(fid) {
    const ym = D().mes, mes = ym + '-01';
    const up = [], del = [];
    for (const [k] of CUSTOS.concat(DESPESAS)) {
      const raw = val('rdl-' + k);
      if (raw === '') { del.push(k); continue; }
      const v = parseNum(raw);
      if (v < 0) { erroModal('Valores não podem ser negativos.'); return; }
      up.push({ franquia_id: fid, mes, categoria: k, valor: v, updated_by: state.currentUser?.email || null, updated_at: new Date().toISOString() });
    }
    await ocupado('rd-save', async () => {
      if (up.length) {
        const { error } = await supabaseClient.from('rede_lancamentos').upsert(up, { onConflict: 'franquia_id,mes,categoria' });
        if (error) { erroModal('Não foi possível salvar: ' + error.message); return; }
      }
      if (del.length) {
        const { error } = await supabaseClient.from('rede_lancamentos').delete().eq('franquia_id', fid).eq('mes', mes).in('categoria', del);
        if (error) { erroModal('Não foi possível salvar: ' + error.message); return; }
      }
      fecharModal(); toast('Lançamentos salvos.'); redeRecarregar();
    });
  }

  Object.assign(window, {
    renderRedeRoute, redeSetMes, redeRecarregar, redeBuscar, redeAbrirUnidade, redeVoltarUnidades, redeUnidadeAba,
    redeNovaUnidade, redeEditarUnidade, redeSalvarUnidade, redeFecharModal: fecharModal,
    redeEmpresaModal, redeBuscarCnpj, redeSalvarEmpresa, redeEmpresaPrincipal, redeEmpresaAtivo,
    redeImpostoModal, redeSalvarImposto, redeSugerirImpostos, redeSetAliquota, redeRemoverImposto,
    redeSetTaxa, redeSetTaxaCartao, redeSalvarPadroes, redeAplicarPadroes, redeLancarModal, redeSalvarLancamentos,
    redeToggleProjetos, redeSetProjetoCobrar, redeProjetoTabela, redeSetFaixa, redeAddFaixa, redeDelFaixa, redeProjetoValor, redeProjetoIsento,
  });
})();
