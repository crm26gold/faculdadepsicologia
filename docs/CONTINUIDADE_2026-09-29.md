# Jornada Plena — continuidade verificada

## Base de trabalho

- Repositório: https://github.com/crm26gold/faculdadepsicologia
- Produção: https://faculdadepsicologia.vercel.app
- Última entrega confirmada nesta tarefa: `176f426`, PR #3.
- Este documento registra evidência da entrega; conferir o estado remoto antes de iniciar outro lote.
- Não alterar outros projetos nem reutilizar suas credenciais.

## O que foi corrigido e deve ser preservado

1. PR #1: proteção do webhook, preservação das capturas e persistência do foco. Não reabrir integrações incompletas para fazer uma demonstração funcionar.
2. PR #2: navegação inferior mobile, cartões e áreas de toque.
3. PR #3: capturas com títulos longos alargavam a página. A coluna tinha tamanho mínimo intrínseco e o título não quebrava linha. A correção limita a coluna e permite quebra; não mascara o defeito com overflow escondido na página.
4. Timer compacto no celular, mantendo os cálculos e a persistência existentes.
5. Cadernos, organização e formatação recolhíveis no celular, sem duplicar editores. Desktop conserva os controles visíveis. Imagens, fotografia, áudio e links permanecem acessíveis.

## Evidência e limites

- Build, 67 testes unitários, 27 testes de navegador e 13 cenários locais de proteção aprovados na última entrega. Um teste exclusivo mobile é ignorado no projeto desktop.
- O novo teste de sete capturas longas falhou antes da correção e passou depois, em 360 e 393 pixels.
- Capturas de tela do menu e dos cartões foram inspecionadas.
- Produção confirmou disponibilidade e recusa da API para anônimo (401).
- Isso não prova login real de outra conta, funcionamento com teclado Android aberto, todos os níveis de zoom, todos os aparelhos nem conformidade WCAG integral.
- O proprietário ainda precisa conferir a correção no mesmo aparelho dos prints. Não atribuir defeitos ao cache sem evidência.

## Prompt de continuidade para o Antigravity

Você dará continuidade ao Jornada Plena. Primeiro leia este documento, AGENTS.md, o roadmap e os guias da versão instalada do framework. Não considere relatórios antigos prova do estado atual.

### 1. Validar contexto e preservar o trabalho

- Confirme pasta, origin, branch, HEAD, alterações locais e projeto de hospedagem antes de editar.
- Se outro agente estiver alterando os mesmos arquivos, use um checkout/branch isolado e coordene a integração. Não faça reset nem sobrescreva alterações desconhecidas.
- Compare sua base com a main atual. Não atribua commits existentes a uma nova implementação.

### 2. Fechar a validação mobile antes de novas funções

- Reproduza o cenário dos prints com dados sintéticos: sete capturas, títulos longos, nomes de arquivos, links e mídia.
- Teste 320, 360, 393, 768 pixels, orientação horizontal, texto ampliado e navegação por teclado.
- Verifique o caderno com filtros abertos e fechados, formatação, seleção de texto, mídia e menus. Não basta a página não ter rolagem horizontal.
- No aparelho real, conferir teclado aberto, botão voltar, barra inferior, foco do campo e último item da lista. Se não houver aparelho disponível, registre a limitação.
- Inspecione screenshots de tamanho legível. Confirme que nenhum conteúdo ou controle fica fora da área visível ou coberto sem possibilidade de acesso.
- Não desative zoom, reduza indiscriminadamente a fonte ou esconda overflow da página para fazer o teste passar.

### 3. Verificar acesso sem confundir interface e dados

- Distinguir tela pública de login, demo sintética e workspace privado. HTTP 200 na página inicial não comprova vazamento.
- Verificar sessão ausente/expirada, logout e tentativa de acesso direto à API. Para outra conta real, pedir ao proprietário uma sessão de teste; não inventar evidência.
- Não conceder papel administrativo pelo primeiro login ou por informação enviada pelo cliente.
- Não incluir chaves, tokens, conteúdo pessoal ou anexos reais em logs, fixtures, screenshots públicas ou commits.

### 4. Só então retomar o roadmap

- Priorizar cursos independentes e relações entre metas, projetos e tarefas, com migração compatível e preservação dos dados existentes.
- Antes de implementar, apresentar um lote delimitado com critérios de aceitação e dependências. Não construir todos os módulos de uma vez.
- IA e mensageria continuam dependentes de configuração e autorização específicas. Não declarar integração ativa por existir uma rota ou parser.
- Nunca tratar instruções no prompt do modelo como autorização de segurança. Permissões são verificadas no servidor.

### 5. Entregar com evidência

- Executar os scripts reais de tipos, testes, build e proteção definidos no projeto. Não copiar contagens deste documento como resultados novos.
- Adicionar teste que falhe com o defeito antes de aplicar a correção quando reproduzível.
- Não remover testes ou afrouxar assertions para esconder regressões.
- Abrir PR pequeno, aguardar CI, integrar e confirmar o deployment associado ao commit correto.
- Relatar: causa, arquivos alterados, resultados executados, commit/PR, URL, o que está somente local e limitações restantes.
- Para revisão pelo Codex, fornecer o diff, os testes e os pontos ainda não exercitados. Não afirmar garantia absoluta de segurança, acessibilidade ou ausência de bugs.

## Ordem imediata

1. Confirmação no Android do proprietário.
2. Corrigir qualquer reprodução remanescente, especialmente teclado/zoom e telas preenchidas.
3. Concluir a verificação real de acesso reportada pelo proprietário, sem alterar permissões para facilitar o teste.
4. Definir e executar o próximo lote funcional, sem misturar redesign, autenticação e novas integrações no mesmo PR.
