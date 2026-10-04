#!/usr/bin/env python3
"""Builds the CJK fonts the web build ships.

    /path/to/venv/bin/python tools/build-cjk-fonts.py [--celestia DIR] [--source FONT]

Celestia draws every HUD string, every label and the whole information panel
with one font, and the one it ships, DejaVuSans, has no CJK glyphs: a translated
interface comes out as boxes. Celestia itself expects a CJK-capable font from the
system or from celestia.cfg for those languages, so the web build carries one.

Carrying all of Noto Sans SC would be 18 MB, and only the characters the
catalogues actually use are needed, so each language gets a subset: the
characters in its own po file, plus the ASCII the engine formats numbers and
symbols with. The variable font is instanced at a fixed weight first, since
FreeType renders a static face without needing variation support.

Noto Sans SC is under the SIL Open Font License, which allows redistribution.

The po files come from a Celestia checkout; the font is downloaded once into
/tmp if it is not already there.
"""

import argparse
import os
import re
import subprocess
import sys
import urllib.request
from pathlib import Path

FONT_URL = (
    "https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@main"
    "/Sans/Variable/TTF/Subset/NotoSansSC-VF.ttf"
)

# The languages whose catalogues need glyphs DejaVuSans does not have.
LANGUAGES = ["zh_CN", "zh_TW", "ja", "ko"]

# The date and time text ICU writes into the HUD. It is not in the catalogues,
# because ICU builds it from its own data at run time: the HUD's date reads
# 2026 10月 04日 星期六 in Chinese, and none of those characters appear in a po
# file, so a subset built from the catalogues alone draws them as boxes. They are
# listed here rather than derived, since deriving them would mean running ICU for
# every locale at build time for a few dozen characters.
DATE_AND_TIME_CHARACTERS = (
    # Chinese: year, month, day, hour, minute, second, weekday
    "年月日时分秒星期週周上午下午正"
    "一二三四五六七八九十两零"
    # Japanese
    "月火水木金土日曜時午前後"
    # Korean
    "년월일시분초요일오전오후"
    # The separators ICU puts between them
    "·・"
)

# Everything the engine prints around the translated words: digits, punctuation,
# the degree and magnitude signs, and the ASCII the catalogues fall back to.
BASE_CHARACTERS = (
    "".join(chr(c) for c in range(0x20, 0x7F))
    + "°′″±×·—–…‘’“”¥€£§¶†‡•‰∞≈≠≤≥→←↑↓"
    + "「」『』【】《》〈〉、。，．：；！？（）〔〕"
    + "\u00a0\u2009\u200a\u200b\u202f"
    + DATE_AND_TIME_CHARACTERS
)


def characters_for(po: Path) -> set[str]:
    """Every character the catalogue can put on screen."""
    text = po.read_text(encoding="utf-8", errors="replace")
    characters = set(BASE_CHARACTERS)

    for line in text.splitlines():
        # The msgid is English, but a missing translation is shown as it stands,
        # so its characters are needed too.
        match = re.match(r'^(?:msgid|msgstr)\s+"(.*)"$', line)
        if match is None:
            continue
        value = match.group(1)
        # Po escapes its own quotes and newlines.
        value = value.replace('\\"', '"').replace("\\n", "\n").replace("\\\\", "\\")
        characters.update(value)

    # Control characters never reach the screen and upset the subsetter.
    return {c for c in characters if c.isprintable() or c == " "}


def ensure_font(path: Path) -> Path:
    if path.exists():
        return path
    print(f"downloading {FONT_URL}")
    path.parent.mkdir(parents=True, exist_ok=True)
    urllib.request.urlretrieve(FONT_URL, path)
    return path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--celestia",
        default=os.environ.get("CELESTIA_SRC", os.path.expanduser("~/Documents/Celestia")),
    )
    parser.add_argument("--source", default="/tmp/NotoSansSC-VF.ttf")
    parser.add_argument("--out", default=None, help="defaults to public/fonts")
    options = parser.parse_args()

    from fontTools.ttLib import TTFont
    from fontTools.varLib.instancer import instantiateVariableFont
    from fontTools.subset import Subsetter, Options

    po_directory = Path(options.celestia) / "po"
    if not po_directory.is_dir():
        print(f"no po directory at {po_directory}", file=sys.stderr)
        return 1

    output = Path(options.out) if options.out else Path(__file__).resolve().parent.parent / "public" / "fonts"
    output.mkdir(parents=True, exist_ok=True)

    source = ensure_font(Path(options.source))

    for language in LANGUAGES:
        po = po_directory / f"{language}.po"
        if not po.exists():
            print(f"skipping {language}: no {po}")
            continue

        characters = characters_for(po)

        font = TTFont(source)
        # A fixed instance: FreeType draws a static face, and Celestia asks for
        # one size per style rather than a variation axis.
        instantiateVariableFont(font, {"wght": 400}, inplace=True)

        subset_options = Options()
        subset_options.layout_features = ["*"]
        subset_options.name_IDs = ["*"]
        subset_options.notdef_outline = True
        subset_options.recalc_bounds = True
        subset_options.drop_tables += ["DSIG"]

        subsetter = Subsetter(options=subset_options)
        subsetter.populate(text="".join(sorted(characters)))
        subsetter.subset(font)

        target = output / f"NotoSansSC-{language}.ttf"
        font.save(target)
        print(f"{language:6} {len(characters):5} characters  {target.stat().st_size / 1024:7.0f} kB  {target.name}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
