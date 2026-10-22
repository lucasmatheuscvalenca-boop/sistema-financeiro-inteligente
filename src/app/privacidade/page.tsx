import type { Metadata } from "next";
import { LegalPage, type LegalSection } from "@/components/app/legal-page";

export const metadata: Metadata = { title: "Aviso de privacidade" };

const SECTIONS: LegalSection[] = [
  [
    "Quais dados tratamos",
    [
      "Dados de conta: nome, e-mail e senha (guardada apenas como hash scrypt — nunca em texto).",
      "Dados financeiros que você informa ou importa: contas, cartões, movimentações, orçamentos, metas, patrimônio, dívidas e plano de aposentadoria.",
      "Respostas do briefing e itens de memória do assistente (declarados por você ou inferidos e confirmados por você).",
      "Conversas com o assistente, alertas, revisões e conquistas.",
      "Dados técnicos mínimos de segurança: sessões (com o navegador usado) e registros de auditoria. Endereços IP são guardados apenas como hash.",
    ],
  ],
  [
    "Para que usamos",
    [
      "Exclusivamente para calcular e apresentar sua situação financeira, simulações, alertas e respostas do assistente para você.",
      "Não vendemos dados, não exibimos publicidade e não usamos seus dados para oferecer crédito.",
    ],
  ],
  [
    "Onde os dados ficam",
    [
      "O app roda na Vercel (servidores em Washington, EUA) e o banco de dados é um PostgreSQL gerenciado pelo Neon (região us-east-1, EUA). Ou seja, os dados são armazenados fora do Brasil, com conexões cifradas (HTTPS/TLS).",
    ],
  ],
  [
    "Assistente com IA",
    [
      "Quando o modo com IA está ativo, o texto da sua pergunta, o histórico recente da conversa e os resultados das ferramentas de cálculo necessários para a resposta são enviados ao provedor do modelo de linguagem (Anthropic) para gerar a resposta.",
      "Sem a chave do provedor configurada, o assistente funciona em modo local e nada é enviado para fora.",
      "O assistente não executa transações nem altera seus dados financeiros.",
    ],
  ],
  [
    "Conexões bancárias",
    [
      "Nunca pedimos nem guardamos senha bancária. A autorização acontece no ambiente do banco ou do agregador de Open Finance.",
      "Guardamos o consentimento (escopos, finalidade, validade), o identificador da conexão cifrado e o histórico de sincronizações. Você pode revogar a qualquer momento e apagar os dados importados.",
    ],
  ],
  [
    "Compartilhamento",
    ["Só existe se você convidar alguém para uma meta específica. A pessoa vê apenas essa meta e seus aportes, e você pode revogar o acesso quando quiser."],
  ],
  [
    "Seus controles",
    [
      "Exportar todos os seus dados em JSON, corrigir informações, apagar itens de memória e conversas, encerrar sessões e excluir a conta com todos os dados — em Configurações › Privacidade e segurança.",
    ],
  ],
  [
    "Segurança",
    [
      "Isolamento por conta em todas as consultas, cookies de sessão httpOnly, limites de tentativas de login, cifragem de identificadores sensíveis e registro de auditoria.",
      "Nenhum sistema é invulnerável. O NEXO está em fase inicial, para uso pessoal e de pessoas convidadas: antes de ser oferecido ao público como serviço, a operação deve passar por revisão jurídica (LGPD), definição do controlador e do encarregado, política de retenção e testes de segurança independentes.",
    ],
  ],
];

export default function PrivacyNoticePage() {
  return (
    <LegalPage
      title="Aviso de privacidade"
      intro="Explicação em linguagem simples de como o NEXO trata seus dados. Este texto descreve o funcionamento do software e não substitui uma política jurídica revisada por profissional habilitado."
      updated="22/10/2026"
      sections={SECTIONS}
    />
  );
}
