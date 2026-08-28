# Build the GMGN Vamp Extension v1

> Wallet and destination-launch behavior in this original v1 specification is superseded by [multi-platform-wallet-launch.md](./multi-platform-wallet-launch.md): Flap uses an injected browser wallet, while Long.xyz and PONS use their official launch forms and live pairing lists.

## Problem Statement

Operators discover newly created BSC tokens while scanning GMGN, but turning a promising Source Token into a configurable Flap launch requires leaving that workflow, manually copying identity and social metadata, recreating images and links, configuring tax-token mechanics, and submitting a separate launch. Existing quick-launch tools do not expose the required Crypto/RWA payment tokens and tax configuration, while rebuilding a discovery terminal would duplicate GMGN's strongest capabilities.

Operators need a fast, native-feeling action inside GMGN that copies the Source Token's original identity into an editable Flap launch, applies repeatable team mechanics, broadcasts from the Shared Deployment Wallet, and returns them directly to GMGN without introducing custom vaults, cloud accounts, or repeated wallet friction.

## Solution

Build a Chrome extension for GMGN's BSC Trenches and BSC token chart pages. It injects a Vamp Action using the supplied Vamp icon, opens a centered GMGN-native Launch Composer, copies and exposes the Source Token's original metadata for editing, applies the Active Template, and launches a Flap tax token on BNB Chain.

The extension supports dynamically discovered Crypto/RWA payment assets, non-vault buy/sell taxes and standard allocation, and an optional creator purchase. Operators administer the Shared Deployment Wallet, templates, cached payment assets, and integration health through the extension's compact configuration screen. After the Flap transaction receives its first successful receipt, the current tab navigates to the new token's GMGN BSC chart page.

## User Stories

1. As an Operator, I want to see the Vamp Action on a BSC Trenches token card, so that I can begin a launch without leaving my scanning workflow.
2. As an Operator, I want the Vamp Action immediately left of the existing play/Buy control on a Trenches card, so that the launch action is visible with the control I already use without requiring GMGN's optional second Buy button.
3. As an Operator, I want the Vamp Action to use the supplied Vamp icon, so that it is immediately recognizable without consuming space with a label.
4. As an Operator, I want an accessible tooltip on the Vamp icon, so that its purpose is clear before I invoke it.
5. As a keyboard-using Operator, I want the Vamp Action to be focusable and named, so that I can invoke it without a pointer.
6. As an Operator, I want the Vamp Action below the favorite control on a BSC token chart page, so that I can launch from the detailed analysis surface.
7. As an Operator, I want the chart-page Vamp Action to remain visible, so that it does not depend on discovering a hover-only state.
8. As an Operator, I want identical Vamp behavior from Trenches and chart pages, so that I do not need to learn two workflows.
9. As an Operator, I do not want Vamp actions on non-BSC GMGN surfaces, so that the extension never implies unsupported destination behavior.
10. As an Operator, I want clicking Vamp to open a centered composer over GMGN, so that I keep the surrounding token context while focusing on the launch.
11. As an Operator, I want the composer to inherit GMGN's visual language, so that it feels like a native capability rather than a disconnected application.
12. As an Operator, I want Launch Metadata and Launch Mechanics separated into two columns, so that identity edits and economic choices remain easy to scan.
13. As an Operator, I want the composer shell to open from local data immediately, so that metadata enrichment never makes the action feel unresponsive.
14. As an Operator, I want the Source Token's original on-chain name copied into the composer, so that GMGN translations do not silently change its identity.
15. As an Operator, I want the Source Token's original on-chain symbol copied into the composer, so that the launch preserves the intended ticker.
16. As an Operator, I want GMGN translations shown only as reference when available, so that I can understand them without cloning them accidentally.
17. As an Operator, I want the Source Token's primary image copied into the composer, so that I do not need to download and re-upload it manually.
18. As an Operator, I want the original description, website, X link, and Telegram link copied when available, so that the new launch starts from complete public metadata.
19. As an Operator, I want every copied metadata value to remain editable, so that I can correct or intentionally change the clone before deployment.
20. As an Operator, I want to replace the copied image by upload or URL, so that I can use a different asset when desired.
21. As an Operator, I want to restore the original image after replacing it, so that experimentation is reversible before deployment.
22. As an Operator, I want missing optional metadata to produce empty editable fields, so that incomplete GMGN data does not prevent the composer from opening.
23. As an Operator, I want validation to reflect Flap's current required fields, so that the extension neither rejects valid launches nor submits invalid ones.
24. As an Operator, I do not want the Source Token's contract address published as launch metadata, so that provenance does not leak into the cloned identity.
25. As an Operator, I do not want source supply, deployer, tax, or allocation copied, so that only identity—not mechanics or ownership—is cloned.
26. As an Operator, I want the Active Template applied automatically, so that frequent launch mechanics require no repetitive entry.
27. As an Operator, I want the Active Template summarized compactly, so that I can verify it without opening every control.
28. As an Operator, I want to expand and edit all supported Launch Mechanics inline, so that unusual launches remain possible.
29. As an Operator, I want composer edits to affect only the current launch by default, so that I cannot accidentally change future launches.
30. As an Operator, I want an explicit Save as Template action, so that useful one-off mechanics can become reusable intentionally.
31. As an Operator, I do not want an in-composer template switcher, so that the main launch path stays focused and simple.
32. As an Operator, I want to choose between currently supported Crypto and RWA payment assets, so that the launch uses the desired quote token.
33. As an Operator, I want unavailable payment assets identified and unselectable, so that I do not construct a launch Flap will reject.
34. As an Operator, I want payment assets loaded from local cache, so that opening the composer never waits for a registry request.
35. As an Operator, I want the payment-asset cache refreshed after five hours, so that newly supported assets arrive without an extension release.
36. As an Operator, I want stale cached assets retained when refresh fails, so that a registry outage does not prevent launching with known assets.
37. As an Operator, I want to configure buy and sell tax rates, so that the Flap tax token follows the intended strategy.
38. As an Operator, I want to configure Flap's supported non-vault tax allocation, so that revenue behavior is explicit without custom vault contracts.
39. As an Operator, I want the creator purchase amount stored in templates, including zero, so that the initial purchase is repeatable.
40. As an Operator, I want one Flap tax-token path rather than separate standard and tax modes, so that the composer remains predictable.
41. As an Operator, I want Deploy to sign and broadcast immediately, so that there is no redundant product confirmation after reviewing the composer.
42. As an Operator, I want Deploy disabled only for Flap-required invalid data, a missing or underfunded Shared Deployment Wallet, or an unavailable payment asset, so that optional fields do not slow me down.
43. As an Operator, I want duplicate Deploy clicks suppressed while broadcasting, so that one action cannot submit the same launch twice.
44. As an Operator, I want all edits preserved after a failed launch, so that retrying does not require reconstructing the token.
45. As an Operator, I want a useful failure reason when one can be derived, so that I can correct the launch or connection before retrying.
46. As an Operator, I want the extension to wait for the first successful receipt, so that it does not navigate to a token whose deployment reverted.
47. As an Operator, I want the new contract address extracted from the confirmed Flap event, so that navigation targets the actual deployed token.
48. As an Operator, I want the current tab to navigate directly to the new token's GMGN BSC chart, so that I return to analysis immediately after launch.
49. As an Operator, I do not want an intermediate success page, so that the confirmed workflow has no unnecessary stop.
50. As an Operator, I want clicking the browser extension to open a compact configuration screen, so that administration stays separate from launching.
51. As an Operator, I want to import or replace the Shared Deployment Wallet from configuration, so that wallet provisioning remains outside the distributed package.
52. As an Operator, I want to see the Shared Deployment Wallet balance, so that I know whether it can fund a launch.
53. As an Operator, I want the imported Shared Deployment Wallet available after browser restart, so that a recurring unlock does not delay deployment.
54. As an Operator, I want to create and edit templates in configuration, so that team mechanics are managed away from the critical launch path.
55. As an Operator, I want to select the Active Template in configuration, so that every new composer opens with one predictable default.
56. As an Operator, I want templates imported and exported as JSON, so that Operators can share team defaults without a hosted account.
57. As an Operator, I want to see the payment-asset cache timestamp, so that I understand whether the list may be stale.
58. As an Operator, I want to force payment-asset refresh from configuration, so that I can retrieve a newly enabled asset before five hours elapse.
59. As an Operator, I want GMGN and Flap connection health in configuration, so that integration failures can be distinguished from invalid launch data.
60. As an Operator, I want the extension version in configuration, so that team members can compare installations during support.
61. As an Operator, I do not want launch controls in configuration, so that token-specific work always begins from a Source Token.
62. As an Operator, I want focus to enter the composer and return to the invoking Vamp Action when dismissed, so that modal use is coherent.
63. As an Operator, I want Escape to dismiss the composer except during active signing or broadcast, so that accidental interruption cannot corrupt an in-flight action.
64. As an Operator, I want loading, invalid, failure, and progress states expressed with text rather than color alone, so that critical state is unambiguous.
65. As an Operator scanning fast-moving cards, I want the extension to avoid per-card requests and layout shifts, so that GMGN scrolling and hover performance remain intact.
66. As an Operator, I want Vamp actions attached to dynamically inserted and recycled Trenches rows, so that live token updates do not make the extension disappear.

## Implementation Decisions

- Build a Chrome extension as the v1 delivery vehicle. A userscript is not the product boundary because the extension must own cross-origin asset access, persistent configuration, signing, multiple GMGN surfaces, and injected UI.
- Support the v1 launch flow only on GMGN's BSC Trenches surface and BSC token chart pages reached from it.
- Treat GMGN as a Token Surface rather than recreating discovery or charting. The Capture Bridge must remain replaceable so a later J7 integration does not contaminate the core Launch Composer.
- Add the Vamp Action immediately left of a Trenches card's existing play/Buy control in the same hover-action group. Do not replace or move the native Buy action, do not require GMGN's optional second Buy button, and do not alter card geometry.
- Add a persistent Vamp Action below the chart page's favorite control.
- Use the supplied Vamp icon for both invocation points. Controls remain icon-only with an accessible name and GMGN-native tooltip.
- Place Flip Tax directly beside the Vamp Action when the Source Token has a partial holder-tax allocation.
- Detect GMGN client-side route transitions and dynamically inserted or recycled card rows without a per-card observer or network request.
- Open one extension-owned centered modal from either Token Surface. Use a two-column desktop composition with Launch Metadata on the left and Launch Mechanics on the right.
- Inherit GMGN's dark surfaces, typography density, borders, control states, and interaction rhythm. Restrained red Vamp accents are the only separate brand layer.
- Open the composer using metadata already present on the selected surface, then enrich missing values asynchronously without overwriting Operator edits.
- Resolve original name and symbol from the Source Token's authoritative on-chain identity. GMGN translations are reference-only.
- Copy primary image, original description, website, X, and Telegram when the authoritative integration exposes them. Keep the source contract only as ephemeral provenance.
- Allow every Launch Metadata field to be edited. Image controls support upload, URL replacement, and restoration of the source image.
- Derive required-field validation from Flap's current launcher contract or API. Optional missing metadata never blocks composer opening.
- Use one BNB Chain Flap tax-token transaction path. Do not expose a standard-token mode.
- Include Crypto/RWA payment-token selection, buy tax, sell tax, Flap-supported standard non-vault tax allocation, and optional creator purchase.
- Exclude all custom vaults, including stock-dividend vaults and stock selection.
- Apply the Active Template automatically. The composer has no template switcher.
- Treat composer mechanic edits as launch-local. Only an explicit Save as Template action persists them.
- Ship team default templates with the extension and store Operator templates locally. Support JSON import/export instead of cloud synchronization.
- Administer the Active Template only from the extension configuration screen.
- Render payment assets from a bundled and locally cached manifest. Never put a registry request in the composer-open critical path.
- Add a minimal backend asset registry that periodically reconciles Flap's currently available Crypto/RWA assets. It owns no keys and performs no launch work.
- Refresh the extension's cached asset manifest after five hours or when an Operator forces refresh from configuration. Fall back to stale data on failure.
- Every Operator controls the same Shared Deployment Wallet and is an authorized keyholder. The wallet owner distributes the key outside the product.
- Never embed the Shared Deployment Wallet key in extension source or the distributed package. Import and replacement happen through configuration.
- Keep the imported wallet persistently available across browser restarts without recurring unlock. This intentionally accepts browser-profile and extension-storage exposure risk for the trusted internal workflow.
- The final Deploy action signs and broadcasts without another product confirmation. Prevent repeated submission while the launch is in flight.
- Wait for the first successful transaction receipt, extract the actual new token address from Flap's event, and then navigate the current tab to its GMGN BSC chart page.
- On failure, keep the composer open, preserve all edits, expose a useful reason where possible, and allow retry.
- The extension configuration screen owns wallet import/replacement and balance, Active Template and template administration, asset-cache status and Force Refresh, GMGN/Flap health, and extension version. It contains no token metadata or launch control.
- Preserve unrelated GMGN behavior and visual hierarchy. The native favorite action and every Buy action remain untouched.
- Respect the shared-wallet, GMGN-first, cached-registry, and persistent-wallet ADRs. The earlier J7-native-modal decision is superseded.

## Testing Decisions

- Use one primary high-level seam: a browser-level extension integration harness running against controlled GMGN BSC Trenches and chart fixtures.
- Exercise observable behavior from the Vamp Action through composer opening, metadata population and editing, Active Template application, Flap transaction submission, receipt handling, failure recovery, and GMGN navigation.
- Substitute only external boundaries: GMGN metadata responses, the payment-asset registry, BSC RPC and Flap contracts, and browser navigation.
- Assert what an Operator can see and do, the transaction request submitted at the Flap boundary, and the resulting navigation. Do not assert internal component trees, selector implementation, storage library calls, or private helper behavior.
- Cover both supported invocation surfaces through the same behavioral suite so the Launch Composer is not tested separately for each integration point.
- Include dynamic-card insertion and recycling in the Trenches fixture to verify stable injection without duplicate Vamp actions.
- Include original-versus-translated metadata, partial optional metadata, image replacement/restoration, and protection against asynchronous enrichment overwriting edits.
- Include cached, stale, refreshed, failed-refresh, enabled, and disabled payment-asset states.
- Include valid, invalid, missing-wallet, broadcasting, reverted, RPC-failed, retry, and confirmed deployment states.
- Include prevention of duplicate submission during broadcast and preservation of all edits after failure.
- Include keyboard focus, accessible names, tooltip availability, Escape behavior, and text-based state communication at the browser seam.
- Include a non-BSC fixture that verifies no Vamp Action is injected.
- Keep live GMGN and BNB mainnet verification as a bounded manual smoke test because both are unstable third parties. It must not be the automated correctness gate.
- No existing automated-test prior art exists in this greenfield repository. The integration harness establishes the first and preferred test seam; narrower unit tests should be added only when behavior cannot be expressed reliably through it.

## Out of Scope

- J7 stream integration
- Launching from GMGN chains other than BSC
- Destination chains other than BNB Chain
- Rebuilding GMGN Trenches, token discovery, charting, trading, or market data
- Standard non-tax Flap token launches
- Custom Flap vaults of any kind
- Stock-dividend vaults and stock selection
- Cloud accounts, authentication, team roles, or automatic template synchronization
- A hosted Launch Composer or standalone Vercel application
- Remote or custodial transaction signing
- Recurring wallet unlock prompts
- Launch history, duplicate detection, or previously-launched warnings
- Copying source supply, deployer, ownership, taxes, allocation, or contract address into public metadata
- Automatic deployment from the first Vamp click without opening the composer
- An intermediate launch-success page
- Publishing the extension publicly to the Chrome Web Store as part of v1

## Further Notes

- The supplied Vamp icon is the binding invocation asset. A small-size production treatment may crop or optimize the bitmap but must preserve the supplied identity.
- The Shared Deployment Wallet design intentionally favors speed for trusted Operators over key isolation. Compromise of an Operator's browser profile or extension storage may expose the wallet.
- Flap's official developer surface supports third-party launcher integration, but implementation must verify the current BNB tax-token ABI, required metadata, supported standard allocation fields, payment-asset availability source, approval flow, event signature, and image persistence mechanism before transaction code is finalized.
- Implementation must identify stable GMGN hooks for the BSC Trenches card/action group, chart favorite rail, client-side route changes, and the new-token chart URL. DOM selectors are an integration detail, not a domain interface.
- The payment-asset backend is a configuration registry only. Its manifest schema should include enough identity and availability data for instant rendering and validation, plus a generated timestamp for staleness display.
- The repository is currently greenfield and contains product, domain, ADR, and specification documents but no application scaffold. Stack selection should preserve the single browser-level testing seam and must not split the composer into a hosted application.
