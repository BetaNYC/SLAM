import{A as e,B as t,D as n,K as r,U as i,b as a,f as o,k as s,t as c,tt as l}from"./Cxg9uTOd.js";var u=s(`<p><strong>Distances are approximate.</strong> The law measures from the center of the nearest entrance
	of one building to the center of the nearest entrance of the other. SLAM cannot measure door to door:
	it has no entrance locations. It measures a straight line between approximate building points, from
	the City's address search or from each dataset's own map point.<!></p>`);function d(s,d){let f=c(d,`compact`,3,!1);var p=u();let m;var h=r(i(p),2),g=t=>{var r=e();r.nodeValue=` Those points can sit
	away from the door, so a SLAM distance can differ from an entrance-to-entrance measurement by tens
	of feet or more, especially for large or corner buildings. Treat a distance near a limit as close,
	not as over or under it.`,n(t,r)};a(h,e=>{f()||e(g)}),l(p),t(()=>m=o(p,1,`distance-note svelte-1kfme54`,null,m,{compact:f()})),n(s,p)}export{d as t};