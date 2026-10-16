"""NDMS is authoritative for client names, connectivity and effective policy."""
import asyncio
import copy
import ipaddress
import json
import re
import time
from .controller import ControlError

MAC = re.compile(r"(?:[0-9a-f]{2}:){5}[0-9a-f]{2}")
BRIDGE = re.compile(r"Bridge\d+")


def category(name, hostname):
    """A search hint from names, not a hardware identity claim."""
    text = (name + " " + hostname).casefold()
    for kind, pattern in (
        ("tablet", r"планшет|ipad|\btablet\b|galaxy[ -]?tab|\bmi[ -]?pad\b"),
        ("tv", r"телевизор|\bsmart[ -]?tv\b|\b(?:apple[ -]?)?tv\b|bravia|webos|tizen"),
        ("phone", r"смартфон|телефон|iphone|\bphone\b|redmi|poco|pixel|galaxy|android|(?:^|[\s_-])(?:sm-)?[ams][0-9]{2}(?:[\s_-]|$)"),
        ("computer", r"ноутбук|компьютер|macbook|laptop|desktop|\bpc\b|imac"),
    ):
        if re.search(pattern, text):
            return kind
    return "other"


def host_list(body):
    data = json.loads(body)
    if isinstance(data, dict):
        data = data.get("host", [])
    if not isinstance(data, list):
        raise ControlError("NDMS вернул неожиданный список устройств")
    return {h["mac"].lower(): h for h in data if isinstance(h, dict) and MAC.fullmatch(h.get("mac", "").lower())}


class Devices:
    def __init__(self, controller):
        self.c = controller
        self.hosts, self.inventory = {}, {}
        self.updated = None
        self.sync_seconds = None

    @property
    def members(self):
        return self.c.data.setdefault("devices", {})

    @property
    def policy(self):
        return self.c.entry.data["policy"]

    async def configured(self):
        return host_list(await self.c.router.request("/rci/ip/hotspot/host"))

    async def sync(self):
        started = time.monotonic()
        hosts = await self.configured()
        runtime = host_list(await self.c.router.request("/rci/show/ip/hotspot"))
        changed = not self.c.data.get("device_list_initialized")
        if changed:
            self.members[self.c.entry.data["client_mac"].lower()] = {"previous_policy": None}
            self.c.data["device_list_initialized"] = True
        inventory = {}
        for mac in hosts.keys() | runtime.keys() | self.members.keys():
            cfg, live = hosts.get(mac, {}), runtime.get(mac, {})
            old = self.inventory.get(mac, {})
            name = str(live.get("name") or old.get("name") or live.get("hostname") or mac).strip()
            hostname = str(live.get("hostname") or "")
            interface = live.get("interface", {})
            bridge = interface.get("id", "") if isinstance(interface, dict) else ""
            bridge = bridge if BRIDGE.fullmatch(bridge) else old.get("bridge", "")
            if bridge:
                old_bridge = self.members.get(mac, {}).get("bridge")
                if mac in self.members and old_bridge != bridge:
                    self.members[mac]["bridge"] = bridge
                    changed = True
            else:
                bridge = self.members.get(mac, {}).get("bridge", "")
            policy = cfg.get("policy") or None
            # Adopt explicit assignments made in the stock NDMS UI; never enforce them periodically.
            if policy == self.policy and mac not in self.members:
                self.members[mac] = {"previous_policy": None, "bridge": bridge}
                changed = True
            reason = ""
            if not cfg:
                reason = "Сначала зарегистрируйте устройство в NDMS"
            elif not cfg.get("permit", False):
                reason = "Доступ в интернет запрещён в NDMS"
            elif re.search(r"точка доступа|сервер.*home.?assistant|home.?assistant.*server", name, re.I):
                reason = "Инфраструктура дома"
            elif not bridge:
                reason = "Сегмент станет известен после подключения устройства"
            inventory[mac] = {"mac": mac, "name": name, "hostname": hostname,
                "category": category(name, hostname), "online": bool(live.get("active")),
                "registered": bool(live.get("registered", bool(cfg))),
                "ip": live.get("ip", "") if live.get("ip") != "0.0.0.0" else "", "bridge": bridge,
                "vpn": policy == self.policy, "policy": policy, "selected": mac in self.members,
                "available": bool(cfg), "reason": reason, "selectable": not reason}
        self.hosts, self.inventory = hosts, inventory
        self.updated = time.time()
        self.sync_seconds = round(time.monotonic() - started, 3)
        routed = sum(inventory.get(mac, {}).get("vpn", False) for mac in self.members)
        self.c.data["mode"] = "vpn" if routed and routed == len(self.members) else "partial" if routed else "direct"
        if changed:
            await self.c.save()

    def public(self):
        rows = sorted(self.inventory.values(), key=lambda h: (not h["online"], h["name"].casefold(), h["mac"]))
        current = [h for h in rows if h["available"] and h["registered"]]
        return {"members": [h for h in rows if h["selected"]], "catalogue": current,
                "synced_at": self.updated, "sync_seconds": self.sync_seconds,
                "total": len(current), "registered_total": len(self.hosts),
                "online_total": sum(h["online"] for h in current),
                "vpn_count": sum(h["vpn"] for h in rows if h["selected"])}

    def validate_mac(self, value):
        mac = str(value).lower()
        if not MAC.fullmatch(mac):
            raise ControlError("Неверный MAC устройства")
        return mac

    async def add(self, value):
        mac = self.validate_mac(value)
        await self.sync()
        if mac in self.members:
            return
        host = self.inventory.get(mac)
        if not host or not host["available"]:
            raise ControlError("Устройство отсутствует среди зарегистрированных клиентов NDMS")
        if not host["registered"]:
            raise ControlError("Устройство не зарегистрировано. Обновите список NDMS")
        if host["reason"] == "Инфраструктура дома":
            raise ControlError("Устройства инфраструктуры не включаются в этот список")
        self.members[mac] = {"previous_policy": host["policy"], "bridge": host["bridge"]}
        await self.sync()

    async def ensure_segments(self, macs):
        addresses = set()
        interfaces = {}
        for mac in macs:
            host = self.inventory[mac]
            if not host["selectable"]:
                raise ControlError(host["name"] + ": " + host["reason"])
            bridge = host["bridge"]
            if bridge not in interfaces:
                interfaces[bridge] = json.loads(await self.c.router.request("/rci/show/interface/" + bridge))
            info = interfaces[bridge]
            address = info.get("address", "")
            try:
                valid = info.get("type") == "Bridge" and ipaddress.ip_address(address).version == 4 and ipaddress.ip_address(address).is_private
            except ValueError:
                valid = False
            if not valid:
                raise ControlError("Не удалось проверить локальный адрес сегмента " + bridge)
            addresses.add(address)
        raw, config = await self.c.router.read_config()
        original = copy.deepcopy(config)
        base = next((i for i in config.get("inbounds", []) if i.get("tag") == "redirect"), None)
        if not base or base.get("protocol") != "dokodemo-door" or not base.get("settings", {}).get("followRedirect"):
            raise ControlError("Не найден ожидаемый TCP-приёмник Xray")
        for address in sorted(addresses):
            if any(i.get("listen") == address and i.get("port") == base.get("port") for i in config["inbounds"]):
                continue
            extra = copy.deepcopy(base)
            tag = "redirect-lan-" + address.replace(".", "-")
            extra.update(tag=tag, listen=address)
            config["inbounds"].append(extra)
            for rule in config.get("routing", {}).get("rules", []):
                if "redirect" in rule.get("inboundTag", []):
                    rule["inboundTag"].append(tag)
                if rule.get("outboundTag") == "block" and str(rule.get("port")) == str(base["port"]) and base.get("listen") in rule.get("ip", []):
                    if address not in rule["ip"]:
                        rule["ip"].append(address)
        if config != original:
            await self.c.install_config(raw, config)

    async def set_policies(self, macs, enabled):
        if type(enabled) is not bool:
            raise ControlError("Ожидается состояние включено или выключено")
        await self.sync()
        macs = list(dict.fromkeys(self.validate_mac(m) for m in macs))
        if not macs:
            raise ControlError("Сначала добавьте устройства кнопкой «+»")
        if any(m not in self.members or m not in self.hosts for m in macs):
            raise ControlError("Состав устройств изменился. Обновите список из NDMS")
        if enabled:
            await self.ensure_segments(macs)
            await self.c.router.prepare()
            await self.c.router.script('curl --fail --silent --socks5-hostname 127.0.0.1:10810 --connect-timeout 5 --max-time 12 https://example.com/ -o /dev/null')
        before = await self.configured()
        old_members = copy.deepcopy(self.members)
        desired = {}
        for mac in macs:
            current = before[mac].get("policy") or None
            if enabled:
                if current != self.policy:
                    self.members[mac]["previous_policy"] = current
                desired[mac] = self.policy
            elif current == self.policy:
                desired[mac] = self.members[mac].get("previous_policy") or None
        changes = {m: p for m, p in desired.items() if (before[m].get("policy") or None) != p}
        if not changes:
            return
        raw, _ = await self.c.router.read_config()
        stamp = await self.c.backup(raw)
        # Keep a router-local NDMS backup as well as the protected HA copy.
        await self.c.router.rci({"parse": "copy running-config storage:rollback_vpn_devices_" + stamp + ".txt"})
        await self.c.save()  # Persist return policies before the first NDMS write.
        touched = []
        async def write(mac, policy):
            await self.c.router.rci({"ip": {"hotspot": {"host": {"mac": mac, "policy": policy or {"no": True}}}}})
        try:
            for mac, policy in changes.items():
                fresh = await self.configured()
                if fresh.get(mac) != before[mac]:
                    raise ControlError("Настройки устройства изменились параллельно в NDMS")
                touched.append(mac)
                await write(mac, policy)
            await self.c.router.rci({"parse": "system configuration save"})
            after = await self.configured()
            for mac, policy in changes.items():
                expected = {k: v for k, v in before[mac].items() if k != "policy"}
                actual = {k: v for k, v in after.get(mac, {}).items() if k != "policy"}
                if (after.get(mac, {}).get("policy") or None) != policy or expected != actual:
                    raise ControlError("NDMS не подтвердил политику или изменил другие настройки клиента")
        except BaseException:
            async def restore():
                current = await self.configured()
                for mac in reversed(touched):
                    if (current.get(mac, {}).get("policy") or None) not in (changes[mac], before[mac].get("policy") or None):
                        raise ControlError("Параллельное изменение NDMS: требуется проверить политику устройства")
                    await write(mac, before[mac].get("policy"))
                await self.c.router.rci({"parse": "system configuration save"})
                self.c.data["devices"] = old_members
                await self.c.save()
                await self.sync()
            await asyncio.shield(restore())
            raise
        await self.sync()

    async def remove(self, value):
        mac = self.validate_mac(value)
        if mac not in self.members:
            return
        await self.sync()
        if mac in self.hosts:
            await self.set_policies([mac], False)
        self.members.pop(mac)
        await self.sync()
