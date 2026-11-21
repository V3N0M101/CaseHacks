const get = (id) => document.getElementById(id);
const start = get('start');
const status = get('status');
const camera = get('camera');
const preview = get('live-preview');
const capture = get('capture');
const take = get('take');
const confirm = get('confirm');
const submit = get('submit');
const retake = get('retake');
const retryAnalysis = get('retry-analysis');
const analysisStatus = get('analysis-status');
const token = location.hash.slice(1);
const prompts = ['Show the full item', 'Hold the SKU or care label close to the camera'];
let stream;
let cameraRevision = 0;
let stages = {};
let submitting = false;
let skipAnalysis = false;

function renderAnalysis() {
  const views = Object.entries(stages);
  analysisStatus.hidden = !views.length;
  analysisStatus.textContent = views.map(([stage, result]) => {
    const name = stage === 'item' ? 'Item' : 'Label';
    if (skipAnalysis) return `${name} captured.`;
    if (result.error) return `${name}: ${result.error}`;
    return result.id ? `${name} analyzed.` : `Analyzing ${stage}…`;
  }).join(' ');
  retryAnalysis.hidden = !views.some(([, result]) => result.error);
  submit.disabled = submitting || !stages.item?.id || !stages.label?.id;
}

function clearAnalysis() {
  for (const result of Object.values(stages)) result.controller.abort();
  stages = {};
  renderAnalysis();
}

async function buyerRequest(operation, data, signal) {
  const response = await fetch(`/api/buyer/${operation}`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    signal,
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'The request could not be completed.');
  return result;
}

async function analyze(stage, frames) {
  const controller = new AbortController();
  const view = { controller, frames };
  stages[stage] = view;
  if (skipAnalysis) view.id = stage;
  renderAnalysis();
  if (skipAnalysis) return;
  try {
    const result = await buyerRequest('analyze', { stage, frames },
      AbortSignal.any([controller.signal, AbortSignal.timeout(32000)]));
    if (!result.analysisId) throw new Error('Analysis did not return a result.');
    view.id = result.analysisId;
  } catch (error) {
    if (controller.signal.aborted) return;
    view.error = error.name === 'TimeoutError' ? 'Analysis timed out. Try again.' : error.message;
  } finally {
    if (stages[stage] === view) renderAnalysis();
  }
}

function stopCamera() {
  cameraRevision += 1;
  stream?.getTracks().forEach(track => track.stop());
  stream = undefined;
  camera.srcObject = null;
  preview.hidden = true;
  take.disabled = true;
}

async function startCamera() {
  const revision = ++cameraRevision;
  start.disabled = true;
  retake.disabled = true;
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access needs HTTPS and a compatible browser.');
    if (!stream?.active) {
      const current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      if (revision !== cameraRevision) {
        current.getTracks().forEach(track => track.stop());
        return;
      }
      stream = current;
      camera.srcObject = current;
    }
    preview.hidden = false;
    await camera.play();
    if (revision !== cameraRevision) return;
    clearAnalysis();
    get('previews').replaceChildren();
    get('prompt').textContent = prompts[0];
    confirm.hidden = true;
    capture.hidden = false;
    start.hidden = true;
    status.textContent = '';
    take.disabled = false;
  } catch (error) {
    if (revision !== cameraRevision) return;
    stopCamera();
    capture.hidden = true;
    start.hidden = !confirm.hidden;
    status.textContent = error.name === 'NotAllowedError' ? 'Allow camera access and try again.' : error.message;
  } finally {
    start.disabled = false;
    retake.disabled = false;
  }
}

function snapshot() {
  if (!camera.videoWidth || camera.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) throw new Error('Wait for the camera image and try again.');
  const scale = Math.min(1, 960 / Math.max(camera.videoWidth, camera.videoHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(camera.videoWidth * scale);
  canvas.height = Math.round(camera.videoHeight * scale);
  canvas.getContext('2d').drawImage(camera, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', .76).split(',')[1];
}

take.addEventListener('click', async () => {
  status.textContent = '';
  take.disabled = true;
  const current = stream;
  try {
    const first = snapshot();
    await new Promise(resolve => setTimeout(resolve, 450));
    if (current !== stream) return;
    const second = snapshot();
    if (!stages.item) {
      void analyze('item', [first, second]);
      get('prompt').textContent = prompts[1];
      return;
    }
    void analyze('label', [first, second]);
    capture.hidden = true;
    const images = [stages.item.frames[0], first].map((frame, index) => {
      const image = new Image();
      image.alt = ['Item', 'Return label'][index];
      image.src = 'data:image/jpeg;base64,' + frame;
      return image;
    });
    get('previews').replaceChildren(...images);
    confirm.hidden = false;
    get('confirm-heading').focus();
  } catch (error) {
    status.textContent = error.message;
  } finally {
    take.disabled = !stream || capture.hidden;
  }
});

retryAnalysis.addEventListener('click', () => {
  for (const [stage, result] of Object.entries(stages)) {
    if (result.error) void analyze(stage, result.frames);
  }
});

submit.addEventListener('click', async () => {
  if (submit.disabled) return;
  submitting = true;
  renderAnalysis();
  retake.disabled = true;
  status.textContent = 'Sending findings to the merchant…';
  try {
    const details = skipAnalysis ? {} : {
      itemAnalysisId: stages.item.id,
      labelAnalysisId: stages.label.id,
    };
    const result = await buyerRequest('complete', details, AbortSignal.timeout(15000));
    if (!result.reference) throw new Error('The return could not be submitted.');
    stopCamera();
    clearAnalysis();
    get('previews').replaceChildren();
    confirm.hidden = true;
    get('receipt').textContent = 'Reference ' + result.reference;
    get('done').hidden = false;
    get('done').focus();
    status.textContent = '';
  } catch (error) {
    status.textContent = error.name === 'TimeoutError' ? 'Submission timed out. Try Submit again.' : error.message;
  } finally {
    submitting = false;
    renderAnalysis();
    retake.disabled = false;
  }
});

start.addEventListener('click', startCamera);
retake.addEventListener('click', startCamera);
get('stop').addEventListener('click', () => {
  stopCamera();
  capture.hidden = true;
  start.hidden = !confirm.hidden;
  status.textContent = 'Camera stopped.';
});
window.addEventListener('pagehide', () => {
  stopCamera();
  capture.hidden = true;
  start.hidden = !confirm.hidden || !get('done').hidden;
});

async function loadSession() {
  if (!/^[a-f0-9]{64}$/.test(token)) {
    status.textContent = 'Open the full return link from your merchant to begin.';
    return;
  }
  status.textContent = 'Checking your buyer link…';
  try {
    const session = await buyerRequest('session', {}, AbortSignal.timeout(10000));
    skipAnalysis = session.skipAnalysis === true;
    get('analysis-description').textContent = skipAnalysis ?
      'Demo mode. You can try the camera and submission steps. This link skips AI analysis and does not upload your images.' :
      'ReturnProof analyzes sampled frames from the live camera as you show each view. The merchant makes the refund decision.';
    status.textContent = '';
    start.disabled = false;
  } catch (error) {
    status.textContent = error.message || 'Could not load the buyer link. Refresh to try again.';
  }
}

void loadSession();
