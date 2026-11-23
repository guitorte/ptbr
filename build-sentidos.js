#!/usr/bin/env node
/*
 * build-sentidos.js — gera dic/sentidos.txt a partir de dic/substantivos-sentidos.csv
 *
 *   node build-sentidos.js
 *
 * Fonte: dic/substantivos-sentidos.csv (Palavra, Seção, Categoria, Observação),
 * classificação semântica dos substantivos da base padrão. Só as seções 1–4
 * viram filtro; a seção 5 (ruídos: adjetivos, verbos, erros de digitação)
 * fica de fora.
 *
 * Saída: uma linha por categoria — "<código>\t<palavra> <palavra> …".
 * Uma palavra pode estar em mais de uma categoria (igreja: lugar e instituição).
 */
const fs = require('fs');

// Código curto → [seção, categoria] como aparecem no CSV
const CATEGORIAS = {
    pes: ['1', 'Pessoas'],
    lug: ['1', 'Lugares'],
    obj: ['1', 'Objetos e substâncias'],
    ser: ['1', 'Astros, corpo e seres vivos'],
    aca: ['2', 'Ações e eventos'],
    con: ['2', 'Conceitos e qualidades'],
    doe: ['2', 'Doenças'],
    tem: ['2', 'Tempo, medidas, ciências e artes'],
    fic: ['3', 'Ficcionais e mitológicas'],
    ins: ['4', 'Instituições'],
    rel: ['4', 'Relações, normas e contratos'],
};
const PORCAT = new Map(Object.entries(CATEGORIAS).map(([cod, [, cat]]) => [cat, cod]));

// CSV mínimo: vírgula, aspas duplas, "" como aspa escapada
function lerCSV(texto) {
    const linhas = [];
    let campo = '', linha = [], aspas = false;
    for (let i = 0; i < texto.length; i++) {
        const c = texto[i];
        if (aspas) {
            if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
            else if (c === '"') aspas = false;
            else campo += c;
        } else if (c === '"') aspas = true;
        else if (c === ',') { linha.push(campo); campo = ''; }
        else if (c === '\n' || c === '\r') {
            if (c === '\r' && texto[i + 1] === '\n') i++;
            linha.push(campo); linhas.push(linha); linha = []; campo = '';
        } else campo += c;
    }
    if (campo || linha.length) { linha.push(campo); linhas.push(linha); }
    return linhas.filter(l => l.some(x => x.trim()));
}

const [cab, ...dados] = lerCSV(fs.readFileSync('dic/substantivos-sentidos.csv', 'utf8').replace(/^﻿/, ''));
const col = nome => cab.indexOf(nome);
const [iP, iS, iC] = [col('Palavra'), col('Seção'), col('Categoria')];
if (iP < 0 || iS < 0 || iC < 0) throw new Error('CSV sem as colunas Palavra, Seção, Categoria');

const grupos = Object.fromEntries(Object.keys(CATEGORIAS).map(k => [k, new Set()]));
const ignoradas = new Map();
for (const l of dados) {
    const w = (l[iP] || '').trim().toLowerCase().normalize('NFC');
    const cat = (l[iC] || '').trim();
    if (!w) continue;
    const cod = PORCAT.get(cat);
    if (cod) grupos[cod].add(w);
    else ignoradas.set(cat, (ignoradas.get(cat) || 0) + 1);
}

const col_pt = new Intl.Collator('pt-BR');
const unicas = new Set();
const corpo = Object.entries(grupos).map(([cod, ws]) => {
    ws.forEach(w => unicas.add(w));
    return `${cod}\t${[...ws].sort(col_pt.compare).join(' ')}`;
}).join('\n');
fs.writeFileSync('dic/sentidos.txt',
    `# Sentidos dos substantivos — gerado por build-sentidos.js a partir de dic/substantivos-sentidos.csv\n` +
    `# ${Object.entries(CATEGORIAS).map(([k, [, c]]) => `${k}=${c}`).join(' · ')}\n` + corpo + '\n');

for (const [cod, ws] of Object.entries(grupos)) console.log(`${cod}  ${String(ws.size).padStart(5)}  ${CATEGORIAS[cod][1]}`);
console.log(`dic/sentidos.txt: ${unicas.size} palavras, ${Math.round(fs.statSync('dic/sentidos.txt').size / 1024)} KB`);
console.log('fora do filtro (seção 5):', [...ignoradas].map(([c, n]) => `${c} ${n}`).join(' · '));
