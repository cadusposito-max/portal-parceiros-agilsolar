# Centro de custo por tamanho do sistema — 09/10/2026

Implementação local. A migração foi executada no banco em transações com ROLLBACK; nenhuma configuração ou proposta de produção foi alterada. A função distribuidoras e o frontend ainda precisam ser publicados juntos com a migração.

## Comportamento

- Linhas em R$ aceitam valor fixo, por módulo ou por kWp. Linhas percentuais continuam aceitando venda e venda menos kit.
- Projeto c/ ART passa a se chamar ART. O projeto da Rede usa a faixa de kWp e o indicador de cobrança da unidade. **A ART é à parte do projeto da Rede (decisão do usuário, 09/10) e soma sempre.** Cenários de DRE salvos antes com ART dentro do projeto continuam como foram salvos.
- Admin e gestor podem escolher Markup atual ou Custos + margem alvo nas novas cotações da distribuidora. Markup permanece o padrão. O custo com frete vem da cotação no servidor; o navegador não define esse preço.
- A cotação salva as linhas, a margem, as dimensões e o modo usados. A DRE reaproveita esse retrato. Cenários de DRE antigos mantêm suas linhas salvas; não se adiciona automaticamente um projeto da Rede a eles.
- O simulador do centro de custo compara preço e margem usando os valores da tela. Não altera os kits promocionais.
- Piso promocional (cotação no modo custos): o preço final é o maior entre o preço por custos e o preço, na unidade, do kit promocional do mesmo tipo (inversor ou micro) com o mesmo número de placas. A diferença fica como ajuste comercial (receita), separada das despesas no snapshot. Sem promocional equivalente (ex.: mais de 20 placas), não há piso.
- A comparação também mostra quanto cabe em despesas adicionais mantendo 19,5% no preço promocional, ou o resultado que falta para atingir essa referência. Esse saldo não é uma tarifa de elétrica.
- A opção de estimativa Helte preenche instalação em 70/módulo e reserva na elétrica de 139,83/kWp (preço da Matriz, cabo 4,25), apenas sob premissas comerciais compatíveis. Salvar continua explícito. A [engenharia reversa](ENGENHARIA-REVERSA.md) documenta os 33 kits, a margem média de 19,5% e as exceções; valores individuais variam. O comparador avisa quando a margem está abaixo da mínima.
- Dados dimensionais ausentes, percentuais inviáveis e projeto acima da tabela impedem calcular o preço alvo.

## Evidências do banco

33 kits promocionais ativos, todos da Matriz. Nenhum tinha custo preenchido nos dois componentes vinculados (módulo e inversor). Também são necessários estrutura, demais materiais e frete para um custo completo. As cotações existentes usam outros equipamentos; não são equivalentes exatos aos promocionais SOFAR/HOYMILES.

Matriz: imposto 13,8% sobre venda menos kit; comissão 8% sobre venda; ART cadastrada 110; placas de advertência 30; instalação cadastrada 70 fixos; elétrica 0; margem mínima 18% e alvo 22%. Nenhum desses valores foi alterado em produção.

Existe um cadastro anterior em custos_extras com Material CA de 150/kWp, mas ele não comprova o custo atual. Esse número foi usado apenas em testes sintéticos, não aplicado à unidade. A referência de 19,5% dos promocionais foi fornecida pelo usuário; não é margem auditada.

A planilha Helte enviada depois permite reconstruir custos históricos de kits com frete. A [conferência detalhada](CALIBRACAO-HELTE.md) compara 30 promocionais com composição aproximadamente compatível e separa três com inversores divergentes. Vinte dos 30 já ficam abaixo de 22% de margem antes da elétrica, usando instalação por módulo. A origem deixa serviços zerados e não permite definir a tarifa real de elétrica.

## Ativação e calibração

1. Aplicar a migração 20261009122917_centro_custo_dimensionado.sql.
2. Publicar a função atualizada em supabase/functions/distribuidoras/index.ts (verify_jwt=true preservado). Publicar os arquivos do frontend juntos, incluindo centro-custo-calc.js.
3. Na Matriz, selecionar Por módulo para os 70 da instalação, preservando o valor. Validar ART e a tarifa de elétrica antes de usar custos nas vendas. Nas demais unidades, configurar e salvar o centro de custo próprio.
4. Inserir custos completos e atuais de kits pequenos, médios e grandes no comparador. Conferir composição, preço calculado e margem no promocional. Se o calculado ficar mais barato, investigar custo/composição/margem; não aumentar a elétrica só para forçar a comparação.

## Verificação

- 17 testes de cálculo e integração: dimensões, centavos/margem, bases antigas, dados ausentes, margem inviável, extras, faixas da Rede, markup padrão, permissões, snapshot, ausência de fallback silencioso, saldo de despesas e calibração reversa Helte.
- 23 testes existentes de integração Belenus passaram.
- Testes SQL com rollback: persistência de bases, projeto/ART sem duplicação, rejeição de entradas inválidas, restrição das RPCs e acesso sem autenticação.
- Navegador com dados sintéticos em 1440 e 390 px: seleção de promocional, cálculo, salvar configuração, DRE e salvar cenário. Sem erros de JavaScript ou rolagem horizontal.
- Testes reproduzíveis incluídos no repositório: `node --test tests/centro-custo/*.test.cjs` (Node.js 24).
- Capturas e verificações adicionais: .codex/qa/centro-custo no workspace pai.
