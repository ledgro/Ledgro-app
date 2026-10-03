import fs from 'fs';

let content = `let channel = null;

if (typeof BroadcastChannel !== 'undefined') {
  channel = new BroadcastChannel('ledgro-session');
}

export function broadcastSessionTerminated(uid) {
  if (!channel) return;
  try {
    channel.postMessage({ type: 'SESSION_TERMINATED', uid });
  } catch (err) {
    console.warn('Failed to broadcast session terminated', err);
  }
}

export function broadcastSessionChanged(uid) {
  if (!channel) return;
  try {
    channel.postMessage({ type: 'SESSION_CHANGED', uid });
  } catch (err) {
    console.warn('Failed to broadcast session changed', err);
  }
}

export function listenForSessionEvents(onTerminated, onChanged) {
  if (!channel) return () => {};

  const handleMessage = (event) => {
    if (!event || !event.data) return;

    if (event.data.type === 'SESSION_TERMINATED') {
      if (onTerminated) onTerminated(event.data.uid);
    }
    if (event.data.type === 'SESSION_CHANGED') {
      if (onChanged) onChanged(event.data.uid);
    }
  };

  channel.addEventListener('message', handleMessage);

  return () => {
    channel.removeEventListener('message', handleMessage);
  };
}`;

fs.writeFileSync('src/lib/sessionBroadcast.js', content);
