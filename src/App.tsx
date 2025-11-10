import './App.css'
import { PhaserGame } from './components/PhaserGame'
import { SceneStatusBanner } from './components/SceneStatusBanner'
import { GameHud } from './components/GameHud'
import { useConfigStore } from './state/configStore'

function App() {
  const showHeader = useConfigStore((state) => state.ui.showHeader)
  const showHud = useConfigStore((state) => state.ui.showHud)
  const updateUi = useConfigStore((state) => state.updateUi)

  const toggleImmersive = () => {
    const nextShow = !showHeader || !showHud
    updateUi({
      showHeader: !showHeader || nextShow,
      showHud: !showHud || nextShow,
    })
  }

  return (
    <div className="app-root">
      <header className={`app-header ${showHeader ? '' : 'hidden'}`}>
        <div className="title-block">
          <h1 className="app-title">L4D2 Top-Down Prototype</h1>
          <p className="app-subtitle">Phaser 3 + React + TypeScript</p>
        </div>
        <div className="header-actions">
          <SceneStatusBanner />
          <button
            className="immersive-toggle"
            onClick={toggleImmersive}
            type="button"
          >
            {showHeader && showHud ? '进入沉浸模式' : '退出沉浸模式'}
          </button>
        </div>
      </header>
      <main className="app-main">
        <PhaserGame />
        {showHud && <GameHud />}
      </main>
      </div>
  )
}

export default App
