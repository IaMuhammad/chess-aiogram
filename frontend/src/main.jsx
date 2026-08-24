import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { installErrorLogging } from './lib/logger.js'
import './styles.css'

installErrorLogging()

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
