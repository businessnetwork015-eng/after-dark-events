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
    
    const payload = {
        name: bookingData.name,
        email: bookingData.email,
        phone: bookingData.phone,
        tickets: bookingData.tickets,
        utr_number: document.getElementById('utr_number').value.trim()
    };

    const submitBtn = paymentConfirmForm.querySelector('button');
    submitBtn.innerText = 'Submitting...';
    submitBtn.disabled = true;

    try {
        const response = await fetch('/api/book', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        const data = await response.json();

        if (data.success) {
            alert(`Booking Submitted Successfully!\n\nBooking ID: ${data.bookingId}\n\nYou will receive your passes via email within 2-4 hours.`);
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
