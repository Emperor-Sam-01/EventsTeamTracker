require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173', credentials: true }));
app.use(express.json());

app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/clients', require('./routes/clients'));
app.use('/api/meetings', require('./routes/meetings'));
app.use('/api/dashboard', require('./routes/dashboard'));

app.use('/api/billing', require('./routes/billing'));
app.use('/api/disc', require('./routes/disc'));
app.use('/api/reviews', require('./routes/reviews'));
app.use('/api/team-reviews', require('./routes/teamreviews'));

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Unexpected server error' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
