# HA-HAPP

Custom integration for Home Assistant to manage an **existing** NetCraze/XKeen/Xray VPN installation. It provides a sidebar panel, registered-device selection, VPN subscription updates, server checks, and site routing lists.

**Status: early public release.** This is an independent Home Assistant integration, with its own config flow, entities and panel. It does not require a separate NDMS integration. The current implementation is specific to NetCraze/NDMS and its Xray layout; support for Netgear and other router families requires separate adapters. Installation on a clean Home Assistant instance is not yet verified.

## Current compatibility

| Component | Current requirement |
| --- | --- |
| Router | NetCraze with NDMS API and NDW2 local authentication; developed on NC-1812 / NDMS 5.1.7 |
| VPN runtime | XKeen and Xray already installed through Entware |
| Xray configuration | `/opt/etc/xray/configs/00_happ.json`, readable through `/ci/storage:/etc/xray/configs/00_happ.json` |
| Xray route tags | Existing `vpn-1` VLESS outbound and the expected transparent routing structure |
| Router access | Local administrator account; HTTP management reachable only from the trusted LAN |
| Subscription format | VLESS TCP/raw REALITY URI list, plain text or Base64; other formats are skipped |
| Home Assistant UI | Config flow has English and Russian labels; the sidebar panel is currently in Russian |

Installing this integration does **not** install XKeen, Xray, a VPN server, or router firmware. The setup flow reads the existing Xray configuration and rejects a different layout. Router models and firmware not listed above are unverified. See [adapter plan](docs/adapter-plan.md).

## What it does

- Manage up to ten HTTPS subscription sources, select a VLESS REALITY node, and apply it with Xray validation, router backup and rollback on a failed check.
- Show registered NDMS clients, including offline devices; select which clients use the existing VPN policy and restore their previous policy when disabled.
- Check TCP connection time from Home Assistant and HTTPS responses through each VPN node on the router. The current fixed probes are MAX Web, Gosuslugi, ChatGPT, Instagram, Telegram Web and YouTube. A page response does not prove an app login, call or video stream works.
- Import site routing lists from text or an HTTPS URL. Without a configured source, the “update VPN list” button reports that a source is needed. The site-routing mode starts **off**; a successful VPN-list sync selects “VPN only for listed sites” and applies the checked Xray config.

The integration does not automatically choose a server or refresh sources on a schedule. Router configuration changes are explicit panel actions. Other devices keep their existing NDMS policies.

## Install through HACS

1. In HACS, open the menu and add `https://github.com/dzr47/HA-HAPP` as a custom **Integration** repository. Download the latest release when one is available; until then HACS can use the default branch.
2. Restart Home Assistant. In **Settings → Devices & services → Add integration**, choose **HA HAPP (NetCraze/XKeen)**.
3. Enter the router IPv4 address, local administrator credentials, a registered main device MAC and the ID of the already configured VPN access policy. The main device is used by the single-device switch; the panel can manage additional registered devices.
4. Open **HA HAPP** in the sidebar. Add a subscription and, if needed, an HTTPS source for the VPN site list under **Маршрутизация сайтов**.

The integration domain remains `netcraze_vpn`. It cannot be installed alongside a manually copied custom integration with the same domain. Back up Home Assistant and the router before replacing an existing installation.

## Privacy and operational limits

Subscription URLs, device selection and node catalogue stay in private Home Assistant storage; the router password is in the config entry. The router receives candidate Xray files and keeps local rollback copies. Home Assistant also keeps timestamped copies of Xray and startup configuration under `netcraze_vpn_backups/`. These backups can contain secrets and must not be uploaded to GitHub.

The administrative NDMS connection uses HTTP on the local network. Run Home Assistant and router management on a trusted LAN. The panel requires a Home Assistant administrator. Removing the integration removes its controls; it does not uninstall the VPN or automatically revert router configuration.

## Repository layout

- `custom_components/netcraze_vpn/`: Home Assistant integration and panel assets.
- `custom_components/netcraze_vpn/brand/`: HACS icon.
- `docs/adapter-plan.md`: capability boundaries and work needed for other routers.
- `SECURITY.md`: handling of router and subscription secrets.

The project uses the MIT license. HACS and hassfest checks run on changes to `main`; release tags are published as full GitHub releases only after both checks pass. A clean Home Assistant installation and a controlled router trial are still needed before broad compatibility claims. See the [publishing process](docs/hacs-publishing.md), [release notes](docs/releases/v0.1.0.md) and [adapter plan](docs/adapter-plan.md).
