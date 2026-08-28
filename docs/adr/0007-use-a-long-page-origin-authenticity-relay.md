# Use a Long page-origin authenticity relay

- Status: accepted
- Date: 2026-08-27

## Context

GMGN links some Robinhood tokens to Long.xyz, and Operators need Long's authenticity verdict while scanning Trenches cards and token detail pages. Direct requests from the Manifest V3 service worker receive HTTP 403 responses. Long's web application can call the same endpoint from its own page origin.

The Long frontend uses a public browser credential. The extension must ship that value to reproduce the frontend request, but it must not log, document, or reuse it outside the relay.

## Decision

Run a narrow content-script relay on `app.long.xyz`. The service worker reuses an existing Long tab or opens an inactive temporary tab, sends validated Robinhood addresses to the relay, and closes only the temporary tab it created.

Accept only exact EVM addresses and normalize all responses at the extension boundary. Long's `authentic` verdict renders green, and Long's `fake` verdict renders red. Timeouts, blocked requests, malformed responses, missing tabs, and other transport failures render a neutral unavailable state.

Cache authoritative verdicts for one hour and failed checks for 30 seconds. Reuse GMGN's existing quote icon in the badge so the inspector creates no image request.

## Consequences

The extension declares access to Long's application host. The relay calls the API under the page's CORS policy, so the extension does not request direct API host access. A cold check may open an inactive Long tab for several seconds. Existing Long tabs remain open and unchanged.

The public browser credential remains visible to anyone who inspects the packaged extension, as it is in Long's frontend. Reviewers and automated scans should allow that one value only in its required source location. The extension must never treat possession of the credential as proof of authenticity.
