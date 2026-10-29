import type { PageLayout } from '../puck/config';

// Importação estática: o Astro inclui os JSONs no build do GitHub Pages.
// Arquivos novos são descobertos automaticamente na próxima compilação.
const layouts = import.meta.glob<{ default: PageLayout }>('../content/layouts/**/*.json', { eager: true });

export function visualLayout(section: string, slug: string): PageLayout | null {
  const key = `../content/layouts/${section}/${slug}.json`;
  return layouts[key]?.default || null;
}

export function homeLayout(): PageLayout | null {
  return layouts['../content/layouts/inicio.json']?.default || null;
}
