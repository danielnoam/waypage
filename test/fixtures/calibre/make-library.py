# Builds metadata.db, a small Calibre library's database, with the tables
# and columns Calibre's own has (books, authors, series, tags, their link
# tables, comments, data). `python3 make-library.py` from this folder.
import os, sqlite3

if os.path.exists("metadata.db"):
    os.remove("metadata.db")
db = sqlite3.connect("metadata.db")
db.executescript("""
CREATE TABLE books ( id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL DEFAULT 'Unknown' COLLATE NOCASE,
  sort TEXT COLLATE NOCASE, timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP, pubdate TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  series_index REAL NOT NULL DEFAULT 1.0, author_sort TEXT COLLATE NOCASE, isbn TEXT DEFAULT "" COLLATE NOCASE,
  lccn TEXT DEFAULT "" COLLATE NOCASE, path TEXT NOT NULL DEFAULT "", flags INTEGER NOT NULL DEFAULT 1,
  uuid TEXT, has_cover BOOL DEFAULT 0, last_modified TIMESTAMP NOT NULL DEFAULT "2000-01-01 00:00:00+00:00");
CREATE TABLE authors ( id INTEGER PRIMARY KEY, name TEXT NOT NULL COLLATE NOCASE, sort TEXT COLLATE NOCASE, link TEXT NOT NULL DEFAULT "", UNIQUE(name));
CREATE TABLE books_authors_link ( id INTEGER PRIMARY KEY, book INTEGER NOT NULL, author INTEGER NOT NULL, UNIQUE(book, author));
CREATE TABLE series ( id INTEGER PRIMARY KEY, name TEXT NOT NULL COLLATE NOCASE, sort TEXT COLLATE NOCASE, link TEXT NOT NULL DEFAULT "", UNIQUE (name));
CREATE TABLE books_series_link ( id INTEGER PRIMARY KEY, book INTEGER NOT NULL, series INTEGER NOT NULL, UNIQUE(book));
CREATE TABLE tags ( id INTEGER PRIMARY KEY, name TEXT NOT NULL COLLATE NOCASE, link TEXT NOT NULL DEFAULT "", UNIQUE (name));
CREATE TABLE books_tags_link ( id INTEGER PRIMARY KEY, book INTEGER NOT NULL, tag INTEGER NOT NULL, UNIQUE(book, tag));
CREATE TABLE comments ( id INTEGER PRIMARY KEY, book INTEGER NOT NULL, text TEXT NOT NULL COLLATE NOCASE, UNIQUE(book));
CREATE TABLE data ( id INTEGER PRIMARY KEY, book INTEGER NOT NULL, format TEXT NOT NULL COLLATE NOCASE,
  uncompressed_size INTEGER NOT NULL, name TEXT NOT NULL, UNIQUE(book, format));
""")
db.executemany("INSERT INTO authors (id, name, sort) VALUES (?, ?, ?)", [(1, "Ursula K. Le Guin", "Le Guin, Ursula K."), (2, "Frank Herbert", "Herbert, Frank")])
books = [
    (1, "A Wizard of Earthsea", "Wizard of Earthsea, A", "2026-01-02 10:00:00+00:00", 1.0, "Le Guin, Ursula K.", "Ursula K. Le Guin/A Wizard of Earthsea (1)", "uuid-1", 1),
    (2, "The Tombs of Atuan", "Tombs of Atuan, The", "2026-03-04 10:00:00+00:00", 2.0, "Le Guin, Ursula K.", "Ursula K. Le Guin/The Tombs of Atuan (2)", "uuid-2", 0),
    (3, "Dune", "Dune", "2026-02-01 10:00:00+00:00", 1.0, "Herbert, Frank", "Frank Herbert/Dune (3)", "uuid-3", 0),
]
db.executemany("INSERT INTO books (id, title, sort, timestamp, series_index, author_sort, path, uuid, has_cover) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", books)
db.executemany("INSERT INTO books_authors_link (book, author) VALUES (?, ?)", [(1, 1), (2, 1), (3, 2)])
db.execute("INSERT INTO series (id, name, sort) VALUES (1, 'Earthsea', 'Earthsea')")
db.executemany("INSERT INTO books_series_link (book, series) VALUES (?, ?)", [(1, 1), (2, 1)])
db.executemany("INSERT INTO tags (id, name) VALUES (?, ?)", [(1, "Fantasy"), (2, "Science Fiction")])
db.executemany("INSERT INTO books_tags_link (book, tag) VALUES (?, ?)", [(1, 1), (2, 1), (3, 2)])
db.execute("INSERT INTO comments (book, text) VALUES (1, '<p>A boy called <b>Ged</b> &amp; a shadow.</p>')")
db.executemany("INSERT INTO data (book, format, uncompressed_size, name) VALUES (?, ?, ?, ?)", [
    (1, "EPUB", 2000, "A Wizard of Earthsea - Ursula K. Le Guin"), (1, "PDF", 9000, "A Wizard of Earthsea - Ursula K. Le Guin"),
    (2, "EPUB", 2000, "The Tombs of Atuan - Ursula K. Le Guin"), (3, "LRF", 100, "Dune - Frank Herbert")])
db.commit()
db.close()
