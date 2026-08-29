export const TRANSCRIPTION_ERROR_CODES = {
  MISSING_AUDIO_PATH: 'missing_audio_path',
  MISSING_SESSION_ID: 'missing_session_id',
  MISSING_USER_ID: 'missing_user_id',
  STORAGE_FILE_NOT_FOUND: 'storage_file_not_found',
  STORAGE_DOWNLOAD_FAILED: 'storage_download_failed',
  INVALID_AUDIO_FORMAT: 'invalid_audio_format',
  STT_PROVIDER_ERROR: 'stt_provider_error',
  MISSING_STT_API_KEY: 'missing_stt_api_key',
  UNAUTHORIZED: 'unauthorized',
  UNKNOWN_ERROR: 'unknown_error',
} as const;

export type TranscriptionErrorCode =
  (typeof TRANSCRIPTION_ERROR_CODES)[keyof typeof TRANSCRIPTION_ERROR_CODES];
