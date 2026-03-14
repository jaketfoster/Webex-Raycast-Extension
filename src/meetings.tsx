import { Action, ActionPanel, Clipboard, Icon, List, showHUD, showToast, Toast } from "@raycast/api";
import { usePromise } from "@raycast/utils";
import { createMeeting, fetchMeetings } from "./api";
import CreateMeetingForm from "./create-meeting-form";
import LogoutAction from "./logout-action";

export default function Meetings() {
  const { data, isLoading, revalidate } = usePromise(fetchMeetings);

  async function handleInstantMeeting() {
    try {
      await showToast({ style: Toast.Style.Animated, title: "Starting instant meeting…" });
      const now = new Date();
      const end = new Date(now.getTime() + 60 * 60 * 1000);
      const meeting = await createMeeting("Instant Meeting", now.toISOString(), end.toISOString());
      await Clipboard.copy(meeting.webLink);
      await showHUD("Meeting link copied to clipboard!");
      revalidate();
    } catch (error) {
      await showToast({ style: Toast.Style.Failure, title: "Failed to create meeting", message: String(error) });
    }
  }

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Filter meetings…">
      <List.EmptyView
        title="No upcoming meetings"
        description="Create a meeting or start an instant one"
        actions={
          <ActionPanel>
            <Action.Push
              title="Create Meeting"
              icon={Icon.Calendar}
              target={<CreateMeetingForm onCreated={revalidate} />}
            />
            <Action
              title="Start Instant Meeting"
              icon={Icon.Video}
              shortcut={{ modifiers: ["cmd", "shift"], key: "i" }}
              onAction={handleInstantMeeting}
            />
            <LogoutAction />
          </ActionPanel>
        }
      />
      {data?.map((meeting) => (
        <List.Item
          key={meeting.id}
          icon={Icon.Video}
          title={meeting.title}
          subtitle={new Date(meeting.start).toLocaleString()}
          accessories={[
            { text: `${new Date(meeting.start).toLocaleTimeString()} – ${new Date(meeting.end).toLocaleTimeString()}` },
          ]}
          actions={
            <ActionPanel>
              <Action.OpenInBrowser title="Join Meeting" url={meeting.webLink} />
              <Action.CopyToClipboard title="Copy Meeting Link" content={meeting.webLink} />
              <Action.Push
                title="Create Meeting"
                icon={Icon.Calendar}
                shortcut={{ modifiers: ["cmd"], key: "n" }}
                target={<CreateMeetingForm onCreated={revalidate} />}
              />
              <Action
                title="Start Instant Meeting"
                icon={Icon.Video}
                shortcut={{ modifiers: ["cmd", "shift"], key: "i" }}
                onAction={handleInstantMeeting}
              />
              <LogoutAction />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
