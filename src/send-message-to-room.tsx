import { Action, ActionPanel, Form, showToast, Toast, useNavigation } from "@raycast/api";
import { usePromise } from "@raycast/utils";
import { fetchMe, sendMessage } from "./api";
import { seedMessageCache } from "./cache-utils";
import RoomDetail from "./room-detail";
import LogoutAction from "./logout-action";

export default function SendMessageToRoom({ roomId, roomTitle }: { roomId: string; roomTitle: string }) {
  const { data: me } = usePromise(fetchMe);
  const { push } = useNavigation();

  async function handleSubmit(values: { text: string; files?: string[] }) {
    const filePath = values.files?.[0];
    if (!values.text.trim() && !filePath) {
      await showToast({ style: Toast.Style.Failure, title: "Message or file required" });
      return;
    }
    try {
      await showToast({ style: Toast.Style.Animated, title: "Sending…" });
      await sendMessage(roomId, values.text, filePath);
      await showToast({ style: Toast.Style.Success, title: "Message sent" });

      seedMessageCache(roomId, {
        id: `pending-${Date.now()}`,
        roomId,
        text: values.text,
        personId: me?.id ?? "",
        personEmail: me?.emails[0] ?? "",
        created: new Date().toISOString(),
      });

      push(<RoomDetail roomId={roomId} roomTitle={roomTitle} />);
    } catch (error) {
      await showToast({ style: Toast.Style.Failure, title: "Failed to send", message: String(error) });
    }
  }

  return (
    <Form
      navigationTitle={`Message → ${roomTitle}`}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Send Message" onSubmit={handleSubmit} />
          <LogoutAction />
        </ActionPanel>
      }
    >
      <Form.TextArea id="text" title="Message" placeholder="Type your message…" />
      <Form.FilePicker id="files" title="Attachment" allowMultipleSelection={false} />
    </Form>
  );
}
