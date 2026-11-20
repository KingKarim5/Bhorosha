// Express 4 does not catch errors thrown inside async route handlers: a rejected promise would crash the
// process instead of reaching the error handler. This routes every rejection to next(err), so the app's
// error handler answers with a clear message (the same thing the express-async-errors package does).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Layer = require('express/lib/router/layer');

type Next = (err?: unknown) => void;
const patched = Symbol.for('bhorsha.asyncErrors');
if (!Layer.prototype[patched]) {
  Layer.prototype[patched] = true;
  Layer.prototype.handle_request = function handle(req: unknown, res: unknown, next: Next) {
    const fn = this.handle as (a: unknown, b: unknown, c: Next) => unknown;
    if (fn.length > 3) return next(); // error-handling middleware is not a request handler
    try {
      const out = fn(req, res, next);
      if (out && typeof (out as Promise<unknown>).catch === 'function') (out as Promise<unknown>).catch(next);
    } catch (err) {
      next(err);
    }
  };
}

export {};
