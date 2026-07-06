const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

type RequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
};

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, body: unknown, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  if (!API_BASE_URL) {
    throw new Error("NEXT_PUBLIC_API_URL is not configured.");
  }

  const baseUrl = API_BASE_URL.replace(/\/$/, "");
  const apiPath = path.startsWith("/") ? path : `/${path}`;

  const response = await fetch(`${baseUrl}${apiPath}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });

  if (!response.ok) {
    let body: unknown = null;
    let message = "Request failed.";

    try {
      body = await response.json();
      const detail = (body as { detail?: string } | null)?.detail;
      if (detail) {
        message = detail;
      }
    } catch {
      message = response.statusText || message;
    }

    throw new ApiError(response.status, body, message);
  }

  return response.json() as Promise<T>;
}
