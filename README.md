# Massage Reservation

Express 5 + MongoDB/Mongoose backend and a responsive, same-origin HTML/CSS/JavaScript interface. Adapted from the existing hospital appointment assignment. Domain code now uses **Reservation**, **MassageShop**, and `/api/v1/reservations`.

## Quick local demo

Requires Node.js 20.19+ (or Node.js 22+) and npm. The existing Node 20.17 environment also passed the test suite.

```powershell
npm ci --ignore-scripts
npm run demo
```

Open http://127.0.0.1:5000. Register a regular user in the browser. Demo admin: **admin@example.com / DemoAdmin123!**. These credentials exist only in the disposable local demo. The demo binds to localhost and resets when stopped. It does not read `config/config.env` or contact the original database. The first run downloads a MongoDB binary (about 600 MB on Windows) from MongoDB's official download service, so internet access is needed once. The binary is cached in `.cache/mongodb`.

## Persistent database

### MongoDB Atlas

The application supports Atlas through the existing Mongoose connection. `npm start` and `npm run dev` read `config/config.env`; `npm run demo` deliberately uses a temporary local database instead.

1. In Atlas, open your cluster's **Connect → Drivers** dialog and copy the Node.js connection string.
2. Create a database user with read/write access to the intended project database. This is separate from your Atlas website login.
3. Under **Network Access**, add your current IP address to the project's IP access list.
4. Set `MONGO_URI` in `config/config.env`, following this form:

```dotenv
MONGO_URI=mongodb+srv://<db_username>:<db_password>@<cluster-host>/massage-reservation?retryWrites=true&w=majority
```

Replace the placeholders locally and URL-encode reserved characters in credentials. The name after the host selects the database; use `massage-reservation` for a separate project database, or intentionally keep the database name in your existing URI. Do not put real credentials in `config.env.example` or commit `config.env`.

This workspace uses the existing **`SW_DEV`** database through `MONGO_DB=SW_DEV`, which overrides the database name in the URI. `MassageShop` explicitly maps to **`shops`** and stores the existing Atlas fields `telephone`, `opens`, and `closes`. Mongoose aliases expose these as `tel`, `openTime`, and `closeTime` for the API and browser, including populated reservation shop details. Existing shop IDs and metadata are preserved. The reservation quota index matches the existing partial unique index on `{ user, slot }` where `active: true`; new reservations have `active: true`.

Run `npm start`. After the database connects and the indexes are ready, open http://localhost:5000. New registrations, shops, and reservations will persist in Atlas. Use the admin creation and optional shop seeding commands below against that same configured database.

If connection fails, check the database user's credentials, the IP access list, cluster availability, and the copied cluster hostname. [Official Atlas connection instructions](https://www.mongodb.com/docs/atlas/driver-connection/).

### Run with your configured database

1. Copy `config/config.env.example` to `config/config.env` only if you do not already have that file. Set your own MongoDB URI and a long random JWT secret. Use a separate database for this project.
2. Run `npm start` or `npm run dev`, then open http://localhost:5000.
3. Create an administrator using the trusted local script:

```powershell
$env:ADMIN_EMAIL = 'your-admin@example.com'
$env:ADMIN_PASSWORD = 'choose-your-own-password'
$env:ADMIN_TEL = '0812345678'
$env:ADMIN_NAME = 'Administrator'
npm run create-admin
Remove-Item Env:ADMIN_PASSWORD
```

The script refuses to alter an existing account. Public registration always creates a regular user. Admins can add shops in the browser or use the API. Optional `npm run seed` adds three clearly labelled sample shops without deleting existing records. Run it only against your intended project database.

Existing hospital and appointment collections are **not migrated or deleted**. The app now uses the existing `SW_DEV.shops`, `SW_DEV.reservations`, and `SW_DEV.users` collections. Users keep their collection and hashed passwords; existing accounts need a telephone number before being saved, and old JWTs require a fresh login. Back up and map any old hospital data explicitly before migration. Existing environment credentials were left unchanged; use your own secret and database credentials before publishing.

## API

All JSON responses contain `success` and either `data` or `message`. Send `Content-Type: application/json` for POST/PUT. Authentication accepts either `Authorization: Bearer <token>` or the HttpOnly session cookie used by the browser.

| Method | Path | Access / body |
|---|---|---|
| POST | `/api/v1/auth/register` | Public: `name`, `tel`, `email`, `password` (minimum 6 characters) |
| POST | `/api/v1/auth/login` | Public: `email`, `password` |
| GET | `/api/v1/auth/me` | Logged-in user |
| POST | `/api/v1/auth/logout` | Logged-in user; body `{}`; revokes all sessions for that account |
| GET | `/api/v1/shops` | Public shop list; no private reservation data |
| GET | `/api/v1/shops/:id` | Public shop details |
| POST | `/api/v1/shops` | Admin: `name`, `address`, `tel`, `openTime`, `closeTime` |
| PUT / DELETE | `/api/v1/shops/:id` | Admin; cannot delete a shop with reservations |
| GET | `/api/v1/reservations` | Own reservations; admins see all with guest details |
| POST | `/api/v1/reservations` | Logged-in user: `shop` ID, `apptDate` |
| GET / POST | `/api/v1/shops/:shopId/reservations` | Same operations scoped to that shop |
| GET / PUT / DELETE | `/api/v1/reservations/:id` | Owner or admin; updates accept only `shop` and `apptDate` |

Example create body:

```json
{ "shop": "replace-with-a-shop-id", "apptDate": "2026-12-20" }
```

Dates use `YYYY-MM-DD` and must be today or later in Thailand. Shop hours use `HH:mm`, same-day opening before closing. The assignment specifies date-based queues; it does not specify session lengths or capacity, so the app does not claim to check time-slot availability. The limit is **three stored reservations per account**, including admins' own bookings; deleting one frees a place. Admins can manage any user's reservations without taking ownership. Historical records count until deleted.

## Verification and assignment evidence

```powershell
npm test
npm run changes
```

Tests use a disposable real MongoDB process and HTTP requests to the actual Express application; no test touches `config/config.env`. Tests cover the nine requirements, authorization, malformed input, password rehashing, session revocation and eight simultaneous create requests. Environments that block child processes must allow Node to start the local MongoDB test process.

Runtime dependency audit: zero reported vulnerabilities after compatible updates. The development dependency tree retains 22 advisories, including the existing Newman/Postman runner; see the verification notes for scope and deferral. A production installation can use `npm ci --omit=dev --ignore-scripts` (demo/tests require dev dependencies).

- [Thai original-versus-improved report](docs/IMPROVEMENTS_TH.md)
- [Original source snapshot](docs/original/)
- [Generated code diff](docs/CODE_CHANGES.diff)
- [Verification notes](docs/VERIFICATION.md)

No Git repository was present at the start. The snapshot is the comparison baseline, excluding credentials, dependencies and generated files. `npm run changes` regenerates the code diff. No commit history or contributors were invented.

Implementation references: [Express async error handling](https://expressjs.com/en/guide/error-handling/) and [Mongoose validation and unique-index behavior](https://mongoosejs.com/docs/8.x/docs/validation.html).

## Additional Requirements

Six extra-credit requirements built on the existing code. The nine original requirements keep working (see `tests/00-core.test.js`). One contract change was approved: **new reservations must include `startTime`**.

### Summary

| ID | What was added |
|---|---|
| **AR1** Time-slot availability | Shops have `capacity` (guests at the same time; default 3, 1–20). The day is split into fixed **60-minute periods** from opening time; a final partial hour is not offered. `GET /shops/:id/availability` returns `start`, `end`, `remaining` and `available` for each period, skipping periods that have already started. Create and edit re-check capacity and return **409** when a period is full. The booking form shows `10:00–11:00 (2 slots available)` / `(Fully booked)` (full periods can't be selected) and reloads when the shop or date changes and after a 409. All times are Asia/Bangkok (UTC+7). |
| **AR2** Booking notes | One optional `notes` text field (masseuse gender/name, injuries, areas to avoid, doctor's restrictions…). Trimmed; max **1000** characters; validated on the server; editable (the form pre-fills it); shown to the owner and to admins, always rendered as text (no HTML). |
| **AR3** Health Establishment License | Shops have `licenseNumber` (format `HE-<Buddhist year>-<2-digit province>-<5 digits>`, e.g. `HE-2569-10-00123`, a **placeholder format** for this project) and optional `licenseExpiresAt`. Shown on shop cards, in a shop-details dialog, in the booking panel and on reservations. Optional so existing shops keep working until `npm run seed` backfills them. |
| **AR6** LINE account linking | LINE Login v2.1 (OpenID Connect) with `state` (CSRF), `nonce` and PKCE. The server exchanges the code and verifies the ID token, stores only the LINE `userId` (`sub`), and never stores access tokens. `bot_prompt=aggressive` asks the user to add the Official Account as a friend. Link/Unlink button and status in the header. Email/password login is unchanged. |
| **AR4** LINE booking confirmation | A Messaging API push message after a successful booking with shop name, date, time and **queue number**. Owners are also notified when a reservation is edited (including by an admin) or deleted. Delivery runs in the background: a missing LINE link or a LINE error never fails the booking, and errors are logged without tokens. |
| **AR5** LINE reminder | A scheduler polls the database every `REMINDER_POLL_SECONDS` and sends one reminder when `now < start ≤ now + REMINDER_MINUTES_BEFORE`. `reminderSentAt` is claimed atomically (no duplicates, even with several servers) and is reset when the time changes. Deleted or past reservations are never reminded. Bookings made inside the window are **skipped**. |

**Design decisions**

- **Race conditions (AR1):** each booking takes a *seat* number `1..capacity` in its period, enforced by a unique partial index on `{shop, apptDate, startTime, seat}`. This is the same pattern the project already uses for the 3-booking quota (`{user, slot}`). It needs no replica set or transaction, and no counter can drift after deletes. Tested with 10 simultaneous requests.
- **Queue number (AR4):** the shop's booking order for that day (`#1, #2, …`) from an atomic `$inc` counter (`counters` collection). It is unique even under concurrency and never reused after a deletion. A booking moved to another shop or day gets a new number.
- **Callback cookie (AR6):** the session cookie is `SameSite=Strict`, so it is not sent when LINE redirects back. The one-time `state` record (10-minute TTL) identifies the user, and an HttpOnly `SameSite=Lax` `line_state` cookie binds the callback to the browser that started it.
- **Legacy data:** reservations created before AR1 (date only) are kept. They show "No time selected", are not counted in availability, get no reminders, and need a time when rescheduled.
- **Modes without LINE credentials:** messages are **dry-run** (printed and kept in a dev outbox). With `LINE_MOCK_LOGIN=true` (never in production), Link LINE completes a fake login, so everything can be demoed and tested offline.

### API added or changed

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/api/v1/shops/:id/availability?date=YYYY-MM-DD[&exclude=<reservationId>]` | Public | **New (AR1).** `exclude` ignores the reservation being edited |
| POST | `/api/v1/shops`, PUT `/api/v1/shops/:id` | Admin | **Changed:** also accept `capacity`, `licenseNumber`, `licenseExpiresAt` |
| POST | `/api/v1/reservations` (and `/shops/:shopId/reservations`) | User | **Changed:** requires `startTime` (`HH:mm`, on the hour from opening); optional `notes`; **409** when full; response has `queueNumber` |
| PUT | `/api/v1/reservations/:id` | Owner/admin | **Changed:** also accepts `startTime` and `notes`; **409** when the new period is full |
| GET | `/api/v1/line/status` | User | **New (AR6).** `{ linked, loginMode, messagingMode, addFriendUrl }` |
| GET | `/api/v1/line/login` | User | **New (AR6).** Redirects to LINE Login |
| GET | `/api/v1/line/callback` | (LINE redirect) | **New (AR6).** Verifies `state`, exchanges the code, then redirects to `/?line=linked\|cancelled\|invalid\|expired\|taken\|error` |
| DELETE | `/api/v1/line/link` | User | **New (AR6).** Unlink |
| POST | `/api/v1/dev/reminders/run` body `{ "asOf": "<ISO time>" }` (optional) | Admin, **development only** | **New (AR5).** Runs the reminder scheduler now, optionally as if it were `asOf` |
| GET | `/api/v1/dev/line/outbox` | Admin, **development only** | **New.** Last dry-run LINE messages |

Example create body:

```json
{ "shop": "replace-with-a-shop-id", "apptDate": "2026-12-20", "startTime": "10:00", "notes": "Female masseuse please. No acupressure (doctor's advice)." }
```

### Environment variables

Add these to `config/config.env` (see `config/config.env.example`). All are optional.

| Key | Purpose |
|---|---|
| `LINE_LOGIN_CHANNEL_ID`, `LINE_LOGIN_CHANNEL_SECRET` | LINE Login channel (Basic settings) |
| `LINE_LOGIN_CALLBACK_URL` | Exactly the Callback URL registered in the LINE Login channel, e.g. `https://<host>/api/v1/line/callback` |
| `LINE_MESSAGING_CHANNEL_ACCESS_TOKEN` | Messaging API long-lived channel access token. Blank = dry-run |
| `LINE_BOT_PROMPT` | `aggressive` (default) or `normal` |
| `LINE_OA_ADD_FRIEND_URL` | Optional add-friend link (`https://lin.ee/…`) shown after linking |
| `LINE_MOCK_LOGIN` | `true` = fake LINE Login for local demos (ignored in production) |
| `REMINDER_MINUTES_BEFORE` | Minutes before the appointment to remind (default 60) |
| `REMINDER_POLL_SECONDS` | Scheduler interval (default 60, minimum 5) |
| `REMINDER_ENABLED` | `false` disables the scheduler |

Never commit real values. `config/config.env` is git-ignored.

### LINE Developers Console setup

1. **Provider:** at <https://developers.line.biz/console/>, create (or choose) **one provider**. Both channels below **must be under this same provider**, because LINE user IDs are issued per provider. If the channels are under different providers, the `userId` saved at login won't match the one the Messaging API expects, and push messages will fail.
2. **Messaging API channel:** create a LINE Official Account (LINE Official Account Manager), then enable **Messaging API** for it and choose the same provider. In the console, open the channel → *Messaging API* tab → issue a **channel access token (long-lived)** → `LINE_MESSAGING_CHANNEL_ACCESS_TOKEN`. Note the OA's QR code / basic ID; its add-friend link can go in `LINE_OA_ADD_FRIEND_URL`.
3. **LINE Login channel:** under the same provider, create a *LINE Login* channel (app type: Web app). From *Basic settings*, copy the **Channel ID** and **Channel secret** → `LINE_LOGIN_CHANNEL_ID`, `LINE_LOGIN_CHANNEL_SECRET`. In *Basic settings → Linked LINE Official Account*, select the OA from step 2. `bot_prompt` only works with a linked OA.
4. **Callback URL:** in the LINE Login channel's *LINE Login* tab, add `https://<your-host>/api/v1/line/callback` and set the same value in `LINE_LOGIN_CALLBACK_URL`. For local testing, use an HTTPS tunnel to port 5000 if LINE rejects a plain `http://localhost` URL. **Publish** the channel, or add testers while it is in development mode.
5. **Add the OA as a friend:** when users click **Link LINE**, LINE shows the add-friend prompt (`bot_prompt=aggressive`). Push messages only reach users who are friends of the OA and have not blocked it. Users who skipped the prompt can add the OA later through the QR code or add-friend link.
6. Restart the server. `GET /api/v1/line/status` should report `loginMode: "live"` and `messagingMode: "live"`.

### Tests, Postman and demo

```powershell
npm test                    # 47 tests: 9 core regression + AR1–AR6 + seed, on a disposable MongoDB; LINE is mocked
npm run demo                # http://127.0.0.1:5000, admin@example.com / DemoAdmin123!, sample shops, mock LINE
npx newman run postman/Massage-Additional-Requirements.postman_collection.json   # with the demo running
npm run seed                # configured database: add sample shops, backfill capacity + SAMPLE license numbers
```

Like the original project, `tests/`, `scripts/` and the Postman collection (`postman/`) are kept outside the repository (`tests/` and `scripts/` are git-ignored), so the commands above need those local folders. The Postman collection creates its own users and shop, covers success and failure cases (400 invalid license or notes over 1000 characters, 409 full slot, 403 non-admin, invalid LINE state), and cleans up after itself, so it can run repeatedly in one Runner/Newman pass.

`npm run demo` reads only `LINE_*` and `REMINDER_*` from `config/config.env` (never `MONGO_URI`). With real LINE values there, the demo uses real LINE. Without them it uses mock login and prints messages to the terminal.

### Demo script (extra-credit video)

Start `npm run demo` and open http://127.0.0.1:5000. Register a user (e.g. *Ploy*). Use a second browser profile for a second user.

- **AR3 License:** point to the license line on each shop card → click **View details & license** (Thai license name, number, expiry) → **Choose this shop** → the booking panel shows the license. As admin, try adding a shop with license `12345` → error; `HE-2569-10-00999` → saved.
- **AR1 Availability:** choose **Sample · Riverside Herbal Compress** (capacity 1) and tomorrow → periods show `(1 slot available)`. Book 10:00. In the second profile, open the same shop and day: 10:00 shows **Fully booked** and can't be selected. To show a 409: keep the second profile's form open on 11:00, book 11:00 in the first profile, then submit in the second → error message and the list reloads with 11:00 full.
- **AR2 Notes:** while booking, type notes such as "Prefer a female masseuse; old knee injury; no acupressure per doctor". Show them in *Good moments* → **Edit** (notes pre-filled) → change them → save. Log in as admin to see the notes in *All reservations*. Optionally paste `<b>hi</b>` to show it renders as text.
- **AR6 LINE linking:** click **Link LINE** in the header (with real LINE: LINE login screen + add-friend prompt) → back on the site, "LINE linked". Show **Unlink LINE** / **Link LINE** switching the status.
- **AR4 Confirmation:** make a booking → show the LINE message (real phone, or the demo terminal / `GET /api/v1/dev/line/outbox` in dry-run) with shop, date, time and queue number. Edit and delete it to show the update and cancellation messages.
- **AR5 Reminder:** book tomorrow 15:00. As admin, `POST /api/v1/dev/reminders/run` with `{ "asOf": "<tomorrow>T14:15:00+07:00" }` (the Postman *AR5* folder has it) → the reminder message appears and the response shows `"status": "sent"`. Run again → nothing (no duplicates). Edit the booking to 16:00 and run with `T15:30` → reminded again. Alternatively set `REMINDER_MINUTES_BEFORE` to a large value and wait for the 30-second poll.
