-- Catálogo geral por unidade: todo kit ativo da linha catálogo com custo cadastrado ganha
-- (ou atualiza) o preço da unidade em precos_franquia, pela regra do markup aplicada ao
-- custo do kit COM O FRETE DA UNIDADE (private.cc_custo_kit / frete_regra_unidade).
--   inversor: custo × 1,7717 ÷ 1,05 → final 97 → × 1,05
--   micro:    custo × 1,7498 ÷ 1,071 → final 97 → × 1,071
--   "De": private.cc_preco_de
-- Promocionais (linha 'promocional') não entram: têm preço próprio.
-- Unidade no modo "custos + margem" continua usando price_custos (recalculado no fim).

create or replace function private.cc_preco_markup(p_custo numeric, p_micro boolean)
returns numeric
language sql
immutable
set search_path to ''
as $function$
  select case when p_custo is null or p_custo <= 0 then null
    when p_micro then round((ceil((p_custo * 1.7498326202954417 / 1.071 - 97) / 100) * 100 + 97) * 1.071, 2)
    else round((ceil((p_custo * 1.7717293041376716 / 1.05 - 97) / 100) * 100 + 97) * 1.05, 2) end
$function$;

create or replace function private.cc_sincronizar_catalogo(p_franquia_id uuid)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare n integer;
begin
  if p_franquia_id is null then return 0; end if;
  with k as (
    select p.id, private.cc_preco_markup(private.cc_custo_kit(p.id, p_franquia_id), p.categoria = 'kitsMicro') as preco
      from public.produtos p
     where p.ativo and coalesce(p.linha, 'catalogo') = 'catalogo'
  )
  insert into public.precos_franquia (produto_id, franquia_id, price, list_price)
  select k.id, p_franquia_id, k.preco, private.cc_preco_de(k.preco) from k where k.preco > 0
  on conflict (produto_id, franquia_id) do update
    set price = excluded.price, list_price = excluded.list_price;
  get diagnostics n = row_count;
  perform private.cc_aplicar_precos(p_franquia_id);
  return n;
end $function$;

revoke all on function private.cc_sincronizar_catalogo(uuid) from public;
