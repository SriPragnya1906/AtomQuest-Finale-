# AtomQuest Support Platform

A secure, real-time video and chat support platform built for AtomQuest. 

## Features
- **Real-Time Video**: Low-latency video via WebRTC using LiveKit.
- **Real-Time Chat**: Persistent chat history tied to each session.
- **Secure Sessions**: Generate unique, secure invite links for customers.
- **Role Enforcement**: Agents can end sessions, customers cannot.
- **Session History**: View chat logs and participant details of past sessions.

## Tech Stack
- **Frontend**: Next.js 15, Tailwind CSS, LiveKit Components React
- **Backend**: Node.js, Express, Prisma ORM (SQLite)
- **Media Server**: LiveKit (local binary)

## Setup Instructions

### 1. Start the LiveKit Server
Run the LiveKit server in development mode.
\`\`\`bash
cd livekit
./livekit-server.exe --dev
\`\`\`

### 2. Start the Backend
Open a new terminal.
\`\`\`bash
cd backend
npm install
npm run dev
\`\`\`
The backend runs on \`http://localhost:3001\`.

### 3. Start the Frontend
Open another terminal.
\`\`\`bash
cd frontend
npm install
npm run dev
\`\`\`
The frontend runs on \`http://localhost:3000\`. Open this in your browser.

## Documentation
See [ARCHITECTURE.md](ARCHITECTURE.md) for a detailed breakdown of the system components and data flow.
