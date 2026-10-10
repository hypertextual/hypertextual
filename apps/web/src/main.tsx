import { invoke } from '@tauri-apps/api/core';
import { enableBenchmark } from './benchmark';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './style.css';

invoke<boolean>('benchmark_enabled').then(enableBenchmark).catch(() => {}).finally(() => {
createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
});
