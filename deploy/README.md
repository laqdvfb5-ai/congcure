# Ubuntu deployment

Production uses PostgreSQL on loopback, Node.js 24, Caddy, and two systemd services.

- Domain: `congcure.shop`; DNS A record: `160.187.246.148`.
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

Back up PostgreSQL, `/etc/congcure/app.env`, and `/var/lib/congcure/products`
together. Losing `SECRET_KEY` makes stored supplier and account secrets unreadable.
Keep an additional backup outside this VPS.
