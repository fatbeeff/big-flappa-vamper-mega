# Multi-platform wallet launch

## Decision

Vamp follows the Source Token's launch platform:

- Partial-holder Flap sources use the extension-owned Flip Tax composer.
- PONS sources use an extension-owned composer that calls the official V2 contracts.
- Long.xyz sources hand off copied metadata to `app.long.xyz/create` only when metadata needs correction.

Every transaction is submitted by the Operator's injected EIP-1193 wallet. The extension does not import, persist, or sign with private keys.

PONS and Long pairing assets are never copied from the Flap BNB Chain registry. PONS preserves the source token's Robinhood pair when inspection data is available and verifies that it remains approved at launch time. Long's official form remains authoritative for market selection.

## Minimal destination fields

PONS copies name, ticker, description, image, website, X, and Telegram. The default launch uses configuration `0`, a `0.1` creator purchase in the selected pair asset, zero creator tax, buyback off, and no extra snipe exemptions. Creator purchase is visible in the quick path and editable per launch; pair, creator tax, and buyback are advanced settings. Current economics are pinned with `previewLaunchEconomics` immediately before launch. The image is uploaded through PONS's IPFS endpoint. A nonzero creator purchase uses PONS's verified launch-and-buy forwarder so the signing wallet launches and buys atomically with a 2% minimum-output guard. Zero uses the direct factory path. ERC-20 pairs receive an exact approval only when allowance is insufficient. Holder sharing then uses `createFor(token)` and `transferCreatorFeeRecipient(token, distributor)`.

Long keeps pairing asset, fee receiver, name, ticker, image, optional links, and optional description. The description limit is 100 characters.

## Sources

- https://www.ponsfamily.com/launchpad/create
- https://github.com/ponsdotdev/ponsfamily
- https://app.long.xyz/create
