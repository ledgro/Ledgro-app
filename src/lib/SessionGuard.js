export class SessionGuard {
  constructor() {
    this.activeUid = null;
    this.isLocked = false;

    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel('ledgro_session_guard');
      this.channel.onmessage = this.handleMessage.bind(this);
    } else {
      this.channel = null;
    }
  }

  bindSession(uid) {
    if (!uid || uid === this.activeUid) return;
    this.activeUid = uid;
    this.isLocked = false;
    if (this.channel) {
      this.channel.postMessage({ type: 'SESSION_CHANGED', uid });
    }
  }

  unbindSession() {
    this.activeUid = null;
  }

  handleMessage(event) {
    if (!event || !event.data) return;
    const { type, uid } = event.data;
    if (type === 'SESSION_CHANGED' && uid !== this.activeUid && this.activeUid !== null) {
      this.lockTabContext();
    }
  }

  lockTabContext() {
    this.isLocked = true;
    window.location.reload();
  }

  assertValidSession(draftCreatorUid) {
    if (this.isLocked || (this.activeUid && this.activeUid !== draftCreatorUid)) {
      throw new Error('SESSION_LOCKED: Cross-tab identity mismatch detected. Please reload.');
    }
  }

  destroy() {
    if (this.channel) {
      this.channel.close();
    }
  }
}

export const sessionGuard = new SessionGuard();
