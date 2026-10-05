# Correções do assistente e administração — 05/10/2026

Escopo exclusivo: `crm26gold/faculdadepsicologia`, Supabase `uccoaebzmvocqwqljmul`, Vercel `faculdadepsicologia` / `faculpsi`. Base revisada: `81bf88a0661d95d7ef4fa99517c3143b118525e9`. Este documento complementa o relatório do Claude e registra a entrega atual; documentos anteriores permanecem históricos.

## Diagnóstico e decisões

O erro mostrado no celular indicava limite da própria Jornada. Uma API válida não elimina esse limite. Havia ainda tentativas duplicadas entre preparação de voz e conexão, erros de fornecedor confundidos com orçamento global e perda de microfone ao trocar de transporte antes da conexão.

As correções mantêm limites, cobram cada tentativa efetiva e informam a espera. No automático, cota de uma empresa permite outra empresa, sem insistir em outras chaves da mesma empresa. Nenhuma alteração concede créditos externos ou aumenta o orçamento configurado.

Não existe um protocolo de voz universal para todas as APIs: adaptadores implementados atendem Gemini Live, GPT-Live, ElevenLabs e xAI/Grok. Groq atende texto e transcrição. Novos serviços exigem adaptar sua capacidade e protocolo, mantendo a interface comum.

## Melhorias implementadas

- Painel de IA com cinco seções, busca, filtro de conexões cadastradas, estados de operação e diagnóstico. Exclusão explícita de chave principal ou extra mostra tarefas afetadas, pausa dependências diretas e limpa alternativas e seleção de transcrição do WhatsApp. A exclusão de chaves não exclui registros pessoais.
- Minhas chaves de IA por conta: cadastro após validação de acesso à lista de modelos, teste, pausa e remoção. Chaves cifradas no servidor e metadados limitados à própria pessoa. Consulta de modelos não garante crédito para gerar respostas.
- Seleção por fonte: APIs pessoais têm prioridade para texto e limites por conta; APIs do proprietário e da base também usam orçamento global. Voz do proprietário mantém a rota administrativa. Membros usam suas APIs pessoais compatíveis para voz. Base compartilhada fica desligada por padrão e atende apenas texto, com autorização de cada fonte presa à chave atual.
- Gemini só recebe dados pessoais com declaração de API paga, inclusive em rotas manuais, reservas e transcrição WhatsApp. A declaração é do proprietário/usuário; não é uma verificação automática de faturamento. [Termos atuais](https://ai.google.dev/gemini-api/terms).
- OAuth: consentimento mostra conta, domínio e retorno do aplicativo; entradas limitadas; registro com limites por origem e globais; reutilização de renovação revoga a família inteira. Nenhum nome autodeclarado é tratado como identidade verificada.
- MCP: confirmações destrutivas persistidas em Conversas e comprovantes idempotentes por `request_id`, com gravação atômica e nova verificação antes de confirmar. No Telegram, pedidos destrutivos são recusados com orientação correta para repetir no app; não é anunciada uma pendência que não foi salva.
- Telegram e WhatsApp resolvem a conta pelo vínculo verificado e escolhem credenciais dessa pessoa. Meu espaço oferece código e desvinculação do próprio telefone; QR e configuração da ponte ficam restritos ao proprietário.
- ElevenLabs: URL por conversa, sem gravação de áudio, com configuração de retenção e exclusão de transcrição. Exclusão programada pelo fornecedor não equivale a apagamento instantâneo; conversas antigas não foram removidas retroativamente.

## Revisão do relatório do Claude

Concordo com separar transporte de voz, núcleo de ações e assinatura de aplicativo via MCP; também com publicar código compatível antes das migrações. A implementação inicial precisava dos ajustes acima antes de ampliar para membros. OAuth, idempotência, confirmações e isolamento foram revisados no código e exercitados em testes; cadastro de API pessoal não usa o SQL ilustrativo do relatório sem validação.

Permanece deliberadamente fora desta entrega: excluir branches antigos, apagar backups, decidir `TERMS_VERSION`, conectar outro projeto ou ativar a base compartilhada automaticamente. As mudanças de interface existentes no checkout principal foram preservadas, sem incorporá-las a este PR.

## Verificação e publicação

Verificação local: build Next.js e TypeScript aprovados; 223 testes de domínio, 3 do protocolo da ponte e 13 cenários de bloqueio de produção. Quatro suítes SQL em Postgres 17.11 descartável e concorrência real de orçamento/OAuth aprovadas. Navegador: 112 casos passaram na execução ampla, três casos do painel passaram após adequar seletores ao fluxo atual e quatro casos foram ignorados por não se aplicarem ao dispositivo. Capturas de chaves no celular, inclusive tema escuro, revisadas; auditorias de acessibilidade e ausência de rolagem horizontal aprovadas nesses fluxos. Os testes usam contas sintéticas, respostas simuladas de fornecedores e microfone simulado; não comprovam qualidade ou crédito de uma chamada real.

Estado desta revisão: implementação preparada no branch `codex/assistant-hardening`. A entrega exige PR com CI verde, merge na main, deployment READY e depois aplicação sequencial das cinco migrações. Os nomes provisórios devem ser alinhados às versões atribuídas pelo Supabase e o stub atualizado em outro commit. Não usar `supabase db push` por causa do histórico legado divergente.

Aceite ainda necessário no aparelho: iniciar voz, ouvir, interromper, consultar e criar um registro, conferir que foi salvo e testar exclusão com confirmação. Também faltam login OAuth real de um assistente externo e vínculo/áudio de uma conta membro no telefone. QR ou testes simulados não concluem esses aceites.
