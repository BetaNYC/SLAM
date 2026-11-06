import{$ as e,D as t,O as n,R as r,T as i,V as a,W as o,f as s,t as c,v as l}from"./CIKwACbg.js";var u=t(`<p><strong>Distances are approximate.</strong> The law measures from the center of the nearest entrance
	of one building to the center of the nearest entrance of the other. SLAM cannot measure door to door:
	it has no entrance locations. It measures a straight line between approximate building points, from
	the City's address search or from each dataset's own map point.<!></p>`);function d(t,d){let f=c(d,`compact`,3,!1);var p=u();let m;var h=o(a(p),2),g=e=>{var t=n();t.nodeValue=` Those points can sit
	away from the door, so a SLAM distance can differ from an entrance-to-entrance measurement by tens
	of feet or more, especially for large or corner buildings. Treat a distance near a limit as close,
	not as over or under it.`,i(e,t)};l(h,e=>{f()||e(g)}),e(p),r(()=>m=s(p,1,`distance-note svelte-1kfme54`,null,m,{compact:f()})),i(t,p)}export{d as t};