# CLAUDE.md — ptbr project context

## What this project is

A browser-based Portuguese rhyme and lyric tool. Users type a word and get ranked rhymes, near-rhymes, and assonances. A secondary **ESQ mode** searches a corpus of 474 real song lyrics for stanzas sharing the same rhyme profile, and clicking a result opens the full song with the matching stanza highlighted.

---

## File map

| File | Role |
|------|------|
| `exp/index.html` | Entire app — phonetic engine, scoring, UI, corpus, lyrics panel (~2860 lines, self-contained) |
| `phonetic-engine.js` | IPA consonant distance table (Chomsky & Halle features). Dual-mode: `window.PhoneticEngine` in the browser, `module.exports` in Node. Loaded by `exp/index.html` and `som/` (page + worker) via `../phonetic-engine.js` — the Node CLIs do *not* require it |
| `build-corpus.js` | CLI: `upload/letras_final.json` → `dic/corpus-schemes.json` |
| `rhyme-extract.js` | CLI: extract rhyme schemes from individual songs, with `--genre/--artist/--song/--index` flags |
| `dic/palavras.txt` | 145,744 Portuguese words, one per line (1.5 MB) |
| `dic/corpus-schemes.json` | 474 songs × deduplicated stanzas in compact `{a,t,g,s[]}` format (139 KB) |
| `upload/letras_final.json` | 478 song lyrics with full text (`{artista, titulo, letra, genero, fonte}`) — lazy-loaded in-browser on first card click |
| `som/` | **Som** — mobile-first "navegue semelhanças": one engine, four zoom levels (palavra `degustar`, fim `-bula` / início `ge-`, sílaba `ge`, som `t`). `engine.js` (G2P + weighted distances, dual-mode, testable in Node), `worker.js` (indexes `dic/palavras.txt` off the UI thread), `index.html` (UI). Loads `../phonetic-engine.js` |
| `song-analysis.html` | Standalone page "Eco Sonoro" — phonetic analysis of a full lyric. **Carries its own inlined copy of the phonetic engine** |
| `exp/v02.html` | Older standalone prototype ("Vocalis"), own inlined engine — historical, not wired to anything |
| `exp/index.backup.html` | Pre-refactor snapshot of `exp/index.html` — historical |
| `backup/` | Timestamped snapshots of `exp/` taken before risky engine changes |

---

## Key functions in exp/index.html

| Function | What it does |
|----------|-------------|
| `silabificar(word)` | Splits word into syllables using Portuguese rules |
| `identificarTonica(silabas, palavra)` | Returns index of the stressed syllable — see *Stress assignment* below |
| `extrairRima(silabas, tonicaIndex)` | Returns string from tonic vowel to end (`pas-TEL` → `el`). Takes the syllable array + stress index, **not** the word — the `u` of `qu`/`gu` + vowel is skipped (`al-GUÉM` → `ém`, `QUE-ro` → `ero`) |
| `perfilFonetico(word)` | Returns full phonetic profile: `{p, sil, tonicaIndex, rimaPerfeita, vogaisRima, onsetTonico, espinhaVocal, vogalTonica, numSilabas, acentuacao, ...}` |
| `calcScore(a, b)` | Multi-criteria score comparing two phonetic profiles |
| `processarBusca()` | Main search: scores all dictionary words against `alvoAtual`, applies filters |
| `renderCorpus(results)` | Renders ESQ mode corpus cards |
| `buscarCorpus(alvo)` | Finds corpus stanzas matching a phonetic profile |
| `abrirLetra(r)` | Lazy-loads full lyrics, highlights matching stanza, shows lyrics panel |
| `fecharLetra()` | Returns to corpus view, restores scroll position |
| `toggleCorpusMode()` | Switches between rhyme-finder and ESQ corpus views |

---

## ⚠️ The phonetic engine is duplicated in 4 places

`silabificar`, `identificarTonica`, `extrairRima` and the helpers around them are
**copy-pasted**, not shared. A fix to one is a fix to none:

| Copy | Used by |
|------|---------|
| `exp/index.html` | the live app |
| `build-corpus.js` | corpus index build |
| `rhyme-extract.js` | per-song CLI |
| `song-analysis.html` | Eco Sonoro page |
| `som/engine.js` | Som (`silabificar`, `identificarTonica` + helpers, verbatim) |

Always patch all four (five, counting `som/engine.js`), then rebuild the corpus. `exp/index.backup.html` and
`exp/v02.html` hold two more stale copies — leave those alone, they are archives.

Verify: `grep -n "function identificarTonica" -A 10 exp/index.html build-corpus.js rhyme-extract.js song-analysis.html som/engine.js`

---

## Stress assignment (`identificarTonica`)

Resolution order — first rule that fires wins:

1. Explicit acute/circumflex accent (`á é í ó ú â ê ô`) → that syllable.
2. Nasal tilde (`ã õ`) → that syllable.
3. Oxytone endings `r l z x i is u us im ins om ons um uns` → last syllable.
4. Paroxytone endings `a as e es o os am em ens` → penultimate.
5. Default → penultimate.

Rules 3 and 4 encode Portuguese orthography, where the written accent marks the
*exception*: an unaccented word ending in `-om`/`-ons` is necessarily oxytone
(gar-ÇOM, mar-ROM), which is exactly why paroxytones in `-m` must be accented
(ímã, hífen, pólen). Before adding an ending to rule 3, diff the whole of
`dic/palavras.txt` old-regex vs new-regex and inspect every word that changes class.

Known gaps, deliberately left alone:

- **`-n`** is orthographically oxytone, but all 119 unaccented `-n` words in the
  dictionary are unadapted loanwords pronounced as paroxytones in BP (bacon,
  login, design, slogan, kelvin). Adding it would cause more errors than it fixes.
- **Accented diphthongs** — `tratarHiatosVogais` tests `/^(ai|au|ei|eu|iu|oi|ou|ui|ão|õe|ãe)$/`
  without the accented variants, so `troféu` splits as `tro-FÉ-u` (3 syllables
  instead of 2). Stress lands correctly; only the syllable count is wrong.

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

Active branch: `claude/exp-stress-accent-fix-qmkvj0`

Always push to the active branch. Never push to main without explicit instruction.
Confirm the branch actually exists before trusting this line — it goes stale after
every merge (`git branch -a`).

Snapshots of `exp/` live in `backup/exp-<timestamp>/`, each with a README naming
the commit it was taken from. Take one before touching the phonetic engine.

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

Required after **any** change to syllabification, stress or rhyme extraction —
the corpus stores pre-computed rhyme tokens, so a stale index silently disagrees
with the live app. To confirm a rebuild did what you expected, diff the rhyme-token
frequencies before and after rather than eyeballing the JSON.
