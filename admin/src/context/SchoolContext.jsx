import React, { createContext, useContext, useState } from 'react';

const SchoolContext = createContext(null);

export function SchoolProvider({ children }) {
  const [selectedSchool, setSelectedSchool] = useState('all');
  return (
    <SchoolContext.Provider value={{ selectedSchool, setSelectedSchool }}>
      {children}
    </SchoolContext.Provider>
  );
}

export function useSchool() {
  const ctx = useContext(SchoolContext);
  if (!ctx) throw new Error('useSchool must be used within SchoolProvider');
  return ctx;
}
