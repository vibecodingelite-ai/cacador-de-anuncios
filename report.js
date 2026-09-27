// Relatório para salvar como PDF. Os dados vêm de chrome.storage.local.lastReport,
// gravados pelo content script. Tudo é montado com textContent (nada de HTML vindo dos anúncios).

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
const pct = (x) => (x == null ? '—' : Math.round(x * 100) + '%');

function stat(value, label) {
  const s = el('div', 'stat');
  s.append(el('div', 'v', value), el('div', 'k', label));
  return s;
}

function adBlock(ad) {
  const box = el('div', 'ad');
  box.dataset.v = ad.verdictKey;

  const top = el('div', 'top');
  top.append(el('span', 'adv', ad.advertiser || '(anunciante não identificado)'), el('span', 'verd', ad.verdict));
  box.appendChild(top);

  const tags = el('div', 'tags');
  const tag = (label, value, cls) => {
    const s = el('span', cls);
    s.append(label + ' ', el('b', null, value));
    tags.appendChild(s);
  };
  tag('Resultado', pct(ad.escalado));
  ad.niches.forEach((n) => tag(n.name, pct(n.p)));
  tag('Ângulo', ad.angle + (ad.angleLow ? ' ?' : ''), ad.angleLow ? 'low' : '');
  const hook = el('span', ad.hookLow ? 'low' : '');
  hook.append('Gancho ', el('span', 'dots', '●'.repeat(ad.hookLevel + 1) + '○'.repeat(3 - ad.hookLevel)), ' ' + ad.hookLabel);
  tags.appendChild(hook);
  tag('No ar', ad.days == null ? '—' : `${ad.days} dias`);
  if (ad.creatives > 1) tag('Criativo em', `${ad.creatives} anúncios`);
  if (ad.platforms.length) tag('Plataformas', ad.platforms.join(', '));
  box.appendChild(tags);

  if (ad.firstSentence) box.appendChild(el('div', 'hook', '“' + ad.firstSentence + '”'));
  // o resto da copy, sem repetir a primeira frase que já aparece em destaque
  let rest = ad.copy.startsWith(ad.firstSentence) ? ad.copy.slice(ad.firstSentence.length).trim() : ad.copy;
  if (rest.length > 420) rest = rest.slice(0, 420).trimEnd() + '…';
  if (rest) box.appendChild(el('div', 'copy', rest));

  const foot = el('div', 'foot');
  const left = [ad.headline, ad.cta && `CTA: ${ad.cta}`, ad.domain].filter(Boolean).join(' · ');
  foot.appendChild(el('span', null, left || ' '));
  const a = el('a', null, 'ver na Biblioteca');
  a.href = ad.link;
  a.target = '_blank';
  foot.appendChild(a);
  box.appendChild(foot);
  return box;
}

function render(r) {
  const page = document.getElementById('page');
  page.textContent = '';
  if (!r || !r.ads?.length) {
    page.appendChild(el('div', 'empty', 'Nenhum achado para mostrar. Volte à Biblioteca e clique em "Relatório PDF".'));
    return;
  }
  document.title = r.fileName; // vira o nome sugerido do PDF

  page.appendChild(el('h1', null, '🎯 Caçador de Anúncios — achados'));
  const when = new Date(r.generatedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  page.appendChild(el('div', 'meta', [
    when,
    r.search && `busca: “${r.search}”`,
    r.filter && `filtrado pelo nicho “${r.filter}”`,
    `${r.ads.length} anúncio(s) no relatório`
  ].filter(Boolean).join(' · ')));

  const stats = el('div', 'stats');
  stats.append(
    stat(String(r.stats.read), 'anúncios lidos'),
    stat(String(r.stats.calls), 'decisões do JEV'),
    stat(r.stats.avgMs == null ? '—' : `${r.stats.avgMs} ms`, 'tempo médio/decisão'),
    stat('US$ ' + r.stats.cost.toFixed(6), 'custo total')
  );
  page.appendChild(stats);

  const chips = el('div', 'chips');
  const counts = {};
  r.ads.forEach((a) => { counts[a.verdict] = (counts[a.verdict] || 0) + 1; });
  Object.entries(counts).forEach(([label, n]) => chips.appendChild(el('span', 'chip', `${label} ${n}`)));
  r.niches.forEach((n) => chips.appendChild(el('span', 'chip' + (n === r.filter ? ' filter' : ''), `nicho: ${n}`)));
  page.appendChild(chips);

  // Já vem ordenado: ESCALADO, fora do nicho, INCERTO, TESTE.
  let current = null;
  for (const ad of r.ads) {
    if (ad.verdict !== current) {
      current = ad.verdict;
      page.appendChild(el('h2', null, current));
    }
    page.appendChild(adBlock(ad));
  }
}

document.getElementById('print').onclick = () => window.print();

chrome.storage.local.get('lastReport').then(({ lastReport }) => {
  render(lastReport);
  if (lastReport?.ads?.length) setTimeout(() => window.print(), 400);
});
