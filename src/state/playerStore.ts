import { create } from 'zustand'

export type PlayerFaction = 'survivor' | 'infected'

export interface LoadoutConfig {
  primaryWeapon: string | null
  secondaryWeapon: string | null
  throwable: string | null
}

export interface PlayerTelemetry {
  position: { x: number; y: number }
  rotation: number
  health: number
  armor: number
}

export interface WeaponSummary {
  id: string | null
  displayName: string
  ammoInMagazine: number
  magazineSize: number
  slot: string
}

export interface InventoryItemState {
  id: string | null
  name: string
  quantity: number
}

export interface PlayerInventoryState {
  healItem: InventoryItemState
  throwable: InventoryItemState
}

interface PlayerState {
  faction: PlayerFaction
  loadout: LoadoutConfig
  telemetry: PlayerTelemetry
  weaponSummary: WeaponSummary
  inventory: PlayerInventoryState
  setFaction: (faction: PlayerFaction) => void
  updateLoadout: (payload: Partial<LoadoutConfig>) => void
  updateTelemetry: (telemetry: Partial<PlayerTelemetry>) => void
  updateWeaponSummary: (summary: WeaponSummary) => void
  updateInventory: (inventory: Partial<PlayerInventoryState>) => void
}

const initialTelemetry: PlayerTelemetry = {
  position: { x: 0, y: 0 },
  rotation: 0,
  health: 100,
  armor: 0,
}

const initialInventory: PlayerInventoryState = {
  healItem: { id: 'first_aid', name: '医疗包', quantity: 1 },
  throwable: { id: 'molotov', name: '燃烧瓶', quantity: 1 },
}

export const usePlayerStore = create<PlayerState>((set) => ({
  faction: 'survivor',
  loadout: { primaryWeapon: null, secondaryWeapon: null, throwable: null },
  telemetry: initialTelemetry,
  weaponSummary: {
    id: null,
    displayName: '未装备',
    ammoInMagazine: 0,
    magazineSize: 0,
    slot: 'primary',
  },
  inventory: initialInventory,
  setFaction: (faction) => set({ faction }),
  updateLoadout: (payload) =>
    set((state) => ({ loadout: { ...state.loadout, ...payload } })),
  updateTelemetry: (payload) =>
    set((state) => ({
      telemetry: {
        ...state.telemetry,
        ...payload,
        position: {
          ...state.telemetry.position,
          ...payload.position,
        },
      },
    })),
  updateWeaponSummary: (summary) => set({ weaponSummary: summary }),
  updateInventory: (payload) =>
    set((state) => ({
      inventory: {
        ...state.inventory,
        ...payload,
      },
    })),
}))

