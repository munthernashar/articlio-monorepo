import { appConfig } from '@/lib/config';
import { supabaseClient } from '@/services/supabase/client';

const SESSION_AUDIO_BUCKET = appConfig.supabase.sessionAudioBucket;

function getAudioExtension(mimeType: string): string {
  const normalized = mimeType.toLowerCase();

  if (normalized.includes('ogg')) return 'ogg';
  if (normalized.includes('mpeg')) return 'mp3';
  if (normalized.includes('wav')) return 'wav';
  if (normalized.includes('mp4') || normalized.includes('m4a')) return 'm4a';
  if (normalized.includes('webm')) return 'webm';

  return 'webm';
}

function getUploadContentType(file: Blob): string {
  const type = file.type?.toLowerCase();

  if (!type) return 'audio/webm';

  if (type.includes('mp4') || type.includes('m4a')) {
    return 'audio/mp4';
  }

  return type;
}

export const sessionStorageService = {
  async uploadSessionAudio(sessionId: string, userId: string, file: Blob) {
    const contentType = getUploadContentType(file);
    const extension = getAudioExtension(contentType);
    const filePath = `${userId}/${sessionId}/${Date.now()}.${extension}`;

    const { error } = await supabaseClient.storage.from(SESSION_AUDIO_BUCKET).upload(filePath, file, {
      upsert: false,
      contentType: file.type || 'audio/webm',
    });

    if (error) {
      if (error.message.toLowerCase().includes('bucket not found')) {
        throw new Error(
          `Audio-Upload fehlgeschlagen: Bucket "${SESSION_AUDIO_BUCKET}" nicht gefunden. Bitte in Supabase Storage anlegen oder VITE_SUPABASE_SESSION_AUDIO_BUCKET anpassen.`,
        );
      }
      throw new Error(`Audio-Upload fehlgeschlagen: ${error.message}`);
    }

    return {
      bucket: SESSION_AUDIO_BUCKET,
      filePath,
    };
  },
};
