import { NavLink, Route, Routes, Link, useNavigate } from "react-router-dom";
import { Crown, House, Swords, Users, UsersRound, BookOpen, UserRound, LogOut } from "lucide-react";
import Home from "./pages/Home.jsx";
import PlayComputer from "./pages/PlayComputer.jsx";
import PlayOnline from "./pages/PlayOnline.jsx";
import PlayInPerson from "./pages/PlayInPerson.jsx";
import AuthPage from "./pages/AuthPage.jsx";
import Profile from "./pages/Profile.jsx";
import { useAuth } from "./context/AuthContext.jsx";

function Header() {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();
  const signOut = async () => { await logout(); navigate("/"); };
  const nav = [
    { to: "/", label: "Home", icon: House, end: true },
    { to: "/computer", label: "Play", icon: Swords },
    { to: "/online", label: "Online", icon: Users },
    { to: "/in-person", label: "In person", icon: UsersRound, mobileOnly: true }
  ];
  return <header className="topbar">
    <Link to="/" className="brand"><span className="brand-mark"><Crown size={21}/></span><span>KNIGHTFALL<span className="brand-light"> CHESS</span></span></Link>
    <nav className="nav-links">
      {nav.map(item => <NavLink key={item.to} to={item.to} end={item.end} className={({isActive}) => `nav-link ${item.mobileOnly ? "mobile-only-nav" : ""} ${isActive ? "active" : ""}`}><item.icon size={17}/>{item.label}</NavLink>)}
      <a className="nav-link learn-link" href="/#features"><BookOpen size={17}/> Learn</a>
    </nav>
    {loading ? <span className="profile-button">Loading…</span> : user ? <div className="header-account"><Link to="/profile" className="profile-button"><UserRound size={17}/><span>{user.displayName}</span></Link><button type="button" className="header-logout" title="Log out" aria-label="Log out" onClick={signOut}><LogOut size={15}/></button></div> : <Link to="/login" className="profile-button"><UserRound size={17}/><span>Log in</span></Link>}
  </header>;
}

export default function App() {
  return <div className="app-shell"><Header/><main className="main-content">
    <Routes>
      <Route path="/" element={<Home/>}/>
      <Route path="/computer" element={<PlayComputer/>}/>
      <Route path="/online" element={<PlayOnline/>}/>
      <Route path="/in-person" element={<PlayInPerson/>}/>
      <Route path="/login" element={<AuthPage mode="login"/>}/>
      <Route path="/register" element={<AuthPage mode="register"/>}/>
      <Route path="/profile" element={<Profile/>}/>
      <Route path="*" element={<Home/>}/>
    </Routes>
  </main><footer className="footer"><span>♞ KNIGHTFALL CHESS</span><span>Think clearly. Move boldly.</span><span>Built for the love of the game.</span></footer></div>;
}
