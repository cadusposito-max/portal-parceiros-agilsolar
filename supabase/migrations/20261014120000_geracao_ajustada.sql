-- Ajuste manual da geração da proposta (14/10/2026).
-- A geração continua sendo calculada na criação (geracao_estimada, intacta).
-- Admin, ou o franqueado da unidade, pode gravar uma geração ajustada por cima:
-- link, PDF, economia, payback e gráfico passam a usar geracao_ajustada quando
-- preenchida. null = volta ao valor calculado.

alter table public.propostas
  add column if not exists geracao_ajustada     numeric,
  add column if not exists geracao_ajustada_por text,
  add column if not exists geracao_ajustada_em  timestamptz;

alter table public.propostas drop constraint if exists propostas_geracao_ajustada_positiva;
alter table public.propostas add constraint propostas_geracao_ajustada_positiva
  check (geracao_ajustada is null or geracao_ajustada > 0);

-- O RLS de propostas deixa o vendedor editar a própria proposta; os campos do
-- ajuste só mudam pela RPC abaixo (security definer roda como dono, não como
-- authenticated).
create or replace function public.tg_propostas_trava_geracao_ajustada()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if current_user in ('authenticated', 'anon')
     and (new.geracao_ajustada, new.geracao_ajustada_por, new.geracao_ajustada_em)
         is distinct from
         (old.geracao_ajustada, old.geracao_ajustada_por, old.geracao_ajustada_em) then
    raise exception 'A geração só pode ser ajustada pelo administrador ou franqueado.' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists trg_propostas_trava_geracao_ajustada on public.propostas;
create trigger trg_propostas_trava_geracao_ajustada
  before update on public.propostas
  for each row execute function public.tg_propostas_trava_geracao_ajustada();

-- Admin em qualquer proposta; franqueado só nas da unidade dele.
-- p_valor null limpa o ajuste.
create or replace function public.ajustar_geracao_proposta(p_proposta_id uuid, p_valor numeric)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_p     public.propostas%rowtype;
  v_novo  numeric := round(p_valor);
  v_velho numeric;
  v_autor text := lower(coalesce(auth.jwt() ->> 'email', 'admin'));
  v_admin boolean := public.is_admin();
  v_fr    uuid := public.franqueado_franquia_id();
  v_fmt   text;
begin
  if not v_admin and v_fr is null then
    raise exception 'Apenas administradores e franqueados podem ajustar a geração' using errcode = '42501';
  end if;
  if v_novo is not null and v_novo <= 0 then
    raise exception 'Informe uma geração maior que zero';
  end if;

  select * into v_p from public.propostas where id = p_proposta_id for update;
  if not found then
    raise exception 'Proposta não encontrada';
  end if;
  if not v_admin and v_p.franquia_id is distinct from v_fr then
    raise exception 'Esta proposta é de outra unidade' using errcode = '42501';
  end if;

  v_velho := coalesce(v_p.geracao_ajustada, round(v_p.geracao_estimada));
  if v_p.geracao_ajustada is not distinct from v_novo then
    return jsonb_build_object('alterado', false, 'valor', v_novo);
  end if;

  update public.propostas
     set geracao_ajustada     = v_novo,
         geracao_ajustada_por = case when v_novo is null then null else v_autor end,
         geracao_ajustada_em  = case when v_novo is null then null else now() end
   where id = p_proposta_id;

  if v_p.cliente_id is not null then
    v_fmt := coalesce(translate(to_char(v_velho, 'FM999,999,990'), ',', '.'), '—');
    insert into public.crm_atividades (cliente_id, franquia_id, autor_email, tipo, descricao, meta)
    values (v_p.cliente_id, v_p.franquia_id, v_autor, 'proposta',
            case when v_novo is null
              then 'Geração da proposta ' || coalesce(v_p.numero::text || ' ', '') || 'voltou ao valor calculado ('
                   || coalesce(translate(to_char(round(v_p.geracao_estimada), 'FM999,999,990'), ',', '.'), '—') || ' kWh/mês)'
              else 'Geração da proposta ' || coalesce(v_p.numero::text || ' ', '') || 'ajustada de ' || v_fmt
                   || ' para ' || translate(to_char(v_novo, 'FM999,999,990'), ',', '.') || ' kWh/mês'
            end,
            jsonb_build_object('proposta_id', p_proposta_id, 'evento', 'geracao_ajustada',
                               'de', v_velho, 'para', v_novo, 'calculada', v_p.geracao_estimada));
  end if;

  return jsonb_build_object('alterado', true, 'de', v_velho, 'valor', v_novo);
end $function$;

revoke execute on function public.ajustar_geracao_proposta(uuid, numeric) from public, anon;
grant execute on function public.ajustar_geracao_proposta(uuid, numeric) to authenticated;

-- Link público e PDF recebem o ajuste.
create or replace function private.get_public_proposta_data(p_id uuid)
returns json
language sql
stable security definer
set search_path to ''
as $function$
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
      p.geracao_ajustada,
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
