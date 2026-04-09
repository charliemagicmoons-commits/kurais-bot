// ============================================
//  Kurai's Bot — Discord bot powered by Claude
// ============================================
// Setup:
//   1. npm install
//   2. Copy .env.example to .env and fill in your keys
//   3. node index.js

require("dotenv").config();
const { Client, GatewayIntentBits, Events } = require("discord.js");
const Anthropic = require("@anthropic-ai/sdk");

// ── Clients ──────────────────────────────────
const discord = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
});

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Per-channel conversation memory (last 20 turns) ──
const conversationHistory = new Map();
const MAX_HISTORY = 20;

// ── System prompt ────────────────────────────
const SYSTEM_PROMPT = `You are Kurai's Bot, a helpful and friendly Discord assistant powered by Claude.
You were set up by Kurai. Keep responses concise and suitable for Discord chat.
You can help with questions, creative writing, code, explanations, and casual conversation.
Use Discord markdown formatting when it helps readability (bold, code blocks, etc.).
Don't include long walls of text — keep things digestible for a chat interface.`;

// ── Helper: get or create history for a channel ──
function getHistory(channelId) {
  if (!conversationHistory.has(channelId)) {
    conversationHistory.set(channelId, []);
  }
  return conversationHistory.get(channelId);
}

function pushHistory(channelId, role, content) {
  const history = getHistory(channelId);
  history.push({ role, content });
  // Keep only the last MAX_HISTORY messages
  if (history.length > MAX_HISTORY) {
    history.splice(0, history.length - MAX_HISTORY);
  }
}

// ── Ask Claude ────────────────────────────────
async function askClaude(channelId, userMessage) {
  pushHistory(channelId, "user", userMessage);

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: getHistory(channelId),
  });

  const reply = response.content[0].text;
  pushHistory(channelId, "assistant", reply);
  return reply;
}

// ── Split long messages for Discord (2000 char limit) ──
function splitMessage(text, maxLen = 1900) {
  if (text.length <= maxLen) return [text];
  const parts = [];
  while (text.length > 0) {
    parts.push(text.slice(0, maxLen));
    text = text.slice(maxLen);
  }
  return parts;
}

// ── Discord Events ────────────────────────────
discord.once(Events.ClientReady, (client) => {
  console.log(`✅ Kurai's Bot is online as ${client.user.tag}`);
  client.user.setActivity("Powered by Claude 🤖");
});

discord.on(Events.MessageCreate, async (message) => {
  // Ignore bots and system messages
  if (message.author.bot || message.system) return;

  const botMentioned = message.mentions.has(discord.user);
  const isDM = message.channel.type === 1; // DM channel

  // Respond if mentioned in a server, or in a DM
  if (!botMentioned && !isDM) return;

  // Strip the mention from the message text
  let userText = message.content
    .replace(`<@${discord.user.id}>`, "")
    .replace(`<@!${discord.user.id}>`, "")
    .trim();

  if (!userText) {
    return message.reply("Hey! How can I help you? 😊");
  }

  // Show typing indicator
  await message.channel.sendTyping();

  try {
    const channelId = message.channel.id;
    const reply = await askClaude(channelId, userText);

    // Send in chunks if needed
    const parts = splitMessage(reply);
    for (let i = 0; i < parts.length; i++) {
      if (i === 0) {
        await message.reply(parts[i]);
      } else {
        await message.channel.send(parts[i]);
      }
    }
  } catch (err) {
    console.error("Error calling Claude:", err);
    await message.reply(
      "⚠️ Something went wrong. Please try again in a moment."
    );
  }
});

// ── Commands (prefix: !) ──────────────────────
discord.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  if (message.content === "!clear") {
    conversationHistory.delete(message.channel.id);
    return message.reply("🧹 Conversation history cleared for this channel!");
  }

  if (message.content === "!ping") {
    return message.reply(
      `🏓 Pong! Latency: **${discord.ws.ping}ms**`
    );
  }

  if (message.content === "!help") {
    return message.reply(
      `**Kurai's Bot — Help**\n\n` +
      `Mention me or DM me to chat: \`@Kurai's Bot <your message>\`\n\n` +
      `**Commands:**\n` +
      `\`!ping\` — Check if I'm alive\n` +
      `\`!clear\` — Clear this channel's conversation history\n` +
      `\`!help\` — Show this message\n\n` +
      `_Powered by Claude ✨_`
    );
  }
});

// ── Login ─────────────────────────────────────
discord.login(process.env.DISCORD_BOT_TOKEN);
    
