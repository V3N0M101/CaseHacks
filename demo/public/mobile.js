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
const token = location.hash.slice(1);
const prompts = ['Show the full item', 'Hold the SKU or care label close to the camera'];
let stream;
let cameraRevision = 0;
let item = [];
let label = [];

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
    item = [];
    label = [];
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
    if (!item.length) {
      item = [first, second];
      get('prompt').textContent = prompts[1];
      return;
    }
    label = [first, second];
    capture.hidden = true;
    const images = [item[0], label[0]].map((frame, index) => {
      const image = new Image();
      image.alt = ['Item', 'Return label'][index];
      image.src = 'data:image/jpeg;base64,' + frame;
      return image;
    });
    get('previews').replaceChildren(...images);
    confirm.hidden = false;
    submit.focus();
  } catch (error) {
    status.textContent = error.message;
  } finally {
    take.disabled = !stream || capture.hidden;
  }
});

submit.addEventListener('click', async () => {
  submit.disabled = true;
  retake.disabled = true;
  status.textContent = 'Submitting your return…';
  try {
    const response = await fetch('/api/buyer/submit', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ item, label }),
      signal: AbortSignal.timeout(35000),
    });
    const result = await response.json();
    if (!response.ok || !result.reference) throw new Error(result.error || 'The return could not be submitted.');
    stopCamera();
    item = [];
    label = [];
    get('previews').replaceChildren();
    confirm.hidden = true;
    get('receipt').textContent = 'Reference ' + result.reference;
    get('done').hidden = false;
    get('done').focus();
    status.textContent = '';
  } catch (error) {
    status.textContent = error.name === 'TimeoutError' ? 'Submission timed out. Try Submit again.' : error.message;
  } finally {
    submit.disabled = false;
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

if (/^[a-f0-9]{64}$/.test(token)) start.disabled = false;
else status.textContent = 'Open the full return link from your merchant to begin.';
