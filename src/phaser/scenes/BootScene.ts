import Phaser from 'phaser'
import { gameStore } from '../../state/gameStore'
import { EventChannel, SceneKeys } from '../constants'

export class BootScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.Boot)
  }

  preload() {
    this.scale.lockOrientation(Phaser.Scale.LANDSCAPE)
    this.events.once(Phaser.Scenes.Events.READY, () => {
      gameStore.setScene(SceneKeys.Boot)
    })
  }

  create() {
    this.configureScaling()
    this.scene.start(SceneKeys.Preload)
  }

  private configureScaling() {
    const scaleManager = this.scale
    scaleManager.scaleMode = Phaser.Scale.RESIZE
    scaleManager.autoCenter = Phaser.Scale.CENTER_BOTH
    const updateMetrics = (gameSize: Phaser.Structs.Size) => {
      gameStore.setViewport({
        width: gameSize.width,
        height: gameSize.height,
      })
      this.events.emit(EventChannel.ViewportChange, gameSize)
    }
    updateMetrics(scaleManager.gameSize)
    scaleManager.on(Phaser.Scale.Events.RESIZE, updateMetrics)
    window.addEventListener('orientationchange', () => {
      setTimeout(() => {
        scaleManager.refresh()
        updateMetrics(scaleManager.gameSize)
      }, 300)
    })
  }
}

