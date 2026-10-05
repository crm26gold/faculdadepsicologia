# Jornada Plena — design, UX e tecnologia

Atualização de 05/10/2026, integrada sobre a `main` `e4e4a1d0845cb81612381cf0cbf3a08843563917` (PRs #46 e #47). Os ajustes visuais começaram em 04/10 e foram preservados em uma cópia de integração. Esta análise substitui as evidências locais antigas; os relatórios Claude continuam como registros históricos.

## Direção visual e templates

A identidade aprovada permanece: azul oceano, superfícies claras e escuras, DM Sans/Cormorant Garamond, símbolo da marca e linguagem acolhedora. O painel prioriza o dia, a captura de ideias e o próximo passo. O movimento acompanha feedback sem bloquear leitura ou ações.

Os templates já pertencem à aplicação: `WorkspaceNavigation`, títulos e painéis; `Modal` e `CaptureSheet`; formulários de curso/matéria; `MobileDisclosure`; cards e grades do dashboard; `Brand` e `MagneticLink`. Novas telas devem reutilizar os tokens de `workspace-design.css` e as classes Tailwind `jp:` de `design-system.css`. Não é necessário migrar para um construtor visual externo.

## Melhorias implementadas

| Área | Comportamento resultante |
| --- | --- |
| Meu dia | Agenda e introdução lado a lado no desktop, uma coluna em telas menores. Ações para registrar ideia, preparar foco e abrir assistente; novo compromisso junto da agenda. Preparar foco não inicia o cronômetro. |
| Busca | Cursos, matérias, notas e compromissos com contagem e estado sem resultados. Busca local, sem envio a serviços externos; não varre conteúdo quando fechada. |
| Foco | Controle recolhido permanece abaixo do cabeçalho no desktop; no celular participa do fluxo da página. Rolagem para preparação respeita movimento reduzido. |
| Tema | Observador permanece ativo fora do perfil. Automático acompanha o sistema; escolha explícita tem prioridade. A demonstração altera tema somente em memória. |
| Navegação e toque | Controles principais com área de toque ampliada, safe areas, inputs de 16 px no celular e indicadores legíveis em telas estreitas. |
| Login | Cores e superfícies coerentes com o painel; ajuda expansível, erro e configuração pendente legíveis. Botão de conexão bloqueia duplo envio e é restaurado ao voltar pelo navegador. |
| Landing | CTAs reorganizados no celular, ajustes para desktop de pouca altura. Menu fecha por Escape, clique fora, âncora e mudança para desktop; Escape devolve foco. |
| Hidratação | Preferência de animação usa `useSyncExternalStore`: servidor e hidratação inicial mostram conteúdo estático; depois acompanham a preferência real do navegador. Ativar movimento reduzido interrompe a entrada e remove o 3D, com estado estático e duração zero. Não foi acrescentada supressão de avisos. |
| Carregamento | Onze painéis secundários usam `next/dynamic` com estado de carregamento acessível: finanças, rotina, flashcards, planejamento, administração, IA, contatos, conta, Telegram administrativo/pessoal e WhatsApp administrativo. |
| Aplicativo instalado | Paleta azul no manifesto e barra do navegador; orientação livre, incluindo paisagem. |

Os controles de `MyAiKeys`, `WhatsAppMyLink`, conexões externas e autorização OAuth da versão atual foram preservados. Exclusão de chaves, proteção de credenciais, roteamento da IA e migrações pertencem à entrega anterior, descrita em [ENTREGA_ASSISTENTE_2026-10-05.md](ENTREGA_ASSISTENTE_2026-10-05.md).

## Tecnologia e movimento

A base instalada já atende à proposta: Next.js 16.3.6, React 19.3.0, Motion 14, React Three Fiber 9.8.1/Three.js 0.186.1, Lenis 1.3.26, Tailwind 4.3.3, TipTap 3.31.3 e Supabase SSR 0.12.7/JS 2.117.0. Nenhuma dependência foi acrescentada ou atualizada nesta entrega. Os guias da versão instalada do Next foram consultados antes da integração.

O 3D continua decorativo, carregado sob demanda somente em desktop compatível, com visibilidade e movimento permitido. O fallback mantém a marca disponível; DPR fica limitado e `frameloop="demand"` interrompe o trabalho da GPU quando o ponteiro estabiliza. Lenis fica isolado na landing, desabilitado em touch/redução de movimento e pausado com a página oculta.

Não foi medida redução percentual de JavaScript ou tempo de carregamento. Separar importações oferece carregamento sob demanda; não equivale a um ganho percentual demonstrado.

Referências: [lazy loading do Next.js](https://nextjs.org/docs/app/guides/lazy-loading), [snapshot de servidor do React](https://react.dev/reference/react/useSyncExternalStore#adding-support-for-server-rendering), [performance do R3F](https://r3f.docs.pmnd.rs/advanced/scaling-performance).

## Integridade

Não há alteração de banco, credenciais, permissões ou destino dos dados nesta entrega visual. Workspace, caderno e editor mantêm persistência, formatação, revisões, proteção de conflitos e estados de salvamento. A vida pessoal permanece privada; os testes usam exemplos sintéticos e APIs simuladas.

Não usar `supabase db push` como parte desta atualização: a migração legada `messenger_bot` exige reconciliação própria. O alinhamento dos novos arquivos e índices da entrega anterior já foi concluído no PR #47; não repetir esse trabalho.

## Validação e entrega

- Regressão em desenvolvimento: o teste reproduziu o aviso de estilos divergentes da landing antes da correção e passou depois dela, incluindo recarga com movimento reduzido.
- Build final, tipos, 224 testes de domínio, três testes do protocolo WhatsApp e 13 cenários de bloqueio de produção aprovados.
- Playwright local: suíte de 130 cenários exercitada, com 125 casos aprovados entre a execução completa e as reexecuções dos seletores afetados pelo novo atalho. Cinco omissões são específicas por dispositivo. No build final, os 12 cenários selecionados de UX e regressão passaram; duas omissões por dispositivo.
- Auditoria visual final: 25 combinações de tela/tema/página, sem overflow horizontal, erros de console ou violações axe. Capturas sintéticas também foram inspecionadas visualmente.
- Revisões independentes de padrões e requisitos não encontraram bloqueios materiais. O ponto de interrupção de movimento em andamento foi tratado e verificado em navegador.
- O CI completo do PR é obrigatório antes do merge e registra também os testes SQL em Postgres descartável. Produção publica automaticamente pela `main`; confirmar o SHA, o estado READY e o alias é uma etapa separada da validação local.

A auditoria visual usa 320×740, 390×844, 820×1180, 844×390 e 1440×1080; verifica conteúdo, console, overflow horizontal e axe nos temas claro/escuro. Testes automatizados não comprovam OAuth Google real, chamada real com provedor, vínculo WhatsApp nem leitura dos dados em outro aparelho. Esses aceites continuam separados da atualização visual.
