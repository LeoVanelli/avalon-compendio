import { getCollection, type CollectionEntry } from 'astro:content';
import categoryData from '../content/categories.json';

export type SectionSlug = string;
export type Entry = CollectionEntry<'entries'>;

export const sections: {
  slug: SectionSlug;
  title: string;
  subtitle: string;
  description: string;
  icon: string;
  index: number;
  template?: string;
  fields?: { key: string; label: string; type: string; options?: string[] }[];
}[] = categoryData.slice().sort((a,b) => a.index-b.index);

export function sectionFor(slug: string) {
  return sections.find((section) => section.slug === slug);
}

export function sitePath(path = '') {
  const base = import.meta.env.BASE_URL || '/';
  const baseWithSlash = base.endsWith('/') ? base : `${base}/`;
  const clean = path.replace(/^\/+/, '');
  return `${baseWithSlash}${clean}`;
}

export function entryPath(entry: Entry) {
  return sitePath(`${entry.data.section}/${entry.data.slug}/`);
}

export async function publishedEntries() {
  const entries = await getCollection('entries', ({ data }) =>
    data.published && data.status !== 'demonstracao' && sections.some((section) => section.slug === data.section)
  );
  return entries.sort((a, b) => a.data.title.localeCompare(b.data.title, 'pt-BR'));
}

export function resolveRelations(entries: Entry[], refs: string[]) {
  return refs
    .map((ref) => {
      const [section, ...path] = ref.split('/');
      const slug = path.join('/');
      return entries.find((entry) => entry.data.section === section && entry.data.slug === slug);
    })
    .filter((entry): entry is Entry => Boolean(entry));
}
