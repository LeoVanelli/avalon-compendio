import { readdir, readFile, stat } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../dist/', import.meta.url)));
const base = (process.env.ASTRO_BASE_PATH || '/').replace(/\/$/, '') || '';
const origin = 'https://avalon.invalid';
const htmlFiles = [];
const errors = [];
let checked = 0;

async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) await scan(path);
    else if (path.endsWith('.html')) htmlFiles.push(path);
  }
}
await scan(root);

for (const file of htmlFiles) {
  const html = await readFile(file, 'utf8');
  const relativeFile = relative(root, file).split(sep).join('/');
  const browserPath = `${base}/${relativeFile.replace(/index\.html$/, '')}`;
  const currentURL = new URL(browserPath, origin);

  for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const raw = match[1];
    if (raw.includes('${') || raw.startsWith('data:') || raw.startsWith('mailto:') || raw.startsWith('javascript:')) continue;
    let targetURL;
    try { targetURL = new URL(raw, currentURL); }
    catch { errors.push(`${relativeFile}: URL inválida ${raw}`); continue; }
    if (targetURL.origin !== origin) continue;

    const pathname = decodeURIComponent(targetURL.pathname);
    if (base && pathname !== base && !pathname.startsWith(`${base}/`)) {
      errors.push(`${relativeFile}: link sem base do repositório ${raw}`);
      continue;
    }
    const projectPath = pathname.slice(base.length).replace(/^\/+/, '');
    const initial = resolve(root, projectPath);
    if (initial !== root && !initial.startsWith(root + sep)) {
      errors.push(`${relativeFile}: caminho externo inválido ${raw}`);
      continue;
    }

    let target = initial;
    try {
      if ((await stat(target)).isDirectory()) target = resolve(target, 'index.html');
    } catch {
      if (!/\.[a-zA-Z0-9]+$/.test(projectPath)) target = resolve(target, 'index.html');
    }
    checked++;
    try {
      await stat(target);
      if (targetURL.hash && target.endsWith('.html')) {
        const fragment = decodeURIComponent(targetURL.hash.slice(1));
        const targetHtml = target === file ? html : await readFile(target, 'utf8');
        if (!targetHtml.includes(`id="${fragment}"`)) errors.push(`${relativeFile}: âncora ausente ${raw}`);
      }
    } catch {
      errors.push(`${relativeFile}: recurso não encontrado ${raw}`);
    }
  }
}

if (errors.length) {
  console.error(`\n${errors.length} referências inválidas:\n${errors.join('\n')}\n`);
  process.exitCode = 1;
} else {
  console.log(`OK: ${htmlFiles.length} páginas e ${checked} links/recursos internos verificados (incluindo rotas relativas e âncoras).`);
}
