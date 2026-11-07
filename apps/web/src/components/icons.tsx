import {
  Activity,
  Bot,
  Brain,
  Briefcase,
  Building,
  ChartLine,
  Command,
  Compass,
  FlaskConical,
  Folder,
  FolderHeart,
  FolderKanban,
  GraduationCap,
  Handshake,
  House,
  LayoutGrid,
  Lightbulb,
  ListChecks,
  ListTodo,
  Megaphone,
  Package,
  Search,
  Settings,
  ShieldCheck,
  Target,
  Users,
  Wallet,
  Wrench,
  type LucideIcon,
} from "lucide-react";

/** Ícones das categorias (nomes guardados no banco, em kebab-case). Desconhecido → pasta. */
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  "folder-heart": FolderHeart,
  compass: Compass,
  wallet: Wallet,
  "graduation-cap": GraduationCap,
  search: Search,
  lightbulb: Lightbulb,
  "list-checks": ListChecks,
  "flask-conical": FlaskConical,
  target: Target,
  handshake: Handshake,
  megaphone: Megaphone,
  briefcase: Briefcase,
  settings: Settings,
  "chart-line": ChartLine,
  users: Users,
  package: Package,
  folder: Folder,
};

export function CategoryIcon({ name, className }: { name: string | null; className?: string }) {
  const Icon = (name && CATEGORY_ICONS[name]) || Folder;
  return <Icon className={className} aria-hidden="true" />;
}

export const NAV_ICONS: Record<string, LucideIcon> = {
  inicio: House,
  escritorio: Building,
  comando: Command,
  agentes: Bot,
  departamentos: LayoutGrid,
  projetos: FolderKanban,
  tarefas: ListTodo,
  memoria: Brain,
  ferramentas: Wrench,
  aprovacoes: ShieldCheck,
  monitoramento: Activity,
  configuracoes: Settings,
};
