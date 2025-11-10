import Phaser from 'phaser'
import { gameStore } from '../state/gameStore'
import { SceneKeys } from './constants'
import { BootScene } from './scenes/BootScene'
import { GameScene } from './scenes/GameScene'
import { MenuScene } from './scenes/MenuScene'
import { PreloadScene } from './scenes/PreloadScene'

let cachedGame: Phaser.Game | null = null

const initialWidth =
  typeof window !== 'undefined' && window.innerWidth > 0
    ? window.innerWidth
    : 1920
const initialHeight =
  typeof window !== 'undefined' && window.innerHeight > 0
    ? window.innerHeight
    : 1080

const createGameConfig = (parent: HTMLElement): Phaser.Types.Core.GameConfig => ({
  type: Phaser.AUTO,
  parent,
  backgroundColor: '#111827',
  width: initialWidth,
  height: initialHeight,
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
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    expandParent: true,
    parent,
  },
  callbacks: {
    postBoot: (game) => {
      const { width, height } = game.scale.gameSize
      gameStore.setViewport({ width, height })
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

