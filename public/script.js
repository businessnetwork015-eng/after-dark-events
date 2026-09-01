const bookingForm = document.getElementById('bookingForm');
const paymentModal = document.getElementById('paymentModal');
const paymentConfirmForm = document.getElementById('paymentConfirmForm');

let bookingData = {};

bookingForm.addEventListener('submit', (e) => {
    e.preventDefault();
    bookingData = {
        name: document.getElementById('name').value,
        email: document.getElementById('email').value,
        phone: document.getElementById('phone').value,
        tickets: document.getElementById('tickets').value
    };
    paymentModal.style.display = 'flex';
});

paymentConfirmForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const formData = new FormData();
    formData.append('name', bookingData.name);
    formData.append('email', bookingData.email);
    formData.append('phone', bookingData.phone);
    formData.append('tickets', bookingData.tickets);
    formData.append('utr_number', document.getElementById('utr_number').value);
    formData.append('screenshot', document.getElementById('screenshot').files[0]);

    const submitBtn = paymentConfirmForm.querySelector('button');
    submitBtn.innerText = 'Submitting...';
    submitBtn.disabled = true;

    try {
        const response = await fetch('/api/book', {
            method: 'POST',
            body: formData
        });
        const data = await response.json();

        if (data.success) {
            alert(`Booking Submitted!\nBooking ID: ${data.bookingId}\n\nYou will receive your passes via email within 2-4 hours.`);
            window.location.reload();
        } else {
            alert('Something went wrong. Please try again.');
            submitBtn.innerText = 'CONFIRM BOOKING';
            submitBtn.disabled = false;
        }
    } catch (err) {
        console.error(err);
        alert('Server connectivity error.');
        submitBtn.innerText = 'CONFIRM BOOKING';
        submitBtn.disabled = false;
    }
});