# Conferência da referência Helte — 09/10/2026

Fonte: `Helte_RONMA620W_ate150_DRE_relacao_30-09.xlsx`, fornecida pelo usuário. A aba Preços informa 06/10/2026; o nome do arquivo indica 30/09. A referência usa RONMA 620 W, estrutura para telha cerâmica e frete para Araçatuba-SP. Não representa uma cotação atual de qualquer distribuidora ou cidade.

O arquivo original foi somente lido. As 5.911 fórmulas não têm resultados em cache. Os custos foram reconstruídos a partir das fórmulas e dos valores de entrada, para os 293 kits (146 com inversor, 147 com microinversor). A comparação com os 64 valores cotados manualmente nas colunas N de Kits Inversor e L de Kits Micro teve diferença absoluta máxima de R$ 0,07.

## O que a planilha permite conferir

O custo do kit inclui módulos, inversor/microinversores, estrutura, cabos CC, conectores e frete. Não inclui instalação, materiais elétricos CA ou outros serviços externos ao kit.

A DRE de origem usa imposto de 13,8% sobre venda menos kit e comissão de 6% sobre venda. Projeto/ART, instalação, elétrica e demais serviços estão zerados (`DRE!C6:C17`). A margem alvo de 22% é referência em uma coluna separada; os preços de venda são calculados por relação/markup. Portanto a planilha, sozinha, não confirma uma margem líquida de 19,5% após todos os serviços.

A relação de microinversores da planilha (1,71552187556326 com fator 1,05) também difere da regra atual da plataforma (1,7498326202954417 com fator 1,071). A conferência usa os preços promocionais cadastrados no banco em 09/10/2026, sem substituir a regra de markup pela da planilha.

## Premissas da comparação com a Matriz

- Imposto 13,8% sobre venda menos kit; comissão 8% sobre venda, conforme configuração da unidade.
- Instalação R$ 70 **por módulo**, como solicitado. O cadastro em produção ainda está como fixo.
- ART R$ 110 e placas de advertência R$ 30 por venda.
- Projeto da Rede desativado na Matriz; royalties e publicidade zerados.
- Elétrica e demais despesas não informadas continuam zeradas apenas nesta simulação.
- Margem alvo 22%; 19,5% é a referência comercial indicada pelo usuário.

Dos 33 promocionais, três com inversor foram excluídos por diferença de potência do equipamento:

| Módulos | Inversor cadastrado | Faixa da planilha |
| --- | --- | --- |
| 8 | SOFAR 3,3 kW | SOFAR 5 kW |
| 13 | SOFAR 6 kW | SOFAR 5 kW |
| 17 | SOFAR 6 kW | SOFAR 7,5 kW |

Os outros 30 têm potência/quantidade compatíveis para uma aproximação histórica: 13 inversores e 17 microinversores. Isso não comprova equivalência de todos os componentes. Por exemplo, o cadastro SOFAR 3300TL-G3 difere do nome 3.3KTL2-G3 da planilha, e o cadastro HOYMILES não informa o modelo completo HMS-2250-4T. Não foi atribuído custo de componente automaticamente a esses produtos.

## Resultado antes da elétrica

| Grupo | Kits | Margem média simples | Faixa de margens | Abaixo de 22% | Abaixo de 19,5% |
| --- | ---: | ---: | --- | ---: | ---: |
| Inversor | 13 | 21,75% | 19,94% a 23,15% | 7 | 0 |
| Microinversor | 17 | 21,09% | 19,45% a 29,53% | 13 | 1 |
| Total | 30 | 21,38% | 19,45% a 29,53% | 20 | 1 |

São estimativas sem elétrica e sem despesas ausentes; não margens auditadas das vendas. A média não é ponderada por faturamento. Em 20 dos 30 casos, o preço por custos com alvo de 22% já supera o promocional. Nos outros dez, é necessário validar composição e despesas; não se deve inventar um custo para forçar que o preço calculado supere a promoção.

Valores em R$:

| Kit | Fonte do custo | Kit + frete | Promocional | Venda para 22%, sem elétrica | Margem no promocional | Saldo para despesas mantendo 19,5% |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Inversor, 5 módulos | Kits Inversor!M5 | 5.203,31 | 8.997,00 | 8.852,77 | 22,90% | 305,98 |
| Inversor, 10 módulos | Kits Inversor!M10 | 8.636,62 | 14.997,00 | 14.741,58 | 22,96% | 518,47 |
| Inversor, 20 módulos | Kits Inversor!M20 | 16.348,02 | 26.997,00 | 27.814,94 | 20,30% | 215,24 |
| Micro, 5 módulos | Kits Micro!K6 | 5.791,29 | 10.171,29 | 9.754,62 | 24,30% | 488,45 |
| Micro, 10 módulos | Kits Micro!K11 | 10.021,09 | 16.297,00 | 16.865,09 | 20,04% | 88,15 |
| Micro, 19 módulos | Kits Micro!K20 | 18.329,09 | 29.397,00 | 30.728,97 | 19,45% | -13,64 |
| Micro, 20 módulos | Kits Micro!K21 | 18.812,84 | 30.397,00 | 31.595,50 | 19,78% | 86,37 |

O saldo é `lucro líquido calculado − preço de venda × 19,5%`, limitado para baixo a centavos inteiros. Considera os arredondamentos de cada linha da DRE. Positivo é o máximo que ainda cabe em despesas adicionais **fora do kit**; negativo é o resultado que falta para atingir a referência. Não é uma estimativa de elétrica, nem um aumento de preço recomendado (a mudança de preço também muda os custos percentuais).

## Reconstrução do custo de origem

Valores em `Preços!B5:C19`: módulo 548; perfil 44,64; fixação para quatro 135,65; fixação para dois 72,72; cabo 5,87/m por cor; par de conectores 12; micro 942,49 e fixação do micro 9.

Para N módulos: perfis = 2 × teto(N/2); fixações para quatro = piso(perfis/4); fixações para dois = resto(perfis,4)/2. Cabo por cor: 3N até 19 módulos; teto(2,5N) entre 20 e 50; 2N a partir de 51. Microinversores = teto(N/4), com quatro pares de conectores por micro. Inversores usam uma unidade e as faixas de `Preços!A23:F30`.

Frete: para materiais abaixo de R$ 25.000, máximo entre R$ 400 e 3,8494%; a partir de R$ 25.000, 3,1394%. Somar materiais e frete e arredondar o custo total a duas casas, como nas colunas M/K. As taxas são as da planilha, sem reajuste ou extrapolação para outras cidades.

## Aplicação na plataforma

O comparador exibe agora o saldo de despesas para manter 19,5% no preço promocional, usando os custos preenchidos na tela. O valor não é gravado como elétrica e não altera a margem alvo da unidade. Sem custo completo, quantidade necessária, potência necessária ou preço promocional, o saldo não é apresentado.

O modelo já permite elétrica fixa, por módulo ou por kWp. Para escolher a tarifa, falta um orçamento real de materiais CA/serviço elétrico para sistemas pequenos, médios e grandes, separando o que já está incluído no kit e na instalação. A planilha não fornece esses dados. Nenhuma tarifa nova, comissão, custo de componente ou preço promocional foi gravado em produção.

Validação: sete casos históricos nos testes de cálculo, limite de saldo com precisão de centavos, saldo negativo, deduções/despesas já preenchidas e entradas incompletas. Rodar `node --test tests/centro-custo/*.test.cjs` na raiz do repositório.
