# Payment-asset registry

This directory is the minimal, keyless backend boundary for payment assets. A deployment adapter implements `FlapPaymentAssetSource` using an authoritative, documented Flap source and passes the result to `reconcileFlapPaymentAssets`. The reconciler emits the versioned manifest consumed by the extension.

Flap does not currently publish a documented payment-asset registry endpoint. This repository therefore does not guess one. Until an adapter is configured, `registry/payment-assets.json` is the single canonical conservative manifest: it is imported as the runtime fallback and copied into the extension package at build time. The registry owns no wallet material and cannot sign or launch transactions.
