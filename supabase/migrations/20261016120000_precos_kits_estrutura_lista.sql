-- Preços com o telhado escolhido numa linha só (jsonb): o servidor corta listas em 1000 linhas
-- e o catálogo completo tem mais (1.747 kits em 16/10/2026). Aplicada via MCP em 16/10.
create or replace function public.precos_kits_estrutura_lista(p_telhado text, p_linha text default 'standard', p_franquia_id uuid default null)
returns jsonb language sql stable security definer set search_path to '' as $function$
  select coalesce(jsonb_agg(jsonb_build_array(x.produto_id, x.estrutura_id, x.price, x.list_price)), '[]'::jsonb)
    from public.precos_kits_estrutura(p_telhado, p_linha, p_franquia_id) x
$function$;
revoke all on function public.precos_kits_estrutura_lista(text, text, uuid) from public, anon;
grant execute on function public.precos_kits_estrutura_lista(text, text, uuid) to authenticated;
