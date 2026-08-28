# Show Long.xyz authenticity on GMGN Robinhood

## Scope

Show Long.xyz's verdict on GMGN Robinhood Trenches cards and token detail headers when GMGN provides an exact `app.long.xyz/tokens/<address>` link. Do not add launch controls to Robinhood surfaces.

## Behavior

- Render `CHECKING LONG` while a request is pending.
- Render green `VERIFIED LONG` only when Long returns `authentic`.
- Render red `NOT LONG` only when Long returns `fake`.
- Render neutral `LONG CHECK FAILED` for blocked requests, timeouts, malformed responses, missing relay tabs, and unknown verdicts.
- Use Long's failure messages only as tooltip detail for a `fake` verdict.
- Reuse the quote icon already present in the GMGN card or detail header. Fall back to Long's linked icon when GMGN has no quote image.
- Remove or retarget badges when GMGN recycles a card or changes routes.

## Performance and caching

- Inspect no more than 36 visible targets per scan.
- Make no Long request outside Robinhood routes.
- Store authoritative verdicts for one hour.
- Store unavailable results for 30 seconds, then allow a retry.
- Skip storage reads and network messages when the in-memory entry remains fresh.
- Do not request another image for the badge.

## Trust boundary

Validate exact EVM addresses in the content script, service worker, and relay. Normalize the response before rendering. Fee-recipient, developer, and other heuristics cannot change Long's verdict or badge color.

The page-origin relay and browser credential policy live in ADR 0007.
