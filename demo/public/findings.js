const checkNames = {
  item: 'Item identity',
  sku: 'Tag / SKU',
  parts: 'Included parts',
  packaging: 'Packaging',
  visible_wear: 'Visible wear',
};

export function renderFindings(list, findings) {
  const rows = findings.map(({ check, status, confidence, reason }) => {
    const row = document.createElement('div');
    const title = document.createElement('dt');
    const description = document.createElement('dd');
    const label = status === 'flag' ? 'Flagged' : status === 'unclear' ? 'Unclear' :
      check === 'visible_wear' ? 'No clear signs' : 'Consistent';
    const review = status !== 'matches' || confidence === 'low';
    title.textContent = `${checkNames[check]} · ${label} · ${confidence} confidence${review ? ' · Review required' : ''}`;
    description.textContent = reason;
    row.append(title, description);
    return row;
  });
  list.replaceChildren(...rows);
}
