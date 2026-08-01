export type Language =
  | 'javascript'
  | 'typescript'
  | 'python'
  | 'rust'
  | 'go'
  | 'css'
  | 'html'
  | 'json'
  | 'bash'

export const LANGUAGES: { id: Language; label: string }[] = [
  { id: 'typescript', label: 'TypeScript' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'python', label: 'Python' },
  { id: 'rust', label: 'Rust' },
  { id: 'go', label: 'Go' },
  { id: 'css', label: 'CSS' },
  { id: 'html', label: 'HTML' },
  { id: 'json', label: 'JSON' },
  { id: 'bash', label: 'Bash' },
]

export type AnimationStyle = 'typewriter' | 'fade' | 'slide' | 'flip'
export type Aspect = '16:9' | '1:1' | '9:16'
export type Format = 'mp4' | 'gif' | 'webm'

/** How the user authors code: one sequentially-revealed block, or a series of snapshots. */
export type InputMode = 'sequence' | 'steps'

/** How a step reveals its inserted code relative to the previous step. */
export type TransitionStyle = 'diff' | 'crossfade' | 'typewriter' | 'flip3d'

export const TRANSITIONS: { id: TransitionStyle; label: string }[] = [
  { id: 'diff', label: 'Diff reveal' },
  { id: 'crossfade', label: 'Crossfade' },
  { id: 'typewriter', label: 'Typewriter' },
  { id: 'flip3d', label: 'Flip 3D' },
]

export interface Step {
  id: string
  /** Full code snapshot at this step. */
  code: string
  /** Optional caption shown while the step holds. */
  title: string
  /** Transition used to reach this step from the previous one; null = use global default. */
  transition: TransitionStyle | null
}

export const ASPECTS: { id: Aspect; ratio: number; res: string }[] = [
  { id: '16:9', ratio: 16 / 9, res: '1920×1080' },
  { id: '1:1', ratio: 1, res: '1080×1080' },
  { id: '9:16', ratio: 9 / 16, res: '1080×1920' },
]

export const FONTS: { id: string; label: string; stack: string }[] = [
  { id: 'jetbrains', label: 'JetBrains Mono', stack: "'JetBrains Mono', monospace" },
  { id: 'fira', label: 'Fira Code', stack: "'Fira Code', monospace" },
  { id: 'plex', label: 'IBM Plex Mono', stack: "'IBM Plex Mono', monospace" },
  { id: 'source', label: 'Source Code Pro', stack: "'Source Code Pro', monospace" },
  { id: 'sf', label: 'SF Mono (system)', stack: 'ui-monospace, SFMono-Regular, Menlo, monospace' },
]

export interface Settings {
  // input
  mode: InputMode
  code: string
  console: string | null
  steps: Step[]
  /** global default transition for steps that don't override it */
  transition: TransitionStyle
  /** seconds each step lingers fully-revealed before the next transition */
  stepHold: number
  /** seconds a step→step transition takes */
  transitionDur: number

  language: Language
  themeId: string
  backgroundId: string
  customBg: string | null
  chrome: boolean
  windowTitle: string
  lineNumbers: boolean
  padding: number
  fontSize: number
  fontId: string
  radius: number
  shadow: number
  /** 3D perspective tilt intensity in degrees, 0 = flat-on */
  tilt: number
  /** tilt direction, horizontal: -1 = face left … 1 = face right, 0 = none */
  tiltX: number
  /** tilt direction, vertical: -1 = look up at … 1 = look down at, 0 = none */
  tiltY: number
  animation: AnimationStyle
  duration: number
  speed: number
  loop: boolean
  aspect: Aspect
  format: Format
}
