import { promises as fs } from 'node:fs';
import path from 'node:path';

/**
 * Sincroniza un cambio de `prompt_blocks.content` con el archivo `.md` fuente
 * correspondiente en `prompts/source/`. Mantiene la trazabilidad git que se
 * tiene desde el inicio del proyecto: BD es source-of-truth runtime, `.md` es
 * source-of-truth versionable + revisable en code review.
 *
 * Comportamiento:
 *   1. Mapping `block_key (+ tenantSlug)` → `path` predefinido.
 *   2. Si el archivo existe y tiene YAML frontmatter (`---\n...\n---\n`),
 *      preserva el frontmatter intacto y reemplaza solo el body.
 *   3. Si el archivo no existe, escribe `content` tal cual sin frontmatter
 *      (caso típico: coach/overrides nuevos que aún no estaban en el repo).
 *   4. Atomic write: escribe a `<file>.tmp` y rename (sobrevive crash mid-write).
 *
 * NO tira excepciones: devuelve `{ok:false, error}` si algo falla. El caller
 * (server action `applyDraft`) decide si mostrar warning sin bloquear el Apply
 * en BD (BD es source-of-truth runtime, .md es nice-to-have versionable).
 *
 * Plan: ~/.claude/plans/admin-edita-cerebro-coach-prefs-2026-05-09.md
 */

export interface WriteResult {
  ok: true;
  path: string;
  hadFrontmatter: boolean;
  created: boolean;
}

export interface WriteError {
  ok: false;
  error: string;
  path?: string;
}

export interface WriteBlockArgs {
  blockKey: string;
  content: string;
  /** null/undefined = bloque global (tenant_id IS NULL). */
  tenantId?: number | null;
  /** Requerido cuando tenantId está presente y el block_key es scoped a tenant. */
  tenantSlug?: string;
  /**
   * Override del root de las fuentes (default: `<repo>/prompts/source/`).
   * Útil para tests con tmp dirs.
   */
  promptSourceRoot?: string;
}

// Cerebro v5 (Sprint Iota, 2026-05-18): 2 bloques shared consolidados en
// prompts/source/core-v5/. Reemplazaron los 11 bloques v4.
const CORE_V5_MAPPING: Record<string, string> = {
  core_v5_base: 'core-v5/01-core.md',
  output_contract_v5: 'core-v5/02-output-contract.md',
};

/**
 * Bloques que NO se reescriben a .md fuente porque son auto-generados desde
 * estructura JSON (no hay fuente humana versionable):
 *   - trainer_prefs_v1: generado por `serializeTrainerPreferences()`.
 */
const SKIP_KEYS = new Set(['trainer_prefs_v1']);

function resolveDefaultRoot(): string {
  // En el panel Next.js (cwd = apps/panel), el repo está 2 niveles arriba.
  // En tests con CWD distinto, pasar `promptSourceRoot` explícito.
  return path.resolve(process.cwd(), '../../prompts/source');
}

/**
 * Resuelve el path absoluto del .md fuente para un block_key + tenantSlug dado.
 * Devuelve null si el bloque NO debe sincronizarse a .md (skip list).
 */
export function resolveSourcePath(args: {
  blockKey: string;
  tenantId?: number | null;
  tenantSlug?: string;
  promptSourceRoot?: string;
}): { path: string } | { skip: true } | { error: string } {
  if (SKIP_KEYS.has(args.blockKey)) return { skip: true };

  const root = args.promptSourceRoot ?? resolveDefaultRoot();

  // Bloques globales del Cerebro v5
  if (args.blockKey in CORE_V5_MAPPING) {
    if (args.tenantId != null) {
      return { error: `block ${args.blockKey} is global, but tenantId=${args.tenantId} provided` };
    }
    return { path: path.join(root, CORE_V5_MAPPING[args.blockKey]!) };
  }

  // Bloques scoped a tenant
  if (args.blockKey === 'coach_v5') {
    if (args.tenantId == null || !args.tenantSlug) {
      return { error: 'coach_v5 requires tenantId + tenantSlug' };
    }
    return { path: path.join(root, 'coach-v5', `${args.tenantSlug}.md`) };
  }

  if (args.blockKey === 'admin_overrides_v1') {
    if (args.tenantId == null || !args.tenantSlug) {
      return { error: 'admin_overrides_v1 requires tenantId + tenantSlug' };
    }
    return { path: path.join(root, 'admin-overrides', `${args.tenantSlug}.md`) };
  }

  return { error: `unknown block_key for source mapping: ${args.blockKey}` };
}

/**
 * Detecta si el contenido tiene YAML frontmatter al inicio (`---\n...\n---\n`).
 * Devuelve el frontmatter (incluyendo los `---`) y el body, o null si no hay.
 */
export function splitFrontmatter(text: string): { frontmatter: string; body: string } | null {
  // Acepta tanto LF como CRLF
  const normalized = text.replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) return null;
  const closeIdx = normalized.indexOf('\n---\n', 4);
  if (closeIdx < 0) return null;
  const frontmatter = normalized.slice(0, closeIdx + 5); // incluye `\n---\n`
  const body = normalized.slice(closeIdx + 5);
  return { frontmatter, body };
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function atomicWrite(target: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const tmp = `${target}.tmp.${process.pid}.${Date.now()}`;
  await fs.writeFile(tmp, content, 'utf8');
  // En Windows fs.rename falla si el destino existe — borramos primero.
  if (process.platform === 'win32' && (await fileExists(target))) {
    await fs.rm(target);
  }
  await fs.rename(tmp, target);
}

export async function writeBlockToSource(args: WriteBlockArgs): Promise<WriteResult | WriteError> {
  const resolved = resolveSourcePath({
    blockKey: args.blockKey,
    tenantId: args.tenantId,
    tenantSlug: args.tenantSlug,
    promptSourceRoot: args.promptSourceRoot,
  });

  if ('error' in resolved) {
    return { ok: false, error: resolved.error };
  }
  if ('skip' in resolved) {
    // No es un error: el caller debe ignorar silenciosamente trainer_prefs_v1.
    return { ok: false, error: `block ${args.blockKey} is generated, no source sync` };
  }

  const targetPath = resolved.path;

  try {
    let finalContent: string;
    let hadFrontmatter = false;
    const existed = await fileExists(targetPath);

    if (existed) {
      const existing = await fs.readFile(targetPath, 'utf8');
      const split = splitFrontmatter(existing);
      if (split) {
        hadFrontmatter = true;
        finalContent = split.frontmatter + args.content + (args.content.endsWith('\n') ? '' : '\n');
      } else {
        finalContent = args.content + (args.content.endsWith('\n') ? '' : '\n');
      }
    } else {
      finalContent = args.content + (args.content.endsWith('\n') ? '' : '\n');
    }

    await atomicWrite(targetPath, finalContent);
    return {
      ok: true,
      path: targetPath,
      hadFrontmatter,
      created: !existed,
    };
  } catch (err) {
    return {
      ok: false,
      error: (err as Error).message,
      path: targetPath,
    };
  }
}
