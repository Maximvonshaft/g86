import { create } from 'zustand'

export type TeammateStatus = 'normal' | 'wounded' | 'incapacitated' | 'controlled'

export interface TeammateState {
  id: string
  name: string
  health: number
  maxHealth: number
  armor: number
  status: TeammateStatus
  isHighlighted: boolean
  avatar?: string | null
  controlledBy?: string | null
  specialHint?: string | null
}

export type ContextActionType =
  | 'none'
  | 'rescue'
  | 'heal-ally'
  | 'pickup'
  | 'interact'
  | 'use-self'
  | 'throw'

export interface ContextActionState {
  id: string
  label: string
  type: ContextActionType
  description?: string | null
  progress?: number | null
  requiresHold?: boolean
  icon?: string | null
  hint?: string | null
  showProgressRing?: boolean
}

export interface CombatCooldownState {
  shoveCooldownMs: number
  shoveCooldownRemainingMs: number
  reloadDurationMs: number
  reloadElapsedMs: number
  isReloading: boolean
  shootMode: 'fire' | 'heal-self' | 'throw'
  isShootButtonEnabled: boolean
  abilityLabel?: string | null
  abilityActive: boolean
}

interface HudState {
  teammates: TeammateState[]
  contextAction: ContextActionState | null
  combat: CombatCooldownState
  smartMessages: string[]
  setTeammates: (payload: TeammateState[]) => void
  updateTeammate: (id: string, patch: Partial<TeammateState>) => void
  setContextAction: (action: ContextActionState | null) => void
  setCombatState: (patch: Partial<CombatCooldownState>) => void
  setShootMode: (
    mode: CombatCooldownState['shootMode'],
    options?: Partial<CombatCooldownState>,
  ) => void
  tickCooldowns: (deltaMs: number) => void
  pushSmartMessage: (message: string) => void
  clearSmartMessages: () => void
}

const baseTeammates: TeammateState[] = [
  {
    id: 'coach',
    name: 'Coach',
    health: 82,
    maxHealth: 100,
    armor: 0,
    status: 'normal',
    isHighlighted: false,
    avatar: null,
  },
  {
    id: 'ellis',
    name: 'Ellis',
    health: 46,
    maxHealth: 100,
    armor: 0,
    status: 'wounded',
    isHighlighted: true,
    avatar: null,
    specialHint: '流血不止',
  },
  {
    id: 'rochelle',
    name: 'Rochelle',
    health: 0,
    maxHealth: 100,
    armor: 0,
    status: 'incapacitated',
    isHighlighted: true,
    avatar: null,
    specialHint: '待救援',
  },
]

const createInitialCombatState = (): CombatCooldownState => ({
  shoveCooldownMs: 900,
  shoveCooldownRemainingMs: 0,
  reloadDurationMs: 1600,
  reloadElapsedMs: 0,
  isReloading: false,
  shootMode: 'fire',
  isShootButtonEnabled: true,
  abilityLabel: null,
  abilityActive: false,
})

export const useHudStore = create<HudState>((set) => ({
  teammates: baseTeammates,
  contextAction: null,
  combat: createInitialCombatState(),
  smartMessages: [],
  setTeammates: (payload) => set({ teammates: payload }),
  updateTeammate: (id, patch) =>
    set((state) => ({
      teammates: state.teammates.map((teammate) =>
        teammate.id === id ? { ...teammate, ...patch } : teammate,
      ),
    })),
  setContextAction: (action) => set({ contextAction: action }),
  setCombatState: (patch) =>
    set((state) => ({
      combat: {
        ...state.combat,
        ...patch,
      },
    })),
  setShootMode: (mode, options) =>
    set((state) => ({
      combat: {
        ...state.combat,
        ...options,
        shootMode: mode,
      },
    })),
  tickCooldowns: (deltaMs) =>
    set((state) => {
      const nextShoveRemaining = Math.max(
        state.combat.shoveCooldownRemainingMs - deltaMs,
        0,
      )
      let isReloading = state.combat.isReloading
      let reloadElapsed = state.combat.reloadElapsedMs

      if (isReloading) {
        reloadElapsed = Math.min(
          state.combat.reloadElapsedMs + deltaMs,
          state.combat.reloadDurationMs,
        )
        if (reloadElapsed >= state.combat.reloadDurationMs) {
          isReloading = false
        }
      }

      const shootEnabled =
        state.combat.shootMode === 'fire'
          ? !isReloading && nextShoveRemaining <= 0
          : state.combat.isShootButtonEnabled

      return {
        combat: {
          ...state.combat,
          shoveCooldownRemainingMs: nextShoveRemaining,
          isReloading,
          reloadElapsedMs: reloadElapsed,
          isShootButtonEnabled: shootEnabled,
        },
      }
    }),
  pushSmartMessage: (message) =>
    set((state) => ({
      smartMessages: [message, ...state.smartMessages].slice(0, 4),
    })),
  clearSmartMessages: () => set({ smartMessages: [] }),
}))
