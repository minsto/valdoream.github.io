"""Git msg-filter: retire la ligne Co-authored-by de Cursor des messages de commit."""
import sys

lines = sys.stdin.read().splitlines()
clean = [line for line in lines if line.strip() != "Co-authored-by: Cursor <cursoragent@cursor.com>"]
sys.stdout.write("\n".join(clean))
if clean and not clean[-1].endswith("\n"):
    sys.stdout.write("\n")
