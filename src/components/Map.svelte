<script>
  import { onMount, setContext } from 'svelte'
  import { carto_apikey } from '../utils/keys'
  import { mapStore } from '../stores'
  import Layer_SLA from './layers/Layer_SLA.svelte'
  import Layer_SWC from './layers/Layer_SWC.svelte'
  import Layer_311 from './layers/Layer_311.svelte'
  import Layer_DOHMN from './layers/Layer_DOHMN.svelte'
  import Layer_Church_School from './layers/Layer_Church_School.svelte'

  let container
  let client
  let map
  let popup

  setContext(carto_apikey, {
    getMap: () => map,
    getCartoClient: () => client,
    getPopup: () => popup
  })

  onMount(() => {
    client = new carto.Client({
      apiKey: carto_apikey,
      username: 'betanyc'
    })

    const maxZoom = 20

    map = L.map(container, { maxZoom }).setView([40.73, -74], 18)
    map.scrollWheelZoom.disable()

    popup = L.popup({ closeButton: false })

    L.tileLayer(
      'https://cartodb-basemaps-{s}.global.ssl.fastly.net/rastertiles/voyager/{z}/{x}/{y}{r}.png',
      { maxZoom }
    ).addTo(map)

    //add map to store
    mapStore.set(map)
  })
</script>

<div id="map" bind:this="{container}">
  {#if map}
  <Layer_SLA></Layer_SLA>
  <Layer_SWC></Layer_SWC>
  <Layer_311></Layer_311>
  <Layer_DOHMN></Layer_DOHMN>
  <Layer_Church_School></Layer_Church_School>
  {/if}
</div>

<style>
  #map {
    width: 100%;
    height: 100%;
  }
</style>
