// Caçador de Anúncios — service worker.
// Única parte da extensão que lê a chave do OpenRouter e fala com a API.
// A chave nunca sai daqui (a página do Facebook não tem acesso) e nunca é logada.

const ENDPOINT = 'https://openrouter.ai/api/alpha/decisions'; // rota Decisions (não é a de chat)
const MODEL = 'typesafe/jev-1.13';
const RETRYABLE = new Set([429, 502, 503, 524, 529]);
const MAX_ATTEMPTS = 3;

// Jev entende melhor inglês (docs: "English is the primary training language"),
// então as perguntas vão em inglês; o estado vai com o texto original do anúncio.
// As chaves das opções são traduzidas para português no content.js.
// Uma pergunta Noul por nicho (nicho_0, nicho_1, nicho_2), todas na mesma chamada:
// cada pergunta extra custa só os tokens dela (padrão "speculative fan-out" da TypeSafe).
function nicheQuestion(niche) {
  return {
    type: 'noul',
    instructions: {
      niche,
      question: 'Would this ad be a useful creative reference (angle, hook, offer or format) for someone advertising in `niche`?'
    },
    criteria: {
      true: 'The ad targets the same or a closely related audience, product or problem as `niche`, so its approach can be adapted.',
      false: 'The ad is about an unrelated market; its approach would not transfer to `niche`.'
    }
  };
}

function buildQuestions(niches) {
  const questions = {
    escalado: {
      type: 'noul',
      instructions:
        'Judging only from the signals visible in the Meta Ad Library (`days_running`, ' +
        '`ads_using_this_creative`, `has_multiple_versions`, the number of `platforms`, ' +
        'and the quality of `ad_copy`), is this ad likely producing results for the advertiser?',
      criteria: {
        true: 'The advertiser keeps paying for it: it has been running for a long time and/or is reused across several ads, a strong sign it is profitable.',
        false: 'Recently launched, a single copy, or weak signals: most likely still being tested or not performing.'
      }
    },
    angulo: {
      type: 'choice',
      instructions: 'What is the main persuasion angle of `ad_copy`?',
      criteria: {
        pain: 'Pain: focuses on a problem, fear, frustration or loss the reader wants to escape.',
        desire: 'Desire: focuses on a dream outcome, aspiration or pleasure the reader wants to reach.',
        social_proof: 'Social proof: testimonials, results of other people, numbers of customers, case studies.',
        offer_urgency: 'Offer/urgency: discount, price, bonus, free item, deadline, scarcity or limited spots.',
        curiosity: 'Curiosity: teases a secret, a surprising fact or an open loop to make the reader click.',
        authority: 'Authority: leans on an expert, credentials, a doctor, a brand reputation, media mentions or awards.',
        none: 'No clear angle: purely informational, institutional or too short to tell.'
      }
    },
    gancho: {
      type: 'score',
      instructions: 'How strong is `first_sentence` as a hook that makes the target reader stop scrolling?',
      criteria: [
        'Weak: generic or bland opener (a greeting, the brand name, a vague statement); gives no reason to stop scrolling.',
        'OK: clear and relevant to the audience but predictable; creates only mild interest.',
        'Strong: specific and provocative; names a concrete pain, desire, number or surprising claim that makes the target reader stop.',
        'Very strong: a pattern-interrupt opener with immediate tension or curiosity and a concrete, specific promise; very hard to scroll past.'
      ]
    }
  };
  niches.slice(0, 3).forEach((niche, i) => { questions[`nicho_${i}`] = nicheQuestion(niche); });
  return questions;
}

async function getKey() {
  const { openrouterKey = '' } = await chrome.storage.local.get('openrouterKey');
  return openrouterKey.trim();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function friendlyError(status, message) {
  if (status === 401) return 'Chave do OpenRouter inválida ou ausente.';
  if (status === 402) return 'Sem créditos no OpenRouter.';
  if (status === 429) return 'Limite de requisições atingido. Tente de novo em instantes.';
  if (status === 400) return 'Requisição recusada pela API: ' + (message || 'parâmetros inválidos');
  return `Erro ${status}${message ? ': ' + message : ''}`;
}

// Os nichos vêm do content script junto com o anúncio, para a ordem nicho_0..2
// ser a mesma que ele usa para ler as respostas e montar a chave do cache.
async function decide(ad, niches) {
  const key = await getKey();
  if (!key) return { ok: false, code: 'NO_KEY', error: 'Cole sua chave do OpenRouter nas opções.' };

  const body = JSON.stringify({
    model: MODEL,
    state: ad,
    questions: buildQuestions(Array.isArray(niches) ? niches : []),
    session_id: 'cacador-de-anuncios'
  });

  let lastError = 'Falha desconhecida';
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const t0 = performance.now();
    let res;
    try {
      res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body
      });
    } catch (e) {
      lastError = 'Sem conexão com o OpenRouter.';
      await sleep(500 * 2 ** attempt);
      continue;
    }
    const ms = Math.round(performance.now() - t0);
    let json = null;
    try { json = await res.json(); } catch (_) { /* corpo não-JSON */ }

    if (res.ok && json && json.answers) {
      return { ok: true, answers: json.answers, usage: json.usage || {}, model: json.model, ms };
    }

    const message = json?.error?.message || '';
    lastError = friendlyError(res.status, message);
    if (!RETRYABLE.has(res.status) || attempt === MAX_ATTEMPTS) break;
    const retryAfter = Number(res.headers.get('retry-after'));
    await sleep(retryAfter > 0 ? retryAfter * 1000 : 800 * 2 ** attempt);
  }
  return { ok: false, error: lastError };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'JEV_DECIDE') {
    decide(msg.ad, msg.niches).then(sendResponse, (e) => sendResponse({ ok: false, error: String(e?.message || e) }));
    return true; // resposta assíncrona
  }
  if (msg?.type === 'OPEN_OPTIONS') chrome.runtime.openOptionsPage();
  if (msg?.type === 'OPEN_REPORT') {
    // O relatório é uma página da própria extensão; os dados já foram salvos em storage pelo content script.
    chrome.tabs.create({ url: chrome.runtime.getURL('report.html') });
  }
  return false;
});

chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());
