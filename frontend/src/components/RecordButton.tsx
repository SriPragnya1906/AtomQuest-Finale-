'use client';
import { useState, useRef } from 'react';
import { Circle } from 'lucide-react';
import axios from 'axios';

const getApiUrl = () => {
  if (typeof window !== 'undefined') {
    return process.env.NEXT_PUBLIC_API_URL || `http://${window.location.hostname}:3001/api`;
  }
  return "http://localhost:3001/api";
};

export default function RecordButton({ sessionId, participantId }: { sessionId: string; participantId: string }) {
  const [isRecording, setIsRecording] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : MediaRecorder.isTypeSupported('video/webm') ? 'video/webm' : 'video/mp4';

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        setIsRecording(false);
        setIsUploading(true);
        stream.getTracks().forEach(track => track.stop());

        const blob = new Blob(chunksRef.current, { type: mimeType });
        const ext = mimeType.includes('webm') ? 'webm' : 'mp4';
        const formData = new FormData();
        formData.append('video', blob, `session-${sessionId}.${ext}`);
        formData.append('participantId', participantId);

        try {
          await axios.post(`${getApiUrl()}/sessions/${sessionId}/recording`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
          });
        } catch (error) {
          console.error('Upload failed', error);
          alert('Failed to upload recording.');
        } finally {
          setIsUploading(false);
        }
      };

      mediaRecorder.start(1000);
      setIsRecording(true);

      stream.getVideoTracks()[0].onended = () => {
        if (mediaRecorder.state !== 'inactive') mediaRecorder.stop();
      };
    } catch (error: any) {
      if (error.name === 'NotAllowedError') return;
      console.error('Error starting recording', error);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  if (isUploading) {
    return (
      <button disabled className="flex items-center gap-2 bg-slate-50 text-slate-500 px-3 py-2 rounded-lg text-xs font-medium border border-slate-200 cursor-not-allowed">
        <span className="w-3 h-3 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
        Saving...
      </button>
    );
  }

  return (
    <button
      onClick={isRecording ? stopRecording : startRecording}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all border ${
        isRecording
          ? 'bg-red-650 hover:bg-red-700 text-white border-red-500/50 shadow-sm'
          : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-250 shadow-sm'
      }`}
    >
      {isRecording ? (
        <>
          <Circle className="w-3 h-3 fill-white text-white animate-pulse" />
          Stop Rec
        </>
      ) : (
        <>
          <Circle className="w-3 h-3 fill-red-500 text-red-500" />
          Record
        </>
      )}
    </button>
  );
}
