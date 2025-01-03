const express = require('express');
const multer = require('multer');
const bodyParser = require('body-parser');
const basicAuth = require('express-basic-auth');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = 80;

function generateRandomPath() {
    return crypto.randomBytes(4).toString('hex');
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const randomPath = generateRandomPath();
        req.generatedPath = randomPath;
        cb(null, `${randomPath}_${file.originalname}`);
    }
});

const upload = multer({ storage: storage });

const users = { febry: 'accessprivate' };
app.use(basicAuth({
    users,
    challenge: true,
    unauthorizedResponse: 'Unauthorized'
}));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.post('/upload', upload.single('file'), (req, res) => {
    if (req.file) {
        const fileUrl = `https://raw.milik-febry.site/raw/${req.generatedPath}/${req.file.originalname}`;
        
        const userAgent = req.get('user-agent') || '';
        const isCurl = userAgent.toLowerCase().includes('curl');
        
        if (isCurl) {
            res.send(fileUrl);
        } else {
            res.status(200).json({ 
                message: 'File uploaded successfully', 
                fileUrl: fileUrl 
            });
        }
    } else {
        const errorMessage = 'File upload failed';
        if (req.get('user-agent')?.toLowerCase().includes('curl')) {
            res.status(400).send(errorMessage);
        } else {
            res.status(400).json({ message: errorMessage });
        }
    }
});

app.put('/upload', (req, res) => {
    upload.single('file')(req, res, (err) => {
        if (err) {
            return res.status(400).send('Upload failed');
        }
        if (req.file) {
            const fileUrl = `https://raw.milik-febry.site/raw/${req.generatedPath}/${req.file.originalname}`;
            res.send(fileUrl);
        } else {
            res.status(400).send('No file received');
        }
    });
});

app.get('/raw/:path/:filename', (req, res) => {
    const filePath = path.join(__dirname, 'uploads', `${req.params.path}_${req.params.filename}`);
    res.sendFile(filePath, { dotfiles: 'allow' }, (err) => {
        if (err) {
            res.status(404).send('File not found');
        }
    });
});

app.use(express.static('uploads'));

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});