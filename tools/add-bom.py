"""Add a UTF-8 byte order mark to the site files.

The BOM is a three-byte signature that explicitly declares "this file is
UTF-8". Many editors detect it and preserve the encoding instead of rewriting
the file in the local Windows code page, which was destroying the accented
characters and the emoji in this project.

Browsers ignore the BOM in HTML, CSS and JavaScript.

This file is deliberately ASCII-only: the editor rewrites any file containing
non-ASCII characters in cp1252, which would corrupt the script itself.

Usage: python tools/add-bom.py
"""

import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent

FILES = ["index.html", "admin/index.html", "assets/data.js", "assets/style.css"]

BOM = b"\xef\xbb\xbf"

for name in FILES:
    path = ROOT / name
    if not path.exists():
        print("%-22s missing" % name)
        continue

    raw = path.read_bytes()
    if raw.startswith(BOM):
        print("%-22s BOM already present" % name)
        continue

    raw.decode("utf-8")  # refuse to sign a file that is not valid UTF-8
    path.write_bytes(BOM + raw)
    print("%-22s BOM added" % name)
