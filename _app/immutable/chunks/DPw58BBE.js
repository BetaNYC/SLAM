import{A as e,O as t,V as n,W as r,j as i,p as a,q as o,rt as s,t as c,x as l}from"./BMpgzjPG.js";var u=e(`<p><strong>Distances are approximate.</strong> The law measures from the center of the nearest entrance
	of one building to the center of the nearest entrance of the other. SLAM cannot measure door to door:
	it has no entrance locations. It measures a straight line between approximate building points, from
	the City's address search or from each dataset's own map point.<!></p>`);function d(e,d){let f=c(d,`compact`,3,!1);var p=u();let m;var h=o(r(p),2),g=e=>{var n=i();n.nodeValue=` Those points can sit
	away from the door, so a SLAM distance can differ from an entrance-to-entrance measurement by tens
	of feet or more, especially for large or corner buildings. Treat a distance near a limit as close,
	not as over or under it.`,t(e,n)};l(h,e=>{f()||e(g)}),s(p),n(()=>m=a(p,1,`distance-note svelte-1kfme54`,null,m,{compact:f()})),t(e,p)}export{d as t};