# Jornada Plena — auditoria e passagem do Codex para o Claude

**Documento para começar um chat novo sem conhecer a conversa anterior.** Preparado em 05/10/2026, com verificações remotas entre 14:54 e 14:58 UTC (11:54–11:58 de Brasília). Base de código e produção auditada: `c8dc3fbf093d9681ba31d6fb1c926269a5f71a15`, merge do PR #49. As configurações podem mudar: confira-as antes de agir.

O proprietário pediu esta passagem porque seus créditos do Codex estão perto do limite. Quer continuar no Claude, sem perder decisões, refazer entregas nem misturar projetos. **Nesta passagem foram feitas leituras de auditoria e documentação; não houve mudança de chaves, compartilhamento, banco ou produção.**

## 1. Mensagem para iniciar o novo chat

> Continue o trabalho da Jornada Plena no repositório `crm26gold/faculdadepsicologia`. Leia primeiro `AGENTS.md` e este documento completo, `docs/PASSAGEM_CODEX_PARA_CLAUDE_2026-10-05.md`. Confirme checkout, origin, branch e versão atual da main; não use automaticamente um branch antigo do Claude. A prioridade é a infraestrutura do assistente: controle central de recursos, autorização, capacidades, saúde, cotas, execução durável e relatórios, preservando o visual aprovado. Os PRs #46–#49 já foram entregues. APIs da base podem atender o sistema conforme meus controles; meus recursos MCP só são compartilhados conforme minha escolha e capacidade suportada. Recursos dos demais usuários atendem suas contas; uso para evolução do sistema exige autorização específica do dono, sem usar a cota deles para atender outra pessoa. Primeiro apresente sua leitura do estado e o plano do próximo lote; faça uma pergunta material por vez quando faltar decisão. Não contrate serviços, altere permissões, consuma créditos de chamadas reais nem compartilhe fontes silenciosamente. Trabalhe em branch próprio e entregue diff, testes e relatório para revisão.

> Atue também como arquiteto e colaborador sênior: sempre que eu trouxer um vídeo, aplicativo, sistema, serviço ou ideia, investigue a raiz do problema e o mecanismo da solução. Traduza a referência em capacidades, tecnologias e um plano aplicável à Jornada, conforme a seção 3.1. Questione premissas com respeito, recomende o que faz sentido e explique os limites. Não copie marcas ou promessas sem verificar, nem espere que eu conheça os nomes das bibliotecas para propor uma boa solução.

Se este for um chat do Claude sem terminal/repositório, anexe este arquivo e use-o como contexto. O texto não concede acesso ao GitHub, Supabase, Vercel ou computador: é preciso conectar os recursos suportados pelo ambiente. Não cole credenciais no chat para compensar falta de acesso.

## 2. Identidade do projeto e estado confirmado

| Item | Valor auditado |
| --- | --- |
| Produto | Jornada Plena; nome histórico do repositório/pacote: Faculdade Psi |
| Diretório local do proprietário | `C:\Users\Yeshua\Desktop\Faculdade` |
| Git origin | `https://github.com/crm26gold/faculdadepsicologia.git` |
| Branch de código antes desta documentação | `main`, limpa, no commit `c8dc3fb` |
| Branch desta passagem | `codex/claude-handoff-20261005`, somente documentação, criado a partir de `c8dc3fb` |
| Supabase | `uccoaebzmvocqwqljmul` |
| Vercel projeto | `faculdadepsicologia`, equipe/scope `faculpsi` |
| Vercel project ID | `prj_NX7DcoSWkdMgUdsSHsazXEy2skM3` |
| Vercel team ID | `team_SG6Lc4KBVCNzFpheW2wYYBWP` |
| Produção | `https://faculdadepsicologia.vercel.app` |
| Deployment atual | `dpl_6v16S69VHgEsqkrAzMmREvAP5iYR`, **READY**, SHA `c8dc3fbf093d9681ba31d6fb1c926269a5f71a15` |
| Alias público | Aponta para o deployment acima; confirmado pela API Vercel |
| Último CI da main | [37325180883](https://github.com/crm26gold/faculdadepsicologia/actions/runs/37325180883), **success**, mesmo SHA |

Se trabalhar em Linux/cloud, o caminho Windows não existirá. Use o checkout autenticado do mesmo repositório e confirme sua identidade. Não copie configuração de outro produto.

**Isolamento:** ZapBot e o site imobiliário são projetos separados. A conversa sobre reutilizar ZapBot foi interrompida pelo proprietário; não retomar essa mistura. A referência imobiliária foi apenas de tonalidades azuis, nunca de credenciais, dados ou arquitetura operacional.

## 3. Visão do produto e modo de colaboração

A Jornada organiza a vida inteira de cada adulto: dia, agenda, estudos, caderno, foco, metas, finanças, hábitos, contatos e outros blocos. Nasceu numa faculdade de psicologia, mas não se limita a ela. A camada coletiva tem instituições, salas, grupos e trabalhos; papéis variam conforme o contexto. A IA consulta e atua sobre a vida pessoal com controle e confirmação.

Regras indispensáveis:

- Privado por padrão; compartilhar exige ato explícito. Administração, grupos e professores não recebem a vida pessoal da pessoa.
- RLS, validação e autorização no servidor, não apenas controles da tela. Ações administrativas deixam rastro.
- Identidade, histórico e permissões ficam na Jornada; números de WhatsApp/Telegram são transportes substituíveis, não a identidade durável.
- Preservar dados, backups, formatação das notas e atribuição histórica do foco. Não inserir exemplos em contas privadas nem iniciar foco automaticamente ao preparar uma atividade.
- O proprietário gosta de conversar por voz e pode enviar ideias rápidas. Organize, filtre e coloque em etapas; mantenha ritmo calmo. Ele quer um colaborador sênior que explique e pergunte quando uma decisão muda o resultado.
- Prioridade mais recente: **fundação e infraestrutura primeiro**. Design adicional, novo logo e aceites reais ficam para a etapa adequada. Validação técnica continua obrigatória antes de publicar.
- Custo adicional mínimo no começo. Não comprar servidores, reativar faturamento, aumentar planos ou habilitar fontes pagas por conta própria.

Identidade visual aprovada: azul oceano/escuro, contraste legível, cores vivas sem aparência apagada, superfícies claras/escuras e símbolo existente. Mobile e desktop precisam funcionar. Não refazer a identidade nem remover a história do produto.

### 3.1. Postura crítica: investigar a raiz e traduzir referências

Pedido explícito posterior do proprietário: ele aprovou a análise que foi além do nome de um aplicativo e encontrou as tecnologias e mecanismos relevantes. Quer que o Claude trabalhe dessa forma também. O proprietário não precisa saber programação para expressar o resultado desejado; cabe ao agente transformar essa intenção numa solução técnica coerente.

Ao receber informação, vídeo, app, sistema, serviço ou sugestão:

1. **Encontre o objetivo:** que problema isso resolve e qual experiência/capacidade o proprietário quer para a Jornada? Separe o benefício desejado do nome comercial e da apresentação do vídeo.
2. **Investigue o mecanismo:** identifique fluxo de dados, execução, protocolos, bibliotecas, identidade, autorização, persistência e custos que tornam o resultado possível. Se o assunto envolver uma falha, investigue a causa antes de trocar ferramentas.
3. **Verifique as afirmações:** consulte o código e, quando necessário, documentação primária atual. Não afirme quais tecnologias uma plataforma usa internamente sem evidência. Uma biblioteca adequada para reproduzir um efeito não prova que a plataforma original a utiliza. Diferencie fato, hipótese e proposta.
4. **Compare com a Jornada:** o mecanismo já existe? Há uma dependência desnecessária? O recurso pode ser adaptado sem mudar o visual aprovado, duplicar módulos, expor dados ou contratar serviço? Avalie privacidade, autorização, acessibilidade, mobile, manutenção e custo conforme a tarefa.
5. **Exerça julgamento:** recomende uma solução e justifique os tradeoffs. Se a ideia for incompleta, impraticável ou mais cara que o benefício, diga por quê e proponha uma alternativa. Considere também a possibilidade de sua própria proposta estar errada; revise-a diante de evidências novas.
6. **Torne a proposta executável:** forneça tecnologias/adaptadores realmente necessários, responsabilidades, arquivos envolvidos, prompts úteis, etapas pequenas e critérios de pronto. Evite listas de ferramentas por popularidade ou instalação de skills apenas por palavras-chave.
7. **Alinhe o que importa:** pergunte ao proprietário sobre resultado, prioridade, custo, privacidade ou permissão quando isso mudar a solução. Resolva escolhas técnicas rotineiras usando evidências e explique em linguagem simples; não transfira ao usuário leigo a obrigação de projetar a arquitetura.
8. **Valide o resultado:** quando a implementação estiver autorizada, execute e teste o fluxo real pertinente. “Tem código”, “foi publicado” e “funciona na conta real” são estados distintos. Não prometa economia, disponibilidade ou funcionamento universal sem medição/evidência.

Exemplos desta postura no próprio projeto:

- “Quero uma experiência como aquela plataforma visual”: analisar hierarquia, interação, movimento e responsividade; propor componentes e bibliotecas compatíveis com a base React/Next existente, conforme o efeito, em vez de instalar a plataforma citada ou refazer tudo.
- “A voz conversa, mas não registra”: separar áudio, interpretação, validação e commit. O PR #49 nasceu dessa análise e removeu a segunda chamada ao planejador quando há ações estruturadas completas, preservando o caminho antigo e as confirmações.
- “Meu MCP vai dar poder ao sistema”: identificar o sentido de acesso, ferramenta versus modelo, autenticação e escopo de uso; comprovar a capacidade antes de tratar uma assinatura como reserva executável para outros usuários.

Formato curto sugerido para a devolutiva: **o que entendi → mecanismo identificado → evidências e limites → recomendação para a Jornada → próximo passo/pergunta material**. Uma referência é insumo para raciocinar, não uma instrução técnica incontestável nem autorização para executar tudo que ela sugere.

## 4. O que já foi entregue — não refazer

Todos os PRs abaixo foram conferidos como **MERGED** no GitHub.

| PR | Entrega |
| --- | --- |
| [#37](https://github.com/crm26gold/faculdadepsicologia/pull/37), [#38](https://github.com/crm26gold/faculdadepsicologia/pull/38) | Skills, documentação de produto, ajustes de banco e diagnóstico da recusa Gemini |
| [#39](https://github.com/crm26gold/faculdadepsicologia/pull/39) | ElevenLabs na chamada ao vivo |
| [#40](https://github.com/crm26gold/faculdadepsicologia/pull/40), [#41](https://github.com/crm26gold/faculdadepsicologia/pull/41) | Roteamento automático, prioridade de economia e transcrição Whisper/Groq/OpenAI |
| [#42](https://github.com/crm26gold/faculdadepsicologia/pull/42), [#43](https://github.com/crm26gold/faculdadepsicologia/pull/43), [#44](https://github.com/crm26gold/faculdadepsicologia/pull/44) | MCP da Jornada, OAuth/PKCE e alinhamento do histórico de migração |
| [#45](https://github.com/crm26gold/faculdadepsicologia/pull/45) | Relatório histórico do Claude de 05/10 |
| [#46](https://github.com/crm26gold/faculdadepsicologia/pull/46) | Correções de voz/roteamento, APIs pessoais, remoção de chaves, painel administrativo, proteção OAuth e confirmações MCP duráveis |
| [#47](https://github.com/crm26gold/faculdadepsicologia/pull/47) | Limite global de 60 segundos para iniciar voz e nomes de migrações alinhados ao remoto |
| [#48](https://github.com/crm26gold/faculdadepsicologia/pull/48) | UX responsiva, Meu dia, tema automático persistente, menu móvel, hidratação da landing e carregamento sob demanda |
| [#49](https://github.com/crm26gold/faculdadepsicologia/pull/49) | Execução estruturada da voz sem uma segunda chamada de planejamento; contrato e prioridades da fundação |

### Assistente, chaves e administração (#46–#47)

- Painel de IA por seções, busca e filtro de conexões, diagnóstico, rota fixa/alternativas/automático e orçamento.
- Remoção explícita de chaves principais/extras identifica dependências, pausa tarefas diretamente afetadas e limpa referências. Não apaga dados pessoais.
- “Minhas chaves de IA” já foi implementado: oito provedores pessoais, uma chave por provedor/conta, cifrada no servidor, com teste, pausa e remoção. **A etapa 5 pendente no relatório antigo do Claude já foi entregue.** Não implementar outra versão paralela.
- Texto prioriza credenciais pessoais; proprietário e base também usam orçamento global. Voz do proprietário preserva a configuração administrativa; membros usam APIs pessoais compatíveis. A base atual atende texto, não é um pool universal de voz.
- Gemini exige declaração de API paga para dados pessoais. A declaração não é teste automático de faturamento e não deve ser removida para viabilizar cotas gratuitas. A base exige aprovação por fonte ligada ao hash da credencial; trocar a chave invalida essa aprovação.
- OAuth mostra domínio/retorno do aplicativo e conta; nome autodeclarado não prova identidade. Há limites de cadastro, PKCE e revogação da família inteira ao reutilizar renovação.
- MCP possui recibos idempotentes por `request_id`, confirmação destrutiva persistida em Conversas e commit atômico.
- Voz tem quatro transportes implementados: Gemini Live, GPT-Live, ElevenLabs e xAI/Grok. **Groq é outra empresa:** texto e transcrição, sem chamada contínua integrada.
- Preparação automática tem orçamento/tentativas limitados; início inteiro no navegador tem prazo de 60 s. Chamada conectada pode durar até 20 min. Não confundir esses dois limites.

### UX (#48)

Meu dia possui ações rápidas e busca com estados claros. Tema automático continua acompanhando o sistema fora do perfil. Menu móvel fecha por Escape, clique fora, navegação e mudança para desktop; safe areas e toque foram ajustados. Onze painéis secundários são carregados por `next/dynamic`. Manifesto e barra do navegador usam a paleta azul. Movimento reduzido tem snapshot inicial compatível com SSR e interrupção ao mudar a preferência; o 3D decorativo tem fallback.

Templates da própria aplicação e tokens existentes devem ser reutilizados. Não migrar para Webflow/Framer/Dora. Motion/Lenis/R3F são recursos de implementação opcionais conforme o efeito pedido, não justificativa para animar tudo.

### Execução estruturada (#49) — ponto exato de continuidade

Antes, `organizar_jornada` enviava apenas `instruction` e todo pedido de voz chamava outra IA para planejar. Agora aceita também `actions_json`, string com array de 1 a 8 ações completas. O cliente valida, o servidor valida novamente e o executor aplica sobre o workspace atual.

```text
voz -> pedido autenticado/persistido -> actions?
  sim: validação -> execução -> commit do workspace + recibo
  não: planejador com orçamento/fallback -> mesma validação/execução/commit
```

O módulo `assistant-execution.ts` concentra resumo, conflito de revisão, confirmação pendente e erro. `ai/run-job.ts` prende claim/leitura/commit/falha à sessão e ao lease. Só a função de planejamento acessa runtime e orçamento de API. Propostas completas não dependem dessa segunda API, mas **a própria voz continua cobrada pelo fornecedor**.

- JSON inválido fornecido não vira chamada paga silenciosamente nem lote parcialmente interpretado.
- O modelo não fornece identidade, autorização, confirmação ou recibo confiável. O executor continua exigindo confirmação de exclusões/substituições.
- `finish_assistant_job` grava workspace e resultado juntos. Conflito repete a mesma proposta uma vez sobre dados frescos, sem gerar outro plano.
- `result.execution` registra `structured` ou `planned`. `saved:true` significa comprovante persistido; olhar também `applied`, `pending`, `failed` e `reply` para saber o que aconteceu.
- Pedidos antigos continuam compatíveis. Não houve migração nova no PR #49.
- Há fila persistente e retomada pela conversa; **não há worker autônomo periódico**. `after()` da Vercel está sujeito ao prazo da função.

## 5. Política de recursos e compartilhamento decidida pelo proprietário

O esclarecimento final foi: “APIs são para o sistema todo”; seus MCPs são dele, podendo ajudar todos se isso for suportado, mas ele escolhe quem, como e para quê. Recursos MCP dos outros usuários pertencem a eles; não consumir suas cotas para atender outra pessoa. Uso para evolução do sistema precisa de finalidade/autorização específicas do dono, revogáveis; conectar um MCP não concede isso automaticamente.

Tradução operacional:

1. APIs cadastradas para a **base do sistema** podem atender usuários conforme os controles do proprietário. “Minhas chaves” permanece privada até existir contribuição expressa.
2. Recursos pessoais do proprietário só entram em compartilhamento após escolha explícita e verificação da capacidade suportada.
3. Recursos de outro usuário atendem a conta dele. Desenvolvimento/evolução é uma finalidade separada; não equivale a autorização para compartilhar dados pessoais, treinar modelos ou gastar sua cota com solicitações de terceiros.
4. O usuário tem familiares/desenvolvedores com contas diferentes, além de várias empresas. Não presumir que todas as chaves pertencem ao mesmo projeto, nem que chaves diferentes garantem cotas independentes. Registrar o domínio de cota verificado e respeitar as regras/limites de cada serviço.
5. Autorização de produto não confirma funcionamento técnico de uma assinatura como motor público. Validar autenticação, direção e capacidade antes de colocar o recurso no fallback.

**Diferença indispensável entre MCP de entrada e saída:** o servidor MCP da Jornada permite a um assistente externo consultar/registrar na Jornada usando a sessão conduzida por aquele assistente. Isso não permite à Jornada chamar de volta o modelo de uma assinatura. O cadastro de servidores MCP externos hoje descobre ferramentas, mas não executa `tools/call`. Não anunciar reserva automática via Claude/ChatGPT/Antigravity/Codex até existir adaptador realmente suportado e testado.

## 6. Auditoria atual de configuração — metadados, sem segredos

Consulta remota exclusivamente de configuração, presença de chave e contagens; não foram lidas chaves, transcrições, notas ou dados pessoais.

| Tarefa | Provedor/modelo armazenado | Rota | Estado |
| --- | --- | --- | --- |
| `assistente` | DeepSeek / `auto:rapido` | `fallback`, 1 alternativa | Ligada |
| `organizar` | DeepSeek / `auto:rapido` | `fallback`, 1 alternativa | Ligada |
| `voz` | ElevenLabs / `qwen36-35b-a3b` | `fixed`, 0 alternativas | Ligada |

**O nome do modelo acima é o valor do banco, não comprovação de disponibilidade/qualidade/crédito.** Não trocar o modelo ElevenLabs que o proprietário aprovou sem alinhar.

- Quatro chaves principais presentes e habilitadas: DeepSeek, ElevenLabs, Gemini e Groq.
- Uma conexão extra presente/habilitada, de Gemini. Não foram expostos nome privado, hint ou conteúdo da chave.
- Demais provedores do catálogo sem chave principal habilitada nesta leitura, incluindo xAI/OpenAI/Anthropic. Adaptador implementado não significa credencial ativa.
- `private.ai_member_policy.base_enabled = false`; zero fontes aprovadas para a base e zero chaves pessoais cadastradas. **O alcance desejado para APIs é global, mas a base compartilhada ainda está desligada.** Não inventar aceite nem marcar declarações em nome de terceiros para ativá-la.
- RLS confirmado em `personal_workspaces` e `assistant_jobs`.
- `claim_assistant_job` e `finish_assistant_job`: SECURITY INVOKER, execução permitida a `authenticated`, recusada a `anon`.

### Histórico remoto do banco

As seis migrações finais do Codex continuam registradas no Supabase:

| Versão | Nome |
| --- | --- |
| `20261005080129` | `oauth_security_hardening` |
| `20261005080141` | `ai_personal_keys_and_removal` |
| `20261005080153` | `assistant_mcp_receipts` |
| `20261005080206` | `whatsapp_ai_sources` |
| `20261005080218` | `ai_routing_capabilities` |
| `20261005080521` | `ai_member_source_indexes` |

Há divergência legada: `messenger_bot` **não está registrado no histórico remoto**, embora exista no histórico local. **Não executar `supabase db push`**: poderia reaplicar a migração. Investigar/alinhá-la separadamente, sem presumir que tabela existente prova histórico correto. Para novas migrações, obedecer `AGENTS.md`: testar em Postgres descartável, aplicar no projeto certo, alinhar nome à versão remota e atualizar o stub. Não reaplicar as seis versões acima.

### Advisors remotos em 05/10

| Grupo | Aviso | Quantidade |
| --- | --- | --- |
| Segurança INFO | RLS habilitada sem políticas | 27 |
| Segurança WARN | SECURITY DEFINER pública executável por anon | 19 |
| Segurança WARN | SECURITY DEFINER pública executável por authenticated | 26 |
| Segurança WARN | Proteção de senha vazada do Auth | 1 |
| Performance INFO | Sem chave primária | 2, em backups históricos |
| Performance INFO | Índice não usado | 26 |

Não vieram avisos de nível ERROR. **Isso não certifica ausência de vulnerabilidades.** Muitas tabelas privadas são deliberadamente fechadas; não criar políticas para “limpar” INFO. Funções SECURITY DEFINER precisam ser avaliadas pelo efeito, prova do servidor e autorização, não automaticamente abertas/removidas. Não apagar backups ou índices apenas porque o advisor os lista. Não houve alteração desses avisos nesta passagem.

## 7. Aceite real, diagnóstico e limites da auditoria

**Relato do proprietário:** a voz ElevenLabs funcionou muito bem. Ele estimou consumo de quase 3 mil créditos em cerca de 2 minutos, de 10 mil gratuitos. Isso é relato aproximado, não medição/billing auditado. Não repetir que a voz nunca funcionou.

Ele relatou erro 402 ao pedir registros; acreditava que Google/Grok usados nas funções não cumpriam os comandos. Não foram obtidos logs reais que confirmem a origem desse 402. A captura anterior mostrava uma mensagem de limite da própria Jornada; não confundir esse evento com toda falha posterior. Limite interno, crédito do planejador, crédito da voz, autorização, conexão e commit são etapas diferentes.

O PR #49 remove uma dependência específica quando há ações completas. Ainda falta verificar numa chamada real que o modelo escolhido fornece `actions_json`, que o pedido guarda `execution: structured` e que o registro aparece no sistema. Se o modelo continuar mandando só texto, o caminho planejado continua existindo e pode exigir API/crédito.

Aceites ainda separados:

- Nova ação estruturada de voz; interrupção; confirmação de exclusão; leitura em outro aparelho.
- Primeiro login/conector MCP real com cada cliente desejado. Não comprovado por endpoints de discovery ou teste OAuth sintético.
- WhatsApp: conexão do número Oráculo, vínculo do telefone e texto/áudio/foto até o registro e resposta reais. Estado atual de worker/QR/telefone não foi consultado nesta auditoria.
- Telegram: aceite multiusuário real e seus controles.
- Consumo real por provedor e eficácia econômica do fallback.

Esta é uma auditoria de continuidade, código/entregas recentes e configuração. Não houve pentest completo, nova varredura de toda a aplicação, leitura de conteúdo privado ou teste de geração pago. As revisões de código/UX e testes anteriores estão identificados abaixo; não apresentá-los como auditoria de todas as futuras integrações.

## 8. Evidências de verificação que já existem

PR #49, head `4d049a8d47b283caa8754e3a19af40fa7e12fc98`:

- CI push [37324209015](https://github.com/crm26gold/faculdadepsicologia/actions/runs/37324209015) e PR [37324218336](https://github.com/crm26gold/faculdadepsicologia/actions/runs/37324218336): **success** antes do merge.
- 232 testes de domínio; 127 testes de navegador aprovados e 5 omissões específicas de dispositivo.
- Build/tipos, 3 testes do protocolo WhatsApp, 13 gates de produção.
- Cinco suítes SQL descartáveis: isolamento multiusuário, API, ponte WhatsApp, chaves pessoais e execução/continuidade do assistente. Concorrência de orçamento e OAuth também aprovada.
- Testes locais de voz: 41 aprovados e 1 omissão de desktop no Android; dados, fornecedores e microfone sintéticos.
- Revisões Standards/Spec sem bloqueios. Descrição do painel foi corrigida para explicar que ações estruturadas dispensam o planejador.
- Smoke após publicação: login 200; GET/POST anônimos em pedidos 401; origem indevida 403. Sem sessão privada ou IA paga.

PR #48: 25 combinações de tela/tema/página revisadas, sem overflow horizontal, erro de console ou violação axe; tamanhos 320×740, 390×844, 820×1180, 844×390 e 1440×1080. Detalhes em `docs/DESIGN_UX_JORNADA.md`. Isso não promete todos os aparelhos do mercado.

Não repetir toda a suíte para alterações somente documentais. Para código novo, selecionar testes relevantes e cumprir o CI completo antes de merge. Use `settleAnimations(page)` de `tests/browser/axe-ready.ts` antes de axe após mudanças de tema ou abertura de gavetas/diálogos animados.

## 9. Próximo trabalho: plano recomendado e critérios de pronto

**Não começar por logo, nova landing ou troca da voz aprovada.** O lote recomendado é o controle central de recursos/capacidades, com autorização explícita e observabilidade. É um plano, não código implementado.

### Lote A — inventário e controle de recursos

Reutilizar catálogo, tarefas, cofre, fontes pessoais e aprovações existentes. Propor uma camada que descreva: ID opaco, dono, tipo (API/MCP/runner), provedor, direção de acesso, capacidades verificadas, público/finalidade autorizados, pausa/revogação, política de custo, domínio de cota e versão do consentimento. A credencial continua referenciada no cofre privado; nunca duplicada em texto puro ou enviada ao navegador.

Critérios: um recurso desabilitado/revogado não vira candidato; pessoal não atende outro usuário; base só usa fontes aprovadas; cadastro/discovery não ganha capacidade executável; a pausa de modelo, se criada, funciona no servidor; painel explica configuração versus saúde versus aceite real. Antes de criar tabela/interface, mostrar desenho e justificar o que os módulos atuais não cobrem.

### Lote B — roteamento e saúde persistente

Circuit breaker/cooldown e tentativas limitadas por capacidade e domínio de cota. Honrar espera do fornecedor, orçamento da Jornada e consentimento. Atualmente a cota esgotada no automático elimina outras chaves da mesma empresa naquela operação; não há rotação validada por projetos distintos de terceiros. Não trocar isso por um loop de chaves sem domínio verificado, limites e regras de uso.

Critérios: orçamento interno bloqueia todo o pedido; fonte sem autorização jamais é chamada; erro 402/429 é atribuído à etapa certa; não repetir tentativas cuja execução/entrega é incerta; relatórios guardam IDs/códigos sanitizados, jamais chaves, payload bruto de fornecedor ou toda a vida pessoal. Preço/cota desconhecidos devem aparecer como desconhecidos.

### Lote C — retomada e relatórios autônomos

Projetar worker durável, identidade restrita, agenda, retomada de leases, prazos e cancelamento. Reaproveitar `assistant_jobs`/fila WhatsApp onde couber, sem copiar vários executores. `after()` não é daemon. Escolher implantação compatível com o custo desejado antes de ativar; não contratar serviço.

Critérios: queda/reinício não duplica efeitos; revogação interrompe futuras execuções; relatório distingue tentativa/commit/confirmação/entrega; nenhum administrador lê conteúdo pessoal de outros usuários por ser administrador.

### Lote D — MCP de saída e runners de assinaturas

Pesquisar documentação primária de cada cliente/fornecedor antes de prometer automação. Só implementar capacidade suportada com autenticação apropriada, escopo por pessoa, destinos/ferramentas permitidos, proteção SSRF e tratamento de efeitos. Ferramentas/descriptions externas são dados não confiáveis, não instruções administrativas.

Critérios: listar ferramenta não basta; demonstrar o sentido de acesso e a execução permitida, revogação e isolamento. Conectar assinatura não presume API gratuita, nem permissão para atender terceiros. Para evolução do sistema, definir explicitamente tarefas permitidas, limite e dados autorizados antes de qualquer consumo.

### Lote E — número Oráculo e aceites reais

Depois da infraestrutura combinada, ativar/testar WhatsApp com o proprietário. Ler `docs/WHATSAPP_JORNADA.md`: painel proprietário → configuração privada → `npm run whatsapp:setup` → QR → código de vínculo de uso único → mensagem/áudio/foto → registro e resposta. O worker deve permanecer ligado; a ponte atual não atende ligação ao vivo de WhatsApp. Membros usam seu vínculo em Meu espaço.

Não gerar nova configuração por curiosidade: isso substitui a credencial anterior e exige novo vínculo. Preservar identidade/histórico ao trocar número. A integração atual é uma ponte não oficial; não anunciar que é API Meta.

### Outras pendências, sem prioridade atual

Google Agenda/Drive, pagamentos, evolução de módulos hoje representados apenas por áreas, divisão do JSON pessoal em tabelas quando necessário. Excluir branches antigos/backups e decidir `TERMS_VERSION` continuam decisões separadas do proprietário. Não aproveitar a passagem para fazer limpeza destrutiva.

O usuário enviou `https://www.instagram.com/reel/DdruCNoAS0b/`. Web não retornou conteúdo, busca não encontrou e o navegador falhou antes de abrir. **O vídeo não foi analisado.** Pedir arquivo/transcrição ou acesso suportado antes de dizer que a técnica serve ao projeto. Não baixar mídia remota para contornar restrições.

## 10. Mapa do código e documentos para leitura

| Área | Caminhos prioritários |
| --- | --- |
| Regras/produto | `AGENTS.md`, `README.md`, `docs/VISAO_E_FUNDACAO_2026-09-30.md`, `docs/ARCHITECTURE.md` |
| Entregas/contexto | `docs/ENTREGA_ASSISTENTE_2026-10-05.md`, `docs/DESIGN_UX_JORNADA.md`, `docs/FUNDACAO_ASSISTENTE.md` |
| Histórico Claude | `docs/RELATORIO_CLAUDE_2026-10-04.md`, `docs/RELATORIO_CLAUDE_2026-10-05.md`; conferir contra código atual |
| Modelo pessoal | `src/lib/workspace.ts`, `src/components/use-workspace.ts`, `src/lib/commands.ts`, `src/lib/assistant-records.ts`, `src/lib/assistant-query.ts`, `src/lib/focus.ts` |
| Pedido durável | `src/lib/assistant-jobs.ts`, `src/lib/assistant-execution.ts`, `src/lib/ai/run-job.ts`, `src/app/api/assistant/jobs/route.ts`, `src/components/use-assistant-jobs.ts` |
| Cliente/executor | `src/components/assistant.tsx`, `src/components/use-assistant-executor.ts`, `src/components/voice-call.tsx`, `src/lib/voice/actions.ts` |
| IA/chaves/limites | `src/lib/ai/catalog.ts`, `runtime.ts`, `providers.ts`, `attempts.ts`, `budget.ts`, `vault.ts`; `src/lib/bot/secrets.ts` |
| Painel/conta | `src/components/community/ai-settings.tsx`, `src/app/api/ai/admin/route.ts`, `src/app/api/ai/my-keys/route.ts`; descobrir componentes pessoais por `rg` |
| Voz | `src/lib/voice/protocol.ts`, `client.ts`, `elevenlabs.ts`, `elevenlabs-protocol.ts`, `gemini-session.ts`, `xai-protocol.ts`; demais adaptadores em `src/lib/voice/` |
| MCP/OAuth | `src/lib/mcp/`, `src/app/api/mcp/`, `src/app/api/oauth/`, `src/lib/integrations/mcp.ts`, `docs/CONECTAR_ASSISTENTES.md` |
| WhatsApp/Telegram | `src/lib/whatsapp/`, `src/lib/bot/`, `integrations/whatsapp-bridge/`, `src/app/api/whatsapp/`, `src/app/api/telegram/`, `docs/WHATSAPP_JORNADA.md` |
| UX | `src/components/workspace-*`, `src/components/landing/`, `src/components/landing/use-landing-motion.ts`, `src/app/workspace-design.css`, `src/app/design-system.css`; localizar nomes exatos por `rg --files` |
| Entrega/testes | `.github/workflows/ci.yml`, `playwright.config.ts`, `scripts/check-publication.mjs`, `tests/production-gate.mjs`, `tests/browser/voice.spec.ts`, `tests/assistant-execution.test.ts`, `supabase/tests/` |

Stack auditada em `package.json`/lockfile: Node 24.x; Next 16.3.6; React 19.3.0; TypeScript; Tailwind 4.3.x; Zod 4; Supabase JS 2.117.0/SSR 0.12.7; TipTap 3.31.3; Motion 14, Lenis 1.3.x, Three/R3F para a landing; Playwright/axe. Não atualizar tudo por hábito. O bloco Next de `AGENTS.md` exige ler o guia relevante em `node_modules/next/dist/docs/` antes de escrever código Next.

Skills do Matt Pocock já estão versionadas em `.claude/skills/`, incluindo `grill-me`, `grilling`, `handoff`, `codebase-design`, `diagnosing-bugs`, `code-review`, `pr`, `research`, `tdd` e `animacao-web`. O Codex também possui adaptações locais em `.agents/skills/`, que não devem ser presumidas presentes num clone remoto. Ler o `SKILL.md` relevante; não reinstalar tudo nem tratar uma skill como atualização permanente de inteligência do modelo. Skills de plugins instaladas no computador também não equivalem a conexão remota autorizada no novo chat.

## 11. Operação segura, comandos e dados locais preservados

Primeiro, somente leitura no checkout escolhido:

```powershell
Get-Location
git remote get-url origin
git branch --show-current
git status --short
git log -5 --oneline
git fetch origin
```

Se o checkout estiver limpo e não houver trabalho alheio ativo, atualizar a main por fast-forward e abrir branch próprio. Se estiver sujo, identificar as alterações, preservar e não forçar reset/clean/stash indiscriminado.

```powershell
git switch main
git merge --ff-only origin/main
# Escolha um nome de branch próprio para o próximo lote antes de editar.
```

Não continuar em `claude/jolly-ritchie-jodq8g` apenas porque foi o branch anterior do Claude. Ele contém histórico antigo e recebeu atividade independente; a referência de código entregue é a main confirmada. Se precisar desta passagem antes de seu PR documental ser mesclado, leia-a no branch `codex/claude-handoff-20261005` ou use o arquivo anexado, sem confundir esse branch com um lote de implementação.

Comandos usuais de verificação, conforme o escopo:

```powershell
npm ci
npm run build
npm run typecheck
npm test
node --test integrations/whatsapp-bridge/protocol.test.mjs
npm run test:gate
npm run test:browser
git diff --check
```

Build/testes devem usar ambiente sintético isolado, não credenciais privadas herdadas de `.env.local`. No Windows, remover uma variável pode permitir que Next a restaure do arquivo: passes explícitos vazios num objeto `env` de subprocesso evitam isso. Na máquina local, `.local/foundation-check.mjs` é um helper ignorado já usado; não existe necessariamente no clone do Claude. O CI é a receita reproduzível, sem segredos. Playwright inicia servidores próprios em 3004–3007; não definir `PLAYWRIGHT_BASE_URL` para a suíte inteira. Fora do CI usa Edge; no CI Chromium com microfone sintético.

SQL, **somente em Postgres descartável**, seguindo o workflow: `multiusuario_isolamento.sql`, `multiusuario_api.sql`, `whatsapp_bridge.sql`, `ai_personal_keys.sql`, `assistant_execution.sql`, depois testes de concorrência. Os stubs criam papéis e simulam auth/storage; **nunca executá-los no Supabase remoto**.

Para publicar código: branch → PR → CI verde → revisão → merge conforme autorização → main publica automaticamente → confirmar SHA, READY e alias. Não usar deploy manual de produção. Preparar o índice certo antes de `node scripts/check-publication.mjs`; ele verifica exatamente os arquivos preparados, não ignorados locais. Uma prévia Vercel protegida que retorna 401/login não prova falha do aplicativo.

Segredos: `AI_KEYS_SECRET` cifra as chaves em AES-256-GCM e também participa das provas internas; não substituir nem revelar, pois quebraria a abertura das credenciais existentes. `.env.local`, configurações da ponte, cookies, tokens MCP/OAuth e segredos de fornecedores são privados. IDs de projeto, versões e nomes de variáveis neste documento não são chaves. `.env.example` contém um comentário histórico dizendo que Google/Supabase não foram configurados; não usar esse comentário como estado remoto atual.

Dados locais preservados, não necessários para um clone cloud e não autorizados para limpeza:

- `.local/ui-integration-20261004` e `.local/ux-original-20261005-100609`, com manifest/patch e arquivos anteriores.
- Stash `2439d96cb32ad686ae53e4303bd63096e6d8ed10` (UX original antes do PR #48).
- Stash `f6d177e00669ad9ad48332dfe2fc9791f5f3dbc7` (UX antes da integração #37/#38).
- `.local/claude-review` é um **clone Git independente**, não a raiz de trabalho atual. Revalidar origin/HEAD antes de usá-lo; pode estar atrasado.
- Worktree anexado de diagnóstico antigo: `C:\Users\Yeshua\.codex\worktrees\pr38-diagnostic\Faculdade`. Não o usar como base nova nem arquivar automaticamente.
- Contêiner local `jornada-assistant-audit-pg` foi usado para testes sintéticos, parado e preservado. Não apagar volumes. Outros worktrees/branches podem ter trabalho; não fazer limpeza coletiva.

## 12. Como Claude e Codex podem trabalhar juntos

O caminho disponível é **repositório + documentos + PRs + mensagens transportadas pelo proprietário**. Não foi configurado canal automático entre este chat Codex e um chat novo do Claude. Não afirmar que uma mensagem foi enviada ou que um agente está monitorando o outro sem ferramenta/conexão e autorização efetivas.

Fluxo recomendado enquanto o Codex está limitado:

1. Claude lê esta passagem, confirma o estado e propõe um lote pequeno de infraestrutura.
2. Proprietário alinha a decisão material. Claude implementa no seu branch/checkout, sem editar o mesmo branch usado simultaneamente por outro agente.
3. Claude entrega PR, diff, migrações propostas/aplicadas separadamente, testes, limitações e novo relatório. Atualiza este estado se houver fatos novos, sem reescrever história como se fossem aceites antigos.
4. Quando o Codex voltar, o proprietário envia o link do PR/relatório e pede revisão. Codex revisa o delta desde o SHA de base, não recomeça toda a auditoria.
5. Um responsável por vez faz mudanças remotas/merge. Se houver conflito, parar a mutação, comparar os branches e preservar ambos os trabalhos. Coordenação não depende de gastar cotas de membros.

Não há garantia de trabalho em segundo plano de um assistente sem créditos/sessão ativa. O arquivo e o Git mantêm a continuidade; o proprietário decide qual agente está ativo.

### Modelo do próximo relatório do Claude

```text
Base/branch/head; projeto Supabase/Vercel conferidos;
objetivo e decisões novas do proprietário;
o que mudou, arquivos e motivo;
o que estava pronto e não foi refeito;
testes executados e resultado, com dados reais/sintéticos separados;
migrações: preparadas versus aplicadas, versões e stub;
PR/CI/merge/deployment/alias, cada estado confirmado separadamente;
aceites reais e riscos ainda pendentes;
próximo lote e perguntas materiais;
nenhum segredo, dado pessoal ou promessa sem evidência.
```

## 13. Primeira devolutiva esperada do Claude

Explique o que encontrou pronto, divergências atuais e o plano do lote A. Reconheça que a voz ElevenLabs já foi aprovada pelo proprietário, que APIs pessoais e exclusão já existem, que a base ainda está desligada e que o MCP executável de saída/worker autônomo não existem. Faça apenas a próxima pergunta que realmente alterar desenho, custo, permissão ou implantação. Não perguntar de novo genericamente “quem pode usar as APIs”: a política já foi esclarecida na seção 5.

Mostre julgamento técnico conforme a seção 3.1: identifique o problema de fundo, recomende a próxima solução com justificativa e sinalize premissas que ainda exigem comprovação. Não se limite a repetir o pedido ou a concordar com nomes de ferramentas.

Este documento entrega contexto e critérios de continuidade. Não transforma planos em implementações, adaptações de MCP em motores universais, CI em aceite real ou permissões futuras em compartilhamento ativo.
