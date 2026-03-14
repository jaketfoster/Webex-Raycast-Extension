import { Color, Icon, Image, List, showToast, Toast } from "@raycast/api";
import { useCachedState, usePromise } from "@raycast/utils";
import { fetchFileBase64, fetchMessages, fetchPeople, Message, Person, sendMessage } from "./api";
import { updateMessageCache } from "./cache-utils";
import MessageActions from "./message-actions";
import { useEffect, useRef, useState } from "react";
import { dateLabel, formatTime } from "./utils";

const POLL_INTERVAL = 5_000;

export default function RoomDetail({ roomId, roomTitle }: { roomId: string; roomTitle: string }) {
  const [draft, setDraft] = useState("");
  const [threadFilter, setThreadFilter] = useState<string>("all");
  const [showDetail, setShowDetail] = useState(false);
  const [fileCache, setFileCache] = useState<Record<string, { dataUri: string; contentType: string; fileName: string }>>({});

  const [cachedMe] = useCachedState<{ id: string; emails: string[] } | null>("me", null);

  const [cachedMessages, setCachedMessages] = useCachedState<Message[]>(`messages-${roomId}`, []);
  const [cachedPeople, setCachedPeople] = useCachedState<Record<string, Person>>(`people-${roomId}`, {});

  const { isLoading, revalidate } = usePromise(async () => {
    const messages = await fetchMessages(roomId);
    setCachedMessages(messages);
    const personIds = messages.map((m) => m.personId).filter(Boolean);
    const people = await fetchPeople(personIds);
    const peopleRecord: Record<string, Person> = { ...cachedPeople };
    people.forEach((v, k) => {
      peopleRecord[k] = v;
    });
    setCachedPeople(peopleRecord);
  });

  const revalidateRef = useRef(revalidate);
  revalidateRef.current = revalidate;
  useEffect(() => {
    const id = setInterval(() => revalidateRef.current(), POLL_INTERVAL);
    return () => clearInterval(id);
  }, []);

  async function handleSend() {
    const text = draft.trim();
    if (!text) return;
    try {
      await showToast({ style: Toast.Style.Animated, title: "Sending…" });
      await sendMessage(roomId, text);
      setDraft("");
      await showToast({ style: Toast.Style.Success, title: "Message sent" });
      revalidate();
    } catch (error) {
      await showToast({ style: Toast.Style.Failure, title: "Failed to send", message: String(error) });
    }
  }

  function handleUpdateMessage(messageId: string, newText: string) {
    updateMessageCache(roomId, messageId, newText);
    setCachedMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, text: newText } : m)));
  }

  const sorted = [...cachedMessages];
  const threadReplyCounts = new Map<string, number>();
  for (const msg of sorted) {
    if (msg.parentId) {
      threadReplyCounts.set(msg.parentId, (threadReplyCounts.get(msg.parentId) || 0) + 1);
    }
  }

  const threadRoots = sorted.filter((msg) => !msg.parentId && threadReplyCounts.has(msg.id));

  const filtered =
    threadFilter === "all"
      ? sorted.filter((msg) => !msg.parentId)
      : sorted.filter((msg) => msg.id === threadFilter || msg.parentId === threadFilter);

  const sections = new Map<string, Message[]>();
  for (const msg of filtered) {
    const label = dateLabel(msg.created);
    if (!sections.has(label)) sections.set(label, []);
    sections.get(label)!.push(msg);
  }

  return (
    <List
      isLoading={isLoading}
      isShowingDetail={showDetail}
      navigationTitle={roomTitle}
      searchBarPlaceholder="Type a message…"
      searchText={draft}
      onSearchTextChange={setDraft}
      filtering={false}
      searchBarAccessory={
        threadRoots.length > 0 ? (
          <List.Dropdown tooltip="Filter by thread" value={threadFilter} onChange={setThreadFilter}>
            <List.Dropdown.Item title="All Messages" value="all" />
            <List.Dropdown.Section title="Threads">
              {threadRoots.map((msg) => (
                <List.Dropdown.Item
                  key={msg.id}
                  title={`🧵 ${(msg.text || "(no text)").slice(0, 50)}`}
                  value={msg.id}
                />
              ))}
            </List.Dropdown.Section>
          </List.Dropdown>
        ) : undefined
      }
    >
      {[...sections.entries()].map(([label, messages]) => (
        <List.Section key={label} title={label}>
          {messages.map((msg) => {
            const person = cachedPeople[msg.personId];
            const name = person?.displayName ?? msg.personEmail;
            const avatar = person?.avatar;
            const accessories: List.Item.Accessory[] = [];

            const hasFiles = msg.files && msg.files.length > 0;
            if (hasFiles) {
              accessories.push({ tag: { value: "📎", color: Color.Orange }, tooltip: "Has attachment" });
            }
            if (msg.parentId) {
              accessories.push({ tag: { value: "↩ reply", color: Color.Blue } });
            }
            const replyCount = threadReplyCounts.get(msg.id);
            if (replyCount) {
              accessories.push({ tag: { value: `🧵 ${replyCount}`, color: Color.Purple } });
            }
            accessories.push({ text: formatTime(msg.created) });

            const isImage = (ct: string) => ct.startsWith("image/");
            let detailMarkdown = msg.text || "(no text)";
            if (hasFiles) {
              for (const fileUrl of msg.files!) {
                const cached = fileCache[fileUrl];
                if (cached) {
                  if (isImage(cached.contentType)) {
                    detailMarkdown += `\n\n![${cached.fileName}](${cached.dataUri}?raycast-width=300)`;
                  } else {
                    detailMarkdown += `\n\n📎 **${cached.fileName}** (${cached.contentType})`;
                  }
                } else {
                  detailMarkdown += "\n\n⏳ Loading attachment…";
                }
              }
            }

            return (
              <List.Item
                key={msg.id}
                icon={avatar ? { source: avatar, mask: Image.Mask.Circle } : Icon.Person}
                title={msg.text || "(no text)"}
                subtitle={showDetail ? undefined : name}
                accessories={showDetail ? undefined : accessories}
                detail={<List.Item.Detail markdown={detailMarkdown}  />}
                actions={
                  <MessageActions
                    msg={msg}
                    roomId={roomId}
                    roomTitle={roomTitle}
                    myId={cachedMe?.id}
                    replyCount={replyCount}
                    threadFilter={threadFilter}
                    showDetail={showDetail}
                    onSend={handleSend}
                    onSetThreadFilter={setThreadFilter}
                    onUpdateMessage={handleUpdateMessage}
                    onRevalidate={revalidate}
                    onToggleDetail={async () => {
                      const next = !showDetail;
                      setShowDetail(next);
                      if (next && hasFiles) {
                        for (const fileUrl of msg.files!) {
                          if (!fileCache[fileUrl]) {
                            try {
                              const result = await fetchFileBase64(fileUrl);
                              setFileCache((prev) => ({ ...prev, [fileUrl]: result }));
                            } catch {
                              // skip
                            }
                          }
                        }
                      }
                    }}
                  />
                }
              />
            );
          })}
        </List.Section>
      ))}
    </List>
  );
}
