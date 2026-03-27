import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './polyfills/runtimeCompat.js'
import './index.css'
import PlatformApp from './PlatformApp.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <PlatformApp />
  </StrictMode>,
)
