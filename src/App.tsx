import './App.css'
import { PhaserGame } from './components/PhaserGame'
import { GameHud } from './components/GameHud'

function App() {
  return (
    <div className="app-root">
      <main className="app-main">
        <PhaserGame />
        <GameHud />
      </main>
    </div>
  )
}

export default App
