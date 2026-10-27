-- PDF novo da proposta on-grid (paisagem, para imprimir).
-- 1) A proposta passa a guardar o consumo médio do cliente (kWh/mês) informado no
--    orçamento ("Pelo consumo"): o PDF mostra quanto do consumo o sistema cobre e o
--    gráfico geração × consumo. Propostas antigas ficam sem (null) e o PDF se adapta.
-- 2) O link público devolve também o que o PDF precisa: código do link curto,
--    consumo, placas e inversor (do kit_snapshot ou da proposta personalizada).
-- Só acrescenta: nenhuma coluna existente muda.

alter table public.propostas add column if not exists consumo_medio numeric;
comment on column public.propostas.consumo_medio is
  'Consumo médio do cliente (kWh/mês) informado no orçamento; usado no PDF da proposta.';

create or replace function private.get_public_proposta_data(p_id uuid)
 returns json
 language sql
 stable security definer
 set search_path to ''
as $function$
  SELECT row_to_json(t) FROM (
    SELECT
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
      p.geracao_ajustada,
      p.created_at,
      p.vendedor_nome,
      p.vendedor_telefone,
      coalesce(rt.cartao_taxas, '{}'::jsonb) AS cartao_taxas,
      p.numero,
      p.public_token,
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
      COALESCE(p.cliente_cidade, c.cidade) AS cliente_cidade,
      c.uf                     AS cliente_uf,
      ch.hsp_anual             AS cidade_hsp_anual,
      ch.hsp_mensal            AS cidade_hsp_mensal,
      p.kit_snapshot -> 'estrutura' ->> 'nome'  AS estrutura_nome,
      p.kit_snapshot -> 'estrutura' ->> 'linha' AS estrutura_linha,
      -- novos (PDF paisagem)
      p.codigo,
      p.consumo_medio,
      p.kit_snapshot -> 'modulo'   AS kit_modulo,
      p.kit_snapshot -> 'inversor' AS kit_inversor,
      p.custom_modulo_nome,
      p.custom_modulo_qty,
      p.custom_inversor_nome,
      p.custom_inversor_qty
    FROM public.propostas p
    LEFT JOIN public.franquias f    ON f.id = p.franquia_id
    LEFT JOIN public.rede_taxas rt  ON rt.franquia_id = p.franquia_id
    LEFT JOIN public.clientes c     ON c.id = p.cliente_id
    LEFT JOIN public.cidades_hsp ch ON ch.ibge_code = c.cidade_ibge
    WHERE p.id = p_id
  ) t
$function$;
