import { describe, expect, it } from 'vitest';
import { parseRequest, splitStoragePath, TRANSCRIPTION_ERROR_CODES } from './index';

describe('transcribe-session-audio parseRequest', () => {
  const traceId = 'trace-test';

  it('akzeptiert objectPath + separaten audioBucket', async () => {
    const result = parseRequest(
      {
        userId: 'user-1',
        sessionId: 'session-1',
        audioBucket: 'session-audio',
        audioFilePath: 'user-1/session-1/recording.webm',
      },
      traceId,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({
        userId: 'user-1',
        sessionId: 'session-1',
        audioBucket: 'session-audio',
        audioFilePath: 'user-1/session-1/recording.webm',
        expectedLanguage: undefined,
      });

      expect(splitStoragePath(result.value.audioBucket, result.value.audioFilePath)).toEqual({
        bucket: 'session-audio',
        objectPath: 'user-1/session-1/recording.webm',
      });
    }
  });

  it('lehnt bucket/objectPath im audioFilePath explizit ab', async () => {
    const result = parseRequest(
      {
        userId: 'user-1',
        sessionId: 'session-1',
        audioBucket: 'session-audio',
        audioFilePath: 'session-audio/user-1/session-1/recording.webm',
      },
      traceId,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      const payload = await result.response.json();
      expect(payload.error.code).toBe(TRANSCRIPTION_ERROR_CODES.INVALID_AUDIO_FORMAT);
      expect(payload.error.message).toContain('Expected object path without bucket');
    }
  });

  it('lehnt fehlenden oder ungültigen audioBucket ab', async () => {
    const missingBucketResult = parseRequest(
      {
        userId: 'user-1',
        sessionId: 'session-1',
        audioFilePath: 'user-1/session-1/recording.webm',
      },
      traceId,
    );

    expect(missingBucketResult.ok).toBe(false);
    if (!missingBucketResult.ok) {
      const payload = await missingBucketResult.response.json();
      expect(payload.error.code).toBe(TRANSCRIPTION_ERROR_CODES.INVALID_AUDIO_FORMAT);
      expect(payload.error.message).toContain('audioBucket');
    }

    const invalidBucketResult = parseRequest(
      {
        userId: 'user-1',
        sessionId: 'session-1',
        audioBucket: 'session audio',
        audioFilePath: 'user-1/session-1/recording.webm',
      },
      traceId,
    );

    expect(invalidBucketResult.ok).toBe(false);
    if (!invalidBucketResult.ok) {
      const payload = await invalidBucketResult.response.json();
      expect(payload.error.code).toBe(TRANSCRIPTION_ERROR_CODES.INVALID_AUDIO_FORMAT);
      expect(payload.error.message).toContain('Invalid audioBucket format');
    }
  });
});
