# Jornada Plena — identidade e experiência do aplicativo

## Revisar

A apresentação está em `/jornada`. O aplicativo em `/` usa a mesma direção visual, com navegação agrupada e responsiva. O acesso ao espaço pessoal segue exigindo autenticação.

```sh
npm run dev
```

Abra `http://127.0.0.1:3000/jornada`. Para revisar o aplicativo com exemplos fictícios, use `APP_MODE=demo` em um processo local isolado; não altere o modo do ambiente de produção.

## Direção de arte

- Fundo branco azulado `#F5F8FC`, texto azul noite `#0B2338`, destaque azul profundo `#123F61`.
- Símbolo original verde e dourado, sem alterações no arquivo da marca.
- Tipografia DM Sans em escala ampla, bastante respiro, vidro translúcido e sombras leves.
- Narrativa: “Mais vida. Menos ruído.” seguida de “Você não precisa dar conta de tudo. Só do próximo passo.”
- Cards de organização são exemplos visuais, identificados como exemplos; não representam dados do usuário.

## Dependências

Já instaladas com npm e registradas em `package-lock.json`. Para reproduzir a instalação das novas dependências:

```sh
npm install framer-motion@14.0.0 lenis@1.3.26 @react-three/fiber@9.8.1 three@0.186.1
npm install -D tailwindcss@4.3.3 @tailwindcss/postcss@4.3.3 @types/three@0.186.0
```

O pacote atual de Lenis é `lenis`. Não é necessário instalar Spline ou cadastrar uma API para este 3D.

## Estrutura

- `src/app/jornada/page.tsx`: rota e metadados; renderização estática.
- `src/app/design-system.css`: Tailwind com prefixo `jp:` e sem Preflight.
- `src/app/workspace-design.css`: tokens claros/escuros, navegação, painel, formulários, cards, diálogos e telas internas.
- `src/components/workspace-navigation.tsx`: menu agrupado, grupos expansíveis, indicador animado e barra recolhível.
- `src/components/academic.module.css`: calendário e planejamento de estudos usando os tokens compartilhados.
- `src/app/jornada/cinematic.css`: estilos específicos da rolagem Lenis.
- `src/components/landing/jornada-landing.tsx`: Hero, header, primeira transição e narrativa.
- `src/components/landing/landing.module.css`: composição, responsividade e acabamento visual isolados.
- `src/components/landing/journey-scene.tsx`: esfera e órbitas procedurais com React Three Fiber.
- `src/components/landing/magnetic-link.tsx`: CTA magnético com suporte a teclado e movimento reduzido.
- `src/components/landing/smooth-scroll.tsx`: Lenis com limpeza dos listeners e respeito às preferências de movimento.
- `postcss.config.mjs`: integração Tailwind/PostCSS.

## Movimento e desempenho

Framer Motion usa `useScroll` e `useTransform` na Hero e na primeira seção, com reveals suaves. O conteúdo também permanece legível sem JavaScript.

O 3D é carregado dinamicamente em desktop com ponteiro preciso, enquanto a Hero está próxima da área visível. O canvas renderiza sob demanda, com resolução limitada; para quando o mouse se estabiliza. Celulares, movimento reduzido e dispositivos sem WebGL recebem a composição CSS. Lenis funciona no desktop; no celular permanece a rolagem nativa.

O cursor nativo é mantido. O visitante conserva a identificação familiar dos links e o suporte ao teclado.

## Verificação desta entrega

- `npm run typecheck`: aprovado.
- `npm run build`: aprovado; `/jornada` gerada como página estática.
- `npm test`: 165 testes aprovados.
- `npm run test:gate`: 13 cenários de autorização e isolamento aprovados.
- Aplicativo: suíte de 99 cenários de navegador executada; as regressões encontradas foram corrigidas e os cenários afetados reexecutados, incluindo teclado, persistência, formulários, navegação e controles da chamada. Quatro cenários são omitidos intencionalmente conforme o dispositivo.
- Dois cenários adicionais verificam a rolagem acessível das mensagens em 320px.
- Navegador: desktop 1440px, celular 390px, movimento reduzido e ausência de WebGL.
- Sem erros de cliente, falhas de requisição ou overflow horizontal nesses cenários.
- Navegação por âncoras, menu móvel, conteúdo sem JavaScript e acesso ao login verificados.
- Axe WCAG A/AA: nenhuma violação encontrada nas verificações desktop e móvel. Isso não substitui uma auditoria manual completa.

Capturas e relatórios de revisão estão em `.local/jornada-preview/`, ignorados pelo Git.

## Navegação e usabilidade do aplicativo

- Grupos: **Sua jornada**, **Aprender e criar** e **Conectar**; perfil e preferências ficam no rodapé da barra.
- Recolhimento no desktop, nomes acessíveis nos ícones e preferência local versionada em `jornada-navigation-collapsed-v1`. A demonstração não lê nem grava essa preferência.
- Gaveta móvel em diálogo nativo, com Escape, retorno do foco e preservação dos atalhos personalizáveis.
- Indicador de seleção com Framer Motion. As transições entre áreas preservam o componente do cronômetro e o contraste dos textos.
- Cards, formulários e modais compartilham superfícies, bordas, tipografia e estados de foco. Entradas e saídas financeiras mantêm cores semânticas diferentes.
- Movimento reduzido, botões de toque maiores e campos de 16px no celular.
- 3D e Lenis ficam na apresentação. Agenda, caderno e formulários usam rolagem nativa.

As capturas das telas internas e relatórios de contraste estão em `.local/workspace-preview/`. A validação usa exemplos e respostas simuladas, sem consultar dados pessoais ou consumir uma API de voz paga.

Foram conferidas 41 combinações de tela e tamanho. A revisão final de desktop, celular, modo escuro e assistente em 320px não encontrou overflow horizontal, erros de cliente ou violações automáticas Axe A/AA. O teste de voz usa respostas simuladas; não confirma a disponibilidade ou o faturamento do provedor real.
