import { Action, ActionPanel, Color, Icon, Image, List, open } from "@raycast/api";
import { useCachedState, usePromise } from "@raycast/utils";
import { useEffect, useRef } from "react";
import { fetchMe, fetchRoomAvatar, fetchRooms, fetchUnreadCounts, Room } from "./api";
import RoomDetail from "./room-detail";
import SendMessageToRoom from "./send-message-to-room";
import LogoutAction from "./logout-action";
import { decodeRoomUUID } from "./utils";

const POLL_INTERVAL = 5_000;

export default function Chat() {
  // Persist rooms and me across runs
  const [cachedRooms, setCachedRooms] = useCachedState<Room[]>("rooms", []);
  const [cachedMe, setCachedMe] = useCachedState<{ id: string; emails: string[] } | null>("me", null);
  const [cachedAvatars, setCachedAvatars] = useCachedState<Record<string, string>>("room-avatars", {});
  const [cachedUnreadCounts, setCachedUnreadCounts] = useCachedState<Record<string, number>>("unread-counts", {});

  const { isLoading, revalidate } = usePromise(async () => {
    const [rooms, me] = await Promise.all([fetchRooms(), fetchMe()]);
    setCachedRooms(rooms);
    setCachedMe(me);
    return { rooms, me };
  });

  // Poll while the view is open
  const revalidateRef = useRef(revalidate);
  revalidateRef.current = revalidate;
  useEffect(() => {
    const id = setInterval(() => revalidateRef.current(), POLL_INTERVAL);
    return () => clearInterval(id);
  }, []);

  // Unread counts — refresh in background
  usePromise(
    async (rooms: Room[], meId: string) => {
      const counts = await fetchUnreadCounts(
        rooms.map((r) => r.id),
        meId,
      );
      const record: Record<string, number> = {};
      counts.forEach((v, k) => {
        record[k] = v;
      });
      setCachedUnreadCounts(record);
    },
    [cachedRooms, cachedMe?.id ?? ""],
    { execute: cachedRooms.length > 0 && !!cachedMe },
  );

  // Avatars — refresh in background
  usePromise(
    async (rooms: Room[], meId: string) => {
      const result: Record<string, string> = { ...cachedAvatars };
      const directRooms = rooms.filter((r) => r.type === "direct");
      await Promise.all(
        directRooms.map(async (room) => {
          try {
            const avatar = await fetchRoomAvatar(room.id, meId);
            if (avatar) result[room.id] = avatar;
          } catch {
            // skip
          }
        }),
      );
      setCachedAvatars(result);
    },
    [cachedRooms, cachedMe?.id ?? ""],
    { execute: cachedRooms.length > 0 && !!cachedMe },
  );

  const rooms = cachedRooms;

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Filter rooms…">
      {rooms.map((room) => {
        const unread = cachedUnreadCounts[room.id];
        const accessories: List.Item.Accessory[] = [];
        if (unread && unread > 0) {
          accessories.push({
            tag: { value: unread === -1 ? "•" : `${unread}`, color: Color.Red },
            tooltip: "Unread messages",
          });
        }
        accessories.push({
          date: new Date(room.lastActivity),
          tooltip: `Last activity: ${new Date(room.lastActivity).toLocaleString()}`,
        });

        const avatarUrl = cachedAvatars[room.id];
        return (
          <List.Item
            key={room.id}
            icon={
              avatarUrl
                ? { source: avatarUrl, mask: Image.Mask.Circle }
                : room.type === "direct"
                  ? Icon.Person
                  : Icon.TwoPeople
            }
            title={room.title}
            accessories={accessories}
            actions={
              <ActionPanel>
                <Action.Push
                  title="Open Room"
                  icon={Icon.Message}
                  target={<RoomDetail roomId={room.id} roomTitle={room.title} />}
                />
                <Action.Push
                  title="Send Message"
                  icon={Icon.Envelope}
                  shortcut={{ modifiers: ["cmd"], key: "n" }}
                  target={<SendMessageToRoom roomId={room.id} roomTitle={room.title} />}
                />
                <Action
                  title="Open in Webex"
                  icon={Icon.AppWindow}
                  shortcut={{ modifiers: ["cmd"], key: "o" }}
                  onAction={() => open(`webexteams://im?space=${decodeRoomUUID(room.id)}`)}
                />
                <Action.CopyToClipboard title="Copy Room Id" content={room.id} />
                <LogoutAction />
              </ActionPanel>
            }
          />
        );
      })}
    </List>
  );
}
