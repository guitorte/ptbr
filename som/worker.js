/* Indexa o dicionário e responde às buscas pesadas fora da thread da tela,
   para que a rolagem continue lisa no celular. */
importScripts('../phonetic-engine.js', 'engine.js');

const ind = Som.criarIndice();

function silInfo(T) { return { w: T.w, ti: T.ti, g: T.sil.map(x => x.g), ipa: Som.ipaPalavra(T) }; }
const serial = lst => lst.map(r => ({ ...silInfo(r.C), score: r.score, sim: r.sim, nivel: r.nivel, traco: r.traco }));

async function iniciar() {
  const txt = await (await fetch('../dic/palavras.txt')).text();
  const palavras = txt.split(/\r?\n/).filter(Boolean);
  const LOTE = 6000;
  for (let i = 0; i < palavras.length; i += LOTE) {
    Som.indexarLote(ind, palavras.slice(i, i + LOTE));
    postMessage({ tipo: 'progresso', feito: Math.min(palavras.length, i + LOTE), total: palavras.length });
    await null;
  }
  Som.finalizarIndice(ind);
  // inventário de sílabas reais: a tela usa para montar o mapa de sílabas
  const inventario = {};
  for (const [k, e] of ind.silabas)
    inventario[k] = { n: e.n, g: [...e.graf.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(x => x[0]) };
  postMessage({ tipo: 'pronto', total: ind.itens.length, inventario });
}

onmessage = ({ data: m }) => {
  if (m.cfg) { Som.setLente(m.cfg.lente); Som.setRFinalMudo(m.cfg.rMudo); }
  let res = null;
  try {
    switch (m.tipo) {
      case 'palavra': {
        const r = Som.buscarPalavra(ind, m.texto, { pesoRima: m.pesoRima });
        if (r) res = { alvo: silInfo(r.T), geral: serial(r.geral), rimam: serial(r.rimam), naoRimam: serial(r.naoRimam) };
        break;
      }
      case 'trecho': {
        const r = Som.buscarTrecho(ind, m.texto, m.lado);
        if (r) res = { ipa: r.F.sil.map(Som.ipaSil).join('.'), tonicaConhecida: r.F.tonicaConhecida,
          grupos: r.grupos.map(g => ({ grafia: g.grafia, sim: g.sim, tonDentro: g.tonDentro,
            ipa: g.sil.map(Som.ipaSil).join('.'), n: g.palavras.length, palavras: g.palavras.slice(0, 60) })) };
        break;
      }
      case 'silaba': {
        const r = Som.buscarSilaba(ind, m.texto);
        if (r) res = { chave: r.chave, exemplos: Som.exemplosSilaba(ind, r.chave, 14),
          vizinhas: r.vizinhas.map(v => ({ key: v.key, x: v.x, n: v.n, d: v.d, sim: v.sim, grafias: v.grafias })) };
        break;
      }
      case 'som': {
        const pm = Som.paresMinimos(ind, m.som, m.alvos, 4);
        res = { pares: Object.fromEntries(pm) };
        break;
      }
    }
  } catch (e) { res = { erro: String(e) }; }
  postMessage({ tipo: 'resposta', id: m.id, res });
};

iniciar();
