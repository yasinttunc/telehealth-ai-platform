/*
 * Realtime room adapter for consultation audio, video, and captions.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The consultation UI must be buildable, reviewable, and demonstrable before
 * the LiveKit SDK and the Python transcription worker are wired up. Every
 * LiveKit-specific call therefore sits behind this one small interface:
 *
 *   - The page only knows about `joinRoom(...)` and a `RoomSession`.
 *   - When no client is registered, `joinRoom` rejects with a clear reason and
 *     the video panel shows an honest "not configured" state instead of
 *     pretending a call is available.
 *   - Enabling real video is a single-file change (see ENABLING LIVEKIT below).
 *
 * SAFETY
 * ------
 * The browser never receives a LiveKit API secret. `serverUrl` and `token` come
 * from Spring, which signs a short-lived, room-scoped join token only after it
 * has verified consultation ownership.
 */

import type { SpeakerRole } from '../../types/domain'

/** One caption line received over the room data channel. */
export interface RoomCaption {
  text: string
  /**
   * Speaker the worker attributed this caption to. The worker derives it from
   * the LiveKit participant identity against the role map Spring issued at
   * bootstrap, so it is trusted the same way a stored segment's role is.
   *
   * Optional because a caption may arrive as plain text from a simpler worker.
   */
  speakerRole?: SpeakerRole
  /**
   * `false` = interim ASR hypothesis. Interim text is transient UI only: it is
   * never persisted, never shown as the record, and never sent to an LLM.
   */
  final: boolean
  receivedAt: number
}

/** Data-channel topics published by the Python transcription worker. */
export const CAPTION_TOPIC_INTERIM = 'telehealth.caption.interim'
export const CAPTION_TOPIC_FINAL = 'telehealth.caption.final'

export interface RoomJoinOptions {
  serverUrl: string
  token: string
  /** Element that shows this participant's own camera. */
  localVideoElement: HTMLVideoElement | null
  /** Element that shows the other party's camera. */
  remoteVideoElement: HTMLVideoElement | null
  /** Publish camera and microphone. The transcription worker never publishes. */
  publishMedia: boolean
  onCaption: (caption: RoomCaption) => void
  /** Remote participant count, used to show "waiting for the other party". */
  onRemoteCountChange: (count: number) => void
  onDisconnected: (reason?: string) => void
}

export interface RoomSession {
  disconnect: () => Promise<void>
  setMicrophoneEnabled: (enabled: boolean) => Promise<void>
  setCameraEnabled: (enabled: boolean) => Promise<void>
}

export type RoomClientFactory = (options: RoomJoinOptions) => Promise<RoomSession>

let factory: RoomClientFactory | null = null
let clientModule: Promise<void> | null = null

/**
 * Register the implementation when the dynamically imported LiveKit adapter
 * is evaluated. Page code remains independent from SDK-specific types.
 */
export function registerRoomClient(implementation: RoomClientFactory): void {
  factory = implementation
}

export function isRoomClientAvailable(): boolean {
  return factory !== null
}

/** Load the sizeable LiveKit SDK only when somebody actually joins a call. */
export async function loadRoomClient(): Promise<void> {
  if (factory) return
  clientModule ??= import('./livekitClient').then(() => undefined)
  await clientModule
}

/** Human-readable reason shown by the UI when video cannot start. */
export const ROOM_CLIENT_UNAVAILABLE_REASON =
  'The video client is not configured in this build. Install livekit-client and register it in src/lib/realtime/livekitClient.ts.'

export async function joinRoom(options: RoomJoinOptions): Promise<RoomSession> {
  await loadRoomClient()
  if (!factory) throw new Error(ROOM_CLIENT_UNAVAILABLE_REASON)
  return factory(options)
}

/*
 * ENABLING LIVEKIT
 * ----------------
 * 1. npm install livekit-client
 * 2. Create src/lib/realtime/livekitClient.ts with roughly this content:
 *
 *    import { Room, RoomEvent, Track } from 'livekit-client'
 *    import {
 *      CAPTION_TOPIC_FINAL,
 *      registerRoomClient,
 *      type RoomJoinOptions,
 *      type RoomSession,
 *    } from './roomClient'
 *
 *    async function join(options: RoomJoinOptions): Promise<RoomSession> {
 *      const room = new Room({ adaptiveStream: true, dynacast: true })
 *      const decoder = new TextDecoder()
 *
 *      room.on(RoomEvent.DataReceived, (payload, _participant, _kind, topic) => {
 *        if (topic !== CAPTION_TOPIC_FINAL && topic !== CAPTION_TOPIC_INTERIM) return
 *        options.onCaption({
 *          text: decoder.decode(payload),
 *          final: topic === CAPTION_TOPIC_FINAL,
 *          receivedAt: Date.now(),
 *        })
 *      })
 *
 *      room.on(RoomEvent.TrackSubscribed, (track) => {
 *        if (track.kind === Track.Kind.Video && options.remoteVideoElement) {
 *          track.attach(options.remoteVideoElement)
 *        }
 *      })
 *      const report = () => options.onRemoteCountChange(room.remoteParticipants.size)
 *      room.on(RoomEvent.ParticipantConnected, report)
 *      room.on(RoomEvent.ParticipantDisconnected, report)
 *      room.on(RoomEvent.Disconnected, (reason) => options.onDisconnected(String(reason ?? '')))
 *
 *      await room.connect(options.serverUrl, options.token)
 *      if (options.publishMedia) {
 *        await room.localParticipant.enableCameraAndMicrophone()
 *        const camera = room.localParticipant.getTrackPublication(Track.Source.Camera)
 *        if (camera?.track && options.localVideoElement) {
 *          camera.track.attach(options.localVideoElement)
 *        }
 *      }
 *      report()
 *
 *      return {
 *        disconnect: () => room.disconnect(),
 *        setMicrophoneEnabled: (on) => room.localParticipant.setMicrophoneEnabled(on),
 *        setCameraEnabled: (on) => room.localParticipant.setCameraEnabled(on),
 *      }
 *    }
 *
 *    registerRoomClient(join)
 *
 * 3. `joinRoom` imports that adapter lazily on the first call.
 *
 * Nothing else in the application changes. The security rule still holds: the
 * token is minted by Spring, so no LiveKit secret ever reaches this bundle.
 */
