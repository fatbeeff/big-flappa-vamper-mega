# Use the Operator's injected deployment wallet

The extension delegates account access and transaction signing to the EIP-1193 wallet selected by the browser, such as MetaMask or Rabby. It does not import or persist private keys. This supersedes the original shared-key decision: wallet prompts add a deliberate confirmation step but remove extension key custody and work across Flap, PONS, and Long.xyz launch paths.
