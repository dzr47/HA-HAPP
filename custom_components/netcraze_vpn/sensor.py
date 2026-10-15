"""No URLs or raw configurations in Recorder."""
from datetime import timedelta
from homeassistant.components.sensor import SensorEntity
from . import DOMAIN
SCAN_INTERVAL = timedelta(seconds=5)


async def async_setup_entry(hass, entry, async_add_entities):
    async_add_entities([VPNStatus(hass.data[DOMAIN][entry.entry_id], entry.entry_id)])


class VPNStatus(SensorEntity):
    _attr_name = "VPN — сервер"
    _attr_icon = "mdi:server-network"
    def __init__(self, controller, entry_id):
        self.controller = controller
        self._attr_unique_id = entry_id + "_server"

    @property
    def native_value(self):
        return self.controller.data.get("active_name", "Неизвестно")

    @property
    def extra_state_attributes(self):
        return {"mode": self.controller.data["mode"], "busy": self.controller.busy,
                "last_operation_seconds": self.controller.duration}

    async def async_update(self):
        pass
