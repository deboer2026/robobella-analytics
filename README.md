# robobella-analytics
RoboBella social media analytics dashboard

## Cloudflare Pages callback deployment

The existing `robobellaanalytics` Pages project is a Direct Upload project. The
TikTok callback route is implemented by the root-level
`functions/tiktok/callback.js` Pages Function. Dashboard drag-and-drop uploads
must not be used for releases that need this route, because they do not deploy
Pages Functions.

After a reviewed change is merged to `main`, run the guarded deployment from a
clean, current checkout in PowerShell:

```powershell
.\scripts\deploy-pages-production.ps1 -ConfirmExistingProduction
```

The PowerShell wrapper performs the fresh `origin/main` read in the parent
shell, then passes only the public commit SHA and its timestamp to Node. The
Node deploy guard validates that proof against local `HEAD` and rejects missing,
stale, malformed, or mismatched proof. This keeps network Git reads out of the
Node child-process boundary that can fail on Windows. The Node script then
verifies the repository, clean `main` checkout, exact existing Pages
project/domain, Direct Upload project type, and an existing Production
deployment before staging only the site's public root assets. It runs the
pinned Wrangler CLI from the repository root so the root `functions/` tree is
compiled with those assets. It does not create a Pages project or change the
domain. A no-query request to `/tiktok/callback` is then checked for the
Function's expected `400 Invalid OAuth callback` response and privacy headers;
a static `200` response fails the smoke check. Direct Node invocation without
the fresh PowerShell proof fails closed.

The smoke helper defaults to no target. Its `--live-production` mode is only
invoked by the explicitly confirmed deployment script; `--local-url` accepts
loopback HTTP targets only. Never place OAuth callback parameters in a route
smoke request.
