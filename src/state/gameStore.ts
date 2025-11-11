import { create } from 'zustand'
import { SceneKeys, type SceneKey } from '../phaser/constants'

export interface SafeAreaInsets {
  top: number
  right: number
  bottom: number
  left: number
}

export interface ViewportBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface ViewportState {
  /** 逻辑画布宽度（设计尺寸） */
  width: number
  /** 逻辑画布高度（设计尺寸） */
  height: number
  /** 当前屏幕显示宽度（CSS 像素） */
  displayWidth: number
  /** 当前屏幕显示高度（CSS 像素） */
  displayHeight: number
  /** 当前缩放系数（等比缩放，Fit 模式下 x/y 相同） */
  scale: number
  /** 最终安全边距（逻辑单位） */
  safeArea: SafeAreaInsets
  /** 最终安全边距（CSS 像素） */
  safeAreaPx: SafeAreaInsets
  /** 设备额外 inset（CSS 像素，例如刘海/底栏） */
  deviceSafeAreaPx: SafeAreaInsets
  /** Canvas 在页面中的实际矩形区域 */
  bounds: ViewportBounds
}

interface GameState {
  currentScene: SceneKey
  isReady: boolean
  viewport: ViewportState
  currentStageId?: string
  currentStageName?: string
  stageDuration: number
  stageStartedAt?: number
  isPaused: boolean
  setScene: (scene: SceneKey) => void
  setReady: (ready: boolean) => void
  setViewport: (viewport: Partial<ViewportState>) => void
  setStage: (stage: {
    id: string
    name: string
    duration: number
  }) => void
  setPaused: (paused: boolean) => void
}

export const useGameStore = create<GameState>((set) => ({
  currentScene: SceneKeys.Boot,
  isReady: false,
  viewport: {
    width: 1920,
    height: 1080,
    displayWidth: 1920,
    displayHeight: 1080,
    scale: 1,
    safeArea: { top: 40, right: 60, bottom: 40, left: 60 },
    safeAreaPx: { top: 40, right: 60, bottom: 40, left: 60 },
    deviceSafeAreaPx: { top: 0, right: 0, bottom: 0, left: 0 },
    bounds: { x: 0, y: 0, width: 1920, height: 1080 },
  },
  currentStageId: undefined,
  currentStageName: undefined,
  stageDuration: 0,
  stageStartedAt: undefined,
  isPaused: false,
  setScene: (scene) => set({ currentScene: scene }),
  setReady: (ready) => set({ isReady: ready }),
  setViewport: (viewport) =>
    set((state) => ({
      viewport: {
        ...state.viewport,
        ...viewport,
        safeArea: {
          ...state.viewport.safeArea,
          ...(viewport.safeArea ?? {}),
        },
        safeAreaPx: {
          ...state.viewport.safeAreaPx,
          ...(viewport.safeAreaPx ?? {}),
        },
        deviceSafeAreaPx: {
          ...state.viewport.deviceSafeAreaPx,
          ...(viewport.deviceSafeAreaPx ?? {}),
        },
        bounds: {
          ...state.viewport.bounds,
          ...(viewport.bounds ?? {}),
        },
      },
    })),
  setStage: (stage) =>
    set({
      currentStageId: stage.id,
      currentStageName: stage.name,
      stageDuration: stage.duration,
      stageStartedAt: Date.now(),
    }),
  setPaused: (paused) => set({ isPaused: paused }),
}))

export const gameStore = {
  getState: useGameStore.getState,
  setScene: (scene: SceneKey) => useGameStore.getState().setScene(scene),
  setReady: (ready: boolean) => useGameStore.getState().setReady(ready),
  setViewport: (viewport: Partial<ViewportState>) =>
    useGameStore.getState().setViewport(viewport),
  setStage: (stage: { id: string; name: string; duration: number }) =>
    useGameStore.getState().setStage(stage),
  setPaused: (paused: boolean) => useGameStore.getState().setPaused(paused),
}

