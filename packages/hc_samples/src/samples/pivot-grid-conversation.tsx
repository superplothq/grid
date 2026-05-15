import { ConversationViewer } from "../components/ConversationViewer";
import { registerSample } from "./registry";

function PivotGridConversation() {
  return <ConversationViewer dataUrl="/pivot-grid-conversation.json" />;
}

registerSample({
  id: "pivot-grid-conversation",
  title: "Pivot Grid Conversation",
  component: PivotGridConversation,
});
