# Jornada Plena: volume de logs e conflitos de salvamento

Investigação em 3 de outubro de 2026. Escopo exclusivo: `crm26gold/faculdadepsicologia`, Supabase `uccoaebzmvocqwqljmul`, organização `vercel_icfg_T0clxdBSVYYzm4cAcOXUHWpE`. O print do outro projeto é apenas uma referência sobre egress; este trabalho não altera aquele projeto.

## Significado das métricas

Os valores abaixo são do print enviado, não uma leitura atual do faturamento.

| Métrica | O que mede | Jornada no print |
| --- | --- | --- |
| Egress | Bytes enviados para fora do Supabase, por banco, arquivos, autenticação e outros serviços | 0,01 / 5 GB |
| Database size | Espaço ocupado pelo banco | 29 / 500 MB |
| Monthly active users | Usuários ativos de autenticação no período | 2 / 50.000 |
| File storage | Espaço ocupado pelos arquivos do Storage | 0,00 / 1 GB, arredondado |
| Log Ingestion | Bytes de logs recebidos dos serviços | 75,5 / 1 GB |
| Log Query | Bytes varridos ao consultar logs, inclusive Studio, API e MCP | 46,5 / 100 GB |

Ingestion estava em 75,5 vezes a referência. Query estava em 46,5% da referência, abaixo dela. Armazenar arquivos e transferi-los são medidas diferentes: poucos arquivos acessados muitas vezes podem produzir egress alto.

Segundo a documentação consultada em 3/10/2026, a cobrança nova de Logs Ingest e a aplicação das restrições de Logs Query estão em carência até o início de 2027. Logs Query não tem cobrança própria por GB. A cota de egress segue regras próprias; a carência de logs não suspende essas regras. Verificar o painel e as regras vigentes do plano antes de qualquer alteração de assinatura.

- [Logs Ingest](https://supabase.com/docs/guides/platform/manage-your-usage/logs-ingest)
- [Logs Query](https://supabase.com/docs/guides/platform/manage-your-usage/logs-query)
- [Egress](https://supabase.com/docs/guides/platform/manage-your-usage/egress)

## Causa confirmada na Jornada

Na janela de 20:34:08 a 20:44:08 UTC, uma consulta agregada encontrou 59.888 eventos `postgres_logs` e 104.672.199 bytes de atributos. Isso não é a medição oficial completa de ingestão: não inclui todos os campos nem reconstrói o ciclo inteiro.

Na amostra de um minuto, os 6.000 eventos de Postgres eram `Workspace conflict`, SQLSTATE `40001`, emitidos por `authenticator` / PostgREST 14.5. Cinco processos correspondiam a conexões iniciadas em 28/9. Os parâmetros examinados não mostraram logging geral em nível de debug nem auditoria ampla habilitada.

As funções reais `private.save_personal_workspace`, `private.bot_save` e `private.guard_workspace_editor_generation` ainda usavam `40001` para conflitos de revisão/geração do editor. A migração corretiva existia no repositório, mas não constava no histórico remoto. PostgREST 14 trata esse código como falha transitória e pode repetir indefinidamente uma condição que nunca se resolve.

Isso explica o fluxo contínuo observado e é compatível com o aviso de CPU. A investigação não reconstruiu a origem de cada byte dos 75,5 GB nem identifica qual ação de usuário iniciou cada conexão antiga. Não há evidência nesta investigação de invasão ou de que o cache de mídia produziu esse fluxo.

[Supabase: erro 40001 e repetição infinita](https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b).

## Correção aplicada

Aplicada ao banco correto a migração `conflict_without_retry`, registrada remotamente como `20261003205055`, às 17:50:55 em São Paulo. O SQL revisado é [20261003010000_conflict_without_retry.sql](../supabase/migrations/20261003010000_conflict_without_retry.sql); o MCP atribui o timestamp de aplicação remoto.

As três funções passaram a usar `PT409`, devolvendo conflito HTTP 409. As verificações de conta, revisão, conteúdo e geração do editor continuam obrigatórias. A aplicação já trata esse código; não foi necessário publicar outro frontend para ativar a correção.

Foi preparada uma interrupção limitada aos cinco PIDs e horários de início identificados nos logs, condicionada à confirmação da correção. A consulta não encerrou nenhuma conexão: ao verificar, os cinco processos já não apareciam após a aplicação. Não foi reiniciado o projeto nem desativada a proteção contra sobrescrita.

## Evidências após a correção

- Às 17:51:55 e 18:08:36 em São Paulo, `xact_rollback` permaneceu exatamente em `649327723`; as transações confirmadas continuaram avançando.
- As cinco conexões antigas estavam ausentes na verificação.
- Entre 18:06:36 e 18:08:36, a consulta dos logs Postgres/pooler retornou apenas 17 eventos do pooler, 2.754 bytes de atributos, sem eventos de Postgres nem erros `40001` nessa janela.
- O teste `tests/sql/workspace-conflicts.sql` passou no próprio banco remoto, com contas sintéticas e rollback. Confirmou salvamento válido, bloqueio de revisão/editor antigos, dados preservados e autorização/isolamento.

Essas amostras confirmam que o fluxo identificado cessou. Não equivalem a garantir CPU baixa em qualquer carga, nem a medir todos os logs futuros. O volume já acumulado permanece no ciclo; a correção reduz geração futura, não devolve a cota usada.

## Prevenir a volta

- `tests/sql/workspace-conflicts.sql` verifica as definições reais antes de salvar, usa contas sintéticas e termina com rollback. Cobre criação, revisão correta, duplicação, revisão antiga, editor antigo, dados inalterados e isolamento/autorização.
- A verificação foi incluída no teste de banco da CI. Pode ser executada separadamente no banco remoto para detectar divergência entre migrações locais e definições realmente aplicadas.
- O teste de continuidade deixa de aceitar `40001` como alternativa a `PT409`, para não esconder a mesma divergência.
- Consultas de logs devem filtrar projeto, serviço e intervalo. Não usar consultas repetidas de histórico amplo como monitor contínuo.
- Para futuras entregas de banco, verificar tanto o registro da migração quanto o contrato das funções em produção. CI local passando não comprova migração aplicada remotamente.

## Próximas verificações

Recarregar a Jornada, salvar uma alteração pequena e conferir seu retorno após reabrir. Se uma aba antiga mostrar conflito, preservar/exportar suas alterações antes de recarregar; não forçar gravação sobre uma revisão mais nova.

Conferir a tendência diária de novos logs e CPU no painel, sem esperar que o total acumulado caia. No outro projeto, o print mostra egress de 12,2 / 5 GB e restrição; identificar a origem por serviço e otimizar cache/tamanho/solicitações é trabalho naquele projeto separado. Cache de navegador evita uma requisição reaproveitada; cache do CDN ainda transmite dados e tem métrica própria. Upgrade ou mudança de limite exige decisão de custo, não substitui a correção da causa.
