-- A função da conta usa o slot existente; nomes e objetos do Storage não mudam.
-- Anexos anteriores permanecem sem classificação, para confirmação pelo usuário.
alter table public.cliente_arquivos add constraint cliente_arquivos_conta_funcao_check
  check (tipo <> 'conta_energia' or slot is null or slot in ('geradora', 'compensacao'));

create unique index cliente_arquivos_uma_geradora_idx
  on public.cliente_arquivos (cliente_id)
  where tipo = 'conta_energia' and slot = 'geradora';

-- A permissão nova só altera a identificação, nunca o cliente, o arquivo ou seu autor.
revoke update on public.cliente_arquivos from authenticated;
grant update (slot) on public.cliente_arquivos to authenticated;
create policy cliente_arquivos_classificar_conta on public.cliente_arquivos
  for update to authenticated
  using (tipo = 'conta_energia' and public.can_access_cliente(cliente_id))
  with check (tipo = 'conta_energia' and public.can_access_cliente(cliente_id)
    and (slot is null or slot in ('geradora', 'compensacao')));

create or replace function public.crm_classificar_conta_energia(p_arquivo uuid, p_funcao text)
returns table (arquivo_id uuid, funcao text)
language plpgsql security invoker set search_path = '' as $$
declare
  v_cliente uuid;
begin
  if p_funcao is null or p_funcao not in ('geradora', 'compensacao') then
    raise exception 'Identificação de conta inválida.' using errcode = '22023';
  end if;
  select a.cliente_id into v_cliente from public.cliente_arquivos a
    where a.id = p_arquivo and a.tipo = 'conta_energia';
  if v_cliente is null then
    raise exception 'Conta não encontrada ou sem permissão.' using errcode = '42501';
  end if;

  -- Serializa trocas no mesmo cliente; o índice também protege chamadas diretas.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('conta_energia:' || v_cliente::text, 0));
  perform 1 from public.cliente_arquivos a where a.id = p_arquivo and a.tipo = 'conta_energia' for update;
  if not found then
    raise exception 'Conta não encontrada ou sem permissão.' using errcode = '42501';
  end if;
  if p_funcao = 'geradora' then
    -- A antiga geradora volta a aguardar identificação, sem presumir compensação.
    update public.cliente_arquivos a set slot = null
      where a.cliente_id = v_cliente and a.tipo = 'conta_energia' and a.slot = 'geradora' and a.id <> p_arquivo;
  end if;
  update public.cliente_arquivos a set slot = p_funcao where a.id = p_arquivo;
  if not found then
    raise exception 'Conta não encontrada ou sem permissão.' using errcode = '42501';
  end if;
  return query select a.id, a.slot from public.cliente_arquivos a
    where a.cliente_id = v_cliente and a.tipo = 'conta_energia';
end;
$$;
revoke all on function public.crm_classificar_conta_energia(uuid, text) from public, anon;
grant execute on function public.crm_classificar_conta_energia(uuid, text) to authenticated;

-- Preserva as regras atuais de documentos, incluindo futuras extensões (como PJ).
-- Substitui apenas a condição de conclusão de conta_energia na função existente.
do $migration$
declare
  v_def text := pg_get_functiondef('public.eng_docs_faltando(uuid)'::regprocedure);
  v_antes text := 'a.cliente_id = p_cliente and a.tipo = r.tipo)';
  v_depois text := 'a.cliente_id = p_cliente and a.tipo = r.tipo and (r.tipo <> ''conta_energia'' or a.slot = ''geradora''))
      or (r.tipo = ''conta_energia'' and exists (select 1 from public.cliente_arquivos a where a.cliente_id = p_cliente and a.tipo = ''conta_energia'' and (a.slot is null or a.slot not in (''geradora'', ''compensacao''))))';
begin
  if position(v_antes in v_def) = 0 then
    raise exception 'A definição de eng_docs_faltando mudou; revise a condição de conta de energia antes de aplicar.';
  end if;
  execute replace(v_def, v_antes, v_depois);
end;
$migration$;

notify pgrst, 'reload schema';
