import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import { AccessToken } from 'livekit-server-sdk';
import 'dotenv/config';

const app = express();
const prisma = new PrismaClient();
const port = process.env.PORT || 3001;

// LiveKit configuration
const LIVEKIT_URL = process.env.LIVEKIT_URL || 'ws://localhost:7880';
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || 'devkey';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || 'secret';

app.use(cors());
app.use(express.json());

// Helper to generate LiveKit Token
function createToken(roomName: string, participantName: string, identity: string, role: string) {
  const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity: identity,
    name: participantName,
  });
  
  at.addGrant({ 
    roomJoin: true, 
    room: roomName,
    canPublish: true,
    canSubscribe: true,
  });

  return at.toJwt();
}

// Create a new session (Agent only)
app.post('/api/sessions', async (req, res) => {
  try {
    const session = await prisma.session.create({
      data: { isActive: true },
    });
    
    // Add the agent
    const agentName = req.body.agentName || 'Agent';
    const participant = await prisma.participant.create({
      data: {
        sessionId: session.id,
        role: 'AGENT',
        name: agentName,
      }
    });

    const token = createToken(session.id, agentName, participant.id, 'AGENT');
    
    res.json({ session, participant, token });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create session' });
  }
});

// Join a session
app.post('/api/sessions/:id/join', async (req, res) => {
  try {
    const { id } = req.params;
    const { role = 'CUSTOMER', name = 'Customer' } = req.body;

    const session = await prisma.session.findUnique({ where: { id } });
    if (!session || !session.isActive) {
      return res.status(404).json({ error: 'Session not found or inactive' });
    }

    const participant = await prisma.participant.create({
      data: {
        sessionId: id,
        role,
        name,
      }
    });

    const token = createToken(id, name, participant.id, role);
    
    res.json({ session, participant, token });
  } catch (error) {
    res.status(500).json({ error: 'Failed to join session' });
  }
});

// End a session
app.post('/api/sessions/:id/end', async (req, res) => {
  try {
    const { id } = req.params;
    
    const session = await prisma.session.update({
      where: { id },
      data: { isActive: false },
    });
    
    res.json({ session });
  } catch (error) {
    res.status(500).json({ error: 'Failed to end session' });
  }
});

// Get all sessions
app.get('/api/sessions', async (req, res) => {
  try {
    const sessions = await prisma.session.findMany({
      orderBy: { createdAt: 'desc' },
      include: { participants: true },
    });
    res.json({ sessions });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get sessions' });
  }
});

// Get session details
app.get('/api/sessions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const session = await prisma.session.findUnique({
      where: { id },
      include: { participants: true, messages: true }
    });
    
    if (!session) return res.status(404).json({ error: 'Not found' });
    
    res.json({ session });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get session' });
  }
});

// Save chat message
app.post('/api/sessions/:id/messages', async (req, res) => {
  try {
    const { id } = req.params;
    const { senderId, senderName, text } = req.body;

    const message = await prisma.chatMessage.create({
      data: {
        sessionId: id,
        senderId,
        senderName,
        text,
      }
    });
    
    res.json({ message });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save message' });
  }
});

// Get chat messages
app.get('/api/sessions/:id/messages', async (req, res) => {
  try {
    const { id } = req.params;
    const messages = await prisma.chatMessage.findMany({
      where: { sessionId: id },
      orderBy: { timestamp: 'asc' }
    });
    
    res.json({ messages });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get messages' });
  }
});

app.listen(port, () => {
  console.log(\`Backend running at http://localhost:\${port}\`);
});
