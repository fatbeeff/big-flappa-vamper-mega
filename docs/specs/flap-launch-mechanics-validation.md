# Flap Launch Mechanics validation boundary

Verified 2026-08-05 against Flap's official developer documentation and launcher:

- New tax-token integrations use `Portal.newTokenV6` with `TOKEN_TAXED_V3`; tax tokens use the V2 migrator. Buy and sell rates are independent basis-point values, and at least one must be positive.
- The official launcher exposes buy and sell tax controls from 0% through 10%. The extension therefore accepts 0–10% with basis-point (0.01%) precision.
- Standard non-vault tax allocation is `mktBps + deflationBps + dividendBps + lpBps`, and the Portal requires the four values to total exactly 10,000 basis points.
- When `dividendBps` is positive, `NewTokenV6Params` also requires a dividend token and minimum share balance. V1 uses one fixed policy: dividends use the selected payment/quote asset and holder eligibility starts at 10,000 launch tokens, Flap's documented minimum. The validated domain value carries both choices explicitly for transaction encoding in Issue #8.
- A creator purchase may be zero. Its maximum is dynamic (quote asset, wallet balance, and launch curve), so Issue #7 validates a non-negative decimal and leaves amount conversion and the authoritative upper-bound preflight to Issue #8.
- Asset availability comes from the extension's cached registry. An absent or disabled asset is invalid and cannot be selected.
- Popup persistence, JSON import, stored-state loading, and the Launch Composer all use the same tax-mechanics invariant boundary. Invalid stored documents fall back to the valid bundled defaults rather than becoming an Active Template.

Sources:

- [Launch token through Portal](https://docs.flap.sh/flap/developers/token-launcher-developers/launch-token-through-portal)
- [Flap tax-token launcher](https://flap.sh/launch?chain=bnb&lang=en)
- [Portal vs VaultPortal](https://docs.flap.sh/flap/developers/basic-and-mechanism/portal-vs-vaultportal)

This boundary does not encode, sign, approve, or broadcast a transaction. Those checks belong to Issue #8, which must reverify the deployed ABI and dynamic creator-purchase limit before submission.
