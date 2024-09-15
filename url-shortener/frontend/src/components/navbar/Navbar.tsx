import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import "./Navbar.css";

const Navbar: React.FC = () => {
  const [isDarkMode, setIsDarkMode] = useState(
    localStorage.getItem("dark-mode") === "true"
  );

  const toggleMode = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedMode = e.target.value === "true";
    setIsDarkMode(() => {
      localStorage.setItem("dark-mode", JSON.stringify(selectedMode));
      return Boolean(selectedMode);
    });
  };

  useEffect(() => {
    if (isDarkMode) {
      document.body.classList.add("dark-mode");
    } else {
      document.body.classList.remove("dark-mode");
    }
  }, [isDarkMode]);

  return (
    <nav className={`navbar ${isDarkMode ? "dark" : "light"}`}>
      <div className="navbar-container">
        <Link to="/" className="navbar-logo">
          URL Shortener
        </Link>
        <select
          onChange={toggleMode}
          value={isDarkMode ? "true" : "false"}
          className="theme-selector"
        >
          <option value="false">Light</option>
          <option value="true">Dark</option>
        </select>
      </div>
    </nav>
  );
};

export default Navbar;
