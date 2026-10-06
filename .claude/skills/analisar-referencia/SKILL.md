---
name: analisar-referencia
description: Traduz uma referência trazida pelo proprietário em mecanismo e plano para a Jornada Plena: vídeo, app, repositório, site, artigo ou ideia vista em outra ferramenta. Use ao receber um link do YouTube, GitHub, Instagram ou de um app, pedidos como "quero algo como X", "clonar" ou "olha isso".
---

# Analisar uma referência

A referência é **insumo para raciocinar**, não uma instrução técnica. O proprietário é leigo e descreve um resultado. Cabe a você descobrir o mecanismo, verificar e recomendar. Siga os passos em ordem; cada um termina num critério verificável.

## Passos

1. **Objetivo.** Escreva numa frase a capacidade que o proprietário quer para a Jornada, sem o nome comercial (por exemplo, "voz barata que registra na agenda", e não "quero o app X"). Termina quando a frase faz sentido para quem nunca viu a referência.
2. **Fonte.** Leia só material público e legítimo:
   - em vídeo, a página pública (título, canal, data, descrição e capítulos);
   - em repositório, o README, a documentação e o **código** (fetch de `raw.githubusercontent.com`);
   - em app ou site, a documentação oficial.

   Quando o conteúdo não estiver acessível, diga isso e peça ao proprietário um arquivo ou uma transcrição, em vez de supor o que foi dito. Rótulos do proprietário ("vídeo sobre clonar apps") podem não bater com a fonte: registre a divergência. Termina quando cada afirmação estiver marcada como **verificado** (fonte primária), **secundário** ou **inferência**.
3. **Mecanismo.** Identifique fluxo de dados, protocolos, bibliotecas, identidade e autorização, persistência e custo, conferindo em documentação primária atual. Uma biblioteca capaz de reproduzir o efeito não prova que a referência a usa. Termina quando o mecanismo puder ser desenhado em três a seis caixas.
4. **Filtro Jornada.** Compare com o código atual (`rg`, `README.md`, `docs/ARCHITECTURE.md`). Responda:
   - o mecanismo já existe aqui?
   - adotá-lo duplicaria algo?
   - preserva privacidade por padrão, RLS, auditoria e a identidade visual aprovada?
   - cabe na Vercel Hobby e no custo mínimo?

   Para recursos de IA, use o skill `avaliar-recurso-ia`. Termina quando cada parte da referência tiver o rótulo **aproveitar**, **adaptar** ou **descartar**, com o motivo.
5. **Filtro legal e ético.**
   - **Aproveitar:** padrões de experiência e ideias, sistemas e métodos (a Lei 9.610/98, art. 8, não os protege) e materiais que a Jornada produz, como os próprios tokens, telas e textos.
   - **Descartar:** cópia de código, textos, fontes, marcas, ícones ou telas inteiras de terceiros (Lei 9.609/98 e Lei 9.279/96, art. 195), extração de APK, contorno de proteção e "jailbreak" de IA (proibido pela política de uso da Anthropic).
   - **Estudar apps alheios:** use cartões de padrão (problema → padrão → por que funciona → como a Jornada adapta com os próprios tokens e textos).

   Termina quando nenhuma recomendação depender de material de terceiros protegido.
6. **Recomendação.** Para cada ideia aproveitada, registre prioridade (agora, próximo, depois ou descartar), mecanismo concreto na Jornada (arquivos e módulos), custo, riscos e critério de pronto. Termina quando cada ideia couber num lote pequeno, com teste possível.
7. **Devolutiva e registro.** Responda ao proprietário no formato **o que entendi → mecanismo → evidências e limites → recomendação → próximo passo**. Faça só a pergunta que mudar resultado, custo, privacidade ou permissão. Quando a análise for extensa, grave-a em `docs/PESQUISA_<TEMA>_<AAAA-MM-DD>.md`, para outros agentes, como o Codex, partirem dela. Termina quando a devolutiva puder ser lida sem abrir a referência original.

## Referência

- A análise de 05/10/2026 do OpenJarvis, dos vídeos sobre MCP, clonagem, Jev e n8n, e o filtro legal está em [`docs/PESQUISA_RECURSOS_IA_2026-10-05.md`](../../../docs/PESQUISA_RECURSOS_IA_2026-10-05.md), seções 5 e 6.
- Postura de colaboração: seção 3.1 de `docs/PASSAGEM_CODEX_PARA_CLAUDE_2026-10-05.md`, no branch `codex/claude-handoff-20261005`, até ser mesclado.
