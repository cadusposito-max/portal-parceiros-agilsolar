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
--   * 1x no dia do prazo -> quem recebe; 1x quando atrasa -> quem mandou
--     (tarefas_avisar_prazos, rodada pelo pg_cron às 8h de Brasília).
-- Tarefa ligada a cliente vai para a timeline dele (crm_atividades, tipo
-- 'tarefa'): criada, concluída e excluída. Desfazer a conclusão apaga o registro.
-- Sem comentários: o que precisar de conversa vai pelo chat.
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

-- timeline do cliente (crm_atividades, tipo 'tarefa'); autor = quem fez a ação.
-- Só registra se a tarefa tem cliente; nunca derruba a tarefa.
create or replace function public.tarefa_timeline(t public.tarefas, p_evento text, p_desc text)
returns void language plpgsql security definer set search_path = public as $$
declare v_fr uuid; v_email text;
begin
  if t.cliente_id is null then return; end if;
  select franquia_id into v_fr from public.clientes where id = t.cliente_id;
  if v_fr is null then return; end if;
  select email into v_email from public.user_accounts where user_id = auth.uid();
  insert into public.crm_atividades (cliente_id, franquia_id, autor_email, tipo, descricao, meta)
  values (t.cliente_id, v_fr, coalesce(v_email, auth.jwt() ->> 'email', 'sistema'), 'tarefa', left(p_desc, 300),
          jsonb_build_object('tarefa_id', t.id, 'evento', p_evento, 'de', t.de_nome, 'para', t.para_nome, 'prazo', t.prazo));
exception when others then
  raise warning '[tarefa_timeline] %', sqlerrm;
end $$;

-- "Tarefa para Marcos: Anexar a conta de luz (prazo 10/10)" / "Lembrete: ..."
create or replace function public.tarefa_timeline_criada(t public.tarefas)
returns void language sql security definer set search_path = public as $$
  select public.tarefa_timeline(t, 'criada',
    case when t.de_user = t.para_user then 'Lembrete: ' else 'Tarefa para ' || public.tarefa_primeiro_nome(t.para_nome) || ': ' end
    || t.titulo || coalesce(' (prazo ' || to_char(t.prazo, 'DD/MM') || ')', ''));
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
  v_antes public.tarefas; v_depois public.tarefas; v_id uuid;
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
    returning * into v_depois;
    v_id := v_depois.id;
    perform public.tarefa_timeline_criada(v_depois);
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
    returning * into v_depois;
    v_id := v_depois.id;
    -- ligou a tarefa a um cliente (ou trocou de cliente) na edição: entra na timeline dele
    if p_cliente is distinct from v_antes.cliente_id then perform public.tarefa_timeline_criada(v_depois); end if;
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
declare t public.tarefas; v_estava_feita boolean;
begin
  select feita_em is not null into v_estava_feita from public.tarefas where id = p_id and para_user = auth.uid() for update;
  if not found then raise exception 'Tarefa não encontrada.'; end if;
  if v_estava_feita = coalesce(p_feita, true) then return; end if;  -- clique repetido

  update public.tarefas
     set feita_em = case when p_feita then now() end, updated_at = now()
   where id = p_id
  returning * into t;

  if p_feita then
    perform public.tarefa_timeline(t, 'concluida',
      case when t.de_user = t.para_user then 'Lembrete concluído: ' || t.titulo
           else 'Tarefa concluída por ' || public.tarefa_primeiro_nome(t.para_nome) || ': ' || t.titulo end);
  else
    -- "Desfazer": tira da timeline o registro da conclusão
    delete from public.crm_atividades
     where tipo = 'tarefa' and cliente_id = t.cliente_id
       and meta ->> 'tarefa_id' = t.id::text and meta ->> 'evento' = 'concluida';
  end if;

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
-- excluir (quem mandou ou admin). Some também o aviso ainda não lido;
-- tarefa aberta excluída fica registrada na timeline do cliente.
-- ---------------------------------------------------------------------------
create or replace function public.tarefa_excluir(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare t public.tarefas;
begin
  delete from public.tarefas where id = p_id and (de_user = auth.uid() or public.is_admin())
  returning * into t;
  if not found then raise exception 'Tarefa não encontrada.'; end if;
  delete from public.notificacoes where lida_em is null and alvo ->> 'tela' = 'tarefa' and alvo ->> 'id' = p_id::text;
  if t.feita_em is null then
    perform public.tarefa_timeline(t, 'excluida', 'Tarefa cancelada: ' || t.titulo);
  end if;
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
revoke all on function public.tarefa_excluir(uuid) from public, anon;
revoke all on function public.tarefa_timeline(public.tarefas, text, text) from public, anon, authenticated;
revoke all on function public.tarefa_timeline_criada(public.tarefas) from public, anon, authenticated;
revoke all on function public.tarefas_avisar_prazos() from public, anon, authenticated;
grant execute on function public.tarefa_destinatarios() to authenticated;
grant execute on function public.tarefa_salvar(uuid, uuid, text, text, uuid, date, boolean) to authenticated;
grant execute on function public.tarefa_concluir(uuid, boolean) to authenticated;
grant execute on function public.tarefa_excluir(uuid) to authenticated;

-- versão anterior desta migration tinha comentários nas tarefas (tirados a pedido)
drop function if exists public.tarefa_comentar(uuid, text);
alter table public.tarefas drop column if exists comentarios;

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
