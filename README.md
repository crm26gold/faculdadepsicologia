# Jornada Plena

Um organizador pessoal com áreas da vida personalizáveis, cadernos, agenda única, estudos e foco. Módulos especializados de finanças, saúde e metas continuam em desenvolvimento; criar uma área não equivale a implementar um módulo completo.

O código está publicado no GitHub. A [demonstração pública](https://faculdadepsicologia-demo.vercel.app) usa somente dados sintéticos em um projeto separado. O workspace privado permanece exclusivo do proprietário; publicar o código não libera acesso a ele.

## Estado do projeto

“Implementado” significa presente no código, não necessariamente validado com uma sessão real em produção. Na auditoria de 26/09/2026, produção, repositório e banco foram conferidos, e a identidade Google do proprietário estava vinculada. Em 27/09, registros persistidos no workspace remoto foram confirmados por consulta de contagens, sem ler o conteúdo das notas. Leitura em outro dispositivo, restauração completa e primeiro upload na sessão real ainda precisam de comprovação. Não confundir essa pendência com ausência de banco ou autorização para abrir o acesso público.

Consulte a [auditoria e plano de ação](docs/AUDITORIA_E_PLANO_2026-09-26.md), a [primeira entrega do plano](docs/ENTREGA_GRADE_2026-09-26.md) e o [registro histórico de validação de 24/09](docs/VALIDATION.md). O nome oficial é Jornada Plena; identificadores técnicos antigos são mantidos quando necessários para compatibilidade.

| Recurso | Estado | Alcance |
| --- | --- | --- |
| Matérias e tarefas | Implementado | Cadastro e edição, semestre, cores, prazos e conclusão de tarefas. |
| Cadernos e áreas | Implementado | Cadernos pessoais editáveis; 11 áreas iniciais personalizáveis, filtros por área/caderno/matéria. |
| Editor multimídia | Implementado | Formatação, tabelas, links, imagens/câmera, áudio anexado e ortografia local pt-BR. Primeiro upload real ainda a validar. |
| Agenda | Implementado | Visões mensal e semanal; criar, editar e pausar horários desde uma grade vazia; período letivo e filtros por área e matéria; compromissos pessoais sem matéria obrigatória. Feriados não são descontados automaticamente. |
| Exportação de calendário | Implementado | Arquivo `.ics` do período selecionado; importação manual no destino, sem sincronização de volta. |
| Foco e planejamento | Implementado | Temporizador, registro de sessões e sugestões por regras locais, aceitas manualmente. Não usa IA generativa. |
| Dados no navegador | Implementado | Persistência local, exportação/importação JSON validada e proteção contra sobrescrita concorrente. |
| Acesso privado | Proprietário vinculado | Validação de UUID, e-mail e identidade Google no servidor; ainda requer teste completo de uso na sessão real. |
| Armazenamento privado na nuvem | Banco aplicado | Tabelas, RLS e RPC remotos verificados; registros persistidos confirmados em 27/09; leitura em outro dispositivo ainda a validar. |
| Demo pública isolada | Publicada e testada | Origem separada, exemplos somente em memória, sem importação de backups, login ou API de dados pessoais. |
| Vários cursos | Roadmap | Ainda não existe entidade de curso nem separação de dados por curso. |
| Finanças, saúde, rotina, social, inventário e metas | Roadmap | Módulos próprios ainda não implementados; tarefas e foco não equivalem a esses módulos. |
| IA e WhatsApp Oráculo | Roadmap | Sem bot ativo, envio de mensagens ou análise de notas por IA. Exigirão identidade do workspace e consentimento. |

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
