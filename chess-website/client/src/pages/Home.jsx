import { Link } from "react-router-dom";
import { ArrowRight, Bot, Users, UsersRound, ShieldCheck, Timer, Trophy, Sparkles } from "lucide-react";

const features = [
  { icon: Bot, title: "Train with an engine", text: "Sharpen your calculation and build confidence one move at a time." },
  { icon: Users, title: "Play your people", text: "Create a private room and invite a friend to the board." },
  { icon: Trophy, title: "Track your journey", text: "Game history and player statistics are part of the roadmap." }
];

export default function Home() {
  return <div className="home-page">
    <section className="hero">
      <div className="hero-copy">
        <div className="eyebrow"><Sparkles size={14}/> YOUR NEXT MOVE STARTS HERE</div>
        <h1>Every move<br/>has a <em>purpose.</em></h1>
        <p className="hero-description">A calmer place to think, compete, and get better at chess. Take on the computer or bring a friend to the board.</p>
        <div className="hero-actions">
          <Link className="button button-primary" to="/computer"><Bot size={18}/> Play computer <ArrowRight size={17}/></Link>
          <Link className="button button-secondary" to="/online"><Users size={18}/> Play online</Link>
          <Link className="button button-secondary in-person-cta" to="/in-person"><UsersRound size={18}/> Play in person</Link>
        </div>
        <div className="hero-proof"><span className="proof-dot"/> <span>Made for curious minds and bold players</span></div>
      </div>
      <div className="hero-art" aria-label="Decorative chessboard">
        <div className="art-glow"></div><div className="art-label art-label-top">PLAN YOUR ATTACK <span>01 / STRATEGY</span></div>
        <div className="hero-board" aria-hidden="true">
          {["♜","♞","♝","♛","♚","♝","♞","♜","♟","♟","♟","♟","♟","♟","♟","♟","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","♙","♙","♙","♙","♙","♙","♙","♙","♖","♘","♗","♕","♔","♗","♘","♖"].map((piece,i)=><div key={i} className={`art-square ${(Math.floor(i/8)+i%8)%2===0?"light":"dark"} ${[20,29,34,43].includes(i)?"glow-square":""}`}><span className={i<16?"black-piece":"white-piece"}>{piece}</span></div>)}
        </div>
        <div className="art-label art-label-bottom"><span className="mini-avatar">♘</span><span><b>THE BOARD IS YOURS</b><small>Make your next move count.</small></span><span className="live-pill">LIVE</span></div>
      </div>
    </section>
    <section className="stats-strip"><div><strong>64</strong><span>squares. Infinite possibilities.</span></div><div><strong>∞</strong><span>ways to think ahead.</span></div><div><strong>1</strong><span>move to begin.</span></div></section>
    <section className="features-section" id="features">
      <div className="section-heading"><div><div className="eyebrow">BUILT AROUND YOUR GAME</div><h2>A better way to <em>play.</em></h2></div><p>Everything you need to enjoy the game, with no clutter between you and the board.</p></div>
      <div className="feature-grid">{features.map(({icon:Icon,title,text},i)=><article className="feature-card" key={title}><div className="feature-icon"><Icon size={22}/></div><div className="feature-number">0{i+1}</div><h3>{title}</h3><p>{text}</p></article>)}</div>
    </section>
    <section className="cta-panel"><div><div className="eyebrow">READY WHEN YOU ARE</div><h2>Make the first move.</h2><p>Your board is waiting. Start a game whenever you are ready.</p></div><Link className="button button-primary" to="/computer">Start playing <ArrowRight size={17}/></Link></section>
  </div>;
}
