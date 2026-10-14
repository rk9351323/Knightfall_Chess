import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { io } from "socket.io-client";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import { Copy, DoorOpen, Plus, Wifi, ArrowRight, RotateCcw, Flag, Users, LoaderCircle, ShieldCheck, Shuffle, Handshake, XCircle, Clock } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || (import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL.replace(/\/api\/?$/, "") : "http://localhost:5000");

export default function PlayOnline() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [name, setName] = useState(user?.displayName || "");
  const [roomInput, setRoomInput] = useState(searchParams.get("room") || "");
  const [room, setRoom] = useState(null);
  const [color, setColor] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("Connect to the server to create or join a room.");
  const [busy, setBusy] = useState(false);
  const [ended, setEnded] = useState(null);
  const [timeControlMinutes, setTimeControlMinutes] = useState(5);
  const [incrementSeconds, setIncrementSeconds] = useState(0);
  const [matching, setMatching] = useState(false);
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [resultDismissed, setResultDismissed] = useState(false);

  useEffect(() => {
    const socket = io(SOCKET_URL, { withCredentials: true, autoConnect: true });
    socketRef.current = socket;
    socket.on("connect", () => { setConnected(true); setError(""); setNotice("Connected to the multiplayer server."); });
    socket.on("disconnect", () => { setConnected(false); setNotice("Connection lost. Reconnect or refresh the page."); });
    socket.on("connect_error", () => { setConnected(false); setError("Could not connect to the multiplayer server. Check that the backend is running."); });
    socket.on("game:state", (state) => { setRoom(state); setEnded(state.isGameOver ? state.status : null); });
    socket.on("game:recorded", ({ result }) => { setNotice(`Game saved to your history (${result}).`); });
    socket.on("game:save-error", ({ message }) => setError(message || "Game history could not be saved."));
    socket.on("matchmaking:waiting", () => { setMatching(true); setNotice("Searching for an opponent. Keep this page open."); });
    socket.on("matchmaking:matched", ({ state, color: assignedColor }) => {
      setMatching(false); setRoom(state); setColor(assignedColor); setEnded(null); setRoomInput(state.roomId);
      setSearchParams({ room: state.roomId }); setNotice("Opponent found. Game started!");
    });
    socket.on("matchmaking:cancelled", () => { setMatching(false); setNotice("Matchmaking cancelled."); });
    socket.on("game:draw-offered", ({ by }) => setNotice(`${by === "white" ? "White" : "Black"} offered a draw.`));
    socket.on("game:draw-declined", () => setNotice("Your opponent declined the draw offer."));
    socket.on("game:ended", ({ reason, resignedBy }) => {
      setEnded(reason === "resignation" ? `${resignedBy === "white" ? "White" : "Black"} resigned.` : "Game ended.");
    });
    return () => { socket.emit("room:leave"); socket.disconnect(); socketRef.current = null; };
  }, []);

  useEffect(() => { if (user?.displayName && !name) setName(user.displayName); }, [user, name]);

  const moves = room?.moves || [];
  const localGame = useMemo(() => room?.fen ? new Chess(room.fen) : null, [room?.fen]);
  const selectedMoves = selectedSquare && localGame ? localGame.moves({ square: selectedSquare, verbose: true }) : [];
  const checkedKingSquare = useMemo(() => {
    if (!localGame?.isCheck()) return null;
    const board = localGame.board();
    for (let row = 0; row < board.length; row += 1) {
      const column = board[row].findIndex(piece => piece?.type === "k" && piece.color === localGame.turn());
      if (column >= 0) return `${"abcdefgh"[column]}${8 - row}`;
    }
    return null;
  }, [localGame]);
  const squareStyles = useMemo(() => {
    const styles = {};
    const lastMove = localGame?.history({ verbose: true }).at(-1);
    if (lastMove) {
      styles[lastMove.from] = { backgroundColor: "#b6ed7545" };
      styles[lastMove.to] = { backgroundColor: "#b6ed7545" };
    }
    if (selectedSquare) styles[selectedSquare] = { boxShadow: "inset 0 0 0 4px #b6ed75" };
    for (const move of selectedMoves) {
      styles[move.to] = localGame.get(move.to)
        ? { boxShadow: "inset 0 0 0 4px #b6ed75", backgroundColor: "#b6ed7560" }
        : { backgroundImage: "radial-gradient(circle, #17251d66 22%, transparent 24%)" };
    }
    if (checkedKingSquare) styles[checkedKingSquare] = { backgroundColor: "#ef4444", boxShadow: "inset 0 0 0 4px #991b1b" };
    return styles;
  }, [checkedKingSquare, localGame, selectedMoves, selectedSquare]);
  const movePairs = useMemo(() => {
    const rows = [];
    for (let i = 0; i < moves.length; i += 2) rows.push({ number: i / 2 + 1, white: moves[i], black: moves[i + 1] || "" });
    return rows;
  }, [moves]);
  const myTurn = room && color === room.turn && room.started && !room.isGameOver;

  const createRoom = useCallback(() => {
    if (!connected) return setError("Wait until the server connection is ready.");
    setBusy(true); setError("");
    socketRef.current.emit("room:create", { name: name.trim() || user?.displayName || "Guest", timeControlMinutes, incrementSeconds }, (result) => {
      setBusy(false);
      if (!result?.ok) return setError(result?.message || "Could not create a room.");
      setRoom(result.state); setColor(result.color); setEnded(null); setRoomInput(result.state.roomId);
      setSearchParams({ room: result.state.roomId }); setNotice("Room created. Share the invite link with your opponent.");
    });
  }, [connected, name, user, setSearchParams, timeControlMinutes, incrementSeconds]);

  const joinRoom = useCallback((id = roomInput) => {
    if (!connected) return setError("Wait until the server connection is ready.");
    if (!id.trim()) return setError("Enter a room code first.");
    setBusy(true); setError("");
    socketRef.current.emit("room:join", { roomId: id.trim().toUpperCase(), name: name.trim() || user?.displayName || "Guest" }, (result) => {
      setBusy(false);
      if (!result?.ok) return setError(result?.message || "Could not join this room.");
      setRoom(result.state); setColor(result.color); setEnded(null); setRoomInput(result.state.roomId);
      setSearchParams({ room: result.state.roomId }); setNotice(result.state.started ? "Game ready. Make your move when it is your turn." : "Joined room. Waiting for the other player.");
    });
  }, [connected, roomInput, name, user, setSearchParams]);

  useEffect(() => {
    const roomFromLink = searchParams.get("room");
    if (roomFromLink && connected && !room && !color) joinRoom(roomFromLink);
  }, [searchParams, connected, room, color, joinRoom]);

  function findMatch() {
    if (!connected) return setError("Wait until the server connection is ready.");
    setError(""); setMatching(true);
    socketRef.current?.emit("matchmaking:join", { name: name.trim() || user?.displayName || "Guest", timeControlMinutes, incrementSeconds }, (result) => {
      if (!result?.ok) { setMatching(false); setError(result?.message || "Could not join matchmaking."); }
      else if (result.waiting) setNotice("Searching for an opponent. Keep this page open.");
      else if (result.state) { setMatching(false); setRoom(result.state); setColor(result.color); setRoomInput(result.state.roomId); setSearchParams({ room: result.state.roomId }); setNotice("Opponent found. Game started!"); }
    });
  }
  function cancelMatch() {
    socketRef.current?.emit("matchmaking:cancel", {}, () => {});
    setMatching(false);
  }
  function offerDraw() {
    socketRef.current?.emit("game:draw-offer", {}, (result) => {
      if (!result?.ok) setError(result?.message || "Could not offer a draw.");
      else setNotice("Draw offer sent to your opponent.");
    });
  }
  function respondToDraw(accept) {
    socketRef.current?.emit("game:draw-response", { accept }, (result) => {
      if (!result?.ok) setError(result?.message || "Could not respond to draw offer.");
      else setNotice(accept ? "Draw agreed." : "Draw offer declined.");
    });
  }
  const formatClock = (milliseconds) => {
    const totalSeconds = Math.ceil(Math.max(0, milliseconds || 0) / 1000);
    return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;
  };

  const onPieceDrop = useCallback(({ sourceSquare, targetSquare }) => {
    if (!targetSquare || !myTurn) return false;
    socketRef.current?.emit("game:move", { from: sourceSquare, to: targetSquare, promotion: "q" }, (result) => {
      if (!result?.ok) setError(result?.message || "Move rejected.");
      else { setError(""); setNotice(`You played ${result.san}.`); }
    });
    return true;
  }, [myTurn]);

  const onSquareClick = useCallback(({ square, piece }) => {
    if (!myTurn || !localGame) return;
    const selectedMove = selectedMoves.find(move => move.to === square);
    if (selectedMove) {
      onPieceDrop({ sourceSquare: selectedSquare, targetSquare: square });
      setSelectedSquare(null);
      return;
    }
    if (square === selectedSquare) { setSelectedSquare(null); return; }
    const playerPiecePrefix = color === "white" ? "w" : "b";
    setSelectedSquare(piece?.pieceType?.startsWith(playerPiecePrefix) ? square : null);
  }, [color, localGame, myTurn, onPieceDrop, selectedMoves, selectedSquare]);

  useEffect(() => { setSelectedSquare(null); }, [room?.fen]);
  useEffect(() => { if (!room?.isGameOver) setResultDismissed(false); }, [room?.isGameOver]);

  async function copyInvite() {
    const url = `${window.location.origin}/online?room=${room?.roomId}`;
    try { await navigator.clipboard.writeText(url); setNotice("Invite link copied. Send it to your opponent."); }
    catch { setError(`Copy this invite link: ${url}`); }
  }
  function leaveRoom() {
    socketRef.current?.emit("room:leave");
    setRoom(null); setColor(null); setEnded(null); setSearchParams({}); setNotice("You left the room.");
  }
  function resign() {
    if (!window.confirm("Are you sure you want to resign?")) return;
    socketRef.current?.emit("game:resign", {}, (result) => { if (!result?.ok) setError(result?.message || "Could not resign."); });
  }
  function newGame() {
    socketRef.current?.emit("game:reset", {}, (result) => { if (!result?.ok) setError(result?.message || "Could not start a new game."); else { setEnded(null); setNotice("New game started. White moves first."); } });
  }

  const whiteName = room?.players?.white?.name || "Waiting for White";
  const blackName = room?.players?.black?.name || "Waiting for Black";

  return <div className="online-page">
    <div className="page-heading"><div><div className="eyebrow">LIVE MULTIPLAYER</div><h1>Bring a friend. <em>Play chess.</em></h1><p>Rooms are managed by the server and moves are validated with chess.js.</p></div><span className="mode-tag"><Wifi size={16}/>{connected ? "SERVER CONNECTED" : "CONNECTING…"}</span></div>
    {!room ? <div className="online-grid">
      <section className="online-card"><div className="online-card-icon"><Plus size={23}/></div><h2>Create a private game</h2><p>Start a server-backed room and share its invite link.</p>
        <label className="field-label" htmlFor="player-name-create">Display name</label><input id="player-name-create" className="text-input" maxLength={24} placeholder="Your name (or Guest)" value={name} onChange={e => setName(e.target.value)} />
        <label className="field-label" htmlFor="time-control">Time control</label><div className="select-wrap"><select id="time-control" value={timeControlMinutes} onChange={e => setTimeControlMinutes(Number(e.target.value))}><option value={1}>1 minute · Bullet</option><option value={3}>3 minutes · Blitz</option><option value={5}>5 minutes · Blitz</option><option value={10}>10 minutes · Rapid</option><option value={15}>15 minutes · Rapid</option></select></div>
        <label className="field-label" htmlFor="increment">Increment</label><div className="select-wrap"><select id="increment" value={incrementSeconds} onChange={e => setIncrementSeconds(Number(e.target.value))}><option value={0}>No increment</option><option value={2}>+2 seconds per move</option><option value={5}>+5 seconds per move</option></select></div>
        <button className="button button-primary full-button" onClick={createRoom} disabled={!connected || busy || matching}>{busy ? <LoaderCircle size={16} className="spin"/> : <Plus size={16}/>} Create room <ArrowRight size={17}/></button>
        {!matching ? <button className="button button-secondary full-button" onClick={findMatch} disabled={!connected || busy}><Shuffle size={16}/> Find a quick match</button> : <button className="button button-secondary full-button" onClick={cancelMatch}><XCircle size={16}/> Cancel search</button>}
      </section>
      <section className="online-card"><div className="online-card-icon"><DoorOpen size={23}/></div><h2>Join a game</h2><p>Enter your friend's code or open their invite link on another device.</p>
        <label className="field-label" htmlFor="room-code">Room code</label><input id="room-code" className="text-input" placeholder="e.g. A7K2PQ" value={roomInput} onChange={e=>setRoomInput(e.target.value.toUpperCase().slice(0,8))}/>
        <label className="field-label" htmlFor="player-name-join">Display name</label><input id="player-name-join" className="text-input" maxLength={24} placeholder="Your name (or Guest)" value={name} onChange={e => setName(e.target.value)} />
        <button className="button button-secondary full-button" onClick={() => joinRoom()} disabled={!connected || busy || !roomInput.trim()}><DoorOpen size={16}/> Join room <ArrowRight size={17}/></button>
      </section>
    </div> : <div className="online-game-layout">
      <section className="online-board-column">
        <div className="online-player-bar"><span className="online-avatar">♟</span><div><strong>{color === "black" ? whiteName : blackName}</strong><small>{color === "black" ? "White" : "Black"}{color === "black" ? " opponent" : " opponent"}</small></div><span className="online-player-status">{(color === "white" ? room.players.black : room.players.white)?.connected ? "Connected" : "Waiting"}</span></div>
        <div className="online-board-wrap"><Chessboard options={{ position: room.fen, boardOrientation: color || "white", onPieceDrop, onSquareClick, squareStyles, allowDragging: Boolean(myTurn) }} /></div>
        <div className="online-player-bar"><span className="online-avatar you-avatar">♟</span><div><strong>{color === "white" ? whiteName : blackName} <span className="you-tag">YOU · {color?.toUpperCase()}</span></strong><small>{color === "white" ? "White" : "Black"} player</small></div><span className="online-player-status">You</span></div>
        <div className={`online-notice ${localGame?.isCheck() ? "online-check-notice" : ""}`}><span className="status-dot"/><span>{ended || room.status}{localGame?.isCheck() && !room.isGameOver ? " — Check! The checked king is marked red." : ""}</span></div>
      </section>
      <aside className="online-game-sidebar">
        <div className="sidebar-title"><div><Users size={18}/> <strong>Multiplayer game</strong></div><span className="round-label">ROOM {room.roomId}</span></div>
        <div className="online-room-share"><small>INVITE YOUR OPPONENT</small><strong>{room.roomId}</strong><button className="button button-secondary full-button" onClick={copyInvite}><Copy size={15}/> Copy invite link</button></div>
        <div className="online-turn-card"><small><Clock size={12} style={{display:"inline",verticalAlign:"middle",marginRight:5}}/> GAME CLOCK</small><div className="clock-pair"><span>White <strong>{formatClock(room.clock?.whiteMs)}</strong></span><span>Black <strong>{formatClock(room.clock?.blackMs)}</strong></span></div><small>Initial time: {room.clock?.initialMinutes || 5} min · Increment: {(room.clock?.incrementMs || 0) / 1000}s</small></div>
        <div className="online-turn-card"><small>YOUR COLOR</small><strong>{color?.toUpperCase()}</strong><span>{!room.started ? "Waiting for both players to connect." : myTurn ? "Your turn — make a move." : room.isGameOver ? "Game complete." : "Opponent's turn."}</span></div>
        <div className="sidebar-actions"><button className="button button-secondary full-button" onClick={resign} disabled={!room.started || Boolean(ended)}><Flag size={15}/> Resign game</button>
          {!room.drawOfferBy ? <button className="button button-secondary full-button" onClick={offerDraw} disabled={!room.started || room.isGameOver}><Handshake size={15}/> Offer a draw</button> : room.drawOfferBy !== color ? <div className="action-row"><button className="button button-primary" onClick={() => respondToDraw(true)}><Handshake size={15}/> Accept draw</button><button className="button button-secondary" onClick={() => respondToDraw(false)}><XCircle size={15}/> Decline</button></div> : <div className="notice">Draw offer sent. Waiting for your opponent.</div>}
          <button className="button button-secondary full-button" onClick={newGame} disabled={!room.started}><RotateCcw size={15}/> New game</button><button className="button button-secondary full-button" onClick={leaveRoom}><DoorOpen size={15}/> Leave room</button></div>
        <div className="moves-heading"><strong>Move history</strong><span>{moves.length} plies</span></div>
        <div className="move-list">{movePairs.length ? movePairs.map(row => <div className="move-row" key={row.number}><span>{row.number}.</span><span>{row.white}</span><span>{row.black}</span></div>) : <div className="empty-moves"><span>♞</span><p>No moves yet</p><small>White starts the game.</small></div>}</div>
      </aside>
    </div>}
    {error && <div className="auth-error" role="alert">{error}</div>}
    <div className="online-info"><div className="online-info-icon"><ShieldCheck size={20}/></div><div><strong>{connected ? "Server-validated multiplayer" : "Connecting to multiplayer"}</strong><p>{notice} The server validates moves and runs authoritative clocks. Draw offers and quick matchmaking are supported. Completed games are saved to MongoDB for logged-in players. Active rooms are still cleared if the backend restarts.</p></div></div>
    <Link to="/computer" className="back-to-game">Want to play against the computer? <ArrowRight size={16}/></Link>
    <div className="online-security"><ShieldCheck size={16}/> Never trust client-only moves in multiplayer; the server validates turn order and legality.</div>
    {room?.isGameOver && !resultDismissed && <div className="result-backdrop" role="presentation"><section className="result-dialog" role="dialog" aria-modal="true" aria-labelledby="online-result-title"><button type="button" className="result-close" onClick={() => setResultDismissed(true)} aria-label="Close game result"><XCircle size={18}/></button><div className="eyebrow">ONLINE GAME COMPLETE</div><h2 id="online-result-title">{room.status}</h2><p>{room.gameRecordId ? "The final result is saved. Start a rematch or leave this room." : "Saving the final game record…"}</p><div className="result-actions"><button className="button button-primary" onClick={newGame} disabled={!room.started}><RotateCcw size={16}/> New game in this room</button><button className="button button-secondary" onClick={leaveRoom}><DoorOpen size={16}/> Leave room</button></div></section></div>}
  </div>;
}
