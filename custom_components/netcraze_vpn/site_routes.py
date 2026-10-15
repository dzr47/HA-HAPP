"""Private domain-list drafts and guarded compilation of Xray routing rules."""
import copy
import hashlib
import ipaddress
import json
import re
import time
from urllib.parse import urlsplit

from .controller import ControlError, valid_url

MODES = {"off": "Без правил сайтов", "vpn_default": "Всё через VPN, кроме белого списка",
         "direct_default": "Через VPN только сайты из списка"}
PREFIX = "ha-vpn-sites-"
LIMIT = 262144


def parse_entries(text):
    if not isinstance(text, str) or len(text.encode("utf-8")) > LIMIT:
        raise ControlError("Список должен быть текстом UTF-8 размером до 256 КБ")
    result = set()
    for index, line in enumerate(text.lstrip("\ufeff").splitlines(), 1):
        value = line.split("#", 1)[0].strip()
        if not value:
            continue
        kind = "domain"
        if value.startswith(("domain:", "full:")):
            kind, value = value.split(":", 1)
        elif value.startswith("ip:"):
            try:
                network = ipaddress.ip_network(value[3:].strip(), strict=True)
            except ValueError:
                raise ControlError(f"Строка {index}: неверный IP-адрес или CIDR") from None
            result.add("ip:" + (str(network.network_address) if network.prefixlen == network.max_prefixlen
                                  else network.with_prefixlen))
            if len(result) > 5000:
                raise ControlError("В одном списке допускается до 5000 адресов и доменов")
            continue
        if value.startswith("*."):
            value = value[2:]
        if "://" in value:
            try:
                url = urlsplit(value)
                if url.scheme not in ("https", "http") or url.username or url.password or url.port:
                    raise ValueError()
                value = url.hostname or ""
            except ValueError:
                raise ControlError(f"Строка {index}: нужен домен или URL сайта без логина и порта") from None
        try:
            network = ipaddress.ip_network(value, strict=True)
        except ValueError:
            network = None
        if network is not None:
            result.add("ip:" + (str(network.network_address) if network.prefixlen == network.max_prefixlen
                                  else network.with_prefixlen))
            if len(result) > 5000:
                raise ControlError("В одном списке допускается до 5000 адресов и доменов")
            continue
        try:
            value = value.rstrip(".").encode("idna").decode("ascii").lower()
        except UnicodeError:
            raise ControlError(f"Строка {index}: неверное имя домена") from None
        labels = value.split(".")
        if (len(value) > 253 or len(labels) < 2 or not any(c.isalpha() for c in labels[-1])
                or any(not re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?", label) for label in labels)):
            raise ControlError(f"Строка {index}: нужен домен, IP-адрес или CIDR")
        result.add(kind + ":" + value)
        if len(result) > 5000:
            raise ControlError("В одном списке допускается до 5000 доменов")
    return sorted(result)


def overlaps(direct, vpn):
    def ancestors(domain):
        labels = domain.split(".")
        return [".".join(labels[i:]) for i in range(len(labels) - 1)]
    ds = {v[7:] for v in direct if v.startswith("domain:")}
    vs = {v[7:] for v in vpn if v.startswith("domain:")}
    df = {v[5:] for v in direct if v.startswith("full:")}
    dip = [ipaddress.ip_network(v[3:], strict=True) for v in direct if v.startswith("ip:")]
    vip = [ipaddress.ip_network(v[3:], strict=True) for v in vpn if v.startswith("ip:")]
    hits = set()
    for value in vpn:
        if value.startswith("ip:"):
            network = ipaddress.ip_network(value[3:], strict=True)
            if any(network.version == candidate.version and network.overlaps(candidate) for candidate in dip):
                hits.add(value[3:])
            continue
        domain = value.split(":", 1)[1]
        if domain in df or any(a in ds for a in ancestors(domain)):
            hits.add(domain)
    for value in direct:
        if value.startswith("ip:"):
            network = ipaddress.ip_network(value[3:], strict=True)
            if any(network.version == candidate.version and network.overlaps(candidate) for candidate in vip):
                hits.add(value[3:])
            continue
        domain = value.split(":", 1)[1]
        if any(a in vs for a in ancestors(domain)):
            hits.add(domain)
    return sorted(hits)


def compile_rules(config, settings):
    candidate = copy.deepcopy(config)
    routing = candidate.get("routing", {})
    if routing.get("script") or routing.get("domainStrategy") != "AsIs":
        raise ControlError("Ожидаемая схема маршрутизации Xray изменилась; применение остановлено")
    rules = [r for r in routing.get("rules", []) if not str(r.get("ruleTag", "")).startswith(PREFIX)]
    if settings["mode"] == "off":
        routing["rules"] = rules
        return candidate
    if not settings["direct"]["entries"] and not settings["vpn"]["entries"]:
        raise ControlError("Сначала заполните хотя бы один список сайтов")
    tags = [i["tag"] for i in candidate.get("inbounds", [])
            if i.get("protocol") == "dokodemo-door" and i.get("settings", {}).get("followRedirect")]
    if not tags or not any(i.get("tag") == "redirect" for i in candidate.get("inbounds", [])):
        raise ControlError("Не найдены ожидаемые приёмники трафика выбранных устройств")
    for inbound in candidate["inbounds"]:
        if inbound.get("tag") in tags and not inbound.get("sniffing", {}).get("enabled"):
            raise ControlError("Для одного из сегментов не включено распознавание доменов")
    outbound_types = {o.get("tag"): o.get("protocol") for o in candidate.get("outbounds", [])}
    if outbound_types.get("direct") != "freedom" or outbound_types.get("vpn-1") != "vless":
        raise ControlError("Не найдены ожидаемые выходы напрямую и через VPN")
    # Keep DNS, private networks and loop protection above the domain exceptions.
    # Never include local-check or dns-query: VPN health checks must stay VPN-only.
    if not rules or rules[-1].get("outboundTag") != "vpn-1" or not set(tags).issubset(rules[-1].get("inboundTag", [])):
        raise ControlError("Последнее правило Xray изменилось; требуется повторная диагностика")
    if set(rules[-1]) - {"type", "inboundTag", "outboundTag"}:
        raise ControlError("Обнаружены дополнительные условия последнего правила Xray")
    managed = []
    for key, outbound in (("direct", "direct"), ("vpn", "vpn-1")):
        entries = settings[key]["entries"]
        domains = [v for v in entries if not v.startswith("ip:")]
        ips = [v[3:] for v in entries if v.startswith("ip:")]
        if domains:
            managed.append({"type": "field", "ruleTag": PREFIX + key, "inboundTag": tags,
                            "domain": domains, "outboundTag": outbound})
        if ips:
            managed.append({"type": "field", "ruleTag": PREFIX + key + "-ip", "inboundTag": tags,
                            "ip": ips, "outboundTag": outbound})
    managed.append({"type": "field", "ruleTag": PREFIX + "default", "inboundTag": tags,
                    "outboundTag": "vpn-1" if settings["mode"] == "vpn_default" else "direct"})
    routing["rules"] = rules[:-1] + managed + rules[-1:]
    return candidate


class SiteRoutes:
    def __init__(self, controller):
        self.c = controller
        self.live_sha = ""
        self.live_managed = []

    @property
    def data(self):
        data = self.c.data.setdefault("site_routes", {})
        data.setdefault("mode", "off")
        data.setdefault("direct", {"entries": [], "url": ""})
        data.setdefault("vpn", {"entries": [], "url": ""})
        return data

    def fingerprint(self):
        d = self.data
        return hashlib.sha256(json.dumps([d["mode"], d["direct"]["entries"], d["vpn"]["entries"]],
                                         sort_keys=True).encode()).hexdigest()

    def observe(self, raw, config):
        self.live_sha = hashlib.sha256(raw).hexdigest()
        self.live_managed = [r for r in config.get("routing", {}).get("rules", [])
                             if str(r.get("ruleTag", "")).startswith(PREFIX)]

    def public(self):
        d = self.data
        valid = d.get("validated", {})
        applied = d.get("applied", {})
        expected = d.get("applied_rules", [])
        matches = self.live_managed == expected
        hits = overlaps(d["direct"]["entries"], d["vpn"]["entries"])
        return {"mode": d["mode"], "modes": MODES,
                "lists": {k: {"text": "\n".join(d[k]["entries"]), "count": len(d[k]["entries"]),
                              "domain_count": sum(not v.startswith("ip:") for v in d[k]["entries"]),
                              "ip_count": sum(v.startswith("ip:") for v in d[k]["entries"]),
                              "source_host": urlsplit(d[k].get("url", "")).hostname,
                              "updated": d[k].get("updated"), "error": d[k].get("error")}
                          for k in ("direct", "vpn")},
                "overlap_count": len(hits), "overlaps": hits[:50],
                "validated_at": valid.get("checked"),
                "can_apply": valid.get("fingerprint") == self.fingerprint() and valid.get("sha") == self.live_sha,
                "active_mode": applied.get("mode", "off") if matches else "external",
                "applied_at": applied.get("at"),
                "dirty": not matches or (applied.get("fingerprint") != self.fingerprint()
                                         if applied else d["mode"] != "off" or any(d[k]["entries"] for k in ("direct", "vpn")))}

    async def save_list(self, payload):
        key = payload.get("list")
        if key not in ("direct", "vpn"):
            raise ControlError("Неизвестный список сайтов")
        url = str(payload.get("url", "")).strip()
        if url:
            url = valid_url(url)
            parts = urlsplit(url)
            match = re.fullmatch(r"/document/d/([A-Za-z0-9_-]{10,200})(?:/.*)?", parts.path)
            if parts.hostname == "docs.google.com" and match:
                url = "https://docs.google.com/document/d/" + match[1] + "/export?format=txt"
            try:
                body = await self.c.fetch(url)
                entries = parse_entries(body.decode("utf-8-sig"))
                if not entries:
                    raise ControlError("Источник вернул пустой список; старый сохранён")
            except Exception:
                self.data[key]["error"] = "Источник недоступен или не содержит текстовый список; старый сохранён"
                await self.c.save()
                raise ControlError(self.data[key]["error"]) from None
        else:
            entries = parse_entries(payload.get("text", ""))
        self.data[key] = {"entries": entries, "url": url, "updated": time.time(), "error": None}

    async def refresh(self):
        keys = [k for k in ("direct", "vpn") if self.data[k].get("url")]
        if not keys:
            raise ControlError("Сначала сохраните HTTPS-источник хотя бы одного списка")
        failures = 0
        for key in keys:
            try:
                await self.save_list({"list": key, "url": self.data[key]["url"]})
            except ControlError:
                failures += 1
        if failures:
            await self.c.save()
            raise ControlError(f"Не обновились списки: {failures}; предыдущие данные сохранены")

    async def sync_vpn(self):
        """Fetch the managed source, validate the complete Xray config, then apply atomically."""
        previous = copy.deepcopy(self.data)
        source = self.data["vpn"].get("url")
        if not source:
            raise ControlError("Сначала сохраните HTTPS-источник списка VPN в разделе «Маршрутизация сайтов»")
        try:
            await self.save_list({"list": "vpn", "url": source})
            self.data["mode"] = "direct_default"
            await self.validate()
            await self.apply()
        except Exception:
            failed = self.data.get("vpn", {}).get("error")
            self.c.data["site_routes"] = previous
            if failed:
                self.data["vpn"]["error"] = failed
            raise

    async def validate(self):
        raw, config = await self.c.router.read_config()
        candidate = compile_rules(config, self.data)
        await self.c.router.prepare()
        await self.c.router.upload("routes-check.json", json.dumps(candidate).encode())
        await self.c.router.script("trap 'rm -f /opt/etc/netcraze-vpn/routes-check.json' EXIT\n"
                                   "xray run -test -config /opt/etc/netcraze-vpn/routes-check.json >/dev/null 2>&1\n")
        self.observe(raw, config)
        self.data["validated"] = {"fingerprint": self.fingerprint(), "sha": self.live_sha, "checked": time.time()}

    async def apply(self):
        raw, config = await self.c.router.read_config()
        self.observe(raw, config)
        if not self.public()["can_apply"]:
            raise ControlError("Сначала проверьте правила; после изменения списков или роутера проверка нужна заново")
        candidate = compile_rules(config, self.data)
        if candidate != config:
            await self.c.install_config(raw, candidate)
        await self.c.refresh_status()
        expected = [r for r in candidate.get("routing", {}).get("rules", [])
                    if str(r.get("ruleTag", "")).startswith(PREFIX)]
        if self.live_managed != expected:
            raise ControlError("Роутер не подтвердил правила сайтов")
        self.data["applied"] = {"mode": self.data["mode"], "fingerprint": self.fingerprint(), "at": time.time()}
        self.data["applied_rules"] = copy.deepcopy(expected)
