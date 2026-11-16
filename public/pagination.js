function pageInfo(total, requested, limit) {
  const pages = Math.max(1, Math.ceil(total / limit));
  const page = Math.max(1, Math.min(pages, requested));
  return { page, pages, start: total ? (page - 1) * limit : 0, end: Math.min(page * limit, total), total };
}

function pageNumbers(page, pages) {
  const numbers = [];
  const visible = new Set([1, pages, page - 1, page, page + 1]);
  for (const number of [...visible].filter(n => n >= 1 && n <= pages).sort((a, b) => a - b)) {
    const previous = numbers.at(-1);
    if (previous && number - previous === 2) numbers.push(previous + 1);
    else if (previous && number - previous > 2) numbers.push('…');
    numbers.push(number);
  }
  return numbers;
}

function renderPagination(container, info, label, onChange) {
  container.replaceChildren();
  container.hidden = info.pages <= 1;
  container.className = 'pagination';
  if (container.hidden) return;
  const summary = document.createElement('p');
  summary.className = 'pagination-summary';
  summary.setAttribute('role', 'status');
  summary.textContent = `${info.start + 1}–${info.end} of ${info.total} ${label} · Page ${info.page} of ${info.pages}`;
  const nav = document.createElement('nav');
  nav.setAttribute('aria-label', `${label} pages`);
  function button(text, target, disabled = false) {
    const control = document.createElement('button');
    control.type = 'button'; control.className = 'secondary';
    control.textContent = text; control.disabled = disabled;
    control.setAttribute('aria-label', /^\d+$/.test(text) ? `Page ${target}` : `${text} page`);
    if (target === info.page) control.setAttribute('aria-current', 'page');
    control.addEventListener('click', () => onChange(target));
    return control;
  }
  nav.append(button('Previous', info.page - 1, info.page === 1));
  for (const number of pageNumbers(info.page, info.pages)) {
    if (typeof number === 'number') nav.append(button(String(number), number));
    else {
      const gap = document.createElement('span');
      gap.textContent = number; gap.setAttribute('aria-hidden', 'true'); nav.append(gap);
    }
  }
  nav.append(button('Next', info.page + 1, info.page === info.pages));
  container.append(summary, nav);
}

// Keep focus near the updated list after navigation replaces its controls.
function focusPagination(container) {
  container?.querySelector('[aria-current="page"]')?.focus({ preventScroll: true });
}

if (typeof module !== 'undefined') module.exports = { pageInfo, pageNumbers, renderPagination };
