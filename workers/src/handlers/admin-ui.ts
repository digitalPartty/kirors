/**
 * Admin UI Handler
 * Serves static HTML, CSS, and JavaScript for the credential management interface
 * 完全复刻 Rust 版本的 React + Tailwind UI
 */

// 由于 Cloudflare Workers 的限制，我们需要将静态资源内联
// 这些内容来自 admin-ui 目录下的文件

const indexHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Kiro Admin - 凭据管理</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
        tailwind.config = {
            darkMode: 'class',
            theme: {
                extend: {
                    colors: {
                        border: 'hsl(214.3 31.8% 91.4%)',
                        input: 'hsl(214.3 31.8% 91.4%)',
                        ring: 'hsl(222.2 84% 4.9%)',
                        background: 'hsl(0 0% 100%)',
                        foreground: 'hsl(222.2 84% 4.9%)',
                        primary: {
                            DEFAULT: 'hsl(222.2 47.4% 11.2%)',
                            foreground: 'hsl(210 40% 98%)',
                        },
                        secondary: {
                            DEFAULT: 'hsl(210 40% 96.1%)',
                            foreground: 'hsl(222.2 47.4% 11.2%)',
                        },
                        destructive: {
                            DEFAULT: 'hsl(0 84.2% 60.2%)',
                            foreground: 'hsl(210 40% 98%)',
                        },
                        muted: {
                            DEFAULT: 'hsl(210 40% 96.1%)',
                            foreground: 'hsl(215.4 16.3% 46.9%)',
                        },
                        success: {
                            DEFAULT: '#10b981',
                            foreground: '#ffffff',
                        }
                    }
                }
            }
        }
    </script>
    <link rel="stylesheet" href="/admin/styles.css">
</head>
<body class="bg-background text-foreground">
    <!-- 登录页面 -->
    <div id="login-page" class="min-h-screen flex items-center justify-center bg-background p-4">
        <div class="w-full max-w-md">
            <div class="bg-white dark:bg-card rounded-lg border border-border shadow-sm">
                <div class="p-6 text-center">
                    <div class="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                        <svg class="h-6 w-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                        </svg>
                    </div>
                    <h1 class="text-2xl font-semibold mb-2">Kiro Admin</h1>
                    <p class="text-sm text-muted-foreground mb-6">请输入 Admin API Key 以访问管理面板</p>
                </div>
                <div class="p-6 pt-0">
                    <form id="login-form" class="space-y-4">
                        <div class="space-y-2">
                            <input 
                                type="password" 
                                id="admin-key" 
                                placeholder="Admin API Key"
                                autocomplete="current-password"
                                class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 text-center"
                                required
                            >
                        </div>
                        <button type="submit" class="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 w-full">
                            登录
                        </button>
                        <div id="login-error" class="text-sm text-destructive text-center"></div>
                    </form>
                </div>
            </div>
        </div>
    </div>

    <!-- 管理面板页面 -->
    <div id="dashboard-page" class="hidden min-h-screen bg-background">
        <!-- 顶部导航 -->
        <header class="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div class="container flex h-14 items-center justify-between px-4 md:px-8 mx-auto max-w-7xl">
                <div class="flex items-center gap-2">
                    <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
                    </svg>
                    <span class="font-semibold">Kiro Admin</span>
                </div>
                <div class="flex items-center gap-2">
                    <button id="dark-mode-btn" class="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-10 w-10">
                        <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                        </svg>
                    </button>
                    <button id="refresh-btn" class="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-10 w-10">
                        <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                    </button>
                    <button id="logout-btn" class="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-10 w-10">
                        <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                    </button>
                </div>
            </div>
        </header>

        <!-- 主内容 -->
        <main class="container px-4 md:px-8 py-6 mx-auto max-w-7xl">
            <!-- 统计卡片 -->
            <div class="grid gap-4 md:grid-cols-3 mb-6">
                <div class="rounded-lg border bg-card text-card-foreground shadow-sm">
                    <div class="p-6 flex flex-row items-center justify-between space-y-0 pb-2">
                        <h3 class="tracking-tight text-sm font-medium text-muted-foreground">凭据总数</h3>
                    </div>
                    <div class="p-6 pt-0">
                        <div id="total-count" class="text-2xl font-bold">0</div>
                    </div>
                </div>
                <div class="rounded-lg border bg-card text-card-foreground shadow-sm">
                    <div class="p-6 flex flex-row items-center justify-between space-y-0 pb-2">
                        <h3 class="tracking-tight text-sm font-medium text-muted-foreground">可用凭据</h3>
                    </div>
                    <div class="p-6 pt-0">
                        <div id="available-count" class="text-2xl font-bold text-success">0</div>
                    </div>
                </div>
                <div class="rounded-lg border bg-card text-card-foreground shadow-sm">
                    <div class="p-6 flex flex-row items-center justify-between space-y-0 pb-2">
                        <h3 class="tracking-tight text-sm font-medium text-muted-foreground">当前活跃</h3>
                    </div>
                    <div class="p-6 pt-0">
                        <div id="current-id" class="text-2xl font-bold flex items-center gap-2">
                            <span>-</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 凭据列表 -->
            <div class="space-y-4">
                <div class="flex items-center justify-between">
                    <h2 class="text-xl font-semibold">凭据管理</h2>
                    <button id="add-credential-btn" class="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-4 py-2">
                        <svg class="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                        </svg>
                        添加凭据
                    </button>
                </div>
                <div id="credentials-container" class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    <div class="text-center text-muted-foreground py-8">加载中...</div>
                </div>
            </div>
        </main>
    </div>

    <!-- Toast 通知容器 -->
    <div id="toast-container"></div>

    <!-- 添加凭据对话框 (初始隐藏) -->
    <div id="add-credential-dialog" class="hidden">
        <div class="dialog-overlay"></div>
        <div class="dialog-content w-full max-w-lg p-6">
            <h2 class="text-lg font-semibold mb-4">添加凭据</h2>
            <form id="add-credential-form" class="space-y-4">
                <!-- Refresh Token -->
                <div class="space-y-2">
                    <label class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                        Refresh Token <span class="text-destructive">*</span>
                    </label>
                    <input 
                        type="password" 
                        id="refresh-token" 
                        placeholder="请输入 Refresh Token"
                        autocomplete="off"
                        class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        required
                    >
                    <p class="text-xs text-muted-foreground">用于刷新 Access Token 的凭据</p>
                </div>

                <!-- 认证方式 -->
                <div class="space-y-2">
                    <label class="text-sm font-medium leading-none">认证方式</label>
                    <select 
                        id="auth-method"
                        class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <option value="social">Social（社交账号登录）</option>
                        <option value="idc">IdC/Builder-ID/IAM（企业身份认证）</option>
                    </select>
                    <p class="text-xs text-muted-foreground">选择与 Refresh Token 对应的认证方式</p>
                </div>

                <!-- Region -->
                <div class="space-y-2">
                    <label class="text-sm font-medium leading-none">Region（地域）</label>
                    <input 
                        type="text" 
                        id="region" 
                        placeholder="例如 us-east-1（留空则使用全局配置）"
                        autocomplete="off"
                        class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                    <p class="text-xs text-muted-foreground">用于 OIDC Token 刷新的 AWS 地域</p>
                </div>

                <!-- IdC 字段 (条件显示) -->
                <div id="idc-fields" class="space-y-4 hidden">
                    <div class="space-y-2">
                        <label class="text-sm font-medium leading-none">
                            Client ID <span class="text-destructive">*</span>
                        </label>
                        <input 
                            type="text" 
                            id="client-id" 
                            placeholder="请输入 OIDC Client ID"
                            autocomplete="off"
                            class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                        <p class="text-xs text-muted-foreground">OIDC 应用的客户端标识符</p>
                    </div>
                    <div class="space-y-2">
                        <label class="text-sm font-medium leading-none">
                            Client Secret <span class="text-destructive">*</span>
                        </label>
                        <input 
                            type="password" 
                            id="client-secret" 
                            placeholder="请输入 OIDC Client Secret"
                            autocomplete="off"
                            class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                        <p class="text-xs text-muted-foreground">OIDC 应用的客户端密钥</p>
                    </div>
                </div>

                <!-- 优先级 -->
                <div class="space-y-2">
                    <label class="text-sm font-medium leading-none">优先级</label>
                    <input 
                        type="number" 
                        id="priority" 
                        placeholder="数字越小优先级越高"
                        min="0"
                        value="0"
                        autocomplete="off"
                        class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                    <p class="text-xs text-muted-foreground">数字越小优先级越高，默认为 0</p>
                </div>

                <!-- 按钮 -->
                <div class="flex justify-end gap-2 pt-4">
                    <button type="button" id="cancel-add-btn" class="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2">
                        取消
                    </button>
                    <button type="submit" class="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2">
                        添加
                    </button>
                </div>
            </form>
        </div>
    </div>

    <script src="/admin/app.js"></script>
</body>
</html>`;

/**
 * Handle requests to the Admin UI routes
 * Serves static assets for the credential management interface
 */
export async function handleAdminUI(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  // Serve the main HTML page (使用新的 Tailwind 版本)
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


const stylesCss = `/* Kiro Admin UI Styles - 复刻 Rust 版本 */
* { margin: 0; padding: 0; box-sizing: border-box; }
:root { --background: 0 0% 100%; --foreground: 222.2 84% 4.9%; --card: 0 0% 100%; --card-foreground: 222.2 84% 4.9%; --primary: 222.2 47.4% 11.2%; --primary-foreground: 210 40% 98%; --secondary: 210 40% 96.1%; --secondary-foreground: 222.2 47.4% 11.2%; --muted: 210 40% 96.1%; --muted-foreground: 215.4 16.3% 46.9%; --destructive: 0 84.2% 60.2%; --destructive-foreground: 210 40% 98%; --border: 214.3 31.8% 91.4%; --input: 214.3 31.8% 91.4%; --ring: 222.2 84% 4.9%; --radius: 0.5rem; }
.dark { --background: 222.2 84% 4.9%; --foreground: 210 40% 98%; --card: 222.2 84% 4.9%; --card-foreground: 210 40% 98%; --primary: 210 40% 98%; --primary-foreground: 222.2 47.4% 11.2%; --secondary: 217.2 32.6% 17.5%; --secondary-foreground: 210 40% 98%; --muted: 217.2 32.6% 17.5%; --muted-foreground: 215 20.2% 65.1%; --destructive: 0 62.8% 30.6%; --destructive-foreground: 210 40% 98%; --border: 217.2 32.6% 17.5%; --input: 217.2 32.6% 17.5%; --ring: 212.7 26.8% 83.9%; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
.hidden { display: none !important; }
#toast-container { position: fixed; top: 1rem; right: 1rem; z-index: 9999; display: flex; flex-direction: column; gap: 0.5rem; max-width: 420px; }
.toast { padding: 1rem 1.5rem; border-radius: 0.5rem; background: white; border: 1px solid hsl(var(--border)); box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1); font-size: 0.875rem; line-height: 1.25rem; transition: opacity 0.3s ease; animation: slideIn 0.3s ease; }
@keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
.toast.success { border-left: 4px solid #10b981; }
.toast.error { border-left: 4px solid hsl(var(--destructive)); }
.dialog-overlay { position: fixed; inset: 0; z-index: 50; background-color: rgba(0, 0, 0, 0.5); animation: fadeIn 0.2s ease; }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
.dialog-content { position: fixed; left: 50%; top: 50%; z-index: 51; transform: translate(-50%, -50%); background: white; border-radius: 0.5rem; box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1); animation: scaleIn 0.2s ease; max-height: 90vh; overflow-y: auto; }
@keyframes scaleIn { from { opacity: 0; transform: translate(-50%, -50%) scale(0.95); } to { opacity: 1; transform: translate(-50%, -50%) scale(1); } }
.dark .dialog-content { background: hsl(var(--card)); color: hsl(var(--card-foreground)); }
.dark .toast { background: hsl(var(--card)); color: hsl(var(--card-foreground)); }
@media (max-width: 768px) { #toast-container { left: 1rem; right: 1rem; max-width: none; } .dialog-content { width: calc(100% - 2rem); max-width: none; } }`;


const appJs = `class AdminApp{constructor(){this.apiKey=null;this.baseUrl=window.location.origin;this.darkMode=false;this.init()}init(){this.apiKey=localStorage.getItem('adminApiKey');this.darkMode=localStorage.getItem('darkMode')==='true';if(this.darkMode){document.documentElement.classList.add('dark')}if(this.apiKey){this.showDashboard()}else{this.showLogin()}this.attachEventListeners()}attachEventListeners(){document.getElementById('login-form')?.addEventListener('submit',(e)=>{e.preventDefault();this.handleLogin()});document.getElementById('logout-btn')?.addEventListener('click',()=>{this.handleLogout()});document.getElementById('dark-mode-btn')?.addEventListener('click',()=>{this.toggleDarkMode()});document.getElementById('refresh-btn')?.addEventListener('click',()=>{this.loadCredentials()});document.getElementById('add-credential-btn')?.addEventListener('click',()=>{this.showAddDialog()});document.getElementById('cancel-add-btn')?.addEventListener('click',()=>{this.hideAddDialog()});document.getElementById('add-credential-form')?.addEventListener('submit',(e)=>{e.preventDefault();this.handleAddCredential()});document.getElementById('auth-method')?.addEventListener('change',(e)=>{const idcFields=document.getElementById('idc-fields');if(e.target.value==='idc'){idcFields.classList.remove('hidden');document.getElementById('client-id').required=true;document.getElementById('client-secret').required=true}else{idcFields.classList.add('hidden');document.getElementById('client-id').required=false;document.getElementById('client-secret').required=false}});document.querySelector('#add-credential-dialog .dialog-overlay')?.addEventListener('click',()=>{this.hideAddDialog()})}toggleDarkMode(){this.darkMode=!this.darkMode;document.documentElement.classList.toggle('dark');localStorage.setItem('darkMode',this.darkMode)}showLogin(){document.getElementById('login-page').classList.remove('hidden');document.getElementById('dashboard-page').classList.add('hidden')}showDashboard(){document.getElementById('login-page').classList.add('hidden');document.getElementById('dashboard-page').classList.remove('hidden');this.loadCredentials()}showAddDialog(){document.getElementById('add-credential-dialog').classList.remove('hidden')}hideAddDialog(){document.getElementById('add-credential-dialog').classList.add('hidden');document.getElementById('add-credential-form').reset();document.getElementById('idc-fields').classList.add('hidden')}async handleLogin(){const apiKey=document.getElementById('admin-key').value.trim();const errorEl=document.getElementById('login-error');if(!apiKey){errorEl.textContent='请输入 API Key';return}try{const response=await this.apiCall('/api/admin/credentials',{method:'GET',apiKey:apiKey});if(response.ok){this.apiKey=apiKey;localStorage.setItem('adminApiKey',apiKey);errorEl.textContent='';this.showDashboard()}else{errorEl.textContent='API Key 无效'}}catch(error){errorEl.textContent='无法连接到服务器';console.error('登录错误:',error)}}handleLogout(){this.apiKey=null;localStorage.removeItem('adminApiKey');this.showLogin()}async handleAddCredential(){const refreshToken=document.getElementById('refresh-token').value.trim();const authMethod=document.getElementById('auth-method').value;const clientId=document.getElementById('client-id').value.trim();const clientSecret=document.getElementById('client-secret').value.trim();const priority=parseInt(document.getElementById('priority').value);const region=document.getElementById('region').value.trim();if(!refreshToken){this.showToast('请输入 Refresh Token','error');return}if(authMethod==='idc'&&(!clientId||!clientSecret)){this.showToast('IdC/Builder-ID/IAM 认证需要填写 Client ID 和 Client Secret','error');return}const credential={refreshToken,authMethod,priority:priority||0};if(authMethod==='idc'){credential.clientId=clientId;credential.clientSecret=clientSecret}if(region){credential.region=region}try{const response=await this.apiCall('/api/admin/credentials',{method:'POST',body:JSON.stringify(credential)});if(response.ok){const result=await response.json();this.showToast(result.message||'凭据添加成功','success');this.hideAddDialog();this.loadCredentials()}else{const error=await response.json();this.showToast(error.error?.message||'添加凭据失败','error')}}catch(error){this.showToast('添加凭据失败','error');console.error('添加凭据错误:',error)}}async loadCredentials(){const container=document.getElementById('credentials-container');container.innerHTML='<div class="col-span-full text-center text-muted-foreground py-8">加载中...</div>';try{const response=await this.apiCall('/api/admin/credentials',{method:'GET'});if(response.ok){const data=await response.json();const credentials=data.credentials||data;this.updateStats(data);this.renderCredentials(credentials)}else{container.innerHTML='<div class="col-span-full text-center text-muted-foreground py-8">加载凭据失败</div>'}}catch(error){container.innerHTML='<div class="col-span-full text-center text-muted-foreground py-8">加载凭据失败</div>';console.error('加载凭据错误:',error)}}updateStats(data){document.getElementById('total-count').textContent=data.total||data.length||0;document.getElementById('available-count').textContent=data.available||data.filter(c=>!c.disabled).length||0;const currentIdEl=document.getElementById('current-id');if(data.currentId){currentIdEl.innerHTML=\`<span>#\${data.currentId}</span><span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-success text-success-foreground">活跃</span>\`}else{currentIdEl.innerHTML='<span>-</span>'}}renderCredentials(credentials){const container=document.getElementById('credentials-container');if(credentials.length===0){container.innerHTML='<div class="col-span-full rounded-lg border bg-card text-card-foreground shadow-sm p-8 text-center text-muted-foreground">暂无凭据</div>';return}credentials.sort((a,b)=>a.priority-b.priority);container.innerHTML=credentials.map(cred=>this.renderCredentialCard(cred)).join('');credentials.forEach(cred=>{this.attachCredentialActions(cred.id)})}renderCredentialCard(cred){const statusClass=cred.disabled?'bg-destructive text-destructive-foreground':'bg-success text-success-foreground';const statusText=cred.disabled?'已禁用':'已启用';const authMethodLabel=this.formatAuthMethodLabel(cred.authMethod);const isCurrent=cred.isCurrent?'<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-primary text-primary-foreground ml-2">当前</span>':'';return\`<div class="rounded-lg border bg-card text-card-foreground shadow-sm" data-id="\${cred.id}"><div class="p-6 flex flex-row items-center justify-between space-y-0 pb-2"><h3 class="tracking-tight text-sm font-medium flex items-center">凭据 #\${cred.id}\${isCurrent}</h3><span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold \${statusClass}">\${statusText}</span></div><div class="p-6 pt-0 space-y-4"><div class="grid grid-cols-2 gap-4 text-sm"><div><span class="text-muted-foreground">优先级：</span><span class="font-medium">\${cred.priority}</span></div><div><span class="text-muted-foreground">失败次数：</span><span class="font-medium \${cred.failureCount>0?'text-destructive':''}">\${cred.failureCount||0}</span></div><div><span class="text-muted-foreground">认证方式：</span><span class="font-medium">\${authMethodLabel}</span></div><div><span class="text-muted-foreground">Token 有效期：</span><span class="font-medium">\${this.formatExpiry(cred.expiresAt)}</span></div>\${cred.hasProfileArn?'<div class="col-span-2"><span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-secondary text-secondary-foreground">有 Profile ARN</span></div>':''}</div><div class="flex flex-wrap gap-2 pt-2 border-t"><button data-action="toggle-enabled" class="inline-flex items-center justify-center rounded-md text-xs font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-8 px-3">\${cred.disabled?'启用':'禁用'}</button><button data-action="reset-failures" class="inline-flex items-center justify-center rounded-md text-xs font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-8 px-3" \${cred.failureCount===0?'disabled':''}>重置失败</button><button data-action="check-balance" class="inline-flex items-center justify-center rounded-md text-xs font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-8 px-3">查看余额</button><button data-action="delete" class="inline-flex items-center justify-center rounded-md text-xs font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-destructive text-destructive-foreground hover:bg-destructive/90 h-8 px-3" \${!cred.disabled?'disabled title="需要先禁用凭据才能删除"':''}>删除</button></div></div></div>\`}formatAuthMethodLabel(authMethod){if(!authMethod)return'未知';if(authMethod.toLowerCase()==='idc')return'IdC/Builder-ID/IAM';if(authMethod.toLowerCase()==='social')return'Social';return authMethod}formatExpiry(expiresAt){if(!expiresAt)return'未知';const date=new Date(expiresAt);const now=new Date();const diff=date.getTime()-now.getTime();if(diff<0)return'已过期';const minutes=Math.floor(diff/60000);if(minutes<60)return\`\${minutes} 分钟\`;const hours=Math.floor(minutes/60);if(hours<24)return\`\${hours} 小时\`;return\`\${Math.floor(hours/24)} 天\`}attachCredentialActions(credentialId){const card=document.querySelector(\`[data-id="\${credentialId}"]\`);if(!card)return;card.querySelector('[data-action="toggle-enabled"]')?.addEventListener('click',()=>{this.handleToggleEnabled(credentialId)});card.querySelector('[data-action="reset-failures"]')?.addEventListener('click',()=>{this.handleResetFailures(credentialId)});card.querySelector('[data-action="check-balance"]')?.addEventListener('click',()=>{this.handleCheckBalance(credentialId)});card.querySelector('[data-action="delete"]')?.addEventListener('click',()=>{this.handleDeleteCredential(credentialId)})}async handleToggleEnabled(credentialId){const card=document.querySelector(\`[data-id="\${credentialId}"]\`);const badge=card.querySelector('.inline-flex.items-center.rounded-full');const isDisabled=badge.classList.contains('bg-destructive');try{const response=await this.apiCall(\`/api/admin/credentials/\${credentialId}/disabled\`,{method:'POST',body:JSON.stringify({disabled:!isDisabled})});if(response.ok){const result=await response.json();this.showToast(result.message||\`凭据已\${isDisabled?'启用':'禁用'}\`,'success');this.loadCredentials()}else{const error=await response.json();this.showToast(error.error?.message||'操作失败','error')}}catch(error){this.showToast('操作失败','error');console.error('切换启用状态错误:',error)}}async handleResetFailures(credentialId){try{const response=await this.apiCall(\`/api/admin/credentials/\${credentialId}/reset\`,{method:'POST'});if(response.ok){const result=await response.json();this.showToast(result.message||'失败计数已重置','success');this.loadCredentials()}else{const error=await response.json();this.showToast(error.error?.message||'重置失败','error')}}catch(error){this.showToast('重置失败','error');console.error('重置失败计数错误:',error)}}async handleCheckBalance(credentialId){try{const response=await this.apiCall(\`/api/admin/credentials/\${credentialId}/balance\`,{method:'GET'});if(response.ok){const balance=await response.json();const message=\`订阅: \${balance.subscriptionTitle||'未知'} | 已用: $\${balance.currentUsage?.toFixed(2)||'0.00'} | 限额: $\${balance.usageLimit?.toFixed(2)||'0.00'} | 剩余: $\${balance.remaining?.toFixed(2)||'0.00'} (\${balance.usagePercentage?.toFixed(1)||'0'}%)\`;this.showToast(message,'success',8000)}else{const error=await response.json();this.showToast(error.error?.message||'查询余额失败','error')}}catch(error){this.showToast('查询余额失败','error');console.error('查询余额错误:',error)}}async handleDeleteCredential(credentialId){if(!confirm(\`确定要删除凭据 #\${credentialId} 吗？此操作无法撤销。\`)){return}try{const response=await this.apiCall(\`/api/admin/credentials/\${credentialId}\`,{method:'DELETE'});if(response.ok){const result=await response.json();this.showToast(result.message||'凭据删除成功','success');this.loadCredentials()}else{const error=await response.json();this.showToast(error.error?.message||'删除凭据失败','error')}}catch(error){this.showToast('删除凭据失败','error');console.error('删除凭据错误:',error)}}async apiCall(endpoint,options={}){const headers={'Content-Type':'application/json','x-api-key':options.apiKey||this.apiKey};const fetchOptions={method:options.method||'GET',headers};if(options.body){fetchOptions.body=options.body}return fetch(\`\${this.baseUrl}\${endpoint}\`,fetchOptions)}showToast(message,type='success',duration=5000){const container=document.getElementById('toast-container');const toast=document.createElement('div');toast.className=\`toast \${type}\`;toast.textContent=message;container.appendChild(toast);setTimeout(()=>{toast.style.opacity='0';setTimeout(()=>{if(toast.parentNode){container.removeChild(toast)}},300)},duration)}}if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',()=>{new AdminApp()})}else{new AdminApp()}`;
