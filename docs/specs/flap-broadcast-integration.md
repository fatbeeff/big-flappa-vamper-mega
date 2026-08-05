# Flap BNB broadcast integration evidence

Verified 2026-08-05. This note records the deployment-critical facts used by the extension; no real transaction was submitted during implementation.

## Authoritative contract and encoding

- The current BNB Portal is `0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0`; the current Tax Token V3 implementation is `0x024f18294970B5c76c0691b87f138A0317156422`. Flap's address table labels the Portal v5.8.6, while a read-only mainnet `version()` call returned `v5.16.1`; the implementation therefore treats on-chain simulation as the final compatibility gate. [Flap deployed addresses](https://docs.flap.sh/flap/developers/deployed-contract-addresses)
- New tax tokens use `newTokenV6`, `TOKEN_TAXED_V3 = 6`, `V2_MIGRATOR = 1`, and the exact 26-field tuple encoded in `src/flap-contract.ts`. BSC uses `DEX0 = 0`; the launcher uses `FOUR_FIFTHS = 1` and the standard LP profile `0`. Tax rates are basis points, standard allocations total 10,000 bps, and Tax V3 salts predict a `7777` suffix against the V3 implementation. [Flap Portal launcher guide and full IPortal interface](https://docs.flap.sh/flap/developers/token-launcher-developers/launch-token-through-portal.md)
- Native creator purchase uses `quoteAmt == msg.value`. ERC-20/RWA creator purchase uses quote-token base units, empty permit data in the approval path, and the Portal-required `1 gwei` native value. The extension verifies `getQuoteTokenConfiguration(asset).enabled == 1` immediately before launch.
- `TokenCreated(uint256,address,uint256,address,string,string,string)` has no indexed arguments. The extension decodes the confirmed Portal log and uses its fourth ABI value, `token`, rather than a predicted address. [Flap event indexing guide](https://docs.flap.sh/flap/developers/wallet-and-terminal-and-bot-developers/index-token-created-events)

## ERC-20 allowance spender evidence

The Portal proxy spender is confirmed by a successful live BNB launch, not assumed from architecture:

- Transaction [`0xd961ff23be2f92b62cce25aa5534825be22f8e72dd2ab0b9ebdf688987aa8835`](https://bscscan.com/tx/0xd961ff23be2f92b62cce25aa5534825be22f8e72dd2ab0b9ebdf688987aa8835) called the Portal proxy with `newTokenV6`, `permitData = 0x`, SPCXB quote token, `quoteAmt = 2582845777912370522`, and `msg.value = 1 gwei`.
- Its successful receipt contains an SPCXB `Transfer` of exactly `2582845777912370522` from the transaction sender to the Portal proxy. With empty permit data, that successful `transferFrom` establishes the executing Portal proxy as the allowance spender.
- The extension checks `allowance(owner, Portal)`, resets a smaller non-zero allowance to zero for strict tokens, then approves only the exact creator-purchase amount. It never approves an implementation address or an unlimited amount.

## Metadata persistence

The image and public metadata must be sent as GraphQL multipart form data to `https://funcs.flap.sh/api/upload`; the returned metadata CID becomes `params.meta`. The payload contains description, website, X, Telegram, and the image. It excludes Source Token contract provenance and all copied mechanics/ownership data. [Flap upload API example](https://docs.flap.sh/flap/developers/token-launcher-developers/launch-token-through-portal.md) and [metadata parsing](https://docs.flap.sh/flap/developers/wallet-and-terminal-and-bot-developers/parse-token-meta.md)

## Safe verification protocol

1. Run `npm run build`, `npm run test:broadcast`, and `npm run smoke:readonly`.
2. The smoke script checks chain 56, deployed Portal/token code, live Portal version/nonce, asset decimals, and live Flap quote-asset enablement. It has no private-key input and contains no signing or send-transaction method.
3. Load `dist/` unpacked, open `https://gmgn.ai/?chain=bsc`, and confirm the packaged Vamp action/composer using a wallet with no launch funds if testing UI manually. Do not click Deploy on mainnet during a UI smoke.
4. Automated browser tests substitute the BSC RPC and Flap upload boundary. They verify in-flight locking and edit-preserving recovery. Contract-focused tests verify calldata, approvals, event extraction, and the canonical `https://gmgn.ai/bsc/token/{address}` route.
