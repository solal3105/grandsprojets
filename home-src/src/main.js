import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import './style.css'
import { tiltBtn } from './directives/tiltBtn.js'

const app = createApp(App)
app.use(router)
app.directive('tilt-btn', tiltBtn)
app.mount('#app')
