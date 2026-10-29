// Fallback não destrutivo: quando uma ficha não tem layout Puck, o texto
// original Markdown é preservado em um bloco de layout.
export function blankLayout() {
  return { root: { props: {} }, content: [] };
}

function markdownBlock(body, id = 'texto-principal') {
  return { type: 'Markdown', props: { id, body: body.trim() } };
}

function raceVariantMarkers(slug, markdown) {
  if (slug === 'humanos') return [...markdown.matchAll(/^##\s+(HUMANO(?:\s+variante|\s+Variante|:)[^\n]*)/gmi)];
  return [];
}

export function layoutForMarkdown(section, slug, markdown) {
  const data = blankLayout();
  const body = String(markdown || '').trim();
  if (!body) return data;
  if (section !== 'racas') {
    data.content.push(markdownBlock(body));
    return data;
  }
  const markers = raceVariantMarkers(slug, body);
  if (!markers.length) {
    data.content.push(markdownBlock(body));
    return data;
  }
  const prefix = body.slice(0, markers[0].index).trim();
  if (prefix) data.content.push(markdownBlock(prefix, 'introducao-raca'));
  markers.forEach((marker, index) => {
    const next = markers[index + 1]?.index ?? body.length;
    const heading = marker[1].trim().replace(/^\*\s*/, '');
    const part = body.slice(marker.index + marker[0].length, next).trim();
    const hp = heading.match(/(?:HP\s+Base|HP)\s*[:\-]?\s*(\d+)/i)?.[1]
      ?? heading.match(/(\d+)\s*HP\s*Base/i)?.[1] ?? '';
    data.content.push({
      type: 'Subrace',
      props: {
        id: `subraca-${index + 1}`,
        name: heading.replace(/\s*[-–—]?\s*(?:\d+\s+HP\s+Base|HP\s+Base\s*\d+).*$/i, '').trim(),
        subtitle: '',
        badges: 'Subraça',
        stats: hp ? `HP Base | ${hp}` : '',
        portrait: '',
        portraitAlt: '',
        side: 'right',
        content: part ? [markdownBlock(part, `texto-subraca-${index + 1}`)] : [],
      },
    });
  });
  return data;
}
