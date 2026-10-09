// Integração com distribuidoras (Belenus agora; Helte quando liberar OAuth).
// verify_jwt = true. Ações:
//   { acao: "testar", provedor }               -> admin: loga na distribuidora e grava o status
//   { acao: "opcoes", provedor }                -> módulos e marcas de inversor/micro (do espelho, sem consultar a distribuidora)
//   { acao: "cotar", provedor, placas, tipo, modulo?, marca?, telhado? } -> qualquer usuário ativo: cota os kits,
//        aplica a precificação e grava cada opção em cotacoes_distribuidora.
//        Vendedor/gestor recebem SÓ preço e "De"; o custo fica no banco (admin vê).
// A senha da distribuidora vem do Vault via RPC integracao_credencial (só service role).

const CORS = {
  "Access-Control-Allow-Origin": "*",
  // x-region: o front pede a região (sa-east-1); sem ela aqui o navegador barra a chamada.
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-region",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" } });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function jwtPayload(token: string): Record<string, any> | null {
  try {
    const b64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4)));
  } catch { return null; }
}

async function rest(path: string, init: RequestInit = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const txt = await r.text();
  const data = txt ? JSON.parse(txt) : null;
  if (!r.ok) throw new Error(data?.message || `Erro ${r.status} no banco`);
  return data;
}

// ---------------------------------------------------------------- precificação
// Mesma regra das planilhas dos kits prontos (relação preço ÷ custo da tabela da
// Matriz): base = custo × relação ÷ fator, arredondada pra cima no final 97, × fator.
// "De" = preço + 13,38% (acima de R$ 30 mil o desconto cresce pela raiz do preço).
// Depois o admin/gestor ajusta pela calculadora de orçamento (DRE) da proposta.
const REGRA = {
  inversor: { rel: 1.7717293041376716, fator: 1.05 },   // kits com inversor (planilha 30/09)
  micro:    { rel: 1.7498326202954417, fator: 1.071 },  // kits micro (planilha de 06/10 à tarde)
  final: 97, de_pct: 13.37538962526612, de_lim: 30000,
};
function precificar(custo: number, micro: boolean) {
  const { rel, fator } = micro ? REGRA.micro : REGRA.inversor;
  const base = Math.ceil((custo * rel / fator - REGRA.final) / 100) * 100 + REGRA.final;
  const preco = Math.round(base * fator * 100) / 100;
  const pct = REGRA.de_pct / 100;
  const de = preco <= REGRA.de_lim ? preco * (1 + pct) : preco + pct * REGRA.de_lim * Math.sqrt(preco / REGRA.de_lim);
  return { preco, preco_de: Math.round(de * 100) / 100 };
}

// ---------------------------------------------------------------- Belenus
const BEL = "https://belenus.com.br/api";
// Sessão reaproveitada enquanto vale (a Belenus bloqueia login repetido), como a Groner
// faz: loga uma vez e usa o mesmo token até vencer. Fica no banco (distribuidora_sessoes)
// porque cada instância nova da função começa com a memória vazia; a memória é só atalho.
const SESSAO: { usuario: string; token: string; expira: number } = { usuario: "", token: "", expira: 0 };
// Pausa preventiva após recusa de acesso. Um 403 sozinho não comprova firewall,
// excesso de consultas ou o prazo de liberação do fornecedor: pausa crescente (2, 5 e
// depois 20 min) contando as recusas seguidas dos últimos 30 min; zera quando uma cotação
// dá certo. 429 respeita o Retry-After da Belenus (sem prazo válido: 1 min) e não conta recusa.
const PAUSAS_RECUSA_MS = [2 * 60_000, 5 * 60_000, 20 * 60_000];
const JANELA_RECUSAS_MS = 30 * 60_000;
const PAUSA_429_MS = 60_000;
const BLOQ = { ate: 0, motivo: "403" }; // atalho em memória; o que vale fica em distribuidora_sessoes
const erroBloqueio = (ate: number, motivo = "403") => new Error(motivo === "429"
  ? `A Belenus pediu pra aguardar antes de novas consultas. Novas tentativas estão pausadas até ${horaBR(ate)}.`
  : `A Belenus está recusando as consultas da plataforma no momento. Por precaução, novas tentativas estão pausadas até ${horaBR(ate)}. Esse horário é uma pausa do nosso sistema, não uma previsão de liberação da Belenus.`);
// Retry-After em segundos ou data HTTP; fora de 5 s a 30 min, ignora (usa o padrão).
function prazoRetryAfter(valor: string | null) {
  if (!valor) return 0;
  const s = Number(valor);
  const ms = Number.isFinite(s) ? s * 1000 : Date.parse(valor) - Date.now();
  return Number.isFinite(ms) && ms >= 5_000 && ms <= 30 * 60_000 ? ms : 0;
}
function expiraDoToken(token: string) {
  const exp = Number(jwtPayload(token)?.exp);
  return Number.isFinite(exp) && exp > 0 ? exp * 1000 - 5 * 60_000 : Date.now() + 50 * 60_000;
}
const horaBR = (ms: number) => new Date(ms).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });

async function sessaoLer(provedor: string) {
  const rows = await rest(`distribuidora_sessoes?provedor=eq.${provedor}&select=usuario,token,expira,bloqueado_ate,bloqueio_motivo,recusas_seguidas,ultima_recusa`).catch(() => []);
  return Array.isArray(rows) ? rows[0] ?? null : null;
}
async function sessaoGravar(provedor: string, dados: Record<string, unknown>) {
  await rest("distribuidora_sessoes", {
    method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ provedor, ...dados, updated_at: new Date().toISOString() }),
  }).catch((e) => console.error("[distribuidoras] gravar sessão", e?.message));
}

class Belenus {
  token = "";
  site = "0001";
  private diagnosticoId = crypto.randomUUID();
  private recusas = { n: 0, ultima: 0 }; // recusas (403) seguidas, lidas do banco no login
  constructor(private email: string, private senha: string, private provedor = "belenus") {}

  async login(forcar = false) {
    if (BLOQ.ate > Date.now()) throw erroBloqueio(BLOQ.ate, BLOQ.motivo);
    // Lê o banco sempre (é barato): outra instância pode ter levado um 403 e pausado tudo.
    const salva = await sessaoLer(this.provedor);
    this.recusas = { n: Number(salva?.recusas_seguidas) || 0, ultima: salva?.ultima_recusa ? Date.parse(salva.ultima_recusa) : 0 };
    const bloqueio = salva?.bloqueado_ate ? Date.parse(salva.bloqueado_ate) : 0;
    if (bloqueio > Date.now()) {
      Object.assign(BLOQ, { ate: bloqueio, motivo: salva?.bloqueio_motivo || "403" });
      throw erroBloqueio(bloqueio, BLOQ.motivo);
    }
    if (!forcar && SESSAO.usuario === this.email && SESSAO.token && SESSAO.expira > Date.now()) {
      this.token = SESSAO.token;
      return { nome: null, reaproveitada: true };
    }
    const expiraSalva = salva?.expira ? Date.parse(salva.expira) : 0;
    if (!forcar && salva?.usuario === this.email && salva?.token && expiraSalva > Date.now()) {
      Object.assign(SESSAO, { usuario: this.email, token: salva.token, expira: expiraSalva });
      this.token = salva.token;
      return { nome: null, reaproveitada: true };
    }
    const r = await this.req("autenticacao/Usuario/Login/PessoaJuridicaByEmail", { email: this.email, senha: this.senha }, false);
    const s = r?.data ?? r;
    this.token = s?.token ?? s?.Token ?? "";
    if (!this.token) throw new Error("A Belenus não aceitou o login. Confira usuário e senha.");
    const expira = expiraDoToken(this.token);
    Object.assign(SESSAO, { usuario: this.email, token: this.token, expira });
    await sessaoGravar(this.provedor, {
      usuario: this.email, token: this.token, expira: new Date(expira).toISOString(), bloqueado_ate: null, ultimo_login: new Date().toISOString(),
    });
    return { nome: s?.razaoSocial ?? s?.nome ?? s?.usuario?.nome ?? null };
  }

  // Cotação deu certo: a próxima recusa volta a pausar só 2 min.
  async zerarRecusas() {
    if (!this.recusas.n) return;
    this.recusas = { n: 0, ultima: 0 };
    await sessaoGravar(this.provedor, { recusas_seguidas: 0 });
  }

  async req(path: string, body: unknown, auth = true, timeoutMs = 30000, repetida = false): Promise<any> {
    if (BLOQ.ate > Date.now()) throw erroBloqueio(BLOQ.ate, BLOQ.motivo); // não insiste no meio de uma cotação
    const inicio = Date.now();
    const etapa = path.split("?")[0];
    let resposta: Response | undefined;
    let formato = "sem_resposta", indicio = "nenhum";
    let resultado = "erro_rede";
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const r = await fetch(`${BEL}/${path}`, {
        method: "POST",
        signal: ac.signal,
        headers: {
          "Content-Type": "application/json", Accept: "application/json, text/plain, */*", "x-plataforma": "1",
          ...(auth ? { Authorization: `Bearer ${this.token}` } : {}),
        },
        body: JSON.stringify(body),
      });
      resposta = r;
      const txt = await r.text();
      let j: any = null;
      try { j = txt ? JSON.parse(txt) : null; } catch { /* html */ }
      // Apenas categorias e metadados: nunca corpo bruto, token, senha ou dados do cliente.
      formato = j !== null ? "json" : /<html|<!doctype/i.test(txt) ? "html" : "texto";
      indicio = /too many requests|rate.?limit|excesso de (consultas|requisições)/i.test(txt) ? "limite_mencionado"
        : /captcha|cf-chl-|challenge-platform/i.test(txt) ? "desafio_antibot"
        : /access denied|forbidden|acesso negado/i.test(txt) ? "acesso_recusado" : "nenhum";
      resultado = r.ok ? (j?.isSucceed === false ? "erro_negocio" : "ok") : `http_${r.status}`;
      if (r.status === 401 && auth) {
        // Sessão venceu antes da hora: loga de novo uma vez e repete o pedido.
        SESSAO.token = "";
        if (!repetida) {
          clearTimeout(t);
          await this.login(true);
          return this.req(path, body, auth, timeoutMs, true);
        }
      }
      if (r.status === 403) {
        const agora = Date.now();
        const n = agora - this.recusas.ultima < JANELA_RECUSAS_MS ? this.recusas.n + 1 : 1;
        const ate = agora + PAUSAS_RECUSA_MS[Math.min(n, PAUSAS_RECUSA_MS.length) - 1];
        this.recusas = { n, ultima: agora };
        Object.assign(BLOQ, { ate, motivo: "403" });
        await sessaoGravar(this.provedor, { // mantém o token
          bloqueado_ate: new Date(ate).toISOString(), bloqueio_motivo: "403", recusas_seguidas: n, ultima_recusa: new Date(agora).toISOString(),
        });
        throw erroBloqueio(ate, "403");
      }
      if (r.status === 429) {
        const ate = Date.now() + (prazoRetryAfter(r.headers.get("retry-after")) || PAUSA_429_MS);
        Object.assign(BLOQ, { ate, motivo: "429" });
        await sessaoGravar(this.provedor, { bloqueado_ate: new Date(ate).toISOString(), bloqueio_motivo: "429" });
        throw erroBloqueio(ate, "429");
      }
      if (!r.ok) {
        // Detalhe pra diagnóstico: firewall (Cloudflare etc.) responde HTML; a API responde JSON.
        const via = r.headers.get("cf-ray") ? "cloudflare" : (r.headers.get("server") || "?");
        const trecho = j ? JSON.stringify(j).slice(0, 160) : txt.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);
        throw new Error(j?.messages?.[0]?.description || `Belenus respondeu ${r.status} em ${path.split("?")[0]} [${via}] ${trecho}`);
      }
      if (j && j.isSucceed === false) throw new Error(j?.messages?.[0]?.description || "A Belenus recusou o pedido");
      return j;
    } catch (err) {
      if (ac.signal.aborted) {
        resultado = "timeout";
        throw new Error(`A Belenus não concluiu a consulta em ${Math.round(timeoutMs / 1000)} segundos (${etapa}). Isso não confirma bloqueio de acesso.`);
      }
      throw err;
    } finally {
      clearTimeout(t);
      const registro = JSON.stringify({
        evento: "belenus_consulta", diagnostico_id: this.diagnosticoId, regiao: Deno.env.get("SB_REGION") ?? null,
        etapa, duracao_ms: Date.now() - inicio, timeout_ms: timeoutMs,
        status: resposta?.status ?? null, resultado, formato, indicio, repetida,
        servidor: resposta?.headers.get("server")?.slice(0, 80) ?? null,
        cf_ray: resposta?.headers.get("cf-ray")?.slice(0, 100) ?? null,
        retry_after: resposta?.headers.get("retry-after")?.slice(0, 80) ?? null,
      });
      if (resultado === "ok") console.info(registro);
      else console.warn(registro);
    }
  }

  // Modelos e quantidades recomendadas pela Belenus para o projeto informado.
  async inversores(modulo: string, kwp: number, placas: number, tipo: string, lig: string, tensao: string, marca: string) {
    const j = await this.req("catalogo/KitPersonalizado/Inversor", {
      site: this.site, modulo, inversor: "", potenciaProjeto: kwp, tipoLigacao: lig, tipoInversor: tipo,
      tensaoNominal: tensao, qtdeModulo: placas, qtde: 0, fabricantes: [{ fabricante: marca }],
    });
    if (!Array.isArray(j?.data?.inversores)) throw new Error("A Belenus não devolveu a lista de inversores para esse projeto.");
    return j.data.inversores as any[];
  }

  async estrutura(modulo: string, kwp: number, placas: number, inversor: any, telhado: { grupo: string; tipo: string; sub: string; obs: string }) {
    const linhas = placas >= 4 ? 2 : 1;
    const porLinha = Math.ceil(placas / linhas);
    // 2 linhas; com número ímpar a 2ª linha fica com uma placa a menos (2 arranjos)
    const layout = linhas === 1 || placas % 2 === 0
      ? [{ arranjo: 1, linhas: String(linhas), moduloLinha: String(porLinha), orientacao: "Retrato", tipoEstrutura: telhado.tipo, grupo: telhado.grupo, subGrupo: telhado.sub, observation: telhado.obs }]
      : [
        { arranjo: 1, linhas: "1", moduloLinha: String(porLinha), orientacao: "Retrato", tipoEstrutura: telhado.tipo, grupo: telhado.grupo, subGrupo: telhado.sub, observation: telhado.obs },
        { arranjo: 2, linhas: "1", moduloLinha: String(placas - porLinha), orientacao: "Retrato", tipoEstrutura: telhado.tipo, grupo: telhado.grupo, subGrupo: telhado.sub, observation: telhado.obs },
      ];
    const j = await this.req("catalogo/KitPersonalizado/Estrutura", {
      semEstrutura: false, site: this.site, potenciaProjeto: kwp, sugestao: 1, modulo, moduloQtde: placas, layout, listInversores: [inversor],
    });
    return { layout, itens: ((j?.data?.structure ?? []) as any[]).filter((x) => Number(x.qtde) > 0) };
  }

  async outros(modulo: string, kwp: number, placas: number, inversor: any) {
    const j = await this.req("catalogo/KitPersonalizado/Outros", {
      site: this.site, potenciaProjeto: kwp, modulo, sugestao: 1, moduloQtde: placas, listInversores: [inversor],
    });
    const d = j?.data ?? {};
    const lista: any[] = Array.isArray(d) ? d : (Object.values(d).find((v) => Array.isArray(v)) as any[]) ?? [];
    return lista.filter((x) => Number(x.qtde) > 0);
  }

  async confirmar(body: unknown) {
    const j = await this.req("carrinho/KitPersonalizado/Confirmar", body);
    return j?.data;
  }

  async frete(conf: any, componentes: { sku: string; qtde: number }[]) {
    const end = conf?.frete?.enderecoCliente ?? {};
    const j = await this.req("fretes/TipoFrete/BuscarFretes?calcularValores=true", {
      SiteID: this.site, ValorPedido: conf.totalProdutos, Divisao: "SOL", Cidade: end.cidade, Estado: end.estado, eKit: 1,
      pesoTotal: conf.peso, tipoUsuario: 5, liberarComprasMinimas: true,
      itens: [{ sku: "KGF-1", qtde: 1, componentes }], IntegradorDocumento: conf.clienteCnpjCpf, ClienteDocumento: null,
    });
    const op = (j?.opcoes ?? []).find((o: any) => o.tipoFreteId === "06");
    if (!op) throw new Error("A Belenus não devolveu o frete de entrega");
    return { valor: Number(op.freteIncluso ?? 0) + Number(op.taxa ?? 0), cidade: end.cidade, estado: end.estado };
  }
}

const SEM_MARCA = /DEYE/i; // regra da empresa: nunca DEYE

// ---------------------------------------------------------------- espelho do catálogo
// Módulos e inversores (sem preço) ficam espelhados em distribuidora_catalogo: a tela abre sem
// consultar a Belenus. Na cotação, as recomendações de inversor são consultadas para o projeto
// real: a lista pode se repetir, mas numInversores e os limites somados dependem do projeto.
// Passou de 24 h: usa o espelho atual para os filtros e atualiza em segundo plano.
declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;
const CATALOGO_VALIDADE_MS = 24 * 60 * 60_000;
const INV_GRUPOS = [
  { grupo: "mono", tipo: "Inversor String On-grid", lig: "Monofásico", tensao: "127/220V" },
  { grupo: "tri", tipo: "Inversor String On-grid", lig: "Trifásico", tensao: "220V" },
  { grupo: "micro", tipo: "MICROINVERSOR", lig: "Monofásico", tensao: "127/220V" },
];
type Catalogo = { modulos: any[]; inversores: any[]; atualizado_em?: string | null };

function emSegundoPlano(p: Promise<unknown>) {
  const q = p.catch((e) => console.error("[distribuidoras] atualizar catálogo", e?.message));
  if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(q);
}

async function baixarCatalogoBelenus(bel: Belenus): Promise<Catalogo> {
  const mods = await bel.req("catalogo/KitPersonalizado/Modulos", { site: bel.site, potenciaProjeto: "10.00", modulo: "", qtde: 0, fabricantes: [{ fabricante: "" }] });
  const modulos = (mods?.data?.modulos ?? []) as any[];
  const ref = modulos.find((m) => Number(m.potencia) >= 600) ?? modulos[0];
  if (!ref) throw new Error("A Belenus não devolveu nenhum módulo");
  const placasRef = Math.round(10000 / Number(ref.potencia));
  const kwpRef = Math.round(placasRef * Number(ref.potencia)) / 1000;
  const inversores: any[] = [];
  for (const g of INV_GRUPOS) {
    const lista = await bel.inversores(ref.item, kwpRef, placasRef, g.tipo, g.lig, g.tensao, "");
    // A Belenus devolve maxPotenciaEntrada/Saida SOMADOS pela quantidade que ela sugere pra
    // potência consultada (ex.: Growatt 3K x2 = 10,8 kW de entrada): guarda o valor por unidade.
    inversores.push(...lista.map((i) => {
      const n = Math.max(1, Number(i.numInversores) || 1);
      return {
        ...soCampos(i, CAMPOS_INVERSOR), _grupo: g.grupo, numInversores: 1,
        maxPotenciaEntrada: Math.round(Number(i.maxPotenciaEntrada) / n * 1e4) / 1e4,
        maxPotenciaSaida: Math.round(Number(i.maxPotenciaSaida) / n * 1e4) / 1e4,
      };
    }));
  }
  return { modulos: modulos.map((m) => soCampos(m, CAMPOS_MODULO)), inversores };
}
// Só o que a cotação usa (a Belenus aceita o inversor assim; conferido em 08/10).
const CAMPOS_MODULO = ["index", "item", "descricaoItem", "fabricante", "modelo", "tipoCelula", "potencia", "eficiencia", "imagemMarca"];
const CAMPOS_INVERSOR = ["index", "item", "ordemFiltro", "overloadGrupo", "descricaoItem", "fabricante", "modelo", "tipoInversor", "tipoLigacao",
  "imagemMarca", "numEntradaMPPT", "tensaoSaida", "numMPPTs", "potenciaNominalSaida"];
const soCampos = (o: any, campos: string[]) => Object.fromEntries(campos.filter((k) => k in o).map((k) => [k, o[k]]));

// Baixa o catálogo e grava. Trava de 5 min pra duas instâncias não baixarem juntas (null = outra está baixando).
async function catalogoAtualizar(bel: Belenus, provedor: string): Promise<Catalogo | null> {
  await rest("distribuidora_catalogo", {
    method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify({ provedor }),
  });
  const limite = encodeURIComponent(new Date(Date.now() - 5 * 60_000).toISOString());
  const travou = await rest(`distribuidora_catalogo?provedor=eq.${provedor}&or=(atualizando_em.is.null,atualizando_em.lt.${limite})`, {
    method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ atualizando_em: new Date().toISOString() }),
  });
  if (!Array.isArray(travou) || !travou.length) return null;
  try {
    await bel.login();
    const cat = await baixarCatalogoBelenus(bel);
    if (!cat.modulos.length || !cat.inversores.length) throw new Error("A Belenus devolveu o catálogo vazio");
    const atualizado_em = new Date().toISOString();
    await rest(`distribuidora_catalogo?provedor=eq.${provedor}`, {
      method: "PATCH", body: JSON.stringify({ ...cat, atualizado_em, atualizando_em: null, ultimo_erro: null }),
    });
    return { ...cat, atualizado_em };
  } catch (err) {
    await rest(`distribuidora_catalogo?provedor=eq.${provedor}`, {
      method: "PATCH", body: JSON.stringify({ atualizando_em: null, ultimo_erro: String((err as Error).message || err) }),
    }).catch(() => {});
    throw err;
  }
}

// Espelho pronto pra uso. Mais velho que maxIdadeMs: devolve o atual e atualiza em segundo plano.
// Sem espelho (primeira vez): baixa agora.
async function catalogo(bel: Belenus, provedor: string, maxIdadeMs = CATALOGO_VALIDADE_MS): Promise<Catalogo> {
  const rows = await rest(`distribuidora_catalogo?provedor=eq.${provedor}&select=modulos,inversores,atualizado_em`).catch(() => []);
  const c = Array.isArray(rows) ? rows[0] : null;
  if (c?.modulos?.length && c?.inversores?.length) {
    const idade = c.atualizado_em ? Date.now() - Date.parse(c.atualizado_em) : Infinity;
    if (idade > maxIdadeMs) emSegundoPlano(catalogoAtualizar(bel, provedor));
    return c;
  }
  const novo = await catalogoAtualizar(bel, provedor);
  if (novo) return novo;
  throw new Error("O catálogo da Belenus está sendo atualizado. Tente de novo em um minuto.");
}

const marcaDe = (x: any) => String(x?.fabricante || "").trim().toUpperCase();

// Módulo padrão: 620 W RONMA; senão qualquer 620 W; senão o de menor índice (R$/W) com 600 W ou mais.
function moduloPadrao(lista: any[]) {
  return lista.find((m) => Number(m.potencia) === 620 && /RONMA/i.test(m.fabricante))
    ?? lista.find((m) => Number(m.potencia) === 620)
    ?? lista.filter((m) => Number(m.potencia) >= 600).sort((a, b) => Number(a.index) - Number(b.index))[0];
}

// Módulos e marcas que a distribuidora oferece (do espelho, sem consultar a Belenus).
function opcoesBelenus(cat: Catalogo) {
  const modulos = cat.modulos
    .filter((m) => Number(m.potencia) >= 400)
    .sort((a, b) => Number(a.index) - Number(b.index))
    .map((m) => ({ sku: m.item, nome: m.descricaoItem, fabricante: m.fabricante, potencia: Number(m.potencia), tipo: m.tipoCelula }));
  const marcas = (grupos: string[]) => [...new Set(cat.inversores.filter((i) => grupos.includes(i._grupo)).map(marcaDe))]
    .filter((f) => f && !SEM_MARCA.test(f)).sort();
  return {
    modulos, padrao: moduloPadrao(cat.modulos)?.item ?? modulos[0]?.sku ?? null,
    marcas_inversor: marcas(["mono", "tri"]), marcas_micro: marcas(["micro"]), atualizado_em: cat.atualizado_em ?? null,
  };
}

const TELHADOS: Record<string, { grupo: string; tipo: string; sub: string; obs: string }> = {
  ceramico: {
    grupo: "Colonial", tipo: "Colonial com ajuste vertical",
    sub: "Modelo Belenergy em alumínio com ajuste vertical, indicado para telhas cerâmicas em geral", obs: "",
  },
};

function itemConfirmar(tipo: string, x: any, qtde: number) {
  const base: Record<string, unknown> = { tipoKitmontado: tipo, item: x.item, qtde, fabricante: x.fabricante, modelo: x.modelo, imagemMarca: x.imagemMarca };
  if (tipo === "modulo") Object.assign(base, { eficiencia: x.eficiencia, potencia: x.potencia });
  if (tipo === "inversor") Object.assign(base, {
    maxPotenciaSaida: x.maxPotenciaSaida, tipoInversor: x.tipoInversor, tipoLigacao: x.tipoLigacao, numMPPTs: x.numMPPTs,
    numEntradaMPPT: x.numEntradaMPPT, maxPotenciaEntrada: x.maxPotenciaEntrada, potencia: x.potenciaNominalSaida, index: x.index, tensaoNominal: x.tensaoSaida,
  });
  if (tipo === "outro") Object.assign(base, {
    numEntrada: x.numEntrada, numSaida: x.numSaida, dimensoes: x.dimensoes, grauProtecao: x.grauProtecao,
    correnteEntradaMax: x.correnteEntradaMax, tensaoMaxima: x.tensaoMaxima,
  });
  return base;
}

// Os limites de entrada/saída da resposta são totais da quantidade recomendada.
// Mantém a quantidade da Belenus e normaliza os limites para os corpos de confirmação.
function recomendacaoInversor(i: any, grupo: string) {
  const qtd = Number(i.numInversores);
  const entrada = Number(i.maxPotenciaEntrada), saida = Number(i.maxPotenciaSaida);
  const potencia = Number(i.potenciaNominalSaida);
  if (!i.item || !Number.isInteger(qtd) || qtd < 1 || !Number.isFinite(potencia) || potencia <= 0
    || !Number.isFinite(entrada) || entrada <= 0 || !Number.isFinite(saida) || saida <= 0) return null;
  return {
    ...soCampos(i, CAMPOS_INVERSOR), potenciaNominalSaida: potencia, _grupo: grupo, numInversores: qtd,
    maxPotenciaEntrada: Math.round(entrada / qtd * 1e4) / 1e4,
    maxPotenciaSaida: Math.round(saida / qtd * 1e4) / 1e4,
  };
}

async function cotarBelenus(bel: Belenus, cat: Catalogo, placas: number, opcoes: any) {
  const modulo: string = opcoes?.modulo ?? "MFRB-0.3-BF-132-620W";
  const tipo: string = opcoes?.tipo === "micro" ? "micro" : opcoes?.tipo === "inversor" ? "inversor" : "todos";
  const marcaEscolhida = String(opcoes?.marca ?? "").trim().toUpperCase();
  if (marcaEscolhida && SEM_MARCA.test(marcaEscolhida)) throw new Error("Marca não permitida");
  const marcas: string[] = tipo === "micro" ? [] : marcaEscolhida ? [marcaEscolhida] : (opcoes?.marcas ?? ["SOLIS", "GROWATT"]);
  const telhado = TELHADOS[opcoes?.telhado ?? "ceramico"] ?? TELHADOS.ceramico;

  // O módulo vem do espelho; inversores e quantidades vêm da recomendação para este projeto.
  // Módulo escolhido pelo vendedor e em falta: avisa em vez de trocar por outro.
  const lista = cat.modulos;
  if (opcoes?.modulo_escolhido && !lista.some((m) => m.item === modulo)) {
    throw new Error("Esse kit não está disponível no momento: a Belenus está sem o módulo escolhido. Escolha outro módulo e cote de novo.");
  }
  const mod = lista.find((m) => m.item === modulo) ?? moduloPadrao(lista);
  if (!mod) throw new Error(`A Belenus não tem nenhum módulo de 600 W ou mais (${lista.length} módulos no catálogo)`);
  const kwp = Math.round(placas * Number(mod.potencia)) / 1000;

  // Envia módulo, placas, potência DC do projeto e marca; não fixa modelo ou potência AC.
  // Uma consulta por grupo atende todas as marcas da comparação.
  const buscar = async (grupo: string, marca: string) => {
    const g = INV_GRUPOS.find((x) => x.grupo === grupo)!;
    const lista = await bel.inversores(mod.item, kwp, placas, g.tipo, g.lig, g.tensao, marca);
    return lista.map((i) => recomendacaoInversor(i, grupo)).filter((i) => i !== null);
  };
  const unico = (i: any) => Number(i.numInversores) === 1 && kwp <= Number(i.maxPotenciaEntrada);
  const escolhas: { micro: boolean; inv: any; qtdInv: number }[] = [];
  const filtroMarca = marcas.length === 1 ? marcas[0] : "";
  const mono = marcas.length ? await buscar("mono", filtroMarca) : [];
  const faltantes = marcas.filter((marca) => !mono.some((i) => marcaDe(i) === marca && unico(i)));
  const tri = faltantes.length ? await buscar("tri", faltantes.length === 1 ? faltantes[0] : "") : [];
  for (const marca of marcas) {
    let ok = mono.filter((i) => marcaDe(i) === marca && unico(i));
    if (!ok.length) ok = tri.filter((i) => marcaDe(i) === marca && unico(i));
    ok.sort((a, b) => Number(a.potenciaNominalSaida) - Number(b.potenciaNominalSaida));
    if (ok[0]) escolhas.push({ micro: false, inv: ok[0], qtdInv: 1 });
  }
  if (tipo !== "inversor" && opcoes?.micro !== false) {
    const marcaMicro = tipo === "micro" && marcaEscolhida ? marcaEscolhida : "HOYMILES";
    const micros = (await buscar("micro", marcaMicro))
      .filter((m) => marcaDe(m) === marcaMicro && kwp <= Number(m.maxPotenciaEntrada) * Number(m.numInversores))
      .map((m) => ({ m, qtd: Number(m.numInversores) }))
      .sort((a, b) => a.qtd - b.qtd || Number(a.m.potenciaNominalSaida) - Number(b.m.potenciaNominalSaida));
    if (micros[0]) escolhas.push({ micro: true, inv: micros[0].m, qtdInv: micros[0].qtd });
  }
  if (!escolhas.length) throw new Error(marcaEscolhida
    ? `Esse kit não está disponível no momento: a Belenus está sem ${tipo === "micro" ? "microinversor" : "inversor"} ${marcaEscolhida} pra ${placas} placas. Escolha outra marca ou outro módulo e cote de novo.`
    : `Esse kit não está disponível no momento: a Belenus está sem ${tipo === "micro" ? "microinversor" : "inversor"} pra ${placas} placas com esse módulo. Escolha outro módulo e cote de novo.`);

  const resultados: any[] = [];
  for (const e of escolhas) {
    try {
      // A Belenus procura o inversor pelos campos "inversor"/"inversorQtde" (como o site manda);
      // sem eles Estrutura/Outros respondem "Inversor não encontrado!".
      const { _grupo, ...inv } = e.inv;
      const invObj = { ...inv, numInversores: e.qtdInv, qtde: e.qtdInv, inversor: e.inv.item, inversorQtde: e.qtdInv };
      const est = await bel.estrutura(mod.item, kwp, placas, invObj, telhado);
      const outros = await bel.outros(mod.item, kwp, placas, invObj);
      const itens = [
        itemConfirmar("modulo", mod, placas),
        itemConfirmar("inversor", e.inv, e.qtdInv),
        ...est.itens.map((x) => itemConfirmar("estrutura", x, Number(x.qtde))),
        ...outros.map((x) => itemConfirmar("outro", x, Number(x.qtde))),
      ];
      const conf = await bel.confirmar({
        site: bel.site, potenciaProjeto: kwp, semEstrutura: false, mesesInatividade: 3, itens, layout: est.layout,
        origemCarrinho: 1, potenciaSistema: kwp, qtdModulos: placas, qtdInversores: e.qtdInv,
        totalMaxPotenciaEntrada: Number(e.inv.maxPotenciaEntrada) * e.qtdInv, totalMaxPotenciaSaida: Number(e.inv.maxPotenciaSaida) * e.qtdInv,
      });
      const comps = (conf?.itens ?? []).flatMap((i: any) => i.componentes ?? []);
      const fr = await bel.frete(conf, comps.map((c: any) => ({ sku: c.sku, qtde: c.quantidade })));
      const produtos = Number(conf.totalProdutos);
      resultados.push({
        micro: e.micro, inv: e.inv, qtdInv: e.qtdInv, kwp, placas, mod,
        itens: comps.map((c: any) => ({ sku: c.sku, descricao: c.descricaoProduto, qtd: c.quantidade, tipo: c.tipoKitMontado })),
        custo: Math.round((produtos + fr.valor) * 100) / 100,
        detalhe: { produtos, frete: fr.valor, cidade: fr.cidade, estado: fr.estado, unitarios: comps.map((c: any) => ({ sku: c.sku, qtd: c.quantidade, preco: c.precoBruto })) },
      });
    } catch (err) {
      resultados.push({ erro: String((err as Error).message || err), inv: e.inv, micro: e.micro });
    }
  }
  return resultados;
}

// ---------------------------------------------------------------- modo de preço da unidade
// Cada unidade escolhe no centro de custo (Financeiro → Config): 'markup' (REGRA acima)
// ou 'custos' (kit + custos da unidade + imposto + comissão + margem alvo, via
// cc_preco_dimensionado). Sem centro de custo salvo: markup.
async function modoDaUnidade(franquiaId: string | null): Promise<"markup" | "custos"> {
  if (!franquiaId) return "markup";
  // Sem a coluna (migration 20261009180000 ainda não aplicada) ou sem linha: markup.
  const rows = await rest(`fin_centro_custo?franquia_id=eq.${franquiaId}&select=modo_preco`).catch(() => []);
  return Array.isArray(rows) && rows[0]?.modo_preco === "custos" ? "custos" : "markup";
}
// "De" igual ao dos kits: +13,38% (acima de R$ 30 mil o desconto cresce pela raiz do preço).
function precoDe(preco: number) {
  const pct = REGRA.de_pct / 100;
  const de = preco <= REGRA.de_lim ? preco * (1 + pct) : preco + pct * REGRA.de_lim * Math.sqrt(preco / REGRA.de_lim);
  return Math.round(de * 100) / 100;
}

const nomeInv = (inv: any) => {
  const kw = Number(inv.potenciaNominalSaida);
  return `${String(inv.fabricante || "").toUpperCase()} ${String(kw).replace(".", ",")}KW`;
};

// ---------------------------------------------------------------- handler
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "Método não permitido" });
  if (!SUPABASE_URL || !SERVICE_ROLE) return json(500, { error: "Configuração ausente" });

  const auth = req.headers.get("Authorization") ?? "";
  const claims = auth.startsWith("Bearer ") ? jwtPayload(auth.slice(7)) : null;
  const userId = String(claims?.sub ?? "");
  if (!userId) return json(401, { error: "Sessão inválida" });

  let body: any;
  try { body = await req.json(); } catch { return json(400, { error: "Pedido inválido" }); }
  const provedor = String(body?.provedor ?? "");
  const acao = String(body?.acao ?? "");
  if (provedor !== "belenus") return json(400, { error: "Integração não disponível" });

  // Conta ativa + papel conferidos no banco (o claim pode estar velho).
  const contas = await rest(`user_accounts?user_id=eq.${userId}&select=role,ativo,franquia_id`).catch(() => []);
  const conta = Array.isArray(contas) ? contas[0] : null;
  if (!conta || conta.ativo === false) return json(403, { error: "Conta inativa" });
  const admin = String(conta.role ?? "").toLowerCase() === "admin";

  const cred = await rest("rpc/integracao_credencial", { method: "POST", body: JSON.stringify({ p_provedor: provedor }) }).catch(() => null);
  if (!cred?.usuario || !cred?.senha) return json(409, { error: "A Belenus ainda não foi conectada (Admin → Distribuidoras)" });

  const bel = new Belenus(cred.usuario, cred.senha);
  if (cred.opcoes?.site) bel.site = String(cred.opcoes.site);

  if (acao === "testar") {
    if (!admin) return json(403, { error: "Apenas administrador" });
    try {
      const info = await bel.login();
      await rest(`distribuidora_integracoes?provedor=eq.${provedor}`, {
        method: "PATCH", body: JSON.stringify({ status: "conectada", testado_em: new Date().toISOString(), ultimo_erro: null }),
      });
      emSegundoPlano(catalogo(bel, provedor, 60 * 60_000)); // conexão conferida: renova o espelho se tiver mais de 1 h
      return json(200, { ok: true, conta: info.nome });
    } catch (err) {
      const msg = String((err as Error).message || err);
      await rest(`distribuidora_integracoes?provedor=eq.${provedor}`, {
        method: "PATCH", body: JSON.stringify({ status: "erro", testado_em: new Date().toISOString(), ultimo_erro: msg }),
      }).catch(() => {});
      return json(200, { ok: false, error: msg });
    }
  }

  if (acao === "opcoes") {
    if (!cred.ativo) return json(409, { error: "A integração com a Belenus está desligada" });
    try {
      return json(200, { ok: true, ...opcoesBelenus(await catalogo(bel, provedor)) });
    } catch (err) {
      return json(200, { ok: false, error: String((err as Error).message || err) });
    }
  }

  if (acao === "cotar") {
    if (!cred.ativo) return json(409, { error: "A integração com a Belenus está desligada" });
    const placas = Math.round(Number(body?.placas));
    if (!Number.isFinite(placas) || placas < 4 || placas > 150) return json(400, { error: "Informe de 4 a 150 placas" });
    const modo = await modoDaUnidade(conta.franquia_id ?? null);
    try {
      const cat = await catalogo(bel, provedor);
      await bel.login();
      const res = await cotarBelenus(bel, cat, placas, {
        ...(cred.opcoes ?? {}), telhado: body?.telhado, tipo: body?.tipo, marca: body?.marca,
        ...(body?.modulo ? { modulo: String(body.modulo), modulo_escolhido: true } : {}),
      });
      // Algum equipamento do espelho falhou (pode ter saído de linha): renova o espelho se tiver mais de 1 h.
      if (res.some((r) => r.erro)) emSegundoPlano(catalogo(bel, provedor, 60 * 60_000));
      if (res.some((r) => !r.erro)) await bel.zerarRecusas();
      const saida: any[] = [];
      for (const r of res) {
        if (r.erro) { saida.push({ erro: r.erro, opcao: r.micro ? "Microinversor" : nomeInv(r.inv) }); continue; }
        let { preco, preco_de } = precificar(r.custo, r.micro);
        let precificacao: any = {modo:'markup', ...REGRA};
        if (modo === 'custos') {
          precificacao = await rest('rpc/cc_preco_dimensionado', {method:'POST', body:JSON.stringify({p_franquia_id:conta.franquia_id ?? null,p_kit:r.custo,p_modulos:placas,p_kwp:r.kwp,p_inversores:r.qtdInv ?? 1,p_kw_inversor:Math.round(Number(r.inv.potenciaNominalSaida) * (r.qtdInv ?? 1) * 1000) / 1000})});
          preco = Number(precificacao.venda);
          if (!Number.isFinite(preco) || preco <= 0) throw new Error('Preço por custos inválido. Revise o centro de custo da unidade.');
          preco_de = precoDe(preco);
        }
        const invNome = r.micro ? `${r.qtdInv}x MICROINVERSOR ${String(r.inv.fabricante).toUpperCase()}` : `INV. ${nomeInv(r.inv)}`;
        const titulo = `KIT ${placas} MOD. ${r.mod.potencia}W + ${invNome}`;
        const [row] = await rest("cotacoes_distribuidora", {
          method: "POST", headers: { Prefer: "return=representation" },
          body: JSON.stringify({
            provedor, distribuidora_id: cred.distribuidora_id, franquia_id: conta.franquia_id ?? null, criado_por: userId,
            categoria: r.micro ? "kitsMicro" : "kitsInversor", placas, kwp: r.kwp, titulo, marca: String(r.mod.fabricante || "").toUpperCase(),
            modulo: { sku: r.mod.item, nome: r.mod.descricaoItem, marca: r.mod.fabricante, potencia_wp: r.mod.potencia, qtd: placas },
            inversor: { sku: r.inv.item, nome: r.inv.descricaoItem, marca: r.inv.fabricante, potencia_wp: Number(r.inv.potenciaNominalSaida) * 1000, qtd: r.qtdInv, micro: r.micro },
            itens: r.itens, custo: r.custo, detalhe_custo: r.detalhe, preco, preco_de, precificacao,
          }),
        });
        saida.push({
          cotacao_id: row.id, titulo, categoria: row.categoria, kwp: r.kwp, placas, marca: row.marca, preco, preco_de,
          inversor: invNome, itens: r.itens, modo_precificacao:modo,
          ...((admin || String(conta.role).toLowerCase() === 'gestor') && modo === 'custos' ? {margem_alvo:precificacao.margem_alvo} : {}),
          ...(admin ? { custo: r.custo, detalhe_custo: r.detalhe } : {}),
        });
      }
      saida.sort((a, b) => (a.erro ? 1 : 0) - (b.erro ? 1 : 0) || (a.preco ?? 0) - (b.preco ?? 0));
      return json(200, { ok: true, kits: saida });
    } catch (err) {
      return json(200, { ok: false, error: String((err as Error).message || err) });
    }
  }

  return json(400, { error: "Ação desconhecida" });
});
