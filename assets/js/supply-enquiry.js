(() => {
  'use strict';
  const dialog = document.getElementById('supply-enquiry');
  const form = document.getElementById('supply-enquiry-form');
  const category = document.getElementById('enquiry-category');
  const name = document.getElementById('enquiry-name');
  const phone = document.getElementById('enquiry-phone');
  const fields = document.getElementById('enquiry-fields');
  const ready = document.getElementById('enquiry-ready');
  const more = document.getElementById('enquiry-view-details');
  const reopen = document.getElementById('enquiry-open-again');
  const validPages = new Set(['baking-ingredients.html', 'baking-equipment.html', 'baking-tools-moulds.html', 'baking-packaging.html']);
  const pendingKey = 'sarvathaa-supply-enquiry-page';
  function showThanks(page, whatsappUrl) {
    fields.hidden = true;
    ready.hidden = false;
    more.href = page;
    reopen.href = whatsappUrl || 'https://wa.me/919886916067';
    dialog.setAttribute('aria-labelledby', 'enquiry-thanks-title');
    if (!dialog.open) dialog.showModal();
    ready.focus();
  }
  let opener;
  let detailPage;
  document.querySelectorAll('.supply-enquire').forEach(button => {
    button.addEventListener('click', () => {
      opener = button;
      const row = button.closest('.supply-row');
      category.value = row.querySelector('h3').textContent.trim();
      detailPage = row.dataset.detailPage;
      try { sessionStorage.removeItem(pendingKey); } catch (_) {}
      fields.hidden = false;
      ready.hidden = true;
      dialog.setAttribute('aria-labelledby', 'enquiry-title');
      form.hidden = false;
      dialog.showModal();
      name.focus();
    });
  });
  dialog.querySelector('.enquiry-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    const rect = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
  });
  dialog.addEventListener('close', () => {
    try { sessionStorage.removeItem(pendingKey); } catch (_) {}
    opener?.focus();
  });
  name.addEventListener('input', () => name.setCustomValidity(''));
  phone.addEventListener('input', () => phone.setCustomValidity(''));
  form.addEventListener('submit', event => {
    event.preventDefault();
    name.setCustomValidity(name.value.trim() ? '' : 'Please enter your name.');
    const digits = phone.value.replace(/\D/g, '');
    const validPhone = /^\+?[\d\s()-]+$/.test(phone.value.trim()) && digits.length >= 10 && digits.length <= 15;
    phone.setCustomValidity(validPhone ? '' : 'Please enter a valid mobile number, including country code if needed.');
    if (!form.reportValidity()) return;
    const message = ['Hi Sarvathaa Team, I would like to make a supply enquiry.', '',
      `Name: ${name.value.trim()}`, `Mobile: ${phone.value.trim()}`,
      `Category: ${category.value}`,
      '',
      'Please share pricing and availability.'].join('\n');
    const url = `https://wa.me/919886916067?text=${encodeURIComponent(message)}`;
    if (!validPages.has(detailPage)) return;
    try { sessionStorage.setItem(pendingKey, detailPage); } catch (_) {}
    showThanks(detailPage, url);
    window.open(url, '_blank', 'noopener,noreferrer');
  });
  // Restore only the selected page after a reload; customer details are not stored.
  try {
    const pendingPage = sessionStorage.getItem(pendingKey);
    if (validPages.has(pendingPage)) showThanks(pendingPage);
  } catch (_) {}
})();
