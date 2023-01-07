<script>
  import { mapStore } from '../stores'
  import L from 'leaflet';
  let value = ''
  let searchAddrs = []
  let marker

  function _set() {
    //clear searchAddrs
    searchAddrs = []

    fetch(`https://geosearch.planninglabs.nyc/v2/search?text=${value}`)
      .then(response => response.json())
      .then(response => {
        //use the first address
        if (response.features.length) {
          const coords = response.features[0].geometry.coordinates.reverse()
          $mapStore.setView(coords)

          if (marker) marker.remove()
          marker = L.marker(coords).addTo($mapStore).on('click', () => marker.remove()).setOpacity(0.8);
        } else {
          //throw error
        }
      })
  }

  function _setLocation(addr) {
    const {name, coords} = addr
    value = name
    //clear searchAddrs
    searchAddrs = []

    $mapStore.setView(coords)
    if (marker) marker.remove()
    marker = L.marker(coords).addTo($mapStore).on('click', () => marker.remove()).setOpacity(0.8);
  }

  function _search() {
    if (value.length > 1) {
      fetch(`https://geosearch.planninglabs.nyc/v2/search?text=${value}`)
        .then(response => response.json())
        .then(
          response =>
            (searchAddrs = response.features
              .map(feature =>({
                name : feature.properties.label.replace(', New York, NY, USA', ''),
                coords: feature.geometry.coordinates.reverse()
              }))
              .slice(0, 5))
        )
    } else {
      searchAddrs = []
    }
  }

  function reset_map() {
    if (marker) marker.remove()
    $mapStore.setView([40.73, -74], 17)
  }
</script>

<form on:submit|preventDefault="{_set}">
  <input
    id="address"
    placeholder="Enter a NYC Address"
    type="text"
    name="address"
    bind:value
    autocomplete="off"
    on:keyup="{_search}"
  />
  <ul>
    {#each searchAddrs as addr}
      <li on:click="{() => _setLocation(addr)}">{addr.name}</li>
    {/each}
  </ul>
  <input type="submit" value="Search" />
  <a href="#" on:click="{reset_map}" class="reset_map">Reset Map</a>
</form>

<style>
  form {
    font-family: 'Lato', sans-serif;
    font-size: 0.8em;
  }
  #address {
    width: 100%;
    padding: 5px 15px;
    box-sizing: border-box;
    margin-bottom: 5px;
  }

  input[type='submit'] {
    background-color: #6a6a6a;
    border: none;
    color: white;
    padding: 5px 10px;
    text-decoration: none;
    cursor: pointer;
    font-family: 'Lato', sans-serif;
  }

  ul {
    padding-left: 10px;
    color: rgb(61, 61, 61);
    background-color: aliceblue;
    margin: 0px;
  }

  li {
    margin-left: 5px;
  }

  .reset_map {
    font-size: 11px;
    float: right;
  }
</style>
