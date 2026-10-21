-- ==========================================================================
-- Obras (aba Obras do Comercial)
--
-- Só admin, gestor e franqueado (franqueado = gestor + user_accounts.franqueado).
-- A obra é a venda: os dados ficam em venda_posvenda (a mesma linha que a aba
-- Vendas já lê para a etapa Obra/Monitoramento), mais:
--   1. obra_equipes: equipes de instalação de cada unidade.
--   2. venda_posvenda: agenda (dias, equipe, recado, confirmação), entrega do
--      kit quando não há ordem de compra, lista da elétrica e troca do medidor.
--   3. eng_projetos.prioridade: pedido de "passar na frente" para a engenharia.
--   4. RPCs: obras_listar, obra_salvar, obra_kit, obra_equipe_salvar,
--      obra_pedir_prioridade e eng_prioridade_recusar (engenharia central).
-- Tudo aditivo.
-- ==========================================================================

-- ---------------------------------------------------------------- 1. equipes
create table if not exists public.obra_equipes (
  id uuid primary key default gen_random_uuid(),
  franquia_id uuid not null references public.franquias(id) on delete cascade,
  nome text not null check (length(trim(nome)) between 1 and 60),
  integrantes text,
  terceirizada boolean not null default false,
  ativa boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists obra_equipes_franquia on public.obra_equipes (franquia_id);

alter table public.obra_equipes enable row level security;
drop policy if exists obra_equipes_select on public.obra_equipes;
create policy obra_equipes_select on public.obra_equipes
  for select to authenticated
  using (public.is_admin() or (public.is_gestor() and franquia_id = public.get_franquia_id()));
grant select on public.obra_equipes to authenticated;

-- ---------------------------------------------------------------- 2. obra
alter table public.venda_posvenda
  add column if not exists obra_dias smallint not null default 1 check (obra_dias between 1 and 15),
  add column if not exists obra_equipe_id uuid references public.obra_equipes(id) on delete set null,
  add column if not exists obra_recado text,
  add column if not exists obra_confirmada boolean,
  add column if not exists obra_concluida_em date,
  add column if not exists kit_previsao date,
  add column if not exists kit_entregue_em date,
  add column if not exists kit_entrega_local text check (kit_entrega_local in ('unidade', 'obra')),
  add column if not exists kit_obs text,
  add column if not exists eletrica_status text check (eletrica_status in ('a_comprar', 'comprada', 'separada')),
  add column if not exists eletrica_itens jsonb not null default '[]'::jsonb,
  add column if not exists eletrica_fornecedor text,
  add column if not exists eletrica_total numeric,
  add column if not exists eletrica_conferida_em timestamptz,
  add column if not exists medidor_status text check (medidor_status in ('aguardando', 'trocado'));

-- ------------------------------------------------------- 3. prioridade (eng)
-- {status: pedida|recusada|atendida, motivo, texto, por, em, resposta, resp_por, resp_em, atendida_em}
alter table public.eng_projetos add column if not exists prioridade jsonb;

-- ---------------------------------------------------------------- helpers
create or replace function public.obra_pode(p_franquia uuid)
 returns boolean
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select public.is_admin() or (public.is_gestor() and p_franquia is not distinct from public.get_franquia_id());
$function$;

create or replace function public.obra_nome_atual()
 returns text
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select coalesce(nullif(trim(ua.nome), ''), auth.jwt() ->> 'email', 'sistema')
  from (select 1) x left join public.user_accounts ua on ua.user_id = auth.uid();
$function$;

-- projeto da engenharia da venda (1 card = 1 projeto: vale o do cliente)
create or replace function public.obra_eng_projeto(p_venda uuid)
 returns uuid
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select e.id from public.vendas v
  join public.eng_projetos e on e.status <> 'cancelado' and (e.venda_id = v.id or (v.cliente_id is not null and e.cliente_id = v.cliente_id))
  where v.id = p_venda
  order by (e.venda_id = v.id) desc nulls last, e.created_at desc
  limit 1;
$function$;

-- --------------------------------------------------------- 4a. listar obras
-- Uma linha por venda da unidade (admin: todas). Concluídas há mais de 60 dias saem.
create or replace function public.obras_listar()
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
declare v jsonb;
begin
  if not (public.is_admin() or public.is_gestor()) then
    raise exception 'Só admin, gestor e franqueado acessam as obras.' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'venda_id', ve.id, 'franquia_id', ve.franquia_id, 'venda_em', ve.created_at,
      'cliente_id', ve.cliente_id, 'cliente_nome', coalesce(nullif(trim(cl.nome), ''), ve.cliente_nome),
      'telefone', coalesce(cl.telefone, ve.cliente_telefone), 'cidade', cl.cidade, 'uf', cl.uf,
      'endereco', concat_ws(', ', nullif(trim(cl.endereco), ''), nullif(trim(cl.numero), ''), nullif(trim(cl.bairro), '')),
      'vendedor', coalesce(nullif(trim(ve.vendedor_nome), ''), ve.vendedor_email),
      'kit_nome', ve.kit_nome, 'kit_brand', ve.kit_brand, 'kwp', ve.kit_power, 'valor', ve.kit_price,
      'fin_projeto_id', fp.id,
      'pos', to_jsonb(pv) - 'venda_id' - 'franquia_id',
      'equipe', case when eq.id is null then null else jsonb_build_object('id', eq.id, 'nome', eq.nome, 'terceirizada', eq.terceirizada) end,
      'oc', case when oc.id is null then null else jsonb_build_object('id', oc.id, 'status', oc.status, 'fornecedor', oc.fornecedor,
        'codigo', oc.codigo, 'valor', oc.valor, 'previsao', oc.previsao_entrega, 'entregue_em', oc.entregue_em) end,
      'eng', case when ep.id is null then null else jsonb_build_object('id', ep.id, 'numero', ep.numero, 'status', ep.status,
        'desde', ep.status_desde, 'prioridade', ep.prioridade, 'telhado', ep.snapshot -> 'instalacao' ->> 'telhado',
        'distancia_m', ep.snapshot -> 'instalacao' ->> 'distancia_m', 'ligacao', ep.snapshot -> 'instalacao' ->> 'tipo_ligacao') end,
      'os', case when os.id is null then null else jsonb_build_object('id', os.id, 'numero', os.numero, 'revisao', os.revisao,
        'em', os.created_at, 'por', os.created_by_nome, 'equipe', os.equipe,
        'protecoes', os.dados -> 'dim' -> 'protecoes', 'distribution', os.dados -> 'dim' -> 'distribution',
        'inversores', os.dados -> 'dim' -> 'inversores', 'micro', os.dados -> 'dim' -> 'micro',
        'distancia_m', os.dados -> 'snapshot' -> 'instalacao' ->> 'distancia_m') end
    ) order by ve.created_at desc), '[]'::jsonb) into v
  from public.vendas ve
  left join public.clientes cl on cl.id = ve.cliente_id
  left join public.venda_posvenda pv on pv.venda_id = ve.id
  left join public.obra_equipes eq on eq.id = pv.obra_equipe_id
  left join lateral (select f.id from public.fin_projetos f where f.venda_id = ve.id order by f.created_at desc limit 1) fp on true
  left join lateral (select o.* from public.fin_ordens_compra o where o.fin_projeto_id = fp.id and o.status <> 'reprovado' order by o.created_at desc limit 1) oc on true
  left join lateral (select e.* from public.eng_projetos e where e.id = public.obra_eng_projeto(ve.id)) ep on true
  left join lateral (select o.* from public.eng_os o where o.projeto_id = ep.id and o.ativa order by o.revisao desc limit 1) os on true
  where (public.is_admin() or ve.franquia_id = public.get_franquia_id())
    and not coalesce(pv.obra_status = 'concluida' and coalesce(pv.obra_concluida_em, pv.obra_data, pv.updated_at::date) < current_date - 60, false);
  return v;
end $function$;

-- --------------------------------------------------------- 4b. salvar obra
-- Só os campos enviados mudam. A timeline do cliente recebe o "de → para".
create or replace function public.obra_salvar(p_venda_id uuid, p_dados jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v public.vendas%rowtype;
  antes public.venda_posvenda%rowtype;
  depois public.venda_posvenda%rowtype;
  v_eq public.obra_equipes%rowtype;
  v_fp uuid; v_eng uuid; v_custo uuid;
  campos text[] := array['obra_status','obra_data','obra_dias','obra_equipe','obra_recado','obra_confirmada','obra_concluida_em',
                         'kit_entrega_local','eletrica_status','eletrica_fornecedor','eletrica_total','medidor_status','mon_status'];
  rot jsonb := '{"obra_status":"Obra","obra_data":"Data da instalação","obra_dias":"Duração (dias)","obra_equipe":"Equipe","obra_recado":"Recado para a equipe","obra_confirmada":"Confirmado com o cliente","obra_concluida_em":"Concluída em","kit_entrega_local":"Entrega do kit","eletrica_status":"Elétrica","eletrica_fornecedor":"Fornecedor da elétrica","eletrica_total":"Total da elétrica","medidor_status":"Medidor","mon_status":"Monitoramento"}';
  nomes jsonb := '{"a_agendar":"A agendar","agendada":"Agendada","em_andamento":"Em andamento","concluida":"Concluída","unidade":"Na unidade","obra":"Direto na obra","a_comprar":"A comprar","comprada":"Comprada","separada":"Separada para a equipe","aguardando":"Aguardando troca","trocado":"Trocado","pendente":"Configurar","ativo":"Monitorando","alerta":"Sem comunicar","true":"Sim","false":"Não"}';
  c text; de text; para text; mudancas text[] := '{}';
  v_status text;
begin
  select * into v from public.vendas where id = p_venda_id;
  if not found then raise exception 'Venda não encontrada.'; end if;
  if not public.obra_pode(v.franquia_id) then
    raise exception 'Só admin, gestor e franqueado da unidade mexem na obra.' using errcode = '42501';
  end if;
  if p_dados ? 'eletrica_itens' and jsonb_typeof(p_dados -> 'eletrica_itens') <> 'array' then
    raise exception 'Lista da elétrica inválida.';
  end if;
  if p_dados ? 'obra_equipe_id' and nullif(p_dados ->> 'obra_equipe_id', '') is not null then
    select * into v_eq from public.obra_equipes where id = (p_dados ->> 'obra_equipe_id')::uuid;
    if not found or v_eq.franquia_id is distinct from v.franquia_id then raise exception 'Equipe não encontrada nesta unidade.'; end if;
  end if;

  select * into antes from public.venda_posvenda where venda_id = v.id;
  insert into public.venda_posvenda (venda_id, franquia_id) values (v.id, v.franquia_id) on conflict (venda_id) do nothing;

  v_status := case when p_dados ? 'obra_status' then nullif(p_dados ->> 'obra_status', '') else antes.obra_status end;
  if v_status = 'agendada' and (case when p_dados ? 'obra_data' then nullif(p_dados ->> 'obra_data', '')::date else antes.obra_data end) is null then
    raise exception 'Informe a data da instalação.';
  end if;

  update public.venda_posvenda set
    obra_status = v_status,
    obra_data = case when p_dados ? 'obra_data' then nullif(p_dados ->> 'obra_data', '')::date else obra_data end,
    obra_dias = case when p_dados ? 'obra_dias' then greatest(1, least(15, coalesce(nullif(p_dados ->> 'obra_dias', '')::int, 1))) else obra_dias end,
    obra_equipe_id = case when p_dados ? 'obra_equipe_id' then nullif(p_dados ->> 'obra_equipe_id', '')::uuid else obra_equipe_id end,
    obra_equipe = case when p_dados ? 'obra_equipe_id' then v_eq.nome else obra_equipe end,
    obra_recado = case when p_dados ? 'obra_recado' then nullif(trim(p_dados ->> 'obra_recado'), '') else obra_recado end,
    obra_confirmada = case when p_dados ? 'obra_confirmada' then nullif(p_dados ->> 'obra_confirmada', '')::boolean else obra_confirmada end,
    obra_concluida_em = case
      when v_status = 'concluida' then coalesce(nullif(p_dados ->> 'obra_concluida_em', '')::date, obra_concluida_em, current_date)
      else null end,
    kit_entrega_local = case when p_dados ? 'kit_entrega_local' then nullif(p_dados ->> 'kit_entrega_local', '') else kit_entrega_local end,
    eletrica_status = case when p_dados ? 'eletrica_status' then nullif(p_dados ->> 'eletrica_status', '') else eletrica_status end,
    eletrica_itens = case when p_dados ? 'eletrica_itens' then p_dados -> 'eletrica_itens' else eletrica_itens end,
    eletrica_fornecedor = case when p_dados ? 'eletrica_fornecedor' then nullif(trim(p_dados ->> 'eletrica_fornecedor'), '') else eletrica_fornecedor end,
    eletrica_total = case when p_dados ? 'eletrica_total' then round(nullif(p_dados ->> 'eletrica_total', '')::numeric, 2) else eletrica_total end,
    eletrica_conferida_em = case when (p_dados ->> 'eletrica_conferida')::boolean is true then now() else eletrica_conferida_em end,
    medidor_status = case when p_dados ? 'medidor_status' then nullif(p_dados ->> 'medidor_status', '') else medidor_status end,
    mon_status = case when p_dados ? 'mon_status' then nullif(p_dados ->> 'mon_status', '') else mon_status end,
    updated_by = coalesce(auth.jwt() ->> 'email', 'sistema'),
    updated_at = now()
  where venda_id = v.id
  returning * into depois;

  foreach c in array campos loop
    de := to_jsonb(antes) ->> c;
    para := to_jsonb(depois) ->> c;
    if de is distinct from para then
      if c in ('obra_data', 'obra_concluida_em') then
        de := to_char(de::date, 'DD/MM/YYYY'); para := to_char(para::date, 'DD/MM/YYYY');
      elsif c = 'eletrica_total' then
        de := 'R$ ' || replace(to_char(de::numeric, 'FM999G990D00'), '.', ','); para := 'R$ ' || replace(to_char(para::numeric, 'FM999G990D00'), '.', ',');
      end if;
      mudancas := mudancas || format('%s: %s → %s', rot ->> c, coalesce(nomes ->> de, de, '—'), coalesce(nomes ->> para, para, '—'));
    end if;
  end loop;
  if (p_dados ->> 'eletrica_conferida')::boolean is true then
    mudancas := mudancas || coalesce(nullif(trim(p_dados ->> 'conferencia_texto'), ''), 'Elétrica conferida');
  end if;

  if v.cliente_id is not null and array_length(mudancas, 1) > 0 then
    insert into public.crm_atividades (cliente_id, franquia_id, autor_email, tipo, descricao, meta)
    values (v.cliente_id, v.franquia_id, coalesce(auth.jwt() ->> 'email', 'sistema'), 'venda',
      array_to_string(mudancas, ' · '), jsonb_build_object('acao', 'obra', 'venda_id', v.id));
  end if;

  -- custo da elétrica no projeto financeiro (entra no resultado/DRE)
  if depois.eletrica_status is distinct from antes.eletrica_status or depois.eletrica_total is distinct from antes.eletrica_total then
    select f.id into v_fp from public.fin_projetos f where f.venda_id = v.id order by f.created_at desc limit 1;
    if v_fp is not null then
      select id into v_custo from public.fin_custos where fin_projeto_id = v_fp and categoria = 'Material elétrico' limit 1;
      if v_custo is null and coalesce(depois.eletrica_total, 0) > 0 then
        insert into public.fin_custos (fin_projeto_id, franquia_id, categoria, previsto, realizado)
        values (v_fp, v.franquia_id, 'Material elétrico', depois.eletrica_total,
          case when depois.eletrica_status in ('comprada', 'separada') then depois.eletrica_total else 0 end);
      elsif v_custo is not null then
        update public.fin_custos set previsto = coalesce(depois.eletrica_total, 0),
          realizado = case when depois.eletrica_status in ('comprada', 'separada') then coalesce(depois.eletrica_total, 0) else 0 end,
          updated_at = now()
        where id = v_custo;
      end if;
    end if;
  end if;

  -- obra concluída: a engenharia fica sabendo (é a hora de pedir a vistoria)
  if depois.obra_status = 'concluida' and antes.obra_status is distinct from 'concluida' then
    v_eng := public.obra_eng_projeto(v.id);
    if v_eng is not null then
      update public.eng_projetos set alerta = true, updated_at = now() where id = v_eng;
      perform public.eng_log(v_eng, 'alerta', 'Obra concluída em ' || to_char(depois.obra_concluida_em, 'DD/MM/YYYY') || ' pela franquia · pode solicitar a vistoria');
    end if;
  end if;

  return to_jsonb(depois) - 'franquia_id';
end $function$;

-- ----------------------------------------------------- 4c. entrega do kit
-- Com ordem de compra no Financeiro, a previsão e a entrega vão para ela (a
-- unidade sem acesso ao Financeiro também consegue registrar). Sem ordem,
-- ficam em venda_posvenda. p_dados: previsao, entregue_em ('' desfaz), local, obs.
create or replace function public.obra_kit(p_venda_id uuid, p_dados jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v public.vendas%rowtype; oc public.fin_ordens_compra%rowtype; antes public.venda_posvenda%rowtype;
  v_fp uuid; mudancas text[] := '{}'; v_de date; v_para date;
begin
  select * into v from public.vendas where id = p_venda_id;
  if not found then raise exception 'Venda não encontrada.'; end if;
  if not public.obra_pode(v.franquia_id) then
    raise exception 'Só admin, gestor e franqueado da unidade mexem na obra.' using errcode = '42501';
  end if;
  select f.id into v_fp from public.fin_projetos f where f.venda_id = v.id order by f.created_at desc limit 1;
  select * into oc from public.fin_ordens_compra o where o.fin_projeto_id = v_fp and o.status <> 'reprovado' order by o.created_at desc limit 1;
  select * into antes from public.venda_posvenda where venda_id = v.id;
  insert into public.venda_posvenda (venda_id, franquia_id) values (v.id, v.franquia_id) on conflict (venda_id) do nothing;

  if p_dados ? 'previsao' then
    v_para := nullif(p_dados ->> 'previsao', '')::date;
    if oc.id is not null then
      v_de := oc.previsao_entrega;
      update public.fin_ordens_compra set previsao_entrega = v_para, updated_at = now() where id = oc.id;
    else
      v_de := antes.kit_previsao;
      update public.venda_posvenda set kit_previsao = v_para where venda_id = v.id;
    end if;
    if v_de is distinct from v_para then
      mudancas := mudancas || format('Previsão do kit: %s → %s', coalesce(to_char(v_de, 'DD/MM/YYYY'), '—'), coalesce(to_char(v_para, 'DD/MM/YYYY'), '—'));
    end if;
  end if;

  if p_dados ? 'entregue_em' then
    v_para := nullif(p_dados ->> 'entregue_em', '')::date;
    if oc.id is not null then
      v_de := case when oc.status = 'entregue' then coalesce(oc.entregue_em, oc.updated_at::date) end;
      update public.fin_ordens_compra
         set status = case when v_para is not null then 'entregue' when status = 'entregue' then 'comprado' else status end,
             entregue_em = v_para, updated_at = now()
       where id = oc.id;
      if v_para is not null then update public.fin_projetos set etapa = greatest(etapa, 6) where id = v_fp; end if;
    else
      v_de := antes.kit_entregue_em;
      update public.venda_posvenda set kit_entregue_em = v_para where venda_id = v.id;
    end if;
    if v_de is distinct from v_para then
      mudancas := mudancas || format('Kit entregue: %s → %s', coalesce(to_char(v_de, 'DD/MM/YYYY'), 'não'), coalesce(to_char(v_para, 'DD/MM/YYYY'), 'não'));
    end if;
  end if;

  if p_dados ? 'local' then
    update public.venda_posvenda set kit_entrega_local = nullif(p_dados ->> 'local', '') where venda_id = v.id;
    if antes.kit_entrega_local is distinct from nullif(p_dados ->> 'local', '') then
      mudancas := mudancas || format('Entrega do kit: %s → %s',
        coalesce(case antes.kit_entrega_local when 'unidade' then 'Na unidade' when 'obra' then 'Direto na obra' end, '—'),
        coalesce(case p_dados ->> 'local' when 'unidade' then 'Na unidade' when 'obra' then 'Direto na obra' end, '—'));
    end if;
  end if;
  if p_dados ? 'obs' then
    update public.venda_posvenda set kit_obs = nullif(trim(p_dados ->> 'obs'), '') where venda_id = v.id;
    if antes.kit_obs is distinct from nullif(trim(p_dados ->> 'obs'), '') then
      mudancas := mudancas || format('Recebimento do kit: %s → %s', coalesce(antes.kit_obs, '—'), coalesce(nullif(trim(p_dados ->> 'obs'), ''), '—'));
    end if;
  end if;
  update public.venda_posvenda set updated_by = coalesce(auth.jwt() ->> 'email', 'sistema'), updated_at = now() where venda_id = v.id;

  if v.cliente_id is not null and array_length(mudancas, 1) > 0 then
    insert into public.crm_atividades (cliente_id, franquia_id, autor_email, tipo, descricao, meta)
    values (v.cliente_id, v.franquia_id, coalesce(auth.jwt() ->> 'email', 'sistema'), 'venda',
      array_to_string(mudancas, ' · '), jsonb_build_object('acao', 'obra', 'venda_id', v.id));
  end if;
  return jsonb_build_object('ok', true);
end $function$;

-- --------------------------------------------------------- 4d. equipes
create or replace function public.obra_equipe_salvar(p_id uuid, p_dados jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare e public.obra_equipes%rowtype; v_fr uuid;
begin
  if p_id is null then
    v_fr := coalesce(case when public.is_admin() then nullif(p_dados ->> 'franquia_id', '')::uuid end, public.get_franquia_id());
    if v_fr is null or not public.obra_pode(v_fr) then raise exception 'Sem acesso às equipes desta unidade.' using errcode = '42501'; end if;
    if nullif(trim(p_dados ->> 'nome'), '') is null then raise exception 'Informe o nome da equipe.'; end if;
    insert into public.obra_equipes (franquia_id, nome, integrantes, terceirizada)
    values (v_fr, trim(p_dados ->> 'nome'), nullif(trim(p_dados ->> 'integrantes'), ''), coalesce((p_dados ->> 'terceirizada')::boolean, false))
    returning * into e;
  else
    select * into e from public.obra_equipes where id = p_id;
    if not found then raise exception 'Equipe não encontrada.'; end if;
    if not public.obra_pode(e.franquia_id) then raise exception 'Sem acesso às equipes desta unidade.' using errcode = '42501'; end if;
    update public.obra_equipes set
      nome = case when p_dados ? 'nome' then coalesce(nullif(trim(p_dados ->> 'nome'), ''), nome) else nome end,
      integrantes = case when p_dados ? 'integrantes' then nullif(trim(p_dados ->> 'integrantes'), '') else integrantes end,
      terceirizada = case when p_dados ? 'terceirizada' then coalesce((p_dados ->> 'terceirizada')::boolean, false) else terceirizada end,
      ativa = case when p_dados ? 'ativa' then coalesce((p_dados ->> 'ativa')::boolean, true) else ativa end
    where id = p_id returning * into e;
    -- o nome também fica na obra (a aba Vendas mostra a equipe por ele)
    update public.venda_posvenda set obra_equipe = e.nome where obra_equipe_id = e.id and obra_equipe is distinct from e.nome;
  end if;
  return to_jsonb(e);
end $function$;

-- --------------------------------------------- 4e. passar na frente (OS)
create or replace function public.obra_pedir_prioridade(p_venda_id uuid, p_motivo text, p_texto text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v public.vendas%rowtype; p public.eng_projetos%rowtype; v_fr text; u uuid; v_txt text;
begin
  select * into v from public.vendas where id = p_venda_id;
  if not found then raise exception 'Venda não encontrada.'; end if;
  if not public.obra_pode(v.franquia_id) then
    raise exception 'Só admin, gestor e franqueado da unidade pedem prioridade.' using errcode = '42501';
  end if;
  select * into p from public.eng_projetos where id = public.obra_eng_projeto(v.id);
  if not found then raise exception 'Este cliente ainda não foi enviado à engenharia.'; end if;
  if exists (select 1 from public.eng_os where projeto_id = p.id and ativa) then raise exception 'A OS desta obra já foi emitida.'; end if;
  if p.prioridade ->> 'status' = 'pedida' then raise exception 'Já existe um pedido aguardando a engenharia.'; end if;
  if nullif(trim(p_motivo), '') is null then raise exception 'Escolha o motivo.'; end if;

  v_txt := concat_ws(' · ', trim(p_motivo), nullif(trim(p_texto), ''));
  update public.eng_projetos set
    prioridade = jsonb_build_object('status', 'pedida', 'motivo', trim(p_motivo), 'texto', nullif(trim(p_texto), ''),
      'por', public.obra_nome_atual(), 'por_email', auth.jwt() ->> 'email', 'em', now()),
    alerta = true, updated_at = now()
  where id = p.id;
  perform public.eng_log(p.id, 'alerta', 'Prioridade pedida pela franquia: ' || v_txt);
  if v.cliente_id is not null then
    insert into public.crm_atividades (cliente_id, franquia_id, autor_email, tipo, descricao, meta)
    values (v.cliente_id, v.franquia_id, coalesce(auth.jwt() ->> 'email', 'sistema'), 'venda',
      'Pedido à engenharia para passar na frente: ' || v_txt, jsonb_build_object('acao', 'obra', 'venda_id', v.id));
  end if;
  select nome into v_fr from public.franquias where id = p.franquia_id;
  for u in select public.notif_eng_central() loop
    perform public.notificar(u, 'eng_enviado', 'Prioridade pedida: ' || coalesce(nullif(trim(p.cliente_nome), ''), 'cliente'),
      concat_ws(' · ', v_fr, v_txt), jsonb_build_object('tela', 'eng', 'id', p.id, 'cliente', p.cliente_id),
      'engp:' || p.id::text, false);
  end loop;
  return jsonb_build_object('ok', true);
end $function$;

-- engenharia central recusa o pedido (aceitar = gerar a OS)
create or replace function public.eng_prioridade_recusar(p_id uuid, p_texto text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare p public.eng_projetos%rowtype;
begin
  perform public.eng_exigir_central();
  select * into p from public.eng_projetos where id = p_id;
  if not found then raise exception 'Projeto não encontrado.'; end if;
  if coalesce(p.prioridade ->> 'status', '') <> 'pedida' then raise exception 'Não há pedido de prioridade aberto.'; end if;
  if nullif(trim(p_texto), '') is null then raise exception 'Explique o motivo para a franquia.'; end if;
  update public.eng_projetos set
    prioridade = p.prioridade || jsonb_build_object('status', 'recusada', 'resposta', trim(p_texto), 'resp_por', public.eng_nome_atual(), 'resp_em', now()),
    updated_at = now()
  where id = p_id;
  perform public.eng_log(p_id, 'comentario', 'Pedido de prioridade recusado: ' || trim(p_texto));
  perform public.eng_log_cliente(p_id, 'Engenharia recusou passar na frente: ' || trim(p_texto));
  return jsonb_build_object('ok', true);
end $function$;

-- OS gerada com o pedido aberto: o pedido foi atendido (a OS fica "antecipada")
create or replace function public.obra_trg_os_prioridade()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  update public.eng_projetos
     set prioridade = prioridade || jsonb_build_object('status', 'atendida', 'atendida_em', now())
   where id = new.projeto_id and prioridade ->> 'status' = 'pedida';
  return new;
end $function$;

drop trigger if exists trg_eng_os_prioridade on public.eng_os;
create trigger trg_eng_os_prioridade after insert on public.eng_os
  for each row execute function public.obra_trg_os_prioridade();

-- ---------------------------------------------------------------- grants
revoke all on function public.obra_pode(uuid), public.obra_nome_atual(), public.obra_eng_projeto(uuid),
  public.obra_trg_os_prioridade() from public, anon;
grant execute on function public.obras_listar(), public.obra_salvar(uuid, jsonb), public.obra_kit(uuid, jsonb),
  public.obra_equipe_salvar(uuid, jsonb), public.obra_pedir_prioridade(uuid, text, text),
  public.eng_prioridade_recusar(uuid, text) to authenticated;
grant execute on function public.obra_pode(uuid), public.obra_nome_atual(), public.obra_eng_projeto(uuid) to authenticated;
