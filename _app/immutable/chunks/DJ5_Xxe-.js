import{E as e,G as t,H as n,O as r,et as i,f as a,k as o,t as s,y as c,z as l}from"./BWVWrcqi.js";var u=r(`<p><strong>Distances are approximate.</strong> The law measures from the center of the nearest entrance
	of one building to the center of the nearest entrance of the other. SLAM cannot measure door to door:
	it has no entrance locations. It measures a straight line between approximate building points, from
	the City's address search or from each dataset's own map point.<!></p>`);function d(r,d){let f=s(d,`compact`,3,!1);var p=u();let m;var h=t(n(p),2),g=t=>{var n=o();n.nodeValue=` Those points can sit
	away from the door, so a SLAM distance can differ from an entrance-to-entrance measurement by tens
	of feet or more, especially for large or corner buildings. Treat a distance near a limit as close,
	not as over or under it.`,e(t,n)};c(h,e=>{f()||e(g)}),i(p),l(()=>m=a(p,1,`distance-note svelte-1kfme54`,null,m,{compact:f()})),e(r,p)}export{d as t};