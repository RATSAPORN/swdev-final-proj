// Shared by the browser and the focused search regression tests.
function filterShops(shops, search = '', style = '') {
  const term = search.trim().toLowerCase();
  return shops.filter(shop => {
    const tags = Array.isArray(shop.tags) ? shop.tags : [];
    const searchable = [shop.name, shop.address, shop.neighborhood, ...tags].filter(Boolean).join(' ').toLowerCase();
    return searchable.includes(term) && (!style || tags.includes(style));
  });
}
if (typeof module !== 'undefined') module.exports = { filterShops };
