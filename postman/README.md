# Presentation tests in Postman / Newman

Import these two files into Postman:

- `Massage-Reservation.postman_collection.json`
- `Local-Demo.postman_environment.json`

The collection follows the supplied presentation checklist: folders **01–12** for the user/admin demonstration and **15** for extra credits. All requests include response assertions. Tokens, IDs, a unique registration email and future Bangkok dates are saved automatically. No manual ID or token copying is needed.

## Fastest: run the complete presentation with Newman

From the project directory:

```powershell
npm run test:postman
```

This starts the actual Express app on a free localhost port, seeds a disposable MongoDB database, runs the collection through the already-installed Newman dependency, prints the results, writes reports, and stops the server/database. It never loads `config/config.env` or connects to Atlas. LINE Login is mocked and message delivery uses the dry-run outbox, so no real LINE messages are sent.

Reports are saved to `.cache/postman/summary.json` (counts/failures) and `.cache/postman/newman-results.xml` (JUnit). A failed request or assertion returns a nonzero exit status.

## Run in the Postman Collection Runner

1. Start the dedicated presentation server:

   ```powershell
   npm run postman:demo
   ```

2. Import both JSON files above. Select **Massage Reservation · Local Demo** as the environment. Its default `baseUrl` is `http://127.0.0.1:5000`.
3. Open **Massage Reservation · Presentation & Extra Credits**, choose **Run collection**, and keep the folders in their numbered order. Run one iteration with every request selected. Use Postman's local desktop agent when running from Postman Web.
4. Show the test-results panel during your presentation. Expected validation/authorization errors (400, 401, 403, 404, 409) are successful tests when the application correctly rejects the request.
5. Stop with Ctrl+C. Restart the demo before repeating the full presentation: extra credits use a pre-seeded completed visit with one permitted review. There is no API backdoor that changes real reservation times to bypass completion checks.

If port 5000 is occupied, stop the other local server or choose another port:

```powershell
$env:PORT = '5001'
npm run postman:demo
```

Set the Postman environment's `baseUrl` to `http://127.0.0.1:5001`. The one-command Newman run chooses a free port automatically.

For a direct Newman CLI demonstration while the presentation server is running:

```powershell
npx --no-install newman run postman/Massage-Reservation.postman_collection.json -e postman/Local-Demo.postman_environment.json
```

These presentation-specific fixtures and credentials belong to `postman:demo`, not the normal `npm start` or `npm run demo` server. Select the dedicated environment to avoid testing the wrong server.

## Presentation mapping

| Slide step | Collection folder | Demonstration |
|---|---|---|
| 1 | 01 | Missing telephone, short password, valid registration, duplicate email, ignored admin-role escalation |
| 2 | 02 | Wrong-password rejection, successful login, identity and ordinary role |
| 3 | 03 | Shop list, details, opening hours, health license, available hourly periods |
| 4 | 04 | Booking with notes and queue number; unauthenticated/past/missing-time/out-of-hours/full-capacity failures; three-booking limit |
| 5 | 05 | User lists and reads only their own bookings |
| 6 | 06 | User changes date, time and notes without changing ownership |
| 7 | 07 | User deletion, 404 afterward, cleanup while retaining another owned booking for the admin demo |
| 8 | 08 | Logout and revoked-token rejection |
| 9 | 09 | Admin login and role verification |
| 10 | 10 | Admin lists/reads the ordinary user's retained booking, including guest details |
| 11 | 11 | Admin changes another user's booking without taking ownership |
| 12 | 12 | Admin deletes another user's booking; confirms 404 |
| 15 | 15 | Mock LINE linking, post-visit review prompt, pre-visit reminder, completed-visit rating/comment, duplicate/early/unauthorized review rejection, public average, low-rating admin alert, hide/restore/delete, unlink and logout |

Steps **0, 13, 14 and 16** remain slide items: use-case diagram, class diagram, sequence diagram, and GitHub contribution evidence.

The main booking user is registered by the collection with a new unique email each run. A separate seeded review guest owns a completed reservation and a future reservation; the latter's reminder time is simulated using the existing admin-only development scheduler. This demonstrates post-visit functionality without waiting through a real session. Shop admins receive alerts through an assigned existing administrator account.

## Maintain the collection

`build-collection.js` is the editable source for request definitions and Postman scripts. After editing it, regenerate the importable JSON files:

```powershell
npm run postman:build
node tests/postman-artifacts.test.js
npm run test:postman
```

`npm test` includes artifact structure and script-syntax checks alongside the existing app regression tests.
