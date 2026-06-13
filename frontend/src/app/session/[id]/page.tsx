"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  LiveKitRoom,
  VideoConference,
  RoomAudioRenderer,
} from "@livekit/components-react";
import "@livekit/components-styles";
import axios from "axios";
import { Copy, LogOut } from "lucide-react";
import { ChatPersister } from "@/components/ChatPersister";

const API_URL = "http://localhost:3001/api";

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

  useEffect(() => {
    // Check session status first
    axios.get(\`\${API_URL}/sessions/\${sessionId}\`)
      .then(res => {
        setSessionData(res.data.session);
        if (!res.data.session.isActive) {
          setLoading(false);
          return;
        }
        
        // Active session logic
        const savedToken = sessionStorage.getItem(\`lk_token_\${sessionId}\`);
        const savedPid = sessionStorage.getItem(\`lk_pid_\${sessionId}\`);
        if (savedToken) {
          setToken(savedToken);
          setParticipantId(savedPid || "");
          setRole("AGENT");
        } else {
          setRole("CUSTOMER");
        }
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, [sessionId]);

  const joinAsCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    
    setJoining(true);
    try {
      const res = await axios.post(\`\${API_URL}/sessions/\${sessionId}/join\`, {
        name,
        role: "CUSTOMER"
      });
      setToken(res.data.token);
      setParticipantId(res.data.participant.id);
    } catch (error) {
      console.error(error);
      alert("Failed to join. The session might be invalid or ended.");
    } finally {
      setJoining(false);
    }
  };

  const endSession = async () => {
    if (window.confirm("Are you sure you want to end this support session?")) {
      try {
        await axios.post(\`\${API_URL}/sessions/\${sessionId}/end\`);
        sessionStorage.removeItem(\`lk_token_\${sessionId}\`);
        router.push("/");
      } catch (error) {
        console.error(error);
      }
    }
  };

  const copyInviteLink = () => {
    const link = window.location.href;
    navigator.clipboard.writeText(link);
    setInviteCopied(true);
    setTimeout(() => setInviteCopied(false), 2000);
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50"><p className="text-slate-500">Loading session...</p></div>;
  }

  if (sessionData && !sessionData.isActive) {
    return (
      <div className="min-h-screen bg-slate-50 p-6 md:p-12">
        <div className="max-w-4xl mx-auto">
          <header className="mb-8 flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-primary">Session Details</h1>
              <p className="text-slate-500 mt-1">This support session has ended.</p>
            </div>
            <button
              onClick={() => router.push("/")}
              className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 px-4 py-2 rounded-lg font-medium transition-colors"
            >
              Back to Dashboard
            </button>
          </header>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-[600px]">
              <div className="p-4 border-b border-slate-200 bg-slate-50 font-medium">Chat History</div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {sessionData.messages?.length === 0 ? (
                  <p className="text-center text-slate-400 mt-10">No messages sent during this session.</p>
                ) : (
                  sessionData.messages?.map((msg: any) => (
                    <div key={msg.id} className="flex flex-col">
                      <div className="flex items-baseline gap-2 mb-1">
                        <span className="font-semibold text-sm text-slate-900">{msg.senderName}</span>
                        <span className="text-xs text-slate-500">{new Date(msg.createdAt).toLocaleTimeString()}</span>
                      </div>
                      <div className="bg-slate-100 text-slate-800 p-3 rounded-lg rounded-tl-none self-start max-w-[80%]">
                        {msg.text}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 h-fit">
              <div className="p-4 border-b border-slate-200 bg-slate-50 font-medium">Participants</div>
              <ul className="divide-y divide-slate-100 p-2">
                {sessionData.participants?.map((p: any) => (
                  <li key={p.id} className="p-3 flex items-center justify-between">
                    <span className="font-medium text-slate-800">{p.name}</span>
                    <span className={\`text-xs px-2 py-1 rounded-full font-medium \${p.role === 'AGENT' ? 'bg-sky-100 text-sky-700' : 'bg-slate-100 text-slate-600'}\`}>
                      {p.role}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!token) {
    if (role === "CUSTOMER") {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
          <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 max-w-md w-full">
            <h2 className="text-2xl font-bold mb-6 text-center text-primary">Join Support Session</h2>
            <form onSubmit={joinAsCustomer}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 mb-1">Your Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-cta focus:border-cta outline-none transition-all"
                  placeholder="Enter your name"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={joining}
                className="w-full bg-cta hover:bg-sky-800 text-white py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                {joining ? "Joining..." : "Join Session"}
              </button>
            </form>
          </div>
        </div>
      );
    }
    return null;
  }

  return (
    <div className="h-screen flex flex-col bg-slate-900">
      <header className="bg-slate-800 text-white p-4 flex justify-between items-center border-b border-slate-700">
        <div className="font-semibold text-lg flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
          Active Support Session
        </div>
        <div className="flex gap-4">
          {role === "AGENT" && (
            <>
              <button
                onClick={copyInviteLink}
                className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded-lg transition-colors text-sm"
              >
                <Copy className="w-4 h-4" />
                {inviteCopied ? "Copied!" : "Copy Invite Link"}
              </button>
              <button
                onClick={endSession}
                className="flex items-center gap-2 bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg transition-colors text-sm font-medium"
              >
                <LogOut className="w-4 h-4" />
                End Session
              </button>
            </>
          )}
        </div>
      </header>

      <main className="flex-1 relative">
        <LiveKitRoom
          video={true}
          audio={true}
          token={token}
          serverUrl={process.env.NEXT_PUBLIC_LIVEKIT_URL || "ws://localhost:7880"}
          data-lk-theme="default"
          style={{ height: '100%' }}
        >
          <VideoConference />
          <RoomAudioRenderer />
          <ChatPersister sessionId={sessionId} participantId={participantId} />
        </LiveKitRoom>
      </main>
    </div>
  );
}
