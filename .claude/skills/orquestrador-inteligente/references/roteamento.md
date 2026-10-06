# Roteamento: tabelas de decisão

Material de consulta do skill `orquestrador-inteligente`. Baseado no estudo "Claude Auto Router — Max Supremo" (06/10/2026). Os limites abaixo são heurísticas iniciais; recalibre com os resultados reais da Jornada.

## Sinais (0–100, estimativa rápida, sem cálculo exaustivo)

- **C · complexidade:** profundidade de raciocínio, interdependência, ambiguidade, escopo, horizonte de ferramentas, novidade, precisão exigida.
- **R · risco:** consequência da falha. Impacto, irreversibilidade, segurança e privacidade, ação externa, criticidade, dificuldade de verificar. Uma tarefa simples pode ter risco alto.
- **Conf · confiança prévia:** chance de o nível candidato acertar, dada a clareza do pedido, o contexto disponível, a existência de verificador e o histórico em tarefas parecidas.
- **E = 0,45·C + 0,35·R + 0,20·(100 − Conf).** É um sinal para orientar a escolha, não uma regra cega.

| E | Nível inicial |
| ---: | --- |
| < 35 | 1 · Haiku |
| 35–54 | 1 ou 2, conforme a chance de acerto |
| 55–69 | 2 · Sonnet |
| 70–84 | 3 · Opus |
| ≥ 85 | 3 em effort alto; 4 só se justificado |

## Portões que vêm antes da tabela

| Condição | Ação |
| --- | --- |
| Uma ferramenta resolve a parte | Nenhum modelo para essa parte |
| R ≥ 85 | Mínimo nível 2, com verificação |
| R ≥ 95 | Nível 3 na decisão crítica, com verificação independente |
| Resultado verificável por teste | O teste é obrigatório |
| Contexto grande demais | Recortar, resumir ou decompor antes de executar |
| Cadeia única e dependente | Um executor; sem fan-out |
| Subtarefas independentes e volumosas | Workers de nível 1–2 em paralelo |
| O premium falhou com contexto correto | Nível 4 ou outra estratégia |
| Ação destrutiva ou externa | Confirmação do proprietário ou o portão existente |

## Custo esperado

`Custo(m) = custo direto + (1 − P_sucesso) × custo do fallback`

Escolha o nível de menor custo esperado, não o de menor preço. Exemplo: Haiku com 30% de chance de acertar, numa tarefa que depois iria ao Opus, sai mais caro que mandar direto ao Opus.

## Retentativas

| Situação | Comportamento |
| --- | --- |
| Timeout ou rede | Uma repetição no mesmo nível |
| 429 com espera indicada, ou 529/500 | Esperar e repetir; depois, uma alternativa equivalente |
| Limite de sessão ou de gasto | Parar e informar; nada de loop |
| 400 | Corrigir o pedido; não repetir às cegas |
| 401/403 | Não repetir; é questão de acesso |
| Resultado errado ou inconsistente | No máximo uma correção no mesmo nível, se houver informação nova; depois subir |
| Recusa de segurança | Não trocar de modelo para contornar |

## Códigos de motivo (para relatórios)

`FERRAMENTA_RESOLVE` · `BAIXA_COMPLEXIDADE` · `ALTA_COMPLEXIDADE` · `ALTO_RISCO` · `BAIXA_CONFIANCA` · `CONTEXTO_GRANDE` · `PREMIUM_NAO_JUSTIFICADO` · `PREMIUM_NECESSARIO` · `RESERVA_NECESSARIA` · `PARALELIZAVEL` · `CADEIA_DEPENDENTE` · `VERIFICADOR_DISPONIVEL` · `VERIFICACAO_FALHOU` · `MODELO_INDISPONIVEL`

## Exemplos da Jornada

| Pedido | Rota |
| --- | --- |
| "Liste onde `missingRpc` é usado" | Ferramenta (`git grep`) |
| Resumir um relatório ou log de CI | Haiku |
| Inventário de um repositório de referência | Haiku |
| Aplicar mudanças já especificadas, com testes | Sonnet, verificado por `tsc`, `npm test` e Playwright |
| Corrigir um teste instável com causa conhecida | Sonnet |
| Diagnosticar uma falha de CI sem causa evidente | Sonnet; Opus se a causa não aparecer |
| Desenhar uma migração com RLS e autorização | Opus para o desenho; Sonnet escreve os testes; testes SQL verificam |
| Revisão de segurança de mudança no roteador ou no OAuth | Opus |
| Documento de política ou skill com o contexto já carregado | O próprio orquestrador |

## Antipadrões observados nesta base (06/10/2026)

- Disparar 4–6 agentes premium em paralelo: o limite de sessão esgotou e vários pararam no meio.
- Usar Opus para leitura e inventário, onde o Haiku bastava.
- Um verificador LLM onde o teste já resolvia.
- Subagente que relê material extenso que o orquestrador já tinha no contexto.
