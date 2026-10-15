"""Configure the existing router installation; never install firmware here."""
import re
import voluptuous as vol
from homeassistant import config_entries
from homeassistant.helpers import selector
from .controller import Router


class ConfigFlow(config_entries.ConfigFlow, domain="netcraze_vpn"):
    VERSION = 1

    async def async_step_user(self, user_input=None):
        errors = {}
        if user_input is not None:
            try:
                if not re.fullmatch(r"(?:\d{1,3}\.){3}\d{1,3}", user_input["host"]):
                    raise ValueError()
                if not re.fullmatch(r"(?:[0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}", user_input["client_mac"]):
                    raise ValueError()
                router = Router(user_input)
                try:
                    await router.read_config()
                finally:
                    await router.close()
                await self.async_set_unique_id(user_input["host"])
                self._abort_if_unique_id_configured()
                return self.async_create_entry(title="HA HAPP", data=user_input)
            except Exception:
                errors["base"] = "cannot_connect"
        return self.async_show_form(step_id="user", errors=errors, data_schema=vol.Schema({
            vol.Required("host"): str,
            vol.Required("username"): str,
            vol.Required("password"): selector.TextSelector({"type": "password"}),
            vol.Required("client_mac"): str,
            vol.Required("policy"): str,
        }))
