# Administração de IA e conexões da Jornada

Documentação e contratos consultados em 04/10/2026. Escopo: somente Jornada Plena, repositório `crm26gold/faculdadepsicologia`, Supabase `uccoaebzmvocqwqljmul`.

## O que esta entrega implementa

- Onze adaptadores separados: Gemini AI Studio; Google Agent Platform com conta de serviço; Google Agent Platform com chave de API; OpenAI; Anthropic; DeepSeek; xAI; Mistral; Groq; OpenRouter; serviço compatível personalizado.
- Chave principal e até cinco conexões extras por adaptador, cada uma com nome, posição, estado, credencial e configuração próprios. Uma conexão extra funciona mesmo com a principal desligada.
- Rotas por tarefa: escolher conexão, modelo e até duas alternativas explícitas. Texto pode mudar de empresa; voz mantém o transporte da empresa escolhida. O raciocínio da voz continua na tarefa do assistente.
- O teste de uma tarefa de texto usa a rota salva inteira, seu orçamento e suas alternativas, e informa qual empresa respondeu. Uma rota com alternativa disponível permanece configurada mesmo com a conexão principal pausada.
- Modelos disponíveis consultados com a chave da conexão selecionada, cache de até uma hora e atualização manual. Google Cloud requer modelo autorizado informado pelo nome; não apresenta uma lista simulada como se tivesse consultado a conta.
- Preferências automáticas para famílias conhecidas: qualidade, rapidez e economia. Critérios locais de família, versão e estabilidade, sem uma chamada adicional de IA. Economia não equivale a consultar preços em tempo real. Groq, OpenRouter e serviços genéricos exigem um modelo explícito.
- Cadastro privado de até vinte servidores MCP, token opcional cifrado, pausa, remoção e consulta de catálogo. Streamable HTTP, protocolo atual 2026-07-28 e opção legada 2025-11-25. Até cinquenta ferramentas da primeira página; não executa ferramentas nem envia conversas. Não implementa OAuth interativo de terceiros.
- Painel com busca por empresa ou nome de conexão, seleção agrupada por empresa, formulários preservados entre seções, campos secretos ocultos e diagnóstico de voz existente.

## Como configurar agora

1. Abra **Administração → Inteligência artificial → Conexões e chaves**.
2. Abra a empresa desejada e salve a chave principal, ou use **Adicionar outra conexão**. Cole a chave somente no campo protegido do painel. Nunca em uma conversa ou em um arquivo versionado.
3. Ligue a conexão que deseja disponibilizar. Isso não ativa tarefas automaticamente.
4. Em **Tarefas e modelos**, selecione a conexão por nome. Consulte os modelos daquela chave ou informe o identificador autorizado.
5. Escolha uma preferência automática ou um modelo exato. Para autorizar alternativas, escolha **Tentar minhas alternativas autorizadas**, selecione cada conexão e seu próprio modelo, e salve.
6. Teste a geração. Testes de geração consomem API; listagem de modelos não gera resposta de IA. Um teste de listagem não comprova saldo ou acesso a todos os modelos listados.
7. Voz: configure a tarefa **Chamada ao vivo** separadamente; execute o diagnóstico Gemini e depois uma chamada real no celular. O diagnóstico não usa microfone nem executa ações. Google Cloud Live, xAI Voice e outros transportes não estão integrados por esta entrega.

MCP: em **Integrações**, salve um endpoint HTTPS público e um token emitido especificamente para a Jornada, se necessário. Selecione o protocolo aceito pelo servidor. **Consultar ferramentas** confirma apenas o acesso ao catálogo. Não cole cookies, tokens internos de aplicativos ou credenciais de outros projetos. Para um serviço que exige login OAuth, será necessário desenvolver seu fluxo de consentimento, escopo, renovação e revogação antes de usá-lo.

## Google: produto atual, autenticação e faturamento

A [Gemini Enterprise Agent Platform](https://cloud.google.com/blog/products/ai-machine-learning/introducing-gemini-enterprise-agent-platform) é a evolução do Vertex AI. A mudança de nome não altera automaticamente todos os endpoints e identificadores IAM: as referências atuais ainda documentam `aiplatform.googleapis.com` e `roles/aiplatform.user`.

- **AI Studio:** chave da Gemini Developer API, endpoint `generativelanguage.googleapis.com`. É uma conexão diferente de Google Cloud.
- **Agent Platform, conta de serviço:** JSON de conta de serviço válido; OAuth de curta duração; projeto e região específicos. ADC é a recomendação do Google. Fazer `gcloud auth application-default login` no computador não autentica a aplicação hospedada na Vercel. A conexão JSON existente foi preservada, com validação e cache separados por credencial.
- **Agent Platform, chave de API:** com projeto informado, usa o endpoint padrão daquele projeto/região. Sem projeto, usa o endpoint Express. A chave precisa ser emitida/autorizada para esse produto e método. [Guia atual de autenticação](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/start) e [modo Express](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/start/express-mode/overview).
- O painel não habilita APIs, IAM, faturamento nem recursos pagos do Google. O pedido anterior de desativar o faturamento continua válido. Uma eventual reativação exige autorização específica e verificação de orçamento e quotas.

## Assinaturas: o que pode ser aproveitado

- [Codex](https://learn.chatgpt.com/docs/auth): login ChatGPT usa a assinatura no produto; chave de API usa faturamento de API. A Jornada não incorpora uma sessão do Codex para atender seu público.
- [Claude](https://support.claude.com/en/articles/9876003-i-have-a-paid-claude-subscription-pro-max-team-or-enterprise-plans-why-do-i-have-to-pay-separately-to-use-the-claude-api-and-console): assinatura e Console/API são produtos separados. Não há promessa de converter o saldo da assinatura em API pública.
- [Google Developer Program](https://developers.google.com/profile/help/benefits): planos Google AI elegíveis podem incluir créditos mensais de Cloud. Confira o benefício exibido na própria conta e as regras do resgate; não deduzir elegibilidade ou valor pelo preço em reais/YouTube Premium. Os créditos não garantem acesso a todo modelo nem suspendem a cobrança ao se esgotarem.
- Plugins conectados no Codex pertencem ao ambiente do Codex. Para a Jornada, é necessário um adaptador próprio, identidade própria e autorização para os serviços externos. MCP oferece um contrato para ferramentas; não fornece inferência gratuita e não reduz tokens por definição.

## Segurança e continuidade

- Cofre AES-256-GCM existente, segredo de servidor fora do banco; painel retorna apenas metadados e dicas. A remoção de uma conexão pausa tarefas que a selecionam diretamente.
- APIs de Administração autenticadas, origem exata, JSON limitado e validação; funções do banco verificam o proprietário. Conectores privados não têm leitura direta concedida a usuários.
- Endpoints personalizados: HTTPS/443, validação de DNS público, IP fixado durante a requisição, bloqueio de destinos privados/reservados, redirecionamentos e respostas acima de 2 MB; prazo máximo de 30 segundos, incluindo consulta DNS.
- Até quatro tentativas totais por geração, compartilhadas entre modelos e alternativas. Cada nova tentativa reserva orçamento. Cota, faturamento explícito e configuração inválida encerram o pedido. Não contornar limites de uma conta girando chaves.
- Dados podem ser enviados às empresas alternativas explicitamente autorizadas na tarefa. Descrições MCP ficam como texto de inventário; não entram como instruções no assistente e não concedem permissão para executar ações.
- O catálogo MCP não habilita execução, leitura de recursos, OAuth ou webhooks genéricos. Essas capacidades exigem contratos específicos, validação de assinatura, escopos, vínculo de usuário, idempotência e auditoria.

## Continuidade dos canais

Telegram e WhatsApp usam o núcleo próprio da Jornada. A configuração Telegram existente deve ser testada com o bot e o vínculo corretos. WhatsApp Business no celular não equivale a habilitar a API Meta; seu webhook permanece fechado até a configuração própria. Google Agenda/Drive dependem de OAuth. Acesso a MCP por outros assistentes exige servidor Jornada autenticado e permissões por pessoa, diferente do cliente de inventário entregue aqui.

## Contratos oficiais consultados

- [DeepSeek: modelos](https://api-docs.deepseek.com/api/list-models/)
- [xAI: Responses](https://docs.x.ai/developers/rest-api-reference/inference/responses) e [imagens de entrada](https://docs.x.ai/developers/model-capabilities/images/understanding)
- [Mistral: modelos](https://docs.mistral.ai/api/endpoint/models)
- [Groq](https://console.groq.com/docs/overview)
- [OpenRouter](https://openrouter.ai/docs/quickstart)
- [MCP atual: Streamable HTTP](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http) e [estrutura de mensagens](https://modelcontextprotocol.io/specification/2026-07-28/basic/index)

## Critérios de aceitação

Testes locais e CI precisam confirmar: APIs com contratos próprios; modelos separados por chave; alternativas autorizadas; parada por orçamento/cota; bloqueios de destinos internos; propriedade e isolamento no PostgreSQL; formulários e acessibilidade no desktop/mobile. Esses testes usam dados sintéticos. A aceitação com cada conta real depende de sua chave, acesso, saldo e um teste explícito do proprietário. Não confundir suporte implementado com API autenticada/geração comprovada em produção.

Verificação desta entrega: build e tipos; 179 testes de unidade; duas suítes PostgreSQL de isolamento/permissões e concorrência de orçamento; 13 gates de produção; 101 testes de navegador aprovados, quatro casos condicionais ignorados. Migração aplicada: `20261004133754_ai_independent_routes`, no projeto acima. Chaves e tarefas existentes foram preservadas; nenhum novo fornecedor foi ligado automaticamente.
