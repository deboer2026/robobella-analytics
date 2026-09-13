# TikTok Content Posting review remediation

## Review status

The public-domain draft-upload surface and its Sandbox Apps Script backend
are implemented in the review branches for this change. The flow remains
`REVIEW_UI_BLOCKER` until the branches are merged, the reviewed Apps Script
source is deployed to the existing Sandbox Web App deployment, and a real
Sandbox E2E run on the public domain succeeds. No Production `video.upload`
scope or Production deployment is changed by this implementation.

## Product flow

RoboBella Analytics is a creator-facing analytics and draft-delivery tool for
TikTok creators who authorize their own accounts or accounts they are allowed
to manage. The connected creator identity is obtained from TikTok and is not
hard-coded. The public site provides:

1. TikTok Login Kit connection for the authorized creator.
2. A visible **TikTok Draft Upload** section.
3. A local video picker, selected-file summary and explicit consent checkbox.
4. A single **Upload to TikTok as draft** action.
5. Sanitized preparation, upload and processing states.
6. An Inbox instruction after TikTok reports that the draft is ready.

The draft is not published automatically. The creator opens the TikTok Inbox,
reviews and edits the draft, and completes publication manually in TikTok.
Direct Post is not part of this flow.

## Scope mapping

| Scope | Product use | User-visible proof |
| --- | --- | --- |
| `user.info.basic` | Identify the authorized creator account | Connected creator name/username |
| `user.info.profile` | Display profile details and profile link | Creator profile panel |
| `user.info.stats` | Display follower and engagement statistics | TikTok statistics panel |
| `video.list` | Display public-video metadata and metrics | Recent TikTok videos |
| `video.upload` | Transfer an explicitly selected local video to the creator's Inbox as a draft | TikTok Draft Upload section and Inbox instruction |

The implementation does not request or use `video.publish` and does not
offer a Direct Post control.

## Security boundary

GitHub Pages is the visible product UI. The existing Apps Script Web App is
the OAuth and Content Posting backend. Apps Script receives the selected file
through an HTML-Service form Blob and transfers it transiently; the browser
does not receive an access token, authorization code, upload URL, upload
token, raw provider response, open ID or publish ID.

After Sandbox authorization, Apps Script creates a cryptographically random,
short-lived capability in server-side CacheService. It is bound to the
authorized creator and `video.upload`, can initialize only one upload, and is
not a reusable credential. A separate short-lived opaque job ID is used for
status polling. Terminal jobs purge the cached token and publish context.

The initial web-review file limit is 40,000,000 bytes. Supported types are
`video/mp4`, `video/quicktime` and `video/webm`. Invalid, empty or oversized
files are rejected before TikTok network activity. The one-chunk upload uses
`FILE_UPLOAD`; redirects are disabled and the upload host is checked against
the documented strict TikTok allowlist.

## Demo storyboard

Record one continuous Sandbox session at
`https://deboer2026.github.io/robobella-analytics/` after deployment and
manual redirect-URI verification:

| Step | Proof to show |
| --- | --- |
| 1 | Open the public RoboBella Analytics site. |
| 2 | Open the TikTok connection area and choose **Connect TikTok for draft upload**. |
| 3 | Complete Login Kit authorization without showing codes, tokens or secrets. |
| 4 | Return to the site and show the connected creator identity. |
| 5 | Select one supported local video and show its filename and size. |
| 6 | Check the explicit consent and choose **Upload to TikTok as draft**. |
| 7 | Show only `PREPARING`, `UPLOADING`, `PROCESSING` and the final sanitized state. |
| 8 | Open the authorized creator's TikTok Inbox and open the received draft. |
| 9 | Show the editing screen, but do not press the public publish control. |
| 10 | Show the visible Privacy Policy and Terms of Service links. |

Suggested narration: “RoboBella Analytics helps authorized TikTok creators
review performance and send a selected video to TikTok as a draft. The draft
is not published automatically. I review and publish it manually in TikTok.”

## Policy disclosure

The public Privacy Policy and Terms of Service disclose that the creator
selects the media explicitly, the media is processed transiently for transfer,
credentials remain server-side, temporary upload/session data is short-lived,
and final publication happens manually in TikTok. The public pages retain
visible links to both policies.

## Post-approval gate

After TikTok approves `video.upload`, the follow-up release must separately
verify the returned Production scope, exact authorized account binding and
one reviewed Production candidate. The release may perform at most one init
and one PUT, then status-only polling until `SEND_TO_USER_INBOX`, followed by
mobile Inbox confirmation. Production hard stop remains enabled until that
gate is explicitly reviewed. Direct Post remains out of scope.

Do not record source code, Script Properties, credentials, OAuth values,
capability IDs or raw provider responses in a review video.
