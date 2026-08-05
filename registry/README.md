# Payment-asset registry

This directory is a runnable, keyless HTTP registry for payment assets. It exposes `GET /v1/payment-assets` and `GET /health`, reconciles every five hours, and preserves its last valid manifest when the upstream source fails validation or cannot be reached.

Run it with `npm run registry:start`. Set `FLAP_PAYMENT_ASSET_SOURCE_URL` to the deployment-approved authoritative JSON source. Flap does not currently publish a documented payment-asset registry endpoint, so no source URL is guessed or committed here. Without that variable the service safely serves `registry/payment-assets.json`, the single canonical conservative manifest imported as the extension runtime fallback and copied into its package at build time.

Configure extension builds with `VAMP_PAYMENT_ASSET_REGISTRY_URL=https://your-registry.example/v1/payment-assets`. The build emits only that URL and its exact origin host permission. The registry owns no wallet material and cannot sign or launch transactions.
