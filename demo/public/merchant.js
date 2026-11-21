import { renderFindings } from './findings.js';

const list = document.querySelector('#inspections');
const status = document.querySelector('#review-status');
const refresh = document.querySelector('#refresh');
const older = document.querySelector('#older');
const formatDate = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
let next;
let loading = false;
let deciding = 0;

async function getResponse(url, options) {
  const response = await fetch(url, { ...options, redirect: 'manual', signal: AbortSignal.timeout(15000) });
  if (response.status === 401 || response.type === 'opaqueredirect') {
    throw new Error('Your review session expired. Reload to sign in.');
  }
  const result = await response.json();
  if (!response.ok && response.status !== 409) throw new Error(result.error);
  return result;
}

function syncControls() {
  refresh.disabled = loading || deciding > 0;
  older.disabled = refresh.disabled;
}

function cardFor(inspection) {
  const card = document.createElement('article');
  const title = document.createElement('h2');
  const metadata = document.createElement('p');
  const findings = document.createElement('dl');
  const label = document.createElement('p');
  const actions = document.createElement('div');

  card.className = 'panel review-card';
  title.textContent = `SKU ${inspection.sku}`;
  const buyerReference = document.createElement('p');
  buyerReference.textContent = inspection.buyer_reference ? `Buyer submission ${inspection.buyer_reference}` : '';
  buyerReference.hidden = !inspection.buyer_reference;
  metadata.textContent = `${formatDate.format(new Date(inspection.created_at))} · Ref ${inspection.reference}`;
  findings.className = 'finding-list';
  actions.className = 'review-actions';
  renderFindings(findings, inspection.findings);

  function showDecision(record) {
    label.textContent = record.status === 'pending' ? 'Awaiting merchant decision' :
      `${record.status === 'accepted' ? 'Accepted' : 'Rejected'} by ${record.decided_by} · ${formatDate.format(new Date(record.decided_at))}`;
    if (record.status !== 'pending') actions.replaceChildren();
  }

  async function decide(decision) {
    if (!window.confirm(`${decision === 'accepted' ? 'Accept' : 'Reject'} this return in the demo? This decision will be saved.`)) return;
    deciding += 1;
    syncControls();
    for (const control of actions.children) control.disabled = true;
    try {
      const params = new URLSearchParams({ decision });
      const result = await getResponse(`/review/api/inspections/${inspection.reference}?${params}`, { method: 'POST' });
      showDecision(result.inspection);
      status.textContent = result.error || 'Decision saved.';
      label.tabIndex = -1;
      label.focus();
    } catch (error) {
      status.textContent = error.message || 'Could not save the decision. Try again.';
    } finally {
      for (const control of actions.children) control.disabled = false;
      deciding -= 1;
      syncControls();
    }
  }

  for (const [decision, text] of [['accepted', 'Accept return'], ['rejected', 'Reject return']]) {
    const control = document.createElement('button');
    control.className = decision === 'accepted' ? 'button' : 'secondary';
    control.type = 'button';
    control.textContent = text;
    control.addEventListener('click', () => decide(decision));
    actions.append(control);
  }
  showDecision(inspection);
  card.append(title, buyerReference, metadata, label, findings, actions);
  return card;
}

async function load(before) {
  loading = true;
  syncControls();
  status.textContent = 'Loading inspections…';
  try {
    const query = before ? `?before=${before}` : '';
    const result = await getResponse(`/review/api/inspections${query}`);
    const cards = result.inspections.map(cardFor);
    if (before) list.append(...cards);
    else list.replaceChildren(...cards);
    next = result.next;
    older.hidden = !next;
    status.textContent = list.childElementCount ? '' : 'No buyer submissions yet.';
  } catch (error) {
    status.textContent = error.message || 'Could not load inspections.';
  } finally {
    loading = false;
    syncControls();
  }
}

refresh.addEventListener('click', () => load());
older.addEventListener('click', () => load(next));
load();
