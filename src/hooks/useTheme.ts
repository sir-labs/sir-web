import { useState, useEffect } from 'react';

type Theme = 'dark' | 'light';

function getInitialTheme(): Theme {
  const stored = localStorage.getItem('sir-theme');
  return stored === 'dark' || stored === 'light' ? stored : 'light';
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('sir-theme', theme);
  }, [theme]);

  const toggle = () => setTheme(t => (t === 'dark' ? 'light' : 'dark'));

  return { theme, toggle };
}
