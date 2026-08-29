# TikTok Production Review remediation

## Implemented E2E design (pending deployment)

GitHub Pages is the user-facing interface and the existing Apps Script Web App
is the OAuth/API backend. Selecting **TikTokと接続** opens the Apps Script
endpoint, which creates an opaque, single-use session and state value. The
client secret and TikTok access token are used only in Apps Script.

After TikTok returns to the Apps Script redirect URI, Apps Script validates
the state, exchanges the code, retrieves the authorized user's information
and public videos, and returns the user to this GitHub Pages URL with only an
opaque short-lived session identifier. GitHub Pages embeds a short-lived Apps
Script bridge iframe. Each bridge load receives a fresh 256-bit channel nonce.
The bridge consumes the session once and sends the profile and video data to
the fixed `https://deboer2026.github.io` top-level window using `postMessage`.
The page accepts a message only when its actual Apps Script runtime origin,
session ID, channel nonce, and allowed message type all match.

Before a Sandbox demonstration, deploy the reviewed Apps Script source to the
existing fixed Web App deployment, then ensure the TikTok Developer Portal
redirect URI exactly matches that Web App `/exec` URL. Do not put any token,
client secret, or session payload in the GitHub Pages repository.

## Pre-implementation audit (2026-08-29)

Before this implementation, the registered Web URL was a static policy and
product-description site. It had no TikTok connect control, OAuth callback,
or connected-account UI, and its TikTok card said that the integration was
being prepared.

The separate `robobella-analytics-appscript` repository contains Sandbox
helpers, but they are not exposed through its dashboard UI:

| Requested scope | Existing server-side use | Visible product UI |
| --- | --- | --- |
| `user.info.basic` | `/v2/user/info/` requests `open_id` | No |
| `user.info.profile` | `/v2/user/info/` requests avatar, display name, username, profile link and bio | No |
| `user.info.stats` | `/v2/user/info/` requests follower, following, likes and video counts | No |
| `video.list` | `/v2/video/list/` requests public-video metadata and metrics | No |

The helper functions are `createTikTokSandboxAuthorizationUrl`,
`exchangeTikTokSandboxAuthorizationCode`, `testTikTokSandboxUserInfo`, and
`testTikTokSandboxVideoList` in that separate Apps Script project. They
store the authorization code and tokens in Script Properties and require
manual execution; the callback only shows a confirmation page.

## Remaining manual work before recording

The GitHub Pages UI now provides a normal **TikTokと接続** control and renders
the connected account identity, profile, statistics, and public videos. The
Apps Script callback is deliberately server-side so that client secrets and
tokens never enter GitHub Pages. Before recording, manually verify the
Developer Portal redirect URI, Apps Script Script Properties, and Sandbox
account data. No requested scope is unused by the implemented UI.

## Demo-video script after the blocker is resolved

Record a single continuous Sandbox session on
`https://deboer2026.github.io/robobella-analytics/` (or first update the
Developer Portal URL to the actual deployed domain).

| Time | User interaction and proof |
| --- | --- |
| 00:00 | Open the registered domain; show the RoboBella Analytics name and app icon. |
| 00:05 | Select **Connect TikTok**. |
| 00:10 | Show TikTok Login Kit's Sandbox authorization screen and grant the requested access. |
| 00:20 | Show the return to RoboBella Analytics on the same registered domain. |
| 00:25 | Show connected account ID/basic identity (`user.info.basic`) and display name, username, avatar, bio or profile link (`user.info.profile`). |
| 00:38 | Show follower, following, likes, and video counts (`user.info.stats`). |
| 00:50 | Open the public-video list and show its titles/covers and performance fields (`video.list`). |
| 01:05 | Open Privacy Policy and Terms of Service; show the same top-of-page app icon and the browser-tab favicon. |

Do not show source code, Script Properties, credentials, tokens, or manual
server-side function execution in the video.
