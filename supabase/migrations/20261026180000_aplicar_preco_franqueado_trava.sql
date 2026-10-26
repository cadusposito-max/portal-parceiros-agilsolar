-- 26/10/2026 — "Aplicar na proposta" do franqueado batia na trava de preço.
-- A trava (tg_propostas_trava_preco, 05/10) só deixa admin mudar preço/kit de
-- proposta pronta. O perfil Franqueado (13/10) liberou aplicar_preco_proposta
-- para o franqueado da unidade, mas o UPDATE de dentro dela caía na trava.
-- Agora a RPC marca a proposta numa variável local da transação e a trava
-- deixa passar só essa proposta, só nessa chamada. Fora do botão, nada muda.

create or replace function public.tg_propostas_trava_preco()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if public.is_admin() then
    return new;
  end if;
  -- Preço aplicado pela precificação (aplicar_preco_proposta já conferiu a unidade).
  if coalesce(current_setting('agil.aplicar_preco_proposta', true), '') = new.id::text then
    return new;
  end if;
  if (new.kit_price, new.kit_list_price, new.kit_nome, new.kit_brand, new.kit_power,
      new.proposal_mode, new.source_product_id, new.kit_snapshot, new.cotacao_id,
      new.custom_config, new.custom_totals, new.custom_total_price, new.custom_subtotal_price,
      new.custom_equipment_price, new.custom_service_price, new.custom_price_before_discount,
      new.custom_discount_type, new.custom_discount_value, new.custom_frete, new.custom_system_power_kwp,
      new.custom_markup_percent, new.custom_markup_value, new.estrutura_id)
     is distinct from
     (old.kit_price, old.kit_list_price, old.kit_nome, old.kit_brand, old.kit_power,
      old.proposal_mode, old.source_product_id, old.kit_snapshot, old.cotacao_id,
      old.custom_config, old.custom_totals, old.custom_total_price, old.custom_subtotal_price,
      old.custom_equipment_price, old.custom_service_price, old.custom_price_before_discount,
      old.custom_discount_type, old.custom_discount_value, old.custom_frete, old.custom_system_power_kwp,
      old.custom_markup_percent, old.custom_markup_value, old.estrutura_id)
  then
    raise exception 'O preço e o kit de uma proposta pronta só podem ser alterados por um administrador.' using errcode = '42501';
  end if;
  return new;
end
$function$;

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

  -- Libera a trava de preço só para esta proposta, só durante o UPDATE abaixo.
  perform set_config('agil.aplicar_preco_proposta', p_proposta_id::text, true);

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

  perform set_config('agil.aplicar_preco_proposta', '', true);

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
