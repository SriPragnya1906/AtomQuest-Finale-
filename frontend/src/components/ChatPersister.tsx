"use client";

import { useEffect, useRef } from "react";
import { useChat } from "@livekit/components-react";
import axios from "axios";

const getApiUrl = () => {
  return process.env.NEXT_PUBLIC_API_URL || (typeof window !== 'undefined' ? `http://${window.location.hostname}:3001/api` : "http://localhost:3001/api");
};

export function ChatPersister({ sessionId, participantId }: { sessionId: string, participantId: string }) {
  const { chatMessages } = useChat();
  const lastProcessedId = useRef<string | null>(null);

  useEffect(() => {
    if (!chatMessages || chatMessages.length === 0) return;

    // Get the latest message
    const latestMessage = chatMessages[chatMessages.length - 1];
    
    // Check if we already processed this message or if it's not from us
    if (latestMessage.id === lastProcessedId.current) return;
    if (!latestMessage.from?.isLocal) return;

    // It's a new message from this local user, let's persist it
    lastProcessedId.current = latestMessage.id;

    axios.post(`${getApiUrl()}/sessions/${sessionId}/messages`, {
      senderId: participantId,
      senderName: latestMessage.from.name || "Unknown",
      text: latestMessage.message,
    }).catch(err => console.error("Failed to persist chat message", err));

  }, [chatMessages, sessionId, participantId]);

  return null; // Invisible component
}
