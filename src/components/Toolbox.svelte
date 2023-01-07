<script>
  import AddressSearch from "./AddressSearch.svelte";
  import LoadingIndicator from "./LoadingIndicator.svelte";
  import Switch from "./Switch.svelte";
  import { layers } from "../stores.js";

  $: sortedLayers = $layers.sort((a, b) => a.order - b.order);
</script>

<div class="toolbox">
  <h2>SLA Mapper (SLAM)</h2>
  <div class="about">
    <h5 class="lighter">
      Tool that aggregates data that community boards often have to gather in
      order to review liquor license applications and sidewalk café
      applications. Displaying this information in a unified view saves
      community boards considerable time and resources.
    </h5>
    <!-- <h5 class="lighter" style="background-color: #f1ed60; padding: 0.5rem;">
            <strong>Note:</strong> We are currently in the process of updating our data Layers. Some
            boroughs might not have data.
        </h5> -->
  </div>
  <div class="separator" />
  <h4>Instructions</h4>
  <h5 class="lighter">
    Click on a map feature to learn more about an establishment's liquor
    license, sidewalk café license, restaurant health grades, or 311 complaints.
  </h5>
  <div class="separator" />
  {#if sortedLayers.length === 0}
    <LoadingIndicator />
  {/if}
  {#each sortedLayers as layer (layer.label)}
    <Switch {layer} />
  {/each}
  <div class="separator" />
  <h4>Search</h4>
  <AddressSearch />
  <div class="separator" />
  <footer>
    <figure>
      <img
        class="logo"
        alt="BetaNYC Logo"
        src="images/BetaNYC_short_white_on_blue.png"
      />
      <figcaption class="logo_caption">A BetaNYC Tool</figcaption>
    </figure>
    <div class="footer-links">
      <a href="https://github.com/BetaNYC/SLAM/blob/master/LICENSE"
        >GNU General Public License</a
      >
      <span> | </span>
      <a href="https://github.com/BetaNYC/SLAM/issues">File a GitHub issue</a>
    </div>
  </footer>
</div>

<style>
  .toolbox {
    background: #fff;
    border-radius: 4px;
    padding: 2px 16px;
    font-family: "Lato", sans-serif;
  }

  h1,
  h2,
  h3 {
    font-family: "Playfair Display", serif;
    line-height: 32px;
  }

  h1,
  h2,
  h3,
  h4 {
    text-align: center;
  }

  h4,
  h5,
  h6 {
    margin: 0;
    padding-bottom: 5px;
    font-weight: normal;
  }

  .about {
    margin-top: 20px;
    letter-spacing: -0.1px;
  }

  .lighter {
    color: #444444;
  }

  .separator {
    min-height: 1px;
    background-color: rgba(46, 60, 67, 0.08);
    margin: 16px 0;
  }

  .footer {
    text-align: center;
  }

  .logo {
    width: 50px;
    margin: auto;
    display: block;
  }

  .logo_caption {
    font-size: 0.6rem;
    margin-top: 5px;
    text-align: center;
  }

  .footer-links {
    display: flex;
    align-items: center;
    font-size: 11px;
    justify-content: space-between;
  }
</style>
