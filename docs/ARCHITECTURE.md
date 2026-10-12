# Arquitetura

O aplicativo usa Next.js com App Router, React e TypeScript. A interface mantém a navegação do workspace no cliente; as rotas de autenticação e dados executam no servidor. TipTap fornece a edição de notas, Zod valida os dados e Supabase fornece autenticação e persistência na instância existente. A IA generativa entra por uma camada de provedores trocáveis (`src/lib/ai`), usada pelo assistente, pela voz e pelos canais Telegram e WhatsApp. Sincronização com calendários externos ainda não existe; a agenda só exporta `.ics`.

O produto organiza a vida inteira da pessoa, não apenas os estudos. São três camadas: a vida pessoal (um documento por conta), a camada coletiva (instituições, salas, grupos e trabalhos, em tabelas relacionais) e a IA, que age sobre a vida pessoal com confirmação.

## Camadas

| Caminho | Responsabilidade |
| --- | --- |
| `src/app/page.tsx` | Seleção do modo e controle de acesso ao workspace. |
| `src/app/auth/` e `src/app/login/` | Entrada, callback e saída da sessão. |
| `src/app/api/workspace/route.ts` | Leitura e gravação autenticadas do workspace privado. |
| `src/proxy.ts` e `src/lib/supabase/server.ts` | Cookies e validação da sessão no servidor. |
| `src/lib/config.ts` e `src/lib/auth-input.ts` | Configuração, identidade autorizada, origem e entradas de autenticação. |
| `src/lib/workspace.ts` | Tipos, validação, formato versionado e chave de armazenamento local. |
| `src/lib/academic.ts` e `src/lib/calendar-export.ts` | Recorrências, sugestões por regras e exportação `.ics`. |
| `src/components/use-workspace.ts` | Carregamento, persistência e tratamento de conflitos. |
| `src/components/` | Meu dia, estudos, caderno, agenda, foco, metas, finanças, rotina, flashcards e assistente. |
| `src/lib/community.ts`, `src/components/community/` e `src/app/api/spaces/` | Camada coletiva: salas, grupos, trabalhos em grupo, contatos, conta, termos e painel de administração. |
| `src/lib/ai/` | Provedores, rotas por tarefa, tentativas alternativas, chaves cifradas e orçamento de consumo. |
| `src/lib/voice/` e `src/app/api/ai/live/` | Adaptadores Gemini Live, GPT-Live, ElevenLabs e xAI/Grok com autorização temporária; troca de transporte somente antes de conectar. |
| `src/lib/bot/`, `src/lib/whatsapp/` e `integrations/whatsapp-bridge/` | Telegram e a ponte privada do WhatsApp por QR, ambos vinculados à conta por código. |
| `src/lib/integrations/` | Servidores MCP externos: descoberta e execução das ferramentas liberadas, só pelo proprietário na Administração. `private.ai_connector_call` confere dono, conector ligado e lista liberada, e registra a chamada antes do envio. |
| `src/lib/assistant-rules.ts` | Regras de pedido de todas as portas (texto, voz, Telegram, WhatsApp, MCP): lembrete, intensidade, `daqui`, tipo e área, foco. `commandSystem`, `voiceSystem` e `mcpInstructions` são montados daqui. O motor (`applyCommands`) completa com as palavras da pessoa (`completeFromRequest`). |
| `src/lib/reminders.ts`, `src/lib/reminders-server.ts`, `src/app/api/reminders/`, `public/sw.js` | Avisos: `private.reminders` nasce do `remind` de cada compromisso (gatilho em `personal_tasks`); o relógio do banco (`pg_cron` + `pg_net`) chama `/api/reminders/dispatch` só quando algo venceu; o servidor reserva (`reminders_claim`), envia por canal (Web Push com VAPID derivado, Telegram, fila da ponte do WhatsApp; só canais grátis) e devolve o resultado (`reminders_finish`), que marca o próximo degrau da escada. Guarda só canal, degrau e sucesso, nunca o texto. Todo degrau vai a todos os canais ligados. Um gatilho em `personal_state` faz a pergunta do foco (`task_id` `foco:<id>`). O mesmo relógio copia para o Google as agendas mudadas fora do app (`google_agenda_due`). |
| `src/lib/google-agenda.ts`, `src/lib/google-agenda-server.ts`, `src/app/api/google-agenda/` | Google Agenda (Jornada → Google): OAuth por pessoa com PKCE, autorização cifrada em `private.google_agenda_links` (uma linha por pessoa, só ela alcança), e a atualização que leva a agenda para a agenda "Jornada Plena". |
| `src/lib/mcp/`, `src/app/api/mcp/` | Servidor MCP da Jornada para assistentes externos: chave pessoal (só o hash no banco), consulta e registro na vida pessoal de quem criou a chave; na parte coletiva, as ações da tela como a própria pessoa (`collective.ts`). |
| `supabase/migrations/` | Migrações do workspace, Storage privado e proteção contra editores antigos, aplicadas no projeto privado. |
| `tests/` | Testes de domínio, autenticação, restrições de produção e navegador. |

## Interface e carregamento

`WorkspaceApp` preserva a navegação, os estados de persistência e os controles da conta. Onze painéis secundários usam `next/dynamic` com feedback de carregamento; o editor mantém sua fronteira sem SSR. `WorkspaceThemeObserver` acompanha a preferência automática durante toda a navegação, com escolha explícita prioritária e preferência somente em memória na demo. A busca filtra o documento pessoal localmente apenas quando aberta.

A landing isola Motion, Lenis e o 3D decorativo. `useLandingMotion` usa um snapshot estático igual no servidor e na hidratação inicial, depois assina a preferência de movimento do navegador. O 3D tem fallback e só é carregado em desktop compatível e visível. Tokens de superfície, contraste, cabeçalho e foco pertencem ao sistema visual; as melhorias estão registradas em [DESIGN_UX_JORNADA.md](DESIGN_UX_JORNADA.md).

## Modelo e persistência

O documento `Workspace` guarda a vida pessoal: cursos (`courses`), matérias (`subjects`), tarefas e compromissos (`tasks`), notas (`notes`), sessões de foco (`sessions`), aulas recorrentes (`classes`), período letivo (`term`), áreas (`areas`), cadernos (`notebooks`), metas (`goals`), projetos (`projects`), lançamentos financeiros (`transactions`), hábitos (`habits`), perfil (`profile`) e flashcards (`flashcards`), com vínculos por `areaId`/`notebookId`. As relações e os identificadores são validados. Contatos e tudo o que é coletivo ficam em tabelas relacionais próprias. Saúde, emocional, espiritualidade, família, casa, lazer e documentos ainda não têm entidades: existem apenas como áreas.

Desde 08/10/2026, cada módulo da vida pessoal tem a própria tabela (`personal_tasks`, `personal_notes`, `personal_transactions`, `personal_habits`, `personal_goals`, `personal_projects`, `personal_courses`, `personal_subjects`, `personal_classes`, `personal_notebooks`, `personal_flashcards`, `personal_areas` e `personal_sessions`). Cada linha guarda um registro validado, a posição dele na lista e uma versão que só sobe quando o conteúdo muda. Os campos únicos (formato, semestre, perfil, saldo inicial e foco ativo) e a revisão da conta ficam em `personal_state`. A pessoa só lê as próprias linhas (RLS), e ninguém grava direto nas tabelas.

O material dos cursos (09/10/2026) fica fora do documento, com leitura e gravação próprias: `public.course_materials` guarda cada arquivo, texto escrito ou "o que a IA precisa saber", no curso (geral) ou numa matéria ou módulo dele. `public.course_material_chunks` guarda o texto em trechos pesquisáveis em português sem acento (configuração `public.jornada_pt`). Os arquivos originais ficam no bucket privado `course-materials`, na pasta da conta, e só entra o arquivo que o servidor preparou. Só o dono lê e grava (RLS). Os limites são 200 MB e 1.000 materiais por conta, e a lixeira guarda 30 dias. O servidor lê o texto de PDF, Word, PowerPoint e texto (`src/lib/materials/extract.ts`) sem enviar o arquivo a nenhuma IA. Rota: `src/app/api/materiais/route.ts`. Plano e próximas etapas em [PLANO_MATERIAL_DOS_CURSOS.md](PLANO_MATERIAL_DOS_CURSOS.md).

`public.personal_workspaces` passou a ser uma vista que remonta o mesmo documento, na mesma ordem, a partir das tabelas. O app, o MCP, os bots, a voz e o WhatsApp continuam lendo e gravando por ela. Toda gravação passa por `private.workspace_store`, que mantém as validações e o controle de revisão de antes, regrava só as linhas que mudaram e manda para a lixeira o que saiu, na mesma transação. O documento anterior à mudança fica em `private.personal_workspaces_legacy` até a limpeza antes do lançamento. O limite de 2 MB continua valendo para o espaço inteiro.

A persistência local compara o estado salvo antes de gravar e observa alterações de outras abas. Ao detectar conflito ou falha de leitura, bloqueia novas gravações e orienta exportação/recuperação. O conteúdo não recebe criptografia própria. A chave pessoal existente, identificada por `LOCAL_KEY`, deve ser preservada, mesmo quando a inicialização ou os modos forem alterados.

A importação JSON exige dados válidos e limite de 2 MB, apresenta confirmação e substitui o workspace selecionado. Não é uma mesclagem. Exportar a versão atual antes de confirmar continua necessário.

Na persistência remota, o app envia a `PUT /api/workspace` só o que mudou desde a versão que conhece (`src/lib/workspace-sync.ts`). Para cada lista vão os registros novos ou editados e os removidos, cada um com a impressão (`recordVersion`) de como estava, e a ordem só quando mudou além de acrescentar no fim; os campos únicos vão um a um. A API junta isso à versão atual, valida o documento inteiro e grava com `save_personal_workspace` na revisão lida. Se outro aparelho ou um assistente gravou no meio, ela junta de novo (até 3 vezes) e devolve a versão juntada, que a tela adota sem perder o que foi digitado durante o envio. Registros diferentes mudados em dois lugares ficam os dois; no mesmo registro fica a versão mais recente, com aviso; uma edição nunca some porque outro lugar apagou o registro. Um app de versão antiga (`editorGeneration`), uma regra entre registros quebrada pela junção e o limite de 2 MB são recusados sem mudar nada (HTTP 409, 409 e 413). Abas abertas antes dessa mudança ainda enviam o documento inteiro, com o controle de revisão de antes. A API exige sessão autorizada, verifica origem nas gravações e valida formato e tamanho. A migração inclui RLS e uma tabela `app_owner` para autorização explícita. As políticas remotas e registros persistidos foram confirmados; teste completo de upload na sessão real e recuperação de mídia continuam pendentes.

## Credenciais pessoais e execução da IA

`private.ai_user_keys` guarda chaves cifradas por conta e provedor. As RPCs públicas devolvem apenas metadados para a própria sessão; a leitura do conteúdo cifrado exige simultaneamente sessão e prova do servidor. Nenhuma chave é persistida no armazenamento do navegador. Pausar ou remover uma chave pessoal não altera registros da vida pessoal.

`private.ai_runtime_for` combina fontes pessoais, do proprietário e da base autorizada, identificando a origem em cada candidato. Texto prioriza as APIs da própria pessoa; basta uma chave pessoal ligada para a rota inteira daquela pessoa funcionar como automática. A voz do proprietário mantém a tarefa administrativa. Voz de membros usa apenas APIs pessoais compatíveis.

`private.ai_member_base_sources` guarda, por credencial (hash da chave atual), a declaração de privacidade e o público: `owner` vale só para as rotas do proprietário; `members` também oferece a fonte à base, que continua desligada por padrão e atende só texto. Substituir a chave invalida a declaração. Gemini só recebe dados pessoais com declaração de faturamento pago, inclusive nas rotas fixas, nas reservas e na transcrição do WhatsApp. Sem ela, a conexão fica fora da rota mesmo aparecendo como configurada.

`private.ai_resource_map` (somente proprietário) mostra o que está configurado e o que realmente atua em cada tarefa. Ele chama as mesmas funções do roteador, explica cada exclusão e não devolve chaves cifradas nem detalhes de membros, apenas contagens. As capacidades de cada provedor vêm de `src/lib/ai/resources.ts`, conferidas por testes contra os adaptadores; não provam cota nem créditos.

O orçamento é reservado antes de cada tentativa efetiva, com limite único de candidatos (8 no automático, 4 nos demais modos). Credenciais pessoais usam limites por conta; as fontes do proprietário e da base também consomem o orçamento global. Conexão pulada não reserva orçamento.

`src/lib/ai/provider-failure.ts` classifica cada falha pelo status HTTP e pelos códigos estruturados do corpo; frases inteiras de saldo só entram como último recurso, nunca "quota" sozinha. Só a classe é guardada: o texto do provedor não chega à mensagem nem ao log. `runAiAttempts` (`src/lib/ai/attempts.ts`) toma uma ação por classe:

| Classe | Exemplos | Automático | Fixo, reserva da mesma empresa ou alternativas |
| --- | --- | --- | --- |
| `network` | sem resposta, tempo esgotado | próxima conexão | próxima conexão |
| `server` | 5xx, resposta vazia | próxima conexão | próxima conexão |
| `rate_limit` | 429 | próxima conexão | para |
| `model` | 404, modelo ou recurso que a conexão não atende | próxima conexão | próxima conexão |
| `auth` | 401, 403, chave inválida | pula só essa chave | pula só essa chave |
| `billing` | 402, sem saldo, faturamento desativado | pula todas as chaves da empresa | pula todas as chaves da empresa; uma alternativa de outra empresa ainda é tentada |
| `invalid` | 400, 422, falha sem status | para | para |
| Recusa da Jornada | `BudgetLimitError`, conta bloqueada pelo provedor | para tudo | para tudo |

Saldo é da conta, não da chave: trocar de chave da mesma empresa não resolve e só gastaria orçamento.

Na parte coletiva, o MCP passa por `public.mcp_act`. A função é do papel `jornada_actor` (sem login e sem ignorar RLS, herda só `authenticated`). Ela valida a chave com o mesmo limite de chamadas, define a pessoa em `request.jwt.claim.sub` e chama uma função de uma lista fechada, a mesma que a tela chama. O mapa entre a ação da tela e a função do banco fica em `src/lib/community-calls.ts`, compartilhado pelas rotas e pelo MCP. O teste `tests/sql/mcp-collective.sql` compara, papel por papel, o resultado pela tela e pelo assistente. No MCP, OAuth registra apenas hashes de códigos e tokens. Uma reutilização de renovação revoga a família inteira em transação, e o registro de clientes tem limites globais e por origem. `private.mcp_receipts` torna pedidos com `request_id` idempotentes por 90 dias. Alterações de workspace, comprovantes e confirmações pendentes são gravados atomicamente; ações destrutivas reaparecem nas Conversas do app e passam novamente pela verificação do registro antes da confirmação.

Nos pedidos de voz, `assistant_jobs.input.actions` é uma proposta opcional, validada pelo mesmo `commandAction` usado nos demais canais. `assistant-execution.ts` concentra execução, resumo, confirmação pendente e uma repetição por conflito de revisão. O adaptador `ai/run-job.ts` prende leitura, lease e commit à conta autenticada. Sem ações estruturadas, ele chama o planejador existente com orçamento e fallback; com ações estruturadas, não chama o runtime de IA nem reserva uma tentativa de API. O custo da própria chamada de voz continua existindo. `finish_assistant_job` grava workspace e resultado na mesma transação. O recibo identifica `execution: structured | planned`; pedidos antigos continuam compatíveis.

Este mecanismo usa a fila persistente já existente, iniciada por `after()` e retomada pelos Pedidos da conversa. Não há ainda um worker autônomo periódico; `after()` está sujeito ao prazo da função Vercel. A direção e os limites de cada integração, incluindo o MCP, estão em [FUNDACAO_ASSISTENTE.md](FUNDACAO_ASSISTENTE.md).

## Contrato de separação dos ambientes

| Aspecto | Demo pública | Workspace privado |
| --- | --- | --- |
| Modo | `APP_MODE=demo` | `APP_MODE=private` |
| Dados iniciais | Apenas exemplos sintéticos | Vazio para uma instalação nova |
| Identidade | Visitante da demonstração, sem conta privada | Contas Google verificadas, cada uma com seu espaço; proprietário (master) fixado explicitamente |
| Hospedagem | Projeto exclusivo de demo | Projeto privado separado |
| Credenciais | Nenhuma de Supabase, proprietário, OAuth ou IA | Somente as necessárias, configuradas fora do Git |
| Persistência | Apenas memória da aba; recarregar restaura exemplos; sem localStorage | Dados pessoais existentes preservados; nuvem após validação |
| Integrações | Nenhum acesso aos serviços privados | Ativação explícita após verificação externa |

Esse contrato deve ser aplicado e testado no servidor e na persistência. Uma função que gera exemplos, isoladamente, não comprova uma demo segura. A validação da implementação principal e do ambiente publicado é uma etapa distinta desta documentação.

Na Vercel, a demo somente pode ser aceita quando `DEMO_VERCEL_PROJECT_ID` estiver preenchido, coincidir com `VERCEL_PROJECT_ID` fornecido pela plataforma e for diferente do identificador privado. Identificador ausente, divergente ou privado deve bloquear a demo. Fora da Vercel, `APP_MODE=demo` deve funcionar localmente sem identificador de hospedagem.

A demo não pode ler nem gravar a chave pessoal. A remoção de uma grade real dos arquivos públicos não autoriza alterar registros pessoais existentes. Não deve haver importação automática do armazenamento pessoal para a demo ou para a nuvem.

## Autenticação e origem

Desde a fundação multiusuário de 30/09, qualquer conta Google com e-mail verificado pode entrar; cada conta tem seu próprio espaço pessoal, isolado por RLS, e começa sem acesso a nenhuma sala. O UUID (`APP_OWNER_USER_ID`) e o e-mail (`APP_OWNER_EMAIL`) fixam a identidade do proprietário, que é o administrador master, verificada no servidor. O primeiro usuário a entrar nunca vira master automaticamente. Nenhum e-mail real deve constar em exemplos públicos; credenciais não pertencem ao repositório.

`APP_ORIGIN` identifica a origem canônica: protocolo, host e porta, sem caminho, parâmetros ou fragmento. A autorização de origem não deve depender do `Host` enviado pelo solicitante. Um preview do projeto privado continua privado, mesmo quando o código estiver disponível publicamente.

`GOOGLE_AUTH_ENABLED=true` e `FACULDADE_CLOUD_WORKSPACE=true` são ativações independentes, permitidas somente após a validação externa correspondente. Login funcionando não comprova persistência ou RLS; build passando não comprova nenhum desses serviços.

## Planejamento e integrações futuras

O planejador calcula sugestões a partir de prazos e aulas e só adiciona um bloco quando a pessoa aceita; ele usa regras locais, não IA. A IA fica no assistente. O arquivo `.ics` é uma exportação manual. O Google Agenda é uma cópia que se atualiza sozinha num só sentido: a rota `/api/workspace` agenda a atualização com `after()` ao abrir o app e a cada gravação; `google_agenda_claim` deixa uma por vez por pessoa e pula a revisão já copiada. Cada item ganha um ID de evento fixo (hash do ID na Jornada) e uma marca do conteúdo, então só vai ao Google o que mudou, e eventos criados à mão naquela agenda não são tocados. O aplicativo não recebe alterações feitas no Google.

Telegram e WhatsApp já resolvem a conta no servidor: o remetente só é aceito depois de vinculado por um código de uso único gerado na conta, e o texto de uma mensagem nunca escolhe a conta nem autoriza acesso. Exclusões e substituições exigem confirmação. O WhatsApp usa uma ponte por QR que roda no computador do proprietário, não a API oficial da Meta; detalhes em [WhatsApp da Jornada](WHATSAPP_JORNADA.md). O Google Drive ainda depende de uma conexão OAuth própria. Consulte o [roadmap](ROADMAP.md).

## Evolução de 27/09

Consulte [áreas e cadernos](AREAS_E_CADERNOS_2026-09-27.md) e [editor multimídia](CADERNO_MULTIMIDIA_2026-09-27.md). `editorGeneration: 2` identifica gravações do novo editor; `private.workspace_store` bloqueia que um editor antigo sobrescreva o que um mais novo salvou. Fotos e áudios ficam no Storage privado, não nas tabelas.
