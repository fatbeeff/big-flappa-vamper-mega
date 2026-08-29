# Bundle the payment-asset manifest

The extension renders Crypto/RWA payment assets from one validated manifest bundled into each release. The earlier remote registry design was removed because no authoritative upstream or deployed endpoint existed, and maintaining a server, cache, alarm, and refresh interface without one added failure modes without improving freshness. Asset changes now ship through the normal reviewed release process.
