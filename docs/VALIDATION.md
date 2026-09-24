# Registro de validação — 24/09/2026

## Resultado local

- Build de produção e TypeScript passaram com Node 24.
- 39 testes unitários passaram.
- 13 cenários de bloqueio de produção passaram: configuração ausente/incorreta mantém acesso fechado; demo não abre no projeto privado; endpoints pessoais ficam indisponíveis na demo.
- 16 testes de navegador passaram: desktop, celular, acessibilidade automatizada, agenda, arquivo ICS, caderno, edição temporária, bloqueio de APIs e preservação de anotações anteriores.
- Capturas de desktop e celular foram revisadas localmente. Não são publicadas por padrão.
- O scanner do índice Git revisa os arquivos exatos para publicação. É uma barreira adicional, não uma garantia absoluta de ausência de segredos.

## Supabase: inspeção, não ativação

O projeto previsto foi conferido e estava saudável. O esquema público não continha tabelas do aplicativo nem migrações registradas. A identidade Google autorizada ainda não estava cadastrada. Nenhum usuário foi excluído, promovido ou alterado nesta etapa.

O Advisor indicou permissões de execução excessivas na função preexistente `public.rls_auto_enable()` e proteção contra senhas vazadas desativada. Antes de ativar o espaço privado, revisar a função, suas dependências e grants; concluir Google OAuth e desativar métodos antigos somente após validar recuperação e acesso. Referências: [funções privilegiadas acessíveis sem login](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [execução por usuários autenticados](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) e [proteção de senhas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

A migração local permanece pendente de aplicação e teste remoto. Os testes locais não comprovam OAuth real, RLS remoto ou salvamento autenticado na nuvem. As flags de acesso privado não devem ser ativadas com base somente neste relatório.

## Publicação

Demo publicada: https://faculdadepsicologia-demo.vercel.app

- Projeto independente, sem credenciais privadas; deployment `dpl_CVYrAgt32X1hYknxCfLeMpuSNEvn`, estado READY, produção da demo, código `ac01935`.
- 12 testes de navegador no endereço público passaram, em desktop e celular, sem autenticação na Vercel. Incluem verificação de que endpoints pessoais retornam 404 e que a demo não acessa armazenamento pessoal.
- Consulta de logs com nível error nos 10 minutos após a publicação não retornou registros. Não equivale a monitoramento contínuo ou garantia de disponibilidade.
- O vínculo local `.vercel/project.json` continua apontando para o projeto privado original; o deploy da demo usou o identificador explícito do projeto separado.
- O primeiro envio ao GitHub foi recusado por ausência da permissão OAuth `workflow`. O commit foi preservado localmente e a renovação da autorização foi iniciada. Não anunciar o código como publicado até confirmar o push.

O aplicativo pessoal existente não foi substituído por uma demo, e nenhum dado local das origens anteriores foi apagado. A demo não é destinada a armazenar informações reais.
