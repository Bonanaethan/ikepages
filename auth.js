const AUTH = {
  domain: 'https://ca-central-1iizcbfnw9.auth.ca-central-1.amazoncognito.com',
  clientId: '6gqt0ae6dgqlp4vp8l5hurq0tn',
  redirectUri: 'https://hw.ikids.education/main/index.html',
  logoutUri: 'https://hw.ikids.education/index.html',

  loginUrl() {
    return `${this.domain}/login?client_id=${this.clientId}&response_type=token&scope=openid+email+profile&redirect_uri=${encodeURIComponent(this.redirectUri)}`;
  },

  logoutUrl() {
    return `${this.domain}/logout?client_id=${this.clientId}&logout_uri=${encodeURIComponent(this.logoutUri)}`;
  },

  // Parse tokens from URL hash after Cognito redirect
  parseTokens() {
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const idToken = params.get('id_token');
    const accessToken = params.get('access_token');
    if (idToken && accessToken) {
      localStorage.setItem('id_token', idToken);
      localStorage.setItem('access_token', accessToken);
      // Clean the URL
      history.replaceState(null, '', window.location.pathname);
    }
  },

  getIdToken() {
    return localStorage.getItem('id_token');
  },

  // Decode JWT payload (no verification — client side only)
  decodeToken(token) {
    try {
      return JSON.parse(atob(token.split('.')[1]));
    } catch { return null; }
  },

  isLoggedIn() {
    const token = this.getIdToken();
    if (!token) return false;
    const payload = this.decodeToken(token);
    if (!payload) return false;
    // Check expiry
    return payload.exp * 1000 > Date.now();
  },

  getUser() {
    const token = this.getIdToken();
    if (!token) return null;
    return this.decodeToken(token);
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
  }
};
