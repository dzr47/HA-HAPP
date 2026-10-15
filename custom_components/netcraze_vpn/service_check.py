"""Bounded HTTPS checks through isolated router SOCKS proxies."""
import math
import shlex

SITES = (
    ("max", "MAX · веб-клиент", "https://web.max.ru/"),
    ("gosuslugi", "Госуслуги", "https://www.gosuslugi.ru/"),
    ("chatgpt", "ChatGPT", "https://chatgpt.com/"),
    ("instagram", "Instagram", "https://www.instagram.com/"),
    ("telegram", "Telegram Web", "https://web.telegram.org/"),
    ("youtube", "YouTube", "https://www.youtube.com/generate_204"),
)


def probe_script(node_indexes):
    """Check the same fixed destinations through each node's SOCKS port.

    Two nodes run at a time to limit router load. All curl requests use remote
    DNS, verified TLS, and have no direct fallback.
    """
    commands = []
    indexes = list(node_indexes)
    for start in range(0, len(indexes), 2):
        batch = indexes[start:start + 2]
        for index in batch:
            port = 10849 + index
            for key, _, url in SITES:
                commands.append(f'''(
rc=0
metrics=$(curl --silent --location --max-redirs 3 --proto '=https' --proto-redir '=https' --noproxy '' \\
  --socks5-hostname 127.0.0.1:{port} --connect-timeout 7 --max-time 20 \\
  --max-filesize 2097152 --user-agent 'Home-VPN-Check/1.2' -o /dev/null \\
  --write-out '%{{http_code}}|%{{time_appconnect}}|%{{time_starttransfer}}|%{{time_total}}|%{{size_download}}|%{{num_redirects}}' \\
  {shlex.quote(url)} 2>/dev/null) || rc=$?
printf 'SERVICE|{index}|{key}|%s|%s\\n' "$rc" "$metrics" > /opt/etc/netcraze-vpn/probe-service-{index}-{key}.out
) &
''')
                # Track curl subshells separately from the background Xray.
                commands.append(f"pid_{index}_{key}=$!\n")
        pids = [f'"$pid_{index}_{key}"' for index in batch for key, _, _ in SITES]
        commands.append("wait " + " ".join(pids) + "\n")
    commands.extend(f"cat /opt/etc/netcraze-vpn/probe-service-{i}-{key}.out\n"
                    for i in indexes for key, _, _ in SITES)
    return "".join(commands)


def parse_results(output):
    rows = {}
    for line in output.decode("ascii", errors="replace").splitlines():
        if not line.startswith("SERVICE|"):
            continue
        parts = line.split("|")
        if len(parts) != 10 or parts[2] not in {s[0] for s in SITES}:
            continue
        try:
            index, rc, code = int(parts[1]), int(parts[3]), int(parts[4])
            tls, first, total, size, redirects = map(float, parts[5:])
            if not all(math.isfinite(v) and v >= 0 for v in (tls, first, total, size, redirects)):
                continue
        except ValueError:
            continue
        if rc:
            status = "error"
            message = {5: "Ошибка DNS прокси", 6: "Ошибка DNS", 7: "Нет соединения с VPN",
                       28: "Тайм-аут запроса", 35: "Ошибка TLS", 47: "Слишком много перенаправлений",
                       60: "Сертификат TLS не прошёл проверку", 63: "Ответ больше 2 МБ",
                       97: "VPN не установил соединение с сайтом"}.get(rc, f"Ошибка запроса ({rc})")
        elif 200 <= code < 300:
            status, message = "ok", "Доступен по HTTPS"
        elif code in (401, 403, 429):
            status, message = "restricted", f"Ограничение сайта (HTTP {code})"
        else:
            status, message = "error", f"Ошибка HTTP {code}" if code else "Нет ответа HTTP"
        rows.setdefault(index, {})[parts[2]] = {"id": parts[2], "status": status, "message": message,
                         "http": code or None, "curl_code": rc, "tls_ms": round(tls * 1000),
                         "first_byte_ms": round(first * 1000), "total_ms": round(total * 1000),
                         "bytes": round(size), "redirects": round(redirects)}
    return {index: [dict(node_rows[key], name=name, url=url)
                    for key, name, url in SITES if key in node_rows]
            for index, node_rows in rows.items()}
