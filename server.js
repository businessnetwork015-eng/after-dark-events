const express = require('express');
const { Pool } = require('pg');
const Brevo = require('@getbrevo/brevo');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// 1. Neon PostgreSQL Configuration
const connectionString = (process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_0ZBnK5mweuHx@ep-super-wind-axdm2mdo-pooler.c-4.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require').trim();

const pool = new Pool({
    connectionString: connectionString,
    ssl: {
        rejectUnauthorized: false
    }
});

// Test Connection & Initialize Persistent Table
async function initDB() {
    let client;
    try {
        client = await pool.connect();
        await client.query(`
            CREATE TABLE IF NOT EXISTS bookings (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(50) UNIQUE,
                name VARCHAR(100),
                email VARCHAR(150),
                phone VARCHAR(20),
                tickets INT,
                amount INT,
                utr_number VARCHAR(100),
                status VARCHAR(20) DEFAULT 'PENDING',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✅ Connected to Neon Cloud PostgreSQL Database.');
    } catch (err) {
        console.error('❌ Neon Database connection error:', err.message || err);
    } finally {
        if (client) client.release();
    }
}
initDB();

// 2. Initialize Brevo API
const brevoKey = (process.env.BREVO_API_KEY || '').trim();
if (!brevoKey) {
    console.error("⚠️ Warning: BREVO_API_KEY is not defined in environment variables!");
}

const apiInstance = new Brevo.TransactionalEmailsApi();
apiInstance.setApiKey(
    Brevo.TransactionalEmailsApiApiKeys.apiKey,
    brevoKey
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Helper: Send Initial Acknowledgment Email
async function sendPendingEmail(user) {
    const sendSmtpEmail = new Brevo.SendSmtpEmail();
    sendSmtpEmail.subject = `Payment Received - Booking Under Verification [ID: ${user.user_id}]`;
    sendSmtpEmail.sender = { name: "AFTER DARK Team", email: (process.env.EMAIL_USER || '').trim() };
    sendSmtpEmail.to = [{ email: user.email, name: user.name }];
    sendSmtpEmail.htmlContent = `
        <div style="background-color: #0b0b0b; color: #fff; padding: 25px; font-family: Arial, sans-serif; border: 1px solid #ff1a1a; border-radius: 8px;">
            <h1 style="color: #ff1a1a; letter-spacing: 2px;">AFTER DARK</h1>
            <p>Hey <strong>${user.name}</strong>,</p>
            <p>We have received your booking details and transaction submission.</p>
            <div style="background-color: #171717; padding: 15px; border-left: 4px solid #ff1a1a; margin: 15px 0;">
                <p style="margin: 0;"><strong>Booking ID:</strong> ${user.user_id}</p>
                <p style="margin: 5px 0 0 0;"><strong>UTR / Ref:</strong> ${user.utr_number}</p>
            </div>
            <p style="color: #e0e0e0;">Our team is verifying your payment. <strong>You will get your event passes in your inbox within 2–4 hours.</strong></p>
            <br>
            <p style="font-size: 12px; color: #888;">Venue: SIERA BEACH HOTEL, Near IT SEZ Beach Road, Rushikonda<br>Date: September 19th | Time: 6:00 PM to 9:30 PM</p>
        </div>
    `;

    return apiInstance.sendTransacEmail(sendSmtpEmail);
}

// Helper: Send Approved Pass with Dynamic QR Code
async function sendApprovedTicketEmail(user) {
    const qrData = JSON.stringify({
        event: "AFTER DARK",
        userId: user.user_id,
        name: user.name,
        date: "September 19th",
        time: "6:00 PM - 9:30 PM",
        venue: "SIERA BEACH HOTEL, Near IT SEZ Beach Road, Rushikonda",
        tickets: user.tickets
    });

    const qrBuffer = await QRCode.toBuffer(qrData);
    const attachments = [
        {
            name: 'ticket-qr.png',
            content: qrBuffer.toString('base64')
        }
    ];

    const posterPath = path.join(__dirname, 'public', 'assets', 'poster.jpg');
    if (fs.existsSync(posterPath)) {
        const posterBuffer = fs.readFileSync(posterPath);
        attachments.push({
            name: 'EventPoster.jpg',
            content: posterBuffer.toString('base64')
        });
    }

    const sendSmtpEmail = new Brevo.SendSmtpEmail();
    sendSmtpEmail.subject = `CONFIRMED: Your Official Pass for AFTER DARK [ID: ${user.user_id}]`;
    sendSmtpEmail.sender = { name: "AFTER DARK Team", email: (process.env.EMAIL_USER || '').trim() };
    sendSmtpEmail.to = [{ email: user.email, name: user.name }];
    sendSmtpEmail.attachment = attachments;
    sendSmtpEmail.htmlContent = `
        <div style="background-color: #050505; color: #ffffff; padding: 30px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; border: 2px solid #e50914; border-radius: 10px; max-width: 600px; margin: auto;">
            <div style="text-align: center; margin-bottom: 20px;">
                <h1 style="color: #ff2a2a; margin: 0; font-size: 32px; letter-spacing: 3px;">AFTER DARK</h1>
                <p style="color: #aaa; margin-top: 5px; font-size: 14px;">GET READY GEN-Z • DJ | MUSIC | VIBES</p>
            </div>

            <p>Hey <strong>${user.name}</strong>,</p>
            <p>Your payment has been verified successfully. Your official pass and event poster are attached to this email!</p>
            
            <div style="background-color: #121212; border: 1px dashed #ff2a2a; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0;">
                <h3 style="color: #fff; margin-top: 0;">OFFICIAL ENTRY PASS</h3>
                <p style="font-size: 13px; color: #ff3333;">(Please download and present the attached <strong>ticket-qr.png</strong> at the gate)</p>
                <hr style="border: 0; border-top: 1px solid #222; margin: 15px 0;">
                <p style="margin: 4px 0; color: #eee;"><strong>Attendee:</strong> ${user.name}</p>
                <p style="margin: 4px 0; color: #eee;"><strong>Pass ID:</strong> ${user.user_id}</p>
                <p style="margin: 4px 0; color: #eee;"><strong>Passes:</strong> ${user.tickets} Person(s)</p>
                <p style="margin: 4px 0; color: #ff3333;"><strong>Date & Time:</strong> September 19th, 6:00 PM - 9:30 PM</p>
                <p style="margin: 4px 0; color: #aaa; font-size: 13px;"><strong>Venue:</strong> SIERA BEACH HOTEL, Rushikonda</p>
            </div>

            <p style="font-size: 13px; color: #999;">* Welcome drinks available inside the venue.<br>* Please carry a valid digital or physical ID along with this pass.</p>
        </div>
    `;

    return apiInstance.sendTransacEmail(sendSmtpEmail);
}

// Routes

// User Booking Submission
app.post('/api/book', async (req, res) => {
    const { name, email, phone, tickets, utr_number } = req.body;
    const ticketCount = parseInt(tickets, 10) || 1;
    const unitPrice = parseInt(process.env.TICKET_PRICE, 10) || 499;
    const amount = ticketCount * unitPrice;
    const userId = 'AD-' + Math.random().toString(36).substring(2, 7).toUpperCase();

    const insertQuery = `
        INSERT INTO bookings (user_id, name, email, phone, tickets, amount, utr_number, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDING')
        RETURNING *;
    `;

    try {
        await pool.query(insertQuery, [userId, name, email, phone, ticketCount, amount, utr_number]);

        sendPendingEmail({ name, email, user_id: userId, utr_number })
            .then(() => console.log(`Confirmation email sent via Brevo to ${email}`))
            .catch(emailErr => console.error('Brevo Email Error:', emailErr.response ? emailErr.response.body : emailErr.message));

        res.json({ success: true, bookingId: userId });
    } catch (err) {
        console.error('Database Insertion Error:', err.message);
        res.status(500).json({ success: false, message: 'Failed to record booking.' });
    }
});

// Admin View Submissions
app.get('/api/admin/bookings', async (req, res) => {
    const { password } = req.query;
    if (password !== process.env.ADMIN_PASSWORD) {
        return res.status(401).json({ success: false, message: 'Unauthorized.' });
    }

    try {
        const result = await pool.query('SELECT * FROM bookings ORDER BY id DESC');
        res.json(result.rows);
    } catch (err) {
        console.error('Fetch Bookings Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Admin Approval Endpoint
app.post('/api/admin/approve/:id', async (req, res) => {
    const { password } = req.body;
    const bookingId = req.params.id;

    if (password !== process.env.ADMIN_PASSWORD) {
        return res.status(401).json({ success: false, message: 'Unauthorized.' });
    }

    try {
        const userRes = await pool.query('SELECT * FROM bookings WHERE id = $1', [bookingId]);
        const user = userRes.rows[0];

        if (!user) {
            return res.status(404).json({ success: false, message: 'Booking not found.' });
        }

        await pool.query('UPDATE bookings SET status = $1 WHERE id = $2', ['APPROVED', bookingId]);

        try {
            await sendApprovedTicketEmail(user);
            console.log(`Ticket email sent to ${user.email}`);
            res.json({ success: true, message: 'Approved and Ticket sent.' });
        } catch (mailErr) {
            console.error('Brevo Approval Email Error:', mailErr.response ? mailErr.response.body : mailErr.message);
            res.status(500).json({ success: false, message: 'Status updated, but email delivery failed.' });
        }
    } catch (err) {
        console.error('Approval DB Error:', err.message);
        res.status(500).json({ success: false, message: 'Database operation failed.' });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
