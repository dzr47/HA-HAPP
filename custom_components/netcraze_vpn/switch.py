"""The single-device switch affects only the configured main device."""
from datetime import timedelta
from homeassistant.components.switch import SwitchEntity
from . import DOMAIN
SCAN_INTERVAL = timedelta(seconds=5)


async def async_setup_entry(hass, entry, async_add_entities):
    c = hass.data[DOMAIN][entry.entry_id]
    async_add_entities([VPNSwitch(c, entry.entry_id), VPNGroupSwitch(c, entry.entry_id)])


class VPNSwitch(SwitchEntity):
    _attr_has_entity_name = True
    _attr_translation_key = "enabled"
    _attr_icon = "mdi:shield-lock"
    def __init__(self, controller, entry_id):
        self.controller = controller
        self._attr_unique_id = entry_id + "_enabled"

    @property
    def is_on(self):
        mac = self.controller.entry.data["client_mac"].lower()
        return self.controller.devices.hosts.get(mac, {}).get("policy") == self.controller.entry.data["policy"]

    @property
    def available(self):
        return self.controller.router_available and not self.controller.busy

    async def async_turn_on(self, **kwargs):
        self.controller.start("mode", {"mode": "vpn"})

    async def async_turn_off(self, **kwargs):
        self.controller.start("mode", {"mode": "direct"})

    async def async_update(self):
        pass  # UI jobs update the shared snapshot; never overlap a router transaction.


class VPNGroupSwitch(VPNSwitch):
    _attr_translation_key = "group_enabled"

    def __init__(self, controller, entry_id):
        super().__init__(controller, entry_id)
        self._attr_unique_id = entry_id + "_group_enabled"

    @property
    def is_on(self):
        return self.controller.data["mode"] in ("vpn", "partial")

    @property
    def extra_state_attributes(self):
        clients = self.controller.devices.public()
        return {"vpn_devices": clients["vpn_count"], "listed_devices": len(clients["members"])}

    async def async_turn_on(self, **kwargs):
        self.controller.start("group_mode", {"mode": "vpn"})

    async def async_turn_off(self, **kwargs):
        self.controller.start("group_mode", {"mode": "direct"})
