// Conversores editoriais deliberadamente conservadores. Se a forma esperada
// não for encontrada integralmente, a página continua no Markdown original.
const block = (type, props) => ({ type, props: { id: props.id || `${slug(type)}-${slug(props.title || props.name || 'bloco')}`, ...props } });
const markdown = (body, id) => block('Markdown', { id, body: body.trim() });
const heading = (title, level = 'h2') => block('Heading', { title, level });
const escapeHTML = (value) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function richTextHTML(markdownText) {
  const inline = (value) => escapeHTML(value).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>');
  return markdownText.trim().split(/\n\s*\n/).map((paragraph) => {
    const lines = paragraph.split('\n');
    if (lines.every((line) => /^\s*-\s+/.test(line))) return `<ul>${lines.map((line) => `<li>${inline(line.replace(/^\s*-\s+/, ''))}</li>`).join('')}</ul>`;
    return `<p>${lines.map(inline).join('<br>')}</p>`;
  }).join('');
}
const section = (title, body) => block('Section', { title, body: richTextHTML(body) });
const slug = (value) => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function splitH2(body) {
  const lines = String(body || '').split('\n');
  const starts = [];
  lines.forEach((line, index) => { if (/^##\s+/.test(line)) starts.push(index); });
  if (!starts.length) return { prefix: lines.join('\n').trim(), sections: [] };
  const prefix = lines.slice(0, starts[0]).join('\n').trim();
  const sections = starts.map((start, index) => {
    const end = starts[index + 1] ?? lines.length;
    const chunk = lines.slice(start, end).join('\n').trim();
    const title = chunk.match(/^##\s+(.+)$/m)?.[1]?.trim() || '';
    return { title, body: chunk.replace(/^##\s+.+(?:\r?\n)?/, '').trim(), raw: chunk };
  });
  return { prefix, sections };
}

function exactNamedSection(sections, title) {
  return sections.find((item) => item.title.toLocaleLowerCase('pt-BR') === title.toLocaleLowerCase('pt-BR'));
}

function parseModifier(line) {
  const match = String(line || '').match(/^#{1,6}\s+([+−-]?\s*\d+(?:[.,]\d+)?%)\s+(.+)$/);
  if (!match) return null;
  return { percent: match[1].replace(/\s+/g, ''), attributes: match[2].trim() };
}

function between(text, start, end) {
  const startIndex = text.search(start);
  if (startIndex < 0) return null;
  const contentStart = startIndex + text.slice(startIndex).match(start)[0].length;
  const tail = text.slice(contentStart);
  const endIndex = tail.search(end);
  return { body: (endIndex < 0 ? tail : tail.slice(0, endIndex)).trim(), start: startIndex, end: endIndex < 0 ? text.length : contentStart + endIndex };
}

export function convertWitches(body) {
  const variant = body.match(/^###\s+(Hexe\s*[-–—]\s*50\s*HP\s*Base)\s*$/mi);
  if (!variant || (body.match(/^###\s+Hexe\s*[-–—]\s*50\s*HP\s*Base\s*$/gmi) || []).length !== 1) return null;
  const bonusLine = body.match(/^#{1,6}\s+([+−-]\s*\d+(?:[.,]\d+)?%\s+[^\n]+)$/m)?.[1];
  const penaltyLine = body.match(/^#{1,6}\s+([-−]\s*\d+(?:[.,]\d+)?%\s+[^\n]+)$/m)?.[1];
  const bonus = parseModifier(`## ${bonusLine || ''}`);
  const penalty = parseModifier(`## ${penaltyLine || ''}`);
  const requirement = body.match(/^####\s+Requisitos:\s*(.+)$/mi);
  const positive = between(body, /^##\s+Positivos\s*$/mi, /^##\s+Hex Mania\s*$/mi);
  const ability = between(body, /^##\s+Hex Mania\s*$/mi, /^##\s+Negativos\s*$/mi);
  const negative = between(body, /^##\s+Negativos\s*$/mi, /^##\s+NEUTROS\s*$/mi);
  const neutral = between(body, /^##\s+NEUTROS\s*$/mi, /$^/);
  const narrativeStart = body.indexOf(penaltyLine || '\u0000') + (penaltyLine || '').length;
  const narrativeEnd = requirement?.index ?? -1;
  const narrative = narrativeStart >= 0 && narrativeEnd > narrativeStart ? body.slice(narrativeStart, narrativeEnd).trim() : '';
  if (!bonus || !penalty || !requirement || !positive || !ability || !negative || !neutral || !narrative) return null;

  const abilityLines = ability.body.split('\n');
  const traits = [...ability.body.matchAll(/<span[^>]*>([^<]+)<\/span>/gi)].map((match) => match[1].trim()).join(', ');
  const kind = ability.body.match(/^###\s+(.+)$/m)?.[1]?.trim() || '';
  const labels = { Custo: 'cost', Alcance: 'range', Duração: 'duration', Duracao: 'duration', Limite: 'limit', Recarga: 'cooldown', Cooldown: 'cooldown', Requisitos: 'requirements' };
  const abilityProps = { name: 'Hex Mania', traits, kind, cost: '', range: '', duration: '', limit: '', cooldown: '', requirements: '', effect: '' };
  const effect = [];
  for (const line of abilityLines) {
    if (/^##\s+Hex Mania\s*$/.test(line) || /^###\s+/.test(line) || /<div[^>]*class="trait-list"/.test(line) || /<\/div>/.test(line)) continue;
    const metadata = line.match(/^\s*\*\*(Custo|Alcance|Duração|Duracao|Limite|Recarga|Cooldown|Requisitos)\*\*\s*(.*)$/i);
    if (metadata) {
      const key = Object.keys(labels).find((name) => name.toLowerCase() === metadata[1].toLowerCase());
      if (key) abilityProps[labels[key]] = metadata[2].replace(/\*/g, '').trim();
    } else if (line.trim()) effect.push(line.trim());
  }
  abilityProps.effect = effect.join('\n\n');
  if (!abilityProps.effect || !abilityProps.cost || !abilityProps.range || !abilityProps.duration || !abilityProps.cooldown) return null;

  const intro = body.slice(0, variant.index).trim();
  const blocks = [];
  if (intro) blocks.push(markdown(intro, 'introducao-bruxas'));
  blocks.push(block('RaceVariation', {
    id: 'variacao-hexe', name: 'Hexe', classification: '', baseHp: '50',
    bonusPercent: bonus.percent.replace(/^\+/, ''), bonusAttributes: bonus.attributes,
    penaltyPercent: penalty.percent.replace(/^[-−]/, ''), penaltyAttributes: penalty.attributes,
    description: narrative, content: [],
  }));
  blocks.push(section('Requisitos', requirement[1].trim()));
  blocks.push(section('Positivos', positive.body));
  blocks.push(block('Ability', { id: 'habilidade-hex-mania', ...abilityProps }));
  blocks.push(section('Negativos', negative.body));
  blocks.push(section('Neutros', neutral.body));
  return { layout: { root: { props: {} }, content: blocks }, note: 'Hexe convertida para ficha racial; habilidades e descrições preservadas em blocos independentes.' };
}

export function convertConditions(body) {
  const { prefix, sections } = splitH2(body);
  const titles = ['Condições Positivas', 'Condições Negativas', 'Condições Especiais'];
  const conditionSections = titles.map((title) => exactNamedSection(sections, title));
  if (conditionSections.some((item) => !item)) return null;
  const conditions = [];
  for (const item of conditionSections) {
    const category = item.title.replace(/^Condições\s+/i, '');
    for (const line of item.body.split('\n').filter((value) => value.trim())) {
      const match = line.match(/^\s*-\s+\*\*([^*]+)\*\*\s+—\s+(.+)$/);
      if (!match) return null;
      conditions.push({ name: match[1].trim(), category, description: match[2].trim() });
    }
  }
  if (conditions.length < 10) return null;
  const blocks = [];
  const introHeading = prefix.match(/^###\s+(TABELA DE CONDIÇÕES)\s*$/m);
  if (introHeading) blocks.push(heading('Tabela de Condições'));
  const intro = prefix.replace(/^###\s+TABELA DE CONDIÇÕES\s*\n?/m, '').trim();
  if (intro) blocks.push(block('Text', { id: 'introducao-condicoes', text: intro }));
  blocks.push(block('ConditionCatalog', { id: 'catalogo-condicoes', title: 'Condições', conditions }));
  return { layout: { root: { props: {} }, content: blocks }, note: `${conditions.length} condições organizadas em três categorias, mantendo cada descrição completa.` };
}

const conventionalNames = ['Arco e Flecha', 'Adaga', 'Espada Média', 'Espada Longa', 'Espadão', 'Martelo', 'Lança', 'Katana'];
const ballisticNames = ['Pistola', 'Revólver', 'Rifle de Assalto', 'Espingarda', 'Rifle de Caça', 'UZI', 'Lança-Granada', 'RPG'];
const weaponNames = [...conventionalNames, ...ballisticNames];

function weaponData(name, body, category) {
  const traits = [...body.matchAll(/<span[^>]*>([^<]+)<\/span>/gi)].map((match) => match[1].trim()).join(', ');
  const read = (label) => body.match(new RegExp(`\\*\\*${label}\\*\\*\\s*([^\\n]+)`, 'i'))?.[1]?.trim() || '';
  const scale = read('Escala');
  const attribute = scale.match(/\bem\s+(.+?)(?=,\s+ou\s+\d|\s+ou\s+\d|$)/i)?.[1]?.trim() || '';
  const critical = read('Efeito Crítico');
  const description = body.replace(/<div[^>]*class="trait-list"[^>]*>[\s\S]*?<\/div>/gi, '')
    .replace(/^#{1,6}\s+[^\n]+$/gm, '').replace(/^\s*\*\*(?:Escala|Mãos|Alcance|Recarga|Custo de Munição|Efeito Crítico)\*\*[^\n]*$/gim, '')
    .replace(/^\s*<[^>]+>\s*$/gm, '').trim();
  const cleanDescription = description.replace(/\*\*Efeito Crítico\*\*[^\n]*/i, '').trim();
  return {
    name, category, traits, description: cleanDescription,
    scale, attribute, hands: read('Mãos'), range: read('Alcance'), reload: read('Recarga'),
    ammunition: read('Custo de Munição'), critical,
  };
}

export function convertWeapons(body) {
  const { prefix, sections } = splitH2(body);
  const sectionByTitle = new Map(sections.map((item) => [item.title.toLocaleLowerCase('pt-BR'), item]));
  const expected = weaponNames.map((name) => sectionByTitle.get(name.toLocaleLowerCase('pt-BR')));
  if (expected.some((item) => !item)) return null;
  const items = [];
  for (const item of expected) {
    const marker = item.body.match(/^###\s+(ARMA CONVENCIONAL|ARMA BALÍSTICA)\s*$/mi)?.[1];
    if (!marker) return null;
    const conventional = marker.toLocaleLowerCase('pt-BR').includes('convencional');
    // Contexto de raridade/tier é definido pela posição do registro, não pelo conteúdo da regra.
    const preceding = sections.filter((section) => (section.title === 'Armas Balísticas Simples' || section.title === 'Armas Balísticas Avançadas') && sections.indexOf(section) < sections.indexOf(item)).at(-1)?.title;
    const actualCategory = conventional ? 'Arma convencional' : (preceding || 'Arma balística');
    items.push(weaponData(item.title, item.body, actualCategory));
  }
  if (items.length !== 16 || items.some((item) => !item.traits)) return null;

  const blocks = [];
  if (prefix) blocks.push(markdown(prefix, 'introducao-armas'));
  let catalogInserted = new Set();
  for (const item of sections) {
    const title = item.title;
    if (weaponNames.includes(title)) {
      const category = items.find((weapon) => weapon.name === title)?.category;
      if (!catalogInserted.has(category)) {
        const grouped = items.filter((weapon) => weapon.category === category);
        const label = category === 'Arma convencional' ? 'Armas Convencionais' : category;
        blocks.push(block('WeaponCatalog', { id: `catalogo-${slug(label)}`, title: label, weapons: grouped }));
        catalogInserted.add(category);
      }
      continue;
    }
    if (title === 'Armas Balísticas Simples' || title === 'Armas Balísticas Avançadas') continue;
    blocks.push(markdown(item.raw, `secao-${slug(title)}`));
  }
  return { layout: { root: { props: {} }, content: blocks }, note: '16 fichas de armas estruturadas; regras gerais e áreas de defesa mantidas em texto integral.' };
}

function parseAbility(name, body) {
  const traits = [...body.matchAll(/<span[^>]*>([^<]+)<\/span>/gi)].map((match) => match[1].trim()).join(', ');
  const kind = body.match(/^###\s+(.+)$/m)?.[1]?.trim() || '';
  const fields = { cost: '', range: '', duration: '', limit: '', cooldown: '', requirements: '' };
  const labels = { custo: 'cost', alcance: 'range', duração: 'duration', duracao: 'duration', limite: 'limit', recarga: 'cooldown', cooldown: 'cooldown', requisitos: 'requirements' };
  const effect = [];
  for (const line of body.split('\n')) {
    if (/^###\s+/.test(line) || /<div[^>]*class="trait-list"/.test(line) || /<\/div>/.test(line)) continue;
    const match = line.match(/^\s*\*\*([^*]+)\*\*\s*(.*)$/);
    const key = match && labels[match[1].toLocaleLowerCase('pt-BR')];
    if (key) fields[key] = match[2].replace(/\*/g, '').trim();
    else if (line.trim()) effect.push(line.trim());
  }
  const completeEffect = effect.join('\n\n');
  if (!kind || !fields.cost || !completeEffect) return null;
  return { name, traits, kind, ...fields, effect: completeEffect };
}

function parseTableRows(body) {
  return body.split('\n').filter((line) => line.trim()).map((line) => {
    const match = line.match(/^\s*-\s+\*\*(.+?)\*\*\s+—\s+(.+)$/);
    return match ? { name: match[1].trim(), value: match[2].trim() } : null;
  });
}

export function convertCombat(body) {
  const { prefix, sections } = splitH2(body);
  const actionNames = ['Ataque Básico', 'Defender', 'Analisar'];
  if (!actionNames.every((name) => exactNamedSection(sections, name))) return null;
  const blocks = [];
  if (prefix) blocks.push(markdown(prefix, 'introducao-combate'));
  for (const item of sections) {
    if (item.title === 'Ações e Reações') {
      blocks.push(section(item.title, item.body));
    } else if (actionNames.includes(item.title)) {
      const ability = parseAbility(item.title, item.body);
      if (!ability) return null;
      blocks.push(block('Ability', { id: `acao-${slug(item.title)}`, ...ability }));
    } else if (item.title === 'Distâncias') {
      const rows = parseTableRows(item.body);
      if (rows.length !== 6 || rows.some((row) => !row)) return null;
      blocks.push(block('DataTable', { id: 'tabela-distancias', title: 'Distâncias', rows }));
    } else if (item.title === 'Escalas de Dano') {
      const headings = [...item.body.matchAll(/^###\s+(.+)$/gm)];
      if (headings.length < 5) { blocks.push(markdown(item.raw, `secao-${slug(item.title)}`)); continue; }
      const rows = headings.map((match, index) => {
        const start = match.index + match[0].length;
        const end = headings[index + 1]?.index ?? item.body.length;
        return { name: match[1].trim(), value: item.body.slice(start, end).trim() };
      });
      blocks.push(block('DataTable', { id: 'tabela-escalas-dano', title: item.title, rows }));
    } else {
      blocks.push(markdown(item.raw, `secao-${slug(item.title)}`));
    }
  }
  return { layout: { root: { props: {} }, content: blocks }, note: 'Ações básicas, escalas e distâncias estruturadas; demais regras permanecem em Markdown.' };
}

export function convertAvalonRegion(body) {
  const { prefix, sections } = splitH2(body);
  const placesSection = exactNamedSection(sections, 'Regiões e Povos');
  if (!placesSection) return null;
  const placeHeaders = [...placesSection.body.matchAll(/^###\s+(.+)$/gm)];
  if (placeHeaders.length !== 5) return null;
  const names = placeHeaders.map((match) => match[1].trim());
  const blocks = [];
  if (prefix) blocks.push(markdown(prefix, 'introducao-avalon'));
  for (const item of sections) {
    if (item === placesSection) {
      blocks.push(heading('Regiões e Povos'));
      let tail = '';
      placeHeaders.forEach((match, index) => {
        const start = match.index + match[0].length;
        const end = placeHeaders[index + 1]?.index ?? placesSection.body.length;
        const raw = placesSection.body.slice(start, end).trim();
        const paragraphs = raw.split(/\n\s*\n/);
        let description = raw;
        if (index === placeHeaders.length - 1 && paragraphs.length > 1) {
          description = paragraphs.shift();
          tail = paragraphs.join('\n\n').trim();
        }
        blocks.push(block('Locality', { id: `localidade-${slug(names[index])}`, name: names[index], description, image: '', imageAlt: '', imageApproved: false }));
      });
      if (tail) blocks.push(markdown(tail, 'descricoes-gerais-regiao'));
    } else {
      blocks.push(markdown(item.raw, `secao-${slug(item.title)}`));
    }
  }
  return { layout: { root: { props: {} }, content: blocks }, note: `${names.length} localidades transformadas em fichas sem gerar mapa ou dados geográficos novos.` };
}

export function convertRegion(body) {
  const { prefix, sections } = splitH2(body);
  const placesSection = exactNamedSection(sections, 'Regiões e Povos');
  if (!placesSection) return null;
  const placeHeaders = [...placesSection.body.matchAll(/^###\s+(.+)$/gm)];
  if (placeHeaders.length < 3 || placeHeaders.length > 12) return null;
  // Evita tratar introduções, subtópicos ou cabeçalhos repetidos como localidades.
  if (placesSection.body.slice(0, placeHeaders[0].index).trim()) return null;
  const names = placeHeaders.map((match) => match[1].trim());
  if (names.some((name) => !name) || new Set(names.map((name) => name.toLocaleLowerCase('pt-BR'))).size !== names.length) return null;
  const descriptions = placeHeaders.map((match, index) => {
    const start = match.index + match[0].length;
    const end = placeHeaders[index + 1]?.index ?? placesSection.body.length;
    return placesSection.body.slice(start, end).trim();
  });
  if (descriptions.some((description) => !description)) return null;

  const blocks = [];
  if (prefix) blocks.push(markdown(prefix, 'introducao-regiao'));
  for (const item of sections) {
    if (item !== placesSection) {
      blocks.push(markdown(item.raw, `secao-${slug(item.title)}`));
      continue;
    }
    blocks.push(heading('Regiões e Povos'));
    names.forEach((name, index) => blocks.push(block('Locality', {
      id: `localidade-${slug(name)}`, name, description: descriptions[index], image: '', imageAlt: '', imageApproved: false,
    })));
  }
  return { layout: { root: { props: {} }, content: blocks }, note: `${names.length} localidades transformadas em fichas; demais regras mantidas em Markdown.` };
}

export function migrateMarkdown(sectionName, slugName, body) {
  if (sectionName === 'racas' && slugName === 'bruxas') return convertWitches(body);
  if (sectionName === 'sistemas-basicos' && slugName === 'condicoes') return convertConditions(body);
  if (sectionName === 'sistemas-basicos' && slugName === 'armas') return convertWeapons(body);
  if (sectionName === 'sistemas-basicos' && slugName === 'combate') return convertCombat(body);
  if (sectionName === 'regioes' && slugName === 'avalon') return convertAvalonRegion(body);
  if (sectionName === 'regioes') return convertRegion(body);
  return null;
}
