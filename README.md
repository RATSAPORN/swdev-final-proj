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
