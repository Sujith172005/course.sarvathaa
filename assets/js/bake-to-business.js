    (function () {
      const modal = document.getElementById('courseModal');
      const form = document.getElementById('courseBuyForm');
      if (!modal || !form) return;

      const courseInput = document.getElementById('buyerCourse');
      const priceInput = document.getElementById('buyerPrice');
      const statusBox = document.getElementById('purchaseStatus');
      const closeBtn = modal.querySelector('.course-close');
      const couponBtn = document.getElementById('applyCouponBtn');
      const couponInput = document.getElementById('buyerCoupon');
      const couponMessage = document.getElementById('couponMessage');
      const couponSummary = document.getElementById('couponSummary');
      const couponDiscountText = document.getElementById('couponDiscountText');
      const couponFinalText = document.getElementById('couponFinalText');

      let currentCourse = '';
      let currentPrice = '';
      let finalPrice = '';
      let discountAmount = '₹0';
      let appliedCode = '';
      let couponVersion = 0;
      let triggerButton = null;

      function setStatus(message, type) {
        statusBox.textContent = message || '';
        statusBox.className = 'purchase-status' + (message ? ' show ' + type : '');
      }

      function openModal(course, price) {
        triggerButton = document.activeElement;
        resetCoupon();
        currentCourse = course || '';
        currentPrice = price || '';
        finalPrice = currentPrice;
        discountAmount = '₹0';

        courseInput.value = currentCourse;
        priceInput.value = currentPrice;
        couponInput.value = '';
        couponSummary.hidden = true;
        couponMessage.textContent = 'Have a coupon? Enter your code and click Apply.';
        setStatus('', '');
        modal.classList.add('is-open');
        modal.setAttribute('aria-hidden', 'false');
        document.body.classList.add('modal-open');
        setTimeout(function () { document.getElementById('buyerName').focus(); }, 50);
      }

      function closeModal() {
        modal.classList.remove('is-open');
        modal.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('modal-open');
        setStatus('', '');
        triggerButton?.focus();
      }

      document.querySelectorAll('.buy-tier-course').forEach(function (btn) {
        btn.addEventListener('click', function () {
          openModal(btn.dataset.course, btn.dataset.price);
        });
      });


      document.querySelectorAll('.tier-course-help').forEach(function (btn) {
        btn.addEventListener('click', function () {
          const card = btn.closest('.tier-course-card');
          const course = card ? (card.querySelector('h3')?.textContent || 'Course') : 'Course';
          const text = 'Hi Sarvathaa Team, I need help with the ' + course + '.';
          window.open('https://wa.me/919886916067?text=' + encodeURIComponent(text), '_blank');
        });
      });

      if (closeBtn) closeBtn.addEventListener('click', closeModal);
      modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && modal.classList.contains('is-open')) closeModal(); });

      function resetCoupon() {
        couponVersion += 1;
        appliedCode = '';
        finalPrice = currentPrice;
        discountAmount = '₹0';
        couponSummary.hidden = true;
      }
      couponInput.addEventListener('input', function () {
        resetCoupon();
        couponMessage.textContent = 'Coupon changed. Click Apply to validate it.';
      });
      couponBtn.addEventListener('click', async function () {
        resetCoupon();
        const version = couponVersion;
        const code = couponInput.value.trim().toUpperCase();
        if (!code) { couponMessage.textContent = 'Enter a coupon code first.'; return; }
        couponBtn.disabled = true;
        try {
          const res = await fetch('/api/coupons/validate', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, price: currentPrice, course: currentCourse })
          });
          const data = await res.json();
          if (version !== couponVersion) return;
          if (!res.ok || !data.ok) throw new Error(data.message || 'Coupon is not valid.');
          appliedCode = code;
          finalPrice = data.final_price_text;
          discountAmount = data.discount_amount_text;
          couponDiscountText.textContent = discountAmount;
          couponFinalText.textContent = finalPrice;
          couponSummary.hidden = false;
          couponMessage.textContent = 'Coupon applied successfully.';
        } catch (err) {
          if (version === couponVersion) couponMessage.textContent = err.message || 'Could not validate coupon. Please try again.';
        } finally {
          couponBtn.disabled = false;
        }
      });

      form.addEventListener('submit', async function (e) {
        e.preventDefault();
        const name = document.getElementById('buyerName').value.trim();
        const phone = document.getElementById('buyerPhone').value.trim();
        const email = document.getElementById('buyerEmail').value.trim();
        const coupon = couponInput.value.trim().toUpperCase();

        if (!name || !/^\d{10}$/.test(phone)) {
          setStatus('Please enter your name and a valid 10-digit WhatsApp number.', 'error');
          return;
        }

        if (coupon && coupon !== appliedCode) {
          setStatus('Please apply your coupon, or clear it before sending.', 'error');
          couponInput.focus();
          return;
        }
        const submitBtn = form.querySelector('.payment-whatsapp-btn');
        if (submitBtn.disabled) return;
        submitBtn.disabled = true;
        submitBtn.textContent = 'Saving your request...';
        setStatus('', '');

        try {
          const res = await fetch('/api/course-purchase-request', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: name, phone: phone, email: email,
              course: currentCourse, original_price: currentPrice,
              coupon_code: coupon, discount_amount: discountAmount,
              final_price: finalPrice
            })
          });
          const data = await res.json();

          if (!res.ok || !data.ok) {
            throw new Error(data.message || 'Could not save your request.');
          }

          setStatus('Request saved successfully. Opening WhatsApp...', 'success');

          const message =
            'Hi Sarvathaa Team, I want to buy a course.%0A' +
            'Name: ' + encodeURIComponent(name) + '%0A' +
            'WhatsApp: ' + encodeURIComponent(phone) + '%0A' +
            'Email: ' + encodeURIComponent(email || 'Not provided') + '%0A' +
            'Course: ' + encodeURIComponent(currentCourse) + '%0A' +
            'Original Price: ' + encodeURIComponent(currentPrice) + '%0A' +
            'Coupon: ' + encodeURIComponent(coupon || 'None') + '%0A' +
            'Final Payable: ' + encodeURIComponent(finalPrice);

          window.location.assign('https://wa.me/919886916067?text=' + message);
        } catch (err) {
          setStatus(err.message || 'Could not save your request. Please try again.', 'error');
        } finally {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Send Course Request on WhatsApp';
        }
      });
    })();


// Gold and Platinum: show exactly the first 15 topics initially.
// "Read more" reveals every remaining topic for that plan only.
(function () {
  const VISIBLE_TOPICS = 14;
  const cards = [
    document.getElementById('gold-plan'),
    document.getElementById('platinum-plan')
  ].filter(Boolean);

  cards.forEach(function (card) {
    const list = card.querySelector('.tier-topics');
    const button = card.querySelector('.tier-read-more');
    if (!list || !button) return;

    const items = Array.from(list.children);
    const remaining = Math.max(0, items.length - VISIBLE_TOPICS);

    function update(expanded) {
      items.forEach(function (item, index) {
        item.hidden = !expanded && index >= VISIBLE_TOPICS;
      });

      button.setAttribute('aria-expanded', String(expanded));
      button.textContent = expanded ? 'Read less' : ('Read more (' + remaining + ')');

      // Show how many topics are waiting to be revealed.
      button.dataset.remaining = expanded ? '' : String();
    }

    button.hidden = remaining === 0;

    button.addEventListener('click', function () {
      const expanded = button.getAttribute('aria-expanded') === 'true';
      update(!expanded);
    });

    update(false);
  });
})();
