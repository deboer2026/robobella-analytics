# robobella-analytics
RoboBella social media analytics dashboard

## Cloudflare Pages callback deployment

The existing `robobellaanalytics` Pages project is a Direct Upload project. The
TikTok callback route is implemented by the root-level
`functions/tiktok/callback.js` Pages Function. Dashboard drag-and-drop uploads
must not be used for releases that need this route, because they do not deploy
Pages Functions.

After a reviewed change is merged to `main`, run the guarded deployment from a
clean, current checkout:

```powershell
node scripts/deploy-pages-production.cjs --confirm-existing-production
```

The script verifies the repository, current `main` HEAD, exact existing Pages
project/domain, Direct Upload project type, and an existing Production
deployment before staging only the site's public root assets. It runs the
pinned Wrangler CLI from the repository root so the root `functions/` tree is
compiled with those assets. It does not create a Pages project or change the
domain. A no-query request to `/tiktok/callback` is then checked for the
Function's expected `400 Invalid OAuth callback` response and privacy headers;
a static `200` response fails the smoke check.

The smoke helper defaults to no target. Its `--live-production` mode is only
invoked by the explicitly confirmed deployment script; `--local-url` accepts
loopback HTTP targets only. Never place OAuth callback parameters in a route
smoke request.
