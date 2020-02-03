<script>
  export let layer

  let { label, checked, notes, ref } = layer
  let legend = 'legend' in layer ? layer.legend : []
  let legend_html = 'legend_html' in layer ? layer.legend_html : null

  $: {
    //toggle layer on and off
    checked ? ref.show() : ref.hide()
  }
</script>

<div class="switch-box">
  <div class="input">
    <label class="switch">
      <input type="checkbox" bind:checked="{checked}" />
      <span class="slider"></span>
    </label>
    <span class="name">{label}</span>
  </div>
  {#if notes}
  <em>{notes}</em>
  {/if} {#if legend.length}
  <div class="legend">
    {#each legend as { image, text }}
    <img src="{image}" alt="icon" class="icon" />
    <p>{text}</p>
    {/each}
  </div>
  {/if} {#if legend_html}
  <div class="legend">
    {@html legend_html}
  </div>
  {/if}
</div>

<style>
  .input {
    display: flex;
    margin: 0 5px 0 0;
  }
  em {
    font-size: 0.7em;
  }
  .legend {
    display: flex;
    font-size: 0.7em;
  }

  .legend :global(.colored_line) {
    border: none;
    border-top: 3px solid #fff;
    background-color: #fff;
    color: #fff;
    height: 1px;
    width: 15%;
    margin-left: 7px;
  }

  .legend :global(.colored_square) {
    height: 1em;
    width: 2em;
    margin: 5px 7px;
  }
  .icon {
    margin-left: 5px;
    margin-right: 3px;
  }
  label {
    font-size: 0.8em;
    cursor: pointer;
  }
  .name {
    font-family: 'Open Sans', sans-serif;
    font-size: 0.8em;
  }
  .switch {
    position: relative;
    display: inline-block;
    width: 30px;
    height: 16px;
    margin-right: 5px;
  }
  .switch input {
    opacity: 0;
    width: 0;
    height: 0;
  }
  .slider {
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: #ccc;
    transition: 0.4s;
  }
  .slider:before {
    position: absolute;
    content: '';
    height: 10px;
    width: 10px;
    left: 3px;
    bottom: 3px;
    background-color: white;
    transition: 0.4s;
  }
  input:checked + .slider {
    background-color: #6a6a6a;
  }
  input:focus + .slider {
    box-shadow: 0 0 1px #6a6a6a;
  }
  input:checked + .slider:before {
    transform: translateX(12px);
  }
</style>
