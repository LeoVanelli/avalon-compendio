"""Importa os sete HTMLs de referência do Avalon para fichas Markdown.

Uso (opcional, a partir da pasta do projeto):
  python scripts/import_references.py --source-dir ../upload

Requer lxml apenas para reimportar. Os arquivos Markdown gerados são
independentes do script e não exigem Python para o site funcionar.
"""

from __future__ import annotations

import argparse
import json
import re
import unicodedata
from html import escape as escape_html
from pathlib import Path

from lxml import html


def quote(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def tidy(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def slugify(value: str) -> str:
    value = unicodedata.normalize("NFD", value)
    value = "".join(ch for ch in value if unicodedata.category(ch) != "Mn")
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", value.lower())).strip("-")


def inline(node) -> str:
    """Texto e ênfases em linha, ignorando imagens e links remotos."""
    parts = [node.text or ""]
    for child in node:
        tag = child.tag if isinstance(child.tag, str) else ""
        content = inline(child) if tag not in ("img", "script", "style") else ""
        if tag in ("strong", "b") and content.strip():
            content = f"**{content.strip()}**"
        elif tag in ("em", "i") and content.strip():
            content = f"*{content.strip()}*"
        elif tag == "code" and content.strip():
            content = f"`{content.strip()}`"
        elif tag == "br":
            content = "  \n"
        parts.append(content)
        parts.append(child.tail or "")
    text = "".join(parts).replace("\xa0", " ")
    text = re.sub(r"[ \t]+", " ", text)
    return text.strip()


SKIP_TITLES = {
    "RAÇAS DE AVALON",
    "ORIGENS DE ARTEFATOS",
    "ORIGENS SOBRENATURAIS",
    "REGIÕES DO NEXUS",
    "AVALON - MÓDULO DE COMBATE BÁSICO",
}


def page_markdown(page, skip_first_heading=False, ignore_index=False) -> str:
    lines = []
    first_heading = True
    skip_index_list = False
    expr = './/h1|.//h2|.//h3|.//h4|.//h5|.//h6|.//p|.//ul|.//ol|.//blockquote|.//div[contains(concat(" ", normalize-space(@class), " "), " traits ")]'
    for node in page.xpath(expr):
        tag = node.tag
        if node.xpath('ancestor::li|ancestor::blockquote') and tag in ("p", "ul", "ol"):
            continue
        if tag.startswith("h") and len(tag) == 2 and tag[1].isdigit():
            heading = tidy(" ".join(node.itertext()))
            if skip_first_heading and first_heading:
                first_heading = False
                continue
            first_heading = False
            if heading.upper() in SKIP_TITLES or heading.upper().startswith("EXEMPLOS DE "):
                continue
            if ignore_index and heading == "Índice":
                skip_index_list = True
                continue
            level = 2 if tag == "h1" else 3 if tag == "h2" else 4
            lines.append("#" * level + " " + heading)
        elif tag == "p":
            text = inline(node)
            if text:
                lines.append(text)
        elif tag in ("ul", "ol"):
            if skip_index_list:
                skip_index_list = False
                continue
            list_lines = []
            for n, li in enumerate(node.xpath("./li"), start=1):
                body = tidy(inline(li))
                if body:
                    list_lines.append(f"{n}. {body}" if tag == "ol" else f"- {body}")
            if list_lines:
                lines.append("\n".join(list_lines))
        elif tag == "blockquote":
            body = tidy(" ".join(node.itertext()))
            if body:
                lines.append("> " + body)
        elif tag == "div" and "traits" in node.get("class", "").split():
            labels = [tidy(" ".join(x.itertext())) for x in node.xpath("./div")]
            labels = [label for label in labels if label]
            if labels:
                chips = "".join(f'<span class="trait-chip">{escape_html(label)}</span>' for label in labels)
                lines.append(f'<div class="trait-list" aria-label="Marcadores da habilidade">{chips}</div>')
    result = "\n\n".join(lines)
    return re.sub(r"\n{3,}", "\n\n", result).strip()


def pages_from(source_dir: Path, stem: str):
    matches = list(source_dir.glob(f"{stem}*.html"))
    if len(matches) != 1:
        raise ValueError(f"Esperado um HTML com prefixo {stem!r}, encontrados: {matches}")
    tree = html.fromstring(matches[0].read_text(encoding="utf-8"))
    pages = tree.xpath('//*[@id="result"]//div[contains(concat(" ",normalize-space(@class)," ")," page ")]')
    if not pages:
        raise ValueError(f"Nenhuma página encontrada em {matches[0]}")
    return pages, matches[0].name


def headers_from(body: str) -> list[str]:
    return list(dict.fromkeys(re.findall(r"^#{2,4}\s+(.+)$", body, re.MULTILINE)))[:36]


def write_entry(target: Path, *, section: str, slug: str, title: str, summary: str,
                body: str, tags=(), related=(), featured=False, source="", facts=(),
                badges=(), stats=()):
    lines = [
        "---",
        f"section: {section}",
        f"slug: {quote(slug)}",
        f"title: {quote(title)}",
        f"eyebrow: {quote('Registro do Beta')}",
        f"summary: {quote(summary)}",
        f"tags: {json.dumps(list(tags), ensure_ascii=False)}",
        f"badges: {json.dumps(list(badges), ensure_ascii=False)}",
        f"stats: {json.dumps(list(stats), ensure_ascii=False)}",
        f"searchTerms: {json.dumps(headers_from(body), ensure_ascii=False)}",
        f"related: {json.dumps(list(related), ensure_ascii=False)}",
        f"facts: {json.dumps(list(facts), ensure_ascii=False)}",
        f"sourceDocument: {quote(source)}",
        f"featured: {str(featured).lower()}",
        "status: referencia",
        "published: true",
        "---",
        "",
        body.strip(),
        "",
    ]
    path = target / section / f"{slug}.md"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines), encoding="utf-8")
    print(path)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-dir", type=Path, default=Path("../upload"))
    parser.add_argument("--target-dir", type=Path, default=Path("src/content/entries"))
    args = parser.parse_args()
    src, dst = args.source_dir, args.target_dir

    humans, human_src = pages_from(src, "ra_as_avalon__humanp-")
    elves, elves_src = pages_from(src, "ra_as_de_avalon__elfos_novos-")
    giants, giant_src = pages_from(src, "ra_as_de_avalon___gigantes-")
    # O arquivo de Humanos distribui variações por várias páginas impressas.
    human_body = "\n\n".join(page_markdown(p, skip_first_heading=(i == 0))
                             for i, p in enumerate(humans) if i not in (4, 6, 8))
    human_body = human_body.replace("## Humanos tem 4 variações, especifique qual a sua entre:",
                                    "## Variações de Humanos")
    human_body = re.sub(r"^## \* (Humano[^\n]+)$", r"- **\1**", human_body, flags=re.MULTILINE)
    write_entry(dst, section="racas", slug="humanos", title="Humanos",
                summary="Raça com quatro variações descritas no material: Adaptável, Médio, Elíseo e Ura.",
                body=human_body, source=human_src, tags=["Humano", "Adaptável", "Médio", "Elíseo", "Ura"], featured=True,
                facts=[{"label": "Variações", "value": "4"}], badges=["Raça", "Quatro variações"],
                stats=[{"label": "Variações", "value": "4"},
                       {"label": "HP · Adaptável", "value": "50"},
                       {"label": "HP · Médio", "value": "80"},
                       {"label": "HP · Elíseo", "value": "100"},
                       {"label": "HP · Ura", "value": "50"}])
    for slug, title, pages, origin, summary, stats in [
        ("elfos", "Elfos", elves, elves_src, "Raça ligada às regiões de forte presença mágica de Avalon.",
         [{"label": "Bônus", "value": "+10% MAG e DES", "tone": "bonus"},
          {"label": "Penalidade", "value": "−10% FOR e CON", "tone": "penalty"}]),
        ("gigantes", "Gigantes", giants, giant_src, "Raça de grande porte, força e resistência descrita no material de referência.",
         [{"label": "Bônus", "value": "+50% FOR e CON", "tone": "bonus"},
          {"label": "Penalidade", "value": "−50% SOR e DES", "tone": "penalty"}]),
    ]:
        write_entry(dst, section="racas", slug=slug, title=title, summary=summary,
                    body=page_markdown(pages[0], skip_first_heading=True), source=origin,
                    tags=["Raça", title], featured=slug == "elfos", badges=["Raça"], stats=stats)

    artifacts, artifacts_src = pages_from(src, "avalon___artefatos_-")
    artefact_names = ["Ancestral", "Guerreiro", "Conjurador", "Canalha", "Servo", "Tulpa"]
    a_refs = [f"origens/artefatos/{slugify(name)}" for name in artefact_names]
    intro = page_markdown(artifacts[0], skip_first_heading=True)
    intro += "\n\n## Origens deste grupo\n\n" + "\n".join(
        f"- [{name}](./{slugify(name)}/)" for name in artefact_names)
    write_entry(dst, section="origens", slug="artefatos", title="Artefatos",
                summary="Origens de Artefatos, com seis caminhos e suas habilidades descritas no HTML enviado.",
                body=intro, source=artifacts_src, tags=["Origens", "Artefatos"], related=a_refs, featured=True,
                facts=[{"label": "Grupo", "value": "Origens de Artefatos"}, {"label": "Origens", "value": "6"}],
                badges=["Origem", "Artefatos"], stats=[{"label": "Caminhos disponíveis", "value": "6"}])
    for name, page in zip(artefact_names, artifacts[1:7]):
        slug = f"artefatos/{slugify(name)}"
        write_entry(dst, section="origens", slug=slug, title=name,
                    summary=f"Origem de Artefato: {name}. Consulte características e habilidades do material fornecido.",
                    body=page_markdown(page, skip_first_heading=True), source=artifacts_src,
                    tags=["Origem", "Artefatos", name], related=["origens/artefatos"],
                    facts=[{"label": "Tipo", "value": "Artefato"}],
                    badges=["Origem", "Artefato"])

    supernaturals, supernatural_src = pages_from(src, "avalon_sobrenatural_-")
    supernatural_names = ["Contratado", "Abençoado", "EGO!", "Receptáculo", "Reencarnado", "Carniceiro"]
    s_refs = [f"origens/sobrenaturais/{slugify(name)}" for name in supernatural_names]
    supernatural_intro = ("Este grupo reúne as Origens Sobrenaturais do documento fornecido. "
                          "Selecione uma origem para conhecer seus requisitos, capacidades e técnicas.\n\n"
                          "## Origens deste grupo\n\n" + "\n".join(
                              f"- [{name}](./{slugify(name)}/)" for name in supernatural_names))
    write_entry(dst, section="origens", slug="sobrenaturais", title="Sobrenaturais",
                summary="Origens Sobrenaturais: Contratado, Abençoado, EGO!, Receptáculo, Reencarnado e Carniceiro.",
                body=supernatural_intro, source=supernatural_src, tags=["Origens", "Sobrenaturais"], related=s_refs, featured=True,
                facts=[{"label": "Grupo", "value": "Origens Sobrenaturais"}, {"label": "Origens", "value": "6"}],
                badges=["Origem", "Sobrenaturais"], stats=[{"label": "Caminhos disponíveis", "value": "6"}])
    for name, page in zip(supernatural_names, supernaturals):
        slug = f"sobrenaturais/{slugify(name)}"
        write_entry(dst, section="origens", slug=slug, title=name,
                    summary=f"Origem Sobrenatural: {name}. Consulte as características do documento fornecido.",
                    body=page_markdown(page, skip_first_heading=True), source=supernatural_src,
                    tags=["Origem", "Sobrenatural", name], related=["origens/sobrenaturais"],
                    facts=[{"label": "Tipo", "value": "Sobrenatural"}],
                    badges=["Origem", "Sobrenatural"],
                    stats=([{"label": "Requisito", "value": "800 palavras"}] if name in ("Abençoado", "EGO!")
                           else [{"label": "Requisito", "value": "500 palavras"}] if name == "Reencarnado" else []))

    regions, region_src = pages_from(src, "avalon_regi_es-")
    region_data = [
        ("Avalon", "avalon", "Continente diverso e expansivo, incluindo Linngrave, Ash Lake, Sofya City, El Scaro e Rokoko City.", "Linngrave", "Ash Lake", "Sofya City", "El Scaro", "Rokoko City"),
        ("Antory", "antory", "Arquipélago diverso e político, incluindo Prontera, Payon, Penumbra e Lar da Arrogância.", "Prontera", "Payon", "Penumbra", "Lar da Arrogância"),
        ("The Great Divide", "the-great-divide", "Continente marcado por conflito e dualidade, com Bluteisen, Kamabuhay e The Unknown.", "Bluteisen", "Kamabuhay", "The Unknown"),
        ("Terrarium", "terrarium", "Fragmento flutuante e tripartido, formado por O Chão, O Caule e O Chapéu.", "O Chão", "O Caule", "O Chapéu"),
    ]
    region_traits = [
        ["Continente", "Diverso", "Expansivo"],
        ["Arquipélago", "Diverso", "Político"],
        ["Continente", "Conflito", "Dualidade"],
        ["Fragmento", "Flutuante", "Tripartido"],
    ]
    for i, (title, slug, summary, *places) in enumerate(region_data):
        body = page_markdown(regions[i * 2], skip_first_heading=True)
        write_entry(dst, section="regioes", slug=slug, title=title, summary=summary,
                    body=body, source=region_src, tags=["Região", *places], featured=i == 0,
                    facts=[{"label": "Localidades", "value": str(len(places))}],
                    badges=region_traits[i], stats=[{"label": "Localidades descritas", "value": str(len(places))}])

    combat, combat_src = pages_from(src, "avalon_combate-")
    combat_body = page_markdown(combat[0], skip_first_heading=True, ignore_index=True)
    combat_body += "\n\n" + "\n\n".join(page_markdown(p) for p in combat[1:])
    write_entry(dst, section="sistemas-basicos", slug="combate", title="Combate",
                summary="Módulo de Combate Básico: ações, modificadores, movimento, perícias e equipamentos.",
                body=combat_body, source=combat_src, tags=["Sistema Básico", "Ações", "Defender", "Dano", "Combate"], featured=True,
                related=["sistemas-basicos/pericias", "sistemas-basicos/habilidades"],
                badges=["Sistema Básico", "Combate"],
                stats=[{"label": "Ações por turno", "value": "3"},
                       {"label": "Reações por turno", "value": "1"}])
    write_entry(dst, section="sistemas-basicos", slug="pericias", title="Perícias",
                summary="Consulta das perícias gerais e de combate dentro dos Sistemas Básicos.",
                body="""## Perícias nos sistemas de Avalon

As perícias não são uma categoria principal independente. Elas aparecem junto às regras que as utilizam.

O documento de **Combate Básico** apresenta uma seção de **Perícias de Combate**, incluindo perícias de ataque, defesa, magia e resistência.

Para consultar seus detalhes e regras originais, [acesse o Módulo de Combate](../combate/).

> **Nota editorial:** esta página organiza a consulta. Não acrescenta novas regras às fornecidas nos HTMLs.
""", source=combat_src, tags=["Perícias", "Ataque", "Defesa", "Magia", "Resistência"],
                related=["sistemas-basicos/combate"], badges=["Sistema Básico", "Perícias"])
    write_entry(dst, section="sistemas-basicos", slug="habilidades", title="Habilidades",
                summary="Entenda onde encontrar as habilidades ligadas a raças e origens de Avalon.",
                body="""## Habilidades no Compêndio

As habilidades pertencem aos registros que as concedem ou descrevem. Por isso, elas aparecem **dentro das páginas de Raças e Origens**, sem duplicar fichas.

- [Raças](../../racas/): os documentos de Humanos, Elfos e Gigantes apresentam características e técnicas.
- [Origens de Artefatos](../../origens/artefatos/): habilidades de Ancestral, Guerreiro, Conjurador, Canalha, Servo e Tulpa.
- [Origens Sobrenaturais](../../origens/sobrenaturais/): habilidades de Contratado, Abençoado, EGO!, Receptáculo, Reencarnado e Carniceiro.

> **Nota editorial:** esta página funciona como índice contextual. Os efeitos e requisitos devem ser consultados nas respectivas fichas de referência.
""", source="Índice editorial derivado dos HTMLs enviados", tags=["Habilidades", "Técnicas", "Origens", "Raças"],
                related=["origens/artefatos", "origens/sobrenaturais"],
                badges=["Sistema Básico", "Habilidades"])


if __name__ == "__main__":
    main()
