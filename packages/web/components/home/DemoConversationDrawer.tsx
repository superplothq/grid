'use client';

import { useEffect, useState } from 'react';
import type { ConversationBlock, DemoConversationMessage } from '@/lib/home-content';

function ConversationBlockView({ block }: { block: ConversationBlock }) {
  switch (block.type) {
    case 'text':
      return <p>{block.text}</p>;
    case 'code':
      return (
        <pre>
          <code>{block.code}</code>
        </pre>
      );
    case 'table':
      return (
        <div className="demo-chatbox-table-wrap">
          <table className="demo-chatbox-table">
            <thead>
              <tr>
                {block.headers.map((header, i) => (
                  <th key={i}>{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'choices':
      return (
        <ul className="demo-chatbox-choices">
          {block.items.map((item, i) => (
            <li key={i}>
              <span className="demo-chatbox-choice-q">{item.question}</span>
              <span className="demo-chatbox-choice-a">{item.answer}</span>
            </li>
          ))}
        </ul>
      );
  }
}

function ConversationMessageView({ message }: { message: DemoConversationMessage }) {
  if (message.blocks) {
    return (
      <>
        {message.blocks.map((block, i) => (
          <ConversationBlockView key={i} block={block} />
        ))}
      </>
    );
  }
  return (
    <>
      {message.body ? <p>{message.body}</p> : null}
      {message.code ? (
        <pre>
          <code>{message.code}</code>
        </pre>
      ) : null}
    </>
  );
}

export function DemoConversationDrawer({
  conversation,
}: {
  conversation: DemoConversationMessage[];
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="demo-conversation-cta"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        See Conversation with agent
      </button>
      <div className="demo-drawer-root" data-open={open}>
        <aside className="demo-drawer" role="dialog" aria-label="Conversation with agent" aria-hidden={!open}>
          <div className="demo-drawer-header">
            <span className="demo-drawer-heading">
              <span className="demo-chatbox-title">Conversation</span>
              <span className="demo-chatbox-count">{conversation.length} messages</span>
            </span>
            <button
              type="button"
              className="demo-drawer-close"
              aria-label="Close conversation"
              onClick={() => setOpen(false)}
            >
              [-]
            </button>
          </div>
          <ol className="demo-chatbox-messages demo-drawer-messages">
            {conversation.map((message, index) => (
              <li key={index} data-role={message.role}>
                <strong>{message.role === 'human' ? 'human' : 'agent'}</strong>
                <ConversationMessageView message={message} />
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </>
  );
}
