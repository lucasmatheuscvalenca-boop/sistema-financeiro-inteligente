import type { Metadata } from "next";
import { LegalPage, type LegalSection } from "@/components/app/legal-page";

export const metadata: Metadata = { title: "Termos de uso" };

const SECTIONS: LegalSection[] = [
  [
    "O que é o NEXO",
    [
      "Uma ferramenta de organização e planejamento financeiro pessoal: central financeira, orçamento, metas, reserva de emergência, patrimônio, aposentadoria, “Posso gastar?” e um assistente que explica seus números.",
      "O NEXO não é banco, instituição de pagamento, corretora nem consultoria de investimentos. Ele não movimenta dinheiro, não faz pagamentos nem transferências e não oferece crédito.",
    ],
  ],
  [
    "Sua conta",
    [
      "Cada conta é individual: dados, metas, memória e mascote não se misturam com os de outras pessoas.",
      "Você é responsável por manter sua senha em segredo e por encerrar sessões em aparelhos que não usa mais (Configurações › Privacidade e segurança).",
      "Outra pessoa só vê algo seu se você convidá-la para uma meta específica, e você pode revogar esse acesso a qualquer momento.",
    ],
  ],
  [
    "Cálculos, projeções e assistente",
    [
      "Os resultados dependem das informações que você cadastra ou importa. Dados incompletos ou desatualizados levam a resultados incompletos, e o app avisa quando percebe isso.",
      "Projeções e simulações são estimativas com premissas informadas na tela. Elas não são garantias de resultado nem recomendação individualizada de investimento.",
      "O assistente usa o mesmo motor de cálculo do app e não inventa saldos, mas pode se expressar mal. Antes de uma decisão importante, confira os números nas telas de origem.",
    ],
  ],
  [
    "Conexões bancárias e importação",
    [
      "Hoje os dados entram por cadastro manual, arquivos CSV/OFX ou pelo conector de demonstração, que é identificado como tal e não acessa bancos reais.",
      "O NEXO nunca pede nem guarda senha de banco. Uma conexão real por Open Finance só será oferecida com fornecedor autorizado e com o seu consentimento explícito, que poderá ser revogado.",
    ],
  ],
  [
    "Uso permitido",
    [
      "Use o NEXO para organizar a sua vida financeira ou a de quem autorizou você.",
      "Não tente acessar dados de outras contas, contornar limites de segurança, sobrecarregar o serviço ou usá-lo para atividades ilegais. Contas usadas assim podem ser suspensas.",
    ],
  ],
  [
    "Disponibilidade e seus dados",
    [
      "O NEXO está em fase inicial e pode mudar, ter falhas ou ficar indisponível por algum tempo. Mantenha cópias do que for importante: em Configurações › Privacidade e segurança você exporta todos os seus dados quando quiser.",
      "Você pode excluir a conta a qualquer momento; a exclusão apaga seus dados financeiros. O tratamento de dados está descrito no aviso de privacidade.",
    ],
  ],
  [
    "Mudanças nestes termos",
    ["Quando houver mudança relevante, ela será avisada no app antes de valer. Continuar usando o NEXO depois do aviso significa aceitar a nova versão."],
  ],
];

export default function TermsPage() {
  return (
    <LegalPage
      title="Termos de uso"
      intro="Regras de uso do NEXO em linguagem simples. Este texto descreve o funcionamento do software e não substitui termos revisados por profissional habilitado."
      updated="22/10/2026"
      sections={SECTIONS}
    />
  );
}
