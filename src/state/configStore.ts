import { create } from 'zustand'

export interface ControlPreferences {
  moveSensitivity: number
  aimSensitivity: number
  aimAssist: boolean
  vibration: boolean
}

export interface GraphicsSettings {
  enablePostProcessing: boolean
  renderScale: number
  targetFps: 60 | 90 | 120
}

interface ConfigState {
  controls: ControlPreferences
  graphics: GraphicsSettings
  updateControls: (controls: Partial<ControlPreferences>) => void
  updateGraphics: (graphics: Partial<GraphicsSettings>) => void
}

export const useConfigStore = create<ConfigState>((set) => ({
  controls: {
    moveSensitivity: 1,
    aimSensitivity: 1,
    aimAssist: true,
    vibration: true,
  },
  graphics: {
    enablePostProcessing: false,
    renderScale: 1,
    targetFps: 60,
  },
  updateControls: (controls) =>
    set((state) => ({ controls: { ...state.controls, ...controls } })),
  updateGraphics: (graphics) =>
    set((state) => ({ graphics: { ...state.graphics, ...graphics } })),
}))

