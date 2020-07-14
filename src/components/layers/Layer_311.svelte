<script>
  import { getContext } from 'svelte'
  import { layers, info } from '../../stores'
  import { carto_apikey } from '../../utils/keys'
  import LabelsPlugin from '../../utils/labelsPlugin'

  const { getMap, getCartoClient, getPopup } = getContext(carto_apikey)
  const map = getMap()
  const client = getCartoClient()
  const popup = getPopup()

  //query 311 data source from Carto and stack multiple entries at the same location:
  const source = new carto.source.SQL(`WITH
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
    `)

  //Style the 311 data and color different complaint tyles differently
  const style = new carto.style.CartoCSS(`
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

            `)

  const layer = new carto.layer.Layer(source, style, {
    featureOverColumns: [
      'geometry',
      'incident_address',
      'intersection_street_1',
      'intersection_street_2',
      'created_date',
      'descriptor',
      'complaint_type'
    ]
  })

  client
    .addLayer(layer)
    .then(() => {
      //add layer to state
      layers.add({
        order: 2,
        ref: layer,
        label: '311 Complaints - Noise/ Drinking',
        notes: '*Filtered to those made at club/bar/restaurant (Since January 1, 2019)',
        legend: [
          {
            image:
              'https://s3.amazonaws.com/com.cartodb.users-assets.production/production/betanyc/assets/20180629210011circle-11.svg',
            text: 'Noise'
          },
          {
            image:
              'https://s3.amazonaws.com/com.cartodb.users-assets.production/production/betanyc/assets/20180629210053circle-11.svg',
            text: 'Drinking'
          }
        ],
        checked: false
      })
    })
    .catch(error => console.log(error.message))

  //set pop-up content when hovering over a feature
  layer.on('featureOver', featureEvent => {
    let dateDescriptor = ''

    dateDescriptor += `<div class="widget">`
    //check if there is an incident address listed; if not concatenate the data in fields intersection1 and intersection2 to create an address
    if (featureEvent.data.incident_address != '')
      dateDescriptor += `<p class = "bold">${featureEvent.data.incident_address}</p>`
    else
      dateDescriptor += `<p class = "bold">${featureEvent.data.intersection_street_1}, ${featureEvent.data.intersection_street_2}</p>`
    dateDescriptor += `<p>Complaint Type: ${featureEvent.data.complaint_type}</p><p>Descriptor: ${featureEvent.data.descriptor}</p><p>Date: ${featureEvent.data.created_date}</p>`
    popup.setContent(dateDescriptor)
    popup.setLatLng(featureEvent.latLng)
    if (!popup.isOpen()) {
      popup.openOn(map)
    }
  })

  layer.on('featureClicked', featureEvent => {
    let descriptor_chart
    let year_chart

    //variables for the innerHTML content that will be filled into each div in the infobox
    let content = ''
    let source = ''

    //variables to store the descriptors of complaints and number of complaints in that descriptor for the selected location
    let descriptor_arr = {}
    let descriptor_labels = []
    let descriptor_data = []
    let descriptor_colors = []

    //variables to store the years of complaints and number of complaints in that year for the selected location
    let year_arr = {}
    let year_labels = []
    let year_data = []
    let year_colors = []

    //query 311 complaint data made about bar/club/restaurant since 2017 (stored in carto) at the selected location; select, complaint type, descriptor, and year
    const url = `https://betanyc.carto.com/api/v2/sql/?q=SELECT cartodb_id, descriptor, created_date, EXTRACT(year from to_date(created_date, 'MM/DD/YYYY')) AS created_year FROM club_bar_restaurant_complaints_since_jan_1_2017 WHERE location='${featureEvent.data.geometry}'&api_key=${carto_apikey}`

    //variable to count complaints
    let complaints_count = 0

    fetch(url)
      .then(function(response) {
        return response.json()
      })
      .then(function(geom_data) {
        complaints_count = geom_data.rows.length

        //if there is an incident address listed in the dataset at that location list it; otherwise concatenate the strings in intersection1 and intersection2 of the dataset
        if (featureEvent.data.incident_address != '') {
          content += `<h4 class = "bold">${featureEvent.data.incident_address}</h4>`
        } else {
          content += `<h4 class = "bold">${featureEvent.data.intersection_street_1}, ${featureEvent.data.intersection_street_2}</h4>`
        }

        // list total number of complaints
        content += `<div class="separator"></div><h5 class = "lighter">Total Number of Complaints: ${complaints_count}</h5>`

        //store unique descriptors in the resulting data in an array and count the number of complaints for each of those descriptors
        for (var i = 0; i < complaints_count; i++) {
          descriptor_arr[geom_data.rows[i].descriptor] =
            1 + (descriptor_arr[geom_data.rows[i].descriptor] || 0)
        }

        descriptor_labels = Object.keys(descriptor_arr)
        descriptor_data = Object.values(descriptor_arr)

        //assign random colors to each descriptor
        for (var i = 0; i < descriptor_labels.length; i++) {
          descriptor_colors.push(
            '#' + (Math.random().toString(16) + '0000000').slice(2, 8)
          )
        }

        //create pie chart of descriptors
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')

        descriptor_chart = new Chart(ctx, {
          type: 'pie',
          data: {
            labels: descriptor_labels,
            datasets: [
              {
                backgroundColor: descriptor_colors,
                data: descriptor_data
              }
            ]
          },
          options: {
            title: {
              display: true,
              text: 'Complaints by Descriptor'
            },
            legend: {
              display: true,
              labels: {
                fontSize: 10
              },
              position: 'right',
              onClick: null,
              fullWidth: true
            }
          }
        })

        //store unique years in the resulting data in an array and count the number of complaints for each of those years
        for (var i = 0; i < complaints_count; i++) {
          year_arr[geom_data.rows[i].created_year] =
            1 + (year_arr[geom_data.rows[i].created_year] || 0)
        }

        year_labels = Object.keys(year_arr)
        year_data = Object.values(year_arr)

        //assign random colors to each year
        for (var i = 0; i < year_labels.length; i++) {
          year_colors.push(
            '#' + (Math.random().toString(16) + '0000000').slice(2, 8)
          )
        }

        //create bar chart of complaints per year
        const canvas2 = document.createElement('canvas')
        const ctx2 = canvas2.getContext('2d')
        year_chart = new Chart(ctx2, {
          type: 'line',
          plugins: LabelsPlugin,
          data: {
            labels: year_labels,
            datasets: [
              {
                borderColor: '#4d88ee',
                data: year_data
              }
            ]
          },
          options: {
            legend: {
              display: false
            },
            scales: {
              yAxes: [
                {
                  ticks: {
                    beginAtZero: true,
                    fontSize: 10
                  },
                  display: true,
                  scaleLabel: {
                    display: true,
                    labelString: '# of Complaints',
                    fontSize: 10
                  }
                }
              ],
              xAxes: [
                {
                  ticks: {
                    fontSize: 10
                  },
                  display: true,
                  scaleLabel: {
                    display: true,
                    labelString: 'Year',
                    fontSize: 10
                  }
                }
              ]
            },
            title: {
              display: true,
              text: 'Complaints by Year'
            }
          }
        })

        //add source information
        source += `<div class="separator"></div><h6>Source: <a href='https://data.cityofnewyork.us/Social-Services/311-Service-Requests-from-2010-to-Present/erm2-nwe9/data'>311 Service Requests from 2010 to Present</a></h6><h6>Data was filtered to complaints at a club/restaurant/bar made since January 1, 2019. Data is updated daily.</h6>`

        //fill the innerHTML of each section
        info.show({
          content,
          source,
          charts: [canvas, canvas2]
        })
      })
  })

  client.getLeafletLayer().addTo(map)
</script>
