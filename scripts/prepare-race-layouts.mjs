// Cria fichas visuais internas para raças com subraças explicitamente separadas.
// Preserva layouts existentes e cria apenas os que ainda não foram preparados.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { layoutForMarkdown } from './layout-defaults.mjs';

const project = path.resolve(import.meta.dirname, '..');
const source = path.join(project, 'src/content/entries/racas');
const dest = path.join(project, 'src/content/layouts/racas');
await fs.mkdir(dest, { recursive: true });
let prepared = 0;
for (const file of await fs.readdir(source)) {
  if (!file.endsWith('.md')) continue;
  const parsed = matter(await fs.readFile(path.join(source, file), 'utf8'));
  if (parsed.data.status === 'demonstracao') continue;
  const target = path.join(dest, file.replace(/\.md$/, '.json'));
  try { await fs.access(target); continue; } catch { /* ainda não existe */ }
  const layout = layoutForMarkdown('racas', parsed.data.slug, parsed.content);
  if (!layout.content.some((item) => item.type === 'Subrace')) continue;
  await fs.writeFile(target, JSON.stringify(layout, null, 2) + '\n', 'utf8');
  prepared++;
   console.log('Subraças estruturadas:', parsed.data.title);
}
console.log(`Layouts com subraças preparados: ${prepared}`);
