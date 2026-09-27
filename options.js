const $ = (id) => document.getElementById(id);
const MAX_NICHES = 3;
let niches = [];

function showKeyState(hasKey) {
  // Nunca exibe a chave; só informa se existe.
  $('keyState').textContent = hasKey ? '✅ Chave salva.' : 'Nenhuma chave salva.';
}

function flash(msg) {
  $('status').textContent = msg;
  clearTimeout(flash.t);
  flash.t = setTimeout(() => { $('status').textContent = ''; }, 2500);
}

// ------------------------------------------------------------------ nichos (tags)
function renderTags() {
  const box = $('tags');
  const input = $('nicheInput');
  box.querySelectorAll('.tag').forEach((t) => t.remove());
  niches.forEach((name, i) => {
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = name;
    const x = document.createElement('button');
    x.type = 'button';
    x.textContent = '×';
    x.title = `Remover "${name}"`;
    x.onclick = () => removeNiche(i);
    tag.appendChild(x);
    box.insertBefore(tag, input);
  });
  const full = niches.length >= MAX_NICHES;
  input.disabled = full;
  input.placeholder = full ? 'máximo de 3 nichos' : 'digite um nicho e aperte Enter';
  $('count').textContent = `${niches.length} de ${MAX_NICHES} nichos`;
}

async function saveNiches(msg) {
  await chrome.storage.local.set({ niches });
  renderTags();
  flash(msg);
}

function addNiche(raw) {
  const name = raw.trim().replace(/\s+/g, ' ').slice(0, 60);
  if (!name) return;
  if (niches.some((n) => n.toLowerCase() === name.toLowerCase())) { flash('Esse nicho já está na lista.'); return; }
  if (niches.length >= MAX_NICHES) { flash('Máximo de 3 nichos.'); return; }
  niches.push(name);
  saveNiches(`Nicho "${name}" adicionado.`);
}

function removeNiche(i) {
  const [name] = niches.splice(i, 1);
  saveNiches(`Nicho "${name}" removido.`);
  $('nicheInput').focus();
}

$('tags').addEventListener('click', (e) => { if (e.target.id === 'tags') $('nicheInput').focus(); });

$('nicheInput').addEventListener('keydown', (e) => {
  const input = e.target;
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    addNiche(input.value);
    input.value = '';
  } else if (e.key === 'Backspace' && !input.value && niches.length) {
    removeNiche(niches.length - 1);
  }
});

// ---------------------------------------------------------------------- init
chrome.storage.local.get(['openrouterKey', 'niches', 'niche']).then(({ openrouterKey, niches: saved, niche }) => {
  showKeyState(Boolean(openrouterKey));
  // Versão antiga guardava um nicho só, como texto: vira a primeira tag.
  niches = Array.isArray(saved) ? saved.slice(0, MAX_NICHES) : (niche ? [niche.trim()] : []);
  if (!Array.isArray(saved) && niches.length) chrome.storage.local.set({ niches });
  renderTags();
});

// Salvar agora só cuida da chave; os nichos são salvos na hora em que você adiciona/remove.
$('save').addEventListener('click', async () => {
  const key = $('key').value.trim();
  const pending = $('nicheInput').value.trim();
  if (pending) { addNiche(pending); $('nicheInput').value = ''; }
  if (!key) { if (!pending) flash('Nada novo para salvar.'); return; }
  if (!key.startsWith('sk-or-')) {
    flash('⚠️ Isso não parece uma chave do OpenRouter (começa com sk-or-).');
    return;
  }
  await chrome.storage.local.set({ openrouterKey: key });
  $('key').value = '';
  showKeyState(true);
  flash('Chave salva.');
});

$('clear').addEventListener('click', async () => {
  await chrome.storage.local.remove('jevCache');
  flash('Cache limpo.');
});
