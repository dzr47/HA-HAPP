# Router adapter plan

The current implementation is a **NetCraze NDMS + XKeen/Xray driver** embedded in the integration. It uses NDW2 authentication, `/rci/` commands, NDMS registered hosts and policies, `/ci/` file access, and an existing Xray config with `vpn-1` and transparent routing. Those are capabilities of this installation, not generic router APIs.

## Separation target

| Layer | Responsibility | Current module |
| --- | --- | --- |
| Home Assistant | Config entry, entities, WebSocket panel, permissions, storage | `__init__.py`, entities, panel JS |
| VPN catalogue | Download bounded HTTPS subscriptions; parse supported node formats | `controller.py` |
| Site rules | Normalize domain/IP lists and prepare routing changes | `site_routes.py` |
| Router adapter | Authenticate, inventory registered clients, read/apply policies, read/validate/install Xray config, probe and roll back | `controller.py`, `devices.py` |

The adapter interface should expose capabilities explicitly: `registered_clients`, `per_client_policy`, `vpn_node_selection`, `site_rules`, `router_probe`, `transactional_backup`. A UI operation must be unavailable when its adapter lacks the capability. Router writes must be compare-and-swap operations with a backup and a verified rollback path.

## Initial supported target

1. Move the existing NDMS/XKeen operations behind a `NetCrazeXKeenAdapter` without changing their transaction semantics.
2. Make the Xray file path, policy ID and related runtime paths configurable after validating their format and reachability. Preserve the fixed layout as an explicit compatibility profile.
3. Load the integration on a clean Home Assistant instance and verify discovery, setup, panel loading, source import, read-only state, a controlled router write, and rollback.

## Adding another router

For each model collect its exact model number, firmware version, available local API, VPN engine, authentication method, registered-client inventory and configuration backup/restore method. A Netgear router may expose only its own VPN server or client controls, without the per-device routing and Xray file operations used here. Its adapter can expose only features it actually supports; it must not reuse NDMS commands.

OpenWrt, stock Netgear, and other router families have **no driver in this repository yet**. Their support requires a specific model and implementation plus validation on real or safely simulated hardware.
