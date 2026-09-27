// Caçador de Anúncios — content script da Biblioteca de Anúncios da Meta.
// Regra geral: o JEV decide, o código desenha. Aqui só tem extração, regras e desenho.
(() => {
  'use strict';

  // ---------------------------------------------------------------- regras
  const RULES = {
    ESCALADO_MIN: 0.75, // escalado >= 0,75 ...
    NICHO_MIN: 0.5,     // ... e nicho >= 0,5  -> 🔥 ESCALADO
    TESTE_MAX: 0.40,    // escalado < 0,40     -> 🧪 TESTE
    CONF_MIN: 0.5       // confidence de choice/score abaixo disso é "baixa"
  };
  const MAX_CONCURRENT = 4;
  const MAX_COPY_CHARS = 2000;
  const CACHE_KEY = 'jevCache';
  const CACHE_LIMIT = 3000;
  // Fallback caso a resposta não traga usage.cost: preço do jev-1.13 (US$ 0,042 por 1M tokens de entrada).
  const PRICE_PER_INPUT_TOKEN = 0.042 / 1e6;

  const ANGLES = {
    pain: 'dor', desire: 'desejo', social_proof: 'prova social', offer_urgency: 'oferta/urgência',
    curiosity: 'curiosidade', authority: 'autoridade', none: 'nenhum claro'
  };
  const HOOK_LEVELS = ['fraco', 'ok', 'forte', 'muito forte'];

  // ------------------------------------------------ referências de texto visível
  // A Meta usa classes CSS ofuscadas que mudam sempre, então os cards são achados
  // pelo texto visível. Se algum desses textos mudar, o painel avisa.
  const RE_ID_LABEL = /^(Identificação da biblioteca|ID da biblioteca|Library ID)\s*:/i;
  const RE_ID = /(?:Identificação da biblioteca|ID da biblioteca|Library ID)\s*:\s*(\d{5,})/i;
  const RE_ID_G = /(?:Identificação da biblioteca|ID da biblioteca|Library ID)\s*:/gi;
  // pt-BR: "Veiculação iniciada em 3 de set de 2025" · pt-PT: "Começou a ser publicado a 31/08/2026"
  const RE_START = /^(?:Veiculação iniciada em|Começou a ser publicado|Started running on|Empezó a circular|Circulando desde)\s+(.+)$/i;
  // pt-BR: "3 anúncios usam esse criativo" · pt-PT: "3 anúncios utilizam estes conteúdos criativos"
  const RE_COUNT = /(\d+)\s+(?:anúncios|anuncios|ads)\s+(?:usam|utilizam|usan|utilizan|use)/i;
  const RE_MULTI = /(várias versões|multiple versions)/i;
  const RE_SPONSORED = /^(Patrocinado|Sponsored)$/i;
  const RE_PLATFORMS = /^(Plataformas|Platforms)$/i;
  const RE_INACTIVE = /^(Inativo|Inactive)$/i;
  const RE_SEE_MORE = /\s*(…|\.\.\.)?\s*(Ver mais|See more)\s*$/i;

  // Ícones de plataforma não têm texto: são recortes de um sprite. Mapeado em 27/09/2026
  // filtrando a Biblioteca por plataforma. Se o sprite mudar, cai para "N ícones".
  const PLATFORM_SPRITES = {
    'Vu_hL7l5Z5Y@-51px -90px': 'Facebook',
    'Vu_hL7l5Z5Y@-51px -142px': 'Instagram',
    'VIZZGfZ1ed3@-387px -800px': 'Messenger',
    'y-njbaBGPM4@0px -1947px': 'Audience Network',
    'VIZZGfZ1ed3@-387px -813px': 'Threads'
  };

  const CTAS = new Set([
    'saiba mais', 'learn more', 'comprar agora', 'shop now', 'cadastre-se', 'sign up', 'inscreva-se',
    'inscrever-se', 'enviar mensagem', 'send message', 'enviar mensagem pelo whatsapp', 'send whatsapp message',
    'whatsapp', 'baixar', 'download', 'instalar agora', 'install now', 'usar app', 'use app', 'reservar agora',
    'book now', 'obter oferta', 'get offer', 'fale conosco', 'contact us', 'candidate-se agora', 'apply now',
    'assinar', 'subscribe', 'assistir mais', 'watch more', 'pedir cotação', 'get quote', 'peça agora',
    'order now', 'ouvir agora', 'listen now', 'obter acesso', 'get access', 'ligar agora', 'call now',
    'jogar', 'play game', 'ver cardápio', 'see menu', 'doe agora', 'donate now', 'obter promoções',
    'get promotions', 'ver mais', 'see more', 'solicitar horário', 'request time', 'agendar', 'get directions',
    'como chegar', 'comprar ingressos', 'buy tickets', 'ver horários', 'get showtimes', 'enviar', 'send',
    'mais informações', 'learn more about', 'obter lembrete', 'get reminder', 'saiba mais agora'
  ]);

  const MONTHS = {
    jan: 0, ene: 0, fev: 1, feb: 1, mar: 2, abr: 3, apr: 3, mai: 4, may: 4, jun: 5, jul: 6,
    ago: 7, aug: 7, set: 8, sep: 8, out: 9, oct: 9, nov: 10, dez: 11, dec: 11, dic: 11
  };
  const MAX_NICHES = 3;

  // ------------------------------------------------------------------ estado
  const state = {
    niches: [],           // até 3 nichos (tags das Opções)
    activeNiche: null,    // chip selecionado no painel (apaga os cards dos outros nichos)
    cache: {},            // `${versão}|${id}|${nichos}` -> decisão
    ads: new Map(),       // id -> { ad, decision, verdict, card }
    queue: [],
    running: 0,
    inflight: new Set(),
    stats: { calls: 0, totalMs: 0, totalCost: 0, costEstimated: false, errors: 0 },
    fieldMisses: { advertiser: 0, copy: 0, start: 0, platforms: 0 },
    unmappedPlatformIcons: false,
    dateSample: '',
    lastError: '',
    noKey: false,
    firstScanAt: Date.now()
  };

  const clean = (s) => (s || '').replace(/[​ ]/g, ' ').replace(/[ \t]+/g, ' ').trim();
  // v2: análises da v1 foram feitas sem a data em pt-PT. v3: um nicho virou até 3 tags.
  // Mudar a versão invalida as entradas antigas.
  const CACHE_VERSION = 'v3';
  const nicheSig = () => state.niches.map((n) => n.toLowerCase()).sort().join('+');
  const cacheKey = (id) => `${CACHE_VERSION}|${id}|${nicheSig()}`;

  // Nota de cada nicho da decisão: [{ name, p }], na ordem em que as perguntas foram feitas.
  const nicheScores = (decision) =>
    (decision.niches || []).map((name, i) => ({ name, p: decision.answers[`nicho_${i}`]?.noul ?? 0 }));
  const bestNiche = (decision) =>
    nicheScores(decision).reduce((best, n) => (!best || n.p > best.p ? n : best), null);
  const nicheP = (decision, name) =>
    nicheScores(decision).find((n) => n.name.toLowerCase() === name.toLowerCase())?.p ?? 0;

  // ------------------------------------------------------------ achar cards
  function findCards() {
    const found = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        if (!RE_ID_LABEL.test(n.textContent.trim())) return NodeFilter.FILTER_SKIP;
        if (n.parentElement?.closest('[data-cacador-id]')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    let node;
    while ((node = walker.nextNode())) {
      const m = RE_ID.exec(node.parentElement?.textContent || node.textContent);
      if (!m) continue;
      // Sobe até o maior ancestral que ainda contém só UM "Identificação da biblioteca".
      let el = node.parentElement;
      while (el.parentElement && el.parentElement !== document.body) {
        const count = (el.parentElement.textContent.match(RE_ID_G) || []).length;
        if (count > 1) break;
        el = el.parentElement;
      }
      if (el.hasAttribute('data-cacador-id')) continue;
      el.setAttribute('data-cacador-id', m[1]);
      found.push(el);
    }
    return found;
  }

  // ---------------------------------------------------------------- extração
  // Aceita pt/es/en sem depender da frase antes da data:
  // "29 de jul de 2026", "29 jul 2026", "29 de julio de 2026", "Jul 29, 2026", "29/07/2026", "2026-07-29".
  function parseDate(s) {
    s = clean(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const month = (w) => MONTHS[w.slice(0, 3)];
    let m;
    const dayMonYear = /(\d{1,2})\s+(?:de\s+)?([a-z]{3,})\.?,?\s+(?:de\s+)?(\d{4})/g;
    while ((m = dayMonYear.exec(s))) if (month(m[2]) != null) return Date.UTC(+m[3], month(m[2]), +m[1]);
    const monDayYear = /([a-z]{3,})\.?\s+(\d{1,2}),?\s+(\d{4})/g;
    while ((m = monDayYear.exec(s))) if (month(m[1]) != null) return Date.UTC(+m[3], month(m[1]), +m[2]);
    if ((m = /(\d{4})-(\d{2})-(\d{2})/.exec(s))) return Date.UTC(+m[1], +m[2] - 1, +m[3]);
    if ((m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s))) return Date.UTC(+m[3], +m[2] - 1, +m[1]);
    return null;
  }

  // Data de início (e de fim, se inativo) procurada nas linhas logo abaixo do ID da biblioteca.
  function findDates(lines) {
    const idIdx = lines.findIndex((l) => RE_ID.test(l));
    const candidates = [
      ...lines.filter((l) => RE_START.test(l)),
      ...lines.slice(idIdx + 1, idIdx + 4).filter((l) => !RE_PLATFORMS.test(l))
    ];
    for (const l of candidates) {
      // inativo: "25 de jun de 2026 a 2 de jul de 2026" / "Jun 25, 2026 - Jul 2, 2026" / "... al ..."
      const range = /^(.+?\d{4})\s+(?:[-–]|a|al|ate|até|hasta|to)\s+(.+\d{4}.*)$/i.exec(l);
      if (range && parseDate(range[1]) != null && parseDate(range[2]) != null) {
        return { start: parseDate(range[1]), end: parseDate(range[2]) };
      }
      const start = parseDate(l);
      if (start != null) return { start, end: null };
    }
    if (!state.dateSample && idIdx >= 0 && lines[idIdx + 1]) state.dateSample = lines[idIdx + 1].slice(0, 80);
    return { start: null, end: null };
  }

  function todayUTC() {
    const d = new Date();
    return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function fmtDate(ts) {
    return ts == null ? '' : new Date(ts).toISOString().slice(0, 10);
  }

  function extractPlatforms(card) {
    const label = [...card.querySelectorAll('span, div')].find(
      (e) => e.childElementCount === 0 && RE_PLATFORMS.test(clean(e.textContent))
    );
    if (!label) return { list: [], found: false };
    let row = label.parentElement;
    for (let i = 0; i < 5 && row && !row.querySelector('[style*="mask-image"], img'); i++) row = row.parentElement;
    if (!row) return { list: [], found: false };
    const icons = [...row.querySelectorAll('[style*="mask-image"], img')];
    const list = icons.map((ic) => {
      const labelled = ic.closest('[aria-label], [title]');
      const aria = ic.getAttribute('alt') || labelled?.getAttribute('aria-label') || labelled?.getAttribute('title');
      if (aria && aria.length < 30) return aria;
      const file = (ic.style.maskImage || '').split('/').pop().replace(/\.\w+["')]*$/, '');
      const name = PLATFORM_SPRITES[`${file}@${ic.style.maskPosition}`];
      if (!name) state.unmappedPlatformIcons = true;
      return name || null;
    });
    const known = list.filter(Boolean);
    const unknown = list.length - known.length;
    if (unknown) known.push(`${unknown} ícone(s) não identificado(s)`);
    return { list: known, count: list.length, found: list.length > 0 };
  }

  function extractLinkCard(card) {
    const link = [...card.querySelectorAll('a[href]')].find((a) => {
      const h = a.href;
      return /l\.facebook\.com\/l\.php/.test(h) || (!/facebook\.com|fb\.com|instagram\.com/.test(h) && /^https?:/.test(h));
    });
    let domain = '', title = '', cta = '';
    if (link) {
      const lines = link.innerText.split('\n').map(clean).filter(Boolean);
      domain = lines.find((l) => /^(HTTPS?:\/\/)?[A-Z0-9-]+(\.[A-Z0-9-]+)+(\/\S*)?$/.test(l)) || '';
      cta = lines.find((l) => CTAS.has(l.toLowerCase())) || '';
      title = lines.find((l) => l !== domain && l !== cta) || '';
    }
    if (!cta) {
      const btn = [...card.querySelectorAll('[role="button"], button')]
        .map((b) => clean(b.innerText))
        .find((t) => CTAS.has(t.toLowerCase()));
      cta = btn || '';
    }
    return { domain: domain.toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, ''), title, cta, linkText: link ? clean(link.innerText) : '' };
  }

  function firstSentence(copy) {
    const first = copy.split(/\n+/).map(clean).find(Boolean) || '';
    const m = /^(.+?[.!?…])(\s|$)/.exec(first);
    return (m ? m[1] : first).slice(0, 240);
  }

  function extractAd(card, id) {
    const lines = card.innerText.split('\n').map(clean).filter(Boolean);

    // anunciante: primeiro link para uma página do Facebook; senão, a linha antes de "Patrocinado"
    const pageLink = [...card.querySelectorAll('a[href*="facebook.com/"]')].find(
      (a) => clean(a.innerText) && !/\/ads\/library|l\.php/.test(a.href)
    );
    const sponsoredIdx = lines.findIndex((l) => RE_SPONSORED.test(l));
    const advertiser = clean(pageLink?.innerText) || (sponsoredIdx > 0 ? lines[sponsoredIdx - 1] : '');

    // copy: bloco com white-space: pre-wrap (corpo do anúncio); senão, o texto após "Patrocinado"
    const link = extractLinkCard(card);
    let copy = clean(card.querySelector('div[style*="pre-wrap"]')?.innerText || '');
    if (!copy && sponsoredIdx >= 0) {
      copy = lines.slice(sponsoredIdx + 1).filter((l) => !link.linkText.includes(l)).join('\n');
    }
    copy = copy.replace(RE_SEE_MORE, '').slice(0, MAX_COPY_CHARS);

    // datas e dias no ar
    const { start, end } = findDates(lines);
    const inactive = lines.some((l) => RE_INACTIVE.test(l));
    const daysRunning = start == null ? null : Math.max(0, Math.round(((end ?? todayUTC()) - start) / 864e5));

    const countMatch = RE_COUNT.exec(card.innerText);
    const platforms = extractPlatforms(card);

    if (!advertiser) state.fieldMisses.advertiser++;
    if (!copy) state.fieldMisses.copy++;
    if (start == null) state.fieldMisses.start++;
    if (!platforms.found) state.fieldMisses.platforms++;

    return {
      library_id: id,
      advertiser,
      ad_copy: copy,
      first_sentence: firstSentence(copy),
      headline: link.title,
      call_to_action: link.cta,
      landing_domain: link.domain,
      started_running_on: fmtDate(start),
      ended_on: end ? fmtDate(end) : null,
      is_active: !inactive,
      days_running: daysRunning,
      ads_using_this_creative: countMatch ? Number(countMatch[1]) : 1,
      has_multiple_versions: RE_MULTI.test(card.innerText),
      platforms: platforms.list,
      today: fmtDate(todayUTC())
    };
  }

  // ------------------------------------------------------------------ regras
  function verdictOf(decision) {
    const esc = decision.answers.escalado?.noul ?? 0.5;
    // Encaixa no nicho se QUALQUER um dos nichos passar do mínimo. Sem nichos definidos, não filtra por nicho.
    const best = bestNiche(decision);
    const fitsNiche = !best || best.p >= RULES.NICHO_MIN;
    // Noul não tem campo confidence (docs TypeSafe): a incerteza dele é ficar perto de 0,5.
    // Por isso a faixa 0,40–0,75 é tratada como confiança baixa.
    if (esc < RULES.TESTE_MAX) return { key: 'teste', label: '🧪 TESTE' };
    if (esc >= RULES.ESCALADO_MIN && fitsNiche) return { key: 'escalado', label: '🔥 ESCALADO' };
    if (esc >= RULES.ESCALADO_MIN) return { key: 'fora', label: '📌 ESCALADO · fora do nicho' };
    return { key: 'incerto', label: '❔ INCERTO' };
  }

  // ------------------------------------------------------------------ selos
  function badgeEl(card) {
    let el = card.querySelector(':scope > .cacador-badge');
    if (!el) {
      el = document.createElement('div');
      el.className = 'cacador-badge';
      card.prepend(el);
    }
    return el;
  }

  function renderLoading(card) {
    const el = badgeEl(card);
    el.dataset.v = 'loading';
    el.textContent = '⏳ JEV analisando…';
  }

  function renderError(card, id, msg) {
    const el = badgeEl(card);
    el.dataset.v = 'erro';
    el.textContent = `⚠️ ${msg} (clique para tentar de novo)`;
    el.onclick = () => { el.onclick = null; enqueue(id); };
  }

  function renderDecision(card, rec) {
    const { answers } = rec.decision;
    const v = rec.verdict;
    const el = badgeEl(card);
    el.dataset.v = v.key;
    el.onclick = null;
    el.textContent = '';

    const angle = answers.angulo || {};
    const hook = answers.gancho || {};
    const hookLevel = Math.max(0, Math.min(3, Math.round(hook.score ?? 0)));
    const angleLow = (angle.confidence ?? 0) < RULES.CONF_MIN;
    const hookLow = (hook.confidence ?? 0) < RULES.CONF_MIN;
    const esc = Math.round((answers.escalado?.noul ?? 0) * 100);
    const scores = nicheScores(rec.decision);
    const best = bestNiche(rec.decision);

    const add = (cls, text, title) => {
      const s = document.createElement('span');
      s.className = cls;
      s.textContent = text;
      if (title) s.title = title;
      el.appendChild(s);
    };
    add('cacador-verdict', v.label);
    add('cacador-angle' + (angleLow ? ' cacador-low' : ''), (ANGLES[angle.choice] || '—') + (angleLow ? ' ?' : ''),
      `Ângulo · confiança ${Math.round((angle.confidence ?? 0) * 100)}%`);
    add('cacador-dots' + (hookLow ? ' cacador-low' : ''), '●'.repeat(hookLevel + 1) + '○'.repeat(3 - hookLevel),
      `Gancho: ${HOOK_LEVELS[hookLevel]} (score ${(hook.score ?? 0).toFixed(2)}) · confiança ${Math.round((hook.confidence ?? 0) * 100)}%`);
    add('cacador-pct', `${esc}%`, 'Probabilidade de estar dando resultado');
    if (best) {
      add('cacador-niche', `${best.name} ${Math.round(best.p * 100)}%`,
        'Serve de referência para:\n' + scores.map((n) => `• ${n.name}: ${Math.round(n.p * 100)}%`).join('\n'));
    }
    if (rec.decision.cached) add('cacador-cached', 'cache', 'Resultado do cache, sem nova chamada ao JEV');
    applyFilter(rec);
  }

  // Chip ativo no painel: apaga os cards que não servem para aquele nicho.
  function matchesFilter(rec) {
    return !state.activeNiche || !rec.decision || nicheP(rec.decision, state.activeNiche) >= RULES.NICHO_MIN;
  }

  function applyFilter(rec) {
    rec.card.classList.toggle('cacador-dim', !matchesFilter(rec));
  }

  // ------------------------------------------------------------------- fila
  function enqueue(id) {
    if (state.inflight.has(id) || state.queue.includes(id)) return;
    const rec = state.ads.get(id);
    const cached = state.cache[cacheKey(id)];
    if (cached) {
      rec.decision = { ...cached, cached: true };
      rec.verdict = verdictOf(cached);
      renderDecision(rec.card, rec);
      updatePanel();
      return;
    }
    renderLoading(rec.card);
    state.queue.push(id);
    pump();
  }

  function pump() {
    while (state.running < MAX_CONCURRENT && state.queue.length) {
      const id = state.queue.shift();
      state.running++;
      state.inflight.add(id);
      runOne(id).finally(() => {
        state.running--;
        state.inflight.delete(id);
        pump();
      });
    }
  }

  async function runOne(id) {
    const rec = state.ads.get(id);
    const niches = [...state.niches];
    const key = cacheKey(id);
    let res;
    try {
      res = await chrome.runtime.sendMessage({ type: 'JEV_DECIDE', ad: rec.ad, niches });
    } catch (e) {
      res = { ok: false, error: 'Extensão recarregada. Atualize a página.' };
    }
    if (!res?.ok) {
      state.stats.errors++;
      state.lastError = res?.error || 'Erro';
      state.noKey = res?.code === 'NO_KEY';
      renderError(rec.card, id, res?.error || 'Erro');
      updatePanel();
      return;
    }
    state.noKey = false;
    const cost = typeof res.usage.cost === 'number'
      ? res.usage.cost
      : (state.stats.costEstimated = true, (res.usage.input_tokens || 0) * PRICE_PER_INPUT_TOKEN);
    state.stats.calls++;
    state.stats.totalMs += res.ms;
    state.stats.totalCost += cost;

    const decision = { answers: res.answers, niches, model: res.model, ms: res.ms, cost, at: Date.now() };
    state.cache[key] = decision;
    saveCache();
    // Os nichos mudaram enquanto a chamada estava em andamento: essa resposta já não vale para a tela.
    // Reenfileira depois que o finally do pump liberar o id.
    if (key !== cacheKey(id)) { setTimeout(() => enqueue(id), 0); return; }
    rec.decision = decision;
    rec.verdict = verdictOf(decision);
    renderDecision(rec.card, rec);
    updatePanel();
  }

  let saveTimer = null;
  function saveCache() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const keys = Object.keys(state.cache);
      if (keys.length > CACHE_LIMIT) {
        keys.sort((a, b) => (state.cache[a].at || 0) - (state.cache[b].at || 0))
          .slice(0, keys.length - CACHE_LIMIT)
          .forEach((k) => delete state.cache[k]);
      }
      chrome.storage.local.set({ [CACHE_KEY]: state.cache });
    }, 500);
  }

  // -------------------------------------------------- detectar ao rolar a tela
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      io.unobserve(e.target);
      const id = e.target.getAttribute('data-cacador-id');
      const rec = state.ads.get(id);
      if (!rec.ad) rec.ad = extractAd(rec.card, id);
      enqueue(id);
    }
  }, { threshold: 0.25 });

  function scan() {
    for (const card of findCards()) {
      const id = card.getAttribute('data-cacador-id');
      if (state.ads.has(id)) continue; // mesmo anúncio duas vezes na página
      state.ads.set(id, { card, ad: null, decision: null, verdict: null });
      io.observe(card);
    }
    updatePanel();
  }

  let scanTimer = null;
  new MutationObserver(() => {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(scan, 400);
  }).observe(document.body, { childList: true, subtree: true });

  // ----------------------------------------------------------------- painel
  const host = document.createElement('div');
  host.id = 'cacador-panel-host';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>
      :host { all: initial; }
      .p { position: fixed; top: 90px; right: 12px; z-index: 2147483000; width: 250px;
           font: 13px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; color: #1c1e21;
           background: #fff; border: 1px solid #dadde1; border-radius: 10px;
           box-shadow: 0 6px 24px rgba(0,0,0,.15); overflow: hidden; }
      .p.min .body { display: none; }
      .hd { display: flex; align-items: center; justify-content: space-between; padding: 8px 10px;
            background: #1c1e21; color: #fff; font-weight: 600; cursor: pointer; user-select: none; }
      .body { padding: 10px; }
      .row { display: flex; justify-content: space-between; padding: 3px 0; }
      .row b { font-variant-numeric: tabular-nums; }
      .verd { display: flex; flex-wrap: wrap; gap: 4px; margin: 8px 0; }
      .verd span { background: #f0f2f5; border-radius: 999px; padding: 2px 8px; font-size: 12px; }
      .warn { background: #fff4e5; border: 1px solid #ffb74d; color: #6d4c00; border-radius: 6px;
              padding: 6px 8px; margin-top: 8px; font-size: 12px; }
      .err { background: #fdecea; border-color: #f28b82; color: #7f1d1d; }
      button { width: 100%; margin-top: 8px; padding: 7px; border: 0; border-radius: 6px;
               font: inherit; font-weight: 600; cursor: pointer; background: #1877f2; color: #fff; }
      button.sec { background: #e4e6eb; color: #1c1e21; }
      .nlabel { font-size: 11px; color: #65676b; text-transform: uppercase; letter-spacing: .04em; margin-bottom: 4px; }
      .niches { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px; }
      .chip { width: auto; margin: 0; padding: 3px 9px; border: 1px solid #ccd0d5; border-radius: 999px;
              background: #fff; color: #1c1e21; font-size: 12px; font-weight: 600; }
      .chip.on { background: #1877f2; border-color: #1877f2; color: #fff; }
      .chip .n { font-weight: 500; opacity: .8; margin-left: 4px; }
      .none { font-size: 12px; color: #65676b; }
      .btns { display: flex; gap: 6px; }
    </style>
    <div class="p">
      <div class="hd"><span>🎯 Caçador de Anúncios</span><span class="tg">–</span></div>
      <div class="body">
        <div class="nlabel">Nichos · clique para filtrar</div>
        <div class="niches"></div>
        <div class="row"><span>Anúncios lidos</span><b data-k="read">0</b></div>
        <div class="row"><span>Decisões do JEV</span><b data-k="calls">0</b></div>
        <div class="row"><span>Tempo médio/decisão</span><b data-k="avg">—</b></div>
        <div class="row"><span>Custo total</span><b data-k="cost">US$ 0</b></div>
        <div class="verd"></div>
        <div class="warns"></div>
        <div class="btns">
          <button class="exp">Exportar CSV</button>
          <button class="pdf">Relatório PDF</button>
        </div>
        <button class="sec opt">Opções</button>
      </div>
    </div>`;
  const $ = (s) => root.querySelector(s);
  $('.hd').onclick = () => {
    $('.p').classList.toggle('min');
    $('.tg').textContent = $('.p').classList.contains('min') ? '+' : '–';
  };
  $('.opt').onclick = () => chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS' });
  $('.exp').onclick = exportCsv;
  $('.pdf').onclick = exportPdf;
  document.documentElement.appendChild(host);

  function warnings() {
    const w = [];
    if (state.noKey) w.push(['err', 'Chave do OpenRouter não configurada. Abra as Opções.']);
    else if (state.lastError) w.push(['err', 'Último erro: ' + state.lastError]);
    if (!state.niches.length) {
      w.push(['', 'Nenhum nicho definido: o 🔥 ESCALADO não está filtrando por nicho. Adicione até 3 nas Opções.']);
    }

    const seen = state.ads.size;
    const onResults = /\bq=|search_type|view_all_page_id|id=/.test(location.search);
    if (seen === 0 && onResults && Date.now() - state.firstScanAt > 8000) {
      w.push(['', 'Nenhum card encontrado pelo texto "Identificação da biblioteca" / "Library ID". ' +
        'O layout da Biblioteca pode ter mudado.']);
    }
    const extracted = [...state.ads.values()].filter((r) => r.ad).length;
    if (extracted >= 5) {
      const names = { advertiser: 'anunciante', copy: 'texto da copy', start: 'data de início', platforms: 'plataformas' };
      for (const [k, miss] of Object.entries(state.fieldMisses)) {
        if (miss / extracted > 0.5) {
          const sample = k === 'start' && state.dateSample ? ` Texto encontrado: "${state.dateSample}"` : '';
          w.push(['', `Campo "${names[k]}" não encontrado em ${miss}/${extracted} cards — a referência de texto pode ter mudado.${sample}`]);
        }
      }
    }
    if (state.unmappedPlatformIcons) {
      w.push(['', 'Alguns ícones de plataforma não foram reconhecidos (o sprite da Meta mudou). ' +
        'Eles aparecem como "ícone não identificado".']);
    }
    return w;
  }

  function setFilter(name) {
    state.activeNiche = state.activeNiche === name ? null : name;
    for (const rec of state.ads.values()) applyFilter(rec);
    updatePanel();
  }

  // Um chip por nicho: quantos anúncios servem para ele e quantos desses estão escalados.
  function renderNicheChips(recs) {
    const box = $('.niches');
    box.textContent = '';
    if (!state.niches.length) {
      const s = document.createElement('span');
      s.className = 'none';
      s.textContent = '— nenhum nicho definido —';
      box.appendChild(s);
      return;
    }
    for (const name of state.niches) {
      const fit = recs.filter((r) => nicheP(r.decision, name) >= RULES.NICHO_MIN);
      const hot = fit.filter((r) => r.verdict.key === 'escalado').length;
      const chip = document.createElement('button');
      chip.className = 'chip' + (state.activeNiche === name ? ' on' : '');
      chip.title = `${fit.length} anúncio(s) servem para "${name}", ${hot} escalado(s). Clique para apagar os outros.`;
      chip.textContent = name;
      const n = document.createElement('span');
      n.className = 'n';
      n.textContent = `${fit.length} · 🔥${hot}`;
      chip.appendChild(n);
      chip.onclick = () => setFilter(name);
      box.appendChild(chip);
    }
  }

  function updatePanel() {
    const recs = [...state.ads.values()].filter((r) => r.decision);
    $('[data-k="read"]').textContent = recs.length;
    $('[data-k="calls"]').textContent = state.stats.calls;
    $('[data-k="avg"]').textContent = state.stats.calls ? Math.round(state.stats.totalMs / state.stats.calls) + ' ms' : '—';
    $('[data-k="cost"]').textContent = 'US$ ' + state.stats.totalCost.toFixed(6) + (state.stats.costEstimated ? ' (est.)' : '');
    renderNicheChips(recs);

    const counts = {};
    recs.forEach((r) => { counts[r.verdict.label] = (counts[r.verdict.label] || 0) + 1; });
    const verd = $('.verd');
    verd.textContent = '';
    Object.entries(counts).forEach(([label, n]) => {
      const s = document.createElement('span');
      s.textContent = `${label} ${n}`;
      verd.appendChild(s);
    });

    const box = $('.warns');
    box.textContent = '';
    warnings().forEach(([cls, text]) => {
      const d = document.createElement('div');
      d.className = 'warn ' + cls;
      d.textContent = text;
      box.appendChild(d);
    });
  }

  // ------------------------------------------------------------- exportação
  // Os dois exports respeitam o chip ativo: com um nicho selecionado, saem só os anúncios dele.
  const VERDICT_ORDER = { escalado: 0, fora: 1, incerto: 2, teste: 3 };
  function exportRecs() {
    return [...state.ads.values()]
      .filter((r) => r.decision && matchesFilter(r))
      .sort((a, b) => VERDICT_ORDER[a.verdict.key] - VERDICT_ORDER[b.verdict.key]
        || (b.decision.answers.escalado?.noul ?? 0) - (a.decision.answers.escalado?.noul ?? 0));
  }

  const hookLevelOf = (a) => Math.max(0, Math.min(3, Math.round(a.gancho?.score ?? 0)));
  const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');

  function exportCsv() {
    const nicheCols = [];
    for (let i = 0; i < MAX_NICHES; i++) nicheCols.push(`nicho_${i + 1}`, `nicho_${i + 1}_%`);
    const cols = [
      'library_id', 'link', 'veredito', 'escalado_%', ...nicheCols, 'angulo', 'angulo_confianca_%',
      'gancho_score', 'gancho_nivel', 'gancho_confianca_%', 'dias_no_ar', 'inicio', 'fim', 'ativo',
      'anuncios_com_criativo', 'varias_versoes', 'plataformas', 'anunciante', 'titulo', 'cta', 'dominio',
      'primeira_frase', 'copy', 'modelo', 'ms', 'custo_usd'
    ];
    const esc = (v) => {
      const s = v == null ? '' : String(v);
      return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const pct = (x) => (x == null ? '' : Math.round(x * 100));
    const rows = exportRecs().map(({ ad, decision, verdict }) => {
      const a = decision.answers;
      const scores = nicheScores(decision);
      const nicheVals = [];
      for (let i = 0; i < MAX_NICHES; i++) nicheVals.push(scores[i]?.name ?? '', scores[i] ? pct(scores[i].p) : '');
      return [
        ad.library_id, `https://www.facebook.com/ads/library/?id=${ad.library_id}`, verdict.label,
        pct(a.escalado?.noul), ...nicheVals, ANGLES[a.angulo?.choice] || '', pct(a.angulo?.confidence),
        a.gancho?.score?.toFixed(2) ?? '', HOOK_LEVELS[hookLevelOf(a)], pct(a.gancho?.confidence), ad.days_running ?? '',
        ad.started_running_on, ad.ended_on || '', ad.is_active ? 'sim' : 'não', ad.ads_using_this_creative,
        ad.has_multiple_versions ? 'sim' : 'não', ad.platforms.join(', '), ad.advertiser, ad.headline,
        ad.call_to_action, ad.landing_domain, ad.first_sentence, ad.ad_copy, decision.model || '',
        decision.cached ? '' : decision.ms, decision.cached ? '' : decision.cost?.toFixed(8)
      ].map(esc).join(';');
    });
    if (!rows.length) { alert('Nenhum anúncio analisado ainda.'); return; }
    // BOM + ";" para abrir direto no Excel em português
    const csv = '﻿' + cols.join(';') + '\r\n' + rows.join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `cacador-achados-${stamp()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  // PDF: salva os achados no storage e abre report.html (página da extensão), que chama a
  // impressão do Chrome — lá é só escolher "Salvar como PDF".
  async function exportPdf() {
    const recs = exportRecs();
    if (!recs.length) { alert('Nenhum anúncio analisado ainda.'); return; }
    const report = {
      generatedAt: new Date().toISOString(),
      fileName: `cacador-relatorio-${stamp()}`,
      search: new URLSearchParams(location.search).get('q') || '',
      niches: state.niches,
      filter: state.activeNiche,
      stats: {
        read: [...state.ads.values()].filter((r) => r.decision).length,
        calls: state.stats.calls,
        avgMs: state.stats.calls ? Math.round(state.stats.totalMs / state.stats.calls) : null,
        cost: state.stats.totalCost
      },
      ads: recs.map(({ ad, decision, verdict }) => {
        const a = decision.answers;
        return {
          id: ad.library_id,
          link: `https://www.facebook.com/ads/library/?id=${ad.library_id}`,
          verdict: verdict.label,
          verdictKey: verdict.key,
          escalado: a.escalado?.noul ?? null,
          niches: nicheScores(decision),
          angle: ANGLES[a.angulo?.choice] || '—',
          angleLow: (a.angulo?.confidence ?? 0) < RULES.CONF_MIN,
          hookLevel: hookLevelOf(a),
          hookLabel: HOOK_LEVELS[hookLevelOf(a)],
          hookLow: (a.gancho?.confidence ?? 0) < RULES.CONF_MIN,
          advertiser: ad.advertiser,
          headline: ad.headline,
          cta: ad.call_to_action,
          domain: ad.landing_domain,
          days: ad.days_running,
          start: ad.started_running_on,
          active: ad.is_active,
          creatives: ad.ads_using_this_creative,
          platforms: ad.platforms,
          firstSentence: ad.first_sentence,
          copy: ad.ad_copy
        };
      })
    };
    await chrome.storage.local.set({ lastReport: report });
    chrome.runtime.sendMessage({ type: 'OPEN_REPORT' });
  }

  // ------------------------------------------------------------------- init
  const normalizeNiches = (list) => (Array.isArray(list) ? list : [])
    .map((n) => String(n).trim()).filter(Boolean).slice(0, MAX_NICHES);

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.niches) {
      state.niches = normalizeNiches(changes.niches.newValue);
      if (state.activeNiche && !state.niches.includes(state.activeNiche)) state.activeNiche = null;
      // Nichos novos = perguntas novas: reanalisa o que já foi lido (o cache cobre combinações já vistas).
      for (const [id, rec] of state.ads) {
        if (!rec.ad) continue;
        rec.decision = null;
        rec.verdict = null;
        rec.card.classList.remove('cacador-dim');
        enqueue(id);
      }
      updatePanel();
    }
    if (changes.openrouterKey && changes.openrouterKey.newValue) {
      state.noKey = false;
      state.lastError = '';
      // tenta de novo os cards que falharam por falta de chave
      for (const [id, rec] of state.ads) if (rec.ad && !rec.decision) enqueue(id);
      updatePanel();
    }
    if (changes[CACHE_KEY] && !changes[CACHE_KEY].newValue) state.cache = {};
  });

  chrome.storage.local.get(['niches', 'niche', CACHE_KEY]).then((s) => {
    // Versão antiga guardava um nicho só, como texto: vira a primeira tag.
    state.niches = normalizeNiches(s.niches ?? (s.niche ? [s.niche] : []));
    state.cache = s[CACHE_KEY] || {};
    // descarta entradas de versões antigas do cache
    for (const k of Object.keys(state.cache)) if (!k.startsWith(CACHE_VERSION + '|')) delete state.cache[k];
    state.firstScanAt = Date.now();
    scan();
    setTimeout(updatePanel, 8500); // reavalia o aviso de "nenhum card encontrado"
  });
})();
