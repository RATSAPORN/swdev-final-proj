const $ = selector => document.querySelector(selector);
const state = { user: null, shops: [], reservations: [], editing: null, deleting: null, register: false, style: '' };
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const today = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
$('#booking-form').elements.apptDate.min = today();

function notice(message, error = false, celebrate = false) {
  const area = $('#notice');
  area.replaceChildren(icon(error ? 'alert' : 'check'), node('span', message));
  area.dataset.error = String(error);
  area.dataset.celebrate = String(celebrate);
  area.hidden = !message;
}
function icon(name) {
  const paths = {
    check: 'M5 12l4 4L19 6',
    clock: 'M12 8v4l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
    phone: 'M8 3H5a2 2 0 0 0-2 2c0 9 7 16 16 16a2 2 0 0 0 2-2v-3l-5-2-2 2a13 13 0 0 1-6-6l2-2-2-5Z',
    pin: 'M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0ZM15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
    arrow: 'M5 12h14m-6-6 6 6-6 6',
    alert: 'M12 8v5m0 3v.1M10 4 2 18a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1L14 4a2 2 0 0 0-4 0Z',
  };
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(svg.namespaceURI, 'path');
  path.setAttribute('d', paths[name]);
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '1.6');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  svg.append(path);
  return svg;
}
function revealBooking() {
  $('#booking').scrollIntoView({ behavior: reducedMotion.matches ? 'instant' : 'smooth', block: 'nearest' });
  $('#booking-form').elements.apptDate.focus({ preventScroll: true });
}
async function api(path, method = 'GET', body) {
  const response = await fetch(`/api/v1${path}`, {
    method, credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401 && state.user) {
      state.user = null; state.reservations = []; resetBooking(); renderAccount(); renderReservations();
    }
    throw new Error(result.message || 'Unable to complete the request. Please try again.');
  }
  return result;
}
function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text) element.textContent = text;
  if (className) element.className = className;
  return element;
}
function action(text, handler, className = 'secondary') {
  const button = node('button', text, className);
  button.type = 'button'; button.addEventListener('click', handler);
  return button;
}
async function submitting(form, errorSelector, task) {
  const button = form.querySelector('[type="submit"]');
  const label = button.textContent;
  button.textContent = 'Just a moment…';
  button.disabled = true; form.setAttribute('aria-busy', 'true'); $(errorSelector).textContent = '';
  try { await task(); } catch (error) { $(errorSelector).textContent = error.message; }
  finally {
    button.textContent = form.id === 'booking-form' ? (state.editing ? 'Save changes' : 'Reserve a massage') : label;
    button.disabled = false; form.removeAttribute('aria-busy'); updateQuota();
  }
}
function renderAccount() {
  const loggedIn = !!state.user;
  $('#account').hidden = loggedIn;
  $('#logout').hidden = !loggedIn;
  $('#login-link').hidden = loggedIn;
  $('#account-name').textContent = loggedIn ? `${state.user.name}${state.user.role === 'admin' ? ' · Admin' : ''}` : 'Welcome in';
  $('#admin-panel').hidden = state.user?.role !== 'admin';
  $('#reservation-heading').textContent = state.user?.role === 'admin' ? 'All reservations' : 'Good moments, coming up.';
  $('#reservation-description').textContent = state.user?.role === 'admin' ? 'View, edit, or delete a reservation for any user.' : 'Your reservations, with room for a change of plans.';
  updateQuota();
}
function updateQuota() {
  const count = state.reservations.filter(r => (r.user?._id || r.user) === state.user?._id).length;
  $('#quota').textContent = !state.user ? 'Choose your shop and day. Log in when you’re ready to reserve.' : count >= 3 ? 'Your three places are filled. Delete a reservation to make room for a new one.' : `${3 - count} of 3 reservation places left. A little more time for you.`;
  $('#booking-submit').disabled = !!state.user && !state.editing && count >= 3;
}
function renderShops() {
  const list = $('#shop-list'); list.replaceChildren();
  const shops = filterShops(state.shops, $('#shop-search').value, state.style);
  $('#shop-count').textContent = `${shops.length} ${shops.length === 1 ? 'place' : 'places'} to unwind${state.style ? ` · ${state.style}` : ''}`;
  if (!shops.length) {
    const empty = node('div', '', 'empty');
    empty.append(node('h3', state.shops.length ? 'A fresh search, a new possibility.' : 'A little quiet here, for now.'), node('p', state.shops.length ? 'Try a different neighborhood, shop name, or massage style.' : 'Our shop list is empty. Check back soon, or refresh to try again.'));
    if (state.shops.length) empty.append(action('Show all shops', () => { state.style = ''; $('#shop-search').value = ''; renderFilters(); renderShops(); $('#shop-search').focus(); }));
    list.append(empty);
  }
  for (const shop of shops) {
    const row = node('article', '', 'shop-row');
    const selected = $('#booking-shop').value === shop._id;
    row.dataset.selected = String(selected);
    const info = node('div', '', 'shop-info');
    const title = node('div', '', 'shop-title');
    title.append(node('h3', shop.name));
    if (shop.neighborhood) title.append(node('span', shop.neighborhood, 'neighborhood'));
    info.append(title);
    if (shop.description) info.append(node('p', shop.description, 'shop-description'));
    if (Array.isArray(shop.tags) && shop.tags.length) {
      const tags = node('ul', '', 'shop-tags');
      shop.tags.forEach(tag => tags.append(node('li', tag)));
      info.append(tags);
    }
    const address = node('p', '', 'shop-address'); address.append(icon('pin'), node('span', shop.address)); info.append(address);
    const contact = node('div', '', 'shop-contact');
    const telephone = node('a'); telephone.append(icon('phone'), node('span', shop.tel || 'Contact shop'));
    if (shop.tel) telephone.href = `tel:${shop.tel.replace(/[^+\d]/g, '')}`;
    const hours = node('span'); hours.append(icon('clock'), node('span', `${shop.openTime}–${shop.closeTime}`));
    contact.append(hours, telephone); info.append(contact);
    const choose = action(selected ? 'Selected' : 'Choose this shop', () => {
      $('#booking-shop').value = shop._id;
      syncSelectedShop(); renderShops(); revealBooking();
    }, selected ? 'shop-choose is-selected' : 'shop-choose');
    choose.append(icon(selected ? 'check' : 'arrow'));
    choose.setAttribute('aria-label', `${selected ? 'Selected' : 'Choose this shop'}: ${shop.name}`);
    choose.setAttribute('aria-pressed', String(selected));
    row.append(info, choose);
    list.append(row);
  }
}
function renderFilters() {
  const filters = $('#shop-filters'); filters.replaceChildren();
  const styles = [...new Set(state.shops.flatMap(shop => Array.isArray(shop.tags) ? shop.tags : []))];
  for (const style of ['', ...styles]) {
    const button = action(style || 'All shops', () => {
      state.style = style;
      filters.querySelectorAll('button').forEach(filter => filter.setAttribute('aria-pressed', String(filter.dataset.style === style)));
      renderShops();
    }, 'filter-button');
    button.dataset.style = style;
    button.setAttribute('aria-pressed', String(style === state.style));
    filters.append(button);
  }
}
function syncSelectedShop() {
  const shop = state.shops.find(shop => shop._id === $('#booking-shop').value);
  $('#selected-shop').hidden = !shop;
  $('#selected-shop-name').textContent = shop?.name || '';
  $('#selected-shop-details').textContent = shop ? `${shop.neighborhood ? `${shop.neighborhood} · ` : ''}${shop.openTime}–${shop.closeTime}` : '';
}
async function loadShops() {
  $('#shop-list').setAttribute('aria-busy', 'true');
  try {
    const result = await api('/shops'); state.shops = result.data;
    const select = $('#booking-shop'); const selected = select.value;
    select.replaceChildren(new Option('Choose somewhere lovely', ''));
    state.shops.forEach(s => select.add(new Option(s.name, s._id)));
    select.value = selected; renderFilters(); renderShops(); syncSelectedShop();
  } finally { $('#shop-list').setAttribute('aria-busy', 'false'); }
}
function renderReservations() {
  const list = $('#reservation-list'); list.replaceChildren();
  if (!state.user || !state.reservations.length) {
    const empty = node('div', '', 'empty reservation-empty');
    const copy = node('div');
    copy.append(node('h3', !state.user ? 'Your next pause belongs here.' : 'Something good to look forward to.'), node('p', !state.user ? 'Log in to keep your massage plans together. You can browse the shops while you’re here.' : 'Choose a shop and a day, and we’ll keep your reservation right here.'));
    const link = node('a', !state.user ? 'Log in to see my plans' : 'Explore massage shops', 'button-link secondary-link');
    link.href = !state.user ? '#account' : '#shops';
    empty.append(copy, link); list.append(empty);
  }
  for (const reservation of state.reservations) {
    const row = node('article', '', 'reservation-row');
    const date = new Date(`${reservation.apptDate}T12:00:00+07:00`);
    row.append(node('div', date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Bangkok' }), 'reservation-date'));
    const info = node('div'); info.append(node('h3', reservation.shop?.name || 'Shop unavailable'));
    if (reservation.shop) info.append(node('p', reservation.shop.address), node('p', `${reservation.shop.openTime}–${reservation.shop.closeTime} · ${reservation.shop.tel}`));
    if (state.user.role === 'admin') info.append(node('p', `Guest: ${reservation.user?.name || 'Deleted user'} · ${reservation.user?.email || ''} · ${reservation.user?.tel || ''}`));
    const actions = node('div', '', 'row-actions');
    actions.append(action('Edit', () => editReservation(reservation)), action('Delete', () => {
      state.deleting = reservation._id; $('#delete-error').textContent = ''; $('#delete-dialog').showModal(); $('#keep-reservation').focus();
    }));
    row.append(info, actions); list.append(row);
  }
  updateQuota();
}
async function loadReservations() {
  if (!state.user) { state.reservations = []; renderReservations(); return; }
  const result = await api('/reservations'); state.reservations = result.data; renderReservations();
}
function resetBooking() {
  state.editing = null; $('#booking-form').reset(); $('#booking-error').textContent = '';
  $('#booking-heading').textContent = 'Make it a date.'; $('#booking-description').textContent = 'A little time for you, in just two choices.';
  $('#booking-submit').textContent = 'Reserve a massage'; $('#cancel-edit').hidden = true; updateQuota();
  syncSelectedShop(); renderShops();
}
function editReservation(reservation) {
  state.editing = reservation._id;
  $('#booking-shop').value = reservation.shop?._id || '';
  $('#booking-form').elements.apptDate.value = reservation.apptDate;
  $('#booking-heading').textContent = 'Edit reservation'; $('#booking-description').textContent = 'Choose a different shop or date, then save your changes.';
  $('#booking-submit').textContent = 'Save changes'; $('#cancel-edit').hidden = false; $('#booking-error').textContent = '';
  updateQuota(); syncSelectedShop(); renderShops();
  $('#booking').scrollIntoView({ behavior: reducedMotion.matches ? 'instant' : 'smooth', block: 'nearest' }); $('#booking-shop').focus({ preventScroll: true });
}
$('#auth-switch').addEventListener('click', () => {
  state.register = !state.register;
  document.querySelectorAll('.register-field').forEach(label => { label.hidden = !state.register; label.querySelector('input').disabled = !state.register; label.querySelector('input').required = state.register; });
  $('#account-heading').textContent = state.register ? 'Your time starts here.' : 'A warm welcome back.';
  $('#auth-description').textContent = state.register ? 'A few details, then a little time for yourself.' : 'Log in to save your next moment of calm.';
  $('#auth-submit').textContent = state.register ? 'Create account' : 'Log in';
  $('#auth-switch').textContent = state.register ? 'Already registered? Log in' : 'New here? Create an account';
  $('#auth-form').elements.password.autocomplete = state.register ? 'new-password' : 'current-password';
  $('#auth-error').textContent = '';
});
$('#auth-form').addEventListener('submit', event => {
  event.preventDefault(); submitting(event.target, '#auth-error', async () => {
    await api(`/auth/${state.register ? 'register' : 'login'}`, 'POST', Object.fromEntries(new FormData(event.target)));
    state.user = (await api('/auth/me')).data; event.target.reset(); renderAccount(); await loadReservations(); notice(`Welcome, ${state.user.name}. You’re ready to reserve.`);
    if ($('#booking-shop').value) revealBooking();
  });
});
$('#logout').addEventListener('click', async () => {
  $('#logout').disabled = true;
  try { await api('/auth/logout', 'POST', {}); state.user = null; state.reservations = []; resetBooking(); renderAccount(); renderReservations(); notice('You have been logged out.'); }
  catch (error) { notice(error.message, true); }
  finally { $('#logout').disabled = false; }
});
$('#booking-form').addEventListener('submit', event => {
  event.preventDefault();
    if (!state.user) { notice('Your choices are saved on this page. Log in or create an account to finish your reservation.'); $('#auth-form').elements.email.focus(); return; }
  submitting(event.target, '#booking-error', async () => {
    const editing = state.editing;
    await api(editing ? `/reservations/${editing}` : '/reservations', editing ? 'PUT' : 'POST', Object.fromEntries(new FormData(event.target)));
    resetBooking(); await loadReservations(); notice(editing ? 'All set. Your reservation has been updated.' : 'A little time for you, officially reserved. Find your booking below.', false, !editing);
    $('#notice').scrollIntoView({ behavior: reducedMotion.matches ? 'instant' : 'smooth', block: 'nearest' });
  });
});
$('#cancel-edit').addEventListener('click', resetBooking);
$('#keep-reservation').addEventListener('click', () => $('#delete-dialog').close());
$('#confirm-delete').addEventListener('click', async () => {
  $('#confirm-delete').disabled = true;
  try {
    await api(`/reservations/${state.deleting}`, 'DELETE');
    if (state.editing === state.deleting) resetBooking();
    $('#delete-dialog').close(); await loadReservations(); notice('Reservation deleted. You have room to book again.');
  } catch (error) { $('#delete-error').textContent = error.message; }
  finally { $('#confirm-delete').disabled = false; }
});
$('#shop-search').addEventListener('input', renderShops);
$('#booking-shop').addEventListener('change', () => { syncSelectedShop(); renderShops(); });
$('#refresh-shops').addEventListener('click', async () => { try { await loadShops(); notice('Shop list refreshed.'); } catch (error) { notice(error.message, true); } });
$('#refresh-reservations').addEventListener('click', async () => { try { await loadReservations(); notice(state.user ? 'Reservations refreshed.' : 'Log in to see your reservations.'); } catch (error) { notice(error.message, true); } });
$('#shop-form').addEventListener('submit', event => {
  event.preventDefault(); submitting(event.target, '#shop-error', async () => {
    await api('/shops', 'POST', Object.fromEntries(new FormData(event.target))); event.target.reset(); await loadShops(); notice('Massage shop added.');
  });
});
async function initialize() {
  try { state.user = (await api('/auth/me')).data; } catch (error) { if (!/log in|session/i.test(error.message)) notice(error.message, true); }
  renderAccount();
  try { await loadShops(); } catch (error) { $('#shop-count').textContent = 'The shop list couldn’t load.'; $('#shop-list').replaceChildren(node('p', `${error.message}. Use Refresh shops to try again.`, 'error')); }
  try { await loadReservations(); } catch (error) { notice(error.message, true); }
}
initialize();
