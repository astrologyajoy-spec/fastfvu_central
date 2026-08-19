const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

// We need to carefully replace the userSession rendering block and remove unused state.
// Since it's a big chunk, we can just rewrite App.tsx to be much cleaner.
const newCode = `import React, { useState } from 'react';
import { Navbar } from './components/Navbar';
import { Hero } from './components/Hero';
import { Features } from './components/Features';
import { HowItWorks } from './components/HowItWorks';
import { ApiPlayground } from './components/ApiPlayground';
import { Pricing } from './components/Pricing';
import { Documentation } from './components/Documentation';
import { AuthModal } from './components/AuthModal';
import { Footer } from './components/Footer';
import { UserDashboard } from './components/UserDashboard';

export default function App() {
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('overview');
  const [userSession, setUserSession] = useState<{ email: string; apiKey: string } | null>(null);

  const handleLoginSuccess = (email: string, apiKey: string) => {
    setUserSession({ email, apiKey });
  };

  if (userSession) {
    return <UserDashboard userSession={userSession} onSignOut={() => setUserSession(null)} />;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-blue-500 selection:text-white">
      <Navbar
        onOpenAuth={() => setAuthModalOpen(true)}
        activeSection={activeSection}
        setActiveSection={setActiveSection}
      />
      <Hero
        onOpenAuth={() => setAuthModalOpen(true)}
        onExplorePlayground={() => {
          const el = document.getElementById('playground');
          if (el) el.scrollIntoView({ behavior: 'smooth' });
        }}
      />
      <Features />
      <HowItWorks />
      <ApiPlayground />
      <Pricing onOpenAuth={() => setAuthModalOpen(true)} />
      <Documentation />
      <Footer />
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onLoginSuccess={handleLoginSuccess}
      />
    </div>
  );
}
`;

fs.writeFileSync('src/App.tsx', newCode);
console.log('App.tsx patched.');
