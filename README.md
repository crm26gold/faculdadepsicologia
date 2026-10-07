# Jornada Plena

A Jornada Plena ajuda cada pessoa a **gerenciar e melhorar a vida inteira**: estudos, trabalho, finanças, rotina, saúde, relações e o que mais fizer parte da sua jornada. Os estudos foram o primeiro bloco, porque o projeto nasceu numa faculdade de psicologia, mas são um bloco entre vários e servem a qualquer curso, graduação ou mentoria. Sobre a vida pessoal existe uma camada coletiva (instituições, salas, grupos e trabalhos em grupo) e uma assistente de IA por texto e voz. Para adultos (18+).

Áreas da vida sem módulo próprio funcionam como etiquetas: criar uma área não equivale a implementar um módulo completo.

O código está publicado no GitHub. A [demonstração pública](https://faculdadepsicologia-demo.vercel.app) usa somente dados sintéticos em um projeto separado. Cada conta tem seu próprio espaço pessoal, visível só para ela; publicar o código não libera acesso a nenhum deles.

## Estado do projeto

“Implementado” significa presente no código, não necessariamente validado com uma sessão real em produção. Na auditoria de 26/09/2026, produção, repositório e banco foram conferidos, e a identidade Google do proprietário estava vinculada. Em 27/09, registros persistidos e anexos no armazenamento privado foram confirmados por consulta de contagens, sem ler seu conteúdo; o usuário informou ter realizado o teste de mídia. Leitura em outro dispositivo e restauração completa ainda precisam de comprovação. Não confundir essas pendências com ausência de banco ou autorização para abrir o acesso público.

Consulte a [auditoria e plano de ação](docs/AUDITORIA_E_PLANO_2026-09-26.md), a [primeira entrega do plano](docs/ENTREGA_GRADE_2026-09-26.md) e o [registro histórico de validação de 24/09](docs/VALIDATION.md). O nome oficial é Jornada Plena; identificadores técnicos antigos são mantidos quando necessários para compatibilidade.

| Recurso | Estado | Alcance |
| --- | --- | --- |
| Matérias e tarefas | Implementado | Cadastro e edição, semestre, cores, prazos e conclusão de tarefas. |
| Cadernos e áreas | Implementado | Cadernos pessoais editáveis; 11 áreas iniciais personalizáveis, filtros por área/caderno/matéria. |
| Caixa de entrada | Implementado | Captura de texto sem classificação obrigatória, organização posterior na mesma anotação e persistência privada existente. |
| Editor multimídia | Implementado | Formatação, tabelas, links, imagens/câmera, áudio anexado e ortografia local pt-BR. Usuário informou teste realizado; presença de anexos privados confirmada sem abrir seu conteúdo. Leitura entre dispositivos ainda pendente. |
| Meu dia | Implementado | Painel responsivo com agenda, ações para registrar ideia, preparar foco sem iniciar o timer e abrir assistente; ciclo do mês, alertas e partes de trabalhos em grupo da pessoa. Com conta, "Pedidos aguardando você" lista as exclusões e substituições do assistente que esperam confirmação e abre cada uma na própria conversa; confirmar continua sendo feito lá. |
| Interface e acessibilidade | Implementado | Tema automático acompanha o sistema durante a navegação; busca local com contagem e estado vazio; controles de toque e safe areas. Landing respeita movimento reduzido e painéis secundários carregam sob demanda. [Análise de UX](docs/DESIGN_UX_JORNADA.md). |
| Agenda | Implementado | Visões mensal e semanal; criar, editar e pausar horários desde uma grade vazia; período letivo e filtros por área e matéria; compromissos pessoais sem matéria obrigatória. Feriados não são descontados automaticamente. |
| Exportação de calendário | Implementado | Arquivo `.ics` do período selecionado; importação manual no destino, sem sincronização de volta. |
| Foco e planejamento | Implementado | Temporizador, registro de sessões e sugestões por regras locais, aceitas manualmente. Não usa IA generativa. |
| Dados no navegador | Implementado | Persistência local, exportação/importação JSON validada e proteção contra sobrescrita concorrente. |
| Contas e acesso | Implementado | Login Google aberto a contas verificadas; cada conta tem espaço pessoal isolado (RLS). Papéis por sala/grupo; painel master com histórico. |
| Armazenamento privado na nuvem | Banco aplicado | Tabelas, RLS e RPC remotos verificados; registros persistidos confirmados em 27/09; leitura em outro dispositivo ainda a validar. |
| Demo pública isolada | Publicada e testada | Origem separada, exemplos somente em memória, sem importação de backups, login ou API de dados pessoais. |
| Salas, grupos e trabalhos em grupo | Implementado | Instituição > sala > grupo, convites por link, mural, enquetes com voto secreto, trabalhos divididos em partes com entrega, entrega em nome, revisão e documento final padronizado (copiar para Docs / PDF). |
| Contatos e LGPD | Implementado; canal próprio a definir | Agenda privada com aniversários; termos, privacidade, aceite versionado, exportação e exclusão da conta. A política explica como fazer pedidos, os prazos e o processo de incidente; o atendimento é manual ([operação](docs/PRIVACIDADE_OPERACAO.md)). |
| Planos | Infraestrutura | Acadêmico (grátis) e Pro; fase de lançamento com tudo liberado, controlada no painel master. Pagamento ainda não integrado. |
| Vários cursos | Implementado | Graduação, pós, técnico, curso livre, extensão e idioma, cada um com matérias ou módulos. |
| Metas e projetos | Implementado (Pro) | Metas com indicador e projetos ligados a metas. |
| Finanças | Implementado (Pro) | Receitas e despesas, contas a pagar e a receber, fixas ou variáveis, parcelas e alertas no Meu dia. Sem integração bancária. |
| Rotina e hábitos | Implementado (Pro) | Hábitos por período e horário, marcação diária e sequência. |
| Flashcards | Implementado | Cartões por matéria com revisão espaçada. |
| Saúde, emocional, espiritualidade, família, casa, lazer e documentos | Roadmap | Hoje são áreas da vida usadas como etiquetas em anotações, compromissos e finanças; ainda sem módulos próprios. |
| Assistente por texto e voz | Implementado; novas chamadas reais a validar | Ações pessoais com salvamento, desfazer e confirmação de exclusão; na parte coletiva e na administração, as mesmas ações da tela com o login da pessoa (exclusões e administração confirmadas no app; plano e créditos de contas só pela tela). Até 5 exclusões por pedido vão direto para a lixeira, que guarda tudo por 30 dias (até 2 MB por conta), com restaurar e desfazer pela tela, pela voz e pelo MCP. Anotações rápidas vão direto ao caderno, à matéria ou à área ditos (caderno novo é criado), e "vamos organizar os pendentes" conduz item por item. Links vão direto para a anotação; para fotos, áudios e vídeos, o MCP devolve um link de 10 minutos que abre o Registro rápido no destino. Em Conectar assistentes, "O que os assistentes fizeram" lista as alterações das conexões com Desfazer. Pedidos de "print" abrem a tela ou enviam a imagem, e o app aberto acompanha ao vivo o que a IA muda em outros canais. Voz por Gemini Live, GPT-Live, ElevenLabs ou xAI/Grok; Groq oferece texto e transcrição de mensagens de áudio. Gemini Live, ElevenLabs e xAI podem enviar ações estruturadas para execução durável sem uma segunda IA; o GPT-Live e os pedidos livres ainda usam o planejador. Alternativas antes de conectar respeitam um limite único de tentativas; o limite da Jornada continua separado da cota de cada API. [Uso e limites](docs/ASSISTENTE_VOZ.md), [fundação de execução](docs/FUNDACAO_ASSISTENTE.md). |
| Telegram | Implementado; aceite multiusuário a validar | Vínculo por código com a própria conta, texto, voz e fotos. Usa chaves pessoais ou base expressamente autorizada. Na parte coletiva (salas, mural, enquetes, trabalhos e contatos), age como a pessoa vinculada. Exclusões e substituições, pessoais ou coletivas, e mudanças de administração ficam num só pedido em Meu dia para confirmar no app. |
| Assistentes externos (MCP) | Implementado; conexão real a validar | Consulta e registro na conta da pessoa por chave revogável ou OAuth com PKCE: vida pessoal e, na parte coletiva, as mesmas ações da tela com as permissões da pessoa (exclusões coletivas e mudanças de administração viram pedidos confirmados no app; tirar pessoas, mudar papéis, dar administrador e chaves de API só pela tela). Consentimento identifica o endereço do aplicativo; reutilizar uma renovação revoga a família. Confirmações destrutivas ficam salvas em Conversas e aparecem em Meu dia; `request_id` evita reaplicar o mesmo pedido. [Como conectar](docs/CONECTAR_ASSISTENTES.md). |
| WhatsApp | Implementado; aceite real a confirmar | Ponte privada por QR no computador do proprietário; cada pessoa vincula seu telefone em Meu espaço. Texto, áudio e foto com suas próprias credenciais ou base autorizada. Na parte coletiva, age como a pessoa vinculada; exclusões coletivas e administração ficam em Meu dia para confirmar. Não usa a API oficial da Meta. [Guia](docs/WHATSAPP_JORNADA.md). |
| Administração de IA | Implementado e publicado | Doze provedores, navegação por seções, busca e filtro de conexões, diagnóstico, alternativas, orçamento e cadastro de servidores MCP externos (só descoberta de ferramentas, sem execução). Exclusão explícita de chaves principais e extras mostra tarefas afetadas e remove referências; registros pessoais são preservados. Falhas das APIs têm classe e ação próprias: sem saldo pula as outras chaves da mesma empresa, pedido inválido para, e a mensagem nunca repete o texto do provedor. Respostas 503 trazem um código de referência para achar o erro no log. |
| Minhas chaves de IA | Publicado; banco aplicado | APIs pessoais cifradas no servidor, com teste, pausa e remoção por pessoa. Chaves pessoais têm prioridade para texto; a voz do proprietário preserva a configuração administrativa. Base para membros desligada por padrão, limitada a texto e a fontes autorizadas. Gemini exige declaração de API paga. |
| Mapa de recursos | Em revisão (lote A1); migração ainda não aplicada | O proprietário vê o que está configurado e o que realmente atua em cada tarefa, com o motivo de cada exclusão. A tela mostra capacidades por provedor, canais e MCP, e separa a declaração de privacidade de quem pode usar cada conexão (“só eu” ou “eu e membros”). Não consulta provedores nem gasta créditos. [Fundação](docs/FUNDACAO_ASSISTENTE.md). |

Detalhes desta evolução: [áreas e cadernos](docs/AREAS_E_CADERNOS_2026-09-27.md) e [editor multimídia](docs/CADERNO_MULTIMIDIA_2026-09-27.md).

## Desenvolvimento local

Use Node.js 24 e npm, conforme `package.json` e `.nvmrc`:

```sh
npm ci
npm run build
npm run typecheck
npm test
```

Para a demo local, use `APP_MODE=demo`, sem credenciais e sem depender de um projeto Vercel. Em uma cópia de desenvolvimento limpa, crie `.env.local` manualmente a partir de [.env.example](.env.example), somente se esse arquivo ainda não existir. Não sobrescreva uma configuração privada existente.

```powershell
$env:APP_MODE = 'demo'
npm run dev
```

O servidor usa `http://127.0.0.1:3000`. Use um perfil de navegador separado e apenas dados inventados. A execução local precisa cumprir o [contrato de isolamento](docs/DEPLOYMENT.md); a presença de uma variável, por si só, não comprova que a versão executada aplica esse contrato.

## Dados e privacidade

- Um workspace privado novo começa vazio; a demo recebe somente exemplos sintéticos.
- Dados existentes na chave local devem ser preservados. Separar ambientes não autoriza apagar, migrar ou substituir esses dados automaticamente.
- Dados locais pertencem ao navegador e à origem usada. Sair da conta não os apaga nem acrescenta criptografia; limpar o navegador pode removê-los.
- Um backup JSON pode conter conteúdo pessoal. Guarde-o fora do repositório e nunca o importe na demo pública.
- Em instalações novas, `GOOGLE_AUTH_ENABLED` e `FACULDADE_CLOUD_WORKSPACE` só devem ser ativadas após verificação. A instância privada existente já usa a nuvem; não copiar suas credenciais para a demo.

## Documentação

- [Arquitetura e limites atuais](docs/ARCHITECTURE.md)
- [Roadmap e critérios de entrega](docs/ROADMAP.md)
- [Ambientes, publicação e implantação](docs/DEPLOYMENT.md)
- [Como contribuir e validar mudanças](CONTRIBUTING.md)

O CI usa Node.js 24 e executa a revisão automática do índice Git, instalação pelo lockfile, build, verificação de tipos, testes unitários, bloqueios de produção e testes de navegador com Chromium. Ele não publica o aplicativo nem valida Google/Supabase remotos. O [guia de contribuição](CONTRIBUTING.md) explica os servidores isolados dos testes.
