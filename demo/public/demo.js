import { renderFindings } from './findings.js';

const byId = (id) => document.getElementById(id);
const video = byId('video');
const status = byId('status');
const verdict = byId('verdict');
const button = byId('inspect');
const catalogPreview = byId('catalog-preview');
const catalogInput = byId('catalog');
const startCamera = byId('start-camera');
const stopCamera = byId('stop-camera');
const cameraState = byId('camera-state');
const skuInput = byId('sku');
const frames = { item: [], label: [] };
const captureButtons = Object.fromEntries(Object.keys(frames).map((key) => [key, byId(`capture-${key}`)]));
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let stream;
let cameraPending = false;
let cameraRevision = 0;
let capturePending = false;
let captureController;
let requestController;
let catalogRevision = 0;
let token = '';
let widget;
let busy = false;

function refresh() {
  const ready = Boolean(stream?.active && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA);
  startCamera.disabled = cameraPending || busy || Boolean(stream);
  stopCamera.disabled = !stream;
  for (const capture of Object.values(captureButtons)) {
    capture.disabled = busy || capturePending || !ready;
  }
  button.disabled = busy || capturePending || !ready || !token ||
    !frames.item.length || !frames.label.length || !catalogPreview.complete || !catalogPreview.naturalWidth;
}

function clearVerdict() {
  verdict.hidden = true;
  byId('findings').replaceChildren();
  byId('result-catalog').removeAttribute('src');
  byId('result-item').removeAttribute('src');
}

function clearFrames() {
  for (const key of Object.keys(frames)) {
    frames[key] = [];
    byId(key).removeAttribute('src');
    byId(key).hidden = true;
  }
}

function releaseCamera(message) {
  cameraRevision += 1;
  captureController?.abort();
  requestController?.abort();
  stream?.getTracks().forEach((track) => track.stop());
  stream = undefined;
  video.srcObject = null;
  clearFrames();
  cameraState.textContent = 'Camera off';
  if (message) status.textContent = message;
  refresh();
}

startCamera.addEventListener('click', async () => {
  if (!navigator.mediaDevices?.getUserMedia) {
    status.textContent = 'Live camera access needs HTTPS or localhost and a compatible browser.';
    return;
  }
  const revision = ++cameraRevision;
  cameraPending = true;
  refresh();
  status.textContent = 'Waiting for camera permission…';
  try {
    const camera = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    if (revision !== cameraRevision) {
      camera.getTracks().forEach((track) => track.stop());
      return;
    }
    stream = camera;
    for (const track of camera.getVideoTracks()) {
      track.addEventListener('ended', () => {
        if (stream === camera) releaseCamera('The camera disconnected.');
      });
    }
    video.srcObject = camera;
    await video.play();
    if (stream !== camera) return;
    clearVerdict();
    cameraState.textContent = 'Camera live';
    status.textContent = 'Show the whole return and select Scan item.';
  } catch (error) {
    if (revision !== cameraRevision) return;
    const message = error.name === 'NotAllowedError' ? 'Allow camera access in your browser and try again.' :
      'Could not open a camera. Check that one is connected and available.';
    releaseCamera(message);
  } finally {
    cameraPending = false;
    refresh();
  }
});

stopCamera.addEventListener('click', () => releaseCamera('Camera stopped.'));
window.addEventListener('pagehide', () => releaseCamera());
video.addEventListener('loadeddata', refresh);

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

for (const [key, capture] of Object.entries(captureButtons)) {
  capture.addEventListener('click', async () => {
    if (capture.disabled) return;
    capturePending = true;
    const controller = new AbortController();
    captureController = controller;
    const camera = stream;
    refresh();
    clearVerdict();
    status.textContent = key === 'item' ? 'Scanning the live item view…' : 'Scanning the live label view…';
    const burst = [];
    try {
      for (let index = 0; index < 2; index += 1) {
        await delay(index === 0 ? 150 : 550);
        if (controller.signal.aborted || stream !== camera) return;
        if (!video.videoWidth || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
          status.textContent = 'The camera view stalled. Try scanning again.';
          return;
        }
        burst.push(encode(video, video.videoWidth, video.videoHeight));
      }
      byId(key).src = burst[0];
      byId(key).hidden = false;
      frames[key] = burst.map((data) => data.split(',')[1]);
      status.textContent = frames.item.length && frames.label.length ? 'Both views are ready. Run the live inspection.' :
        key === 'item' ? 'Item scanned. Move closer and scan the label.' : 'Label scanned. Show the whole item and scan it.';
    } finally {
      captureController = undefined;
      capturePending = false;
      refresh();
    }
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
byId('inspection-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (button.disabled) return;
  busy = true;
  refresh();
  clearVerdict();
  status.textContent = 'Comparing catalog, item and label…';
  const started = performance.now();
  const inputs = [catalogInput, skuInput];
  const controller = new AbortController();
  requestController = controller;
  for (const input of inputs) input.disabled = true;
  try {
    const catalog = encode(catalogPreview, catalogPreview.naturalWidth, catalogPreview.naturalHeight).split(',')[1];
    const response = await fetch('/api/inspect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sku: skuInput.value.trim(), catalog, ...frames, token }),
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(33000)]),
    });
    const result = await response.json();
    if (controller.signal.aborted) return;
    if (!response.ok) throw new Error(result.error);
    byId('result-catalog').src = catalogPreview.src;
    byId('result-item').src = byId('item').src;
    renderFindings(byId('findings'), result.findings);
    byId('reference').textContent = `Inspection ref ${result.reference}`;
    const seconds = ((performance.now() - started) / 1000).toFixed(1);
    byId('elapsed').textContent = `Run time ${seconds}s · Pilot target under 8s`;
    verdict.hidden = false;
    status.textContent = 'Inspection saved for merchant review.';
    verdict.focus();
  } catch (error) {
    if (controller.signal.aborted) return;
    status.textContent = error.name === 'TimeoutError' ? 'The inspection timed out. Try again.' :
      error.message || 'Could not complete the inspection.';
  } finally {
    requestController = undefined;
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
