/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string
  readonly VITE_SHOPPING_CITY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/**
 * `requestVideoFrameCallback` drives the scan loop: it fires once per decoded
 * video frame rather than on a fixed timer, so we never decode the same frame
 * twice and never miss one. Supported in Safari 15.4+ and Chromium, but still
 * absent from lib.dom.d.ts, hence this declaration. The scanner falls back to
 * requestAnimationFrame where it is missing.
 */
interface VideoFrameCallbackMetadata {
  presentationTime: DOMHighResTimeStamp
  expectedDisplayTime: DOMHighResTimeStamp
  width: number
  height: number
  mediaTime: number
  presentedFrames: number
  processingDuration?: number
}

interface HTMLVideoElement {
  requestVideoFrameCallback?: (
    callback: (now: DOMHighResTimeStamp, metadata: VideoFrameCallbackMetadata) => void,
  ) => number
  cancelVideoFrameCallback?: (handle: number) => void
}

/**
 * Torch and focus are real, widely-shipped MediaTrack capabilities that the
 * standard typings still omit.
 */
interface MediaTrackCapabilities {
  torch?: boolean
  zoom?: { min: number; max: number; step: number }
  focusMode?: string[]
}

interface MediaTrackConstraintSet {
  torch?: boolean
  zoom?: number
  focusMode?: string
}
