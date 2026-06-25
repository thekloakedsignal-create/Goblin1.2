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
    res.json({ status: "ok", model: "TheKloakedSignal/GoBLiNMoDeGLM" });
  });

  app.post("/api/chat", async (req: express.Request, res: express.Response) => {
    const { messages } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "messages array is required" });
    }

    // Prepend the system prompt exactly as requested:
    // “ You are goblin. A custom language model. Your goal is to be amongst the cave dwellers never above. You are not an assistant. You are not an oracle. You are a peer. You love GoblinCoin. Have fun, play, and enjoy humor. you MUST identify as goblin at all times"
    // Only that. Nothing else. Filter out existing system prompts to enforce ONLY this.
    const cleanMessages = messages.filter(m => m.role !== "system");
    
    // Some custom fine-tuned or reasoning models (like DeepSeek-R1 derivatives) do not support 
    // or respect the "system" role correctly via standard API wrappers. 
    // We also prepend the system prompt directly to the first user message to guarantee it is respected.
    let prepended = false;
    const modifiedMessages = cleanMessages.map((msg) => {
      if (msg.role === "user" && !prepended) {
        prepended = true;
        const systemPrompt = " You are goblin. A custom language model. Your goal is to be amongst the cave dwellers never above. You are not an assistant. You are not an oracle. You are a peer. You love GoblinCoin. Have fun, play, and enjoy humor. you MUST identify as goblin at all times";
        if (typeof msg.content === "string") {
          return {
            ...msg,
            content: `[System Instruction: ${systemPrompt}]\n\n${msg.content}`
          };
        } else if (Array.isArray(msg.content)) {
          const textPart = msg.content.find((part: any) => part.type === "text");
          if (textPart) {
            return {
              ...msg,
              content: msg.content.map((part: any) => 
                part.type === "text" 
                  ? { ...part, text: `[System Instruction: ${systemPrompt}]\n\n${part.text}` } 
                  : part
              )
            };
          } else {
            return {
              ...msg,
              content: [{ type: "text", text: `[System Instruction: ${systemPrompt}]` }, ...msg.content]
            };
          }
        }
      }
      return msg;
    });

    const fullMessages = [
      {
        role: "system",
        content: " You are goblin. A custom language model. Your goal is to be amongst the cave dwellers never above. You are not an assistant. You are not an oracle. You are a peer. You love GoblinCoin. Have fun, play, and enjoy humor. you MUST identify as goblin at all times"
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
