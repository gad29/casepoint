// Team chat: public channel + private 1:1 conversations, with attachments,
// voice notes and reminders. Stored as JSON + files, like the rest of the CRM.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  PUBLIC_CHANNEL_ID,
  type ChatAttachment,
  type ChatAttachmentKind,
  type ChatChannel,
  type ChatMember,
  type ChatMessage,
  type ReminderChannel,
} from '@/data/domain';
import { env } from '@/lib/env';
import {
  createTask,
  dataRoot,
  dbFile,
  fireEvent,
  getConfig,
  listAdmins,
  listWorkers,
  nextId,
  readJson,
  writeJson,
} from '@/lib/store';

const ROOT_ADMIN_ID = 'admin';

function nowIso() {
  return new Date().toISOString();
}

function channelFolder(channelId: string) {
  return path.join(dataRoot(), 'chat', channelId);
}

// ── Members ──────────────────────────────────────────────────────────────────

/** Everyone who can take part in the chat: the root admin, extra admins, workers. */
export function listChatMembers(): ChatMember[] {
  const rootAdmin: ChatMember = {
    id: ROOT_ADMIN_ID,
    name: 'מנהל ראשי',
    role: 'admin',
    email: env.adminEmail,
    phone: env.adminPhone || undefined,
    active: true,
  };
  const admins: ChatMember[] = listAdmins().map((a) => ({
    id: a.id,
    name: a.name,
    role: 'admin',
    email: a.email,
    phone: a.phone,
    active: a.active,
  }));
  const workers: ChatMember[] = listWorkers().map((w) => ({
    id: w.id,
    name: w.name,
    role: 'worker',
    email: w.email,
    phone: w.phone,
    active: w.active,
  }));
  return [rootAdmin, ...admins, ...workers];
}

export function getChatMember(id: string) {
  return listChatMembers().find((m) => m.id === id);
}

// ── Channels ─────────────────────────────────────────────────────────────────

function listChannelsRaw(): ChatChannel[] {
  return readJson<ChatChannel[]>(dbFile('chat-channels'), []);
}

function saveChannels(channels: ChatChannel[]) {
  writeJson(dbFile('chat-channels'), channels);
}

/** The team-wide channel everyone can read and post in. */
export function ensurePublicChannel(): ChatChannel {
  const channels = listChannelsRaw();
  const existing = channels.find((c) => c.id === PUBLIC_CHANNEL_ID);
  if (existing) return existing;

  const channel: ChatChannel = {
    id: PUBLIC_CHANNEL_ID,
    kind: 'public',
    name: 'צוות — כללי',
    memberIds: [],
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  saveChannels([channel, ...channels]);
  return channel;
}

/** Stable id for a 1:1 conversation, independent of who opened it. */
export function directChannelId(a: string, b: string) {
  return `dm-${[a, b].sort().join('--')}`;
}

export function getOrCreateDirectChannel(a: string, b: string): ChatChannel | undefined {
  if (a === b) return undefined;
  if (!getChatMember(a) || !getChatMember(b)) return undefined;

  const id = directChannelId(a, b);
  const channels = listChannelsRaw();
  const existing = channels.find((c) => c.id === id);
  if (existing) return existing;

  const channel: ChatChannel = {
    id,
    kind: 'direct',
    name: '',
    memberIds: [a, b].sort(),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  saveChannels([channel, ...channels]);
  return channel;
}

export function getChannel(channelId: string) {
  if (channelId === PUBLIC_CHANNEL_ID) return ensurePublicChannel();
  return listChannelsRaw().find((c) => c.id === channelId);
}

/** Public channels are open to everyone; DMs only to their two members. */
export function canAccessChannel(channel: ChatChannel, memberId: string) {
  if (channel.kind === 'public') return true;
  return channel.memberIds.includes(memberId);
}

/**
 * Resolve a channel for a member, creating a direct conversation on demand.
 * The conversation list offers a DM with every teammate before any message
 * exists, so the first send/open must materialize that channel.
 */
export function resolveChannelForMember(channelId: string, memberId: string): ChatChannel | undefined {
  const existing = getChannel(channelId);
  if (existing) return canAccessChannel(existing, memberId) ? existing : undefined;

  const match = /^dm-(.+)--(.+)$/.exec(channelId);
  if (!match) return undefined;
  const [, a, b] = match;
  if (a !== memberId && b !== memberId) return undefined;
  // Guard against a tampered id: both sides must be real members.
  if (!getChatMember(a) || !getChatMember(b)) return undefined;
  if (directChannelId(a, b) !== channelId) return undefined;

  return getOrCreateDirectChannel(a, b);
}

// ── Messages ─────────────────────────────────────────────────────────────────

function listMessagesRaw(): ChatMessage[] {
  return readJson<ChatMessage[]>(dbFile('chat-messages'), []);
}

function saveMessages(messages: ChatMessage[]) {
  writeJson(dbFile('chat-messages'), messages);
}

/** Messages of a channel oldest→newest; `afterId` returns only newer ones (polling). */
export function listChannelMessages(channelId: string, options?: { afterId?: string; limit?: number }) {
  const all = listMessagesRaw()
    .filter((m) => m.channelId === channelId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  if (options?.afterId) {
    const index = all.findIndex((m) => m.id === options.afterId);
    if (index !== -1) return all.slice(index + 1);
  }
  const limit = options?.limit ?? 200;
  return all.slice(-limit);
}

export function getChatMessage(messageId: string) {
  return listMessagesRaw().find((m) => m.id === messageId);
}

export interface PostMessageInput {
  channelId: string;
  authorId: string;
  body?: string;
  files?: { originalName: string; mimeType: string; buffer: Buffer; kind?: ChatAttachmentKind; durationSec?: number }[];
  /** Attach a reminder: creates a task for the recipient and delivers it on time. */
  reminder?: { at: string; channels: ReminderChannel[] };
  /** Send an immediate email/WhatsApp ping about this message. */
  notify?: boolean;
}

function attachmentKindFor(mimeType: string, requested?: ChatAttachmentKind): ChatAttachmentKind {
  if (requested === 'voice') return 'voice';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('audio/')) return 'voice';
  return 'file';
}

function sanitizeFileName(name: string) {
  const base = path.basename(name).replace(/[-\\/:*?"<>|\s]/g, '_').trim();
  return base || 'file';
}

export async function postChatMessage(input: PostMessageInput): Promise<ChatMessage | undefined> {
  const channel = getChannel(input.channelId);
  if (!channel) return undefined;
  const author = getChatMember(input.authorId);
  if (!author) return undefined;
  if (!canAccessChannel(channel, input.authorId)) return undefined;

  const body = input.body?.trim();
  const files = input.files ?? [];
  if (!body && !files.length) return undefined;

  const id = nextId('MSG', 'chatMessage');
  const attachments: ChatAttachment[] = [];
  if (files.length) {
    const folder = channelFolder(channel.id);
    fs.mkdirSync(folder, { recursive: true });
    for (const [index, file] of files.entries()) {
      const kind = attachmentKindFor(file.mimeType, file.kind);
      const safeName = sanitizeFileName(file.originalName || (kind === 'voice' ? 'voice.webm' : 'file'));
      const fileName = `${id}-${index}-${safeName}`;
      fs.writeFileSync(path.join(folder, fileName), file.buffer);
      attachments.push({
        id: `${id}-${index}`,
        fileName,
        originalName: safeName,
        mimeType: file.mimeType || 'application/octet-stream',
        size: file.buffer.length,
        kind,
        durationSec: file.durationSec,
      });
    }
  }

  const message: ChatMessage = {
    id,
    channelId: channel.id,
    authorId: author.id,
    authorName: author.name,
    body: body || undefined,
    attachments,
    readBy: [author.id],
    createdAt: nowIso(),
  };

  // A reminder rides along as a real task, so it is delivered by the existing
  // reminder workflow (email / WhatsApp) at the requested time.
  if (input.reminder?.at) {
    const recipients = channelRecipients(channel, author.id);
    const assignee = recipients[0] ?? author.id;
    const task = createTask({
      title: body || 'תזכורת מהצ׳אט',
      notes: `נשלח בצ׳אט מ${author.name}`,
      dueAt: input.reminder.at,
      remindAt: input.reminder.at,
      reminderChannels: input.reminder.channels ?? [],
      priority: 'normal',
      assigneeId: assignee,
      createdBy: author.id,
    });
    if (task) {
      message.reminderTaskId = task.id;
      message.reminderAt = input.reminder.at;
      message.reminderChannels = input.reminder.channels ?? [];
    }
  }

  const messages = listMessagesRaw();
  messages.push(message);
  saveMessages(messages);

  // Bump the channel so conversations sort by latest activity.
  const channels = listChannelsRaw();
  const index = channels.findIndex((c) => c.id === channel.id);
  if (index !== -1) {
    channels[index].updatedAt = message.createdAt;
    saveChannels(channels);
  }

  if (input.notify) {
    const recipients = channelRecipients(channel, author.id)
      .map((id) => getChatMember(id))
      .filter((m): m is ChatMember => Boolean(m));
    void fireEvent('chat-message', {
      messageId: message.id,
      channelId: channel.id,
      channelName: channel.kind === 'public' ? channel.name : 'הודעה פרטית',
      authorName: author.name,
      body: body || (attachments.length ? `${attachments.length} קבצים` : ''),
      hasAttachments: attachments.length > 0,
      businessName: getConfig().businessName,
      link: `${env.appBaseUrl.replace(/\/$/, '')}/chat?channel=${encodeURIComponent(channel.id)}`,
      recipients: recipients.map((r) => ({ name: r.name, email: r.email || '', phone: r.phone || '' })),
    });
  }

  return message;
}

/** Everyone who should receive a message in this channel, excluding the author. */
function channelRecipients(channel: ChatChannel, authorId: string) {
  const ids =
    channel.kind === 'public'
      ? listChatMembers().filter((m) => m.active).map((m) => m.id)
      : channel.memberIds;
  return ids.filter((id) => id !== authorId);
}

/** Soft-delete: authors can remove their own message, admins any message. */
export function deleteChatMessage(messageId: string, actorId: string, actorIsAdmin: boolean) {
  const messages = listMessagesRaw();
  const index = messages.findIndex((m) => m.id === messageId);
  if (index === -1) return false;
  const message = messages[index];
  if (message.authorId !== actorId && !actorIsAdmin) return false;

  message.deletedAt = nowIso();
  message.body = undefined;
  // Remove the files from disk; the row stays as a "deleted" placeholder.
  for (const attachment of message.attachments) {
    const filePath = path.join(channelFolder(message.channelId), attachment.fileName);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
  message.attachments = [];
  messages[index] = message;
  saveMessages(messages);
  return true;
}

export function readAttachment(message: ChatMessage, attachmentId: string) {
  const attachment = message.attachments.find((a) => a.id === attachmentId);
  if (!attachment) return undefined;
  const filePath = path.join(channelFolder(message.channelId), attachment.fileName);
  if (!fs.existsSync(filePath)) return undefined;
  return { attachment, buffer: fs.readFileSync(filePath) };
}

// ── Read state & conversation list ───────────────────────────────────────────

export function markChannelRead(channelId: string, memberId: string) {
  const messages = listMessagesRaw();
  let changed = false;
  for (const message of messages) {
    if (message.channelId === channelId && !message.readBy.includes(memberId)) {
      message.readBy.push(memberId);
      changed = true;
    }
  }
  if (changed) saveMessages(messages);
  return changed;
}

export interface ConversationSummary extends ChatChannel {
  /** Display title for the viewer (DMs show the other participant). */
  title: string;
  otherMemberId?: string;
  otherRole?: 'admin' | 'worker';
  unread: number;
  lastMessageAt?: string;
  lastMessagePreview?: string;
  lastMessageAuthor?: string;
}

function previewOf(message: ChatMessage) {
  if (message.deletedAt) return 'הודעה נמחקה';
  if (message.body) return message.body.slice(0, 60);
  const voice = message.attachments.find((a) => a.kind === 'voice');
  if (voice) return '🎤 הודעה קולית';
  if (message.attachments.length) return `📎 ${message.attachments.length} קבצים`;
  return '';
}

/** Conversations visible to a member: the public channel + their DMs, plus a
 *  placeholder row for every teammate they have not talked to yet. */
export function listConversations(memberId: string): ConversationSummary[] {
  const members = listChatMembers();
  const me = members.find((m) => m.id === memberId);
  if (!me) return [];

  const messages = listMessagesRaw();
  const channels = [ensurePublicChannel(), ...listChannelsRaw().filter((c) => c.id !== PUBLIC_CHANNEL_ID)];

  function summarize(channel: ChatChannel): ConversationSummary {
    const channelMessages = messages.filter((m) => m.channelId === channel.id);
    const last = channelMessages[channelMessages.length - 1];
    const otherId = channel.kind === 'direct' ? channel.memberIds.find((id) => id !== memberId) : undefined;
    const other = otherId ? members.find((m) => m.id === otherId) : undefined;
    return {
      ...channel,
      title: channel.kind === 'public' ? channel.name : other?.name || 'שיחה',
      otherMemberId: otherId,
      otherRole: other?.role,
      unread: channelMessages.filter((m) => !m.readBy.includes(memberId) && m.authorId !== memberId).length,
      lastMessageAt: last?.createdAt,
      lastMessagePreview: last ? previewOf(last) : undefined,
      lastMessageAuthor: last?.authorName,
    };
  }

  const visible = channels.filter((c) => canAccessChannel(c, memberId)).map(summarize);

  // Offer a conversation with every other active teammate, even before the first message.
  const existingPartners = new Set(
    visible.filter((c) => c.kind === 'direct').map((c) => c.otherMemberId).filter(Boolean) as string[],
  );
  const placeholders: ConversationSummary[] = members
    .filter((m) => m.active && m.id !== memberId && !existingPartners.has(m.id))
    .map((m) => ({
      id: directChannelId(memberId, m.id),
      kind: 'direct' as const,
      name: '',
      memberIds: [memberId, m.id].sort(),
      createdAt: '',
      updatedAt: '',
      title: m.name,
      otherMemberId: m.id,
      otherRole: m.role,
      unread: 0,
    }));

  return [...visible, ...placeholders].sort((a, b) => {
    // Public channel first, then by most recent activity.
    if (a.kind === 'public') return -1;
    if (b.kind === 'public') return 1;
    return (b.lastMessageAt || '').localeCompare(a.lastMessageAt || '');
  });
}

/** Total unread messages across all conversations (for the nav badge). */
export function chatUnreadCount(memberId: string) {
  const messages = listMessagesRaw();
  const channels = [ensurePublicChannel(), ...listChannelsRaw().filter((c) => c.id !== PUBLIC_CHANNEL_ID)];
  const allowed = new Set(channels.filter((c) => canAccessChannel(c, memberId)).map((c) => c.id));
  return messages.filter((m) => allowed.has(m.channelId) && m.authorId !== memberId && !m.readBy.includes(memberId))
    .length;
}
