import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import './GameHud.css'
import { useGameStore } from '../state/gameStore'
import { usePlayerStore } from '../state/playerStore'
import { useHudStore } from '../state/hudStore'

const formatSeconds = (ms: number) => {
  if (ms <= 0) return '0.0s'
  return `${(ms / 1000).toFixed(1)}s`
}

const clamp = (value: number, min = 0, max = 1) =>
  Math.min(max, Math.max(min, value))

interface GameHudProps {
  className?: string
}

const TeammateStatusList = () => {
  const teammates = useHudStore((state) => state.teammates)

  return (
    <div className="hud-teammates">
      {teammates.map((teammate) => {
        const percent = teammate.maxHealth
          ? clamp(teammate.health / teammate.maxHealth)
          : 0
        const statusClass = `hud-teammate hud-teammate--${teammate.status}`
        const highlightClass = teammate.isHighlighted
          ? 'hud-teammate--highlight'
          : ''

        return (
          <div key={teammate.id} className={`${statusClass} ${highlightClass}`}>
            <div className="hud-teammate__avatar" />
            <div className="hud-teammate__info">
              <div className="hud-teammate__name">{teammate.name}</div>
              <div className="hud-teammate__health-track">
                <div
                  className="hud-teammate__health-fill"
                  style={{
                    '--teammate-health-percent': percent,
                    width: `${percent * 100}%`
                  } as CSSProperties}
                />
              </div>
              {teammate.specialHint && (
                <div className="hud-teammate__hint">{teammate.specialHint}</div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

const ContextActionPanel = () => {
  const contextAction = useHudStore((state) => state.contextAction)

  if (!contextAction) return null

  const percent = clamp(contextAction.progress ?? 0)

  return (
    <div className="hud-context">
      <button className="hud-context__button">
        <span className="hud-context__label">{contextAction.label}</span>
        {contextAction.description && (
          <span className="hud-context__description">{contextAction.description}</span>
        )}
        {contextAction.showProgressRing && (
          <div
            className="hud-context__progress"
            style={{ '--progress': percent } as CSSProperties}
          />
        )}
      </button>
      {contextAction.hint && (
        <div className="hud-context__hint">{contextAction.hint}</div>
      )}
    </div>
  )
}

const SmartMessageTicker = () => {
  const smartMessages = useHudStore((state) => state.smartMessages)
  if (smartMessages.length === 0) return null

  return (
    <div className="hud-smart-messages">
      {smartMessages.map((message, index) => (
        <div key={index} className="hud-smart-messages__item">
          {message}
        </div>
      ))}
    </div>
  )
}

export const GameHud = ({ className }: GameHudProps) => {
  const faction = usePlayerStore((state) => state.faction)
  const currentStageName = useGameStore((state) => state.currentStageName)
  const stageDuration = useGameStore((state) => state.stageDuration)
  const stageStartedAt = useGameStore((state) => state.stageStartedAt)
  const safeAreaPx = useGameStore((state) => state.viewport.safeAreaPx)
  const tickCooldowns = useHudStore((state) => state.tickCooldowns)
  const [now, setNow] = useState(() => Date.now())
  const tickerRef = useRef(Date.now())

  useEffect(() => {
    const interval = setInterval(() => {
      const current = Date.now()
      const delta = current - tickerRef.current
      tickerRef.current = current
      setNow(current)
      tickCooldowns(delta)
    }, 120)

    return () => {
      clearInterval(interval)
    }
  }, [tickCooldowns])

  const stageTimeRemaining = useMemo(() => {
    if (!stageStartedAt) return 0
    return Math.max(stageDuration - (now - stageStartedAt), 0)
  }, [now, stageDuration, stageStartedAt])

  // handleHudAction 已移除，战斗按钮现在在 Phaser 场景中处理

  const rootClassName = ['hud-root', className].filter(Boolean).join(' ')
  const rootStyle = useMemo(
    () =>
      ({
        '--hud-safe-top': `${safeAreaPx.top.toFixed(2)}px`,
        '--hud-safe-right': `${safeAreaPx.right.toFixed(2)}px`,
        '--hud-safe-bottom': `${safeAreaPx.bottom.toFixed(2)}px`,
        '--hud-safe-left': `${safeAreaPx.left.toFixed(2)}px`,
      }) as CSSProperties,
    [safeAreaPx.bottom, safeAreaPx.left, safeAreaPx.right, safeAreaPx.top],
  )

  return (
    <div className={rootClassName} style={rootStyle}>
      <div className="hud-layer hud-layer--top">
        <div className="hud-player-status">
          <div className="hud-player-faction">
            {faction === 'survivor' ? '幸存者' : '感染者'}
          </div>
          <TeammateStatusList />
        </div>
        <div className="hud-stage-info">
          <div className="hud-stage-info__name">{currentStageName ?? '未知阶段'}</div>
          <div className="hud-stage-info__timer">{formatSeconds(stageTimeRemaining)}</div>
        </div>
        <SmartMessageTicker />
      </div>

      {/* 战斗按钮已移至 Phaser 场景中 */}

      <ContextActionPanel />
    </div>
  )
}

