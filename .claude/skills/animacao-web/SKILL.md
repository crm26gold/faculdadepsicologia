---
name: animacao-web
description: Animação e 3D no front-end da Jornada Plena (Framer Motion, React Three Fiber, scroll com Lenis/GSAP). Use quando o pedido envolver animação, microinteração, transição, efeito de scroll, sequência de imagens, hero, landing page, cena 3D, modelo .glb ou efeitos "estilo Framer/Webflow/Spline".
---

# Animação web e 3D

Plataformas visuais geram código com bibliotecas abertas: Framer → React + Framer Motion; Webflow → HTML/CSS + GSAP/Lenis; Spline → WebGL/Three.js. Aqui escrevemos esse código direto, no padrão que o projeto já usa. Leia os arquivos de referência antes de criar algo novo e copie o padrão deles.

## Referências no código

- `src/components/landing/jornada-landing.tsx`: entrada em cascata, `useScroll` + `useTransform`, `useInView`, `useReducedMotion`, e o `JourneyOrb`, que decide quando montar o 3D.
- `src/components/landing/journey-scene.tsx`: cena R3F com `frameloop="demand"`, `dpr={[1, 1.5]}`, `powerPreference: 'low-power'`, error boundary e `webglcontextlost`.
- `src/components/landing/smooth-scroll.tsx`: Lenis só em desktop com ponteiro fino, desligado com movimento reduzido e com a aba oculta.
- `src/components/landing/magnetic-link.tsx`: microinteração com `useMotionValue` + `useSpring`.

## Escolha da ferramenta

1. **UI, entrada, hover, layout e transição**: `framer-motion`. Use `transition: { type: 'spring', stiffness, damping }` para movimento físico; curvas `ease` ficam para opacidade e cor.
2. **Scroll ligado ao progresso** (parallax, revelar, trocar quadros): primeiro `useScroll` + `useTransform` do Framer Motion, que já está instalado e já convive com o Lenis.
3. **Scroll com pin, timeline longa ou scrub encadeado**: `gsap` + `ScrollTrigger` (instalar `gsap`). Sincronize com o Lenis: `lenis.on('scroll', ScrollTrigger.update)` e o ticker do GSAP chamando `lenis.raf`, com o Lenis criado sem `autoRaf`. Registre o plugin e desfaça tudo com `gsap.context()` + `ctx.revert()` no cleanup do `useEffect`.
4. **3D**: `@react-three/fiber` + `three`. Para carregar `.glb`/`.gltf`, adicione `@react-three/drei` (`useGLTF`, `useGLTF.preload`) e envolva em `<Suspense>`. Use `OrbitControls` só quando o usuário precisa girar o objeto: numa hero ele captura a roda do mouse e quebra o scroll. Para reagir ao mouse, siga o `Sculpture` (`MathUtils.damp` + `invalidate`).

## Regras do projeto

- **Movimento reduzido sempre**: `useReducedMotion()` em todo componente animado. Com movimento reduzido, o estado final aparece direto e o 3D nem é montado. O CSS global já zera `transition`/`animation`, mas animações em JS precisam de checagem explícita.
- **3D é progressivo**: carregue com `dynamic(() => import(...), { ssr: false })` e monte só com desktop capaz (`(min-width: 900px) and (hover: hover) and (pointer: fine)`), visível na tela (`useInView`) e sem falha anterior. Mantenha um fallback em CSS sempre visível por baixo.
- **GPU em repouso**: `frameloop="demand"` e `invalidate()` só enquanto algo se move. Limite `dpr` a 1.5 e use `antialias` apenas quando fizer diferença visível.
- **Sequência de imagens no scroll**: desenhe num `<canvas>` com `drawImage`, pré-carregando os quadros com `new Image()` e `decode()`. Use WebP/AVIF em `public/`, de preferência 30–60 quadros. Em celular ou com movimento reduzido, mostre um quadro estático.
- **Elementos decorativos** levam `aria-hidden="true"`. Texto importante nunca depende da animação para aparecer.
- **Estilo**: siga a área onde o código entra. A landing usa CSS Modules (`landing.module.css`) e o app usa os CSS globais. Ao mudar cores em `globals.css`, `focus-responsive.css`, `finance.css`, `notes.css` ou `academic.module.css`, rode `node scripts/dark-theme.mjs`, porque o `prebuild` falha se o modo escuro ficar desatualizado.
- **Next.js deste repositório difere do que você conhece**: confira `node_modules/next/dist/docs/` antes de usar uma API do Next (veja `AGENTS.md`).

## Concluído quando

- O efeito funciona em desktop, em celular (com fallback) e com movimento reduzido ativado.
- Não há loop de renderização contínuo com a cena parada, nem listeners, Lenis ou ScrollTrigger vivos depois de desmontar.
- `npm run typecheck`, `npm test` e `npm run build` passam. Para mudança visual, rode `npm run test:browser` ou a skill `run` para ver na tela.
