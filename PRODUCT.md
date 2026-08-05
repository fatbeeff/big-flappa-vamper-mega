# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Trusted internal Operators who monitor tokens on GMGN and rapidly create related Flap launches from one Shared Deployment Wallet.

## Product Purpose

The browser extension turns an existing GMGN token into an editable Flap launch. Success means an Operator can invoke the Vamp Action from a trenches card or token chart, reuse the source token's metadata, apply saved advanced Flap mechanics, and broadcast the launch with minimal delay.

## Positioning

The product combines the discovery context and metadata already present on GMGN with Flap Crypto/RWA payment-token selection and related launch controls that are otherwise absent from quick-launch workflows.

## Operating Context

The initial Token Surfaces are GMGN's BSC trenches view and BSC token chart pages reached from it. The trenches action appears with the card's hover controls; the chart action appears below the favorite control. Both use the supplied Vamp icon and open an editable Launch Composer.

## Capabilities and Constraints

- Initial launches use Flap on BNB Chain only.
- V1 launches Flap tax tokens only; it has no separate standard-token mode.
- The extension does not expose the Vamp Action on GMGN surfaces for other chains.
- Launch Metadata is copied from the selected GMGN token and remains editable.
- Launch Mechanics include Crypto/RWA payment tokens, creator purchase, non-vault buy/sell tax, and standard tax allocation. Custom vaults, including stock-dividend vaults, are out of v1.
- One Launch Template is active by default; full mechanics are available in an expandable editor.
- The composer always uses the Active Template and does not include a template switcher. One-off edits do not mutate it; templates are selected and administered in the extension configuration screen.
- Team default templates ship with the extension; operator-created templates are stored locally and shared through JSON import/export.
- Available Crypto/RWA payment assets render from a local cache backed by a minimal remote asset registry. The extension refreshes after five hours or when an Operator forces refresh, and retains stale data when refresh fails.
- Clicking the browser extension opens a compact configuration screen; forced payment-asset refresh lives there rather than in the Launch Composer.
- The final Deploy action signs and broadcasts without a second confirmation step.
- After a successful launch, the current tab navigates directly to the new token's GMGN BSC chart page.
- Every Operator uses the same Shared Deployment Wallet and is an authorized keyholder.
- Once imported, the Shared Deployment Wallet remains available across browser restarts without a session unlock prompt.
- Templates and wallet material do not require a hosted application.
- J7 integration is deferred.

## Brand Commitments

The supplied Vamp icon is the persistent identity of the invocation action. Injected UI inherits GMGN's dark, dense visual system; restrained red Vamp accents are the only distinct brand layer.

## Evidence on Hand

- GMGN trenches and chart screenshots supplied in the product discussion.
- Vamp icon asset supplied at `C:\Users\Patrick\Downloads\61ccbaf8-7996-4f2e-9571-c2308d85b1b0.png`.
- Flap launch configuration screenshots supplied in the product discussion.

## Product Principles

- Preserve the Operator's GMGN scanning flow.
- Copy source metadata first, then allow deliberate editing.
- Make the active launch mechanics legible without slowing deployment.
- Keep third-party integrations replaceable.
- Optimize for trusted internal operation rather than public account management.
