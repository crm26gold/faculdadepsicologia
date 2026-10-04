# Falha ao iniciar Gemini Live — 3 de outubro de 2026

## O que foi observado

Os prints das chamadas `09fde12c`, `ae421693` e `56011d78` mostram Gemini 400. Os logs de produção dessas referências e de `91ba8e2b` confirmam:

1. A chave permite listar modelos; `gemini-3.8-live` está disponível para `bidiGenerateContent`.
2. O POST para `v1beta/auth_tokens` retorna `400 INVALID_ARGUMENT`.
3. A tentativa alternativa também retorna 400.
4. A falha ocorre antes da conexão WebSocket e do envio de áudio. Esses registros não comprovam problema de microfone, cache, Android ou faturamento.

O diagnóstico anterior descartava `error.message` inteiro por privacidade. O provedor não retornou `fieldViolations` nesses registros; portanto, não é possível provar retroativamente qual campo causou cada rejeição.

## Correção do contrato

| Problema encontrado | Ajuste |
| --- | --- |
| Máscara com subcampos de `generationConfig`; há relato reproduzível de rejeição de máscaras aninhadas | `fieldMask` usa campos inteiros, incluindo todo `generationConfig` |
| Retry enviava `liveConnectConstraints` diretamente; é entrada do SDK, não campo do recurso REST encontrado na descoberta pública | Um POST canônico com `bidiGenerateContentSetup`; elimina a segunda requisição inválida |
| Três ferramentas sem argumentos declaravam `OBJECT` com `properties` vazio | Omite o campo opcional `parameters` dessas declarações |
| Gemini 3.8 usa execução assíncrona por padrão | `behavior: BLOCKING` explícito para aguardar a resposta da ferramenta antes de confirmar uma execução |
| Erros estruturados apresentados somente em `message` não identificavam a configuração rejeitada | Classificador de prefixos conhecidos retorna somente enums e nomes de campos permitidos |
| O botão de interrupção parava o som local, mas enviava um turno incompleto | Envia `turnComplete: true`, necessário no Gemini 3.8 para interromper a geração ativa; pedidos já aceitos continuam sendo salvos |

Modelo, instruções, ferramentas, geração, transcrições, VAD e compressão fornecidos pelo servidor continuam fixados no token. `sessionResumption` fica fora da máscara para receber um handle na reconexão. Campos opcionais não fornecidos não são abrangidos pela máscara; ela não deve ser descrita como bloqueio de absolutamente todos os campos da API.

Não há tentativa com token sem restrições, remoção das ferramentas, exposição da chave permanente nem troca silenciosa de provedor. Os limites por conta e compartilhados continuam antes do uso da API.

## Diagnóstico e privacidade

Mensagens de configuração somente são classificadas com HTTP 400/422 e `INVALID_ARGUMENT`, sem motivo explícito de chave, faturamento ou cota. Os códigos fixos são `INVALID_FIELD_MASK`, `EMPTY_OBJECT_PARAMETERS` e `UNKNOWN_FIELD`. Texto livre, chaves, transcrições, valores e nomes desconhecidos não são copiados para a resposta ou os logs.

## Verificação e limite da conclusão

- Conferência dos campos com o documento público de descoberta REST `v1beta`, incluindo `AuthToken`, `BidiGenerateContentSetup`, `FunctionDeclaration` e enum `BLOCKING`.
- Regressões para formato do recurso, restrição de campos inteiros, validade do token, ausência de schemas vazios, espera pelas ferramentas, classificação segura e dados privados junto de erros.
- Revisão independente do contrato e da continuidade entre token e cliente WebSocket.
- Regressão de navegador para interromper a reprodução, enviar o sinal de cancelamento correto e preservar um salvamento já aceito.
- Build, tipos, testes de domínio, bloqueios de produção e testes de navegador fazem parte dos gates de publicação.

Essas verificações comprovam a construção e a proteção do pedido. **A aceitação pela chave real, `setupComplete`, fala, resposta e retomada no Android exigem validação real depois da publicação.** O navegador integrado deste ambiente não ficou disponível para acessar uma sessão autenticada; nenhum token ou cookie foi copiado para contornar essa limitação.

Teste inicial no celular: recarregue o site, abra **Assistente → Conversar ao vivo → Iniciar chamada** e diga “O que tenho na agenda hoje?”. Se aparecer um erro, o novo código identifica o registro com o diagnóstico atualizado. Após a conexão funcionar, valide uma criação, a confirmação de exclusão e a persistência antes de considerar a experiência completa.

## Fontes verificadas

- [Recurso REST e parâmetros de função](https://ai.google.dev/api/generate-content#FunctionDeclaration).
- [Serialização do token no SDK oficial](https://raw.githubusercontent.com/googleapis/js-genai/main/src/tokens.ts) e [conversores](https://raw.githubusercontent.com/googleapis/js-genai/main/src/converters/_tokens_converters.ts).
- [Relato de rejeição de FieldMask no repositório oficial](https://github.com/googleapis/js-genai/issues/1492). Relato compatível com a configuração antiga, não prova isolada da causa deste incidente.
- [Migração para Gemini 3.8 Live](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-live).
- [Referência Live e comportamento das restrições](https://ai.google.dev/api/live).
