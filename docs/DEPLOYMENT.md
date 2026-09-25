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
