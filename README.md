# Designer Portfolio & Client Platform

A complete business platform for a working graphic designer — a public portfolio,
a private client workspace, a project management dashboard and an AI-assisted
admin, in one application.

```
Visitor      →  browse work, read services, send a full design brief
Client       →  private thread with the studio, project tracking, approve or revise designs
Designer     →  portfolio, clients, projects, messages, files, analytics, AI assistant, feature manager
```

---

## Quick start

```bash
npm install                 # installs both workspaces
cp .env.example .env        # then edit the secrets
npm run seed                # demo portfolio, a client, a project and 30 days of analytics
npm run dev                 # http://localhost:5173
```

The API runs on `:4000`; Vite proxies `/api` and `/socket.io` to it, so the browser
sees a single origin in development exactly as it will in production.

Every connector (email, payments, AI) is optional — the platform runs fully
without any of them and degrades to something sensible. See
[DEPLOYMENT.md](DEPLOYMENT.md) to switch them on.

**Seeded accounts** (change them before deploying):

| Role   | Email                     | Password        |
| ------ | ------------------------- | --------------- |
| Admin  | `admin@designer.studio`   | `ChangeMe!2024` |
| Client | `client@example.com`      | `ClientDemo123` |

Admin lives at `/admin`, the client dashboard at `/dashboard`.

### Production

```bash
npm run build      # compiles the API and bundles the client
npm start          # one process serves the API and the built SPA on $PORT
```

`NODE_ENV=production` refuses to start unless `JWT_ACCESS_SECRET` and
`JWT_REFRESH_SECRET` are set to strong values. Generate them with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Or run the container, which does the build for you:

```bash
docker compose up --build
```

**[DEPLOYMENT.md](DEPLOYMENT.md)** covers Docker, Render (one-click blueprint),
Fly.io and a plain VPS, plus how to wire up each connector.

---

## Architecture

```
designer-platform/
├── server/                        Node + Express + TypeScript API
│   └── src/
│       ├── config/env.ts          typed, validated environment
│       ├── db/                    schema.sql · migrations · bootstrap · seed
│       ├── lib/                   tokens, cookies, password hashing, rate limits, validation, audit log
│       ├── middleware/            auth (attach/require), central error handling
│       ├── routes/                one router per domain
│       ├── services/              settings, storage, messaging, analytics, notifications, features
│       │   ├── ai/                provider · studio context · tool registry · assistant
│       │   ├── email/             transport (Resend / SMTP) · templates · send + log
│       │   └── payments/          money · Stripe · Paystack · method registry
│       └── realtime/              Socket.IO: rooms, presence, typing
└── client/                        React 18 + Vite + TypeScript + Tailwind
    └── src/
        ├── components/            ui kit · layouts · messaging · shared widgets
        ├── context/               auth · theme · settings · notifications · toasts
        ├── pages/public|auth|client|admin
        ├── hooks/                 SEO metadata, scroll reveal
        └── lib/                   API client, socket, formatters, types
```

The four surfaces — public site, client app, admin app, API — are separate route
trees with their own layouts and guards, sharing one component library. No file
holds more than one concern.

**Stack.** React 18 · Vite 6 · TypeScript · Tailwind CSS · Express · Socket.IO ·
SQLite (better-sqlite3, WAL, foreign keys enforced) · Zod · JWT + rotating refresh
sessions · scrypt password hashing.

### On the database

The schema in `server/src/db/schema.sql` is ordinary relational SQL — UUID text
primary keys, real foreign keys with `ON DELETE` rules, check constraints and
indexes — deliberately written to port to PostgreSQL with only dialect changes
(`datetime('now')` → `now()`, `INTEGER` booleans → `BOOLEAN`). SQLite is the
default because it needs no service to run and comfortably handles a single
designer's studio; the data layer is isolated in `server/src/db` and
`server/src/services`, so swapping the driver does not touch any route.

---

## What is built

### Public site
Homepage with a live hero (drifting gradients, a fanned project stack, scroll
reveals), a statistics strip, featured work, a services preview, the process, an
optional testimonials block and a closing call to action — every section
toggleable from the admin. Portfolio with category chips, search, sorting and
pagination (3 columns on desktop, 2 on tablet, 1 on mobile). A full project page
per piece with hero artwork, gallery lightbox, tools, designer notes and
*Request Similar Design*. Services, About and Contact pages driven entirely by
admin settings.

### Project requests
A long-form brief — type, budget, deadline, style, brand, colours, dimensions,
audience, description — plus drag-and-drop reference uploads and a separate
"example of the style you want" section. Visitors can send one without an
account; signed-in clients get it linked to their dashboard automatically.

### Private messaging
One thread per client, and only ever with the studio. Real-time delivery, typing
indicators, online presence, read receipts, image and design-file attachments,
in-thread search, soft delete, and a report action. Client-to-client messaging
does not exist in the data model, not just in the UI.

### Client dashboard
Overview, messages, projects, requests, files, notifications, profile and
settings. Each project shows a five-stage timeline — request received →
discussion → designing → review → completed — with progress, delivered designs,
project files and designer notes. When a design arrives the client can
**Approve** it or **Request Revision** with text and marked-up screenshots.

### Admin dashboard
Dashboard, portfolio, projects, clients, messages, requests, files, services,
categories, analytics, Designer's AI, feature manager, activity log and website
settings. Portfolio pieces are added and published without touching code, with
drag-and-drop artwork, gallery, tools, featured flag and per-project SEO. The
messaging centre is a three-pane workspace: conversations, thread, and live
client context. Analytics charts views, requests, message activity, completions,
top projects, category performance and project stage mix, all dependency-free
inline SVG.

### Pricing, invoices and payments
Every service carries one of three pricing modes, set from the admin with no
code: a **fixed price** the studio can invoice immediately, a **starting-from**
price for work that needs a quote, or a **custom quote** that shows "Contact for
pricing" publicly. Invoices are raised against a client or project — picking a
fixed-price service fills the amount in — then sent, paid and reconciled.

Money is stored in minor units as integers, so no total is ever subject to
floating-point drift, and zero-decimal currencies are handled correctly.

Three ways to get paid, chosen per invoice:

- **Stripe** — a hosted checkout page, so card details never touch this site and
  the platform stays out of PCI scope.
- **Paystack** — cards, transfer and USSD for Nigeria, Ghana, South Africa,
  Kenya and Egypt, where Stripe cannot settle to a local account.
- **Direct bank transfer** — no provider, no fees, no key. The studio's account
  number goes on the invoice, visible only to the client it is addressed to, and
  the designer confirms receipt with one click.

Provider webhooks are the only public write endpoints in the app. Each verifies
its signature against the raw request body before reading anything from the
payload, and every accepted event id is stored behind a unique index, so a
forged call cannot mark an invoice paid and a replay is a no-op.

### Connectors
`Admin → Connectors` is the single place to see what the platform is wired up
to: what is configured, what is switched on, which environment variables each
one reads, where to get a key, and the webhook URLs to paste into a provider
dashboard. Email and payment credentials can be tested from the page — a real
message is sent and a real session created, so "configured" means proven rather
than assumed.

The screen reports booleans and variable *names* only. No key, or any prefix of
one, ever leaves the server.

### Transactional email
Welcome, password reset, new project request, new message, project status
change, design delivered, revision requested, invoice issued and payment
received — all as one inline-styled, single-column template that survives real
mail clients. **Resend** is the recommended transport (one key, nothing to run,
domain authentication that keeps mail out of spam); any **SMTP** server works as
an alternative. With neither configured, messages are recorded in `email_log` as
`skipped` and nothing breaks.

Sending never blocks the request that triggered it: a mail outage cannot fail a
sign-up or a message. Per-event switches live in `Admin → Settings → Email`, and
password reset ignores them — being locked out of your own account is not an
opt-in notification.

### Designer's AI
An admin-only assistant that knows the studio: portfolio counts, categories, most
viewed work, services, homepage sections and installed features. It drafts client
replies, project and service descriptions, design briefs, marketing copy, social
captions, SEO metadata, and summarises conversations and requests.

---

## AI safety model

The assistant has **no database access, no shell, and no ability to run code.**
It can only propose calls to an allow-listed tool registry
(`server/src/services/ai/tools.ts`), and nothing runs until an administrator
approves it:

1. **Fixed tool surface** — `createFeature`, `updateFeature`, `enableFeature`,
   `disableFeature`, `removeFeature`, `createPortfolioCategory`,
   `removePortfolioCategory`, `updateContent`, `updatePageSection`, `createPage`.
   Each is classified `read`, `write` or `dangerous`.
2. **Unknown actions are dropped** before the plan is ever shown, and re-checked
   again at execution time.
3. **Approval is required.** The plan, its per-step inputs and its risk level are
   rendered for review; only then does it run — inside one transaction, so a
   failure halfway leaves nothing half-applied.
4. **New features are created disabled**, so the live site never changes until the
   designer flips the switch.
5. **Everything is logged** to `ai_actions` and `activity_logs`, and most changes
   carry an undo payload that reverses them in one click.
6. **The provider key never leaves the server.** `ANTHROPIC_API_KEY` is read from
   the server environment only; the browser never holds it and never calls the
   provider. With no key configured the assistant falls back to local heuristics
   built from studio data, so every screen still works.

---

## Feature manager

`Admin → Feature Manager` lists every feature with its name, description,
status, category, version, creation date and author. Features can be enabled,
disabled, configured (JSON), previewed in version history and restored to any
earlier snapshot. Core platform features can be disabled but not deleted. The
public site reads enabled feature keys and renders conditionally, so the product
expands without a rebuild.

---

## Security

- **scrypt** password hashing with per-password salts; strength enforced server-side.
- **Short-lived JWT access tokens** in `httpOnly` cookies plus **rotating refresh
  sessions** stored as SHA-256 digests — a presented refresh token is single-use.
- **Role-based access control** (`visitor` / `client` / `admin`) enforced on every
  route; the user record is re-read on each request so blocking an account ends
  its sessions immediately.
- **Row-level authorisation**: a client can only reach their own conversation,
  projects, requests and files, verified server-side rather than by hiding UI.
- **Upload validation** on both extension *and* content type, with a size limit,
  a per-viewer ACL on every read, and `Content-Disposition: attachment` plus
  `nosniff` for SVG so uploaded markup cannot execute on the origin.
- **Zod validation** on every request body and query; all SQL uses bound parameters.
- **Rate limiting** per endpoint (login, registration, password reset, requests,
  uploads, messaging, AI) with a global ceiling on top.
- **Signed webhooks**: raw-body signature verification (Stripe's scheme, and
  Paystack's HMAC-SHA512 compared in constant time) plus replay protection via a
  unique index on every processed event id.
- **Credentials stay server-side**: mail, payment and AI keys are read from the
  environment in one module, never written to the settings table, never returned
  by an API and never sent to the browser.
- Security headers, a strict CORS allow-list, and an append-only audit log.

Password reset has no mail transport wired up: in development the token is
returned so the flow is testable, and `server/src/routes/auth.routes.ts` marks
the single place to send a real email in production.

## Performance

Route-level code splitting (a visitor never downloads the dashboards), a pinned
vendor chunk, lazy images with explicit aspect ratios to prevent layout shift,
paginated portfolio queries with covering indexes, daily analytics rollups
instead of per-event scans, immutable caching for hashed assets and public
artwork, and `no-store` for private files.

## SEO

Server-rendered per-route metadata (`/api/seo/meta`) drives titles, descriptions,
canonical URLs, Open Graph and Twitter tags and JSON-LD; every portfolio project
carries its own. `/sitemap.xml` is generated from published work and
`/robots.txt` keeps `/admin`, `/dashboard` and the API out of the index.

## Accessibility & responsiveness

One codebase for every screen: a hamburger sheet and a five-tab bottom bar on
phones, a two-column grid on tablets, a persistent sidebar on desktop. Focus is
visible for keyboard users, dialogs trap escape and lock scroll, live regions
announce toasts, `prefers-reduced-motion` disables animation, and the message
composer stays reachable above the mobile keyboard. Light, dark and system themes
are applied before first paint and remembered per browser.

---

## Scripts

| Command                | Does                                          |
| ---------------------- | --------------------------------------------- |
| `npm run dev`          | API and client together with hot reload       |
| `npm run build`        | Compile the API, bundle the client            |
| `npm start`            | Serve API + built client from one process     |
| `npm run seed`         | Add demo content (`-- --reset` rebuilds it)   |
| `npm run typecheck`    | TypeScript across both workspaces             |
| `docker compose up`    | Run the production image locally              |

## Deploying

One process serves the API and the built client, so there is no separate
frontend host. `Dockerfile`, `docker-compose.yml`, `render.yaml` and `fly.toml`
are all in the repository, and CI typechecks, builds, boots the server and
builds the image on every push.

Keep `server/data` and `server/uploads` (or `/data` in the container) on a
persistent volume — they hold the database and every uploaded file.

**Read [DEPLOYMENT.md](DEPLOYMENT.md)** for the full walkthrough: the pre-launch
checklist, all four hosting paths, connector setup, backups, health checks and
what to change first when the studio outgrows a single box.
