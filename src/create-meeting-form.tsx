import { Action, ActionPanel, Form, showToast, Toast, useNavigation } from "@raycast/api";
import { createMeeting } from "./api";
import LogoutAction from "./logout-action";

export default function CreateMeetingForm({ onCreated }: { onCreated?: () => void }) {
  const { pop } = useNavigation();

  async function handleSubmit(values: { title: string; date: Date; startTime: string; duration: string }) {
    try {
      await showToast({ style: Toast.Style.Animated, title: "Creating meeting…" });

      const date = values.date;
      const [hours, minutes] = values.startTime.split(":").map(Number);
      const start = new Date(date);
      start.setHours(hours, minutes, 0, 0);

      const durationMin = parseInt(values.duration, 10) || 30;
      const end = new Date(start.getTime() + durationMin * 60 * 1000);

      const meeting = await createMeeting(values.title, start.toISOString(), end.toISOString());
      await showToast({ style: Toast.Style.Success, title: "Meeting created", message: meeting.title });
      onCreated?.();
      pop();
    } catch (error) {
      await showToast({ style: Toast.Style.Failure, title: "Failed to create meeting", message: String(error) });
    }
  }

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Create Meeting" onSubmit={handleSubmit} />
          <LogoutAction />
        </ActionPanel>
      }
    >
      <Form.TextField id="title" title="Title" placeholder="Weekly Standup" />
      <Form.DatePicker id="date" title="Date" />
      <Form.TextField id="startTime" title="Start Time" placeholder="14:00" />
      <Form.Dropdown id="duration" title="Duration" defaultValue="30">
        <Form.Dropdown.Item value="15" title="15 minutes" />
        <Form.Dropdown.Item value="30" title="30 minutes" />
        <Form.Dropdown.Item value="60" title="1 hour" />
        <Form.Dropdown.Item value="90" title="1.5 hours" />
      </Form.Dropdown>
    </Form>
  );
}
