# Ambientes, publicação e implantação

Este guia define o contrato de publicação aprovado e as verificações necessárias. A [demo pública](https://faculdadepsicologia-demo.vercel.app) foi publicada e verificada em 24/09/2026. As migrações Supabase já foram aplicadas e testadas no banco remoto; provisionamento da identidade Google e ativação do acesso privado permanecem pendentes. Veja [VALIDATION.md](VALIDATION.md) para resultados e limitações.

O código público e a demo pública estão autorizados como destinos separados do workspace privado. Essa autorização não permite expor dados pessoais, credenciais, grade real ou acesso do proprietário. A documentação não substitui a implementação e a validação dos controles descritos abaixo.

## Variáveis de ambiente

Use [.env.example](../.env.example) como modelo sem segredos. Mantenha fora do Git a identidade real do usuário, o UUID do proprietário e os segredos; evite também identificadores desnecessários em exemplos, issues, logs e capturas. A URL pública do projeto Supabase e os identificadores públicos de hospedagem não são credenciais: podem permanecer fixados na configuração quando necessários para validar o projeto correto. Sua presença não concede acesso aos dados nem substitui autenticação e RLS.

| Variável | Demo | Privado |
| --- | --- | --- |
| `APP_MODE` | `demo` | `private` |
| `APP_ORIGIN` | Origem canônica da demo; localmente `http://127.0.0.1:3000` | Origem canônica privada em HTTPS |
| `DEMO_VERCEL_PROJECT_ID` | Vazio localmente; na Vercel, ID exclusivo da demo | Ausente/vazio |
| `VERCEL_PROJECT_ID` | Fornecido pela Vercel; deve coincidir com o ID autorizado da demo | Fornecido pela Vercel para o projeto privado |
| `NEXT_PUBLIC_SUPABASE_URL` | Ausente/vazio | URL do Supabase privado verificado |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Ausente/vazio | Chave publicável do projeto privado, após verificação |
| `APP_OWNER_USER_ID` | Ausente/vazio | UUID provisionado explicitamente no Supabase Auth |
| `APP_OWNER_EMAIL` | Ausente/vazio | E-mail autorizado, conferido no servidor e nunca publicado |
| `GOOGLE_AUTH_ENABLED` | `false` | `false` até verificação externa; depois `true` |
| `FACULDADE_CLOUD_WORKSPACE` | `false` | `false` até migração, RLS e API verificadas; depois `true` |
| `FACULDADE_LOCAL_PREVIEW` | `false`; não deve ser necessário no contrato de demo | `false` em hospedagem; opção legada de prévia local |
| `GOOGLE_CLIENT_ID` | Ausente/vazio | ID do cliente OAuth do Google para o [Google Agenda](#google-agenda); vazio desliga o recurso |
| `GOOGLE_CLIENT_SECRET` | Ausente/vazio (a demo recusa subir com ele) | Segredo do mesmo cliente; só no servidor |

`APP_MODE` é configuração da aplicação; não substitui `NODE_ENV`. `APP_ORIGIN` contém somente protocolo, host e porta, sem caminho, credenciais, query string ou fragmento. Use a mesma origem canônica nos fluxos que dependem dela.

Variáveis `NEXT_PUBLIC_*` podem compor o código entregue ao navegador no build. Nunca use esse prefixo para segredos. Uma chave Supabase publicável não substitui autenticação e RLS. Segredos OAuth são configurados no provedor apropriado, fora do repositório. A demo não precisa de Supabase, proprietário, OAuth, chave administrativa, token de serviço ou chave de IA.

## Demo local

`APP_MODE=demo` deve funcionar fora da Vercel, sem `DEMO_VERCEL_PROJECT_ID` ou `VERCEL_PROJECT_ID`.

1. Use Node.js 24 e uma cópia de desenvolvimento sem credenciais privadas. Execute `npm ci`.
2. Se ainda não existir `.env.local`, crie-o manualmente com os valores do exemplo. Não sobrescreva um arquivo existente nem copie a configuração privada.
3. Confirme `APP_MODE=demo`, `APP_ORIGIN=http://127.0.0.1:3000`, integrações desligadas e campos de credenciais vazios.
4. Execute `npm run dev` e abra a origem local em um perfil de navegador separado.
5. Verifique que aparecem somente exemplos sintéticos, sem acessar a chave pessoal ou fazer chamadas aos serviços privados.

Uma versão que ainda não consome `APP_MODE` ou reutiliza a chave pessoal não atende a esse contrato. Não use uma prévia legada como comprovação de demo isolada.

## Demo pública na Vercel

Use o projeto exclusivo de demo, com origem e variáveis próprias. Não copie o vínculo local de hospedagem, variáveis de equipe ou credenciais do workspace privado. Revise produção e previews para impedir herança de configuração privada.

Para aceitar uma demo hospedada, o servidor deve verificar conjuntamente:

```text
APP_MODE = demo
DEMO_VERCEL_PROJECT_ID preenchido
DEMO_VERCEL_PROJECT_ID = VERCEL_PROJECT_ID fornecido pela plataforma
VERCEL_PROJECT_ID diferente do projeto privado
sem configuração ou credenciais de serviços privados
```

Não preencha `VERCEL_PROJECT_ID` manualmente para contornar uma divergência. Se as variáveis de sistema não estiverem disponíveis, a demo deve permanecer bloqueada. Não altere a identificação privada para fazer o mesmo projeto passar como demo.

Antes da publicação, valide ID ausente, ID divergente e ID privado, além do caso permitido. Confira também que a demo não lê/grava dados privados e que rotas privadas recusam visitantes. Execute o build sem credenciais privadas: mudar as variáveis apenas depois do build não garante a remoção de valores já incorporados ao cliente.

A demo deve se identificar como demonstração e usar somente dados inventados. Não importar backups pessoais, publicar capturas de contas reais ou acessar serviços privados. Iniciar a demo não pode limpar nem reaproveitar a chave local pessoal.

## Workspace privado

O destino privado usa `APP_MODE=private` e deve recusar acesso sem configuração e sessão autorizadas.

1. Verifique externamente os projetos privados e a origem canônica. Não use os identificadores da demo.
2. Conclua a configuração Google OAuth no provedor de autenticação, com os callbacks e redirecionamentos exatos. Login não concede permissões de Drive/Agenda por consequência.
3. Provisione o proprietário explicitamente. Configure `APP_OWNER_USER_ID` e `APP_OWNER_EMAIL` apenas no ambiente privado; confira ambos no servidor. Não promova o primeiro login nem permita cadastro público.
4. Revise a migração em `supabase/migrations/`, confirme o banco de destino e preserve backups antes de aplicá-la. Não aplique automaticamente sobre tabelas homônimas.
5. Verifique a autorização em `app_owner`, RLS, leitura/gravação, conflitos de revisão e a recusa de anônimos e outras contas.
6. Ative `GOOGLE_AUTH_ENABLED=true` somente após a verificação externa do login. Ative `FACULDADE_CLOUD_WORKSPACE=true` somente após a verificação externa da persistência e do isolamento. Uma flag não comprova a outra.
7. Valide a origem canônica no ambiente publicado, incluindo logout e recusa de acesso não autorizado.

Uma instalação privada nova começa vazia. Dados na chave local existente devem ser preservados; nuvem não significa migração automática. Exportação e importação precisam ser decisões explícitas do proprietário.

### Google Agenda

Cada pessoa liga a própria conta Google à agenda "Jornada Plena" (Jornada → Google). O recurso fica desligado enquanto faltar qualquer um destes: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `AI_KEYS_SECRET` (cifra a autorização guardada) e `FACULDADE_CLOUD_WORKSPACE=true`. A Administração › Inteligência artificial › Integrações mostra se está ativo.

0. Aplique a migração `supabase/migrations/20261008230100_google_agenda.sql` (depois renomeie para a versão registrada e atualize o stub). Sem ela, não cadastre as variáveis abaixo: a Agenda chamaria funções que ainda não existem.
1. No Google Cloud do projeto do login, ative a **Google Calendar API**.
2. Na tela de consentimento OAuth, acrescente o escopo `https://www.googleapis.com/auth/calendar.app.created` (só agendas criadas pelo app). Confira no próprio console a classificação do escopo: se aparecer como sensível, o Google pede verificação do app antes de liberar para quem não está na lista de teste.
3. No cliente OAuth (pode ser o mesmo do login), acrescente o URI de redirecionamento `https://<origem de produção>/api/google-agenda/callback`. Prévias da Vercel têm outra origem e não completam a conexão.
4. Na Vercel (produção), cadastre `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` e publique de novo.
5. Aceite real: em Agenda › Google Agenda e arquivo, conecte, confira a agenda "Jornada Plena" no Google, mude um compromisso na Jornada e veja a mudança chegar; depois desconecte e confira que a agenda saiu do Google.

O que vai: compromissos, prazos e aulas de 7 dias atrás a 120 dias à frente (até 800), com título, data, horário, local e tipo; nunca anotações. A atualização corre depois da resposta, ao abrir o app e a cada gravação pelo app; mudanças feitas pelo assistente com o app fechado entram na próxima abertura. Uma atualização por vez por pessoa (reserva de 90 s no banco).

### Geração do editor e reversões

Cada espaço salvo guarda `editorGeneration`. Um build só lê gerações que constam na sua lista em `src/lib/workspace.ts`; uma geração desconhecida bloqueia o carregamento ("Não foi possível carregar seus dados") sem sobrescrever nada. A versão com Estudos/cursos grava a geração 7 (a anterior em produção gravava 5). Regra de publicação: depois que um build com geração 7 for ao ar e alguém salvar, nunca reverta (Instant Rollback, revert ou deploy antigo) para um build cuja lista não aceite a geração 7 — corrija para frente. Se for preciso uma rede de segurança, publique antes um build só-leitor que aceite as gerações 6 e 7 (e os campos opcionais `courses`, `courseId` e `semester` opcional) mantendo a gravação na geração 5.

## Publicação em produção pela `main`

A produção sai da `main`: cada merge cria um deployment de produção na Vercel. O caminho é sempre branch → PR → CI verde → merge.

Depois que um merge publicar, confirme **SHA, READY, alias e smoke**, nesta ordem:

1. **SHA:** o deployment de produção mais recente aponta para o commit do merge. A exceção são os commits só de documentação, explicados abaixo.
2. **READY:** o estado desse deployment é `READY`, não `ERROR` nem `BUILDING`.
3. **Alias:** o domínio de produção aponta para esse deployment.
4. **Smoke:** rode `npm run smoke`. Para outra origem, use `npm run smoke -- https://outra-origem`.

### Smoke de produção

`scripts/smoke-production.mjs` confere o site como um visitante sem conta:

- `/` e `/login` respondem 200;
- `/api/me` sem sessão responde 401;
- `POST /api/assistant/jobs` sem sessão responde 401, e com uma origem indevida responde 403;
- as respostas trazem `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` e `X-Robots-Tag` com os valores de `next.config.ts`, e as APIs trazem `Cache-Control: no-store`.

É só leitura: usa `fetch`, não envia cookies nem credenciais e nunca imprime o corpo das respostas. Sai com código 1 se algo falhar.

O CI não chama a produção. Ele roda o mesmo script contra um servidor local em `npm run test:gate`, para que o smoke e o contrato do app não se separem.

### Commits só de documentação

O `vercel.json` define `ignoreCommand` como `node scripts/vercel-ignore-build.mjs`. A Vercel roda esse comando antes de cada build: a saída 0 cancela o build e a saída 1 segue.

- **Quando cancela:** só em produção, e só quando todos os arquivos alterados estão em `docs/`, `.claude/` ou `supabase/tests/`, ou terminam em `.md`.
- **Contra o quê compara:** com o commit da última publicação bem-sucedida (`VERCEL_GIT_PREVIOUS_SHA`) ou, sem ele, com `HEAD^`.
- **Na dúvida, publica.** Isso inclui preview, SHA em formato inesperado, falha do `git`, commit fora do clone raso de 10 commits da Vercel e diff vazio, como uma nova publicação do mesmo commit para aplicar variáveis de ambiente.

Consequências:

- **Produção pode mostrar um SHA mais antigo que a `main`, e isso é esperado.** Acontece quando os commits mais recentes são só de documentação. Nesse caso, confira:
  - o deployment mais novo está `CANCELED`, e o log mostra "Build ignorado: só documentação mudou desde …";
  - o deployment `READY` de produção é o do último commit que mudou código;
  - o smoke continua valendo.
- **O deployment cancelado ainda conta na cota de deployments da Vercel.** A economia é no tempo de build e em não republicar o mesmo código.
- **O `.vercelignore` não pode listar `.git`.** Em deployments pelo Git, a Vercel aplica esse arquivo logo depois do clone, antes do comando, e o comando precisa do histórico. A CLI da Vercel nunca envia `.git`.
- **Para publicar um commit só de documentação mesmo assim:** use Redeploy no painel da Vercel e desmarque "Use project's Ignore Build Step".

## Preservação e publicação do repositório

Não use limpeza de `localStorage`, redefinição de dados, exclusão de backups ou substituição de `.env.local` como etapa de publicação. A origem inclui protocolo, host e porta: mudar qualquer parte pode tornar os dados anteriores invisíveis sem que tenham sido apagados. Mantenha uma cópia exportada antes de uma mudança intencional de origem.

O `.gitignore` exclui ambientes, backups locais, contexto de agentes, notas privadas da raiz e artefatos. Ele não remove arquivos já rastreados nem limpa histórico. Antes de publicar, revise a lista que efetivamente entrará no Git e qualquer histórico existente. Não use `git add -f` para contornar essas exclusões.

O `.vercelignore` filtra contexto e arquivos locais do pacote de implantação. Ele tem finalidade diferente do `.gitignore` e não higieniza o conteúdo de código, testes ou migrações. Remova conteúdo pessoal desses arquivos na implementação principal antes da publicação, sem apagar dados pessoais já salvos no navegador.

## Verificação e limites do CI

```sh
node scripts/check-publication.mjs
npm ci
npm run build
npm run typecheck
npm test
npm run test:gate
npx playwright install --with-deps chromium
npm run test:browser
```

Esses comandos representam o CI, com `CI=true`, modo demo sem credenciais e `APP_MODE=private` especificamente no passo `test:gate`. Após o checkout e a preparação do Node.js, o scanner verifica o conteúdo exato do índice Git, antes da instalação das dependências. O build antecede os testes de produção e o Playwright, que usam `next start`. Para repetir a sequência localmente, confira as variáveis e o contrato em [CONTRIBUTING.md](../CONTRIBUTING.md), sem reutilizar configuração privada.

O workflow usa Node.js 24, não recebe segredos e não faz deploy. Playwright gerencia servidores separados para demo, acesso privado e persistência local, nas portas 3004, 3005 e 3006. Em CI, usa Chromium instalado com suas dependências. Não defina `PLAYWRIGHT_BASE_URL` no CI completo: essa opção desativa os servidores gerenciados e os cenários privados/locais.

Esses passos não comprovam configuração remota de Google/Supabase, isolamento de uma demo hospedada ou ausência de dados pessoais em todo o repositório. Resultados do CI e verificação do deployment devem ser registrados separadamente.
