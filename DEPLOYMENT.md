# Deploying

The whole platform is one Node process: it serves the API *and* the built
client. There is no separate frontend host to configure.

```
npm run build     # compiles the API and bundles the client
npm start         # serves both on $PORT
```

Two directories must survive a restart or redeploy:

| Path             | Holds                              |
| ---------------- | ---------------------------------- |
| `$DATA_DIR`      | the SQLite database                |
| `$UPLOAD_DIR`    | every uploaded file and image      |

On a platform with ephemeral disk (Heroku, plain Cloud Run, Vercel functions)
they vanish on every deploy — mount a volume, or move to managed Postgres and
S3 first. The Docker image mounts both under `/data`.

---

## Before you go live

1. **Generate real secrets.**
   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```
   Set `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` to two different values.
   The server refuses to boot in production without them.
2. **Set the public URL.** `PUBLIC_SITE_URL` and `CLIENT_ORIGIN` must both be
   your real `https://` origin — they drive cookies, CORS, SEO canonical URLs,
   the sitemap and every link inside an email.
3. **`COOKIE_SECURE=true`** once you are behind HTTPS.
4. **Change the seeded admin.** Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` before
   the first boot; the account is created from them, once.
5. **Do not run `npm run seed` in production** — it inserts demo content.

---

## Option 1 — Docker (anywhere)

```bash
cp .env.example .env      # fill in the secrets
docker compose up --build -d
docker compose logs -f app
```

The image is multi-stage: build tools are used to compile `better-sqlite3` and
then discarded, the final stage runs as the unprivileged `node` user, and a
`HEALTHCHECK` polls `/api/health`. Data lives in the named `studio-data` volume.

Back it up with:

```bash
docker run --rm -v studio-data:/data -v "$PWD:/backup" alpine \
  tar czf /backup/studio-backup-$(date +%F).tar.gz -C /data .
```

## Option 2 — Render (simplest managed path)

`render.yaml` is a ready blueprint: **New → Blueprint → pick this repo.** It
provisions the web service from the Dockerfile, attaches a 5 GB disk at `/data`,
generates both JWT secrets, and health-checks `/api/health`. Afterwards set
`PUBLIC_SITE_URL`, `CLIENT_ORIGIN`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` and any
connector keys in the dashboard. A persistent disk needs a paid instance type.

## Option 3 — Fly.io

```bash
fly launch --no-deploy                       # answer no to Postgres
fly volumes create studio_data --size 5 --region lhr
fly secrets set JWT_ACCESS_SECRET=… JWT_REFRESH_SECRET=… ADMIN_PASSWORD=…
fly deploy
```

`fly.toml` pins `min_machines_running = 1`: one SQLite volume can only have one
writer, so the app must not scale horizontally as configured.

## Option 4 — VPS

```bash
git clone … && cd Designer-Project
npm ci && npm run build
sudo cp deploy/designer-platform.service /etc/systemd/system/   # see below
sudo systemctl enable --now designer-platform
```

Put nginx or Caddy in front for TLS, proxying to `127.0.0.1:4000`. A minimal
unit file:

```ini
[Unit]
Description=Designer platform
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/srv/designer-platform
EnvironmentFile=/srv/designer-platform/.env
ExecStart=/usr/bin/node server/dist/index.js
Restart=always

[Install]
WantedBy=multi-user.target
```

---

## Connectors

Everything below is optional — the platform runs with none of them, and each
degrades to something sensible.

### Email — Resend (recommended)

1. Create a key at <https://resend.com/api-keys>.
2. Verify your sending domain (DNS records) or mail lands in spam.
3. Set `RESEND_API_KEY`.
4. In **Admin → Settings → Email**, set the from address to that domain.
5. **Admin → Connectors → Send test email** to prove delivery.

Prefer your own mail server? Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`,
`SMTP_PASSWORD` instead. With neither configured, emails are recorded in the
`email_log` table as `skipped` and nothing breaks.

### Payments — Stripe

1. Copy the secret key from <https://dashboard.stripe.com/apikeys>
   (`sk_test_…` while you are testing) into `STRIPE_SECRET_KEY`.
2. Add a webhook endpoint pointing at
   `https://your-domain/api/payments/webhook/stripe`, subscribed to
   `checkout.session.completed`.
3. Put its signing secret in `STRIPE_WEBHOOK_SECRET`.
4. Enable Stripe in **Admin → Settings → Payments**.

Test locally with the Stripe CLI:

```bash
stripe listen --forward-to localhost:4000/api/payments/webhook/stripe
```

### Payments — Paystack

Same shape, for Nigeria, Ghana, South Africa, Kenya and Egypt, where Stripe
cannot settle to a local account. Set `PAYSTACK_SECRET_KEY` and add a webhook
for `https://your-domain/api/payments/webhook/paystack` (`charge.success`).
Paystack signs with your secret key, so there is no separate webhook secret.

### Payments — bank transfer

No key, no fees, works everywhere. Enter your account details in
**Admin → Settings → Payments**; they appear on invoices you mark as
bank-transfer, visible only to the client that invoice is addressed to. You
confirm receipt with **Mark as paid**.

### AI

`ANTHROPIC_API_KEY` powers Designer's AI. Without it the assistant falls back to
local heuristics built from your own studio data, so every screen still works.

---

## After the first deploy

- Sign in at `/admin`, change the admin password immediately.
- **Admin → Connectors** shows what is live and what is missing.
- **Admin → Settings → Payments** — currency, bank account, invoice prefix.
- **Admin → Settings → Branding** — name, logo, colours, fonts.
- Check `https://your-domain/sitemap.xml` and `/robots.txt` resolve.
- Submit the sitemap to Google Search Console.

## Health and monitoring

`GET /api/health` returns `{ ok, env, time }` with no authentication — point
your platform's health check at it. Application errors are logged to stdout;
Docker, Render and Fly all capture that by default.

## Scaling notes

The current shape suits one designer and a few hundred clients comfortably.
Beyond that, in order of value:

1. Move file storage to S3-compatible object storage — reimplement
   `server/src/services/storage.service.ts` only.
2. Move the database to Postgres — `server/src/db/schema.sql` is written to port
   with dialect changes only, and no route touches SQL directly.
3. Only then does running more than one instance make sense; Socket.IO will need
   a Redis adapter at that point.
