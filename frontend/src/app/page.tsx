"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { 
  Plus, Video, Users, Clock, ChevronRight, Activity, 
  Cpu, MessageSquare, Paperclip, Loader2 
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const getApiUrl = () => {
  return process.env.NEXT_PUBLIC_API_URL || (typeof window !== 'undefined' ? `http://${window.location.hostname}:3001/api` : "http://localhost:3001/api");
};

type Session = {
  id: string;
  createdAt: string;
  isActive: boolean;
  participants: any[];
};

export default function Dashboard() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [metrics, setMetrics] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<"sessions" | "metrics">("sessions");
  const router = useRouter();

  useEffect(() => {
    fetchSessions();
  }, []);

  const fetchSessions = async () => {
    try {
      const res = await axios.get(`${getApiUrl()}/sessions`);
      setSessions(res.data.sessions);
    } catch (error) {
      console.error("Failed to fetch sessions", error);
    } finally {
      setFetching(false);
    }
  };

  const fetchMetrics = async () => {
    try {
      const res = await axios.get(`${getApiUrl()}/metrics`);
      setMetrics(res.data);
    } catch (error) {
      console.error("Failed to fetch metrics", error);
    }
  };

  useEffect(() => {
    if (activeTab === "metrics") {
      fetchMetrics();
      const interval = setInterval(fetchMetrics, 3000);
      return () => clearInterval(interval);
    }
  }, [activeTab]);

  const createSession = async () => {
    setLoading(true);
    try {
      const res = await axios.post(`${getApiUrl()}/sessions`, { agentName: "Agent" });
      const { session, token, participant } = res.data;
      sessionStorage.setItem(`lk_token_${session.id}`, token);
      sessionStorage.setItem(`lk_pid_${session.id}`, participant.id);
      router.push(`/session/${session.id}`);
    } catch (error) {
      console.error("Failed to create session", error);
      alert("Failed to create session. Is the backend running?");
    } finally {
      setLoading(false);
    }
  };

  const handleEndSession = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (window.confirm("End this session immediately?")) {
      try {
        await axios.post(`${getApiUrl()}/sessions/${id}/end`, {}, {
          headers: { 'x-admin-request': 'true' }
        });
        fetchSessions();
        if (activeTab === "metrics") fetchMetrics();
      } catch (err) {
        console.error("Failed to end session", err);
        alert("Failed to end session");
      }
    }
  };

  const activeSessions = sessions.filter(s => s.isActive);
  const endedSessions = sessions.filter(s => !s.isActive);

  const formatUptime = (seconds: number) => {
    if (!seconds) return "0s";
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${hrs > 0 ? `${hrs}h ` : ''}${mins > 0 || hrs > 0 ? `${mins}m ` : ''}${secs}s`;
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-5xl mx-auto px-6 py-6 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-gradient-to-br from-sky-500 to-blue-600 rounded-xl flex items-center justify-center">
              <Video className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">AtomQuest Support</h1>
              <p className="text-slate-500 text-sm">Real-time video assistance platform</p>
            </div>
          </div>
          <button
            onClick={createSession}
            disabled={loading}
            className="bg-sky-600 hover:bg-sky-700 text-white px-5 py-2.5 rounded-xl font-medium transition-all flex items-center gap-2 disabled:opacity-50 text-sm shadow-lg shadow-sky-600/20"
          >
            {loading ? "Creating..." : <><Plus className="w-4 h-4" /> New Session</>}
          </button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
              <Activity className="w-4 h-4 text-emerald-500" />
              <span className="text-slate-400 text-xs font-medium uppercase tracking-wider">Active Now</span>
            </div>
            <p className="text-2xl font-bold text-emerald-500">{activeSessions.length}</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
              <Clock className="w-4 h-4 text-sky-500" />
              <span className="text-slate-400 text-xs font-medium uppercase tracking-wider">Total Sessions</span>
            </div>
            <p className="text-2xl font-bold">{sessions.length}</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
              <Users className="w-4 h-4 text-violet-500" />
              <span className="text-slate-400 text-xs font-medium uppercase tracking-wider">Participants</span>
            </div>
            <p className="text-2xl font-bold">{sessions.reduce((acc, s) => acc + (s.participants?.length || 0), 0)}</p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200 mb-6 px-1">
          <button
            onClick={() => setActiveTab("sessions")}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-all ${
              activeTab === "sessions"
                ? 'border-sky-500 text-sky-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Sessions Dashboard
          </button>
          <button
            onClick={() => setActiveTab("metrics")}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-all ${
              activeTab === "metrics"
                ? 'border-sky-500 text-sky-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            System Health & Metrics
          </button>
        </div>

        {/* Tab content */}
        {activeTab === "sessions" ? (
          fetching ? (
            <div className="flex justify-center py-20">
              <div className="w-8 h-8 border-3 border-sky-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : sessions.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center shadow-sm">
              <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
                <Users className="w-8 h-8 text-slate-400" />
              </div>
              <h2 className="text-lg font-semibold mb-2">No Sessions Yet</h2>
              <p className="text-slate-500 max-w-md mx-auto text-sm mb-6">
                Create a new session to generate an invite link for your customer. They can join directly from their browser.
              </p>
              <button onClick={createSession} disabled={loading} className="text-sky-600 hover:text-sky-700 font-medium text-sm">
                Create your first session →
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Active Sessions */}
              {activeSessions.length > 0 && (
                <div>
                  <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 px-1">
                    Active Sessions
                  </h2>
                  <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
                    <ul className="divide-y divide-slate-100">
                      {activeSessions.map(session => (
                        <SessionRow 
                          key={session.id} 
                          session={session} 
                          onEndSession={(e) => handleEndSession(e, session.id)} 
                        />
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {/* Ended Sessions */}
              {endedSessions.length > 0 && (
                <div>
                  <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 px-1">
                    Past Sessions
                  </h2>
                  <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
                    <ul className="divide-y divide-slate-100">
                      {endedSessions.map(session => (
                        <SessionRow key={session.id} session={session} />
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          )
        ) : (
          metrics ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div className="bg-white rounded-2xl border border-slate-100 p-5 flex items-center gap-4 shadow-sm">
                <div className="p-3 bg-emerald-500/10 rounded-xl text-emerald-500">
                  <Activity className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-slate-500 text-xs font-medium uppercase tracking-wider">Active Rooms</p>
                  <p className="text-xl font-bold text-emerald-500 mt-1">{metrics.activeSessions}</p>
                </div>
              </div>
              
              <div className="bg-white rounded-2xl border border-slate-100 p-5 flex items-center gap-4 shadow-sm">
                <div className="p-3 bg-sky-500/10 rounded-xl text-sky-500">
                  <Users className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-slate-500 text-xs font-medium uppercase tracking-wider">Connected Users</p>
                  <p className="text-xl font-bold text-sky-500 mt-1">{metrics.activeParticipants}</p>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-100 p-5 flex items-center gap-4 shadow-sm">
                <div className="p-3 bg-violet-500/10 rounded-xl text-violet-500">
                  <MessageSquare className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-slate-500 text-xs font-medium uppercase tracking-wider">Messages Sent</p>
                  <p className="text-xl font-bold text-violet-500 mt-1">{metrics.totalMessages}</p>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-100 p-5 flex items-center gap-4 shadow-sm">
                <div className="p-3 bg-amber-500/10 rounded-xl text-amber-500">
                  <Paperclip className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-slate-500 text-xs font-medium uppercase tracking-wider">Files Shared</p>
                  <p className="text-xl font-bold text-amber-500 mt-1">{metrics.totalFiles}</p>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-100 p-5 flex items-center gap-4 shadow-sm">
                <div className="p-3 bg-rose-500/10 rounded-xl text-rose-500">
                  <Clock className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-slate-500 text-xs font-medium uppercase tracking-wider">System Uptime</p>
                  <p className="text-xl font-bold text-rose-500 mt-1">{formatUptime(metrics.uptime)}</p>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-100 p-5 flex items-center gap-4 shadow-sm">
                <div className="p-3 bg-cyan-500/10 rounded-xl text-cyan-500">
                  <Cpu className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-slate-500 text-xs font-medium uppercase tracking-wider">Memory Usage</p>
                  <p className="text-xl font-bold text-cyan-500 mt-1">
                    {metrics.memoryUsage ? `${Math.round(metrics.memoryUsage.rss / 1024 / 1024)} MB` : "N/A"}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex justify-center py-20">
              <Loader2 className="w-8 h-8 text-sky-500 animate-spin" />
            </div>
          )
        )}
      </div>
    </div>
  );
}

function SessionRow({ session, onEndSession }: { session: Session, onEndSession?: (e: React.MouseEvent) => void }) {
  const router = useRouter();

  // Get active participant names
  const activeParticipants = session.participants?.filter((p: any) => !p.leftAt) || [];
  const participantNames = activeParticipants.map((p: any) => p.name).join(", ");

  return (
    <li
      className="px-5 py-4 hover:bg-slate-50 transition-colors cursor-pointer flex items-center justify-between group"
      onClick={() => router.push(`/session/${session.id}`)}
    >
      <div className="flex items-center gap-4 min-w-0">
        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${session.isActive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
        <div className="min-w-0">
          <h3 className="font-semibold text-sm text-slate-800 flex items-center gap-2">
            Session {session.id.split('-')[0]}
            {session.isActive && (
              <span className="bg-emerald-500/15 text-emerald-600 text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider">
                Live
              </span>
            )}
          </h3>
          <p className="text-slate-500 text-xs mt-0.5 flex items-center gap-3">
            <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {formatDistanceToNow(new Date(session.createdAt))} ago</span>
            <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {session.participants?.length || 0}</span>
            {session.isActive && participantNames && (
              <span className="truncate text-slate-500 font-medium">Inside: {participantNames}</span>
            )}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {session.isActive && onEndSession && (
          <button
            onClick={onEndSession}
            className="opacity-0 group-hover:opacity-100 bg-red-600/10 hover:bg-red-600 border border-red-500/10 hover:border-red-500 text-red-500 hover:text-white px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all"
          >
            End Call
          </button>
        )}
        <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600 transition-colors" />
      </div>
    </li>
  );
}
