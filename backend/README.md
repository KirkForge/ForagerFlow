# ForagerFlow Sync Backend

Cloudflare Worker providing optional account sync for identification history.

## Endpoints

- `POST /sync` — upsert history entries (authenticated)
- `GET /sync` — fetch all history entries for the user
- `GET /health` — health check

## Development

```bash
pnpm --filter @foragerflow/backend typecheck
pnpm --filter @foragerflow/backend test
```

## Deployment

```bash
cd backend
wrangler secret put SYNC_TOKEN
wrangler kv:namespace create FORAGERFLOW_KV
wrangler deploy
```

The `SYNC_TOKEN` secret must be set before deployment. The KV namespace ID in `wrangler.toml` must be replaced with the one created by `wrangler kv:namespace create FORAGERFLOW_KV`.