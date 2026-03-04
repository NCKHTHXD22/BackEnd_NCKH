import React, { createContext, useContext, useState, useEffect } from "react";

// Tạo Context
const ThemeContext = createContext();

// Provider
export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState("light");

  // Load theme từ localStorage khi khởi động
  useEffect(() => {
    const savedTheme = localStorage.getItem("theme") || "light";
    setTheme(savedTheme);
    document.documentElement.classList.add(savedTheme);
  }, []);

  // Khi theme đổi -> update vào localStorage + class html
  useEffect(() => {
    document.documentElement.classList.remove(theme === "light" ? "dark" : "light");
    document.documentElement.classList.add(theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "light" ? "dark" : "light"));
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

// Custom hook
export function useTheme() {
  return useContext(ThemeContext);
}
