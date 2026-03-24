import React, { createContext, useContext, useState } from 'react';

type Tab = 'dashboard' | 'tenants' | 'properties' | 'invoices' | 'settings';

interface AppContextType {
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
}

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  return (
    <AppContext.Provider value={{ activeTab, setActiveTab }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
