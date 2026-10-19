-- ==========================================================================
-- Andamento das vendas (aba Vendas do Comercial)
--
-- Cada venda mostra 5 etapas: Pagamento · Projeto · Compra e entrega · Obra ·
-- Monitoramento. Pagamento, projeto e compra já existem (fin_titulos,
-- eng_projetos, fin_ordens_compra); aqui entram:
--   1. venda_posvenda: obra e monitoramento (editados na própria aba Vendas
--      por admin/gestor, via RPC venda_posvenda_salvar).
--   2. fin_ordens_compra: entrega junto da compra (status 'entregue',
--      previsao_entrega, entregue_em).
--   3. vendas_andamento(): um resumo por venda, com o RLS de quem chama.
--   4. cliente_id na saída de list_fin_titulos / list_fin_ordens_compra, para
--      o atalho "ver no Financeiro" abrir já filtrado no cliente.
-- Tudo aditivo.
-- ==========================================================================

-- ---------------------------------------------------------------- 1. tabela
create table if not exists public.venda_posvenda (
  venda_id uuid primary key references public.vendas(id) on delete cascade,
  franquia_id uuid references public.franquias(id),
  obra_status text check (obra_status in ('a_agendar', 'agendada', 'em_andamento', 'concluida')),
  obra_data date,
  obra_equipe text,
  obra_obs text,
  mon_status text check (mon_status in ('pendente', 'ativo', 'alerta')),
  mon_app text,
  mon_acesso_cliente boolean,
  mon_obs text,
  updated_by text,
  updated_at timestamptz not null default now()
);

alter table public.venda_posvenda enable row level security;

-- lê quem enxerga a venda (o RLS de vendas vale dentro da subconsulta)
drop policy if exists venda_posvenda_select on public.venda_posvenda;
create policy venda_posvenda_select on public.venda_posvenda
  for select to authenticated
  using (exists (select 1 from public.vendas v where v.id = venda_posvenda.venda_id));

grant select on public.venda_posvenda to authenticated;

-- ------------------------------------------------- 2. entrega junto da compra
alter table public.fin_ordens_compra add column if not exists previsao_entrega date;
alter table public.fin_ordens_compra add column if not exists entregue_em date;

create or replace function public.set_fin_oc_status(p_id uuid, p_status text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
DECLARE v_role text; v_fr uuid; v RECORD;
BEGIN
  IF NOT public.fin_can_use_current_user() THEN RAISE EXCEPTION 'Sem acesso ao Financeiro' USING errcode='42501'; END IF;
  IF p_status NOT IN ('orcamento','aprovar','aprovado','reprovado','comprado','entregue') THEN RAISE EXCEPTION 'Status inválido'; END IF;
  SELECT role, franquia_id INTO v_role, v_fr FROM public.user_accounts WHERE user_id = auth.uid();
  SELECT * INTO v FROM public.fin_ordens_compra WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ordem não encontrada'; END IF;
  IF v_role<>'admin' AND v.franquia_id<>v_fr THEN RAISE EXCEPTION 'Sem acesso' USING errcode='42501'; END IF;
  UPDATE public.fin_ordens_compra
     SET status = p_status,
         entregue_em = CASE WHEN p_status = 'entregue' THEN coalesce(entregue_em, current_date) ELSE NULL END
   WHERE id = p_id;
  IF p_status IN ('comprado','entregue') AND v.fin_projeto_id IS NOT NULL THEN
    UPDATE public.fin_projetos SET etapa=GREATEST(etapa,6) WHERE id=v.fin_projeto_id;
  END IF;
  RETURN jsonb_build_object('ok', true);
END $function$;

-- previsão de entrega (quem tem Financeiro; vazio limpa)
create or replace function public.set_fin_oc_previsao(p_id uuid, p_data date)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
DECLARE v_role text; v_fr uuid; v RECORD;
BEGIN
  IF NOT public.fin_can_use_current_user() THEN RAISE EXCEPTION 'Sem acesso ao Financeiro' USING errcode='42501'; END IF;
  SELECT role, franquia_id INTO v_role, v_fr FROM public.user_accounts WHERE user_id = auth.uid();
  SELECT * INTO v FROM public.fin_ordens_compra WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ordem não encontrada'; END IF;
  IF v_role<>'admin' AND v.franquia_id<>v_fr THEN RAISE EXCEPTION 'Sem acesso' USING errcode='42501'; END IF;
  UPDATE public.fin_ordens_compra SET previsao_entrega = p_data WHERE id = p_id;
  RETURN jsonb_build_object('ok', true);
END $function$;

grant execute on function public.set_fin_oc_previsao(uuid, date) to authenticated;

-- mesma função de antes + cliente_id, previsao_entrega e entregue_em
create or replace function public.list_fin_ordens_compra(p_filter text DEFAULT 'todos'::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
DECLARE v jsonb; v_role text; v_fr uuid; v_imp numeric; v_com numeric; v_roy numeric;
BEGIN
  IF NOT public.fin_can_use_current_user() THEN RAISE EXCEPTION 'Sem acesso ao Financeiro' USING errcode='42501'; END IF;
  SELECT role, franquia_id INTO v_role, v_fr FROM public.user_accounts WHERE user_id = auth.uid();
  v_imp := coalesce((select (valor #>> '{}')::numeric from public.fin_config where chave='imposto_pct'), 18);
  v_com := coalesce((select (valor #>> '{}')::numeric from public.fin_config where chave='comissao_pct'), 10);
  v_roy := coalesce((select (valor #>> '{}')::numeric from public.fin_config where chave='royalties_pct'), 4.5);
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',oc.id,'cliente_id',oc.cliente_id,'cli',COALESCE(cl.nome,'—'),'fornecedor',COALESCE(oc.fornecedor,'—'),'codigo',COALESCE(oc.codigo,'—'),
    'valor',oc.valor,'valor_projeto',COALESCE(pj.valor_total,0),
    'margem', CASE WHEN COALESCE(pj.valor_total,0)>0 THEN round(
        ( pj.valor_total
          - ( oc.valor
              + COALESCE((select sum(coalesce(nullif(fc.realizado,0),fc.previsto,0)) from public.fin_custos fc
                          where fc.fin_projeto_id=oc.fin_projeto_id and lower(fc.categoria) !~ 'kit'),0)
              + round((pj.valor_total - oc.valor)*v_imp/100,2)
              + round(pj.valor_total*v_com/100,2)
              + round(pj.valor_total*v_roy/100,2)
            )
        ) / pj.valor_total * 100, 1) ELSE NULL END,
    'modulos',COALESCE(oc.modulos,'—'),'inversor',COALESCE(oc.inversor,'—'),'potencia',COALESCE(oc.potencia,'—'),
    'responsavel',COALESCE(oc.responsavel,'—'),'validade',to_char(oc.validade,'DD/MM'),'status',oc.status,
    'previsao_entrega',to_char(oc.previsao_entrega,'YYYY-MM-DD'),'entregue_em',to_char(oc.entregue_em,'DD/MM')
  ) ORDER BY oc.created_at DESC), '[]'::jsonb) INTO v
  FROM public.fin_ordens_compra oc
  LEFT JOIN public.clientes cl ON cl.id=oc.cliente_id
  LEFT JOIN public.fin_projetos pj ON pj.id=oc.fin_projeto_id
  WHERE (v_role='admin' OR oc.franquia_id=v_fr)
    AND (p_filter='todos' OR oc.status=p_filter);
  RETURN v;
END $function$;

-- mesma função de antes + cliente_id
create or replace function public.list_fin_titulos(p_filter text DEFAULT 'todos'::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v jsonb; v_role text; v_fr uuid;
begin
  if not public.fin_can_use_current_user() then raise exception 'Sem acesso ao Financeiro' using errcode='42501'; end if;
  select role, franquia_id into v_role, v_fr from public.user_accounts where user_id = auth.uid();
  with e as (
    select ti.*, coalesce((select sum(b.valor) from public.fin_titulo_baixas b where b.fin_titulo_id=ti.id),0) as pago
    from public.fin_titulos ti
    where ti.status <> 'cancelado' and (v_role='admin' or ti.franquia_id = v_fr)
  ), c as (
    select *, (valor - pago) as saldo,
      case when valor - pago <= 0 then 'pago'
           when vencimento is not null and vencimento < current_date then 'vencido'
           when vencimento is not null and vencimento <= current_date + 30 then 'a_vencer'
           else 'aberto' end as est
    from e
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id, 'cliente_id', c.cliente_id, 'cli', coalesce(cl.nome,'—'), 'proj', coalesce(c.descricao,'—'), 'doc', coalesce(c.documento,'—'),
    'desc_raw', coalesce(c.descricao,''), 'doc_raw', coalesce(c.documento,''),
    'emi', to_char(c.emissao,'DD/MM'), 'venc', to_char(c.vencimento,'DD/MM'),
    'emi_iso', to_char(c.emissao,'YYYY-MM-DD'), 'venc_iso', to_char(c.vencimento,'YYYY-MM-DD'),
    'valor', c.valor, 'pago', c.pago, 'saldo', c.saldo,
    'st', case when c.est='pago' then 'pago' when c.est='vencido' then 'vencido' else 'avencer' end
  ) order by c.vencimento nulls last), '[]'::jsonb) into v
  from c left join public.clientes cl on cl.id = c.cliente_id
  where p_filter='todos'
     or (p_filter='pago'    and c.est='pago')
     or (p_filter='vencido' and c.est='vencido')
     or (p_filter='avencer' and c.est in ('a_vencer','aberto'));
  return v;
end $function$;

-- ------------------------------------------- 3. resumo por venda (invoker)
-- Roda com o RLS de quem chama: cada parte só aparece se a pessoa já podia
-- ler aquela tabela (vendedor vê as vendas dele, gestor as da unidade...).
create or replace function public.vendas_andamento()
 returns jsonb
 language sql
 stable
 security invoker
 set search_path to 'public'
as $function$
  select coalesce(jsonb_agg(jsonb_build_object(
    'venda_id', v.id,
    'pag', (
      select jsonb_build_object(
        'n', count(*),
        'total', coalesce(sum(t.valor), 0),
        'pago', coalesce(sum(b.pago), 0),
        'vencidos', count(*) filter (where t.vencimento < current_date and t.valor - coalesce(b.pago, 0) > 0),
        'prox_venc', min(t.vencimento) filter (where t.valor - coalesce(b.pago, 0) > 0))
      from fin_projetos fp
      join fin_titulos t on t.fin_projeto_id = fp.id and t.status <> 'cancelado' and t.tipo = 'entrada'
      left join lateral (select sum(x.valor) as pago from fin_titulo_baixas x where x.fin_titulo_id = t.id) b on true
      where fp.venda_id = v.id),
    'eng', (
      select jsonb_build_object('status', e.status, 'desde', e.status_desde, 'numero', e.numero,
                                'protocolo', e.protocolo, 'concessionaria', e.concessionaria)
      from eng_projetos e
      where e.status <> 'cancelado' and (e.venda_id = v.id or (e.venda_id is null and e.cliente_id = v.cliente_id))
      order by (e.venda_id = v.id) desc nulls last, e.created_at desc limit 1),
    'oc', (
      select jsonb_build_object('status', o.status, 'fornecedor', o.fornecedor,
                                'previsao', o.previsao_entrega, 'entregue_em', o.entregue_em, 'desde', o.updated_at)
      from fin_projetos fp join fin_ordens_compra o on o.fin_projeto_id = fp.id
      where fp.venda_id = v.id and o.status <> 'reprovado'
      order by o.created_at desc limit 1),
    'fin_etapa', (select fp.etapa from fin_projetos fp where fp.venda_id = v.id order by fp.created_at desc limit 1),
    'pos', (select to_jsonb(p) - 'venda_id' - 'franquia_id' from venda_posvenda p where p.venda_id = v.id)
  )), '[]'::jsonb)
  from vendas v;
$function$;

grant execute on function public.vendas_andamento() to authenticated;

-- ------------------------------------------- 4. salvar obra / monitoramento
-- Admin ou gestor da unidade. Só os campos enviados mudam; a timeline do
-- cliente recebe o "de → para" de cada um.
create or replace function public.venda_posvenda_salvar(p_venda_id uuid, p_dados jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v vendas%rowtype;
  antes venda_posvenda%rowtype;
  depois venda_posvenda%rowtype;
  campos text[] := array['obra_status','obra_data','obra_equipe','obra_obs','mon_status','mon_app','mon_acesso_cliente','mon_obs'];
  rot jsonb := '{"obra_status":"Obra","obra_data":"Data da obra","obra_equipe":"Equipe da obra","obra_obs":"Obs. da obra","mon_status":"Monitoramento","mon_app":"App de monitoramento","mon_acesso_cliente":"Cliente com acesso ao app","mon_obs":"Obs. do monitoramento"}';
  nomes jsonb := '{"a_agendar":"A agendar","agendada":"Agendada","em_andamento":"Em andamento","concluida":"Concluída","pendente":"Configurar","ativo":"Monitorando","alerta":"Sem comunicar","true":"Sim","false":"Não"}';
  c text; de text; para text; mudancas text[] := '{}';
begin
  select * into v from vendas where id = p_venda_id;
  if not found then raise exception 'Venda não encontrada.'; end if;
  if not (is_admin() or (is_gestor() and v.franquia_id = get_franquia_id())) then
    raise exception 'Só admin ou gestor da unidade atualiza obra e monitoramento.' using errcode = '42501';
  end if;

  select * into antes from venda_posvenda where venda_id = v.id;
  insert into venda_posvenda (venda_id, franquia_id) values (v.id, v.franquia_id) on conflict (venda_id) do nothing;

  update venda_posvenda set
    obra_status = case when p_dados ? 'obra_status' then nullif(p_dados->>'obra_status', '') else obra_status end,
    obra_data = case when p_dados ? 'obra_data' then nullif(p_dados->>'obra_data', '')::date else obra_data end,
    obra_equipe = case when p_dados ? 'obra_equipe' then nullif(trim(p_dados->>'obra_equipe'), '') else obra_equipe end,
    obra_obs = case when p_dados ? 'obra_obs' then nullif(trim(p_dados->>'obra_obs'), '') else obra_obs end,
    mon_status = case when p_dados ? 'mon_status' then nullif(p_dados->>'mon_status', '') else mon_status end,
    mon_app = case when p_dados ? 'mon_app' then nullif(trim(p_dados->>'mon_app'), '') else mon_app end,
    mon_acesso_cliente = case when p_dados ? 'mon_acesso_cliente' then nullif(p_dados->>'mon_acesso_cliente', '')::boolean else mon_acesso_cliente end,
    mon_obs = case when p_dados ? 'mon_obs' then nullif(trim(p_dados->>'mon_obs'), '') else mon_obs end,
    updated_by = coalesce(auth.jwt() ->> 'email', 'sistema'),
    updated_at = now()
  where venda_id = v.id
  returning * into depois;

  foreach c in array campos loop
    de := to_jsonb(antes) ->> c;
    para := to_jsonb(depois) ->> c;
    if de is distinct from para then
      if c = 'obra_data' then
        de := to_char(de::date, 'DD/MM/YYYY'); para := to_char(para::date, 'DD/MM/YYYY');
      end if;
      mudancas := mudancas || format('%s: %s → %s', rot ->> c, coalesce(nomes ->> de, de, '—'), coalesce(nomes ->> para, para, '—'));
    end if;
  end loop;

  if v.cliente_id is not null and array_length(mudancas, 1) > 0 then
    insert into crm_atividades (cliente_id, franquia_id, autor_email, tipo, descricao, meta)
    values (v.cliente_id, v.franquia_id, coalesce(auth.jwt() ->> 'email', 'sistema'), 'venda',
      array_to_string(mudancas, ' · '),
      jsonb_build_object('acao', 'posvenda', 'venda_id', v.id));
  end if;

  return to_jsonb(depois) - 'franquia_id';
end $function$;

grant execute on function public.venda_posvenda_salvar(uuid, jsonb) to authenticated;
