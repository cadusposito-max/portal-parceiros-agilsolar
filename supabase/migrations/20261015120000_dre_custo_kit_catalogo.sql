-- DRE da proposta: kit do catálogo (sem cotação) passa a trazer o custo cadastrado
-- em produtos_custo (custo Helte com frete), igual ao kit cotado na distribuidora.
-- Antes só vinham placas/kWp/inversor e o "Custo do kit" do DRE ficava zerado.
-- Mesmo acesso de antes: admin ou gestor da unidade da proposta (cc_pode_proposta).
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
  -- Kit pronto do catálogo: custo cadastrado do produto (só na proposta de kit, não na personalizada)
  if coalesce(p.proposal_mode,'') not in ('PERSONALIZADA','EQUIPAMENTOS') then
    select pc.custo into custo from public.produtos_custo pc
     where pc.produto_id = coalesce(p.source_product_id, nullif(p.kit_snapshot->>'produto_id','')::uuid);
  end if;
  return jsonb_build_object('modulos',qtd,'kwp',kwp,'inversores',inv,'kw_inversor',round(kwi,3))
    || case when custo > 0 then jsonb_build_object('custo',custo,'custo_fonte','catalogo') else '{}'::jsonb end;
end $function$;
