# CLAUDE.md — ptbr project context

## What this project is

A browser-based Portuguese rhyme and lyric tool. Users type a word and get ranked rhymes, near-rhymes, and assonances. A secondary **ESQ mode** searches a corpus of 474 real song lyrics for stanzas sharing the same rhyme profile, and clicking a result opens the full song with the matching stanza highlighted.

---

## File map

| File | Role |
|------|------|
| `exp/index.html` | Entire app — phonetic engine, scoring, UI, corpus, lyrics panel (~3100 lines, self-contained) |
| `phonetic-engine.js` | IPA consonant distance table (Chomsky & Halle features) — imported by Node CLIs only |
| `build-corpus.js` | CLI: `upload/letras_final.json` → `dic/corpus-schemes.json` |
| `rhyme-extract.js` | CLI: extract rhyme schemes from individual songs, with `--genre/--artist/--song/--index` flags |
| `dic/palavras.txt` | ~320k Portuguese words, one per line |
| `dic/corpus-schemes.json` | 474 songs × deduplicated stanzas in compact `{a,t,g,s[]}` format (139 KB) |
| `upload/letras_final.json` | 478 song lyrics with full text — lazy-loaded in-browser on first card click |

---

## Key functions in exp/index.html

| Function | What it does |
|----------|-------------|
| `silabificar(word)` | Splits word into syllables using Portuguese rules |
| `identificarTonica(silabasList)` | Finds index of stressed syllable |
| `extrairRima(word)` | Returns string from tonic vowel to end (`pastel` → `el`) |
| `perfilFonetico(word)` | Returns full phonetic profile: `{p, sil, tonicaIndex, rimaPerfeita, vogaisRima, onsetTonico, espinhaVocal, vogalTonica, numSilabas, acentuacao, ...}` |
| `calcScore(a, b)` | Multi-criteria score comparing two phonetic profiles |
| `processarBusca()` | Main search: scores all dictionary words against `alvoAtual`, applies filters |
| `renderCorpus(results)` | Renders ESQ mode corpus cards |
| `buscarCorpus(perfil)` | Finds corpus stanzas matching a phonetic profile |
| `abrirLetra(r)` | Lazy-loads full lyrics, highlights matching stanza, shows lyrics panel |
| `fecharLetra()` | Returns to corpus view, restores scroll position |
| `toggleCorpusMode()` | Switches between rhyme-finder and ESQ corpus views |

---

## Scoring system

`calcScore()` returns a number. Bands:

| Score | Label |
|-------|-------|
| ≥ 160 | Rima (perfect rhyme) |
| ≥ 130 | Quase-rima |
| ≥ 100 | Eco forte |
| ≥ 60  | Assonância |
| ≥ 25  | Proximidade |
| ≥ 10  | Ritmo |

Key weights: `rimaPerfeita` exact = +125 (dominant), `onsetTonico` full = +20, `espinhaVocal` = +20. Rhyme quality always outranks structural coincidence.

---

## State variables

| Variable | Description |
|----------|-------------|
| `alvoAtual` | Phonetic profile of the current anchor word (`null` in filter-only mode) |
| `alvoB` | Second word for intersection search |
| `dicionario` | Array of all phonetic profiles, loaded once on startup |
| `resultadosFiltrados` | Current filtered result set |
| `FILTROS` | Object of locked filter values (exact match) |
| `FILTROS_NEG` | Negated filter flags |
| `FILTROS_CONTEM` | Free-text filter values (vowels, consonants, onset fields) |
| `modoCorpus` | Boolean: ESQ mode active |
| `corpusEsquemas` | Loaded corpus index (`null` until first ESQ use) |
| `letrasDict` | `Map<"artista§titulo", letra>` — built lazily on first card click |
| `corpusScrollY` | Saved scroll position in `#corpus-viewport` for back-navigation |

---

## Development branch

Active branch: `claude/fix-tonic-syllable-scoring-jkbj4`
Backup snapshot: `backup/corpus-v1`

Always push to the active branch. Never push to main without explicit instruction.

---

## How to run locally

```bash
python -m http.server 8000
# open http://localhost:8000/exp/index.html
```

On Windows: double-click `start.bat`.

---

## Rebuild corpus index after changing lyrics or phonetic engine

```bash
node build-corpus.js
# output: dic/corpus-schemes.json
```
