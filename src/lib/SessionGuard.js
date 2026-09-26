export class SessionGuard {
  constructor() {
    this.activeUid = null;
    this.isLocked = false;
    this.channel = new BroadcastChannel('ledgro_session_guard');
    this.channel.onmessage = this.handleMessage.bind(this);
  }

  bindSession(uid) {
    if (!uid) return;
    this.activeUid = uid;
    this.isLocked = false;
    this.channel.postMessage({ type: 'SESSION_CHANGED', uid });
  }

  handleMessage(event) {
    const { type, uid } = event.data;
    if (type === 'SESSION_CHANGED' && uid !== this.activeUid && this.activeUid !== null) {
      this.lockTabContext();
    }
  }

  lockTabContext() {
    this.isLocked = true;
    window.dispatchEvent(new CustomEvent('session:hard_lock'));
    // Disable inputs and show overlay (handled by an ErrorBoundary or App root)
  }

  assertValidSession(draftCreatorUid) {
    if (this.isLocked || (this.activeUid && this.activeUid !== draftCreatorUid)) {
      throw new Error('SESSION_LOCKED: Cross-tab identity mismatch detected. Please reload.');
    }
  }
}

export const sessionGuard = new SessionGuard();
