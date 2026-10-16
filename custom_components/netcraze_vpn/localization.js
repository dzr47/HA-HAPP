/* Presentation-only translations; no router or Home Assistant state is modified. */
import german from './locales/de.js?v=0.1.1';
import spanish from './locales/es.js?v=0.1.1';
import chinese from './locales/zh.js?v=0.1.1';

export const locale = language => ({ru:"ru-RU",en:"en-US",de:"de-DE",es:"es-ES",zh:"zh-CN"})[language] || "en-US";
export const languageFromHA = value => {
  const current=String(value || "en").toLowerCase();
  return ["ru","en","de","es","zh"].find(language=>current.startsWith(language)) || "en";
};

const english = [
  // Main panel and server selection.
  ["VPN дома", "Home VPN"],
  ["Открыть меню", "Open menu"],
  ["Управление VPN на роутере для выбранных устройств дома.", "Manage the router VPN for selected devices at home."],
  ["Обновить список сервисов", "Update service list"],
  ["Последнее обновление:", "Last updated:"],
  ["адресов и доменов", "addresses and domains"],
  ["Загрузит свежий список, проверит конфигурацию Xray и применит маршрутизацию: совпадения из списка — через VPN, остальное — напрямую.", "Downloads the latest list, validates Xray and applies routing: listed sites use the VPN; everything else uses the direct connection."],
  ["Подключение", "Connection"],
  ["VPN для списка устройств", "VPN for device list"],
  ["Включён для всех", "Enabled for all"],
  ["Включён для части устройств", "Enabled for some devices"],
  ["Выключен для списка", "Disabled for the list"],
  ["Состояние неизвестно", "Status unknown"],
  ["Другая политика", "Another policy"],
  ["Переключатель меняет VPN сразу для всего списка. Отдельные устройства можно настроить ниже.", "This switch changes the VPN for the whole list. You can control individual devices below."],
  ["Переключить VPN для всех устройств списка", "Toggle VPN for all listed devices"],
  ["Включён", "Enabled"], ["Частично", "Partly enabled"], ["Выключен", "Disabled"],
  ["Активный сервер:", "Active server:"],
  ["Обновить состояние", "Refresh status"],
  ["Проверка ещё не запускалась", "Status has not been checked yet"],
  ["Сверено с NDMS", "Confirmed with NDMS"],
  ["Кнопка перечитывает состояние роутера и фактические политики устройств.", "Refreshes router status and the actual device policies."],
  ["VPN-сервер сохраняется при выключении. Проверка состояния не меняет настройки роутера.", "The selected VPN server is retained when VPN is disabled. A status check does not change router settings."],
  ["Серверы", "Servers"],
  ["Обновить все подписки", "Update all subscriptions"],
  ["Проверить VPN", "Check VPN"],
  ["«Проверить VPN» обновляет TCP-задержку всех серверов и проверяет один общий список из шести сервисов через каждый сервер. TCP измеряется с HA (не ICMP ping), HTTPS — с роутера. Выбор строки не переключает роутер.", "Check VPN updates TCP latency for every server and checks the same six services through each server. TCP is measured from Home Assistant (not ICMP ping); HTTPS is checked from the router. Selecting a row does not switch the router."],
  ["Выбор", "Select"], ["Сервер", "Server"], ["Проверка VPN", "VPN check"],
  ["На роутере", "On router"], ["Нет ответа", "No response"],
  ["Добавьте подписку ниже.", "Add a subscription below."],
  ["Применить выбранный сервер", "Apply selected server"],
  ["Сервисы через выбранный VPN", "Services through selected VPN"],
  ["Выберите сервер", "Select a server"],
  ["Нажмите «Проверить VPN» — измерим TCP-задержку и проверим один общий список из шести сервисов через каждый сервер. Запросы идут парами, до 20 секунд на сервис.", "Select Check VPN to measure TCP latency and check the same six services through each server. Requests run in pairs, with a limit of 20 seconds per service."],
  ["Запросы идут с роутера через выбранный сервер, даже если он ещё не применён. Доступность страницы не гарантирует вход в аккаунт, звонки MAX, работу Telegram-приложения или видео YouTube. 403/429 может означать защиту сайта или ограничения IP. Время включает VPN и HTTPS; это не ping и не тест скорости.", "Requests run from the router through the selected server, even before it is applied. A reachable page does not prove account sign-in, MAX calls, the Telegram app or YouTube video playback. HTTP 403/429 may reflect site protection or IP restrictions. Timing includes VPN and HTTPS; it is not a ping or speed test."],
  ["Перед применением: проверка Xray и HTTPS, резервная копия. После переключения: повторная проверка; при ошибке — возврат предыдущей конфигурации. Текущие соединения телефона могут переподключиться.", "Before applying: Xray and HTTPS checks, then a backup. After switching: another check and rollback on failure. Existing phone connections may reconnect."],
  ["Первый ответ:", "First byte:"], ["Всего:", "Total:"],
  ["Подписки", "Subscriptions"], ["Обновлено:", "Updated:"],
  ["Пропущено неподдерживаемых:", "Unsupported entries skipped:"],
  ["Обновить", "Refresh"], ["Заменить ссылку", "Replace URL"], ["Удалить источник", "Delete source"],
  ["Замена ссылки подписки", "Replace subscription URL"],
  ["Добавить подписку", "Add subscription"], ["Название", "Name"],
  ["Основная подписка", "Primary subscription"],
  ["Язык панели", "Panel language"], ["Выбрать", "Select"],
  ["Панель VPN недоступна. Проверьте интеграцию и права администратора.", "VPN panel unavailable. Check the integration and administrator access."],
  ["Ссылка HTTPS", "HTTPS URL"], ["Вставьте ссылку подписки", "Paste subscription URL"],
  ["Проверить и сохранить", "Validate and save"], ["Отменить замену", "Cancel replacement"],
  ["Можно добавить несколько источников. Ссылки и ключи не показываются в состояниях HA и истории. Обновление списка не меняет активный сервер. Поддерживаются VLESS TCP REALITY.", "You can add multiple sources. URLs and keys are not shown in Home Assistant states or history. Updating the list does not change the active server. VLESS TCP REALITY is supported."],
  ["Если Home Assistant выключен, VPN продолжает работать на роутере. Панель доступна администраторам HA. Изменения начинают действовать для новых соединений; приложения могут удерживать старые соединения.", "The VPN continues to run on the router when Home Assistant is off. The panel is available to Home Assistant administrators. Changes affect new connections; apps may keep existing connections."],
  ["Ещё не проверяли", "Not checked yet"], ["доступны", "available"],
  ["HTTPS работает", "HTTPS works"], ["Выполняется…", "Working…"],
  ["Команда не принята", "Command rejected"], ["Подписка", "Subscription"],

  // Registered devices.
  ["Устройства VPN", "VPN devices"], ["Через VPN:", "Using VPN:"],
  ["В списке:", "In list:"], ["Добавить устройства", "Add devices"],
  ["Обновить из NDMS", "Refresh from NDMS"],
  ["Синхронизация", "Synced"], ["зарегистрировано", "registered"],
  ["в сети", "online"], ["Список ещё не получен", "Device list has not been loaded"],
  ["В сети", "Online"], ["Не в сети", "Offline"],
  ["VPN для", "VPN for"], ["Убрать", "Remove"],
  ["из списка", "from list"], ["Через VPN Happ", "Through HA HAPP VPN"],
  ["Другая политика:", "Other policy:"],
  ["Обычный интернет", "Direct internet"],
  ["Добавьте смартфон, планшет, телевизор или другое устройство кнопкой «+».", "Use Add devices to add a phone, tablet, TV or another device."],
  ["Переключатель меняет подключение одного устройства. Общие кнопки выше включают или выключают VPN для всего списка. При выключении возвращается прежняя политика; при удалении устройство также отключается от этого VPN.", "Each switch controls one device. The control above enables or disables VPN for the whole list. Disabling restores the previous policy; removing a device also disconnects it from this VPN."],
  ["Все зарегистрированные устройства NDMS", "All registered NDMS devices"],
  ["Закрыть выбор устройств", "Close device picker"],
  ["Имя, iPhone, iPad, Samsung, IP или MAC", "Name, iPhone, iPad, Samsung, IP or MAC"],
  ["Поиск устройств", "Search devices"],
  ["Быстрый выбор", "Quick filter"], ["Смартфоны", "Phones"],
  ["Планшеты", "Tablets"], ["Телевизоры", "TVs"],
  ["Компьютеры", "Computers"], ["Все устройства", "All devices"],
  ["Найдено:", "Found:"], ["В списке", "In list"],
  ["Добавить", "Add"],
  ["Устройств не найдено. Измените поиск или выберите «Все устройства».", "No devices found. Change the search or choose All devices."],
  ["Добавление сохраняет устройство в списке. Чтобы направить его трафик через VPN, включите переключатель в списке.", "Adding saves a device to the list. To route its traffic through VPN, enable its switch in the list."],
  ["Показаны все зарегистрированные устройства, включая отключённые. Категории определяются по имени и hostname NDMS. При похожих именах сверяйте IP и MAC; автоматического переименования нет.", "All registered devices are shown, including offline ones. Categories are inferred from NDMS names and hostnames. Compare IP and MAC for similar names; devices are not renamed automatically."],
  ["Сначала зарегистрируйте устройство в NDMS", "Register the device in NDMS first"],
  ["Доступ в интернет запрещён в NDMS", "Internet access is blocked in NDMS"],
  ["Инфраструктура дома", "Home infrastructure"],
  ["Сегмент станет известен после подключения устройства", "The segment will be known after the device connects"],

  // Site routing.
  ["Маршрутизация сайтов", "Site routing"],
  ["Списки маршрутов", "Route lists"],
  ["Для устройств, которым включён VPN. Загрузка обновляет список, проверяет конфигурацию и сразу применяет её: записи источника идут через VPN, всё остальное — напрямую.", "Applies to devices with VPN enabled. Updating the list validates and applies the configuration immediately: listed destinations use VPN and all others go direct."],
  ["Режим правил", "Routing mode"],
  ["На роутере:", "On router:"],
  ["Правила изменены вне панели", "Rules changed outside the panel"],
  ["Есть неприменённые изменения", "Unapplied changes"],
  ["Последнее применение:", "Last applied:"],
  ["Правила зависят от распознавания домена: ECH и подключения по IP могут скрывать сайт. DNS остаётся по текущей схеме роутера; проверка правил подтверждает конфигурацию, а доступность нужных сайтов проверяется отдельно.", "Rules depend on domain detection: ECH and direct IP connections may hide the site name. DNS follows the current router setup. Rule validation checks the configuration; site reachability must be checked separately."],
  ["Всегда напрямую", "Always direct"], ["Через VPN", "Through VPN"],
  ["домены", "domains"],
  ["Обычный интернет для перечисленных сайтов.", "Direct internet for listed sites."],
  ["Выбранный VPN-сервер для перечисленных адресов и доменов.", "Selected VPN server for listed addresses and domains."],
  ["Домены, IP или CIDR, по одному на строку", "Domains, IPs or CIDRs, one per line"],
  ["Белый список доменов и IP", "Direct-list domains and IPs"],
  ["VPN-список доменов и IP", "VPN-list domains and IPs"],
  ["Сохранить список", "Save list"],
  ["Импорт файла или ссылка", "Import file or URL"],
  ["Файл UTF-8, до 256 КБ", "UTF-8 file, up to 256 KB"],
  ["Файл белого списка", "Direct-list file"], ["Файл VPN-списка", "VPN-list file"],
  ["Файл заполнит поле выше. Для сохранения нажмите «Сохранить список».", "The file fills the field above. Select Save list to keep it."],
  ["HTTPS-ссылка", "HTTPS URL"],
  ["Ссылка на текстовый список или Google Документ", "URL of a text list or Google Doc"],
  ["Загрузить и сохранить ссылку", "Download and save URL"],
  ["Источник:", "Source:"], ["файл или ручной ввод", "file or manual entry"],
  ["Пересечения:", "Overlaps:"], ["Приоритет — напрямую.", "Direct routing takes priority."],
  ["Сначала сохраните изменения в полях списков.", "Save changes to the list fields first."],
  ["Обновить все источники", "Update all sources"],
  ["Проверить правила", "Validate rules"], ["Применить правила", "Apply rules"],
  ["Проверка:", "Validated:"],
  ["Перед применением требуется проверка актуальных списков и конфигурации роутера. Для отмены выберите «Без правил сайтов», проверьте и примените.", "Validate the current lists and router configuration before applying. To undo, choose No site rules, validate, then apply."],
  ["Формат списков и ограничения", "List format and limitations"],
  ["Одна запись на строку; # — комментарий. Поддерживаются домены и URL, full: для точного совпадения, IP-адреса и CIDR (IPv4/IPv6). Префикс ip: можно использовать для явного IP. example.com включает поддомены. Кириллица поддерживается. До 5000 записей в каждом списке. Регулярные выражения и HTML не принимаются. Закрытый Google Документ без доступа серверу не загрузится; можно использовать файл.", "One entry per line; # starts a comment. Domains, URLs, exact full: matches, IP addresses and IPv4/IPv6 CIDRs are supported. Use ip: for an explicit IP. example.com includes subdomains. Internationalized domains are supported. Each list holds up to 5,000 entries. Regular expressions and HTML are not accepted. A private Google Doc cannot be downloaded without access; use a file instead."],
  ["Xray проверяет сначала домены, затем IP/CIDR согласно правилам. ECH может скрыть имя домена, но IP-правило по-прежнему может совпасть. DNS остаётся по текущей схеме роутера: исключение для сайта само по себе не переводит его DNS напрямую. Проверка VPN выше проверяет выбранный сервер независимо от этих списков. Применение может переподключить текущие соединения.", "Xray checks domains and then IPs/CIDRs according to the rules. ECH can hide a domain name, but an IP rule may still match. DNS follows the router's current setup: a direct-route exception alone does not change DNS routing. Check VPN tests the selected server independently of these lists. Applying rules may reconnect existing sessions."],
  ["Максимальный размер — 256 КБ", "Maximum file size is 256 KB"],
  ["Файл должен быть UTF-8", "The file must be UTF-8"],
  ["ещё нет", "not yet"],
  ["Без правил сайтов", "No site rules"],
  ["Всё через VPN, кроме белого списка", "All traffic through VPN except the direct list"],
  ["Через VPN только сайты из списка", "Only listed sites through VPN"],

  // Router state, common errors and service probe results.
  ["Готово", "Ready"],
  ["Текущий сервер роутера", "Current router server"],
  ["Роутер недоступен. Нажмите «Обновить состояние» после восстановления связи.", "Router unavailable. Select Refresh status after connectivity returns."],
  ["Операция не выполнена. Проверьте доступность роутера и источника; прежние данные сохранены.", "Operation failed. Check the router and source availability; previous data was retained."],
  ["Обновление не удалось; сохранён предыдущий список", "Update failed; previous list retained"],
  ["Доступен по HTTPS", "Available over HTTPS"],
  ["Ограничение сайта", "Site restriction"],
  ["Ошибка DNS прокси", "Proxy DNS error"], ["Ошибка DNS", "DNS error"],
  ["Нет соединения с VPN", "No VPN connection"],
  ["Тайм-аут запроса", "Request timed out"],
  ["Ошибка TLS", "TLS error"],
  ["Слишком много перенаправлений", "Too many redirects"],
  ["Сертификат TLS не прошёл проверку", "TLS certificate validation failed"],
  ["Ответ больше 2 МБ", "Response exceeds 2 MB"],
  ["VPN не установил соединение с сайтом", "VPN could not connect to the site"],
  ["Ошибка запроса", "Request error"], ["Ошибка HTTP", "HTTP error"],
  ["Нет ответа HTTP", "No HTTP response"],
  ["MAX · веб-клиент", "MAX · web client"], ["Госуслуги", "Gosuslugi"],
  ["Состояние NDMS обновлено: через VPN", "NDMS status refreshed: VPN enabled for"],
  ["устройств", "devices"],
  ["NDMS вернул неожиданный список устройств", "NDMS returned an unexpected device list"],
  ["Неверный MAC устройства", "Invalid device MAC address"],
  ["Устройство отсутствует среди зарегистрированных клиентов NDMS", "Device is not among registered NDMS clients"],
  ["Устройство не зарегистрировано. Обновите список NDMS", "Device is not registered. Refresh the NDMS list"],
  ["Устройства инфраструктуры не включаются в этот список", "Infrastructure devices cannot be added to this list"],
  ["Не удалось проверить локальный адрес сегмента", "Could not verify the segment's local address"],
  ["Не найден ожидаемый TCP-приёмник Xray", "Expected Xray TCP inbound was not found"],
  ["Ожидается состояние включено или выключено", "Expected an enabled or disabled state"],
  ["Сначала добавьте устройства кнопкой «+»", "Add devices first"],
  ["Состав устройств изменился. Обновите список из NDMS", "The device list changed. Refresh it from NDMS"],
  ["Настройки устройства изменились параллельно в NDMS", "Device settings changed concurrently in NDMS"],
  ["NDMS не подтвердил политику или изменил другие настройки клиента", "NDMS did not confirm the policy or changed other client settings"],
  ["Параллельное изменение NDMS: требуется проверить политику устройства", "Concurrent NDMS change: verify the device policy"],
  ["Ответ превышает допустимый размер", "Response exceeds the size limit"],
  ["Подписка должна размещаться на публичном HTTPS-сервере", "Subscription must be hosted on a public HTTPS server"],
  ["Нужна ссылка HTTPS без логина и нестандартного порта", "Use an HTTPS URL without credentials or a nonstandard port"],
  ["Локальные адреса подписок запрещены", "Local subscription addresses are not allowed"],
  ["Подписка должна содержать VLESS-ссылки или их Base64-список", "Subscription must contain VLESS URLs or a Base64-encoded list"],
  ["Нет поддерживаемых VLESS TCP REALITY-серверов; прежний список сохранён", "No supported VLESS TCP REALITY servers were found; the previous list was retained"],
  ["Ожидается проверенная авторизация NDW2 роутера", "Verified router NDW2 authentication is required"],
  ["Роутер отклонил авторизацию", "Router rejected authentication"],
  ["Роутер вернул HTTP", "Router returned HTTP"],
  ["Сеанс роутера истёк", "Router session expired"],
  ["Роутер отклонил команду управления", "Router rejected the control command"],
  ["Не найдена ожидаемая конфигурация Xray с outbound vpn-1", "Expected Xray configuration with outbound vpn-1 was not found"],
  ["Не удалось подготовить файл на роутере", "Could not prepare the file on the router"],
  ["Роутер не подтвердил содержимое загруженного файла", "Router did not confirm the uploaded file contents"],
  ["Предыдущая операция роутера ещё не завершилась; повтор запрещён", "The previous router operation is still running; retry is blocked"],
  ["Проверка на роутере не прошла; рабочая конфигурация сохранена или восстановлена", "Router validation failed; the working configuration was retained or restored"],
  ["Роутер не завершил операцию за 90 секунд; проверьте состояние перед повтором", "Router operation did not finish within 90 seconds; check status before retrying"],
  ["Указанный клиент не зарегистрирован на роутере", "The selected client is not registered on the router"],
  ["Предыдущая операция ещё выполняется", "The previous operation is still running"],
  ["Источник подписки вернул ошибку; прежний список сохранён", "Subscription source returned an error; the previous list was retained"],
  ["Слишком много перенаправлений подписки", "Too many subscription redirects"],
  ["Сначала обновите подписки: список серверов пуст", "Update subscriptions first: the server list is empty"],
  ["Роутер не вернул полный список сервисов для каждого сервера; повторите проверку", "Router did not return all service checks for every server; run the check again"],
  ["Применение не подтверждено чтением конфигурации роутера", "Router configuration readback did not confirm the change"],
  ["Неизвестный режим правил сайтов", "Unknown site-routing mode"],
  ["Неизвестный режим", "Unknown mode"],
  ["Неверный идентификатор подписки", "Invalid subscription identifier"],
  ["Можно сохранить до 10 подписок", "Up to 10 subscriptions can be saved"],
  ["Не обновились источники:", "Sources not updated:"],
  ["их предыдущие списки сохранены", "their previous lists were retained"],
  ["Сервер больше не присутствует в списке", "Server is no longer in the list"],
  ["Сначала выберите сервер", "Select a server first"],
  ["Неизвестная операция", "Unknown operation"],
  ["Интеграция VPN ещё не настроена", "VPN integration has not been configured"],
  ["Список должен быть текстом UTF-8 размером до 256 КБ", "List must be UTF-8 text no larger than 256 KB"],
  ["Строка", "Line"],
  ["неверный IP-адрес или CIDR", "invalid IP address or CIDR"],
  ["В одном списке допускается до 5000 адресов и доменов", "A list can contain up to 5,000 addresses and domains"],
  ["нужен домен или URL сайта без логина и порта", "enter a domain or site URL without credentials or port"],
  ["неверное имя домена", "invalid domain name"],
  ["нужен домен, IP-адрес или CIDR", "enter a domain, IP address or CIDR"],
  ["В одном списке допускается до 5000 доменов", "A list can contain up to 5,000 domains"],
  ["Ожидаемая схема маршрутизации Xray изменилась; применение остановлено", "Expected Xray routing layout changed; applying was stopped"],
  ["Сначала заполните хотя бы один список сайтов", "Fill at least one site list first"],
  ["Не найдены ожидаемые приёмники трафика выбранных устройств", "Expected traffic inbounds for selected devices were not found"],
  ["Для одного из сегментов не включено распознавание доменов", "Domain detection is disabled for one of the segments"],
  ["Не найдены ожидаемые выходы напрямую и через VPN", "Expected direct and VPN outbounds were not found"],
  ["Последнее правило Xray изменилось; требуется повторная диагностика", "The last Xray rule changed; inspect the configuration again"],
  ["Обнаружены дополнительные условия последнего правила Xray", "Additional conditions were found in the last Xray rule"],
  ["Неизвестный список сайтов", "Unknown site list"],
  ["Источник вернул пустой список; старый сохранён", "Source returned an empty list; the previous one was retained"],
  ["Источник недоступен или не содержит текстовый список; старый сохранён", "Source is unavailable or has no text list; the previous one was retained"],
  ["Сначала сохраните HTTPS-источник хотя бы одного списка", "Save an HTTPS source for at least one list first"],
  ["Не обновились списки:", "Lists not updated:"],
  ["предыдущие данные сохранены", "previous data was retained"],
  ["Сначала сохраните HTTPS-источник списка VPN в разделе «Маршрутизация сайтов»", "Save an HTTPS source for the VPN list under Site routing first"],
  ["Сначала проверьте правила; после изменения списков или роутера проверка нужна заново", "Validate the rules first; changes to the lists or router require another validation"],
  ["Роутер не подтвердил правила сайтов", "Router did not confirm the site rules"],
];

const translations={de:german,es:spanish,zh:chinese};
const ordered=english.sort((a,b)=>b[0].length-a[0].length);
const durations={en:["ms","s"],de:["ms","s"],es:["ms","s"],zh:["毫秒","秒"]};
export function translate(language, text) {
  if (language === "ru" || !/[А-Яа-яЁё]/.test(text)) return text;
  let result = text;
  const dictionary=translations[language] || {};
  for (const [source, englishText] of ordered) result=result.replaceAll(source,dictionary[source] || englishText);
  const [milliseconds,seconds]=durations[language] || durations.en;
  return result.replace(/(\d+) из (\d+) через VPN/g,language==="en"?"$1 of $2 using VPN":language==="de"?"$1 von $2 über VPN":language==="es"?"$1 de $2 por VPN":"$1/$2 使用 VPN")
    .replace(/(\d+) из (\d+)/g,language==="en"?"$1 of $2":language==="de"?"$1 von $2":language==="es"?"$1 de $2":"$1/$2")
    .replace(/(\d+) мс/g,`$1 ${milliseconds}`).replace(/(\d+) с(?=\s|$|·)/g,`$1 ${seconds}`);
}

export function displaySourceName(language, name) {
  if (!/^Основная подписка Happ$/i.test(String(name || ""))) return name;
  return ({ru:"Основная подписка Happ",en:"Primary HAPP subscription",de:"HAPP-Hauptabonnement",es:"Suscripción principal de HAPP",zh:"HAPP 主订阅"})[language] || name;
}

export function localize(root, language) {
  if (language === "ru" || !root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.parentElement?.closest("[data-no-translate], textarea, script, style")) continue;
    node.textContent = translate(language, node.textContent);
  }
  for (const element of root.querySelectorAll("[placeholder], [aria-label], [title]")) {
    if (element.closest("[data-no-translate]")) continue;
    for (const attribute of ["placeholder", "aria-label", "title"]) {
      if (element.hasAttribute(attribute)) element.setAttribute(attribute, translate(language, element.getAttribute(attribute)));
    }
  }
}
