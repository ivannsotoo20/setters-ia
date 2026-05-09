'use client';

import {
  PromptBlockEditor,
  type PromptBlockEditorProps,
  type TenantOption,
} from '@/components/admin/prompt-block-editor';
import type { VersionRow } from '@/lib/actions/prompts';

interface Props {
  blockKey: string;
  tenantId: number | null;
  activeContent: string;
  activeVersion: number;
  draftContent: string | null;
  draftBaseVersion: number | null;
  tenants: TenantOption[];
  initialVersions: VersionRow[];
}

/**
 * Wrapper del editor del Cerebro (bloque global, tenant_id IS NULL). Pasa
 * textos personalizados al componente reutilizable.
 *
 * Mismo componente se reusa en /admin/tenants/[id] para Coach + Admin Overrides
 * (tenantId !== null) — ahí los textos del Dialog cambian para reflejar que
 * el cambio afecta solo a ese tenant.
 */
export function CerebroBlockEditor(props: Props) {
  const editorProps: PromptBlockEditorProps = {
    ...props,
    dialogTitle: 'Aplicar al Cerebro genérico',
    affectedDescription: `Esto guardará el contenido actual del editor como nueva versión activa del Cerebro. Afectará a TODOS los tenants productivos en el siguiente turno del motor.`,
    lockPreviewToTenant: false,
  };
  return <PromptBlockEditor {...editorProps} />;
}
