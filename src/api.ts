import fetch, { FormData, fileFromSync } from "node-fetch";
import { withCache } from "@raycast/utils";
import { authorize } from "./oauth";

const BASE_URL = "https://webexapis.com/v1";

async function headers() {
  const accessToken = await authorize();
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
}

// --- Types ---

export type Room = {
  id: string;
  title: string;
  type: "direct" | "group";
  lastActivity: string;
  isReadStatusEnabled?: boolean;
};

export type Membership = {
  id: string;
  roomId: string;
  personId: string;
  personEmail: string;
  lastSeenId?: string;
};

export type Message = {
  id: string;
  roomId: string;
  text: string;
  personId: string;
  personEmail: string;
  parentId?: string;
  files?: string[];
  created: string;
};

export type Person = {
  id: string;
  displayName: string;
  firstName?: string;
  lastName?: string;
  avatar?: string;
  emails: string[];
};

const personCache = new Map<string, Person>();

export async function fetchPerson(personId: string): Promise<Person> {
  const cached = personCache.get(personId);
  if (cached) return cached;
  const h = await headers();
  const res = await fetch(`${BASE_URL}/people/${personId}`, { headers: h });
  if (!res.ok) throw new Error(`${res.statusText} (HTTP ${res.status})`);
  const person = (await res.json()) as Person;
  personCache.set(personId, person);
  return person;
}

export const fetchRoomAvatar = withCache(async (roomId: string, myId: string): Promise<string | undefined> => {
  const h = await headers();
  const res = await fetch(`${BASE_URL}/memberships?roomId=${roomId}&max=10`, { headers: h });
  if (!res.ok) return undefined;
  const members = ((await res.json()) as { items: Membership[] }).items;
  const other = members.find((m) => m.personId !== myId);
  if (!other) return undefined;
  const person = await fetchPerson(other.personId);
  return person.avatar;
});

export async function fetchPeople(personIds: string[]): Promise<Map<string, Person>> {
  const unique = [...new Set(personIds)];
  const results = new Map<string, Person>();
  await Promise.all(
    unique.map(async (id) => {
      try {
        const person = await fetchPerson(id);
        results.set(id, person);
      } catch {
        // skip failures
      }
    }),
  );
  return results;
}

export type Meeting = {
  id: string;
  title: string;
  start: string;
  end: string;
  webLink: string;
};

// --- Memberships ---

export async function fetchRoomMemberships(roomId: string): Promise<Membership[]> {
  const h = await headers();
  const res = await fetch(`${BASE_URL}/memberships?roomId=${roomId}&max=100`, { headers: h });
  if (!res.ok) throw new Error(`${res.statusText} (HTTP ${res.status})`);
  return ((await res.json()) as { items: Membership[] }).items;
}

// --- Rooms ---

export async function fetchRooms(): Promise<Room[]> {
  const h = await headers();
  const response = await fetch(`${BASE_URL}/rooms?sortBy=lastactivity&max=50`, { headers: h });
  if (!response.ok) throw new Error(`${response.statusText} (HTTP ${response.status})`);
  const data = (await response.json()) as { items: Room[] };
  return data.items;
}

// --- Unread ---

export async function fetchUnreadRooms(): Promise<{ room: Room; messages: Message[] }[]> {
  const h = await headers();

  // Fetch rooms sorted by recent activity
  const roomsRes = await fetch(`${BASE_URL}/rooms?sortBy=lastactivity&max=30`, { headers: h });
  if (!roomsRes.ok) throw new Error(`${roomsRes.statusText} (HTTP ${roomsRes.status})`);
  const rooms = ((await roomsRes.json()) as { items: Room[] }).items;

  // Get current user info
  const meRes = await fetch(`${BASE_URL}/people/me`, { headers: h });
  if (!meRes.ok) throw new Error(`${meRes.statusText} (HTTP ${meRes.status})`);
  const me = (await meRes.json()) as { id: string };

  // For each room, check membership lastSeenId vs latest message
  const results: { room: Room; messages: Message[] }[] = [];

  await Promise.all(
    rooms.map(async (room) => {
      try {
        // Get my membership in this room
        const memRes = await fetch(`${BASE_URL}/memberships?roomId=${room.id}&personId=${me.id}`, { headers: h });
        if (!memRes.ok) return;
        const memberships = ((await memRes.json()) as { items: Membership[] }).items;
        if (memberships.length === 0) return;

        const lastSeenId = memberships[0].lastSeenId;

        // Get recent messages
        const msgRes = await fetch(`${BASE_URL}/messages?roomId=${room.id}&max=10`, { headers: h });
        if (!msgRes.ok) return;
        const messages = ((await msgRes.json()) as { items: Message[] }).items;

        if (messages.length === 0) return;

        // If no lastSeenId, all messages are unread; otherwise collect messages newer than lastSeenId
        let unread: Message[];
        if (!lastSeenId) {
          unread = messages;
        } else {
          unread = [];
          for (const msg of messages) {
            if (msg.id === lastSeenId) break;
            unread.push(msg);
          }
        }

        if (unread.length > 0) {
          results.push({ room, messages: unread });
        }
      } catch {
        // skip rooms that fail
      }
    }),
  );

  return results;
}

// --- Messages ---

export async function fetchMessages(roomId: string, max = 30): Promise<Message[]> {
  const h = await headers();
  const response = await fetch(`${BASE_URL}/messages?roomId=${roomId}&max=${max}`, { headers: h });
  if (!response.ok) throw new Error(`${response.statusText} (HTTP ${response.status})`);
  const data = (await response.json()) as { items: Message[] };
  return data.items;
}

export async function fetchUnreadCounts(roomIds: string[], myId: string): Promise<Map<string, number>> {
  const h = await headers();
  const counts = new Map<string, number>();

  await Promise.all(
    roomIds.map(async (roomId) => {
      try {
        const memRes = await fetch(`${BASE_URL}/memberships?roomId=${roomId}&personId=${myId}`, { headers: h });
        if (!memRes.ok) return;
        const memberships = ((await memRes.json()) as { items: Membership[] }).items;
        if (memberships.length === 0) return;
        const lastSeenId = memberships[0].lastSeenId;
        if (!lastSeenId) {
          counts.set(roomId, -1);
          return;
        }

        const msgRes = await fetch(`${BASE_URL}/messages?roomId=${roomId}&max=10`, { headers: h });
        if (!msgRes.ok) return;
        const messages = ((await msgRes.json()) as { items: Message[] }).items;

        let count = 0;
        for (const msg of messages) {
          if (msg.id === lastSeenId) break;
          count++;
        }
        if (count > 0) counts.set(roomId, count);
      } catch {
        // skip
      }
    }),
  );

  return counts;
}

export async function fetchMe(): Promise<{ id: string; emails: string[] }> {
  const h = await headers();
  const res = await fetch(`${BASE_URL}/people/me`, { headers: h });
  if (!res.ok) throw new Error(`${res.statusText} (HTTP ${res.status})`);
  return (await res.json()) as { id: string; emails: string[] };
}

export async function editMessage(messageId: string, roomId: string, text: string) {
  const h = await headers();
  const response = await fetch(`${BASE_URL}/messages/${messageId}`, {
    method: "PUT",
    headers: h,
    body: JSON.stringify({ roomId, text }),
  });
  if (!response.ok) {
    throw new Error(`${response.statusText} (HTTP ${response.status})`);
  }
}

export async function sendMessage(roomId: string, text: string, filePath?: string) {
  const accessToken = await authorize();
  if (filePath) {
    const form = new FormData();
    form.set("roomId", roomId);
    if (text) form.set("text", text);
    form.set("files", fileFromSync(filePath));
    const response = await fetch(`${BASE_URL}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    });
    if (!response.ok) {
      throw new Error(`${response.statusText} (HTTP ${response.status})`);
    }
  } else {
    const h = await headers();
    const response = await fetch(`${BASE_URL}/messages`, {
      method: "POST",
      headers: h,
      body: JSON.stringify({ roomId, text }),
    });
    if (!response.ok) {
      throw new Error(`${response.statusText} (HTTP ${response.status})`);
    }
  }
}

export async function fetchFileHead(fileUrl: string): Promise<{ contentType: string; fileName: string }> {
  const h = await headers();
  const response = await fetch(fileUrl, { method: "HEAD", headers: h });
  if (!response.ok) throw new Error(`${response.statusText} (HTTP ${response.status})`);
  const contentType = response.headers.get("content-type") || "application/octet-stream";
  const disposition = response.headers.get("content-disposition") || "";
  const match = disposition.match(/filename="?([^";\n]+)"?/);
  const fileName = match?.[1] || "attachment";
  return { contentType, fileName };
}

export async function downloadFile(fileUrl: string, destPath: string): Promise<void> {
  const { createWriteStream } = await import("fs");
  const { pipeline } = await import("stream/promises");
  const h = await headers();
  const response = await fetch(fileUrl, { headers: h });
  if (!response.ok) throw new Error(`${response.statusText} (HTTP ${response.status})`);
  if (!response.body) throw new Error("No response body");
  await pipeline(response.body, createWriteStream(destPath));
}

export async function fetchFileBase64(fileUrl: string): Promise<{ dataUri: string; contentType: string; fileName: string }> {
  const h = await headers();
  const response = await fetch(fileUrl, { headers: h });
  if (!response.ok) throw new Error(`${response.statusText} (HTTP ${response.status})`);
  const contentType = response.headers.get("content-type") || "application/octet-stream";
  const disposition = response.headers.get("content-disposition") || "";
  const match = disposition.match(/filename="?([^";\n]+)"?/);
  const fileName = match?.[1] || "attachment";
  const arrayBuffer = await response.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  return { dataUri: `data:${contentType};base64,${base64}`, contentType, fileName };
}

// --- Meetings ---

export async function fetchMeetings(): Promise<Meeting[]> {
  const h = await headers();
  const now = new Date();
  const from = now.toISOString();
  const to = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const response = await fetch(`${BASE_URL}/meetings?from=${from}&to=${to}&max=50`, { headers: h });
  if (!response.ok) throw new Error(`${response.statusText} (HTTP ${response.status})`);
  const data = (await response.json()) as { items: Meeting[] };
  return data.items;
}

export async function createMeeting(title: string, start: string, end: string): Promise<Meeting> {
  const h = await headers();
  const response = await fetch(`${BASE_URL}/meetings`, {
    method: "POST",
    headers: h,
    body: JSON.stringify({ title, start, end, enabledAutoRecordMeeting: false }),
  });
  if (!response.ok) {
    throw new Error(`${response.statusText} (HTTP ${response.status})`);
  }
  return (await response.json()) as Meeting;
}
