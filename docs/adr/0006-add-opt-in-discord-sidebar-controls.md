# Add opt-in Discord sidebar controls

- Status: accepted
- Date: 2026-08-12

## Context

Operators use Discord alongside GMGN while coordinating launches. Discord's server and channel sidebars consume substantial space in narrow working windows. Supporting that workspace utility requires a content script and host access on `discord.com`, which broadens the extension beyond its GMGN launch surface.

## Decision

Ship Discord sidebar controls in the same extension. The feature is disabled by default, remains inert until an Operator enables it from extension configuration, and only changes sidebar presentation. Keep launch, wallet, RPC, and Flap behavior out of the Discord content script. Disclose the Discord permission in friend-facing installation documentation.

## Consequences

Friends installing the unpacked extension will see Chrome disclose access to both GMGN and Discord. One package is easier to distribute and configure, but a Discord DOM change can require an extension update even when launch behavior is unaffected. The disabled-by-default state limits surprise but does not remove the declared host permission.
