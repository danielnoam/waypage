# Reading activity: `activity/reading.json`

With Settings › GitHub sync › Other apps › **Share reading activity** on
(it's off by default), Waypage writes one file to the person's own
`waypage-data` repo: `activity/reading.json`. Any app the person connects
to that repo can read it to know what they're reading. Waypage writes it
when it syncs and something in it changed; turning the switch off
removes it at the next sync, and nothing else in the repo.

This is a public format. **Fields are only ever added.** A field that
has to change meaning gets a new name; `schema` goes up only when an old
field is removed, after a while of writing both. Readers should ignore
fields they don't know.

## The file

```json
{
  "schema": 1,
  "app": "waypage",
  "updatedAt": "2026-11-13T09:00:00Z",
  "items": [
    {
      "id": "k3j9x2m1q8wa",
      "kind": "serial",
      "title": "The Wandering Inn",
      "author": "pirateaba",
      "collection": "The Wandering Inn",
      "progress": 0.78,
      "chapters": { "read": 31, "total": 40 },
      "startedAt": "2026-11-08",
      "finishedAt": null,
      "minutes": 412
    }
  ],
  "days": { "2026-11-12": { "read": 34, "listened": 20 } }
}
```

| Field | Meaning |
| --- | --- |
| `schema` | 1. Goes up only when a field is removed. |
| `app` | Always `"waypage"`. |
| `updatedAt` | When this copy was written, UTC, to the second. |
| `items[].id` | Stable across devices and syncs. A clip's id; `f` and a 32-hex fingerprint for a file read from outside (each device has its own clip id for it); `s` and a short hash of the story's page for a serial. |
| `items[].kind` | `book`, `audiobook`, `comic`, `serial` or `article`. New kinds may be added. |
| `items[].title` | As named in the library. |
| `items[].author` | The byline, or `""`. |
| `items[].collection` | Its collection's name, or `""`. A serial's is its own. |
| `items[].progress` | 0 to 1: the furthest place read, an audiobook's time heard, a serial's chapters read over all. 1 once finished. |
| `items[].chapters` | Only for serials (chapters finished, chapters saved) and audiobooks with chapters (chapters heard). |
| `items[].startedAt` | The first day with time in it (`YYYY-MM-DD`, the device's local day), or null when unknown. |
| `items[].finishedAt` | The day it was finished, else null. A serial's is set when every saved chapter is finished, and goes back to null when a new one comes. |
| `items[].minutes` | Time spent in it, from every device. |
| `days` | Minutes a day from every device (local days). `read` is reading by eye; `listened` is audiobooks and Narrate. They don't overlap. Days with neither are left out. |

`days` covers everything read in Waypage, not only the listed items.

## What's listed

The kind comes from Waypage's own marks, never a guess:

| kind | from |
| --- | --- |
| `audiobook` | an audiobook (`file.kind` `"audio"`) |
| `comic` | a CBZ file, or anything saved or shown as a comic (`comic`) |
| `book` | an EPUB, PDF, MOBI, AZW3 or FB2 file |
| `serial` | a collection linked to a story's page, the kind that finds new chapters; its chapters aren't listed on their own |
| `article` | a web clip with none of the above |

- Each kind has its own switch under Share reading activity. Books,
  audiobooks, comics and serials start on; articles start off.
- Notes and other files (Markdown, text,
  HTML, email, PowerPoint) are never listed.
- Something is listed once about 10 minutes went into it or 5% of it is
  read, or it's finished.
- In other apps (off) in a clip's or collection's ⋯ keeps it out. It
  syncs, so it holds on every device.
- No text, highlights, notes, drawings or links are in the file.

## Several devices

Each device with the switch on writes the whole file from the synced
library and the stats of every device, so they agree. A file read from
outside that's only on another device keeps the item that device wrote.
