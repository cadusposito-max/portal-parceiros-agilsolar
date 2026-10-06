-- Taxas da operadora do cartão por unidade e quantidade de parcelas.
-- O preço base da proposta permanece intacto; a tabela vazia usa o padrão atual.
create schema private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;

create function private.cartao_taxas_validas(p_taxas jsonb)
returns boolean language sql immutable security invoker set search_path = '' as $$
  select case when jsonb_typeof(p_taxas) is distinct from 'object' then false else
    not exists (select 1 from jsonb_each(p_taxas) as t(parcela,taxa)
      where parcela !~ '^([1-9]|1[0-8])$'
        or case when jsonb_typeof(taxa) = 'number'
          then (taxa #>> '{}')::numeric < 0 or (taxa #>> '{}')::numeric >= 100
          else true end)
    end;
$$;
revoke all on function private.cartao_taxas_validas(jsonb) from public, anon;
grant execute on function private.cartao_taxas_validas(jsonb) to authenticated, service_role;

alter table public.rede_taxas add column cartao_taxas jsonb not null default '{}'::jsonb
  constraint rede_taxas_cartao_validas check (private.cartao_taxas_validas(cartao_taxas));
comment on column public.rede_taxas.cartao_taxas is 'Taxa percentual da operadora por parcela (1 a 18). Chaves ausentes usam o padrão da proposta.';

-- Salva uma parcela por vez, de forma atômica, sem sobrescrever outras taxas.
create function public.rede_set_taxa_cartao(p_franquia_id uuid, p_parcelas integer, p_taxa numeric)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_taxas jsonb;
begin
  if not public.is_admin() then raise exception 'Apenas administrador pode alterar taxas do cartão.' using errcode='42501'; end if;
  if p_parcelas is null or p_parcelas < 1 or p_parcelas > 18 or p_taxa is null or p_taxa < 0 or p_taxa >= 100 then
    raise exception 'Informe de 1 a 18 parcelas e uma taxa de 0 até menos de 100%%.';
  end if;
  insert into public.rede_taxas as destino (franquia_id, royalties_pct, royalties_base, royalties_minimo,
    publicidade_pct, rebate_pct, projeto_valor, mensalidade, equipamentos_pct, custo_equip_pct, custo_serv_pct, comissao_pct, cartao_taxas, updated_at)
  select p_franquia_id, d.royalties_pct, d.royalties_base, d.royalties_minimo,
    d.publicidade_pct, d.rebate_pct, d.projeto_valor, d.mensalidade, d.equipamentos_pct, d.custo_equip_pct, d.custo_serv_pct, d.comissao_pct,
    jsonb_build_object(p_parcelas::text,p_taxa), now() from public.rede_padroes d where d.id=1
  on conflict (franquia_id) do update set cartao_taxas=destino.cartao_taxas || excluded.cartao_taxas, updated_at=excluded.updated_at
  returning cartao_taxas into v_taxas;
  if not found then raise exception 'Configure os padrões da rede antes de salvar as taxas.'; end if;
  return v_taxas;
end $$;
revoke all on function public.rede_set_taxa_cartao(uuid,integer,numeric) from public, anon;
grant execute on function public.rede_set_taxa_cartao(uuid,integer,numeric) to authenticated, service_role;

-- Mantém a mesma resposta pública, acrescentando só as taxas de cartão.
-- Leitura privilegiada fica no schema privado; a RPC pública segue a assinatura.
create function private.get_public_proposta_data(p_id uuid)
returns json language sql stable security definer set search_path = '' as $function$

  SELECT row_to_json(t) FROM (
    SELECT
      -- ===== CAMPOS ORIGINAIS (intactos) =====
      p.cliente_nome,
      p.kit_nome,
      p.kit_brand,
      p.kit_power,
      p.kit_price,
      p.kit_list_price,
      p.proposal_mode,
      p.custom_total_price,
      p.custom_system_power_kwp,
      p.custom_payment_note,
      p.custom_commercial_note,
      p.geracao_estimada,
      p.created_at,
      p.vendedor_nome,
      p.vendedor_telefone,

      -- ===== identificacao =====
      coalesce(rt.cartao_taxas, '{}'::jsonb) AS cartao_taxas,
      p.numero,
      p.public_token,

      -- ===== dados da franquia (pro PDF) =====
      f.nome                   AS franquia_nome,
      f.cnpj                   AS franquia_cnpj,
      f.razao_social           AS franquia_razao_social,
      f.endereco               AS franquia_endereco,
      f.cidade                 AS franquia_cidade,
      f.telefone               AS franquia_telefone,
      f.email                  AS franquia_email,
      f.site                   AS franquia_site,
      f.garantia_paineis_anos  AS franquia_garantia_paineis_anos,
      f.garantia_inversor_anos AS franquia_garantia_inversor_anos,

      -- ===== grafico de geracao mensal (HSP NASA da cidade do cliente) =====
      COALESCE(p.cliente_cidade, c.cidade) AS cliente_cidade,
      c.uf                     AS cliente_uf,
      ch.hsp_anual             AS cidade_hsp_anual,
      ch.hsp_mensal            AS cidade_hsp_mensal
    FROM public.propostas p
    LEFT JOIN public.franquias f    ON f.id = p.franquia_id
    LEFT JOIN public.rede_taxas rt  ON rt.franquia_id = p.franquia_id
    LEFT JOIN public.clientes c     ON c.id = p.cliente_id
    LEFT JOIN public.cidades_hsp ch ON ch.ibge_code = c.cidade_ibge
    WHERE p.id = p_id
  ) t
$function$;
revoke all on function private.get_public_proposta_data(uuid) from public;
grant execute on function private.get_public_proposta_data(uuid) to anon, authenticated, service_role;

create or replace function public.get_public_proposta(p_id uuid)
returns json language sql stable security invoker set search_path = '' as $$
  select private.get_public_proposta_data(p_id);
$$;
revoke all on function public.get_public_proposta(uuid) from public;
grant execute on function public.get_public_proposta(uuid) to anon, authenticated, service_role;
-- Goiânia: coluna “Taxa Nova” da Stone Visa/Master enviada em 06/10/2026.
-- A proposta mantém o limite existente de 18x.
do $$
begin
  if not exists (select 1 from public.franquias where id='abb22e55-40d0-466f-b813-76cc5b58d9ca' and uf='GO') then
    raise exception 'Unidade de Goiânia não encontrada.';
  end if;
  update public.rede_taxas set cartao_taxas='{"1":3.59,"2":4.79,"3":5.59,"4":6.29,"5":7.39,"6":8.29,"7":8.99,"8":9.79,"9":10.49,"10":11.19,"11":11.99,"12":12.79,"13":13.1,"14":13.69,"15":13.89,"16":14.19,"17":14.59,"18":15.29}'::jsonb, updated_at=now()
    where franquia_id='abb22e55-40d0-466f-b813-76cc5b58d9ca';
  if not found then raise exception 'Configuração de Goiânia não encontrada.'; end if;
end $$;
notify pgrst, 'reload schema';
