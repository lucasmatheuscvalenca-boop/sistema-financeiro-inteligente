import type { Metadata } from "next";
import { GeneralSettings } from "../geral";

export const metadata: Metadata = { title: "Perfil" };

export default function ProfileSettingsPage() {
  return <GeneralSettings />;
}
