// ===========================================================
// Family Call — Frontend logic
// Registration + user list + WebRTC video calls via Socket.IO signaling
// ===========================================================

const API_BASE = ''; // same origin
const STUN_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

// ---------- App state ----------
let currentUser = null;      // { id, name, avatar_path }
let socket = null;
let usersById = new Map();   // id -> user object

let pc = null;                // RTCPeerConnection
let localStream = null;
let activeCallPeerId = null;  // the user id we're calling / in call with
let activeCallPeerInfo = null; // { name, avatar_path }
let pendingOffer = null;      // offer received while incoming call is ringing
let callRole = null;          // 'caller' | 'callee'
let micOn = true;
let camOn = true;

// ---------- DOM refs ----------
const screens = {
  register: document.getElementById('screen-register'),
  home: document.getElementById('screen-home'),
  calling: document.getElementById('screen-calling'),
  incoming: document.getElementById('screen-incoming'),
  inCall: document.getElementById('screen-in-call')
};

const el = {
  formRegister: document.getElementById('form-register'),
  inputName: document.getElementById('input-name'),
  inputAvatar: document.getElementById('input-avatar'),
  avatarPreview: document.getElementById('avatar-preview'),
  btnRegister: document.getElementById('btn-register'),
  registerError: document.getElementById('register-error'),

  meName: document.getElementById('me-name'),
  meAvatar: document.getElementById('me-avatar'),
  userList: document.getElementById('user-list'),
  emptyState: document.getElementById('empty-state'),
  onlineCount: document.getElementById('online-count'),

  callingAvatar: document.getElementById('calling-avatar'),
  callingName: document.getElementById('calling-name'),
  btnCancelCall: document.getElementById('btn-cancel-call'),

  incomingAvatar: document.getElementById('incoming-avatar'),
  incomingName: document.getElementById('incoming-name'),
  btnDeclineCall: document.getElementById('btn-decline-call'),
  btnAcceptCall: document.getElementById('btn-accept-call'),

  videoLocal: document.getElementById('video-local'),
  videoRemote: document.getElementById('video-remote'),
  inCallName: document.getElementById('in-call-name'),
  btnEndCall: document.getElementById('btn-end-call'),
  btnToggleMic: document.getElementById('btn-toggle-mic'),
  btnToggleCam: document.getElementById('btn-toggle-cam'),

  toast: document.getElementById('toast')
};

// ---------- Utilities ----------
function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[name].classList.add('active');
}

let toastTimer = null;
function showToast(msg) {
  el.toast.textContent = msg;
  el.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove('show'), 3200);
}

function avatarStyle(avatarPath) {
  if (avatarPath) return `background-image: url('${avatarPath}')`;
  return '';
}

function initials(name) {
  return (name || '?').trim().charAt(0).toUpperCase();
}

// ---------- Registration ----------
let selectedAvatarFile = null;

el.inputAvatar.addEventListener('change', () => {
  const file = el.inputAvatar.files[0];
  if (!file) return;
  selectedAvatarFile = file;
  const reader = new FileReader();
  reader.onload = (e) => {
    el.avatarPreview.style.backgroundImage = `url('${e.target.result}')`;
    el.avatarPreview.innerHTML = '';
  };
  reader.readAsDataURL(file);
});

el.formRegister.addEventListener('submit', async (e) => {
  e.preventDefault();
  el.registerError.textContent = '';
  const name = el.inputName.value.trim();
  if (!name) return;

  el.btnRegister.disabled = true;
  el.btnRegister.textContent = 'كيتسجل...';

  try {
    const formData = new FormData();
    formData.append('name', name);
    if (selectedAvatarFile) formData.append('avatar', selectedAvatarFile);

    const res = await fetch(`${API_BASE}/api/users/register`, {
      method: 'POST',
      body: formData
    });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'فشل التسجيل');

    currentUser = data.user;
    localStorage_setUser(currentUser);
    enterApp();
  } catch (err) {
    console.error(err);
    el.registerError.textContent = err.message || 'وقع خطأ، عاود حاول';
  } finally {
    el.btnRegister.disabled = false;
    el.btnRegister.textContent = 'دخول';
  }
});

// Simple persistence so a refresh doesn't force re-registration
function localStorage_setUser(user) {
  try { localStorage.setItem('familycall_user', JSON.stringify(user)); } catch (e) {}
}
function localStorage_getUser() {
  try {
    const raw = localStorage.getItem('familycall_user');
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

// ---------- Enter app after registration ----------
function enterApp() {
  el.meName.textContent = currentUser.name;
  el.meAvatar.style.backgroundImage = avatarStyleUrl(currentUser.avatar_path);
  showScreen('home');
  connectSocket();
  loadUsers();
}

function avatarStyleUrl(path) {
  return path ? `url('${path}')` : '';
}

// ---------- Load & render users ----------
async function loadUsers() {
  try {
    const res = await fetch(`${API_BASE}/api/users`);
    const data = await res.json();
    renderUsers(data.users || []);
  } catch (err) {
    console.error('loadUsers error', err);
  }
}

function renderUsers(users) {
  usersById.clear();
  const others = users.filter(u => u.id !== currentUser.id);
  others.forEach(u => usersById.set(String(u.id), u));

  el.userList.innerHTML = '';
  el.emptyState.hidden = others.length > 0;

  const onlineCount = others.filter(u => u.status === 'online').length;
  el.onlineCount.textContent = `${onlineCount} متصل`;

  others.forEach(user => {
    const row = document.createElement('div');
    row.className = 'user-row';

    const statusLabel = {
      online: 'متصل دابا',
      offline: 'غير متصل',
      in_call: 'فمكالمة'
    }[user.status] || 'غير متصل';

    row.innerHTML = `
      <div class="user-row__avatar" style="${avatarStyle(user.avatar_path)}">
        <span class="user-row__status-dot ${user.status === 'online' ? 'online' : user.status === 'in_call' ? 'in_call' : ''}"></span>
      </div>
      <div class="user-row__info">
        <div class="user-row__name">${escapeHtml(user.name)}</div>
        <div class="user-row__status-text">${statusLabel}</div>
      </div>
      <button class="user-row__call-btn" data-user-id="${user.id}" ${user.status !== 'online' ? 'disabled' : ''} title="اتصال فيديو">
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="2" y="6" width="14" height="12" rx="3" stroke="currentColor" stroke-width="1.8"/>
          <path d="M16 10l6-3.5v11L16 14" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
        </svg>
      </button>
    `;

    row.querySelector('.user-row__call-btn').addEventListener('click', () => {
      startCall(user);
    });

    el.userList.appendChild(row);
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---------- Socket.IO connection ----------
function connectSocket() {
  socket = io();

  socket.on('connect', () => {
    socket.emit('identify', { userId: currentUser.id });
  });

  socket.on('users:update', (users) => {
    renderUsers(users);
  });

  socket.on('call:incoming', async ({ fromUserId, fromName, fromAvatar, offer }) => {
    // If already in a call, auto-decline
    if (activeCallPeerId) {
      socket.emit('call:decline', { toUserId: fromUserId, fromUserId: currentUser.id, reason: 'busy' });
      return;
    }
    pendingOffer = offer;
    activeCallPeerId = String(fromUserId);
    activeCallPeerInfo = { name: fromName, avatar_path: fromAvatar };
    callRole = 'callee';

    el.incomingAvatar.style.backgroundImage = avatarStyle(fromAvatar).replace('background-image: ', '');
    el.incomingAvatar.style.cssText = avatarStyle(fromAvatar);
    el.incomingName.textContent = fromName;
    showScreen('incoming');
  });

  socket.on('call:accepted', async ({ fromUserId, answer }) => {
    if (String(fromUserId) !== activeCallPeerId) return;
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
      enterInCallScreen();
    } catch (err) {
      console.error('Error setting remote description', err);
      showToast('وقع خطأ فالاتصال');
      teardownCall();
    }
  });

  socket.on('call:declined', ({ fromUserId, reason }) => {
    if (String(fromUserId) !== activeCallPeerId) return;
    showToast(reason === 'busy' ? 'الشخص فمكالمة أخرى' : 'المكالمة تّرفضات');
    teardownCall();
    showScreen('home');
  });

  socket.on('call:cancelled', ({ fromUserId }) => {
    if (String(fromUserId) !== activeCallPeerId) return;
    showToast('المكالمة تلغات');
    teardownCall();
    showScreen('home');
  });

  socket.on('call:ended', ({ fromUserId }) => {
    if (String(fromUserId) !== activeCallPeerId) return;
    showToast('المكالمة سالات');
    teardownCall();
    showScreen('home');
  });

  socket.on('call:unavailable', ({ toUserId }) => {
    if (String(toUserId) !== activeCallPeerId) return;
    showToast('الشخص ماشي متصل دابا');
    teardownCall();
    showScreen('home');
  });

  socket.on('call:ice-candidate', async ({ fromUserId, candidate }) => {
    if (String(fromUserId) !== activeCallPeerId || !pc) return;
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.error('Error adding ICE candidate', err);
    }
  });
}

// ---------- WebRTC: create peer connection ----------
function createPeerConnection(peerId) {
  const connection = new RTCPeerConnection(STUN_SERVERS);

  connection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('call:ice-candidate', {
        toUserId: peerId,
        fromUserId: currentUser.id,
        candidate: event.candidate
      });
    }
  };

  connection.ontrack = (event) => {
    if (el.videoRemote.srcObject !== event.streams[0]) {
      el.videoRemote.srcObject = event.streams[0];
    }
  };

  connection.onconnectionstatechange = () => {
    if (['disconnected', 'failed', 'closed'].includes(connection.connectionState)) {
      if (activeCallPeerId) {
        // Only auto-teardown if we're still mid-call
      }
    }
  };

  return connection;
}

async function getLocalStream() {
  if (localStream) return localStream;
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  el.videoLocal.srcObject = localStream;
  return localStream;
}

// ---------- Start outgoing call ----------
async function startCall(user) {
  if (activeCallPeerId) return; // already in a call flow

  try {
    activeCallPeerId = String(user.id);
    activeCallPeerInfo = user;
    callRole = 'caller';

    el.callingAvatar.style.cssText = avatarStyle(user.avatar_path);
    el.callingName.textContent = user.name;
    showScreen('calling');

    await getLocalStream();
    pc = createPeerConnection(user.id);
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    socket.emit('call:invite', {
      toUserId: user.id,
      fromUserId: currentUser.id,
      fromName: currentUser.name,
      fromAvatar: currentUser.avatar_path,
      offer
    });
  } catch (err) {
    console.error('startCall error', err);
    showToast('ماقدرناش نوصلو للكاميرا/الميكروفون');
    teardownCall();
    showScreen('home');
  }
}

el.btnCancelCall.addEventListener('click', () => {
  if (activeCallPeerId) {
    socket.emit('call:cancel', { toUserId: activeCallPeerId, fromUserId: currentUser.id });
  }
  teardownCall();
  showScreen('home');
});

// ---------- Handle incoming call: accept / decline ----------
el.btnAcceptCall.addEventListener('click', async () => {
  if (!pendingOffer || !activeCallPeerId) return;
  try {
    await getLocalStream();
    pc = createPeerConnection(activeCallPeerId);
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

    await pc.setRemoteDescription(new RTCSessionDescription(pendingOffer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    socket.emit('call:accept', {
      toUserId: activeCallPeerId,
      fromUserId: currentUser.id,
      answer
    });

    pendingOffer = null;
    enterInCallScreen();
  } catch (err) {
    console.error('accept call error', err);
    showToast('ماقدرناش نوصلو للكاميرا/الميكروفون');
    socket.emit('call:decline', { toUserId: activeCallPeerId, fromUserId: currentUser.id, reason: 'error' });
    teardownCall();
    showScreen('home');
  }
});

el.btnDeclineCall.addEventListener('click', () => {
  if (activeCallPeerId) {
    socket.emit('call:decline', { toUserId: activeCallPeerId, fromUserId: currentUser.id, reason: 'rejected' });
  }
  teardownCall();
  showScreen('home');
});

// ---------- In-call screen ----------
function enterInCallScreen() {
  el.inCallName.textContent = activeCallPeerInfo ? activeCallPeerInfo.name : '';
  showScreen('inCall');
}

el.btnEndCall.addEventListener('click', () => {
  if (activeCallPeerId) {
    socket.emit('call:end', { toUserId: activeCallPeerId, fromUserId: currentUser.id });
  }
  teardownCall();
  showScreen('home');
});

el.btnToggleMic.addEventListener('click', () => {
  if (!localStream) return;
  micOn = !micOn;
  localStream.getAudioTracks().forEach(t => t.enabled = micOn);
  el.btnToggleMic.classList.toggle('is-active', !micOn);
});

el.btnToggleCam.addEventListener('click', () => {
  if (!localStream) return;
  camOn = !camOn;
  localStream.getVideoTracks().forEach(t => t.enabled = camOn);
  el.btnToggleCam.classList.toggle('is-active', !camOn);
});

// ---------- Teardown ----------
function teardownCall() {
  if (pc) {
    pc.onicecandidate = null;
    pc.ontrack = null;
    pc.close();
    pc = null;
  }
  if (localStream) {
    localStream.getTracks().forEach(t => t.stop());
    localStream = null;
  }
  el.videoLocal.srcObject = null;
  el.videoRemote.srcObject = null;

  activeCallPeerId = null;
  activeCallPeerInfo = null;
  pendingOffer = null;
  callRole = null;
  micOn = true;
  camOn = true;
  el.btnToggleMic.classList.remove('is-active');
  el.btnToggleCam.classList.remove('is-active');
}

// ---------- Boot ----------
(function boot() {
  const saved = localStorage_getUser();
  if (saved && saved.id) {
    currentUser = saved;
    enterApp();
  } else {
    showScreen('register');
  }
})();
