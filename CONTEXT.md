# Holder-Fee Correction

This context covers redeploying a token discovered on GMGN while defaulting the platform-configurable fee share to holders.

## Language

**Launch Context**:
The source token data used to seed a launch, including its identity, media, links, and contract address.
_Avoid_: Tweet payload, scraped token

**Capture Bridge**:
A replaceable integration that reads Launch Context from a Token Surface and hands it to the Launch Composer.
_Avoid_: GMGN fork, token scraper

**Launch Composer**:
The extension-owned interface in which an Operator reviews or edits copied Launch Metadata, configures Launch Mechanics, and initiates a launch.
_Avoid_: Deploy popup, launcher

**Launch Metadata**:
The source token identity copied from a Token Surface, including its original on-chain name and symbol plus its primary image, original description, and available links. Translations are reference-only.
_Avoid_: Launch settings, token mechanics

**Launch Mechanics**:
The behavioral launch configuration owned by the extension, including payment token, tax settings, creator purchase, and holder-fee routing.
_Avoid_: Token metrics, metadata

**Holder-Fee Correction**:
A redeploy that retains a Source Token's Launch Metadata while defaulting 100% of the platform-configurable fee share to holders. The Operator may edit the copied metadata and launch choices before submission.
_Avoid_: Neutral clone, exact clone

**Holder Fee Distributor**:
A platform-specific fee recipient that routes the configurable creator fee share pro rata to eligible holders, leaving no creator claim.
_Avoid_: Creator wallet, treasury

**Token Surface**:
A third-party interface where an Operator discovers a Source Token and invokes the Vamp Action. The initial Token Surfaces are GMGN BSC trenches cards and their BSC token chart pages.
_Avoid_: Upstream feed, our terminal

**Source Token**:
The existing token selected on a Token Surface whose Launch Metadata seeds a new launch.
_Avoid_: Original token, target token

**Vamp Action**:
The Robinhood action, represented by the supplied Vamp icon, that starts a PONS holder-fee correction or a Long metadata correction. BSC Flap corrections use the explicit Flip Tax action.
_Avoid_: Buy, copy trade, deploy

**Operator**:
A trusted member of the internal group authorized to configure and initiate launches.
_Avoid_: Customer, public user

**Connected Browser Wallet**:
The EIP-1193 wallet selected by the Operator for Flap account access and transaction signatures. The extension never imports or stores its private key.
_Avoid_: Shared wallet, stored wallet, default dev wallet
