import {
  Boxes,
  Braces,
  Grip,
  Keyboard,
  MoveRight,
  Pause,
  Play,
  Repeat,
  RotateCcw,
  Rotate3d,
  ScanLine,
  SkipBack,
  SkipForward,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'
import type { AnimationStyle, Settings } from '../lib/types'
import type { Playback } from '../lib/usePlayback'
import { currentStep, stepAnchor, type Timeline } from '../lib/timeline'
import { Segmented, Select } from './ui'

function fmt(seconds: number): string {
  return `${seconds.toFixed(1)}s`
}

/**
 * Motion options. The DOM and WebGL renderers reveal differently, so each option
 * carries a WebGL-specific label/icon/title that describes what you actually see
 * in 3D mode (e.g. the flip reveal is a glowing scan, tokens is a pixel dissolve).
 */
interface MotionOpt {
  value: AnimationStyle
  label: string
  title: string
  Icon: LucideIcon
  /** WebGL-mode overrides (fall back to the DOM values when absent) */
  wLabel?: string
  wTitle?: string
  WIcon?: LucideIcon
}

const MOTIONS: MotionOpt[] = [
  {
    value: 'typewriter',
    label: 'Type',
    title: 'Typewriter',
    Icon: Keyboard,
    wTitle: 'Type-on wipe',
  },
  { value: 'fade', label: 'Fade', title: 'Fade lines in', Icon: Sparkles, wTitle: 'Soft fade in' },
  {
    value: 'slide',
    label: 'Slide',
    title: 'Slide lines in',
    Icon: MoveRight,
    wTitle: 'Slide in from the left',
  },
  {
    value: 'flip',
    label: '3D',
    title: '3D flip-up reveal',
    Icon: Rotate3d,
    wLabel: 'Scan',
    wTitle: 'Glowing top-down scan',
    WIcon: ScanLine,
  },
  {
    value: 'tokens',
    label: 'Tokens',
    title: 'Per-token cascade',
    Icon: Braces,
    wLabel: 'Dissolve',
    wTitle: 'Grainy pixel dissolve',
    WIcon: Grip,
  },
  {
    value: 'shatter',
    label: 'Shatter',
    title: 'Lines fly in from scattered shards',
    Icon: Boxes,
    wTitle: 'Code assembles from tumbling shards',
  },
]

export function PlaybackBar({
  settings,
  update,
  playback,
  totalDuration,
  timeline,
  onStep,
}: {
  settings: Settings
  update: (patch: Partial<Settings>) => void
  playback: Playback
  totalDuration: number
  timeline: Timeline
  onStep: (target: number) => void
}) {
  const current = playback.progress * totalDuration
  const isSteps = settings.mode === 'steps'
  const stepNow = isSteps ? currentStep(timeline, playback.progress) : 0

  return (
    <div className="min-w-0 shrink-0 border-t border-white/5 bg-ink-900 px-3 pt-3 pb-3 sm:px-5 sm:pb-4">
      {/* timeline */}
      <div className="flex items-center gap-2 sm:gap-3">
        <span className="w-10 text-right font-mono text-[11px] text-zinc-500 tabular-nums">
          {fmt(current)}
        </span>
        <div className="relative min-w-0 flex-1">
          <input
            type="range"
            min={0}
            max={1000}
            value={Math.round(playback.progress * 1000)}
            style={{
              ['--fill' as string]: `${playback.progress * 100}%`,
              ['--track-h' as string]: '6px',
            }}
            className="w-full"
            onPointerDown={playback.beginScrub}
            onPointerUp={playback.endScrub}
            onChange={(e) => playback.seek(Number(e.target.value) / 1000)}
          />
          {/* step markers */}
          {isSteps &&
            settings.steps.map((s, i) => {
              const left = stepAnchor(timeline, i) * 100
              const reached = stepNow >= i
              return (
                <button
                  key={s.id}
                  type="button"
                  title={s.title || `Step ${i + 1}`}
                  onClick={() => onStep(i)}
                  className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-full ring-2 ring-ink-900 transition-colors"
                  style={{ left: `${left}%`, background: reached ? '#7c83fd' : '#3f3f52' }}
                />
              )
            })}
        </div>
        <span className="w-10 font-mono text-[11px] text-zinc-500 tabular-nums">
          {fmt(totalDuration)}
        </span>
      </div>

      {/* active step caption */}
      {isSteps && settings.steps[stepNow]?.title && (
        <div className="mt-1.5 text-center text-[12px] text-zinc-400">
          <span className="font-mono text-zinc-600">{stepNow + 1}.</span>{' '}
          {settings.steps[stepNow].title}
        </div>
      )}

      {/* controls */}
      <div
        role="group"
        aria-label="Playback controls"
        className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2.5"
      >
        <div className="flex shrink-0 items-center gap-1.5">
          {isSteps && (
            <button
              type="button"
              onClick={() => onStep(stepNow - 1)}
              disabled={stepNow === 0}
              title="Previous step (←)"
              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-zinc-400 transition-all duration-150 hover:bg-white/8 hover:text-white active:scale-95 disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <SkipBack className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={playback.restart}
            title="Restart (R)"
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-zinc-400 transition-all duration-150 hover:bg-white/8 hover:text-white active:scale-95"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={playback.toggle}
            title="Play / pause (Space)"
            className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-gradient-to-br from-accent-500 to-fuchsia-500 text-white shadow-lg shadow-accent-500/25 transition-all duration-150 hover:brightness-110 active:scale-95"
          >
            {playback.playing ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
          </button>
          {isSteps && (
            <button
              type="button"
              onClick={() => onStep(stepNow + 1)}
              disabled={stepNow >= settings.steps.length - 1}
              title="Next step (→)"
              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-zinc-400 transition-all duration-150 hover:bg-white/8 hover:text-white active:scale-95 disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <SkipForward className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => update({ loop: !settings.loop })}
            title="Loop"
            className={`flex h-9 w-9 cursor-pointer items-center justify-center rounded-full transition-all duration-150 active:scale-95 ${
              settings.loop
                ? 'bg-accent-500/15 text-accent-400 ring-1 ring-accent-500/30'
                : 'text-zinc-400 hover:bg-white/8 hover:text-white'
            }`}
          >
            <Repeat className="h-4 w-4" />
          </button>
        </div>

        <div className="hidden h-6 w-px shrink-0 bg-white/8 sm:block" />

        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-[11px] font-medium tracking-wide text-zinc-500 uppercase">
            {isSteps ? 'Intro' : 'Motion'}
          </span>
          <Segmented<AnimationStyle>
            value={settings.animation}
            onChange={(v) => {
              update({ animation: v })
              playback.restart()
            }}
            options={MOTIONS.map((m) => {
              const Icon = m.WIcon || m.Icon
              return {
                value: m.value,
                title: m.wTitle || m.title,
                label: (
                  <span className="flex items-center gap-1.5">
                    <Icon className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">{m.wLabel || m.label}</span>
                  </span>
                ),
              }
            })}
          />
        </div>

        <div className="flex w-full min-w-0 flex-wrap items-center gap-x-4 gap-y-2 lg:ml-auto lg:w-auto lg:shrink-0 lg:flex-nowrap">
          {isSteps && (
            <span className="text-[11px] font-medium tracking-wide text-zinc-500 tabular-nums">
              Step {stepNow + 1} / {settings.steps.length}
            </span>
          )}
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium tracking-wide text-zinc-500 uppercase">
              {isSteps ? 'Reveal' : 'Duration'}
            </span>
            <Select
              className="w-[76px]"
              value={String(settings.duration)}
              options={[3, 5, 8, 10, 15].map((s) => ({ value: String(s), label: `${s}s` }))}
              onChange={(v) => update({ duration: Number(v) })}
            />
          </div>
          <div className="flex items-center gap-2">
            <span
              className="text-[11px] font-medium tracking-wide text-zinc-500 uppercase"
              title="Freeze-frame hold at the end — the finished result lingers and gently hovers"
            >
              End hold
            </span>
            <Select
              className="w-[76px]"
              value={String(settings.outro)}
              options={[0, 1.5, 3, 5, 10].map((s) => ({
                value: String(s),
                label: s === 0 ? 'Off' : `${s}s`,
              }))}
              onChange={(v) => update({ outro: Number(v) })}
            />
          </div>
          <div className="flex items-center gap-2">
            <span
              className="text-[11px] font-medium tracking-wide text-zinc-500 uppercase"
              title="Seamless loop — the card materialises from nothing and dissolves back to it, so the take loops with no visible cut"
            >
              Seamless loop
            </span>
            <button
              type="button"
              onClick={() => update({ loopWrap: !settings.loopWrap })}
              className={`h-7 cursor-pointer rounded-full px-3 text-[11px] font-medium transition-all duration-150 active:scale-95 ${
                settings.loopWrap
                  ? 'bg-accent-500/15 text-accent-400 ring-1 ring-accent-500/30'
                  : 'text-zinc-400 ring-1 ring-white/10 hover:bg-white/8 hover:text-white'
              }`}
            >
              {settings.loopWrap ? 'On' : 'Off'}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium tracking-wide text-zinc-500 uppercase">
              Speed
            </span>
            <Segmented<string>
              size="sm"
              value={String(settings.speed)}
              onChange={(v) => update({ speed: Number(v) })}
              options={['0.5', '1', '1.5', '2'].map((s) => ({ value: s, label: `${s}×` }))}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
