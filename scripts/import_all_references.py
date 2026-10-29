"""Importação inicial do RAR de Avalon, sem sobrescrever fichas já revisadas.

Uso (somente durante a preparação do projeto):
  python scripts/import_all_references.py --archive ../upload/dai.rar

Depende de Python com lxml e da biblioteca de sistema libarchive (RAR5).
O administrador comum NÃO precisa executar este script: depois da importação,
o Editor Avalon usa exclusivamente Node.js e os arquivos Markdown/JSON.
"""

from __future__ import annotations

import argparse
import ctypes
import ctypes.util
import hashlib
import json
import re
from pathlib import Path

from lxml import html
from import_references import page_markdown, write_entry, tidy


RACES = {
    "metamorfo": ("metamorfo", "Metamorfo"),
    "___anjo": ("anjo", "Anjo"),
    "___demonios": ("demonios", "Demônios"),
    "___inseto_teste": ("insetoide", "Insetóide"),
    "___licantropo": ("licantropo", "Licantropo"),
    "___rakshasa": ("rakshasa", "Rakshasa"),
    "__analogo": ("analogo", "Análogo"),
    "__monstros": ("monstros", "Monstros"),
    "___an_es": ("anoes", "Anões"),
    "___bruxa": ("bruxas", "Bruxas"),
    "___cog_reploid": ("cog-reploid", "Cog / Reploid"),
    "___construtos": ("construtos", "Construtos"),
    "___demi_humano": ("demi-humano", "Demi-Humanos"),
    "___doggos": ("doggos", "Doggos"),
    "___fada": ("fadas", "Fadas"),
    "___gatoss": ("gatos", "Gatos"),
    "___goblins": ("goblins", "Goblins"),
    "___slimes": ("slimes", "Slimes"),
    "___undead": ("mortos-vivos", "Mortos-Vivos"),
}

RULES = {
    "avalon_mundano": ("origens", "mundanos", "Mundanos"),
    "avalon___tecnologia": ("origens", "tecnologia", "Tecnologia"),
    "avalon_condi__es": ("sistemas-basicos", "condicoes", "Condições"),
    "avalon_party": ("sistemas-basicos", "party", "Sistema de Party"),
    "avalon___armas": ("sistemas-basicos", "armas", "Armas"),
    "avalon___miss_es": ("sistemas-basicos", "missoes-e-narracoes", "Missões e Narrações"),
    "avalon___modificadores": ("sistemas-basicos", "modificadores", "Modificadores e Perícias"),
    "_afinidade_e_intera": ("sistemas-basicos", "afinidade", "Afinidade e Interações Sociais"),
}


def read_rar(archive_path: Path):
    library = ctypes.util.find_library("archive")
    if not library:
        raise RuntimeError("libarchive não encontrada neste computador")
    lib = ctypes.CDLL(library)
    lib.archive_read_new.restype = ctypes.c_void_p
    functions = [
        ("archive_read_support_format_all", [ctypes.c_void_p], ctypes.c_int),
        ("archive_read_support_filter_all", [ctypes.c_void_p], ctypes.c_int),
        ("archive_read_open_filename", [ctypes.c_void_p, ctypes.c_char_p, ctypes.c_size_t], ctypes.c_int),
        ("archive_read_next_header", [ctypes.c_void_p, ctypes.POINTER(ctypes.c_void_p)], ctypes.c_int),
        ("archive_read_data", [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_size_t], ctypes.c_ssize_t),
        ("archive_entry_pathname", [ctypes.c_void_p], ctypes.c_char_p),
        ("archive_read_free", [ctypes.c_void_p], ctypes.c_int),
    ]
    for name, types, result in functions:
        fn = getattr(lib, name)
        fn.argtypes, fn.restype = types, result
    pointer = lib.archive_read_new()
    lib.archive_read_support_format_all(pointer)
    lib.archive_read_support_filter_all(pointer)
    if lib.archive_read_open_filename(pointer, str(archive_path).encode(), 10240) != 0:
        raise RuntimeError(f"Não foi possível ler {archive_path}")
    seen = set()
    try:
        while True:
            item = ctypes.c_void_p()
            if lib.archive_read_next_header(pointer, ctypes.byref(item)) != 0:
                break
            filename = lib.archive_entry_pathname(item).decode("utf-8", "replace").split("/")[-1]
            if not filename.endswith(".htm"):
                continue
            chunks = []
            buff = ctypes.create_string_buffer(65536)
            while True:
                size = lib.archive_read_data(pointer, buff, 65536)
                if size <= 0:
                    break
                chunks.append(buff.raw[:size])
            raw = b"".join(chunks)
            signature = hashlib.sha256(raw).digest()
            if signature in seen:
                print("[cópia idêntica ignorada]", filename)
                continue
            seen.add(signature)
            yield filename, raw.decode("utf-8", "replace")
    finally:
        lib.archive_read_free(pointer)


def extract_table(table):
    lines = []
    for row in table.xpath(".//tr"):
        cols = [tidy(" ".join(cell.itertext())).replace("|", "\\|") for cell in row.xpath("./th|./td")]
        if cols:
            lines.append(cols)
    if not lines:
        return ""
    width = max(len(line) for line in lines)
    data = [row + [""] * (width - len(row)) for row in lines]
    if len(data) < 2:
        return "  \n".join(" · ".join(row) for row in data)
    return "\n".join([
        "| " + " | ".join(data[0]) + " |",
        "| " + " | ".join("---" for _ in range(width)) + " |",
        *("| " + " | ".join(row) + " |" for row in data[1:]),
    ])


def source_pages(source: str):
    tree = html.fromstring(source)
    pages = tree.xpath('//*[@id="result"]//div[contains(concat(" ",normalize-space(@class)," ")," page ")]')
    if not pages:
        raise ValueError("Sem conteúdo na área principal do documento")
    return pages


def body_of(pages):
    output = []
    for i, page in enumerate(pages):
        body = page_markdown(page, skip_first_heading=False, ignore_index=True)
        tables = [extract_table(table) for table in page.xpath('.//table')]
        tables = [table for table in tables if table]
        if tables:
            body += "\n\n" + "\n\n".join(tables)
        if body.strip():
            output.append(body.strip())
    return "\n\n".join(output)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--archive", type=Path, default=Path("../upload/dai.rar"))
    ap.add_argument("--target", type=Path, default=Path("src/content/entries"))
    ap.add_argument("--layouts", type=Path, default=Path("src/content/layouts"))
    args = ap.parse_args()
    imported, skipped = 0, 0
    for name, source in read_rar(args.archive):
        prefix = name.split("-")[0]
        if prefix == "avalon":
            pages = source_pages(source)
            intro = body_of(pages[:1]).split("## [RAÇAS DE AVALON]")[0].strip()
            layout = {"root": {"props": {}}, "content": [
                {"type": "Markdown", "props": {"id": "intro-avalon", "body": intro or "## Avalon, o Começo"}},
            ]}
            args.layouts.mkdir(parents=True, exist_ok=True)
            target = args.layouts / "inicio.json"
            if not target.exists():
                target.write_text(json.dumps(layout, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
                print("[página inicial]", target)
            continue
        section_slug = next((v for key, v in RULES.items() if prefix.startswith(key)), None)
        if prefix.startswith("ra_as_"):
            section_slug = next((('racas', *v) for key, v in RACES.items() if key in prefix), None)
        if not section_slug:
            skipped += 1
            print("[já existente ou fora da migração]", name)
            continue
        section, slug, title = section_slug
        destination = args.target / section / f"{slug}.md"
        if destination.exists() and "status: demonstracao" not in destination.read_text(encoding="utf-8")[:1200]:
            skipped += 1
            print("[preservada edição existente]", destination)
            continue
        pages = source_pages(source)
        body = body_of(pages)
        if not body:
            print("[atenção: sem conteúdo]", name)
            continue
        if destination.exists():
            backup = Path("legacy-demo/entries") / section / f"{slug}.md"
            backup.parent.mkdir(parents=True, exist_ok=True)
            if not backup.exists():
                backup.write_text(destination.read_text(encoding="utf-8"), encoding="utf-8")
        headings = [tidy(" ".join(h.itertext())) for p in pages for h in p.xpath(".//h1") if tidy(" ".join(h.itertext()))]
        hp = re.search(r"\b(?:HP\s+Base\s*|HP\s*[-:]?\s*)(\d+)\b", " ".join(headings), re.I)
        badges = ["Raça"] if section == 'racas' else ["Origem"] if section == 'origens' else ["Sistema básico"]
        stats = [{"label": "HP Base", "value": hp.group(1)}] if hp and section == 'racas' else []
        summary = f"{title}: regras, características e variações conforme o material original de Avalon."
        write_entry(args.target, section=section, slug=slug, title=title,
                    summary=summary, body=body, tags=[title], badges=badges,
                    stats=stats, source=name)
        imported += 1
    print(f"Importação finalizada: {imported} fichas novas ou substituições de demonstrações; {skipped} referências mantidas.")


if __name__ == "__main__":
    main()
