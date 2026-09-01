# GMGN Vamp

GMGN Vamp corrects token launches whose configurable fees do not reach holders. It copies the source metadata and defaults the redeploy to holder-first fee routing.

Your browser wallet handles account access and signatures. The extension stores no private keys.

## Features

| GMGN source | Vamp action |
| --- | --- |
| BSC Flap token with partial holder allocation | Opens Flip Tax, preserving source rates and payment asset while routing 100% of configurable tax to holders |
| Robinhood token linked to Long.xyz | Opens Long.xyz only to correct and reuse supported metadata |
| Robinhood token linked to PONS | Opens the extension PONS composer, copies the image through PONS IPFS, launches with a default `0.1` creator purchase for the signing wallet, and enables holder sharing |

Long.xyz keeps control of its launch options. PONS defaults to the copied source pair when available and reads current V2 launch economics before signing. The extension never reuses Flap's BNB Chain RWA addresses on Robinhood Chain.

### Token inspection

- Flap and PONS cards show holder-fee routing beside GMGN's tax value. Flap is green at 100% holder allocation. PONS is green when its creator-fee route reaches holders and red at 0%; its percentage accounts for the protocol and buyback shares.
- Long.xyz cards show `VERIFIED LONG` for an authentic token and a red warning for a failed authenticity verdict. Network and API failures stay neutral.
- Flap tokens with partial holder allocation receive a **Flip Tax** action. It preserves the source tax rates and payment asset, then prepares a launch with 100% of tax routed to holders.

### X post source

On an individual X post page, the extension restores X's per-post client label beside the timestamp, such as `Twitter Web App`. The label is read passively from the post response X already sends to the browser. It identifies an app/client label, not a physical device, and custom apps can choose misleading names.

### Flap launch composer

The Flap composer supports:

- editable token metadata and image replacement
- BNB and supported Crypto/RWA payment assets
- buy and sell tax rates
- creator, burn, holder, and liquidity allocation
- an optional creator purchase
- advanced mechanics behind an optional disclosure

The composer opens with verified source mechanics and the holder-first correction applied. A successful launch sends the current tab to the new GMGN token page.

## Requirements

- Chrome or a Chromium browser with Manifest V3 support
- MetaMask, Rabby, or another injected EIP-1193 wallet
- BNB Chain funds for Flap launch value and gas

Building from source also requires Node.js 20 or newer, npm, and PowerShell.

## Load the unpacked extension

Choose one source for the extension folder.

### Use a release

1. Download `gmgn-vamp-v0.1.0.zip` from the latest GitHub release.
2. Extract the archive to a folder you plan to keep. Chrome cannot load the ZIP file.

### Build from source

```powershell
npm ci
npm run build
```

The build writes the unpacked extension to `dist`.

### Add the folder to Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode** in the top-right corner.
3. Click **Load unpacked**.
4. Select the extracted release folder or the generated `dist` folder. Select the folder that contains `manifest.json`, not the repository root.
5. Confirm that **GMGN Vamp** appears on the extensions page.
6. Refresh any open GMGN, Long.xyz, or PONS tabs.

After an update, replace or rebuild the extension files, return to `chrome://extensions`, and click the reload icon on the GMGN Vamp card.

## Use

1. Open a supported GMGN BSC or Robinhood token page.
2. Click **Flip Tax** for a partial Flap token, or the bat icon for PONS/Long.
3. Deploy immediately, or expand metadata/advanced settings to make a correction.
4. Connect your browser wallet when the launch flow asks.
5. Review and sign each transaction in the wallet.

Flap and PONS launch from extension-owned composers. PONS defaults to a `0.1` creator purchase in the selected pair asset; it is editable per launch and executes atomically with the launch. PONS then requires two more wallet confirmations for its holder distributor and fee route. An ERC-20 pair may also require an approval. Long remains an official-form metadata handoff, held for ten minutes while its create flow is completed.

## Wallet and permissions

GMGN Vamp calls the wallet provider exposed by the active browser wallet. Flap launches request BNB Smart Chain. PONS launches request Robinhood Chain. The extension asks the wallet to add either chain when needed; Long manages its own wallet prompts.

The extension requests access to these sites for the listed jobs:

| Access | Purpose |
| --- | --- |
| `gmgn.ai` | Add Vamp, Flip Tax, fee-routing, and authenticity controls |
| `app.long.xyz` | Check Long authenticity and prefill the create flow |
| `ponsfamily.com` | Copy token images to PONS IPFS |
| `x.com` and `twitter.com` | Show the posting-client label already present in X's per-post response |
| Robinhood Chain RPC | Read PONS launch settings and token identity |
| BNB Chain RPC | Read Flap contracts and confirm transactions |
| Flap upload service | Upload the selected token image and public metadata |

Chrome may ask for access to a token image host when Flap needs to upload an image from that host. The extension requests that origin at deploy time.

## Development

```powershell
npm run typecheck
npm test
npm run smoke:readonly
npm run package:extension
```

`npm run package:extension` writes `release/gmgn-vamp-v0.1.0.zip` without development source maps.

For a focused Playwright run, pass test files directly:

```powershell
npx playwright test tests/pons-tax-inspector.spec.ts
```

## Current scope

- GMGN provides the supported token surfaces.
- Flap launches run on BNB Smart Chain.
- PONS launches call the official V2 contracts from the extension composer; Long remains an official-form metadata handoff.
- Site markup changes can require an extension update.

The design notes live in [docs/specs/multi-platform-wallet-launch.md](docs/specs/multi-platform-wallet-launch.md). Architectural decisions live in [docs/adr](docs/adr).

## Support

Include the extension version, wallet name, visible error, source token address, and affected platform in a bug report. Remove private account details from screenshots. Do not share a private key or seed phrase.
