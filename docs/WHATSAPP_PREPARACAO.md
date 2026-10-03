# Preparar o WhatsApp da Jornada

Você confirmou que o número está no **WhatsApp Business do celular**. Isso identifica o app utilizado; a conta de API ainda precisa ser preparada e autorizada. Vamos começar com o ambiente de teste, mantendo seu número atual no app.

## Primeira etapa: sua conta da Meta

1. Abra [Meta Business Suite](https://business.facebook.com/) com a conta que administra seu negócio.
2. Confira o portfólio empresarial selecionado. Se não houver um, crie o portfólio da Jornada Plena com os dados reais do responsável.
3. Abra [Meta for Developers](https://developers.facebook.com/apps/). Conclua o cadastro de desenvolvedor se solicitado. Se já existir um app da Jornada, selecione-o; caso contrário, crie um app com o caso de uso do WhatsApp. Os nomes das telas podem variar conforme a conta.
4. No painel do app, abra **WhatsApp › Getting Started / Primeiros passos** ou a configuração de API apresentada para sua conta. Comece pelo número de teste fornecido pela Meta.
5. Anote os identificadores do app, da conta WhatsApp Business (**WABA ID**) e do número de teste (**Phone Number ID**). Eles identificam recursos; o token de acesso é uma credencial e deve ficar no campo protegido de configuração, quando a integração estiver preparada.
6. Envie um print da tela de configuração ocultando token, códigos de verificação e dados pessoais. Esse print permite confirmar o próximo passo sem adivinhar o que a Meta liberou para a sua conta.

A Cloud API exige portfólio empresarial, conta WhatsApp Business e número empresarial. A coleção oficial da Meta explica onde encontrar os recursos no painel. [Documentação oficial da Meta no Postman](https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api).

## Etapa técnica do projeto

Com o ambiente identificado, o código precisa implementar validação de assinatura de webhook, deduplicação dos eventos, vinculação do número à sua conta da Jornada e acesso aos anexos privados. Texto e áudio serão tratados pelo mesmo executor; pedidos de exclusão continuarão exigindo confirmação. A rota genérica atualmente permanece fechada: só cadastrar o número não liga o assistente.

Antes de usar o número atual, vamos avaliar o fluxo de coexistência entre app e API e sua elegibilidade. Essa opção não está confirmada para sua conta. A consulta direta à documentação de coexistência da Meta encontrou limite de acesso durante esta pesquisa; por isso esta orientação não garante que o fluxo aparecerá na sua tela. A configuração de teste é o primeiro resultado concreto a revisar.

## Chamadas

Receber mensagens de áudio e receber uma chamada ao vivo são integrações diferentes. Chamadas exigem suporte à Business Calling API e recursos elegíveis na conta. Primeiro conectaremos mensagens e fotos; depois validaremos autorização, disponibilidade e transporte de áudio antes de oferecer uma chamada pelo WhatsApp.

O acesso à plataforma também deve seguir os termos vigentes e as condições aplicáveis ao serviço e à região dos usuários. Os termos da plataforma tiveram atualização em 23 de setembro de 2026. A ativação de um assistente de IA precisa conferir também os termos adicionais da Meta; a instalação do app Business não comprova essa autorização. [Termos atuais do WhatsApp Business Platform](https://www.whatsapp.com/legal/WhatsApp-Terms-for-WhatsApp-Business-Platform).

## Agora

Prepare somente a tela de configuração do ambiente de teste e compartilhe o print sem credenciais. A publicação das melhorias de voz da Jornada não depende dessa etapa do WhatsApp.
