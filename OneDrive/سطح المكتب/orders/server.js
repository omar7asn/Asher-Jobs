require('dotenv').config();
const { google } = require('googleapis');
const express = require('express');
const multer = require('multer');
const cors = require('cors');

const app = express();
const upload = multer();

// Google Sheets setup
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const SPREADSHEET_ID = process.env.SHEET_ID;

app.use(cors());
app.use(express.static('public'));

app.post('/api/orders', upload.single('photo'), async (req, res) => {
  try {
    const { name, address, phone, description } = req.body;
    const photo = req.file ? 'Photo Uploaded' : 'No Photo';

    const sheets = google.sheets({ version: 'v4', auth });

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Sheet1!A:E',
      valueInputOption: 'USER_ENTERED',
      resource: {
        values: [[
          new Date().toISOString(), // Timestamp
          name,
          address,
          phone,
          description,
          photo
        ]]
      }
    });

    res.status(200).json({ message: 'Order saved successfully' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Failed to save order' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));