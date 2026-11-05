import{B as e,D as t,E as n,L as r,U as i,Z as a,_ as o,f as s,t as c,w as l}from"./Y8ipq_Pq.js";var u=n(`<p><strong>Distances are approximate.</strong> The law measures from the center of the nearest entrance
	of one building to the center of the nearest entrance of the other. SLAM cannot measure door to door:
	it has no entrance locations. It measures a straight line between approximate building points, from
	the City's address search or from each dataset's own map point.<!></p>`);function d(n,d){let f=c(d,`compact`,3,!1);var p=u();let m;var h=i(e(p),2),g=e=>{var n=t();n.nodeValue=` Those points can sit
	away from the door, so a SLAM distance can differ from an entrance-to-entrance measurement by tens
	of feet or more, especially for large or corner buildings. Treat a distance near a limit as close,
	not as over or under it.`,l(e,n)};o(h,e=>{f()||e(g)}),a(p),r(()=>m=s(p,1,`distance-note svelte-1kfme54`,null,m,{compact:f()})),l(n,p)}export{d as t};