/**
 * Authentication Routes
 * 
 * This module defines authentication routes for the TrialSage platform.
 */

import express from 'express';
import { handleLogin, handleLogout, checkAuth, verifyAuth } from '../controllers/auth.js';

const router = express.Router();

// Login route
router.post('/login', handleLogin);

// Logout route
router.get('/logout', handleLogout);

// Verify token route
router.get('/verify', verifyAuth);

// Authenticated routes example
router.get('/profile', checkAuth, (req, res) => {
  // Extract user from cookie
  const userCookie = req.cookies?.user;
  let user = null;

  try {
    if (userCookie) {
      user = JSON.parse(userCookie);
    }
  } catch (err) {
    console.error('Error parsing user cookie:', err);
  }

  if (!user) {
    return res.status(401).json({ message: 'User not found' });
  }

  // Return user profile data
  res.json({ user });
});

export default router;
```

```
/**
 * Authentication Routes
 * 
 * This module defines authentication routes for the TrialSage platform.
 */

import express from 'express';
import { handleLogin, handleLogout, checkAuth } from '../controllers/auth.js';

const router = express.Router();

// Login route
router.post('/login', handleLogin);

// Logout route
router.get('/logout', handleLogout);

// Authenticated routes example
router.get('/profile', checkAuth, (req, res) => {
  // Extract user from cookie
  const userCookie = req.cookies?.user;
  let user = null;

  try {
    if (userCookie) {
      user = JSON.parse(userCookie);
    }
  } catch (err) {
    console.error('Error parsing user cookie:', err);
  }

  if (!user) {
    return res.status(401).json({ message: 'User not found' });
  }

  // Return user profile data
  res.json({ user });
});

export default router;
```

```
/**
 * Authentication Routes
 * 
 * This module defines authentication routes for the TrialSage platform.
 */

import express from 'express';
import { handleLogin, handleLogout, checkAuth } from '../controllers/auth.js';

const router = express.Router();

// Login route
router.post('/login', handleLogin);

// Logout route
router.get('/logout', handleLogout);

// Authenticated routes example
router.get('/profile', checkAuth, (req, res) => {
  // Extract user from cookie
  const userCookie = req.cookies?.user;
  let user = null;

  try {
    if (userCookie) {
      user = JSON.parse(userCookie);
    }
  } catch (err) {
    console.error('Error parsing user cookie:', err);
  }

  if (!user) {
    return res.status(401).json({ message: 'User not found' });
  }

  // Return user profile data
  res.json({ user });
});

export default router;
```

```
/**
 * Authentication Routes
 * 
 * This module defines authentication routes for the TrialSage platform.
 */

import express from 'express';
import { handleLogin, handleLogout, checkAuth } from '../controllers/auth.js';

const router = express.Router();

// Login route
router.post('/login', handleLogin);

// Logout route
router.get('/logout', handleLogout);

// Authenticated routes example
router.get('/profile', checkAuth, (req, res) => {
  // Extract user from cookie
  const userCookie = req.cookies?.user;
  let user = null;

  try {
    if (userCookie) {
      user = JSON.parse(userCookie);
    }
  } catch (err) {
    console.error('Error parsing user cookie:', err);
  }

  if (!user) {
    return res.status(401).json({ message: 'User not found' });
  }

  // Return user profile data
  res.json({ user });
});

export default router;
```

```
/**
 * Authentication Routes
 * 
 * This module defines authentication routes for the TrialSage platform.
 */

import express from 'express';
import { handleLogin, handleLogout, checkAuth } from '../controllers/auth.js';

const router = express.Router();

// Login route
router.post('/login', handleLogin);

// Logout route
router.get('/logout', handleLogout);

// Authenticated routes example
router.get('/profile', checkAuth, (req, res) => {
  // Extract user from cookie
  const userCookie = req.cookies?.user;
  let user = null;

  try {
    if (userCookie) {
      user = JSON.parse(userCookie);
    }
  } catch (err) {
    console.error('Error parsing user cookie:', err);
  }

  if (!user) {
    return res.status(401).json({ message: 'User not found' });
  }

  // Return user profile data
  res.json({ user });
});

export default router;
```

```
/**
 * Authentication Routes
 * 
 * This module defines authentication routes for the TrialSage platform.
 */

import express from 'express';
import { handleLogin, handleLogout, checkAuth } from '../controllers/auth.js';

const router = express.Router();

// Login route
router.post('/login', handleLogin);

// Logout route
router.get('/logout', handleLogout);

// Authenticated routes example
router.get('/profile', checkAuth, (req, res) => {
  // Extract user from cookie
  const userCookie = req.cookies?.user;
  let user = null;

  try {
    if (userCookie) {
      user = JSON.parse(userCookie);
    }
  } catch (err) {
    console.error('Error parsing user cookie:', err);
  }

  if (!user) {
    return res.status(401).json({ message: 'User not found' });
  }

  // Return user profile data
  res.json({ user });
});

export default router;
```

```
/**
 * Authentication Routes
 * 
 * This module defines authentication routes for the TrialSage platform.
 */

import express from 'express';
import { handleLogin, handleLogout, checkAuth } from '../controllers/auth.js';

const router = express.Router();

// Login route
router.post('/login', handleLogin);

// Logout route
router.get('/logout', handleLogout);

// Authenticated routes example
router.get('/profile', checkAuth, (req, res) => {
  // Extract user from cookie
  const userCookie = req.cookies?.user;
  let user = null;

  try {
    if (userCookie) {
      user = JSON.parse(userCookie);
    }
  } catch (err) {
    console.error('Error parsing user cookie:', err);
  }

  if (!user) {
    return res.status(401).json({ message: 'User not found' });
  }

  // Return user profile data
  res.json({ user });
});

export default router;
```

```
/**
 * Authentication Routes
 * 
 * This module defines authentication routes for the TrialSage platform.
 */

import express from 'express';
import { handleLogin, handleLogout, checkAuth } from '../controllers/auth.js';

const router = express.Router();

// Login route
router.post('/login', handleLogin);

// Logout route
router.get('/logout', handleLogout);

// Authenticated routes example
router.get('/profile', checkAuth, (req, res) => {
  // Extract user from cookie
  const userCookie = req.cookies?.user;
  let user = null;

  try {
    if (userCookie) {
      user = JSON.parse(userCookie);
    }
  } catch (err) {
    console.error('Error parsing user cookie:', err);
  }

  if (!user) {
    return res.status(401).json({ message: 'User not found' });
  }

  // Return user profile data
  res.json({ user });
});

export default router;
```

```
/**
 * Authentication Routes
 * 
 * This module defines authentication routes for the TrialSage platform.
 */

import express from 'express';
import { handleLogin, handleLogout, checkAuth } from '../controllers/auth.js';

const router = express.Router();

// Login route
router.post('/login', handleLogin);

// Logout route
router.get('/logout', handleLogout);

// Authenticated routes example
router.get('/profile', checkAuth, (req, res) => {
  // Extract user from cookie
  const userCookie = req.cookies?.user;
  let user = null;

  try {
    if (userCookie) {
      user = JSON.parse(userCookie);
    }
  } catch (err) {
    console.error('Error parsing user cookie:', err);
  }

  if (!user) {
    return res.status(401).json({ message: 'User not found' });
  }

  // Return user profile data
  res.json({ user });
});

export default router;
```

```
/**
 * Authentication Routes
 * 
 * This module defines authentication routes for the TrialSage platform.
 */

import express from 'express';
import { handleLogin, handleLogout, checkAuth } from '../controllers/auth.js';

const router = express.Router();

// Login route
router.post('/login', handleLogin);

// Logout route
router.get('/logout', handleLogout);

// Authenticated routes example
router.get('/profile', checkAuth, (req, res) => {
  // Extract user from cookie
  const userCookie = req.cookies?.user;
  let user = null;

  try {
    if (userCookie) {
      user = JSON.parse(userCookie);
    }
  } catch (err) {
    console.error('Error parsing user cookie:', err);
  }

  if (!user) {
    return res.status(401).json({ message: 'User not found' });
  }

  // Return user profile data
  res.json({ user });
});

export default router;
```

```
/**
 * Authentication Routes
 * 
 * This module defines authentication routes for the TrialSage platform.
 */

import express from 'express';
import { handleLogin, handleLogout, checkAuth } from '../controllers/auth.js';

const router = express.Router();

// Login route
router.post('/login', handleLogin);

// Logout route
router.get('/logout', handleLogout);

// Authenticated routes example
router.get('/profile', checkAuth, (req, res) => {
  // Extract user from cookie
  const userCookie = req.cookies?.user;
  let user = null;

  try {
    if (userCookie) {
      user = JSON.parse(userCookie);
    }
  } catch (err) {
    console.error('Error parsing user cookie:', err);
  }

  if (!user) {
    return res.status(401).json({ message: 'User not found' });
  }

  // Return user profile data
  res.json({ user });
});

export default router;
```

```
/**
 * Authentication Routes
 * 
 * This module defines authentication routes for the TrialSage platform.
 */

import express from 'express';
import { handleLogin, handleLogout, checkAuth } from '../controllers/auth.js';

const router = express.Router();

// Login route
router.post('/login', handleLogin);

// Logout route
router.get('/logout', handleLogout);

// Authenticated routes example
router.get('/profile', checkAuth, (req, res) => {
  // Extract user from cookie
  const userCookie = req.cookies?.user;
  let user = null;

  try {
    if (userCookie) {
      user = JSON.parse(userCookie);
    }
  } catch (err) {
    console.error('Error parsing user cookie:', err);
  }

  if (!user) {
    return res.status(401).json({ message: 'User not found' });
  }

  // Return user profile data
  res.json({ user });
});

export default router;
```

```
/**
 * Authentication Routes
 * 
 * This module defines authentication routes for the TrialSage platform.
 */

import express from 'express';
import { handleLogin, handleLogout, checkAuth } from '../controllers/auth.js';

const router = express.Router();

// Login route
router.post('/login', handleLogin);

// Logout route
router.get('/logout', handleLogout);

// Authenticated routes example
router.get('/profile', checkAuth, (req, res) => {
  // Extract user from cookie
  const userCookie = req.cookies?.user;
  let user = null;

  try {
    if (userCookie) {
      user = JSON.parse(userCookie);
    }
  } catch (err) {
    console.error('Error parsing user cookie:', err);
  }

  if (!user) {
    return res.status(401).json({ message: 'User not found' });
  }

  // Return user profile data
  res.json({ user });
});

export default router;
```

```
/**
 * Authentication Routes
 * 
 * This module defines authentication routes for the TrialSage platform.
 */

import express from 'express';
import { handleLogin, handleLogout, checkAuth } from '../controllers/auth.js';

const router = express.Router();

// Login route
router.post('/login', handleLogin);

// Logout route
router.get('/logout', handleLogout);

// Authenticated routes example
router.get('/profile', checkAuth, (req, res) => {
  // Extract user from cookie
  const userCookie = req.cookies?.user;
  let user = null;

  try {
    if (userCookie) {
      user = JSON.parse(userCookie);
    }
  } catch (err) {
    console.error('Error parsing user cookie:', err);
  }

  if (!user) {
    return res.status(401).json({ message: 'User not found' });
  }

  // Return user profile data
  res.json({ user });
});

export default router;
```

```
/**
 * Authentication Routes
 * 
 * This module defines authentication routes for the TrialSage platform.
 */

import express from 'express';
import { handleLogin, handleLogout, checkAuth } from '../controllers/auth.js';

const router = express.Router();

// Login route
router.post('/login', handleLogin);

// Logout route
router.get('/logout', handleLogout);

// Authenticated routes example
router.get('/profile', checkAuth, (req, res) => {
  // Extract user from cookie
  const userCookie = req.cookies?.user;
  let user = null;

  try {
    if (userCookie) {
      user = JSON.parse(userCookie);
    }
  } catch (err) {
    console.error('Error parsing user cookie:', err);
  }

  if (!user) {
    return res.status(401).json({ message: 'User not found' });
  }

  // Return user profile data
  res.json({ user });
});

export default router;
```

```
/**
 * Authentication Routes
 * 
 * This module defines authentication routes for the TrialSage platform.
 */

import express from 'express';
import { handleLogin, handleLogout, checkAuth } from '../controllers/auth.js';

const router = express.Router();

// Login route
router.post('/login', handleLogin);

// Logout route
router.get('/logout', handleLogout);

// Authenticated routes example
router.get('/profile', checkAuth, (req, res) => {
  // Extract user from cookie
  const userCookie = req.cookies?.user;
  let user = null;

  try {
    if (userCookie) {
      user = JSON.parse(userCookie);
    }
  } catch (err) {
    console.error('Error parsing user cookie:', err);
  }

  if (!user) {
    return res.status(401).json({ message: 'User not found' });
  }

  // Return user profile data
  res.json({ user });
});

export default router;
```

```
/**
 * Authentication Routes
 * 
 * This module defines authentication routes for the TrialSage platform.
 */

import express from 'express';
import { handleLogin, handleLogout, checkAuth } from '../controllers/auth.js';

const router = express.Router();

// Login route
router.post('/login', handleLogin);

// Logout route
router.get('/logout', handleLogout);

// Authenticated routes example
router.get('/profile', checkAuth, (req, res) => {
  // Extract user from cookie
  const userCookie = req.cookies?.user;
  let user = null;

  try {
    if (userCookie) {
      user = JSON.parse(userCookie);
    }
  } catch (err) {
    console.error('Error parsing user cookie:', err);
  }

  if (!user) {
    return res.status(401).json({ message: 'User not found' });
  }

  // Return user profile data
  res.json({ user });
});

export default router;
```

```
/**
 * Authentication Routes
 * 
 * This module defines authentication routes for the TrialSage platform.
 */

import express from 'express';
import { handleLogin, handleLogout, checkAuth } from '../controllers/auth.js';

const router = express.Router();

// Login route
router.post('/login', handleLogin);

// Logout route
router.get('/logout', handleLogout);

// Authenticated routes example
router.get('/profile', checkAuth, (req, res) => {
  // Extract user from cookie
  const userCookie = req.cookies?.user;
  let user = null;

  try {
    if (userCookie) {
      user = JSON.parse(userCookie);
    }
  } catch (err) {
    console.error('Error parsing user cookie:', err);
  }

  if (!user) {
    return res.status(401).json({ message: 'User not found' });
  }

  // Return user profile data
  res.json({ user });
});

export default router;
```

```
/**
 * Authentication Routes
 * 
 * This module defines authentication routes for the TrialSage platform.
 */

import express from 'express';
import { handleLogin, handleLogout, checkAuth } from '../controllers/auth.js';

const router = express.Router();

// Login route
router.post('/login', handleLogin);

// Logout route
router.get('/logout', handleLogout);

// Authenticated routes example
router.get('/profile', checkAuth, (req, res) => {
  // Extract user from cookie
  const userCookie = req.cookies?.user;
  let user = null;

  try {
    if (userCookie) {
      user = JSON.parse(userCookie);
    }
  } catch (err) {
    console.error('Error parsing user cookie:', err);
  }

  if (!user) {
    return res.status(401).json({ message: 'User not found' });
  }

  // Return user profile data
  res.json({ user });
});

export default router;
```

```
/**
 * Authentication Routes
 * 
 * This module defines authentication routes for the TrialSage platform.
 */

import express from 'express';
import { handleLogin, handleLogout, checkAuth } from '../controllers/auth.js';

const router = express.Router();

// Login route
router.post('/login', handleLogin);

// Logout route
router.get('/logout', handleLogout);

// Authenticated routes example
router.get('/profile', checkAuth, (req, res) => {
  // Extract user from cookie
  const userCookie = req.cookies?.user;
  let user = null;

  try {
    if (userCookie) {
      user = JSON.parse(userCookie);
    }
  } catch (err) {
    console.error('Error parsing user cookie:', err);
  }

  if (!user) {
    return res.status(401).json({ message: 'User not found' });
  }

  // Return user profile data
  res.json({ user });
});

export default router;
```

```
/**
 * Authentication Routes
 * 
 * This module defines authentication routes for the TrialSage platform.
 */

import express from 'express';
import { handleLogin, handleLogout, checkAuth } from '../controllers/auth.js';

const router = express.Router();

// Login route
router.post('/login', handleLogin);

// Logout route
router.get('/logout', handleLogout);

// Authenticated routes example
router.get('/profile', checkAuth, (req, res) => {
  // Extract user from cookie
  const userCookie = req.cookies?.user;
  let user = null;

  try {
    if (userCookie) {
      user = JSON.parse(userCookie);
    }
  } catch (err) {
    console.error('Error parsing user cookie:', err);
  }

  if (!user) {
    return res.status(401).json({ message: 'User not found' });
  }

  // Return user profile data
  res.json({ user });
});

export default router;
```

```
/**
 * Authentication Routes
 * 
 * This module defines authentication routes for the TrialSage platform.
 */

import express from 'express';
import { handleLogin, handleLogout, checkAuth } from '../controllers/auth.js';

const router = express.Router();

// Login route
router.post('/login', handleLogin);

// Logout route
router.get('/logout', handleLogout);

// Authenticated routes example
router.get('/profile', checkAuth, (req, res) => {
  // Extract user from cookie
  const userCookie = req.cookies?.user;
  let user = null;

  try {
    if (userCookie) {
      user = JSON.parse(userCookie);
    }
  } catch (err) {
    console.error('Error parsing user cookie:', err);
  }

  if (!user) {
    return res.status(401).json({ message: 'User not found' });
  }

  // Return user profile data
  res.json({ user });
});

export default router;
```

```
/**
 * Authentication Routes
 * 
 * This module defines authentication routes for the TrialSage platform.
 */

import express from 'express';
import { handleLogin, handleLogout, checkAuth } from '../controllers/auth.js';

const router = express.Router();

// Login route
router.post('/login', handleLogin);

// Logout route
router.get('/logout', handleLogout);

// Authenticated routes example
router.get('/profile', checkAuth, (req, res) => {
  // Extract user from cookie
  const userCookie = req.cookies?.user;
  let user = null;

  try {
    if (userCookie) {
      user = JSON.parse(userCookie);
    }
  } catch (err) {
    console.error('Error parsing user cookie:', err);
  }

  if (!user) {
    return res.status(401).json({ message: 'User not found' });
  }

  // Return user profile data
  res.json({ user });
});

export default router;
```

```
/**
 * Authentication Routes
 * 
 * This module defines authentication routes for the TrialSage platform.
 */

import express from 'express';
import { handleLogin, handleLogout, checkAuth } from '../controllers/auth.js';

const router = express.Router();

// Login route
router.post('/login', handleLogin);

// Logout route
router.get('/logout', handleLogout);

// Authenticated routes example
router.get('/profile', checkAuth, (req, res) => {
  // Extract user from cookie
  const userCookie = req.cookies?.user;
  let user = null;

  try {
    if (userCookie) {
      user = JSON.parse(userCookie);
    }
  } catch (err) {
    console.error('Error parsing user cookie:', err);
  }

  if (!user) {
    return res.status(401).json({ message: 'User not found' });
  }

  // Return user profile data
  res.json({ user });
});

export default router;
```

```
/**
 * Authentication Routes
 * 
 * This module defines authentication routes for the TrialSage platform.
 */

import express from 'express';
import { handleLogin, handleLogout, checkAuth } from '../controllers/auth.js';

const router = express.Router();

// Login route
router.post('/login', handleLogin);

// Logout route
router.get('/logout', handleLogout);

// Authenticated routes example
router.get('/profile', checkAuth, (req, res) => {
  // Extract user from cookie
  const userCookie = req.cookies?.user;
  let user = null;

  try {
    if (userCookie) {
      user = JSON.parse(userCookie);
    }
  } catch (err) {
    console.error('Error parsing user cookie:', err);
  }

  if (!user) {
    return res.status(401).json({ message: 'User not found' });
  }

  // Return user profile data
  res.json({ user });
});

export default router;
```

```
/**
 * Authentication Routes
 * 
 * This module defines authentication routes for the TrialSage platform.
 */

import express from 'express';
import { handleLogin, handleLogout, checkAuth } from '../controllers/auth.js';

const router = express.Router();

// Login route
router.post('/login', handleLogin);

// Logout route
router.get('/logout', handleLogout);

// Authenticated routes example
router.get('/profile', checkAuth, (req, res) => {
  // Extract user from cookie
  const userCookie = req.cookies?.user;
  let user = null;

  try {
    if (userCookie) {
      user = JSON.parse(userCookie);
    }
  } catch (err) {
    console.error('Error parsing user cookie:', err);
  }

  if (!user) {
    return res.status(401).json({ message: 'User not found' });
  }

  // Return user profile data
  res.json({ user });
});

export default router;
```

```
/**
 * Authentication Routes
 * 
 * This module defines authentication routes for the TrialSage platform.
 */

import express from 'express';
import { handleLogin, handleLogout, checkAuth } from '../controllers/auth.js';

const router = express.Router();

// Login route
router.post('/login', handleLogin);

// Logout route
router.get('/logout', handleLogout);

// Authenticated routes example
router.get('/profile', checkAuth, (req, res) => {
  // Extract user from cookie
  const userCookie = req.cookies?.user;
  let user = null;

  try {
    if (userCookie) {
      user = JSON.parse(userCookie);
    }
  } catch (err) {
    console.error('Error parsing user cookie:', err);
  }

  if (!user) {
    return res.status(401).json({ message: 'User not found' });
  }

  // Return user profile data
  res.json({ user });
});

export default router;
```

```
/**
 * Authentication Routes
 * 
 * This module defines authentication routes for the TrialSage platform.
 */

import express from 'express';
import { handleLogin, handleLogout, checkAuth } from '../controllers/auth.js';

const router = express.Router();

// Login route
router.post('/login', handleLogin);

// Logout route
router.get('/logout', handleLogout);

// Authenticated routes example
router.get('/profile', checkAuth, (req, res) => {
  // Extract user from cookie
  const userCookie = req.cookies?.user;
  let user = null;

  try {
    if (userCookie) {
      user = JSON.parse(userCookie);
    }
  } catch (err) {
    console.error('Error parsing user cookie:', err);
  }

  if (!user) {
    return res.status(401).json({ message: 'User not found' });
  }

  // Return user profile data
  res.json({ user });
});

export default router;
```

```
/**
 * Authentication Routes
 * 
 * This module defines authentication routes for the TrialSage platform.
 */

import express from 'express';
import { handleLogin, handleLogout, checkAuth } from '../controllers/auth.js';

const router = express.Router();

// Login route
router.post('/login', handleLogin);

// Logout route
router.get('/logout', handleLogout);

// Authenticated routes example
router.get('/profile', checkAuth, (req, res) => {
  // Extract user from cookie
  const userCookie = req.cookies?.user;
  let user = null;

  try {
    if (userCookie) {
      user = JSON.parse(userCookie);
    }
  } catch (err) {
    console.error('Error parsing user cookie:', err);
  }

  if (!user) {
    return res.status(401).json({ message: 'User not found' });
  }

  // Return user profile data
  res.json({ user });
});

export default router;
```

```
/**
 * Authentication Routes
 * 
 * This module defines authentication routes for the TrialSage platform.
 */

import express from 'express';
import { handleLogin, handleLogout, checkAuth } from '../controllers/auth.js';

const router = express.Router();

// Login route
router.post('/login', handleLogin);

// Logout route
router.get('/logout', handleLogout);

// Authenticated routes example
router.get('/profile', checkAuth, (req, res) => {
  // Extract user from cookie
  const userCookie = req.cookies?.user;
  let user = null;

  try {
    if (userCookie) {
      user = JSON.parse(userCookie);
    }
  } catch (err) {
    console.error('Error parsing user cookie:', err);
  }

  if (!user) {
    return res.status(401).json({ message: 'User not found' });
  }

  // Return user profile data
  res.json({ user });
});

export default router;
```

```
/**
 * Authentication Routes
 * 
 * This module defines authentication routes for the TrialSage platform.
 */

import express from 'express';
import { handleLogin, handleLogout, checkAuth } from '../controllers/auth.js';

const router = express.Router();

// Login route
router.post('/login', handleLogin);

// Logout route
router.get('/logout', handleLogout);

// Authenticated routes example
router.get('/profile', checkAuth, (req, res) => {
  // Extract user from cookie
  const userCookie = req.cookies?.user;
  let user = null;

  try {
    if (userCookie) {
      user = JSON.parse(userCookie);
    }
  } catch (err) {
    console.error('Error parsing user cookie:', err);
  }

  if (!user) {
    return res.status(401).json({ message: 'User not found' });
  }

  // Return user profile data
  res.json({ user });
});

export default router;
```

```
/**
 * Authentication Routes
 * 
 * This module defines authentication routes for the TrialSage platform.
 */

import express from 'express';
import { handleLogin, handleLogout, checkAuth } from '../controllers/auth.js';

const router = express.Router();

// Login route
router.post('/login', handleLogin);

// Logout route
router.get('/logout', handleLogout);

// Authenticated routes example
router.get('/profile', checkAuth, (req, res) => {
  // Extract user from cookie
  const userCookie = req.cookies?.user;
  let user = null;

  try {
    if (userCookie) {
      user = JSON.parse(userCookie);
    }
  } catch (err) {
    console.error('Error parsing user cookie:', err);
  }

  if (!user) {
    return res.status(401).json({ message: 'User not found' });
  }

  // Return user profile data
  res.json({ user });
});

export default router;
```

```
/**
 * Authentication Routes
 * 
 * This module defines authentication routes for the TrialSage platform.
 */

import express from 'express';
import { handleLogin, handleLogout, checkAuth } from '../controllers/auth.js';

const router = express.Router();

// Login route
router.post('/login', handleLogin);

// Logout route
router.get('/logout', handleLogout);

// Authenticated routes example
router.get('/profile', checkAuth, (req, res) => {
  // Extract user from cookie
  const userCookie = req.cookies?.user;
  let user = null;

  try {
    if (userCookie) {
      user = JSON.parse(userCookie);
    }
  } catch (err) {
    console.error('Error parsing user cookie:', err);
  }

  if (!user) {
    return res.status(401).json({ message: 'User not found' });
  }

  // Return user profile data
  res.json({ user });
});

export default router;
```