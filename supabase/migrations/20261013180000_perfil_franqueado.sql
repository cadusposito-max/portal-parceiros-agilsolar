-- Perfil Franqueado (13/10/2026): gestor da unidade com acesso extra.
-- No banco o franqueado continua role = 'gestor' (todas as regras de gestor
-- seguem valendo) + user_accounts.franqueado = true. A marca libera, só na
-- unidade dele: ver o DRE e lançar custos/despesas, ler impostos e taxas da
-- Rede (sem editar) e aplicar preço na proposta pela precificação.
-- O centro de custo já é editável por gestor da unidade (cc_pode_franquia).

alter table public.user_accounts add column if not exists franqueado boolean not null default false;

-- Unidade do franqueado logado (null = não é franqueado ativo).
create or replace function public.franqueado_franquia_id()
returns uuid
language sql
stable security definer
set search_path to 'public'
as $$
  select ua.franquia_id
    from public.user_accounts ua
   where ua.user_id = auth.uid()
     and ua.franqueado
     and ua.role = 'gestor'
     and coalesce(ua.ativo, true)
     and ua.franquia_id is not null
$$;

create or replace function public.is_franqueado()
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select public.franqueado_franquia_id() is not null
$$;

create or replace function public.admin_set_user_franqueado(p_user_id uuid, p_franqueado boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform require_admin();
  if coalesce(p_franqueado, false)
     and not exists (select 1 from public.user_accounts where user_id = p_user_id and role = 'gestor') then
    raise exception 'Só um usuário com perfil de gestor pode ser franqueado.';
  end if;
  update public.user_accounts
     set franqueado = coalesce(p_franqueado, false), updated_at = now()
   where user_id = p_user_id;
end $$;

revoke execute on function public.franqueado_franquia_id() from public, anon;
revoke execute on function public.is_franqueado() from public, anon;
revoke execute on function public.admin_set_user_franqueado(uuid, boolean) from public, anon;
grant execute on function public.franqueado_franquia_id() to authenticated;
grant execute on function public.is_franqueado() to authenticated;
grant execute on function public.admin_set_user_franqueado(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------- RLS da Rede
-- rede_empresas já tem leitura para gestor da unidade (rede_empresas_select).
drop policy if exists rede_impostos_franqueado_select on public.rede_impostos;
create policy rede_impostos_franqueado_select on public.rede_impostos for select to authenticated
  using (exists (select 1 from public.rede_empresas e
                  where e.id = rede_impostos.empresa_id
                    and e.franquia_id = public.franqueado_franquia_id()));

drop policy if exists rede_taxas_franqueado_select on public.rede_taxas;
create policy rede_taxas_franqueado_select on public.rede_taxas for select to authenticated
  using (franquia_id = public.franqueado_franquia_id());

drop policy if exists rede_padroes_franqueado_select on public.rede_padroes;
create policy rede_padroes_franqueado_select on public.rede_padroes for select to authenticated
  using (public.is_franqueado());

drop policy if exists rede_lancamentos_franqueado on public.rede_lancamentos;
create policy rede_lancamentos_franqueado on public.rede_lancamentos for all to authenticated
  using (franquia_id = public.franqueado_franquia_id())
  with check (franquia_id = public.franqueado_franquia_id());

drop policy if exists rede_projeto_taxas_franqueado_select on public.rede_projeto_taxas;
create policy rede_projeto_taxas_franqueado_select on public.rede_projeto_taxas for select to authenticated
  using (exists (select 1 from public.eng_projetos ep
                  where ep.id = rede_projeto_taxas.projeto_id
                    and ep.franquia_id = public.franqueado_franquia_id()));

-- ---------------------------------------------------------------- RPCs do DRE
-- Admin vê todas as unidades; franqueado só a dele.
create or replace function public.rede_movimento(p_ate date, p_meses integer default 6, p_dia integer default null::integer)
returns table(franquia_id uuid, mes date, faturamento numeric, vendas integer, propostas integer, valor_propostas numeric, projetos integer)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  v_fim date := (date_trunc('month', p_ate) + interval '1 month')::date;
  v_ini date := (date_trunc('month', p_ate) - make_interval(months => greatest(p_meses, 1) - 1))::date;
  v_fr  uuid;
begin
  if not is_admin() then
    v_fr := franqueado_franquia_id();
    if v_fr is null then
      raise exception 'Acesso restrito ao administrador.' using errcode = '42501';
    end if;
  end if;
  return query
  with meses as (
    select generate_series(v_ini, (v_fim - interval '1 month')::date, interval '1 month')::date as mes
  ), base as (
    select f.id as franquia_id, m.mes from franquias f cross join meses m
    where v_fr is null or f.id = v_fr
  ), v as (
    select vd.franquia_id, date_trunc('month', vd.created_at at time zone 'America/Sao_Paulo')::date as mes,
           sum(coalesce(vd.kit_price, 0)) as fat, count(*)::int as n
    from vendas vd
    where vd.created_at >= (v_ini::timestamp at time zone 'America/Sao_Paulo')
      and vd.created_at < (v_fim::timestamp at time zone 'America/Sao_Paulo')
      and (p_dia is null or extract(day from vd.created_at at time zone 'America/Sao_Paulo') <= p_dia)
    group by 1, 2
  ), p as (
    select pr.franquia_id, date_trunc('month', pr.created_at at time zone 'America/Sao_Paulo')::date as mes,
           count(*)::int as n, sum(coalesce(pr.custom_total_price, pr.kit_price, 0)) as valor
    from propostas pr
    where pr.created_at >= (v_ini::timestamp at time zone 'America/Sao_Paulo')
      and pr.created_at < (v_fim::timestamp at time zone 'America/Sao_Paulo')
      and (p_dia is null or extract(day from pr.created_at at time zone 'America/Sao_Paulo') <= p_dia)
    group by 1, 2
  ), e as (
    select ep.franquia_id, date_trunc('month', ep.created_at at time zone 'America/Sao_Paulo')::date as mes, count(*)::int as n
    from eng_projetos ep
    where ep.status <> 'cancelado'
      and ep.created_at >= (v_ini::timestamp at time zone 'America/Sao_Paulo')
      and ep.created_at < (v_fim::timestamp at time zone 'America/Sao_Paulo')
      and (p_dia is null or extract(day from ep.created_at at time zone 'America/Sao_Paulo') <= p_dia)
    group by 1, 2
  )
  select b.franquia_id, b.mes,
         coalesce(v.fat, 0)::numeric, coalesce(v.n, 0), coalesce(p.n, 0), coalesce(p.valor, 0)::numeric, coalesce(e.n, 0)
  from base b
  left join v on v.franquia_id = b.franquia_id and v.mes = b.mes
  left join p on p.franquia_id = b.franquia_id and p.mes = b.mes
  left join e on e.franquia_id = b.franquia_id and e.mes = b.mes
  order by b.mes, b.franquia_id;
end $function$;

create or replace function public.rede_projetos(p_ate date, p_meses integer default 6, p_dia integer default null::integer)
returns table(id uuid, franquia_id uuid, mes date, numero integer, cliente_nome text, kwp numeric, status text, valor numeric, isento boolean)
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  v_fim date := (date_trunc('month', p_ate) + interval '1 month')::date;
  v_ini date := (date_trunc('month', p_ate) - make_interval(months => greatest(p_meses, 1) - 1))::date;
  v_fr  uuid;
begin
  if not public.is_admin() then
    v_fr := public.franqueado_franquia_id();
    if v_fr is null then
      raise exception 'Acesso restrito ao administrador.' using errcode = '42501';
    end if;
  end if;
  return query
  select ep.id, ep.franquia_id, date_trunc('month', ep.created_at at time zone 'America/Sao_Paulo')::date,
         ep.numero, ep.cliente_nome, ep.kwp, ep.status, a.valor, coalesce(a.isento, false)
  from public.eng_projetos ep
  left join public.rede_projeto_taxas a on a.projeto_id = ep.id
  where ep.status <> 'cancelado'
    and (v_fr is null or ep.franquia_id = v_fr)
    and ep.created_at >= (v_ini::timestamp at time zone 'America/Sao_Paulo')
    and ep.created_at < (v_fim::timestamp at time zone 'America/Sao_Paulo')
    and (p_dia is null or extract(day from ep.created_at at time zone 'America/Sao_Paulo') <= p_dia)
  order by ep.created_at;
end $function$;

-- ---------------------------------------------------------------- Aplicar preço
-- Admin em qualquer proposta; franqueado só nas propostas da unidade dele.
create or replace function public.aplicar_preco_proposta(p_proposta_id uuid, p_valor numeric)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_p     public.propostas%rowtype;
  v_novo  numeric := round(p_valor, 2);
  v_velho numeric;
  v_pers  boolean;
  v_itens numeric;
  v_autor text := lower(coalesce(auth.jwt() ->> 'email', 'admin'));
  v_admin boolean := public.is_admin();
  v_fr    uuid := public.franqueado_franquia_id();
begin
  if not v_admin and v_fr is null then
    raise exception 'Apenas administradores e franqueados podem alterar o preço pela precificação' using errcode = '42501';
  end if;
  if v_novo is null or v_novo <= 0 then
    raise exception 'Informe um valor de venda maior que zero';
  end if;

  select * into v_p from public.propostas where id = p_proposta_id for update;
  if not found then
    raise exception 'Proposta não encontrada';
  end if;
  if not v_admin and v_p.franquia_id is distinct from v_fr then
    raise exception 'Esta proposta é de outra unidade' using errcode = '42501';
  end if;
  if exists (select 1 from public.vendas where proposta_id = p_proposta_id) then
    raise exception 'Esta proposta já virou venda: o preço não pode mais ser alterado por aqui';
  end if;

  v_pers  := v_p.proposal_mode in ('PERSONALIZADA', 'EQUIPAMENTOS');
  v_velho := case when v_pers then coalesce(v_p.custom_total_price, v_p.kit_price) else v_p.kit_price end;
  if v_velho is not distinct from v_novo then
    return jsonb_build_object('alterado', false, 'valor', v_novo);
  end if;

  if v_pers then
    v_itens := coalesce((v_p.custom_totals ->> 'total_itens')::numeric, (v_p.custom_totals ->> 'total')::numeric, v_velho);
    update public.propostas
       set kit_price          = v_novo,
           kit_list_price     = v_novo,
           custom_total_price = v_novo,
           custom_totals      = coalesce(custom_totals, '{}'::jsonb) || jsonb_build_object(
                                  'total', v_novo,
                                  'total_itens', v_itens,
                                  'ajuste_admin', round(v_novo - v_itens, 2))
     where id = p_proposta_id;
  else
    update public.propostas
       set kit_price      = v_novo,
           kit_list_price = greatest(coalesce(kit_list_price, v_novo), v_novo)
     where id = p_proposta_id;
  end if;

  if v_p.cliente_id is not null then
    insert into public.crm_atividades (cliente_id, franquia_id, autor_email, tipo, descricao, meta)
    values (v_p.cliente_id, v_p.franquia_id, v_autor, 'proposta',
            'Preço da proposta ' || coalesce(v_p.numero::text || ' ', '') || 'alterado de R$ '
              || translate(to_char(coalesce(v_velho, 0), 'FM999,999,990.00'), ',.', '.,') || ' para R$ ' || translate(to_char(v_novo, 'FM999,999,990.00'), ',.', '.,')
              || ' pela precificação interna',
            jsonb_build_object('proposta_id', p_proposta_id, 'evento', 'preco_alterado',
                               'de', v_velho, 'para', v_novo));
  end if;

  return jsonb_build_object('alterado', true, 'de', v_velho, 'valor', v_novo);
end $function$;
