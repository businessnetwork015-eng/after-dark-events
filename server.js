const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const Brevo = require('@getbrevo/brevo');
const QRCode = require('qrcode');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Initialize Brevo API
const apiInstance = new Brevo.TransactionalEmailsApi();
apiInstance.setApiKey(
    Brevo.TransactionalEmailsApiApiKeys.apiKey,
    process.env.BREVO_API_KEY
);

// Absolute path for uploads directory
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer Storage Configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '_'))
});
const upload = multer({ storage });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadDir));

// Initialize SQLite Database
const db = new sqlite3.Database('./database.sqlite', (err) => {
    if (err) console.error('Database connection error:', err);
    else console.log('Connected to SQLite Database.');
});

db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS bookings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT UNIQUE,
            name TEXT,
            email TEXT,
            phone TEXT,
            tickets INTEGER,
            amount INTEGER,
            utr_number TEXT,
            screenshot_path TEXT,
            status TEXT DEFAULT 'PENDING',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
});

// Helper: Send Step 1 Acknowledgment Email
async function sendPendingEmail(user) {
    const sendSmtpEmail = new Brevo.SendSmtpEmail();
    sendSmtpEmail.subject = `Payment Received - Booking Under Verification [ID: ${user.user_id}]`;
    sendSmtpEmail.sender = { name: "AFTER DARK Team", email: process.env.EMAIL_USER };
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

// Helper: Send Step 2 Final Ticket Email
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
    sendSmtpEmail.sender = { name: "AFTER DARK Team", email: process.env.EMAIL_USER };
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

            <p style="font-size: 13px; color: #999;">* Welcome drinks available inside the venue.<br>* Please carry a valid digital/physical ID along with this pass.</p>
        </div>
    `;

    return apiInstance.sendTransacEmail(sendSmtpEmail);
}

// Routes
app.post('/api/book', upload.single('screenshot'), (req, res) => {
    const { name, email, phone, tickets, utr_number } = req.body;
    const ticketCount = parseInt(tickets, 10) || 1;
    const unitPrice = parseInt(process.env.TICKET_PRICE, 10) || 499;
    const amount = ticketCount * unitPrice;
    const userId = 'AD-' + Math.random().toString(36).substring(2, 7).toUpperCase();
    const screenshotPath = req.file ? `uploads/${req.file.filename}` : null;

    const query = `
        INSERT INTO bookings (user_id, name, email, phone, tickets, amount, utr_number, screenshot_path, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')
    `;

    db.run(query, [userId, name, email, phone, ticketCount, amount, utr_number, screenshotPath], function (err) {
        if (err) {
            console.error('Database Error:', err);
            return res.status(500).json({ success: false, message: 'Database error.' });
        }
        
        sendPendingEmail({ name, email, user_id: userId, utr_number })
            .then(() => console.log(`Confirmation email sent via Brevo to ${email}`))
            .catch(emailErr => console.error('Brevo Pending Email Error:', emailErr.response ? emailErr.response.body : emailErr.message));

        res.json({ success: true, bookingId: userId });
    });
});

app.get('/api/admin/bookings', (req, res) => {
    const { password } = req.query;
    if (password !== process.env.ADMIN_PASSWORD) {
        return res.status(401).json({ success: false, message: 'Unauthorized.' });
    }
    db.all(`SELECT * FROM bookings ORDER BY id DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/admin/approve/:id', (req, res) => {
    const { password } = req.body;
    const bookingId = req.params.id;

    if (password !== process.env.ADMIN_PASSWORD) {
        return res.status(401).json({ success: false, message: 'Unauthorized.' });
    }

    db.get(`SELECT * FROM bookings WHERE id = ?`, [bookingId], (err, user) => {
        if (err || !user) return res.status(404).json({ success: false, message: 'Booking not found.' });

        db.run(`UPDATE bookings SET status = 'APPROVED' WHERE id = ?`, [bookingId], async (updateErr) => {
            if (updateErr) {
                console.error('Database update error:', updateErr);
                return res.status(500).json({ success: false, message: 'Database update failed.' });
            }
            
            try {
                await sendApprovedTicketEmail(user);
                console.log(`Ticket email dispatched via Brevo to ${user.email}`);
                res.json({ success: true, message: 'Approved and Ticket sent.' });
            } catch (mailErr) {
                console.error('Brevo Ticket Approval Email Error:', mailErr.response ? mailErr.response.body : mailErr.message);
                res.status(500).json({ success: false, message: 'Status updated, but email delivery failed.' });
            }
        });
    });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
