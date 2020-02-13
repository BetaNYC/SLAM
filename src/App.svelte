<script>
  import Toolbox from './components/Toolbox.svelte'
  import Map from './components/Map.svelte'
  import Infobox from './components/Infobox.svelte'
  import { isModalOpen } from './stores.js'

  function _closeModal() {
    isModalOpen.set(false)
  }
</script>

<main>
  <div class="panel">
    <div class="left">
      <Toolbox></Toolbox>
    </div>
    <div class="right">
      <Map></Map>
    </div>
  </div>
  {#if $isModalOpen}
  <div class="modal">
    <span class="close" on:click="{_closeModal}">&times;</span>
    <Infobox></Infobox>
  </div>
  {/if}
</main>

<style>
  main {
    height: 100%;
    width: 100%;
  }

  .panel {
    display: flex;
    flex-wrap: wrap-reverse;
    height: 100%;
  }

  .left {
    flex: 1 1 300px;
    flex-grow: 1;
    height: 100%;
    overflow-y: auto;
    overflow-x: hidden;
  }

  .right {
    flex: 999 1 0;
    min-width: 375px;
    height: 100%;
  }

  .modal {
    position: fixed;
    z-index: 1001;
    top: 0;
    right: 0;
    margin: 0.8em 1em;
    background-color: white;
    padding: 10px;
    width: 30%;
    height: 60%;
    overflow-y: auto;
    box-shadow: 0 0px 16px rgba(0, 0, 0, 0.24);
    border-radius: 4px;
  }

  .close {
    color: #aaaaaa;
    float: right;
    font-size: 2.5em;
    font-weight: bold;
    margin-top: -0.5em;
    position: fixed;
  }

  .close:hover,
  .close:focus {
    color: #000;
    text-decoration: none;
    cursor: pointer;
  }

  @media all and (max-width: 674px) {
    .left {
      height: 50%;
    }
    .right {
      height: 50%;
    }
    .modal {
      width: 80%;
      height: 65%;
      margin: 2em auto;
      right: 0;
      left: 0;
      top: auto;
      bottom: 0;
    }
  }
</style>
