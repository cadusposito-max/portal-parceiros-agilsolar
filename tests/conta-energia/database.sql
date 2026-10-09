-- Executar em transação com ROLLBACK; usa anexos sintéticos, sem objetos de Storage.
do $$
declare v_cliente uuid; v_franquia uuid; v_user uuid; v_email text;
begin
  select c.id,c.franquia_id into strict v_cliente,v_franquia from public.clientes c
    where c.franquia_id is not null and not exists(select 1 from public.cliente_arquivos a where a.cliente_id=c.id and a.tipo='conta_energia') limit 1;
  select u.id,u.email into strict v_user,v_email from auth.users u join public.user_accounts a on a.user_id=u.id where a.role='admin' limit 1;
  perform set_config('test.conta_cliente',v_cliente::text,true);
  perform set_config('test.conta_franquia',v_franquia::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_user,'email',v_email,'role','authenticated','app_metadata',jsonb_build_object('role','admin','franquia_id',v_franquia))::text,true);
end $$;
set local role authenticated;
insert into public.cliente_arquivos(id,cliente_id,franquia_id,tipo,nome_original,storage_path)
select id,current_setting('test.conta_cliente')::uuid,current_setting('test.conta_franquia')::uuid,'conta_energia','Original.pdf',
  'franquias/'||current_setting('test.conta_franquia')||'/clientes/'||current_setting('test.conta_cliente')||'/conta_energia/test-'||id::text
from (values ('ea000000-0000-4000-8000-000000000001'::uuid),('ea000000-0000-4000-8000-000000000002'::uuid)) t(id);
do $$
declare v_count int;
begin
  if not ('Conta de energia'=any(public.eng_docs_faltando(current_setting('test.conta_cliente')::uuid))) then raise exception 'Unclassified accounts should remain pending'; end if;
  perform * from public.crm_classificar_conta_energia('ea000000-0000-4000-8000-000000000001','geradora');
  perform * from public.crm_classificar_conta_energia('ea000000-0000-4000-8000-000000000002','compensacao');
  if 'Conta de energia'=any(public.eng_docs_faltando(current_setting('test.conta_cliente')::uuid)) then raise exception 'Classified accounts should complete checklist'; end if;
  perform * from public.crm_classificar_conta_energia('ea000000-0000-4000-8000-000000000002','geradora');
  select count(*) into v_count from public.cliente_arquivos where cliente_id=current_setting('test.conta_cliente')::uuid and tipo='conta_energia' and slot='geradora';
  if v_count<>1 then raise exception 'Exactly one generator expected'; end if;
  if (select slot is not null from public.cliente_arquivos where id='ea000000-0000-4000-8000-000000000001') then raise exception 'Previous generator should require confirmation'; end if;
  begin
    update public.cliente_arquivos set slot='geradora' where id='ea000000-0000-4000-8000-000000000001';
    raise exception 'Unique generator protection failed';
  exception when unique_violation then null; end;
  begin
    update public.cliente_arquivos set nome_original='Renamed.pdf' where id='ea000000-0000-4000-8000-000000000001';
    raise exception 'Filename update was incorrectly granted';
  exception when insufficient_privilege then null; end;
  begin
    perform * from public.crm_classificar_conta_energia('ea000000-0000-4000-8000-000000000001','invalid');
    raise exception 'Invalid classification accepted';
  exception when invalid_parameter_value then null; end;
  if not exists(select 1 from jsonb_array_elements(public.eng_docs_snapshot(current_setting('test.conta_cliente')::uuid)) d where d->>'slot'='geradora' and d->>'nome'='Original.pdf') then raise exception 'Snapshot did not include classification'; end if;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub','ea000000-0000-4000-8000-000000000099','email','conta-test-no-access@example.invalid','role','authenticated')::text,true);
set local role authenticated;
do $$ begin
  begin
    perform * from public.crm_classificar_conta_energia('ea000000-0000-4000-8000-000000000001','geradora');
    raise exception 'Unrelated user accessed an account';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
  if has_function_privilege('anon','public.crm_classificar_conta_energia(uuid,text)','EXECUTE') then raise exception 'Anonymous execute permission'; end if;
end $$;
select 'PASS: persistence, atomic generator switch, unchanged filenames, checklist, snapshot and access control' as result;
