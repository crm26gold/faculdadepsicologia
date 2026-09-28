# Auditoria incremental — base c30389f

## Confirmado nesta revisão

- Checkout e origin conferidos; base limpa, c30389f. TipTap é **3.31.3**, não 2 como no handoff.
- O webhook tinha uma condição de token inválido sem retorno de erro, segredo padrão e respostas afirmando gravação inexistente.
- Captura rápida truncava o conteúdo em 100 caracteres antes de criar a nota.
- IndexedDB resolvia a escrita antes de confirmar a transação e ocultava erros.
- O editor de notas não recebia o indicador demo e podia persistir anexos locais nessa modalidade.
- Transcrição acrescentava resultados intermediários repetidamente; era ativada sem uma escolha explícita sobre envio ao serviço de fala do navegador.

## Correções deste lote

- Webhook fechado: demo 404, configuração ausente 503, credencial inválida 401. Bearer exato e comparação de tempo constante; sem token em URL, segredo padrão ou alegação de gravação. Mesmo com token válido, fica 503 até existir vinculação e pipeline persistente.
- Captura mantém todo o texto; título continua limitado separadamente.
- Escrita local só confirma no commit da transação IndexedDB; falhas chegam à interface.
- Demo bloqueia anexos no editor e não monta inputs de arquivo. Fallback IndexedDB limitado ao modo local, nunca à nuvem.
- Upload na nuvem não cria mais cópia automática de mídia privada no navegador.
- Transcrição opcional com aviso, apenas resultados finais; cleanup de gravação separado de mudanças no preview.

## Sequência para as integrações solicitadas (ainda não implementadas)

1. Definir provedor WhatsApp e verificar a assinatura oficial de entrega. Fixar associação número verificado → conta; o token do gateway não substitui essa associação.
2. Criar inbox persistente com ID externo único, estado, tentativas e expiração. Aplicar idempotência e escrita atômica com revisão do workspace, sem depender de navegador aberto. Não usar uma leitura seguida de sobrescrita irrestrita com service_role.
3. Implementar parser com datas/fuso explícitos e pedidos de esclarecimento. Consultas retornam dados reais. Mensagens repetidas não duplicam lançamentos. Exclusões exigem confirmação temporária de ID exato, não “último” reavaliado depois.
4. Áudios via identificadores/endpoints do provedor, não URLs arbitrárias. Autorização antes de download; limite, timeout, tipo e proteção SSRF. Escolher provedor de transcrição e orçamento.
5. `/api/transcribe`: sessão autenticada, origem, limite de bytes, timeout, quota persistente, consentimento de envio externo e erro recuperável. Nunca ativar como fallback silencioso.
6. `/api/ai/assistant`: contexto selecionado, modelo atual confirmado, limite de custo e saída validada. Resumos/flashcards são propostas revisáveis; não criar registros ou executar instruções presentes nas notas automaticamente.
7. Google Drive: OAuth individual de menor escopo, seleção explícita de arquivos, refresh token protegido, revogação e links duráveis. Microsoft Teams: confirmar conta/tenant e permissões Graph; webhook genérico não equivale a sincronização.
8. Alertas WhatsApp: consentimento, fuso, horários, opt-out, regras do provedor, fila e entrega idempotente. Não ativar envios proativos apenas por haver um cron.

## Pendências de decisão

- Provedor WhatsApp, conta/número e identidade verificável do remetente.
- Provedor de IA/transcrição e orçamento mensal autorizado. Não pedir segredos no chat; configurar no ambiente servidor.
- Conta/tenant Microsoft e conta Google para autorização dos conectores.

## Cuidados adicionais

- Novos campos (por exemplo flashcards) precisam de proteção de compatibilidade de clientes antigos. A geração 3 atual não distingue todos os formatos já publicados; revisar antes de novas migrações.
- JSON não contém os blobs IndexedDB nem copia os arquivos remotos. Não chamar esse export de backup completo de mídias.
- Contagens antigas de testes e sucesso HTTP não provam as integrações. Registrar a execução atual e não declarar conformidade WCAG completa só por Axe.
- Este documento não afirma publicação nem ativação de serviços externos.

## Evidências locais deste lote

- Node 24: 61 testes unitários aprovados (incluindo 3 novos testes de autorização do webhook).
- TypeScript e build Next.js aprovados.
- Playwright: 23 testes aprovados (incluindo regressão de texto longo após recarga).
- Gate de produção: 13 cenários; agora também verifica bloqueio do webhook sem autorização.
- OAuth real, entrega por WhatsApp, transcrição externa e persistência multi-dispositivo das integrações novas não foram exercitados.
