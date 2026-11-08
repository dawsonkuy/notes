const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};
type Dependencies = {
  authenticate(token: string): Promise<string | null>;
  deleteUser(userId: string): Promise<void>;
};
export function createDeleteAccountHandler(deps: Dependencies) {
  const reply = (status: number, body: object) => new Response(JSON.stringify(body), { status, headers });
  return async (request: Request): Promise<Response> => {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return reply(405, { error: 'Use POST.' });
    const token = /^Bearer\s+(.+)$/i.exec(request.headers.get('Authorization') || '')?.[1];
    if (!token) return reply(401, { error: 'Sign in before deleting your account.' });
    try {
      const userId = await deps.authenticate(token);
      if (!userId) return reply(401, { error: 'Your session expired. Sign in and try again.' });
      const body = await request.json().catch(() => null);
      if (body?.confirmation !== 'DELETE') return reply(400, { error: 'Account deletion must be confirmed.' });
      // Always use the verified token identity. Never accept a user ID from the request.
      await deps.deleteUser(userId);
      return reply(200, { deleted: true });
    } catch {
      return reply(500, { error: 'Account could not be deleted. Please try again.' });
    }
  };
}
