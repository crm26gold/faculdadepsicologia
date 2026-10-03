# Jornada Plena: cache, abuso e proteção

Atualizado em 3 de outubro de 2026. Escopo: Faculdade, `crm26gold/faculdadepsicologia`, Supabase `uccoaebzmvocqwqljmul`, Vercel `faculdadepsicologia` / `faculpsi`.

## O que mudou no código

### Reduzir transferência de anexos privados

A rota anterior gerava um redirecionamento para uma URL assinada diferente a cada leitura. Tokens diferentes são chaves diferentes no CDN do Supabase, o que dificulta reutilizar a cópia. [Supabase Smart CDN](https://supabase.com/docs/guides/storage/cdn/smart-cdn).

A rota agora serve a mídia pela URL estável da anotação, com cache **privado no navegador**, ETag por dono/arquivo/versão e revalidação. Toda nova requisição verifica sessão e acesso ao objeto antes de retornar 304. Quando o navegador tem a mesma versão, a mídia não é baixada novamente do Storage. HEAD não transfere corpo; ranges simples permitem buscar trechos de áudio/vídeo. Esses controles seguem a [semântica de cache HTTP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Caching).

Conteúdo privado permanece fora do cache compartilhado da Vercel/Cloudflare. Sair da conta pede limpeza do cache HTTP em navegadores compatíveis, preservando as notas locais em IndexedDB. Isso não apaga cópias baixadas manualmente nem garante eliminação física do disco.

**Custo a medir:** a primeira transferência passa pela função Vercel, em streaming, e passa a contar também como transferência nessa hospedagem. Revalidações ainda fazem consultas pequenas de autenticação/metadados. A redução de Supabase egress é esperada para reaberturas com cache preservado; ainda não foi medida em tráfego real. Limpar o cache, trocar cookies/aparelho ou receber uma nova versão exige novo download.

### Limites persistentes por conta

Migração `20261003185709_jornada_request_limits.sql`, aplicada ao projeto correto. O banco decide os limites, em atualização atômica; o cliente não pode zerar contadores, escolher outra conta ou diminuir unidades. Apenas uma linha por conta e categoria, com exclusão em cascata junto à conta. Sem guardar mensagem, foto ou chave nos contadores.

| Categoria | Por minuto | Por dia UTC |
| --- | --- | --- |
| IA de texto/leitura/planejamento e testes administrativos | 40 pedidos | 400 pedidos |
| Início de chamada com provedor | 4 tentativas | 40 tentativas |
| Preparação de upload pelo site | 20 pedidos | 100 pedidos |
| Mídia transferida pela rota do site | 100 MiB | 1 GiB |

Reabrir uma cópia validada com 304 não consome a cota de bytes. Um download iniciado reserva o trecho inteiro; encerrar antes não devolve a reserva. Ao exceder um limite, a API retorna 429 com Retry-After.

### Limites compartilhados e consumo visível

A migração `20261003215642_jornada_global_budgets.sql` acrescenta reservas compartilhadas entre contas: mídia de 4 GB, 6.000 pedidos lógicos de IA, 300 novas chamadas e 1.000 preparações de upload nos últimos 31 dias, além dos limites por minuto/dia. Pedidos de IA e fotos no Telegram participam dos mesmos contadores e da cota da conta vinculada. O banco reserva as cotas individual e compartilhada na mesma transação curta; negativas não gastam nenhuma das duas. Somente o servidor, com prova verificada, admite consumo compartilhado; clientes autenticados não podem zerar contadores, escolher outra conta ou consumir a cota compartilhada diretamente pela RPC antiga.

O verificador da aplicação é independente da configuração do Telegram. Apenas o proprietário pode estabelecê-lo/rotacioná-lo, usando o hash derivado pelo servidor. Em **Administração → Inteligência artificial → Consumo e proteção**, o proprietário vê agregados e avisos a partir de 75%/90%, com atualização manual. Não há polling nem notificação por e-mail nesta etapa. Áudio e vídeo do caderno usam `preload="none"` para adiar transferência até reproduzir.

Os limites protegem reservas das rotas do aplicativo e não são o egress total nem um teto financeiro dos provedores. Acesso direto autorizado ao Storage, chamadas já abertas, múltiplas tentativas de modelo dentro do mesmo pedido, dados do banco/Auth, Storage acumulado e tráfego sem autenticação ainda têm consumo próprio. Os contadores novos começam na ativação, sem importar gastos anteriores. Detalhes e decisões de tecnologia estão em [OTIMIZACAO_CONSUMO_2026-10-03.md](./OTIMIZACAO_CONSUMO_2026-10-03.md).

### Fotos, comandos e arquivos

- Leitura de fotos no site/Telegram fica sem histórico/contexto pessoal e não tem autorização para produzir ações. O servidor descarta ações devolvidas nessa leitura. Um pedido posterior por voz/texto usa o executor normal. O original continua preservado.
- Executor aceita tipos/valores definidos pelo produto, sem SQL ou shell. Exclusão/substituição de nota exige confirmação específica; alterações usam revisão e resultados persistidos para evitar repetição.
- Sessão verificada, origem exata, corpos limitados, bucket privado e RLS por dono continuam obrigatórios.
- Bucket de anexos já limita tamanho a 25 MiB e MIME a imagens/áudios/vídeos permitidos. SVG, HTML, executáveis e compactados não são formatos de anexo.
- A rota verifica metadados e assinatura inicial do conteúdo antes de servi-lo; faz apenas uma leitura pequena de cabeçalho. A IA aceita imagem de até 4 MB e verifica os bytes. Extensão/MIME declarados não bastam.
- Respostas de mídia usam tipo permitido, nosniff, CSP restritiva e política de origem. A URL temporária do Storage permanece no servidor nessa rota.

Esses controles reduzem o impacto de conteúdo malicioso. A conferência do cabeçalho **não é antivírus** nem valida o conteúdo completo. Prompt injection não é resolvido por uma frase no prompt ou pelo firewall; limites de autoridade e validação de execução são necessários. Referências: [OWASP: prompt injection](https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html), [OWASP: upload de arquivos](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html).

## Cloudflare: próximo passo com o domínio próprio

Situação confirmada pelo usuário: domínio ainda será comprado. `faculdadepsicologia.vercel.app` é o endereço da Vercel; não temos controle do DNS de `vercel.app` para colocá-lo sob a conta Cloudflare. Nenhuma conexão Cloudflare foi ativada nesta etapa.

Quando tiver o domínio:

1. Informar **somente o nome do domínio**, sem senha ou token.
2. Adicionar a zona à conta Cloudflare e trocar os nameservers no registrador conforme os valores daquela zona. Essa etapa pode exigir seu login.
3. Adicionar o domínio ao projeto correto na Vercel. Usar os registros DNS indicados pelo painel do projeto; não copiar IPs antigos de um tutorial.
4. Começar com DNS only para validar domínio, certificado e login. Ajustar APP_ORIGIN, redirects autorizados do Supabase e atalhos do Telegram em conjunto.
5. Para ativar o proxy/WAF, conferir requisitos da Vercel Verified Proxy e usar TLS Full (strict) com certificado válido. A Vercel alerta que proxies externos afetam sinais do firewall; Cloudflare é um provedor reconhecido por Verified Proxy Lite. [Vercel: reverse proxy](https://vercel.com/docs/security/reverse-proxy).
6. Criar regras específicas, primeiro em observação, revisar eventos e validar no preview antes de bloquear em produção. APIs de voz, OAuth, uploads e webhook precisam continuar funcionando; desafios interativos em webhooks impedem o bot de entregar mensagens.
7. Preservar no-store para autenticação e APIs privadas. Cache Everything sobre essas rotas não é apropriado. Validar domínio, subdomínio e acesso direto ao endereço Vercel para identificar caminhos fora do proxy.

DNS only oferece o serviço de DNS; o proxy é necessário para aplicar as proteções HTTP da Cloudflare ao tráfego do hostname. [Cloudflare: status de proxy](https://developers.cloudflare.com/dns/proxy-status/).

## Fila de segurança após a publicação da voz

1. **Scanner de anexos:** quarentena privada, detecção completa/reprocessamento de imagens, status limpo/rejeitado, liberação só após inspeção. Avaliar serviço/região, custo e privacidade antes de enviar arquivos pessoais a terceiros.
2. **Limites dos canais externos e armazenamento:** Telegram já compartilha a cota da conta vinculada e a reserva global. Ainda faltam orçamento do WhatsApp, limite acumulado de Storage e medição das tentativas/minutos/tokens reais. Limites na aplicação não impedem todo acesso direto à infraestrutura.
3. **Proteção de ações e memória:** testes adversariais com documentos/notas antigas, plano comparado com pedido autorizado, escopos específicos para futuras integrações e revisão de memórias com fonte. A leitura isolada de fotos é a primeira etapa.
4. **Backup e restauração:** conferir recursos disponíveis no plano, exportação separada, retenção e testar recuperação em ambiente isolado. Proteção contra destruição também depende de conseguir restaurar; não há restauração comprovada nesta etapa.
5. **WAF e custos:** regras graduais, alertas de gasto/egress e acompanhamento dos resultados. Auditoria atual da CLI encontrou zero regras próprias e nenhum rascunho no projeto Vercel. DDoS da plataforma não equivale a todas as proteções da aplicação.

O advisor Supabase continua apontando as funções de bot com autorização por segredo, tabelas fechadas por padrão e proteção de senhas vazadas desativada. Também sinaliza a função de limites por usar SECURITY DEFINER para usuários autenticados: esse acesso é intencional, com identidade obtida da sessão, escopos/limites fixos e nenhum acesso direto aos contadores. Os testes cobrem tentativas de manipular essa autorização. Os avisos existentes precisam de revisão específica, sem revogar funções às cegas e interromper o bot.

## Verificação

Testes de mídia cobrem 304 sem novo download, outra conta, versão nova, ranges, arquivo falso, tamanho e limites de transferência. Teste de foto força retorno de uma ação válida do modelo e confere que nenhuma chega ao executor. SQL com rollback verifica limites individuais/compartilhados, janela de 31 dias, bytes acima de int32, autorização do servidor, painel exclusivo do proprietário e bot vinculado. CI também verifica concorrência real: 20 pedidos simultâneos de duas contas disputando cinco vagas. Gates de produção verificam bloqueio anônimo inclusive antes de 304; o teste do caderno confere que abrir/reabrir mídia não inicia download de áudio/vídeo.

Ainda testar no aparelho: abrir a mesma nota duas vezes e conferir mídia; reproduzir e avançar áudio/vídeo; sair/trocar conta; testar chamada real. Medir downloads e volume nas duas hospedagens para confirmar economia, antes de aumentar uso público.
