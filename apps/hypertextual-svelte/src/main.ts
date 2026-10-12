import { mount } from 'svelte'

import App from './App.svelte'
import './app.css'

const target = document.querySelector<HTMLElement>('#app')

if (!target) {
  throw new Error('missing #app mount element')
}

mount(App, { target })
