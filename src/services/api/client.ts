export interface GameEvent {
  id: string
  type: string
  payload: unknown
  timestamp: number
}

type EventHandler = (event: GameEvent) => void

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

class ApiClient {
  async get<T>(path: string): Promise<T> {
    console.info(`[api] GET ${path}`)
    await delay(120)
    return {} as T
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    console.info(`[api] POST ${path}`, body)
    await delay(120)
    return {} as T
  }

  subscribeEvents(path: string, handler: EventHandler): () => void {
    console.info(`[api] SUBSCRIBE ${path}`)
    const interval = setInterval(() => {
      handler({
        id: crypto.randomUUID(),
        type: 'heartbeat',
        payload: {},
        timestamp: Date.now(),
      })
    }, 10000)

    return () => {
      console.info(`[api] UNSUBSCRIBE ${path}`)
      clearInterval(interval)
    }
  }
}

export const apiClient = new ApiClient()

