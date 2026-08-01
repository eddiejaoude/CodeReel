import { useMemo, type ReactNode } from 'react'
import type { Settings } from '../lib/types'
import { ASPECTS, FONTS } from '../lib/types'
import { BACKGROUNDS, THEMES } from '../lib/themes'
import { lineLength, tokenizeLines, type Token } from '../lib/highlight'
import { useElementSize } from '../lib/usePlayback'
import { addedIndices, diffLineStatus, type LineStatus } from '../lib/diff'
import { buildTimeline, locate } from '../lib/timeline'

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const clamp01 = (t: number) => Math.min(1, Math.max(0, t))

function TokenSpans({ tokens, colors, fg }: { tokens: Token[]; colors: Record<string, string | undefined>; fg: string }) {
  return (
    <>
      {tokens.map((tok, i) => (
        <span key={i} style={{ color: colors[tok.t] ?? fg, fontStyle: tok.t === 'comment' ? 'italic' : undefined }}>
          {tok.s}
        </span>
      ))}
    </>
  )
}

/** Slice a token line to its first `chars` characters. */
function sliceLine(tokens: Token[], chars: number): Token[] {
  const out: Token[] = []
  let used = 0
  for (const tok of tokens) {
    if (used >= chars) break
    const take = Math.min(tok.s.length, chars - used)
    out.push(take === tok.s.length ? tok : { t: tok.t, s: tok.s.slice(0, take) })
    used += take
  }
  return out
}

interface RowCtx {
  colors: Record<string, string | undefined>
  fg: string
  lineNumberColor: string
  caretColor: string
  lineNumbers: boolean
  lineHeightPx: number
}

function CodeRow({
  ctx,
  idx,
  tokens,
  heightPx,
  opacity = 1,
  tx = 0,
  ty = 0,
  tz = 0,
  rotX = 0,
  blur = 0,
  highlight = 0,
  clip = false,
  caret,
}: {
  ctx: RowCtx
  idx: number
  tokens: Token[]
  heightPx?: number
  opacity?: number
  tx?: number
  ty?: number
  tz?: number
  rotX?: number
  blur?: number
  highlight?: number
  clip?: boolean
  caret?: ReactNode
}) {
  const transform =
    tx || ty || tz || rotX
      ? `translate3d(${tx}px, ${ty}px, ${tz}px)${rotX ? ` rotateX(${rotX}deg)` : ''}`
      : undefined
  return (
    <div
      className="flex whitespace-pre"
      style={{
        height: heightPx ?? ctx.lineHeightPx,
        opacity,
        transform,
        transformOrigin: rotX ? '50% 0%' : undefined,
        filter: blur ? `blur(${blur}px)` : undefined,
        overflow: clip ? 'hidden' : undefined,
        background: highlight > 0 ? `rgba(124,131,253,${0.16 * highlight})` : undefined,
        borderRadius: highlight > 0 ? 4 : undefined,
      }}
    >
      {ctx.lineNumbers && (
        <span
          className="mr-4 w-6 shrink-0 text-right select-none tabular-nums"
          style={{ color: ctx.lineNumberColor, opacity: 0.8 }}
        >
          {idx + 1}
        </span>
      )}
      <span>
        {tokens.length ? <TokenSpans tokens={tokens} colors={ctx.colors} fg={ctx.fg} /> : ' '}
        {caret}
      </span>
    </div>
  )
}

/** Sequential reveal (typewriter / fade / slide) of one snapshot — the classic motion. */
function revealRows(
  lines: Token[][],
  animation: Settings['animation'],
  revealT: number,
  playing: boolean,
  ctx: RowCtx,
): ReactNode[] {
  const n = lines.length

  if (animation === 'typewriter') {
    const starts: number[] = []
    let acc = 0
    for (const line of lines) {
      starts.push(acc)
      acc += lineLength(line) + 1
    }
    const total = Math.max(1, acc)
    const revealed = Math.floor(revealT * total)
    const done = revealT >= 1
    return lines.map((line, i) => {
      const len = lineLength(line)
      const lineChars = Math.max(0, Math.min(len, revealed - starts[i]))
      const complete = revealed >= starts[i] + len + 1
      const active = !complete && revealed >= starts[i] && !done
      const toks = done ? line : sliceLine(line, lineChars)
      return (
        <CodeRow
          key={i}
          ctx={ctx}
          idx={i}
          tokens={toks}
          caret={
            <>
              {active && (
                <span className={playing ? '' : 'caret-blink'} style={{ color: ctx.caretColor, marginLeft: 1 }}>
                  ▍
                </span>
              )}
              {!done && <span className="invisible">{line.map((t) => t.s).join('').slice(lineChars)}</span>}
            </>
          }
        />
      )
    })
  }

  // fade / slide / flip: staggered per-line reveal
  const stagger = n > 1 ? 0.72 / (n - 1) : 0
  const lineDur = Math.max(0.28, stagger * 2.2)
  return lines.map((line, i) => {
    const t = easeOutCubic(clamp01((revealT - i * stagger) / lineDur))
    const rest = 1 - t
    const tx = animation === 'slide' ? rest * -32 : 0
    const ty = animation === 'fade' ? rest * 14 : 0
    // flip: each line hinges down from its top edge and rises out of depth
    const rotX = animation === 'flip' ? rest * 82 : 0
    const tz = animation === 'flip' ? rest * -60 : 0
    const blur = animation === 'flip' ? rest * 2.5 : 0
    return (
      <CodeRow key={i} ctx={ctx} idx={i} tokens={line} opacity={t} tx={tx} ty={ty} tz={tz} rotX={rotX} blur={blur} />
    )
  })
}

/** Fully-revealed snapshot (used while a step holds). */
function fullRows(lines: Token[][], ctx: RowCtx): ReactNode[] {
  return lines.map((line, i) => <CodeRow key={i} ctx={ctx} idx={i} tokens={line} />)
}

/** Diff reveal: carried-over lines sit still, inserted lines grow + glow into place. */
function diffRows(nextLines: Token[][], status: LineStatus[], t: number, ctx: RowCtx): ReactNode[] {
  const added = addedIndices(status)
  const A = added.length
  const rank = new Map<number, number>()
  added.forEach((idx, k) => rank.set(idx, k))
  const reveal = (k: number) => {
    if (A <= 1) return easeOutCubic(t)
    const seg = 1 / A
    const start = k * seg * 0.55
    const span = seg * 0.55 + 0.45
    return easeOutCubic(clamp01((t - start) / span))
  }
  return nextLines.map((line, i) => {
    if (status[i] === 'same') return <CodeRow key={i} ctx={ctx} idx={i} tokens={line} />
    const r = reveal(rank.get(i) ?? 0)
    return (
      <CodeRow
        key={i}
        ctx={ctx}
        idx={i}
        tokens={line}
        heightPx={r * ctx.lineHeightPx}
        opacity={clamp01(r * 1.4)}
        highlight={1 - r}
        clip
      />
    )
  })
}

/** Typewriter transition: inserted lines type in at their insertion point. */
function typeInRows(nextLines: Token[][], status: LineStatus[], t: number, playing: boolean, ctx: RowCtx): ReactNode[] {
  const added = addedIndices(status)
  const totalChars = Math.max(1, added.reduce((s, i) => s + lineLength(nextLines[i]), 0))
  const revealChars = Math.floor(t * totalChars)
  const typed = new Map<number, number>()
  let consumed = 0
  for (const i of added) {
    const len = lineLength(nextLines[i])
    typed.set(i, Math.max(0, Math.min(len, revealChars - consumed)))
    consumed += len
  }
  let frontier = -1
  for (const i of added) {
    if ((typed.get(i) ?? 0) < lineLength(nextLines[i])) {
      frontier = i
      break
    }
  }
  return nextLines.map((line, i) => {
    if (status[i] === 'same') return <CodeRow key={i} ctx={ctx} idx={i} tokens={line} />
    const c = typed.get(i) ?? 0
    const active = i === frontier && t < 1
    return (
      <CodeRow
        key={i}
        ctx={ctx}
        idx={i}
        tokens={sliceLine(line, c)}
        caret={
          <>
            {active && (
              <span className={playing ? '' : 'caret-blink'} style={{ color: ctx.caretColor, marginLeft: 1 }}>
                ▍
              </span>
            )}
            {t < 1 && <span className="invisible">{line.map((tok) => tok.s).join('').slice(c)}</span>}
          </>
        }
      />
    )
  })
}

function revealConsoleRows(lines: Token[][], revealT: number, playing: boolean, ctx: RowCtx): ReactNode[] {
  let total = 0
  const starts = lines.map((line) => {
    const start = total
    total += lineLength(line) + 1
    return start
  })
  const revealed = Math.floor(clamp01(revealT) * Math.max(1, total))
  const done = revealT >= 1

  return lines.map((line, i) => {
    const len = lineLength(line)
    const chars = done ? len : Math.max(0, Math.min(len, revealed - starts[i]))
    const active = !done && revealed >= starts[i] && chars < len
    return (
      <div key={i} className="flex whitespace-pre">
        <span style={{ color: ctx.caretColor }}>$ </span>
        <span>
          <TokenSpans tokens={sliceLine(line, chars)} colors={ctx.colors} fg={ctx.fg} />
          {active && (
            <span className={playing ? '' : 'caret-blink'} style={{ color: ctx.caretColor, marginLeft: 1 }}>
              ▍
            </span>
          )}
          {!done && <span className="invisible">{line.map((tok) => tok.s).join('').slice(chars)}</span>}
        </span>
      </div>
    )
  })
}

export function PreviewCanvas({
  settings,
  progress,
  playing,
}: {
  settings: Settings
  progress: number
  playing: boolean
}) {
  const theme = THEMES.find((t) => t.id === settings.themeId) ?? THEMES[0]
  const background =
    settings.customBg ?? (BACKGROUNDS.find((b) => b.id === settings.backgroundId) ?? BACKGROUNDS[0]).css
  const font = FONTS.find((f) => f.id === settings.fontId) ?? FONTS[0]
  const aspect = ASPECTS.find((a) => a.id === settings.aspect) ?? ASPECTS[0]

  const isSteps = settings.mode === 'steps' && settings.steps.length > 0
  const lineHeightPx = settings.fontSize * 1.65

  const ctx: RowCtx = {
    colors: theme.colors,
    fg: theme.fg,
    lineNumberColor: theme.lineNumber,
    caretColor: theme.caret,
    lineNumbers: settings.lineNumbers,
    lineHeightPx,
  }

  // sequence mode: one snapshot
  const seqLines = useMemo(
    () => tokenizeLines(settings.code, settings.language),
    [settings.code, settings.language],
  )

  // steps mode: tokenize every snapshot once
  const stepLines = useMemo(
    () => settings.steps.map((s) => tokenizeLines(s.code, settings.language)),
    [settings.steps, settings.language],
  )

  const timeline = useMemo(() => buildTimeline(settings), [settings])

  // reserve height for the tallest snapshot so the window never jumps between steps
  const maxLines = isSteps
    ? Math.max(1, ...stepLines.map((l) => l.length))
    : seqLines.length
  const codeMinHeight = maxLines * lineHeightPx

  // build the inner code rows for the current frame
  let rows: ReactNode
  if (!isSteps) {
    const { phase, localT } = locate(timeline, progress)
    const codeRows = phase.kind === 'console'
      ? fullRows(seqLines, ctx)
      : revealRows(seqLines, settings.animation, localT, playing, ctx)
    rows = (
      <>
        <div style={{ minHeight: codeMinHeight }}>{codeRows}</div>
        {settings.console !== null && (
          <div
            className="mt-5 overflow-hidden rounded-lg border border-white/10"
            style={{
              background: 'rgba(0,0,0,0.2)',
              opacity: phase.kind === 'console' ? 1 : 0,
              transform: phase.kind === 'console' ? undefined : 'translateY(10px)',
              transition: 'opacity 180ms ease, transform 180ms ease',
            }}
          >
            <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2 text-[10px] font-medium uppercase tracking-[0.16em]" style={{ color: theme.lineNumber }}>
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              Console
            </div>
            <div className="px-3 py-3" style={{ minHeight: lineHeightPx * Math.max(1, tokenizeLines(settings.console, 'bash').length) + 24 }}>
              {revealConsoleRows(tokenizeLines(settings.console, 'bash'), phase.kind === 'console' ? localT : 0, playing, ctx)}
            </div>
          </div>
        )}
      </>
    )
  } else {
    const { phase, localT } = locate(timeline, progress)
    if (phase.kind === 'reveal') {
      rows = revealRows(stepLines[0] ?? [], settings.animation, localT, playing, ctx)
    } else if (phase.kind === 'hold') {
      rows = fullRows(stepLines[phase.step] ?? [], ctx)
    } else {
      // transition from → step
      const nextLines = stepLines[phase.step] ?? []
      const prevLines = stepLines[phase.from ?? phase.step] ?? []
      const style = phase.style ?? 'diff'
      if (style === 'crossfade') {
        rows = (
          <div className="relative">
            <div className="pointer-events-none absolute inset-0" style={{ opacity: 1 - easeOutCubic(localT) }}>
              {fullRows(prevLines, ctx)}
            </div>
            <div style={{ opacity: easeOutCubic(localT) }}>{fullRows(nextLines, ctx)}</div>
          </div>
        )
      } else if (style === 'flip3d') {
        // card flip: the outgoing snapshot swings to edge-on, the incoming swings in from the other side
        const showOut = localT < 0.5
        const outY = easeInOutCubic(clamp01(localT / 0.5)) * 90
        const inY = -90 + easeInOutCubic(clamp01((localT - 0.5) / 0.5)) * 90
        rows = (
          <div className="relative" style={{ perspective: '1700px' }}>
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                transform: `rotateY(${outY}deg)`,
                transformOrigin: 'center',
                backfaceVisibility: 'hidden',
                opacity: showOut ? 1 : 0,
              }}
            >
              {fullRows(prevLines, ctx)}
            </div>
            <div
              style={{
                transform: `rotateY(${inY}deg)`,
                transformOrigin: 'center',
                backfaceVisibility: 'hidden',
                opacity: showOut ? 0 : 1,
              }}
            >
              {fullRows(nextLines, ctx)}
            </div>
          </div>
        )
      } else {
        const status = diffLineStatus(settings.steps[phase.from ?? 0].code, settings.steps[phase.step].code)
        rows =
          style === 'typewriter'
            ? typeInRows(nextLines, status, localT, playing, ctx)
            : diffRows(nextLines, status, localT, ctx)
      }
    }
  }

  // stage → canvas sizing
  const [stageRef, stage] = useElementSize<HTMLDivElement>()
  const pad = 28
  const availW = Math.max(0, stage.w - pad * 2)
  const availH = Math.max(0, stage.h - pad * 2)
  let canvasW = Math.min(availW, availH * aspect.ratio)
  let canvasH = canvasW / aspect.ratio
  if (canvasH > availH) {
    canvasH = availH
    canvasW = canvasH * aspect.ratio
  }

  // window auto-fit: measure natural size, scale down to fit inside padding
  const [windowRef, win] = useElementSize<HTMLDivElement>()
  const innerW = Math.max(0, canvasW - settings.padding * 2)
  const innerH = Math.max(0, canvasH - settings.padding * 2)
  const scale = win.w > 0 && win.h > 0 ? Math.min(1, innerW / win.w, innerH / win.h) : 1

  const isTransparent = background === 'transparent'
  const shadowA = 0.22 + settings.shadow * 0.004
  const boxShadow =
    settings.shadow === 0
      ? 'none'
      : `0 ${settings.shadow * 0.45}px ${settings.shadow * 1.1}px -${settings.shadow * 0.18}px rgba(0,0,0,${shadowA})`

  // 3D window tilt: the direction pad picks which way it faces, `tilt` sets the angle
  const tilted = settings.tilt > 0 && (settings.tiltX !== 0 || settings.tiltY !== 0)
  const windowTilt = tilted
    ? `rotateY(${settings.tiltX * settings.tilt}deg) rotateX(${settings.tiltY * settings.tilt}deg)`
    : undefined

  return (
    <div ref={stageRef} className="stage-grid relative flex min-h-0 flex-1 items-center justify-center overflow-hidden">
      {canvasW > 40 && (
        <div
          className={`relative flex items-center justify-center overflow-hidden rounded-xl ring-1 ring-white/10 ${isTransparent ? 'checkerboard' : ''}`}
          style={{ width: canvasW, height: canvasH, background: isTransparent ? undefined : background }}
        >
          {!isTransparent && (
            <div
              className="pointer-events-none absolute inset-0"
              style={{ background: 'radial-gradient(120% 90% at 50% 40%, transparent 55%, rgba(0,0,0,0.18))' }}
            />
          )}

          <div style={{ transform: `scale(${scale})`, perspective: tilted ? '1600px' : undefined }}>
            <div
              ref={windowRef}
              className="overflow-hidden"
              style={{
                background: theme.bg,
                borderRadius: settings.radius,
                boxShadow,
                border: '1px solid rgba(255,255,255,0.08)',
                transform: windowTilt,
                transformOrigin: 'center center',
              }}
            >
              {settings.chrome && (
                <div className="relative flex h-9 items-center px-3.5" style={{ background: theme.chromeBg }}>
                  <div className="flex items-center gap-[7px]">
                    <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
                    <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
                    <span className="h-3 w-3 rounded-full bg-[#28c840]" />
                  </div>
                  {settings.windowTitle && (
                    <span
                      className="absolute inset-x-16 text-center text-[12px] font-medium tracking-wide"
                      style={{ color: theme.fg, opacity: 0.45 }}
                    >
                      {settings.windowTitle}
                    </span>
                  )}
                </div>
              )}

              <div
                className="px-5 py-4"
                style={{
                  fontFamily: font.stack,
                  fontSize: settings.fontSize,
                  lineHeight: `${lineHeightPx}px`,
                  color: theme.fg,
                  minHeight: codeMinHeight,
                  perspective: '1400px',
                }}
              >
                {rows}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
