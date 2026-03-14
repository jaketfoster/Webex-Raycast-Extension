import { Action, ActionPanel, Form, showToast, Toast } from "@raycast/api";
import { editMessage } from "./api";

export default function EditMessageForm({
  messageId,
  roomId,
  currentText,
  onEdit,
}: {
  messageId: string;
  roomId: string;
  currentText: string;
  onEdit: (newText: string) => void;
}) {
  async function handleSubmit(values: { text: string }) {
    const text = values.text.trim();
    if (!text) {
      await showToast({ style: Toast.Style.Failure, title: "Message cannot be empty" });
      return;
    }
    try {
      await showToast({ style: Toast.Style.Animated, title: "Editing…" });
      await editMessage(messageId, roomId, text);
      await showToast({ style: Toast.Style.Success, title: "Message edited" });
      onEdit(text);
    } catch (error) {
      await showToast({ style: Toast.Style.Failure, title: "Failed to edit", message: String(error) });
    }
  }

  return (
    <Form
      navigationTitle="Edit Message"
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Save Edit" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.TextArea id="text" title="Message" defaultValue={currentText} />
    </Form>
  );
}
