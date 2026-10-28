import { NextResponse, type NextRequest } from 'next/server';

// Mirrors the sidebar's role rules (store/auth OPS / ADMIN); pages not listed are open to every signed-in role.
const ROLES: [prefix: string, roles: string[]][] = [
  ['/live', ['ADMIN', 'OPERATOR']],
  ['/violations', ['ADMIN', 'OPERATOR']],
  ['/settings', ['ADMIN']],
];
// Pages anyone can open without signing in.
const PUBLIC = ['/login', '/register', '/home'];

/**
 * `/` is the dashboard for signed-in users and the landing page (/home) for visitors.
 * Signed-out users are sent to /login, roles that can't use a page go to the dashboard. The API still enforces auth.
 */
export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const role = req.cookies.get('stl-role')?.value;
  if (pathname === '/') return role ? NextResponse.next() : NextResponse.rewrite(new URL('/home', req.url));
  if (PUBLIC.includes(pathname)) return NextResponse.next();
  if (!role) {
    const url = new URL('/login', req.url);
    url.searchParams.set('from', pathname + search);
    return NextResponse.redirect(url);
  }
  const rule = ROLES.find(([p]) => pathname === p || pathname.startsWith(`${p}/`));
  if (rule && !rule[1].includes(role)) return NextResponse.redirect(new URL('/', req.url));
  return NextResponse.next();
}

// Skip Next internals, the MSW worker and other static files.
export const config = { matcher: ['/((?!_next/|api/|.*\\..*).*)'] };
