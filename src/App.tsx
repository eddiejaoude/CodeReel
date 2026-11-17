import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import type { Settings } from './lib/types'
import { DEFAULT_SETTINGS } from './lib/defaults'
import { loadDraft, saveDraft, store } from './lib/projects'
import { usePlayback } from './lib/usePlayback'
import { buildTimeline, currentStep, stepAnchor } from './lib/timeline'
import { TopBar } from './components/TopBar'
import { CodePanel } from './components/CodePanel'
import { StylePanel } from './components/StylePanel'
import { PreviewPlaybackSurface } from './components/PreviewPlaybackSurface'
import { BrandOverlay } from './components/BrandOverlay'
// WebGL is the sole renderer; lazy-load it so the three.js/R3F bundle isn't part of
// the initial paint (a lightweight fallback shows while it streams in).
const WebGLScene = lazy(() =>
  import('./components/WebGLScene').then((m) => ({ default: m.WebGLScene })),
)
import { PlaybackBar } from './components/PlaybackBar'
import { ExportModal } from './components/ExportModal'
import { ProjectsModal } from './components/ProjectsModal'

type MobileWorkspace = 'code' | 'preview' | 'style'

const MOBILE_WORKSPACES: { id: MobileWorkspace; label: string }[] = [
  { id: 'code', label: 'Code' },
  { id: 'preview', label: 'Preview' },
  { id: 'style', label: 'Style' },
]

export default function App() {
  // Restore the last working draft (autosaved locally) so a reload continues where
  // the user left off; fall back to a fresh project on first visit.
  const [settings, setSettings] = useState<Settings>(
    () => loadDraft()?.settings ?? DEFAULT_SETTINGS,
  )
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(
    () => loadDraft()?.currentProjectId ?? null,
  )
  const [currentName, setCurrentName] = useState('')
  const [projectsOpen, setProjectsOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  // while exporting, the scene is driven frame-by-frame from this override
  // (null = normal wall-clock playback)
  const [exportProgress, setExportProgress] = useState<number | null>(null)
  const [activeStep, setActiveStep] = useState(0)
  const [mobileWorkspace, setMobileWorkspace] = useState<MobileWorkspace>('preview')

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...patch }))
  }, [])

  // Autosave the working draft (debounced) so a reload never loses in-progress work.
  useEffect(() => {
    const t = setTimeout(() => saveDraft(settings, currentProjectId), 500)
    return () => clearTimeout(t)
  }, [settings, currentProjectId])

  // Keep the displayed project name in sync with the open project (e.g. on reload,
  // where the draft only remembers the id).
  useEffect(() => {
    if (!currentProjectId) {
      setCurrentName('')
      return
    }
    let cancelled = false
    store.load(currentProjectId).then((r) => {
      if (!cancelled) setCurrentName(r?.name ?? '')
    })
    return () => {
      cancelled = true
    }
  }, [currentProjectId])

  const openProject = useCallback((id: string) => {
    store.load(id).then((r) => {
      if (!r) return
      setSettings(r.settings)
      setCurrentProjectId(r.id)
      setCurrentName(r.name)
      setActiveStep(0)
    })
  }, [])

  const newProject = useCallback(() => {
    setSettings(DEFAULT_SETTINGS)
    setCurrentProjectId(null)
    setCurrentName('')
    setActiveStep(0)
  }, [])

  // Save button: update the open project in place, or open the library to name a new one.
  const saveCurrent = useCallback(() => {
    if (currentProjectId) {
      store.save(currentName || 'Untitled project', settings, currentProjectId).catch(() => {})
    } else {
      setProjectsOpen(true)
    }
  }, [currentProjectId, currentName, settings])

  const onActiveProjectChange = useCallback((id: string | null, name: string) => {
    setCurrentProjectId(id)
    setCurrentName(name)
  }, [])

  // the built timeline's total length is the playback clock in both modes
  const timeline = useMemo(() => buildTimeline(settings), [settings])
  const effectiveDuration = timeline.total

  const playback = usePlayback(effectiveDuration, settings.speed, settings.loop)
  const { restart, toggle, seek, pause, playTo } = playback

  // WebGLScene registers R3F's `advance()` here so the exporter can draw a frame
  // on demand — no requestAnimationFrame, so it doesn't stall when the tab is
  // backgrounded (rAF throttles to ~0 when hidden).
  const exportRenderRef = useRef<((t: number) => void) | null>(null)
  const exportClockRef = useRef(0)
  const registerExportRender = useCallback((fn: ((t: number) => void) | null) => {
    exportRenderRef.current = fn
  }, [])

  // Drive the WebGL scene to an exact progress and render that frame synchronously.
  // flushSync commits the new progress — WebGLScene's useLayoutEffect applies every
  // per-frame update (uniforms, camera, positions) during that commit — then
  // advance() draws the composed frame (incl. bloom) straight to the canvas.
  const renderAt = useCallback(async (p: number) => {
    flushSync(() => setExportProgress(p))
    exportClockRef.current += 16
    exportRenderRef.current?.(exportClockRef.current)
  }, [])

  const beginExport = useCallback(() => {
    pause()
    setExportProgress(0)
    setExporting(true)
  }, [pause])

  const endExport = useCallback(() => {
    setExporting(false)
    setExportProgress(null)
  }, [])

  const sceneProgress = exportProgress ?? playback.progress

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

  // read live progress from a ref so the keydown listener below stays mounted
  // across frames — depending on `playback.progress` would re-subscribe it ~60×/s,
  // and a keypress landing during that momentary detach would be dropped.
  const progressRef = useRef(playback.progress)
  progressRef.current = playback.progress

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
        const here = currentStep(timeline, progressRef.current)
        goToStep(here + (e.key === 'ArrowRight' ? 1 : -1))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggle, restart, pause, goToStep, timeline, settings.mode, exporting])

  return (
    <div className="flex h-full flex-col bg-ink-950 text-zinc-200">
      <TopBar
        settings={settings}
        update={update}
        onExport={beginExport}
        projectName={currentName}
        onSave={saveCurrent}
        onOpenProjects={() => setProjectsOpen(true)}
      />

      <nav
        aria-label="Editor workspace"
        className="grid shrink-0 grid-cols-3 gap-1 border-b border-white/5 bg-ink-900 p-1.5 lg:hidden"
      >
        {MOBILE_WORKSPACES.map((workspace) => {
          const active = mobileWorkspace === workspace.id
          return (
            <button
              key={workspace.id}
              type="button"
              aria-pressed={active}
              onClick={() => setMobileWorkspace(workspace.id)}
              className={`cursor-pointer rounded-lg px-3 py-2 text-[12px] font-medium transition-colors ${
                active
                  ? 'bg-accent-500/15 text-accent-300 ring-1 ring-accent-500/30'
                  : 'text-zinc-500 hover:bg-white/5 hover:text-zinc-300'
              }`}
            >
              {workspace.label}
            </button>
          )
        })}
      </nav>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div
          className={`${
            mobileWorkspace === 'code' ? 'flex' : 'hidden'
          } min-h-0 flex-1 justify-center max-lg:[&>aside]:w-full lg:flex lg:w-[320px] lg:flex-none`}
        >
          <CodePanel
            settings={settings}
            update={update}
            activeStep={activeStep}
            setActiveStep={setActiveStep}
          />
        </div>

        <main
          className={`${
            mobileWorkspace === 'preview' ? 'flex' : 'hidden'
          } min-w-0 flex-1 flex-col lg:flex`}
        >
          <PreviewPlaybackSurface playing={playback.playing} onTogglePlayback={toggle}>
            <Suspense
              fallback={
                <div className="stage-grid flex min-h-0 flex-1 items-center justify-center text-sm text-zinc-500">
                  Loading 3D renderer…
                </div>
              }
            >
              <WebGLScene
                settings={settings}
                progress={sceneProgress}
                playing={exportProgress == null && playback.playing}
                registerExportRender={registerExportRender}
              />
            </Suspense>
            <BrandOverlay settings={settings} progress={sceneProgress} />
          </PreviewPlaybackSurface>
          <PlaybackBar
            settings={settings}
            update={update}
            playback={playback}
            totalDuration={effectiveDuration}
            timeline={timeline}
            onStep={goToStep}
          />
        </main>

        <div
          className={`${
            mobileWorkspace === 'style' ? 'flex' : 'hidden'
          } min-h-0 flex-1 justify-center max-lg:[&>aside]:w-full lg:flex lg:w-[300px] lg:flex-none`}
        >
          <StylePanel settings={settings} update={update} />
        </div>
      </div>

      {exporting && (
        <ExportModal
          settings={settings}
          duration={effectiveDuration}
          renderAt={renderAt}
          onClose={endExport}
        />
      )}
      {projectsOpen && (
        <ProjectsModal
          currentProjectId={currentProjectId}
          currentName={currentName}
          settings={settings}
          onOpenProject={openProject}
          onNewProject={newProject}
          onActiveProjectChange={onActiveProjectChange}
          onClose={() => setProjectsOpen(false)}
        />
      )}
    </div>
  )
}
