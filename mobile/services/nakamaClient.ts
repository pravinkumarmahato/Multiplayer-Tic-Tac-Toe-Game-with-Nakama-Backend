import { Client, Session, Socket, MatchmakerMatched } from "@heroiclabs/nakama-js";
import AsyncStorage from "@react-native-async-storage/async-storage";

let useSSL: boolean;

if (process.env.EXPO_PUBLIC_NAKAMA_SSL && process.env.EXPO_PUBLIC_NAKAMA_SSL === "true") {
  useSSL = true;
} else {
  useSSL = false;
}

const host = process.env.EXPO_PUBLIC_NAKAMA_HOST ?? "127.0.0.1";
const port = process.env.EXPO_PUBLIC_NAKAMA_PORT ?? "7350";
const serverKey = process.env.EXPO_PUBLIC_NAKAMA_SERVER_KEY ?? "defaultkey";
const client = new Client(serverKey, host, port, useSSL);

// IMPORTANT: This must match the registered match module name in the backend (main.ts)
const MATCH_MODULE_NAME = "tic-tac-toe_js";

let session: Session | null = null;
let socket: Socket | null = null;
let currentMatchId: string | null = null;
let currentTicket: string | null = null;
// Keep last known players mapping so UPDATE/DONE messages (which don't include marks)
// can still present player info to the UI.
let lastPlayers: Record<string, any> = {};
let lastBoard: string[] = []; // Keep last known board state
let pendingMatchToken: string | null = null;

function resetMatchTracking() {
  currentMatchId = null;
  currentTicket = null;
  lastPlayers = {};
  lastBoard = [];
}

// Restore or create session (idempotent)
export async function ensureSession(): Promise<Session> {
  if (session) return session;

  const token = await AsyncStorage.getItem("nakama_session");
  const refresh = await AsyncStorage.getItem("nakama_refresh");
  if (token && refresh) {
    try {
      const restored = Session.restore(token, refresh);
      if (!restored.isexpired(Date.now() / 1000)) {
        session = restored;
        console.log("Reused restored session:", session.user_id);
        return session;
      }
    } catch (err) {
      console.warn("Restore failed:", err);
    }
  }

  // fallback: use stored username or generate a custom id
  const username = (await AsyncStorage.getItem("username")) || `Player_${Math.floor(Math.random() * 10000)}`;

  session = await client.authenticateCustom(username, true);
  console.log("Created new session:", session.user_id);

  // persist both tokens for next time
  await AsyncStorage.setItem("nakama_session", session.token);
  await AsyncStorage.setItem("nakama_refresh", session.refresh_token);

  return session;
}

// Connect socket (will ensure session if needed)
export async function connectSocket(): Promise<Socket> {
  if (!session) {
    await ensureSession();
  }
  if (!session) throw new Error("Unable to create/restore session");

  if (socket) {
    // already connected? attempt a quick reconnect check
    try {
      // no explicit 'isConnected' method; relying on existing socket is okay for now
      return socket;
    } catch (err) {
      console.warn("Reusing existing socket failed, recreating:", err);
      socket = null;
    }
  }

  socket = client.createSocket(useSSL, false);
  await socket.connect(session!, true);
  console.log("✅ Socket connected to Nakama.");
  return socket;
}

export async function joinOrCreateMatch(matchName = "tictactoe") {
  if (!socket) throw new Error("Socket not connected.");

  // If we've already been matched, try to re-join
  if (currentMatchId) {
    try {
      console.log("🔁 Reusing existing match id:", currentMatchId);
      const match = await socket.joinMatch(currentMatchId);
      console.log("🎮 Joined existing match:", match.match_id);
      return match;
    } catch (err) {
      console.warn("⚠️ Failed to join existing match id, will attempt to create new match:", err);
      currentMatchId = null;
    }
  }

  // Create a server-authoritative match by using the registered module name
  console.log("🎮 Creating server match module:", MATCH_MODULE_NAME);
  const match = await socket.createMatch(MATCH_MODULE_NAME);
  currentMatchId = match.match_id;
  console.log("🎮 Created match:", currentMatchId);

  return match;
}

export async function sendMove(index: number) {
  if (!socket || !currentMatchId) throw new Error("Socket or match not ready.");
  // Server expects opcode MOVE = 4 and the payload { position: BoardPosition }
  const opCode = 4; // MOVE
  const data = JSON.stringify({ position: index });
  await socket.sendMatchState(currentMatchId, opCode, data);
  console.log("➡️ Sent move (position):", data);
}

export function subscribeToMatchUpdates(onUpdate: (message: any) => void) {
  if (!socket) throw new Error("Socket not connected.");
  console.log("📌 Registering match-data handler (subscribeToMatchUpdates)");
  const handler = (matchData: any) => {
    // quick runtime indicator that handler executed
    console.log("📡 onmatchdata handler invoked");
    try {
      console.log("📡 Received opCode:", matchData.op_code);

      // matchData.data may be Uint8Array or string
      let decoded = "";
      const raw = matchData.data as any;
      // Helper to decode ArrayBuffer/Uint8Array/string in multiple JS runtimes (browser, RN, Node)
      const decode = (d: any) => {
        if (!d && d !== "") return "";
        // Already a string
        if (typeof d === "string") return d;
        // Uint8Array
        if (typeof Uint8Array !== 'undefined' && d instanceof Uint8Array) {
          if (typeof TextDecoder !== 'undefined') return new TextDecoder().decode(d);
          // Fallback: construct string from bytes
          let s = "";
          for (let i = 0; i < d.length; i++) s += String.fromCharCode(d[i]);
          return s;
        }
        // ArrayBuffer
        if (d && typeof d === 'object' && typeof d.byteLength === 'number') {
          const u = new Uint8Array(d);
          if (typeof TextDecoder !== 'undefined') return new TextDecoder().decode(u);
          let s = "";
          for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
          return s;
        }
        // Unknown: coerce to string
        return String(d);
      }

      decoded = decode(raw);

      let message: any = null;
      try {
        message = decoded ? JSON.parse(decoded) : null;
      } catch (err) {
        console.warn("Could not JSON.parse match data:", decoded, err);
        return;
      }

      // Normalize server messages (Start, Update, Done) into a UI-friendly state shape
      // Server opcodes (backend/messages.ts): START=1, UPDATE=2, DONE=3
      const op = matchData.op_code;
  const normalized: any = { status: op, state: null };

      const toSymbol = (m: number | null) => {
        if (m === 1) return "X";
        if (m === 2) return "O";
        return "";
      };

      if (op === 1 && message) {
        // START: { board, marks, mark, deadline }
        const board = (message.board || []).map((v: number | null) => toSymbol(v));
        // marks: { userId: Mark }
        const marks = message.marks || {};
        // Build players mapping: { userId: { username, symbol } }
        const players: Record<string, any> = {};
        for (const [userId, m] of Object.entries(marks)) {
          players[userId] = { username: userId, symbol: toSymbol(m as number) };
        }

        // persist players and board
        lastPlayers = players;
        lastBoard = board;

        normalized.state = {
          board,
          turn: toSymbol(message.mark),
          winner: "",
          started: true,
          players,
          deadline: message.deadline,
        };
      } else if (op === 2 && message) {
        // UPDATE: { board, mark, deadline }
        const board = (message.board || []).map((v: number | null) => toSymbol(v));
        lastBoard = board; // Update last board
        normalized.state = {
          board,
          turn: toSymbol(message.mark),
          winner: "",
          started: true,
          // keep players from last START so UI still knows opponent info
          players: lastPlayers,
          deadline: message.deadline,
        };
      } else if (op === 3 && message) {
        // DONE: { board, winner, winnerPositions, nextGameStart }
        const board = (message.board || []).map((v: number | null) => toSymbol(v));
        lastBoard = board; // Update last board
        const winnerSymbol = message.winner ? toSymbol(message.winner) : "";
        normalized.state = {
          board,
          turn: "",
          winner: winnerSymbol,
          started: false, // Game has ended
          players: lastPlayers,
          nextGameStart: message.nextGameStart || 0,
          winnerPositions: message.winnerPositions || null,
        };
      } else if (op === 5) {
        // REJECTED: Move was rejected
        normalized.state = { rejected: true, ...(normalized.state || {}) };
      } else if (op === 6) {
        // OPPONENT_LEFT: Opponent has left
        // Preserve current board and players state when opponent leaves
        const currentBoard = normalized.state?.board || lastBoard || [];
        const currentPlayers = normalized.state?.players || lastPlayers;
        // Ensure board has 9 elements
        const safeBoard = currentBoard.length === 9 ? currentBoard : Array(9).fill("");
        normalized.state = { 
          opponentLeft: true,
          board: safeBoard,
          players: currentPlayers,
          started: false, // Game ends when opponent leaves
          turn: "",
          winner: "",
        };
        // Update lastBoard to preserve state
        lastBoard = safeBoard;
      } else {
        // Unknown/other server messages
        normalized.state = { raw: message, ...(normalized.state || {}) };
      }

      onUpdate(normalized);
    } catch (err) {
      console.error("Error parsing match data:", err);
    }
  };
  socket.onmatchdata = handler as any;

  return () => {
    if (socket && socket.onmatchdata === (handler as any)) {
      (socket as any).onmatchdata = undefined;
    }
  };
}

/**
 * Start matchmaking using RPC find_match. This function:
 *  - calls the RPC to find or create a match
 *  - joins the first available match
 *  - calls onMatchReady(matchId) when matched
 */
export async function findMatch(onMatchReady: (matchToken: string) => void, timed: boolean = false) {
  if (!session) {
    await ensureSession();
  }
  if (!session) throw new Error("Session not available");

  try {
    // Call RPC to find or create a match
    const response = await client.rpc(session, "find_match_js", JSON.stringify({ timed: timed }) as any);
    const payload = typeof response.payload === 'string' ? response.payload : JSON.stringify(response.payload);
    const result = JSON.parse(payload) as { matchIds: string[] };
    
    if (result.matchIds && result.matchIds.length > 0) {
      console.log("✅ Found matches:", result.matchIds);
      
      // Use matchmaker token if available, otherwise join directly
      // For now, we'll use the matchmaker approach for consistency
      if (!socket) {
        await connectSocket();
      }
      if (!socket) throw new Error("Socket not connected");

      // Register handler before joining
      socket.onmatchmakermatched = async (matched: MatchmakerMatched) => {
        try {
          console.log("✅ Matchmaker matched:", matched);
          onMatchReady(matched.token);
        } catch (err) {
          console.error("Error handling matchmaker matched:", err);
        }
        if (socket) {
          (socket as any).onmatchmakermatched = undefined;
        }
      };

      // Try to join the first match directly, or use matchmaker
      // Since RPC returns match IDs, we can try joining directly
      try {
        const match = await socket.joinMatch(result.matchIds[0]);
        currentMatchId = match.match_id;
        console.log("🎮 Joined match:", currentMatchId);
        onMatchReady(result.matchIds[0]); // Use match ID as token for direct join
      } catch (joinError) {
        console.warn("Direct join failed, using matchmaker:", joinError);
        // Fallback to matchmaker
        const query = timed ? "+label.timed:1" : "+label.timed:0";
        const ticket = await socket.addMatchmaker(query, 2, 2);
        currentTicket = ticket.ticket;
        console.log("🎯 Matchmaker ticket created:", currentTicket);
      }
    } else {
      throw new Error("No matches found");
    }
  } catch (error) {
    console.error("Error finding match:", error);
    throw error;
  }
}

// Join a match using a matchmaker token or match ID. Caller should subscribe to match updates
// before calling this to avoid missing START messages.
export async function joinMatchWithToken(token: string) {
  if (!socket) throw new Error("Socket not connected.");
  console.log("⚙️ joinMatchWithToken called, token:", token);
  
  try {
    // Try joining with token first (matchmaker token)
    const match = await socket.joinMatch(undefined, token);
    currentMatchId = match.match_id;
    console.log("🎮 Joined match via token:", currentMatchId);
    return match;
  } catch (error) {
    console.warn("Token join with provided token failed, attempting direct match join:", error);
    // If token join fails, try joining by match ID directly
    try {
      console.log("Token join failed, trying direct match ID join");
      const match = await socket.joinMatch(token);
      currentMatchId = match.match_id;
      console.log("🎮 Joined match via ID:", currentMatchId);
      return match;
    } catch (idError) {
      console.error("Failed to join match with token or ID:", idError);
      throw idError;
    }
  }
}

export async function leaveMatch() {
  if (socket && currentMatchId) {
    try {
      await socket.leaveMatch(currentMatchId);
      console.log("🚪 Left match:", currentMatchId);
    } catch (err) {
      console.warn("Failed to leave match:", err);
    }
  }

  if (socket) {
    (socket as any).onmatchdata = undefined;
    (socket as any).onmatchmakermatched = undefined;
  }

  resetMatchTracking();
  pendingMatchToken = null;
}

export function setPendingMatchToken(token: string | null) {
  pendingMatchToken = token;
}

export function getPendingMatchToken(): string | null {
  return pendingMatchToken;
}

// Cancel a pending matchmaking ticket (call on unmount or when cancelling)
export async function cancelMatchmaking() {
  if (!socket || !currentTicket) return;
  try {
    await socket.removeMatchmaker(currentTicket);
    console.log("Cancelled matchmaker ticket:", currentTicket);
  } catch (err) {
    console.warn("Error cancelling ticket:", err);
  } finally {
    currentTicket = null;
  }
}

// Get current match ID
export function getCurrentMatchId(): string | null {
  return currentMatchId;
}

export { client, socket };
