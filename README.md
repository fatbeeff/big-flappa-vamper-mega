# GMGN Vamp

GMGN Vamp adds token launch and inspection tools to GMGN. It copies token metadata into Flap, Long.xyz, or PONS and sends each launch through the platform that created the source token.

The extension uses your browser wallet for account access and signatures. It does not ask for, import, or store private keys.

## Features

| GMGN source | Vamp action |
| --- | --- |
| BSC token | Opens the built-in Flap composer with copied name, symbol, image, description, and social links |
| Robinhood token linked to Long.xyz | Opens the Long.xyz create flow and fills the supported metadata fields |
| Robinhood token linked to PONS | Opens the PONS create flow and fills the supported metadata fields |

Long.xyz and PONS keep control of their pairing assets and launch options. The extension does not reuse Flap's BNB Chain RWA addresses on Robinhood Chain.

### Token inspection

- Flap and PONS cards show holder-fee routing beside GMGN's tax value. Green means holders receive 100% of the fee. Red means holders receive less than 100%, including 0%.
- Long.xyz cards show `VERIFIED LONG` for an authentic token and a red warning for a failed authenticity verdict. Network and API failures stay neutral.
- Flap tokens with partial holder allocation receive a **Flip Tax** action. It preserves the source tax rates and payment asset, then prepares a launch with 100% of tax routed to holders.

### Flap launch composer

The Flap composer supports:

- editable token metadata and image replacement
- BNB and supported Crypto/RWA payment assets
- buy and sell tax rates
- creator, burn, holder, and liquidity allocation
- an optional creator purchase
- reusable launch templates

The composer opens with the active template. A successful launch sends the current tab to the new GMGN token page.

### Discord sidebar controls

The toolbar configuration includes optional Discord layout controls. You can hide the server list or collapse channels in narrow windows. The Discord feature starts disabled and does not interact with launch or wallet code.

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
6. Pin GMGN Vamp from Chrome's Extensions menu.
7. Refresh any open GMGN, Long.xyz, PONS, or Discord tabs.

After an update, replace or rebuild the extension files, return to `chrome://extensions`, and click the reload icon on the GMGN Vamp card.

## Use

1. Open a supported GMGN BSC or Robinhood token page.
2. Click the bat icon labeled **Vamp this token**.
3. Review the copied metadata and platform options.
4. Connect your browser wallet when the launch flow asks.
5. Review and sign each transaction in the wallet.

Flap launches use the built-in composer. Long.xyz and PONS launches continue on their official create pages. The extension keeps copied metadata available for ten minutes while you choose the pairing asset and fee settings.

## Configuration

Click the extension icon to manage:

- the active Flap launch template
- cached Flap payment assets
- template JSON import and export
- Discord sidebar controls

The payment-asset registry in this screen applies to Flap. Long.xyz and PONS supply their own live pairing lists.

## Wallet and permissions

GMGN Vamp calls the wallet provider exposed by the active browser wallet. Flap launches request BNB Smart Chain and ask the wallet to add the chain if needed. Long.xyz and PONS manage their own wallet prompts.

The extension requests access to these sites for the listed jobs:

| Access | Purpose |
| --- | --- |
| `gmgn.ai` | Add Vamp, Flip Tax, fee-routing, and authenticity controls |
| `app.long.xyz` | Check Long authenticity and prefill the create flow |
| `ponsfamily.com` | Prefill the PONS create flow |
| Robinhood Chain RPC | Read PONS launch settings and token identity |
| BNB Chain RPC | Read Flap contracts and confirm transactions |
| Flap upload service | Upload the selected token image and public metadata |
| `discord.com` | Apply the optional sidebar controls |

Chrome may ask for access to a token image host when Flap needs to upload an image from that host. The extension requests that origin at deploy time.

## Development

```powershell
npm run typecheck
npm test
npm run smoke:readonly
npm run package:extension
```

`npm run package:extension` writes `release/gmgn-vamp-v0.1.0.zip` without development source maps.

Useful focused commands:

```powershell
npm run test:focused
npm run test:metadata
npm run test:mechanics
npm run test:payment-assets
npm run test:wallet
npm run test:broadcast
```

## Current scope

- GMGN provides the supported token surfaces.
- Flap launches run on BNB Smart Chain.
- Long.xyz and PONS launches run through their official Robinhood Chain forms.
- Site markup changes can require an extension update.

The design notes live in [docs/specs/multi-platform-wallet-launch.md](docs/specs/multi-platform-wallet-launch.md). Architectural decisions live in [docs/adr](docs/adr).

## Support

Include the extension version, wallet name, visible error, source token address, and affected platform in a bug report. Remove private account details from screenshots. Do not share a private key or seed phrase.
