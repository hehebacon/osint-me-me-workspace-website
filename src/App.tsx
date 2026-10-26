import { useEffect, useState } from 'react';
import { Activity, Archive, ArrowUpRight, Bell, BookOpen, CheckCircle2, ChevronRight, CircleHelp, FileSearch, Fingerprint, FolderOpen, Gauge, Globe2, LockKeyhole, Plus, Search, Shield, ShieldAlert, UploadCloud } from 'lucide-react';

type CaseItem = { id: string; title: string; objective: string; scope: string; status: 'open'|'review'|'closed'; created_by: string; created_at: string; updated_at: string };
type ApiState = 'loading'|'connected'|'demo'|'error';
const demoCases: CaseItem[] = [
  { id:'CASE-DEMO-001', title:'Suspicious domain review', objective:'Review public DNS and TLS metadata for a reported suspicious domain.', scope:'Public sources and authorized indicators only', status:'open', created_by:'demo@local', created_at:new Date().toISOString(), updated_at:new Date().toISOString() },
  { id:'CASE-DEMO-002', title:'Endpoint log triage', objective:'Correlate supplied endpoint logs and timestamps.', scope:'Owner-provided logs only', status:'review', created_by:'demo@local', created_at:new Date().toISOString(), updated_at:new Date().toISOString() },
];
const nav = [
  { label:'Overview', icon:Gauge }, { label:'Case files', icon:FolderOpen }, { label:'Evidence vault', icon:Archive },
  { label:'OSINT research', icon:Globe2 }, { label:'IOC analysis', icon:Fingerprint }, { label:'Timeline', icon:Activity }, { label:'Reports', icon:BookOpen },
];
function shortDate(value: string) { try { return new Date(value).toLocaleDateString(undefined,{month:'short',day:'2-digit',year:'numeric'}); } catch { return value; } }
export default function App() {
  const [cases,setCases] = useState<CaseItem[]>(demoCases);
  const [apiState,setApiState] = useState<ApiState>('loading');
  const [active,setActive] = useState('Overview');
  const [query,setQuery] = useState('');
  const [showCreate,setShowCreate] = useState(false);
  const [title,setTitle] = useState('');
  const [objective,setObjective] = useState('');
  const [notice,setNotice] = useState('');
  const [busy,setBusy] = useState(false);

  async function refresh() {
    try {
      const response = await fetch('/api/cases');
      if (!response.ok) throw new Error(`API ${response.status}`);
      const data = await response.json() as { cases: CaseItem[] };
      setCases(data.cases); setApiState('connected');
    } catch { setApiState('demo'); }
  }
  useEffect(() => { void refresh(); }, []);

  async function createCase(e: React.FormEvent) {
    e.preventDefault(); if (!title.trim()) return;
    setBusy(true); setNotice('');
    try {
      const response = await fetch('/api/cases',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({title:title.trim(),objective:objective.trim(),scope:'Authorized data sources only'})});
      if (!response.ok) throw new Error((await response.json().catch(()=>({error:'Request failed'})) as {error?:string}).error || 'Request failed');
      setTitle(''); setObjective(''); setShowCreate(false); setNotice('Case created.'); await refresh();
    } catch { setNotice('API unavailable or access not configured. This preview does not save new cases.'); }
    finally { setBusy(false); }
  }
  const visibleCases = cases.filter(c => `${c.title} ${c.id} ${c.objective}`.toLowerCase().includes(query.toLowerCase()));
  const openCount = cases.filter(c=>c.status==='open').length;
  const reviewCount = cases.filter(c=>c.status==='review').length;

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Shield size={22}/><span /></div><div><strong>DIW<span className="brand-dot">.</span></strong><small>INVESTIGATION WORKBENCH</small></div></div>
      <div className="workspace-label">WORKSPACE <span>01</span></div>
      <nav>{nav.map((item,i)=><button key={item.label} className={`nav-item ${active===item.label?'active':''}`} onClick={()=>setActive(item.label)}><item.icon size={17}/><span>{item.label}</span>{i===1&&<span className="nav-count">{cases.length}</span>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="security-card"><div className="security-icon"><LockKeyhole size={17}/></div><strong>Secure workspace</strong><p>Use only data you are authorized to investigate.</p><span className="secure-status"><i/> Access controls required</span></div><button className="nav-item muted"><CircleHelp size={17}/>Documentation</button><div className="profile"><div className="avatar">DI</div><div><strong>Investigator</strong><small>Workspace operator</small></div><button aria-label="Profile menu" className="icon-button"><ChevronRight size={16}/></button></div></div>
    </aside>
    <main className="main-area">
      <header className="topbar"><div className="breadcrumbs"><span>Workspace</span><ChevronRight size={14}/><strong>{active}</strong></div><div className="top-actions"><div className={`connection-pill ${apiState}`}><i/>{apiState==='connected'?'API connected':apiState==='loading'?'Connecting…':apiState==='error'?'API error':'Preview mode'}</div><button className="icon-button" aria-label="Notifications"><Bell size={18}/></button><div className="top-avatar">DI</div></div></header>
      <div className="page-content">
        <section className="welcome-row"><div><div className="eyebrow"><span className="eyebrow-line"/> DIGITAL FORENSICS / OSINT</div><h1>{active==='Overview'?'Investigation overview':active}</h1><p className="subtitle">A traceable workspace for authorized digital investigations.</p></div><button className="primary-button" onClick={()=>setShowCreate(true)}><Plus size={17}/> New case</button></section>
        <section className="notice-banner"><div className="notice-icon"><ShieldAlert size={18}/></div><div><strong>Evidence-first workflow</strong><p>Keep source provenance, separate verified facts from hypotheses, and document the scope of every investigation.</p></div><span className="notice-tag">POLICY ACTIVE</span></section>
        {notice&&<div className="toast" role="status">{notice}<button onClick={()=>setNotice('')}>Dismiss</button></div>}
        <section className="metric-grid">
          <article className="metric-card"><div className="metric-head"><span>Active cases</span><div className="metric-icon blue"><FolderOpen size={18}/></div></div><div className="metric-value">{openCount.toString().padStart(2,'0')}<span className="metric-unit">cases</span></div><div className="metric-foot"><span className="status-dot blue-dot"/>Open investigations</div></article>
          <article className="metric-card"><div className="metric-head"><span>Awaiting review</span><div className="metric-icon amber"><FileSearch size={18}/></div></div><div className="metric-value">{reviewCount.toString().padStart(2,'0')}<span className="metric-unit">cases</span></div><div className="metric-foot"><span className="status-dot amber-dot"/>Require verification</div></article>
          <article className="metric-card"><div className="metric-head"><span>Evidence integrity</span><div className="metric-icon green"><CheckCircle2 size={18}/></div></div><div className="metric-value">—<span className="metric-unit">verified</span></div><div className="metric-foot">No evidence uploaded yet</div></article>
          <article className="metric-card"><div className="metric-head"><span>System status</span><div className="metric-icon purple"><Activity size={18}/></div></div><div className="metric-value">{apiState==='connected'?'LIVE':'DEMO'}</div><div className="metric-foot"><span className={`status-dot ${apiState==='connected'?'green-dot':'amber-dot'}`}/>{apiState==='connected'?'Cloudflare API reachable':'Connect Worker API to persist data'}</div></article>
        </section>
        <section className="content-grid">
          <article className="panel cases-panel"><div className="panel-header"><div><h2>Recent case files</h2><p>Case records and current review status</p></div><button className="text-button" onClick={()=>setActive('Case files')}>View all <ArrowUpRight size={15}/></button></div>
            <div className="table-toolbar"><div className="search-box"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search cases or identifiers…"/></div><button className="filter-button" onClick={()=>setQuery('')}>Clear</button></div>
            <div className="case-list">{visibleCases.length?visibleCases.map((c,index)=><div className="case-row" key={c.id}><div className={`case-symbol symbol-${index%3}`}><FileSearch size={18}/></div><div className="case-main"><strong>{c.title}</strong><span>{c.id} <b>·</b> Updated {shortDate(c.updated_at)}</span></div><span className={`case-status ${c.status}`}>{c.status==='open'?'In progress':c.status==='review'?'In review':'Closed'}</span><button className="row-action" aria-label={`Open ${c.title}`} onClick={()=>setNotice(`Case ${c.id}: ${c.objective}`)}><ChevronRight size={17}/></button></div>):<div className="empty-state">No cases match this search.</div>}</div>
            <button className="full-width-link" onClick={()=>setActive('Case files')}>Open case manager <ArrowUpRight size={15}/></button>
          </article>
          <div className="right-column">
            <article className="panel quick-panel"><div className="panel-header"><div><h2>Research tools</h2><p>Analysis modules</p></div><div className="tiny-label">BETA</div></div><button className="tool-row" onClick={()=>setActive('OSINT research')}><div className="tool-icon"><Globe2 size={17}/></div><div><strong>Public-source lookup</strong><span>DNS, domain, TLS metadata</span></div><ChevronRight size={16}/></button><button className="tool-row" onClick={()=>setActive('IOC analysis')}><div className="tool-icon violet"><Fingerprint size={17}/></div><div><strong>IOC workbench</strong><span>Hash, IP and domain indicators</span></div><ChevronRight size={16}/></button><button className="tool-row" onClick={()=>setActive('Evidence vault')}><div className="tool-icon green"><UploadCloud size={17}/></div><div><strong>Evidence intake</strong><span>Upload and hash source files</span></div><ChevronRight size={16}/></button></article>
            <article className="panel checklist-panel"><div className="panel-header"><div><h2>Investigation checklist</h2><p>Before drawing conclusions</p></div></div><div className="check-item"><span className="check-empty"/><span>Confirm authorized scope</span></div><div className="check-item"><span className="check-empty"/><span>Record source and collection time</span></div><div className="check-item"><span className="check-empty"/><span>Cross-check independent evidence</span></div><div className="check-item"><span className="check-empty"/><span>Document uncertainty and alternatives</span></div></article>
          </div>
        </section>
        <footer className="footer"><span>DIW ADVANCED <b>·</b> V0.1.0</span><span><i/> Privacy-aware by design</span><span>Authorized investigations only</span></footer>
      </div>
    </main>
    {showCreate&&<div className="modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setShowCreate(false)}}><form className="modal" onSubmit={createCase}><div className="modal-heading"><div><span className="eyebrow">CASE MANAGEMENT</span><h2>Create new case</h2></div><button type="button" className="icon-button" onClick={()=>setShowCreate(false)}>×</button></div><label>Case title<input autoFocus maxLength={160} value={title} onChange={e=>setTitle(e.target.value)} required placeholder="e.g. Suspicious domain review"/></label><label>Objective and context<textarea maxLength={4000} rows={4} value={objective} onChange={e=>setObjective(e.target.value)} placeholder="What needs to be verified? Which authorized data sources are available?"/></label><div className="scope-note"><Shield size={16}/><span>Scope is restricted to public sources and data you are authorized to examine.</span></div><div className="modal-actions"><button type="button" className="secondary-button" onClick={()=>setShowCreate(false)}>Cancel</button><button className="primary-button" disabled={busy}>{busy?'Creating…':'Create case'}</button></div></form></div>}
  </div>;
}
