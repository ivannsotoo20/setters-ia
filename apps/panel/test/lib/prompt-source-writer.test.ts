import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  writeBlockToSource,
  resolveSourcePath,
  splitFrontmatter,
} from '@/lib/prompt-source-writer';

let tmpRoot: string;

beforeEach(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'panel-source-writer-'));
});

afterEach(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

describe('resolveSourcePath', () => {
  it('maps core_v4_base to 01-role.md', () => {
    const r = resolveSourcePath({ blockKey: 'core_v4_base', promptSourceRoot: tmpRoot });
    expect(r).toMatchObject({ path: path.join(tmpRoot, 'core-v4', '01-role.md') });
  });

  it('maps fase_3_v4 to 04-fase-3.md', () => {
    const r = resolveSourcePath({ blockKey: 'fase_3_v4', promptSourceRoot: tmpRoot });
    expect(r).toMatchObject({ path: path.join(tmpRoot, 'core-v4', '04-fase-3.md') });
  });

  it('maps coach_v3 with tenantSlug to coach-v3/<slug>.md', () => {
    const r = resolveSourcePath({
      blockKey: 'coach_v3',
      tenantId: 3,
      tenantSlug: 'ivan-dev',
      promptSourceRoot: tmpRoot,
    });
    expect(r).toMatchObject({ path: path.join(tmpRoot, 'coach-v3', 'ivan-dev.md') });
  });

  it('maps admin_overrides_v1 with tenantSlug to admin-overrides/<slug>.md', () => {
    const r = resolveSourcePath({
      blockKey: 'admin_overrides_v1',
      tenantId: 2,
      tenantSlug: 'montefit',
      promptSourceRoot: tmpRoot,
    });
    expect(r).toMatchObject({ path: path.join(tmpRoot, 'admin-overrides', 'montefit.md') });
  });

  it('returns skip for trainer_prefs_v1 (generated, no source)', () => {
    const r = resolveSourcePath({ blockKey: 'trainer_prefs_v1', promptSourceRoot: tmpRoot });
    expect(r).toEqual({ skip: true });
  });

  it('errors if global block has tenantId', () => {
    const r = resolveSourcePath({
      blockKey: 'core_v4_base',
      tenantId: 2,
      promptSourceRoot: tmpRoot,
    });
    expect(r).toMatchObject({ error: expect.stringMatching(/global/) });
  });

  it('errors if coach_v3 missing tenantSlug', () => {
    const r = resolveSourcePath({ blockKey: 'coach_v3', tenantId: 3, promptSourceRoot: tmpRoot });
    expect(r).toMatchObject({ error: expect.stringMatching(/tenantSlug/) });
  });

  it('errors on unknown block_key', () => {
    const r = resolveSourcePath({ blockKey: 'bogus_key', promptSourceRoot: tmpRoot });
    expect(r).toMatchObject({ error: expect.stringMatching(/unknown block_key/) });
  });
});

describe('splitFrontmatter', () => {
  it('returns null for content without frontmatter', () => {
    expect(splitFrontmatter('hello world\n')).toBeNull();
  });

  it('parses standard YAML frontmatter (LF)', () => {
    const text = '---\nblock_key: foo\nversion: 1\n---\nbody content here';
    const r = splitFrontmatter(text);
    expect(r).not.toBeNull();
    expect(r!.frontmatter).toBe('---\nblock_key: foo\nversion: 1\n---\n');
    expect(r!.body).toBe('body content here');
  });

  it('handles CRLF line endings', () => {
    const text = '---\r\nkey: value\r\n---\r\nbody';
    const r = splitFrontmatter(text);
    expect(r).not.toBeNull();
    expect(r!.body).toContain('body');
  });

  it('returns null for missing closing ---', () => {
    expect(splitFrontmatter('---\nkey: val\n')).toBeNull();
  });
});

describe('writeBlockToSource — global Cerebro blocks', () => {
  it('creates new file when target does not exist', async () => {
    const result = await writeBlockToSource({
      blockKey: 'output_contract_v4',
      content: '# Output contract\n\nNuevo contenido.',
      promptSourceRoot: tmpRoot,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.created).toBe(true);
      expect(result.hadFrontmatter).toBe(false);
      const written = await fs.readFile(result.path, 'utf8');
      expect(written).toContain('# Output contract');
      expect(written.endsWith('\n')).toBe(true);
    }
  });

  it('preserves existing YAML frontmatter when updating', async () => {
    const targetDir = path.join(tmpRoot, 'core-v4');
    await fs.mkdir(targetDir, { recursive: true });
    const existingPath = path.join(targetDir, '01-role.md');
    const existing =
      '---\nblock_key: core_v4_base\nversion: 1\nsort_order: 0\n---\n# Cerebro viejo\n\nContenido viejo.';
    await fs.writeFile(existingPath, existing, 'utf8');

    const newBody = '# Cerebro nuevo\n\nContenido nuevo con cambios.';
    const result = await writeBlockToSource({
      blockKey: 'core_v4_base',
      content: newBody,
      promptSourceRoot: tmpRoot,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.hadFrontmatter).toBe(true);
      expect(result.created).toBe(false);
    }
    const written = await fs.readFile(existingPath, 'utf8');
    expect(written).toContain('block_key: core_v4_base');
    expect(written).toContain('# Cerebro nuevo');
    expect(written).not.toContain('# Cerebro viejo');
    expect(written).not.toContain('Contenido viejo');
  });

  it('writes coach_v3 to coach-v3/<slug>.md', async () => {
    const result = await writeBlockToSource({
      blockKey: 'coach_v3',
      content: '## Coach Iván\n\nTest coach content.',
      tenantId: 3,
      tenantSlug: 'ivan-dev',
      promptSourceRoot: tmpRoot,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.path).toContain(path.join('coach-v3', 'ivan-dev.md'));
      const written = await fs.readFile(result.path, 'utf8');
      expect(written).toContain('## Coach Iván');
    }
  });

  it('writes admin_overrides_v1 to admin-overrides/<slug>.md (creates dir)', async () => {
    const result = await writeBlockToSource({
      blockKey: 'admin_overrides_v1',
      content: '# Overrides admin\n\nIván paga 500€/mes y prefiere cal.com.',
      tenantId: 3,
      tenantSlug: 'ivan-dev',
      promptSourceRoot: tmpRoot,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const adminDirExists = await fs
        .stat(path.join(tmpRoot, 'admin-overrides'))
        .then(() => true)
        .catch(() => false);
      expect(adminDirExists).toBe(true);
    }
  });

  it('returns ok:false for trainer_prefs_v1 (skip, generated)', async () => {
    const result = await writeBlockToSource({
      blockKey: 'trainer_prefs_v1',
      content: 'whatever',
      tenantId: 3,
      tenantSlug: 'ivan-dev',
      promptSourceRoot: tmpRoot,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/generated/);
    }
  });

  it('returns ok:false on unknown block_key (no source mapping)', async () => {
    const result = await writeBlockToSource({
      blockKey: 'bogus_key',
      content: 'noop',
      promptSourceRoot: tmpRoot,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/unknown block_key/);
    }
  });
});
