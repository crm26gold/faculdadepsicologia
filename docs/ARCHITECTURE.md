# Arquitetura

O aplicativo usa Next.js com App Router, React e TypeScript. A interface mantém a navegação do workspace no cliente; as rotas de autenticação e dados executam no servidor. TipTap fornece a edição de notas, Zod valida os dados e Supabase está previsto para autenticação e persistência privada. Integrações externas ainda não foram verificadas.

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
| `src/components/` | Painel, matérias, caderno, agenda, planejamento e foco. |
| `supabase/migrations/` | SQL preparado para o workspace privado; aplicação remota não confirmada. |
| `tests/` | Testes de domínio, autenticação, restrições de produção e navegador. |

## Modelo e persistência

O documento `Workspace`, na versão 1, contém matérias (`subjects`), tarefas (`tasks`), notas (`notes`), sessões de foco (`sessions`), aulas recorrentes (`classes`) e período letivo (`term`). As relações por matéria e os identificadores são validados. Ainda não existem entidades para cursos, finanças, saúde, hábitos, contatos, inventário ou metas.

A persistência local compara o estado salvo antes de gravar e observa alterações de outras abas. Ao detectar conflito ou falha de leitura, bloqueia novas gravações e orienta exportação/recuperação. O conteúdo não recebe criptografia própria. A chave pessoal existente, identificada por `LOCAL_KEY`, deve ser preservada, mesmo quando a inicialização ou os modos forem alterados.

A importação JSON exige dados válidos e limite de 2 MB, apresenta confirmação e substitui o workspace selecionado. Não é uma mesclagem. Exportar a versão atual antes de confirmar continua necessário.

Na persistência remota preparada, a API usa `personal_workspaces` e a função `save_personal_workspace`. A revisão esperada evita sobrescrever uma alteração concorrente; o conflito retorna HTTP 409. A API exige sessão autorizada, verifica origem nas gravações e valida formato e tamanho. A migração inclui RLS e uma tabela `app_owner` para autorização explícita. Isso descreve o código e o SQL, não comprova políticas aplicadas ao banco remoto.

## Contrato de separação dos ambientes

| Aspecto | Demo pública | Workspace privado |
| --- | --- | --- |
| Modo | `APP_MODE=demo` | `APP_MODE=private` |
| Dados iniciais | Apenas exemplos sintéticos | Vazio para uma instalação nova |
| Identidade | Visitante da demonstração, sem conta privada | Proprietário explicitamente autorizado |
| Hospedagem | Projeto exclusivo de demo | Projeto privado separado |
| Credenciais | Nenhuma de Supabase, proprietário, OAuth ou IA | Somente as necessárias, configuradas fora do Git |
| Persistência | Apenas memória da aba; recarregar restaura exemplos; sem localStorage | Dados pessoais existentes preservados; nuvem após validação |
| Integrações | Nenhum acesso aos serviços privados | Ativação explícita após verificação externa |

Esse contrato deve ser aplicado e testado no servidor e na persistência. Uma função que gera exemplos, isoladamente, não comprova uma demo segura. A validação da implementação principal e do ambiente publicado é uma etapa distinta desta documentação.

Na Vercel, a demo somente pode ser aceita quando `DEMO_VERCEL_PROJECT_ID` estiver preenchido, coincidir com `VERCEL_PROJECT_ID` fornecido pela plataforma e for diferente do identificador privado. Identificador ausente, divergente ou privado deve bloquear a demo. Fora da Vercel, `APP_MODE=demo` deve funcionar localmente sem identificador de hospedagem.

A demo não pode ler nem gravar a chave pessoal. A remoção de uma grade real dos arquivos públicos não autoriza alterar registros pessoais existentes. Não deve haver importação automática do armazenamento pessoal para a demo ou para a nuvem.

## Autenticação e origem

O contrato privado usa Google OAuth com UUID (`APP_OWNER_USER_ID`) e e-mail (`APP_OWNER_EMAIL`) autorizados e verificados no servidor. A identidade deve ser provisionada explicitamente; o primeiro usuário a entrar nunca recebe acesso automaticamente. Nenhum e-mail real deve constar em exemplos públicos. A configuração remota desse fluxo ainda está pendente.

`APP_ORIGIN` identifica a origem canônica: protocolo, host e porta, sem caminho, parâmetros ou fragmento. A autorização de origem não deve depender do `Host` enviado pelo solicitante. Um preview do projeto privado continua privado, mesmo quando o código estiver disponível publicamente.

`GOOGLE_AUTH_ENABLED=true` e `FACULDADE_CLOUD_WORKSPACE=true` são ativações independentes, permitidas somente após a validação externa correspondente. Login funcionando não comprova persistência ou RLS; build passando não comprova nenhum desses serviços.

## Planejamento e integrações futuras

O planejador calcula sugestões a partir de prazos e aulas e só adiciona um bloco quando a pessoa aceita. Não há chamada a modelo de IA. O arquivo `.ics` é uma exportação manual; o aplicativo não recebe alterações feitas no calendário externo.

O futuro Oráculo por WhatsApp depende de uma identidade de tenant (o workspace ao qual a pessoa pertence) resolvida pelo servidor, vinculação verificada do remetente e consentimento específico. O texto de uma mensagem não poderá escolher o tenant nem autorizar acesso a notas. Isolamento entre tenants, revogação e confirmação de ações precisam existir antes dessa integração. O modelo atual de proprietário único não oferece multi-tenancy pronto. Consulte o [roadmap](ROADMAP.md).
