# Lançamento comercial: o que já está pronto e o que fazer no dia

**Decisão do proprietário (13/10/2026):** até o lançamento, tudo é grátis. As pessoas convidadas usam a Jornada como se fossem pagantes, para treinar, desenvolver e ver o banco funcionando de verdade. Quando a cobrança começar, o proprietário é avisado e contrata o que for preciso. Esta lista existe para que esse dia não tenha surpresa.

Enquanto ninguém paga, a Jornada segue na Vercel Hobby e no Supabase Free. O Hobby não permite uso comercial, então o plano pago da Vercel entra **antes** da primeira cobrança.

## Já pronto

- **Piloto liberado:**
  - Administração › "Tudo liberado para todos (piloto gratuito)" (`platform_settings.open_access`).
  - Desligar esse botão é o que separa o grátis do Pro.
- **Planos na conta:**
  - `accounts.plan` (acadêmico ou pro), `plan_source` (grátis, pago ou cortesia), `pro_until`, `ai_credits` e `features`.
  - A Administração dá cortesia com validade a quem testou.
- **Ninguém se promove sozinho:**
  - Só a Administração muda o plano, e fica registrado em `admin_audit_log`.
  - Quando a cobrança existir, o aviso do Asaas também poderá mudar o plano.
- **Fotos reduzidas no aparelho antes do envio:** menos espaço no Supabase e menos tráfego.
- **Faxina automática:**
  - o histórico do pg_cron se apaga todo dia;
  - a lixeira descarta o que passou de 30 dias na próxima gravação da pessoa.

## A construir antes de abrir as vendas

1. **Cobrança pelo Asaas:** assinatura com Pix e cartão. Um aviso automático (webhook), com assinatura verificada, liga e desliga o Pro ([decisão de 30/09](VISAO_E_FUNDACAO_2026-09-30.md#planos)).
2. **Termos:** preço, direito de arrependimento de 7 dias (CDC art. 49), cancelamento dentro do app e aviso antes de renovar.
3. **Limites do plano grátis conferidos no servidor:** o que é Pro e a cota de IA por pessoa.
4. **Revisão jurídica:**
   - LGPD;
   - ECA Digital (Lei 15.211/2025). O público é 18+, mas calouros de 17 anos são possíveis.

## No dia (o proprietário recebe o passo a passo na hora)

1. **Vercel Pro:** cerca de US$ 20 por mês em 30/09; confira o valor no dia. Precisa vir antes da primeira cobrança.
2. **Supabase Pro:** cerca de US$ 25 por mês em 30/09. Traz backup diário, projeto que não pausa, proteção contra senhas vazadas e mais espaço. A previsão era ligar com os primeiros R$ 200 de receita, ou antes se o espaço apertar.
3. **Domínio próprio e Cloudflare**, se ainda não estiverem ligados ([guia](SEGURANCA_CACHE_CLOUDFLARE.md)).
4. **Conta do Asaas:** a chave do webhook vai para as variáveis da Vercel.
5. **Na Administração:**
   - desligar o "Tudo liberado";
   - manter as cortesias de quem testou, com a validade combinada.
