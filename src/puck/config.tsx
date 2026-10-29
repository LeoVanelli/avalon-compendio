import React from 'react';
import type { Config, Data, Slot } from '@puckeditor/core';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';

export type Blocks = {
  Section: { title: string; body: string };
  RichText: { body: string };
  FeatureList: { title: string; tone: 'bonus' | 'penalty' | 'neutral'; items: { name: string; description: string }[] };
  Ability: { name: string; traits: string; kind: string; cost: string; range: string; duration: string; limit: string; cooldown: string; requirements: string; effect: string };
  RaceVariation: { name: string; classification?: string; baseHp?: string; bonusPercent?: string; bonusAttributes?: string; penaltyPercent?: string; penaltyAttributes?: string; description?: string; content: Slot };
  ConditionCatalog: { title: string; conditions: { name: string; category: string; description: string }[] };
  WeaponCatalog: { title: string; weapons: { name: string; category: string; traits: string; description: string; scale: string; attribute: string; hands: string; range: string; reload: string; ammunition: string; critical: string }[] };
  Locality: { name: string; description: string; image: string; imageAlt: string; imageApproved?: boolean };
  DataTable: { title: string; rows: { name: string; value: string }[] };
  Markdown: { body: string };
  Heading: { title: string; level: 'h2' | 'h3' };
  Text: { text: string };
  Tags: { items: string };
  Stats: { items: string };
  Media: { src: string; alt: string; caption: string; approved?: boolean; align: 'left' | 'center' | 'right' | 'full'; size: 'small' | 'medium' | 'large' };
  Gallery: { images: { src: string; alt: string; caption: string; approved?: boolean }[]; columns: '2' | '3' | '4' };
  TwoColumns: { ratio: 'equal' | 'left' | 'right'; left: Slot; right: Slot };
  Subrace: { name: string; subtitle: string; badges: string; stats: string; portrait: string; portraitAlt: string; portraitApproved?: boolean; side: 'right' | 'left' | 'above'; content: Slot };
  Callout: { title: string; text: string };
};

export type PageLayout = Data<Blocks>;

function safeMarkdown(body = '') {
  return body.replace(/<span[^>]*class="trait-chip"[^>]*>/gi, ' **')
    .replace(/<\/span>/gi, '** · ').replace(/<\/?div[^>]*>/gi, '\n').replace(/<[^>]*>/g, '');
}
function MarkdownText({ body }: { body: string }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents()}>{safeMarkdown(body)}</ReactMarkdown>;
}
function RichTextView({ body }: { body: string }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw, rehypeSanitize]} components={markdownComponents()}>{body}</ReactMarkdown>;
}
export function assetUrl(path = '') {
  if (!path || /^(https?:|data:|blob:)/i.test(path)) return path;
  const base = import.meta.env.BASE_URL || '/';
  return `${base.replace(/\/$/, '')}/${path.replace(/^\/+/, '')}`;
}
function EmptyHint(_props: { label: string }) { return null; }
function Picture({ src, alt, caption, approved = false }: { src: string; alt: string; caption?: string; approved?: boolean }) {
  if (!src || !approved) return null;
  return <figure className="visual-picture">
    <img src={assetUrl(src)} alt={alt || 'Ilustração do compêndio'} loading="lazy" />
    {caption && <figcaption>{caption}</figcaption>}
  </figure>;
}
const mediaField = { type: 'text' as const, label: 'Caminho da imagem' };
const short = { type: 'text' as const };
const long = { type: 'textarea' as const };
const labelledShort = (label: string) => ({ type: 'text' as const, label });
const labelledLong = (label: string) => ({ type: 'textarea' as const, label });
function rows(items: string) {
  return items.split('\n').filter(Boolean).map((line, i) => {
    const [label, ...value] = line.split('|');
    return <div key={i}><dt>{label?.trim()}</dt><dd>{value.join('|').trim()}</dd></div>;
  });
}
function tags(items: string) {
  return items.split(/[,\n]/).map((t) => t.trim()).filter(Boolean).map((t, i) => <span key={i}>{t}</span>);
}
function textOf(children: React.ReactNode): string {
  return React.Children.toArray(children).map((child) => {
    if (typeof child === 'string' || typeof child === 'number') return String(child);
    if (React.isValidElement(child)) return textOf((child.props as { children?: React.ReactNode }).children);
    return '';
  }).join('');
}
function markdownComponents() {
  const heading = (tag: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6') => ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement> & { children?: React.ReactNode }) => {
    const title = textOf(children).trim();
    if (/^[+−-]?\d+(?:[.,]\d+)?%\s+\S/.test(title)) {
      return <p className="visual-modifier-line"><strong>{title}</strong></p>;
    }
    return React.createElement(tag, { ...props, id: anchorFor(title) }, children);
  };
  return { h1: heading('h1'), h2: heading('h2'), h3: heading('h3'), h4: heading('h4'), h5: heading('h5'), h6: heading('h6') };
}
function richContentPresent(value: unknown) {
  return typeof value === 'string' ? Boolean(value.trim()) : Boolean(value);
}
export function anchorFor(value: string) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export const puckConfig: Config<Blocks> = {
  categories: {
    textos: { title: 'Textos e regras', components: ['Section', 'RichText', 'Heading', 'Text', 'Markdown', 'FeatureList', 'Ability', 'ConditionCatalog', 'WeaponCatalog', 'DataTable', 'Tags', 'Stats', 'Callout'] },
    imagens: { title: 'Imagens e GIFs', components: ['Media', 'Gallery'] },
    fichas: { title: 'Fichas e layout', components: ['RaceVariation', 'Subrace', 'Locality', 'TwoColumns'] },
  },
  components: {
    Section: {
      label: 'Seção com título e texto', fields: { title: short, body: { type: 'richtext' } },
      defaultProps: { title: 'Nova seção', body: '' },
      render: ({ title, body }) => richContentPresent(body) ? <section className="visual-section"><h2 className="visual-heading" id={anchorFor(title)}>{title}</h2><div className="visual-markdown">{body}</div></section> : <EmptyHint label={`Preencher: ${title}`}/> ,
    },
    RichText: {
      label: 'Texto com formatação visual',
      fields: {
        body: { type: 'richtext' }
      },
      defaultProps: {
        body: ''
      },
      render: ({ body }) => (
        <div className="visual-markdown">
          {body || 'Adicionar texto formatado'}
        </div>
      ),
    },
    FeatureList: {
      label: 'Positivos / Negativos / Neutros',
      fields: { title: short, tone: { type: 'select', options: [{ label: 'Positivos', value: 'bonus' }, { label: 'Negativos', value: 'penalty' }, { label: 'Neutros', value: 'neutral' }] },
        items: { type: 'array', getItemSummary: (item) => item.name || 'Nova característica', arrayFields: { name: short, description: long } } },
      defaultProps: { title: 'Características', tone: 'neutral', items: [] },
      render: ({ title, tone, items }) => items.length ? <section className={`visual-features visual-features-${tone}`}><h2 className="visual-heading" id={anchorFor(title)}>{title}</h2>{items.map((item, i) => <div key={i} className="visual-feature"><strong>{item.name}</strong><MarkdownText body={item.description}/></div>)}</section> : <EmptyHint label={`Adicionar características: ${title}`}/> ,
    },
    Ability: {
      label: 'Ficha de habilidade', fields: { name: short, traits: short,
        kind: short, cost: short, range: short, duration: short, limit: short, cooldown: short,
        requirements: long, effect: long },
      defaultProps: { name: 'Nova habilidade', traits: '', kind: '', cost: '', range: '', duration: '', limit: '', cooldown: '', requirements: '', effect: '' },
      render: ({ name, traits, kind, cost, range, duration, limit, cooldown, requirements, effect }) => <section className="visual-ability"><div className="visual-tags">{tags(traits)}</div><h3 id={anchorFor(name)}>{name}</h3>
        {kind && <p className="visual-ability-kind">{kind}</p>}
        <dl className="visual-ability-facts">{rows([['Custo',cost], ['Alcance',range], ['Duração',duration], ['Limite',limit], ['Recarga',cooldown], ['Requisitos',requirements]].filter(([,v]) => v).map(([k,v]) => `${k}|${v}`).join('\n'))}</dl>
        {effect?.trim() && <MarkdownText body={effect}/>}
      </section>,
    },
    RaceVariation: {
      label: 'Ficha de variação racial',
      fields: {
        name: labelledShort('Nome da variação'), classification: labelledShort('Tipo da variação (opcional)'), baseHp: labelledShort('HP base (opcional)'),
        bonusPercent: labelledShort('Percentual de bônus (opcional)'), bonusAttributes: labelledShort('Atributos beneficiados (opcional)'),
        penaltyPercent: labelledShort('Percentual de penalidade (opcional)'), penaltyAttributes: labelledShort('Atributos penalizados (opcional)'),
        description: labelledLong('Descrição narrativa (opcional)'), content: { type: 'slot', label: 'Conteúdo interno (opcional)' },
      },
      defaultProps: { name: 'Nova variação', classification: '', baseHp: '', bonusPercent: '', bonusAttributes: '', penaltyPercent: '', penaltyAttributes: '', description: '', content: [] },
      render: ({ name, classification, baseHp, bonusPercent, bonusAttributes, penaltyPercent, penaltyAttributes, description, content: Content }) => {
        const hasBonus = Boolean(bonusPercent?.trim() || bonusAttributes?.trim());
        const hasPenalty = Boolean(penaltyPercent?.trim() || penaltyAttributes?.trim());
        const percentage = (value: string, sign: '+' | '−') => /^[+−-]/.test(value.trim()) ? value : `${sign}${value}`;
        return <section className="visual-race-variation" aria-labelledby={anchorFor(name)}>
          <header className="visual-race-variation-head"><div><div className="visual-race-variation-label">{classification?.trim() && <span>{classification}</span>}<span>Variação racial</span></div><h2 id={anchorFor(name)}>{name}</h2></div>
            {baseHp?.trim() && <div className="visual-race-hp"><span>HP base</span><strong>{baseHp}</strong></div>}
          </header>
          {(hasBonus || hasPenalty) && <div className="visual-modifier-grid">
            {hasBonus && <section className="visual-modifier visual-modifier-bonus" aria-label="Bônus racial"><h3>Bônus</h3>{bonusPercent?.trim() && <strong className="visual-modifier-value">{percentage(bonusPercent.trim(), '+')}</strong>}{bonusAttributes?.trim() && <p>{bonusAttributes}</p>}</section>}
            {hasPenalty && <section className="visual-modifier visual-modifier-penalty" aria-label="Penalidades raciais"><h3>Penalidades</h3>{penaltyPercent?.trim() && <strong className="visual-modifier-value">{percentage(penaltyPercent.trim(), '−')}</strong>}{penaltyAttributes?.trim() && <p>{penaltyAttributes}</p>}</section>}
          </div>}
          {description?.trim() && <div className="visual-race-description"><MarkdownText body={description}/></div>}
          <Content className="visual-race-variation-content"/>
        </section>;
      },
    },
    ConditionCatalog: {
      label: 'Catálogo de condições',
      fields: { title: labelledShort('Título do catálogo'), conditions: { type: 'array', label: 'Condições', getItemSummary: (item) => item.name || 'Nova condição', arrayFields: { name: labelledShort('Nome da condição'), category: labelledShort('Categoria'), description: labelledLong('Descrição completa') } } },
      defaultProps: { title: 'Condições', conditions: [] },
      render: ({ title, conditions }) => conditions.length ? <section className="visual-condition-catalog" data-condition-catalog>
        {title?.trim() && <h2 className="visual-heading" id={anchorFor(title)}>{title}</h2>}
        <div className="visual-catalog-tools"><label><span className="visually-hidden">Buscar condição</span><input type="search" data-condition-search placeholder="Buscar condição..." autoComplete="off"/></label><div className="visual-catalog-filters" role="group" aria-label="Filtrar categoria de condição">
          <button type="button" data-condition-filter="" aria-pressed="true">Todas</button>
          {[...new Set(conditions.map((condition) => condition.category).filter(Boolean))].map((category) => <button type="button" key={category} data-condition-filter={category} aria-pressed="false">{category}</button>)}
        </div></div>
        {[...new Set(conditions.map((condition) => condition.category).filter(Boolean))].map((category) => <section className="visual-condition-group" data-condition-group key={category}><h3 id={anchorFor(category)}>{category}</h3><div className="visual-condition-grid">{conditions.filter((condition) => condition.category === category).map((condition, index) => <article className="visual-condition-card" data-condition-card data-category={condition.category} key={`${condition.name}-${index}`}><h4>{condition.name}</h4><div className="visual-markdown"><MarkdownText body={condition.description}/></div></article>)}</div></section>)}
        <p className="visual-catalog-empty" data-condition-empty hidden>Nenhuma condição corresponde à busca.</p><p className="visually-hidden" data-condition-count aria-live="polite">{conditions.length} condições</p>
      </section> : <EmptyHint label="Adicionar condições"/>,
    },
    WeaponCatalog: {
      label: 'Catálogo de armas',
      fields: { title: labelledShort('Título do catálogo'), weapons: { type: 'array', label: 'Armas', getItemSummary: (item) => item.name || 'Nova arma', arrayFields: { name: labelledShort('Nome da arma'), category: labelledShort('Tipo ou categoria'), traits: labelledShort('Marcadores'), description: labelledLong('Descrição'), scale: labelledShort('Escala'), attribute: labelledShort('Atributo'), hands: labelledShort('Mãos'), range: labelledShort('Alcance'), reload: labelledShort('Recarga'), ammunition: labelledShort('Munição'), critical: labelledLong('Efeito crítico') } } },
      defaultProps: { title: 'Armas', weapons: [] },
      render: ({ title, weapons }) => weapons.length ? <section className="visual-weapon-catalog" data-weapon-catalog>
        {title?.trim() && <h2 className="visual-heading" id={anchorFor(title)}>{title}</h2>}
        <label className="visual-catalog-search"><span className="visually-hidden">Buscar arma</span><input type="search" data-weapon-search placeholder="Buscar por nome, tipo ou efeito..." autoComplete="off"/></label>
        <div className="visual-weapon-grid">{weapons.map((weapon, index) => <article className="visual-weapon-card" data-weapon-card key={`${weapon.name}-${index}`}>
          <header><div>{weapon.category && <span className="visual-weapon-category">{weapon.category}</span>}<h3 id={anchorFor(weapon.name)}>{weapon.name}</h3></div>{weapon.scale && <div className="visual-weapon-scale"><span>Escala</span><strong>{weapon.scale}</strong></div>}</header>
          {weapon.traits?.trim() && <div className="visual-tags">{tags(weapon.traits)}</div>}
          {weapon.description?.trim() && <div className="visual-markdown"><MarkdownText body={weapon.description}/></div>}
          <dl className="visual-weapon-facts">{rows([['Atributo',weapon.attribute], ['Mãos',weapon.hands], ['Alcance',weapon.range], ['Recarga',weapon.reload], ['Munição',weapon.ammunition]].filter(([,v]) => v).map(([k,v]) => `${k}|${v}`).join('\n'))}</dl>
          {weapon.critical?.trim() && <div className="visual-weapon-critical"><strong>Efeito crítico</strong><div className="visual-markdown"><MarkdownText body={weapon.critical}/></div></div>}
        </article>)}</div>
        <p className="visual-catalog-empty" data-weapon-empty hidden>Nenhuma arma corresponde à busca.</p>
      </section> : <EmptyHint label="Adicionar armas"/>,
    },
    Locality: {
      label: 'Localidade', fields: { name: short, description: long, image: mediaField, imageAlt: short,
        imageApproved: { type: 'radio', options: [{ label: 'Aguardando', value: false }, { label: 'Aprovada', value: true }] } },
      defaultProps: { name: 'Nova localidade', description: '', image: '', imageAlt: '', imageApproved: false },
      render: ({ name, description, image, imageAlt, imageApproved }) => <section className="visual-locality"><h3 id={anchorFor(name)}>{name}</h3>{description && <MarkdownText body={description}/>}<Picture src={image} alt={imageAlt} approved={imageApproved}/></section>,
    },
    DataTable: {
      label: 'Tabela de valores', fields: { title: short, rows: { type: 'array', getItemSummary: (item) => item.name || 'Linha', arrayFields: { name: short, value: short } } },
      defaultProps: { title: 'Tabela', rows: [] },
      render: ({ title, rows: data }) => data.length ? <section><h2 className="visual-heading" id={anchorFor(title)}>{title}</h2><div className="visual-data-table"><table><tbody>{data.map((item,i) => <tr key={i}><th scope="row">{item.name}</th><td>{item.value}</td></tr>)}</tbody></table></div></section> : <EmptyHint label={`Adicionar linhas: ${title}`}/> ,
    },
    Markdown: {
      label: 'Texto completo / Regras', fields: { body: long },
      defaultProps: { body: 'Escreva aqui. **Negrito** e listas são aceitos.' },
      render: ({ body }) => <div className="visual-markdown"><MarkdownText body={body}/></div>,
    },
    Heading: {
      label: 'Título de seção', fields: { title: short, level: { type: 'select', options: [{ label: 'Título', value: 'h2' }, { label: 'Subtítulo', value: 'h3' }] } },
      defaultProps: { title: 'Nova seção', level: 'h2' },
      render: ({ title, level }) => !title?.trim() ? <EmptyHint label="Título"/> : level === 'h3' ? <h3 className="visual-heading" id={anchorFor(title)}>{title}</h3> : <h2 className="visual-heading" id={anchorFor(title)}>{title}</h2>,
    },
    Text: {
      label: 'Parágrafo', fields: { text: long }, defaultProps: { text: 'Novo parágrafo...' },
      render: ({ text }) => text?.trim() ? <div className="visual-markdown"><MarkdownText body={text}/></div> : <EmptyHint label="Adicionar parágrafo"/>,
    },
    Tags: {
      label: 'Marcadores / Tags', fields: { items: long }, defaultProps: { items: 'Raça, Biológico' },
      render: ({ items }) => items?.trim() ? <div className="visual-tags">{tags(items)}</div> : <EmptyHint label="Adicionar marcadores"/>,
    },
    Stats: {
      label: 'Atributos principais', fields: { items: long }, defaultProps: { items: 'HP | 80\nForça | +10%' },
      render: ({ items }) => items?.trim() ? <dl className="visual-stats">{rows(items)}</dl> : <EmptyHint label="Adicionar atributos"/>,
    },
    Media: {
      label: 'Imagem ou GIF',
      fields: { src: mediaField, alt: short, caption: short, approved: { type: 'radio', options: [{ label: 'Aguardando aprovação', value: false }, { label: 'Aprovada pelo dono', value: true }] },
        align: { type: 'select', options: [{ label: 'Esquerda', value: 'left' }, { label: 'Centro', value: 'center' }, { label: 'Direita', value: 'right' }, { label: 'Largura total', value: 'full' }] },
        size: { type: 'select', options: [{ label: 'Pequena', value: 'small' }, { label: 'Média', value: 'medium' }, { label: 'Grande', value: 'large' }] },
      },
      defaultProps: { src: '', alt: '', caption: '', approved: false, align: 'center', size: 'medium' },
      render: ({ src, alt, caption, approved, align, size }) => !src || !approved ? <></> : <div className={`visual-media visual-media-${align} visual-media-${size}`}><Picture src={src} alt={alt} caption={caption} approved={approved}/></div>,
    },
    Gallery: {
      label: 'Galeria (fotos e GIFs)',
      fields: {
        images: { type: 'array', getItemSummary: (item) => item.caption || item.alt || 'Imagem', arrayFields: { src: mediaField, alt: short, caption: short, approved: { type: 'radio', options: [{ label: 'Aguardando', value: false }, { label: 'Aprovada', value: true }] } } },
        columns: { type: 'select', options: [{ label: '2 colunas', value: '2' }, { label: '3 colunas', value: '3' }, { label: '4 colunas', value: '4' }] },
      },
      defaultProps: { images: [{ src: '', alt: '', caption: '', approved: false }], columns: '2' },
      render: ({ images, columns }) => {
        const visible = images.filter((image) => image.src && image.approved);
        return visible.length ? <div className={`visual-gallery visual-gallery-${columns}`}>{visible.map((image, i) => <Picture key={i} {...image}/>)}</div> : <EmptyHint label="Adicionar imagens à galeria"/>;
      },
    },
    TwoColumns: {
      label: 'Duas colunas livres',
      fields: {
        ratio: { type: 'select', options: [{ label: 'Metade / metade', value: 'equal' }, { label: 'Esquerda maior', value: 'left' }, { label: 'Direita maior', value: 'right' }] },
        left: { type: 'slot' }, right: { type: 'slot' },
      },
      defaultProps: { ratio: 'equal', left: [], right: [] },
      render: ({ ratio, left: Left, right: Right }) => <div className={`visual-columns visual-columns-${ratio}`}><Left className="visual-column"/><Right className="visual-column"/></div>,
    },
    Subrace: {
      label: 'Ficha interna de subraça',
      fields: {
        name: short, subtitle: short, badges: short, stats: long, portrait: mediaField, portraitAlt: short,
        portraitApproved: { type: 'radio', options: [{ label: 'Aguardando aprovação', value: false }, { label: 'Aprovada pelo dono', value: true }] },
        side: { type: 'select', options: [{ label: 'Imagem à direita', value: 'right' }, { label: 'Imagem à esquerda', value: 'left' }, { label: 'Imagem acima', value: 'above' }] },
        content: { type: 'slot' },
      },
      defaultProps: { name: 'Nova subraça', subtitle: '', badges: 'Subraça', stats: '', portrait: '', portraitAlt: '', portraitApproved: false, side: 'right', content: [] },
      render: ({ name, subtitle, badges, stats, portrait, portraitAlt, portraitApproved, side, content: Content }) => <section className={`visual-subrace visual-subrace-${side}`}>
        <div className="visual-subrace-head">
          <div className="visual-subrace-heading">
            <div className="visual-tags">{tags(badges)}</div><h2 id={anchorFor(name)}>{name}</h2>
            {subtitle && <p className="visual-subrace-subtitle">{subtitle}</p>}
            {stats && <dl className="visual-stats">{rows(stats)}</dl>}
          </div>
          {(portrait && portraitApproved) && <div className="visual-subrace-picture"><Picture src={portrait} alt={portraitAlt || `Ilustração de ${name}`} approved={portraitApproved}/></div>}
        </div>
        <Content className="visual-subrace-body"/>
      </section>,
    },
    Callout: {
      label: 'Caixa de destaque', fields: { title: short, text: long },
      defaultProps: { title: 'Observação', text: 'Texto importante desta ficha.' },
      render: ({ title, text }) => <aside className="visual-callout"><strong>{title}</strong><div className="visual-markdown"><MarkdownText body={text}/></div></aside>,
    },
  },
};
