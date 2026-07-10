import type { DemoConversationMessage } from '@/lib/home-content';

export function DemoConversationChatbox({
  conversation,
  defaultOpen,
}: {
  conversation: DemoConversationMessage[];
  defaultOpen?: boolean;
}) {
  return (
    <details className="demo-chatbox" open={defaultOpen} suppressHydrationWarning>
      <summary>
        <span className="demo-chatbox-title">Conversation</span>
        <span className="demo-chatbox-count">
          {conversation.length} messages
        </span>
      </summary>
      <ol className="demo-chatbox-messages">
        {conversation.map((message, index) => (
          <li key={index} data-role={message.role}>
            <strong>{message.role === 'human' ? 'human' : 'agent'}</strong>
            <p>{message.body}</p>
            {message.code ? (
              <pre>
                <code>{message.code}</code>
              </pre>
            ) : null}
          </li>
        ))}
      </ol>
    </details>
  );
}
