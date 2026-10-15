/* Local HA web component. No third-party scripts, secrets in URLs or localStorage. */
import './devices-panel.js?v=0.1.0';
import './routes-panel.js?v=0.1.0';
const escape = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const date = value => value ? new Date(value * 1000).toLocaleString("ru-RU") : "Ещё не проверяли";
class NetcrazeVPNPanel extends HTMLElement {
  constructor() { super(); this.attachShadow({mode:"open"}); this.s = null; this.edit = ""; this.polling = false; this.generation=0;
    this.devicePanel=document.createElement("netcraze-vpn-devices");
    this.devicePanel.addEventListener("vpn-action",event=>this.action(event.detail.action,event.detail.payload));
    this.routesPanel=document.createElement("netcraze-vpn-routes");
    this.routesPanel.addEventListener("vpn-action",event=>this.action(event.detail.action,event.detail.payload)); }
  set hass(value) { this._hass = value; if (!this.polling && this.isConnected) this.start(); }
  connectedCallback() { if (this._hass) this.start(); }
  disconnectedCallback() { this.polling = false; this.generation++; clearTimeout(this.timer); }
  async start() { if(this.polling) return; this.polling = true; await this.poll(++this.generation); }
  async poll(generation=this.generation) {
    if (!this.polling || generation!==this.generation) return;
    try {
      const state = await this._hass.callWS({type:"netcraze_vpn/state"});
      if(generation!==this.generation || !this.polling)return;
      // Preserve partially typed URLs and names across status polling.
      if (!this.s || JSON.stringify(state) !== JSON.stringify(this.s)) { this.s = state; this.render(); }
    } catch(e) { if(!this.s) this.shadowRoot.textContent = "Панель VPN недоступна. Проверьте интеграцию и права администратора."; }
    if(this.polling && generation===this.generation) this.timer = setTimeout(() => this.poll(generation), this.s?.busy ? 500 : 5000);
  }
  async action(action, payload={}) {
    try { await this._hass.callWS({type:"netcraze_vpn/action", action, payload}); this.s.busy = true; this.s.message="Выполняется…"; this.render();
      clearTimeout(this.timer); const generation=++this.generation; this.timer=setTimeout(()=>this.poll(generation),100); }
    catch(e) { this.shadowRoot.querySelector("#error").textContent = e.message || "Команда не принята"; }
  }
  render() {
    const root = this.shadowRoot, s = this.s;
    const draftName = root.querySelector("#source-name")?.value || "";
    const draftUrl = root.querySelector("#source-url")?.value || "";
    const disabled = s.busy ? "disabled" : "";
    const selected=s.nodes.find(n=>n.id===s.selected), report=selected?.vpn_services;
    const summary=n=>n.vpn_services ? `${n.vpn_services.results.filter(r=>r.status==="ok").length}/${n.vpn_services.results.length} доступны` : n.vpn_checked?"HTTPS работает":"—";
    this.devicePanel.rememberFocus();
    this.routesPanel.capture();
    root.innerHTML = `<style>
      :host{display:block;height:100%;overflow:auto;background:var(--primary-background-color);color:var(--primary-text-color);font:16px system-ui}
      *{box-sizing:border-box} main{max-width:1100px;margin:auto;padding:24px 18px 60px} h1{margin:0;font-size:28px} h2{font-size:20px;margin:0 0 16px}
      header{display:flex;align-items:center;gap:12px} .menu{background:transparent;color:inherit;border:0;font-size:24px;padding:8px}
      .lead,small{color:var(--secondary-text-color);line-height:1.5}section{background:var(--card-background-color);border:1px solid var(--divider-color);border-radius:16px;padding:22px;margin:18px 0}
      .row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}button,input{font:inherit}button{border:1px solid var(--divider-color);background:var(--secondary-background-color);color:inherit;border-radius:9px;padding:10px 14px;cursor:pointer}
      button.primary{background:var(--primary-color);color:var(--text-primary-color,#fff)} button:disabled{opacity:.45;cursor:wait} input{background:var(--primary-background-color);color:inherit;border:1px solid var(--divider-color);border-radius:8px;padding:11px;width:100%;margin:6px 0 12px}
      .badge{display:inline-block;background:var(--secondary-background-color);border-radius:9px;padding:5px 9px;font-size:13px}.status{padding:14px;border-left:4px solid var(--primary-color);margin:16px 0}.source{border-top:1px solid var(--divider-color);padding:16px 0}.source:first-child{border:0} .scroll{overflow:auto}table{width:100%;border-collapse:collapse;min-width:650px}td,th{text-align:left;padding:13px 10px;border-bottom:1px solid var(--divider-color)}th{font-size:13px;color:var(--secondary-text-color)}tr.active{background:var(--secondary-background-color)}#error{color:var(--error-color)}.muted{color:var(--secondary-text-color)}
      .services{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px}.service{padding:16px;border:1px solid var(--divider-color);border-radius:12px;border-top:3px solid var(--error-color,#ef5350);min-width:0}.service.ok{border-top-color:var(--success-color,#43a047)}.service.restricted{border-top-color:var(--warning-color,#ffb300)}.service small{overflow-wrap:anywhere}.service-state{font-size:14px;margin:10px 0}.service-report h3{margin-bottom:5px}
      .vpn-list-sync{background:#2e7d32;border-color:#2e7d32;color:#fff}.vpn-list-sync:hover{background:#256728}.sync-meta{font-size:13px;color:var(--secondary-text-color);margin:7px 2px 14px}
      .group-control{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:16px;border:1px solid var(--divider-color);border-radius:12px;background:var(--secondary-background-color)}.group-copy{min-width:0}.group-copy h3{margin:0 0 6px;font-size:18px}.group-copy p{margin:4px 0}.group-copy small{display:block}.group-toggle{flex:0 0 auto;display:flex;align-items:center;gap:10px;border:0;background:transparent;padding:4px 0;color:inherit}.group-toggle:focus-visible{outline:2px solid var(--primary-color);outline-offset:4px}.toggle-track{display:inline-flex;align-items:center;width:56px;height:32px;padding:4px;border-radius:20px;background:#777;transition:background .18s}.toggle-knob{width:24px;height:24px;border-radius:50%;background:#fff;box-shadow:0 1px 3px #0005;transition:transform .18s}.group-toggle.vpn .toggle-track{background:#2e7d32}.group-toggle.partial .toggle-track{background:#b7791f}.group-toggle.vpn .toggle-knob{transform:translateX(24px)}.group-toggle.partial .toggle-knob{transform:translateX(12px)}.toggle-label{min-width:82px;text-align:left;font-weight:600}.check-result{padding:12px 14px;margin-top:12px;border-left:4px solid var(--primary-color);background:var(--secondary-background-color);border-radius:0 8px 8px 0}.check-result strong{display:block;margin-bottom:3px}
      @media(max-width:600px){main{padding:14px 10px 50px}section{padding:16px} .row button{flex:1}h1{font-size:24px}}
      </style><main><header><button class="menu" id="menu" aria-label="Открыть меню">☰</button><h1>VPN дома</h1><span class="badge">NetCraze</span></header>
      <p class="lead">Управление VPN на роутере для выбранных устройств дома.</p>
      <section><div class="row"><button id="vpn-list-sync" class="vpn-list-sync" ${disabled}>Обновить список сервисов</button></div><p class="sync-meta">Последнее обновление: ${escape(date(s.site_routes?.lists?.vpn?.updated))}${s.site_routes?.lists?.vpn?.count?` · ${s.site_routes.lists.vpn.count} адресов и доменов` : ""}</p><small>Загрузит свежий список, проверит конфигурацию Xray и применит маршрутизацию: совпадения из списка — через VPN, остальное — напрямую.</small></section>
      <div class="status" role="status" aria-live="polite">${s.busy ? "⏳ " : ""}${escape(s.message)}${s.duration !== null ? ` · ${s.duration} с` : ""}</div><p id="error"></p>
      <section><h2>Подключение</h2><div class="group-control"><div class="group-copy"><h3>VPN для списка устройств</h3><p><strong>${escape(({vpn:"Включён для всех",partial:"Включён для части устройств",direct:"Выключен для списка",other:"Другая политика",unknown:"Состояние неизвестно"})[s.mode] || "Состояние неизвестно")}</strong> · ${s.clients.vpn_count} из ${s.clients.members.length} через VPN</p><small>Переключатель меняет VPN сразу для всего списка. Отдельные устройства можно настроить ниже.</small></div><button class="group-toggle ${s.mode === "vpn" ? "vpn" : s.mode === "partial" ? "partial" : "direct"}" id="group-toggle" role="checkbox" aria-checked="${s.mode === "partial" ? "mixed" : s.mode === "vpn" ? "true" : "false"}" aria-label="Переключить VPN для всех устройств списка" ${disabled}><span class="toggle-track" aria-hidden="true"><span class="toggle-knob"></span></span><span class="toggle-label">${s.mode === "vpn" ? "Включён" : s.mode === "partial" ? "Частично" : "Выключен"}</span></button></div>
      <p>Активный сервер: <strong>${escape(s.active_name)}</strong></p><div class="row"><button id="status" ${disabled}>↻ Обновить состояние</button></div><div class="check-result" role="status" aria-live="polite"><strong>${escape(s.status_message || "Проверка ещё не запускалась")}</strong><small>${s.status_checked ? `Сверено с NDMS · ${escape(date(s.status_checked))}${s.status_duration !== null ? ` · ${s.status_duration} с` : ""}` : "Кнопка перечитывает состояние роутера и фактические политики устройств."}</small></div>
      <p><small>VPN-сервер сохраняется при выключении. Проверка состояния не меняет настройки роутера.</small></p></section><div id="device-slot"></div>
      <section><h2>Серверы</h2><div class="row"><button id="refresh" ${disabled}>Обновить все подписки</button><button id="check" ${disabled||(!s.selected?"disabled":"")}>Проверить VPN</button></div>
      <p><small>«Проверить VPN» обновляет TCP-задержку всех серверов и проверяет один общий список из шести сервисов через каждый сервер. TCP измеряется с HA (не ICMP ping), HTTPS — с роутера. Выбор строки не переключает роутер.</small></p>
      <div class="scroll"><table><thead><tr><th>Выбор</th><th>Сервер</th><th>TCP</th><th>Проверка VPN</th></tr></thead><tbody>${s.nodes.map(n=>`<tr class="${n.id===s.active?"active":""}"><td><input type="radio" name="server" data-node="${escape(n.id)}" ${n.id===s.selected?"checked":""} ${disabled} aria-label="Выбрать ${escape(n.name)}"></td><td>${escape(n.name)} ${n.id===s.active?'<span class="badge">На роутере</span>':""}<br><small>${escape(s.sources.find(x=>x.id===n.source)?.name||"Подписка")}</small></td><td>${n.checked?(n.latency===null?"Нет ответа":`${n.latency} мс`):"—"}<br><small>${n.checked?escape(date(n.checked)):""}</small></td><td>${escape(summary(n))}<br><small>${escape(date(n.vpn_services?.checked || n.vpn_checked))}</small></td></tr>`).join("")||'<tr><td colspan="4">Добавьте подписку ниже.</td></tr>'}</tbody></table></div>
      <p class="row"><button id="apply" class="primary" ${disabled||(!s.selected?"disabled":"")}>Применить выбранный сервер</button></p>
      <div class="service-report" aria-live="polite"><h3>Сервисы через выбранный VPN</h3><p class="muted">${escape(selected?.name || "Выберите сервер")} · ${escape(date(report?.checked))}</p>
      ${report?`<div class="services">${report.results.map(r=>`<article class="service ${escape(r.status)}"><strong>${escape(r.name)}</strong><p class="service-state">${r.status==="ok"?"●":r.status==="restricted"?"◐":"○"} ${escape(r.message)}</p><small>${r.http?`HTTP ${r.http} · `:""}Всего: ${r.total_ms} мс${r.first_byte_ms?`<br>Первый ответ: ${r.first_byte_ms} мс`:""}${r.tls_ms?` · TLS: ${r.tls_ms} мс`:""}<br>${escape(r.url)}</small></article>`).join("")}</div>`:'<p class="muted">Нажмите «Проверить VPN» — измерим TCP-задержку и проверим один общий список из шести сервисов через каждый сервер. Запросы идут парами, до 20 секунд на сервис.</p>'}
      <p><small>Запросы идут с роутера через выбранный сервер, даже если он ещё не применён. Доступность страницы не гарантирует вход в аккаунт, звонки MAX, работу Telegram-приложения или видео YouTube. 403/429 может означать защиту сайта или ограничения IP. Время включает VPN и HTTPS; это не ping и не тест скорости.</small></p></div>
      <small>Перед применением: проверка Xray и HTTPS, резервная копия. После переключения: повторная проверка; при ошибке — возврат предыдущей конфигурации. Текущие соединения телефона могут переподключиться.</small></section>
      <div id="routes-slot"></div><section><h2>Подписки</h2><div>${s.sources.map(source=>`<div class="source"><strong>${escape(source.name)}</strong> <span class="badge">${escape(source.host)}</span><p><small>${source.error?escape(source.error):`Обновлено: ${escape(date(source.updated))}`}${source.skipped?` · Пропущено неподдерживаемых: ${source.skipped}`:""}</small></p><div class="row"><button data-refresh="${source.id}" ${disabled}>Обновить</button><button data-edit="${source.id}" ${disabled}>Заменить ссылку</button><button data-delete="${source.id}" ${disabled}>Удалить источник</button></div></div>`).join("")}</div>
      <h3>${this.edit?"Замена ссылки подписки":"Добавить подписку"}</h3><label>Название<input id="source-name" maxlength="60" autocomplete="off" placeholder="Основная подписка" ${disabled}></label>
      <label>Ссылка HTTPS<input id="source-url" type="password" autocomplete="new-password" placeholder="Вставьте ссылку подписки" ${disabled}></label><div class="row"><button id="save" class="primary" ${disabled}>Проверить и сохранить</button>${this.edit?'<button id="cancel">Отменить замену</button>':""}</div>
      <p><small>Можно добавить несколько источников. Ссылки и ключи не показываются в состояниях HA и истории. Обновление списка не меняет активный сервер. Поддерживаются VLESS TCP REALITY.</small></p></section>
      <p class="muted"><small>Если Home Assistant выключен, VPN продолжает работать на роутере. Панель доступна администраторам HA. Изменения начинают действовать для новых соединений; приложения могут удерживать старые соединения.</small></p></main>`;
    root.querySelector("#source-name").value=draftName; root.querySelector("#source-url").value=draftUrl;
    root.querySelector("#device-slot").append(this.devicePanel); this.devicePanel.state=s;
    root.querySelector("#routes-slot").append(this.routesPanel); this.routesPanel.state=s;
    const on=(id,fn)=>root.querySelector("#"+id)?.addEventListener("click",fn);
    on("menu",()=>this.dispatchEvent(new CustomEvent("hass-toggle-menu",{bubbles:true,composed:true})));
    on("vpn-list-sync",()=>this.action("routes_sync_vpn"));
    for(const key of ["status","refresh","check","apply"])on(key,()=>this.action(key));
    on("group-toggle",()=>this.action("group_mode",{mode:s.mode === "vpn" ? "direct" : "vpn"}));
    root.querySelectorAll("[data-node]").forEach(el=>el.addEventListener("change",()=>this.action("select",{id:el.dataset.node})));
    root.querySelectorAll("[data-refresh]").forEach(el=>el.onclick=()=>this.action("refresh",{id:el.dataset.refresh}));
    root.querySelectorAll("[data-edit]").forEach(el=>el.onclick=()=>{this.edit=el.dataset.edit;root.querySelector("#source-name").value=s.sources.find(x=>x.id===this.edit).name;root.querySelector("#source-url").value="";this.render();root.querySelector("#source-url").focus();});
    root.querySelectorAll("[data-delete]").forEach(el=>el.onclick=()=>this.action("source_delete",{id:el.dataset.delete}));
    on("cancel",()=>{this.edit="";root.querySelector("#source-url").value="";this.render();});
    on("save",()=>{const name=root.querySelector("#source-name").value,url=root.querySelector("#source-url").value;if(!url)return;
      const id=this.edit;this.edit="";root.querySelector("#source-url").value="";this.action("source_save",{id,name,url});});
  }
}
if(!customElements.get("netcraze-vpn-panel")) customElements.define("netcraze-vpn-panel",NetcrazeVPNPanel);
