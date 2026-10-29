import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';

const project = path.resolve(import.meta.dirname, '../..');
const entriesRoot = path.join(project, 'src/content/entries');

async function markdownEntries(section) {
  const result = [];
  async function scan(directory, prefix = '') {
    for (const item of await readdir(directory, { withFileTypes: true })) {
      const relative = path.join(prefix, item.name);
      const absolute = path.join(directory, item.name);
      if (item.isDirectory()) await scan(absolute, relative);
      else if (item.isFile() && item.name.endsWith('.md')) result.push(relative.replaceAll('\\', '/'));
    }
  }
  await scan(path.join(entriesRoot, section));
  return result.sort();
}

test('o compêndio mantém as fichas selecionadas e preserva regiões e sistemas básicos', async () => {
  assert.deepEqual(await markdownEntries('racas'), ['bruxas.md', 'humanos.md']);
  assert.deepEqual(await markdownEntries('origens'), [
    'artefatos.md',
    'artefatos/ancestral.md',
    'artefatos/canalha.md',
    'artefatos/conjurador.md',
    'artefatos/guerreiro.md',
    'artefatos/servo.md',
    'artefatos/tulpa.md',
  ]);
  assert.equal((await markdownEntries('regioes')).length, 4);
  assert.equal((await markdownEntries('sistemas-basicos')).length, 9);
});

test('os layouts visuais usados pelo compêndio continuam disponíveis', async () => {
  const humans = JSON.parse(await readFile(path.join(project, 'src/content/layouts/racas/humanos.json'), 'utf8'));
  const humanEntry = matter(await readFile(path.join(entriesRoot, 'racas/humanos.md'), 'utf8'));
  const artifactEntry = matter(await readFile(path.join(entriesRoot, 'origens/artefatos.md'), 'utf8'));
  const witches = JSON.parse(await readFile(path.join(project, 'src/content/layouts/racas/bruxas.json'), 'utf8'));
  assert.ok(humanEntry.data.summary.includes('seres que não são de origem mágica'));
  assert.deepEqual(humanEntry.data.badges, ['Raça']);
  assert.deepEqual(humanEntry.data.stats, []);
  assert.ok(artifactEntry.data.summary.includes('Não é tão complexo assim, são itens espertinhos.'));
  assert.ok(!artifactEntry.content.includes('Não é tão complexo assim'));
  assert.equal(artifactEntry.data.sourceDocument, 'avalon___artefatos_-1793222529.htm');
  assert.equal(artifactEntry.data.cover, 'images/origens/artefatos/nix.png');
  assert.equal(artifactEntry.data.coverPreview, true);
  await readFile(path.join(project, 'public', artifactEntry.data.cover));
  const artifactOrigins = ['ancestral', 'canalha', 'conjurador', 'guerreiro', 'servo', 'tulpa'];
  const originImages = {
    ancestral: 'images/origens/artefatos/ancestral.gif',
    canalha: 'images/origens/artefatos/canalha.gif',
    conjurador: 'images/origens/artefatos/conjurador.gif',
    guerreiro: 'images/origens/artefatos/guerreiro.gif',
    servo: 'images/origens/artefatos/servo.gif',
    tulpa: 'images/origens/artefatos/tulpa.jpg',
  };
  let abilityCount = 0;
  for (const origin of artifactOrigins) {
    const entry = matter(await readFile(path.join(entriesRoot, `origens/artefatos/${origin}.md`), 'utf8'));
    const layout = JSON.parse(await readFile(path.join(project, `src/content/layouts/origens/artefatos/${origin}.json`), 'utf8'));
    assert.equal(entry.data.slug, `artefatos/${origin}`);
    assert.equal(entry.data.sourceDocument, 'avalon___artefatos_-1793222529.htm');
    assert.equal(entry.data.cover, originImages[origin]);
    assert.equal(entry.data.coverPreview, true);
    await readFile(path.join(project, 'public', entry.data.cover));
    assert.ok(layout.content.some(({ type, props }) => type === 'Heading' && props.title === 'Opções de Habilidades'));
    abilityCount += layout.content.filter(({ type }) => type === 'Ability').length;
  }
  assert.equal(abilityCount, 14);
  assert.equal(humans.content[0].type, 'RaceVariation');
  const humanVariations = humans.content.filter(({ type }) => type === 'RaceVariation');
  assert.deepEqual(humanVariations.map(({ props }) => props.baseHp), ['50', '80', '100', '50']);
  assert.deepEqual(humanVariations.map(({ props }) => props.name), [
    'HUMANO: Adaptável', 'HUMANO variante: Médio', 'HUMANO variante: Elíseo', 'HUMANO Variante: Ura',
  ]);
  for (const index of [0, 1, 3]) {
    const markdown = humanVariations[index].props.content
      .filter(({ type }) => type === 'Markdown')
      .map(({ props }) => props.body)
      .join('\n');
    assert.match(markdown, /^## Requisitos\n\nNão possui\./m);
  }
  const eliseoMarkdown = humanVariations[2].props.content
    .filter(({ type }) => type === 'Markdown')
    .map(({ props }) => props.body)
    .join('\n');
  assert.match(eliseoMarkdown, /^## Requisitos\n\n- 1200 palavras\n- Não é da origem \[REENCARNADO\]/m);
  for (const { props } of humanVariations) {
    const headings = props.content.filter(({ type }) => type === 'Markdown')
      .flatMap(({ props: block }) => [...block.body.matchAll(/^##\s+(.+)$/gm)].map((match) => match[1]));
    for (const heading of ['Requisitos', 'Positivos', 'Negativos', 'Neutros']) {
      assert.ok(headings.includes(heading), `${props.name} precisa da seção ${heading}`);
    }
  }
  assert.equal(humanVariations[3].props.content.filter(({ type }) => type === 'Ability').length, 2);
  assert.equal(humans.content.some(({ type }) => type === 'Subrace'), false);
  assert.equal(witches.content.filter(({ type }) => type === 'RaceVariation').length, 1);
});
