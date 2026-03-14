import { Action, Icon, showToast, Toast, popToRoot } from "@raycast/api";
import { logout } from "./oauth";

export default function LogoutAction() {
  return (
    <Action
      title="Logout from Webex"
      icon={Icon.Logout}
      style={Action.Style.Destructive}
      onAction={async () => {
        await logout();
        await showToast({ style: Toast.Style.Success, title: "Logged out" });
        await popToRoot();
      }}
    />
  );
}
