/**
 * Módulos da navegação principal. `phase` indica em que fase do roadmap o módulo passa a funcionar;
 * enquanto isso a interface diz claramente que ele ainda não existe (nada de dados fictícios).
 */
export type ModuleScope = "user" | "workspace";

export interface NavModule {
  key: string;
  label: string;
  /** "user": visão do dono, consolidada; "workspace": dados de um universo. */
  scope: ModuleScope;
  phase: number;
  summary: string;
}

export const NAV_MODULES: readonly NavModule[] = [
  { key: "escritorio", label: "Escritório", scope: "user", phase: 2, summary: "Mapa em pixel art com salas, departamentos e personagens que refletem o estado real dos agentes." },
  { key: "comando", label: "Central de comando", scope: "user", phase: 4, summary: "Pedidos em linguagem natural ao Coordenador, que identifica o universo, planeja, delega e entrega." },
  { key: "agentes", label: "Agentes", scope: "workspace", phase: 3, summary: "Criar e configurar agentes sem programação: prompt, modelo, ferramentas, autonomia e limites." },
  { key: "departamentos", label: "Departamentos", scope: "workspace", phase: 2, summary: "Adicionar, renomear e reorganizar departamentos, ligados às salas do escritório." },
  { key: "projetos", label: "Projetos", scope: "workspace", phase: 4, summary: "Projetos com objetivo, responsáveis, etapas, prazos, documentos e resultados." },
  { key: "tarefas", label: "Tarefas", scope: "workspace", phase: 4, summary: "Kanban, lista, visão por agente e por projeto, com dependências e logs de execução." },
  { key: "memoria", label: "Memória", scope: "workspace", phase: 5, summary: "Documentos, busca textual e semântica, memórias por nível e fontes citadas." },
  { key: "ferramentas", label: "Ferramentas", scope: "workspace", phase: 6, summary: "Integrações com status real, credenciais cifradas e permissões por agente." },
  { key: "aprovacoes", label: "Aprovações", scope: "user", phase: 6, summary: "Ações sensíveis aguardando sua decisão: aprovar, rejeitar ou pedir alteração." },
  { key: "monitoramento", label: "Monitoramento", scope: "user", phase: 7, summary: "Indicadores reais: execuções, erros, tempo, tokens e custo, com filtros." },
  { key: "configuracoes", label: "Configurações", scope: "user", phase: 1, summary: "Perfil, universos e empresas." },
] as const;

export function findModule(key: string): NavModule | undefined {
  return NAV_MODULES.find((m) => m.key === key);
}

/** Módulos de workspace que ainda não têm página própria (mostram o aviso de fase). */
export function isPlannedModule(module: NavModule, currentPhase: number): boolean {
  return module.phase > currentPhase;
}

/** Fase entregue no código atual. Atualizada ao concluir cada fase. */
export const CURRENT_PHASE = 1;
