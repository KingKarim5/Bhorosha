import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from './config';

export interface AuthUser {
  id: string;
  role: 'lender' | 'investor' | 'admin';
  email: string;
  display_name: string;
  org_name?: string; // lenders: institution name
  apply_code?: string; // lenders: owner application link code
}

/** The session payload for a user document. */
export function sessionUser(u: { _id: unknown; role: string; email: string; display_name?: string | null; org_name?: string | null; apply_code?: string | null }): AuthUser {
  return { id: String(u._id), role: u.role as AuthUser['role'], email: u.email, display_name: u.display_name || u.email, ...(u.role === 'lender' ? { org_name: u.org_name || undefined, apply_code: u.apply_code || undefined } : {}) };
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}

export const COOKIE = 'bhorsha_session';

export function sign(u: AuthUser) {
  return jwt.sign(u, config.jwtSecret, { expiresIn: '12h' });
}

export function cookieOpts() {
  return { httpOnly: true, sameSite: config.cookieSameSite, secure: config.cookieSecure, maxAge: 12 * 3600 * 1000, path: '/' } as const;
}

export function attachUser(req: Request, _res: Response, next: NextFunction) {
  const hdr = req.headers.authorization;
  const tok = req.cookies?.[COOKIE] || (hdr?.startsWith('Bearer ') ? hdr.slice(7) : null);
  if (tok) {
    try {
      req.user = jwt.verify(tok, config.jwtSecret) as AuthUser;
    } catch {
      /* expired or invalid: treat as logged out */
    }
  }
  next();
}

export function requireRole(...roles: AuthUser['role'][]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Please log in.' });
    if (roles.length && !roles.includes(req.user.role)) return res.status(403).json({ error: 'This page is not available for your role.' });
    next();
  };
}
