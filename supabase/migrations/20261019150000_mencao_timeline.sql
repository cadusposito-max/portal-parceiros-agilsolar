-- ============================================================================
-- Menção com @ nas anotações da timeline do cliente
-- ----------------------------------------------------------------------------
-- * mencao_pessoas(cliente): quem pode ser marcado = quem consegue abrir esse
--   cliente (mesma regra de can_access_cliente: admin, engenharia da Matriz,
--   gestor da unidade do cliente, vendedor responsável). Quem chama não entra.
-- * a anotação guarda os ids em crm_atividades.meta.mencionados; o gatilho
--   avisa cada um pela public.notificar (tipo 'mencao', com push). Quem não
--   abre o cliente é ignorado e o autor nunca recebe (notificar já pula).
-- * sem flood: grupo por cliente, então várias menções do mesmo cliente antes
--   de a pessoa abrir viram um aviso só (o celular troca, não empilha).
-- ============================================================================

-- Mesma regra de can_access_cliente, só que para OUTRO usuário (lê o papel e a
-- unidade do app_metadata, igual ao JWT que a RLS usa).
create or replace function public.usuario_acessa_cliente(p_user uuid, p_cliente uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
      from public.clientes c
      join auth.users a on a.id = p_user
      join public.user_accounts u on u.user_id = p_user and u.ativo
     where c.id = p_cliente
       and (
         (a.raw_app_meta_data ->> 'role') = 'admin'
         or ((a.raw_app_meta_data ->> 'franquia_id') = 'af146be2-1489-4ad0-82f8-802b9dec5b6b'
             and lower(coalesce(a.raw_app_meta_data ->> 'role', '')) in ('engenheiro', 'coordenador_tecnico'))
         or ((a.raw_app_meta_data ->> 'role') = 'gestor' and (a.raw_app_meta_data ->> 'franquia_id') = c.franquia_id::text)
         or (lower(c.vendedor_email) = lower(a.email) and (a.raw_app_meta_data ->> 'franquia_id') = c.franquia_id::text)
       )
  );
$$;
revoke all on function public.usuario_acessa_cliente(uuid, uuid) from public, anon, authenticated;

-- Lista do @ na ficha
create or replace function public.mencao_pessoas(p_cliente uuid)
returns table (user_id uuid, nome text, papel text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select u.user_id,
         coalesce(nullif(trim(u.nome), ''), a.email) as nome,
         case
           when lower(c.vendedor_email) = lower(a.email) then 'Responsável pelo cliente'
           when (a.raw_app_meta_data ->> 'role') = 'admin' then 'Matriz · Admin'
           when (a.raw_app_meta_data ->> 'role') = 'gestor'
             then 'Gestor · ' || coalesce(regexp_replace(f.nome, '^\s*[ÁA]gil Solar\s*', '', 'i'), 'unidade')
           else 'Matriz · Engenharia'
         end as papel
    from public.clientes c
    join public.user_accounts u on u.ativo
    join auth.users a on a.id = u.user_id
    left join public.franquias f on f.id = u.franquia_id
   where c.id = p_cliente
     and public.can_access_cliente(p_cliente)
     and u.user_id <> auth.uid()
     and public.usuario_acessa_cliente(u.user_id, p_cliente)
   order by (lower(c.vendedor_email) = lower(a.email)) desc,
            ((a.raw_app_meta_data ->> 'role') = 'gestor') desc,
            2;
$$;
revoke all on function public.mencao_pessoas(uuid) from public, anon;
grant execute on function public.mencao_pessoas(uuid) to authenticated;

-- Aviso para quem foi marcado
create or replace function public.crm_atividades_avisar_mencao()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid;
  v_autor text;
  v_cliente text;
begin
  if jsonb_typeof(new.meta -> 'mencionados') <> 'array' then return new; end if;

  select coalesce(nullif(trim(split_part(u.nome, ' ', 1)), ''), new.autor_email)
    into v_autor
    from public.user_accounts u
   where u.user_id = auth.uid();
  v_autor := initcap(lower(coalesce(v_autor, split_part(new.autor_email, '@', 1), 'Alguém')));
  select coalesce(nullif(trim(c.nome), ''), 'um cliente') into v_cliente from public.clientes c where c.id = new.cliente_id;

  for v_uid in
    select distinct (x.v)::uuid
      from jsonb_array_elements_text(new.meta -> 'mencionados') as x(v)
     where x.v ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     limit 10
  loop
    if public.usuario_acessa_cliente(v_uid, new.cliente_id) then
      perform public.notificar(
        v_uid, 'mencao',
        v_autor || ' te marcou em ' || v_cliente,
        new.descricao,
        jsonb_build_object('tela', 'cliente', 'id', new.cliente_id, 'aba', 'timeline', 'atividade', new.id),
        'mencao:' || new.cliente_id,
        true
      );
    end if;
  end loop;
  return new;
exception when others then
  -- o aviso nunca impede de salvar a anotação
  raise warning '[crm_atividades_avisar_mencao] %', sqlerrm;
  return new;
end $$;

drop trigger if exists trg_crm_atividades_mencao on public.crm_atividades;
create trigger trg_crm_atividades_mencao
  after insert on public.crm_atividades
  for each row
  when (new.meta ? 'mencionados')
  execute function public.crm_atividades_avisar_mencao();
