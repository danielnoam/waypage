# Makes collection.anki2 beside this file: a small Anki collection in the
# older, schema 11 layout that Anki writes when "Support older Anki
# versions" is ticked on export (test/anki.test.js and ankiimport.test.js read it).
# Run: python -I test/fixtures/anki/make-collection.py
#
# Built from Anki's documented tables, not exported by Anki itself. Pages
# are 512 bytes so a few hundred rows make a tree several levels deep, and a
# long field spills into overflow pages: the cases a real deck hits.
import json, os, sqlite3

here = os.path.dirname(os.path.abspath(__file__))
path = os.path.join(here, "collection.anki2")
if os.path.exists(path):
    os.remove(path)
db = sqlite3.connect(path)
db.execute("PRAGMA page_size = 512")
db.executescript("""
CREATE TABLE col (id integer primary key, crt integer not null, mod integer not null, scm integer not null, ver integer not null,
  dty integer not null, usn integer not null, ls integer not null, conf text not null, models text not null, decks text not null,
  dconf text not null, tags text not null);
CREATE TABLE notes (id integer primary key, guid text not null, mid integer not null, mod integer not null, usn integer not null,
  tags text not null, flds text not null, sfld integer not null, csum integer not null, flags integer not null, data text not null);
CREATE TABLE cards (id integer primary key, nid integer not null, did integer not null, ord integer not null, mod integer not null,
  usn integer not null, type integer not null, queue integer not null, due integer not null, ivl integer not null, factor integer not null,
  reps integer not null, lapses integer not null, left integer not null, odue integer not null, odid integer not null,
  flags integer not null, data text not null);
CREATE TABLE revlog (id integer primary key, cid integer not null, usn integer not null, ease integer not null, ivl integer not null,
  lastIvl integer not null, factor integer not null, time integer not null, type integer not null);
CREATE INDEX ix_notes_usn on notes (usn);
CREATE INDEX ix_cards_nid on cards (nid);
CREATE INDEX ix_revlog_cid on revlog (cid);
""")

def model(mid, name, kind, flds, tmpls):
    return {"id": mid, "name": name, "type": kind,
            "flds": [{"name": f, "ord": i} for i, f in enumerate(flds)],
            "tmpls": [{"name": "Card %d" % (i + 1), "ord": i, "qfmt": q, "afmt": a} for i, (q, a) in enumerate(tmpls)]}

models = {
    "1": model(1, "Basic", 0, ["Front", "Back"], [("{{Front}}", "{{FrontSide}}<hr id=answer>{{Back}}")]),
    "2": model(2, "Basic (and reversed card)", 0, ["Front", "Back"], [("{{Front}}", "{{Back}}"), ("{{Back}}", "{{Front}}")]),
    "3": model(3, "Cloze", 1, ["Text", "Extra"], [("{{cloze:Text}}", "{{cloze:Text}}<br>{{Extra}}")]),
}
decks = {"1": {"id": 1, "name": "Default"}, "2": {"id": 2, "name": "German::Nouns"}, "3": {"id": 3, "name": "Spanish"}}
db.execute("INSERT INTO col VALUES (1, 1700000000, 0, 0, 11, 0, 0, 0, '{}', ?, ?, '{}', '{}')", (json.dumps(models), json.dumps(decks)))

SEP = "\x1f"
nid = [1700000000000]
cid = [1700000100000]
def note(mid, fields, did, cards, tags=""):
    nid[0] += 1
    db.execute("INSERT INTO notes VALUES (?, ?, ?, 0, 0, ?, ?, 0, 0, 0, '')", (nid[0], "g%d" % nid[0], mid, tags, SEP.join(fields)))
    out = []
    for ord_, kw in cards:
        cid[0] += 1
        card = dict(type=0, queue=0, ivl=0, reps=0, lapses=0, due=0)
        card.update(kw)
        db.execute("INSERT INTO cards VALUES (?, ?, ?, ?, 0, 0, ?, ?, ?, ?, 2500, ?, ?, 0, 0, 0, 0, '')",
                   (cid[0], nid[0], did, ord_, card["type"], card["queue"], card["due"], card["ivl"], card["reps"], card["lapses"]))
        out.append(cid[0])
    return out

def rev(card, at, ease, kind, ms=4000):
    db.execute("INSERT INTO revlog VALUES (?, ?, 0, ?, 1, 0, 2500, ?, ?)", (at, card, ease, ms, kind))

# 1. A plain card with a history: learned, passed, then forgotten.
[haus] = note(1, ["Haus", "house"], 2, [(0, dict(type=2, queue=2, ivl=4, reps=3, lapses=1))])
rev(haus, 1700000200000, 2, 0); rev(haus, 1700000800000, 3, 1); rev(haus, 1700086400000 * 5, 1, 1)
# 2. HTML, entities, a sound and a picture in the fields.
note(1, ["Buch<br>(<b>das</b>)", "book&nbsp;&amp; volume<div>second &lt;line&gt;</div>[sound:x.mp3]<img src=\"a.jpg\">"], 2, [(0, {})])
# 3. A reversed note: two cards, the second asks for the back.
note(2, ["Katze", "cat"], 2, [(0, {}), (1, dict(queue=-1))])
# 4. A cloze note with two blanks, one card each.
note(3, ["Berlin is the {{c1::capital}} of {{c2::Germany::country}}.", "Extra words"], 2, [(0, {}), (1, {})])
# 5. A long field, which overflows its page.
note(1, ["Long", "x" * 6000], 3, [(0, {})])
# 6. A picture and nothing to read on the front.
note(1, ["<img src=\"x.png\">", "a picture"], 3, [(0, {})])
# 7. An Anki card with the "ease" of a manual reschedule: not a review.
[resched] = note(1, ["Resched", "x"], 3, [(0, {})])
rev(resched, 1700001000000, 0, 4)
# 8. Many more, so the b-trees have interior pages.
for i in range(300):
    c = note(1, ["palabra%d" % i, "palabra %d, in Spanish" % i], 3, [(0, {})])[0]
    if i % 3 == 0:
        rev(c, 1700002000000 + i * 1000, 3 if i % 2 else 2, 0)
db.commit()
db.execute("VACUUM")
db.close()
print(path, os.path.getsize(path), "bytes")
