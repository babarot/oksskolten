---
name: demo-status
description: Check demo site deployment status and troubleshoot build failures
user_invocable: true
---

Check the current deployment status of the demo site and troubleshoot issues.

## Steps

1. Check the latest deployment status
2. If issues are found, check Cloudflare system status
3. Provide troubleshooting guidance if needed

## Commands

```bash
# 1. Current deployment
npx wrangler deployments status

# 2. Recent deployment history
npx wrangler deployments list

# 3. Check Cloudflare status (if API errors occur)
# Fetch https://www.cloudflarestatus.com/ and report any active incidents
```

## Troubleshooting: Build token errors

If Cloudflare Builds fails with "build token has been deleted or rolled":

1. Go to Cloudflare Dashboard → Workers → `oksskolten-demo` → Settings → Builds
2. Click the edit icon next to "API Token"
3. Select "Create a new token" to create a new token
4. Save and retry the build

This is often caused by Cloudflare API incidents rather than actual token expiry.
As a workaround, use `/demo-deploy` to deploy manually from local.
