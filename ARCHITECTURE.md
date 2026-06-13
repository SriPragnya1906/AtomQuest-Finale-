# AtomQuest Architecture

## High-Level System Overview
The system relies on a typical WebRTC + SFU (Selective Forwarding Unit) pattern facilitated by LiveKit. Our custom backend orchestrates the session state and issues access tokens. The Next.js frontend acts as the user interface for both support agents and customers.

### 1. Frontend (Next.js)
- **Role**: Provides the UI for creating sessions, viewing active/ended sessions, and participating in the video call.
- **Key Libraries**: `@livekit/components-react` (for pre-built, resilient video components and chat data channel hooks), `axios` (for backend REST requests), `tailwindcss` (for styling).
- **Communication**: 
  - REST calls to Backend for session creation, joining, and ending.
  - WebSocket/WebRTC connection to LiveKit Server for media and data channels (chat).

### 2. Backend (Node.js + Express)
- **Role**: Acts as the signaling and management authority. It securely generates JWT tokens for LiveKit access using the `livekit-server-sdk`.
- **Database**: SQLite via Prisma ORM for persisting sessions, participants, and chat logs.
- **Key Endpoints**:
  - `POST /api/sessions` - Creates a session.
  - `POST /api/sessions/:id/join` - Validates a session and generates a LiveKit token for the customer.
  - `POST /api/sessions/:id/end` - Marks the session as inactive.
  - `POST /api/sessions/:id/messages` - Persists messages sent over LiveKit data channels to the SQLite DB.

### 3. Media Server (LiveKit SFU)
- **Role**: Handles media routing (audio/video packets) securely via WebRTC.
- **Chat**: Handles low-latency messaging via WebRTC data channels.
- **Architecture**: A decentralized SFU approach meaning participants send their media once to the server, and the server selectively forwards it to other participants.

## Data Flow Diagram (Session Join)

1. Agent clicks "New Session" -> POST \`/api/sessions\` -> Backend creates DB record & returns LiveKit JWT.
2. Frontend connects to LiveKit Server using the JWT.
3. Agent shares URL with Customer.
4. Customer enters Name -> POST \`/api/sessions/:id/join\` -> Backend returns LiveKit JWT.
5. Customer connects to LiveKit Server. Audio, video, and chat flow securely between Agent and Customer via the LiveKit SFU.
6. Chat messages are intercepted on the sender's client and sent via POST \`/api/sessions/:id/messages\` to be persisted in SQLite for future retrieval.
