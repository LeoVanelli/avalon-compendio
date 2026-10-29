import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const entries = defineCollection({
  loader: glob({ base: './src/content/entries', pattern: '**/*.md' }),
  schema: z.object({
    // O schema ainda lê fichas de prévias antigas, mas elas não são publicadas.
    // As categorias vêm dos metadados e não ficam restritas a um enum.
    section: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    slug: z.string(),
    title: z.string(),
    eyebrow: z.string().optional(),
    summary: z.string(),
    tags: z.array(z.string()).default([]),
    // Marcadores da ficha são curtos e visuais; as tags continuam servindo à busca.
    badges: z.array(z.string()).default([]),
    stats: z.array(z.object({
      label: z.string(),
      value: z.string(),
      tone: z.enum(['neutral', 'bonus', 'penalty']).default('neutral'),
    })).default([]),
    searchTerms: z.array(z.string()).default([]),
    facts: z.array(z.object({ label: z.string(), value: z.string() })).default([]),
    related: z.array(z.string()).default([]),
    cover: z.string().optional(),
    coverAlt: z.string().optional(),
    coverApproved: z.boolean().default(false),
    // Somente para exemplificar o espaço da imagem antes da aprovação do dono.
    coverPreview: z.boolean().default(false),
    featured: z.boolean().default(false),
    status: z.enum(['referencia', 'confirmado', 'demonstracao']).default('referencia'),
    sourceDocument: z.string().optional(),
    published: z.boolean().default(true),
    updatedAt: z.string().optional(),
    editorialState: z.enum(['rascunho', 'revisao', 'aprovado']).default('revisao'),
    customFields: z.record(z.string(), z.unknown()).default({}),
  }),
});

export const collections = { entries };
