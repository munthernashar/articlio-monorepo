import type { TutorMessage } from '@/services/supabase/tutor.service';

type Props = {
  messages: TutorMessage[];
};

export function TutorChatHistory({ messages }: Props) {
  return (
    <details style={{ marginTop: '1rem' }}>
      <summary>
        <strong>Bisheriger Coach-Verlauf</strong>
      </summary>
      <div className="tutor-chat">
        {messages.length === 0 ? <p>Coaching wird vorbereitet…</p> : null}
        {messages.map((message) => (
          <div key={message.id} className={`tutor-bubble tutor-bubble-${message.role}`}>
            <p className="tutor-bubble-role">{message.role === 'assistant' ? 'Coach' : 'Du'}</p>
            <p>{message.text}</p>
          </div>
        ))}
      </div>
    </details>
  );
}
