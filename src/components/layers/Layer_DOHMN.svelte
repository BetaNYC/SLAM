<script>
  import { getContext } from 'svelte'
  import { layers, info } from '../../stores'
  import { carto_apikey } from '../../utils/keys'

  const { getMap, getCartoClient, getPopup } = getContext(carto_apikey)
  const map = getMap()
  const client = getCartoClient()
  const popup = getPopup()

  //query health inspection data source from Carto and stack multiple entries at the same location:
  const source = new carto.source.SQL(`WITH
  		m AS (
  			SELECT array_agg(cartodb_id) id_list, the_geom_webmercator, ST_Y(the_geom_webmercator) y
  			FROM dohmh_inspections
  			GROUP BY the_geom_webmercator
  			ORDER BY y DESC),
  		f AS (
  			SELECT  generate_series(1, array_length(id_list,1)) p, unnest(id_list) cartodb_id, the_geom_webmercator
  			FROM m)
  		SELECT  ST_Translate(f.the_geom_webmercator,0,f.p*5) the_geom_webmercator, f.cartodb_id, q.camis, q.dba, q.building, q.street
  			FROM f, dohmh_inspections q
  			WHERE f.cartodb_id = q.cartodb_id
            `)

  //Style the health inspection data
  const style = new carto.style.CartoCSS(`
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

                `)

  const layer = new carto.layer.Layer(source, style, {
    featureOverColumns: ['camis', 'dba', 'building', 'street']
  })

  client
    .addLayer(layer)
    .then(() => {
      //add layer to state
      layers.add({
        order: 5,
        ref: layer,
        label: 'Restaurant Health Grades',
        legend: [
          {
            image:
              'https://s3.amazonaws.com/com.cartodb.users-assets.production/production/betanyc/assets/20180629205921embassy-15.svg',
            text: 'Restaurant'
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

    address += `<p class = "bold">${featureEvent.data.building} ${featureEvent.data.street}</p><p>${featureEvent.data.dba}</p>`
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

    content += `<h3 class = "bold">${featureEvent.data.dba}</h3><h4>${featureEvent.data.building} ${featureEvent.data.street}</h4><div class="separator"></div>`

    //query restaurant health inspection results dataset (stored in carto) to collect all of the inspection data about the selected restaurant; order from the most recent inspection to the oldest inspection
    var url = `https://betanyc.carto.com/api/v2/sql/?q=SELECT * FROM camis_grade_not_null WHERE camis='${featureEvent.data.camis}' ORDER BY to_timestamp(grade_date, 'MM/DD/YYYY') DESC&api_key=${carto_apikey}`

    fetch(url)
      .then(function(response) {
        return response.json()
      })
      .then(function(camis_data) {
        //show the date and grade of the most recent inspection
        if (camis_data.rows.length != 0) {
          content += `
						<h5 class = "lighter">Most Recent Grade: ${camis_data.rows[0].grade}</h5>
						<h5 class = "lighter">Grade Date: ${camis_data.rows[0].grade_date}</h5>`
        }

        //DOHMH data has a different row for every flag raised in an inspection for every restaurant in the city. This means that for a given inspection, resulting in one grade, the restaurant may have several rows in the dataset, each having the same grade date and grade, but listing different flags that were raised. To deal with, we need to group the data about the inspection results for a restaurant by its grade date, and store the data in an array. Then we can loop through that array and select the first grade for each grade date. (every grade will be the same on a given grade date, so it doesn't necessarily have to be the first element. But we don't know how many rows there will be for each grade date, so the first element is safest.
        Array.prototype.groupBy = function(prop) {
          return this.reduce(function(groups, item) {
            const val = item[prop]
            groups[val] = groups[val] || []
            groups[val].push(item)
            return groups
          }, {})
        }
        var grade_history = camis_data.rows.groupBy('grade_date')

        content += `<div class="separator"></div><h5 class = "bold">Grade History</h5>`
        //show the first grade for each grade date in the array; (they should all be the same)
        for (var i = 0; i < Object.keys(grade_history).length; i++) {
          var key = Object.keys(grade_history)[i]
          var values = Object.values(grade_history)[i]
          if (key != '') {
            content += `<h5 class = "lighter"> ${key}: ${values[0].grade}</h5>`
          }
        }

        if (featureEvent.data.camis) {
          content += `<h5><a href="https://a816-health.nyc.gov/ABCEatsRestaurants/#/Search/${featureEvent.data.camis}" target="_blank">Click here for more information about this restaurant.</h5> `
        } else {
          content += `<h5><a href="https://a816-health.nyc.gov/ABCEatsRestaurants/#/Search" target="_blank">Click here for more information about this restaurant.</h5> `
        }

        //add source information
        source += `<div class="separator"></div><h6>Source: <a href='https://data.cityofnewyork.us/Health/DOHMH-New-York-City-Restaurant-Inspection-Results/43nn-pn8j/data'>DOHMH New York City Restaurant Inspection Results.</a></h6><h6>Data is geocoded with the Department of City Plannings GeoSupport application once a week. The map does not display restaurants with addresses rejected by the application. Data is updated weekly.</h6>`

        info.show({
          content,
          source,
          charts: []
        })
      })
  })

  client.getLeafletLayer().addTo(map)
</script>
