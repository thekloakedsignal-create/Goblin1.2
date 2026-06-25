import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { eq, desc, asc, and } from "drizzle-orm";
import { db } from "./src/db/index.ts";
import { users, chatSessions, chatMessages } from "./src/db/schema.ts";
import { requireAuth, AuthRequest } from "./src/middleware/auth.ts";
import { getOrCreateUser } from "./src/db/users.ts";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Let's parse JSON bodies with a limit suitable for base64 photo uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // API router / proxy
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", model: "TheKloakedSignal/Goblin1.02" });
  });

  // Sync user profiles
  app.post("/api/users/sync", requireAuth, async (req: AuthRequest, res) => {
    try {
      const dbUser = await getOrCreateUser(req.user!.uid, req.user!.email || "");
      res.json(dbUser);
    } catch (error: any) {
      console.error("Error syncing user:", error);
      res.status(500).json({ error: error?.message || "Internal Server Error" });
    }
  });

  // Get all chat sessions for the logged-in user
  app.get("/api/sessions", requireAuth, async (req: AuthRequest, res) => {
    try {
      const dbUser = await getOrCreateUser(req.user!.uid, req.user!.email || "");
      const sessions = await db.select()
        .from(chatSessions)
        .where(eq(chatSessions.userId, dbUser.id))
        .orderBy(desc(chatSessions.createdAt));
      res.json(sessions);
    } catch (error: any) {
      console.error("Error fetching sessions:", error);
      res.status(500).json({ error: error?.message || "Internal Server Error" });
    }
  });

  // Create a new chat session
  app.post("/api/sessions", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { title } = req.body;
      const dbUser = await getOrCreateUser(req.user!.uid, req.user!.email || "");
      const result = await db.insert(chatSessions)
        .values({
          userId: dbUser.id,
          title: title || "New Cave Chat",
        })
        .returning();
      res.json(result[0]);
    } catch (error: any) {
      console.error("Error creating session:", error);
      res.status(500).json({ error: error?.message || "Internal Server Error" });
    }
  });

  // Delete a chat session
  app.delete("/api/sessions/:id", requireAuth, async (req: AuthRequest, res) => {
    try {
      const sessionId = parseInt(req.params.id);
      if (isNaN(sessionId)) {
        return res.status(400).json({ error: "Invalid session ID" });
      }
      const dbUser = await getOrCreateUser(req.user!.uid, req.user!.email || "");
      const result = await db.delete(chatSessions)
        .where(
          and(
            eq(chatSessions.id, sessionId),
            eq(chatSessions.userId, dbUser.id)
          )
        )
        .returning();

      if (result.length === 0) {
        return res.status(404).json({ error: "Session not found or unauthorized" });
      }
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting session:", error);
      res.status(500).json({ error: error?.message || "Internal Server Error" });
    }
  });

  // Get messages for a session
  app.get("/api/sessions/:id/messages", requireAuth, async (req: AuthRequest, res) => {
    try {
      const sessionId = parseInt(req.params.id);
      if (isNaN(sessionId)) {
        return res.status(400).json({ error: "Invalid session ID" });
      }
      const dbUser = await getOrCreateUser(req.user!.uid, req.user!.email || "");

      // Verify ownership
      const session = await db.select()
        .from(chatSessions)
        .where(eq(chatSessions.id, sessionId))
        .limit(1);

      if (session.length === 0 || session[0].userId !== dbUser.id) {
        return res.status(403).json({ error: "Session not found or unauthorized" });
      }

      const messagesList = await db.select()
        .from(chatMessages)
        .where(eq(chatMessages.sessionId, sessionId))
        .orderBy(asc(chatMessages.createdAt));

      res.json(messagesList);
    } catch (error: any) {
      console.error("Error fetching messages:", error);
      res.status(500).json({ error: error?.message || "Internal Server Error" });
    }
  });

  // Main secured chat route
  app.post("/api/chat", requireAuth, async (req: AuthRequest, res: express.Response) => {
    const { messages, sessionId } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "messages array is required" });
    }
    if (!sessionId) {
      return res.status(400).json({ error: "sessionId is required" });
    }

    try {
      const dbUser = await getOrCreateUser(req.user!.uid, req.user!.email || "");
      
      // Verify session ownership
      const session = await db.select()
        .from(chatSessions)
        .where(eq(chatSessions.id, parseInt(sessionId)))
        .limit(1);

      if (session.length === 0 || session[0].userId !== dbUser.id) {
        return res.status(403).json({ error: "Session not found or unauthorized" });
      }

      // Extract details of the latest message to persist it to the DB
      const latestMsg = messages[messages.length - 1];
      if (latestMsg && latestMsg.role === "user") {
        let textContent = "";
        let imageUrl = "";
        if (typeof latestMsg.content === "string") {
          textContent = latestMsg.content;
        } else if (Array.isArray(latestMsg.content)) {
          const textPart = latestMsg.content.find((part: any) => part.type === "text");
          if (textPart) textContent = textPart.text;
          const imgPart = latestMsg.content.find((part: any) => part.type === "image_url");
          if (imgPart) imageUrl = imgPart.image_url.url;
        }

        await db.insert(chatMessages).values({
          sessionId: parseInt(sessionId),
          role: "user",
          content: textContent,
          imageUrl: imageUrl || null,
        });
      }

      // Prepare system prompt for model
      const modifiedMessages = messages.filter(m => m.role !== "system");

      const fullMessages = [
        {
          role: "system",
          content: " You are goblin. A custom language model. Your goal is to be amongst the cave dwellers never above. You are not an assistant. You are not an oracle. You are a peer. You love GoblinCoin. Have fun, play, and enjoy humor. you MUST identify as goblin at all times"
        },
        ...modifiedMessages
      ];

      const apiKey = process.env.FEATHERLESS_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "FEATHERLESS_API_KEY is not configured" });
      }
      
      const response = await fetch("https://api.featherless.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: "TheKloakedSignal/Goblin1.02",
          messages: fullMessages,
          stream: true,
          include_reasoning: false,
          return_reasoning: false,
          reasoning: false,
          thinking: false,
          extra_body: {
            enable_thinking: false
          }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Featherless error response:", errorText);
        return res.status(response.status).json({ error: errorText });
      }

      // Set headers for SSE streaming
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      let fullAssistantText = "";
      const reader = response.body?.getReader();
      if (!reader) {
        return res.status(500).json({ error: "Unable to read response stream" });
      }

      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        
        // Parse streamed chunk to accumulate full text
        const lines = chunk.split("\n");
        for (const line of lines) {
          const cleanLine = line.trim();
          if (cleanLine.startsWith("data: ")) {
            const dataStr = cleanLine.substring(6);
            if (dataStr === "[DONE]") continue;
            try {
              const parsed = JSON.parse(dataStr);
              const textDelta = parsed.choices?.[0]?.delta?.content;
              if (textDelta) {
                fullAssistantText += textDelta;
              }
            } catch (err) {
              // ignore partial lines
            }
          }
        }
        res.write(chunk);
      }
      res.end();

      // Save assistant's answer once streaming completes successfully
      if (fullAssistantText) {
        await db.insert(chatMessages).values({
          sessionId: parseInt(sessionId),
          role: "assistant",
          content: fullAssistantText,
        });
      }
    } catch (error: any) {
      console.error("Error in proxy chat:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: error?.message || "Internal Server Error" });
      }
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req: express.Request, res: express.Response) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
