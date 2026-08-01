import { ChevronLeft, ChevronRight, Code2, Copy, Layers, ListVideo, Plus, Terminal, Trash2, X } from 'lucide-react'
import type { InputMode, Language, Settings, Step, TransitionStyle } from '../lib/types'
import { LANGUAGES, TRANSITIONS } from '../lib/types'
import { SAMPLES, STEP_SAMPLE } from '../lib/samples'
import { CodeEditor } from './CodeEditor'
import { Segmented, Select, Slider } from './ui'

function newId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `s${Date.now()}${Math.floor(Math.random() * 1e6)}`
  }
}

export function makeDefaultSteps(): Step[] {
  return STEP_SAMPLE.map((s) => ({ id: newId(), code: s.code, title: s.title, transition: null }))
}

export function CodePanel({
  settings,
  update,
  activeStep,
  setActiveStep,
}: {
  settings: Settings
  update: (patch: Partial<Settings>) => void
  activeStep: number
  setActiveStep: (i: number) => void
}) {
  const steps = settings.steps
  const active = Math.min(activeStep, steps.length - 1)
  const step = steps[active]

  const onLanguage = (lang: Language) => {
    const untouched = settings.code === SAMPLES[settings.language]
    update({ language: lang, ...(untouched ? { code: SAMPLES[lang] } : {}) })
  }

  const patchSteps = (next: Step[]) => update({ steps: next })

  const updateStep = (i: number, patch: Partial<Step>) => {
    patchSteps(steps.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))
  }

  const addStep = () => {
    // seed the new step with a copy of the current one — the natural "duplicate then edit" gesture
    const seed = steps[active] ?? { code: '', title: '' }
    const next = [...steps]
    next.splice(active + 1, 0, { id: newId(), code: seed.code, title: '', transition: null })
    patchSteps(next)
    setActiveStep(active + 1)
  }

  const duplicateStep = () => {
    const next = [...steps]
    next.splice(active + 1, 0, { ...step, id: newId(), title: step.title ? `${step.title} copy` : '' })
    patchSteps(next)
    setActiveStep(active + 1)
  }

  const deleteStep = () => {
    if (steps.length <= 1) return
    patchSteps(steps.filter((_, i) => i !== active))
    setActiveStep(Math.max(0, active - 1))
  }

  const moveStep = (dir: -1 | 1) => {
    const j = active + dir
    if (j < 0 || j >= steps.length) return
    const next = [...steps]
    ;[next[active], next[j]] = [next[j], next[active]]
    patchSteps(next)
    setActiveStep(j)
  }

  const lineCount = (settings.mode === 'steps' ? step?.code ?? '' : settings.code).split('\n').length

  return (
    <aside className="flex w-[320px] shrink-0 flex-col border-r border-white/5 bg-ink-900">
      <div className="flex items-center justify-between gap-2 border-b border-white/5 px-4 py-3">
        <div className="flex items-center gap-2 text-[13px] font-medium text-zinc-300">
          <Code2 className="h-4 w-4 text-accent-400" />
          Code
        </div>
        <div className="flex items-center gap-1.5">
          <Select
            className="w-[130px]"
            value={settings.language}
            options={LANGUAGES.map((l) => ({ value: l.id, label: l.label }))}
            onChange={(v) => onLanguage(v as Language)}
          />
          {settings.mode === 'sequence' && settings.console === null && (
            <button
              type="button"
              onClick={() => update({ console: '' })}
              title="Add an animated console section"
              className="flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-white/10 px-2 text-[11px] font-medium text-zinc-400 transition-colors hover:border-accent-500/50 hover:bg-accent-500/10 hover:text-accent-300"
            >
              <Terminal className="h-3.5 w-3.5" />
              Add Console
            </button>
          )}
        </div>
      </div>

      {/* input mode */}
      <div className="border-b border-white/5 px-4 py-3">
        <Segmented<InputMode>
          value={settings.mode}
          onChange={(v) => update({ mode: v })}
          options={[
            {
              value: 'sequence',
              title: 'One block, revealed top-to-bottom',
              label: (
                <span className="flex items-center gap-1.5">
                  <ListVideo className="h-3.5 w-3.5" /> Sequence
                </span>
              ),
            },
            {
              value: 'steps',
              title: 'Multiple snapshots, like slides',
              label: (
                <span className="flex items-center gap-1.5">
                  <Layers className="h-3.5 w-3.5" /> Steps
                </span>
              ),
            },
          ]}
        />
      </div>

      {settings.mode === 'steps' && step && (
        <div className="border-b border-white/5 px-4 py-3">
          {/* step chips */}
          <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
            {steps.map((s, i) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setActiveStep(i)}
                title={s.title || `Step ${i + 1}`}
                className={`flex h-7 min-w-7 cursor-pointer items-center justify-center rounded-md px-2 text-[12px] font-medium tabular-nums transition-all ${
                  i === active
                    ? 'bg-accent-500/20 text-accent-300 ring-1 ring-accent-500/40'
                    : 'bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200'
                }`}
              >
                {i + 1}
              </button>
            ))}
            <button
              type="button"
              onClick={addStep}
              title="Add step after current"
              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-zinc-400 ring-1 ring-white/10 transition-all hover:bg-white/10 hover:text-white"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* step toolbar */}
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => moveStep(-1)} disabled={active === 0} title="Move left" className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-zinc-400 transition-all hover:bg-white/10 hover:text-white disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => moveStep(1)} disabled={active === steps.length - 1} title="Move right" className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-zinc-400 transition-all hover:bg-white/10 hover:text-white disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent">
              <ChevronRight className="h-4 w-4" />
            </button>
            <button type="button" onClick={duplicateStep} title="Duplicate step" className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-zinc-400 transition-all hover:bg-white/10 hover:text-white">
              <Copy className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={deleteStep} disabled={steps.length <= 1} title="Delete step" className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-zinc-400 transition-all hover:bg-rose-500/15 hover:text-rose-300 disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-zinc-400">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
            <span className="ml-auto text-[11px] text-zinc-600 tabular-nums">
              Step {active + 1} / {steps.length}
            </span>
          </div>

          {/* step caption */}
          <input
            value={step.title}
            onChange={(e) => updateStep(active, { title: e.target.value })}
            placeholder="Step caption (optional)…"
            className="mt-3 w-full rounded-lg border border-white/10 bg-ink-800 px-3 py-1.5 text-[13px] text-zinc-200 outline-none transition-colors placeholder:text-zinc-600 focus:border-accent-500"
          />

          {/* per-step transition override — the first step is the intro, so it has none */}
          {active > 0 && (
            <label className="mt-3 flex items-center justify-between gap-3">
              <span className="text-[13px] text-zinc-400">Transition in</span>
              <Select
                className="w-[150px]"
                value={step.transition ?? 'default'}
                options={[
                  { value: 'default', label: `Default (${TRANSITIONS.find((t) => t.id === settings.transition)?.label})` },
                  ...TRANSITIONS.map((t) => ({ value: t.id, label: t.label })),
                ]}
                onChange={(v) => updateStep(active, { transition: v === 'default' ? null : (v as TransitionStyle) })}
              />
            </label>
          )}
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col">
        <CodeEditor
          className="min-h-0 flex-1"
          value={settings.mode === 'steps' ? step?.code ?? '' : settings.code}
          language={settings.language}
          onChange={(v) =>
            settings.mode === 'steps' ? updateStep(active, { code: v }) : update({ code: v })
          }
          placeholder="Paste your code here…"
        />
        {settings.mode === 'sequence' && settings.console !== null && (
          <div className="flex min-h-0 flex-1 flex-col border-t border-white/10">
            <div className="flex items-center justify-between px-4 py-2">
              <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-emerald-400/80">
                <Terminal className="h-3.5 w-3.5" />
                Console
              </div>
              <button
                type="button"
                onClick={() => update({ console: null })}
                title="Remove console section"
                className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-200"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <CodeEditor
              className="min-h-0 flex-1"
              value={settings.console}
              language="bash"
              onChange={(v) => update({ console: v })}
              placeholder="$ Add console output here…"
            />
          </div>
        )}
      </div>

      {/* steps mode: default transition + timing */}
      {settings.mode === 'steps' && (
        <div className="flex flex-col gap-3 border-t border-white/5 px-4 py-3">
          <label className="flex items-center justify-between gap-3">
            <span className="text-[13px] text-zinc-400">Default transition</span>
            <Select
              className="w-[150px]"
              value={settings.transition}
              options={TRANSITIONS.map((t) => ({ value: t.id, label: t.label }))}
              onChange={(v) => update({ transition: v as TransitionStyle })}
            />
          </label>
          <Slider label="Hold per step" value={settings.stepHold} min={0} max={4} step={0.1} unit="s" onChange={(v) => update({ stepHold: v })} />
          <Slider label="Transition time" value={settings.transitionDur} min={0.2} max={2} step={0.1} unit="s" onChange={(v) => update({ transitionDur: v })} />
        </div>
      )}

      <div className="flex items-center justify-between border-t border-white/5 px-4 py-2 text-[11px] text-zinc-600">
        <span>
          {lineCount} {lineCount === 1 ? 'line' : 'lines'}
          {settings.mode === 'steps' ? ` · step ${active + 1}` : ` · ${settings.code.length} chars`}
        </span>
        <button
          type="button"
          onClick={() =>
            settings.mode === 'steps'
              ? update({ steps: makeDefaultSteps() })
              : update({ code: SAMPLES[settings.language] })
          }
          className="cursor-pointer rounded px-1.5 py-0.5 text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-300"
        >
          Reset sample
        </button>
      </div>
    </aside>
  )
}
