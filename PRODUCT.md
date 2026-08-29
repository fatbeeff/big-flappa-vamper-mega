# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Operators who monitor tokens on GMGN and rapidly correct launches whose configurable fees do not reach holders.

## Product Purpose

GMGN Vamp redeploys a Source Token with its identity and public metadata preserved while routing 100% of the platform-configurable fee share to holders. The default path uses one action, one review screen, and the wallet confirmations required by the launch platform. Operators can edit copied metadata and advanced mechanics before launch.

The product supports holder-first corrections rather than general token launches.

## Operating Context

- GMGN BSC Flap surfaces receive Flip Tax only after the inspector verifies a taxed Flap token with less than 100% holder allocation.
- GMGN Robinhood PONS surfaces receive Vamp and launch through an extension-owned PONS composer.
- GMGN Robinhood Long.xyz surfaces receive Vamp only to correct and hand off token metadata. Long has no creator-tax or holder-fee configuration in this product.
- Unsupported chains and unrecognized launch platforms receive no launch action.

## Capabilities and Constraints

- Flap Flip Tax preserves the source payment asset and buy/sell tax rates, sets creator/burn/liquidity allocations to zero, and sets the holder allocation to 100%.
- The Flap composer opens ready to deploy. Copied metadata and corrected mechanics use collapsed editors for optional changes.
- Flap supports only inspected holder-fee corrections; it has no templates or generic deploy path.
- PONS copies on-chain name, ticker, logo, description, website, X, and Telegram where available.
- PONS images are copied to PONS IPFS before launch so the redeploy does not depend on a form-file transfer.
- PONS launches call the official V2 contracts from the extension composer. Current launch economics are read and pinned immediately before signing.
- PONS defaults the creator purchase to `0.1` of the selected pair asset. The Operator can change it for each launch or set it to zero. A nonzero purchase is executed atomically with launch for the signing wallet; an ERC-20 pair may first require an approval.
- PONS holder sharing requires three confirmations after any needed pair-token approval: launch and creator purchase, create the token distributor, and route creator fees to that distributor.
- PONS defaults creator tax to zero, buyback off, and the copied source pair when inspection data is available. These remain advanced options.
- Long opens its official create flow and copies the supported metadata. It does not automate pairing, fee receiver, or submission.
- Long's single optional-link field uses X, then website, then Telegram. Descriptions are limited to 100 characters.
- Flap and PONS cards show holder-fee routing. Long cards show the official authenticity verdict; failed checks remain neutral.
- The extension uses the Operator's injected EIP-1193 wallet and never imports or stores private keys.
- Flap payment assets come from a validated manifest packaged with the extension; updating the list requires an extension release.

## Brand Commitments

The Flip Tax portrait identifies BSC holder-fee corrections. The Vamp bat identifies Robinhood PONS and Long metadata workflows. Injected UI inherits GMGN's dark, dense visual system with restrained red accents.

## Product Principles

- Holder-first is the invariant, not a preset.
- Preserve source metadata and mechanics unless the Operator edits them.
- Keep the default path to one review action plus unavoidable wallet confirmations.
- Put optional metadata and mechanics behind progressive disclosure.
- Read mutable platform configuration at launch time.
- Preserve the Operator's GMGN scanning flow.
