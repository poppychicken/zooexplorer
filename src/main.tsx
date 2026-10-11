import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { installInput } from './game/systems/input'
import './styles.css'

installInput()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
