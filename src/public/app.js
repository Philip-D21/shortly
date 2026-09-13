/**
 * SHO.RTLY Client Application JS
 * Handles authentication state, URL shortening API calls, QR downloads, dashboard stats, and toasts.
 */

document.addEventListener('DOMContentLoaded', () => {
  initAuthState();
  initUrlShortenerForm();
  initAuthForms();
  initHistoryPage();
  initDashboardPage();
});

// Authentication State & Token Helpers
function getToken() {
  return localStorage.getItem('shortly_token');
}

function getUser() {
  const userStr = localStorage.getItem('shortly_user');
  return userStr ? JSON.parse(userStr) : null;
}

function setAuth(token, user) {
  localStorage.setItem('shortly_token', token);
  localStorage.setItem('shortly_user', JSON.stringify(user));
  initAuthState();
}

function clearAuth() {
  localStorage.removeItem('shortly_token');
  localStorage.removeItem('shortly_user');
  initAuthState();
}

function initAuthState() {
  const token = getToken();
  const user = getUser();

  const guestNav = document.getElementById('guestNav');
  const userNav = document.getElementById('userNav');
  const userGreeting = document.getElementById('userGreeting');
  const logoutBtn = document.getElementById('logoutBtn');

  if (token && user) {
    if (guestNav) guestNav.classList.add('hidden');
    if (userNav) userNav.classList.remove('hidden');
    if (userGreeting) userGreeting.textContent = `Hi, ${user.username || user.email}`;
  } else {
    if (guestNav) guestNav.classList.remove('hidden');
    if (userNav) userNav.classList.add('hidden');
  }

  if (logoutBtn) {
    logoutBtn.onclick = () => {
      clearAuth();
      showToast('Logged out successfully', 'info');
      setTimeout(() => window.location.href = '/', 1000);
    };
  }
}

// Toast Notifications
function showToast(message, type = 'success') {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const iconMap = {
    success: 'fa-circle-check',
    error: 'fa-circle-exclamation',
    info: 'fa-circle-info'
  };

  toast.innerHTML = `
    <i class="fa-solid ${iconMap[type] || 'fa-circle-info'}"></i>
    <span>${message}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(50px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// URL Shortening Form Logic
function initUrlShortenerForm() {
  const form = document.getElementById('shortenForm');
  if (!form) return;

  const resultContainer = document.getElementById('shortenResult');
  const toggleBtn = document.getElementById('toggleAdvanced');
  const advancedPanel = document.getElementById('advancedPanel');

  if (toggleBtn && advancedPanel) {
    toggleBtn.onclick = () => {
      advancedPanel.classList.toggle('hidden');
      toggleBtn.querySelector('i').classList.toggle('fa-chevron-down');
      toggleBtn.querySelector('i').classList.toggle('fa-chevron-up');
    };
  }

  form.onsubmit = async (e) => {
    e.preventDefault();
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;

    try {
      submitBtn.disabled = true;
      submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Shortening...`;

      const longUrl = document.getElementById('longUrlInput').value;
      const customUrlInput = document.getElementById('customAliasInput');
      const customUrl = customUrlInput ? customUrlInput.value.trim() : null;

      const headers = { 'Content-Type': 'application/json' };
      const token = getToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch('/api/url/shorten', {
        method: 'POST',
        headers,
        body: JSON.stringify({ longUrl, customUrl: customUrl || undefined }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to shorten URL');
      }

      const urlData = data.data || data.url;
      renderResultCard(urlData);
      showToast('URL shortened successfully!');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalText;
    }
  };
}

function renderResultCard(data) {
  const resultContainer = document.getElementById('shortenResult');
  if (!resultContainer) return;

  resultContainer.innerHTML = `
    <div class="glass-card result-card">
      <div class="result-header">
        <i class="fa-solid fa-circle-check fa-lg"></i>
        <h3>Your Short URL & QR Code are Ready!</h3>
      </div>
      <div class="result-grid">
        <div class="result-details">
          <div class="form-group">
            <label class="form-label">Short URL</label>
            <div class="url-display-box">
              <a href="${data.shortUrl}" target="_blank" class="short-url-link" id="shortUrlText">${data.shortUrl}</a>
              <button class="btn btn-primary btn-sm" onclick="copyShortUrl('${data.shortUrl}')">
                <i class="fa-regular fa-copy"></i> Copy
              </button>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Original Long URL</label>
            <p style="color: var(--text-muted); word-break: break-all;">${data.longUrl}</p>
          </div>
        </div>

        <div class="qr-container">
          <img src="${data.qrCodeDataUrl}" alt="QR Code" class="qr-image" id="qrImage">
          <button class="btn btn-secondary btn-sm" onclick="downloadQRCode('${data.qrCodeDataUrl}', '${data.shortId}')">
            <i class="fa-solid fa-download"></i> Download QR Code
          </button>
        </div>
      </div>
    </div>
  `;
  resultContainer.scrollIntoView({ behavior: 'smooth' });
}

// Copy & Download Helpers
window.copyShortUrl = function(url) {
  navigator.clipboard.writeText(url).then(() => {
    showToast('Copied to clipboard!');
  }).catch(() => {
    showToast('Failed to copy', 'error');
  });
};

window.downloadQRCode = function(dataUrl, shortId) {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = `shortly-qr-${shortId}.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast('QR Code download started');
};

// Login & Signup Forms Logic
function initAuthForms() {
  const loginForm = document.getElementById('loginForm');
  const signupForm = document.getElementById('signupForm');

  if (loginForm) {
    loginForm.onsubmit = async (e) => {
      e.preventDefault();
      const email = document.getElementById('emailInput').value;
      const password = document.getElementById('passwordInput').value;

      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Login failed');

        setAuth(data.token, data.user);
        showToast('Login successful!');
        setTimeout(() => window.location.href = '/api/auth/dashboard', 800);
      } catch (err) {
        showToast(err.message, 'error');
      }
    };
  }

  if (signupForm) {
    signupForm.onsubmit = async (e) => {
      e.preventDefault();
      const username = document.getElementById('usernameInput').value;
      const email = document.getElementById('emailInput').value;
      const password = document.getElementById('passwordInput').value;

      try {
        const res = await fetch('/api/auth/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, email, password }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Registration failed');

        showToast('Account created! Logging in...');

        // Auto login
        const loginRes = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        const loginData = await loginRes.json();
        if (loginRes.ok) {
          setAuth(loginData.token, loginData.user);
          setTimeout(() => window.location.href = '/api/auth/dashboard', 800);
        } else {
          window.location.href = '/api/auth/login';
        }
      } catch (err) {
        showToast(err.message, 'error');
      }
    };
  }
}

// History Page Logic
async function initHistoryPage() {
  const historyContainer = document.getElementById('historyContainer');
  if (!historyContainer || document.getElementById('clicksChart')) return;

  const user = getUser();
  const token = getToken();

  if (!user || !token) {
    historyContainer.innerHTML = `
      <div class="glass-card text-center" style="text-align: center; padding: 3rem;">
        <i class="fa-solid fa-lock fa-3x" style="color: var(--primary); margin-bottom: 1rem;"></i>
        <h3>Please log in to view your link history</h3>
        <p style="color: var(--text-muted); margin-bottom: 1.5rem;">Access analytics and manage all your shortened links in one place.</p>
        <a href="/api/auth/login" class="btn btn-primary"><i class="fa-solid fa-right-to-bracket"></i> Login Now</a>
      </div>
    `;
    return;
  }

  try {
    const res = await fetch(`/api/auth/link-history/${user.id}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const data = await res.json();
    const urls = data.data || [];

    if (urls.length === 0) {
      historyContainer.innerHTML = `
        <div class="glass-card text-center" style="text-align: center; padding: 3rem;">
          <i class="fa-solid fa-link-slash fa-3x" style="color: var(--text-dim); margin-bottom: 1rem;"></i>
          <h3>No links shortened yet</h3>
          <p style="color: var(--text-muted); margin-bottom: 1.5rem;">Create your first shortened URL to start tracking clicks!</p>
          <a href="/api/url/shorten" class="btn btn-primary"><i class="fa-solid fa-plus"></i> Shorten URL</a>
        </div>
      `;
      return;
    }

    historyContainer.innerHTML = urls.map(url => `
      <div class="history-item">
        <img src="${url.qrCodeDataUrl || '/api/url/qr/' + url.shortId}" alt="QR" class="history-qr-thumb">
        <div class="history-urls">
          <a href="${url.shortUrl}" target="_blank" class="history-short">${url.shortUrl}</a>
          <span class="history-long" title="${url.longUrl}">${url.longUrl}</span>
        </div>
        <div class="history-stats">
          <span class="stat-badge"><i class="fa-solid fa-chart-line"></i> ${url.clicks || 0} Clicks</span>
          <span class="stat-badge"><i class="fa-regular fa-calendar"></i> ${new Date(url.createdAt).toLocaleDateString()}</span>
        </div>
        <div style="display: flex; gap: 0.5rem;">
          <button class="btn btn-secondary btn-sm" onclick="copyShortUrl('${url.shortUrl}')"><i class="fa-regular fa-copy"></i></button>
          <button class="btn btn-secondary btn-sm" onclick="downloadQRCode('${url.qrCodeDataUrl}', '${url.shortId}')"><i class="fa-solid fa-download"></i></button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    historyContainer.innerHTML = `<p style="color: #ef4444;">Failed to load link history: ${err.message}</p>`;
  }
}

// User Dashboard Page Logic
async function initDashboardPage() {
  const chartCanvas = document.getElementById('clicksChart');
  if (!chartCanvas) return;

  const user = getUser();
  const token = getToken();

  if (!user || !token) {
    showToast('Please log in to access your dashboard', 'info');
    setTimeout(() => window.location.href = '/api/auth/login', 1200);
    return;
  }

  try {
    const res = await fetch('/api/auth/dashboard-stats', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) {
      throw new Error('Failed to load dashboard stats');
    }

    const data = await res.json();
    const stats = data.stats || {};
    const userInfo = data.user || {};
    const graphData = data.graphData || { labels: [], data: [] };
    const recentUrls = data.recentUrls || [];

    // Profile Banner Update
    const usernameEl = document.getElementById('profileUsername');
    const emailEl = document.getElementById('profileEmail');
    const joinedEl = document.getElementById('profileJoined');
    const avatarEl = document.getElementById('profileAvatar');

    if (usernameEl) usernameEl.textContent = userInfo.username || 'User Profile';
    if (emailEl) emailEl.textContent = userInfo.email || '';
    if (joinedEl && userInfo.createdAt) {
      const dateStr = new Date(userInfo.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
      joinedEl.textContent = `Member since ${dateStr}`;
    }
    if (avatarEl) {
      const initial = (userInfo.username || userInfo.email || 'U').charAt(0).toUpperCase();
      avatarEl.textContent = initial;
    }

    // Metric Cards Update
    const totalEl = document.getElementById('valTotalUrls');
    const activeEl = document.getElementById('valActiveUrls');
    const inactiveEl = document.getElementById('valInactiveUrls');
    const clicksEl = document.getElementById('valTotalClicks');

    if (totalEl) totalEl.textContent = stats.totalUrls || 0;
    if (activeEl) activeEl.textContent = stats.activeUrls || 0;
    if (inactiveEl) inactiveEl.textContent = stats.inactiveUrls || 0;
    if (clicksEl) clicksEl.textContent = stats.totalClicks || 0;

    // Chart.js Graph Initialization
    const ctx = chartCanvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, 'rgba(6, 182, 212, 0.4)');
    gradient.addColorStop(1, 'rgba(124, 58, 237, 0.02)');

    new Chart(ctx, {
      type: 'line',
      data: {
        labels: graphData.labels.map(l => new Date(l).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })),
        datasets: [{
          label: 'Click Traffic',
          data: graphData.data,
          borderColor: '#06b6d4',
          borderWidth: 3,
          backgroundColor: gradient,
          fill: true,
          tension: 0.4,
          pointBackgroundColor: '#7c3aed',
          pointBorderColor: '#ffffff',
          pointRadius: 5,
          pointHoverRadius: 7
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(15, 23, 42, 0.95)',
            titleColor: '#f8fafc',
            bodyColor: '#06b6d4',
            borderColor: 'rgba(255, 255, 255, 0.1)',
            borderWidth: 1,
            padding: 12
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: { color: '#94a3b8', font: { family: 'Plus Jakarta Sans' } }
          },
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: { precision: 0, color: '#94a3b8', font: { family: 'Plus Jakarta Sans' } }
          }
        }
      }
    });

    // Recent Links Table Update
    const recentContainer = document.getElementById('recentLinksContainer');
    if (recentContainer) {
      if (recentUrls.length === 0) {
        recentContainer.innerHTML = `
          <div style="text-align: center; padding: 2rem; color: var(--text-muted);">
            No shortened URLs created yet.
          </div>
        `;
      } else {
        recentContainer.innerHTML = recentUrls.map(url => {
          const isActive = url.clicks > 0;
          return `
            <div class="history-item">
              <img src="${url.qrCodeDataUrl || '/api/url/qr/' + url.shortId}" alt="QR" class="history-qr-thumb">
              <div class="history-urls">
                <div style="display: flex; align-items: center; gap: 0.75rem;">
                  <a href="${url.shortUrl}" target="_blank" class="history-short">${url.shortUrl}</a>
                  <span class="status-pill ${isActive ? 'status-active' : 'status-inactive'}">
                    ${isActive ? '<i class="fa-solid fa-circle"></i> Active' : '<i class="fa-solid fa-pause"></i> Non-Active'}
                  </span>
                </div>
                <span class="history-long" title="${url.longUrl}">${url.longUrl}</span>
              </div>
              <div class="history-stats">
                <span class="stat-badge"><i class="fa-solid fa-mouse-pointer"></i> ${url.clicks || 0} Clicks</span>
              </div>
              <div style="display: flex; gap: 0.5rem;">
                <button class="btn btn-secondary btn-sm" onclick="copyShortUrl('${url.shortUrl}')"><i class="fa-regular fa-copy"></i></button>
                <button class="btn btn-secondary btn-sm" onclick="downloadQRCode('${url.qrCodeDataUrl}', '${url.shortId}')"><i class="fa-solid fa-download"></i></button>
              </div>
            </div>
          `;
        }).join('');
      }
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}
