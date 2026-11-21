const byId = (id) => document.getElementById(id);
const video = byId('video');
const status = byId('status');
const verdict = byId('verdict');
const button = byId('inspect');
const catalogPreview = byId('catalog-preview');
const catalogInput = byId('catalog');
const clipInput = byId('clip');
const skuInput = byId('sku');
const frames = { item: '', label: '' };
const checkNames = {
  item: 'Item identity',
  sku: 'Tag / SKU',
  parts: 'Included parts',
  packaging: 'Packaging',
  visible_wear: 'Visible wear',
};
let clipUrl;
let catalogRevision = 0;
let token = '';
let widget;
let busy = false;

function refresh() {
  button.disabled = busy || !token || !frames.item || !frames.label || !catalogPreview.complete || !catalogPreview.naturalWidth;
}

function clearVerdict() {
  verdict.hidden = true;
  byId('findings').replaceChildren();
}

function setClip(src) {
  if (clipUrl) URL.revokeObjectURL(clipUrl);
  clipUrl = src.startsWith('blob:') ? src : undefined;
  video.src = src;
  for (const key of Object.keys(frames)) {
    frames[key] = '';
    byId(key).removeAttribute('src');
    byId(key).hidden = true;
  }
  clearVerdict();
  refresh();
}

function encode(source, width, height) {
  const scale = Math.min(1, 960 / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.78);
}

for (const key of Object.keys(frames)) {
  byId(`capture-${key}`).addEventListener('click', async () => {
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || video.seeking || !video.videoWidth) {
      status.textContent = 'Wait for the frame to load, then try capturing it again.';
      return;
    }
    video.pause();
    const source = video.currentSrc;
    const time = video.currentTime;
    // After seeking, wait for the selected frame to reach the compositor.
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    if (video.seeking || video.currentSrc !== source || video.currentTime !== time) return;
    const data = encode(video, video.videoWidth, video.videoHeight);
    byId(key).src = data;
    byId(key).hidden = false;
    frames[key] = data.split(',')[1];
    clearVerdict();
    status.textContent = key === 'item' ? 'Item frame captured.' : 'Label frame captured.';
    refresh();
  });
}

catalogInput.addEventListener('change', async () => {
  const file = catalogInput.files[0];
  if (!file) return;
  const revision = ++catalogRevision;
  if (file.size > 20 * 1024 * 1024) {
    status.textContent = 'Choose a catalog image under 20 MB.';
    return;
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (revision !== catalogRevision) return;
    catalogPreview.src = encode(image, image.naturalWidth, image.naturalHeight);
    byId('catalog-caption').textContent = 'Your catalog reference';
    if (skuInput.value === 'RP-WK-044') skuInput.value = '';
    clearVerdict();
    refresh();
  } catch {
    if (revision === catalogRevision) status.textContent = 'Could not open that catalog image.';
  } finally {
    URL.revokeObjectURL(url);
  }
});

catalogPreview.addEventListener('load', refresh);
skuInput.addEventListener('input', clearVerdict);
clipInput.addEventListener('change', () => {
  const file = clipInput.files[0];
  if (file) {
    status.textContent = '';
    setClip(URL.createObjectURL(file));
  }
});
video.addEventListener('error', () => {
  status.textContent = 'Could not play this clip. Try an H.264 MP4 or WebM file.';
});

byId('sample').addEventListener('click', () => {
  catalogRevision += 1;
  catalogInput.value = '';
  clipInput.value = '';
  catalogPreview.src = '/catalog.jpg';
  skuInput.value = 'RP-WK-044';
  byId('catalog-caption').textContent = 'Illustrated sample · RP-WK-044';
  status.textContent = '';
  setClip('/return-sample.mp4');
});

function addFinding({ check, status: outcome, confidence, reason }) {
  const row = document.createElement('div');
  const title = document.createElement('dt');
  const description = document.createElement('dd');
  const label = outcome === 'flag' ? 'Flagged' : outcome === 'unclear' ? 'Unclear' :
    check === 'visible_wear' ? 'No clear signs' : 'Consistent';
  const review = outcome !== 'matches' || confidence === 'low';
  title.textContent = `${checkNames[check]} · ${label} · ${confidence} confidence${review ? ' · Review required' : ''}`;
  description.textContent = reason;
  row.append(title, description);
  byId('findings').append(row);
}

byId('inspection-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (button.disabled) return;
  busy = true;
  refresh();
  clearVerdict();
  status.textContent = 'Comparing catalog, item and label…';
  const started = performance.now();
  const inputs = ['catalog', 'clip', 'sku', 'sample', 'capture-item', 'capture-label'].map(byId);
  for (const input of inputs) input.disabled = true;
  try {
    const catalog = encode(catalogPreview, catalogPreview.naturalWidth, catalogPreview.naturalHeight).split(',')[1];
    const response = await fetch('/api/inspect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sku: skuInput.value.trim(), catalog, ...frames, token }),
      signal: AbortSignal.timeout(33000),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    byId('result-catalog').src = catalogPreview.src;
    byId('result-item').src = byId('item').src;
    result.findings.forEach(addFinding);
    const seconds = ((performance.now() - started) / 1000).toFixed(1);
    byId('elapsed').textContent = `Run time ${seconds}s · Pilot target under 8s`;
    verdict.hidden = false;
    status.textContent = 'Inspection complete.';
    verdict.focus();
  } catch (error) {
    status.textContent = error.name === 'TimeoutError' ? 'The inspection timed out. Try again.' :
      error.message || 'Could not complete the inspection.';
  } finally {
    busy = false;
    token = '';
    for (const input of inputs) input.disabled = false;
    refresh();
    window.turnstile.reset(widget);
  }
});

async function loadChallenge() {
  const response = await fetch('/api/config');
  const { siteKey } = await response.json();
  if (!siteKey) {
    status.textContent = 'The demo is awaiting verification setup. You can still capture frames.';
    return;
  }
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.onload = resolve;
    script.onerror = reject;
    document.head.append(script);
  });
  window.turnstile.ready(() => {
    widget = window.turnstile.render('#challenge', {
      sitekey: siteKey,
      action: 'inspect',
      size: 'flexible',
      callback: (value) => { token = value; refresh(); },
      'expired-callback': () => { token = ''; refresh(); },
      'error-callback': () => {
        token = '';
        status.textContent = 'Verification is unavailable. Reload the page and try again.';
        refresh();
      },
    });
  });
}

loadChallenge().catch(() => {
  status.textContent = 'Could not load verification. Reload the page and try again.';
});
