const API_BASE = '';
const LOGIN_PAGE = `${window.location.origin}/course-login.html`;
const SARVATHAA_WHATSAPP_NUMBER = '917904336537';

const onboardingOptions = {
  whyCourse: ['Self learning', 'Improve baking skill', 'Start earning from home', 'Upgrade professional skill'],
  goals: ['Start a bakery business', 'Start a cafe', 'Start home baking orders', 'Get a bakery job', 'Improve family/event baking'],
  timeline: ['Within 1 month', 'Within 3 months', 'Within 6 months', 'Within 1 year', 'Learning only now']
};

function cleanPhone(value){
  const digits = String(value || '').replace(/\D/g, '');
  if(!digits) return SARVATHAA_WHATSAPP_NUMBER;
  if(digits.length === 10) return '91' + digits;
  return digits;
}
function buildLoginMessage(login){
  return `Hi ${login.name || 'Student'},

Your Sarvathaa course access is activated.

Course: ${login.course_title || login.course_key || ''}
Login Link: ${LOGIN_PAGE}
Username: ${login.username || ''}
Password: ${login.password || login.access_password || 'Same as your existing password'}
Access Valid Until: ${login.expiry_date || ''}

Regards,
Sarvathaa Team`;
}
function whatsappHref(phone, message){
  return `https://wa.me/${cleanPhone(phone)}?text=${encodeURIComponent(message)}`;
}

async function api(path, options={}){
  const res = await fetch(API_BASE + path, {headers:{'Content-Type':'application/json'}, credentials:'include', ...options});
  const data = await res.json().catch(()=>({ok:false,message:'Server error'}));
  if(!res.ok) throw data;
  return data;
}

function esc(value){
  return String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
}
function optionTags(values, selected=''){
  return values.map(v=>`<option value="${esc(v)}" ${v===selected?'selected':''}>${esc(v)}</option>`).join('');
}
function courseSelectOptions(selected=''){
  const list = [
    ['silver','Silver Plan'],
    ['bronze','Bronze Plan'],
    ['gold','Gold Plan'],
    ['platinum','Platinum Plan']
  ];
  return list.map(([key,title])=>`<option value="${esc(key)}" ${key===selected?'selected':''}>${esc(title)}</option>`).join('');
}

async function isAdminLoggedIn(){
  try{ const data = await api('/api/admin/check'); return !!data.ok; }
  catch(_){ return false; }
}
async function protectAdminPage(){
  if(!document.getElementById('studentsTable')) return;
  const loggedIn = await isAdminLoggedIn();
  if(!loggedIn) location.replace('admin-login.html');
}
async function redirectAdminLoginIfAlreadyLogged(){
  if(!document.getElementById('adminLoginForm')) return;
  const loggedIn = await isAdminLoggedIn();
  if(loggedIn) location.replace('/admin');
}
redirectAdminLoginIfAlreadyLogged();
protectAdminPage();

const studentLoginForm = document.getElementById('studentLoginForm');
studentLoginForm?.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const msg = document.getElementById('loginMessage');
  msg.textContent = 'Checking...';
  try{
    await api('/api/student-login', {method:'POST', body:JSON.stringify({username:loginUsername.value.trim(), password:loginPassword.value})});
    window.location.href = 'my-courses.html';
  }catch(err){ msg.textContent = err.message || 'Login failed'; }
});

function isMp4Video(url){
  return /\.(mp4|webm|ogg)(\?.*)?$/i.test(String(url || ''));
}
function renderCourseVideo(url, title){
  const rawUrl = url || 'assets/videos/preview-demo.mp4';
  const safeUrl = esc(rawUrl);
  const safeTitle = esc(title || 'Course video');
  if(isMp4Video(rawUrl)){
    return `<div class="responsive-video local-course-video">
      <video controls preload="metadata" playsinline controlsList="nodownload" poster="assets/images/offline-training.svg" onerror="this.closest('.responsive-video').classList.add('video-error')">
        <source src="${safeUrl}" type="video/mp4">
        Your browser does not support video.
      </video>
      <div class="video-fallback-note">Video not loaded. Check the file path: ${safeUrl}. Make sure you opened the website through Flask: http://127.0.0.1:5000/my-courses.html</div>
    </div>`;
  }
  return `<div class="responsive-video"><iframe src="${safeUrl}" title="${safeTitle}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`;
}


function renderCourseDocumentLink(course){
  if(!course || !course.document_url) return '';
  const title = esc(course.title || 'Course');
  const url = esc(course.document_url);
  return `<details class="course-notes-accordion no-download-doc course-note-viewer clean-document-reader" oncontextmenu="return false">
    <summary>
      <span class="notes-summary-icon">📘</span>
      <span><strong>Course Document</strong><small>Click to read the full recipe notes inside your course login</small></span>
      <em>Read Full Document</em>
    </summary>
    <div class="course-note-frame-card">
      <div class="note-viewer-topbar simple-doc-topbar">
        <div>
          <h3>${title} Document</h3>
          <p>Read clearly here after your videos. Download and share buttons are not shown.</p>
        </div>
        <span>Private Student Copy</span>
      </div>
      <div class="note-viewer-wrap protected-image-document full-course-document">
        <iframe src="${url}" title="${title} Course Notes" loading="lazy" sandbox="allow-same-origin allow-scripts"></iframe>
        <div class="note-watermark">SARVATHAA STUDENT COPY</div>
      </div>
    </div>
  </details>`;
}

function renderPlanQuiz(course){
  if(!course || !course.quiz_url) return '';
  const key=esc(course.key || course.course_key || '');
  const title=esc(course.title || 'Plan');
  return `<section class="plan-quiz-card" id="plan-quiz-${key}" data-plan-key="${key}">
    <div class="plan-quiz-intro">
      <div><span class="eyebrow">Plan Knowledge Check</span><h3>${title} Quiz</h3><p>Answer all 10 plan-specific questions. You need 70% to pass.</p></div>
      <button class="btn load-plan-quiz-btn" type="button" data-plan-key="${key}">Start 10-Question Quiz</button>
    </div>
    <div class="plan-quiz-content"></div>
  </section>`;
}

async function loadPlanQuiz(planKey){
  const card=document.getElementById(`plan-quiz-${planKey}`);
  if(!card) return;
  const content=card.querySelector('.plan-quiz-content');
  content.innerHTML='<p class="dashboard-loading">Loading your quiz...</p>';
  try{
    const data=await api(`/api/quiz/${encodeURIComponent(planKey)}`);
    const history=data.attempt_count ? `<div class="quiz-history ${data.passed?'passed':''}">Previous attempts: <strong>${data.attempt_count}</strong> · Best score: <strong>${data.best_percentage}%</strong>${data.passed?' · Passed':''}</div>` : '';
    const questions=(data.questions || []).map((q,index)=>`<fieldset class="quiz-question-card">
      <legend><span>${index+1}</span>${esc(q.question)}</legend>
      <div class="quiz-options">${(q.options || []).map((option,optionIndex)=>`<label><input required type="radio" name="quiz-${planKey}-${q.id}" value="${optionIndex}"><span>${esc(option)}</span></label>`).join('')}</div>
    </fieldset>`).join('');
    content.innerHTML=`${history}<form class="plan-quiz-form" data-plan-key="${esc(planKey)}">${questions}<button class="btn quiz-submit-btn" type="submit">Submit Quiz</button><div class="quiz-result" role="status"></div></form>`;
    content.querySelector('.plan-quiz-form').addEventListener('submit', submitPlanQuiz);
    card.querySelector('.load-plan-quiz-btn').textContent='Restart Quiz';
  }catch(err){ content.innerHTML=`<p class="quiz-result failed">${esc(err.message || 'Quiz could not be loaded.')}</p>`; }
}

async function submitPlanQuiz(event){
  event.preventDefault();
  const form=event.currentTarget;
  const planKey=form.dataset.planKey;
  const groups=[...form.querySelectorAll('.quiz-question-card')];
  const answers=groups.map(group=>group.querySelector('input[type="radio"]:checked')?.value);
  const result=form.querySelector('.quiz-result');
  if(answers.some(value=>value===undefined)){
    result.className='quiz-result failed'; result.textContent='Please answer all 10 questions.'; return;
  }
  const button=form.querySelector('.quiz-submit-btn');
  button.disabled=true; button.textContent='Checking answers...';
  try{
    const data=await api(`/api/quiz/${encodeURIComponent(planKey)}/submit`,{method:'POST',body:JSON.stringify({answers:answers.map(Number)})});
    result.className=`quiz-result ${data.passed?'passed':'failed'}`;
    result.innerHTML=`<strong>${data.score}/${data.total} - ${data.percentage}%</strong><br>${esc(data.message)}`;
    if(data.passed) form.querySelectorAll('input').forEach(input=>input.disabled=true);
  }catch(err){ result.className='quiz-result failed'; result.textContent=err.message || 'Quiz could not be submitted.'; }
  finally{ button.disabled=false; button.textContent='Submit Quiz'; }
}

function numberOrZero(value){
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}
function money(value){
  return '₹' + numberOrZero(value).toFixed(2);
}
function displayQty(value, unit){
  const raw = numberOrZero(value);
  const wholeUnits = ['pc','pcs','set','sets','sheet','sheets'];
  const normalized = String(unit || '').toLowerCase();
  const shown = wholeUnits.includes(normalized) ? Math.ceil(raw) : Number.isInteger(raw) ? raw : raw.toFixed(2);
  return `${shown} ${esc(unit || '')}`;
}

function calcPresetOptions(items, selectedName=''){
  const safeItems = Array.isArray(items) ? items : [];
  return `<option value="">Select saved item</option>` + safeItems.map((item, index)=>{
    const name = item && item.name ? item.name : `Item ${index + 1}`;
    const selected = name === selectedName ? 'selected' : '';
    return `<option value="${index}" ${selected}>${esc(name)}</option>`;
  }).join('');
}
function applyCalcPreset(row, item){
  if(!row || !item) return;
  const nameInput = row.querySelector('.calc-item-name');
  const typeSelect = row.querySelector('.calc-item-type');
  const unitSelect = row.querySelector('.calc-unit');
  const qtyInput = row.querySelector('.calc-base-qty');
  const wastageInput = row.querySelector('.calc-wastage');
  const packSizeInput = row.querySelector('.calc-pack-size');
  const packPriceInput = row.querySelector('.calc-pack-price');
  const itemType = String(item.type || 'Ingredient').toLowerCase().includes('tool') || String(item.type || '').toLowerCase().includes('reusable') ? 'Reusable Tool' : 'Ingredient';
  if(nameInput) nameInput.value = item.name || '';
  if(typeSelect) typeSelect.value = itemType;
  if(unitSelect && item.unit) unitSelect.value = String(item.unit).toLowerCase();
  if(qtyInput) qtyInput.value = item.qty || 0;
  if(wastageInput) wastageInput.value = item.wastage || 0;
  if(packSizeInput) packSizeInput.value = item.pack_size || 1;
  if(packPriceInput) packPriceInput.value = item.pack_price || 0;
}
function getModeSimpleName(label){
  const text = String(label || '').toLowerCase();
  if(text.includes('student')) return 'students / practice sets';
  if(text.includes('cake')) return 'cakes';
  if(text.includes('dessert')) return 'dessert batches';
  if(text.includes('ganache')) return 'ganache batches';
  if(text.includes('cream')) return 'cream batches';
  return 'batches';
}
function renderCourseCalculation(course){
  const calc = course && course.calculation ? course.calculation : null;
  const items = calc && Array.isArray(calc.items) ? calc.items : [];
  if(!items.length) return '';
  const title = esc(course.title || 'Course');
  const modeLabel = esc(calc.mode_label || 'How many batches?');
  const simpleMode = esc(getModeSimpleName(calc.mode_label));
  const presetPayload = esc(JSON.stringify(items));
  const itemOptions = items.map(item=>`<option value="${esc(item.name)}"></option>`).join('');
  // Show only one calculator row first. Customer can add any extra item they want.
  const startItems = [{name:'', type:'Ingredient', unit:'g', qty:0, wastage:0, pack_size:1, pack_price:0}];
  const rows = startItems.map((item, index)=>{
    const type = item.type || 'Ingredient';
    const unit = item.unit || 'g';
    const isReusable = String(type).toLowerCase().includes('reusable') || String(type).toLowerCase().includes('tool');
    const rowHelp = isReusable ? 'Reusable tool / equipment' : 'Ingredient';
    return `<div class="vertical-calc-card calc-row ${isReusable ? 'reusable-tool-row' : ''}" data-row-index="${index}">
      <div class="vertical-card-top">
        <span class="ingredient-badge">${rowHelp}</span>
        <button type="button" class="remove-calc-item" aria-label="Remove ${esc(item.name)}">Remove</button>
      </div>
      <label>Choose saved item
        <select class="calc-preset-item">${calcPresetOptions(items, item.name)}</select>
      </label>
      <label>Item name
        <input class="calc-item-name" list="courseIngredientList-${title.replace(/[^a-zA-Z0-9]/g,'')}" value="${esc(item.name)}" placeholder="Example: Sugar, Butter, Cream">
      </label>
      <div class="vertical-input-grid">
        <label>Type
          <select class="calc-item-type">
            <option ${!isReusable ? 'selected' : ''}>Ingredient</option>
            <option ${isReusable ? 'selected' : ''}>Reusable Tool</option>
          </select>
        </label>
        <label>Unit
          <select class="calc-unit">
            ${['g','kg','ml','l','pc','pcs','set','sheet'].map(u=>`<option value="${u}" ${String(unit).toLowerCase()===u ? 'selected' : ''}>${u}</option>`).join('')}
          </select>
        </label>
      </div>
      <div class="vertical-input-grid">
        <label>Quantity for 1 ${simpleMode}
          <input class="calc-base-qty" type="number" min="0" step="0.01" value="${esc(item.qty)}">
        </label>
        <label>Calculation method
          <select class="calc-operation">
            <option value="add">Add + count</option>
            <option value="multiply" selected>Multiply × count</option>
            <option value="average">Average ÷ count</option>
            <option value="divide">Divide ÷ count</option>
            <option value="subtract">Subtract − count</option>
          </select>
        </label>
      </div>
      <div class="vertical-input-grid">
        <label>Extra / wastage %
          <input class="calc-wastage" type="number" min="0" step="0.5" value="${esc(item.wastage || 0)}">
        </label>
        <label>Shop pack size
          <input class="calc-pack-size" type="number" min="0.01" step="0.01" value="${esc(item.pack_size || 1)}">
        </label>
      </div>
      <label>Price of 1 shop pack ₹
        <input class="calc-pack-price" type="number" min="0" step="1" value="${esc(item.pack_price || 0)}">
      </label>
      <div class="vertical-result-grid">
        <div><span>Total Qty</span><strong class="calc-total-qty">-</strong></div>
        <div><span>Final to Buy</span><strong class="calc-final-qty">-</strong></div>
        <div><span>Cost</span><strong class="calc-cost">₹0</strong></div>
      </div>
    </div>`;
  }).join('');
  return `<details class="course-excel-accordion no-download-doc clean-calculator customer-basic-calc vertical-calc-mode" open oncontextmenu="return false">
    <summary>
      <span class="notes-summary-icon">🧮</span>
      <span><strong>One Ingredient Calculator</strong><small>Add your own items and calculate in one simple place.</small></span>
      <em>Calculate</em>
    </summary>
    <div class="course-excel-calculator" data-course-title="${title}" data-calc-presets="${presetPayload}">
      <datalist id="courseIngredientList-${title.replace(/[^a-zA-Z0-9]/g,'')}">${itemOptions}</datalist>
      <div class="excel-calc-header compact-calc-hero basic-calc-hero vertical-calc-hero">
        <div>
          <span class="calc-kicker">Easy Vertical Calculator</span>
          <h3>${title}</h3>
          <p>Use this one calculator only. Add any ingredient or tool, select gram/ml/pcs, enter quantity and price, then choose add, multiply, subtract, divide, or average.</p>
        </div>
        <label>${modeLabel}
          <input class="calc-count" type="number" min="1" step="1" value="${esc(calc.default_count || 1)}">
          <small>Used for add, multiply, average, divide and subtract calculation.</small>
        </label>
      </div>
      <div class="calc-formula-strip vertical-formula-strip">
        <span>Add + Count</span>
        <span>Multiply × Count</span>
        <span>Divide ÷ Count</span>
        <span>Subtract − Count</span>
        <span>Average ÷ Count</span>
      </div>
      <div class="live-calc-explanation simple-live-summary" aria-live="polite"></div>
      <div class="vertical-calc-actions">
        <button type="button" class="add-calc-item">+ Add New Ingredient</button>
        <small>Customer can add any item freely: sugar, butter, cream, chocolate, box, tools, etc.</small>
      </div>
      <div class="vertical-calc-list basic-calc-wrap">${rows}</div>
      <div class="excel-summary-grid easy-summary-grid compact-summary-grid basic-summary-grid">
        <div><span>SUM - Total Cost</span><strong class="calc-grand-total">₹0</strong></div>
        <div><span>Ingredients Sum</span><strong class="calc-ingredient-total">₹0</strong></div>
        <div><span>Tools Sum</span><strong class="calc-tool-total">₹0</strong></div>
        <div><span>AVERAGE - Cost for 1</span><strong class="calc-average-cost">₹0</strong></div>
      </div>
      <p class="basic-calc-note"><b>Note:</b> This is only an ingredient, tools, and quantity calculator. It is not a course-fee or revenue collection area.</p>
      <div class="note-watermark excel-watermark">SARVATHAA STUDENT COPY</div>
    </div>
  </details>`;
}
function calculateByOperation(baseQty, count, operation){
  const safeCount = Math.max(1, numberOrZero(count));
  const qty = numberOrZero(baseQty);
  if(operation === 'average') return qty / safeCount;
  if(operation === 'divide') return qty / safeCount;
  if(operation === 'subtract') return Math.max(0, qty - safeCount);
  if(operation === 'add') return qty + safeCount;
  return qty * safeCount;
}
function recalcQuickMath(calculator){
  const a = numberOrZero(calculator.querySelector('.quick-a')?.value || 0);
  const b = numberOrZero(calculator.querySelector('.quick-b')?.value || 0);
  const op = calculator.querySelector('.quick-op')?.value || 'add';
  let result = 0;
  if(op === 'subtract') result = a - b;
  else if(op === 'multiply') result = a * b;
  else if(op === 'divide') result = b === 0 ? 0 : a / b;
  else if(op === 'average') result = (a + b) / 2;
  else result = a + b;
  const out = calculator.querySelector('.quick-result');
  if(out) out.textContent = `= ${Number.isInteger(result) ? result : result.toFixed(2)}`;
}
function recalcCourseCalculation(calculator){
  if(!calculator) return;
  const count = Math.max(1, numberOrZero(calculator.querySelector('.calc-count')?.value || 1));
  let grandTotal = 0;
  let ingredientTotal = 0;
  let toolTotal = 0;
  calculator.querySelectorAll('.calc-row').forEach(row=>{
    const qty = numberOrZero(row.querySelector('.calc-base-qty')?.value || 0);
    const unit = row.querySelector('.calc-unit')?.value || 'g';
    const type = String(row.querySelector('.calc-item-type')?.value || 'Ingredient').toLowerCase();
    const operation = row.querySelector('.calc-operation')?.value || 'multiply';
    const isReusable = type.includes('reusable') || type.includes('tool');
    const isTool = type.includes('tool');
    const packSize = Math.max(0.01, numberOrZero(row.querySelector('.calc-pack-size')?.value || 1));
    const wastage = isReusable ? 0 : numberOrZero(row.querySelector('.calc-wastage')?.value || 0);
    const packPrice = numberOrZero(row.querySelector('.calc-pack-price')?.value || 0);
    const totalQty = isReusable ? qty : calculateByOperation(qty, count, operation);
    const finalQty = totalQty + (totalQty * wastage / 100);
    const buyingQtyForCost = ['pc','pcs','set','sets','sheet','sheets'].includes(unit.toLowerCase()) ? Math.ceil(finalQty) : finalQty;
    const cost = (buyingQtyForCost / packSize) * packPrice;
    grandTotal += cost;
    if(isReusable || isTool) toolTotal += cost; else ingredientTotal += cost;
    row.querySelector('.calc-total-qty').textContent = displayQty(totalQty, unit);
    row.querySelector('.calc-final-qty').textContent = displayQty(finalQty, unit);
    row.querySelector('.calc-cost').textContent = money(cost);
    const wastageInput = row.querySelector('.calc-wastage');
    if(isReusable && wastageInput){ wastageInput.value = 0; wastageInput.disabled = true; }
    if(!isReusable && wastageInput){ wastageInput.disabled = false; }
    const badge = row.querySelector('.ingredient-badge');
    if(badge) badge.textContent = isReusable ? 'Reusable tool / equipment' : 'Ingredient';
  });
  calculator.querySelector('.calc-grand-total').textContent = money(grandTotal);
  calculator.querySelector('.calc-ingredient-total').textContent = money(ingredientTotal);
  calculator.querySelector('.calc-tool-total').textContent = money(toolTotal);
  calculator.querySelector('.calc-average-cost').textContent = `${money(grandTotal / count)} / count`;
  const explanation = calculator.querySelector('.live-calc-explanation');
  if(explanation){
    const courseTitle = calculator.dataset.courseTitle || 'this course';
    const itemCount = calculator.querySelectorAll('.calc-row').length;
    explanation.innerHTML = `<strong>${esc(courseTitle)}:</strong> ${itemCount} items added. For <b>${count}</b> count, check each card's <b>Final to Buy</b>. Total SUM is <b>${money(grandTotal)}</b>. Average cost for 1 count is <b>${money(grandTotal / count)}</b>.`;
  }
}
function createBlankCalcItem(presetItems=[]){
  const div = document.createElement('div');
  div.className = 'vertical-calc-card calc-row';
  div.innerHTML = `<div class="vertical-card-top"><span class="ingredient-badge">Ingredient</span><button type="button" class="remove-calc-item">Remove</button></div>
    <label>Choose saved item<select class="calc-preset-item">${calcPresetOptions(presetItems)}</select></label>
    <label>Item name<input class="calc-item-name" value="" placeholder="Example: Sugar, Butter, Cream"></label>
    <div class="vertical-input-grid"><label>Type<select class="calc-item-type"><option selected>Ingredient</option><option>Reusable Tool</option></select></label><label>Unit<select class="calc-unit"><option value="g" selected>g</option><option value="kg">kg</option><option value="ml">ml</option><option value="l">l</option><option value="pc">pc</option><option value="pcs">pcs</option><option value="set">set</option><option value="sheet">sheet</option></select></label></div>
    <div class="vertical-input-grid"><label>Quantity for 1<input class="calc-base-qty" type="number" min="0" step="0.01" value="0"></label><label>Calculation method<select class="calc-operation"><option value="add">Add + count</option><option value="multiply" selected>Multiply × count</option><option value="average">Average ÷ count</option><option value="divide">Divide ÷ count</option><option value="subtract">Subtract − count</option></select></label></div>
    <div class="vertical-input-grid"><label>Extra / wastage %<input class="calc-wastage" type="number" min="0" step="0.5" value="0"></label><label>Shop pack size<input class="calc-pack-size" type="number" min="0.01" step="0.01" value="1"></label></div>
    <label>Price of 1 shop pack ₹<input class="calc-pack-price" type="number" min="0" step="1" value="0"></label>
    <div class="vertical-result-grid"><div><span>Total Qty</span><strong class="calc-total-qty">-</strong></div><div><span>Final to Buy</span><strong class="calc-final-qty">-</strong></div><div><span>Cost</span><strong class="calc-cost">₹0</strong></div></div>`;
  return div;
}
function bindCourseCalculators(root=document){
  root.querySelectorAll('.course-excel-calculator').forEach(calculator=>{
    try{ calculator.__calcPresetItems = JSON.parse(calculator.dataset.calcPresets || '[]'); }catch(_){ calculator.__calcPresetItems = []; }
    recalcCourseCalculation(calculator);
    calculator.addEventListener('input', ()=>recalcCourseCalculation(calculator));
    calculator.addEventListener('change', (event)=>{
      const presetSelect = event.target.closest('.calc-preset-item');
      if(presetSelect){
        const card = presetSelect.closest('.calc-row');
        const item = calculator.__calcPresetItems && calculator.__calcPresetItems[Number(presetSelect.value)];
        applyCalcPreset(card, item);
      }
      recalcCourseCalculation(calculator);
    });
    calculator.addEventListener('click', (event)=>{
      const addBtn = event.target.closest('.add-calc-item');
      const removeBtn = event.target.closest('.remove-calc-item');
      if(addBtn){
        const list = calculator.querySelector('.vertical-calc-list');
        if(list){ list.appendChild(createBlankCalcItem(calculator.__calcPresetItems || [])); recalcCourseCalculation(calculator); }
      }
      if(removeBtn){
        const card = removeBtn.closest('.calc-row');
        if(card && calculator.querySelectorAll('.calc-row').length > 1){ card.remove(); recalcCourseCalculation(calculator); }
      }
    });
  });
}

function showStudentOnboarding(selectedVideoIndex=0){
  let modal = document.getElementById('studentOnboardingModal');
  if(!modal){
    modal = document.createElement('div');
    modal.id = 'studentOnboardingModal';
    modal.className = 'mandatory-form-overlay';
    document.body.appendChild(modal);
  }
  modal.innerHTML = `
    <div class="mandatory-form-card" role="dialog" aria-modal="true">
      <div class="mandatory-form-head">
        <span>Required before video access</span>
        <h2>Student Information Form</h2>
        <p>You must complete this form one time before watching paid course videos. This form cannot be skipped.</p>
      </div>
      <form id="studentOnboardingForm" class="mandatory-student-form">
        <input type="hidden" id="selectedVideoIndex" value="${Number(selectedVideoIndex) || 0}">
        <label>Full Name<input id="profileFullName" required maxlength="160"></label>
        <div class="form-two-col">
          <label>Age<input id="profileAge" required type="number" min="1" max="120"></label>
          <label>Gender<select id="profileGender" required><option value="">Select</option><option>Male</option><option>Female</option><option>Other</option><option>Prefer not to say</option></select></label>
        </div>
        <div class="form-two-col">
          <label>Mobile Number<input id="profileMobile" required maxlength="30"></label>
          <label>Email Address<input id="profileEmail" required type="email" maxlength="180"></label>
        </div>
        <label>Full Address<textarea id="profileAddress" required rows="3"></textarea></label>
        <label>Occupation<input id="profileOccupation" required maxlength="120" placeholder="Student / Homemaker / Business owner / Employee"></label>
        <label>Why did you choose this course?
          <select id="profileWhy" required><option value="">Select reason</option>${optionTags(onboardingOptions.whyCourse)}</select>
        </label>
        <label>What do you want to achieve after completing this course?
          <select id="profileGoal" required><option value="">Select goal</option>${optionTags(onboardingOptions.goals)}</select>
        </label>
        <label>When do you want to achieve your goal?
          <select id="profileTimeline" required><option value="">Select timeline</option>${optionTags(onboardingOptions.timeline)}</select>
        </label>
        <label class="terms-line"><input id="profileTerms" required type="checkbox"> <span>I confirm the above information is correct.</span></label>
        <button class="btn" type="submit">Submit & Unlock Video</button>
        <p class="form-message" id="profileMessage"></p>
      </form>
    </div>`;
  document.body.classList.add('modal-locked');

  document.getElementById('studentOnboardingForm').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const msg = document.getElementById('profileMessage');
    msg.textContent = 'Saving your information...';
    const payload = {
      full_name: profileFullName.value.trim(),
      age: profileAge.value,
      gender: profileGender.value,
      mobile_number: profileMobile.value.trim(),
      email_address: profileEmail.value.trim(),
      full_address: profileAddress.value.trim(),
      occupation: profileOccupation.value.trim(),
      why_course: profileWhy.value,
      goal_after_course: profileGoal.value,
      goal_timeline: profileTimeline.value,
      terms_accepted: profileTerms.checked
    };
    try{
      const data = await api('/api/student/profile', {method:'POST', body:JSON.stringify(payload)});
      msg.textContent = data.message || 'Saved successfully';
      const selected = document.getElementById('selectedVideoIndex').value || '0';
      modal.remove();
      document.body.classList.remove('modal-locked');
      await loadMyCourses(Number(selected));
      setTimeout(()=>document.getElementById(`video-${selected}`)?.scrollIntoView({behavior:'smooth', block:'start'}), 250);
    }catch(err){ msg.textContent = err.message || 'Unable to save information'; }
  });
}

function renderInlineStudentForm(){
  return `
  <div class="mandatory-inline-form-card" id="inlineStudentFormCard">
    <div class="mandatory-form-head">
      <span>Mandatory Before First Video Access</span>
      <h2>Student Information Form</h2>
      <p>Complete this one-time form to unlock your paid course videos. All fields are required.</p>
    </div>
    <form id="studentOnboardingForm" class="mandatory-student-form">
      <input type="hidden" id="selectedVideoIndex" value="0">
      <label>Full Name<input id="profileFullName" required maxlength="160"></label>
      <div class="form-two-col">
        <label>Age<input id="profileAge" required type="number" min="1" max="120"></label>
        <label>Gender<select id="profileGender" required><option value="">Select</option><option>Male</option><option>Female</option><option>Other</option><option>Prefer not to say</option></select></label>
      </div>
      <div class="form-two-col">
        <label>Mobile Number<input id="profileMobile" required maxlength="30"></label>
        <label>Email Address<input id="profileEmail" required type="email" maxlength="180"></label>
      </div>
      <label>Full Address<textarea id="profileAddress" required rows="3"></textarea></label>
      <label>Occupation<input id="profileOccupation" required maxlength="120" placeholder="Student / Homemaker / Business owner / Employee"></label>
      <label>Why did you choose this course?
        <select id="profileWhy" required><option value="">Select reason</option>${optionTags(onboardingOptions.whyCourse)}</select>
      </label>
      <label>What do you want to achieve after completing this course?
        <select id="profileGoal" required><option value="">Select goal</option>${optionTags(onboardingOptions.goals)}</select>
      </label>
      <label>When do you want to achieve your goal?
        <select id="profileTimeline" required><option value="">Select timeline</option>${optionTags(onboardingOptions.timeline)}</select>
      </label>
      <label class="terms-line"><input id="profileTerms" required type="checkbox"> <span>I confirm the above information is correct.</span></label>
      <button class="btn" type="submit">Submit & Unlock Videos</button>
      <p class="form-message" id="profileMessage"></p>
    </form>
  </div>`;
}

function bindStudentForm(openVideoIndex=0){
  const form = document.getElementById('studentOnboardingForm');
  if(!form) return;
  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const msg = document.getElementById('profileMessage');
    msg.textContent = 'Saving your information...';
    const payload = {
      full_name: profileFullName.value.trim(),
      age: profileAge.value,
      gender: profileGender.value,
      mobile_number: profileMobile.value.trim(),
      email_address: profileEmail.value.trim(),
      full_address: profileAddress.value.trim(),
      occupation: profileOccupation.value.trim(),
      why_course: profileWhy.value,
      goal_after_course: profileGoal.value,
      goal_timeline: profileTimeline.value,
      terms_accepted: profileTerms.checked
    };
    try{
      const data = await api('/api/student/profile', {method:'POST', body:JSON.stringify(payload)});
      msg.textContent = data.message || 'Saved successfully. Unlocking videos...';
      await loadMyCourses(openVideoIndex);
      setTimeout(()=>document.getElementById(`video-${openVideoIndex}`)?.scrollIntoView({behavior:'smooth', block:'start'}), 250);
    }catch(err){
      msg.textContent = err.message || 'Unable to save information';
    }
  });
}


function buildOneCourseCalculator(courses=[]){
  const allItems = [];
  const seen = new Set();
  courses.forEach(course=>{
    const calc = course && course.calculation ? course.calculation : null;
    const items = calc && Array.isArray(calc.items) ? calc.items : [];
    items.forEach(item=>{
      const key = String(item.name || '').trim().toLowerCase();
      if(key && !seen.has(key)){
        seen.add(key);
        allItems.push(item);
      }
    });
  });
  if(!allItems.length) return '';
  return `<div class="dashboard-full-width one-main-calculator-wrap">${renderCourseCalculation({
    title:'Sarvathaa Course Ingredient Calculator',
    calculation:{
      mode_label:'How many count / batch?',
      default_count:1,
      items:allItems
    }
  })}</div>`;
}

async function loadMyCourses(openVideoIndex=null){
  const box = document.getElementById('coursesContainer');
  if(!box) return;
  try{
    box.innerHTML = '<div class="dashboard-loading">Loading your paid course videos...</div>';
    const data = await api('/api/my-courses');
    document.getElementById('studentWelcome').textContent = `Welcome, ${data.student.name}`;
    document.getElementById('studentExpiry').textContent = `Access valid until: ${data.student.expiry_date}`;

    const purchasedCourses = (data.courses && data.courses.length) ? data.courses : (data.course ? [data.course] : []);
    const profileCompleted = !!data.student.profile_completed;

    const paidCourseSections = purchasedCourses.map((c, courseIndex)=>{
      const courseVideos = (c.videos && c.videos.length ? c.videos : [{title:'Preview Module - Course Introduction', url:'assets/videos/preview-demo.mp4'}]);
      const lessonCards = courseVideos.map((v, index)=>{
        const globalIndex = `${courseIndex}-${index}`;
        return `<div class="card video-lesson-card module-video-card" id="video-${globalIndex}">
          <div class="module-video-head">
            <span class="module-number">Module ${String(index + 1).padStart(2, '0')}</span>
            <span class="module-status">${profileCompleted ? 'Unlocked Video' : 'Locked Until Form Completed'}</span>
          </div>
          <h3>${esc(v.title)}</h3>
          <p class="muted">${profileCompleted ? 'Watch your paid course lesson below.' : 'This paid video is visible, but it will play only after completing the student form.'}</p>
          ${profileCompleted ? renderCourseVideo(v.url, v.title) : `<div class="locked-video-box start-onboarding-box" data-video-index="${globalIndex}"><div class="lock-icon">🔒</div><p><strong>${esc(v.title)}</strong></p><p>Complete the form above to unlock this video.</p><button class="btn start-onboarding-btn" data-video-index="${globalIndex}" type="button">Go to Form</button></div>`}
        </div>`;
      }).join('');
      return `<div class="student-course-header dashboard-full-width">
          <div>
            <span class="course-access-badge">✓ ${esc(c.title || 'Plan')} Accessed</span>
            <h2>${esc(c.title || 'Your Paid Course')}</h2>
            <p>${profileCompleted ? 'Watch your lessons and open course notes whenever needed.' : 'Complete the form above to unlock your videos.'}</p>
          </div>
          <div class="course-access-meta"><span>${esc(c.price || 'Paid')}</span><span>Valid until ${esc(c.expiry_date || data.student.expiry_date)}</span></div>
        </div>
        <div class="course-learning-area dashboard-full-width">
          <div class="course-area-head"><span>🎥 Videos</span><strong>${courseVideos.length} Lessons</strong></div>
          <div class="course-video-lessons-wrap">${lessonCards}</div>
          ${profileCompleted ? `<div class="course-support-grid">${renderCourseDocumentLink(c)}</div>` : ''}
          ${profileCompleted ? renderPlanQuiz(c) : ''}
        </div>`;
    }).join('');

    const purchasedKeys = new Set(purchasedCourses.map(c=>c.key));
    const lockedOtherCourses = (data.all_courses || []).filter(x=>!purchasedKeys.has(x.key)).map(x=>`
      <div class="card locked-course-card">
        <img src="${esc(x.image)}" alt="${esc(x.title)}">
        <div class="course-body">
          <h3>🔒 ${esc(x.title)}</h3>
          <p>Not activated. Videos and notes for this plan are hidden from your login.</p>
          <a class="btn secondary" target="_blank" href="https://wa.me/919886916067?text=${encodeURIComponent('Hi Sarvathaa Team, I want to activate another plan. Plan: ' + x.title + '. Please add it to my existing login.')}" >Request This Plan</a>
        </div>
      </div>`).join('');

    box.innerHTML = `
      <div class="dashboard-full-width">
        ${profileCompleted ? `<div class="success-alert"><strong>Profile Completed:</strong> Your paid videos are unlocked.</div>` : renderInlineStudentForm()}
      </div>
      ${paidCourseSections}
      ${profileCompleted ? buildOneCourseCalculator(purchasedCourses) : ''}
      <div class="section-title locked-title dashboard-full-width"><span>Other Plans</span><h2>Plans Not Activated</h2><p>You can see the plan names, but their course content remains hidden until admin activates access.</p></div>
      ${lockedOtherCourses}`;

    bindStudentForm(openVideoIndex ?? '0-0');
    bindCourseCalculators(box);
    box.querySelectorAll('.load-plan-quiz-btn').forEach(button=>button.addEventListener('click',()=>loadPlanQuiz(button.dataset.planKey)));
    box.querySelectorAll('.start-onboarding-btn, .start-onboarding-box').forEach(btn=>btn.addEventListener('click', (event)=>{
      event.stopPropagation();
      const formCard = document.getElementById('inlineStudentFormCard');
      if(formCard){ formCard.scrollIntoView({behavior:'smooth', block:'start'}); }
    }));
    if(openVideoIndex !== null && profileCompleted){
      setTimeout(()=>document.getElementById(`video-${openVideoIndex}`)?.scrollIntoView({behavior:'smooth', block:'start'}), 100);
    }
  }catch(err){
    box.innerHTML = `<div class="wa-enquiry dashboard-full-width"><h2>${esc(err.message || 'Please login again')}</h2><p>Course videos will show only when you run the site through Flask and login with a valid student username/password.</p><a class="btn" href="course-login.html">Go to Login</a></div>`;
  }
}

// Basic view-only protection for course documents. This discourages download/share actions in the browser.
document.addEventListener('contextmenu', (e)=>{ if(e.target.closest('.no-download-doc')) e.preventDefault(); });
document.addEventListener('keydown', (e)=>{
  if(!document.querySelector('.no-download-doc')) return;
  const key = String(e.key || '').toLowerCase();
  if((e.ctrlKey || e.metaKey) && ['s','p','u','c'].includes(key)){ e.preventDefault(); }
});

loadMyCourses();
document.getElementById('logoutBtn')?.addEventListener('click', async()=>{await api('/api/logout',{method:'POST'}); location.href='course-login.html';});

const adminLoginForm=document.getElementById('adminLoginForm');
adminLoginForm?.addEventListener('submit', async(e)=>{
  e.preventDefault();
  const msg=document.getElementById('adminLoginMessage'); msg.textContent='Checking...';
  try{ await api('/api/admin-login',{method:'POST',body:JSON.stringify({username:adminUsername.value.trim(), password:adminPassword.value})}); location.href='/admin'; }
  catch(err){ msg.textContent=err.message || 'Admin login failed'; }
});

function getAdminSearchQuery(){ return (document.getElementById('studentSearchInput')?.value || '').trim(); }

async function loadStudents(){
  const tbody=document.getElementById('studentsTable'); if(!tbody) return;
  try{
    const query = getAdminSearchQuery();
    const data=await api('/api/admin/students' + (query ? `?q=${encodeURIComponent(query)}` : ''));
    tbody.innerHTML=data.students.map(s=>{
      const savedPassword = s.access_password || '';
      const loginMessage = buildLoginMessage({...s, password: savedPassword});
      const studentWa = savedPassword ? `<a class="btn mini-btn" target="_blank" href="${whatsappHref(s.phone, loginMessage)}">Send</a>` : `<span class="muted small-note">No password</span>`;
      return `<tr>
        <td>${esc(s.name)}</td>
        <td>${esc(s.phone)}</td>
        <td><strong>${esc(s.username)}</strong><br><span class="password-pill">${savedPassword ? esc(savedPassword) : 'Not saved before'}</span></td>
        <td>${esc(s.course_title)}</td>
        <td>${esc(s.created_at ? s.created_at.slice(0,10) : '')}</td>
        <td><span class="${s.profile_completed ? 'status-active' : 'status-pending'}">${s.profile_completed ? 'Completed' : 'Pending'}</span></td>
        <td><span class="${s.is_active ? 'status-active' : 'status-off'}">${s.is_active?'Active':'Off'}</span></td>
        <td class="actions-cell"><div class="table-actions">${studentWa}<button class="btn mini-btn secondary view-student-btn" type="button" data-id="${s.id}">View/Edit</button><button class="btn mini-btn add-course-btn" type="button" data-id="${s.id}">Add Course</button><button class="btn mini-btn danger delete-student-btn" type="button" data-id="${s.id}" data-name="${esc(s.name)}">Delete</button></div></td>
      </tr>`;
    }).join('') || '<tr><td colspan="8">No students found</td></tr>';
  }catch(err){ location.href='admin-login.html'; }
}
loadStudents();

function ensureAdminModal(){
  let modal=document.getElementById('adminStudentModal');
  if(!modal){ modal=document.createElement('div'); modal.id='adminStudentModal'; modal.className='admin-modal-overlay'; document.body.appendChild(modal); }
  return modal;
}
function renderStudentEditModal(s){
  const modal=ensureAdminModal();
  modal.innerHTML=`<div class="admin-modal-card">
    <div class="admin-modal-head"><div><span>Student Details</span><h2>${esc(s.name)}</h2><p>Courses: ${esc(s.course_title)} | Registered: ${esc((s.created_at || '').slice(0,10))} | Profile: ${s.profile_completed ? 'Completed' : 'Pending'}</p></div><button class="modal-close-btn" type="button">×</button></div>
    <div class="student-detail-box"><strong>Current Paid Courses:</strong>${(s.courses || []).map(c=>`<p>✅ ${esc(c.title)} - valid until ${esc(c.expiry_date)}</p>`).join('') || '<p>No active course found</p>'}</div>
    <form id="adminProfileEditForm" class="mandatory-student-form admin-edit-form">
      <div class="form-two-col"><label>Full Name<input id="editFullName" required value="${esc(s.full_name || s.name || '')}"></label><label>Age<input id="editAge" required type="number" min="1" max="120" value="${esc(s.age || '')}"></label></div>
      <div class="form-two-col"><label>Gender<select id="editGender" required><option value="">Select</option>${optionTags(['Male','Female','Other','Prefer not to say'], s.gender || '')}</select></label><label>Mobile Number<input id="editMobile" required value="${esc(s.mobile_number || s.phone || '')}"></label></div>
      <label>Email Address<input id="editEmail" required type="email" value="${esc(s.email_address || s.email || '')}"></label>
      <label>Full Address<textarea id="editAddress" required rows="3">${esc(s.full_address || '')}</textarea></label>
      <label>Occupation<input id="editOccupation" required value="${esc(s.occupation || '')}"></label>
      <label>Why did you choose this course?<select id="editWhy" required><option value="">Select reason</option>${optionTags(onboardingOptions.whyCourse, s.why_course || '')}</select></label>
      <label>Achievement Goal<select id="editGoal" required><option value="">Select goal</option>${optionTags(onboardingOptions.goals, s.goal_after_course || '')}</select></label>
      <label>Goal Timeline<select id="editTimeline" required><option value="">Select timeline</option>${optionTags(onboardingOptions.timeline, s.goal_timeline || '')}</select></label>
      <div class="student-detail-box"><p><strong>Username:</strong> ${esc(s.username)}</p><p><strong>Purchased Course:</strong> ${esc(s.course_title)}</p><p><strong>Expiry:</strong> ${esc(s.expiry_date)}</p><p><strong>Profile Updated:</strong> ${esc(s.profile_updated_at || '')}</p></div>
      <button class="btn" type="submit">Save Student Information</button><p class="form-message" id="adminEditMessage"></p>
    </form>
  </div>`;
  modal.querySelector('.modal-close-btn').addEventListener('click', ()=>modal.remove());
  document.getElementById('adminProfileEditForm').addEventListener('submit', async(e)=>{
    e.preventDefault();
    const msg=document.getElementById('adminEditMessage'); msg.textContent='Saving...';
    const payload={full_name:editFullName.value.trim(), age:editAge.value, gender:editGender.value, mobile_number:editMobile.value.trim(), email_address:editEmail.value.trim(), full_address:editAddress.value.trim(), occupation:editOccupation.value.trim(), why_course:editWhy.value, goal_after_course:editGoal.value, goal_timeline:editTimeline.value};
    try{ const data=await api(`/api/admin/students/${s.id}/profile`,{method:'PUT',body:JSON.stringify(payload)}); msg.textContent=data.message || 'Saved'; await loadStudents(); }
    catch(err){ msg.textContent=err.message || 'Unable to save'; }
  });
}

function renderAddCourseModal(s){
  const modal=ensureAdminModal();
  const currentCourses = (s.courses || []).map(c=>`<p>✅ ${esc(c.title)} - valid until ${esc(c.expiry_date)}</p>`).join('') || '<p>No active course found</p>';
  modal.innerHTML=`<div class="admin-modal-card compact-admin-modal">
    <div class="admin-modal-head"><div><span>Add New Course</span><h2>${esc(s.name)}</h2><p>Use same username and password. Do not create a duplicate login.</p></div><button class="modal-close-btn" type="button">×</button></div>
    <div class="student-detail-box"><p><strong>Username:</strong> ${esc(s.username)}</p><p><strong>Password:</strong> ${esc(s.access_password || 'Same existing password')}</p><p><strong>Current Courses:</strong></p>${currentCourses}</div>
    <form id="adminAddCourseForm" class="course-form compact-course-form">
      <label>Select New Course<select id="addCourseKey" required>${courseSelectOptions()}</select></label>
      <label>Access Valid Until<input id="addCourseExpiry" required type="date"></label>
      <button class="btn" type="submit">Add Course to Same Login</button>
      <p class="form-message" id="addCourseMessage"></p>
    </form>
  </div>`;
  modal.querySelector('.modal-close-btn').addEventListener('click', ()=>modal.remove());
  const expiry = modal.querySelector('#addCourseExpiry');
  if(expiry){ const d=new Date(); d.setFullYear(d.getFullYear()+1); expiry.value=d.toISOString().slice(0,10); }
  modal.querySelector('#adminAddCourseForm').addEventListener('submit', async(e)=>{
    e.preventDefault();
    const msg=modal.querySelector('#addCourseMessage'); msg.textContent='Adding course...';
    try{
      const data=await api(`/api/admin/students/${s.id}/courses`,{method:'POST',body:JSON.stringify({course_key:addCourseKey.value, expiry_date:addCourseExpiry.value})});
      const login=data.login;
      const text=buildLoginMessage(login);
      const mailSubject=encodeURIComponent('Sarvathaa New Course Added');
      const mailBody=encodeURIComponent(text);
      const emailStatus=data.email_message ? `<p class="email-status ${data.email_sent ? 'success' : 'warning'}"><strong>Email:</strong> ${esc(data.email_message)}</p>` : '';
      const studentEmailBtn=login.email ? `<a class="btn secondary" target="_blank" href="mailto:${encodeURIComponent(login.email)}?subject=${mailSubject}&body=${mailBody}">Open Email</a>` : '';
      msg.innerHTML=`<div class="created-login-box"><h3>✅ Course Added</h3><p><strong>Username:</strong> ${esc(login.username)}</p><p><strong>Password:</strong> ${esc(login.password || 'Same as existing')}</p><p><strong>New Course:</strong> ${esc(login.course_title)}</p><p><strong>Valid Until:</strong> ${esc(login.expiry_date)}</p>${emailStatus}<div class="created-login-actions"><a class="btn" target="_blank" href="${whatsappHref(login.phone, text)}">Send to Student WhatsApp</a>${studentEmailBtn}</div></div>`;
      await loadStudents();
    }catch(err){ msg.textContent=err.message || 'Unable to add course'; }
  });
}

let searchTimer=null;
document.getElementById('studentSearchInput')?.addEventListener('input', ()=>{ clearTimeout(searchTimer); searchTimer=setTimeout(loadStudents, 300); });
document.getElementById('studentSearchBtn')?.addEventListener('click', loadStudents);
document.getElementById('exportStudentsBtn')?.addEventListener('click', ()=>{
  const q=getAdminSearchQuery();
  window.location.href='/api/admin/students/export' + (q ? `?q=${encodeURIComponent(q)}` : '');
});

document.getElementById('studentsTable')?.addEventListener('click', async (e)=>{
  const viewBtn=e.target.closest('.view-student-btn');
  if(viewBtn){
    try{ const data=await api(`/api/admin/students/${viewBtn.dataset.id}`); renderStudentEditModal(data.student); }
    catch(err){ alert(err.message || 'Unable to load student details'); }
    return;
  }
  const addCourseBtn=e.target.closest('.add-course-btn');
  if(addCourseBtn){
    try{ const data=await api(`/api/admin/students/${addCourseBtn.dataset.id}`); renderAddCourseModal(data.student); }
    catch(err){ alert(err.message || 'Unable to load student details'); }
    return;
  }
  const btn = e.target.closest('.delete-student-btn');
  if(!btn) return;
  const name = btn.dataset.name || 'this student';
  if(!confirm(`Delete ${name} from customer access list?`)) return;
  btn.disabled = true; btn.textContent = 'Deleting...';
  try{ await api(`/api/admin/students/${btn.dataset.id}`, {method:'DELETE'}); await loadStudents(); }
  catch(err){ alert(err.message || 'Unable to delete student'); btn.disabled = false; btn.textContent = 'Delete'; }
});

const addStudentForm=document.getElementById('addStudentForm');
addStudentForm?.addEventListener('submit', async(e)=>{
  e.preventDefault();
  const msg=document.getElementById('addStudentMessage'); msg.textContent='Saving...';
  const payload={name:studentName.value.trim(), email:studentEmail.value.trim(), phone:studentPhone.value.trim(), username:studentUsername.value.trim(), password:studentPassword.value, course_key:studentCourse.value, expiry_date:studentExpiryDate.value};
  try{
    const data=await api('/api/admin/students',{method:'POST',body:JSON.stringify(payload)});
    const login = data.login;
    const courseLoginText = buildLoginMessage(login);
    const mailSubject = encodeURIComponent('Sarvathaa Course Login Details');
    const mailBody = encodeURIComponent(courseLoginText);
    const emailStatus = data.email_message ? `<p class="email-status ${data.email_sent ? 'success' : 'warning'}"><strong>Email:</strong> ${esc(data.email_message)}</p>` : '';
    const studentEmailBtn = login.email ? `<a class="btn secondary" target="_blank" href="mailto:${encodeURIComponent(login.email)}?subject=${mailSubject}&body=${mailBody}">Open Email</a>` : '';
    msg.innerHTML = `<div class="created-login-box"><h3>✅ Login Created</h3><p><strong>Username:</strong> ${esc(login.username)}</p><p><strong>Password:</strong> ${esc(login.password)}</p><p><strong>Course:</strong> ${esc(login.course_title)}</p><p><strong>Login Link:</strong> ${esc(LOGIN_PAGE)}</p>${emailStatus}<div class="created-login-actions"><a class="btn" target="_blank" href="${whatsappHref(login.phone, courseLoginText)}">Send to Student WhatsApp</a>${studentEmailBtn}<a class="btn secondary" target="_blank" href="${whatsappHref(SARVATHAA_WHATSAPP_NUMBER, courseLoginText)}">Send to 7904336537</a></div></div>`;
    addStudentForm.reset(); setDefaultExpiry(); loadStudents();
  }
  catch(err){ msg.textContent=err.message || 'Unable to save'; }
});

document.getElementById('adminLogoutBtn')?.addEventListener('click', async()=>{await api('/api/admin-logout',{method:'POST'}); location.href='admin-login.html';});

async function loadPurchaseRequests(){
  const tbody=document.getElementById('purchaseRequestsTable');
  if(!tbody) return;
  try{
    const data=await api('/api/admin/purchase-requests');
    tbody.innerHTML=(data.requests || []).map(r=>`<tr>
      <td>#${r.id}<br><small>${esc((r.created_at || '').slice(0,10))}</small></td>
      <td><strong>${esc(r.name)}</strong><br>${esc(r.phone)}<br><small>${esc(r.email || '')}</small></td>
      <td>${esc(r.course_title)}</td>
      <td>${esc(r.final_price || r.original_price || '')}</td>
      <td><span class="${r.status==='activated'?'status-active':'status-pending'}">${esc(r.status)}</span></td>
      <td>${r.status==='pending' ? `<button class="btn mini-btn activate-request-btn" type="button" data-id="${r.id}" data-name="${esc(r.name)}" data-plan="${esc(r.course_title)}">Create Login</button>` : 'Completed'}</td>
    </tr>`).join('') || '<tr><td colspan="6">No course requests yet.</td></tr>';
  }catch(err){ tbody.innerHTML=`<tr><td colspan="6">${esc(err.message || 'Unable to load requests')}</td></tr>`; }
}

document.getElementById('purchaseRequestsTable')?.addEventListener('click', (e)=>{
  const btn=e.target.closest('.activate-request-btn');
  if(!btn) return;
  const modal=ensureAdminModal();
  modal.innerHTML=`<div class="admin-modal-card compact-admin-modal">
    <div class="admin-modal-head"><div><span>Activate Requested Plan</span><h2>${esc(btn.dataset.name)}</h2><p>${esc(btn.dataset.plan)}</p></div><button class="modal-close-btn" type="button">×</button></div>
    <form id="activateRequestForm" class="course-form compact-course-form">
      <label>Student Username<input id="requestUsername" required autocomplete="off" placeholder="Example: silver001"></label>
      <label>Create Password<input id="requestPassword" required type="password" minlength="6" placeholder="Minimum 6 characters"></label>
      <label>Access Valid Until<input id="requestExpiry" required type="date"></label>
      <button class="btn" type="submit">Create Password & Activate Plan</button>
      <p class="form-message" id="activateRequestMessage"></p>
    </form>
  </div>`;
  modal.querySelector('.modal-close-btn').addEventListener('click', ()=>modal.remove());
  const expiry=modal.querySelector('#requestExpiry');
  const d=new Date(); d.setFullYear(d.getFullYear()+1); expiry.value=d.toISOString().slice(0,10);
  modal.querySelector('#activateRequestForm').addEventListener('submit', async(event)=>{
    event.preventDefault();
    const msg=modal.querySelector('#activateRequestMessage'); msg.textContent='Creating login...';
    try{
      const data=await api(`/api/admin/purchase-requests/${btn.dataset.id}/activate`, {method:'POST', body:JSON.stringify({username:requestUsername.value.trim(),password:requestPassword.value,expiry_date:requestExpiry.value})});
      const login=data.login; const loginText=buildLoginMessage(login);
      msg.innerHTML=`<div class="created-login-box"><h3>✅ Plan Activated</h3><p><strong>Username:</strong> ${esc(login.username)}</p><p><strong>Password:</strong> ${esc(login.password)}</p><p><strong>Plan:</strong> ${esc(login.course_title)}</p><p><strong>Valid Until:</strong> ${esc(login.expiry_date)}</p><a class="btn" target="_blank" href="${whatsappHref(login.phone, loginText)}">Send Login on WhatsApp</a></div>`;
      await loadPurchaseRequests(); await loadStudents();
    }catch(err){ msg.textContent=err.message || 'Unable to activate plan'; }
  });
});
loadPurchaseRequests();

function addMonthsISO(months){
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0,10);
}
function setupCouponDefaults(){
  const start=document.getElementById('couponStart');
  const expiry=document.getElementById('couponExpiry');
  if(start && !start.value) start.value = new Date().toISOString().slice(0,10);
  if(expiry && !expiry.value) expiry.value = addMonthsISO(6);
}
async function loadCoupons(){
  const list=document.getElementById('couponList');
  if(!list) return;
  try{
    const data=await api('/api/admin/coupons');
    list.innerHTML=(data.coupons || []).map(c=>{
      const value = c.discount_type === 'amount' ? `₹${c.discount_value}` : `${c.discount_value}%`;
      const status = c.is_active ? 'Active' : 'Off';
      const statusClass = c.is_active ? 'status-active' : 'status-off';
      return `<div class="coupon-item">
        <div><strong>${esc(c.code)}</strong><p>${esc(value)} discount | ${esc(c.start_date)} to ${esc(c.expiry_date)}</p></div>
        <div class="coupon-actions"><span class="${statusClass}">${status}</span><button class="btn mini-btn secondary toggle-coupon-btn" type="button" data-id="${c.id}" data-active="${c.is_active ? '0':'1'}">${c.is_active ? 'Turn Off':'Turn On'}</button><button class="btn mini-btn danger delete-coupon-btn" type="button" data-id="${c.id}" data-code="${esc(c.code)}">Delete</button></div>
      </div>`;
    }).join('') || '<p class="muted">No coupons added yet.</p>';
  }catch(err){ list.innerHTML='<p class="muted">Coupon list not loaded. Check database table.</p>'; }
}
const couponForm=document.getElementById('couponForm');
couponForm?.addEventListener('submit', async(e)=>{
  e.preventDefault();
  const msg=document.getElementById('couponMessageAdmin');
  msg.textContent='Saving coupon...';
  const payload={
    code: couponCode.value.trim(),
    discount_type: couponType.value,
    discount_value: couponValue.value,
    start_date: couponStart.value,
    expiry_date: couponExpiry.value,
    is_active: couponActive.checked
  };
  try{
    const data=await api('/api/admin/coupons',{method:'POST',body:JSON.stringify(payload)});
    msg.textContent=data.message || 'Coupon saved';
    couponCode.value=''; couponValue.value='10'; couponType.value='percent'; couponActive.checked=true; setupCouponDefaults();
    await loadCoupons();
  }catch(err){ msg.textContent=err.message || 'Unable to save coupon'; }
});
document.getElementById('couponList')?.addEventListener('click', async(e)=>{
  const toggle=e.target.closest('.toggle-coupon-btn');
  if(toggle){
    try{ await api(`/api/admin/coupons/${toggle.dataset.id}/toggle`,{method:'POST',body:JSON.stringify({is_active: toggle.dataset.active === '1'})}); await loadCoupons(); }
    catch(err){ alert(err.message || 'Unable to update coupon'); }
    return;
  }
  const del=e.target.closest('.delete-coupon-btn');
  if(del){
    if(!confirm(`Delete coupon ${del.dataset.code}?`)) return;
    try{ await api(`/api/admin/coupons/${del.dataset.id}`,{method:'DELETE'}); await loadCoupons(); }
    catch(err){ alert(err.message || 'Unable to delete coupon'); }
  }
});
setupCouponDefaults();
loadCoupons();
function setDefaultExpiry(){ const expiryInput=document.getElementById('studentExpiryDate'); if(expiryInput){ const d=new Date(); d.setFullYear(d.getFullYear()+1); expiryInput.value=d.toISOString().slice(0,10); }}
setDefaultExpiry();
