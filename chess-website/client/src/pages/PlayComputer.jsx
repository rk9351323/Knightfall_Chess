import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import { RotateCcw, Undo2, FlipHorizontal2, Bot, ChevronDown, Flag, Info, LoaderCircle, UserRound, ChevronLeft, ChevronRight, X } from "lucide-react";

const LEVELS = {
  Beginner: { skill: 0, depth: 4 },
  Intermediate: { skill: 5, depth: 8 },
  Advanced: { skill: 12, depth: 12 },
  Expert: { skill: 20, depth: 15 }
};

function parseUciMove(uci) {
  if (!uci || uci === "(none)" || uci === "0000") return null;
  return { from: uci.slice(0, 2), to: uci.slice(2, 4), ...(uci[4] ? { promotion: uci[4] } : {}) };
}

export default function PlayComputer() {
  const [game, setGame] = useState(() => new Chess());
  const [boardOrientation, setBoardOrientation] = useState("white");
  const [humanColor, setHumanColor] = useState("white");
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [reviewPly, setReviewPly] = useState(null);
  const [resultDismissed, setResultDismissed] = useState(false);
  const [difficulty, setDifficulty] = useState("Intermediate");
  const [notice, setNotice] = useState("Loading Stockfish chess engine…");
  const [engineStatus, setEngineStatus] = useState("loading");
  const [thinking, setThinking] = useState(false);
  const [gameVersion, setGameVersion] = useState(0);
  const gameRef = useRef(game);
  const engineRef = useRef(null);
  const engineReadyRef = useRef(false);
  const pendingEngineRef = useRef(false);
  const ignoredBestmoveRef = useRef(0);
  const humanColorRef = useRef("white");
  const difficultyRef = useRef("Intermediate");
  const gameIdRef = useRef(0);
  const activeSearchGameIdRef = useRef(0);

  function stopPendingSearch() {
    if (pendingEngineRef.current) {
      ignoredBestmoveRef.current += 1;
      engineRef.current?.postMessage("stop");
    }
    pendingEngineRef.current = false;
    setThinking(false);
  }

  const fen = game.fen();
  const moves = game.history({ verbose: true });
  const displayedPly = reviewPly ?? moves.length;
  const displayGame = useMemo(() => {
    if (reviewPly === null || reviewPly >= moves.length) return game;
    const replay = new Chess();
    for (const move of moves.slice(0, Math.max(0, reviewPly))) {
      replay.move({ from: move.from, to: move.to, promotion: move.promotion });
    }
    return replay;
  }, [game, moves, reviewPly]);
  const showingLivePosition = reviewPly === null || reviewPly >= moves.length;
  const playerTurn = game.turn() === (humanColor === "white" ? "w" : "b");
  const selectedMoves = selectedSquare ? displayGame.moves({ square: selectedSquare, verbose: true }) : [];
  const moveIsEditable = !showingLivePosition && displayedPly < moves.length;
  const displayedPlayerTurn = displayGame.turn() === (humanColor === "white" ? "w" : "b");
  const checkedKingSquare = useMemo(() => {
    if (!displayGame.isCheck()) return null;
    const board = displayGame.board();
    for (let row = 0; row < board.length; row += 1) {
      const column = board[row].findIndex(piece => piece?.type === "k" && piece.color === displayGame.turn());
      if (column >= 0) return `${"abcdefgh"[column]}${8 - row}`;
    }
    return null;
  }, [displayGame]);
  const squareStyles = useMemo(() => {
    const styles = {};
    const shownMoves = displayGame.history({ verbose: true });
    const lastMove = shownMoves.at(-1);
    if (lastMove) {
      styles[lastMove.from] = { backgroundColor: "#b6ed7545" };
      styles[lastMove.to] = { backgroundColor: "#b6ed7545" };
    }
    if (selectedSquare) styles[selectedSquare] = { boxShadow: "inset 0 0 0 4px #b6ed75" };
    for (const move of selectedMoves) {
      styles[move.to] = displayGame.get(move.to)
        ? { boxShadow: "inset 0 0 0 4px #b6ed75", backgroundColor: "#b6ed7560" }
        : { backgroundImage: "radial-gradient(circle, #17251d66 22%, transparent 24%)" };
    }
    if (checkedKingSquare) styles[checkedKingSquare] = { backgroundColor: "#ef4444", boxShadow: "inset 0 0 0 4px #991b1b" };
    return styles;
  }, [checkedKingSquare, displayGame, game, selectedMoves, selectedSquare, showingLivePosition]);
  const status = useMemo(() => {
    if (game.isCheckmate()) return `Checkmate — ${game.turn() === "w" ? "Black" : "White"} wins`;
    if (game.isStalemate()) return "Draw by stalemate";
    if (game.isThreefoldRepetition()) return "Draw by repetition";
    if (game.isInsufficientMaterial()) return "Draw — insufficient material";
    if (game.isDraw()) return "Game drawn";
    return `${game.turn() === "w" ? "White" : "Black"} to move${game.isCheck() ? " — Check!" : ""}`;
  }, [fen, game]);

  const publishGame = useCallback((next) => {
    gameRef.current = next;
    setSelectedSquare(null);
    setReviewPly(null);
    setResultDismissed(false);
    setGame(next);
    setGameVersion(v => v + 1);
  }, []);

  const requestEngineMove = useCallback((positionFen, searchGameId) => {
    const engine = engineRef.current;
    if (!engine || !engineReadyRef.current || pendingEngineRef.current || gameRef.current.isGameOver()) return;
    const humanTurn = gameRef.current.turn() === (humanColorRef.current === "white" ? "w" : "b");
    if (humanTurn) return;
    const level = LEVELS[difficultyRef.current] || LEVELS.Intermediate;
    pendingEngineRef.current = true;
    activeSearchGameIdRef.current = searchGameId;
    setThinking(true);
    setNotice("Stockfish is calculating its move…");
    engine.postMessage(`setoption name Skill Level value ${level.skill}`);
    engine.postMessage(`position fen ${positionFen}`);
    engine.postMessage(`go depth ${level.depth}`);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let engineInstance;
    const receiveLine = (raw) => {
      const line = typeof raw === "string" ? raw : raw?.data;
      if (!line || cancelled) return;
      if (line === "uciok") { engineInstance?.postMessage("isready"); return; }
      if (line === "readyok") {
        engineReadyRef.current = true;
        setEngineStatus("ready");
        setNotice("Stockfish is ready. Your move.");
        if (gameRef.current.turn() !== (humanColorRef.current === "white" ? "w" : "b")) {
          requestEngineMove(gameRef.current.fen(), gameIdRef.current);
        }
        return;
      }
      if (!line.startsWith("bestmove ")) return;
      if (ignoredBestmoveRef.current > 0) {
        ignoredBestmoveRef.current -= 1;
        return;
      }
      pendingEngineRef.current = false;
      setThinking(false);
      if (activeSearchGameIdRef.current !== gameIdRef.current) return;
      const engineMove = parseUciMove(line.split(/\s+/)[1]);
      const current = gameRef.current;
      if (!engineMove || current.isGameOver()) {
        setNotice(current.isGameOver() ? "Game finished." : "Stockfish could not find a move.");
        return;
      }
      const next = new Chess(current.fen());
      try {
        const played = next.move(engineMove);
        if (!played) { setNotice("The engine returned an invalid move. Please restart the game."); return; }
        publishGame(next);
        setNotice(next.isGameOver() ? (next.isCheckmate() ? "Checkmate — you lost this game." : "The game ended in a draw.") : `Stockfish played ${played.san}.`);
      } catch {
        setNotice("Could not apply the engine move. Please restart the game.");
      }
    };

    async function initializeEngine() {
      try {
        // Stockfish is executed locally in the browser; this app does not send FEN positions to a game server.
        // Run the single-threaded WebAssembly build locally in a worker. Keeping
        // the worker and WASM beside one another lets the engine resolve its binary.
        engineInstance = new Worker("/stockfish/stockfish-nnue-16-single.js");
        if (cancelled) { engineInstance?.terminate?.(); return; }
        engineRef.current = engineInstance;
        if (typeof engineInstance.addMessageListener === "function") {
          engineInstance.addMessageListener(receiveLine);
        } else {
          engineInstance.onmessage = (event) => receiveLine(event?.data ?? event);
        }
        engineInstance.postMessage("uci");
      } catch (error) {
        console.error("Stockfish failed to initialize:", error);
        if (!cancelled) {
          setEngineStatus("error");
          setNotice("Stockfish could not load. Confirm the stockfish package installed correctly, then restart the app.");
        }
      }
    }
    initializeEngine();
    return () => {
      cancelled = true;
      engineReadyRef.current = false;
      engineRef.current?.terminate?.();
      engineRef.current = null;
    };
  }, [publishGame, requestEngineMove]);

  useEffect(() => { humanColorRef.current = humanColor; }, [humanColor]);
  useEffect(() => { difficultyRef.current = difficulty; }, [difficulty]);
  useEffect(() => {
    if (!engineReadyRef.current || game.isGameOver() || thinking) return;
    if (!playerTurn && !pendingEngineRef.current) requestEngineMove(game.fen(), gameIdRef.current);
  }, [gameVersion, game, humanColor, playerTurn, requestEngineMove, thinking]);

  function onPieceDrop({ sourceSquare, targetSquare }) {
    if (!targetSquare || (thinking && showingLivePosition) || engineStatus !== "ready" || !displayedPlayerTurn || (showingLivePosition && game.isGameOver()) || (!showingLivePosition && !moveIsEditable)) return false;
    let base = gameRef.current;
    if (!showingLivePosition) {
      gameIdRef.current += 1;
      stopPendingSearch();
      base = new Chess();
      for (const priorMove of moves.slice(0, displayedPly)) base.move({ from: priorMove.from, to: priorMove.to, promotion: priorMove.promotion });
    }
    const next = new Chess(base.fen());
    try {
      const move = next.move({ from: sourceSquare, to: targetSquare, promotion: "q" });
      if (!move) return false;
      publishGame(next);
      setNotice(next.isGameOver() ? (next.isCheckmate() ? "Checkmate — you win!" : "The game ended in a draw.") : `You played ${move.san}.`);
      if (!next.isGameOver()) requestEngineMove(next.fen(), gameIdRef.current);
      return true;
    } catch { return false; }
  }

  function onSquareClick({ square, piece }) {
    if ((thinking && showingLivePosition) || engineStatus !== "ready" || !displayedPlayerTurn || (showingLivePosition && game.isGameOver()) || (!showingLivePosition && !moveIsEditable)) return;
    const selectedMove = selectedMoves.find(move => move.to === square);
    if (selectedMove) {
      onPieceDrop({ sourceSquare: selectedSquare, targetSquare: square });
      setSelectedSquare(null);
      return;
    }
    if (square === selectedSquare) { setSelectedSquare(null); return; }
    const playerPiecePrefix = humanColor === "white" ? "w" : "b";
    setSelectedSquare(piece?.pieceType?.startsWith(playerPiecePrefix) ? square : null);
  }

  function reviewMove(ply) {
    setSelectedSquare(null);
    setReviewPly(Math.max(0, Math.min(moves.length, ply)));
  }

  function startNewGameAsWhite() {
    humanColorRef.current = "white";
    setHumanColor("white");
    setBoardOrientation("white");
    restart();
  }

  function restart() {
    gameIdRef.current += 1;
    stopPendingSearch();
    const next = new Chess();
    publishGame(next);
    setNotice("New game started.");
    if (humanColorRef.current === "black" && engineReadyRef.current) requestEngineMove(next.fen(), gameIdRef.current);
  }

  function undoMove() {
    if (!gameRef.current.history().length || thinking) return;
    gameIdRef.current += 1;
    stopPendingSearch();
    const next = new Chess(gameRef.current.fen());
    next.undo();
    if (next.turn() !== (humanColorRef.current === "white" ? "w" : "b") && next.history().length) next.undo();
    publishGame(next);
    setThinking(false);
    setNotice("Last turn undone.");
  }

  function changeColor(color) {
    if (thinking) return;
    humanColorRef.current = color;
    setHumanColor(color);
    setBoardOrientation(color);
    gameIdRef.current += 1;
    stopPendingSearch();
    const next = new Chess();
    publishGame(next);
    setNotice(color === "white" ? "You are White. Make the first move." : "You are Black. Stockfish will move first.");
    if (color === "black" && engineReadyRef.current) requestEngineMove(next.fen(), gameIdRef.current);
  }

  async function copyPgn() {
    const pgn = gameRef.current.pgn();
    if (!pgn) { setNotice("Play at least one move before exporting PGN."); return; }
    try { await navigator.clipboard.writeText(pgn); setNotice("PGN copied to clipboard."); }
    catch { setNotice(`PGN: ${pgn}`); }
  }

  return <div className="game-page">
    <div className="page-heading"><div><div className="eyebrow">PRACTICE ARENA</div><h1>Play <em>chess.</em></h1><p>Challenge Stockfish and improve one position at a time.</p></div><span className="mode-tag"><Bot size={16}/> COMPUTER MODE</span></div>
    <div className="game-layout">
      <section className="board-column">
        <div className="player-bar"><span className="player-avatar bot-avatar"><Bot size={20}/></span><div className="player-name"><strong>Stockfish</strong><small>{difficulty} level · {engineStatus === "ready" ? "Engine ready" : engineStatus === "loading" ? "Loading engine…" : "Engine unavailable"}</small></div><span className="player-rating">{thinking ? <LoaderCircle className="spin" size={17}/> : "BOT"}</span></div>
        <div className="board-wrap"><Chessboard options={{ position: displayGame.fen(), boardOrientation, onPieceDrop, onSquareClick, squareStyles, allowDragging: engineStatus === "ready" && (showingLivePosition ? !game.isGameOver() && playerTurn && !thinking : moveIsEditable && displayedPlayerTurn), boardStyle: { borderRadius: "5px", overflow: "hidden" }, darkSquareStyle: { backgroundColor: "#64866d" }, lightSquareStyle: { backgroundColor: "#e7e8d5" }, animationDurationInMs: 160 }}/></div>
        <div className="player-bar bottom-player"><span className="player-avatar human-avatar"><UserRound size={20}/></span><div className="player-name"><strong>You <span className="you-tag">YOU</span></strong><small>{humanColor === "white" ? "Playing White" : "Playing Black"} · Guest</small></div><span className="player-rating">{thinking ? "Thinking…" : playerTurn ? "Your turn" : "Waiting"}</span></div>
      </section>
      <aside className="game-sidebar">
        <div className="sidebar-title"><div><span className={`status-dot ${engineStatus !== "ready" ? "status-muted" : ""}`}/><strong>{engineStatus === "ready" ? "Game ready" : engineStatus === "loading" ? "Loading engine" : "Engine unavailable"}</strong></div><span className="round-label">CASUAL</span></div>
        <div className={`turn-card ${game.isCheck() ? "check-turn-card" : ""}`}><small>POSITION</small><strong>{showingLivePosition ? status : `Move ${reviewPly} of ${moves.length}`}</strong><span>{thinking ? "Stockfish is thinking. The board will unlock after its move." : game.isCheckmate() && showingLivePosition ? "Checkmate. Review the game or start another." : game.isCheck() ? "Check! The king in check is marked red on the board." : showingLivePosition ? status : "You are viewing an earlier position."}</span></div>
        <label className="field-label" htmlFor="difficulty">Computer difficulty</label><div className="select-wrap"><select id="difficulty" value={difficulty} onChange={e => setDifficulty(e.target.value)}><option>Beginner</option><option>Intermediate</option><option>Advanced</option><option>Expert</option></select><ChevronDown size={16}/></div>
        <label className="field-label" htmlFor="player-color">Play as</label><div className="select-wrap"><select id="player-color" value={humanColor} onChange={e => changeColor(e.target.value)}><option value="white">White — move first</option><option value="black">Black — engine moves first</option></select><ChevronDown size={16}/></div>
        <div className="sidebar-actions"><button className="button button-primary full-button" onClick={restart}><RotateCcw size={17}/> New game</button><div className="action-row"><button className="button button-secondary" onClick={undoMove} disabled={!moves.length || thinking}><Undo2 size={16}/> Undo turn</button><button className="button button-secondary" onClick={() => setBoardOrientation(v => v === "white" ? "black" : "white")}><FlipHorizontal2 size={16}/> Flip board</button></div></div>
        <div className="moves-heading"><strong>Move history</strong><span>{moves.length} plies</span></div>
        <div className="move-list">{moves.length ? <><div className="move-row computer-history-heading"><span>#</span><span>You</span><span>Stockfish</span></div>{Array.from({ length: Math.ceil(moves.length / 2) }, (_, i) => {
          const whiteMove = moves[i * 2];
          const blackMove = moves[i * 2 + 1];
          const userMove = humanColor === "white" ? whiteMove : blackMove;
          const computerMove = humanColor === "white" ? blackMove : whiteMove;
          const userPly = humanColor === "white" ? i * 2 + 1 : i * 2 + 2;
          const computerPly = humanColor === "white" ? i * 2 + 2 : i * 2 + 1;
          return <div className="move-row" key={i}><span>{i + 1}.</span><button type="button" className={`move-history-san ${displayedPly === userPly ? "last-move" : ""}`} onClick={() => userMove && reviewMove(userPly)} disabled={!userMove}>{userMove?.san || ""}</button><button type="button" className={`move-history-san ${displayedPly === computerPly ? "last-move" : ""}`} onClick={() => computerMove && reviewMove(computerPly)} disabled={!computerMove}>{computerMove?.san || ""}</button></div>;
        })}</> : <div className="empty-moves"><span>♙</span><p>No moves yet</p><small>White starts the game.</small></div>}</div>
        {moves.length > 0 && <div className="history-controls"><button type="button" className="button button-secondary" onClick={() => reviewMove(displayedPly - 1)} disabled={displayedPly <= 0}><ChevronLeft size={15}/> Previous</button><span>{showingLivePosition ? "Live position" : `${displayedPly} / ${moves.length}`}</span><button type="button" className="button button-secondary" onClick={() => reviewMove(displayedPly + 1)} disabled={showingLivePosition}><ChevronRight size={15}/> Next</button>{!showingLivePosition && <button type="button" className="text-button" onClick={() => reviewMove(moves.length)}>Live</button>}</div>}
        <div className="notice"><Info size={16}/><span>{notice}</span></div><button className="text-button" onClick={copyPgn}><Flag size={15}/> Copy game PGN</button>
      </aside>
    </div>
    <div className="phase-note"><Info size={17}/><p><strong>Phase 2:</strong> Stockfish integration is included through the Stockfish package and runs in the browser. Difficulty settings change the engine skill level and search depth. Accounts, MongoDB game history, and real online multiplayer are the next phases.</p></div>
    {game.isGameOver() && !resultDismissed && <div className="result-backdrop" role="presentation"><section className="result-dialog" role="dialog" aria-modal="true" aria-labelledby="computer-result-title"><button type="button" className="result-close" onClick={() => setResultDismissed(true)} aria-label="Close game result"><X size={18}/></button><div className="eyebrow">GAME COMPLETE</div><h2 id="computer-result-title">{game.isCheckmate() ? "Checkmate" : "Game drawn"}</h2><p>{game.isCheckmate() ? (game.turn() === (humanColor === "white" ? "w" : "b") ? "Stockfish wins this game." : "You won this game!") : status}</p><div className="result-actions"><button className="button button-primary" onClick={startNewGameAsWhite}><RotateCcw size={16}/> New game</button><button className="button button-secondary" onClick={restart}><Bot size={16}/> Play again with the same side and level</button><button className="button button-secondary" onClick={undoMove}><Undo2 size={16}/> Undo last turn</button><button className="text-button" onClick={() => { setResultDismissed(true); setReviewPly(Math.max(0, moves.length - 1)); }}>Review moves</button></div></section></div>}
  </div>;
}
