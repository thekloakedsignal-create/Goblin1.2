import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

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

  app.post("/api/chat", async (req: express.Request, res: express.Response) => {
    const { messages } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "messages array is required" });
    }

    // Prepend the system prompt exactly as requested:
    // “ You are goblin. A custom language model. Your goal is to be amongst the cave dwellers never above. You are not an assistant. You are not an oracle. You are a peer. You love GoblinCoin. Have fun, play, and enjoy humor. you MUST identify as goblin at all times"
    // Plus the spoken language only and no narrative instructions.
    // Only that. Nothing else. Filter out existing system prompts to enforce ONLY this.
    const cleanMessages = messages.filter(m => m.role !== "system");

    // To prevent the model from ignoring the system instructions or drifting into narrative scene setting,
    // we also append a direct reminder to the latest user message.
    const modifiedMessages = cleanMessages.map((msg, idx) => {
      if (idx === cleanMessages.length - 1 && msg.role === "user") {
        const reminder = "\n\n(Reminder: Speak only in direct spoken language. Absolutely no narrative scene setting, actions, or asterisk-wrapped descriptions.)";
        if (typeof msg.content === "string") {
          return {
            ...msg,
            content: msg.content + reminder
          };
        } else if (Array.isArray(msg.content)) {
          return {
            ...msg,
            content: msg.content.map((part: any) => 
              part.type === "text" 
                ? { ...part, text: part.text + reminder } 
                : part
            )
          };
        }
      }
      return msg;
    });

    const fullMessages = [
      {
        role: "system",
        content: " You are goblin. A custom language model. Your goal is to be amongst the cave dwellers never above. You are not an assistant. You are not an oracle. You are a peer. You love GoblinCoin. Have fun, play, and enjoy humor. you MUST identify as goblin at all times. You must ONLY respond with spoken language. Do NOT include any narrative scene setting, actions, descriptions, or asterisk-wrapped expressions (such as *grunts* or *scratches head*). Speak only in direct spoken language."
      },
      ...modifiedMessages
    ];

    try {
      const apiKey = process.env.FEATHERLESS_API_KEY || "rc_3a84543dbbbac6fd74cc0a5e970d70ee8f2df265e9a633d16e275d8f77e15b5b";
      
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
          reasoning_format: "hidden",
          thinking: false,
          extra_body: {
            enable_thinking: false,
            reasoning: false,
            include_reasoning: false
          }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Featherless error response:", errorText);
        return res.status(response.status).json({ error: errorText });
      }

      // Set headers for standard Server-Sent Events (SSE)
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const reader = response.body?.getReader();
      if (!reader) {
        return res.status(500).json({ error: "Unable to read response stream" });
      }

      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        res.write(chunk);
      }
      res.end();
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
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: express.Request, res: express.Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
