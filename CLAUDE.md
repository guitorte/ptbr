# CLAUDE.md — ptbr project context

## What this project is

A browser-based Portuguese rhyme and lyric tool. Users type a word and get ranked rhymes, near-rhymes, and assonances — or, in the stress-free **Consoantes** and **Vogais** modes, words with similar consonant or vowel skeletons. A secondary **ESQ mode** searches a corpus of 474 real song lyrics for stanzas sharing the same rhyme profile, and clicking a result opens the full song with the matching stanza highlighted.

> **ESQ mode has no entry point in the UI.** Its button (`btn-corpus`) was removed in commit `550fc85` (2026-06-28) to declutter the top bar; the code and its listeners are still there, null-guarded. Restoring it means adding the button back — don't assume users can reach it today.

---

## File map

| File | Role |
|------|------|
| `exp/index.html` | Entire app — phonetic engine, scoring, UI, corpus, lyrics panel (~3690 lines, self-contained) |
| `phonetic-engine.js` | IPA consonant distance table (Chomsky & Halle features). Dual-mode: `window.PhoneticEngine` in the browser, `module.exports` in Node. Loaded by `exp/index.html` and `som/` (page + worker) via `../phonetic-engine.js` — the Node CLIs do *not* require it |
| `build-corpus.js` | CLI: `upload/letras_final.json` → `dic/corpus-schemes.json` |
| `rhyme-extract.js` | CLI: extract rhyme schemes from individual songs, with `--genre/--artist/--song/--index` flags |
| `build-classes.js` | CLI: `node build-classes.js <PortiLexicon-UD clone>` → `dic/classes-comum.txt` + `dic/classes-completo.txt`. Re-run after changing either word list |
| `dic/classes-comum.txt`, `dic/classes-completo.txt` | Word classes from PortiLexicon-UD (MIT, `dic/PORTILEXICON-LICENSE`): one line per class combination, `<codes>\t<word> <word> …`, codes `s a v d o`. `-comum` = default base (27,721 of 31,113 words); `-completo` = rest of `palavras.txt` (55,168 of 133,072), loaded only with `?dic=completo` |
| `build-sentidos.js` | CLI: `node build-sentidos.js` → `dic/sentidos.txt` from `dic/substantivos-sentidos.csv`. Re-run after editing the CSV |
| `dic/substantivos-sentidos.csv` | **The user's own semantic classification** of the nouns (`Palavra, Seção, Categoria, Observação`; 13,009 rows). Source of truth for the meaning filter — edit this, not `sentidos.txt`. Section 5 ("Ruídos": 1,636 adjectives/participles, 246 verbs/pronouns, 78 typos) is ignored by the build |
| `dic/sentidos.txt` | Generated: one line per category, `<code>\t<word> <word> …` (codes `pes lug obj ser aca con doe tem fic ins rel`); 10,940 words, 105 KB |
| `dic/palavras.txt` | Full dictionary: 145,744 Portuguese words, one per line (1.5 MB). **Not the app's default base any more** — `exp/` uses it only with `?dic=completo`; `som/` still uses it |
| `dic/corpus-schemes.json` | 474 songs × deduplicated stanzas in compact `{a,t,g,s[]}` format (139 KB) |
| `upload/letras_final.json` | 478 song lyrics with full text (`{artista, titulo, letra, genero, fonte}`) — lazy-loaded in-browser on first card click |
| `som/` | **Som** — mobile-first "navegue semelhanças": one engine, four zoom levels (palavra `degustar`, fim `-bula` / início `ge-`, sílaba `ge`, som `t`). `engine.js` (G2P + weighted distances, dual-mode, testable in Node), `worker.js` (indexes `dic/palavras.txt` off the UI thread), `index.html` (UI). Loads `../phonetic-engine.js` |
| `song-analysis.html` | Standalone page "Eco Sonoro" — phonetic analysis of a full lyric. **Carries its own inlined copy of the phonetic engine** |
| `exp/v02.html` | Older standalone prototype ("Vocalis"), own inlined engine — historical, not wired to anything |
| `exp/index.backup.html` | Pre-refactor snapshot of `exp/index.html` — historical |
| `backup/` | Timestamped snapshots of `exp/` taken before risky engine changes |
| `dic/k-palavras.txt` | Common-word list (~52k lines: inflected forms, but also punctuation, names, acronyms). **The app's default dictionary** (`DIC_BASE = 'comum'`): `_listaBaseComum` keeps only lowercase, letters-only entries of 2+ chars → **31,113 words**. Also `PALAVRAS_COMUNS`. See *Dictionary base* |
| `dic/lexico.txt`, `letras/001.txt`, `upload/001` | **Not used by anything.** `lexico.txt` is a byte-identical copy of `palavras.txt`; the other two are 1-byte placeholder files |

---

## Key functions in exp/index.html

| Function | What it does |
|----------|-------------|
| `silabificar(word)` | Splits word into syllables using Portuguese rules |
| `identificarTonica(silabas, palavra)` | Returns index of the stressed syllable — see *Stress assignment* below |
| `extrairRima(silabas, tonicaIndex)` | Returns string from tonic vowel to end (`pas-TEL` → `el`). Takes the syllable array + stress index, **not** the word — the `u` of `qu`/`gu` + vowel is skipped (`al-GUÉM` → `ém`, `QUE-ro` → `ero`) |
| `idxNucleo(sil)` / `semGlideQU(s)` | Nucleus index of a syllable / strip the glide `u` of `qu`/`gu` + vowel. Every vowel-reading field (`onsetTonico`, `vogalTonica`, `vogaisRima`, `espinhaVocal`, `vogAntes/Depois`) goes through them, so `QUE-ro` has onset `qu`, stressed vowel `e` |
| `perfilFonetico(word)` | Returns full phonetic profile. Real field names: `{palavra, silabas, tonicaIndex, numSilabas, acentuacao, rimaPerfeita, vogaisRima, onsetTonico, vogalTonica, espinhaVocal, espinhaConsonantal, esq, esqV, assConsonantal, consAntes, vogAntes, consDepois, vogDepois, grafAntes, grafDepois, tracosCoda, familiaCluster, coda, classe, freq}` — note `palavra`/`silabas`, **not** `p`/`sil` |
| `calcScore(a, b)` | Multi-criteria score comparing two phonetic profiles |
| `processarBusca()` | Main search: scores all dictionary words against `alvoAtual`, applies filters |
| `renderCorpus(results)` | Renders ESQ mode corpus cards |
| `buscarCorpus(alvo)` | Finds corpus stanzas matching a phonetic profile |
| `abrirLetra(r)` | Lazy-loads full lyrics, highlights matching stanza, shows lyrics panel |
| `fecharLetra()` | Returns to corpus view, restores scroll position |
| `toggleCorpusMode()` | Switches between rhyme-finder and ESQ corpus views |
| `calcEsqueleto(word)` | Phonetic consonant skeleton `{s, l, g, gs, leg}`: IPA symbols (`metade` → `mtd`, `gente` → `ʒŋt`), base letter of each consonant (`casa` → s `z` / l `s`), per-consonant gap cost (coda cheaper, coda nasal/`l` cheapest), readable legend `m·t·d`. A vowel-less input (`dt`) is read as the skeleton itself |
| `consQualquerOrdem(W, Q, tol)` | Filter *Consoantes em qualquer ordem* (`FILTROS_CONTEM.consLivre` / `toleranciaLivre`): every consonant of `Q` needs its own partner in `W` (bipartite matching, so `tt` needs two t's), any order/position. A pair matches by sound **or** letter (`s` → casa, cidade; `g` → gato, gente). Tol 1 = voicing pairs, tol 2 = + m/n, nh/n, liquids (r/l, lh/l). This is the **Contém** mode; `consLivreModo` adds the other two (see *Text filters*) |
| `consCategoria(W, A)` | Skeleton category (works on `esq` and `esqV` alike); in CONS mode: consonant category for the second chip row (`#cat-grid`, filter `FILTRO_CAT`, result field `catCons`): `'mesmas'` = exactly the anchor's consonants in any order (`metade` → método, ditame); a symbol `X` = exactly the anchor's minus `X` ("sem m" → tudo, dote, adote). Strict: no leftover consonant, not even a coda nasal, so substitutions (`batido`, `entada`) stay in the bands. Category words bypass `CONS_PISO` |
| `calcScoreCons(item, alvo)` | CONS-mode score: weighted edit distance between skeletons (`distEsq`/`simEsq`, substitution cost from `phonetic-engine.js`, edge gaps ×0.6), mapped onto the same 160/130/100/60 bands; vowel sequence is only a ≤15-pt tiebreak |
| `calcEsqVogal(silabas)` | Vowel skeleton, same shape as `calcEsqueleto` (`{s, l, g, gs, leg}`): one symbol per vowel sound — `a e i o u`, nasals `ã ẽ ĩ õ ũ` (tilde or coda m/n: `gente` → `ẽ·e`), diphthong glides `ɪ ʊ` with a cheaper gap (`peito` → `eⁱ·o`, `mão` → `ãᵘ`, `quase` → `ᵘa·e`); silent `u` of que/gui dropped; é = ê = e. Uses the syllable split only to tell diphthong from hiatus — stress is not consulted. Stored as `esqV` on every profile |
| `calcScoreVog(item, alvo)` | VOG-mode score: `simEsq` over `esqV` with `_vogSub` costs (e~i, o~u 0.3; a~e 0.5; e~o 0.6; a~i 0.8; nasality +0.15), baseline `VOG_BASE_SIM` 0.45, same bands. Consonant-skeleton similarity adds at most +9 (ordering only) |
| `setModo('rima'｜'cons'｜'vog')` | Three-way selector under the search box (`#modo-seg`, state `modoBusca`). `cons`/`vog` swap rhyme scoring for skeleton scoring and ignore stress entirely; all filters still apply. `_esqK()` returns which skeleton field (`esq`/`esqV`) the current mode compares |

---

## CONS mode (busca sem tônica)

Answers "what *sounds* built like this word, whatever its stress?" — `metade` →
`método`, `metido`, `matado`, `medida`. Typing a bare skeleton (`dt`, `mtd`)
searches by skeleton directly (`dt` → `dote`, `dito`, `dieta`).

- Lives only in `exp/index.html`; it does **not** touch `silabificar` /
  `identificarTonica`, so there is nothing to sync with the other engine copies
  and no corpus rebuild.
- Bands are relabelled (Iguais / Quase / Próximas / Parciais — short on purpose,
  three chips must fit a phone row); results below 60 are dropped (`CONS_PISO`)
  unless they belong to a category, which keeps them as Distantes / Vagas.
- Second chip row answers "where is `adote` when I type `metade`?": **mesmas
  m·t·d · sem m · sem t · sem d**. Band row and category row combine (AND) and
  each row's counts already reflect the other's selection. Hidden for A∩B and
  for anchors with a single consonant.
- Hash: `#molde=metade&modo=cons`.
- Calibration: from `metade`, ~43 words share the exact skeleton, ~13k pass the
  floor. Two-consonant partials (`adoto`, `tudo`) land in *Parcial* — real
  3-consonant neighbours (`abatido` b·t·d) are genuinely closer.

---

## VOG mode (só vogais, sem tônica)

The mirror image of CONS: compares only the vowel-sound sequence. `metade`
(e·a·e) → mênade, desate, beldade, debate; then nasal variants (embate ẽ·a·e),
then neighbours. Typing only vowels searches the pattern itself (`eae`, `oao`).

- Same machinery as CONS (`distEsq`/`simEsq` take the substitution-cost function
  as a parameter; `consCategoria` and the category chip row are shared):
  **mesmas e·a·e · sem e · sem a**.
- Like CONS, lives only in `exp/index.html` and changes nothing in
  `silabificar`/`identificarTonica` — no other engine copy to sync, no corpus rebuild.
- Known limit: open vs closed e/o (é/ê, ó/ô) are not distinguished, because
  unaccented spelling doesn't say which one a vowel is.
- Calibration: from `metade`, 169 words share the exact sequence, ~13k pass the floor.
- Hash: `#molde=metade&modo=vog`.

---

## ⚠️ The phonetic engine is duplicated in 5 places

`silabificar`, `identificarTonica`, `extrairRima` and the helpers around them are
**copy-pasted**, not shared. A fix to one is a fix to none:

| Copy | Used by |
|------|---------|
| `exp/index.html` | the live app |
| `build-corpus.js` | corpus index build |
| `rhyme-extract.js` | per-song CLI |
| `song-analysis.html` | Eco Sonoro page |
| `som/engine.js` | Som (`silabificar`, `identificarTonica` + helpers, verbatim) |

Always patch all five, then rebuild the corpus. `exp/index.backup.html` and
`exp/v02.html` hold two more stale copies — leave those alone, they are archives.

Verify: `grep -n "function identificarTonica" -A 10 exp/index.html build-corpus.js rhyme-extract.js song-analysis.html som/engine.js`

`idxNucleo`/`semGlideQU` (the qu/gu fix for vowel fields) exist only in `exp/index.html` and
`song-analysis.html`. The CLIs only compute rhymes, whose `extrairRima` already skips the
glide `u`, so the corpus is unaffected; `som/engine.js` handles qu/gu in its own G2P.

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

## Dictionary base (provisional)

`exp/index.html` searches **`dic/k-palavras.txt`** by default (decision of 2026-11-17,
"por enquanto"). `_listaBaseComum` drops punctuation/number lines and every entry that
only appears capitalised — names, places, acronyms (`José`, `Curitiba`, `PMDB`); a
capitalised word that also appears in lowercase survives through its lowercase form.
Result: 31,113 words, ~18.5k of them inflected forms missing from `palavras.txt`
(`vamos`, `alunos`, `espero`). Load ~1.1 s / ~50 MB heap vs ~2.6 s / ~160 MB.

- Switch back for one visit: `exp/index.html?dic=completo`; for good: change `DIC_BASE`.
- It is a news-text vocabulary: some typos (`desenvovimento`), Spanish/English words
  (`del`, `cheated`) and brands come along.
- With this base every word is `freq: 'comum'`, so the *Frequência* filter and the
  common-first step of `_ordemResultado` have no effect (they still do with `?dic=completo`).
- The song corpus and `build-corpus.js` don't use the dictionary; nothing to rebuild.

---

## Word classes (`classe` / `classes`)

Real classes come from **PortiLexicon-UD** (USP/C4AI, MIT), preprocessed by
`build-classes.js` so the app never downloads its ~100 MB of data.

- Every profile has `classes` (all classes the word can have) and `classe` (the
  main one, used by the lock pill). `calcClasses(pL)` reads `CLASSES_LEX`
  (filled by `_carregarClasses` before the dictionary is indexed); a word the
  lexicon doesn't know gets `calcClasse`'s ending-based guess for both.
- **The filter matches any of the word's classes**: `canto` (noun + verb form)
  shows up under Subst. and under Verbo; "≠ Verbo" removes every word that *can*
  be a verb. These multi-class words are real homographs (`cerco`, `banca`,
  `aparelho` are also verb forms), not noise.
- Main class: the ending-based guess if the lexicon confirms it, else the first
  of outra › subst. › adj. › verbo › adv.
- Build-time adjustments: ADV readings tagged `Abbr=Yes` (an adjective standing
  for an `-mente` adverb, `abananada`) are dropped when the word has another
  class; contractions (`do`, `pelo`, `num`…), which UD splits, get `o`.
- Coverage: 89.1% of the default base; 41.5% of the rest of `palavras.txt`.
  The old guess classified only 25% of the default base, with errors such as
  `mulher`/`lugar` → verb, `história` → adj, `semente` → adv.
- Only words of the two lists are in the files: an anchor typed from outside them
  (`cantado` with the default base) still gets the guess.
- If the class files fail to load, everything falls back to the guess.

---

## Filter order

Both panels (sidebar and phone sheet) list the filters in the user's order of use
(2026-11-23): **Classe gramatical, Sentido, Número de sílabas, Início exato, Terminação
exata, Consoantes em qualquer ordem, Vogais em qualquer ordem, Consoantes ao redor da
tônica, Vogais ao redor da tônica, Sem estas letras ou sílabas** — then an
**Outros filtros** divider (`.filtros-divisor`) and everything else. Keep the two panels in
the same order; each section is a self-contained `<div class="sb-section">` /
`<div class="sh-section">` block, so reordering means moving whole blocks.

## Text filters

- **Wildcards** — `Início exato` and `Terminação exata` accept `*` = exactly one letter
  (`i*e` → lide, vire; `i**e` → disse, pilhe). `_regexGrafia(itens, âncora, normaliza)`
  escapes everything else and anchors with `^`/`$`; comma still means OR.
- **Sem estas letras ou sílabas** (`FILTROS_CONTEM.excluir`) — comma or space separated;
  drops a word containing any item. Accent-insensitive through `_normParaContem` (`i`
  drops `saída`; `ç` stays distinct), and `*` works here too.
- **Vogais em qualquer ordem** (`FILTROS_CONTEM.vogLivre`) — `o a`, `oa` or a whole word.
  Vowels come from `espinhaVocal` (silent `u` of que/gui dropped, accents and tilde folded
  to the base vowel; glides count as vowels, so `pai` is a·i).
- **Modes** for both any-order filters (`MODO_LIVRE`, chips `data-modo-livre="cons:exatas"`…,
  `setModoLivre`): **Exatas** = only the listed sounds, once each (`o a` → carro, corra);
  **Com repetição** = only the listed sounds, each at least once, repeats allowed
  (carona, corado); **Contém** = the listed sounds plus anything else (the pre-2026-11-23
  consonant behaviour). Default is Exatas for both; reset restores it.
  `consLivreModo(W, Q, tol, modo)` keeps sound-or-letter matching and tolerance in every mode.
- None of these are stored in the URL hash (same as the other typed filters).

---

## Meaning filter (`sentidos`)

Filter section **Sentido (substantivos)**, in the sidebar and the phone sheet, second from
the top — right after *Classe gramatical* (see *Filter order*). Data: the user's classification in `dic/substantivos-sentidos.csv`,
compiled by `build-sentidos.js` into `dic/sentidos.txt`, loaded into `SENTIDOS_LEX`.

- 11 categories in 3 rows (`SENTIDOS`): **Concretos** (Pessoas, Lugares, Objetos e
  substâncias, Corpo e seres vivos), **Abstratos** (Ações e eventos, Conceitos e
  qualidades, Doenças, Tempo/ciências/artes), **Outros** (Ficcionais, Instituições,
  Relações e normas). The CSV's sections 3 and 4 share the "Outros" row.
- Every profile has `sentidos` (array of codes; empty for non-nouns). 128 words are
  in more than one category (`igreja`: lugar + instituição; `casa`: lugar + objeto).
- **Multi-select, OR**: `FILTRO_SENTIDOS` (Set). A group chip toggles all of its
  categories; "Qualquer" clears.
- Applied **at the end of `processarBusca`, after scoring**, so `CONTAGEM_SENTIDOS`
  can give every chip the number of *current results* in it (groups count each
  word once). Ranking is unchanged — the filter only removes.
- Counts as an active filter (`temCriterio`, FAB badge): with no anchor word, picking
  only "Doenças" lists all 123 disease nouns.
- Not stored in the URL hash (like the other typed/multi-select filters).
- If `sentidos.txt` fails to load, chips show 0 and the app works normally.
- Coverage: 10,929 of the 31,113 default-base words; nothing for `?dic=completo`
  words outside it.

---

## User input & result order

- **Every word the user supplies goes through `palavraValida(raw)`** — search box,
  `#molde=`/`alvoB=` links, history. Only letters (accented, `ç`), hyphen and
  apostrophe pass (`ENTRADA_OK`). Anything else sets `entradaInvalida`, clears the
  anchor and shows a message instead of results (before: the old word's results
  stayed on screen, and raw HTML from the box or a link reached `innerHTML`).
- Lyric words in the lyrics panel deliberately **skip** `palavraValida` and go
  straight to `perfilFonetico`, exactly like `build-corpus.js`, so stanzas keep
  matching the pre-built corpus.
- Output that reaches `innerHTML` (card syllables, rhyme tags, filter pills,
  history, corpus cards) is escaped with `_escHtml` as a second line of defence.
- **`dic/k-palavras.txt` is the common-word list** (`PALAVRAS_COMUNS`, ~46k
  lowercase forms, ~14k match the dictionary). Loaded in parallel with
  `palavras.txt`; if it fails, `calcFreq` falls back to the old length heuristic.
  It drives the *Frequência* filter (`freq === 'comum'`) and the result order.
- **Result order** (`_ordemResultado`): band → (Rima mode) perfect rhyme
  `rimaExata` before near-rhymes of the same band → common before rare → score.
  CONS/VOG then break ties by length closeness. Without the `rimaExata` step,
  common near-rhymes jumped above perfect ones (`terra` → `era` before `berra`).

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
These bands and weights are Rima mode only; CONS and VOG map their own similarity onto the same thresholds (see their sections).

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
| `FILTROS_CONTEM` | Free-text filter values (vowels, consonants, onset fields; `consLivre`, `vogLivre`, `excluir`) |
| `MODO_LIVRE` | `{cons, vog}` — `'exatas'` \| `'repete'` \| `'contem'` for the two any-order filters |
| `modoBusca` | `'rima'` \| `'cons'` \| `'vog'` — which engine ranks the results |
| `FILTRO_CAT` | Selected category chips in CONS/VOG mode (`'mesmas'` and/or missing-sound symbols) |
| `FILTRO_SENTIDOS` | Selected meaning categories (Set of `pes`, `lug`…; empty = any) |
| `CONTAGEM_SENTIDOS` | Results per meaning category and per group, for the chip counts |
| `modoCorpus` | Boolean: ESQ mode active |
| `corpusEsquemas` | Loaded corpus index (`null` until first ESQ use) |
| `letrasDict` | `Map<"artista§titulo", letra>` — built lazily on first card click |
| `corpusScrollY` | Saved scroll position in `#corpus-viewport` for back-navigation |

---

## Development branch

No standing development branch: each change gets its own short-lived branch, merged into
`main` through a pull request. Never push to main without explicit instruction.
`backup/corpus-v1` is a deliberate restore point — don't delete it.

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
