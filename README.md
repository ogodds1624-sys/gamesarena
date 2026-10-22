# Games Hub

A responsive casino dashboard for game outcome predictions, user management, payment tracking, and referrals.

## Account activation

One-time activation is required for both Aviator and Instant Virtual after
country selection and SportyBet connection: **GHS 55 in Ghana / NGN 6,655 in
Nigeria** (121 NGN per GHS). Admin approval unlocks package checkout and game
access. Previously confirmed activations remain valid without another fee.
Migration `0014_restore_activation.sql` updates saved fees without altering
historical payments or session-package prices. Admin pricing exposes both fees.

Instant Virtual's **PLAY NOW** checks country selection and account linking
and activation approval directly. Completed Ghana accounts
with no credits go to `/virtual-packages`, not the Aviator session packages.
The responsive credit menu presents Starter (1 credit / GHS 300), Plus (3 credits /
GHS 400), and Max (5 credits / GHS 500). Each card opens its matching checkout;
the wallet panel shows the signed-in user's current balance.

Nigerian accounts use the same Instant Virtual package, checkout, confirmation,
and scanner pages. Their fixed conversion is **1 GHS = NGN 121**: Starter
(1 credit) costs **NGN 36,300**, Plus (3 credits) **NGN 48,400**, and Max
(5 credits) **NGN 60,500**. Checkout uses the admin's Nigerian bank accounts.
The server selects pricing from the account's saved country and rejects
cross-country or incorrect amounts. Payment records retain country and amount;
approval awards the same 1 / 3 / 5 credits in either country. No rate changes
are made to Aviator packages or other currencies.

For signed-in users, the home page's **GET STARTED** opens a game chooser:
**Instant Virtual** opens its credit packages, while **Aviator** follows the
existing country, connection, and session-package flow. Guests still start with
registration. **Open Predictor** keeps its Aviator destination; **PLAY NOW**
opens the Instant Virtual scanner when credits are available.

## Instant Virtual screenshot scanning

Payment checkout requires a receipt and the sender's MoMo/bank account holder
name before "I've sent the money" is enabled. This applies to Ghana and Nigeria,
including activation, session packages and Instant Virtual credits. The name is
validated server-side, saved with the payment and displayed as "Paid from" in
admin payment review. Existing payment records remain unchanged.

Approved Instant Virtual users open `/virtual-scan`, select or drop up to **five
PNG, JPEG, or WebP screenshots, each at most 3 MB**, and scanning starts
automatically. The mobile file picker supports the device gallery. Each upload
has a real transfer-progress indicator; processing has separate queued/scanning
states. Results appear beneath the uploader without contacting an administrator.
The scan history section is not displayed; existing private database records and
background job recovery are retained. No Telegram bot or admin-only scanner is involved.

The scanner UI stays hidden until the server verifies a confirmed Instant
Virtual payment for the signed-in account. Direct visits without approval go
back to the pending payment's confirmation checkout, or to credit packages when
there is no pending payment. Aviator payments do not unlock the scanner.

The existing React/TanStack Start UI, Better Auth authentication, Neon
PostgreSQL database and red/black/white theme are retained. The server-only
official `@anthropic-ai/sdk` performs Claude vision requests; **sharp** is
used for actual image decoding, static-image
validation, metadata removal and normalization. Animated images, corrupt files,
images below 100 x 100 or above 20 megapixels, and normalized PNGs exceeding
4 MB are rejected. Screenshots are resized to at most 2400 x 2400; crop long
screenshots into readable sections instead of uploading tiny text.

Configure these **server environment variables** (never `VITE_` variables):

```dotenv
ANTHROPIC_API_KEY=your-private-anthropic-key
ANTHROPIC_MODEL=claude-sonnet-5-5
SCAN_IMAGE_ENCRYPTION_KEY=<64 random hexadecimal characters>
CRON_SECRET=<random secret of at least 32 characters>
```

Also retain the existing `DATABASE_URL` (Neon), authentication and admin
environment variables. Keep all these values server-side, never `VITE_`
variables. Generate independent random secrets privately; do not commit keys or
send them in chat. Use a vision model supporting the Anthropic Messages API
enabled for your Anthropic API account; the
model ID is configurable. Without the API or encryption key, uploads fail
explicitly without spending credits. Keep the encryption key stable while jobs
are pending; rotating it makes their ciphertext unreadable.
OpenAI is no longer used. Migration `0017_restore_anthropic_scan_model.sql`
switches pending non-Claude jobs to `claude-sonnet-5-5` without changing completed
reports or charges. Earlier migrations remain unchanged for database compatibility.
New jobs use `ANTHROPIC_MODEL`. Claude requests use base64 image input, a strict
JSON extraction prompt and local schema validation. An Anthropic API key with
API billing is required; a Claude chat subscription alone does not configure API access.

### Visible extraction and qualified rankings

New scans accept **SportyBet Instant Football only**, in either light or dark
mode. The vision model must identify the visible Instant Football heading and
supporting interface evidence (such as league tabs, 1X2 markets, star-rated
team rows and Next Round). A SportyBet logo alone, familiar clubs, colours or
ordinary football odds are not sufficient. Keep the heading visible when cropping.
Normal football returns **"This is not an Instant Football prediction"**;
other products or unclear identity request the correct screenshot. These results
have no rankings and use no credit, even if the model also returns readable teams.
Identification is AI-based, not a guarantee of screenshot authenticity.
Previously saved reports without identification still load, but their rankings
are hidden because the source cannot be confirmed under the new restriction.

The model returns strict validated JSON containing visible provider/sport, teams,
match IDs, market, decimal home/draw/away odds, time/countdown, status and
label/value statistics. Missing scalar values remain null; unreadable fields,
partial images and ambiguous fixtures are flagged. Image text is untrusted
evidence, not instructions. Multiple fixtures are supported (up to 30 per image).
Invalid or truncated model output is rejected rather than repaired with guesses.
Visible team abbreviations are kept unchanged. A selectable Instant Football
round with a Next Round control can establish upcoming-round status without
inventing a kickoff time. Neither light nor dark theme changes ranking rules.

Rankings are **displayed market favourites, not reliable outcome predictions**.
Only visibly upcoming, clearly identified winner markets with distinct readable
participants, complete applicable odds and no flagged uncertain fields qualify.
Two-way markets cannot contain a draw price. Each match selects its lowest-odds
Home, Draw or Away outcome, with no minimum odds gap. Exact ties use stable
Home, Draw, Away order (not a claim that one tied outcome is safer).
Two different eligible matches are sampled uniformly without replacement on the
server, then each uses its own lowest-odds outcome. Random match selection does
not improve winning chances. Picks are saved with the report, not rerolled on refresh.
Duplicate match rows are excluded; repeated teams in different matches are allowed.
Missing optional match IDs, times, providers, sports or statistics do not block
otherwise readable selections. Ambiguous selection details still exclude the row.
If fewer than two matches qualify, request a clearer screenshot without charging.
Claude transcribes and checks visible evidence, not independent future outcomes.
The compact results show each selected outcome, odds and match without per-card
footer text. When both picks are available, a short note says to play the games
as singles and not combine both predictions.
Each pick uses a red/black/white matchup card. A successful screenshot costs one
credit for two match picks, not one credit per pick. When the
balance reaches zero, a footer links to the Instant Virtual credit packages.
Detailed extraction, warnings and limitations remain in the private report but
are not displayed. New saved picks are displayed unchanged; older classified reports
are re-evaluated deterministically for compatibility, without rewriting past charges. No
historical prediction dataset is connected, and no winning probabilities,
invented statistics or guarantees are produced. Unclear screenshots or missing
odds may therefore produce no qualified selection.

### Durable jobs, privacy and billing

- `POST /api/scan-image` validates same-origin authenticated uploads, streams at
  most 3 MB, decodes the actual image, removes metadata, hashes the normalized
  content and queues a job. Headers: image `Content-Type` and UUIDv4 `X-Scan-Id`.
- `POST /api/scan-image?action=process&id=<uuid>` awaits the owner-bound foreground
  processor. `GET /api/scan-image` returns the newest 20 private jobs;
  `?id=<uuid>` retrieves only the owner's job. Older history uses both
  `before=<createdAt>` and `beforeId=<uuid>` to handle timestamp ties.
- Migration `0015_structured_scan_jobs.sql` adds encrypted image payloads, jobs,
  extraction/ranking reports, indexes, upload throttling and atomic queue/credit
  functions. Legacy `virtual_scans` records are retained unchanged, but the new
  structured history lists new jobs only.
- AES-256-GCM encrypted image bytes are temporarily stored in Neon. No public
  image URL or permanent upload storage is created. Images are decrypted only
  server-side for the model request and removed from the live job on completion,
  unreadable results or terminal failure. Jobs expire after 30 minutes; the next
  worker, authenticated scanner request or claim removes expired ciphertext.
  This is not instantaneous erasure from database backups or provider systems.
- Crop account details before uploading. The full normalized image is sent to
  Anthropic; its API data/retention policies apply. Transcribed scan reports remain
  in the user's private database history. Images and credentials are not logged.
- Existing activation approval, confirmed Instant Virtual payment, supported
  country, SportyBet linking, block checks and credits remain required. Access is
  rechecked before processing and before committing a charge.
- Pending jobs reserve available credit slots without deducting money. At most
  five jobs may be pending per user, 20 new jobs per rolling hour, and 40 upload
  requests per fixed hour (including invalid/retried uploads). Limits live in
  PostgreSQL rather than process memory.
- **One credit per screenshot is deducted atomically only when two qualifying
  match selections are saved.** Fewer than two readable eligible matches,
  unreadable/unrelated images and failures cost nothing. Existing charged
  historical reports are retained without changing their past charges.
- Request UUIDs and per-user normalized-image hashes deduplicate pending and
  successful jobs, preventing double charges after lost responses or repeated
  uploads. Use **Retry upload** with the same ID after a connection failure;
  select the file again after a terminal failure. A completed duplicate opens
  its previous report, not a fresh paid inference.

### Vercel setup and verification

Vercel uses `npm ci --include=dev` so build-time checks can run ESLint and
TypeScript from the lockfile. Do not override the install command with
`--omit=dev`: ESLint is a development dependency, and omitting it causes
`eslint: command not found` (exit code 127). Installing the tool does not bypass
lint findings; diagnose any subsequent nonzero lint exit from its actual output.

1. Run `npm install`, configure the environment above in Vercel and run
   `npm run db:migrate` against the existing Neon database. `npm run build`
   compiles production assets and runs the migrator; it skips remote migrations
   if `DATABASE_URL` is absent. Local embedded PGlite migrates itself but is
   in-memory and is not a production persistence substitute.
2. Deploy the existing project. Nitro's generated Vercel function uses a
   **90-second maxDuration**; the AI request has a 55-second timeout and no SDK
   retries. Verify your Vercel plan permits this duration.
3. `vercel.json` alone schedules `GET /api/scan-worker` every minute. Do not also
   copy this cron into Nitro's generated Build Output configuration: Vercel merges
   the two and rejects duplicate schedule/path entries. **Use a Vercel
   plan supporting per-minute cron (normally Pro or higher)** or an equivalent
   authenticated external scheduler. Vercel sends `Authorization: Bearer
<CRON_SECRET>`. Never expose the worker secret to the browser. Cron runs on
   production deployments; preview/local environments need foreground processing
   or a scheduler invoking that protected endpoint.
4. Workers await at most three claimed jobs concurrently, using PostgreSQL
   `FOR UPDATE SKIP LOCKED`, 100-second leases and at most three attempts.
   Transient rate-limit/connection/server failures retry after 15 seconds;
   interrupted invocations are reclaimed after the lease expires. No work relies
   on an unawaited promise after a server response. A working scheduler is required
   for recovery and cleanup while all user tabs are closed.
5. Run `npm run typecheck`, the targeted scanner/access tests below and
   `npm run build`. In a configured deployment, sign in as an approved user,
   upload two real screenshots, verify literal fixture/odds transcription and
   one charge per usable image, refresh history, repeat the same upload and
   verify no second charge. Try a blurry image and a second account's scan ID;
   check no-charge handling and private access denial. Close the page mid-scan
   and verify cron completes or safely expires the job.

```sh
node --experimental-strip-types --test src/lib/image-scan.test.ts src/lib/virtual-credits.test.ts src/lib/activation.test.ts src/lib/pricing.test.ts
```

Tests use the real SDK with mocked provider transport plus real image decoding,
encryption and PGlite queue functions; they do not verify a live API key, live
model accuracy, actual Neon credentials or a deployed cron scheduler.

Scanner failure logs include the job ID, attempt, error name and HTTP status.
Raw provider messages, credentials, headers and screenshots are never logged.
The temporary OpenAI authentication-comparison endpoint has been removed.

## Admin pricing and package duration

Open **Admin > Pricing & Packages** to edit the price and session minutes for each
of the three tiers in Ghana and Nigeria. Prices
must be positive whole currency units, package prices within a country must be
distinct, and session lengths must be whole minutes from 1 to 1,440. Save both
countries with **Save prices & minutes**; changes persist in the database and
customer menus refresh through the existing storefront polling.

Migration `0011_admin_pricing.sql` retains historical GHS 45 / NGN 6,000
activation fee settings and seeds the existing 3-, 10-, and 15-minute packages.
Activation fees are charged once per account. Checkout validates against saved
country-specific pricing, not a price supplied in a URL. An open checkout keeps
its quoted price and duration; if pricing changes before submission, the user
must reload and review the new quote. Submitted payments retain their price,
country, and purchased minutes, including after admin approval or a page reload.
Later pricing edits do not change pending payments, historical revenue, or
active session timers. Activation fees never start a timed session.

The admin transaction history displays **15 mins** for every session transaction
as a display-only label, not the purchased duration. Stored minutes, customer
package descriptions, and session timers still use the actual purchased duration.
Activation transactions display the **Activation** label.

## Session connection popups

The accounts `Ygodds18@gmail.com` and `Casinoworld@gmail.com` are exempt from timed
connection-issue popups on the 3-, 10-, and 15-minute plans (case-insensitive email
match). Their session timers and revenue exclusion are unchanged.
Other accounts keep the existing popup schedules.

## Test-account payment approval

Activation and session payments submitted by `Ygodds18@gmail.com` or
`Casinoworld@gmail.com` are automatically
approved in the database (case-insensitive email match). Receipts and transaction
records and tester status are retained, but tester labels are hidden in the admin
member list and transaction member details. These
payments never count toward daily, total, or partner revenue. Activation payments
are enabled for both games. Migration
`0009_auto_approve_test_account.sql` also approves this account's existing pending
payments; rejected payments remain rejected. All other accounts still require
admin approval.
Migration `0010_casinoworld_test_account.sql` extends this behavior to
`Casinoworld@gmail.com`, excludes its existing payments from revenue, and approves
its pending payments. Session and virtual-credit payments still require a receipt
and admin approval for accounts without test-account auto-approval.

## Admin access

Configure `ADMIN_PASSCODE` with at least 6 characters and
`ADMIN_SESSION_SECRET` as a random secret of at least 32 bytes in the server
environment. Six-character numeric codes are substantially weaker than long,
random passcodes; use a longer passcode and deployment-level login throttling
for any publicly accessible deployment. Do not use `VITE_`-prefixed variables
for these values; those are exposed to the browser. The admin passcode is
verified on the server, and admin-only server functions require its signed,
HTTP-only session cookie. Copy `.env.example` to `.env` for local development
and replace both placeholders with private values. Set the same variables in
the deployment platform before using the admin panel.

## Partner payouts

Approved partners can request a payout in GHS or NGN for confirmed payments
from the previous local calendar day (Ghana time for GHS and Nigeria time for
NGN). The available amount is net of the partner's commission and any pending
or paid payout for that settlement day. Partners provide a bank or mobile-money
provider, account name, and account number in the partner dashboard. Admins
review requests under **Partner Payouts** and mark them paid or rejected;
rejected requests release that day's earnings. Admin payout requests include a
saved earnings breakdown showing gross revenue, the commission rate and amount,
net partner earnings, and the amount requested for verification before payment.
