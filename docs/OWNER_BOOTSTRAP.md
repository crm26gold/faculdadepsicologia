# Primeiro login do proprietário

Quando o provedor Google já está configurado, mas ainda não existe UUID autorizado,
`APP_OWNER_BOOTSTRAP=true` permite exclusivamente iniciar e concluir OAuth.
Exige o projeto correto, URL/chave publicável, origem, e-mail autorizado e
`GOOGLE_AUTH_ENABLED=true`. Não funciona com UUID preenchido inválido nem na demo.

O callback valida a identidade Google e o e-mail verificado retornados pelo provedor,
encerra a sessão e mostra uma confirmação. Não cria app_owner, não grava workspace
e não concede permissões. A API continua exigindo configuração completa e UUID fixado.

Após o primeiro login, o operador deve conferir no Supabase Auth a identidade Google
verificada da conta explicitamente autorizada, provisionar somente esse UUID em
app_owner e APP_OWNER_USER_ID, desligar APP_OWNER_BOOTSTRAP e publicar novamente.
Nunca promover o primeiro usuário da lista, usar user_metadata como autoridade ou
inserir manualmente uma identidade Google simulada.

Google Cloud recebe como redirect URI o callback `/auth/v1/callback` do Supabase.
Supabase recebe como Redirect URL a origem canônica da aplicação + `/auth/callback`.
APP_ORIGIN deve coincidir com essa origem, sem barra final.
