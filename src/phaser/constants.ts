export const GAME_WIDTH = 1920
export const GAME_HEIGHT = 1080

export const SceneKeys = {
  Boot: 'Boot',
  Preload: 'Preload',
  Menu: 'Menu',
  Game: 'Game',
} as const

export type SceneKey = (typeof SceneKeys)[keyof typeof SceneKeys]

export const TextureKeys = {
  Player: 'texture-player',
  Infected: 'texture-infected',
  Bullet: 'texture-bullet',
  Floor: 'texture-floor',
  Acid: 'texture-acid',
  Rock: 'texture-rock',
  Molotov: 'texture-molotov',
  Shock: 'texture-shock',
} as const

export const EventChannel = {
  SceneReady: 'scene-ready',
  ViewportChange: 'viewport-change',
} as const

