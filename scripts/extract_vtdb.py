#!/usr/bin/env python3
"""Läser en Vectric-verktygsdatabas (.vtdb, SQLite) och skriver data/tools.js.

Användning:  python3 scripts/extract_vtdb.py [databas.vtdb] [utfil.js]
"""
import json
import re
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "data" / "verkstaden5-vectric-hobby.vtdb"
OUT = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / "data" / "tools.js"

# Vectric-gruppnamn -> frästyp i appen
GROUP_TYPE = {
    "Uppåtskärande fräsar, 2-skäriga": "upcut",
    "Aluminiumfräsar, 1-skäriga": "upcut",
    "Plastfräsar O-flute, 1-skäriga": "upcut",
    "Nedåtskärande fräsar, 1-skäriga": "downcut",
    "Nedåtskärande fräsar, 2-skäriga": "downcut",
    "Kompressionsfräsar": "compression",
    "Notfräsar (raka)": "straight",
    "Kulfräsar": "ball",
    "Koniska radiefräsar": "tapered",
    "V-bitar": "vbit",
    "PCB-fräsar": "pcb",
    "Avrundningsfräsar": "roundover",
    "Planfräsar": "surfacing",
    "Kopierfräsar": "flush",
    "V-spårfräsar för ACM": "acm",
}

# Databasens materialnamn -> id i appen
MATERIAL_ID = {
    "Hårt trä": "hardwood",
    "Mjukt träslag / Plywood": "softwood",
    "MDF / Spånskiva": "mdf",
    "Melamin": "melamine",
    "Akryl (PMMA)": "acrylic",
    "Hård plast (POM, PC, nylon)": "hardplastic",
    "Mjuk plast (HDPE, LDPE, PP)": "softplastic",
    "Aluminium": "aluminium",
    "FR4 / PCB": "fr4",
    "ACM / Dibond": "acm",
}

CHIP_RE = re.compile(r"^(.+?) chipload:\s*([\d.]+)\s*mm/tand", re.M)


def r(x, n=3):
    return None if x is None else round(float(x), n)


def main():
    c = sqlite3.connect(f"file:{SRC}?mode=ro", uri=True)
    c.row_factory = sqlite3.Row

    root = c.execute("select name, notes from tool_tree_entry where parent_group_id is null").fetchone()
    groups = {
        row["id"]: row["name"]
        for row in c.execute("select id, name from tool_tree_entry where tool_geometry_id is null and parent_group_id is not null")
    }

    tools = []
    q = """
        select t.parent_group_id, t.sibling_order, g.*
        from tool_tree_entry t join tool_geometry g on g.id = t.tool_geometry_id
        order by t.parent_group_id, t.sibling_order
    """
    for g in c.execute(q):
        group = groups[g["parent_group_id"]]
        chip_notes = {MATERIAL_ID[m.strip()]: float(v) for m, v in CHIP_RE.findall(g["notes"] or "")}
        cuts = {}
        for d in c.execute(
            """select m.name as material, d.* from tool_entity e
               join material m on m.id = e.material_id
               join tool_cutting_data d on d.id = e.tool_cutting_data_id
               where e.tool_geometry_id = ?""",
            (g["id"],),
        ):
            mid = MATERIAL_ID[d["material"]]
            flutes = g["num_flutes"] or 1
            chip = chip_notes.get(mid)
            cuts[mid] = {
                "feed": r(d["feed_rate"], 0),
                "plunge": r(d["plunge_rate"], 0),
                "rpm": d["spindle_speed"],
                "stepdown": r(d["stepdown"]),
                "stepover": r(d["stepover"]),
                "chip": r(chip if chip is not None else d["feed_rate"] / (d["spindle_speed"] * flutes)),
                "chipSource": "db" if chip is not None else "calc",
            }
        name = g["name_format"]
        tools.append({
            "code": name,
            "group": group,
            "type": GROUP_TYPE[group],
            "vtype": g["tool_type"],
            "d": r(g["diameter"]),
            "flutes": g["num_flutes"] or 1,
            "len": r(g["flute_length"], 2),
            "angle": r(g["included_angle"], 1),
            "tip": r(g["flat_diameter"]),
            "radius": r(g["tip_radius"]),
            "dlc": "-DLC-" in name,
            "cuts": cuts,
        })

    data = {
        "source": SRC.name,
        "library": root["name"],
        "notes": (root["notes"] or "").replace("\r\n", "\n"),
        "tools": tools,
    }
    OUT.write_text(
        "// Genererad av scripts/extract_vtdb.py från " + SRC.name + " – redigera inte för hand.\n"
        "window.TOOL_DB = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n",
        encoding="utf-8",
    )
    print(f"{len(tools)} fräsar, {sum(len(t['cuts']) for t in tools)} skärdata -> {OUT}")


if __name__ == "__main__":
    main()
