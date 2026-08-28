# Multi-platform wallet launch

## Decision

Vamp follows the Source Token's launch platform:

- Flap sources use the extension-owned Flap composer.
- PONS sources hand off copied metadata to `ponsfamily.com/launchpad/create`.
- Long.xyz sources hand off copied metadata to `app.long.xyz/create`.

Every transaction is submitted by the Operator's injected EIP-1193 wallet. The extension does not import, persist, or sign with private keys.

PONS and Long pairing assets are not copied from the Flap BNB Chain registry. Their official Robinhood Chain launch forms remain authoritative because the supported sets and contract addresses change independently. As observed on 2026-08-28, PONS offered 24 pairs and Long offered 45 markets; overlapping symbols used Robinhood Chain token addresses rather than the `*B` BNB Chain addresses in the Flap registry.

## Minimal destination fields

PONS keeps name, ticker, description, image, X, Telegram, paired asset, and developer buy visible. Holder fee sharing, creator recipient/tax, and snipe exemptions remain the official form's optional Advanced settings.

Long keeps pairing asset, fee receiver, name, ticker, image, optional links, and optional description. The description limit is 100 characters.

## Sources

- https://www.ponsfamily.com/launchpad/create
- https://github.com/ponsdotdev/ponsfamily
- https://app.long.xyz/create
