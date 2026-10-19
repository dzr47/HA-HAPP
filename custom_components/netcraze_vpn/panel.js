/* Local HA web component. Only the language preference is kept in localStorage. */
import './devices-panel.js?v=0.1.3';
import './routes-panel.js?v=0.1.3';
import {localize, locale, languageFromHA, displaySourceName, translate} from './localization.js?v=0.1.3';
const escape = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
class NetcrazeVPNPanel extends HTMLElement {
  constructor() { super(); this.attachShadow({mode:"open"}); this.s = null; this.edit = ""; this.polling = false; this.generation=0; this.panelLanguage=null; this.activeTab="overview"; this.actionProgress=null; this.operationTimer=null;
    this.devicePanel=document.createElement("netcraze-vpn-devices");
    this.devicePanel.addEventListener("vpn-action",event=>this.action(event.detail.action,event.detail.payload));
    this.routesPanel=document.createElement("netcraze-vpn-routes");
    this.routesPanel.addEventListener("vpn-action",event=>this.action(event.detail.action,event.detail.payload)); }
  set hass(value) { this._hass = value;
    if (!this.panelLanguage) {
      let saved;
      try { saved=localStorage.getItem(`netcraze_vpn.language.${value.user?.id || "default"}`); } catch (_) { /* Private browsing can disable storage. */ }
      this.panelLanguage=["ru","en","de","es","zh"].includes(saved) ? saved : languageFromHA(value.language || value.locale?.language);
    }
    if (!this.polling && this.isConnected) this.start(); }
  connectedCallback() { if (this._hass) this.start(); }
    disconnectedCallback() { this.polling = false; this.generation++; clearTimeout(this.timer); clearInterval(this.operationTimer);this.operationTimer=null; }
  async start() { if(this.polling) return; this.polling = true; await this.poll(++this.generation); }
  async poll(generation=this.generation) {
    if (!this.polling || generation!==this.generation) return;
    try {
      const state = await this._hass.callWS({type:"netcraze_vpn/state"});
      if(generation!==this.generation || !this.polling)return;
      const operationChanged=this.trackOperation(state);
      // Preserve partially typed URLs and names across status polling.
      if (!this.s || JSON.stringify(state) !== JSON.stringify(this.s)) { this.s = state; this.render(); }
      else if(operationChanged) this.render();
    } catch(e) {
      console.error("HA HAPP panel error",e);
      this.shadowRoot.innerHTML=`<style>:host{display:block;color:var(--primary-text-color);padding:24px;font:16px system-ui}</style><div role="alert">${escape(translate(this.panelLanguage,"Не удалось отобразить панель VPN. Перезагрузите страницу или проверьте интеграцию."))}</div>`;
    }
    if(this.polling && generation===this.generation) this.timer = setTimeout(() => this.poll(generation), this.s?.busy || this.actionProgress?.phase==="accepted" ? 400 : 5000);
  }
  stateFingerprint(state) { return JSON.stringify([state?.message,state?.duration,state?.status_checked,state?.active,state?.selected,state?.mode,state?.clients,state?.site_routes,state?.sources,state?.nodes]); }
  trackOperation(state) {
    const op=this.actionProgress;if(!op||!["starting","accepted","running"].includes(op.phase))return false;
    if(state.busy){op.seenBusy=true;if(op.accepted&&op.phase!=="running"){op.phase="running";return true;}return false;}
    if(!op.accepted)return false;
    const changed=this.stateFingerprint(state)!==op.baseline;
    if(op.seenBusy||changed){
      const ok=state.message==="Готово" || (op.key==="status" && Boolean(state.status_checked) && state.status_checked!==op.baselineStatus);
      op.phase=ok?"success":"error";
      op.result=ok?this.operationResult(op.key,state):state.message||translate(this.panelLanguage,"Операция не выполнена");
      op.elapsed=(Date.now()-op.startedAt)/1000;
      clearInterval(this.operationTimer);this.operationTimer=null;
      return true;
    }
    if(Date.now()-op.startedAt>130000){
      op.phase="error";op.result=translate(this.panelLanguage,"Нет подтверждения завершения. Проверьте состояние перед повтором.");op.elapsed=(Date.now()-op.startedAt)/1000;
      clearInterval(this.operationTimer);this.operationTimer=null;return true;
    }
    return false;
  }
  operationResult(key,state) {
    const message={
      status:"Состояние роутера и политики устройств перечитаны.",
      refresh:"Подписки обновлены. Активный сервер не менялся.",
      check:"Проверка серверов завершена.",
      apply:"Роутер подтвердил выбранный сервер.",
      select:"Сервер выбран. Настройки роутера не менялись.",
      group_mode:"NDMS подтвердил политики устройств.",
      device_set:"NDMS подтвердил политику устройства.",
      device_sync:"Список устройств обновлён из NDMS.",
      device_add:"Устройство добавлено в список. Это само по себе не включает VPN.",
      device_remove:"Устройство удалено из списка VPN.",
      routes_save:"Список сохранён. Чтобы изменить маршрутизацию, проверьте и примените правила.",
      routes_mode:"Режим сохранён. Для изменения на роутере проверьте и примените правила.",
      routes_refresh:"Источники списков обновлены. Проверьте и примените правила.",
      routes_sync_vpn:"VPN-список обновлён, проверен и применён.",
      routes_validate:state.site_routes?.can_apply?"Правила проверены. Их можно применить.":"Проверка завершена; проверьте результат перед применением.",
      routes_apply:"Роутер подтвердил применение правил.",
      source_save:"Подписка проверена и сохранена. Активный сервер не менялся.",
      source_delete:"Источник подписки удалён."
    }[key] || "Операция завершена.";
    return key==="status"&&state.status_message?state.status_message:translate(this.panelLanguage,message);
  }
  actionName(key) {
    return translate(this.panelLanguage,({
      status:"Проверка состояния роутера",refresh:"Обновление подписок",check:"Проверка серверов",apply:"Применение выбранного сервера",
      select:"Выбор сервера",group_mode:"Изменение VPN для всех устройств",device_set:"Изменение VPN устройства",device_sync:"Синхронизация устройств с NDMS",
      device_add:"Добавление устройства",device_remove:"Удаление устройства из VPN",routes_save:"Сохранение списка маршрутов",routes_mode:"Сохранение режима маршрутизации",
      routes_refresh:"Обновление источников маршрутов",routes_sync_vpn:"Обновление VPN-списка и применение",routes_validate:"Проверка правил маршрутизации",
      routes_apply:"Применение правил маршрутизации",source_save:"Сохранение подписки",source_delete:"Удаление источника подписки"
    })[key] || "Операция");
  }
  operationClock() {
    const el=this.shadowRoot.querySelector(".operation-elapsed"),op=this.actionProgress;if(!el||!op||!["starting","accepted","running"].includes(op.phase))return;
    const seconds=(Date.now()-op.startedAt)/1000;
    const elapsed=seconds<60?seconds.toFixed(1)+" "+translate(this.panelLanguage,"сек"):Math.floor(seconds/60)+" "+translate(this.panelLanguage,"мин")+" "+Math.floor(seconds%60)+" "+translate(this.panelLanguage,"сек");
    el.textContent=translate(this.panelLanguage,"Прошло")+" "+elapsed;
  }
  startOperationClock() { clearInterval(this.operationTimer);this.operationClock();this.operationTimer=setInterval(()=>this.operationClock(),1000); }
  async action(action, payload={}) {
    if((this.actionProgress&&["starting","accepted","running"].includes(this.actionProgress.phase))||this.s?.busy)return;
    this.actionProgress={key:action,phase:"starting",startedAt:Date.now(),baseline:this.stateFingerprint(this.s),baselineStatus:this.s?.status_checked,accepted:false,seenBusy:false};this.focusProgress=true;
    this.startOperationClock();this.render();
    try {
      const result=await this._hass.callWS({type:"netcraze_vpn/action", action, payload});
      if(!result?.accepted)throw new Error("Команда не принята");
      if(!this.actionProgress)return;
      this.actionProgress.accepted=true;this.actionProgress.phase=this.actionProgress.seenBusy?"running":"accepted";this.render();
      clearTimeout(this.timer);const generation=++this.generation;this.timer=setTimeout(()=>this.poll(generation),80);
    } catch(e) {
      if(!this.actionProgress)return;
      this.actionProgress.phase="error";this.actionProgress.result=e.message||translate(this.panelLanguage,"Команда не принята");
      this.actionProgress.elapsed=(Date.now()-this.actionProgress.startedAt)/1000;
      clearInterval(this.operationTimer);this.operationTimer=null;this.render();
    }
  }
  render() {
    const root = this.shadowRoot, s = this.s;
    const keepProgressFocus=root.activeElement?.id==="operation-feedback";
    const date=value=>value ? new Date(value * 1000).toLocaleString(locale(this.panelLanguage)) : "Ещё не проверяли";
    const draftName = root.querySelector("#source-name")?.value || "";
    const draftUrl = root.querySelector("#source-url")?.value || "";
    const pending=["starting","accepted","running"].includes(this.actionProgress?.phase);
    const uiBusy=s.busy||pending;
    const disabled = uiBusy ? "disabled" : "";
    const openDetails=[...root.querySelectorAll('details[open]')].map(el=>el.id);
    const selected=s.nodes.find(n=>n.id===s.selected), report=selected?.vpn_services;
      const serviceSummary=n=>n.vpn_services ? `${n.vpn_services.results.filter(r=>r.status==="ok").length}/${n.vpn_services.results.length} доступны` : n.vpn_checked?"HTTPS работает":"—";
    this.devicePanel.rememberFocus();
    this.routesPanel.capture();
    root.innerHTML = `<style>
      :host{display:block;min-height:100%;overflow:visible;background:var(--primary-background-color);color:var(--primary-text-color);font:16px system-ui}
      *{box-sizing:border-box} main{max-width:1100px;margin:auto;padding:24px 18px 60px} h1{margin:0;font-size:28px} h2{font-size:20px;margin:0 0 16px}
      header{display:flex;align-items:center;gap:12px;flex-wrap:wrap} .menu{background:transparent;color:inherit;border:0;font-size:24px;padding:8px}.language{margin-left:auto;font-size:13px;display:flex;align-items:center;gap:7px}.language select{font:inherit;padding:7px 9px;border:1px solid var(--divider-color);border-radius:8px;background:var(--card-background-color);color:inherit}
      .lead,small{color:var(--secondary-text-color);line-height:1.5}section{background:var(--card-background-color);border:1px solid var(--divider-color);border-radius:16px;padding:22px;margin:18px 0}
      .row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}button,input{font:inherit}button{border:1px solid var(--divider-color);background:var(--secondary-background-color);color:inherit;border-radius:9px;padding:10px 14px;cursor:pointer}
      button.primary{background:var(--primary-color);color:var(--text-primary-color,#fff)} button:disabled{opacity:.45;cursor:wait} input{background:var(--primary-background-color);color:inherit;border:1px solid var(--divider-color);border-radius:8px;padding:11px;width:100%;margin:6px 0 12px}
      .badge{display:inline-block;background:var(--secondary-background-color);border-radius:9px;padding:5px 9px;font-size:13px}.status{padding:14px;border-left:4px solid var(--primary-color);margin:16px 0}.source{border-top:1px solid var(--divider-color);padding:16px 0}.source:first-child{border:0} .scroll{overflow:auto}table{width:100%;border-collapse:collapse;min-width:650px}td,th{text-align:left;padding:13px 10px;border-bottom:1px solid var(--divider-color)}th{font-size:13px;color:var(--secondary-text-color)}tr.active{background:var(--secondary-background-color)}#error{color:var(--error-color)}.muted{color:var(--secondary-text-color)}
      .services{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px}.service{padding:16px;border:1px solid var(--divider-color);border-radius:12px;border-top:3px solid var(--error-color,#ef5350);min-width:0}.service.ok{border-top-color:var(--success-color,#43a047)}.service.restricted{border-top-color:var(--warning-color,#ffb300)}.service small{overflow-wrap:anywhere}.service-state{font-size:14px;margin:10px 0}.service-report h3{margin-bottom:5px}
      .vpn-list-sync{background:#2e7d32;border-color:#2e7d32;color:#fff}.vpn-list-sync:hover{background:#256728}.sync-meta{font-size:13px;color:var(--secondary-text-color);margin:7px 2px 14px}
      .group-control{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:16px;border:1px solid var(--divider-color);border-radius:12px;background:var(--secondary-background-color)}.group-copy{min-width:0}.group-copy h3{margin:0 0 6px;font-size:18px}.group-copy p{margin:4px 0}.group-copy small{display:block}.group-toggle{flex:0 0 auto;display:flex;align-items:center;gap:10px;border:0;background:transparent;padding:4px 0;color:inherit}.group-toggle:focus-visible{outline:2px solid var(--primary-color);outline-offset:4px}.toggle-track{display:inline-flex;align-items:center;width:56px;height:32px;padding:4px;border-radius:20px;background:#777;transition:background .18s}.toggle-knob{width:24px;height:24px;border-radius:50%;background:#fff;box-shadow:0 1px 3px #0005;transition:transform .18s}.group-toggle.vpn .toggle-track{background:#2e7d32}.group-toggle.partial .toggle-track{background:#b7791f}.group-toggle.vpn .toggle-knob{transform:translateX(24px)}.group-toggle.partial .toggle-knob{transform:translateX(12px)}.toggle-label{min-width:82px;text-align:left;font-weight:600}.check-result{padding:12px 14px;margin-top:12px;border-left:4px solid var(--primary-color);background:var(--secondary-background-color);border-radius:0 8px 8px 0}.check-result strong{display:block;margin-bottom:3px}
      .section-nav{position:sticky;top:0;z-index:5;padding:9px;margin:10px 0;background:var(--primary-background-color);border-bottom:1px solid var(--divider-color)}.section-nav-inner{display:flex;gap:6px;overflow-x:auto;scrollbar-width:thin}.section-nav button{white-space:nowrap;padding:9px 13px;font-size:14px;border-color:transparent;background:transparent}.section-nav button[aria-selected="true"]{background:var(--secondary-background-color);border-color:var(--divider-color);font-weight:700;box-shadow:inset 0 -2px var(--primary-color)}.section-nav button:focus-visible{outline:2px solid var(--primary-color);outline-offset:2px}
      .tab-panel[hidden]{display:none}.operation-feedback{display:flex;align-items:flex-start;gap:12px;padding:11px 14px;margin:12px 0;border:1px solid var(--divider-color);border-left:4px solid var(--primary-color);border-radius:8px;background:var(--card-background-color)}.operation-feedback[data-phase="success"]{border-left-color:var(--success-color,#2e7d32)}.operation-feedback[data-phase="error"]{border-left-color:var(--error-color,#d32f2f)}.operation-copy{flex:1;min-width:0}.operation-title{font-weight:650}.operation-result{margin-top:4px;color:var(--secondary-text-color);line-height:1.45}.operation-dismiss{flex:0 0 auto;padding:4px 9px}.operation-elapsed{display:block;margin-top:3px;font-size:13px;color:var(--secondary-text-color)}.operation-spin{display:inline-block;margin-right:5px}
      .overview-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:4px 0 18px}.overview-metric{min-width:0;padding:14px;border:1px solid var(--divider-color);border-radius:10px;background:var(--secondary-background-color)}.overview-metric span{display:block;color:var(--secondary-text-color);font-size:13px}.overview-metric strong{display:block;margin-top:5px;font-size:17px;overflow-wrap:anywhere}.overview-metric small{display:block;margin-top:4px}
      .group-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap}.group-actions button{min-height:42px}.group-actions button[data-group-mode="vpn"]{background:var(--primary-color);color:var(--text-primary-color,#fff)}
      @media(max-width:700px){.overview-grid{grid-template-columns:1fr 1fr}.section-nav{padding:6px 2px}.section-nav button{padding:9px 10px;font-size:13px}.operation-feedback{gap:8px}}
      @media(max-width:430px){.overview-grid{grid-template-columns:1fr}.section-nav-inner{gap:3px}.section-nav button{padding:8px 9px}}
      @media(max-width:600px){main{padding:14px 10px 50px}section{padding:16px} .row button{flex:1}h1{font-size:24px}}
      </style><main lang="${this.panelLanguage==="zh"?"zh-Hans":this.panelLanguage}"><header><button class="menu" id="menu" aria-label="Открыть меню">☰</button><h1>VPN дома</h1><span class="badge">NetCraze</span><label class="language">Язык панели <select id="panel-language" aria-label="Язык панели"><option data-no-translate value="ru" ${this.panelLanguage==="ru"?"selected":""}>Русский</option><option data-no-translate value="en" ${this.panelLanguage==="en"?"selected":""}>English</option><option data-no-translate value="de" ${this.panelLanguage==="de"?"selected":""}>Deutsch</option><option data-no-translate value="es" ${this.panelLanguage==="es"?"selected":""}>Español</option><option data-no-translate value="zh" ${this.panelLanguage==="zh"?"selected":""}>简体中文</option></select></label></header>
      <p class="lead">Управление VPN на роутере для выбранных устройств дома.</p>
      <nav class="section-nav" aria-label="Разделы панели"><div class="section-nav-inner"><button data-jump="connection">Подключение</button><button data-jump="device-slot">Устройства VPN</button><button data-jump="servers">Серверы</button><button data-jump="routes-slot">Маршрутизация сайтов</button><button data-jump="subscriptions">Подписки</button></div></nav>
      <section><div class="row"><button id="vpn-list-sync" class="vpn-list-sync" ${disabled}>Обновить список и применить</button></div><p class="sync-meta">Последнее обновление: ${escape(date(s.site_routes?.lists?.vpn?.updated))}${s.site_routes?.lists?.vpn?.count?` · ${s.site_routes.lists.vpn.count} адресов и доменов` : ""}</p><small>Обновляет VPN-список, проверяет конфигурацию и сразу применяет маршрутизацию: сайты из списка идут через VPN, остальной трафик — напрямую.</small></section>
      ${s.busy || s.message!=="Готово"?`<div class="status" role="status" aria-live="polite">${s.busy ? "⏳ " : ""}${escape(s.message)}${s.duration !== null ? ` · ${s.duration} с` : ""}</div>`:""}<p id="error"></p>
      <section id="connection" class="anchor"><h2>Подключение</h2><div class="group-control"><div class="group-copy"><h3>VPN для списка устройств</h3><p><strong>${escape(({vpn:"Включён для всех",partial:"Включён для части устройств",direct:"Выключен для списка",other:"Другая политика",unknown:"Состояние неизвестно"})[s.mode] || "Состояние неизвестно")}</strong> · ${s.clients.vpn_count} из ${s.clients.members.length} через VPN</p><small>Переключатель меняет VPN сразу для всего списка. Отдельные устройства можно настроить ниже.</small></div><button class="group-toggle ${s.mode === "vpn" ? "vpn" : s.mode === "partial" ? "partial" : "direct"}" id="group-toggle" role="checkbox" aria-checked="${s.mode === "partial" ? "mixed" : s.mode === "vpn" ? "true" : "false"}" aria-label="Переключить VPN для всех устройств списка" ${disabled}><span class="toggle-track" aria-hidden="true"><span class="toggle-knob"></span></span><span class="toggle-label">${s.mode === "vpn" ? "Включён" : s.mode === "partial" ? "Частично" : "Выключен"}</span></button></div>
      <p>Активный сервер: <strong data-no-translate>${escape(s.active_name)}</strong></p><div class="row"><button id="status" ${disabled}>↻ Обновить состояние</button></div><div class="check-result" role="status" aria-live="polite"><strong>${escape(s.status_message || "Проверка ещё не запускалась")}</strong><small>${s.status_checked ? `Сверено с NDMS · ${escape(date(s.status_checked))}${s.status_duration !== null ? ` · ${s.status_duration} с` : ""}` : "Кнопка перечитывает состояние роутера и фактические политики устройств."}</small></div>
      <p><small>VPN-сервер сохраняется при выключении. Проверка состояния не меняет настройки роутера.</small></p></section><div id="device-slot"></div>
      <section id="servers" class="anchor"><h2>Серверы</h2><div class="row"><button id="refresh" ${disabled}>Обновить все подписки</button><button id="check" ${disabled||(!s.selected?"disabled":"")}>Проверить все серверы</button></div>
      <p><small>Проверка обновляет TCP-задержку и запускает один общий список сервисов через каждый сервер. Выбор строки не переключает роутер.</small></p><details><summary>Как выполняется проверка</summary><p class="muted">TCP измеряется с Home Assistant, а HTTPS — с роутера. Проверка запускает шесть одинаковых сервисов для каждого сервера.</p></details>
      <div class="scroll"><table><thead><tr><th>Выбор</th><th>Сервер</th><th>TCP</th><th>Проверка VPN</th></tr></thead><tbody>${s.nodes.map(n=>`<tr class="${n.id===s.active?"active":""}"><td><input type="radio" name="server" data-node="${escape(n.id)}" ${n.id===s.selected?"checked":""} ${disabled} data-no-translate aria-label="${escape(translate(this.panelLanguage,"Выбрать"))} ${escape(n.name)}"></td><td><span data-no-translate>${escape(n.name)}</span> ${n.id===s.active?'<span class="badge">На роутере</span>':""}<br><small data-no-translate>${escape(displaySourceName(this.panelLanguage,s.sources.find(x=>x.id===n.source)?.name||translate(this.panelLanguage,"Подписка")))}</small></td><td>${n.checked?(n.latency===null?"Нет ответа":`${n.latency} мс`):"—"}<br><small>${n.checked?escape(date(n.checked)):""}</small></td><td>${escape(serviceSummary(n))}<br><small>${escape(date(n.vpn_services?.checked || n.vpn_checked))}</small></td></tr>`).join("")||'<tr><td colspan="4">Добавьте подписку ниже.</td></tr>'}</tbody></table></div>
      <p class="row"><button id="apply" class="primary" ${disabled||(!s.selected?"disabled":"")}>Применить выбранный сервер</button></p>
      <div class="service-report" aria-live="polite"><h3>Сервисы через выбранный VPN</h3><p class="muted"><span data-no-translate>${escape(selected?.name || translate(this.panelLanguage,"Выберите сервер"))}</span> · ${escape(date(report?.checked))}</p>
      ${report?`<div class="services">${report.results.map((r,i)=>`<article class="service ${escape(r.status)}"><strong>${escape(r.name)}</strong><p class="service-state">${r.status==="ok"?"●":r.status==="restricted"?"◐":"○"} ${escape(r.message)}</p><small>${r.http?`HTTP ${r.http} · `:""}Всего: ${r.total_ms} мс</small><details><summary>Технические детали</summary><p class="service-meta"><small>${r.first_byte_ms?`Первый ответ: ${r.first_byte_ms} мс`:""}${r.first_byte_ms&&r.tls_ms?" · ":""}${r.tls_ms?`TLS: ${r.tls_ms} мс`:""}<br><span data-no-translate>${escape(r.url)}</span></small></p></details></article>`).join("")}</div>`:'<p class="muted">Нажмите «Проверить все серверы», чтобы измерить задержку и проверить доступность сервисов через каждый сервер.</p>'}
      <details><summary>Что именно проверяется</summary><p class="muted">Запросы идут с роутера через выбранный сервер, даже если он ещё не применён. Доступность страницы не гарантирует вход в аккаунт, звонки MAX, работу Telegram-приложения или видео YouTube. 403/429 может означать защиту сайта или ограничения IP. Время включает VPN и HTTPS; это не ping и не тест скорости.</p></details></div>
      <small>Перед применением конфигурация проверяется и сохраняется резервная копия. При ошибке возвращается предыдущая конфигурация.</small></section>
      <div id="routes-slot" class="anchor"></div><section id="subscriptions" class="anchor"><details id="subscription-details"><summary><strong>Подписки</strong> · ${s.sources.length}</summary><div>${s.sources.map(source=>`<div class="source"><strong data-no-translate>${escape(displaySourceName(this.panelLanguage,source.name))}</strong> <span class="badge" data-no-translate>${escape(source.host)}</span><p><small>${source.error?escape(source.error):`Обновлено: ${escape(date(source.updated))}`}${source.skipped?` · Пропущено неподдерживаемых: ${source.skipped}`:""}</small></p><div class="row"><button data-refresh="${source.id}" ${disabled}>Обновить</button><button data-edit="${source.id}" ${disabled}>Заменить ссылку</button><button data-delete="${source.id}" ${disabled}>Удалить источник</button></div></div>`).join("")}</div>
      <h3>${this.edit?"Замена ссылки подписки":"Добавить подписку"}</h3><label>Название<input id="source-name" maxlength="60" autocomplete="off" placeholder="Основная подписка" ${disabled}></label>
      <label>Ссылка HTTPS<input id="source-url" type="password" autocomplete="new-password" placeholder="Вставьте ссылку подписки" ${disabled}></label><div class="row"><button id="save" class="primary" ${disabled}>Проверить и сохранить</button>${this.edit?'<button id="cancel">Отменить замену</button>':""}</div>
      <p><small>Можно добавить несколько источников. Ссылки и ключи не показываются в состояниях HA и истории. Обновление списка не меняет активный сервер. Поддерживаются VLESS TCP REALITY.</small></p></details></section>
      <p class="muted"><small>Если Home Assistant выключен, VPN продолжает работать на роутере. Панель доступна администраторам HA. Изменения начинают действовать для новых соединений; приложения могут удерживать старые соединения.</small></p></main>`;
    const nav=root.querySelector(".section-nav");
    const tabs=[["overview","Обзор"],["devices","Устройства"],["servers","Серверы"],["routes","Маршруты"]];
    nav.setAttribute("role","tablist");nav.setAttribute("aria-label","Разделы панели");nav.innerHTML='<div class="section-nav-inner"></div>';
    const tabBar=nav.querySelector(".section-nav-inner");
    const panels=Object.fromEntries(tabs.map(([id,label])=>{const button=document.createElement("button");button.type="button";button.id="tab-button-"+id;button.dataset.tab=id;button.setAttribute("role","tab");button.setAttribute("aria-controls","tab-panel-"+id);button.setAttribute("aria-selected",String(this.activeTab===id));button.tabIndex=this.activeTab===id?0:-1;button.textContent=label;tabBar.append(button);const panel=document.createElement("div");panel.className="tab-panel";panel.id="tab-panel-"+id;panel.setAttribute("role","tabpanel");panel.setAttribute("aria-labelledby",button.id);panel.hidden=this.activeTab!==id;panel.tabIndex=0;return [id,panel];}));
    const makeMetric=(label,value,detail,plain=false)=>{const card=document.createElement("div");card.className="overview-metric";const title=document.createElement("span");title.textContent=label;const strong=document.createElement("strong");strong.textContent=value;if(plain)strong.dataset.noTranslate="";card.append(title,strong);if(detail){const small=document.createElement("small");small.textContent=detail;card.append(small);}return card;};
    const summary=document.createElement("section");summary.className="overview-summary";const summaryTitle=document.createElement("h2");summaryTitle.textContent="Обзор";summary.append(summaryTitle);
    const grid=document.createElement("div");grid.className="overview-grid";
    const modeText=({vpn:"Включён для всех",partial:"Включён для части устройств",direct:"Выключен для списка",other:"Другая политика",unknown:"Состояние неизвестно"})[s.mode]||"Состояние неизвестно";
    grid.append(makeMetric("Состояние VPN",modeText,s.clients.vpn_count+" из "+s.clients.members.length+" через VPN"));
    grid.append(makeMetric("Активный сервер",s.active_name||"—","Сейчас настроен на роутере",true));
    const routeMode=s.site_routes?.modes?.[s.site_routes?.active_mode]||"Состояние маршрутов неизвестно";
    grid.append(makeMetric("Маршруты",routeMode,(s.site_routes?.lists?.vpn?.count||0)+" сайтов в VPN-списке"));
    summary.append(grid);
    const syncSection=root.querySelector("#vpn-list-sync")?.closest("section"),connection=root.querySelector("#connection");
    const serverLine=[...(connection?.querySelectorAll("p")||[])].find(el=>el.textContent.includes("Активный сервер:"));
    const statusRow=root.querySelector("#status")?.parentElement,checkResult=connection?.querySelector(".check-result");
    root.querySelectorAll(".status,#error").forEach(el=>el.remove());
    if(serverLine)serverLine.remove();
    if(statusRow)statusRow.remove();
    if(checkResult)checkResult.remove();
    summary.append(statusRow||document.createTextNode(""));
    summary.append(checkResult||document.createTextNode(""));
    if(syncSection)panels.overview.append(summary,syncSection);
    if(connection){
      const heading=connection.querySelector("h2");if(heading)heading.textContent="Управление VPN для устройств";
      const help=connection.querySelector(".group-copy small");if(help)help.textContent="Можно включить VPN для всего списка или оставить устройства на обычном подключении.";
      const oldToggle=connection.querySelector("#group-toggle");
      if(oldToggle){const actions=document.createElement("div");actions.className="group-actions";const modes=s.mode==="partial"?["vpn","direct"]:[s.mode==="vpn"?"direct":"vpn"];
        for(const mode of modes){const button=document.createElement("button");button.type="button";button.dataset.groupMode=mode;button.disabled=uiBusy;button.textContent=mode==="vpn"?"Включить VPN для всех":"Выключить VPN для всех";actions.append(button);}oldToggle.replaceWith(actions);}
      panels.devices.append(connection);
    }
    const deviceSlot=root.querySelector("#device-slot");if(deviceSlot)panels.devices.append(deviceSlot);
    const servers=root.querySelector("#servers"),subscriptions=root.querySelector("#subscriptions");
    if(servers)panels.servers.append(servers);if(subscriptions)panels.servers.append(subscriptions);
    const routes=root.querySelector("#routes-slot");if(routes)panels.routes.append(routes);
    nav.after(...Object.values(panels));
    const operation=this.actionProgress;
    if(operation){
      const banner=document.createElement("div");banner.id="operation-feedback";banner.tabIndex=-1;banner.className="operation-feedback";banner.dataset.phase=operation.phase;banner.setAttribute("role",operation.phase==="error"?"alert":"status");banner.setAttribute("aria-live",operation.phase==="error"?"assertive":"polite");
      const copy=document.createElement("div");copy.className="operation-copy";const title=document.createElement("div");title.className="operation-title";
      const phaseLabel={starting:"Запускаю:",accepted:"Запрос принят:",running:"Выполняется:",success:"Готово:",error:"Не выполнено:"}[operation.phase]||"Выполняется:";
      title.textContent=(["starting","accepted","running"].includes(operation.phase)?"⏳ ":"")+translate(this.panelLanguage,phaseLabel)+" "+this.actionName(operation.key);copy.append(title);
      if(operation.result){const result=document.createElement("div");result.className="operation-result";result.textContent=translate(this.panelLanguage,operation.result);copy.append(result);}
      const elapsed=document.createElement("small");elapsed.className="operation-elapsed";copy.append(elapsed);
      if(operation.phase==="success"||operation.phase==="error"){elapsed.textContent=translate(this.panelLanguage,"Время выполнения")+" "+(operation.elapsed??((Date.now()-operation.startedAt)/1000)).toFixed(1)+" "+translate(this.panelLanguage,"сек");}
      banner.append(copy);
      const dismiss=document.createElement("button");dismiss.type="button";dismiss.className="operation-dismiss";dismiss.id="operation-dismiss";dismiss.setAttribute("aria-label","Закрыть уведомление");dismiss.textContent="×";banner.append(dismiss);
      nav.after(banner);if(["starting","accepted","running"].includes(operation.phase))this.operationClock();
      if(this.focusProgress||keepProgressFocus){banner.focus({preventScroll:true});this.focusProgress=false;}
    }
    if(this.pendingFocusTab){root.querySelector('[data-tab="'+this.pendingFocusTab+'"]')?.focus({preventScroll:true});this.pendingFocusTab=null;}
    root.querySelector("#source-name").value=draftName; root.querySelector("#source-url").value=draftUrl;
    for(const id of openDetails){const el=root.getElementById(id);if(el)el.open=true;}
    localize(root,this.panelLanguage);
    root.querySelector("#device-slot").append(this.devicePanel); this.devicePanel.language=this.panelLanguage; this.devicePanel.state={...s,busy:uiBusy};
    root.querySelector("#routes-slot").append(this.routesPanel); this.routesPanel.language=this.panelLanguage; this.routesPanel.state={...s,busy:uiBusy};
    const on=(id,fn)=>root.querySelector("#"+id)?.addEventListener("click",fn);
    on("menu",()=>this.dispatchEvent(new CustomEvent("hass-toggle-menu",{bubbles:true,composed:true})));
    root.querySelector("#panel-language").onchange=event=>{
      this.panelLanguage=event.target.value;
      try { localStorage.setItem(`netcraze_vpn.language.${this._hass?.user?.id || "default"}`,this.panelLanguage); } catch (_) { /* Language still works this session. */ }
      this.render();
      this.shadowRoot.querySelector("#panel-language")?.focus({preventScroll:true});
    };
    on("vpn-list-sync",()=>this.action("routes_sync_vpn"));
    root.querySelectorAll("[data-tab]").forEach(button=>{
      button.addEventListener("click",()=>{this.activeTab=button.dataset.tab;this.pendingFocusTab=button.dataset.tab;this.render();});
      button.addEventListener("keydown",event=>{
        const ids=[...root.querySelectorAll("[data-tab]")].map(el=>el.dataset.tab),at=ids.indexOf(button.dataset.tab);let next=null;
        if(event.key==="ArrowRight")next=ids[(at+1)%ids.length];else if(event.key==="ArrowLeft")next=ids[(at+ids.length-1)%ids.length];else if(event.key==="Home")next=ids[0];else if(event.key==="End")next=ids[ids.length-1];
        if(next){event.preventDefault();this.activeTab=next;this.pendingFocusTab=next;this.render();}
      });
    });
    for(const key of ["status","refresh","check","apply"])on(key,()=>this.action(key));
    root.querySelectorAll("[data-group-mode]").forEach(button=>button.addEventListener("click",()=>this.action("group_mode",{mode:button.dataset.groupMode})));
    on("operation-dismiss",()=>{clearInterval(this.operationTimer);this.operationTimer=null;this.actionProgress=null;this.render();});
    root.querySelectorAll("[data-node]").forEach(el=>el.addEventListener("change",()=>this.action("select",{id:el.dataset.node})));
    root.querySelectorAll("[data-refresh]").forEach(el=>el.onclick=()=>this.action("refresh",{id:el.dataset.refresh}));
    root.querySelectorAll("[data-edit]").forEach(el=>el.onclick=()=>{this.edit=el.dataset.edit;root.querySelector("#subscription-details").open=true;root.querySelector("#source-name").value=s.sources.find(x=>x.id===this.edit).name;root.querySelector("#source-url").value="";this.render();root.querySelector("#source-url").focus();});
    root.querySelectorAll("[data-delete]").forEach(el=>el.onclick=()=>this.action("source_delete",{id:el.dataset.delete}));
    on("cancel",()=>{this.edit="";root.querySelector("#source-url").value="";this.render();});
    on("save",()=>{const name=root.querySelector("#source-name").value,url=root.querySelector("#source-url").value;if(!url)return;
      const id=this.edit;this.edit="";root.querySelector("#source-url").value="";this.action("source_save",{id,name,url});});
  }
}
if(!customElements.get("netcraze-vpn-panel")) customElements.define("netcraze-vpn-panel",NetcrazeVPNPanel);
