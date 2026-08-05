# Token Clone Launching

This context covers turning an existing token discovered on a third-party market interface into an editable, configurable Flap token launch.

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
The behavioral Flap configuration owned by the extension, including Crypto/RWA payment token, tax settings, creator purchase, and the selected Launch Template.
_Avoid_: Token metrics, metadata

**Launch Template**:
A reusable set of launch configuration choices, such as payment token, tax settings, and creator purchase. One template is the Active Template used by default; templates do not contain the unique source metadata or final token identity for a particular launch.
_Avoid_: Preset, deploy type

**Token Surface**:
A third-party interface where an Operator discovers a Source Token and invokes the Vamp Action. The initial Token Surfaces are GMGN BSC trenches cards and their BSC token chart pages.
_Avoid_: Upstream feed, our terminal

**Source Token**:
The existing token selected on a Token Surface whose Launch Metadata seeds a new launch.
_Avoid_: Original token, target token

**Vamp Action**:
The extension action, represented by the supplied Vamp icon, that starts cloning a Source Token into a new editable launch.
_Avoid_: Buy, copy trade, deploy

**Operator**:
A trusted member of the internal group authorized to configure launches and control the Shared Deployment Wallet.
_Avoid_: Customer, public user

**Shared Deployment Wallet**:
The single wallet identity from which every Operator initiates token launches.
_Avoid_: User wallet, default dev wallet
