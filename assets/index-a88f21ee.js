(function(){const e=document.createElement("link").relList;if(e&&e.supports&&e.supports("modulepreload"))return;for(const r of document.querySelectorAll('link[rel="modulepreload"]'))s(r);new MutationObserver(r=>{for(const o of r)if(o.type==="childList")for(const n of o.addedNodes)n.tagName==="LINK"&&n.rel==="modulepreload"&&s(n)}).observe(document,{childList:!0,subtree:!0});function a(r){const o={};return r.integrity&&(o.integrity=r.integrity),r.referrerpolicy&&(o.referrerPolicy=r.referrerpolicy),r.crossorigin==="use-credentials"?o.credentials="include":r.crossorigin==="anonymous"?o.credentials="omit":o.credentials="same-origin",o}function s(r){if(r.ep)return;r.ep=!0;const o=a(r);fetch(r.href,o)}})();function F(){}function ze(t){return t()}function ke(){return Object.create(null)}function ae(t){t.forEach(ze)}function Ne(t){return typeof t=="function"}function E(t,e){return t!=t?e==e:t!==e||t&&typeof t=="object"||typeof t=="function"}let oe;function We(t,e){return oe||(oe=document.createElement("a")),oe.href=e,t===oe.href}function He(t){return Object.keys(t).length===0}function Pe(t,...e){if(t==null)return F;const a=t.subscribe(...e);return a.unsubscribe?()=>a.unsubscribe():a}function me(t,e,a){t.$$.on_destroy.push(Pe(e,a))}function b(t,e){t.appendChild(e)}function A(t,e,a){t.insertBefore(e,a||null)}function D(t){t.parentNode&&t.parentNode.removeChild(t)}function Ye(t,e){for(let a=0;a<t.length;a+=1)t[a]&&t[a].d(e)}function k(t){return document.createElement(t)}function Ie(t){return document.createElementNS("http://www.w3.org/2000/svg",t)}function fe(t){return document.createTextNode(t)}function S(){return fe(" ")}function Be(){return fe("")}function Z(t,e,a,s){return t.addEventListener(e,a,s),()=>t.removeEventListener(e,a,s)}function Ue(t){return function(e){return e.preventDefault(),t.call(this,e)}}function w(t,e,a){a==null?t.removeAttribute(e):t.getAttribute(e)!==a&&t.setAttribute(e,a)}function Qe(t){return Array.from(t.childNodes)}function Ge(t,e){e=""+e,t.wholeText!==e&&(t.data=e)}function ve(t,e){t.value=e??""}class Ce{constructor(e=!1){this.is_svg=!1,this.is_svg=e,this.e=this.n=null}c(e){this.h(e)}m(e,a,s=null){this.e||(this.is_svg?this.e=Ie(a.nodeName):this.e=k(a.nodeName),this.t=a,this.c(e)),this.i(s)}h(e){this.e.innerHTML=e,this.n=Array.from(this.e.childNodes)}i(e){for(let a=0;a<this.n.length;a+=1)A(this.t,this.n[a],e)}p(e){this.d(),this.h(e),this.i(this.a)}d(){this.n.forEach(D)}}let le;function re(t){le=t}function $e(){if(!le)throw new Error("Function called outside component initialization");return le}function Ke(t){$e().$$.on_mount.push(t)}function Ve(t,e){return $e().$$.context.set(t,e),e}function K(t){return $e().$$.context.get(t)}const se=[],ue=[],ce=[],Se=[],Ze=Promise.resolve();let ye=!1;function Je(){ye||(ye=!0,Ze.then(Fe))}function be(t){ce.push(t)}const ge=new Set;let ie=0;function Fe(){const t=le;do{for(;ie<se.length;){const e=se[ie];ie++,re(e),Xe(e.$$)}for(re(null),se.length=0,ie=0;ue.length;)ue.pop()();for(let e=0;e<ce.length;e+=1){const a=ce[e];ge.has(a)||(ge.add(a),a())}ce.length=0}while(se.length);for(;Se.length;)Se.pop()();ye=!1,ge.clear(),re(t)}function Xe(t){if(t.fragment!==null){t.update(),ae(t.before_update);const e=t.dirty;t.dirty=[-1],t.fragment&&t.fragment.p(t.ctx,e),t.after_update.forEach(be)}}const de=new Set;let J;function pe(){J={r:0,c:[],p:J}}function he(){J.r||ae(J.c),J=J.p}function M(t,e){t&&t.i&&(de.delete(t),t.i(e))}function x(t,e,a,s){if(t&&t.o){if(de.has(t))return;de.add(t),J.c.push(()=>{de.delete(t),s&&(a&&t.d(1),s())}),t.o(e)}else s&&s()}function et(t,e){x(t,1,1,()=>{e.delete(t.key)})}function tt(t,e,a,s,r,o,n,d,u,c,l,i){let h=t.length,p=o.length,_=h;const f={};for(;_--;)f[t[_].key]=_;const g=[],y=new Map,O=new Map;for(_=p;_--;){const $=i(r,o,_),R=a($);let C=n.get(R);C?s&&C.p($,e):(C=c(R,$),C.c()),y.set(R,g[_]=C),R in f&&O.set(R,Math.abs(_-f[R]))}const m=new Set,v=new Set;function I($){M($,1),$.m(d,l),n.set($.key,$),l=$.first,p--}for(;h&&p;){const $=g[p-1],R=t[h-1],C=$.key,N=R.key;$===R?(l=$.first,h--,p--):y.has(N)?!n.has(C)||m.has(C)?I($):v.has(N)?h--:O.get(C)>O.get(N)?(v.add(C),I($)):(m.add(N),h--):(u(R,n),h--)}for(;h--;){const $=t[h];y.has($.key)||u($,n)}for(;p;)I(g[p-1]);return g}function B(t){t&&t.c()}function j(t,e,a,s){const{fragment:r,after_update:o}=t.$$;r&&r.m(e,a),s||be(()=>{const n=t.$$.on_mount.map(ze).filter(Ne);t.$$.on_destroy?t.$$.on_destroy.push(...n):ae(n),t.$$.on_mount=[]}),o.forEach(be)}function W(t,e){const a=t.$$;a.fragment!==null&&(ae(a.on_destroy),a.fragment&&a.fragment.d(e),a.on_destroy=a.fragment=null,a.ctx=[])}function at(t,e){t.$$.dirty[0]===-1&&(se.push(t),Je(),t.$$.dirty.fill(0)),t.$$.dirty[e/31|0]|=1<<e%31}function H(t,e,a,s,r,o,n,d=[-1]){const u=le;re(t);const c=t.$$={fragment:null,ctx:[],props:o,update:F,not_equal:r,bound:ke(),on_mount:[],on_destroy:[],on_disconnect:[],before_update:[],after_update:[],context:new Map(e.context||(u?u.$$.context:[])),callbacks:ke(),dirty:d,skip_bound:!1,root:e.target||u.$$.root};n&&n(c.root);let l=!1;if(c.ctx=a?a(t,e.props||{},(i,h,...p)=>{const _=p.length?p[0]:h;return c.ctx&&r(c.ctx[i],c.ctx[i]=_)&&(!c.skip_bound&&c.bound[i]&&c.bound[i](_),l&&at(t,i)),h}):[],c.update(),l=!0,ae(c.before_update),c.fragment=s?s(c.ctx):!1,e.target){if(e.hydrate){const i=Qe(e.target);c.fragment&&c.fragment.l(i),i.forEach(D)}else c.fragment&&c.fragment.c();e.intro&&M(t.$$.fragment),j(t,e.target,e.anchor,e.customElement),Fe()}re(u)}class P{$destroy(){W(this,1),this.$destroy=F}$on(e,a){if(!Ne(a))return F;const s=this.$$.callbacks[e]||(this.$$.callbacks[e]=[]);return s.push(a),()=>{const r=s.indexOf(a);r!==-1&&s.splice(r,1)}}$set(e){this.$$set&&!He(e)&&(this.$$.skip_bound=!0,this.$$set(e),this.$$.skip_bound=!1)}}const te=[];function _e(t,e=F){let a;const s=new Set;function r(d){if(E(t,d)&&(t=d,a)){const u=!te.length;for(const c of s)c[1](),te.push(c,t);if(u){for(let c=0;c<te.length;c+=2)te[c][0](te[c+1]);te.length=0}}}function o(d){r(d(t))}function n(d,u=F){const c=[d,u];return s.add(c),s.size===1&&(a=e(r)||F),d(t),()=>{s.delete(c),s.size===0&&(a(),a=null)}}return{set:r,update:o,subscribe:n}}function st(){const{subscribe:t,update:e}=_e([]);return{subscribe:t,add:a=>e(s=>[...s,a])}}function rt(){const{subscribe:t,set:e,update:a}=_e({});return{subscribe:t,show:s=>(we.set(!0),e(s))}}const G=st(),X=rt(),we=_e(!1),Ee=_e(null);function Le(t,e,a){const s=t.slice();return s[10]=e[a],s}function Oe(t){let e,a=t[10].name+"",s,r,o;function n(){return t[7](t[10])}return{c(){e=k("li"),s=fe(a),w(e,"class","svelte-1dvnsjx")},m(d,u){A(d,e,u),b(e,s),r||(o=Z(e,"click",n),r=!0)},p(d,u){t=d,u&2&&a!==(a=t[10].name+"")&&Ge(s,a)},d(d){d&&D(e),r=!1,o()}}}function lt(t){let e,a,s,r,o,n,d,u,c,l,i=t[1],h=[];for(let p=0;p<i.length;p+=1)h[p]=Oe(Le(t,i,p));return{c(){e=k("form"),a=k("input"),s=S(),r=k("ul");for(let p=0;p<h.length;p+=1)h[p].c();o=S(),n=k("input"),d=S(),u=k("a"),u.textContent="Reset Map",w(a,"id","address"),w(a,"placeholder","Enter a NYC Address"),w(a,"type","text"),w(a,"name","address"),w(a,"autocomplete","off"),w(a,"class","svelte-1dvnsjx"),w(r,"class","svelte-1dvnsjx"),w(n,"type","submit"),n.value="Search",w(n,"class","svelte-1dvnsjx"),w(u,"href","#"),w(u,"class","reset_map svelte-1dvnsjx"),w(e,"class","svelte-1dvnsjx")},m(p,_){A(p,e,_),b(e,a),ve(a,t[0]),b(e,s),b(e,r);for(let f=0;f<h.length;f+=1)h[f].m(r,null);b(e,o),b(e,n),b(e,d),b(e,u),c||(l=[Z(a,"input",t[6]),Z(a,"keyup",t[4]),Z(u,"click",t[5]),Z(e,"submit",Ue(t[2]))],c=!0)},p(p,[_]){if(_&1&&a.value!==p[0]&&ve(a,p[0]),_&10){i=p[1];let f;for(f=0;f<i.length;f+=1){const g=Le(p,i,f);h[f]?h[f].p(g,_):(h[f]=Oe(g),h[f].c(),h[f].m(r,null))}for(;f<h.length;f+=1)h[f].d(1);h.length=i.length}},i:F,o:F,d(p){p&&D(e),Ye(h,p),c=!1,ae(l)}}}function nt(t,e,a){let s;me(t,Ee,p=>a(9,s=p));let r="",o=[],n;function d(){a(1,o=[]),fetch(`https://geosearch.planninglabs.nyc/v2/search?text=${r}`).then(p=>p.json()).then(p=>{if(p.features.length){const _=p.features[0].geometry.coordinates.reverse();s.setView(_),n&&n.remove(),n=L.marker(_).addTo(s).on("click",()=>n.remove()).setOpacity(.8)}})}function u(p){const{name:_,coords:f}=p;a(0,r=_),a(1,o=[]),s.setView(f),n&&n.remove(),n=L.marker(f).addTo(s).on("click",()=>n.remove()).setOpacity(.8)}function c(){r.length>1?fetch(`https://geosearch.planninglabs.nyc/v2/search?text=${r}`).then(p=>p.json()).then(p=>a(1,o=p.features.map(_=>({name:_.properties.label.replace(", New York, NY, USA",""),coords:_.geometry.coordinates.reverse()})).slice(0,5))):a(1,o=[])}function l(){n&&n.remove(),s.setView([40.73,-74],17)}function i(){r=this.value,a(0,r)}return[r,o,d,u,c,l,i,p=>u(p)]}class ot extends P{constructor(e){super(),H(this,e,nt,lt,E,{})}}function it(t){let e;return{c(){e=k("div"),e.innerHTML=`<div class="spinner svelte-zrirrj"></div> 
  <p>loading layers..</p>`,w(e,"class","loading-box svelte-zrirrj")},m(a,s){A(a,e,s)},p:F,i:F,o:F,d(a){a&&D(e)}}}class ct extends P{constructor(e){super(),H(this,e,null,it,E,{})}}function Re(t,e,a){const s=t.slice();return s[8]=e[a].image,s[9]=e[a].text,s}function dt(t){let e;return{c(){e=k("em"),w(e,"class","svelte-1jqby15")},m(a,s){A(a,e,s),e.innerHTML=t[2]},p:F,d(a){a&&D(e)}}}function ut(t){let e,a=t[3],s=[];for(let r=0;r<a.length;r+=1)s[r]=Me(Re(t,a,r));return{c(){e=k("div");for(let r=0;r<s.length;r+=1)s[r].c();w(e,"class","legend svelte-1jqby15")},m(r,o){A(r,e,o);for(let n=0;n<s.length;n+=1)s[n].m(e,null)},p(r,o){if(o&8){a=r[3];let n;for(n=0;n<a.length;n+=1){const d=Re(r,a,n);s[n]?s[n].p(d,o):(s[n]=Me(d),s[n].c(),s[n].m(e,null))}for(;n<s.length;n+=1)s[n].d(1);s.length=a.length}},d(r){r&&D(e),Ye(s,r)}}}function Me(t){let e,a,s,r,o=t[9]+"",n;return{c(){e=k("img"),s=S(),r=k("p"),n=fe(o),We(e.src,a=t[8])||w(e,"src",a),w(e,"alt","icon"),w(e,"class","icon svelte-1jqby15")},m(d,u){A(d,e,u),A(d,s,u),A(d,r,u),b(r,n)},p:F,d(d){d&&D(e),d&&D(s),d&&D(r)}}}function pt(t){let e;return{c(){e=k("div"),w(e,"class","legend svelte-1jqby15")},m(a,s){A(a,e,s),e.innerHTML=t[4]},p:F,d(a){a&&D(e)}}}function ht(t){let e,a,s,r,o,n,d,u,c,l,i,h,p,_=t[2]&&dt(t),f=t[3].length&&ut(t),g=t[4]&&pt(t);return{c(){e=k("div"),a=k("div"),s=k("label"),r=k("input"),o=S(),n=k("span"),d=S(),u=k("span"),u.textContent=`${t[1]}`,c=S(),_&&_.c(),l=S(),f&&f.c(),i=S(),g&&g.c(),w(r,"type","checkbox"),w(r,"class","svelte-1jqby15"),w(n,"class","slider svelte-1jqby15"),w(s,"class","switch svelte-1jqby15"),w(u,"class","name svelte-1jqby15"),w(a,"class","input svelte-1jqby15"),w(e,"class","switch-box")},m(y,O){A(y,e,O),b(e,a),b(a,s),b(s,r),r.checked=t[0],b(s,o),b(s,n),b(a,d),b(a,u),b(e,c),_&&_.m(e,null),b(e,l),f&&f.m(e,null),b(e,i),g&&g.m(e,null),h||(p=Z(r,"change",t[6]),h=!0)},p(y,[O]){O&1&&(r.checked=y[0]),y[2]&&_.p(y,O),y[3].length&&f.p(y,O),y[4]&&g.p(y,O)},i:F,o:F,d(y){y&&D(e),_&&_.d(),f&&f.d(),g&&g.d(),h=!1,p()}}}function mt(t,e,a){let{layer:s}=e,{label:r,checked:o,notes:n,ref:d}=s,u="legend"in s?s.legend:[],c="legend_html"in s?s.legend_html:null;function l(){o=this.checked,a(0,o)}return t.$$set=i=>{"layer"in i&&a(5,s=i.layer)},t.$$.update=()=>{t.$$.dirty&1&&(o?d.show():d.hide())},[o,r,n,u,c,s,l]}class ft extends P{constructor(e){super(),H(this,e,mt,ht,E,{layer:5})}}function De(t,e,a){const s=t.slice();return s[2]=e[a],s}function Ae(t){let e,a;return e=new ct({}),{c(){B(e.$$.fragment)},m(s,r){j(e,s,r),a=!0},i(s){a||(M(e.$$.fragment,s),a=!0)},o(s){x(e.$$.fragment,s),a=!1},d(s){W(e,s)}}}function xe(t,e){let a,s,r;return s=new ft({props:{layer:e[2]}}),{key:t,first:null,c(){a=Be(),B(s.$$.fragment),this.first=a},m(o,n){A(o,a,n),j(s,o,n),r=!0},p(o,n){e=o;const d={};n&1&&(d.layer=e[2]),s.$set(d)},i(o){r||(M(s.$$.fragment,o),r=!0)},o(o){x(s.$$.fragment,o),r=!1},d(o){o&&D(a),W(s,o)}}}function _t(t){let e,a,s,r,o,n,d,u,c,l,i,h,p,_,f=[],g=new Map,y,O,m,v,I,$,R,C,N,q,Q,z=t[0].length===0&&Ae(),V=t[0];const ne=T=>T[2].order;for(let T=0;T<V.length;T+=1){let Y=De(t,V,T),ee=ne(Y);g.set(ee,f[T]=xe(ee,Y))}return $=new ot({}),{c(){e=k("div"),a=k("h2"),a.textContent="SLA Mapper (SLAM)",s=S(),r=k("div"),r.innerHTML=`<h5 class="lighter svelte-mtb3zh">Tool that aggregates data that community boards often have to gather in
            order to review liquor license applications and sidewalk café
            applications. Displaying this information in a unified view saves
            community boards considerable time and resources.</h5>`,o=S(),n=k("div"),d=S(),u=k("h4"),u.textContent="Instructions",c=S(),l=k("h5"),l.textContent=`Click on a map feature to learn more about an establishment's liquor
        license, sidewalk café license, restaurant health grades, or 311 complaints.`,i=S(),h=k("div"),p=S(),z&&z.c(),_=S();for(let T=0;T<f.length;T+=1)f[T].c();y=S(),O=k("div"),m=S(),v=k("h4"),v.textContent="Search",I=S(),B($.$$.fragment),R=S(),C=k("div"),N=S(),q=k("footer"),q.innerHTML=`<figure><img class="logo svelte-mtb3zh" alt="BetaNYC Logo" src="images/BetaNYC_short_white_on_blue.png"/> 
            <figcaption class="logo_caption svelte-mtb3zh">A BetaNYC Tool</figcaption></figure> 
        <div class="footer-links svelte-mtb3zh"><a href="https://github.com/BetaNYC/SLAM/blob/master/LICENSE">GNU General Public License</a> 
            <span>|</span> 
            <a href="https://github.com/BetaNYC/SLAM/issues">File a GitHub issue</a></div>`,w(a,"class","svelte-mtb3zh"),w(r,"class","about svelte-mtb3zh"),w(n,"class","separator svelte-mtb3zh"),w(u,"class","svelte-mtb3zh"),w(l,"class","lighter svelte-mtb3zh"),w(h,"class","separator svelte-mtb3zh"),w(O,"class","separator svelte-mtb3zh"),w(v,"class","svelte-mtb3zh"),w(C,"class","separator svelte-mtb3zh"),w(e,"class","toolbox svelte-mtb3zh")},m(T,Y){A(T,e,Y),b(e,a),b(e,s),b(e,r),b(e,o),b(e,n),b(e,d),b(e,u),b(e,c),b(e,l),b(e,i),b(e,h),b(e,p),z&&z.m(e,null),b(e,_);for(let ee=0;ee<f.length;ee+=1)f[ee].m(e,null);b(e,y),b(e,O),b(e,m),b(e,v),b(e,I),j($,e,null),b(e,R),b(e,C),b(e,N),b(e,q),Q=!0},p(T,[Y]){T[0].length===0?z?Y&1&&M(z,1):(z=Ae(),z.c(),M(z,1),z.m(e,_)):z&&(pe(),x(z,1,1,()=>{z=null}),he()),Y&1&&(V=T[0],pe(),f=tt(f,Y,ne,1,T,V,g,e,et,xe,y,De),he())},i(T){if(!Q){M(z);for(let Y=0;Y<V.length;Y+=1)M(f[Y]);M($.$$.fragment,T),Q=!0}},o(T){x(z);for(let Y=0;Y<f.length;Y+=1)x(f[Y]);x($.$$.fragment,T),Q=!1},d(T){T&&D(e),z&&z.d();for(let Y=0;Y<f.length;Y+=1)f[Y].d();W($)}}}function gt(t,e,a){let s,r;return me(t,G,o=>a(1,r=o)),t.$$.update=()=>{t.$$.dirty&2&&a(0,s=r.sort((o,n)=>o.order-n.order))},[s,r]}class yt extends P{constructor(e){super(),H(this,e,gt,_t,E,{})}}const U="default_public";function bt(t){const{getMap:e,getCartoClient:a,getPopup:s}=K(U),r=e(),o=a(),n=s(),d=new Date,u=d.getUTCDate(),c=d.getUTCMonth(),l=d.getUTCFullYear(),i=Date.UTC(l,c,u).valueOf()/1e3,h=`${c+1}/${u}/${l}`,p=new carto.source.SQL(`
		WITH
			g AS (
				SELECT cartodb_id, ST_Transform(the_geom,3857) AS the_geom_webmercator
				FROM activelicensesv2 WHERE the_geom IS NOT NULL AND countyname IN ('NEW YORK','BRONX','KINGS','QUEENS','RICHMOND') AND licensetyp in ('OP','SW','SB','SL','VL','RL','HL','CL','CT','EL','TL','CR','RW','HW','CW','TW','WC','EB','MR')
			),
			m AS (
				SELECT array_agg(cartodb_id) AS id_list, the_geom_webmercator, ST_Y(the_geom_webmercator) AS y
				FROM g
				GROUP BY the_geom_webmercator
				ORDER BY y DESC
			),
			f AS (
				SELECT generate_series(1, array_length(id_list,1)) AS p, unnest(id_list) AS cartodb_id, the_geom_webmercator
				FROM m
			)
      SELECT ST_Translate(f.the_geom_webmercator,0,f.p*5) AS the_geom_webmercator, q.cartodb_id, premisename, premisedba, 
        licensetyp, 
        TO_CHAR(lic_original_date, 'MM/DD/YYYY') AS license_original_date, 
        TO_CHAR(lic_effective_date, 'MM/DD/YYYY') AS license_effective_date, 
        TO_CHAR(lic_expiration_date, 'MM/DD/YYYY') AS license_expiration_date, 
        date_part('epoch', lic_expiration_date) AS expiration_epoch , 
        serialno, certnum, premiseaddress1, premisezip,
        method_of_operation, days_hours_of_operation
				FROM f, activelicensesv2 q
				WHERE f.cartodb_id = q.cartodb_id
        `),_=new carto.style.CartoCSS(`
        #layer {
            marker-width: 16;
            marker-fill-opacity: 0.9;
            marker-file: url('https://s3.amazonaws.com/com.cartodb.users-assets.production/maki-icons/bar-18.svg');
            marker-allow-overlap: true;
            marker-line-width: 1;
            marker-line-color: #ffffff;
            marker-line-opacity: 1;
        }
        #layer {
          [expiration_epoch <= ${i}] {
            marker-fill: #e10012;
          }
          [expiration_epoch > ${i}]{
            marker-fill: #e34dee;
          }
        }
        #layer [zoom > 16] {
            marker-width: 16;
        }
        #layer [zoom <=16] {
            marker-width: 12;
        }
        #layer [zoom <=15] {
            marker-width: 10;
        }
        #layer [zoom <=14] {
            marker-width: 7;
        }
        #layer [zoom <=12] {
            marker-width: 2;
        }
    `),f=new carto.layer.Layer(p,_,{featureClickColumns:["premisename","premisedba","serialno","licensetyp","license_effective_date","license_expiration_date","license_original_date","certnum","premiseaddress1","premisezip","method_of_operation","days_hours_of_operation"]});return o.addLayer(f).then(()=>{G.add({order:3,ref:f,label:"State Liquor Authority Licenses",legend:[{image:"https://s3.amazonaws.com/com.cartodb.users-assets.production/production/betanyc/assets/20180629205705bar-15.svg",text:`Active on ${h}`},{image:"https://s3.amazonaws.com/com.cartodb.users-assets.production/production/betanyc/assets/20180629205836bar-15.svg",text:"Expired"}],checked:!1})}).catch(g=>console.log(g.message)),f.on("featureOver",g=>{let y="";y+='<div class="widget">',y+=`<p class = "bold">${g.data.premiseaddress1}</p><p>${g.data.premisedba}</p><p>${g.data.premisename}</p>`,n.setContent(y),n.setLatLng(g.latLng),n.isOpen()||n.openOn(r)}),f.on("featureClicked",g=>{let y="",O="";g.data.doing_business_as_premisedba!==""?y+=`<h3 class = "bold">${g.data.premisedba}</h3><h4 class = "bold">${g.data.premisename}</h4>`:y+=`<h3 class = "bold">${g.data.premisename}</h3>`,y+=`<h4>${g.data.premiseaddress1}</h4><div class="separator"></div>
				<h5 class = "lighter">License Type: ${g.data.licensetyp}</h5>
				<h5 class = "lighter">Serial number: ${g.data.serialno}</h5>
        <h5 class = "lighter">Original Date: ${g.data.license_original_date}</h5>
				<h5 class = "lighter">Effective Date: ${g.data.license_effective_date}</h5>
        <h5 class = "lighter">Expiration Date: ${g.data.license_expiration_date}</h5>
        <h5 class = "lighter">Method of Operation: ${g.data.method_of_operation}</h5>
        <h5 class = "lighter">Days/Hours of Operation: ${g.data.days_hours_of_operation}</h5>
        <h5 class = "lighter"><a href= 'https://lamp.sla.ny.gov/?center=${g.latLng.lng},${g.latLng.lat}&level=18' target = '_blank'>View infomation on LAMP</a></h5>
	<h5 class = "lighter">
		<p>Note: Currently the Public Query tool is decommissioned for security reasons. Please <a href="https://sla.ny.gov/public-query">FOIL SLA</a> for 
		principal information or use <a href="https://beta.nyc/radar">BetaNYC's RADAR</a> system. 
		</p>
		<a href= 'https://www.tran.sla.ny.gov/servlet/ApplicationServlet?pageName=com.ibm.nysla.data.publicquery.PublicQuerySuccessfulResultsPage&validated=true&serialNumber=${g.data.serialno}&licenseType=${g.data.licensetyp}' target = '_blank'>Click here for more information about this license.</a>
	</h5>`;const m=new Headers;m.append("Ocp-Apim-Subscription-Key","8ef9b00a1d6c4a97b17a6c4828cfc2eb");var v=`https://api.nyc.gov/geo/geoclient/v1/search.json?input=${g.data.premiseaddress1} ${g.data.premisezip}`,I=new Promise(function($){fetch(v,{headers:m}).then(function(R){return R.json()}).then(function(R){const N=R.results[0].response;$(N.buildingIdentificationNumber)}).catch(function(R){$(0)})});I.then($=>{if($===0)y+='<div class="separator"></div><h4>Certificate of Occupancy</h4>><h5 class = "lighter">No BIN Found.</h5>';else{const R=`http://a810-bisweb.nyc.gov/bisweb/COsByLocationServlet?requestid=1&allbin=${$}`;y+=`<div class="separator"></div><h4>Certificate of Occupancy</h4><h5 class = "lighter">BIN: <a href= '${R}' target = '_blank'>${$}</a></h5>`}O+=`<div class="separator"></div>
          <h6>Source: 
            <a href='https://data.ny.gov/Economic-Development/Liquor-Authority-Quarterly-List-of-Active-Licenses/hrvs-fxs2'>Liquor Authority Quarterly List of Active Licenses.</a>
            <a href='https://lamp.sla.ny.gov/'>NYS Liquor Authority Mapping Project (LAMP)</a>
            </h6>
          <h6>Data is filtered to liquor licenses reviewed by the New York City Agency Office. Data is updated Daily.</h6>`,X.show({content:y,source:O,charts:[]})})}),o.getLeafletLayer().addTo(r),[]}class wt extends P{constructor(e){super(),H(this,e,bt,null,E,{})}}function $t(t){const{getMap:e,getCartoClient:a,getPopup:s}=K(U),r=e(),o=a(),n=s(),d=new carto.source.SQL(`
          SELECT * FROM sidewalk_caf_licenses_and_applications
  `),u=new carto.style.CartoCSS(`
  				#layer {
  				marker-width: 16;
  				marker-fill-opacity: 0.9;
  				marker-file: url('https://s3.amazonaws.com/com.cartodb.users-assets.production/production/betanyc/assets/20180612173650picnic-site-15.svg');
  				marker-allow-overlap: true;
  				marker-line-width: 0.25;
  				marker-line-color: #FFFFFF;
  				marker-line-opacity: 1;
  				}
  				#layer [zoom > 16]{
  					marker-width: 16;
  				}
  				#layer [zoom <= 16]{
  				marker-width: 12;
  				}
  				#layer [zoom <= 15]{
  				marker-width: 10;
  				}
  				#layer [zoom <= 14]{
  				marker-width: 7;
  				}
  				#layer [zoom <= 12]{
  				marker-width: 2;
  				}
  				#layer {
            [lic_status = 'Active']{
  			    	marker-fill: #07d91c;
  					}
            [lic_status = 'Inactive']{
  				    marker-fill: #227527;
  					}
          }
  				`),c=new carto.layer.Layer(d,u,{featureOverColumns:["license_nbr","lic_status","business_name","business_name2","building","street","swc_type","swc_sq_ft","swc_tables","swc_chairs","community_district","expiration_date","issuance","issuance_dd","cb","cb_dd","app_id","app_swc_type","app_sq_ft","app_tables","app_chairs","intake_dd"]});return o.addLayer(c).then(()=>{G.add({order:4,ref:c,label:"Sidewalk Café Licenses",legend:[{image:"https://s3.amazonaws.com/com.cartodb.users-assets.production/production/betanyc/assets/20180629210223picnic-site-15.svg",text:"Active"},{image:"https://s3.amazonaws.com/com.cartodb.users-assets.production/production/betanyc/assets/20180629210143picnic-site-15.svg",text:"Inactive"}],checked:!1})}).catch(l=>console.log(l.message)),c.on("featureOver",l=>{let i="";i+='<div class="widget">',i+=`<p class = "bold">${l.data.building} ${l.data.street}</p><p>${l.data.business_name2}</p><p>${l.data.business_name}</p>`,n.setContent(i),n.setLatLng(l.latLng),n.isOpen()||n.openOn(r)}),c.on("featureClicked",l=>{let i="",h="",p=!1,_=!1;l.data.issuance=="Pending Review"&&l.data.lic_status=="Inactive"?(p=!0,_=!1):l.data.issuance=="Issued"&&l.data.lic_status=="Inactive"&&(p=!1,_=!0),i+=`<h3 class = "bold">${l.data.business_name2}</h3>
				<h4 class = "bold">${l.data.business_name}</h4>
				<h4>${l.data.building} ${l.data.street}</h4><div class="separator"></div>`,p==!0?i+=`<h5 class = "lighter">${l.data.issuance}</h5>
					 <h5 class = "lighter">Application ID: ${l.data.app_id}</h5>
					 <h5 class = "lighter">Application Type: ${l.data.app_swc_type}</h5>
					 <h5 class = "lighter">Application Square footage: ${l.data.app_sq_ft}</h5>
					 <h5 class = "lighter">Application Tables: ${l.data.app_tables}</h5>
					 <h5 class = "lighter">Application Chairs: ${l.data.app_chairs}</h5>
					 <h5 class = "lighter">Application Intake Date: ${l.data.intake_dd}</h5>
					 <h5><a href="https://www1.nyc.gov/assets/dca/SidewalkCafeMap/index.html#home" target="_blank">Click here for more information about this sidewalk cafe.</h5>`:_==!0?i+=`<h5 class = "lighter">Status: ${l.data.lic_status}</h5>
					 <h5 class = "lighter">License Number: ${l.data.license_nbr}</h5>
					 <h5 class = "lighter">Issuance Date: ${l.data.issuance_dd}</h5>
					 <h5 class = "lighter">Expiration Date: ${l.data.expiration_date}</h5>`:i+=`<h5 class = "lighter">Status: ${l.data.lic_status}</h5>
					 <h5 class = "lighter">License Number: ${l.data.license_nbr}</h5>
					 <h5 class = "lighter">Type: ${l.data.swc_type}</h5>
					 <h5 class = "lighter">Square footage: ${l.data.swc_sq_ft}</h5>
					 <h5 class = "lighter">Tables: ${l.data.swc_tables}</h5>
					 <h5 class = "lighter">Chairs: ${l.data.swc_chairs}</h5>
					 <h5 class = "lighter">Issuance Date: ${l.data.issuance_dd}</h5>
					 <h5 class = "lighter">Expiration Date: ${l.data.expiration_date}</h5>
					 <div class="separator"></div>
					 <h5 class = "lighter">Community Board: ${l.data.community_district}</h5>
					 <h5 class = "lighter">Community Board Review Status: ${l.data.cb}</h5>
					 <h5 class = "lighter">Community Board Review Status Date: ${l.data.cb_dd}</h5>
					 <h5><a href="https://www1.nyc.gov/assets/dca/SidewalkCafeMap/index.html#home" target="_blank">Click here for more information about this sidewalk cafe.</h5>
					 `,h+=`<div class="separator"></div><h6>Source: <a href='https://data.cityofnewyork.us/Business/Sidewalk-Caf-Licenses-and-Applications/qcdj-rwhu/data'>Sidewalk Cafe Licenses and Applications.</a></h6><h6>Data is updated weekly.</h6>`,X.show({content:i,source:h,charts:[]})}),o.getLeafletLayer().addTo(r),[]}class kt extends P{constructor(e){super(),H(this,e,$t,null,E,{})}}function vt(t){const{getMap:e,getCartoClient:a,getPopup:s}=K(U),r=e(),o=a(),n=s(),d=new carto.source.SQL(`
          SELECT * FROM nyc_open_restaurants_application_xjsx
  `),u=new carto.style.CartoCSS(`
  				#layer {
  				marker-width: 18;
  				marker-fill-opacity: 0.9;
  				marker-file: url('https://s3.amazonaws.com/com.cartodb.users-assets.production/production/betanyc/assets/20180612173650picnic-site-15.svg');
  				marker-allow-overlap: true;
  				marker-line-width: 0.25;
  				marker-line-color: #FFFFFF;
  				marker-line-opacity: 1;
  				}
  				#layer [zoom > 16]{
  					marker-width: 18;
  				}
  				#layer [zoom <= 16]{
  				marker-width: 14;
  				}
  				#layer [zoom <= 15]{
  				marker-width: 12;
  				}
  				#layer [zoom <= 14]{
  				marker-width: 6;
  				}
  				#layer [zoom <= 12]{
  				marker-width: 3;
  				}
  				#layer {
            [alcohol = 'yes']{
                marker-fill: #804F40;
                }
            [alcohol = 'no']{
                marker-fill: #4dc1bb;
            }
          }
  				`),c=new carto.layer.Layer(d,u,{featureOverColumns:["bizaddress","restaurantname","extra1","alcohol","submissiontime"]});return o.addLayer(c).then(()=>{G.add({order:0,ref:c,label:"Open Restaurants (self-certified)",legend:[{image:"./images/alcohol.svg",text:"Alcohol Service"},{image:"./images/no_alcohol.svg",text:"No Alcohol Service"}],checked:!0})}).catch(l=>console.log(l.message)),c.on("featureOver",l=>{const{bizaddress:i,restaurantname:h}=l.data;let p=`
            <div class="widget">
                <p class = "bold">${i}</p>
                <p>${h}</p>
            </div>
        `;n.setContent(p),n.setLatLng(l.latLng),n.isOpen()||n.openOn(r)}),c.on("featureClicked",l=>{const{bizaddress:i,restaurantname:h,extra1:p,alcohol:_,submissiontime:f}=l.data;let g=`
            <div class="widget">
                <p class = "bold">${i}</p>
                <p>${h}</p>
                <div class="tags-group">
                     <div class="tags has-addons">
                        <p class="tag">Sidewalk/ Roadway</p><p class="tag">${p}</p>
                    </div>
                    <div class="tags has-addons">
                        <p class="tag">Alcohol</p><p class="tag ${_==="yes"?"success":""}">${_}</p>
                    </div>
                </div>
            </div>
        `,y=`
            <div class="separator"></div>
            <h6>Source: <a target="_blank" href='http://nycopenrestaurants.info'>Open Restaurant Map & Dashboard.</a></h6>
            <h6>Data is updated hourly. Note: This data is <strong>self-certified responses</strong>.</h6>
        `;X.show({content:g,source:y,charts:[]})}),o.getLeafletLayer().addTo(r),[]}class Ct extends P{constructor(e){super(),H(this,e,vt,null,E,{})}}const je={afterDatasetsDraw:function(t){var e=t.ctx;t.data.datasets.forEach(function(a,s){var r=t.getDatasetMeta(s);r.hidden||r.data.forEach(function(o,n){e.fillStyle="rgb(100, 100, 100)";var d=10,u="normal",c="Helvetica Neue";e.font=Chart.helpers.fontString(d,u,c);let l=0;a.data[n]!=null&&(l=a.data[n]);var i=l.toString();e.textAlign="center",e.textBaseline="middle";var h=-15,p=o.tooltipPosition();i!=0&&e.fillText(i,p.x,p.y-d/2-h)})})}};function St(t){const{getMap:e,getCartoClient:a,getPopup:s}=K(U),r=e(),o=a(),n=s(),d=new carto.source.SQL(`WITH
          s AS (
              SELECT ROW_NUMBER() OVER(ORDER BY to_timestamp(created_date, 'MM/DD/YYYY') ASC) rownum, the_geom_webmercator, cartodb_id
              FROM open_restaurants_pre_filter_since_march q WHERE (
                (q.agency = 'NYPD' AND q.descriptor in ('Social Distancing', 'Face Covering Violation') AND q.location_type = 'Store/Commercial') OR
                (q.agency = 'DCA' AND q.descriptor = 'Sidewalk Cafe') OR
                (q.agency = 'DOT' AND q.complaint_type = 'Outdoor Dining')
            )),
          m AS (
              SELECT array_agg(cartodb_id ORDER BY rownum) id_list, the_geom_webmercator, ST_Y(the_geom_webmercator) y
              FROM s
              GROUP BY the_geom_webmercator
              ORDER BY y DESC),
          f AS (
              SELECT  generate_series(1, array_length(id_list,1)) p, unnest(id_list) cartodb_id, the_geom_webmercator
              FROM m)
          SELECT ST_Translate(f.the_geom_webmercator,0,f.p*3) the_geom_webmercator, f.cartodb_id, q.agency, q.complaint_type, q.descriptor, q.location_type, q.created_date, q.incident_address, q.intersection_street_1, q.intersection_street_2, q.location geometry
              FROM f, open_restaurants_pre_filter_since_march q
              WHERE f.cartodb_id = q.cartodb_id AND (
                (q.agency = 'NYPD' AND q.descriptor in ('Social Distancing', 'Face Covering Violation') AND q.location_type = 'Store/Commercial') OR
                (q.agency = 'DCA' AND q.descriptor = 'Sidewalk Cafe') OR
                (q.agency = 'DOT' AND q.complaint_type = 'Outdoor Dining')
            )
      `),u=new carto.style.CartoCSS(`
            #layer {
                marker-fill: #4d88ee;
                marker-fill-opacity: 0.9;
                marker-allow-overlap: true;
                marker-line-width: 0.4;
                marker-line-color: #FFFFFF;
                marker-line-opacity: 1;
            }
            #layer[agency="NYPD"] {
                marker-fill: #7570b3;
            }
            #layer[agency="DCA"] {
                marker-fill: #d95f02;
            }
            #layer[agency="DOT"] {
                marker-fill: #1b9e77;
            }
            #layer [zoom > 16]{
                marker-width: 7;
            }
            #layer [zoom <= 16]{
                marker-width: 5;
            }
            #layer [zoom <= 15]{
                marker-width: 4;
            }
            #layer [zoom <= 14]{
                marker-width: 3;
            }
            #layer [zoom <= 12]{
                marker-width: 2;
            }
  
              `),c=new carto.layer.Layer(d,u,{featureOverColumns:["geometry","incident_address","intersection_street_1","intersection_street_2","created_date","agency","descriptor","complaint_type"]});return o.addLayer(c).then(()=>{G.add({order:1,ref:c,label:"311 Complaints- Open Restaurants",notes:'*<a href="https://portal.311.nyc.gov/article/?kanumber=KA-03321" target="_blank">Filtered to social distancing and face coverings (NYPD), consumer complaints (DCA), and compliance (DOT)</a>',legend:[{image:"./images/circle-11-nypd.svg",text:"NYPD"},{image:"./images/circle-11-dca.svg",text:"DCA"},{image:"./images/circle-11-dot.svg",text:"DOT"}],checked:!0})}).catch(l=>console.log(l.message)),c.on("featureOver",l=>{let i="";i+='<div class="widget">',l.data.incident_address!=""?i+=`<p class = "bold">${l.data.incident_address}</p>`:i+=`<p class = "bold">${l.data.intersection_street_1}, ${l.data.intersection_street_2}</p>`,i+=`<p>Complaint Type: ${l.data.complaint_type}</p><p>Descriptor: ${l.data.descriptor}</p><p>Date: ${l.data.created_date}</p>`,n.setContent(i),n.setLatLng(l.latLng),n.isOpen()||n.openOn(r)}),c.on("featureClicked",l=>{let i="",h="",p={},_=[],f=[],g=[],y={},O=[],m=[],v=[];const[I,$]=l.data.geometry.match(/[-]?\d+(?:\.\d*)?/g),R=`https://betanyc.carto.com/api/v2/sql/?q=SELECT cartodb_id, descriptor, created_date, EXTRACT(month from to_date(created_date, 'MM/DD/YYYY')) AS created_month FROM open_restaurants_pre_filter_since_march q
            WHERE ST_Intersects(ST_Buffer(q.the_geom, 0.000005), ST_SetSRID(ST_Point(${$}, ${I}), 4326)) AND (
                (q.agency = 'NYPD' AND q.descriptor in ('Social Distancing', 'Face Covering Violation') AND q.location_type = 'Store/Commercial') OR
                (q.agency = 'DCA' AND q.descriptor = 'Sidewalk Cafe') OR
                (q.agency = 'DOT' AND q.complaint_type = 'Outdoor Dining')
            )&api_key=${U}`;let C=0;fetch(R).then(function(N){return N.json()}).then(function(N){C=N.rows.length,l.data.incident_address!=""?i+=`<h4 class = "bold">${l.data.incident_address}</h4>`:i+=`<h4 class = "bold">${l.data.intersection_street_1}, ${l.data.intersection_street_2}</h4>`,i+=`<div class="separator"></div><h5 class = "lighter">Total Number of Complaints around address point: ${C}</h5>`;for(var q=0;q<C;q++)p[N.rows[q].descriptor]=1+(p[N.rows[q].descriptor]||0);_=Object.keys(p),f=Object.values(p);for(var q=0;q<_.length;q++)g.push("#"+(Math.random().toString(16)+"0000000").slice(2,8));const Q=document.createElement("canvas"),z=Q.getContext("2d");new Chart(z,{type:"pie",data:{labels:_,datasets:[{backgroundColor:g,data:f}]},options:{title:{display:!0,text:"Complaints by Descriptor"},legend:{display:!0,labels:{fontSize:10},position:"right",onClick:null,fullWidth:!0}}});for(var q=0;q<C;q++)y[N.rows[q].created_month]=1+(y[N.rows[q].created_month]||0);O=Object.keys(y),m=Object.values(y);for(var q=0;q<O.length;q++)v.push("#"+(Math.random().toString(16)+"0000000").slice(2,8));const V=document.createElement("canvas"),ne=V.getContext("2d");new Chart(ne,{type:"line",plugins:je,data:{labels:O,datasets:[{borderColor:"#4d88ee",data:m}]},options:{legend:{display:!1},scales:{yAxes:[{ticks:{beginAtZero:!0,fontSize:10},display:!0,scaleLabel:{display:!0,labelString:"# of Complaints",fontSize:10}}],xAxes:[{ticks:{fontSize:10},display:!0,scaleLabel:{display:!0,labelString:"Month",fontSize:10}}]},title:{display:!0,text:"Complaints by Month"}}}),h+=`<div class="separator"></div><h6>Source: <a href='https://data.cityofnewyork.us/Social-Services/311-Service-Requests-from-2010-to-Present/erm2-nwe9/data'>311 Service Requests from 2010 to Present</a></h6><h6>Data was filtered <a href="https://portal.311.nyc.gov/article/?kanumber=KA-03321" target="_blank">to social distancing and face coverings (NYPD), consumer complaints (DCA), and compliance (DOT)</a> compaints. Data is updated daily.</h6>`,X.show({content:i,source:h,charts:[Q,V]})})}),o.getLeafletLayer().addTo(r),[]}class Lt extends P{constructor(e){super(),H(this,e,St,null,E,{})}}function Ot(t){const{getMap:e,getCartoClient:a,getPopup:s}=K(U),r=e(),o=a(),n=s(),d=new carto.source.SQL(`WITH
        s AS (
            SELECT ROW_NUMBER() OVER(ORDER BY to_timestamp(created_date, 'MM/DD/YYYY') ASC) rownum, the_geom_webmercator, cartodb_id
            FROM club_bar_restaurant_complaints_since_jan_1_2017 Q WHERE (q.created_date LIKE '%2020%' or q.created_date LIKE '%2019%')),
        m AS (
            SELECT array_agg(cartodb_id ORDER BY rownum) id_list, the_geom_webmercator, ST_Y(the_geom_webmercator) y
            FROM s
            GROUP BY the_geom_webmercator
            ORDER BY y DESC),
        f AS (
            SELECT  generate_series(1, array_length(id_list,1)) p, unnest(id_list) cartodb_id, the_geom_webmercator
            FROM m)
        SELECT  ST_Translate(f.the_geom_webmercator,0,f.p*3) the_geom_webmercator, f.cartodb_id, q.complaint_type, q.descriptor, q.created_date, q.incident_address, q.intersection_street_1, q.intersection_street_2, q.location geometry
            FROM f, club_bar_restaurant_complaints_since_jan_1_2017 q
            WHERE f.cartodb_id = q.cartodb_id AND (q.created_date LIKE '%2020%' or q.created_date LIKE '%2019%')
    `),u=new carto.style.CartoCSS(`
  		#layer {
  			marker-fill: #4d88ee;
  			marker-fill-opacity: 0.9;
  			marker-allow-overlap: true;
  			marker-line-width: 0.25;
  			marker-line-color: #FFFFFF;
  			marker-line-opacity: 1;
  		}
  		#layer[complaint_type="Drinking"] {
  			marker-fill: #3622b9;
  		}
  		#layer[complaint_type="Noise - Commercial"] {
  			marker-fill: #4d88ee;
  		}
  		#layer [zoom > 16]{
  			marker-width: 7;
  		}
  		#layer [zoom <= 16]{
  		marker-width: 5;
  		}
  		#layer [zoom <= 15]{
  		marker-width: 4;
  		}
  		#layer [zoom <= 14]{
  		marker-width: 3;
  		}
  		#layer [zoom <= 12]{
  		marker-width: 2;
  		}

            `),c=new carto.layer.Layer(d,u,{featureOverColumns:["geometry","incident_address","intersection_street_1","intersection_street_2","created_date","descriptor","complaint_type"]});return o.addLayer(c).then(()=>{G.add({order:2,ref:c,label:"311 Complaints - Noise/ Drinking",notes:"*Filtered to those made at club/bar/restaurant (Since January 1, 2019)",legend:[{image:"https://s3.amazonaws.com/com.cartodb.users-assets.production/production/betanyc/assets/20180629210011circle-11.svg",text:"Noise"},{image:"https://s3.amazonaws.com/com.cartodb.users-assets.production/production/betanyc/assets/20180629210053circle-11.svg",text:"Drinking"}],checked:!1})}).catch(l=>console.log(l.message)),c.on("featureOver",l=>{let i="";i+='<div class="widget">',l.data.incident_address!=""?i+=`<p class = "bold">${l.data.incident_address}</p>`:i+=`<p class = "bold">${l.data.intersection_street_1}, ${l.data.intersection_street_2}</p>`,i+=`<p>Complaint Type: ${l.data.complaint_type}</p><p>Descriptor: ${l.data.descriptor}</p><p>Date: ${l.data.created_date}</p>`,n.setContent(i),n.setLatLng(l.latLng),n.isOpen()||n.openOn(r)}),c.on("featureClicked",l=>{let i="",h="",p={},_=[],f=[],g=[],y={},O=[],m=[],v=[];const I=`https://betanyc.carto.com/api/v2/sql/?q=SELECT cartodb_id, descriptor, created_date, EXTRACT(year from to_date(created_date, 'MM/DD/YYYY')) AS created_year FROM club_bar_restaurant_complaints_since_jan_1_2017 WHERE location='${l.data.geometry}'&api_key=${U}`;let $=0;fetch(I).then(function(R){return R.json()}).then(function(R){$=R.rows.length,l.data.incident_address!=""?i+=`<h4 class = "bold">${l.data.incident_address}</h4>`:i+=`<h4 class = "bold">${l.data.intersection_street_1}, ${l.data.intersection_street_2}</h4>`,i+=`<div class="separator"></div><h5 class = "lighter">Total Number of Complaints: ${$}</h5>`;for(var C=0;C<$;C++)p[R.rows[C].descriptor]=1+(p[R.rows[C].descriptor]||0);_=Object.keys(p),f=Object.values(p);for(var C=0;C<_.length;C++)g.push("#"+(Math.random().toString(16)+"0000000").slice(2,8));const N=document.createElement("canvas"),q=N.getContext("2d");new Chart(q,{type:"pie",data:{labels:_,datasets:[{backgroundColor:g,data:f}]},options:{title:{display:!0,text:"Complaints by Descriptor"},legend:{display:!0,labels:{fontSize:10},position:"right",onClick:null,fullWidth:!0}}});for(var C=0;C<$;C++)y[R.rows[C].created_year]=1+(y[R.rows[C].created_year]||0);O=Object.keys(y),m=Object.values(y);for(var C=0;C<O.length;C++)v.push("#"+(Math.random().toString(16)+"0000000").slice(2,8));const Q=document.createElement("canvas"),z=Q.getContext("2d");new Chart(z,{type:"line",plugins:je,data:{labels:O,datasets:[{borderColor:"#4d88ee",data:m}]},options:{legend:{display:!1},scales:{yAxes:[{ticks:{beginAtZero:!0,fontSize:10},display:!0,scaleLabel:{display:!0,labelString:"# of Complaints",fontSize:10}}],xAxes:[{ticks:{fontSize:10},display:!0,scaleLabel:{display:!0,labelString:"Year",fontSize:10}}]},title:{display:!0,text:"Complaints by Year"}}}),h+=`<div class="separator"></div><h6>Source: <a href='https://data.cityofnewyork.us/Social-Services/311-Service-Requests-from-2010-to-Present/erm2-nwe9/data'>311 Service Requests from 2010 to Present</a></h6><h6>Data was filtered to complaints at a club/restaurant/bar made since January 1, 2019. Data is updated daily.</h6>`,X.show({content:i,source:h,charts:[N,Q]})})}),o.getLeafletLayer().addTo(r),[]}class Rt extends P{constructor(e){super(),H(this,e,Ot,null,E,{})}}function Mt(t){const{getMap:e,getCartoClient:a,getPopup:s}=K(U),r=e(),o=a(),n=s(),d=new carto.source.SQL(`WITH
  		m AS (
  			SELECT array_agg(cartodb_id) id_list, the_geom_webmercator, ST_Y(the_geom_webmercator) y
  			FROM table_6w5r_a6nw
  			GROUP BY the_geom_webmercator
  			ORDER BY y DESC),
  		f AS (
  			SELECT  generate_series(1, array_length(id_list,1)) p, unnest(id_list) cartodb_id, the_geom_webmercator
  			FROM m)
  		SELECT  ST_Translate(f.the_geom_webmercator,0,f.p*5) the_geom_webmercator, f.cartodb_id, q.camis, q.dba, q.building, q.street
  			FROM f, table_6w5r_a6nw q
  			WHERE f.cartodb_id = q.cartodb_id
            `),u=new carto.style.CartoCSS(`
  		#layer{
  		marker-fill: #ff8300;
  		marker-fill-opacity: 0.9;
  		marker-file: url('https://s3.amazonaws.com/com.cartodb.users-assets.production/maki-icons/embassy-18.svg');
  		marker-allow-overlap: true;
  		marker-line-width: 1;
  		marker-line-color: #FFFFFF;
  		marker-line-opacity: 1;
  		}
  		#layer [zoom > 16]{
  			marker-width: 20;
  		}
  		#layer [zoom <= 16]{
  		marker-width: 15;
  		}
  		#layer [zoom <= 15]{
  		marker-width: 13;
  		}
  		#layer [zoom <= 14]{
  		marker-width: 8;
  		}
  		#layer [zoom <= 12]{
  		marker-width: 4;
  		}

                `),c=new carto.layer.Layer(d,u,{featureOverColumns:["camis","dba","building","street"]});return o.addLayer(c).then(()=>{G.add({order:5,ref:c,label:"Restaurant Health Grades",legend:[{image:"https://s3.amazonaws.com/com.cartodb.users-assets.production/production/betanyc/assets/20180629205921embassy-15.svg",text:"Restaurant"}],checked:!1})}).catch(l=>console.log(l.message)),c.on("featureOver",l=>{let i="";i+='<div class="widget">',i+=`<p class = "bold">${l.data.building} ${l.data.street}</p><p>${l.data.dba}</p>`,n.setContent(i),n.setLatLng(l.latLng),n.isOpen()||n.openOn(r)}),c.on("featureClicked",l=>{let i="",h="";i+=`<h3 class = "bold">${l.data.dba}</h3><h4>${l.data.building} ${l.data.street}</h4><div class="separator"></div>`;var p=`https://betanyc.carto.com/api/v2/sql/?q=SELECT * FROM camis_grade_not_null WHERE camis='${l.data.camis}' ORDER BY to_timestamp(grade_date, 'MM/DD/YYYY') DESC&api_key=${U}`;fetch(p).then(function(_){return _.json()}).then(function(_){_.rows.length!=0&&(i+=`
						<h5 class = "lighter">Most Recent Grade: ${_.rows[0].grade}</h5>
						<h5 class = "lighter">Grade Date: ${_.rows[0].grade_date}</h5>`),Array.prototype.groupBy=function(m){return this.reduce(function(v,I){const $=I[m];return v[$]=v[$]||[],v[$].push(I),v},{})};var f=_.rows.groupBy("grade_date");i+='<div class="separator"></div><h5 class = "bold">Grade History</h5>';for(var g=0;g<Object.keys(f).length;g++){var y=Object.keys(f)[g],O=Object.values(f)[g];y!=""&&(i+=`<h5 class = "lighter"> ${y}: ${O[0].grade}</h5>`)}l.data.camis?i+=`<h5><a href="https://a816-health.nyc.gov/ABCEatsRestaurants/#/Search/${l.data.camis}" target="_blank">Click here for more information about this restaurant.</h5> `:i+='<h5><a href="https://a816-health.nyc.gov/ABCEatsRestaurants/#/Search" target="_blank">Click here for more information about this restaurant.</h5> ',h+=`<div class="separator"></div><h6>Source: <a href='https://data.cityofnewyork.us/Health/DOHMH-New-York-City-Restaurant-Inspection-Results/43nn-pn8j/data'>DOHMH New York City Restaurant Inspection Results.</a></h6><h6>Data is geocoded with the Department of City Plannings GeoSupport application once a week. The map does not display restaurants with addresses rejected by the application. Data is updated weekly.</h6>`,X.show({content:i,source:h,charts:[]})})}),o.getLeafletLayer().addTo(r),[]}class Dt extends P{constructor(e){super(),H(this,e,Mt,null,E,{})}}function At(t){const{getMap:e,getCartoClient:a,getPopup:s}=K(U),r=e(),o=a(),n=s(),d=new carto.source.SQL(`SELECT cartodb_id, the_geom_webmercator, address, bldgclass FROM bkmappluto WHERE bldgclass = 'W1' OR bldgclass = 'W2' OR bldgclass = 'W3' OR bldgclass = 'M1' OR bldgclass = 'M2' OR bldgclass = 'M3' OR bldgclass = 'M4' OR bldgclass = 'M9' UNION SELECT cartodb_id, the_geom_webmercator, address, bldgclass FROM bxmappluto WHERE bldgclass = 'W1' OR bldgclass = 'W2' OR bldgclass = 'W3' OR bldgclass = 'M1' OR bldgclass = 'M2' OR bldgclass = 'M3' OR bldgclass = 'M4' OR bldgclass = 'M9' UNION SELECT cartodb_id, the_geom_webmercator, address, bldgclass FROM mnmappluto WHERE bldgclass = 'W1' OR bldgclass = 'W2' OR bldgclass = 'W3' OR bldgclass = 'M1' OR bldgclass = 'M2' OR bldgclass = 'M3' OR bldgclass = 'M4' OR bldgclass = 'M9' UNION SELECT cartodb_id, the_geom_webmercator, address, bldgclass FROM simappluto WHERE bldgclass = 'W1' OR bldgclass = 'W2' OR bldgclass = 'W3' OR bldgclass = 'M1' OR bldgclass = 'M2' OR bldgclass = 'M3' OR bldgclass = 'M4' OR bldgclass = 'M9' UNION SELECT cartodb_id, the_geom_webmercator, address, bldgclass FROM qnmappluto WHERE bldgclass = 'W1' OR bldgclass = 'W2' OR bldgclass = 'W3' OR bldgclass = 'M1' OR bldgclass = 'M2' OR bldgclass = 'M3' OR bldgclass = 'M4' OR bldgclass = 'M9'
            `),u=new carto.style.CartoCSS(`
					#layer{
						polygon-fill: #12eda4;
					}
				`),c=new carto.layer.Layer(d,u,{featureOverColumns:["address","bldgclass"]});return o.addLayer(c).then(()=>{G.add({order:6,ref:c,label:"Show Schools and Churches",checked:!1,legend_html:'<div class="colored_square" style="background-color: #12eda4;"></div>'})}).catch(l=>console.log(l.message)),c.on("featureOver",l=>{let i="",h="";i+='<div class="widget">',l.data.bldgclass=="W1"?h="Public Elementary, Junior, or Senior High":l.data.bldgclass=="W2"?h="Parochial School, Yeshiva":l.data.bldgclass=="W3"?h="School or Academy":l.data.bldgclass=="M1"?h="Church, Synagogue, Chapel":l.data.bldgclass=="M2"?h="Mission House (non-residential)":l.data.bldgclass=="M3"?h="Parsonage, Rectory":l.data.bldgclass=="M4"?h="Convent":l.data.bldgclass=="M9"&&(h="Miscellaneous Religious Facility"),i+=`<p>Address: ${l.data.address}</p><p>DCP Building Class: ${h}</p>`,n.setContent(i),n.setLatLng(l.latLng),n.isOpen()||n.openOn(r)}),o.getLeafletLayer().addTo(r),[]}class xt extends P{constructor(e){super(),H(this,e,At,null,E,{})}}function Tt(t){const{getMap:e,getCartoClient:a,getPopup:s}=K(U),r=e(),o=a();s();const n=new carto.source.SQL("SELECT * FROM all_bounds WHERE id = 'cd' AND NOT namecol IN ('164','226','227','228','355','356','480','481','482')"),d=new carto.style.CartoCSS(`
    #layer {
        polygon-fill: #fff;
        polygon-opacity: 0;
        text-name: [namecol];
        text-face-name: 'Lato Bold Italic';
        text-fill: #fff;
        text-halo-radius: 2.5;
        text-halo-fill: darken(#000000,20);
        text-allow-overlap: true;
    }
    #layer::outline {
        line-width: 2;
        line-color: #000000;
        line-opacity: 1;
    }
    #layer::outline [zoom <= 12]{
        marker-width: 1;
    }
    #layer[zoom > 12]{
        text-size: 11;
    }
    #layer[zoom <= 12]{
        text-size: 8;
    }
    #layer[zoom > 11]{
        text-size: 16;
        text-character-spacing: 2;
    }
    #layer[zoom <= 11]{
        text-size: 10;
        text-character-spacing: 1;
    }
    `),u=new carto.layer.Layer(n,d);return o.addLayer(u).then(()=>{G.add({order:7,ref:u,label:"Show Community Districts",checked:!1,legend_html:'<hr class="colored_line" style="border-top-color:#000;">'})}).catch(c=>console.log(c.message)),o.getLeafletLayer().addTo(r),[]}class qt extends P{constructor(e){super(),H(this,e,Tt,null,E,{})}}function zt(t){const{getMap:e,getCartoClient:a,getPopup:s}=K(U),r=e(),o=a();s();const n=new carto.source.SQL("SELECT * FROM all_bounds WHERE id = 'cc'"),d=new carto.style.CartoCSS(`
      #layer {
          polygon-fill: #fff;
          polygon-opacity: 0;
          text-name: [namecol];
          text-face-name: 'Lato Bold Italic';
          text-fill: #fff;
          text-halo-radius: 2.5;
          text-halo-fill: darken(#1212ed,20);
          text-allow-overlap: true;
      }
      #layer::outline {
          line-width: 2;
          line-color: #1212ed;
          line-opacity: 1;
      }
      #layer::outline [zoom <= 12]{
          marker-width: 1;
      }
      #layer[zoom > 12]{
          text-size: 11;
      }
      #layer[zoom <= 12]{
          text-size: 8;
      }
      #layer[zoom > 11]{
          text-size: 16;
          text-character-spacing: 2;
      }
      #layer[zoom <= 11]{
          text-size: 10;
          text-character-spacing: 1;
      }
      `),u=new carto.layer.Layer(n,d);return o.addLayer(u).then(()=>{G.add({order:8,ref:u,label:"Show City Council Districts",checked:!1,legend_html:'<hr class="colored_line" style="border-top-color:#1212ed;">'})}).catch(c=>console.log(c.message)),o.getLeafletLayer().addTo(r),[]}class Nt extends P{constructor(e){super(),H(this,e,zt,null,E,{})}}function Te(t){let e,a,s,r,o,n,d,u,c,l,i,h,p,_,f,g,y,O;return e=new Lt({}),s=new Ct({}),o=new wt({}),d=new kt({}),c=new Rt({}),i=new Dt({}),p=new xt({}),f=new qt({}),y=new Nt({}),{c(){B(e.$$.fragment),a=S(),B(s.$$.fragment),r=S(),B(o.$$.fragment),n=S(),B(d.$$.fragment),u=S(),B(c.$$.fragment),l=S(),B(i.$$.fragment),h=S(),B(p.$$.fragment),_=S(),B(f.$$.fragment),g=S(),B(y.$$.fragment)},m(m,v){j(e,m,v),A(m,a,v),j(s,m,v),A(m,r,v),j(o,m,v),A(m,n,v),j(d,m,v),A(m,u,v),j(c,m,v),A(m,l,v),j(i,m,v),A(m,h,v),j(p,m,v),A(m,_,v),j(f,m,v),A(m,g,v),j(y,m,v),O=!0},i(m){O||(M(e.$$.fragment,m),M(s.$$.fragment,m),M(o.$$.fragment,m),M(d.$$.fragment,m),M(c.$$.fragment,m),M(i.$$.fragment,m),M(p.$$.fragment,m),M(f.$$.fragment,m),M(y.$$.fragment,m),O=!0)},o(m){x(e.$$.fragment,m),x(s.$$.fragment,m),x(o.$$.fragment,m),x(d.$$.fragment,m),x(c.$$.fragment,m),x(i.$$.fragment,m),x(p.$$.fragment,m),x(f.$$.fragment,m),x(y.$$.fragment,m),O=!1},d(m){W(e,m),m&&D(a),W(s,m),m&&D(r),W(o,m),m&&D(n),W(d,m),m&&D(u),W(c,m),m&&D(l),W(i,m),m&&D(h),W(p,m),m&&D(_),W(f,m),m&&D(g),W(y,m)}}}function Yt(t){let e,a,s=t[1]&&Te();return{c(){e=k("div"),s&&s.c(),w(e,"id","map"),w(e,"class","svelte-16jssmr")},m(r,o){A(r,e,o),s&&s.m(e,null),t[2](e),a=!0},p(r,[o]){r[1]?s?o&2&&M(s,1):(s=Te(),s.c(),M(s,1),s.m(e,null)):s&&(pe(),x(s,1,1,()=>{s=null}),he())},i(r){a||(M(s),a=!0)},o(r){x(s),a=!1},d(r){r&&D(e),s&&s.d(),t[2](null)}}}function Ft(t,e,a){let s,r,o,n;Ve(U,{getMap:()=>o,getCartoClient:()=>r,getPopup:()=>n}),Ke(()=>{r=new carto.Client({apiKey:U,username:"betanyc"});const u=20;a(1,o=L.map(s,{maxZoom:u}).setView([40.73,-74],18)),o.scrollWheelZoom.disable(),L.control.locate({keepCurrentZoomLevel:!0}).addTo(o).start(),n=L.popup({closeButton:!1}),L.tileLayer("https://cartodb-basemaps-{s}.global.ssl.fastly.net/rastertiles/voyager/{z}/{x}/{y}{r}.png",{maxZoom:u}).addTo(o),Ee.set(o)});function d(u){ue[u?"unshift":"push"](()=>{s=u,a(0,s)})}return[s,o,d]}let Et=class extends P{constructor(e){super(),H(this,e,Ft,Yt,E,{})}};function jt(t){let e,a,s=t[1].content+"",r,o,n,d,u=t[1].source+"";return{c(){e=k("div"),a=new Ce(!1),r=S(),o=k("div"),n=S(),d=new Ce(!1),a.a=r,d.a=null,w(e,"class","infobox svelte-lbk0yk")},m(c,l){A(c,e,l),a.m(s,e),b(e,r),b(e,o),t[2](o),b(e,n),d.m(u,e)},p(c,[l]){l&2&&s!==(s=c[1].content+"")&&a.p(s),l&2&&u!==(u=c[1].source+"")&&d.p(u)},i:F,o:F,d(c){c&&D(e),t[2](null)}}}function Wt(t,e,a){let s;me(t,X,n=>a(1,s=n));let r;function o(n){ue[n?"unshift":"push"](()=>{r=n,a(0,r),a(1,s)})}return t.$$.update=()=>{t.$$.dirty&3&&r&&(a(0,r.innerHTML="",r),s.charts.forEach(n=>r.appendChild(n)))},[r,s,o]}class Ht extends P{constructor(e){super(),H(this,e,Wt,jt,E,{})}}function qe(t){let e,a,s,r,o,n,d;return r=new Ht({}),{c(){e=k("div"),a=k("span"),a.textContent="×",s=S(),B(r.$$.fragment),w(a,"class","close svelte-qj9d2u"),w(e,"class","modal svelte-qj9d2u")},m(u,c){A(u,e,c),b(e,a),b(e,s),j(r,e,null),o=!0,n||(d=Z(a,"click",t[1]),n=!0)},p:F,i(u){o||(M(r.$$.fragment,u),o=!0)},o(u){x(r.$$.fragment,u),o=!1},d(u){u&&D(e),W(r),n=!1,d()}}}function Pt(t){let e,a,s,r,o,n,d,u,c;r=new yt({}),d=new Et({});let l=t[0]&&qe(t);return{c(){e=k("main"),a=k("div"),s=k("div"),B(r.$$.fragment),o=S(),n=k("div"),B(d.$$.fragment),u=S(),l&&l.c(),w(s,"class","left svelte-qj9d2u"),w(n,"class","right svelte-qj9d2u"),w(a,"class","panel svelte-qj9d2u"),w(e,"class","svelte-qj9d2u")},m(i,h){A(i,e,h),b(e,a),b(a,s),j(r,s,null),b(a,o),b(a,n),j(d,n,null),b(e,u),l&&l.m(e,null),c=!0},p(i,[h]){i[0]?l?(l.p(i,h),h&1&&M(l,1)):(l=qe(i),l.c(),M(l,1),l.m(e,null)):l&&(pe(),x(l,1,1,()=>{l=null}),he())},i(i){c||(M(r.$$.fragment,i),M(d.$$.fragment,i),M(l),c=!0)},o(i){x(r.$$.fragment,i),x(d.$$.fragment,i),x(l),c=!1},d(i){i&&D(e),W(r),W(d),l&&l.d()}}}function It(t,e,a){let s;me(t,we,o=>a(0,s=o));function r(){we.set(!1)}return[s,r]}class Bt extends P{constructor(e){super(),H(this,e,It,Pt,E,{})}}new Bt({target:document.body});
