"""A reversible router-wide override above per-device and site-list controls."""

import asyncio
import copy
import ipaddress
import json
import re
import time

from .controller import ControlError
from .site_routes import PREFIX

NAME = re.compile(r"[A-Za-z0-9_-]{1,64}")
BRIDGE = re.compile(r"Bridge\d+")


def default_value(value):
    if not isinstance(value, dict):
        raise ControlError("NDMS вернул неизвестную общую политику")
    value = value.get("access") or value.get("policy") or value.get("default-policy")
    if value is not None and not NAME.fullmatch(str(value)):
        raise ControlError("NDMS вернул неизвестную общую политику")
    return value


def interface_values(value):
    if isinstance(value, dict) and "interface" in value:
        value = [value]
    elif isinstance(value, dict):
        value = value.get("policy", [])
    if isinstance(value, dict):
        value = [value]
    if not isinstance(value, list):
        raise ControlError("NDMS вернул неизвестные политики сегментов")
    result = {}
    for row in value:
        if not isinstance(row, dict) or not BRIDGE.fullmatch(str(row.get("interface", ""))):
            raise ControlError("NDMS вернул неизвестную политику сегмента")
        policy = row.get("access") or row.get("policy")
        if not policy or not NAME.fullmatch(str(policy)):
            raise ControlError("NDMS вернул неизвестную политику сегмента")
        result[row["interface"]] = policy
    return result


def full_vpn_config(config):
    """Remove site rules while retaining LAN, DNS, loop and tunnel safeguards."""
    candidate = copy.deepcopy(config)
    routing = candidate.get("routing", {})
    if routing.get("script") or routing.get("domainStrategy") != "AsIs":
        raise ControlError("Схема Xray изменилась; общий режим не применяется")
    rules = routing.get("rules", [])
    if not isinstance(rules, list) or not rules:
        raise ControlError("Не найдены правила Xray")
    base = [r for r in rules if not str(r.get("ruleTag", "")).startswith(PREFIX)]
    if not base or base[-1].get("outboundTag") != "vpn-1":
        raise ControlError("Последний маршрут Xray не ведёт в выбранный VPN")
    if set(base[-1]) - {"type", "inboundTag", "outboundTag"}:
        raise ControlError("Последний маршрут Xray имеет дополнительные условия")
    tags = set(base[-1].get("inboundTag", []))
    inbounds = {i.get("tag"): i for i in candidate.get("inbounds", [])}
    if not {"redirect", "tproxy"}.issubset(tags):
        raise ControlError("Xray не охватывает TCP и UDP")
    for tag in tags - {"dns-query", "local-check"}:
        inbound = inbounds.get(tag, {})
        if inbound.get("protocol") != "dokodemo-door" or not inbound.get("settings", {}).get("followRedirect"):
            raise ControlError("Неизвестный приёмник трафика Xray")
    for rule in base[:-1]:
        if rule.get("outboundTag") != "direct":
            continue
        addresses = rule.get("ip", [])
        if not addresses or rule.get("domain") or rule.get("port"):
            raise ControlError("Обнаружено внешнее прямое правило Xray")
        try:
            if any((network.is_global and not network.is_multicast)
                   for network in (ipaddress.ip_network(address, strict=False) for address in addresses)):
                raise ControlError("Обнаружено внешнее прямое правило Xray")
        except ValueError:
            raise ControlError("Обнаружено неизвестное прямое правило Xray") from None
    routing["rules"] = base
    return candidate


class GlobalMode:
    def __init__(self, controller):
        self.c = controller
        self.verified = False
        self.reason = ""

    @property
    def data(self):
        return self.c.data.setdefault("global_vpn", {"enabled": False})

    @property
    def enabled(self):
        return bool(self.data.get("enabled"))

    async def read_default(self):
        return default_value(json.loads(await self.c.router.request("/rci/ip/hotspot/default-policy")))

    async def read_interfaces(self):
        return interface_values(json.loads(await self.c.router.request("/rci/ip/hotspot/policy")))

    async def check_segments(self, config):
        data = json.loads(await self.c.router.request("/rci/show/interface"))
        if not isinstance(data, dict):
            raise ControlError("NDMS не вернул локальные сегменты")
        listeners = {i.get("listen") for i in config.get("inbounds", [])
                     if i.get("protocol") == "dokodemo-door"
                     and i.get("settings", {}).get("network") == "tcp"}
        segments = [v.get("address") for k, v in data.items()
                    if BRIDGE.fullmatch(k) and isinstance(v, dict)
                    and v.get("type") == "Bridge" and v.get("address")]
        if not segments or any(address not in listeners for address in segments):
            raise ControlError("Xray не охватывает все локальные сегменты")

    async def set_default(self, value):
        command = "ip hotspot default-policy " + value if value else "no ip hotspot default-policy"
        await self.c.router.rci({"parse": command})

    async def set_interface(self, bridge, value):
        if not BRIDGE.fullmatch(bridge) or (value and not NAME.fullmatch(value)):
            raise ControlError("Неверная политика сегмента")
        command = f"ip hotspot policy {bridge} {value}" if value else f"no ip hotspot policy {bridge}"
        await self.c.router.rci({"parse": command})

    async def set_host(self, mac, value):
        await self.c.router.rci({"ip": {"hotspot": {"host": {
            "mac": mac, "policy": value or {"no": True}}}}})

    async def observe(self, config):
        if not self.enabled:
            self.verified, self.reason = False, ""
            return
        policy = self.c.entry.data["policy"]
        default = await self.read_default()
        interfaces = await self.read_interfaces()
        hosts = await self.c.devices.configured()
        expected = self.data["before"]
        problems = []
        if default != policy:
            problems.append("общая политика NDMS изменилась")
        if any(value != policy for value in interfaces.values()) or any(
                bridge not in interfaces for bridge in expected["interfaces"]):
            problems.append("политика сегмента изменилась")
        if any(h.get("policy") != policy for h in hosts.values() if h.get("permit", True)):
            problems.append("у клиента появилось правило обхода")
        if any(str(r.get("ruleTag", "")).startswith(PREFIX)
               for r in config.get("routing", {}).get("rules", [])):
            problems.append("правила сайтов снова активны")
        try:
            await self.check_segments(config)
        except ControlError:
            problems.append("появился сегмент без приёмника Xray")
        try:
            full_vpn_config(config)
        except ControlError:
            problems.append("маршрут Xray изменился")
        self.verified = not problems
        self.reason = "; ".join(problems)

    def public(self):
        return {"enabled": self.enabled, "verified": self.verified,
                "reason": self.reason, "since": self.data.get("since")}

    async def set(self, enabled):
        if type(enabled) is not bool:
            raise ControlError("Ожидается состояние общего переключателя")
        if enabled == self.enabled:
            await self.c.refresh_status()
            return
        policy = self.c.entry.data["policy"]
        if not NAME.fullmatch(policy):
            raise ControlError("Неверное имя VPN-политики")
        if enabled:
            await self.turn_on(policy)
        else:
            await self.turn_off(policy)

    async def recover(self):
        """Finish a guarded rollback after an interrupted router transaction."""
        phase = self.data.get("phase")
        if phase not in ("activating", "deactivating"):
            return
        snapshot = self.data.get("before")
        policy = self.c.entry.data["policy"]
        if not isinstance(snapshot, dict) or not NAME.fullmatch(policy):
            raise ControlError("Неполная запись общего VPN: требуется восстановление из backup")
        raw, config = await self.c.router.read_config()
        current_default = await self.read_default()
        current_interfaces = await self.read_interfaces()
        permitted_default = (snapshot["default"], policy)
        if current_default not in permitted_default:
            raise ControlError("Общая политика изменена извне; автоматический откат остановлен")
        if any(current_interfaces.get(b) not in (old, policy)
               for b, old in snapshot["interfaces"].items()):
            raise ControlError("Политика сегмента изменена извне; автоматический откат остановлен")
        stamp = await self.c.backup(raw)
        await self.c.router.rci({"parse": "copy running-config storage:rollback_vpn_global_" + stamp + ".txt"})
        if phase == "activating":
            for mac, old in snapshot["hosts"].items():
                current = (await self.c.devices.configured()).get(mac, {}).get("policy")
                if current not in (old, policy):
                    raise ControlError("Политика клиента изменена извне; автоматический откат остановлен")
                if current != old:
                    await self.set_host(mac, old)
            for bridge, old in snapshot["interfaces"].items():
                await self.set_interface(bridge, old)
            await self.set_default(snapshot["default"])
            await self.c.router.rci({"parse": "system configuration save"})
            candidate = copy.deepcopy(config)
            candidate["routing"]["rules"] = copy.deepcopy(snapshot["rules"])
            if candidate != config:
                await self.c.install_config(raw, candidate)
            self.c.data["global_vpn"] = {"enabled": False}
        else:
            candidate = full_vpn_config(config)
            if candidate != config:
                await self.c.install_config(raw, candidate)
            await self.set_default(policy)
            for bridge in snapshot["interfaces"]:
                await self.set_interface(bridge, policy)
            for mac in snapshot["hosts"]:
                await self.set_host(mac, policy)
            await self.c.router.rci({"parse": "system configuration save"})
            self.data["enabled"] = True
            self.data["phase"] = ""
        await self.c.save()

    async def reconcile_hosts(self):
        """Keep newly assigned per-host policies below the active global override."""
        if not self.enabled or self.data.get("phase"):
            return
        policy = self.c.entry.data["policy"]
        raw, config = await self.c.router.read_config()
        if full_vpn_config(config) != config or await self.read_default() != policy:
            return
        interfaces = await self.read_interfaces()
        if any(value != policy for value in interfaces.values()) or any(
                bridge not in interfaces for bridge in self.data["before"]["interfaces"]):
            return
        hosts = await self.c.devices.configured()
        conflicts = {mac: h.get("policy") or None for mac, h in hosts.items()
                     if h.get("permit", True) and h.get("policy") != policy}
        if not conflicts:
            return
        stamp = await self.c.backup(raw)
        await self.c.router.rci({"parse": "copy running-config storage:rollback_vpn_global_" + stamp + ".txt"})
        for mac, old in conflicts.items():
            self.data["before"]["hosts"].setdefault(mac, old)
        await self.c.save()
        for mac in conflicts:
            fresh = await self.c.devices.configured()
            if fresh.get(mac, {}).get("policy") != conflicts[mac]:
                raise ControlError("Политика нового клиента изменена параллельно")
            await self.set_host(mac, policy)
        await self.c.router.rci({"parse": "system configuration save"})
        after = await self.c.devices.configured()
        if any(after.get(mac, {}).get("policy") != policy for mac in conflicts):
            raise ControlError("NDMS не подтвердил приоритетную политику нового клиента")

    async def turn_on(self, policy):
        raw, config = await self.c.router.read_config()
        candidate = full_vpn_config(config)
        await self.check_segments(config)
        default = await self.read_default()
        interfaces = await self.read_interfaces()
        hosts = await self.c.devices.configured()
        overrides = {mac: h.get("policy") or None for mac, h in hosts.items()
                     if h.get("permit", True) and h.get("policy") != policy}
        snapshot = {"default": default, "interfaces": interfaces,
                    "hosts": overrides, "rules": copy.deepcopy(config["routing"]["rules"])}
        await self.c.router.prepare()
        await self.c.router.script(
            "curl --fail --silent --socks5-hostname 127.0.0.1:10810 "
            "--connect-timeout 5 --max-time 12 https://example.com/ -o /dev/null")
        stamp = await self.c.backup(raw)
        await self.c.router.rci({"parse": "copy running-config storage:rollback_vpn_global_" + stamp + ".txt"})
        self.data.update({"enabled": False, "phase": "activating", "before": snapshot})
        await self.c.save()
        try:
            if candidate != config:
                await self.c.install_config(raw, candidate)
            await self.set_default(policy)
            for bridge in interfaces:
                if interfaces[bridge] != policy:
                    await self.set_interface(bridge, policy)
            for mac in overrides:
                await self.set_host(mac, policy)
            await self.c.router.rci({"parse": "system configuration save"})
            if await self.read_default() != policy:
                raise ControlError("NDMS не подтвердил общую VPN-политику")
            current_interfaces = await self.read_interfaces()
            if any(current_interfaces.get(b) != policy for b in interfaces):
                raise ControlError("NDMS не подтвердил VPN-политику сегментов")
            current_hosts = await self.c.devices.configured()
            if any(current_hosts.get(m, {}).get("policy") != policy for m in overrides):
                raise ControlError("NDMS не подтвердил политики клиентов")
            self.data.update({"enabled": True, "phase": "", "since": time.time()})
            await self.c.save()
            await self.c.refresh_status()
            if not self.verified:
                raise ControlError("Общий VPN не подтверждён: " + self.reason)
        except BaseException:
            async def restore():
                for mac, value in overrides.items():
                    await self.set_host(mac, value)
                for bridge, value in interfaces.items():
                    await self.set_interface(bridge, value)
                await self.set_default(default)
                await self.c.router.rci({"parse": "system configuration save"})
                current_raw, current = await self.c.router.read_config()
                current["routing"]["rules"] = snapshot["rules"]
                if current_raw != raw:
                    await self.c.install_config(current_raw, current)
                self.c.data["global_vpn"] = {"enabled": False}
                await self.c.save()
            await asyncio.shield(restore())
            raise

    async def turn_off(self, policy):
        snapshot = self.data.get("before")
        if not isinstance(snapshot, dict):
            raise ControlError("Не найдены сохранённые правила для возврата")
        raw, config = await self.c.router.read_config()
        await self.observe(config)
        if not self.verified and self.reason != "у клиента появилось правило обхода":
            raise ControlError("Общий режим изменён извне: " + self.reason)
        restored = copy.deepcopy(config)
        restored["routing"]["rules"] = copy.deepcopy(snapshot["rules"])
        stamp = await self.c.backup(raw)
        await self.c.router.rci({"parse": "copy running-config storage:rollback_vpn_global_" + stamp + ".txt"})
        self.data["phase"] = "deactivating"
        await self.c.save()
        try:
            for mac, value in snapshot["hosts"].items():
                await self.set_host(mac, value)
            for bridge, value in snapshot["interfaces"].items():
                await self.set_interface(bridge, value)
            await self.set_default(snapshot["default"])
            await self.c.router.rci({"parse": "system configuration save"})
            if await self.read_default() != snapshot["default"]:
                raise ControlError("NDMS не подтвердил возврат общей политики")
            current_interfaces = await self.read_interfaces()
            if any(current_interfaces.get(b) != v for b, v in snapshot["interfaces"].items()):
                raise ControlError("NDMS не подтвердил возврат политики сегментов")
            current_hosts = await self.c.devices.configured()
            if any(current_hosts.get(m, {}).get("policy") != v for m, v in snapshot["hosts"].items()):
                raise ControlError("NDMS не подтвердил возврат политики клиентов")
            if restored != config:
                await self.c.install_config(raw, restored)
            check_raw, check_config = await self.c.router.read_config()
            if check_config["routing"]["rules"] != snapshot["rules"]:
                raise ControlError("Xray не подтвердил возврат маршрутов")
        except BaseException:
            async def restore():
                await self.set_default(policy)
                for bridge in snapshot["interfaces"]:
                    await self.set_interface(bridge, policy)
                for mac in snapshot["hosts"]:
                    await self.set_host(mac, policy)
                await self.c.router.rci({"parse": "system configuration save"})
                current_raw, current = await self.c.router.read_config()
                global_config = full_vpn_config(current)
                if current != global_config:
                    await self.c.install_config(current_raw, global_config)
                self.data["phase"] = ""
                await self.c.save()
            await asyncio.shield(restore())
            raise
        self.c.data["global_vpn"] = {"enabled": False}
        await self.c.save()
        await self.c.refresh_status()
