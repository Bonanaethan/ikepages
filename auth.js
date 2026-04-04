const AUTH = {
  domain: 'https://ca-central-1iizcbfnw9.auth.ca-central-1.amazoncognito.com',
  clientId: '6gqt0ae6dgqlp4vp8l5hurq0tn',
  redirectUri: 'https://hw.ikids.education/main/index.html',
  logoutUri: 'https://hw.ikids.education/index.html',
  apiBase: 'https://9gz5xa90yd.execute-api.ca-central-1.amazonaws.com/prod',

  loginUrl() {
    return `${this.domain}/login?client_id=${this.clientId}&response_type=token&scope=openid+email+profile&redirect_uri=${encodeURIComponent(this.redirectUri)}`;
  },

  logoutUrl() {
    return `${this.domain}/logout?client_id=${this.clientId}&logout_uri=${encodeURIComponent(this.logoutUri)}`;
  },

  parseTokens() {
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const idToken = params.get('id_token');
    const accessToken = params.get('access_token');
    if (idToken && accessToken) {
      localStorage.setItem('id_token', idToken);
      localStorage.setItem('access_token', accessToken);
      history.replaceState(null, '', window.location.pathname);
    }
  },

  getIdToken() {
    return localStorage.getItem('id_token');
  },

  decodeToken(token) {
    try {
      return JSON.parse(atob(token.split('.')[1]));
    } catch { return null; }
  },

  getUser() {
    const token = this.getIdToken();
    if (!token) return null;
    return this.decodeToken(token);
  },

  getRole() {
    const user = this.getUser();
    if (!user) return null;
    const groups = user['cognito:groups'] || [];
    if (groups.includes('teachers')) return 'teacher';
    if (groups.includes('students')) return 'student';
    return null;
  },

  isTeacher() { return this.getRole() === 'teacher'; },

  isLoggedIn() {
    const token = this.getIdToken();
    if (!token) return false;
    const payload = this.decodeToken(token);
    if (!payload) return false;
    return payload.exp * 1000 > Date.now();
  },

  requireAuth() {
    this.parseTokens();
    if (!this.isLoggedIn()) {
      window.location.href = this.loginUrl();
    }
  },

  logout() {
    localStorage.removeItem('id_token');
    localStorage.removeItem('access_token');
    window.location.href = this.logoutUrl();
  },

  async api(method, path, body) {
    const res = await fetch(this.apiBase + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': this.getIdToken()
      },
      body: body ? JSON.stringify(body) : undefined
    });
    return res.json();
  }
};
