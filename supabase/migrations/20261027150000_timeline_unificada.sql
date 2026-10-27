-- ============================================================================
-- Timeline unificada (comercial + engenharia) e @ no card da engenharia
-- ----------------------------------------------------------------------------
-- As duas timelines continuam em tabelas separadas (crm_atividades e
-- eng_eventos) e cada tela lê as duas (a RLS de cada uma já vale: comentário
-- interno da engenharia só a engenharia lê). Aqui entra o que falta no banco:
-- * mencao_pessoas devolve também "eng" (engenharia central), para o
--   comentário interno só oferecer gente da engenharia no @;
-- * eng_comentar aceita p_mencao ({mencionados, mencionados_nomes}), que vai
--   para eng_eventos.meta, igual à anotação do comercial;
-- * gatilho em eng_eventos avisa quem foi marcado (interno: só engenharia);
-- * o aviso abre onde a pessoa trabalha: engenharia no card do projeto,
--   comercial na timeline da ficha (as duas mostram a mesma história).
-- ============================================================================

-- Engenharia central (admin ou engenheiro/coord. técnico da Matriz) para OUTRO
-- usuário: mesma regra de is_eng_central, lendo o app_metadata.
create or replace function public.usuario_eng_central(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
      from auth.users a
      join public.user_accounts u on u.user_id = a.id and u.ativo
     where a.id = p_user
       and (
         (a.raw_app_meta_data ->> 'role') = 'admin'
         or ((a.raw_app_meta_data ->> 'franquia_id') = 'af146be2-1489-4ad0-82f8-802b9dec5b6b'
             and lower(coalesce(a.raw_app_meta_data ->> 'role', '')) in ('engenheiro', 'coordenador_tecnico'))
       )
  );
$$;
revoke all on function public.usuario_eng_central(uuid) from public, anon, authenticated;

-- Quem trabalha no ambiente Engenharia (engenheiro/coord. técnico; admin fica no comercial)
create or replace function public.usuario_so_engenharia(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.usuario_eng_central(p_user)
     and coalesce((select (a.raw_app_meta_data ->> 'role') from auth.users a where a.id = p_user), '') <> 'admin';
$$;
revoke all on function public.usuario_so_engenharia(uuid) from public, anon, authenticated;

-- Lista do @ (ficha e card da engenharia): agora com a coluna eng
drop function if exists public.mencao_pessoas(uuid);
create function public.mencao_pessoas(p_cliente uuid)
returns table (user_id uuid, nome text, papel text, eng boolean)
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
         end as papel,
         public.usuario_eng_central(u.user_id) as eng
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

-- Comentário no card da engenharia, agora com as menções
drop function if exists public.eng_comentar(uuid, text, boolean, jsonb);
create function public.eng_comentar(p_id uuid, p_texto text, p_interno boolean default false, p_docs jsonb default null, p_mencao jsonb default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  p public.eng_projetos%rowtype;
  v_meta jsonb;
begin
  select * into p from public.eng_projetos where id = p_id;
  if not found then raise exception 'Projeto não encontrado.'; end if;
  if not (public.is_eng_central() or (p.franquia_id = public.get_franquia_id() and (public.is_gestor() or public.can_access_cliente(p.cliente_id)))) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_texto, ''))) = 0 then raise exception 'Escreva o comentário.'; end if;
  -- só a engenharia marca documentos com problema
  v_meta := case when public.is_eng_central() then public.eng_docs_meta(p_docs) end;
  if jsonb_typeof(p_mencao -> 'mencionados') = 'array' and jsonb_array_length(p_mencao -> 'mencionados') > 0 then
    v_meta := coalesce(v_meta, '{}'::jsonb) || jsonb_build_object(
      'mencionados', p_mencao -> 'mencionados',
      'mencionados_nomes', case when jsonb_typeof(p_mencao -> 'mencionados_nomes') = 'array' then p_mencao -> 'mencionados_nomes' else '[]'::jsonb end);
  end if;
  perform public.eng_log(p_id, 'comentario', trim(p_texto), null, null, coalesce(p_interno, false) and public.is_eng_central(), v_meta);
end $$;
revoke all on function public.eng_comentar(uuid, text, boolean, jsonb, jsonb) from public, anon;
grant execute on function public.eng_comentar(uuid, text, boolean, jsonb, jsonb) to authenticated;

-- Aviso de quem foi marcado num comentário da engenharia
create or replace function public.eng_eventos_avisar_mencao()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid;
  v_autor text;
  v_cli uuid;
  v_cliente text;
  v_alvo jsonb;
begin
  if jsonb_typeof(new.meta -> 'mencionados') <> 'array' then return new; end if;
  select p.cliente_id, coalesce(nullif(trim(p.cliente_nome), ''), 'um cliente')
    into v_cli, v_cliente
    from public.eng_projetos p where p.id = new.projeto_id;
  v_autor := initcap(lower(coalesce(nullif(trim(split_part(new.autor_nome, ' ', 1)), ''), 'Alguém')));

  for v_uid in
    select distinct (x.v)::uuid
      from jsonb_array_elements_text(new.meta -> 'mencionados') as x(v)
     where x.v ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     limit 10
  loop
    -- interno: só a engenharia lê, então só ela é avisada
    if public.usuario_eng_central(v_uid)
       or (not new.interno and v_cli is not null and public.usuario_acessa_cliente(v_uid, v_cli)) then
      v_alvo := case when v_cli is null or public.usuario_so_engenharia(v_uid)
        then jsonb_build_object('tela', 'eng', 'id', new.projeto_id, 'cliente', v_cli, 'aba', 'tl', 'evento', 'eng-' || new.id)
        else jsonb_build_object('tela', 'cliente', 'id', v_cli, 'aba', 'timeline', 'atividade', 'eng-' || new.id) end;
      perform public.notificar(
        v_uid, 'mencao',
        v_autor || ' te marcou no projeto de ' || v_cliente,
        new.texto, v_alvo,
        'mencao:' || coalesce(v_cli::text, new.projeto_id::text),
        true
      );
    end if;
  end loop;
  return new;
exception when others then
  -- o aviso nunca impede de salvar o comentário
  raise warning '[eng_eventos_avisar_mencao] %', sqlerrm;
  return new;
end $$;

drop trigger if exists trg_eng_eventos_mencao on public.eng_eventos;
create trigger trg_eng_eventos_mencao
  after insert on public.eng_eventos
  for each row
  when (new.meta ? 'mencionados')
  execute function public.eng_eventos_avisar_mencao();

-- Anotação do comercial: quem é da engenharia abre no card do projeto
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
  v_proj uuid;
  v_alvo jsonb;
begin
  if jsonb_typeof(new.meta -> 'mencionados') <> 'array' then return new; end if;

  select coalesce(nullif(trim(split_part(u.nome, ' ', 1)), ''), new.autor_email)
    into v_autor
    from public.user_accounts u
   where u.user_id = auth.uid();
  v_autor := initcap(lower(coalesce(v_autor, split_part(new.autor_email, '@', 1), 'Alguém')));
  select coalesce(nullif(trim(c.nome), ''), 'um cliente') into v_cliente from public.clientes c where c.id = new.cliente_id;
  select p.id into v_proj
    from public.eng_projetos p
   where p.cliente_id = new.cliente_id and p.status <> 'cancelado'
   order by p.created_at desc limit 1;

  for v_uid in
    select distinct (x.v)::uuid
      from jsonb_array_elements_text(new.meta -> 'mencionados') as x(v)
     where x.v ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     limit 10
  loop
    if public.usuario_acessa_cliente(v_uid, new.cliente_id) then
      v_alvo := case when v_proj is not null and public.usuario_so_engenharia(v_uid)
        then jsonb_build_object('tela', 'eng', 'id', v_proj, 'cliente', new.cliente_id, 'aba', 'tl', 'evento', new.id::text)
        else jsonb_build_object('tela', 'cliente', 'id', new.cliente_id, 'aba', 'timeline', 'atividade', new.id) end;
      perform public.notificar(
        v_uid, 'mencao',
        v_autor || ' te marcou em ' || v_cliente,
        new.descricao, v_alvo,
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
