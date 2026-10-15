"""Secret-free buttons can also be used by HA automations."""
from homeassistant.components.button import ButtonEntity
from . import DOMAIN


async def async_setup_entry(hass, entry, async_add_entities):
    c = hass.data[DOMAIN][entry.entry_id]
    async_add_entities([VPNButton(c, entry.entry_id, key, name) for key, name in (
        ("refresh", "VPN — обновить подписки"), ("probe", "VPN — проверить VPN и сервисы"),
        ("status", "VPN — обновить состояние"), ("device_sync", "VPN — обновить устройства NDMS"))])


class VPNButton(ButtonEntity):
    _attr_icon = "mdi:shield-sync"
    def __init__(self, controller, entry_id, action, name):
        self.controller, self.action = controller, action
        self._attr_unique_id = entry_id + "_" + action
        self._attr_name = name

    async def async_press(self):
        self.controller.start(self.action, {})
