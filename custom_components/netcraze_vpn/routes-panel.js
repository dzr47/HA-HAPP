/* Domain list drafts are held only in memory and authenticated HA Store. */
import {localize, locale} from './localization.js?v=0.1.3';
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
class VPNRoutes extends HTMLElement {
  constructor(){super();this.attachShadow({mode:"open"});this.drafts={};this.loaded={};this.pending={};this.error="";this.key="";}
  set state(s){this.s=s;const key=JSON.stringify([s.busy,s.site_routes]);if(key!==this.key){this.key=key;this.render();}else this.restoreFocus();}
  set language(value){if(this.panelLanguage!==value){this.panelLanguage=value;if(this.s)this.render();}}
  act(action,payload={}){this.dispatchEvent(new CustomEvent("vpn-action",{detail:{action,payload},bubbles:true,composed:true}));}
  capture(){
    for(const k of ["direct","vpn"]){
      const text=this.shadowRoot.querySelector(`#text-${k}`),url=this.shadowRoot.querySelector(`#url-${k}`);
      if(text)this.drafts[k]={text:text.value,url:url?.value||""};
    }
    const a=this.shadowRoot.activeElement;if(a?.id)this.focus={id:a.id,start:a.selectionStart,end:a.selectionEnd};
  }
  restoreFocus(){if(!this.focus)return;const el=this.shadowRoot.getElementById(this.focus.id);if(el&&!el.disabled){el.focus({preventScroll:true});if(el.tagName==='TEXTAREA'&&this.focus.start!==null)el.setSelectionRange(this.focus.start,this.focus.end);this.focus=null;}}
  updateDraftState(){
    const r=this.s.site_routes;
    const unsaved=["direct","vpn"].some(k=>this.shadowRoot.getElementById(`text-${k}`).value!==r.lists[k].text||this.shadowRoot.getElementById(`url-${k}`).value.trim());
    this.shadowRoot.getElementById('routes-validate').disabled=this.s.busy||unsaved;
    this.shadowRoot.getElementById('routes-apply').disabled=this.s.busy||unsaved||!r.can_apply;
    const draft=this.shadowRoot.getElementById('route-draft');draft.textContent=unsaved?'Сначала сохраните изменения в полях списков.':"";localize(draft,this.panelLanguage);
  }
  render(){
    const r=this.s.site_routes;if(!r)return;this.capture();
    const when=v=>v?new Date(v*1000).toLocaleString(locale(this.panelLanguage)):"ещё нет";
    const opened=[...this.shadowRoot.querySelectorAll('details[open]')].map(el=>el.id);
    for(const k of ["direct","vpn"]){
      const text=r.lists[k].text;
      if(this.loaded[k]!==text && (!this.drafts[k]||this.drafts[k].text===this.loaded[k]||this.pending[k]))this.drafts[k]={text,url:this.drafts[k]?.url||""};
      this.loaded[k]=text;if(!this.s.busy)delete this.pending[k];
    }
    const disabled=this.s.busy?"disabled":"";
    this.shadowRoot.innerHTML=`<style>
      :host{display:block;color:var(--primary-text-color);font:16px system-ui}*{box-sizing:border-box}h2{font-size:20px;margin:0 0 10px}h3{font-size:16px;margin:0 0 8px}.card{background:var(--card-background-color);border:1px solid var(--divider-color);border-radius:16px;padding:22px;margin:18px 0}.muted,small{color:var(--secondary-text-color);font-size:13px;line-height:1.5}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin:18px 0}.list{border:1px solid var(--divider-color);border-radius:12px;padding:16px;min-width:0}.bar,.row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}.bar{justify-content:space-between}.badge{font-size:12px;padding:5px 9px;border-radius:12px;background:var(--secondary-background-color)}button,input,textarea,select{font:inherit}button{border:1px solid var(--divider-color);background:var(--secondary-background-color);color:inherit;border-radius:9px;padding:9px 12px;cursor:pointer}button:disabled{opacity:.45;cursor:default}.primary{background:var(--primary-color);color:var(--text-primary-color,#fff)}.vpn-list-sync{background:#2e7d32;border-color:#2e7d32;color:#fff}.sync-meta{font-size:13px;color:var(--secondary-text-color);margin:7px 2px 14px}textarea,input,select{width:100%;border:1px solid var(--divider-color);border-radius:8px;padding:10px;background:var(--primary-background-color);color:inherit;margin:7px 0 12px}textarea{min-height:135px;resize:vertical;font:14px monospace}label{display:block;font-size:14px}input[type=file]{font-size:13px}.warning{color:var(--warning-color,#ffb300);font-size:13px}.error{color:var(--error-color);font-size:13px}summary{cursor:pointer;font-size:13px}details{margin:12px 0}.state{font-size:14px;margin:12px 0}button:focus-visible,select:focus-visible{outline:2px solid var(--primary-color);outline-offset:3px}@media(max-width:650px){.grid{grid-template-columns:1fr}.card{padding:16px}.row button{flex:1}}
      </style><section class="card"><div class="bar"><h2>Маршрутизация сайтов</h2><span class="badge">Списки маршрутов</span></div>
      <p class="sync-meta">VPN-список · Последнее обновление: ${esc(when(r.lists.vpn.updated))}${r.lists.vpn.count?` · ${r.lists.vpn.count} адресов и доменов` : ""}</p>
      <p class="muted">Для устройств с включённым VPN маршруты из списка идут через туннель, остальные — напрямую.</p>
      <label>Режим правил<select id="route-mode" ${disabled}>${Object.entries(r.modes).map(([k,v])=>`<option value="${k}" ${r.mode===k?"selected":""}>${esc(v)}</option>`).join("")}</select></label>
      <p class="state">На роутере: <strong>${esc(r.modes[r.active_mode]||"Правила изменены вне панели")}</strong>${r.dirty?' · Есть неприменённые изменения':""}<br><small>Последнее применение: ${esc(when(r.applied_at))}</small></p>
      <div class="grid">${["direct","vpn"].map(k=>{const l=r.lists[k];return `<div class="list"><div class="bar"><h3>${k==="direct"?"Всегда напрямую":"Через VPN"}</h3><span class="badge">${l.count} · домены ${l.domain_count}, IP/CIDR ${l.ip_count}</span></div><p class="muted">${k==="direct"?"Обычный интернет для перечисленных сайтов.":"Выбранный VPN-сервер для перечисленных адресов и доменов."}</p><details id="edit-${k}"><summary>Изменить список</summary><label>Домены, IP или CIDR, по одному на строку<textarea id="text-${k}" aria-label="${k==="direct"?"Белый список доменов и IP":"VPN-список доменов и IP"}" placeholder="example.com&#10;full:only.example.org&#10;203.0.113.0/24" spellcheck="false" ${disabled}></textarea></label><div class="row"><button data-save="${k}" ${disabled}>Сохранить список</button></div><details id="source-${k}"><summary>Импорт файла или ссылка</summary><label>Файл UTF-8, до 256 КБ<input type="file" id="file-${k}" accept=".txt,.list,text/plain" aria-label="${k==="direct"?"Файл белого списка":"Файл VPN-списка"}" ${disabled}></label><p class="muted">Файл заполнит поле выше. Для сохранения нажмите «Сохранить список».</p><label>HTTPS-ссылка<input id="url-${k}" type="password" autocomplete="new-password" placeholder="Ссылка на текстовый список или Google Документ" ${disabled}></label><button data-source="${k}" ${disabled}>Загрузить и сохранить ссылку</button><p class="muted">Источник: ${l.source_host?esc(l.source_host):"файл или ручной ввод"}. Обновлено: ${esc(when(l.updated))}</p>${l.error?`<p class="error">${esc(l.error)}</p>`:""}</details></details></div>`;}).join("")}</div>
      ${r.overlap_count?`<p class="warning">Пересечения: ${r.overlap_count}. Приоритет — напрямую. ${r.overlaps.map(esc).join(", ")}${r.overlap_count>50?"…":""}</p>`:""}
      <p id="route-draft" class="warning"></p><div class="row"><button id="routes-refresh" ${disabled}>Обновить все источники</button><button id="routes-validate" ${disabled}>Проверить правила</button><button id="routes-apply" class="primary" ${this.s.busy||!r.can_apply?"disabled":""}>Применить правила</button></div>
      <p class="muted">Проверка: ${esc(when(r.validated_at))}. Перед применением требуется проверка актуальных списков и конфигурации роутера. Для отмены выберите «Без правил сайтов», проверьте и примените.</p>
      <details id="route-help"><summary>Формат списков и ограничения</summary><p class="muted">Одна запись на строку; # — комментарий. Поддерживаются домены и URL, full: для точного совпадения, IP-адреса и CIDR (IPv4/IPv6). Префикс ip: можно использовать для явного IP. example.com включает поддомены. Кириллица поддерживается. До 5000 записей в каждом списке. Регулярные выражения и HTML не принимаются. Закрытый Google Документ без доступа серверу не загрузится; можно использовать файл.</p><p class="muted">Xray проверяет сначала домены, затем IP/CIDR согласно правилам. ECH может скрыть имя домена, но IP-правило по-прежнему может совпасть. DNS остаётся по текущей схеме роутера: исключение для сайта само по себе не переводит его DNS напрямую. Проверка VPN выше проверяет выбранный сервер независимо от этих списков. Применение может переподключить текущие соединения.</p></details><p id="route-error" class="error" role="alert">${esc(this.error)}</p></section>`;
    localize(this.shadowRoot,this.panelLanguage);
    for(const k of ["direct","vpn"]){
      const draft=this.drafts[k]||{text:r.lists[k].text,url:""};
      this.shadowRoot.getElementById(`text-${k}`).value=draft.text;
      this.shadowRoot.getElementById(`url-${k}`).value=draft.url;
      this.shadowRoot.getElementById(`file-${k}`).onchange=async e=>{
        const f=e.target.files?.[0];if(!f)return;
        try{if(f.size>262144)throw Error("Максимальный размер — 256 КБ");const bytes=await f.arrayBuffer();const text=new TextDecoder("utf-8",{fatal:true}).decode(bytes);this.drafts[k]={text,url:""};this.shadowRoot.getElementById(`text-${k}`).value=text;this.shadowRoot.getElementById(`url-${k}`).value="";this.error="";}catch(err){this.error=err.message||"Файл должен быть UTF-8";}
        const error=this.shadowRoot.getElementById('route-error');error.textContent=this.error;localize(error,this.panelLanguage);
        this.updateDraftState();
      };
      this.shadowRoot.getElementById(`text-${k}`).oninput=()=>this.updateDraftState();
      this.shadowRoot.getElementById(`url-${k}`).oninput=()=>this.updateDraftState();
    }
    this.shadowRoot.getElementById('route-mode').onchange=e=>this.act('routes_mode',{mode:e.target.value});
    this.shadowRoot.querySelectorAll('[data-save]').forEach(b=>b.onclick=()=>{const k=b.dataset.save,text=this.shadowRoot.getElementById(`text-${k}`).value;this.drafts[k]={text,url:""};this.pending[k]=true;this.act('routes_save',{list:k,text});});
    this.shadowRoot.querySelectorAll('[data-source]').forEach(b=>b.onclick=()=>{const k=b.dataset.source,url=this.shadowRoot.getElementById(`url-${k}`).value;if(!url)return;this.drafts[k]={text:this.shadowRoot.getElementById(`text-${k}`).value,url:""};this.shadowRoot.getElementById(`url-${k}`).value="";this.pending[k]=true;this.act('routes_save',{list:k,url});});
    for(const [id,action] of [['routes-refresh','routes_refresh'],['routes-validate','routes_validate'],['routes-apply','routes_apply']])this.shadowRoot.getElementById(id).onclick=()=>this.act(action);
    for(const id of opened){const el=this.shadowRoot.getElementById(id);if(el)el.open=true;}
    this.updateDraftState();this.restoreFocus();
  }
}
if(!customElements.get('netcraze-vpn-routes'))customElements.define('netcraze-vpn-routes',VPNRoutes);
