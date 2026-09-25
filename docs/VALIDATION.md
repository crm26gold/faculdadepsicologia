# Registro de validação — 24/09/2026

## Resultado local

- Build de produção e TypeScript passaram com Node 24.
- 39 testes unitários passaram.
- 13 cenários de bloqueio de produção passaram: configuração ausente/incorreta mantém acesso fechado; demo não abre no projeto privado; endpoints pessoais ficam indisponíveis na demo.
- 16 testes de navegador passaram: desktop, celular, acessibilidade automatizada, agenda, arquivo ICS, caderno, edição temporária, bloqueio de APIs e preservação de anotações anteriores.
- Capturas de desktop e celular foram revisadas localmente. Não são publicadas por padrão.
- O scanner do índice Git revisa os arquivos exatos para publicação. É uma barreira adicional, não uma garantia absoluta de ausência de segredos.

## Supabase: banco aplicado, login ainda pendente

O projeto previsto foi conferido e está saudável. Foram aplicadas as migrações `20260924205403_personal_workspace` e `20260925004423_restrict_internal_trigger`. Existem `app_owner` e `personal_workspaces`, ambas com RLS. A RPC pública usa um wrapper invoker e implementação privilegiada no esquema privado. A identidade Google autorizada ainda não está cadastrada. Nenhum usuário existente foi excluído ou promovido.

As permissões excessivas de `public.rls_auto_enable()` foram revogadas para PUBLIC, anon e authenticated, preservando o trigger. Nova consulta ao Advisor confirmou a remoção dos dois alertas. Permanece o alerta de [proteção de senhas vazadas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection); email/senha ainda está habilitado no provedor e deve ser revisto na configuração Google-only.

O teste remoto `supabase/tests/workspace_transaction.sql` passou: inserção, atualização, leitura, conflito de revisão, payload inválido e bloqueio de não proprietário. Foi executado em transação com rollback, inclusive do usuário sintético: nenhum registro de teste permaneceu. Uma verificação posterior confirmou zero proprietários e workspaces, preservando o usuário Auth preexistente. Isso verifica o banco, não equivale a login OAuth e salvamento pelo navegador.

O endpoint público de configurações Auth confirmou Google desativado. Produção privada recebeu URL/chave publicável do Supabase, identificação do proprietário em variável exclusiva do servidor, modo privado e flag de nuvem. `GOOGLE_AUTH_ENABLED=false` mantém o acesso fechado; o UUID real ainda precisa ser provisionado e fixado. Nenhuma chave administrativa foi adicionada e a demo não recebeu variáveis privadas.

## Publicação

Demo publicada: https://faculdadepsicologia-demo.vercel.app

- Projeto independente, sem credenciais privadas; deployment `dpl_CVYrAgt32X1hYknxCfLeMpuSNEvn`, estado READY, produção da demo, código `ac01935`.
- 12 testes de navegador no endereço público passaram, em desktop e celular, sem autenticação na Vercel. Incluem verificação de que endpoints pessoais retornam 404 e que a demo não acessa armazenamento pessoal.
- Consulta de logs com nível error nos 10 minutos após a publicação não retornou registros. Não equivale a monitoramento contínuo ou garantia de disponibilidade.
- O vínculo local `.vercel/project.json` continua apontando para o projeto privado original; o deploy da demo usou o identificador explícito do projeto separado.
- A autorização GitHub foi concluída e o push realizado. O CI do commit `dc64718` terminou com sucesso (run `36057335005`).

O aplicativo pessoal existente não foi substituído por uma demo, e nenhum dado local das origens anteriores foi apagado. A demo não é destinada a armazenar informações reais.

## Tentativa de atualização da produção privada

- Migrações e relatório enviados ao GitHub no commit `f2ad6b0`; 39 testes unitários, TypeScript e os 13 cenários de bloqueio passaram novamente.
- Sete variáveis foram configuradas somente em Production do projeto privado. A origem canônica foi conferida como `https://faculdadepsicologia-faculpsi.vercel.app` e corrigida na configuração.
- O deployment `dpl_Sgow8L8vFgScCgm3y8sXzSM1LzkG` ficou **BLOCKED**, confirmado pela API: a Vercel não reconheceu o autor do commit como autorizado no projeto. A CLI mostrava UNKNOWN e permanecia aguardando; não houve build concluído nem nova versão validada online.
- GitHub CLI e Vercel CLI identificam a conta `crm26gold`. Conferir a associação GitHub nas conexões da conta Vercel e a autorização dessa identidade no projeto antes de repetir a publicação. Não remover metadados de autoria para contornar a recusa.
- Após resolver a associação, publicar novamente para incorporar a origem corrigida e verificar HTTP, login Google, gravação e recarregamento entre dispositivos. Variáveis configuradas não significam aplicação já atualizada.
