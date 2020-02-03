import { writable } from 'svelte/store'

function createLayers() {
  const { subscribe, update } = writable([])

  return {
    subscribe,
    add: layer => update(layers => [...layers, layer])
  }
}

function createInfo() {
  const { subscribe, set, update } = writable({})

  return {
    subscribe,
    show: obj => {
      //open modal, when info is set
      isModalOpen.set(true)
      return set(obj)
    }
  }
}

export const layers = createLayers()
export const info = createInfo()
export const isModalOpen = writable(false)
export const mapStore = writable(null)
