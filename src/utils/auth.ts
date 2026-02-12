const MEMBER_PASSWORD = import.meta.env.VITE_MEMBER_PASSWORD;

export function checkMemberAuth(request: Request): boolean {
  const cookies = parseCookies(request.headers.get('cookie') || '');
  return cookies.memberAuth === 'true';
}

export function setMemberAuthCookie(): string {
  // In production, add 'Secure' flag to ensure HTTPS-only transmission
  // Example: 'memberAuth=true; Path=/; Max-Age=86400; SameSite=Strict; Secure'
  return 'memberAuth=true; Path=/; Max-Age=86400; SameSite=Strict';
}

export function clearMemberAuthCookie(): string {
  return 'memberAuth=; Path=/; Max-Age=0';
}

export function verifyPassword(password: string): boolean {
  return password === MEMBER_PASSWORD;
}

function parseCookies(cookieString: string): Record<string, string> {
  return cookieString
    .split(';')
    .map(cookie => cookie.trim().split('='))
    .reduce((acc, [key, value]) => {
      if (key && value) {
        acc[key] = value;
      }
      return acc;
    }, {} as Record<string, string>);
}
