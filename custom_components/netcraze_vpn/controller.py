"""Private subscription catalogue and transactional control of an existing Xray.

No subscription contents, router credentials or raw command output leave this module.
Only selected clients' NDMS policies are changed. HTTP is confined to the LAN.
"""
import asyncio
import base64
import copy
import hashlib
import ipaddress
import json
from pathlib import Path
import re
import shlex
import socket
import time
from urllib.parse import parse_qs, unquote, urlsplit
import uuid

import aiohttp
from aiohttp.resolver import DefaultResolver

CONFIG = "/ci/storage:/etc/xray/configs/00_happ.json"
DIRECTORY = "/opt/etc/netcraze-vpn"
STORAGE = "storage:/etc/netcraze-vpn"
MODES = {"direct": "Обычный интернет", "vpn": "Полный VPN"}


async def bounded_body(response, limit):
    body = bytearray()
    async for part in response.content.iter_chunked(16384):
        body.extend(part)
        if len(body) > limit:
            raise ControlError("Ответ превышает допустимый размер")
    return bytes(body)


class ControlError(Exception):
    """An intentionally non-secret error suitable for the UI."""


class PublicResolver(DefaultResolver):
    async def resolve(self, host, port=0, family=socket.AF_INET):
        results = await super().resolve(host, port, family)
        if any(not ipaddress.ip_address(item["host"]).is_global for item in results):
            raise ControlError("Подписка должна размещаться на публичном HTTPS-сервере")
        return results


def valid_url(url):
    p = urlsplit(url)
    if p.scheme != "https" or not p.hostname or p.username or p.password or p.port not in (None, 443):
        raise ControlError("Нужна ссылка HTTPS без логина и нестандартного порта")
    try:
        if not ipaddress.ip_address(p.hostname).is_global:
            raise ControlError("Локальные адреса подписок запрещены")
    except ValueError:
        pass
    return url


def parse_subscription(body, source):
    text = body.decode("utf-8-sig").strip()
    if "vless://" not in text:
        try:
            text = base64.b64decode(text + "=" * (-len(text) % 4)).decode("utf-8-sig")
        except (ValueError, UnicodeError):
            raise ControlError("Подписка должна содержать VLESS-ссылки или их Base64-список") from None
    nodes, skipped = {}, 0
    for line in text.splitlines()[:500]:
        if not line.strip():
            continue
        try:
            p = urlsplit(line.strip())
            q = parse_qs(p.query, keep_blank_values=True)
            get = lambda key, default="": q.get(key, [default])[0]
            if p.scheme != "vless" or get("security") != "reality" or get("type", "tcp") not in ("tcp", "raw"):
                raise ValueError()
            user = str(uuid.UUID(p.username or ""))
            host, port = p.hostname, p.port
            if not host or not port or get("flow") not in ("", "xtls-rprx-vision"):
                raise ValueError()
            key, sni = get("pbk"), get("sni")
            if not re.fullmatch(r"[A-Za-z0-9_-]{43}", key) or not sni:
                raise ValueError()
            short = get("sid")
            if not re.fullmatch(r"(?:[0-9a-fA-F]{2}){0,8}", short):
                raise ValueError()
            outbound = {"tag": "vpn-1", "protocol": "vless", "settings": {"vnext": [{
                "address": host, "port": port, "users": [{"id": user, "encryption": "none", "flow": get("flow")}]
            }]}, "streamSettings": {"network": "tcp", "security": "reality", "realitySettings": {
                "serverName": sni, "fingerprint": get("fp", "chrome"), "publicKey": key, "shortId": short,
                "spiderX": get("spx", "/")}}}
            node_id = hashlib.sha256((source + "|" + json.dumps(outbound, sort_keys=True)).encode()).hexdigest()[:20]
            nodes[node_id] = {"id": node_id, "name": unquote(p.fragment)[:100] or "Сервер " + host,
                              "source": source, "host": host, "port": port, "outbound": outbound}
        except (ValueError, TypeError):
            skipped += 1
    if not nodes:
        raise ControlError("Нет поддерживаемых VLESS TCP REALITY-серверов; прежний список сохранён")
    return nodes, skipped


class Router:
    def __init__(self, config):
        self.config = config
        self.base = "http://" + config["host"]
        self.session = None
        self.pending = False

    async def close(self):
        if self.session:
            await self.session.close()
            self.session = None

    async def login(self):
        await self.close()
        self.session = aiohttp.ClientSession(cookie_jar=aiohttp.CookieJar(unsafe=True),
                                            timeout=aiohttp.ClientTimeout(total=20))
        async with self.session.get(self.base + "/auth", allow_redirects=False) as response:
            if response.status != 401 or "ndw2" not in response.headers.get("WWW-Authenticate", "").lower():
                raise ControlError("Ожидается проверенная авторизация NDW2 роутера")
            realm = response.headers.get("X-NDM-Realm", "")
            challenge = response.headers.get("X-NDM-Challenge", "")
        digest = hashlib.md5(f'{self.config["username"]}:{realm}:{self.config["password"]}'.encode()).hexdigest()
        proof = hashlib.sha256((challenge + digest).encode()).hexdigest()
        async with self.session.post(self.base + "/auth", json={"login": self.config["username"], "password": proof}) as response:
            if response.status != 200:
                raise ControlError("Роутер отклонил авторизацию")

    async def request(self, path, method="GET", **kwargs):
        if not self.session:
            await self.login()
        for attempt in range(2):
            async with self.session.request(method, self.base + path, allow_redirects=False, **kwargs) as response:
                if response.status == 401 and attempt == 0:
                    await response.read()
                elif response.status == 200:
                    return await bounded_body(response, 2_000_000)
                else:
                    raise ControlError(f"Роутер вернул HTTP {response.status}")
            await self.login()
        raise ControlError("Сеанс роутера истёк")

    async def rci(self, body):
        result = json.loads(await self.request("/rci/", "POST", json=body))
        def failed(value):
            if isinstance(value, dict):
                return value.get("status") == "error" or any(failed(v) for v in value.values())
            return isinstance(value, list) and any(failed(v) for v in value)
        if failed(result):
            raise ControlError("Роутер отклонил команду управления")
        return result

    async def read_config(self):
        raw = await self.request(CONFIG)
        data = json.loads(raw)
        if not any(o.get("tag") == "vpn-1" and o.get("protocol") == "vless" for o in data.get("outbounds", [])):
            raise ControlError("Не найдена ожидаемая конфигурация Xray с outbound vpn-1")
        return raw, data

    async def upload(self, name, body):
        result = await self.rci({"put": {"filename": STORAGE + "/" + name, "size": len(body)}})
        try:
            port = result["put"]["port"]["port"]
        except (KeyError, TypeError):
            raise ControlError("Не удалось подготовить файл на роутере") from None
        form = aiohttp.FormData()
        form.add_field("port", str(port))
        form.add_field("Filedata", body, filename=name, content_type="application/octet-stream")
        await self.request("/fui", "POST", data=form)
        stored = await self.request("/ci/" + STORAGE + "/" + name)
        if hashlib.sha256(stored).digest() != hashlib.sha256(body).digest():
            raise ControlError("Роутер не подтвердил содержимое загруженного файла")

    async def prepare(self):
        await self.rci({"parse": 'exec sh -c "/opt/bin/mkdir -p /opt/etc/netcraze-vpn; /opt/bin/chmod 700 /opt/etc/netcraze-vpn"'})

    async def ensure_idle(self):
        if self.pending:
            result = await self.request("/ci/" + STORAGE + "/job.out")
            if not re.search(rb"__DONE__\d+", result):
                raise ControlError("Предыдущая операция роутера ещё не завершилась; повтор запрещён")
            self.pending = False

    async def script(self, body):
        """Detach work from the HTTP/CLI session and poll a bounded private result."""
        await self.ensure_idle()
        script = ("#!/bin/sh\nPATH=/opt/bin:/opt/sbin:/usr/bin:/usr/sbin:/bin:/sbin\nexport PATH\numask 077\n"
                  "(\nset -eu\n" + body + "\n)\nresult=$?\nprintf '\\n__DONE__%s\\n' \"$result\"\n")
        await self.upload("job.sh", script.encode())
        self.pending = True
        # Truncate before starting so an old success marker can never complete a new job.
        await self.rci({"parse": 'exec sh -c ": > /opt/etc/netcraze-vpn/job.out; /opt/bin/nohup /opt/bin/sh /opt/etc/netcraze-vpn/job.sh > /opt/etc/netcraze-vpn/job.out 2>&1 < /dev/null &"'})
        for _ in range(180):
            await asyncio.sleep(0.5)
            try:
                output = await self.request("/ci/" + STORAGE + "/job.out")
            except ControlError:
                continue
            marker = re.search(rb"__DONE__(\d+)", output)
            if marker:
                self.pending = False
                if marker[1] != b"0":
                    raise ControlError("Проверка на роутере не прошла; рабочая конфигурация сохранена или восстановлена")
                return output
        raise ControlError("Роутер не завершил операцию за 90 секунд; проверьте состояние перед повтором")


class Controller:
    def __init__(self, hass, entry, store):
        self.hass, self.entry, self.store = hass, entry, store
        self.router = Router(entry.data)
        self.lock = asyncio.Lock()
        self.data = {"sources": {}, "nodes": {}, "selected": "", "active": "", "mode": "unknown"}
        self.busy, self.message, self.duration = False, "Готово", None
        self.status_checked = None
        self.status_message, self.status_duration = None, None
        self.task = None
        self.router_available = False
        from .devices import Devices
        self.devices = Devices(self)
        from .site_routes import SiteRoutes
        self.site_routes = SiteRoutes(self)

    async def load(self):
        self.data.update(await self.store.async_load() or {})
        await self.refresh_status()

    async def save(self):
        await self.store.async_save(self.data)

    async def poll(self, now=None):
        if self.busy or self.lock.locked():
            return
        async with self.lock:
            if self.busy:
                return
            try:
                await self.refresh_status()
            except Exception:
                self.router_available = False

    async def refresh_status(self):
        raw, config = await self.router.read_config()
        self.site_routes.observe(raw, config)
        active = next(o for o in config["outbounds"] if o.get("tag") == "vpn-1")
        # Matching normalised outbound covers imported nodes as well as the original installation.
        fingerprint = lambda o: json.dumps(o, sort_keys=True)
        matches = [n["id"] for n in self.data["nodes"].values() if fingerprint(n["outbound"]) == fingerprint(active)]
        self.data["active"] = matches[0] if matches else "existing"
        self.data["active_name"] = self.data["nodes"].get(self.data["active"], {}).get("name", "Текущий сервер роутера")
        await self.devices.sync()
        self.router_available = True

    async def client_policy(self):
        hosts = json.loads(await self.router.request("/rci/ip/hotspot/host"))
        if isinstance(hosts, dict):
            hosts = hosts.get("host", [])
        mac = self.entry.data["client_mac"].lower()
        client = next((h for h in hosts if h.get("mac", "").lower() == mac), {})
        if not client:
            raise ControlError("Указанный клиент не зарегистрирован на роутере")
        return client.get("policy")

    def public(self):
        return {"busy": self.busy, "message": self.message, "duration": self.duration,
                "status_checked": self.status_checked, "status_message": self.status_message,
                "status_duration": self.status_duration,
                "router_available": self.router_available,
                "active": self.data["active"], "active_name": self.data.get("active_name", ""),
                "selected": self.data["selected"], "mode": self.data["mode"],
                "client_mac": self.entry.data["client_mac"],
                "clients": self.devices.public(),
                "site_routes": self.site_routes.public(),
                "sources": [{"id": key, "name": s["name"], "host": urlsplit(s["url"]).hostname,
                             "updated": s.get("updated"), "error": s.get("error"), "skipped": s.get("skipped", 0)}
                            for key, s in self.data["sources"].items()],
                "nodes": [{k: n.get(k) for k in ("id", "name", "source", "latency", "checked", "vpn_checked", "vpn_services")}
                          for n in self.data["nodes"].values()]}

    def start(self, action, payload):
        if self.busy:
            raise ControlError("Предыдущая операция ещё выполняется")
        self.busy = True
        self.message = "Выполняется…"
        self.task = self.hass.async_create_task(self.run(action, payload), "netcraze_vpn_job")

    async def run(self, action, payload):
        started = time.monotonic()
        try:
            async with self.lock:
                if action not in ("status", "device_sync", "select", "refresh", "source_save", "source_delete",
                                  "routes_save", "routes_mode", "routes_refresh"):
                    await self.router.ensure_idle()
                async with asyncio.timeout(120):
                    await self.execute(action, payload)
                await self.save()
                if action == "status":
                    self.status_checked = time.time()
                    self.status_duration = round(time.monotonic() - started, 2)
                    clients = self.devices.public()
                    self.status_message = (f"Состояние NDMS обновлено: через VPN {clients['vpn_count']} "
                                           f"из {len(clients['members'])} устройств")
                    self.message = self.status_message
                else:
                    self.message = "Готово"
        except ControlError as error:
            self.message = str(error)
        except Exception:
            # Do not log exception repr: aiohttp/parser errors can contain secret URLs.
            self.message = "Операция не выполнена. Проверьте доступность роутера и источника; прежние данные сохранены."
        finally:
            self.duration = round(time.monotonic() - started, 2)
            self.busy = False

    async def fetch(self, url):
        connector = aiohttp.TCPConnector(resolver=PublicResolver())
        async with aiohttp.ClientSession(connector=connector, timeout=aiohttp.ClientTimeout(total=20),
                                         headers={"User-Agent": "curl/8.0", "Accept": "text/plain, application/json"}) as session:
            for _ in range(4):
                valid_url(url)
                async with session.get(url, allow_redirects=False) as response:
                    if response.status in (301, 302, 303, 307, 308):
                        from urllib.parse import urljoin
                        url = urljoin(url, response.headers.get("Location", ""))
                        continue
                    if response.status != 200:
                        raise ControlError("Источник подписки вернул ошибку; прежний список сохранён")
                    return await bounded_body(response, 1_048_576)
        raise ControlError("Слишком много перенаправлений подписки")

    async def update_source(self, key):
        source = self.data["sources"][key]
        try:
            nodes, skipped = parse_subscription(await self.fetch(source["url"]), key)
            old = {k: n for k, n in self.data["nodes"].items() if n["source"] != key}
            old.update(nodes)
            self.data["nodes"] = old
            source.update(updated=time.time(), error=None, skipped=skipped)
        except ControlError:
            source["error"] = "Обновление не удалось; сохранён предыдущий список"
            raise

    async def probe_tcp(self, node):
        async def one():
            start = time.monotonic()
            try:
                results = await asyncio.get_running_loop().getaddrinfo(node["host"], node["port"], type=socket.SOCK_STREAM)
                if not results or any(not ipaddress.ip_address(r[4][0]).is_global for r in results):
                    raise OSError()
                _, writer = await asyncio.wait_for(asyncio.open_connection(node["host"], node["port"]), 3)
                writer.close()
                await writer.wait_closed()
                node["latency"] = round((time.monotonic() - start) * 1000)
            except (OSError, asyncio.TimeoutError):
                node["latency"] = None
            node["checked"] = time.time()
        await one()

    async def backup(self, raw):
        stamp = time.strftime("%Y%m%d_%H%M%S") + "_" + uuid.uuid4().hex[:6]
        ndms = await self.router.request("/ci/startup-config.txt")
        directory = Path(self.hass.config.path("netcraze_vpn_backups", stamp))
        def write():
            directory.mkdir(parents=True, mode=0o700)
            for name, content in (("xray.json", raw), ("startup-config.txt", ndms)):
                path = directory / name
                path.write_bytes(content)
                path.chmod(0o600)
        await self.hass.async_add_executor_job(write)
        return stamp

    async def vpn_probe(self, node):
        config = {"log": {"loglevel": "none"}, "inbounds": [{"tag": "check", "listen": "127.0.0.1", "port": 10849,
                  "protocol": "socks", "settings": {"auth": "noauth", "udp": False}}], "outbounds": [node["outbound"]]}
        await self.router.prepare()
        await self.router.upload("probe.json", json.dumps(config).encode())
        setup = '''
xray run -test -config /opt/etc/netcraze-vpn/probe.json >/dev/null 2>&1
xray run -config /opt/etc/netcraze-vpn/probe.json >/dev/null 2>&1 &
probe_pid=$!
trap 'kill "$probe_pid" 2>/dev/null || true; rm -f /opt/etc/netcraze-vpn/probe.json /opt/etc/netcraze-vpn/probe-service-*.out' EXIT
sleep 1
kill -0 "$probe_pid"
'''
        await self.router.script(setup + '''
curl --fail --silent --socks5-hostname 127.0.0.1:10849 --connect-timeout 5 --max-time 12 https://example.com/ -o /dev/null
''')
        node["vpn_checked"] = time.time()

    async def vpn_probe_all(self):
        """Check the shared service catalogue through every imported node."""
        from .service_check import SITES, probe_script, parse_results

        nodes = list(self.data["nodes"].values())
        if not nodes:
            raise ControlError("Сначала обновите подписки: список серверов пуст")
        inbounds, outbounds, rules = [], [], []
        for index, node in enumerate(nodes):
            inbound_tag, outbound_tag = f"check-{index}", f"check-vpn-{index}"
            inbounds.append({"tag": inbound_tag, "listen": "127.0.0.1", "port": 10849 + index,
                             "protocol": "socks", "settings": {"auth": "noauth", "udp": False}})
            outbound = copy.deepcopy(node["outbound"])
            outbound["tag"] = outbound_tag
            outbounds.append(outbound)
            rules.append({"type": "field", "inboundTag": [inbound_tag], "outboundTag": outbound_tag})
        config = {"log": {"loglevel": "none"}, "inbounds": inbounds, "outbounds": outbounds,
                  "routing": {"domainStrategy": "AsIs", "rules": rules}}
        await self.router.prepare()
        await self.router.upload("probe-all.json", json.dumps(config).encode())
        indexes = list(range(len(nodes)))
        script = '''
xray run -test -config /opt/etc/netcraze-vpn/probe-all.json >/dev/null 2>&1
xray run -config /opt/etc/netcraze-vpn/probe-all.json >/dev/null 2>&1 &
probe_pid=$!
trap 'kill "$probe_pid" 2>/dev/null || true; rm -f /opt/etc/netcraze-vpn/probe-all.json /opt/etc/netcraze-vpn/probe-service-*.out' EXIT
sleep 1
kill -0 "$probe_pid"
''' + probe_script(indexes)
        output = await self.router.script(script)
        reports = parse_results(output)
        if any(len(reports.get(index, [])) != len(SITES) for index in indexes):
            raise ControlError("Роутер не вернул полный список сервисов для каждого сервера; повторите проверку")
        checked = time.time()
        for index, node in enumerate(nodes):
            node["vpn_services"] = {"checked": checked, "results": reports[index]}

    async def apply(self, node):
        await self.vpn_probe(node)
        raw, config = await self.router.read_config()
        config["outbounds"] = [copy.deepcopy(node["outbound"]) if o.get("tag") == "vpn-1" else o for o in config["outbounds"]]
        await self.install_config(raw, config)
        await self.refresh_status()
        if self.data["active"] != node["id"]:
            raise ControlError("Применение не подтверждено чтением конфигурации роутера")

    async def check(self, node):
        """Refresh TCP and the same HTTPS catalogue for every VPN node."""
        semaphore = asyncio.Semaphore(4)

        async def limited(candidate):
            async with semaphore:
                await self.probe_tcp(candidate)

        async def tcp_all():
            await asyncio.gather(*(limited(n) for n in self.data["nodes"].values()))

        outcomes = await asyncio.gather(tcp_all(), self.vpn_probe_all(), return_exceptions=True)
        # Retain completed TCP measurements even when the router probe fails.
        # Both branches finish before releasing the controller's transaction lock.
        await self.save()
        for outcome in outcomes:
            if isinstance(outcome, Exception):
                raise outcome

    async def install_config(self, raw, config):
        expected = hashlib.sha256(raw).hexdigest()
        stamp = await self.backup(raw)
        await self.router.prepare()
        candidate = json.dumps(config, ensure_ascii=False, indent=2).encode()
        digest = hashlib.sha256(candidate).hexdigest()
        await self.router.upload("candidate.json", candidate)
        await self.router.script(f'''
target=/opt/etc/xray/configs/00_happ.json
candidate=/opt/etc/netcraze-vpn/candidate.json
[ "$(sha256sum "$target" | cut -d ' ' -f1)" = {shlex.quote(expected)} ]
xray run -test -config "$candidate" >/dev/null 2>&1
backup=/opt/etc/netcraze-vpn/rollback_{stamp}.json
cp -p "$target" "$backup"
chmod 600 "$backup" "$candidate"
restore() {{
    result=$?
    if [ "$result" -ne 0 ]; then
        cp -p "$backup" "$target"
        XKEEN_FOREGROUND=1 /opt/sbin/xkeen -restart >/dev/null 2>&1 || true
    fi
}}
trap restore EXIT
mv "$candidate" "$target"
XKEEN_FOREGROUND=1 /opt/sbin/xkeen -restart >/dev/null 2>&1
sleep 1
if ! curl --fail --silent --socks5-hostname 127.0.0.1:10810 --connect-timeout 5 --max-time 12 https://example.com/ -o /dev/null; then
    exit 1
fi
[ "$(sha256sum "$target" | cut -d ' ' -f1)" = {shlex.quote(digest)} ]
trap - EXIT
''')

    async def execute(self, action, payload):
        if action == "routes_save":
            await self.site_routes.save_list(payload)
        elif action == "routes_refresh":
            await self.site_routes.refresh()
        elif action == "routes_sync_vpn":
            await self.site_routes.sync_vpn()
        elif action == "routes_mode":
            from .site_routes import MODES as ROUTE_MODES
            if payload.get("mode") not in ROUTE_MODES:
                raise ControlError("Неизвестный режим правил сайтов")
            self.site_routes.data["mode"] = payload["mode"]
        elif action == "routes_validate":
            await self.site_routes.validate()
        elif action == "routes_apply":
            await self.site_routes.apply()
        elif action == "status":
            await self.refresh_status()
        elif action == "device_sync":
            await self.devices.sync()
        elif action == "device_add":
            await self.devices.add(payload.get("mac"))
        elif action == "device_remove":
            await self.devices.remove(payload.get("mac"))
        elif action == "device_set":
            await self.devices.set_policies([payload.get("mac")], payload.get("enabled"))
        elif action == "group_mode":
            if payload.get("mode") not in MODES:
                raise ControlError("Неизвестный режим")
            await self.devices.set_policies(list(self.devices.members), payload["mode"] == "vpn")
        elif action == "source_save":
            key = payload.get("id") or uuid.uuid4().hex[:12]
            if not re.fullmatch(r"[a-f0-9]{12}", key):
                raise ControlError("Неверный идентификатор подписки")
            name = str(payload.get("name", "Подписка")).strip()[:60]
            url = valid_url(str(payload.get("url", "")).strip())
            if key not in self.data["sources"] and len(self.data["sources"]) >= 10:
                raise ControlError("Можно сохранить до 10 подписок")
            # Validate before changing the stored URL or catalogue.
            nodes, skipped = parse_subscription(await self.fetch(url), key)
            self.data["sources"][key] = {"name": name, "url": url, "updated": time.time(), "skipped": skipped}
            self.data["nodes"] = {k: n for k, n in self.data["nodes"].items() if n["source"] != key}
            self.data["nodes"].update(nodes)
            await self.refresh_status()
        elif action == "source_delete":
            key = payload["id"]
            self.data["sources"].pop(key, None)
            self.data["nodes"] = {k: n for k, n in self.data["nodes"].items() if n["source"] != key}
            if self.data["selected"] not in self.data["nodes"]:
                self.data["selected"] = ""
        elif action == "refresh":
            keys = [payload["id"]] if payload.get("id") else list(self.data["sources"])
            failures = 0
            for key in keys:
                try:
                    await self.update_source(key)
                except ControlError:
                    failures += 1
            await self.save()
            await self.refresh_status()
            if failures:
                raise ControlError(f"Не обновились источники: {failures}; их предыдущие списки сохранены")
        elif action == "select":
            if payload["id"] not in self.data["nodes"]:
                raise ControlError("Сервер больше не присутствует в списке")
            self.data["selected"] = payload["id"]
        elif action in ("probe", "check", "apply"):
            node = self.data["nodes"].get(self.data["selected"])
            if not node:
                raise ControlError("Сначала выберите сервер")
            # The legacy probe action/entity also uses the combined check.
            await (self.apply(node) if action == "apply" else self.check(node))
        elif action == "mode":
            # The single-device switch remains scoped to the configured main device.
            mode = payload.get("mode")
            if mode not in MODES:
                raise ControlError("Неизвестный режим")
            mac = self.entry.data["client_mac"].lower()
            if mac not in self.devices.members:
                await self.devices.add(mac)
            await self.devices.set_policies([mac], mode == "vpn")
        else:
            raise ControlError("Неизвестная операция")
