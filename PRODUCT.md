# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Operators who monitor tokens on GMGN and rapidly create related launches on Flap, Long.xyz, or PONS.

## Product Purpose

The browser extension turns an existing GMGN token into an editable Flap launch and includes token-inspection and Discord workspace utilities. Success means an Operator can invoke the Vamp Action from a trenches card or token chart, correct a partial holder-tax allocation through Flip Tax, check Long.xyz authenticity on Robinhood token surfaces, reuse the source token's metadata, apply saved advanced Flap mechanics, broadcast the launch with minimal delay, and reduce Discord sidebar clutter when needed.

## Positioning

The product combines the discovery context and metadata already present on GMGN with Flap Crypto/RWA payment-token selection and related launch controls that are otherwise absent from quick-launch workflows.

## Operating Context

The Token Surfaces are GMGN's BSC token views and Robinhood token views linked to Long.xyz or PONS. In Trenches, actions appear beside the existing Buy control; on the chart, they appear below the favorite control. Vamp uses the supplied bat icon. When available, the supplied Flip Tax portrait appears directly beside the Vamp Action.

GMGN Robinhood Trenches cards and token detail headers expose Vamp when GMGN links the token to Long.xyz or PONS. Long.xyz-linked tokens also show Long.xyz's authenticity verdict.

## Capabilities and Constraints

- BSC sources use the Flap tax-token composer; Robinhood sources linked to Long.xyz or PONS use that platform's official launch form.
- The extension exposes Vamp on BSC and on Robinhood sources linked to Long.xyz or PONS; other chains remain unsupported.
- Supported BSC Flap tokens receive a holder-tax badge on GMGN. The badge distinguishes full from partial dividend allocation and exposes buy/sell tax rates without requiring Tampermonkey.
- Robinhood tokens linked to Long.xyz receive a verdict badge on Trenches cards and token detail headers. Green and red reflect only Long.xyz's authoritative verdict; failed checks remain neutral.
- Flip Tax appears only for a partial holder-tax allocation. It opens an isolated correction draft that preserves the source payment asset and buy/sell rates while setting holder allocation to 100%.
- Launch Metadata is copied from the selected GMGN token and remains editable.
- Launch Mechanics include Crypto/RWA payment tokens, creator purchase, non-vault buy/sell tax, and standard tax allocation. Custom vaults, including stock-dividend vaults, are out of v1.
- One Launch Template is active by default; full mechanics are available in an expandable editor.
- The composer always uses the Active Template and does not include a template switcher. One-off edits do not mutate it; templates are selected and administered in the extension configuration screen.
- Team default templates ship with the extension; operator-created templates are stored locally and shared through JSON import/export.
- Available Crypto/RWA payment assets render from a local cache backed by a minimal remote asset registry. The extension refreshes after five hours or when an Operator forces refresh, and retains stale data when refresh fails.
- Clicking the browser extension opens a compact configuration screen; forced payment-asset refresh lives there rather than in the Launch Composer.
- Discord sidebar controls are disabled by default. Operators can enable a manual server-list toggle or narrow-window auto-hide, and can collapse the channel list always or only in narrow windows.
- Flap Deploy requests connection and signatures from the Operator's injected EVM wallet.
- After a successful launch, the current tab navigates directly to the new token's GMGN BSC chart page.
- The extension never imports or persists wallet private keys.
- Templates do not require a hosted application.
- J7 integration is deferred.

## Brand Commitments

The supplied Vamp and Flip Tax icons identify their respective invocation actions. Injected UI inherits GMGN's dark, dense visual system; restrained red Vamp accents are the only distinct brand layer.

## Evidence on Hand

- GMGN trenches and chart screenshots supplied in the product discussion.
- Vamp icon assets retained under `public/assets/`.
- Flip Tax icon asset supplied in the product discussion and retained at `public/assets/flip-tax.png`.
- Flap launch configuration screenshots supplied in the product discussion.

## Product Principles

- Preserve the Operator's GMGN scanning flow.
- Copy source metadata first, then allow deliberate editing.
- Make the active launch mechanics legible without slowing deployment.
- Prefer asset tiles and bounded sliders over dropdowns and raw metric entry; reserve text fields for identity, URLs, and exact amounts.
- Keep third-party integrations replaceable.
- Optimize for trusted internal operation rather than public account management.
