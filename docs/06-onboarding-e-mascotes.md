# Onboarding e mascotes

## Fluxo

```
Criar conta ─► Boas-vindas ─► Escolha do mascote ─► Briefing (3 etapas) ─► Diagnóstico inicial ─► Painel
                                   │                     │
                                   │                     └─ “Terminar depois”: conclui com o que houver e leva ao painel
                                   └─ obrigatório: sem mascote não há acesso à área logada
```

1. **Criar conta** — nome, e-mail, senha (mín. 10 caracteres, letras e números) e aceite do aviso de privacidade.
2. **Boas-vindas** — explica o que vem a seguir e que dá para parar e voltar.
3. **Mascote** — os seis aparecem lado a lado, **nenhum pré-selecionado**. Ao clicar, a prévia mostra os 6 estados e uma mensagem de exemplo na voz do personagem. O botão só habilita depois da escolha (“Confirmar escolha: Capivara”). A escolha é validada no servidor contra o catálogo e protegida por chave estrangeira no banco.
4. **Boas-vindas personalizada** — já na etapa seguinte o mascote escolhido cumprimenta pelo nome (“Oi, Marina! … Sou a Capivara…”).
5. **Briefing** em três etapas, todas opcionais e com salvamento automático (rascunho a cada pausa de digitação):
   - *Sobre você*: nome preferido, ano de nascimento ou faixa etária, situação profissional, tipo de renda, composição familiar, dependentes, país/moeda, objetivos pessoais e profissionais.
   - *Situação financeira*: renda líquida, fontes e frequência, despesas essenciais e variáveis, dívidas, contas e cartões, reserva atual, investimentos, outros bens, compromissos futuros.
   - *Planos de vida*: objetivos de curto, médio e longo prazo, estilo de vida, viagens, compras, moradia, educação, independência financeira, idade e renda desejadas na aposentadoria, prioridades.
6. **Diagnóstico** — indicadores (sobra mensal, peso das despesas essenciais, comprometimento com dívidas, cobertura da reserva) com status e explicação, próximos passos e a lista do que ainda falta. Nada é presumido: campo vazio aparece como “sem dados”.

Depois do onboarding, tudo pode ser revisto em **Configurações › Meu perfil financeiro**, e objetivos declarados viram itens de memória “declarados”.

## Catálogo oficial

| Mascote | Título | Personalidade | Frase | Foco de comunicação |
|---|---|---|---|---|
| Lince | O Estrategista | inteligente, analítico, estratégico, observador | “Vamos tomar decisões melhores hoje para conquistar mais liberdade amanhã.” | análises, oportunidades, previsões, cenários e decisões fundamentadas em dados |
| Capivara | A Companheira | tranquila, acolhedora, paciente, equilibrada | “Um passo de cada vez. Consistência também é uma forma de riqueza.” | bem-estar financeiro, hábitos sustentáveis, equilíbrio e qualidade de vida |
| Coruja | A Conselheira | sábia, didática, analítica, cuidadosa | “Entender seu dinheiro é o primeiro passo para decidir melhor.” | educação financeira, explicações, riscos e planejamento de longo prazo |
| Polvo | O Organizador | organizado, versátil, prático, atento aos detalhes | “Vamos colocar tudo em ordem para você ter controle de verdade.” | contas, categorias, orçamento, compromissos e organização cotidiana |
| Raposa | A Estrategista | perspicaz, adaptável, ambiciosa, orientada a resultados | “Com a estratégia certa, seus objetivos ficam mais próximos.” | otimização de recursos, alternativas, simulações e metas ambiciosas |
| Guardião | O Consultor Digital | tecnológico, proativo, confiável, objetivo | “Estou acompanhando seu plano. Vamos agir antes que os problemas apareçam.” | monitoramento, alertas, prevenção e acompanhamento contínuo |

O catálogo é fechado: `src/mascots/catalog.ts`, a tabela `mascots` (migração) e um `CHECK` no banco aceitam exatamente esses seis identificadores.

## Estados visuais

| Estado | Quando aparece |
|---|---|
| Neutro | Telas informativas, configurações |
| Análise | Diagnóstico, assistente “consultando seus dados” |
| Orientação | Explicações e próximos passos |
| Celebração | Conquista desbloqueada, meta atingida, troca de mascote |
| Atenção | Alertas de atenção, “cabe mas consome a margem” |
| Alerta importante | Risco de saldo negativo, reserva abaixo do mínimo, “não recomendado” |

## O que a personalidade muda (e o que não muda)

- **Muda**: saudação, abertura e fechamento das mensagens, forma de celebrar, títulos de destaque do painel, textos de estado vazio (`src/mascots/voice.ts`).
- **Não muda**: números, vereditos, regras, alertas, ordem de prioridade e recomendações. Todas as vozes recebem os mesmos fatos do motor de cálculo. Há teste de integração que compara as respostas de mascotes diferentes para a mesma pergunta e exige os mesmos valores.

## Troca de mascote

Em **Configurações › Meu mascote**: mostra o atual com os 6 estados, permite experimentar e escolher outro. A troca grava a nova escolha e o histórico (`mascot_selections`) e não toca em nenhum outro dado — verificado no teste E2E (contas e lançamentos continuam iguais, a escolha persiste após sair e entrar).

## Multiusuário

Cada conta escolhe seu próprio mascote. Exemplo verificado em E2E: Ana escolhe o Lince e Bruno escolhe a Raposa; cada um vê apenas o próprio mascote e os próprios dados.
