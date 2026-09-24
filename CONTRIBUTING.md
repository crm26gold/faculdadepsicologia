# Como contribuir

As contribuições devem preservar os dados existentes, manter exemplos públicos sintéticos e indicar com clareza o que já funciona. Leia o [README](README.md), a [arquitetura](docs/ARCHITECTURE.md) e o [roadmap](docs/ROADMAP.md) antes de ampliar o produto.

## Preparar o ambiente

Use Node.js 24, conforme `.nvmrc` e `package.json`, e instale as dependências pelo lockfile:

```sh
npm ci
```

Leia `AGENTS.md` e, ao alterar código Next.js, o guia correspondente em `node_modules/next/dist/docs/`. O pacote instalado é a referência para a versão usada pelo projeto.

Use [.env.example](.env.example) apenas como modelo. Não sobrescreva `.env.local` existente, copie credenciais privadas para a demo ou teste sobre um perfil de navegador com dados pessoais. O [guia de implantação](docs/DEPLOYMENT.md) descreve o contrato de ambientes e as verificações pendentes.

## Preparar uma mudança

- Preserve a interface existente ao ampliar recursos e explique mudanças de comportamento.
- Preserve notas, formatação, tarefas e demais registros nas migrações. Um novo espaço privado começa vazio; uma demo recebe apenas exemplos sintéticos.
- Não apague a chave local, backups ou registros existentes para obter um estado de teste limpo. Use um ambiente descartável separado.
- Atualize a matriz de funcionalidades quando um recurso mudar de estado. Uma integração só deve ser anunciada como ativa após verificação no ambiente correspondente.
- Não introduza chamadas de IA ou compartilhamento de conteúdo sem autorização e consentimento conforme o roadmap.

## Validar

Execute os mesmos comandos usados pelo CI:

```sh
npm run build
npm run typecheck
npm test
```

O workflow em `.github/workflows/ci.yml` executa `npm ci` antes desses passos em Node.js 24, sem segredos ou implantação. Depois executa os testes de bloqueio de produção e de navegador. O build precisa anteceder os testes que usam `next start` e a verificação dos tipos gerados pelo Next.js.

Inclua testes proporcionais ao risco: preservação de dados, autorização e regressões de comportamento precisam de evidência específica. Uma mudança exclusivamente documental não exige criar testes de aplicação.

### Testes de navegador

`npm run test:browser` usa `playwright.config.ts` para iniciar, aguardar a prontidão e encerrar servidores de produção do Next.js. É necessário um build prévio. As portas devem estar livres:

| Porta | Cenário | Configuração |
| --- | --- | --- |
| 3004 | Demo em desktop e celular | `APP_MODE=demo`, sem credenciais privadas. |
| 3005 | Acesso privado fechado | `APP_MODE=private`, Google desligado, sem prévia local. |
| 3006 | Preservação dos dados locais | `APP_MODE=private`, prévia local de teste habilitada. |

No CI, `CI=true` remove o canal `msedge` e permite usar Chromium. O workflow instala o navegador e as dependências do sistema com `npx playwright install --with-deps chromium`. Localmente, o padrão usa Edge; para usar Chromium, instale-o e defina `CI=true` apenas no processo de teste.

Não defina `PLAYWRIGHT_BASE_URL` para executar a suíte completa: esse override desliga os servidores gerenciados e exclui os cenários privado e de dados locais. Ele serve para uma verificação deliberadamente parcial de um servidor já iniciado.

O script `npm run test:gate` também depende de build, usa a porta 3001 e exercita restrições de produção. O passo correspondente no CI define `APP_MODE=private` para não herdar o modo demo do job. Não execute esses testes com contas reais, segredos ou dados pessoais. Eles não comprovam login real ou RLS remota.

## Publicar mudanças com cuidado

Confira conteúdo e arquivos selecionados, inclusive os ainda não rastreados:

```sh
git status --short --untracked-files=all
git diff --check
git diff --cached
node scripts/check-publication.mjs
```

O scanner examina o conteúdo exato do índice Git e também recusa diferenças entre os arquivos locais e a versão preparada para publicação. Execute-o com o índice já preparado; um índice vazio não constitui uma revisão. Seus alertas automáticos não substituem a revisão humana. O CI o executa após checkout e preparação do Node.js, antes de instalar dependências.

O `.gitignore` preserva fora do Git as notas privadas da raiz, `.agents/`, `.codex/`, `CLAUDE.md`, `skills-lock.json`, ambientes, backups locais e relatórios. Não force a inclusão desses arquivos. Regras de ignore não removem conteúdo já rastreado ou presente no histórico.

Não inclua a identidade real do usuário, e-mail, UUID do proprietário, grades reais, capturas pessoais, exportações do workspace ou segredos; evite identificadores desnecessários. URLs públicas do Supabase e identificadores públicos de hospedagem não são credenciais e podem permanecer na configuração quando necessários à validação do projeto. Use exemplos inventados e, quando necessário, domínios reservados como `example.invalid`. Relate falhas sem anexar dados pessoais ou credenciais.

Na descrição da contribuição, explique o problema, o comportamento resultante, como foi verificado e as limitações conhecidas. Diferencie build local, execução de CI e validação em produção. Publicação do repositório, configuração externa e deploy são operações separadas.
