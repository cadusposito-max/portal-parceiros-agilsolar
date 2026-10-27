-- Preço dos kits AVT nas unidades com o catálogo completo (Matriz e Goiânia), pela regra com o frete da AVT de cada uma.
insert into public.precos_franquia (produto_id, franquia_id, price, list_price)
select p.id, f.id, x.preco, private.cc_preco_de(x.preco)
  from public.produtos p cross join (values ('af146be2-1489-4ad0-82f8-802b9dec5b6b'::uuid), ('abb22e55-40d0-466f-b813-76cc5b58d9ca'::uuid)) f(id)
  cross join lateral (select private.cc_preco_markup(private.cc_custo_kit(p.id, f.id), p.categoria = 'kitsMicro') preco) x
 where p.distribuidora_id = '6d7639d8-966c-5dd4-9f0c-e0f0f78e6437' and p.ativo and x.preco > 0
on conflict (produto_id, franquia_id) do update set price = excluded.price, list_price = excluded.list_price;
select private.cc_aplicar_precos('af146be2-1489-4ad0-82f8-802b9dec5b6b'), private.cc_aplicar_precos('abb22e55-40d0-466f-b813-76cc5b58d9ca');
