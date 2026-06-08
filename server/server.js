const path = require('path');
const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const { OAuth2Client } = require('google-auth-library');

const PORT = Number(process.env.PORT || 3000);
const DB_FILE = process.env.SQLITE_DB_PATH || path.join(__dirname, 'todos.db');
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

const app = express();
const oauthClient = new OAuth2Client();
const db = new sqlite3.Database(DB_FILE);

app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) {
        reject(err);
        return;
      }
      resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows);
    });
  });
}

async function initializeDatabase() {
  await run(`
    CREATE TABLE IF NOT EXISTS todos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run('CREATE INDEX IF NOT EXISTS idx_todos_user_id ON todos(user_id)');
}

async function authenticate(req, res, next) {
  const authHeader = req.header('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (!token) {
    res.status(401).json({ message: 'Missing bearer token.' });
    return;
  }

  try {
    const ticket = await oauthClient.verifyIdToken({
      idToken: token,
      ...(GOOGLE_CLIENT_ID ? { audience: GOOGLE_CLIENT_ID } : {})
    });

    const payload = ticket.getPayload();
    if (!payload?.sub) {
      res.status(401).json({ message: 'Invalid Google token.' });
      return;
    }

    req.user = {
      id: payload.sub,
      name: payload.name || '',
      email: payload.email || '',
      picture: payload.picture || ''
    };

    next();
  } catch (error) {
    res.status(401).json({ message: 'Google authentication failed.' });
  }
}

app.get('/api/config', (req, res) => {
  res.json({ googleClientId: GOOGLE_CLIENT_ID });
});

app.get('/api/me', authenticate, (req, res) => {
  res.json(req.user);
});

app.get('/api/todos', authenticate, async (req, res, next) => {
  try {
    const rows = await all(
      'SELECT id, title, completed FROM todos WHERE user_id = ? ORDER BY id DESC',
      [req.user.id]
    );
    res.json(rows.map((row) => ({ ...row, completed: Boolean(row.completed) })));
  } catch (error) {
    next(error);
  }
});

app.post('/api/todos', authenticate, async (req, res, next) => {
  const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
  if (!title) {
    res.status(400).json({ message: 'Title is required.' });
    return;
  }

  try {
    const result = await run('INSERT INTO todos(user_id, title, completed) VALUES (?, ?, 0)', [
      req.user.id,
      title
    ]);

    res.status(201).json({ id: result.id, title, completed: false });
  } catch (error) {
    next(error);
  }
});

app.patch('/api/todos/:id', authenticate, async (req, res, next) => {
  const id = Number(req.params.id);
  const completed = req.body?.completed;

  if (!Number.isInteger(id) || typeof completed !== 'boolean') {
    res.status(400).json({ message: 'Invalid TODO update payload.' });
    return;
  }

  try {
    const result = await run('UPDATE todos SET completed = ? WHERE id = ? AND user_id = ?', [
      completed ? 1 : 0,
      id,
      req.user.id
    ]);

    if (result.changes === 0) {
      res.status(404).json({ message: 'TODO not found.' });
      return;
    }

    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.delete('/api/todos/:id', authenticate, async (req, res, next) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id)) {
    res.status(400).json({ message: 'Invalid TODO id.' });
    return;
  }

  try {
    const result = await run('DELETE FROM todos WHERE id = ? AND user_id = ?', [id, req.user.id]);

    if (result.changes === 0) {
      res.status(404).json({ message: 'TODO not found.' });
      return;
    }

    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: 'Internal server error.' });
});

initializeDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`TODO API listening on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Failed to initialize database', error);
    process.exit(1);
  });
