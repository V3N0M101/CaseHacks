const form = document.querySelector('#buyer-link-form');
const status = document.querySelector('#buyer-link-status');
const resultPanel = document.querySelector('#buyer-link-result');
const output = document.querySelector('#buyer-link-value');
const open = document.querySelector('#open-buyer-link');
const submit = form.querySelector('button[type="submit"]');
const reference = document.querySelector('#demo-reference');

reference.value = 'demo-' + crypto.randomUUID().slice(0, 12);

async function encodeCatalog(file) {
  if (!file?.size || file.size > 20_000_000) throw new Error('Choose a catalog photo under 20 MB.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = Math.min(1, 960 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [.78, .6, .4]) {
      const encoded = canvas.toDataURL('image/jpeg', quality).split(',')[1];
      if (encoded && encoded.length <= 500_000) return encoded;
    }
    throw new Error('Choose a smaller catalog photo.');
  } finally {
    URL.revokeObjectURL(url);
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (submit.disabled) return;
  const fields = new FormData(form);
  submit.disabled = true;
  resultPanel.hidden = true;
  status.textContent = 'Creating the buyer link…';
  try {
    const catalog = await encodeCatalog(fields.get('catalog'));
    const response = await fetch('/review/api/buyer-links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        buyerReference: fields.get('buyerReference').trim(),
        sku: fields.get('sku').trim(),
        catalog,
      }),
      redirect: 'manual',
      signal: AbortSignal.timeout(15000),
    });
    if (response.status === 401 || response.type === 'opaqueredirect') {
      throw new Error('Your merchant session expired. Reload to sign in.');
    }
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not create the buyer link.');
    output.value = result.url;
    open.href = result.url;
    resultPanel.hidden = false;
    status.textContent = 'Buyer link created. It expires in 30 minutes.';
  } catch (error) {
    status.textContent = error.message || 'Could not create the buyer link.';
  } finally {
    submit.disabled = false;
  }
});

document.querySelector('#copy-buyer-link').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(output.value);
    status.textContent = 'Buyer link copied.';
  } catch {
    output.focus();
    output.select();
    status.textContent = 'Copy the selected link to share it.';
  }
});
