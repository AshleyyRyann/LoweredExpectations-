import { NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function NavBar() {
  const { user, logout } = useAuth();
  if (!user) return null;

  return (
    <div className="top-nav">
      <NavLink to="/discover" className="brand">
        Lowered Expectations
      </NavLink>
      <div className="nav-links">
        <NavLink to="/discover" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
          Discover
        </NavLink>
        <NavLink to="/matches" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
          Matches
        </NavLink>
        <NavLink to="/profile" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
          Profile
        </NavLink>
        <button className="nav-logout" onClick={logout}>
          Log out
        </button>
      </div>
    </div>
  );
}
