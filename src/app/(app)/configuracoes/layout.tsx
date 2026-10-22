import { SettingsTabs } from "@/components/app/settings-tabs";
import { PageHeader } from "@/components/ui/misc";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Conta" title="Configurações" description="Seu perfil, seu mascote, o que o assistente lembra e o controle dos seus dados." />
      <SettingsTabs />
      {children}
    </div>
  );
}
