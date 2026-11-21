const form = document.querySelector('#pilot-form');
const status = document.querySelector('#form-status');
const button = form.querySelector('button[type="submit"]');

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = new URLSearchParams(new FormData(form));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  button.disabled = true;
  status.textContent = 'Sending your request…';
  try {
    const response = await fetch(form.action, {
      method: 'POST',
      body: data,
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    const result = await response.json();
    if (response.ok && result.ok === true) {
      form.reset();
      status.textContent = result.message;
    } else {
      status.textContent = result.message ?? 'Could not send your request. Please try again.';
    }
  } catch {
    status.textContent = 'We could not confirm your request. Please try again.';
  } finally {
    clearTimeout(timeout);
    button.disabled = false;
  }
});
