import { useState, useEffect, useRef } from "react";
import { 
  Send, 
  Image as ImageIcon, 
  Brain, 
  X, 
  Loader2,
  Terminal
} from "lucide-react";
import ReactMarkdown from "react-markdown";

interface ContentText {
  type: "text";
  text: string;
}

interface ContentImageUrl {
  type: "image_url";
  image_url: {
    url: string;
  };
}

type MessageContent = string | (ContentText | ContentImageUrl)[];

interface Message {
  id: string;
  role: "user" | "assistant";
  content: MessageContent;
  textContent: string; // Plaintext representation for rendering
  reasoning?: string; // Parsed <think> blocks
  finalAnswer?: string; // Parsed content outside <think>
  imageUrl?: string; // Cached image url
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "GoBLiNMoDeGLM terminal initialized.",
      textContent: "GoBLiNMoDeGLM terminal initialized.",
      finalAnswer: "GoBLiNMoDeGLM terminal initialized.",
    }
  ]);
  const [inputValue, setInputValue] = useState("");
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isGenerating]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const clearSelectedImage = () => {
    setSelectedImage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const parseReasoningAndAnswer = (rawText: string) => {
    let finalAnswer = rawText;
    let reasoning = "";

    // 1. Extract and strip complete <think>...</think> blocks case-insensitively
    const thinkRegex = /<think>([\s\S]*?)<\/think>/gi;
    finalAnswer = rawText.replace(thinkRegex, (match, content) => {
      reasoning += content;
      return "";
    });

    // 2. Handle an unclosed <think> block at the end of the text
    const openThinkIdx = finalAnswer.toLowerCase().indexOf("<think>");
    if (openThinkIdx !== -1) {
      const unclosedReasoning = finalAnswer.substring(openThinkIdx + 7);
      reasoning += unclosedReasoning;
      finalAnswer = finalAnswer.substring(0, openThinkIdx);
    }

    // 3. Strip any trailing partial tags to prevent "think artifacts" from flashing during streaming
    // Only matches if it actually starts with < or </ followed by partial 'think' characters at the very end
    finalAnswer = finalAnswer.replace(/<\/?(?:[tT](?:[hH](?:[iI](?:[nN](?:[kK]?>?)?)?)?)?)?$/g, "");

    return { 
      reasoning: reasoning.trim(), 
      finalAnswer: finalAnswer
    };
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputValue.trim() && !selectedImage) return;
    if (isGenerating) return;

    const currentText = inputValue;
    const currentImg = selectedImage;

    setInputValue("");
    clearSelectedImage();

    let contentPayload: MessageContent = currentText;
    if (currentImg) {
      contentPayload = [
        { type: "text", text: currentText || "Describe this image in one paragraph." },
        { 
          type: "image_url", 
          image_url: { url: currentImg } 
        }
      ];
    }

    const userMsgId = `user-${Date.now()}`;
    const newUserMsg: Message = {
      id: userMsgId,
      role: "user",
      content: contentPayload,
      textContent: currentText || "Uploaded Image",
      imageUrl: currentImg || undefined
    };

    const updatedMessages = [...messages, newUserMsg];
    setMessages(updatedMessages);
    setIsGenerating(true);

    const assistantMsgId = `asst-${Date.now()}`;
    const initialAssistantMsg: Message = {
      id: assistantMsgId,
      role: "assistant",
      content: "",
      textContent: "",
      finalAnswer: "",
      reasoning: ""
    };

    setMessages(prev => [...prev, initialAssistantMsg]);

    try {
      const apiMessages = updatedMessages.map(msg => ({
        role: msg.role,
        content: msg.content
      }));

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ messages: apiMessages })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error! Status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("Unable to read stream");
      }

      const decoder = new TextDecoder();
      let fullText = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        
        const chunk = decoder.decode(value || new Uint8Array(), { stream: !done });
        buffer += chunk;

        const lines = buffer.split("\n");
        // Keep the last part of the split (the potentially incomplete line) in the buffer
        buffer = lines.pop() || "";

        for (const line of lines) {
          const cleanLine = line.trim();
          if (!cleanLine) continue;

          if (cleanLine.startsWith("data: ")) {
            const dataStr = cleanLine.substring(6);
            if (dataStr === "[DONE]") continue;

            try {
              const parsed = JSON.parse(dataStr);
              const textDelta = parsed.choices?.[0]?.delta?.content;
              if (textDelta) {
                fullText += textDelta;

                const { reasoning, finalAnswer } = parseReasoningAndAnswer(fullText);

                setMessages(prev => {
                  return prev.map(m => {
                    if (m.id === assistantMsgId) {
                      return {
                        ...m,
                        content: fullText,
                        textContent: fullText,
                        reasoning: reasoning,
                        finalAnswer: finalAnswer
                      };
                    }
                    return m;
                  });
                });
              }
            } catch (err) {
              // Ignore partial JSON parsing errors
            }
          }
        }

        if (done) {
          // Process any final text remaining in the buffer if applicable
          if (buffer.trim()) {
            const cleanLine = buffer.trim();
            if (cleanLine.startsWith("data: ")) {
              const dataStr = cleanLine.substring(6);
              if (dataStr !== "[DONE]") {
                try {
                  const parsed = JSON.parse(dataStr);
                  const textDelta = parsed.choices?.[0]?.delta?.content;
                  if (textDelta) {
                    fullText += textDelta;
                    const { reasoning, finalAnswer } = parseReasoningAndAnswer(fullText);
                    setMessages(prev => {
                      return prev.map(m => {
                        if (m.id === assistantMsgId) {
                          return {
                            ...m,
                            content: fullText,
                            textContent: fullText,
                            reasoning: reasoning,
                            finalAnswer: finalAnswer
                          };
                        }
                        return m;
                      });
                    });
                  }
                } catch (e) {}
              }
            }
          }
          break;
        }
      }

    } catch (error: any) {
      console.error("Transmit error:", error);
      setMessages(prev => {
        return prev.map(m => {
          if (m.id === assistantMsgId) {
            return {
              ...m,
              finalAnswer: `⚠️ **Transmission Error.**\n\n*${error.message || "An error occurred."}*`,
              reasoning: "CONNECTION_FAILED"
            };
          }
          return m;
        });
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="flex flex-col h-screen w-full bg-[#020205] text-[#22c55e] font-mono overflow-hidden">
      
      {/* High-Contrast Cyberpunk Header */}
      <header className="shrink-0 border-b-2 border-green-500 bg-black px-4 py-3 flex items-center justify-between shadow-[0_2px_15px_rgba(34,197,94,0.15)]">
        <div className="flex items-center gap-2.5">
          <Terminal className="w-5 h-5 text-green-500" />
          <h1 className="text-sm md:text-base font-black tracking-widest uppercase text-white">
            GOB_LIN TERMINAL <span className="text-green-500">GLM</span>
          </h1>
        </div>
      </header>

      {/* Main chat view space - scrollable list */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 pb-32">
        <div className="max-w-3xl mx-auto space-y-6">
          {messages.map((message) => (
            <div 
              key={message.id} 
              className={`flex gap-3.5 ${
                message.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              {message.role === "assistant" && (
                <div className="w-7 h-7 shrink-0 rounded border-2 border-green-500 bg-black text-green-500 font-bold text-[10px] flex items-center justify-center tracking-tighter select-none shadow-[0_0_8px_rgba(34,197,94,0.2)]">
                  GLM
                </div>
              )}

              <div className={`max-w-[85%] flex flex-col gap-1.5 ${message.role === "user" ? "items-end" : "items-start"}`}>
                
                {/* Visual file rendering preview */}
                {message.imageUrl && (
                  <div className="mb-1 max-w-sm overflow-hidden rounded border-2 border-green-500 bg-black shadow-[0_0_15px_rgba(34,197,94,0.1)]">
                    <img 
                      src={message.imageUrl} 
                      alt="Local capture payload" 
                      className="max-h-52 w-full object-contain p-1"
                    />
                  </div>
                )}



                {/* Main bubble box with markdown support */}
                <div className={`p-4 rounded border-2 ${
                  message.role === "user" 
                    ? "bg-green-950/25 border-green-500 text-green-100 shadow-[0_0_10px_rgba(34,197,94,0.05)]" 
                    : "bg-black border-green-500/60 text-green-200"
                }`}>
                  <div className="prose prose-invert max-w-none text-sm leading-relaxed overflow-x-auto">
                    {message.role === "user" ? (
                      <p className="whitespace-pre-wrap font-sans">{message.textContent}</p>
                    ) : (
                      (() => {
                        const hasUnclosedThink = message.textContent.toLowerCase().includes("<think>") && !message.textContent.toLowerCase().includes("</think>");
                        const hasThink = message.textContent.toLowerCase().includes("<think>");
                        const reasoningText = message.reasoning || "";
                        const answerText = message.finalAnswer !== undefined ? message.finalAnswer : message.textContent;

                        return (
                          <div className="space-y-4">
                            {/* 1. Reasoning Block */}
                            {(hasThink || reasoningText.trim() !== "") && (
                              <div className="border-l-2 border-green-500/30 pl-3 py-1 my-1 bg-green-950/10 rounded-r">
                                <div className="text-[10px] text-green-500/50 uppercase tracking-widest font-bold flex items-center gap-1.5 mb-1 select-none">
                                  <span className="w-1.5 h-1.5 rounded-full bg-green-500/50 animate-pulse"></span>
                                  {hasUnclosedThink ? "Thought Process (Active)" : "Thought Process (Complete)"}
                                </div>
                                <div className="text-xs text-green-500/70 italic whitespace-pre-wrap font-sans leading-relaxed">
                                  {reasoningText || (hasUnclosedThink ? "Analyzing prompt..." : "")}
                                </div>
                              </div>
                            )}

                            {/* 2. Final Answer Block */}
                            {answerText && answerText.trim() !== "" ? (
                              <ReactMarkdown
                                components={{
                                  p: ({ children }) => <p className="mb-3 last:mb-0 leading-relaxed font-sans">{children}</p>,
                                  h1: ({ children }) => <h1 className="text-base font-bold text-green-400 mt-3 mb-2 uppercase font-mono border-b border-green-500/30 pb-0.5">{children}</h1>,
                                  h2: ({ children }) => <h2 className="text-sm font-bold text-green-400 mt-3 mb-2 uppercase font-mono">{children}</h2>,
                                  h3: ({ children }) => <h3 className="text-xs font-bold text-green-400 mt-2 mb-1 font-mono">{children}</h3>,
                                  code: ({ className, children }) => {
                                    return (
                                      <code className="bg-black border border-green-500/40 text-[#a3e635] px-2 py-1 rounded font-mono text-xs block my-2 overflow-x-auto whitespace-pre leading-relaxed select-all">
                                        {children}
                                      </code>
                                    );
                                  },
                                  ol: ({ children }) => <ol className="list-decimal list-inside pl-3 mb-3 space-y-1 font-sans">{children}</ol>,
                                  ul: ({ children }) => <ul className="list-disc list-inside pl-3 mb-3 space-y-1 font-sans">{children}</ul>,
                                  li: ({ children }) => <li className="font-sans">{children}</li>,
                                  strong: ({ children }) => <strong className="text-green-100 font-bold font-mono uppercase tracking-wider">{children}</strong>,
                                  blockquote: ({ children }) => <blockquote className="border-l-2 border-green-500 pl-3 my-2 italic opacity-90 font-sans">{children}</blockquote>,
                                }}
                              >
                                {answerText}
                              </ReactMarkdown>
                            ) : (
                              !hasUnclosedThink && (
                                <div className="text-xs text-green-500/40 animate-pulse select-none font-mono">
                                  [PREPARING RESPONSE...]
                                </div>
                              )
                            )}
                          </div>
                        );
                      })()
                    )}
                  </div>
                </div>
              </div>

              {message.role === "user" && (
                <div className="w-7 h-7 shrink-0 rounded border-2 border-green-500 bg-black text-green-500 font-bold text-[10px] flex items-center justify-center tracking-tighter select-none shadow-[0_0_8px_rgba(34,197,94,0.2)]">
                  USR
                </div>
              )}
            </div>
          ))}

          {isGenerating && (
            <div className="flex gap-3 justify-start items-center">
              <div className="w-7 h-7 rounded border border-green-500/30 text-green-500 flex items-center justify-center shrink-0 bg-black">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-green-400" />
              </div>
              <div className="text-xs text-green-500/40 flex items-center gap-1 animate-pulse">
                <span>RECEIVING STREAM...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* FIXED BOTTOM FOOTER: This guarantees that the input is always correctly aligned to the visible screen area in any mobile viewport */}
      <footer className="fixed bottom-0 left-0 right-0 p-4 border-t-2 border-green-500 bg-black z-30 shadow-[0_-5px_20px_rgba(0,0,0,0.8)]">
        <div className="max-w-3xl mx-auto">
          
          {/* File Upload image preview */}
          {selectedImage && (
            <div className="bg-green-950/20 border-2 border-green-500 rounded p-2 mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 bg-black border border-green-500 rounded overflow-hidden p-0.5 flex justify-center items-center">
                  <img src={selectedImage} alt="Local snapshot payload" className="w-full h-full object-cover" />
                </div>
                <div>
                  <span className="text-xs text-green-400 block font-bold font-mono uppercase tracking-wider">IMAGE CAPTURED</span>
                </div>
              </div>
              <button
                onClick={clearSelectedImage}
                type="button"
                className="w-7 h-7 flex items-center justify-center border-2 border-red-500 text-red-500 hover:text-red-400 rounded bg-black cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          <form onSubmit={handleSendMessage} className="flex gap-2.5">
            {/* Native file trigger button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="h-12 w-12 border-2 border-green-500 bg-black text-green-500 hover:bg-green-500 hover:text-black transition-all flex items-center justify-center rounded cursor-pointer shadow-[0_0_10px_rgba(34,197,94,0.1)] active:scale-95"
              title="Upload photo"
            >
              <ImageIcon className="w-5 h-5" />
            </button>
            
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImageChange}
              accept="image/*"
              className="hidden"
            />

            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Type a message..."
              disabled={isGenerating}
              className="flex-1 h-12 px-4 bg-black border-2 border-green-500 text-green-400 text-sm font-mono placeholder-green-800/80 focus:outline-none focus:border-green-300 rounded disabled:opacity-55"
              autoFocus
            />

            <button
              type="submit"
              disabled={isGenerating || (!inputValue.trim() && !selectedImage)}
              className="px-6 h-12 border-2 border-green-500 bg-green-500 text-black font-bold text-xs uppercase flex items-center justify-center gap-1.5 hover:bg-green-400 transition-all active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none rounded cursor-pointer shadow-[0_0_15px_rgba(34,197,94,0.2)]"
            >
              <span>SEND</span>
              <Send className="w-4 h-4 shrink-0" />
            </button>
          </form>
        </div>
      </footer>

    </div>
  );
}
