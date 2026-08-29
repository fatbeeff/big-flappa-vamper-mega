# ADR 0008: Launch PONS V2 from the extension composer

- Status: accepted
- Date: 2026-08-28

## Context

The PONS official-form handoff added manual steps, and transferring a remote image into its file input was unreliable. Holder-first launches also require two post-launch transactions that are easy to miss when the Operator leaves GMGN.

PONS V2 exposes a documented on-chain launch interface, current-economics pinning, a public IPFS image endpoint, and the same distributor calls used by its official frontend.

## Decision

PONS sources open an extension-owned composer. The extension uploads the copied image through PONS IPFS, reads and pins current launch economics, launches through the official V2 contracts, creates the token's holder distributor, and routes the configurable creator-fee share to that distributor.

The composer defaults creator purchase to `0.1` of the selected pair asset and keeps it editable in the quick path. Nonzero purchases use the verified PONS V2 launch-and-buy forwarder, preserving the signing wallet as deployer and recipient and applying a 2% minimum-output guard. Zero purchases use the direct factory call. ERC-20 pairs are approved for the exact purchase amount only when required.

The composer defaults to launch configuration `0`, the copied source pair when available, zero creator tax, buyback off, and no extra snipe exemptions. Pair, creator tax, and buyback remain advanced controls. The wallet still signs every transaction.

Long.xyz remains an official-form metadata handoff because this product uses Long only to correct metadata, not fee ownership.

## Consequences

- PONS name, description, socials, and image can be reviewed and launched without leaving GMGN.
- Holder sharing is explicit and cannot be silently skipped in the normal success path.
- PONS requires three wallet confirmations for a native or already-approved pair: atomic launch and purchase, distributor creation, and fee routing. An ERC-20 pair may require one approval first.
- If a post-launch holder-sharing transaction fails, the extension blocks redeployment and directs the Operator to the created PONS token to finish recovery.
- Contract addresses and ABI behavior must be reverified when PONS replaces its V2 stack.
