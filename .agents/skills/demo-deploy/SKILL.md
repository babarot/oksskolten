---
name: demo-deploy
description: Build and deploy the demo site to Cloudflare Workers manually
user_invocable: true
---

Manually build and deploy the demo site to Cloudflare Workers.
Use this when Cloudflare Builds (CI) fails or when you need to deploy immediately without pushing.

## Steps

1. Build the demo site locally
2. Deploy to Cloudflare Workers via wrangler
3. Verify the deployment

## Commands

```bash
# 1. Build
npm run build -- --mode demo

# 2. Deploy
npx wrangler deploy

# 3. Verify
npx wrangler deployments status
```

## Notes

- The worker name is `oksskolten-demo` (defined in `wrangler.toml`)
- Assets are served from `./dist` as an SPA
- Requires `wrangler login` to have been run beforehand
- If wrangler commands fail with 502 or auth errors, check https://www.cloudflarestatus.com/ for ongoing incidents
