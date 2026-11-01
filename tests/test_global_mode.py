"""Router transaction checks without Home Assistant or a real NetCraze."""

import asyncio
import copy
import importlib.util
import json
import sys
import types
import unittest
from pathlib import Path


package = types.ModuleType("vpn_test")
package.__path__ = []
sys.modules["vpn_test"] = package
controller_module = types.ModuleType("vpn_test.controller")
controller_module.ControlError = type("ControlError", (Exception,), {})
sys.modules["vpn_test.controller"] = controller_module
routes_module = types.ModuleType("vpn_test.site_routes")
routes_module.PREFIX = "ha-vpn-sites-"
sys.modules["vpn_test.site_routes"] = routes_module
spec = importlib.util.spec_from_file_location(
    "vpn_test.global_mode",
    Path(__file__).resolve().parents[1] / "custom_components/netcraze_vpn/global_mode.py",
)
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)


def config():
    tags = ["redirect", "tproxy", "redirect-lan"]
    return {
        "inbounds": [
            {"tag": "redirect", "listen": "192.168.1.1", "protocol": "dokodemo-door",
             "settings": {"network": "tcp", "followRedirect": True}},
            {"tag": "tproxy", "listen": "127.0.0.1", "protocol": "dokodemo-door",
             "settings": {"network": "udp", "followRedirect": True}},
            {"tag": "redirect-lan", "listen": "172.16.1.1", "protocol": "dokodemo-door",
             "settings": {"network": "tcp", "followRedirect": True}},
        ],
        "routing": {"domainStrategy": "AsIs", "rules": [
            {"type": "field", "ip": ["192.168.0.0/16", "224.0.0.0/4", "fc00::/7", "ff00::/8"], "outboundTag": "direct"},
            {"type": "field", "ruleTag": "ha-vpn-sites-default",
             "inboundTag": tags, "outboundTag": "direct"},
            {"type": "field", "inboundTag": tags, "outboundTag": "vpn-1"},
        ]},
    }


class Router:
    def __init__(self):
        self.config = config()
        self.default = None
        self.interfaces = {"Bridge2": "permit"}
        self.hosts = {"aa:bb:cc:dd:ee:01": {"policy": "Policy0", "permit": True},
                      "aa:bb:cc:dd:ee:02": {"policy": None, "permit": True},
                      "aa:bb:cc:dd:ee:03": {"policy": "Policy1", "permit": True}}
        self.fail_interface_once = False

    async def read_config(self):
        return json.dumps(self.config).encode(), copy.deepcopy(self.config)

    async def request(self, path):
        if path.endswith("default-policy"):
            return json.dumps({"access": self.default} if self.default else {}).encode()
        if path.endswith("/policy"):
            return json.dumps([{"interface": k, "access": v}
                               for k, v in self.interfaces.items()]).encode()
        if path.endswith("/show/interface"):
            return json.dumps({
                "Bridge0": {"address": "192.168.1.1", "type": "Bridge"},
                "Bridge2": {"address": "172.16.1.1", "type": "Bridge"},
            }).encode()
        raise AssertionError(path)

    async def prepare(self):
        return None

    async def script(self, command):
        return None

    async def rci(self, body):
        if "parse" in body:
            command = body["parse"].split()
            if command[:3] == ["ip", "hotspot", "default-policy"]:
                self.default = command[3]
            elif command[:4] == ["no", "ip", "hotspot", "default-policy"]:
                self.default = None
            elif command[:3] == ["ip", "hotspot", "policy"]:
                if self.fail_interface_once:
                    self.fail_interface_once = False
                    raise controller_module.ControlError("injected interface failure")
                self.interfaces[command[3]] = command[4]
            elif command[:4] == ["no", "ip", "hotspot", "policy"]:
                self.interfaces.pop(command[4], None)
            elif body["parse"].startswith(("copy ", "system configuration save")):
                pass
            else:
                raise AssertionError(body)
        else:
            row = body["ip"]["hotspot"]["host"]
            value = row["policy"]
            self.hosts[row["mac"]]["policy"] = None if isinstance(value, dict) else value


class Devices:
    def __init__(self, router):
        self.router = router

    async def configured(self):
        return copy.deepcopy(self.router.hosts)


class Controller:
    def __init__(self):
        self.router = Router()
        self.devices = Devices(self.router)
        self.entry = types.SimpleNamespace(data={"policy": "Policy0"})
        self.data = {}
        self.global_mode = module.GlobalMode(self)

    async def save(self):
        return None

    async def backup(self, raw):
        return "20261101_120000_test"

    async def install_config(self, raw, candidate):
        self.router.config = copy.deepcopy(candidate)

    async def refresh_status(self):
        _, current = await self.router.read_config()
        await self.global_mode.observe(current)


class GlobalModeTest(unittest.TestCase):
    def test_switch_restores_lower_rules_and_existing_host_policy(self):
        c = Controller()
        original = copy.deepcopy(c.router.config)
        asyncio.run(c.global_mode.set(True))
        self.assertTrue(c.global_mode.verified)
        self.assertEqual(c.router.default, "Policy0")
        self.assertEqual(c.router.interfaces["Bridge2"], "Policy0")
        self.assertEqual(c.router.hosts["aa:bb:cc:dd:ee:03"]["policy"], "Policy0")
        self.assertEqual(c.router.hosts["aa:bb:cc:dd:ee:02"]["policy"], "Policy0")
        self.assertEqual(c.router.config["routing"]["rules"], module.full_vpn_config(original)["routing"]["rules"])
        asyncio.run(c.global_mode.set(False))
        self.assertIsNone(c.router.default)
        self.assertEqual(c.router.interfaces["Bridge2"], "permit")
        self.assertEqual(c.router.hosts["aa:bb:cc:dd:ee:03"]["policy"], "Policy1")
        self.assertIsNone(c.router.hosts["aa:bb:cc:dd:ee:02"]["policy"])
        self.assertEqual(c.router.config["routing"]["rules"], original["routing"]["rules"])

    def test_external_direct_route_is_rejected(self):
        candidate = config()
        candidate["routing"]["rules"].insert(1, {"type": "field",
            "ip": ["8.8.8.8/32"], "outboundTag": "direct"})
        with self.assertRaises(controller_module.ControlError):
            module.full_vpn_config(candidate)

    def test_failed_router_write_restores_lower_rules(self):
        c = Controller()
        original = copy.deepcopy(c.router.config)
        c.router.fail_interface_once = True
        with self.assertRaises(controller_module.ControlError):
            asyncio.run(c.global_mode.set(True))
        self.assertFalse(c.global_mode.enabled)
        self.assertIsNone(c.router.default)
        self.assertEqual(c.router.interfaces["Bridge2"], "permit")
        self.assertEqual(c.router.hosts["aa:bb:cc:dd:ee:03"]["policy"], "Policy1")
        self.assertEqual(c.router.config["routing"]["rules"], original["routing"]["rules"])


if __name__ == "__main__":
    unittest.main()
