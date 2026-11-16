const { test } = require('node:test');
const assert = require('node:assert/strict');
const { pageInfo, pageNumbers, renderPagination } = require('../public/pagination');

test('pagination handles empty lists and clamps after the last page shrinks', () => {
  assert.deepEqual(pageInfo(0, 9, 6), { page: 1, pages: 1, start: 0, end: 0, total: 0 });
  assert.deepEqual(pageInfo(13, 3, 6), { page: 3, pages: 3, start: 12, end: 13, total: 13 });
  assert.deepEqual(pageInfo(12, 3, 6), { page: 2, pages: 2, start: 6, end: 12, total: 12 });
  assert.equal(pageInfo(9, -1, 6).page, 1);
});

test('numbered navigation stays compact while exposing the first, current, and last pages', () => {
  assert.deepEqual(pageNumbers(1, 3), [1, 2, 3]);
  assert.deepEqual(pageNumbers(50, 100), [1, '…', 49, 50, 51, '…', 100]);
  assert.deepEqual(pageNumbers(1, 100), [1, 2, '…', 100]);
});

test('navigation hides for one page and labels the current page and boundaries', () => {
  const previousDocument = global.document;
  const element = tag => ({ tag, children: [], attrs: {}, append(...nodes) { this.children.push(...nodes); }, replaceChildren(...nodes) { this.children = nodes; }, setAttribute(k, v) { this.attrs[k] = v; }, addEventListener(k, fn) { this[k] = fn; } });
  global.document = { createElement: element };
  try {
    const container = element('div');
    renderPagination(container, pageInfo(6, 1, 6), 'shops', () => {});
    assert.equal(container.hidden, true);
    let chosen;
    renderPagination(container, pageInfo(18, 1, 6), 'shops', page => { chosen = page; });
    assert.equal(container.hidden, false);
    const nav = container.children.find(child => child.tag === 'nav');
    assert.equal(nav.attrs['aria-label'], 'shops pages');
    assert.equal(nav.children[0].disabled, true);
    assert.equal(nav.children[1].attrs['aria-current'], 'page');
    nav.children.at(-1).click();
    assert.equal(chosen, 2);
  } finally { global.document = previousDocument; }
});
