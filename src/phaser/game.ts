import Phaser from 'phaser'
import { gameStore } from '../state/gameStore'
import { SceneKeys } from './constants'
import { BootScene } from './scenes/BootScene'
import { GameScene } from './scenes/GameScene'
import { MenuScene } from './scenes/MenuScene'
import { PreloadScene } from './scenes/PreloadScene'
import {
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  MAX_HEIGHT,
  MAX_WIDTH,
  MIN_HEIGHT,
  MIN_WIDTH,
  buildViewportState,
  calculateSafeArea,
  getCssSafeAreaInsets,
  getVisualViewportInsets,
  mergeDeviceSafeArea,
} from './utils/viewportMetrics'

let cachedGame: Phaser.Game | null = null

const syncViewport = (game: Phaser.Game) => {
  const visualInsets = getVisualViewportInsets()
  const cssInsets = getCssSafeAreaInsets()
  const deviceInsets = mergeDeviceSafeArea(visualInsets, cssInsets)
  const metrics = calculateSafeArea(game.scale, deviceInsets)
  gameStore.setViewport({
    ...buildViewportState(metrics),
    deviceSafeAreaPx: deviceInsets,
  })
}

const createGameConfig = (parent: HTMLElement): Phaser.Types.Core.GameConfig => ({
  type: Phaser.AUTO,
  parent,
  backgroundColor: '#111827',
  width: DESIGN_WIDTH,
  height: DESIGN_HEIGHT,
  pixelArt: false,
  antialias: true,
  powerPreference: 'high-performance',
  disableContextMenu: true,
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
  scale: {
    parent,
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    expandParent: false,
    width: DESIGN_WIDTH,
    height: DESIGN_HEIGHT,
    min: {
      width: MIN_WIDTH,
      height: MIN_HEIGHT,
    },
    max: {
      width: MAX_WIDTH,
      height: MAX_HEIGHT,
    },
  },
  callbacks: {
    postBoot: (game) => {
      const handleResize = () => syncViewport(game)
      const handleVisualViewport = () => syncViewport(game)
      syncViewport(game)
      game.scale.on(Phaser.Scale.Events.RESIZE, handleResize)
      const visualViewport =
        typeof window !== 'undefined' ? window.visualViewport : undefined
      if (visualViewport) {
        visualViewport.addEventListener('resize', handleVisualViewport)
        visualViewport.addEventListener('scroll', handleVisualViewport)
      }
      game.events.on(Phaser.Core.Events.DESTROY, () => {
        game.scale.off(Phaser.Scale.Events.RESIZE, handleResize)
        if (visualViewport) {
          visualViewport.removeEventListener('resize', handleVisualViewport)
          visualViewport.removeEventListener('scroll', handleVisualViewport)
        }
      })
    },
  },
  scene: [BootScene, PreloadScene, MenuScene, GameScene],
  input: {
    activePointers: 3,
    touch: {
      capture: true,
    },
  },
})

export const initializeGame = (container: HTMLElement) => {
  if (cachedGame) {
    return cachedGame
  }

  cachedGame = new Phaser.Game(createGameConfig(container))
  gameStore.setScene(SceneKeys.Boot)
  return cachedGame
}

export const destroyGame = (game: Phaser.Game | null) => {
  if (!game) {
    return
  }

  game.destroy(true)
  if (cachedGame === game) {
    cachedGame = null
  }
}

