# Cache a remote payment-asset registry

The extension will render Crypto/RWA payment assets from a bundled and locally cached manifest rather than querying Flap during composer startup or hard-coding the list indefinitely. A minimal backend periodically reconciles Flap availability; the extension refreshes its cache every five hours or on demand and falls back to stale data, trading slight staleness for predictable launch-time performance without introducing a hosted application or signing service.
