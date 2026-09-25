# Faculdade

Um organizador de estudos com matérias, caderno, agenda e blocos de foco. A evolução prevista amplia esse núcleo para vários cursos e outras áreas da vida, mantendo o controle dos dados com cada pessoa.

O código está publicado no GitHub. A [demonstração pública](https://faculdadepsicologia-demo.vercel.app) usa somente dados sintéticos em um projeto separado. O workspace privado permanece exclusivo do proprietário; publicar o código não libera acesso a ele.

## Estado do projeto

“Implementado” significa presente no código, não integração remota ativada. A demo foi publicada e verificada em 24/09/2026, com 12 testes de navegador online aprovados. O banco privado já tem as tabelas e funções aplicadas, com testes transacionais remotos de gravação e isolamento aprovados. O login Google e a identidade autorizada ainda precisam ser configurados: o fluxo completo pelo aplicativo não está liberado. Consulte o [registro de validação](docs/VALIDATION.md).

| Recurso | Estado | Alcance |
| --- | --- | --- |
| Matérias e tarefas | Implementado | Cadastro e edição, semestre, cores, prazos e conclusão de tarefas. |
| Caderno | Implementado | Anotações por matéria, busca e edição com títulos, listas, negrito e itálico. |
| Agenda | Implementado | Visões mensal e semanal, grade recorrente, período letivo e filtro por matéria. Feriados não são descontados automaticamente. |
| Exportação de calendário | Implementado | Arquivo `.ics` do período selecionado; importação manual no destino, sem sincronização de volta. |
| Foco e planejamento | Implementado | Temporizador, registro de sessões e sugestões por regras locais, aceitas manualmente. Não usa IA generativa. |
| Dados no navegador | Implementado | Persistência local, exportação/importação JSON validada e proteção contra sobrescrita concorrente. |
| Acesso privado | Preparado localmente | Validação de UUID, e-mail e identidade Google do proprietário no servidor; configuração e verificação externas pendentes. |
| Armazenamento privado na nuvem | Banco aplicado e testado | Tabelas, RLS e RPC remotos verificados; uso pelo aplicativo depende do login Google e provisionamento do proprietário. |
| Demo pública isolada | Publicada e testada | Origem separada, exemplos somente em memória, sem importação de backups, login ou API de dados pessoais. |
| Vários cursos | Roadmap | Ainda não existe entidade de curso nem separação de dados por curso. |
| Finanças, saúde, rotina, social, inventário e metas | Roadmap | Módulos próprios ainda não implementados; tarefas e foco não equivalem a esses módulos. |
| IA e WhatsApp Oráculo | Roadmap | Sem bot ativo, envio de mensagens ou análise de notas por IA. Exigirão identidade do workspace e consentimento. |

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
- `GOOGLE_AUTH_ENABLED` e `FACULDADE_CLOUD_WORKSPACE` permanecem desligadas até a verificação externa correspondente. Login validado não comprova persistência remota.

## Documentação

- [Arquitetura e limites atuais](docs/ARCHITECTURE.md)
- [Roadmap e critérios de entrega](docs/ROADMAP.md)
- [Ambientes, publicação e implantação](docs/DEPLOYMENT.md)
- [Como contribuir e validar mudanças](CONTRIBUTING.md)

O CI usa Node.js 24 e executa a revisão automática do índice Git, instalação pelo lockfile, build, verificação de tipos, testes unitários, bloqueios de produção e testes de navegador com Chromium. Ele não publica o aplicativo nem valida Google/Supabase remotos. O [guia de contribuição](CONTRIBUTING.md) explica os servidores isolados dos testes.
