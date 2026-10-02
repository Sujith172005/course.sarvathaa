// Run with Node 18+: node tests/admin_frontend.test.cjs
// Uses a minimal DOM and mocked HTTP responses; never calls the live website.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../assets/js/course-app.js'), 'utf8');
function element(){
  return {innerHTML:'', textContent:'', value:'', hidden:true, disabled:false,
    handlers:{}, addEventListener(name, fn){ this.handlers[name] = fn; }};
}
function response(status, body){
  return {ok:status >= 200 && status < 300, status, json:async()=>body};
}
function harness(login=false){
  const elements = new Map();
  const redirects = [], requests = [];
  const location = {origin:'https://sarvathaa.com', replace(url){ redirects.push(url); }};
  Object.defineProperty(location, 'href', {set(url){ redirects.push(url); }});
  if(login){
    for(const id of ['adminLoginForm','adminLoginMessage','adminUsername','adminPassword']) elements.set(id,element());
    const submit = element(); elements.get('adminLoginForm').querySelector = ()=>submit;
  }
  const context = vm.createContext({
    console, setTimeout, clearTimeout, AbortController, URL, location,
    window:{location},
    document:{getElementById:id=>elements.get(id) || null, addEventListener(){}, querySelector(){return null;}},
    fetch:async(url, options)=>{ requests.push([url, options]); return response(200,{ok:true}); }
  });
  vm.runInContext(source, context);
  return {context, elements, redirects, requests};
}
function dashboard(h){
  for(const id of ['studentsTable','couponList','adminStatus','adminStatusMessage']) h.elements.set(id,element());
}
async function main(){
  let passed=0;
  async function test(name, fn){ await fn(); passed++; console.log('PASS:',name); }
  await test('login page never auto-redirects or starts an auth ping-pong', async()=>{
    const h=harness(true); await new Promise(setImmediate);
    assert.equal(h.redirects.length,0); assert.equal(h.requests.length,0);
  });
  await test('student-list 500 stays on dashboard with a Retry button', async()=>{
    const h=harness(); dashboard(h);
    h.context.fetch=async()=>response(500,{message:'Database unavailable'});
    await h.context.loadStudents();
    assert.equal(h.redirects.length,0);
    assert.match(h.elements.get('studentsTable').innerHTML,/Retry student list/);
  });
  await test('network failure stays on dashboard', async()=>{
    const h=harness(); dashboard(h); h.context.fetch=async()=>{throw new TypeError('Failed to fetch');};
    await h.context.loadStudents(); assert.equal(h.redirects.length,0);
    assert.match(h.elements.get('studentsTable').innerHTML,/Unable to reach the server/);
  });
  await test('HTML bad-gateway response remains an error, not a logout', async()=>{
    const h=harness(); dashboard(h);
    h.context.fetch=async()=>({ok:false,status:502,json:async()=>{throw new Error('Not JSON');}});
    await h.context.loadStudents(); assert.equal(h.redirects.length,0);
    assert.match(h.elements.get('studentsTable').innerHTML,/invalid response/);
  });
  await test('expired session redirects once even if two requests fail', async()=>{
    const h=harness(); dashboard(h); h.context.fetch=async()=>response(401,{message:'Admin login required'});
    await Promise.all([h.context.loadStudents(),h.context.loadCoupons()]);
    assert.deepEqual(h.redirects,['/course-login.html#admin']);
  });
  await test('failed auth check shows a retry notice and does not load data', async()=>{
    const h=harness(); dashboard(h); let count=0;
    h.context.fetch=async()=>{count++; return response(503,{message:'Temporarily unavailable'});};
    await h.context.initAdminDashboard(); assert.equal(count,1);
    assert.equal(h.redirects.length,0); assert.equal(h.elements.get('adminStatus').hidden,false);
  });
  await test('retry recovers successfully without navigation', async()=>{
    const h=harness(); dashboard(h);
    h.context.fetch=async()=>response(500,{message:'Database unavailable'}); await h.context.loadStudents();
    h.context.fetch=async()=>response(200,{ok:true,students:[]}); await h.context.loadStudents();
    assert.match(h.elements.get('studentsTable').innerHTML,/No students found/);
    assert.equal(h.redirects.length,0);
  });
  await test('auth API status is retained and cache is disabled', async()=>{
    const h=harness(); await h.context.api('/api/admin/check');
    assert.equal(h.requests[0][1].cache,'no-store');
    assert.equal(h.requests[0][1].credentials,'same-origin');
    h.context.fetch=async()=>response(403,{message:'Forbidden'});
    await assert.rejects(h.context.api('/api/test'), error=>error.status === 403);
  });
  await test('accepted login without a cookie stays on the login form', async()=>{
    const h=harness(true);
    h.context.fetch=async url=>response(200,{ok:!url.endsWith('/check')});
    await h.elements.get('adminLoginForm').handlers.submit({preventDefault(){}});
    assert.equal(h.redirects.length,0);
    assert.match(h.elements.get('adminLoginMessage').textContent,/did not keep the session/);
    assert.equal(h.elements.get('adminLoginForm').querySelector().disabled,false);
  });
  await test('successful login with retained cookie opens admin once', async()=>{
    const h=harness(true);
    await h.elements.get('adminLoginForm').handlers.submit({preventDefault(){}});
    assert.deepEqual(h.redirects,['/admin']);
  });
  await test('coupon error stays visible and offers retry', async()=>{
    const h=harness(); dashboard(h); h.context.fetch=async()=>response(500,{message:'Unavailable'});
    await h.context.loadCoupons(); assert.equal(h.redirects.length,0);
    assert.match(h.elements.get('couponList').innerHTML,/Retry coupons/);
  });
  await test('error messages are HTML-escaped', async()=>{
    const h=harness(); dashboard(h);
    h.context.fetch=async()=>response(500,{message:'<script>bad()</script>'});
    await h.context.loadStudents();
    assert.doesNotMatch(h.elements.get('studentsTable').innerHTML,/<script>/);
  });
  console.log(`${passed} frontend regression tests passed.`);
}
main().catch(error=>{ console.error(error); process.exitCode=1; });
