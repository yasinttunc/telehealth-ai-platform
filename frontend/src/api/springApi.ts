import { http, toApiError } from './http'
import type {
  ApproveTranscriptRequest,
  CreateClinicRequest,
  CreateConsultationRequest,
  CreateDoctorRequest,
  CreatePatientRequest,
  CreateUserRequest,
  LoginRequest,
  LoginResponse,
  UpsertFindingReviewRequest,
  UpdateAlertStatusRequest,
  UpdateClinicRequest,
  UpdateConsultationStatusRequest,
  UpdateDoctorRequest,
  UpdatePatientRequest,
  UpdateUserRequest,
} from './types'
import type {
  Alert,
  AlertEvidence,
  AlertStatusEvent,
  AppUser,
  AuthUser,
  Clinic,
  Consultation,
  Doctor,
  ExtractionJob,
  FindingReview,
  LiveKitToken,
  Patient,
  SymptomRecord,
  TranscriptSegment,
} from '../types/domain'

async function request<T>(call: Promise<{ data: T }>): Promise<T> {
  try {
    return (await call).data
  } catch (error) {
    throw toApiError(error)
  }
}

function toAuthUser(response: LoginResponse): AuthUser {
  return {
    userId: response.userId,
    username: response.username,
    displayName: response.username,
    email: response.email,
    role: response.role,
  }
}

async function login(requestBody: LoginRequest): Promise<{ user: AuthUser; accessToken: string }> {
  const response = await request(http.post<LoginResponse>('/auth/login', requestBody))
  return { user: toAuthUser(response), accessToken: response.accessToken }
}

async function listSymptomRecords(consultationId: number): Promise<SymptomRecord | null> {
  const records = await request(http.get<SymptomRecord[]>(`/consultations/${consultationId}/symptom-records`))
  return records[0] ?? null
}

/**
 * Latest background extraction job for a consultation.
 *
 * The backend answers 204 when no job has ever been requested; axios then hands
 * back an empty body, so normalise that to `null` rather than leaking `''` into
 * page state.
 */
async function latestExtractionJob(consultationId: number): Promise<ExtractionJob | null> {
  const job = await request(
    http.get<ExtractionJob | ''>(`/consultations/${consultationId}/extraction-jobs/latest`),
  )
  return job ? job : null
}

export const springApi = {
  auth: { login },
  users: {
    list: () => request(http.get<AppUser[]>('/users')),
    create: (body: CreateUserRequest) => request(http.post<AppUser>('/users', body)),
    update: (id: number, body: UpdateUserRequest) => request(http.put<AppUser>(`/users/${id}`, body)),
    remove: (id: number) => request(http.delete<void>(`/users/${id}`)),
  },
  doctors: {
    list: () => request(http.get<Doctor[]>('/doctors')),
    get: (id: number) => request(http.get<Doctor>(`/doctors/${id}`)),
    create: (body: CreateDoctorRequest) => request(http.post<Doctor>('/doctors', body)),
    update: (id: number, body: UpdateDoctorRequest) => request(http.put<Doctor>(`/doctors/${id}`, body)),
    remove: (id: number) => request(http.delete<void>(`/doctors/${id}`)),
  },
  patients: {
    list: () => request(http.get<Patient[]>('/patients')),
    get: (id: number) => request(http.get<Patient>(`/patients/${id}`)),
    create: (body: CreatePatientRequest) => request(http.post<Patient>('/patients', body)),
    update: (id: number, body: UpdatePatientRequest) => request(http.put<Patient>(`/patients/${id}`, body)),
    remove: (id: number) => request(http.delete<void>(`/patients/${id}`)),
  },
  clinics: {
    list: () => request(http.get<Clinic[]>('/clinics')),
    create: (body: CreateClinicRequest) => request(http.post<Clinic>('/clinics', body)),
    update: (id: number, body: UpdateClinicRequest) => request(http.put<Clinic>(`/clinics/${id}`, body)),
    remove: (id: number) => request(http.delete<void>(`/clinics/${id}`)),
  },
  consultations: {
    list: () => request(http.get<Consultation[]>('/consultations')),
    mine: () => request(http.get<Consultation[]>('/consultations/mine')),
    get: (id: number) => request(http.get<Consultation>(`/consultations/${id}`)),
    create: (body: CreateConsultationRequest) => request(http.post<Consultation>('/consultations', body)),
    updateStatus: (id: number, body: UpdateConsultationStatusRequest) => request(http.put<Consultation>(`/consultations/${id}/status`, body)),
    updateTranscript: (id: number, transcript: string) => request(http.put<Consultation>(`/consultations/${id}/transcript`, { transcript })),

    /* Transcript provenance and approval. */

    /** Final ASR segments for the staff review panel (never interim captions). */
    transcriptSegments: (id: number) =>
      request(http.get<TranscriptSegment[]>(`/consultations/${id}/transcript-segments`)),
    /** Assigned Doctor approves a canonical transcript revision. */
    approveTranscript: (id: number, body: ApproveTranscriptRequest) =>
      request(http.post<Consultation>(`/consultations/${id}/approve-transcript`, body)),
    /** Short-lived join credentials; Spring checks ownership before signing. */
    livekitToken: (id: number) =>
      request(http.post<LiveKitToken>(`/consultations/${id}/livekit-token`)),
  },
  /*
   * Read-only. The synchronous POST that used to live here was removed with
   * its backend route: it wrote a symptom record without the transcript
   * having been approved, bypassing clinician review. Extraction is requested
   * through extractionJobs.request, which runs in the background and only
   * accepts an approved revision.
   */
  symptoms: { getByConsultation: listSymptomRecords },

  /* Asynchronous symptom extraction. */
  extractionJobs: {
    latest: latestExtractionJob,
    /** Queues extraction for the currently approved revision; returns immediately. */
    request: (consultationId: number) =>
      request(http.post<ExtractionJob>(`/consultations/${consultationId}/extraction-jobs`)),
  },
  findingReviews: {
    get: async (symptomRecordId: number): Promise<FindingReview | null> => {
      const review = await request(
        http.get<FindingReview | ''>(`/symptom-records/${symptomRecordId}/review`),
      )
      return review || null
    },
    save: (symptomRecordId: number, body: UpsertFindingReviewRequest) =>
      request(
        http.put<FindingReview>(
          `/symptom-records/${symptomRecordId}/review`,
          body,
        ),
      ),
  },
  alerts: {
    list: (filters?: { from?: string; to?: string }) =>
      request(http.get<Alert[]>('/alerts', { params: filters })),
    evidence: (id: number) =>
      request(http.get<AlertEvidence[]>(`/alerts/${id}/evidence`)),
    history: (id: number) =>
      request(http.get<AlertStatusEvent[]>(`/alerts/${id}/history`)),
    updateStatus: (id: number, body: UpdateAlertStatusRequest) => request(http.put<Alert>(`/alerts/${id}/status`, body)),
  },
}
