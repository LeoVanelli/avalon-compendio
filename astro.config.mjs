import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

// Valores como “+5% em Força” são modificadores, não títulos de navegação.
function remarkNumericModifierParagraphs() {
  return (tree) => {
    const visit = (parent) => {
      for (const child of parent.children || []) {
        if (child.type === 'heading') {
          const text = (child.children || []).map((node) => node.value || '').join('').trim();
          if (/^[+−-]?\d+(?:[.,]\d+)?%\s+\S/.test(text)) {
            child.type = 'paragraph';
            delete child.depth;
          }
        }
        visit(child);
      }
    };
    visit(tree);
  };
}

// A prévia local usa /. Para publicar em username.github.io/avalon,
// configure ASTRO_BASE_PATH=/avalon no GitHub.
export default defineConfig({
  integrations: [react()],
  site: process.env.ASTRO_SITE_URL || 'https://exemplo.github.io',
  base: process.env.ASTRO_BASE_PATH || '/',
  markdown: { remarkPlugins: [remarkNumericModifierParagraphs] },
  output: 'static',
  build: { format: 'directory' },
});
