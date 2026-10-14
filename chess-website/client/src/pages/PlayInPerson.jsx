import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import { ArrowLeft, RotateCcw, Undo2, UsersRound, ShieldCheck, X } from "lucide-react";

export default function PlayInPerson() {
  const [game, setGame] = useState(() => new Chess());
  const [whiteName, setWhiteName] = useState("Player 1");
  const [blackName, setBlackName] = useState("Player 2");
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [isSupportedScreen, setIsSupportedScreen] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 1024px)").matches);
  const [resultDismissed, setResultDismissed] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1024px)");
    const update = () => setIsSupportedScreen(media.matches);
    update();
    if (media.addEventListener) media.addEventListener("change", update);
    else media.addListener(update);
    return () => {
      if (media.removeEventListener) media.removeEventListener("change", update);
      else media.removeListener(update);
    };
  }, []);

  const history = game.history({ verbose: true });
  const turnName = game.turn() === "w" ? (whiteName.trim() || "White") : (blackName.trim() || "Black");
  const selectedMoves = selectedSquare ? game.moves({ square: selectedSquare, verbose: true }) : [];
  const checkSquare = useMemo(() => {
    if (!game.isCheck()) return null;
    const board = game.board();
    for (let row = 0; row < board.length; row += 1) {
      const col = board[row].findIndex(piece => piece?.type === "k" && piece.color === game.turn());
      if (col >= 0) return `${"abcdefgh"[col]}${8 - row}`;
    }
    return null;
  }, [game]);
  const squareStyles = useMemo(() => {
    const styles = {};
    const last = history.at(-1);
    if (last) {
      styles[last.from] = { backgroundColor: "#b6ed7545" };
      styles[last.to] = { backgroundColor: "#b6ed7545" };
    }
    if (selectedSquare) styles[selectedSquare] = { boxShadow: "inset 0 0 0 4px #b6ed75" };
    for (const move of selectedMoves) styles[move.to] = game.get(move.to)
      ? { boxShadow: "inset 0 0 0 4px #b6ed75", backgroundColor: "#b6ed7560" }
      : { backgroundImage: "radial-gradient(circle, #17251d66 22%, transparent 24%)" };
    if (checkSquare) styles[checkSquare] = { backgroundColor: "#ef4444", boxShadow: "inset 0 0 0 4px #991b1b" };
    return styles;
  }, [checkSquare, game, history, selectedMoves, selectedSquare]);

  function makeMove(from, to) {
    try {
      const next = new Chess(game.fen());
      const move = next.move({ from, to, promotion: "q" });
      if (!move) return false;
      setGame(next);
      setSelectedSquare(null);
      setResultDismissed(false);
      return true;
    } catch { return false; }
  }

  function onSquareClick({ square, piece }) {
    const targetMove = selectedMoves.find(move => move.to === square);
    if (targetMove) { makeMove(selectedSquare, square); return; }
    if (square === selectedSquare) { setSelectedSquare(null); return; }
    const currentPrefix = game.turn();
    setSelectedSquare(piece?.pieceType?.startsWith(currentPrefix) ? square : null);
  }

  function undoMove() {
    if (!history.length) return;
    const next = new Chess(game.fen());
    next.undo();
    setGame(next);
    setSelectedSquare(null);
    setResultDismissed(false);
  }

  function newGame() {
    setGame(new Chess());
    setSelectedSquare(null);
    setResultDismissed(false);
  }

  const status = game.isCheckmate() ? `Checkmate — ${game.turn() === "w" ? (blackName.trim() || "Black") : (whiteName.trim() || "White")} wins`
    : game.isDraw() ? "Game drawn" : `${turnName} to move${game.isCheck() ? " — Check!" : ""}`;

  if (!isSupportedScreen) return <div className="in-person-unavailable"><div className="eyebrow"><UsersRound size={15}/> IN-PERSON MODE</div><h1>Designed for a shared <em>mobile screen.</em></h1><p>Open this page on a phone or tablet to play in person. You can also use online mode for two separate devices.</p><Link className="button button-secondary" to="/online"><ArrowLeft size={16}/> Play online</Link></div>;

  return <div className="in-person-page">
    <div className="page-heading"><div><div className="eyebrow"><UsersRound size={15}/> PASS AND PLAY</div><h1>Play <em>in person.</em></h1><p>Share this device and take turns. The board rotates to face the next player.</p></div><span className="mode-tag"><ShieldCheck size={15}/> LOCAL GAME</span></div>
    <div className="in-person-layout">
      <section className="in-person-board-column">
        <div className={`in-person-player ${game.turn() === "b" ? "active" : ""}`}><span className="in-person-piece">♚</span><label><small>BLACK</small><input aria-label="Black player name" maxLength={24} value={blackName} onChange={event => setBlackName(event.target.value)} /></label><span className="in-person-turn">{game.turn() === "b" ? "To move" : ""}</span></div>
        <div className="in-person-board-wrap"><Chessboard options={{ position: game.fen(), boardOrientation: game.turn() === "w" ? "white" : "black", onPieceDrop: ({ sourceSquare, targetSquare }) => makeMove(sourceSquare, targetSquare), onSquareClick, squareStyles, allowDragging: !game.isGameOver(), boardStyle: { borderRadius: 5, overflow: "hidden" }, darkSquareStyle: { backgroundColor: "#64866d" }, lightSquareStyle: { backgroundColor: "#e7e8d5" }, animationDurationInMs: 140 }} /></div>
        <div className={`in-person-player ${game.turn() === "w" ? "active" : ""}`}><span className="in-person-piece">♔</span><label><small>WHITE</small><input aria-label="White player name" maxLength={24} value={whiteName} onChange={event => setWhiteName(event.target.value)} /></label><span className="in-person-turn">{game.turn() === "w" ? "To move" : ""}</span></div>
      </section>
      <aside className="in-person-sidebar">
        <div className={`turn-card ${game.isCheck() ? "check-turn-card" : ""}`}><small>GAME STATUS</small><strong>{status}</strong><span>{game.isCheckmate() ? "Start a new game to play again." : "Moves are saved only on this device and are not sent to the server."}</span></div>
        <div className="in-person-actions"><button className="button button-primary" onClick={newGame}><RotateCcw size={16}/> New game</button><button className="button button-secondary" onClick={undoMove} disabled={!history.length}><Undo2 size={16}/> Undo move</button></div>
        <div className="moves-heading"><strong>Move history</strong><span>{history.length} plies</span></div>
        <div className="move-list in-person-move-list">{history.length ? Array.from({ length: Math.ceil(history.length / 2) }, (_, index) => <div className="move-row" key={index}><span>{index + 1}.</span><span>{history[index * 2]?.san}</span><span>{history[index * 2 + 1]?.san || ""}</span></div>) : <div className="empty-moves"><span>♙</span><p>No moves yet</p><small>White starts the game.</small></div>}</div>
      </aside>
    </div>
    {game.isGameOver() && !resultDismissed && <div className="result-backdrop" role="presentation"><section className="result-dialog" role="dialog" aria-modal="true" aria-labelledby="in-person-result-title"><button type="button" className="result-close" onClick={() => setResultDismissed(true)} aria-label="Close result"><X size={18}/></button><div className="eyebrow">GAME COMPLETE</div><h2 id="in-person-result-title">{game.isCheckmate() ? "Checkmate" : "Game drawn"}</h2><p>{status}</p><div className="result-actions"><button className="button button-primary" onClick={newGame}><RotateCcw size={16}/> Play again</button><button className="button button-secondary" onClick={() => setResultDismissed(true)}>Review final board</button></div></section></div>}
  </div>;
}
