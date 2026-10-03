# Jornada Plena: qualidade, desempenho e controle de consumo

3 de outubro de 2026. Escopo exclusivo: `crm26gold/faculdadepsicologia`, Supabase `uccoaebzmvocqwqljmul`, Vercel `faculdadepsicologia` na equipe `faculpsi`.

## O que este incremento entrega

| Controle | Implementação | Limite da conclusão |
| --- | --- | --- |
| Cache privado | URL estável, ETag por conta/arquivo/versão, revalidação autorizada, 304, HEAD e ranges; já existente | Revalidação ainda consulta metadados; primeira abertura exige transferência; economia real precisa ser medida |
| Carregamento de mídia | Áudio e vídeo do caderno com `preload="none"`; imagens com carregamento tardio | O navegador interpreta preload como uma indicação; a reprodução continua baixando os trechos necessários |
| Orçamento compartilhado | Banco reserva cota individual e global atomicamente; limites por minuto/dia/31 dias | Conta reservas da aplicação, sem medir toda a fatura ou o egress da infraestrutura |
| Telegram | IA, transcrição e fotos usam a cota da conta vinculada e a reserva global | Texto transcrito e resposta contam separadamente; a validação com o bot real continua necessária |
| Painel do proprietário | Quatro agregados, avisos em 75%/90%, atualização manual e indicação de pausa | Sem polling ou alertas por e-mail; a consulta não mostra mensagens, identidades nem credenciais |
| Região das funções | `vercel.json` seleciona `gru1`, São Paulo, próximo do banco `sa-east-1` | Configuração deve ser confirmada no deployment; ganho de latência ainda não foi medido |

Este arquivo documenta o código e os critérios. A confirmação de publicação deve informar separadamente commit, CI, migração aplicada e deployment oficial.

## Reservas compartilhadas

| Categoria | Por minuto | Por dia UTC | Últimos 31 dias |
| --- | --- | --- | --- |
| Pedidos lógicos de IA | 80 | 600 | 6.000 |
| Novas chamadas com provedor | 8 | 30 | 300 |
| Preparações de upload | 40 | 100 | 1.000 |
| Bytes de mídia pelas rotas protegidas | 150 MB | 300 MB | 4 GB |

Valores de mídia são decimais: 4 GB = 4.000.000.000 bytes. Cotas individuais continuam valendo. A janela considera hoje e os 30 dias anteriores, sem zerar tudo na virada do mês. O dia UTC termina às 21h em São Paulo enquanto vigorar UTC−3.

O limite de 4 GB é uma margem inicial para transferências reservadas pelas rotas da Jornada. Não representa todo o egress do Supabase: banco, Auth, Storage direto e outros serviços também transferem dados. A infraestrutura separa categorias de saída e franquias; um acerto no CDN continua sendo consumo de egress em sua categoria. [Supabase: egress](https://supabase.com/docs/guides/platform/manage-your-usage/egress).

Os contadores começam na ativação. Não recuperam gastos anteriores nem diminuem o uso já acumulado no painel do provedor. Uma reserva aceita não é devolvida se a conexão terminar antes, evitando depender de confirmações manipuláveis do cliente. HEAD/304 não reservam bytes do corpo; consultas e cabeçalhos pequenos continuam tendo custo.

Uma categoria sem capacidade responde 429 com Retry-After, mantendo registros e outras funções disponíveis. A reserva bloqueia primeiro a linha global da categoria e depois a da conta, sempre nessa ordem e sem chamar serviços externos dentro da transação. Retenção é de até 31 contadores diários por categoria, sem histórico de eventos, fotos ou prompts.

A RPC antiga permanece individual. Admissão global exige sessão da conta e prova do servidor. O verificador da aplicação fica em tabela privada própria, independente da configuração do Telegram. Somente o proprietário pode estabelecê-lo/rotacioná-lo; o servidor faz isso ao abrir o painel ou, de forma limitada, na primeira operação do proprietário quando necessário. Falha de configuração mantém a função fechada. O bot valida seu próprio segredo e resolve a conta atualmente vinculada, sem aceitar UUID escolhido por uma mensagem.

## Operação pelo painel

1. Abrir a Jornada com a conta do proprietário.
2. Ir a **Administração → Inteligência artificial → Consumo e proteção**.
3. Conferir **Hoje (UTC)** e **Últimos 31 dias**. Usar **Atualizar consumo** para buscar uma nova leitura.
4. Em 75%/90%, comparar o ritmo de uso com o painel do Supabase/Vercel e com os provedores de IA. Os avisos aparecem quando este painel é consultado.
5. Se houver pausa, identificar a categoria e a janela. Antes de aumentar a cota por uma nova migração revisada, procurar repetição, acessos indevidos ou consumo legítimo crescente.

Quantidade de chamadas iniciadas não limita os minutos de uma chamada já aberta. Pedidos lógicos de IA não são tokens nem dólares: um pedido pode gerar várias tentativas de modelo. A implementação atual limita candidatos/tentativas e tamanhos, mas ainda precisa persistir usage de cada tentativa para um orçamento financeiro e de minutos/tokens. Alertas do provedor e uma trava global de faturamento precisam de configuração/validação separadas.

## Tecnologias pesquisadas e sequência escolhida

| Opção | Decisão e motivo |
| --- | --- |
| Cache HTTP privado no aparelho | Manter: reutiliza cópias com autorização/revalidação e não exige novo SDK. `no-cache` permite guardar e revalidar; `no-store` impede armazenamento. [MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Caching) |
| Adiar áudio/vídeo até reproduzir | Aplicado ao caderno sem recodificar o original. Evita antecipar downloads de vídeos que talvez nunca sejam vistos. [web.dev](https://web.dev/articles/fast-playback-with-preload) |
| Funções em São Paulo | Configurado em uma região, compatível com Hobby. A aproximação do banco tende a reduzir viagens de rede; precisa de medição. [Vercel: regiões de funções](https://vercel.com/docs/functions/configuring-functions/region), [lista de regiões](https://vercel.com/docs/regions) |
| Derivadas de imagem | Próxima etapa: miniatura para visualização e original preservado para recibos/OCR. Transformação hospedada do Supabase exige Pro ou superior; não foi ativada nem houve troca de plano. [Supabase: transformações](https://supabase.com/docs/guides/storage/serving/image-transformations) |
| Cache de prefixos de IA | Avaliar por modelo/API, mantendo instruções estáveis no início e medindo tokens cacheados. A OpenAI oferece cache de entrada em modelos suportados; parâmetros e preços variam. Isso não é memória da Jornada nem substitui fontes e histórico próprios. [OpenAI: prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching) |
| Fila durável no Postgres | Candidata para continuação dos trabalhos: Supabase Queues usa pgmq e persistência no banco. Exige consumidor, idempotência, retry limitado e avaliação da carga no plano Nano. [Supabase Queues](https://supabase.com/docs/guides/queues) |
| Fila gerenciada fora do processo da chamada | Alternativa: Vercel Queues, atualmente beta, entrega e repete mensagens após falhas. Executor precisa tratar repetição; avaliar custo/limites antes de adotar. [Vercel Queues](https://vercel.com/docs/queues) |

Nenhuma fila nova, plano pago ou dependência experimental foi ativada neste incremento. Pedidos já persistidos continuam usando a continuação limitada do servidor e a recuperação existente. O próximo avanço da continuidade é um consumidor durável com orçamento, backoff, prazo e limite de tentativas, preservando IDs e resultados da Jornada ao trocar o fornecedor.

## Qualidade como critério de aceitação

- Manter originais para leitura detalhada; miniaturas futuras não substituem comprovantes.
- Não reduzir automaticamente o modelo ou a precisão para fazer o contador parecer menor. Comparar fornecedores com os mesmos cenários de interrupção, ambiguidade, execução, segurança e latência.
- Registrar o total de uma compra de R$50 e manter preços individuais desconhecidos como ausentes. Uma nota da mesma compra pode corrigir; uma compra futura não prova os preços anteriores.
- Após falha ou troca de modelo, conferir o estado persistido antes de repetir qualquer ação. Exclusão/substituição continua exigindo confirmação específica.
- Contadores e logs operacionais não precisam de conversas, fotos, chaves ou dados pessoais para medir uso agregado.

## Validação

O gate SQL cobre cotas individuais e globais, duas contas, janela de 31 dias, expiração, bytes acima de int32, provas do servidor, bootstrap exclusivo do proprietário sem Telegram, acesso ao painel e cota do bot vinculado. O teste de concorrência roda exclusivamente no Postgres local descartável da CI: 20 transações reais disputam cinco admissões; negativas não aumentam contadores.

Os testes do navegador verificam painel em largura de celular, acessibilidade, atualização de avisos e ausência de downloads automáticos de áudio/vídeo ao abrir/reabrir o caderno. Os testes anteriores de mídia cobrem 304, outra conta, versões, ranges, formato e tamanho.

Ainda necessários no uso real: cache e bytes nas duas hospedagens, latência das funções, sessão autenticada de voz com resposta do provedor, custo/minutos/tokens, foto pelo bot e recuperação após fechar uma chamada. Publicação e testes automatizados não substituem essas medições.
