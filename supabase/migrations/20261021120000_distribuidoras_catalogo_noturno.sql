-- Catálogo da Belenus renovado de madrugada (03:30 de Brasília), fora do horário de uso.
-- Antes ele era renovado quando a tela abria com o espelho vencido (24 h): na primeira cotação do
-- dia as 4 consultas do catálogo somavam com as da cotação e a Belenus recusou (403, 21/10).
-- Chama a edge function distribuidoras { acao: "atualizar_catalogo" } com o x-internal-secret
-- (vault internal_trigger_secret, o mesmo do push). O Authorization é a chave anon, pública
-- (a mesma do assets/js/config.js), só pra passar pelo verify_jwt da função.

create or replace function public.distribuidoras_catalogo_noturno()
returns void language plpgsql security definer set search_path = public as $$
declare v_secret text; v_base text;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'internal_trigger_secret' limit 1;
  select decrypted_secret into v_base from vault.decrypted_secrets where name = 'edge_functions_base_url' limit 1;
  if v_secret is null or v_base is null then
    raise warning '[distribuidoras_catalogo_noturno] segredos do vault ausentes';
    return;
  end if;
  perform net.http_post(
    url     := v_base || '/distribuidoras',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR6d2p4Z3ByaG9ycXJtcHF1ZGdnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxMjczNTksImV4cCI6MjA4NzcwMzM1OX0.hwfzCb9FGVXX7Uf0pY7zFS6SZHrh0pzWk1gKFVq2DX4',
      'x-internal-secret', v_secret,
      'x-region', 'sa-east-1'),  -- os 403 imediatos vinham da função rodando em us-east-1
    body    := jsonb_build_object('acao', 'atualizar_catalogo', 'provedor', 'belenus'),
    timeout_milliseconds := 60000
  );
end $$;

revoke all on function public.distribuidoras_catalogo_noturno() from public, anon, authenticated;

select cron.schedule('distribuidoras-catalogo', '30 6 * * *', 'select public.distribuidoras_catalogo_noturno()');
