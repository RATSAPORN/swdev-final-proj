const $ = selector => document.querySelector(selector);
const state = { user: null, shops: [], reservations: [], editing: null, deleting: null, register: false };
const today = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
$('#booking-form').elements.apptDate.min = today();

function notice(message, error = false) {
  $('#notice').textContent = message;
  $('#notice').dataset.error = String(error);
  $('#notice').hidden = !message;
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
  button.disabled = true; form.setAttribute('aria-busy', 'true'); $(errorSelector).textContent = '';
  try { await task(); } catch (error) { $(errorSelector).textContent = error.message; }
  finally { button.disabled = false; form.removeAttribute('aria-busy'); updateQuota(); }
}
function renderAccount() {
  const loggedIn = !!state.user;
  $('#account').hidden = loggedIn;
  $('#logout').hidden = !loggedIn;
  $('#login-link').hidden = loggedIn;
  $('#account-name').textContent = loggedIn ? `${state.user.name}${state.user.role === 'admin' ? ' · Admin' : ''}` : 'Guest';
  $('#admin-panel').hidden = state.user?.role !== 'admin';
  $('#reservation-heading').textContent = state.user?.role === 'admin' ? 'All reservations' : 'Your reservations';
  $('#reservation-description').textContent = state.user?.role === 'admin' ? 'View, edit, or delete a reservation for any user.' : 'Your plans, with space to change them.';
  updateQuota();
}
function updateQuota() {
  const count = state.reservations.filter(r => (r.user?._id || r.user) === state.user?._id).length;
  $('#quota').textContent = state.user ? `${count} of 3 reservation places used. Deleting a reservation frees a place.` : 'Log in to make a reservation.';
  $('#booking-submit').disabled = !!state.user && !state.editing && count >= 3;
}
function renderShops() {
  const search = $('#shop-search').value.toLowerCase();
  const list = $('#shop-list'); list.replaceChildren();
  const shops = state.shops.filter(s => `${s.name} ${s.address}`.toLowerCase().includes(search));
  if (!shops.length) list.append(node('p', state.shops.length ? 'No shops match your search.' : 'No shops available yet. An administrator can add one below.', 'empty'));
  for (const shop of shops) {
    const row = node('article', '', 'shop-row');
    const info = node('div'); info.append(node('h3', shop.name), node('p', shop.address));
    const contact = node('div', '', 'shop-contact');
    const telephone = node('a', shop.tel); telephone.href = `tel:${shop.tel.replace(/[^+\d]/g, '')}`;
    contact.append(node('span', `${shop.openTime}–${shop.closeTime}`), telephone); info.append(contact);
    row.append(info, action('Choose shop', () => {
      resetBooking(); $('#booking-shop').value = shop._id;
      $('#booking-description').textContent = `${shop.name} · ${shop.openTime}–${shop.closeTime}`;
      $('#booking').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      $('#booking-form').elements.apptDate.focus();
    }));
    list.append(row);
  }
}
async function loadShops() {
  const result = await api('/shops'); state.shops = result.data;
  const select = $('#booking-shop'); const selected = select.value;
  select.replaceChildren(new Option('Choose a shop', ''));
  state.shops.forEach(s => select.add(new Option(s.name, s._id)));
  select.value = selected; renderShops();
}
function renderReservations() {
  const list = $('#reservation-list'); list.replaceChildren();
  if (!state.user || !state.reservations.length) {
    list.append(node('p', !state.user ? 'Log in to see your reservations.' : 'No reservations yet. Choose a shop and a date to make your first booking.', 'empty'));
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
  $('#booking-heading').textContent = 'Your next pause'; $('#booking-description').textContent = 'Choose a shop from the list to get started.';
  $('#booking-submit').textContent = 'Reserve a massage'; $('#cancel-edit').hidden = true; updateQuota();
}
function editReservation(reservation) {
  state.editing = reservation._id;
  $('#booking-shop').value = reservation.shop?._id || '';
  $('#booking-form').elements.apptDate.value = reservation.apptDate;
  $('#booking-heading').textContent = 'Edit reservation'; $('#booking-description').textContent = 'Choose a different shop or date, then save your changes.';
  $('#booking-submit').textContent = 'Save changes'; $('#cancel-edit').hidden = false; $('#booking-error').textContent = '';
  updateQuota(); $('#booking').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); $('#booking-shop').focus();
}
$('#auth-switch').addEventListener('click', () => {
  state.register = !state.register;
  document.querySelectorAll('.register-field').forEach(label => { label.hidden = !state.register; label.querySelector('input').disabled = !state.register; label.querySelector('input').required = state.register; });
  $('#account-heading').textContent = state.register ? 'Make yourself at home' : 'Welcome back';
  $('#auth-description').textContent = state.register ? 'Create an account to reserve your next massage.' : 'Log in to book and manage your reservations.';
  $('#auth-submit').textContent = state.register ? 'Create account' : 'Log in';
  $('#auth-switch').textContent = state.register ? 'Already registered? Log in' : 'New here? Create an account';
  $('#auth-form').elements.password.autocomplete = state.register ? 'new-password' : 'current-password';
  $('#auth-error').textContent = '';
});
$('#auth-form').addEventListener('submit', event => {
  event.preventDefault(); submitting(event.target, '#auth-error', async () => {
    await api(`/auth/${state.register ? 'register' : 'login'}`, 'POST', Object.fromEntries(new FormData(event.target)));
    state.user = (await api('/auth/me')).data; event.target.reset(); renderAccount(); await loadReservations(); notice(`Welcome, ${state.user.name}. You’re ready to reserve.`);
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
  if (!state.user) { notice('Log in or create an account to reserve a massage.', true); $('#auth-form').elements.email.focus(); return; }
  submitting(event.target, '#booking-error', async () => {
    const editing = state.editing;
    await api(editing ? `/reservations/${editing}` : '/reservations', editing ? 'PUT' : 'POST', Object.fromEntries(new FormData(event.target)));
    resetBooking(); await loadReservations(); notice(editing ? 'Reservation updated.' : 'Your massage is reserved.');
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
  try { await loadShops(); } catch (error) { $('#shop-list').replaceChildren(node('p', `${error.message}. Use Refresh shops to try again.`, 'error')); }
  try { await loadReservations(); } catch (error) { notice(error.message, true); }
}
initialize();
