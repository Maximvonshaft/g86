import { create } from 'zustand'
import { SceneKeys, type SceneKey } from '../phaser/constants'

export interface ViewportState {
  width: number
  height: number
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
  viewport: { width: 1920, height: 1080 },
  currentStageId: undefined,
  currentStageName: undefined,
  stageDuration: 0,
  stageStartedAt: undefined,
  isPaused: false,
  setScene: (scene) => set({ currentScene: scene }),
  setReady: (ready) => set({ isReady: ready }),
  setViewport: (viewport) =>
    set((state) => ({
      viewport: { ...state.viewport, ...viewport },
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

