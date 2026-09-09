const WHATSAPP_NUMBER = document.body.dataset.whatsappNumber || '917904336537';

window.addEventListener('load', () => {
  setTimeout(() => document.querySelector('.preloader')?.classList.add('hide'), 400);
});

// WhatsApp links
function openWhatsapp(message){
  window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`, '_blank');
}
document.querySelectorAll('[data-wa]').forEach(btn => {
  btn.addEventListener('click', e => {
    e.preventDefault();
    openWhatsapp(btn.dataset.wa || 'Hi Sarvathaa Team, I need more information.');
  });
});

// Back to top
const topBtn = document.querySelector('.to-top');
window.addEventListener('scroll', () => {
  if (topBtn) topBtn.style.display = scrollY > 400 ? 'block' : 'none';
});
topBtn?.addEventListener('click', () => scrollTo({top:0, behavior:'smooth'}));

// Scroll reveal
const revealItems = document.querySelectorAll('.card,.section-title,.hero h1,.hero p,.btn-row,.detail-block');
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if(entry.isIntersecting){
      entry.target.classList.add('reveal-visible');
      revealObserver.unobserve(entry.target);
    }
  });
},{threshold:0.12});
revealItems.forEach((item,index) => {
  item.style.transitionDelay = `${Math.min(index % 6, 5) * 70}ms`;
  revealObserver.observe(item);
});

// Friendly contact form
const pageForm = document.querySelector('.form');
pageForm?.addEventListener('submit', (e) => {
  e.preventDefault();
  alert('Thank you. Sarvathaa team will contact you soon.');
});

// Stable navbar behavior for desktop + mobile
(function(){
  const navLinksBox = document.querySelector('.nav-links');
  const hamburger = document.querySelector('.hamburger');
  const dropdowns = [...document.querySelectorAll('.centered-nav .dropdown')];
  const isMobile = () => window.innerWidth <= 900;

  function closeDropdowns(except){
    dropdowns.forEach(d => {
      if(d !== except) d.classList.remove('open');
    });
  }

  function setMobileMenu(open){
    if(!navLinksBox || !hamburger) return;
    navLinksBox.classList.toggle('show', open);
    hamburger.classList.toggle('menu-open', open);
    hamburger.textContent = open ? '×' : '☰';
    hamburger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    hamburger.setAttribute('aria-expanded', open ? 'true' : 'false');
    if(!open) closeDropdowns();
  }

  hamburger?.setAttribute('aria-expanded', 'false');
  hamburger?.setAttribute('type', 'button');

  hamburger?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    setMobileMenu(!navLinksBox?.classList.contains('show'));
  });

  dropdowns.forEach(drop => {
    // Only a real button should control/open the dropdown.
    // A .dropbtn that is an <a> must remain a normal page link.
    const btn = drop.querySelector('button.dropbtn');
    if(!btn) return;

    btn.setAttribute('type', 'button');
    if(!btn.querySelector('.arrow')){
      btn.innerHTML = btn.textContent.replace('▾','').trim() + ' <span class="arrow">▾</span>';
    }

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const willOpen = !drop.classList.contains('open');
      closeDropdowns(drop);
      drop.classList.toggle('open', willOpen);
    });

    drop.addEventListener('mouseenter', () => {
      if(!isMobile()){
        closeDropdowns(drop);
        drop.classList.add('open');
      }
    });

    drop.addEventListener('mouseleave', () => {
      if(!isMobile()) drop.classList.remove('open');
    });
  });

  navLinksBox?.querySelectorAll('.dropdown-menu a').forEach(link => {
    link.addEventListener('click', () => setMobileMenu(false));
  });

  navLinksBox?.querySelectorAll('a:not(.brand):not(.dropdown-menu a)').forEach(link => {
    link.addEventListener('click', () => {
      if(isMobile()) setMobileMenu(false);
      else closeDropdowns();
    });
  });

  document.addEventListener('click', (e) => {
    if(!e.target.closest('.centered-nav')){
      setMobileMenu(false);
      closeDropdowns();
    }
  });

  window.addEventListener('resize', () => {
    setMobileMenu(false);
    closeDropdowns();
  });
})();

// Premium course buy form: WhatsApp course request + login access
(function(){
  const modal = document.getElementById('courseModal');
  const form = document.getElementById('courseBuyForm');
  if(!modal || !form || modal.dataset.handler === 'plan-request') return;

  const courseInput = document.getElementById('buyerCourse');
  const priceInput = document.getElementById('buyerPrice');
  const firstInput = document.getElementById('buyerName');
  const couponInput = document.getElementById('buyerCoupon');
  const applyCouponBtn = document.getElementById('applyCouponBtn');
  const couponMessage = document.getElementById('couponMessage');
  const couponSummary = document.getElementById('couponSummary');
  const couponDiscountText = document.getElementById('couponDiscountText');
  const couponFinalText = document.getElementById('couponFinalText');
  let appliedCoupon = null;

  function parseMoney(value){
    const raw = String(value || '').replace(/[^0-9.]/g, '');
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : 0;
  }
  function rupees(value){
    return '₹' + Math.round(Number(value || 0));
  }
  function resetCoupon(){
    appliedCoupon = null;
    if(couponInput) couponInput.value = '';
    if(couponMessage){
      couponMessage.textContent = 'Have a coupon? Enter code and click Apply.';
      couponMessage.className = 'coupon-message';
    }
    if(couponSummary) couponSummary.hidden = true;
    if(couponDiscountText) couponDiscountText.textContent = '₹0';
    if(couponFinalText) couponFinalText.textContent = priceInput?.value || '₹0';
  }

  document.querySelectorAll('.buy-course-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      courseInput.value = btn.dataset.course || '';
      priceInput.value = btn.dataset.price || '';
      resetCoupon();
      modal.classList.add('show');
      modal.setAttribute('aria-hidden','false');
      setTimeout(() => firstInput?.focus(), 150);
    });
  });

  applyCouponBtn?.addEventListener('click', async () => {
    const code = (couponInput?.value || '').trim().toUpperCase();
    const price = parseMoney(priceInput?.value);
    if(!code){
      couponMessage.textContent = 'Please enter coupon code.';
      couponMessage.className = 'coupon-message error';
      return;
    }
    applyCouponBtn.disabled = true;
    applyCouponBtn.textContent = 'Checking...';
    couponMessage.textContent = 'Checking coupon...';
    couponMessage.className = 'coupon-message';
    try{
      const res = await fetch('/api/coupons/validate', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        credentials:'include',
        body: JSON.stringify({code, price, course: courseInput.value})
      });
      const data = await res.json();
      if(!res.ok || !data.ok) throw data;
      appliedCoupon = data;
      couponMessage.textContent = `${data.message} You saved ${data.discount_amount_text}.`;
      couponMessage.className = 'coupon-message success';
      couponDiscountText.textContent = data.discount_amount_text || rupees(data.discount_amount);
      couponFinalText.textContent = data.final_price_text || rupees(data.final_price);
      couponSummary.hidden = false;
    }catch(err){
      appliedCoupon = null;
      couponMessage.textContent = err.message || 'Invalid or expired coupon.';
      couponMessage.className = 'coupon-message error';
      if(couponSummary) couponSummary.hidden = true;
      }finally{
      applyCouponBtn.disabled = false;
      applyCouponBtn.textContent = 'Apply';
    }
  });

  couponInput?.addEventListener('input', () => {
    if(appliedCoupon){
      appliedCoupon = null;
      couponMessage.textContent = 'Coupon changed. Click Apply again.';
      couponMessage.className = 'coupon-message';
      if(couponSummary) couponSummary.hidden = true;
      }
  });

  function closeModal(){
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden','true');
  }

  modal.querySelector('.course-close')?.addEventListener('click', closeModal);
  modal.addEventListener('click', e => { if(e.target === modal) closeModal(); });
  document.addEventListener('keydown', e => { if(e.key === 'Escape') closeModal(); });

  form.addEventListener('submit', e => {
    e.preventDefault();
    const nameField = document.getElementById('buyerName');
    const phoneField = document.getElementById('buyerPhone');
    const emailField = document.getElementById('buyerEmail');
    const name = nameField.value.trim();
    const phone = phoneField.value.replace(/\D/g, '').trim();
    const email = emailField.value.trim();
    const course = courseInput.value.trim();
    const price = priceInput.value.trim();
    const couponCode = (couponInput?.value || '').trim().toUpperCase();
    const finalPrice = appliedCoupon ? (appliedCoupon.final_price_text || rupees(appliedCoupon.final_price)) : price;
    const discountText = appliedCoupon ? (appliedCoupon.discount_amount_text || rupees(appliedCoupon.discount_amount)) : '₹0';

    if(couponCode && !appliedCoupon){
      alert('Please click Apply coupon before sending WhatsApp details.');
      couponInput.focus();
      return;
    }

    if(!name){
      alert('Please enter your name.');
      nameField.focus();
      return;
    }
    if(!/^\d{10}$/.test(phone)){
      alert('Please enter a valid 10 digit WhatsApp mobile number.');
      phoneField.focus();
      return;
    }
    const emailLine = email ? `
Email ID: ${email}` : '';
    const couponLine = appliedCoupon ? `
Coupon Code: ${appliedCoupon.coupon?.code || couponCode}
Discount: ${appliedCoupon.coupon?.discount_value || 0}${appliedCoupon.coupon?.discount_type === 'amount' ? '₹' : '%'}
Discount Amount: ${discountText}
Final Paid Amount: ${finalPrice}` : `
Coupon Code: Not applied
Final Paid Amount: ${finalPrice}`;
    const msg = `Hi Sarvathaa Team,

I want to buy this course. Please guide me with the payment process and send my course login details after verification.

Name: ${name}
WhatsApp Number: ${phone}${emailLine}
Course Name: ${course}
Original Course Price: ${price}${couponLine}`;
    openWhatsapp(msg);
    closeModal();
  });
})();

// Home slider
(function(){
  const slider = document.querySelector('.home-slider');
  if(!slider) return;
  const slides = [...slider.querySelectorAll('.hero-slide')];
  const prev = slider.querySelector('.slider-prev');
  const next = slider.querySelector('.slider-next');
  const dotsWrap = slider.querySelector('.slider-dots');
  if(!slides.length) return;

  let current = 0;
  let timer;
  slides.forEach((_,i) => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'slider-dot' + (i === 0 ? ' active' : '');
    dot.setAttribute('aria-label', `Go to slide ${i+1}`);
    dot.addEventListener('click', () => goTo(i, true));
    dotsWrap?.appendChild(dot);
  });
  const dots = [...slider.querySelectorAll('.slider-dot')];
  function goTo(index, manual=false){
    slides[current].classList.remove('active');
    dots[current]?.classList.remove('active');
    current = (index + slides.length) % slides.length;
    slides[current].classList.add('active');
    dots[current]?.classList.add('active');
    if(manual) restart();
  }
  function restart(){
    clearInterval(timer);
    timer = setInterval(() => goTo(current + 1), 5500);
  }
  prev?.addEventListener('click', () => goTo(current - 1, true));
  next?.addEventListener('click', () => goTo(current + 1, true));
  slider.addEventListener('mouseenter', () => clearInterval(timer));
  slider.addEventListener('mouseleave', restart);
  restart();
})();

