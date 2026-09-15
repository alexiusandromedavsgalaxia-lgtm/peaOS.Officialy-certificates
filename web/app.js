const KEY='peacloud-state-v1';
const PEAOS_MANIFEST='https://raw.githubusercontent.com/alexiusandromedavsgalaxia-lgtm/peaOS/main/peacloud.json';
const CERT_REGISTRY='https://raw.githubusercontent.com/alexiusandromedavsgalaxia-lgtm/peaOS.Officialy-certificates/main/registry.json';
const app=document.querySelector('#app');
const authDialog=document.querySelector('#authDialog');
const authContent=document.querySelector('#authContent');
const accountButton=document.querySelector('#accountButton');
const certDialog=document.querySelector('#certDialog');
const certForm=document.querySelector('#certForm');
const certFormError=document.querySelector('#certFormError');

const emptyState={user:null,certificates:[],wdp:null};
let state=load();
let integration={status:'connecting',os:null,registry:null,error:null};

function load(){try{return {...emptyState,...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch{return {...emptyState}}}
function save(){localStorage.setItem(KEY,JSON.stringify(state))}
function esc(s){return String(s).replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]))}
function id(prefix){return prefix+'-'+crypto.randomUUID().slice(0,8).toUpperCase()}
function initials(name){return name.split(/\s+/).map(x=>x[0]).join('').slice(0,2).toUpperCase()}

async function syncPeaOS(){
  integration={...integration,status:'connecting',error:null};
  render();
  try{
    const [osResponse,registryResponse]=await Promise.all([fetch(PEAOS_MANIFEST,{cache:'no-store'}),fetch(CERT_REGISTRY,{cache:'no-store'})]);
    if(!osResponse.ok||!registryResponse.ok) throw new Error('No se pudo leer el manifiesto o registro remoto.');
    const [os,registry]=await Promise.all([osResponse.json(),registryResponse.json()]);
    if(os.product!=='peaOS'||registry.issuer!=='peaOS.Officialy-certificates') throw new Error('Identidad de servicio no válida.');
    integration={status:'connected',os,registry,error:null};
  }catch(error){integration={status:'offline',os:null,registry:null,error:error.message};}
  render();
}

function render(){
 const count=state.certificates.length;
 const active=state.certificates.filter(c=>c.status==='Active').length;
 const official=integration.registry?.certificates?.length??0;
 const osVersion=integration.os?.version||'sin conexión';
 app.innerHTML=`
 <section id="home" class="hero">
   <div><div class="eyebrow">peaCloud · peaOS</div><h1>tu identidad digital, en un solo sitio.</h1><p>peaCloud se conecta al manifiesto público de peaOS y al registro de certificados para mostrar el estado real de la integración.</p><div class="actions"><button class="primary" id="heroAccount">${state.user?'Abrir peaCloud':'Crear cuenta peaCloud'}</button><a class="secondary" href="#certificates" style="text-decoration:none">Ver certificados</a></div></div>
   <div class="hero-card"><div class="row"><span>Conexión peaOS</span><strong>${integration.status==='connected'?'Conectado':integration.status==='connecting'?'Conectando…':'Sin conexión'}</strong></div><div class="row"><span>peaOS</span><strong>${esc(osVersion)}</strong></div><div class="row"><span>Certificados oficiales</span><strong>${official}</strong></div><div class="row"><span>Cuenta</span><strong>${state.user?'peaCloud':'Invitado'}</strong></div></div>
 </section>
 <section class="section"><div class="card wdp"><div class="eyebrow">Integración peaOS ↔ peaCloud</div><h2>canal de identidad conectado.</h2><p class="muted">El sitio obtiene el manifiesto de peaOS y el registro de certificados directamente desde GitHub. Los certificados creados en este navegador siguen siendo locales hasta que exista un backend oficial de peaCloud.</p><div class="stats"><div class="card stat"><strong>${esc(osVersion)}</strong><span>Versión peaOS</span></div><div class="card stat"><strong>${integration.os?.certificate_version??'—'}</strong><span>Formato de certificado</span></div><div class="card stat"><strong>${official}</strong><span>Oficiales</span></div><div class="card stat"><strong>${integration.status==='connected'?'OK':'—'}</strong><span>Sincronización</span></div></div><div class="actions"><button class="secondary" id="syncPeaOS">Sincronizar ahora</button>${integration.os?.certificate_service?`<a class="secondary" href="${esc(integration.os.certificate_service)}" target="_blank" rel="noreferrer" style="text-decoration:none">Repositorio de certificados</a>`:''}</div>${integration.error?`<div class="notice">${esc(integration.error)}</div>`:''}</div></section>
 <section id="certificates" class="section"><div class="section-head"><div><h2>Certificados</h2><div class="muted">Oficiales remotos + certificados locales de este navegador</div></div><button class="primary" id="newCert">+ Crear certificado</button></div>
   <div class="stats"><div class="card stat"><strong>${official}</strong><span>Oficiales peaOS</span></div><div class="card stat"><strong>${count}</strong><span>Locales</span></div><div class="card stat"><strong>${active}</strong><span>Activos locales</span></div><div class="card stat"><strong>${state.certificates.filter(c=>c.status==='Revoked').length}</strong><span>Revocados locales</span></div></div>
   <div class="cert-grid">${official?integration.registry.certificates.map(officialCertCard).join(''):''}${count?state.certificates.map(certCard).join(''):''}${!official&&!count?`<div class="card empty" style="grid-column:1/-1">No hay certificados oficiales en el registro remoto ni certificados locales todavía.<br><br><button class="secondary" id="emptyCreate">Crear el primero</button></div>`:''}</div>
 </section>
 <section id="wdp" class="section"><div class="card wdp"><div class="eyebrow">Web Distribution Program</div><h2>distribuye tu web con identidad peaOS.</h2><p class="muted">El WDP permite asociar un origen web a una identidad de distribución. Aquí puedes preparar la inscripción y guardar su estado en peaCloud.</p><ul><li>Origen web autorizado</li><li>Certificado de distribución</li><li>Estado de inscripción visible</li><li>Revisión antes de activar una distribución oficial</li></ul><div class="actions"><button class="primary" id="wdpButton">${state.wdp?'Ver inscripción WDP':'Inscribirme al WDP'}</button></div>${state.wdp?`<div class="notice">Inscripción local: <strong>${esc(state.wdp.origin)}</strong> · ${esc(state.wdp.id)}</div>`:''}</div></section>
 <div class="footer">peaCloud web · integración pública con peaOS · los datos de cuenta/certificados locales se guardan en localStorage</div>`;
 document.querySelector('#heroAccount').onclick=()=>state.user?showAccount():openAuth('signup');
 document.querySelector('#newCert').onclick=()=>state.user?certDialog.showModal():openAuth('signup');
 document.querySelector('#emptyCreate')?.addEventListener('click',()=>state.user?certDialog.showModal():openAuth('signup'));
 document.querySelector('#wdpButton').onclick=()=>state.user?showWdp():openAuth('signup');
 document.querySelector('#syncPeaOS').onclick=syncPeaOS;
 document.querySelectorAll('[data-revoke]').forEach(b=>b.onclick=()=>revoke(b.dataset.revoke));
 updateAccountButton();
}

function officialCertCard(c){return `<article class="card cert"><span class="badge">${esc(c.status||'Unknown')}</span><h3>${esc(c.name||c.id||'Certificado peaOS')}</h3><div class="cert-meta">ID: ${esc(c.id||'—')}<br>Origen: ${esc(c.origin||'—')}<br>Distribución: ${esc(c.distribution||'—')}<br>Fuente: registro oficial peaOS</div></article>`}
function certCard(c){return `<article class="card cert"><span class="badge">${esc(c.status)}</span><h3>${esc(c.name)}</h3><div class="cert-meta">ID: ${esc(c.id)}<br>Origen: ${esc(c.origin)}<br>Distribución: ${esc(c.distribution)}<br>Creado: ${new Date(c.createdAt).toLocaleString('es-ES')}</div><div class="actions" style="margin-top:15px">${c.status==='Active'?`<button class="secondary" data-revoke="${esc(c.id)}">Revocar</button>`:''}</div></article>`}

function updateAccountButton(){accountButton.innerHTML=state.user?`<span class="signed"><span class="avatar">${initials(state.user.name)}</span>${esc(state.user.name)}</span>`:'Iniciar sesión';accountButton.onclick=()=>state.user?showAccount():openAuth('login')}
function openAuth(mode){renderAuth(mode);authDialog.showModal()}
function renderAuth(mode){authContent.innerHTML=mode==='login'?`<h2>Iniciar sesión</h2><p class="muted">Accede a tu peaCloud.</p><label>Correo<input id="authEmail" type="email" required autocomplete="email"></label><label>Contraseña<input id="authPassword" type="password" required minlength="6"></label><button class="primary" id="authSubmit">Iniciar sesión</button><p id="authError" class="error"></p><p class="switch">¿No tienes cuenta? <button id="switchAuth">Crear cuenta</button></p>`:`<h2>Crear cuenta de peaCloud</h2><p class="muted">Una identidad para tus certificados y registros WDP.</p><label>Nombre<input id="authName" required maxlength="60" autocomplete="name"></label><label>Correo<input id="authEmail" type="email" required autocomplete="email"></label><label>Contraseña<input id="authPassword" type="password" required minlength="6" autocomplete="new-password"></label><button class="primary" id="authSubmit">Crear cuenta</button><p id="authError" class="error"></p><p class="switch">¿Ya tienes cuenta? <button id="switchAuth">Iniciar sesión</button></p>`;document.querySelector('#authSubmit').onclick=()=>submitAuth(mode);document.querySelector('#switchAuth').onclick=()=>renderAuth(mode==='login'?'signup':'login')}
function submitAuth(mode){const email=document.querySelector('#authEmail').value.trim().toLowerCase();const password=document.querySelector('#authPassword').value;const error=document.querySelector('#authError');if(!email||password.length<6){error.textContent='Introduce un correo y una contraseña de al menos 6 caracteres.';return}if(mode==='signup'){const name=document.querySelector('#authName').value.trim();if(!name){error.textContent='Escribe tu nombre.';return}state.user={name,email};save();authDialog.close();render();return}if(!state.user||state.user.email!==email){error.textContent='No existe una cuenta local con ese correo.';return}authDialog.close();render()}
function showAccount(){authContent.innerHTML=`<h2>Tu peaCloud</h2><p class="muted">${esc(state.user.email)}</p><div class="hero-card"><div class="row"><span>Cuenta</span><strong>${esc(state.user.name)}</strong></div><div class="row"><span>Certificados locales</span><strong>${state.certificates.length}</strong></div><div class="row"><span>WDP</span><strong>${state.wdp?'Inscrito':'No inscrito'}</strong></div><div class="row"><span>peaOS</span><strong>${esc(osVersion())}</strong></div></div><button class="secondary" id="logout">Cerrar sesión</button>`;authDialog.showModal();document.querySelector('#logout').onclick=()=>{state.user=null;save();authDialog.close();render()}}
function osVersion(){return integration.os?.version||'sin conexión'}

certForm.onsubmit=e=>{e.preventDefault();if(!state.user){certDialog.close();openAuth('signup');return}const data=new FormData(certForm);const origin=String(data.get('origin')).trim();if(!/^https:\/\//i.test(origin)){certFormError.textContent='El origen debe comenzar por https://';return}state.certificates.unshift({id:id('PC'),name:String(data.get('name')).trim(),origin,distribution:String(data.get('distribution')),status:'Active',createdAt:new Date().toISOString(),owner:state.user.email});save();certForm.reset();certDialog.close();render()}
function revoke(certId){const c=state.certificates.find(x=>x.id===certId);if(c){c.status='Revoked';c.revokedAt=new Date().toISOString();save();render()}}
function showWdp(){authContent.innerHTML=state.wdp?`<h2>Inscripción WDP</h2><p class="muted">Registro local</p><div class="hero-card"><div class="row"><span>ID</span><strong>${esc(state.wdp.id)}</strong></div><div class="row"><span>Origen</span><strong>${esc(state.wdp.origin)}</strong></div><div class="row"><span>Estado</span><strong>Pending review</strong></div></div><p class="notice">Este navegador ha guardado la solicitud. La revisión y activación oficial necesitan un servicio WDP real.</p>`:`<h2>Inscribirse al WDP</h2><p class="muted">Prepara tu solicitud de Web Distribution Program.</p><label>Origen web<input id="wdpOrigin" placeholder="https://example.com" required></label><button class="primary" id="wdpSubmit">Enviar inscripción</button><p id="wdpError" class="error"></p>`;authDialog.showModal();document.querySelector('#wdpSubmit')?.addEventListener('click',()=>{const origin=document.querySelector('#wdpOrigin').value.trim();const error=document.querySelector('#wdpError');if(!/^https:\/\//i.test(origin)){error.textContent='Usa un origen https:// válido.';return}state.wdp={id:id('WDP'),origin,createdAt:new Date().toISOString(),status:'Pending review'};save();authDialog.close();render()})}

render();
syncPeaOS();
