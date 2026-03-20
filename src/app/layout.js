import '../styles/globals.css';
import { AuthProvider } from '../context/AuthContext';
import { ThemeProvider } from '../context/ThemeContext';
import LayoutWrapper from '../components/layoutWrapper';

const themeInitScript = `
  (function() {
    try {
      const stored = localStorage.getItem('theme') || localStorage.getItem('themePreferred');
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const isDark = stored === 'dark' || stored === 'escuro' || (!stored && prefersDark);
      document.documentElement.classList.toggle('dark', isDark);
    } catch (e) {}
  })();
`;

export const metadata = {
  title: 'Lopesul Dashboard',
  description: 'Painel de gerenciamento de Wi-Fi',
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-br" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body
        className="min-h-screen overflow-x-hidden antialiased
                   bg-[#F0F6FA] text-slate-900
                   dark:bg-[#0f172a] dark:text-slate-100"
      >
        <AuthProvider>
          <ThemeProvider>
            <LayoutWrapper>{children}</LayoutWrapper>
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
