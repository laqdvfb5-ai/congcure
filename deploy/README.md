# Ubuntu deployment

Production uses PostgreSQL on loopback, Node.js 24, Caddy, and two systemd services.

- Domains: `congcure.shop` and `www.congcure.shop`; both DNS A records: `160.187.246.148`.
- `www.congcure.shop` redirects to `https://congcure.shop`, preserving the request URI.
- Releases: `/opt/congcure/releases/<revision>`; active symlink: `/opt/congcure/current`.
- Environment: `/etc/congcure/app.env`, readable only by root and the application group.
- Images: `/var/lib/congcure/products`, independent of releases.
- Services: `congcure-web`, `congcure-worker`, `postgresql`, `caddy`.
- Webhook: `https://congcure.shop/api/webhooks/bank`, authorization `Apikey <WEBHOOK_TOKEN>`.

Install the service files into `/etc/systemd/system/` and the Caddyfile into
`/etc/caddy/Caddyfile`. Caddy obtains and renews HTTPS certificates automatically
once DNS points here and TCP ports 80/443 are reachable. The HTTP IP address is
only a temporary preview; production login cookies require HTTPS.

The app environment must include `NODE_ENV=production`, `DATABASE_URL`, a random
32-byte base64 `SECRET_KEY`, a random `WEBHOOK_TOKEN`,
`PRODUCT_IMAGE_DIR=/var/lib/congcure/products`, `BANK_ID`, `BANK_ACCOUNT`, and
`BANK_ACCOUNT_NAME`. Leave bank values empty until real details are available.
Never use the development seed in production.

For the first deployment, the core script `bootstrap-production.ts` imports a
private JSON document containing an admin account, categories, suppliers and API
products through the existing core APIs. It requires an empty database. Remove
the document after importing; it contains credentials. Copy referenced product
images into persistent storage. No development users, balances, orders or queue
jobs are imported.

Build a new release as the `congcure` user with the environment loaded:

```bash
npm ci --no-audit --no-fund
npm run db:migrate
NODE_OPTIONS=--max-old-space-size=1024 npm run build -w @web12/web
```

After a successful build, update the `current` symlink and restart both app
services. Keep the previous release for rollback. Database migrations may need
their own rollback plan. Inspect status and logs with:

```bash
systemctl status congcure-web congcure-worker caddy
journalctl -u congcure-web -u congcure-worker -n 100 --no-pager
```

Direct bank checkout requires migration `002_bank_payments.sql`. Back up the
database before migrating; this migration adds tables/columns and preserves
existing wallet orders. Restart the worker with the web release so pending
bank payments expire and partial transfers return to the wallet. SePay must
forward both `NAP` and `DH` transfer memos; leave code filtering disabled unless
both patterns have been configured. Never simulate successful bank receipts on
production: paid API orders can immediately spend the supplier balance.

Back up PostgreSQL, `/etc/congcure/app.env`, and `/var/lib/congcure/products`
together. Losing `SECRET_KEY` makes stored supplier and account secrets unreadable.
Keep an additional backup outside this VPS.
