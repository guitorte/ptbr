#!/usr/bin/env node
/*
 * build-classes.js — gera as classes gramaticais do app a partir do PortiLexicon-UD
 *
 *   git clone --depth 1 https://github.com/LuceleneL/portilexicon-ud /tmp/portilexicon-ud
 *   node build-classes.js /tmp/portilexicon-ud
 *
 * Saídas (só palavras que o PortiLexicon-UD conhece; as demais ficam com a
 * classe adivinhada pela terminação, calcClasse, no app):
 *   dic/classes-comum.txt     palavras da base padrão (k-palavras.txt limpo)
 *   dic/classes-completo.txt  palavras de palavras.txt que NÃO estão na base padrão
 *                              (carregado só com exp/index.html?dic=completo)
 *
 * Formato: uma linha por combinação de classes — "<códigos>\t<palavra> <palavra> …"
 *   s = substantivo (NOUN)      a = adjetivo (ADJ)      v = verbo (VERB, AUX)
 *   d = advérbio (ADV)          o = outra (ADP, CCONJ, SCONJ, DET, PRON, NUM, INTJ)
 * Uma palavra pode ter várias classes ("sv" = canto, casa: substantivo e forma verbal).
 *
 * Ajustes sobre o PortiLexicon-UD:
 *  - ADV marcado Abbr=Yes é o adjetivo usado como abreviação de um advérbio em
 *    -mente ("rápida e eficazmente"); essa leitura é descartada quando a palavra
 *    tem outra classe (senão "abananada" viraria advérbio).
 *  - Contrações (do, pelo, num…) não existem como palavra no modelo UD, que as
 *    separa; recebem "o".
 *
 * PortiLexicon-UD © 2023 Lucelene Lopes, licença MIT — ver dic/PORTILEXICON-LICENSE.
 */
const fs = require('fs');
const path = require('path');

const src = process.argv[2];
if (!src || !fs.existsSync(path.join(src, 'WORDmaster.txt'))) {
    console.error('uso: node build-classes.js <pasta do clone do PortiLexicon-UD>');
    process.exit(1);
}
const NFC = s => s.normalize('NFC');

// ── 1. Classes por palavra ─────────────────────────────────────────────
const MAP = { NOUN: 's', ADJ: 'a', VERB: 'v', AUX: 'v', ADV: 'd' };
const ORDEM = 'osavd';
const tags = new Map();
for (const linha of fs.readFileSync(path.join(src, 'WORDmaster.txt'), 'utf8').split(/\r?\n/)) {
    const i = linha.lastIndexOf(',');
    if (i <= 0) continue;
    tags.set(NFC(linha.slice(0, i)), linha.slice(i + 1).trim().split(/\s+/));
}
const advAbrev = new Set();
for (const linha of fs.readFileSync(path.join(src, 'ADV.tsv'), 'utf8').split(/\r?\n/)) {
    const f = linha.split('\t');
    if (f.length >= 3 && f[2].includes('Abbr=Yes')) advAbrev.add(NFC(f[0]));
}
const CONTRACOES = ('ao aos à às do da dos das no na nos nas pelo pela pelos pelas ' +
    'num numa nuns numas dum duma duns dumas deste desta destes destas disto ' +
    'desse dessa desses dessas disso daquele daquela daqueles daquelas daquilo ' +
    'neste nesta nestes nestas nisto nesse nessa nesses nessas nisso naquele ' +
    'naquela naqueles naquelas naquilo àquele àquela àqueles àquelas àquilo ' +
    'dele dela deles delas nele nela neles nelas daqui dali daí donde').split(' ');

function codigos(w) {
    const t = tags.get(w);
    const c = new Set();
    if (t) for (const x of t) {
        if (x === 'ADV' && advAbrev.has(w) && t.length > 1) continue;
        c.add(MAP[x] || 'o');
    }
    if (CONTRACOES.includes(w)) c.add('o');
    return c.size ? [...ORDEM].filter(k => c.has(k)).join('') : null;
}

// ── 2. As duas listas do app (mesma limpeza de _listaBaseComum) ─────────
const ENTRADA_OK = /^[a-zà-öø-ÿ'\-]+$/;
const LIXO_BASE = /^['-]|['-]$|--|^[a-zà-öø-ÿ]-(?:[oa]s?|l[oa]s?|n[oa]s?|vos|me|te|se|lhes?)$/;
function baseComum() {
    const vistas = new Set(), lista = [];
    for (const bruto of fs.readFileSync('dic/k-palavras.txt', 'utf8').split(/\r?\n/)) {
        const w = bruto.trim();
        if (w.length < 2 || w !== w.toLowerCase() || !ENTRADA_OK.test(w)
            || !/[a-zà-öø-ÿ]/.test(w) || LIXO_BASE.test(w) || vistas.has(w)) continue;
        vistas.add(w); lista.push(w);
    }
    return lista;
}
const comum = baseComum();
const setComum = new Set(comum);
const completo = fs.readFileSync('dic/palavras.txt', 'utf8').split(/\r?\n/)
    .map(p => p.trim()).filter(p => p.length > 1 && !setComum.has(p));

// ── 3. Escrita agrupada por combinação ──────────────────────────────────
function escreve(arquivo, lista, rotulo) {
    const grupos = new Map();
    let n = 0;
    for (const w of lista) {
        const c = codigos(w);
        if (!c) continue;
        if (!grupos.has(c)) grupos.set(c, []);
        grupos.get(c).push(w); n++;
    }
    const cabecalho = `# ${rotulo} — gerado por build-classes.js a partir do PortiLexicon-UD (MIT, © 2023 Lucelene Lopes)\n` +
                      `# s=subst a=adj v=verbo d=advérbio o=outra · ${n} palavras\n`;
    const corpo = [...grupos].sort((x, y) => y[1].length - x[1].length)
        .map(([c, ws]) => `${c}\t${ws.join(' ')}`).join('\n');
    fs.writeFileSync(arquivo, cabecalho + corpo + '\n');
    console.log(`${arquivo}: ${n} de ${lista.length} palavras (${(100 * n / lista.length).toFixed(1)}%), ` +
                `${grupos.size} combinações, ${Math.round(fs.statSync(arquivo).size / 1024)} KB`);
}
escreve('dic/classes-comum.txt', comum, 'Base padrão (k-palavras.txt)');
escreve('dic/classes-completo.txt', completo, 'palavras.txt fora da base padrão');
