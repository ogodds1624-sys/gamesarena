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

Approved Instant Virtual payments now open `/virtual-scan`. Users select or
drop a PNG, JPEG, or WebP screenshot (maximum 5 MB), preview it, and submit it
to Anthropic for visible-match/odds transcription.
This is not a game-outcome predictor. Personal details should be cropped out
before uploading. Images are not stored by Games Hub; result text is stored in
`virtual_scans` for idempotent retries. Anthropic's own data policies also apply.

The scanner UI stays hidden until the server verifies a confirmed Instant
Virtual payment for the signed-in account. Direct visits without approval go
back to the pending payment's confirmation checkout, or to credit packages when
there is no pending payment. Aviator payments do not unlock the scanner.

The existing TanStack Start backend handles `POST /api/scan-image`; no separate
Express server is needed. The official `@anthropic-ai/sdk` is a server-only
dependency. Run `npm install` after pulling these changes, apply migrations with
`npm run db:migrate` on a configured Postgres database, and restart the server.
Embedded local PGlite applies migrations automatically.

Configure these **server environment variables** (never `VITE_` variables):

```dotenv
ANTHROPIC_API_KEY=your-private-anthropic-key
ANTHROPIC_MODEL=claude-sonnet-5-5
```

Use a currently available vision model from your Anthropic account; the model
is configurable to avoid dependence on retired IDs such as Claude 3.5 Sonnet.
Set the variables in your deployment environment or local server environment.
Do not put a key into browser code, commit it, or send it in chat.
Without a key the endpoint returns an explicit setup error and uses no credits.

The endpoint requires a same-origin request, an authenticated non-blocked Ghana or Nigeria
account, completed connection, an approved virtual-credit payment, and an
available credit. It validates image signatures and bounds the streamed request
body. Only one scan may run per user, with 20 attempts per hour. Provider calls
time out after 60 seconds and are not automatically retried.

`0013_virtual_scans.sql` saves successful analysis and deducts **one credit
atomically**, only after usable results are returned. Failed/unreadable images
use no credit. A browser-generated request UUID ties retries to the same image
hash and saved result, preventing duplicate charges. A lost response can be
retried using the same selection; after a definite failed scan, select the
image again to create a new request. Abandoned scans expire after two minutes.
The homepage no longer spends credits on decorative random reels.

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
