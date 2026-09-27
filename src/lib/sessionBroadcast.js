const channel = new BroadcastChannel('ledgro-session');

export function broadcastSessionTerminated() {
  channel.postMessage({ type: 'SESSION_TERMINATED' });
}

export function broadcastSessionChanged(uid) {
  channel.postMessage({ type: 'SESSION_CHANGED', uid });
}

export function listenForSessionEvents(onTerminated, onChanged) {
  channel.onmessage = (event) => {
    if (event.data.type === 'SESSION_TERMINATED') {
      onTerminated();
    }
    if (event.data.type === 'SESSION_CHANGED') {
      onChanged(event.data.uid);
    }
  };
  return () => channel.close();
}
