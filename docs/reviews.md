# Reviews and LINE alerts (requirements 7–11)

Registered users can leave one 1–5 star rating and a required comment (1–2000 trimmed characters) for each reservation they own after its 60-minute period ends. There is no manual attendance step; completion uses `startAt + 60 minutes`. Legacy date-only reservations cannot be reviewed. The reservation list shows **Leave a review**, or **Reviewed** after submission. Completed reservations cannot be rescheduled; a new visit needs a new booking. Deleting a reservation retains its existing review.

Shop details show the average and number of visible reviews and paginated newest-first reviews. Review text is rendered as text, and only author display names are public. Hidden and deleted reviews do not contribute to averages. With no visible reviews, the average is `null` and the browser displays **No reviews yet**.

Admins open **Review moderation & LINE alerts** below the shop-management section. Hiding or restoring requires a reason. Deleting requires confirmation and removes the comment and cached notification content. A private tombstone retains the reservation's unique submission key, preventing reposting. Moderation is performed by existing global admins; no new shop-owner permission role is introduced.

## LINE setup

1. Configure the existing LINE Login/Messaging API channels and access token. Users and notification administrators link LINE through the account header and add the configured Official Account as a friend. Both channels must belong to the same LINE provider.
2. Set `APP_BASE_URL` to the public HTTPS app origin; local previews default to `http://localhost:5000`. Review links select the completed reservation after login; shop alert links open shop details.
3. As an admin, expand **Review moderation & LINE alerts**, then assign a linked administrator to each shop under **Shop notification recipients**. Only admins may assign recipients; the API rejects ordinary user accounts. The selected existing admin receives that shop's alerts. No assignment or no LINE link results in a skipped delivery recorded as `not-linked`.
4. Keep the server running. The existing polling cadence, `REMINDER_POLL_SECONDS` (default 60, minimum 5), also controls review notifications. `REVIEW_PROMPT_DELAY_MINUTES` defaults to 5 after the session ends. `REVIEW_NOTIFICATIONS_ENABLED=false` disables review notifications independently of appointment reminders.

New prompts are scheduled for reservations completed within the preceding 24 hours, skip reviewed/deleted/untimed reservations, and persist their delivery state on the reservation. Already queued attempts continue retrying across that catch-up cutoff. New-review alerts are saved atomically with the review and sent on the next poll. Every rating triggers an alert; ratings <=2 have a prominent low-rating heading. Hidden/deleted reviews awaiting delivery are skipped. There is no in-app shop reply feature.

Failed deliveries retry up to three attempts with exponential backoff, one-minute claim leases, and a stable LINE retry key. Retried payloads keep the first attempted text/recipient. Reassignment or unlinking prevents retrying to a different recipient with the same key. Attempts older than 23 hours fail rather than using an expired retry key. If a worker dies, the next worker reclaims its expired lease. LINE acceptance does not guarantee delivery to a blocked account. See [LINE's retry guidance](https://developers.line.biz/en/docs/messaging-api/retrying-api-request/).

Without a channel access token, delivery uses the existing dry-run outbox; it does not contact LINE. Failed attempts are logged, and embedded job fields (`reviewPrompt` on Reservation, `notification` on Review) retain status, attempts and timestamps for diagnosis. Those fields are excluded from public API responses. A successfully submitted review remains saved even if its LINE alert fails.

## API

| Method | Endpoint | Access / behavior |
|---|---|---|
| POST | `/api/v1/reservations/:id/review` | Owner only; `{ "rating": 5, "comment": "A lovely visit." }`; 201, duplicate 409 |
| GET | `/api/v1/shops/:shopId/reviews?page=1&limit=10` | Public; visible reviews, `total`, `averageRating`, `page`, `limit`; maximum limit 50 |
| GET | `/api/v1/shops` and `/api/v1/shops/:id` | Includes `averageRating` and `reviewCount` |
| GET | `/api/v1/reservations` and `/api/v1/reservations/:id` | Adds `reviewSubmitted` and owner-specific `canReview` |
| GET | `/api/v1/reviews?page=1&limit=10&shop=<optionalId>` | Admin only; visible and hidden reviews, moderation metadata |
| PATCH | `/api/v1/reviews/:id` | Admin only; `{ "hidden": true, "reason": "Spam" }`, or `hidden: false` to restore |
| DELETE | `/api/v1/reviews/:id` | Admin only; removes review text and public visibility, retains private anti-repost tombstone |
| GET | `/api/v1/reviews/recipients` | Admin only; candidate names/IDs and LINE-linked booleans |
| GET | `/api/v1/reviews/shops` | Admin only; current shop notification assignments |
| PUT | `/api/v1/shops/:id` | Admin only; `{ "notificationAdmin": "<adminUserId>" }`, or `null` to clear |
| POST | `/api/v1/dev/review-notifications/run` | Development and admin only; optional `{ "asOf": "2026-11-15T12:00:00Z" }` to run a deterministic scheduler tick |

## Verification

`npm test` runs the existing suite and review API/database/scheduler tests against temporary MongoDB. Tests cover ownership, completion boundaries, concurrent submissions, validation, pagination, moderation, average recalculation, recipient permissions, reminder windows and durable retries. No real database credentials are used.

Optional installed-Chrome smoke test: `node --experimental-websocket tests/reviews-browser.js` (Node 20; on newer Node versions the flag may be unnecessary). Set `CHROME_PATH` if Chrome is installed elsewhere. The test starts its own temporary MongoDB and Chrome profile, verifies guest login/review/public display, mobile fit and admin assign/hide/restore/delete flows, and writes screenshots to `.cache/reviews-desktop.png` and `.cache/reviews-mobile.png`.
