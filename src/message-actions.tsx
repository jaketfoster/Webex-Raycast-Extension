import { Action, ActionPanel, Icon, open, showToast, Toast, useNavigation } from "@raycast/api";
import { downloadFile, fetchFileHead, Message } from "./api";
import { updateMessageCache } from "./cache-utils";
import EditMessageForm from "./edit-message";
import LogoutAction from "./logout-action";
import SendMessageToRoom from "./send-message-to-room";
import { decodeRoomUUID } from "./utils";

export default function MessageActions({
  msg,
  roomId,
  roomTitle,
  myId,
  replyCount,
  threadFilter,
  showDetail,
  onSend,
  onSetThreadFilter,
  onUpdateMessage,
  onRevalidate,
  onToggleDetail,
}: {
  msg: Message;
  roomId: string;
  roomTitle: string;
  myId?: string;
  replyCount?: number;
  threadFilter: string;
  showDetail: boolean;
  onSend: () => void;
  onSetThreadFilter: (id: string) => void;
  onUpdateMessage: (messageId: string, newText: string) => void;
  onRevalidate: () => void;
  onToggleDetail: () => void;
}) {
  const { push, pop } = useNavigation();
  const hasFiles = msg.files && msg.files.length > 0;

  return (
    <ActionPanel>
      <Action title="Send Message" icon={Icon.Message} onAction={onSend} />
      {replyCount ? (
        <Action title="Open Thread" icon={Icon.Bubble} onAction={() => onSetThreadFilter(msg.id)} />
      ) : null}
      {myId === msg.personId ? (
        <Action
          title="Edit Message"
          icon={Icon.Pencil}
          shortcut={{ modifiers: ["cmd"], key: "e" }}
          onAction={() =>
            push(
              <EditMessageForm
                messageId={msg.id}
                roomId={roomId}
                currentText={msg.text}
                onEdit={(newText) => {
                  onUpdateMessage(msg.id, newText);
                  pop();
                  onRevalidate();
                }}
              />,
            )
          }
        />
      ) : null}
      {threadFilter !== "all" ? (
        <Action
          title="Back to All Messages"
          icon={Icon.ArrowLeft}
          onAction={() => onSetThreadFilter("all")}
          shortcut={{ modifiers: ["cmd"], key: "backspace" }}
        />
      ) : null}
      {myId !== msg.personId && msg.personEmail ? (
        <Action
          title="Call in Webex"
          icon={Icon.Phone}
          shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
          onAction={() => open(`webexteams://meet?sip=${msg.personEmail}`)}
        />
      ) : null}
      <Action
        title="Send File"
        icon={Icon.Upload}
        shortcut={{ modifiers: ["cmd", "shift"], key: "f" }}
        onAction={() => push(<SendMessageToRoom roomId={roomId} roomTitle={roomTitle} />)}
      />
      <Action
        title={showDetail ? "Hide Detail" : "Show Detail"}
        icon={showDetail ? Icon.EyeDisabled : Icon.Eye}
        shortcut={{ modifiers: ["cmd"], key: "d" }}
        onAction={onToggleDetail}
      />
      <Action title="Refresh" icon={Icon.ArrowClockwise} onAction={onRevalidate} />
      <Action
        title="Open in Webex"
        icon={Icon.AppWindow}
        onAction={() => open(`webexteams://im?space=${decodeRoomUUID(roomId)}`)}
      />
      {hasFiles
        ? msg.files!.map((fileUrl, i) => (
            <Action
              key={`dl-${i}`}
              title={`Save Attachment${msg.files!.length > 1 ? ` ${i + 1}` : ""}`}
              icon={Icon.Download}
              shortcut={{ modifiers: ["cmd"], key: "s" }}
              onAction={async () => {
                try {
                  await showToast({ style: Toast.Style.Animated, title: "Downloading…" });
                  const { fileName } = await fetchFileHead(fileUrl);
                  const { join } = await import("path");
                  const { homedir } = await import("os");
                  const destPath = join(homedir(), "Downloads", fileName);
                  await downloadFile(fileUrl, destPath);
                  await showToast({ style: Toast.Style.Success, title: "Saved", message: destPath });
                } catch (error) {
                  await showToast({ style: Toast.Style.Failure, title: "Download failed", message: String(error) });
                }
              }}
            />
          ))
        : null}
      <Action.CopyToClipboard title="Copy Message" content={msg.text || ""} />
      <LogoutAction />
    </ActionPanel>
  );
}
