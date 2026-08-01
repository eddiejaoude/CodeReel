import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Settings } from './lib/types'
import { SAMPLES } from './lib/samples'
import { usePlayback } from './lib/usePlayback'
import { buildTimeline, currentStep, stepAnchor } from './lib/timeline'
import { TopBar } from './components/TopBar'
import { CodePanel, makeDefaultSteps } from './components/CodePanel'
import { StylePanel } from './components/StylePanel'
import { PreviewCanvas } from './components/PreviewCanvas'
import { PlaybackBar } from './components/PlaybackBar'
import { ExportModal } from './components/ExportModal'

const DEFAULT_SETTINGS: Settings = {
  mode: 'sequence',
  code: SAMPLES.typescript,
  console: null,
  steps: makeDefaultSteps(),
  transition: 'diff',
  stepHold: 1.2,
  transitionDur: 0.8,
  language: 'typescript',
  themeId: 'dracula',
  backgroundId: 'aurora',
  customBg: null,
  chrome: true,
  windowTitle: 'fib.ts',
  lineNumbers: true,
  padding: 56,
  fontSize: 14,
  fontId: 'jetbrains',
  radius: 12,
  shadow: 55,
  tilt: 12,
  tiltX: -1,
  tiltY: 1,
  animation: 'flip',
  duration: 5,
  speed: 1,
  loop: true,
  aspect: '16:9',
  format: 'mp4',
}

export default function App() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [exporting, setExporting] = useState(false)
  const [activeStep, setActiveStep] = useState(0)

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...patch }))
  }, [])

  // in steps mode the whole timeline drives the clock; in sequence mode, plain duration
  const timeline = useMemo(() => buildTimeline(settings), [settings])
  const effectiveDuration = timeline.total

  const playback = usePlayback(effectiveDuration, settings.speed, settings.loop)
  const { restart, toggle, seek, pause, playTo } = playback

  // editing content / switching language / mode restarts the take
  useEffect(() => {
    restart()
  }, [settings.code, settings.console, settings.steps, settings.language, settings.mode, restart])

  // keep the editor's active step in range
  useEffect(() => {
    setActiveStep((i) => Math.min(i, settings.steps.length - 1))
  }, [settings.steps.length])

  // manual step-through: play the transition into the neighbouring step, then hold
  const goToStep = useCallback(
    (target: number) => {
      const clamped = Math.min(settings.steps.length - 1, Math.max(0, target))
      setActiveStep(clamped)
      const anchor = stepAnchor(timeline, clamped)
      if (clamped === 0) {
        seek(0)
        restart()
      } else {
        // start just before this step's transition so the reveal plays out
        const prevAnchor = stepAnchor(timeline, clamped - 1)
        seek(prevAnchor)
        playTo(anchor)
      }
    },
    [settings.steps.length, timeline, seek, restart, playTo],
  )

  // keyboard: space = play/pause, R = restart, ←/→ = step through (steps mode)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || exporting) return
      if (e.code === 'Space') {
        e.preventDefault()
        toggle()
      } else if (e.key === 'r' || e.key === 'R') {
        restart()
      } else if (settings.mode === 'steps' && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
        e.preventDefault()
        pause()
        const here = currentStep(timeline, playback.progress)
        goToStep(here + (e.key === 'ArrowRight' ? 1 : -1))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggle, restart, pause, goToStep, timeline, playback.progress, settings.mode, exporting])

  return (
    <div className="flex h-full flex-col bg-ink-950 text-zinc-200">
      <TopBar settings={settings} update={update} onExport={() => setExporting(true)} />
      <div className="flex min-h-0 flex-1">
        <CodePanel settings={settings} update={update} activeStep={activeStep} setActiveStep={setActiveStep} />
        <main className="flex min-w-0 flex-1 flex-col">
          <PreviewCanvas settings={settings} progress={playback.progress} playing={playback.playing} />
          <PlaybackBar
            settings={settings}
            update={update}
            playback={playback}
            totalDuration={effectiveDuration}
            timeline={timeline}
            onStep={goToStep}
          />
        </main>
        <StylePanel settings={settings} update={update} />
      </div>
      {exporting && <ExportModal settings={settings} onClose={() => setExporting(false)} />}
    </div>
  )
}
