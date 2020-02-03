<script>
  import { getContext } from 'svelte'
  import { layers, info } from '../../stores'
  import { carto_apikey } from '../../utils/keys'

  const { getMap, getCartoClient, getPopup } = getContext(carto_apikey)
  const map = getMap()
  const client = getCartoClient()
  const popup = getPopup()

  const source = new carto.source.SQL(
    `SELECT * FROM all_bounds WHERE id = 'cc'`
  )
  const style = new carto.style.CartoCSS(`
      #layer {
          polygon-fill: #fff;
          polygon-opacity: 0;
          text-name: [namecol];
          text-face-name: 'Lato Bold Italic';
          text-fill: #fff;
          text-halo-radius: 2.5;
          text-halo-fill: darken(#1212ed,20);
          text-allow-overlap: true;
      }
      #layer::outline {
          line-width: 2;
          line-color: #1212ed;
          line-opacity: 1;
      }
      #layer::outline [zoom <= 12]{
          marker-width: 1;
      }
      #layer[zoom > 12]{
          text-size: 11;
      }
      #layer[zoom <= 12]{
          text-size: 8;
      }
      #layer[zoom > 11]{
          text-size: 16;
          text-character-spacing: 2;
      }
      #layer[zoom <= 11]{
          text-size: 10;
          text-character-spacing: 1;
      }
      `)

  const layer = new carto.layer.Layer(source, style)
  client
    .addLayer(layer)
    .then(() => {
      //add layer to state
      layers.add({
        order: 7,
        ref: layer,
        label: 'Show City Council Districts',
        checked: false,
        legend_html: `<hr class="colored_line" style="border-top-color:#1212ed;">`
      })
    })
    .catch(error => console.log(error.message))

  client.getLeafletLayer().addTo(map)
</script>
