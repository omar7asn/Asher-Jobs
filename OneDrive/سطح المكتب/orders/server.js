const express = require('express');
const multer = require('multer');
const { MongoClient } = require('mongodb');
const AWS = require('aws-sdk');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// S3 configuration
const s3 = new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION,
});

// Multer setup
const storage = multer.memoryStorage();
const upload = multer({ storage });

// MongoDB setup
const mongoUri = process.env.MONGO_URI;
let db;

MongoClient.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(client => {
        db = client.db('orders');
        console.log('Connected to MongoDB');
    })
    .catch(err => console.error('Failed to connect to MongoDB', err));

// Middleware
app.use(express.static('public'));
app.use(express.json());

// Routes
app.post('/orders', upload.single('photo'), async (req, res) => {
    const { name, address, phone, description } = req.body;

    let photoUrl = null;
    if (req.file) {
        const params = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: `${Date.now()}_${path.basename(req.file.originalname)}`,
            Body: req.file.buffer,
            ContentType: req.file.mimetype,
        };

        try {
            const uploadResult = await s3.upload(params).promise();
            photoUrl = uploadResult.Location;
        } catch (err) {
            return res.status(500).json({ error: 'Failed to upload photo to S3' });
        }
    }

    const order = { name, address, phone, description, photoUrl };
    try {
        const result = await db.collection('orders').insertOne(order);
        res.status(200).json({ orderId: result.insertedId });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save order to database' });
    }
});

app.get('/orders', async (req, res) => {
    try {
        const orders = await db.collection('orders').find().toArray();
        res.json(orders);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch orders' });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
