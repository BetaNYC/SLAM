//Map Zooms and Fits
function set_address() {
	//Use the City's Geoclient API to search for an address
	var select = document.getElementById("boro");
	var boro = select.options[select.selectedIndex].value;
	var adr = document.getElementById("address").value;

	//adds CORS header to proxy request getting around errors
	const proxyurl = "https://cors-anywhere.herokuapp.com/";

	//query the City's geoclient API
	var url = "https://api.cityofnewyork.us/geoclient/v1/search.json?input=" + " " + adr + " " + boro + "&app_id=dd37f663&app_key=c99663c5e8b11315279f8d28ef245dab";

	fetch(proxyurl + url, {mode: 'cors'})
	.then(function(response) {
		return response.json();
	})
	.then(function(address) {
		document.getElementById('no_results').style.display = 'none';
		results = address.results;
		response = results[0].response;
		latitude = response.latitude;
		longitude = response.longitude;
		//set map view to the resulting lat, lon and zoom to 18
		map.setView([latitude, longitude], 18);
	})
	.catch(function(error) {
		//if nothing gets returned, display no results
		document.getElementById('no_results').style.display = 'block';
	});
}

//Toggle Layers and Visibility
function show_311(){
	if (document.getElementById("311").checked) {
		layer_311.show();
	}
	else
		layer_311.hide();
}

function show_sla(){
	if (document.getElementById("sla").checked) {
		layer_sla.show();
	}
	else
		layer_sla.hide();
}

function show_swc(){
	if (document.getElementById("swc").checked) {
		layer_swc.show();
	}
	else
		layer_swc.hide();
}

function show_dohmh(){
	if (document.getElementById("dohmh").checked) {
		layer_dohmh.show();
	}
	else
		layer_dohmh.hide();
}

function show_church_school(){
	if (document.getElementById("church_school").checked) {
		layer_church_school.show();
	}
	else
		layer_church_school.hide();
}

function toggle_visibility(id) {
	//toggle the visibility of a selected element
	var e = document.getElementById(id);
	if(e.style.display == 'block')
		e.style.display = 'none';
	else
		e.style.display = 'block';
}

function show_info_box() {
	if (document.getElementById('info_box').style.display = 'none')
		document.getElementById('info_box').style.display = 'block';
}

//Charts
function clear_charts() {
	//clear descriptor charts so that they don't appear as white boxes in the info-box
	if (typeof descriptor_chart !== 'undefined'){
		descriptor_chart.clear();
		document.getElementById("descriptor_chart_element").style.display = 'none';
	}
	if (typeof year_chart !== 'undefined'){
		year_chart.clear();
		document.getElementById("year_chart_element").style.display = 'none';
	}
}
