import type { SupabaseClient } from "@supabase/supabase-js";
import { getSession } from "./session";
import type { ChatTurn } from "./advisor";

export interface Thread {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}
export interface Message extends ChatTurn {
  id: string;
  createdAt: string;
}

const NEW_TITLE = "New conversation";

// In-memory store used when running on sample data without a signed-in Supabase user.
const memThreads = new Map<string, Thread>();
const memMessages = new Map<string, Message[]>();

interface Store {
  list(): Promise<Thread[]>;
  create(): Promise<Thread>;
  get(id: string): Promise<Thread | null>;
  remove(id: string): Promise<void>;
  messages(threadId: string, limit?: number): Promise<Message[]>;
  add(threadId: string, role: ChatTurn["role"], content: string): Promise<Message>;
  titleIfNew(threadId: string, fromText: string): Promise<void>;
  setTitle(threadId: string, title: string): Promise<void>;
}

const memory: Store = {
  async list() {
    return [...memThreads.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },
  async create() {
    const now = new Date().toISOString();
    const t: Thread = { id: crypto.randomUUID(), title: NEW_TITLE, createdAt: now, updatedAt: now };
    memThreads.set(t.id, t);
    memMessages.set(t.id, []);
    return t;
  },
  async get(id) {
    return memThreads.get(id) ?? null;
  },
  async remove(id) {
    memThreads.delete(id);
    memMessages.delete(id);
  },
  async messages(threadId, limit = 30) {
    return (memMessages.get(threadId) ?? []).slice(-limit);
  },
  async add(threadId, role, content) {
    const m: Message = { id: crypto.randomUUID(), role, content, createdAt: new Date().toISOString() };
    memMessages.get(threadId)?.push(m);
    const t = memThreads.get(threadId);
    if (t) t.updatedAt = m.createdAt;
    return m;
  },
  async titleIfNew(threadId, fromText) {
    const t = memThreads.get(threadId);
    if (t && t.title === NEW_TITLE) t.title = titleFrom(fromText);
  },
  async setTitle(threadId, title) {
    const t = memThreads.get(threadId);
    if (t) t.title = title;
  },
};

function supabaseStore(supabase: SupabaseClient, userId: string): Store {
  const mapThread = (r: Record<string, string>): Thread => ({
    id: r.id,
    title: r.title,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  });
  return {
    async list() {
      const { data } = await supabase.from("chat_threads").select("*").eq("user_id", userId).order("updated_at", { ascending: false }).limit(50);
      return (data ?? []).map(mapThread);
    },
    async create() {
      const { data, error } = await supabase.from("chat_threads").insert({ user_id: userId }).select().single();
      if (error) throw error;
      return mapThread(data);
    },
    async get(id) {
      const { data } = await supabase.from("chat_threads").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
      return data ? mapThread(data) : null;
    },
    async remove(id) {
      await supabase.from("chat_threads").delete().eq("id", id);
    },
    async messages(threadId, limit = 30) {
      const { data } = await supabase
        .from("chat_messages")
        .select("id, role, content, created_at")
        .eq("thread_id", threadId)
        .order("created_at", { ascending: false })
        .limit(limit);
      return (data ?? [])
        .reverse()
        .filter((r) => r.role !== "system")
        .map((r) => ({ id: r.id, role: r.role as ChatTurn["role"], content: r.content, createdAt: r.created_at }));
    },
    async add(threadId, role, content) {
      const { data, error } = await supabase
        .from("chat_messages")
        .insert({ thread_id: threadId, user_id: userId, role, content })
        .select("id, role, content, created_at")
        .single();
      if (error) throw error;
      await supabase.from("chat_threads").update({ updated_at: new Date().toISOString() }).eq("id", threadId);
      return { id: data.id, role, content, createdAt: data.created_at };
    },
    async titleIfNew(threadId, fromText) {
      await supabase.from("chat_threads").update({ title: titleFrom(fromText) }).eq("id", threadId).eq("title", NEW_TITLE);
    },
    async setTitle(threadId, title) {
      await supabase.from("chat_threads").update({ title }).eq("id", threadId).eq("user_id", userId);
    },
  };
}

function titleFrom(text: string) {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > 48 ? t.slice(0, 48).trimEnd() + "…" : t || NEW_TITLE;
}

export async function getStore(): Promise<Store> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return memory;
  const session = await getSession();
  if (!session) return memory;
  return supabaseStore(session.supabase, session.userId);
}
