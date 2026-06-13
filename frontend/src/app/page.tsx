"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { Plus, Video, Users, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const API_URL = "http://localhost:3001/api";

type Session = {
  id: string;
  createdAt: string;
  isActive: boolean;
  participants: any[];
};

export default function Dashboard() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetchSessions();
  }, []);

  const fetchSessions = async () => {
    try {
      const res = await axios.get(\`\${API_URL}/sessions\`);
      setSessions(res.data.sessions);
    } catch (error) {
      console.error("Failed to fetch sessions", error);
    }
  };

  const createSession = async () => {
    setLoading(true);
    try {
      const res = await axios.post(\`\${API_URL}/sessions\`, { agentName: "Agent" });
      const { session, token, participant } = res.data;
      // Store token in session storage to use in the call
      sessionStorage.setItem(\`lk_token_\${session.id}\`, token);
      sessionStorage.setItem(\`lk_pid_\${session.id}\`, participant.id);
      router.push(\`/session/\${session.id}\`);
    } catch (error) {
      console.error("Failed to create session", error);
      alert("Failed to create session. Is the backend running?");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-6 md:p-12">
      <header className="flex justify-between items-center mb-12">
        <div>
          <h1 className="text-3xl font-bold text-primary flex items-center gap-3">
            <Video className="w-8 h-8 text-cta" />
            AtomQuest Support
          </h1>
          <p className="text-secondary mt-2">Real-time video assistance platform</p>
        </div>
        <button
          onClick={createSession}
          disabled={loading}
          className="bg-cta hover:bg-sky-800 text-white px-6 py-3 rounded-lg font-medium shadow-sm transition-colors flex items-center gap-2 disabled:opacity-50"
        >
          {loading ? "Creating..." : <><Plus className="w-5 h-5" /> New Session</>}
        </button>
      </header>

      <main>
        {sessions.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center">
            <div className="bg-slate-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <Users className="w-8 h-8 text-slate-400" />
            </div>
            <h2 className="text-xl font-semibold mb-2">No Active Sessions</h2>
            <p className="text-slate-500 max-w-md mx-auto">
              Create a new session to generate an invite link for your customer. They can join directly from their browser.
            </p>
            <button
              onClick={createSession}
              disabled={loading}
              className="mt-6 text-cta hover:text-sky-800 font-medium cursor-pointer"
            >
              Create your first session &rarr;
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <ul className="divide-y divide-slate-200">
              {sessions.map(session => (
                <li key={session.id} className="p-6 hover:bg-slate-50 transition-colors flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-lg text-primary flex items-center gap-2">
                      Session {session.id.split('-')[0]}
                      {session.isActive ? (
                        <span className="bg-green-100 text-green-700 text-xs px-2 py-1 rounded-full font-semibold">Active</span>
                      ) : (
                        <span className="bg-slate-100 text-slate-600 text-xs px-2 py-1 rounded-full font-semibold">Ended</span>
                      )}
                    </h3>
                    <p className="text-slate-500 text-sm mt-1 flex items-center gap-4">
                      <span className="flex items-center gap-1"><Clock className="w-4 h-4" /> {formatDistanceToNow(new Date(session.createdAt))} ago</span>
                      <span className="flex items-center gap-1"><Users className="w-4 h-4" /> {session.participants?.length || 0} participants</span>
                    </p>
                  </div>
                  <button
                    onClick={() => router.push(\`/session/\${session.id}\`)}
                    className="text-cta hover:bg-sky-50 px-4 py-2 rounded-lg font-medium transition-colors"
                  >
                    {session.isActive ? "Join Call" : "View Details"}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </main>
    </div>
  );
}
