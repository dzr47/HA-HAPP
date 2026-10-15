/* Device selection stays inside authenticated HA; no inventory in localStorage. */
import {localize, locale} from './localization.js?v=0.1.0';
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const icons = {phone:"mdi:cellphone",tablet:"mdi:tablet",tv:"mdi:television",computer:"mdi:laptop",other:"mdi:devices"};

class VPNDevices extends HTMLElement {
  constructor() {
    super(); this.attachShadow({mode:"open"}); this.open=false; this.filter="all"; this.query=""; this.s=null;
    this.shadowRoot.addEventListener("keydown", event => {
      if(!this.open) return;
      if(event.key === "Escape") { event.preventDefault(); this.open=false; this.render(); this.shadowRoot.querySelector("#add-devices")?.focus(); }
      if(event.key === "Tab") {
        const elements=[...this.shadowRoot.querySelectorAll('.picker button:not(:disabled), .picker input:not(:disabled)')];
        if(!elements.length)return;
        const first=elements[0],last=elements[elements.length-1],active=this.shadowRoot.activeElement;
        if(event.shiftKey && active===first){ event.preventDefault();last.focus(); }
        else if(!event.shiftKey && active===last){event.preventDefault();first.focus();}
      }
    });
  }
  rememberFocus() {
    const active=this.shadowRoot.activeElement;
    if(active?.id) this.focus={id:active.id,start:active.selectionStart,end:active.selectionEnd};
  }
  set state(value) { this.s=value; this.render(); }
  set language(value) { if(this.lang!==value){this.lang=value;this.render();} }
  act(action,payload={}) { this.dispatchEvent(new CustomEvent("vpn-action",{detail:{action,payload},bubbles:true,composed:true})); }
  render() {
    if(!this.s)return;
    if(!this.focus)this.rememberFocus();
    const root=this.shadowRoot,s=this.s,c=s.clients || {members:[],catalogue:[],total:0,vpn_count:0};
    const scroll=this.resultScroll ?? root.querySelector(".results")?.scrollTop ?? 0; this.resultScroll=null;
    const disabled=s.busy?"disabled":"";
    const matching=h => this.filter==="all" || (this.filter==="quick" ? ["phone","tablet","tv","computer"].includes(h.category) : h.category===this.filter);
    const query=this.query.trim().toLocaleLowerCase("ru-RU");
    const rows=c.catalogue.filter(h=>matching(h)&&[h.name,h.hostname,h.ip,h.mac].join(" ").toLocaleLowerCase("ru-RU").includes(query));
    const identity=h=>`<div class="device-icon"><ha-icon icon="${icons[h.category]||icons.other}"></ha-icon></div><div class="identity"><strong data-no-translate>${esc(h.name)}</strong><div class="details"><span class="dot ${h.online?"online":""}"></span>${h.online?"В сети":"Не в сети"}${h.ip?" · "+esc(h.ip):""}<span class="mac"> · ${esc(h.mac)}</span></div></div>`;
    root.innerHTML=`<style>
      :host{display:block;color:var(--primary-text-color);font:16px system-ui}*{box-sizing:border-box}button,input{font:inherit}h2,h3,p{margin-top:0}h2{font-size:20px;margin-bottom:6px}h3{font-size:22px;margin-bottom:5px}
      .card{background:var(--card-background-color);border:1px solid var(--divider-color);border-radius:16px;padding:22px;margin:18px 0}.heading,.actions{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.actions{justify-content:flex-start}.muted,.details{color:var(--secondary-text-color)}.muted{font-size:13px;line-height:1.5;margin:10px 0 0}.summary{font-size:14px;color:var(--secondary-text-color);margin:0}
      button{border:1px solid var(--divider-color);background:var(--secondary-background-color);color:inherit;border-radius:9px;padding:10px 13px;cursor:pointer}button:disabled{opacity:.45;cursor:default}button.primary{background:var(--primary-color);color:var(--text-primary-color,#fff)}.sync{margin:14px 0;font-size:13px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}.sync button{font-size:13px;padding:7px 10px}
      .device{display:flex;align-items:center;gap:13px;padding:15px 0;border-top:1px solid var(--divider-color)}.device-icon{display:flex;align-items:center;justify-content:center;background:var(--secondary-background-color);width:42px;height:42px;flex:0 0 42px;border-radius:12px;color:var(--primary-color)}.identity{flex:1;min-width:0}.identity strong{font-size:15px;overflow-wrap:anywhere}.details{font-size:12px;margin-top:5px;line-height:1.5;overflow-wrap:anywhere}.dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:#858585;margin-right:5px}.dot.online{background:#43a047}.route{font-size:12px;color:var(--secondary-text-color);margin-top:5px}.route.active{color:#66bb6a}.row-actions{display:flex;align-items:center;gap:12px}.remove{border:0;background:transparent;padding:6px;color:var(--secondary-text-color)}
      input.toggle{appearance:none;width:42px;height:24px;border-radius:20px;background:#757575;border:0;cursor:pointer;position:relative;flex:none;margin:0}input.toggle:before{content:"";position:absolute;width:18px;height:18px;left:3px;top:3px;background:white;border-radius:50%;transition:transform .15s}input.toggle:checked{background:#43a047}input.toggle:checked:before{transform:translateX(18px)}input.toggle:disabled{opacity:.4;cursor:default}input.toggle:focus-visible,button:focus-visible{outline:2px solid var(--primary-color);outline-offset:3px}
      .empty{padding:24px;text-align:center;border:1px dashed var(--divider-color);border-radius:12px;color:var(--secondary-text-color)}.shade{position:fixed;inset:0;background:#0009;z-index:100;display:flex;align-items:center;justify-content:center;padding:24px}.picker{width:760px;max-width:100%;max-height:88vh;display:flex;flex-direction:column;background:var(--card-background-color);border:1px solid var(--divider-color);border-radius:18px;box-shadow:0 20px 60px #0007;overflow:hidden}.picker-head{padding:22px 22px 14px}.close{font-size:22px;line-height:1;background:transparent;border:0}.filters{display:flex;gap:7px;flex-wrap:wrap;margin-top:14px}.filters button{border-radius:20px;padding:7px 10px;font-size:13px}.filters .chosen{color:var(--primary-color);border-color:var(--primary-color);background:var(--primary-background-color)}input.search{width:100%;border:1px solid var(--divider-color);border-radius:10px;padding:12px;margin-top:16px;background:var(--primary-background-color);color:inherit}.results{overflow-y:auto;overscroll-behavior:contain;padding:0 22px;min-height:100px}.results .device:first-child{border-top:0}.picker-foot{padding:14px 22px;border-top:1px solid var(--divider-color);font-size:12px;color:var(--secondary-text-color);line-height:1.5}.count{font-size:12px;color:var(--secondary-text-color);margin:12px 0 0}.reason{font-size:12px;color:var(--secondary-text-color);margin-top:4px}.add{white-space:nowrap;padding:8px 10px;font-size:13px}
      @media(max-width:600px){.card{padding:16px}.heading .actions{width:100%}.shade{padding:10px}.picker{max-height:94vh;border-radius:14px}.picker-head{padding:16px}.results{padding:0 16px}.picker-foot{padding:12px 16px}.device{gap:9px}.row-actions{gap:7px}.mac{display:block}.remove{font-size:12px}.device-icon{width:34px;height:38px;flex-basis:34px}.identity strong{font-size:14px}}
      </style><section class="card"><div class="heading"><div><h2>Устройства VPN</h2><p class="summary">Через VPN: <strong>${c.vpn_count}</strong> · В списке: <strong>${c.members.length}</strong></p></div><div class="actions"><button id="add-devices" class="primary" ${disabled}>＋ Добавить устройства</button></div></div>
      <div class="sync"><button id="sync-devices" ${disabled}>↻ Обновить из NDMS</button><span class="muted">${c.synced_at?`Синхронизация ${new Date(c.synced_at*1000).toLocaleTimeString(locale(this.lang))} · ${c.sync_seconds} с · зарегистрировано ${c.total} · в сети ${c.online_total ?? 0}`:"Список ещё не получен"}</span></div>
      ${c.members.map(h=>`<div class="device">${identity(h)}<div class="row-actions"><input id="device-${h.mac}" class="toggle" role="switch" type="checkbox" data-toggle="${h.mac}" data-no-translate aria-label="${this.lang==="en"?"VPN for":"VPN для"} ${esc(h.name)}" ${h.vpn?"checked":""} ${s.busy||!h.available||(!h.vpn&&!h.selectable)?"disabled":""}><button class="remove" data-remove="${h.mac}" data-no-translate aria-label="${this.lang==="en"?"Remove":"Убрать"} ${esc(h.name)} ${this.lang==="en"?"from list":"из списка"}" ${disabled}>Убрать</button></div></div><div class="route ${h.vpn?"active":""}">${h.vpn?"● Через VPN Happ":h.policy?"Другая политика: <span data-no-translate>"+esc(h.policy)+"</span>":"Обычный интернет"}${!h.vpn&&h.reason?" · "+esc(h.reason):""}</div>`).join("")||'<p class="empty">Добавьте смартфон, планшет, телевизор или другое устройство кнопкой «+».</p>'}
      <p class="muted">Переключатель меняет подключение одного устройства. Общие кнопки выше включают или выключают VPN для всего списка. При выключении возвращается прежняя политика; при удалении устройство также отключается от этого VPN.</p></section>
      ${this.open?`<div class="shade" id="shade"><div class="picker" role="dialog" aria-modal="true" aria-labelledby="picker-title"><div class="picker-head"><div class="heading"><div><h3 id="picker-title">Добавить устройства</h3><p class="summary">Все зарегистрированные устройства NDMS</p></div><button class="close" id="close-picker" aria-label="Закрыть выбор устройств">×</button></div><input id="device-search" class="search" type="search" autocomplete="off" placeholder="Имя, iPhone, iPad, Samsung, IP или MAC" aria-label="Поиск устройств"><div class="filters">${[["quick","Быстрый выбор"],["phone","Смартфоны"],["tablet","Планшеты"],["tv","Телевизоры"],["computer","Компьютеры"],["all","Все устройства"]].map(([id,label])=>`<button data-filter="${id}" class="${id===this.filter?"chosen":""}" aria-pressed="${id===this.filter}" ${disabled}>${label}</button>`).join("")}</div><p class="count">Найдено: ${rows.length}</p></div><div class="results">${rows.map(h=>`<div class="device">${identity(h)}<button class="add" data-add="${h.mac}" ${s.busy||h.selected||!h.available||h.reason==="Инфраструктура дома"?"disabled":""}>${h.selected?"✓ В списке":"＋ Добавить"}</button></div>${h.reason?`<div class="reason">${esc(h.reason)}</div>`:""}`).join("")||'<p class="empty">Устройств не найдено. Измените поиск или выберите «Все устройства».</p>'}</div><div class="picker-foot">Добавление сохраняет устройство в списке. Чтобы направить его трафик через VPN, включите переключатель в списке.<br>Показаны все зарегистрированные устройства, включая отключённые. Категории определяются по имени и hostname NDMS. При похожих именах сверяйте IP и MAC; автоматического переименования нет.</div></div></div>`:""}`;
    localize(root,this.lang);
    const on=(id,fn)=>root.querySelector("#"+id)?.addEventListener("click",fn);
    on("add-devices",()=>{this.open=true;this.focus={id:"device-search"};this.render();});
    on("close-picker",()=>{this.open=false;this.focus={id:"add-devices"};this.render();});
    on("shade",event=>{if(event.target.id==="shade"){this.open=false;this.focus={id:"add-devices"};this.render();}});
    on("sync-devices",()=>this.act("device_sync"));
    root.querySelectorAll("[data-add]").forEach(el=>el.onclick=()=>this.act("device_add",{mac:el.dataset.add}));
    root.querySelectorAll("[data-remove]").forEach(el=>el.onclick=()=>this.act("device_remove",{mac:el.dataset.remove}));
    root.querySelectorAll("[data-toggle]").forEach(el=>el.onchange=()=>this.act("device_set",{mac:el.dataset.toggle,enabled:el.checked}));
    root.querySelectorAll("[data-filter]").forEach(el=>el.onclick=()=>{this.filter=el.dataset.filter;this.resultScroll=0;this.render();});
    const search=root.querySelector("#device-search");if(search){search.value=this.query;search.oninput=()=>{this.query=search.value;this.resultScroll=0;this.render();};}
    const results=root.querySelector(".results");if(results)results.scrollTop=scroll;
    if(this.focus){const el=root.getElementById(this.focus.id);if(el&&!el.disabled){el.focus({preventScroll:true});if(el.type==="search"&&this.focus.start!==null&&this.focus.start!==undefined)el.setSelectionRange(this.focus.start,this.focus.end);}}
    this.focus=null;
  }
}
if(!customElements.get("netcraze-vpn-devices")) customElements.define("netcraze-vpn-devices",VPNDevices);
