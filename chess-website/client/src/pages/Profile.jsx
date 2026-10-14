import { LogOut, Trophy, Target, Swords, CalendarDays, History, ChevronRight, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Navigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import api, { getApiError } from "../lib/api.js";

export default function Profile() {
  const { user, loading, logout } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const [history, setHistory] = useState([]);
  const [stats, setStats] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const loadHistory = useCallback(async (nextPage = 1) => {
    setHistoryLoading(true); setHistoryError("");
    try {
      const { data } = await api.get(`/games/mine?page=${nextPage}&limit=8`);
      setHistory(data.games || []); setStats(data.stats || null); setPages(data.pagination?.pages || 1); setPage(nextPage);
    } catch (error) { setHistoryError(getApiError(error)); }
    finally { setHistoryLoading(false); }
  }, []);
  useEffect(() => { if (user) loadHistory(1); }, [user, loadHistory]);
  if (loading) return <div className="auth-loading">Loading your profile…</div>;
  if (!user) return <Navigate to="/login" replace state={{ from: "/profile" }} />;
  const currentStats = stats || user;
  const joined = user.createdAt ? new Date(user.createdAt).toLocaleDateString(undefined, { month: "long", year: "numeric" }) : "Recently";
  const winRate = currentStats.gamesPlayed ? Math.round((currentStats.gamesWon / currentStats.gamesPlayed) * 100) : 0;
  const handleLogout = async () => { setSigningOut(true); try { await logout(); } finally { setSigningOut(false); } };
  return <section className="profile-page">
    <div className="page-heading"><div><div className="eyebrow">PLAYER PROFILE</div><h1>Your <em>chess journey.</em></h1><p>Your Knightfall account, results, and progress in one place.</p></div><button className="button button-secondary" onClick={handleLogout} disabled={signingOut}><LogOut size={15}/>{signingOut ? "Logging out…" : "Log out"}</button></div>
    <div className="profile-card">
      <div className="profile-avatar">{(user.displayName || user.username).slice(0, 1).toUpperCase()}</div>
      <div className="profile-identity"><h2>{user.displayName}</h2><p>@{user.username}</p><span><CalendarDays size={13}/> Member since {joined}</span></div>
      <div className="rating-chip"><small>CHESS RATING</small><strong>{currentStats.rating ?? user.rating}</strong><span>{stats ? "Updated from your account" : "Starting rating"}</span></div>
    </div>
    <div className="profile-stats">
      <div className="profile-stat"><Trophy size={20}/><span>Games won</span><strong>{currentStats.gamesWon ?? user.gamesWon}</strong></div>
      <div className="profile-stat"><Swords size={20}/><span>Games played</span><strong>{currentStats.gamesPlayed ?? user.gamesPlayed}</strong></div>
      <div className="profile-stat"><Target size={20}/><span>Win rate</span><strong>{winRate}%</strong></div>
    </div>
    <section className="game-history-section">
      <div className="history-heading"><div><div className="eyebrow">YOUR RECORD</div><h2><History size={20}/> Recent games</h2></div><button className="button button-secondary" onClick={() => loadHistory(1)} disabled={historyLoading}><RefreshCw size={14}/> Refresh</button></div>
      {historyError ? <div className="auth-error" role="alert">{historyError} <button className="text-button" onClick={() => loadHistory(1)}>Try again</button></div> : historyLoading ? <div className="history-empty">Loading game history…</div> : history.length === 0 ? <div className="history-empty"><span>♞</span><strong>No completed online games yet</strong><p>Play an online game while logged in. Completed games will appear here.</p><Link className="button button-primary" to="/online">Play online</Link></div> : <>
        <div className="history-list">{history.map(game => <article className="history-row" key={game.id}>
          <span className={`history-outcome ${game.outcome}`}>{game.outcome === "win" ? "W" : game.outcome === "loss" ? "L" : "D"}</span>
          <div className="history-opponent"><strong>vs {game.opponent}</strong><span>{game.color} · {game.termination} · {new Date(game.endedAt).toLocaleString()}</span></div>
          <div className="history-result"><strong>{game.result}</strong><span className={game.ratingChange > 0 ? "rating-up" : game.ratingChange < 0 ? "rating-down" : ""}>{game.ratingChange === null ? "Unrated" : `${game.ratingChange > 0 ? "+" : ""}${game.ratingChange} rating`}</span></div>
          <button className="history-pgn" onClick={() => { if (game.pgn) navigator.clipboard?.writeText(game.pgn); }} title="Copy PGN" aria-label={`Copy PGN for game against ${game.opponent}`}><ChevronRight size={17}/></button>
        </article>)}</div>
        {pages > 1 && <div className="history-pagination"><button className="button button-secondary" disabled={page <= 1 || historyLoading} onClick={() => loadHistory(page - 1)}>Previous</button><span>Page {page} of {pages}</span><button className="button button-secondary" disabled={page >= pages || historyLoading} onClick={() => loadHistory(page + 1)}>Next</button></div>}
      </>}
    </section>
    <div className="profile-next"><div><div className="eyebrow">READY WHEN YOU ARE</div><h2>Make your next move.</h2><p>Play against the computer or challenge a friend online. Finished online games are stored in your account history.</p></div><div className="profile-actions"><Link className="button button-primary" to="/computer">Play computer</Link><Link className="button button-secondary" to="/online">Play online</Link></div></div>
  </section>;
}
