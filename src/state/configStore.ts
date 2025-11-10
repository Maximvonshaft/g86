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

export interface UiPreferences {
  showHeader: boolean
  showHud: boolean
}

interface ConfigState {
  controls: ControlPreferences
  graphics: GraphicsSettings
  ui: UiPreferences
  updateControls: (controls: Partial<ControlPreferences>) => void
  updateGraphics: (graphics: Partial<GraphicsSettings>) => void
  updateUi: (ui: Partial<UiPreferences>) => void
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
  ui: {
    showHeader: true,
    showHud: true,
  },
  updateControls: (controls) =>
    set((state) => ({ controls: { ...state.controls, ...controls } })),
  updateGraphics: (graphics) =>
    set((state) => ({ graphics: { ...state.graphics, ...graphics } })),
  updateUi: (ui) =>
    set((state) => ({ ui: { ...state.ui, ...ui } })),
}))

