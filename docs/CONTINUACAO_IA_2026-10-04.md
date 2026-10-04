# Continuação da Jornada — 4 de outubro de 2026

> Registro histórico da versão `c5aadaf`. A configuração compartilhada das reservas descrita abaixo foi substituída por conexões independentes e rotas explícitas. Consulte [a entrega atual de Administração e conexões](CONEXOES_IA_2026-10-04.md) para os contratos, empresas e limites atuais.

## Entregas visuais publicadas anteriormente

- Design branco e azul, modo escuro, marca original preservada.
- Navegação agrupada, recolhível, seleção animada, gaveta e atalhos mobile.
- Componentes e formulários consistentes nas áreas principais.
- Apresentação `/jornada` com Framer Motion, Lenis no desktop e R3F carregado sob demanda; alternativas leves para mobile, WebGL indisponível e movimento reduzido.
- Build, 165 testes de domínio, gates de acesso e 97 testes de navegador passaram na publicação anterior. Os quatro testes condicionais foram ignorados conforme o dispositivo.

## Administração renovada

O painel organiza o trabalho em **Visão geral**, **Conexões e chaves**, **Tarefas e modelos**, **Consumo e limites** e **Integrações**. Mostra configurações ativas e pendentes sem confundir chave cadastrada com conexão testada. Cada empresa abre sua configuração principal e reservas. Campos em edição permanecem ao trocar de seção; um teste de tarefa exige salvar primeiro.

As listas de texto e voz são consultadas na API da conta. **Atualizar modelos** também renova o cache usado pela seleção automática de texto. As preferências de qualidade, rapidez e economia são regras de família e versão; não são medição de qualidade nem comparação de tarifas em tempo real. Consultas são deduplicadas por empresa no painel; abrir a visão geral não dispara testes ou geração.

## Chaves de reserva e roteamento

O proprietário pode cadastrar reservas em **Administração › Inteligência artificial › Conexões e chaves**: empresa, nome, prioridade, chave e autorização de uso. Pode verificar uma reserva individual, mesmo desligada, sem reenviar a chave. A chave permanece cifrada no servidor. Cada reserva utiliza o mesmo endereço, projeto e região da configuração principal; credenciais para outros projetos exigem configuração independente em uma etapa futura.

A chave principal e as primeiras duas reservas ligadas por prioridade participam. O provedor continua sendo o escolhido para a tarefa. Texto, organização, planejamento de pedidos, leitura de fotos, Telegram e preparação de chamadas utilizam o mesmo contrato de configuração. A troca não reaplica uma ação concluída: os modelos propõem e o executor só recebe o resultado bem-sucedido.

Há um máximo de quatro tentativas de geração, somando chaves e modelos. Cada repetição precisa de uma nova admissão no orçamento compartilhado. Rede, indisponibilidade, autorização ou modelo ausente podem acionar uma reserva. Cota, falta de créditos e payload inválido encerram o pedido; a reserva não é uma forma de contornar limites do provedor. No modo automático de texto, uma repetição na chave principal pode tentar o próximo modelo autorizado da mesma linha. A escolha continua baseada nos modos rápido/econômico/qualidade existentes, sem uma chamada extra de IA para decidir a rota.

Isto não implementa um mercado autônomo de fornecedores, pontuação automática por qualidade nem troca entre empresas durante a chamada. MCP continua sendo uma interface para ferramentas; não substitui o provedor de áudio.

## Diagnóstico real de voz

**Tarefas e modelos › Chamada ao vivo › Testar conexão de voz** usa as credenciais já guardadas no servidor, solicita a mesma autorização restrita e verifica `setupComplete` no WebSocket. Fecha imediatamente: não usa o microfone, não envia um turno de texto, não gera fala e não executa ferramentas. A resposta mostra etapa, referência e somente campos/códigos permitidos do erro. Chaves, tokens, mensagens livres e transcrições não são apresentados nem gravados nos logs.

O teste da conexão é diferente da chamada real: após a configuração ser aceita, ainda é necessário falar pelo celular, ouvir uma resposta e conferir uma ação salva. A chamada usa a mesma preparação de sessão; listagens de modelos ficam em cache por cinco minutos por chave, com limite de entradas. Autorizações temporárias nunca ficam nesse cache.

## Situação externa conferida

A migração `20261004115741_ai_connections_routing.sql` foi aplicada ao projeto `uccoaebzmvocqwqljmul`, depois da aprovação dos testes de permissões no Postgres da CI. O arquivo local segue a versão registrada no Supabase. As chaves principais e escolhas de tarefas existentes foram preservadas; nenhuma reserva foi cadastrada automaticamente.

No início desta revisão, o Supabase correto estava saudável. Somente Gemini tinha uma chave ligada. OpenAI, Anthropic e Vertex não tinham chave; assistente, organização e voz estavam selecionados em Gemini. Nenhum faturamento Google foi reativado e nenhuma chave de outra empresa foi criada automaticamente.

O navegador integrado não inicializou neste ambiente. A revisão automática recusou materializar variáveis secretas de produção em um arquivo local. O diagnóstico foi colocado no painel do proprietário para evitar exportar credenciais ou copiar uma sessão autenticada.

Continuam pendentes: comprovar voz real no Android, aplicativo nativo para microfone confiável em segundo plano, API oficial do WhatsApp Business e domínio próprio para a configuração de Cloudflare. O WhatsApp Business instalado no celular não constitui uma conexão já ativa com a API da Meta.

## Verificação desta continuação

174 testes de domínio e 13 cenários de bloqueio de produção passaram localmente, incluindo limites de tentativas, orçamento negado, cancelamento, cota/faturamento sem rotação e fechamento do diagnóstico sem conteúdo. Três fluxos do painel passaram no navegador: configuração principal, reserva e diagnóstico, preservação de edição e atualização de modelos. A verificação de banco e regressões completas de interface acompanha esta alteração na CI. A aprovação desses testes não substitui a aceitação pelo provedor real.

Fontes de contrato: [Gemini Live](https://ai.google.dev/api/live), [tokens temporários](https://ai.google.dev/gemini-api/docs/live-api/ephemeral-tokens) e [serialização do SDK oficial](https://raw.githubusercontent.com/googleapis/js-genai/main/src/converters/_tokens_converters.ts).
