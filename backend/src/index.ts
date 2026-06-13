import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import { AccessToken, WebhookReceiver } from 'livekit-server-sdk';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import 'dotenv/config';

// Ensure uploads dir exists
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-z0-9.\-_]/gi, '_');
    cb(null, `${Date.now()}-${safeName}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB max
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('video/') || file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('Only video/audio files are allowed'));
    }
  }
});

const chatUpload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
  fileFilter: (_req, file, cb) => {
    const allowedMimes = [
      'application/pdf',
      'text/plain',
      'application/zip',
      'application/x-zip-compressed',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    ];
    if (
      file.mimetype.startsWith('image/') ||
      file.mimetype.startsWith('video/') ||
      file.mimetype.startsWith('audio/') ||
      file.mimetype.startsWith('text/') ||
      allowedMimes.includes(file.mimetype)
    ) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type for sharing'));
    }
  }
});

const app = express();
const prisma = new PrismaClient({
  log: ['error', 'warn']
});
const port = process.env.PORT || 3001;

// LiveKit configuration
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || 'devkey';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || 'secret';
const webhookReceiver = new WebhookReceiver(LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

// CORS - allow frontend origins
app.use(cors({
  origin: true,
  credentials: true,
}));

// LiveKit webhook endpoint - MUST be before express.json()
app.post('/api/webhooks/livekit', express.raw({ type: '*/*' }), async (req: any, res: any) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header missing' });
    }

    // Decode and verify the webhook
    const event = await webhookReceiver.receive(req.body, authHeader);
    const sessionId = event.room?.name;
    if (!sessionId) {
      return res.json({ status: 'ignored' });
    }

    // Verify session exists in db
    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    if (!session) {
      return res.json({ status: 'ignored_session_not_found' });
    }

    const participantName = event.participant?.name || event.participant?.identity || 'Someone';
    const participantId = event.participant?.identity || 'unknown';

    console.log(`LiveKit Webhook: ${event.event} for session ${sessionId}, participant ${participantName}`);

    if (event.event === 'participant_joined') {
      // Create Event Log
      await prisma.eventLog.create({
        data: {
          sessionId,
          type: 'JOIN',
          message: `${participantName} joined the session`,
        }
      });

      // Update participant leftAt status
      await prisma.participant.updateMany({
        where: { sessionId, id: participantId },
        data: { leftAt: null, joinedAt: new Date() },
      });
    } else if (event.event === 'participant_left') {
      // Create Event Log
      await prisma.eventLog.create({
        data: {
          sessionId,
          type: 'LEAVE',
          message: `${participantName} left the session`,
        }
      });

      // Update participant leftAt status
      await prisma.participant.updateMany({
        where: { sessionId, id: participantId },
        data: { leftAt: new Date() },
      });
    }

    res.json({ status: 'ok' });
  } catch (error: any) {
    console.error('Webhook verification error:', error);
    res.status(400).send('Invalid webhook signature');
  }
});

app.use(express.json());
app.use('/uploads', express.static(uploadsDir));

// Helper to generate LiveKit Token
async function createToken(roomName: string, participantName: string, identity: string) {
  const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity: identity,
    name: participantName,
    ttl: '6h',
  });
  
  at.addGrant({ 
    roomJoin: true, 
    room: roomName,
    canPublish: true,
    canSubscribe: true,
  });

  return await at.toJwt();
}

// =============================================
// SESSION MANAGEMENT
// =============================================

// Create a new session (Agent only)
app.post('/api/sessions', async (req, res) => {
  try {
    const agentName = (req.body.agentName || 'Agent').trim();
    if (!agentName) {
      return res.status(400).json({ error: 'Agent name is required' });
    }

    const session = await prisma.session.create({
      data: { isActive: true },
    });
    
    const participant = await prisma.participant.create({
      data: {
        sessionId: session.id,
        role: 'AGENT',
        name: agentName,
      }
    });

    const token = await createToken(session.id, agentName, participant.id);
    
    res.json({ session, participant, token });
  } catch (error) {
    console.error('Create session error:', error);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

// Join a session (Customer only via invite link)
app.post('/api/sessions/:id/join', async (req, res) => {
  try {
    const id = req.params.id as string;
    const { name = 'Customer' } = req.body;
    const trimmedName = (name || 'Customer').trim();

    if (!trimmedName) {
      return res.status(400).json({ error: 'Name is required' });
    }

    // Validate session exists and is active
    const session = await prisma.session.findUnique({ where: { id } });
    if (!session) {
      return res.status(404).json({ error: 'Session not found. Please check your invite link.' });
    }
    if (!session.isActive) {
      return res.status(410).json({ error: 'This session has already ended.' });
    }

    // Check for duplicate joins (prevent same name joining twice)
    const existingCustomer = await prisma.participant.findFirst({
      where: {
        sessionId: id,
        name: trimmedName,
        role: 'CUSTOMER',
        leftAt: null,
      }
    });

    if (existingCustomer) {
      // Re-issue token for reconnection (handles page refresh gracefully)
      const token = await createToken(id, trimmedName, existingCustomer.id);
      return res.json({ session, participant: existingCustomer, token });
    }

    // Force role to CUSTOMER — a customer endpoint must never create an AGENT
    const participant = await prisma.participant.create({
      data: {
        sessionId: id,
        role: 'CUSTOMER',
        name: trimmedName,
      }
    });

    const token = await createToken(id, trimmedName, participant.id);
    
    res.json({ session, participant, token });
  } catch (error) {
    console.error('Join session error:', error);
    res.status(500).json({ error: 'Failed to join session' });
  }
});

// Endpoint for judging bypass to join as AGENT from the invite link
app.post('/api/sessions/:id/agent-join', async (req: any, res: any) => {
  try {
    const id = req.params.id as string;
    const name = (req.body.name || 'Agent').trim();
    
    const session = await prisma.session.findUnique({ where: { id } });
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    if (!session.isActive) {
      return res.status(410).json({ error: 'This session has already ended.' });
    }

    const participant = await prisma.participant.create({
      data: {
        sessionId: id,
        role: 'AGENT',
        name: name,
      }
    });

    const token = await createToken(id, name, participant.id);
    res.json({ session, participant, token });
  } catch (error) {
    console.error('Agent join error:', error);
    res.status(500).json({ error: 'Failed to join as agent' });
  }
});

// End a session (Agent or Admin Dashboard only)
app.post('/api/sessions/:id/end', async (req: any, res: any) => {
  try {
    const id = req.params.id as string;
    const participantId = req.headers['x-participant-id'] as string;
    const isAdmin = req.headers['x-admin-request'] === 'true';

    // Verify access
    if (!isAdmin) {
      if (!participantId) {
        return res.status(401).json({ error: 'Participant identification required' });
      }
      
      const participant = await prisma.participant.findFirst({
        where: { id: participantId, sessionId: id }
      });

      if (!participant || participant.role !== 'AGENT') {
        return res.status(403).json({ error: 'Access denied. Only support agents can end call sessions.' });
      }
    }
    
    const existingSession = await prisma.session.findUnique({ where: { id } });
    if (!existingSession) {
      return res.status(404).json({ error: 'Session not found' });
    }
    if (!existingSession.isActive) {
      return res.status(400).json({ error: 'Session is already ended' });
    }

    // Mark all active participants as left
    await prisma.participant.updateMany({
      where: { sessionId: id, leftAt: null },
      data: { leftAt: new Date() },
    });

    const session = await prisma.session.update({
      where: { id },
      data: { isActive: false },
    });
    
    // Log the end call event
    await prisma.eventLog.create({
      data: {
        sessionId: id,
        type: 'END_SESSION',
        message: isAdmin ? 'Session ended by Ops Dashboard' : 'Session ended by Support Agent',
      }
    });

    res.json({ session });
  } catch (error) {
    console.error('End session error:', error);
    res.status(500).json({ error: 'Failed to end session' });
  }
});

// =============================================
// SESSION QUERIES
// =============================================

// Get all sessions (dashboard)
app.get('/api/sessions', async (_req, res) => {
  try {
    const sessions = await prisma.session.findMany({
      orderBy: { createdAt: 'desc' },
      include: { participants: true },
    });
    res.json({ sessions });
  } catch (error) {
    console.error('List sessions error:', error);
    res.status(500).json({ error: 'Failed to get sessions' });
  }
});

// Get session details (includes messages + participants)
app.get('/api/sessions/:id', async (req, res) => {
  try {
    const id = req.params.id as string;
    const session = await prisma.session.findUnique({
      where: { id },
      include: {
        participants: { orderBy: { joinedAt: 'asc' } },
        messages: { orderBy: { timestamp: 'asc' } },
        eventLogs: { orderBy: { timestamp: 'asc' } },
        chatFiles: { orderBy: { uploadedAt: 'asc' } }
      }
    });
    
    if (!session) return res.status(404).json({ error: 'Session not found' });
    
    res.json({ session });
  } catch (error) {
    console.error('Get session error:', error);
    res.status(500).json({ error: 'Failed to get session' });
  }
});

// =============================================
// IN-CALL CHAT
// =============================================

// Save chat message
app.post('/api/sessions/:id/messages', async (req, res) => {
  try {
    const id = req.params.id as string;
    const { senderId, senderName, text } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Message text is required' });
    }

    // Verify session exists
    const session = await prisma.session.findUnique({ where: { id } });
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const message = await prisma.chatMessage.create({
      data: {
        sessionId: id,
        senderId: senderId || 'unknown',
        senderName: senderName || 'Unknown',
        text: text.trim(),
      }
    });
    
    res.json({ message });
  } catch (error) {
    console.error('Save message error:', error);
    res.status(500).json({ error: 'Failed to save message' });
  }
});

// Get chat messages for a session
app.get('/api/sessions/:id/messages', async (req, res) => {
  try {
    const id = req.params.id as string;
    const messages = await prisma.chatMessage.findMany({
      where: { sessionId: id },
      orderBy: { timestamp: 'asc' }
    });
    
    res.json({ messages });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Failed to get messages' });
  }
});

// =============================================
// RECORDING
// =============================================

// Upload Recording (Agent only)
app.post('/api/sessions/:id/recording', upload.single('video'), async (req: any, res: any) => {
  const id = req.params.id as string;
  try {
    const participantId = req.body.participantId;
    
    if (!participantId) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(401).json({ error: 'Participant identification required' });
    }

    // Verify participant is an AGENT of this session
    const participant = await prisma.participant.findFirst({
      where: { id: participantId, sessionId: id }
    });

    if (!participant || participant.role !== 'AGENT') {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(403).json({ error: 'Access denied. Only support agents can save call recordings.' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No video file provided' });
    }

    // Build a URL relative to the request's host (works on LAN & localhost)
    const host = req.headers.host || `localhost:${port}`;
    const protocol = req.secure ? 'https' : 'http';
    const recordingUrl = `${protocol}://${host}/uploads/${req.file.filename}`;

    const session = await prisma.session.update({
      where: { id },
      data: { recordingUrl },
    });
    
    // Log recording action
    await prisma.eventLog.create({
      data: {
        sessionId: id,
        type: 'RECORDING_STOP',
        message: `Call recording saved by Agent (${participant.name || 'Agent'})`,
      }
    });
    
    res.json({ session, recordingUrl });
  } catch (error) {
    console.error('Upload recording error:', error);
    if (req.file && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch {}
    }
    res.status(500).json({ error: 'Failed to upload recording' });
  }
});

// =============================================
// CHAT FILE UPLOAD
// =============================================
app.post('/api/sessions/:id/chat-files', chatUpload.single('file'), async (req, res) => {
  try {
    const id = req.params.id as string;
    const senderId = (req.body.senderId || 'unknown').trim();
    const senderName = (req.body.senderName || 'Unknown').trim();
    
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const session = await prisma.session.findUnique({ where: { id } });
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const host = req.headers.host || `localhost:${port}`;
    const protocol = req.secure ? 'https' : 'http';
    const url = `${protocol}://${host}/uploads/${req.file.filename}`;

    const chatFile = await prisma.chatFile.create({
      data: {
        sessionId: id,
        name: req.file.originalname,
        url,
        size: req.file.size,
        mimeType: req.file.mimetype,
        senderId,
        senderName,
      }
    });

    res.json({ chatFile });
  } catch (error: any) {
    console.error('Upload chat file error:', error);
    res.status(500).json({ error: error.message || 'Failed to upload file' });
  }
});

// =============================================
// METRICS & OBSERVABILITY
// =============================================
app.get('/api/metrics', async (_req, res) => {
  try {
    const activeSessionsCount = await prisma.session.count({ where: { isActive: true } });
    const totalSessionsCount = await prisma.session.count();
    const activeParticipantsCount = await prisma.participant.count({
      where: { leftAt: null, session: { isActive: true } }
    });
    const totalParticipantsCount = await prisma.participant.count();
    const totalMessagesCount = await prisma.chatMessage.count();
    const totalFilesCount = await prisma.chatFile.count();

    res.json({
      activeSessions: activeSessionsCount,
      totalSessions: totalSessionsCount,
      activeParticipants: activeParticipantsCount,
      totalParticipants: totalParticipantsCount,
      totalMessages: totalMessagesCount,
      totalFiles: totalFilesCount,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
    });
  } catch (error) {
    console.error('Failed to get metrics:', error);
    res.status(500).json({ error: 'Failed to get metrics' });
  }
});

// =============================================
// HEALTH CHECK
// =============================================
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// =============================================
// START SERVER
// =============================================
app.listen(port, () => {
  console.log(`Backend running at http://localhost:${port}`);
  console.log(`LiveKit API Key: ${LIVEKIT_API_KEY}`);
});
