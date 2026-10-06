-- Um modelo técnico pode ter ofertas/preços diferentes em várias distribuidoras.
-- Kits mantêm seus preços por unidade e passam a identificar a fornecedora.
create table public.distribuidoras (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(btrim(nome)) > 0),
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index distribuidoras_nome_idx on public.distribuidoras (lower(btrim(nome)));

create table public.distribuidora_componentes (
  distribuidora_id uuid not null references public.distribuidoras(id) on delete cascade,
  componente_id uuid not null references public.componentes(id) on delete cascade,
  preco_unitario numeric(12,2) not null check (preco_unitario >= 0),
  ativo boolean not null default true,
  primary key (distribuidora_id, componente_id)
);
create index distribuidora_componentes_componente_idx on public.distribuidora_componentes (componente_id);
alter table public.produtos add column distribuidora_id uuid references public.distribuidoras(id) on delete restrict;
create index produtos_distribuidora_idx on public.produtos (distribuidora_id);
-- Metadados históricos: o nome/ID da oferta ficam congelados na proposta.
alter table public.propostas add column distribuidora_id uuid, add column distribuidora_nome text;

alter table public.distribuidoras enable row level security;
alter table public.distribuidora_componentes enable row level security;
create policy distribuidoras_read on public.distribuidoras for select to authenticated using (ativo);
create policy distribuidoras_admin on public.distribuidoras for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy distribuidora_componentes_read on public.distribuidora_componentes for select to authenticated
  using (ativo and exists (select 1 from public.distribuidoras d where d.id = distribuidora_id and d.ativo)
    and exists (select 1 from public.componentes c where c.id = componente_id and c.ativo));
create policy distribuidora_componentes_admin on public.distribuidora_componentes for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
revoke all on public.distribuidoras, public.distribuidora_componentes from anon;
grant select, insert, update, delete on public.distribuidoras, public.distribuidora_componentes to authenticated;

-- Equipamento + ofertas são salvos juntos; editar um preço não altera os demais.
create function public.catalogo_salvar_equipamento(p_id uuid, p_dados jsonb, p_ofertas jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_id uuid := p_id;
begin
  if not public.is_admin() then raise exception 'Apenas administrador pode gerenciar equipamentos.' using errcode = '42501'; end if;
  if jsonb_typeof(p_ofertas) is distinct from 'array' then raise exception 'Informe as ofertas do equipamento.'; end if;
  if exists (select 1 from jsonb_to_recordset(p_ofertas) as o(distribuidora_id uuid, preco_unitario numeric)
    where o.distribuidora_id is null or o.preco_unitario is null or o.preco_unitario < 0) then
    raise exception 'Cada oferta precisa de distribuidora e preço válido.';
  end if;
  if (select count(*) from jsonb_array_elements(p_ofertas)) <> (select count(distinct o.distribuidora_id)
    from jsonb_to_recordset(p_ofertas) as o(distribuidora_id uuid)) then raise exception 'Distribuidora repetida nas ofertas.'; end if;
  if v_id is null then
    insert into public.componentes (tipo, nome, marca, potencia_wp, unidade, preco_unitario, custo, ativo)
    values (p_dados->>'tipo', p_dados->>'nome', p_dados->>'marca', (p_dados->>'potencia_wp')::numeric,
      p_dados->>'unidade', (p_dados->>'preco_unitario')::numeric, (p_dados->>'custo')::numeric, coalesce((p_dados->>'ativo')::boolean, true)) returning id into v_id;
  else
    update public.componentes set tipo=p_dados->>'tipo', nome=p_dados->>'nome', marca=p_dados->>'marca',
      potencia_wp=(p_dados->>'potencia_wp')::numeric, unidade=p_dados->>'unidade',
      preco_unitario=(p_dados->>'preco_unitario')::numeric, custo=(p_dados->>'custo')::numeric, ativo=coalesce((p_dados->>'ativo')::boolean,true)
      where id=v_id;
    if not found then raise exception 'Equipamento não encontrado.'; end if;
  end if;
  delete from public.distribuidora_componentes dc where dc.componente_id=v_id
    and not exists (select 1 from jsonb_to_recordset(p_ofertas) as o(distribuidora_id uuid) where o.distribuidora_id=dc.distribuidora_id);
  insert into public.distribuidora_componentes (distribuidora_id, componente_id, preco_unitario, ativo)
    select o.distribuidora_id, v_id, o.preco_unitario, coalesce(o.ativo,true)
    from jsonb_to_recordset(p_ofertas) as o(distribuidora_id uuid, preco_unitario numeric, ativo boolean)
    on conflict (distribuidora_id, componente_id) do update set preco_unitario=excluded.preco_unitario, ativo=excluded.ativo;
  return v_id;
end $$;
revoke all on function public.catalogo_salvar_equipamento(uuid,jsonb,jsonb) from public, anon;
grant execute on function public.catalogo_salvar_equipamento(uuid,jsonb,jsonb) to authenticated;

-- Roda depois da conferência de preço existente; não altera os preços da unidade.
create function public.tg_propostas_distribuidora()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_prod public.produtos%rowtype; v_dist public.distribuidoras%rowtype; v_ofertas jsonb;
begin
  if TG_OP = 'UPDATE' then
    if (new.distribuidora_id,new.distribuidora_nome) is distinct from (old.distribuidora_id,old.distribuidora_nome) then
      raise exception 'A distribuidora da proposta já está registrada. Gere outra proposta para trocar.';
    end if;
    return new;
  end if;
  if new.proposal_mode = 'PERSONALIZADA' then return new; end if;
  select * into v_prod from public.produtos where id=new.source_product_id;
  if new.distribuidora_id is not null and new.distribuidora_id is distinct from v_prod.distribuidora_id then
    raise exception 'A distribuidora selecionada não fornece este kit.';
  end if;
  new.distribuidora_id := v_prod.distribuidora_id;
  new.distribuidora_nome := null;
  if v_prod.distribuidora_id is null then return new; end if;
  select * into v_dist from public.distribuidoras where id=v_prod.distribuidora_id and ativo;
  if not found then raise exception 'A distribuidora deste kit está inativa.'; end if;
  if v_prod.modulo_id is null or v_prod.inversor_id is null then raise exception 'Este kit precisa de módulo e inversor vinculados.'; end if;
  if exists (select 1 from (values (v_prod.modulo_id),(v_prod.inversor_id)) as eq(id)
    where not exists (select 1 from public.distribuidora_componentes dc join public.componentes c on c.id=dc.componente_id
      where dc.distribuidora_id=v_dist.id and dc.componente_id=eq.id and dc.ativo and c.ativo)) then
    raise exception 'Um equipamento deste kit não está disponível na distribuidora.';
  end if;
  select jsonb_agg(jsonb_build_object('componente_id',dc.componente_id,'preco_unitario',dc.preco_unitario)) into v_ofertas
    from public.distribuidora_componentes dc where dc.distribuidora_id=v_dist.id and dc.componente_id in (v_prod.modulo_id,v_prod.inversor_id);
  new.distribuidora_nome := v_dist.nome;
  new.kit_snapshot := coalesce(new.kit_snapshot,'{}'::jsonb) || jsonb_build_object(
    'distribuidora',jsonb_build_object('id',v_dist.id,'nome',v_dist.nome), 'ofertas_equipamentos',v_ofertas);
  return new;
end $$;
revoke all on function public.tg_propostas_distribuidora() from public, anon;
create trigger trg_propostas_distribuidora before insert or update on public.propostas
  for each row execute function public.tg_propostas_distribuidora();
notify pgrst, 'reload schema';
