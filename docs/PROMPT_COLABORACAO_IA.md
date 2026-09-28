# Jornada Plena — contrato de entrega para agentes

Atue como engenheiro responsável por uma aplicação real, não uma demonstração visual. Nenhum prompt garante capacidade equivalente entre modelos: o padrão é verificável por código, testes e evidências.

## Antes de editar

1. Confirme diretório, origin, branch, HEAD e estado do Git. Trabalhe apenas no Jornada Plena. Não reutilize dados, chaves ou configurações de outros projetos.
2. Leia AGENTS.md, o plano vigente, package.json e as implementações atuais. Não suponha versões ou capacidades pelo texto de um handoff.
3. Combine escopo e arquivos com o outro agente. Use branch isolada; não edite simultaneamente a mesma cópia. Não sobrescreva alterações alheias nem use push forçado.
4. Relate implementado, validado localmente, publicado e pendente separadamente.

## Definição de pronto

- Um botão deve executar a função anunciada. Texto “gravando” não substitui MediaRecorder; nome de arquivo não substitui upload; JSON de intenção não substitui gravação no banco.
- Só confirme sucesso após resposta bem-sucedida do armazenamento. Diferencie estado local aceito de sincronização confirmada.
- Dados reais devem persistir no destino correto, reaparecer após recarga e funcionar em outro dispositivo autenticado. localStorage/IndexedDB não são nuvem nem backup.
- Erros, limite de tamanho, perda de rede, quota, permissões negadas, concorrência e repetição de requisições devem ter tratamento explícito, sem mensagens de sucesso falsas.
- Nenhum dado pessoal, saldo fictício ou conclusão inventada deve ser inserido em contas reais. Exemplos pertencem exclusivamente à demonstração.
- Toda mudança de modelo exige validação de leitura/escrita/importação/exportação e proteção contra clientes antigos que removam campos desconhecidos.
- Preserve o layout aprovado. Uma agenda única; módulos usam as Áreas da Vida compartilhadas, não listas isoladas de categorias incompatíveis.

## Segurança e integrações

- Demo não lê nem escreve storage/cookies privados, não acessa APIs privadas e não oferece inputs de arquivo.
- Token de webhook autentica o transporte, não a pessoa. Exija associação verificada do remetente à conta, valide assinatura do provedor, recuse mensagens de grupos e eventos não suportados.
- Nunca use segredo padrão, token em query string ou comparação por substring. Credenciais apenas no servidor.
- Webhook precisa de idempotência durável, autorização por usuário, limites de uso e escrita atômica com revisão. Duplicatas não podem duplicar despesas. Exclusões exigem confirmação vinculada a um registro exato e com expiração.
- Não baixe URLs arbitrárias do payload. Mídia deve vir de endpoint verificado do provedor, com limites, timeout, validação de tipo e proteção contra SSRF/redirecionamentos.
- IA recebe apenas o contexto que o usuário escolheu enviar, com consentimento claro. Limite custo e tamanho. Sugestões não viram mutações automaticamente. Conteúdo de notas não é instrução privilegiada.
- Não declare serviços conectados sem OAuth/credenciais e teste real. Não ative gastos ou mensagens proativas sem provedor, destinatário, consentimento e orçamento definidos.

## Verificação obrigatória

1. Acrescente testes de regressão que falhariam antes da correção. Não reduza a cobertura nem altere expectativas apenas para obter verde.
2. Execute typecheck, testes unitários, build, Playwright e production gate com Node da versão do projeto. Registre comando, resultado e commit.
3. Teste mobile/desktop, teclado, demo, acesso negado, falha de rede, recarga, backup e concorrência. Axe sem violações não comprova conformidade WCAG completa.
4. Só publique após revisar diff e segredos. Valide o SHA do deploy e a funcionalidade, não apenas HTTP 200.
5. Entregue: alterações, arquivos, testes executados, limitações, dependências externas e rollback compatível com os dados.

Se algo depende de credencial, decisão ou acesso ausente, mantenha desabilitado com mensagem verdadeira e informe exatamente o que falta. Não simule conclusão.
