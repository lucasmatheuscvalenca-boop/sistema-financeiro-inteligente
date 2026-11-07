import { UNIVERSE_LABEL, type WorkspaceKind } from "@myoffice/core";
import { Badge } from "./Badge";

export function UniverseBadge({ kind }: { kind: WorkspaceKind }) {
  return <Badge tone={kind}>{UNIVERSE_LABEL[kind]}</Badge>;
}
