-- Frete da distribuidora por unidade (cidade de entrega).
-- O custo cadastrado do kit (produtos_custo) traz o frete de Araçatuba; com a regra da
-- unidade, o custo do kit para ela = peças (detalhe.pecas) + frete da cidade dela.
-- Regras levantadas na Helte em 15/10/2026 (calculate-price com o código IBGE de cada cidade):
--   SP (Araçatuba, Caraguatatuba, Rio Claro, São José dos Campos, Ubatuba): maior entre R$ 400 e 3,8494% até R$ 25 mil em peças; 3,1394% acima
--   Londrina-PR: 3% · Goiânia-GO: maior entre R$ 660 e 4,4% / 4% acima · Varginha-MG: maior entre R$ 660 e 4% / maior entre R$ 990 e 3,85% acima
-- Usado em: preço por custos da unidade (cc_aplicar_precos) e DRE da proposta (get_cc_proposta_contexto).

create table if not exists public.frete_regra_unidade (
  distribuidora_id uuid not null references public.distribuidoras(id) on delete cascade,
  franquia_id uuid not null references public.franquias(id) on delete cascade,
  limite numeric not null default 25000,      -- soma das peças que muda a faixa
  minimo_ate numeric not null default 0,      -- R$ mínimo abaixo do limite
  pct_ate numeric not null,                   -- fração (0.038494 = 3,8494%) abaixo do limite
  minimo_acima numeric not null default 0,
  pct_acima numeric not null,
  observacao text,
  atualizado_em timestamptz not null default now(),
  primary key (distribuidora_id, franquia_id)
);

alter table public.frete_regra_unidade enable row level security;
drop policy if exists frete_regra_unidade_admin on public.frete_regra_unidade;
create policy frete_regra_unidade_admin on public.frete_regra_unidade for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.frete_regra_unidade to authenticated;

-- Custo do kit para a unidade. Kit sem custo próprio (promocional) usa o kit do catálogo
-- com o mesmo módulo, inversor e quantidades (é o mesmo kit na distribuidora).
create or replace function private.cc_custo_kit(p_produto_id uuid, p_franquia_id uuid)
returns numeric
language plpgsql
stable security definer
set search_path to ''
as $function$
declare pr public.produtos%rowtype; c public.produtos_custo%rowtype; f public.frete_regra_unidade%rowtype; pecas numeric;
begin
  select * into pr from public.produtos where id = p_produto_id;
  if not found then return null; end if;
  select * into c from public.produtos_custo where produto_id = pr.id;
  if not found and pr.modulo_id is not null and pr.inversor_id is not null then
    select pc.* into c from public.produtos p2 join public.produtos_custo pc on pc.produto_id = p2.id
     where p2.modulo_id = pr.modulo_id and p2.modulo_qtd = pr.modulo_qtd
       and p2.inversor_id = pr.inversor_id and p2.inversor_qtd = pr.inversor_qtd
       and coalesce(p2.linha, 'catalogo') = 'catalogo' and p2.ativo
       and (pr.distribuidora_id is null or p2.distribuidora_id = pr.distribuidora_id)
     order by pc.atualizado_em desc limit 1;
  end if;
  if c.custo is null then return null; end if;
  pecas := nullif(c.detalhe->>'pecas', '')::numeric;
  if pecas is null or p_franquia_id is null then return c.custo; end if;
  select * into f from public.frete_regra_unidade
   where franquia_id = p_franquia_id and distribuidora_id = pr.distribuidora_id;
  if not found then return c.custo; end if;
  return round(pecas + case when pecas < f.limite then greatest(f.minimo_ate, pecas * f.pct_ate)
                            else greatest(f.minimo_acima, pecas * f.pct_acima) end, 2);
end $function$;

-- Preço por custos da unidade: custo do kit com o frete dela.
create or replace function private.cc_aplicar_precos(p_franquia_id uuid)
 returns integer
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare r record; v jsonb; n integer := 0;
begin
  if p_franquia_id is null then return 0; end if;
  if private.cc_modo_preco(p_franquia_id) <> 'custos' then
    update public.precos_franquia set price_custos = null, list_price_custos = null
     where franquia_id = p_franquia_id and (price_custos is not null or list_price_custos is not null);
    return 0;
  end if;
  for r in
    select pf.produto_id, private.cc_custo_kit(p.id, p_franquia_id) as custo, coalesce(p.modulo_qtd, 0) as modulos, coalesce(p.power, 0) as kwp, coalesce(p.inversor_qtd, 1) as inversores,
           coalesce(ci.potencia_wp, 0) / 1000 * coalesce(p.inversor_qtd, 1) as kw_inversor
      from public.precos_franquia pf
      join public.produtos p on p.id = pf.produto_id
      left join public.componentes ci on ci.id = p.inversor_id
     where pf.franquia_id = p_franquia_id and coalesce(p.linha, 'catalogo') = 'catalogo'
  loop
    v := null;
    if r.custo > 0 and r.modulos > 0 and r.kwp > 0 then
      begin
        v := private.cc_preco_dimensionado(p_franquia_id, r.custo, r.modulos, r.kwp, r.inversores, r.kw_inversor);
      exception when others then v := null;
      end;
    end if;
    update public.precos_franquia
       set price_custos = (v->>'venda')::numeric,
           list_price_custos = case when v is null then null else private.cc_preco_de((v->>'venda')::numeric) end
     where franquia_id = p_franquia_id and produto_id = r.produto_id;
    if v is not null then n := n + 1; end if;
  end loop;
  return n;
end $function$;

-- DRE da proposta: custo do kit com o frete da unidade da proposta.
create or replace function private.get_cc_proposta_contexto(p_proposta_id uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
declare p public.propostas%rowtype;c public.cotacoes_distribuidora%rowtype; qtd integer;kwp numeric; inv integer; kwi numeric; custo numeric;
begin
  if not public.cc_pode_proposta(p_proposta_id) then raise exception 'Sem permissão' using errcode='42501';end if;
  select * into p from public.propostas where id=p_proposta_id;
  if p.cotacao_id is not null then
    select * into c from public.cotacoes_distribuidora where id=p.cotacao_id;
    return jsonb_build_object('modulos',c.placas,'kwp',c.kwp,'inversores',coalesce((c.inversor->>'qtd')::integer,1),
      'kw_inversor',round(coalesce((c.inversor->>'potencia_wp')::numeric,0)/1000*coalesce((c.inversor->>'qtd')::numeric,1),3),'custo',c.custo,'precificacao',c.precificacao);
  end if;
  select sum((i->>'qtd')::numeric)::integer into qtd from jsonb_array_elements(coalesce(p.custom_config->'itens','[]')) i where i->>'tipo'='modulo';
  select sum((i->>'qtd')::numeric)::integer into inv from jsonb_array_elements(coalesce(p.custom_config->'itens','[]')) i where i->>'tipo' in ('inversor','micro');
  qtd:=coalesce(qtd,p.custom_modulo_qty,(p.kit_snapshot->'modulo'->>'qtd')::integer,0);
  inv:=coalesce(inv,p.custom_inversor_qty,(p.kit_snapshot->'inversor'->>'qtd')::integer,1);
  kwp:=coalesce(p.custom_system_power_kwp,p.kit_power,0);
  -- kW de inversor: foto do kit (potência × qtd) ou o inversor da personalizada
  kwi:=coalesce((p.kit_snapshot->'inversor'->>'potencia_wp')::numeric/1000*coalesce((p.kit_snapshot->'inversor'->>'qtd')::numeric,1),
    (select c2.potencia_wp/1000*coalesce(p.custom_inversor_qty,1) from public.componentes c2 where c2.id=p.custom_inversor_id),0);
  -- Kit pronto (catálogo ou promocional): custo cadastrado com o frete da unidade
  if coalesce(p.proposal_mode,'') not in ('PERSONALIZADA','EQUIPAMENTOS') then
    custo := private.cc_custo_kit(coalesce(p.source_product_id, nullif(p.kit_snapshot->>'produto_id','')::uuid), p.franquia_id);
  end if;
  return jsonb_build_object('modulos',qtd,'kwp',kwp,'inversores',inv,'kw_inversor',round(kwi,3))
    || case when custo > 0 then jsonb_build_object('custo',custo,'custo_fonte','catalogo') else '{}'::jsonb end;
end $function$;

-- Regra mudou → recalcula os preços por custos das unidades.
drop trigger if exists tg_frete_regra_unidade_precos on public.frete_regra_unidade;
create trigger tg_frete_regra_unidade_precos after insert or update or delete on public.frete_regra_unidade
  for each statement execute function private.tg_cc_recalcular_todas();

-- Helte: regra de cada unidade pela cidade dela.
insert into public.frete_regra_unidade (distribuidora_id, franquia_id, limite, minimo_ate, pct_ate, minimo_acima, pct_acima, observacao)
select '23a51365-a37f-444c-9c45-22645515f2cc', f.id, 25000, r.min_ate, r.pct_ate, r.min_acima, r.pct_acima, r.obs
  from public.franquias f
  join (values
    ('Araçatuba - SP',            400, 0.038494, 0,   0.031394, 'SP · conferido 15/10/2026'),
    ('Caraguatatuba - SP',        400, 0.038494, 0,   0.031394, 'SP · conferido 15/10/2026'),
    ('Rio Claro - SP',            400, 0.038494, 0,   0.031394, 'SP · conferido 15/10/2026'),
    ('São José dos Campos - SP',  400, 0.038494, 0,   0.031394, 'SP · conferido 15/10/2026'),
    ('Ubatuba - SP',              400, 0.038494, 0,   0.031394, 'SP · conferido 15/10/2026'),
    ('Londrina - PR',             0,   0.03,     0,   0.03,     'PR · conferido 15/10/2026'),
    ('Goiânia - GO',              660, 0.044,    0,   0.04,     'GO · conferido 15/10/2026'),
    ('Varginha - MG',             660, 0.04,     990, 0.0385,   'MG · conferido 15/10/2026')
  ) as r(cidade, min_ate, pct_ate, min_acima, pct_acima, obs) on r.cidade = f.cidade
on conflict (distribuidora_id, franquia_id) do update
  set limite = excluded.limite, minimo_ate = excluded.minimo_ate, pct_ate = excluded.pct_ate,
      minimo_acima = excluded.minimo_acima, pct_acima = excluded.pct_acima, observacao = excluded.observacao, atualizado_em = now();
