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
| `src/lib/integrations/` | Cadastro e descoberta de servidores MCP, sem execução de ferramentas. |
| `src/lib/mcp/`, `src/app/api/mcp/` | Servidor MCP da Jornada para assistentes externos: chave pessoal (só o hash no banco), consulta e registro na vida pessoal de quem criou a chave. |
| `supabase/migrations/` | Migrações do workspace, Storage privado e proteção contra editores antigos, aplicadas no projeto privado. |
| `tests/` | Testes de domínio, autenticação, restrições de produção e navegador. |

## Interface e carregamento

`WorkspaceApp` preserva a navegação, os estados de persistência e os controles da conta. Onze painéis secundários usam `next/dynamic` com feedback de carregamento; o editor mantém sua fronteira sem SSR. `WorkspaceThemeObserver` acompanha a preferência automática durante toda a navegação, com escolha explícita prioritária e preferência somente em memória na demo. A busca filtra o documento pessoal localmente apenas quando aberta.

A landing isola Motion, Lenis e o 3D decorativo. `useLandingMotion` usa um snapshot estático igual no servidor e na hidratação inicial, depois assina a preferência de movimento do navegador. O 3D tem fallback e só é carregado em desktop compatível e visível. Tokens de superfície, contraste, cabeçalho e foco pertencem ao sistema visual; as melhorias estão registradas em [DESIGN_UX_JORNADA.md](DESIGN_UX_JORNADA.md).

## Modelo e persistência

O documento `Workspace` guarda a vida pessoal: cursos (`courses`), matérias (`subjects`), tarefas e compromissos (`tasks`), notas (`notes`), sessões de foco (`sessions`), aulas recorrentes (`classes`), período letivo (`term`), áreas (`areas`), cadernos (`notebooks`), metas (`goals`), projetos (`projects`), lançamentos financeiros (`transactions`), hábitos (`habits`), perfil (`profile`) e flashcards (`flashcards`), com vínculos por `areaId`/`notebookId`. As relações e os identificadores são validados. Contatos e tudo o que é coletivo ficam em tabelas relacionais próprias. Saúde, emocional, espiritualidade, família, casa, lazer e documentos ainda não têm entidades: existem apenas como áreas.

Limite conhecido: a vida pessoal inteira é um único documento JSON por conta, de até 2 MB, regravado por completo a cada alteração. Isso impede compartilhar partes dele, obriga a IA a carregar tudo e faz dois aparelhos editando ao mesmo tempo entrarem em conflito. Módulos que precisem crescer ou ser compartilhados devem migrar para tabelas próprias; ver a última seção.

A persistência local compara o estado salvo antes de gravar e observa alterações de outras abas. Ao detectar conflito ou falha de leitura, bloqueia novas gravações e orienta exportação/recuperação. O conteúdo não recebe criptografia própria. A chave pessoal existente, identificada por `LOCAL_KEY`, deve ser preservada, mesmo quando a inicialização ou os modos forem alterados.

A importação JSON exige dados válidos e limite de 2 MB, apresenta confirmação e substitui o workspace selecionado. Não é uma mesclagem. Exportar a versão atual antes de confirmar continua necessário.

Na persistência remota, a API usa `personal_workspaces` e a função `save_personal_workspace`. A revisão esperada evita sobrescrever uma alteração concorrente; o conflito retorna HTTP 409. A API exige sessão autorizada, verifica origem nas gravações e valida formato e tamanho. A migração inclui RLS e uma tabela `app_owner` para autorização explícita. As políticas remotas e registros persistidos foram confirmados; teste completo de upload na sessão real e recuperação de mídia continuam pendentes.

## Credenciais pessoais e execução da IA

`private.ai_user_keys` guarda chaves cifradas por conta e provedor. As RPCs públicas devolvem apenas metadados para a própria sessão; a leitura do conteúdo cifrado exige simultaneamente sessão e prova do servidor. Nenhuma chave é persistida no armazenamento do navegador. Pausar ou remover uma chave pessoal não altera registros da vida pessoal.

`private.ai_runtime_for` combina fontes pessoais, do proprietário e da base autorizada, identificando a origem em cada candidato. Texto prioriza as APIs da própria pessoa; a voz do proprietário mantém a tarefa administrativa. Voz de membros usa apenas APIs pessoais compatíveis. A base compartilhada fica desligada por padrão, atende texto e exige autorização de privacidade presa ao hash da credencial atual; substituir a chave invalida a autorização. Gemini só recebe dados pessoais após declaração de faturamento pago, inclusive nas rotas fixas e reservas.

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

No MCP, OAuth registra apenas hashes de códigos e tokens. Uma reutilização de renovação revoga a família inteira em transação, e o registro de clientes tem limites globais e por origem. `private.mcp_receipts` torna pedidos com `request_id` idempotentes por 90 dias. Alterações de workspace, comprovantes e confirmações pendentes são gravados atomicamente; ações destrutivas reaparecem nas Conversas do app e passam novamente pela verificação do registro antes da confirmação.

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

O planejador calcula sugestões a partir de prazos e aulas e só adiciona um bloco quando a pessoa aceita; ele usa regras locais, não IA. A IA fica no assistente. O arquivo `.ics` é uma exportação manual; o aplicativo não recebe alterações feitas no calendário externo.

Telegram e WhatsApp já resolvem a conta no servidor: o remetente só é aceito depois de vinculado por um código de uso único gerado na conta, e o texto de uma mensagem nunca escolhe a conta nem autoriza acesso. Exclusões e substituições exigem confirmação. O WhatsApp usa uma ponte por QR que roda no computador do proprietário, não a API oficial da Meta; detalhes em [WhatsApp da Jornada](WHATSAPP_JORNADA.md). Google Agenda e Drive ainda dependem de uma conexão OAuth própria. Consulte o [roadmap](ROADMAP.md).

## Evolução de 27/09

Consulte [áreas e cadernos](AREAS_E_CADERNOS_2026-09-27.md) e [editor multimídia](CADERNO_MULTIMIDIA_2026-09-27.md). `editorGeneration: 2` identifica gravações do novo editor; um trigger bloqueia downgrade após a primeira gravação. Fotos/áudios ficam no Storage privado, não no JSON. O documento JSON monolítico continua limitado a 2 MB; módulos futuros exigirão migrações incrementais para tabelas próprias com relações verificáveis, não um depósito genérico de JSON sem validação.
