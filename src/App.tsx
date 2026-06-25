import { useState, useEffect, useRef } from "react";
import { 
  Send, 
  Image as ImageIcon, 
  X, 
  Loader2,
  Terminal,
  LogIn,
  LogOut,
  Plus,
  Trash2,
  ChevronDown
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { 
  onIdTokenChanged, 
  signInWithPopup, 
  signOut, 
  User 
} from "firebase/auth";
import { auth, googleAuthProvider } from "./lib/firebase.ts";

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
  id: string | number;
  role: "user" | "assistant";
  content: MessageContent;
  textContent: string;
  imageUrl?: string;
}

interface ChatSession {
  id: number;
  title: string;
  createdAt: string;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [showSessionDropdown, setShowSessionDropdown] = useState(false);

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Monitor Auth State
  useEffect(() => {
    const unsubscribe = onIdTokenChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        const token = await firebaseUser.getIdToken();
        setAuthToken(token);
        // Sync user inside DB
        try {
          await fetch("/api/users/sync", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${token}`
            }
          });
        } catch (err) {
          console.error("Error syncing user profile:", err);
        }
      } else {
        setUser(null);
        setAuthToken(null);
        setSessions([]);
        setActiveSessionId(null);
        setMessages([]);
      }
      setIsAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Fetch sessions when user becomes available
  useEffect(() => {
    if (user && authToken) {
      fetchSessions();
    }
  }, [user, authToken]);

  // Fetch messages when active session changes
  useEffect(() => {
    if (user && authToken && activeSessionId !== null) {
      fetchMessages(activeSessionId);
    }
  }, [user, authToken, activeSessionId]);

  const fetchSessions = async () => {
    try {
      const res = await fetch("/api/sessions", {
        headers: {
          "Authorization": `Bearer ${authToken}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setSessions(data);
        if (data.length > 0) {
          // Default to the most recent session
          setActiveSessionId(data[0].id);
        } else {
          // Automatically create a new default session if none exist
          createNewSession("Initial Cave Session");
        }
      }
    } catch (err) {
      console.error("Error fetching sessions:", err);
    }
  };

  const createNewSession = async (title?: string) => {
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authToken}`
        },
        body: JSON.stringify({ title: title || `Cave Chat #${Date.now().toString().slice(-4)}` })
      });
      if (res.ok) {
        const newSession = await res.json();
        setSessions(prev => [newSession, ...prev]);
        setActiveSessionId(newSession.id);
        setShowSessionDropdown(false);
      }
    } catch (err) {
      console.error("Error creating session:", err);
    }
  };

  const deleteSession = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to purge this session?")) return;
    try {
      const res = await fetch(`/api/sessions/${id}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${authToken}`
        }
      });
      if (res.ok) {
        const updated = sessions.filter(s => s.id !== id);
        setSessions(updated);
        if (activeSessionId === id) {
          if (updated.length > 0) {
            setActiveSessionId(updated[0].id);
          } else {
            setActiveSessionId(null);
            createNewSession();
          }
        }
      }
    } catch (err) {
      console.error("Error deleting session:", err);
    }
  };

  const fetchMessages = async (sessionId: number) => {
    try {
      const res = await fetch(`/api/sessions/${sessionId}/messages`, {
        headers: {
          "Authorization": `Bearer ${authToken}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        const formatted = data.map((m: any) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          textContent: m.content,
          imageUrl: m.imageUrl || undefined
        }));
        setMessages(formatted);
      }
    } catch (err) {
      console.error("Error fetching messages:", err);
    }
  };

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleAuthProvider);
    } catch (err) {
      console.error("Login failed:", err);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

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
    const thinkStart = rawText.indexOf("<think>");
    if (thinkStart !== -1) {
      const thinkEnd = rawText.indexOf("</think>", thinkStart + 7);
      if (thinkEnd !== -1) {
        finalAnswer = rawText.substring(0, thinkStart) + rawText.substring(thinkEnd + 8);
      } else {
        finalAnswer = rawText.substring(0, thinkStart);
      }
    }
    finalAnswer = finalAnswer.replace(/<\/?think>/gi, "").trim();
    return { reasoning: "", finalAnswer: finalAnswer };
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputValue.trim() && !selectedImage) return;
    if (isGenerating || activeSessionId === null || !authToken) return;

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

    const tempUserMsgId = `user-temp-${Date.now()}`;
    const newUserMsg: Message = {
      id: tempUserMsgId,
      role: "user",
      content: contentPayload,
      textContent: currentText || "Uploaded Image",
      imageUrl: currentImg || undefined
    };

    const updatedMessages = [...messages, newUserMsg];
    setMessages(updatedMessages);
    setIsGenerating(true);

    const tempAsstMsgId = `asst-temp-${Date.now()}`;
    const initialAssistantMsg: Message = {
      id: tempAsstMsgId,
      role: "assistant",
      content: "",
      textContent: ""
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
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authToken}`
        },
        body: JSON.stringify({ 
          messages: apiMessages,
          sessionId: activeSessionId
        })
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

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");
        
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

                const { finalAnswer } = parseReasoningAndAnswer(fullText);

                setMessages(prev => {
                  return prev.map(m => {
                    if (m.id === tempAsstMsgId) {
                      return {
                        ...m,
                        content: fullText,
                        textContent: finalAnswer
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
      }

      // Reload fresh messages from database to assign real IDs
      fetchMessages(activeSessionId);

    } catch (error: any) {
      console.error("Transmit error:", error);
      setMessages(prev => {
        return prev.map(m => {
          if (m.id === tempAsstMsgId) {
            return {
              ...m,
              textContent: `⚠️ **Transmission Error.**\n\n*${error.message || "An error occurred."}*`
            };
          }
          return m;
        });
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const activeSessionTitle = sessions.find(s => s.id === activeSessionId)?.title || "Select Session";

  // Loading Screen
  if (isAuthLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen w-full bg-[#020205] text-[#22c55e] font-mono">
        <Loader2 className="w-8 h-8 animate-spin mb-3 text-green-500" />
        <span className="text-xs tracking-widest animate-pulse">BOOTING GOB_LIN LINK...</span>
      </div>
    );
  }

  // Login Screen (Unauthenticated State)
  if (!user) {
    return (
      <div className="flex flex-col h-screen w-full bg-[#020205] text-[#22c55e] font-mono overflow-hidden justify-center items-center px-4 relative">
        {/* Abstract cyber backdrop elements */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(34,197,94,0.06),transparent_70%)] pointer-events-none" />
        
        <div className="w-full max-w-md border-2 border-green-500 bg-black p-6 md:p-8 rounded shadow-[0_0_35px_rgba(34,197,94,0.15)] relative z-10">
          <div className="flex justify-center mb-6 text-green-500">
            <Terminal className="w-12 h-12 animate-pulse" />
          </div>
          
          <h1 className="text-xl md:text-2xl font-black text-center tracking-widest uppercase text-white mb-2">
            GOB_LIN TERMINAL <span className="text-green-500">GLM</span>
          </h1>
          <p className="text-xs text-center text-green-600 font-bold mb-8 uppercase tracking-wider">
            Cave Network Security Layer Active
          </p>

          <div className="space-y-4 mb-8">
            <div className="bg-green-950/20 border border-green-500/30 p-4 rounded text-[11px] leading-relaxed text-green-300">
              <span className="text-green-400 font-bold uppercase block mb-1">COGNITIVE SYNC LOG:</span>
              - Secure Cloud SQL database initialized in us-east1
              <br />
              - Real-time persistent state mapping active
              <br />
              - Identification check required for deep link
            </div>
          </div>

          <button
            onClick={handleLogin}
            className="w-full h-12 border-2 border-green-500 bg-green-500 hover:bg-green-400 text-black font-black text-xs uppercase flex items-center justify-center gap-2.5 transition-all shadow-[0_0_15px_rgba(34,197,94,0.25)] hover:shadow-[0_0_25px_rgba(34,197,94,0.4)] active:scale-95 cursor-pointer rounded"
          >
            <LogIn className="w-4 h-4 shrink-0" />
            <span>ESTABLISH COGNITIVE LINK</span>
          </button>
        </div>
      </div>
    );
  }

  // Chat Screen (Authenticated State)
  return (
    <div className="flex flex-col h-screen w-full bg-[#020205] text-[#22c55e] font-mono overflow-hidden">
      
      {/* High-Contrast Cyberpunk Header */}
      <header className="shrink-0 border-b-2 border-green-500 bg-black px-4 py-3 flex items-center justify-between shadow-[0_2px_15px_rgba(34,197,94,0.15)] relative z-40">
        <div className="flex items-center gap-2.5">
          <Terminal className="w-5 h-5 text-green-500" />
          <h1 className="text-sm md:text-base font-black tracking-widest uppercase text-white hidden sm:block">
            GOB_LIN TERMINAL <span className="text-green-500">GLM</span>
          </h1>
        </div>

        {/* Dynamic DB Sessions Controller */}
        <div className="flex items-center gap-2 flex-1 sm:flex-none justify-end">
          <div className="relative">
            <button
              onClick={() => setShowSessionDropdown(!showSessionDropdown)}
              className="h-9 px-3 bg-black border-2 border-green-500 text-xs font-bold text-green-400 hover:bg-green-950/30 flex items-center gap-1.5 rounded cursor-pointer max-w-[160px] truncate"
            >
              <span className="truncate">{activeSessionTitle}</span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showSessionDropdown ? "rotate-180" : ""}`} />
            </button>

            {showSessionDropdown && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowSessionDropdown(false)} />
                <div className="absolute right-0 mt-2 w-56 border-2 border-green-500 bg-black shadow-[0_10px_25px_rgba(0,0,0,0.9)] rounded z-50 overflow-hidden">
                  <div className="p-2 border-b border-green-900 flex justify-between items-center bg-green-950/15">
                    <span className="text-[10px] text-green-600 font-bold uppercase tracking-widest">SAVED SESSIONS</span>
                    <button
                      onClick={() => createNewSession()}
                      className="p-1 border border-green-500 hover:bg-green-500 hover:text-black rounded text-green-400 cursor-pointer"
                      title="New Session"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="max-h-48 overflow-y-auto divide-y divide-green-900/40">
                    {sessions.map(s => (
                      <div
                        key={s.id}
                        onClick={() => {
                          setActiveSessionId(s.id);
                          setShowSessionDropdown(false);
                        }}
                        className={`p-2.5 text-xs flex justify-between items-center cursor-pointer hover:bg-green-950/20 ${activeSessionId === s.id ? "text-white bg-green-950/40 font-bold" : "text-green-400"}`}
                      >
                        <span className="truncate flex-1 pr-2">{s.title}</span>
                        <button
                          onClick={(e) => deleteSession(s.id, e)}
                          className="p-1 text-red-500 hover:bg-red-950/40 rounded transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          <button
            onClick={handleLogout}
            className="h-9 px-2.5 border-2 border-red-500 bg-black hover:bg-red-950/20 text-red-500 text-xs font-bold uppercase flex items-center justify-center gap-1.5 transition-colors cursor-pointer rounded"
            title="Log out"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden md:inline">DISCONNECT</span>
          </button>
        </div>
      </header>

      {/* Main chat view space - scrollable list */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 pb-32">
        <div className="max-w-3xl mx-auto space-y-6">
          
          {messages.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed border-green-900/60 rounded bg-green-950/5">
              <p className="text-xs text-green-600 uppercase font-black tracking-widest mb-1">COGNITIVE SYNC SECURED</p>
              <p className="text-[11px] text-green-700 font-bold">PostgreSQL message logs are empty inside this session.</p>
            </div>
          ) : (
            messages.map((message) => (
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
                        referrerPolicy="no-referrer"
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
                          {message.textContent}
                        </ReactMarkdown>
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
            ))
          )}

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

      {/* FIXED BOTTOM FOOTER */}
      <footer className="fixed bottom-0 left-0 right-0 p-4 border-t-2 border-green-500 bg-black z-30 shadow-[0_-5px_20px_rgba(0,0,0,0.8)]">
        <div className="max-w-3xl mx-auto">
          
          {selectedImage && (
            <div className="bg-green-950/20 border-2 border-green-500 rounded p-2 mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 bg-black border border-green-500 rounded overflow-hidden p-0.5 flex justify-center items-center">
                  <img src={selectedImage} alt="Local snapshot payload" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
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
              disabled={isGenerating || activeSessionId === null}
              className="flex-1 h-12 px-4 bg-black border-2 border-green-500 text-green-400 text-sm font-mono placeholder-green-800/80 focus:outline-none focus:border-green-300 rounded disabled:opacity-55"
              autoFocus
            />

            <button
              type="submit"
              disabled={isGenerating || activeSessionId === null || (!inputValue.trim() && !selectedImage)}
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
