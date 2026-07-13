import { samples } from 'samples';

export async function SampleConversation({ id }: { id: string }) {
  const conversation = await samples[id].conversation();
  const meta = [conversation.model, conversation.date].filter(Boolean).join(' · ');

  return (
    <details className="demo-chatbox not-prose sample-conversation my-6">
      <summary>
        <span className="demo-chatbox-title">Conversation that built this sample</span>
        <span className="demo-chatbox-count">{meta}</span>
      </summary>
      <ul className="demo-chatbox-messages">
        {conversation.turns.map((turn, i) => (
          <li key={i} data-role={turn.role}>
            <strong>{turn.role}</strong>
            <p>{turn.content}</p>
          </li>
        ))}
      </ul>
    </details>
  );
}
