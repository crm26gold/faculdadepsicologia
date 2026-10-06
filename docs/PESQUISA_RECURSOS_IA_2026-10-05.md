# Pesquisa de recursos de IA e referências — 05/10/2026

Registro histórico: confira no código e nas páginas oficiais antes de confiar em qualquer número. Preços e planos mudam; os valores abaixo foram lidos em 05/10/2026 em páginas oficiais, salvo quando marcados como fonte secundária ou inferência. Nada foi contratado, nenhuma conta foi criada e nenhuma chave foi usada nesta pesquisa.

Legenda de status: **verificado** (fonte primária), **secundário** (blog, fórum, lista de terceiros), **inferência** (cálculo ou conclusão nossa).

## Resumo para o proprietário

1. **A Jornada já tem a base certa:** um roteador com várias empresas, um MCP de entrada com OAuth e, agora, o mapa de recursos (lote A1). O próximo salto é tratar a voz como três peças trocáveis: ouvir, pensar e falar.
2. **O ElevenLabs é caro por causa da plataforma de agentes:** US$ 0,08 por minuto mais o modelo de texto, cobrado em créditos. Usado só como "boca" (TTS), fica de 5 a 7 vezes mais barato (inferência). Ele continua como opção, não como peça única.
3. **Voz ao vivo barata com contrato limpo:** o Gemini 3.8 Live no plano **pago** custa cerca de 1 a 2 centavos de dólar por minuto (inferência). Pelo GPT-Live, que a Jornada já usa com cérebro próprio, a OpenAI cobra US$ 0,05/min, e o "pensar" sai do roteador da Jornada, que pode usar DeepSeek, Groq ou outra.
4. **Voz quase gratuita:** dá para montar a voz com o Groq Whisper para ouvir (grátis, sem treino por contrato), um modelo do roteador para pensar e o Google Cloud TTS para falar, dentro da cota gratuita mensal e sem registro de conteúdo. Também existe a versão 100% gratuita com a voz do próprio navegador, mas sem garantia contratual de privacidade.
5. **Alerta sobre o padrão atual:** a DeepSeek, hoje a primeira opção do assistente, guarda dados pessoais na China, e os termos atuais da API não dizem que não treinam com o conteúdo. O Groq tem cláusula contratual de não treinar e uma cota gratuita. A decisão de qual usar é sua (seção 7).
6. **ChatGPT e Claude conectados por MCP já são um caminho oficial:** os dois aceitam conectores MCP remotos com OAuth, e o Claude gratuito permite um conector. A pessoa conversa no ChatGPT ou no Claude, que usa a Jornada como ferramenta e paga o modelo pelo plano dela. Faltam poucos ajustes na Jornada: CIMD, anúncio do `iss` e anotações das ferramentas.

   Usar a assinatura como motor do próprio assistente da Jornada tem regras diferentes:
   - **Claude:** é proibido pelos termos da Anthropic.
   - **ChatGPT:** existe o programa oficial "Sign in with ChatGPT – plan usage", para Plus e Pro, só texto, que exige aprovação para um app hospedado como a Jornada.

   O "sampling" do MCP foi descontinuado e não serve para isso. Detalhes na seção 4.
7. **OpenJarvis (Stanford):** é uma boa fonte de padrões (telemetria sem conteúdo, preço versionado, roteamento por complexidade, portas de segurança para ferramentas), mas não deve virar dependência. É Python local e envia analytics ligado por padrão.
8. **Vídeos de clonar apps:** estudar padrões de experiência de apps que você usa é legítimo. Extrair textos, fontes, marcas ou código de apps alheios, ou usar "jailbreak" em IA, não é. Na seção 6 está o que aproveitar de forma segura.

## 1. Voz ao vivo: três caminhos

A Jornada hoje usa só o caminho **tudo-em-um**: o mesmo serviço ouve, pensa e fala (Gemini Live, GPT-Live, xAI, ElevenLabs Agents). Existem mais dois caminhos:

- **Cérebro próprio:** o serviço ouve e fala, mas o "pensar" fica com o modelo escolhido pela Jornada. O GPT-Live em delegação `client`, que a Jornada já usa, funciona assim; Deepgram Voice Agent, LiveKit Agents e ElevenLabs com LLM próprio também.
- **Voz montada (cascata):** três serviços separados, cada um escolhido pelo roteador. É mais barato e mais trocável, com um pouco mais de demora entre a fala e a resposta.

| Opção | Custo aproximado | pt-BR | Privacidade para dados pessoais | Encaixe na Vercel Hobby | Estado na Jornada |
| --- | --- | --- | --- | --- | --- |
| Gemini 3.8 Live (pago) | US$ 0,005/min de áudio de entrada e US$ 0,018/min de saída (verificado); cerca de 1–2 ¢/min de conversa (inferência) | Sim | Plano pago não usa para melhorar produtos (verificado). O plano gratuito usa e permite revisão humana: proibido para dados pessoais | Navegador direto com token efêmero | Adaptador existe; falta a declaração de API paga |
| OpenAI gpt-realtime-2.1-mini | US$ 10/US$ 20 por 1M tokens de áudio; cerca de 1,5–3 ¢/min (inferência) | Provável; lista oficial não confirmada | API não treina por padrão (verificado) | WebRTC com segredo efêmero | Não integrado (a Jornada usa gpt-live-1) |
| OpenAI GPT-Live (gpt-live-1) | US$ 0,05/min mais o cérebro (verificado) | Sim (uso do proprietário) | API não treina por padrão | WebRTC, sessão criada no servidor | **Integrado, com cérebro próprio** |
| xAI grok-voice-think-fast-2.0 | US$ 0,08/min (verificado) | Sim | Não treina sem permissão explícita (verificado) | Segredo efêmero | Integrado |
| ElevenLabs Agents | US$ 0,08/min mais o LLM, cobrado em créditos; dobra acima do limite de chamadas simultâneas (verificado) | Sim | Desligar "melhorar os modelos" na conta antes de enviar dados pessoais | URL assinada | Integrado; configuração aprovada |
| Deepgram Voice Agent com LLM próprio | US$ 0,059/min (verificado); crédito inicial de US$ 200 | STT sim; a voz Aura-2 não tem português | Enviar `mip_opt_out=true` | Token JWT; o LLM próprio precisa de um proxy para não expor a chave | Não integrado |
| LiveKit Agents (código aberto) + LiveKit Cloud | Plano Build gratuito com 1.000 min de agente (verificado) | Depende das peças | LiveKit Inference sem retenção (verificado) | Agente roda no LiveKit Cloud | Não integrado |
| Ultravox | 30 min grátis, depois US$ 0,05/min (verificado) | Não confirmado | Não treina com dados de voz (verificado) | joinUrl | Não integrado |

Conclusões:

- **O custo da voz cresce com a duração da conversa** (verificado no Gemini, inferência nos outros). O Gemini cobra a cada turno todos os tokens que estão no contexto da sessão. Chamadas longas (a Jornada permite 20 minutos) e resultados de ferramenta grandes (até 30 mil caracteres) encarecem cada turno. Mitigações: compressão de contexto ligada, que a Jornada já usa; resultados de ferramenta curtos; e sessões mais curtas.
- **Por que 3 mil créditos em 2 minutos no ElevenLabs:** é uma hipótese, não está verificado. A ElevenLabs diz que os minutos de agente são cobrados à parte e que só o LLM sai dos créditos. As causas prováveis são:
  - o modelo de texto cobrado a cada fala, com todo o contexto e os resultados de ferramenta;
  - chamadas paralelas ou de teste;
  - a cobrança dobrada acima do limite de simultaneidade.

  **Como confirmar:** abra ElevenLabs › Agents › histórico de chamadas e Usage e veja os minutos e o custo do LLM de cada conversa.
- **Modelos:** o Google indica o `gemini-3.8-live` como padrão e trata o `gemini-3.1-flash-live-preview` como legado. No 3.8, as chamadas de ferramenta são assíncronas por padrão (`NON_BLOCKING`); o adaptador precisa tolerar isso.
- **Um adaptador para várias empresas:** a xAI declara compatibilidade com o protocolo Realtime da OpenAI, então um adaptador desse protocolo pode servir às duas (verificado como afirmação da xAI, com diferenças).

## 2. Ouvir e falar separados (STT e TTS)

| Peça | Opção | Custo e cota grátis | Privacidade |
| --- | --- | --- | --- |
| Ouvir | Groq Whisper large-v3-turbo | US$ 0,04/hora; grátis com 20 req/min e 2.000 req/dia (verificado) | Contrato proíbe treinar com entradas e saídas, inclusive no grátis (verificado) |
| Ouvir | Navegador (Web Speech API) | Grátis | No modo nuvem, o áudio vai para Google ou Microsoft sem contrato com o desenvolvedor: privacidade **desconhecida**. O Chrome no aparelho (`processLocally`) é privado quando disponível |
| Ouvir | Deepgram Nova-3 (streaming) | US$ 0,0048/min em promoção; crédito de US$ 200 | Enviar `mip_opt_out=true` |
| Ouvir | Google Cloud Speech-to-Text | 60 min/mês grátis (V1) | Não registra áudio por padrão |
| Falar | Google Cloud TTS | Grátis por mês: 1M caracteres em Chirp 3 HD ou Neural2, 4M em Standard ou WaveNet (verificado) | O Google não registra texto nem áudio do TTS (verificado) |
| Falar | Azure Speech (F0) | 0,5M caracteres neurais grátis por mês | Não guarda dados (verificado) |
| Falar | Navegador (speechSynthesis) | Grátis | Vozes "Online" mandam o texto à nuvem sem contrato; vozes locais do sistema são privadas |
| Falar | ElevenLabs Flash ou Turbo | US$ 0,04 por 1.000 caracteres | Desligar o uso para treino na conta |
| Falar | Gemini 3.8 Flash TTS (pago) | cerca de 1,35 ¢ por minuto de fala (inferência) | Plano pago sem uso para melhorar produtos |

Faltas de português que o roteador precisa conhecer: a Deepgram Aura-2 (voz) não fala português, o Groq TTS só fala inglês e árabe, e as vozes da OpenAI são otimizadas para inglês.

Proposta para a Jornada (inferência, a validar com medição):

1. **Voz econômica (padrão para dados pessoais):** Groq Whisper para ouvir, um modelo do roteador para pensar e o Google Cloud TTS para falar. Custo quase zero para uma pessoa, contrato limpo em cada etapa e cerca de 1,2 a 2,5 s entre o fim da fala e o início da resposta. Funciona em turnos, como um walkie-talkie, e cabe em rotas comuns da Vercel.
2. **Voz grátis no aparelho:** reconhecimento local do Chrome mais as vozes locais do sistema, quando o navegador oferecer. Serve como reserva sem chave nenhuma.
3. **Voz contínua premium:** Gemini 3.8 Live pago ou GPT-Live com cérebro próprio. Fica para quando você escolher "voz ao vivo de alta qualidade".
4. **Interrupção pela fala** é possível no navegador, com cancelamento de eco e um detector de voz local (Silero VAD). Em alto-falante de notebook, porém, a própria voz da Jornada pode disparar uma interrupção falsa. Ofereça também "tocar para interromper".

## 3. Modelos de texto gratuitos e baratos

| Provedor | Entra pelo adaptador compatível existente? | Grátis | Aceitável para dados pessoais? |
| --- | --- | --- | --- |
| Groq | Já tem entrada própria | 30 req/min, 1.000 req/dia e 8K tokens/min no gpt-oss (verificado) | **Sim**: o contrato proíbe treinar, inclusive no grátis |
| Cloudflare Workers AI | Sim, `api.cloudflare.com/client/v4/accounts/{id}/ai/v1` | 10 mil "neurons" por dia | **Sim**: não treina com o conteúdo |
| Z.ai (GLM-4.7-Flash) | Sim, `api.z.ai/api/paas/v4` | Modelo Flash gratuito, concorrência baixa | Sim, pelo texto dos termos (confiança média) |
| Alibaba Model Studio internacional | Sim | 1M tokens por modelo por 90 dias (Singapura) | Sim: não usa para treino |
| Vercel AI Gateway | Sim | Crédito mensal incluído | Sim, com `disallowPromptTraining` (o adaptador atual não envia esse campo) |
| Cerebras | Sim | Só teste de US$ 5 por 30 dias com cartão | Sim, mas o teste não é para produção |
| Mistral | Já tem entrada própria | Modo gratuito | **Não** no modo gratuito: pode treinar |
| OpenRouter `:free` | Já tem entrada própria | 50 req/dia | **Não**: provedores gratuitos podem treinar |
| Gemini AI Studio gratuito | Já tem entrada própria | Sim | **Não**: revisão humana; o Brasil não tem a exceção europeia |
| DeepSeek API | Já tem entrada própria | Não; preço baixo fora do horário de pico | **Decisão sua**: dados na China e sem cláusula explícita de não treinar nos termos atuais |
| GitHub Models | — | Aposentado em 30/07/2026 | — |

Observações:

- **Listas de APIs grátis:** o repositório `cheahjs/free-llm-api-resources` retornou 404 em 05/10/2026, e o último conteúdo conhecido é de julho. A lista mais atual hoje é `mnfst/awesome-free-llm-apis` (atualização diária), mas ela é fonte secundária: sempre confira na página do provedor.
- **Lacuna do adaptador compatível:** ele não envia campos extras no corpo da requisição. Por isso, filtros de privacidade por requisição (OpenRouter `provider.zdr`, Vercel `disallowPromptTraining`) dependem de configuração na conta. Um campo opcional "corpo extra" resolveria.
- **Riscos de uso:** vários testes grátis proíbem produção (Cerebras, NVIDIA, modelos "preview" do Groq), e os limites por IP se somam entre as instâncias da Vercel. Enviar dados pessoais para EUA, Singapura ou China é transferência internacional pela LGPD (inferência jurídica, não verificada).

## 4. Conectar ChatGPT e Claude por MCP

**Resposta curta (verificado):** sim, as empresas facilitaram. O ChatGPT e o Claude aceitam um servidor MCP remoto com OAuth, e a Jornada já tem quase tudo pronto: servidor MCP remoto, OAuth 2.1 com PKCE, metadados do recurso protegido, registro dinâmico de clientes, a resposta 401 com o desafio e suporte ao protocolo 2026-07-28 e aos clientes antigos.

Nesse caminho, o **cérebro é o ChatGPT ou o Claude da própria pessoa**, pago pelo plano dela. A Jornada só paga a própria hospedagem.

Três sentidos que não se confundem:

| Sentido | O que acontece | Situação |
| --- | --- | --- |
| **MCP de entrada** | A pessoa conversa no ChatGPT ou no Claude e o assistente consulta ou registra na Jornada | **Funciona hoje**; faltam pequenos ajustes para facilitar a conexão |
| **Usar o plano da pessoa como motor da Jornada** | O assistente da Jornada usa o plano ChatGPT da pessoa em vez de uma chave de API | **ChatGPT:** existe o programa oficial "Sign in with ChatGPT – ChatGPT plan usage" (Plus e Pro). App hospedado e de código fechado como a Jornada precisa ser aprovado por formulário. Não aceita áudio, então não serve para a voz ao vivo. **Claude:** proibido pelos termos da Anthropic, sem exceção |
| **Sampling do MCP** | O servidor pede ao modelo do cliente uma resposta durante uma chamada | **Não usar:** foi descontinuado na versão 2026-07-28, o Claude não suporta, só funciona dentro de uma conversa ativa e com aprovação humana |

**Quem aceita o quê (verificado salvo indicação):**

| Cliente | Conector remoto | Ferramentas de escrita | Interface (MCP Apps) | Celular | Plano |
| --- | --- | --- | --- | --- | --- |
| ChatGPT | Sim, adicionado na web em chatgpt.com/plugins | Sim, com confirmação; ferramenta sem `readOnlyHint` conta como escrita | Sim | Usa no celular depois de adicionar na web | Plano exato não confirmado em fonte primária; teste na sua conta |
| Claude (web, Desktop, celular) | Sim, por URL | Sim; ferramentas destrutivas sempre pedem confirmação | Sim, inclusive no celular | Usa no celular depois de adicionar na web | **Grátis: 1 conector**; pagos: mais |
| Claude Code | Sim | Sim | Não | — | — |
| VS Code Copilot e Cursor | Sim | Sim | Sim (VS Code só em linha) | — | — |
| App Gemini | Só nos EUA, em inglês, para maiores de 18 anos | Com confirmação | — | — | Ainda não serve a usuários brasileiros |

**Lacunas na Jornada (verificado no código):**

1. `authorizationServer()` em `src/lib/mcp/oauth.ts` não anuncia `client_id_metadata_document_supported` (CIMD). O CIMD é o registro de cliente preferido pelo ChatGPT e recomendado pelo Claude. A validação `^jpc_` do `client_id` recusa os IDs em forma de URL que o CIMD usa.
2. A Jornada já devolve `iss` nos redirecionamentos, mas não anuncia `authorization_response_iss_parameter_supported`. Com esse anúncio, o ChatGPT passa a usar o endereço de retorno estável. Antes de anunciar, confirme que todo caminho de erro também devolve `iss`.
3. A ferramenta `registrar_na_jornada` também edita e conclui, mas declara `destructiveHint:false`. Os diretórios da OpenAI e da Anthropic pedem `true` para qualquer alteração e preferem uma ferramenta por operação: separar "criar" de "alterar".
4. Ainda não há interface MCP Apps.

**Próximos passos (lote A5, custo zero de infraestrutura):**
1. Ajustar as anotações das ferramentas, ou separar a escrita em "adicionar" e "alterar".
2. Anunciar o `iss`.
3. Publicar um passo a passo em português para conectar no ChatGPT e no Claude, explicando que o assistente conectado recebe os dados que lê.
4. Suportar CIMD, mantendo o registro dinâmico como reserva e protegendo contra SSRF (só HTTPS, IPs privados bloqueados, tamanho e tempo limitados).
5. Construir um cartão MCP Apps, como "Meu dia" ou uma confirmação de registro, que funcione no ChatGPT e no Claude.
6. Enviar ao diretório do Claude, o que exige plano pago, e ao diretório da OpenAI, o que exige verificação de identidade feita por você.
7. Inscrever a Jornada no programa "Sign in with ChatGPT – plan usage" e, se aprovada, oferecer "Usar meu plano do ChatGPT" como uma peça do roteador para texto.

**Cuidados:**
- Há relatos públicos (secundários) de que ferramentas de conectores falham no modo de voz do Claude. Não prometa voz pelo Claude: a voz ao vivo da própria Jornada continua necessária.
- Anotações sensíveis (saúde, psicologia) são dados sensíveis pela LGPD. Avalie mascarar essas áreas na leitura por assistentes externos.

## 5. OpenJarvis (Stanford)

**O que é (verificado):** framework Python de "IA pessoal local", do Hazy Research e do Scaling Intelligence Lab de Stanford, licença Apache-2.0. A versão 1.0 saiu em maio de 2026 e o projeto tem cerca de 10,6 mil estrelas. O principal mantenedor reduziu a atividade depois de agosto, e os commits recentes são quase todos automáticos. Artigo: arXiv 2605.17172.

**Mecanismos relevantes:**
- **Roteamento por complexidade:** uma nota determinística de 0 a 1 que soma cinco sinais (tamanho, código ou matemática, raciocínio, várias partes, criatividade) e escolhe o modelo menor ou o maior. Há também roteamento aprendido por classe de pedido, que só troca de modelo depois de 5 amostras.
- **Telemetria:** um barramento de eventos grava inferências e chamadas de ferramenta (latência, tokens, custo) em SQLite local.
- **Segurança de ferramentas, em cadeia fixa:** limite de taxa, remoção de dados pessoais e segredos antes de ferramentas externas, permissão por capacidade, checagem de contaminação, confirmação, tempo-limite e marcação da saída externa como não confiável. O log de auditoria é encadeado por hash. Há níveis de risco com decisões lembradas por 24 h e uma trava contra repetição de chamadas.
- **MCP:** é sobretudo cliente. Não tem MCP HTTP com OAuth para ChatGPT ou Claude, e nisso a Jornada está à frente.

**Alertas (verificados no código):**
- O analytics vem ligado por padrão, com uma chave PostHog embutida, o que contradiz a documentação.
- Há três tabelas de preço que discordam entre si.
- O custo de modelo desconhecido vira zero.
- A documentação diverge do código em vários pontos.

**O que vale trazer para a Jornada:**

| Ideia | Prioridade | Mecanismo na Jornada |
| --- | --- | --- |
| Telemetria por tentativa, sem conteúdo | Agora (lote de saúde) | Registro por tentativa em `runAiAttempts`: tarefa, fonte, modelo, resultado, latência e tokens informados pelo provedor. Nunca texto. |
| Tabela de preço única e versionada | Próximo | Preço desconhecido fica **desconhecido** (nulo), nunca zero, com data de referência. |
| Regras de governança para adaptação automática | Agora (documento) | O sistema só reordena por conta própria entre fontes já autorizadas e declaradas. Novo provedor, novo conector ou mudança de instrução exigem a sua aprovação. |
| Recompensa pelos próprios recibos | Próximo | Sucesso é ação aplicada sem erro; falha é erro do provedor, comando inválido ou ação desfeita. |
| Nota de complexidade para o automático | Próximo | Função pura com palavras-chave em português, validada antes com um conjunto de testes. |
| Portas para MCP de saída | Próximo | Listas de ferramentas permitidas e bloqueadas; saída sempre não confiável; confirmação; trava contra repetição. |
| Auditoria encadeada por hash | Próximo | Gatilho no `admin_audit_log`, com função de verificação. |
| Conjunto de avaliação em português | Depois | 30 a 50 pedidos sintéticos com a ação esperada, rodados sob demanda. |

**O que não serve:** inferência local em GPU, medição de energia, treino de modelos e mineração. Também não serve adotar o OpenJarvis como dependência nem copiar o analytics ligado por padrão.

## 6. Vídeos enviados

Foram lidos só os dados públicos de cada página (título, canal, data, descrição e capítulos), sem transcrição e sem baixar o vídeo. Por isso, nada abaixo afirma o que foi **dito** nos vídeos.

1. **Ratos de IA, #36 (02/10/2026):** resumo semanal de notícias de IA, com capítulos sobre login com ChatGPT, eventos de MCP, ChatGPT Sites com MCP e a API de decisões. A sua intuição se confirma nas fontes oficiais: conectar ChatGPT e Claude por MCP é um caminho padrão (seção 4).
2. **"Clone qualquer app com emulador" (Gabriel Kendy, 03/10/2026):** é o único vídeo sobre clonagem. Ele propõe coletar telas, mapear funções, medir a interface, "acessar" o APK e construir. A descrição indica uma pasta de "prompt jailbreak" (não aberta) e um instalador que roda PowerShell com política de execução desligada. O instalador foi baixado automaticamente pela ferramenta de leitura, nunca executado, e já foi apagado.
3. **"JEV vs. ChatGPT & Claude" (Lucas Montano, 18/09/2026):** não trata de clonagem. O Jev, da TypeSafe, é um modelo de decisão muito barato (US$ 0,042 por 1M tokens de entrada, saída grátis), mas prioriza o inglês. No futuro pode servir de pré-classificador no roteador, via OpenRouter, depois de testado em português.
4. **"NOVO N8N Agents" (Guilherme Lazarotto, 07/09/2026):** também não trata de clonagem. Mostra os agentes do n8n e uma API não oficial de WhatsApp (UZAPI). Não convém colocar n8n ou UZAPI no núcleo, porque os dados pessoais sairiam do isolamento do Supabase e haveria risco de banimento.

**Clonar apps: o que é legítimo (leitura das leis no planalto.gov.br; não é parecer jurídico):**
- A Lei 9.609/98 protege software como obra literária e não considera infração a semelhança imposta por características funcionais.
- A Lei 9.610/98 não protege ideias, sistemas e métodos.
- A Lei 9.279/96 trata como concorrência desleal a imitação que causa confusão.
- **Pode:** estudar padrões de experiência de apps que você usa, com "cartões de padrão" (problema, padrão, por que funciona, como a Jornada adapta com os próprios tokens e textos).
- **Não pode:** extrair textos, fontes, marcas, código ou telas inteiras de apps alheios, nem usar "jailbreak" em IA. A política de uso da Anthropic proíbe isso e o termo do Google Play proíbe contornar proteções.
- **Ferramentas que valem só com material da própria Jornada:** um `DESIGN.md` gerado dos tokens de `src/app/design-system.css` (formato alfa do Google, com verificação de contraste) e geradores de tela alimentados com as telas e os tokens da Jornada.

**Achado paralelo:** a ponte de WhatsApp da Jornada usa o `whatsapp-web.js`, que o próprio projeto descreve como não oficial. Fontes secundárias relatam que a Meta vetou assistentes de IA gerais na API oficial a partir de 15/01/2026. Recomendação: manter o Telegram como canal principal e tratar o WhatsApp como canal de melhor esforço.

## 7. Decisões para o proprietário

1. **Cérebro padrão para dados pessoais:** trocar a DeepSeek pelo Groq como primeira opção, mantendo a DeepSeek como reserva? Ou aceitar a DeepSeek conscientemente, sabendo que é transferência para a China?
2. **Gemini:** o projeto Google da sua chave tem faturamento pago? Se tiver, declare "API paga, só eu" no Mapa de recursos e ele volta a ser reserva e transcrição.
3. **ElevenLabs:** antes de decidir, confira o histórico de uso. A ideia é mantê-lo como voz premium ou só como "boca" na voz montada.

## 8. Próximos lotes propostos

| Lote | Conteúdo | Custo novo |
| --- | --- | --- |
| A2 — Voz flexível | Voz como ouvir + pensar + falar, escolhidos pelo roteador: voz econômica com Groq e Google TTS, voz grátis no aparelho e voz contínua premium. Inclui as capacidades `stt`, `tts` e `realtime` no mapa | Zero dentro das cotas grátis |
| A3 — Saúde e telemetria | Registro por tentativa sem conteúdo, espera por provedor, preço versionado e recompensa pelos recibos | Zero |
| A4 — Novos provedores | Entradas prontas para Cloudflare, Z.ai e Alibaba no adaptador compatível, com campo de corpo extra e declaração de privacidade | Zero |
| A5 — Conectores ChatGPT e Claude | CIMD, anúncio do `iss`, `get_profile` e uma interface MCP Apps | Zero |
| A6 — MCP de saída e worker | Execução de ferramentas externas com portas de segurança; worker durável | A definir |

## Fontes primárias principais

- Gemini: [preços](https://ai.google.dev/gemini-api/docs/pricing), [Live API](https://ai.google.dev/gemini-api/docs/live), [tokens efêmeros](https://ai.google.dev/gemini-api/docs/ephemeral-tokens), [termos](https://ai.google.dev/gemini-api/terms).
- OpenAI: [preços](https://developers.openai.com/api/docs/pricing), [Realtime](https://developers.openai.com/api/docs/guides/realtime), [dados da API](https://developers.openai.com/api/docs/guides/your-data), [MCP personalizado no ChatGPT](https://developers.openai.com/api/docs/guides/custom-mcp-server.md), [plugins](https://developers.openai.com/plugins/llms-full.txt), [Sign in with ChatGPT](https://developers.openai.com/siwc/llms-full.txt).
- Anthropic: [construir conectores](https://claude.com/docs/connectors/building), [autenticação](https://claude.com/docs/connectors/building/authentication), [publicar no diretório](https://claude.com/docs/directory/publish), [termos de uso para desenvolvedores](https://code.claude.com/docs/en/legal-and-compliance).
- MCP: [versões](https://modelcontextprotocol.io/specification/versioning), [itens descontinuados em 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/deprecated), [sampling](https://modelcontextprotocol.io/specification/2026-07-28/client/sampling), [MCP Apps](https://github.com/modelcontextprotocol/ext-apps) e [matriz de clientes](https://modelcontextprotocol.io/extensions/client-matrix).
- Voz: [xAI](https://docs.x.ai), [ElevenLabs Agents](https://elevenlabs.io/pricing), [Deepgram](https://deepgram.com/pricing), [LiveKit](https://livekit.io/pricing), [Google Cloud TTS](https://cloud.google.com/text-to-speech/pricing), [Groq](https://groq.com/pricing).
- OpenJarvis: [repositório](https://github.com/open-jarvis/OpenJarvis), [documentação](https://open-jarvis.github.io/OpenJarvis/), [artigo](https://arxiv.org/abs/2605.17172).
- Leis: [9.609/98](https://www.planalto.gov.br/ccivil_03/leis/l9609.htm), [9.610/98](https://www.planalto.gov.br/ccivil_03/leis/l9610.htm), [9.279/96](https://www.planalto.gov.br/ccivil_03/leis/l9279.htm).
