#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Starting Link Shortener Development Environment...\n');

// Start backend server
console.log('📡 Starting backend server...');
const backend = spawn('node', ['src/index.js'], {
  cwd: __dirname,
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'development' }
});

// Start frontend server
console.log('🌐 Starting frontend server...');
const frontend = spawn('npm', ['start'], {
  cwd: path.join(__dirname, 'frontend'),
  stdio: 'inherit',
  shell: true
});

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down servers...');
  backend.kill('SIGINT');
  frontend.kill('SIGINT');
  process.exit(0);
});

backend.on('error', (error) => {
  console.error('❌ Backend server error:', error);
});

frontend.on('error', (error) => {
  console.error('❌ Frontend server error:', error);
});

backend.on('exit', (code) => {
  console.log(`📡 Backend server exited with code ${code}`);
});

frontend.on('exit', (code) => {
  console.log(`🌐 Frontend server exited with code ${code}`);
});

console.log('\n✅ Development environment started!');
console.log('📡 Backend: http://localhost:5000');
console.log('🌐 Frontend: http://localhost:3000');
console.log('\nPress Ctrl+C to stop both servers\n');
