export interface Env {
  DB: D1Database;
  GITHUB_TOKEN: string;
  GITHUB_REPOSITORY: string;
  ASSETS: Fetcher;
  ACCESS_TEAM_DOMAIN: string;
  ACCESS_AUD: string;
  ADMIN_EMAILS: string;
  MAX_UPLOAD_BYTES?: string;
}
type Identity = { email: string; sub: string };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
const now = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;
function b64url(input: string) { return btoa(input).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_'); }
function decodePart(part: string): any { return JSON.parse(atob(part.replace(/-/g,'+').replace(/_/g,'/') + '='.repeat((4-part.length%4)%4))); }
async function identityFromAccess(request: Request, env: Env): Promise<Identity | null> {
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token || !env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return null;
  try {
    const [headerPart,payloadPart,signaturePart] = token.split('.');
    if (!headerPart || !payloadPart || !signaturePart) return null;
    const header = decodePart(headerPart); const claims = decodePart(payloadPart);
    if (header.alg !== 'RS256' || typeof header.kid !== 'string') return null;
    const issuer = env.ACCESS_TEAM_DOMAIN.replace(/\/$/,'');
    if (claims.iss !== issuer || !Array.isArray(claims.aud) && claims.aud !== env.ACCESS_AUD) return null;
    if (Array.isArray(claims.aud) && !claims.aud.includes(env.ACCESS_AUD)) return null;
    const exp = Number(claims.exp); const nbf = Number(claims.nbf || 0);
    if (!Number.isFinite(exp) || exp <= Date.now()/1000 || nbf > Date.now()/1000) return null;
    const jwksResponse = await fetch(`${issuer}/cdn-cgi/access/certs`, { cf: { cacheTtl: 300, cacheEverything: true } });
    if (!jwksResponse.ok) return null;
    const jwks = await jwksResponse.json() as { keys?: JsonWebKey[] & Array<{kid?:string,alg?:string,use?:string}> };
    const jwk = jwks.keys?.find(k => k.kid === header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey('jwk', jwk, { name:'RSASSA-PKCS1-v1_5', hash:'SHA-256' }, false, ['verify']);
    const signature = Uint8Array.from(atob(signaturePart.replace(/-/g,'+').replace(/_/g,'/') + '='.repeat((4-signaturePart.length%4)%4)), c=>c.charCodeAt(0));
    const data = new TextEncoder().encode(`${headerPart}.${payloadPart}`);
    if (!await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, data)) return null;
    const email = typeof claims.email === 'string' ? claims.email.toLowerCase() : '';
    const sub = typeof claims.sub === 'string' ? claims.sub : '';
    if (!email || !sub) return null;
    return { email, sub };
  } catch { return null; }
}
async function audit(env: Env, actor: string, action: string, type: string, objectId: string, details: Record<string,unknown> = {}) {
  await env.DB.prepare('INSERT INTO audit_events (id, actor, action, object_type, object_id, details_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(id('audit'),actor,action,type,objectId,JSON.stringify(details),now()).run();
}
function safeFilename(name: string) { return name.replace(/[\\/\x00-\x1f\x7f]/g,'_').slice(0,180) || 'evidence.bin'; }
function githubRepo(env: Env) {
  const value = (env.GITHUB_REPOSITORY || '').trim();
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value) || !env.GITHUB_TOKEN) throw new Error('GitHub evidence storage is not configured.');
  return value;
}
function githubHeaders(env: Env, accept = 'application/vnd.github+json') {
  return { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: accept, 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'DIW-Advanced-Evidence-Vault' };
}
function githubContentsUrl(env: Env, path: string) {
  const repo = githubRepo(env);
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  return `https://api.github.com/repos/${repo}/contents/${encodedPath}`;
}
function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + 0x8000, bytes.length)));
  return btoa(binary);
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/health' && request.method === 'GET') return json({ service:'diw-advanced', status:'ok', time:now() });
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    if (request.method === 'OPTIONS') return new Response(null,{status:204,headers:{'allow':'GET, POST, OPTIONS','cache-control':'no-store'}});
    const user = await identityFromAccess(request,env);
    if (!user) return json({ error:'Authentication required. Configure Cloudflare Access and Worker JWT settings.' },401);
    const admins = (env.ADMIN_EMAILS || '').split(',').map(v=>v.trim().toLowerCase()).filter(Boolean);
    if (!admins.includes(user.email)) return json({ error:'This starter currently restricts case access to the configured ADMIN_EMAILS allowlist.' },403);
    try {
      if (url.pathname === '/api/cases' && request.method === 'GET') {
        const result = await env.DB.prepare('SELECT id, title, objective, scope, status, created_by, created_at, updated_at FROM cases ORDER BY updated_at DESC LIMIT 100').all();
        return json({ cases:result.results || [] });
      }
      if (url.pathname === '/api/cases' && request.method === 'POST') {
        const body = await request.json() as Record<string,unknown>;
        const title = typeof body.title === 'string' ? body.title.trim() : '';
        const objective = typeof body.objective === 'string' ? body.objective.trim() : '';
        const scope = typeof body.scope === 'string' ? body.scope.trim() : 'Authorized data sources only';
        if (!title || title.length > 160 || objective.length > 4000 || scope.length > 2000) return json({error:'Invalid title, objective, or scope length.'},400);
        const caseId = id('case'); const timestamp = now();
        await env.DB.prepare('INSERT INTO cases (id,title,objective,scope,status,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)').bind(caseId,title,objective,scope,'open',user.email,timestamp,timestamp).run();
        await audit(env,user.email,'case.create','case',caseId,{title});
        return json({ id:caseId, title, objective, scope, status:'open', created_by:user.email, created_at:timestamp, updated_at:timestamp },201);
      }
      const uploadMatch = url.pathname.match(/^\/api\/cases\/([A-Za-z0-9_-]+)\/evidence$/);
      if (uploadMatch && request.method === 'POST') {
        const caseId = uploadMatch[1];
        const caseRow = await env.DB.prepare('SELECT id FROM cases WHERE id = ?').bind(caseId).first();
        if (!caseRow) return json({error:'Case not found.'},404);
        const length = Number(request.headers.get('content-length') || 0);
        const max = Math.min(10*1024*1024,Math.max(1,Number(env.MAX_UPLOAD_BYTES || 10485760)));
        if (length > max) return json({error:`File exceeds ${max} byte upload limit.`},413);
        const form = await request.formData(); const file = form.get('file');
        const sourceNote = form.get('source_note');
        if (!(file instanceof File)) return json({error:'Expected multipart field named file.'},400);
        if (file.size > max) return json({error:`File exceeds ${max} byte upload limit.`},413);
        const bytes = await file.arrayBuffer();
        const digest = await crypto.subtle.digest('SHA-256',bytes);
        const sha256 = Array.from(new Uint8Array(digest)).map(v=>v.toString(16).padStart(2,'0')).join('');
        const evidenceId = id('ev'); const timestamp = now();
        const cleanName = safeFilename(file.name).replace(/[^A-Za-z0-9._-]/g,'_') || 'evidence.bin';
        const storageKey = `evidence/${caseId}/${evidenceId}-${cleanName}`;
        const uploadResponse = await fetch(githubContentsUrl(env,storageKey), {
          method:'PUT',
          headers:{...githubHeaders(env),'content-type':'application/json'},
          body:JSON.stringify({message:`DIW evidence upload ${evidenceId}`,content:bytesToBase64(new Uint8Array(bytes))})
        });
        if (!uploadResponse.ok) {
          console.error('GitHub evidence upload failed with status', uploadResponse.status);
          return json({error:'Private evidence storage rejected the upload. Check the server-side GitHub token and repository permissions.'},502);
        }
        const uploadResult = await uploadResponse.json() as {content?:{sha?:string}};
        const githubFileSha = uploadResult.content?.sha || '';
        if (!githubFileSha) return json({error:'Evidence storage provider returned an invalid response.'},502);
        try {
          await env.DB.prepare('INSERT INTO evidence (id,case_id,filename,content_type,size_bytes,sha256,storage_key,source_note,collected_by,collected_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
            .bind(evidenceId,caseId,safeFilename(file.name),file.type || 'application/octet-stream',file.size,sha256,storageKey,typeof sourceNote==='string'?sourceNote.slice(0,2000):'',user.email,timestamp,timestamp).run();
          await audit(env,user.email,'evidence.upload','evidence',evidenceId,{caseId,sizeBytes:file.size,sha256,storage:'github-private-repository'});
        } catch (error) {
          try { await fetch(githubContentsUrl(env,storageKey),{method:'DELETE',headers:{...githubHeaders(env),'content-type':'application/json'},body:JSON.stringify({message:`Rollback DIW evidence ${evidenceId}`,sha:githubFileSha})}); } catch {}
          throw error;
        }
        return json({id:evidenceId,case_id:caseId,filename:safeFilename(file.name),size_bytes:file.size,sha256,collected_by:user.email,collected_at:timestamp},201);
      }
      const evidenceMatch = url.pathname.match(/^\/api\/cases\/([A-Za-z0-9_-]+)\/evidence$/);
      if (evidenceMatch && request.method === 'GET') {
        const result = await env.DB.prepare('SELECT id,case_id,filename,content_type,size_bytes,sha256,source_note,collected_by,collected_at,created_at FROM evidence WHERE case_id = ? ORDER BY created_at DESC LIMIT 200').bind(evidenceMatch[1]).all();
        return json({evidence:result.results || []});
      }
      const downloadMatch = url.pathname.match(/^\/api\/cases\/([A-Za-z0-9_-]+)\/evidence\/([A-Za-z0-9_-]+)\/download$/);
      if (downloadMatch && request.method === 'GET') {
        const caseId = downloadMatch[1]; const evidenceId = downloadMatch[2];
        const item = await env.DB.prepare('SELECT filename,content_type,storage_key,sha256 FROM evidence WHERE id = ? AND case_id = ?').bind(evidenceId,caseId).first() as {filename:string;content_type:string;storage_key:string;sha256:string} | null;
        if (!item) return json({error:'Evidence not found.'},404);
        const stored = await fetch(githubContentsUrl(env,item.storage_key),{headers:githubHeaders(env,'application/vnd.github.raw')});
        if (!stored.ok) {
          console.error('GitHub evidence download failed with status',stored.status);
          return json({error:'Evidence file could not be retrieved from private storage.'},502);
        }
        const bytes = await stored.arrayBuffer();
        const digest = await crypto.subtle.digest('SHA-256',bytes);
        const actualSha256 = Array.from(new Uint8Array(digest)).map(v=>v.toString(16).padStart(2,'0')).join('');
        if (actualSha256 !== item.sha256) return json({error:'Evidence integrity check failed. Stored bytes do not match the recorded SHA-256.'},409);
        try { await audit(env,user.email,'evidence.download','evidence',evidenceId,{caseId,sha256:item.sha256}); } catch { console.error('Evidence download audit event could not be recorded'); }
        const filename = item.filename.replace(/["\\\r\n]/g,'_');
        return new Response(bytes,{status:200,headers:{
          'content-type':item.content_type || 'application/octet-stream',
          'content-disposition':`attachment; filename="${filename}"`,
          'cache-control':'no-store','x-content-type-options':'nosniff','x-evidence-sha256':item.sha256
        }});
      }
      return json({error:'Route not found.'},404);
    } catch (error) {
      console.error('DIW API operation failed', error instanceof Error ? error.message : 'unknown error');
      return json({error:'Internal server error.'},500);
    }
  }
};
