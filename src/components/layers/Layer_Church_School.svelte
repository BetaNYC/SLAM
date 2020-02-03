<script>
  import { getContext } from 'svelte'
  import { layers } from '../../stores'
  import { carto_apikey } from '../../utils/keys'

  const { getMap, getCartoClient, getPopup } = getContext(carto_apikey)
  const map = getMap()
  const client = getCartoClient()
  const popup = getPopup()

  const source = new carto.source.SQL(`SELECT cartodb_id, the_geom_webmercator, address, bldgclass FROM bkmappluto WHERE bldgclass = 'W1' OR bldgclass = 'W2' OR bldgclass = 'W3' OR bldgclass = 'M1' OR bldgclass = 'M2' OR bldgclass = 'M3' OR bldgclass = 'M4' OR bldgclass = 'M9' UNION SELECT cartodb_id, the_geom_webmercator, address, bldgclass FROM bxmappluto WHERE bldgclass = 'W1' OR bldgclass = 'W2' OR bldgclass = 'W3' OR bldgclass = 'M1' OR bldgclass = 'M2' OR bldgclass = 'M3' OR bldgclass = 'M4' OR bldgclass = 'M9' UNION SELECT cartodb_id, the_geom_webmercator, address, bldgclass FROM mnmappluto WHERE bldgclass = 'W1' OR bldgclass = 'W2' OR bldgclass = 'W3' OR bldgclass = 'M1' OR bldgclass = 'M2' OR bldgclass = 'M3' OR bldgclass = 'M4' OR bldgclass = 'M9' UNION SELECT cartodb_id, the_geom_webmercator, address, bldgclass FROM simappluto WHERE bldgclass = 'W1' OR bldgclass = 'W2' OR bldgclass = 'W3' OR bldgclass = 'M1' OR bldgclass = 'M2' OR bldgclass = 'M3' OR bldgclass = 'M4' OR bldgclass = 'M9' UNION SELECT cartodb_id, the_geom_webmercator, address, bldgclass FROM qnmappluto WHERE bldgclass = 'W1' OR bldgclass = 'W2' OR bldgclass = 'W3' OR bldgclass = 'M1' OR bldgclass = 'M2' OR bldgclass = 'M3' OR bldgclass = 'M4' OR bldgclass = 'M9'
            `)

  //Style the school and church shapes
  const style = new carto.style.CartoCSS(`
					#layer{
						polygon-fill: #12eda4;
					}
				`)
  const layer = new carto.layer.Layer(source, style, {
    featureOverColumns: ['address', 'bldgclass']
  })
  client
    .addLayer(layer)
    .then(() => {
      //add layer to state
      layers.add({
        order: 5,
        ref: layer,
        label: 'Show Schools and Churches',
        checked: false
      })
    })
    .catch(error => console.log(error.message))

  //set pop-up content when hovering over a feature
  layer.on('featureOver', featureEvent => {
    let church_school_popup_content = ''
    let building_type = ''

    church_school_popup_content += `<div class="widget">`
    if (featureEvent.data.bldgclass == 'W1') {
      building_type = 'Public Elementary, Junior, or Senior High'
    } else if (featureEvent.data.bldgclass == 'W2') {
      building_type = 'Parochial School, Yeshiva'
    } else if (featureEvent.data.bldgclass == 'W3') {
      building_type = 'School or Academy'
    } else if (featureEvent.data.bldgclass == 'M1') {
      building_type = 'Church, Synagogue, Chapel'
    } else if (featureEvent.data.bldgclass == 'M2') {
      building_type = 'Mission House (non-residential)'
    } else if (featureEvent.data.bldgclass == 'M3') {
      building_type = 'Parsonage, Rectory'
    } else if (featureEvent.data.bldgclass == 'M4') {
      building_type = 'Convent'
    } else if (featureEvent.data.bldgclass == 'M9') {
      building_type = 'Miscellaneous Religious Facility'
    }
    church_school_popup_content += `<p>Address: ${featureEvent.data.address}</p><p>DCP Building Class: ${building_type}</p>`
    popup.setContent(church_school_popup_content)
    popup.setLatLng(featureEvent.latLng)
    if (!popup.isOpen()) {
      popup.openOn(map)
    }
  })

  client.getLeafletLayer().addTo(map)
</script>
