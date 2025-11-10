import { useEffect, useRef } from 'react'
import { destroyGame, initializeGame } from '../phaser/game'

export const PhaserGame = () => {
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!containerRef.current) {
      return
    }

    const game = initializeGame(containerRef.current)

    return () => {
      destroyGame(game)
    }
  }, [])

  return (
    <div className="phaser-shell">
      <div ref={containerRef} className="phaser-container" />
    </div>
  )
}

