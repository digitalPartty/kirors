/**
 * Admin UI Handler
 * Serves static HTML, CSS, and JavaScript for the credential management interface
 */

// Inline static assets for simplicity
// In production, these could be loaded from separate files or a CDN

const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Kiro Admin - Credential Management</title>
    <link rel="stylesheet" href="/admin/styles.css">
</head>
<body>
    <div id="login-page" class="page">
        <div class="login-container">
            <h1>Kiro Admin</h1>
            <p class="subtitle">Credential Management Portal</p>
            <form id="login-form">
                <div class="form-group">
                    <label for="admin-key">Admin API Key</label>
                    <input type="password" id="admin-key" placeholder="Enter your admin API key" required>
                </div>
                <button type="submit" class="btn btn-primary">Login</button>
                <div id="login-error" class="error-message"></div>
            </form>
        </div>
    </div>
    <div id="dashboard-page" class="page hidden">
        <header class="dashboard-header">
            <h1>Credential Management</h1>
            <button id="logout-btn" class="btn btn-secondary">Logout</button>
        </header>
        <div class="dashboard-content">
            <section class="card">
                <h2>Add New Credential</h2>
                <form id="add-credential-form">
                    <div class="form-row">
                        <div class="form-group">
                            <label for="access-token">Access Token *</label>
                            <input type="text" id="access-token" placeholder="Enter access token" required>
                        </div>
                        <div class="form-group">
                            <label for="refresh-token">Refresh Token</label>
                            <input type="text" id="refresh-token" placeholder="Enter refresh token (optional)">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label for="priority">Priority *</label>
                            <input type="number" id="priority" placeholder="1-100" min="1" max="100" value="50" required>
                        </div>
                        <div class="form-group">
                            <label for="expires-at">Expires At</label>
                            <input type="datetime-local" id="expires-at">
                        </div>
                    </div>
                    <button type="submit" class="btn btn-primary">Add Credential</button>
                </form>
            </section>
            <section class="card">
                <div class="section-header">
                    <h2>Credentials</h2>
                    <button id="refresh-btn" class="btn btn-secondary">Refresh</button>
                </div>
                <div id="credentials-container">
                    <div class="loading">Loading credentials...</div>
                </div>
            </section>
        </div>
        <div id="toast-container"></div>
    </div>
    <script src="/admin/app.js"></script>
</body>
</html>`;

const stylesCss = `:root {
    --primary-color: #2563eb;
    --primary-hover: #1d4ed8;
    --secondary-color: #64748b;
    --secondary-hover: #475569;
    --success-color: #10b981;
    --danger-color: #ef4444;
    --warning-color: #f59e0b;
    --bg-color: #f8fafc;
    --card-bg: #ffffff;
    --text-primary: #0f172a;
    --text-secondary: #64748b;
    --border-color: #e2e8f0;
    --shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1);
    --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1);
}
body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background-color: var(--bg-color);
    color: var(--text-primary);
    line-height: 1.6;
    margin: 0;
    padding: 0;
}
.page { min-height: 100vh; }
.hidden { display: none !important; }
.login-container {
    max-width: 400px;
    margin: 100px auto;
    padding: 40px;
    background: var(--card-bg);
    border-radius: 8px;
    box-shadow: var(--shadow-lg);
}
.login-container h1 {
    font-size: 28px;
    margin-bottom: 8px;
    text-align: center;
}
.subtitle {
    text-align: center;
    color: var(--text-secondary);
    margin-bottom: 32px;
}
.dashboard-header {
    background: var(--card-bg);
    padding: 20px 40px;
    box-shadow: var(--shadow);
    display: flex;
    justify-content: space-between;
    align-items: center;
}
.dashboard-content {
    max-width: 1200px;
    margin: 40px auto;
    padding: 0 40px;
}
.card {
    background: var(--card-bg);
    border-radius: 8px;
    padding: 32px;
    margin-bottom: 32px;
    box-shadow: var(--shadow);
}
.section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;
}
.form-group {
    margin-bottom: 20px;
}
.form-group label {
    display: block;
    margin-bottom: 8px;
    font-weight: 500;
}
.form-group input {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid var(--border-color);
    border-radius: 6px;
    font-size: 14px;
}
.form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
}
.btn {
    padding: 10px 20px;
    border: none;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
}
.btn-primary {
    background-color: var(--primary-color);
    color: white;
}
.btn-secondary {
    background-color: var(--secondary-color);
    color: white;
}
.btn-success {
    background-color: var(--success-color);
    color: white;
}
.btn-danger {
    background-color: var(--danger-color);
    color: white;
}
.btn-small {
    padding: 6px 12px;
    font-size: 13px;
}
.error-message {
    color: var(--danger-color);
    font-size: 14px;
    margin-top: 8px;
}
.loading, .empty-state {
    text-align: center;
    padding: 40px;
    color: var(--text-secondary);
}
.credential-card {
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 20px;
    margin-bottom: 16px;
}
.credential-header {
    display: flex;
    justify-content: space-between;
    margin-bottom: 16px;
}
.status-badge {
    padding: 4px 12px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 500;
}
.status-badge.enabled {
    background-color: #d1fae5;
    color: #065f46;
}
.status-badge.disabled {
    background-color: #fee2e2;
    color: #991b1b;
}
.credential-details {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 16px;
    margin-bottom: 16px;
}
.detail-label {
    font-size: 12px;
    color: var(--text-secondary);
}
.priority-input {
    width: 80px;
    padding: 4px 8px;
    border: 1px solid var(--border-color);
    border-radius: 4px;
}
.credential-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
}
#toast-container {
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 1000;
}
.toast {
    background: var(--card-bg);
    padding: 16px 20px;
    border-radius: 8px;
    box-shadow: var(--shadow-lg);
    margin-bottom: 12px;
    min-width: 300px;
    border-left: 4px solid var(--primary-color);
}
.toast.success { border-left-color: var(--success-color); }
.toast.error { border-left-color: var(--danger-color); }`;

const appJs = `class AdminApp {
    constructor() {
        this.apiKey = null;
        this.baseUrl = window.location.origin;
        this.init();
    }
    init() {
        this.apiKey = localStorage.getItem('adminApiKey');
        if (this.apiKey) {
            this.showDashboard();
        } else {
            this.showLogin();
        }
        this.attachEventListeners();
    }
    attachEventListeners() {
        document.getElementById('login-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleLogin();
        });
        document.getElementById('logout-btn')?.addEventListener('click', () => {
            this.handleLogout();
        });
        document.getElementById('add-credential-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleAddCredential();
        });
        document.getElementById('refresh-btn')?.addEventListener('click', () => {
            this.loadCredentials();
        });
    }
    showLogin() {
        document.getElementById('login-page').classList.remove('hidden');
        document.getElementById('dashboard-page').classList.add('hidden');
    }
    showDashboard() {
        document.getElementById('login-page').classList.add('hidden');
        document.getElementById('dashboard-page').classList.remove('hidden');
        this.loadCredentials();
    }
    async handleLogin() {
        const apiKey = document.getElementById('admin-key').value.trim();
        const errorEl = document.getElementById('login-error');
        if (!apiKey) {
            errorEl.textContent = 'Please enter an API key';
            return;
        }
        try {
            const response = await this.apiCall('/api/admin/credentials', {
                method: 'GET',
                apiKey: apiKey
            });
            if (response.ok) {
                this.apiKey = apiKey;
                localStorage.setItem('adminApiKey', apiKey);
                errorEl.textContent = '';
                this.showDashboard();
            } else {
                errorEl.textContent = 'Invalid API key';
            }
        } catch (error) {
            errorEl.textContent = 'Failed to connect to server';
            console.error('Login error:', error);
        }
    }
    handleLogout() {
        this.apiKey = null;
        localStorage.removeItem('adminApiKey');
        this.showLogin();
    }
    async handleAddCredential() {
        const accessToken = document.getElementById('access-token').value.trim();
        const refreshToken = document.getElementById('refresh-token').value.trim();
        const priority = parseInt(document.getElementById('priority').value);
        const expiresAt = document.getElementById('expires-at').value;
        if (!accessToken) {
            this.showToast('Access token is required', 'error');
            return;
        }
        const credential = {
            accessToken,
            priority,
            disabled: false,
            failureCount: 0
        };
        if (refreshToken) credential.refreshToken = refreshToken;
        if (expiresAt) credential.expiresAt = new Date(expiresAt).toISOString();
        try {
            const response = await this.apiCall('/api/admin/credentials', {
                method: 'POST',
                body: JSON.stringify(credential)
            });
            if (response.ok) {
                this.showToast('Credential added successfully', 'success');
                document.getElementById('add-credential-form').reset();
                document.getElementById('priority').value = '50';
                this.loadCredentials();
            } else {
                const error = await response.json();
                this.showToast(error.message || 'Failed to add credential', 'error');
            }
        } catch (error) {
            this.showToast('Failed to add credential', 'error');
        }
    }
    async loadCredentials() {
        const container = document.getElementById('credentials-container');
        container.innerHTML = '<div class="loading">Loading credentials...</div>';
        try {
            const response = await this.apiCall('/api/admin/credentials', { method: 'GET' });
            if (response.ok) {
                const credentials = await response.json();
                this.renderCredentials(credentials);
            } else {
                container.innerHTML = '<div class="empty-state">Failed to load credentials</div>';
            }
        } catch (error) {
            container.innerHTML = '<div class="empty-state">Failed to load credentials</div>';
        }
    }
    renderCredentials(credentials) {
        const container = document.getElementById('credentials-container');
        if (credentials.length === 0) {
            container.innerHTML = '<div class="empty-state">No credentials configured</div>';
            return;
        }
        credentials.sort((a, b) => b.priority - a.priority);
        container.innerHTML = credentials.map(cred => this.renderCredentialCard(cred)).join('');
        credentials.forEach(cred => this.attachCredentialActions(cred.id));
    }
    renderCredentialCard(cred) {
        const expiresAt = cred.expiresAt ? new Date(cred.expiresAt).toLocaleString() : 'N/A';
        const statusClass = cred.disabled ? 'disabled' : 'enabled';
        const statusText = cred.disabled ? 'Disabled' : 'Enabled';
        return \`<div class="credential-card" data-id="\${cred.id}">
            <div class="credential-header">
                <div class="credential-id">\${cred.id}</div>
                <div class="credential-status">
                    <span class="status-badge \${statusClass}">\${statusText}</span>
                </div>
            </div>
            <div class="credential-details">
                <div class="detail-item">
                    <span class="detail-label">Priority</span>
                    <div style="display: flex; gap: 8px;">
                        <input type="number" class="priority-input" id="priority-\${cred.id}" value="\${cred.priority}" min="1" max="100">
                        <button class="btn btn-small btn-primary" data-action="update-priority">Update</button>
                    </div>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Failure Count</span>
                    <span class="detail-value">\${cred.failureCount || 0}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Expires At</span>
                    <span class="detail-value">\${expiresAt}</span>
                </div>
            </div>
            <div class="credential-actions">
                <button class="btn btn-small btn-secondary" data-action="toggle-enabled">\${cred.disabled ? 'Enable' : 'Disable'}</button>
                <button class="btn btn-small btn-success" data-action="reset-failures">Reset Failures</button>
                <button class="btn btn-small btn-primary" data-action="check-balance">Check Balance</button>
                <button class="btn btn-small btn-danger" data-action="delete">Delete</button>
            </div>
        </div>\`;
    }
    attachCredentialActions(credentialId) {
        const card = document.querySelector(\`[data-id="\${credentialId}"]\`);
        if (!card) return;
        card.querySelector('[data-action="update-priority"]')?.addEventListener('click', () => this.handleUpdatePriority(credentialId));
        card.querySelector('[data-action="toggle-enabled"]')?.addEventListener('click', () => this.handleToggleEnabled(credentialId));
        card.querySelector('[data-action="reset-failures"]')?.addEventListener('click', () => this.handleResetFailures(credentialId));
        card.querySelector('[data-action="check-balance"]')?.addEventListener('click', () => this.handleCheckBalance(credentialId));
        card.querySelector('[data-action="delete"]')?.addEventListener('click', () => this.handleDeleteCredential(credentialId));
    }
    async handleUpdatePriority(credentialId) {
        const input = document.getElementById(\`priority-\${credentialId}\`);
        const priority = parseInt(input.value);
        try {
            const response = await this.apiCall(\`/api/admin/credentials/\${credentialId}/priority\`, {
                method: 'POST',
                body: JSON.stringify({ priority })
            });
            if (response.ok) {
                this.showToast('Priority updated successfully', 'success');
                this.loadCredentials();
            }
        } catch (error) {
            this.showToast('Failed to update priority', 'error');
        }
    }
    async handleToggleEnabled(credentialId) {
        const card = document.querySelector(\`[data-id="\${credentialId}"]\`);
        const isDisabled = card.querySelector('.status-badge').classList.contains('disabled');
        try {
            const response = await this.apiCall(\`/api/admin/credentials/\${credentialId}/disabled\`, {
                method: 'POST',
                body: JSON.stringify({ disabled: !isDisabled })
            });
            if (response.ok) {
                this.showToast(\`Credential \${isDisabled ? 'enabled' : 'disabled'} successfully\`, 'success');
                this.loadCredentials();
            }
        } catch (error) {
            this.showToast('Failed to toggle credential', 'error');
        }
    }
    async handleResetFailures(credentialId) {
        try {
            const response = await this.apiCall(\`/api/admin/credentials/\${credentialId}/reset\`, { method: 'POST' });
            if (response.ok) {
                this.showToast('Failure count reset successfully', 'success');
                this.loadCredentials();
            }
        } catch (error) {
            this.showToast('Failed to reset failures', 'error');
        }
    }
    async handleCheckBalance(credentialId) {
        try {
            const response = await this.apiCall(\`/api/admin/credentials/\${credentialId}/balance\`, { method: 'GET' });
            if (response.ok) {
                const balance = await response.json();
                const message = \`Total: \${balance.total || 'N/A'} | Used: \${balance.used || 'N/A'} | Remaining: \${balance.remaining || 'N/A'}\`;
                this.showToast(message, 'success');
            }
        } catch (error) {
            this.showToast('Failed to check balance', 'error');
        }
    }
    async handleDeleteCredential(credentialId) {
        if (!confirm(\`Are you sure you want to delete credential \${credentialId}?\`)) return;
        try {
            const response = await this.apiCall(\`/api/admin/credentials/\${credentialId}\`, { method: 'DELETE' });
            if (response.ok) {
                this.showToast('Credential deleted successfully', 'success');
                this.loadCredentials();
            }
        } catch (error) {
            this.showToast('Failed to delete credential', 'error');
        }
    }
    async apiCall(endpoint, options = {}) {
        const headers = {
            'Content-Type': 'application/json',
            'x-api-key': options.apiKey || this.apiKey
        };
        const fetchOptions = {
            method: options.method || 'GET',
            headers
        };
        if (options.body) fetchOptions.body = options.body;
        return fetch(\`\${this.baseUrl}\${endpoint}\`, fetchOptions);
    }
    showToast(message, type = 'success') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = \`toast \${type}\`;
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => container.removeChild(toast), 300);
        }, 5000);
    }
}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new AdminApp());
} else {
    new AdminApp();
}`;

/**
 * Handle requests to the Admin UI routes
 * Serves static assets for the credential management interface
 */
export async function handleAdminUI(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  // Serve the main HTML page
  if (path === '/admin' || path === '/admin/') {
    return new Response(indexHtml, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  }

  // Serve CSS
  if (path === '/admin/styles.css') {
    return new Response(stylesCss, {
      headers: {
        'Content-Type': 'text/css; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  }

  // Serve JavaScript
  if (path === '/admin/app.js') {
    return new Response(appJs, {
      headers: {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  }

  // 404 for unknown admin routes
  return new Response('Not Found', { status: 404 });
}
