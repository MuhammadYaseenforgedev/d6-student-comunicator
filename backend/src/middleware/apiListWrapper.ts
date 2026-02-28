import type { Request, Response, NextFunction } from "express";

export function apiListWrapper(req: Request, res: Response, next: NextFunction) {
  // Only touch /api requests (this middleware will be mounted under /api anyway,
  // but keeping this check makes it extra safe)
  if (!req.originalUrl.startsWith("/api")) return next();

  const originalJson = res.json.bind(res);

  res.json = ((body: any) => {
    // 1) If handler returned an array, wrap it.
    if (Array.isArray(body)) {
      return originalJson({ value: body, count: body.length });
    }

    // 2) If handler returned { value: [...] } add/normalize count.
    if (body && typeof body === "object" && Array.isArray(body.value)) {
      const cloned: any = { ...body };

      // normalize Count -> count (and remove Count)
      if (typeof cloned.Count === "number" && typeof cloned.count !== "number") {
        cloned.count = cloned.Count;
        delete cloned.Count;
      }

      // if no count provided, compute it
      if (typeof cloned.count !== "number") {
        cloned.count = cloned.value.length;
      }

      return originalJson(cloned);
    }

    // otherwise: leave response unchanged
    return originalJson(body);
  }) as any;

  next();
}
