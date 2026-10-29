import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import matter from 'gray-matter';
import { applyMigration, planMigration } from '../layout-migration.mjs';
import { migrateMarkdown } from '../layout-migration-converters.mjs';

const projectRoot = path.resolve(import.meta.dirname, '../..');
async function source(section, slug) {
  const file = path.join(projectRoot, 'src/content/entries', section, `${slug}.md`);
  return matter(await fs.readFile(file, 'utf8'));
}

test('conversores estruturam páginas reais sem perder regras e conteúdo mecânico', async () => {
  const bruxas = await source('racas', 'bruxas');
  const witchResult = migrateMarkdown('racas', 'bruxas', bruxas.content);
  assert.ok(witchResult);
  assert.ok(witchResult.layout.content.every((item) => typeof item.props.id === 'string' && item.props.id));
  const variation = witchResult.layout.content.find((item) => item.type === 'RaceVariation');
  assert.deepEqual({ name: variation.props.name, hp: variation.props.baseHp, bonus: variation.props.bonusPercent, bonusAttributes: variation.props.bonusAttributes, penalty: variation.props.penaltyPercent, penaltyAttributes: variation.props.penaltyAttributes }, {
    name: 'Hexe', hp: '50', bonus: '13%', bonusAttributes: 'Mag, Ego e Sor', penalty: '13%', penaltyAttributes: 'For, Con e Dex',
  });
  assert.match(variation.props.description, /selecionadas por Drawkill/);
  const hexeAbility = witchResult.layout.content.find((item) => item.type === 'Ability');
  assert.equal(hexeAbility.props.name, 'Hex Mania');
  assert.equal(hexeAbility.props.duration, '2 TURNOS');
  assert.match(hexeAbility.props.effect, /sem necessidade de teste ou resistência/);
  for (const phrase of ['3 TESOUROS', 'Passar na entrevista, mulher', 'QUEIMAÇÃO ARCANA', 'autonarrada de tamanho variável']) {
    assert.ok(JSON.stringify(witchResult.layout).includes(phrase), phrase);
  }

  const conditions = await source('sistemas-basicos', 'condicoes');
  const conditionResult = migrateMarkdown('sistemas-basicos', 'condicoes', conditions.content);
  assert.ok(conditionResult);
  const conditionCatalog = conditionResult.layout.content.find((item) => item.type === 'ConditionCatalog');
  const originalConditions = [...conditions.content.matchAll(/^\s*-\s+\*\*([^*]+)\*\*\s+—\s+(.+)$/gm)];
  assert.equal(conditionCatalog.props.conditions.length, originalConditions.length);
  assert.equal(conditionCatalog.props.conditions.length, 38);
  assert.ok(conditionCatalog.props.conditions.some((item) => item.name === '[Queimação Arcana]' && item.category === 'Especiais'));

  const weapons = await source('sistemas-basicos', 'armas');
  const weaponResult = migrateMarkdown('sistemas-basicos', 'armas', weapons.content);
  assert.ok(weaponResult);
  const weaponCatalogs = weaponResult.layout.content.filter((item) => item.type === 'WeaponCatalog');
  const migratedWeapons = weaponCatalogs.flatMap((item) => item.props.weapons);
  assert.equal(migratedWeapons.length, 16);
  const pistol = migratedWeapons.find((item) => item.name === 'Pistola');
  assert.deepEqual({ scale: pistol.scale, attribute: pistol.attribute, hands: pistol.hands, range: pistol.range, reload: pistol.reload, ammunition: pistol.ammunition }, {
    scale: '2 em Des', attribute: 'Des', hands: '1', range: 'Médio', reload: '0', ammunition: '1 crédito por Cena',
  });
  assert.match(migratedWeapons.find((item) => item.name === 'Katana').critical, /5 vezes/);

  const combat = await source('sistemas-basicos', 'combate');
  const combatResult = migrateMarkdown('sistemas-basicos', 'combate', combat.content);
  assert.ok(combatResult);
  assert.equal(combatResult.layout.content.filter((item) => item.type === 'Ability').length, 3);
  const distances = combatResult.layout.content.find((item) => item.props.id === 'tabela-distancias');
  assert.equal(distances.props.rows.length, 6);
  assert.ok(JSON.stringify(combatResult.layout).includes('10 + [Nível] + [Mod. de Des]'));
  assert.ok(JSON.stringify(combatResult.layout).includes('ESCALA 3 → 3 × FOR = DANO FIXO'));

  const region = await source('regioes', 'avalon');
  const regionResult = migrateMarkdown('regioes', 'avalon', region.content);
  assert.ok(regionResult);
  assert.deepEqual(regionResult.layout.content.filter((item) => item.type === 'Locality').map((item) => item.props.name), ['Linngrave', 'Ash Lake', 'Sofya City', 'El Scaro', 'Rokoko City']);
  assert.ok(JSON.stringify(regionResult.layout).includes('Bônus de Origem — Guilda'));
});

test('regiões com seção uniforme viram fichas de localidade e preservam o restante em Markdown', async () => {
  const cases = [
    ['antory', ['Prontera', 'Payon', 'Penumbra', 'Lar da Arrogância'], 'Balance the ◻️◻️◻️◻️'],
    ['terrarium', ['O Chão', 'O Caule', 'O Chapéu'], 'Condição Financeira Estável'],
    ['the-great-divide', ['Bluteisen', 'Kamabuhay', 'The Unknown'], 'Grandioso Capitalismo!'],
  ];
  for (const [slug, names, preservedRule] of cases) {
    const entry = await source('regioes', slug);
    const result = migrateMarkdown('regioes', slug, entry.content);
    assert.ok(result, slug);
    assert.deepEqual(result.layout.content.filter((item) => item.type === 'Locality').map((item) => item.props.name), names, slug);
    assert.ok(JSON.stringify(result.layout).includes(preservedRule), `${slug}: bônus preservado`);
    assert.ok(JSON.stringify(result.layout).includes('Nível Tecnológico e Mágico'), `${slug}: demais seções preservadas`);
    for (const name of names) {
      const headingAt = entry.content.indexOf(`### ${name}`);
      const nextHeading = entry.content.indexOf('\n### ', headingAt + 1);
      const nextSection = entry.content.indexOf('\n## ', headingAt + 1);
      const end = [nextHeading, nextSection].filter((index) => index >= 0).sort((a, b) => a - b)[0] ?? entry.content.length;
      const description = entry.content.slice(headingAt + `### ${name}`.length, end).trim();
      const locality = result.layout.content.find((item) => item.type === 'Locality' && item.props.name === name);
      assert.equal(locality.props.description, description, `${slug}: descrição integral de ${name}`);
    }
  }
  assert.equal(migrateMarkdown('regioes', 'rascunho', '## Regiões e Povos\n\n### Apenas uma\n\nDescrição'), null);
});

test('migração em dry-run não escreve, aplica com backup e é idempotente', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'avalon-migration-'));
  const original = await fs.readFile(path.join(projectRoot, 'src/content/entries/racas/bruxas.md'), 'utf8');
  try {
    const entry = path.join(root, 'src/content/entries/racas/bruxas.md');
    await fs.mkdir(path.dirname(entry), { recursive: true });
    await fs.writeFile(entry, original, 'utf8');
    const dryRun = await planMigration(root);
    assert.equal(dryRun.pages.find((page) => page.id === 'racas/bruxas').status, 'ready');
    await assert.rejects(fs.access(path.join(root, 'src/content/layouts/racas/bruxas.json')));

    const first = await applyMigration(root);
    assert.equal(first.migrated, 1);
    assert.ok(first.backups);
    const saved = JSON.parse(await fs.readFile(path.join(root, 'src/content/layouts/racas/bruxas.json'), 'utf8'));
    assert.equal(saved.content.filter((item) => item.type === 'RaceVariation').length, 1);
    assert.equal(await fs.readFile(entry, 'utf8'), original);
    assert.equal(await fs.readFile(path.join(root, first.backups, 'src/content/entries/racas/bruxas.md'), 'utf8'), original);

    const second = await applyMigration(root);
    assert.equal(second.migrated, 0);
    const after = JSON.parse(await fs.readFile(path.join(root, 'src/content/layouts/racas/bruxas.json'), 'utf8'));
    assert.equal(after.content.length, saved.content.length);
    const state = JSON.parse(await fs.readFile(path.join(root, 'src/content/layout-migration-state.json'), 'utf8'));
    assert.equal(state.pages['racas/bruxas'].status, 'automatic');
    assert.equal(state.pages['racas/bruxas'].migrationVersion, 3);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('layout Puck preexistente é protegido e marcado como manual, sem sobrescrita', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'avalon-migration-manual-'));
  const original = await fs.readFile(path.join(projectRoot, 'src/content/entries/racas/bruxas.md'), 'utf8');
  const manual = { root: { props: {} }, content: [{ type: 'Text', props: { id: 'manual', text: 'Edição manual preservada.' } }] };
  try {
    const entry = path.join(root, 'src/content/entries/racas/bruxas.md');
    const layout = path.join(root, 'src/content/layouts/racas/bruxas.json');
    await fs.mkdir(path.dirname(entry), { recursive: true });
    await fs.mkdir(path.dirname(layout), { recursive: true });
    await fs.writeFile(entry, original, 'utf8');
    await fs.writeFile(layout, `${JSON.stringify(manual, null, 2)}\n`, 'utf8');
    const result = await applyMigration(root);
    assert.equal(result.migrated, 0);
    assert.equal(JSON.parse(await fs.readFile(layout, 'utf8')).content[0].props.text, 'Edição manual preservada.');
    const state = JSON.parse(await fs.readFile(path.join(root, 'src/content/layout-migration-state.json'), 'utf8'));
    assert.equal(state.pages['racas/bruxas'].status, 'manual');
    assert.equal((await planMigration(root)).pages[0].status, 'manual');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
