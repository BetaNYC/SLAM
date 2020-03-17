<script>
  import { getContext } from 'svelte'
  import { layers, info } from '../../stores'
  import { carto_apikey, geoclient_id, geoclient_key } from '../../utils/keys'
  1
  const { getMap, getCartoClient, getPopup } = getContext(carto_apikey)
  const map = getMap()
  const client = getCartoClient()
  const popup = getPopup()

  //get current day, month, and year
  const dateObj = new Date()
  const current_day = dateObj.getUTCDate()
  const current_month = dateObj.getUTCMonth()
  const current_year = dateObj.getUTCFullYear()
  const current_epoch =
    Date.UTC(current_year, current_month, current_day).valueOf() / 1000 // calcuate the epoch seconds for the day at 12am
  const current_string = `${current_month + 1}/${current_day}/${current_year}`

  //query SLA data source from Carto and stack multiple entries at the same location
  const source = new carto.source.SQL(`
		WITH
			g AS (
				SELECT cartodb_id, ST_Transform(the_geom,3857) AS the_geom_webmercator
				FROM geo_export_405f711a_995d_4c50_a145_24abf07113a1 WHERE the_geom IS NOT NULL AND county IN ('NEW YORK','BRONX','KINGS','QUEENS','RICHMOND') AND license_ty in ('OP','SW','SB','SL','VL','RL','HL','CL','CT','EL','TL','CR','RW','HW','CW','TW','WC','EB','MR')
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
      SELECT ST_Translate(f.the_geom_webmercator,0,f.p*5) AS the_geom_webmercator, q.cartodb_id, premise_na, dba, license_ty, to_char(date_lic_2, 'MM/DD/YYYY') as license_issued_date, to_char(date_licen, 'MM/DD/YYYY') as license_expiration_date, serial_num, certificat, premise_ad, premise_zi,
        method_of_, days_hours,
        EXTRACT(epoch from date_licen) AS expiration_epoch
				FROM f, geo_export_405f711a_995d_4c50_a145_24abf07113a1 q
				WHERE f.cartodb_id = q.cartodb_id
        `)

  //Style the SLA data and color differently if expiring this year
  const style = new carto.style.CartoCSS(`
        #layer {
            marker-width: 20;
            marker-fill-opacity: 0.9;
            marker-file: url('https://s3.amazonaws.com/com.cartodb.users-assets.production/maki-icons/bar-18.svg');
            marker-allow-overlap: true;
            marker-line-width: 1;
            marker-line-color: #ffffff;
            marker-line-opacity: 1;
        }
        #layer {
          [expiration_epoch <= ${current_epoch}] {
            marker-fill: #e10012;
          }
          [expiration_epoch > ${current_epoch}]{
            marker-fill: #e34dee;
          }
        }
        #layer [zoom > 16] {
            marker-width: 20;
        }
        #layer [zoom <=16] {
            marker-width: 15;
        }
        #layer [zoom <=15] {
            marker-width: 13;
        }
        #layer [zoom <=14] {
            marker-width: 8;
        }
        #layer [zoom <=12] {
            marker-width: 4;
        }
    `)

  const layer = new carto.layer.Layer(source, style, {
    featureClickColumns: [
      'premise_na',
      'dba', // doing_business_as_dba_
      'serial_num',
      'license_ty', // license_type_name, TODO - lookup
      'license_issued_date', //license_original_issue_date does not exist, remove references; exist as license_effective_date
      'license_expiration_date',
      'certificat',
      'premise_ad', //actual_address_of_premises_address1_, TODO - combine address part 2
      'premise_zi', //'zip'
      'method_of_',
      'days_hours'
    ]
  })

  client
    .addLayer(layer)
    .then(() => {
      //add layer to state
      layers.add({
        order: 1,
        ref: layer,
        label: 'State Liquor Authority Licenses',
        legend: [
          {
            image:
              'https://s3.amazonaws.com/com.cartodb.users-assets.production/production/betanyc/assets/20180629205705bar-15.svg',
            text: `Expiring after ${current_string}`
          },
          {
            image:
              'https://s3.amazonaws.com/com.cartodb.users-assets.production/production/betanyc/assets/20180629205836bar-15.svg',
            text: 'Expired'
          }
        ],
        checked: true
      })
    })
    .catch(error => console.log(error.message))

  //set pop-up content when hovering over a feature
  layer.on('featureOver', featureEvent => {
    let address = ''

    address += `<div class="widget">`

    address += `<p class = "bold">${featureEvent.data.premise_ad}</p><p>${featureEvent.data.dba}</p><p>${featureEvent.data.premise_na}</p>`
    popup.setContent(address)
    popup.setLatLng(featureEvent.latLng)
    if (!popup.isOpen()) {
      popup.openOn(map)
    }
  })

  layer.on('featureClicked', featureEvent => {
    //variables for the innerHTML content that will be filled into each div in the infobox
    let content = ''
    let source = ''

    //variable to store BIN from city geoclient
    var bin = 0
    //check if dba is filled in; otherwise use premises name as the header
    if (featureEvent.data.doing_business_as_dba !== '') {
      content += `<h3 class = "bold">${featureEvent.data.dba}</h3><h4 class = "bold">${featureEvent.data.premise_na}</h4>`
    } else {
      content += `<h3 class = "bold">${featureEvent.data.premise_na}</h3>`
    }
    content += `<h4>${featureEvent.data.premise_ad}</h4><div class="separator"></div>
				<h5 class = "lighter">License Type: ${featureEvent.data.license_ty}</h5>
				<h5 class = "lighter">Serial number: ${featureEvent.data.serial_num}</h5>
				<h5 class = "lighter">Effective Date: ${featureEvent.data.license_issued_date}</h5>
        <h5 class = "lighter">Expiration Date: ${featureEvent.data.license_expiration_date}</h5>
        <h5 class = "lighter">Method of Operation: ${featureEvent.data.method_of_}</h5>
        <h5 class = "lighter">Days/Hours of Operation: ${featureEvent.data.days_hours}</h5>
				<h5 class = "lighter"><a href= 'https://www.tran.sla.ny.gov/servlet/ApplicationServlet?pageName=com.ibm.nysla.data.publicquery.PublicQuerySuccessfulResultsPage&validated=true&serialNumber=${featureEvent.data.serial_num}&licenseType=${featureEvent.data.license_ty}' target = '_blank'>Click here for more information about this license.</a></h5>`

    //adds CORS header to proxy request getting around errors
    const proxyurl = 'https://cors-anywhere.herokuapp.com/'

    //Query the city's Geoclient API to get the BIN of the building at the address listed in the SLA data. we will use this to collect the Certificate of Occupancy
    var url = `https://api.cityofnewyork.us/geoclient/v1/search.json?input=${featureEvent.data.premise_ad} ${featureEvent.data.premise_zi}&app_id=${geoclient_id}&app_key=${geoclient_key}`

    var slaBIN = new Promise(function(resolve) {
      fetch(proxyurl + url)
        .then(function(response) {
          return response.json()
        })
        .then(function(address) {
          const results = address.results
          const response = results[0].response
          resolve(response.buildingIdentificationNumber)
        })
        .catch(function(error) {
          resolve(0)
        })
    })

    slaBIN.then(bin => {
      if (bin === 0) {
        content += `<div class="separator"></div><h4>Certificate of Occupancy</h4>><h5 class = "lighter">No BIN Found.</h5>`
      }
      //display a link to BISweb for the Certificate of Occupancy at that BIN
      else {
        const certURL = `http://a810-bisweb.nyc.gov/bisweb/COsByLocationServlet?requestid=1&allbin=${bin}`
        content += `<div class="separator"></div><h4>Certificate of Occupancy</h4><h5 class = "lighter">BIN: <a href= '${certURL}' target = '_blank'>${bin}</a></h5>`
      }

      //add source information
      source += `<div class="separator"></div><h6>Source: <a href='https://data.ny.gov/Economic-Development/Liquor-Authority-Quarterly-List-of-Active-Licenses/hrvs-fxs2'>Liquor Authority Quarterly List of Active Licenses.</a></h6><h6>Data is filtered to liquor licenses reviewed by the New York City Agency Office. Data is updated quarterly.</h6>`
      //set the info_box to display as block

      info.show({
        content,
        source,
        charts: []
      })
    })
  })

  client.getLeafletLayer().addTo(map)
</script>
