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
    const emitViewportMetrics = () => {
      this.events.emit(
        EventChannel.ViewportChange,
        gameStore.getState().viewport,
      )
    }
    emitViewportMetrics()
    scaleManager.on(Phaser.Scale.Events.RESIZE, emitViewportMetrics)
    const handleOrientationChange = () => {
      setTimeout(() => {
        scaleManager.refresh()
        emitViewportMetrics()
      }, 180)
    }
    window.addEventListener('orientationchange', handleOrientationChange)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scaleManager.off(Phaser.Scale.Events.RESIZE, emitViewportMetrics)
      window.removeEventListener('orientationchange', handleOrientationChange)
    })
  }
}

