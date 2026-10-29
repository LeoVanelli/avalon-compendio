import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import matter from 'gray-matter';
import { migrateMarkdown } from './layout-migration-converters.mjs';

export const project = path.resolve(process.env.AVALON_EDITOR_ROOT || path.resolve(import.meta.dirname, '..'));
// Incrementado apenas quando os conversores automáticos mudam seu resultado.
export const migrationVersion = 3;
const entriesRoot = path.join(project, 'src/content/entries');
const layoutsRoot = path.join(project, 'src/content/layouts');
const stateFile = path.join(project, 'src/content/layout-migration-state.json');
const backupRoot = path.join(project, 'editor-backups/layout-migration');
const hash = (value) => createHash('sha256').update(value).digest('hex');
const sleepSafeStamp = () => `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;

async function markdownFiles(folder) {
  const found = [];
  let contents;
  try { contents = await fs.readdir(folder, { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return found; throw error; }
  for (const item of contents) {
    const file = path.join(folder, item.name);
    if (item.isDirectory()) found.push(...await markdownFiles(file));
    else if (item.isFile() && item.name.endsWith('.md')) found.push(file);
  }
  return found;
}

async function readState() {
  try {
    const state = JSON.parse(await fs.readFile(stateFile, 'utf8'));
    return state && typeof state.pages === 'object' && !Array.isArray(state.pages) ? state : { version: 1, pages: {} };
  } catch (error) {
    if (error.code === 'ENOENT') return { version: 1, pages: {} };
    throw new Error(`Estado de migração inválido; nenhum arquivo foi alterado: ${error.message}`);
  }
}

export async function planMigration(root = project) {
  const sourceRoot = path.join(root, 'src/content/entries');
  const destinationRoot = path.join(root, 'src/content/layouts');
  const statePath = path.join(root, 'src/content/layout-migration-state.json');
  let state;
  try {
    state = JSON.parse(await fs.readFile(statePath, 'utf8'));
    if (!state || typeof state.pages !== 'object' || Array.isArray(state.pages)) throw new Error('estrutura pages ausente');
  } catch (error) {
    if (error.code === 'ENOENT') state = { version: 1, pages: {} };
    else throw new Error(`Estado de migração inválido; nenhum arquivo foi alterado: ${error.message}`);
  }
  const files = await markdownFiles(sourceRoot);
  const pages = [];
  for (const markdownPath of files) {
    const relative = path.relative(sourceRoot, markdownPath).replaceAll('\\', '/').replace(/\.md$/, '');
    const markdownText = await fs.readFile(markdownPath, 'utf8');
    const parsed = matter(markdownText);
    const id = relative;
    const layoutPath = path.join(destinationRoot, `${relative}.json`);
    const previous = state.pages[id];
    let layoutText = null;
    try { layoutText = await fs.readFile(layoutPath, 'utf8'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }

    if (parsed.data.status === 'demonstracao') {
      pages.push({ id, status: 'demonstration', reason: 'Página de demonstração ignorada.' });
      continue;
    }
    if (layoutText !== null) {
      const currentHash = hash(layoutText);
      if (previous?.status === 'manual') {
        pages.push({ id, status: 'manual', reason: previous.reason || 'Preservada após edição administrativa.' });
      } else if (previous?.status === 'automatic' && previous.layoutHash === currentHash) {
        if ((previous.migrationVersion || 1) < migrationVersion) {
          const converted = migrateMarkdown(parsed.data.section, parsed.data.slug, parsed.content);
          if (converted) pages.push({
            id, status: 'ready-update', converter: `${parsed.data.section}/${parsed.data.slug}`,
            note: 'Atualização segura do layout que continua marcado como automático.',
            markdownPath, layoutPath, markdownHash: hash(markdownText), existingLayoutHash: currentHash,
            layout: converted.layout, layoutText: `${JSON.stringify(converted.layout, null, 2)}\n`,
          });
          else pages.push({ id, status: 'automatic', reason: 'Conversor atualizado não reconhece esta página; layout preservado.' });
        } else pages.push({ id, status: 'automatic', reason: 'Layout automático já migrado; sem alterações.' });
      } else if (previous?.status === 'automatic') {
        pages.push({ id, status: 'manual-modified', reason: 'O layout automático mudou desde sua criação; não será sobrescrito.', currentHash });
      } else {
        pages.push({ id, status: 'protected-existing', reason: 'Layout Puck pré-existente, sem marcador confiável de migração; preservado como manual.', currentHash });
      }
      continue;
    }
    if (previous) {
      pages.push({ id, status: previous.status === 'manual' ? 'manual-layout-missing' : 'review', reason: 'Há estado persistente, mas não existe layout; revisão manual necessária.' });
      continue;
    }
    const converted = migrateMarkdown(parsed.data.section, parsed.data.slug, parsed.content);
    if (!converted) {
      pages.push({ id, status: 'review', reason: 'Nenhum padrão semântico de alta confiança; Markdown original preservado.' });
      continue;
    }
    const layoutTextOut = `${JSON.stringify(converted.layout, null, 2)}\n`;
    pages.push({
      id, status: 'ready', converter: `${parsed.data.section}/${parsed.data.slug}`,
      note: converted.note, markdownPath, layoutPath,
      markdownHash: hash(markdownText), layout: converted.layout, layoutText: layoutTextOut,
    });
  }
  return { root, state, pages };
}

async function atomicWrite(file, text) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try { await fs.writeFile(temporary, text, 'utf8'); await fs.rename(temporary, file); }
  finally { await fs.rm(temporary, { force: true }); }
}

async function exists(file) {
  try { await fs.access(file); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

export async function applyMigration(root = project) {
  const plan = await planMigration(root);
  const toWrite = plan.pages.filter((page) => ['ready', 'ready-update'].includes(page.status));
  const stateChanges = plan.pages.filter((page) => ['protected-existing', 'manual-modified'].includes(page.status));
  const oldStateText = await fs.readFile(path.join(root, 'src/content/layout-migration-state.json'), 'utf8').catch((error) => error.code === 'ENOENT' ? null : Promise.reject(error));
  if (!toWrite.length && !stateChanges.length) return { plan, backups: null, migrated: 0 };

  const backupFolder = path.join(root, 'editor-backups/layout-migration', sleepSafeStamp());
  const manifest = { createdAt: new Date().toISOString(), entries: [] };
  await fs.mkdir(backupFolder, { recursive: true });
  for (const page of toWrite) {
    const relative = path.relative(root, page.markdownPath);
    const destination = path.join(backupFolder, relative);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(page.markdownPath, destination);
    manifest.entries.push({ id: page.id, source: relative, backup: path.relative(root, destination).replaceAll('\\', '/') });
    if (page.status === 'ready-update') {
      const layoutRelative = path.relative(root, page.layoutPath);
      const layoutBackup = path.join(backupFolder, layoutRelative);
      await fs.mkdir(path.dirname(layoutBackup), { recursive: true });
      await fs.copyFile(page.layoutPath, layoutBackup);
      manifest.entries.push({ id: page.id, existingLayout: layoutRelative, backup: path.relative(root, layoutBackup).replaceAll('\\', '/') });
    }
  }
  if (oldStateText !== null) {
    await fs.writeFile(path.join(backupFolder, 'layout-migration-state.json'), oldStateText, 'utf8');
    manifest.stateBackup = 'layout-migration-state.json';
  }

  const nextState = { version: 1, pages: { ...plan.state.pages } };
  for (const page of stateChanges) {
    nextState.pages[page.id] = { status: 'manual', reason: page.reason, layoutHash: page.currentHash, updatedAt: new Date().toISOString() };
  }
  for (const page of toWrite) {
    const source = await fs.readFile(page.markdownPath, 'utf8');
    if (hash(source) !== page.markdownHash) throw new Error(`${page.id}: o Markdown mudou durante a migração. Nenhum layout desta página foi escrito.`);
    if (page.status === 'ready') {
      if (await exists(page.layoutPath)) throw new Error(`${page.id}: um layout foi criado durante a migração. Ele foi preservado; rode o dry-run novamente.`);
    } else {
      const currentLayout = await fs.readFile(page.layoutPath, 'utf8').catch((error) => error.code === 'ENOENT' ? null : Promise.reject(error));
      if (currentLayout === null || hash(currentLayout) !== page.existingLayoutHash) throw new Error(`${page.id}: o layout automático mudou durante a migração e foi preservado.`);
    }
    await atomicWrite(page.layoutPath, page.layoutText);
    nextState.pages[page.id] = {
      status: 'automatic', converter: page.converter, migrationVersion, layoutHash: hash(page.layoutText),
      sourceHash: page.markdownHash, note: page.note, updatedAt: new Date().toISOString(),
    };
    manifest.entries.push({ id: page.id, layout: path.relative(root, page.layoutPath).replaceAll('\\', '/'), status: 'automatic' });
  }
  const statePath = path.join(root, 'src/content/layout-migration-state.json');
  await atomicWrite(statePath, `${JSON.stringify(nextState, null, 2)}\n`);
  manifest.entries.push({ state: path.relative(root, statePath).replaceAll('\\', '/') });
  await atomicWrite(path.join(backupFolder, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return { plan, backups: path.relative(root, backupFolder).replaceAll('\\', '/'), migrated: toWrite.length };
}

function report(plan) {
  const counts = Object.groupBy ? Object.groupBy(plan.pages, (page) => page.status) : plan.pages.reduce((groups, page) => {
    (groups[page.status] ||= []).push(page);
    return groups;
  }, {});
  const entries = Object.entries(counts).map(([status, pages]) => `${status}: ${pages.length}`).join(' · ');
  console.log(`Inventário: ${plan.pages.length} páginas · ${entries}`);
  for (const page of plan.pages) {
    if (page.status === 'ready') console.log(`PRONTA ${page.id} — ${page.note}`);
    else if (page.status === 'ready-update') console.log(`ATUALIZAÇÃO AUTOMÁTICA ${page.id} — ${page.note}`);
    else if (['protected-existing', 'manual-modified', 'review', 'manual-layout-missing'].includes(page.status)) console.log(`PRESERVADA ${page.id} — ${page.reason}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    if (process.argv.includes('--apply')) {
      const result = await applyMigration();
      report(result.plan);
      console.log(result.migrated ? `Migração aplicada: ${result.migrated} layouts. Backup: ${result.backups}` : 'Nenhuma escrita necessária.');
    } else {
      const plan = await planMigration();
      report(plan);
      console.log('Simulação concluída; nenhum arquivo foi alterado. Para aplicar, use: npm run migrate:layouts -- --apply');
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
