---
name: avaliar-recurso-ia
description: Avalia uma API, modelo, serviço de voz (ouvir, falar ou ao vivo), servidor MCP ou assinatura antes de entrar no roteador da Jornada Plena, olhando capacidade, preço, cota grátis, política de dados, português e encaixe na Vercel. Use quando surgir um provedor novo, "API grátis", "mais barato", troca de modelo, chave nova ou dúvida se um serviço pode receber dados pessoais.
---

# Avaliar um recurso de IA

Na Jornada, todo recurso externo é uma **peça** que amplia o sistema: nenhuma empresa é exclusiva de uma tarefa. O roteador só pode escolher uma peça cuja capacidade, autorização e política de dados estejam claras. Avaliar é preencher o **descritor** abaixo com fontes primárias e datas.

## Passos

1. **Classe e direção.** Classifique o recurso:
   - **API de texto**;
   - **ouvir** (STT, transcrição);
   - **falar** (TTS);
   - **voz ao vivo tudo-em-um**;
   - **voz com cérebro próprio** (o serviço ouve e fala; o "pensar" vem do roteador da Jornada);
   - **MCP de entrada** (um assistente externo usa a Jornada);
   - **MCP de saída** (a Jornada usa ferramentas externas);
   - **plano ou assinatura** (por exemplo, "Sign in with ChatGPT");
   - **canal**.

   Termina quando a classe estiver escolhida, sem misturar MCP de entrada com uso do modelo da assinatura.
2. **Capacidades.** Liste o que um adaptador realmente faria e mapeie para `capabilityIds` em `src/lib/ai/resources.ts`. Se faltar uma capacidade nova, proponha o identificador e o teste que comprova o comportamento do adaptador (veja `tests/ai-resources.test.ts`). Termina quando cada capacidade tiver evidência na documentação oficial.
3. **Preço.** Registre unidade (token, minuto, caractere ou hora), valor, cota gratuita, data da leitura e a página oficial. Preço desconhecido fica **desconhecido**, nunca zero. Termina quando cada número tiver página e data.
4. **Política de dados.** Encontre na fonte primária se o serviço treina com o conteúdo, quanto tempo retém e se isso muda entre grátis e pago. Classifique numa das categorias:

   | Categoria | Pode receber dados pessoais? |
   | --- | --- |
   | **Limpo por contrato** | Sim |
   | **Limpo após configuração** | Só depois de registrar qual opção ou parâmetro desliga o treino (por exemplo, `mip_opt_out=true` ou uma opção na conta) |
   | **Treina no grátis** | Não, no plano gratuito |
   | **Desconhecido** | Não, até a decisão do proprietário |

   Termina quando a categoria tiver uma citação curta da fonte e o país onde os dados ficam.
5. **Português.** Procure evidência explícita de pt-BR: lista de idiomas, vozes ou documentação. Termina quando houver evidência ou estiver marcado como "não confirmado".
6. **Encaixe técnico.**
   - **Conexão:** navegador direto com token efêmero emitido por uma rota do Next, ou chamada só pelo servidor.
   - **Limites da Vercel Hobby:** função de até 300 s; não intermediar WebSocket longo.
   - **Adaptador:** URL base compatível com OpenAI entra pelo adaptador `compatible` sem código; anote se precisa de campos extras no corpo.
   - **Chaves:** nenhuma chave vai ao navegador; use o cofre (`src/lib/ai/vault.ts`).

   Termina quando o caminho de integração tiver arquivos e rotas nomeados.
7. **Riscos.** Termos que proíbem produção, limites por IP somados na Vercel, exigência de cartão ou telefone, região da conta e transferência internacional pela LGPD. Termina quando cada risco tiver mitigação ou for motivo de descarte.
8. **Veredito.** Escreva uma linha no formato das tabelas de [`docs/PESQUISA_RECURSOS_IA_2026-10-05.md`](../../../docs/PESQUISA_RECURSOS_IA_2026-10-05.md), com veredito (**adotar**, **adotar após configuração**, **só sem dados pessoais** ou **descartar**) e o que o proprietário precisa fazer: criar a chave, ativar faturamento, desligar treino, declarar a privacidade no Mapa de recursos. Termina quando o proprietário puder agir sem outra pesquisa.

## Guarda-corpos

- Quem contrata, ativa faturamento, cria conta e marca declarações de privacidade é sempre o proprietário. Você prepara o caminho e explica.
- A política de dados vem antes do custo: uma peça mais barata que treina com dados pessoais fica fora das rotas pessoais.
- Uma assinatura de consumidor (ChatGPT, Claude, Gemini app) atende o próprio dono dentro dos termos do fornecedor. Ela vira motor da Jornada só por um programa oficial do fornecedor, testado e autorizado pelo proprietário.

## Referência

A linha de base de 05/10/2026 (voz ao vivo, ouvir e falar, modelos de texto grátis, matriz de privacidade) está em [`docs/PESQUISA_RECURSOS_IA_2026-10-05.md`](../../../docs/PESQUISA_RECURSOS_IA_2026-10-05.md). Ela serve de ponto de partida; confira de novo as páginas oficiais antes de decidir.
