-- Taxa de projetos da engenharia por faixa de kWp (tabela da engenharia, ago/2024).
-- Padrão da rede em rede_padroes; cada unidade liga/desliga a cobrança e pode ter
-- tabela própria. Ajuste ou isenção de um projeto fica em rede_projeto_taxas.
-- Faixa: [{"ate": 3, "valor": 300}, ...] com "ate" crescente; o limite entra na
-- faixa de baixo e acima da última faixa o valor é "a combinar".

create function private.projeto_faixas_validas(p jsonb)
returns boolean language sql immutable security invoker set search_path = '' as $$
  select jsonb_typeof(p) = 'array' and jsonb_array_length(p) between 1 and 20
    and not exists (
      select 1 from jsonb_array_elements(p) with ordinality as f(item, i)
      where jsonb_typeof(f.item) <> 'object'
         or jsonb_typeof(f.item -> 'ate') <> 'number' or jsonb_typeof(f.item -> 'valor') <> 'number'
         or (f.item ->> 'ate')::numeric <= 0 or (f.item ->> 'valor')::numeric < 0
         or (f.i > 1 and (f.item ->> 'ate')::numeric <= (p -> (f.i::int - 2) ->> 'ate')::numeric)
    );
$$;
revoke all on function private.projeto_faixas_validas(jsonb) from public, anon;
grant execute on function private.projeto_faixas_validas(jsonb) to authenticated, service_role;

alter table public.rede_padroes add column projeto_faixas jsonb not null
  default '[{"ate":3,"valor":300},{"ate":4.9,"valor":420},{"ate":10,"valor":580},{"ate":20,"valor":880},{"ate":30,"valor":1200},{"ate":75,"valor":1600}]'::jsonb
  constraint rede_padroes_projeto_faixas_validas check (private.projeto_faixas_validas(projeto_faixas));
comment on column public.rede_padroes.projeto_faixas is 'Valor do projeto de engenharia por faixa de kWp (até X kWp = R$). Acima da última faixa: a combinar.';

alter table public.rede_taxas
  add column projeto_cobrar boolean not null default true,
  add column projeto_faixas jsonb
    constraint rede_taxas_projeto_faixas_validas check (projeto_faixas is null or private.projeto_faixas_validas(projeto_faixas));
comment on column public.rede_taxas.projeto_cobrar is 'Se a unidade paga os projetos de engenharia (entra no DRE e na receita da franqueadora).';
comment on column public.rede_taxas.projeto_faixas is 'Tabela própria da unidade; nula = usa rede_padroes.projeto_faixas.';

-- franquias começam cobrando; unidade própria (Matriz) começa sem cobrança
update public.rede_taxas t set projeto_cobrar = (f.tipo is distinct from 'propria')
  from public.franquias f where f.id = t.franquia_id;

create or replace function public.rede_taxas_da_nova_unidade()
returns trigger language plpgsql security definer set search_path = 'public' as $function$
begin
  insert into rede_taxas (franquia_id, royalties_pct, royalties_base, royalties_minimo, publicidade_pct, rebate_pct,
                          projeto_valor, mensalidade, equipamentos_pct, custo_equip_pct, custo_serv_pct, comissao_pct, projeto_cobrar)
  select new.id, p.royalties_pct, p.royalties_base, p.royalties_minimo, p.publicidade_pct, p.rebate_pct,
         p.projeto_valor, p.mensalidade, p.equipamentos_pct, p.custo_equip_pct, p.custo_serv_pct, p.comissao_pct,
         new.tipo is distinct from 'propria'
  from rede_padroes p where p.id = 1
  on conflict (franquia_id) do nothing;
  return new;
end $function$;

-- ajuste manual por projeto: valor nulo = usa a faixa; isento = não cobra
create table public.rede_projeto_taxas (
  projeto_id uuid primary key references public.eng_projetos(id) on delete cascade,
  valor numeric(12,2) check (valor is null or valor >= 0),
  isento boolean not null default false,
  updated_by text,
  updated_at timestamptz not null default now()
);
comment on table public.rede_projeto_taxas is 'Ajuste do admin na taxa de um projeto de engenharia (valor combinado ou isenção).';
alter table public.rede_projeto_taxas enable row level security;
create policy rede_projeto_taxas_admin on public.rede_projeto_taxas for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.rede_projeto_taxas to authenticated;

-- projetos do período com kWp e ajuste, mesmo recorte de rede_movimento
create function public.rede_projetos(p_ate date, p_meses integer default 6, p_dia integer default null)
returns table(id uuid, franquia_id uuid, mes date, numero integer, cliente_nome text, kwp numeric, status text, valor numeric, isento boolean)
language plpgsql stable security definer set search_path = '' as $function$
declare
  v_fim date := (date_trunc('month', p_ate) + interval '1 month')::date;
  v_ini date := (date_trunc('month', p_ate) - make_interval(months => greatest(p_meses, 1) - 1))::date;
begin
  if not public.is_admin() then
    raise exception 'Acesso restrito ao administrador.' using errcode = '42501';
  end if;
  return query
  select ep.id, ep.franquia_id, date_trunc('month', ep.created_at at time zone 'America/Sao_Paulo')::date,
         ep.numero, ep.cliente_nome, ep.kwp, ep.status, a.valor, coalesce(a.isento, false)
  from public.eng_projetos ep
  left join public.rede_projeto_taxas a on a.projeto_id = ep.id
  where ep.status <> 'cancelado'
    and ep.created_at >= (v_ini::timestamp at time zone 'America/Sao_Paulo')
    and ep.created_at < (v_fim::timestamp at time zone 'America/Sao_Paulo')
    and (p_dia is null or extract(day from ep.created_at at time zone 'America/Sao_Paulo') <= p_dia)
  order by ep.created_at;
end $function$;
revoke all on function public.rede_projetos(date, integer, integer) from public, anon;
grant execute on function public.rede_projetos(date, integer, integer) to authenticated, service_role;

notify pgrst, 'reload schema';
