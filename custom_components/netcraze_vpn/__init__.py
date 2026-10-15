"""Home Assistant panel for the existing NetCraze VPN installation."""
from pathlib import Path
from datetime import timedelta
import voluptuous as vol
from homeassistant.components import frontend, panel_custom, websocket_api
from homeassistant.components.http import StaticPathConfig
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.storage import Store
from homeassistant.helpers.event import async_track_time_interval
from .controller import Controller, ControlError

DOMAIN = "netcraze_vpn"
CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)
PLATFORMS = ["switch", "button", "sensor"]
ACTIONS = ("status", "source_save", "source_delete", "refresh", "select", "probe", "check", "apply", "mode",
           "device_sync", "device_add", "device_remove", "device_set", "group_mode",
           "routes_save", "routes_mode", "routes_refresh", "routes_sync_vpn", "routes_validate", "routes_apply")


async def async_setup(hass, config):
    hass.data.setdefault(DOMAIN, {})
    await hass.http.async_register_static_paths([StaticPathConfig(
        "/netcraze_vpn/panel.js", str(Path(__file__).parent / "panel.js"), False), StaticPathConfig(
        "/netcraze_vpn/devices-panel.js", str(Path(__file__).parent / "devices-panel.js"), False), StaticPathConfig(
        "/netcraze_vpn/routes-panel.js", str(Path(__file__).parent / "routes-panel.js"), False)])
    websocket_api.async_register_command(hass, ws_state)
    websocket_api.async_register_command(hass, ws_action)
    return True


async def async_setup_entry(hass, entry):
    controller = Controller(hass, entry, Store(hass, 1, DOMAIN + "." + entry.entry_id,
                                             private=True, atomic_writes=True))
    hass.data[DOMAIN][entry.entry_id] = controller
    try:
        await controller.load()
    except Exception:
        controller.message = "Роутер недоступен. Нажмите «Обновить состояние» после восстановления связи."
    await panel_custom.async_register_panel(hass, "ha-happ", "netcraze-vpn-panel", sidebar_title="HA HAPP",
        sidebar_icon="mdi:shield-lock", module_url="/netcraze_vpn/panel.js?v=0.1.0", require_admin=True)
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    entry.async_on_unload(async_track_time_interval(hass, controller.poll, timedelta(seconds=30)))
    return True


async def async_unload_entry(hass, entry):
    if not await hass.config_entries.async_unload_platforms(entry, PLATFORMS):
        return False
    controller = hass.data[DOMAIN].pop(entry.entry_id)
    if controller.task and not controller.task.done():
        # Finish or restore an active router transaction before removing its controller.
        await controller.task
    await controller.router.close()
    frontend.async_remove_panel(hass, "ha-happ")
    return True


def controller(hass):
    instances = hass.data.get(DOMAIN, {})
    if not instances:
        raise ControlError("Интеграция VPN ещё не настроена")
    return next(iter(instances.values()))


@websocket_api.websocket_command({vol.Required("type"): "netcraze_vpn/state"})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_state(hass, connection, msg):
    try:
        connection.send_result(msg["id"], controller(hass).public())
    except ControlError as error:
        connection.send_error(msg["id"], "not_ready", str(error))


@websocket_api.websocket_command({vol.Required("type"): "netcraze_vpn/action",
    vol.Required("action"): vol.In(ACTIONS), vol.Optional("payload", default={}): dict})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_action(hass, connection, msg):
    try:
        controller(hass).start(msg["action"], msg["payload"])
        connection.send_result(msg["id"], {"accepted": True})
    except ControlError as error:
        connection.send_error(msg["id"], "busy", str(error))
