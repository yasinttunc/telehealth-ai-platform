import { Room, RoomEvent, Track } from 'livekit-client'
import {
  CAPTION_TOPIC_FINAL,
  CAPTION_TOPIC_INTERIM,
  registerRoomClient,
  type RoomCaption,
  type RoomJoinOptions,
  type RoomSession,
} from './roomClient'

const decoder = new TextDecoder()
const LIVEKIT_CONNECT_TIMEOUT_MS = 20_000

function captionFromPayload(payload: Uint8Array, topic?: string): RoomCaption | null {
  if (topic !== CAPTION_TOPIC_FINAL && topic !== CAPTION_TOPIC_INTERIM) return null

  const raw = decoder.decode(payload)
  try {
    const parsed = JSON.parse(raw) as {
      text?: unknown
      final?: unknown
      speakerRole?: unknown
    }
    if (typeof parsed.text === 'string') {
      return {
        text: parsed.text,
        final: typeof parsed.final === 'boolean' ? parsed.final : topic === CAPTION_TOPIC_FINAL,
        // Only the roles Spring can issue are accepted; anything else is
        // treated as unattributed rather than rendered verbatim.
        speakerRole:
          parsed.speakerRole === 'DOCTOR' || parsed.speakerRole === 'PATIENT'
            ? parsed.speakerRole
            : undefined,
        receivedAt: Date.now(),
      }
    }
  } catch {
    // Plain-text captions are accepted for the lightweight Python worker.
  }

  return {
    text: raw,
    final: topic === CAPTION_TOPIC_FINAL,
    receivedAt: Date.now(),
  }
}

async function joinLiveKitRoom(options: RoomJoinOptions): Promise<RoomSession> {
  const room = new Room({ adaptiveStream: true, dynacast: true })
  const attachedAudio: HTMLMediaElement[] = []

  const reportRemoteCount = () => options.onRemoteCountChange(room.remoteParticipants.size)

  room.on(RoomEvent.DataReceived, (payload, _participant, _kind, topic) => {
    const caption = captionFromPayload(payload, topic)
    if (caption) options.onCaption(caption)
  })

  room.on(RoomEvent.TrackSubscribed, (track) => {
    if (track.kind === Track.Kind.Video && options.remoteVideoElement) {
      track.attach(options.remoteVideoElement)
      return
    }

    if (track.kind === Track.Kind.Audio) {
      const element = track.attach()
      element.autoplay = true
      element.style.display = 'none'
      document.body.appendChild(element)
      attachedAudio.push(element)
    }
  })

  room.on(RoomEvent.TrackUnsubscribed, (track) => {
    track.detach().forEach((element) => {
      if (attachedAudio.includes(element)) element.remove()
    })
  })

  room.on(RoomEvent.ParticipantConnected, reportRemoteCount)
  room.on(RoomEvent.ParticipantDisconnected, reportRemoteCount)
  room.on(RoomEvent.Disconnected, (reason) => {
    options.onDisconnected(reason ? String(reason) : undefined)
  })

  await withTimeout(
    room.connect(options.serverUrl, options.token),
    LIVEKIT_CONNECT_TIMEOUT_MS,
    'LiveKit connection timed out. Check the LiveKit Cloud room URL, token credentials, browser WebRTC support, and network access.',
  )

  if (options.publishMedia) {
    await room.localParticipant.enableCameraAndMicrophone()
    const camera = room.localParticipant.getTrackPublication(Track.Source.Camera)
    if (camera?.track && options.localVideoElement) {
      camera.track.attach(options.localVideoElement)
    }
  }

  reportRemoteCount()

  return {
    disconnect: async () => {
      await room.disconnect()
      attachedAudio.forEach((element) => element.remove())
    },
    setMicrophoneEnabled: async (enabled) => {
      await room.localParticipant.setMicrophoneEnabled(enabled)
    },
    setCameraEnabled: async (enabled) => {
      const publication = await room.localParticipant.setCameraEnabled(enabled)
      if (enabled && publication?.track && options.localVideoElement) {
        publication.track.attach(options.localVideoElement)
      }
    },
  }
}

registerRoomClient(joinLiveKitRoom)

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeoutId: number | undefined

  const timeout = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs)
  })

  try {
    return await Promise.race([promise, timeout])
  } finally {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId)
  }
}
