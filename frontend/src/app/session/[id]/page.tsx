"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  ControlBar,
  useTracks,
  useConnectionState,
  useRoomContext,
  useChat,
  useParticipants,
  VideoTrack,
  type LocalUserChoices
} from "@livekit/components-react";
import { Track, ConnectionState, Room } from "livekit-client";
import "@livekit/components-styles";
import axios from "axios";
import {
  Copy, LogOut, AlertCircle, MessageSquare, X, Users,
  WifiOff, Loader2, CheckCircle2, Video, Download, ArrowLeft,
  Paperclip
} from "lucide-react";
import { ChatPersister } from "@/components/ChatPersister";
import RecordButton from "@/components/RecordButton";

const getApiUrl = () => {
  return process.env.NEXT_PUBLIC_API_URL || (typeof window !== 'undefined' ? `http://${window.location.hostname}:3001/api` : "http://localhost:3001/api");
};

const getLiveKitUrl = () => {
  return process.env.NEXT_PUBLIC_LIVEKIT_URL || (typeof window !== 'undefined' ? `ws://${window.location.hostname}:7880` : "ws://localhost:7880");
};

const LIVEKIT_SERVER_URL = typeof window !== 'undefined' ? getLiveKitUrl() : "ws://localhost:7880";

export default function SessionPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.id as string;

  const [token, setToken] = useState("");
  const [role, setRole] = useState<"AGENT" | "CUSTOMER" | null>(null);
  const [participantId, setParticipantId] = useState<string>("");
  const [joining, setJoining] = useState(false);
  const [name, setName] = useState("");
  const [inviteCopied, setInviteCopied] = useState(false);
  const [sessionData, setSessionData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const roomOptions = useMemo(() => ({
    adaptiveStream: true,
    dynacast: true,
  }), []);

  const room = useMemo(() => new Room(roomOptions), [roomOptions]);

  useEffect(() => {
    const handleUnload = () => {
      room.disconnect();
    };
    window.addEventListener("beforeunload", handleUnload);
    return () => {
      window.removeEventListener("beforeunload", handleUnload);
      room.disconnect();
    };
  }, [room]);

  const handleDisconnected = useCallback(() => {}, []);

  useEffect(() => {
    axios.get(`${getApiUrl()}/sessions/${sessionId}`)
      .then(res => {
        setSessionData(res.data.session);
        if (!res.data.session) {
          setError("Session not found.");
          setLoading(false);
          return;
        }
        if (!res.data.session.isActive) {
          setLoading(false);
          return;
        }
        const savedToken = sessionStorage.getItem(`lk_token_${sessionId}`);
        const savedPid = sessionStorage.getItem(`lk_pid_${sessionId}`);
        if (savedToken) {
          setToken(savedToken);
          setParticipantId(savedPid || "");
          setRole("AGENT");
        } else {
          setRole("CUSTOMER");
        }
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load session. Please check your connection.");
        setLoading(false);
      });
  }, [sessionId]);

  const joinAsCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setJoining(true);
    setError(null);
    try {
      const res = await axios.post(`${getApiUrl()}/sessions/${sessionId}/join`, {
        name: name.trim(),
        role: "CUSTOMER"
      });
      setToken(res.data.token);
      setParticipantId(res.data.participant.id);
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to join. The session might be invalid or ended.");
    } finally {
      setJoining(false);
    }
  };

  const joinAsAgentBypass = async () => {
    setJoining(true);
    setError(null);
    try {
      const res = await axios.post(`${getApiUrl()}/sessions/${sessionId}/agent-join`, {
        name: "Agent (Judged)",
      });
      sessionStorage.setItem(`lk_token_${sessionId}`, res.data.token);
      sessionStorage.setItem(`lk_pid_${sessionId}`, res.data.participant.id);
      setToken(res.data.token);
      setParticipantId(res.data.participant.id);
      setRole("AGENT");
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to bypass as agent.");
    } finally {
      setJoining(false);
    }
  };

  const endSession = async () => {
    if (window.confirm("End this session? All participants will be disconnected.")) {
      try {
        await axios.post(`${getApiUrl()}/sessions/${sessionId}/end`, {}, {
          headers: { 'x-participant-id': participantId }
        });
        sessionStorage.removeItem(`lk_token_${sessionId}`);
        sessionStorage.removeItem(`lk_pid_${sessionId}`);
        router.push("/");
      } catch {
        setError("Failed to end session.");
      }
    }
  };

  const copyInviteLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setInviteCopied(true);
    setTimeout(() => setInviteCopied(false), 2000);
  };

  // ── Loading ──
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <Loader2 className="w-10 h-10 text-sky-600 animate-spin mx-auto mb-4" />
          <p className="text-slate-600 text-sm font-medium">Loading session...</p>
        </div>
      </div>
    );
  }

  // ── Error (no session data) ──
  if (error && !sessionData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="bg-white p-8 rounded-2xl border border-slate-200 max-w-md w-full text-center shadow-sm">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2 text-slate-800">Session Error</h2>
          <p className="text-slate-600 mb-6">{error}</p>
          <button onClick={() => router.push("/")} className="bg-sky-600 hover:bg-sky-700 text-white px-6 py-2.5 rounded-xl font-medium transition-colors shadow-sm">
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // ── Ended Session (Post-Call Review) ──
  if (sessionData && !sessionData.isActive) {
    return <EndedSessionView sessionData={sessionData} sessionId={sessionId} />;
  }

  // ── Customer Join Form ──
  if (!token && role === "CUSTOMER") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="bg-white p-8 rounded-2xl border border-slate-200 max-w-md w-full shadow-lg">
          <div className="flex items-center justify-center gap-3 mb-6">
            <Video className="w-8 h-8 text-sky-600" />
            <h2 className="text-2xl font-bold text-slate-800">Join Session</h2>
          </div>
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-100 text-red-600 rounded-xl text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}
          <form onSubmit={joinAsCustomer}>
            <div className="mb-5">
              <label className="block text-sm font-medium text-slate-655 mb-2">Your Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-250 rounded-xl text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none transition-all"
                placeholder="Enter your name"
                required
                autoFocus
              />
            </div>
            <button
              type="submit"
              disabled={joining}
              className="w-full bg-sky-600 hover:bg-sky-700 text-white py-3 rounded-xl font-medium transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-sm"
            >
              {joining ? <><Loader2 className="w-4 h-4 animate-spin" /> Joining...</> : "Join Session"}
            </button>
          </form>
          <div className="mt-6 pt-5 border-t border-slate-100 text-center">
            <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider block mb-2.5">🔧 Judging Controls</span>
            <button
              onClick={joinAsAgentBypass}
              disabled={joining}
              className="w-full text-xs text-sky-600 hover:text-sky-700 font-semibold bg-sky-50 hover:bg-sky-100/80 border border-sky-100 py-2.5 rounded-xl transition-all flex items-center justify-center gap-2"
            >
              Switch Role: Join call as Support Agent
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!token) return null;

  // ── Active Call ──
  return (
    <div className="h-screen flex flex-col bg-slate-950">
      {/* Header */}
      <header className="bg-white/95 backdrop-blur-sm text-slate-800 px-5 py-3 flex justify-between items-center border-b border-slate-200 z-20">
        <div className="font-semibold flex items-center gap-3">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-sm text-slate-700 font-semibold">Live Support Session</span>
        </div>
        <div className="flex items-center gap-2">
          {role === "AGENT" && (
            <>
              <button onClick={copyInviteLink} className="flex items-center gap-2 bg-slate-50 hover:bg-slate-100 px-3 py-2 rounded-lg transition-colors text-xs font-medium border border-slate-250 text-slate-700 shadow-sm">
                {inviteCopied ? <><CheckCircle2 className="w-3.5 h-3.5 text-emerald-505" /> Copied!</> : <><Copy className="w-3.5 h-3.5 text-slate-500" /> Invite Link</>}
              </button>
              <RecordButton sessionId={sessionId} participantId={participantId} />
              <button onClick={endSession} className="flex items-center gap-2 bg-red-650 hover:bg-red-700 text-white px-3 py-2 rounded-lg transition-colors text-xs font-medium shadow-sm">
                <LogOut className="w-3.5 h-3.5" /> End
              </button>
            </>
          )}
          {role === "CUSTOMER" && (
            <button onClick={() => router.push("/")} className="flex items-center gap-2 bg-slate-50 hover:bg-slate-100 px-3 py-2 rounded-lg transition-colors text-xs font-medium border border-slate-250 text-slate-700 shadow-sm">
              <LogOut className="w-3.5 h-3.5 text-slate-500" /> Leave
            </button>
          )}
        </div>
      </header>

      {/* Main Room */}
      <main className="flex-1 relative overflow-hidden" data-lk-theme="default">
        <LiveKitRoom
          room={room}
          video={true}
          audio={true}
          token={token}
          serverUrl={LIVEKIT_SERVER_URL}
          style={{ height: '100%' }}
          connect={true}
          onDisconnected={handleDisconnected}
        >
          <ActiveRoomLayout 
            sessionId={sessionId} 
            participantId={participantId} 
            senderName={role === "AGENT" ? "Agent" : name || "Customer"} 
          />
          <ConnectionStatusOverlay />
          <RoomAudioRenderer />
          <ChatPersister sessionId={sessionId} participantId={participantId} />
        </LiveKitRoom>
      </main>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   Connection Status Overlay (Reconnect Handling)
   ═══════════════════════════════════════════════ */
function ConnectionStatusOverlay() {
  const connectionState = useConnectionState();

  if (connectionState === ConnectionState.Connected) return null;

  const config: Record<string, { icon: React.ReactNode; label: string; sub: string; color: string }> = {
    [ConnectionState.Connecting]: {
      icon: <Loader2 className="w-8 h-8 animate-spin" />,
      label: "Connecting...",
      sub: "Establishing secure connection",
      color: "text-sky-600",
    },
    [ConnectionState.Reconnecting]: {
      icon: <WifiOff className="w-8 h-8" />,
      label: "Reconnecting...",
      sub: "Connection dropped. Attempting to rejoin automatically.",
      color: "text-amber-600",
    },
    [ConnectionState.Disconnected]: {
      icon: <AlertCircle className="w-8 h-8" />,
      label: "Disconnected",
      sub: "The session may have ended or the connection was lost.",
      color: "text-red-650",
    },
  };

  const state = config[connectionState] || config[ConnectionState.Disconnected];

  return (
    <div className="absolute inset-0 z-30 bg-white/90 backdrop-blur-md flex items-center justify-center">
      <div className="text-center max-w-sm p-6 bg-white rounded-2xl border border-slate-200 shadow-lg">
        <div className={`${state.color} mb-4 flex justify-center`}>{state.icon}</div>
        <h3 className="text-slate-800 text-lg font-bold mb-1">{state.label}</h3>
        <p className="text-slate-505 text-sm">{state.sub}</p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   Active Room Layout (Video + Toggleable Chat)
   ═══════════════════════════════════════════════ */
function ActiveRoomLayout({ sessionId, participantId, senderName }: { sessionId: string, participantId: string, senderName: string }) {
  const [chatOpen, setChatOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const { chatMessages } = useChat();
  const prevCount = useRef(0);

  useEffect(() => {
    if (!chatOpen && chatMessages.length > prevCount.current) {
      const latest = chatMessages[chatMessages.length - 1];
      if (!latest?.from?.isLocal) {
        setUnread(prev => prev + (chatMessages.length - prevCount.current));
      }
    }
    prevCount.current = chatMessages.length;
  }, [chatMessages, chatOpen]);

  const participants = useParticipants();
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: false },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false }
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', position: 'relative', overflow: 'hidden' }}>
      {/* Video Grid */}
      <div style={{ flex: 1, overflow: 'hidden', background: '#0a0a1a' }}>
        <div className="h-full w-full p-4 bg-slate-955 flex items-center justify-center">
          <div 
            className="grid gap-4 w-full h-full max-w-7xl mx-auto"
            style={{
              gridTemplateColumns: participants.length <= 1 
                ? '1fr' 
                : 'repeat(2, minmax(0, 1fr))',
              gridTemplateRows: participants.length <= 2 
                ? '1fr' 
                : 'repeat(2, minmax(0, 1fr))',
            }}
          >
            {participants.map((p) => {
              const pTracks = tracks.filter(t => t.participant.identity === p.identity);
              const hasVideo = pTracks.length > 0;

              return (
                <div 
                  key={p.identity} 
                  className={`relative rounded-2xl overflow-hidden bg-slate-900 border transition-all duration-300 flex items-center justify-center ${
                    p.isSpeaking 
                      ? 'border-sky-500 shadow-lg shadow-sky-500/10 scale-[1.01]' 
                      : 'border-slate-800'
                  }`}
                >
                  {hasVideo ? (
                    <div className="w-full h-full relative">
                      {pTracks.map(t => (
                        <VideoTrack 
                          key={`${t.participant.identity}_${t.source}`} 
                          trackRef={t as any} 
                          className="w-full h-full object-cover"
                        />
                      ))}
                      <div className="absolute bottom-4 left-4 bg-slate-955/70 backdrop-blur-md px-3 py-1.5 rounded-xl text-xs font-semibold text-white flex items-center gap-2 border border-slate-800">
                        <span className={`w-2 h-2 rounded-full ${p.isMicrophoneEnabled ? 'bg-sky-400' : 'bg-red-505'}`} />
                        {p.name || p.identity.split('_')[0]} {p.isLocal && "(You)"}
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center text-center p-6 select-none">
                      <div className={`w-20 h-20 rounded-full bg-slate-800 border-2 flex items-center justify-center mb-4 text-2xl font-bold text-sky-400 transition-all ${
                        p.isSpeaking ? 'border-sky-500 animate-pulse bg-slate-800' : 'border-slate-700'
                      }`}>
                        {(p.name || p.identity).charAt(0).toUpperCase()}
                      </div>
                      <div className="bg-slate-955/40 backdrop-blur-sm px-3 py-1.5 rounded-xl text-xs font-semibold text-white flex items-center gap-2 border border-slate-800/60">
                        <span className={`w-2 h-2 rounded-full ${p.isMicrophoneEnabled ? 'bg-sky-400' : 'bg-red-550'}`} />
                        {p.name || p.identity.split('_')[0]} {p.isLocal && "(You)"}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Control Bar */}
      <div className="relative bg-white/95 backdrop-blur-sm border-t border-slate-200 py-1">
        <div className="flex items-center justify-center">
          <ControlBar
            variation="verbose"
            controls={{
              camera: true,
              microphone: true,
              screenShare: true,
              leave: false,
              chat: false,
            }}
          />
          {/* Custom Chat Toggle Button */}
          <button
            onClick={() => { setChatOpen(!chatOpen); if (!chatOpen) setUnread(0); }}
            className={`relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ml-2 ${
              chatOpen
                ? 'bg-sky-600 text-white shadow-sm shadow-sky-600/10'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 shadow-sm'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span className="hidden sm:inline">Chat</span>
            {unread > 0 && !chatOpen && (
              <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-bounce">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Chat Panel (slide-in from right) */}
      <div
        className="absolute top-0 right-0 h-full z-20 transition-all duration-300 ease-in-out"
        style={{ 
          width: '360px', 
          maxWidth: '100vw',
          transform: chatOpen ? 'translateX(0)' : 'translateX(100%)',
          visibility: chatOpen ? 'visible' : 'hidden',
          opacity: chatOpen ? 1 : 0,
          pointerEvents: chatOpen ? 'auto' : 'none'
        }}
      >
        <CustomChatPanel 
          onClose={() => setChatOpen(false)} 
          sessionId={sessionId} 
          participantId={participantId} 
          senderName={senderName} 
        />
      </div>

      {/* Backdrop when chat is open on mobile */}
      {chatOpen && (
        <div className="absolute inset-0 bg-black/40 z-10 md:hidden" onClick={() => setChatOpen(false)} />
      )}
    </div>
  );
}

function CustomChatPanel({ onClose, sessionId, participantId, senderName }: { onClose: () => void, sessionId: string, participantId: string, senderName: string }) {
  const { chatMessages, send, isSending } = useChat();
  const [inputText, setInputText] = useState("");
  const [uploading, setUploading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isSending) return;
    try {
      await send(inputText.trim());
      setInputText("");
    } catch (err) {
      console.error("Failed to send message", err);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("senderId", participantId);
    formData.append("senderName", senderName);

    try {
      const res = await axios.post(`${getApiUrl()}/sessions/${sessionId}/chat-files`, formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      const { chatFile } = res.data;
      
      // Broadcast file attachment JSON string
      const filePayload = JSON.stringify({
        type: "file",
        name: chatFile.name,
        url: chatFile.url,
        size: chatFile.size,
        mimeType: chatFile.mimeType
      });
      await send(filePayload);
    } catch (err) {
      console.error("Failed to upload file", err);
      alert("Failed to upload file. Unsupported type or size exceeds 50MB.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="h-full bg-white/95 backdrop-blur-lg border-l border-slate-200 flex flex-col shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-sky-605" />
          <span className="text-sm font-semibold text-slate-800">In-Call Chat</span>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-650 transition-colors p-1 rounded-lg hover:bg-slate-50">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0 bg-white">
        {chatMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 text-center px-4">
            <MessageSquare className="w-8 h-8 mb-2 opacity-35 mx-auto" />
            <p className="text-xs">No messages yet. Send a message or share a file to begin.</p>
          </div>
        ) : (
          chatMessages.map((msg, index) => {
            const isLocal = msg.from?.isLocal;
            let fileData = null;
            try {
              if (msg.message.trim().startsWith("{")) {
                const parsed = JSON.parse(msg.message);
                if (parsed.type === "file") {
                  fileData = parsed;
                }
              }
            } catch {}

            return (
              <div key={msg.id || index} className={`flex flex-col ${isLocal ? 'items-end' : 'items-start'}`}>
                <div className="flex items-baseline gap-1.5 mb-1 px-1">
                  <span className="text-[10px] font-medium text-slate-500">
                    {msg.from?.name || (isLocal ? "You" : "User")}
                  </span>
                  <span className="text-[9px] text-slate-400">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                {fileData ? (
                  <div className={`p-3 rounded-2xl max-w-[85%] border ${
                    isLocal 
                      ? 'bg-sky-50 border-sky-100 text-sky-850 rounded-tr-sm' 
                      : 'bg-slate-55 border-slate-150 text-slate-705 rounded-tl-sm'
                  }`}>
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-white rounded-lg border border-slate-100 shadow-2xs">
                        <Paperclip className="w-4 h-4 text-sky-600" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold truncate text-slate-805 max-w-[150px]">{fileData.name}</p>
                        <p className="text-[9px] text-slate-500 mt-0.5">
                          {(fileData.size / 1024).toFixed(1)} KB
                        </p>
                      </div>
                      <a
                        href={fileData.url}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-md transition-colors text-sky-600"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>
                ) : (
                  <div className={`px-3.5 py-2 rounded-2xl max-w-[85%] text-sm ${
                    isLocal 
                      ? 'bg-sky-600 text-white rounded-tr-sm shadow-md shadow-sky-600/10' 
                      : 'bg-slate-100 text-slate-800 rounded-tl-sm border border-slate-200/60'
                  }`}>
                    {msg.message}
                  </div>
                )}
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input panel */}
      <form onSubmit={handleSend} className="p-3 border-t border-slate-150 bg-slate-50 flex gap-2 items-center">
        <label className="p-2 hover:bg-slate-200/60 text-slate-500 hover:text-slate-800 rounded-lg cursor-pointer transition-colors flex-shrink-0">
          {uploading ? (
            <Loader2 className="w-4 h-4 animate-spin text-sky-650" />
          ) : (
            <Paperclip className="w-4 h-4" />
          )}
          <input
            type="file"
            onChange={handleFileUpload}
            disabled={uploading}
            className="hidden"
          />
        </label>
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Type a message..."
          className="flex-1 min-w-0 bg-white text-slate-800 text-sm px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 transition-all placeholder-slate-400 shadow-2xs"
        />
        <button
          type="submit"
          disabled={!inputText.trim() || isSending}
          className="bg-sky-600 hover:bg-sky-700 disabled:opacity-40 disabled:hover:bg-sky-600 text-white px-3.5 py-2 rounded-lg font-medium text-sm transition-colors shadow-2xs"
        >
          Send
        </button>
      </form>
    </div>
  );
}

function EndedSessionView({ sessionData, sessionId }: { sessionData: any; sessionId: string }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"chat" | "logs">("chat");

  const chatFiles = sessionData.chatFiles || [];
  const eventLogs = sessionData.eventLogs || [];
  const messages = sessionData.messages || [];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-850">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white px-6 py-4 shadow-2xs">
        <div className="max-w-5xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-3 text-slate-850">
              <Video className="w-5 h-5 text-sky-600" />
              Session Review
            </h1>
            <p className="text-slate-500 text-sm mt-0.5">
              Session {sessionId.split('-')[0]} · Ended {new Date(sessionData.createdAt).toLocaleDateString()}
            </p>
          </div>
          <button
            onClick={() => router.push("/")}
            className="flex items-center gap-2 bg-white hover:bg-slate-50 px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-slate-250 text-slate-700 shadow-2xs"
          >
            <ArrowLeft className="w-4 h-4 text-slate-500" /> Dashboard
          </button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content Area (Chat + Logs) */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 overflow-hidden flex flex-col shadow-sm" style={{ height: '600px' }}>
            {/* Tabs Header */}
            <div className="flex border-b border-slate-200 px-2 bg-slate-50">
              <button
                onClick={() => setActiveTab("chat")}
                className={`px-5 py-3.5 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${
                  activeTab === "chat"
                    ? 'border-sky-600 text-sky-655 font-bold'
                    : 'border-transparent text-slate-550 hover:text-slate-800'
                }`}
              >
                <MessageSquare className="w-4 h-4" />
                Chat History ({messages.length})
              </button>
              <button
                onClick={() => setActiveTab("logs")}
                className={`px-5 py-3.5 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${
                  activeTab === "logs"
                    ? 'border-sky-600 text-sky-655 font-bold'
                    : 'border-transparent text-slate-550 hover:text-slate-800'
                }`}
              >
                <Users className="w-4 h-4" />
                Activity Log ({eventLogs.length})
              </button>
            </div>

            {/* Tab Body */}
            <div className="flex-1 overflow-y-auto p-5">
              {activeTab === "chat" ? (
                messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-slate-400">
                    <MessageSquare className="w-10 h-10 mb-3 opacity-30" />
                    <p className="text-sm">No messages in this session.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {messages.map((msg: any) => {
                      let fileData = null;
                      try {
                        if (msg.text.trim().startsWith("{")) {
                          const parsed = JSON.parse(msg.text);
                          if (parsed.type === "file") {
                            fileData = parsed;
                          }
                        }
                      } catch {}

                      return (
                        <div key={msg.id} className="flex flex-col">
                          <div className="flex items-baseline gap-2 mb-1">
                            <span className="font-semibold text-xs text-sky-650">{msg.senderName}</span>
                            <span className="text-[10px] text-slate-400">
                              {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          {fileData ? (
                            <div className="bg-slate-50 border border-slate-200 text-slate-700 p-3 rounded-xl rounded-tl-sm text-sm self-start max-w-[85%] flex items-center gap-3">
                              <div className="p-2 bg-white rounded-lg border border-slate-100 shadow-2xs">
                                <Paperclip className="w-4 h-4 text-sky-600" />
                              </div>
                              <div className="min-w-0">
                                <p className="font-semibold text-xs text-slate-800 truncate max-w-[200px]">{fileData.name}</p>
                                <p className="text-[10px] text-slate-500 mt-0.5">
                                  {(fileData.size / 1024).toFixed(1)} KB
                                </p>
                              </div>
                              <a
                                href={fileData.url}
                                target="_blank"
                                rel="noreferrer"
                                className="p-1.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-md transition-colors text-sky-600 ml-2"
                              >
                                <Download className="w-4 h-4" />
                              </a>
                            </div>
                          ) : (
                            <div className="bg-slate-50 text-slate-700 px-3.5 py-2 rounded-xl rounded-tl-sm text-sm self-start max-w-[85%] border border-slate-100">
                              {msg.text}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )
              ) : (
                eventLogs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-slate-400">
                    <Users className="w-10 h-10 mb-3 opacity-30" />
                    <p className="text-sm">No activity logs recorded.</p>
                  </div>
                ) : (
                  <div className="relative border-l border-slate-200 ml-3 pl-6 space-y-6 py-2">
                    {eventLogs.map((log: any) => (
                      <div key={log.id} className="relative">
                        {/* Timeline dot */}
                        <div className="absolute -left-[31px] top-1.5 w-2.5 h-2.5 rounded-full bg-sky-500 border-2 border-white shadow-sm" />
                        <div>
                          <p className="text-sm text-slate-700 font-medium">{log.message}</p>
                          <p className="text-[10px] text-slate-405 mt-0.5">
                            {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="flex flex-col gap-5">
            {/* Session Details */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              <h3 className="font-semibold text-sm mb-3 text-slate-505">Session Status</h3>
              <div className="space-y-3">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-450">Created</span>
                  <span className="text-slate-700 font-semibold">{new Date(sessionData.createdAt).toLocaleTimeString()}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-450">Status</span>
                  <span className="text-red-600 font-semibold uppercase text-[10px] bg-red-50 px-2.5 py-0.5 rounded-full border border-red-100">Ended</span>
                </div>
              </div>
            </div>

            {/* Participants */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
              <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2">
                <Users className="w-4 h-4 text-sky-600" />
                <span className="font-semibold text-sm text-slate-800">Participants</span>
              </div>
              <ul className="divide-y divide-slate-100 p-2">
                {sessionData.participants?.map((p: any) => (
                  <li key={p.id} className="px-3 py-3 flex items-center justify-between">
                    <span className="font-medium text-sm text-slate-700">{p.name}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold tracking-wider uppercase ${
                      p.role === 'AGENT' ? 'bg-sky-50 text-sky-600 px-2 py-0.5 rounded-md font-semibold' : 'bg-slate-100 text-slate-550'
                    }`}>
                      {p.role}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Shared Files */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
              <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2">
                <Paperclip className="w-4 h-4 text-sky-600" />
                <span className="font-semibold text-sm text-slate-800">Shared Files</span>
              </div>
              <div className="p-4">
                {chatFiles.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-4">No files shared in this session.</p>
                ) : (
                  <div className="space-y-2.5">
                    {chatFiles.map((file: any) => (
                      <div key={file.id} className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-100 rounded-xl">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Paperclip className="w-3.5 h-3.5 text-sky-600 flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-slate-700 truncate max-w-[130px]" title={file.name}>
                              {file.name}
                            </p>
                            <p className="text-[9px] text-slate-400 mt-0.5">
                              {(file.size / 1024).toFixed(1)} KB
                            </p>
                          </div>
                        </div>
                        <a
                          href={file.url}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 hover:bg-slate-100 rounded-lg text-sky-600 transition-colors"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Recording */}
            {sessionData.recordingUrl && (
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2">
                  <Video className="w-4 h-4 text-sky-600" />
                  <span className="font-semibold text-sm text-slate-800">Recording</span>
                </div>
                <div className="p-4">
                  <video src={sessionData.recordingUrl} controls className="w-full rounded-xl bg-slate-900" />
                  <a
                    href={sessionData.recordingUrl}
                    download={`recording-${sessionId}.webm`}
                    className="flex items-center justify-center gap-2 w-full mt-3 bg-slate-50 hover:bg-slate-100 text-slate-700 py-2 rounded-xl text-xs font-semibold transition-colors border border-slate-200 shadow-2xs"
                  >
                    <Download className="w-4 h-4 text-slate-500" /> Download
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
