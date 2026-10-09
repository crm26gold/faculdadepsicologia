import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal/legal-page';

export const metadata: Metadata = { title: 'Privacidade · Jornada Plena' };

// Canal do titular: o proprietário preenche com um e-mail próprio, já criado e acompanhado
// (docs/PRIVACIDADE_OPERACAO.md). Enquanto estiver vazio, a página indica o contato do item 10.
const PRIVACY_CHANNEL: string = '';

export default function PrivacyPage() {
  return <LegalPage title="Política de privacidade">
    <p>Esta política explica, em linguagem simples, quais dados o Jornada Plena usa, por quê, com quem são compartilhados e como você exerce seus direitos pela Lei Geral de Proteção de Dados (LGPD, Lei 13.709/2018).</p>
    <h2>1. Dados que usamos</h2>
    <ul>
      <li><strong>Da sua conta Google:</strong> nome, e-mail e identificador da conta. Não recebemos sua senha.</li>
      <li><strong>O que você cria:</strong> seu espaço pessoal (matérias, anotações, anexos, agenda, finanças, rotina, metas), seus contatos, e o que você envia a salas e grupos.</li>
      <li><strong>Conversas do assistente:</strong> mensagens, transcrições, pedidos e resultados das conversas salvas na sua conta. Há também uma cópia neste navegador separada por conta; o histórico antigo só é enviado à nuvem quando você escolhe recuperá-lo e salvá-lo.</li>
      <li><strong>Registros de uso necessários:</strong> datas de criação e alteração, aceite destes termos e, para a administração, histórico de ações administrativas.</li>
    </ul>
    <h2>2. Para que usamos</h2>
    <p>Para funcionar: guardar seu espaço, organizar salas e trabalhos, mostrar a cada pessoa apenas o que ela pode ver. A base legal é a execução do serviço que você solicitou (LGPD, art. 7º, V) e, quando indicado, o seu consentimento.</p>
    <h2>3. Quem vê o quê</h2>
    <ul>
      <li><strong>Seu espaço pessoal e seus contatos:</strong> só você. Nem a administração tem acesso pelo sistema.</li>
      <li><strong>Salas e grupos:</strong> quem participa daquele espaço e quem o orienta. O e-mail das pessoas aparece apenas para quem gerencia a sala.</li>
      <li><strong>Administração:</strong> vê nome, e-mail, plano e em quais salas cada conta participa, para gerenciar acessos.</li>
    </ul>
    <p>A separação é garantida no banco de dados, não apenas na tela.</p>
    <h2>4. Onde ficam os dados</h2>
    <p>Usamos provedores de infraestrutura (Supabase, para banco de dados e arquivos, com servidores em São Paulo; e Vercel, para hospedagem). Eles processam os dados em nosso nome e com medidas de segurança.</p>
    <p>Para evitar downloads repetidos, imagens, áudios e vídeos privados podem ficar no cache deste navegador. O acesso é conferido ao carregar o anexo. Ao sair da conta, pedimos ao navegador que limpe esse cache, quando ele oferece suporte. Contadores de uso por conta ajudam a limitar abuso de IA, uploads e transferências; não contêm o conteúdo das conversas ou dos arquivos.</p>
    <p>Se você conectar o Google Agenda (opcional, na Agenda), compromissos, prazos e aulas de uma semana atrás a quatro meses à frente (título, data, horário, local e tipo; nunca anotações) são copiados para uma agenda “Jornada Plena” na sua conta Google, sob os termos do Google. A Jornada só alcança essa agenda e guarda a autorização cifrada. Ao desconectar ou excluir a conta, apagamos essa agenda no Google e revogamos a autorização.</p>
    <p className="legal-version">Acréscimo de 8 de outubro de 2026: Google Agenda opcional. Nada muda para quem não conecta.</p>
    <p>Avisos (opcionais, só quando você escolhe Avisar ou pede ao assistente): na hora marcada, o título e o horário do compromisso vão para você pelos canais que você ligou em Meu espaço › Avisos. A notificação do app passa pelo serviço de notificações do seu navegador (Google, Apple ou Mozilla), cifrada até o aparelho; o Telegram e o WhatsApp entregam pela conversa que você vinculou. Nos compromissos com o Google Agenda conectado, o próprio Google também avisa. Guardamos a hora, a intensidade e se cada canal entregou, nunca o texto enviado.</p>
    <p className="legal-version">Acréscimo de 9 de outubro de 2026: avisos opcionais. Nada sai para quem não liga um aviso.</p>
    <h2>5. Inteligência artificial</h2>
    <p>Quando recursos de IA forem ativados (por exemplo, para revisar um trabalho de grupo), você será avisado antes sobre qual conteúdo é enviado e para qual provedor. Não usamos seus dados para treinar modelos e não vendemos dados.</p>
    <p>Na chamada do assistente, o áudio é enviado ao provedor de voz configurado. A Jornada não guarda a gravação; a transcrição fica na sua conversa. Com ElevenLabs, a gravação é desativada e a exclusão do áudio e da transcrição no provedor é solicitada com retenção programada de zero dias para novas conversas. Essa exclusão depende do processamento do provedor e não equivale a retenção zero instantânea. A configuração não apaga retroativamente conversas anteriores.</p>
    <p>Pedidos autorizados e seus resultados ficam na sua conta para acompanhar a execução mesmo depois de encerrar a chamada. Fotos enviadas ficam em anotações privadas e, quando você pede leitura, são processadas pelo provedor de IA configurado. Ao usar os bots vinculados, Telegram e WhatsApp também processam mensagens e anexos. As políticas dos provedores se aplicam aos dados enviados. Suas chaves pessoais são cifradas no servidor, podem ser pausadas ou excluídas e não são compartilhadas com outras contas. A base de IA da administração só atende outras pessoas quando há autorização explícita para o compartilhamento e para as conexões utilizadas.</p>
    <p>Assistentes conectados à sua conta (Claude, ChatGPT e outros, pelo MCP) recebem os dados que leem, sob os termos da conta que você usa neles. A conexão vale só para a sua conta e pode ser revogada em Meu espaço → Conectar assistentes (MCP). O recibo de cada pedido feito por eles fica 90 dias, para evitar repetição e permitir desfazer: pelo assistente, a última ação nas primeiras 24 horas; na mesma tela, em “O que os assistentes fizeram”, qualquer alteração desse período que ninguém tenha mudado depois.</p>
    <p>O que você exclui do espaço pessoal, pela tela ou por um assistente, fica na lixeira por 30 dias, até 2 MB por conta (os mais antigos saem primeiro). Só você vê a lixeira; em Minha conta → Lixeira você restaura ou apaga de vez. A exclusão da conta também apaga a lixeira.</p>
    <p>Em Assistente → Conversas você pode exportar ou excluir uma conversa e o histórico dos pedidos ligados a ela. Os registros que ela criou na agenda, nas notas e nas finanças continuam no seu espaço e podem ser editados ou excluídos separadamente. “Baixar todos os meus dados” inclui as conversas sincronizadas e os pedidos; a exclusão da conta também os apaga.</p>
    <h2>6. Melhoria do sistema</h2>
    <p>Para evoluir o Jornada Plena usamos apenas estatísticas anônimas (por exemplo, quantos trabalhos foram criados), nunca o conteúdo das suas anotações ou trabalhos.</p>
    <h2>7. Seus direitos</h2>
    <ul>
      <li><strong>Acessar e levar seus dados:</strong> em Meu espaço → Minha conta → “Baixar todos os meus dados”.</li>
      <li><strong>Corrigir:</strong> você edita seus dados diretamente no sistema.</li>
      <li><strong>Excluir:</strong> em Minha conta → “Excluir minha conta”. Apagamos seu espaço pessoal, anexos, contatos e participação nas salas. O que você já entregou a um trabalho de grupo permanece no trabalho, identificado como “Ex-membro”, pois é parte da entrega coletiva de outras pessoas.</li>
      <li><strong>Revogar o consentimento</strong> a qualquer momento, excluindo a conta.</li>
    </ul>
    <h2>8. Dados de terceiros</h2>
    <p>Na sua agenda de contatos você pode guardar dados de pessoas que não usam o sistema. Guarde apenas o necessário, para uso pessoal. Esses dados não são cruzados com contas nem mostrados a ninguém.</p>
    <h2>9. Menores de idade</h2>
    <p>O serviço é voltado a estudantes do ensino superior e profissionais. Menores de 18 anos devem usar com autorização dos responsáveis.</p>
    <h2>10. Contato</h2>
    <p>Para pedidos sobre seus dados, fale com a administração do Jornada Plena pelos canais da sua turma.</p>
    <section aria-labelledby="pedidos-e-incidentes">
      <h2 id="pedidos-e-incidentes">11. Como fazer um pedido e o que acontece num incidente</h2>
      <p className="legal-version">Acréscimo de 6 de outubro de 2026. Detalha como exercer os direitos do item 7 e o que fazemos num incidente de segurança. Não muda quais dados usamos nem para quê.</p>
      <p>A maior parte dos pedidos você resolve na hora, dentro do sistema:</p>
      <ul>
        <li><strong>Acesso e cópia:</strong> Meu espaço → Minha conta → “Baixar todos os meus dados” gera um arquivo com o que está na sua conta.</li>
        <li><strong>Correção:</strong> edite o item onde ele está. O nome exibido muda em Minha conta; nome e e-mail vindos do Google são corrigidos na própria conta Google.</li>
        <li><strong>Exclusão:</strong> Minha conta → “Excluir minha conta”, como explica o item 7.</li>
      </ul>
      <p>Para o que o sistema não faz sozinho, como confirmar se tratamos seus dados, saber com quem foram compartilhados, revogar uma autorização, pedir a exclusão sem conseguir entrar na conta ou fazer uma reclamação, escreva para {PRIVACY_CHANNEL ? <a href={`mailto:${PRIVACY_CHANNEL}`}>{PRIVACY_CHANNEL}</a> : 'a administração do Jornada Plena, pelo contato do item 10'}. Para proteger seus dados, respondemos no e-mail da sua conta Google.</p>
      <h3>Prazos</h3>
      <ul>
        <li>Confirmamos o recebimento em até 5 dias úteis.</li>
        <li>Respondemos por completo em até 15 dias, o prazo da LGPD (art. 19) para confirmar e dar acesso aos dados. Se não pudermos atender, explicamos o motivo, como um registro que a lei obriga a guardar.</li>
      </ul>
      <h3>Incidente de segurança</h3>
      <p>Se um incidente puder ter atingido dados pessoais:</p>
      <ul>
        <li><strong>Contemos e avaliamos:</strong> interrompemos o problema e verificamos quais dados e contas foram atingidos e qual é o risco para as pessoas.</li>
        <li><strong>Comunicamos:</strong> quando houver risco ou dano relevante, avisamos a Autoridade Nacional de Proteção de Dados (ANPD) e as pessoas afetadas em até três dias úteis (Resolução CD/ANPD nº 15/2024). O aviso diz o que aconteceu, quais dados, o que já fizemos e o que você pode fazer.</li>
        <li><strong>Registramos:</strong> todo incidente fica registrado por pelo menos cinco anos, mesmo quando não precisa ser comunicado.</li>
      </ul>
      <p>Você também pode apresentar uma reclamação diretamente à ANPD, pelo site <a href="https://www.gov.br/anpd/pt-br">gov.br/anpd</a>.</p>
    </section>
  </LegalPage>;
}
