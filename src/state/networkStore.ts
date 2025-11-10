import { create } from 'zustand'

export interface NetworkEvent {
  id: string
  type: string
  payload: unknown
  timestamp: number
}

interface NetworkState {
  sessionId: string | null
  pendingEvents: NetworkEvent[]
  addEvent: (event: Omit<NetworkEvent, 'timestamp'>) => void
  clearEvents: () => void
  setSessionId: (sessionId: string | null) => void
}

export const useNetworkStore = create<NetworkState>((set) => ({
  sessionId: null,
  pendingEvents: [],
  addEvent: (event) =>
    set((state) => ({
      pendingEvents: [
        ...state.pendingEvents,
        { ...event, timestamp: Date.now() },
      ],
    })),
  clearEvents: () => set({ pendingEvents: [] }),
  setSessionId: (sessionId) => set({ sessionId }),
}))

