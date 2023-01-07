<script>
  import { getContext } from 'svelte'
  import carto from "@carto/carto.js";
  import { layers, info } from '../../stores'
  import { carto_apikey } from '../../utils/keys'

  const { getMap, getCartoClient, getPopup } = getContext(carto_apikey)
  const map = getMap()
  const client = getCartoClient()
  const popup = getPopup()

  //query sidewalk café data source from Carto and stack multiple entries at the same location:
  const source = new carto.source.SQL(`
          SELECT * FROM sidewalk_caf_licenses_and_applications
  `)

  //Style the sidewalk café data and color inactive licenses differently
  const style = new carto.style.CartoCSS(`
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
  				`)
  const layer = new carto.layer.Layer(source, style, {
    featureOverColumns: [
      'license_nbr',
      'lic_status',
      'business_name',
      'business_name2',
      'building',
      'street',
      'swc_type',
      'swc_sq_ft',
      'swc_tables',
      'swc_chairs',
      'community_district',
      'expiration_date',
      'issuance',
      'issuance_dd',
      'cb',
      'cb_dd',
      'app_id',
      'app_swc_type',
      'app_sq_ft',
      'app_tables',
      'app_chairs',
      'intake_dd'
    ]
  })

  client
    .addLayer(layer)
    .then(() => {
      //add layer to state
      layers.add({
        order: 4,
        ref: layer,
        label: 'Sidewalk Café Licenses',
        legend: [
          {
            image:
              'https://s3.amazonaws.com/com.cartodb.users-assets.production/production/betanyc/assets/20180629210223picnic-site-15.svg',
            text: 'Active'
          },
          {
            image:
              'https://s3.amazonaws.com/com.cartodb.users-assets.production/production/betanyc/assets/20180629210143picnic-site-15.svg',
            text: 'Inactive'
          }
        ],
        checked: false
      })
    })
    .catch(error => console.log(error.message))

  //set pop-up content when hovering over a feature
  layer.on('featureOver', featureEvent => {
    let address = ''

    address += `<div class="widget">`

    address += `<p class = "bold">${featureEvent.data.building} ${featureEvent.data.street}</p><p>${featureEvent.data.business_name2}</p><p>${featureEvent.data.business_name}</p>`
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

    //variables to check whether the license is under review or expired
    let under_review = false
    let expired = false

    //check whether the selected sidewalk café permit is expired or under review
    if (
      featureEvent.data.issuance == 'Pending Review' &&
      featureEvent.data.lic_status == 'Inactive'
    ) {
      under_review = true
      expired = false
    } else if (
      featureEvent.data.issuance == 'Issued' &&
      featureEvent.data.lic_status == 'Inactive'
    ) {
      under_review = false
      expired = true
    }

    content += `<h3 class = "bold">${featureEvent.data.business_name2}</h3>
				<h4 class = "bold">${featureEvent.data.business_name}</h4>
				<h4>${featureEvent.data.building} ${featureEvent.data.street}</h4><div class="separator"></div>`

    //set content if under review
    if (under_review == true) {
      content += `<h5 class = "lighter">${featureEvent.data.issuance}</h5>
					 <h5 class = "lighter">Application ID: ${featureEvent.data.app_id}</h5>
					 <h5 class = "lighter">Application Type: ${featureEvent.data.app_swc_type}</h5>
					 <h5 class = "lighter">Application Square footage: ${featureEvent.data.app_sq_ft}</h5>
					 <h5 class = "lighter">Application Tables: ${featureEvent.data.app_tables}</h5>
					 <h5 class = "lighter">Application Chairs: ${featureEvent.data.app_chairs}</h5>
					 <h5 class = "lighter">Application Intake Date: ${featureEvent.data.intake_dd}</h5>
					 <h5><a href="https://www1.nyc.gov/assets/dca/SidewalkCafeMap/index.html#home" target="_blank">Click here for more information about this sidewalk cafe.</h5>`
    }

    //set content if expired
    else if (expired == true) {
      content += `<h5 class = "lighter">Status: ${featureEvent.data.lic_status}</h5>
					 <h5 class = "lighter">License Number: ${featureEvent.data.license_nbr}</h5>
					 <h5 class = "lighter">Issuance Date: ${featureEvent.data.issuance_dd}</h5>
					 <h5 class = "lighter">Expiration Date: ${featureEvent.data.expiration_date}</h5>`
    }

    //set content is active
    else
      content += `<h5 class = "lighter">Status: ${featureEvent.data.lic_status}</h5>
					 <h5 class = "lighter">License Number: ${featureEvent.data.license_nbr}</h5>
					 <h5 class = "lighter">Type: ${featureEvent.data.swc_type}</h5>
					 <h5 class = "lighter">Square footage: ${featureEvent.data.swc_sq_ft}</h5>
					 <h5 class = "lighter">Tables: ${featureEvent.data.swc_tables}</h5>
					 <h5 class = "lighter">Chairs: ${featureEvent.data.swc_chairs}</h5>
					 <h5 class = "lighter">Issuance Date: ${featureEvent.data.issuance_dd}</h5>
					 <h5 class = "lighter">Expiration Date: ${featureEvent.data.expiration_date}</h5>
					 <div class="separator"></div>
					 <h5 class = "lighter">Community Board: ${featureEvent.data.community_district}</h5>
					 <h5 class = "lighter">Community Board Review Status: ${featureEvent.data.cb}</h5>
					 <h5 class = "lighter">Community Board Review Status Date: ${featureEvent.data.cb_dd}</h5>
					 <h5><a href="https://www1.nyc.gov/assets/dca/SidewalkCafeMap/index.html#home" target="_blank">Click here for more information about this sidewalk cafe.</h5>
					 `

    //add source information
    source += `<div class="separator"></div><h6>Source: <a href='https://data.cityofnewyork.us/Business/Sidewalk-Caf-Licenses-and-Applications/qcdj-rwhu/data'>Sidewalk Cafe Licenses and Applications.</a></h6><h6>Data is updated weekly.</h6>`

    //fill the innerHTML of each section
    info.show({
      content,
      source,
      charts: []
    })
  })

  client.getLeafletLayer().addTo(map)
</script>
