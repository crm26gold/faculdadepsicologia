# Reuso de um projeto próprio: WhatsApp, saúde da IA, voz e operação

Registro de 2026-10-06. Documento datado: confira no código antes de confiar nas referências, e atualize a matriz do `README.md` quando um recurso mudar de estado.

**De onde vem.** A fonte é um projeto próprio e privado do proprietário (bot de WhatsApp). O proprietário autoriza copiar ou adaptar código dele na Jornada. Nenhuma credencial, dado, número de telefone, endereço ou configuração desse projeto entra na Jornada.

**Como os itens foram escolhidos.** Cada item passou pelas quatro perguntas (`.claude/skills/quatro-perguntas/SKILL.md`): **Precisa existir? Já tem no sistema? A linguagem resolve? Cabe em uma linha?** Simplicidade corta código, nunca proteção: itens de proteção passam direto na primeira pergunta.

**Esforço:** P (menos de meio dia), M (1 a 3 dias), G (mais de 3 dias).

---

## 1. Decisão: não trocar o motor do WhatsApp agora

A ponte continua no `whatsapp-web.js`. Trocar por um cliente sem navegador (como o whatsmeow, em Go) não compensa agora:

- **O risco não muda.** Os dois clientes são não oficiais, e os termos do WhatsApp proíbem mensagens automáticas, envio em massa e engenharia reversa do mesmo jeito.
- **O que mais pesa no banimento é o comportamento** (inferência): número novo, volume alto, conversa com desconhecidos, denúncias. A Jornada já tem o padrão de menor risco: só responde, com pouco volume, a quem se vinculou com código.
- **O custo é alto:** de 3 a 6 dias reescrevendo a ponte, e o teste com celular real teria de ser refeito.
- **O ganho principal vem sem troca:** a reconexão automática entra no lote W-1 (W2).

Rever só se o peso do navegador ou as quebras de versão do WhatsApp Web virarem problema real.

---

## 2. O que a Jornada vai adotar

Caminhos curtos: `bridge.mjs` fica em `integrations/whatsapp-bridge/`; `run-job.ts` em `src/lib/whatsapp/`; `providers.ts`, `attempts.ts`, `runtime.ts`, `budget.ts`, `resources.ts` e `catalog.ts` em `src/lib/ai/`.

### 2.1 Lote W-1: "a ponte não perde mensagem"

**Precisa existir?** Sim: são três perdas que acontecem hoje. A mensagem some quando o servidor falha, a ponte fica desligada depois de uma queda e toda resposta tenta sair em voz. Cerca de 1 dia, risco baixo, sem migração.

| # | Item | Onde na Jornada | Esforço |
|---|---|---|---|
| W1 | Tentar de novo enviar ao servidor a mensagem recebida: esperas de 0 s, 0,5 s, 2 s e 5 s, só em erro de rede ou 5xx, nunca em 4xx. Acima de 20 mensagens em andamento, contar o descarte em vez de perder em silêncio. É seguro porque a entrada na fila já é idempotente por mensagem (migração `whatsapp_ai_sources`). | `bridge.mjs`: o envio ao servidor e o limite de 20 | P |
| W2 | Reconectar sozinho depois de uma queda, com espera crescente e teto (até 5 min). Nunca reconectar quando o motivo for LOGOUT. Mostrar "reconectando" no heartbeat. | `bridge.mjs`: eventos `disconnected` e `auth_failure`, e o heartbeat | P |
| W3 | Regra de voz ou texto: voz só quando a pessoa mandou áudio; texto acima de 600 caracteres; texto quando a fala falhar. | Nova função pura `src/lib/voice/reply-mode.ts`, usada por `run-job.ts` e pela rota do Telegram. `src/app/api/whatsapp/bridge/route.ts` repassa o campo e `bridge.mjs` obedece. Use um booleano (por exemplo `speak`), não `voice`: esse nome já é a voz escolhida. | P |

**Testes:** ampliar `integrations/whatsapp-bridge/protocol.test.mjs` com quando tentar de novo (rede ou 5xx sim, 4xx não) e com a regra de voz ou texto.

**Pronto quando**, no teste com celular real de `docs/WHATSAPP_JORNADA.md`:
- (a) a rede cai durante uma mensagem e ela chega depois;
- (b) a ponte reconecta sozinha depois de uma queda;
- (c) texto recebe texto, e (d) áudio recebe áudio;
- (e) uma resposta longa sai em texto.

**Ainda no WhatsApp, depois do W-1**
- **W5. Rastro de vincular e desvincular telefone** em `private.audit` (proteção). A troca de credencial já registra. Destino: `whatsapp_server` e `whatsapp_my_link`, com testes em `supabase/tests/whatsapp_bridge.sql`. P.
- **W6. Saúde da ponte no heartbeat:** versão, mensagens pendentes, entregas incertas e descartes do W1, mostrados em `src/components/whatsapp-settings.tsx`. P.

### 2.2 Lote A2: voz barata

**Precisa existir?** Sim: o A2 já é o próximo lote grande da fila, e o W3 é a primeira peça dele.

| # | Item | Onde na Jornada | Esforço |
|---|---|---|---|
| V1 | Estágio de fala ("boca") como recurso plugável, com orçamento próprio. Limite de 600 caracteres, prefixo de leitura em voz alta e resposta em texto quando a fala falhar. A chave vai no cabeçalho, como já faz `providers.ts`, nunca na URL. Sem ffmpeg no servidor: o provedor devolve um formato pronto, e a ponte continua convertendo para OGG/Opus no PC. | Novo `src/lib/voice/speech.ts`, uma rota de fala, capacidade `tts` em `resources.ts`, escopo próprio em `budget.ts`, tarefa "falar" em `catalog.ts`. Credencial por `runtimeForSession`, como toda tarefa. | M |
| V2 | Áudio que não deu para entender: responder uma frase fixa pedindo para repetir, sem chamar a IA. | `run-job.ts` e `src/app/api/telegram/webhook/route.ts` | P |
| W4 | Mostrar "digitando" ou "gravando áudio" enquanto a IA trabalha. Só sinal, sem atraso artificial. | `bridge.mjs` (`sendStateTyping` e `sendStateRecording`); Telegram com `record_voice` quando a resposta for em voz | P |

**Depois, no A4:** outros provedores de fala, cada um com a sua `privacy_basis` declarada em `catalog.ts` e `resources.ts` (Google Cloud TTS, ou ElevenLabs Flash só para fala).

### 2.3 Lote A3: saúde e cobrança da IA

**Precisa existir?** Sim: hoje a Jornada decide só pelo número do erro, e no modo automático um pedido mal formado pode gastar até 8 unidades do orçamento. Mensagens claras para o proprietário são proteção.

| # | Item | Onde na Jornada | Esforço |
|---|---|---|---|
| H1 | Classificar a falha do provedor: sem crédito, limite por minuto, passageira (rede, 5xx, resposta vazia), pedido inválido (400 ou 422) e credencial. Ler o motivo estruturado do corpo do erro; palavras soltas só como último recurso. | Generalizar `src/lib/voice/provider-error.ts` em `src/lib/ai/provider-failure.ts`; `call()` em `providers.ts` guarda só a classe | M |
| H2 | Uma ação por classe. Sem crédito: marcar a conexão como esgotada e ir para outro provedor. Limite por minuto ou passageira: próxima conexão. Pedido inválido: parar, inclusive no modo automático. De passagem, alinhar o 429, que `providers.ts` trata como passageiro e `attempts.ts` como parada. | `attempts.ts` | P |
| H3 | Saúde por conexão, no banco: última classe de falha, quando aconteceu, até quando pausar e contadores (chamadas, falhas, sucesso, fallback). Nunca texto. | Campos no registro de conexão que já existe, ou `private.ai_connection_health` com RPC protegida por `server_secret`. `runtime.ts` e `attempts.ts` pulam conexões pausadas; a ação de teste do painel limpa a pausa; `src/components/community/resource-map.tsx` mostra. | M |
| H4 | Aviso "sem crédito" ou "pausada" no mapa de recursos, só para o dono da credencial. Membros nunca recebem aviso sobre chaves da base. | `resources.ts`: motivos `billing` e `cooling` em `SourceReason`, e uma entrada em `resourceInsights` | P |
| H5 | Telemetria sem conteúdo: provedor, conexão, modelo, tarefa, classe da falha, tempo e tokens. Nunca texto, argumentos, telefone ou mensagem crua do provedor. Cobrir texto, transcrição e fala. | `generate()` em `providers.ts` devolve o uso; novo `src/lib/ai/telemetry.ts` e uma tabela só de acréscimo. Gravar depois da resposta com o mecanismo do Next (`after`), conferido em `node_modules/next/dist/docs/`. | M |
| H6 | Código de referência em toda resposta 503, para o proprietário achar o erro no log. | `dbError` em `src/lib/api-route.ts`, no padrão de `src/app/api/ai/live/route.ts` (`crypto.randomUUID`) | P |

Ordem dentro do lote: H1 e H2 primeiro (economizam já), depois H3 a H6. H4 depende do mapa de recursos estar na `main`.

### 2.4 Lembretes opt-in

**Precisa existir?** Sim: é pedido do proprietário ("esqueceu o foco ligado?" pelo app ou pelo WhatsApp) e está em `docs/ROADMAP.md`. Hoje não existe nenhum envio iniciado pela Jornada. **Menor forma:** um resumo diário, só para quem ativar.

- **O quê:** resumo com os alertas do Meu dia e o aviso de foco esquecido, no Telegram ou no WhatsApp.
- **Onde:** `todayAlerts` em `src/lib/today.ts`, `src/lib/bot/telegram.ts`, uma RPC de fila que reaproveita `claim_assistant_job`, e o disparo pelo tick da ponte ou por um cron diário.
- **Regras de envio:** espera crescente entre tentativas (2, 10, 30 e 120 min), no máximo 5 tentativas, descartar o aviso com mais de 2 h, não marcar como enviado quando o canal estiver offline, e respeitar quando a pessoa pedir para parar.
- **Já tem? Reaproveitar:** um único helper de fuso com `Intl` (a linguagem resolve) substitui o formatador de `America/Sao_Paulo` repetido em `src/lib/bot/core.ts`, `src/lib/mcp/server.ts`, `run-job.ts` e `src/lib/calendar-export.ts`.
- **Esforço:** G. Risco médio.

### 2.5 Peças pequenas

| Item | Por quê | Onde na Jornada | Esforço |
|---|---|---|---|
| **Smoke de produção só leitura:** `/`, `/login`, `/api/me` igual a 401 e cabeçalhos de segurança. Não imprime segredos. | A produção sai da `main` sozinha e hoje nada confere o site depois da publicação. | Novo `scripts/smoke-production.mjs` com `fetch` e `node:test`; job opcional em `deployment_status` no `.github/workflows/ci.yml` | P |
| **Canal do titular e processo de incidente (LGPD)**, como texto. | Proteção de privacidade. A Jornada já exporta e exclui a conta, mas não diz como o titular faz um pedido nem o que acontece num incidente. Está no plano F8.3/F8.6 de `docs/AUDITORIA_E_PLANO_2026-09-26.md`. A linguagem resolve: é texto, sem código. | `src/app/privacidade/page.tsx` e um documento em `docs/` | P |
| **"Pedidos aguardando você" no Meu dia:** confirmações pendentes do assistente. | Confirmação de exclusão é proteção, e hoje a pendência só aparece em Conversas. Cabe numa entrada nova. | `todayAlerts` em `src/lib/today.ts` e `src/components/use-assistant-jobs.ts` | P |
| **Marcar o resultado de um MCP externo como dado de terceiros.** | Proteção contra instruções escondidas. O preâmbulo de dados não confiáveis já existe; falta enquadrar o conteúdo de terceiros. | Futuro MCP de saída (A5/A6), em `src/lib/ai/`. Preâmbulo atual em `src/lib/commands.ts`, `src/lib/voice/protocol.ts` e `src/lib/ai/image-review.ts`. | P |
| **Regra de FK composta `(pai, user_id)`**, criada com `not valid` e depois `validate`. | Isolamento entre contas para os módulos que saírem do JSON. Uma linha por FK. | `docs/ARCHITECTURE.md` e as migrações futuras | P |
| **`ignoreCommand` na Vercel** para não publicar commits só de documentação. | Menos builds no plano Hobby, com uma linha de configuração. Cuidado: nesses commits o SHA de produção fica atrás da `main`, e o smoke deve aceitar isso. | `vercel.json` | P |

### 2.6 Cortados pelo filtro

| Ideia | Pergunta que falhou | Motivo |
|---|---|---|
| Juntar rajadas de mensagens num só pedido | Precisa existir? | Uma pessoa manda pouco volume. Volta se o uso mostrar respostas picadas, e então no servidor. |
| Dividir respostas longas em várias mensagens | Precisa existir? | Conflita com nunca mandar duas vezes. O W3 manda texto acima de 600 caracteres. |
| Atrasos aleatórios para "parecer humano" | Precisa existir? | Sem prova de que evitem banimento, e deixam a resposta mais lenta. |
| Campanhas, sequências e envios para terceiros | Precisa existir? | A Jornada nunca escreve para terceiros. |
| Horários livres na agenda e contexto da tela no assistente | Precisa existir? | Sem pedido nomeado. Vão para a fila. |
| Aceite do risco do WhatsApp registrado com versão | Precisa existir? | Só o proprietário conecta a ponte, e o aviso já está na tela e no guia. Decisão 4. |
| Parear por código numérico | Já tem? | O QR funciona e o pareamento é raro. |
| Várias chaves por provedor e painel de chaves | Já tem? | O roteador já tem até 8 alternativas, cofre cifrado e teste da chave. |
| A IA perguntar a preferência de voz | A linguagem resolve? | Espelhar o meio que a pessoa usou (W3) cobre quase tudo. |

---

## 3. Ordem sugerida

1. **W-1:** W1, W2 e W3.
2. **A2:** V1, V2 e W4.
3. **A3:** H1 e H2; depois H3 a H6. Para economizar antes de tudo, H1 e H2 podem vir logo depois do W-1.
4. **WhatsApp:** W5 e W6.
5. **Peças pequenas, a qualquer momento:** smoke, LGPD, `ignoreCommand` e "Pedidos aguardando você" (se confirmado).
6. **Lembretes opt-in**, depois da decisão 8.
7. **Quando chegar a hora:** dados de terceiros no MCP com o A5/A6, a regra de FK quando um módulo sair do JSON, outros provedores de fala no A4.

Cada lote segue o fluxo de sempre: branch, PR, CI verde, revisão, merge.

---

## 4. Decisões do proprietário

1. **Motor do WhatsApp.** Confirmar a seção 1: ficar no `whatsapp-web.js` e portar W1 a W6.
2. **A voz que a ponte usa hoje.** A ponte manda o texto de cada resposta ao Edge TTS, um serviço online de leitura sem contrato com a Jornada (`integrations/whatsapp-bridge/speech.mjs`). A tela e o guia já avisam. Opções:
   - (a) manter até o A2, com o aviso atual;
   - (b) desligar a voz no WhatsApp até o A2;
   - (c) adiantar o V1.

   O W3 já reduz o uso: voz só quando você manda áudio.
3. **Provedor de fala do A2.**
   - Gemini TTS: exige faturamento pago para ser declarado "API paga, só eu".
   - Google Cloud TTS: era o plano anterior do A2.
   - ElevenLabs Flash: boa voz, custo alto.
4. **Aceite do risco do WhatsApp.** O aviso já existe. Quer também um aceite registrado, com versão do texto, antes de conectar a ponte? Se sim, aprovar uma redação honesta: o cliente não é oficial, o número pode ser banido, a Jornada só responde a quem se vinculou e nunca escreve para terceiros.
5. **Ler PDFs mandados pelo WhatsApp.** Quer agora? Há custo, e o arquivo pode trazer instruções escondidas.
6. **API oficial do WhatsApp.** Os termos da Meta vigentes desde 2026-09-23 (§4.7) proíbem provedores cuja função principal seja a IA, e a Jornada pelo WhatsApp é quase só IA. Vale uma leitura jurídica antes de investir.
7. **Custo em reais.** Por enquanto só tokens (H5), ou já uma tabela de preços para ver o custo em R$ por provedor?
8. **Confirmar a necessidade.**
   - "Pedidos aguardando você": se não confirmar, vai para a fila.
   - Lembretes: o canal (Telegram, WhatsApp ou os dois), o horário do resumo e de onde sai o disparo. O tick da ponte acerta o horário, mas só com o PC ligado; o cron diário da Vercel funciona sempre, mas no plano Hobby provavelmente roda uma vez por dia (inferência).

---

Detalhes de origem, trechos e achados privados ficam fora do repositório, em `.local/` na máquina do proprietário.
