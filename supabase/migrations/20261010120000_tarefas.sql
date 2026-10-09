-- ============================================================================
-- Tarefas internas (ícone próprio no topo, ao lado do sininho)
-- ----------------------------------------------------------------------------
-- Quem manda:
--   * qualquer pessoa cria tarefa para si mesma (lembrete);
--   * gestor manda para a equipe dele (mesma unidade ou gestor_user_id = ele);
--   * admin manda para qualquer um.
-- Quem vê: só quem mandou e quem recebeu (RLS). Escrita só pelas funções abaixo.
-- Avisos (todos pela public.notificar, da migration 20261007_notificacoes):
--   * tarefa nova -> quem recebe (push só se "urgente");
--   * concluída -> quem mandou (desfazer apaga o aviso ainda não lido);
--   * comentário -> o outro lado (agrupado por tarefa);
--   * 1x no dia do prazo -> quem recebe; 1x quando atrasa -> quem mandou
--     (tarefas_avisar_prazos, rodada pelo pg_cron às 8h de Brasília).
-- ============================================================================

create table if not exists public.tarefas (
  id              uuid primary key default gen_random_uuid(),
  de_user         uuid not null references auth.users(id) on delete cascade,
  de_nome         text,
  para_user       uuid not null references auth.users(id) on delete cascade,
  para_nome       text,
  titulo          text not null check (char_length(titulo) between 1 and 140),
  detalhes        text check (detalhes is null or char_length(detalhes) <= 1000),
  cliente_id      uuid references public.clientes(id) on delete set null,
  cliente_nome    text,
  prazo           date,
  urgente         boolean not null default false,
  feita_em        timestamptz,
  comentarios     jsonb not null default '[]'::jsonb,  -- [{autor, nome, texto, em}]
  aviso_prazo_em  timestamptz,
  aviso_atraso_em timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists tarefas_para_idx on public.tarefas (para_user, feita_em);
create index if not exists tarefas_de_idx on public.tarefas (de_user, created_at desc);
create index if not exists tarefas_cliente_idx on public.tarefas (cliente_id) where cliente_id is not null;
create index if not exists tarefas_prazo_aberta_idx on public.tarefas (prazo) where feita_em is null;

alter table public.tarefas enable row level security;
drop policy if exists tarefas_select_envolvidos on public.tarefas;
create policy tarefas_select_envolvidos on public.tarefas
  for select to authenticated using (auth.uid() = para_user or auth.uid() = de_user);
revoke all on public.tarefas from anon, authenticated;
grant select on public.tarefas to authenticated;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tarefas') then
    alter publication supabase_realtime add table public.tarefas;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- apoio
-- ---------------------------------------------------------------------------
-- "MARCOS LIMA" -> "Marcos"
create or replace function public.tarefa_primeiro_nome(p_nome text)
returns text language sql immutable as $$
  select coalesce(nullif(initcap(lower(split_part(trim(coalesce(p_nome, '')), ' ', 1))), ''), 'Alguém');
$$;

create or replace function public.tarefa_pode_mandar(p_para uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_para is not null and (
    p_para = auth.uid()
    or (public.is_admin() and exists (select 1 from public.user_accounts u where u.user_id = p_para and u.ativo))
    or (public.is_gestor() and exists (
          select 1 from public.user_accounts u
           where u.user_id = p_para and u.ativo
             and (u.franquia_id = public.get_franquia_id() or u.gestor_user_id = auth.uid()))));
$$;

-- mesma regra da policy clientes_vendedor_own (+ engenharia central)
create or replace function public.tarefa_cliente_visivel(p_cliente uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.clientes c
     where c.id = p_cliente
       and (public.is_admin()
         or (public.is_gestor() and c.franquia_id = public.get_franquia_id())
         or (c.vendedor_email = (auth.jwt() ->> 'email') and c.franquia_id = public.get_franquia_id())
         or public.is_eng_central()));
$$;

-- "José da Silva · prazo 10/10"
create or replace function public.tarefa_resumo(p_titulo text, p_cliente text, p_prazo date)
returns text language sql immutable as $$
  select concat_ws(' · ', p_titulo, nullif(trim(coalesce(p_cliente, '')), ''),
                   case when p_prazo is not null then 'prazo ' || to_char(p_prazo, 'DD/MM') end);
$$;

-- ---------------------------------------------------------------------------
-- para quem posso mandar (a lista do "Para quem")
-- ---------------------------------------------------------------------------
create or replace function public.tarefa_destinatarios()
returns table (user_id uuid, nome text, role text, unidade text, eu boolean)
language sql stable security definer set search_path = public as $$
  select u.user_id, coalesce(nullif(trim(u.nome), ''), u.email), u.role, f.nome, u.user_id = auth.uid()
    from public.user_accounts u
    left join public.franquias f on f.id = u.franquia_id
   where u.ativo
     and (u.user_id = auth.uid()
       or public.is_admin()
       or (public.is_gestor() and (u.franquia_id = public.get_franquia_id() or u.gestor_user_id = auth.uid())))
   order by (u.user_id = auth.uid()) desc, 2;
$$;

-- ---------------------------------------------------------------------------
-- criar / editar (p_id null = nova). Editar: só quem mandou (ou admin), só aberta.
-- ---------------------------------------------------------------------------
create or replace function public.tarefa_salvar(
  p_id uuid, p_para uuid, p_titulo text, p_detalhes text default null,
  p_cliente uuid default null, p_prazo date default null, p_urgente boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_tit text := left(trim(coalesce(p_titulo, '')), 140);
  v_det text := nullif(left(trim(coalesce(p_detalhes, '')), 1000), '');
  v_de_nome text; v_para_nome text; v_cli_nome text;
  v_antes public.tarefas; v_id uuid;
begin
  if v_me is null then raise exception 'Entre na plataforma de novo.'; end if;
  if v_tit = '' then raise exception 'Escreva o que precisa ser feito.'; end if;
  if not public.tarefa_pode_mandar(p_para) then raise exception 'Você não pode mandar tarefa para essa pessoa.'; end if;
  if p_cliente is not null then
    if not public.tarefa_cliente_visivel(p_cliente) then raise exception 'Cliente não encontrado.'; end if;
    select nome into v_cli_nome from public.clientes where id = p_cliente;
  end if;
  select coalesce(nullif(trim(nome), ''), email) into v_de_nome from public.user_accounts where user_id = v_me;
  select coalesce(nullif(trim(nome), ''), email) into v_para_nome from public.user_accounts where user_id = p_para;

  if p_id is null then
    insert into public.tarefas (de_user, de_nome, para_user, para_nome, titulo, detalhes, cliente_id, cliente_nome, prazo, urgente)
    values (v_me, v_de_nome, p_para, v_para_nome, v_tit, v_det, p_cliente, v_cli_nome, p_prazo, coalesce(p_urgente, false))
    returning id into v_id;
  else
    select * into v_antes from public.tarefas where id = p_id for update;
    if not found or (v_antes.de_user <> v_me and not public.is_admin()) then raise exception 'Tarefa não encontrada.'; end if;
    if v_antes.feita_em is not null then raise exception 'Essa tarefa já foi concluída.'; end if;
    update public.tarefas
       set para_user = p_para, para_nome = v_para_nome, titulo = v_tit, detalhes = v_det,
           cliente_id = p_cliente, cliente_nome = v_cli_nome, prazo = p_prazo, urgente = coalesce(p_urgente, false),
           aviso_prazo_em = case when p_prazo is distinct from v_antes.prazo then null else aviso_prazo_em end,
           aviso_atraso_em = case when p_prazo is distinct from v_antes.prazo then null else aviso_atraso_em end,
           updated_at = now()
     where id = p_id
    returning id into v_id;
  end if;

  -- avisa quem recebe na criação ou quando a tarefa troca de dono (notificar ignora o próprio autor)
  if p_id is null or v_antes.para_user is distinct from p_para then
    perform public.notificar(p_para, 'tarefa',
      public.tarefa_primeiro_nome(v_de_nome) || ' te passou uma tarefa',
      public.tarefa_resumo(v_tit, v_cli_nome, p_prazo),
      jsonb_build_object('tela', 'tarefa', 'id', v_id), null, coalesce(p_urgente, false));
  end if;
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- concluir / reabrir (só quem recebeu)
-- ---------------------------------------------------------------------------
create or replace function public.tarefa_concluir(p_id uuid, p_feita boolean default true)
returns void language plpgsql security definer set search_path = public as $$
declare t public.tarefas;
begin
  update public.tarefas
     set feita_em = case when p_feita then coalesce(feita_em, now()) end, updated_at = now()
   where id = p_id and para_user = auth.uid()
  returning * into t;
  if not found then raise exception 'Tarefa não encontrada.'; end if;
  if t.de_user = t.para_user then return; end if;

  if p_feita then
    perform public.notificar(t.de_user, 'tarefa_feita',
      public.tarefa_primeiro_nome(t.para_nome) || ' concluiu uma tarefa',
      public.tarefa_resumo(t.titulo, t.cliente_nome, null),
      jsonb_build_object('tela', 'tarefa', 'id', t.id), 'tarefa_feita:' || t.id::text, false);
  else
    delete from public.notificacoes where user_id = t.de_user and grupo = 'tarefa_feita:' || t.id::text and lida_em is null;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- comentar (quem mandou ou quem recebeu)
-- ---------------------------------------------------------------------------
create or replace function public.tarefa_comentar(p_id uuid, p_texto text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_tx text := left(trim(coalesce(p_texto, '')), 500);
  v_nome text; t public.tarefas; v_outro uuid;
begin
  if v_tx = '' then raise exception 'Escreva o comentário.'; end if;
  select coalesce(nullif(trim(nome), ''), email) into v_nome from public.user_accounts where user_id = v_me;
  update public.tarefas
     set comentarios = comentarios || jsonb_build_array(jsonb_build_object('autor', v_me, 'nome', v_nome, 'texto', v_tx, 'em', now())),
         updated_at = now()
   where id = p_id and v_me in (de_user, para_user)
  returning * into t;
  if not found then raise exception 'Tarefa não encontrada.'; end if;

  v_outro := case when v_me = t.de_user then t.para_user else t.de_user end;
  if v_outro <> v_me then
    perform public.notificar(v_outro, 'tarefa_cm',
      public.tarefa_primeiro_nome(v_nome) || ' comentou: ' || t.titulo, v_tx,
      jsonb_build_object('tela', 'tarefa', 'id', t.id), 'tarefa_cm:' || t.id::text, false);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- excluir (quem mandou ou admin). Some também o aviso ainda não lido.
-- ---------------------------------------------------------------------------
create or replace function public.tarefa_excluir(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.tarefas where id = p_id and (de_user = auth.uid() or public.is_admin());
  if not found then raise exception 'Tarefa não encontrada.'; end if;
  delete from public.notificacoes where lida_em is null and alvo ->> 'tela' = 'tarefa' and alvo ->> 'id' = p_id::text;
end $$;

-- ---------------------------------------------------------------------------
-- prazos: 1 aviso no dia do prazo (quem recebe) e 1 quando atrasa (quem mandou)
-- ---------------------------------------------------------------------------
create or replace function public.tarefas_avisar_prazos()
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  t public.tarefas; n integer := 0;
begin
  for t in select * from public.tarefas where feita_em is null and prazo = v_hoje and aviso_prazo_em is null loop
    perform public.notificar(t.para_user, 'tarefa_prazo', 'Vence hoje: ' || t.titulo,
      concat_ws(' · ', case when t.de_user = t.para_user then 'Lembrete seu' else 'De ' || public.tarefa_primeiro_nome(t.de_nome) end, t.cliente_nome),
      jsonb_build_object('tela', 'tarefa', 'id', t.id), 'tarefa_prazo:' || t.id::text, t.urgente);
    update public.tarefas set aviso_prazo_em = now() where id = t.id;
    n := n + 1;
  end loop;

  for t in select * from public.tarefas where feita_em is null and prazo < v_hoje and aviso_atraso_em is null and de_user <> para_user loop
    perform public.notificar(t.de_user, 'tarefa_atrasada', 'Tarefa atrasada: ' || public.tarefa_primeiro_nome(t.para_nome),
      public.tarefa_resumo(t.titulo, t.cliente_nome, t.prazo),
      jsonb_build_object('tela', 'tarefa', 'id', t.id), 'tarefa_atraso:' || t.id::text, false);
    update public.tarefas set aviso_atraso_em = now() where id = t.id;
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- permissões
-- ---------------------------------------------------------------------------
revoke all on function public.tarefa_pode_mandar(uuid) from public, anon;
revoke all on function public.tarefa_cliente_visivel(uuid) from public, anon;
revoke all on function public.tarefa_destinatarios() from public, anon;
revoke all on function public.tarefa_salvar(uuid, uuid, text, text, uuid, date, boolean) from public, anon;
revoke all on function public.tarefa_concluir(uuid, boolean) from public, anon;
revoke all on function public.tarefa_comentar(uuid, text) from public, anon;
revoke all on function public.tarefa_excluir(uuid) from public, anon;
revoke all on function public.tarefas_avisar_prazos() from public, anon, authenticated;
grant execute on function public.tarefa_destinatarios() to authenticated;
grant execute on function public.tarefa_salvar(uuid, uuid, text, text, uuid, date, boolean) to authenticated;
grant execute on function public.tarefa_concluir(uuid, boolean) to authenticated;
grant execute on function public.tarefa_comentar(uuid, text) to authenticated;
grant execute on function public.tarefa_excluir(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- agenda diária (8h de Brasília = 11h UTC). Se o pg_cron não puder ser ligado
-- aqui, as tarefas funcionam igual; só os avisos de prazo ficam sem rodar.
-- ---------------------------------------------------------------------------
do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule(jobid) from cron.job where jobname = 'tarefas-prazos';
  perform cron.schedule('tarefas-prazos', '0 11 * * *', 'select public.tarefas_avisar_prazos()');
exception when others then
  raise notice '[tarefas] pg_cron indisponível (%). Ligue em Database > Extensions e rode de novo este bloco.', sqlerrm;
end $$;
