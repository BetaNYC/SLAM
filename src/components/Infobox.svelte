<script>
  import { info } from '../stores.js'

  let chartsContainer

  $: {
    //bind canvas elements from charts array
    if (chartsContainer) {
      chartsContainer.innerHTML = ''
      $info.charts.forEach(chart => chartsContainer.appendChild(chart))
    }
  }
</script>

<div class="infobox">
  {@html $info.content}
  <div bind:this="{chartsContainer}"></div>
  {@html $info.source}
</div>

<style>
  .infobox :global(h1, h2, h3) {
    font-family: 'Playfair Display', serif;
    line-height: 32px;
  }

  .infobox :global(h1, h2, h3, h4) {
    text-align: center;
  }

  .infobox :global(h4, h5, h6) {
    margin: 0;
    padding-bottom: 5px;
    font-weight: normal;
  }

  .infobox :global(.separator) {
    min-height: 1px;
    background-color: rgba(46, 60, 67, 0.08);
    margin: 16px 0;
  }

  .infobox :global(.bold) {
    font-weight: bold;
  }

  .infobox :global(.lighter) {
    color: #444444;
  }
</style>
