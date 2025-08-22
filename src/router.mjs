export function notFound() {
  return new Response(JSON.stringify({ error: "not_found" }), {
    status: 404,
    headers: { "content-type": "application/json" },
  });
}

export function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function createRouter(routes) {
  return async (req, env, deps) => {
    const url = new URL(req.url);
    const method = req.method.toUpperCase();
    for (const r of routes) {
      if (r.method === method) {
        const m = url.pathname.match(r.path);
        if (m) {
          return r.handler(req, env, deps);
        }
      }
    }
    return notFound();
  };
}
