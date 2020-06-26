<script>
    import { getContext } from 'svelte'
    import { layers, info } from '../../stores'
    import { carto_apikey } from '../../utils/keys'

    const { getMap, getCartoClient, getPopup } = getContext(carto_apikey)
    const map = getMap()
    const client = getCartoClient()
    const popup = getPopup()

    //query sidewalk café data source from Carto and stack multiple entries at the same location:
    const source = new carto.source.SQL(`
          SELECT * FROM nyc_open_restaurants_application_v2_6
  `)

    //Style the sidewalk café data and color inactive licenses differently
    const style = new carto.style.CartoCSS(`
  				#layer {
  				marker-width: 18;
  				marker-fill-opacity: 0.9;
  				marker-file: url('https://s3.amazonaws.com/com.cartodb.users-assets.production/production/betanyc/assets/20180612173650picnic-site-15.svg');
  				marker-allow-overlap: true;
  				marker-line-width: 0.25;
  				marker-line-color: #FFFFFF;
  				marker-line-opacity: 1;
  				}
  				#layer [zoom > 16]{
  					marker-width: 18;
  				}
  				#layer [zoom <= 16]{
  				marker-width: 14;
  				}
  				#layer [zoom <= 15]{
  				marker-width: 12;
  				}
  				#layer [zoom <= 14]{
  				marker-width: 6;
  				}
  				#layer [zoom <= 12]{
  				marker-width: 3;
  				}
  				#layer {
            [alcohol = 'yes']{
                marker-fill: #804F40;
                }
            [alcohol = 'no']{
                marker-fill: #4dc1bb;
            }
          }
  				`)
    const layer = new carto.layer.Layer(source, style, {
        featureOverColumns: [
            'bizaddress',
            'restaurantname',
            'qualify_sidewalk',
            'qualify_roadway',
            'alcohol',
            'submissiontime'
        ]
    })

    client
            .addLayer(layer)
            .then(() => {
                //add layer to state
                layers.add({
                    order: 2,
                    ref: layer,
                    label: 'Open Restaurants (self-certified)',
                    legend: [
                        {
                            image: './images/alcohol.svg',
                            text: 'Alcohol Service'
                        },
                        {
                            image: './images/no_alcohol.svg',
                            text: 'No Alcohol Service'
                        }
                    ],
                    checked: true
                })
            })
            .catch(error => console.log(error.message))

    //set pop-up content when hovering over a feature
    layer.on('featureOver', featureEvent => {
        const {bizaddress, restaurantname} = featureEvent.data

        let address = `
            <div class="widget">
                <p class = "bold">${bizaddress}</p>
                <p>${restaurantname}</p>
            </div>
        `
        popup.setContent(address)
        popup.setLatLng(featureEvent.latLng)
        if (!popup.isOpen()) {
            popup.openOn(map)
        }
    })

    layer.on('featureClicked', featureEvent => {
        //variables for the innerHTML content that will be filled into each div in the infobox
        const {bizaddress, restaurantname, qualify_sidewalk, qualify_roadway, alcohol, submissiontime} = featureEvent.data
        const time = new Date(Number(submissiontime))

        let content =  `
            <div class="widget">
                <p class = "bold">${bizaddress}</p>
                <p>${restaurantname}</p>
                <p>Submission Date: ${time.toLocaleDateString()}<p/>
                <div class="tags-group">
                     <div class="tags has-addons">
                        <p class="tag">Sidewalk</p><p class="tag ${qualify_sidewalk === 'yes'? 'success': ''}">${qualify_sidewalk}</p>
                    </div>
                    <div class="tags has-addons">
                        <p class="tag">Roadway</p><p class="tag ${qualify_roadway === 'yes'? 'success': ''}">${qualify_roadway}</p>
                    </div>
                    <div class="tags has-addons">
                        <p class="tag">Alcohol</p><p class="tag ${alcohol === 'yes'? 'success': ''}">${alcohol}</p>
                    </div>
                </div>
            </div>
        `
        let source = `
            <div class="separator"></div>
            <h6>Source: <a target="_blank" ref='http://nycopenrestaurants.info'>Open Restaurant Map & Dashboard.</a></h6>
            <h6>Data is updated hourly. Note: This data is <strong>self-certified responses</strong>.</h6>
        `


        //fill the innerHTML of each section
        info.show({
            content,
            source,
            charts: []
        })
    })

    client.getLeafletLayer().addTo(map)
</script>
