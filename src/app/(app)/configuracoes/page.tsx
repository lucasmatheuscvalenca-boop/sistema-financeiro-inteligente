import type { Metadata } from "next";
import { GeneralSettings } from "./geral";

export const metadata: Metadata = { title: "Configurações" };

/** No celular esta rota mostra a lista de seções (em SettingsTabs); o conteúdo de "Geral" fica em /configuracoes/perfil. */
export default function SettingsPage() {
  return (
    <div className="hidden sm:block">
      <GeneralSettings />
    </div>
  );
}
