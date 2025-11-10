import { useEffect, useMemo, useState } from 'react'
import { useGameStore } from '../state/gameStore'
import { usePlayerStore } from '../state/playerStore'

const sceneLabels: Record<string, string> = {
  Boot: '启动中',
  Preload: '加载资源',
  Menu: '主菜单',
  Game: '游戏中',
}

const formatStage = (name?: string, time?: number) => {
  if (!name) return ''
  if (!time || time <= 0) return ` • ${name}`
  return ` • ${name} (${(time / 1000).toFixed(0)}s)`
}

export const SceneStatusBanner = () => {
  const currentScene = useGameStore((state) => state.currentScene)
  const isReady = useGameStore((state) => state.isReady)
  const viewport = useGameStore((state) => state.viewport)
  const currentStageName = useGameStore((state) => state.currentStageName)
  const stageDuration = useGameStore((state) => state.stageDuration)
  const stageStartedAt = useGameStore((state) => state.stageStartedAt)
  const faction = usePlayerStore((state) => state.faction)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [])

  const stageTimeRemaining = useMemo(() => {
    if (!stageStartedAt) {
      return undefined
    }
    return Math.max(stageDuration - (now - stageStartedAt), 0)
  }, [now, stageDuration, stageStartedAt])

  const statusText = useMemo(
    () =>
      isReady
        ? `Scene: ${sceneLabels[currentScene] ?? currentScene} • ${viewport.width}×${viewport.height} • ${faction === 'survivor' ? '幸存者' : '感染者'}${formatStage(currentStageName, stageTimeRemaining)}`
        : 'Initializing…',
    [
      currentScene,
      currentStageName,
      faction,
      isReady,
      stageTimeRemaining,
      viewport.height,
      viewport.width,
    ],
  )

  return <span className="scene-status">{statusText}</span>
}

