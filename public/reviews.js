// Shares the existing same-origin API and DOM helpers from app.js; loaded before it.
const reviewUI = (() => {
  let reviewing = null;
  let moderation = null;
  let request = 0;
  let adminRequest = 0;
  let adminPage = 1;
  let handledLink = '';
  const ratingText = (average, count) => count ? `${Number(average).toFixed(1)} / 5 · ${count} ${count === 1 ? 'review' : 'reviews'}` : 'No reviews yet';
  function openReview(reservation) {
    reviewing = reservation._id;
    $('#review-form').reset();
    $('#review-error').textContent = '';
    $('#review-visit').textContent = `${reservation.shop?.name || 'Massage shop'} · ${formatDay(reservation.apptDate)} · ${reservation.startTime}`;
    $('#review-dialog').showModal();
    $('#review-form').elements.rating.focus();
  }
  function reservationAction(r, actions) {
    if (r.reviewSubmitted) actions.append(node('span', 'Reviewed', 'review-state'));
    else if (r.canReview) actions.append(action('Leave a review', () => openReview(r)));
  }
  function reviewArticle(review) {
    const article = node('article', '', 'review-entry');
    const heading = node('div', '', 'review-meta');
    heading.append(node('strong', `${review.rating} / 5`), node('span', review.author.name));
    const time = node('time', new Date(review.createdAt).toLocaleDateString('en-GB', { timeZone: 'Asia/Bangkok' }));
    time.dateTime = review.createdAt;
    heading.append(time);
    article.append(heading, node('p', review.comment, 'review-comment'));
    return article;
  }
  async function loadShop(shopId, page = 1) {
    const current = ++request;
    const list = $('#shop-reviews');
    list.setAttribute('aria-busy', 'true');
    list.replaceChildren(node('p', 'Loading reviews…', 'hint'));
    $('#shop-rating-summary').textContent = '';
    $('#shop-review-pagination').replaceChildren();
    try {
      const result = await api(`/shops/${encodeURIComponent(shopId)}/reviews?page=${page}`);
      if (current !== request || state.detailShop !== shopId) return;
      $('#shop-rating-summary').textContent = ratingText(result.averageRating, result.total);
      list.replaceChildren(...result.data.map(reviewArticle));
      if (!result.total) list.append(node('p', 'Be the first to share your experience after your visit.', 'hint'));
      const pagination = $('#shop-review-pagination');
      if (page > 1) pagination.append(action('Previous reviews', () => loadShop(shopId, page - 1)));
      if (page * result.limit < result.total) pagination.append(action('More reviews', () => loadShop(shopId, page + 1)));
    } catch (error) {
      if (current !== request) return;
      list.replaceChildren(node('p', error.message, 'error'), action('Retry reviews', () => loadShop(shopId, page)));
    } finally { if (current === request) list.removeAttribute('aria-busy'); }
  }
  async function refreshPublic() {
    await loadShops();
    if ($('#shop-dialog').open && state.detailShop) await loadShop(state.detailShop);
  }
  function openModeration(review, kind) {
    moderation = { review, kind };
    $('#moderation-form').reset();
    $('#moderation-error').textContent = '';
    const deleting = kind === 'delete';
    $('#moderation-heading').textContent = deleting ? 'Delete this review?' : kind === 'hide' ? 'Hide this review?' : 'Restore this review?';
    $('#moderation-description').textContent = deleting ? 'This permanently removes the review text. The guest cannot repost a review for this reservation.' : 'Provide a reason for this moderation decision.';
    $('#moderation-reason-label').hidden = deleting;
    $('#moderation-form').elements.reason.required = !deleting;
    $('#moderation-confirm').textContent = deleting ? 'Delete review' : kind === 'hide' ? 'Hide review' : 'Restore review';
    $('#moderation-confirm').className = deleting ? 'danger' : '';
    $('#moderation-dialog').showModal();
    (deleting ? $('#moderation-cancel') : $('#moderation-form').elements.reason).focus();
  }
  async function loadModeration(page = 1) {
    const current = ++adminRequest;
    const container = $('#review-moderation');
    container.setAttribute('aria-busy', 'true');
    container.replaceChildren(node('p', 'Loading reviews…'));
    try {
      const result = await api(`/reviews?page=${page}`);
      if (current !== adminRequest || state.user?.role !== 'admin') return;
      adminPage = page;
      container.replaceChildren();
      if (!result.data.length) container.append(node('p', 'No reviews on this page.', 'hint'));
      for (const review of result.data) {
        const article = reviewArticle(review);
        article.prepend(node('h3', review.shop?.name || 'Former shop'));
        article.append(node('p', review.hidden ? `Hidden · ${review.moderationReason}` : 'Visible to guests', 'review-state'));
        const actions = node('div', '', 'dialog-actions');
        actions.append(action(review.hidden ? 'Restore' : 'Hide', () => openModeration(review, review.hidden ? 'restore' : 'hide')), action('Delete', () => openModeration(review, 'delete'), 'danger'));
        article.append(actions); container.append(article);
      }
      const pagination = node('div', '', 'dialog-actions');
      pagination.append(action('Refresh reviews', () => loadModeration(page)));
      if (page > 1) pagination.append(action('Previous', () => loadModeration(page - 1)));
      if (page * result.limit < result.total) pagination.append(action('Next', () => loadModeration(page + 1)));
      container.append(pagination);
    } catch (error) {
      if (current === adminRequest) container.replaceChildren(node('p', error.message, 'error'), action('Retry', () => loadModeration(page)));
    } finally { if (current === adminRequest) container.removeAttribute('aria-busy'); }
  }
  async function loadSettings() {
    const [recipients, shops] = await Promise.all([api('/reviews/recipients'), api('/reviews/shops')]);
    if (state.user?.role !== 'admin') return;
    const container = $('#review-recipient-settings'); container.replaceChildren();
    for (const shop of shops.data) {
      const form = node('form', '', 'review-recipient-form');
      const label = node('label', shop.name);
      const select = node('select');
      select.name = 'notificationAdmin'; select.append(new Option('No administrator assigned', ''));
      for (const recipient of recipients.data) select.append(new Option(`${recipient.name}${recipient.lineLinked ? ' · LINE linked' : ' · LINE not linked'}`, recipient._id));
      select.value = shop.notificationAdmin || '';
      label.append(select);
      const save = node('button', 'Save recipient'); save.type = 'submit';
      const feedback = node('p', '', 'hint'); feedback.setAttribute('role', 'status');
      form.append(label, save, feedback);
      form.addEventListener('submit', async event => {
        event.preventDefault(); save.disabled = true; feedback.textContent = '';
        try { await api(`/shops/${shop._id}`, 'PUT', { notificationAdmin: select.value || null }); feedback.textContent = 'Recipient saved.'; }
        catch (error) { feedback.textContent = error.message; }
        finally { save.disabled = false; }
      });
      container.append(form);
    }
  }
  function renderAdmin() {
    const admin = state.user?.role === 'admin';
    $('#review-admin').hidden = !admin;
    if (!admin) {
      adminRequest++;
      $('#review-moderation').replaceChildren(); $('#review-recipient-settings').replaceChildren();
      if ($('#moderation-dialog').open) $('#moderation-dialog').close();
      if ($('#review-dialog').open) $('#review-dialog').close();
    }
  }
  async function links() {
    const params = new URLSearchParams(location.search);
    const reviewId = params.get('review');
    if (reviewId && state.user && handledLink !== reviewId) {
      handledLink = reviewId;
      const r = state.reservations.find(r => r._id === reviewId);
      if (r?.canReview) openReview(r);
      else notice(r?.reviewSubmitted ? 'You have already reviewed this visit.' : 'This reservation is unavailable for review.', true);
    } else if (reviewId && !state.user) notice('Log in to leave a review of your completed visit.');
    const shopId = params.get('shop');
    if (shopId && handledLink !== shopId && !reviewId) {
      const shop = state.shops.find(s => s._id === shopId);
      if (shop) { handledLink = shopId; showShopDetails(shop); }
    }
  }
  document.querySelector('#review-form').addEventListener('submit', event => {
    event.preventDefault();
    submitting(event.target, '#review-error', async () => {
      const body = Object.fromEntries(new FormData(event.target)); body.rating = Number(body.rating);
      await api(`/reservations/${reviewing}/review`, 'POST', body);
      $('#review-dialog').close();
      const params = new URLSearchParams(location.search); params.delete('review');
      history.replaceState(null, '', `${location.pathname}${params.size ? `?${params}` : ''}${location.hash}`);
      await loadReservations(); await refreshPublic(); notice('Thank you. Your review has been posted.');
    });
  });
  document.querySelector('#review-cancel').addEventListener('click', () => $('#review-dialog').close());
  document.querySelector('#moderation-cancel').addEventListener('click', () => $('#moderation-dialog').close());
  document.querySelector('#moderation-form').addEventListener('submit', event => {
    event.preventDefault();
    submitting(event.target, '#moderation-error', async () => {
      const { review, kind } = moderation;
      await api(`/reviews/${review._id}`, kind === 'delete' ? 'DELETE' : 'PATCH', kind === 'delete' ? undefined : { hidden: kind === 'hide', reason: event.target.elements.reason.value });
      $('#moderation-dialog').close(); await loadModeration(adminPage); await refreshPublic(); notice('Review moderation saved.');
    });
  });
  document.querySelector('#review-admin').addEventListener('toggle', async event => {
    if (!event.target.open || state.user?.role !== 'admin') return;
    $('#review-admin-error').textContent = '';
    try { await Promise.all([loadModeration(), loadSettings()]); }
    catch (error) { $('#review-admin-error').textContent = error.message; }
  });
  return { ratingText, reservationAction, loadShop, renderAdmin, links };
})();
