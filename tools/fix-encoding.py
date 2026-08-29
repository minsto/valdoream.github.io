"""Repare l'encodage des fichiers du site et met les emojis a l'abri.

Contexte : sur ce poste Windows, certains editeurs reecrivent les fichiers dans
l'encodage local (cp1252) au lieu d'UTF-8. Deux degats en decoulent :

  * les accents restent lisibles mais le fichier n'est plus de l'UTF-8 valide,
    ce qui affiche des caracteres parasites dans le navigateur ;
  * les emojis, absents de cp1252, sont remplaces par des '?' -- perte seche.

Ce script corrige le premier probleme (reencodage en UTF-8) et supprime la cause
du second : chaque emoji est reecrit en entite HTML numerique (&#128081;), une
forme purement ASCII que plus aucun reencodage ne peut abimer. Le navigateur
l'affiche exactement pareil.

Usage : python tools/fix-encoding.py
"""

import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent

HTML_FILES = ["index.html", "admin/index.html", "portal/index.html"]

# Le code des Functions ne recoit pas de BOM : il passe par le bundler de
# Cloudflare, autant ne rien y ajouter. On se contente de verifier son encodage.
OTHER_FILES = [
    "assets/data.js",
    "assets/style.css",
    "README.md",
    "functions/admin/_middleware.js",
    "functions/admin/api/content.js",
    "functions/api/content.js",
]

BOM = "\ufeff"

# Emojis du panel admin deja detruits par un reencodage : on les remet.
# Un emoji hors du plan de base compte pour deux '?' (paire de substitution),
# trois s'il est suivi du selecteur de variante U+FE0F.
LOST_EMOJI = [
    ('<h2 class="admin-title">?? Valdoream', '<h2 class="admin-title">&#128081; Valdoream'),
    (">?? Vue d'ensemble<", ">&#128202; Vue d'ensemble<"),
    (">?? Nouveaut\u00e9s & Posts<", ">&#128226; Nouveaut\u00e9s & Posts<"),
    (">?? Gestion Joueurs<", ">&#128101; Gestion Joueurs<"),
    (">?? Ventes & Articles<", ">&#128722; Ventes & Articles<"),
    (">??? Console Serveur<", ">&#128421;&#65039; Console Serveur<"),
]

# Les points de suspension typographiques ont deja ete abimes plusieurs fois par
# les reecritures. Trois points ASCII s'affichent pareil et ne risquent rien, y
# compris a l'interieur d'une chaine JavaScript ou une entite HTML ne marcherait
# pas.
NORMALIZE = [("\u2026", "...")]

# Le CSS n'accepte pas les entites HTML : on utilise ses propres echappements.
CSS_ESCAPES = [
    ('content: "\u2694\ufe0f";', 'content: "\\2694\\FE0F";'),
    ('content: "\u2713";', 'content: "\\2713";'),
]


def decode(raw, name):
    try:
        return raw.decode("utf-8"), "UTF-8"
    except UnicodeDecodeError:
        pass

    # 0x9D n'existe pas en cp1252. On l'a deja vu apparaitre a la place de
    # points de suspension ET a la place d'un 'e' accentue, donc impossible de
    # deviner : on signale la position pour une verification a l'oeil.
    if b"\x9d" in raw:
        positions = [i for i, b in enumerate(raw) if b == 0x9D]
        print("  ATTENTION %s : octet 0x9D aux positions %s, remplace par '...'"
              % (name, positions))
        raw = raw.replace(b"\x9d", b"\x85")

    try:
        return raw.decode("cp1252"), "cp1252 -> UTF-8"
    except UnicodeDecodeError as err:
        sys.exit("%s : encodage inconnu (%s)" % (name, err))


def is_fragile(char):
    if ord(char) < 128:
        return False
    try:
        char.encode("cp1252")
        return False
    except UnicodeEncodeError:
        return True


def to_entities(text):
    return "".join("&#%d;" % ord(c) if is_fragile(c) else c for c in text)


def process(name, html):
    path = ROOT / name
    if not path.exists():
        print("%-22s absent, ignore" % name)
        return 0

    text, how = decode(path.read_bytes(), name)
    before = text

    # Le BOM est une signature d'encodage, pas du contenu : on le met de cote
    # pour ne pas le transformer en entite HTML, et on le remet a l'ecriture.
    # On rattrape aussi le cas ou une execution precedente l'a deja converti.
    text = text.lstrip("\ufeff")
    if text.startswith("&#65279;"):
        text = text[len("&#65279;"):]

    for old, new in NORMALIZE:
        text = text.replace(old, new)

    if html:
        for old, new in LOST_EMOJI:
            text = text.replace(old, new)
        text = to_entities(text)
    elif name.endswith(".css"):
        for old, new in CSS_ESCAPES:
            text = text.replace(old, new)
    elif name.endswith(".md"):
        text = to_entities(text)

    wants_bom = name in HTML_FILES or name.startswith("assets/")
    signed = BOM + text if wants_bom else text
    path.write_bytes(signed.encode("utf-8"))

    remaining = sorted({c for c in text if is_fragile(c)})
    print("%-22s %-16s %s" % (
        name,
        how,
        "inchange" if signed == before else "corrige"
    ))
    return len(remaining)


def main():
    fragile_left = 0
    for name in HTML_FILES:
        fragile_left += process(name, html=True)
    for name in OTHER_FILES:
        fragile_left += process(name, html=False)

    print()
    leftovers = []
    # Seuls les fichiers HTML portent des emojis ; en JavaScript, '??' est
    # l'operateur de coalescence et n'a rien de suspect.
    for name in HTML_FILES:
        path = ROOT / name
        if not path.exists():
            continue
        text = path.read_text(encoding="utf-8")
        bad = [n for n, line in enumerate(text.splitlines(), 1) if "??" in line]
        if bad:
            leftovers.append("%s : '??' suspect lignes %s" % (name, bad))

    if leftovers:
        print("A VERIFIER A LA MAIN :")
        for item in leftovers:
            print("  " + item)
        return 1

    print("Tous les fichiers sont en UTF-8 valide, aucun emoji perdu.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
