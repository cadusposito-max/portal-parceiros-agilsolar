-- Engenharia: 1 card (cliente) = 1 projeto.
-- Antes o projeto nascia por venda: excluir a venda e registrar outra (correção)
-- criava um segundo projeto pro mesmo cliente (caso DEVANIR: P-0001 e P-0004).
-- Agora a venda é só a fonte do kit/kWp do projeto do card: trocou a venda, o
-- mesmo projeto passa a usar a nova (timeline com de → para + alerta).

-- Kit, módulo e inversor de uma venda (mesma regra que o envio já usava).
create or replace function public.eng_kit_da_venda(p_venda uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v public.vendas%rowtype;
  pr public.produtos%rowtype;
  v_prod uuid;
  v_cm uuid; v_cmq integer; v_ci uuid; v_ciq integer;
  v_snap jsonb;
  v_kit jsonb; v_mod jsonb; v_inv jsonb;
begin
  select * into v from public.vendas where id = p_venda;
  if not found then return null; end if;

  select pp.source_product_id, pp.custom_modulo_id, pp.custom_modulo_qty, pp.custom_inversor_id, pp.custom_inversor_qty, pp.kit_snapshot
    into v_prod, v_cm, v_cmq, v_ci, v_ciq, v_snap
    from public.propostas pp where pp.id = v.proposta_id;
  if v_prod is null then
    select id into v_prod from public.produtos
     where upper(trim(name)) = upper(trim(v.kit_nome))
     order by ativo desc, created_at desc limit 1;
  end if;

  -- Foto do kit (o que foi vendido) tem prioridade sobre o kit atual do catálogo.
  if v_snap ->> 'tipo' = 'kit'
     and nullif(v_snap -> 'modulo' ->> 'id', '') is not null
     and nullif(v_snap -> 'inversor' ->> 'id', '') is not null then
    select * into pr from public.produtos where id = v_prod;
    v_kit := jsonb_build_object('id', v_prod, 'nome', v_snap ->> 'nome', 'power', (v_snap ->> 'potencia_kwp')::numeric, 'foto_proposta', true);
    v_mod := public.eng_equip_json((v_snap -> 'modulo' ->> 'id')::uuid, (v_snap -> 'modulo' ->> 'qtd')::integer);
    v_inv := public.eng_equip_json((v_snap -> 'inversor' ->> 'id')::uuid, (v_snap -> 'inversor' ->> 'qtd')::integer);
  elsif v_prod is not null then
    select * into pr from public.produtos where id = v_prod;
    v_kit := jsonb_build_object('id', pr.id, 'nome', pr.name, 'power', pr.power);
    v_mod := public.eng_equip_json(pr.modulo_id, pr.modulo_qtd);
    v_inv := public.eng_equip_json(pr.inversor_id, pr.inversor_qtd);
  elsif v_cm is not null and v_ci is not null then
    v_kit := jsonb_build_object('id', null, 'nome', v.kit_nome, 'power', v.kit_power, 'personalizada', true);
    v_mod := public.eng_equip_json(v_cm, v_cmq);
    v_inv := public.eng_equip_json(v_ci, v_ciq);
  end if;

  return jsonb_build_object('produto_id', v_prod, 'kit', v_kit, 'modulo', v_mod, 'inversor', v_inv,
    'kwp', coalesce(v.kit_power, pr.power),
    'venda', jsonb_build_object('id', v.id, 'kit_nome', v.kit_nome, 'kit_power', v.kit_power, 'em', v.created_at));
end $function$;

-- Troca a venda de um projeto: atualiza kit/equipamentos/kWp, zera o
-- dimensionamento (a engenharia roda de novo), acende o alerta e registra de → para.
create or replace function public.eng_aplicar_venda(p_projeto uuid, p_venda uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  p public.eng_projetos%rowtype;
  v public.vendas%rowtype;
  k jsonb;
  v_kwp numeric;
  v_de text; v_para text;
begin
  select * into p from public.eng_projetos where id = p_projeto for update;
  if not found then return; end if;
  select * into v from public.vendas where id = p_venda;
  if not found then return; end if;
  k := public.eng_kit_da_venda(v.id);
  v_kwp := coalesce((k ->> 'kwp')::numeric, p.kwp);

  v_de := coalesce(nullif(p.snapshot -> 'venda' ->> 'kit_nome', ''), 'venda anterior')
    || coalesce(' (' || replace(to_char(p.kwp, 'FM9990.00'), '.', ',') || ' kWp)', '');
  v_para := coalesce(nullif(v.kit_nome, ''), 'venda')
    || coalesce(' (' || replace(to_char(v_kwp, 'FM9990.00'), '.', ',') || ' kWp)', '');

  update public.eng_projetos set
    venda_id = v.id,
    proposta_id = v.proposta_id,
    produto_id = (k ->> 'produto_id')::uuid,
    kwp = v_kwp,
    snapshot = snapshot || jsonb_build_object('venda', k -> 'venda', 'kit', k -> 'kit', 'modulo', k -> 'modulo', 'inversor', k -> 'inversor'),
    dim = null, dim_status = null, dim_motivo = null, dim_em = null,
    alerta = true,
    updated_at = now()
  where id = p.id;

  perform public.eng_log(p.id, 'alerta', 'Venda do cliente trocada: ' || v_de || ' → ' || v_para, null, null, false,
    jsonb_build_object('venda_de', p.snapshot -> 'venda' ->> 'id', 'venda_para', v.id, 'kwp_de', p.kwp, 'kwp_para', v_kwp));
  perform public.eng_log_cliente(p.id, 'Projeto P-' || lpad(p.numero::text, 4, '0') || ' passou a usar a venda: ' || v_de || ' → ' || v_para);
end $function$;

revoke all on function public.eng_aplicar_venda(uuid, uuid) from public, anon, authenticated;
revoke all on function public.eng_kit_da_venda(uuid) from public, anon, authenticated;

-- Envio: se o card já tem projeto, não cria outro, o projeto passa a usar esta venda.
create or replace function public.eng_enviar_projeto(p_cliente uuid, p_venda uuid, p_instalacao jsonb)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  c public.clientes%rowtype;
  v public.vendas%rowtype;
  ex public.eng_projetos%rowtype;
  k jsonb;
  v_falta text[];
  v_inst jsonb;
  v_lig text := p_instalacao ->> 'tipo_ligacao';
  v_id uuid;
  v_vend text;
begin
  if auth.uid() is null then raise exception 'Faça login novamente.' using errcode = '42501'; end if;
  select * into c from public.clientes where id = p_cliente;
  if not found then raise exception 'Cliente não encontrado.'; end if;
  if not (public.is_admin() or public.is_eng_central() or (public.is_gestor() and c.franquia_id = public.get_franquia_id())) then
    raise exception 'Só o gestor da franquia pode enviar projetos à engenharia.' using errcode = '42501';
  end if;
  select * into v from public.vendas where id = p_venda and cliente_id = p_cliente;
  if not found then raise exception 'Escolha uma venda deste cliente.'; end if;
  if v_lig is null or v_lig not in ('mono_127','mono_220','bi_220','tri_220','tri_380') then
    raise exception 'Informe o tipo de ligação do cliente.';
  end if;

  -- 1 card = 1 projeto
  select * into ex from public.eng_projetos
   where cliente_id = p_cliente and status <> 'cancelado'
   order by created_at desc limit 1 for update;
  if found then
    if ex.venda_id = p_venda then raise exception 'Esta venda já foi enviada à engenharia.'; end if;
    if ex.status = 'projeto_concluido' then
      raise exception 'Este cliente já tem um projeto concluído (P-%). Para uma venda nova, crie um card novo.', lpad(ex.numero::text, 4, '0');
    end if;
    perform public.eng_aplicar_venda(ex.id, p_venda);
    update public.eng_projetos set
      snapshot = jsonb_set(snapshot, '{instalacao}', coalesce(snapshot -> 'instalacao', '{}'::jsonb) || jsonb_strip_nulls(coalesce(p_instalacao, '{}'::jsonb))),
      concessionaria = coalesce(nullif(p_instalacao ->> 'concessionaria', ''), concessionaria),
      uc = coalesce(nullif(p_instalacao ->> 'numero_instalacao', ''), uc)
    where id = ex.id;
    return ex.id;
  end if;

  if not exists (select 1 from public.cliente_arquivos where cliente_id = p_cliente) then
    raise exception 'Nenhum documento anexado. Anexe os documentos na aba Arquivos antes de enviar.';
  end if;
  v_falta := coalesce(public.eng_docs_faltando(p_cliente), '{}');
  k := public.eng_kit_da_venda(v.id);

  v_inst := coalesce(c.documentos_dados -> 'instalacao', '{}'::jsonb) || jsonb_strip_nulls(coalesce(p_instalacao, '{}'::jsonb));
  select nullif(trim(nome), '') into v_vend from public.user_accounts where lower(email) = lower(c.vendedor_email) limit 1;

  insert into public.eng_projetos (franquia_id, cliente_id, venda_id, proposta_id, produto_id, cliente_nome, cidade, kwp,
    concessionaria, uc, snapshot, enviado_por, enviado_por_nome)
  values (c.franquia_id, c.id, v.id, v.proposta_id, (k ->> 'produto_id')::uuid, c.nome, c.cidade, (k ->> 'kwp')::numeric,
    nullif(v_inst ->> 'concessionaria', ''), nullif(v_inst ->> 'numero_instalacao', ''),
    jsonb_build_object(
      'cliente', jsonb_build_object('nome', c.nome, 'documento', c.documento, 'telefone', c.telefone, 'email', c.email,
        'endereco', c.endereco, 'numero', c.numero, 'complemento', c.complemento, 'bairro', c.bairro, 'cidade', c.cidade,
        'uf', c.uf, 'cep', c.cep, 'hsp', c.hsp, 'latitude', c.latitude, 'longitude', c.longitude,
        'padrao_localizacao', c.padrao_localizacao, 'vendedor_email', c.vendedor_email, 'vendedor_nome', coalesce(v_vend, v.vendedor_nome)),
      'instalacao', v_inst,
      'venda', k -> 'venda',
      'kit', k -> 'kit',
      'modulo', k -> 'modulo',
      'inversor', k -> 'inversor',
      'docs', public.eng_docs_snapshot(c.id),
      'docs_faltando', to_jsonb(v_falta),
      'franquia_nome', (select nome from public.franquias where id = c.franquia_id)),
    auth.uid(), public.eng_nome_atual())
  returning id into v_id;

  perform public.eng_log(v_id, 'envio', 'Enviado à engenharia', null, 'validacao');
  if array_length(v_falta, 1) > 0 then
    update public.eng_projetos set alerta = true where id = v_id;
    perform public.eng_log(v_id, 'alerta', 'Enviado com documentos faltando: ' || array_to_string(v_falta, ', '));
  end if;
  perform public.eng_log_cliente(v_id, 'Projeto enviado à engenharia (' || coalesce(v.kit_nome, 'kit') || ')');
  return v_id;
end $function$;

-- Venda nova no card cujo projeto ficou sem venda (a anterior foi excluída): o projeto passa a usar a nova.
create or replace function public.eng_trg_venda_nova()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare p record;
begin
  if new.cliente_id is null then return new; end if;
  for p in select id from public.eng_projetos
            where cliente_id = new.cliente_id and venda_id is null
              and status not in ('cancelado', 'projeto_concluido') loop
    perform public.eng_aplicar_venda(p.id, new.id);
  end loop;
  return new;
end $function$;

-- Venda excluída: o projeto do card passa pra venda que sobrou (se houver) ou fica esperando a nova.
-- O FK (on delete set null) roda antes deste trigger, então o projeto é achado pela foto da venda.
create or replace function public.eng_trg_venda_excluida()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare p record; v_outra uuid;
begin
  if old.cliente_id is null then return old; end if;
  for p in select id, kwp from public.eng_projetos
            where cliente_id = old.cliente_id
              and (venda_id = old.id or (venda_id is null and snapshot -> 'venda' ->> 'id' = old.id::text))
              and status not in ('cancelado', 'projeto_concluido') loop
    select id into v_outra from public.vendas where cliente_id = old.cliente_id order by created_at desc limit 1;
    if v_outra is not null then
      perform public.eng_aplicar_venda(p.id, v_outra);
    else
      update public.eng_projetos set venda_id = null, alerta = true, updated_at = now() where id = p.id;
      perform public.eng_log(p.id, 'alerta', 'Venda excluída: ' || coalesce(old.kit_nome, 'venda')
        || coalesce(' (' || replace(to_char(p.kwp, 'FM9990.00'), '.', ',') || ' kWp)', '')
        || '. O projeto continua e passa a usar a próxima venda registrada para o cliente.');
    end if;
  end loop;
  return old;
end $function$;

drop trigger if exists trg_eng_venda_nova on public.vendas;
create trigger trg_eng_venda_nova after insert on public.vendas
  for each row execute function public.eng_trg_venda_nova();

drop trigger if exists trg_eng_venda_excluida on public.vendas;
create trigger trg_eng_venda_excluida after delete on public.vendas
  for each row execute function public.eng_trg_venda_excluida();

-- Limpeza: card com mais de um projeto fica com o mais antigo (histórico e responsável),
-- que passa a usar a venda mais nova; os outros são cancelados.
do $$
declare r record; d record; v_manter public.eng_projetos%rowtype; v_venda uuid;
begin
  for r in select cliente_id from public.eng_projetos
            where status <> 'cancelado' and cliente_id is not null
            group by cliente_id having count(*) > 1 loop
    select * into v_manter from public.eng_projetos
     where cliente_id = r.cliente_id and status <> 'cancelado' order by created_at limit 1;
    select venda_id into v_venda from public.eng_projetos
     where cliente_id = r.cliente_id and status <> 'cancelado' and venda_id is not null order by created_at desc limit 1;
    for d in select id, status from public.eng_projetos
              where cliente_id = r.cliente_id and status <> 'cancelado' and id <> v_manter.id loop
      update public.eng_projetos set status = 'cancelado', status_desde = now(), updated_at = now() where id = d.id;
      perform public.eng_log(d.id, 'status', 'Projeto repetido do mesmo cliente: unificado no P-' || lpad(v_manter.numero::text, 4, '0'), d.status, 'cancelado');
    end loop;
    if v_venda is not null and v_venda is distinct from v_manter.venda_id then
      perform public.eng_aplicar_venda(v_manter.id, v_venda);
    end if;
  end loop;
end $$;

-- Trava: um projeto (não cancelado) por card.
create unique index if not exists eng_projetos_um_por_card
  on public.eng_projetos (cliente_id) where status <> 'cancelado';
