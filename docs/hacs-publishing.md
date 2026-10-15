# HACS publishing

## Installation from this repository

Users can add `https://github.com/dzr47/HA-HAPP` in HACS as a custom **Integration** repository. They do not need access to the maintainer's GitHub account. HACS itself requires its normal GitHub device authorization when it is first configured in Home Assistant.

This repository contains one integration in `custom_components/netcraze_vpn`. HACS copies that directory into Home Assistant. The project has no dependency on another NDMS HACS integration. The NetCraze/XKeen router layout described in the README is still required.

## First release

1. Keep the version in `custom_components/netcraze_vpn/manifest.json` and the release tag aligned, for example `0.1.0` and `v0.1.0`.
2. Add release notes at `docs/releases/v0.1.0.md`.
3. Ensure GitHub **About** has a description and topics, and Issues are enabled. HACS validation checks these repository settings.
4. Push changes to `main` and wait for both HACS and hassfest checks to pass.
5. Push the matching `v*` tag. The release workflow runs both checks again and publishes a full GitHub Release with the prepared notes. If validation fails, it creates no release.

The GitHub Release contains the source archive that HACS downloads; there is no separate binary build or router firmware image.

## Default HACS catalogue

The custom repository route works without a listing in the default HACS catalogue. For default inclusion, the repository must be public, pass HACS Action without ignored checks and hassfest, and have a full GitHub Release published after those checks. The owner or a major contributor then submits a pull request to the alphabetical `integration` list in `hacs/default`. Inclusion is reviewed by HACS maintainers and is not automatic.

Before proposing default inclusion, verify installation and setup on a clean Home Assistant instance and a controlled router trial. The initial release currently documents support only for the NetCraze NC-1812 / NDMS 5.1.7 XKeen/Xray layout.
