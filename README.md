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
| Meu dia | Implementado | Painel do dia: agenda de hoje, ciclo do mês, alertas (atrasos, contas, provas próximas, foco ligado, registros soltos) e as partes de trabalhos em grupo da pessoa. |
| Agenda | Implementado | Visões mensal e semanal; criar, editar e pausar horários desde uma grade vazia; período letivo e filtros por área e matéria; compromissos pessoais sem matéria obrigatória. Feriados não são descontados automaticamente. |
| Exportação de calendário | Implementado | Arquivo `.ics` do período selecionado; importação manual no destino, sem sincronização de volta. |
| Foco e planejamento | Implementado | Temporizador, registro de sessões e sugestões por regras locais, aceitas manualmente. Não usa IA generativa. |
| Dados no navegador | Implementado | Persistência local, exportação/importação JSON validada e proteção contra sobrescrita concorrente. |
| Contas e acesso | Implementado | Login Google aberto a contas verificadas; cada conta tem espaço pessoal isolado (RLS). Papéis por sala/grupo; painel master com histórico. |
| Armazenamento privado na nuvem | Banco aplicado | Tabelas, RLS e RPC remotos verificados; registros persistidos confirmados em 27/09; leitura em outro dispositivo ainda a validar. |
| Demo pública isolada | Publicada e testada | Origem separada, exemplos somente em memória, sem importação de backups, login ou API de dados pessoais. |
| Salas, grupos e trabalhos em grupo | Implementado | Instituição > sala > grupo, convites por link, mural, enquetes com voto secreto, trabalhos divididos em partes com entrega, entrega em nome, revisão e documento final padronizado (copiar para Docs / PDF). |
| Contatos e LGPD | Implementado | Agenda privada com aniversários; termos, privacidade, aceite versionado, exportação e exclusão da conta. |
| Planos | Infraestrutura | Acadêmico (grátis) e Pro; fase de lançamento com tudo liberado, controlada no painel master. Pagamento ainda não integrado. |
| Vários cursos | Implementado | Graduação, pós, técnico, curso livre, extensão e idioma, cada um com matérias ou módulos. |
| Metas e projetos | Implementado (Pro) | Metas com indicador e projetos ligados a metas. |
| Finanças | Implementado (Pro) | Receitas e despesas, contas a pagar e a receber, fixas ou variáveis, parcelas e alertas no Meu dia. Sem integração bancária. |
| Rotina e hábitos | Implementado (Pro) | Hábitos por período e horário, marcação diária e sequência. |
| Flashcards | Implementado | Cartões por matéria com revisão espaçada. |
| Saúde, emocional, espiritualidade, família, casa, lazer e documentos | Roadmap | Hoje são áreas da vida usadas como etiquetas em anotações, compromissos e finanças; ainda sem módulos próprios. |
| Assistente por texto e voz | Implementado; chamada real a validar | Conversa com ações pessoais validadas, salvamento, desfazer e confirmação de exclusão. Voz contínua pelo Gemini Live, GPT-Live ou ElevenLabs (agente criado automaticamente, URL assinada por chamada); depende da configuração e da cota ou dos créditos do provedor. [Uso e limites](docs/ASSISTENTE_VOZ.md). |
| Telegram | Implementado | Bot vinculado à conta por código: texto, voz e fotos, com o mesmo núcleo de IA e as mesmas cotas. Exclusões e substituições ficam pendentes até a confirmação no Assistente do app. |
| Assistentes externos (MCP) | Implementado; conexão real a validar | Servidor MCP próprio em `/api/mcp`: Claude Code, Codex, Gemini CLI e Antigravity usam a assinatura da pessoa para consultar e registrar na vida pessoal dela, com chave pessoal revogável. ChatGPT e Claude (app e site) conectam pelo login OAuth da Jornada, com PKCE. [Como conectar](docs/CONECTAR_ASSISTENTES.md). |
| WhatsApp | Implementado; aceite real a confirmar | Ponte privada por QR que roda no computador do proprietário, vínculo por código, texto, áudio e foto. Não usa a API oficial da Meta. [Guia](docs/WHATSAPP_JORNADA.md). |
| Administração de IA | Implementado | Onze provedores com chaves cifradas, rotas por tarefa com alternativas, limites de consumo e cadastro de servidores MCP (descoberta, sem execução de ferramentas). |

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
