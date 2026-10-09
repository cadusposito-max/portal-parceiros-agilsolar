# Repasse para Claude — precificação Ágil Solar

O arquivo `Repasse_Claude_Precificacao_AgilSolar.zip` reúne o contexto, as planilhas, os dados, os arquivos de código alterados, o patch e os testes desta tarefa. Não é uma cópia completa do repositório.

## Como usar

1. Anexe o ZIP ao Claude ou extraia-o em uma pasta que ele possa ler.
2. Cole o conteúdo de `PROMPT-PARA-CLAUDE.md`.
3. Peça que ele comece por `CONTEXTO-E-PENDENCIAS.md`, dentro do pacote.

Se o Claude já estiver no projeto local, o repositório correto é a pasta **portal-parceiros-agilsolar**, dentro do workspace. A pasta pai também tem Git e contém alterações anteriores; não deve receber commits abrangentes desta tarefa.

## Estado no momento do repasse

- Código e documentação: quatro commits locais, até `a3b0953`, ainda sem push nesta sessão.
- Custos por módulo/kWp, ART separada do projeto e modo Custos + margem alvo: implementados localmente.
- Preset de R$ 48,24/kWp: estimativa de despesas residuais, não custo elétrico comprovado.
- Regra de preço final igual ou maior que o promocional: implementada **somente na planilha**.
- Migração, função Supabase e frontend: não publicados por este trabalho.

A documentação de repasse será registrada em um commit adicional. O ZIP retrata a implementação anterior a esse commit de empacotamento.

O pacote não inclui `.env`, tokens, chaves privadas ou credenciais de fornecedores. Os dados comerciais incluídos são os que foram usados nesta tarefa.
